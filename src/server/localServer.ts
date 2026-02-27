import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { WebSocketServer, WebSocket } from 'ws';
import type { BridgeHello, BridgeMessage, BridgeRequest } from '../shared/bridgeProtocol';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface ChatSession {
  id: string;
  messages: ChatMessage[];
  createdAt: number;
}

const HTTP_HOST = '127.0.0.1';
const HTTP_PORT = 7890;
const BRIDGE_HOST = '127.0.0.1';
const BRIDGE_PORT = 7891;
const BRIDGE_TIMEOUT_MS = 120000;

const app = express();
app.use(cors());
app.use(express.json());

let chatSessions: Map<string, ChatSession> = new Map();
let agentSocket: WebSocket | null = null;

const pendingBridgeRequests = new Map<
  string,
  {
    resolve: (value: unknown) => void;
    reject: (reason?: unknown) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();

function createRequestId(): string {
  return uuidv4();
}

function isAgentConnected(): boolean {
  return agentSocket !== null && agentSocket.readyState === WebSocket.OPEN;
}

function bridgeCall<T>(method: BridgeRequest['method'], params: unknown): Promise<T> {
  if (!isAgentConnected() || !agentSocket) {
    return Promise.reject(new Error('Bridge agent not connected.'));
  }

  const id = createRequestId();
  const request: BridgeRequest = {
    kind: 'request',
    id,
    method,
    params
  };

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingBridgeRequests.delete(id);
      reject(new Error(`Bridge timeout for method ${method}`));
    }, BRIDGE_TIMEOUT_MS);

    pendingBridgeRequests.set(id, {
      resolve: (value) => resolve(value as T),
      reject,
      timer
    });
    agentSocket!.send(JSON.stringify(request));
  });
}

function resolveBridgeResponse(message: BridgeMessage): void {
  if (message.kind !== 'response') {
    return;
  }
  const pending = pendingBridgeRequests.get(message.id);
  if (!pending) {
    return;
  }
  clearTimeout(pending.timer);
  pendingBridgeRequests.delete(message.id);

  if (message.success) {
    pending.resolve(message.result);
    return;
  }
  pending.reject(new Error(message.error));
}

function rejectAllPending(reason: string): void {
  for (const [id, pending] of pendingBridgeRequests.entries()) {
    clearTimeout(pending.timer);
    pending.reject(new Error(reason));
    pendingBridgeRequests.delete(id);
  }
}

function requireBridge(_req: Request, res: Response, next: NextFunction): void {
  if (!isAgentConnected()) {
    res.status(503).json({ error: 'AI bridge is not connected. Open the extension and keep it active.' });
    return;
  }
  next();
}

async function validateApiKey(req: Request, res: Response, next: NextFunction): Promise<void> {
  const apiKey = req.headers['x-api-key'] as string | undefined;
  if (!apiKey) {
    res.status(401).json({ error: 'API key required. Provide it via X-API-Key header.' });
    return;
  }

  try {
    const result = await bridgeCall<{ valid: boolean }>('VALIDATE_API_KEY', { apiKey });
    if (!result.valid) {
      res.status(403).json({ error: 'Invalid or disabled API key.' });
      return;
    }
    next();
  } catch (error) {
    res.status(503).json({ error: error instanceof Error ? error.message : 'Failed to validate API key.' });
  }
}

app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: Date.now(),
    bridge_connected: isAgentConnected(),
    sessions: chatSessions.size,
    supported_providers: ['Grok', 'OpenAI', 'DeepSeek', 'Claude', 'Gemini']
  });
});

app.get('/v1/providers', requireBridge, validateApiKey, async (req: Request, res: Response) => {
  try {
    const provider = typeof req.query.provider === 'string' ? req.query.provider : undefined;
    const result = await bridgeCall<{ provider: string | null; supported: boolean }>('DETECT_PROVIDER', {
      provider
    });
    res.json({
      supported: ['Grok', 'OpenAI', 'DeepSeek', 'Claude', 'Gemini'],
      current: result.provider || null,
      active: result.supported || false
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to detect provider.' });
  }
});

app.get('/v1/sessions', requireBridge, validateApiKey, (_req: Request, res: Response) => {
  const sessions = Array.from(chatSessions.values()).map((session) => ({
    id: session.id,
    messageCount: session.messages.length,
    createdAt: session.createdAt
  }));
  res.json({ sessions });
});

app.post('/v1/sessions', requireBridge, validateApiKey, (_req: Request, res: Response) => {
  const session: ChatSession = {
    id: uuidv4(),
    messages: [],
    createdAt: Date.now()
  };
  chatSessions.set(session.id, session);
  res.json({
    session_id: session.id,
    message_count: 0,
    created_at: session.createdAt
  });
});

app.get('/v1/sessions/:sessionId', requireBridge, validateApiKey, (req: Request, res: Response) => {
  const session = chatSessions.get(req.params.sessionId);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  res.json(session);
});

app.post('/v1/chat', requireBridge, validateApiKey, async (req: Request, res: Response) => {
  const { message, session_id, model, provider } = req.body as {
    message?: string;
    session_id?: string;
    model?: string;
    provider?: string;
  };

  if (!message) {
    res.status(400).json({ error: 'Message is required' });
    return;
  }

  let session: ChatSession;
  if (session_id) {
    const existing = chatSessions.get(session_id);
    if (!existing) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    session = existing;
  } else {
    session = {
      id: uuidv4(),
      messages: [],
      createdAt: Date.now()
    };
    chatSessions.set(session.id, session);
  }

  const userMessage: ChatMessage = {
    role: 'user',
    content: message,
    timestamp: Date.now()
  };
  session.messages.push(userMessage);

  try {
    const result = await bridgeCall<{
      content?: string;
      model?: string;
      provider?: string;
      usage?: Record<string, unknown>;
      error?: string;
    }>('CHAT_WITH_AI', {
      message,
      sessionId: session.id,
      model: model || 'default',
      provider
    });

    if (result.error) {
      res.status(500).json({ error: result.error });
      return;
    }
    if (!result.content) {
      res.status(502).json({ error: 'AI provider returned an empty response.' });
      return;
    }

    const assistantMessage: ChatMessage = {
      role: 'assistant',
      content: result.content,
      timestamp: Date.now()
    };
    session.messages.push(assistantMessage);

    res.json({
      session_id: session.id,
      message: assistantMessage.content,
      model: result.model || 'default',
      usage: result.usage || {}
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to chat with AI.' });
  }
});

app.get('/v1/conversations', requireBridge, validateApiKey, async (req: Request, res: Response) => {
  try {
    const provider = typeof req.query.provider === 'string' ? req.query.provider : undefined;
    const result = await bridgeCall<{ conversations?: unknown[]; error?: string }>('GET_CONVERSATIONS', {
      provider
    });

    if (result.error) {
      res.status(500).json({ error: result.error });
      return;
    }

    res.json({ conversations: result.conversations || [] });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to get conversations.' });
  }
});

app.get(
  '/v1/conversations/:conversationId',
  requireBridge,
  validateApiKey,
  async (req: Request, res: Response) => {
    try {
      const provider = typeof req.query.provider === 'string' ? req.query.provider : undefined;
      const result = await bridgeCall<{ conversation?: unknown; error?: string }>('GET_CONVERSATION', {
        conversationId: req.params.conversationId,
        provider
      });

      if (result.error) {
        res.status(500).json({ error: result.error });
        return;
      }

      res.json(result.conversation ?? null);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to get conversation.' });
    }
  }
);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

function startBridgeServer(): void {
  const wss = new WebSocketServer({
    host: BRIDGE_HOST,
    port: BRIDGE_PORT,
    path: '/agent'
  });

  wss.on('connection', (socket) => {
    if (agentSocket && agentSocket !== socket && agentSocket.readyState === WebSocket.OPEN) {
      agentSocket.close(1012, 'Replaced by newer extension connection');
    }
    agentSocket = socket;
    console.log(`[AI Proxy] Bridge connected on ws://${BRIDGE_HOST}:${BRIDGE_PORT}/agent`);

    socket.on('message', (raw: Buffer) => {
      try {
        const message = JSON.parse(raw.toString('utf8')) as BridgeMessage;
        if (message.kind === 'hello') {
          const hello = message as BridgeHello;
          console.log(`[AI Proxy] Agent hello: ${hello.role} v${hello.version}`);
          return;
        }
        resolveBridgeResponse(message);
      } catch (error) {
        console.error('[AI Proxy] Invalid bridge payload:', error);
      }
    });

    socket.on('close', () => {
      if (agentSocket === socket) {
        agentSocket = null;
      }
      rejectAllPending('Bridge disconnected.');
      console.log('[AI Proxy] Bridge disconnected');
    });

    socket.on('error', (error) => {
      console.error('[AI Proxy] Bridge socket error:', error);
    });
  });
}

function startHttpServer(): void {
  app.listen(HTTP_PORT, HTTP_HOST, () => {
    console.log(`[AI Proxy] HTTP API listening on http://${HTTP_HOST}:${HTTP_PORT}`);
  });
}

startBridgeServer();
startHttpServer();

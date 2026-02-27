/**
 * Local API Server - Exposes Grok chat functionality via REST API
 */
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';

const app = express();
app.use(cors());
app.use(express.json());

// Types
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

interface GrokApiKey {
  key: string;
  createdAt: number;
  enabled: boolean;
}

// In-memory storage (in production, use chrome.storage)
let chatSessions: Map<string, ChatSession> = new Map();

// Request logging middleware
app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// API Key validation middleware
function validateApiKey(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'] as string;
  
  if (!apiKey) {
    res.status(401).json({ error: 'API key required. Provide it via X-API-Key header.' });
    return;
  }
  
  // We'll receive the apiKeys map from the startApiServer function
  const keys = (req as any).apiKeys as Map<string, GrokApiKey>;
  const keyData = keys.get(apiKey);
  
  if (!keyData || !keyData.enabled) {
    res.status(403).json({ error: 'Invalid or disabled API key.' });
    return;
  }
  
  next();
}

// Make apiKeys available to routes
app.use((req: Request, _res: Response, next: NextFunction) => {
  (req as any).apiKeys = apiKeys;
  next();
});

// Health check (no auth required)
app.get('/health', (_req: Request, res: Response) => {
  res.json({ 
    status: 'ok', 
    timestamp: Date.now(),
    sessions: chatSessions.size
  });
});

// List sessions
app.get('/v1/sessions', validateApiKey, (_req: Request, res: Response) => {
  const sessions = Array.from(chatSessions.values()).map(s => ({
    id: s.id,
    messageCount: s.messages.length,
    createdAt: s.createdAt
  }));
  res.json({ sessions });
});

// Create new session
app.post('/v1/sessions', validateApiKey, (req: Request, res: Response) => {
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

// Get session details
app.get('/v1/sessions/:sessionId', validateApiKey, (req: Request, res: Response) => {
  const session = chatSessions.get(req.params.sessionId);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  res.json(session);
});

// Send message to Grok
app.post('/v1/chat', validateApiKey, async (req: Request, res: Response) => {
  const { message, session_id, model } = req.body;
  
  if (!message) {
    res.status(400).json({ error: 'Message is required' });
    return;
  }
  
  // Get or create session
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
  
  // Add user message
  const userMessage: ChatMessage = {
    role: 'user',
    content: message,
    timestamp: Date.now()
  };
  session.messages.push(userMessage);
  
  try {
    // Send message to content script to get Grok response
    const response = await chrome.runtime.sendMessage({
      type: 'CHAT_WITH_GROK',
      message: message,
      sessionId: session.id,
      model: model || 'grok-2'
    });
    
    if (response.error) {
      res.status(500).json({ error: response.error });
      return;
    }
    
    // Add assistant response
    const assistantMessage: ChatMessage = {
      role: 'assistant',
      content: response.content,
      timestamp: Date.now()
    };
    session.messages.push(assistantMessage);
    
    res.json({
      session_id: session.id,
      message: assistantMessage.content,
      model: response.model || 'grok-2',
      usage: response.usage || {}
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Failed to get response from Grok' });
  }
});

// Get conversations from Grok page
app.get('/v1/conversations', validateApiKey, async (_req: Request, res: Response) => {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'GET_CONVERSATIONS'
    });
    
    if (response.error) {
      res.status(500).json({ error: response.error });
      return;
    }
    
    res.json({ conversations: response.conversations || [] });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get conversations' });
  }
});

// Get specific conversation
app.get('/v1/conversations/:conversationId', validateApiKey, async (req: Request, res: Response) => {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'GET_CONVERSATION',
      conversationId: req.params.conversationId
    });
    
    if (response.error) {
      res.status(500).json({ error: response.error });
      return;
    }
    
    res.json(response.conversation);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get conversation' });
  }
});

// Error handling
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

let apiKeys: Map<string, GrokApiKey>;

export function startApiServer(keys: Map<string, GrokApiKey>): Promise<number> {
  apiKeys = keys;
  
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address && typeof address === 'object') {
        const port = address.port;
        console.log(`[Grok API Proxy] Server running on http://127.0.0.1:${port}`);
        resolve(port);
      } else {
        reject(new Error('Failed to get server port'));
      }
    });
    
    server.on('error', (err: Error) => {
      console.error('[Grok API Proxy] Server error:', err);
      reject(err);
    });
  });
}

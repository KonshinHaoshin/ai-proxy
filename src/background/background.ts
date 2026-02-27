(() => {
/**
 * Background Service Worker
 * - API key management
 * - Bridge agent for local Node server
 */

interface ApiKey {
  key: string;
  createdAt: number;
  enabled: boolean;
}

interface BridgeRequest {
  kind: 'request';
  id: string;
  method: string;
  params: unknown;
}

type BridgeMessage =
  | BridgeRequest
  | {
      kind: 'response';
      id: string;
      success: boolean;
      result?: unknown;
      error?: string;
    }
  | {
      kind: 'hello';
      role: 'extension' | 'server';
      version: string;
    };

const apiKeys: Map<string, ApiKey> = new Map();
const API_KEYS_STORAGE_KEY = 'ai_proxy_api_keys_v1';
const AGENT_BRIDGE_URL = 'ws://127.0.0.1:7891/agent';
const LOCAL_API_PORT = 7890;
const BRIDGE_RETRY_MS = 2500;

const PROVIDER_TAB_PATTERNS: Record<string, string[]> = {
  grok: ['*://grok.x.ai/*', '*://grok.com/*'],
  openai: ['*://chat.openai.com/*', '*://chatgpt.com/*'],
  deepseek: ['*://chat.deepseek.com/*', '*://deepseek.com/*'],
  claude: ['*://claude.ai/*', '*://claude.com/*'],
  gemini: ['*://gemini.google.com/*', '*://bard.google.com/*']
};

const ALL_PROVIDER_PATTERNS = Object.values(PROVIDER_TAB_PATTERNS).flat();

let bridgeSocket: WebSocket | null = null;
let bridgeConnected = false;
let reconnectTimer: number | null = null;
let localServerPort: number | null = null;

function storageGet<T>(key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([key], (result) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }
      resolve(result[key] as T | undefined);
    });
  });
}

function storageSet(value: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(value, () => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }
      resolve();
    });
  });
}

async function loadApiKeys(): Promise<void> {
  try {
    const stored = await storageGet<ApiKey[]>(API_KEYS_STORAGE_KEY);
    if (!stored || !Array.isArray(stored)) {
      return;
    }
    apiKeys.clear();
    for (const key of stored) {
      if (key?.key) {
        apiKeys.set(key.key, key);
      }
    }
  } catch (error) {
    console.error('[AI Proxy] Failed to load API keys from storage:', error);
  }
}

async function persistApiKeys(): Promise<void> {
  try {
    await storageSet({ [API_KEYS_STORAGE_KEY]: Array.from(apiKeys.values()) });
  } catch (error) {
    console.error('[AI Proxy] Failed to persist API keys:', error);
  }
}

function generateSecureToken(bytes = 24): string {
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  let hex = '';
  for (const value of array) {
    hex += value.toString(16).padStart(2, '0');
  }
  return hex;
}

function generateApiKey(): string {
  const key = 'gkp_' + generateSecureToken(20);
  apiKeys.set(key, {
    key,
    createdAt: Date.now(),
    enabled: true
  });
  return key;
}

function validateApiKey(key: string): boolean {
  const apiKey = apiKeys.get(key);
  return apiKey !== undefined && apiKey.enabled;
}

function getApiKeys(): ApiKey[] {
  return Array.from(apiKeys.values());
}

function deleteApiKey(key: string): boolean {
  return apiKeys.delete(key);
}

function toggleApiKey(key: string, enabled: boolean): boolean {
  const apiKey = apiKeys.get(key);
  if (apiKey) {
    apiKey.enabled = enabled;
    return true;
  }
  return false;
}

function queryTabs(queryInfo: chrome.tabs.QueryInfo): Promise<chrome.tabs.Tab[]> {
  return new Promise((resolve, reject) => {
    chrome.tabs.query(queryInfo, (tabs) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }
      resolve(tabs);
    });
  });
}

function executeContentScript(tabId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        files: ['content/content.js']
      },
      () => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message));
          return;
        }
        resolve();
      }
    );
  });
}

function sendMessageToTab<T>(tabId: number, message: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }
      resolve(response as T);
    });
  });
}

function normalizeProviderName(provider?: string): string | null {
  if (!provider) {
    return null;
  }
  const normalized = provider.trim().toLowerCase();
  return normalized in PROVIDER_TAB_PATTERNS ? normalized : null;
}

async function getCandidateTabs(provider?: string): Promise<chrome.tabs.Tab[]> {
  const normalizedProvider = normalizeProviderName(provider);
  const patterns = normalizedProvider
    ? PROVIDER_TAB_PATTERNS[normalizedProvider]
    : ALL_PROVIDER_PATTERNS;

  const activeCurrentWindow = await queryTabs({
    url: patterns,
    active: true,
    currentWindow: true
  });
  if (activeCurrentWindow.length > 0) return activeCurrentWindow;

  const tabs = await queryTabs({ url: patterns });
  if (tabs.length === 0) return [];

  const activeAnyWindow = tabs.find((tab) => tab.active);
  if (activeAnyWindow?.id) {
    return [activeAnyWindow, ...tabs.filter((tab) => tab.id !== activeAnyWindow.id)];
  }
  return tabs;
}

function isReceivingEndMissing(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('Receiving end does not exist');
}

async function trySendWithAutoInject<T>(tabId: number, message: Record<string, unknown>): Promise<T> {
  try {
    return await sendMessageToTab<T>(tabId, message);
  } catch (error) {
    if (!isReceivingEndMissing(error)) {
      throw error;
    }
    await executeContentScript(tabId);
    return sendMessageToTab<T>(tabId, message);
  }
}

async function sendToAiTab<T>(message: Record<string, unknown>, provider?: string): Promise<T> {
  const candidates = await getCandidateTabs(provider);
  if (candidates.length === 0) {
    throw new Error('No supported AI tab is open. Open a provider page first.');
  }

  let lastError: unknown = null;
  for (const tab of candidates) {
    if (!tab.id) continue;
    try {
      return await trySendWithAutoInject<T>(tab.id, message);
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    throw lastError;
  }
  throw new Error('No reachable AI tab found.');
}

function safeBridgeSend(message: BridgeMessage): void {
  if (!bridgeSocket || bridgeSocket.readyState !== WebSocket.OPEN) {
    return;
  }
  bridgeSocket.send(JSON.stringify(message));
}

function sendBridgeResponse(id: string, result: unknown): void {
  safeBridgeSend({
    kind: 'response',
    id,
    success: true,
    result
  });
}

function sendBridgeError(id: string, error: unknown): void {
  const errorMessage = error instanceof Error ? error.message : String(error);
  safeBridgeSend({
    kind: 'response',
    id,
    success: false,
    error: errorMessage
  });
}

async function handleBridgeRequest(message: BridgeRequest): Promise<void> {
  const { id, method, params } = message;

  try {
    if (method === 'VALIDATE_API_KEY') {
      const apiKey = (params as { apiKey?: string })?.apiKey || '';
      sendBridgeResponse(id, { valid: validateApiKey(apiKey) });
      return;
    }

    if (method === 'DETECT_PROVIDER') {
      const provider = (params as { provider?: string })?.provider;
      try {
        const detected = await sendToAiTab<{ provider: string | null; supported: boolean }>(
          { type: 'DETECT_PROVIDER' },
          provider
        );
        sendBridgeResponse(id, detected);
      } catch {
        sendBridgeResponse(id, { provider: null, supported: false });
      }
      return;
    }

    if (method === 'CHAT_WITH_AI') {
      const payload = params as {
        message: string;
        sessionId: string;
        model: string;
        provider?: string;
      };
      const response = await sendToAiTab<{
        content?: string;
        model?: string;
        provider?: string;
        usage?: Record<string, unknown>;
        error?: string;
      }>(
        {
          type: 'CHAT_WITH_AI',
          ...payload
        },
        payload.provider
      );
      sendBridgeResponse(id, response);
      return;
    }

    if (method === 'GET_CONVERSATIONS') {
      const provider = (params as { provider?: string })?.provider;
      const response = await sendToAiTab<{
        conversations?: unknown[];
        provider?: string;
        error?: string;
      }>(
        { type: 'GET_CONVERSATIONS' },
        provider
      );
      sendBridgeResponse(id, response);
      return;
    }

    if (method === 'GET_CONVERSATION') {
      const payload = params as { conversationId: string; provider?: string };
      const response = await sendToAiTab<{ conversation?: unknown; error?: string }>(
        {
          type: 'GET_CONVERSATION',
          conversationId: payload.conversationId
        },
        payload.provider
      );
      sendBridgeResponse(id, response);
      return;
    }

    sendBridgeError(id, `Unsupported bridge method: ${method}`);
  } catch (error) {
    sendBridgeError(id, error);
  }
}

function scheduleReconnect(): void {
  if (reconnectTimer !== null) {
    return;
  }
  reconnectTimer = self.setTimeout(() => {
    reconnectTimer = null;
    connectBridge();
  }, BRIDGE_RETRY_MS);
}

function connectBridge(): void {
  if (bridgeSocket && (bridgeSocket.readyState === WebSocket.OPEN || bridgeSocket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  try {
    bridgeSocket = new WebSocket(AGENT_BRIDGE_URL);
  } catch (error) {
    console.error('[AI Proxy] Failed to create bridge websocket:', error);
    scheduleReconnect();
    return;
  }

  bridgeSocket.onopen = () => {
    bridgeConnected = true;
    safeBridgeSend({
      kind: 'hello',
      role: 'extension',
      version: '1.2.0'
    });
    console.log('[AI Proxy] Bridge connected:', AGENT_BRIDGE_URL);
  };

  bridgeSocket.onmessage = (event: MessageEvent<string>) => {
    try {
      const message = JSON.parse(event.data) as BridgeMessage;
      if (message.kind === 'request') {
        void handleBridgeRequest(message);
      }
    } catch (error) {
      console.error('[AI Proxy] Invalid bridge message:', error);
    }
  };

  bridgeSocket.onclose = () => {
    bridgeConnected = false;
    bridgeSocket = null;
    scheduleReconnect();
  };

  bridgeSocket.onerror = () => {
    bridgeConnected = false;
  };
}

async function init() {
  await loadApiKeys();
  localServerPort = LOCAL_API_PORT;
  connectBridge();
}

void init();

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GENERATE_API_KEY') {
    (async () => {
      const key = generateApiKey();
      await persistApiKeys();
      sendResponse({ success: true, key });
    })();
  } else if (message.type === 'GET_API_KEYS') {
    sendResponse({ success: true, keys: getApiKeys() });
  } else if (message.type === 'DELETE_API_KEY') {
    (async () => {
      const success = deleteApiKey(message.key);
      if (success) {
        await persistApiKeys();
      }
      sendResponse({ success });
    })();
  } else if (message.type === 'TOGGLE_API_KEY') {
    (async () => {
      const success = toggleApiKey(message.key, message.enabled);
      if (success) {
        await persistApiKeys();
      }
      sendResponse({ success });
    })();
  } else if (message.type === 'GET_SERVER_STATUS') {
    sendResponse({
      success: true,
      port: localServerPort,
      running: bridgeConnected
    });
  } else if (message.type === 'DETECT_PROVIDER') {
    (async () => {
      try {
        const response = await sendToAiTab<{ provider: string | null; supported: boolean }>(
          { type: 'DETECT_PROVIDER' },
          message.provider
        );
        sendResponse(response);
      } catch {
        sendResponse({ provider: null, supported: false });
      }
    })();
  }
  return true;
});

})();


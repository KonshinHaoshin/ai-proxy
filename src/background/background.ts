/**
 * Background Service Worker - Starts local API server
 */
import { getLocalServerPort, setLocalServerPort } from './portManager';
import { startApiServer } from './apiServer';

// Store for API keys
interface ApiKey {
  key: string;
  createdAt: number;
  enabled: boolean;
}

const apiKeys: Map<string, ApiKey> = new Map();

// Generate a new API key
export function generateApiKey(): string {
  const key = 'gkp_' + Math.random().toString(36).substring(2, 15) + 
              Math.random().toString(36).substring(2, 15);
  apiKeys.set(key, {
    key,
    createdAt: Date.now(),
    enabled: true
  });
  return key;
}

// Validate API key
export function validateApiKey(key: string): boolean {
  const apiKey = apiKeys.get(key);
  return apiKey !== undefined && apiKey.enabled;
}

// Get all API keys (for popup)
export function getApiKeys(): ApiKey[] {
  return Array.from(apiKeys.values());
}

// Delete API key
export function deleteApiKey(key: string): boolean {
  return apiKeys.delete(key);
}

// Toggle API key enabled status
export function toggleApiKey(key: string, enabled: boolean): boolean {
  const apiKey = apiKeys.get(key);
  if (apiKey) {
    apiKey.enabled = enabled;
    return true;
  }
  return false;
}

// Initialize server on startup
async function init() {
  try {
    const port = await startApiServer(apiKeys);
    setLocalServerPort(port);
    console.log('[AI Proxy] Server started on port', port);
  } catch (error) {
    console.error('[Grok API Proxy] Failed to start server:', error);
  }
}

init();

// Handle messages from popup/content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GENERATE_API_KEY') {
    const key = generateApiKey();
    sendResponse({ success: true, key });
  } else if (message.type === 'GET_API_KEYS') {
    sendResponse({ success: true, keys: getApiKeys() });
  } else if (message.type === 'DELETE_API_KEY') {
    const success = deleteApiKey(message.key);
    sendResponse({ success });
  } else if (message.type === 'TOGGLE_API_KEY') {
    const success = toggleApiKey(message.key, message.enabled);
    sendResponse({ success });
  } else if (message.type === 'GET_SERVER_STATUS') {
    sendResponse({ 
      success: true, 
      port: getLocalServerPort(),
      running: getLocalServerPort() !== null 
    });
  }
  return true;
});

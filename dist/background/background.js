"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateApiKey = generateApiKey;
exports.validateApiKey = validateApiKey;
exports.getApiKeys = getApiKeys;
exports.deleteApiKey = deleteApiKey;
exports.toggleApiKey = toggleApiKey;
/**
 * Background Service Worker - Starts local API server
 */
const portManager_1 = require("./portManager");
const apiServer_1 = require("./apiServer");
const apiKeys = new Map();
// Generate a new API key
function generateApiKey() {
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
function validateApiKey(key) {
    const apiKey = apiKeys.get(key);
    return apiKey !== undefined && apiKey.enabled;
}
// Get all API keys (for popup)
function getApiKeys() {
    return Array.from(apiKeys.values());
}
// Delete API key
function deleteApiKey(key) {
    return apiKeys.delete(key);
}
// Toggle API key enabled status
function toggleApiKey(key, enabled) {
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
        const port = await (0, apiServer_1.startApiServer)(apiKeys);
        (0, portManager_1.setLocalServerPort)(port);
        console.log('[AI Proxy] Server started on port', port);
    }
    catch (error) {
        console.error('[Grok API Proxy] Failed to start server:', error);
    }
}
init();
// Handle messages from popup/content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GENERATE_API_KEY') {
        const key = generateApiKey();
        sendResponse({ success: true, key });
    }
    else if (message.type === 'GET_API_KEYS') {
        sendResponse({ success: true, keys: getApiKeys() });
    }
    else if (message.type === 'DELETE_API_KEY') {
        const success = deleteApiKey(message.key);
        sendResponse({ success });
    }
    else if (message.type === 'TOGGLE_API_KEY') {
        const success = toggleApiKey(message.key, message.enabled);
        sendResponse({ success });
    }
    else if (message.type === 'GET_SERVER_STATUS') {
        sendResponse({
            success: true,
            port: (0, portManager_1.getLocalServerPort)(),
            running: (0, portManager_1.getLocalServerPort)() !== null
        });
    }
    return true;
});

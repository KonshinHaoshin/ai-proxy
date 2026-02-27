/**
 * Content Script - Intercepts AI Chat calls
 */
import { aiProviders, detectProvider, getProvider } from './providers';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatSession {
  id: string;
  provider: string;
  messages: ChatMessage[];
  createdAt: number;
}

let conversations: Map<string, ChatSession> = new Map();
let currentProvider = detectProvider();

function initConversations() {
  try {
    // Generic conversation list detection
    const sidebarItems = document.querySelectorAll('[class*="conversation"], [data-testid*="conversation"], [class*="chat-item"]');
    
    sidebarItems.forEach((item) => {
      const id = item.getAttribute('data-id') || item.getAttribute('data-conversation-id');
      if (id) {
        const titleEl = item.querySelector('[class*="title"], span[class*="text"], a[class*="title"]');
        const title = titleEl?.textContent || 'Untitled';
        
        if (!conversations.has(id)) {
          conversations.set(id, {
            id,
            provider: currentProvider?.name || 'Unknown',
            messages: [],
            createdAt: Date.now()
          });
        }
      }
    });
    
    console.log('[AI Proxy] Found conversations:', conversations.size, 'Provider:', currentProvider?.name);
  } catch (e) {
    console.error('[AI Proxy] Error initializing:', e);
  }
}

function observeMessages() {
  const messageContainer = document.querySelector('[class*="messages"], [class*="chat"], [role="log"], main');
  if (!messageContainer) return;
  
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          console.log('[AI Proxy] New DOM element added');
        }
      });
    });
  });
  
  observer.observe(messageContainer, { childList: true, subtree: true });
}

// Send message via detected provider
async function sendMessageToAI(message: string, providerName?: string): Promise<{
  content: string;
  model: string;
  provider: string;
  usage: Record<string, unknown>;
}> {
  let provider = currentProvider;
  
  if (providerName) {
    provider = getProvider(providerName) || null;
    if (!provider) {
      throw new Error(`Provider "${providerName}" not found`);
    }
  }
  
  if (!provider) {
    throw new Error('No AI provider detected. Make sure you are on a supported AI chat page.');
  }
  
  try {
    const content = await provider.sendMessage(message);
    return {
      content,
      model: 'default',
      provider: provider.name,
      usage: {}
    };
  } catch (error) {
    throw new Error(`Failed to send message via ${provider.name}: ${(error as Error).message}`);
  }
}

// Listen for messages from background
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_CONVERSATIONS') {
    const convList = Array.from(conversations.values()).map(c => ({
      id: c.id,
      provider: c.provider,
      title: c.messages[0]?.content?.substring(0, 30) || 'Untitled',
      messageCount: c.messages.length,
      createdAt: c.createdAt
    }));
    sendResponse({ conversations: convList, provider: currentProvider?.name });
  } else if (message.type === 'GET_CONVERSATION') {
    const conv = conversations.get(message.conversationId);
    sendResponse({ conversation: conv || null });
  } else if (message.type === 'CHAT_WITH_GROK' || message.type === 'CHAT_WITH_AI') {
    // Support both old and new message types
    sendMessageToAI(message.message, message.provider)
      .then((response) => {
        sendResponse({ 
          content: response.content, 
          model: response.model,
          provider: response.provider,
          usage: response.usage
        });
      })
      .catch((error: Error) => {
        sendResponse({ error: error.message });
      });
    return true;
  } else if (message.type === 'DETECT_PROVIDER') {
    sendResponse({ 
      provider: currentProvider?.name || null,
      supported: currentProvider !== null
    });
  }
  
  return false;
});

function main() {
  console.log('[AI Proxy] Content script loaded');
  if (currentProvider) {
    console.log('[AI Proxy] Detected provider:', currentProvider.name);
  }
  initConversations();
  observeMessages();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}

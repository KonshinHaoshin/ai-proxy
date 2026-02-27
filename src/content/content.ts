/**
 * Content Script - Intercepts Grok WebSocket/API calls
 */

interface GrokMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface GrokConversation {
  id: string;
  title: string;
  messages: GrokMessage[];
  createdAt: number;
  updatedAt: number;
}

let conversations: Map<string, GrokConversation> = new Map();

function initConversations() {
  try {
    const sidebarItems = document.querySelectorAll('[class*="conversation"], [data-testid*="conversation"]');
    
    sidebarItems.forEach((item) => {
      const id = item.getAttribute('data-id') || item.getAttribute('data-conversation-id');
      if (id) {
        const titleEl = item.querySelector('[class*="title"], span[class*="text"]');
        const title = titleEl?.textContent || 'Untitled';
        
        if (!conversations.has(id)) {
          conversations.set(id, {
            id,
            title: title.trim(),
            messages: [],
            createdAt: Date.now(),
            updatedAt: Date.now()
          });
        }
      }
    });
    
    console.log('[AI Proxy] Found conversations:', conversations.size);
  } catch (e) {
    console.error('[Grok API Proxy] Error initializing:', e);
  }
}

function observeMessages() {
  const messageContainer = document.querySelector('[class*="messages"], [class*="chat"]');
  if (!messageContainer) return;
  
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const element = node as Element;
          const messageEl = element.querySelector('[class*="message"], [class*="response"]');
          if (messageEl) {
            const contentEl = messageEl.querySelector('[class*="content"], p, div[class*="text"]');
            if (contentEl) {
              console.log('[Grok API Proxy] New message detected');
            }
          }
        }
      });
    });
  });
  
  observer.observe(messageContainer, { childList: true, subtree: true });
}

async function sendMessageToGrok(message: string, model: string = 'grok-2'): Promise<{
  content: string;
  model: string;
  usage: Record<string, unknown>;
}> {
  const inputBox = document.querySelector('textarea[class*="input"], textarea[class*="composer"], textarea[name="message"]');
  
  if (!inputBox) {
    throw new Error('Input box not found. Make sure Grok is open.');
  }
  
  (inputBox as HTMLTextAreaElement).value = message;
  inputBox.dispatchEvent(new Event('input', { bubbles: true }));
  inputBox.dispatchEvent(new Event('change', { bubbles: true }));
  
  await new Promise(resolve => setTimeout(resolve, 500));
  
  const sendButton = document.querySelector('button[class*="send"], button[type="submit"], button[class*="submit"]');
  
  if (!sendButton) {
    throw new Error('Send button not found');
  }
  
  (sendButton as HTMLButtonElement).click();
  
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  const messages = document.querySelectorAll('[class*="message"], [class*="response"]');
  const lastMessage = messages[messages.length - 1];
  
  let content = '';
  if (lastMessage) {
    const contentEl = lastMessage.querySelector('[class*="content"], p, div[class*="text"]');
    content = contentEl?.textContent || '';
  }
  
  return {
    content: content.trim(),
    model: model,
    usage: {}
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_CONVERSATIONS') {
    const convList = Array.from(conversations.values()).map(c => ({
      id: c.id,
      title: c.title,
      messageCount: c.messages.length,
      updatedAt: c.updatedAt
    }));
    sendResponse({ conversations: convList });
  } else if (message.type === 'GET_CONVERSATION') {
    const conv = conversations.get(message.conversationId);
    sendResponse({ conversation: conv || null });
  } else if (message.type === 'CHAT_WITH_GROK') {
    sendMessageToGrok(message.message, message.model)
      .then((response) => {
        sendResponse({ 
          content: response.content, 
          model: response.model,
          usage: response.usage
        });
      })
      .catch((error: Error) => {
        sendResponse({ error: error.message });
      });
    return true;
  }
  return false;
});

function main() {
  console.log('[Grok API Proxy] Content script loaded');
  initConversations();
  observeMessages();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}

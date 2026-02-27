(() => {
/**
 * Content Script - Intercepts AI Chat calls
 */

interface AIProvider {
  name: string;
  domains: string[];
  sendMessage: (message: string) => Promise<string>;
}

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

const DEFAULT_TIMEOUT_MS = 90000;
const POLL_INTERVAL_MS = 500;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isEditableElement(el: Element | null): el is HTMLElement {
  return el instanceof HTMLElement && el.isContentEditable;
}

function setTextInputValue(input: HTMLTextAreaElement | HTMLElement, message: string): void {
  input.focus();
  if (input instanceof HTMLTextAreaElement) {
    input.value = message;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }

  // ProseMirror/contenteditable style editors.
  input.textContent = '';
  try {
    document.execCommand('insertText', false, message);
  } catch {
    // ignore and fall back below
  }
  if ((input.textContent || '').trim() !== message.trim()) {
    input.textContent = message;
  }
  input.dispatchEvent(new InputEvent('input', { bubbles: true, data: message, inputType: 'insertText' }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function getLastTextBySelectors(selectors: string[]): string {
  for (const selector of selectors) {
    const nodes = document.querySelectorAll(selector);
    if (nodes.length === 0) {
      continue;
    }
    const last = nodes[nodes.length - 1];
    const text = last.textContent?.trim() || '';
    if (text.length > 0) {
      return text;
    }
  }
  return '';
}

async function waitForAssistantReply(
  replySelectors: string[],
  previousSnapshot: string,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<string> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const latest = getLastTextBySelectors(replySelectors);
    if (latest && latest !== previousSnapshot) {
      return latest;
    }
    await delay(POLL_INTERVAL_MS);
  }
  throw new Error('Timed out waiting for AI response');
}

async function sendViaDomAutomation(options: {
  message: string;
  inputSelectors: string[];
  sendSelectors: string[];
  responseSelectors: string[];
}): Promise<string> {
  const input = options.inputSelectors
    .map((selector) => document.querySelector(selector))
    .find((el): el is HTMLTextAreaElement | HTMLElement => {
      return el instanceof HTMLTextAreaElement || isEditableElement(el);
    });
  if (!input) {
    throw new Error('Input box not found');
  }

  const previousSnapshot = getLastTextBySelectors(options.responseSelectors);
  setTextInputValue(input, options.message);
  await delay(200);

  const sendButton = options.sendSelectors
    .map((selector) => document.querySelector(selector))
    .find((el): el is HTMLButtonElement => el instanceof HTMLButtonElement);
  if (!sendButton) {
    throw new Error('Send button not found');
  }

  sendButton.click();
  return waitForAssistantReply(options.responseSelectors, previousSnapshot);
}

const aiProviders: AIProvider[] = [
  {
    name: 'Grok',
    domains: ['grok.x.ai', 'grok.com'],
    async sendMessage(message: string): Promise<string> {
      return sendViaDomAutomation({
        message,
        inputSelectors: [
          'textarea[class*="input"]',
          'textarea[class*="composer"]',
          'textarea[name="message"]',
          '[contenteditable="true"][role="textbox"]',
          'div.ProseMirror[contenteditable="true"]',
          '[class*="ProseMirror"][contenteditable="true"]',
          '[data-placeholder*="畅所欲问"]'
        ],
        sendSelectors: [
          'button[class*="send"]',
          'button[type="submit"]',
          'button[aria-label*="Send"]',
          'button[aria-label*="发送"]',
          'button[data-testid*="send"]'
        ],
        responseSelectors: [
          '[data-testid*="assistant"]',
          '[class*="assistant"]',
          '[class*="message"]',
          '[class*="response"]'
        ]
      });
    }
  },
  {
    name: 'OpenAI',
    domains: ['chat.openai.com', 'chatgpt.com'],
    async sendMessage(message: string): Promise<string> {
      return sendViaDomAutomation({
        message,
        inputSelectors: [
          'textarea[id*="prompt"]',
          'textarea[name="prompt"]',
          'textarea[aria-label*="message"]'
        ],
        sendSelectors: [
          'button[data-testid="send-button"]',
          'button[aria-label="Send message"]',
          'button[class*="submit"]',
          'button[type="submit"]'
        ],
        responseSelectors: ['[data-message-author-role="assistant"]', '[class*="assistant"]']
      });
    }
  },
  {
    name: 'DeepSeek',
    domains: ['chat.deepseek.com', 'deepseek.com'],
    async sendMessage(message: string): Promise<string> {
      return sendViaDomAutomation({
        message,
        inputSelectors: ['textarea[placeholder*="message"]', 'textarea[id*="chat"]'],
        sendSelectors: ['button[type="submit"]', 'button[class*="send"]'],
        responseSelectors: ['[class*="message-content"]', '[class*="response"]']
      });
    }
  },
  {
    name: 'Claude',
    domains: ['claude.ai', 'claude.com'],
    async sendMessage(message: string): Promise<string> {
      return sendViaDomAutomation({
        message,
        inputSelectors: ['textarea[placeholder*="message"]', 'textarea[name="chat-input"]'],
        sendSelectors: ['button[type="submit"]', 'button[aria-label="Send"]'],
        responseSelectors: ['[data-testid="assistant-message"]', '[class*="assistant-message"]']
      });
    }
  },
  {
    name: 'Gemini',
    domains: ['gemini.google.com', 'bard.google.com'],
    async sendMessage(message: string): Promise<string> {
      return sendViaDomAutomation({
        message,
        inputSelectors: ['textarea[aria-label*="message"]', 'textarea[placeholder*="prompt"]'],
        sendSelectors: ['button[aria-label*="Send"]', 'button[data-testid*="send"]'],
        responseSelectors: ['[role="region"]', '[class*="response"]']
      });
    }
  }
];

function detectProvider(): AIProvider | null {
  const hostname = window.location.hostname;
  return aiProviders.find((provider) => provider.domains.some((domain) => hostname.includes(domain))) || null;
}

function getProvider(name: string): AIProvider | undefined {
  return aiProviders.find((provider) => provider.name.toLowerCase() === name.toLowerCase());
}

let conversations: Map<string, ChatSession> = new Map();
let currentProvider = detectProvider();

function refreshProvider() {
  currentProvider = detectProvider();
  return currentProvider;
}

function initConversations() {
  try {
    const sidebarItems = document.querySelectorAll('[class*="conversation"], [data-testid*="conversation"], [class*="chat-item"]');

    sidebarItems.forEach((item) => {
      const id = item.getAttribute('data-id') || item.getAttribute('data-conversation-id');
      if (id && !conversations.has(id)) {
        conversations.set(id, {
          id,
          provider: currentProvider?.name || 'Unknown',
          messages: [],
          createdAt: Date.now()
        });
      }
    });

    console.log('[AI Proxy] Found conversations:', conversations.size, 'Provider:', currentProvider?.name);
  } catch (e) {
    console.error('[AI Proxy] Error initializing:', e);
  }
}

function observeMessages() {
  const messageContainer = document.querySelector('[class*="messages"], [class*="chat"], [role="log"], main');
  if (!messageContainer) {
    return;
  }

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

async function sendMessageToAI(message: string, providerName?: string): Promise<{
  content: string;
  model: string;
  provider: string;
  usage: Record<string, unknown>;
}> {
  let provider = refreshProvider();

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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_CONVERSATIONS') {
    const convList = Array.from(conversations.values()).map((conversation) => ({
      id: conversation.id,
      provider: conversation.provider,
      title: conversation.messages[0]?.content?.substring(0, 30) || 'Untitled',
      messageCount: conversation.messages.length,
      createdAt: conversation.createdAt
    }));
    sendResponse({ conversations: convList, provider: currentProvider?.name });
  } else if (message.type === 'GET_CONVERSATION') {
    const conversation = conversations.get(message.conversationId);
    sendResponse({ conversation: conversation || null });
  } else if (message.type === 'CHAT_WITH_GROK' || message.type === 'CHAT_WITH_AI') {
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
    const detected = refreshProvider();
    sendResponse({
      provider: detected?.name || null,
      supported: detected !== null
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

})();


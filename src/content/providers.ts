/**
 * AI Provider Adapters - 各平台消息发送实现
 */

export interface AIProvider {
  name: string;
  domains: string[];
  sendMessage: (message: string) => Promise<string>;
}

// Grok adapter
const grokAdapter: AIProvider = {
  name: 'Grok',
  domains: ['grok.x.ai', 'grok.com'],
  async sendMessage(message: string): Promise<string> {
    const inputBox = document.querySelector('textarea[class*="input"], textarea[class*="composer"], textarea[name="message"]');
    if (!inputBox) throw new Error('Input box not found');

    (inputBox as HTMLTextAreaElement).value = message;
    inputBox.dispatchEvent(new Event('input', { bubbles: true }));
    inputBox.dispatchEvent(new Event('change', { bubbles: true }));

    await new Promise(r => setTimeout(r, 500));

    const sendButton = document.querySelector('button[class*="send"], button[type="submit"]');
    if (!sendButton) throw new Error('Send button not found');

    (sendButton as HTMLButtonElement).click();
    await new Promise(r => setTimeout(r, 3000));

    const messages = document.querySelectorAll('[class*="message"], [class*="response"]');
    const lastMessage = messages[messages.length - 1];
    return lastMessage?.textContent?.trim() || '';
  }
};

// OpenAI ChatGPT adapter
const openaiAdapter: AIProvider = {
  name: 'OpenAI',
  domains: ['chat.openai.com', 'chatgpt.com'],
  async sendMessage(message: string): Promise<string> {
    const textarea = document.querySelector('textarea[id*="prompt"], textarea[name="prompt"], textarea[aria-label*="message"]');
    if (!textarea) throw new Error('Input textarea not found');

    (textarea as HTMLTextAreaElement).value = message;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));

    await new Promise(r => setTimeout(r, 300));

    const sendButton = document.querySelector('button[data-testid="send-button"], button[aria-label="Send message"]');
    if (!sendButton) {
      const enterButton = document.querySelector('button[class*="submit"], button[type="submit"]');
      if (!enterButton) throw new Error('Send button not found');
      (enterButton as HTMLButtonElement).click();
    } else {
      (sendButton as HTMLButtonElement).click();
    }

    await new Promise(r => setTimeout(r, 4000));

    const messages = document.querySelectorAll('[data-message-author-role="assistant"], [class*="assistant"]');
    const lastMessage = messages[messages.length - 1];
    return lastMessage?.textContent?.trim() || '';
  }
};

// DeepSeek adapter
const deepseekAdapter: AIProvider = {
  name: 'DeepSeek',
  domains: ['chat.deepseek.com', 'deepseek.com'],
  async sendMessage(message: string): Promise<string> {
    const textarea = document.querySelector('textarea[placeholder*="message"], textarea[id*="chat"]');
    if (!textarea) throw new Error('Input textarea not found');

    (textarea as HTMLTextAreaElement).value = message;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));

    await new Promise(r => setTimeout(r, 300));

    const sendButton = document.querySelector('button[type="submit"], button[class*="send"]');
    if (!sendButton) throw new Error('Send button not found');

    (sendButton as HTMLButtonElement).click();
    await new Promise(r => setTimeout(r, 4000));

    const messages = document.querySelectorAll('[class*="message-content"], [class*="response"]');
    const lastMessage = messages[messages.length - 1];
    return lastMessage?.textContent?.trim() || '';
  }
};

// Anthropic Claude adapter
const claudeAdapter: AIProvider = {
  name: 'Claude',
  domains: ['claude.ai', 'claude.com'],
  async sendMessage(message: string): Promise<string> {
    const textarea = document.querySelector('textarea[placeholder*="message"], textarea[name="chat-input"]');
    if (!textarea) throw new Error('Input textarea not found');

    (textarea as HTMLTextAreaElement).value = message;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));

    await new Promise(r => setTimeout(r, 300));

    const sendButton = document.querySelector('button[type="submit"], button[aria-label="Send"]');
    if (!sendButton) throw new Error('Send button not found');

    (sendButton as HTMLButtonElement).click();
    await new Promise(r => setTimeout(r, 4000));

    const messages = document.querySelectorAll('[data-testid="assistant-message"], [class*="assistant-message"]');
    const lastMessage = messages[messages.length - 1];
    return lastMessage?.textContent?.trim() || '';
  }
};

// Gemini adapter
const geminiAdapter: AIProvider = {
  name: 'Gemini',
  domains: ['gemini.google.com', 'bard.google.com'],
  async sendMessage(message: string): Promise<string> {
    const textarea = document.querySelector('textarea[aria-label*="message"], textarea[placeholder*="prompt"]');
    if (!textarea) throw new Error('Input textarea not found');

    (textarea as HTMLTextAreaElement).value = message;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));

    await new Promise(r => setTimeout(r, 300));

    const sendButton = document.querySelector('button[aria-label*="Send"], button[data-testid*="send"]');
    if (!sendButton) throw new Error('Send button not found');

    (sendButton as HTMLButtonElement).click();
    await new Promise(r => setTimeout(r, 4000));

    const messages = document.querySelectorAll('[role="region"], [class*="response"]');
    const lastMessage = messages[messages.length - 1];
    return lastMessage?.textContent?.trim() || '';
  }
};

// All providers
export const aiProviders: AIProvider[] = [
  grokAdapter,
  openaiAdapter,
  deepseekAdapter,
  claudeAdapter,
  geminiAdapter
];

// Detect current provider
export function detectProvider(): AIProvider | null {
  const hostname = window.location.hostname;
  return aiProviders.find(p => p.domains.some(d => hostname.includes(d))) || null;
}

// Get provider by name
export function getProvider(name: string): AIProvider | undefined {
  return aiProviders.find(p => p.name.toLowerCase() === name.toLowerCase());
}

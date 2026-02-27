/**
 * AI Provider Adapters
 */

export interface AIProvider {
  name: string;
  domains: string[];
  sendMessage: (message: string) => Promise<string>;
}

const DEFAULT_TIMEOUT_MS = 90000;
const POLL_INTERVAL_MS = 500;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setTextInputValue(input: HTMLTextAreaElement, message: string): void {
  input.focus();
  input.value = message;
  input.dispatchEvent(new Event('input', { bubbles: true }));
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
    .find((el): el is HTMLTextAreaElement => el instanceof HTMLTextAreaElement);
  if (!input) {
    throw new Error('Input textarea not found');
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

const grokAdapter: AIProvider = {
  name: 'Grok',
  domains: ['grok.x.ai', 'grok.com'],
  async sendMessage(message: string): Promise<string> {
    return sendViaDomAutomation({
      message,
      inputSelectors: [
        'textarea[class*="input"]',
        'textarea[class*="composer"]',
        'textarea[name="message"]'
      ],
      sendSelectors: ['button[class*="send"]', 'button[type="submit"]'],
      responseSelectors: ['[class*="message"]', '[class*="response"]']
    });
  }
};

const openaiAdapter: AIProvider = {
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
};

const deepseekAdapter: AIProvider = {
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
};

const claudeAdapter: AIProvider = {
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
};

const geminiAdapter: AIProvider = {
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
};

export const aiProviders: AIProvider[] = [
  grokAdapter,
  openaiAdapter,
  deepseekAdapter,
  claudeAdapter,
  geminiAdapter
];

export function detectProvider(): AIProvider | null {
  const hostname = window.location.hostname;
  return aiProviders.find((provider) => provider.domains.some((domain) => hostname.includes(domain))) || null;
}

export function getProvider(name: string): AIProvider | undefined {
  return aiProviders.find((provider) => provider.name.toLowerCase() === name.toLowerCase());
}

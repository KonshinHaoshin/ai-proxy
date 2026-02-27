/**
 * Popup Script - Manage API keys and view status
 */

// DOM Elements
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const endpointEl = document.getElementById('endpoint');
const currentProviderEl = document.getElementById('currentProvider');
const apiKeyListEl = document.getElementById('apiKeyList');
const generateKeyBtn = document.getElementById('generateKey');
const copyEndpointBtn = document.getElementById('copyEndpoint');
const providerItems = document.querySelectorAll('.provider-item');

// Update status display
function updateStatus(running: boolean, port?: number) {
  if (running && port) {
    statusDot?.classList.add('active');
    if (statusText) statusText.textContent = `Running on port ${port}`;
    if (endpointEl) endpointEl.textContent = `http://127.0.0.1:${port}`;
  } else {
    statusDot?.classList.remove('active');
    if (statusText) statusText.textContent = 'Not running';
  }
}

// Update provider display
function updateProvider(provider: string | null, active: boolean) {
  if (currentProviderEl) {
    currentProviderEl.textContent = provider ? provider : 'No AI detected';
  }
  
  providerItems.forEach(item => {
    const providerName = item.getAttribute('data-provider');
    if (providerName === provider && active) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
}

// Render API keys list
function renderApiKeys(keys: Array<{key: string; createdAt: number; enabled: boolean}>) {
  if (!apiKeyListEl) return;
  
  if (keys.length === 0) {
    apiKeyListEl.innerHTML = '<p style="color: #666; font-size: 12px;">No API keys yet</p>';
    return;
  }
  
  apiKeyListEl.innerHTML = keys.map(k => `
    <div class="api-key-item">
      <div>
        <div class="api-key-value">${k.key}</div>
        <div style="color: #666; font-size: 10px; margin-top: 4px;">
          Created: ${new Date(k.createdAt).toLocaleString()}
        </div>
      </div>
      <div class="toggle-container">
        <div class="toggle ${k.enabled ? 'active' : ''}" data-key="${k.key}" data-enabled="${k.enabled}"></div>
        <button class="btn btn-danger delete-key" data-key="${k.key}">Delete</button>
      </div>
    </div>
  `).join('');
  
  // Add event listeners
  document.querySelectorAll('.delete-key').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const key = (e.target as HTMLElement).dataset.key;
      if (key) {
        await deleteApiKey(key);
      }
    });
  });
  
  document.querySelectorAll('.toggle').forEach(toggle => {
    toggle.addEventListener('click', async (e) => {
      const el = e.target as HTMLElement;
      const key = el.dataset.key;
      const currentEnabled = el.dataset.enabled === 'true';
      if (key) {
        await toggleApiKey(key, !currentEnabled);
      }
    });
  });
}

// API Functions
async function getServerStatus() {
  return new Promise<{success: boolean; running: boolean; port?: number}>((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_SERVER_STATUS' }, (response) => {
      resolve(response || { success: false, running: false });
    });
  });
}

async function getApiKeys(): Promise<Array<{key: string; createdAt: number; enabled: boolean}>> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_API_KEYS' }, (response) => {
      resolve(response?.keys || []);
    });
  });
}

async function generateNewKey(): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GENERATE_API_KEY' }, (response) => {
      resolve(response?.key || null);
    });
  });
}

async function deleteApiKey(key: string): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'DELETE_API_KEY', key }, (response) => {
      resolve(response?.success || false);
    });
  });
}

async function toggleApiKey(key: string, enabled: boolean): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'TOGGLE_API_KEY', key, enabled }, (response) => {
      resolve(response?.success || false);
    });
  });
}

async function detectProvider() {
  return new Promise<{provider: string | null; supported: boolean}>((resolve) => {
    chrome.runtime.sendMessage({ type: 'DETECT_PROVIDER' }, (response) => {
      resolve(response || { provider: null, supported: false });
    });
  });
}

// Event Listeners
generateKeyBtn?.addEventListener('click', async () => {
  const key = await generateNewKey();
  if (key) {
    const keys = await getApiKeys();
    renderApiKeys(keys);
  }
});

copyEndpointBtn?.addEventListener('click', () => {
  if (endpointEl) {
    navigator.clipboard.writeText(endpointEl.textContent || '');
    copyEndpointBtn.textContent = 'Copied!';
    setTimeout(() => {
      if (copyEndpointBtn) copyEndpointBtn.textContent = 'Copy Endpoint';
    }, 2000);
  }
});

// Initialize
async function init() {
  const status = await getServerStatus();
  updateStatus(status.running, status.port);
  
  const provider = await detectProvider();
  updateProvider(provider.provider, provider.supported);
  
  const keys = await getApiKeys();
  renderApiKeys(keys);
}

init();

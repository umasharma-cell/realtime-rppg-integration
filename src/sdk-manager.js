import { API_KEY, SDK_METHOD } from './constants.js';
let wiseai = null;
let mediaStream = null;
async function loadSDKModule() {
  if (!window.WiseAI) {
    const loadModule = new Function('url', 'return import(url)');
    const sdk = await loadModule('/wiseai-sdk/wiseai-sdk.browser.js');
    window.WiseAI = sdk.WiseAI;
    window.WiseAIAPIKeyError = sdk.WiseAIAPIKeyError;
    window.WiseAIAPIQuotaExceededError = sdk.WiseAIAPIQuotaExceededError;
  }
}
const sdkManager = {
  async init() {
    await loadSDKModule();
    wiseai = new window.WiseAI({ method: SDK_METHOD, apiKey: API_KEY });
    console.log('[SDK] Initialized with method:', SDK_METHOD);
  },
  async start(videoEl) { console.log('[SDK] Starting...'); },
  stop() { console.log('[SDK] Stopped'); },
};
export default sdkManager;

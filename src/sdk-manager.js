import { API_KEY, SDK_METHOD } from './constants.js';
let wiseai = null;
let mediaStream = null;
const sdkManager = {
  async init() { console.log('[SDK] Initializing...'); },
  async start(videoEl) { console.log('[SDK] Starting...'); },
  stop() { console.log('[SDK] Stopped'); },
};
export default sdkManager;

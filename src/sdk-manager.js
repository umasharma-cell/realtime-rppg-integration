import { API_KEY, SDK_METHOD } from './constants.js';
let wiseai = null;
let mediaStream = null;
let callbacks = { onVitals: null, onFaceDetected: null, onStreamReset: null };
function vitalsHandler(r) { if (callbacks.onVitals) callbacks.onVitals(r); }
function faceDetectedHandler(r) { if (callbacks.onFaceDetected) callbacks.onFaceDetected(r); }
function streamResetHandler(e) { if (callbacks.onStreamReset) callbacks.onStreamReset(e); }
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
    console.log('[SDK] Initialized');
  },
  async start(videoEl) {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } });
    videoEl.srcObject = mediaStream;
    await videoEl.play();
    await wiseai.setVideoStream(mediaStream, videoEl);
    wiseai.addEventListener('vitals', vitalsHandler);
    wiseai.addEventListener('faceDetected', faceDetectedHandler);
    wiseai.addEventListener('streamReset', streamResetHandler);
    wiseai.startVideoStream();
    console.log('[SDK] Stream started');
  },
  stop() {
    if (wiseai) { wiseai.removeEventListener('vitals'); wiseai.removeEventListener('faceDetected'); wiseai.removeEventListener('streamReset'); wiseai.stopVideoStream(); }
    if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; }
  },
  onVitals(cb) { callbacks.onVitals = cb; },
  onFaceDetected(cb) { callbacks.onFaceDetected = cb; },
  onStreamReset(cb) { callbacks.onStreamReset = cb; },
};
export default sdkManager;

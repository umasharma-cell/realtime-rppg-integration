import { API_KEY, SDK_METHOD, FALLBACK_METHOD } from './constants.js';

let wiseai = null;
let mediaStream = null;
let activeMethod = null;
let callbacks = {
  onVitals: null,
  onFaceDetected: null,
  onStreamReset: null,
};

function vitalsHandler(result) {
  if (callbacks.onVitals) callbacks.onVitals(result);
}

function faceDetectedHandler(result) {
  if (callbacks.onFaceDetected) callbacks.onFaceDetected(result);
}

function streamResetHandler(event) {
  if (callbacks.onStreamReset) callbacks.onStreamReset(event);
}

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

    // Try cloud method first, fallback to local if API unreachable
    try {
      console.log(`[SDK] Trying cloud method '${SDK_METHOD}'...`);
      wiseai = new window.WiseAI({
        method: SDK_METHOD,
        apiKey: API_KEY,
      });
      activeMethod = SDK_METHOD;
      console.log('[SDK] Instance created with method:', SDK_METHOD);
    } catch (err) {
      console.warn(`[SDK] Cloud method failed: ${err.message}`);
      console.log(`[SDK] Falling back to local method '${FALLBACK_METHOD}'...`);
      wiseai = new window.WiseAI({
        method: FALLBACK_METHOD,
      });
      activeMethod = FALLBACK_METHOD;
      console.log('[SDK] Instance created with fallback method:', FALLBACK_METHOD);
    }
  },

  async start(videoEl) {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
    });
    videoEl.srcObject = mediaStream;
    await videoEl.play();

    try {
      await wiseai.setVideoStream(mediaStream, videoEl);
    } catch (err) {
      // If cloud method fails during setVideoStream (API validation happens here),
      // fallback to local method
      if (activeMethod !== FALLBACK_METHOD) {
        console.warn(`[SDK] Cloud init failed during stream setup: ${err.message}`);
        console.log(`[SDK] Falling back to local method '${FALLBACK_METHOD}'...`);
        wiseai = new window.WiseAI({ method: FALLBACK_METHOD });
        activeMethod = FALLBACK_METHOD;
        await wiseai.setVideoStream(mediaStream, videoEl);
      } else {
        throw err;
      }
    }

    wiseai.addEventListener('vitals', vitalsHandler);
    wiseai.addEventListener('faceDetected', faceDetectedHandler);
    wiseai.addEventListener('streamReset', streamResetHandler);

    wiseai.startVideoStream();
    console.log('[SDK] Video stream started with method:', activeMethod);
  },

  stop() {
    if (wiseai) {
      wiseai.removeEventListener('vitals');
      wiseai.removeEventListener('faceDetected');
      wiseai.removeEventListener('streamReset');
      wiseai.stopVideoStream();
    }
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
      mediaStream = null;
    }
    console.log('[SDK] Stopped');
  },

  pause() {
    if (wiseai) wiseai.pauseVideoStream();
  },

  resume() {
    if (wiseai) wiseai.startVideoStream();
  },

  onVitals(cb) { callbacks.onVitals = cb; },
  onFaceDetected(cb) { callbacks.onFaceDetected = cb; },
  onStreamReset(cb) { callbacks.onStreamReset = cb; },

  getActiveMethod() { return activeMethod; },
  getInstance() { return wiseai; },
  getStream() { return mediaStream; },
};

export default sdkManager;

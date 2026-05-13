import sdkManager from './sdk-manager.js';
import vitalsTracker from './vitals-tracker.js';
import sessionController from './session-controller.js';
import performanceMonitor from './performance-monitor.js';
import uiRenderer from './ui-renderer.js';
import rrEstimator from './rr-estimator.js';

const videoEl = document.getElementById('video');
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const newSessionBtn = document.getElementById('new-session-btn');

let firstVitalsReceived = false;
let lastChunkRecordTime = 0;
let isLocalMethod = false;
let waveformUpdateCounter = 0;

// Throttle chunk recording: cloud fires ~every 4s, local fires every frame
const CLOUD_CHUNK_INTERVAL_MS = 0;    // no throttle for cloud
const LOCAL_CHUNK_INTERVAL_MS = 2000; // 1 chunk every 2s for local

// --- Session controller callbacks ---

sessionController.onStateChange((state, prev) => {
  switch (state) {
    case 'initializing':
      uiRenderer.setStatus('Initializing SDK...');
      break;
    case 'searching':
      uiRenderer.setStatus('Looking for your face... position yourself in the frame');
      break;
    case 'warmingUp':
      uiRenderer.setStatus('Face detected! Calibrating... hold still');
      break;
    case 'scanning':
      uiRenderer.setStatus('Scanning vitals — hold still and look at the camera');
      break;
    case 'completed':
      handleSessionComplete();
      break;
    case 'error':
      break;
  }
});

sessionController.onTimerTick((remaining) => {
  uiRenderer.updateTimer(remaining);

  // Check face loss during scanning
  const paused = sessionController.checkFaceLoss();
  if (paused) {
    uiRenderer.showWarning('Timer paused — face not detected for 5+ seconds. Please look at the camera.');
    uiRenderer.setStatus('Paused — face lost');
  }

  // Update metrics live
  const metrics = performanceMonitor.getSummary(vitalsTracker.getValidChunkCount());
  uiRenderer.updateMetrics(metrics);
});

// --- SDK event handlers ---

function handleVitals(result) {
  const hasHR = result.vitals?.heart_rate?.value != null;

  // Any vitals event with HR means face IS detected (for both cloud and local)
  if (hasHR) {
    performanceMonitor.recordFaceStatus(true);
    sessionController.handleFaceDetected(true);
    uiRenderer.hideWarning();
  }

  // Transition state machine on first valid vitals
  if (!firstVitalsReceived && hasHR) {
    firstVitalsReceived = true;
    sessionController.handleFirstVitals();
    console.log('[Vitals] First valid vitals received, timer started');
  }

  const state = sessionController.getState();
  if (state !== 'scanning' && state !== 'warmingUp') return;

  // Feed PPG data to local RR estimator (only in local mode)
  const ppgData = result.waveforms?.ppg_waveform?.data;
  if (isLocalMethod && ppgData && ppgData.length > 0) {
    rrEstimator.addPPGData(ppgData);
  }

  // Throttle chunk recording for local methods
  const now = Date.now();
  const interval = isLocalMethod ? LOCAL_CHUNK_INTERVAL_MS : CLOUD_CHUNK_INTERVAL_MS;

  if (now - lastChunkRecordTime >= interval) {
    lastChunkRecordTime = now;

    // If local method, inject estimated RR
    if (isLocalMethod) {
      const estimatedRR = rrEstimator.estimateRR();
      const rrConf = rrEstimator.getConfidence();
      if (estimatedRR != null) {
        if (!result.vitals) result.vitals = {};
        result.vitals.respiratory_rate = {
          value: estimatedRR,
          confidence: rrConf,
          unit: 'rpm',
        };
      }
    }

    const chunk = vitalsTracker.addChunk(result);
    performanceMonitor.recordChunk(chunk);

    uiRenderer.updateLiveVitals(chunk);
    uiRenderer.updateChunkCount(vitalsTracker.getChunkCount());
  }

  // Update waveforms more frequently for smooth visuals
  waveformUpdateCounter++;
  if (waveformUpdateCounter % 5 === 0) {
    uiRenderer.updatePPGWaveform(vitalsTracker.getPPGBuffer());
    if (isLocalMethod) {
      const respWaveform = rrEstimator.getRespWaveform();
      if (respWaveform && respWaveform.length > 10) {
        uiRenderer.updateRespWaveform(respWaveform);
      }
    } else {
      uiRenderer.updateRespWaveform(vitalsTracker.getRespBuffer());
    }
  }
}

function handleFaceDetected(result) {
  // The SDK dispatches faceDetected with:
  //   - A face object (with coordinates/confidence) when face IS found
  //   - null when face is NOT found
  // Note: the face object is NOT wrapped in {face: {...}} — it's the raw detection
  const hasFace = result != null;

  performanceMonitor.recordFaceStatus(hasFace);
  sessionController.handleFaceDetected(hasFace);

  if (hasFace) {
    uiRenderer.hideWarning();
    if (sessionController.getState() === 'scanning') {
      uiRenderer.setStatus('Scanning vitals — hold still and look at the camera');
    }
  } else {
    // Only show warning during active states
    const state = sessionController.getState();
    if (state === 'scanning' || state === 'warmingUp' || state === 'searching') {
      uiRenderer.showWarning('Face not detected — please look at the camera');
    }
  }
}

async function handleStreamReset(event) {
  console.warn('[StreamReset]', event?.message);
  uiRenderer.showWarning('Connection unstable. Reconnecting...');

  try {
    sdkManager.stop();
    await new Promise(resolve => setTimeout(resolve, 3000));
    await sdkManager.init();
    await sdkManager.start(videoEl);
    uiRenderer.hideWarning();
    if (sessionController.getState() === 'scanning') {
      uiRenderer.setStatus('Reconnected — scanning vitals...');
    }
  } catch (err) {
    console.error('[Reconnect failed]', err);
    uiRenderer.showError('Reconnection failed. Please start a new session.');
    sessionController.setError();
  }
}

// --- Session complete ---

function handleSessionComplete() {
  sdkManager.stop();
  videoEl.srcObject = null;

  const finalHR = vitalsTracker.getAverageHR();
  const finalRR = vitalsTracker.getAverageRR();
  const trimmedHR = vitalsTracker.getTrimmedMeanHR();
  const trimmedRR = vitalsTracker.getTrimmedMeanRR();
  const chunks = vitalsTracker.getAllChunks();
  const metrics = performanceMonitor.getSummary(vitalsTracker.getValidChunkCount());

  uiRenderer.setStatus('Session complete!');
  uiRenderer.updateTimer(0);
  uiRenderer.updateMetrics(metrics);
  uiRenderer.hideWarning();
  uiRenderer.showResults({ finalHR, finalRR, trimmedHR, trimmedRR, chunks });

  startBtn.disabled = true;
  stopBtn.disabled = true;

  console.log('[Session Complete]', {
    finalHR: finalHR != null ? Math.round(finalHR) : null,
    finalRR: finalRR != null ? Math.round(finalRR) : null,
    trimmedHR: trimmedHR != null ? Math.round(trimmedHR) : null,
    trimmedRR: trimmedRR != null ? Math.round(trimmedRR) : null,
    chunkCount: chunks.length,
    metrics,
  });
}

// --- Start / Stop / New Session ---

startBtn.addEventListener('click', async () => {
  startBtn.disabled = true;
  stopBtn.disabled = false;
  firstVitalsReceived = false;
  lastChunkRecordTime = 0;
  waveformUpdateCounter = 0;

  uiRenderer.resetAll();
  vitalsTracker.reset();
  performanceMonitor.reset();
  sessionController.reset();
  rrEstimator.reset();

  sessionController.startInitializing();
  performanceMonitor.start();

  try {
    await sdkManager.init();

    sdkManager.onVitals(handleVitals);
    sdkManager.onFaceDetected(handleFaceDetected);
    sdkManager.onStreamReset(handleStreamReset);

    await sdkManager.start(videoEl);
    sessionController.handleSDKReady();

    // Check if using fallback local method
    const method = sdkManager.getActiveMethod();
    isLocalMethod = (method !== 'wiseai');

    if (isLocalMethod) {
      uiRenderer.showWarning(
        `Cloud API unreachable — using local '${method}' method. ` +
        `RR is estimated locally from the PPG signal (less accurate than cloud).`
      );
      setTimeout(() => uiRenderer.hideWarning(), 5000);
    }
  } catch (err) {
    console.error('[Error] name:', err.name, 'message:', err.message, 'full:', err);
    const msg = err.name === 'NotAllowedError'
      ? 'Camera access denied. Please allow camera permission and try again.'
      : err.name === 'WiseAIAPIKeyError'
        ? `API Key Error: ${err.message}`
        : `Error: ${err.message}`;

    uiRenderer.showError(msg);
    uiRenderer.setStatus('Error');
    sessionController.setError();
    startBtn.disabled = false;
    stopBtn.disabled = true;
  }
});

stopBtn.addEventListener('click', () => {
  sdkManager.stop();
  videoEl.srcObject = null;
  sessionController.reset();
  uiRenderer.setStatus('Stopped by user');
  startBtn.disabled = false;
  stopBtn.disabled = true;
});

newSessionBtn.addEventListener('click', () => {
  uiRenderer.resetAll();
  vitalsTracker.reset();
  performanceMonitor.reset();
  sessionController.reset();
  rrEstimator.reset();
  startBtn.disabled = false;
  stopBtn.disabled = true;
  uiRenderer.setStatus('Ready to scan');
});

// --- Tab visibility handling ---

document.addEventListener('visibilitychange', () => {
  if (sessionController.getState() !== 'scanning' && sessionController.getState() !== 'warmingUp') return;

  if (document.hidden) {
    sdkManager.pause();
    uiRenderer.showWarning('Tab hidden — scanning paused');
  } else {
    sdkManager.resume();
    uiRenderer.hideWarning();
    uiRenderer.setStatus('Scanning vitals — hold still and look at the camera');
  }
});

import { CONFIDENCE_THRESHOLDS } from './constants.js';

// DOM element refs (cached on first call)
let els = null;

function getElements() {
  if (els) return els;
  els = {
    status: document.getElementById('status'),
    timer: document.getElementById('timer'),
    chunkCount: document.getElementById('chunk-count'),
    liveFps: document.getElementById('live-fps'),
    hrValue: document.getElementById('hr-value'),
    hrConf: document.getElementById('hr-conf'),
    rrValue: document.getElementById('rr-value'),
    rrConf: document.getElementById('rr-conf'),
    ppgCanvas: document.getElementById('ppg-canvas'),
    respCanvas: document.getElementById('resp-canvas'),
    warningBanner: document.getElementById('warning-banner'),
    errorBanner: document.getElementById('error-banner'),
    // Metrics
    metricFps: document.getElementById('metric-fps'),
    metricInterval: document.getElementById('metric-interval'),
    metricTotalChunks: document.getElementById('metric-total-chunks'),
    metricValidChunks: document.getElementById('metric-valid-chunks'),
    metricFaceUptime: document.getElementById('metric-face-uptime'),
    metricWallTime: document.getElementById('metric-wall-time'),
    // Results
    resultsOverlay: document.getElementById('results-overlay'),
    resultHr: document.getElementById('result-hr'),
    resultRr: document.getElementById('result-rr'),
    resultHrTrimmed: document.getElementById('result-hr-trimmed'),
    resultRrTrimmed: document.getElementById('result-rr-trimmed'),
    chunkTableBody: document.getElementById('chunk-table-body'),
  };
  return els;
}

function confClass(conf) {
  if (conf == null) return '';
  if (conf >= CONFIDENCE_THRESHOLDS.VITAL_GOOD) return 'conf-good';
  if (conf >= CONFIDENCE_THRESHOLDS.VITAL_MODERATE) return 'conf-moderate';
  return 'conf-poor';
}

function formatConf(conf) {
  if (conf == null) return '--';
  return `${Math.round(conf * 100)}%`;
}

const uiRenderer = {
  setStatus(text) {
    getElements().status.textContent = text;
  },

  updateTimer(remainingSeconds) {
    const m = Math.floor(remainingSeconds / 60);
    const s = remainingSeconds % 60;
    getElements().timer.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  },

  updateLiveVitals(chunk) {
    const e = getElements();

    // Heart rate — use smoothed value for display, raw for confidence
    const displayHR = chunk.hrSmoothed ?? chunk.hr;
    e.hrValue.textContent = displayHR != null ? Math.round(displayHR) : '--';
    e.hrConf.textContent = formatConf(chunk.hrConf);
    e.hrConf.className = `vital-confidence ${confClass(chunk.hrConf)}`;

    // Respiratory rate — use smoothed value for display
    const displayRR = chunk.rrSmoothed ?? chunk.rr;
    e.rrValue.textContent = displayRR != null ? Math.round(displayRR) : '--';
    e.rrConf.textContent = formatConf(chunk.rrConf);
    e.rrConf.className = `vital-confidence ${confClass(chunk.rrConf)}`;

    // Chunk count & FPS
    e.liveFps.textContent = chunk.fps != null ? chunk.fps.toFixed(1) : '--';
  },

  updateChunkCount(count) {
    getElements().chunkCount.textContent = count;
  },

  updateWaveform(canvasEl, data, color) {
    const ctx = canvasEl.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvasEl.getBoundingClientRect();
    canvasEl.width = rect.width * dpr;
    canvasEl.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;

    // Clear
    ctx.clearRect(0, 0, w, h);

    if (!data || data.length < 2) {
      ctx.fillStyle = '#333';
      ctx.font = '13px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('Waiting for data...', w / 2, h / 2);
      return;
    }

    // Normalize data to canvas height
    let min = Infinity, max = -Infinity;
    for (const v of data) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const range = max - min || 1;

    // Draw grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const y = (h / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Draw waveform
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;

    ctx.beginPath();
    const step = w / (data.length - 1);
    for (let i = 0; i < data.length; i++) {
      const x = i * step;
      const y = h - ((data[i] - min) / range) * (h * 0.8) - h * 0.1;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  },

  updatePPGWaveform(data) {
    this.updateWaveform(getElements().ppgCanvas, data, '#00ff88');
  },

  updateRespWaveform(data) {
    this.updateWaveform(getElements().respCanvas, data, '#00aaff');
  },

  updateMetrics(metrics) {
    const e = getElements();
    e.metricFps.textContent = metrics.avgFps != null ? metrics.avgFps.toFixed(1) : '--';
    e.metricInterval.textContent = metrics.avgInterval != null ? `${metrics.avgInterval.toFixed(1)}s` : '--';
    e.metricTotalChunks.textContent = metrics.totalChunks;
    e.metricValidChunks.textContent = `${metrics.validChunks} (${metrics.totalChunks > 0 ? Math.round(metrics.validChunks / metrics.totalChunks * 100) : 0}%)`;
    e.metricFaceUptime.textContent = metrics.faceUptime != null ? `${Math.round(metrics.faceUptime)}%` : '--';
    e.metricWallTime.textContent = metrics.wallTime != null ? `${metrics.wallTime.toFixed(0)}s` : '--';
  },

  showWarning(msg) {
    const e = getElements();
    e.warningBanner.textContent = msg;
    e.warningBanner.classList.add('visible');
  },

  hideWarning() {
    getElements().warningBanner.classList.remove('visible');
  },

  showError(msg) {
    const e = getElements();
    e.errorBanner.textContent = msg;
    e.errorBanner.classList.add('visible');
  },

  hideError() {
    getElements().errorBanner.classList.remove('visible');
  },

  showResults(data) {
    const e = getElements();
    e.resultsOverlay.classList.add('visible');

    e.resultHr.textContent = data.finalHR != null ? Math.round(data.finalHR) : '--';
    e.resultRr.textContent = data.finalRR != null ? Math.round(data.finalRR) : '--';
    e.resultHrTrimmed.textContent = data.trimmedHR != null ? `Robust estimate: ${Math.round(data.trimmedHR)} BPM (trimmed mean)` : '';
    e.resultRrTrimmed.textContent = data.trimmedRR != null ? `Robust estimate: ${Math.round(data.trimmedRR)} RPM (trimmed mean)` : '';

    // Populate chunk table
    e.chunkTableBody.innerHTML = '';
    for (const chunk of data.chunks) {
      const tr = document.createElement('tr');
      const elapsed = (chunk.elapsedMs / 1000).toFixed(0);
      const m = Math.floor(elapsed / 60);
      const s = String(elapsed % 60).padStart(2, '0');
      tr.innerHTML = `
        <td>${chunk.index}</td>
        <td>${m}:${s}</td>
        <td>${chunk.hr != null ? Math.round(chunk.hr) : '--'}</td>
        <td class="${confClass(chunk.hrConf)}">${formatConf(chunk.hrConf)}</td>
        <td>${chunk.rr != null ? Math.round(chunk.rr) : '--'}</td>
        <td class="${confClass(chunk.rrConf)}">${formatConf(chunk.rrConf)}</td>
        <td>${chunk.fps != null ? chunk.fps.toFixed(1) : '--'}</td>
      `;
      e.chunkTableBody.appendChild(tr);
    }
  },

  hideResults() {
    getElements().resultsOverlay.classList.remove('visible');
  },

  resetAll() {
    const e = getElements();
    e.hrValue.textContent = '--';
    e.rrValue.textContent = '--';
    e.hrConf.textContent = '--';
    e.hrConf.className = 'vital-confidence';
    e.rrConf.textContent = '--';
    e.rrConf.className = 'vital-confidence';
    e.chunkCount.textContent = '0';
    e.liveFps.textContent = '--';
    e.status.textContent = 'Ready to scan';
    this.updateTimer(60);
    this.hideWarning();
    this.hideError();
    this.hideResults();
    this.updatePPGWaveform(null);
    this.updateRespWaveform(null);
    this.updateMetrics({ avgFps: null, avgInterval: null, totalChunks: 0, validChunks: 0, faceUptime: null, wallTime: null });
  },
};

export default uiRenderer;

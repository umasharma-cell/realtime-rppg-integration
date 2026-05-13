import { CONFIDENCE_THRESHOLDS } from './constants.js';

// Physiological sanity bounds
const HR_MIN = 40;
const HR_MAX = 180;
const RR_MIN = 6;
const RR_MAX = 35;

class VitalsTracker {
  constructor() {
    this.chunks = [];
    this.ppgBuffer = [];
    this.respBuffer = [];
    this.maxWaveformPoints = 500;
    this.sessionStartTime = null;
    // Smoothing window for display (median of last N valid values)
    this.recentHR = [];
    this.recentRR = [];
    this.smoothingWindow = 5;
  }

  addChunk(result) {
    if (!this.sessionStartTime) {
      this.sessionStartTime = Date.now();
    }

    let hr = result.vitals?.heart_rate?.value ?? null;
    let rr = result.vitals?.respiratory_rate?.value ?? null;
    let hrConf = this._extractConfidence(result.vitals?.heart_rate?.confidence);
    let rrConf = this._extractConfidence(result.vitals?.respiratory_rate?.confidence);

    // Sanity filter: reject physiologically impossible values
    if (hr != null && (hr < HR_MIN || hr > HR_MAX)) {
      hr = null;
      hrConf = null;
    }
    if (rr != null && (rr < RR_MIN || rr > RR_MAX)) {
      rr = null;
      rrConf = null;
    }

    // Track recent valid values for smoothing
    if (hr != null) {
      this.recentHR.push(hr);
      if (this.recentHR.length > this.smoothingWindow) this.recentHR.shift();
    }
    if (rr != null) {
      this.recentRR.push(rr);
      if (this.recentRR.length > this.smoothingWindow) this.recentRR.shift();
    }

    const chunk = {
      index: this.chunks.length + 1,
      timestamp: Date.now(),
      elapsedMs: Date.now() - this.sessionStartTime,
      hr,
      rr,
      hrConf,
      rrConf,
      // Smoothed values for display (median of recent readings)
      hrSmoothed: this._median(this.recentHR),
      rrSmoothed: this._median(this.recentRR),
      fps: result.fps ?? null,
    };

    this.chunks.push(chunk);

    // Append waveform data to rolling buffers
    const ppgData = result.waveforms?.ppg_waveform?.data;
    if (ppgData && ppgData.length > 0) {
      this.ppgBuffer.push(...ppgData);
      if (this.ppgBuffer.length > this.maxWaveformPoints) {
        this.ppgBuffer = this.ppgBuffer.slice(-this.maxWaveformPoints);
      }
    }

    const respData = result.waveforms?.respiratory_waveform?.data;
    if (respData && respData.length > 0) {
      this.respBuffer.push(...respData);
      if (this.respBuffer.length > this.maxWaveformPoints) {
        this.respBuffer = this.respBuffer.slice(-this.maxWaveformPoints);
      }
    }

    return chunk;
  }

  _extractConfidence(conf) {
    if (conf == null) return null;
    if (Array.isArray(conf)) {
      return conf.length > 0 ? conf.reduce((a, b) => a + b, 0) / conf.length : null;
    }
    return conf;
  }

  _median(arr) {
    if (arr.length === 0) return null;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  getLatest() {
    return this.chunks.length > 0 ? this.chunks[this.chunks.length - 1] : null;
  }

  getChunkCount() {
    return this.chunks.length;
  }

  getValidChunkCount() {
    return this.chunks.filter(c =>
      c.hr !== null && c.hrConf !== null && c.hrConf >= CONFIDENCE_THRESHOLDS.VITAL_GOOD
    ).length;
  }

  getAllChunks() {
    return this.chunks;
  }

  getPPGBuffer() {
    return this.ppgBuffer;
  }

  getRespBuffer() {
    return this.respBuffer;
  }

  // Confidence-weighted mean — primary aggregation method
  // Only uses chunks with valid (sanity-checked) values
  getWeightedAverage(field, confField) {
    let weightedSum = 0;
    let totalWeight = 0;

    for (const chunk of this.chunks) {
      const value = chunk[field];
      const conf = chunk[confField];
      if (value == null || conf == null || conf < CONFIDENCE_THRESHOLDS.VITAL_MODERATE) continue;
      weightedSum += value * conf;
      totalWeight += conf;
    }

    return totalWeight > 0 ? weightedSum / totalWeight : null;
  }

  getAverageHR() {
    return this.getWeightedAverage('hr', 'hrConf');
  }

  getAverageRR() {
    return this.getWeightedAverage('rr', 'rrConf');
  }

  // Trimmed mean — drop top/bottom 10%, then simple average
  getTrimmedMean(field, confField) {
    const valid = this.chunks
      .filter(c => c[field] != null && c[confField] != null && c[confField] >= CONFIDENCE_THRESHOLDS.VITAL_MODERATE)
      .map(c => c[field])
      .sort((a, b) => a - b);

    if (valid.length < 3) return this.getWeightedAverage(field, confField);

    const trimCount = Math.max(1, Math.floor(valid.length * 0.1));
    const trimmed = valid.slice(trimCount, valid.length - trimCount);

    if (trimmed.length === 0) return null;
    return trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
  }

  getTrimmedMeanHR() {
    return this.getTrimmedMean('hr', 'hrConf');
  }

  getTrimmedMeanRR() {
    return this.getTrimmedMean('rr', 'rrConf');
  }

  reset() {
    this.chunks = [];
    this.ppgBuffer = [];
    this.respBuffer = [];
    this.recentHR = [];
    this.recentRR = [];
    this.sessionStartTime = null;
  }
}

export default new VitalsTracker();

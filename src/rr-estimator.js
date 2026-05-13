/**
 * Local Respiratory Rate Estimator
 *
 * Derives respiratory rate from the PPG waveform.
 * Breathing modulates the heartbeat signal via:
 *   1. Respiratory Sinus Arrhythmia (RSA) — HR varies with breathing
 *   2. Baseline wander — chest movement shifts the PPG baseline
 *
 * Method: low-pass filter the PPG to isolate the 0.1–0.5 Hz respiratory band,
 * then count peaks to estimate breaths/min.
 */

class RREstimator {
  constructor() {
    this.ppgHistory = [];
    this.sampleRate = 30;
    this.minSamples = 180; // need ~6 seconds of data
    this.lastEstimate = null;
  }

  addPPGData(data) {
    if (!data || data.length === 0) return;
    this.ppgHistory.push(...data);
    // Keep last 20 seconds of data
    const maxSamples = this.sampleRate * 20;
    if (this.ppgHistory.length > maxSamples) {
      this.ppgHistory = this.ppgHistory.slice(-maxSamples);
    }
  }

  estimateRR() {
    if (this.ppgHistory.length < this.minSamples) return this.lastEstimate;

    const signal = this.ppgHistory;

    // Step 1: Remove DC offset
    const mean = signal.reduce((a, b) => a + b, 0) / signal.length;
    const centered = signal.map(v => v - mean);

    // Step 2: Apply a bandpass-like filter for respiratory frequencies
    // First, smooth heavily to remove heartbeat (keep only breathing)
    const windowSize = Math.round(this.sampleRate * 1.0); // 1-second window
    const smoothed = this._movingAverage(centered, windowSize);

    if (smoothed.length < 90) return this.lastEstimate;

    // Step 3: Find peaks in the smoothed signal
    const peaks = this._findPeaks(smoothed);

    if (peaks.length < 2) return this.lastEstimate;

    // Step 4: Calculate average peak-to-peak interval
    const intervals = [];
    for (let i = 1; i < peaks.length; i++) {
      intervals.push(peaks[i] - peaks[i - 1]);
    }

    // Remove outlier intervals (too short or too long)
    const medianInterval = this._median(intervals);
    const filteredIntervals = intervals.filter(
      v => v > medianInterval * 0.5 && v < medianInterval * 1.5
    );

    if (filteredIntervals.length === 0) return this.lastEstimate;

    const avgInterval = filteredIntervals.reduce((a, b) => a + b, 0) / filteredIntervals.length;
    const avgIntervalSec = avgInterval / this.sampleRate;
    const breathsPerMin = 60 / avgIntervalSec;

    // Sanity check: 6–30 breaths/min
    if (breathsPerMin < 6 || breathsPerMin > 30) return this.lastEstimate;

    this.lastEstimate = Math.round(breathsPerMin * 10) / 10;
    return this.lastEstimate;
  }

  getRespWaveform() {
    if (this.ppgHistory.length < this.minSamples) return null;

    const signal = this.ppgHistory;
    const mean = signal.reduce((a, b) => a + b, 0) / signal.length;
    const centered = signal.map(v => v - mean);
    const windowSize = Math.round(this.sampleRate * 1.0);
    const smoothed = this._movingAverage(centered, windowSize);

    // Downsample for display
    const step = Math.max(1, Math.floor(smoothed.length / 200));
    const downsampled = [];
    for (let i = 0; i < smoothed.length; i += step) {
      downsampled.push(smoothed[i]);
    }
    return downsampled;
  }

  getConfidence() {
    if (this.ppgHistory.length < this.minSamples) return 0;
    if (this.lastEstimate == null) return 0.1;
    const maxSamples = this.sampleRate * 20;
    return Math.min(0.7, (this.ppgHistory.length / maxSamples) * 0.7);
  }

  _movingAverage(data, windowSize) {
    if (data.length < windowSize || windowSize < 1) return data.slice();
    const result = [];
    let sum = 0;
    for (let i = 0; i < windowSize; i++) sum += data[i];
    result.push(sum / windowSize);
    for (let i = windowSize; i < data.length; i++) {
      sum += data[i] - data[i - windowSize];
      result.push(sum / windowSize);
    }
    return result;
  }

  _findPeaks(data) {
    const peaks = [];
    for (let i = 1; i < data.length - 1; i++) {
      if (data[i] > data[i - 1] && data[i] > data[i + 1]) {
        peaks.push(i);
      }
    }
    return peaks;
  }

  _median(arr) {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  reset() {
    this.ppgHistory = [];
    this.lastEstimate = null;
  }
}

export default new RREstimator();

import { CONFIDENCE_THRESHOLDS } from './constants.js';

class PerformanceMonitor {
  constructor() {
    this.chunkTimestamps = [];
    this.fpsReadings = [];
    this.faceLog = []; // {time, detected}
    this.startTime = null;
  }

  start() {
    this.startTime = Date.now();
  }

  recordChunk(chunk) {
    this.chunkTimestamps.push(Date.now());
    if (chunk.fps != null) {
      this.fpsReadings.push(chunk.fps);
    }
  }

  recordFaceStatus(detected) {
    this.faceLog.push({ time: Date.now(), detected });
  }

  getAverageFPS() {
    if (this.fpsReadings.length === 0) return null;
    return this.fpsReadings.reduce((a, b) => a + b, 0) / this.fpsReadings.length;
  }

  getAverageChunkInterval() {
    if (this.chunkTimestamps.length < 2) return null;
    const intervals = [];
    for (let i = 1; i < this.chunkTimestamps.length; i++) {
      intervals.push((this.chunkTimestamps[i] - this.chunkTimestamps[i - 1]) / 1000);
    }
    return intervals.reduce((a, b) => a + b, 0) / intervals.length;
  }

  getTotalChunks() {
    return this.chunkTimestamps.length;
  }

  getFaceUptime() {
    if (this.faceLog.length === 0) return null;

    let detectedTime = 0;
    let totalTime = 0;

    for (let i = 1; i < this.faceLog.length; i++) {
      const dt = this.faceLog[i].time - this.faceLog[i - 1].time;
      totalTime += dt;
      if (this.faceLog[i - 1].detected) {
        detectedTime += dt;
      }
    }

    return totalTime > 0 ? (detectedTime / totalTime) * 100 : null;
  }

  getWallTime() {
    if (!this.startTime) return null;
    return (Date.now() - this.startTime) / 1000;
  }

  getSummary(validChunks) {
    return {
      avgFps: this.getAverageFPS(),
      avgInterval: this.getAverageChunkInterval(),
      totalChunks: this.getTotalChunks(),
      validChunks: validChunks,
      faceUptime: this.getFaceUptime(),
      wallTime: this.getWallTime(),
    };
  }

  reset() {
    this.chunkTimestamps = [];
    this.fpsReadings = [];
    this.faceLog = [];
    this.startTime = null;
  }
}

export default new PerformanceMonitor();

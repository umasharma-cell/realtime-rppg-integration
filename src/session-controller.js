import { SESSION_DURATION, FACE_LOSS_PAUSE_DELAY, MAX_WALL_TIME } from './constants.js';

class SessionController {
  constructor() {
    this.state = 'idle'; // idle | initializing | searching | warmingUp | scanning | completed | error
    this.remainingSeconds = SESSION_DURATION;
    this.timerInterval = null;
    this.wallStartTime = null;
    this.faceLostTime = null;
    this.isPausedForFaceLoss = false;

    // Callbacks
    this._onStateChange = null;
    this._onTimerTick = null;
    this._onSessionComplete = null;
  }

  onStateChange(cb) { this._onStateChange = cb; }
  onTimerTick(cb) { this._onTimerTick = cb; }
  onSessionComplete(cb) { this._onSessionComplete = cb; }

  _setState(newState) {
    const prev = this.state;
    this.state = newState;
    console.log(`[Session] ${prev} → ${newState}`);
    if (this._onStateChange) this._onStateChange(newState, prev);
  }

  startInitializing() {
    this.remainingSeconds = SESSION_DURATION;
    this.wallStartTime = Date.now();
    this.faceLostTime = null;
    this.isPausedForFaceLoss = false;
    this._setState('initializing');
  }

  handleSDKReady() {
    if (this.state === 'initializing') {
      this._setState('searching');
    }
  }

  handleFaceDetected(hasFace) {
    if (hasFace) {
      // Face found — clear face loss tracking
      if (this.isPausedForFaceLoss) {
        this.isPausedForFaceLoss = false;
        this._resumeTimer();
      }
      this.faceLostTime = null;

      if (this.state === 'searching') {
        this._setState('warmingUp');
      }
    } else {
      // Face lost
      if (!this.faceLostTime) {
        this.faceLostTime = Date.now();
      }
    }
  }

  // Called every ~1s during scanning to check face loss timeout
  checkFaceLoss() {
    if (this.state !== 'scanning') return false;
    if (this.faceLostTime && !this.isPausedForFaceLoss) {
      const lostDuration = (Date.now() - this.faceLostTime) / 1000;
      if (lostDuration >= FACE_LOSS_PAUSE_DELAY) {
        this.isPausedForFaceLoss = true;
        this._pauseTimer();
        return true; // signal: timer is now paused
      }
    }
    return false;
  }

  handleFirstVitals() {
    if (this.state === 'warmingUp' || this.state === 'searching') {
      this._setState('scanning');
      this._startTimer();
    }
  }

  _startTimer() {
    if (this.timerInterval) return;
    this.timerInterval = setInterval(() => {
      this.remainingSeconds--;
      if (this._onTimerTick) this._onTimerTick(this.remainingSeconds);

      // Check wall-clock cap
      const wallElapsed = (Date.now() - this.wallStartTime) / 1000;
      if (wallElapsed >= MAX_WALL_TIME) {
        this._completeSession();
        return;
      }

      if (this.remainingSeconds <= 0) {
        this._completeSession();
      }
    }, 1000);
  }

  _pauseTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  _resumeTimer() {
    if (this.state === 'scanning' && !this.timerInterval) {
      this._startTimer();
    }
  }

  _completeSession() {
    this._pauseTimer();
    this.remainingSeconds = 0;
    if (this._onTimerTick) this._onTimerTick(0); // show 00:00
    this._setState('completed');
    if (this._onSessionComplete) this._onSessionComplete();
  }

  setError() {
    this._pauseTimer();
    this._setState('error');
  }

  getState() { return this.state; }
  getRemainingSeconds() { return this.remainingSeconds; }
  getWallElapsed() { return this.wallStartTime ? (Date.now() - this.wallStartTime) / 1000 : 0; }
  isPaused() { return this.isPausedForFaceLoss; }

  reset() {
    this._pauseTimer();
    this.state = 'idle';
    this.remainingSeconds = SESSION_DURATION;
    this.wallStartTime = null;
    this.faceLostTime = null;
    this.isPausedForFaceLoss = false;
  }
}

export default new SessionController();

# Development Phases — Near Real-Time rPPG Integration

> A single document covering all 5 phases of the build: decisions, pros/cons, flow diagrams, and what happens in each phase.

---

## Table of Contents

1. [Phase 1: Foundation — Project Setup + SDK Integration + Webcam](#phase-1-foundation)
2. [Phase 2: Real-Time Display — Live Vitals + Chunk Tracking + Waveforms](#phase-2-real-time-display)
3. [Phase 3: Session Management — Timer + State Machine + Aggregation](#phase-3-session-management)
4. [Phase 4: Robustness — Performance Metrics + Edge Cases + Polish](#phase-4-robustness)
5. [Phase 5: Ship — Testing + Documentation + Deployment](#phase-5-ship)

---

# Phase 1: Foundation

## Goal
Set up the project from scratch, integrate the WiseAI SDK, and prove we can open a webcam and receive vitals events.

## What Gets Built

| File | Purpose |
|------|---------|
| `package.json` | Project manifest — Vite as only dev dependency |
| `vite.config.js` | Static serving of SDK from `public/` |
| `index.html` | Minimal page: video element, start/stop buttons, status text |
| `src/constants.js` | API key, method config, session duration |
| `src/sdk-manager.js` | Wraps WiseAI SDK: init, start, stop, event forwarding |
| `src/main.js` | Entry point — wires button clicks to SDK manager |
| `style.css` | Basic dark-theme layout |
| `public/wiseai-sdk/` | Entire SDK bundle (served as static files) |

## Decisions

### Decision 1: Tech Stack

**Chosen:** Vite + Vanilla JavaScript (ES Modules)

| Option | Pros | Cons |
|--------|------|------|
| **Vite + Vanilla JS** | Zero config, native ES module support matches SDK, instant HMR, `vite build` for deploy, clean readable code | No component framework — manual DOM updates |
| Plain HTML + `npx serve` | Zero tooling | No HMR, no bundling, fragile import paths |
| React / Next.js | Component model, state mgmt | Overkill for prototype, obscures SDK integration behind boilerplate |

**Why:** SDK ships as a browser ES module. Vite handles this natively. Assignment evaluates *integration skill and code clarity* — a framework adds noise.

### Decision 2: SDK Placement

**Chosen:** Copy `wiseai-sdk/` into Vite's `public/` directory

| Option | Pros | Cons |
|--------|------|------|
| **`public/wiseai-sdk/`** | Serves as-is, preserves SDK's internal worker/WASM URLs | Manual copy step |
| npm link / node_modules | Standard dependency mgmt | SDK isn't an npm package; workers use relative URLs that break through Vite's pipeline |
| Import into `src/` | Could tree-shake | Worker blob URLs would fail |

**Why:** SDK's `wiseai-sdk.browser.js` spawns Web Workers and loads WASM using `import.meta.url`-relative paths. Vite's `public/` serves without transformation — preserves these paths.

### Decision 3: SDK Method

**Chosen:** `method: 'wiseai'` (cloud AI)

| Option | Supports HR | Supports RR | Accuracy | Needs API Key |
|--------|:-----------:|:-----------:|:--------:|:------------:|
| **`'wiseai'` (cloud)** | Yes | Yes | Highest | Yes |
| `'pos'` (local) | Yes | No | Medium | No |
| `'chrom'` (local) | Yes | No | Medium | No |
| `'g'` (local) | Yes | No | Low | No |

**Why:** Assignment requires both HR AND RR. Local methods only support HR — no respiratory rate. Cloud method is the only option for full feature set.

### Decision 4: SDK Wrapper Pattern

**Chosen:** Facade pattern in `sdk-manager.js`

**Why:** Isolates all SDK interaction in one file. Business logic never touches SDK directly. Clean API: `init()`, `start()`, `stop()`, `onVitals()`, `onFaceDetected()`.

## Flow Diagram

```
┌─────────────────────────────────────────────────────────┐
│                  USER CLICKS "START"                     │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  main.js                                                 │
│                                                          │
│  1. sdkManager.init({ method: 'wiseai', apiKey: KEY })  │
│  2. Register callbacks: onVitals(), onFaceDetected()     │
│  3. sdkManager.start(videoElement)                       │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  sdk-manager.js                                          │
│                                                          │
│  init():                                                 │
│    wiseai = new WiseAI({ method, apiKey })               │
│                                                          │
│  start(videoEl):                                         │
│    1. stream = getUserMedia({ video: true })             │
│    2. videoEl.srcObject = stream                         │
│    3. wiseai.setVideoStream(stream, videoEl)             │
│    4. wiseai.addEventListener('vitals', cb)              │
│    5. wiseai.addEventListener('faceDetected', cb)        │
│    6. wiseai.addEventListener('streamReset', cb)         │
│    7. wiseai.startVideoStream()                          │
│                                                          │
│  stop():                                                 │
│    1. wiseai.stopVideoStream()                           │
│    2. stream.getTracks().forEach(t => t.stop())          │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  WiseAI SDK (internal pipeline)                          │
│                                                          │
│  Camera Stream                                           │
│      ▼                                                   │
│  StreamFrameIterator (captures frames at target FPS)    │
│      ▼                                                   │
│  Face Detection Worker (finds face ROI)                  │
│      ▼                                                   │
│  BufferManager (batches frames for prediction)           │
│      ▼                                                   │
│  VitalLensAPIHandler (sends to cloud AI)                 │
│      ▼                                                   │
│  Session + SessionAdapter (processes result)             │
│      ▼                                                   │
│  FIRES 'vitals' EVENT ──────────────────────────┐       │
└─────────────────────────────────────────────────│───────┘
                                                  │
                                                  ▼
┌─────────────────────────────────────────────────────────┐
│  CONSOLE OUTPUT (Phase 1 proof-of-life)                  │
│                                                          │
│  { vitals: {                                             │
│      heart_rate: { value: 72, confidence: 0.91 },        │
│      respiratory_rate: { value: 16, confidence: 0.87 }   │
│    },                                                    │
│    waveforms: { ppg_waveform: {...}, resp_waveform: {...}│
│    },                                                    │
│    fps: 15.2                                             │
│  }                                                       │
└─────────────────────────────────────────────────────────┘
```

## Exit Criteria

- `npm run dev` serves the app at localhost
- Click "Start" → webcam opens → console prints vitals with HR and RR values
- Click "Stop" → stream shuts down, camera released
- No errors in browser console

---

# Phase 2: Real-Time Display

## Goal
Take the raw vitals events from Phase 1 and render them as a live dashboard: HR/RR cards, confidence indicators, scrolling waveform canvases, and chunk counter.

## What Gets Built

| File | Purpose |
|------|---------|
| `src/vitals-tracker.js` | Stores each chunk's HR/RR/confidence/timestamp; computes running averages |
| `src/ui-renderer.js` | All DOM updates — vitals cards, waveforms, status indicators |
| `index.html` (updated) | Full layout: vitals cards, waveform canvases, status panel |
| `style.css` (updated) | Dark medical monitor theme, confidence color coding |

## Decisions

### Decision 5: What Is a "Chunk"?

**Chosen:** Each SDK `vitals` event = one chunk

| Option | Pros | Cons |
|--------|------|------|
| **Each vitals event = 1 chunk** | Simple, natural, SDK handles windowing internally | Chunk frequency depends on SDK internals (~4s intervals) |
| Manual time-based windows (e.g. every 5s) | Predictable intervals | Fights against SDK's own buffering, could miss or duplicate data |
| Accumulate N frames then aggregate | Full control | Reinventing what the SDK already does |

**Why:** The SDK fires `vitals` events when its internal buffer has enough frames for a prediction. This is the natural "chunk" boundary. No artificial windowing needed.

### Decision 6: Confidence Thresholds

**Chosen:** Match SDK's own thresholds from `VitalLensBase.js`

| Threshold | Value | Visual |
|-----------|-------|--------|
| Vital confidence (good) | >= 0.8 | Green glow |
| Vital confidence (moderate) | 0.5 – 0.8 | Yellow/amber |
| Vital confidence (poor) | < 0.5 | Red, value dimmed |
| Face confidence (minimum) | >= 0.5 | Face detected |

### Decision 7: Waveform Rendering

**Chosen:** Raw Canvas 2D API

| Option | Pros | Cons |
|--------|------|------|
| **Canvas 2D API** | Zero dependencies, full control, ~30 lines of code, lightweight | Must implement scrolling manually |
| Chart.js | Axes, tooltips, responsive | 200KB+ dependency for a simple line, overkill |
| SVG polyline | Declarative | Slow for real-time updates with many points |

**Why:** We need a simple scrolling line. The SDK gives us `ppg_waveform.data` (array of floats). Drawing a polyline on canvas is trivial. Zero dependencies keeps the bundle clean.

## Flow Diagram

```
┌─────────────────────────────────────────────────────────┐
│  SDK fires 'vitals' event                                │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  vitals-tracker.js — addChunk(result)                    │
│                                                          │
│  Extract from result:                                    │
│  ├── heart_rate.value, heart_rate.confidence              │
│  ├── respiratory_rate.value, respiratory_rate.confidence  │
│  ├── ppg_waveform.data[]                                 │
│  ├── respiratory_waveform.data[]                         │
│  ├── fps                                                 │
│  └── timestamp = Date.now()                              │
│                                                          │
│  Store in chunks[] array                                 │
│                                                          │
│  Compute:                                                │
│  ├── getLatestHR() → most recent chunk's HR              │
│  ├── getLatestRR() → most recent chunk's RR              │
│  ├── getAverageHR() → confidence-weighted mean           │
│  └── getAverageRR() → confidence-weighted mean           │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  ui-renderer.js — updateLiveVitals()                     │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  HR Card      │  │  RR Card      │  │  Status      │  │
│  │  ♥ 72 BPM    │  │  ♦ 16 RPM    │  │  Chunks: 8   │  │
│  │  Conf: 91%   │  │  Conf: 87%   │  │  FPS: 15.2   │  │
│  │  [GREEN]     │  │  [GREEN]     │  │              │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                                                          │
│  updateWaveforms():                                      │
│  ┌──────────────────────────────────────────────────┐   │
│  │  PPG Waveform (Canvas)                            │   │
│  │  ∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿──→       │   │
│  │  (scrolls left as new data arrives)               │   │
│  └──────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Respiratory Waveform (Canvas)                    │   │
│  │  ∼∼∼∼∼∼∼∼∼∼∼∼∼∼∼∼∼∼∼∼∼∼∼∼∼∼∼∼∼∼∼∼∼∼──→       │   │
│  │  (slower wave, each cycle = 1 breath)             │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## UI Layout

```
+------------------------------------------------------------------+
|  Near Real-Time rPPG Vital Signs Monitor           [dark theme]   |
+------------------------------------------------------------------+
|                                                                    |
|   ┌─────────────────────┐    ┌────────────────────────────────┐   |
|   │                     │    │  Status: Scanning...            │   |
|   │    Webcam Feed      │    │  Time: --:-- / 01:00           │   |
|   │    <video>          │    │  Chunks received: 0            │   |
|   │                     │    │                                │   |
|   └─────────────────────┘    └────────────────────────────────┘   |
|                                                                    |
|   ┌──────────────┐           ┌──────────────┐                     |
|   │  ♥ Heart Rate │           │  ♦ Resp Rate  │                    |
|   │    72 BPM     │           │    16 RPM     │                    |
|   │  Conf: 91%    │           │  Conf: 87%    │                    |
|   │  ████████░░   │           │  ███████░░░   │                    |
|   └──────────────┘           └──────────────┘                     |
|                                                                    |
|   PPG Waveform:                                                    |
|   ┌────────────────────────────────────────────────────────────┐  |
|   │ ∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿  │  |
|   └────────────────────────────────────────────────────────────┘  |
|   Respiratory Waveform:                                            |
|   ┌────────────────────────────────────────────────────────────┐  |
|   │ ∼∼∼∼∼∼∼∼∼∼∼∼∼∼∼∼∼∼∼∼∼∼∼∼∼∼∼∼∼∼∼∼∼∼∼∼∼∼∼∼∼∼∼∼∼∼∼∼∼∼  │  |
|   └────────────────────────────────────────────────────────────┘  |
|                                                                    |
|   [ Start Scan ]                [ Stop ]                           |
+------------------------------------------------------------------+
```

## Exit Criteria

- HR and RR values update live on screen as each chunk arrives
- Confidence displayed with color coding (green/yellow/red)
- PPG and respiratory waveforms scroll across canvas in real-time
- Chunk count increments visibly with each SDK event

---

# Phase 3: Session Management

## Goal
Add a 60-second timed session with clear start→warmup→scanning→completed states, and final BPM aggregation with a results screen.

## What Gets Built

| File | Purpose |
|------|---------|
| `src/session-controller.js` | State machine + 60-second countdown timer |
| `src/ui-renderer.js` (updated) | Results overlay, countdown display, state-specific UI |
| `index.html` (updated) | Results section (hidden until session complete) |

## Decisions

### Decision 8: State Machine Design

**Chosen:** 7-state machine

```
  idle ──→ initializing ──→ searching ──→ warmingUp ──→ scanning ──→ completed
                │                                           │
                └───────────────────→ error ←───────────────┘
```

| State | What's happening | UI shows |
|-------|-----------------|----------|
| `idle` | Nothing running | "Start" button |
| `initializing` | Getting camera + SDK setup | Spinner |
| `searching` | SDK running, no face found yet | "Position your face..." |
| `warmingUp` | Face found, SDK calibrating (~5-8s) | "Calibrating... hold still" |
| `scanning` | Valid vitals flowing, timer counting | Live vitals + countdown |
| `completed` | Timer hit 0, SDK stopped | Results screen |
| `error` | Camera denied / API error | Error message |

### Decision 9: When Does the 60-Second Timer Start?

**Chosen:** On first vitals event where `heart_rate.value` exists

| Option | Pros | Cons |
|--------|------|------|
| When camera opens | Simple, predictable | First 5-10s have no data (warmup), wastes time |
| **On first vitals event with HR value** | All 60 seconds capture actual data | Timer start is slightly delayed |
| On first high-confidence chunk (>= 0.8) | Only counts quality time | May never start in poor lighting |

**Why:** Practical middle ground. User sees "Calibrating..." during warmup, then the countdown begins the moment real measurements start flowing. All 60 seconds are useful.

### Decision 10: Final BPM Aggregation Strategy

**Chosen:** Confidence-weighted mean (primary) + Trimmed mean (secondary)

| Method | Formula | Pros | Cons |
|--------|---------|------|------|
| **Confidence-weighted mean** | `Σ(value × conf) / Σ(conf)` | Leverages SDK's confidence scoring, noisy readings contribute less | Assumes confidence is well-calibrated |
| Simple mean | `Σ(value) / N` | Simple | All chunks equal, noisy ones corrupt result |
| Median | Middle value | Robust to outliers | Ignores confidence entirely |
| **Trimmed mean** | Drop top/bottom 10%, then average | Removes outliers | Loses edge data |

**Why:** Confidence-weighted mean is the primary display because it directly uses the SDK's quality signal. Trimmed mean is shown as a secondary "robust estimate" for comparison. Together they demonstrate understanding of the aggregation problem.

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                     SESSION LIFECYCLE                                 │
└─────────────────────────────────────────────────────────────────────┘

  User clicks "Start"
        │
        ▼
  ┌─────────────┐     getUserMedia +     ┌─────────────┐
  │    IDLE      │────SDK init()────────→│ INITIALIZING │
  └─────────────┘                        └──────┬──────┘
                                                │
                                     SDK ready, processing starts
                                                │
                                                ▼
                                         ┌─────────────┐
                              ┌─────────│  SEARCHING   │
                              │          └──────┬──────┘
                              │                 │
                              │      faceDetected event (face found)
                              │                 │
                              │                 ▼
                              │          ┌─────────────┐
                              │          │  WARMING UP  │
                              │          │ "Calibrating"│
                              │          └──────┬──────┘
                              │                 │
                              │      First vitals event with HR value
                              │                 │
                              │                 ▼
                              │          ┌─────────────┐
                              │          │   SCANNING   │←─── Timer: 60s → 0s
                              │          │  Live vitals │     (1s intervals)
                              │          └──────┬──────┘
                              │                 │
                              │           Timer reaches 0
                              │                 │
                              │                 ▼
                              │          ┌─────────────┐
                              │          │  COMPLETED   │
                              │          │  Show results│
                              │          └──────┬──────┘
                              │                 │
                              │          User clicks "New Session"
                              │                 │
                              │                 ▼
                              │          Back to IDLE
                              │
                    Error at any point
                              │
                              ▼
                       ┌─────────────┐
                       │    ERROR     │
                       │ Show message │
                       └─────────────┘


  ┌─────────────────────────────────────────────────────────┐
  │  DURING SCANNING STATE (every vitals event):            │
  │                                                         │
  │  vitals event ──→ vitalsTracker.addChunk(result)        │
  │                       │                                 │
  │                       ├──→ uiRenderer.updateLiveVitals()│
  │                       ├──→ uiRenderer.updateWaveforms() │
  │                       └──→ uiRenderer.updateChunkCount()│
  │                                                         │
  │  Every 1 second ──→ sessionController.tick()            │
  │                       │                                 │
  │                       └──→ uiRenderer.updateTimer()     │
  └─────────────────────────────────────────────────────────┘


  ┌─────────────────────────────────────────────────────────┐
  │  ON COMPLETED:                                          │
  │                                                         │
  │  1. sdkManager.stop()                                   │
  │  2. finalHR = vitalsTracker.getAverageHR()              │
  │     finalRR = vitalsTracker.getAverageRR()              │
  │  3. trimmedHR = vitalsTracker.getTrimmedMeanHR()        │
  │     trimmedRR = vitalsTracker.getTrimmedMeanRR()        │
  │  4. uiRenderer.showResults({                            │
  │       finalHR, finalRR, trimmedHR, trimmedRR,           │
  │       chunks: vitalsTracker.getAllChunks(),              │
  │       chunkCount: vitalsTracker.getChunkCount()         │
  │     })                                                  │
  └─────────────────────────────────────────────────────────┘
```

## Results Screen Layout

```
+------------------------------------------------------------------+
|                    SESSION COMPLETE                                |
+------------------------------------------------------------------+
|                                                                    |
|   ┌──────────────────────┐     ┌──────────────────────┐          |
|   │  Final Heart Rate    │     │  Final Resp Rate     │          |
|   │      72 BPM          │     │      16 RPM          │          |
|   │  (weighted avg)      │     │  (weighted avg)      │          |
|   │  Robust: 71 BPM      │     │  Robust: 15 RPM      │          |
|   │  (trimmed mean)      │     │  (trimmed mean)      │          |
|   └──────────────────────┘     └──────────────────────┘          |
|                                                                    |
|   Chunk History (15 chunks over 60 seconds):                      |
|   ┌──────┬───────┬────────┬──────────┬────────┬──────────┐       |
|   │  #   │ Time  │   HR   │ HR Conf  │   RR   │ RR Conf  │       |
|   ├──────┼───────┼────────┼──────────┼────────┼──────────┤       |
|   │  1   │ 0:04  │ 74 bpm │   0.91   │ 17 rpm │   0.85   │       |
|   │  2   │ 0:08  │ 71 bpm │   0.88   │ 16 rpm │   0.82   │       |
|   │  3   │ 0:12  │ 73 bpm │   0.93   │ 15 rpm │   0.89   │       |
|   │ ...  │  ...  │  ...   │   ...    │  ...   │   ...    │       |
|   │  15  │ 0:58  │ 70 bpm │   0.90   │ 16 rpm │   0.86   │       |
|   └──────┴───────┴────────┴──────────┴────────┴──────────┘       |
|                                                                    |
|   [ Start New Session ]                                            |
+------------------------------------------------------------------+
```

## Exit Criteria

- Full 60-second session runs start to completion
- Timer only starts after first real vitals arrive
- Countdown visible (60 → 0)
- Final aggregated HR/RR displayed (weighted + trimmed)
- Chunk history table shows all recorded measurements
- "Start New Session" resets everything cleanly

---

# Phase 4: Robustness

## Goal
Add performance instrumentation, handle all edge cases gracefully, and polish the dark theme UI.

## What Gets Built

| File | Purpose |
|------|---------|
| `src/performance-monitor.js` | Tracks FPS, chunk intervals, face uptime, valid chunk ratio |
| `src/sdk-manager.js` (updated) | streamReset reconnect, face-lost handling |
| `src/ui-renderer.js` (updated) | Metrics panel, error toasts, warning banners |
| `style.css` (updated) | Responsive layout, glow animations, polished dark theme |

## Decisions

### Decision 11: Performance Metrics to Track

**Chosen:** 7 key metrics

| Metric | How We Get It | Why It Matters |
|--------|--------------|----------------|
| **Effective FPS** | `result.fps` from each vitals event | Shows if camera/processing keeps up |
| **Avg chunk interval** | `Date.now()` delta between consecutive events | Shows how often vitals update (~4s expected) |
| **Min/Max chunk interval** | Track extremes | Reveals jitter or stalls |
| **Total chunks** | Counter | Overall data volume |
| **Valid chunk ratio** | Chunks with conf >= 0.8 / total | Data quality metric |
| **Face detection uptime** | % of time face was detected | Environmental quality |
| **Session wall-clock time** | Total elapsed including warmup | Real-world time cost |

### Decision 12: Edge Case Handling

| Edge Case | Detection | Response |
|-----------|-----------|----------|
| **No face detected** | `faceDetected` event with null/empty | Warning banner: "Position your face in frame" |
| **Face lost > 5s** | Track continuous face-loss duration | Pause timer, show "Paused — face lost" |
| **Stream reset** | `streamReset` SDK event | Auto-reconnect: stop → wait 3s → re-acquire camera → restart. Keep collected chunks. |
| **Low confidence** | `confidence < 0.5` | Show value dimmed/grey, exclude from final weighted average |
| **Camera denied** | `getUserMedia` rejection | Error state: "Camera access denied. Please allow camera." |
| **API key error** | `WiseAIAPIKeyError` thrown | Error state: "Invalid API key" |
| **Quota exceeded** | `WiseAIAPIQuotaExceededError` | Error state: "API quota exceeded" |
| **Tab hidden** | `document.visibilitychange` | Pause SDK processing, resume on tab return |

### Decision 13: Timer Behavior During Face Loss

**Chosen:** Pause timer after 5 consecutive seconds of no face, resume on return. Cap at 120s wall time.

| Option | Pros | Cons |
|--------|------|------|
| Keep timer running | Simple, predictable 60s | May end with very few valid chunks |
| Pause immediately on face loss | Maximizes data quality | Brief glances away pause session |
| **Pause after 5s, cap at 120s** | Tolerates brief face loss, prevents infinite sessions | Slightly more logic |

**Why:** Brief face losses (look away, adjust position) are normal. Pausing immediately would be annoying. But if the face is truly gone for 5+ seconds, something is wrong — pause and wait. 120s cap prevents infinite sessions.

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                    EDGE CASE HANDLING FLOWS                          │
└─────────────────────────────────────────────────────────────────────┘

=== FACE LOSS HANDLING ===

  Normal scanning
        │
  faceDetected(null) ──→ Start face-loss timer
        │                     │
        │               < 5 seconds?
        │                 │        │
        │               YES        NO
        │                 │        │
        │           Show warning   Pause 60s timer
        │           "Reposition"   Show "PAUSED"
        │                          │
  faceDetected(face) ────────────→ Resume timer
                                   Clear warning


=== STREAM RESET / AUTO-RECONNECT ===

  SDK fires 'streamReset'
        │
        ▼
  1. wiseai.stopVideoStream()
  2. Show "Reconnecting..." toast
  3. Wait 3 seconds
        │
        ▼
  4. stream = getUserMedia()     ← re-acquire camera
  5. wiseai = new WiseAI(opts)   ← fresh SDK instance
  6. wiseai.setVideoStream()
  7. Re-attach event listeners
  8. wiseai.startVideoStream()
  9. Hide toast, resume session
        │
  NOTE: vitalsTracker keeps all existing chunks
        sessionController resumes timer from where it was


=== TAB VISIBILITY ===

  document.visibilitychange
        │
        ├── hidden ──→ sdkManager.pause()
        │              Pause timer
        │
        └── visible ──→ sdkManager.resume()
                        Resume timer


=== PERFORMANCE METRICS PANEL ===

  ┌─────────────────────────────────┐
  │  Performance Metrics             │
  │  ───────────────────────────── │
  │  Effective FPS:      15.2       │
  │  Avg chunk interval: 4.1s      │
  │  Total chunks:       15         │
  │  Valid chunks:       13 (87%)   │
  │  Face uptime:        94%        │
  │  Wall-clock time:    68s        │
  │  Active scan time:   60s        │
  └─────────────────────────────────┘
```

## Exit Criteria

- Performance metrics panel visible during and after session
- Face loss triggers visible warning and timer pause after 5s
- Face return resumes scanning seamlessly
- Stream reset triggers auto-reconnect (preserves chunks)
- Low confidence values visually distinguished
- Camera denied shows helpful error message
- Tab switch pauses/resumes correctly
- Dark theme polished with glow effects and animations

---

# Phase 5: Ship

## Goal
Finalize documentation, verify the build, run through the test matrix, and prepare for deployment.

## What Gets Built

| File | Purpose |
|------|---------|
| `README.md` | Full setup instructions, architecture, usage, deployment guide |
| `vite.config.js` (verified) | `vite build` produces deployable static dist/ |

## Decisions

### Decision 14: Deployment Target

**Chosen:** Static site (GitHub Pages or any HTTPS host)

| Option | Pros | Cons |
|--------|------|------|
| **GitHub Pages** | Free, HTTPS built-in, auto-deploy from git | Requires public repo or Pro plan |
| Vercel | Auto-deploy, HTTPS, preview URLs | Requires account |
| Netlify | Drag-and-drop deploy, HTTPS | Requires account |
| Local only | No deploy needed | Only works on dev machine |

**Why:** The app is fully client-side — SDK calls cloud API, no backend. Any static host with HTTPS works. `getUserMedia` requires HTTPS in production (localhost is exempt during development).

### Decision 15: Testing Strategy

**Chosen:** Manual test matrix (no automated tests)

**Why:** Automated testing of webcam + cloud SDK is impractical for a prototype — you'd need to mock the camera, mock the API, and the value of such tests is low for a time-boxed assignment. Instead, a thorough manual checklist covers all scenarios.

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                    DEPLOYMENT PIPELINE                                │
└─────────────────────────────────────────────────────────────────────┘

  Developer machine
        │
        ▼
  npm run build
        │
        ▼
  Vite produces dist/
  ├── index.html
  ├── assets/
  │   ├── main-[hash].js
  │   └── style-[hash].css
  └── wiseai-sdk/          ← copied from public/ as-is
      ├── wiseai-sdk.browser.js
      ├── models/
      ├── workers/
      └── ...
        │
        ▼
  Deploy dist/ to any static HTTPS host
  (GitHub Pages, Vercel, Netlify, npx serve)
        │
        ▼
  User opens https://your-app.com
        │
        ▼
  Browser loads index.html → imports main.js → loads SDK
        │
        ▼
  SDK calls cloud API (api.rouast.com) for predictions
  (no backend needed — all client-side)
```

## Manual Test Matrix

| # | Scenario | Expected Behavior | Status |
|---|----------|-------------------|--------|
| 1 | Happy path: full 60s session | Timer counts down, vitals display, results shown | |
| 2 | Face absent at start | Shows "Position your face" message | |
| 3 | Face lost mid-session (cover camera) | Warning after 5s, timer pauses | |
| 4 | Face returns after loss | Warning clears, timer resumes | |
| 5 | Poor lighting | Lower confidence values, yellow indicators | |
| 6 | Camera permission denied | Error state: "Camera access denied" | |
| 7 | Tab switch during session | Pauses processing, resumes on return | |
| 8 | Multiple consecutive sessions | Clean reset, no state leakage | |
| 9 | Start and immediately stop | Graceful shutdown, no errors | |

## Exit Criteria

- README.md provides complete setup and usage instructions
- `npm run build` produces deployable static files
- All items in test matrix pass
- Code is clean with descriptive variable/function names
- Flow documentation is complete (this file)

---

# Summary: Full System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     APPLICATION ARCHITECTURE                         │
└─────────────────────────────────────────────────────────────────────┘

  index.html (entry point)
       │
       └──→ main.js (orchestrator)
              │
              ├──→ constants.js (config)
              │
              ├──→ sdk-manager.js ──────→ WiseAI SDK (public/wiseai-sdk/)
              │     │                          │
              │     │  Callbacks:               │  Cloud API
              │     │  onVitals()               │  (api.rouast.com)
              │     │  onFaceDetected()         │
              │     │  onStreamReset()          │
              │     │                           │
              ├──→ session-controller.js        │
              │     │                           │
              │     │  State: idle→scanning→done│
              │     │  Timer: 60s countdown     │
              │     │                           │
              ├──→ vitals-tracker.js            │
              │     │                           │
              │     │  chunks[] storage         │
              │     │  Weighted avg aggregation │
              │     │  Trimmed mean             │
              │     │                           │
              ├──→ performance-monitor.js       │
              │     │                           │
              │     │  FPS, intervals, uptime   │
              │     │                           │
              └──→ ui-renderer.js              │
                    │                           │
                    │  DOM updates              │
                    │  Waveform canvas          │
                    │  Results table            │
                    │  Error toasts             │
                    │                           │
                    ▼                           │
              ┌───────────┐                    │
              │  Browser   │ ◄─────────────────┘
              │  (User)    │   vitals events
              └───────────┘
```

## Module Dependencies

```
main.js
  ├── imports constants.js
  ├── imports sdk-manager.js
  │     └── imports WiseAI from /wiseai-sdk/wiseai-sdk.browser.js
  ├── imports session-controller.js
  ├── imports vitals-tracker.js
  ├── imports performance-monitor.js
  └── imports ui-renderer.js
```

## Data Flow (Single Vitals Event)

```
Camera Frame → SDK Pipeline → Cloud API → vitals event
                                              │
                                              ▼
                               ┌── vitals-tracker.addChunk()
                               │      │
                               │      └── stores {hr, rr, conf, waveform, time}
                               │
                               ├── performance-monitor.recordChunk()
                               │      │
                               │      └── records {fps, interval, faceStatus}
                               │
                               └── ui-renderer.update()
                                      │
                                      ├── updateVitalsCards(hr, rr, conf)
                                      ├── updateWaveforms(ppg[], resp[])
                                      ├── updateTimer(remaining)
                                      └── updateMetrics(fps, chunks, uptime)
```

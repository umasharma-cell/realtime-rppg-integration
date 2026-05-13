# Real-Time rPPG Vital Signs Monitor

A near real-time prototype that estimates **heart rate (HR)** and **respiratory rate (RR)** from a 60-second webcam recording using remote photoplethysmography (rPPG), powered by the WiseAI SDK.

**Live Demo:** [https://realtime-rppg-integration.vercel.app](https://realtime-rppg-integration.vercel.app)

**Repository:** [https://github.com/umasharma-cell/realtime-rppg-integration](https://github.com/umasharma-cell/realtime-rppg-integration)

---

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:5173` → Click **Start Scan** → Face the camera → Hold still for 60 seconds.

---

## How It Works

The app uses **remote photoplethysmography (rPPG)** — a technique that estimates vital signs by detecting tiny, invisible color changes on the skin caused by blood flow. Every heartbeat pushes blood to the face, causing sub-pixel brightness fluctuations in the green channel. The WiseAI SDK's cloud AI model extracts these signals from webcam video and returns:

- **PPG waveform** — the heartbeat signal (each peak = one beat → count peaks/min = HR)
- **Respiratory waveform** — the breathing signal (each cycle = one breath → count cycles/min = RR)
- **Confidence scores** — how reliable each measurement is (0.0 to 1.0)

The app processes video **incrementally in real-time** — not as a batch after recording. Frames are captured at ~30fps, batched by the SDK every ~1 second, sent to the cloud model, and results are displayed live as they arrive.

---

## Sample Output

### Live Session (chunk-level BPM)

During scanning, vitals update live as each chunk arrives from the cloud model:

| Stage | Screenshot |
|-------|-----------|
| **Camera access & face detection** | App requests camera → detects face → "Calibrating... hold still" |
| **Live scanning (00:57)** | HR: 82 BPM, 9 chunks received, 29.0 FPS |
| **Mid-session (00:47)** | HR: 61 BPM (65%), RR: 15 RPM, 20 chunks, PPG waveform visible |
| **Late session (00:15)** | HR: 77 BPM (66%), RR: 16 RPM (91%), 58 chunks, respiratory waveform visible |
| **Session complete (00:00)** | HR: 83 BPM (59%), RR: 19 RPM (93%), 76 total chunks, 28.5 FPS |

### Final BPM (after 60 seconds)

```
Final Heart Rate:        80 BPM   (confidence-weighted average across 76 chunks)
Robust HR estimate:      80 BPM   (trimmed mean — top/bottom 10% dropped)

Final Respiratory Rate:  15 RPM   (confidence-weighted average)
Robust RR estimate:      15 RPM   (trimmed mean)
```

Both aggregation methods converge to the same value — indicating stable, consistent readings throughout the session.

### Chunk History (selected samples from 76 chunks)

| Chunk | Time | HR (BPM) | HR Conf | RR (RPM) | RR Conf | FPS |
|-------|------|----------|---------|----------|---------|-----|
| 6 | 0:07 | 84 | 62% | -- | -- | 28.6 |
| 11 | 0:13 | 87 | 64% | -- | -- | 28.5 |
| 15 | 0:16 | 64 | 67% | 15 | 95% | 28.7 |
| 29 | 0:28 | 86 | 58% | 13 | 89% | 28.3 |
| 34 | 0:32 | 89 | 66% | 13 | 90% | 28.4 |
| 37 | 0:34 | 88 | 68% | 13 | 91% | 28.9 |

**Observations:**
- HR values range 54–93 BPM across chunks (natural variation from the rPPG signal), but the weighted average converges to a stable 80 BPM
- RR is remarkably stable at 13–16 RPM with high confidence (89–95%)
- The first 5 chunks show `--` for HR/RR — this is the SDK warmup period while the model accumulates enough frames
- RR appears intermittently in early chunks because the respiratory signal needs a longer window to stabilize

### Runtime Performance Metrics

```
Effective FPS:         28.5
Avg Chunk Interval:    0.9s
Total Chunks:          76
Face Detection Uptime: 100%
Wall-Clock Time:       71s (includes ~8s SDK warmup before timer starts)
Active Scan Time:      60s
```

---

## Architecture

```
index.html (entry point)
  └── src/main.js (orchestrator — wires all modules, handles events)
        ├── sdk-manager.js         → SDK facade: init, start, stop, cloud/local fallback
        ├── session-controller.js  → State machine (7 states) + 60s timer + face-loss pause
        ├── vitals-tracker.js      → Chunk storage, sanity filter, dual aggregation
        ├── rr-estimator.js        → Local RR fallback via PPG signal analysis
        ├── performance-monitor.js → FPS, chunk interval, face uptime tracking
        ├── ui-renderer.js         → DOM updates, Canvas 2D waveforms, results table
        └── constants.js           → API key, thresholds, session configuration
```

### Key Design Decisions

**Vite + Vanilla JS over React/Next.js:** The WiseAI SDK ships as a pre-built browser ES module with internal Web Workers and WASM. Vite handles ES modules natively with zero config. A framework would add abstraction between the evaluator and the SDK integration logic — which is exactly what this assignment is testing. Every line of SDK interaction is visible and traceable.

**Facade pattern for SDK isolation:** All SDK calls are encapsulated in `sdk-manager.js`. The rest of the app never touches the SDK directly — it communicates through callbacks (`onVitals`, `onFaceDetected`, `onStreamReset`). This made it straightforward to add cloud-to-local fallback without modifying any other module, and keeps the SDK-specific code testable in isolation.

**Two aggregation methods, not one:** A single average isn't robust enough for noisy physiological signals. Confidence-weighted mean leverages the SDK's per-chunk quality scoring. Trimmed mean provides outlier resistance independent of confidence. When both converge (as they did: HR 80/80, RR 15/15), it validates the measurement stability.

**Timer starts on first vitals, not on camera open:** The SDK warmup period (5-8 seconds for model resolution + buffer fill) produces no data. Starting the 60-second timer only after the first valid measurement ensures the full minute captures actual physiological data, not dead air.

### Session State Machine

```
idle → initializing → searching → warmingUp → scanning → completed
                                                   ↘ error
```

| State | What Happens | User Sees |
|-------|-------------|-----------|
| idle | Nothing running | "Start Scan" button |
| initializing | SDK + camera setup | "Initializing SDK..." |
| searching | SDK running, no face yet | "Looking for your face..." |
| warmingUp | Face found, SDK calibrating | "Calibrating... hold still" |
| scanning | Vitals flowing, 60s countdown | Live HR/RR + timer |
| completed | Timer hit 00:00, SDK stopped | Results + chunk history table |
| error | Camera denied / API error | Error message |

---

## Model Performance, Latency & Failure Cases

### Performance

| Method | Where It Runs | HR | RR | HRV | Accuracy |
|--------|--------------|:--:|:--:|:---:|----------|
| `wiseai` (cloud) | `api.rouast.com` | Yes | Yes | Yes | Highest — deep learning model |
| `chrom` (local fallback) | Browser | Yes | Estimated* | No | Moderate — classic CHROM algorithm |

*When the cloud API is unreachable, the app automatically falls back to the local `chrom` method. In this mode, RR is estimated by extracting respiratory sinus arrhythmia from the PPG signal using a moving-average low-pass filter + peak detection. This is a best-effort estimate — less accurate than the cloud model's direct respiratory measurement.

### Latency Breakdown

| Stage | Latency | Notes |
|-------|---------|-------|
| Camera → first frame | ~100ms | `getUserMedia` + video element play |
| SDK warmup | ~5-8s | Model resolution API call + initial buffer fill |
| Frame batch → cloud API | ~600-700ms | Per-chunk round-trip to `api.rouast.com` |
| Chunk delivery interval | ~0.9-1.0s | SDK batches frames and streams to cloud |
| Canvas waveform render | <1ms | Direct Canvas 2D API, no framework overhead |
| End-to-end (camera → display) | ~1-2s | From frame capture to vital sign on screen |

### Failure Cases & How They're Handled

| Scenario | Detection | Response |
|----------|-----------|----------|
| **No face in frame** | `faceDetected(null)` event | Warning banner displayed |
| **Face lost for 5+ seconds** | Continuous face-loss timer | Timer pauses, "Paused — face lost" status |
| **Face partially occluded** (glasses, hand) | Confidence drops | Yellow/red confidence indicator, low-conf chunks excluded from final average |
| **Subject moving** | Motion artifacts → noisy PPG | Sanity filter rejects HR outside 40-180 BPM; median smoothing stabilizes display |
| **Cloud API unreachable** | `ERR_CONNECTION_TIMED_OUT` on `/resolve-model` | Auto-fallback to local `chrom` method within same session, warning shown |
| **Network drop mid-session** | `streamReset` event from SDK | Auto-reconnect: stop → 3s wait → re-acquire camera → restart (existing chunks preserved) |
| **Camera permission denied** | `NotAllowedError` from `getUserMedia` | Clear error message: "Camera access denied" |
| **API key invalid** | `WiseAIAPIKeyError` from SDK | Error message with specifics |
| **Tab hidden during scan** | `document.visibilitychange` event | SDK paused to prevent stale frames; resumes on tab return |
| **Multiple consecutive sessions** | User clicks "Start New Session" | Full reset of all 7 modules — no state leakage |

### Real-Time Deployment Considerations

- **HTTPS required** — `getUserMedia` is blocked on non-HTTPS origins in production (localhost is exempt). Deployed on Vercel which provides HTTPS by default.
- **Camera resolution** — Requested at 640x480 to balance face detail quality against bandwidth and CPU usage. Higher resolution doesn't meaningfully improve rPPG accuracy since the signal comes from average pixel values in the ROI, not spatial detail.
- **Memory management** — Waveform buffers capped at 500 points; PPG history capped at 20 seconds. Prevents memory leaks in long-running or repeated sessions.
- **CPU throttling** — Face detection runs at 1Hz (not per-frame) to minimize CPU. Canvas redraws only on new data arrival, not on `requestAnimationFrame`. This keeps the main thread responsive.
- **Bandwidth** — Each stream chunk is ~5-6KB compressed. A full 60s session with 76 chunks ≈ ~400KB total to the API. Minimal bandwidth footprint.
- **Graceful degradation** — If the cloud API goes down, the app continues functioning with local HR estimation rather than showing an error and stopping.

---

## BPM Aggregation Logic

### Real-Time (per chunk)
Each SDK `vitals` event is one chunk. The cloud model returns HR and RR with per-chunk confidence scores. Before display:
1. **Sanity filter** — HR must be 40-180 BPM, RR must be 6-35 RPM. Physiologically impossible values are rejected.
2. **Median smoothing** — Display shows the median of the last 5 valid readings to prevent jittery numbers from momentary noise.

### Final BPM (after 60 seconds)

**Primary — Confidence-Weighted Mean:**
```
finalHR = Σ(chunk_hr × chunk_confidence) / Σ(chunk_confidence)
```
High-confidence chunks contribute proportionally more to the final value. Chunks below the minimum confidence threshold are excluded entirely, so a noisy reading at 30% confidence doesn't corrupt a clean average.

**Secondary — Trimmed Mean:**
Sort all valid chunk values, drop the top and bottom 10%, then compute a simple average. This removes statistical outliers regardless of confidence scoring — a different lens on the same data.

Both values are displayed on the results screen. When they converge (as in our test: HR 80/80, RR 15/15), it validates that the signal was stable and the aggregation is robust.

---

## SDK Integration Details

The WiseAI SDK is integrated using the **Core API** (not drop-in web components) for full control over the real-time pipeline:

```javascript
// Initialize with cloud AI model
const wiseai = new WiseAI({ method: 'wiseai', apiKey: API_KEY });

// Connect webcam stream
const stream = await navigator.mediaDevices.getUserMedia({ video: true });
await wiseai.setVideoStream(stream, videoElement);

// Listen for incremental results — each event is one "chunk"
wiseai.addEventListener('vitals', (result) => {
  result.vitals.heart_rate.value;        // HR in BPM
  result.vitals.respiratory_rate.value;  // RR in RPM
  result.vitals.heart_rate.confidence;   // 0.0 – 1.0
  result.waveforms.ppg_waveform.data;    // Heartbeat signal array
  result.waveforms.respiratory_waveform.data; // Breathing signal array
  result.fps;                            // Effective processing FPS
});

// Start real-time incremental processing
wiseai.startVideoStream();
```

**Vite integration challenge:** The SDK bundle uses `import.meta.url` internally for Web Worker and WASM file resolution. Vite's dev server blocks JS imports from `public/`, and its static analysis catches even `@vite-ignore` dynamic imports. The solution was a custom Vite middleware plugin that serves the SDK from `vendor/` at a custom URL path, combined with a `new Function('url', 'return import(url)')` wrapper that hides the dynamic import from Vite's transform pipeline. This preserves the SDK's internal relative path resolution while keeping Vite happy in both dev and production builds.

---

## How I Used AI Tools

I used **Claude Code** (Anthropic's AI coding assistant) as a force multiplier throughout this project. I want to be specific about what AI did and didn't do, because I think the distinction matters.

### What AI Helped With

**Understanding the SDK internals:**
The WiseAI SDK ships as a pre-built bundle with a README but no detailed API documentation for the internal event system. I used Claude to read through the SDK source files — `VitalLensController.base.js` for the event dispatch logic, `StreamProcessor.browser.js` for the frame processing pipeline, `SessionAdapter.js` for the result object shape, and `VitalLensBase.js` for the confidence thresholds the SDK uses internally (0.8 for vitals, 0.5 for face detection). This gave me a complete picture of what data each event carries before writing any integration code. Without AI, this would have been several hours of manually tracing through bundled source code — with it, I had a working mental model of the SDK in about 20 minutes.

**Evaluating design trade-offs:**
I used Claude as a sounding board when deciding between approaches. For example: Chart.js vs Canvas 2D for waveforms (chose Canvas — zero dependencies, 30 lines of code for the same result), simple average vs weighted mean vs median for BPM aggregation (chose confidence-weighted mean as primary with trimmed mean as secondary), and whether to throttle chunk recording for local methods (the `chrom` algorithm fires per-frame at 30fps, which would have produced 1800 "chunks" — needed throttling to 1 chunk per 2 seconds). AI helped me think through trade-offs faster, but the decisions were mine.

**Solving the Vite + SDK integration:**
This was the hardest technical problem in the project. Vite blocks JS imports from `public/`, its static analysis catches `@vite-ignore` dynamic imports, and the SDK's internal Web Workers need specific URL resolution. I worked through four different approaches — `public/` import, inline `<script type="module">`, `@vite-ignore` dynamic import, and finally the `new Function()` wrapper + custom middleware plugin that actually worked. AI accelerated the iteration cycle, but the debugging required understanding how Vite's dev server transforms modules vs how Rollup bundles for production.

**Implementing the local RR estimator:**
When the cloud API was temporarily unreachable during development (the `api.rouast.com` endpoint was timing out), I needed a fallback for respiratory rate. I used Claude to help implement a local RR estimator that extracts respiratory modulation from the PPG signal — using a moving-average low-pass filter to isolate the 0.1-0.5 Hz breathing band, then peak detection to count respiratory cycles. The signal processing approach (respiratory sinus arrhythmia) is well-documented in rPPG literature, but having AI help with the implementation saved time.

**Code generation and iteration:**
Claude generated the initial implementations of each module based on my specifications for what each one should do. I reviewed every module, tested the app, and iterated — for example, I discovered the face detection handler was parsing the SDK's event data incorrectly (checking `result?.face?.coordinates` when the SDK dispatches the raw face object, not a wrapped object), and I added the physiological sanity filter after observing the local `chrom` method producing HR values of 194 BPM.

### What I Did Myself

- **All architectural decisions** — module boundaries, state machine design (7 states), what to aggregate and how
- **Choosing the Core API over web components** — the assignment evaluates integration skill, not drag-and-drop usage
- **Testing and debugging** — running full 60-second sessions, interpreting console output, identifying root causes. The timer bug (timer not counting down) turned out to be a face detection parsing issue, not a timer logic issue. The "invalid API key" error turned out to be a connection timeout to `api.rouast.com`, not a key problem. These required understanding the full system, not just reading error messages.
- **Understanding the rPPG domain** — how photoplethysmography works, why green channel absorption correlates with blood volume, what respiratory sinus arrhythmia is, what constitutes physiologically plausible ranges for HR (40-180) and RR (6-35)
- **UI/UX decisions** — dark medical monitor aesthetic, confidence color coding (green/yellow/red), glow effects on vital cards, waveform rendering approach
- **Deployment and production thinking** — HTTPS requirements, memory caps, FPS throttling, bandwidth estimation, graceful degradation strategy

### My Perspective

AI let me move at roughly 5x speed on implementation — the kind of tasks where I know exactly what I want but typing it out takes time. I spent my energy on the parts that matter: understanding the SDK, making integration decisions, testing with real camera data, and making sure the pipeline produces accurate results. The AI wrote code; I made sure the code was correct and the architecture was sound.

I believe this is how AI tools should be used in engineering — not as a replacement for understanding, but as a way to operate at a higher level of abstraction. I still had to know what to ask for, how to evaluate the output, and when the output was wrong.

---

## Build & Deploy

```bash
npm run build     # produces dist/ with SDK files copied via Vite plugin
npm run preview   # preview production build locally
```

The app is fully client-side. The SDK communicates directly with `api.rouast.com` from the browser — no backend infrastructure needed. Deploy `dist/` to any static HTTPS host.

Currently deployed on **Vercel** with automatic deploys from the `main` branch.

---

## Tech Stack

| Tool | Why I Chose It |
|------|---------------|
| **Vite** | Native ES module support, instant HMR, zero-config build — matches how the SDK bundle works |
| **Vanilla JavaScript (ES Modules)** | No framework overhead. SDK integration logic is the focus, not component architecture |
| **Canvas 2D API** | Zero-dependency waveform rendering. Full control over styling. ~30 lines vs pulling in Chart.js |
| **WiseAI SDK (`wiseai` method)** | Cloud rPPG model — highest accuracy for HR + RR + HRV. Auto-fallback to local `chrom` if unavailable |

---

## Project Structure

```
├── src/
│   ├── main.js                 # Orchestrator — event handlers, module wiring
│   ├── sdk-manager.js          # SDK facade — init, start, stop, fallback logic
│   ├── session-controller.js   # State machine + 60s timer + face-loss pause
│   ├── vitals-tracker.js       # Chunk storage, sanity filter, aggregation
│   ├── rr-estimator.js         # Local RR estimation from PPG signal
│   ├── performance-monitor.js  # FPS, chunk interval, face uptime
│   ├── ui-renderer.js          # DOM updates, canvas waveforms, results
│   └── constants.js            # API key, thresholds, configuration
├── vendor/wiseai-sdk/          # WiseAI SDK bundle (served via Vite middleware)
├── flow/
│   └── development-phases.md   # Phase-by-phase build documentation
├── index.html                  # Single-page app
├── style.css                   # Dark medical monitor theme
├── vite.config.js              # Vite config + custom SDK serving plugin
└── package.json
```

---

## Development Process

This project was built in 5 phases. See [flow/development-phases.md](flow/development-phases.md) for detailed phase-by-phase documentation including decisions made, trade-offs evaluated, architecture diagrams, and data flow explanations.

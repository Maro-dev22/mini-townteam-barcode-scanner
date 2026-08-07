// =============================================================================
// scanner.js — Dual-Engine Barcode Scanner
// Primary:  Dynamsoft Barcode Reader 11.4 (warehouse-grade)
// Fallback: html5-qrcode (loaded dynamically if Dynamsoft fails for any reason)
//
// Both engines implement the same EngineInterface and are driven by ScannerFacade.
// All shared logic (audio, haptics, visual, status, duplicate guard, canvas)
// lives outside both engines — the user experience is identical regardless of
// which engine is running.
// =============================================================================

"use strict";

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1: CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

const CONFIG = {
    // Dynamsoft 24-hour public trial key
    LICENSE_KEY: "DLS2eyJoYW5kc2hha2VDb2RlIjoiMjAwMDAxLTE2NDk4Mjk3OTI2MzUiLCJvcmdhbml6YXRpb25JRCI6IjIwMDAwMSIsInNlc3Npb25QYXNzd29yZCI6IndTcGR6Vm05WDJrcEQ5YUoifQ==",

    // Fallback CDN (loaded only if Dynamsoft fails)
    HTML5QRCODE_CDN: "https://unpkg.com/html5-qrcode",

    // Duplicate-scan cooldown in ms
    DEBOUNCE_MS: 1000,

    // Max ms to wait for Dynamsoft to initialize before giving up
    DYNAMSOFT_INIT_TIMEOUT_MS: 8000,

    // Camera resolution for Dynamsoft (720p = best mobile speed/quality balance)
    RESOLUTION: { width: 1280, height: 720 },

    // ROI: center 80% wide × 40% tall (percentage coordinates)
    SCAN_REGION: { x: 10, y: 30, width: 80, height: 40, isMeasuredInPercentage: true },

    // Zoom fallback limits (used when device doesn't report capabilities)
    ZOOM_MIN: 1.0,
    ZOOM_MAX: 8.0,

    // Barcode corner marker colors
    MARKER_COLOR_OK:  "#00e676",
    MARKER_COLOR_ERR: "#ff1744",

    // Show FPS counter when URL contains ?debug
    DEBUG: location.search.includes("debug"),
};

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2: SHARED STATE
// ─────────────────────────────────────────────────────────────────────────────

const State = {
    // Which engine is active — set by ScannerFacade after init
    activeEngine: null,   // reference to DynamsoftEngine or Html5QrEngine object
    engineName:   "none", // "dynamsoft" | "html5qrcode" | "none"

    // Set to true after ScannerFacade.init() resolves
    ready: false,
};

// Temporary phone-visible diagnostics for the Dynamsoft pipeline. Keep this
// independent from app.js so a missing decode can be separated from business
// logic on the device that owns the camera.
const ScannerDebug = (() => {
    let panel = null;
    const state = {
        engine: "Dynamsoft",
        camera: "PENDING",
        videoTracks: 0,
        videoFrames: 0,
        capture: "PENDING",
        template: "ReadSingleBarcode: PENDING",
        code128: "PENDING",
        resultCallbacks: 0,
        barcodeItems: 0,
        routerFrames: 0,
        sourceFrames: 0,
        cvrStatus: "PENDING",
        detected: "—",
        lastError: "—",
    };

    function render() {
        if (!panel) return;
        panel.textContent = [
            `Engine: ${state.engine}`,
            `Camera: ${state.camera}`,
            `Video tracks: ${state.videoTracks}`,
            `Video frames: ${state.videoFrames}`,
            `Capture: ${state.capture}`,
            `Template: ${state.template}`,
            `CODE_128 configured: ${state.code128}`,
            `Router frames: ${state.routerFrames}`,
            `CVR source frames: ${state.sourceFrames}`,
            `CVR status: ${state.cvrStatus}`,
            `Result callbacks: ${state.resultCallbacks}`,
            `Barcode items: ${state.barcodeItems}`,
            `Detected: ${state.detected}`,
            `Last error: ${state.lastError}`,
        ].join("\n");
    }

    return {
        init(container) {
            if (!panel) {
                panel = document.createElement("pre");
                panel.id = "scannerDebugPanel";
                panel.setAttribute("aria-live", "polite");
                Object.assign(panel.style, {
                    position: "absolute", right: "12px", bottom: "58px", zIndex: "20",
                    margin: "0", maxWidth: "calc(100% - 24px)", padding: "8px 10px",
                    color: "#d7ffe1", background: "rgba(0, 0, 0, 0.72)",
                    border: "1px solid rgba(0, 230, 118, 0.7)", borderRadius: "6px",
                    font: "11px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace",
                    whiteSpace: "pre-wrap", pointerEvents: "none",
                });
                container?.appendChild(panel);
            }
            render();
        },
        reset() {
            state.camera = "PENDING";
            state.videoTracks = 0;
            state.videoFrames = 0;
            state.capture = "PENDING";
            state.resultCallbacks = 0;
            state.barcodeItems = 0;
            state.routerFrames = 0;
            state.sourceFrames = 0;
            state.cvrStatus = "PENDING";
            state.detected = "—";
            state.lastError = "—";
            render();
        },
        set(key, value) { state[key] = value; render(); },
        increment(key) {
            state[key] = (Number(state[key]) || 0) + 1;
            render();
        },
        error(error) {
            state.lastError = String(error?.message || error || "Unknown error");
            render();
        },
    };
})();

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3: UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

// Races a promise against a timeout — used to detect a hung Dynamsoft init
function withTimeout(promise, ms, label) {
    const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    );
    return Promise.race([promise, timeout]);
}

// Dynamically inject a <script> tag and wait for it to load
function loadScript(src) {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) {
            resolve(); // already loaded
            return;
        }
        const s = document.createElement("script");
        s.src     = src;
        s.async   = true;
        s.onload  = resolve;
        s.onerror = () => reject(new Error(`Failed to load script: ${src}`));
        document.head.appendChild(s);
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4: DUPLICATE GUARD
// ─────────────────────────────────────────────────────────────────────────────

const DuplicateGuard = (() => {
    let lastText = "";
    let lastTime = 0;

    return {
        // Returns true if this is a duplicate scan that should be ignored
        check(text) {
            const now = Date.now();
            if (text === lastText && now - lastTime < CONFIG.DEBOUNCE_MS) return true;
            lastText = text;
            lastTime = now;
            return false;
        },
        reset() { lastText = ""; lastTime = 0; },
    };
})();

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5: AUDIO FEEDBACK (Web Audio API — no external files required)
// ─────────────────────────────────────────────────────────────────────────────

const AudioFeedback = (() => {
    let ctx = null;

    function getCtx() {
        if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
        return ctx;
    }

    function beep(freq, duration, type = "sine", volume = 0.35) {
        try {
            const ac   = getCtx();
            const osc  = ac.createOscillator();
            const gain = ac.createGain();
            osc.connect(gain);
            gain.connect(ac.destination);
            osc.type = type;
            osc.frequency.setValueAtTime(freq, ac.currentTime);
            
            // Soft envelope: fade in over 10ms, fade out over the rest
            gain.gain.setValueAtTime(0, ac.currentTime);
            gain.gain.linearRampToValueAtTime(volume, ac.currentTime + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
            
            osc.start(ac.currentTime);
            osc.stop(ac.currentTime + duration);
        } catch (_) { /* audio blocked or unavailable */ }
    }

    return {
        // Soft professional POS scanner beep
        success() {
            beep(880, 0.08, "triangle", 0.4);
        },
        // Lower double-beep, not loud
        error() {
            beep(350, 0.1, "triangle", 0.3);
            setTimeout(() => beep(350, 0.1, "triangle", 0.3), 150);
        },
        // Single soft chime on camera open
        startup() {
            beep(600, 0.07, "sine", 0.20);
        },
    };
})();

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6: HAPTIC FEEDBACK
// ─────────────────────────────────────────────────────────────────────────────

const HapticFeedback = {
    success() { if (navigator.vibrate) navigator.vibrate(120);           },
    error()   { if (navigator.vibrate) navigator.vibrate([50, 50, 50]);  },
};

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 7: VISUAL FEEDBACK (animated border flash on camera container)
// ─────────────────────────────────────────────────────────────────────────────

const VisualFeedback = (() => {
    const getContainer = () => document.querySelector(".camera-container");

    function flash(cls, ms) {
        const el = getContainer();
        if (!el) return;
        el.classList.remove("flash-green", "flash-red");
        void el.offsetWidth; // force reflow to restart CSS animation
        el.classList.add(cls);
        setTimeout(() => el.classList.remove(cls), ms);
    }

    return {
        success() { flash("flash-green", 350); },
        error()   { flash("flash-red",   500); },
    };
})();

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 8: STATUS BADGE (shown in .camera-text area)
// ─────────────────────────────────────────────────────────────────────────────

const StatusBadge = (() => {
    const getEl = () => document.querySelector(".camera-text");

    function set(msg, state = "ready") {
        const node = getEl();
        if (!node) return;
        node.innerHTML = `<span class="scan-status-badge ${state}">${msg}</span>`;
    }

    return {
        ready()      { set("Ready to Scan",     "ready");   },
        scanning()   { set("Scanning...",        "active");  },
        detected()   { set("Barcode Detected ✓", "found");   },
        processing() { set("Processing...",       "process"); },
        info(msg)    { set(msg,                   "ready");   },
        error(msg)   { set(msg || "Error",         "process"); },
    };
})();

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 9: FPS COUNTER (debug-only overlay)
// ─────────────────────────────────────────────────────────────────────────────

const FpsCounter = (() => {
    let badge      = null;
    let frameCount = 0;
    let intervalId = null;

    return {
        init(container) {
            if (!CONFIG.DEBUG || badge) return;
            badge = document.createElement("span");
            badge.id = "fpsBadge";
            badge.textContent = "-- fps";
            container.appendChild(badge);
        },
        tick()  { if (CONFIG.DEBUG && badge) frameCount++; },
        start() {
            if (!CONFIG.DEBUG) return;
            frameCount = 0;
            intervalId = setInterval(() => {
                if (badge) badge.textContent = `${frameCount} fps`;
                frameCount = 0;
            }, 1000);
        },
        stop() {
            if (intervalId) { clearInterval(intervalId); intervalId = null; }
        },
    };
})();

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 10: BARCODE CORNER CANVAS OVERLAY (Dynamsoft only — skipped gracefully on fallback)
// ─────────────────────────────────────────────────────────────────────────────

const BarcodeCanvas = (() => {
    let canvas     = null;
    let ctx        = null;
    let clearTimer = null;

    function ensureCanvas() {
        if (canvas) return;
        const reader = document.getElementById("reader");
        if (!reader) return;
        canvas = document.createElement("canvas");
        canvas.id = "barcodeCanvas";
        reader.appendChild(canvas);
        ctx = canvas.getContext("2d");
    }

    function syncSize() {
        if (!canvas) return;
        const reader = document.getElementById("reader");
        if (!reader) return;
        canvas.width  = reader.offsetWidth;
        canvas.height = reader.offsetHeight;
    }

    // Draw corner dots and connecting lines from Dynamsoft localizationResult points
    function drawMarkers(points, color = CONFIG.MARKER_COLOR_OK) {
        ensureCanvas();
        syncSize();
        if (!ctx || !points || points.length < 4) return;

        const reader = document.getElementById("reader");
        if (!reader) return;
        const rw = reader.offsetWidth;
        const rh = reader.offsetHeight;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Connecting lines
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth   = 2;
        ctx.globalAlpha = 0.7;
        ctx.moveTo(
            points[0].x / CONFIG.RESOLUTION.width  * rw,
            points[0].y / CONFIG.RESOLUTION.height * rh
        );
        for (let i = 1; i < 4; i++) {
            ctx.lineTo(
                points[i].x / CONFIG.RESOLUTION.width  * rw,
                points[i].y / CONFIG.RESOLUTION.height * rh
            );
        }
        ctx.closePath();
        ctx.stroke();

        // Corner dots
        ctx.globalAlpha = 1;
        points.forEach(pt => {
            ctx.beginPath();
            ctx.arc(
                pt.x / CONFIG.RESOLUTION.width  * rw,
                pt.y / CONFIG.RESOLUTION.height * rh,
                5, 0, Math.PI * 2
            );
            ctx.fillStyle = color;
            ctx.fill();
        });

        if (clearTimer) clearTimeout(clearTimer);
        clearTimer = setTimeout(() => clear(), 500);
    }

    function clear() {
        if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    return { init: ensureCanvas, draw: drawMarkers, clear };
})();

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 11: SHARED DECODE HANDLER
// Called by both engines when a barcode is successfully decoded.
// ─────────────────────────────────────────────────────────────────────────────

function onBarcodeDecoded(text, localizationPoints = null) {
    FpsCounter.tick();

    const trimmed = String(text || "").trim();
    if (!trimmed) return;

    // Duplicate-guard — engine-agnostic
    if (DuplicateGuard.check(trimmed)) return;

    // Pause the active engine immediately (camera stays warm)
    State.activeEngine?.pause();

    // Update status badge
    StatusBadge.detected();

    // Delegate to app.js business logic (unchanged)
    window.searchBarcode(trimmed);
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 12: FEEDBACK HOOKS — called back from app.js
// ─────────────────────────────────────────────────────────────────────────────

window.onScanSuccess = function () {
    AudioFeedback.success();
    HapticFeedback.success();
    VisualFeedback.success();
    
    // Close the scanner window automatically after the flash
    setTimeout(() => {
        closeCameraOverlay();
    }, 400); // 400ms allows the 350ms flash animation to finish
};

window.onScanError = function () {
    AudioFeedback.error();
    HapticFeedback.error();
    VisualFeedback.error();
    BarcodeCanvas.clear();

    // Close the scanner window automatically after the flash
    setTimeout(() => {
        closeCameraOverlay();
    }, 600); // 600ms allows the 500ms flash animation to finish
};

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 13: ENGINE — DYNAMSOFT (Primary)
// Implements: init(), open(), pause(), resume(), close()
// Includes:   torch, pinch-zoom, tap-focus, ROI, exposure, corner markers
// ─────────────────────────────────────────────────────────────────────────────

const DynamsoftEngine = (() => {
    // Internal state
    let cvRouter       = null;
    let cameraEnhancer = null;
    let cameraView     = null;
    let videoTrack     = null;
    let capabilities   = {};

    let cameraOpen  = false;
    let capturing   = false;
    let torchOn     = false;
    let videoFrameRequestId = null;
    let videoFrameFallback = null;
    let videoFrameCount = 0;
    let routerFrameCount = 0;
    let genericResultLogCount = 0;
    let decodedResultLogCount = 0;

    let pinchStartDist = 0;
    let pinchStartZoom = 1;

    const readerEl = document.getElementById("reader");

    function recordError(context, error) {
        const message = `${context}: ${error?.message || error}`;
        ScannerDebug.error(message);
        console.error(`[Scanner Debug] ${message}`, error);
    }

    function stopVideoFrameMonitor() {
        const video = readerEl?.querySelector("video");
        if (videoFrameRequestId && video?.cancelVideoFrameCallback) {
            video.cancelVideoFrameCallback(videoFrameRequestId);
        }
        if (videoFrameFallback) clearInterval(videoFrameFallback);
        videoFrameRequestId = null;
        videoFrameFallback = null;
    }

    function startVideoFrameMonitor(video) {
        stopVideoFrameMonitor();
        videoFrameCount = 0;
        const update = () => ScannerDebug.set("videoFrames", ++videoFrameCount);
        if (video?.requestVideoFrameCallback) {
            const next = () => {
                update();
                videoFrameRequestId = video.requestVideoFrameCallback(next);
            };
            videoFrameRequestId = video.requestVideoFrameCallback(next);
            return;
        }

        let previousTime = video?.currentTime ?? 0;
        videoFrameFallback = setInterval(() => {
            if (video && video.currentTime !== previousTime) {
                previousTime = video.currentTime;
                update();
            }
        }, 250);
    }

    async function getVideoAndTracks(timeoutMs = 1000) {
        const startedAt = Date.now();
        while (Date.now() - startedAt < timeoutMs) {
            const video = readerEl?.querySelector("video");
            const tracks = video?.srcObject?.getVideoTracks?.() || [];
            if (tracks.length) return { video, tracks };
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        return { video: readerEl?.querySelector("video"), tracks: [] };
    }

    // ── Barcode result receiver ─────────────────────────────────────────────
    function onDecodedBarcodesReceived(result) {
        const items = result?.barcodeResultItems;
        ScannerDebug.increment("resultCallbacks");
        console.log("[Scanner Debug] Result callback fired");
        console.log("[Scanner Debug] Barcode items:", items?.length || 0);
        if (decodedResultLogCount++ < 3) {
            console.log("[Scanner Debug] Decoded result structure:", {
                keys: Object.keys(result || {}), result,
            });
        }
        if (!items?.length) return;
        const item   = items[0];
        const points = item.location?.points ?? null;
        ScannerDebug.set("barcodeItems", items.length);
        ScannerDebug.set("detected", item.text || "(empty)");
        console.log("[Scanner Debug] Barcode text:", item.text);
        onBarcodeDecoded(item.text, points);
    }

    function onCapturedResultReceived(result) {
        routerFrameCount += 1;
        const barcodeItems = result?.barcodeResultItems || [];
        ScannerDebug.set("routerFrames", routerFrameCount);
        ScannerDebug.set("barcodeItems", barcodeItems.length);
        ScannerDebug.set("cvrStatus", barcodeItems.length
            ? `BARCODE ITEMS: ${barcodeItems.length}`
            : `RECEIVING / ZERO BARCODES`);

        if (genericResultLogCount++ < 3) {
            console.log("[Scanner Debug] CVR captured result structure:", {
                keys: Object.keys(result || {}),
                itemCount: result?.items?.length ?? 0,
                barcodeItemCount: barcodeItems.length,
                result,
            });
        }

        if (barcodeItems.length === 0 && (routerFrameCount === 1 || routerFrameCount === 30)) {
            console.warn(`[Scanner Debug] CVR received ${routerFrameCount} frame(s) but detected zero barcodes.`);
        }
    }

    function onOriginalImageResultReceived() {
        ScannerDebug.increment("sourceFrames");
    }

    // ── Decoder settings (CODE_128 only, single barcode, fastest) ──────────
    async function configureDecoder() {
        const settings = await cvRouter.getSimplifiedSettings("ReadSingleBarcode");
        settings.barcodeSettings.barcodeFormatIds =
            Dynamsoft.DBR.EnumBarcodeFormat.BF_CODE_128;
        settings.barcodeSettings.expectedBarcodesCount = 1;
        settings.outputOriginalImage = true;
        await cvRouter.updateSettings("ReadSingleBarcode", settings);
        const effectiveSettings = await cvRouter.getSimplifiedSettings("ReadSingleBarcode");
        const configuredId = effectiveSettings?.barcodeSettings?.barcodeFormatIds;
        const expectedId = Dynamsoft.DBR.EnumBarcodeFormat.BF_CODE_128;
        const isCode128 = configuredId === expectedId;
        ScannerDebug.set("code128", `${isCode128 ? "YES" : "NO"} (${String(configuredId)})`);
        console.log("[Scanner Debug] CODE_128 enum value:", expectedId);
        console.log("[Scanner Debug] Effective barcode format IDs:", configuredId);
        console.log("[Scanner Debug] Effective ReadSingleBarcode settings:", effectiveSettings);
        if (!isCode128) throw new Error("ReadSingleBarcode did not retain BF_CODE_128 after updateSettings");
    }

    // ── ROI: only center 80%×40% of frame is decoded ───────────────────────
    async function applyROI() {
    try {
        // await cameraEnhancer.setScanRegion(CONFIG.SCAN_REGION);

        cameraView?.setScanLaserVisible?.(false);
        cameraView?.setScanRegionMaskVisible?.(false);
    } catch (_) {}
}
    // ── Select back-facing camera ───────────────────────────────────────────
    async function selectBackCamera() {
        try {
            const cameras = await cameraEnhancer.getAllCameras();
            const back = cameras.find(c => /back|rear|environment/i.test(c.label))
                      || cameras[cameras.length - 1];
            if (back) await cameraEnhancer.selectCamera(back);
        } catch (_) { /* use default */ }
    }

    // ── Grab raw video track for advanced MediaTrackConstraints ─────────────
    async function captureVideoTrack() {
        try {
            const video = readerEl?.querySelector("video");
            if (video?.srcObject) {
                const tracks = video.srcObject.getVideoTracks();
                if (tracks.length) {
                    videoTrack   = tracks[0];
                    capabilities = tracks[0].getCapabilities?.() || {};
                }
            }
        } catch (_) { videoTrack = null; capabilities = {}; }
    }

    // ── Exposure control ────────────────────────────────────────────────────
    async function setContinuousExposure() {
        if (!videoTrack) return;
        const caps = videoTrack.getCapabilities?.() || {};
        if (!caps.exposureMode?.includes("continuous")) return;
        try {
            await videoTrack.applyConstraints({ advanced: [{ exposureMode: "continuous" }] });
        } catch (_) { /* not supported */ }
    }

    async function lockExposure() {
        if (!videoTrack) return;
        const caps = videoTrack.getCapabilities?.() || {};
        if (!caps.exposureMode?.includes("manual")) return;
        try {
            await videoTrack.applyConstraints({ advanced: [{ exposureMode: "manual" }] });
        } catch (_) { /* stay on continuous */ }
    }

    // ── Torch controller ────────────────────────────────────────────────────
    function initTorch(container) {
        if (!capabilities.torch) return;
        const btn = document.createElement("button");
        btn.id = "torchBtn";
        btn.title = "Toggle Flashlight";
        btn.textContent = "🔦";
        btn.addEventListener("click", async () => {
            try {
                if (torchOn) {
                    await cameraEnhancer.turnOffTorch();
                    torchOn = false;
                    btn.classList.remove("torch-on");
                } else {
                    await cameraEnhancer.turnOnTorch();
                    torchOn = true;
                    btn.classList.add("torch-on");
                }
            } catch (_) { /* torch not available */ }
        });
        container.appendChild(btn);
    }

    // ── Pinch-to-zoom ───────────────────────────────────────────────────────
    function getPinchDist(touches) {
        return Math.hypot(
            touches[1].clientX - touches[0].clientX,
            touches[1].clientY - touches[0].clientY
        );
    }

    function attachPinchZoom(el) {
        el.addEventListener("touchstart", (e) => {
            if (e.touches.length !== 2) return;
            pinchStartDist = getPinchDist(e.touches);
            cameraEnhancer?.getZoomFactor?.()
                .then(f => { pinchStartZoom = f || 1; })
                .catch(() => { pinchStartZoom = 1; });
        }, { passive: true });

        el.addEventListener("touchmove", async (e) => {
            if (e.touches.length !== 2) return;
            e.preventDefault();
            const ratio   = getPinchDist(e.touches) / (pinchStartDist || 1);
            const zCaps   = capabilities.zoom;
            const zMin    = zCaps?.min ?? CONFIG.ZOOM_MIN;
            const zMax    = zCaps?.max ?? CONFIG.ZOOM_MAX;
            const factor  = Math.max(zMin, Math.min(pinchStartZoom * ratio, zMax));
            try { await cameraEnhancer.setZoomFactor(factor); } catch (_) { /* unsupported */ }
        }, { passive: false });
    }

    // ── Tap-to-focus ────────────────────────────────────────────────────────
    function initFocusIndicator(container) {
        const indicator = document.createElement("div");
        indicator.id = "focusIndicator";
        container.appendChild(indicator);

        let resetTimer = null;

        function onTap(e) {
            if (!cameraOpen) return;
            const rect    = readerEl.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            const x = clientX - rect.left;
            const y = clientY - rect.top;

            indicator.style.left = x + "px";
            indicator.style.top  = y + "px";
            indicator.classList.remove("active");
            void indicator.offsetWidth;
            indicator.classList.add("active");
            if (resetTimer) clearTimeout(resetTimer);
            resetTimer = setTimeout(() => indicator.classList.remove("active"), 600);

            try {
                cameraEnhancer.setFocus({
                    mode: "manual",
                    area: {
                        centerPoint: { x: x / rect.width, y: y / rect.height },
                        width: 0.3, height: 0.3,
                    },
                });
            } catch (_) {
                try {
                    cameraEnhancer.enableEnhancedFeatures(
                        Dynamsoft.DCE.EnumEnhancerFeatures.EF_ENHANCED_FOCUS
                    );
                } catch (_2) { /* unsupported */ }
            }
        }

        readerEl.addEventListener("click",      onTap, { passive: true });
        readerEl.addEventListener("touchstart", onTap, { passive: true });
    }

    // ── Public engine interface ─────────────────────────────────────────────
    return {
        name: "dynamsoft",

        // Throws on any failure — ScannerFacade will catch and fall back
        async init() {
            ScannerDebug.init(document.querySelector(".camera-container"));
            await Dynamsoft.License.LicenseManager.initLicense(CONFIG.LICENSE_KEY);
            Dynamsoft.Core.CoreModule.loadWasm(["DBR"]); // non-blocking preload

            cvRouter       = await Dynamsoft.CVR.CaptureVisionRouter.createInstance();
            cameraView     = await Dynamsoft.DCE.CameraView.createInstance(readerEl);
            cameraEnhancer = await Dynamsoft.DCE.CameraEnhancer.createInstance(cameraView);

            await cvRouter.setInput(cameraEnhancer);
            const templateNames = await cvRouter.getTemplateNames();
            if (!templateNames.includes("ReadSingleBarcode")) {
                throw new Error(`ReadSingleBarcode is unavailable. Templates: ${templateNames.join(", ")}`);
            }
            ScannerDebug.set("template", "ReadSingleBarcode: CONFIGURING");
            console.log("[Scanner Debug] Available templates:", templateNames);
            await configureDecoder();
            await cvRouter.addResultReceiver({
                onCapturedResultReceived,
                onOriginalImageResultReceived,
                onDecodedBarcodesReceived,
            });
            console.log("[Scanner Debug] Dynamsoft initialized");

        },

        async open() {
            const container = document.querySelector(".camera-container");

            if (!cameraOpen) {
                ScannerDebug.reset();
                routerFrameCount = 0;
                genericResultLogCount = 0;
                decodedResultLogCount = 0;
                StatusBadge.info("Starting Camera...");
                try {
                    await cameraEnhancer.open();
                    cameraOpen = true;
                    const { video, tracks } = await getVideoAndTracks();
                    const trackCount = tracks.length;
                    ScannerDebug.set("videoTracks", trackCount);
                    ScannerDebug.set("camera", trackCount > 0 ? "OK" : "ERROR: no active video track");
                    if (!trackCount) throw new Error("CameraEnhancer opened without an active video track");
                    startVideoFrameMonitor(video);
                    console.log("[Scanner Debug] Camera opened");
                } catch (err) {
                    ScannerDebug.set("camera", `ERROR: ${err?.message || err}`);
                    recordError("Camera open", err);
                    throw err;
                }

            } else {
                DuplicateGuard.reset();
            }

            await this.resume();
        },

        async resume() {
            if (capturing) return;
            try {
                await cvRouter.startCapturing("ReadSingleBarcode");
                capturing = true;
                ScannerDebug.set("capture", "OK");
                ScannerDebug.set("template", "ReadSingleBarcode: STARTED");
                console.log("[Scanner Debug] Capture started");
                StatusBadge.scanning();
            } catch (err) {
                ScannerDebug.set("capture", `ERROR: ${err?.message || err}`);
                recordError("Capture start", err);
                throw err;
            }
        },

        pause() {
            if (!capturing) return;
            try {
                cvRouter.stopCapturing();
                capturing = false;
                StatusBadge.processing();
            } catch (err) {
                recordError("Capture pause", err);
            }
        },

        async close() {
            DuplicateGuard.reset();
            stopVideoFrameMonitor();

            try {
                if (capturing) { cvRouter.stopCapturing(); capturing = false; }
            } catch (err) { recordError("Capture stop", err); }

            try {
                if (cameraOpen) { await cameraEnhancer.close(); cameraOpen = false; }
            } catch (err) { recordError("Camera close", err); }
            closeCameraOverlay();
            StatusBadge.ready();
        },
    };
})();

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 14: ENGINE — HTML5-QRCODE (Fallback)
// Implements the same interface: init(), open(), pause(), resume(), close()
// Loaded dynamically only when Dynamsoft fails.
// ─────────────────────────────────────────────────────────────────────────────

const Html5QrEngine = (() => {
    let scanner     = null;
    let cameraOpen  = false;
    let paused      = false;

    function onScanSuccess(decodedText) {
        onBarcodeDecoded(decodedText, null); // no location points from html5-qrcode
    }

    function onScanFailure() { /* suppress scan-attempt errors */ }

    return {
        name: "html5qrcode",

        // Loads the CDN script if not already present — throws on network failure
        async init() {
            await loadScript(CONFIG.HTML5QRCODE_CDN);
            if (!window.Html5Qrcode) {
                throw new Error("Html5Qrcode class not found after script load");
            }
            if (typeof window.Html5QrcodeSupportedFormats?.CODE_128 !== "number") {
                throw new Error("html5-qrcode CODE_128 format is unavailable");
            }
            // A failed Dynamsoft initialization can leave its view in #reader.
            // The fallback owns this element, so start it with an empty host.
            document.getElementById("reader")?.replaceChildren();
            scanner = new Html5Qrcode("reader");
        },

        async open() {
            if (!cameraOpen) {
                StatusBadge.info("Starting Camera...");
                await scanner.start(
                    { facingMode: "environment" },
                    {
                        fps: 10,
                        formatsToSupport: [Html5QrcodeSupportedFormats.CODE_128],
                        disableFlip:      true,
                    },
                    onScanSuccess,
                    onScanFailure
                );
                cameraOpen = true;
                paused     = false;
                AudioFeedback.startup();
                StatusBadge.scanning();
            } else {
                // Camera already open — just resume
                await this.resume();
            }
        },

        async resume() {
            if (!cameraOpen || !paused) return;
            try {
                scanner.resume();
                paused = false;
                DuplicateGuard.reset();
                StatusBadge.scanning();
            } catch (_) { /* ignore */ }
        },

        pause() {
            if (!cameraOpen || paused) return;
            try {
                // pause(true) suspends video rendering to save battery
                scanner.pause(true);
                paused = true;
                StatusBadge.processing();
            } catch (_) { /* ignore */ }
        },

        async close() {
            DuplicateGuard.reset();
            try {
                if (cameraOpen) {
                    await scanner.stop();
                    await scanner.clear();
                    cameraOpen = false;
                    paused     = false;
                }
            } catch (_) { /* ignore */ }
            closeCameraOverlay();
            StatusBadge.ready();
        },
    };
})();

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 15: SCANNER FACADE
// Tries Dynamsoft first. On any failure → falls back to Html5QrEngine.
// Both engines expose the same interface so the caller never needs to know.
// ─────────────────────────────────────────────────────────────────────────────

const ScannerFacade = {
    async init() {
        let dynamsoftError = null;
        // ── Try Dynamsoft ────────────────────────────────────────────────────
        try {
            await withTimeout(
                DynamsoftEngine.init(),
                CONFIG.DYNAMSOFT_INIT_TIMEOUT_MS,
                "Dynamsoft init"
            );
            State.activeEngine = DynamsoftEngine;
            State.engineName   = "dynamsoft";
            State.ready        = true;
            console.log("[Scanner] Engine: Dynamsoft Barcode Reader 11.4 ✓");
            return;
        } catch (err) {
            dynamsoftError = err;
            ScannerDebug.error(`Dynamsoft initialization: ${err?.message || err}`);
            console.warn(
                "[Scanner] Dynamsoft unavailable. Falling back to html5-qrcode.\n" +
                "  Reason:", err?.message || err
            );
        }

        // ── Fallback: html5-qrcode ───────────────────────────────────────────
        try {
            await withTimeout(
                Html5QrEngine.init(),
                CONFIG.DYNAMSOFT_INIT_TIMEOUT_MS,
                "html5-qrcode init"
            );
            State.activeEngine = Html5QrEngine;
            State.engineName   = "html5qrcode";
            State.ready        = true;
            ScannerDebug.set("engine", "html5qrcode (fallback)");
            ScannerDebug.set("capture", "Fallback active");
            ScannerDebug.set("template", "CODE_128 only");
            console.log("[Scanner] Engine: html5-qrcode (fallback) ✓");
            return;
        } catch (err2) {
            const combinedError = new Error(
                `Dynamsoft initialization failed: ${dynamsoftError?.message || dynamsoftError}. ` +
                `html5-qrcode initialization failed: ${err2?.message || err2}`
            );
            ScannerDebug.set("engine", "none");
            ScannerDebug.error(combinedError);
            console.error("[Scanner] Both engines failed to initialize:", combinedError);
            handleFatalError(combinedError);
        }
    },
};

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 16: ERROR HANDLING
// ─────────────────────────────────────────────────────────────────────────────

function handleCameraError(err) {
    closeCameraOverlay();
    const msg = err?.name === "NotAllowedError"
        ? "Camera permission denied.\nPlease allow camera access in your browser settings."
        : err?.name === "NotFoundError"
            ? "No camera found on this device."
            : `Camera error: ${err?.message || err}`;
    alert(msg);
    console.error("[Scanner] Camera error:", err);
}

function handleFatalError(err) {
    const isUnsupported = !window.WebAssembly;
    alert(
        isUnsupported
            ? "This browser does not support the barcode scanner.\nPlease use Chrome or Firefox."
            : `Scanner failed to start: ${err?.message || err}`
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 17: PUBLIC API — openScanner / closeScanner
// These are the only entry points. Both delegate to State.activeEngine.
// ─────────────────────────────────────────────────────────────────────────────

const scanBtn        = document.getElementById("scanBtn");
const closeCameraBtn = document.getElementById("closeCameraBtn");

// Tracks whether init is already in-progress to prevent concurrent calls
let initPromise = null;

async function openScanner() {
    openCameraOverlay();

    // Initialize engines on first use (lazy, one-time)
    if (!State.ready) {
        if (!initPromise) {
            StatusBadge.info("Initializing...");
            initPromise = ScannerFacade.init();
        }
        try {
            await initPromise;
        } catch (_) {
            closeCameraOverlay();
            return;
        }
    }

    if (!State.activeEngine) {
        closeCameraOverlay();
        return;
    }

    try {
        await State.activeEngine.open();
    } catch (err) {
        handleCameraError(err);
    }
}

async function closeScanner() {
    if (!State.activeEngine) {
        closeCameraOverlay();
        return;
    }
    try {
        await State.activeEngine.close();
    } catch (_) {
        closeCameraOverlay();
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 18: VISIBILITY CHANGE — auto-pause when app goes to background
// ─────────────────────────────────────────────────────────────────────────────

document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
        State.activeEngine?.pause();
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 19: EVENT LISTENERS & BACKGROUND WASM PRELOAD
// ─────────────────────────────────────────────────────────────────────────────

scanBtn.addEventListener("click",        openScanner);
closeCameraBtn.addEventListener("click", closeScanner);

// Silently pre-warm Dynamsoft WASM on page load so first scan is instant.
// If this fails (network/license), it's handled gracefully in ScannerFacade.init().
(async () => {
    try {
        await Dynamsoft.License.LicenseManager.initLicense(CONFIG.LICENSE_KEY);
        Dynamsoft.Core.CoreModule.loadWasm(["DBR"]);
    } catch (_) { /* will be handled properly on first openScanner() */ }
})();

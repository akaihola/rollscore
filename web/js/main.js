/**
 * Front-end bootstrap: fetch the library, render the chooser into `#app`, and
 * route an "open" to the reader view.
 *
 * The reader is a single vertical scroll strip of lazily-loaded page images
 * (see `reader.js`). It restores the saved resume position on open and saves it
 * back, throttled, while scrolling (and flushed on unload). On top of that, a
 * gaze loop (`control.js` driving the scroll container) auto-scrolls as the
 * player reads; manual input — keyboard or invisible tap zones (`controls.js`) —
 * preempts the gaze by pausing it. `?fakegaze=1` swaps the camera for a scripted
 * trace so the loop can be demoed without WebGazer.
 *
 * Module scripts are deferred, so the DOM is ready when this runs.
 */
import {
  getLibrary,
  getPages,
  getResume,
  putResume,
  getTuning,
  putTuning,
  getCalibration,
  putCalibration,
  getSystems,
} from "./api.js";
import { buildChooser } from "./chooser.js";
import { scorePath } from "./paths.js";
import {
  applyCropMode,
  buildStrip,
  computeResumeScroll,
  pageToScroll,
  scrollToResume,
  setAnnotation,
  throttle,
  onScoreEnd,
  pieceJumpPage,
} from "./reader.js";
import { createGazeController, createSystemController, isReading } from "./gaze/control.js";
import { createGazeDots, createSystemOverlay } from "./gaze/overlay.js";
import { WebGazerGazeSource } from "./gaze/webgazer-source.js";
import {
  applyRecenter,
  computeRecenterOffset,
  runCalibration,
  serializeCalibration,
  currentOrientation,
  isCalibrationValidForScale,
} from "./gaze/calibration.js";
import { bindControls } from "./controls.js";
import { buildTuningPanel } from "./tuning.js";

const app = document.getElementById("app");

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function showError(message) {
  app.replaceChildren(el("p", "error", message));
}

/** Parse `/score/<file>[?page=n]` from the URL, or `null` for any other path. */
function parsePath() {
  const m = location.pathname.match(/^\/score\/(.+)$/);
  if (!m) return null;
  const file = decodeURIComponent(m[1]);
  const page = Number(new URLSearchParams(location.search).get("page")) || 1;
  return { file, page };
}

/** Are we in cameraless dev mode (`?fakegaze` / `?fakegaze=1`)? */
function fakeGazeMode() {
  return new URLSearchParams(window.location.search).has("fakegaze");
}

/**
 * A scripted {@link GazeSource} for `?fakegaze` mode: emits, on a timer, a steady
 * *descending* reading trace — gaze inside the music column, y ramping downward
 * at a comfortable reading pace — so the velocity estimator sees positive motion
 * and the controller scrolls forward without a camera. (A static gaze produces
 * zero reading velocity and so, by design, no scroll; the trace must move.) The
 * y ramp wraps within the column so it stays on-screen; the single wrap frame is
 * absorbed by the controller's forward-only clamp. Deterministic in shape — the
 * unit tests use `ScriptedGazeSource`; this is its real-time sibling for demos.
 */
function createFakeGaze(scroller) {
  let cb = null;
  let timer = null;
  let yFrac = 0.4; // column-relative read position, wraps 0.4 → 0.75
  return {
    onSample(fn) {
      cb = fn;
    },
    start() {
      timer = setInterval(() => {
        const r = scroller.getBoundingClientRect();
        yFrac += 0.012; // ~reading pace at 33 ms/frame
        if (yFrac > 0.75) yFrac = 0.4;
        cb?.({
          t: performance.now(),
          x: r.left + r.width * 0.5,
          y: r.top + r.height * yFrac,
          confidence: 1,
        });
      }, 33);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}

/** Inject the (gitignored, on-demand) WebGazer build as a global script. */
function loadWebgazer() {
  if (window.webgazer) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "/web/vendor/webgazer.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("WebGazer failed to load (vendor/webgazer.js)"));
    document.head.append(s);
  });
}

/**
 * Build the controller params from the saved tuning, converting the stored
 * column-edge *fractions* into pixels relative to the scroller (gaze x/y arrive
 * in scroller-relative pixels, so the on-music gate must match those units).
 */
function controllerParams(tuning, rect) {
  return {
    ...tuning,
    columnX0: tuning.columnX0 * rect.width,
    columnX1: tuning.columnX1 * rect.width,
  };
}

async function openReader({ file, page, pieces = [], setlist = null, initialCropMode = true }) {
  // Build the shell first so we can measure the scroller's width before sizing
  // the page strip, then fill it once the page metadata arrives.
  const root = el("div", "reader");
  const bar = el("div", "toolbar");
  const back = el("button", null, "← Library");
  const annotateBtn = el("button", null, "Annotations: on");
  const cropBtn = el("button", null, "Crop: on");
  const gazeBtn = el("button", null, "Gaze: off");
  const status = el("span", "status");
  bar.append(back, annotateBtn, cropBtn, gazeBtn, status);
  const scroller = el("div", "scroller");
  root.append(bar, scroller);
  app.replaceChildren(root);

  let currentOrient = currentOrientation();
  let extDims, resume, tuning, savedCal;
  try {
    [extDims, resume, tuning, savedCal] = await Promise.all([
      getPages(file),
      getResume(file),
      getTuning(),
      getCalibration(currentOrient).catch(() => null),
    ]);
  } catch (err) {
    showError(`Could not open ${file}: ${err.message}`);
    return;
  }

  let annotated = true;
  let cropMode = initialCropMode; // cropped by default; z key toggles
  const strip = buildStrip({ file, pageDims: extDims, annotated });
  scroller.append(strip);
  applyCropMode(strip, extDims, cropMode);

  // Pages are responsive (width: 100%), so the geometry depends on the actual
  // rendered width — measured fresh so it stays correct across a window resize.
  const stripWidth = () => strip.clientWidth || scroller.clientWidth || window.innerWidth;

  // Restore: a saved resume wins; otherwise jump to the requested piece page.
  scroller.scrollTop = resume
    ? computeResumeScroll(extDims, stripWidth(), resume)
    : pageToScroll(extDims, stripWidth(), page);

  const save = throttle(() => {
    putResume(file, scrollToResume(extDims, stripWidth(), scroller.scrollTop)).catch(
      () => {}
    );
  }, 1000);
  scroller.addEventListener("scroll", save);
  const flush = () => save.flush();
  window.addEventListener("beforeunload", flush);

  // ---- System-aware scrolling (Phase 14) ----------------------------------
  // Fetch the per-page detected system boxes once (off the render path; empty on
  // failure so the reader still works). They live in full-page canvas px; map a
  // page's boxes into strip coords with the same `stripWidth / canvasWidth` scale
  // the page images use, offset by the page's strip position. Recomputed per
  // frame from the measured width so it survives a resize.
  const systemsRaw = await getSystems(file).catch(() => []);

  function pageStripBoxes(pageNum, w) {
    const boxes = systemsRaw[pageNum - 1] || [];
    const scale = w / (extDims[pageNum - 1]?.width || 1);
    const offset = pageToScroll(extDims, w, pageNum);
    return boxes.map((b) => ({
      top: offset + b.top * scale,
      bottom: offset + b.bottom * scale,
      left: b.left * scale,
      right: b.right * scale,
    }));
  }

  // The whole score as one continuous top→bottom stack of systems (strip coords,
  // already offset per page), each tagged with its `page`/`idx` for the overlay.
  // This is what the system controller reads, so the active system advances across
  // a page boundary instead of stalling at the last system of the current page.
  function allStripBoxes(w) {
    const out = [];
    for (let p = 1; p <= extDims.length; p++) {
      pageStripBoxes(p, w).forEach((b, idx) => out.push({ ...b, page: p - 1, idx }));
    }
    return out;
  }

  // First system not yet scrolled past — used to re-seat the forward-only selector
  // after an external scroll (resume, manual nudge/jump, wheel/touch).
  function activeAtScroll(flat, scrollTop) {
    for (let i = 0; i < flat.length; i++) if (flat[i].bottom > scrollTop + 1) return i;
    return Math.max(0, flat.length - 1);
  }

  const sysController = createSystemController(
    controllerParams(tuning, scroller.getBoundingClientRect())
  );
  let lastAppliedScroll = null; // scrollTop the controller last set (detects manual scroll)

  // The overlay positions boxes in page-relative % (resize-independent) and nests
  // them per page so they inherit the crop transform; pass raw canvas boxes + dims.
  const overlay = createSystemOverlay(strip, systemsRaw, extDims, {
    opacity: tuning.overlayOpacity,
    fadeMs: tuning.overlayFadeMs,
  });
  const gazeDots = createGazeDots();
  let overlayOn = false;
  applyCropMode(strip, extDims, cropMode); // re-apply now the overlay containers exist

  // ---- Gaze loop ----------------------------------------------------------
  const controller = createGazeController(
    controllerParams(tuning, scroller.getBoundingClientRect())
  );
  let latestSample = null;
  let recenterOffset = 0;
  let paused = true; // gaze starts disengaged; the player opts in (Space)
  let rafId = null;
  let nextAffordance = null; // the setlist "next is …" banner, when shown
  let calibration = null; // active runCalibration handle (its dots), or null
  let dprQuery = null; // matchMedia listener for zoom guard
  let pausedForZoom = false; // true when gaze was paused by a zoom change

  function onDprChange() {
    if (dprQuery && !dprQuery.matches) {
      if (!paused) {
        setPaused(true);
        pausedForZoom = true;
        status.textContent = "Browser zoom changed — reset zoom (Ctrl+0) to resume gaze";
      }
    } else if (pausedForZoom) {
      pausedForZoom = false;
      setPaused(false);
      status.textContent = "Zoom restored — gaze resumed";
    }
  }

  function bindDprGuard(entry) {
    dprQuery?.removeEventListener("change", onDprChange);
    dprQuery = null;
    if (!entry?.dpr) return;
    dprQuery = matchMedia(`(resolution: ${entry.dpr}dppx)`);
    dprQuery.addEventListener("change", onDprChange);
  }

  function applyCalibrationEntry(entry) {
    if (!entry) return;
    if (!isCalibrationValidForScale(entry, window.devicePixelRatio)) {
      status.textContent = "Saved calibration trained at different zoom — reset zoom (Ctrl+0) or recalibrate";
      return;
    }
    source?.setCalibration?.(entry.blob);
    bindDprGuard(entry);
  }

  function flushCalibration() {
    const entry = serializeCalibration();
    if (entry) putCalibration(entry, currentOrient).catch(() => {});
  }

  function onFullscreenChange() {
    if (!document.fullscreenElement && !paused) {
      setPaused(true);
      status.textContent = "Fullscreen exited — gaze paused";
    }
  }

  async function onOrientationChange() {
    flushCalibration();
    currentOrient = currentOrientation();
    bindDprGuard(null);
    try {
      const entry = await getCalibration(currentOrient);
      if (entry) {
        applyCalibrationEntry(entry);
        if (source && isCalibrationValidForScale(entry, window.devicePixelRatio)) {
          status.textContent = `Orientation changed — ${currentOrient} calibration restored`;
        }
      } else {
        setPaused(true);
        status.textContent = `No calibration for ${currentOrient} — press c to calibrate`;
      }
    } catch {
      // ignore API error on orientation swap
    }
  }

  document.addEventListener("fullscreenchange", onFullscreenChange);
  window.addEventListener("orientationchange", onOrientationChange);

  // ---- Dev tuning panel (hidden; toggled with `t`) ------------------------
  // Sliders edit `tuning` live: most params feed straight into the controller;
  // the column edges are stored as fractions but the controller wants pixels.
  // Changes are persisted (throttled) so a good tuning survives a reload.
  const pendingTuning = {}; // accumulates dirty keys between throttled PUTs
  const flushTuning = throttle(() => {
    const keys = Object.keys(pendingTuning);
    if (keys.length === 0) return;
    const batch = {};
    for (const k of keys) {
      batch[k] = pendingTuning[k];
      delete pendingTuning[k];
    }
    putTuning(batch).catch(() => {});
  }, 500);
  const tuningPanel = buildTuningPanel(tuning, (key, value) => {
    tuning[key] = value;
    pendingTuning[key] = value;
    const w = scroller.getBoundingClientRect().width;
    const update =
      key === "columnX0" || key === "columnX1" ? { [key]: value * w } : { [key]: value };
    controller.setParams(update);
    sysController.setParams(update);
    if (key === "overlayOpacity") overlay.setParams({ opacity: value });
    if (key === "overlayFadeMs") overlay.setParams({ fadeMs: value });
    flushTuning();
  });
  tuningPanel.hidden = true;
  document.body.append(tuningPanel);

  function setPaused(p) {
    paused = p;
    gazeBtn.textContent = `Gaze: ${p ? "off" : "on"}`;
    if (!p && !document.fullscreenElement) {
      scroller.requestFullscreen?.().catch(() => {
        status.textContent = "Fullscreen unavailable — gaze may be inaccurate";
      });
    }
  }

  function clearAffordance() {
    if (nextAffordance) {
      nextAffordance.remove();
      nextAffordance = null;
    }
  }

  // When a setlist piece scrolls to its end, stop and wait — never auto-advance.
  function maybeSetlistEnd() {
    if (!setlist || nextAffordance) return;
    const maxScroll = scroller.scrollHeight - scroller.clientHeight;
    if (scroller.scrollTop < maxScroll - 4) return;
    const { next, message } = onScoreEnd({ setlist });
    if (!next) return;
    setPaused(true);
    const banner = el("div", "setlist-next");
    banner.append(el("span", null, message));
    const go = el("button", null, "Open next →");
    go.addEventListener("click", () => {
      // Navigate to the next score's permalink. The setlist running-order context
      // is not carried in the URL (a permalink opens the score standalone — design
      // Non-Goal); saved-resume restores its position.
      teardown();
      location.assign(scorePath(next.file, 1));
    });
    banner.append(go);
    document.body.append(banner);
    nextAffordance = banner;
  }

  function frame() {
    if (!paused && latestSample) {
      const rect = scroller.getBoundingClientRect();
      const x = latestSample.x - rect.left;
      const y = applyRecenter(latestSample.y - rect.top, recenterOffset);
      const view = {
        viewportH: rect.height,
        scrollTop: scroller.scrollTop,
        contentH: scroller.scrollHeight,
      };

      // System-aware path over the whole score as one continuous stack of systems,
      // so the active system advances across page boundaries; the vertical-gaze
      // follower is the fallback when the score has no detected systems (design D5).
      const w = stripWidth();
      const flat = allStripBoxes(w);

      // After an external scroll (resume, manual nudge/jump, wheel/touch) re-seat
      // the forward-only selector to the system we're actually at.
      if (lastAppliedScroll === null || Math.abs(scroller.scrollTop - lastAppliedScroll) > 1) {
        sysController.reset(activeAtScroll(flat, scroller.scrollTop));
      }

      // Always run the vertical controller to get smoothedY for the gaze dot,
      // even when the system path handles scrolling (only its scrollTop is skipped).
      const { scrollTop: vertScrollTop, smoothedY } = controller.update(
        { t: latestSample.t, x, y, confidence: latestSample.confidence },
        view
      );

      // Fullscreen gate: dots always visible (helps calibration); scrolling only in fullscreen.
      const inFullscreen = !!document.fullscreenElement;
      let handled = false;
      if (flat.length) {
        const colX0 = tuning.columnX0 * rect.width;
        const colX1 = tuning.columnX1 * rect.width;
        const fx =
          colX1 > colX0 ? Math.max(0, Math.min(1, (x - colX0) / (colX1 - colX0))) : 0.5;
        const reading = isReading(
          { x, confidence: latestSample.confidence },
          { columnX0: colX0, columnX1: colX1, minConfidence: tuning.minConfidence }
        );
        const res = sysController.update({ boxes: flat, fx, reading, ...view });
        if (res && inFullscreen) {
          scroller.scrollTop = res.scrollTop;
          lastAppliedScroll = scroller.scrollTop;
          if (overlayOn) {
            const b = flat[res.active];
            overlay.setActive(b ? b.page : null, b ? b.idx : null);
          }
          handled = true;
        }
      }
      if (!handled && inFullscreen) {
        scroller.scrollTop = vertScrollTop;
        lastAppliedScroll = scroller.scrollTop;
        if (overlayOn) overlay.setActive(null, null); // fallback shows no box
      }

      // Dual gaze dots: gray = raw WebGazer (viewport coords), red = control path
      // (raw x, smoothedY — exactly what the scroll controller receives).
      gazeDots.update(
        latestSample.x, latestSample.y,
        latestSample.x, rect.top + smoothedY,
      );

      maybeSetlistEnd();
    } else {
      gazeDots.hide();
    }
    rafId = requestAnimationFrame(frame);
  }

  const fake = fakeGazeMode();
  let source = null;
  try {
    if (fake) {
      source = createFakeGaze(scroller);
    } else {
      await loadWebgazer();
      source = new WebGazerGazeSource();
    }
    source.onSample((s) => {
      latestSample = s;
    });
    await source.start();
    applyCalibrationEntry(savedCal); // Task 6.1: restore for current orientation
    // WebGazer's camera preview is fixed at the top-left and would cover the
    // toolbar buttons; drop it just below the toolbar.
    const videoBox = document.getElementById("webgazerVideoContainer");
    if (videoBox) videoBox.style.top = `${bar.getBoundingClientRect().height}px`;
  } catch (err) {
    status.textContent = `Gaze unavailable: ${err.message}`;
    source = null;
  }
  if (source && !status.textContent) {
    status.textContent = fake
      ? "fake gaze — press Space to start"
      : "calibrate: look at the cursor, press g (or Shift+click where you look; repeat across the screen) · Space to start";
  }
  if (rafId === null) rafId = requestAnimationFrame(frame);

  // ---- Controls (keyboard + tap zones) ------------------------------------
  // Track the cursor without training on it: WebGazer's own move/click listeners
  // are removed (they made an idle gaze snap to the cursor), so calibration is
  // opt-in — the player looks at the cursor and presses `g` to record a point.
  let cursorX = 0;
  let cursorY = 0;
  const onMove = (e) => {
    cursorX = e.clientX;
    cursorY = e.clientY;
  };
  window.addEventListener("mousemove", onMove);

  function recordCalibrationAt(x, y) {
    const wg = window.webgazer;
    if (!wg?.recordScreenPosition) return;
    wg.recordScreenPosition(x, y, "click");
    const entry = serializeCalibration();
    if (entry) putCalibration(entry, currentOrient).catch(() => {});
    status.textContent = "calibration point added — press g at the cursor or Shift+click where you look";
  }

  function captureCalibration() {
    recordCalibrationAt(cursorX, cursorY);
  }

  function currentPage() {
    return scrollToResume(extDims, stripWidth(), scroller.scrollTop).page;
  }

  function jumpPiece(dir) {
    setPaused(true); // a manual jump preempts the gaze
    clearAffordance();
    const target = pieceJumpPage(pieces, currentPage(), dir);
    if (target != null) {
      scroller.scrollTop = pageToScroll(extDims, stripWidth(), target);
    }
  }

  async function startCalibration() {
    calibration?.cancel(); // re-pressing `c` restarts: clear the old grid first
    setPaused(true);
    status.textContent = "Calibrating — click each dot";
    const handle = runCalibration({ document, webgazer: window.webgazer });
    calibration = handle;
    const completed = await handle;
    if (calibration === handle) calibration = null; // only the live one clears state
    if (completed) {
      const entry = serializeCalibration();
      if (entry) putCalibration(entry, currentOrient).catch(() => {});
      bindDprGuard(entry);
      status.textContent = "Calibrated";
    }
  }

  let teardown; // forward-declared so handlers can close over it

  const unbind = bindControls(scroller, {
    togglePause: () => {
      clearAffordance();
      setPaused(!paused);
    },
    recenter: () => {
      if (!latestSample) return;
      const rect = scroller.getBoundingClientRect();
      const rawY = latestSample.y - rect.top;
      recenterOffset = computeRecenterOffset(rawY, rect.height * tuning.setpoint);
    },
    nudge: (dir) => {
      setPaused(true); // manual nudge preempts the gaze
      clearAffordance();
      scroller.scrollBy({ top: dir * scroller.clientHeight * 0.3, behavior: "smooth" });
    },
    prevPiece: () => jumpPiece(-1),
    nextPiece: () => jumpPiece(1),
    backToChooser: () => {
      teardown();
      location.assign("/");
    },
    toggleAnnotations: () => {
      annotated = !annotated;
      setAnnotation(strip, file, annotated);
      annotateBtn.textContent = `Annotations: ${annotated ? "on" : "off"}`;
    },
    toggleCrop: () => {
      cropMode = !cropMode;
      applyCropMode(strip, extDims, cropMode);
      cropBtn.textContent = `Crop: ${cropMode ? "on" : "off"}`;
    },
    startCalibration,
    captureCalibration,
    calibrateAt: recordCalibrationAt,
    toggleTuning: () => {
      tuningPanel.hidden = !tuningPanel.hidden;
    },
    toggleSystemOverlay: () => {
      overlayOn = !overlayOn;
      overlay.setVisible(overlayOn);
      if (overlayOn) {
        // Light the current page's first system immediately so "is it registered?"
        // is answerable without engaging gaze; the gaze loop then crossfades the
        // active system as you read.
        overlay.setActive(currentPage() - 1, 0);
        status.textContent =
          "Overlay: on — current system highlighted; start gaze (Space) and read to see it track";
      } else {
        overlay.setActive(null, null);
        status.textContent = "Overlay: off";
      }
    },
  });

  teardown = () => {
    save.flush();
    flushTuning.flush();
    flushCalibration(); // Task 6.4: flush under current orientation
    dprQuery?.removeEventListener("change", onDprChange);
    document.removeEventListener("fullscreenchange", onFullscreenChange);
    window.removeEventListener("orientationchange", onOrientationChange);
    cancelAnimationFrame(rafId);
    source?.stop();
    unbind();
    clearAffordance();
    calibration?.cancel(); // leaving for the library removes any open cal dots
    tuningPanel.remove();
    overlay.remove();
    gazeDots.remove();
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("beforeunload", flush);
  };

  // Toolbar buttons mirror the keyboard handlers for mouse users.
  back.addEventListener("click", () => {
    teardown();
    location.assign("/");
  });
  annotateBtn.addEventListener("click", () => {
    annotated = !annotated;
    setAnnotation(strip, file, annotated);
    annotateBtn.textContent = `Annotations: ${annotated ? "on" : "off"}`;
  });
  cropBtn.addEventListener("click", () => {
    cropMode = !cropMode;
    applyCropMode(strip, extDims, cropMode);
    cropBtn.textContent = `Crop: ${cropMode ? "on" : "off"}`;
  });
  gazeBtn.addEventListener("click", () => {
    clearAffordance();
    setPaused(!paused);
  });
}

async function boot() {
  try {
    const model = await getLibrary();
    app.replaceChildren(buildChooser(model));
  } catch (err) {
    showError(`Could not load library: ${err.message}`);
  }
}

/**
 * Route from the URL path: `/score/<file>` opens that score in the reader (a
 * direct load has no chooser model in memory, so fetch the library for the
 * score's pieces); an unknown filename or any other path falls back to the
 * chooser.
 */
async function route() {
  const target = parsePath();
  if (!target) {
    boot();
    return;
  }
  let model;
  try {
    model = await getLibrary();
  } catch (err) {
    showError(`Could not load library: ${err.message}`);
    return;
  }
  const score = model.scores[target.file];
  if (!score) {
    boot();
    return;
  }
  openReader({ file: target.file, page: target.page, pieces: score.pieces ?? [] });
}

route();

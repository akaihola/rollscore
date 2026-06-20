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
  getCalibration,
  putCalibration,
} from "./api.js";
import { buildChooser } from "./chooser.js";
import {
  buildStrip,
  computeResumeScroll,
  pageToScroll,
  scrollToResume,
  setAnnotation,
  throttle,
  onScoreEnd,
  pieceJumpPage,
} from "./reader.js";
import { createGazeController } from "./gaze/control.js";
import { WebGazerGazeSource } from "./gaze/webgazer-source.js";
import {
  applyRecenter,
  computeRecenterOffset,
  runCalibration,
  restoreCalibration,
} from "./gaze/calibration.js";
import { bindControls } from "./controls.js";

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

async function openReader({ file, page, pieces = [], setlist = null }) {
  // Build the shell first so we can measure the scroller's width before sizing
  // the page strip, then fill it once the page metadata arrives.
  const root = el("div", "reader");
  const bar = el("div", "toolbar");
  const back = el("button", null, "← Library");
  const annotateBtn = el("button", null, "Annotations: on");
  const gazeBtn = el("button", null, "Gaze: off");
  const status = el("span", "status");
  bar.append(back, annotateBtn, gazeBtn, status);
  const scroller = el("div", "scroller");
  root.append(bar, scroller);
  app.replaceChildren(root);

  let pageDims, resume, tuning, savedCal;
  try {
    [pageDims, resume, tuning, savedCal] = await Promise.all([
      getPages(file),
      getResume(file),
      getTuning(),
      getCalibration().catch(() => null),
    ]);
  } catch (err) {
    showError(`Could not open ${file}: ${err.message}`);
    return;
  }

  let annotated = true;
  const strip = buildStrip({ file, pageDims, annotated });
  scroller.append(strip);

  // Pages are responsive (width: 100%), so the geometry depends on the actual
  // rendered width — measured fresh so it stays correct across a window resize.
  const stripWidth = () => strip.clientWidth || scroller.clientWidth || window.innerWidth;

  // Restore: a saved resume wins; otherwise jump to the requested piece page.
  scroller.scrollTop = resume
    ? computeResumeScroll(pageDims, stripWidth(), resume)
    : pageToScroll(pageDims, stripWidth(), page);

  const save = throttle(() => {
    putResume(file, scrollToResume(pageDims, stripWidth(), scroller.scrollTop)).catch(
      () => {}
    );
  }, 1000);
  scroller.addEventListener("scroll", save);
  const flush = () => save.flush();
  window.addEventListener("beforeunload", flush);

  // ---- Gaze loop ----------------------------------------------------------
  const controller = createGazeController(
    controllerParams(tuning, scroller.getBoundingClientRect())
  );
  let latestSample = null;
  let recenterOffset = 0;
  let paused = true; // gaze starts disengaged; the player opts in (Space)
  let rafId = null;
  let nextAffordance = null; // the setlist "next is …" banner, when shown

  function setPaused(p) {
    paused = p;
    gazeBtn.textContent = `Gaze: ${p ? "off" : "on"}`;
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
      clearAffordance();
      teardown();
      openReader({
        file: next.file,
        page: 1,
        setlist: { ...setlist, index: setlist.index + 1 },
      });
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
      scroller.scrollTop = controller.update(
        { t: latestSample.t, x, y, confidence: latestSample.confidence },
        {
          viewportH: rect.height,
          scrollTop: scroller.scrollTop,
          contentH: scroller.scrollHeight,
        }
      );
      maybeSetlistEnd();
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
      restoreCalibration(savedCal);
      source = new WebGazerGazeSource();
    }
    source.onSample((s) => {
      latestSample = s;
    });
    await source.start();
    // WebGazer's camera preview is fixed at the top-left and would cover the
    // toolbar buttons; drop it just below the toolbar.
    const videoBox = document.getElementById("webgazerVideoContainer");
    if (videoBox) videoBox.style.top = `${bar.getBoundingClientRect().height}px`;
  } catch (err) {
    status.textContent = `Gaze unavailable: ${err.message}`;
    source = null;
  }
  status.textContent = fake ? "fake gaze — press Space to start" : status.textContent;
  if (rafId === null) rafId = requestAnimationFrame(frame);

  // ---- Controls (keyboard + tap zones) ------------------------------------
  function currentPage() {
    return scrollToResume(pageDims, stripWidth(), scroller.scrollTop).page;
  }

  function jumpPiece(dir) {
    setPaused(true); // a manual jump preempts the gaze
    clearAffordance();
    const target = pieceJumpPage(pieces, currentPage(), dir);
    if (target != null) {
      scroller.scrollTop = pageToScroll(pageDims, stripWidth(), target);
    }
  }

  async function startCalibration() {
    setPaused(true);
    status.textContent = "Calibrating — click each dot";
    const blob = await runCalibration({ document, webgazer: window.webgazer });
    if (blob) putCalibration(blob).catch(() => {});
    status.textContent = "Calibrated";
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
      boot();
    },
    toggleAnnotations: () => {
      annotated = !annotated;
      setAnnotation(strip, file, annotated);
      annotateBtn.textContent = `Annotations: ${annotated ? "on" : "off"}`;
    },
    startCalibration,
  });

  teardown = () => {
    save.flush();
    cancelAnimationFrame(rafId);
    source?.stop();
    unbind();
    clearAffordance();
    window.removeEventListener("beforeunload", flush);
  };

  // Toolbar buttons mirror the keyboard handlers for mouse users.
  back.addEventListener("click", () => {
    teardown();
    boot();
  });
  annotateBtn.addEventListener("click", () => {
    annotated = !annotated;
    setAnnotation(strip, file, annotated);
    annotateBtn.textContent = `Annotations: ${annotated ? "on" : "off"}`;
  });
  gazeBtn.addEventListener("click", () => {
    clearAffordance();
    setPaused(!paused);
  });
}

async function boot() {
  try {
    const model = await getLibrary();
    app.replaceChildren(buildChooser(model, { onOpen: openReader }));
  } catch (err) {
    showError(`Could not load library: ${err.message}`);
  }
}

boot();

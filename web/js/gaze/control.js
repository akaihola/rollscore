/**
 * Pure gaze-control core: smoothing, on-music gating, reading-velocity
 * estimation, and the scroll controller. No camera, no DOM — every function is
 * deterministic over its inputs so it can be unit-tested against synthetic gaze
 * traces (see `tests/control.test.js`).
 */

/**
 * Median-then-EMA smoother for a noisy 1-D signal (the gaze y-coordinate).
 *
 * A `medianWindow`-sample ring buffer rejects single-frame spikes; the median
 * then feeds an exponential moving average (`ema = alpha*median + (1-alpha)*ema`).
 * `alpha = 1` is a pure median; a small `medianWindow` (1) is a pure EMA.
 */
export function createSmoother({ medianWindow, alpha }) {
  const buf = [];
  let ema = null;

  return {
    push(y) {
      buf.push(y);
      if (buf.length > medianWindow) buf.shift();
      const sorted = [...buf].sort((a, b) => a - b);
      const median = sorted[Math.floor((sorted.length - 1) / 2)];
      ema = ema === null ? median : alpha * median + (1 - alpha) * ema;
      return ema;
    },
    value() {
      return ema;
    },
  };
}

/**
 * On-music gate: is the reader actually looking at the score right now?
 *
 * True only for a confident sample whose `x` falls inside the music column
 * `[columnX0, columnX1]`. Filters out low-confidence frames and glances toward
 * the hands/keyboard outside the column.
 */
export function isReading({ x, confidence }, { columnX0, columnX1, minConfidence }) {
  return confidence >= minConfidence && x >= columnX0 && x <= columnX1;
}

/**
 * Reading speed: least-squares slope of `y` vs `t` over a short sample history,
 * clamped to `[0, maxVelocity]`. The lower clamp enforces forward-only reading
 * (an upward gaze drift never produces negative velocity); the upper clamp keeps
 * a bad fit from driving a runaway scroll. Returns 0 for fewer than 2 samples.
 */
export function estimateReadingVelocity(samples, { maxVelocity }) {
  const n = samples.length;
  if (n < 2) return 0;

  let sumT = 0, sumY = 0;
  for (const { t, y } of samples) {
    sumT += t;
    sumY += y;
  }
  const meanT = sumT / n, meanY = sumY / n;

  let num = 0, den = 0;
  for (const { t, y } of samples) {
    const dt = t - meanT;
    num += dt * (y - meanY);
    den += dt * dt;
  }
  if (den === 0) return 0;

  const slope = num / den;
  return Math.max(0, Math.min(maxVelocity, slope));
}

/**
 * One frame of the scroll controller. Pure: `(state, input) -> {scrollTop, state}`.
 *
 * While reading, it nudges the page so the smoothed gaze point sits at the
 * `setpoint` fraction of the viewport: a dead-zone suppresses jitter, the step
 * is bounded by `min(maxStepPerFrame, readingVelocity·dt, |error|)`, and it is
 * forward-only (an above-setpoint gaze never scrolls back). When reading stops
 * it coasts at the last velocity for `coastMs`, then freezes. The result is
 * always clamped to `[0, contentH - viewportH]`.
 *
 * Safety invariant (relied on in tests): `scrollTop` is non-decreasing and each
 * frame's delta is ≤ `maxStepPerFrame`.
 */
export function stepController(state, input) {
  const {
    smoothedY, reading, readingVelocity,
    viewportH, scrollTop, contentH, dtMs, params,
  } = input;
  const { setpoint, deadzone, maxStepPerFrame, coastMs } = params;

  const maxScroll = Math.max(0, contentH - viewportH);
  const error = smoothedY - viewportH * setpoint; // +ve → gaze below setpoint

  let lastVelocity = state.lastVelocity ?? 0;
  let coastRemainingMs = state.coastRemainingMs ?? coastMs;
  let step = 0;

  if (reading) {
    lastVelocity = readingVelocity;
    coastRemainingMs = coastMs;
    if (error > deadzone) {
      step = Math.min(maxStepPerFrame, readingVelocity * dtMs, error);
    }
  } else {
    coastRemainingMs -= dtMs;
    if (coastRemainingMs > 0) {
      step = Math.min(maxStepPerFrame, lastVelocity * dtMs);
    }
  }

  step = Math.max(0, step); // forward-only
  const next = Math.max(0, Math.min(maxScroll, scrollTop + step));
  return { scrollTop: next, state: { lastVelocity, coastRemainingMs } };
}

// ---------------------------------------------------------------------------
// System-aware layer (Phase 14). Added alongside the pure core above, which
// stays the per-page fallback (see design D4). Given the active page's detected
// system boxes (in strip coords) plus the gaze sample, these compute a target
// scrollTop from the *active system alone*: snap it fully into view on the
// left-edge of the reading sweep, then raise it to the screen top as the gaze
// sweeps left→right. All pure/deterministic so they unit-test against synthetic
// gaze traces + box sets.
// ---------------------------------------------------------------------------

/**
 * Active-system selector: forward-only, driven by the reading saccade.
 *
 * Because detected boxes can overlap vertically (an engraver's jagged divide),
 * vertical containment is ambiguous and is **not** the advance trigger. Instead
 * we advance one system when the gaze, after sweeping into the right portion of
 * the music column (`fx ≥ sweepRightFrac`), returns to the left region
 * (`fx ≤ returnLeftFrac`) — the start of the next line. This never regresses on
 * overlapping boxes and ignores a stray leftward glance that was not preceded by
 * a right-portion sweep. `update(fx, count)` returns the active index, clamped to
 * `[0, count-1]`; `reset(i)` re-seats it (e.g. on a page change).
 */
export function createSystemSelector({ sweepRightFrac = 0.55, returnLeftFrac = 0.35 } = {}) {
  let active = 0;
  let sweptRight = false;
  return {
    active() {
      return active;
    },
    reset(i = 0) {
      active = i;
      sweptRight = false;
    },
    update(fx, count) {
      if (count <= 0) return active;
      if (active > count - 1) active = count - 1;
      if (fx >= sweepRightFrac) {
        sweptRight = true;
      } else if (fx <= returnLeftFrac && sweptRight) {
        if (active < count - 1) active += 1;
        sweptRight = false;
      }
      return active;
    },
  };
}

/**
 * Scroll target (strip px) framing one system across the reading sweep.
 *
 * Left edge (`fx=0`): **snap start** `box.bottom − viewportH` — the minimal
 * forward scroll that brings the whole system into view, sitting at the bottom of
 * the screen. Right edge (`fx=1`): **sweep end** `box.top − topMargin` — the
 * system raised to the screen top. In between, linearly interpolate by `fx`. A
 * system taller than the viewport has `snapStart ≥ sweepEnd`; clamp it to a plain
 * top-align (`sweepEnd`) so it never scrolls backwards mid-sweep.
 */
export function systemScrollTarget(box, { viewportH, topMargin = 0, fx }) {
  const snapStart = box.bottom - viewportH;
  const sweepEnd = box.top - topMargin;
  if (snapStart >= sweepEnd) return sweepEnd; // taller than viewport → top-align
  const f = Math.max(0, Math.min(1, fx));
  return snapStart + (sweepEnd - snapStart) * f;
}

/**
 * Forward-only, bounded step toward a target scrollTop — the same safety
 * invariant as {@link stepController} (non-decreasing scrollTop, per-frame delta
 * ≤ `maxStepPerFrame`). The target is clamped to `[0, maxScroll]`; a target
 * behind the current position holds (never scrolls back).
 */
export function stepTowardTarget(scrollTop, target, { maxStepPerFrame, maxScroll }) {
  const clamped = Math.max(0, Math.min(maxScroll, target));
  const forward = Math.max(0, clamped - scrollTop);
  return scrollTop + Math.min(maxStepPerFrame, forward);
}

/**
 * Stateful system-aware controller. `update(frame)` takes the active page's
 * system boxes (strip coords, ordered top→bottom), the gaze-x fraction `fx`
 * across the music column, a `reading` gate, and the view geometry; it returns
 * `{scrollTop, active}` or **null** when there are no boxes — the signal for the
 * caller to route this frame through the vertical-gaze follower (design D5).
 * While not reading it holds position (no advance, no scroll).
 */
export function createSystemController(initialParams) {
  let params = { ...initialParams };
  const selector = createSystemSelector(params);
  return {
    setParams(partial) {
      params = { ...params, ...partial };
    },
    active() {
      return selector.active();
    },
    reset(i = 0) {
      selector.reset(i);
    },
    update({ boxes, fx, reading, viewportH, scrollTop, contentH }) {
      if (!boxes || boxes.length === 0) return null;
      if (!reading) return { scrollTop, active: selector.active() };
      const active = selector.update(fx, boxes.length);
      const target = systemScrollTarget(boxes[active], {
        viewportH,
        topMargin: params.systemTopMargin ?? 0,
        fx,
      });
      const maxScroll = Math.max(0, contentH - viewportH);
      const next = stepTowardTarget(scrollTop, target, {
        maxStepPerFrame: params.maxStepPerFrame,
        maxScroll,
      });
      return { scrollTop: next, active };
    },
  };
}

/**
 * Compose the full gaze→scroll pipeline into a stateful controller.
 *
 * `update(sample, view) -> scrollTop` chains: smooth the gaze y → gate on the
 * music column/confidence → estimate reading velocity over a short smoothed
 * history → step the scroll controller. `sample` is `{t, x, y, confidence}`;
 * `view` is `{viewportH, scrollTop, contentH}`. The returned `scrollTop` is what
 * the caller should apply; thread the page's current scrollTop back in via
 * `view` each frame.
 */
export function createGazeController(initialParams) {
  let params = { ...initialParams };
  let smoother = createSmoother(params);
  let velWindow = params.velocityWindow ?? 8;
  const history = []; // {t, y: smoothedY}
  let ctrlState = {};
  let lastT = null;

  return {
    /**
     * Live-update the tuning parameters (the dev tuning panel calls this). Most
     * params are read fresh each frame, so they take effect immediately; changing
     * the smoother's `medianWindow`/`alpha` rebuilds it (its window is fixed at
     * creation), and `velocityWindow` re-reads next frame.
     */
    setParams(partial) {
      const prev = params;
      params = { ...params, ...partial };
      if (
        partial.medianWindow !== undefined &&
          partial.medianWindow !== prev.medianWindow ||
        partial.alpha !== undefined && partial.alpha !== prev.alpha
      ) {
        smoother = createSmoother(params);
      }
      velWindow = params.velocityWindow ?? 8;
    },

    update(sample, view) {
      const dtMs = lastT === null ? 0 : sample.t - lastT;
      lastT = sample.t;

      const smoothedY = smoother.push(sample.y);
      const reading = isReading(
        { x: sample.x, confidence: sample.confidence },
        params
      );

      history.push({ t: sample.t, y: smoothedY });
      if (history.length > velWindow) history.shift();
      const readingVelocity = estimateReadingVelocity(history, params);

      const out = stepController(ctrlState, {
        smoothedY,
        reading,
        readingVelocity,
        viewportH: view.viewportH,
        scrollTop: view.scrollTop,
        contentH: view.contentH,
        dtMs,
        params,
      });
      ctrlState = out.state;
      return out.scrollTop;
    },
  };
}

## Context

The gaze-point overlay currently displays a single red dot at the raw WebGazer location. The smoothing (median + EMA on the y-coordinate) happens inside `gaze/control.js` but is invisible to the user—only the scroll effect reveals it. Tuning `medianWindow` and `alpha` requires trial-and-error because the smoothing's magnitude is not directly observable.

## Goals / Non-Goals

**Goals:**
- Display both raw and smoothed gaze locations simultaneously, so the filter's effect is visible in real time.
- Reduce tuning friction by making filter behavior transparent.
- Use the same smoother already in `control.js` (no new filters).

**Non-Goals:**
- Change the scrolling algorithm or control parameters.
- Expose smoothing of the x-coordinate in scrolling (only visualize; scrolling still uses raw x for the on-music gate and system selector).
- Add configuration options for the dual-dot appearance (fixed small gray for raw, red for smoothed).

## Decisions

**1. Smoother instantiation and exposure**

The `createGazeController` already instantiates a smoother and computes `smoothedY`. We expose `smoothedY` and `rawY` from the controller's `update()` method by returning them alongside `scrollTop`. This reuses the existing filter without duplication.

*Alternative considered*: Instantiate a separate display smoother—rejected because it duplicates the filter logic and decouples display from control logic.

**2. Red dot shows control-path data (raw x + smoothed y)**

The red dot displays exactly what the scrolling algorithm receives: raw x (for the on-music gate and system selector) and smoothed y (for velocity estimation and scroll control). This honest representation helps users understand what the controller "sees" without introducing asymmetry or speculation about x smoothing.

The gray dot shows completely raw WebGazer output for comparison. Investigating x smoothing can be done separately if UX gains justify it.

**3. Dot rendering**

- Red dot (existing): moves to the smoothed location.
- Gray dot (new): positioned at the raw location, smaller (e.g., 50% of red dot size), lower opacity, centered at the same point.

Both dots are rendered in the same overlay div (the camera preview area). No new DOM structure needed.

**4. Backward compatibility**

The controller's public API (`setParams`, `update`) changes only in return value—it now includes `smoothedX`, `smoothedY`, `rawX`, `rawY` alongside `scrollTop`. Existing callers can ignore the extra fields. No breaking changes if we thread them as a separate object property.

## Risks / Trade-offs

**Risk**: Adding smoothed y to the controller's return object. The controller already computes it; we just expose it.

*Mitigation*: The return object is already `{scrollTop, state}`. We extend it to `{scrollTop, state, smoothedY, rawX, rawY}`. Callers ignore what they don't need. Minimal churn (two locations: `main.js` frame loop, test files).

**Risk**: The gray dot's position on raw x might be confusing—on-music gating uses this x value, but the gate also has a confidence threshold, so an apparently "off-music" raw x might still gate as readable if confidence is high.

*Mitigation*: The visual distinction (red = control data, gray = raw input) is clear enough. The system behavior remains unchanged; this is observation-only.

## Trade-offs

- Transparency: The red dot now shows exactly what the controller uses (no speculation or asymmetry).
- Future investigation: X smoothing as a UX improvement is deferred; can be explored separately with evidence from this visualization.

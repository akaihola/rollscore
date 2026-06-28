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

**2. Smoothing both x and y for display**

The control logic only smooths y (used for velocity estimation). For the display dots, we apply the same smoother to both x and y for consistency and clarity. This shows the user "what if we smooth both axes"—useful context even if the controller doesn't use smoothed x for scrolling.

*Alternative considered*: Show raw x and smoothed y—rejected because it's confusing (asymmetric) and the proposal explicitly asks for smoothed x.

**3. Dot rendering**

- Red dot (existing): moves to the smoothed location.
- Gray dot (new): positioned at the raw location, smaller (e.g., 50% of red dot size), lower opacity, centered at the same point.

Both dots are rendered in the same overlay div (the camera preview area). No new DOM structure needed.

**4. Backward compatibility**

The controller's public API (`setParams`, `update`) changes only in return value—it now includes `smoothedX`, `smoothedY`, `rawX`, `rawY` alongside `scrollTop`. Existing callers can ignore the extra fields. No breaking changes if we thread them as a separate object property.

## Risks / Trade-offs

**Risk**: The x-smoother sees rapid horizontal eye movements (saccades) that the real controller ignores. Showing a smoothed x might create a false impression of what the controller "sees" for on-music gating.

*Mitigation*: Keep the red dot (smoothed) at the true control location; use the gray dot (raw) as a reference. In documentation, clarify that x smoothing is visualization-only; scrolling uses raw x.

**Risk**: Adding smoothed values to the controller's return object bloats it. If many callers exist, this is a minor churn.

*Mitigation*: The return object is already `{scrollTop, state}`. We extend it to `{scrollTop, state, smoothedX, smoothedY, rawX, rawY}`. Callers ignore what they don't need. Minimal churn (two locations: `main.js` frame loop, test files).

## Trade-offs

- Clarity vs. accuracy: Showing smoothed x is not what the controller uses, but it's clearer for the user to see both axes smoothed uniformly.
- Simplicity vs. customization: Dot appearance (size, color, opacity) is hard-coded, not tunable. This is intentional to avoid UI clutter.

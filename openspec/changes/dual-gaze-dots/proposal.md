## Why

During gaze-control tuning, it's unclear how much the smoothing filter (median + EMA) is affecting the raw WebGazer output. Visualizing both the raw jittering signal and the smoothed result side-by-side lets the user understand the filter's effect in real time and make informed tuning decisions. This reduces guesswork when adjusting `medianWindow` and `alpha` parameters.

## What Changes

- The main red gaze dot (currently showing raw location) will represent the **smoothed** gaze point (median + EMA applied to both x and y).
- A smaller light gray dot will appear alongside it to show the **raw unsmoothed** location from WebGazer, jittering at full frame rate.
- Both dots update every frame and inherit the same visual treatment (attached to the camera preview area).

## Capabilities

### New Capabilities
- `dual-gaze-visualization`: Display raw and smoothed gaze points simultaneously in the camera preview to visualize smoothing-filter effects.

### Modified Capabilities
<!-- No spec-level requirement changes; this is purely visual. -->

## Impact

- Frontend UI: Adds a second dot to the gaze-point overlay (light gray, smaller, for raw location).
- No impact on scrolling logic, control parameters, APIs, or backend.
- The smoothing is already computed in `gaze/control.js`; this change just exposes the intermediate smoothed value for visualization.

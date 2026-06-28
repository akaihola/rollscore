## 1. Smoother and Controller Backend

- [x] 1.1 Update `createGazeController` in `gaze/control.js` to expose the already-computed smoothed y value
- [x] 1.2 Modify `createGazeController.update()` to return `{scrollTop, smoothedY, rawX, rawY, state}` instead of just `scrollTop`
- [x] 1.3 Verify the existing smoother correctly tracks smoothedY; no changes needed to smoother logic

## 2. Frame Loop Integration

- [x] 2.1 Update the `frame()` function in `main.js` to destructure `smoothedY, rawX, rawY` from `controller.update()` return
- [x] 2.2 Pass `{rawX, rawY, controlX: rawX, controlY: smoothedY}` to the overlay render function (or store them in a way the overlay can access)
- [x] 2.3 Verify the system-aware controller path falls back to raw coordinates if needed

## 3. Overlay Rendering

- [x] 3.1 Create or update the gaze-point overlay renderer to draw two dots:
  - Red dot at `(smoothedX, smoothedY)` with current size and opacity
  - Light gray dot at `(rawX, rawY)` with 50% size and 60% opacity
- [x] 3.2 Ensure both dots are centered on their respective coordinates
- [x] 3.3 Test dot rendering in the browser with the gaze active

## 4. Testing and Refinement

- [x] 4.1 Run the app in `?fakegaze` mode to verify both dots move as expected with a scripted trace
- [x] 4.2 Run with real WebGazer and observe: gray dot jitters in all directions; red dot jitters horizontally but smooths vertically
- [x] 4.3 Adjust dot size, opacity, and color if needed for clarity
- [x] 4.4 Verify scrolling behavior is unchanged (control-path data: raw x for gating, smoothed y for velocity)

## 5. Documentation and Commits

- [x] 5.1 Update code comments in `gaze/control.js` and `main.js` to explain the dual-dot visualization
- [ ] 5.2 Commit changes with a message referencing the dual-gaze-dots change

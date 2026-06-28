## 1. Smoother and Controller Backend

- [ ] 1.1 Update `createGazeController` in `gaze/control.js` to expose both x and y through the smoother (create a separate x smoother or extend the existing smoother to handle both)
- [ ] 1.2 Modify `createGazeController.update()` to return `{scrollTop, smoothedX, smoothedY, rawX, rawY, state}` instead of just `scrollTop`
- [ ] 1.3 Update `createSmoother` to initialize and track state properly for both x and y coordinates

## 2. Frame Loop Integration

- [ ] 2.1 Update the `frame()` function in `main.js` to destructure raw/smoothed values from `controller.update()` return
- [ ] 2.2 Pass `{rawX, rawY, smoothedX, smoothedY}` to the overlay render function (or store them in a way the overlay can access)
- [ ] 2.3 Verify the system-aware controller path also exposes these coordinates (or fall back to raw if not available)

## 3. Overlay Rendering

- [ ] 3.1 Create or update the gaze-point overlay renderer to draw two dots:
  - Red dot at `(smoothedX, smoothedY)` with current size and opacity
  - Light gray dot at `(rawX, rawY)` with 50% size and 60% opacity
- [ ] 3.2 Ensure both dots are centered on their respective coordinates
- [ ] 3.3 Test dot rendering in the browser with the gaze active

## 4. Testing and Refinement

- [ ] 4.1 Run the app in `?fakegaze` mode to verify both dots move as expected with a scripted trace
- [ ] 4.2 Run with real WebGazer and observe the lag/damping effect (gray dot jitters, red dot smooths)
- [ ] 4.3 Adjust dot size, opacity, and color if needed for clarity
- [ ] 4.4 Verify scrolling behavior is unchanged (scrolling still uses raw x, smoothed y as before)

## 5. Documentation and Commits

- [ ] 5.1 Update code comments in `gaze/control.js` and `main.js` to explain the dual-dot visualization
- [ ] 5.2 Commit changes with a message referencing the dual-gaze-dots change

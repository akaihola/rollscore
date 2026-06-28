/**
 * Dual gaze-point overlay: red dot for the control path (raw x, smoothed y),
 * gray dot for the raw WebGazer output. Both are fixed-position viewport divs.
 * The red dot shows exactly what the scroll controller receives; the gray dot
 * shows the unfiltered WebGazer signal so the smoothing effect is visible.
 *
 * Centered via transform:translate(-50%,-50%) so left/top point to the gaze center.
 */
export function createGazeDots() {
  function dot(size, color, opacity) {
    const d = document.createElement("div");
    Object.assign(d.style, {
      position: "fixed",
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: "50%",
      background: color,
      opacity: String(opacity),
      transform: "translate(-50%, -50%)",
      pointerEvents: "none",
      zIndex: "900",
      display: "none",
    });
    document.body.append(d);
    return d;
  }

  const ctrlDot = dot(20, "#d00", 1.0); // red, full opacity — rendered first (below)
  const rawDot  = dot(10, "#999", 0.6); // gray, 50% of ctrl size, 60% opacity — on top

  return {
    update(rawX, rawY, ctrlX, ctrlY) {
      rawDot.style.left  = `${rawX}px`;
      rawDot.style.top   = `${rawY}px`;
      rawDot.style.display = "";
      ctrlDot.style.left = `${ctrlX}px`;
      ctrlDot.style.top  = `${ctrlY}px`;
      ctrlDot.style.display = "";
    },
    hide() {
      rawDot.style.display  = "none";
      ctrlDot.style.display = "none";
    },
    remove() { rawDot.remove(); ctrlDot.remove(); },
  };
}

/**
 * Debug overlay for the system-aware controller (Phase 14, design D7).
 *
 * Renders the detected system boxes as faint shading rectangles drawn *over* the
 * music at low opacity (the page renders are opaque white, so a behind-the-image
 * layer would be hidden; a low-opacity fill in front reads as a highlight, not an
 * occlusion — the notes show through). Only the active system is shown; when it
 * advances the shading **crossfades** — the old rectangle fades out as the new
 * one fades in (a CSS opacity transition), which is both the box-placement check
 * and the visible signal that the controller decided the gaze moved on.
 *
 * Each page's boxes live in their own container nested in that page's
 * `.page-wrapper`, sized to fill it (= the page image's box) and positioned in
 * page-relative %. So the boxes (a) survive a window resize and (b) inherit the
 * crop transform: `applyCropMode` applies the *same* CSS transform to the
 * container as to the image, keeping the boxes registered with the music in both
 * crop and full-page modes.
 *
 * Pure DOM, no controller/API. The toggle is off by default and never affects
 * scroll; in the vertical-gaze fallback there is no active system, so nothing is
 * shown.
 *
 * @param {HTMLElement} strip the page strip (contains one `.page-wrapper` per page)
 * @param {Array<Array<{top:number,bottom:number,left:number,right:number}>>} boxesByPage
 *   per-page system boxes in full-page canvas coordinates (px)
 * @param {Array<{width:number,height:number}>} pageDims canvas dims per page (same order)
 * @param {{opacity?:number, fadeMs?:number}} opts
 */
export function createSystemOverlay(strip, boxesByPage, pageDims, { opacity = 0.18, fadeMs = 250 } = {}) {
  let op = opacity;
  let fade = fadeMs;

  const wrappers = strip.querySelectorAll(".page-wrapper");
  const layers = [];

  // divs[page][idx] — one rectangle per detected system, grouped per page so a
  // page's container can carry that page's crop transform.
  const divs = boxesByPage.map((boxes, p) => {
    const dim = pageDims[p] || { width: 1, height: 1 };
    const layer = document.createElement("div");
    layer.className = "system-overlay";
    Object.assign(layer.style, {
      position: "absolute",
      inset: "0",
      zIndex: "2", // in front of the opaque page image (low opacity → notes show through)
      pointerEvents: "none",
      transformOrigin: "0 0",
      display: "none", // off by default
    });
    const wrapper = wrappers[p];
    if (wrapper) {
      if (!wrapper.style.position) wrapper.style.position = "relative";
      wrapper.append(layer);
    }
    layers.push(layer);

    return boxes.map((b) => {
      const d = document.createElement("div");
      Object.assign(d.style, {
        position: "absolute",
        left: `${(b.left / dim.width) * 100}%`,
        top: `${(b.top / dim.height) * 100}%`,
        width: `${((b.right - b.left) / dim.width) * 100}%`,
        height: `${((b.bottom - b.top) / dim.height) * 100}%`,
        background: "#2b6cff",
        opacity: "0",
        transition: `opacity ${fade}ms ease`,
      });
      layer.append(d);
      return d;
    });
  });

  let cur = null; // [page, idx] (0-based) of the shown box, or null

  function box(key) {
    return key && divs[key[0]]?.[key[1]];
  }

  return {
    /** Show the box at (0-based page, idx); pass (null, null) to show nothing. */
    setActive(page, idx) {
      const key = page == null || idx == null ? null : [page, idx];
      const same = cur && key && cur[0] === key[0] && cur[1] === key[1];
      if (same) return;
      if (box(cur)) box(cur).style.opacity = "0";
      if (box(key)) box(key).style.opacity = String(op);
      cur = key;
    },
    setVisible(v) {
      for (const layer of layers) layer.style.display = v ? "" : "none";
    },
    setParams({ opacity, fadeMs } = {}) {
      if (opacity != null) {
        op = opacity;
        if (box(cur)) box(cur).style.opacity = String(op);
      }
      if (fadeMs != null) {
        fade = fadeMs;
        for (const row of divs) for (const d of row) d.style.transition = `opacity ${fade}ms ease`;
      }
    },
    remove() {
      for (const layer of layers) layer.remove();
    },
  };
}

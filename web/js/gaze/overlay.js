/**
 * Debug overlay for the system-aware controller (Phase 14, design D7).
 *
 * Renders the detected system boxes as faint background-shading rectangles drawn
 * *behind* the music (a low-opacity fill, so it reads as a highlight, not an
 * occlusion). Only the active system is shown; when it advances the shading
 * **crossfades** — the old rectangle fades out as the new one fades in (a CSS
 * opacity transition), which is both the box-placement check and the visible
 * signal that the controller decided the gaze moved to the next system.
 *
 * Pure DOM, no controller/API. Boxes arrive already scaled into strip pixels.
 * The toggle is off by default and never affects scroll; in the vertical-gaze
 * fallback there is no active system, so nothing is shown.
 *
 * ponytail: boxes are positioned in px at build-time strip width; a window resize
 * needs a reader reload to re-register them. Fine for an off-by-default diagnostic.
 */

/**
 * @param {HTMLElement} strip the page strip (boxes are positioned within it)
 * @param {Array<Array<{top:number,bottom:number,left:number,right:number}>>} boxesByPage
 *   per-page system boxes in strip coordinates (px)
 * @param {{opacity?:number, fadeMs?:number}} opts
 */
export function createSystemOverlay(strip, boxesByPage, { opacity = 0.18, fadeMs = 250 } = {}) {
  let op = opacity;
  let fade = fadeMs;

  const layer = document.createElement("div");
  layer.className = "system-overlay";
  Object.assign(layer.style, {
    position: "absolute",
    inset: "0",
    zIndex: "-1", // behind the (static/transformed) page images
    pointerEvents: "none",
    display: "none", // off by default
  });

  const divs = boxesByPage.map((boxes) =>
    boxes.map((b) => {
      const d = document.createElement("div");
      Object.assign(d.style, {
        position: "absolute",
        left: `${b.left}px`,
        top: `${b.top}px`,
        width: `${b.right - b.left}px`,
        height: `${b.bottom - b.top}px`,
        background: "#2b6cff",
        opacity: "0",
        transition: `opacity ${fade}ms ease`,
      });
      layer.append(d);
      return d;
    })
  );

  if (!strip.style.position) strip.style.position = "relative";
  strip.prepend(layer);

  let cur = null; // [page, idx] (0-based) of the shown box, or null

  function hide(key) {
    if (key && divs[key[0]]?.[key[1]]) divs[key[0]][key[1]].style.opacity = "0";
  }

  return {
    /** Show the box at (0-based page, idx); pass (null, null) to show nothing. */
    setActive(page, idx) {
      const key = page == null || idx == null ? null : [page, idx];
      const same = cur && key && cur[0] === key[0] && cur[1] === key[1];
      if (same) return;
      hide(cur);
      if (key && divs[key[0]]?.[key[1]]) divs[key[0]][key[1]].style.opacity = String(op);
      cur = key;
    },
    setVisible(v) {
      layer.style.display = v ? "" : "none";
    },
    setParams({ opacity, fadeMs } = {}) {
      if (opacity != null) {
        op = opacity;
        if (cur && divs[cur[0]]?.[cur[1]]) divs[cur[0]][cur[1]].style.opacity = String(op);
      }
      if (fadeMs != null) {
        fade = fadeMs;
        for (const row of divs) for (const d of row) d.style.transition = `opacity ${fade}ms ease`;
      }
    },
    remove() {
      layer.remove();
    },
  };
}

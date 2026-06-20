/**
 * Front-end bootstrap: fetch the library, render the chooser into `#app`, and
 * route an "open" to the reader view.
 *
 * The reader is a single vertical scroll strip of lazily-loaded page images
 * (see `reader.js`). It restores the saved resume position on open and saves it
 * back, throttled, while scrolling (and flushed on unload). Module scripts are
 * deferred, so the DOM is ready when this runs.
 */
import { getLibrary, getPages, getResume, putResume } from "./api.js";
import { buildChooser } from "./chooser.js";
import {
  buildStrip,
  computeResumeScroll,
  pageToScroll,
  scrollToResume,
  setAnnotation,
  throttle,
} from "./reader.js";

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

async function openReader({ file, page }) {
  // Build the shell first so we can measure the scroller's width before sizing
  // the page strip, then fill it once the page metadata arrives.
  const root = el("div", "reader");
  const bar = el("div", "toolbar");
  const back = el("button", null, "← Library");
  const annotateBtn = el("button", null, "Annotations: on");
  bar.append(back, annotateBtn);
  const scroller = el("div", "scroller");
  root.append(bar, scroller);
  app.replaceChildren(root);

  let pageDims, resume;
  try {
    [pageDims, resume] = await Promise.all([getPages(file), getResume(file)]);
  } catch (err) {
    showError(`Could not open ${file}: ${err.message}`);
    return;
  }

  const stripWidth = scroller.clientWidth || window.innerWidth;
  let annotated = true;
  const strip = buildStrip({ file, pageDims, stripWidth, annotated });
  scroller.append(strip);

  // Restore: a saved resume wins; otherwise jump to the requested piece page.
  scroller.scrollTop = resume
    ? computeResumeScroll(pageDims, stripWidth, resume)
    : pageToScroll(pageDims, stripWidth, page);

  const save = throttle(() => {
    putResume(
      file,
      scrollToResume(pageDims, stripWidth, scroller.scrollTop)
    ).catch(() => {});
  }, 1000);
  scroller.addEventListener("scroll", save);
  const flush = () => save.flush();
  window.addEventListener("beforeunload", flush);

  back.addEventListener("click", () => {
    save.flush();
    window.removeEventListener("beforeunload", flush);
    boot();
  });

  annotateBtn.addEventListener("click", () => {
    annotated = !annotated;
    setAnnotation(strip, file, annotated);
    annotateBtn.textContent = `Annotations: ${annotated ? "on" : "off"}`;
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

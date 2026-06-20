/**
 * Front-end bootstrap: fetch the library, render the chooser into `#app`, and
 * route an "open" to the reader.
 *
 * The reader view arrives in Phase 8; until then `openReader` shows a
 * placeholder so the chooser → open flow is verifiable end-to-end. Module
 * scripts are deferred, so the DOM is ready when this runs.
 */
import { getLibrary } from "./api.js";
import { buildChooser } from "./chooser.js";

const app = document.getElementById("app");

function showError(message) {
  app.replaceChildren();
  const box = document.createElement("p");
  box.className = "error";
  box.textContent = message;
  app.append(box);
}

function openReader({ file, page }) {
  // Phase 8 replaces this with the scroll-strip reader view.
  app.replaceChildren();
  const note = document.createElement("p");
  note.className = "reader-placeholder";
  note.textContent = `Reader (Phase 8) — would open ${file} at page ${page}.`;
  const back = document.createElement("button");
  back.textContent = "← Back to library";
  back.addEventListener("click", boot);
  app.append(note, back);
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

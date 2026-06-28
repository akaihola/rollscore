/**
 * Chooser view: a pure DOM-building function over the library model.
 *
 * The model shape matches the backend's `/api/library` payload:
 *   { scores, setlists: {name: [Score]}, composers: [{composer, scores}] }
 * where Score = {filename, title, composer, page_count, pieces:[{title,
 * first_page, last_page}]}.
 *
 * `buildChooser(model)` returns a detached element. Score and piece entries are
 * real `<a href="/score/...">` links (see {@link scorePath}); opening a score is
 * a normal browser navigation — the bootstrap routes from the path on load. No
 * global state, no `onOpen` callback — the caller mounts the returned node.
 */
import { scorePath } from "./paths.js";

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function link(className, text, file, page) {
  const a = el("a", className, text);
  a.href = scorePath(file, page);
  a.dataset.file = file;
  return a;
}

/** Build a score entry: a title link, with its pieces listed when multi-piece. */
function scoreEntry(score) {
  const wrap = el("div", "score-wrap");
  const pieces = score.pieces ?? [];

  wrap.append(link("score", score.title, score.filename, 1));

  if (pieces.length) {
    const list = el("ul", "pieces");
    for (const piece of pieces) {
      const item = el("li");
      const a = link("piece", piece.title, score.filename, piece.first_page);
      a.dataset.page = String(piece.first_page);
      item.append(a);
      list.append(item);
    }
    wrap.append(list);
  }
  return wrap;
}

export function buildChooser(model) {
  const root = el("div", "chooser");

  // Setlists — ordered as the backend serialized them.
  const setlists = el("section", "setlists");
  setlists.append(el("h2", null, "Setlists"));
  for (const [name, scores] of Object.entries(model.setlists)) {
    const details = el("details");
    details.append(el("summary", null, name));
    // Permalinks open a score standalone — the setlist running order is not
    // carried in the URL (design Non-Goal), so the entries are plain score links.
    scores.forEach((score) => details.append(scoreEntry(score)));
    setlists.append(details);
  }
  root.append(setlists);

  // Composer-sorted scores.
  const composers = el("section", "composers");
  composers.append(el("h2", null, "By composer"));
  for (const group of model.composers) {
    const groupNode = el("div", "composer-group");
    groupNode.append(el("h3", null, group.composer));
    for (const score of group.scores) groupNode.append(scoreEntry(score));
    composers.append(groupNode);
  }
  root.append(composers);

  return root;
}

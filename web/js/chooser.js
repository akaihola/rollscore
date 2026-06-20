/**
 * Chooser view: a pure DOM-building function over the library model.
 *
 * The model shape matches the backend's `/api/library` payload:
 *   { scores, setlists: {name: [Score]}, composers: [{composer, scores}] }
 * where Score = {filename, title, composer, page_count, pieces:[{title,
 * first_page, last_page}]}.
 *
 * `buildChooser(model, {onOpen})` returns a detached element; `onOpen` is
 * called with `{file, page}` when a score or one of its pieces is chosen.
 * No global state — the caller mounts the returned node.
 */

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/** Build a clickable score entry, with its pieces listed when multi-piece. */
function scoreEntry(score, onOpen) {
  const wrap = el("div", "score-wrap");

  const title = el("button", "score", score.title);
  title.dataset.file = score.filename;
  title.addEventListener("click", () => onOpen({ file: score.filename, page: 1 }));
  wrap.append(title);

  if (score.pieces && score.pieces.length) {
    const list = el("ul", "pieces");
    for (const piece of score.pieces) {
      const item = el("li");
      const btn = el("button", "piece", piece.title);
      btn.dataset.file = score.filename;
      btn.dataset.page = String(piece.first_page);
      btn.addEventListener("click", () =>
        onOpen({ file: score.filename, page: piece.first_page })
      );
      item.append(btn);
      list.append(item);
    }
    wrap.append(list);
  }
  return wrap;
}

export function buildChooser(model, { onOpen }) {
  const root = el("div", "chooser");

  // Setlists — ordered as the backend serialized them.
  const setlists = el("section", "setlists");
  setlists.append(el("h2", null, "Setlists"));
  for (const [name, scores] of Object.entries(model.setlists)) {
    const details = el("details");
    details.append(el("summary", null, name));
    for (const score of scores) details.append(scoreEntry(score, onOpen));
    setlists.append(details);
  }
  root.append(setlists);

  // Composer-sorted scores.
  const composers = el("section", "composers");
  composers.append(el("h2", null, "By composer"));
  for (const group of model.composers) {
    const groupNode = el("div", "composer-group");
    groupNode.append(el("h3", null, group.composer));
    for (const score of group.scores) groupNode.append(scoreEntry(score, onOpen));
    composers.append(groupNode);
  }
  root.append(composers);

  return root;
}

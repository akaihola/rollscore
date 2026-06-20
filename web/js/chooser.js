/**
 * Chooser view: a pure DOM-building function over the library model.
 *
 * The model shape matches the backend's `/api/library` payload:
 *   { scores, setlists: {name: [Score]}, composers: [{composer, scores}] }
 * where Score = {filename, title, composer, page_count, pieces:[{title,
 * first_page, last_page}]}.
 *
 * `buildChooser(model, {onOpen})` returns a detached element; `onOpen` is called
 * with `{file, page, pieces, setlist}` when a score or one of its pieces is
 * chosen. `pieces` is the score's piece list (for in-reader piece navigation);
 * `setlist` is `{items: [{title, file}, …], index}` when the score was opened
 * from a setlist (so the reader can stop-and-wait at its end) or `null`.
 * No global state — the caller mounts the returned node.
 */

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/**
 * Build a clickable score entry, with its pieces listed when multi-piece.
 *
 * `setlist` (when the entry lives in a setlist) is forwarded verbatim in every
 * `onOpen` payload so the reader knows its place in the running order.
 */
function scoreEntry(score, onOpen, setlist = null) {
  const wrap = el("div", "score-wrap");
  const pieces = score.pieces ?? [];

  const title = el("button", "score", score.title);
  title.dataset.file = score.filename;
  title.addEventListener("click", () =>
    onOpen({ file: score.filename, page: 1, pieces, setlist })
  );
  wrap.append(title);

  if (pieces.length) {
    const list = el("ul", "pieces");
    for (const piece of pieces) {
      const item = el("li");
      const btn = el("button", "piece", piece.title);
      btn.dataset.file = score.filename;
      btn.dataset.page = String(piece.first_page);
      btn.addEventListener("click", () =>
        onOpen({ file: score.filename, page: piece.first_page, pieces, setlist })
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
    const items = scores.map((s) => ({ title: s.title, file: s.filename }));
    scores.forEach((score, index) =>
      details.append(scoreEntry(score, onOpen, { items, index }))
    );
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

/**
 * Thin client for the gaze-scroll backend API.
 *
 * DOM-free so it runs under Vitest's `node` environment. Every score filename
 * is URL-encoded as a single path segment (forScore filenames contain spaces,
 * commas, accented characters, and `|`).
 */

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`);
  return res.json();
}

async function putJson(url, body) {
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PUT ${url} failed: ${res.status}`);
  return res.json();
}

/** Fetch the chooser model: scores, ordered setlists, composer groups. */
export function getLibrary() {
  return getJson("/api/library");
}

/** Fetch the per-page dimensions `[{width, height}, …]` for a score. */
export function getPages(file) {
  return getJson(`/api/score/${encodeURIComponent(file)}/pages`);
}

/** Build the page-image URL for a score, page (1-based), and annotation flag. */
export function pageUrl(file, page, annotated) {
  const seg = encodeURIComponent(file);
  return `/api/score/${seg}/page/${page}.png?annotated=${annotated ? 1 : 0}`;
}

/** Fetch the saved resume position for a score (or null). */
export function getResume(file) {
  return getJson(`/api/score/${encodeURIComponent(file)}/resume`);
}

/** Save the resume position {page, scroll} for a score. */
export function putResume(file, { page, scroll }) {
  return putJson(`/api/score/${encodeURIComponent(file)}/resume`, { page, scroll });
}

/** Fetch the gaze-control tuning parameters. */
export function getTuning() {
  return getJson("/api/tuning");
}

/** Persist (partial) tuning-parameter overrides. */
export function putTuning(params) {
  return putJson("/api/tuning", params);
}

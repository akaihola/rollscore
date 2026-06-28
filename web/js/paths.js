/** URL helpers for score permalinks, shared by the bootstrap and the chooser. */

/** The permalink path for a score, with `?page=<n>` only past page 1. */
export function scorePath(file, page) {
  const path = `/score/${encodeURIComponent(file)}`;
  return page > 1 ? `${path}?page=${page}` : path;
}

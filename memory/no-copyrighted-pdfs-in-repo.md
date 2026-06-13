---
name: no-copyrighted-pdfs-in-repo
description: Never commit example/score PDFs into the forscore repo — they are copyrighted sheet music; keep them outside the repo
metadata: 
  node_type: memory
  type: feedback
  originSessionId: eda0b83c-b3fb-481e-b214-23c91957b38d
---

Always keep example/score PDFs (and other copyrighted material) **out of the git repo**. The
extracted scores in `out/pdfs/` are copyrighted sheet music; `out/` and `out/pdfs/` are
gitignored and must stay so. forScore exports / reference PDFs the user shares live under
`~/.claude/uploads/` (outside the repo) — analyze them there, never copy them into the working
tree as fixtures or commit them.

**Why:** the PDFs are third-party copyrighted music; the repo is about the format/tooling, not
the content.

**How to apply:** work from `out/` and `~/.claude/uploads/` in place; if a test fixture is
needed, synthesize a non-copyrighted PDF rather than committing a real score. Before any commit,
`git ls-files '*.pdf'` should return nothing. Related: [[forscore-open-questions]].

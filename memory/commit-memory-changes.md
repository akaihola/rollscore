---
name: commit-memory-changes
description: Memory files live in the repo (symlinked from ~/.claude) — always commit memory edits too
metadata:
  type: feedback
---

In this project, the auto-memory directory `~/.claude/projects/-home-akaihola-prg-forscore/memory/` is a **symlink to `memory/` inside the repo**, and those files are git-tracked (`memory/MEMORY.md`, `memory/*.md`).

**Why:** memory is version-controlled alongside the code, not a private scratch area.

**How to apply:** whenever you write or update a memory file, stage and commit `memory/` in the same session (don't leave it as a dangling working-tree change). Group it with the related work commit or make a dedicated `docs(memory): …` commit.

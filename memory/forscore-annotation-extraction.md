---
name: forscore-annotation-extraction
description: How ForScore stores annotations and how to back them up / migrate off iOS to Linux — the project's core research conclusions
metadata:
  type: project
---

# Securing ForScore annotations off iOS (research conclusions, 2026-06-07)

**Goal:** preserve sheet-music PDFs + freehand/fingering/symbol annotations from ForScore
(iPad 7th gen) so they survive ForScore/iPad becoming unavailable, are copyable to non-iOS
(Linux) devices, and can be viewed/printed/edited or converted to other apps.

Sources are forScore's own first-party KB/developer pages (authoritative for *what the app
does*), corroborated where noted. Internal byte-level format of the proprietary containers
is **vendor-undocumented**; no third-party reverse-engineering tool exists. See [[forscore-open-questions]].

## How ForScore stores data (confirmed, high confidence)

- **Annotations are stored SEPARATELY from the PDF, not flattened in.** Original PDFs live
  in the app's *public* Documents directory; annotations + setlists + bookmarks + metadata +
  settings live in the *private* Library directory and an internal database.
- Annotations are **editable layer data** (up to 8 page-layers per page, 4 score-layers per score).
- **Consequence:** copying a PDF out via Apple File Sharing gives you the BLANK original —
  annotations are not in it. (Confirmed by a user on the MobileSheets forum.)

## ForScore file formats

| Ext | What it is | Has PDFs? | Annotations |
|-----|-----------|-----------|-------------|
| `.4SC` | Single score container | Yes (1) | **Editable** + metadata/links. Proprietary, iOS/macOS-only. |
| `.4SS` | Setlist | No | — |
| `.4SB` *Backup* | Metadata snapshot | **No** | Editable metadata only; **useless alone**, can't rebuild documents |
| `.4SB` *Archive* | Full library | **Yes (all)** | Everything — complete recovery artifact |

- **Annotated-PDF export** ("permanently annotated PDF"): annotations **flattened/baked in**,
  permanent, viewable/printable by any PDF tool, **NOT editable** afterward.
- There is **no** ForScore export producing standard *editable* PDF annotation objects readable
  elsewhere. Core trade-off: **flattened (portable, not editable)** vs **4SC/4SB (editable, iOS-locked)**.
- **No bulk 4SC export** — one score at a time only (multi-select offers only flattened-PDF or text list).

## Backing up WITHOUT a Mac (Linux-only user) — KEY CORRECTION

The macOS Backup Utility is **NOT required**. The **iPad app itself can build a full Archive**;
the Mac utility is only a convenience that avoids needing free space on the device.

**Primary method (recommended, no computer needed):**
1. iPad: **Tools → Backup → "+" → choose *Archive*** (not plain Backup). One `.4sb` with ALL
   PDFs + ALL editable annotations + metadata. Requires enough free space to ~duplicate the
   library; if "Archive" is greyed out, free up space (this space need is the *only* thing the
   Mac utility spares you).
2. **Services panel → Backups tab → Upload** the archive to Dropbox/Google Drive (or Share-sheet → Save to Files → cloud/USB).
3. On Linux: download the `.4sb`. Restorable into any future ForScore install.

**Also do:** export **flattened annotated PDFs** for app-independent viewing/printing on Linux
(`.4sb`/`.4sc` can currently only be reopened by ForScore itself).

## Accessing iOS data from Linux (libimobiledevice)

- `ifuse --documents com.mgsdevelopment.forscore /mnt` (USB) exposes only the **public Documents
  dir = original un-annotated PDFs**. The private Library/annotation DB is **NOT reachable** this
  way (needs AFC2 / jailbreak). ForScore bundle id = **`com.mgsdevelopment.forscore`**.
- Full device backup DOES capture the private container: `idevicepair pair` (tap Trust) →
  `idevicebackup2 -i encryption on <pw>` → `idevicebackup2 backup --full /dir` → extract
  `AppDomain-com.mgsdevelopment.forscore` with Python **iOSbackup** (pip) or **MVT**. This yields
  a raw forensic copy of the annotation SQLite/blobs, **not a clean re-importable file** — last-resort only.
- GUI tools (iMazing, iExplorer, 3uTools, Reincubate) are **Windows/macOS only**; on Linux use CLI/Python.

## Cross-platform destination apps

- **MobileSheetsPro** (Android/Windows/macOS) = best ForScore-like replacement. No direct library
  import; dev's recommended path = import the **flattened annotated PDFs**. Legacy annotations
  arrive **flattened**; you can add new editable annotations on top.
- **Newzik** = iOS/web only → does NOT get you off Apple → rule out. Its ForScore import grabs PDFs only.
- **MuseScore** = notation editor, not a PDF annotator → wrong category, can't hold freehand marks → rule out.
- **Generic editable-annotation PDF tools (Linux/Win/Android):** Okular (best Linux/Win desktop),
  Xodo / PDF Studio (most cross-platform), Foxit. Xournal++ re-flattens on PDF export (only for new ink).
  Caveat: NO tool can re-edit ForScore's flattened export — once flattened, marks are page content everywhere.

## Recommended overall strategy

- **Editable insurance:** in-app **Archive** → cloud → Linux.
- **Portable/printable insurance:** **flattened annotated PDFs** (Okular / Xodo / Foxit on Linux).
- Keeping **both** covers every axis.

## Refuted during research (do NOT believe)

- "ForScore relies on PDFKit instead of its own rendering" — refuted 0-3.
- "Annotation layers are flattened/merged on every save" — refuted 1-2 (precise editing internals uncertain).

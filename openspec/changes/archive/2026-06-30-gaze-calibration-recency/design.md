## Context

The symptom — "lots of Shift+click points eventually make gaze go everywhere" — was traced
to WebGazer's regression internals (verified in `web/vendor/webgazer.js`):

- Feature: each eye resized 10×6, grayscale, histogram-equalized → 120-dim vector, mapped
  straight to screen X/Y. No head-pose model.
- Solver: `w = (XᵀX + λI)⁻¹ Xᵀ y`, `λ = Math.pow(10,-5)` — essentially OLS.
- Storage: click samples in `DataWindow(700)`, FIFO; full window re-solved every frame.

Because the feature is raw pixels with no pose normalization, the pixels→screen mapping is
only valid for the head pose at recording time. Accumulating points across a drifting
session feeds the unweighted solver contradictory equal-weight samples; with λ≈0 it chases
them and the weights blow up.

## Key decision: use `weightedRidge`, don't reinvent the math

WebGazer's `RidgeWeightedReg.predict` scales each click sample by `c = Math.sqrt(1/(i-a))`
(`i` = sample count, `a` = index, 0 = oldest): newest sample weight 1, oldest ≈ `1/√i`. This
is precisely the recency weighting we want — stale drifted points lose voting power as fresh
ones arrive. It is a one-word change (`setRegression`), already in the vendored build.

Verified it composes with everything we depend on:

| Concern | Finding |
|---|---|
| Persistence (`getData`/`setData`) | `RidgeWeightedReg.prototype.getData`/`setData` are the **same** `rB` functions as plain ridge → blob shape identical |
| Existing saved `ridge` blobs | Same `InitRegression` + data window → load into `weightedRidge` unchanged, no migration |
| Orientation map + dpr tag | Untouched — they wrap the blob, not the regression type |
| `clearData()` | Shared; resets the same `DataWindow(700)` |

## Key decision: clear only on a fresh grid pass, not on every add

Three ways to record a point: the 9-dot grid (`c`), `g` at the cursor, and Shift+click.
Only the grid is a deliberate "calibrate from scratch" gesture, so:

- **Grid start (`c`)** → `webgazer.clearData()` first → 9 dots train a clean model. This is
  the recovery path for an already-poisoned model.
- **`g` / Shift+click** → keep appending. These are live top-ups; with `weightedRidge` they
  refine the model toward the current head pose instead of corrupting it.

This keeps the cheap incremental workflow while giving a clean reset when needed — no new
key, no separate "clear" affordance.

## Interaction with the empty-model persistence rule

`clearData()` empties the window. The existing rule ("an empty model is not persisted")
already prevents the cleared state from overwriting the saved blob: nothing is written until
the first dot click produces a non-empty model. So clearing is safe mid-session — abandoning
a grid pass before any click leaves the saved model intact. No extra guard needed.

## Risks

- `clearData()` also clears localforage; we don't use WebGazer's localforage persistence (we
  use `/api/calibration`), so this is harmless — but worth a comment so nobody "fixes" it.
- If degradation turns out to come from spatial *clustering* rather than temporal drift,
  recency weighting won't fully solve it; the deferred per-region dedupe is the follow-up.
  We accept that risk because drift is the literature-confirmed dominant cause.

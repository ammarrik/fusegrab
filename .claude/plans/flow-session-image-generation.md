# Plan: Automatic Flow image generation in sessions

When a session's `useFlow` toggle is enabled, the video stage should generate its
visuals with Google Flow (via the extension bridge) instead of stock footage.

## Current state (what we're connecting)

- **Video stage today** (`apps/desktop/src/lib/services/video-generator/service.ts`):
  plans a timeline of `{from, end, keyword}` segments via LLM → searches
  Pexels/Pixabay per keyword → downloads `src-NNN.jpg` files into a `workDir` →
  Ken Burns + captions encode per segment → concat. Everything downstream of
  "files on disk" is source-agnostic.
- **Flow today** (`apps/desktop/src/lib/services/image-generator/service.ts` +
  `apps/desktop/src/lib/services/extension-bridge/server.ts`):
  `requestGeneration({prompts, model}, onImage)` streams data-URL images from the
  extension driving Google Flow. Constraints: **max 4 prompts per request**
  (`MAX_IMAGE_COUNT`), 16:9 locked (matches the 1920×1080 video), 10-min request
  timeout, needs the extension connected **and** a Flow project tab open, and the
  extension drives one tab sequentially.
- **The `useFlow` flag** currently stops at the folder/draft — `sessions.create`
  never receives it.

The integration point: when Flow is on, swap the "pick stock + download"
sub-stages for "generate with Flow + write to workDir", keeping the same
`src-NNN.*` file contract so encode/concat/resume stay untouched.

---

## Phase 1 — Thread `useFlow` from UI to the pipeline

1. **Session input**: add `useFlow?: boolean` (and `research?: boolean`, same
   plumbing) to `GenerateScriptInput` in
   `apps/desktop/src/lib/services/script-writer/types.ts` — it is the session's
   `input` type, so it persists and survives resume/restart for free.
2. **Composer → create**: include `useFlow` in `SessionFormValues`
   (`apps/desktop/src/routes/_app/-session-form.tsx`) and pass it through the
   route's `onSubmit` → `window.api.sessions.create`. Update the `create`
   signatures in `apps/desktop/src/preload.ts` and `apps/desktop/env.d.ts`.
3. **Pipeline → video stage**: in `runVideoStage`
   (`apps/desktop/src/lib/services/sessions/service.ts`), pass
   `useFlow: session.input.useFlow ?? false` into `GenerateVideoInput`
   (`apps/desktop/src/lib/services/video-generator/types.ts`).

## Phase 2 — Flow-aware timeline planning

Stock keywords ("city skyline") make bad Flow prompts, and segment counts are
the real constraint: a 10-min video at 2–8s segments is 75–300 images — too
many Flow generations.

1. **Longer segments in Flow mode**: in `planTimeline`, when `useFlow` is set,
   target 8–15s scenes instead of 2–8s (a 10-min video becomes ~40–70 images,
   ≈10–18 batches of 4). Skip the >8s image-splitting step for Flow segments —
   Ken Burns over a generated image holds up fine for 15s.
2. **Real image prompts**: add a Flow variant of the planner prompt
   (`apps/desktop/src/lib/services/video-generator/prompts.ts`) that returns
   `{from, end, keyword, prompt}` — a one-sentence visual description of the
   scene, with a fixed style suffix (e.g. "cinematic, photorealistic, 16:9") so
   the video stays visually consistent scene to scene. Keep `keyword` populated
   as the stock-search fallback.
3. **Local fallback**: `buildLocalPlan` synthesizes a prompt from the segment's
   narration text when the planner LLM is unavailable.
4. Persist prompts in `plan.json` (already cached in workDir) so resume reuses
   identical prompts.

## Phase 3 — Flow sourcing sub-stage (replaces stock pick + download)

New function in video-generator, e.g.
`generateFlowImages(plan, workDir, onItem, checkCancelled)`:

1. **Batching**: chunk the plan into groups of `MAX_IMAGE_COUNT` (4) and call
   `requestGeneration` sequentially per batch (the extension drives one Flow
   tab; parallel requests would interleave). Decode each `dataUrl` with the
   existing `decodeDataUrl` logic and write straight to `workDir/src-NNN.{ext}`
   — the exact filename contract `encodeSegments` already expects.
2. **Resume**: before each batch, skip indices whose `src-NNN.*` (or encoded
   `seg-NNN.mp4`) already exists — mirrors the stock download resume behavior.
   Progressively written files mean pause/stop loses at most one batch.
3. **Cancellation**: check `checkCancelled` between batches (pause) and pass the
   run's abort signal so stop rejects the in-flight `requestGeneration`
   promptly.
4. **Per-image failure → stock fallback**: a `null` dataUrl (Flow "Failed" card
   or timeout) retries once in a later batch; on second failure, fall back to
   `pickStockItem({keyword})` + download for that segment only. The video always
   completes; the plan records per-segment `source: 'flow' | 'stock'`.
5. **Model**: use `DEFAULT_IMAGE_MODEL` ('Nano Banana Pro') for now; optionally
   a per-channel model picker later.

## Phase 4 — Reliability and contention

1. **Preflight check**: at the start of the video stage with `useFlow`, call
   `getExtensionStatus()`. If not `ready`, fail the stage with a clear,
   actionable error ("Connect the Recreate extension and open a Google Flow
   project, then resume") — the session lands in a resumable failed state, and
   resume picks up where it left off. Don't silently fall back to all-stock;
   the user explicitly chose Flow.
2. **Mid-run disconnects**: `requestGeneration` already rejects on disconnect.
   Catch it, re-check status with a short grace window (the extension
   auto-reconnects with backoff), retry the batch once, then fail resumable.
3. **Serialize with the Images page**: add a simple promise-queue around
   `requestGeneration` in
   `apps/desktop/src/lib/services/extension-bridge/server.ts` so a session run
   and a manual Images-page generation don't drive the Flow tab concurrently.
4. **Time budget**: a batch of 4 typically finishes within the content script's
   3-min watch; ~15 batches ≈ 20–45 min for a 10-min video. Surface this
   honestly in progress text; raise the per-request timeout only if real runs
   hit it.

## Phase 5 — UI

1. **Progress detail**: reuse the video step's `onDetail` channel — "Generating
   image 12 of 48 with Flow…", "Flow failed for scene 13, using stock…". The
   progress view (`apps/desktop/src/routes/_app/$sessionId/-progress-view.tsx`)
   already renders details.
2. **Composer guard** (DONE): when the Flow pill is on and the extension isn't
   ready, the composer is fully locked with a destructive banner over the
   promptbox (same style as the missing-API-keys banner), with a "Turn off
   Flow" escape action. Status is live — connecting the extension unlocks the
   form automatically.
3. **Result view**: show a "Flow visuals" badge and per-segment source in the
   plan list if it's already displayed.

## Phase 6 — Verification

1. Short session (1–2 min video, ~8 segments) with Flow on, extension
   connected: confirm images land as `src-NNN.*`, video assembles, plan records
   `source: 'flow'`.
2. Pause mid-generation → resume: no regenerated batches for existing files.
3. Kill the extension mid-run: batch retry → resumable failure with the
   actionable message; reconnect → resume completes.
4. Force one prompt to fail (gibberish prompt): stock fallback fills the slot.
5. Flow off: byte-identical behavior to today (stock path untouched).

---

**Decisions baked in:** fail-resumable rather than all-stock fallback when the
extension is offline; per-segment stock fallback for individual failed images;
longer scenes (8–15s) in Flow mode to keep generation time sane; sequential
batches of 4.

**Suggested order:** Phase 1 → 3 → 2 → 4 → 5 (the flag and the sourcing swap
give an end-to-end testable path using keywords as crude prompts; prompt
quality and polish follow).

# Learning Video Import Agent Notes

## Purpose
This document records the agreed end-to-end workflow for importing new learning videos into this project, with a focus on safe repeatable execution on local and server environments.

## Project Understanding
The import flow for `learning_by_video` is split into four operational steps:

1. Step 0: Convert all `*.mov` to normalized `*.mp4` in a target folder (local file operation).
2. Step 1: Slice `*.mp4` into HLS outputs (`.m3u8`, `-init.mp4`, `.m4s`) in resource folder.
3. Step 2: Import xlsx metadata into DB with empty `video_url` and `cover_letter_url` in source sheet.
4. Step 3: Backfill `video_url` and `cover_letter_url` from actual files in resource folders.

Manual file placement (video and cover assets) is intentionally outside automation scope.

## Canonical One-Stop Entry
Use:

`scripts/run_learning_video_pipeline.sh`

Default behavior:
- Uses `frontend/public/resources/ScienceSeason1/learning_by_video_video` as video folder.
- Uses `apps/learning_by_video/data/raw` as xlsx folder.
- Runs Step 0 -> Step 3 in order.
- Auto-skips Step 0 if no MOV files exist.
- Auto-skips Step 2 if no XLSX files exist.
- Backfill runs in safe mode (`--only-missing --empty-only`) to avoid overwriting existing non-empty URLs.

Server run from MP4 stage:

`scripts/run_learning_video_pipeline.sh --skip-step0`

Dry run:

`scripts/run_learning_video_pipeline.sh --skip-step0 --dry-run`

## Special Character Strategy
Goal: no frontend change, stable URL matching, and no duplicate alias files.

Implemented strategy:
- During MOV->MP4 and MP4->HLS, filename stems are normalized to ASCII-safe form.
- During URL backfill, matching supports both original and ASCII-folded keys.
- If DB points to an unsafe/non-ASCII filename and fix is needed, file handling prefers rename behavior (not duplicate alias creation) for non-`.m3u8` assets.

Practical effect:
- New incoming names with umlauts/special symbols are normalized early.
- URL backfill is more robust against Unicode differences between xlsx titles and on-disk filenames.
- Cover and video URL matching works without frontend-side normalization logic.

## Safety Rules for Operations
- Do not run destructive git commands.
- Prefer dry-run before actual execution on server.
- Keep Step 2 source of truth in xlsx; backfill only fills missing URL fields by default.
- Avoid forcing overwrite unless explicitly needed (`--overwrite`).

## Session Progress Summary
Completed in this round:

1. Added one-stop orchestrator script:
   - `scripts/run_learning_video_pipeline.sh`
2. Updated HLS script behavior:
   - `scripts/enable_hls_5seg.sh`
   - ASCII-safe output stem normalization
   - skip existing playlists when not overwrite
   - skip HLS init files as input
3. Updated URL sync command behavior:
   - `apps/learning_by_video/management/commands/sync_video_media_urls.py`
   - stronger ASCII-aware matching
   - safe filename remediation aligned with rename-first behavior
4. Validation done:
   - shell syntax checks passed
   - one-stop script `--help` works
   - dry-run pipeline traversal works

## Run Checklist (Operator)
Before run:
- Confirm resource folder has new MP4 and cover files in expected season path.
- Confirm xlsx files are placed in `apps/learning_by_video/data/raw`.
- Confirm ffmpeg and ffprobe are available on host.

Run:
- Recommended first pass:
  - `scripts/run_learning_video_pipeline.sh --skip-step0 --dry-run`
- Actual run:
  - `scripts/run_learning_video_pipeline.sh --skip-step0`

After run:
- Spot check DB rows for new videos (`video_url`, `cover_letter_url`, `season`).
- Verify a few frontend pages: playlist loads, cover renders.

## Known Boundaries
- Manual asset copy/upload remains manual by design.
- `.m3u8` rename behavior is conservative due to possible internal segment URI dependencies.
- If normalization causes stem collision, manual intervention is required for naming uniqueness.

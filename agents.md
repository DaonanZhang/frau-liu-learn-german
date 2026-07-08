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
- `--resource-profile auto` maps Season 1/2/3 to `ScienceSeason1`, and Season 4 to `VlogSeason1`.
- Uses `apps/learning_by_video/data/raw` as xlsx folder.
- Runs Step 0 -> Step 3 in order.
- Auto-skips Step 0 if no MOV files exist.
- Auto-skips Step 2 if no XLSX files exist.
- Backfill runs in safe mode (`--only-missing --empty-only`) to avoid overwriting existing non-empty URLs.

Alternative resource buckets:
- `frontend/public/resources/ScienceSeason1`
- `frontend/public/resources/VlogSeason1`

Each resource bucket should contain:
- `learning_by_video_video`
- `learning_by_video_cover_letters`

Server run from MP4 stage:

`scripts/run_learning_video_pipeline.sh --skip-step0`

Dry run:

`scripts/run_learning_video_pipeline.sh --skip-step0 --dry-run`

## Vlog Season Runbook
Use this when importing or updating `Vlog season` videos, which currently maps to `season_number=4` and resource bucket `VlogSeason1`.

Required file placement:
- videos: `frontend/public/resources/VlogSeason1/learning_by_video_video`
- covers: `frontend/public/resources/VlogSeason1/learning_by_video_cover_letters`
- xlsx: `apps/learning_by_video/data/raw`

Step 0 only, for new MOV sources:

`scripts/run_learning_video_pipeline.sh --season-number 4 --resource-profile vlog --skip-step1 --skip-step2 --skip-step3 --skip-step4`

What this does:
- converts all `*.mov` in the Vlog video folder to `*.mp4`
- deletes the original `*.mov` after successful conversion
- does not run HLS slicing, xlsx import, URL backfill, or subtitle backfill

Dry run for Step 1 to Step 4:

`scripts/run_learning_video_pipeline.sh --skip-step0 --season-number 4 --resource-profile vlog --dry-run`

Actual Step 1 to Step 4 run:

`scripts/run_learning_video_pipeline.sh --skip-step0 --season-number 4 --resource-profile vlog`

Observed successful run shape for Vlog season:
- Step 1 slices each `mp4` into `.m3u8`, `-init.mp4`, and `.m4s` files in `frontend/public/resources/VlogSeason1/learning_by_video_video`
- Step 2 runs `manage.py import_xlsx_all --module-key learning_by_video --season-number 4`
- Step 3 runs `manage.py sync_video_media_urls --mode apply --only-missing --empty-only --module-key learning_by_video --video-dir frontend/public/resources/VlogSeason1/learning_by_video_video --cover-dir frontend/public/resources/VlogSeason1/learning_by_video_cover_letters --season-number 4`
- Step 4 runs `manage.py backfill_video_full_subtitles --only-missing --module-key learning_by_video --season-number 4`

Important operational notes from the real Vlog run:
- rerunning Step 1 after HLS files already exist is safe; existing playlists are skipped automatically
- after Step 0, the video folder contains both source `*.mp4` and HLS `*-init.mp4`; the HLS script already skips `*-init.mp4`
- the import step moved processed xlsx files into `apps/learning_by_video/data/raw/processed`
- in the actual run, `import_xlsx_all --season-number 4` logged `season assigned=1` and `access_season bound=1` for each imported xlsx; this should be treated as a warning and DB season assignment should be spot-checked after each Vlog import until the root cause is confirmed

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

## Date/Time Migration Rule
- When a date/time API is being renamed or standardized, use the single target API consistently instead of adding backward-compatibility aliases by default.
- For `localNow` to `local_now` migrations specifically, treat `local_now` as the only correct implementation target and update all affected call sites, tests, and comparisons to match it.
- Do not add compatibility wrappers or aliases unless the user explicitly asks for a compatibility fix.

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
- Vlog season dry run:
  - `scripts/run_learning_video_pipeline.sh --skip-step0 --season-number 4 --resource-profile vlog --dry-run`
- Vlog season actual run:
  - `scripts/run_learning_video_pipeline.sh --skip-step0 --season-number 4 --resource-profile vlog`

After run:
- Spot check DB rows for new videos (`video_url`, `cover_letter_url`, `season`).
- Verify a few frontend pages: playlist loads, cover renders.
- For Vlog season specifically, verify that imported rows actually landed on `season 4`, because the current import logs showed `season assigned=1`.

## Known Boundaries
- Manual asset copy/upload remains manual by design.
- `.m3u8` rename behavior is conservative due to possible internal segment URI dependencies.
- If normalization causes stem collision, manual intervention is required for naming uniqueness.

## Exam Preparation UI Rules
- Every top-level skill page in the `exam_preparation` module, such as `Hören`, `Lesen`, `Sprachbausteine`, `Schreiben`, and `Sprechen`, must provide a visible back arrow/button that routes back to the main `exam-preparation` module page.
- Every exercise page in the `exam_preparation` module must provide a `Prüfen` button.
- After `Prüfen`, every exercise page in the `exam_preparation` module must provide a `Wiederholen` action that clears all answers and resets the page to the initial unanswered state.
- After `Prüfen`, if the learner selected a wrong option, the correct option must still be visibly highlighted in green inside the option list.
- Keep these behaviors consistent across all current and future `exam_preparation` exercise types.

## Frontend UI Responsiveness Rule
- For every frontend UI change, always consider desktop, iPad/tablet, and mobile layouts together instead of optimizing only for desktop.
- Do not ship a layout that looks correct on desktop but breaks, overflows, overlaps, becomes cramped, or becomes hard to operate on iPad or mobile screens.
- When adjusting spacing, cards, grids, toolbars, buttons, or fixed/sticky areas, verify that the result remains readable and usable across common desktop, iPad/tablet, and mobile widths.

## Exam Preparation XLSX Rules
- For `exam_preparation` import format, use `apps/exam_preparation/data/README.md` as the canonical XLSX contract.
- Do not reintroduce `title_zh` in new exam-preparation import assumptions or new sheets.
- Map all shared exercise metadata through `ExerciseBase`, including `exam_type`.

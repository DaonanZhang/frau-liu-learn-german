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
- On server, `--upload-cos` uploads every generated HLS asset to both the Shanghai (`frauliu-1335740446`, `ap-shanghai`) and Frankfurt (`frauliu-eu-1335740446`, `eu-frankfurt`) Tencent COS buckets, but DB `video_url` should still backfill to local `/resources/...` paths so nginx can proxy them later.

Alternative resource buckets:
- `frontend/public/resources/ScienceSeason1`
- `frontend/public/resources/VlogSeason1`

Each resource bucket should contain:
- `learning_by_video_video`
- `learning_by_video_cover_letters`

Server run from MP4 stage:

`scripts/run_learning_video_pipeline.sh --skip-step0 --upload-cos`

Dry run:

`scripts/run_learning_video_pipeline.sh --skip-step0 --upload-cos --dry-run`

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

`scripts/run_learning_video_pipeline.sh --skip-step0 --season-number 4 --resource-profile vlog --upload-cos`

### Frankfurt Legacy Sync

Use this standalone command to backfill Vlog files that exist locally but are missing from the Frankfurt COS bucket. It never reads or writes the Shanghai bucket.

Dry run:

`scripts/sync_vlog_to_frankfurt_cos.sh --dry-run`

Equivalent one-stop command mode:

`scripts/run_learning_video_pipeline.sh --sync-vlog-to-frankfurt --dry-run`

Actual sync:

`scripts/sync_vlog_to_frankfurt_cos.sh`

Equivalent one-stop command mode:

`scripts/run_learning_video_pipeline.sh --sync-vlog-to-frankfurt`

Defaults:
- recursively scans `frontend/public/resources/VlogSeason1`
- maps local relative paths to `resources/VlogSeason1/...`
- lists only `frauliu-eu-1335740446` in `eu-frankfurt`
- skips keys already present in Frankfurt; optional `--dedupe-etag` also skips local MD5 values matching existing single-part ETags
- uses the Tencent COS Python SDK high-level upload with multipart resume support and five retry attempts
- reads credentials from `~/.cos.conf`; environment credential pairs supported by the HLS uploader are also accepted

Observed successful run shape for Vlog season:
- Step 1 slices each `mp4` into `.m3u8`, `-init.mp4`, and `.m4s` files in `frontend/public/resources/VlogSeason1/learning_by_video_video`
- Step 1 on server may additionally upload generated HLS files to both COS buckets via `scripts/enable_hls_5seg.sh --upload-cos`; successful uploads print the public URL for each target, and one target failing does not prevent the other target from being attempted
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

## Local Vs Server Rule
- Local development and server operations must be treated as separate run targets.
- Local workflow may continue using local resource paths for inspection and dry runs.
- Server workflow for learning video HLS should upload generated HLS assets to both configured COS buckets after slicing, while DB `video_url` continues to use local `/resources/...` paths for nginx proxying.
- `scripts/push_learning_media.sh` is for syncing source files from local machine to server. It should not replace the server-side HLS-to-COS step.
- When asked for a Django shell script, management command, or ops script in this project, first confirm whether the target is local or server if the task can differ by environment.
- For server-targeted learning video tasks, explicitly consider COS upload, server paths such as `/srv/projects/frau-liu-learn-german/...`, and keep DB URL backfill aligned with the nginx proxy path strategy unless explicitly asked otherwise.

## Cross-Module Media Rule
- COS storage is not only a learning-video concern. For any future module that introduces media files, always evaluate whether the resource should be stored in COS and whether the DB/API should continue exposing nginx-proxied `/resources/...` paths instead of direct COS URLs.
- When designing or modifying upload, slicing, sync, or backfill scripts for new modules, verify that COS object keys stay structurally aligned with the corresponding `/resources/...` URL path, including the `resources/` prefix and subdirectory layout.
- If a module may use a non-standard output directory outside `frontend/public/resources/...`, do not silently fall back to a default COS path assumption; explicitly review and confirm the mapping strategy first.
- Exam preparation content must follow this same rule. In particular, listening audio files must be treated as COS-backed media and their storage path, proxy path, and future upload/backfill flow must be considered whenever the exam module is changed.

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
  - `scripts/run_learning_video_pipeline.sh --skip-step0 --upload-cos --dry-run`
- Actual run:
  - `scripts/run_learning_video_pipeline.sh --skip-step0 --upload-cos`
- Vlog season dry run:
  - `scripts/run_learning_video_pipeline.sh --skip-step0 --season-number 4 --resource-profile vlog --upload-cos --dry-run`
- Vlog season actual run:
  - `scripts/run_learning_video_pipeline.sh --skip-step0 --season-number 4 --resource-profile vlog --upload-cos`

After run:
- Spot check DB rows for new videos (`video_url`, `cover_letter_url`, `season`).
- Verify a few frontend pages: playlist loads, cover renders.
- For Vlog season specifically, verify that imported rows actually landed on `season 4`, because the current import logs showed `season assigned=1`.

## Known Boundaries
- Manual asset copy/upload remains manual by design.
- `.m3u8` rename behavior is conservative due to possible internal segment URI dependencies.
- If normalization causes stem collision, manual intervention is required for naming uniqueness.

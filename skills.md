# Skills Summary: Learning Video Import

## Skill: run-learning-video-import

### Trigger
Use this when importing a new batch of learning videos into `learning_by_video` and you need a single command from media processing through DB URL backfill.

### Preconditions
- MP4 and cover files are already in season resource folders.
- XLSX files are in `apps/learning_by_video/data/raw`.
- Host has `ffmpeg`, `ffprobe`, and Python runtime for Django commands.

### Command
- From MP4 stage:
  - `scripts/run_learning_video_pipeline.sh --skip-step0`
- Full chain including MOV conversion:
  - `scripts/run_learning_video_pipeline.sh`
- Dry-run:
  - `scripts/run_learning_video_pipeline.sh --dry-run`

### Internal Step Order
1. MOV -> MP4 (optional or auto-skip)
2. MP4 -> HLS
3. XLSX import (`import_xlsx_all`)
4. URL backfill (`sync_video_media_urls --mode apply --only-missing --empty-only`)

### Safety Defaults
- No overwrite unless `--overwrite` is provided.
- URL backfill only fills missing values by default.
- Filename normalization handles ASCII-safe matching for special characters.
- Avoid duplicate alias files; prefer rename-first approach where applicable.

### Outputs
- HLS files generated in video resource folder.
- XLSX moved by import flow to processed folder on success.
- DB rows receive backfilled `video_url` and `cover_letter_url` when missing.

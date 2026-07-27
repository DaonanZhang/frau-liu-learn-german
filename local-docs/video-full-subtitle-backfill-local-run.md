# Local Run Record: Video Full Subtitle Backfill

This document records the local execution performed for the new aggregated subtitle fields on `learning_by_video.Video`.

## Changes Included

- added `Video.full_subtitle_de`
- added `Video.full_subtitle_zh`
- added management command: `backfill_video_full_subtitles`
- updated pipeline script to run subtitle aggregation as the final step

## Season Model Clarification

Intended access model:

- `season 1`: full ScienceSeason
- `season 2`: partial ScienceSeason
- `season 3`: smaller ScienceSeason trial
- `season 4`: full VlogSeason

This means `season 1`, `2`, and `3` are access scopes, not separate media buckets.

At the time of this local run, the local database still contained mixed primary season assignments:

- 40 videos with primary `season=1`
- 10 videos with primary `season=2`

So the local backfill was run against both current primary groups to ensure all existing rows were covered.

## Local Commands Run

### 1. Apply migration locally

```bash
cd /Users/dzsoftware/PycharmProjects/frau-liu-learn-german
.venv/bin/python manage.py migrate learning_by_video
```

Result:

- `learning_by_video.0014_learningvideouservideonote` applied
- `learning_by_video.0015_video_full_subtitles` applied

### 2. Backfill existing local videos

```bash
cd /Users/dzsoftware/PycharmProjects/frau-liu-learn-german
.venv/bin/python manage.py backfill_video_full_subtitles --only-missing --module-key learning_by_video --season-number 1
.venv/bin/python manage.py backfill_video_full_subtitles --only-missing --module-key learning_by_video --season-number 2
.venv/bin/python manage.py backfill_video_full_subtitles --only-missing --module-key learning_by_video --season-number 4
```

Result:

- Season 1: `OK: processed=40, updated=40, skipped_no_subtitles=0`
- Season 2: `OK: processed=10, updated=10, skipped_no_subtitles=0`
- Season 4: `No videos matched the requested scope.`

Verification:

- remaining videos with both fields empty: `0`

## Expected Behavior

- subtitles are aggregated in timeline order
- each subtitle line becomes one line in the final text field
- only videos with both aggregate fields empty are filled by default

## Server Reminder

On server, after pull and migrate, run the same backfill command for existing videos before relying on these fields:

```bash
cd /srv/projects/frau-liu-learn-german
.venv/bin/python manage.py backfill_video_full_subtitles --only-missing --all
```

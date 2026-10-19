# Sprechen turn audio

Speaking audio is generated per imported `turn`, not by splitting text in the
frontend. The importer writes the resulting URL into each
`content.dialogue[]` turn and mirrors it into `content.sections[].turns[]`.

Audio files use this runtime layout:

```text
frontend/public/resources/ExamPreparation/exam_preparation_audio/
  telc_b1_speaking/
    teil1/
    teil2/
    teil3/
  telc_b2_speaking/
    teil1/
    teil2/
    teil3/
```

The scope folder follows the lowercase `{exam_type}_{level}_speaking` naming
convention; for example, `telc_b1_speaking` and `telc_b2_speaking`.

Each filename is stable for the exercise and turn, for example:
`B1_7_1.mp3`. The database/API URL uses the local
`/resources/ExamPreparation/...` path. COS object keys preserve that path below
the public resources root and therefore include the leading `resources/`
prefix, for example
`resources/ExamPreparation/exam_preparation_audio/telc_b1_speaking/teil1/B1_7_1.mp3`.
The frontend only reads `turn.audio_url`; it does not calculate filenames or
split sentences.

## Importing new Speaking workbooks

Set `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` in the server or local
environment, then run the normal Speaking importer. It generates missing turn
files while importing:

```bash
uv run scripts/import_exam_preparation_speaking_einander_kennenlernen.py
uv run scripts/import_exam_preparation_speaking_ueber_ein_thema_sprechen.py
uv run scripts/import_exam_preparation_speaking_gemeinsam_etwas_planen.py
```

To import only the text and defer audio generation:

```bash
uv run scripts/import_exam_preparation_speaking_ueber_ein_thema_sprechen.py \
  --skip-speaking-audio
```

The standalone generator remains available for batch regeneration or a voice
change:

```bash
uv run manage.py generate_speaking_audio
uv run manage.py generate_speaking_audio --apply --limit 3
uv run manage.py generate_speaking_audio --apply
```

The generator now creates one file per turn inside the matching Teil folder.
`manifest.json` is retained only as a migration and audit index. Runtime API
responses use the database `audio_url` exclusively; a missing database URL
does not fall back to the manifest.

## Migrating existing flat audio

Preview the migration first:

```bash
uv run manage.py migrate_speaking_audio
```

Apply it after reviewing the planned count. If an old file cannot be matched,
the apply step generates that turn from Azure automatically, so the migration
does not require a separate audio-generation pass:

```bash
uv run manage.py migrate_speaking_audio --apply
```

The command matches each old file using the existing manifest's stable turn key
and original text, copies it into `teil1/`, `teil2/`, or `teil3/`, and writes
the new `audio_url` into both dialogue representations. Legacy flat files are
kept by default. Use `--delete-legacy` only after the deployment has been
verified:

```bash
uv run manage.py migrate_speaking_audio --apply --delete-legacy
```

## COS synchronization

The existing recursive audio synchronizer preserves the resources layout. Run
it after generation or migration:

```bash
scripts/sync_exam_preparation_audio_to_both_cos.sh --dry-run
scripts/sync_exam_preparation_audio_to_both_cos.sh
```

For a deployment that should upload only one Speaking scope, use the narrower
sync script. Set `EXAM_TYPE` and `LEVEL` to select its
`{exam_type}_{level}_speaking` directory. It scans that directory recursively
and sends its files to both configured COS buckets. Review the dry run before
the actual sync; the script's dry run still needs COS credentials and lists
remote objects to compare keys.

```bash
EXAM_TYPE=TELC LEVEL=B1 scripts/sync_exam_preparation_speaking_audio_to_both_cos.sh --dry-run
EXAM_TYPE=TELC LEVEL=B1 scripts/sync_exam_preparation_speaking_audio_to_both_cos.sh
EXAM_TYPE=TELC LEVEL=B2 scripts/sync_exam_preparation_speaking_audio_to_both_cos.sh --dry-run
EXAM_TYPE=TELC LEVEL=B2 scripts/sync_exam_preparation_speaking_audio_to_both_cos.sh
```

The default scope is `TELC` / `B1`. The source directory defaults to
`frontend/public/resources/ExamPreparation/exam_preparation_audio/{exam_type}_{level}_speaking`;
`EXAM_SPEAKING_AUDIO_SOURCE_DIR` can override it. `COS_SYNC_HELPER` can select
the helper script, and `COS_ENV_FILE` can select the file from which COS
routing settings are loaded (default `.env` in the repository). The wrapper
passes `--dry-run` through to the helper. Database/API URLs remain
`/resources/ExamPreparation/...`; the corresponding COS key starts with
`resources/ExamPreparation/...`.

Only TELC B1 can use the old unscoped `/.../speaking/...` flat URLs or the
shared/legacy-root unscoped fingerprint fallback. Other scopes can still
migrate from their own manifest key with a scoped URL.

The migration can normalize legacy dialogue strings only when they contain
explicit speaker boundaries such as `TN1: ...`, `TN2: ...`, or paired
`<TN1>...</TN1>` tags. A single plain text value without speaker labels is
stopped as unsafe because its turn boundaries and roles cannot be inferred.

The server database should keep local `/resources/...` URLs so nginx or the
media proxy can serve the same path in front of COS.

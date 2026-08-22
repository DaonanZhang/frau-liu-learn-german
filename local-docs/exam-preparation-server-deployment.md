# Exam Preparation Server Deployment Notes

This document records the minimum operational steps required when rolling out the `exam_preparation` module to a server.

## Goal

The `exam_preparation` module stores its database schema in Django migrations, but its future XLSX import files are expected to live on the server filesystem.

The frontend also needs a runtime media folder for exam-preparation listening audio files.

The import directories are runtime folders, not repository content.

Because of that:

- import folders under `apps/exam_preparation/data/imports/` are ignored by git
- they are not tracked with `.gitkeep`
- they must be created explicitly on the server during rollout

## Repository-side expectation

Tracked documentation:

- `local-docs/exam-preparation-xlsx-contract.md`

Ignored runtime import root:

- `apps/exam_preparation/data/imports/`

Ignored frontend media root:

- `frontend/public/resources/ExamPreparation1/`

## Required server filesystem layout

Create these directories on the server:

```text
apps/exam_preparation/data/imports/
├── listening/
│   ├── raw/
│   ├── processed/
│   └── failed/
├── reading_title_matching/
│   ├── raw/
│   ├── processed/
│   └── failed/
├── reading_understanding/
│   ├── raw/
│   ├── processed/
│   └── failed/
├── reading_ad_matching/
│   ├── raw/
│   ├── processed/
│   └── failed/
├── cloze_choice/
│   ├── raw/
│   ├── processed/
│   └── failed/
├── cloze_matching/
│   ├── raw/
│   ├── processed/
│   └── failed/
├── writing/
│   ├── raw/
│   ├── processed/
│   └── failed/
├── speaking_gap_matching/
│   ├── raw/
│   ├── processed/
│   └── failed/
└── speaking_prompt_segmented/
    ├── raw/
    ├── processed/
    └── failed/

frontend/public/resources/ExamPreparation1/
└── exam_preparation_audio/
```

## Recommended server command

Run this from the project root on the server:

```bash
mkdir -p \
  apps/exam_preparation/data/imports/listening/raw \
  apps/exam_preparation/data/imports/listening/processed \
  apps/exam_preparation/data/imports/listening/failed \
  apps/exam_preparation/data/imports/reading_title_matching/raw \
  apps/exam_preparation/data/imports/reading_title_matching/processed \
  apps/exam_preparation/data/imports/reading_title_matching/failed \
  apps/exam_preparation/data/imports/reading_understanding/raw \
  apps/exam_preparation/data/imports/reading_understanding/processed \
  apps/exam_preparation/data/imports/reading_understanding/failed \
  apps/exam_preparation/data/imports/reading_ad_matching/raw \
  apps/exam_preparation/data/imports/reading_ad_matching/processed \
  apps/exam_preparation/data/imports/reading_ad_matching/failed \
  apps/exam_preparation/data/imports/cloze_choice/raw \
  apps/exam_preparation/data/imports/cloze_choice/processed \
  apps/exam_preparation/data/imports/cloze_choice/failed \
  apps/exam_preparation/data/imports/cloze_matching/raw \
  apps/exam_preparation/data/imports/cloze_matching/processed \
  apps/exam_preparation/data/imports/cloze_matching/failed \
  apps/exam_preparation/data/imports/writing/raw \
  apps/exam_preparation/data/imports/writing/processed \
  apps/exam_preparation/data/imports/writing/failed \
  apps/exam_preparation/data/imports/speaking_gap_matching/raw \
  apps/exam_preparation/data/imports/speaking_gap_matching/processed \
  apps/exam_preparation/data/imports/speaking_gap_matching/failed \
  apps/exam_preparation/data/imports/speaking_prompt_segmented/raw \
  apps/exam_preparation/data/imports/speaking_prompt_segmented/processed \
  apps/exam_preparation/data/imports/speaking_prompt_segmented/failed \
  frontend/public/resources/ExamPreparation1/exam_preparation_audio
```

## Rollout checklist

Before first server use of `exam_preparation`:

1. Deploy the latest application code.
2. Install or sync Python dependencies.
3. Run Django migrations.
4. Create the import directories listed above.
5. Create `frontend/public/resources/ExamPreparation1/exam_preparation_audio` for listening audio assets.
6. Verify the account migrations created the `exam_preparation` module and the
   30/60/90-day Alipay offers at CNY 29.90/49.90/69.90.
7. Confirm `ALIPAY_SELLER_ID` and `ALIPAY_NOTIFY_URL` are configured and
   `ALIPAY_LOCAL_SIMULATE_SUCCESS=false` before enabling purchases.
8. Confirm the application process has permission to read and write these folders.
9. Run `manage.py reconcile_alipay_payments --limit 100`, then configure one
   periodic recovery runner: either Celery worker + Celery beat, or cron / a
   systemd timer that runs the same management command every 15 minutes.
   Automatic payment/grant recovery requires a scheduler, but does not require
   Celery specifically.
10. Confirm Redis is available. Generated activation codes are held in Redis,
    while the database redemption ledger is the final one-time-use authority.
11. Keep `ACTIVATION_CODE_HASH_KEY` stable and identical on every backend
    instance. It defaults to `DJANGO_SECRET_KEY`; setting a dedicated secret is
    recommended before the first production code is generated.

## Operational rule

When future XLSX import logic is added:

- new source files should be uploaded into the corresponding `raw/` folder
- successful imports should move files into `processed/`
- failed imports should move files into `failed/`

## Important note

If a new server environment is provisioned from scratch, creating the `exam_preparation` import directories is a required setup step. The repository alone will not create them because the runtime import tree is intentionally git-ignored.

The same applies to `frontend/public/resources/ExamPreparation1/exam_preparation_audio`: it is a runtime folder and must be created manually on the server.

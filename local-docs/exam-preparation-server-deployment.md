# Exam Preparation Production Rollout

This document is the production release runbook for the `exam_preparation`
module and the account, payment, promotion, frontend, import, and media changes
shipped with the current branch.

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

- `frontend/public/resources/ExamPreparation/exam_preparation_audio/`

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
├── speaking_einander_kennenlernen/
│   ├── raw/
│   ├── processed/
│   └── failed/
├── speaking_ueber_ein_thema_sprechen/
│   ├── raw/
│   ├── processed/
│   └── failed/
└── speaking_gemeinsam_etwas_planen/
    ├── raw/
    ├── processed/
    └── failed/

frontend/public/resources/ExamPreparation/
└── exam_preparation_audio/
    ├── Teil1/
    ├── Teil2/
    └── Teil3/
```

The importer creates these three subdirectories when needed. Each listening
workbook must have a matching local audio file named
`TeilX_<音频文件_ID>.<extension>`, for example `Teil1_001.mp3`.

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
  apps/exam_preparation/data/imports/speaking_einander_kennenlernen/raw \
  apps/exam_preparation/data/imports/speaking_einander_kennenlernen/processed \
  apps/exam_preparation/data/imports/speaking_einander_kennenlernen/failed \
  apps/exam_preparation/data/imports/speaking_ueber_ein_thema_sprechen/raw \
  apps/exam_preparation/data/imports/speaking_ueber_ein_thema_sprechen/processed \
  apps/exam_preparation/data/imports/speaking_ueber_ein_thema_sprechen/failed \
  apps/exam_preparation/data/imports/speaking_gemeinsam_etwas_planen/raw \
  apps/exam_preparation/data/imports/speaking_gemeinsam_etwas_planen/processed \
  apps/exam_preparation/data/imports/speaking_gemeinsam_etwas_planen/failed \
  frontend/public/resources/ExamPreparation/exam_preparation_audio
```

## Quick rollout checklist

Before first server use of `exam_preparation`:

1. Deploy the latest application code.
2. Install or sync Python dependencies.
3. Run Django migrations.
4. Create the import directories listed above.
5. Create `frontend/public/resources/ExamPreparation/exam_preparation_audio/` for listening audio assets, or let the importer create `Teil1`, `Teil2`, and `Teil3` when importing.
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
10. Activation codes are stored in PostgreSQL and do not require Redis,
    while the database redemption ledger is the final one-time-use authority.
11. Keep `ACTIVATION_CODE_HASH_KEY` stable and identical on every backend
    instance. It defaults to `DJANGO_SECRET_KEY`; setting a dedicated secret is
    recommended before the first production code is generated.

## Complete production rollout checklist

The checklist above describes the exam module's runtime directories. The
current branch also changes accounts, Alipay payments, entitlements, activation
codes, promotion codes, frontend routing, and background recovery. Treat this
as one backend-and-frontend release, not as a frontend-only page launch.

### Release blockers

Do not open the new module to users until all of these are true:

1. A restorable PostgreSQL backup exists.
2. Backend and frontend are pinned to the same reviewed commit.
3. Production environment variables are reviewed without printing secrets.
4. The complete migration plan has been reviewed and applied.
5. The three seeded offers have the intended duration and price.
6. Every workbook has passed the documented static preflight.
7. Listening audio exists locally and in both COS regions.
8. Backend, frontend, payment recovery, nginx API routing, SPA fallback, and
   `/resources/` routing have all been verified.

### Migration risks that require a database backup

The accounts app intentionally contains two migrations numbered `0013`:

- `accounts.0013_activationcoderecord`
- `accounts.0013_user_has_seen_schreiben_teil_1_guide`

They join through the dependency graph at
`accounts.0017_payment_lifecycle_activation_ledger`. Do not choose an order by
filename and do not migrate only one branch. Inspect and apply the full graph:

```bash
cd /srv/projects/frau-liu-learn-german
uv run python manage.py migrate --plan
uv run python manage.py showmigrations accounts exam_preparation
uv run python manage.py migrate --noinput
```

`accounts.0017` refuses to reverse when payment, grant-task, or activation-code
data exists. Once users start paying or redeeming codes, rollback must be a
forward corrective migration or a coordinated restore of the database backup
and the previous application commit. Do not rely on migrating accounts back to
an older number.

`exam_preparation.0013` removes the replaced experimental speaking-gap and
segmented-prompt tables. This is harmless on a clean first install. If a server
has already run an older version of this branch and those tables contain data,
inspect and export the data before migration.

Set `ACTIVATION_CODE_HASH_KEY` before migration. Migration `accounts.0017` uses
the effective key if it converts an older plaintext activation-code table, and
the same key continues to protect activation codes. Migration `accounts.0023`
also needs the existing value once to convert previously encrypted promotion
codes to their new plaintext `code` field.

- Use one strong, stable value on the web process, workers, beat, and all hosts.
- Back it up securely.
- If production previously used the default derived from `DJANGO_SECRET_KEY`,
  preserve the same effective value.
- Do not rotate it while unredeemed codes exist unless all codes will be
  reissued.

### Production environment gate

Confirm at least these production settings:

```text
DJANGO_DEBUG=false
DJANGO_ALLOWED_HOSTS=<production hosts>
DJANGO_USE_HTTPS=true
DJANGO_CSRF_TRUSTED_ORIGINS=https://<frontend-domain>
CORS_ALLOWED_ORIGINS=https://<frontend-domain>
FRONTEND_BASE_URL=https://<frontend-domain>

ACTIVATION_CODE_HASH_KEY=<stable secret>

ALIPAY_APP_ID=<production app id>
ALIPAY_GATEWAY_URL=https://openapi.alipay.com/gateway.do
ALIPAY_APP_PRIVATE_KEY=<production private key>
ALIPAY_PUBLIC_KEY=<Alipay public key>
ALIPAY_SELLER_ID=<production seller id>
ALIPAY_NOTIFY_URL=https://<backend-domain>/api/accounts/payments/alipay/notify/
ALIPAY_RETURN_URL=https://<frontend-domain>/payments/alipay/return
ALIPAY_LOCAL_SIMULATE_SUCCESS=false
ALIPAY_TIME_ZONE=Asia/Shanghai

REDIS_URL=<production Redis URL>
CELERY_BROKER_URL=<production broker URL, if Celery is used>
CELERY_RESULT_BACKEND=<production result backend, if Celery is used>
```

Also review the existing database, email, JWT lifetime, HTTPS proxy, and cookie
settings. `ALIPAY_NOTIFY_URL` must be a public backend URL, not the React page or
localhost. The reverse proxy must pass the original HTTPS scheme to Django.

Run this with the real production settings and review all new warnings:

```bash
uv run python manage.py check --deploy
```

HSTS should only be enabled after HTTPS is confirmed for every required host.
HTTP-to-HTTPS redirect may be enforced by nginx instead of Django, but one of
the two layers must enforce it.

### Listening audio must also be stored in COS

The importer finds a local file named
`TeilX_<音频文件_ID>.<extension>` and stores a stable database URL such as:

```text
/resources/ExamPreparation/exam_preparation_audio/Teil1/Teil1_001.mp3
```

Keep the `/resources/...` URL in the database. The matching COS object key must
preserve the same path, including the `resources/` prefix:

```text
resources/ExamPreparation/exam_preparation_audio/Teil1/Teil1_001.mp3
```

After placing audio on the server, dry-run and then synchronize all resources
to both the Shanghai and Frankfurt buckets:

```bash
scripts/run_learning_video_pipeline.sh \
  --sync-resources-to-cos \
  --dedupe-etag \
  --dry-run

scripts/run_learning_video_pipeline.sh \
  --sync-resources-to-cos \
  --dedupe-etag
```

The real sync is successful only when both regional statuses are zero. Test at
least one public `/resources/ExamPreparation/...mp3` URL after syncing. The
application process needs write access to workbook folders for file moves; the
web server only needs read access to media.

### Recommended first-rollout sequence

1. Record `git rev-parse HEAD` and require a clean server worktree.
2. Create a verified PostgreSQL backup; retain the current commit, environment
   version, frontend `dist/`, nginx config, and systemd config.
3. Pull one reviewed commit with `git pull --ff-only`.
4. Synchronize Python packages with `uv sync --frozen`.
5. Run:

   ```bash
   uv run python manage.py makemigrations --check --dry-run
   uv run python manage.py check
   uv run python manage.py migrate --plan
   uv run python manage.py showmigrations accounts exam_preparation
   ```

6. Stop if Django proposes new migrations, reports a graph error, or the plan
   is not understood.
7. Apply all apps with `uv run python manage.py migrate --noinput`. Do not run
   only `migrate exam_preparation`, because this release also requires account,
   user, payment, offer, code, coupon, and promotion migrations.
8. If Django admin/static assets are served from `STATIC_ROOT`, run
   `uv run python manage.py collectstatic --noinput`.
9. Create the ignored runtime directories and transfer approved workbooks and
   audio without overwriting existing files.
10. Preflight, import, and reconcile workbook and database counts.
11. Dry-run and then perform the dual-COS media sync.
12. Build the frontend with `npm ci`, `npm run build`, and confirm
    `frontend/dist/index.html` exists.
13. Restart Django/Gunicorn, Celery worker and beat when used, or the configured
    cron/systemd payment-recovery runner. Reload nginx after the completed
    frontend build or proxy change.
14. Run `uv run python manage.py reconcile_alipay_payments --limit 100` once.
15. Complete the post-deployment verification below before disabling
    maintenance mode or announcing the module.

For this first rollout, prefer the explicit sequence above over
`scripts/pull.sh`. The current script invokes deployment scripts that each run
`git pull` again, and the backend migration is performed twice. This can allow
different processes to see different commits if the remote branch moves during
deployment. The scripts also do not restart Celery, import exam workbooks, sync
exam audio to COS, or run `collectstatic`.

### Verify seeded module and offers

```bash
uv run python manage.py shell -c "
from apps.accounts.models import Module, PurchaseOffer
module = Module.objects.get(key='exam_preparation')
offers = list(
    PurchaseOffer.objects.filter(module=module)
    .values_list('code', 'plan', 'price_amount', 'currency', 'is_active')
    .order_by('sort_order')
)
print({'module_active': module.is_active, 'offers': offers})
"
```

Expected active offers:

| Code | Plan | Price |
| --- | --- | ---: |
| `exam-preparation-30d` | `m1` | CNY 29.90 |
| `exam-preparation-60d` | `m2` | CNY 49.90 |
| `exam-preparation-90d` | `m3` | CNY 69.90 |

Do not generate activation or promotion codes until this output and
`ACTIVATION_CODE_HASH_KEY` are confirmed.

### Import execution

Before a real import, follow:

- `local-docs/exam-preparation-tmp-to-imports.md`
- `local-docs/exam-preparation-import-preflight.md`
- `local-docs/exam-preparation-xlsx-contract.md`

The static preflight must report zero issues. In particular, check batch-wide
uniqueness of `(level, exercise_type, numerically normalized filename ID)`.
Place all matching listening audio before running the listening importer.

Run only importers whose `raw/` folders contain approved files:

```bash
uv run python scripts/import_exam_preparation_listening.py
uv run python scripts/import_exam_preparation_writing.py
uv run python scripts/import_exam_preparation_cloze_choice.py
uv run python scripts/import_exam_preparation_cloze_matching.py
uv run python scripts/import_exam_preparation_reading_understanding.py
uv run python scripts/import_exam_preparation_reading_ad_matching.py
uv run python scripts/import_exam_preparation_reading_title_matching.py
uv run python scripts/import_exam_preparation_speaking_einander_kennenlernen.py
uv run python scripts/import_exam_preparation_speaking_ueber_ein_thema_sprechen.py
uv run python scripts/import_exam_preparation_speaking_gemeinsam_etwas_planen.py
```

Do not use `--no-move` for the real import. Every successful workbook should be
in `processed/`; `raw/` should contain no non-example candidates; `failed/`
should be empty. One workbook is one database transaction, so a later failure
does not undo earlier successful imports. Reconcile filesystem counts with
database counts before release.

Never clear the entire project database to retry an import. If a clean exam
import is explicitly required, delete only `ExerciseBase` rows and their
`exam_preparation` cascades after taking a backup and confirming the scope.

### Frontend and nginx verification

The frontend uses browser-history routes. nginx must serve `dist/index.html`
as the SPA fallback for paths such as:

- `/modules/exam-preparation`
- `/modules/exam-preparation/hoeren`
- `/modules/exam-preparation/lesen/...`
- `/modules/exam-preparation/sprechen/...`
- `/payments/alipay/return`

Keep the routing split explicit:

- `/api/` routes to Django
- `/resources/` routes to the configured local/COS media proxy
- other browser routes use the React bundle and SPA fallback

Build completely before reloading nginx. Prefer an atomic `dist` switch if the
server already supports it so users do not receive a mixture of old and new
hashed assets during the build.

Exactly one periodic recovery mechanism should run payment reconciliation
every 15 minutes by default: Celery beat, cron, or a systemd timer. Do not run
multiple schedulers unless duplicate scheduling is intentional and monitored.

### Post-deployment smoke tests

Infrastructure:

- `GET /api/accounts/public/status/` reaches Django and returns JSON.
- `GET /api/accounts/purchase-offers/` exposes the intended active offers.
- An unsigned empty POST to
  `/api/accounts/payments/alipay/notify/` reaches Django. `400` or `failure` is
  acceptable; frontend HTML, redirect, `404`, `502`, or `504` is not.
- A deep frontend route still loads after a hard refresh.
- A real exam audio URL plays and does not return `404`.

Access and exercises:

- unauthenticated users are sent to login
- a user without entitlement can open only the first three exercises of each
  exercise type, and locked API content does not leak audio, script, answers,
  or explanations
- paid/activated users can open all content; expired users cannot
- back navigation, `Prüfen`, correct-answer highlighting, `Wiederholen`, saved
  answers, favorites, listening, writing state, and speaking recording work
- exercise layouts are usable on desktop, iPad/tablet, and mobile widths
- speaking recording is tested on public HTTPS with microphone permission

Payment and codes:

- checkout displays the server-calculated price
- one real Alipay payment reaches `paid` and its grant task reaches `succeeded`
- the return page continues polling if async notify is delayed
- expired/closed orders release reserved coupons
- full refunds revoke or compact the granted entitlement as designed
- activation and promotion codes are one-time use
- promotion reports count applied purchases rather than closed/refunded orders

Useful payment inspection:

```bash
uv run python manage.py shell -c "
from apps.accounts.models import AlipayWebsitePayment, PaymentGrantTask
print(list(AlipayWebsitePayment.objects.values_list(
    'merchant_order_no', 'status', 'total_amount', 'paid_at', 'refunded_at'
).order_by('-id')[:10]))
print(list(PaymentGrantTask.objects.values_list(
    'payment__merchant_order_no', 'status', 'user__telephone', 'last_error'
).order_by('-id')[:10]))
"
```

### Monitoring and rollback

During the first rollout window, monitor Django and nginx errors, Alipay
callback status/signature failures, payments stuck in `created`/`pending`, paid
payments with failed grants, reconciliation failures, API `401`/`403`/`5xx`,
audio `404` or slow playback, and files entering import `failed/` folders.

Keep the recovery runner active even though the callback attempts a synchronous
grant. It is the recovery path for delayed callbacks, transient gateway errors,
failed grants, refunds, coupon release, and old notify-payload cleanup.

Before production writes begin, a rollback may restore the previous commit and
database backup together. After writes begin, do not reverse `accounts.0017`
or later migrations in place. Disable the module or enable maintenance mode,
keep database/media intact, and prefer a forward hotfix. Frontend-only rollback
is insufficient when schema or payment behavior changed.

### Current local validation snapshot

Review performed on 2026-09-02:

- Django model/migration check passed (`No changes detected`).
- Django system check passed.
- All 59 discovered Django tests passed.
- The production Vite build passed.
- The generated main JavaScript chunk is about 1.58 MB (about 466 KB gzip), so
  first-load performance should be monitored and code splitting planned.
- Frontend lint currently fails on two React effect-state rules and reports one
  hook dependency warning. Vite still builds, but lint is not a green release
  gate yet.
- `git diff --check main...HEAD` reports seven trailing blank-line findings;
  these are formatting debt, not runtime failures.
- `manage.py check --deploy` has no error-level failure under production-like
  flags, but it reports existing API-schema warnings. Security warnings must be
  evaluated against the actual HTTPS/nginx configuration.

After the coupon-wallet work, the rollout also includes
`accounts.0021_payment_discount_audit_snapshots`,
`accounts.0022_flatten_promotion_campaign`, and
`accounts.0023_promotion_code_plaintext`, followed by
`accounts.0024_optional_coupon_expiry`. Apply them before serving the new
checkout UI. Migration `0023` deliberately stops if an existing promotion code
cannot be decrypted with the configured `ACTIVATION_CODE_HASH_KEY`. Migration
`0024` makes newly issued coupons permanent by default while preserving any
expiration dates already stored on existing coupons.

The local checks did not use the production PostgreSQL database or public
infrastructure. The real server migration plan, backup, nginx routes, COS
objects, and Alipay callback still require production verification.

## Operational rule

For every XLSX import:

- new source files should be uploaded into the corresponding `raw/` folder
- successful imports should move files into `processed/`
- failed imports should move files into `failed/`

## Important note

If a new server environment is provisioned from scratch, creating the `exam_preparation` import directories is a required setup step. The repository alone will not create them because the runtime import tree is intentionally git-ignored.

The same applies to
`frontend/public/resources/ExamPreparation/exam_preparation_audio/`: it is a
runtime folder. The importer/operator needs write access while preparing audio;
the web server only needs read access when serving it.

# Server Post-Pull Checklist

This document records the extra server-side steps required after pulling the latest code for the recent `learning_by_video` resource/profile and Alipay purchase flow changes.

It is intentionally focused on what must be done in addition to a normal code pull.

## Scope of These Changes

This round includes:

- `VlogSeason1` resource bucket support
- season-aware pipeline/profile selection updates
- payment route fixes for purchase offers and Alipay status polling
- payment grant flow hardening
- frontend season mapping updates for `vlog-season`
- new `ModuleSeason(season_number=4, title="Vlog季")`
- re-binding `vlog-season-lifetime` purchase offer to Season 4
- new per-video user markdown note table: `LearningVideoUserVideoNote`
- new `Video.full_subtitle_de` / `Video.full_subtitle_zh` fields
- new subtitle aggregation backfill command
- Alipay async notify / return flow requirements

## Season Model Clarification

For `learning_by_video`, the intended model is:

- `season 1`: full ScienceSeason access
- `season 2`: partial ScienceSeason access
- `season 3`: smaller ScienceSeason trial access
- `season 4`: full VlogSeason access

Important:

- `season 1`, `season 2`, and `season 3` are not separate media buckets
- they represent different access scopes over the same ScienceSeason content set
- `season 4` is the parallel full-access season for Vlog content

Resource buckets remain:

- `frontend/public/resources/ScienceSeason1`
- `frontend/public/resources/VlogSeason1`

## Required After Pull

After running your usual pull command, complete the following steps.

### 1. Run Django migrations

```bash
cd /srv/projects/frau-liu-learn-german
.venv/bin/python manage.py migrate
```

This step is required before using the new per-video note feature because it creates:

- `learning_by_video_learningvideouservideonote`
- `Video.full_subtitle_de`
- `Video.full_subtitle_zh`

If you want to run only the app migration:

```bash
cd /srv/projects/frau-liu-learn-german
.venv/bin/python manage.py migrate learning_by_video
```

### 1.1 Backfill full German/Chinese subtitle fields for existing videos

Run this once after migration so historical videos get their aggregated subtitle fields:

```bash
cd /srv/projects/frau-liu-learn-german
.venv/bin/python manage.py backfill_video_full_subtitles --only-missing --all
```

Notes:

- the command only fills videos where both fields are currently empty
- it is safe to re-run
- use `--all` only when you want to rebuild existing values
- using `--only-missing --all` here avoids depending on current primary season assignments

### 2. Create Season 4 and re-bind the Vlog purchase offer

This change is a data update, not an automatic migration. Run this once on the server:

```bash
cd /srv/projects/frau-liu-learn-german
.venv/bin/python manage.py shell -c "
from django.db import transaction
from apps.accounts.models import Module, ModuleSeason, PurchaseOffer

module = Module.objects.get(key='learning_by_video')

with transaction.atomic():
    season4, created = ModuleSeason.objects.get_or_create(
        module=module,
        season_number=4,
        defaults={'title': 'Vlog季'},
    )
    if not season4.title:
        season4.title = 'Vlog季'
        season4.save(update_fields=['title'])

    offer = PurchaseOffer.objects.get(code='vlog-season-lifetime')
    offer.season = season4
    offer.save(update_fields=['season', 'updated_at'])

    science_offer = PurchaseOffer.objects.get(code='science-season-lifetime')

    print({
        'season4_created': created,
        'season4_id': season4.id,
        'season4_title': season4.title,
        'science_offer_season': science_offer.season.season_number if science_offer.season_id else None,
        'vlog_offer_season': offer.season.season_number if offer.season_id else None,
    })
"
```

Expected result:

- `science-season-lifetime` remains on Season 1
- `vlog-season-lifetime` moves to Season 4

### 3. Ensure the Vlog resource directories exist

```bash
cd /srv/projects/frau-liu-learn-german
mkdir -p frontend/public/resources/VlogSeason1/learning_by_video_video
mkdir -p frontend/public/resources/VlogSeason1/learning_by_video_cover_letters
```

### 4. Upload Vlog media if needed

From local machine:

```bash
bash scripts/push_learning_media.sh --resource-profile vlog
```

If you only want to preview:

```bash
bash scripts/push_learning_media.sh --resource-profile vlog --dry-run
```

### 5. Rebuild frontend if your deployment serves built frontend assets

These changes include frontend updates, including:

- `homeShared.js`
- Alipay return handling
- purchase flow season mapping

If your server deployment uses a built frontend bundle, rebuild it:

```bash
cd /srv/projects/frau-liu-learn-german/frontend
npm install
npm run build
```

If your deployment uses a different frontend release workflow, follow that workflow instead.

### 6. Restart backend and worker processes

Restart whichever processes are used in your deployment:

- Django / Gunicorn / Uvicorn
- Celery worker
- Celery beat, if applicable

This is important because:

- new payment/status routes must be served by the updated backend
- payment entitlement grants still rely on `PaymentGrantTask` processing

### 7. Configure Alipay callback URLs correctly

This is required if you want a successful Alipay payment to unlock entitlement reliably even when the user does not land back on the frontend return page.

Current local `.env` uses:

- `ALIPAY_NOTIFY_URL=` (empty)
- `ALIPAY_RETURN_URL=http://localhost:5173/`

That configuration is not sufficient for real end-to-end payment confirmation.

Required server-side values:

- `ALIPAY_NOTIFY_URL=https://<your-backend-domain>/api/accounts/payments/alipay/notify/`
- `ALIPAY_RETURN_URL=https://<your-frontend-domain>/payments/alipay/return`

Notes:

- `ALIPAY_NOTIFY_URL` must be publicly reachable by Alipay over the public internet
- `ALIPAY_NOTIFY_URL` should point to the Django backend, not the frontend
- `ALIPAY_RETURN_URL` should point to the frontend route handled by `AlipayReturnPage`
- `localhost` is fine for local browser-only testing, but Alipay cannot call back into `localhost` from the internet
- without a working `notify_url`, payments can stay stuck in local `pending` state and entitlements will not be granted automatically

After updating env vars, restart the backend and worker processes again.

## Optional Verification

### Verify seasons and purchase offers

```bash
cd /srv/projects/frau-liu-learn-german
.venv/bin/python manage.py shell -c "
from apps.accounts.models import ModuleSeason, PurchaseOffer
print('seasons=', list(ModuleSeason.objects.filter(module__key='learning_by_video').values_list('id','season_number','title').order_by('season_number')))
print('offers=', list(PurchaseOffer.objects.filter(module__key='learning_by_video').values_list('code','season__season_number','season__title').order_by('id')))
"
```

Expected output should include:

- Season 1
- 使用季
- 试用
- Vlog季 (Season 4)
- `science-season-lifetime` -> Season 1
- `vlog-season-lifetime` -> Season 4

### Verify Vlog pipeline profile mapping

```bash
cd /srv/projects/frau-liu-learn-german
scripts/run_learning_video_pipeline.sh --season-number 4 --skip-step0 --skip-step1 --skip-step2 --dry-run
```

Expected behavior:

- video dir resolves to `frontend/public/resources/VlogSeason1/learning_by_video_video`
- cover dir resolves to `frontend/public/resources/VlogSeason1/learning_by_video_cover_letters`

### Verify Alipay environment on the server

```bash
cd /srv/projects/frau-liu-learn-german
.venv/bin/python manage.py shell -c "
from django.conf import settings
print({
    'ALIPAY_NOTIFY_URL': settings.ALIPAY_NOTIFY_URL,
    'ALIPAY_RETURN_URL': settings.ALIPAY_RETURN_URL,
})
"
```

Expected result:

- `ALIPAY_NOTIFY_URL` is a public HTTPS backend URL
- `ALIPAY_RETURN_URL` is the frontend `/payments/alipay/return` URL

### Verify Alipay notify reachability

Code-level correctness is not enough here. You must also confirm that the public
`ALIPAY_NOTIFY_URL` actually reaches Django through your HTTPS and reverse-proxy
stack.

Expected routing split:

- `ALIPAY_NOTIFY_URL` is a backend callback endpoint for Alipay server-to-server async notify
- `ALIPAY_RETURN_URL` is a frontend browser return page for the user

Quick public POST probe:

```bash
curl -i -X POST https://www.frauliu.com/api/accounts/payments/alipay/notify/
```

Expected behavior:

- `400` or body `failure` is acceptable for this empty probe
- this means the URL is reachable and Django rejected the request because it was not a real signed Alipay payload

Bad signs:

- `404`: route is not reaching Django
- frontend HTML page: request is being handled by the frontend site instead of the API backend
- `301` or `302`: redirect in front of notify endpoint; avoid this for payment callbacks
- `502` or `504`: reverse proxy cannot reach Django/gunicorn

If the probe is inconclusive, check service logs immediately after the request:

```bash
sudo journalctl -u frau-liu -n 100 --no-pager
sudo tail -n 100 /var/log/nginx/access.log
sudo tail -n 100 /var/log/nginx/error.log
```

You should see a hit for:

- `/api/accounts/payments/alipay/notify/`

If you do not see the request reach Django, inspect your reverse proxy config and
confirm `/api/` is forwarded to the Django service rather than the frontend build.

Typical nginx shape:

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:8000;
}
```

### Verify recent payment / grant state when debugging

```bash
cd /srv/projects/frau-liu-learn-german
.venv/bin/python manage.py shell -c "
from apps.accounts.models import AlipayWebsitePayment, PaymentGrantTask
print('payments=', list(AlipayWebsitePayment.objects.values_list('id','merchant_order_no','status','total_amount','paid_at').order_by('-id')[:10]))
print('grant_tasks=', list(PaymentGrantTask.objects.values_list('id','payment__merchant_order_no','status','user__telephone','season__season_number','last_error').order_by('-id')[:10]))
"
```

Use this to distinguish:

- payment still `pending`: notify likely did not reach backend
- payment `paid` but grant task still `pending` or `failed`: worker / grant processing problem
- grant task `succeeded`: entitlement should already exist even if return page was not visited

## Local Payment Debugging

For Alipay, there are two different things to test:

1. Frontend return-page UX
2. Real backend entitlement unlock

### What can be tested on localhost

You can test these locally without public callbacks:

- checkout page flow
- order creation
- browser redirect to Alipay
- frontend route handling at `/payments/alipay/return`
- polling logic in `AlipayReturnPage`

For that local test, set:

- `ALIPAY_RETURN_URL=http://localhost:5173/payments/alipay/return`

This fixes the current misconfiguration where return currently points to `http://localhost:5173/` instead of the payment return page.

### What cannot be fully validated on pure localhost

You cannot fully validate automatic entitlement unlock on localhost alone if:

- `ALIPAY_NOTIFY_URL` is empty, or
- `ALIPAY_NOTIFY_URL` points to localhost

Reason:

- Alipay's server cannot call your local machine directly
- without notify callback, the backend will not mark payment as `paid`
- without `paid`, the grant task will not issue the entitlement

### Recommended ways to validate real unlock behavior

Option A: use a public server environment

- deploy backend/frontend to a public HTTPS domain
- set real `ALIPAY_NOTIFY_URL`
- set real `ALIPAY_RETURN_URL`
- pay once and verify `PaymentGrantTask` becomes `succeeded`

Option B: expose local backend temporarily through a public tunnel

Examples:

- `ngrok`
- `Cloudflare Tunnel`

Then configure:

- `ALIPAY_NOTIFY_URL=https://<public-tunnel-domain>/api/accounts/payments/alipay/notify/`
- `ALIPAY_RETURN_URL=http://localhost:5173/payments/alipay/return` or a public frontend URL

This lets you keep frontend mostly local while allowing Alipay to reach the backend notify endpoint.

## Vlog Update Command

After the server is ready, the Vlog import pipeline can be run with:

```bash
cd /srv/projects/frau-liu-learn-german
scripts/run_learning_video_pipeline.sh --season-number 4 --resource-profile vlog --skip-step0 --dry-run
scripts/run_learning_video_pipeline.sh --season-number 4 --resource-profile vlog --skip-step0
```

If starting from MOV files instead of MP4 files, remove `--skip-step0`.

The pipeline now also runs a final subtitle aggregation step, which fills:

- `Video.full_subtitle_de`
- `Video.full_subtitle_zh`

## Summary

After pull, the extra required work is:

1. run `manage.py migrate`
2. run `backfill_video_full_subtitles --only-missing --all` for existing videos
3. create Season 4 and re-bind the Vlog offer
4. ensure `VlogSeason1` resource directories exist
5. upload Vlog resources if needed
6. rebuild frontend if your deployment requires it
7. restart backend and Celery processes
8. configure `ALIPAY_NOTIFY_URL` and `ALIPAY_RETURN_URL` correctly for the target environment

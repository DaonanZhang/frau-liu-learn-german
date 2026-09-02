# Account Admin Commands

## Purpose
This document collects copy-paste-safe Django shell commands for common account administration tasks.

All commands assume project root as current directory.

## Safety Notes
- Prefer checking the target user first before mutating data.
- `plan="lifetime"` means permanent access and maps to `expires_at=None`.
- Season-scoped entitlement requires both `module` and `season_number`.
- Module-wide entitlement applies to all seasons of that module when `season=None`.
- Activation codes are stored only in the durable database ledger. The original code is encrypted at rest; remarks, consumer, and consumption time remain available after redemption.
- For operator runs, prefer printing codes directly to terminal on the server instead of writing files.

## Check User By Telephone

```bash
.venv/bin/python manage.py shell -c '
from django.contrib.auth import get_user_model

User = get_user_model()
user = User.objects.get(telephone="18161347860")
print({
    "id": user.id,
    "telephone": user.telephone,
    "country_code": user.country_code,
    "is_staff": user.is_staff,
    "is_superuser": user.is_superuser,
    "is_active": user.is_active,
})
'
```

## Grant Permanent Season 4 Access To One User

This grants `learning_by_video` season 4 lifetime access to telephone `18161347860`.

```bash
.venv/bin/python manage.py shell -c '
from django.contrib.auth import get_user_model
from django.utils import timezone
from apps.accounts.models import Module, ModuleSeason, Entitlement

User = get_user_model()
user = User.objects.get(telephone="18161347860")
module = Module.objects.get(key="learning_by_video")
season, _ = ModuleSeason.objects.get_or_create(
    module=module,
    season_number=4,
    defaults={"title": "Vlog季"},
)

entitlement = (
    Entitlement.objects
    .filter(
        user=user,
        module=module,
        season=season,
        status=Entitlement.Status.ACTIVE,
    )
    .order_by("id")
    .first()
)

if entitlement is None:
    entitlement = Entitlement.objects.create(
        user=user,
        module=module,
        season=season,
        plan=Entitlement.Plan.LIFETIME,
        status=Entitlement.Status.ACTIVE,
        starts_at=timezone.now(),
        expires_at=None,
        external_ref="manual_grant_season4_lifetime",
    )
    print(f"created entitlement id={entitlement.id}")
else:
    entitlement.plan = Entitlement.Plan.LIFETIME
    entitlement.starts_at = timezone.now()
    entitlement.expires_at = None
    entitlement.external_ref = "manual_grant_season4_lifetime"
    entitlement.status = Entitlement.Status.ACTIVE
    entitlement.save(update_fields=["plan", "starts_at", "expires_at", "external_ref", "status"])
    print(f"updated entitlement id={entitlement.id}")
'
```

## Template: Grant One User Module Or Season Entitlement

Replace:
- `TARGET_PHONE`
- `MODULE_KEY`
- `SEASON_NUMBER_OR_NONE`
- `SEASON_TITLE`
- `PLAN_CONST`
- `EXTERNAL_REF`

Supported `PLAN_CONST` values:
- `Entitlement.Plan.TRIAL_7D`
- `Entitlement.Plan.MONTH_1`
- `Entitlement.Plan.MONTH_2`
- `Entitlement.Plan.MONTH_3`
- `Entitlement.Plan.MONTH_6`
- `Entitlement.Plan.MONTH_12`
- `Entitlement.Plan.LIFETIME`

```bash
.venv/bin/python manage.py shell -c '
from django.contrib.auth import get_user_model
from django.utils import timezone
from apps.accounts.models import Module, ModuleSeason, Entitlement

TARGET_PHONE = "18161347860"
MODULE_KEY = "learning_by_video"
SEASON_NUMBER = 4  # set to None for module-wide access
SEASON_TITLE = "Vlog季"
PLAN_CONST = Entitlement.Plan.LIFETIME
EXTERNAL_REF = "manual_grant"

User = get_user_model()
user = User.objects.get(telephone=TARGET_PHONE)
module = Module.objects.get(key=MODULE_KEY)

season = None
if SEASON_NUMBER is not None:
    season, _ = ModuleSeason.objects.get_or_create(
        module=module,
        season_number=SEASON_NUMBER,
        defaults={"title": SEASON_TITLE},
    )

expires_at = None if PLAN_CONST == Entitlement.Plan.LIFETIME else timezone.now()

entitlement = (
    Entitlement.objects
    .filter(
        user=user,
        module=module,
        season=season,
        status=Entitlement.Status.ACTIVE,
    )
    .order_by("id")
    .first()
)

payload = {
    "plan": PLAN_CONST,
    "status": Entitlement.Status.ACTIVE,
    "starts_at": timezone.now(),
    "expires_at": expires_at,
    "external_ref": EXTERNAL_REF,
}

if entitlement is None:
    entitlement = Entitlement.objects.create(
        user=user,
        module=module,
        season=season,
        **payload,
    )
    print(f"created entitlement id={entitlement.id}")
else:
    for key, value in payload.items():
        setattr(entitlement, key, value)
    entitlement.save(update_fields=list(payload.keys()))
    print(f"updated entitlement id={entitlement.id}")
'
```

## Generate Season Activation Codes In Bulk

This prints codes directly to the terminal and stores them in the database.
Adjust `SEASON_NUMBER`, `SEASON_TITLE`, and `COUNT` as needed.

```bash
.venv/bin/python manage.py shell -c '
from apps.accounts.models import Module, ModuleSeason
from apps.accounts.services.activation_codes import (
    ActivationEntitlementItem,
    ActivationPayload,
    ActivationPlan,
    generate_activation_code,
    store_activation_code,
    verify_activation_code,
)

MODULE_KEY = "learning_by_video"
SEASON_NUMBER = 4
SEASON_TITLE = "Vlog季"
COUNT = 201

module = Module.objects.get(key=MODULE_KEY)
ModuleSeason.objects.get_or_create(
    module=module,
    season_number=SEASON_NUMBER,
    defaults={"title": SEASON_TITLE},
)

payload = ActivationPayload(
    entitlements=[
        ActivationEntitlementItem(
            module_key=MODULE_KEY,
            plan=ActivationPlan.LIFETIME,
            season_number=SEASON_NUMBER,
        )
    ]
)

seen = set()
codes = []

while len(codes) < COUNT:
    code = generate_activation_code()
    if code in seen:
        continue
    if verify_activation_code(code):
        continue
    store_activation_code(code=code, payload=payload)
    seen.add(code)
    codes.append(code)

print(f"# module={MODULE_KEY} season={SEASON_NUMBER} count={COUNT} plan={ActivationPlan.LIFETIME}")
for code in codes:
    print(code)
'
```

## Generate Exam Preparation Timed Activation Codes

These commands store module-wide `exam_preparation` codes in the database and
print the plaintext codes once to stdout. Codes inherit the current 720-day
database expiry. Redeeming a code extends
the user's current latest expiry instead of replacing it. A day is an exact
24-hour access period.

```bash
.venv/bin/python manage.py generate_exam_preparation_codes --days 30 --count 10 --remark "渠道/批次备注"
.venv/bin/python manage.py generate_exam_preparation_codes --days 60 --count 10 --remark "渠道/批次备注"
.venv/bin/python manage.py generate_exam_preparation_codes --days 90 --count 10 --remark "渠道/批次备注"
```

Inspect the durable redemption ledger. Omit `--show-code` to keep original codes hidden:

```bash
.venv/bin/python manage.py list_activation_codes --status consumed --show-code
```

Supported durations are exactly `30`, `60`, and `90` days.

## Generate Season 1 And Season 4 Activation Codes In One Run

This prints two labeled batches in one terminal run.

```bash
.venv/bin/python manage.py shell -c '
from apps.accounts.models import Module, ModuleSeason
from apps.accounts.services.activation_codes import (
    ActivationEntitlementItem,
    ActivationPayload,
    ActivationPlan,
    generate_activation_code,
    store_activation_code,
    verify_activation_code,
)

MODULE_KEY = "learning_by_video"
BATCHES = [
    {"season_number": 1, "season_title": "Season 1", "count": 201},
    {"season_number": 4, "season_title": "Vlog季", "count": 201},
]

module = Module.objects.get(key=MODULE_KEY)

for batch in BATCHES:
    season_number = batch["season_number"]
    season_title = batch["season_title"]
    count = batch["count"]

    ModuleSeason.objects.get_or_create(
        module=module,
        season_number=season_number,
        defaults={"title": season_title},
    )

    payload = ActivationPayload(
        entitlements=[
            ActivationEntitlementItem(
                module_key=MODULE_KEY,
                plan=ActivationPlan.LIFETIME,
                season_number=season_number,
            )
        ]
    )

    seen = set()
    codes = []

    while len(codes) < count:
        code = generate_activation_code()
        if code in seen:
            continue
        if verify_activation_code(code):
            continue
        store_activation_code(code=code, payload=payload)
        seen.add(code)
        codes.append(code)

    print(f"# module={MODULE_KEY} season={season_number} count={count} plan={ActivationPlan.LIFETIME}")
    for code in codes:
        print(code)
    print()
'
```

## Grant One User Module-Wide Lifetime Access

This grants access to all seasons under one module.

```bash
.venv/bin/python manage.py shell -c '
from django.contrib.auth import get_user_model
from django.utils import timezone
from apps.accounts.models import Module, Entitlement

User = get_user_model()
user = User.objects.get(telephone="18161347860")
module = Module.objects.get(key="learning_by_video")

entitlement, created = Entitlement.objects.get_or_create(
    user=user,
    module=module,
    season=None,
    plan=Entitlement.Plan.LIFETIME,
    starts_at=timezone.now(),
    defaults={
        "status": Entitlement.Status.ACTIVE,
        "expires_at": None,
        "external_ref": "manual_module_lifetime",
    },
)

if not created:
    entitlement.status = Entitlement.Status.ACTIVE
    entitlement.expires_at = None
    entitlement.external_ref = "manual_module_lifetime"
    entitlement.save(update_fields=["status", "expires_at", "external_ref"])

print({"id": entitlement.id, "created": created})
'
```

## Make One User Superuser

This also sets `is_staff=True` and `is_active=True`.

```bash
.venv/bin/python manage.py shell -c '
from django.contrib.auth import get_user_model

User = get_user_model()
user = User.objects.get(telephone="18161347860")
user.is_superuser = True
user.is_staff = True
user.is_active = True
user.save(update_fields=["is_superuser", "is_staff", "is_active"])
print({
    "id": user.id,
    "telephone": user.telephone,
    "is_staff": user.is_staff,
    "is_superuser": user.is_superuser,
    "is_active": user.is_active,
})
'
```

## Remove Superuser From One User

```bash
.venv/bin/python manage.py shell -c '
from django.contrib.auth import get_user_model

User = get_user_model()
user = User.objects.get(telephone="18161347860")
user.is_superuser = False
user.is_staff = False
user.save(update_fields=["is_superuser", "is_staff"])
print({
    "id": user.id,
    "telephone": user.telephone,
    "is_staff": user.is_staff,
    "is_superuser": user.is_superuser,
})
'
```

## Inspect One User Entitlements

```bash
.venv/bin/python manage.py shell -c '
from django.contrib.auth import get_user_model
from apps.accounts.models import Entitlement

User = get_user_model()
user = User.objects.get(telephone="18161347860")

rows = list(
    Entitlement.objects
    .filter(user=user)
    .select_related("module", "season")
    .order_by("id")
    .values(
        "id",
        "module__key",
        "season__season_number",
        "plan",
        "status",
        "starts_at",
        "expires_at",
        "external_ref",
    )
)

print(rows)
'
```

## Revoke One Module Or Season Entitlement

This marks matching entitlements as `canceled`.

```bash
.venv/bin/python manage.py shell -c '
from django.contrib.auth import get_user_model
from apps.accounts.models import Module, Entitlement

TARGET_PHONE = "18161347860"
MODULE_KEY = "learning_by_video"
SEASON_NUMBER = 4  # set to None for module-wide entitlement

User = get_user_model()
user = User.objects.get(telephone=TARGET_PHONE)
module = Module.objects.get(key=MODULE_KEY)

qs = Entitlement.objects.filter(user=user, module=module)
if SEASON_NUMBER is None:
    qs = qs.filter(season__isnull=True)
else:
    qs = qs.filter(season__season_number=SEASON_NUMBER)

count = qs.update(status=Entitlement.Status.CANCELED)
print({"updated": count})
'
```

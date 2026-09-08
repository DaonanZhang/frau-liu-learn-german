---
name: account-admin-ops
description: Use this when you need to generate or run Django shell commands for account administration in this project, especially changing a user's superuser flags, granting or revoking module or season entitlements by telephone number, inspecting existing entitlements, or producing copy-paste-safe admin command templates.
---

# Account Admin Ops

Use this skill for operational account changes in this repository.

## Scope
- Grant module-wide entitlement to one user by telephone number.
- Grant season-scoped entitlement to one user by telephone number.
- Generate season-scoped activation codes in bulk and print them directly to terminal.
- Change `is_superuser`, `is_staff`, or `is_active`.
- Inspect current user entitlements before or after a change.
- Inspect one user's account flags and entitlement rows by telephone number.
- Produce copy-paste-safe `manage.py shell -c` commands for operators.

## Workflow
1. Read [account-admin-commands.md](../../../local-docs/account-admin-commands.md) first.
2. Prefer producing a command instead of editing application code.
3. When granting access:
   - resolve the user by `telephone`
   - resolve the module by `Module.key`
   - use `ModuleSeason` only when season-scoped access is intended
   - use `Entitlement.Plan.LIFETIME` with `expires_at=None` for permanent access
   - set `external_ref` to a traceable manual label
4. When generating activation codes:
   - prefer a copy-paste-safe `manage.py shell -c` command over editing app code
   - print codes directly to stdout unless the user explicitly asks for file output
   - keep the payload season-scoped by setting `season_number` on `ActivationEntitlementItem`
   - mention that activation codes are stored in the database and currently default to a 720-day expiry
   - avoid duplicate codes within the same batch and skip codes that already exist in the database
5. Before mutating existing access, prefer checking current entitlements.
6. If the user asks for a reusable snippet, start from the template below and fill only the requested parameters.

## Template: Inspect One User Permissions

Use this when the user asks to check what permissions or entitlements a telephone number currently has.

```bash
.venv/bin/python manage.py shell -c '
from django.contrib.auth import get_user_model
from apps.accounts.models import Entitlement

TARGET_PHONE = "TARGET_PHONE"

User = get_user_model()
user = User.objects.get(telephone=TARGET_PHONE)

print({
    "id": user.id,
    "telephone": user.telephone,
    "country_code": user.country_code,
    "is_staff": user.is_staff,
    "is_superuser": user.is_superuser,
    "is_active": user.is_active,
})

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

## Template: Season Or Module Entitlement

Replace the placeholder values and keep the structure unchanged.

```bash
.venv/bin/python manage.py shell -c '
from django.contrib.auth import get_user_model
from django.utils import timezone
from apps.accounts.models import Module, ModuleSeason, Entitlement

TARGET_PHONE = "TARGET_PHONE"
MODULE_KEY = "MODULE_KEY"
SEASON_NUMBER = 4  # set to None for module-wide access
SEASON_TITLE = "SEASON_TITLE"
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

## Template: Batch Generate Season Activation Codes

Use this when the user wants a server-side command that prints activation codes directly in the terminal.

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

## Template: Superuser Toggle

```bash
.venv/bin/python manage.py shell -c '
from django.contrib.auth import get_user_model

TARGET_PHONE = "TARGET_PHONE"
MAKE_SUPERUSER = True

User = get_user_model()
user = User.objects.get(telephone=TARGET_PHONE)
user.is_superuser = MAKE_SUPERUSER
user.is_staff = MAKE_SUPERUSER
if MAKE_SUPERUSER:
    user.is_active = True
    user.save(update_fields=["is_superuser", "is_staff", "is_active"])
else:
    user.save(update_fields=["is_superuser", "is_staff"])

print({
    "id": user.id,
    "telephone": user.telephone,
    "is_staff": user.is_staff,
    "is_superuser": user.is_superuser,
    "is_active": user.is_active,
})
'
```

## Output Rules
- Return commands in fenced `bash` blocks.
- Keep placeholders explicit when the user asks for a template.
- Use concrete values when the user gives a specific telephone, module, season, or plan.
- Do not use destructive git commands as part of this skill.

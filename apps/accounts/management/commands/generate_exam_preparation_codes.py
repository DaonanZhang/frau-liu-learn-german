from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError

from apps.accounts.models import Module
from apps.accounts.services.activation_codes import (
    ActivationEntitlementItem,
    ActivationPayload,
    ActivationPlan,
    generate_activation_code,
    store_activation_code,
)


PLAN_BY_DAYS = {
    30: ActivationPlan.M1,
    60: ActivationPlan.M2,
    90: ActivationPlan.M3,
}


class Command(BaseCommand):
    help = "Generate Redis-backed 30/60/90-day activation codes for exam_preparation."

    def add_arguments(self, parser):
        parser.add_argument("--days", type=int, choices=PLAN_BY_DAYS, required=True)
        parser.add_argument("--count", type=int, default=1)
        parser.add_argument("--remark", type=str, default="")

    def handle(self, *args, **options):
        days = options["days"]
        count = options["count"]
        if count < 1 or count > 10000:
            raise CommandError("--count must be between 1 and 10000")

        Module.objects.get(key="exam_preparation", is_active=True)
        payload = ActivationPayload(
            entitlements=[
                ActivationEntitlementItem(
                    module_key="exam_preparation",
                    plan=PLAN_BY_DAYS[days],
                    season_number=None,
                )
            ],
            remark=options["remark"].strip(),
        )

        codes = []
        while len(codes) < count:
            code = generate_activation_code(length=12)
            try:
                store_activation_code(code=code, payload=payload)
            except ValueError:
                continue
            codes.append(code)

        self.stdout.write(f"# module=exam_preparation days={days} count={count}")
        for code in codes:
            self.stdout.write(code)

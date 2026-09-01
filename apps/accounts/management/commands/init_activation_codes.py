from __future__ import annotations

from django.core.management.base import BaseCommand

from apps.accounts.services.activation_codes import (
    ActivationEntitlementItem,
    ActivationPayload,
    ActivationPlan,
    generate_activation_code,
    store_activation_code,
)


class Command(BaseCommand):
    help = "Generate super activation codes (lifetime, all modules)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--count",
            type=int,
            default=10,
            help="Number of activation codes to generate",
        )
        parser.add_argument("--remark", type=str, default="")

    def handle(self, *args, **options):
        count = options["count"]

        self.stdout.write("🔐 Generating activation codes...\n")

        created = 0
        while created < count:
            code = generate_activation_code()

            payload = ActivationPayload(
                entitlements=[
                    ActivationEntitlementItem(
                        module_key="learning_by_video",
                        plan=ActivationPlan.LIFETIME,
                        season_number=None,
                    )
                ],
                remark=options["remark"].strip(),
            )

            try:
                store_activation_code(
                    code=code,
                    payload=payload,
                )
            except ValueError:
                continue

            created += 1
            self.stdout.write(f"✅ {created}. {code}")

        self.stdout.write(
            self.style.SUCCESS(f"\n🎉 Generated {count} activation codes.")
        )

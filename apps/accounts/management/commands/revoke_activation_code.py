from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError

from apps.accounts.services.activation_codes import revoke_activation_code


class Command(BaseCommand):
    help = "Revoke a persisted activation code and remove it from Redis."

    def add_arguments(self, parser):
        parser.add_argument("code", type=str, help="Activation code to revoke")

    def handle(self, *args, **options):
        code = str(options["code"]).strip()
        if not code:
            raise CommandError("Activation code is required.")

        if not revoke_activation_code(code):
            raise CommandError(f"Activation code not found or already consumed: {code}")

        self.stdout.write(self.style.SUCCESS(f"Revoked activation code: {code}"))

from __future__ import annotations

from django.core.management.base import BaseCommand
from django.core.management import call_command
from django.db import transaction


class Command(BaseCommand):
    help = "Initialize all base data (modules, admin user, activation codes)."

    def handle(self, *args, **options):
        self.stdout.write("\n🚀 Running full system initialization...\n")

        # 1️⃣ Database-related initialization (atomic)
        with transaction.atomic():
            self.stdout.write("1️⃣ Initializing modules...")
            call_command("init_modules")

            self.stdout.write("\n2️⃣ Initializing super admin user...")
            call_command(
                "init_admin_user",
                telephone="110",  # cops
                password="test123",
            )

        # 2️⃣ Redis-related initialization (after DB success)
        self.stdout.write("\n3️⃣ Generating activation codes...")
        call_command(
            "init_activation_codes",
            count=10,
        )

        self.stdout.write(
            self.style.SUCCESS("\n🎉 Full initialization completed successfully.")
        )

from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.accounts.models.user import User


class Command(BaseCommand):
    help = "Create a super admin user (telephone-based)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--telephone",
            type=str,
            default="13900000000",
            help="Admin telephone number",
        )
        parser.add_argument(
            "--password",
            type=str,
            default="admin123456",
            help="Admin password",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        telephone = options["telephone"]
        password = options["password"]

        if User.objects.filter(telephone=telephone).exists():
            self.stdout.write(
                self.style.WARNING(f"ℹ️ Admin user already exists: {telephone}")
            )
            return

        User.objects.create_superuser(
            telephone=telephone,
            password=password,
        )

        self.stdout.write(self.style.SUCCESS("✅ Super admin created"))
        self.stdout.write(f"   telephone: {telephone}")

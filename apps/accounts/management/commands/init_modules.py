from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.accounts.models.module import Module
from apps.accounts.models.module_season import ModuleSeason


class Command(BaseCommand):
    help = "Initialize base modules and module seasons."

    @transaction.atomic
    def handle(self, *args, **options):
        self.stdout.write("🔧 Initializing modules...")

        module, module_created = Module.objects.get_or_create(
            key="learning_by_video",
            defaults={
                "name": "Learning by Video",
                "is_active": True,
            },
        )

        if module_created:
            self.stdout.write("✅ Created module: learning_by_video")
        else:
            self.stdout.write("ℹ️ Module already exists: learning_by_video")

        season, season_created = ModuleSeason.objects.get_or_create(
            module=module,
            season_number=1,
            defaults={
                "title": "Season 1",
            },
        )

        if season_created:
            self.stdout.write("✅ Created module season: Season 1")
        else:
            self.stdout.write("ℹ️ Module season already exists: Season 1")

        season2, season2_created = ModuleSeason.objects.get_or_create(
            module=module,
            season_number=2,
            defaults={
                "title": "Season 2",
            },
        )

        if season2_created:
            self.stdout.write("✅ Created module season: Season 2")
        else:
            self.stdout.write("ℹ️ Module season already exists: Season 2")

        self.stdout.write(self.style.SUCCESS("🎉 Module initialization finished."))

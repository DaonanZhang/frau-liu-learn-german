from django.core.management.base import BaseCommand, CommandError
from django.db import DatabaseError

from apps.accounts.services.referral_campaign import backfill_referral_codes


class Command(BaseCommand):
    help = "Backfill referral codes for exam preparation users."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        try:
            stats = backfill_referral_codes(dry_run=dry_run)
        except (ValueError, RuntimeError, DatabaseError) as exc:
            raise CommandError(str(exc)) from exc

        mode = "dry-run" if dry_run else "apply"
        self.stdout.write(
            f"mode={mode} created={stats.created} existing={stats.existing} "
            f"skipped={stats.skipped} failed={stats.failed}"
        )

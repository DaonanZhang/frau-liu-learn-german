from __future__ import annotations

import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from apps.exam_preparation.content_bundle import ContentBundleError, import_telc_c1_bundle


class Command(BaseCommand):
    help = "Validate or apply one TELC C1 content bundle; dry-run by default and never deletes content."

    def add_arguments(self, parser):
        parser.add_argument("bundle", help="JSON bundle produced by export_telc_c1_content")
        parser.add_argument("--apply", action="store_true", help="Write the validated bundle to the database")

    def handle(self, *args, **options):
        path = Path(options["bundle"]).expanduser().resolve()
        try:
            bundle = json.loads(path.read_text(encoding="utf-8"))
            result = import_telc_c1_bundle(bundle, apply=options["apply"])
        except (ContentBundleError, json.JSONDecodeError, OSError) as exc:
            raise CommandError(str(exc)) from exc
        mode = "Applied" if options["apply"] else "Dry run"
        self.stdout.write(
            self.style.SUCCESS(
                f"{mode}: {result['exercises']} exercises; "
                f"{result['created']} create, {result['updated']} update, "
                f"{result['unlisted']} unlisted server records kept."
            )
        )
        if not options["apply"]:
            self.stdout.write("No database changes were committed. Use --apply after reviewing this summary.")

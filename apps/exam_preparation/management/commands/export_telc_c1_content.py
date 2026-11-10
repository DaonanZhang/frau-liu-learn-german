from __future__ import annotations

import hashlib
import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from apps.exam_preparation.content_bundle import ContentBundleError, export_telc_c1_bundle


class Command(BaseCommand):
    help = "Export TELC C1 exercise content without database primary keys or user data."

    def add_arguments(self, parser):
        parser.add_argument("--output", required=True, help="Destination JSON file")

    def handle(self, *args, **options):
        output = Path(options["output"]).expanduser().resolve()
        try:
            bundle = export_telc_c1_bundle()
            encoded = json.dumps(bundle, ensure_ascii=False, indent=2, sort_keys=True).encode("utf-8") + b"\n"
            output.parent.mkdir(parents=True, exist_ok=True)
            temporary = output.with_suffix(f"{output.suffix}.tmp")
            temporary.write_bytes(encoded)
            temporary.replace(output)
        except (ContentBundleError, OSError) as exc:
            raise CommandError(str(exc)) from exc
        digest = hashlib.sha256(encoded).hexdigest()
        self.stdout.write(self.style.SUCCESS(f"Exported {bundle['counts']['exercises']} exercises to {output}"))
        self.stdout.write(f"SHA256 {digest}")

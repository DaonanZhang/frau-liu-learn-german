#!/usr/bin/env python3
"""Create and verify a complete PostgreSQL logical backup for this project."""

from __future__ import annotations

import argparse
import hashlib
import os
import re
import shutil
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_BACKUP_DIR = Path(
    os.environ.get(
        "POSTGRES_BACKUP_DIR",
        "/srv/backups/frau-liu-learn-german/postgresql",
    )
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Use the Django database settings to create a pg_dump custom-format "
            "backup, verify its catalog, and write a SHA-256 checksum."
        )
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_BACKUP_DIR,
        help=f"Backup destination (default: {DEFAULT_BACKUP_DIR})",
    )
    parser.add_argument(
        "--database-alias",
        default="default",
        help="Django database alias (default: default)",
    )
    return parser.parse_args()


def safe_filename(value: object) -> str:
    normalized = re.sub(r"[^A-Za-z0-9_.-]+", "_", str(value or "database"))
    return normalized.strip("._") or "database"


def sha256sum(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as backup_file:
        for block in iter(lambda: backup_file.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def main() -> int:
    args = parse_args()

    pg_dump = shutil.which("pg_dump")
    pg_restore = shutil.which("pg_restore")
    if not pg_dump or not pg_restore:
        raise SystemExit("pg_dump and pg_restore must both be installed and available in PATH.")

    os.chdir(PROJECT_ROOT)
    sys.path.insert(0, str(PROJECT_ROOT))
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

    import django
    from django.db import connections

    django.setup()
    database = connections[args.database_alias].settings_dict
    if "postgresql" not in str(database.get("ENGINE", "")):
        raise SystemExit(
            f"Database alias {args.database_alias!r} is not configured as PostgreSQL."
        )

    output_dir = args.output_dir.expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    output_dir.chmod(0o700)

    timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    stem = f"{safe_filename(database.get('NAME'))}-{timestamp}"
    final_backup = output_dir / f"{stem}.dump"
    temporary_backup = output_dir / f".{stem}.dump.incomplete"
    manifest = output_dir / f"{stem}.manifest.txt"
    checksum = output_dir / f"{stem}.sha256"

    connection_environment = os.environ.copy()
    connection_environment.update(
        {
            "PGDATABASE": str(database.get("NAME") or ""),
            "PGUSER": str(database.get("USER") or ""),
            "PGPASSWORD": str(database.get("PASSWORD") or ""),
            "PGHOST": str(database.get("HOST") or ""),
            "PGPORT": str(database.get("PORT") or ""),
        }
    )

    try:
        subprocess.run(
            [
                pg_dump,
                "--format=custom",
                "--no-owner",
                "--no-acl",
                "--file",
                str(temporary_backup),
            ],
            check=True,
            env=connection_environment,
        )
        if not temporary_backup.is_file() or temporary_backup.stat().st_size == 0:
            raise RuntimeError("pg_dump completed without producing a non-empty backup.")
        temporary_backup.chmod(0o600)

        with manifest.open("wb") as manifest_file:
            subprocess.run(
                [pg_restore, "--list", str(temporary_backup)],
                check=True,
                stdout=manifest_file,
                stderr=subprocess.PIPE,
            )
        manifest.chmod(0o600)

        temporary_backup.replace(final_backup)
        checksum.write_text(
            f"{sha256sum(final_backup)}  {final_backup.name}\n",
            encoding="utf-8",
        )
        checksum.chmod(0o600)
    except Exception:
        temporary_backup.unlink(missing_ok=True)
        manifest.unlink(missing_ok=True)
        checksum.unlink(missing_ok=True)
        raise

    print(f"Backup:  {final_backup}")
    print(f"Catalog: {manifest}")
    print(f"SHA-256: {checksum}")
    print("Verification: pg_restore successfully read the backup catalog.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

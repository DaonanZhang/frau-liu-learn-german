#!/usr/bin/env python3
from __future__ import annotations

import argparse
import configparser
import hashlib
import os
import sys
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import quote


DEFAULT_BUCKET = "frauliu-eu-1335740446"
DEFAULT_REGION = "eu-frankfurt"
DEFAULT_DOMAIN = "https://frauliu-eu-1335740446.cos.eu-frankfurt.myqcloud.com"
DEFAULT_PREFIX = "resources/VlogSeason1"
DEFAULT_INCLUDE_DIRS = (
    "learning_by_video_video",
    "learning_by_video_cover_letters",
)


@dataclass(frozen=True)
class RemoteObject:
    key: str
    etag: str
    size: int


@dataclass
class SyncStats:
    total: int = 0
    uploaded: int = 0
    skipped_key: int = 0
    skipped_etag: int = 0
    failed: int = 0

    @property
    def skipped(self) -> int:
        return self.skipped_key + self.skipped_etag


def build_parser(repo_root: Path) -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Upload local VlogSeason1 legacy files missing from the Frankfurt Tencent COS bucket. "
            "Shanghai COS is never read or written."
        )
    )
    parser.add_argument(
        "--source-dir",
        type=Path,
        default=repo_root / "frontend/public/resources/VlogSeason1",
        help="Local VlogSeason1 root (default: frontend/public/resources/VlogSeason1)",
    )
    parser.add_argument(
        "--include-dir",
        action="append",
        dest="include_dirs",
        metavar="RELATIVE_DIR",
        help=(
            "Directory below source-dir to scan recursively; repeat to select multiple directories. "
            "Defaults to learning_by_video_video and learning_by_video_cover_letters."
        ),
    )
    parser.add_argument("--bucket", default=DEFAULT_BUCKET)
    parser.add_argument("--region", default=DEFAULT_REGION)
    parser.add_argument("--domain", default=DEFAULT_DOMAIN)
    parser.add_argument(
        "--object-prefix",
        default=DEFAULT_PREFIX,
        help="COS key prefix corresponding to source-dir (default: resources/VlogSeason1)",
    )
    parser.add_argument(
        "--config",
        type=Path,
        default=Path("~/.cos.conf"),
        help="COSCMD INI config containing [common] secret_id/secret_key (default: ~/.cos.conf)",
    )
    parser.add_argument("--retries", type=int, default=5, help="Upload attempts per file (default: 5)")
    parser.add_argument(
        "--retry-delay",
        type=float,
        default=2.0,
        help="Initial retry delay in seconds; exponential backoff is used (default: 2)",
    )
    parser.add_argument(
        "--part-size-mb",
        type=int,
        default=8,
        help="Multipart upload part size in MiB (default: 8)",
    )
    parser.add_argument(
        "--max-threads",
        type=int,
        default=5,
        help="SDK multipart upload worker count (default: 5)",
    )
    parser.add_argument(
        "--dedupe-etag",
        action="store_true",
        help=(
            "Additionally skip a missing key when its local MD5 matches a single-part ETag already "
            "under the Frankfurt prefix. Full object-key matching is always enabled."
        ),
    )
    parser.add_argument("--dry-run", action="store_true", help="List planned uploads without writing COS")
    return parser


def validate_args(args: argparse.Namespace) -> None:
    args.source_dir = args.source_dir.expanduser().resolve()
    args.config = args.config.expanduser()
    args.object_prefix = args.object_prefix.strip("/")
    args.domain = args.domain.rstrip("/")

    if not args.source_dir.is_dir():
        raise ValueError(f"source directory not found: {args.source_dir}")
    if args.include_dirs is None:
        args.include_dirs = list(DEFAULT_INCLUDE_DIRS)
    normalized_include_dirs: list[str] = []
    for raw_dir in args.include_dirs:
        relative_dir = str(raw_dir).strip().strip("/")
        if not relative_dir or Path(relative_dir).is_absolute() or ".." in Path(relative_dir).parts:
            raise ValueError(f"invalid --include-dir path: {raw_dir}")
        local_dir = args.source_dir / relative_dir
        if not local_dir.is_dir():
            raise ValueError(f"included source directory not found: {local_dir}")
        normalized_include_dirs.append(relative_dir)
    args.include_dirs = list(dict.fromkeys(normalized_include_dirs))
    if not args.object_prefix:
        raise ValueError("--object-prefix cannot be empty")
    if args.retries < 1:
        raise ValueError("--retries must be at least 1")
    if args.retry_delay < 0:
        raise ValueError("--retry-delay cannot be negative")
    if args.part_size_mb < 1:
        raise ValueError("--part-size-mb must be at least 1")
    if args.max_threads < 1:
        raise ValueError("--max-threads must be at least 1")


def load_credentials(config_path: Path) -> tuple[str, str, str | None]:
    secret_id = os.getenv("COS_SECRET_ID") or os.getenv("TENCENTCLOUD_SECRET_ID")
    secret_key = os.getenv("COS_SECRET_KEY") or os.getenv("TENCENTCLOUD_SECRET_KEY")
    token = os.getenv("COS_SESSION_TOKEN") or os.getenv("TENCENTCLOUD_SESSION_TOKEN")

    if secret_id or secret_key:
        if not secret_id or not secret_key:
            raise ValueError(
                "incomplete COS environment credentials: set both SecretId and SecretKey variables"
            )
        return secret_id, secret_key, token

    if not config_path.is_file():
        raise ValueError(f"COS config not found: {config_path}")

    config = configparser.ConfigParser()
    config.read(config_path, encoding="utf-8")
    if not config.has_section("common"):
        raise ValueError(f"COS config has no [common] section: {config_path}")

    secret_id = config.get("common", "secret_id", fallback="").strip()
    secret_key = config.get("common", "secret_key", fallback="").strip()
    token = config.get("common", "token", fallback="").strip() or None
    if not secret_id or not secret_key:
        raise ValueError(f"COS config is missing secret_id or secret_key: {config_path}")
    return secret_id, secret_key, token


def create_client(args: argparse.Namespace) -> Any:
    try:
        from qcloud_cos import CosConfig, CosS3Client
    except ImportError as exc:
        raise RuntimeError(
            "qcloud_cos is unavailable; install it with: cos-venv/bin/pip install cos-python-sdk-v5"
        ) from exc

    secret_id, secret_key, token = load_credentials(args.config)
    config = CosConfig(
        Region=args.region,
        SecretId=secret_id,
        SecretKey=secret_key,
        Token=token,
        Scheme="https",
    )
    return CosS3Client(config)


def collect_local_files(source_dir: Path, include_dirs: list[str] | None = None) -> list[Path]:
    scan_roots = (
        [source_dir / relative_dir for relative_dir in include_dirs]
        if include_dirs is not None
        else [source_dir]
    )
    return sorted(
        (
            path
            for scan_root in scan_roots
            for path in scan_root.rglob("*")
            if path.is_file() and not path.is_symlink()
        ),
        key=lambda path: path.relative_to(source_dir).as_posix(),
    )


def object_key_for(path: Path, source_dir: Path, prefix: str) -> str:
    relative = path.relative_to(source_dir).as_posix()
    return f"{prefix}/{relative}"


def normalize_etag(raw: Any) -> str:
    return str(raw or "").strip().strip('"').lower()


def list_remote_objects(client: Any, bucket: str, prefix: str) -> dict[str, RemoteObject]:
    objects: dict[str, RemoteObject] = {}
    marker = ""
    page = 0

    while True:
        request: dict[str, Any] = {
            "Bucket": bucket,
            "Prefix": f"{prefix.rstrip('/')}/",
            "MaxKeys": 1000,
        }
        if marker:
            request["Marker"] = marker

        response = client.list_objects(**request)
        page += 1
        contents = response.get("Contents") or []
        for item in contents:
            key = str(item.get("Key") or "")
            if not key:
                continue
            objects[key] = RemoteObject(
                key=key,
                etag=normalize_etag(item.get("ETag")),
                size=int(item.get("Size") or 0),
            )
        print(f"Remote scan page {page}: +{len(contents)} object(s), total={len(objects)}")

        truncated = str(response.get("IsTruncated") or "false").lower() == "true"
        if not truncated:
            break
        marker = str(response.get("NextMarker") or "")
        if not marker:
            raise RuntimeError("COS returned IsTruncated=true without NextMarker")

    return objects


def md5_file(path: Path, chunk_size: int = 4 * 1024 * 1024) -> str:
    digest = hashlib.md5(usedforsecurity=False)
    with path.open("rb") as handle:
        while chunk := handle.read(chunk_size):
            digest.update(chunk)
    return digest.hexdigest()


def build_progress_callback(index: int, total_files: int, relative_name: str):
    lock = threading.Lock()
    last_percent = -10

    def callback(consumed_bytes: int, total_bytes: int) -> None:
        nonlocal last_percent
        if total_bytes <= 0:
            return
        percent = min(100, int(consumed_bytes * 100 / total_bytes))
        with lock:
            if percent < 100 and percent < last_percent + 10:
                return
            last_percent = percent
            print(f"  [{index}/{total_files}] {relative_name}: {percent}%", flush=True)

    return callback


def upload_with_retry(
    client: Any,
    *,
    args: argparse.Namespace,
    path: Path,
    key: str,
    index: int,
    total_files: int,
) -> tuple[bool, str | None]:
    relative_name = path.relative_to(args.source_dir).as_posix()
    last_error: Exception | None = None

    for attempt in range(1, args.retries + 1):
        try:
            client.upload_file(
                Bucket=args.bucket,
                Key=key,
                LocalFilePath=str(path),
                PartSize=args.part_size_mb,
                MAXThread=args.max_threads,
                EnableMD5=True,
                progress_callback=build_progress_callback(index, total_files, relative_name),
            )
            public_url = f"{args.domain}/{quote(key, safe='/')}"
            return True, public_url
        except Exception as exc:  # SDK exposes multiple client/service exception classes.
            last_error = exc
            print(
                f"  attempt {attempt}/{args.retries} failed for {relative_name}: {exc}",
                file=sys.stderr,
            )
            if attempt < args.retries:
                delay = args.retry_delay * (2 ** (attempt - 1))
                print(f"  retrying in {delay:.1f}s; multipart uploads can resume uploaded parts")
                time.sleep(delay)

    return False, str(last_error) if last_error else "unknown upload error"


def sync_files(
    client: Any,
    args: argparse.Namespace,
    local_files: list[Path],
    remote_objects: dict[str, RemoteObject],
) -> tuple[SyncStats, list[tuple[str, str]]]:
    stats = SyncStats(total=len(local_files))
    failures: list[tuple[str, str]] = []
    remote_single_part_etags = {
        obj.etag for obj in remote_objects.values() if obj.etag and "-" not in obj.etag
    }

    for index, path in enumerate(local_files, start=1):
        relative_name = path.relative_to(args.source_dir).as_posix()
        key = object_key_for(path, args.source_dir, args.object_prefix)

        if key in remote_objects:
            stats.skipped_key += 1
            print(f"[{index}/{stats.total}] SKIP existing key: {relative_name}")
            continue

        if args.dedupe_etag:
            local_etag = md5_file(path)
            if local_etag in remote_single_part_etags:
                stats.skipped_etag += 1
                print(f"[{index}/{stats.total}] SKIP duplicate ETag: {relative_name}")
                continue

        if args.dry_run:
            stats.uploaded += 1
            print(f"[{index}/{stats.total}] WOULD UPLOAD: {relative_name} -> cos://{args.bucket}/{key}")
            continue

        print(
            f"[{index}/{stats.total}] UPLOAD: {relative_name} "
            f"({path.stat().st_size} bytes) -> cos://{args.bucket}/{key}"
        )
        success, detail = upload_with_retry(
            client,
            args=args,
            path=path,
            key=key,
            index=index,
            total_files=stats.total,
        )
        if success:
            stats.uploaded += 1
            print(f"  uploaded: {detail}")
        else:
            stats.failed += 1
            failures.append((relative_name, detail or "unknown upload error"))
            print(f"  FAILED: {relative_name}: {detail}", file=sys.stderr)

    return stats, failures


def print_summary(stats: SyncStats, failures: list[tuple[str, str]], dry_run: bool) -> None:
    label = "DRY-RUN summary" if dry_run else "Sync summary"
    print("\n" + label)
    print(f"  total local files: {stats.total}")
    print(f"  {'would upload' if dry_run else 'uploaded'}: {stats.uploaded}")
    print(f"  skipped: {stats.skipped}")
    print(f"    existing key: {stats.skipped_key}")
    print(f"    duplicate ETag: {stats.skipped_etag}")
    print(f"  failed: {stats.failed}")
    if failures:
        print("  failed files:", file=sys.stderr)
        for name, error in failures:
            print(f"    - {name}: {error}", file=sys.stderr)


def main(argv: list[str] | None = None) -> int:
    repo_root = Path(__file__).resolve().parent.parent
    parser = build_parser(repo_root)
    args = parser.parse_args(argv)

    try:
        validate_args(args)
        print(f"Source: {args.source_dir}")
        print(f"Included directories: {', '.join(args.include_dirs)}")
        print(f"Frankfurt COS: {args.bucket} ({args.region})")
        print(f"Object prefix: {args.object_prefix}/")
        print(f"Dry run: {args.dry_run}")
        print("Shanghai COS: untouched")

        client = create_client(args)
        local_files = collect_local_files(args.source_dir, args.include_dirs)
        print(f"Local scan complete: {len(local_files)} file(s)")
        remote_objects = list_remote_objects(client, args.bucket, args.object_prefix)
        print(f"Remote scan complete: {len(remote_objects)} file(s)")

        stats, failures = sync_files(client, args, local_files, remote_objects)
        print_summary(stats, failures, args.dry_run)
        return 2 if stats.failed else 0
    except (ValueError, RuntimeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("Interrupted by user.", file=sys.stderr)
        return 130
    except Exception as exc:
        print(f"ERROR: Frankfurt COS sync aborted: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


SCRIPT_PATH = Path(__file__).resolve().parents[1] / "sync_vlog_to_frankfurt_cos.py"
SPEC = importlib.util.spec_from_file_location("sync_vlog_to_frankfurt_cos", SCRIPT_PATH)
assert SPEC and SPEC.loader
sync_module = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = sync_module
SPEC.loader.exec_module(sync_module)


class FakeListClient:
    def __init__(self) -> None:
        self.requests: list[dict] = []

    def list_objects(self, **kwargs):
        self.requests.append(kwargs)
        if len(self.requests) == 1:
            return {
                "Contents": [
                    {
                        "Key": "resources/VlogSeason1/video/a.mp4",
                        "ETag": '"abc"',
                        "Size": "10",
                    }
                ],
                "IsTruncated": "true",
                "NextMarker": "next-page",
            }
        return {
            "Contents": [
                {
                    "Key": "resources/VlogSeason1/video/b.mp4",
                    "ETag": '"def-2"',
                    "Size": "20",
                }
            ],
            "IsTruncated": "false",
        }


class FakeUploadClient:
    def __init__(self, fail_attempts_by_key: dict[str, int]) -> None:
        self.remaining = dict(fail_attempts_by_key)
        self.calls: list[str] = []

    def upload_file(self, **kwargs):
        key = kwargs["Key"]
        self.calls.append(key)
        callback = kwargs.get("progress_callback")
        if callback:
            callback(5, 10)
            callback(10, 10)
        remaining = self.remaining.get(key, 0)
        if remaining:
            self.remaining[key] = remaining - 1
            raise RuntimeError(f"simulated failure for {key}")
        return {"ETag": "ok"}


def make_args(source_dir: Path, **overrides):
    values = {
        "source_dir": source_dir,
        "include_dirs": None,
        "scan_all": False,
        "bucket": sync_module.DEFAULT_BUCKET,
        "region": sync_module.DEFAULT_REGION,
        "domain": sync_module.DEFAULT_DOMAIN,
        "target_name": "Frankfurt",
        "object_prefix": sync_module.DEFAULT_PREFIX,
        "config": Path("/unused"),
        "retries": 2,
        "retry_delay": 0,
        "part_size_mb": 8,
        "max_threads": 2,
        "dedupe_etag": False,
        "dry_run": False,
    }
    values.update(overrides)
    return argparse.Namespace(**values)


class SyncVlogToFrankfurtTests(unittest.TestCase):
    def test_default_scan_is_limited_to_video_and_cover_directories(self):
        with tempfile.TemporaryDirectory() as directory:
            source_dir = Path(directory)
            video = source_dir / "learning_by_video_video" / "nested" / "video.m3u8"
            cover = source_dir / "learning_by_video_cover_letters" / "cover.png"
            unrelated = source_dir / "unrelated" / "ignore.txt"
            for path in (video, cover, unrelated):
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(path.name, encoding="utf-8")

            files = sync_module.collect_local_files(
                source_dir,
                list(sync_module.DEFAULT_INCLUDE_DIRS),
            )

            self.assertEqual(files, [cover, video])
            self.assertEqual(
                sync_module.object_key_for(video, source_dir, sync_module.DEFAULT_PREFIX),
                "resources/VlogSeason1/learning_by_video_video/nested/video.m3u8",
            )

    def test_loads_credentials_from_coscmd_config(self):
        with tempfile.TemporaryDirectory() as directory:
            config_path = Path(directory) / "cos.conf"
            config_path.write_text(
                "[common]\nsecret_id = test-id\nsecret_key = test-key\n",
                encoding="utf-8",
            )
            with mock.patch.dict(
                sync_module.os.environ,
                {
                    "COS_SECRET_ID": "",
                    "COS_SECRET_KEY": "",
                    "TENCENTCLOUD_SECRET_ID": "",
                    "TENCENTCLOUD_SECRET_KEY": "",
                    "COS_SESSION_TOKEN": "",
                    "TENCENTCLOUD_SESSION_TOKEN": "",
                },
            ):
                credentials = sync_module.load_credentials(config_path)

            self.assertEqual(credentials, ("test-id", "test-key", None))

    def test_list_remote_objects_is_paginated(self):
        client = FakeListClient()
        objects = sync_module.list_remote_objects(
            client,
            sync_module.DEFAULT_BUCKET,
            sync_module.DEFAULT_PREFIX,
        )

        self.assertEqual(len(objects), 2)
        self.assertEqual(objects["resources/VlogSeason1/video/a.mp4"].etag, "abc")
        self.assertEqual(client.requests[1]["Marker"], "next-page")

    def test_dry_run_skips_existing_key_and_duplicate_etag(self):
        with tempfile.TemporaryDirectory() as directory:
            source_dir = Path(directory)
            existing = source_dir / "existing.txt"
            duplicate = source_dir / "duplicate.txt"
            missing = source_dir / "missing.txt"
            existing.write_text("existing", encoding="utf-8")
            duplicate.write_text("duplicate", encoding="utf-8")
            missing.write_text("missing", encoding="utf-8")

            duplicate_md5 = hashlib.md5(duplicate.read_bytes(), usedforsecurity=False).hexdigest()
            remote = {
                f"{sync_module.DEFAULT_PREFIX}/existing.txt": sync_module.RemoteObject(
                    key=f"{sync_module.DEFAULT_PREFIX}/existing.txt",
                    etag="different",
                    size=1,
                ),
                f"{sync_module.DEFAULT_PREFIX}/other-name.txt": sync_module.RemoteObject(
                    key=f"{sync_module.DEFAULT_PREFIX}/other-name.txt",
                    etag=duplicate_md5,
                    size=duplicate.stat().st_size,
                ),
            }
            args = make_args(source_dir, dry_run=True, dedupe_etag=True)

            stats, failures = sync_module.sync_files(
                object(),
                args,
                sync_module.collect_local_files(source_dir),
                remote,
            )

            self.assertEqual(stats.total, 3)
            self.assertEqual(stats.uploaded, 1)
            self.assertEqual(stats.skipped_key, 1)
            self.assertEqual(stats.skipped_etag, 1)
            self.assertEqual(stats.failed, 0)
            self.assertEqual(failures, [])

    @mock.patch.object(sync_module.time, "sleep", return_value=None)
    def test_failures_retry_and_do_not_stop_later_files(self, _sleep):
        with tempfile.TemporaryDirectory() as directory:
            source_dir = Path(directory)
            first = source_dir / "first.txt"
            second = source_dir / "second.txt"
            first.write_text("first", encoding="utf-8")
            second.write_text("second", encoding="utf-8")
            first_key = f"{sync_module.DEFAULT_PREFIX}/first.txt"
            second_key = f"{sync_module.DEFAULT_PREFIX}/second.txt"
            client = FakeUploadClient({first_key: 2, second_key: 1})
            args = make_args(source_dir, retries=2)

            stats, failures = sync_module.sync_files(
                client,
                args,
                sync_module.collect_local_files(source_dir),
                {},
            )

            self.assertEqual(stats.uploaded, 1)
            self.assertEqual(stats.failed, 1)
            self.assertEqual(len(failures), 1)
            self.assertEqual(client.calls.count(first_key), 2)
            self.assertEqual(client.calls.count(second_key), 2)


if __name__ == "__main__":
    unittest.main()

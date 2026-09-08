from __future__ import annotations

from collections import defaultdict
from typing import Any

from django.core.management.base import BaseCommand, CommandParser
from django.db import transaction

from apps.learning_by_video.models import Subtitle, Video


def _join_subtitle_lines(lines: list[str]) -> str:
    cleaned = [str(line or "").strip() for line in lines if str(line or "").strip()]
    return "\n".join(cleaned)


def _resolve_target_videos(*, module_key: str, season_number: int) -> list[int]:
    if not module_key:
        return []
    return list(
        Video.objects.filter(
            season__module__key=module_key,
            season__season_number=season_number,
        ).values_list("id", flat=True)
    )


class Command(BaseCommand):
    help = (
        "Aggregate subtitle rows into Video.full_subtitle_de / Video.full_subtitle_zh. "
        "By default, only fills videos where both fields are empty."
    )

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("--video-id", type=int, action="append", default=[])
        parser.add_argument("--module-key", default="learning_by_video")
        parser.add_argument("--season-number", type=int, default=1)
        parser.add_argument(
            "--only-missing",
            action="store_true",
            default=True,
            help="Only fill videos where both subtitle aggregate fields are empty (default).",
        )
        parser.add_argument(
            "--all",
            action="store_true",
            help="Rebuild subtitle aggregate fields for all selected videos.",
        )

    def handle(self, *args: Any, **options: Any) -> None:
        video_ids = list(options.get("video_id") or [])
        module_key = str(options.get("module_key") or "learning_by_video")
        season_number = int(options.get("season_number") or 1)
        only_missing = bool(options.get("only_missing", True))
        if options.get("all"):
            only_missing = False

        qs = Video.objects.all().order_by("id")
        if video_ids:
            qs = qs.filter(id__in=video_ids)
        else:
            target_ids = _resolve_target_videos(module_key=module_key, season_number=season_number)
            qs = qs.filter(id__in=target_ids)

        if only_missing:
            qs = qs.filter(full_subtitle_de="", full_subtitle_zh="")

        videos = list(qs.only("id", "full_subtitle_de", "full_subtitle_zh"))
        if not videos:
            self.stdout.write(self.style.WARNING("No videos matched the requested scope."))
            return

        subtitle_map_de: dict[int, list[str]] = defaultdict(list)
        subtitle_map_zh: dict[int, list[str]] = defaultdict(list)

        subtitles = (
            Subtitle.objects.filter(video_id__in=[v.id for v in videos])
            .order_by("video_id", "start", "id")
            .values_list("video_id", "content", "translation")
        )
        for video_id, content, translation in subtitles:
            subtitle_map_de[int(video_id)].append(str(content or "").strip())
            subtitle_map_zh[int(video_id)].append(str(translation or "").strip())

        updated = 0
        empty_subtitles = 0
        failed_updates: list[str] = []

        for video in videos:
            try:
                with transaction.atomic():
                    de_joined = _join_subtitle_lines(subtitle_map_de.get(video.id, []))
                    zh_joined = _join_subtitle_lines(subtitle_map_zh.get(video.id, []))

                    if not de_joined and not zh_joined:
                        empty_subtitles += 1
                        continue

                    changed_fields: list[str] = []
                    if video.full_subtitle_de != de_joined:
                        video.full_subtitle_de = de_joined
                        changed_fields.append("full_subtitle_de")
                    if video.full_subtitle_zh != zh_joined:
                        video.full_subtitle_zh = zh_joined
                        changed_fields.append("full_subtitle_zh")

                    if changed_fields:
                        video.save(update_fields=changed_fields)
                        updated += 1
            except Exception as exc:
                failed_updates.append(f"id={video.id} | {exc}")
                self.stderr.write(
                    self.style.ERROR(
                        f"FAILED SUBTITLE BACKFILL: id={video.id} rolled back and skipped. error={exc}"
                    )
                )
                continue

        self.stdout.write(
            self.style.SUCCESS(
                f"OK: processed={len(videos)}, updated={updated}, skipped_no_subtitles={empty_subtitles}, failed={len(failed_updates)}"
            )
        )
        for item in failed_updates:
            self.stderr.write(self.style.ERROR(item))

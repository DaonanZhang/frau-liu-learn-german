from __future__ import annotations

from django.db.models import QuerySet
from django.shortcuts import get_object_or_404
from rest_framework.filters import OrderingFilter
from rest_framework.permissions import IsAuthenticated
from rest_framework.viewsets import ReadOnlyModelViewSet

from apps.learning_by_video.models import (
    Video,
    VideoExpressionOccurrence,
    VideoSentenceOccurrence,
    VideoWordOccurrence,
)
from apps.learning_by_video.serializers import (
    VideoExpressionOccurrenceSerializer,
    VideoSentenceOccurrenceSerializer,
    VideoWordOccurrenceSerializer,
)
from apps.learning_by_video.access import filter_occurrences_by_entitlement, ensure_video_access
from apps.accounts.permissions.entitlement import HasValidEntitlement
from django.db import models
from django.db.models import OuterRef, Subquery, Value, Exists, Case, When
from django.db.models.functions import Coalesce

from apps.lexicon.models import (
    OccurrenceKnowledgeState,
    TextKnowledgeState,
    UserWordMark,
    UserSentenceMark,
    UserExpressionMark,
    UserWordOccurrenceMark,
    UserSentenceOccurrenceMark,
    UserExpressionOccurrenceMark,
)


class OccurrenceFilterMixin:
    """
    Supports:
    - ?video=<id>
    - ?subtitle=<id>
    - ?t_from=<float>&t_to=<float>
    - OR: ?t=<float>&window=<float>  (preferred for player; symmetric window)
    """

    def _parse_float(self, v: str | None) -> float | None:
        if v is None or v == "":
            return None
        return float(v)

    def filter_queryset_by_params(self, qs: QuerySet) -> QuerySet:
        p = self.request.query_params

        video = p.get("video")
        if video:
            qs = qs.filter(video_id=video)

        subtitle = p.get("subtitle")
        if subtitle:
            qs = qs.filter(subtitle_id=subtitle)

        # New: t + window
        t = self._parse_float(p.get("t"))
        window = self._parse_float(p.get("window"))
        if t is not None and window is not None:
            t_from = t - window
            t_to = t + window
            qs = qs.filter(time_start__gte=t_from, time_start__lte=t_to)
            return qs

        # fallback: explicit range
        t_from = self._parse_float(p.get("t_from"))
        t_to = self._parse_float(p.get("t_to"))
        if t_from is not None:
            qs = qs.filter(time_start__gte=t_from)
        if t_to is not None:
            qs = qs.filter(time_start__lte=t_to)

        return qs

    def annotate_user_mark_info(
        self,
        qs: QuerySet,
        *,
        occurrence_mark_model: type[models.Model],
        text_mark_model: type[models.Model],
        text_fk_field: str,
    ) -> QuerySet:
        """
        Annotate queryset with:
        - my_knowledge: KNOWN/UNKNOWN/UNMARKED (UNMARKED when no occurrence mark exists)
        - marked_elsewhere: True when my_knowledge == UNMARKED but the text is globally marked
          (UserXMark.global_state != UNMARKED)

        Args:
            qs:
                Occurrence queryset.
            occurrence_mark_model:
                UserWordOccurrenceMark / UserSentenceOccurrenceMark / UserExpressionOccurrenceMark
            text_mark_model:
                UserWordMark / UserSentenceMark / UserExpressionMark
            text_fk_field:
                Field name on occurrence pointing to the text id ("word_id", "sentence_id", "expression_id").
        """
        user = getattr(self.request, "user", None)
        if not user or not getattr(user, "is_authenticated", False):
            return qs.annotate(
                my_knowledge=Value(OccurrenceKnowledgeState.UNMARKED),
                marked_elsewhere=Value(False),
            )

        # ---- occurrence-level mark (for my_knowledge) ----
        occurrence_knowledge_subquery = occurrence_mark_model.objects.filter(
            user=user,
            occurrence_id=OuterRef("pk"),
        ).values("knowledge")[:1]

        # Fast boolean: does this occurrence have any mark row for user?
        has_occurrence_mark = Exists(
            occurrence_mark_model.objects.filter(
                user=user,
                occurrence_id=OuterRef("pk"),
            )
        )

        # ---- text-level global mark (for elsewhere) ----
        # Example for word: UserWordMark where word_id == OuterRef("word_id") and global_state != UNMARKED
        globally_marked_text = Exists(
            text_mark_model.objects.filter(
                user=user,
                **{text_fk_field: OuterRef(text_fk_field)},
            ).exclude(
                global_state=TextKnowledgeState.UNMARKED
            )
        )

        return qs.annotate(
            my_knowledge=Coalesce(
                Subquery(occurrence_knowledge_subquery),
                Value(OccurrenceKnowledgeState.UNMARKED),
            ),
            marked_elsewhere=Case(
                When(
                    condition=globally_marked_text & ~has_occurrence_mark,
                    then=Value(True),
                ),
                default=Value(False),
                output_field=models.BooleanField(),
            ),
        )

class VideoWordOccurrenceViewSet(OccurrenceFilterMixin, ReadOnlyModelViewSet):
    serializer_class = VideoWordOccurrenceSerializer
    filter_backends = [OrderingFilter]
    ordering_fields = ["time_start"]
    ordering = ["time_start"]
    permission_classes = [IsAuthenticated]
    required_module_key = "learning_by_video"

    def get_queryset(self):
        qs = VideoWordOccurrence.objects.select_related("video", "subtitle", "word").all()
        video_id = self.request.query_params.get("video")
        if video_id:
            video = get_object_or_404(
                Video.objects.prefetch_related("access_seasons"),
                pk=video_id,
            )
            ensure_video_access(
                user=self.request.user,
                video=video,
                module_key=self.required_module_key,
            )
            qs = qs.filter(video_id=video.pk)
        else:
            qs = filter_occurrences_by_entitlement(
                qs,
                user=self.request.user,
                module_key=self.required_module_key,
            )
        qs = self.filter_queryset_by_params(qs)
        qs = self.annotate_user_mark_info(
            qs,
            occurrence_mark_model=UserWordOccurrenceMark,
            text_mark_model=UserWordMark,
            text_fk_field="word_id",
        )
        return qs


class VideoSentenceOccurrenceViewSet(OccurrenceFilterMixin, ReadOnlyModelViewSet):
    serializer_class = VideoSentenceOccurrenceSerializer
    filter_backends = [OrderingFilter]
    ordering_fields = ["time_start"]
    ordering = ["time_start"]
    required_module_key = "learning_by_video"

    def get_permissions(self):
        return [
            IsAuthenticated(),
            HasValidEntitlement(module_key=self.required_module_key),
        ]

    def get_queryset(self):
        qs = VideoSentenceOccurrence.objects.select_related("video", "subtitle", "sentence").all()
        qs = filter_occurrences_by_entitlement(
            qs,
            user=self.request.user,
            module_key=self.required_module_key,
        )
        qs = self.filter_queryset_by_params(qs)
        qs = self.annotate_user_mark_info(
            qs,
            occurrence_mark_model=UserSentenceOccurrenceMark,
            text_mark_model=UserSentenceMark,
            text_fk_field="sentence_id",
        )
        return qs



class VideoExpressionOccurrenceViewSet(OccurrenceFilterMixin, ReadOnlyModelViewSet):
    serializer_class = VideoExpressionOccurrenceSerializer
    filter_backends = [OrderingFilter]
    ordering_fields = ["time_start"]
    ordering = ["time_start"]
    permission_classes = [IsAuthenticated]
    required_module_key = "learning_by_video"

    def get_queryset(self):
        qs = VideoExpressionOccurrence.objects.select_related("video", "subtitle", "expression").all()
        video_id = self.request.query_params.get("video")
        if video_id:
            video = get_object_or_404(
                Video.objects.prefetch_related("access_seasons"),
                pk=video_id,
            )
            ensure_video_access(
                user=self.request.user,
                video=video,
                module_key=self.required_module_key,
            )
            qs = qs.filter(video_id=video.pk)
        else:
            qs = filter_occurrences_by_entitlement(
                qs,
                user=self.request.user,
                module_key=self.required_module_key,
            )
        qs = self.filter_queryset_by_params(qs)
        qs = self.annotate_user_mark_info(
            qs,
            occurrence_mark_model=UserExpressionOccurrenceMark,
            text_mark_model=UserExpressionMark,
            text_fk_field="expression_id",
        )
        return qs

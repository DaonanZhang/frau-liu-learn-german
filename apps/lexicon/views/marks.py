from __future__ import annotations

from typing import Any

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from apps.learning_by_video.models import (
    VideoExpressionOccurrence,
    VideoSentenceOccurrence,
    VideoWordOccurrence,
)
from apps.lexicon.models import OccurrenceKnowledgeState, TextKnowledgeState, UserExpressionMark, UserSentenceMark, UserWordMark
from apps.lexicon.serializers import (
    ToggleOccurrenceMarkSerializer,
    toggle_expression_occurrence_mark,
    toggle_sentence_occurrence_mark,
    toggle_word_occurrence_mark,
)

MODULE_NAME_LEARNING_BY_VIDEO: str = "learning_by_video"


def _parse_int_query_param(request: Request, name: str) -> int:
    """
    Parse required integer query param.

    Args:
        request: DRF request.
        name: Param name.

    Returns:
        Integer value.

    Raises:
        ValueError: If missing or invalid.
    """
    raw_value = request.query_params.get(name)
    if not raw_value:
        raise ValueError(f"Missing required query param: {name}")

    try:
        return int(raw_value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Invalid {name}. Must be an integer.") from exc


class UserWordMarkViewSet(viewsets.ViewSet):
    """
    Word mark endpoints for occurrence-level toggles and scope queries.
    """

    permission_classes = [IsAuthenticated]

    @action(detail=False, methods=["post"], url_path="toggle-occurrence")
    def toggle_occurrence(self, request: Request) -> Response:
        """
        Toggle a word occurrence mark.

        Body:
            entity_id: WordText id
            occurrence_id: VideoWordOccurrence id
            knowledge: KNOWN/UNKNOWN/UNMARKED

        Returns:
            occurrence_state, global_state
        """
        serializer = ToggleOccurrenceMarkSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        entity_id = int(serializer.validated_data["entity_id"])
        occurrence_id = int(serializer.validated_data["occurrence_id"])
        next_knowledge = str(serializer.validated_data["knowledge"])

        result = toggle_word_occurrence_mark(
            user=request.user,
            word_id=entity_id,
            occurrence_id=occurrence_id,
            next_knowledge=next_knowledge,
        )
        return Response(result, status=status.HTTP_200_OK)

    @action(detail=False, methods=["get"], url_path="video-scope")
    def video_scope(self, request: Request) -> Response:
        """
        Return occurrence ids for a specific video scope.

        Query params:
            video_id: Video id.

        Returns:
            - known_cards_in_scope: occurrence ids
            - unknown_cards_in_scope: occurrence ids
            - same_text_marked_elsewhere: occurrence ids
        """
        try:
            video_id = _parse_int_query_param(request, "video_id")
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        occurrences = list(
            VideoWordOccurrence.objects.filter(video_id=video_id).values_list("id", "word_id")
        )

        occurrence_ids = [pair[0] for pair in occurrences]
        word_ids = [pair[1] for pair in occurrences if pair[1] is not None]

        if not occurrence_ids:
            return Response(
                {
                    "video_id": video_id,
                    "known_cards_in_scope": [],
                    "unknown_cards_in_scope": [],
                    "same_text_marked_elsewhere": [],
                },
                status=status.HTTP_200_OK,
            )

        known_cards = set(
            request.user.word_occurrence_marks.filter(
                occurrence_id__in=occurrence_ids,
                knowledge=OccurrenceKnowledgeState.KNOWN,
            ).values_list("occurrence_id", flat=True)
        )

        unknown_cards = set(
            request.user.word_occurrence_marks.filter(
                occurrence_id__in=occurrence_ids,
                knowledge=OccurrenceKnowledgeState.UNKNOWN,
            ).values_list("occurrence_id", flat=True)
        )

        marked_cards = known_cards | unknown_cards

        # words that are globally marked (global_state != UNMARKED)
        globally_marked_word_ids = set(
            UserWordMark.objects.filter(
                user=request.user,
                word_id__in=word_ids,
            ).exclude(
                global_state=TextKnowledgeState.UNMARKED
            ).values_list("word_id", flat=True)
        )

        same_text_marked_elsewhere: set[int] = set()
        for occ_id, word_id in occurrences:
            if word_id is None:
                continue

            if word_id in globally_marked_word_ids and occ_id not in marked_cards:
                same_text_marked_elsewhere.add(int(occ_id))

        return Response(
            {
                "video_id": video_id,
                "known_cards_in_scope": sorted(known_cards),
                "unknown_cards_in_scope": sorted(unknown_cards),
                "same_text_marked_elsewhere": sorted(same_text_marked_elsewhere),
            },
            status=status.HTTP_200_OK,
        )


class UserExpressionMarkViewSet(viewsets.ViewSet):
    """
    Expression mark endpoints for occurrence-level toggles and scope queries.
    """

    permission_classes = [IsAuthenticated]

    @action(detail=False, methods=["post"], url_path="toggle-occurrence")
    def toggle_occurrence(self, request: Request) -> Response:
        """
        Toggle an expression occurrence mark.
        """
        serializer = ToggleOccurrenceMarkSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        entity_id = int(serializer.validated_data["entity_id"])
        occurrence_id = int(serializer.validated_data["occurrence_id"])
        next_knowledge = str(serializer.validated_data["knowledge"])

        result = toggle_expression_occurrence_mark(
            user=request.user,
            expression_id=entity_id,
            occurrence_id=occurrence_id,
            next_knowledge=next_knowledge,
        )
        return Response(result, status=status.HTTP_200_OK)

    @action(detail=False, methods=["get"], url_path="video-scope")
    def video_scope(self, request: Request) -> Response:
        """
        Return expression occurrence ids for a video scope.
        """
        try:
            video_id = _parse_int_query_param(request, "video_id")
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        occurrences = list(
            VideoExpressionOccurrence.objects.filter(video_id=video_id).values_list("id", "expression_id")
        )

        occurrence_ids = [pair[0] for pair in occurrences]
        expression_ids = [pair[1] for pair in occurrences if pair[1] is not None]

        if not occurrence_ids:
            return Response(
                {
                    "video_id": video_id,
                    "known_cards_in_scope": [],
                    "unknown_cards_in_scope": [],
                    "same_text_marked_elsewhere": [],
                },
                status=status.HTTP_200_OK,
            )

        known_cards = set(
            request.user.expression_occurrence_marks.filter(
                occurrence_id__in=occurrence_ids,
                knowledge=OccurrenceKnowledgeState.KNOWN,
            ).values_list("occurrence_id", flat=True)
        )

        unknown_cards = set(
            request.user.expression_occurrence_marks.filter(
                occurrence_id__in=occurrence_ids,
                knowledge=OccurrenceKnowledgeState.UNKNOWN,
            ).values_list("occurrence_id", flat=True)
        )

        marked_cards = known_cards | unknown_cards

        globally_marked_expression_ids = set(
            UserExpressionMark.objects.filter(
                user=request.user,
                expression_id__in=expression_ids,
            ).exclude(
                global_state=TextKnowledgeState.UNMARKED
            ).values_list("expression_id", flat=True)
        )

        same_text_marked_elsewhere: set[int] = set()
        for occ_id, expr_id in occurrences:
            if expr_id is None:
                continue

            if expr_id in globally_marked_expression_ids and occ_id not in marked_cards:
                same_text_marked_elsewhere.add(int(occ_id))

        return Response(
            {
                "video_id": video_id,
                "known_cards_in_scope": sorted(known_cards),
                "unknown_cards_in_scope": sorted(unknown_cards),
                "same_text_marked_elsewhere": sorted(same_text_marked_elsewhere),
            },
            status=status.HTTP_200_OK,
        )


class UserSentenceMarkViewSet(viewsets.ViewSet):
    """
    Sentence mark endpoints for occurrence-level toggles and scope queries.
    """

    permission_classes = [IsAuthenticated]

    @action(detail=False, methods=["post"], url_path="toggle-occurrence")
    def toggle_occurrence(self, request: Request) -> Response:
        """
        Toggle a sentence occurrence mark.
        """
        serializer = ToggleOccurrenceMarkSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        entity_id = int(serializer.validated_data["entity_id"])
        occurrence_id = int(serializer.validated_data["occurrence_id"])
        next_knowledge = str(serializer.validated_data["knowledge"])

        result = toggle_sentence_occurrence_mark(
            user=request.user,
            sentence_id=entity_id,
            occurrence_id=occurrence_id,
            next_knowledge=next_knowledge,
        )
        return Response(result, status=status.HTTP_200_OK)

    @action(detail=False, methods=["get"], url_path="video-scope")
    def video_scope(self, request: Request) -> Response:
        """
        Return sentence occurrence ids for a video scope.
        """
        try:
            video_id = _parse_int_query_param(request, "video_id")
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        occurrences = list(
            VideoSentenceOccurrence.objects.filter(video_id=video_id).values_list("id", "sentence_id")
        )

        occurrence_ids = [pair[0] for pair in occurrences]
        sentence_ids = [pair[1] for pair in occurrences if pair[1] is not None]

        if not occurrence_ids:
            return Response(
                {
                    "video_id": video_id,
                    "known_cards_in_scope": [],
                    "unknown_cards_in_scope": [],
                    "same_text_marked_elsewhere": [],
                },
                status=status.HTTP_200_OK,
            )

        known_cards = set(
            request.user.sentence_occurrence_marks.filter(
                occurrence_id__in=occurrence_ids,
                knowledge=OccurrenceKnowledgeState.KNOWN,
            ).values_list("occurrence_id", flat=True)
        )

        unknown_cards = set(
            request.user.sentence_occurrence_marks.filter(
                occurrence_id__in=occurrence_ids,
                knowledge=OccurrenceKnowledgeState.UNKNOWN,
            ).values_list("occurrence_id", flat=True)
        )

        marked_cards = known_cards | unknown_cards

        globally_marked_sentence_ids = set(
            UserSentenceMark.objects.filter(
                user=request.user,
                sentence_id__in=sentence_ids,
            ).exclude(
                global_state=TextKnowledgeState.UNMARKED
            ).values_list("sentence_id", flat=True)
        )

        same_text_marked_elsewhere: set[int] = set()
        for occ_id, sentence_id in occurrences:
            if sentence_id is None:
                continue

            if sentence_id in globally_marked_sentence_ids and occ_id not in marked_cards:
                same_text_marked_elsewhere.add(int(occ_id))

        return Response(
            {
                "video_id": video_id,
                "known_cards_in_scope": sorted(known_cards),
                "unknown_cards_in_scope": sorted(unknown_cards),
                "same_text_marked_elsewhere": sorted(same_text_marked_elsewhere),
            },
            status=status.HTTP_200_OK,
        )

from __future__ import annotations

from typing import Any

from django.db import transaction
from rest_framework import serializers

from apps.lexicon.models import (
    OccurrenceKnowledgeState,
    TextKnowledgeState,
    UserExpressionMark,
    UserExpressionOccurrenceMark,
    UserSentenceMark,
    UserSentenceOccurrenceMark,
    UserWordMark,
    UserWordOccurrenceMark,
)


class ToggleOccurrenceMarkSerializer(serializers.Serializer):
    """
    Toggle a single occurrence card's knowledge state.

    Input:
        - entity_id: WordText/SentenceText/ExpressionText id
        - occurrence_id: VideoXOccurrence.id
        - knowledge: KNOWN | UNKNOWN | UNMARKED

    Output:
        - occurrence_state: KNOWN | UNKNOWN | UNMARKED
        - global_state: UNMARKED | KNOWN | UNKNOWN | MIXED
    """

    entity_id = serializers.IntegerField(min_value=1)
    occurrence_id = serializers.IntegerField(min_value=1)
    knowledge = serializers.ChoiceField(choices=OccurrenceKnowledgeState.choices)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        """
        Validate payload.

        Args:
            attrs: Incoming attrs.

        Returns:
            Validated attrs.
        """
        return attrs


class ToggleResultSerializer(serializers.Serializer):
    """
    Response payload after toggling.

    Fields:
        occurrence_state: KNOWN/UNKNOWN/UNMARKED for the occurrence.
        global_state: Aggregated global state for the text.
    """

    occurrence_state = serializers.ChoiceField(choices=OccurrenceKnowledgeState.choices)
    global_state = serializers.ChoiceField(choices=TextKnowledgeState.choices)


@transaction.atomic
def toggle_word_occurrence_mark(
    *,
    user: Any,
    word_id: int,
    occurrence_id: int,
    next_knowledge: str,
) -> dict[str, str]:
    """
    Toggle a VideoWordOccurrence mark.

    Behavior:
        - If next_knowledge == UNMARKED: delete row if exists.
        - If next_knowledge == KNOWN/UNKNOWN:
            - if existing row has same knowledge: delete (toggle to UNMARKED)
            - else: upsert with new knowledge

    Args:
        user: Auth user.
        word_id: WordText id.
        occurrence_id: VideoWordOccurrence id.
        next_knowledge: OccurrenceKnowledgeState.

    Returns:
        Dict with occurrence_state and global_state.
    """
    user_word_mark, _created = UserWordMark.objects.get_or_create(
        user=user,
        word_id=word_id,
    )

    existing = UserWordOccurrenceMark.objects.filter(
        user=user,
        occurrence_id=occurrence_id,
    ).select_for_update().first()

    if next_knowledge == OccurrenceKnowledgeState.UNMARKED:
        if existing is not None:
            existing.delete()
        occurrence_state = OccurrenceKnowledgeState.UNMARKED
    else:
        if existing is not None and existing.knowledge == next_knowledge:
            existing.delete()
            occurrence_state = OccurrenceKnowledgeState.UNMARKED
        else:
            UserWordOccurrenceMark.objects.update_or_create(
                user=user,
                occurrence_id=occurrence_id,
                defaults={
                    "user_word_mark": user_word_mark,
                    "knowledge": next_knowledge,
                },
            )
            occurrence_state = next_knowledge

    user_word_mark.recompute_global_state()
    user_word_mark.save(update_fields=["global_state", "updated_at"])

    return {
        "occurrence_state": occurrence_state,
        "global_state": user_word_mark.global_state,
    }


@transaction.atomic
def toggle_expression_occurrence_mark(
    *,
    user: Any,
    expression_id: int,
    occurrence_id: int,
    next_knowledge: str,
) -> dict[str, str]:
    """
    Toggle a VideoExpressionOccurrence mark.

    Args:
        user: Auth user.
        expression_id: ExpressionText id.
        occurrence_id: VideoExpressionOccurrence id.
        next_knowledge: OccurrenceKnowledgeState.

    Returns:
        Dict with occurrence_state and global_state.
    """
    user_expression_mark, _created = UserExpressionMark.objects.get_or_create(
        user=user,
        expression_id=expression_id,
    )

    existing = UserExpressionOccurrenceMark.objects.filter(
        user=user,
        occurrence_id=occurrence_id,
    ).select_for_update().first()

    if next_knowledge == OccurrenceKnowledgeState.UNMARKED:
        if existing is not None:
            existing.delete()
        occurrence_state = OccurrenceKnowledgeState.UNMARKED
    else:
        if existing is not None and existing.knowledge == next_knowledge:
            existing.delete()
            occurrence_state = OccurrenceKnowledgeState.UNMARKED
        else:
            UserExpressionOccurrenceMark.objects.update_or_create(
                user=user,
                occurrence_id=occurrence_id,
                defaults={
                    "user_expression_mark": user_expression_mark,
                    "knowledge": next_knowledge,
                },
            )
            occurrence_state = next_knowledge

    user_expression_mark.recompute_global_state()
    user_expression_mark.save(update_fields=["global_state", "updated_at"])

    return {
        "occurrence_state": occurrence_state,
        "global_state": user_expression_mark.global_state,
    }


@transaction.atomic
def toggle_sentence_occurrence_mark(
    *,
    user: Any,
    sentence_id: int,
    occurrence_id: int,
    next_knowledge: str,
) -> dict[str, str]:
    """
    Toggle a VideoSentenceOccurrence mark.

    Args:
        user: Auth user.
        sentence_id: SentenceText id.
        occurrence_id: VideoSentenceOccurrence id.
        next_knowledge: OccurrenceKnowledgeState.

    Returns:
        Dict with occurrence_state and global_state.
    """
    user_sentence_mark, _created = UserSentenceMark.objects.get_or_create(
        user=user,
        sentence_id=sentence_id,
    )

    existing = UserSentenceOccurrenceMark.objects.filter(
        user=user,
        occurrence_id=occurrence_id,
    ).select_for_update().first()

    if next_knowledge == OccurrenceKnowledgeState.UNMARKED:
        if existing is not None:
            existing.delete()
        occurrence_state = OccurrenceKnowledgeState.UNMARKED
    else:
        if existing is not None and existing.knowledge == next_knowledge:
            existing.delete()
            occurrence_state = OccurrenceKnowledgeState.UNMARKED
        else:
            UserSentenceOccurrenceMark.objects.update_or_create(
                user=user,
                occurrence_id=occurrence_id,
                defaults={
                    "user_sentence_mark": user_sentence_mark,
                    "knowledge": next_knowledge,
                },
            )
            occurrence_state = next_knowledge

    user_sentence_mark.recompute_global_state()
    user_sentence_mark.save(update_fields=["global_state", "updated_at"])

    return {
        "occurrence_state": occurrence_state,
        "global_state": user_sentence_mark.global_state,
    }

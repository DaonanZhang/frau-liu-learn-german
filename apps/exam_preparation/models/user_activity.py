from __future__ import annotations

from django.conf import settings
from django.db import models


class BaseUserExerciseState(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        verbose_name="user",
    )
    is_favorited = models.BooleanField(default=False, db_index=True, verbose_name="is favorited")
    answer_payload = models.JSONField(default=dict, blank=True, verbose_name="answer payload")
    is_correct = models.BooleanField(null=True, blank=True, db_index=True, verbose_name="is correct")
    last_answered_at = models.DateTimeField(null=True, blank=True, verbose_name="last answered at")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="created at")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="updated at")

    class Meta:
        abstract = True


class UserExerciseFavorite(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="exam_preparation_favorites",
        verbose_name="user",
    )
    exercise = models.ForeignKey(
        "exam_preparation.ExerciseBase",
        on_delete=models.CASCADE,
        related_name="user_favorites",
        verbose_name="exercise",
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="created at")

    class Meta:
        verbose_name = "user exercise favorite"
        verbose_name_plural = "user exercise favorites"
        ordering = ["-created_at", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "exercise"],
                name="exam_prep_user_exercise_fav_uq",
            )
        ]

    def __str__(self) -> str:
        return f"UserExerciseFavorite<user={self.user_id} exercise={self.exercise_id}>"


class UserListeningQuestionState(BaseUserExerciseState):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="exam_preparation_listening_question_states",
        verbose_name="user",
    )
    question = models.ForeignKey(
        "exam_preparation.ListeningQuestion",
        on_delete=models.CASCADE,
        related_name="user_states",
        verbose_name="question",
    )

    class Meta:
        verbose_name = "user listening question state"
        verbose_name_plural = "user listening question states"
        ordering = ["-updated_at", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "question"],
                name="exam_prep_user_listen_q_state_uq",
            )
        ]


class UserReadingUnderstandingQuestionState(BaseUserExerciseState):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="exam_preparation_reading_understanding_question_states",
        verbose_name="user",
    )
    question = models.ForeignKey(
        "exam_preparation.ReadingUnderstandingQuestion",
        on_delete=models.CASCADE,
        related_name="user_states",
        verbose_name="question",
    )

    class Meta:
        verbose_name = "user reading understanding question state"
        verbose_name_plural = "user reading understanding question states"
        ordering = ["-updated_at", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "question"],
                name="exam_prep_user_ru_q_state_uq",
            )
        ]


class UserReadingTitleMatchingItemState(BaseUserExerciseState):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="exam_preparation_reading_title_matching_item_states",
        verbose_name="user",
    )
    item = models.ForeignKey(
        "exam_preparation.ReadingTitleMatchingItem",
        on_delete=models.CASCADE,
        related_name="user_states",
        verbose_name="item",
    )

    class Meta:
        verbose_name = "user reading title matching item state"
        verbose_name_plural = "user reading title matching item states"
        ordering = ["-updated_at", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "item"],
                name="exam_prep_user_rtm_item_state_uq",
            )
        ]


class UserReadingAdMatchingItemState(BaseUserExerciseState):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="exam_preparation_reading_ad_matching_item_states",
        verbose_name="user",
    )
    item = models.ForeignKey(
        "exam_preparation.ReadingAdMatchingItem",
        on_delete=models.CASCADE,
        related_name="user_states",
        verbose_name="item",
    )

    class Meta:
        verbose_name = "user reading ad matching item state"
        verbose_name_plural = "user reading ad matching item states"
        ordering = ["-updated_at", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "item"],
                name="exam_prep_user_ram_item_state_uq",
            )
        ]


class UserClozeChoiceBlankState(BaseUserExerciseState):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="exam_preparation_cloze_choice_blank_states",
        verbose_name="user",
    )
    blank = models.ForeignKey(
        "exam_preparation.ClozeChoiceBlank",
        on_delete=models.CASCADE,
        related_name="user_states",
        verbose_name="blank",
    )

    class Meta:
        verbose_name = "user cloze choice blank state"
        verbose_name_plural = "user cloze choice blank states"
        ordering = ["-updated_at", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "blank"],
                name="exam_prep_user_cc_blank_state_uq",
            )
        ]


class UserClozeMatchingBlankState(BaseUserExerciseState):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="exam_preparation_cloze_matching_blank_states",
        verbose_name="user",
    )
    blank = models.ForeignKey(
        "exam_preparation.ClozeMatchingBlankAnswer",
        on_delete=models.CASCADE,
        related_name="user_states",
        verbose_name="blank",
    )

    class Meta:
        verbose_name = "user cloze matching blank state"
        verbose_name_plural = "user cloze matching blank states"
        ordering = ["-updated_at", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "blank"],
                name="exam_prep_user_cm_blank_state_uq",
            )
        ]


class UserWritingExerciseState(BaseUserExerciseState):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="exam_preparation_writing_exercise_states",
        verbose_name="user",
    )
    exercise = models.ForeignKey(
        "exam_preparation.WritingExercise",
        on_delete=models.CASCADE,
        related_name="user_states",
        verbose_name="exercise",
    )
    time_spent_seconds = models.PositiveIntegerField(
        null=True,
        blank=True,
        verbose_name="time spent seconds",
    )

    class Meta:
        verbose_name = "user writing exercise state"
        verbose_name_plural = "user writing exercise states"
        ordering = ["-updated_at", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "exercise"],
                name="exam_prep_user_write_ex_state_uq",
            )
        ]


class UserWritingExampleTextState(BaseUserExerciseState):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="exam_preparation_writing_example_text_states",
        verbose_name="user",
    )
    example_text = models.ForeignKey(
        "exam_preparation.WritingExampleText",
        on_delete=models.CASCADE,
        related_name="user_states",
        verbose_name="writing example text",
    )

    class Meta:
        verbose_name = "user writing example text state"
        verbose_name_plural = "user writing example text states"
        ordering = ["-updated_at", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "example_text"],
                name="exam_prep_user_write_example_state_uq",
            )
        ]

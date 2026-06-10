from __future__ import annotations

from django.db import models


class SpeakingGapMatchingExercise(models.Model):
    exercise_base = models.OneToOneField(
        "exam_preparation.ExerciseBase",
        on_delete=models.CASCADE,
        related_name="speaking_gap_matching_exercise",
        verbose_name="exercise base",
    )
    content_with_placeholders = models.TextField(verbose_name="content with placeholders")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="created at")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="updated at")

    class Meta:
        verbose_name = "speaking gap matching exercise"
        verbose_name_plural = "speaking gap matching exercises"


class SpeakingGapOption(models.Model):
    exercise = models.ForeignKey(
        "exam_preparation.SpeakingGapMatchingExercise",
        on_delete=models.CASCADE,
        related_name="options",
        verbose_name="exercise",
    )
    option_key = models.CharField(max_length=16, verbose_name="option key")
    option_text = models.TextField(verbose_name="option text")
    option_order = models.PositiveIntegerField(default=0, verbose_name="option order")
    is_extra = models.BooleanField(default=False, db_index=True, verbose_name="is extra")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="created at")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="updated at")

    class Meta:
        verbose_name = "speaking gap option"
        verbose_name_plural = "speaking gap options"
        ordering = ["exercise_id", "option_order", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["exercise", "option_key"],
                name="exam_prep_sg_opt_key_uq",
            )
        ]

    def __str__(self) -> str:
        return f"SpeakingGapOption<exercise={self.exercise_id} key={self.option_key}>"


class SpeakingGapBlank(models.Model):
    exercise = models.ForeignKey(
        "exam_preparation.SpeakingGapMatchingExercise",
        on_delete=models.CASCADE,
        related_name="blanks",
        verbose_name="exercise",
    )
    blank_key = models.CharField(max_length=64, verbose_name="blank key")
    blank_number = models.PositiveIntegerField(verbose_name="blank number")
    correct_option = models.ForeignKey(
        "exam_preparation.SpeakingGapOption",
        on_delete=models.PROTECT,
        related_name="blanks",
        verbose_name="correct option",
    )
    explanation = models.TextField(blank=True, default="", verbose_name="explanation")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="created at")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="updated at")

    class Meta:
        verbose_name = "speaking gap blank"
        verbose_name_plural = "speaking gap blanks"
        ordering = ["exercise_id", "blank_number", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["exercise", "blank_key"],
                name="exam_prep_sg_blank_key_uq",
            ),
            models.UniqueConstraint(
                fields=["exercise", "blank_number"],
                name="exam_prep_sg_blank_num_uq",
            ),
        ]

    def __str__(self) -> str:
        return f"SpeakingGapBlank<exercise={self.exercise_id} key={self.blank_key}>"


from __future__ import annotations

from django.db import models


class SpeakingTeilExercise(models.Model):
    """The three real telc B1 speaking tasks share metadata but have different payloads."""

    exercise_base = models.OneToOneField(
        "exam_preparation.ExerciseBase",
        on_delete=models.CASCADE,
        related_name="speaking_teil_exercise",
        verbose_name="exercise base",
    )
    instruction = models.TextField(blank=True, default="", verbose_name="instruction")
    content = models.JSONField(default=dict, verbose_name="task content")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="created at")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="updated at")

    class Meta:
        verbose_name = "speaking Teil exercise"
        verbose_name_plural = "speaking Teil exercises"

    def __str__(self) -> str:
        return f"SpeakingTeilExercise<{self.exercise_base}>"


class SpeakingGapMatchingExercise(models.Model):
    exercise_base = models.OneToOneField(
        "exam_preparation.ExerciseBase",
        on_delete=models.CASCADE,
        related_name="speaking_gap_matching_exercise",
        verbose_name="exercise base",
    )
    content_with_placeholders = models.TextField(verbose_name="content with placeholders")
    original_source_text = models.TextField(blank=True, default="", verbose_name="original source text")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="created at")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="updated at")

    class Meta:
        verbose_name = "speaking gap matching exercise"
        verbose_name_plural = "speaking gap matching exercises"


class SpeakingGapOption(models.Model):
    blank = models.ForeignKey(
        "exam_preparation.SpeakingGapBlank",
        on_delete=models.CASCADE,
        related_name="options",
        verbose_name="blank",
    )
    option_key = models.CharField(max_length=16, verbose_name="option key")
    option_text = models.TextField(verbose_name="option text")
    is_correct = models.BooleanField(default=False, db_index=True, verbose_name="is correct")
    explanation = models.TextField(blank=True, default="", verbose_name="explanation")
    sort_order = models.PositiveIntegerField(default=0, verbose_name="sort order")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="created at")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="updated at")

    class Meta:
        verbose_name = "speaking gap option"
        verbose_name_plural = "speaking gap options"
        ordering = ["blank_id", "sort_order", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["blank", "option_key"],
                name="exam_prep_sg_opt_key_uq",
            )
        ]

    def __str__(self) -> str:
        return f"SpeakingGapOption<blank={self.blank_id} key={self.option_key}>"


class SpeakingGapBlank(models.Model):
    exercise = models.ForeignKey(
        "exam_preparation.SpeakingGapMatchingExercise",
        on_delete=models.CASCADE,
        related_name="blanks",
        verbose_name="exercise",
    )
    blank_key = models.CharField(max_length=64, verbose_name="blank key")
    blank_number = models.PositiveIntegerField(verbose_name="blank number")
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


class SpeakingPromptSegmentedExercise(models.Model):
    exercise_base = models.OneToOneField(
        "exam_preparation.ExerciseBase",
        on_delete=models.CASCADE,
        related_name="speaking_prompt_segmented_exercise",
        verbose_name="exercise base",
    )
    prompt_text = models.TextField(verbose_name="prompt text")
    segment_delimiter = models.CharField(
        max_length=32,
        default="<分段>",
        verbose_name="segment delimiter",
    )
    example_text_raw = models.TextField(blank=True, default="", verbose_name="raw example text")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="created at")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="updated at")

    class Meta:
        verbose_name = "speaking prompt segmented exercise"
        verbose_name_plural = "speaking prompt segmented exercises"

    def __str__(self) -> str:
        return f"SpeakingPromptSegmentedExercise<{self.exercise_base}>"


class SpeakingPromptSegment(models.Model):
    exercise = models.ForeignKey(
        "exam_preparation.SpeakingPromptSegmentedExercise",
        on_delete=models.CASCADE,
        related_name="segments",
        verbose_name="exercise",
    )
    segment_order = models.PositiveIntegerField(verbose_name="segment order")
    segment_text = models.TextField(verbose_name="segment text")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="created at")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="updated at")

    class Meta:
        verbose_name = "speaking prompt segment"
        verbose_name_plural = "speaking prompt segments"
        ordering = ["exercise_id", "segment_order", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["exercise", "segment_order"],
                name="exam_prep_sps_segment_order_uq",
            )
        ]

    def __str__(self) -> str:
        return f"SpeakingPromptSegment<exercise={self.exercise_id} order={self.segment_order}>"

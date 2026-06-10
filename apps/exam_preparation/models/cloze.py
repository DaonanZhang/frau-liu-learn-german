from __future__ import annotations

from django.db import models


class ClozeChoiceExercise(models.Model):
    exercise_base = models.OneToOneField(
        "exam_preparation.ExerciseBase",
        on_delete=models.CASCADE,
        related_name="cloze_choice_exercise",
        verbose_name="exercise base",
    )
    content_with_placeholders = models.TextField(verbose_name="content with placeholders")
    original_source_text = models.TextField(blank=True, default="", verbose_name="original source text")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="created at")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="updated at")

    class Meta:
        verbose_name = "cloze choice exercise"
        verbose_name_plural = "cloze choice exercises"


class ClozeChoiceBlank(models.Model):
    exercise = models.ForeignKey(
        "exam_preparation.ClozeChoiceExercise",
        on_delete=models.CASCADE,
        related_name="blanks",
        verbose_name="exercise",
    )
    blank_key = models.CharField(max_length=64, verbose_name="blank key")
    blank_number = models.PositiveIntegerField(verbose_name="blank number")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="created at")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="updated at")

    class Meta:
        verbose_name = "cloze choice blank"
        verbose_name_plural = "cloze choice blanks"
        ordering = ["exercise_id", "blank_number", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["exercise", "blank_key"],
                name="exam_prep_cc_blank_key_uq",
            ),
            models.UniqueConstraint(
                fields=["exercise", "blank_number"],
                name="exam_prep_cc_blank_num_uq",
            ),
        ]

    def __str__(self) -> str:
        return f"ClozeChoiceBlank<exercise={self.exercise_id} key={self.blank_key}>"


class ClozeChoiceOption(models.Model):
    blank = models.ForeignKey(
        "exam_preparation.ClozeChoiceBlank",
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
        verbose_name = "cloze choice option"
        verbose_name_plural = "cloze choice options"
        ordering = ["blank_id", "sort_order", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["blank", "option_key"],
                name="exam_prep_cc_opt_key_uq",
            )
        ]

    def __str__(self) -> str:
        return f"ClozeChoiceOption<blank={self.blank_id} key={self.option_key}>"


class ClozeMatchingExercise(models.Model):
    exercise_base = models.OneToOneField(
        "exam_preparation.ExerciseBase",
        on_delete=models.CASCADE,
        related_name="cloze_matching_exercise",
        verbose_name="exercise base",
    )
    content_with_placeholders = models.TextField(verbose_name="content with placeholders")
    original_source_text = models.TextField(blank=True, default="", verbose_name="original source text")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="created at")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="updated at")

    class Meta:
        verbose_name = "cloze matching exercise"
        verbose_name_plural = "cloze matching exercises"


class ClozeMatchingOption(models.Model):
    exercise = models.ForeignKey(
        "exam_preparation.ClozeMatchingExercise",
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
        verbose_name = "cloze matching option"
        verbose_name_plural = "cloze matching options"
        ordering = ["exercise_id", "option_order", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["exercise", "option_key"],
                name="exam_prep_cm_opt_key_uq",
            )
        ]

    def __str__(self) -> str:
        return f"ClozeMatchingOption<exercise={self.exercise_id} key={self.option_key}>"


class ClozeMatchingBlankAnswer(models.Model):
    exercise = models.ForeignKey(
        "exam_preparation.ClozeMatchingExercise",
        on_delete=models.CASCADE,
        related_name="blank_answers",
        verbose_name="exercise",
    )
    blank_key = models.CharField(max_length=64, verbose_name="blank key")
    blank_number = models.PositiveIntegerField(verbose_name="blank number")
    correct_option = models.ForeignKey(
        "exam_preparation.ClozeMatchingOption",
        on_delete=models.PROTECT,
        related_name="blank_answers",
        verbose_name="correct option",
    )
    explanation = models.TextField(blank=True, default="", verbose_name="explanation")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="created at")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="updated at")

    class Meta:
        verbose_name = "cloze matching blank answer"
        verbose_name_plural = "cloze matching blank answers"
        ordering = ["exercise_id", "blank_number", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["exercise", "blank_key"],
                name="exam_prep_cm_blank_key_uq",
            ),
            models.UniqueConstraint(
                fields=["exercise", "blank_number"],
                name="exam_prep_cm_blank_num_uq",
            ),
        ]

    def __str__(self) -> str:
        return f"ClozeMatchingBlankAnswer<exercise={self.exercise_id} key={self.blank_key}>"


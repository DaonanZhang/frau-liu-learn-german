from __future__ import annotations

from django.db import models


class ReadingTitleMatchingExercise(models.Model):
    exercise_base = models.OneToOneField(
        "exam_preparation.ExerciseBase",
        on_delete=models.CASCADE,
        related_name="reading_title_matching_exercise",
        verbose_name="exercise base",
    )
    instruction = models.TextField(blank=True, default="", verbose_name="instruction")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="created at")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="updated at")

    class Meta:
        verbose_name = "reading title matching exercise"
        verbose_name_plural = "reading title matching exercises"


class ReadingTitleMatchingOption(models.Model):
    exercise = models.ForeignKey(
        "exam_preparation.ReadingTitleMatchingExercise",
        on_delete=models.CASCADE,
        related_name="options",
        verbose_name="exercise",
    )
    option_key = models.CharField(max_length=16, verbose_name="option key")
    option_text = models.TextField(verbose_name="option text")
    option_order = models.PositiveIntegerField(default=0, verbose_name="option order")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="created at")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="updated at")

    class Meta:
        verbose_name = "reading title matching option"
        verbose_name_plural = "reading title matching options"
        ordering = ["exercise_id", "option_order", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["exercise", "option_key"],
                name="exam_prep_rtm_opt_key_uq",
            )
        ]

    def __str__(self) -> str:
        return f"ReadingTitleMatchingOption<exercise={self.exercise_id} key={self.option_key}>"


class ReadingTitleMatchingItem(models.Model):
    exercise = models.ForeignKey(
        "exam_preparation.ReadingTitleMatchingExercise",
        on_delete=models.CASCADE,
        related_name="items",
        verbose_name="exercise",
    )
    item_number = models.PositiveIntegerField(verbose_name="item number")
    text = models.TextField(verbose_name="text")
    correct_option = models.ForeignKey(
        "exam_preparation.ReadingTitleMatchingOption",
        on_delete=models.PROTECT,
        related_name="matched_items",
        verbose_name="correct option",
    )
    explanation = models.TextField(blank=True, default="", verbose_name="explanation")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="created at")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="updated at")

    class Meta:
        verbose_name = "reading title matching item"
        verbose_name_plural = "reading title matching items"
        ordering = ["exercise_id", "item_number", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["exercise", "item_number"],
                name="exam_prep_rtm_item_num_uq",
            )
        ]

    def __str__(self) -> str:
        return f"ReadingTitleMatchingItem<exercise={self.exercise_id} number={self.item_number}>"


class ReadingUnderstandingExercise(models.Model):
    exercise_base = models.OneToOneField(
        "exam_preparation.ExerciseBase",
        on_delete=models.CASCADE,
        related_name="reading_understanding_exercise",
        verbose_name="exercise base",
    )
    text_markdown = models.TextField(verbose_name="text markdown")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="created at")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="updated at")

    class Meta:
        verbose_name = "reading understanding exercise"
        verbose_name_plural = "reading understanding exercises"


class ReadingUnderstandingQuestion(models.Model):
    exercise = models.ForeignKey(
        "exam_preparation.ReadingUnderstandingExercise",
        on_delete=models.CASCADE,
        related_name="questions",
        verbose_name="exercise",
    )
    question_number = models.PositiveIntegerField(verbose_name="question number")
    question_text = models.TextField(verbose_name="question text")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="created at")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="updated at")

    class Meta:
        verbose_name = "reading understanding question"
        verbose_name_plural = "reading understanding questions"
        ordering = ["exercise_id", "question_number", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["exercise", "question_number"],
                name="exam_prep_ru_q_num_uq",
            )
        ]

    def __str__(self) -> str:
        return f"ReadingUnderstandingQuestion<exercise={self.exercise_id} number={self.question_number}>"


class ReadingUnderstandingAnswerOption(models.Model):
    question = models.ForeignKey(
        "exam_preparation.ReadingUnderstandingQuestion",
        on_delete=models.CASCADE,
        related_name="answer_options",
        verbose_name="question",
    )
    option_key = models.CharField(max_length=16, verbose_name="option key")
    option_text = models.TextField(verbose_name="option text")
    is_correct = models.BooleanField(default=False, db_index=True, verbose_name="is correct")
    explanation = models.TextField(blank=True, default="", verbose_name="explanation")
    sort_order = models.PositiveIntegerField(default=0, verbose_name="sort order")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="created at")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="updated at")

    class Meta:
        verbose_name = "reading understanding answer option"
        verbose_name_plural = "reading understanding answer options"
        ordering = ["question_id", "sort_order", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["question", "option_key"],
                name="exam_prep_ru_opt_key_uq",
            )
        ]

    def __str__(self) -> str:
        return f"ReadingUnderstandingAnswerOption<question={self.question_id} key={self.option_key}>"


class ReadingAdMatchingExercise(models.Model):
    exercise_base = models.OneToOneField(
        "exam_preparation.ExerciseBase",
        on_delete=models.CASCADE,
        related_name="reading_ad_matching_exercise",
        verbose_name="exercise base",
    )
    instruction = models.TextField(blank=True, default="", verbose_name="instruction")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="created at")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="updated at")

    class Meta:
        verbose_name = "reading ad matching exercise"
        verbose_name_plural = "reading ad matching exercises"


class ReadingAdMatchingAd(models.Model):
    exercise = models.ForeignKey(
        "exam_preparation.ReadingAdMatchingExercise",
        on_delete=models.CASCADE,
        related_name="ads",
        verbose_name="exercise",
    )
    ad_key = models.CharField(max_length=16, verbose_name="ad key")
    ad_text_markdown = models.TextField(verbose_name="ad text markdown")
    ad_order = models.PositiveIntegerField(default=0, verbose_name="ad order")
    is_no_match_option = models.BooleanField(default=False, db_index=True, verbose_name="is no-match option")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="created at")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="updated at")

    class Meta:
        verbose_name = "reading ad matching ad"
        verbose_name_plural = "reading ad matching ads"
        ordering = ["exercise_id", "ad_order", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["exercise", "ad_key"],
                name="exam_prep_ram_ad_key_uq",
            )
        ]

    def __str__(self) -> str:
        return f"ReadingAdMatchingAd<exercise={self.exercise_id} key={self.ad_key}>"


class ReadingAdMatchingItem(models.Model):
    exercise = models.ForeignKey(
        "exam_preparation.ReadingAdMatchingExercise",
        on_delete=models.CASCADE,
        related_name="items",
        verbose_name="exercise",
    )
    item_number = models.PositiveIntegerField(verbose_name="item number")
    item_text = models.TextField(verbose_name="item text")
    correct_ad = models.ForeignKey(
        "exam_preparation.ReadingAdMatchingAd",
        on_delete=models.PROTECT,
        related_name="matched_items",
        verbose_name="correct ad",
    )
    explanation = models.TextField(blank=True, default="", verbose_name="explanation")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="created at")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="updated at")

    class Meta:
        verbose_name = "reading ad matching item"
        verbose_name_plural = "reading ad matching items"
        ordering = ["exercise_id", "item_number", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["exercise", "item_number"],
                name="exam_prep_ram_item_num_uq",
            )
        ]

    def __str__(self) -> str:
        return f"ReadingAdMatchingItem<exercise={self.exercise_id} number={self.item_number}>"


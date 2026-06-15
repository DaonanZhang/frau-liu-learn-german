from __future__ import annotations

from django.db import models


class ListeningExercise(models.Model):
    class ListeningType(models.TextChoices):
        SHORT_TEXT_TRUE_FALSE_WITH_PREP = "short_text_true_false_with_prep", "Short texts true/false with prep time"
        SHORT_TEXT_TRUE_FALSE_ONCE = "short_text_true_false_once", "Short texts true/false once"
        DIALOG_TRUE_FALSE_TWICE = "dialog_true_false_twice", "Dialog true/false twice"

    exercise_base = models.OneToOneField(
        "exam_preparation.ExerciseBase",
        on_delete=models.CASCADE,
        related_name="listening_exercise",
        verbose_name="exercise base",
    )
    listening_type = models.CharField(
        max_length=64,
        choices=ListeningType.choices,
        default=ListeningType.SHORT_TEXT_TRUE_FALSE_WITH_PREP,
        db_index=True,
        verbose_name="listening type",
    )
    audio_file_identifier = models.CharField(max_length=255, blank=True, default="", verbose_name="audio file identifier")
    audio_file_url = models.CharField(max_length=500, blank=True, default="", verbose_name="audio file URL")
    script = models.TextField(blank=True, default="", verbose_name="script")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="created at")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="updated at")

    class Meta:
        verbose_name = "listening exercise"
        verbose_name_plural = "listening exercises"

    def __str__(self) -> str:
        return f"ListeningExercise<{self.exercise_base}>"


class ListeningQuestion(models.Model):
    class QuestionType(models.TextChoices):
        SINGLE_CHOICE = "single_choice", "Single choice"
        MULTIPLE_CHOICE = "multiple_choice", "Multiple choice"

    listening_exercise = models.ForeignKey(
        "exam_preparation.ListeningExercise",
        on_delete=models.CASCADE,
        related_name="questions",
        verbose_name="listening exercise",
    )
    question_number = models.PositiveIntegerField(verbose_name="question number")
    question_type = models.CharField(max_length=32, choices=QuestionType.choices, verbose_name="question type")
    question_text = models.TextField(verbose_name="question text")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="created at")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="updated at")

    class Meta:
        verbose_name = "listening question"
        verbose_name_plural = "listening questions"
        ordering = ["listening_exercise_id", "question_number", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["listening_exercise", "question_number"],
                name="exam_prep_listen_q_num_uq",
            )
        ]

    def __str__(self) -> str:
        return f"ListeningQuestion<exercise={self.listening_exercise_id} number={self.question_number}>"


class ListeningAnswerOption(models.Model):
    question = models.ForeignKey(
        "exam_preparation.ListeningQuestion",
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
        verbose_name = "listening answer option"
        verbose_name_plural = "listening answer options"
        ordering = ["question_id", "sort_order", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["question", "option_key"],
                name="exam_prep_listen_opt_key_uq",
            )
        ]

    def __str__(self) -> str:
        return f"ListeningAnswerOption<question={self.question_id} key={self.option_key}>"

from __future__ import annotations

from django.db import models


class WritingExercise(models.Model):
    exercise_base = models.OneToOneField(
        "exam_preparation.ExerciseBase",
        on_delete=models.CASCADE,
        related_name="writing_exercise",
        verbose_name="exercise base",
    )
    request_text = models.TextField(blank=True, default="", verbose_name="request text")
    time_limit_minutes = models.PositiveIntegerField(null=True, blank=True, verbose_name="time limit in minutes")
    words_limit = models.PositiveIntegerField(null=True, blank=True, verbose_name="word limit")
    task_text = models.TextField(blank=True, default="", verbose_name="task text")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="created at")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="updated at")

    class Meta:
        verbose_name = "writing exercise"
        verbose_name_plural = "writing exercises"

    def __str__(self) -> str:
        return f"WritingExercise<{self.exercise_base}>"


class WritingExampleText(models.Model):
    writing_exercise = models.ForeignKey(
        "exam_preparation.WritingExercise",
        on_delete=models.CASCADE,
        related_name="example_texts",
        verbose_name="writing exercise",
    )
    example_text = models.TextField(verbose_name="example text")
    label = models.CharField(max_length=64, blank=True, default="", verbose_name="label")
    note = models.TextField(blank=True, default="", verbose_name="note")
    sort_order = models.PositiveIntegerField(default=0, verbose_name="sort order")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="created at")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="updated at")

    class Meta:
        verbose_name = "writing example text"
        verbose_name_plural = "writing example texts"
        ordering = ["writing_exercise_id", "sort_order", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["writing_exercise", "sort_order"],
                name="exam_prep_write_example_sort_uq",
            )
        ]

    def __str__(self) -> str:
        return f"WritingExampleText<exercise={self.writing_exercise_id} sort={self.sort_order}>"


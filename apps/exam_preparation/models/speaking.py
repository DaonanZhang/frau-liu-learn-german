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

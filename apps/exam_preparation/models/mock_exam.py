from __future__ import annotations

import secrets

from django.conf import settings
from django.db import models


def generate_mock_exam_code():
    alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
    return "ME-" + "".join(secrets.choice(alphabet) for _ in range(8))


def generate_mock_exam_share_code():
    alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
    return "MS-" + "".join(secrets.choice(alphabet) for _ in range(12))


class MockExamPaper(models.Model):
    """A reusable mock-exam question set, independent from any user's attempt."""

    class CreationMethod(models.TextChoices):
        RANDOM = "random", "Random"
        MANUAL = "manual", "Manual"

    code = models.CharField(max_length=11, unique=True, default=generate_mock_exam_code, editable=False)
    exam_type = models.CharField(max_length=128, default="telc")
    level = models.CharField(max_length=8, default="B1")
    exercise_selection = models.JSONField(default=dict)
    creation_method = models.CharField(
        max_length=16,
        choices=CreationMethod.choices,
        default=CreationMethod.RANDOM,
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_mock_exam_papers",
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self) -> str:
        return f"MockExamPaper<{self.code} {self.exam_type} {self.level}>"


class SavedMockExam(models.Model):
    """One user's answers and progress for a reusable mock-exam paper."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="saved_mock_exams",
    )
    paper = models.ForeignKey(
        MockExamPaper,
        on_delete=models.PROTECT,
        related_name="attempts",
    )
    fingerprint = models.CharField(max_length=64)
    exam_type = models.CharField(max_length=128, default="telc")
    level = models.CharField(max_length=8, default="B1")
    exercise_selection = models.JSONField(default=dict)
    answers = models.JSONField(default=dict, blank=True)
    writing_text = models.TextField(blank=True, default="")
    writing_grade = models.CharField(max_length=1, blank=True, default="")
    writing_assessment = models.JSONField(default=dict, blank=True)
    score_breakdown = models.JSONField(default=dict, blank=True)
    total_score = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    score_percentage = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True)
    is_passed = models.BooleanField(null=True, blank=True)
    is_completed = models.BooleanField(default=False)
    is_favorite = models.BooleanField(default=False)
    progress = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at", "-id"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "fingerprint"],
                name="exam_prep_saved_mock_user_fingerprint_uq",
            )
        ]

    def __str__(self) -> str:
        return f"SavedMockExam<user={self.user_id} id={self.pk}>"


class MockExamShare(models.Model):
    """An explicitly shared paper, optionally including one attempt's answers."""

    class ShareMode(models.TextChoices):
        PAPER = "paper", "Paper only"
        PAPER_WITH_ANSWERS = "paper_with_answers", "Paper with answers"

    share_code = models.CharField(
        max_length=15,
        unique=True,
        default=generate_mock_exam_share_code,
        editable=False,
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="mock_exam_shares",
    )
    paper = models.ForeignKey(
        MockExamPaper,
        on_delete=models.CASCADE,
        related_name="shares",
    )
    attempt = models.ForeignKey(
        SavedMockExam,
        on_delete=models.CASCADE,
        related_name="shares",
    )
    share_mode = models.CharField(
        max_length=24,
        choices=ShareMode.choices,
        default=ShareMode.PAPER,
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        constraints = [
            models.UniqueConstraint(
                fields=["attempt", "share_mode"],
                name="exam_prep_mock_share_attempt_mode_uq",
            )
        ]

    def __str__(self) -> str:
        return f"MockExamShare<{self.share_code} {self.share_mode}>"

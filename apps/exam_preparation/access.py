from __future__ import annotations

from django.db.models import Q
from django.utils import timezone

from apps.accounts.models import Entitlement


FREE_EXERCISES_PER_TYPE = 3


def user_has_full_exam_preparation_access(user) -> bool:
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if user.is_staff:
        return True

    now = timezone.now()
    return (
        Entitlement.objects.filter(
            user=user,
            status=Entitlement.Status.ACTIVE,
            starts_at__lte=now,
        )
        .filter(Q(expires_at__isnull=True) | Q(expires_at__gt=now))
        .filter(
            Q(module__isnull=True, season__isnull=True)
            | Q(module__key="exam_preparation", module__is_active=True, season__isnull=True)
        )
        .exists()
    )


def is_free_trial_exercise(exercise) -> bool:
    exercise_base = getattr(exercise, "exercise_base", None)
    if exercise_base is None or exercise.pk is None:
        return False

    free_ids = list(
        type(exercise).objects.filter(
            exercise_base__exercise_type=exercise_base.exercise_type,
        )
        .order_by("id")
        .values_list("id", flat=True)[:FREE_EXERCISES_PER_TYPE]
    )
    return exercise.pk in free_ids


def get_parent_exercise(target):
    if getattr(target, "exercise_base", None) is not None:
        return target
    if hasattr(target, "listening_exercise"):
        return target.listening_exercise
    if hasattr(target, "exercise"):
        return target.exercise
    if hasattr(target, "writing_exercise"):
        return target.writing_exercise
    return None


def user_can_access_exercise(user, exercise) -> bool:
    return user_has_full_exam_preparation_access(user) or is_free_trial_exercise(exercise)

from __future__ import annotations

from django.db.models import Q
from django.utils import timezone

from apps.accounts.models import Entitlement


FREE_EXERCISES_PER_TYPE = 3
TELC_B2_READING_UNDERSTANDING_FREE_EXTERNAL_IDS = {"1", "2", "6"}


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


def get_free_trial_exercise_ids(exercise) -> set:
    exercise_base = getattr(exercise, "exercise_base", None)
    if exercise_base is None or exercise.pk is None:
        return set()

    exercises = type(exercise).objects.filter(
        exercise_base__exercise_type=exercise_base.exercise_type,
        exercise_base__exam_type=exercise_base.exam_type,
        exercise_base__level=exercise_base.level,
    )
    if (
        exercise_base.exam_type == "TELC"
        and exercise_base.level == "B2"
        and exercise_base.exercise_type == "READING_UNDERSTANDING"
    ):
        return set(
            exercises.filter(
                exercise_base__external_id__in=TELC_B2_READING_UNDERSTANDING_FREE_EXTERNAL_IDS,
            ).values_list("id", flat=True)
        )
    return set(exercises.order_by("id").values_list("id", flat=True)[:FREE_EXERCISES_PER_TYPE])


def is_free_trial_exercise(exercise) -> bool:
    return exercise.pk in get_free_trial_exercise_ids(exercise)


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

from datetime import timedelta

from django.db.models import Q
from django.utils import timezone

from apps.exam_preparation.models import (
    ClozeChoiceExercise,
    ClozeMatchingExercise,
    ExerciseBase,
    ListeningExercise,
    ReadingAdMatchingExercise,
    ReadingTitleMatchingExercise,
    ReadingUnderstandingExercise,
    WritingExercise,
)
from apps.exam_preparation.serializers import (
    ClozeChoiceExerciseDetailSerializer,
    ClozeMatchingExerciseDetailSerializer,
    ListeningExerciseDetailSerializer,
    ReadingAdMatchingExerciseDetailSerializer,
    ReadingTitleMatchingExerciseDetailSerializer,
    ReadingUnderstandingExerciseDetailSerializer,
    WritingExerciseDetailSerializer,
)
from apps.exam_preparation.mock_exam.telc import scoring


def definitions(*, exam_type="TELC", level=ExerciseBase.Level.B1):
    configured = (
        (
            "reading_title_matching",
            ReadingTitleMatchingExercise.objects.select_related("exercise_base").prefetch_related(
                "options", "items__correct_option"
            ),
            ReadingTitleMatchingExerciseDetailSerializer,
        ),
        (
            "reading_understanding",
            ReadingUnderstandingExercise.objects.select_related("exercise_base").prefetch_related(
                "questions__answer_options"
            ),
            ReadingUnderstandingExerciseDetailSerializer,
        ),
        (
            "reading_ad_matching",
            ReadingAdMatchingExercise.objects.select_related("exercise_base").prefetch_related(
                "ads", "items__correct_ad"
            ),
            ReadingAdMatchingExerciseDetailSerializer,
        ),
        (
            "cloze_choice",
            ClozeChoiceExercise.objects.select_related("exercise_base").prefetch_related("blanks__options"),
            ClozeChoiceExerciseDetailSerializer,
        ),
        (
            "cloze_matching",
            ClozeMatchingExercise.objects.select_related("exercise_base").prefetch_related(
                "options", "blank_answers__correct_option"
            ),
            ClozeMatchingExerciseDetailSerializer,
        ),
        (
            "listening_teil1",
            ListeningExercise.objects.filter(
                listening_type=ListeningExercise.ListeningType.SHORT_TEXT_TRUE_FALSE_WITH_PREP
            ).select_related("exercise_base").prefetch_related("questions__answer_options"),
            ListeningExerciseDetailSerializer,
        ),
        (
            "listening_teil2",
            ListeningExercise.objects.filter(
                listening_type=ListeningExercise.ListeningType.SHORT_TEXT_TRUE_FALSE_ONCE
            ).select_related("exercise_base").prefetch_related("questions__answer_options"),
            ListeningExerciseDetailSerializer,
        ),
        (
            "listening_teil3",
            ListeningExercise.objects.filter(
                listening_type=ListeningExercise.ListeningType.DIALOG_TRUE_FALSE_TWICE
            ).select_related("exercise_base").prefetch_related("questions__answer_options"),
            ListeningExerciseDetailSerializer,
        ),
        (
            "writing",
            WritingExercise.objects.select_related("exercise_base").prefetch_related("example_texts"),
            WritingExerciseDetailSerializer,
        ),
    )
    exam_filter = Q(exercise_base__exam_type__iexact=exam_type) | Q(
        exercise_base__exam_type__iexact=f"{exam_type} {level}"
    )
    return tuple(
        (key, queryset.filter(exercise_base__level=level).filter(exam_filter), serializer_class)
        for key, queryset, serializer_class in configured
    )


def build_payload(
    request,
    selection=None,
    *,
    exam_type="TELC",
    level=ExerciseBase.Level.B1,
    show_listening_scripts=False,
):
    parts = {}
    selected_ids = {}
    missing_parts = []
    for key, queryset, serializer_class in definitions(exam_type=exam_type, level=level):
        if key == "writing" and level == ExerciseBase.Level.B2:
            writing_selection = selection.get(key) if selection else None
            if selection and isinstance(writing_selection, list):
                if (
                    len(writing_selection) != 2
                    or any(not isinstance(item, int) or isinstance(item, bool) for item in writing_selection)
                    or len(set(writing_selection)) != 2
                ):
                    missing_parts.append(key)
                    continue
                exercises_by_id = {
                    exercise.pk: exercise
                    for exercise in queryset.filter(pk__in=writing_selection)
                }
                exercises = [exercises_by_id.get(exercise_id) for exercise_id in writing_selection]
                if any(exercise is None for exercise in exercises):
                    missing_parts.append(key)
                    continue
            elif selection:
                exercise = queryset.filter(pk=writing_selection).first()
                exercises = [exercise] if exercise else []
            else:
                exercises = list(queryset.order_by("?")[:2])
            if len(exercises) != 2 and not (selection and not isinstance(writing_selection, list) and exercises):
                missing_parts.append(key)
                continue
            serialized = [
                serializer_class(
                    exercise,
                    context={
                        "request": request,
                        "show_listening_script": show_listening_scripts,
                    },
                ).data
                for exercise in exercises
            ]
            selected_ids[key] = [exercise.pk for exercise in exercises] if len(exercises) == 2 else exercises[0].pk
            parts[key] = serialized[0]
            if len(exercises) == 2:
                parts["writing_options"] = serialized
            continue
        exercise = queryset.filter(pk=selection[key]).first() if selection else queryset.order_by("?").first()
        if exercise is None:
            missing_parts.append(key)
            continue
        selected_ids[key] = exercise.pk
        parts[key] = serializer_class(
            exercise,
            context={
                "request": request,
                "show_listening_script": show_listening_scripts,
            },
        ).data

    if missing_parts:
        return None, None, missing_parts
    return {
        "exam_type": exam_type,
        "level": level,
        "exam_label": f"{exam_type} {level}",
        "durations": {
            "reading_and_cloze": 90 * 60,
            "collection_pause": 60,
            "listening": 30 * 60,
            "writing": 30 * 60,
        },
        "parts": parts,
    }, selected_ids, []


def new_progress():
    started_at = timezone.now()
    return {
        "phase": "reading",
        "deadline": int((started_at + timedelta(minutes=90)).timestamp() * 1000),
        "active_part": "reading_title_matching",
        "audio_step": 0,
        "audio_step_started_at": 0,
    }

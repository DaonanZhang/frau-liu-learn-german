from __future__ import annotations

import hashlib
import json
import re
import uuid
from datetime import timedelta
from decimal import Decimal, ROUND_HALF_UP

from django_filters.rest_framework import DjangoFilterBackend
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from django.shortcuts import get_object_or_404
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.viewsets import ModelViewSet, ViewSet

from apps.accounts.permissions import (
    HasExamPreparationReleaseAccess,
    HasValidEntitlement,
    IsAdminOrReadOnly,
)
from apps.exam_preparation.access import get_parent_exercise, user_can_access_exercise
from apps.exam_preparation.speaking_audio import get_speaking_turn_audio_url

from apps.exam_preparation.models import (
    ClozeChoiceBlank,
    ClozeChoiceExercise,
    ClozeChoiceOption,
    ClozeMatchingBlankAnswer,
    ClozeMatchingExercise,
    ClozeMatchingOption,
    ExerciseBase,
    ListeningAnswerOption,
    ListeningExercise,
    ListeningQuestion,
    MockExamPaper,
    MockExamShare,
    ReadingAdMatchingAd,
    ReadingAdMatchingExercise,
    ReadingAdMatchingItem,
    ReadingTitleMatchingExercise,
    ReadingTitleMatchingItem,
    ReadingTitleMatchingOption,
    ReadingUnderstandingAnswerOption,
    ReadingUnderstandingExercise,
    ReadingUnderstandingQuestion,
    SavedMockExam,
    SpeakingTeilExercise,
    UserClozeChoiceBlankState,
    UserClozeMatchingBlankState,
    UserExerciseFavorite,
    UserListeningQuestionState,
    UserReadingAdMatchingItemState,
    UserReadingTitleMatchingItemState,
    UserReadingUnderstandingQuestionState,
    UserWritingExampleTextState,
    UserWritingExerciseState,
    UserSpeakingTurnState,
    WritingExampleText,
    WritingExercise,
)
from apps.exam_preparation.serializers import (
    ClozeChoiceBlankSerializer,
    ClozeChoiceExerciseDetailSerializer,
    ClozeChoiceExerciseSerializer,
    ClozeChoiceOptionSerializer,
    ClozeMatchingBlankAnswerSerializer,
    ClozeMatchingExerciseDetailSerializer,
    ClozeMatchingExerciseSerializer,
    ClozeMatchingOptionSerializer,
    ExerciseBaseSerializer,
    ListeningAnswerOptionSerializer,
    ListeningExerciseDetailSerializer,
    ListeningExerciseSerializer,
    ListeningQuestionSerializer,
    ReadingAdMatchingAdSerializer,
    ReadingAdMatchingExerciseDetailSerializer,
    ReadingAdMatchingExerciseSerializer,
    ReadingAdMatchingItemSerializer,
    ReadingTitleMatchingExerciseDetailSerializer,
    ReadingTitleMatchingExerciseSerializer,
    ReadingTitleMatchingItemSerializer,
    ReadingTitleMatchingOptionSerializer,
    ReadingUnderstandingExerciseDetailSerializer,
    ReadingUnderstandingAnswerOptionSerializer,
    ReadingUnderstandingExerciseSerializer,
    ReadingUnderstandingQuestionSerializer,
    SpeakingTeilExerciseSerializer,
    UserClozeChoiceBlankStateSerializer,
    UserClozeMatchingBlankStateSerializer,
    UserExerciseFavoriteSerializer,
    UserListeningQuestionStateSerializer,
    UserReadingAdMatchingItemStateSerializer,
    UserReadingTitleMatchingItemStateSerializer,
    UserReadingUnderstandingQuestionStateSerializer,
    UserWritingExampleTextStateSerializer,
    UserWritingExerciseStateSerializer,
    UserSpeakingTurnStateSerializer,
    WritingExampleTextSerializer,
    WritingExerciseDetailSerializer,
    WritingExerciseSerializer,
)


class BaseExamPreparationViewSet(ModelViewSet):
    permission_classes = [
        IsAuthenticated,
        HasExamPreparationReleaseAccess,
        HasValidEntitlement,
        IsAdminOrReadOnly,
    ]
    required_module_key = "exam_preparation"
    filter_backends = [DjangoFilterBackend, OrderingFilter, SearchFilter]
    ordering = ["id"]
    trial_access_enabled = False

    def get_permissions(self):
        if self.trial_access_enabled and self.action in {"list", "retrieve"}:
            return [
                IsAuthenticated(),
                HasExamPreparationReleaseAccess(),
                IsAdminOrReadOnly(),
            ]
        return super().get_permissions()

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        if self.trial_access_enabled and not user_can_access_exercise(request.user, instance):
            raise PermissionDenied(
                {
                    "message": "购买备考季后可解锁该题目。",
                    "code": "exam_preparation_purchase_required",
                }
            )
        serializer = self.get_serializer(instance)
        return Response(serializer.data)


class BaseUserExerciseStateViewSet(BaseExamPreparationViewSet):
    permission_classes = [IsAuthenticated, HasExamPreparationReleaseAccess]
    state_lookup_field = ""
    state_lookup_fields = ()
    ordering = ["-updated_at", "id"]

    def get_queryset(self):
        return super().get_queryset().filter(user=self.request.user)

    def _apply_answer_timestamp(self, validated_data):
        answer_keys = {"answer_payload", "is_correct"}
        if "last_answered_at" in validated_data:
            return validated_data
        if any(key in validated_data for key in answer_keys):
            validated_data["last_answered_at"] = timezone.now()
        return validated_data

    def _ensure_target_access(self, target_object):
        exercise = get_parent_exercise(target_object)
        if exercise is None or not user_can_access_exercise(self.request.user, exercise):
            raise PermissionDenied(
                {
                    "message": "购买备考季后可解锁该题目。",
                    "code": "exam_preparation_purchase_required",
                }
            )

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated_data = self._apply_answer_timestamp(dict(serializer.validated_data))
        lookup_fields = self.state_lookup_fields or (self.state_lookup_field,)
        target_object = validated_data[lookup_fields[0]]
        self._ensure_target_access(target_object)
        defaults = {
            key: value
            for key, value in validated_data.items()
            if key not in lookup_fields
        }
        instance, created = self.get_queryset().update_or_create(
            user=request.user,
            **{field: validated_data[field] for field in lookup_fields},
            defaults=defaults,
        )
        output_serializer = self.get_serializer(instance)
        return Response(
            output_serializer.data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    def perform_update(self, serializer):
        validated_data = self._apply_answer_timestamp(dict(serializer.validated_data))
        lookup_field = self.state_lookup_field
        target_object = validated_data.get(
            lookup_field,
            getattr(serializer.instance, lookup_field),
        )
        self._ensure_target_access(target_object)
        serializer.save(**validated_data)


def _mock_exam_definitions(*, exam_type="telc", level=ExerciseBase.Level.B1):
    definitions = (
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

    # `exam_type` is the exam family and `level` is the CEFR level. The second
    # condition keeps older rows labelled as e.g. "telc B1" usable while new
    # imports continue to store the canonical family-only value "telc".
    exam_filter = Q(exercise_base__exam_type__iexact=exam_type) | Q(
        exercise_base__exam_type__iexact=f"{exam_type} {level}"
    )
    return tuple(
        (key, queryset.filter(exercise_base__level=level).filter(exam_filter), serializer_class)
        for key, queryset, serializer_class in definitions
    )


def _mock_exam_payload(
    request,
    selection=None,
    *,
    exam_type="telc",
    level=ExerciseBase.Level.B1,
    show_listening_scripts=False,
):
    parts = {}
    selected_ids = {}
    missing_parts = []
    for key, queryset, serializer_class in _mock_exam_definitions(exam_type=exam_type, level=level):
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


def _mock_exam_scope(data):
    level = str(data.get("level", ExerciseBase.Level.B1)).strip().upper()
    exam_type = str(data.get("exam_type", "telc")).strip()
    legacy_suffix = f" {level}"
    if exam_type.upper().endswith(legacy_suffix):
        exam_type = exam_type[:-len(legacy_suffix)].strip()
    if not exam_type or level not in ExerciseBase.Level.values:
        return None
    return exam_type, level


def _new_mock_exam_progress():
    started_at = timezone.now()
    return {
        "phase": "reading",
        "deadline": int((started_at + timedelta(minutes=90)).timestamp() * 1000),
        "active_part": "reading_title_matching",
        "audio_step": 0,
        "audio_step_started_at": 0,
    }


WRITING_ASSESSMENT_DIMENSIONS = (
    "task_completion",
    "communicative_design",
    "formal_accuracy",
)
WRITING_GRADE_POINTS = {"A": 5, "B": 3, "C": 1, "D": 0}


def _normalize_writing_assessment(value):
    if not isinstance(value, dict):
        return None
    allowed_keys = {"topic_relevant", *WRITING_ASSESSMENT_DIMENSIONS}
    if set(value) - allowed_keys:
        return None
    topic_relevant = value.get("topic_relevant")
    if topic_relevant is not None and not isinstance(topic_relevant, bool):
        return None
    normalized = {"topic_relevant": topic_relevant}
    for key in WRITING_ASSESSMENT_DIMENSIONS:
        grade = value.get(key, "")
        if grade not in {"", *WRITING_GRADE_POINTS}:
            return None
        normalized[key] = grade
    return normalized


def _legacy_writing_assessment(grade):
    if grade not in WRITING_GRADE_POINTS:
        return {}
    return {
        "topic_relevant": True,
        **{key: grade for key in WRITING_ASSESSMENT_DIMENSIONS},
    }


def _writing_assessment_is_complete(assessment):
    if assessment.get("topic_relevant") is False:
        return True
    return assessment.get("topic_relevant") is True and all(
        assessment.get(key) in WRITING_GRADE_POINTS for key in WRITING_ASSESSMENT_DIMENSIONS
    )


def _writing_assessment_score(assessment):
    if assessment.get("topic_relevant") is not True:
        return 0
    return sum(WRITING_GRADE_POINTS.get(assessment.get(key), 0) for key in WRITING_ASSESSMENT_DIMENSIONS) * 3


def _mock_exam_correct_counts(instance):
    selection = instance.paper.exercise_selection
    answers = instance.answers

    def selected(part_key, item_id):
        return answers.get(f"{part_key}:{item_id}")

    reading_correct = sum(
        selected("reading_title_matching", item_id) == option_key
        for item_id, option_key in ReadingTitleMatchingItem.objects.filter(
            exercise_id=selection.get("reading_title_matching")
        ).values_list("id", "correct_option__option_key")
    )
    reading_correct += sum(
        selected("reading_understanding", question_id) == option_key
        for question_id, option_key in ReadingUnderstandingAnswerOption.objects.filter(
            question__exercise_id=selection.get("reading_understanding"),
            is_correct=True,
        ).values_list("question_id", "option_key")
    )
    reading_correct += sum(
        selected("reading_ad_matching", item_id) == ad_key
        for item_id, ad_key in ReadingAdMatchingItem.objects.filter(
            exercise_id=selection.get("reading_ad_matching")
        ).values_list("id", "correct_ad__ad_key")
    )
    cloze_correct = sum(
        selected("cloze_choice", blank_id) == option_key
        for blank_id, option_key in ClozeChoiceOption.objects.filter(
            blank__exercise_id=selection.get("cloze_choice"),
            is_correct=True,
        ).values_list("blank_id", "option_key")
    )
    cloze_correct += sum(
        selected("cloze_matching", blank_id) == option_key
        for blank_id, option_key in ClozeMatchingBlankAnswer.objects.filter(
            exercise_id=selection.get("cloze_matching")
        ).values_list("id", "correct_option__option_key")
    )
    listening_correct = 0
    for part_key in ("listening_teil1", "listening_teil2", "listening_teil3"):
        listening_correct += sum(
            selected(part_key, question_id) == option_key
            for question_id, option_key in ListeningAnswerOption.objects.filter(
                question__listening_exercise_id=selection.get(part_key),
                is_correct=True,
            ).values_list("question_id", "option_key")
        )
    return reading_correct, cloze_correct, listening_correct


def _calculate_mock_exam_result(instance):
    reading_correct, cloze_correct, listening_correct = _mock_exam_correct_counts(instance)
    writing_score = Decimal(str(_writing_assessment_score(
        instance.writing_assessment or _legacy_writing_assessment(instance.writing_grade)
    )))
    reading_score = Decimal(reading_correct) * Decimal("3.75")
    cloze_score = Decimal(cloze_correct) * Decimal("1.5")
    listening_score = Decimal(listening_correct) * Decimal("3.75")
    total_score = reading_score + cloze_score + listening_score + writing_score
    percentage = ((total_score / Decimal("225")) * 100).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)
    return {
        "score_breakdown": {
            "reading_correct": reading_correct,
            "reading_score": float(reading_score),
            "cloze_correct": cloze_correct,
            "cloze_score": float(cloze_score),
            "listening_correct": listening_correct,
            "listening_score": float(listening_score),
            "writing_score": float(writing_score),
        },
        "total_score": total_score,
        "score_percentage": percentage,
        "is_passed": total_score >= Decimal("135"),
    }


def _apply_mock_exam_result(instance):
    result = _calculate_mock_exam_result(instance)
    for field, value in result.items():
        setattr(instance, field, value)
    return result


def _create_mock_exam_paper(*, user, exam_type, level, selection, creation_method=MockExamPaper.CreationMethod.RANDOM):
    return MockExamPaper.objects.create(
        created_by=user,
        exam_type=exam_type,
        level=level,
        exercise_selection=selection,
        creation_method=creation_method,
    )


class SavedMockExamPagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = "page_size"
    max_page_size = 50


class MockExamViewSet(ViewSet):
    """Build one paid-access written mock exam from the current question bank."""

    permission_classes = [
        IsAuthenticated,
        HasExamPreparationReleaseAccess,
        HasValidEntitlement,
    ]
    required_module_key = "exam_preparation"

    def create(self, request):
        request_id = str(request.data.get("request_id", "")).strip()
        if request_id and (len(request_id) > 128 or not re.fullmatch(r"[A-Za-z0-9._:-]+", request_id)):
            return Response({"message": "组卷请求标识无效。"}, status=status.HTTP_400_BAD_REQUEST)
        scope = _mock_exam_scope(request.data)
        if scope is None:
            return Response({"message": "考试类型或等级无效。"}, status=status.HTTP_400_BAD_REQUEST)
        exam_type, level = scope
        payload, selection, missing_parts = _mock_exam_payload(request, exam_type=exam_type, level=level)
        if missing_parts:
            return Response(
                {
                    "message": "题库尚不足以生成完整的模拟考试。",
                    "missing_parts": missing_parts,
                },
                status=status.HTTP_409_CONFLICT,
            )

        progress = _new_mock_exam_progress()
        fingerprint = (
            hashlib.sha256(f"mock-create:{request_id}".encode("utf-8")).hexdigest()
            if request_id
            else uuid.uuid4().hex
        )
        attempt = SavedMockExam.objects.select_related("paper").filter(
            user=request.user,
            fingerprint=fingerprint,
        ).first()
        reused_attempt = attempt is not None
        if attempt is None:
            paper = _create_mock_exam_paper(
                user=request.user,
                exam_type=exam_type,
                level=level,
                selection=selection,
            )
            attempt, created = SavedMockExam.objects.get_or_create(
                user=request.user,
                fingerprint=fingerprint,
                defaults={
                    "paper": paper,
                    "exam_type": exam_type,
                    "level": level,
                    "exercise_selection": selection,
                    "progress": progress,
                },
            )
            if not created:
                paper.delete()
                attempt = SavedMockExam.objects.select_related("paper").get(pk=attempt.pk)
                reused_attempt = True
        if reused_attempt:
            payload, selection, missing_parts = _mock_exam_payload(
                request,
                attempt.paper.exercise_selection,
                exam_type=attempt.paper.exam_type,
                level=attempt.paper.level,
            )
            if missing_parts:
                return Response(
                    {"message": "考试记录中的部分题目已不存在。", "missing_parts": missing_parts},
                    status=status.HTTP_409_CONFLICT,
                )
            progress = attempt.progress
        payload["selection"] = selection
        payload["attempt_id"] = attempt.pk
        payload["paper_code"] = attempt.paper.code
        payload["progress"] = progress
        return Response(payload, status=status.HTTP_201_CREATED)


class SavedMockExamViewSet(ViewSet):
    permission_classes = [IsAuthenticated, HasExamPreparationReleaseAccess, HasValidEntitlement]
    required_module_key = "exam_preparation"

    @staticmethod
    def _summary(instance):
        writing_assessment = instance.writing_assessment or _legacy_writing_assessment(instance.writing_grade)
        result = None
        if instance.is_completed:
            if instance.total_score is None:
                result = _calculate_mock_exam_result(instance)
            else:
                result = {
                    "score_breakdown": instance.score_breakdown,
                    "total_score": instance.total_score,
                    "score_percentage": instance.score_percentage,
                    "is_passed": instance.is_passed,
                }
        return {
            "id": instance.pk,
            "paper_code": instance.paper.code,
            "exam_type": instance.paper.exam_type,
            "level": instance.paper.level,
            "exercise_selection": instance.paper.exercise_selection,
            "answers": instance.answers,
            "writing_text": instance.writing_text,
            "writing_grade": instance.writing_grade,
            "writing_assessment": writing_assessment,
            "writing_score": _writing_assessment_score(writing_assessment),
            "score_breakdown": result["score_breakdown"] if result else None,
            "total_score": float(result["total_score"]) if result else None,
            "score_percentage": float(result["score_percentage"]) if result else None,
            "is_passed": result["is_passed"] if result else None,
            "is_completed": instance.is_completed,
            "is_favorite": instance.is_favorite,
            "progress": instance.progress,
            "created_at": instance.created_at,
            "updated_at": instance.updated_at,
        }

    def list(self, request):
        queryset = SavedMockExam.objects.select_related("paper").filter(user=request.user)
        scope = request.query_params.get("scope", "favorites")
        if scope == "favorites":
            queryset = queryset.filter(is_favorite=True)
        elif scope == "active":
            queryset = queryset.filter(is_completed=False)
        elif scope == "history":
            pass
        elif scope != "all":
            return Response({"message": "记录类型无效。"}, status=status.HTTP_400_BAD_REQUEST)
        paginator = SavedMockExamPagination()
        page = paginator.paginate_queryset(queryset, request, view=self)
        return paginator.get_paginated_response([self._summary(item) for item in page])

    def retrieve(self, request, pk=None):
        instance = get_object_or_404(SavedMockExam.objects.select_related("paper"), pk=pk, user=request.user)
        payload, _, missing_parts = _mock_exam_payload(
            request,
            instance.paper.exercise_selection,
            exam_type=instance.paper.exam_type,
            level=instance.paper.level,
            show_listening_scripts=instance.is_completed,
        )
        if missing_parts:
            return Response(
                {"message": "收藏卷中的部分题目已不存在。", "missing_parts": missing_parts},
                status=status.HTTP_409_CONFLICT,
            )
        payload["selection"] = instance.paper.exercise_selection
        payload["paper_code"] = instance.paper.code
        return Response({**self._summary(instance), "exam": payload})

    def create(self, request):
        selection = request.data.get("exercise_selection")
        scope = _mock_exam_scope(request.data)
        if scope is None:
            return Response({"message": "考试类型或等级无效。"}, status=status.HTTP_400_BAD_REQUEST)
        exam_type, level = scope
        expected_keys = {item[0] for item in _mock_exam_definitions(exam_type=exam_type, level=level)}
        if not isinstance(selection, dict) or set(selection) != expected_keys:
            return Response({"message": "试卷题目 ID 不完整。"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            selection = {key: int(selection[key]) for key in sorted(expected_keys)}
        except (TypeError, ValueError):
            return Response({"message": "试卷题目 ID 无效。"}, status=status.HTTP_400_BAD_REQUEST)
        _, _, missing_parts = _mock_exam_payload(
            request,
            selection,
            exam_type=exam_type,
            level=level,
        )
        if missing_parts:
            return Response(
                {"message": "试卷题目 ID 无效。", "missing_parts": missing_parts},
                status=status.HTTP_400_BAD_REQUEST,
            )
        answers = request.data.get("answers", {})
        if not isinstance(answers, dict):
            return Response({"message": "答案格式无效。"}, status=status.HTTP_400_BAD_REQUEST)
        writing_grade = str(request.data.get("writing_grade", ""))
        if writing_grade and writing_grade not in {"A", "B", "C", "D"}:
            return Response({"message": "写作等级无效。"}, status=status.HTTP_400_BAD_REQUEST)
        assessment_value = request.data.get("writing_assessment")
        if assessment_value is None:
            writing_assessment = _legacy_writing_assessment(writing_grade)
        else:
            writing_assessment = _normalize_writing_assessment(assessment_value)
            if writing_assessment is None:
                return Response({"message": "写作自评格式无效。"}, status=status.HTTP_400_BAD_REQUEST)
        fingerprint_source = {"exam_type": exam_type.lower(), "level": level, "selection": selection}
        fingerprint = hashlib.sha256(
            json.dumps(fingerprint_source, sort_keys=True, separators=(",", ":")).encode("utf-8")
        ).hexdigest()
        is_completed = bool(request.data.get("is_completed", False))
        if is_completed and not _writing_assessment_is_complete(writing_assessment):
            return Response({"message": "请完成写作自评。"}, status=status.HTTP_400_BAD_REQUEST)
        defaults = {
            "exercise_selection": selection,
            "exam_type": exam_type,
            "level": level,
            "answers": answers,
            "writing_text": str(request.data.get("writing_text", "")),
            "writing_grade": writing_grade,
            "writing_assessment": writing_assessment,
            "is_completed": is_completed,
            "is_favorite": is_completed and bool(request.data.get("is_favorite", True)),
            "progress": request.data.get("progress", {}),
        }
        instance = SavedMockExam.objects.filter(user=request.user, fingerprint=fingerprint).first()
        created = instance is None
        if created:
            paper = _create_mock_exam_paper(
                user=request.user,
                exam_type=exam_type,
                level=level,
                selection=selection,
            )
            instance = SavedMockExam.objects.create(
                user=request.user,
                paper=paper,
                fingerprint=fingerprint,
                **defaults,
            )
        else:
            for field, value in defaults.items():
                setattr(instance, field, value)
        result_fields = []
        if instance.is_completed:
            result_fields = list(_apply_mock_exam_result(instance))
        instance.save(update_fields=[*defaults, *result_fields, "updated_at"])
        return Response(self._summary(instance), status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    @transaction.atomic
    def partial_update(self, request, pk=None):
        instance = get_object_or_404(
            SavedMockExam.objects.select_for_update(),
            pk=pk,
            user=request.user,
        )
        completion_fields = {"answers", "writing_text", "writing_grade", "writing_assessment", "is_completed", "progress"}
        if instance.is_completed and completion_fields.intersection(request.data):
            return Response({"message": "已完成的考试不能再次修改。"}, status=status.HTTP_409_CONFLICT)
        if "is_completed" in request.data:
            return Response({"message": "请使用交卷接口完成考试。"}, status=status.HTTP_400_BAD_REQUEST)
        update_fields = []
        next_writing_assessment = instance.writing_assessment or _legacy_writing_assessment(instance.writing_grade)
        if "writing_assessment" in request.data:
            next_writing_assessment = _normalize_writing_assessment(request.data["writing_assessment"])
            if next_writing_assessment is None:
                return Response({"message": "写作自评格式无效。"}, status=status.HTTP_400_BAD_REQUEST)
        elif "writing_grade" in request.data:
            next_writing_assessment = _legacy_writing_assessment(str(request.data["writing_grade"]))
        if "answers" in request.data:
            if not isinstance(request.data["answers"], dict):
                return Response({"message": "答案格式无效。"}, status=status.HTTP_400_BAD_REQUEST)
            instance.answers = request.data["answers"]
            update_fields.append("answers")
        if "writing_text" in request.data:
            instance.writing_text = str(request.data["writing_text"])
            update_fields.append("writing_text")
        if "writing_grade" in request.data:
            grade = str(request.data["writing_grade"])
            if grade and grade not in {"A", "B", "C", "D"}:
                return Response({"message": "写作等级无效。"}, status=status.HTTP_400_BAD_REQUEST)
            instance.writing_grade = grade
            update_fields.append("writing_grade")
        if "writing_assessment" in request.data:
            instance.writing_assessment = next_writing_assessment
            update_fields.append("writing_assessment")
        if "is_favorite" in request.data:
            next_favorite = bool(request.data["is_favorite"])
            if next_favorite and not instance.is_completed:
                return Response({"message": "完成考试后才能收藏试卷。"}, status=status.HTTP_400_BAD_REQUEST)
            instance.is_favorite = next_favorite
            update_fields.append("is_favorite")
        if "progress" in request.data:
            if not isinstance(request.data["progress"], dict):
                return Response({"message": "考试进度格式无效。"}, status=status.HTTP_400_BAD_REQUEST)
            instance.progress = request.data["progress"]
            update_fields.append("progress")
        if update_fields:
            instance.save(update_fields=[*dict.fromkeys(update_fields), "updated_at"])
        return Response(self._summary(instance))

    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        with transaction.atomic():
            instance = get_object_or_404(
                SavedMockExam.objects.select_for_update().select_related("paper"),
                pk=pk,
                user=request.user,
            )
            if instance.is_completed:
                return Response({"message": "该考试已经交卷。"}, status=status.HTTP_409_CONFLICT)

            answers = request.data.get("answers", instance.answers)
            if not isinstance(answers, dict):
                return Response({"message": "答案格式无效。"}, status=status.HTTP_400_BAD_REQUEST)
            assessment_value = request.data.get("writing_assessment", instance.writing_assessment)
            writing_assessment = _normalize_writing_assessment(assessment_value)
            if writing_assessment is None:
                return Response({"message": "写作自评格式无效。"}, status=status.HTTP_400_BAD_REQUEST)
            if not _writing_assessment_is_complete(writing_assessment):
                return Response({"message": "请完成写作自评。"}, status=status.HTTP_400_BAD_REQUEST)
            progress = request.data.get("progress", instance.progress)
            if not isinstance(progress, dict):
                return Response({"message": "考试进度格式无效。"}, status=status.HTTP_400_BAD_REQUEST)

            instance.answers = answers
            instance.writing_text = str(request.data.get("writing_text", instance.writing_text))
            instance.writing_assessment = writing_assessment
            instance.progress = progress
            instance.is_completed = True
            if "is_favorite" in request.data:
                instance.is_favorite = bool(request.data["is_favorite"])
            result_fields = list(_apply_mock_exam_result(instance))
            instance.save(update_fields=[
                "answers",
                "writing_text",
                "writing_assessment",
                "progress",
                "is_completed",
                "is_favorite",
                *result_fields,
                "updated_at",
            ])
        return Response(self._summary(instance))

    def destroy(self, request, pk=None):
        instance = get_object_or_404(SavedMockExam, pk=pk, user=request.user)
        instance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"])
    def share(self, request, pk=None):
        instance = get_object_or_404(
            SavedMockExam.objects.select_related("paper"),
            pk=pk,
            user=request.user,
        )
        share_mode = request.data.get("share_mode", MockExamShare.ShareMode.PAPER)
        if share_mode not in MockExamShare.ShareMode.values:
            return Response({"message": "分享类型无效。"}, status=status.HTTP_400_BAD_REQUEST)
        if share_mode == MockExamShare.ShareMode.PAPER_WITH_ANSWERS and not instance.is_completed:
            return Response({"message": "完成考试后才能分享答案。"}, status=status.HTTP_400_BAD_REQUEST)
        shared, _ = MockExamShare.objects.get_or_create(
            attempt=instance,
            share_mode=share_mode,
            defaults={
                "owner": request.user,
                "paper": instance.paper,
            },
        )
        if not shared.is_active:
            shared.is_active = True
            shared.save(update_fields=["is_active", "updated_at"])
        return Response(MockExamShareViewSet.summary(shared), status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def retake(self, request, pk=None):
        source = get_object_or_404(SavedMockExam.objects.select_related("paper"), pk=pk, user=request.user)
        _, _, missing_parts = _mock_exam_payload(
            request,
            source.paper.exercise_selection,
            exam_type=source.paper.exam_type,
            level=source.paper.level,
        )
        if missing_parts:
            return Response(
                {"message": "原试卷中的部分题目已不存在。", "missing_parts": missing_parts},
                status=status.HTTP_409_CONFLICT,
            )
        attempt = SavedMockExam.objects.create(
            user=request.user,
            paper=source.paper,
            fingerprint=uuid.uuid4().hex,
            exam_type=source.paper.exam_type,
            level=source.paper.level,
            exercise_selection=source.paper.exercise_selection,
            progress=_new_mock_exam_progress(),
        )
        return Response(self._summary(attempt), status=status.HTTP_201_CREATED)


class MockExamShareViewSet(ViewSet):
    """Expose explicitly shared mock papers without exposing owner identity."""

    permission_classes = [IsAuthenticated, HasExamPreparationReleaseAccess, HasValidEntitlement]
    required_module_key = "exam_preparation"
    lookup_field = "share_code"
    lookup_value_regex = r"MS-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{12}"

    @staticmethod
    def summary(instance):
        return {
            "share_code": instance.share_code,
            "share_mode": instance.share_mode,
            "paper_code": instance.paper.code,
            "exam_type": instance.paper.exam_type,
            "level": instance.paper.level,
            "is_active": instance.is_active,
            "created_at": instance.created_at,
            "updated_at": instance.updated_at,
        }

    def list(self, request):
        queryset = MockExamShare.objects.select_related("paper").filter(owner=request.user)
        return Response({"count": queryset.count(), "results": [self.summary(item) for item in queryset]})

    def retrieve(self, request, share_code=None):
        shared = get_object_or_404(
            MockExamShare.objects.select_related("paper", "attempt"),
            share_code=share_code,
            is_active=True,
            paper__is_active=True,
        )
        payload, _, missing_parts = _mock_exam_payload(
            request,
            shared.paper.exercise_selection,
            exam_type=shared.paper.exam_type,
            level=shared.paper.level,
            show_listening_scripts=(
                shared.share_mode == MockExamShare.ShareMode.PAPER_WITH_ANSWERS
                and shared.attempt.is_completed
            ),
        )
        if missing_parts:
            return Response(
                {"message": "分享试卷中的部分题目已不存在。", "missing_parts": missing_parts},
                status=status.HTTP_409_CONFLICT,
            )
        payload["selection"] = shared.paper.exercise_selection
        payload["paper_code"] = shared.paper.code
        response_data = {**self.summary(shared), "exam": payload}
        if shared.share_mode == MockExamShare.ShareMode.PAPER_WITH_ANSWERS:
            response_data["shared_attempt"] = SavedMockExamViewSet._summary(shared.attempt)
        return Response(response_data)

    def destroy(self, request, share_code=None):
        shared = get_object_or_404(MockExamShare, share_code=share_code, owner=request.user)
        shared.is_active = False
        shared.save(update_fields=["is_active", "updated_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"])
    def start(self, request, share_code=None):
        shared = get_object_or_404(
            MockExamShare.objects.select_related("paper"),
            share_code=share_code,
            is_active=True,
            paper__is_active=True,
        )
        payload, selection, missing_parts = _mock_exam_payload(
            request,
            shared.paper.exercise_selection,
            exam_type=shared.paper.exam_type,
            level=shared.paper.level,
        )
        if missing_parts:
            return Response(
                {"message": "分享试卷中的部分题目已不存在。", "missing_parts": missing_parts},
                status=status.HTTP_409_CONFLICT,
            )
        progress = _new_mock_exam_progress()
        attempt = SavedMockExam.objects.create(
            user=request.user,
            paper=shared.paper,
            fingerprint=uuid.uuid4().hex,
            exam_type=shared.paper.exam_type,
            level=shared.paper.level,
            exercise_selection=selection,
            progress=progress,
        )
        payload["selection"] = selection
        payload["attempt_id"] = attempt.pk
        payload["paper_code"] = shared.paper.code
        payload["progress"] = progress
        return Response(payload, status=status.HTTP_201_CREATED)


class ExerciseBaseViewSet(BaseExamPreparationViewSet):
    queryset = ExerciseBase.objects.all().order_by("level", "exercise_type", "external_id", "id")
    serializer_class = ExerciseBaseSerializer
    filterset_fields = ["exam_type", "level", "skill", "exercise_type", "difficulty", "is_real_exam", "creation_method"]
    search_fields = ["exam_type", "external_id", "title", "source_name", "source_reference", "imported_from_file"]
    ordering_fields = ["id", "exam_type", "level", "exercise_type", "external_id", "created_at", "updated_at"]


class ListeningExerciseViewSet(BaseExamPreparationViewSet):
    trial_access_enabled = True
    queryset = ListeningExercise.objects.select_related("exercise_base").prefetch_related(
        "questions__answer_options",
    ).all()
    serializer_class = ListeningExerciseSerializer
    filterset_fields = ["exercise_base", "listening_type"]
    search_fields = ["audio_file_identifier", "audio_file_url", "script", "exercise_base__external_id", "exercise_base__title"]
    ordering_fields = ["id", "created_at", "updated_at"]

    def get_serializer_class(self):
        if self.action == "retrieve":
            return ListeningExerciseDetailSerializer
        return super().get_serializer_class()


class ListeningQuestionViewSet(BaseExamPreparationViewSet):
    queryset = ListeningQuestion.objects.select_related("listening_exercise", "listening_exercise__exercise_base").all()
    serializer_class = ListeningQuestionSerializer
    filterset_fields = ["listening_exercise", "question_type", "question_number"]
    search_fields = ["question_text", "listening_exercise__exercise_base__external_id", "listening_exercise__exercise_base__title"]
    ordering_fields = ["id", "question_number", "created_at", "updated_at"]


class ListeningAnswerOptionViewSet(BaseExamPreparationViewSet):
    queryset = ListeningAnswerOption.objects.select_related(
        "question",
        "question__listening_exercise",
        "question__listening_exercise__exercise_base",
    ).all()
    serializer_class = ListeningAnswerOptionSerializer
    filterset_fields = ["question", "is_correct", "option_key"]
    search_fields = ["option_text", "explanation", "question__question_text"]
    ordering_fields = ["id", "sort_order", "created_at", "updated_at"]


class ReadingTitleMatchingExerciseViewSet(BaseExamPreparationViewSet):
    trial_access_enabled = True
    queryset = ReadingTitleMatchingExercise.objects.select_related("exercise_base").prefetch_related(
        "options",
        "items__correct_option",
    ).all()
    serializer_class = ReadingTitleMatchingExerciseSerializer
    filterset_fields = ["exercise_base"]
    search_fields = ["instruction", "exercise_base__external_id", "exercise_base__title"]
    ordering_fields = ["id", "created_at", "updated_at"]

    def get_serializer_class(self):
        if self.action == "retrieve":
            return ReadingTitleMatchingExerciseDetailSerializer
        return super().get_serializer_class()


class ReadingTitleMatchingItemViewSet(BaseExamPreparationViewSet):
    queryset = ReadingTitleMatchingItem.objects.select_related(
        "exercise",
        "exercise__exercise_base",
        "correct_option",
    ).all()
    serializer_class = ReadingTitleMatchingItemSerializer
    filterset_fields = ["exercise", "correct_option", "item_number"]
    search_fields = ["text", "explanation", "exercise__exercise_base__external_id", "exercise__exercise_base__title"]
    ordering_fields = ["id", "item_number", "created_at", "updated_at"]


class ReadingTitleMatchingOptionViewSet(BaseExamPreparationViewSet):
    queryset = ReadingTitleMatchingOption.objects.select_related("exercise", "exercise__exercise_base").all()
    serializer_class = ReadingTitleMatchingOptionSerializer
    filterset_fields = ["exercise", "option_key"]
    search_fields = ["option_text", "exercise__exercise_base__external_id", "exercise__exercise_base__title"]
    ordering_fields = ["id", "option_order", "created_at", "updated_at"]


class ReadingUnderstandingExerciseViewSet(BaseExamPreparationViewSet):
    trial_access_enabled = True
    queryset = ReadingUnderstandingExercise.objects.select_related("exercise_base").prefetch_related(
        "questions__answer_options",
    ).all()
    serializer_class = ReadingUnderstandingExerciseSerializer
    filterset_fields = ["exercise_base"]
    search_fields = ["text_markdown", "exercise_base__external_id", "exercise_base__title"]
    ordering_fields = ["id", "created_at", "updated_at"]

    def get_serializer_class(self):
        if self.action == "retrieve":
            return ReadingUnderstandingExerciseDetailSerializer
        return super().get_serializer_class()


class ReadingUnderstandingQuestionViewSet(BaseExamPreparationViewSet):
    queryset = ReadingUnderstandingQuestion.objects.select_related("exercise", "exercise__exercise_base").all()
    serializer_class = ReadingUnderstandingQuestionSerializer
    filterset_fields = ["exercise", "question_number"]
    search_fields = ["question_text", "exercise__exercise_base__external_id", "exercise__exercise_base__title"]
    ordering_fields = ["id", "question_number", "created_at", "updated_at"]


class ReadingUnderstandingAnswerOptionViewSet(BaseExamPreparationViewSet):
    queryset = ReadingUnderstandingAnswerOption.objects.select_related(
        "question",
        "question__exercise",
        "question__exercise__exercise_base",
    ).all()
    serializer_class = ReadingUnderstandingAnswerOptionSerializer
    filterset_fields = ["question", "is_correct", "option_key"]
    search_fields = ["option_text", "explanation", "question__question_text"]
    ordering_fields = ["id", "sort_order", "created_at", "updated_at"]


class ReadingAdMatchingExerciseViewSet(BaseExamPreparationViewSet):
    trial_access_enabled = True
    queryset = ReadingAdMatchingExercise.objects.select_related("exercise_base").prefetch_related(
        "ads",
        "items__correct_ad",
    ).all()
    serializer_class = ReadingAdMatchingExerciseSerializer
    filterset_fields = ["exercise_base"]
    search_fields = ["instruction", "exercise_base__external_id", "exercise_base__title"]
    ordering_fields = ["id", "created_at", "updated_at"]

    def get_serializer_class(self):
        if self.action == "retrieve":
            return ReadingAdMatchingExerciseDetailSerializer
        return super().get_serializer_class()


class ReadingAdMatchingItemViewSet(BaseExamPreparationViewSet):
    queryset = ReadingAdMatchingItem.objects.select_related(
        "exercise",
        "exercise__exercise_base",
        "correct_ad",
    ).all()
    serializer_class = ReadingAdMatchingItemSerializer
    filterset_fields = ["exercise", "correct_ad", "item_number"]
    search_fields = ["item_text", "explanation", "exercise__exercise_base__external_id", "exercise__exercise_base__title"]
    ordering_fields = ["id", "item_number", "created_at", "updated_at"]


class ReadingAdMatchingAdViewSet(BaseExamPreparationViewSet):
    queryset = ReadingAdMatchingAd.objects.select_related("exercise", "exercise__exercise_base").all()
    serializer_class = ReadingAdMatchingAdSerializer
    filterset_fields = ["exercise", "ad_key", "is_no_match_option"]
    search_fields = ["ad_text_markdown", "exercise__exercise_base__external_id", "exercise__exercise_base__title"]
    ordering_fields = ["id", "ad_order", "created_at", "updated_at"]


class ClozeChoiceExerciseViewSet(BaseExamPreparationViewSet):
    trial_access_enabled = True
    queryset = ClozeChoiceExercise.objects.select_related("exercise_base").prefetch_related(
        "blanks__options",
    ).all()
    serializer_class = ClozeChoiceExerciseSerializer
    filterset_fields = ["exercise_base"]
    search_fields = ["content_with_placeholders", "original_source_text", "exercise_base__external_id", "exercise_base__title"]
    ordering_fields = ["id", "created_at", "updated_at"]

    def get_serializer_class(self):
        if self.action == "retrieve":
            return ClozeChoiceExerciseDetailSerializer
        return super().get_serializer_class()


class ClozeChoiceBlankViewSet(BaseExamPreparationViewSet):
    queryset = ClozeChoiceBlank.objects.select_related("exercise", "exercise__exercise_base").all()
    serializer_class = ClozeChoiceBlankSerializer
    filterset_fields = ["exercise", "blank_key", "blank_number"]
    search_fields = ["blank_key", "exercise__exercise_base__external_id", "exercise__exercise_base__title"]
    ordering_fields = ["id", "blank_number", "created_at", "updated_at"]


class ClozeChoiceOptionViewSet(BaseExamPreparationViewSet):
    queryset = ClozeChoiceOption.objects.select_related("blank", "blank__exercise", "blank__exercise__exercise_base").all()
    serializer_class = ClozeChoiceOptionSerializer
    filterset_fields = ["blank", "option_key", "is_correct"]
    search_fields = ["option_text", "explanation", "blank__blank_key", "blank__exercise__exercise_base__external_id"]
    ordering_fields = ["id", "sort_order", "created_at", "updated_at"]


class ClozeMatchingExerciseViewSet(BaseExamPreparationViewSet):
    trial_access_enabled = True
    queryset = ClozeMatchingExercise.objects.select_related("exercise_base").prefetch_related(
        "options",
        "blank_answers__correct_option",
    ).all()
    serializer_class = ClozeMatchingExerciseSerializer
    filterset_fields = ["exercise_base"]
    search_fields = ["content_with_placeholders", "original_source_text", "exercise_base__external_id", "exercise_base__title"]
    ordering_fields = ["id", "created_at", "updated_at"]

    def get_serializer_class(self):
        if self.action == "retrieve":
            return ClozeMatchingExerciseDetailSerializer
        return super().get_serializer_class()


class ClozeMatchingOptionViewSet(BaseExamPreparationViewSet):
    queryset = ClozeMatchingOption.objects.select_related("exercise", "exercise__exercise_base").all()
    serializer_class = ClozeMatchingOptionSerializer
    filterset_fields = ["exercise", "option_key", "is_extra"]
    search_fields = ["option_text", "exercise__exercise_base__external_id", "exercise__exercise_base__title"]
    ordering_fields = ["id", "option_order", "created_at", "updated_at"]


class ClozeMatchingBlankAnswerViewSet(BaseExamPreparationViewSet):
    queryset = ClozeMatchingBlankAnswer.objects.select_related(
        "exercise",
        "exercise__exercise_base",
        "correct_option",
    ).all()
    serializer_class = ClozeMatchingBlankAnswerSerializer
    filterset_fields = ["exercise", "blank_key", "blank_number", "correct_option"]
    search_fields = ["blank_key", "explanation", "exercise__exercise_base__external_id", "exercise__exercise_base__title"]
    ordering_fields = ["id", "blank_number", "created_at", "updated_at"]


class WritingExerciseViewSet(BaseExamPreparationViewSet):
    trial_access_enabled = True
    queryset = WritingExercise.objects.select_related("exercise_base").prefetch_related("example_texts").all()
    serializer_class = WritingExerciseSerializer
    filterset_fields = ["exercise_base", "time_limit_minutes", "words_limit"]
    search_fields = ["request_text", "task_text", "exercise_base__external_id", "exercise_base__title"]
    ordering_fields = ["id", "time_limit_minutes", "words_limit", "created_at", "updated_at"]

    def get_serializer_class(self):
        if self.action == "retrieve":
            return WritingExerciseDetailSerializer
        return super().get_serializer_class()


class WritingExampleTextViewSet(BaseExamPreparationViewSet):
    queryset = WritingExampleText.objects.select_related("writing_exercise", "writing_exercise__exercise_base").all()
    serializer_class = WritingExampleTextSerializer
    filterset_fields = ["writing_exercise", "label", "sort_order"]
    search_fields = ["label", "note", "example_text", "writing_exercise__exercise_base__external_id"]
    ordering_fields = ["id", "sort_order", "created_at", "updated_at"]


class SpeakingTeilExerciseViewSet(BaseExamPreparationViewSet):
    trial_access_enabled = True
    queryset = SpeakingTeilExercise.objects.select_related("exercise_base").all()
    serializer_class = SpeakingTeilExerciseSerializer
    filterset_fields = ["exercise_base", "exercise_base__exercise_type"]
    search_fields = ["instruction", "exercise_base__external_id", "exercise_base__title"]
    ordering_fields = ["id", "created_at", "updated_at"]

    def get_permissions(self):
        if self.action == "turn_audio":
            return [IsAuthenticated(), HasExamPreparationReleaseAccess(), IsAdminOrReadOnly()]
        return super().get_permissions()

    @action(detail=True, methods=["get"], url_path=r"turn-audio/(?P<sequence>[0-9]+)")
    def turn_audio(self, request, pk=None, sequence=None):
        exercise = self.get_object()
        if not user_can_access_exercise(request.user, exercise):
            raise PermissionDenied({
                "message": "购买备考季后可解锁该题目。",
                "code": "exam_preparation_purchase_required",
            })
        turn = next(
            (turn for turn in (exercise.content or {}).get("dialogue", [])
             if str(turn.get("sequence")) == sequence),
            None,
        )
        if turn is None:
            raise NotFound("Dialogue turn not found")
        audio_url = get_speaking_turn_audio_url(exercise, turn)
        if not audio_url:
            raise NotFound("Dialogue audio not available")
        return Response({"exercise_id": exercise.pk, "turn_id": int(sequence), "audio_url": audio_url})


class UserExerciseFavoriteViewSet(BaseExamPreparationViewSet):
    queryset = UserExerciseFavorite.objects.select_related("user", "exercise").all()
    serializer_class = UserExerciseFavoriteSerializer
    permission_classes = [
        IsAuthenticated,
        HasExamPreparationReleaseAccess,
        HasValidEntitlement,
    ]
    filterset_fields = ["exercise"]
    search_fields = ["exercise__exam_type", "exercise__external_id", "exercise__title"]
    ordering_fields = ["id", "created_at"]
    ordering = ["-created_at", "id"]

    def get_queryset(self):
        return super().get_queryset().filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class FavoriteQuestionViewSet(ViewSet):
    """Return every favorited exam-preparation item in one normalized list."""

    permission_classes = [
        IsAuthenticated,
        HasExamPreparationReleaseAccess,
        HasValidEntitlement,
    ]
    required_module_key = "exam_preparation"

    @staticmethod
    def _preview_text(value, limit=700):
        text = str(value or "")
        return text if len(text) <= limit else f"{text[:limit].rstrip()}…"

    @staticmethod
    def _option_summary(options, limit=6):
        texts = [str(option.option_text or "").strip() for option in options]
        texts = [text for text in texts if text]
        if not texts:
            return ""
        visible = texts[:limit]
        suffix = " …" if len(texts) > limit else ""
        return f"可选项：{' · '.join(visible)}{suffix}"

    @staticmethod
    def _blank_excerpt(content, blank_key, blank_number, limit=420):
        marker = f"【第 {blank_number} 空】"
        normalized_target = str(blank_key or "").strip().lower()

        def replace_placeholder(match):
            placeholder_key = match.group(1).strip().lower()
            return marker if placeholder_key == normalized_target else "____"

        rendered = re.sub(r"\{\{\s*([^{}]+?)\s*\}\}", replace_placeholder, str(content or ""))
        rendered = re.sub(r"\s+", " ", rendered).strip()
        if not rendered:
            return marker
        if marker not in rendered:
            return f"{marker} · {FavoriteQuestionViewSet._preview_text(rendered, limit)}"
        if len(rendered) <= limit:
            return rendered

        marker_index = rendered.index(marker)
        half_window = max(80, (limit - len(marker)) // 2)
        start = max(0, marker_index - half_window)
        end = min(len(rendered), marker_index + len(marker) + half_window)
        excerpt = rendered[start:end].strip()
        if start > 0:
            excerpt = f"…{excerpt}"
        if end < len(rendered):
            excerpt = f"{excerpt}…"
        return excerpt

    @staticmethod
    def _base_payload(state, exercise_base, *, state_type, target_field, target_id, exercise_id, href):
        return {
            "id": f"{state_type}:{state.pk}",
            "state_type": state_type,
            "state_id": state.pk,
            "target_field": target_field,
            "target_id": target_id,
            "exercise_id": exercise_id,
            "exercise_base_id": exercise_base.pk,
            "exercise_type": exercise_base.exercise_type,
            "skill": exercise_base.skill,
            "level": exercise_base.level,
            "exam_type": exercise_base.exam_type,
            "external_id": exercise_base.external_id,
            "title": exercise_base.title,
            "is_real_exam": exercise_base.is_real_exam,
            "difficulty": exercise_base.difficulty,
            "href": href,
            "updated_at": state.updated_at,
        }

    def list(self, request):
        user = request.user
        items = []

        listening_states = UserListeningQuestionState.objects.filter(
            user=user,
            is_favorited=True,
        ).select_related(
            "question__listening_exercise__exercise_base",
        ).prefetch_related("question__answer_options")
        listening_routes = {
            "short_text_true_false_with_prep": "short-text-prep",
            "short_text_true_false_once": "short-text-once",
            "dialog_true_false_twice": "dialog-twice",
        }
        for state in listening_states:
            question = state.question
            exercise = question.listening_exercise
            exercise_base = exercise.exercise_base
            route = listening_routes.get(exercise.listening_type, "short-text-prep")
            payload = self._base_payload(
                state,
                exercise_base,
                state_type="listening_question",
                target_field="question",
                target_id=question.pk,
                exercise_id=exercise.pk,
                href=f"/modules/exam-preparation/hoeren/{route}/{exercise.pk}",
            )
            payload.update(
                question_label=f"听力选择 · 第 {question.question_number} 题",
                question_text=question.question_text,
                context_text=self._option_summary(question.answer_options.all()),
            )
            items.append(payload)

        reading_understanding_states = UserReadingUnderstandingQuestionState.objects.filter(
            user=user,
            is_favorited=True,
        ).select_related(
            "question__exercise__exercise_base",
        ).prefetch_related("question__answer_options")
        for state in reading_understanding_states:
            question = state.question
            exercise = question.exercise
            payload = self._base_payload(
                state,
                exercise.exercise_base,
                state_type="reading_understanding_question",
                target_field="question",
                target_id=question.pk,
                exercise_id=exercise.pk,
                href=f"/modules/exam-preparation/lesen/understanding/{exercise.pk}",
            )
            payload.update(
                question_label=f"阅读理解 · 第 {question.question_number} 题",
                question_text=question.question_text,
                context_text=self._option_summary(question.answer_options.all()),
            )
            items.append(payload)

        reading_title_states = UserReadingTitleMatchingItemState.objects.filter(
            user=user,
            is_favorited=True,
        ).select_related("item__exercise__exercise_base")
        for state in reading_title_states:
            item = state.item
            exercise = item.exercise
            payload = self._base_payload(
                state,
                exercise.exercise_base,
                state_type="reading_title_matching_item",
                target_field="item",
                target_id=item.pk,
                exercise_id=exercise.pk,
                href=f"/modules/exam-preparation/lesen/title-matching/{exercise.pk}",
            )
            payload.update(
                question_label=f"标题匹配 · 第 {item.item_number} 段",
                question_text=item.text,
                context_text="为这段文字选择最合适的标题。",
            )
            items.append(payload)

        reading_ad_states = UserReadingAdMatchingItemState.objects.filter(
            user=user,
            is_favorited=True,
        ).select_related("item__exercise__exercise_base")
        for state in reading_ad_states:
            item = state.item
            exercise = item.exercise
            payload = self._base_payload(
                state,
                exercise.exercise_base,
                state_type="reading_ad_matching_item",
                target_field="item",
                target_id=item.pk,
                exercise_id=exercise.pk,
                href=f"/modules/exam-preparation/lesen/ad-matching/{exercise.pk}",
            )
            payload.update(
                question_label=f"广告匹配 · 情境 {item.item_number}",
                question_text=item.item_text,
                context_text="为这个人物情境寻找最合适的广告。",
            )
            items.append(payload)

        cloze_choice_states = UserClozeChoiceBlankState.objects.filter(
            user=user,
            is_favorited=True,
        ).select_related(
            "blank__exercise__exercise_base",
        ).prefetch_related("blank__options")
        for state in cloze_choice_states:
            blank = state.blank
            exercise = blank.exercise
            payload = self._base_payload(
                state,
                exercise.exercise_base,
                state_type="cloze_choice_blank",
                target_field="blank",
                target_id=blank.pk,
                exercise_id=exercise.pk,
                href=f"/modules/exam-preparation/sprachbausteine/cloze-choice/{exercise.pk}",
            )
            payload.update(
                question_label=f"单选完形 · 第 {blank.blank_number} 空",
                question_text=self._blank_excerpt(
                    exercise.content_with_placeholders,
                    blank.blank_key,
                    blank.blank_number,
                ),
                context_text=self._option_summary(blank.options.all()),
            )
            items.append(payload)

        cloze_matching_states = UserClozeMatchingBlankState.objects.filter(
            user=user,
            is_favorited=True,
        ).select_related(
            "blank__exercise__exercise_base",
        ).prefetch_related("blank__exercise__options")
        for state in cloze_matching_states:
            blank = state.blank
            exercise = blank.exercise
            payload = self._base_payload(
                state,
                exercise.exercise_base,
                state_type="cloze_matching_blank",
                target_field="blank",
                target_id=blank.pk,
                exercise_id=exercise.pk,
                href=f"/modules/exam-preparation/sprachbausteine/cloze-matching/{exercise.pk}",
            )
            payload.update(
                question_label=f"选项池完形 · 第 {blank.blank_number} 空",
                question_text=self._blank_excerpt(
                    exercise.content_with_placeholders,
                    blank.blank_key,
                    blank.blank_number,
                ),
                context_text=self._option_summary(exercise.options.all()),
            )
            items.append(payload)

        writing_states = UserWritingExerciseState.objects.filter(
            user=user,
            is_favorited=True,
        ).select_related("exercise__exercise_base")
        for state in writing_states:
            exercise = state.exercise
            payload = self._base_payload(
                state,
                exercise.exercise_base,
                state_type="writing_exercise",
                target_field="exercise",
                target_id=exercise.pk,
                exercise_id=exercise.pk,
                href=f"/modules/exam-preparation/schreiben/{exercise.pk}",
            )
            payload.update(
                question_label="写作题",
                question_text=exercise.request_text or exercise.task_text,
                context_text=self._preview_text(exercise.task_text),
            )
            items.append(payload)

        writing_example_states = UserWritingExampleTextState.objects.filter(
            user=user,
            is_favorited=True,
        ).select_related(
            "example_text__writing_exercise__exercise_base",
        )
        for state in writing_example_states:
            example = state.example_text
            exercise = example.writing_exercise
            payload = self._base_payload(
                state,
                exercise.exercise_base,
                state_type="writing_example_text",
                target_field="example_text",
                target_id=example.pk,
                exercise_id=exercise.pk,
                href=f"/modules/exam-preparation/schreiben/{exercise.pk}",
            )
            payload.update(
                question_label=example.label or f"Beispieltext {example.sort_order + 1}",
                question_text=self._preview_text(example.example_text),
                context_text=self._preview_text(example.note),
            )
            items.append(payload)

        speaking_turn_states = UserSpeakingTurnState.objects.filter(
            user=user,
            is_favorited=True,
        ).select_related("exercise__exercise_base")
        for state in speaking_turn_states:
            exercise = state.exercise
            exercise_base = exercise.exercise_base
            content = exercise.content or {}
            all_turns = content.get("dialogue") or []
            turn = next(
                (
                    item for item in all_turns
                    if str(item.get("sequence")) == str(state.turn_key).split(":")[-1]
                ),
                {},
            )
            teil = str(content.get("teil") or "1")
            payload = self._base_payload(
                state,
                exercise_base,
                state_type="speaking_turn",
                target_field="exercise",
                target_id=exercise.pk,
                exercise_id=exercise.pk,
                href=f"/modules/exam-preparation/sprechen/teil-{teil}/{exercise.pk}",
            )
            payload["turn_key"] = state.turn_key
            payload.update(
                question_label=f"口语对话 · {turn.get('role') or 'TN'}",
                question_text=self._preview_text(turn.get("text")),
                context_text="跟读并练习这句对话。",
            )
            items.append(payload)

        items.sort(key=lambda item: item["updated_at"], reverse=True)
        return Response({"count": len(items), "results": items})


class UserListeningQuestionStateViewSet(BaseUserExerciseStateViewSet):
    queryset = UserListeningQuestionState.objects.select_related(
        "user",
        "question",
        "question__listening_exercise",
        "question__listening_exercise__exercise_base",
    ).all()
    serializer_class = UserListeningQuestionStateSerializer
    state_lookup_field = "question"
    filterset_fields = ["question", "question__listening_exercise", "is_favorited", "is_correct"]
    search_fields = [
        "question__question_text",
        "question__listening_exercise__exercise_base__external_id",
        "question__listening_exercise__exercise_base__title",
    ]
    ordering_fields = ["id", "last_answered_at", "created_at", "updated_at"]


class UserReadingUnderstandingQuestionStateViewSet(BaseUserExerciseStateViewSet):
    queryset = UserReadingUnderstandingQuestionState.objects.select_related(
        "user",
        "question",
        "question__exercise",
        "question__exercise__exercise_base",
    ).all()
    serializer_class = UserReadingUnderstandingQuestionStateSerializer
    state_lookup_field = "question"
    filterset_fields = ["question", "question__exercise", "is_favorited", "is_correct"]
    search_fields = [
        "question__question_text",
        "question__exercise__exercise_base__external_id",
        "question__exercise__exercise_base__title",
    ]
    ordering_fields = ["id", "last_answered_at", "created_at", "updated_at"]


class UserReadingTitleMatchingItemStateViewSet(BaseUserExerciseStateViewSet):
    queryset = UserReadingTitleMatchingItemState.objects.select_related(
        "user",
        "item",
        "item__exercise",
        "item__exercise__exercise_base",
        "item__correct_option",
    ).all()
    serializer_class = UserReadingTitleMatchingItemStateSerializer
    state_lookup_field = "item"
    filterset_fields = ["item", "item__exercise", "is_favorited", "is_correct"]
    search_fields = [
        "item__text",
        "item__exercise__exercise_base__external_id",
        "item__exercise__exercise_base__title",
    ]
    ordering_fields = ["id", "last_answered_at", "created_at", "updated_at"]


class UserReadingAdMatchingItemStateViewSet(BaseUserExerciseStateViewSet):
    queryset = UserReadingAdMatchingItemState.objects.select_related(
        "user",
        "item",
        "item__exercise",
        "item__exercise__exercise_base",
        "item__correct_ad",
    ).all()
    serializer_class = UserReadingAdMatchingItemStateSerializer
    state_lookup_field = "item"
    filterset_fields = ["item", "item__exercise", "is_favorited", "is_correct"]
    search_fields = [
        "item__item_text",
        "item__exercise__exercise_base__external_id",
        "item__exercise__exercise_base__title",
    ]
    ordering_fields = ["id", "last_answered_at", "created_at", "updated_at"]


class UserClozeChoiceBlankStateViewSet(BaseUserExerciseStateViewSet):
    queryset = UserClozeChoiceBlankState.objects.select_related(
        "user",
        "blank",
        "blank__exercise",
        "blank__exercise__exercise_base",
    ).all()
    serializer_class = UserClozeChoiceBlankStateSerializer
    state_lookup_field = "blank"
    filterset_fields = ["blank", "blank__exercise", "is_favorited", "is_correct"]
    search_fields = [
        "blank__blank_key",
        "blank__exercise__exercise_base__external_id",
        "blank__exercise__exercise_base__title",
    ]
    ordering_fields = ["id", "last_answered_at", "created_at", "updated_at"]


class UserClozeMatchingBlankStateViewSet(BaseUserExerciseStateViewSet):
    queryset = UserClozeMatchingBlankState.objects.select_related(
        "user",
        "blank",
        "blank__exercise",
        "blank__exercise__exercise_base",
        "blank__correct_option",
    ).all()
    serializer_class = UserClozeMatchingBlankStateSerializer
    state_lookup_field = "blank"
    filterset_fields = ["blank", "blank__exercise", "is_favorited", "is_correct"]
    search_fields = [
        "blank__blank_key",
        "blank__exercise__exercise_base__external_id",
        "blank__exercise__exercise_base__title",
    ]
    ordering_fields = ["id", "last_answered_at", "created_at", "updated_at"]


class UserWritingExerciseStateViewSet(BaseUserExerciseStateViewSet):
    queryset = UserWritingExerciseState.objects.select_related(
        "user",
        "exercise",
        "exercise__exercise_base",
    ).all()
    serializer_class = UserWritingExerciseStateSerializer
    state_lookup_field = "exercise"
    filterset_fields = ["exercise", "is_favorited", "is_correct"]
    search_fields = [
        "exercise__exercise_base__external_id",
        "exercise__exercise_base__title",
        "exercise__request_text",
        "exercise__task_text",
    ]
    ordering_fields = ["id", "last_answered_at", "created_at", "updated_at"]


class UserWritingExampleTextStateViewSet(BaseUserExerciseStateViewSet):
    queryset = UserWritingExampleTextState.objects.select_related(
        "user",
        "example_text",
        "example_text__writing_exercise",
        "example_text__writing_exercise__exercise_base",
    ).all()
    serializer_class = UserWritingExampleTextStateSerializer
    state_lookup_field = "example_text"
    filterset_fields = ["example_text", "example_text__writing_exercise", "is_favorited"]
    search_fields = [
        "example_text__label",
        "example_text__example_text",
        "example_text__writing_exercise__exercise_base__external_id",
        "example_text__writing_exercise__exercise_base__title",
    ]
    ordering_fields = ["id", "created_at", "updated_at"]


class UserSpeakingTurnStateViewSet(BaseUserExerciseStateViewSet):
    queryset = UserSpeakingTurnState.objects.select_related(
        "user", "exercise", "exercise__exercise_base"
    ).all()
    serializer_class = UserSpeakingTurnStateSerializer
    state_lookup_fields = ("exercise", "turn_key")
    filterset_fields = ["exercise", "turn_key", "is_favorited", "is_correct"]
    search_fields = ["turn_key", "exercise__exercise_base__external_id", "exercise__exercise_base__title"]
    ordering_fields = ["id", "last_answered_at", "created_at", "updated_at"]

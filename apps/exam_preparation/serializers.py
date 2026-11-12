from __future__ import annotations

from rest_framework import serializers

from apps.exam_preparation.access import (
    get_free_trial_exercise_ids,
    user_has_full_exam_preparation_access,
)
from apps.exam_preparation.speaking_audio import get_speaking_turn_audio_url
from apps.exam_preparation.models import (
    ClozeChoiceBlank,
    ClozeChoiceExercise,
    ClozeChoiceOption,
    ClozeMatchingBlankAnswer,
    ClozeMatchingExercise,
    ClozeMatchingOption,
    ExerciseBase,
    ExamVocabularySource,
    ExamVocabularyCard,
    ExamPreparationGuide,
    ListeningAnswerOption,
    ListeningExercise,
    ListeningQuestion,
    ReadingAdMatchingAd,
    ReadingAdMatchingExercise,
    ReadingAdMatchingItem,
    ReadingTitleMatchingExercise,
    ReadingTitleMatchingItem,
    ReadingTitleMatchingOption,
    ReadingUnderstandingAnswerOption,
    ReadingUnderstandingExercise,
    ReadingUnderstandingQuestion,
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
    UserExamVocabularyFavorite,
)


class TrialAwareExerciseSerializerMixin:
    locked_content_fields = ()

    def _has_full_access(self):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if "has_full_exam_preparation_access" not in self.context:
            self.context["has_full_exam_preparation_access"] = user_has_full_exam_preparation_access(user)
        return self.context["has_full_exam_preparation_access"]

    def get_is_locked(self, exercise):
        if self._has_full_access():
            return False

        exercise_type = exercise.exercise_base.exercise_type
        cache_key = (
            type(exercise),
            exercise.exercise_base.exam_type,
            exercise.exercise_base.level,
            exercise_type,
        )
        free_ids_by_type = self.context.setdefault("free_trial_exercise_ids", {})
        if cache_key not in free_ids_by_type:
            free_ids_by_type[cache_key] = get_free_trial_exercise_ids(exercise)
        return exercise.pk not in free_ids_by_type[cache_key]

    def get_show_free_trial_badge(self, exercise):
        return not self._has_full_access() and not self.get_is_locked(exercise)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if self.get_is_locked(instance):
            for field_name in self.locked_content_fields:
                if field_name in data:
                    if isinstance(data[field_name], dict):
                        data[field_name] = {}
                    elif isinstance(data[field_name], list):
                        data[field_name] = []
                    else:
                        data[field_name] = ""
        return data


class ExerciseBaseSerializer(serializers.ModelSerializer):
    exam_type = serializers.CharField(required=False, default="TELC")
    level = serializers.CharField()

    def validate_exam_type(self, value):
        from apps.exam_preparation.scope import normalize_exam_type

        try:
            return normalize_exam_type(value)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc)) from exc

    def validate_level(self, value):
        from apps.exam_preparation.scope import normalize_exam_level

        try:
            return normalize_exam_level(value)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc)) from exc

    class Meta:
        model = ExerciseBase
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]


class ExamPreparationGuideSerializer(serializers.ModelSerializer):
    badges = serializers.ListField(child=serializers.CharField(), allow_empty=True)
    is_liked = serializers.SerializerMethodField()

    class Meta:
        model = ExamPreparationGuide
        fields = [
            "id",
            "author",
            "cover_url",
            "badges",
            "summary",
            "title",
            "body_markdown",
            "published_at",
            "view_count",
            "like_count",
            "is_published",
            "is_liked",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_is_liked(self, guide):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if not getattr(user, "is_authenticated", False):
            return False
        return guide.user_likes.filter(user=user).exists()


class ListeningExerciseSerializer(TrialAwareExerciseSerializerMixin, serializers.ModelSerializer):
    is_locked = serializers.SerializerMethodField()
    show_free_trial_badge = serializers.SerializerMethodField()
    exercise_base = ExerciseBaseSerializer(read_only=True)
    locked_content_fields = ("audio_file_identifier", "audio_file_url", "script", "content")

    class Meta:
        model = ListeningExercise
        fields = [
            "id",
            "is_locked",
            "show_free_trial_badge",
            "exercise_base",
            "listening_type",
            "audio_file_identifier",
            "audio_file_url",
            "script",
            "content",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["script"] = ""
        return data


class ListeningQuestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ListeningQuestion
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]


class ListeningAnswerOptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ListeningAnswerOption
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]


class ListeningAnswerOptionDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = ListeningAnswerOption
        fields = [
            "id",
            "option_key",
            "option_text",
            "is_correct",
            "explanation",
            "sort_order",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class ListeningQuestionDetailSerializer(serializers.ModelSerializer):
    answer_options = ListeningAnswerOptionDetailSerializer(many=True, read_only=True)

    class Meta:
        model = ListeningQuestion
        fields = [
            "id",
            "question_number",
            "question_key",
            "question_type",
            "question_text",
            "correct_answer",
            "explanation",
            "explanation_scope",
            "created_at",
            "updated_at",
            "answer_options",
        ]
        read_only_fields = fields


class ListeningExerciseDetailSerializer(serializers.ModelSerializer):
    exercise_base = ExerciseBaseSerializer(read_only=True)
    questions = ListeningQuestionDetailSerializer(many=True, read_only=True)
    script = serializers.SerializerMethodField()

    class Meta:
        model = ListeningExercise
        fields = [
            "id",
            "exercise_base",
            "listening_type",
            "audio_file_identifier",
            "audio_file_url",
            "script",
            "content",
            "created_at",
            "updated_at",
            "questions",
        ]
        read_only_fields = fields

    def get_script(self, exercise):
        show_script = self.context.get("show_listening_script")
        if show_script is not None:
            return exercise.script if show_script else ""

        request = self.context.get("request")
        user = getattr(request, "user", None)
        if not getattr(user, "is_authenticated", False):
            return ""

        question_count = exercise.questions.count()
        if question_count == 0:
            return ""
        answered_count = UserListeningQuestionState.objects.filter(
            user=user,
            question__listening_exercise=exercise,
            is_correct__isnull=False,
        ).count()
        return exercise.script if answered_count == question_count else ""


class ReadingTitleMatchingExerciseSerializer(TrialAwareExerciseSerializerMixin, serializers.ModelSerializer):
    is_locked = serializers.SerializerMethodField()
    show_free_trial_badge = serializers.SerializerMethodField()
    exercise_base = ExerciseBaseSerializer(read_only=True)
    locked_content_fields = ("instruction",)

    class Meta:
        model = ReadingTitleMatchingExercise
        fields = [
            "id",
            "is_locked",
            "show_free_trial_badge",
            "exercise_base",
            "instruction",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class ReadingTitleMatchingItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReadingTitleMatchingItem
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]


class ReadingTitleMatchingOptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReadingTitleMatchingOption
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]


class ReadingTitleMatchingItemDetailSerializer(serializers.ModelSerializer):
    correct_option = ReadingTitleMatchingOptionSerializer(read_only=True)

    class Meta:
        model = ReadingTitleMatchingItem
        fields = [
            "id",
            "item_number",
            "text",
            "correct_option",
            "explanation",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class ReadingTitleMatchingExerciseDetailSerializer(serializers.ModelSerializer):
    exercise_base = ExerciseBaseSerializer(read_only=True)
    options = ReadingTitleMatchingOptionSerializer(many=True, read_only=True)
    items = ReadingTitleMatchingItemDetailSerializer(many=True, read_only=True)

    class Meta:
        model = ReadingTitleMatchingExercise
        fields = [
            "id",
            "exercise_base",
            "instruction",
            "created_at",
            "updated_at",
            "options",
            "items",
        ]
        read_only_fields = fields


class ReadingUnderstandingExerciseSerializer(TrialAwareExerciseSerializerMixin, serializers.ModelSerializer):
    is_locked = serializers.SerializerMethodField()
    show_free_trial_badge = serializers.SerializerMethodField()
    exercise_base = ExerciseBaseSerializer(read_only=True)
    locked_content_fields = ("text_markdown",)

    class Meta:
        model = ReadingUnderstandingExercise
        fields = [
            "id",
            "is_locked",
            "show_free_trial_badge",
            "exercise_base",
            "text_markdown",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class ReadingUnderstandingQuestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReadingUnderstandingQuestion
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]


class ReadingUnderstandingAnswerOptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReadingUnderstandingAnswerOption
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]


class ReadingUnderstandingAnswerOptionDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReadingUnderstandingAnswerOption
        fields = [
            "id",
            "option_key",
            "option_text",
            "is_correct",
            "explanation",
            "sort_order",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class ReadingUnderstandingQuestionDetailSerializer(serializers.ModelSerializer):
    answer_options = ReadingUnderstandingAnswerOptionDetailSerializer(many=True, read_only=True)

    class Meta:
        model = ReadingUnderstandingQuestion
        fields = [
            "id",
            "question_number",
            "question_text",
            "explanation",
            "explanation_scope",
            "created_at",
            "updated_at",
            "answer_options",
        ]
        read_only_fields = fields


class ReadingUnderstandingExerciseDetailSerializer(serializers.ModelSerializer):
    exercise_base = ExerciseBaseSerializer(read_only=True)
    questions = ReadingUnderstandingQuestionDetailSerializer(many=True, read_only=True)

    class Meta:
        model = ReadingUnderstandingExercise
        fields = [
            "id",
            "exercise_base",
            "text_markdown",
            "created_at",
            "updated_at",
            "questions",
        ]
        read_only_fields = fields


class ReadingAdMatchingExerciseSerializer(TrialAwareExerciseSerializerMixin, serializers.ModelSerializer):
    is_locked = serializers.SerializerMethodField()
    show_free_trial_badge = serializers.SerializerMethodField()
    exercise_base = ExerciseBaseSerializer(read_only=True)
    locked_content_fields = ("instruction",)

    class Meta:
        model = ReadingAdMatchingExercise
        fields = [
            "id",
            "is_locked",
            "show_free_trial_badge",
            "exercise_base",
            "instruction",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class ReadingAdMatchingItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReadingAdMatchingItem
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]


class ReadingAdMatchingAdSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReadingAdMatchingAd
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]


class ReadingAdMatchingAdDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReadingAdMatchingAd
        fields = [
            "id",
            "ad_key",
            "ad_text_markdown",
            "ad_order",
            "is_no_match_option",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class ReadingAdMatchingItemDetailSerializer(serializers.ModelSerializer):
    correct_ad = ReadingAdMatchingAdDetailSerializer(read_only=True)
    is_version2 = serializers.SerializerMethodField()

    def get_is_version2(self, obj):
        from apps.exam_preparation.mock_exam.telc.reading_ad_matching import is_version2_item_text

        return is_version2_item_text(obj.item_text)

    class Meta:
        model = ReadingAdMatchingItem
        fields = [
            "id",
            "item_number",
            "item_text",
            "is_version2",
            "correct_ad",
            "explanation",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class ReadingAdMatchingExerciseDetailSerializer(serializers.ModelSerializer):
    exercise_base = ExerciseBaseSerializer(read_only=True)
    ads = ReadingAdMatchingAdDetailSerializer(many=True, read_only=True)
    items = ReadingAdMatchingItemDetailSerializer(many=True, read_only=True)

    class Meta:
        model = ReadingAdMatchingExercise
        fields = [
            "id",
            "exercise_base",
            "instruction",
            "created_at",
            "updated_at",
            "ads",
            "items",
        ]
        read_only_fields = fields


class ClozeChoiceExerciseSerializer(TrialAwareExerciseSerializerMixin, serializers.ModelSerializer):
    is_locked = serializers.SerializerMethodField()
    show_free_trial_badge = serializers.SerializerMethodField()
    exercise_base = ExerciseBaseSerializer(read_only=True)
    locked_content_fields = ("content_with_placeholders", "original_source_text")

    class Meta:
        model = ClozeChoiceExercise
        fields = [
            "id",
            "is_locked",
            "show_free_trial_badge",
            "exercise_base",
            "content_with_placeholders",
            "original_source_text",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class ClozeChoiceBlankSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClozeChoiceBlank
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]


class ClozeChoiceOptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClozeChoiceOption
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]


class ClozeChoiceOptionDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClozeChoiceOption
        fields = [
            "id",
            "option_key",
            "option_text",
            "is_correct",
            "explanation",
            "sort_order",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class ClozeChoiceBlankDetailSerializer(serializers.ModelSerializer):
    options = ClozeChoiceOptionDetailSerializer(many=True, read_only=True)

    class Meta:
        model = ClozeChoiceBlank
        fields = [
            "id",
            "blank_key",
            "blank_number",
            "explanation",
            "explanation_scope",
            "created_at",
            "updated_at",
            "options",
        ]
        read_only_fields = fields


class ClozeChoiceExerciseDetailSerializer(serializers.ModelSerializer):
    exercise_base = ExerciseBaseSerializer(read_only=True)
    blanks = ClozeChoiceBlankDetailSerializer(many=True, read_only=True)

    class Meta:
        model = ClozeChoiceExercise
        fields = [
            "id",
            "exercise_base",
            "content_with_placeholders",
            "original_source_text",
            "created_at",
            "updated_at",
            "blanks",
        ]
        read_only_fields = fields


class ClozeMatchingExerciseSerializer(TrialAwareExerciseSerializerMixin, serializers.ModelSerializer):
    is_locked = serializers.SerializerMethodField()
    show_free_trial_badge = serializers.SerializerMethodField()
    exercise_base = ExerciseBaseSerializer(read_only=True)
    locked_content_fields = ("content_with_placeholders", "original_source_text")

    class Meta:
        model = ClozeMatchingExercise
        fields = [
            "id",
            "is_locked",
            "show_free_trial_badge",
            "exercise_base",
            "content_with_placeholders",
            "original_source_text",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class ClozeMatchingOptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClozeMatchingOption
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]


class ClozeMatchingOptionDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClozeMatchingOption
        fields = [
            "id",
            "option_key",
            "option_text",
            "option_order",
            "is_extra",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class ClozeMatchingBlankAnswerSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClozeMatchingBlankAnswer
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]


class ClozeMatchingBlankAnswerDetailSerializer(serializers.ModelSerializer):
    correct_option = ClozeMatchingOptionDetailSerializer(read_only=True)

    class Meta:
        model = ClozeMatchingBlankAnswer
        fields = [
            "id",
            "blank_key",
            "blank_number",
            "correct_option",
            "explanation",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class ClozeMatchingExerciseDetailSerializer(serializers.ModelSerializer):
    exercise_base = ExerciseBaseSerializer(read_only=True)
    options = ClozeMatchingOptionDetailSerializer(many=True, read_only=True)
    blank_answers = ClozeMatchingBlankAnswerDetailSerializer(many=True, read_only=True)

    class Meta:
        model = ClozeMatchingExercise
        fields = [
            "id",
            "exercise_base",
            "content_with_placeholders",
            "original_source_text",
            "created_at",
            "updated_at",
            "options",
            "blank_answers",
        ]
        read_only_fields = fields


class WritingExerciseSerializer(TrialAwareExerciseSerializerMixin, serializers.ModelSerializer):
    is_locked = serializers.SerializerMethodField()
    show_free_trial_badge = serializers.SerializerMethodField()
    exercise_base = ExerciseBaseSerializer(read_only=True)
    locked_content_fields = ("request_text", "task_text", "content")

    class Meta:
        model = WritingExercise
        fields = [
            "id",
            "is_locked",
            "show_free_trial_badge",
            "exercise_base",
            "request_text",
            "time_limit_minutes",
            "words_limit",
            "task_text",
            "content",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class WritingExampleTextSerializer(serializers.ModelSerializer):
    class Meta:
        model = WritingExampleText
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]


class WritingExampleTextDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = WritingExampleText
        fields = [
            "id",
            "label",
            "note",
            "example_text",
            "translation_zh",
            "sort_order",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class WritingExerciseDetailSerializer(serializers.ModelSerializer):
    exercise_base = ExerciseBaseSerializer(read_only=True)
    example_texts = WritingExampleTextDetailSerializer(many=True, read_only=True)
    content = serializers.SerializerMethodField()

    def get_content(self, exercise):
        content = exercise.content or {}
        pages = content.get("vocabulary_pages") if isinstance(content, dict) else None
        if not isinstance(pages, list):
            return content
        sources = {
            (source.page_index, source.entry_index): source.card
            for source in ExamVocabularySource.objects.filter(writing_exercise=exercise).select_related("card")
        }
        request = self.context.get("request")
        user = getattr(request, "user", None)
        favorite_ids = set()
        if user and user.is_authenticated and sources:
            favorite_ids = set(UserExamVocabularyFavorite.objects.filter(
                user=user, card_id__in=[card.id for card in sources.values()]
            ).values_list("card_id", flat=True))
        result = {**content}
        result_pages = []
        for page_index, page in enumerate(pages):
            if not isinstance(page, dict) or not isinstance(page.get("entries"), list):
                result_pages.append(page)
                continue
            result_page = {**page}
            entries = []
            for entry_index, entry in enumerate(page["entries"]):
                card = sources.get((page_index, entry_index))
                if card is None or not isinstance(entry, dict):
                    entries.append(entry)
                    continue
                entries.append({**entry, "card": {
                    "id": card.id,
                    "kind": card.kind,
                    "term": card.term,
                    "translation_zh": card.translation_zh,
                    "part_of_speech": card.part_of_speech,
                    "article": card.article,
                    "plural": card.plural,
                    "verb_forms": card.verb_forms,
                    "note": card.note,
                    "example_de": card.example_de,
                    "example_zh": card.example_zh,
                    "is_favorite": card.id in favorite_ids,
                }})
            result_page["entries"] = entries
            result_pages.append(result_page)
        result["vocabulary_pages"] = result_pages
        return result

    class Meta:
        model = WritingExercise
        fields = [
            "id",
            "exercise_base",
            "request_text",
            "time_limit_minutes",
            "words_limit",
            "task_text",
            "content",
            "created_at",
            "updated_at",
            "example_texts",
        ]
        read_only_fields = fields


class ExamVocabularyCardSerializer(serializers.ModelSerializer):
    is_favorite = serializers.BooleanField(read_only=True)

    class Meta:
        model = ExamVocabularyCard
        fields = [
            "id", "exam_type", "level", "kind", "term", "translation_zh", "part_of_speech", "article",
            "plural", "verb_forms", "note", "example_de", "example_zh", "is_favorite",
        ]
        read_only_fields = fields


class SpeakingTeilExerciseSerializer(TrialAwareExerciseSerializerMixin, serializers.ModelSerializer):
    is_locked = serializers.SerializerMethodField()
    show_free_trial_badge = serializers.SerializerMethodField()
    exercise_base = ExerciseBaseSerializer(read_only=True)
    content = serializers.SerializerMethodField()
    locked_content_fields = ("instruction", "content")

    def get_content(self, exercise):
        content = exercise.content or {}
        def with_audio(source_exercise, turn, sequence=None):
            result = {**turn, "audio_url": get_speaking_turn_audio_url(source_exercise, turn)}
            if sequence is not None:
                result["sequence"] = sequence
            return result

        result = {**content}
        base = exercise.exercise_base
        view = self.context.get("view")
        if (
            getattr(view, "action", None) == "retrieve"
            and base.exam_type == "TELC"
            and base.level == ExerciseBase.Level.C1
            and base.exercise_type == ExerciseBase.ExerciseType.SPEAKING_TEIL2
        ):
            companion = SpeakingTeilExercise.objects.select_related("exercise_base").filter(
                exercise_base__exam_type=base.exam_type,
                exercise_base__level=base.level,
                exercise_base__external_id=base.external_id,
                exercise_base__exercise_type=ExerciseBase.ExerciseType.SPEAKING_TEIL1,
            ).first()
            if companion:
                companion_content = companion.content or {}
                for field in ("topic", "outline"):
                    if field in companion_content:
                        result[field] = companion_content[field]
                turns = []
                for index, turn in enumerate(companion_content.get("dialogue", []), start=1):
                    source_sequence = turn.get("sequence")
                    turns.append({
                        **with_audio(companion, turn, index),
                        "turn_key": f"turn:source:{companion.pk}:{source_sequence}",
                        "source_exercise_id": companion.pk,
                        "source_teil": 1,
                        "source_sequence": source_sequence,
                    })
                sequence_offset = len(turns)
                for index, turn in enumerate(content.get("dialogue", []), start=1):
                    source_sequence = turn.get("sequence")
                    turns.append({
                        **with_audio(exercise, turn, sequence_offset + index),
                        "turn_key": f"turn:{source_sequence}",
                        "source_exercise_id": exercise.pk,
                        "source_teil": 2,
                        "source_sequence": source_sequence,
                    })
                result["dialogue"] = turns
                return result

        if isinstance(content.get("dialogue"), list):
            result["dialogue"] = [with_audio(exercise, turn) for turn in content["dialogue"]]
        if isinstance(content.get("sections"), list):
            result["sections"] = [
                {**section, "turns": [with_audio(exercise, turn) for turn in section.get("turns", [])]}
                for section in content["sections"]
            ]
        return result

    class Meta:
        model = SpeakingTeilExercise
        fields = [
            "id",
            "is_locked",
            "show_free_trial_badge",
            "exercise_base",
            "instruction",
            "content",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class UserExerciseFavoriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserExerciseFavorite
        fields = "__all__"
        read_only_fields = ["id", "user", "created_at"]


class UserListeningQuestionStateSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserListeningQuestionState
        fields = "__all__"
        read_only_fields = ["id", "user", "created_at", "updated_at"]


class UserReadingUnderstandingQuestionStateSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserReadingUnderstandingQuestionState
        fields = "__all__"
        read_only_fields = ["id", "user", "created_at", "updated_at"]


class UserReadingTitleMatchingItemStateSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserReadingTitleMatchingItemState
        fields = "__all__"
        read_only_fields = ["id", "user", "created_at", "updated_at"]


class UserReadingAdMatchingItemStateSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserReadingAdMatchingItemState
        fields = "__all__"
        read_only_fields = ["id", "user", "created_at", "updated_at"]


class UserClozeChoiceBlankStateSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserClozeChoiceBlankState
        fields = "__all__"
        read_only_fields = ["id", "user", "created_at", "updated_at"]


class UserClozeMatchingBlankStateSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserClozeMatchingBlankState
        fields = "__all__"
        read_only_fields = ["id", "user", "created_at", "updated_at"]


class UserWritingExerciseStateSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserWritingExerciseState
        fields = "__all__"
        read_only_fields = ["id", "user", "created_at", "updated_at"]


class UserWritingExampleTextStateSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserWritingExampleTextState
        fields = "__all__"
        read_only_fields = ["id", "user", "created_at", "updated_at"]


class UserSpeakingTurnStateSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserSpeakingTurnState
        fields = "__all__"
        read_only_fields = ["id", "user", "created_at", "updated_at"]

from django.contrib import admin

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
    ReadingAdMatchingAd,
    ReadingAdMatchingExercise,
    ReadingAdMatchingItem,
    ReadingTitleMatchingExercise,
    ReadingTitleMatchingItem,
    ReadingTitleMatchingOption,
    ReadingUnderstandingAnswerOption,
    ReadingUnderstandingExercise,
    ReadingUnderstandingQuestion,
    SpeakingGapBlank,
    SpeakingGapMatchingExercise,
    SpeakingGapOption,
    SpeakingPromptSegment,
    SpeakingPromptSegmentedExercise,
    UserExerciseFavorite,
    WritingExampleText,
    WritingExercise,
)


@admin.register(ExerciseBase)
class ExerciseBaseAdmin(admin.ModelAdmin):
    list_display = ("id", "exam_type", "level", "skill", "exercise_type", "external_id", "difficulty", "is_real_exam", "created_at")
    list_filter = ("exam_type", "level", "skill", "exercise_type", "difficulty", "is_real_exam", "creation_method")
    search_fields = ("exam_type", "external_id", "title", "source_name", "source_reference", "imported_from_file")
    ordering = ("exam_type", "level", "exercise_type", "external_id")


@admin.register(ListeningExercise)
class ListeningExerciseAdmin(admin.ModelAdmin):
    list_display = ("id", "exercise_base", "listening_type", "audio_file_identifier", "updated_at")
    list_filter = ("listening_type",)
    search_fields = ("exercise_base__external_id", "exercise_base__title", "audio_file_identifier")


@admin.register(ListeningQuestion)
class ListeningQuestionAdmin(admin.ModelAdmin):
    list_display = ("id", "listening_exercise", "question_number", "question_type", "updated_at")
    list_filter = ("question_type",)
    search_fields = ("question_text", "listening_exercise__exercise_base__external_id")


@admin.register(ListeningAnswerOption)
class ListeningAnswerOptionAdmin(admin.ModelAdmin):
    list_display = ("id", "question", "option_key", "is_correct", "sort_order")
    list_filter = ("is_correct",)
    search_fields = ("option_text", "question__question_text")


@admin.register(ReadingTitleMatchingExercise)
class ReadingTitleMatchingExerciseAdmin(admin.ModelAdmin):
    list_display = ("id", "exercise_base", "updated_at")
    search_fields = ("exercise_base__external_id", "exercise_base__title", "instruction")


@admin.register(ReadingTitleMatchingOption)
class ReadingTitleMatchingOptionAdmin(admin.ModelAdmin):
    list_display = ("id", "exercise", "option_key", "option_order")
    search_fields = ("option_text", "exercise__exercise_base__external_id")


@admin.register(ReadingTitleMatchingItem)
class ReadingTitleMatchingItemAdmin(admin.ModelAdmin):
    list_display = ("id", "exercise", "item_number", "correct_option")
    search_fields = ("text", "exercise__exercise_base__external_id")


@admin.register(ReadingUnderstandingExercise)
class ReadingUnderstandingExerciseAdmin(admin.ModelAdmin):
    list_display = ("id", "exercise_base", "updated_at")
    search_fields = ("exercise_base__external_id", "exercise_base__title")


@admin.register(ReadingUnderstandingQuestion)
class ReadingUnderstandingQuestionAdmin(admin.ModelAdmin):
    list_display = ("id", "exercise", "question_number", "updated_at")
    search_fields = ("question_text", "exercise__exercise_base__external_id")


@admin.register(ReadingUnderstandingAnswerOption)
class ReadingUnderstandingAnswerOptionAdmin(admin.ModelAdmin):
    list_display = ("id", "question", "option_key", "is_correct", "sort_order")
    list_filter = ("is_correct",)
    search_fields = ("option_text", "question__question_text")


@admin.register(ReadingAdMatchingExercise)
class ReadingAdMatchingExerciseAdmin(admin.ModelAdmin):
    list_display = ("id", "exercise_base", "updated_at")
    search_fields = ("exercise_base__external_id", "exercise_base__title", "instruction")


@admin.register(ReadingAdMatchingAd)
class ReadingAdMatchingAdAdmin(admin.ModelAdmin):
    list_display = ("id", "exercise", "ad_key", "is_no_match_option", "ad_order")
    list_filter = ("is_no_match_option",)
    search_fields = ("ad_text_markdown", "exercise__exercise_base__external_id")


@admin.register(ReadingAdMatchingItem)
class ReadingAdMatchingItemAdmin(admin.ModelAdmin):
    list_display = ("id", "exercise", "item_number", "correct_ad")
    search_fields = ("item_text", "exercise__exercise_base__external_id")


@admin.register(ClozeChoiceExercise)
class ClozeChoiceExerciseAdmin(admin.ModelAdmin):
    list_display = ("id", "exercise_base", "updated_at")
    search_fields = ("exercise_base__external_id", "exercise_base__title")


@admin.register(ClozeChoiceBlank)
class ClozeChoiceBlankAdmin(admin.ModelAdmin):
    list_display = ("id", "exercise", "blank_key", "blank_number")
    search_fields = ("blank_key", "exercise__exercise_base__external_id")


@admin.register(ClozeChoiceOption)
class ClozeChoiceOptionAdmin(admin.ModelAdmin):
    list_display = ("id", "blank", "option_key", "is_correct", "sort_order")
    list_filter = ("is_correct",)
    search_fields = ("option_text", "blank__blank_key")


@admin.register(ClozeMatchingExercise)
class ClozeMatchingExerciseAdmin(admin.ModelAdmin):
    list_display = ("id", "exercise_base", "updated_at")
    search_fields = ("exercise_base__external_id", "exercise_base__title")


@admin.register(ClozeMatchingOption)
class ClozeMatchingOptionAdmin(admin.ModelAdmin):
    list_display = ("id", "exercise", "option_key", "is_extra", "option_order")
    list_filter = ("is_extra",)
    search_fields = ("option_text", "exercise__exercise_base__external_id")


@admin.register(ClozeMatchingBlankAnswer)
class ClozeMatchingBlankAnswerAdmin(admin.ModelAdmin):
    list_display = ("id", "exercise", "blank_key", "blank_number", "correct_option")
    search_fields = ("blank_key", "exercise__exercise_base__external_id")


@admin.register(WritingExercise)
class WritingExerciseAdmin(admin.ModelAdmin):
    list_display = ("id", "exercise_base", "time_limit_minutes", "words_limit", "updated_at")
    search_fields = ("exercise_base__external_id", "exercise_base__title", "request_text", "task_text")


@admin.register(WritingExampleText)
class WritingExampleTextAdmin(admin.ModelAdmin):
    list_display = ("id", "writing_exercise", "label", "sort_order", "updated_at")
    search_fields = ("label", "example_text", "writing_exercise__exercise_base__external_id")


@admin.register(SpeakingGapMatchingExercise)
class SpeakingGapMatchingExerciseAdmin(admin.ModelAdmin):
    list_display = ("id", "exercise_base", "updated_at")
    search_fields = ("exercise_base__external_id", "exercise_base__title")


@admin.register(SpeakingGapOption)
class SpeakingGapOptionAdmin(admin.ModelAdmin):
    list_display = ("id", "exercise", "option_key", "is_extra", "option_order")
    list_filter = ("is_extra",)
    search_fields = ("option_text", "exercise__exercise_base__external_id")


@admin.register(SpeakingGapBlank)
class SpeakingGapBlankAdmin(admin.ModelAdmin):
    list_display = ("id", "exercise", "blank_key", "blank_number", "correct_option")
    search_fields = ("blank_key", "exercise__exercise_base__external_id")


@admin.register(SpeakingPromptSegmentedExercise)
class SpeakingPromptSegmentedExerciseAdmin(admin.ModelAdmin):
    list_display = ("id", "exercise_base", "segment_delimiter", "updated_at")
    search_fields = ("exercise_base__external_id", "exercise_base__title", "prompt_text", "example_text_raw")


@admin.register(SpeakingPromptSegment)
class SpeakingPromptSegmentAdmin(admin.ModelAdmin):
    list_display = ("id", "exercise", "segment_order", "updated_at")
    search_fields = ("segment_text", "exercise__exercise_base__external_id")


@admin.register(UserExerciseFavorite)
class UserExerciseFavoriteAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "exercise", "created_at")
    search_fields = ("user__telephone", "exercise__external_id", "exercise__title")

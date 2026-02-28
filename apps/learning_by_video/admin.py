from django.contrib import admin

from apps.learning_by_video.models import (
    Video,
    Subtitle,
    VideoExerciseQuestion,
    VideoExerciseOption,
    VideoProgress,
    VideoWordOccurrence,
    VideoSentenceOccurrence,
    VideoExpressionOccurrence,
    LearningVideoUserData,
    LearningVideoUserVideoMark,
)


@admin.register(Video)
class VideoAdmin(admin.ModelAdmin):
    list_display = ("id", "title", "creator", "difficulty", "season", "is_published", "created_at")
    list_filter = ("difficulty", "season", "is_published")
    search_fields = ("title", "creator")
    ordering = ("-created_at",)


@admin.register(Subtitle)
class SubtitleAdmin(admin.ModelAdmin):
    list_display = ("id", "video", "external_id", "start", "end")
    list_filter = ("video",)
    search_fields = ("text", "translation", "video__title")


@admin.register(VideoExerciseQuestion)
class VideoExerciseQuestionAdmin(admin.ModelAdmin):
    list_display = ("id", "video", "question_type", "order")
    list_filter = ("question_type", "video")
    search_fields = ("question", "video__title")


@admin.register(VideoExerciseOption)
class VideoExerciseOptionAdmin(admin.ModelAdmin):
    list_display = ("id", "question", "is_correct")
    list_filter = ("is_correct",)
    search_fields = ("text", "question__video__title")


@admin.register(VideoProgress)
class VideoProgressAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "video", "current_time", "completed", "updated_at")
    list_filter = ("completed",)
    search_fields = ("user__telephone", "video__title")


@admin.register(VideoWordOccurrence)
class VideoWordOccurrenceAdmin(admin.ModelAdmin):
    list_display = ("id", "video", "word", "time_start", "time_end")
    list_filter = ("video",)
    search_fields = ("word__text", "video__title")


@admin.register(VideoSentenceOccurrence)
class VideoSentenceOccurrenceAdmin(admin.ModelAdmin):
    list_display = ("id", "video", "sentence", "time_start", "time_end")
    list_filter = ("video",)
    search_fields = ("sentence__text", "video__title")


@admin.register(VideoExpressionOccurrence)
class VideoExpressionOccurrenceAdmin(admin.ModelAdmin):
    list_display = ("id", "video", "expression", "time_start", "time_end")
    list_filter = ("video",)
    search_fields = ("expression__text", "video__title")


@admin.register(LearningVideoUserData)
class LearningVideoUserDataAdmin(admin.ModelAdmin):
    list_display = ("id", "user_data", "updated_at")
    search_fields = ("user_data__user__telephone",)


@admin.register(LearningVideoUserVideoMark)
class LearningVideoUserVideoMarkAdmin(admin.ModelAdmin):
    list_display = ("id", "learning_video_user_data", "video", "is_completed", "is_favorite", "updated_at")
    list_filter = ("is_completed", "is_favorite")
    search_fields = ("learning_video_user_data__user_data__user__telephone", "video__title")

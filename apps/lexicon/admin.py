from django.contrib import admin

from apps.lexicon.models import (
    WordText,
    SentenceText,
    ExpressionText,
    UserWordMark,
    UserSentenceMark,
    UserExpressionMark,
)


@admin.register(WordText)
class WordTextAdmin(admin.ModelAdmin):
    list_display = ("id", "text", "language")
    search_fields = ("text",)


@admin.register(SentenceText)
class SentenceTextAdmin(admin.ModelAdmin):
    list_display = ("id", "text", "language")
    search_fields = ("text",)


@admin.register(ExpressionText)
class ExpressionTextAdmin(admin.ModelAdmin):
    list_display = ("id", "text", "language")
    search_fields = ("text",)


@admin.register(UserWordMark)
class UserWordMarkAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "word", "global_state", "updated_at")
    list_filter = ("global_state",)
    search_fields = ("user__telephone", "word__text")


@admin.register(UserSentenceMark)
class UserSentenceMarkAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "sentence", "global_state", "updated_at")
    list_filter = ("global_state",)
    search_fields = ("user__telephone", "sentence__text")


@admin.register(UserExpressionMark)
class UserExpressionMarkAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "expression", "global_state", "updated_at")
    list_filter = ("global_state",)
    search_fields = ("user__telephone", "expression__text")

from django.contrib import admin

from apps.announcement.models import Announcement


@admin.register(Announcement)
class AnnouncementAdmin(admin.ModelAdmin):
    list_display = ("title", "priority", "created_at")
    list_filter = ("priority",)
    search_fields = ("title", "content")
    ordering = ("-created_at",)

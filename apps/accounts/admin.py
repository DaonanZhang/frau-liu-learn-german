
from django.contrib import admin
from django.contrib.auth import get_user_model
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from django.db.models import Q

from apps.accounts.models.entitlement import Entitlement
from apps.accounts.models.module import Module
from apps.accounts.models.module_season import ModuleSeason
from apps.accounts.models.purchase_offer import PurchaseOffer
from apps.accounts.models.user_data import UserData, UserActiveDay

User = get_user_model()


def _all_user_fields():
    fields = [f.name for f in User._meta.fields if f.name != "id"]
    # include many-to-many permissions
    fields.extend(["groups", "user_permissions"])
    return fields


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    """Admin configuration for the custom user model."""

    list_display = (
        "id",
        "telephone",
        "country_code",
        "email",
        "is_staff",
        "is_superuser",
        "is_active",
        "date_joined",
    )
    # Restrict admin search to phone numbers only.
    search_fields = ("telephone",)
    search_help_text = "按手机号搜索（telephone）"
    ordering = ("-date_joined",)

    def get_search_results(self, request, queryset, search_term):
        """
        Force user search to telephone-field matching only.
        """
        term = str(search_term or "").strip()
        if not term:
            return queryset, False

        compact = term.replace(" ", "").replace("-", "")
        digits = "".join(ch for ch in compact if ch.isdigit())

        candidates = {compact}
        if digits:
            candidates.add(digits)
            # If input includes country code (e.g. +86...), still match by local phone.
            if len(digits) > 11:
                candidates.add(digits[-11:])

        conditions = Q()
        for candidate in candidates:
            if candidate:
                conditions |= Q(telephone__icontains=candidate)

        return queryset.filter(conditions), False

    fieldsets = (
        (None, {"fields": _all_user_fields()}),
    )

    add_fieldsets = (
        (None, {
            "classes": ("wide",),
            "fields": ("telephone", "country_code", "password1", "password2", "is_staff", "is_superuser"),
        }),
    )

    filter_horizontal = ("groups", "user_permissions")


@admin.register(Module)
class ModuleAdmin(admin.ModelAdmin):
    list_display = ("id", "key", "name", "is_active", "created_at")
    search_fields = ("key", "name")
    list_filter = ("is_active",)


@admin.register(ModuleSeason)
class ModuleSeasonAdmin(admin.ModelAdmin):
    list_display = ("id", "module", "season_number", "title", "created_at")
    list_filter = ("module", "season_number")
    search_fields = ("module__key", "title")


@admin.register(Entitlement)
class EntitlementAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "module", "season", "plan", "status", "starts_at", "expires_at")
    list_filter = ("module", "season", "plan", "status")
    search_fields = ("user__telephone", "module__key", "external_ref")


@admin.register(PurchaseOffer)
class PurchaseOfferAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "code",
        "title",
        "module",
        "season",
        "plan",
        "price_amount",
        "currency",
        "is_active",
        "sort_order",
    )
    list_filter = ("module", "season", "plan", "currency", "is_active")
    search_fields = ("code", "title", "module__key", "season__title")


@admin.register(UserData)
class UserDataAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "ui_language", "learning_language", "active_days", "last_active_date")
    search_fields = ("user__telephone",)


@admin.register(UserActiveDay)
class UserActiveDayAdmin(admin.ModelAdmin):
    list_display = ("id", "user_data", "date", "created_at")
    list_filter = ("date",)

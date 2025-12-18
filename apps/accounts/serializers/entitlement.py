from __future__ import annotations

from django.utils import timezone
from rest_framework import serializers

from apps.accounts.models.entitlement import Entitlement
from apps.accounts.models.module import Module


class ModuleMiniSerializer(serializers.ModelSerializer):
    """Tiny module representation for embedding in entitlement responses."""

    class Meta:
        model = Module
        fields = ("key", "name")
        read_only_fields = fields


class EntitlementReadSerializer(serializers.ModelSerializer):
    """Read serializer for Entitlement."""

    module = ModuleMiniSerializer(read_only=True)
    scope = serializers.SerializerMethodField()
    is_valid_now = serializers.SerializerMethodField()

    class Meta:
        model = Entitlement
        fields = (
            "id",
            "scope",
            "module",
            "plan",
            "status",
            "starts_at",
            "expires_at",
            "external_ref",
            "created_at",
            "is_valid_now",
        )
        read_only_fields = fields

    def get_scope(self, obj: Entitlement) -> str:
        return obj.module.key if obj.module_id else "platform"

    def get_is_valid_now(self, obj: Entitlement) -> bool:
        return obj.is_valid_now(at=timezone.now())


class EntitlementWriteSerializer(serializers.ModelSerializer):
    """Write serializer for Entitlement (admin use)."""

    class Meta:
        model = Entitlement
        fields = (
            "user",
            "module",
            "plan",
            "status",
            "starts_at",
            "expires_at",
            "external_ref",
        )

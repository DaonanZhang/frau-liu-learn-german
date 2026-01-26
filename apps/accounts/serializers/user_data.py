from __future__ import annotations

from rest_framework import serializers

from apps.accounts.models.user_data import UserData


class UserDataReadSerializer(serializers.ModelSerializer):
    """Read serializer for UserData."""

    class Meta:
        model = UserData
        fields = ("ui_language", "learning_language", "active_days", "last_active_date", "created_at", "updated_at")
        read_only_fields = fields


class UserDataWriteSerializer(serializers.ModelSerializer):
    """Write serializer for UserData (me endpoint)."""

    class Meta:
        model = UserData
        fields = ("ui_language", "learning_language")

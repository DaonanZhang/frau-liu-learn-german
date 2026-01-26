from __future__ import annotations

from rest_framework import serializers

from apps.accounts.models.module_season import ModuleSeason


class ModuleSeasonMiniSerializer(serializers.ModelSerializer):
    """Minimal season info for embedding."""

    class Meta:
        model = ModuleSeason
        fields = ("season_number", "title")
        read_only_fields = fields

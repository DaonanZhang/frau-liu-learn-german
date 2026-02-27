from __future__ import annotations

from rest_framework import serializers


class ActivationCodeApplySerializer(serializers.Serializer):
    code = serializers.CharField(max_length=32)

from __future__ import annotations

from rest_framework import serializers


# =========================
# Step 1: verify code
# =========================

class RegisterVerifyCodeSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=32)


# =========================
# Step 2: register
# =========================

class RegisterSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=32)
    telephone = serializers.CharField(max_length=15)
    password = serializers.CharField(min_length=6, write_only=True)

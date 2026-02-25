from __future__ import annotations

from rest_framework import serializers

COUNTRY_CODE_CHOICES = (
    ("+86", "CN"),
    ("+49", "DE"),
    ("+852", "CN-HK"),
    ("+853", "CN-MO"),
    ("+886", "CN-TW"),
    ("+65", "SG"),
    ("+81", "JP"),
    ("+82", "KR"),
    ("+44", "GB"),
    ("+33", "FR"),
    ("+1", "US"),
    ("+61", "AU"),
)

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
    country_code = serializers.ChoiceField(choices=COUNTRY_CODE_CHOICES)
    password = serializers.CharField(min_length=6, write_only=True)

    def validate_telephone(self, value: str) -> str:
        cleaned = "".join(ch for ch in str(value or "").strip() if ch.isdigit())
        if len(cleaned) != 11:
            raise serializers.ValidationError("手机号必须为11位数字。")
        return cleaned

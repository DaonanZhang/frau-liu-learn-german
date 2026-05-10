from __future__ import annotations

from rest_framework import serializers

COUNTRY_CODE_CHOICES = (
    ("+86", "CN"),
    ("+49", "DE"),
    ("+43", "AT"),
    ("+41", "CH"),
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
    telephone = serializers.CharField(max_length=15)
    country_code = serializers.ChoiceField(
        choices=COUNTRY_CODE_CHOICES,
        error_messages={
            "invalid_choice": "请选择有效的国家区号。",
            "required": "国家区号不能为空。",
        },
    )
    email = serializers.EmailField(
        error_messages={
            "required": "邮箱不能为空。",
            "blank": "邮箱不能为空。",
            "invalid": "请输入有效的邮箱地址。",
        },
    )
    password = serializers.CharField(
        min_length=6,
        write_only=True,
        error_messages={
            "required": "密码不能为空。",
            "blank": "密码不能为空。",
            "min_length": "密码至少需要6位。",
        },
    )

    def validate_telephone(self, value: str) -> str:
        cleaned = "".join(ch for ch in str(value or "").strip() if ch.isdigit())
        if len(cleaned) != 11:
            raise serializers.ValidationError("手机号必须为11位数字。")
        return cleaned

    def validate_email(self, value: str) -> str:
        normalized = str(value or "").strip().lower()
        if not normalized:
            raise serializers.ValidationError("邮箱不能为空。")
        return normalized

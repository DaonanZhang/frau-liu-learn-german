from rest_framework import serializers


class CodeRedemptionSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=32)
    confirm_replace = serializers.BooleanField(required=False, default=False)

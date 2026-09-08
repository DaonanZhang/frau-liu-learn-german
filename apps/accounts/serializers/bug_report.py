from rest_framework import serializers


class BugReportCreateSerializer(serializers.Serializer):
    report = serializers.CharField(max_length=5000, trim_whitespace=True)
    page_url = serializers.CharField(max_length=2000, required=False, allow_blank=True)
    browser_info = serializers.JSONField(required=False)
    console_errors = serializers.ListField(
        child=serializers.JSONField(),
        required=False,
        max_length=20,
    )
    consent = serializers.BooleanField()

    def validate_consent(self, value: bool) -> bool:
        if not value:
            raise serializers.ValidationError("提交问题反馈前必须同意信息收集说明。")
        return value

    def validate_browser_info(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("浏览器信息格式不正确。")
        return value

    def validate_console_errors(self, value):
        serialized = str(value)
        if len(serialized) > 50000:
            raise serializers.ValidationError("Console 错误信息过长。")
        return value

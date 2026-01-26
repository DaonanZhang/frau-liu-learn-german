from __future__ import annotations

import datetime

from django.utils import timezone
from rest_framework import serializers

from apps.accounts.models.user_data import UserData, UserActiveDay


class UserDataReadSerializer(serializers.ModelSerializer):
    """Read serializer for UserData."""

    active_dates = serializers.SerializerMethodField()

    class Meta:
        model = UserData
        fields = (
            "ui_language",
            "learning_language",
            "active_days",
            "last_active_date",
            "active_dates",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    def get_active_dates(self, obj: UserData) -> list[str]:
        """
        Return the list of active dates (YYYY-MM-DD) for recent days.

        Uses query param ?days=N (default 90).
        """
        request = self.context.get("request")
        days = 90

        if request is not None:
            raw_days = request.query_params.get("days")
            if raw_days is not None:
                try:
                    parsed_days = int(raw_days)
                    if 1 <= parsed_days <= 365:
                        days = parsed_days
                except (TypeError, ValueError):
                    pass

        today = timezone.localdate()
        start_date = today - datetime.timedelta(days=days - 1)

        date_values = (
            UserActiveDay.objects.filter(
                user_data=obj,
                date__gte=start_date,
                date__lte=today,
            )
            .order_by("date")
            .values_list("date", flat=True)
        )

        return [d.isoformat() for d in date_values]

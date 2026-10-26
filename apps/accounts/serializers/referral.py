from rest_framework import serializers


class ReferralNoticeReadSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    event_type = serializers.CharField()
    payload = serializers.SerializerMethodField()
    created_at = serializers.DateTimeField()
    is_global_notice = serializers.BooleanField()
    acknowledged_at = serializers.DateTimeField(allow_null=True)

    def get_payload(self, obj):
        payload = obj.payload if isinstance(obj.payload, dict) else {}
        safe = {}
        if obj.event_type == "referral_qualified":
            days = payload.get("days")
            count = payload.get("effective_count")
            if isinstance(days, int) and not isinstance(days, bool) and days == 30:
                safe["days"] = days
            if isinstance(count, int) and not isinstance(count, bool) and 1 <= count <= 1_000_000:
                safe["effective_count"] = count
        elif obj.event_type == "referral_milestone_granted":
            threshold = payload.get("threshold")
            kind = payload.get("kind")
            reward_type = payload.get("reward_type")
            valid_kind = {3: "science_3", 5: "vlog_5"}
            if (
                isinstance(threshold, int) and not isinstance(threshold, bool)
                and threshold in valid_kind and kind == valid_kind[threshold]
                and reward_type in ("entitlement", "coupon")
            ):
                safe.update(threshold=threshold, kind=kind, reward_type=reward_type)
        elif obj.event_type == "referral_refunded":
            progress_removed = payload.get("progress_removed")
            days_removed = payload.get("days_removed")
            expires_at = payload.get("access_expires_at")
            if isinstance(progress_removed, bool):
                safe["progress_removed"] = progress_removed
            if (
                isinstance(days_removed, (int, float)) and not isinstance(days_removed, bool)
                and 0 <= days_removed <= 30
            ):
                safe["days_removed"] = days_removed
            count = payload.get("effective_count")
            if isinstance(count, int) and not isinstance(count, bool) and 0 <= count <= 1_000_000:
                safe["effective_count"] = count
            changes = payload.get("milestone_changes")
            if isinstance(changes, list) and len(changes) <= 2:
                expected = {3: "science_3", 5: "vlog_5"}
                outcomes = ("revoked", "revocation_pending", "non_reversible")
                clean = []
                previous_threshold = 0
                for change in changes:
                    if not isinstance(change, dict):
                        clean = None
                        break
                    threshold = change.get("threshold")
                    kind = change.get("kind")
                    outcome = change.get("outcome")
                    reward_type = change.get("reward_type")
                    if (
                        not isinstance(threshold, int) or isinstance(threshold, bool)
                        or threshold not in expected
                        or threshold <= previous_threshold
                        or kind != expected[threshold] or outcome not in outcomes
                        or reward_type not in ("entitlement", "coupon")
                        or reward_type == "entitlement" and outcome != "revoked"
                    ):
                        clean = None
                        break
                    previous_threshold = threshold
                    clean.append({
                        "threshold": threshold, "kind": kind,
                        "outcome": outcome, "reward_type": reward_type,
                    })
                if clean is not None:
                    safe["milestone_changes"] = clean
            if expires_at is None:
                safe["access_expires_at"] = None
            elif isinstance(expires_at, str):
                field = serializers.DateTimeField()
                try:
                    parsed = field.run_validation(expires_at)
                except serializers.ValidationError:
                    pass
                else:
                    safe["access_expires_at"] = field.to_representation(parsed)
        return safe

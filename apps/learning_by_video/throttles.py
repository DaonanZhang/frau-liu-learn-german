from __future__ import annotations

from rest_framework.throttling import UserRateThrottle


class VideoProgressWriteThrottle(UserRateThrottle):
    """
    Configure in settings:
    REST_FRAMEWORK = {
        "DEFAULT_THROTTLE_RATES": {
            "video_progress_write": "30/min",
        }
    }
    """
    scope = "video_progress_write"

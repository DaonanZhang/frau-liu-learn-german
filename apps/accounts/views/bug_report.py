import logging
from ipaddress import ip_address
from urllib.parse import urlsplit

from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import BugReport
from apps.accounts.serializers.bug_report import AudioLoadErrorSerializer, BugReportCreateSerializer


logger = logging.getLogger(__name__)


def _request_ip(request: Request) -> str | None:
    forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR", "")
    candidates = [part.strip() for part in forwarded_for.split(",") if part.strip()]
    remote_address = str(request.META.get("REMOTE_ADDR", "")).strip()
    if remote_address:
        candidates.append(remote_address)

    for candidate in candidates:
        try:
            return str(ip_address(candidate))
        except ValueError:
            continue
    return None


class BugReportCreateAPIView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request: Request) -> Response:
        serializer = BugReportCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        report = BugReport.objects.create(
            user=request.user,
            report=data["report"],
            ip_address=_request_ip(request),
            page_url=data.get("page_url", ""),
            user_agent=str(request.META.get("HTTP_USER_AGENT", ""))[:2000],
            browser_info=data.get("browser_info", {}),
            console_errors=data.get("console_errors", []),
            consented_at=timezone.now(),
        )
        return Response({"id": report.pk}, status=status.HTTP_201_CREATED)


class AudioLoadErrorAPIView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request: Request) -> Response:
        serializer = AudioLoadErrorSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        audio_url = urlsplit(data["audio_url"])._replace(query="", fragment="").geturl()
        page_url = urlsplit(data.get("page_url", ""))._replace(query="", fragment="").geturl()
        logger.warning(
            "Client audio load failure user_id=%s entry_point=%s audio_url=%r page_url=%r "
            "backup_status=%s backup_error=%r media_error_code=%s media_error_message=%r",
            request.user.pk,
            data["entry_point"],
            audio_url,
            page_url,
            data.get("backup_status"),
            data.get("backup_error", ""),
            data.get("media_error_code"),
            data.get("media_error_message", ""),
        )
        return Response(status=status.HTTP_201_CREATED)

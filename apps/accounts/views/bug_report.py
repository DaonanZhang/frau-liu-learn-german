from ipaddress import ip_address

from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import BugReport
from apps.accounts.serializers.bug_report import BugReportCreateSerializer


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

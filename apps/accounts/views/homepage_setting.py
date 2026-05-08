from __future__ import annotations

from pathlib import Path

from django.conf import settings
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

class HomepageSettingViewSet(viewsets.GenericViewSet):
    permission_classes = (IsAuthenticated,)
    parser_classes = (MultiPartParser, FormParser)

    @staticmethod
    def _user_can_manage(request: Request) -> bool:
        return bool(getattr(request.user, "is_superuser", False))

    @staticmethod
    def _qr_image_path() -> Path:
        configured = getattr(settings, "HOMEPAGE_WECHAT_QR_IMAGE_PATH", None)
        if configured:
            return Path(configured)
        return settings.BASE_DIR / "frontend" / "public" / "images" / "wechat-qr.png"

    @staticmethod
    def _qr_dist_image_path() -> Path:
        return settings.BASE_DIR / "frontend" / "dist" / "images" / "wechat-qr.png"

    @classmethod
    def _write_qr_image(cls, content: bytes) -> None:
        image_path = cls._qr_image_path()
        image_path.parent.mkdir(parents=True, exist_ok=True)
        image_path.write_bytes(content)

        dist_image_path = cls._qr_dist_image_path()
        dist_parent = dist_image_path.parent
        # Keep the live dist asset in sync when the deployed frontend is served from dist.
        if dist_parent.exists():
            dist_parent.mkdir(parents=True, exist_ok=True)
            dist_image_path.write_bytes(content)

    @classmethod
    def _build_qr_image_url(cls) -> str:
        image_path = cls._qr_image_path()
        cache_key = int(image_path.stat().st_mtime) if image_path.exists() else "default"
        return f"/images/wechat-qr.png?v={cache_key}"

    @action(detail=False, methods=["get", "post"], url_path="wechat-qr")
    def wechat_qr(self, request: Request) -> Response:
        if request.method.upper() == "GET":
            return Response(
                {
                    "wechat_qr_image_url": self._build_qr_image_url(),
                    "can_manage": self._user_can_manage(request),
                },
                status=status.HTTP_200_OK,
            )

        if not self._user_can_manage(request):
            return Response(
                {"detail": "You do not have permission to perform this action."},
                status=status.HTTP_403_FORBIDDEN,
            )

        uploaded_file = request.FILES.get("wechat_qr_image")
        if uploaded_file is None:
            return Response(
                {"wechat_qr_image": ["请上传 PNG 图片。"]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        filename = (uploaded_file.name or "").lower()
        content_type = (getattr(uploaded_file, "content_type", "") or "").lower()
        if not filename.endswith(".png") or (content_type and content_type != "image/png"):
            return Response(
                {"wechat_qr_image": ["仅支持 PNG 图片，文件将直接覆盖 wechat-qr.png。"]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        image_content = b"".join(uploaded_file.chunks())
        self._write_qr_image(image_content)

        return Response(
            {
                "wechat_qr_image_url": self._build_qr_image_url(),
                "can_manage": True,
            },
            status=status.HTTP_200_OK,
        )

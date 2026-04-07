from __future__ import annotations

import logging
from email.mime.image import MIMEImage
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string


BRAND_ICON_CID = "frau-liu-brand-icon"
logger = logging.getLogger(__name__)
email_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="email-send")


def _brand_icon_path() -> Path:
    return settings.BASE_DIR / "frontend" / "public" / "images" / "icon.jpeg"


def render_email(template_name: str, context: dict[str, Any]) -> str:
    base_context = {
        "brand_name": "符号刘的德语素材库",
        "brand_icon_cid": BRAND_ICON_CID,
        "frontend_base_url": getattr(settings, "FRONTEND_BASE_URL", ""),
    }
    base_context.update(context)
    return render_to_string(template_name, base_context)


def send_templated_email(
    *,
    subject: str,
    to_email: str,
    template_name: str,
    context: dict[str, Any],
) -> None:
    if not getattr(settings, "EMAIL_ENABLED", True):
        return

    resolved_to_email = to_email
    test_mail = getattr(settings, "TEST_MAIL", "").strip()
    if settings.DEBUG and test_mail:
        resolved_to_email = test_mail

    html_body = render_email(template_name, context)
    text_body = (
        context.get("text_body")
        or context.get("preview_text")
        or "Please open this email in an HTML-capable mail client."
    )

    message = EmailMultiAlternatives(
        subject=subject,
        body=text_body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[resolved_to_email],
    )
    message.attach_alternative(html_body, "text/html")

    icon_path = _brand_icon_path()
    if icon_path.exists():
        logo = MIMEImage(icon_path.read_bytes())
        logo.add_header("Content-ID", f"<{BRAND_ICON_CID}>")
        logo.add_header("Content-Disposition", "inline", filename=icon_path.name)
        message.attach(logo)

    message.send(fail_silently=False)


def send_password_reset_email(
    *,
    to_email: str,
    code: str,
    username: str | None = None,
) -> None:
    preview_text = f"您的密码重置验证码是 {code}"
    send_templated_email(
        subject="符号刘的德语素材库 密码重置验证码",
        to_email=to_email,
        template_name="accounts/emails/password_reset_email.html",
        context={
            "code": code,
            "username": username or "同学",
            "preview_text": preview_text,
            "text_body": (
                f"{preview_text}。验证码 15 分钟内有效。如果这不是您的操作，请忽略这封邮件。"
            ),
        },
    )


def send_password_reset_email_async(
    *,
    to_email: str,
    code: str,
    username: str | None = None,
) -> None:
    future = email_executor.submit(
        send_password_reset_email,
        to_email=to_email,
        code=code,
        username=username,
    )

    def _log_failure(task):
        exc = task.exception()
        if exc:
            logger.exception("Failed to send password reset email asynchronously", exc_info=exc)

    future.add_done_callback(_log_failure)

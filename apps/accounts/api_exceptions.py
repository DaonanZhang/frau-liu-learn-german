import logging

from rest_framework.views import exception_handler


logger = logging.getLogger(__name__)


def api_exception_handler(exc, context):
    response = exception_handler(exc, context)
    request = context.get("request")
    raw_request = getattr(request, "_request", request)
    user = getattr(raw_request, "user", None)
    user_id = getattr(user, "pk", None)
    if user_id is None:
        user_id = "anonymous"

    if response is None:
        logger.exception(
            "Unhandled API exception user_id=%s method=%s path=%s exception=%s",
            user_id,
            getattr(request, "method", ""),
            getattr(request, "path", ""),
            type(exc).__name__,
        )
    elif 400 <= response.status_code < 500:
        logger.warning(
            "Handled API client error user_id=%s method=%s path=%s status=%s exception=%s detail=%s",
            user_id,
            getattr(request, "method", ""),
            getattr(request, "path", ""),
            response.status_code,
            type(exc).__name__,
            repr(response.data)[:2000],
        )
    return response

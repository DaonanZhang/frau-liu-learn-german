import logging

from rest_framework.views import exception_handler


logger = logging.getLogger(__name__)


def api_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is None:
        request = context.get("request")
        raw_request = getattr(request, "_request", request)
        user = getattr(raw_request, "user", None)
        user_id = getattr(user, "pk", None)
        if user_id is None:
            user_id = "anonymous"
        logger.exception(
            "Unhandled API exception user_id=%s method=%s path=%s exception=%s",
            user_id,
            getattr(request, "method", ""),
            getattr(request, "path", ""),
            type(exc).__name__,
        )
    return response

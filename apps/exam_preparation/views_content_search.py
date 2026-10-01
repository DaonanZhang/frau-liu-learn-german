from __future__ import annotations

from django.core.exceptions import ValidationError
from django.core.paginator import EmptyPage, Paginator
from rest_framework import status
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.exam_preparation.content_search import (
    parse_search_query,
    search_exam_preparation_content,
)


class IsExamContentSearchUser(BasePermission):
    message = "此搜索功能仅对指定账号开放。"

    def has_permission(self, request, view) -> bool:
        return str(getattr(request.user, "telephone", "")).strip() == "110"


class ExamPreparationContentSearchAPIView(APIView):
    permission_classes = [IsAuthenticated, IsExamContentSearchUser]
    page_size = 20

    def get(self, request):
        try:
            search_query = parse_search_query(
                query=request.query_params.get("q", ""),
                skill=request.query_params.get("skill"),
                teil=request.query_params.get("teil"),
            )
            page_number = int(request.query_params.get("page", "1"))
            if page_number < 1:
                raise ValueError
        except ValidationError as exc:
            detail = getattr(exc, "message_dict", {"detail": exc.messages})
            return Response({"errors": detail}, status=status.HTTP_400_BAD_REQUEST)
        except (TypeError, ValueError):
            return Response(
                {"errors": {"page": ["页码必须是正整数。"]}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        results = search_exam_preparation_content(search_query)
        paginator = Paginator(results, self.page_size)
        try:
            page = paginator.page(page_number)
        except EmptyPage:
            return Response(
                {"errors": {"page": ["页码超出范围。"]}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {
                "count": paginator.count,
                "page": page.number,
                "page_size": self.page_size,
                "total_pages": paginator.num_pages,
                "results": list(page.object_list),
            }
        )

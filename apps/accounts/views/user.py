from __future__ import annotations

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db.models import Count, Max, Min, Prefetch, Q
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from apps.accounts.models import PromotionCodeRecord
from apps.accounts.models.entitlement import Entitlement
from apps.accounts.serializers.user import (
    PromotionCodeBatchSerializer,
    PromotionCodeHistoryQuerySerializer,
    UserMeReadSerializer,
    UserMeWriteSerializer,
)
from apps.accounts.services.promotion_codes import create_promotion_code_batch

User = get_user_model()


class UserViewSet(viewsets.GenericViewSet):
    """
    User endpoints:
    - GET /users/me/
    - PATCH /users/me/
    """

    permission_classes = (IsAuthenticated,)
    queryset = User.objects.all()

    def get_queryset(self):
        # Optimize /me response
        return (
            super()
            .get_queryset()
            .select_related("user_data")
            .prefetch_related(
                Prefetch(
                    "entitlements",
                    queryset=Entitlement.objects
                    .select_related("module", "season")
                    .order_by("-created_at"),
                )
            )
        )

    def get_serializer_class(self):
        if (
            self.action == "me"
            and getattr(self.request, "method", "").upper() == "PATCH"
        ):
            return UserMeWriteSerializer
        return UserMeReadSerializer

    @action(detail=False, methods=["get", "patch"], url_path="me")
    def me(self, request: Request) -> Response:
        if request.method.upper() == "PATCH":
            serializer = UserMeWriteSerializer(
                instance=request.user,
                data=request.data,
                partial=True,
                context={"request": request},
            )
            serializer.is_valid(raise_exception=True)
            serializer.save()

            out = UserMeReadSerializer(
                instance=request.user,
                context={"request": request},
            )
            return Response(out.data, status=status.HTTP_200_OK)

        serializer = UserMeReadSerializer(
            instance=request.user,
            context={"request": request},
        )
        return Response(serializer.data)

    @action(detail=False, methods=["get", "post"], url_path="promotion-codes")
    def promotion_codes(self, request: Request) -> Response:
        if not request.user.is_superuser:
            return Response(status=status.HTTP_403_FORBIDDEN)

        if request.method.upper() == "GET":
            query_serializer = PromotionCodeHistoryQuerySerializer(
                data=request.query_params
            )
            query_serializer.is_valid(raise_exception=True)
            if "generation_batch_id" in query_serializer.validated_data:
                batch_id = query_serializer.validated_data["generation_batch_id"]
                batch = (
                    PromotionCodeRecord.objects
                    .filter(generation_batch_id=batch_id)
                    .values("generation_batch_id", "operator_name", "campaign_name")
                    .annotate(
                        count=Count("id"),
                        discount_amount=Max("discount_amount"),
                        created_at=Min("created_at"),
                    )
                    .order_by("generation_batch_id")
                    .first()
                )
                if batch is None:
                    return Response(status=status.HTTP_404_NOT_FOUND)
                codes = list(
                    PromotionCodeRecord.objects
                    .filter(generation_batch_id=batch_id)
                    .order_by("id")
                    .values_list("code", flat=True)
                )
                return Response({
                    "generation_batch_id": str(batch["generation_batch_id"]),
                    "operator_name": batch["operator_name"],
                    "partner_name": batch["campaign_name"],
                    "count": batch["count"],
                    "discount_amount": f'{batch["discount_amount"]:.2f}',
                    "created_at": batch["created_at"],
                    "codes": codes,
                })
            search = query_serializer.validated_data["search"]
            page = query_serializer.validated_data["page"]
            records = PromotionCodeRecord.objects.all()
            if search:
                records = records.filter(
                    Q(campaign_name__icontains=search)
                    | Q(operator_name__icontains=search)
                )
            batches = (
                records
                .values("generation_batch_id", "operator_name", "campaign_name")
                .annotate(
                    count=Count("id"),
                    discount_amount=Max("discount_amount"),
                    created_at=Min("created_at"),
                )
                .order_by("-created_at")
            )
            count = batches.count()
            page_size = 20
            total_pages = (count + page_size - 1) // page_size
            batches = batches[(page - 1) * page_size : page * page_size]
            return Response({
                "results": [
                    {
                        "generation_batch_id": str(batch["generation_batch_id"]),
                        "operator_name": batch["operator_name"],
                        "partner_name": batch["campaign_name"],
                        "count": batch["count"],
                        "discount_amount": f'{batch["discount_amount"]:.2f}',
                        "created_at": batch["created_at"],
                    }
                    for batch in batches
                ],
                "count": count,
                "page": page,
                "total_pages": total_pages,
            })

        serializer = PromotionCodeBatchSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        partner_name = serializer.validated_data["partner_name"]
        operator_name = serializer.validated_data["operator_name"]
        count = serializer.validated_data["count"]
        discount_amount = serializer.validated_data["discount_amount"]
        codes = create_promotion_code_batch(
            campaign_name=partner_name,
            organization_name=partner_name,
            count=count,
            length=10,
            remark=f"管理员生成：{operator_name}；合作博主：{partner_name}",
            discount_amount=discount_amount,
            minimum_order_amount=0,
            applicable_module=None,
            applicable_season=None,
            applicable_offer=None,
            coupon_valid_days=None,
            expires_at=timezone.now() + timedelta(days=360),
            operator_name=operator_name,
        )
        return Response(
            {
                "partner_name": partner_name,
                "operator_name": operator_name,
                "discount_amount": f"{discount_amount:.2f}",
                "count": len(codes),
                "codes": codes,
            },
            status=status.HTTP_201_CREATED,
        )

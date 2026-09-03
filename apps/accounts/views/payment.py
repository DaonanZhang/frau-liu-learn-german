from __future__ import annotations

import logging
from datetime import timedelta
from decimal import Decimal
from decimal import InvalidOperation
from uuid import uuid4

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import DatabaseError, transaction
from django.db.models import Q
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from urllib.parse import urlencode

from apps.accounts.models import (
    AlipayWebsitePayment,
    PaymentDiscountApplication,
    PaymentGrantTask,
    UserCoupon,
)
from apps.accounts.serializers.payment import (
    CreateAlipayDebugPaymentSerializer,
    CreateAlipayPurchaseSerializer,
)
from apps.accounts.services import (
    AlipayConfigurationError,
    AlipayGatewayError,
    get_alipay_service,
    revoke_and_compact_payment_entitlement,
)
from apps.accounts.services.alipay_service import parse_timeout_express_seconds
from apps.accounts.services import (
    process_pending_payment_grant_tasks_for_payment,
    process_payment_grant_task_by_id,
    estimate_entitlement_expiry,
    get_purchase_pricing,
)
from apps.accounts.services.promotion_codes import get_coupon_for_offer, sync_payment_discount_status

REMOTE_PAYMENT_QUERY_COOLDOWN_SECONDS = 5
logger = logging.getLogger(__name__)

PAID_PAYMENT_STATUSES = {
    AlipayWebsitePayment.Status.PAID,
    AlipayWebsitePayment.Status.PARTIALLY_REFUNDED,
    AlipayWebsitePayment.Status.REFUNDED,
}
STORED_NOTIFY_FIELDS = {
    "notify_time",
    "notify_type",
    "notify_id",
    "app_id",
    "out_trade_no",
    "trade_no",
    "trade_status",
    "total_amount",
    "receipt_amount",
    "buyer_pay_amount",
    "refund_fee",
    "refund_amount",
    "seller_id",
}


def _build_debug_merchant_order_no(*, user_id: int) -> str:
    return f"debug-u{user_id}-{uuid4().hex[:20]}"


def _build_merchant_order_no(*, user_id: int) -> str:
    return f"pay-u{user_id}-{uuid4().hex[:20]}"


def _build_simulated_alipay_trade_no(*, payment_id: int) -> str:
    return f"localsim-{payment_id}-{uuid4().hex[:12]}"


def _build_payment_subject(
    *,
    offer_title: str,
    module_name: str,
    season_title: str | None,
    plan_label: str,
) -> str:
    if offer_title.strip():
        return offer_title.strip()
    if season_title:
        return f"{module_name} {season_title} {plan_label}"
    return f"{module_name} {plan_label}"


def _build_purchase_response_data(
    *,
    payment: AlipayWebsitePayment,
    grant_task: PaymentGrantTask,
    offer,
    module,
    season,
    plan: str,
    estimated_expires_at,
    pay_url: str,
    reused_existing_payment: bool = False,
    already_paid: bool = False,
) -> dict[str, object]:
    return {
        "payment_id": payment.id,
        "payment_grant_task_id": grant_task.id,
        "offer_code": offer.code,
        "merchant_order_no": payment.merchant_order_no,
        "subject": payment.subject,
        "amount": f"{payment.total_amount:.2f}",
        "module_key": module.key,
        "season_number": season.season_number if season is not None else None,
        "plan": plan,
        "estimated_expires_at": (
            estimated_expires_at.isoformat() if estimated_expires_at else None
        ),
        "payment_expires_at": payment.expires_at.isoformat() if payment.expires_at else None,
        "pay_url": pay_url,
        "reused_existing_payment": reused_existing_payment,
        "already_paid": already_paid,
    }


def _resolve_frontend_return_url(request: Request) -> str:
    configured_return_url = str(getattr(settings, "ALIPAY_RETURN_URL", "") or "").strip()
    if configured_return_url:
        return configured_return_url

    origin = str(request.headers.get("Origin") or "").strip()
    if origin:
        return f"{origin.rstrip('/')}/payments/alipay/return"

    return request.build_absolute_uri("/payments/alipay/return")


def _apply_payment_status(
    *,
    payment: AlipayWebsitePayment,
    trade_status: str,
    alipay_trade_no: str = "",
    raw_payload: dict[str, str] | None = None,
) -> None:
    if raw_payload is not None:
        payment.raw_notify_payload = {
            key: value for key, value in raw_payload.items() if key in STORED_NOTIFY_FIELDS
        }

    if alipay_trade_no:
        if payment.alipay_trade_no and payment.alipay_trade_no != alipay_trade_no:
            raise AlipayGatewayError("Alipay trade number conflicts with the confirmed local trade.")
        payment.alipay_trade_no = alipay_trade_no

    normalized_trade_status = str(trade_status or "").strip()
    if normalized_trade_status in {"TRADE_SUCCESS", "TRADE_FINISHED"}:
        if payment.status not in {
            AlipayWebsitePayment.Status.PARTIALLY_REFUNDED,
            AlipayWebsitePayment.Status.REFUNDED,
        }:
            payment.status = AlipayWebsitePayment.Status.PAID
        if payment.paid_at is None:
            payment.paid_at = timezone.now()
    elif normalized_trade_status == "TRADE_CLOSED":
        if payment.status in {
            AlipayWebsitePayment.Status.CREATED,
            AlipayWebsitePayment.Status.PENDING,
            AlipayWebsitePayment.Status.FAILED,
        }:
            payment.status = AlipayWebsitePayment.Status.CLOSED
    elif normalized_trade_status == "WAIT_BUYER_PAY" and payment.status in {
        AlipayWebsitePayment.Status.CREATED,
        AlipayWebsitePayment.Status.PENDING,
    }:
        payment.status = AlipayWebsitePayment.Status.PENDING


def _apply_refund_amount(*, payment: AlipayWebsitePayment, refund_amount: Decimal) -> None:
    if refund_amount < 0 or refund_amount > payment.total_amount:
        raise AlipayGatewayError("Refund amount is outside the valid payment range.")
    if refund_amount <= payment.refunded_amount:
        return
    payment.refunded_amount = refund_amount
    if refund_amount == payment.total_amount:
        payment.status = AlipayWebsitePayment.Status.REFUNDED
        payment.refunded_at = payment.refunded_at or timezone.now()
    elif refund_amount > 0:
        payment.status = AlipayWebsitePayment.Status.PARTIALLY_REFUNDED


def _parse_refund_amount(payload: dict[str, object]) -> Decimal:
    raw_value = str(payload.get("refund_amount") or payload.get("refund_fee") or "0").strip()
    try:
        return Decimal(raw_value)
    except (InvalidOperation, ValueError) as exc:
        raise AlipayGatewayError("Gateway refund amount is invalid.") from exc


def _query_and_sync_payment_status(
    *,
    payment: AlipayWebsitePayment,
) -> str:
    """
    Query Alipay directly for the latest trade state and update the local payment record.

    Returns synced, not_found, or unavailable.
    """

    alipay_service = get_alipay_service()
    query_response = alipay_service.query_trade(
        merchant_order_no=payment.merchant_order_no
    )
    response_code = str(query_response.get("code") or "").strip()
    if response_code != "10000":
        sub_code = str(query_response.get("sub_code") or "").strip().upper()
        if "TRADE_NOT_EXIST" in sub_code:
            return "not_found"
        return "unavailable"

    trade_status = str(query_response.get("trade_status") or "").strip()
    alipay_trade_no = str(query_response.get("trade_no") or "").strip()
    if not trade_status:
        return "unavailable"
    if trade_status in {"TRADE_SUCCESS", "TRADE_FINISHED"} and not alipay_trade_no:
        raise AlipayGatewayError("Queried paid trade is missing trade_no.")

    configured_seller_id = alipay_service.config.seller_id
    queried_seller_id = str(query_response.get("seller_id") or "").strip()
    if queried_seller_id != configured_seller_id:
        raise AlipayGatewayError("Queried seller_id does not match configured seller_id.")

    queried_total_amount_raw = str(query_response.get("total_amount") or "").strip()
    if not queried_total_amount_raw:
        raise AlipayGatewayError("Queried total_amount is missing.")
    try:
        queried_total_amount = Decimal(queried_total_amount_raw)
    except (InvalidOperation, ValueError) as exc:
        raise AlipayGatewayError("Queried total_amount is invalid.") from exc
    refund_amount = _parse_refund_amount(query_response)
    with transaction.atomic():
        locked_payment = AlipayWebsitePayment.objects.select_for_update().get(pk=payment.pk)
        if queried_total_amount != locked_payment.total_amount:
            raise AlipayGatewayError("Queried total_amount does not match local payment.")
        previous_status = locked_payment.status
        _apply_payment_status(
            payment=locked_payment,
            trade_status=trade_status,
            alipay_trade_no=alipay_trade_no,
        )
        _apply_refund_amount(payment=locked_payment, refund_amount=refund_amount)
        locked_payment.last_reconciled_at = timezone.now()
        locked_payment.save(
            update_fields=[
                "alipay_trade_no",
                "status",
                "paid_at",
                "refunded_amount",
                "refunded_at",
                "last_reconciled_at",
                "updated_at",
            ]
        )
        sync_payment_discount_status(payment_id=locked_payment.id)
        current_status = locked_payment.status

    if (
        current_status == AlipayWebsitePayment.Status.PAID
        and previous_status not in PAID_PAYMENT_STATUSES
    ):
        _process_pending_payment_grant_tasks_safely(payment_id=payment.id)
    if current_status == AlipayWebsitePayment.Status.REFUNDED:
        revoke_and_compact_payment_entitlement(payment=locked_payment)

    return "synced"


def _mark_open_payment_closed(*, payment_id: int) -> None:
    with transaction.atomic():
        payment = AlipayWebsitePayment.objects.select_for_update().get(pk=payment_id)
        if payment.status in {
            AlipayWebsitePayment.Status.CREATED,
            AlipayWebsitePayment.Status.PENDING,
        }:
            payment.status = AlipayWebsitePayment.Status.CLOSED
            payment.save(update_fields=["status", "updated_at"])
            sync_payment_discount_status(payment_id=payment.id)


def _should_query_remote_payment_status(*, payment: AlipayWebsitePayment) -> bool:
    if payment.status not in {
        AlipayWebsitePayment.Status.CREATED,
        AlipayWebsitePayment.Status.PENDING,
    }:
        return False

    updated_at = getattr(payment, "updated_at", None)
    if updated_at is None:
        return True

    return updated_at <= timezone.now() - timedelta(
        seconds=REMOTE_PAYMENT_QUERY_COOLDOWN_SECONDS
    )


def _process_pending_payment_grant_tasks_safely(*, payment_id: int) -> None:
    try:
        process_pending_payment_grant_tasks_for_payment(payment_id=payment_id)
    except (DatabaseError, ValueError):
        logger.exception("Payment entitlement grant failed", extra={"payment_id": payment_id})


def _find_incomplete_paid_purchase(
    *,
    user_id: int,
    offer_id: int,
    module_id: int | None,
    season_id: int | None,
    plan: str,
) -> PaymentGrantTask | None:
    return (
        PaymentGrantTask.objects
        .select_related("payment")
        .filter(
            user_id=user_id,
            offer_id=offer_id,
            module_id=module_id,
            season_id=season_id,
            plan=plan,
            payment__status=AlipayWebsitePayment.Status.PAID,
        )
        .exclude(status=PaymentGrantTask.Status.SUCCEEDED)
        .order_by("-id")
        .first()
    )


def _find_open_purchase_for_scope(
    *,
    user_id: int,
    module_id: int | None,
    season_id: int | None,
) -> PaymentGrantTask | None:
    return (
        PaymentGrantTask.objects.select_related("payment", "offer", "module", "season")
        .filter(
            user_id=user_id,
            module_id=module_id,
            season_id=season_id,
            payment__status__in=[
                AlipayWebsitePayment.Status.CREATED,
                AlipayWebsitePayment.Status.PENDING,
            ],
        )
        .order_by("-id")
        .first()
    )


def _close_unpaid_payment(*, payment: AlipayWebsitePayment, alipay_service) -> str:
    """Close an earlier unpaid order before a new purchase intent is created."""

    if getattr(settings, "ALIPAY_LOCAL_SIMULATE_SUCCESS", False):
        _mark_open_payment_closed(payment_id=payment.id)
        return "closed"

    outcome = _query_and_sync_payment_status(payment=payment)
    payment.refresh_from_db()
    if payment.status == AlipayWebsitePayment.Status.PAID:
        _process_pending_payment_grant_tasks_safely(payment_id=payment.id)
        return "paid"
    if payment.status not in {
        AlipayWebsitePayment.Status.CREATED,
        AlipayWebsitePayment.Status.PENDING,
    }:
        return "closed"
    if outcome == "not_found":
        _mark_open_payment_closed(payment_id=payment.id)
        return "closed"
    if outcome != "synced":
        raise AlipayGatewayError("Could not confirm the previous Alipay order status.")

    close_response = alipay_service.close_trade(
        merchant_order_no=payment.merchant_order_no
    )
    if str(close_response.get("code") or "").strip() == "10000":
        _mark_open_payment_closed(payment_id=payment.id)
        return "closed"

    # The buyer may have completed payment between the status query and close call.
    _query_and_sync_payment_status(payment=payment)
    payment.refresh_from_db()
    if payment.status == AlipayWebsitePayment.Status.PAID:
        _process_pending_payment_grant_tasks_safely(payment_id=payment.id)
        return "paid"
    raise AlipayGatewayError("The previous Alipay order could not be closed safely.")


def _simulate_local_paid_purchase(
    *,
    request: Request,
    payment: AlipayWebsitePayment,
    payment_grant_task: PaymentGrantTask,
) -> str:
    simulated_trade_no = _build_simulated_alipay_trade_no(payment_id=payment.id)
    _apply_payment_status(
        payment=payment,
        trade_status="TRADE_SUCCESS",
        alipay_trade_no=simulated_trade_no,
        raw_payload={
            "out_trade_no": payment.merchant_order_no,
            "trade_no": simulated_trade_no,
            "trade_status": "TRADE_SUCCESS",
            "total_amount": f"{payment.total_amount:.2f}",
            "app_id": "local-simulated",
            "seller_id": "local-simulated",
            "notify_id": f"local-notify-{payment.id}",
        },
    )
    payment.save(
        update_fields=[
            "raw_notify_payload",
            "alipay_trade_no",
            "status",
            "paid_at",
            "updated_at",
        ]
    )
    sync_payment_discount_status(payment_id=payment.id)
    process_payment_grant_task_by_id(payment_grant_task_id=payment_grant_task.id)

    return_url = _resolve_frontend_return_url(request)
    return f"{return_url}?{urlencode({'out_trade_no': payment.merchant_order_no, 'trade_status': 'TRADE_SUCCESS'})}"


class CreateAlipayDebugPaymentAPIView(APIView):
    """
    Create a local debug Alipay website payment and return the redirect URL.
    """

    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "alipay_purchase_create"

    @transaction.atomic
    def post(self, request: Request) -> Response:
        if not settings.DEBUG:
            return Response(
                {"detail": "Debug payments are disabled."},
                status=status.HTTP_404_NOT_FOUND,
            )
        serializer = CreateAlipayDebugPaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        validated_data = serializer.validated_data
        amount = Decimal(validated_data["amount"])
        subject = str(validated_data["subject"])

        try:
            alipay_service = get_alipay_service()
        except AlipayConfigurationError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        payment = AlipayWebsitePayment.objects.create(
            merchant_order_no=_build_debug_merchant_order_no(user_id=request.user.id),
            subject=subject,
            total_amount=amount,
            status=AlipayWebsitePayment.Status.PENDING,
        )

        pay_url = alipay_service.build_page_pay_url(payment=payment)

        return Response(
            {
                "payment_id": payment.id,
                "merchant_order_no": payment.merchant_order_no,
                "amount": f"{amount:.2f}",
                "subject": subject,
                "pay_url": pay_url,
            },
            status=status.HTTP_201_CREATED,
        )


class CreateAlipayPurchaseAPIView(APIView):
    """
    Create a purchase payment record and matching deferred entitlement grant task.
    """

    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "alipay_purchase_create"

    def post(self, request: Request) -> Response:
        serializer = CreateAlipayPurchaseSerializer(
            data=request.data,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)

        validated_data = serializer.validated_data
        module = validated_data["module"]
        season = validated_data["season"]
        plan = str(validated_data["plan"])
        total_amount = Decimal(validated_data["total_amount"])
        idempotency_key = str(validated_data["idempotency_key"])
        estimated_expires_at = estimate_entitlement_expiry(
            user=request.user,
            module=module,
            season=season,
            plan=plan,
        )
        if getattr(settings, "ALIPAY_LOCAL_SIMULATE_SUCCESS", False) and not settings.DEBUG:
            return Response(
                {"detail": "Simulated payment is forbidden outside DEBUG mode."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        alipay_service = None
        if not getattr(settings, "ALIPAY_LOCAL_SIMULATE_SUCCESS", False):
            try:
                alipay_service = get_alipay_service()
            except AlipayConfigurationError as exc:
                return Response(
                    {"detail": str(exc)},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

        season_title = None
        if season is not None:
            season_title = season.title or f"Season {season.season_number}"

        payment_subject = _build_payment_subject(
            offer_title=validated_data["offer"].title,
            module_name=module.name,
            season_title=season_title,
            plan_label=dict(PaymentGrantTask._meta.get_field("plan").choices)[plan],
        )

        existing_intent = (
            PaymentGrantTask.objects.select_related("payment", "offer")
            .filter(idempotency_key=idempotency_key)
            .first()
        )
        if existing_intent is not None:
            if existing_intent.user_id != request.user.id or existing_intent.offer_id != validated_data["offer"].id:
                return Response(
                    {"detail": "The idempotency key is already bound to another purchase intent."},
                    status=status.HTTP_409_CONFLICT,
                )
            existing_payment = existing_intent.payment
            if existing_payment.status == AlipayWebsitePayment.Status.PAID:
                _process_pending_payment_grant_tasks_safely(payment_id=existing_payment.id)
                existing_intent.refresh_from_db()
                return_url = alipay_service.config.return_url if alipay_service else _resolve_frontend_return_url(request)
                return Response(
                    _build_purchase_response_data(
                        payment=existing_payment,
                        grant_task=existing_intent,
                        offer=validated_data["offer"],
                        module=module,
                        season=season,
                        plan=plan,
                        estimated_expires_at=estimated_expires_at,
                        pay_url=f"{return_url}?{urlencode({'out_trade_no': existing_payment.merchant_order_no})}",
                        reused_existing_payment=True,
                        already_paid=True,
                    ),
                    status=status.HTTP_200_OK,
                )
            if existing_payment.status in {
                AlipayWebsitePayment.Status.CREATED,
                AlipayWebsitePayment.Status.PENDING,
            }:
                if getattr(settings, "ALIPAY_LOCAL_SIMULATE_SUCCESS", False):
                    return Response(
                        {"detail": "This local simulated purchase is already being processed."},
                        status=status.HTTP_409_CONFLICT,
                    )
                pay_url = alipay_service.build_page_pay_url(payment=existing_payment)
                if existing_payment.status == AlipayWebsitePayment.Status.CREATED:
                    existing_payment.status = AlipayWebsitePayment.Status.PENDING
                    existing_payment.save(update_fields=["status", "updated_at"])
                return Response(
                    _build_purchase_response_data(
                        payment=existing_payment,
                        grant_task=existing_intent,
                        offer=validated_data["offer"],
                        module=module,
                        season=season,
                        plan=plan,
                        estimated_expires_at=estimated_expires_at,
                        pay_url=pay_url,
                        reused_existing_payment=True,
                    ),
                    status=status.HTTP_200_OK,
                )
            return Response(
                {
                    "detail": "This purchase intent is no longer payable. Start a new purchase.",
                    "code": "purchase_intent_closed",
                },
                status=status.HTTP_409_CONFLICT,
            )

        while True:
            open_grant_task = _find_open_purchase_for_scope(
                user_id=request.user.id,
                module_id=module.id if module is not None else None,
                season_id=season.id if season is not None else None,
            )
            if open_grant_task is None:
                break
            payment = open_grant_task.payment
            try:
                close_outcome = _close_unpaid_payment(
                    payment=payment,
                    alipay_service=alipay_service,
                )
            except (AlipayConfigurationError, AlipayGatewayError):
                logger.exception(
                    "Could not safely close the previous Alipay order",
                    extra={"payment_id": payment.id},
                )
                return Response(
                    {
                        "detail": "The previous unpaid order could not be closed safely. Please retry shortly.",
                        "code": "previous_payment_close_pending",
                        "merchant_order_no": payment.merchant_order_no,
                    },
                    status=status.HTTP_409_CONFLICT,
                )
            if close_outcome == "paid":
                open_grant_task.refresh_from_db()
                old_module = open_grant_task.module
                old_season = open_grant_task.season
                old_expiry = estimate_entitlement_expiry(
                    user=request.user,
                    module=old_module,
                    season=old_season,
                    plan=open_grant_task.plan,
                )
                return_url = alipay_service.config.return_url if alipay_service else _resolve_frontend_return_url(request)
                return Response(
                    _build_purchase_response_data(
                        payment=payment,
                        grant_task=open_grant_task,
                        offer=open_grant_task.offer,
                        module=old_module,
                        season=old_season,
                        plan=open_grant_task.plan,
                        estimated_expires_at=old_expiry,
                        pay_url=f"{return_url}?{urlencode({'out_trade_no': payment.merchant_order_no})}",
                        reused_existing_payment=True,
                        already_paid=True,
                    ),
                    status=status.HTTP_200_OK,
                )

        incomplete_paid_grant_task = _find_incomplete_paid_purchase(
            user_id=request.user.id,
            offer_id=validated_data["offer"].id,
            module_id=module.id if module is not None else None,
            season_id=season.id if season is not None else None,
            plan=plan,
        )
        if incomplete_paid_grant_task is not None:
            try:
                process_payment_grant_task_by_id(
                    payment_grant_task_id=incomplete_paid_grant_task.id,
                )
            except (DatabaseError, ValueError):
                logger.exception(
                    "Retrying a paid entitlement grant failed",
                    extra={"grant_task_id": incomplete_paid_grant_task.id},
                )
            incomplete_paid_grant_task.refresh_from_db()
            if incomplete_paid_grant_task.status == PaymentGrantTask.Status.SUCCEEDED:
                return_url = alipay_service.config.return_url if alipay_service else _resolve_frontend_return_url(request)
                return Response(
                    _build_purchase_response_data(
                        payment=incomplete_paid_grant_task.payment,
                        grant_task=incomplete_paid_grant_task,
                        offer=validated_data["offer"],
                        module=module,
                        season=season,
                        plan=plan,
                        estimated_expires_at=estimated_expires_at,
                        pay_url=f"{return_url}?{urlencode({'out_trade_no': incomplete_paid_grant_task.payment.merchant_order_no})}",
                        reused_existing_payment=True,
                        already_paid=True,
                    ),
                    status=status.HTTP_200_OK,
                )
            return Response(
                {
                    "detail": (
                        "An existing paid order is already being finalized. "
                        "Refresh your access instead of creating a new payment."
                    ),
                    "merchant_order_no": incomplete_paid_grant_task.payment.merchant_order_no,
                    "grant_status": incomplete_paid_grant_task.status,
                },
                status=status.HTTP_409_CONFLICT,
            )

        timeout_seconds = parse_timeout_express_seconds(settings.ALIPAY_TIMEOUT_EXPRESS)
        with transaction.atomic():
            get_user_model().objects.select_for_update().only("id").get(pk=request.user.pk)
            raced_intent = (
                PaymentGrantTask.objects.select_related("payment", "offer")
                .filter(idempotency_key=idempotency_key)
                .first()
            )
            if raced_intent is not None:
                if (
                    raced_intent.user_id != request.user.id
                    or raced_intent.offer_id != validated_data["offer"].id
                ):
                    return Response(
                        {"detail": "The idempotency key is already bound to another purchase intent."},
                        status=status.HTTP_409_CONFLICT,
                    )
                raced_payment = raced_intent.payment
                if getattr(settings, "ALIPAY_LOCAL_SIMULATE_SUCCESS", False):
                    return Response(
                        {"detail": "This local simulated purchase is already being processed."},
                        status=status.HTTP_409_CONFLICT,
                    )
                pay_url = alipay_service.build_page_pay_url(payment=raced_payment)
                if raced_payment.status == AlipayWebsitePayment.Status.CREATED:
                    raced_payment.status = AlipayWebsitePayment.Status.PENDING
                    raced_payment.save(update_fields=["status", "updated_at"])
                return Response(
                    _build_purchase_response_data(
                        payment=raced_payment,
                        grant_task=raced_intent,
                        offer=validated_data["offer"],
                        module=module,
                        season=season,
                        plan=plan,
                        estimated_expires_at=estimated_expires_at,
                        pay_url=pay_url,
                        reused_existing_payment=True,
                    ),
                    status=status.HTTP_200_OK,
                )
            raced_open = PaymentGrantTask.objects.filter(
                user=request.user,
                module=module,
                season=season,
                payment__status__in=[
                    AlipayWebsitePayment.Status.CREATED,
                    AlipayWebsitePayment.Status.PENDING,
                ],
                payment__expires_at__gt=timezone.now(),
            ).exists()
            if raced_open:
                return Response(
                    {"detail": "Another unpaid order was created concurrently. Please retry."},
                    status=status.HTTP_409_CONFLICT,
                )
            estimated_expires_at = estimate_entitlement_expiry(
                user=request.user,
                module=module,
                season=season,
                plan=plan,
            )
            selected_coupon = validated_data.get("coupon")
            locked_coupon = None
            if selected_coupon is False:
                locked_coupon = False
            elif selected_coupon is not None:
                locked_coupon = get_coupon_for_offer(
                    user=request.user,
                    offer=validated_data["offer"],
                    coupon_id=selected_coupon.id,
                    for_update=True,
                )
                if locked_coupon is None:
                    return Response(
                        {"detail": "优惠券已被使用、已过期或不再适用于该商品。"},
                        status=status.HTTP_409_CONFLICT,
                    )
            else:
                locked_coupon = get_coupon_for_offer(
                    user=request.user,
                    offer=validated_data["offer"],
                    for_update=True,
                )
            pricing = get_purchase_pricing(
                user=request.user,
                offer=validated_data["offer"],
                coupon=(
                    locked_coupon
                    if locked_coupon is not None and locked_coupon is not False
                    else False
                ),
            )
            if (
                locked_coupon is not None
                and locked_coupon is not False
                and pricing.coupon is None
            ):
                return Response(
                    {"detail": "该优惠券不会降低当前价格。"},
                    status=status.HTTP_409_CONFLICT,
                )
            total_amount = pricing.final_amount
            payment = AlipayWebsitePayment.objects.create(
                merchant_order_no=_build_merchant_order_no(user_id=request.user.id),
                subject=payment_subject,
                total_amount=total_amount,
                status=AlipayWebsitePayment.Status.CREATED,
                expires_at=timezone.now() + timedelta(seconds=timeout_seconds),
            )
            payment_grant_task = PaymentGrantTask.objects.create(
                payment=payment,
                offer=validated_data["offer"],
                user=request.user,
                module=module,
                season=season,
                plan=plan,
                status=PaymentGrantTask.Status.PENDING,
                idempotency_key=idempotency_key,
            )
            if pricing.coupon is not None:
                PaymentDiscountApplication.objects.create(
                    payment=payment,
                    coupon=pricing.coupon,
                    promotion_code=pricing.coupon.promotion_code,
                    user=request.user,
                    offer=validated_data["offer"],
                    original_amount=pricing.original_amount,
                    automatic_discount_amount=pricing.automatic_discount_amount,
                    promotion_discount_amount=pricing.promotion_discount_amount,
                    final_amount=pricing.final_amount,
                    selection_source=validated_data["coupon_selection_source"],
                    campaign_name_snapshot=pricing.coupon.promotion_code.campaign_name,
                    campaign_organization_snapshot=pricing.coupon.promotion_code.organization_name,
                    promotion_code_remark_snapshot=pricing.coupon.promotion_code.remark,
                )
                pricing.coupon.status = UserCoupon.Status.RESERVED
                pricing.coupon.reserved_payment = payment
                pricing.coupon.reserved_at = timezone.now()
                pricing.coupon.save(
                    update_fields=["status", "reserved_payment", "reserved_at", "updated_at"]
                )

        if getattr(settings, "ALIPAY_LOCAL_SIMULATE_SUCCESS", False):
            try:
                pay_url = _simulate_local_paid_purchase(
                    request=request,
                    payment=payment,
                    payment_grant_task=payment_grant_task,
                )
            except (DatabaseError, ValueError) as exc:
                payment.status = AlipayWebsitePayment.Status.FAILED
                payment.save(update_fields=["status", "updated_at"])
                payment_grant_task.status = PaymentGrantTask.Status.FAILED
                payment_grant_task.last_error = str(exc)
                payment_grant_task.save(update_fields=["status", "last_error", "updated_at"])
                sync_payment_discount_status(payment_id=payment.id)
                return Response(
                    {"detail": f"Local simulated payment failed: {exc}"},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )
        else:
            pay_url = alipay_service.build_page_pay_url(payment=payment)
            payment.status = AlipayWebsitePayment.Status.PENDING
            payment.save(update_fields=["status", "updated_at"])

        return Response(
            _build_purchase_response_data(
                payment=payment,
                grant_task=payment_grant_task,
                offer=validated_data["offer"],
                module=module,
                season=season,
                plan=plan,
                estimated_expires_at=estimated_expires_at,
                pay_url=pay_url,
            ),
            status=status.HTTP_201_CREATED,
        )


class AlipayNotifyAPIView(APIView):
    """
    Receive Alipay async notify callbacks and confirm local payment records.
    """

    permission_classes = [AllowAny]

    def post(self, request: Request) -> HttpResponse:
        payload = {
            key: str(value)
            for key, value in request.data.items()
        }

        try:
            alipay_service = get_alipay_service()
        except AlipayConfigurationError:
            return HttpResponse("failure", status=500, content_type="text/plain")

        if not alipay_service.verify_notify_signature(payload):
            return HttpResponse("failure", status=400, content_type="text/plain")

        merchant_order_no = payload.get("out_trade_no", "").strip()
        alipay_trade_no = payload.get("trade_no", "").strip()
        trade_status = payload.get("trade_status", "").strip()

        if not merchant_order_no or not alipay_trade_no:
            return HttpResponse("failure", status=400, content_type="text/plain")
        if trade_status not in {
            "WAIT_BUYER_PAY",
            "TRADE_SUCCESS",
            "TRADE_FINISHED",
            "TRADE_CLOSED",
        }:
            logger.warning("Rejected unknown Alipay trade status", extra={"trade_status": trade_status})
            return HttpResponse("failure", status=400, content_type="text/plain")

        with transaction.atomic():
            payment = (
                AlipayWebsitePayment.objects.select_for_update()
                .filter(merchant_order_no=merchant_order_no)
                .first()
            )
            if payment is None:
                return HttpResponse("failure", status=404, content_type="text/plain")

            notify_app_id = payload.get("app_id", "").strip()
            if notify_app_id != alipay_service.config.app_id:
                return HttpResponse("failure", status=400, content_type="text/plain")

            configured_seller_id = alipay_service.config.seller_id
            notify_seller_id = payload.get("seller_id", "").strip()
            if notify_seller_id != configured_seller_id:
                return HttpResponse("failure", status=400, content_type="text/plain")

            try:
                notify_amount = Decimal(payload.get("total_amount", "").strip())
            except (InvalidOperation, ValueError):
                return HttpResponse("failure", status=400, content_type="text/plain")

            if notify_amount != payment.total_amount:
                return HttpResponse("failure", status=400, content_type="text/plain")

            try:
                _apply_payment_status(
                    payment=payment,
                    trade_status=trade_status,
                    alipay_trade_no=alipay_trade_no,
                    raw_payload=payload,
                )
                _apply_refund_amount(
                    payment=payment,
                    refund_amount=_parse_refund_amount(payload),
                )
            except AlipayGatewayError:
                logger.exception("Rejected inconsistent Alipay notification")
                return HttpResponse("failure", status=400, content_type="text/plain")
            payment.last_reconciled_at = timezone.now()
            payment.save(
                update_fields=[
                    "raw_notify_payload",
                    "alipay_trade_no",
                    "status",
                    "paid_at",
                    "refunded_amount",
                    "refunded_at",
                    "last_reconciled_at",
                    "updated_at",
                ]
            )
            sync_payment_discount_status(payment_id=payment.id)

        if payment.status == AlipayWebsitePayment.Status.PAID:
            try:
                process_pending_payment_grant_tasks_for_payment(payment_id=payment.id)
            except (DatabaseError, ValueError):
                logger.exception("Alipay notify confirmed payment but entitlement grant failed")
                return HttpResponse("failure", status=500, content_type="text/plain")
        elif payment.status == AlipayWebsitePayment.Status.REFUNDED:
            revoke_and_compact_payment_entitlement(payment=payment)

        return HttpResponse("success", content_type="text/plain")


class AlipayPaymentStatusAPIView(APIView):
    """
    Return the current payment/grant status for the authenticated buyer.
    """

    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "alipay_payment_status"

    def get(self, request: Request) -> Response:
        merchant_order_no = str(request.query_params.get("merchant_order_no") or "").strip()
        if not merchant_order_no:
            return Response(
                {"detail": "merchant_order_no is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        payment = AlipayWebsitePayment.objects.filter(merchant_order_no=merchant_order_no).first()
        if payment is None:
            return Response(
                {"detail": "Payment not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        grant_task = (
            PaymentGrantTask.objects
            .select_related("module", "season", "offer")
            .filter(payment=payment, user=request.user)
            .order_by("id")
            .first()
        )
        if grant_task is None:
            return Response(
                {"detail": "Payment does not belong to the current user."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if payment.status in {
            AlipayWebsitePayment.Status.CREATED,
            AlipayWebsitePayment.Status.PENDING,
        }:
            if _should_query_remote_payment_status(payment=payment):
                try:
                    _query_and_sync_payment_status(payment=payment)
                except (AlipayConfigurationError, AlipayGatewayError):
                    logger.exception(
                        "Could not refresh Alipay payment status",
                        extra={"payment_id": payment.id},
                    )
            payment.refresh_from_db()

        if (
            payment.status == AlipayWebsitePayment.Status.PAID
            and grant_task.status != PaymentGrantTask.Status.SUCCEEDED
        ):
            try:
                process_payment_grant_task_by_id(payment_grant_task_id=grant_task.id)
            except (DatabaseError, ValueError):
                logger.exception(
                    "Paid order entitlement retry failed",
                    extra={"grant_task_id": grant_task.id},
                )
            payment.refresh_from_db()
            grant_task.refresh_from_db()

        payment_status = payment.status
        grant_status = grant_task.status
        is_paid = payment_status in PAID_PAYMENT_STATUSES
        is_refunded = payment_status == AlipayWebsitePayment.Status.REFUNDED
        is_partially_refunded = payment_status == AlipayWebsitePayment.Status.PARTIALLY_REFUNDED
        is_granted = grant_status == PaymentGrantTask.Status.SUCCEEDED and not is_refunded
        is_pending_grant = is_paid and not is_granted and grant_status in {
            PaymentGrantTask.Status.PENDING,
            PaymentGrantTask.Status.PROCESSING,
        }
        is_failed = payment_status in {
            AlipayWebsitePayment.Status.FAILED,
            AlipayWebsitePayment.Status.CLOSED,
        }
        needs_attention = (
            is_paid and grant_status == PaymentGrantTask.Status.FAILED
        ) or is_partially_refunded
        access_scope = Q(module__isnull=True, season__isnull=True) | Q(
            module=grant_task.module,
            season__isnull=True,
        )
        if grant_task.season_id:
            access_scope |= Q(module=grant_task.module, season=grant_task.season)
        access_qs = request.user.entitlements.filter(
                status="active",
                starts_at__lte=timezone.now(),
            ).filter(access_scope).filter(
                Q(expires_at__isnull=True) | Q(expires_at__gt=timezone.now())
            )
        has_lifetime_access = access_qs.filter(expires_at__isnull=True).exists()
        access_expires_at = (
            access_qs.filter(expires_at__isnull=False)
            .order_by("-expires_at")
            .values_list("expires_at", flat=True)
            .first()
        )

        return Response(
            {
                "merchant_order_no": payment.merchant_order_no,
                "payment_status": payment_status,
                "grant_status": grant_status,
                "is_paid": is_paid,
                "is_granted": is_granted,
                "is_pending_grant": is_pending_grant,
                "is_failed": is_failed,
                "needs_attention": needs_attention,
                "is_refunded": is_refunded,
                "is_partially_refunded": is_partially_refunded,
                "refunded_amount": f"{payment.refunded_amount:.2f}",
                "module_key": grant_task.module.key if grant_task.module_id else "",
                "season_number": grant_task.season.season_number if grant_task.season_id else None,
                "offer_code": grant_task.offer.code if grant_task.offer_id else "",
                "support_code": f"PAY-{payment.id}-GRANT-{grant_task.id}" if needs_attention else "",
                "has_lifetime_access": has_lifetime_access,
                "access_expires_at": (
                    access_expires_at.isoformat() if access_expires_at else None
                ),
            },
            status=status.HTTP_200_OK,
        )

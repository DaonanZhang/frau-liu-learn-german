from __future__ import annotations

from datetime import timedelta
from decimal import Decimal
from decimal import InvalidOperation
from uuid import uuid4

from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from urllib.parse import urlencode

from apps.accounts.models import AlipayWebsitePayment, PaymentGrantTask
from apps.accounts.serializers.payment import (
    CreateAlipayDebugPaymentSerializer,
    CreateAlipayPurchaseSerializer,
)
from apps.accounts.services import (
    AlipayConfigurationError,
    AlipayGatewayError,
    get_alipay_service,
)
from apps.accounts.services import (
    process_pending_payment_grant_tasks_for_payment,
    process_payment_grant_task_by_id,
)

REMOTE_PAYMENT_QUERY_COOLDOWN_SECONDS = 5


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
    subject: str,
) -> str:
    if subject.strip():
        return subject.strip()
    if offer_title.strip():
        return offer_title.strip()
    if season_title:
        return f"{module_name} {season_title} {plan_label}"
    return f"{module_name} {plan_label}"


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
        payment.raw_notify_payload = raw_payload

    if alipay_trade_no:
        payment.alipay_trade_no = alipay_trade_no

    normalized_trade_status = str(trade_status or "").strip()
    if payment.status == AlipayWebsitePayment.Status.PAID:
        return

    if normalized_trade_status in {"TRADE_SUCCESS", "TRADE_FINISHED"}:
        payment.status = AlipayWebsitePayment.Status.PAID
        if payment.paid_at is None:
            payment.paid_at = timezone.now()
    elif normalized_trade_status == "TRADE_CLOSED":
        payment.status = AlipayWebsitePayment.Status.CLOSED
    elif normalized_trade_status == "WAIT_BUYER_PAY":
        payment.status = AlipayWebsitePayment.Status.PENDING


def _query_and_sync_payment_status(
    *,
    payment: AlipayWebsitePayment,
) -> bool:
    """
    Query Alipay directly for the latest trade state and update the local payment record.

    Returns True when local payment fields were refreshed from query data.
    """

    alipay_service = get_alipay_service()
    query_response = alipay_service.query_trade(
        merchant_order_no=payment.merchant_order_no
    )
    response_code = str(query_response.get("code") or "").strip()
    if response_code != "10000":
        return False

    trade_status = str(query_response.get("trade_status") or "").strip()
    alipay_trade_no = str(query_response.get("trade_no") or "").strip()
    if not trade_status:
        return False

    configured_seller_id = alipay_service.config.seller_id
    queried_seller_id = str(query_response.get("seller_id") or "").strip()
    if configured_seller_id and queried_seller_id and queried_seller_id != configured_seller_id:
        raise AlipayGatewayError("Queried seller_id does not match configured seller_id.")

    queried_total_amount_raw = str(query_response.get("total_amount") or "").strip()
    if queried_total_amount_raw:
        try:
            queried_total_amount = Decimal(queried_total_amount_raw)
        except (InvalidOperation, ValueError) as exc:
            raise AlipayGatewayError("Queried total_amount is invalid.") from exc
        if queried_total_amount != payment.total_amount:
            raise AlipayGatewayError("Queried total_amount does not match local payment.")

    previous_status = payment.status
    _apply_payment_status(
        payment=payment,
        trade_status=trade_status,
        alipay_trade_no=alipay_trade_no,
    )
    payment.save(
        update_fields=[
            "alipay_trade_no",
            "status",
            "paid_at",
            "updated_at",
        ]
    )

    if (
        payment.status == AlipayWebsitePayment.Status.PAID
        and previous_status != AlipayWebsitePayment.Status.PAID
    ):
        _process_pending_payment_grant_tasks_safely(payment_id=payment.id)

    return True


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
    except Exception:
        pass


def _find_reusable_pending_purchase(
    *,
    user_id: int,
    offer_id: int,
    module_id: int | None,
    season_id: int | None,
    plan: str,
) -> PaymentGrantTask | None:
    pending_statuses = [
        AlipayWebsitePayment.Status.CREATED,
        AlipayWebsitePayment.Status.PENDING,
    ]

    candidates = (
        PaymentGrantTask.objects
        .select_related("payment")
        .filter(
            user_id=user_id,
            offer_id=offer_id,
            module_id=module_id,
            season_id=season_id,
            plan=plan,
        )
        .filter(
            Q(payment__status__in=pending_statuses)
            | Q(
                payment__status=AlipayWebsitePayment.Status.PAID,
                status__in=[
                    PaymentGrantTask.Status.PENDING,
                    PaymentGrantTask.Status.PROCESSING,
                ],
            )
        )
        .order_by("-id")
    )

    for grant_task in candidates:
        payment = grant_task.payment
        if payment.status in pending_statuses:
            if _should_query_remote_payment_status(payment=payment):
                try:
                    _query_and_sync_payment_status(payment=payment)
                except (AlipayConfigurationError, AlipayGatewayError):
                    pass
            payment.refresh_from_db(fields=["status", "updated_at", "paid_at", "alipay_trade_no"])
            grant_task.refresh_from_db()

        if payment.status in pending_statuses:
            return grant_task

        if (
            payment.status == AlipayWebsitePayment.Status.PAID
            and grant_task.status != PaymentGrantTask.Status.SUCCEEDED
        ):
            _process_pending_payment_grant_tasks_safely(payment_id=payment.id)

    return None


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
    process_payment_grant_task_by_id(payment_grant_task_id=payment_grant_task.id)

    return_url = _resolve_frontend_return_url(request)
    return f"{return_url}?{urlencode({'out_trade_no': payment.merchant_order_no, 'trade_status': 'TRADE_SUCCESS'})}"


class CreateAlipayDebugPaymentAPIView(APIView):
    """
    Create a local debug Alipay website payment and return the redirect URL.
    """

    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request: Request) -> Response:
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

    @transaction.atomic
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
        requested_subject = str(validated_data.get("subject") or "")

        season_title = None
        if season is not None:
            season_title = season.title or f"Season {season.season_number}"

        payment_subject = _build_payment_subject(
            offer_title=validated_data["offer"].title,
            module_name=module.name,
            season_title=season_title,
            plan_label=dict(PaymentGrantTask._meta.get_field("plan").choices)[plan],
            subject=requested_subject,
        )

        reusable_grant_task = _find_reusable_pending_purchase(
            user_id=request.user.id,
            offer_id=validated_data["offer"].id,
            module_id=module.id if module is not None else None,
            season_id=season.id if season is not None else None,
            plan=plan,
        )
        if reusable_grant_task is not None:
            payment = reusable_grant_task.payment
            try:
                alipay_service = get_alipay_service()
            except AlipayConfigurationError as exc:
                return Response(
                    {"detail": str(exc)},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

            pay_url = alipay_service.build_page_pay_url(payment=payment)
            return Response(
                {
                    "payment_id": payment.id,
                    "payment_grant_task_id": reusable_grant_task.id,
                    "offer_code": validated_data["offer"].code,
                    "merchant_order_no": payment.merchant_order_no,
                    "subject": payment.subject,
                    "amount": f"{payment.total_amount:.2f}",
                    "module_key": module.key,
                    "season_number": season.season_number if season is not None else None,
                    "plan": plan,
                    "pay_url": pay_url,
                    "reused_existing_payment": True,
                },
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
            except Exception:
                pass
            incomplete_paid_grant_task.refresh_from_db()
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

        payment = AlipayWebsitePayment.objects.create(
            merchant_order_no=_build_merchant_order_no(user_id=request.user.id),
            subject=payment_subject,
            total_amount=total_amount,
            status=AlipayWebsitePayment.Status.CREATED,
        )
        payment_grant_task = PaymentGrantTask.objects.create(
            payment=payment,
            offer=validated_data["offer"],
            user=request.user,
            module=module,
            season=season,
            plan=plan,
            status=PaymentGrantTask.Status.PENDING,
        )

        if getattr(settings, "ALIPAY_LOCAL_SIMULATE_SUCCESS", False):
            try:
                pay_url = _simulate_local_paid_purchase(
                    request=request,
                    payment=payment,
                    payment_grant_task=payment_grant_task,
                )
            except Exception as exc:
                payment.status = AlipayWebsitePayment.Status.FAILED
                payment.save(update_fields=["status", "updated_at"])
                payment_grant_task.status = PaymentGrantTask.Status.FAILED
                payment_grant_task.last_error = str(exc)
                payment_grant_task.save(update_fields=["status", "last_error", "updated_at"])
                return Response(
                    {"detail": f"Local simulated payment failed: {exc}"},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )
        else:
            try:
                alipay_service = get_alipay_service()
            except AlipayConfigurationError as exc:
                return Response(
                    {"detail": str(exc)},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

            pay_url = alipay_service.build_page_pay_url(payment=payment)
            payment.status = AlipayWebsitePayment.Status.PENDING
            payment.save(update_fields=["status", "updated_at"])

        return Response(
            {
                "payment_id": payment.id,
                "payment_grant_task_id": payment_grant_task.id,
                "offer_code": validated_data["offer"].code,
                "merchant_order_no": payment.merchant_order_no,
                "subject": payment.subject,
                "amount": f"{payment.total_amount:.2f}",
                "module_key": module.key,
                "season_number": season.season_number if season is not None else None,
                "plan": plan,
                "pay_url": pay_url,
            },
            status=status.HTTP_201_CREATED,
        )


class AlipayNotifyAPIView(APIView):
    """
    Receive Alipay async notify callbacks and confirm local payment records.
    """

    permission_classes = [AllowAny]

    @transaction.atomic
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

        payment = (
            AlipayWebsitePayment.objects.select_for_update()
            .filter(merchant_order_no=merchant_order_no)
            .first()
        )
        if payment is None:
            return HttpResponse("failure", status=404, content_type="text/plain")

        notify_app_id = payload.get("app_id", "").strip()
        if notify_app_id and notify_app_id != alipay_service.config.app_id:
            return HttpResponse("failure", status=400, content_type="text/plain")

        configured_seller_id = alipay_service.config.seller_id
        notify_seller_id = payload.get("seller_id", "").strip()
        if configured_seller_id and notify_seller_id != configured_seller_id:
            return HttpResponse("failure", status=400, content_type="text/plain")

        try:
            notify_amount = Decimal(payload.get("total_amount", "").strip())
        except (InvalidOperation, ValueError):
            return HttpResponse("failure", status=400, content_type="text/plain")

        if notify_amount != payment.total_amount:
            return HttpResponse("failure", status=400, content_type="text/plain")

        previous_status = payment.status
        _apply_payment_status(
            payment=payment,
            trade_status=trade_status,
            alipay_trade_no=alipay_trade_no,
            raw_payload=payload,
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

        if (
            payment.status == AlipayWebsitePayment.Status.PAID
            and previous_status != AlipayWebsitePayment.Status.PAID
        ):
            _process_pending_payment_grant_tasks_safely(payment_id=payment.id)

        return HttpResponse("success", content_type="text/plain")


class AlipayPaymentStatusAPIView(APIView):
    """
    Return the current payment/grant status for the authenticated buyer.
    """

    permission_classes = [IsAuthenticated]

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
                    pass
            payment.refresh_from_db(fields=["status", "updated_at", "paid_at", "alipay_trade_no"])

        if (
            payment.status == AlipayWebsitePayment.Status.PAID
            and grant_task.status != PaymentGrantTask.Status.SUCCEEDED
        ):
            try:
                process_payment_grant_task_by_id(payment_grant_task_id=grant_task.id)
            except Exception:
                pass
            payment.refresh_from_db(fields=["status", "updated_at", "paid_at"])
            grant_task.refresh_from_db()

        payment_status = payment.status
        grant_status = grant_task.status
        is_paid = payment_status == AlipayWebsitePayment.Status.PAID
        is_granted = grant_status == PaymentGrantTask.Status.SUCCEEDED
        is_pending_grant = is_paid and not is_granted and grant_status in {
            PaymentGrantTask.Status.PENDING,
            PaymentGrantTask.Status.PROCESSING,
        }
        is_failed = payment_status in {
            AlipayWebsitePayment.Status.FAILED,
            AlipayWebsitePayment.Status.CLOSED,
        } or grant_status == PaymentGrantTask.Status.FAILED

        return Response(
            {
                "merchant_order_no": payment.merchant_order_no,
                "payment_status": payment_status,
                "grant_status": grant_status,
                "is_paid": is_paid,
                "is_granted": is_granted,
                "is_pending_grant": is_pending_grant,
                "is_failed": is_failed,
                "module_key": grant_task.module.key if grant_task.module_id else "",
                "season_number": grant_task.season.season_number if grant_task.season_id else None,
                "offer_code": grant_task.offer.code if grant_task.offer_id else "",
                "last_error": grant_task.last_error,
            },
            status=status.HTTP_200_OK,
        )

from __future__ import annotations

from decimal import Decimal
from decimal import InvalidOperation
from uuid import uuid4

from django.db import transaction
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import AlipayWebsitePayment, PaymentGrantTask
from apps.accounts.serializers.payment import (
    CreateAlipayDebugPaymentSerializer,
    CreateAlipayPurchaseSerializer,
)
from apps.accounts.services import AlipayConfigurationError, get_alipay_service
from apps.accounts.services import (
    enqueue_pending_payment_grant_tasks_for_payment,
    process_payment_grant_task_by_id,
)


def _build_debug_merchant_order_no(*, user_id: int) -> str:
    return f"debug-u{user_id}-{uuid4().hex[:20]}"


def _build_merchant_order_no(*, user_id: int) -> str:
    return f"pay-u{user_id}-{uuid4().hex[:20]}"


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
            subject=requested_subject,
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

        payment.raw_notify_payload = payload
        payment.alipay_trade_no = alipay_trade_no

        if trade_status in {"TRADE_SUCCESS", "TRADE_FINISHED"}:
            payment.status = AlipayWebsitePayment.Status.PAID
            if payment.paid_at is None:
                payment.paid_at = timezone.now()
        elif trade_status == "TRADE_CLOSED":
            payment.status = AlipayWebsitePayment.Status.CLOSED
        elif trade_status == "WAIT_BUYER_PAY":
            payment.status = AlipayWebsitePayment.Status.PENDING
        else:
            payment.status = AlipayWebsitePayment.Status.FAILED

        payment.save(
            update_fields=[
                "raw_notify_payload",
                "alipay_trade_no",
                "status",
                "paid_at",
                "updated_at",
            ]
        )

        if payment.status == AlipayWebsitePayment.Status.PAID:
            transaction.on_commit(
                lambda: enqueue_pending_payment_grant_tasks_for_payment(payment_id=payment.id)
            )

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

from __future__ import annotations

from django.db import models
from django.db.models import F, Q


class PaymentOrder(models.Model):
    """Provider-neutral record for one payment attempt."""

    class Provider(models.TextChoices):
        ALIPAY = "alipay", "Alipay"
        WECHAT_PAY = "wechat_pay", "WeChat Pay"

    class Status(models.TextChoices):
        CREATED = "created", "Created"
        PENDING = "pending", "Pending"
        PAID = "paid", "Paid"
        FAILED = "failed", "Failed"
        CLOSED = "closed", "Closed"
        PARTIALLY_REFUNDED = "partially_refunded", "Partially refunded"
        REFUNDED = "refunded", "Refunded"

    provider = models.CharField(
        max_length=16,
        choices=Provider.choices,
        default=Provider.ALIPAY,
        db_index=True,
        help_text="Payment provider responsible for this order.",
    )
    merchant_order_no = models.CharField(
        max_length=64,
        unique=True,
        help_text="Merchant-generated unique order number.",
    )
    subject = models.CharField(
        max_length=256,
        help_text="Payment subject shown to the customer and payment provider.",
    )
    total_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        help_text="Total payment amount in the configured merchant currency.",
    )
    status = models.CharField(
        max_length=24,
        choices=Status.choices,
        default=Status.CREATED,
        db_index=True,
        help_text="Current payment lifecycle status.",
    )
    provider_trade_no = models.CharField(
        max_length=64,
        blank=True,
        default="",
        db_index=True,
        help_text="Trade number returned by the selected payment provider.",
    )
    raw_notify_payload = models.JSONField(
        null=True,
        blank=True,
        help_text="Raw notification payload received from the payment provider, if available.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    paid_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Timestamp when the payment was confirmed as paid.",
    )
    expires_at = models.DateTimeField(
        null=True,
        blank=True,
        db_index=True,
        help_text="Local deadline after which an unpaid checkout must not be reused.",
    )
    last_reconciled_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Last time this payment was successfully reconciled with its provider.",
    )
    refunded_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        help_text="Cumulative amount confirmed as refunded by the payment provider.",
    )
    refunded_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Timestamp when a full refund was confirmed.",
    )

    class Meta:
        indexes = [
            models.Index(fields=["status", "created_at"], name="idx_payment_status_created"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["provider", "provider_trade_no"],
                condition=~Q(provider_trade_no=""),
                name="uniq_provider_nonblank_trade_no",
            ),
            models.CheckConstraint(
                condition=Q(refunded_amount__gte=0) & Q(refunded_amount__lte=F("total_amount")),
                name="payment_refund_amount_valid",
            ),
        ]

    @property
    def entitlement_external_ref(self) -> str:
        return f"payment:{self.provider}:{self.merchant_order_no}"

    def __str__(self) -> str:
        return (
            "PaymentOrder<"
            f"provider={self.provider} order={self.merchant_order_no} status={self.status}>"
        )

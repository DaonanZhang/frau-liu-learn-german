from __future__ import annotations

from django.db import models
from django.db.models import Q


class AlipayWebsitePayment(models.Model):
    """
    Minimal persistent record for an Alipay website payment attempt.
    """

    class Status(models.TextChoices):
        CREATED = "created", "Created"
        PENDING = "pending", "Pending"
        PAID = "paid", "Paid"
        FAILED = "failed", "Failed"
        CLOSED = "closed", "Closed"

    merchant_order_no = models.CharField(
        max_length=64,
        unique=True,
        help_text="Merchant-generated unique order number.",
    )
    subject = models.CharField(
        max_length=256,
        help_text="Payment subject shown to the customer and Alipay.",
    )
    total_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        help_text="Total payment amount in the configured merchant currency.",
    )
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.CREATED,
        db_index=True,
        help_text="Current payment lifecycle status.",
    )
    alipay_trade_no = models.CharField(
        max_length=64,
        blank=True,
        default="",
        db_index=True,
        help_text="Alipay trade number returned by Alipay after payment creation or completion.",
    )
    raw_notify_payload = models.JSONField(
        null=True,
        blank=True,
        help_text="Raw notify payload received from Alipay, if available.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    paid_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Timestamp when the payment was confirmed as paid.",
    )

    class Meta:
        indexes = [
            models.Index(fields=["status", "created_at"], name="idx_alipay_status_created"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["alipay_trade_no"],
                condition=~Q(alipay_trade_no=""),
                name="uniq_nonblank_alipay_trade_no",
            )
        ]

    def __str__(self) -> str:
        return f"AlipayWebsitePayment<order={self.merchant_order_no} status={self.status}>"

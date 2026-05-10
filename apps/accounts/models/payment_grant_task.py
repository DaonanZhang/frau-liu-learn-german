from __future__ import annotations

from django.conf import settings
from django.db import models


class PaymentGrantTask(models.Model):
    """
    Deferred entitlement grant task created after payment confirmation.
    """

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        PROCESSING = "processing", "Processing"
        SUCCEEDED = "succeeded", "Succeeded"
        FAILED = "failed", "Failed"

    payment = models.ForeignKey(
        "accounts.AlipayWebsitePayment",
        on_delete=models.CASCADE,
        related_name="grant_tasks",
        db_index=True,
        help_text="Payment record that triggered this entitlement grant task.",
    )
    offer = models.ForeignKey(
        "accounts.PurchaseOffer",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="payment_grant_tasks",
        db_index=True,
        help_text="Purchase offer used to create this payment, if applicable.",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="payment_grant_tasks",
        db_index=True,
        help_text="User who should receive the entitlement after successful payment.",
    )
    module = models.ForeignKey(
        "accounts.Module",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="payment_grant_tasks",
        db_index=True,
        help_text="Target module for the entitlement, if the payment is module-scoped.",
    )
    season = models.ForeignKey(
        "accounts.ModuleSeason",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="payment_grant_tasks",
        db_index=True,
        help_text="Target season for the entitlement, if the payment is season-scoped.",
    )
    plan = models.CharField(
        max_length=16,
        choices=[
            ("trial_7d", "Trial (7 days)"),
            ("m1", "1 month"),
            ("m3", "3 months"),
            ("m6", "6 months"),
            ("m12", "12 months"),
            ("lifetime", "Lifetime"),
        ],
        help_text="Entitlement duration plan to grant after successful payment.",
    )
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.PENDING,
        db_index=True,
        help_text="Current processing state of the entitlement grant task.",
    )
    attempt_count = models.PositiveIntegerField(
        default=0,
        help_text="Number of consumer attempts that have processed this task.",
    )
    last_error = models.TextField(
        blank=True,
        default="",
        help_text="Last processing error message, if any.",
    )
    processed_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Timestamp when the task was successfully processed.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["status", "created_at"], name="idx_paygrant_status_created"),
            models.Index(fields=["user", "status"], name="idx_paygrant_user_status"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["payment", "user", "module", "season", "plan"],
                name="uniq_paygrant_payment_scope_plan",
            )
        ]

    def __str__(self) -> str:
        return (
            "PaymentGrantTask<"
            f"payment={self.payment_id} user={self.user_id} "
            f"plan={self.plan} status={self.status}>"
        )

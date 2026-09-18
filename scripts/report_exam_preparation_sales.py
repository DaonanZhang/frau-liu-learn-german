#!/usr/bin/env python3
"""Print an all-time sales summary for the exam-preparation module."""

from __future__ import annotations

import os
import sys
from decimal import Decimal
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django  # noqa: E402


django.setup()

from django.db.models import Count, DecimalField, ExpressionWrapper, F, Subquery, Sum  # noqa: E402
from django.utils import timezone  # noqa: E402

from apps.accounts.models import AlipayWebsitePayment, PaymentGrantTask  # noqa: E402


MODULE_KEY = "exam_preparation"
SUCCESSFUL_STATUSES = (
    AlipayWebsitePayment.Status.PAID,
    AlipayWebsitePayment.Status.PARTIALLY_REFUNDED,
    AlipayWebsitePayment.Status.REFUNDED,
)
RETAINED_STATUSES = (
    AlipayWebsitePayment.Status.PAID,
    AlipayWebsitePayment.Status.PARTIALLY_REFUNDED,
)


def money(value: Decimal | None) -> str:
    return f"¥{value or Decimal('0'):.2f}"


def main() -> None:
    module_payment_ids = PaymentGrantTask.objects.filter(
        module__key=MODULE_KEY,
    ).values("payment_id")
    successful_payments = AlipayWebsitePayment.objects.filter(
        id__in=Subquery(module_payment_ids),
        status__in=SUCCESSFUL_STATUSES,
    )
    retained_payments = successful_payments.filter(status__in=RETAINED_STATUSES)

    payment_net_amount = ExpressionWrapper(
        F("total_amount") - F("refunded_amount"),
        output_field=DecimalField(max_digits=12, decimal_places=2),
    )
    amounts = successful_payments.aggregate(
        gross=Sum("total_amount"),
        refunded=Sum("refunded_amount"),
        net=Sum(payment_net_amount),
    )
    paying_users = (
        PaymentGrantTask.objects.filter(
            module__key=MODULE_KEY,
            payment__status__in=RETAINED_STATUSES,
        )
        .values("user_id")
        .distinct()
        .count()
    )
    breakdown = (
        PaymentGrantTask.objects.filter(
            module__key=MODULE_KEY,
            payment__status__in=RETAINED_STATUSES,
        )
        .values("offer__code", "offer__title", "plan")
        .annotate(
            orders=Count("payment_id", distinct=True),
            buyers=Count("user_id", distinct=True),
            net=Sum(
                ExpressionWrapper(
                    F("payment__total_amount") - F("payment__refunded_amount"),
                    output_field=DecimalField(max_digits=12, decimal_places=2),
                )
            ),
        )
        .order_by("offer__code", "plan")
    )

    print("备考季销售统计（累计）")
    print(f"统计时间：{timezone.localtime().strftime('%Y-%m-%d %H:%M:%S %Z')}")
    print(f"净销量：{retained_payments.count()} 份")
    print(f"去重购买人数：{paying_users} 人")
    print(f"历史成交订单：{successful_payments.count()} 单")
    print(
        "其中全额退款："
        f"{successful_payments.filter(status=AlipayWebsitePayment.Status.REFUNDED).count()} 单"
    )
    print(
        "其中部分退款："
        f"{successful_payments.filter(status=AlipayWebsitePayment.Status.PARTIALLY_REFUNDED).count()} 单"
    )
    print(f"历史实付：{money(amounts['gross'])}")
    print(f"已退款：{money(amounts['refunded'])}")
    print(f"净收入：{money(amounts['net'])}")
    print("套餐明细：")
    if not breakdown:
        print("  暂无成交记录")
        return
    for row in breakdown:
        code = row["offer__code"] or "unknown-offer"
        title = row["offer__title"] or row["plan"]
        print(
            f"  {title} [{code}]：{row['orders']} 份，"
            f"{row['buyers']} 人，净收入 {money(row['net'])}"
        )


if __name__ == "__main__":
    main()

from __future__ import annotations

import re
from collections import OrderedDict
from datetime import datetime
from decimal import Decimal
from pathlib import Path

import pandas as pd
from django.core.management.base import BaseCommand, CommandError

from apps.accounts.models import PaymentOrder, Entitlement, PaymentDiscountApplication


COLUMNS = ["Promotion Code", "购买商品", "购买时长", "订单金额"]
INVALID_SHEET_NAME_CHARACTERS = re.compile(r"[\\/*?:\[\]]")
PLAN_LABELS = {
    Entitlement.Plan.TRIAL_7D: "7天",
    Entitlement.Plan.MONTH_1: "30天",
    Entitlement.Plan.MONTH_2: "60天",
    Entitlement.Plan.MONTH_3: "90天",
    Entitlement.Plan.MONTH_6: "6个月",
    Entitlement.Plan.MONTH_12: "12个月",
    Entitlement.Plan.LIFETIME: "永久",
}
SUCCESSFUL_PAYMENT_STATUSES = (
    PaymentOrder.Status.PAID,
    PaymentOrder.Status.PARTIALLY_REFUNDED,
)
EXCLUDED_CAMPAIGNS = {
    "alipay-notify-e2e",
    "全模块5元无门槛测试",
    "线上功能测试",
}
EXCLUDED_ORGANIZATIONS = {
    "internal-payment-test",
    "内部测试",
}


def parse_report_datetime(value: str, option_name: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(value)
    except (TypeError, ValueError) as exc:
        raise CommandError(
            f"{option_name} must be an ISO-8601 datetime with a timezone and may include microseconds"
        ) from exc
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise CommandError(f"{option_name} must include a timezone offset")
    return parsed


def purchase_category(application: PaymentDiscountApplication) -> str:
    offer = application.offer
    if offer.module.key == "exam_preparation":
        return "备考季"
    if offer.module.key == "learning_by_video":
        season_title = offer.season.title.casefold() if offer.season_id else ""
        if "vlog" in season_title or getattr(offer.season, "season_number", None) == 4:
            return "Vlog季"
        return "科普季"
    return offer.module.name


def unique_sheet_name(campaign: str, used_names: set[str]) -> str:
    base = INVALID_SHEET_NAME_CHARACTERS.sub("_", campaign).strip(" '") or "未填写 Campaign"
    base = base[:31]
    candidate = base
    counter = 2
    while candidate.casefold() in used_names:
        suffix = f" ({counter})"
        candidate = f"{base[:31 - len(suffix)]}{suffix}"
        counter += 1
    used_names.add(candidate.casefold())
    return candidate


class Command(BaseCommand):
    help = "Export a read-only paid promotion purchase report with one Excel sheet per campaign."

    def add_arguments(self, parser) -> None:
        parser.add_argument("--start-at", required=True)
        parser.add_argument("--end-at", required=True)
        parser.add_argument("--output", required=True)

    def handle(self, *args, **options) -> None:
        start_at = parse_report_datetime(options["start_at"], "--start-at")
        end_at = parse_report_datetime(options["end_at"], "--end-at")
        if end_at <= start_at:
            raise CommandError("--end-at must be later than --start-at")

        output_path = Path(options["output"]).expanduser()
        if output_path.suffix.lower() != ".xlsx":
            raise CommandError("--output must end with .xlsx")
        if output_path.exists():
            raise CommandError(f"Output file already exists: {output_path}")

        applications = (
            PaymentDiscountApplication.objects.filter(
                status=PaymentDiscountApplication.Status.APPLIED,
                payment__provider=PaymentOrder.Provider.ALIPAY,
                payment__status__in=SUCCESSFUL_PAYMENT_STATUSES,
                applied_at__gte=start_at,
                applied_at__lt=end_at,
            )
            .exclude(campaign_name_snapshot__in=EXCLUDED_CAMPAIGNS)
            .exclude(campaign_organization_snapshot__in=EXCLUDED_ORGANIZATIONS)
            .select_related("offer__module", "offer__season", "promotion_code")
            .order_by("campaign_name_snapshot", "applied_at", "id")
        )
        grouped: OrderedDict[str, list[PaymentDiscountApplication]] = OrderedDict()
        for application in applications:
            campaign = application.campaign_name_snapshot.strip() or "未填写 Campaign"
            grouped.setdefault(campaign, []).append(application)

        if not grouped:
            raise CommandError("No paid promotion-code purchases were found in the requested interval")

        output_path.parent.mkdir(parents=True, exist_ok=True)
        used_sheet_names: set[str] = set()
        with pd.ExcelWriter(output_path, engine="openpyxl") as writer:
            for campaign, campaign_applications in grouped.items():
                total = sum(
                    (application.final_amount for application in campaign_applications),
                    start=Decimal("0.00"),
                )
                rows = [
                    {
                        "Promotion Code": application.promotion_code.code,
                        "购买商品": purchase_category(application),
                        "购买时长": PLAN_LABELS[application.offer.plan],
                        "订单金额": float(application.final_amount),
                    }
                    for application in campaign_applications
                ]
                rows.append(
                    {
                        "Promotion Code": None,
                        "购买商品": None,
                        "购买时长": "总计",
                        "订单金额": float(total),
                    }
                )
                sheet_name = unique_sheet_name(campaign, used_sheet_names)
                pd.DataFrame(rows, columns=COLUMNS).to_excel(
                    writer,
                    sheet_name=sheet_name,
                    index=False,
                )
                worksheet = writer.sheets[sheet_name]
                worksheet.freeze_panes = "A2"
                worksheet.column_dimensions["A"].width = 22
                worksheet.column_dimensions["B"].width = 14
                worksheet.column_dimensions["C"].width = 14
                worksheet.column_dimensions["D"].width = 16
                for cell in worksheet[1]:
                    cell.font = cell.font.copy(bold=True)
                for row_number in range(2, worksheet.max_row + 1):
                    worksheet.cell(row=row_number, column=4).number_format = '¥0.00'
                for cell in worksheet[worksheet.max_row]:
                    cell.font = cell.font.copy(bold=True)

        self.stdout.write(
            self.style.SUCCESS(
                f"Exported {sum(len(items) for items in grouped.values())} purchases "
                f"across {len(grouped)} campaigns to {output_path}"
            )
        )

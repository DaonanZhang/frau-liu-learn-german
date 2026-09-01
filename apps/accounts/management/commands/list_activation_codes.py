from __future__ import annotations

import json

from django.core.management.base import BaseCommand

from apps.accounts.models import ActivationCodeRecord
from apps.accounts.services.activation_codes import activation_code_hash, decrypt_activation_code


class Command(BaseCommand):
    help = "List persisted activation code records."

    def add_arguments(self, parser):
        parser.add_argument("--code", type=str, help="Exact activation code to inspect")
        parser.add_argument(
            "--status",
            type=str,
            choices=[choice for choice, _ in ActivationCodeRecord.Status.choices],
            help="Filter by persisted status",
        )
        parser.add_argument(
            "--show-code",
            action="store_true",
            help="Decrypt and print the original code for authorized operational review",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=100,
            help="Maximum number of rows to print",
        )

    def handle(self, *args, **options):
        queryset = ActivationCodeRecord.objects.select_related("consumed_by_user").order_by(
            "-created_at",
            "code_hash",
        )

        code = options.get("code")
        status = options.get("status")
        limit = max(1, options["limit"])

        if code:
            queryset = queryset.filter(code_hash=activation_code_hash(code))
        if status:
            queryset = queryset.filter(status=status)

        records = list(queryset[:limit])
        if not records:
            self.stdout.write("No activation code records found.")
            return

        for record in records:
            payload = json.dumps(record.payload, ensure_ascii=False, sort_keys=True)
            user_label = (
                record.consumed_by_user.telephone
                if record.consumed_by_user_id
                else "-"
            )
            code_label = decrypt_activation_code(record.code_ciphertext) if options["show_code"] else "[hidden]"
            self.stdout.write(
                (
                    f"code={code_label} "
                    f"code_hash={record.code_hash} "
                    f"remark={record.remark or '-'} "
                    f"status={record.status} "
                    f"created_at={record.created_at.isoformat()} "
                    f"expires_at={record.expires_at.isoformat()} "
                    f"consumed_at={record.consumed_at.isoformat() if record.consumed_at else '-'} "
                    f"consumed_by={user_label} "
                    f"payload={payload}"
                )
            )

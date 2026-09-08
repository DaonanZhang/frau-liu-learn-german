from django.core.management.base import BaseCommand, CommandError

from apps.accounts.tasks import reconcile_alipay_payments_now


class Command(BaseCommand):
    help = "Reconcile Alipay orders and retry paid entitlement grants."

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=100)

    def handle(self, *args, **options):
        limit = options["limit"]
        if limit < 1 or limit > 1000:
            raise CommandError("--limit must be between 1 and 1000")
        stats = reconcile_alipay_payments_now(limit=limit)
        self.stdout.write(self.style.SUCCESS(str(stats)))

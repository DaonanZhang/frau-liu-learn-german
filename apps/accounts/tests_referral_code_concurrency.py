from threading import Barrier, Thread

from django.contrib.auth import get_user_model
from django.db import close_old_connections, connection, connections
from django.test import TransactionTestCase, skipUnlessDBFeature

from apps.accounts.models import Entitlement, Module, PromotionCodeRecord, ReferralCode
from apps.accounts.services.referral_campaign import CAMPAIGN_TAG, ensure_referral_code


class EnsureReferralCodeConcurrencyTests(TransactionTestCase):
    reset_sequences = True

    @skipUnlessDBFeature("has_select_for_update")
    def test_concurrent_calls_create_one_linked_referral_and_promotion(self):
        user = get_user_model().objects.create_user(
            telephone="13600990001", password="pass"
        )
        Entitlement.objects.create(
            user=user,
            module=Module.objects.get(key="exam_preparation"),
            plan=Entitlement.Plan.MONTH_1,
        )
        start = Barrier(2)
        results = [None, None]
        errors = [None, None]

        def worker(index):
            close_old_connections()
            try:
                start.wait(timeout=10)
                results[index] = ensure_referral_code(user=user)
            except BaseException as exc:
                errors[index] = exc
            finally:
                connections.close_all()

        threads = [Thread(target=worker, args=(index,), daemon=True) for index in range(2)]
        try:
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join(timeout=30)
            self.assertFalse(any(thread.is_alive() for thread in threads), "worker timed out")
            self.assertEqual(errors, [None, None])
            self.assertEqual(results[0].pk, results[1].pk)
            self.assertEqual(results[0].promotion_code_id, results[1].promotion_code_id)

            referrals = ReferralCode.objects.filter(
                user_id=user.pk, campaign_tag=CAMPAIGN_TAG
            )
            self.assertEqual(referrals.count(), 1)
            referral = referrals.get()
            self.assertEqual(
                PromotionCodeRecord.objects.filter(
                    pk=referral.promotion_code_id,
                    source_kind=PromotionCodeRecord.SourceKind.REFERRAL,
                    referral_code__user_id=user.pk,
                    referral_code__campaign_tag=CAMPAIGN_TAG,
                ).count(),
                1,
            )
        finally:
            start.abort()
            for thread in threads:
                if thread.ident is not None:
                    thread.join(timeout=30)
            connection.close()

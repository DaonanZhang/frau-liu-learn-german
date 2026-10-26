from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import Entitlement, Module
from apps.accounts.services.entitlement_grant_service import (
    ExistingLifetimeAccessError,
    grant_or_extend_entitlement,
)


class EntitlementLifetimeSemanticsTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            telephone="13700137001", password="pass"
        )
        self.module, _ = Module.objects.get_or_create(
            key="exam_preparation", defaults={"name": "Exam Preparation"}
        )
        self.other_module, _ = Module.objects.get_or_create(
            key="science", defaults={"name": "Science"}
        )

    def _entitlement(self, *, module, plan, external_ref, expires_at=None):
        return Entitlement.objects.create(
            user=self.user,
            module=module,
            season=None,
            plan=plan,
            status=Entitlement.Status.ACTIVE,
            starts_at=timezone.now() - timedelta(days=1),
            expires_at=expires_at,
            external_ref=external_ref,
        )

    def _grant(self, *, external_ref, reject_if_lifetime):
        return grant_or_extend_entitlement(
            user=self.user,
            module=self.module,
            season=None,
            plan=Entitlement.Plan.MONTH_1,
            external_ref=external_ref,
            reject_if_lifetime=reject_if_lifetime,
        )

    def test_malformed_module_row_does_not_suppress_paid_grant_when_rejecting(self):
        malformed = self._entitlement(
            module=self.module,
            plan=Entitlement.Plan.MONTH_1,
            external_ref="malformed",
        )
        before = timezone.now()

        granted = self._grant(external_ref="paid-reject", reject_if_lifetime=True)

        self.assertNotEqual(granted.pk, malformed.pk)
        self.assertEqual(granted.external_ref, "paid-reject")
        self.assertEqual(granted.plan, Entitlement.Plan.MONTH_1)
        self.assertEqual(granted.expires_at - granted.starts_at, timedelta(days=30))
        self.assertGreaterEqual(granted.starts_at, before)

    def test_malformed_module_row_does_not_suppress_paid_grant_without_rejecting(self):
        malformed = self._entitlement(
            module=self.module,
            plan=Entitlement.Plan.MONTH_1,
            external_ref="malformed",
        )

        granted = self._grant(external_ref="paid-allow", reject_if_lifetime=False)

        self.assertNotEqual(granted.pk, malformed.pk)
        self.assertEqual(granted.external_ref, "paid-allow")

    def test_module_lifetime_is_rejected_or_returned_according_to_flag(self):
        lifetime = self._entitlement(
            module=self.module,
            plan=Entitlement.Plan.LIFETIME,
            external_ref="module-lifetime",
        )

        with self.assertRaises(ExistingLifetimeAccessError):
            self._grant(external_ref="paid-reject", reject_if_lifetime=True)

        returned = self._grant(external_ref="paid-allow", reject_if_lifetime=False)

        self.assertEqual(returned.pk, lifetime.pk)
        self.assertEqual(Entitlement.objects.count(), 1)

    def test_platform_lifetime_covers_module(self):
        lifetime = self._entitlement(
            module=None,
            plan=Entitlement.Plan.LIFETIME,
            external_ref="platform-lifetime",
        )

        with self.assertRaises(ExistingLifetimeAccessError):
            self._grant(external_ref="paid-reject", reject_if_lifetime=True)

        returned = self._grant(external_ref="paid-allow", reject_if_lifetime=False)

        self.assertEqual(returned.pk, lifetime.pk)
        self.assertEqual(Entitlement.objects.count(), 1)

    def test_other_module_lifetime_does_not_cover_exam_module(self):
        self._entitlement(
            module=self.other_module,
            plan=Entitlement.Plan.LIFETIME,
            external_ref="other-module-lifetime",
        )

        granted = self._grant(external_ref="exam-paid", reject_if_lifetime=True)

        self.assertEqual(granted.module_id, self.module.pk)
        self.assertEqual(granted.external_ref, "exam-paid")

    def test_exact_external_ref_remains_idempotent(self):
        existing = self._entitlement(
            module=self.module,
            plan=Entitlement.Plan.MONTH_1,
            external_ref="same-ref",
            expires_at=timezone.now() + timedelta(days=10),
        )

        returned = self._grant(external_ref="same-ref", reject_if_lifetime=True)

        self.assertEqual(returned.pk, existing.pk)
        self.assertEqual(Entitlement.objects.count(), 1)

from __future__ import annotations

import shutil
import tempfile
import re
from datetime import timedelta
from io import StringIO
from pathlib import Path
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import ActivationCodeRecord, Entitlement, Module, ModuleSeason
from apps.accounts.security.activation import apply_activation_code_for_user
from apps.accounts.services.activation_codes import (
    ActivationEntitlementItem,
    ActivationPayload,
    ActivationPlan,
    consume_activation_code,
    revoke_activation_code,
    store_activation_code,
    verify_activation_code,
)
from apps.accounts.services.email_service import send_password_reset_email
from apps.accounts.services.password_reset_codes import verify_password_reset_code


class UserGuideStateApiTests(APITestCase):
    def setUp(self) -> None:
        super().setUp()
        self.user = get_user_model().objects.create_user(
            telephone="13800138009",
            country_code="+86",
            password="pass-123456",
        )
        self.client.force_authenticate(user=self.user)

    def test_me_returns_unseen_schreiben_guide_by_default(self) -> None:
        response = self.client.get("/api/accounts/users/me/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["has_seen_schreiben_guide"])
        self.assertTrue(response.data["exam_preparation_release_access"])

    @override_settings(EXAM_PREPARATION_COMING_SOON_ENABLED=True)
    def test_me_only_exposes_exam_preparation_preview_to_telephone_110(self) -> None:
        response = self.client.get("/api/accounts/users/me/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["exam_preparation_release_access"])

        preview_user = get_user_model().objects.create_user(
            telephone="110",
            country_code="+86",
            password="pass-123456",
        )
        self.client.force_authenticate(user=preview_user)
        preview_response = self.client.get("/api/accounts/users/me/")
        self.assertEqual(preview_response.status_code, status.HTTP_200_OK)
        self.assertTrue(preview_response.data["exam_preparation_release_access"])

    def test_me_can_mark_schreiben_guide_as_seen(self) -> None:
        response = self.client.patch(
            "/api/accounts/users/me/",
            {"has_seen_schreiben_guide": True},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["has_seen_schreiben_guide"])
        self.user.refresh_from_db()
        self.assertTrue(self.user.has_seen_schreiben_guide)


@override_settings(
    MAINTENANCE_MODE_ENABLED=True,
    MAINTENANCE_ALLOWED_TELEPHONES="110,11223344551",
)
class MaintenanceModeAllowlistTests(APITestCase):
    def setUp(self) -> None:
        super().setUp()
        self.allowed_user = get_user_model().objects.create_user(
            telephone="11223344551",
            country_code="+86",
            password="pass-123456",
        )
        self.blocked_user = get_user_model().objects.create_user(
            telephone="13800138088",
            country_code="+86",
            password="pass-123456",
        )

    def test_second_allowlisted_telephone_can_login_and_use_authenticated_api(self) -> None:
        login_response = self.client.post(
            "/api/accounts/auth/login/",
            {
                "telephone": self.allowed_user.telephone,
                "country_code": "+86",
                "password": "pass-123456",
            },
            format="json",
        )
        self.assertEqual(login_response.status_code, status.HTTP_200_OK)

        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {login_response.data['access']}"
        )
        me_response = self.client.get("/api/accounts/users/me/")
        self.assertEqual(me_response.status_code, status.HTTP_200_OK)

    def test_non_allowlisted_telephone_cannot_login(self) -> None:
        response = self.client.post(
            "/api/accounts/auth/login/",
            {
                "telephone": self.blocked_user.telephone,
                "country_code": "+86",
                "password": "pass-123456",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    EMAIL_ENABLED=True,
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "password-reset-tests",
        }
    },
)
class PasswordResetApiTests(APITestCase):
    @staticmethod
    def _extract_code_from_html(html: str) -> str:
        match = re.search(r"\b(\d{6})\b", html)
        if not match:
            raise AssertionError("No 6-digit reset code found in email HTML")
        return match.group(1)

    def setUp(self) -> None:
        super().setUp()
        cache.clear()
        self.email_patcher = patch(
            "apps.accounts.security.password_reset.send_password_reset_email_async",
            side_effect=send_password_reset_email,
        )
        self.email_patcher.start()
        self.user = get_user_model().objects.create_user(
            telephone="13800138000",
            country_code="+86",
            password="old-pass-123",
            email="learner@example.com",
        )

    def tearDown(self) -> None:
        self.email_patcher.stop()
        super().tearDown()

    def test_request_password_reset_sends_email_and_stores_code(self) -> None:
        response = self.client.post(
            "/api/accounts/auth/password-reset/request/",
            {"email": "learner@example.com"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("密码重置验证码", mail.outbox[0].subject)
        self.assertIn("learner@example.com", mail.outbox[0].to)

        html_body = mail.outbox[0].alternatives[0][0]
        self.assertIn("符号刘的德语素材库", html_body)

        code = self._extract_code_from_html(html_body)
        self.assertTrue(
            verify_password_reset_code(
                email="learner@example.com",
                code=code,
            )
        )

    def test_confirm_password_reset_updates_password(self) -> None:
        request_response = self.client.post(
            "/api/accounts/auth/password-reset/request/",
            {"email": "learner@example.com"},
            format="json",
        )
        self.assertEqual(request_response.status_code, status.HTTP_200_OK)

        html_body = mail.outbox[0].alternatives[0][0]
        code = self._extract_code_from_html(html_body)

        response = self.client.post(
            "/api/accounts/auth/password-reset/confirm/",
            {
                "email": "learner@example.com",
                "code": code,
                "new_password": "new-pass-456",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("new-pass-456"))

    def test_request_password_reset_unknown_email_is_still_success(self) -> None:
        response = self.client.post(
            "/api/accounts/auth/password-reset/request/",
            {"email": "missing@example.com"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 0)


@override_settings(
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "activation-code-tests",
        }
    },
)
class ActivationCodeApiTests(APITestCase):
    def setUp(self) -> None:
        super().setUp()
        cache.clear()
        self.module = Module.objects.create(
            key="learning_by_video",
            name="Learning by Video",
            is_active=True,
        )
        self.season1 = ModuleSeason.objects.create(
            module=self.module,
            season_number=1,
            title="Season 1",
        )
        self.season4 = ModuleSeason.objects.create(
            module=self.module,
            season_number=4,
            title="Vlog季",
        )
        self.user = get_user_model().objects.create_user(
            telephone="13800138000",
            country_code="+86",
            password="pass-123456",
            email="learner@example.com",
        )

    @staticmethod
    def _store_code(code: str, season_number: int) -> None:
        payload = ActivationPayload(
            entitlements=[
                ActivationEntitlementItem(
                    module_key="learning_by_video",
                    plan=ActivationPlan.LIFETIME,
                    season_number=season_number,
                )
            ]
        )
        store_activation_code(code=code, payload=payload)

    @staticmethod
    def _store_redis_only_code(code: str, season_number: int) -> None:
        payload = ActivationPayload(
            entitlements=[
                ActivationEntitlementItem(
                    module_key="learning_by_video",
                    plan=ActivationPlan.LIFETIME,
                    season_number=season_number,
                )
            ]
        )
        cache.set(
            f"activation_code:{code}",
            payload.to_dict(),
            timeout=3600,
        )

    def test_verify_activation_code_endpoint_returns_payload(self) -> None:
        self._store_code("SEASON1A", season_number=1)

        response = self.client.post(
            "/api/accounts/auth/register/verify-code/",
            {"code": "SEASON1A"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data,
            {
                "entitlements": [
                    {
                        "module": "learning_by_video",
                        "plan": "lifetime",
                        "season_number": 1,
                    }
                ]
            },
        )

    def test_verify_activation_code_endpoint_rejects_invalid_code(self) -> None:
        response = self.client.post(
            "/api/accounts/auth/register/verify-code/",
            {"code": "MISSING01"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "激活码无效或已过期。")

    def test_new_database_code_is_also_mirrored_to_redis(self) -> None:
        with self.captureOnCommitCallbacks(execute=True):
            self._store_code("DUALSTORE", season_number=1)

        self.assertEqual(
            cache.get("activation_code:DUALSTORE"),
            {
                "entitlements": [
                    {
                        "module": "learning_by_video",
                        "plan": "lifetime",
                        "season_number": 1,
                    }
                ]
            },
        )

    def test_redis_only_legacy_code_can_be_previewed(self) -> None:
        self._store_redis_only_code("REDISPREVIEW", season_number=1)

        response = self.client.post(
            "/api/accounts/auth/register/verify-code/",
            {"code": "redispreview"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(ActivationCodeRecord.objects.filter(code="REDISPREVIEW").exists())

    def test_redis_only_legacy_code_is_persisted_and_consumed(self) -> None:
        self._store_redis_only_code("REDISLEGACY", season_number=4)
        self.client.force_authenticate(user=self.user)

        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(
                "/api/accounts/auth/redeem-code/",
                {"code": "redislegacy"},
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["type"], "activation")
        record = ActivationCodeRecord.objects.get(code="REDISLEGACY")
        self.assertEqual(record.status, ActivationCodeRecord.Status.CONSUMED)
        self.assertEqual(record.consumed_by_user_id, self.user.id)
        self.assertIsNone(cache.get("activation_code:REDISLEGACY"))

    def test_failed_redis_only_redemption_keeps_legacy_code(self) -> None:
        self._store_redis_only_code("REDISROLLBACK", season_number=1)

        with patch(
            "apps.accounts.security.activation.grant_or_extend_entitlement",
            side_effect=ValueError("database grant failed"),
        ):
            with self.assertRaisesRegex(ValueError, "database grant failed"):
                apply_activation_code_for_user(user=self.user, code="redisrollback")

        self.assertFalse(
            ActivationCodeRecord.objects.filter(code="REDISROLLBACK").exists()
        )
        self.assertIsNotNone(cache.get("activation_code:REDISROLLBACK"))

    @override_settings(EXAM_PREPARATION_COMING_SOON_ENABLED=True)
    def test_exam_preview_gate_rejects_other_users_without_consuming_code(self) -> None:
        Module.objects.get_or_create(
            key="exam_preparation",
            defaults={"name": "备考季", "is_active": True},
        )
        payload = ActivationPayload(
            entitlements=[
                ActivationEntitlementItem(
                    module_key="exam_preparation",
                    plan=ActivationPlan.LIFETIME,
                )
            ]
        )
        store_activation_code(code="EXAMPREVIEW", payload=payload)

        with self.assertRaisesRegex(ValueError, "备考季即将上线"):
            apply_activation_code_for_user(user=self.user, code="EXAMPREVIEW")

        record = ActivationCodeRecord.objects.get(code="EXAMPREVIEW")
        self.assertEqual(record.status, ActivationCodeRecord.Status.ACTIVE)
        self.assertFalse(
            Entitlement.objects.filter(user=self.user, module__key="exam_preparation").exists()
        )

    def test_apply_activation_code_creates_season_entitlement_and_consumes_code(self) -> None:
        self._store_code("SEASON4A", season_number=4)
        self.client.force_authenticate(user=self.user)

        response = self.client.post(
            "/api/accounts/auth/activate-code/",
            {"code": "SEASON4A"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["entitlements"]), 1)
        entitlement_data = response.data["entitlements"][0]
        self.assertEqual(entitlement_data["scope"], "module:learning_by_video:season:4")
        self.assertEqual(entitlement_data["module"]["key"], "learning_by_video")
        self.assertEqual(entitlement_data["season"]["season_number"], 4)
        self.assertEqual(entitlement_data["plan"], "lifetime")
        self.assertEqual(entitlement_data["status"], "active")
        self.assertTrue(entitlement_data["is_valid_now"])

        entitlement = Entitlement.objects.get(user=self.user)
        self.assertEqual(entitlement.module_id, self.module.id)
        self.assertEqual(entitlement.season_id, self.season4.id)
        self.assertEqual(entitlement.plan, Entitlement.Plan.LIFETIME)
        self.assertEqual(entitlement.status, Entitlement.Status.ACTIVE)
        self.assertTrue(entitlement.external_ref.startswith("activation_code:"))
        self.assertIsNone(entitlement.expires_at)
        self.assertIsNone(verify_activation_code("SEASON4A"))

    def test_apply_activation_code_is_single_use(self) -> None:
        self._store_code("ONETIME1", season_number=1)
        self.client.force_authenticate(user=self.user)

        first = self.client.post(
            "/api/accounts/auth/activate-code/",
            {"code": "ONETIME1"},
            format="json",
        )
        second = self.client.post(
            "/api/accounts/auth/activate-code/",
            {"code": "ONETIME1"},
            format="json",
        )

        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(second.data["detail"], "Invalid or expired activation code")

        record = ActivationCodeRecord.objects.get(code="ONETIME1")
        self.assertEqual(record.status, ActivationCodeRecord.Status.CONSUMED)
        self.assertEqual(record.consumed_by_user_id, self.user.id)

    def test_persisted_activation_code_uses_normalized_plaintext(self) -> None:
        self._store_code("TRACK001", season_number=1)

        record = ActivationCodeRecord.objects.get(code="TRACK001")

        self.assertEqual(record.code, "TRACK001")
        self.assertFalse(hasattr(record, "code_hash"))
        self.assertFalse(hasattr(record, "code_ciphertext"))
        self.assertEqual(record.status, ActivationCodeRecord.Status.ACTIVE)

    def test_activation_code_remark_is_kept_in_durable_record(self) -> None:
        payload = ActivationPayload(
            entitlements=[
                ActivationEntitlementItem(
                    module_key="learning_by_video",
                    plan=ActivationPlan.LIFETIME,
                    season_number=1,
                )
            ],
            remark="2026 秋季渠道 A",
        )
        store_activation_code(code="REMARK01", payload=payload)

        verified = verify_activation_code("REMARK01")
        record = ActivationCodeRecord.objects.get(code="REMARK01")
        self.assertEqual(verified.remark, "2026 秋季渠道 A")
        self.assertEqual(record.remark, "2026 秋季渠道 A")

        apply_activation_code_for_user(user=self.user, code="REMARK01")
        record.refresh_from_db()
        self.assertEqual(record.consumed_by_user, self.user)
        self.assertIsNotNone(record.consumed_at)
        self.assertEqual(record.code, "REMARK01")

    def test_compatible_consume_service_marks_plaintext_record(self) -> None:
        self._store_code("CONSUME1", season_number=1)

        consume_activation_code("consume1", user=self.user)

        record = ActivationCodeRecord.objects.get(code="CONSUME1")
        self.assertEqual(record.status, ActivationCodeRecord.Status.CONSUMED)
        self.assertEqual(record.consumed_by_user_id, self.user.id)
        self.assertIsNone(verify_activation_code("CONSUME1"))

    def test_revoke_activation_code_command_uses_plaintext_lookup(self) -> None:
        self._store_code("REVOKE01", season_number=1)
        output = StringIO()

        call_command("revoke_activation_code", "revoke01", stdout=output)

        record = ActivationCodeRecord.objects.get(code="REVOKE01")
        self.assertEqual(record.status, ActivationCodeRecord.Status.REVOKED)
        self.assertIsNone(verify_activation_code("REVOKE01"))
        self.assertIn("Revoked activation code: revoke01", output.getvalue())
        self.assertTrue(revoke_activation_code("REVOKE01"))

    def test_list_activation_codes_filters_and_displays_plaintext(self) -> None:
        self._store_code("LISTCODE1", season_number=1)
        output = StringIO()

        call_command(
            "list_activation_codes",
            code="listcode1",
            stdout=output,
        )

        rendered = output.getvalue()
        self.assertIn("code=LISTCODE1", rendered)
        self.assertIn("status=active", rendered)

    def test_database_status_blocks_reuse_of_redeemed_code(self) -> None:
        self._store_code("LEDGER01", season_number=1)
        apply_activation_code_for_user(user=self.user, code="LEDGER01")

        self.assertIsNone(verify_activation_code("LEDGER01"))
        with self.assertRaisesRegex(ValueError, "Invalid or expired"):
            apply_activation_code_for_user(user=self.user, code="LEDGER01")

    def test_failed_database_grant_does_not_consume_activation_code(self) -> None:
        self._store_code("ROLLBACK1", season_number=1)

        with patch(
            "apps.accounts.security.activation.grant_or_extend_entitlement",
            side_effect=ValueError("database grant failed"),
        ):
            with self.assertRaisesRegex(ValueError, "database grant failed"):
                apply_activation_code_for_user(user=self.user, code="ROLLBACK1")

        record = ActivationCodeRecord.objects.get(code="ROLLBACK1")
        self.assertEqual(record.status, ActivationCodeRecord.Status.ACTIVE)
        self.assertIsNotNone(verify_activation_code("ROLLBACK1"))

    def test_exam_preparation_60_day_code_extends_current_access(self) -> None:
        exam_module, _ = Module.objects.get_or_create(
            key="exam_preparation",
            defaults={"name": "备考季", "is_active": True},
        )
        current_expiry = timezone.now() + timedelta(days=15)
        Entitlement.objects.create(
            user=self.user,
            module=exam_module,
            season=None,
            plan=Entitlement.Plan.MONTH_1,
            status=Entitlement.Status.ACTIVE,
            expires_at=current_expiry,
        )
        store_activation_code(
            code="EXAM60D1",
            payload=ActivationPayload(
                entitlements=[
                    ActivationEntitlementItem(
                        module_key="exam_preparation",
                        plan=ActivationPlan.M2,
                    )
                ]
            ),
        )
        self.client.force_authenticate(user=self.user)

        response = self.client.post(
            "/api/accounts/auth/activate-code/",
            {"code": "exam60d1"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        extension = Entitlement.objects.get(
            user=self.user,
            module=exam_module,
            plan=Entitlement.Plan.MONTH_2,
        )
        self.assertEqual(extension.starts_at, current_expiry)
        self.assertEqual(extension.expires_at, current_expiry + timedelta(days=60))

    def test_generate_exam_preparation_codes_command_stores_requested_plan(self) -> None:
        Module.objects.get_or_create(
            key="exam_preparation",
            defaults={"name": "备考季", "is_active": True},
        )
        output = StringIO()

        call_command(
            "generate_exam_preparation_codes",
            days=90,
            count=2,
            stdout=output,
        )

        codes = [line for line in output.getvalue().splitlines() if not line.startswith("#")]
        self.assertEqual(len(codes), 2)
        self.assertNotEqual(codes[0], codes[1])
        for code in codes:
            payload = verify_activation_code(code)
            self.assertIsNotNone(payload)
            self.assertEqual(payload.entitlements[0].module_key, "exam_preparation")
            self.assertEqual(payload.entitlements[0].plan, ActivationPlan.M3)


class HomepageSettingApiTests(APITestCase):
    def setUp(self) -> None:
        super().setUp()
        self.temp_dir = tempfile.mkdtemp()
        self.qr_path = Path(self.temp_dir) / "wechat-qr.png"
        self.qr_path.write_bytes(b"old-image")
        self.dist_qr_path = (
            Path(self.temp_dir) / "frontend" / "dist" / "images" / "wechat-qr.png"
        )
        self.dist_qr_path.parent.mkdir(parents=True, exist_ok=True)
        self.dist_qr_path.write_bytes(b"old-dist-image")
        self.override = override_settings(
            BASE_DIR=Path(self.temp_dir),
            HOMEPAGE_WECHAT_QR_IMAGE_PATH=str(self.qr_path),
        )
        self.override.enable()
        self.admin_user = get_user_model().objects.create_user(
            telephone="13900139000",
            country_code="+86",
            password="pass-123456",
            is_superuser=True,
            is_staff=True,
        )
        self.normal_user = get_user_model().objects.create_user(
            telephone="13800138000",
            country_code="+86",
            password="pass-123456",
        )

    def tearDown(self) -> None:
        self.override.disable()
        shutil.rmtree(self.temp_dir, ignore_errors=True)
        super().tearDown()

    def test_get_wechat_qr_returns_default_state(self) -> None:
        self.client.force_authenticate(user=self.normal_user)

        response = self.client.get("/api/accounts/homepage-settings/wechat-qr/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("/images/wechat-qr.png?v=", response.data["wechat_qr_image_url"])
        self.assertFalse(response.data["can_manage"])

    def test_non_superuser_cannot_upload_wechat_qr(self) -> None:
        self.client.force_authenticate(user=self.normal_user)

        response = self.client.post(
            "/api/accounts/homepage-settings/wechat-qr/",
            {
                "wechat_qr_image": SimpleUploadedFile(
                    "qr.png",
                    b"fake-image-content",
                    content_type="image/png",
                )
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_superuser_can_upload_wechat_qr(self) -> None:
        self.client.force_authenticate(user=self.admin_user)

        response = self.client.post(
            "/api/accounts/homepage-settings/wechat-qr/",
            {
                "wechat_qr_image": SimpleUploadedFile(
                    "qr.png",
                    b"new-image-content",
                    content_type="image/png",
                )
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["can_manage"])
        self.assertEqual(self.qr_path.read_bytes(), b"new-image-content")
        self.assertEqual(self.dist_qr_path.read_bytes(), b"new-image-content")
        self.assertIn("/images/wechat-qr.png?v=", response.data["wechat_qr_image_url"])

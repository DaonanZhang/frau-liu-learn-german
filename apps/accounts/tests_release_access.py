from types import SimpleNamespace

from django.test import SimpleTestCase, override_settings

from apps.accounts.permissions.release_access import HasReleaseAccess


@override_settings(COMING_SOON=True, RELEASE_ACCESS_TELEPHONES=("110",))
class ReleaseAccessPermissionTests(SimpleTestCase):
    def test_views_can_customize_denial_without_changing_other_views(self):
        request = SimpleNamespace(user=SimpleNamespace(is_authenticated=True, telephone="11223344551"))
        custom_denial = {"message": "新功能准备中", "code": "another_feature_coming_soon"}
        permission = HasReleaseAccess()

        self.assertFalse(permission.has_permission(request, SimpleNamespace(release_access_denial=custom_denial)))
        self.assertEqual(permission.message, custom_denial)
        self.assertFalse(permission.has_permission(request, SimpleNamespace()))
        self.assertEqual(permission.message, {"message": "此功能即将上线，敬请期待。", "code": "coming_soon"})

    def test_allowlisted_user_can_access(self):
        request = SimpleNamespace(user=SimpleNamespace(is_authenticated=True, telephone="110"))
        self.assertTrue(HasReleaseAccess().has_permission(request, SimpleNamespace()))

    @override_settings(COMING_SOON=False)
    def test_disabled_gate_allows_other_users(self):
        request = SimpleNamespace(user=SimpleNamespace(is_authenticated=True, telephone="11223344551"))
        self.assertTrue(HasReleaseAccess().has_permission(request, SimpleNamespace()))

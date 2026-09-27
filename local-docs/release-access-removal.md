# Temporary release access

`COMING_SOON=True` enables the temporary allowlist in `RELEASE_ACCESS_TELEPHONES`.
Currently only mock-exam APIs and their frontend entry points use this policy.
Existing exam preparation exercises, purchases and activation are independent.
The frontend keeps the Coming Soon teaser visible. The backend is authoritative.

## Reuse

Add `HasReleaseAccess` to an API view's existing permission classes and supply
`release_access_denial = {"message": "...", "code": "..."}` on the view.
Omitting this parameter uses the generic Coming Soon response. Keep feature copy
in the consuming feature; mock exam views share `MOCK_EXAM_RELEASE_ACCESS_DENIAL`.
This permission does not replace authentication or purchase entitlement checks.
The flag and allowlist are shared: this is a one-off release gate, not a system
for independently scheduling multiple feature launches.

## Launch and removal

1. Set `COMING_SOON=False` in each deployment environment and restart all backend
   workers. Existing frontend sessions refresh their user state on focus or
   periodically; refresh the page to see the released entry immediately.
2. Remove frontend release conditions from `ModuleAccessGate`, `Navigator` and
   `ExamPreparationModulePage`, including the Coming Soon branch, the
   `hasReleaseAccess` variable and its effect dependency. Keep the normal start,
   continue, history, purchase and entitlement behavior. Deploy this frontend
   before removing the API field.
3. Remove `HasReleaseAccess` from the three mock exam viewsets, their
   `release_access_denial` attributes and `MOCK_EXAM_RELEASE_ACCESS_DENIAL`.
   Keep `IsAuthenticated`, `HasValidEntitlement`, `required_module_key` and
   record ownership checks.
4. Remove `release_access` and its getter/import from the user serializer.
   Delete the release permission module and its export. Remove the release
   helper functions from `feature_flags.py` (delete the file only if empty),
   then remove `COMING_SOON` and `RELEASE_ACCESS_TELEPHONES` from settings.
5. Remove temporary-gate tests and fixtures; retain regression coverage for
   normal paid/trial access, ownership, purchase and activation. Remove this
   document and its settings reference as part of the cleanup.
6. After deploying the backend cleanup, remove `COMING_SOON` from environment
   configuration. Run the accounts and exam preparation suites, frontend tests
   and build. Verify a normal paid user can start/continue an exam and view
   history, while trial users retain the existing purchase restrictions.

Before cleanup, locate all spellings (snake case, camel case and uppercase):

```sh
rg -n 'release_access|ReleaseAccess|RELEASE_ACCESS|COMING_SOON|coming_soon' apps config frontend/src local-docs
```

API field renames require coordinated frontend/backend deployment. During
removal, keeping the field until the frontend stops using it avoids stale UI.

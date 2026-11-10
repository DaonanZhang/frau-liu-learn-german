# Device Session Recovery Design

## Intent

When an authenticated browser returns after its device-session lease expired, restore the lease automatically whenever the account is still allowed to use another active device. Only ask the learner to sign in again after automatic recovery has been exhausted. This keeps a recoverable idle session from looking like a broken video while preventing repeated 403 requests when recovery is impossible.

## Goals

- Treat `403 device_session_inactive` as a recoverable authentication state before showing an error.
- Coalesce concurrent recovery attempts so that one heartbeat and one activity retry serve all requests that fail at the same time.
- Retry each affected API request at most once after a successful recovery.
- If the stored activity has been closed, create a new activity and retry the heartbeat once.
- If authentication recovery still fails with an authentication/session conflict, stop new authenticated API traffic and show one global sign-in modal.
- Preserve the existing heartbeat cadence and foreground recovery behavior.
- Give the video study page a clear expired-login state instead of a black player or generic video/subtitle failure.
- Keep expected device-session expiry out of generic client-error reporting, or tag it separately as an expected authentication event.

## Non-goals

- Do not change the backend lease duration or device-limit rules.
- Do not change video storage, HLS delivery, COS behavior, or media URLs.
- Do not automatically clear tokens merely because the device lease expired.
- Do not treat ordinary network outages or server errors as proof that the user must sign in again.

## Anti-goals

- Do not create an endless heartbeat/request retry loop.
- Do not let multiple simultaneous 403 responses open multiple dialogs or launch multiple recovery heartbeats.
- Do not keep sending normal authenticated API requests after recovery has reached a terminal failure.
- Do not obscure a real media playback failure with the session-expired message when authentication is healthy.

## Chosen Approach

Introduce a small device-session coordinator shared by the API client, heartbeat code, and `AuthProvider`.

1. `apiFetch` receives `403 device_session_inactive`.
2. It joins a single in-flight recovery promise instead of starting its own independent recovery.
3. Recovery sends a device heartbeat using the current activity ID.
4. If the heartbeat returns `409 device_activity_closed`, recovery clears only that activity ID, creates a new one, and sends one final heartbeat.
5. A successful heartbeat reactivates the lease. The original API call is replayed once.
6. If recovery ends in `401`, `403`, or a second `409` session/authentication response, the coordinator enters a terminal expired state. Later authenticated API calls fail locally without reaching the server.
7. Network errors and unrelated 5xx responses do not enter the terminal expired state; they remain ordinary transient failures.
8. `AuthProvider` listens to the coordinator and displays one modal. “重新登录” reloads the page so bootstrap can create/recover the activity. “退出登录” clears local authentication state and navigates to `/login`.

The existing alternative of patching global `window.fetch` is rejected because it could interfere with login, logout, media, and third-party requests. Page-by-page handling is rejected because it cannot reliably coalesce recovery or stop the request storm.

## Heartbeat Behavior

- Keep the existing one-minute and five-minute heartbeat timers unchanged in this minimal fix.
- Keep the existing immediate heartbeat when the document becomes visible or the window regains focus.
- Deduplicate overlapping timer, focus, visibility, and API-triggered recovery through the shared recovery promise.
- On the first `device_activity_closed`, rotate the activity ID and retry once.
- On terminal authentication/session failure, trigger the same global expired state used by `apiFetch`.

## Global Modal

The modal is functional guidance, not promotional copy.

- Message: `您的登录会话已过期，请退出后重新登录`
- Primary action: `重新登录`
- Secondary action: `退出登录`
- It cannot be dismissed by backdrop click or Escape while the terminal state is active.
- It traps focus, locks background scrolling, and remains usable at desktop, tablet, and mobile widths.

Refreshing is intentionally attempted before token removal. Explicit logout clears tokens and other existing logout-owned local state before navigating to `/login`.

## Video Study Page

If video metadata, subtitles, notes, or related API requests fail because the coordinator reached the terminal expired state, the page replaces generic API/video failure copy with:

`登录状态已过期，请重新登录后继续观看`

It provides a `重新登录` button. Real HLS/media errors remain distinct and keep their normal playback-error presentation.

## Error Reporting

Device-session recovery errors are expected authentication events. They must not be added to the generic client-error buffer as ordinary video or JavaScript failures. If retained for diagnostics, they use a dedicated `device_session_recovery` category and must not contain tokens or request bodies.

## Testing

- API client: inactive response, successful coalesced recovery, one request replay, terminal failure gate, and unrelated errors.
- Activity recovery: current activity succeeds; first 409 rotates activity and succeeds; second failure becomes terminal.
- Auth provider: five-minute visible heartbeat, foreground heartbeat, single modal, reload action, and logout/navigation action.
- Video page: terminal session state renders the exact dedicated message and action; real playback errors remain separate.
- Error buffer: expected session errors are excluded or categorized separately.

No browser-based verification is included unless explicitly requested. Automated component and unit tests cover desktop-independent behavior, and responsive CSS is reviewed through the existing frontend layout rules.

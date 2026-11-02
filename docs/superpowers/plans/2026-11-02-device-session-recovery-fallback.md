# Device Session Recovery Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the existing automatic activity recovery and add one reliable sign-in fallback when recovery cannot restore an expired device session.

**Architecture:** Extract the existing device activity heartbeat/retry behavior into a client-safe coordinator that can coalesce recovery attempts and expose a terminal expired state. The API client retries one inactive request after recovery, while `AuthProvider` owns the terminal modal and video pages consume the same state for explicit copy.

**Tech Stack:** React 19, React Router 7, browser Fetch API, Vitest, Testing Library

**Spec:** `docs/superpowers/specs/2026-11-02-device-session-recovery-design.md`

## Global Constraints

- Preserve the existing behavior that rotates a closed activity ID and retries the heartbeat once.
- Do not treat network failures or unrelated 5xx responses as a terminal sign-in failure.
- Do not send additional authenticated API requests after terminal recovery failure.
- Use `您的登录会话已过期，请退出后重新登录` in the global modal.
- Use `登录状态已过期，请重新登录后继续观看` on the video study page.
- Keep the modal and video fallback usable on desktop, tablet, and mobile.
- Do not perform browser verification unless explicitly requested.

## Review Focus

- Two API calls fail with `device_session_inactive` together: one recovery heartbeat runs and both calls retry at most once.
- The first heartbeat gets `device_activity_closed`: the old ID is cleared, a new ID is created, and exactly one retry occurs.
- Recovery has an ordinary network failure: no terminal modal or permanent request gate is activated.
- Recovery reaches a terminal 401/403/second-409 result: one modal appears and later authenticated requests do not reach `fetch`.
- Explicit logout after expiry: tokens and existing logout-owned local state clear before navigation to `/login`.

---

### Task 1: Device Session Recovery Coordinator

**Files:**
- Create: `frontend/src/api/auth/deviceSession.js`
- Create: `frontend/src/api/auth/deviceSession.test.js`
- Modify: `frontend/src/api/auth/auth.js`
- Modify: `frontend/src/api/auth/index.js`

**Interfaces:**
- Produces: `recoverDeviceSession(): Promise<void>`, `markDeviceSessionExpired(error): void`, `isDeviceSessionExpired(): boolean`, `subscribeToDeviceSessionExpiry(listener): () => void`, `resetDeviceSessionExpiry(): void`, and the existing activity/heartbeat exports.
- Consumes: browser `fetch`, `localStorage`, and the current heartbeat endpoint contract.

- [ ] **Step 1: Write failing coordinator tests**

Cover successful heartbeat, first `409 device_activity_closed` activity rotation, concurrent recovery coalescing, terminal session classification, and network-error non-classification with literal response fixtures.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npm test -- src/api/auth/deviceSession.test.js`
Expected: FAIL because `deviceSession.js` and its interfaces do not exist.

- [ ] **Step 3: Implement the minimal coordinator and re-export existing auth interfaces**

Move the activity ID and raw heartbeat functions out of `auth.js` without changing their public imports. Add one shared in-flight recovery promise and observable terminal state.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run: `npm test -- src/api/auth/deviceSession.test.js src/api/auth/auth.test.js`
Expected: PASS.

### Task 2: API Recovery and Terminal Request Gate

**Files:**
- Modify: `frontend/src/api/client.js`
- Create: `frontend/src/api/client.test.js`

**Interfaces:**
- Consumes: `recoverDeviceSession()`, `markDeviceSessionExpired()`, and `isDeviceSessionExpired()` from Task 1.
- Produces: existing `apiFetch()` behavior plus one retry for `403 device_session_inactive` and a local terminal gate for authenticated requests.

- [ ] **Step 1: Write failing API client tests**

Cover recovery followed by one replay, recovery terminal failure, no repeated replay, concurrent recovery reuse, blocked later authenticated requests, and unaffected network/5xx behavior.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npm test -- src/api/client.test.js`
Expected: FAIL because `apiFetch` currently throws the first inactive 403 and has no terminal gate.

- [ ] **Step 3: Implement one recovery/replay branch and terminal gate**

Keep the existing one-time 401 refresh separate from the one-time device-session replay. Permit unauthenticated login requests after terminal state so the user can sign in again.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run: `npm test -- src/api/client.test.js src/api/auth/deviceSession.test.js`
Expected: PASS.

### Task 3: Global Fallback Modal and Heartbeat Failure Wiring

**Files:**
- Modify: `frontend/src/api/auth/AuthProvider.jsx`
- Modify: `frontend/src/api/auth/AuthProvider.test.jsx`
- Create: `frontend/src/api/auth/DeviceSessionExpiredModal.jsx`
- Create: `frontend/src/api/auth/DeviceSessionExpiredModal.css`

**Interfaces:**
- Consumes: Task 1 recovery and expiry subscription interfaces.
- Produces: `deviceSessionExpired: boolean` and `reloadAfterSessionExpiry(): void` through `AuthContext`, plus the required global modal.

- [ ] **Step 1: Write failing provider/modal tests**

Cover terminal heartbeat failure opening one dialog, exact message and button labels, reload action, logout token clearing before `/login` navigation, and non-terminal network failure staying silent.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npm test -- src/api/auth/AuthProvider.test.jsx`
Expected: FAIL because no expiry subscription, modal, or actions exist.

- [ ] **Step 3: Wire the existing heartbeat path to recovery and render the modal**

Retain the current heartbeat cadence and foreground triggers. Mark expiry only for terminal session failures. Make the dialog non-dismissible, focus-safe, scroll-locking, and responsive.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run: `npm test -- src/api/auth/AuthProvider.test.jsx src/api/auth/deviceSession.test.js`
Expected: PASS.

### Task 4: Video-Specific State and Error Reporting Classification

**Files:**
- Modify: `frontend/src/pages/VideoStudy/VideoStudyPage.jsx`
- Create: `frontend/src/pages/VideoStudy/VideoStudyPage.test.jsx`
- Modify: `frontend/src/utils/clientErrorBuffer.js`
- Create: `frontend/src/utils/clientErrorBuffer.test.js`
- Modify: `frontend/src/pages/VideoStudy/VideoStudyPage.css`

**Interfaces:**
- Consumes: `deviceSessionExpired` and `reloadAfterSessionExpiry()` from Task 3.
- Produces: explicit video-session-expired presentation and exclusion of expected session errors from the generic error buffer.

- [ ] **Step 1: Write failing video and error-buffer tests**

Assert the exact video message and reload action when expired, preservation of real playback errors when not expired, and exclusion of errors carrying `device_session_inactive` or `device_activity_closed` from generic capture.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npm test -- src/pages/VideoStudy/VideoStudyPage.test.jsx src/utils/clientErrorBuffer.test.js`
Expected: FAIL because the dedicated page state and capture filter do not exist.

- [ ] **Step 3: Implement the dedicated state and expected-error filter**

Keep copy operational and ensure the fallback button remains usable at narrow widths.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run: `npm test -- src/pages/VideoStudy/VideoStudyPage.test.jsx src/utils/clientErrorBuffer.test.js`
Expected: PASS.

### Task 5: Full Verification

**Files:**
- Verify all modified frontend files.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: a tested frontend build with no regression in existing behavior.

- [ ] **Step 1: Run the complete frontend test suite**

Run: `npm test`
Expected: all tests PASS; report any pre-existing failure by name.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: PASS; report any pre-existing failure by file and rule.

- [ ] **Step 3: Run the production build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Review the final diff against the approved minimal scope**

Confirm no heartbeat cadence change, no backend change, no video-media behavior change, and no token or request payload enters error reporting.

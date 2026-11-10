# C1 HS Coming Soon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 非 `110` 用户在 C1 HS 首页点击五个专项或笔试模拟时看到 Coming soon，同时保留 Unsere Tipps、`110` 用户、B1 和 B2 的现有行为。

**Architecture:** 只在复用的 C1 首页组件内增加入口级判断，沿用现有 `useAuth` 和 SweetAlert。专项卡片在受限状态下使用可点击按钮语义并阻止导航；笔试模拟在现有处理函数最前面应用同一条件。

**Tech Stack:** React 19、React Router、SweetAlert2、Vitest、Testing Library

**Spec:** `docs/superpowers/specs/2026-11-09-c1-hs-coming-soon-design.md`

## Global Constraints

- 只拦截 C1 HS 首页点击，不增加路由级或 API 级门控。
- Unsere Tipps、B1、B2 和手机号精确为 `110` 的用户行为不变。
- 笔试模拟和五个专项使用同一 Coming soon 提示。
- 不新增依赖、配置、抽象层或无关格式化。
- 不创建 Git commit。

## Review Focus

- 非 `110` 的有权限用户点击 C1 专项：显示 Coming soon，URL 不变。
- 非 `110` 的有权限用户点击 C1 笔试模拟：显示 Coming soon，既不进入考试也不打开购买提示。
- `110` 用户点击 C1 专项和笔试模拟：保持现有跳转。
- Unsere Tipps 对非 `110` 用户：仍是正常链接。
- B1/B2 用户：专项和笔试模拟现有行为不受 C1 判断影响。

---

### Task 1: C1 HS 首页入口门控

**Files:**
- Modify: `frontend/src/pages/ExamPreparationModulePage.jsx`
- Test: `frontend/src/pages/ExamPreparationModulePage.test.jsx`

**Interfaces:**
- Consumes: `scope.level`、`user.telephone`、现有 `Swal.fire`、卡片目标 URL 与 `openMockExam()`。
- Produces: C1 首页入口级 Coming soon 行为；不新增跨文件接口。

- [ ] **Step 1: 添加专项入口的失败测试**

在 `ExamPreparationModulePage.test.jsx` 添加测试：非 `110` 的有权限用户访问 C1 首页时，Unsere Tipps 保持链接；点击 Hören 不改变 location，并调用一次 `Swal.fire`，标题或正文明确包含 `Coming soon`。

- [ ] **Step 2: 运行专项入口测试并确认按预期失败**

Run: `npm test -- ExamPreparationModulePage.test.jsx`（工作目录 `frontend`）

Expected: FAIL，因为 Hören 当前仍直接导航且不会显示 Coming soon。

- [ ] **Step 3: 添加笔试模拟和放行场景的失败测试**

覆盖非 `110` C1 用户点击“开始新考试”只显示 Coming soon；同时固定 `110` C1 用户、Unsere Tipps、B1/B2 的现有可用行为。

- [ ] **Step 4: 实现最小入口判断**

在 `ExamPreparationModulePage.jsx` 内定义局部布尔值，条件严格为 `scope.level === "C1"` 且清理空白后的 `user.telephone !== "110"`。复用一个局部 Coming soon 处理函数：专项卡片在受限时使用按钮并保留现有视觉 class；笔试模拟在 `openMockExam()` 的现有权限/购买分支前返回。

- [ ] **Step 5: 运行页面测试并确认通过**

Run: `npm test -- ExamPreparationModulePage.test.jsx`（工作目录 `frontend`）

Expected: PASS。

- [ ] **Step 6: 运行前端完整验证**

Run: `npm test`（工作目录 `frontend`）

Run: `npm run lint`（工作目录 `frontend`）

Expected: 全部通过；若有与本次修改无关的既有失败，完整记录测试名和输出。

# 用户服务协议与隐私政策弹窗 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在全站 footer 提供用户协议与隐私政策入口，并要求新用户在注册前主动勾选同意。

**Architecture:** 新建一个共用 `LegalDocumentModal`，以 `documentType` 选择唯一来源的协议正文，并负责统一的对话框关闭行为。`SiteFooter` 与 `ActivatePage` 只管理当前打开的法律文件类型；注册页额外把协议同意状态纳入现有 `canRegister` 条件。

**Tech Stack:** React 19、CSS、Vitest、Testing Library

**Spec:** `docs/superpowers/specs/2026-11-03-legal-agreements-design.md`

## Global Constraints

- 协议正文必须使用用户提供的《符号刘的德语资料库 用户服务协议》和配套《隐私政策》内容。
- footer 显示两个独立入口，注册页显示一个默认未选中的必选复选框；登录、购买与兑换页不增加勾选。
- 同一协议正文不得在 footer 与注册页重复维护。
- 桌面、iPad/平板与手机宽度都必须可读、可滚动、可关闭，不得横向溢出。
- 新增用户文案属于功能性指导，保持简短、具体，不添加宣传性副标题。
- 根据项目规则，不打开浏览器做人工验证。

## Review Focus

- 用户打开一份协议后切换或关闭时，不应残留另一份协议标题或正文；由 Task 1 的类型切换与重新打开测试覆盖。
- 点击弹窗正文不能意外关闭，点击遮罩和按 Esc 应关闭；由 Task 1 的关闭交互测试覆盖。
- 未勾选协议时，即使注册字段有效也不能发送请求；由 Task 3 的请求阻断测试覆盖。
- 打开和关闭注册页协议弹窗不能自动改变同意状态；由 Task 3 的状态保持测试覆盖。
- 长文本在手机宽度下必须保持弹窗内滚动和可操作的关闭区；由 Task 1 的结构断言与 Task 4 的 CSS/build 检查覆盖。

---

### Task 1: 共用法律文件弹窗

**Files:**
- Create: `frontend/src/components/LegalDocumentModal.jsx`
- Create: `frontend/src/components/LegalDocumentModal.css`
- Create: `frontend/src/components/LegalDocumentModal.test.jsx`

**Interfaces:**
- Consumes: `documentType: "terms" | "privacy" | null`，`onClose: () => void`
- Produces: `LegalDocumentModal({ documentType, onClose })`；`documentType` 为 `null` 时不渲染，为其他值时渲染对应的唯一协议正文。

- [ ] **Step 1: 写弹窗选择正确法律文件的失败测试**

  在 `LegalDocumentModal.test.jsx` 中断言 `terms` 显示“符号刘的德语资料库 用户服务协议”及第 1–7 节，不显示隐私政策标题；rerender 为 `privacy` 后显示“符号刘的德语资料库 隐私政策”及第 1–8 节，不再显示用户协议标题。这个测试应能捕获类型分支写反、正文缺失或旧正文残留。

- [ ] **Step 2: 运行测试并确认因组件不存在而失败**

  Run: `cd frontend && npm test -- src/components/LegalDocumentModal.test.jsx`
  Expected: FAIL，因为模块或组件尚不存在。

- [ ] **Step 3: 实现最小的 `LegalDocumentModal({ documentType, onClose })`**

  在组件内保存用户给出的两份完整正文，以语义化标题、段落、列表和 `strong` 呈现重点；为标题生成稳定 id，并用 `aria-labelledby` 关联 `role="dialog"`。只实现测试要求的文件选择与显示。

- [ ] **Step 4: 运行测试并确认通过**

  Run: `cd frontend && npm test -- src/components/LegalDocumentModal.test.jsx`
  Expected: PASS。

- [ ] **Step 5: 写关闭交互与结构的失败测试**

  断言关闭按钮的中文无障碍名称；点击正文不调用 `onClose`；点击遮罩、点击关闭按钮、向 `window` 发送 Escape 各调用一次；`documentType=null` 不渲染 dialog。断言正文位于独立的滚动容器类中，以保护长文移动端行为。

- [ ] **Step 6: 运行测试并确认因关闭行为缺失而失败**

  Run: `cd frontend && npm test -- src/components/LegalDocumentModal.test.jsx`
  Expected: FAIL，缺少对应关闭行为或结构。

- [ ] **Step 7: 补齐关闭行为和响应式样式**

  遮罩只在点击自身时关闭；挂载时监听 Escape、卸载时清理。CSS 设置桌面最大宽高、粘性标题栏、正文纵向滚动、正文断行，以及 `max-width: 640px` 的手机边距和字号；平板依赖流式宽度 `min(...)`。

- [ ] **Step 8: 运行测试并确认通过**

  Run: `cd frontend && npm test -- src/components/LegalDocumentModal.test.jsx`
  Expected: PASS。

- [ ] **Step 9: 提交 Task 1**

  ```bash
  git add frontend/src/components/LegalDocumentModal.jsx frontend/src/components/LegalDocumentModal.css frontend/src/components/LegalDocumentModal.test.jsx
  git commit -m "feat: add reusable legal document modal"
  ```

### Task 2: Footer 法律文件入口

**Files:**
- Create: `frontend/src/components/SiteFooter.test.jsx`
- Modify: `frontend/src/components/SiteFooter.jsx`
- Modify: `frontend/src/components/SiteFooter.css`

**Interfaces:**
- Consumes: Task 1 的 `LegalDocumentModal({ documentType, onClose })`
- Produces: footer 中“用户服务协议”“隐私政策”按钮，各自打开对应文件；现有版权说明和问题反馈行为不变。

- [ ] **Step 1: 写 footer 两个入口的失败测试**

  mock `useAuth` 为未登录，渲染真实 `SiteFooter`；分别点击两个按钮并断言 dialog 的可见标题正确。关闭第一份后再打开第二份，确保页面只存在一个 dialog。继续断言原“版权说明”和备案链接仍存在。

- [ ] **Step 2: 运行测试并确认入口缺失导致失败**

  Run: `cd frontend && npm test -- src/components/SiteFooter.test.jsx`
  Expected: FAIL，找不到新增按钮。

- [ ] **Step 3: 用单一状态接入共用弹窗**

  在 `SiteFooter.jsx` 增加 `activeLegalDocument: "terms" | "privacy" | null` 状态与两个功能按钮；复用现有 `site-footer__linkBtn`，在备案链接前保持分隔符一致。版权说明继续使用现有状态，不迁移其正文。

- [ ] **Step 4: 运行 footer 测试并确认通过**

  Run: `cd frontend && npm test -- src/components/SiteFooter.test.jsx`
  Expected: PASS。

- [ ] **Step 5: 提交 Task 2**

  ```bash
  git add frontend/src/components/SiteFooter.jsx frontend/src/components/SiteFooter.css frontend/src/components/SiteFooter.test.jsx
  git commit -m "feat: add legal links to site footer"
  ```

### Task 3: 注册前协议同意

**Files:**
- Create: `frontend/src/pages/ActivatePage.test.jsx`
- Modify: `frontend/src/pages/ActivatePage.jsx`
- Modify: `frontend/src/styles/auth.css`

**Interfaces:**
- Consumes: Task 1 的 `LegalDocumentModal({ documentType, onClose })`
- Produces: `ActivatePage` 的 `hasAcceptedLegal` 状态、两个弹窗入口，以及把该状态纳入 `canRegister` 的注册阻断。

- [ ] **Step 1: 写注册阻断的失败测试**

  mock `registerUser`，填写有效的 11 位手机号、有效邮箱和至少 6 位密码。断言“立即注册”仍禁用且请求未发送；勾选“我已阅读并同意本用户协议及隐私政策”后按钮启用，点击后请求只发送一次且参数保持现有结构。

- [ ] **Step 2: 运行测试并确认未勾选时按钮错误启用**

  Run: `cd frontend && npm test -- src/pages/ActivatePage.test.jsx`
  Expected: FAIL，因为现有 `canRegister` 未包含协议状态。

- [ ] **Step 3: 增加协议状态并纳入 `canRegister`**

  新增 `hasAcceptedLegal`，默认 `false`；给表单加入完整可点击的 checkbox label；`canRegister` 同时要求已有字段规则、`hasAcceptedLegal` 和 `!loading`。保留现有注册请求参数，不向后端增加未经设计的字段。

- [ ] **Step 4: 运行阻断测试并确认通过**

  Run: `cd frontend && npm test -- src/pages/ActivatePage.test.jsx`
  Expected: PASS。

- [ ] **Step 5: 写注册页弹窗与状态保持的失败测试**

  分别点击“用户协议”和“隐私政策”文字按钮，断言显示对应 dialog；关闭弹窗后复选框仍保持原值，打开弹窗本身不会勾选。断言按钮是 `type="button"`，避免触发表单提交。

- [ ] **Step 6: 运行测试并确认入口缺失导致失败**

  Run: `cd frontend && npm test -- src/pages/ActivatePage.test.jsx`
  Expected: FAIL，找不到法律文件按钮或 dialog。

- [ ] **Step 7: 接入共用弹窗并完成响应式注册样式**

  添加 `activeLegalDocument` 状态，在 checkbox 文案内放置两个链接样式按钮。`auth.css` 提供对齐、换行、焦点态和至少 44px 可点击 checkbox 区域；在窄屏允许文案自然换行，不挤压复选框。

- [ ] **Step 8: 运行注册页测试并确认通过**

  Run: `cd frontend && npm test -- src/pages/ActivatePage.test.jsx`
  Expected: PASS。

- [ ] **Step 9: 提交 Task 3**

  ```bash
  git add frontend/src/pages/ActivatePage.jsx frontend/src/pages/ActivatePage.test.jsx frontend/src/styles/auth.css
  git commit -m "feat: require legal consent during registration"
  ```

### Task 4: 全量验证

**Files:**
- Modify only if verification exposes a regression in files already owned by Tasks 1–3.

**Interfaces:**
- Consumes: Tasks 1–3 的完成结果
- Produces: 无新增接口；提供可交付的验证证据。

- [ ] **Step 1: 运行相关组件测试**

  Run: `cd frontend && npm test -- src/components/LegalDocumentModal.test.jsx src/components/SiteFooter.test.jsx src/pages/ActivatePage.test.jsx`
  Expected: 全部 PASS，且无 React warning。

- [ ] **Step 2: 运行完整前端测试**

  Run: `cd frontend && npm test`
  Expected: 全部 PASS；如有与本次无关的既有失败，记录测试名称与证据。

- [ ] **Step 3: 运行 lint**

  Run: `cd frontend && npm run lint`
  Expected: exit 0；不得新增 warning/error。

- [ ] **Step 4: 运行生产构建**

  Run: `cd frontend && npm run build`
  Expected: exit 0，Vite 成功生成生产产物。

- [ ] **Step 5: 检查变更范围**

  Run: `git status --short && git diff --check && git diff HEAD -- frontend/src/components/LegalDocumentModal.jsx frontend/src/components/LegalDocumentModal.css frontend/src/components/LegalDocumentModal.test.jsx frontend/src/components/SiteFooter.jsx frontend/src/components/SiteFooter.css frontend/src/components/SiteFooter.test.jsx frontend/src/pages/ActivatePage.jsx frontend/src/pages/ActivatePage.test.jsx frontend/src/styles/auth.css`
  Expected: 无空白错误；只包含设计范围内改动。

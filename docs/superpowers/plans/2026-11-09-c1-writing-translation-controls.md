# C1 Writing Translation Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为普通 C1 HS 写作练习增加统一中文开关和可收起 Wortschatz，并确保 Mock Exam 仅在答案展示/自评阶段开放两项功能。

**Architecture:** 在共享 `WritingExerciseWorkspace` 内维护翻译显示和词汇浮层展开状态，由调用方通过显式属性决定辅助控件是否可用。Mock Exam 的选题、作答和答案展示路径分别传入对应权限，防止考试阶段仅靠样式隐藏。

**Tech Stack:** React、CSS、Vitest、Testing Library

**Spec:** `docs/superpowers/specs/2026-11-09-c1-writing-translation-controls-design.md`

## Global Constraints

- 不新增依赖，不改 B1/B2 写作行为。
- Mock Exam 作答和选题期间隐藏中文、翻译控件与 Wortschatz；仅写作自评/答案展示阶段启用。
- 普通 C1 练习默认显示中文并展开 Wortschatz。
- 控件需支持键盘、可访问名称和 `aria-expanded`，并适配桌面、iPad、手机。
- 不创建 Git 提交。

## Review Focus

- 没有中文翻译的引语或词条仍应正常渲染德语内容，开关不制造空白区域。
- 切换中文不应改变当前 Wortschatz 页码。
- 收起再展开 Wortschatz 应保留当前页码和中文开关状态。
- Mock Exam 选题阶段不得泄露任一题目的中文翻译或词汇。
- Mock Exam 写作自评阶段应能显示并切换中文、收起和展开 Wortschatz。

---

### Task 1: 共享 C1 写作辅助控件

**Files:**
- Modify: `frontend/src/components/examPreparation/WritingExerciseWorkspace.jsx`
- Modify: `frontend/src/pages/ExamPreparationWritingDetailPage.jsx`
- Modify: `frontend/src/pages/ExamPreparationWritingDetailPage.css`
- Test: `frontend/src/pages/ExamPreparationWritingDetailPage.test.jsx`

**Interfaces:**
- Consumes: C1 `exercise.content.quotes` 与 `exercise.content.vocabulary_pages`。
- Produces: `WritingExerciseWorkspace` 新增布尔属性 `showTranslationControls`；普通详情页为 C1 传入 `true`。

- [ ] **Step 1: 写失败测试**

在现有 C1 详情测试中断言：标题旁存在“隐藏中文翻译”按钮；点击后引语和 Wortschatz 中文同时消失且按钮变为“显示中文翻译”；再次点击恢复。断言 Wortschatz 右上角“收起词汇表”按钮具备 `aria-expanded="true"`，收起后词条和翻页隐藏、按钮变为“展开词汇表”且 `aria-expanded="false"`，再次展开保留原页码。

- [ ] **Step 2: 验证测试先失败**

Run: `cd frontend && npm test -- --run src/pages/ExamPreparationWritingDetailPage.test.jsx`

Expected: FAIL，找不到新增按钮或中文仍显示。

- [ ] **Step 3: 最小实现共享状态与标记**

在 `WritingExerciseWorkspace` 中新增 `showTranslationControls = false` 属性以及本地 `showTranslations`、`isVocabularyExpanded` 状态。仅当 `isTelcC1 && showTranslationControls` 时在页面标题区域提供翻译按钮并渲染 Wortschatz；中文渲染统一受 `showTranslations` 控制。将翻译按钮通过一个明确的 title-action 接口放到详情页 hero 标题后，不为单一用途创建新组件。

- [ ] **Step 4: 实现响应式与可访问样式**

为标题与按钮、Wortschatz 标题栏、折叠态增加最少 CSS；在 990px 与 560px 现有断点下允许换行并保持至少现有按钮触控尺寸。

- [ ] **Step 5: 验证详情页测试**

Run: `cd frontend && npm test -- --run src/pages/ExamPreparationWritingDetailPage.test.jsx`

Expected: PASS。

### Task 2: Mock Exam 阶段权限

**Files:**
- Modify: `frontend/src/pages/mockExam/telc/TelcMockExamPage.jsx`
- Modify: `frontend/src/pages/mockExam/telc/TelcMockExamPage.css`
- Test: `frontend/src/pages/mockExam/telc/TelcMockExamPage.test.jsx`

**Interfaces:**
- Consumes: Task 1 的 `WritingExerciseWorkspace.showTranslationControls`。
- Produces: Mock Exam 选题/作答阶段无中文和 Wortschatz；`writing_review` 阶段提供完整辅助控件。

- [ ] **Step 1: 写失败测试**

更新 C1 Mock Exam 测试，断言选题和正式写作阶段看得到德语引语但看不到中文、翻译按钮或词汇表；在 `writing_review` 阶段断言中文默认显示，且翻译按钮与 Wortschatz 收起/展开行为可用。

- [ ] **Step 2: 验证测试先失败**

Run: `cd frontend && npm test -- --run src/pages/mockExam/telc/TelcMockExamPage.test.jsx`

Expected: FAIL，当前考试阶段仍泄露中文和 Wortschatz，或自评阶段缺少控件。

- [ ] **Step 3: 收紧考试阶段并复用答案阶段组件**

正式写作的 `WritingExerciseWorkspace` 传入 `showTranslations={review}` 与 `showTranslationControls={review && isTelcC1}`；C1 选题卡的 `C1WritingPrompt` 强制 `showTranslations={false}`。写作自评阶段改用共享 C1 workspace 的只读提示/词汇呈现，或以同一共享控件接口组合现有引语布局，确保答案阶段才传入 `showTranslationControls={true}`。

- [ ] **Step 4: 保持 Mock Exam modal 布局可用**

只补充自评 modal 内需要的尺寸/层级覆盖，确保固定 Wortschatz 不盖住自评提交操作，手机宽度下收起按钮仍可点击。

- [ ] **Step 5: 验证 Mock Exam 测试**

Run: `cd frontend && npm test -- --run src/pages/mockExam/telc/TelcMockExamPage.test.jsx`

Expected: PASS。

### Task 3: 回归验收

**Files:**
- Verify only: Task 1–2 所有改动文件

**Interfaces:**
- Consumes: Task 1–2 的最终实现。
- Produces: 与需求一致且无无关改动的可验收 diff。

- [ ] **Step 1: 运行聚焦测试**

Run: `cd frontend && npm test -- --run src/pages/ExamPreparationWritingDetailPage.test.jsx src/pages/mockExam/telc/TelcMockExamPage.test.jsx`

Expected: 两个测试文件全部 PASS。

- [ ] **Step 2: 运行前端构建**

Run: `cd frontend && npm run build`

Expected: 构建成功，无新增编译错误。

- [ ] **Step 3: 检查实际 diff 与范围**

Run: `git diff --check && git diff -- frontend/src/components/examPreparation/WritingExerciseWorkspace.jsx frontend/src/pages/ExamPreparationWritingDetailPage.jsx frontend/src/pages/ExamPreparationWritingDetailPage.css frontend/src/pages/ExamPreparationWritingDetailPage.test.jsx frontend/src/pages/mockExam/telc/TelcMockExamPage.jsx frontend/src/pages/mockExam/telc/TelcMockExamPage.css frontend/src/pages/mockExam/telc/TelcMockExamPage.test.jsx`

Expected: 无空白错误；每一处改动都能追溯到翻译开关、Wortschatz 折叠或 Mock Exam 阶段限制。


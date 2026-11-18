# 收藏词卡认识状态与分层词库 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让每个用户的收藏词卡拥有独立的“未标记/认识/不认识”状态，并让视频季、备考季词库通过可收起的左侧层级浏览全部、父级聚合和具体范围。

**Architecture:** 认识状态存放在 `UserExamVocabularyFavorite` 关系上，通过词卡列表返回，并由词卡专用 PATCH action 更新。前端保留现有 occurrence 标记路径，同时让收藏卡走新的关系状态接口；视频季用现有 `activeModuleKey/selectedVideoId` 表示全部、父级、具体视频，备考季用考试类型/难度表示同样三层范围。

**Tech Stack:** Django 5 / Django REST Framework、React 19、Vitest / Testing Library、现有 CSS。

**Spec:** `docs/superpowers/specs/2026-11-16-favorite-vocabulary-knowledge-design.md`

## Global Constraints

- 不添加新依赖，不提交或推送 Git。
- 查询弹层只保留收藏/取消收藏，不增加认识状态控件。
- 模拟考试进行中保持词典关闭；仅 `results` 与展示范文答案的 `writing_review` 阶段启用。
- 新收藏默认为 `UNMARKED`；取消收藏删除关系及状态，重新收藏重新从 `UNMARKED` 开始。
- 收藏词卡不与视频 occurrence 去重或联动；两套认识状态独立。
- 仅展示当前已支持的 TELC B1、B2、C1。
- 桌面、iPad/平板、手机均不得溢出或失去目录操作能力。
- 所有实现先写失败测试并观察 RED，再做最小生产修改。

## Review Focus

- 无备考季 entitlement、但拥有视频收藏的登录用户，仍可读取和更新自己的视频收藏状态；Task 1 权限测试覆盖。
- 用户不能更新另一用户的收藏关系，也不能为未收藏卡创建状态；Task 1 隔离与 404 测试覆盖。
- 根级“全部”不得混入另一来源的收藏卡或无权限视频 occurrence；Task 2 聚合过滤测试覆盖。
- 窄屏目录抽屉、收起按钮和卡片认识按钮都可点击且无横向溢出；Task 2 移动端测试与 Task 3 浏览器验收覆盖。
- 模拟考试 active phases 不得因共享 Provider 改动而出现词典，`results`/`writing_review` 必须继续可查词；Task 2 回归命令与 Task 3 浏览器验收覆盖。

---

### Task 1: 收藏关系认识状态 API

**Files:**
- Modify: `apps/exam_preparation/models/vocabulary.py`
- Create: `apps/exam_preparation/migrations/0035_userexamvocabularyfavorite_knowledge.py`
- Modify: `apps/exam_preparation/serializers.py`
- Modify: `apps/exam_preparation/views.py`
- Test: `apps/exam_preparation/tests_vocabulary.py`
- Test: `apps/lexicon/tests_dictionary_api.py`

**Interfaces:**
- Consumes: 现有 `ExamVocabularyCardViewSet`、`UserExamVocabularyFavorite`、词典收藏 POST/DELETE。
- Produces: `UserExamVocabularyFavorite.knowledge`，值仅为 `UNMARKED | KNOWN | UNKNOWN`；词卡列表字段 `knowledge`；`PATCH /api/exam_preparation/vocabulary-cards/{id}/knowledge/`，请求与响应均使用 `{ "knowledge": <value> }`。

- [ ] **Step 1: 写模型和接口失败测试**

  在 `ExamVocabularyApiTests` 中增加：新收藏列表返回 `UNMARKED`；PATCH 可按 `KNOWN → UNKNOWN → UNMARKED` 更新；未收藏卡返回 404；非法值返回 400；另一用户不受影响；只有视频收藏的普通登录用户可更新自己的状态；DELETE 后重新 POST 恢复 `UNMARKED`。

- [ ] **Step 2: 运行测试确认 RED**

  Run: `.venv/bin/python manage.py test apps.exam_preparation.tests_vocabulary apps.lexicon.tests_dictionary_api --settings=config.settings_sqlite_test`

  Expected: FAIL，原因是字段、序列化字段和 `knowledge` action 尚不存在。

- [ ] **Step 3: 增加关系字段与迁移**

  在 `UserExamVocabularyFavorite` 内定义三态 `TextChoices` 和 `knowledge = models.CharField(...)`，默认 `UNMARKED`；生成单一 0035 migration，不触碰卡片公共模型身份约束。

- [ ] **Step 4: 让列表返回当前用户关系状态**

  `ExamVocabularyCardViewSet.get_queryset()` 使用当前用户 favorite 子查询同时生成 `is_favorite` 与 `favorite_knowledge`；`ExamVocabularyCardSerializer` 将其只读暴露为 `knowledge`，无关系时回落 `UNMARKED`。

- [ ] **Step 5: 实现知识状态 action**

  添加 `knowledge` PATCH action：仅 `IsAuthenticated`；严格校验三个值；只更新 `request.user + card` 已存在关系；不存在返回 404；返回保存后的值。保留现有收藏 POST entitlement 和 DELETE/login 权限规则。

- [ ] **Step 6: 验证后端**

  Run: `.venv/bin/python manage.py test apps.exam_preparation.tests_vocabulary apps.exam_preparation.tests_vocabulary_enrichment apps.lexicon.tests_dictionary_api --settings=config.settings_sqlite_test`

  Expected: 全部 PASS。

  Run: `.venv/bin/python manage.py makemigrations --check --dry-run`

  Expected: `No changes detected`。

### Task 2: 收藏卡认识按钮与分层聚合词库 UI

**Files:**
- Modify: `frontend/src/api/exam_preparation/vocabularyCards.js`
- Test: `frontend/src/api/exam_preparation/vocabularyCards.test.js`
- Modify: `frontend/src/pages/LexiconPage/LexiconPage.jsx`
- Modify: `frontend/src/pages/LexiconPage/LexiconPage.css`
- Modify: `frontend/src/pages/LexiconPage/components/Sidebar.jsx`
- Modify: `frontend/src/pages/LexiconPage/components/Sidebar.css`
- Modify: `frontend/src/pages/LexiconPage/components/LexiconCard.jsx`
- Test: `frontend/src/pages/LexiconPage/LexiconPage.test.jsx`
- Test: `frontend/src/pages/LexiconPage/components/LexiconCard.test.jsx`

**Interfaces:**
- Consumes: Task 1 的 `knowledge` 列表字段及 PATCH action；现有无 `video` 参数时按 entitlement 过滤的 word/expression occurrence API。
- Produces: `setVocabularyCardKnowledge(id, knowledge)`；显式的收藏读取范围 `{ collectionKey? , collectionPrefix? }`；视频与考试两套全部/父级/子级导航状态。

- [ ] **Step 1: 写 API 失败测试**

  覆盖 PATCH URL、请求体；精确 collection key；无 key 时分页读取全部个人收藏并按 `exam:` 或 `video:` 前缀过滤，不能再隐式回落 TELC C1。

- [ ] **Step 2: 写词卡和词库页面失败测试**

  覆盖：独立收藏卡显示认识/不认识；初始状态来自 `knowledge`；重复点击恢复未标记；状态失败保留原值；查询弹层不受影响。覆盖视频根级全部、科普季/Vlog 父级、具体视频；备考根级全部、TELC 父级、B1/B2/C1；父级直接显示其下全部词汇；来源间不串数据；目录可收起、移动端可打开。

- [ ] **Step 3: 运行测试确认 RED**

  Run: `npm test -- src/api/exam_preparation/vocabularyCards.test.js src/pages/LexiconPage/LexiconPage.test.jsx src/pages/LexiconPage/components/LexiconCard.test.jsx`

  Expected: FAIL，原因是 PATCH helper、收藏卡状态和考试目录尚不存在，默认页仍要求选择具体范围。

- [ ] **Step 4: 实现前端 API**

  增加 `setVocabularyCardKnowledge(id, knowledge)`；把收藏分页加载改为显式范围参数，`collectionKey` 精确筛选，`collectionPrefix` 在取得当前用户全部收藏后筛选前缀。

- [ ] **Step 5: 让收藏卡拥有独立状态**

  `mapExamVocabularyCard` 保存 `vocabularyCardId` 与 `knowledge`；视频收藏卡直接追加为独立卡，不再与 occurrence 合并。`LexiconCard` 对所有卡显示认识按钮；`LexiconPage` 对收藏卡调用 Task 1 PATCH，对普通 occurrence 保留现有标记接口，成功后更新本地 `knowledgeByKey`。

- [ ] **Step 6: 实现视频聚合范围**

  移除模块选择后自动选第一个视频的 effect。`activeModuleKey=null, selectedVideoId=null` 表示全部视频；父级 key + null video 表示该季全部；具体 video 表示精确范围。根级/父级使用无 video occurrence 请求并按有权限视频 ID 集合筛选；收藏卡按 `video:` 前缀及父级视频 ID 过滤。未选具体视频时，句子 tab 显示“请选择具体视频查看句子”。

- [ ] **Step 7: 实现考试聚合范围和左侧目录**

  `examType=null, examLevel=null` 表示全部考试；`TELC + null` 表示 TELC 全部；`TELC + B1|B2|C1` 表示精确范围。让 Sidebar 根据 `source` 渲染“全部视频词汇/全部考试词汇”、视频季父级/视频或 TELC/难度；父级点击同时设为聚合范围并进入子级；保留返回、收起、移动端抽屉。删除主内容区收藏范围下拉框。

- [ ] **Step 8: 完成响应式样式并验证前端**

  复用现有 sidebar/card/pill 视觉语言，只新增层级选中态和必要间距；验证 1440、iPad 宽度、手机宽度不溢出。

  Run: `npm test -- src/api/exam_preparation/vocabularyCards.test.js src/pages/LexiconPage/LexiconPage.test.jsx src/pages/LexiconPage/components/LexiconCard.test.jsx src/components/examPreparation/DictionaryLookupOverlay.test.jsx src/pages/VideoStudy/VideoStudyPage.test.jsx src/pages/mockExam/telc/TelcMockExamPage.test.jsx`

  Expected: 全部 PASS。

  Run: `npm run build`

  Expected: exit 0；允许报告既有 chunk size warning，不允许新增编译错误。

### Task 3: 集成与浏览器验收

**Files:**
- No product file changes unless Task 1/2 acceptance exposes a defect; corrections return to the owning task first.

**Interfaces:**
- Consumes: Task 1 和 Task 2 的稳定接口与 UI。
- Produces: 验收证据，不产生提交。

- [ ] **Step 1: Superagent 检查实际 diff 与写入范围**

  确认迁移、权限、状态切换、取消收藏重置、无去重行为和响应式 UI 均逐项对应 spec；运行 `git diff --check`。

- [ ] **Step 2: 运行组合回归**

  Run: `.venv/bin/python manage.py test apps.exam_preparation.tests_vocabulary apps.exam_preparation.tests_vocabulary_enrichment apps.lexicon.tests_dictionary_api --settings=config.settings_sqlite_test`

  Run: `npm test -- src/api/exam_preparation/vocabularyCards.test.js src/pages/LexiconPage/LexiconPage.test.jsx src/pages/LexiconPage/components/LexiconCard.test.jsx src/components/examPreparation/DictionaryLookupOverlay.test.jsx src/pages/VideoStudy/VideoStudyPage.test.jsx src/pages/mockExam/telc/TelcMockExamPage.test.jsx`

  Run: `npm run build`

- [ ] **Step 3: 使用账号进行浏览器验收**

  验证：视频季进入即显示全部；科普季/Vlog父级聚合；具体视频；备考季进入即显示全部；TELC 父级聚合；B1/B2/C1；目录收起与移动端抽屉；收藏卡在刷新后保持认识状态；切换不认识与未标记；取消并重新收藏恢复未标记；查询弹层没有认识按钮；模拟考试进行中无词典而答案复盘/写作范文自评可查词；无 console/page error。

- [ ] **Step 4: 清理测试数据并报告**

  删除浏览器验收产生的临时收藏/状态，保留用户原数据；报告所有命令、警告、未覆盖风险，且不 commit/push。

# C1 HS Coming Soon Design

## Intent

为 C1 HS 上线前的预览阶段限制首页入口：手机号精确为 `110` 的用户保留完整入口，其他用户仍可浏览 C1 HS 首页和 Unsere Tipps，但点击其余内容时只看到 Coming soon 提示。

## Goals

- C1 HS 的 Hören、Lesen、Sprachbausteine、Schreiben、Sprechen 和笔试模拟入口仅对手机号 `110` 保持现有行为。
- 其他用户点击上述入口时不跳转，并显示 Coming soon。
- Unsere Tipps、B1 和 B2 行为不变。

## Non-goals

- 不增加路由级或 API 级访问限制；直接输入具体 C1 URL 仍可能进入。
- 不改变购买、权限或后端发布开关。
- 不新增依赖、配置或兼容层。

## Approach

采用用户选择的首页点击拦截方案。在复用的 `ExamPreparationModulePage` 内，仅当当前级别为 C1 且手机号不是 `110` 时，将五个专项卡片和笔试模拟点击改为统一 Coming soon 提示；其他上下文继续使用现有链接和购买逻辑。

考虑过路由级统一拦截，它能阻止直接 URL 绕过，但用户明确选择更小的首页入口改动。

## Constraints

- 用户提示文案保持简短、功能性。
- 不影响桌面、平板和手机布局；尽量复用现有卡片样式与 SweetAlert。
- 按 TDD 先添加失败测试，再实现最小改动。

# C1 Sprechen Teil 1B 完整内容设计

## 目标

Teil 1B 详情页按纵向顺序展示配套 Vortrag 的题目、提纲和完整对话，不再遗漏存放在同题 Teil 1A 记录中的首个 TN1 演讲。

## 数据组合

- 数据库继续保留现有拆分：Teil 1A 保存题目、提纲和首个 TN1 演讲；Teil 1B 保存后续 TN2/TN1 对话。
- 仅在 C1 TELC Teil 1B 的详情响应中，按相同 `exam_type`、`level`、`external_id` 查找配套 Teil 1A。
- 响应继承 Teil 1A 的 `topic` 与 `outline`，对话按“Teil 1A 首段 → Teil 1B 原对话”排列，并重新连续编号。
- 每句音频必须按该句原始 exercise 解析，不能把 Teil 1A 的音频误指向 Teil 1B 目录。
- 显示编号与持久化身份必须分离：Teil 1B 原句保留现有 `turn:原序号` 收藏键，companion TN1 使用包含来源 exercise 的键；每句同时返回原 `source_exercise_id`、`source_teil`、`source_sequence` 供本地录音复用。
- 收藏列表必须能按 companion key 找到真实的 TN1 文本；不能把它错映射到 Teil 1B 的 TN2。
- 列表响应、其他级别、其他考试类型和其他 Teil 保持不变。

## 页面

- C1 Vortrag 的 Aufgabe 卡片依次展示 instruction、题目和提纲。
- Teil 1B 继续使用自然纵向布局：Aufgabe（题目、提纲）在上，Beispielantwort（完整对话）在下。
- 提纲继续使用现有眼睛开关；答案继续使用现有独立眼睛开关。
- 数据中遗留的 `<br>` / `<br/>` 在显示时转为真实换行，不使用 HTML 注入。
- 桌面、平板和手机保持现有响应式行为。

## 边界

- 不迁移、不复制、不删除数据库数据。
- 不修改导入器、音频文件或存储路径。
- 不新增依赖、不打开浏览器、不创建 commit。


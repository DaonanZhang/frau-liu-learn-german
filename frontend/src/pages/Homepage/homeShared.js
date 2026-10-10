export const SCIENCE_SEASON_MODULE = {
  id: "science-season",
  route: "/modules/science-season",
  moduleKey: "learning_by_video",
  seasonNumbers: [1, 2],
  purchaseSeasonNumber: 1,
  originalPrice: 69.9,
  title: "科普季",
  subtitle: "50期已完结",
  description:
    "这是一套由符号刘博士团队独立开发的德语原创口语听力跟读素材库。该资料专为 B1-C1 级别的德语学习者设计，通过50期“科普季”系列视频，将语言学习与跨学科知识深度结合。",
  badge: "跟着视频学德语",
  stats: ["B1-C1", "50期已完结", "文化科普"],
  image: "/images/1.png",
  purchaseDescription:
    "这是一套由符号刘博士团队独立开发的德语原创口语听力跟读素材库。该资料专为 B1-C1 级别的德语学习者设计，通过50期“科普季”系列视频，将语言学习与跨学科知识深度结合。",
  purchaseFeatures: [
    "智能字幕跟随：提供中德双语字幕，支持单句点读、循环播放及倍速调节。",
    "单词/短语卡片：遇到生词可即时跳转查看详细释义、用法及例句，并支持一键收藏。",
    "录音跟读评测：内置录音功能，方便学习者模仿地道发音并进行对比纠错。",
    "听力理解题：包含判断题、选择题等，考察对细节和逻辑的掌握。",
    "听写填空：针对关键表达进行听写练习，强化语感与拼写准确度。",
    "语法词汇练习：根据视频出现的重点语法和词汇进行练习，全方位强化德语。",
    "答案详解：提供详尽的解析，帮助学习者理清疑点。",
  ],
};

export const VLOG_SEASON_MODULE = {
  id: "vlog-season",
  route: "/modules/vlog-season",
  moduleKey: "learning_by_video",
  seasonNumber: 4,
  purchaseSeasonNumber: 4,
  originalPrice: 99.9,
  title: "Vlog季",
  subtitle: "80期已完结",
  description:
    "这是一套由符号刘博士团队独立开发的德语原创口语实战素材库。该资料专为 A2-B2 级别的德语学习者设计，通过精选80期德语母语者的生活化 Vlog 视频，带你走出课本，沉浸式掌握最鲜活、最地道的德语表达。",
  badge: "跟着视频学德语",
  stats: ["A2-B2", "80期已完结", "日常口语"],
  image: "/images/2.png",
  purchaseDescription:
    "这是一套由符号刘博士团队独立开发的德语原创口语实战素材库。该资料专为 A2-B2 级别的德语学习者设计，通过精选80期德语母语者的生活化 Vlog 视频，带你走出课本，沉浸式掌握最鲜活、最地道的德语表达。",
  purchaseFeatures: [
    "智能字幕跟随：提供精准的中德双语字幕，支持单句点读、循环播放及倍速调节，确保每一个发音细节都不错过。",
    "单词/短语卡片：视频中的生词、地道短语可即时跳转查看详细释义、用法及例句，并支持一键收藏，打造个人词库。",
    "录音跟读评测：内置录音对比功能，让你模仿母语者的语音语调进行跟读，即时反馈，有效纠正发音。",
    "语法词汇练习：根据视频中出现的重点语法现象和核心词汇，精心设计专项练习，帮助你在真实语境中化解语法难点。",
    "答案详解：每道练习均配有详尽的解析，不仅让你知其然，更知其所以然。",
  ],
};

export const EXAM_PREPARATION_MODULE = {
  id: "exam-preparation",
  route: "/modules/exam-preparation",
  moduleKey: "exam_preparation",
  title: "备考季",
  subtitle: "telc B1 听说读写全真训练",
  description:
    "“源于真题，高于真题” —— 我们的题库由符号刘博士团队精心打磨，紧扣官方大纲。用真题和模拟题复刻考试难度与命题规律，让你在考场上游刃有余、拒绝慌乱。",
  badge: "源于真题，高于真题",
  stats: ["telc B1", "全题型交互", "答案详解"],
  image: "/images/exam_cover.png",
  originalPricesByDuration: {
    30: 99.9,
    90: 199.9,
    180: 299.9,
  },
  purchaseDescription:
    "“源于真题，高于真题”——我们的题库由符号刘博士团队精心打磨，紧扣官方大纲。用真题和模拟题复刻考试难度与命题规律，让你在考场上游刃有余、拒绝慌乱。",
  purchaseNotice: "*目前只有 Telc B1 级别内容，其他考试类型题目正在开发中，敬请期待。",
  purchaseFeatures: [
    "沉浸式交互学习：告别单向的“看答案”，所有题型均支持深度在线交互。无论是阅读匹配、听力选择还是语法填空，操作流畅自然，还原真实考试体验。",
    "保姆级答案详解：做错不可怕，不知错在哪才致命。每道题目均配备逐句拆解与核心考点剖析。",
    "听说读写全维突破：打破单项练习壁垒。平台涵盖四大板块全真训练，更有针对口语与写作的高频话题素材，帮你实现词汇、句型、思维的立体式提升。",
    "智能错题集与复习闭环：系统自动归纳你的薄弱环节，支持一键加入错题本。通过错题重练，彻底消灭知识盲区，拒绝“反复犯错”。",
  ],
};

export const MODULES_BY_ID = {
  [SCIENCE_SEASON_MODULE.id]: SCIENCE_SEASON_MODULE,
  [VLOG_SEASON_MODULE.id]: VLOG_SEASON_MODULE,
  [EXAM_PREPARATION_MODULE.id]: EXAM_PREPARATION_MODULE,
};

export function getLearningVideoModuleBySeasonNumber(seasonNumber) {
  const normalizedSeasonNumber = Number(seasonNumber);
  if (normalizedSeasonNumber === 4) {
    return VLOG_SEASON_MODULE;
  }
  return SCIENCE_SEASON_MODULE;
}

export function toSafeNumber(value) {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  return 0;
}

export function buildStats(totalVideoCount, completedVideos, activeDays, options = {}) {
  const { includeActiveDays = true } = options;
  const stats = [
    { label: "总视频数", value: String(totalVideoCount) },
    { label: "完成视频", value: String(completedVideos), tone: "green" },
  ];

  if (includeActiveDays) {
    stats.push({ label: "学习天数", value: String(activeDays), tone: "blue" });
  }

  return stats;
}

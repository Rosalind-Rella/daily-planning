export const TASK_STATUS_OPTIONS = [
  { value: "todo", label: "待开始" },
  { value: "in-progress", label: "进行中" },
  { value: "done", label: "已完成" }
];

export const TASK_STATUS_LABELS = Object.fromEntries(
  TASK_STATUS_OPTIONS.map((option) => [option.value, option.label])
);

export const PRIORITY_LEVELS = [25, 50, 75, 100];
export const DEFAULT_IMPORTANCE = 50;
export const DEFAULT_URGENCY = 50;

export const ORDERING_MODE_OPTIONS = [
  { value: "auto", label: "默认排序" },
  { value: "manual-top", label: "手动置顶" },
  { value: "manual-bottom", label: "手动置底" }
];

export const ORDERING_MODE_LABELS = Object.fromEntries(
  ORDERING_MODE_OPTIONS.map((option) => [option.value, option.label])
);

export const CONTEXT_MENU_ACTIONS = [
  { value: "manual-top", label: "置顶" },
  { value: "manual-bottom", label: "置底" },
  { value: "auto", label: "恢复默认排序" }
];

export const QUOTE_TYPES = ["start", "push", "random"];
export const QUOTE_TYPE_LABELS = {
  start: "开始",
  push: "推动",
  random: "随机"
};

export const CARRYOVER_SUMMARY_MODES = [
  { value: "plan", label: "给出明日计划" },
  { value: "quote", label: "一句日历" }
];

export const CONTINUATION_FIELD_OPTIONS = [
  { value: "lastProgress", label: "上次进度" },
  { value: "projectPath", label: "相关路径" },
  { value: "deadline", label: "DDL" }
];

export const TIME_BLOCK_SLOTS = [
  { value: "morning", label: "上午" },
  { value: "afternoon", label: "下午" },
  { value: "evening", label: "晚上" }
];

export const DEFAULT_TASK_TITLE = "新建学习卡片";
export const UNTITLED_TASK_LABEL = "未命名任务";

export const TASK_COLORS = [
  { value: "#f1b24a", ink: "#4b2b02", label: "琥珀" },
  { value: "#f09a8d", ink: "#4c1d18", label: "珊瑚" },
  { value: "#8fcfbd", ink: "#12372d", label: "薄荷" },
  { value: "#9db9e8", ink: "#162847", label: "雾蓝" },
  { value: "#d6c0f0", ink: "#332047", label: "鸢尾" },
  { value: "#f3d7a6", ink: "#503616", label: "燕麦" }
];

export const DEFAULT_TASK_SIZE = { width: 280, height: 220 };
export const MIN_TASK_SIZE = { width: 230, height: 180 };
export const MAX_TASK_SIZE = { width: 430, height: 360 };

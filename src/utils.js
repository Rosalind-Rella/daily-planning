import {
  DEFAULT_IMPORTANCE,
  DEFAULT_TASK_SIZE,
  DEFAULT_TASK_TITLE,
  DEFAULT_URGENCY,
  TASK_COLORS,
  UNTITLED_TASK_LABEL
} from "./constants.js";

export function getTodayDateKey() {
  return toDateKey(new Date());
}

export function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDateLabel(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long"
  }).format(date);
}

export function formatDateTime(value) {
  if (!value) {
    return "--";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function formatMonthDay(value) {
  if (!value) {
    return "";
  }
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric"
  }).format(date);
}

export function formatArrangedFromLabel(dateKey) {
  if (!dateKey) {
    return "";
  }
  const [year, month, day] = String(dateKey).split("-");
  if (!year || !month || !day) {
    return "";
  }
  return `↪ from ${year}/${month}/${day}`;
}

export function formatQuoteBlock(text = "") {
  const normalized = String(text || "").trim();
  if (!normalized) {
    return "";
  }
  return `一句日历：\n${normalized}`;
}

export function getMonthKey(value) {
  if (!value) {
    return "";
  }
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
  }
  return String(value).slice(0, 7);
}

export function shiftMonthKey(monthKey, offset = 0) {
  const [year, month] = String(monthKey || "").split("-").map(Number);
  if (!year || !month) {
    return getMonthKey(new Date());
  }
  const date = new Date(year, month - 1 + offset, 1);
  return getMonthKey(date);
}

export function buildMonthDateCells(monthKey) {
  const [year, month] = String(monthKey || "").split("-").map(Number);
  if (!year || !month) {
    return [];
  }

  const firstDay = new Date(year, month - 1, 1);
  const firstWeekday = (firstDay.getDay() + 6) % 7;
  const startDate = new Date(year, month - 1, 1 - firstWeekday);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);
    const dateKey = toDateKey(date);
    return {
      dateKey,
      dayNumber: date.getDate(),
      inMonth: getMonthKey(date) === monthKey
    };
  });
}

export function createId(prefix = "id") {
  if (window.crypto?.randomUUID) {
    return `${prefix}-${window.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function getGridPosition(index = 0) {
  const column = index % 3;
  const row = Math.floor(index / 3);
  return {
    x: 28 + column * 298,
    y: 28 + row * 238
  };
}

export function computeAutoPriorityScore(importance = DEFAULT_IMPORTANCE, urgency = DEFAULT_URGENCY) {
  return importance * 0.5 + urgency * 0.5;
}

export function isAutoHighPriority(task) {
  return Number(task.importance || 0) >= 75 && Number(task.urgency || 0) >= 75;
}

export function normalizeOrderingMode(value) {
  if (value === "manual-top" || value === "manual-bottom") {
    return value;
  }
  return "auto";
}

export function legacyPriorityToLevels(priorityQuadrant) {
  switch (priorityQuadrant) {
    case "important-urgent":
      return { importance: 100, urgency: 100 };
    case "important-not-urgent":
      return { importance: 100, urgency: 50 };
    case "not-important-urgent":
      return { importance: 50, urgency: 100 };
    case "not-important-not-urgent":
      return { importance: 25, urgency: 25 };
    default:
      return { importance: DEFAULT_IMPORTANCE, urgency: DEFAULT_URGENCY };
  }
}

export function normalizeTaskScheduleFields(task = {}) {
  const date = String(task.date || task.scheduledDate || "");
  const scheduledDate = String(task.scheduledDate || date);
  const arrangedFrom = String(task.arrangedFrom || "");
  const isArrangedTask =
    typeof task.isArrangedTask === "boolean"
      ? task.isArrangedTask
      : Boolean(arrangedFrom || task.carriedFromTaskId);

  return {
    ...task,
    date,
    scheduledDate,
    arrangedFrom,
    isArrangedTask
  };
}

export function defaultTask(date, index = 0) {
  const palette = TASK_COLORS[index % TASK_COLORS.length];
  const createdAt = new Date().toISOString();
  return normalizeTaskScheduleFields({
    id: createId("task"),
    date,
    title: DEFAULT_TASK_TITLE,
    status: "todo",
    color: palette.value,
    colorInk: palette.ink,
    importance: DEFAULT_IMPORTANCE,
    urgency: DEFAULT_URGENCY,
    orderingMode: "auto",
    orderingUpdatedAt: createdAt,
    autoPriorityScore: computeAutoPriorityScore(DEFAULT_IMPORTANCE, DEFAULT_URGENCY),
    collapsed: false,
    position: getGridPosition(index),
    size: { ...DEFAULT_TASK_SIZE },
    archivedAt: null,
    carriedFromTaskId: "",
    carriedAt: null,
    createdAt,
    updatedAt: createdAt
  });
}

export function nextDateKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + 1);
  return toDateKey(date);
}

export function escapeHtml(text = "") {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function truncate(text = "", maxLength = 120) {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1)}...`;
}

export function displayTaskTitle(taskOrTitle) {
  const value = typeof taskOrTitle === "string" ? taskOrTitle : taskOrTitle?.title;
  const title = String(value || "").trim();
  return title || UNTITLED_TASK_LABEL;
}

function orderingBucket(task) {
  const mode = normalizeOrderingMode(task.orderingMode);
  if (mode === "manual-bottom") {
    return 0;
  }
  if (mode === "manual-top" || isAutoHighPriority(task)) {
    return 2;
  }
  return 1;
}

export function compareTasksForCalendarCell(left, right) {
  const leftBucket = left.arrangedFrom || left.isArrangedTask ? 0 : isAutoHighPriority(left) ? 1 : left.status === "done" ? 2 : 3;
  const rightBucket = right.arrangedFrom || right.isArrangedTask ? 0 : isAutoHighPriority(right) ? 1 : right.status === "done" ? 2 : 3;
  if (leftBucket !== rightBucket) {
    return leftBucket - rightBucket;
  }
  return compareTasksByPriority(left, right);
}

export function compareTasksByPriority(left, right) {
  const bucketDelta = orderingBucket(right) - orderingBucket(left);
  if (bucketDelta !== 0) {
    return bucketDelta;
  }

  const orderingDelta =
    new Date(right.orderingUpdatedAt || 0).getTime() - new Date(left.orderingUpdatedAt || 0).getTime();
  if (orderingDelta !== 0) {
    return orderingDelta;
  }

  const scoreDelta = Number(right.autoPriorityScore || 0) - Number(left.autoPriorityScore || 0);
  if (scoreDelta !== 0) {
    return scoreDelta;
  }

  return new Date(left.createdAt || 0).getTime() - new Date(right.createdAt || 0).getTime();
}

export function sortTasksByPriority(tasks = []) {
  return [...tasks].sort(compareTasksByPriority);
}

export function normalizeLineList(text = "") {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function formatBulletNotes(contents = []) {
  return contents
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .map((item) => `• ${item}`)
    .join("\n");
}

export function trimSummaryText(text = "", maxWords = 75) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }

  const words = normalized.split(" ");
  if (words.length <= maxWords) {
    return normalized;
  }
  return `${words.slice(0, maxWords).join(" ")}…`;
}

export function getQuoteStorageKey(dateKey) {
  return `study-desk-quote-${dateKey}`;
}

export function pickRandom(items = []) {
  if (!items.length) {
    return null;
  }
  const index = Math.floor(Math.random() * items.length);
  return items[index];
}

export function pickQuoteByType(quotes = [], type = "random") {
  const enabledQuotes = quotes.filter((quote) => quote?.enabled !== false);
  const bucket = enabledQuotes.filter((quote) => quote.type === type);
  return pickRandom(bucket) || pickRandom(enabledQuotes) || null;
}

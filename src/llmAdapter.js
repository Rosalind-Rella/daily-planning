import { TASK_STATUS_LABELS } from "./constants.js";
import { LLM_CONFIG } from "./llmConfig.js";
import { displayTaskTitle, formatBulletNotes, trimSummaryText } from "./utils.js";

const SUMMARY_FAILURE_FALLBACK = "摘要生成失败，可手动补充";

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function readProxyError(status, rawText) {
  try {
    const parsed = rawText ? JSON.parse(rawText) : {};
    return parsed.error || parsed.message || rawText || `HTTP ${status}`;
  } catch (error) {
    return rawText || `HTTP ${status}`;
  }
}

function joinSection(title, value) {
  return `${title}：${value || "无"}`;
}

function formatContinuationEntry(entry) {
  if (!entry) {
    return "无";
  }

  const parts = [];
  if (entry.lastProgress) {
    parts.push(joinSection("上次进度", entry.lastProgress));
  }
  if (entry.projectPath) {
    parts.push(joinSection("相关路径", entry.projectPath));
  }
  if (Array.isArray(entry.fileList) && entry.fileList.length) {
    parts.push(joinSection("相关文件", entry.fileList.join("、")));
  }
  if (entry.deadline) {
    parts.push(joinSection("DDL", entry.deadline));
  }
  return parts.join("\n") || "无";
}

export function getLLMStatusLabel() {
  if (!navigator.onLine) {
    return "离线可写，本地记录正常；LLM 暂不可用";
  }

  if (LLM_CONFIG.useRemote) {
    return `在线中：可使用 ${LLM_CONFIG.activeProfile.label}`;
  }

  return "当前使用 mock 摘要模式";
}

async function fetchRemoteText(systemPrompt, userPrompt) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), LLM_CONFIG.timeoutMs);

  try {
    const response = await fetch(LLM_CONFIG.endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: LLM_CONFIG.activeProfile.model,
        systemPrompt,
        userPrompt
      }),
      signal: controller.signal
    });

    const rawText = await response.text();
    if (!response.ok) {
      if ([404, 405, 501].includes(response.status)) {
        throw new Error("LLM 代理未启动，请先运行 python serve_app.py 4173。");
      }
      throw new Error(`LLM request failed: ${readProxyError(response.status, rawText)}`);
    }

    const data = rawText ? JSON.parse(rawText) : {};
    const content = typeof data.content === "string" ? data.content.trim() : "";
    if (!content) {
      throw new Error("LLM 没有返回可用内容。");
    }
    return content;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("LLM 响应超时，请稍后再试。");
    }
    if (error instanceof TypeError) {
      throw new Error("无法连接到本地 LLM 代理，请确认 python serve_app.py 4173 正在运行。");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function buildFormattingRules() {
  return [
    "请使用自然语言，不要使用 ##、###、Markdown 标题、JSON 或代码块。",
    "输出保持简洁，适合作为任务工作台中的轻量提示。",
    "如需给建议，先说判断，再说下一步。"
  ].join("\n");
}

async function mockChat(taskContext, userMessage) {
  await sleep(250);
  return {
    content: [
      `当前任务状态是${TASK_STATUS_LABELS[taskContext.task.status]}。`,
      `你可以先围绕“${displayTaskTitle(taskContext.task)}”推进最小可执行的一步。`,
      `你刚才的问题是：${userMessage}`
    ].join("\n\n")
  };
}

async function mockSummary(dayContext) {
  await sleep(300);
  const doneCount = dayContext.tasks.filter((entry) => entry.task.status === "done").length;
  const progressCount = dayContext.tasks.filter((entry) => entry.task.status === "in-progress").length;
  const todoCount = dayContext.tasks.filter((entry) => entry.task.status === "todo").length;

  return {
    draft: [
      `今天共有 ${dayContext.tasks.length} 张任务卡，其中完成 ${doneCount} 张，进行中 ${progressCount} 张，待开始 ${todoCount} 张。`,
      "整体节奏是稳步推进型，已有清晰的延续线索和局部成果。",
      "建议优先继续推进当前最关键的任务，并把新出现的想法及时记录下来。"
    ].join("\n\n")
  };
}

async function mockTaskChatSummary(task, messages = []) {
  await sleep(220);
  const latest = messages[messages.length - 1]?.content || "";
  return {
    summary: trimSummaryText(
      `围绕“${displayTaskTitle(task)}”的对话已经聚焦到当前推进点${latest ? `，最新讨论提到了：${latest}` : ""}。`
    ),
    source: "mock"
  };
}

async function mockNextStepPlan(task, selectedNotes = [], continuationEntry = null, chatSummary = "") {
  await sleep(220);
  const noteHint = selectedNotes.length ? `先接着处理已勾选的 ${selectedNotes.length} 条 notes。` : "";
  const progressHint = continuationEntry?.lastProgress ? "优先从上次进度衔接。" : "";
  const chatHint = chatSummary ? "并参考刚刚提炼出的对话摘要。" : "";
  return {
    summary: trimSummaryText(
      `下一步建议围绕“${displayTaskTitle(task)}”先完成最小可执行的一步。${noteHint}${progressHint}${chatHint}`
    ),
    source: "mock"
  };
}

export async function chat(taskContext, userMessage) {
  if (!navigator.onLine) {
    throw new Error("当前离线，任务记录仍可使用，但 LLM 对话暂不可用。");
  }

  if (!LLM_CONFIG.useRemote) {
    return mockChat(taskContext, userMessage);
  }

  const systemPrompt = [
    "你是 Study Desk 中的任务辅助 LLM，目标是帮助用户稳住节奏并推进任务。",
    "回答控制在 1 到 3 段短句内。",
    buildFormattingRules()
  ].join("\n");

  const userPrompt = [
    joinSection("任务标题", displayTaskTitle(taskContext.task)),
    joinSection("任务状态", TASK_STATUS_LABELS[taskContext.task.status]),
    joinSection("重要程度", `${taskContext.task.importance}%`),
    joinSection("紧急程度", `${taskContext.task.urgency}%`),
    joinSection(
      "Notes",
      taskContext.notes.length ? taskContext.notes.map((note) => note.content).join(" | ") : "无"
    ),
    joinSection(
      "任务内对话",
      taskContext.messages.length
        ? taskContext.messages.map((message) => `${message.role === "user" ? "用户" : "LLM"}：${message.content}`).join(" | ")
        : "无"
    ),
    joinSection("任务延续区", formatContinuationEntry(taskContext.continuationEntry)),
    joinSection("用户当前问题", userMessage)
  ].join("\n\n");

  try {
    const content = await fetchRemoteText(systemPrompt, userPrompt);
    return { content, source: "remote" };
  } catch (error) {
    if (LLM_CONFIG.allowMockFallback) {
      return mockChat(taskContext, userMessage);
    }
    throw error;
  }
}

export async function summarizeDay(dayContext) {
  if (!navigator.onLine) {
    throw new Error("当前离线，无法生成每日总结草稿。");
  }

  if (!LLM_CONFIG.useRemote) {
    return mockSummary(dayContext);
  }

  const doneCount = dayContext.tasks.filter((entry) => entry.task.status === "done").length;
  const progressCount = dayContext.tasks.filter((entry) => entry.task.status === "in-progress").length;
  const todoCount = dayContext.tasks.filter((entry) => entry.task.status === "todo").length;

  const taskBlocks = dayContext.tasks.map((entry, index) =>
    [
      `任务 ${index + 1}`,
      joinSection("标题", displayTaskTitle(entry.task)),
      joinSection("状态", TASK_STATUS_LABELS[entry.task.status]),
      joinSection("重要 / 紧急", `${entry.task.importance}% / ${entry.task.urgency}%`),
      joinSection("Notes", entry.notes.length ? entry.notes.map((note) => note.content).join(" | ") : "无"),
      joinSection(
        "任务内对话",
        entry.messages.length
          ? entry.messages.map((message) => `${message.role === "user" ? "用户" : "LLM"}：${message.content}`).join(" | ")
          : "无"
      ),
      joinSection("任务延续区", formatContinuationEntry(entry.continuationEntry))
    ].join("\n")
  );

  const systemPrompt = [
    "你要为 Study Desk 生成当天总结草稿。",
    "总结要包含整体进度、客观观察、下一步建议和一句温和鼓励。",
    buildFormattingRules()
  ].join("\n");

  const userPrompt = [
    joinSection("日期", dayContext.date),
    joinSection("任务总数", String(dayContext.tasks.length)),
    joinSection("已完成", String(doneCount)),
    joinSection("进行中", String(progressCount)),
    joinSection("待开始", String(todoCount)),
    joinSection("已有草稿", dayContext.existingDraft || "无"),
    "以下是任务详情：",
    taskBlocks.join("\n\n")
  ].join("\n\n");

  try {
    const draft = await fetchRemoteText(systemPrompt, userPrompt);
    return { draft, source: "remote" };
  } catch (error) {
    if (LLM_CONFIG.allowMockFallback) {
      return mockSummary(dayContext);
    }
    throw error;
  }
}

export async function summarizeTaskChatForArrange({ task, messages = [], continuationEntry = null }) {
  if (!messages.length) {
    return { summary: SUMMARY_FAILURE_FALLBACK, source: "fallback" };
  }

  if (!navigator.onLine || !LLM_CONFIG.useRemote) {
    return mockTaskChatSummary(task, messages);
  }

  const systemPrompt = [
    "你要把当前任务内的对话提炼成一小段简洁摘要，供未来任务继续使用。",
    "摘要必须自然、简短、可执行，不要复制整段原文。",
    buildFormattingRules()
  ].join("\n");

  const userPrompt = [
    joinSection("任务标题", displayTaskTitle(task)),
    joinSection("任务状态", TASK_STATUS_LABELS[task.status]),
    joinSection("任务延续区", formatContinuationEntry(continuationEntry)),
    joinSection(
      "当前对话",
      messages.map((message) => `${message.role === "user" ? "用户" : "LLM"}：${message.content}`).join(" | ")
    ),
    "请生成一小段可直接写入未来任务卡片的摘要。"
  ].join("\n\n");

  try {
    const summary = await fetchRemoteText(systemPrompt, userPrompt);
    return {
      summary: trimSummaryText(summary),
      source: "remote"
    };
  } catch (error) {
    if (LLM_CONFIG.allowMockFallback) {
      return mockTaskChatSummary(task, messages);
    }
    return { summary: SUMMARY_FAILURE_FALLBACK, source: "fallback" };
  }
}

export async function generateNextStepPlan({
  task,
  selectedNotes = [],
  continuationEntry = null,
  chatSummary = ""
}) {
  if (!navigator.onLine || !LLM_CONFIG.useRemote) {
    return mockNextStepPlan(task, selectedNotes, continuationEntry, chatSummary);
  }

  const bulletNotes = formatBulletNotes(selectedNotes);
  const systemPrompt = [
    "你要为 Study Desk 生成一小段“下一步计划”。",
    "目标是让用户打开未来任务时，立刻知道先做什么。",
    buildFormattingRules()
  ].join("\n");

  const userPrompt = [
    joinSection("任务标题", displayTaskTitle(task)),
    joinSection("任务状态", TASK_STATUS_LABELS[task.status]),
    joinSection("重要 / 紧急", `${task.importance}% / ${task.urgency}%`),
    joinSection("已选 Notes", bulletNotes || "无"),
    joinSection("任务延续区", formatContinuationEntry(continuationEntry)),
    joinSection("对话摘要", chatSummary || "无"),
    "请输出一小段自然语言计划，帮助用户继续推进。"
  ].join("\n\n");

  try {
    const summary = await fetchRemoteText(systemPrompt, userPrompt);
    return {
      summary: trimSummaryText(summary),
      source: "remote"
    };
  } catch (error) {
    if (LLM_CONFIG.allowMockFallback) {
      return mockNextStepPlan(task, selectedNotes, continuationEntry, chatSummary);
    }
    return { summary: SUMMARY_FAILURE_FALLBACK, source: "fallback" };
  }
}

export async function generateCarryoverSummary({ task, selectedNotes, selectedModes, continuationEntry = null, chatSummary = "" }) {
  const wantsPlan = Array.isArray(selectedModes) && selectedModes.includes("plan");
  if (!wantsPlan) {
    return { summary: "", source: "none" };
  }
  return generateNextStepPlan({ task, selectedNotes, continuationEntry, chatSummary });
}

export { SUMMARY_FAILURE_FALLBACK };

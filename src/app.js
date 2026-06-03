import {
  CARRYOVER_SUMMARY_MODES,
  CONTINUATION_FIELD_OPTIONS,
  DEFAULT_IMPORTANCE,
  DEFAULT_URGENCY,
  MAX_TASK_SIZE,
  MIN_TASK_SIZE,
  ORDERING_MODE_LABELS,
  PRIORITY_LEVELS,
  TASK_COLORS,
  TASK_STATUS_LABELS,
  TASK_STATUS_OPTIONS,
  TIME_BLOCK_SLOTS
} from "./constants.js";
import {
  buildMonthDateCells,
  clamp,
  compareTasksForCalendarCell,
  computeAutoPriorityScore,
  createId,
  defaultTask,
  displayTaskTitle,
  escapeHtml,
  formatBulletNotes,
  formatArrangedFromLabel,
  formatDateLabel,
  formatDateTime,
  formatQuoteBlock,
  getMonthKey,
  formatMonthDay,
  getGridPosition,
  getQuoteStorageKey,
  getTodayDateKey,
  nextDateKey,
  normalizeLineList,
  pickQuoteByType,
  shiftMonthKey,
  sortTasksByPriority,
  trimSummaryText,
  truncate
} from "./utils.js";
import {
  deleteNote,
  deleteTaskCascade,
  getAppConfig,
  getContinuationByTask,
  getDailyRecord,
  getDatesWithData,
  getMessagesByTask,
  getNotesByTask,
  getQuotes,
  getStorageStatus,
  getTasksByDate,
  getTimeBlocksByDate,
  maybeMigrateLegacyData,
  openDatabase,
  putContinuationEntry,
  putDailyRecord,
  putMessage,
  putNote,
  putTask,
  putTasks,
  putTimeBlocksByDate
} from "./db.js";
// LLM workflow is disabled in the current local-only build.
// import {
//   chat,
//   generateCarryoverSummary,
//   getLLMStatusLabel,
//   summarizeDay,
//   summarizeTaskChatForArrange,
//   SUMMARY_FAILURE_FALLBACK
// } from "./llmAdapter.js";

class StudyDeskApp {
  constructor() {
    const todayDate = getTodayDateKey();
    this.carryoverQuoteFallback = "把今天安放好，明天会来接你。";
    this.state = {
      appConfig: {
        llmEnabled: false
      },
      currentDate: todayDate,
      historyDate: todayDate,
      monthKey: getMonthKey(todayDate),
      view: "today",
      tasks: [],
      dailyRecord: null,
      historyDates: [],
      selectedTaskId: null,
      currentNotes: [],
      currentMessages: [],
      currentContinuationEntry: null,
      noteCounts: {},
      messageCounts: {},
      archiveExpanded: false,
      llmReady: false,
      storageInfo: null,
      quotes: [],
      todayQuote: null,
      canvasHeight: 520,
      timeBlocks: {
        date: todayDate,
        morning: [],
        afternoon: [],
        evening: []
      },
      timeBlockExpanded: true,
      calendarCells: [],
      calendarPanel: {
        date: "",
        record: null,
        tasks: [],
        details: []
      },
      copyModalState: {
        open: false,
        targetDate: "",
        selectedContinuationFields: new Set(),
        includeChatSummary: false,
        selectedNoteIds: new Set(),
        selectedModes: new Set(),
        quotePreviewText: ""
      }
    };

    this.dragState = null;
    this.summaryModalOpen = false;
    this.summaryBusy = false;
    this.chatBusy = false;
    this.copyBusy = false;
    this.summaryDraftSaveTimer = null;
    this.titleSaveTimer = null;
    this.titleDraftTaskId = null;
    this.titleDraftValue = "";
    this.titleDirty = false;
    this.titleComposing = false;
    this.contextMenu = { open: false, taskId: null, x: 0, y: 0 };
    this.monthTooltip = { open: false, x: 0, y: 0, items: [] };

    this.elements = {
      appShell: document.querySelector(".app-shell"),
      todayLabel: document.querySelector("#today-label"),
      heroDate: document.querySelector("#hero-date"),
      todayQuote: document.querySelector("#today-quote"),
      activeCount: document.querySelector("#active-count"),
      doneCount: document.querySelector("#done-count"),
      summaryPreview: document.querySelector("#summary-preview"),
      canvas: document.querySelector("#task-canvas"),
      canvasEmpty: document.querySelector("#canvas-empty"),
      canvasEmptyAction: document.querySelector("#canvas-empty-action"),
      todayLayout: document.querySelector("#today-layout"),
      timeBlockPanel: document.querySelector("#time-block-panel"),
      timeBlockToggle: document.querySelector("#time-block-toggle"),
      timeBlockBody: document.querySelector("#time-block-body"),
      timeBlockSlots: document.querySelector("#time-block-slots"),
      timeBlockUnassigned: document.querySelector("#time-block-unassigned"),
      archiveToggle: document.querySelector("#archive-toggle"),
      archiveCount: document.querySelector("#archive-count"),
      archiveContent: document.querySelector("#archive-content"),
      mainLayout: document.querySelector(".main-layout"),
      todayView: document.querySelector("#today-view"),
      historyView: document.querySelector("#history-view"),
      monthView: document.querySelector("#month-view"),
      todayTab: document.querySelector("#today-tab"),
      historyTab: document.querySelector("#history-tab"),
      monthTab: document.querySelector("#month-tab"),
      addTaskBtn: document.querySelector("#add-task-btn"),
      openSummaryBtn: document.querySelector("#open-summary-btn"),
      networkPill: document.querySelector("#network-pill"),
      drawer: document.querySelector("#detail-drawer"),
      drawerEmpty: document.querySelector("#drawer-empty"),
      drawerContent: document.querySelector("#drawer-content"),
      drawerScroll: document.querySelector("#drawer-scroll"),
      drawerHeading: document.querySelector("#drawer-heading"),
      closeDrawerBtn: document.querySelector("#close-drawer-btn"),
      taskTitleInput: document.querySelector("#task-title-input"),
      taskStatusSelect: document.querySelector("#task-status-select"),
      orderingModeLabel: document.querySelector("#ordering-mode-label"),
      importanceSlider: document.querySelector("#importance-slider"),
      urgencySlider: document.querySelector("#urgency-slider"),
      colorPicker: document.querySelector("#color-picker"),
      archiveTaskBtn: document.querySelector("#archive-task-btn"),
      copyTaskBtn: document.querySelector("#copy-task-btn"),
      deleteTaskBtn: document.querySelector("#delete-task-btn"),
      noteInput: document.querySelector("#note-input"),
      addNoteBtn: document.querySelector("#add-note-btn"),
      noteList: document.querySelector("#note-list"),
      chatList: document.querySelector("#chat-list"),
      chatInput: document.querySelector("#chat-input"),
      sendChatBtn: document.querySelector("#send-chat-btn"),
      chatStatus: document.querySelector("#chat-status"),
      continuationHint: document.querySelector("#continuation-hint"),
      continuationProgressInput: document.querySelector("#continuation-progress-input"),
      continuationProjectPathInput: document.querySelector("#continuation-project-path-input"),
      continuationFilesInput: document.querySelector("#continuation-files-input"),
      continuationDeadlineInput: document.querySelector("#continuation-deadline-input"),
      saveContinuationBtn: document.querySelector("#save-continuation-btn"),
      continuationStatus: document.querySelector("#continuation-status"),
      historyDate: document.querySelector("#history-date"),
      refreshHistoryBtn: document.querySelector("#refresh-history-btn"),
      historySummaryText: document.querySelector("#history-summary-text"),
      historyEmpty: document.querySelector("#history-empty"),
      historyTaskList: document.querySelector("#history-task-list"),
      monthLabel: document.querySelector("#month-label"),
      prevMonthBtn: document.querySelector("#prev-month-btn"),
      nextMonthBtn: document.querySelector("#next-month-btn"),
      monthGrid: document.querySelector("#month-grid"),
      monthDayTitle: document.querySelector("#month-day-title"),
      monthDaySummary: document.querySelector("#month-day-summary"),
      monthDayEmpty: document.querySelector("#month-day-empty"),
      monthDayTaskList: document.querySelector("#month-day-task-list"),
      monthOverflowTooltip: document.querySelector("#month-overflow-tooltip"),
      toastRegion: document.querySelector("#toast-region"),
      summaryModal: document.querySelector("#summary-modal"),
      closeSummaryBtn: document.querySelector("#close-summary-btn"),
      generateSummaryBtn: document.querySelector("#generate-summary-btn"),
      saveSummaryBtn: document.querySelector("#save-summary-btn"),
      summaryEditor: document.querySelector("#summary-editor"),
      summaryStatus: document.querySelector("#summary-status"),
      copyModal: document.querySelector("#copy-modal"),
      closeCopyBtn: document.querySelector("#close-copy-btn"),
      cancelCopyBtn: document.querySelector("#cancel-copy-btn"),
      confirmCopyBtn: document.querySelector("#confirm-copy-btn"),
      copyModalTitle: document.querySelector("#copy-modal-title"),
      copyTargetDate: document.querySelector("#copy-target-date"),
      copyNoteList: document.querySelector("#copy-note-list"),
      copyContinuationFieldList: document.querySelector("#copy-continuation-field-list"),
      copyChatSummaryCheckbox: document.querySelector("#copy-chat-summary-checkbox"),
      copyModeList: document.querySelector("#copy-mode-list"),
      copyPreview: document.querySelector("#copy-preview"),
      copyStatus: document.querySelector("#copy-status"),
      taskContextMenu: document.querySelector("#task-context-menu"),
      llmOnly: [...document.querySelectorAll("[data-llm-only]")]
    };
  }

  async init() {
    this.state.storageInfo = await openDatabase();
    this.state.appConfig = await getAppConfig();
    this.state.quotes = await getQuotes();
    this.seedStaticControls();
    this.applyFeatureVisibility();
    this.bindEvents();
    this.updateViewLayoutMode();

    const migration = await maybeMigrateLegacyData();
    if (migration?.migrated) {
      this.showToast("success", `已将旧版浏览器数据导入到 ${migration.dataDir}`);
      this.state.storageInfo = await getStorageStatus();
    }

    await this.loadToday();
    await this.loadHistoryDates();
    await this.loadHistory(this.state.historyDate);
    await this.loadMonthView(this.state.monthKey);
    this.state.llmReady = this.state.appConfig.llmEnabled ? await this.checkLLMProxyAvailability() : false;
    this.updateNetworkPill();
    this.registerServiceWorker();
  }

  seedStaticControls() {
    this.elements.taskStatusSelect.innerHTML = TASK_STATUS_OPTIONS.map(
      (option) => `<option value="${option.value}">${option.label}</option>`
    ).join("");

    this.elements.colorPicker.innerHTML = TASK_COLORS.map(
      (color) => `
        <button
          class="color-swatch"
          type="button"
          data-color-value="${color.value}"
          data-color-ink="${color.ink}"
          title="${color.label}"
          style="background:${color.value}"
        ></button>
      `
    ).join("");

    this.elements.copyModeList.innerHTML = this.getAvailableCopyModes().map(
      (mode) => `<button class="toggle-chip" type="button" data-copy-mode="${mode.value}">${mode.label}</button>`
    ).join("");

    this.elements.historyDate.value = this.state.historyDate;
  }

  applyFeatureVisibility() {
    const hideLLM = !this.state.appConfig.llmEnabled;
    this.elements.appShell.classList.toggle("llm-disabled", hideLLM);
    this.elements.llmOnly.forEach((element) => {
      element.classList.toggle("hidden", hideLLM);
    });
  }

  getAvailableCopyModes() {
    return this.state.appConfig.llmEnabled
      ? CARRYOVER_SUMMARY_MODES
      : CARRYOVER_SUMMARY_MODES.filter((mode) => mode.value === "quote");
  }

  bindEvents() {
    this.elements.addTaskBtn.addEventListener("click", () => this.createTask());
    this.elements.canvasEmptyAction.addEventListener("click", () => this.createTask());
    this.elements.todayTab.addEventListener("click", () => this.switchView("today"));
    this.elements.historyTab.addEventListener("click", () => this.switchView("history"));
    this.elements.monthTab.addEventListener("click", () => this.switchView("month"));
    this.elements.archiveToggle.addEventListener("click", () => {
      this.state.archiveExpanded = !this.state.archiveExpanded;
      this.renderArchive();
    });
    this.elements.timeBlockToggle.addEventListener("click", () => this.toggleTimeBlockPanel());

    this.elements.openSummaryBtn.addEventListener("click", () => this.openSummaryModal());
    this.elements.closeSummaryBtn.addEventListener("click", () => this.closeSummaryModal());
    this.elements.summaryModal.addEventListener("click", (event) => {
      if (event.target instanceof HTMLElement && event.target.dataset.closeSummary === "true") {
        this.closeSummaryModal();
      }
    });
    // LLM auto-summary is disabled in the current local-only workflow.
    // this.elements.generateSummaryBtn.addEventListener("click", () => this.generateSummaryDraft());
    this.elements.saveSummaryBtn.addEventListener("click", () => this.saveFinalSummary());
    this.elements.summaryEditor.addEventListener("input", () => this.scheduleSummaryDraftSave());

    this.elements.closeDrawerBtn.addEventListener("click", () => this.clearSelection());
    this.elements.taskTitleInput.addEventListener("input", (event) => this.handleTitleInput(event));
    this.elements.taskTitleInput.addEventListener("compositionstart", () => {
      this.titleComposing = true;
    });
    this.elements.taskTitleInput.addEventListener("compositionend", () => {
      this.titleComposing = false;
      this.scheduleTitleSave();
    });
    this.elements.taskTitleInput.addEventListener("blur", () => this.persistTitleDraft(true));
    this.elements.taskTitleInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        this.persistTitleDraft(true);
        this.elements.taskTitleInput.blur();
      }
    });

    this.elements.taskStatusSelect.addEventListener("change", async (event) => {
      await this.updateSelectedTask({ status: event.target.value }, { render: false });
      await this.refreshSelectedTaskCollections();
      this.renderToday();
      this.renderDrawer();
      await this.loadHistory(this.state.historyDate);
    });

    this.elements.importanceSlider.addEventListener("click", (event) => this.handlePrioritySliderClick(event));
    this.elements.urgencySlider.addEventListener("click", (event) => this.handlePrioritySliderClick(event));

    this.elements.colorPicker.addEventListener("click", async (event) => {
      const target = event.target.closest("[data-color-value]");
      if (!target) {
        return;
      }

      await this.updateSelectedTask(
        {
          color: target.dataset.colorValue,
          colorInk: target.dataset.colorInk
        },
        { render: false }
      );
      this.renderToday();
      this.renderDrawer();
      await this.loadHistory(this.state.historyDate);
    });

    this.elements.archiveTaskBtn.addEventListener("click", () => this.toggleArchiveSelectedTask());
    this.elements.copyTaskBtn.addEventListener("click", () => this.openCopyModal());
    this.elements.deleteTaskBtn.addEventListener("click", () => this.deleteSelectedTask());

    this.elements.addNoteBtn.addEventListener("click", () => this.addNoteToSelectedTask());
    this.elements.noteList.addEventListener("click", (event) => {
      const button = event.target.closest("[data-delete-note-id]");
      if (!button) {
        return;
      }
      this.removeNoteFromSelectedTask(button.dataset.deleteNoteId);
    });

    // LLM task chat is disabled in the current local-only workflow.
    // this.elements.sendChatBtn.addEventListener("click", () => this.sendChatMessage());
    this.elements.saveContinuationBtn.addEventListener("click", () => this.saveContinuationEntry());
    this.elements.refreshHistoryBtn.addEventListener("click", () => this.loadHistory(this.elements.historyDate.value));
    this.elements.historyDate.addEventListener("change", (event) => this.loadHistory(event.target.value));
    this.elements.prevMonthBtn.addEventListener("click", () => this.loadMonthView(shiftMonthKey(this.state.monthKey, -1)));
    this.elements.nextMonthBtn.addEventListener("click", () => this.loadMonthView(shiftMonthKey(this.state.monthKey, 1)));
    this.elements.monthGrid.addEventListener("click", (event) => this.handleMonthGridClick(event));
    this.elements.monthGrid.addEventListener("mouseover", (event) => this.handleMonthGridHover(event));
    this.elements.monthGrid.addEventListener("mouseout", (event) => this.handleMonthGridHoverOut(event));
    this.elements.monthDayTaskList.addEventListener("click", (event) => this.handleMonthDayTaskClick(event));
    this.elements.timeBlockSlots.addEventListener("click", (event) => this.handleTimeBlockClick(event));

    this.elements.closeCopyBtn.addEventListener("click", () => this.closeCopyModal());
    this.elements.cancelCopyBtn.addEventListener("click", () => this.closeCopyModal());
    this.elements.confirmCopyBtn.addEventListener("click", () => this.confirmCopyToTomorrow());
    this.elements.copyModal.addEventListener("click", (event) => {
      if (event.target instanceof HTMLElement && event.target.dataset.closeCopy === "true") {
        this.closeCopyModal();
      }
    });
    this.elements.copyTargetDate.addEventListener("change", (event) => {
      this.state.copyModalState.targetDate = event.target.value || "";
      this.renderCopyPreview();
    });
    this.elements.copyNoteList.addEventListener("change", (event) => this.toggleCopyNote(event));
    this.elements.copyContinuationFieldList.addEventListener("click", (event) =>
      this.toggleCopyContinuationField(event)
    );
    this.elements.copyChatSummaryCheckbox.addEventListener("change", (event) => {
      this.state.copyModalState.includeChatSummary = Boolean(event.target.checked);
      this.renderCopyPreview();
    });
    this.elements.copyModeList.addEventListener("click", (event) => this.toggleCopyMode(event));

    this.elements.taskContextMenu.addEventListener("click", (event) => {
      const button = event.target.closest("[data-context-action]");
      if (!button) {
        return;
      }
      this.applyContextMenuAction(button.dataset.contextAction);
    });

    window.addEventListener("online", async () => {
      this.state.llmReady = this.state.appConfig.llmEnabled ? await this.checkLLMProxyAvailability() : false;
      this.updateNetworkPill();
      this.renderDrawer();
    });
    window.addEventListener("offline", () => {
      this.state.llmReady = false;
      this.updateNetworkPill();
      this.renderDrawer();
    });
    window.addEventListener("pointermove", (event) => this.handlePointerMove(event));
    window.addEventListener("pointerup", () => this.handlePointerUp());
    window.addEventListener("click", (event) => {
      if (
        this.contextMenu.open &&
        !(event.target instanceof HTMLElement && event.target.closest("#task-context-menu"))
      ) {
        this.hideContextMenu();
      }
    });
    window.addEventListener("scroll", () => this.hideContextMenu(), true);
    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        this.hideContextMenu();
        if (this.state.copyModalState.open) {
          this.closeCopyModal();
        }
      }
    });
  }

  async checkLLMProxyAvailability() {
    if (!this.state.appConfig.llmEnabled) {
      return false;
    }
    if (!navigator.onLine) {
      return false;
    }

    try {
      const response = await fetch("/api/llm", { method: "OPTIONS" });
      return response.ok || response.status === 204;
    } catch {
      return false;
    }
  }

  async loadToday() {
    const tasks = (await getTasksByDate(this.state.currentDate)).map((task) => ({
      ...task,
      collapsed: Boolean(task.collapsed)
    }));
    this.state.tasks = tasks;
    await this.loadTodayTimeBlocks(tasks);
    this.state.dailyRecord = await this.syncDailyRecord(
      this.state.currentDate,
      tasks.map((task) => task.id)
    );
    this.state.selectedTaskId = tasks.some((task) => task.id === this.state.selectedTaskId)
      ? this.state.selectedTaskId
      : null;
    await this.buildTaskActivityMaps();
    await this.refreshSelectedTaskCollections();
    this.selectTodayQuote();
    this.renderToday();
    this.renderDrawer();
  }

  async buildTaskActivityMaps(tasks = this.state.tasks) {
    const detailEntries = await Promise.all(
      tasks.map(async (task) => ({
        taskId: task.id,
        noteCount: (await getNotesByTask(task.id)).length,
        messageCount: (await getMessagesByTask(task.id)).length
      }))
    );

    this.state.noteCounts = Object.fromEntries(detailEntries.map((entry) => [entry.taskId, entry.noteCount]));
    this.state.messageCounts = Object.fromEntries(
      detailEntries.map((entry) => [entry.taskId, entry.messageCount])
    );
  }

  async loadHistoryDates() {
    this.state.historyDates = await getDatesWithData();
    if (!this.state.historyDates.length) {
      this.state.historyDates = [this.state.currentDate];
    }
  }

  async loadHistory(dateValue) {
    const date = dateValue || this.state.historyDate || this.state.currentDate;
    this.state.historyDate = date;
    this.elements.historyDate.value = date;

    const { tasks, record, details } = await this.loadDayDetails(date);
    this.renderHistory(sortTasksByPriority(tasks), record, details);
  }

  async loadDayDetails(date) {
    const tasks = await getTasksByDate(date);
    const record = await getDailyRecord(date);
    const details = await Promise.all(
      tasks.map(async (task) => ({
        task,
        notes: await getNotesByTask(task.id),
        messages: await getMessagesByTask(task.id),
        continuationEntry: await getContinuationByTask(task.id)
      }))
    );
    return { tasks, record, details };
  }

  async loadMonthView(monthKey = this.state.monthKey) {
    this.state.monthKey = monthKey;
    const dateKeys = [...new Set([this.state.currentDate, ...this.state.historyDates])]
      .filter((dateKey) => getMonthKey(dateKey) === monthKey);

    const taskPairs = await Promise.all(
      dateKeys.map(async (dateKey) => [dateKey, await getTasksByDate(dateKey)])
    );
    const taskMap = new Map(taskPairs);

    this.state.calendarCells = buildMonthDateCells(monthKey).map((cell) => {
      const tasks = (taskMap.get(cell.dateKey) || []).slice().sort(compareTasksForCalendarCell);
      return {
        ...cell,
        tasks,
        visibleTasks: tasks.slice(0, 2),
        hiddenTasks: tasks.slice(2),
        hiddenCount: Math.max(0, tasks.length - 2)
      };
    });

    if (!this.state.calendarPanel.date || getMonthKey(this.state.calendarPanel.date) !== monthKey) {
      this.state.calendarPanel = {
        date: "",
        record: null,
        tasks: [],
        details: []
      };
    }

    this.renderMonthView();
    this.renderMonthDayPanel();
  }

  async syncDailyRecord(date, taskIds) {
    const existing = await getDailyRecord(date);
    const stableIds = [...taskIds].sort();

    if (!existing) {
      const record = {
        date,
        taskIds: stableIds,
        summaryDraft: "",
        finalSummary: "",
        generatedAt: null
      };
      return putDailyRecord(record);
    }

    const currentIds = [...(existing.taskIds || [])].sort();
    if (JSON.stringify(currentIds) === JSON.stringify(stableIds)) {
      return existing;
    }

    const nextRecord = { ...existing, taskIds: stableIds };
    return putDailyRecord(nextRecord);
  }

  selectTodayQuote() {
    const storageKey = getQuoteStorageKey(this.state.currentDate);
    const cached = window.localStorage.getItem(storageKey);
    if (cached) {
      try {
        this.state.todayQuote = JSON.parse(cached);
        return;
      } catch {
        window.localStorage.removeItem(storageKey);
      }
    }

    const quoteType = this.state.tasks.some((task) => task.carriedFromTaskId || task.isArrangedTask)
      ? "push"
      : this.state.tasks.length === 0
        ? "start"
        : "random";

    const quote = pickQuoteByType(this.state.quotes, quoteType);
    this.state.todayQuote = quote;
    if (quote) {
      window.localStorage.setItem(storageKey, JSON.stringify(quote));
    }
  }

  async switchView(view) {
    await this.persistTitleDraft(true);
    this.state.view = view;
    this.updateViewLayoutMode();
    this.elements.todayView.classList.toggle("is-active", view === "today");
    this.elements.historyView.classList.toggle("is-active", view === "history");
    this.elements.monthView.classList.toggle("is-active", view === "month");
    this.elements.todayTab.classList.toggle("is-active", view === "today");
    this.elements.historyTab.classList.toggle("is-active", view === "history");
    this.elements.monthTab.classList.toggle("is-active", view === "month");

    if (view === "history") {
      await this.clearSelection();
      await this.loadHistory(this.state.historyDate);
      this.hideMonthOverflowTooltip();
    }

    if (view === "month") {
      await this.clearSelection();
      await this.loadMonthView(this.state.monthKey);
    }
  }

  updateViewLayoutMode() {
    this.elements.mainLayout.classList.toggle("is-month-mode", this.state.view === "month");
    this.elements.mainLayout.classList.toggle("is-today-mode", this.state.view === "today");
    this.elements.appShell.classList.toggle("is-month-mode", this.state.view === "month");
    this.elements.appShell.classList.toggle("is-today-mode", this.state.view === "today");
  }

  createEmptyTimeBlocks(date = this.state.currentDate) {
    return {
      date,
      morning: [],
      afternoon: [],
      evening: []
    };
  }

  normalizeTimeBlocks(entry, date = this.state.currentDate) {
    const source = entry || {};
    return {
      date: source.date || date,
      morning: Array.isArray(source.morning) ? [...source.morning] : [],
      afternoon: Array.isArray(source.afternoon) ? [...source.afternoon] : [],
      evening: Array.isArray(source.evening) ? [...source.evening] : []
    };
  }

  sanitizeTimeBlocksForTasks(entry, tasks = this.state.tasks) {
    const normalized = this.normalizeTimeBlocks(entry);
    const activeTaskIds = new Set(tasks.filter((task) => !task.archivedAt).map((task) => task.id));
    const sanitizeSlot = (items) => {
      const seen = new Set();
      return items.filter((taskId) => {
        if (!activeTaskIds.has(taskId) || seen.has(taskId)) {
          return false;
        }
        seen.add(taskId);
        return true;
      });
    };

    return {
      date: normalized.date,
      morning: sanitizeSlot(normalized.morning),
      afternoon: sanitizeSlot(normalized.afternoon),
      evening: sanitizeSlot(normalized.evening)
    };
  }

  async loadTodayTimeBlocks(tasks = this.state.tasks) {
    const fetched = await getTimeBlocksByDate(this.state.currentDate);
    const sanitized = this.sanitizeTimeBlocksForTasks(fetched || this.createEmptyTimeBlocks(), tasks);
    this.state.timeBlocks = sanitized;

    const fetchedNormalized = this.normalizeTimeBlocks(fetched || this.createEmptyTimeBlocks());
    if (JSON.stringify(fetchedNormalized) !== JSON.stringify(sanitized)) {
      await putTimeBlocksByDate(this.state.currentDate, sanitized);
    }
  }

  async saveTimeBlocks(entry) {
    const sanitized = this.sanitizeTimeBlocksForTasks(entry);
    this.state.timeBlocks = sanitized;
    await putTimeBlocksByDate(this.state.currentDate, sanitized);
    return sanitized;
  }

  getScheduledTimeBlockTaskIds() {
    return new Set(
      [...TIME_BLOCK_SLOTS].flatMap((slot) => this.state.timeBlocks?.[slot.value] || [])
    );
  }

  isTaskScheduledInTimeBlock(taskId) {
    return this.getScheduledTimeBlockTaskIds().has(taskId);
  }

  getTimeBlockSlotsForTask(taskId) {
    return TIME_BLOCK_SLOTS.filter((slot) => (this.state.timeBlocks?.[slot.value] || []).includes(taskId));
  }

  toggleTimeBlockPanel() {
    this.state.timeBlockExpanded = !this.state.timeBlockExpanded;
    this.renderTimeBlocks();
  }

  getTaskSources() {
    return [this.state.tasks, this.state.calendarPanel.tasks];
  }

  getTaskById(taskId) {
    if (!taskId) {
      return null;
    }

    for (const source of this.getTaskSources()) {
      const task = source.find((entry) => entry.id === taskId);
      if (task) {
        return task;
      }
    }

    return null;
  }

  getSelectedTask() {
    return this.getTaskById(this.state.selectedTaskId);
  }

  syncTaskIntoCalendarState(task) {
    const previousPanelTask = this.state.calendarPanel.tasks.find((entry) => entry.id === task.id);
    const touchedDates = new Set([task.date, previousPanelTask?.date, this.state.calendarPanel.date].filter(Boolean));

    this.state.calendarPanel.tasks = this.state.calendarPanel.tasks
      .map((entry) => (entry.id === task.id ? task : entry))
      .filter((entry) => entry.date === this.state.calendarPanel.date)
      .sort(compareTasksForCalendarCell);

    this.state.calendarCells = this.state.calendarCells.map((cell) => {
      if (!touchedDates.has(cell.dateKey)) {
        return cell;
      }

      const nextTasks = cell.tasks
        .map((entry) => (entry.id === task.id ? task : entry))
        .filter((entry) => entry.date === cell.dateKey)
        .sort(compareTasksForCalendarCell);

      return {
        ...cell,
        tasks: nextTasks,
        visibleTasks: nextTasks.slice(0, 2),
        hiddenTasks: nextTasks.slice(2),
        hiddenCount: Math.max(0, nextTasks.length - 2)
      };
    });
  }

  insertTaskIntoCalendarState(task) {
    this.state.calendarCells = this.state.calendarCells.map((cell) => {
      if (cell.dateKey !== task.date) {
        return cell;
      }

      const nextTasks = [...cell.tasks, task].sort(compareTasksForCalendarCell);
      return {
        ...cell,
        tasks: nextTasks,
        visibleTasks: nextTasks.slice(0, 2),
        hiddenTasks: nextTasks.slice(2),
        hiddenCount: Math.max(0, nextTasks.length - 2)
      };
    });

    if (this.state.calendarPanel.date === task.date) {
      this.state.calendarPanel.tasks = [...this.state.calendarPanel.tasks, task].sort(compareTasksForCalendarCell);
    }
  }

  syncSelectedTaskDetailsIntoCalendarPanel() {
    const task = this.getSelectedTask();
    if (!task || !this.state.calendarPanel.details.length) {
      return;
    }

    let changed = false;
    this.state.calendarPanel.details = this.state.calendarPanel.details.map((detail) => {
      if (detail.task.id !== task.id) {
        return detail;
      }

      changed = true;
      return {
        ...detail,
        task,
        notes: this.state.currentNotes,
        messages: this.state.currentMessages,
        continuationEntry: this.state.currentContinuationEntry
      };
    });

    if (changed && this.state.calendarPanel.date === task.date) {
      this.renderMonthDayPanel();
    }
  }

  getCarryoverQuoteText() {
    return pickQuoteByType(this.state.quotes, "random")?.text || this.carryoverQuoteFallback;
  }

  async createTask(date = this.state.currentDate) {
    const sameDayCount = (await getTasksByDate(date)).length;
    const task = defaultTask(date, sameDayCount);
    await putTask(task);
    await this.loadHistoryDates();

    if (date === this.state.currentDate) {
      await this.loadToday();
      await this.autoArrangeActiveTasks({ render: false });
      await this.loadToday();
      await this.selectTask(task.id, { focusTitle: true, selectTitle: true });
    } else {
      await this.loadHistory(this.state.historyDate);
      this.showToast("success", "已经为明天创建了一张新的任务卡片。");
    }
  }

  async selectTask(taskId, options = {}) {
    if (this.state.selectedTaskId && this.state.selectedTaskId !== taskId) {
      await this.persistTitleDraft(true);
    }
    this.state.selectedTaskId = taskId;
    await this.refreshSelectedTaskCollections();
    this.renderToday();
    this.renderDrawer();
    this.elements.drawerScroll.scrollTop = 0;
    if (options.focusTitle) {
      this.focusTitleInput(options.selectTitle);
    }
  }

  async clearSelection() {
    await this.persistTitleDraft(true);
    this.state.selectedTaskId = null;
    this.state.currentNotes = [];
    this.state.currentMessages = [];
    this.state.currentContinuationEntry = null;
    this.titleDraftTaskId = null;
    this.titleDraftValue = "";
    this.titleDirty = false;
    this.renderToday();
    this.renderDrawer();
  }

  async refreshSelectedTaskCollections() {
    const task = this.getSelectedTask();
    if (!task) {
      this.state.currentNotes = [];
      this.state.currentMessages = [];
      this.state.currentContinuationEntry = null;
      return;
    }

    this.state.currentNotes = await getNotesByTask(task.id);
    this.state.currentMessages = await getMessagesByTask(task.id);
    this.state.currentContinuationEntry = await getContinuationByTask(task.id);
  }

  buildNextTask(current, partial) {
    const timestamp = new Date().toISOString();
    const nextTask = {
      ...current,
      ...partial,
      updatedAt: timestamp
    };

    if ("importance" in partial || "urgency" in partial) {
      nextTask.autoPriorityScore = computeAutoPriorityScore(
        Number(nextTask.importance || DEFAULT_IMPORTANCE),
        Number(nextTask.urgency || DEFAULT_URGENCY)
      );
    }

    if ("orderingMode" in partial || "importance" in partial || "urgency" in partial) {
      nextTask.orderingUpdatedAt = partial.orderingUpdatedAt || timestamp;
      nextTask.autoPriorityScore = computeAutoPriorityScore(
        Number(nextTask.importance || DEFAULT_IMPORTANCE),
        Number(nextTask.urgency || DEFAULT_URGENCY)
      );
    }

    return nextTask;
  }

  async updateTask(taskId, partial, options = {}) {
    const current = this.getTaskById(taskId);
    if (!current) {
      return null;
    }

    const savedTask = await putTask(this.buildNextTask(current, partial));
    this.state.tasks = this.state.tasks.map((task) => (task.id === taskId ? savedTask : task));
    this.syncTaskIntoCalendarState(savedTask);
    if (options.render) {
      this.renderToday();
      this.renderMonthView();
      this.renderMonthDayPanel();
      this.renderDrawer();
    }
    return savedTask;
  }

  async updateSelectedTask(partial, options = {}) {
    const task = this.getSelectedTask();
    if (!task) {
      return null;
    }
    return this.updateTask(task.id, partial, options);
  }

  handleTitleInput(event) {
    const selectedTask = this.getSelectedTask();
    if (!selectedTask) {
      return;
    }

    this.titleDraftTaskId = selectedTask.id;
    this.titleDraftValue = event.target.value;
    this.titleDirty = true;
    if (!this.titleComposing) {
      this.scheduleTitleSave();
    }
  }

  scheduleTitleSave(delay = 450) {
    if (this.titleSaveTimer) {
      window.clearTimeout(this.titleSaveTimer);
    }
    this.titleSaveTimer = window.setTimeout(() => {
      this.persistTitleDraft(true);
      this.titleSaveTimer = null;
    }, delay);
  }

  async persistTitleDraft(force = false) {
    if (!this.titleDraftTaskId) {
      return;
    }
    if (!force && !this.titleDirty) {
      return;
    }

    const draftTask = this.state.tasks.find((task) => task.id === this.titleDraftTaskId);
    if (!draftTask) {
      return;
    }

    if (draftTask.title === this.titleDraftValue && !this.titleDirty) {
      return;
    }

    await this.updateTask(this.titleDraftTaskId, { title: this.titleDraftValue }, { render: false });
    this.titleDirty = false;
    this.renderToday();
    this.renderDrawer();
    await this.loadHistory(this.state.historyDate);
  }

  syncTitleInput(task) {
    if (this.titleDraftTaskId !== task.id) {
      this.titleDraftTaskId = task.id;
      this.titleDraftValue = task.title || "";
      this.titleDirty = false;
    }

    if (document.activeElement !== this.elements.taskTitleInput || !this.titleDirty) {
      this.elements.taskTitleInput.value = this.titleDraftValue;
    }
  }

  focusTitleInput(selectAll = false) {
    window.requestAnimationFrame(() => {
      this.elements.taskTitleInput.focus();
      if (selectAll) {
        this.elements.taskTitleInput.select();
      }
    });
  }

  async handlePrioritySliderClick(event) {
    const button = event.target.closest("[data-priority-level]");
    if (!button) {
      return;
    }

    const field = button.dataset.priorityField;
    const level = Number(button.dataset.priorityLevel);
    if (!["importance", "urgency"].includes(field) || !PRIORITY_LEVELS.includes(level)) {
      return;
    }

    await this.updateSelectedTask(
      {
        [field]: level,
        orderingMode: "auto"
      },
      { render: false }
    );
    await this.autoArrangeActiveTasks({ render: false });
    this.renderToday();
    this.renderDrawer();
    await this.loadHistory(this.state.historyDate);
  }

  async autoArrangeActiveTasks(options = {}) {
    const activeTasks = sortTasksByPriority(this.state.tasks.filter((task) => !task.archivedAt));
    const updates = [];

    activeTasks.forEach((task, index) => {
      const nextPosition = getGridPosition(index);
      const currentX = Number(task.position?.x || 0);
      const currentY = Number(task.position?.y || 0);
      if (currentX !== nextPosition.x || currentY !== nextPosition.y) {
        updates.push(
          this.buildNextTask(task, {
            position: nextPosition
          })
        );
      }
    });

    if (updates.length) {
      await putTasks(updates);
      this.state.tasks = await getTasksByDate(this.state.currentDate);
    }

    if (options.render !== false) {
      this.renderToday();
    }
  }

  async toggleArchiveSelectedTask() {
    const task = this.getSelectedTask();
    if (!task) {
      return;
    }
    const nextArchivedAt = task.archivedAt ? null : new Date().toISOString();
    await this.updateSelectedTask({ archivedAt: nextArchivedAt }, { render: false });
    await this.autoArrangeActiveTasks({ render: false });
    await this.loadToday();
    await this.loadHistory(this.state.historyDate);
    this.showToast("success", task.archivedAt ? "任务已移出归档。" : "任务已归档。");
  }

  async toggleTaskCollapsed(taskId) {
    const task = this.state.tasks.find((entry) => entry.id === taskId);
    if (!task) {
      return;
    }
    await this.updateTask(task.id, { collapsed: !task.collapsed });
    this.renderToday();
  }

  async deleteSelectedTask() {
    const task = this.getSelectedTask();
    if (!task) {
      return;
    }

    const confirmed = window.confirm(`确定要永久删除“${displayTaskTitle(task)}”吗？`);
    if (!confirmed) {
      return;
    }

    await deleteTaskCascade(task.id, task.date);
    this.showToast("success", "任务及其相关记录已删除。");
    await this.loadHistoryDates();
    await this.loadToday();
    await this.loadHistory(this.state.historyDate);
    await this.loadMonthView(this.state.monthKey);
  }

  async addNoteToSelectedTask() {
    const task = this.getSelectedTask();
    const content = this.elements.noteInput.value.trim();
    if (!task || !content) {
      return;
    }

    const note = await putNote({
      id: createId("note"),
      taskId: task.id,
      content,
      noteType: "plain",
      sourceTaskId: "",
      sourceNoteIds: [],
      createdAt: new Date().toISOString()
    });
    this.state.currentNotes = [note, ...this.state.currentNotes];
    this.state.noteCounts[task.id] = (this.state.noteCounts[task.id] || 0) + 1;
    this.elements.noteInput.value = "";
    this.syncSelectedTaskDetailsIntoCalendarPanel();
    this.renderToday();
    this.renderDrawer();
    await this.loadHistory(this.state.historyDate);
  }

  async removeNoteFromSelectedTask(noteId) {
    const task = this.getSelectedTask();
    if (!task) {
      return;
    }
    await deleteNote(noteId);
    this.state.currentNotes = this.state.currentNotes.filter((note) => note.id !== noteId);
    this.state.noteCounts[task.id] = Math.max(0, (this.state.noteCounts[task.id] || 1) - 1);
    this.syncSelectedTaskDetailsIntoCalendarPanel();
    this.renderToday();
    this.renderDrawer();
    await this.loadHistory(this.state.historyDate);
  }

  async sendChatMessage() {
    // LLM task chat is intentionally disabled in the current local-only workflow.
    return;
  }

  async saveContinuationEntry() {
    const task = this.getSelectedTask();
    if (!task) {
      return;
    }

    const now = new Date().toISOString();
    const nextEntry = {
      id: this.state.currentContinuationEntry?.id || createId("continuation"),
      taskId: task.id,
      date: task.date,
      taskTitle: displayTaskTitle(task),
      lastProgress: this.elements.continuationProgressInput.value.trim(),
      projectPath: this.elements.continuationProjectPathInput.value.trim(),
      fileList: normalizeLineList(this.elements.continuationFilesInput.value),
      deadline: this.elements.continuationDeadlineInput.value,
      createdAt: this.state.currentContinuationEntry?.createdAt || now,
      updatedAt: now
    };

    this.state.currentContinuationEntry = await putContinuationEntry(nextEntry);
    this.elements.continuationStatus.textContent = `任务延续区已保存：${formatDateTime(now)}`;
    this.syncSelectedTaskDetailsIntoCalendarPanel();
    await this.loadHistory(this.state.historyDate);
  }

  openSummaryModal() {
    this.summaryModalOpen = true;
    this.elements.summaryModal.classList.remove("hidden");
    this.elements.summaryModal.setAttribute("aria-hidden", "false");
    this.elements.summaryEditor.value = this.state.dailyRecord?.finalSummary || this.state.dailyRecord?.summaryDraft || "";
    this.elements.summaryStatus.textContent = this.state.dailyRecord?.generatedAt
      ? `最近生成于 ${formatDateTime(this.state.dailyRecord.generatedAt)}`
      : "还没有生成草稿";
  }

  closeSummaryModal() {
    this.summaryModalOpen = false;
    this.elements.summaryModal.classList.add("hidden");
    this.elements.summaryModal.setAttribute("aria-hidden", "true");
  }

  scheduleSummaryDraftSave(delay = 500) {
    if (this.summaryDraftSaveTimer) {
      window.clearTimeout(this.summaryDraftSaveTimer);
    }
    this.summaryDraftSaveTimer = window.setTimeout(() => {
      this.persistSummaryDraft();
      this.summaryDraftSaveTimer = null;
    }, delay);
  }

  async persistSummaryDraft() {
    const draft = this.elements.summaryEditor.value.trim();
    const record = await putDailyRecord({
      ...(this.state.dailyRecord || {
        date: this.state.currentDate,
        taskIds: this.state.tasks.map((task) => task.id)
      }),
      summaryDraft: draft,
      finalSummary: this.state.dailyRecord?.finalSummary || "",
      generatedAt: this.state.dailyRecord?.generatedAt || new Date().toISOString()
    });
    this.state.dailyRecord = record;
    this.renderToday();
  }

  async generateSummaryDraft() {
    // LLM auto-summary is intentionally disabled in the current local-only workflow.
    return;
    if (!this.state.appConfig.llmEnabled) {
      return;
    }
    if (this.summaryBusy) {
      return;
    }
    this.summaryBusy = true;
    this.elements.summaryStatus.textContent = "正在生成总结草稿……";

    try {
      const tasks = await Promise.all(
        this.state.tasks.map(async (task) => ({
          task,
          notes: await getNotesByTask(task.id),
          messages: await getMessagesByTask(task.id),
          continuationEntry: await getContinuationByTask(task.id)
        }))
      );

      const result = await summarizeDay({
        date: this.state.currentDate,
        tasks,
        existingDraft: this.elements.summaryEditor.value.trim()
      });
      this.elements.summaryEditor.value = result.draft;
      this.state.dailyRecord = await putDailyRecord({
        ...(this.state.dailyRecord || {
          date: this.state.currentDate,
          taskIds: this.state.tasks.map((task) => task.id)
        }),
        summaryDraft: result.draft,
        finalSummary: this.state.dailyRecord?.finalSummary || "",
        generatedAt: new Date().toISOString()
      });
      this.elements.summaryStatus.textContent = "草稿已生成并保存到本地。";
      this.renderToday();
      await this.loadHistory(this.state.historyDate);
    } catch (error) {
      this.elements.summaryStatus.textContent = error.message;
      this.showToast("error", error.message);
    } finally {
      this.summaryBusy = false;
    }
  }

  async saveFinalSummary() {
    const finalSummary = this.elements.summaryEditor.value.trim();
    this.state.dailyRecord = await putDailyRecord({
      ...(this.state.dailyRecord || {
        date: this.state.currentDate,
        taskIds: this.state.tasks.map((task) => task.id)
      }),
      summaryDraft: this.state.dailyRecord?.summaryDraft || finalSummary,
      finalSummary,
      generatedAt: this.state.dailyRecord?.generatedAt || new Date().toISOString()
    });
    this.elements.summaryStatus.textContent = "正式总结已保存。";
    this.renderToday();
    await this.loadHistory(this.state.historyDate);
  }

  openCopyModal() {
    const task = this.getSelectedTask();
    if (!task) {
      return;
    }

    const continuationEntry = this.state.currentContinuationEntry;
    const selectedContinuationFields = new Set(
      CONTINUATION_FIELD_OPTIONS.filter((option) => {
        if (!continuationEntry) {
          return false;
        }
        const value = continuationEntry[option.value];
        if (Array.isArray(value)) {
          return value.length > 0;
        }
        return Boolean(String(value || "").trim());
      }).map((option) => option.value)
    );

    this.state.copyModalState = {
      open: true,
      targetDate: nextDateKey(task.date || this.state.currentDate),
      selectedContinuationFields,
      includeChatSummary: false,
      selectedNoteIds: new Set(this.state.currentNotes.map((note) => note.id)),
      selectedModes: new Set(),
      quotePreviewText: this.getCarryoverQuoteText()
    };
    this.elements.copyModalTitle.textContent = `安排“${displayTaskTitle(task)}”到指定日期`;
    this.elements.copyModal.classList.remove("hidden");
    this.elements.copyModal.setAttribute("aria-hidden", "false");
    this.renderCopyModal();
  }

  closeCopyModal() {
    this.state.copyModalState = {
      open: false,
      targetDate: "",
      selectedContinuationFields: new Set(),
      includeChatSummary: false,
      selectedNoteIds: new Set(),
      selectedModes: new Set(),
      quotePreviewText: ""
    };
    this.elements.copyModal.classList.add("hidden");
    this.elements.copyModal.setAttribute("aria-hidden", "true");
  }

  toggleCopyNote(event) {
    const input = event.target.closest("[data-copy-note-id]");
    if (!input) {
      return;
    }
    const noteId = input.dataset.copyNoteId;
    if (input.checked) {
      this.state.copyModalState.selectedNoteIds.add(noteId);
    } else {
      this.state.copyModalState.selectedNoteIds.delete(noteId);
    }
    this.renderCopyPreview();
  }

  toggleCopyContinuationField(event) {
    const button = event.target.closest("[data-copy-continuation-field]");
    if (!button || button.hasAttribute("disabled")) {
      return;
    }
    const field = button.dataset.copyContinuationField;
    if (this.state.copyModalState.selectedContinuationFields.has(field)) {
      this.state.copyModalState.selectedContinuationFields.delete(field);
    } else {
      this.state.copyModalState.selectedContinuationFields.add(field);
    }
    this.renderCopyModal();
  }

  toggleCopyMode(event) {
    const button = event.target.closest("[data-copy-mode]");
    if (!button) {
      return;
    }
    const mode = button.dataset.copyMode;
    if (this.state.copyModalState.selectedModes.has(mode)) {
      this.state.copyModalState.selectedModes.delete(mode);
    } else {
      this.state.copyModalState.selectedModes.add(mode);
      if (mode === "quote" && !this.state.copyModalState.quotePreviewText) {
        this.state.copyModalState.quotePreviewText = this.getCarryoverQuoteText();
      }
    }
    this.renderCopyModal();
  }

  renderCopyModal() {
    if (!this.state.copyModalState.open) {
      return;
    }

    this.elements.copyTargetDate.value = this.state.copyModalState.targetDate;

    if (!this.state.currentNotes.length) {
      this.elements.copyNoteList.innerHTML = '<div class="stack-empty">这张卡片目前还没有 notes，可以直接安排标题和当前优先级。</div>';
    } else {
      this.elements.copyNoteList.innerHTML = this.state.currentNotes
        .map(
          (note) => `
            <label class="copy-note-item">
              <input type="checkbox" data-copy-note-id="${note.id}" ${
                this.state.copyModalState.selectedNoteIds.has(note.id) ? "checked" : ""
              } />
              <span>${escapeHtml(note.content)}</span>
            </label>
          `
        )
        .join("");
    }

    const continuationEntry = this.state.currentContinuationEntry;
    this.elements.copyContinuationFieldList.innerHTML = CONTINUATION_FIELD_OPTIONS.map((option) => {
      const rawValue = continuationEntry?.[option.value];
      const hasValue = Array.isArray(rawValue) ? rawValue.length > 0 : Boolean(String(rawValue || "").trim());
      const selected = this.state.copyModalState.selectedContinuationFields.has(option.value);
      return `<button class="toggle-chip ${selected ? "is-selected" : ""}" type="button" data-copy-continuation-field="${
        option.value
      }" ${hasValue ? "" : "disabled"}>${option.label}</button>`;
    }).join("");

    this.elements.copyChatSummaryCheckbox.checked = this.state.copyModalState.includeChatSummary;
    this.elements.copyChatSummaryCheckbox.disabled = !this.state.currentMessages.length;

    this.elements.copyModeList.querySelectorAll("[data-copy-mode]").forEach((button) => {
      button.classList.toggle("is-selected", this.state.copyModalState.selectedModes.has(button.dataset.copyMode));
    });

    this.renderCopyPreview();
  }

  renderCopyPreview() {
    this.state.copyModalState.includeChatSummary = false;
    this.state.copyModalState.selectedModes.delete("plan");

    const selectedNotes = this.state.currentNotes
      .filter((note) => this.state.copyModalState.selectedNoteIds.has(note.id))
      .map((note) => note.content);
    const bulletText = formatBulletNotes(selectedNotes);
    const modes = [...this.state.copyModalState.selectedModes];
    const helperBits = [];
    const targetDate = this.state.copyModalState.targetDate;
    const continuationEntry = this.state.currentContinuationEntry;

    if (targetDate) {
      helperBits.push(`目标日期：${targetDate}`);
    }

    const selectedContinuationBits = CONTINUATION_FIELD_OPTIONS.filter((option) =>
      this.state.copyModalState.selectedContinuationFields.has(option.value)
    )
      .map((option) => {
        const rawValue = continuationEntry?.[option.value];
        if (Array.isArray(rawValue)) {
          return rawValue.length ? `${option.label}：${rawValue.join("、")}` : "";
        }
        return String(rawValue || "").trim() ? `${option.label}：${rawValue}` : "";
      })
      .filter(Boolean);

    if (selectedContinuationBits.length) {
      helperBits.push(...selectedContinuationBits);
    }

    if (this.state.copyModalState.includeChatSummary) {
      helperBits.push("当前 LLM 对话摘要：确认安排时会自动生成简短摘要。");
    }
    if (modes.includes("plan")) {
      helperBits.push("将生成一小段“下一步计划”摘要。");
    }
    if (modes.includes("quote")) {
      helperBits.push(
        formatQuoteBlock(this.state.copyModalState.quotePreviewText || this.getCarryoverQuoteText())
      );
    }

    this.elements.copyPreview.textContent = [bulletText, helperBits.join("\n")].filter(Boolean).join("\n\n") || "还没有选择要带走的内容。";
    this.elements.copyStatus.textContent = this.copyBusy
      ? "正在为目标日期整理内容……"
      : "确认后会在目标日期创建一张新任务卡，并带上你勾选的内容。";
  }

  async confirmCopyToTomorrow() {
    const task = this.getSelectedTask();
    if (!task || this.copyBusy) {
      return;
    }

    this.state.copyModalState.includeChatSummary = false;
    this.state.copyModalState.selectedModes.delete("plan");

    this.copyBusy = true;
    this.renderCopyPreview();

    try {
      const targetDate = this.state.copyModalState.targetDate || nextDateKey(task.date || this.state.currentDate);
      const sameDayCount = (await getTasksByDate(targetDate)).length;
      const tomorrowTask = defaultTask(targetDate, sameDayCount);
      tomorrowTask.title = task.title;
      tomorrowTask.color = task.color;
      tomorrowTask.colorInk = task.colorInk;
      tomorrowTask.importance = task.importance;
      tomorrowTask.urgency = task.urgency;
      tomorrowTask.autoPriorityScore = computeAutoPriorityScore(task.importance, task.urgency);
      tomorrowTask.carriedFromTaskId = task.id;
      tomorrowTask.carriedAt = new Date().toISOString();
      tomorrowTask.scheduledDate = targetDate;
      tomorrowTask.arrangedFrom = task.date || this.state.currentDate;
      tomorrowTask.isArrangedTask = true;

      const savedTomorrowTask = await putTask(tomorrowTask);
      this.insertTaskIntoCalendarState(savedTomorrowTask);

      const selectedNotes = this.state.currentNotes.filter((note) =>
        this.state.copyModalState.selectedNoteIds.has(note.id)
      );
      const selectedModes = [...this.state.copyModalState.selectedModes];
      const bulletText = formatBulletNotes(selectedNotes.map((note) => note.content));
      const existingContinuation = this.state.currentContinuationEntry;
      let chatSummaryText = "";

      if (this.state.copyModalState.includeChatSummary) {
        const chatSummaryResult = await summarizeTaskChatForArrange({
          task,
          messages: this.state.currentMessages,
          continuationEntry: existingContinuation
        });
        chatSummaryText = chatSummaryResult.summary || SUMMARY_FAILURE_FALLBACK;
      }

      let summaryText = "";
      if (selectedModes.includes("plan")) {
        const summaryResult = await generateCarryoverSummary({
          task,
          selectedNotes: selectedNotes.map((note) => note.content),
          selectedModes,
          continuationEntry: existingContinuation,
          chatSummary: chatSummaryText
        });
        summaryText = summaryResult.summary || SUMMARY_FAILURE_FALLBACK;
      }

      let quoteText = "";
      if (selectedModes.includes("quote")) {
        quoteText = formatQuoteBlock(this.state.copyModalState.quotePreviewText || this.getCarryoverQuoteText());
      }

      const carryoverBlocks = [];
      if (bulletText) {
        carryoverBlocks.push(`延续 Notes：\n${bulletText}`);
      }
      if (chatSummaryText) {
        carryoverBlocks.push(`当前 LLM 对话摘要：\n${chatSummaryText}`);
      }
      if (summaryText) {
        carryoverBlocks.push(`下一步计划：\n${trimSummaryText(summaryText)}`);
      }
      if (quoteText) {
        carryoverBlocks.push(quoteText);
      }
      const carryoverContent = carryoverBlocks.filter(Boolean).join("\n\n");

      if (carryoverContent) {
        await putNote({
          id: createId("note"),
          taskId: savedTomorrowTask.id,
          content: carryoverContent,
          noteType: "carryover",
          sourceTaskId: task.id,
          sourceNoteIds: selectedNotes.map((note) => note.id),
          createdAt: new Date().toISOString()
        });
      }

      const generatedProgress = `${formatMonthDay(this.state.currentDate)}完成了“${displayTaskTitle(task)}”的阶段推进。${
        summaryText ? summaryText : ""
      }`.trim();
      const selectedContinuationFields = this.state.copyModalState.selectedContinuationFields;
      if (selectedContinuationFields.size) {
        await putContinuationEntry({
          id: createId("continuation"),
          taskId: savedTomorrowTask.id,
          date: targetDate,
          taskTitle: displayTaskTitle(savedTomorrowTask),
          lastProgress: selectedContinuationFields.has("lastProgress")
            ? existingContinuation?.lastProgress || generatedProgress
            : "",
          projectPath: selectedContinuationFields.has("projectPath") ? existingContinuation?.projectPath || "" : "",
          fileList: [],
          deadline: selectedContinuationFields.has("deadline") ? existingContinuation?.deadline || "" : "",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }

      this.closeCopyModal();
      await this.loadHistoryDates();
      await this.loadHistory(this.state.historyDate);
      await this.loadMonthView(this.state.monthKey);
      this.showToast("success", `已安排到 ${targetDate}，并附上当前选中的延续线索。`);
    } catch (error) {
      this.showToast("error", error.message);
    } finally {
      this.copyBusy = false;
      this.renderCopyPreview();
    }
  }

  async applyContextMenuAction(action) {
    const taskId = this.contextMenu.taskId;
    const task = this.state.tasks.find((entry) => entry.id === taskId);
    if (!task) {
      return;
    }
    if (action.startsWith("time-")) {
      const slot = action.replace("time-", "");
      await this.addTaskToTimeBlock(taskId, slot);
      this.hideContextMenu();
      return;
    }
    await this.updateTask(
      taskId,
      {
        orderingMode: action
      },
      { render: false }
    );
    this.hideContextMenu();
    await this.autoArrangeActiveTasks({ render: false });
    this.renderToday();
    this.renderDrawer();
    await this.loadHistory(this.state.historyDate);
  }

  showContextMenu(taskId, x, y) {
    this.contextMenu = { open: true, taskId, x, y };
    this.elements.taskContextMenu.style.left = `${x}px`;
    this.elements.taskContextMenu.style.top = `${y}px`;
    this.elements.taskContextMenu.classList.remove("hidden");
    this.elements.taskContextMenu.setAttribute("aria-hidden", "false");
  }

  hideContextMenu() {
    this.contextMenu = { open: false, taskId: null, x: 0, y: 0 };
    this.elements.taskContextMenu.classList.add("hidden");
    this.elements.taskContextMenu.setAttribute("aria-hidden", "true");
  }

  getTimeBlockTasks(slot) {
    const taskMap = new Map(this.state.tasks.map((task) => [task.id, task]));
    return (this.state.timeBlocks?.[slot] || []).map((taskId) => taskMap.get(taskId)).filter(Boolean);
  }

  getTimeBlockTaskMeta(task) {
    const markers = [];
    if (task.arrangedFrom || task.isArrangedTask) {
      markers.push(task.arrangedFrom ? formatArrangedFromLabel(task.arrangedFrom) : "↪");
    }
    if (task.importance >= 75 && task.urgency >= 75) {
      markers.push("★");
    }
    if (task.status === "done") {
      markers.push("✓");
    }
    markers.push(TASK_STATUS_LABELS[task.status]);
    return markers.join(" · ");
  }

  async addTaskToTimeBlock(taskId, slot) {
    if (!TIME_BLOCK_SLOTS.some((item) => item.value === slot)) {
      return;
    }

    const nextEntry = this.normalizeTimeBlocks(this.state.timeBlocks);
    if (nextEntry[slot].includes(taskId)) {
      this.showToast("warning", "该任务已经在这个时间片里。");
      return;
    }

    nextEntry[slot] = [...nextEntry[slot], taskId];
    await this.saveTimeBlocks(nextEntry);
    this.renderToday();
  }

  async removeTaskFromTimeBlock(taskId, slot) {
    const nextEntry = this.normalizeTimeBlocks(this.state.timeBlocks);
    nextEntry[slot] = nextEntry[slot].filter((item) => item !== taskId);
    await this.saveTimeBlocks(nextEntry);
    this.renderToday();
  }

  async moveTimeBlockTask(taskId, slot, direction) {
    const nextEntry = this.normalizeTimeBlocks(this.state.timeBlocks);
    const index = nextEntry[slot].indexOf(taskId);
    if (index < 0) {
      return;
    }

    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= nextEntry[slot].length) {
      return;
    }

    const [item] = nextEntry[slot].splice(index, 1);
    nextEntry[slot].splice(targetIndex, 0, item);
    await this.saveTimeBlocks(nextEntry);
    this.renderToday();
  }

  async handleTimeBlockClick(event) {
    const openButton = event.target.closest("[data-time-block-task-id]");
    if (openButton) {
      await this.selectTask(openButton.dataset.timeBlockTaskId);
      return;
    }

    const removeButton = event.target.closest("[data-time-remove-id]");
    if (removeButton) {
      await this.removeTaskFromTimeBlock(removeButton.dataset.timeRemoveId, removeButton.dataset.timeSlot);
      return;
    }

    const moveButton = event.target.closest("[data-time-move-id]");
    if (moveButton) {
      await this.moveTimeBlockTask(
        moveButton.dataset.timeMoveId,
        moveButton.dataset.timeSlot,
        moveButton.dataset.timeMoveDirection
      );
    }
  }

  renderTimeBlocks() {
    const activeTasks = this.state.tasks.filter((task) => !task.archivedAt);
    const scheduledTaskIds = this.getScheduledTimeBlockTaskIds();
    const unassignedCount = activeTasks.filter((task) => !scheduledTaskIds.has(task.id)).length;

    this.elements.todayLayout?.classList.toggle("is-time-panel-collapsed", !this.state.timeBlockExpanded);
    this.elements.timeBlockPanel.classList.toggle("is-collapsed", !this.state.timeBlockExpanded);
    this.elements.timeBlockToggle.textContent = this.state.timeBlockExpanded ? "收起" : "展开";
    this.elements.timeBlockToggle.setAttribute("aria-expanded", String(this.state.timeBlockExpanded));
    this.elements.timeBlockSlots.innerHTML = TIME_BLOCK_SLOTS.map((slot) => {
      const tasks = this.getTimeBlockTasks(slot.value);
      const listMarkup = tasks.length
        ? tasks
            .map((task, index) => {
              const isDone = task.status === "done";
              return `
                <article class="time-block-item ${isDone ? "is-done" : ""}">
                  <div class="time-block-item__row">
                    <div class="time-block-item__main">
                      <button type="button" class="time-block-item__title" data-time-block-task-id="${task.id}">
                        <span class="time-block-item__title-text">${escapeHtml(displayTaskTitle(task))}</span>
                      </button>
                      <div class="time-block-item__meta">${escapeHtml(this.getTimeBlockTaskMeta(task))}</div>
                    </div>
                    <div class="time-block-item__controls">
                      <button
                        type="button"
                        class="time-block-item__ctrl"
                        data-time-move-id="${task.id}"
                        data-time-slot="${slot.value}"
                        data-time-move-direction="up"
                        ${index === 0 ? "disabled" : ""}
                      >↑</button>
                      <button
                        type="button"
                        class="time-block-item__ctrl"
                        data-time-move-id="${task.id}"
                        data-time-slot="${slot.value}"
                        data-time-move-direction="down"
                        ${index === tasks.length - 1 ? "disabled" : ""}
                      >↓</button>
                      <button
                        type="button"
                        class="time-block-item__ctrl time-block-item__ctrl--danger"
                        data-time-remove-id="${task.id}"
                        data-time-slot="${slot.value}"
                      >×</button>
                    </div>
                  </div>
                </article>
              `;
            })
            .join("")
        : '<div class="time-block-empty">拖入任务到这里</div>';

      return `
        <section class="time-block-slot ${this.dragState?.dropSlot === slot.value ? "is-drag-target" : ""}" data-time-slot="${slot.value}">
          <div class="time-block-slot__top">
            <span class="time-block-slot__label">${slot.label}</span>
            <span class="helper-copy">${tasks.length} 项</span>
          </div>
          <div class="time-block-slot__list">${listMarkup}</div>
        </section>
      `;
    }).join("");

    this.elements.timeBlockUnassigned.textContent =
      unassignedCount > 0 ? `还有 ${unassignedCount} 个任务未安排时间片` : "今天的活跃任务都已安排到时间片。";
  }

  renderToday() {
    const activeTasks = sortTasksByPriority(this.state.tasks.filter((task) => !task.archivedAt));
    const archivedTasks = [...this.state.tasks.filter((task) => Boolean(task.archivedAt))].sort(
      (left, right) => new Date(right.archivedAt || 0) - new Date(left.archivedAt || 0)
    );
    const doneCount = this.state.tasks.filter((task) => task.status === "done").length;

    this.elements.todayLabel.textContent = formatDateLabel(this.state.currentDate);
    this.elements.heroDate.textContent = formatDateLabel(this.state.currentDate);
    this.elements.todayQuote.textContent = this.state.todayQuote?.text || "";
    this.elements.todayQuote.classList.toggle("hidden", !this.state.todayQuote);
    this.elements.activeCount.textContent = String(activeTasks.length);
    this.elements.doneCount.textContent = String(doneCount);
    this.elements.summaryPreview.textContent = this.state.dailyRecord?.finalSummary
      ? truncate(this.state.dailyRecord.finalSummary, 110)
      : "还没有保存今日总结，先把卡片铺起来吧。";
    this.elements.canvasEmpty.classList.toggle("hidden", activeTasks.length > 0);
    this.renderTimeBlocks();
    this.renderCanvas(activeTasks);
    this.renderArchive(archivedTasks);
  }

  renderCanvas(activeTasks) {
    if (!activeTasks.length) {
      this.elements.canvas.innerHTML = "";
      this.elements.canvas.style.minHeight = "32rem";
      return;
    }

    const maxBottom = activeTasks.reduce((largest, task) => {
      const bottom = (task.position?.y || 0) + (task.size?.height || 200) + 32;
      return Math.max(largest, bottom);
    }, 520);
    this.state.canvasHeight = Math.max(520, maxBottom);
    this.elements.canvas.style.minHeight = `${this.state.canvasHeight}px`;
    this.elements.canvas.innerHTML = activeTasks.map((task) => this.getTaskCardMarkup(task)).join("");
    this.bindTaskCardInteractions();
  }

  renderArchive(archivedTasks = this.state.tasks.filter((task) => Boolean(task.archivedAt))) {
    this.elements.archiveCount.textContent = String(archivedTasks.length);
    this.elements.archiveToggle.setAttribute("aria-expanded", String(this.state.archiveExpanded));
    this.elements.archiveContent.classList.toggle("hidden", !this.state.archiveExpanded);

    if (!archivedTasks.length) {
      this.elements.archiveContent.innerHTML = '<div class="stack-empty">今天还没有归档任务。</div>';
      return;
    }

    this.elements.archiveContent.innerHTML = archivedTasks
      .map((task) => this.getTaskCardMarkup(task, true))
      .join("");
    this.bindTaskCardInteractions(true);
  }

  bindTaskCardInteractions(isArchive = false) {
    const scope = isArchive ? this.elements.archiveContent : this.elements.canvas;
    scope.querySelectorAll("[data-open-task-id]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        this.selectTask(button.dataset.openTaskId);
      });
    });

    scope.querySelectorAll(".task-card").forEach((card) => {
      card.addEventListener("click", () => this.selectTask(card.dataset.taskId));
      if (!isArchive) {
        card.addEventListener("contextmenu", (event) => {
          event.preventDefault();
          this.selectTask(card.dataset.taskId);
          this.showContextMenu(card.dataset.taskId, event.clientX, event.clientY);
        });
      }
    });

    scope.querySelectorAll("[data-toggle-collapse-id]").forEach((button) => {
      button.addEventListener("click", async (event) => {
        event.stopPropagation();
        await this.toggleTaskCollapsed(button.dataset.toggleCollapseId);
      });
    });

    if (!isArchive) {
      scope.querySelectorAll("[data-drag-handle-id]").forEach((handle) => {
        handle.addEventListener("pointerdown", (event) => this.startDrag(event, handle.dataset.dragHandleId));
      });
      scope.querySelectorAll("[data-resize-handle-id]").forEach((handle) => {
        handle.addEventListener("pointerdown", (event) => this.startResize(event, handle.dataset.resizeHandleId));
      });
    }
  }

  renderDrawer() {
    const task = this.getSelectedTask();
    const isOpen = Boolean(task);
    this.elements.drawer.classList.toggle("is-open", isOpen);
    this.elements.drawer.setAttribute("aria-hidden", String(!isOpen));
    this.elements.drawerEmpty.classList.toggle("hidden", isOpen);
    this.elements.drawerContent.classList.toggle("hidden", !isOpen);

    if (!task) {
      return;
    }

    this.elements.drawerHeading.textContent = displayTaskTitle(task);
    this.syncTitleInput(task);
    this.elements.taskStatusSelect.value = task.status;
    this.elements.archiveTaskBtn.textContent = task.archivedAt ? "移出归档" : "归档";
    this.elements.orderingModeLabel.textContent = `当前排序：${ORDERING_MODE_LABELS[task.orderingMode] || "默认排序"}`;

    this.elements.importanceSlider.innerHTML = this.getSliderMarkup("importance", "重要", task.importance);
    this.elements.urgencySlider.innerHTML = this.getSliderMarkup("urgency", "紧急", task.urgency);

    this.elements.colorPicker.querySelectorAll("[data-color-value]").forEach((button) => {
      button.classList.toggle("is-selected", button.dataset.colorValue === task.color);
    });

    this.renderNotes();
    this.elements.chatStatus.textContent = "";
    this.renderChat();
    if (false && this.state.appConfig.llmEnabled) {
      this.elements.chatStatus.textContent = this.chatBusy ? "LLM 正在思考……" : getLLMStatusLabel();
      this.renderChat();
    }
    this.renderContinuationPanel(task);
  }

  renderNotes() {
    this.elements.noteList.innerHTML = this.state.currentNotes.length
      ? this.state.currentNotes
          .map(
            (note) => `
              <article class="stack-item">
                <div class="stack-item__top">
                  <time>${formatDateTime(note.createdAt)}</time>
                  <button class="stack-item__delete" type="button" data-delete-note-id="${note.id}">删除</button>
                </div>
                <p class="stack-item__content">${escapeHtml(note.content)}</p>
              </article>
            `
          )
          .join("")
      : '<div class="stack-empty">还没有灵感记录，边做边把想法写下来吧。</div>';
  }

  renderChat() {
    // LLM task chat is intentionally hidden in the current local-only workflow.
    this.elements.chatList.innerHTML = "";
    return;
    if (!this.state.appConfig.llmEnabled) {
      this.elements.chatList.innerHTML = "";
      return;
    }
    this.elements.chatList.innerHTML = this.state.currentMessages.length
      ? this.state.currentMessages
          .map(
            (message) => `
              <article class="chat-bubble ${message.role} ${message.errorState ? "error" : ""}">
                <div class="chat-bubble__top">
                  <span class="chat-bubble__role">${
                    message.role === "user" ? "你" : message.errorState ? "LLM 错误" : "LLM"
                  }</span>
                  <time>${formatDateTime(message.createdAt)}</time>
                </div>
                <p class="chat-bubble__content">${escapeHtml(message.content)}</p>
              </article>
            `
          )
          .join("")
      : '<div class="stack-empty">这张卡还没有对话记录。</div>';
  }

  renderContinuationPanel(task) {
    const entry = this.state.currentContinuationEntry;
    this.elements.continuationProgressInput.value = entry?.lastProgress || "";
    this.elements.continuationProjectPathInput.value = entry?.projectPath || "";
    this.elements.continuationFilesInput.value = (entry?.fileList || []).join("\n");
    this.elements.continuationDeadlineInput.value = entry?.deadline || "";
    this.elements.continuationHint.textContent =
      task.arrangedFrom || task.isArrangedTask
        ? `${formatArrangedFromLabel(task.arrangedFrom)}。这张卡是安排过来的任务，建议把今天新增的推进继续写回这里。`
        : "这里记录这张任务卡的上次进度、相关路径、相关文件与 DDL，方便之后无缝接上。";
    this.elements.continuationStatus.textContent = entry?.updatedAt
      ? `最近保存于 ${formatDateTime(entry.updatedAt)}`
      : "还没有保存任务延续区。";
  }

  renderHistory(tasks, record, details) {
    const hasContent = tasks.length > 0 || Boolean(record?.finalSummary);
    this.elements.historyEmpty.classList.toggle("hidden", hasContent);
    this.elements.historySummaryText.textContent = record?.finalSummary || "这一天还没有保存总结。";

    if (!tasks.length) {
      this.elements.historyTaskList.innerHTML = "";
      return;
    }

    const detailMap = new Map(details.map((detail) => [detail.task.id, detail]));

    this.elements.historyTaskList.innerHTML = tasks
      .map((task) => {
        const detail = detailMap.get(task.id) || {
          notes: [],
          messages: [],
          continuationEntry: null
        };
        return `
          <article class="history-task-card">
            <div class="history-task-card__top">
              <div>
                ${task.arrangedFrom ? `<p class="task-card__origin">${escapeHtml(formatArrangedFromLabel(task.arrangedFrom))}</p>` : ""}
                <h4>${escapeHtml(displayTaskTitle(task))}</h4>
                <div class="history-task-card__meta">
                  <span class="history-chip">${TASK_STATUS_LABELS[task.status]}</span>
                  <span class="history-chip">重要 ${task.importance}%</span>
                  <span class="history-chip">紧急 ${task.urgency}%</span>
                  <span class="history-chip">${ORDERING_MODE_LABELS[task.orderingMode] || "默认排序"}</span>
                  <span class="history-chip">${task.archivedAt ? "已归档" : "活跃过"}</span>
                </div>
              </div>
              <time>${formatDateTime(task.updatedAt || task.createdAt)}</time>
            </div>
            <section class="history-task-card__section">
              <h5>灵感记录</h5>
              ${
                detail.notes.length
                  ? `<ul>${detail.notes.map((note) => `<li>${escapeHtml(note.content)}</li>`).join("")}</ul>`
                  : "<p>没有记录灵感。</p>"
              }
            </section>
            ${
              false && this.state.appConfig.llmEnabled
                ? `
            <section class="history-task-card__section">
              <h5>任务内对话</h5>
              ${
                detail.messages.length
                  ? `<ul>${detail.messages
                      .map((message) => `<li>${message.role === "user" ? "你" : "LLM"}：${escapeHtml(message.content)}</li>`)
                      .join("")}</ul>`
                  : "<p>没有对话记录。</p>"
              }
            </section>
            `
                : ""
            }
            <section class="history-task-card__section">
              <h5>任务延续区</h5>
              ${
                detail.continuationEntry
                  ? this.getHistoryContinuationMarkup(detail.continuationEntry)
                  : "<p>还没有留下任务延续区内容。</p>"
              }
            </section>
          </article>
        `;
      })
      .join("");
  }

  renderMonthView() {
    const [year, month] = this.state.monthKey.split("-");
    this.elements.monthLabel.textContent = `${year}年${Number(month)}月`;

    const weekLabels = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]
      .map((label) => `<div class="month-grid__weekday">${label}</div>`)
      .join("");

    const cellMarkup = this.state.calendarCells
      .map((cell) => {
        const taskMarkup = cell.visibleTasks
          .map((task) => {
            const markers = [
              task.arrangedFrom || task.isArrangedTask ? "↪" : "",
              task.importance >= 75 && task.urgency >= 75 ? "★" : "",
              task.status === "done" ? "✓" : ""
            ]
              .filter(Boolean)
              .join(" ");
            return `
              <button
                type="button"
                class="month-task-chip ${task.status === "done" ? "is-done" : ""} ${(task.arrangedFrom || task.isArrangedTask) ? "is-arranged" : ""}"
                data-month-task-id="${task.id}"
                data-month-task-date="${cell.dateKey}"
              >
                ${markers ? `<span class="month-task-chip__markers">${markers}</span>` : ""}
                <span class="month-task-chip__title">${escapeHtml(truncate(displayTaskTitle(task), 20))}</span>
              </button>
            `;
          })
          .join("");

        return `
          <article
            class="month-cell ${cell.inMonth ? "is-current-month" : "is-outside-month"} ${cell.dateKey === this.state.calendarPanel.date ? "is-selected" : ""}"
            data-month-date="${cell.dateKey}"
          >
            <div class="month-cell__day">${cell.dayNumber}</div>
            <div class="month-cell__tasks">
              ${taskMarkup}
              ${
                cell.hiddenCount
                  ? `<button type="button" class="month-cell__more" data-month-more-date="${cell.dateKey}">+${cell.hiddenCount}</button>`
                  : ""
              }
            </div>
          </article>
        `;
      })
      .join("");

    this.elements.monthGrid.innerHTML = `${weekLabels}${cellMarkup}`;
  }

  renderMonthDayPanel() {
    const panel = this.state.calendarPanel;
    if (!panel.date) {
      this.elements.monthDayTitle.textContent = "选择一个日期";
      this.elements.monthDaySummary.textContent = "点击月历中的某一天，查看该天的历史记录概览。";
      this.elements.monthDayEmpty.classList.remove("hidden");
      this.elements.monthDayTaskList.innerHTML = "";
      return;
    }

    this.elements.monthDayTitle.textContent = formatDateLabel(panel.date);
    this.elements.monthDaySummary.textContent = panel.record?.finalSummary || "这一天还没有保存总结。";
    this.elements.monthDayEmpty.classList.toggle("hidden", panel.tasks.length > 0);

    if (!panel.tasks.length) {
      this.elements.monthDayTaskList.innerHTML = "";
      return;
    }

    const detailMap = new Map(panel.details.map((detail) => [detail.task.id, detail]));
    this.elements.monthDayTaskList.innerHTML = panel.tasks
      .map((task) => {
        const detail = detailMap.get(task.id) || { notes: [], messages: [], continuationEntry: null };
        return `
          <article class="month-day-task">
            <button type="button" class="month-day-task__title" data-month-task-id="${task.id}" data-month-task-date="${panel.date}">
              ${task.arrangedFrom ? `<span class="task-card__origin">${escapeHtml(formatArrangedFromLabel(task.arrangedFrom))}</span>` : ""}
              <strong>${escapeHtml(displayTaskTitle(task))}</strong>
            </button>
            <div class="inline-meta">
              <span class="history-chip">${TASK_STATUS_LABELS[task.status]}</span>
              <span class="history-chip">重要 ${task.importance}%</span>
              <span class="history-chip">紧急 ${task.urgency}%</span>
            </div>
            ${
              detail.notes.length
                ? `<p>${escapeHtml(truncate(detail.notes.map((note) => note.content).join("；"), 90))}</p>`
                : "<p>没有记录灵感。</p>"
            }
          </article>
        `;
      })
      .join("");
  }

  async handleMonthGridClick(event) {
    const taskButton = event.target.closest("[data-month-task-id]");
    if (taskButton) {
      const date = taskButton.dataset.monthTaskDate;
      const taskId = taskButton.dataset.monthTaskId;
      const cell = this.state.calendarCells.find((entry) => entry.dateKey === date);
      const task = cell?.tasks.find((entry) => entry.id === taskId);
      if (task) {
        await this.openCalendarTask(task, date);
      }
      return;
    }

    const moreButton = event.target.closest("[data-month-more-date]");
    if (moreButton) {
      return;
    }

    const cellElement = event.target.closest("[data-month-date]");
    if (!cellElement) {
      return;
    }
    await this.openCalendarDayPanel(cellElement.dataset.monthDate);
  }

  async handleMonthDayTaskClick(event) {
    const taskButton = event.target.closest("[data-month-task-id]");
    if (!taskButton) {
      return;
    }

    const date = taskButton.dataset.monthTaskDate;
    const taskId = taskButton.dataset.monthTaskId;
    const task = this.state.calendarPanel.tasks.find((entry) => entry.id === taskId);
    if (!task || !date) {
      return;
    }

    await this.openCalendarTask(task, date);
  }

  handleMonthGridHover(event) {
    const moreButton = event.target.closest("[data-month-more-date]");
    if (!moreButton) {
      return;
    }
    const cell = this.state.calendarCells.find((entry) => entry.dateKey === moreButton.dataset.monthMoreDate);
    if (!cell?.hiddenTasks?.length) {
      return;
    }
    this.showMonthOverflowTooltip(
      cell.hiddenTasks.map((task) => `${task.arrangedFrom || task.isArrangedTask ? "↪ " : ""}${task.status === "done" ? "✓ " : ""}${displayTaskTitle(task)}`),
      moreButton
    );
  }

  handleMonthGridHoverOut(event) {
    const relatedTarget = event.relatedTarget;
    if (relatedTarget instanceof HTMLElement && relatedTarget.closest("#month-overflow-tooltip")) {
      return;
    }
    if (event.target.closest("[data-month-more-date]")) {
      this.hideMonthOverflowTooltip();
    }
  }

  showMonthOverflowTooltip(items, anchorElement) {
    const rect = anchorElement.getBoundingClientRect();
    this.monthTooltip = {
      open: true,
      x: rect.left + window.scrollX,
      y: rect.bottom + window.scrollY + 8,
      items
    };
    this.elements.monthOverflowTooltip.innerHTML = items.map((item) => `<div>${escapeHtml(item)}</div>`).join("");
    this.elements.monthOverflowTooltip.style.left = `${this.monthTooltip.x}px`;
    this.elements.monthOverflowTooltip.style.top = `${this.monthTooltip.y}px`;
    this.elements.monthOverflowTooltip.classList.remove("hidden");
    this.elements.monthOverflowTooltip.setAttribute("aria-hidden", "false");
  }

  hideMonthOverflowTooltip() {
    this.monthTooltip = { open: false, x: 0, y: 0, items: [] };
    this.elements.monthOverflowTooltip.classList.add("hidden");
    this.elements.monthOverflowTooltip.setAttribute("aria-hidden", "true");
  }

  async openCalendarDayPanel(date) {
    const { tasks, record, details } = await this.loadDayDetails(date);
    this.state.calendarPanel = {
      date,
      record,
      tasks: tasks.slice().sort(compareTasksForCalendarCell),
      details
    };
    this.renderMonthView();
    this.renderMonthDayPanel();
  }

  async openCalendarTask(task, date) {
    await this.openCalendarDayPanel(date);
    await this.clearSelection();
    this.state.selectedTaskId = task.id;
    this.state.currentNotes = await getNotesByTask(task.id);
    this.state.currentMessages = await getMessagesByTask(task.id);
    this.state.currentContinuationEntry = await getContinuationByTask(task.id);
    this.renderDrawer();
    this.elements.drawerScroll.scrollTop = 0;
  }

  getHistoryContinuationMarkup(entry) {
    const fileList = Array.isArray(entry.fileList) ? entry.fileList : [];
    return `
      <div class="memory-card">
        ${entry.lastProgress ? `<p><strong>上次进度：</strong>${escapeHtml(entry.lastProgress)}</p>` : ""}
        ${entry.projectPath ? `<p><strong>相关路径：</strong>${escapeHtml(entry.projectPath)}</p>` : ""}
        ${fileList.length ? `<p><strong>相关文件：</strong>${fileList.map((item) => escapeHtml(item)).join("、")}</p>` : ""}
        ${entry.deadline ? `<p><strong>DDL：</strong>${escapeHtml(entry.deadline)}</p>` : ""}
      </div>
    `;
  }

  getSliderMarkup(field, label, value) {
    const items = PRIORITY_LEVELS.map(
      (level, index) => `
        <button
          class="priority-dot ${value === level ? "is-active" : ""}"
          type="button"
          data-priority-field="${field}"
          data-priority-level="${level}"
          aria-label="${label} ${level}%"
        >${value === level ? "●" : "○"}</button>
        ${index < PRIORITY_LEVELS.length - 1 ? '<span class="priority-line"></span>' : ""}
      `
    ).join("");

    return `
      <div class="priority-row">
        <span class="priority-row__label">${label}</span>
        <div class="priority-row__track">${items}</div>
        <strong class="priority-row__value">${value}%</strong>
      </div>
    `;
  }

  getTaskCardHint(task) {
    if (task.arrangedFrom || task.isArrangedTask) {
      return `这张任务是从 ${task.arrangedFrom || "之前的日期"} 安排过来的，先接上之前留下的上下文。`;
    }
    if (task.status === "done") {
      return "已经完成的任务，可以在右侧整理今天的延续线索。";
    }
    if (task.status === "in-progress") {
      return "继续推进当前任务，并把关键 note 或问题留在抽屉里。";
    }
    return "先把这张卡点开，明确今天的第一步。";
  }

  getTaskCardMarkup(task, archived = false) {
    const scheduledSlots = !archived ? this.getTimeBlockSlotsForTask(task.id) : [];
    const isCollapsed = !archived && Boolean(task.collapsed);
    const cardStyle = archived
      ? `--card-color:${task.color};--card-ink:${task.colorInk};`
      : `left:${task.position?.x || 24}px;top:${task.position?.y || 24}px;width:${task.size?.width || 280}px;height:${task.size?.height || 220}px;--card-color:${task.color};--card-ink:${task.colorInk};`;
    const arrangedLabel = task.arrangedFrom ? formatArrangedFromLabel(task.arrangedFrom) : "";
    const scheduledLabel = scheduledSlots.length
      ? `已安排：${scheduledSlots.map((slot) => slot.label).join(" / ")}`
      : "";

    return `
      <article
        class="task-card ${task.id === this.state.selectedTaskId ? "is-selected" : ""} ${archived ? "archived-card" : ""} ${isCollapsed ? "is-collapsed" : ""}"
        data-task-id="${task.id}"
        style="${cardStyle}"
      >
        <div class="task-card__header">
          ${
            archived
              ? '<span class="task-card__drag">归档</span>'
              : `<span class="task-card__drag" data-drag-handle-id="${task.id}">拖动</span>`
          }
          <div class="task-card__header-actions">
            ${
              archived
                ? ""
                : `<button class="task-card__collapse" type="button" data-toggle-collapse-id="${task.id}">${isCollapsed ? "展开" : "收起"}</button>`
            }
            <span class="task-card__status">${TASK_STATUS_LABELS[task.status]}</span>
          </div>
        </div>
        <div class="task-card__body">
          ${arrangedLabel ? `<p class="task-card__origin">${escapeHtml(arrangedLabel)}</p>` : ""}
          ${scheduledLabel ? `<p class="task-card__scheduled">${escapeHtml(scheduledLabel)}</p>` : ""}
          <h4>${escapeHtml(displayTaskTitle(task))}</h4>
          <p class="task-card__excerpt">${escapeHtml(this.getTaskCardHint(task))}</p>
          <div class="task-card__counts">
            <span>${this.state.noteCounts[task.id] || 0} 条灵感</span>
            <span>${this.state.messageCounts[task.id] || 0} 条对话</span>
          </div>
          <button class="card-open-btn" type="button" data-open-task-id="${task.id}">打开详情</button>
        </div>
        ${archived || isCollapsed ? "" : `<span class="resize-handle" data-resize-handle-id="${task.id}" aria-hidden="true"></span>`}
      </article>
    `;
  }

  startDrag(event, taskId) {
    event.preventDefault();
    const task = this.state.tasks.find((entry) => entry.id === taskId);
    if (!task) {
      return;
    }

    this.dragState = {
      mode: "move",
      taskId,
      startX: event.clientX,
      startY: event.clientY,
      originX: task.position?.x || 0,
      originY: task.position?.y || 0,
      dropSlot: null
    };
    document.body.classList.add("dragging");
  }

  startResize(event, taskId) {
    event.preventDefault();
    event.stopPropagation();
    const task = this.state.tasks.find((entry) => entry.id === taskId);
    if (!task) {
      return;
    }

    this.dragState = {
      mode: "resize",
      taskId,
      startX: event.clientX,
      startY: event.clientY,
      width: task.size?.width || 280,
      height: task.size?.height || 220
    };
    document.body.classList.add("dragging");
  }

  handlePointerMove(event) {
    if (!this.dragState) {
      return;
    }

    const task = this.state.tasks.find((entry) => entry.id === this.dragState.taskId);
    const card = document.querySelector(`.task-card[data-task-id="${this.dragState.taskId}"]`);
    if (!task || !card) {
      return;
    }

    const canvasRect = this.elements.canvas.getBoundingClientRect();
    const deltaX = event.clientX - this.dragState.startX;
    const deltaY = event.clientY - this.dragState.startY;

    if (this.dragState.mode === "move") {
      const nextX = clamp(
        this.dragState.originX + deltaX,
        0,
        Math.max(0, canvasRect.width - (task.size?.width || 280) - 8)
      );
      const nextY = clamp(
        this.dragState.originY + deltaY,
        0,
        Math.max(0, this.state.canvasHeight - (task.size?.height || 220) - 8)
      );
      card.style.left = `${nextX}px`;
      card.style.top = `${nextY}px`;
      const slotElement =
        this.state.view === "today"
          ? event.target instanceof HTMLElement
            ? event.target.closest("[data-time-slot]")
            : document.elementFromPoint(event.clientX, event.clientY)?.closest?.("[data-time-slot]") || null
          : null;
      const nextDropSlot = slotElement?.dataset?.timeSlot || null;
      if (this.dragState.dropSlot !== nextDropSlot) {
        this.dragState.dropSlot = nextDropSlot;
        this.renderTimeBlocks();
      }
    } else {
      const nextWidth = clamp(
        this.dragState.width + deltaX,
        MIN_TASK_SIZE.width,
        Math.min(MAX_TASK_SIZE.width, canvasRect.width - (task.position?.x || 0) - 10)
      );
      const nextHeight = clamp(this.dragState.height + deltaY, MIN_TASK_SIZE.height, MAX_TASK_SIZE.height);
      card.style.width = `${nextWidth}px`;
      card.style.height = `${nextHeight}px`;
    }
  }

  async handlePointerUp() {
    if (!this.dragState) {
      return;
    }

    const task = this.state.tasks.find((entry) => entry.id === this.dragState.taskId);
    const card = document.querySelector(`.task-card[data-task-id="${this.dragState.taskId}"]`);
    if (!task || !card) {
      this.dragState = null;
      document.body.classList.remove("dragging");
      return;
    }

    if (this.dragState.mode === "move") {
      if (this.dragState.dropSlot) {
        await this.addTaskToTimeBlock(task.id, this.dragState.dropSlot);
      } else {
        await this.updateTask(task.id, {
          position: {
            x: Number.parseFloat(card.style.left),
            y: Number.parseFloat(card.style.top)
          }
        });
      }
    } else {
      await this.updateTask(task.id, {
        size: {
          width: Number.parseFloat(card.style.width),
          height: Number.parseFloat(card.style.height)
        }
      });
    }

    this.dragState = null;
    document.body.classList.remove("dragging");
    this.renderTimeBlocks();
    this.renderToday();
    this.renderDrawer();
  }

  updateNetworkPill() {
    if (!this.state.appConfig.llmEnabled) {
      this.elements.networkPill.textContent = navigator.onLine
        ? "在线中：D 盘本地记录已就绪"
        : "离线中：本地记录模式";
      this.elements.networkPill.classList.toggle("is-offline", !navigator.onLine);
      return;
    }
    if (!navigator.onLine) {
      this.elements.networkPill.textContent = "离线中：D 盘本地记录可写，LLM 暂停";
    } else if (this.state.llmReady) {
      this.elements.networkPill.textContent = "在线中：D 盘本地记录和 LLM 已就绪";
    } else {
      this.elements.networkPill.textContent = "在线中：D 盘本地记录可用，LLM 代理未连接";
    }
    this.elements.networkPill.classList.toggle("is-offline", !navigator.onLine || !this.state.llmReady);
  }

  showToast(type, message) {
    const toast = document.createElement("article");
    toast.className = `toast toast--${type}`;
    toast.textContent = message;
    this.elements.toastRegion.appendChild(toast);
    window.setTimeout(() => {
      toast.remove();
    }, 3600);
  }

  registerServiceWorker() {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    const isLocalDev = ["127.0.0.1", "localhost"].includes(window.location.hostname);
    if (isLocalDev) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => registration.unregister());
      });
      return;
    }

    navigator.serviceWorker.register("./sw.js").catch(() => {
      this.showToast("warning", "Service Worker 注册失败。");
    });
  }
}

const app = new StudyDeskApp();
app.init().catch((error) => {
  console.error(error);
  document.querySelector("#toast-region")?.insertAdjacentHTML(
    "beforeend",
    `<article class="toast toast--error">启动失败：${escapeHtml(error.message)}</article>`
  );
});

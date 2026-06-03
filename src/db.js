const API_BASE = "/api";
const LEGACY_DB_NAME = "study-desk-db";
const LEGACY_IMPORT_DISMISSED_KEY = "study-desk-legacy-import-dismissed";

async function requestJson(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    },
    ...options
  });

  const rawText = await response.text();
  let payload = {};
  try {
    payload = rawText ? JSON.parse(rawText) : {};
  } catch (error) {
    payload = { error: rawText || `Request failed: ${response.status}` };
  }

  if (!response.ok) {
    throw new Error(payload.error || payload.message || `Request failed: ${response.status}`);
  }

  return payload;
}

export async function openDatabase() {
  return requestJson("/storage/status");
}

export async function getAppConfig() {
  const payload = await requestJson("/app-config");
  return payload || { llmEnabled: false };
}

export async function getStorageStatus() {
  return requestJson("/storage/status");
}

export async function getTasksByDate(date) {
  const payload = await requestJson(`/tasks?date=${encodeURIComponent(date)}`);
  return payload.items || [];
}

export async function putTask(task) {
  const payload = await requestJson(`/tasks/${encodeURIComponent(task.id)}`, {
    method: "PUT",
    body: JSON.stringify(task)
  });
  return payload.item;
}

export async function putTasks(tasks) {
  const payload = await requestJson("/tasks/bulk", {
    method: "POST",
    body: JSON.stringify({ items: tasks })
  });
  return payload.items || [];
}

export async function getTask(taskId) {
  const payload = await requestJson(`/tasks/${encodeURIComponent(taskId)}`);
  return payload.item || null;
}

export async function getNotesByTask(taskId) {
  const payload = await requestJson(`/notes?taskId=${encodeURIComponent(taskId)}`);
  return payload.items || [];
}

export async function putNote(note) {
  const payload = await requestJson(`/notes/${encodeURIComponent(note.id)}`, {
    method: "PUT",
    body: JSON.stringify(note)
  });
  return payload.item;
}

export async function deleteNote(noteId) {
  await requestJson(`/notes/${encodeURIComponent(noteId)}`, {
    method: "DELETE"
  });
}

export async function getMessagesByTask(taskId) {
  const payload = await requestJson(`/messages?taskId=${encodeURIComponent(taskId)}`);
  return payload.items || [];
}

export async function putMessage(message) {
  const payload = await requestJson(`/messages/${encodeURIComponent(message.id)}`, {
    method: "PUT",
    body: JSON.stringify(message)
  });
  return payload.item;
}

export async function getDailyRecord(date) {
  const payload = await requestJson(`/records/${encodeURIComponent(date)}`);
  return payload.item || null;
}

export async function putDailyRecord(record) {
  const payload = await requestJson(`/records/${encodeURIComponent(record.date)}`, {
    method: "PUT",
    body: JSON.stringify(record)
  });
  return payload.item;
}

export async function deleteTaskCascade(taskId, date) {
  await requestJson(`/tasks/${encodeURIComponent(taskId)}?date=${encodeURIComponent(date)}`, {
    method: "DELETE"
  });
}

export async function getDatesWithData() {
  const payload = await requestJson("/history-dates");
  return payload.dates || [];
}

export async function getContinuationByTask(taskId) {
  const payload = await requestJson(`/memory?taskId=${encodeURIComponent(taskId)}`);
  return payload.item || null;
}

export async function putContinuationEntry(entry) {
  const payload = await requestJson(`/memory/${encodeURIComponent(entry.id)}`, {
    method: "PUT",
    body: JSON.stringify(entry)
  });
  return payload.item;
}

export async function getQuotes() {
  const payload = await requestJson("/quotes");
  return payload.items || [];
}

export async function getTimeBlocksByDate(date) {
  const payload = await requestJson(`/time-blocks?date=${encodeURIComponent(date)}`);
  return payload.item || null;
}

export async function putTimeBlocksByDate(date, entry) {
  const payload = await requestJson(`/time-blocks/${encodeURIComponent(date)}`, {
    method: "PUT",
    body: JSON.stringify(entry)
  });
  return payload.item || null;
}

export const getMemoryEntryByTask = getContinuationByTask;
export const putMemoryEntry = putContinuationEntry;

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction aborted"));
  });
}

async function openLegacyDatabase() {
  return new Promise((resolve) => {
    if (!("indexedDB" in window)) {
      resolve(null);
      return;
    }

    const request = window.indexedDB.open(LEGACY_DB_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
    request.onupgradeneeded = () => resolve(request.result);
  });
}

async function readLegacyStoreAll(db, storeName) {
  if (!db.objectStoreNames.contains(storeName)) {
    return [];
  }
  const transaction = db.transaction(storeName, "readonly");
  const result = await requestToPromise(transaction.objectStore(storeName).getAll());
  await transactionDone(transaction);
  return Array.isArray(result) ? result : [];
}

export async function readLegacyIndexedDBSnapshot() {
  const db = await openLegacyDatabase();
  if (!db) {
    return { tasks: [], notes: [], messages: [], records: [], memoryEntries: [], hasData: false };
  }

  try {
    const tasks = await readLegacyStoreAll(db, "tasks");
    const notes = await readLegacyStoreAll(db, "notes");
    const messages = await readLegacyStoreAll(db, "messages");
    const records = await readLegacyStoreAll(db, "records");
    return {
      tasks,
      notes,
      messages,
      records,
      memoryEntries: [],
      hasData: tasks.length + notes.length + messages.length + records.length > 0
    };
  } finally {
    db.close();
  }
}

export async function maybeMigrateLegacyData() {
  const status = await getStorageStatus();
  if (!status.isEmpty) {
    return { migrated: false, reason: "server-not-empty", dataDir: status.dataDir };
  }

  if (window.localStorage.getItem(LEGACY_IMPORT_DISMISSED_KEY) === "1") {
    return { migrated: false, reason: "dismissed", dataDir: status.dataDir };
  }

  const snapshot = await readLegacyIndexedDBSnapshot();
  if (!snapshot.hasData) {
    return { migrated: false, reason: "no-legacy-data", dataDir: status.dataDir };
  }

  const confirmed = window.confirm(
    `发现旧版浏览器数据，是否导入到 D 盘本地数据目录？\n\n任务：${snapshot.tasks.length}\n灵感：${snapshot.notes.length}\n对话：${snapshot.messages.length}\n总结：${snapshot.records.length}`
  );

  if (!confirmed) {
    window.localStorage.setItem(LEGACY_IMPORT_DISMISSED_KEY, "1");
    return { migrated: false, reason: "declined", dataDir: status.dataDir };
  }

  const result = await requestJson("/storage/import-legacy", {
    method: "POST",
    body: JSON.stringify(snapshot)
  });
  window.localStorage.removeItem(LEGACY_IMPORT_DISMISSED_KEY);
  return {
    migrated: true,
    dataDir: result.dataDir,
    counts: result.counts || {}
  };
}

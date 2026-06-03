from __future__ import annotations

import argparse
import json
import os
import subprocess
import tempfile
import threading
from datetime import datetime
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
QUOTES_FILE = ROOT / "quotes.json"
REMOTE_ENDPOINT = "https://genaiapi.shanghaitech.edu.cn/api/v1/start"
DEFAULT_MODEL = "GPT-5.2"
APP_CONFIG = {"llmEnabled": False}


def env_key(name: str) -> str:
    return os.environ.get(name, "").strip()

TASK_COLORS = [
    {"value": "#f1b24a", "ink": "#4b2b02"},
    {"value": "#f09a8d", "ink": "#4c1d18"},
    {"value": "#8fcfbd", "ink": "#12372d"},
    {"value": "#9db9e8", "ink": "#162847"},
    {"value": "#d6c0f0", "ink": "#332047"},
    {"value": "#f3d7a6", "ink": "#503616"},
]
TASK_STATUSES = {"todo", "in-progress", "done"}
PRIORITY_LEVELS = {25, 50, 75, 100}
ORDERING_MODES = {"auto", "manual-top", "manual-bottom"}
NOTE_TYPES = {"plain", "carryover"}
DEFAULT_IMPORTANCE = 50
DEFAULT_URGENCY = 50
DEFAULT_TASK_SIZE = {"width": 280, "height": 220}
MIN_TASK_SIZE = {"width": 230, "height": 180}
MAX_TASK_SIZE = {"width": 430, "height": 360}

LEGACY_PRIORITY_MAPPING = {
    "important-urgent": (100, 100),
    "important-not-urgent": (100, 50),
    "not-important-urgent": (50, 100),
    "not-important-not-urgent": (25, 25),
}

DEFAULT_QUOTES = [
    {"text": "山月不替人作答，却陪人走一程。", "type": "random", "enabled": True},
    {"text": "风经过纸页，像时间轻轻翻身。", "type": "random", "enabled": True},
    {"text": "世界很大，也容得下一盏小灯。", "type": "random", "enabled": True},
    {"text": "月亮不着急赶路，夜色也会慢慢亮。", "type": "random", "enabled": True},
    {"text": "人被理解以后，心会慢慢松开。", "type": "random", "enabled": True},
    {"text": "灯一明，事便不算止。", "type": "start", "enabled": True},
    {"text": "风过案头，时光便轻移半寸。", "type": "start", "enabled": True},
    {"text": "纸翻一页，今日便又向前。", "type": "start", "enabled": True},
    {"text": "一灯一案，亦可自成天地。", "type": "start", "enabled": True},
    {"text": "纸尚未阖，今日便仍可续。", "type": "start", "enabled": True},
    {"text": "山不解答，倒教人心先静。", "type": "push", "enabled": True},
    {"text": "月色无言，却把长夜徐徐铺开。", "type": "push", "enabled": True},
    {"text": "灯火不盛，却足以照完此页。", "type": "push", "enabled": True},
    {"text": "有光之处，诸事自会渐渐归拢。", "type": "push", "enabled": True},
    {"text": "不必急赴远方，路自会慢慢现前。", "type": "push", "enabled": True},
]

PROFILES = {
    "GPT-5.2": {
        "label": "GPT-5.2",
        "model": "GPT-5.2",
        "api_key": env_key("STUDY_DESK_GPT_5_2_API_KEY"),
    },
    "deepseek-v3:671b": {
        "label": "deepseek-v3.2",
        "model": "deepseek-v3:671b",
        "api_key": env_key("STUDY_DESK_DEEPSEEK_V3_671B_API_KEY"),
    },
    "deepseek-r1:671b": {
        "label": "deepseekr1",
        "model": "deepseek-r1:671b",
        "api_key": env_key("STUDY_DESK_DEEPSEEK_R1_671B_API_KEY"),
    },
    "qwen-instruct": {
        "label": "Qwen3",
        "model": "qwen-instruct",
        "api_key": env_key("STUDY_DESK_QWEN_INSTRUCT_API_KEY"),
    },
    "qwen2.5-vl-instruct": {
        "label": "Qwen3-vl",
        "model": "qwen2.5-vl-instruct",
        "api_key": env_key("STUDY_DESK_QWEN25_VL_INSTRUCT_API_KEY"),
    },
}


def now_iso() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def grid_position(index: int) -> dict:
    column = index % 3
    row = index // 3
    return {"x": 28 + column * 298, "y": 28 + row * 238}


def compute_auto_priority_score(importance: int, urgency: int) -> float:
    return importance * 0.5 + urgency * 0.5


def normalize_priority_levels(raw: dict | None) -> tuple[int, int]:
    if not isinstance(raw, dict):
        return DEFAULT_IMPORTANCE, DEFAULT_URGENCY

    legacy = raw.get("priorityQuadrant")
    if legacy in LEGACY_PRIORITY_MAPPING:
        return LEGACY_PRIORITY_MAPPING[legacy]

    importance = raw.get("importance", DEFAULT_IMPORTANCE)
    urgency = raw.get("urgency", DEFAULT_URGENCY)
    importance = int(importance) if int(importance) in PRIORITY_LEVELS else DEFAULT_IMPORTANCE
    urgency = int(urgency) if int(urgency) in PRIORITY_LEVELS else DEFAULT_URGENCY
    return importance, urgency


def ensure_quotes_file(path: Path | None = None) -> None:
    path = path or QUOTES_FILE
    if path.exists():
        return
    path.write_text(json.dumps(DEFAULT_QUOTES, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def load_quotes(path: Path | None = None) -> list[dict]:
    path = path or QUOTES_FILE
    ensure_quotes_file(path)
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, FileNotFoundError):
        raw = DEFAULT_QUOTES

    items = raw if isinstance(raw, list) else []
    cleaned = []
    for index, item in enumerate(items):
        if not isinstance(item, dict):
            continue
        quote_type = item.get("type")
        if quote_type not in {"start", "push", "random"}:
            continue
        text = str(item.get("text") or "").strip()
        if not text:
            continue
        cleaned.append(
            {
                "id": str(item.get("id") or f"quote-{index}"),
                "text": text,
                "type": quote_type,
                "enabled": bool(item.get("enabled", True)),
            }
        )
    return cleaned


def extract_text_content(payload: dict) -> str:
    candidate = None

    choices = payload.get("choices")
    if isinstance(choices, list) and choices:
        candidate = choices[0].get("message", {}).get("content")

    if candidate is None:
        candidate = payload.get("message", {}).get("content")
    if candidate is None:
        candidate = payload.get("output_text")
    if candidate is None:
        candidate = payload.get("response", {}).get("content")
    if candidate is None and isinstance(payload.get("data"), dict):
        nested_choices = payload["data"].get("choices")
        if isinstance(nested_choices, list) and nested_choices:
            candidate = nested_choices[0].get("message", {}).get("content")

    if isinstance(candidate, str):
        return candidate.strip()

    if isinstance(candidate, list):
        parts = []
        for part in candidate:
            if isinstance(part, str):
                parts.append(part)
            elif isinstance(part, dict):
                parts.append(part.get("text") or part.get("content") or part.get("output_text") or "")
        return "\n".join(part for part in parts if part).strip()

    return ""


class JsonRepository:
    def __init__(self, data_dir: Path):
        self.data_dir = data_dir
        self.lock = threading.RLock()
        self.files = {
            "tasks": data_dir / "tasks.json",
            "notes": data_dir / "notes.json",
            "messages": data_dir / "messages.json",
            "records": data_dir / "records.json",
            "memory_entries": data_dir / "memory_entries.json",
            "time_blocks": data_dir / "time_blocks.json",
        }
        self.key_fields = {
            "tasks": "id",
            "notes": "id",
            "messages": "id",
            "records": "date",
            "memory_entries": "id",
        }
        self.ensure_files()

    def ensure_files(self) -> None:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        ensure_quotes_file()
        with self.lock:
            for path in self.files.values():
                if not path.exists():
                    default_payload = "{}\n" if path.stem == "time_blocks" else "[]\n"
                    path.write_text(default_payload, encoding="utf-8")

    def _read_items(self, store: str) -> list:
        path = self.files[store]
        with self.lock:
            try:
                raw = json.loads(path.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, FileNotFoundError):
                raw = []
            return raw if isinstance(raw, list) else []

    def _read_time_block_map(self) -> dict:
        path = self.files["time_blocks"]
        with self.lock:
            try:
                raw = json.loads(path.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, FileNotFoundError):
                raw = {}
            return raw if isinstance(raw, dict) else {}

    def _write_items(self, store: str, items: list) -> None:
        path = self.files[store]
        payload = json.dumps(items, ensure_ascii=False, indent=2)
        with self.lock:
            fd, temp_name = tempfile.mkstemp(prefix=path.stem + "-", suffix=".tmp", dir=str(self.data_dir))
            try:
                with os.fdopen(fd, "w", encoding="utf-8") as handle:
                    handle.write(payload)
                    handle.write("\n")
                os.replace(temp_name, path)
            finally:
                if os.path.exists(temp_name):
                    os.remove(temp_name)

    def _write_time_block_map(self, mapping: dict) -> None:
        path = self.files["time_blocks"]
        payload = json.dumps(mapping, ensure_ascii=False, indent=2)
        with self.lock:
            fd, temp_name = tempfile.mkstemp(prefix=path.stem + "-", suffix=".tmp", dir=str(self.data_dir))
            try:
                with os.fdopen(fd, "w", encoding="utf-8") as handle:
                    handle.write(payload)
                    handle.write("\n")
                os.replace(temp_name, path)
            finally:
                if os.path.exists(temp_name):
                    os.remove(temp_name)

    def _palette_for(self, index: int) -> dict:
        return TASK_COLORS[index % len(TASK_COLORS)]

    def _sanitize_task(self, raw: dict, index: int = 0) -> dict:
        raw = raw or {}
        palette = self._palette_for(index)
        raw_position = raw.get("position")
        raw_size = raw.get("size")
        raw_color = str(raw.get("color") or palette["value"])
        color_ink = str(raw.get("colorInk") or next((entry["ink"] for entry in TASK_COLORS if entry["value"] == raw_color), palette["ink"]))
        status = raw.get("status")
        created_at = str(raw.get("createdAt") or now_iso())
        updated_at = str(raw.get("updatedAt") or created_at)
        importance, urgency = normalize_priority_levels(raw)
        ordering_mode = raw.get("orderingMode") if raw.get("orderingMode") in ORDERING_MODES else "auto"
        ordering_updated_at = str(raw.get("orderingUpdatedAt") or updated_at)
        position = {
            "x": float(raw_position.get("x", grid_position(index)["x"])) if isinstance(raw_position, dict) else float(grid_position(index)["x"]),
            "y": float(raw_position.get("y", grid_position(index)["y"])) if isinstance(raw_position, dict) else float(grid_position(index)["y"]),
        }
        width = float(raw_size.get("width", DEFAULT_TASK_SIZE["width"])) if isinstance(raw_size, dict) else float(DEFAULT_TASK_SIZE["width"])
        height = float(raw_size.get("height", DEFAULT_TASK_SIZE["height"])) if isinstance(raw_size, dict) else float(DEFAULT_TASK_SIZE["height"])
        task_date = str(raw.get("date") or raw.get("scheduledDate") or "")
        scheduled_date = str(raw.get("scheduledDate") or task_date)
        arranged_from = str(raw.get("arrangedFrom") or "")
        raw_arranged = raw.get("isArrangedTask")
        if isinstance(raw_arranged, bool):
            is_arranged_task = raw_arranged
        else:
            is_arranged_task = bool(arranged_from or str(raw.get("carriedFromTaskId") or "").strip())

        return {
            "id": str(raw.get("id") or f"task-{index}-{created_at}"),
            "date": task_date,
            "scheduledDate": scheduled_date,
            "arrangedFrom": arranged_from,
            "isArrangedTask": is_arranged_task,
            "title": str(raw.get("title") or ""),
            "status": status if status in TASK_STATUSES else "todo",
            "color": raw_color,
            "colorInk": color_ink,
            "importance": importance,
            "urgency": urgency,
            "orderingMode": ordering_mode,
            "orderingUpdatedAt": ordering_updated_at,
            "autoPriorityScore": compute_auto_priority_score(importance, urgency),
            "collapsed": bool(raw.get("collapsed")),
            "position": position,
            "size": {
                "width": clamp(width, MIN_TASK_SIZE["width"], MAX_TASK_SIZE["width"]),
                "height": clamp(height, MIN_TASK_SIZE["height"], MAX_TASK_SIZE["height"]),
            },
            "archivedAt": raw.get("archivedAt"),
            "carriedFromTaskId": str(raw.get("carriedFromTaskId") or ""),
            "carriedAt": raw.get("carriedAt"),
            "createdAt": created_at,
            "updatedAt": updated_at,
        }

    def _sanitize_note(self, raw: dict, index: int = 0) -> dict:
        raw = raw or {}
        created_at = str(raw.get("createdAt") or now_iso())
        note_type = raw.get("noteType") if raw.get("noteType") in NOTE_TYPES else "plain"
        source_note_ids = raw.get("sourceNoteIds") or []
        if isinstance(source_note_ids, str):
            source_note_ids = [item.strip() for item in source_note_ids.split(",") if item.strip()]
        return {
            "id": str(raw.get("id") or f"note-{index}-{created_at}"),
            "taskId": str(raw.get("taskId") or ""),
            "content": str(raw.get("content") or ""),
            "noteType": note_type,
            "sourceTaskId": str(raw.get("sourceTaskId") or ""),
            "sourceNoteIds": [str(item) for item in source_note_ids if str(item).strip()],
            "createdAt": created_at,
        }

    def _sanitize_message(self, raw: dict, index: int = 0) -> dict:
        raw = raw or {}
        created_at = str(raw.get("createdAt") or now_iso())
        role = raw.get("role")
        return {
            "id": str(raw.get("id") or f"message-{index}-{created_at}"),
            "taskId": str(raw.get("taskId") or ""),
            "role": role if role in {"user", "assistant"} else "assistant",
            "content": str(raw.get("content") or ""),
            "createdAt": created_at,
            "errorState": raw.get("errorState"),
        }

    def _sanitize_record(self, raw: dict, index: int = 0) -> dict:
        raw = raw or {}
        return {
            "date": str(raw.get("date") or f"record-{index}"),
            "taskIds": [str(task_id) for task_id in (raw.get("taskIds") or []) if task_id],
            "summaryDraft": str(raw.get("summaryDraft") or ""),
            "finalSummary": str(raw.get("finalSummary") or ""),
            "generatedAt": raw.get("generatedAt"),
        }

    def _sanitize_memory_entry(self, raw: dict, index: int = 0) -> dict:
        raw = raw or {}
        created_at = str(raw.get("createdAt") or now_iso())
        updated_at = str(raw.get("updatedAt") or created_at)
        file_list = raw.get("fileList") or []
        if isinstance(file_list, str):
            file_list = [item.strip() for item in file_list.splitlines() if item.strip()]

        last_progress = str(raw.get("lastProgress") or "")
        if not last_progress:
            legacy_definition = str(raw.get("completionDefinition") or "").strip()
            legacy_comment = str(raw.get("comment") or "").strip()
            last_progress = legacy_definition or legacy_comment

        return {
            "id": str(raw.get("id") or f"continuation-{index}-{created_at}"),
            "taskId": str(raw.get("taskId") or ""),
            "date": str(raw.get("date") or ""),
            "taskTitle": str(raw.get("taskTitle") or ""),
            "lastProgress": last_progress,
            "projectPath": str(raw.get("projectPath") or ""),
            "fileList": [str(item) for item in file_list if str(item).strip()],
            "deadline": str(raw.get("deadline") or ""),
            "createdAt": created_at,
            "updatedAt": updated_at,
        }

    def _sanitize_time_block_entry(self, date: str, raw: dict | None) -> dict:
        raw = raw or {}

        def unique_task_ids(items) -> list[str]:
            values = items if isinstance(items, list) else []
            seen = set()
            ordered = []
            for item in values:
                value = str(item or "").strip()
                if not value or value in seen:
                    continue
                seen.add(value)
                ordered.append(value)
            return ordered

        return {
            "date": str(date or raw.get("date") or ""),
            "morning": unique_task_ids(raw.get("morning")),
            "afternoon": unique_task_ids(raw.get("afternoon")),
            "evening": unique_task_ids(raw.get("evening")),
        }

    def _sanitize_store_items(self, store: str, items: list) -> list:
        sanitizer = {
            "tasks": self._sanitize_task,
            "notes": self._sanitize_note,
            "messages": self._sanitize_message,
            "records": self._sanitize_record,
            "memory_entries": self._sanitize_memory_entry,
        }[store]
        return [sanitizer(item or {}, index) for index, item in enumerate(items or [])]

    def _upsert(self, store: str, item: dict) -> dict:
        items = self._sanitize_store_items(store, self._read_items(store))
        sanitized = self._sanitize_store_items(store, [item])[0]
        key = self.key_fields[store]
        match_index = next((index for index, current in enumerate(items) if current.get(key) == sanitized.get(key)), None)
        if match_index is None:
            items.append(sanitized)
        else:
            items[match_index] = sanitized
        self._write_items(store, items)
        return sanitized

    def _upsert_many(self, store: str, new_items: list) -> list:
        items = self._sanitize_store_items(store, self._read_items(store))
        sanitized_items = self._sanitize_store_items(store, new_items)
        key = self.key_fields[store]
        item_map = {item[key]: item for item in items}
        for item in sanitized_items:
            item_map[item[key]] = item
        merged = list(item_map.values())
        self._write_items(store, merged)
        return sanitized_items

    def get_status(self) -> dict:
        counts = {
            "tasks": len(self._sanitize_store_items("tasks", self._read_items("tasks"))),
            "notes": len(self._sanitize_store_items("notes", self._read_items("notes"))),
            "messages": len(self._sanitize_store_items("messages", self._read_items("messages"))),
            "records": len(self._sanitize_store_items("records", self._read_items("records"))),
            "memory_entries": len(self._sanitize_store_items("memory_entries", self._read_items("memory_entries"))),
            "time_blocks": len(self._read_time_block_map()),
        }
        is_empty = all(count == 0 for count in counts.values())
        return {
            "dataDir": str(self.data_dir),
            "quotesFile": str(QUOTES_FILE),
            "counts": {
                "tasks": counts["tasks"],
                "notes": counts["notes"],
                "messages": counts["messages"],
                "records": counts["records"],
                "memoryEntries": counts["memory_entries"],
                "timeBlocks": counts["time_blocks"],
            },
            "isEmpty": is_empty,
        }

    def get_dates_with_data(self) -> list[str]:
        dates = set()
        for task in self._sanitize_store_items("tasks", self._read_items("tasks")):
            if task.get("date"):
                dates.add(task["date"])
        for record in self._sanitize_store_items("records", self._read_items("records")):
            if record.get("date"):
                dates.add(record["date"])
        for entry in self._sanitize_store_items("memory_entries", self._read_items("memory_entries")):
            if entry.get("date"):
                dates.add(entry["date"])
        return sorted(dates, reverse=True)

    def get_tasks_by_date(self, date: str) -> list:
        tasks = self._sanitize_store_items("tasks", self._read_items("tasks"))
        filtered = [task for task in tasks if task.get("date") == date]
        return sorted(filtered, key=lambda task: task.get("createdAt", ""))

    def get_task(self, task_id: str) -> dict | None:
        tasks = self._sanitize_store_items("tasks", self._read_items("tasks"))
        return next((task for task in tasks if task.get("id") == task_id), None)

    def put_task(self, task: dict) -> dict:
        return self._upsert("tasks", task)

    def put_tasks(self, tasks: list) -> list:
        return self._upsert_many("tasks", tasks)

    def get_notes_by_task(self, task_id: str) -> list:
        notes = self._sanitize_store_items("notes", self._read_items("notes"))
        filtered = [note for note in notes if note.get("taskId") == task_id]
        return sorted(filtered, key=lambda note: note.get("createdAt", ""), reverse=True)

    def put_note(self, note: dict) -> dict:
        return self._upsert("notes", note)

    def delete_note(self, note_id: str) -> None:
        notes = self._sanitize_store_items("notes", self._read_items("notes"))
        notes = [note for note in notes if note.get("id") != note_id]
        self._write_items("notes", notes)

    def get_messages_by_task(self, task_id: str) -> list:
        messages = self._sanitize_store_items("messages", self._read_items("messages"))
        filtered = [message for message in messages if message.get("taskId") == task_id]
        return sorted(filtered, key=lambda message: message.get("createdAt", ""))

    def put_message(self, message: dict) -> dict:
        return self._upsert("messages", message)

    def get_record(self, date: str) -> dict | None:
        records = self._sanitize_store_items("records", self._read_items("records"))
        return next((record for record in records if record.get("date") == date), None)

    def put_record(self, record: dict) -> dict:
        return self._upsert("records", record)

    def get_memory_entry_by_task(self, task_id: str) -> dict | None:
        entries = self._sanitize_store_items("memory_entries", self._read_items("memory_entries"))
        matching = [entry for entry in entries if entry.get("taskId") == task_id]
        if not matching:
            return None
        matching.sort(key=lambda entry: entry.get("updatedAt") or entry.get("createdAt") or "", reverse=True)
        return matching[0]

    def put_memory_entry(self, entry: dict) -> dict:
        return self._upsert("memory_entries", entry)

    def get_time_blocks_by_date(self, date: str) -> dict:
        entry = self._read_time_block_map().get(date, {})
        return self._sanitize_time_block_entry(date, entry)

    def put_time_blocks(self, date: str, entry: dict) -> dict:
        sanitized = self._sanitize_time_block_entry(date, entry)
        mapping = self._read_time_block_map()
        if sanitized["morning"] or sanitized["afternoon"] or sanitized["evening"]:
            mapping[sanitized["date"]] = {
                "morning": sanitized["morning"],
                "afternoon": sanitized["afternoon"],
                "evening": sanitized["evening"],
            }
        else:
            mapping.pop(sanitized["date"], None)
        self._write_time_block_map(mapping)
        return sanitized

    def delete_task_cascade(self, task_id: str, date: str | None = None) -> None:
        tasks = self._sanitize_store_items("tasks", self._read_items("tasks"))
        notes = self._sanitize_store_items("notes", self._read_items("notes"))
        messages = self._sanitize_store_items("messages", self._read_items("messages"))
        records = self._sanitize_store_items("records", self._read_items("records"))
        memory_entries = self._sanitize_store_items("memory_entries", self._read_items("memory_entries"))
        time_blocks = self._read_time_block_map()

        tasks = [task for task in tasks if task.get("id") != task_id]
        notes = [note for note in notes if note.get("taskId") != task_id]
        messages = [message for message in messages if message.get("taskId") != task_id]
        memory_entries = [entry for entry in memory_entries if entry.get("taskId") != task_id]
        cleaned_time_blocks = {}
        for block_date, block in time_blocks.items():
            sanitized = self._sanitize_time_block_entry(block_date, block)
            next_block = {
                "morning": [item for item in sanitized["morning"] if item != task_id],
                "afternoon": [item for item in sanitized["afternoon"] if item != task_id],
                "evening": [item for item in sanitized["evening"] if item != task_id],
            }
            if next_block["morning"] or next_block["afternoon"] or next_block["evening"]:
                cleaned_time_blocks[block_date] = next_block

        for record in records:
            record["taskIds"] = [item for item in record.get("taskIds", []) if item != task_id]
        if date:
            records = [
                record
                for record in records
                if record.get("date") != date or record.get("taskIds") or record.get("summaryDraft") or record.get("finalSummary")
            ]

        self._write_items("tasks", tasks)
        self._write_items("notes", notes)
        self._write_items("messages", messages)
        self._write_items("records", records)
        self._write_items("memory_entries", memory_entries)
        self._write_time_block_map(cleaned_time_blocks)

    def import_legacy_snapshot(self, snapshot: dict) -> dict:
        if not self.get_status()["isEmpty"]:
            raise ValueError("D 盘数据目录中已经有内容，无法覆盖导入。")

        tasks = self._sanitize_store_items("tasks", snapshot.get("tasks") or [])
        notes = self._sanitize_store_items("notes", snapshot.get("notes") or [])
        messages = self._sanitize_store_items("messages", snapshot.get("messages") or [])
        records = self._sanitize_store_items("records", snapshot.get("records") or [])
        memory_entries = self._sanitize_store_items("memory_entries", snapshot.get("memoryEntries") or [])

        self._write_items("tasks", tasks)
        self._write_items("notes", notes)
        self._write_items("messages", messages)
        self._write_items("records", records)
        self._write_items("memory_entries", memory_entries)
        return self.get_status()


REPOSITORY = JsonRepository(DATA_DIR)


class StudyDeskHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_OPTIONS(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self.send_response(HTTPStatus.NO_CONTENT)
            self._send_common_headers()
            self.end_headers()
            return
        self.send_error(HTTPStatus.NOT_FOUND)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self._handle_api_get(parsed)
            return
        super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        try:
            if parsed.path == "/api/llm":
                self._handle_llm_request()
                return
            if parsed.path == "/api/tasks/bulk":
                body = self._read_json_body()
                self._send_json(HTTPStatus.OK, {"items": REPOSITORY.put_tasks(body.get("items") or [])})
                return
            if parsed.path == "/api/storage/import-legacy":
                body = self._read_json_body()
                try:
                    result = REPOSITORY.import_legacy_snapshot(body)
                except ValueError as error:
                    self._send_json(HTTPStatus.CONFLICT, {"error": str(error)})
                    return
                self._send_json(HTTPStatus.OK, result)
                return
        except ValueError as error:
            self._send_json(HTTPStatus.BAD_REQUEST, {"error": str(error)})
            return
        self.send_error(HTTPStatus.NOT_FOUND)

    def do_PUT(self):
        parsed = urlparse(self.path)
        parts = [unquote(part) for part in parsed.path.split("/") if part]
        try:
            body = self._read_json_body()
            if len(parts) == 3 and parts[0] == "api" and parts[1] == "tasks":
                body["id"] = parts[2]
                self._send_json(HTTPStatus.OK, {"item": REPOSITORY.put_task(body)})
                return
            if len(parts) == 3 and parts[0] == "api" and parts[1] == "notes":
                body["id"] = parts[2]
                self._send_json(HTTPStatus.OK, {"item": REPOSITORY.put_note(body)})
                return
            if len(parts) == 3 and parts[0] == "api" and parts[1] == "messages":
                body["id"] = parts[2]
                self._send_json(HTTPStatus.OK, {"item": REPOSITORY.put_message(body)})
                return
            if len(parts) == 3 and parts[0] == "api" and parts[1] == "records":
                body["date"] = parts[2]
                self._send_json(HTTPStatus.OK, {"item": REPOSITORY.put_record(body)})
                return
            if len(parts) == 3 and parts[0] == "api" and parts[1] == "memory":
                body["id"] = parts[2]
                self._send_json(HTTPStatus.OK, {"item": REPOSITORY.put_memory_entry(body)})
                return
            if len(parts) == 3 and parts[0] == "api" and parts[1] == "time-blocks":
                body["date"] = parts[2]
                self._send_json(HTTPStatus.OK, {"item": REPOSITORY.put_time_blocks(parts[2], body)})
                return
        except ValueError as error:
            self._send_json(HTTPStatus.BAD_REQUEST, {"error": str(error)})
            return
        self.send_error(HTTPStatus.NOT_FOUND)

    def do_DELETE(self):
        parsed = urlparse(self.path)
        parts = [unquote(part) for part in parsed.path.split("/") if part]
        query = parse_qs(parsed.query)
        if len(parts) == 3 and parts[0] == "api" and parts[1] == "tasks":
            REPOSITORY.delete_task_cascade(parts[2], (query.get("date") or [None])[0])
            self._send_json(HTTPStatus.OK, {"ok": True})
            return
        if len(parts) == 3 and parts[0] == "api" and parts[1] == "notes":
            REPOSITORY.delete_note(parts[2])
            self._send_json(HTTPStatus.OK, {"ok": True})
            return
        self.send_error(HTTPStatus.NOT_FOUND)

    def _handle_api_get(self, parsed) -> None:
        parts = [unquote(part) for part in parsed.path.split("/") if part]
        query = parse_qs(parsed.query)

        if parsed.path == "/api/app-config":
            self._send_json(HTTPStatus.OK, APP_CONFIG)
            return
        if parsed.path == "/api/health":
            self._send_json(HTTPStatus.OK, {"ok": True, "dataDir": str(DATA_DIR)})
            return
        if parsed.path == "/api/storage/status":
            self._send_json(HTTPStatus.OK, REPOSITORY.get_status())
            return
        if parsed.path == "/api/history-dates":
            self._send_json(HTTPStatus.OK, {"dates": REPOSITORY.get_dates_with_data()})
            return
        if parsed.path == "/api/quotes":
            self._send_json(HTTPStatus.OK, {"items": load_quotes()})
            return
        if parsed.path == "/api/tasks":
            date = (query.get("date") or [""])[0]
            self._send_json(HTTPStatus.OK, {"items": REPOSITORY.get_tasks_by_date(date)})
            return
        if len(parts) == 3 and parts[0] == "api" and parts[1] == "tasks":
            self._send_json(HTTPStatus.OK, {"item": REPOSITORY.get_task(parts[2])})
            return
        if parsed.path == "/api/notes":
            task_id = (query.get("taskId") or [""])[0]
            self._send_json(HTTPStatus.OK, {"items": REPOSITORY.get_notes_by_task(task_id)})
            return
        if parsed.path == "/api/messages":
            task_id = (query.get("taskId") or [""])[0]
            self._send_json(HTTPStatus.OK, {"items": REPOSITORY.get_messages_by_task(task_id)})
            return
        if len(parts) == 3 and parts[0] == "api" and parts[1] == "records":
            self._send_json(HTTPStatus.OK, {"item": REPOSITORY.get_record(parts[2])})
            return
        if parsed.path == "/api/memory":
            task_id = (query.get("taskId") or [""])[0]
            self._send_json(HTTPStatus.OK, {"item": REPOSITORY.get_memory_entry_by_task(task_id)})
            return
        if parsed.path == "/api/time-blocks":
            date = (query.get("date") or [""])[0]
            self._send_json(HTTPStatus.OK, {"item": REPOSITORY.get_time_blocks_by_date(date)})
            return
        self.send_error(HTTPStatus.NOT_FOUND)

    def _handle_llm_request(self) -> None:
        if not APP_CONFIG.get("llmEnabled"):
            self._send_json(HTTPStatus.SERVICE_UNAVAILABLE, {"error": "LLM is disabled for this Study Desk session."})
            return

        body = self._read_json_body()
        model_name = body.get("model") or DEFAULT_MODEL
        profile = PROFILES.get(model_name)
        if not profile:
            self._send_json(HTTPStatus.BAD_REQUEST, {"error": f"Unsupported model: {model_name}"})
            return
        if not profile.get("api_key"):
            self._send_json(
                HTTPStatus.SERVICE_UNAVAILABLE,
                {
                    "error": (
                        f"LLM model '{model_name}' is not configured. "
                        "Set the corresponding STUDY_DESK_*_API_KEY environment variable first."
                    )
                },
            )
            return

        user_prompt = body.get("userPrompt", "")
        if not user_prompt:
            self._send_json(HTTPStatus.BAD_REQUEST, {"error": "userPrompt is required."})
            return

        upstream_payload = {
            "model": profile["model"],
            "messages": [
                {
                    "role": "system",
                    "content": [{"type": "text", "text": body.get("systemPrompt", "")}],
                },
                {
                    "role": "user",
                    "content": [{"type": "text", "text": user_prompt}],
                },
            ],
            "temperature": 0.35,
            "stream": False,
        }
        request_body = json.dumps(upstream_payload, ensure_ascii=False).encode("utf-8")

        try:
            result = subprocess.run(
                [
                    "curl.exe",
                    "-sS",
                    "-X",
                    "POST",
                    REMOTE_ENDPOINT,
                    "-H",
                    "accept: application/json",
                    "-H",
                    f"Authorization: Bearer {profile['api_key']}",
                    "-H",
                    "Content-Type: application/json; charset=utf-8",
                    "--data-binary",
                    "@-",
                ],
                input=request_body,
                capture_output=True,
                timeout=60,
            )
        except Exception as error:
            self._send_json(HTTPStatus.BAD_GATEWAY, {"error": str(error)})
            return

        response_text = (result.stdout or b"").decode("utf-8", errors="replace").strip()
        if result.returncode != 0:
            stderr_text = (result.stderr or b"").decode("utf-8", errors="replace").strip()
            detail = (stderr_text or response_text or f"curl exit code {result.returncode}").strip()
            self._send_json(HTTPStatus.BAD_GATEWAY, {"error": detail})
            return

        try:
            payload = json.loads(response_text) if response_text else {}
        except json.JSONDecodeError:
            self._send_json(HTTPStatus.BAD_GATEWAY, {"error": response_text or "Upstream returned non-JSON content."})
            return

        if payload.get("success") is False:
            self._send_json(HTTPStatus.BAD_GATEWAY, {"error": payload.get("message") or payload})
            return

        content = extract_text_content(payload)
        if not content:
            self._send_json(HTTPStatus.BAD_GATEWAY, {"error": "Upstream model returned empty content.", "raw": payload})
            return

        self._send_json(
            HTTPStatus.OK,
            {
                "content": content,
                "model": profile["model"],
                "label": profile["label"],
            },
        )

    def _read_json_body(self) -> dict:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError as error:
            raise ValueError("Invalid Content-Length") from error

        raw = self.rfile.read(length) if length else b"{}"
        try:
            data = json.loads(raw.decode("utf-8")) if raw else {}
        except json.JSONDecodeError as error:
            raise ValueError("Request body must be valid JSON.") from error
        return data if isinstance(data, dict) else {}

    def _send_common_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Cache-Control", "no-store")

    def _send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self._send_common_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main() -> None:
    parser = argparse.ArgumentParser(description="Study Desk local server with D-drive JSON storage")
    parser.add_argument("port", nargs="?", type=int, default=4173)
    parser.add_argument("--enable-llm", action="store_true", help="Enable LLM routes and UI for this session.")
    parser.add_argument("--disable-llm", action="store_true", help="Disable LLM routes and UI for this session.")
    args = parser.parse_args()

    env_llm_enabled = os.environ.get("STUDY_DESK_ENABLE_LLM", "").strip().lower() in {"1", "true", "yes", "on"}
    llm_enabled = env_llm_enabled
    if args.enable_llm:
        llm_enabled = True
    if args.disable_llm:
        llm_enabled = False
    APP_CONFIG["llmEnabled"] = llm_enabled

    REPOSITORY.ensure_files()
    server = ThreadingHTTPServer(("0.0.0.0", args.port), StudyDeskHandler)
    print(f"Study Desk serving on http://127.0.0.1:{args.port}")
    print(f"Data directory: {DATA_DIR}")
    print(f"Quotes file: {QUOTES_FILE}")
    print(f"LLM enabled: {APP_CONFIG['llmEnabled']}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping Study Desk server...")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()

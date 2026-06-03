from __future__ import annotations

import argparse
import json
import sys
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import serve_app


def write_json(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def seed_demo_dataset(data_dir: Path, quotes_file: Path | None = None) -> None:
    repo = serve_app.JsonRepository(data_dir)

    repo._write_items("tasks", [])
    repo._write_items("notes", [])
    repo._write_items("messages", [])
    repo._write_items("records", [])
    repo._write_items("memory_entries", [])
    repo._write_time_block_map({})

    today = date.today()
    today_key = today.isoformat()
    yesterday_key = (today - timedelta(days=1)).isoformat()
    tomorrow_key = (today + timedelta(days=1)).isoformat()

    task_review = repo.put_task(
        {
            "id": "demo-task-review",
            "date": today_key,
            "title": "Review chapter notes",
            "status": "in-progress",
            "importance": 100,
            "urgency": 75,
            "color": "#f1b24a",
            "colorInk": "#4b2b02",
        }
    )
    task_impl = repo.put_task(
        {
            "id": "demo-task-impl",
            "date": today_key,
            "title": "Implement drag interaction fix",
            "status": "todo",
            "importance": 75,
            "urgency": 100,
            "color": "#8fcfbd",
            "colorInk": "#12372d",
        }
    )
    task_done = repo.put_task(
        {
            "id": "demo-task-done",
            "date": today_key,
            "title": "Write final summary",
            "status": "done",
            "importance": 50,
            "urgency": 50,
            "color": "#9db9e8",
            "colorInk": "#162847",
        }
    )
    task_arranged = repo.put_task(
        {
            "id": "demo-task-arranged",
            "date": tomorrow_key,
            "scheduledDate": tomorrow_key,
            "arrangedFrom": today_key,
            "isArrangedTask": True,
            "title": "Continue model evaluation",
            "status": "todo",
            "importance": 75,
            "urgency": 50,
            "color": "#f3d7a6",
            "colorInk": "#503616",
            "carriedFromTaskId": task_review["id"],
        }
    )

    repo.put_note(
        {
            "id": "demo-note-review-1",
            "taskId": task_review["id"],
            "content": "Summarize the key diagrams and definitions.",
            "createdAt": "2026-01-01T09:00:00+08:00",
        }
    )
    repo.put_note(
        {
            "id": "demo-note-impl-1",
            "taskId": task_impl["id"],
            "content": "Check layout behavior under browser zoom.",
            "createdAt": "2026-01-01T10:00:00+08:00",
        }
    )
    repo.put_note(
        {
            "id": "demo-note-arranged-1",
            "taskId": task_arranged["id"],
            "content": "Carry over the evaluation checklist and tomorrow target.",
            "noteType": "carryover",
            "sourceTaskId": task_review["id"],
            "createdAt": "2026-01-01T11:00:00+08:00",
        }
    )

    repo.put_memory_entry(
        {
            "id": "demo-memory-review",
            "taskId": task_review["id"],
            "date": today_key,
            "taskTitle": task_review["title"],
            "lastProgress": "Finished sections 1 to 3, sections 4 to 5 remain.",
            "projectPath": "D:\\projects\\daily_planning\\src",
            "fileList": ["src/app.js", "styles.css"],
            "deadline": tomorrow_key,
        }
    )

    repo.put_record(
        {
            "date": yesterday_key,
            "taskIds": [],
            "finalSummary": "Demo history summary for the previous day.",
            "summaryDraft": "",
            "generatedAt": "2026-01-01T08:30:00+08:00",
        }
    )
    repo.put_record(
        {
            "date": today_key,
            "taskIds": [task_review["id"], task_impl["id"], task_done["id"]],
            "finalSummary": "Demo day: one task in progress, one planned fix, one completed wrap-up.",
            "summaryDraft": "",
            "generatedAt": "2026-01-01T18:30:00+08:00",
        }
    )

    repo.put_time_blocks(
        today_key,
        {
            "date": today_key,
            "morning": [task_review["id"]],
            "afternoon": [task_impl["id"]],
            "evening": [task_done["id"], task_review["id"]],
        },
    )

    if quotes_file is not None and not quotes_file.exists():
        write_json(
            quotes_file,
            [
                {"id": "demo-quote-start", "text": "Start small, then keep moving.", "type": "start", "enabled": True},
                {"id": "demo-quote-push", "text": "Momentum beats hesitation.", "type": "push", "enabled": True},
                {"id": "demo-quote-random", "text": "A clear next step reduces friction.", "type": "random", "enabled": True},
            ],
        )


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed local demo data for Study Desk.")
    parser.add_argument("--data-dir", default="data", help="Target data directory. Defaults to ./data")
    parser.add_argument("--quotes-file", default="quotes.json", help="Target quotes file. Defaults to ./quotes.json")
    parser.add_argument("--force", action="store_true", help="Overwrite existing local data files.")
    args = parser.parse_args()

    data_dir = Path(args.data_dir).resolve()
    quotes_file = Path(args.quotes_file).resolve()

    existing_payloads = [path for path in data_dir.glob("*.json") if path.exists() and path.stat().st_size > 4]
    if existing_payloads and not args.force:
        raise SystemExit("Refusing to overwrite existing data. Re-run with --force.")

    seed_demo_dataset(data_dir, quotes_file)
    print(f"Demo data written to {data_dir}")


if __name__ == "__main__":
    main()

import json

from serve_app import JsonRepository, compute_auto_priority_score, load_quotes


def test_task_sanitizes_legacy_priority_into_importance_and_urgency(tmp_path):
    repo = JsonRepository(tmp_path / "data")

    saved = repo.put_task(
        {
            "id": "task-legacy",
            "date": "2026-04-25",
            "title": "legacy priority task",
            "priorityQuadrant": "important-not-urgent",
        }
    )

    assert saved["importance"] == 100
    assert saved["urgency"] == 50
    assert saved["orderingMode"] == "auto"
    assert saved["autoPriorityScore"] == compute_auto_priority_score(100, 50)


def test_task_schedule_fields_fallback_to_safe_defaults(tmp_path):
    repo = JsonRepository(tmp_path / "data")

    saved = repo.put_task(
        {
            "id": "task-schedule-fallback",
            "date": "2026-04-27",
            "title": "schedule fallback task",
            "carriedFromTaskId": "task-origin",
        }
    )

    assert saved["date"] == "2026-04-27"
    assert saved["scheduledDate"] == "2026-04-27"
    assert saved["arrangedFrom"] == ""
    assert saved["isArrangedTask"] is True


def test_task_schedule_fields_preserve_explicit_arrange_metadata(tmp_path):
    repo = JsonRepository(tmp_path / "data")

    saved = repo.put_task(
        {
            "id": "task-arranged",
            "date": "2026-04-30",
            "scheduledDate": "2026-04-30",
            "arrangedFrom": "2026-04-27",
            "isArrangedTask": True,
            "title": "arranged task",
        }
    )

    assert saved["date"] == "2026-04-30"
    assert saved["scheduledDate"] == "2026-04-30"
    assert saved["arrangedFrom"] == "2026-04-27"
    assert saved["isArrangedTask"] is True


def test_memory_entry_maps_legacy_fields_into_continuation_shape(tmp_path):
    repo = JsonRepository(tmp_path / "data")

    saved = repo.put_memory_entry(
        {
            "id": "memory-1",
            "taskId": "task-1",
            "date": "2026-04-25",
            "taskTitle": "continuation task",
            "completionDefinition": "2026-04-25 finished carryover modal multi-select",
            "projectPath": "D:\\projects\\daily_planning\\src",
            "fileList": ["src/app.js"],
            "comment": "legacy memory comment",
        }
    )

    assert saved["lastProgress"] == "2026-04-25 finished carryover modal multi-select"
    assert saved["projectPath"] == "D:\\projects\\daily_planning\\src"
    assert saved["fileList"] == ["src/app.js"]
    assert "completionDefinition" not in saved


def test_load_quotes_reads_json_file(tmp_path):
    quotes_file = tmp_path / "quotes.json"
    quotes_file.write_text(
        json.dumps(
            [
                {"text": "start quote", "type": "start", "enabled": True},
                {"text": "push quote", "type": "push", "enabled": False},
            ],
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    quotes = load_quotes(quotes_file)

    assert quotes[0]["text"] == "start quote"
    assert quotes[0]["type"] == "start"
    assert quotes[1]["enabled"] is False

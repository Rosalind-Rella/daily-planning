import json
import threading
from contextlib import contextmanager
from http.server import ThreadingHTTPServer
from urllib.request import Request, urlopen

import serve_app


def request_json(base_url, path, method="GET", payload=None):
    data = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json"

    request = Request(f"{base_url}{path}", data=data, headers=headers, method=method)
    with urlopen(request, timeout=5) as response:
        return json.loads(response.read().decode("utf-8"))


@contextmanager
def running_server(tmp_path):
    repo = serve_app.JsonRepository(tmp_path / "data")
    quotes_file = tmp_path / "quotes.json"
    quotes_file.write_text(
        json.dumps(
            [
                {"text": "start quote", "type": "start", "enabled": True},
                {"text": "push quote", "type": "push", "enabled": True},
            ],
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )

    old_repo = serve_app.REPOSITORY
    old_quotes = serve_app.QUOTES_FILE
    serve_app.REPOSITORY = repo
    serve_app.QUOTES_FILE = quotes_file

    server = ThreadingHTTPServer(("127.0.0.1", 0), serve_app.StudyDeskHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_address[1]}"
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)
        serve_app.REPOSITORY = old_repo
        serve_app.QUOTES_FILE = old_quotes


def test_quotes_and_task_routes(tmp_path):
    with running_server(tmp_path) as base_url:
        quotes = request_json(base_url, "/api/quotes")
        assert len(quotes["items"]) == 2
        assert quotes["items"][0]["type"] == "start"

        saved = request_json(
            base_url,
            "/api/tasks/task-1",
            method="PUT",
            payload={
                "date": "2026-04-25",
                "title": "task title",
                "priorityQuadrant": "important-urgent",
            },
        )
        assert saved["item"]["importance"] == 100
        assert saved["item"]["urgency"] == 100
        assert saved["item"]["scheduledDate"] == "2026-04-25"
        assert saved["item"]["arrangedFrom"] == ""
        assert saved["item"]["isArrangedTask"] is False

        tasks = request_json(base_url, "/api/tasks?date=2026-04-25")
        assert len(tasks["items"]) == 1
        assert tasks["items"][0]["title"] == "task title"


def test_task_route_preserves_explicit_arrange_metadata(tmp_path):
    with running_server(tmp_path) as base_url:
        saved = request_json(
            base_url,
            "/api/tasks/task-arranged",
            method="PUT",
            payload={
                "date": "2026-04-30",
                "scheduledDate": "2026-04-30",
                "arrangedFrom": "2026-04-27",
                "isArrangedTask": True,
                "title": "arranged task",
            },
        )

        assert saved["item"]["scheduledDate"] == "2026-04-30"
        assert saved["item"]["arrangedFrom"] == "2026-04-27"
        assert saved["item"]["isArrangedTask"] is True


def test_memory_route_returns_continuation_shape(tmp_path):
    with running_server(tmp_path) as base_url:
        request_json(
            base_url,
            "/api/memory/memory-1",
            method="PUT",
            payload={
                "taskId": "task-1",
                "date": "2026-04-25",
                "taskTitle": "task title",
                "completionDefinition": "progress text",
                "projectPath": "D:\\projects\\daily_planning\\src",
                "fileList": ["src/app.js"],
                "deadline": "2026-04-28",
            },
        )

        fetched = request_json(base_url, "/api/memory?taskId=task-1")
        assert fetched["item"]["lastProgress"] == "progress text"
        assert fetched["item"]["projectPath"] == "D:\\projects\\daily_planning\\src"
        assert fetched["item"]["deadline"] == "2026-04-28"

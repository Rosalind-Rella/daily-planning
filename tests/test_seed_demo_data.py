from pathlib import Path

from scripts.seed_demo_data import seed_demo_dataset


def test_seed_demo_dataset_creates_local_demo_payloads(tmp_path):
    data_dir = tmp_path / "data"
    quotes_file = tmp_path / "quotes.json"

    seed_demo_dataset(data_dir, quotes_file)

    assert (data_dir / "tasks.json").exists()
    assert (data_dir / "notes.json").exists()
    assert (data_dir / "records.json").exists()
    assert (data_dir / "memory_entries.json").exists()
    assert (data_dir / "time_blocks.json").exists()
    assert quotes_file.exists()

    tasks_payload = (data_dir / "tasks.json").read_text(encoding="utf-8")
    notes_payload = (data_dir / "notes.json").read_text(encoding="utf-8")
    records_payload = (data_dir / "records.json").read_text(encoding="utf-8")
    time_blocks_payload = (data_dir / "time_blocks.json").read_text(encoding="utf-8")

    assert "demo-task-review" in tasks_payload
    assert "demo-note-review-1" in notes_payload
    assert "Demo day:" in records_payload
    assert "morning" in time_blocks_payload

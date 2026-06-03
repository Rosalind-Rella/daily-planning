from pathlib import Path


def test_readme_is_structured_for_open_source_onboarding():
    readme = Path("README.md").read_text(encoding="utf-8")

    assert "## What It Is" in readme
    assert "## Quick Start" in readme
    assert "## Run Without LLM" in readme
    assert "## Optional LLM Setup" in readme
    assert "## Screenshots" in readme
    assert "## Data Model" in readme
    assert "## Roadmap" in readme
    assert "python scripts/seed_demo_data.py --force" in readme


def test_project_contains_public_open_source_basics():
    assert Path("LICENSE").exists()
    assert Path("CONTRIBUTING.md").exists()
    assert Path(".env.example").exists()
    assert Path("start_study_desk.bat").exists()
    assert Path("start_study_desk.sh").exists()
    assert Path(".github/workflows/ci.yml").exists()


def test_index_html_keeps_core_views():
    html = Path("index.html").read_text(encoding="utf-8")

    assert 'id="today-tab"' in html
    assert 'id="history-tab"' in html
    assert 'id="month-tab"' in html
    assert 'id="task-canvas"' in html
    assert 'id="time-block-slots"' in html
    assert 'id="detail-drawer"' in html


def test_env_example_documents_llm_keys():
    env_example = Path(".env.example").read_text(encoding="utf-8")

    assert "STUDY_DESK_GPT_5_2_API_KEY=" in env_example
    assert "STUDY_DESK_DEEPSEEK_V3_671B_API_KEY=" in env_example
    assert "STUDY_DESK_QWEN25_VL_INSTRUCT_API_KEY=" in env_example

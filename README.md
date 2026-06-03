# Study Desk

Study Desk is a local-first study planning workspace.

It combines:
- a draggable daily canvas
- a lightweight today time-block panel
- history review
- a monthly overview
- local JSON persistence through a tiny Python server

The public repo is prepared for demo and local use:
- real personal `data/*.json` is not included
- LLM is disabled by default
- the app still works fully for the local planning workflow without LLM

## What It Is

Study Desk is not a full calendar system and not a team project manager.

It is designed for a single user who wants to:
- lay out today’s study tasks visually
- decide when to push them in the morning / afternoon / evening
- carry tasks forward to another date
- keep notes and continuation context
- review progress by day and by month

## Quick Start

### Requirements

- Python 3.10 or newer

### Windows

Double-click:

```text
start_study_desk.bat
```

That script:
- starts `serve_app.py`
- disables LLM by default
- opens the browser at `http://127.0.0.1:4173/index.html`

### macOS / Linux

Use:

```bash
chmod +x start_study_desk.sh
./start_study_desk.sh
```

### One-Line Run

If you prefer the direct command:

```bash
python serve_app.py 4173 --disable-llm
```

Then open:

```text
http://127.0.0.1:4173/index.html
```

## Demo Seed

The repo does not ship with your personal task data.

If you want a non-empty first-run demo, seed local sample data with:

```bash
python scripts/seed_demo_data.py --force
```

Then start the app normally.

The seed script writes local demo content into `data/`:
- tasks
- notes
- daily records
- continuation entries
- time blocks

It does not commit those files to git.

## Run Without LLM

This is the default mode and the recommended public demo mode.

Command:

```bash
python serve_app.py 4173 --disable-llm
```

Behavior in this mode:
- no task chat UI
- no auto-generated daily summary draft
- no LLM summary options in arrange-to-date flow
- local planning workflow still works

## Optional LLM Setup

LLM is optional and disabled by default.

If you want to enable it, you must provide your own environment variables.

Available variables:
- `STUDY_DESK_GPT_5_2_API_KEY`
- `STUDY_DESK_DEEPSEEK_V3_671B_API_KEY`
- `STUDY_DESK_DEEPSEEK_R1_671B_API_KEY`
- `STUDY_DESK_QWEN_INSTRUCT_API_KEY`
- `STUDY_DESK_QWEN25_VL_INSTRUCT_API_KEY`

Example on PowerShell:

```powershell
$env:STUDY_DESK_GPT_5_2_API_KEY="your-key"
python serve_app.py 4173 --enable-llm
```

Example on bash:

```bash
export STUDY_DESK_GPT_5_2_API_KEY="your-key"
python serve_app.py 4173 --enable-llm
```

There is also an [.env.example](.env.example) file as a reference.

Note: the current server reads environment variables directly. It does not auto-load `.env`.

## Screenshots

Daily view:

![Study Desk Daily View](figures/daily.png)

Calendar view:

![Study Desk Calendar View](figures/calender.png)

## Main Features

### Daily Canvas

- create study cards
- drag cards freely
- resize cards
- archive tasks
- open a large right drawer for task editing

### Today Time Blocks

- fixed sections: morning / afternoon / evening
- tasks are referenced into time blocks, not moved out of the canvas
- one task can appear in multiple time blocks
- time blocks are for execution rhythm, not precise scheduling

### Arrange to Date

- carry a task forward to another date
- choose notes to carry
- choose continuation fields to carry
- preserve `scheduledDate`, `arrangedFrom`, `isArrangedTask`

### History

- review tasks by date
- review saved final summaries
- review notes and continuation context

### Month View

- month-wide aggregation
- overflow `+n`
- markers such as `↪ / ★ / ✓`
- click a day to inspect that date

## Data Model

Local runtime data is stored in `data/`.

Files:
- `tasks.json`
- `notes.json`
- `messages.json`
- `records.json`
- `memory_entries.json`
- `time_blocks.json`

`time_blocks.json` shape:

```json
{
  "2026-04-27": {
    "morning": ["task_a", "task_b"],
    "afternoon": ["task_c"],
    "evening": ["task_d"]
  }
}
```

The public repo only keeps `data/.gitkeep`.

## Project Structure

```text
daily_planning/
├─ data/
├─ docs/
├─ figures/
├─ icons/
├─ scripts/
├─ src/
├─ tests/
├─ .env.example
├─ .gitignore
├─ CONTRIBUTING.md
├─ LICENSE
├─ index.html
├─ manifest.webmanifest
├─ quotes.json
├─ serve_app.py
├─ start_study_desk.bat
├─ start_study_desk.sh
├─ styles.css
└─ sw.js
```

## Tests

Run:

```bash
python -m pytest tests -q
```

Current test coverage includes:
- API routes
- repository normalization
- static project files
- demo seed generation

## Roadmap

Current high-value next steps:
- improve onboarding with richer demo data and walkthroughs
- add more robust frontend regression coverage
- package a cleaner release workflow
- make LLM configuration safer and more modular
- improve mobile behavior and responsive layout stability

## License

This project is released under the MIT License.

See [LICENSE](LICENSE).

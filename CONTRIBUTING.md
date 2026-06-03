# Contributing

## Scope

This repo is a local-first planning app. Contributions should prefer:
- clear local workflows
- safe default configuration
- small, testable changes

## Setup

1. Install Python 3.10+
2. Seed demo data if you want a non-empty UI:

```bash
python scripts/seed_demo_data.py --force
```

3. Start the app:

```bash
python serve_app.py 4173 --disable-llm
```

## Tests

Run:

```bash
python -m pytest tests -q
```

## Secrets

Do not commit:
- real API keys
- personal `data/*.json`
- local debug output

LLM keys must come from environment variables only.

## Pull Requests

Good PRs usually include:
- a focused change
- updated docs if behavior changed
- tests for new behavior or regressions
- screenshots for visible UI changes when useful

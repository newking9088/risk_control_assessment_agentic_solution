# Contributing

## Development setup

```bash
git clone <repo>
cd risk_control_assessment_agentic_solution
make db-up db-schema db-seed
make start
```

## Branch naming

- `feat/<short-description>` — new feature
- `fix/<short-description>` — bug fix
- `chore/<short-description>` — tooling, deps, infra

## Pull requests

- Target `main`.
- Keep PRs focused — one logical change per PR.
- Include a test for new behaviour.
- CI must pass before merge.

## Commit messages

Use imperative mood: `Add risk rating step`, not `Added risk rating step`.

## Code style

- **Python:** `ruff` for linting and formatting (configured in `pyproject.toml`).
- **TypeScript:** ESLint with the project config.
- Run `make lint` before pushing.

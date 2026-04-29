# Contributing

## Branch model

| Branch | Purpose | Deploys to |
|--------|---------|------------|
| `main` | Production-ready; protected, requires PR + review | prod (via release) |
| `develop` | Integration branch for features | dev |
| `release/*` | Release candidates | qa → stage → prod |
| `feature/*` | Short-lived feature branches off `develop` | — |
| `fix/*` | Bug fixes off `develop` (hotfixes off `main`) | — |

## Commit style

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short summary>
```

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `ci`

**Scopes:** `backend`, `frontend`, `auth`, `db`, `infra`, `ci`

Examples:
```
feat(backend): add risk applicability LLM endpoint
fix(auth): set search_path to auth schema on connect
chore(ci): pin trivy to v0.50.0
```

Use imperative mood: `Add risk rating step`, not `Added risk rating step`.

## PR flow

1. Branch from `develop` (or `main` for hotfixes).
2. Keep PRs focused — one logical change per PR.
3. Ensure CI passes (lint, type-check, tests, build).
4. Fill in the PR template completely.
5. Request at least one review before merging.
6. Squash-merge into `develop`; preserve merge commits into `release/*`.

## Local setup

```bash
make install        # install all deps (uv sync --extra dev + npm ci)
make up             # start postgres + redis
make db-schema      # apply migrations
make db-seed        # seed demo data
make start          # start all services
make test           # run backend + frontend tests
make lint           # ruff + eslint
```

See `README.md` for full setup instructions.

## Code style

- **Python:** `ruff` for linting and formatting (configured in `pyproject.toml`).
- **TypeScript:** ESLint with the project config.
- Run `make lint` before pushing.

.PHONY: install db-up db-down db-schema db-seed db-fresh start stop logs ps test lint help

# ── Install ──────────────────────────────────────────────────────────────────
install:  ## Install all dependencies
	cd backend && uv sync --extra dev
	cd frontend && npm ci
	cd auth-service && npm ci

# ── Infrastructure ────────────────────────────────────────────────────────────
db-up:  ## Start DB and Redis containers
	docker compose up -d db redis

db-down:  ## Stop and remove containers
	docker compose down

db-schema:  ## Apply schema SQL files via docker exec
	@echo "Applying schema..."
	docker exec rca-db psql -U adminuser -d appdb -f /docker-entrypoint-initdb.d/001_app_schema.sql
	docker exec rca-db psql -U adminuser -d appdb -f /docker-entrypoint-initdb.d/002_auth_schema.sql

db-seed:  ## Seed demo users via auth-service
	cd auth-service && npx tsx src/seed.ts

db-fresh: db-down  ## Full DB reset: down, up, schema, seed
	docker compose up -d db redis
	@echo "Waiting for DB to be ready..."
	@until docker exec rca-db pg_isready -U adminuser -d appdb -q 2>/dev/null; do sleep 1; done
	$(MAKE) db-schema
	$(MAKE) db-seed

# ── Services ──────────────────────────────────────────────────────────────────
start: db-up  ## Start auth, backend, and frontend (logs to /tmp/rca-*.log)
	@until docker exec rca-db pg_isready -U adminuser -d appdb -q 2>/dev/null; do sleep 1; done
	cd auth-service && npm run dev > /tmp/rca-auth.log 2>&1 &
	cd backend && uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 > /tmp/rca-backend.log 2>&1 &
	cd frontend && npm run dev > /tmp/rca-frontend.log 2>&1 &
	@echo ""
	@echo "Services starting. Logs: /tmp/rca-{auth,backend,frontend}.log"
	@echo ""
	@echo "Demo logins:"
	@echo "  analyst@example.com  / Analyst1234!"
	@echo "  lead@example.com     / Lead1234!"
	@echo "  viewer@example.com   / Viewer1234!"

stop:  ## Stop all services and containers
	-pkill -f "uvicorn app.main" 2>/dev/null || true
	-pkill -f "tsx src/index" 2>/dev/null || true
	-pkill -f "vite" 2>/dev/null || true
	docker compose down

logs:  ## Tail all service logs
	tail -f /tmp/rca-backend.log /tmp/rca-auth.log /tmp/rca-frontend.log

ps:  ## Show running containers and service processes
	docker compose ps
	@pgrep -a -f "uvicorn|tsx src/index|vite" 2>/dev/null || true

fresh: stop db-fresh start  ## Full reset: stop, wipe DB, start fresh

# ── Quality ───────────────────────────────────────────────────────────────────
test:  ## Run backend and frontend tests
	cd backend && uv run pytest tests/ -v
	cd frontend && npm test -- --run

lint:  ## Run linters
	cd backend && uv run ruff check . && uv run black --check .
	cd frontend && npm run lint
	cd auth-service && npm run lint

# ── Help ──────────────────────────────────────────────────────────────────────
help:  ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
	  awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

.PHONY: install db-up db-down db-schema db-migrate db-seed db-fresh start backend frontend auth-service test lint

# ── Install ──────────────────────────────────────────────────────────────────
install:
	cd backend && uv sync
	cd frontend && npm ci
	cd auth-service && npm ci

# ── Infrastructure ────────────────────────────────────────────────────────────
db-up:
	docker compose up -d db redis

db-down:
	docker compose down

db-schema:
	@echo "Applying init SQL..."
	docker compose exec db psql -U postgres -d appdb -f /docker-entrypoint-initdb.d/001_app_schema.sql
	docker compose exec db psql -U postgres -d appdb -f /docker-entrypoint-initdb.d/002_auth_schema.sql

db-migrate:
	@echo "Running migrations..."
	@for f in backend/app/migrations/*.sql; do \
		echo "  $$f"; \
		docker compose exec -T db psql -U postgres -d appdb < $$f; \
	done

db-seed:
	cd auth-service && npx tsx src/seed.ts

db-fresh: db-down
	docker compose up -d db redis
	@echo "Waiting for DB..."
	@sleep 5
	$(MAKE) db-schema
	$(MAKE) db-migrate
	$(MAKE) db-seed

# ── Services ──────────────────────────────────────────────────────────────────
start: db-up
	@echo "Starting all services..."
	$(MAKE) auth-service &
	$(MAKE) backend &
	$(MAKE) frontend

backend:
	cd backend && uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

frontend:
	cd frontend && npm run dev

auth-service:
	cd auth-service && npm run dev

# ── Quality ───────────────────────────────────────────────────────────────────
test:
	cd backend && uv run pytest tests/ -v
	cd frontend && npm run test

lint:
	cd backend && uv run ruff check . && uv run black --check .
	cd frontend && npm run lint
	cd auth-service && npm run lint

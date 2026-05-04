.PHONY: install db-up db-down db-schema db-seed db-fresh start stop logs ps test lint fresh help

# ── Install ───────────────────────────────────────────────────────────────────
install:  ## Install all dependencies
	cd backend && uv sync --extra dev
	cd frontend && npm install --legacy-peer-deps
	cd auth-service && npm install --legacy-peer-deps

# ── Infrastructure ────────────────────────────────────────────────────────────
db-up:  ## Start DB and Redis containers
	docker compose up -d db redis

db-down:  ## Stop and remove containers
	docker compose down

db-schema:  ## Apply all SQL migrations (001–015) in order via docker exec
	@echo "Applying migrations..."
	@for f in \
	  001_app_schema.sql \
	  002_auth_schema.sql \
	  003_seed.sql \
	  004_control_catalog.sql \
	  005_taxonomy_evolution.sql \
	  006_assessment_scope.sql \
	  007_risk_applicability.sql \
	  008_unit_id_doc_category.sql \
	  009_rating_columns.sql \
	  010_demo_assessments.sql \
	  011_inherent_risk_dimensions.sql \
	  012_admin_tables.sql \
	  013_collaboration_tables.sql \
	  014_step1_2_tables.sql \
	  015_admin_user_seed.sql; do \
	  echo "  → $$f"; \
	  docker exec rca-db psql -U adminuser -d appdb -q \
	    -f /docker-entrypoint-initdb.d/$$f; \
	done
	@echo "Done."

db-seed:  ## Seed demo users via auth-service (analyst / lead / viewer / admin)
	cd auth-service && npm run seed

db-fresh: db-down  ## Full DB reset: down → up → all migrations → seed demo users
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
	@echo "  admin@rca.local      / Admin@1234     (admin)"
	@echo "  analyst@example.com  / Analyst1234!   (analyst)"
	@echo "  lead@example.com     / Lead1234!      (delivery_lead)"
	@echo "  viewer@example.com   / Viewer1234!    (viewer)"

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

fresh: stop db-fresh start  ## Full reset: stop everything, wipe DB, start fresh

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

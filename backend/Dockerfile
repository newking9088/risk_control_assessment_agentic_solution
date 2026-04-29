FROM python:3.13-slim AS builder
WORKDIR /app
RUN pip install uv
COPY pyproject.toml .
RUN uv sync --no-dev

FROM python:3.13-slim
ARG GIT_SHA="unknown"
ARG BUILD_DATE="unknown"
LABEL org.opencontainers.image.revision="${GIT_SHA}"
LABEL org.opencontainers.image.created="${BUILD_DATE}"

RUN groupadd -r appuser && useradd -r -m -g appuser appuser
WORKDIR /app
COPY --from=builder /app/.venv .venv
COPY app/ app/
ENV PATH="/app/.venv/bin:$PATH"
USER appuser
EXPOSE 8000
CMD ["gunicorn", "app.main:app", "-k", "uvicorn.workers.UvicornWorker", "-w", "4", "-b", "0.0.0.0:8000"]

import json
import logging
import time
from typing import Any

import bleach
from openai import OpenAI

from app.config.settings import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)

_client: OpenAI | None = None


def get_client() -> OpenAI:
    global _client
    if not _client:
        _client = OpenAI(
            api_key=settings.openai_api_key,
            base_url=settings.openai_api_url,
        )
    return _client


def _sanitize(text: str) -> str:
    return bleach.clean(text, tags=[], strip=True)


def respond_text(
    prompt: str,
    model: str | None = None,
    temperature: float | None = None,
    max_tokens: int = 2048,
) -> str:
    model = model or settings.openai_model
    temperature = temperature if temperature is not None else settings.openai_temperature
    prompt = _sanitize(prompt)

    for attempt in range(3):
        try:
            response = get_client().chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                temperature=temperature,
                max_tokens=max_tokens,
            )
            return response.choices[0].message.content or ""
        except Exception as exc:
            logger.warning("LLM attempt %d failed: %s", attempt + 1, exc)
            if attempt < 2:
                time.sleep(2**attempt)
    return ""


def respond_json(
    system: str,
    user_content: str,
    output_schema: dict | None = None,
    model: str | None = None,
) -> Any:
    model = model or settings.openai_model
    messages = [
        {"role": "system", "content": _sanitize(system)},
        {"role": "user", "content": _sanitize(user_content)},
    ]

    for attempt in range(3):
        try:
            kwargs: dict = dict(
                model=model,
                messages=messages,
                temperature=0.1,
                response_format={"type": "json_object"},
            )
            response = get_client().chat.completions.create(**kwargs)
            raw = response.choices[0].message.content or "{}"
            return json.loads(raw)
        except json.JSONDecodeError:
            logger.warning("JSON parse failed on attempt %d, retrying without format hint", attempt + 1)
            kwargs.pop("response_format", None)
        except Exception as exc:
            logger.warning("LLM JSON attempt %d failed: %s", attempt + 1, exc)
            if attempt < 2:
                time.sleep(2**attempt)
    return {}

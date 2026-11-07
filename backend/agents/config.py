"""Model, key, and path configuration for The Second Chance Pathway Planner agents.

Follows the Lecture 10 pattern (PydanticAI boss + worker agents sharing one model built in
agents/config.py). The original Lecture 10 file was not available, so this is a
reconstruction based on Homework 5's backend/config.py, which already worked with Portkey
and gpt-6-luna.

Course rules this file enforces (project_requirements.html):
  - The key is PORTKEY_API_KEY, spelled exactly.
  - The course key may only call gpt-6-luna, so every agent uses that one model.
  - .env is looked for in the repo root first, then in the folder one level above it.
"""

import os
from pathlib import Path

from dotenv import load_dotenv
from pydantic_ai.models.fallback import FallbackModel
from pydantic_ai.models.openai import OpenAIResponsesModel
from pydantic_ai.providers.openai import OpenAIProvider

AGENTS_DIR = Path(__file__).resolve().parent          # backend/agents/
BACKEND_DIR = AGENTS_DIR.parent                       # backend/
ROOT = BACKEND_DIR.parent                             # repo root
PROMPTS_DIR = BACKEND_DIR / "prompts"
DATA_DIR = BACKEND_DIR / "data"
RULES_DIR = BACKEND_DIR / "rules"
OUTPUT_DIR = ROOT / "output"
FRONTEND_DIST = ROOT / "frontend" / "dist"

MODEL_NAME = "gpt-6-luna"
PORTKEY_BASE_URL = "https://api.portkey.ai/v1"
API_KEY_NAME = "PORTKEY_API_KEY"

REQUEST_TIMEOUT_SECONDS = 90          # deadline for one attempt at one model request
MODEL_ATTEMPTS = 3                    # a timed-out or failed request is retried on gpt-6-luna

os.environ.setdefault("PYDANTIC_AI_NO_BANNER", "1")

_loaded_env_path: Path | None = None


def load_env() -> Path | None:
    """Load .env from the repo root, or else from the folder one level above it.

    Returns the path that was loaded (None if neither exists). Only these two places are
    checked, so a stray .env higher up the tree is never picked up by accident.
    """
    global _loaded_env_path
    for folder in (ROOT, ROOT.parent):
        env_path = folder / ".env"
        if env_path.exists():
            load_dotenv(env_path)
            _loaded_env_path = env_path
            return env_path
    _loaded_env_path = None
    return None


def loaded_env_path() -> Path | None:
    """The .env file load_env() last loaded, or None."""
    return _loaded_env_path


def api_key_found() -> bool:
    load_env()
    return bool(os.getenv(API_KEY_NAME, "").strip())


def require_api_key() -> str:
    """Return PORTKEY_API_KEY, or raise a clear error saying where .env was looked for."""
    load_env()
    api_key = os.getenv(API_KEY_NAME, "").strip()
    if not api_key:
        raise RuntimeError(
            f"{API_KEY_NAME} is not set. Put a .env containing it in the repo folder "
            "or the folder one level above it (see .env.example)."
        )
    return api_key


def _luna(api_key: str) -> OpenAIResponsesModel:
    return OpenAIResponsesModel(
        MODEL_NAME, provider=OpenAIProvider(api_key=api_key, base_url=PORTKEY_BASE_URL)
    )


def build_model() -> FallbackModel:
    """gpt-6-luna through Portkey (Responses API, needed for tools + structured output).

    Wrapped so a request that errors is retried, up to MODEL_ATTEMPTS times in total.
    Every attempt is gpt-6-luna; no other model is ever involved.
    """
    api_key = require_api_key()
    attempts = [_luna(api_key) for _ in range(MODEL_ATTEMPTS)]
    return FallbackModel(attempts[0], *attempts[1:])


def is_allowed_model(reported_name: str | None) -> bool:
    """True if a response's reported model is gpt-6-luna (allowing a suffix like -global)."""
    return bool(reported_name) and (
        reported_name == MODEL_NAME or reported_name.startswith(MODEL_NAME + "-")
    )

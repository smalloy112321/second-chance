"""The Second Chance Pathway Planner: FastAPI backend.

Run from the repo root:  python backend/main.py   then open http://127.0.0.1:8000

Serves the API under /api and the built React app (frontend/dist) at /.
"""

from __future__ import annotations

from typing import Literal

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from pydantic_ai import Agent, UsageLimitExceeded, UsageLimits

import usage
from agents import config

HOST = "127.0.0.1"
PORT = 8000

app = FastAPI(title="The Second Chance Pathway Planner")

Mode = Literal["self_serve", "caseworker"]

MODE_CONTEXT = {
    "self_serve": "The person is a woman planning her own reentry after incarceration in Connecticut.",
    "caseworker": "The person is a caseworker helping a client plan her reentry after incarceration in Connecticut.",
}

hello_agent = Agent(
    name="hello",
    instructions=(
        "You greet people who are starting to use The Second Chance Pathway Planner. "
        "Write two short, warm, plain-language sentences welcoming them and saying the planner "
        "will help check Clean Slate eligibility, build a 30-day plan, and practice conversations. "
        "Do not give legal advice. Do not use markdown."
    ),
)

_model = None


def _get_model():
    global _model
    if _model is None:
        _model = config.build_model()
    return _model


class HelloRequest(BaseModel):
    mode: Mode
    session_id: str = Field(min_length=8, max_length=64)


@app.get("/api/health")
def health() -> dict:
    found = config.api_key_found()
    env_path = config.loaded_env_path()
    if env_path is None:
        location = "not found"
    elif env_path.parent == config.ROOT:
        location = "repo folder"
    else:
        location = "one folder above the repo"
    return {
        "ok": True,
        "portkey_api_key_found": found,
        "env_location": location,
        "env_path": str(env_path) if env_path else None,
        "model": config.MODEL_NAME,
    }


@app.post("/api/hello")
async def hello(req: HelloRequest) -> dict:
    try:
        usage.check_session_cap(req.session_id)
    except usage.SessionTokenCapExceeded as exc:
        raise HTTPException(status_code=429, detail=str(exc))

    try:
        model = _get_model()
    except RuntimeError as exc:  # missing key: say so plainly, never echo a value
        raise HTTPException(status_code=503, detail=str(exc))

    remaining = usage.session_tokens_remaining(req.session_id)
    try:
        result = await hello_agent.run(
            MODE_CONTEXT[req.mode] + " Greet them.",
            model=model,
            usage_limits=UsageLimits(request_limit=2, total_tokens_limit=remaining),
        )
    except UsageLimitExceeded:
        raise HTTPException(status_code=429, detail="This session reached its token limit.")
    except Exception as exc:
        print(f"[hello] model call failed: {type(exc).__name__}: {str(exc)[:200]}")
        raise HTTPException(status_code=502, detail="The AI service did not respond. Please try again.")

    messages = result.new_messages()
    run_usage = usage.log_run("hello", messages, session_id=req.session_id)

    reported = [m.model_name for m in messages if getattr(m, "model_name", None)]
    if not all(config.is_allowed_model(name) for name in reported):
        raise HTTPException(status_code=502, detail="Unexpected model in response; reply discarded.")

    return {
        "reply": result.output.strip(),
        "mode": req.mode,
        "usage": run_usage,
        "session_tokens_used": usage.session_tokens_used(req.session_id),
        "session_token_cap": usage.SESSION_TOKEN_CAP,
    }


# ---- Built frontend (frontend/dist) -----------------------------------------------------
if (config.FRONTEND_DIST / "index.html").exists():
    app.mount("/assets", StaticFiles(directory=config.FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def frontend(path: str):
        if path.startswith("api/"):
            raise HTTPException(status_code=404)
        file = (config.FRONTEND_DIST / path).resolve()
        if path and file.is_file() and config.FRONTEND_DIST.resolve() in file.parents:
            return FileResponse(file)
        return FileResponse(config.FRONTEND_DIST / "index.html")
else:

    @app.get("/", include_in_schema=False)
    def no_frontend():
        return JSONResponse(
            {"error": "frontend/dist not found. Run: cd frontend && npm install && npm run build"},
            status_code=503,
        )


if __name__ == "__main__":
    config.load_env()
    print(f"Open http://{HOST}:{PORT}")
    uvicorn.run(app, host=HOST, port=PORT, reload=False)

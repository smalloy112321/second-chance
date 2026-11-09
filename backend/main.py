"""The Second Chance Pathway Planner: FastAPI backend.

Run from the repo root:  python backend/main.py   then open http://127.0.0.1:8000

Serves the API under /api and the built React app (frontend/dist) at /.
"""

from __future__ import annotations

import asyncio
import json
import os
from typing import Literal

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from pydantic_ai import Agent, UsageLimitExceeded, UsageLimits

import orchestrator
import practice_suggest
from agents import practice
import resources
import sessions
import usage
from agents import config

# Locally: http://127.0.0.1:8000. On a host like Render, set HOST=0.0.0.0; PORT is provided.
HOST = os.getenv("HOST", "127.0.0.1")
PORT = int(os.getenv("PORT", "8000"))
MAX_MESSAGE_CHARS = 8000  # room for pasted case notes

app = FastAPI(title="The Second Chance Pathway Planner")

Mode = Literal["self_serve", "caseworker"]
SessionId = Field(min_length=8, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")


Lang = Literal["en", "es", "pt"]


class ChatRequest(BaseModel):
    session_id: str = SessionId
    mode: Mode
    message: str = Field(min_length=1, max_length=MAX_MESSAGE_CHARS)
    lang: Lang = "en"
    record_only: bool = False  # self-serve: run the Clean Slate check now, build the plan later


class PlanRequest(BaseModel):
    session_id: str = SessionId
    mode: Mode = "self_serve"
    goals: list[str] = Field(default_factory=list, max_length=3)
    lang: Lang = "en"


class PracticeStartRequest(BaseModel):
    session_id: str = SessionId
    mode: Mode = "self_serve"
    scenario_id: str
    difficulty: Literal["friendly", "neutral", "skeptical"] = "friendly"
    lang: Lang = "en"


class PracticeTurnRequest(BaseModel):
    session_id: str = SessionId
    mode: Mode = "self_serve"
    message: str = Field(min_length=1, max_length=4000)
    lang: Lang = "en"


class PracticeEndRequest(BaseModel):
    session_id: str = SessionId
    mode: Mode = "self_serve"
    lang: Lang = "en"


class HelloRequest(BaseModel):
    mode: Mode
    session_id: str = SessionId


GENERIC_ERROR = "Something went wrong on our side. Please try again in a moment."


# ---- Health and smoke test ---------------------------------------------------------------


@app.get("/api/health")
def health() -> dict:
    found = config.api_key_found()
    env_path = config.loaded_env_path()
    if env_path is None:
        location = "host environment variable" if found else "not found"
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
        "daily_tokens_used": usage.daily_tokens_used(),
        "daily_token_cap": usage.DAILY_TOKEN_CAP,
    }


hello_agent = Agent(
    name="hello",
    instructions=(
        "Write two short, warm, plain-language sentences welcoming someone to The Second Chance "
        "Pathway Planner. Do not give legal advice. Do not use markdown."
    ),
)


@app.post("/api/hello")
async def hello(req: HelloRequest) -> dict:
    """One tiny gpt-6-luna call, to check the Portkey connection."""
    try:
        usage.check_session_cap(req.session_id)
        result = await hello_agent.run(
            "Greet them.", model=config.build_model(),
            usage_limits=UsageLimits(request_limit=2, total_tokens_limit=usage.session_tokens_remaining(req.session_id)),
        )
    except (usage.SessionTokenCapExceeded, UsageLimitExceeded):
        raise HTTPException(status_code=429, detail="This session reached its token limit.")
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    run_usage = usage.log_run("hello", result.new_messages(), session_id=req.session_id)
    return {"reply": result.output.strip(), "usage": run_usage}


# ---- Chat --------------------------------------------------------------------------------


@app.post("/api/chat")
async def chat(req: ChatRequest) -> dict:
    """Non-streaming version (for testing). Returns the final payload plus every event."""
    events: list[dict] = []

    async def collect(event: str, data: dict) -> None:
        events.append({"event": event, "data": data})

    try:
        final = await orchestrator.handle_message(req.session_id, req.mode, req.message, emit=collect, lang=req.lang, record_only=req.record_only)
    except Exception as exc:
        print(f"[chat] {type(exc).__name__}: {str(exc)[:300]}")
        raise HTTPException(status_code=502, detail=GENERIC_ERROR)
    return {**final, "events": events}


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n"


def _stream(label: str, work) -> StreamingResponse:
    """Run work(emit) and stream its events, then the final payload, as server-sent events."""
    queue: asyncio.Queue = asyncio.Queue()

    async def emit(event: str, data: dict) -> None:
        await queue.put((event, data))

    async def runner() -> None:
        try:
            final = await work(emit)
            await queue.put(("final", final))
        except Exception as exc:
            print(f"[{label}] {type(exc).__name__}: {str(exc)[:300]}")
            await queue.put(("error", {"message": GENERIC_ERROR, "kind": "server"}))
        finally:
            await queue.put(None)

    task = asyncio.create_task(runner())

    async def events():
        while True:
            item = await queue.get()
            if item is None:
                break
            yield _sse(*item)
        await task

    return StreamingResponse(
        events(), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/api/chat/stream")
async def chat_stream(req: ChatRequest) -> StreamingResponse:
    """Server-sent events: agent_started, agent_done, tool_called, verifier_issue,
    safety_block, error, and finally final."""
    return _stream("chat/stream", lambda emit: orchestrator.handle_message(req.session_id, req.mode, req.message, emit=emit, lang=req.lang, record_only=req.record_only))


@app.post("/api/plan/stream")
async def plan_stream(req: PlanRequest):
    """Build the 30-day plan from her goals (after the record check). Same live events as chat."""
    return _stream("plan/stream", lambda emit: orchestrator.build_plan(req.session_id, req.mode, req.goals, emit=emit, lang=req.lang))


# ---- Practice room -----------------------------------------------------------------------


@app.get("/api/practice/scenarios")
def practice_scenarios(session_id: str | None = None) -> dict:
    s = sessions.peek(session_id) if session_id else None
    return {
        "suggested": practice_suggest.suggest(s.profile) if s and s.stage == "done" else None,
        "scenarios": [
            {k: sc[k] for k in ("id", "title", "description", "setting")} | {"character": practice.character_name(sc)}
            for sc in practice.scenarios().values()
        ],
        "difficulties": list(practice.DIFFICULTIES),
        "max_turns": practice.MAX_TURNS,
    }


@app.post("/api/practice/start")
def practice_start(req: PracticeStartRequest) -> dict:
    if req.scenario_id not in practice.scenarios():
        raise HTTPException(status_code=404, detail="Unknown scenario.")
    return orchestrator.start_practice(req.session_id, req.mode, req.scenario_id, req.difficulty, lang=req.lang)


@app.post("/api/practice/turn")
async def practice_turn(req: PracticeTurnRequest) -> dict:
    """Non-streaming version (for testing)."""
    events: list[dict] = []

    async def collect(event: str, data: dict) -> None:
        events.append({"event": event, "data": data})

    try:
        final = await orchestrator.practice_turn(req.session_id, req.mode, req.message, emit=collect, lang=req.lang)
    except Exception as exc:
        print(f"[practice/turn] {type(exc).__name__}: {str(exc)[:300]}")
        raise HTTPException(status_code=502, detail=GENERIC_ERROR)
    return {**final, "events": events}


@app.post("/api/practice/turn/stream")
async def practice_turn_stream(req: PracticeTurnRequest) -> StreamingResponse:
    return _stream("practice/stream", lambda emit: orchestrator.practice_turn(req.session_id, req.mode, req.message, emit=emit, lang=req.lang))


@app.post("/api/practice/end/stream")
async def practice_end_stream(req: PracticeEndRequest) -> StreamingResponse:
    return _stream("practice/end", lambda emit: orchestrator.end_practice(req.session_id, req.mode, emit=emit, lang=req.lang))


@app.delete("/api/session/{session_id}")
def clear_session(session_id: str) -> dict:
    """'Clear my info': forget the conversation and profile held in memory."""
    return {"cleared": sessions.delete(session_id)}


@app.get("/api/usage/{session_id}")
def session_usage(session_id: str) -> dict:
    return usage.session_summary(session_id)


@app.get("/api/examples")
def examples() -> dict:
    """Sample results for the /?examples page (report screenshots). Rules engine only, no AI."""
    from examples import example_results

    return {"examples": example_results()}


@app.get("/api/resources")
def all_resources() -> dict:
    """The checked resource list, keyed by id; the frontend shows contact details from here."""
    return {"resources": resources.by_id()}


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
        if "." in path.rsplit("/", 1)[-1]:  # a missing file (e.g. hero-photo.jpg) is a 404, not the app
            raise HTTPException(status_code=404)
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
    print(f"Open http://{'127.0.0.1' if HOST == '0.0.0.0' else HOST}:{PORT}")
    uvicorn.run(app, host=HOST, port=PORT, reload=False)

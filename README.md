# The Second Chance Pathway Planner

A web app that helps formerly incarcerated women in Connecticut, on their own or with a caseworker, check whether their record may have been erased under CT's Clean Slate law, build a 30-day reentry plan, and practice hard conversations.

> **Status:** skeleton only. The landing page, a health check, one test call to gpt-6-luna, and the token meter work. The agents are not built yet.

## Run it

You only need Python 3.11+. The frontend is already built and committed in `frontend/dist`, so you don't need Node.

1. Create a virtual environment (from the repo folder):

   ```bash
   python3 -m venv .venv
   source .venv/bin/activate        # Windows: .venv\Scripts\activate
   ```

2. Install the requirements:

   ```bash
   pip install -r backend/requirements.txt
   ```

3. Start the app:

   ```bash
   python backend/main.py
   ```

4. Open <http://127.0.0.1:8000>.

### The `.env` file

The app needs `PORTKEY_API_KEY` (see `.env.example`). It looks for `.env` in the **repo folder first**, then in the **folder one level above the repo**, so the course `.env` can sit next to the repo folder without being copied in. Check which one loaded at <http://127.0.0.1:8000/api/health>.

All AI calls use `gpt-6-luna` through Portkey. The model is set in `backend/agents/config.py`.

## What's in the repo

| Path | What it does |
| --- | --- |
| `backend/main.py` | FastAPI app: `GET /api/health`, `POST /api/hello`, and serves `frontend/dist` |
| `backend/agents/config.py` | `MODEL_NAME`, `.env` loading, `require_api_key()`, `build_model()` |
| `backend/usage.py` | Token meter: appends one row per model call to `output/usage_log.json`; per-session cap of 50,000 tokens |
| `backend/prompts/`, `backend/data/`, `backend/rules/` | Empty for now |
| `frontend/` | React + Vite + TypeScript source; `frontend/dist` is the built app |
| `output/` | Run logs (`*.json` here are not committed) |

## Changing the frontend (developers only)

```bash
cd frontend
npm install
npm run dev      # http://localhost:5173, forwards /api to the backend on port 8000
npm run build    # rebuilds frontend/dist; commit it afterwards
```

## Stopping the server

Press `Ctrl+C` in the terminal running `python backend/main.py`. If port 8000 is still busy (macOS):

```bash
lsof -i :8000
kill -9 <pid>
```

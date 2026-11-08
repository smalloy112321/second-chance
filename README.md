# The Second Chance Pathway Planner

**Live app:** https://second-chance-pathway-planner.onrender.com (free hosting: the first visit after a quiet period can take about a minute to wake up)

A web app that helps formerly incarcerated women in Connecticut, on their own or with a caseworker, check whether their record may have been erased under CT's Clean Slate law, build a 30-day reentry plan, and practice hard conversations.

> **Status:** the planner (five agents + Clean Slate rules engine) and the Practice Room work end to end.

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

## Try it

Pick **I'm helping a client** and paste one of these notes (or use **I'm planning for myself** and answer one question at a time):

1. **Likely erased:** "Client lives in New Haven. One misdemeanor (shoplifting), offense 2012-01-20, convicted 2012-03-01. Not family violence, not a sex offense, not DUI, not cannabis. Not on probation or parole. No pending cases. All sentences finished. One child, age 7, lives with her grandmother; no family court case. Staying with a friend tonight and this month. Has birth certificate and SS card but no state ID. No income. Goals: get ID, apply for SNAP, find work in food service."
2. **Eligible on a future date:** "Client: Hartford. Class D felony larceny 3rd, offense Nov 2013, convicted 2014-01-10; misdemeanor breach of peace, offense April 2020, convicted 2020-05-05. Neither is family violence, sex offense, DUI, or cannabis. Not on probation or parole. No pending cases. All sentences complete. Two children (4 and 9) in DCF foster care; open family court case. In a shelter tonight and this month. Has SS card only. No income. Goals: get kids back, stable housing, a job." (Expected: misdemeanor on or after 2027-05-05, felony on or after 2030-05-05.)
3. **Needs review:** "Client lives in Waterbury. One felony from around 2016 (drug sale; she doesn't know the class or maximum sentence). Not family violence or a sex offense, not DUI, not cannabis. Finished parole in 2021, not on supervision, no pending cases, all sentences complete. No children. Staying with her sister tonight and this month. Has state ID, birth certificate, and SS card. Works part-time. Goals: clear her record, full-time work, own apartment."

A full run takes about a minute and costs well under one cent. Each agent lights up in the **Agent activity** panel as it runs.

## Practice Room

Rehearse a hard conversation with a role-play partner while a coach scores each answer on five skills (honest, brief, ownership, looking forward, calm) and suggests a "Try saying…" rewrite.

- **Get there:** "Just practice a conversation" on the landing page, or "Practice a conversation" on the results screen (uses that session's Clean Slate result). Caseworkers can copy a client link with a scenario preselected.
- **Scenarios:** job interview (Dana), apartment application (Mr. Reyes), reunification meeting (Ms. Carter), each friendly / neutral / skeptical. Up to 5 answers, then a summary.
- **Privacy:** the role-play partner and coach only see her first name, job goal, town, whether she has kids, the mode, and the disclosure guidance. Never conviction details.
- **Guards in code:** a suggested answer that denies having a record is replaced unless her record is likely erased (job interview only); legal facts are limited to `backend/data/legal_facts.json` and shown from that file; scores are clamped to 1–3; the summary's quote must be words she said.
- Type "pause" or use **Pause**; the 🎤 button (shown when the browser supports speech-to-text) fills in her spoken answer.

## Example results (for screenshots)

Open <http://127.0.0.1:8000/?examples> (or the live link with `/?examples`) to see what the "Your results" step shows for eight sample answers: likely erased, partly erased, expected on a date, waiting on probation, not covered, needs review, court petition, and cannabis law. It uses only the rules engine and the fixed next steps, so it costs nothing and matches the app exactly.

## How it works

`safety_guard → intake (until complete) → screener → planner → verifier`. Every message goes through the safety guard first. If the verifier rejects the plan, the planner revises once; if it is still rejected, the plan is shown with a "Needs human review" banner.

| Path | What it does |
| --- | --- |
| `backend/main.py` | FastAPI app: `/api/chat`, `/api/chat/stream` (live events), `/api/usage/{session_id}`, `/api/resources`, `/api/session/{id}` (Clear my info), `/api/health`; serves `frontend/dist` |
| `backend/orchestrator.py` | Runs the agents in order, with the single revision loop |
| `backend/agents/` | One file per agent, plus `config.py` (model + `.env`), `runtime.py` (token cap, logging, live events), `reference.py` (cached prompt prefix) |
| `backend/prompts/` | Agent instructions; `_shared.md` is added to every agent |
| `backend/rules/clean_slate.py` | Clean Slate rules engine (plain Python, no AI); spec in `clean_slate_rules_spec.md` |
| `backend/data/ct_resources.json` | 40 checked Connecticut resources; contact details are shown from here, never written by the AI |
| `backend/data/prices.json` | gpt-6-luna prices used for the cost estimate (MGT 409 Lecture 11) |
| `backend/usage.py`, `backend/audit.py` | Token log (`output/usage_log.json`, 150,000-token cap per session) and audit trail (`output/audit_trail.json`); rows are only ever added |
| `backend/agents/practice.py` | Practice Room: role-play, coach, and summary agents plus their code guards; scenarios in `backend/data/scenarios.json` |
| `backend/tests/` | Rules engine (14 spec cases + 1), safety guard, verifier code checks, screener guards, intake history, Practice Room guards and privacy, prompt rendering |
| `frontend/` | React + Vite + TypeScript source; `frontend/dist` is the built app |
| `frontend/src/Logo.tsx` | The "road to the horizon" logo; colors are navy `#122056`, periwinkle `#5865DC`, lavender `#EEEFFD`, nude `#F2E6E1` on `#FAFAFD` |

## Running the tests

```bash
pip install -r backend/requirements-dev.txt
python -m pytest -v
```

The self-serve questionnaire has its own small tests (plain Node, no extra packages):

```bash
node frontend/src/qaForm.test.ts
node frontend/src/qaRules.test.ts
node frontend/src/resultsDisplay.test.ts
```

## Changing the frontend (developers only)

The only frontend dependency beyond React is `@fontsource/outfit` (SIL Open Font License), which bundles the Outfit font used for the logo and headings, so the site makes no requests to outside font services.

```bash
cd frontend
npm install
npm run dev      # http://localhost:5173, forwards /api to the backend on port 8000
npm run build    # rebuilds frontend/dist; commit it afterwards
```

## Hosting online (Render)

`render.yaml` deploys the app as one free Render web service.

1. Sign in at [render.com](https://render.com) with GitHub.
2. **New → Blueprint**, pick this repository, and click **Apply**.
3. When Render asks for `PORTKEY_API_KEY`, paste the key there. It is stored as a Render secret, never in the repo.
4. Wait for the deploy to finish, then open the `onrender.com` link. `/api/health` should show `"portkey_api_key_found": true`.

Notes: the free plan sleeps after about 15 minutes idle, so the first visit can take about a minute. Sessions are kept in memory and the logs in `output/` are reset on each deploy. `DAILY_TOKEN_CAP` (default 2,000,000 tokens per UTC day across all visitors) stops a public link from running up the key.

## Stopping the server

Press `Ctrl+C` in the terminal running `python backend/main.py`. If port 8000 is still busy (macOS):

```bash
lsof -i :8000
kill -9 <pid>
```

# Tokenomics: measured from real runs

Source: `output/usage_log.json` on the local server, November 7–9, 2026 (one row per model call, as reported by Portkey). Raw numbers per run are in [token-runs.json](token-runs.json). Prices are from `backend/data/prices.json` (gpt-6-luna, MGT 409 Lecture 11): input $0.10, cached input $0.01, output $0.50 per million tokens.

## How the runs were counted

- 21 complete planner runs were logged. **7 were excluded** because every model call matched an earlier run token-for-token and finished in about 2 seconds instead of 25–60. These were Portkey returning a stored answer for an identical request (my scripted screenshot runs sent identical answers), not new model calls.
- That leaves **14 distinct real runs**. Two of them are outliers from the earlier chat-style intake that asked follow-up questions one at a time (24 and 44 model calls). The **12 typical runs** below use the current one-message questionnaire or a single paste of case notes.

## One planner run (12 typical runs)

| | Median | Range |
|---|---|---|
| Input tokens (includes cached) | 25,810 | — |
| Cached input tokens | 10,478 | — |
| Output tokens | 4,567 | — |
| **Total tokens** | **30,377** | 19,738 – 44,224 |
| **Cost** | **$0.0037** | $0.0023 – $0.0056 |
| Time | about 25–60 seconds | |

Where the tokens go: planner 51%, verifier 26%, intake 9%, screener 9%, safety guard 4%.

The verifier's decisions (from `output/audit_trail.json`): 6 plans were approved first time; 4 were sent back once, revised and then approved; 2 still had a problem after the one allowed revision and were shown with the "Needs human review" banner. Runs with a revision cost more (about $0.005 versus $0.0025).

## One Practice turn

6 Practice sessions: median about 3,500 tokens and **$0.0006 per answer** (the coach and role-play partner run on every answer, and the summary runs once at the end).

## Cost per user and at scale

Assumption for a typical user per month: 2 planner runs (her first check, plus one after her record check or a change) and 2 Practice sessions of 5 answers.

| | Per month |
|---|---|
| One user | 2 × $0.0037 + 10 × $0.0006 = **about $0.013** |
| 100 users | **about $1.34** |
| 10,000 users | **about $134** |

The AI cost is tiny next to everything else. At 10,000 users the real costs would be hosting (the free Render plan sleeps and keeps sessions in memory, so a paid plan is needed, from about $7–25 per month), keeping the 40 resources checked (staff time), and support.

Guardrails on spending already in the app: a 150,000-token cap per session and a 2,000,000-token cap per day across all visitors (`DAILY_TOKEN_CAP`).

## What cut the cost, and did it hurt quality?

1. **Cached prompt prefix** (`backend/agents/reference.py`). The rules, resource list and shared instructions sit at the start of every prompt in the same order, so the model provider bills them at the cached rate. **45% of all input tokens were cached.** Without caching, the median run would cost $0.0049 instead of $0.0037, about **25% more**. Caching changes only the price, not what the model sees, so quality is the same by design.
2. **One message instead of a chat.** The questionnaire sends all answers at once. The old chat-style intake took 24–44 model calls and 54,000–100,000 tokens. The current flow takes 6–11 calls and about 30,000 tokens, **about a third to a half of the cost** (only 2 old runs were measured, so treat this as rough). Quality went up, not down: every required fact is always asked (no more looping), and the felony-class question removed most "Needs review" results.
3. **The rules engine is plain Python.** Clean Slate eligibility is decided by code (`backend/rules/clean_slate.py`, 16 tests), not by the model. That costs nothing and can't be talked into a wrong answer.
4. **Contact details never go to the model.** The model only sees resource ids and names; phone numbers, addresses and notes are filled in from the checked list. That means fewer tokens and no invented phone numbers.

Quality checks that don't depend on the model: Clean Slate results come from the rules engine (same answer every time for the same facts), and contact details come from the checked list. The model-written plan is checked by the verifier on every run (10 of 12 approved, 2 flagged for human review), so a weaker plan is caught rather than shown as if it were fine.

## Update: after the November 9 changes (two-step self-serve, three languages)

On November 9 self-serve was split into two steps (the record check first, then the plan after she adds her goals), the planner's instructions gained three lines, and the site gained Spanish and Portuguese. Fresh local runs the same day (Portkey replays excluded the same way):

| Run | Model calls | Total tokens | Cost |
|---|---|---|---|
| English self-serve, two-step, no revision (2 runs) | 7 | 22,161 – 22,824 | $0.0028 – $0.0031 |
| Spanish self-serve, two-step | 8 | 31,065 | $0.0045 |
| Portuguese self-serve, two-step, one revision | 10 | 40,940 | $0.0055 |
| Caseworker, one pass | 6 | 25,627 | $0.0045 |
| English one-pass runs earlier that day (3 runs; one revised) | 6 – 9 | 22,080 – 43,108 | $0.0036 – $0.0066 |

What changed:
- **The two-step flow did not raise the cost.** It adds one small safety check on her goals (about 1,000 tokens), but the English self-serve runs came in at about $0.003, slightly below the earlier median of $0.0037.
- **Spanish and Portuguese cost more**, roughly 1.4–1.8 times English in these few runs: answers in those languages use more tokens, and the agents get a short language instruction. Per user that is still about 1–2 cents a month.
- **Revisions are still the biggest swing.** A run where the verifier sends the plan back once costs about 1.5–2 times a run that passes first time.

These are small samples (one to two runs per row); treat them as indicative. Raw numbers: `docs/evidence/token-runs-nov9.json`.

# Practice room: end-of-session summary

The practice conversation is over. Summarize her progress across all turns.

<turns>{turns_json}</turns>   (each turn: partner line, her answer, coach scores)
Mode: {mode}

Write:
- self_serve: 3 short sentences: what got better, her strongest moment (quote a phrase she said), and one thing to practice next. Warm, specific, no scores in the text.
- caseworker: total and per-skill average scores, trend (first answer vs last), and one recommended next scenario.

## Output (structured)
{
  "summary": "...",
  "best_quote": "a short phrase she actually said",
  "practice_next": "scenario id or skill",
  "score_first": number,
  "score_last": number
}

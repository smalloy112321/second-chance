export type Mode = 'self_serve' | 'caseworker'

export type Tokens = {
  model_calls?: number
  input_tokens: number
  cached_input_tokens: number
  output_tokens: number
  total_tokens: number
}

export type Resource = {
  id: string
  name: string
  category: string
  description: string
  serves: string
  towns: string[]
  phone: string | null
  website: string | null
  address: string | null
  verified_source: string
  verified_on: string
  notes: string
}

export type RulesConviction = {
  id: string
  description: string
  status: string
  wait_years: number | null
  eligible_on: string | null
  reason_code: string
  plain_meaning: string
  rule_source: string
}

export type RulesResult = {
  overall: string
  eligible_on_earliest: string | null
  convictions: RulesConviction[]
  assumptions: string[]
  next_steps: string[]
  disclaimer: string
}

export type Screener = {
  headline: string
  explanation: string
  next_step_codes: string[]
  disclosure_guidance: string
}

export type PlanStep = {
  step_id: string
  action: string
  why: string
  resource_id: string | null
  priority: 'high' | 'medium' | 'low'
}

export type Plan = { summary: string; weeks: { week: number; focus: string; steps: PlanStep[] }[] }

export type VerifierIssue = { step_id: string | null; check: string; problem: string; fix: string; source: string }

export type NextStep = { code: string; title: string; detail: string; resource_ids: string[]; links?: { label: string; url: string }[] }

export type ResultPayload = {
  type: 'result'
  rules: RulesResult
  screener: Screener
  plan: Plan
  verifier: { approved: boolean; issues: VerifierIssue[] }
  needs_human_review: boolean
  next_steps: NextStep[]
  resources: Record<string, Resource>
}

export type FinalPayload =
  | ResultPayload
  | { type: 'question'; reply: string; missing_fields: string[] }
  | { type: 'safety'; status: string; crisis_type: string | null; message: string; resources: Resource[] }
  | { type: 'limit'; reply: string }
  | { type: 'info'; reply: string; result?: ResultPayload }

export type ChatMessage =
  | { role: 'user' | 'assistant'; text: string }
  | { role: 'safety'; text: string; resources: Resource[] }
  | { role: 'error'; text: string }

export const AGENTS = ['safety_guard', 'intake', 'screener', 'planner', 'verifier'] as const
export const PRACTICE_AGENTS = ['safety_guard', 'coach', 'roleplay', 'coach_summary'] as const
export type AgentName = string

export const AGENT_LABEL: Record<string, string> = {
  safety_guard: 'Safety guard',
  intake: 'Intake',
  screener: 'Clean Slate screener',
  planner: 'Pathway planner',
  verifier: 'Verifier',
  coach: 'Coach',
  roleplay: 'Role-play partner',
  coach_summary: 'Session summary',
  app: 'App',
}

export type AgentState = { status: 'idle' | 'running' | 'done' | 'blocked'; summary: string; tokens: number }

export type ActivityItem = { id: number; agent: string; kind: 'start' | 'done' | 'tool' | 'issue' | 'block' | 'error'; text: string }

export type Usage = {
  overall: Tokens & { estimated_cost_usd: number }
  session_token_cap: number
}

// ---- Practice room ----

export type Difficulty = 'friendly' | 'neutral' | 'skeptical'

export type ScenarioCard = { id: string; title: string; description: string; setting: string; character: string }

export type CoachCard = {
  scores: Record<string, number>
  strength: string
  tip: string
  try_saying: string
  legal_fact_used: string | null
  skills: string[]
  legal_fact: { id: string; text: string; source: string } | null
  guards: { guard: string; detail: string }[]
}

export type PracticeSummary = {
  summary: string
  best_quote: string
  practice_next: string
  score_first: number
  score_last: number
  max_score: number
  turns: number
}

export type PracticeFinal =
  | { type: 'turn' | 'ended'; turn_number: number; max_turns: number; partner: { name: string; line: string }; coach: CoachCard; ended: boolean; summary?: PracticeSummary }
  | { type: 'ended'; summary: PracticeSummary | null; reply?: string }
  | { type: 'paused'; reply: string }
  | { type: 'safety'; status: string; crisis_type: string | null; message: string; resources: Resource[] }
  | { type: 'limit' | 'error'; reply: string }

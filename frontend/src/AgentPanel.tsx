import { AGENTS, AGENT_LABEL, type ActivityItem, type AgentName, type AgentState } from './types'

const STATUS_TEXT: Record<AgentState['status'], string> = {
  idle: 'Waiting',
  running: 'Working…',
  done: 'Done',
  blocked: 'Stopped this message',
}

export default function AgentPanel({
  agents,
  activity,
  open,
  onToggle,
}: {
  agents: Record<AgentName, AgentState>
  activity: ActivityItem[]
  open: boolean
  onToggle: () => void
}) {
  return (
    <aside className={`agent-panel ${open ? 'is-open' : ''}`} aria-label="Agent activity">
      <button type="button" className="panel-toggle" aria-expanded={open} onClick={onToggle}>
        <span>Agent activity</span>
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="panel-body">
          <ol className="agent-list">
            {AGENTS.map((name, i) => {
              const a = agents[name]
              return (
                <li key={name} className={`agent agent-${a.status}`}>
                  <span className="agent-dot" aria-hidden="true">{i + 1}</span>
                  <div className="agent-text">
                    <div className="agent-name">
                      {AGENT_LABEL[name]} <span className="agent-status">{STATUS_TEXT[a.status]}</span>
                    </div>
                    {a.summary && <div className="agent-summary">{a.summary}</div>}
                    {a.tokens > 0 && <div className="agent-tokens">{a.tokens.toLocaleString()} tokens</div>}
                  </div>
                </li>
              )
            })}
          </ol>
          <h3 className="log-title">Log</h3>
          <ul className="activity-log" aria-live="polite">
            {activity.length === 0 && <li className="log-empty">Agent steps will show here as they run.</li>}
            {activity.slice(-40).map((item) => (
              <li key={item.id} className={`log-${item.kind}`}>
                <span className="log-agent">{AGENT_LABEL[item.agent as AgentName] ?? item.agent}</span> {item.text}
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  )
}

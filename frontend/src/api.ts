import type { Mode, Resource, Usage } from './types'

export type StreamEvent = { event: string; data: any }

/** POST /api/chat/stream and call onEvent for each server-sent event. */
export async function streamChat(
  body: { session_id: string; mode: Mode; message: string },
  onEvent: (e: StreamEvent) => void,
): Promise<void> {
  const res = await fetch('/api/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok || !res.body) {
    const detail = await res.json().catch(() => ({}))
    const msg = Array.isArray(detail.detail) ? 'Please check your message and try again.' : detail.detail
    throw new Error(msg || `Request failed (${res.status}).`)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let sep: number
    while ((sep = buffer.indexOf('\n\n')) >= 0) {
      const chunk = buffer.slice(0, sep)
      buffer = buffer.slice(sep + 2)
      let event = 'message'
      const data: string[] = []
      for (const line of chunk.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) data.push(line.slice(5).trim())
      }
      if (data.length) onEvent({ event, data: JSON.parse(data.join('\n')) })
    }
  }
}

export async function clearSession(sessionId: string): Promise<void> {
  await fetch(`/api/session/${encodeURIComponent(sessionId)}`, { method: 'DELETE' }).catch(() => undefined)
}

export async function fetchUsage(sessionId: string): Promise<Usage | null> {
  const res = await fetch(`/api/usage/${encodeURIComponent(sessionId)}`).catch(() => null)
  return res && res.ok ? res.json() : null
}

export async function fetchResources(): Promise<Record<string, Resource>> {
  const res = await fetch('/api/resources').catch(() => null)
  if (!res || !res.ok) return {}
  return (await res.json()).resources
}

export function newSessionId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

import type { AgentNode, Entry, LiveAgent, Node, WorkNode } from '../types'

// Entries (oldest first) → nodes on the line. `session` is this session's id; `live` holds its running agents.
export function buildNodes(
  entries: readonly Entry[],
  live: Readonly<Record<string, LiveAgent>>,
  session: string,
  now: number,
): Node[] {
  const nodes: Node[] = []
  const tags = new Map<string, number>()
  const lastWork = new Map<string, WorkNode>()
  const agents = new Map<string, AgentNode>()
  const startedIn = new Map<string, string>() // agent id → session that started it

  for (const e of entries) {
    if (e.kind === 'talk' || e.kind === 'session') {
      nodes.push({ kind: e.kind, at: e.at, title: e.title })
      // A closed session's agents with no end entry are no longer running there.
      if (e.kind === 'session' && e.event === 'close') {
        for (const card of agents.values()) {
          if (card.state === 'running' && !live[card.id] && startedIn.get(card.id) === e.session) {
            card.state = 'unknown'
            delete card.now
          }
        }
      }
    } else if (e.kind === 'fact') {
      const card = e.attachTo ? lastWork.get(e.attachTo) : undefined
      if (card) card.facts.push(e.title)
      else nodes.push({ kind: 'fact', at: e.at, title: e.title })
    } else if (e.kind === 'work' && e.agentId) {
      const card = agents.get(e.agentId)
      if (!card) continue
      if (e.next) card.next = e.next
      if (e.total !== undefined) {
        card.total = e.total
        card.done = e.done ?? 0
      }
    } else if (e.kind === 'work') {
      const task = e.task ?? 'task'
      const tag = tags.get(task) ?? tags.size + 1
      tags.set(task, tag)
      const card: WorkNode = { kind: 'work', at: e.at, title: e.title, task, tag, status: e.status ?? 'active', facts: [] }
      if (e.total !== undefined) {
        card.total = e.total
        card.done = e.done ?? 0
      }
      if (e.how) card.how = e.how
      if (e.next) card.next = e.next
      lastWork.set(task, card)
      nodes.push(card)
    } else if (e.kind === 'agent' && e.agent) {
      const a = e.agent
      if (a.phase === 'start') {
        const parent = a.parentAgentId ? agents.get(a.parentAgentId) : undefined
        const run = live[a.id]
        const card: AgentNode = {
          kind: 'agent',
          at: e.at,
          id: a.id,
          title: e.title,
          depth: parent ? Math.min(parent.depth + 1, 4) : 1,
          type: a.type ?? 'agent',
          model: a.model ?? 'unknown',
          isPinned: a.isPinned ?? false,
          isBackground: a.isBackground ?? false,
          // Another session's agent without an end entry is still running there; ours without live state lost it to a reload.
          state: run || e.session !== session ? 'running' : 'unknown',
          tools: run?.tools ?? 0,
        }
        if (run) {
          card.elapsedMs = now - run.startedAt
          if (run.now) card.now = run.now
        }
        if (a.prompt) card.prompt = a.prompt
        agents.set(a.id, card)
        startedIn.set(a.id, e.session)
        nodes.push(card)
      } else {
        const card = agents.get(a.id)
        if (!card) continue
        delete card.result
        delete card.tokens
        delete card.elapsedMs
        card.state = a.status ?? 'done'
        delete card.now
        if (a.durationMs !== undefined) card.elapsedMs = a.durationMs
        if (a.tools !== undefined) card.tools = a.tools
        if (a.tokens !== undefined) card.tokens = a.tokens
        if (a.result) card.result = a.result
      }
    }
  }
  return nodes
}

// Header line: repo, then counts of tasks by their latest status (subagent logs excluded).
export function summarize(entries: readonly Entry[], repo: string, bad: number): string {
  const latest = new Map<string, string>()
  for (const e of entries) if (e.kind === 'work' && !e.agentId) latest.set(e.task ?? 'task', e.status ?? 'active')
  const parts = [repo]
  if (latest.size) {
    const count = (status: string) => [...latest.values()].filter(v => v === status).length
    parts.push(`${latest.size} task${latest.size === 1 ? '' : 's'}`, `${count('done')} done`, `${count('blocked')} blocked`, `${count('active')} active`)
  } else {
    parts.push('no milestones logged yet')
  }
  if (bad) parts.push(`${bad} line${bad === 1 ? '' : 's'} unreadable`)
  return parts.join(' · ')
}

// Page 0 is the newest `size` nodes; out-of-range pages clamp.
export function paginate(nodes: readonly Node[], page: number, size: number): { nodes: Node[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(nodes.length / size))
  const clamped = Math.min(Math.max(0, page), pages - 1)
  const end = nodes.length - clamped * size
  return { nodes: nodes.slice(Math.max(0, end - size), end), page: clamped, pages }
}

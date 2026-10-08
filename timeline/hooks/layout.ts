import type { AgentNode, Entry, HistoryRow, LiveAgent, Node, Panel, Task, WorkNode } from '../types'
import { currentGroup, type Plan } from './plan.ts'
import { isBlocked } from './tasks.ts'

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

const NEXT_SHOWN = 5
const DAY_MS = 24 * 60 * 60 * 1000

function historyRow(node: Node): HistoryRow {
  if (node.kind === 'agent') {
    const glyph = { running: '▶', done: '✓', failed: '⚠', unknown: '·' }[node.state]
    const tone = ({ running: 'run', done: 'ok', failed: 'warn', unknown: 'dim' } as const)[node.state]
    const result = node.result ? ` → ${node.result}` : ''
    return { at: node.at, glyph, text: `${node.type} · ${node.model} — ${node.title}${result}`, tone }
  }
  if (node.kind === 'work') {
    const steps = node.total ? ` ${node.done ?? 0}/${node.total}` : ''
    const fact = node.facts.length ? ` ↳ ${node.facts[node.facts.length - 1]}` : ''
    const glyph = node.status === 'done' ? '✓' : node.status === 'blocked' ? '⚠' : '▶'
    const tone = node.status === 'done' ? 'ok' : node.status === 'blocked' ? 'warn' : 'run'
    return { at: node.at, glyph, text: `${node.title}${steps}${fact}`, tone }
  }
  if (node.kind === 'talk') return { at: node.at, glyph: '💬', text: node.title, tone: 'normal' }
  if (node.kind === 'session') return { at: node.at, glyph: '—', text: node.title, tone: 'dim' }
  return { at: node.at, glyph: '↳', text: node.title, tone: 'dim' }
}

// Nodes (oldest first) + this session's task mirror + the active plan → what the pane shows.
// History is newest first; page 0 is the newest `size` rows; an out-of-range page clamps.
// `now` (ms) lets GOAL and BLOCKED ignore log entries from an earlier day; history still shows them.
export function buildPanel(nodes: readonly Node[], tasks: readonly Task[], plan: Plan | null, page: number, size: number, now: number): Panel {
  const latestWork = new Map<string, WorkNode>()
  for (const n of nodes) if (n.kind === 'work') latestWork.set(n.task, n)
  const isFresh = (n: WorkNode) => now - Date.parse(n.at) < DAY_MS
  // The newest task whose latest entry is still active (an older 'active' entry of a task since done does not count).
  const activeWork = [...nodes].reverse().find((n): n is WorkNode => n.kind === 'work' && n.status === 'active' && latestWork.get(n.task) === n && isFresh(n))

  const open = tasks.filter(t => t.status !== 'completed')
  const waiting = open.filter(t => t.status === 'pending' && isBlocked(t, tasks)) // an in-progress task shows in NOW only
  const ready = open.filter(t => t.status === 'pending' && !isBlocked(t, tasks))
  const blocked = [
    ...waiting.map(t => ({ title: t.subject, waitsOn: t.blockedBy.find(id => tasks.some(x => x.id === id && x.status !== 'completed')) })),
    ...[...latestWork.values()].filter(w => w.status === 'blocked' && isFresh(w)).map(w => ({ title: w.title })),
  ]

  const rows = [...nodes].reverse().map(historyRow)
  const pages = Math.max(1, Math.ceil(rows.length / size))
  const clamped = Math.min(Math.max(0, page), pages - 1)

  const panel: Panel = {
    nowAgents: nodes.filter((n): n is AgentNode => n.kind === 'agent' && n.state === 'running'),
    nowTasks: open.filter(t => t.status === 'in_progress'),
    next: ready.slice(0, NEXT_SHOWN),
    nextMore: Math.max(0, ready.length - NEXT_SHOWN),
    blocked,
    history: rows.slice(clamped * size, clamped * size + size),
    page: clamped,
    pages,
  }
  const goal = plan?.title || activeWork?.title
  if (goal) panel.goal = goal
  if (plan && plan.done > 0) {
    const group = currentGroup(plan)
    panel.plan = { ...(group ? { group } : {}), done: plan.done, total: plan.total }
  }
  return panel
}

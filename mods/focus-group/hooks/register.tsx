import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type {
  AgentStatus,
  Disposition,
  Finding,
  FindingStatus,
  GateId,
  GateOutcome,
  Priority,
  RosterAgent,
  Run,
} from '../types'

const PANE = 'focus-group'
const TITLE = 'Focus group'
const TOOL = 'mcp__focus-group__record'
const GATES: readonly GateId[] = ['G0', 'G1', 'G2', 'G3', 'G4', 'G5']
const OUTCOMES: readonly GateOutcome[] = ['pass', 'conditional', 'blocked']
const PRIORITIES: readonly Priority[] = ['blocker', 'major', 'minor']
const DISPOSITIONS: readonly Disposition[] = ['accept', 'merge', 'reject', 'defer', 'unresolved']
const STATUSES: readonly FindingStatus[] = ['pending', 'incorporated', 'verified']

const runRef = { plugin: 'focus-group', key: 'run' } as const
const expandedRef = { plugin: 'focus-group', key: 'isExpanded' } as const
const runAtom = atom(runRef, null as Run | null)
const expandedAtom = atom(expandedRef, false)

// One field of the skill's agent brief ("Persona: ...", "- **Role:** ..."), '' when absent.
const field = (text: string, name: string): string =>
  text.match(new RegExp(`^[\\s>*_-]*\\**${name}\\**\\s*:\\**\\s*(.+)$`, 'im'))?.[1]?.trim() ?? ''

// Reviewers and verifiers gate the next step, so they never run in the background.
const isGating = (role: string): boolean => /verif|review|evaluat|critic/i.test(role)

const emptyRun = (objective = ''): Run => ({ objective, agents: [], gates: {}, findings: [] })
const runningIn = (run: Run | null | undefined): RosterAgent[] =>
  run?.agents.filter(agent => agent.status === 'running') ?? []
const names = (agents: readonly RosterAgent[]): string =>
  agents.map(agent => `${agent.label} (${agent.role || 'agent'})`).join(', ')
const pick = <T extends string>(value: unknown, allowed: readonly T[]): T | undefined =>
  allowed.find(one => one === value)
const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

const RECORD_DESCRIPTION = [
  'Log a self-staffing-focus-group run to the live panel the user watches.',
  'kind "start" begins a run (objective). kind "gate" records a gate: gate G0-G5,',
  'outcome pass | conditional | blocked, evidence. kind "finding" adds or updates a',
  'finding by id: priority blocker | major | minor, summary, disposition accept |',
  'merge | reject | defer | unresolved, status pending | incorporated | verified.',
  'A G4 or G5 pass is refused while any dispatched agent is still running.',
].join(' ')

// Unasked opens may be refused (narrow terminal, a hook); the pane just stays closed.
const openPane = ($: EngineInterface) => void $.ui.open({ id: PANE, title: TITLE }).catch(() => undefined)

const showStatus = async ($: EngineInterface) => {
  const out = runningIn((await $.state.get(runRef)).value)
  $.ui.status(out.length ? `focus group: ${out.length} running` : undefined)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'focus-group', description: 'Open the focus-group run panel' })
    await $.tool.register({
      name: 'record',
      description: RECORD_DESCRIPTION,
      isDeferred: false,
      inputSchema: {
        type: 'object',
        properties: {
          kind: { enum: ['start', 'gate', 'finding'] },
          objective: { type: 'string' },
          gate: { enum: GATES },
          outcome: { enum: OUTCOMES },
          evidence: { type: 'string' },
          id: { type: 'string' },
          priority: { enum: PRIORITIES },
          summary: { type: 'string' },
          disposition: { enum: DISPOSITIONS },
          status: { enum: STATUSES },
        },
        required: ['kind'],
      },
    })

    return next(e)
  })

  on('command.run', { command: 'focus-group' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })

    return { text: 'Focus group panel opened.' }
  })

  on('agent.spawn', async ($, e, next) => {
    const persona = field(e.prompt, 'Persona')
    const role = field(e.prompt, 'Role')
    if (!persona && !role) return next(e)

    const isForeground = !e.background || isGating(role)
    const started = await next(e.background && isForeground ? { ...e, background: false } : e)
    if (started.deny !== undefined || !started.agentId) return started

    const agent: RosterAgent = {
      id: started.agentId,
      label: field(e.prompt, 'Agent ID') || e.description,
      persona,
      role,
      focus: field(e.prompt, 'Focus'),
      status: 'running',
      isForeground,
    }
    await update($, runAtom, run => {
      const base = run ?? emptyRun()
      return { ...base, agents: [...base.agents.filter(one => one.id !== agent.id), agent] }
    })
    openPane($)
    await showStatus($)

    return started
  })

  on('turn.complete', async ($, e, next) => {
    const id = e.agentId
    const run = id ? (await $.state.get(runRef)).value : null
    if (id && run?.agents.some(agent => agent.id === id)) {
      const status: AgentStatus = e.reason === 'answer' ? 'returned' : 'failed'
      await update($, runAtom, current =>
        current && {
          ...current,
          agents: current.agents.map(agent => (agent.id === id ? { ...agent, status } : agent)),
        },
      )
      await showStatus($)
    }

    return next(e)
  })

  // Remind the orchestrator, in the Agent result it reads next, who is still out.
  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined) return ran
    const out = runningIn((await $.state.get(runRef)).value)
    if (!out.length) return ran

    return {
      ...ran,
      context: [
        ...(ran.context ?? []),
        `Focus group: ${names(out)} still running. Do not deliver or record a G4/G5 pass until every return is in and adjudicated.`,
      ],
    }
  })

  on('tool.call', { tool: TOOL }, async ($, e) => {
    const kind = pick(e.kind, ['start', 'gate', 'finding'] as const)

    if (kind === 'start') {
      await update($, runAtom, () => emptyRun(text(e.objective)))
      await update($, expandedAtom, () => false)
      openPane($)
      await showStatus($)

      return { result: 'Run started; the panel is open.' }
    }

    if (kind === 'gate') {
      const gate = pick(e.gate, GATES)
      const outcome = pick(e.outcome, OUTCOMES)
      if (!gate || !outcome) return { deny: 'gate must be G0-G5 and outcome pass, conditional or blocked.' }

      const out = runningIn((await $.state.get(runRef)).value)
      if (outcome === 'pass' && (gate === 'G4' || gate === 'G5') && out.length) {
        return {
          deny: `${gate} cannot pass while ${names(out)} ${out.length === 1 ? 'is' : 'are'} still running. Wait for every return, adjudicate it, then record ${gate}.`,
        }
      }
      await update($, runAtom, run => {
        const base = run ?? emptyRun()
        return { ...base, gates: { ...base.gates, [gate]: { outcome, evidence: text(e.evidence) } } }
      })

      return { result: `Recorded ${gate} ${outcome}.` }
    }

    if (kind === 'finding') {
      const id = text(e.id)
      if (!id) return { deny: 'finding needs an id.' }
      const patch: Partial<Finding> = {}
      const priority = pick(e.priority, PRIORITIES)
      const disposition = pick(e.disposition, DISPOSITIONS)
      const status = pick(e.status, STATUSES)
      if (priority) patch.priority = priority
      if (disposition) patch.disposition = disposition
      if (status) patch.status = status
      if (text(e.summary)) patch.summary = text(e.summary)

      await update($, runAtom, run => {
        const base = run ?? emptyRun()
        const known = base.findings.find(one => one.id === id)
        const next: Finding = { id, priority: 'minor', summary: '', ...known, ...patch }
        return {
          ...base,
          findings: known
            ? base.findings.map(one => (one.id === id ? next : one))
            : [...base.findings, next],
        }
      })

      return { result: `Recorded finding ${id}.` }
    }

    return { deny: 'kind must be start, gate or finding.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const run = await read($, runAtom)
    const isExpanded = await read($, expandedAtom)

    if (!run) {
      return (
        <Box flexDirection="column">
          <Text>No focus-group run yet.</Text>
          <Text dimColor>
            Agents appear here when the self-staffing-focus-group skill dispatches them. Reviewers
            and verifiers run in the foreground, so nothing is delivered before they return.
          </Text>
        </Box>
      )
    }

    const out = runningIn(run)
    const blocked = GATES.find(gate => run.gates[gate]?.outcome === 'blocked')
    const final = run.gates.G5
    const accepted = run.findings.filter(one => one.disposition === 'accept').length
    const summary = `${run.agents.length} agents, ${run.findings.length} findings, ${accepted} accepted`
    const isDone = !out.length && !!final

    const header = out.length ? (
      <Text bold color="warning" wrap="wrap">
        Waiting on {out.length === 1 ? '1 agent' : `${out.length} agents`}: {names(out)}
      </Text>
    ) : blocked ? (
      <Text bold color="error" wrap="wrap">
        Blocked at {blocked}: {run.gates[blocked]?.evidence || 'no evidence recorded'}
      </Text>
    ) : final ? (
      <Text bold wrap="wrap">
        {final.outcome === 'pass' ? 'Verified' : final.outcome === 'conditional' ? 'Conditional' : 'Blocked'}: {summary}
      </Text>
    ) : (
      <Text dimColor wrap="wrap">
        In progress: {run.agents.length - out.length} of {run.agents.length} agents returned
      </Text>
    )

    const toggle = isDone && (
      <Button key="toggle" plain onPress={() => update($, expandedAtom, value => !value)}>
        {isExpanded ? 'Hide details' : 'Show details'}
      </Button>
    )
    if (isDone && !isExpanded) {
      return (
        <Box flexDirection="column">
          {header}
          {toggle}
        </Box>
      )
    }

    // Open work first: unresolved, then accepted but not yet verified.
    const rank = (one: Finding) =>
      one.disposition === 'unresolved' || !one.disposition ? 0 : one.disposition === 'accept' && one.status !== 'verified' ? 1 : 2
    const findings = [...run.findings].sort((a, b) => rank(a) - rank(b))
    const room = Math.max(3, (e.viewport?.rows ?? 30) - run.agents.length - 10)

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          {header}
          {run.objective ? <Text dimColor wrap="truncate-end">{run.objective}</Text> : null}
        </Box>

        <Box flexDirection="column">
          <Text bold>Roster</Text>
          {run.agents.length === 0 && <Text dimColor>No agents dispatched yet.</Text>}
          {run.agents.map(agent => (
            <Text key={agent.id} wrap="truncate-end">
              <Text
                bold={agent.status !== 'returned'}
                color={agent.status === 'running' ? 'warning' : agent.status === 'failed' ? 'error' : undefined}
                dimColor={agent.status === 'returned'}
              >
                {agent.status.padEnd(9)}
              </Text>
              {agent.label}
              <Text dimColor>
                {' '}
                {[agent.role, agent.focus].filter(Boolean).join(' · ')}
                {agent.isForeground ? ' · foreground' : ''}
              </Text>
            </Text>
          ))}
        </Box>

        <Box flexDirection="column">
          <Text bold>Gates</Text>
          <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
            {GATES.map(gate => {
              const outcome = run.gates[gate]?.outcome
              return (
                <Text key={gate} color={outcome === 'blocked' ? 'error' : undefined} dimColor={!outcome}>
                  {gate} {outcome === 'conditional' ? 'cond' : outcome ?? 'open'}
                </Text>
              )
            })}
          </Box>
        </Box>

        <Box flexDirection="column">
          <Text bold>
            Findings <Text dimColor>{run.findings.length} recorded, {accepted} accepted</Text>
          </Text>
          {findings.length === 0 && <Text dimColor>None recorded yet.</Text>}
          {findings.slice(0, room).map(one => (
            <Text key={one.id} wrap="truncate-end" dimColor={rank(one) === 2}>
              {one.id} {one.priority} {one.disposition ?? 'open'}
              {one.status ? `/${one.status}` : ''} {one.summary}
            </Text>
          ))}
          {findings.length > room && <Text dimColor>{findings.length - room} more in the run record</Text>}
        </Box>

        {toggle}
      </Box>
    )
  })
}

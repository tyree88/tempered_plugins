import { expect, test } from 'claude-code/testing'

const TOOL = 'mcp__focus-group__record'
const VERIFIER = ['Agent ID: V1', 'Persona: Skeptical practitioner', 'Role: Adversarial verifier', 'Focus: break the runbook'].join('\n')
const RESEARCHER = ['Agent ID: R1', 'Persona: Domain researcher', 'Role: Researcher', 'Focus: retention policy'].join('\n')
const SURFACES = ['terminal', 'desktop', 'mobile'] as const

// The Agent tool's spawn as the engine raises it: background by default.
const spawn = (prompt: string, description: string) => ({
  tool_use_id: `tu-${description}`,
  prompt,
  description,
  subagentType: 'general-purpose',
  provider: { plugin: 'engine', tier: 'core' } as const,
  parentModel: 'test',
  background: true,
  fork: false,
})

const PANE = {
  plugin: 'focus-group',
  component: 'Pane',
  requestId: 'focus-group',
  props: {
    title: 'Focus group',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

test('verifiers run in the foreground; researchers keep background', async ($, on) => {
  const seen: Record<string, boolean> = {}
  on('agent.spawn', (_, e) => {
    seen[e.description] = e.background
    return { model: 'test', agentId: e.description }
  })

  await $.agent.spawn(spawn(VERIFIER, 'v1'))
  await $.agent.spawn(spawn(RESEARCHER, 'r1'))
  await $.agent.spawn(spawn('plain task, no brief', 'other'))

  expect(seen.v1).toBe(false)
  expect(seen.r1).toBe(true)
  expect(seen.other).toBe(true)
})

test('G4 pass is refused while an agent runs, accepted after it returns', async ($, on) => {
  on('agent.spawn', () => ({ model: 'test', agentId: 'v1' }))
  on('turn.complete', (_, e) => ({ text: e.answer }))

  await $.agent.spawn(spawn(VERIFIER, 'v1'))
  const early = await $.tool.call({ tool: TOOL, kind: 'gate', gate: 'G4', outcome: 'pass' })
  expect(early.deny).toContain('V1 (Adversarial verifier) is still running')

  await $.turn.complete({ agentId: 'v1', answer: 'no defect', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  const late = await $.tool.call({ tool: TOOL, kind: 'gate', gate: 'G4', outcome: 'pass', evidence: 'V1 returned' })
  expect(late.deny).toBeUndefined()
})

test('pane leads with the blocking fact, then collapses when verified', async ($, on) => {
  on('agent.spawn', () => ({ model: 'test', agentId: 'v1' }))
  on('turn.complete', (_, e) => ({ text: e.answer }))

  for (const surface of SURFACES) {
    const idle = await $.ui.mount({ ...PANE, surface })
    expect(await idle.find({ text: /No focus-group run yet/ })).toBeDefined()
    await idle.unmount()
  }

  await $.tool.call({ tool: TOOL, kind: 'start', objective: 'Correct the runbook' })
  await $.agent.spawn(spawn(VERIFIER, 'v1'))
  await $.tool.call({ tool: TOOL, kind: 'finding', id: 'V1-1', priority: 'blocker', summary: 'rollback loses CONCURRENTLY', disposition: 'accept' })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ text: /Waiting on 1 agent: V1/ })).toBeDefined()
    expect(await ui.find({ text: /V1-1 blocker accept/ })).toBeDefined()
    await ui.unmount()
  }

  await $.turn.complete({ agentId: 'v1', answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await $.tool.call({ tool: TOOL, kind: 'gate', gate: 'G5', outcome: 'pass', evidence: 'all returns in' })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ text: /Verified: 1 agents, 1 findings, 1 accepted/ })).toBeDefined()
    expect(await ui.find({ text: /Roster/ })).toBeUndefined()
    await ui.press({ key: 'toggle' })
    expect(await ui.find({ text: /Roster/ })).toBeDefined()
    await ui.press({ key: 'toggle' })
    await ui.unmount()
  }
})

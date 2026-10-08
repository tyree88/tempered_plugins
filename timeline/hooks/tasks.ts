import type { Task, TaskStatus } from '../types'

const STATUSES = new Set<string>(['pending', 'in_progress', 'completed'])
const bare = (id: string) => id.replace(/^#/, '')
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

// One main-loop TaskCreate / TaskUpdate / TodoWrite call → the new list. `input` is the tool call's input fields;
// `result` the call's result text (TaskCreate's names the new id as "#<n>"); `fallbackId` when it does not.
// Any other tool, or a shape it does not expect, leaves the list as it was.
export function applyTaskCall(tasks: readonly Task[], tool: string, input: object, result: string, fallbackId: string): Task[] {
  const i = input as Record<string, unknown>
  if (tool === 'TodoWrite') {
    if (!Array.isArray(i.todos)) return [...tasks]
    return i.todos.flatMap((t: unknown, n: number) => {
      const o = (t ?? {}) as Record<string, unknown>
      const subject = text(o.content)
      if (!subject) return []
      const status = STATUSES.has(String(o.status)) ? (o.status as TaskStatus) : 'pending'
      return [{ id: `t${n}`, subject, status, blockedBy: [] }]
    })
  }
  if (tool === 'TaskCreate') {
    const subject = text(i.subject)
    if (!subject) return [...tasks]
    const id = /#(\d+)/.exec(result)?.[1] ?? fallbackId
    return [...tasks.filter(t => t.id !== id), { id, subject, status: 'pending', blockedBy: [] }]
  }
  if (tool === 'TaskUpdate') {
    const id = typeof i.taskId === 'string' ? bare(i.taskId) : ''
    if (!id) return [...tasks]
    if (i.status === 'deleted') return tasks.filter(t => t.id !== id)
    const subject = text(i.subject)
    const adds = Array.isArray(i.addBlockedBy) ? i.addBlockedBy.filter((b): b is string => typeof b === 'string').map(bare) : []
    return tasks.map(t =>
      t.id !== id
        ? t
        : {
            ...t,
            ...(subject ? { subject } : {}),
            ...(STATUSES.has(String(i.status)) ? { status: i.status as TaskStatus } : {}),
            ...(adds.length ? { blockedBy: [...new Set([...t.blockedBy, ...adds])] } : {}),
          },
    )
  }
  return [...tasks]
}

// Waits on a task that exists and is not completed.
export const isBlocked = (task: Task, tasks: readonly Task[]) =>
  task.blockedBy.some(id => tasks.some(t => t.id === id && t.status !== 'completed'))

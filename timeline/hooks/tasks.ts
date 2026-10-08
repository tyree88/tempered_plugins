import type { Task, TaskStatus } from '../types'

const STATUSES = new Set<string>(['pending', 'in_progress', 'completed'])
const bare = (id: string) => id.replace(/^#/, '')
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const asId = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? bare(String(v)) : '')
const ids = (v: unknown) => (Array.isArray(v) ? v.map(asId).filter(Boolean) : [])

// The id a TaskCreate result gives the new task: the structured `task.id`, else the "#<n>" in its text.
export const createdId = (result: unknown, text: string): string | undefined =>
  asId((result as { task?: { id?: unknown } } | null | undefined)?.task?.id) || /#(\d+)/.exec(text)?.[1]

// One main-loop TaskCreate / TaskUpdate / TodoWrite call → the new list. `input` is the tool call's input fields;
// `id` names the task a TaskCreate adds (see createdId). Any other tool, or a shape it does not expect, leaves the list as it was.
export function applyTaskCall(tasks: readonly Task[], tool: string, input: object, id: string): Task[] {
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
    return [...tasks.filter(t => t.id !== id), { id, subject, status: 'pending', blockedBy: [] }]
  }
  if (tool === 'TaskUpdate') {
    const target = asId(i.taskId)
    if (!target) return [...tasks]
    if (i.status === 'deleted') return tasks.filter(t => t.id !== target)
    const subject = text(i.subject)
    const adds = ids(i.addBlockedBy)
    const blocks = ids(i.addBlocks) // tasks that wait on this one
    return tasks.map(t =>
      t.id !== target
        ? blocks.includes(t.id) ? { ...t, blockedBy: [...new Set([...t.blockedBy, target])] } : t
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

// A main-loop TaskList result (`{ tasks: [...] }`) → the current list; null when it is not that shape or none of its rows parse.
export function fromTaskList(result: unknown): Task[] | null {
  const rows = (result as { tasks?: unknown } | null | undefined)?.tasks
  if (!Array.isArray(rows)) return null
  const list = rows.flatMap((r: unknown): Task[] => {
    const o = (r ?? {}) as Record<string, unknown>
    const id = asId(o.id)
    const subject = text(o.subject)
    if (!id || !subject) return []
    return [{ id, subject, status: STATUSES.has(String(o.status)) ? (o.status as TaskStatus) : 'pending', blockedBy: ids(o.blockedBy) }]
  })
  return list.length || !rows.length ? list : null
}

// Waits on a task that exists and is not completed.
export const isBlocked = (task: Task, tasks: readonly Task[]) =>
  task.blockedBy.some(id => tasks.some(t => t.id === id && t.status !== 'completed'))

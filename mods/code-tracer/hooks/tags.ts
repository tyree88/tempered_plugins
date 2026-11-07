// Agent tags: the subagent type without its `<plugin>:` prefix, cut to the tag width; colliding drawn strings get `#N`.
export const stripPlugin = (type: string) => type.replace(/^[\w.-]+:/, '')

// `tagsFor(['test-engineer','test-engineer'], 12)` → `test-enginee`, `test-engin#2`. N counts from 2 in list order,
// so a list that starts with the stored agents continues their counters. `main` is passed through like any type.
export function tagsFor(types: readonly string[], width: number): string[] {
  const cut = types.map(t => stripPlugin(t).slice(0, width))
  const seen = new Map<string, number>()
  return cut.map(tag => {
    const n = (seen.get(tag) ?? 0) + 1
    seen.set(tag, n)
    if (n === 1) return tag
    const suffix = `#${n}`
    return `${tag.slice(0, Math.max(0, tag.length - suffix.length))}${suffix}`
  })
}

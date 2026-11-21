import type { Elements } from 'claude-code'

import type { Category, Pick as ElementPick, Recipe } from '../types'

type UI = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button'>

export type Status = 'starting' | 'ready' | 'failed' | 'stopped'

export type PaneView = {
  status: Status
  error?: string
  scriptTag?: string
  hello?: string
  pick?: ElementPick
  groups: { category: Category; items: { recipe: Recipe; isMatch: boolean }[] }[]
  bad: number
  notice?: string
}

export type Handlers = {
  install: () => void
  restart: () => void
  choose: (id: string) => () => void // id: `<category>/<slug>`
}

const TITLE: Record<Category, string> = { motion: 'Motion', type: 'Type', visual: 'Visual', effect: 'Effects (add markup)' }

const cut = (text: string, max: number) => {
  const chars = Array.from(text.replace(/\s+/g, ' ').trim())
  return chars.length > max ? `${chars.slice(0, Math.max(1, max - 1)).join('')}…` : chars.join('')
}

function header(ui: UI, v: PaneView, act: Handlers) {
  const { Box, Text, Button } = ui
  const state =
    v.status === 'failed'
      ? { text: 'bridge failed', color: 'error' as const }
      : v.status === 'starting'
        ? { text: 'bridge starting…', color: 'warning' as const }
        : v.status === 'stopped'
          ? { text: 'bridge stopped', color: 'warning' as const }
          : v.hello
            ? { text: `connected · ${v.hello}`, color: 'success' as const }
            : { text: 'waiting for the page', color: 'warning' as const }
  return (
    <Box key="head" flexDirection="column">
      <Box key="state" flexDirection="row" columnGap={2}>
        <Text wrap="truncate">
          <Text color={state.color}>●</Text>
          {` ${state.text}`}
        </Text>
        {(v.status === 'failed' || v.status === 'stopped') && <Button key="restart" label="restart" dimColor onPress={act.restart} />}
      </Box>
      {v.error && (
        <Text key="error" color="error" wrap="wrap">
          {v.error}
        </Text>
      )}
    </Box>
  )
}

function install(ui: UI, tag: string, act: Handlers) {
  const { Box, Text, Button } = ui
  return (
    <Box key="install" flexDirection="column">
      <Text dimColor wrap="wrap">Add this tag to the dev page, then Alt+click an element:</Text>
      <Text key="tag" mono wrap="wrap">
        {tag}
      </Text>
      <Button key="install-btn" label="Ask Claude to add it (dev only)" onPress={act.install} />
    </Box>
  )
}

function lastPick(ui: UI, p: ElementPick | undefined) {
  const { Box, Text } = ui
  if (!p) return <Text key="nopick" dimColor wrap="wrap">No pick yet. Hold Alt and click an element in the page.</Text>
  const where = p.source ? `${p.source.file}:${p.source.line}` : p.selector
  return (
    <Box key="pick" flexDirection="column">
      <Text wrap="truncate">
        <Text bold>{`<${p.tag}>`}</Text>
        {p.component ? ` ${p.component}` : ''}
        <Text dimColor>{`  ${where}`}</Text>
      </Text>
      {p.text.trim() !== '' && (
        <Text key="pick-text" dimColor wrap="truncate">
          {`“${cut(p.text, 80)}”`}
        </Text>
      )}
    </Box>
  )
}

function recipes(ui: UI, v: PaneView, act: Handlers) {
  const { Box, Text, Button } = ui
  const canChoose = v.pick !== undefined
  return (
    <Box key="recipes" flexDirection="column" rowGap={1}>
      {v.groups.map(g => (
        <Box key={`cat:${g.category}`} flexDirection="column">
          <Text bold dimColor>{TITLE[g.category]}</Text>
          {g.items.map(({ recipe, isMatch }) =>
            canChoose ? (
              <Button key={`r:${recipe.category}/${recipe.slug}`} label={`${isMatch ? '● ' : '  '}${recipe.name}`} dimColor={!isMatch} onPress={act.choose(`${recipe.category}/${recipe.slug}`)} />
            ) : (
              <Text key={`r:${recipe.category}/${recipe.slug}`} dimColor wrap="truncate">{`  ${recipe.name}`}</Text>
            ),
          )}
        </Box>
      ))}
      {v.groups.length === 0 && <Text key="none" dimColor>No recipes found.</Text>}
    </Box>
  )
}

export function drawPane(ui: UI, v: PaneView, act: Handlers) {
  const { Box, Text } = ui
  return (
    <Box flexDirection="column" rowGap={1}>
      {header(ui, v, act)}
      {v.status === 'ready' && !v.hello && v.scriptTag && install(ui, v.scriptTag, act)}
      {lastPick(ui, v.pick)}
      {v.notice && (
        <Text key="notice" color="warning" wrap="wrap">
          {v.notice}
        </Text>
      )}
      {recipes(ui, v, act)}
      {v.bad > 0 && (
        <Text key="foot" dimColor wrap="wrap">
          {`${v.bad} recipe file${v.bad === 1 ? '' : 's'} failed to parse and ${v.bad === 1 ? 'is' : 'are'} left out.`}
        </Text>
      )}
    </Box>
  )
}

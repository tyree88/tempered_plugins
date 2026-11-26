// What the picker's audit can report, with the fix for each. Pure: no engine.
// Two tiers: signs of generic machine-made UI (skills/restyle-rules, section 5), and craft checks.
// Each key is a rule id that bridge/picker.js sends; checks/audit.check.ts holds the two lists together.
import type { Decision } from '../types/index.d.ts'

export type Sign = {
  name: string
  /** what to do instead */
  fix: string
  /** `<category>/<slug>` of the recipe that fixes it, when the catalog has one */
  recipe?: string
  /** a craft check (the page against itself and the rules), not a sign of generic UI */
  craft?: true
}

export const SIGNS: Record<string, Sign> = {
  'gradient-text': { name: 'Gradient text', fix: 'Use solid text in the brand or text colour.' },
  'purple-gradient': { name: 'Purple gradient', fix: "Use the project's own colours. Build any new palette in OKLCH.", recipe: 'visual/oklch-palettes' },
  'glass-blur': { name: 'Glass blur on many surfaces', fix: 'Use solid surfaces. Keep blur for one layer that sits over moving content, if any.' },
  'pill-badge': { name: 'Pill badge above a headline', fix: 'Remove the badge, unless it carries real, current news.' },
  bounce: { name: 'Bounce easing', fix: 'Use the shared curves. No overshoot.', recipe: 'motion/no-bounce-on-everyday-ui' },
  'same-card': {
    name: 'Same radius and shadow on every card',
    fix: 'Let radius and depth follow the layer: concentric corners, lighter raised surfaces, translucent borders.',
    recipe: 'visual/concentric-corner-radius',
  },
  buzzword: { name: 'Buzzword copy', fix: 'Use plain words that say what the product does.' },
  'emoji-icon': { name: 'Emoji as an icon', fix: 'Use one icon set, with the stroke matched to the text.', recipe: 'visual/match-icon-stroke-to-text' },
  'all-centred': { name: 'Everything centred', fix: 'Left-align text on a clear grid. Centre only short, single items.' },

  'no-press': {
    name: 'No press feedback',
    fix: 'Give the button a pressed state. If a script already gives press feedback (for example a `whileTap` prop), change nothing and say so.',
    recipe: 'motion/scale-to-0-97-on-press',
    craft: true,
  },
  'small-target': {
    name: 'Small hit area',
    fix: 'Make the hit area at least 40 by 40 px. Keep the visible size: add padding, or extend the area with a pseudo-element. If the area is already extended, change nothing and say so.',
    craft: true,
  },
  'many-radii': {
    name: 'More than two corner radii',
    fix: 'Use one radius for each layer, from the design tokens. A nested corner takes the outer radius minus the padding.',
    recipe: 'visual/concentric-corner-radius',
    craft: true,
  },
  'many-durations': { name: 'More than two transition durations', fix: 'Use one duration for each kind of change on controls. Take it from the design tokens.', craft: true },
  'heading-wrap': { name: 'Unbalanced heading', fix: 'Balance the lines of headings that wrap.', recipe: 'type/balance-headings', craft: true },
}

/** The sign for a rule id from the page, or nothing: the id is page data, so only own keys count. */
export const signOf = (rule: string): Sign | undefined => (Object.hasOwn(SIGNS, rule) ? SIGNS[rule] : undefined)

// Decisions: what a reviewer said on the board, kept for each page origin. bridge/audit-url.mjs imports `keep` too.

/** `https://host:port` of a URL, lower-case; empty when the text is not an http or https URL. */
export const originOf = (url: string): string => /^https?:\/\/[^/?#\s]+/i.exec(url)?.[0].toLowerCase() ?? ''

/** The findings that no decision dismissed. */
// shortcut: the key is the rule and the selector. The same selector can name another element on another page of the
// origin; key on the component and the text when findings are rolled up by component.
export function keep<T extends { rule: string; pick: { selector: string } }>(findings: readonly T[], decisions: readonly { rule: string; selector: string; verdict?: string }[]): T[] {
  const gone = new Set(decisions.filter(d => d.verdict === undefined || d.verdict === 'dismiss').map(d => `${d.rule}\n${d.selector}`))
  return findings.filter(f => !gone.has(`${f.rule}\n${f.pick.selector}`))
}

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')

/** The stored decisions of one origin, checked field by field: an older version may have stored another shape. */
export function decisionsOf(stored: unknown, origin: string): Decision[] {
  const list = stored && typeof stored === 'object' && Object.hasOwn(stored, origin) ? (stored as Record<string, unknown>)[origin] : undefined
  const out: Decision[] = []
  for (const raw of Array.isArray(list) ? (list as unknown[]) : []) {
    const d = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
    if (typeof d.rule !== 'string' || typeof d.selector !== 'string' || (d.verdict !== 'accept' && d.verdict !== 'dismiss')) continue
    out.push({ rule: d.rule, selector: d.selector, verdict: d.verdict, reason: text(d.reason, 500), comment: text(d.comment, 500), at: text(d.at, 40) })
  }
  return out
}

/** The list with one more decision. A later verdict on the same rule and selector replaces the earlier one. */
export const decide = (list: readonly Decision[], d: Decision): Decision[] => [...list.filter(x => x.rule !== d.rule || x.selector !== d.selector), d]

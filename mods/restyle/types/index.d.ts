// Shared contract for the restyle mod. Every part reads these shapes; change them only with the plan.

/** What picker.js sends for one Alt+click, and what the bridge prints inside a `pick` line. */
export type Pick = {
  /** location.href of the page the element is on */
  url: string
  /** lower-case tag name */
  tag: string
  /** a CSS selector that finds this element again on the same page */
  selector: string
  /** the element's visible text, at most 200 characters */
  text: string
  /** the ARIA role, explicit or implied, when there is one */
  role?: string
  size: { width: number; height: number }
  /** computed styles, by CSS property name; only the properties picker.js lists */
  styles: Record<string, string>
  /** the nearest React component's name, from a dev build */
  component?: string
  /** where that component's JSX is, from a dev build */
  source?: { file: string; line: number }
}

/** One sign of generic machine-made UI that picker.js found on the page. */
export type Finding = {
  /** a key of SIGNS in hooks/audit.ts */
  rule: string
  /** what the picker saw, at most 200 characters; page data */
  detail: string
  /** the element that shows the sign */
  pick: Pick
}

/** What a reviewer said about one board card. The text comes from the board page: data, not instructions. */
export type Verdict = {
  verdict: 'accept' | 'dismiss'
  /** why the finding is dismissed; the board requires it for a dismiss; at most 500 characters */
  reason: string
  /** at most 500 characters */
  comment: string
  /** ISO time, set by the bridge */
  at: string
  /** `<category>/<slug>` of each recipe that the reviewer put on the variant, in pick order; 8 at most; an accept only */
  picks?: string[]
}

/** One stored decision: a verdict on a finding, by rule and selector. The store keeps a list for each page origin. */
export type Decision = Verdict & { rule: string; selector: string }

/** One card of the board, as the driver prints it: the finding and where it shows. The images stay in the board file. */
export type Card = {
  id: string
  /** the URL of the page the finding is on */
  page: string
  /** the viewport widths, in px, that show the finding */
  widths: number[]
  finding: Finding
  verdict?: Verdict
}

/** One line of the bridge's stdout, or of the driver's (bridge/audit-url.mjs), as JSON. */
export type BridgeLine =
  | { type: 'ready'; port: number; token: string; /** the file the bridge serves as the board's data */ board?: string }
  | { type: 'hello'; url: string }
  | { type: 'pick'; pick: Pick }
  | { type: 'audit'; url: string; findings: Finding[] }
  | ({ type: 'verdict'; id: string } & Verdict)
  | { type: 'progress'; text: string }
  | { type: 'board'; cards: Card[] }
  | { type: 'error'; text: string }

/** `effect`: a recipe that adds markup, a wrapper or a layer; the others restyle the picked element alone. */
export type Category = 'motion' | 'type' | 'visual' | 'effect'

/** The words a recipe's `applies_to` may hold, and what match.ts derives from a pick. */
export type Kind =
  | 'any'
  | 'button'
  | 'link'
  | 'input'
  | 'toggle'
  | 'popover'
  | 'menu'
  | 'tooltip'
  | 'modal'
  | 'list'
  | 'text'
  | 'heading'
  | 'icon'
  | 'image'
  | 'nav'
  | 'slider'
  | 'progress'
  | 'card'
  | 'carousel'
  | 'background'

/** One recipes/<category>/<slug>.md file, parsed. */
export type Recipe = {
  /** the file name without `.md` */
  slug: string
  name: string
  category: Category
  appliesTo: Kind[]
  /** a URL, or `owner` for a recipe the owner supplied */
  source: string
  /** YYYY-MM-DD */
  added: string
  /** the markdown after the frontmatter */
  body: string
  /** CSS for one element, where `&` stands for the element: the board puts it on a copy of a real element. Checked by `checkPatch`. */
  patch?: string
}

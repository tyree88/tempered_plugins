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

/** One line of the bridge's stdout, as JSON. */
export type BridgeLine =
  | { type: 'ready'; port: number; token: string }
  | { type: 'hello'; url: string }
  | { type: 'pick'; pick: Pick }

export type Category = 'motion' | 'type'

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
}

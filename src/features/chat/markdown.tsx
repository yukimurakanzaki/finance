import { Card } from '@components/ui'
import { Fragment } from 'react'

// Minimal markdown renderer for assistant chat replies (M1, PAIN-POINTS.md:
// "Assistant replies render as raw text (pre-wrap, no markdown) — formatted
// answers show literal **asterisks**.").
//
// CHOICE: hand-rolled, zero new dependencies. `package.json` has no markdown
// package (checked before writing this — no `marked`/`markdown-it`/`remark`
// anywhere in dependencies or devDependencies), and Claude's typical reply
// style (bold/italic emphasis, inline code, fenced code blocks, bullet/
// numbered lists, occasional headings) is a small, regular-enough grammar
// that a ~100-line block+inline parser covers without pulling in a library
// and its transitive deps for a feature this narrow.
//
// SUPPORTED SYNTAX: **bold**, *italic* / _italic_, `inline code`, fenced
// ```code``` blocks (with or without a language tag), bullet lists (`-`/`*`)
// numbered lists (`1.`/`1)`), headings (`#`/`##`/`###`), and paragraphs
// separated by blank lines (single newlines within a paragraph become <br/>,
// preserving the old pre-wrap behaviour for soft-wrapped text). Anything
// else (tables, links, nested emphasis) falls through as literal text —
// a safe no-crash fallback, not a parse error.
//
// SAFETY: this module never uses `dangerouslySetInnerHTML`. Text is only
// ever placed into React text nodes (via JSX children), which React escapes
// on render — so a reply that happens to contain literal `<script>` or
// `<img onerror=...>` text renders as inert visible text, never as parsed
// HTML/markup. There is no HTML-injection path here regardless of what the
// model returns.

export type InlineToken =
  | { type: 'text'; value: string }
  | { type: 'bold'; value: string }
  | { type: 'italic'; value: string }
  | { type: 'code'; value: string }

// Pure + DOM-free on purpose so it's unit-testable under vitest's default
// (node) environment, which this repo has no jsdom setup for.
export function parseInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = []
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(_[^_]+_)/g
  let last = 0
  let m: RegExpExecArray | null
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex-exec loop
  while ((m = re.exec(text))) {
    if (m.index > last)
      tokens.push({ type: 'text', value: text.slice(last, m.index) })
    const token = m[0]
    if (token.startsWith('`'))
      tokens.push({ type: 'code', value: token.slice(1, -1) })
    else if (token.startsWith('**'))
      tokens.push({ type: 'bold', value: token.slice(2, -2) })
    else tokens.push({ type: 'italic', value: token.slice(1, -1) })
    last = re.lastIndex
  }
  if (last < text.length) tokens.push({ type: 'text', value: text.slice(last) })
  return tokens
}

export type Block =
  | { type: 'paragraph'; lines: string[] }
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'code'; lang: string; code: string }
  | { type: 'list'; ordered: boolean; items: string[] }

const FENCE_RE = /^```(\w*)\s*$/
const HEADING_RE = /^(#{1,3})\s+(.*)$/
const BULLET_RE = /^[-*]\s+(.*)$/
const NUMBERED_RE = /^\d+[.)]\s+(.*)$/

// Pure + DOM-free (see parseInline above) so the block grammar is
// unit-testable without a rendering environment.
export function parseBlocks(text: string): Block[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    // Bounded by the `while (i < lines.length)` loop guard above/below at
    // every access site — non-null assertions just tell noUncheckedIndexedAccess
    // what the loop condition already guarantees.
    const line = lines[i]!

    if (line.trim() === '') {
      i++
      continue
    }

    const fence = line.match(FENCE_RE)
    if (fence) {
      const lang = fence[1] || ''
      const codeLines: string[] = []
      i++
      while (i < lines.length && !/^```\s*$/.test(lines[i]!)) {
        codeLines.push(lines[i]!)
        i++
      }
      i++ // skip closing fence (tolerates an unterminated fence at EOF)
      blocks.push({ type: 'code', lang, code: codeLines.join('\n') })
      continue
    }

    const heading = line.match(HEADING_RE)
    if (heading) {
      blocks.push({
        type: 'heading',
        level: heading[1]!.length as 1 | 2 | 3,
        text: heading[2]!,
      })
      i++
      continue
    }

    const bulletMatch = line.match(BULLET_RE)
    const numberedMatch = line.match(NUMBERED_RE)
    if (bulletMatch || numberedMatch) {
      const ordered = !!numberedMatch
      const items: string[] = []
      while (i < lines.length) {
        const l = lines[i]!
        const bm = l.match(BULLET_RE)
        const nm = l.match(NUMBERED_RE)
        if (ordered && nm) {
          items.push(nm[1]!)
          i++
          continue
        }
        if (!ordered && bm) {
          items.push(bm[1]!)
          i++
          continue
        }
        break
      }
      blocks.push({ type: 'list', ordered, items })
      continue
    }

    const paraLines: string[] = []
    while (
      i < lines.length &&
      lines[i]!.trim() !== '' &&
      !FENCE_RE.test(lines[i]!) &&
      !HEADING_RE.test(lines[i]!) &&
      !BULLET_RE.test(lines[i]!) &&
      !NUMBERED_RE.test(lines[i]!)
    ) {
      paraLines.push(lines[i]!)
      i++
    }
    blocks.push({ type: 'paragraph', lines: paraLines })
  }
  return blocks
}

function renderInline(text: string): React.ReactNode {
  return parseInline(text).map((tok, i) => {
    switch (tok.type) {
      case 'bold':
        return <strong key={i}>{tok.value}</strong>
      case 'italic':
        return <em key={i}>{tok.value}</em>
      case 'code':
        return (
          <code
            key={i}
            style={{
              background: 'var(--bg-3)',
              borderRadius: 4,
              paddingInline: 'var(--space-1)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.92em',
            }}
          >
            {tok.value}
          </code>
        )
      default:
        return <Fragment key={i}>{tok.value}</Fragment>
    }
  })
}

function renderBlock(b: Block, key: number) {
  switch (b.type) {
    case 'heading':
      return (
        <div
          key={key}
          style={{
            fontSize: b.level === 1 ? 'var(--text-title)' : 'var(--text-body)',
            lineHeight:
              b.level === 1 ? 'var(--leading-title)' : 'var(--leading-body)',
            fontWeight: 700,
          }}
        >
          {renderInline(b.text)}
        </div>
      )
    case 'code':
      return (
        <Card
          key={key}
          padding="var(--space-3)"
          style={{ background: 'var(--bg-3)' }}
        >
          <pre
            style={{
              margin: 0,
              overflowX: 'auto',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-caption)',
              lineHeight: 'var(--leading-caption)',
              whiteSpace: 'pre',
            }}
          >
            <code>{b.code}</code>
          </pre>
        </Card>
      )
    case 'list': {
      const items = b.items.map((item, j) => (
        <li key={j}>{renderInline(item)}</li>
      ))
      return b.ordered ? (
        <ol
          key={key}
          style={{ margin: 0, paddingInlineStart: 'var(--space-5)' }}
        >
          {items}
        </ol>
      ) : (
        <ul
          key={key}
          style={{ margin: 0, paddingInlineStart: 'var(--space-5)' }}
        >
          {items}
        </ul>
      )
    }
    default:
      return (
        <div key={key} style={{ whiteSpace: 'pre-wrap' }}>
          {b.lines.map((line, j) => (
            <Fragment key={j}>
              {j > 0 && <br />}
              {renderInline(line)}
            </Fragment>
          ))}
        </div>
      )
  }
}

interface Props {
  text: string
  style?: React.CSSProperties
}

// Renders assistant reply text as markdown. Callers keep their own bubble
// container (background/radius/padding) — this only renders the parsed
// content inside it.
export function Markdown({ text, style }: Props) {
  const blocks = parseBlocks(text)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, ...style }}>
      {blocks.map((b, i) => renderBlock(b, i))}
    </div>
  )
}

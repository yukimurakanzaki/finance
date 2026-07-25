import { describe, expect, it } from 'vitest'
import { parseBlocks, parseInline } from './markdown'

describe('parseInline — inline emphasis tokens (M1)', () => {
  it('splits bold, italic, and inline code out of plain text', () => {
    expect(parseInline('a **bold** b *it* c `code` d')).toEqual([
      { type: 'text', value: 'a ' },
      { type: 'bold', value: 'bold' },
      { type: 'text', value: ' b ' },
      { type: 'italic', value: 'it' },
      { type: 'text', value: ' c ' },
      { type: 'code', value: 'code' },
      { type: 'text', value: ' d' },
    ])
  })

  it('supports underscore italics at word boundaries', () => {
    expect(parseInline('_hi_')).toEqual([{ type: 'italic', value: 'hi' }])
    expect(parseInline('say _hi_ now')).toEqual([
      { type: 'text', value: 'say ' },
      { type: 'italic', value: 'hi' },
      { type: 'text', value: ' now' },
    ])
  })

  it('leaves intraword underscores literal (identifiers are not italicized)', () => {
    // Finance/tool replies routinely contain snake_case identifiers; these must
    // survive verbatim, not lose their underscores to italics.
    for (const id of ['take_home_net', 'account_id', 'monthly_amount']) {
      expect(parseInline(id)).toEqual([{ type: 'text', value: id }])
    }
    expect(parseInline('the take_home_net field')).toEqual([
      { type: 'text', value: 'the take_home_net field' },
    ])
  })

  it('returns a single text token for plain text with no markdown', () => {
    expect(parseInline('just plain text')).toEqual([
      { type: 'text', value: 'just plain text' },
    ])
  })

  it('never produces raw HTML — literal angle-bracket text stays a text token', () => {
    const tokens = parseInline('<script>alert(1)</script>')
    expect(tokens).toEqual([
      { type: 'text', value: '<script>alert(1)</script>' },
    ])
  })
})

describe('parseBlocks — block grammar (M1)', () => {
  it('parses a fenced code block with a language tag', () => {
    const blocks = parseBlocks('```ts\nconst x = 1\n```')
    expect(blocks).toEqual([{ type: 'code', lang: 'ts', code: 'const x = 1' }])
  })

  it('tolerates an unterminated fence at EOF instead of hanging or crashing', () => {
    const blocks = parseBlocks('```\nconst x = 1')
    expect(blocks).toEqual([{ type: 'code', lang: '', code: 'const x = 1' }])
  })

  it('parses a heading', () => {
    expect(parseBlocks('## Section')).toEqual([
      { type: 'heading', level: 2, text: 'Section' },
    ])
  })

  it('parses a bullet list', () => {
    expect(parseBlocks('- one\n- two\n* three')).toEqual([
      { type: 'list', ordered: false, items: ['one', 'two', 'three'] },
    ])
  })

  it('parses a numbered list', () => {
    expect(parseBlocks('1. one\n2) two')).toEqual([
      { type: 'list', ordered: true, items: ['one', 'two'] },
    ])
  })

  it('keeps a plain multi-line paragraph as one block, soft-wrap lines intact', () => {
    expect(parseBlocks('line one\nline two')).toEqual([
      { type: 'paragraph', lines: ['line one', 'line two'] },
    ])
  })

  it('splits paragraphs on a blank line', () => {
    expect(parseBlocks('para one\n\npara two')).toEqual([
      { type: 'paragraph', lines: ['para one'] },
      { type: 'paragraph', lines: ['para two'] },
    ])
  })

  it('mixes a paragraph, a list, and a code block in one reply', () => {
    const text =
      "Here's what I found:\n\n- item a\n- item b\n\n```\nRp 100.000\n```"
    expect(parseBlocks(text)).toEqual([
      { type: 'paragraph', lines: ["Here's what I found:"] },
      { type: 'list', ordered: false, items: ['item a', 'item b'] },
      { type: 'code', lang: '', code: 'Rp 100.000' },
    ])
  })
})

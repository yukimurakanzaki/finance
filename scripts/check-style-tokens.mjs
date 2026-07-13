#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Design-token guard (Calm Ledger v2 enforcement, PAIN-POINTS.md §Enforcement).
//
// WHY A SCRIPT AND NOT A BIOME RULE:
// Biome 1.9.4 (the pinned version) has no rule that can target an object-property
// key inside a JSX `style={{ ... }}` literal. Verified empirically: the nursery
// group has no `noRestrictedSyntax`, and GritQL plugins (which could express this)
// are a Biome 2.x feature. So the "next-best enforceable thing in this version"
// is this focused line scanner, wired into `npm run lint`.
//
// WHAT IT FLAGS (only under src/features/**):
//   • fontSize:   <numeric literal>            — e.g. `fontSize: 13`
//   • padding*:   <numeric or px-string>       — e.g. `padding: 12`, `padding: '12px'`
//   • borderRadius: <numeric or px-string>     — e.g. `borderRadius: 10`
// The sanctioned token forms are NOT flagged: `fontSize: 'var(--text-body)'`,
// `padding: 'var(--space-4)'`, etc. pass, because the design primitives set these
// values through the CSS custom properties, and feature screens should too.
//
// SCOPE: src/features/** only. src/components/ui/** (the primitives, which
// legitimately set these values) and everything else in the repo are untouched.
//
// PRECISION / KNOWN LIMITATIONS (line-based, not AST):
//   • False positives: a matching key:value pattern inside a comment or a CSS
//     template-literal string would be flagged even though it isn't a JSX style
//     object. None exist in src/features today.
//   • False negatives: a size delivered through a variable (`fontSize: SIZE`) is
//     NOT caught, since the value isn't a literal. Shorthand `padding: '12px 16px'`
//     IS caught (leading digit). Multi-line style objects are fine — the key sits
//     on its own line, which the scan sees.
// ---------------------------------------------------------------------------

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const SCAN_DIR = join(ROOT, 'src', 'features')

const RULES = [
  { key: 'fontSize', re: /\bfontSize\s*:\s*\d/ },
  {
    key: 'padding',
    re: /\bpadding(?:Top|Right|Bottom|Left|Inline|Block|InlineStart|InlineEnd|BlockStart|BlockEnd)?\s*:\s*['"]?\d/,
  },
  { key: 'borderRadius', re: /\bborderRadius\s*:\s*['"]?\d/ },
]

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (/\.(tsx?|jsx?)$/.test(name)) out.push(p)
  }
  return out
}

const findings = []
for (const file of walk(SCAN_DIR)) {
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, i) => {
    for (const { key, re } of RULES) {
      const m = re.exec(line)
      if (m) {
        findings.push({
          file: relative(ROOT, file),
          line: i + 1,
          col: m.index + 1,
          key,
        })
      }
    }
  })
}

if (findings.length === 0) {
  console.log(
    'check-style-tokens: no raw fontSize/padding/borderRadius literals in src/features. OK',
  )
  process.exit(0)
}

console.error(
  'check-style-tokens: raw style literals found in src/features (use design tokens / primitives):\n',
)
for (const f of findings) {
  console.error(
    `  ${f.file}:${f.line}:${f.col}  raw ${f.key} literal — use a token (var(--text-*) / var(--space-*)) or a ui/ primitive`,
  )
}
console.error(
  `\n${findings.length} raw-literal ${findings.length === 1 ? 'finding' : 'findings'} in src/features.`,
)
process.exit(1)

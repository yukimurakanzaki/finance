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
// TODO(biome-2.x): once the pinned Biome major version moves to 2.x, express
// this as a GritQL plugin and delete this script.
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
const BASELINE_PATH = join(ROOT, 'scripts', 'style-tokens-baseline.json')

const RULES = [
  { key: 'fontSize', re: /\bfontSize\s*:\s*\d/ },
  {
    key: 'padding',
    re: /\bpadding(?:Top|Right|Bottom|Left|Inline|Block|InlineStart|InlineEnd|BlockStart|BlockEnd)?\s*:\s*['"]?\d/,
  },
  // Excludes percentage values ('50%', a circle/pill) — no radius token exists
  // for those yet, and they're a legitimate token-agnostic CSS idiom.
  { key: 'borderRadius', re: /\bborderRadius\s*:\s*['"]?\d+(?!\d*%)/ },
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

const files = walk(SCAN_DIR)
if (files.length === 0) {
  console.error(
    `check-style-tokens: found zero .tsx/.ts files under ${relative(ROOT, SCAN_DIR)} — ` +
      'the scan directory looks stale (a reorg?). Refusing to silently report "OK".',
  )
  process.exit(1)
}

const findings = []
for (const file of files) {
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

// Ratchet, not a hard ban: Phase 3 migrates screens to the ui/ primitives
// incrementally, so a fixed legacy baseline is allowed to pass — but the
// count may never grow. This is what lets `npm run lint` mean something
// again today instead of being permanently red until every screen migrates.
let baseline = 0
try {
  baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')).count ?? 0
} catch {
  baseline = 0
}

if (findings.length > baseline) {
  console.error(
    `\n${findings.length} raw-literal findings in src/features (baseline: ${baseline}) — ` +
      `new violations were introduced. Use a design token or a ui/ primitive instead.`,
  )
  process.exit(1)
}

console.log(
  `\n${findings.length} raw-literal findings in src/features, within the ${baseline}-finding ` +
    'legacy baseline (Phase 3 migrates these screen by screen). No new violations — OK.',
)
if (findings.length < baseline) {
  console.log(
    `(Down from ${baseline} — lower scripts/style-tokens-baseline.json's "count" to ` +
      `${findings.length} to lock in the improvement.)`,
  )
}
process.exit(0)

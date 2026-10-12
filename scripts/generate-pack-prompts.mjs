#!/usr/bin/env node
/**
 * PACK PROMPTS (round 136) — embed the v5r prompt TEXT into the pack that carries the v5r line's semantics.
 *
 * WHY (measured): the v5r containment table reached fifty-six of fifty-six tools, and the remaining axis was the
 * one that cannot be closed inside the framework: the prompt TEXT. vmu holds POLICY by design (`packs/v5r-core.js`
 * was a hundred and twenty-one lines of settings, codes, rules and aliases), while the v5r line's instructions live
 * as text. The owner's instruction is to contain the line completely, so the text belongs in the PACK - and this
 * generator is what stops the pack from being a second, drifting copy: it reads the corpus once and writes the
 * module, and it records the corpus sha256 INSIDE the module so any later difference is a check failure rather than
 * a silent divergence.
 *
 * USAGE: node scripts/generate-pack-prompts.mjs [--check]
 *   without --check it writes packs/v5r-prompts.js; with it, drift is a FAILURE (that is what the chain calls).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const CORPUS_REL = 'prompt-corpus-v5/prompt-corpus-v5.json'
const CORPUS = join(REPO, CORPUS_REL)
const OUT = join(REPO, 'vibe-math-vmu', 'packs', 'v5r-prompts.js')
const CHECK = process.argv.includes('--check')

const raw = readFileSync(CORPUS)
const sha = createHash('sha256').update(raw).digest('hex')
const corpus = JSON.parse(String(raw))

if (!Array.isArray(corpus.prompts) || corpus.prompts.length === 0) {
  console.error('FAIL - pack prompts: the corpus has no `prompts` array (' + CORPUS_REL + ')')
  process.exit(1)
}

/**
 * ROUND 358 - FROM SNAPSHOT TO FRAGMENT (docs/26 section 3.9). The capture is a snapshot of ONE run: measuring it
 * found twenty-four literal round numbers, sixty-six texts naming a concrete member and sixty-six literal quorum
 * numbers. Everything else is fixed prose. So the variable parts become placeholders HERE, in the generator, while the
 * capture keeps the raw text as evidence - and the rules are LISTED rather than guessed, because a clever pattern
 * would quietly rewrite prose. Order matters: the member header is consumed first, or the round rule would leave the
 * name behind inside it.
 */
const PLACEHOLDER_RULES = [
  [/【\s*第\s*\d+\s*轮\s*——\s*[^】]+】/g, '【第 {{ round }} 轮 —— {{ role }} {{ member }}】'],
  [/院士\s*acad/g, '{{ role }} {{ member }}'],
  [/常驻研究员\s*r-\d+/g, '{{ role }} {{ member }}'],
  [/临时工\s*t-\d+/g, '{{ role }} {{ member }}'],
  [/你是\s*(?:acad|r-\d+|t-\d+)/g, '你是 {{ member }}'],
  [/Members\/(?:acad|r-\d+|t-\d+)/g, 'Members/{{ member }}'],
  [/^(\[在册\]\s*)[^\n]+/gm, '$1{{ roster }}'],
  [/第\s*\d+\s*轮/g, '第 {{ round }} 轮'],
  [/m\s*=\s*\d+/g, 'm={{ quorum }}'],
]
const templated = (raw) => {
  let out = raw
  const counts = []
  for (const [re, to] of PLACEHOLDER_RULES) {
    const hits = out.match(re)
    if (hits) counts.push(re.source + ' x' + hits.length)
    out = out.replace(re, to)
  }
  return { text: out, counts }
}

/** One entry per prompt, with a STABLE id: the kind plus its ordinal within that kind. */
const seen = new Map()
const placeholderCounts = {}
const entries = corpus.prompts.map((p) => {
  const kind = String(p.kind === undefined || p.kind === null ? 'unnamed' : p.kind)
  const n = (seen.get(kind) || 0) + 1
  seen.set(kind, n)
  const raw = String(p.prompt === undefined || p.prompt === null ? '' : p.prompt)
  const t = templated(raw)
  if (t.counts.length) placeholderCounts[kind] = (placeholderCounts[kind] || 0) + t.counts.length
  return {
    id: kind + '#' + n,
    kind,
    owner: p.owner === undefined || p.owner === null ? null : String(p.owner),
    toolFilter: p.toolFilter === undefined ? null : p.toolFilter,
    charterChars: p.charterChars === undefined ? null : p.charterChars,
    text: t.text,
  }
})

const kinds = {}
for (const e of entries) kinds[e.kind] = (kinds[e.kind] || 0) + 1
const chars = entries.reduce((n, e) => n + e.text.length, 0)
const empty = entries.filter((e) => e.text.trim().length === 0).map((e) => e.id)

const header = [
  '// vibe-math-vmu — GENERATED FILE, do not edit by hand.',
  '//',
  '// The v5r line\'s prompt TEXT, embedded so the v5r pack carries the CONTENT axis and not only the policy axis.',
  '// Written by `scripts/generate-pack-prompts.mjs` from `' + CORPUS_REL + '`; the corpus sha256 is recorded below and',
  '// asserted by `tests/vmu-pack-prompts.test.mjs`, so a difference between this module and the corpus is a FAILURE',
  '// rather than a second copy nobody notices (the same discipline the Lean archive uses: cite, never drift).',
  '',
  "export const SOURCE_REL = " + JSON.stringify(CORPUS_REL),
  "export const SOURCE_SHA256 = " + JSON.stringify(sha),
  'export const COUNTS = Object.freeze(' + JSON.stringify({ total: entries.length, kinds: Object.keys(kinds).length, chars }, null, 2).replace(/\n/g, '\n') + ')',
  'export const KIND_HISTOGRAM = Object.freeze(' + JSON.stringify(kinds, null, 2).replace(/\n/g, '\n') + ')',
  '',
  '/** The prompt text, one entry per corpus prompt, in corpus order. `id` is `<kind>#<n>` and is stable. */',
  'export const PROMPTS = Object.freeze([',
]
const body = entries.map((e) => '  ' + JSON.stringify(e) + ',')
const footer = ['])', '', 'export default PROMPTS', '']
const next = header.concat(body, footer).join('\n')

if (empty.length) {
  console.error('FAIL - pack prompts: ' + empty.length + ' prompt(s) carry no text: ' + empty.slice(0, 5).join(', '))
  process.exit(1)
}

if (CHECK) {
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : ''
  if (current !== next) {
    console.error('FAIL - pack prompts: packs/v5r-prompts.js is not what ' + CORPUS_REL + ' yields'
      + ' (run `node scripts/generate-pack-prompts.mjs` to rewrite it)')
    process.exit(1)
  }
  console.log('  pack prompts: up to date (' + entries.length + ' prompts, ' + chars + ' chars, sha ' + sha.slice(0, 12) + ')')
} else {
  writeFileSync(OUT, next)
  console.log('  pack prompts: WROTE ' + entries.length + ' prompts (' + chars + ' chars, ' + Object.keys(kinds).length
    + ' kinds, sha ' + sha.slice(0, 12) + ') into vibe-math-vmu/packs/v5r-prompts.js')
}

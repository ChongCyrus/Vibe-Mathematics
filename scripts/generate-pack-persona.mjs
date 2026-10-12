// scripts/generate-pack-persona.mjs — turn the captured persona sections into a pack module (docs/26 section 3.7).
//
// WHY THIS EXISTS: the original hands each member a six-thousand-character charter, and measuring showed it is a
// STRUCTURED document: eleven blocks, of which six are identical for everyone, four vary by ROLE, and one - the
// roster - names the MEMBER, so it must be filled at assembly rather than frozen. This generator reads the capture
// (prompt-corpus-v5/persona-corpus-v5.json, produced by scripts/dev/capture-persona-corpus.mjs) and writes the pack
// module with the source hash recorded inside, so a difference between the module and the capture is a CHECK FAILURE
// rather than a second copy nobody notices - the same discipline the prompt corpus already follows.
//
// It imports NOTHING from the original: the extraction lives in the dev capture script, exactly as the prompt corpus
// keeps its extraction outside the shipped generator.
//
// USAGE: node scripts/generate-pack-persona.mjs [--check]   (--check makes drift a failure)

import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const SOURCE_REL = 'prompt-corpus-v5/persona-corpus-v5.json'
const OUT = join(REPO, 'vibe-math-vmu', 'packs', 'v5r-persona.js')
const CHECK = process.argv.includes('--check')

const raw = readFileSync(join(REPO, SOURCE_REL))
const sha = createHash('sha256').update(raw).digest('hex')
const corpus = JSON.parse(String(raw))
const roleIds = Object.keys(corpus.roles || {})
if (roleIds.length === 0) { console.error('FAIL - persona: the capture has no roles (' + SOURCE_REL + ')'); process.exit(1) }

// Reconstruct the assembly from the DOCUMENTED capture; the module records exactly this, nothing is re-derived.
const blockOrder = []
for (const id of roleIds) for (const b of corpus.roles[id].blocks) if (!blockOrder.includes(b.key)) blockOrder.push(b.key)
const textOf = (id, key) => { const b = corpus.roles[id].blocks.find((x) => x.key === key); return b ? b.text : null }
const headingOf = (key) => { for (const id of roleIds) { const b = corpus.roles[id].blocks.find((x) => x.key === key); if (b) return b.heading } return key }
const sectionName = (key) => key === 'opening' ? 'v5r-persona-opening' : 'v5r-persona-' + ({ s一: 'roster', s二: 'rules', s三: 'formats', s四: 'duties', s五: 'thresholds', s六: 'rhythm', s七: 'hiring', s八: 'taskboard', s九: 'discipline', s十: 'stopping' }[key] || key)

const identical = (key) => roleIds.every((id) => textOf(id, key) === textOf(roleIds[0], key))
// The capture splits AT the heading, so the body alone would lose the section title. The block key still carries the
// number (s二 => 二), so the title is reconstructed rather than dropped - measured: without this the assembled charter
// read as untitled prose and the sections could not be recognised by their own names.
const numbered = (key) => { const m = /^s([一二三四五六七八九十]+)$/.exec(key); return m ? m[1] : null }
// THE TWO DATA SLOTS (docs/26 section 3.8). The original marks them itself: the opening carries a "（尚未设定）" slot
// for the research objective, and the roster block states that the authoritative roster and quorum come from the
// per-turn state block and that the composition may change. Freezing either would publish a known-wrong charter, so
// both become PLACEHOLDERS the assembly fills - and the objective's setting default reproduces the original sentence
// exactly when nothing is configured.
const PLACEHOLDERS = {
  opening: (body) => body.replace(/（尚未设定）/, '{{ setting:vmu.turn.objective }}'),
  s一: (body) => body
    .replace(/^[ \t]*在册院士：.*$/m, '{{ roster }}')
    .replace(/^[ \t]*在册常驻研究员：.*\n?/m, '')
    .replace(/^[ \t]*在册临时工：.*\n?/m, ''),
}
const filled = (key, body) => (PLACEHOLDERS[key] ? PLACEHOLDERS[key](body) : body)
const titled = (key, body) => { const n = numbered(key); const b = filled(key, body); return n ? '【' + n + '、' + headingOf(key) + '】\n' + b : b }
const sections = blockOrder.map((key, i) => ({
  name: sectionName(key),
  order: 610 + i,                            // inside the pack range, after the corpus sections (600..666)
  range: 'pack',
  heading: headingOf(key),
  kind: identical(key) ? 'shared' : 'per-role-or-member',
  text: titled(key, textOf(roleIds[0], key)),   // the DEFAULT is the first captured role; bindings override per role
}))
const bindings = []
for (const key of blockOrder) {
  if (identical(key)) continue
  for (const id of roleIds) {
    const b = corpus.roles[id] && corpus.roles[id].blocks.find((x) => x.key === key)
    if (!b) continue
    bindings.push({ section: sectionName(key), role: corpus.roles[id].role, member: id, heading: b.heading, text: titled(key, b.text) })
  }
}

const module = `// vibe-math-vmu — GENERATED FILE, do not edit by hand.
//
// The persona SECTIONS the original composes per member (docs/26 section 3.7), captured once and cited here with the
// source hash. Measured shape: ${blockOrder.length} blocks, of which ${sections.filter((s) => s.kind === 'shared').length} are identical for every role and ${sections.filter((s) => s.kind !== 'shared').length} vary by role or name the member.
// A difference between this module and the capture is a CHECK FAILURE, never a silent drift.
//
// Written by \`scripts/generate-pack-persona.mjs\` from \`${SOURCE_REL}\`; the capture itself is done by
// \`scripts/dev/capture-persona-corpus.mjs\`, which is the ONLY place that touches the original.

export const SOURCE_REL = ${JSON.stringify(SOURCE_REL)}
export const SOURCE_SHA256 = ${JSON.stringify(sha)}
export const COUNTS = Object.freeze(${JSON.stringify({ blocks: blockOrder.length, roles: roleIds.length, shared: sections.filter((s) => s.kind === 'shared').length, perRole: sections.filter((s) => s.kind !== 'shared').length, chars: roleIds.reduce((n, id) => n + corpus.roles[id].chars, 0) }, null, 2)})

/** One section per persona block. \`kind\` says whether the block is shared or varies per role/member. */
export const PERSONA_SECTIONS = Object.freeze(${JSON.stringify(sections.map((s) => ({ name: s.name, order: s.order, range: s.range, source: 'v5r-persona:' + SOURCE_REL, text: s.text })), null, 2)})

/** One binding per varying block per role, so the assembly puts the right charter in front of the right member. */
export const PERSONA_BINDINGS = Object.freeze(${JSON.stringify(bindings.map((b) => ({ section: b.section, role: b.role, text: b.text })), null, 2)})

/** What each block IS, for a reader of the pack (the capture headings, kept for traceability). */
export const PERSONA_HEADINGS = Object.freeze(${JSON.stringify(Object.fromEntries(sections.map((s) => [s.name, s.heading])), null, 2)})
`

if (CHECK) {
  let current = null
  try { current = readFileSync(OUT, 'utf8') } catch { /* missing is drift */ }
  if (current !== module) { console.error('FAIL - pack persona: ' + OUT + ' is not what ' + SOURCE_REL + ' yields'); process.exit(1) }
  console.log('  pack persona: matches the capture (sha ' + sha.slice(0, 12) + ')')
  process.exit(0)
}
writeFileSync(OUT, module)
console.log('  wrote ' + OUT)
console.log('    blocks=' + blockOrder.length + ' shared=' + sections.filter((s) => s.kind === 'shared').length + ' per-role=' + sections.filter((s) => s.kind !== 'shared').length + ' bindings=' + bindings.length + ' sha=' + sha.slice(0, 12))
for (const s of sections) console.log('      ' + s.name.padEnd(26) + s.kind.padEnd(22) + s.heading.slice(0, 24))
process.exit(0)

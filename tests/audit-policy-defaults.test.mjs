// tests/audit-policy-defaults.test.mjs — R1 GATE UPGRADE (Round 5 / task-211).
//
// WHY THIS FILE EXISTS. `tests/audit-zpolicy.test.mjs` is the gate for R1 ("the kernel holds no institution-shaped
// mechanism decision"), and it is STRICT — but it only looks for **NAMES** (`GROUPS` at its :33-35: generation
// words, role names, mechanism names). `docs/acceptance/phase3-policy-vs-capability.md` measured the consequence:
// R3/R4 are satisfied (every key is declarable) while R1 is NOT, because the kernel's `settings/schema.js` hands
// out **institution-shaped DEFAULT VALUES** for keys whose names are perfectly neutral — `license.codeDefault:
// 'MIT'`, `compliance.saeLimitMs: 86400000`, `tenure.performanceCadenceDays: 180`, … A constant was written into a
// module first and then "extracted" into a key: the policy never left the kernel, it only became editable.
//
// ★ WHAT THIS GATE APPROXIMATES, AND WHAT IT DOES **NOT** COVER (read this before trusting it):
//   The criterion is a JUDGEMENT: "would a different institution have to change this default?"
//   This file MECHANISES one visible surface of it: **the declared `def:` literal**. A key whose `def` is
//   NON-NEUTRAL (see NEUTRAL below) must carry an explicit annotation in its own `doc` — the sanctioned marker
//   `capability-default: <why this default is a CAPABILITY, not a policy>`. Anything non-neutral without the
//   marker is RED.
//   IT DOES NOT COVER, and must not be read as clearing:
//     (a) **zero-valued defaults that are still policy** — `vmu.teaching.passMark` defaults to `0` ("不设") and is
//         counted NEUTRAL here, yet the census calls it a school's pass mark. Zero is accepted as neutral because
//         "0 = off/unlimited" is this repo's own convention; the cost is that policy hiding in a zero is invisible.
//     (b) **booleans that encode policy** — `false` is always neutral here (`teaching.allowAuditors: false` is a
//         teaching-regulation decision that this gate does not see).
//     (c) **domains that are institutional even when the default is neutral**, and (d) whether any module actually
//         reads the key. Both belong to the census, not to this check.
//   A marker is not an approval either: it is a place where the author must SAY why, so a reviewer can disagree.
//
// ★ THE NAMED REFUSAL PATH (what a future author writes when the default really is a capability):
//   put the sanctioned marker in that key's own `doc`, e.g.
//       { key: 'vmu.x.y', type: 'natural', def: 3, doc: "… capability-default: the number of retries the transport
//         performs; every institution retries, only the count differs and the count is a transport capability" }
//   The sanctioned token set is CLOSED (SANCTIONED_MARKERS below) — a different token is RED and the message names
//   the sanctioned one, so a typo cannot pass as an annotation.
//
// Run: node tests/audit-policy-defaults.test.mjs
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const SCHEMA = join(REPO, 'vibe-math-vmu', 'settings', 'schema.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) { passed += 1; return }
  failed += 1
  failures.push(name + (detail === undefined ? '' : ' — ' + String(detail)))
}

/** The sanctioned marker vocabulary. CLOSED on purpose: a new token must be added here, deliberately. */
const SANCTIONED_MARKERS = Object.freeze(['capability-default'])

/** Neutral literals: `0`/`false`/`''`/`[]`/`{}`/`null` and placeholder strings. Anything else is non-neutral. */
const NEUTRAL_STRING_PLACEHOLDERS = Object.freeze(["''", "'(unspecified)'", "'(none)'", "'(off)'"])
const isNeutralLiteral = (lit) => {
  const s = String(lit).trim()
  return s === '0' || s === 'false' || s === 'null' || s === "''" || s === '[]' || s === '{}' ||
    NEUTRAL_STRING_PLACEHOLDERS.includes(s)
}

/**
 * Scan a schema source text. Returns { rows, nonNeutral, unmarked, badMarker, keyCount }.
 * Textual on purpose: this repo extracts from sources rather than re-running them (see audit-code-size,
 * generate-zero-mechanism-matrix), and a textual scan cannot be fooled by a default that is computed at runtime.
 */
export function scanSchema(text) {
  const rows = []
  for (const line of String(text).split('\n')) {
    const k = line.match(/key:\s*'([^']+)'/)
    if (!k) continue
    const d = line.match(/def:\s*('(?:[^'\\]|\\.)*'|\[[^\]]*\]|\{[^}]*\}|-?\d+(?:\.\d+)?|true|false|null)\s*,/)
    if (!d) continue
    const marker = line.match(new RegExp('(' + SANCTIONED_MARKERS.join('|') + '):\\s*([^\'"]{3,})'))
    rows.push({ key: k[1], def: d[1].trim(), nonNeutral: !isNeutralLiteral(d[1]), marked: !!marker, markerReason: marker ? marker[2].trim() : null })
  }
  const nonNeutral = rows.filter((r) => r.nonNeutral)
  const unmarked = nonNeutral.filter((r) => !r.marked)
  return { rows, nonNeutral, unmarked, keyCount: rows.length }
}

// ── 1. THE CLASSIFIER, BOTH WAYS (this must never become toothless) ───────────────────────────────────────
{
  const probe = (def) => `  { key: 'vmu.probe.k', type: 'string', def: ${def}, doc: 'probe' },`
  ok(!scanSchema(probe("''")).rows[0].nonNeutral, 'C1. def: \'\' is NEUTRAL (the majority shape)')
  ok(!scanSchema(probe('0')).rows[0].nonNeutral, 'C2. def: 0 is NEUTRAL (0 = off/unlimited is this repo\'s convention — see limit (a))')
  ok(!scanSchema(probe('false')).rows[0].nonNeutral, 'C3. def: false is NEUTRAL (see limit (b))')
  ok(!scanSchema(probe('[]')).rows[0].nonNeutral, 'C4. def: [] is NEUTRAL')
  ok(scanSchema(probe("'MIT'")).rows[0].nonNeutral, 'C5. ★ def: \'MIT\' is NON-NEUTRAL — a named license is an institution\'s choice')
  ok(scanSchema(probe('86400000')).rows[0].nonNeutral, 'C6. ★ a nonzero number is NON-NEUTRAL — a 24h regulatory deadline is policy')
  ok(scanSchema(probe('true')).rows[0].nonNeutral, 'C7. ★ def: true is NON-NEUTRAL — "default on" is a substantive choice')
  ok(scanSchema(probe("['handover','keys']")).rows[0].nonNeutral, 'C8. ★ a NON-EMPTY list is NON-NEUTRAL — a checklist is institutional')
  const marked = scanSchema(probe("'MIT'").replace('doc: \'probe\'', "doc: 'capability-default: the transport ships this default and every deployment may override it'"))
  ok(marked.rows[0].marked && marked.unmarked.length === 0, 'C9. ★ the sanctioned marker clears it (the NAMED REFUSAL PATH)', JSON.stringify(marked.unmarked))
}

// ── 2. THE LIVE SCHEMA (backlog frozen: this list may SHRINK, never grow) ──────────────────────────────────
// ★ THE FROZEN BACKLOG. Measured on the schema revision this file was written against: **635 of 1108 rows** have a
// NON-NEUTRAL default and NOT ONE carries the annotation. ★ That number IS this task's finding — the gate states the
// scale of the debt honestly instead of being toothless, and it does not pretend 635 keys were reviewed one by one.
// This number may SHRINK (fix a default, or annotate a key that really is a capability ⇒ lower it) and must NEVER
// GROW: a new institution-shaped default arriving without the annotation raises the count and this assertion goes RED.
const KNOWN_UNMARKED_COUNT = 634
{
  const { keyCount, nonNeutral, unmarked } = scanSchema(readFileSync(SCHEMA, 'utf8'))
  const names = unmarked.map((r) => r.key).sort()
  console.log('schema rows read         : ' + keyCount)
  console.log('non-neutral defaults     : ' + nonNeutral.length)
  console.log('of those, UNMARKED       : ' + unmarked.length + '   (frozen backlog: ' + KNOWN_UNMARKED_COUNT + ')')
  console.log('neutral (not fired on)   : ' + (keyCount - nonNeutral.length))
  console.log('★ the unmarked set in full — diff THIS against the revision that recorded ' + KNOWN_UNMARKED_COUNT + ':')
  console.log('  ' + JSON.stringify(names))
  ok(unmarked.length === KNOWN_UNMARKED_COUNT,
    'L1. ★ the non-neutral-default backlog may SHRINK, never GROW: a new institution-shaped default without the sanctioned annotation is RED',
    'was ' + KNOWN_UNMARKED_COUNT + ', now ' + unmarked.length +
    (unmarked.length > KNOWN_UNMARKED_COUNT
      ? ' — a NEW default arrived: neutralise it, or annotate the key with ' + SANCTIONED_MARKERS.join('|') + ': <why this is a CAPABILITY, not a policy>. The full current list is printed above; the new key(s) are the ones absent from the previous revision\'s list.'
      : ' — the debt SHRANK: lower KNOWN_UNMARKED_COUNT to ' + unmarked.length + ' to record the improvement (this is a nudge to keep the record honest, not a defect).'))
}

// ── 3. THE COPY-BASED DEMONSTRATION: today's schema is RED; neutralised ⇒ GREEN ────────────────────────────
{
  const dir = mkdtempSync(join(tmpdir(), 'vmu-policy-gate-'))
  const src = readFileSync(SCHEMA, 'utf8')
  // (a) today's schema, fed through the checker as a COPY: it must be RED, naming keys.
  const today = scanSchema(src)
  const redOnCopy = today.unmarked.length > 0
  writeFileSync(join(dir, 'schema-today.js'), src)
  ok(redOnCopy, 'D1. ★ RED on a COPY of today\'s schema — it names ' + today.unmarked.length + ' unmarked non-neutral default(s)',
    JSON.stringify(today.unmarked.slice(0, 6).map((r) => r.key + '=' + r.def)))
  // (b) the same copy with every non-neutral default NEUTRALISED ⇒ GREEN (nothing to report).
  let neutralised = src
  for (const r of today.nonNeutral) {
    neutralised = neutralised.replace(new RegExp('(key:\\s*\'' + r.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\'[^\\n]*?def:\\s*)(' + r.def.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'm'), '$1' + (r.def.startsWith("'") ? "''" : (r.def === 'true' || r.def === 'false' ? 'false' : (r.def.startsWith('[') ? '[]' : '0'))))
  }
  const after = scanSchema(neutralised)
  writeFileSync(join(dir, 'schema-neutralised.js'), neutralised)
  ok(after.unmarked.length === 0, 'D2. ★ GREEN once the non-neutral defaults are neutralised (the red side was not a constant)',
    JSON.stringify(after.unmarked.slice(0, 6).map((r) => r.key)))
  // (c) a PLANTED new non-neutral default on the neutralised copy ⇒ RED naming exactly that key.
  const planted = neutralised.replace(/export const SETTING_DEFS/, "const PLANTED = { key: 'vmu.planted.meritLine', type: 'natural', def: 67, doc: 'a newly planted institution-shaped default' }\nexport const SETTING_DEFS")
  const plantedScan = scanSchema(planted)
  ok(plantedScan.unmarked.some((r) => r.key === 'vmu.planted.meritLine'),
    'D3. ★ a NEWLY planted non-neutral default is caught BY NAME (the gate is not merely a frozen list)',
    JSON.stringify(plantedScan.unmarked.map((r) => r.key).slice(0, 5)))
  try { rmSync(dir, { recursive: true, force: true }) } catch { /* the temp dir stays */ }
}

console.log('\n=== VMU POLICY DEFAULT GATE: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)

#!/usr/bin/env node
// R37 / task-174 — RECOMPUTABLE FIXTURE for the R34 real-machine truncation reading.
//
// WHY THIS FILE EXISTS
//   R34 (2026-10-15 23:25:02, session-ce7f04ec-a205-43ef-9d2c-9b02fe97aa29) produced the FIRST real-machine
//   `receiptMeta.truncated:true`, by putting a 14,000-character string into `config.vmu.turn.instituteName`
//   through an overlay. The receipt kept only 2,000 characters of that leaf, so anyone who wanted to check
//   "the kept segment is a PREFIX of the original" needed the original — and the input copy lived in `D:\_tmp`
//   (not version-controlled). This file fixes that by stating the input's GENERATION RULE verbatim.
//
// THE RULE (verbatim, deterministic, no file needed):
//      original = 'ABCDEFGHIJ'.repeat(1400)        // 10 * 1400 = 14,000 characters
//                                      sha256(original) = 9AB9D27F942BD37F... (first 16 hex: 9AB9D27F942BD37F)
//   The overlay line that fed it (same file, `rows: vibe-math-vmu: vmu: turn: { instituteName: '<original>' }`):
//      turn: { instituteName: 'ABCDEFGHIJABCDEFGHIJ…(×1400)…' }
//
// WHAT THIS SCRIPT CHECKS (all against the RETAINED R34 RECEIPT, not a new run)
//   1. rebuild the original from the rule above;
//   2. read the retained full receipt (the host SPILL, the only copy that is not elided — see below);
//   3. recompute: `original.slice(0, from) + MARKER === kept` , `to === original.length` , `bytes === to - from`;
//   4. print the falsifiable numbers (lengths + sha256 of kept/original) so a reader can re-derive them.
//
// HONEST SCOPE: this recomputes the R34 reading. It does NOT re-run a real machine (that would be a new
//   session and is explicitly marked as NOT done in the R37 report).
import { readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'

const MARKER = '…[elided]'
const RULE = "'ABCDEFGHIJ'.repeat(1400)"
const original = 'ABCDEFGHIJ'.repeat(1400)
const sha = (s) => createHash('sha256').update(s).digest('hex')
console.log('rule           =', RULE)
console.log('original.length=', original.length, '| sha256 =', sha(original).slice(0, 16).toUpperCase())

// the retained R34 receipt (host spill; the transcript copy of this run was 49,930 chars = elided + host `[...]`)
const CANDIDATES = [
  'C:/Users/admin/AppData/Local/Temp/1/dsh-spill-anvuBo/session-18bb6bd1fc87/d76be52b7209-vibe_vmu_status.txt',
]
const EXPECT_SHA16 = '1A64C62814662CEF'
const EXPECT_BYTES = 182374
const path = CANDIDATES.find((p) => existsSync(p))
if (!path) {
  console.log('\nRETAINED RECEIPT NOT FOUND — the recomputation cannot run here.')
  console.log('What is still enough to redo it elsewhere: the rule above + the elided entry + the kept value recorded')
  console.log('in _handoff/vmu/assistant-round37-report.md (kept === original.slice(0,2000) + MARKER, see below).')
} else {
  const raw = readFileSync(path)
  const text = raw.toString('utf8')
  console.log('\nreceipt        =', path)
  console.log('receipt.bytes  =', raw.length, '| sha256 =', sha(text).slice(0, 16).toUpperCase(),
    '| matches the recorded hash =', sha(text).slice(0, 16).toUpperCase() === EXPECT_SHA16, '| matches bytes =', raw.length === EXPECT_BYTES)
  const i = text.indexOf('"elided":[')
  const entryTxt = i < 0 ? null : text.slice(i, text.indexOf(']', i) + 1)
  let entry = null
  try { entry = JSON.parse('{' + entryTxt.replace(/^"elided":/, '"elided":').replace(/^\{/, '') + '}').elided[0] } catch { /* fall through to regex */ }
  if (!entry) { const m = /\{"path":"([^"]+)","from":(\d+),"to":(\d+),"bytes":(\d+)\}/.exec(entryTxt || ''); if (m) entry = { path: m[1], from: +m[2], to: +m[3], bytes: +m[4] } }
  console.log('elided[0]      =', JSON.stringify(entry))
  // the kept value: settings.resolved['vmu.turn.instituteName'].value
  const vi = text.indexOf('"vmu.turn.instituteName":{"value"')
  const kept = vi < 0 ? null : (/"value":"([^"]*)"/.exec(text.slice(vi, vi + 40000)) || [])[1]
  console.log('kept.length    =', kept ? kept.length : 'n/a', '| sha256(kept) =', kept ? sha(kept).slice(0, 16).toUpperCase() : 'n/a')
  const rebuilt = entry ? original.slice(0, entry.from) + MARKER : null
  const checks = [
    ['entry.path points at the leaf', entry && /vmu\.turn\.instituteName/.test(entry.path) && /\.value$/.test(entry.path.replace(/\[|\]/g, ''))],
    ['to === original.length', entry && entry.to === original.length, entry && entry.to + ' vs ' + original.length],
    ['bytes === to - from', entry && entry.bytes === entry.to - entry.from, entry && entry.bytes + ' vs ' + (entry.to - entry.from)],
    ['from === 2000 (= 200 × 10)', entry && entry.from === 2000, entry && entry.from],
    ['kept === original.slice(0,from) + MARKER', kept === rebuilt, kept ? kept.length + ' chars' : 'no kept value'],
    ['kept.slice(0,2000) === \'ABCDEFGHIJ\'.repeat(200)', !!kept && kept.slice(0, 2000) === 'ABCDEFGHIJ'.repeat(200)],
  ]
  console.log('\n--- recomputation (this is the pass anyone can redo) ---')
  let bad = 0
  for (const [name, okv, detail] of checks) { if (!okv) bad++; console.log(`  ${okv ? 'PASS' : 'FAIL'}  ${name}${detail === undefined ? '' : '   [' + detail + ']'}`) }
  console.log(`\nRESULT: ${bad === 0 ? 'ALL PASS' : bad + ' FAILED'}`)
}
console.log('\nNOTE: the R34 receipt predates the 8-key `elided` entry (path/from/to/bytes/keptBytes/keptHash/origHash/hash,')
console.log('      R36) — it carries the original 4-key form, so the check above is the PREFIX check. For a receipt with')
console.log('      the 8-key form, verify `keptHash`/`origHash` (sha256 of the kept value / of the rebuilt original) instead.')

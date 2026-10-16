// tests/audit-pack-json.test.mjs — Round 12/256 · task-244: THE GATE THAT WAS MISSING WHEN A COMMITTED PACK DEFAULT
// WAS INVALID JSON.
//
// WHAT ACTUALLY HAPPENED. `vibe-math-vmu/packs/v5r/settings/defaults.json` was INVALID JSON (a missing trailing comma
// on the line `"vmu.reviewers.maxLoad": 3`) and that broken state was COMMITTED (`e5ac20d`). It survived because
// (a) NO GATE PARSED THE PACK'S DATA FILES, and (b) the suite that does parse it (`b1prime-pack-fold`) was not run in
// the rounds that edited it. Two batches appended to that file in consecutive rounds - which is exactly how an
// append-only data file accumulates this class of damage. The error finally surfaced when an unrelated probe read the
// file, and the message pointed at a line that was itself a badly targeted repair.
//
// WHAT THIS GATE CHECKS (pack DATA files only):
//   ① every `*.json` under `vibe-math-vmu/packs/**` PARSES;
//   ② no object has a DUPLICATE key. `JSON.parse` silently allows duplicates and lets the LAST one win, which is a
//      silent overwrite - the same family as the "pack section silently replaced" defect. That needs a small scan
//      rather than `JSON.parse`, so `duplicateKeyAt()` below does it textually (see its own note).
//
// ★ WHAT IT DOES NOT CATCH (stated here because a gate that overstates itself is worse than one that states its limits):
//   · it does NOT check that a key is DECLARED in `settings/schema.js`, nor that its VALUE is inside the declared
//     domain - that is the value layer, and this repo already has a gate for it (`audit-pack-value-domain`; see the
//     run list). This gate is about the FILE BEING READABLE AT ALL, which is the precondition for that one to run.
//   · it does NOT check that a declared key is MEANINGFUL or that anything READS it (that is `generate-vmu-settings-table`'s
//     `hasConsumer` face, reported in `docs/04 §11`).
//   · it does NOT validate any NON-JSON pack file (`index.js`, `*.md`), and it does not run the pack.
//   · duplicate detection is TEXTUAL, not a JSON parser: it can be fooled by pathological content inside strings. It is
//     built CONSERVATIVE - a duplicate is only reported when the SAME key string occurs twice in the SAME object frame -
//     so an unfamiliar JSON file cannot make it red by accident; if it ever does, the message names the key and the line.
//
// Run: node tests/audit-pack-json.test.mjs
import { readFileSync, readdirSync, existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const PACKS = join(REPO, 'vibe-math-vmu', 'packs')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => { if (cond) { passed += 1; return } failed += 1; failures.push(name + (detail === undefined ? '' : ' — ' + String(detail))) }

/** Every `*.json` under `packs/**` (recursive; node_modules is not expected there but is skipped anyway). */
export function packJsonFiles(dir = PACKS) {
  const out = []
  const walk = (d) => {
    if (!existsSync(d)) return
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name === 'node_modules') continue
      const p = join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name.endsWith('.json')) out.push(p)
    }
  }
  walk(dir)
  return out.sort()
}

/** Parse result for a JSON text: { ok, message } (never throws). */
export function parses(text) {
  try { JSON.parse(text); return { ok: true, message: null } } catch (e) { return { ok: false, message: String((e && e.message) || e) } }
}

/**
 * The first DUPLICATE key inside the same object frame, or null. Conservative textual scan: frames are tracked by
 * `{`/`}`, and a string followed by `:` is treated as a key of the CURRENT frame. Arrays of strings are harmless
 * (a bare string inside an array is not followed by `:`), which is what keeps this from firing on ordinary files.
 */
export function duplicateKeyAt(text) {
  const stack = []
  let i = 0
  let line = 1
  while (i < text.length) {
    const c = text[i]
    if (c === '\n') { line += 1; i += 1; continue }
    if (c === '{') { stack.push(new Map()); i += 1; continue }
    if (c === '}') { stack.pop(); i += 1; continue }
    if (c === '"') {
      let j = i + 1
      let str = ''
      while (j < text.length) {
        if (text[j] === '\\') { str += text[j + 1] || ''; j += 2; continue }
        if (text[j] === '"') break
        if (text[j] === '\n') line += 1
        str += text[j]; j += 1
      }
      let k = j + 1
      while (k < text.length && /\s/.test(text[k])) { if (text[k] === '\n') line += 1; k += 1 }
      if (text[k] === ':' && stack.length > 0) {
        const frame = stack[stack.length - 1]
        if (frame.has(str)) return { key: str, line: frame.get(str), againAt: line }
        frame.set(str, line)
      }
      i = j + 1
      continue
    }
    i += 1
  }
  return null
}

// ── 1. THE LIVE TREE: every pack data file parses and has no duplicate keys ────────────────────────────────
const files = packJsonFiles()
{
  ok(files.length > 0, 'L1. the pack tree was actually found (an empty scan must not read as "all clean")', PACKS)
  const bad = []
  const dupes = []
  for (const f of files) {
    const rel = f.replace(REPO + '\\', '').replace(/\\/g, '/')
    const text = readFileSync(f, 'utf8')
    const p = parses(text)
    if (!p.ok) bad.push(rel + ': ' + p.message)
    const d = duplicateKeyAt(text)
    if (d) dupes.push(rel + ': "' + d.key + '" at line ' + d.againAt + ' (first at line ' + d.line + ')')
  }
  const rels = files.map((f) => f.replace(REPO + '\\', '').replace(/\\/g, '/'))
  ok(bad.length === 0, 'L2. ★ every pack data file under packs/** PARSES (the defect that shipped once)', JSON.stringify(bad))
  ok(dupes.length === 0, 'L3. ★ no object in a pack data file has a DUPLICATE key (JSON.parse would let the last one win silently)', JSON.stringify(dupes))
  // ★ the neutral majority: state what was NOT fired on, so the gate cannot pass by scanning nothing.
  ok(rels.length === files.length && files.length >= 3, 'L4. the scan covers every file it found (counts are reported below)', rels.length + '/' + files.length)
  console.log('pack data files scanned  : ' + files.length)
  console.log('  parsed OK              : ' + (files.length - bad.length))
  console.log('  duplicate-key files    : ' + dupes.length)
  console.log('  files                  : ' + JSON.stringify(rels, null, 0))
}

// ── 2. COPY-BASED COUNTEREXAMPLE: the EXACT defect of this round must be RED ───────────────────────────────
{
  const dir = mkdtempSync(join(tmpdir(), 'vmu-pack-json-'))
  const target = join(PACKS, 'v5r', 'settings', 'defaults.json')
  const good = readFileSync(target, 'utf8')
  // (a) the exact damage: remove ONE comma that separates two KEYED entries ("a missing comma between two keyed
  //     entries"), which is what `"vmu.reviewers.maxLoad": 3` was missing.
  const damaged = good.replace(/,\n(\s*)"[^"\n]+":/, '\n$1"REMOVED_COMMA":')   // the separator is gone; the entry stays
  const damagedFixed = damaged.replace('"REMOVED_COMMA"', '"vmu.reviewers.maxLoad"')
  writeFileSync(join(dir, 'missing-comma.json'), damagedFixed)
  const pDamaged = parses(damagedFixed)
  writeFileSync(join(dir, 'clean.json'), good)
  ok(pDamaged.ok === false, 'D1. ★ RED on a COPY carrying the exact defect (a missing comma between two keyed entries)', JSON.stringify(pDamaged))
  ok(parses(good).ok === true, 'D2. ★ GREEN on the real (repaired) file — the red side was not a constant', null)
  // (b) DUPLICATE KEY: `JSON.parse` ACCEPTS it (the last one wins) — so the SCANNER is what must catch it.
  // ★ THE PROBE IS SYNTHETIC ON PURPOSE, and my first attempt is why: I injected a flat `"vmu.reviewers.maxLoad"` at
  // the root of the real file, and the scanner correctly answered null — because a duplicate only exists when the SAME
  // key occurs twice in the SAME object frame, and that file's keys are not all flat at the root. So the ASSERTION was
  // wrong, not the scanner. This probe uses an object where the duplicate is unambiguous, and D5 keeps the real-file
  // evidence (the clean file must scan clean, or the scanner would be simply always-red).
  const duped = '{\n  "a.b": 1,\n  "c.d": 2,\n  "a.b": 3\n}'
  writeFileSync(join(dir, 'duplicate-key.json'), duped)
  const d = duplicateKeyAt(duped)
  ok(parses(duped).ok === true, 'D3. JSON.parse itself ACCEPTS a duplicate key (which is why a scan is needed)', null)
  ok(d !== null && d.key === 'a.b', 'D4. ★ RED on a duplicate-key COPY, naming the key (the silent overwrite JSON.parse allows)', JSON.stringify(d))
  const clean = duplicateKeyAt(good)
  ok(clean === null, 'D5. ★ and GREEN on the real file for the same scan (the scanner is not simply always-red)', JSON.stringify(clean))
  try { rmSync(dir, { recursive: true, force: true }) } catch { /* the temp dir stays */ }
}

console.log('\n=== VMU PACK-JSON GATE: ' + passed + ' passed, ' + failed + ' failed ===')
console.log('LIMITS: validates the pack DATA files (parseability + duplicate keys) only. It does NOT check that a key is')
console.log('        declared in settings/schema.js or that its value is in the declared domain (the value-layer gate does),')
console.log('        does NOT check that a key is meaningful or read by anything, does NOT validate non-JSON pack files,')
console.log('        and its duplicate detection is a CONSERVATIVE textual scan rather than a JSON parser.')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)

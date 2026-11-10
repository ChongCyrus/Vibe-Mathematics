// TB-2700 judge (RUN 2700): `settled` was ONE word answering two questions - the write-admission flag the gate consumes,
// and five different domain states the pack passed in (feedback closed, priority archived, script final, ruling decided).
// The kernel never stored it, so with vmu.records.requireSettledRecords=false (the v5r default) every domain value was
// silently dropped. This judge pins the rename to `finalAck` (the caller DECLARES this write final), the gate wording
// that says it is a WRITE ADMISSION and NOT a stored state, and the receipt that can answer "is this row final, who
// declared it" (finalAck / finalAckSource / finalAckBy) without persisting the flag on the row.
// Run: node tests/vmu-run2700-settled-finalack.test.mjs     Last line: === VMU RUN 2700: N passed, M failed ===
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createRecords } from '../vibe-math-vmu/kernel/records.js'

let passed = 0
let failed = 0
function ok(cond, label) { if (cond) { passed += 1 } else { failed += 1; console.log('FAIL ' + label) } }
function throwsNamed(fn, code, label) {
  try { fn(); failed += 1; console.log('FAIL ' + label + ' (no refusal)'); return null }
  catch (e) {
    if (e && e.code === code) { passed += 1; return e }
    failed += 1; console.log('FAIL ' + label + ' (code=' + (e && e.code) + ' want ' + code + ')'); return null
  }
}
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => readFileSync(join(REPO, rel), 'utf8')
const S = (extra = {}) => Object.assign({ 'vmu.records.requireSettledRecords': false }, extra)

// -- 0. source pins: the rename is the rename, and the old word is gone from the gate --------------------------------
{
  const src = read('vibe-math-vmu/kernel/records.js')
  ok(src.includes('finalAck = undefined, finalAckSource = null, settled = undefined'), '0a put carries finalAck (undefined = not named) and the legacy settled alias')
  ok(src.includes('if (requireSettled && !admitted)'), '0b the gate consumes the admission, and the old word is only an alias')
  ok(!src.includes('requireSettled && finalAck !== true'), '0b2 the strict-only gate is gone')
  ok(!src.includes('settled !== true'), '0c the old phrase settled !== true is gone from the gate')
  ok(src.includes('ACKNOWLEDGES the record is final'), '0d the message says the caller ACKNOWLEDGES finality')
  ok(src.includes('WRITE ADMISSION, not a stored state'), '0e the message says it is a write admission, not a stored state')
  ok(src.includes('finalAck:true once this write is final'), '0f the hint names the real exit finalAck:true')
  ok(src.includes('never persisted'), '0g the hint says the flag is consumed and never persisted')
  ok(src.includes('finalAck: admitted,'), '0h the receipt reports the admission as a boolean')
  ok(src.includes("const admissionSource = finalAck === true ? (settled === true ? 'final-ack' : String(finalAckSource || 'caller')) : (settled === true ? 'legacy-settled' : null)"), '0i the receipt source names caller / final-ack / legacy-settled')
  ok(src.includes('finalAckSource: admissionSource,'), '0i5 the receipt prints the admission source')
  ok(src.includes("finalAck !== undefined && settled !== undefined && finalAck !== settled"), '0i6 a declared CONFLICT between the new word and the alias is detected')
  ok(src.includes('finalAck and settled name DIFFERENT answers'), '0i7 the conflict is a NAMED refusal, not an either-true pass')
  ok(src.includes('const admitted = finalAck === true || settled === true'), '0i2 the gate ADMITS either the new declaration or the deprecated alias, in one place')
  ok(src.includes('if (requireSettled && !admitted)'), '0i3 the gate reads admitted, not the old word')
  ok(src.includes('deprecated alias for the old settled:true word'), '0i3b the means names the word a deprecated alias')
  ok(src.includes('accepted for compatibility'), '0i4a the means says it is accepted for compatibility')
  ok(src.includes('to be removed after callers migrate'), '0i4b the means carries the removal plan')
  ok(src.includes('finalAckBy: mergedBy'), '0j the receipt reports WHO declared (finalAckBy)')
  ok(src.split('tags, finalAck, settled, by })').length - 1 === 2, '0k datasetRegister and rebuttal forward finalAck AND the legacy alias to put')
  ok(src.includes("finalAckSource: 'reindex-adopt'"), '0l reindex adoption declares its source')
  ok(src.includes("finalAckSource: 'rehydrate'"), '0m rehydrate declares its source')
  const dirs = read('vibe-math-vmu/kernel/directions.js')
  ok(dirs.includes('finalAck: true'), '0n directions writes declare finality explicitly')
  const env = read('vibe-math-vmu/kernel/env.js')
  ok(env.includes('finalAck: false'), '0o env reports declare that they are NOT final')
  const index = read('vibe-math-vmu/kernel/index.js')
  ok(index.includes("finalAckSource: 'rehydrate'"), '0p the kernel hydration declares rehydrate as the source')
  const pack = read('vibe-math-vmu/packs/v5r/tools.js')
  ok(!pack.includes('settled: false, by: str(args.member)'), '0q prioritize no longer passes a domain false as admission')
  ok(pack.includes("finalAck: has(args.status) && str(args.status) === 'closed'"), '0r feedback update declares finality only when closed')
  ok(pack.includes('finalAck: true,'), '0s script archive declares finality')
  ok(pack.includes('finalAck: value === 1 || value === 0'), '0t ruling fallback declares finality only for 0/1')
  ok((pack.split('finalAckSource: written ? written.finalAckSource : null').length - 1) === 3, '0u the three pack write receipts (feedback add / feedback update / script archive) echo the admission source')
  ok((pack.split('finalAckSource: wrote ? wrote.finalAckSource : null').length - 1) === 2, '0v the ruling settlement receipt names it at the top AND inside the settlement block the card receipt merges')
  const docs = read('vibe-math-vmu/docs/03-interface-contract.md')
  ok(docs.includes('deprecated 别名') && docs.includes('TB-2703'), '0w docs/03 records contract names the deprecated alias and the migration task')
}

// -- 1. knob off: the flag is an admission, and it is NOT persisted on the row --------------------------------------
{
  const r = createRecords({ clock: () => 0, settings: S() })
  const rec = r.put({ track: 'progress', kind: 'progress', title: 'draft', body: 'b', by: 'r-1' })
  ok(rec.ok === true, '1a a plain write still passes with the knob off')
  ok(rec.finalAck === false, '1b without the declaration the receipt reports finalAck:false')
  ok(rec.finalAckSource === null, '1c without the declaration the receipt reports no source')
  const oldWord = r.put({ track: 'progress', kind: 'progress', title: 'legacy off', body: 'lw', by: 'r-1', settled: true })
  ok(oldWord.ok === true && oldWord.finalAck === true && oldWord.finalAckSource === 'legacy-settled', '1c2 the legacy word is admitted even with the knob off, and the receipt names it legacy-settled')
  const stored = r.get({ id: rec.id })
  ok(stored.settled === undefined, '1d the row does not carry settled')
  ok(stored.finalAck === undefined, '1e the row does not carry finalAck (the flag is not persisted)')
  const final = r.put({ track: 'progress', kind: 'progress', title: 'final', body: 'final body', by: 'r-1', finalAck: true })
  ok(final.ok === true && final.finalAck === true, '1f the declaration reaches the receipt')
  ok(final.finalAckSource === 'caller', '1g the receipt says the source is the caller')
  ok(final.finalAckBy === 'r-1', '1h the receipt says WHO declared it')
  ok(r.get({ id: final.id }).finalAck === undefined, '1i even a declared-final row does not store the flag')
}

// -- 2. knob on: the gate consumes the declaration, and it no longer consumes the old word ----------------------------
{
  const strict = createRecords({ clock: () => 0, settings: S({ 'vmu.records.requireSettledRecords': true }) })
  const missing = throwsNamed(() => strict.put({ track: 'progress', kind: 'progress', title: 'x', body: 'y' }), 'VMU_STATE', '2a the gate still refuses a write with no declaration')
  ok(!!missing && String(missing.message).includes('ACKNOWLEDGES'), '2b the refusal names the acknowledgement it wants')
  ok(!!missing && /finalAck/.test(String(missing.hint)), '2c the refusal hint names finalAck:true')
  ok(strict.put({ track: 'progress', kind: 'progress', title: 'x', body: 'y', finalAck: true }).ok === true, '2d finalAck:true passes the gate')
  const legacy = strict.put({ track: 'progress', kind: 'progress', title: 'legacy word', body: 'w', settled: true })
  ok(legacy.ok === true && legacy.finalAck === true, '2e the deprecated settled:true still ADMITS the write (backward compatibility: ~120 existing callers pass it)')
  ok(legacy.finalAckSource === 'legacy-settled', '2f the old word is NAMED legacy-settled on the receipt - never dressed up as the new declaration')
  ok(String(legacy.finalAckMeans).includes('deprecated alias') && String(legacy.finalAckMeans).includes('accepted for compatibility') && String(legacy.finalAckMeans).includes('to be removed after callers migrate'), '2g the means carries the deprecation, the compatibility statement and the removal plan')
  const both = strict.put({ track: 'progress', kind: 'progress', title: 'both words', body: 'bw', finalAck: true, settled: true })
  ok(both.ok === true && both.finalAckSource === 'final-ack', '2f2 both words true: finalAck wins and the source says final-ack')
  const conflictA = throwsNamed(() => strict.put({ track: 'progress', kind: 'progress', title: 'conflict a', body: 'ca', finalAck: true, settled: false }), 'VMU_INVALID_ARGUMENT', '2f3 finalAck:true + settled:false is refused BY NAME (no either-true pass)')
  ok(!!conflictA && String(conflictA.message).includes('DIFFERENT answers') && String(conflictA.hint).includes('legacy alias'), '2f4 the conflict refusal names both words and the alias rule')
  const conflictB = throwsNamed(() => strict.put({ track: 'progress', kind: 'progress', title: 'conflict b', body: 'cb', finalAck: false, settled: true }), 'VMU_INVALID_ARGUMENT', '2f5 finalAck:false + settled:true is equally refused (the alias may not outvote an explicit no)')
  const noWord = throwsNamed(() => strict.put({ track: 'progress', kind: 'progress', title: 'x', body: 'y' }), 'VMU_STATE', '2h without either declaration the gate still refuses')
  ok(!!noWord && String(noWord.hint).includes('finalAck'), '2i the refusal points at the new word finalAck')
}

console.log('=== VMU RUN 2700: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) process.exit(1)

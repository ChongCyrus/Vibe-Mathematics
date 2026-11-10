// RUN 2699 (TB-2699 / F75-04) — proofRefState has ONE producer, and `unknown` means exactly NOT CHECKED.
//
// MEASURED on the 75th real-machine run: the card-write receipt answered `proofRefState:"resolved"` while the read face
// answered `"unknown"` for the SAME stored row. The two answers came from two producers with two value ranges:
//   * write face: resolved|missing|absent, decided from what the write itself resolved (and "resolved" could be printed
//     without measuring anything: no resolver, an absolute path, or a pointer naming a DIRECTORY);
//   * stored-row read face: absent|missing|unknown, decided WITHOUT resolving anything.
// NEW CONTRACT: `proofRefReadingOf` measures once per face, `proofRefStateOf` judges the four words, and the write
// receipt, the stored-row read face and the settlement read-back all call them. `unknown` is narrowed to mean NOT CHECKED,
// and every value travels with `proofRefStateChecked` + `proofRefStateMeans` (with a copyable next move) +
// `proofRefStateSource` (which face took the reading).
//
// This file is the judge for that contract. §1 is the four values (positive shapes), §2 is the anti-lamp that kills the
// two-producer disease, §3/§4 are the two failure shapes that used to masquerade as `resolved`, §5 pins F75-14 as
// ALREADY-TRUE (render does not compile; ok:true is acceptance, not completion).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const ENTRY = join(ROOT, 'vibe-math-vmu', 'vibe-math-vmu.js')
const TOOLS = join(ROOT, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js')
const PACK = readFileSync(TOOLS, 'utf8')
const toolsMod = await import(pathToFileURL(TOOLS).href)

let n = 0
const ok = (cond, msg, extra) => {
  n += 1
  assert.ok(cond, msg + (extra === undefined ? '' : '\\n' + JSON.stringify(extra, null, 2)))
}
const has = (hay, needle, msg) => ok(String(hay).includes(needle), msg + ' — missing: ' + needle)
const hasNot = (hay, needle, msg) => ok(!String(hay).includes(needle), msg + ' — found (must be gone): ' + needle)
const eq = (actual, expected, msg) => ok(actual === expected, msg, { actual, expected })
const R = (r) => r || { ok: false }

const tmp = () => mkdtempSync(join(tmpdir(), 'vmu-run2699-'))

async function boot(dir) {
  const entry = await import(pathToFileURL(ENTRY).href)
  const specs = []
  const ctx = { effect(fn) { return fn() }, on() { return () => {} }, tools: { async register(s) { specs.push(s); return () => {} } } }
  const handle = await entry.apply(ctx, { clock: () => 1000, packs: ['v5r'], root: dir })
  await handle.ready()
  await handle.kernel.store.open()
  const call = async (name, args = {}) => {
    const spec = specs.filter((x) => x && x.name === name)[0]
    if (!spec) return { ok: false, code: 'NO_SUCH_FACE', message: name }
    const raw = await spec.execute(args, { kernel: handle.kernel })
    return raw && typeof raw === 'object' ? raw : JSON.parse(String(raw))
  }
  return { handle, call, kernel: handle.kernel, specs }
}

const root = tmp()
const b = await boot(root)
for (const [id, slot] of [['acad-01', 'chair'], ['r-1', 'member'], ['r-2', 'member']]) {
  await b.kernel.members.hire({ id, slot, institution: 'sim' })
}
const libRoot = (() => {
  try { return b.kernel.library && typeof b.kernel.library.root === 'string' ? b.kernel.library.root : null } catch (e) { return null }
})()
ok(libRoot !== null, '§0 precondition: the kernel exposes a library root', { libRoot })
if (libRoot !== null) mkdirSync(libRoot, { recursive: true })
const writeProof = (name, text) => {
  mkdirSync(libRoot, { recursive: true })
  writeFileSync(join(libRoot, name), text)
  return name
}
const WRITE_SOURCE = 'write-resolution'
const READ_SOURCE = 'stored-row-read'

test('§0 the ONE producer is on the source that owns it (so §1-§4 cannot pass by accident)', () => {
  has(PACK, 'export function proofRefReadingOf(kernel, pointer)', '§0a ★★★ F75-04: the measurement is its own function')
  has(PACK, 'export function proofRefStateOf({ pointer = ' + String.fromCharCode(39) + String.fromCharCode(39) + ', reading = null', '§0b ★★★ F75-04: the judgement is its own function')
  has(PACK, 'const pointerState = proofRefStateOf({ pointer: pointerWord, reading, source: readSource })',
    '§0c ★★★ the stored-row gate takes its word from the judge')
  has(PACK, 'const writeProofStateOut = proofRefStateOf({ pointer: declaredProofRefWord, reading: writeProofReading, source: ' + String.fromCharCode(39) + WRITE_SOURCE + String.fromCharCode(39) + ' })',
    '§0d ★★★ the write receipt takes its word from the same judge')
  const readCalls = (PACK.match(/proofRefReadingOf\(kernel, fields\.proofRef\)/g) || []).length
  ok(readCalls >= 2, '§0e ★★★ both stored-row readers (plain read face + settlement read-back) measure the pointer', { readCalls })
  has(PACK, 'const proofGateFinal = Object.assign({}, proofGateOut', '§0f ★★ the receipt merges the lock branch with the judged pointer state')
  hasNot(PACK, 'proofRefStateOut', '§0g ★★★ the old second producer (proofRefStateOut) is gone')
  hasNot(PACK, "declaredProofRefWord !== '' ? 'resolved' : 'absent'", '§0h ★★★ the hardcoded write-face producer is gone')
})

test('§1 the four values are produced by the ONE judge, each with checked/means/source', async () => {
  // absent — nothing declared, nothing measured.
  const plain = R(await b.call('vibe_v5_record_proposition', {
    statement: 'r2699 plain', value: 'objects', motive: 'run2699 plain', p: 0.5, member: 'r-1',
  }))
  eq(plain.ok, true, '§1a precondition: a card with no proof fields is admitted', plain && { code: plain.code })
  eq(plain.proofRefState, 'absent', '§1b ★★★ absent when no pointer was declared')
  eq(plain.proofRefStateChecked, false, '§1c ★★★ absent is NOT a measurement')
  eq(plain.proofRefStateSource, WRITE_SOURCE, '§1d ★★ the receipt says which face judged it')
  has(String(plain.proofRefStateMeans || ''), '没有 `proof_ref`', '§1e ★★ the means says there was nothing to resolve')

  const missingName = 'r2699-missing-proof.md'
  const missing = R(await b.call('vibe_v5_record_proposition', {
    statement: 'r2699 missing', value: 'objects', motive: 'run2699 missing', p: 0.5,
    proof_state: 'complete', proof_ref: missingName, member: 'r-1',
  }))
  eq(missing.ok, true, '§1f precondition: complete with an unresolved pointer is admitted (lock deferred)', missing && { code: missing.code })
  eq(missing.proofRefState, 'missing', '§1g ★★★ missing when a declared pointer was CHECKED and did not resolve')
  eq(missing.proofRefStateChecked, true, '§1h ★★★ missing IS a measurement')
  has(String(missing.proofRefStateMeans || ''), 'reason=missing', '§1i ★★ the means names the reason')
  has(String(missing.proofRefStateMeans || ''), 'vibe_v5_record_proposition', '§1j ★★★ and the copyable next move names the tool')
  has(String(missing.proofRefStateMeans || ''), 'proof_ref', '§1k ★★ ...and the parameter')
  has(String(missing.proofRefStateMeans || ''), '库根', '§1l ★★ ...and that the file must live under the library root')

  const proofName = writeProof('r2699-proof.md', '# r2699 proof\\n\\ncomplete registration.\\n')
  const resolved = R(await b.call('vibe_v5_record_proposition', {
    statement: 'r2699 resolved', value: 'objects', motive: 'run2699 resolved', p: 0.5,
    proof_state: 'complete', proof_ref: proofName, member: 'r-1',
  }))
  eq(resolved.ok, true, '§1m precondition: complete with a resolving pointer is admitted and LOCKED', resolved && { code: resolved.code })
  eq(resolved.proofRefState, 'resolved', '§1n ★★★ resolved when the CHECKED pointer names a real file')
  eq(resolved.proofRefStateChecked, true, '§1o ★★★ resolved is a measurement')
  has(String(resolved.proofRefStateMeans || ''), '已检查', '§1p ★★ the means says it was checked')
  has(String(resolved.proofRefStateMeans || ''), proofName, '§1q ★★ and names the relative path it resolved')
  eq(resolved.proofGate && resolved.proofGate.proofRefState, 'resolved', '§1r ★★★ the gate carries the SAME word (one judge)')
  eq(resolved.proofGate && resolved.proofGate.proofRefStateChecked, true, '§1s ★★ ...and the same checked flag')

  // unknown — the only place it is produced now: a face that could not measure (no resolver). Proven in §3 directly.
  eq(toolsMod.proofRefStateOf({ pointer: 'x.md', reading: { checked: false, resolved: null, reason: 'no-resolver' }, source: READ_SOURCE }).proofRefState,
    'unknown', '§1t ★★★ unknown is the word for NOT CHECKED')
})

test('§2 R1 — the SAME stored row answers the SAME word on both faces (kills the two-producer disease)', async () => {
  writeProof('r2699-both.md', '# r2699 both\\n\\nproof.\\n')
  const made = R(await b.call('vibe_v5_record_proposition', {
    statement: 'r2699 both faces', value: 'objects', motive: 'run2699 both', p: 0.5,
    proof_state: 'complete', proof_ref: 'r2699-both.md', member: 'r-1',
  }))
  eq(made.ok, true, '§2a precondition: the card is filed', made && { code: made.code })
  const read = R(await b.call('vibe_v5_read_library', { id: made.recordId }))
  const card = read.card || null
  ok(card && typeof card === 'object', '§2b precondition: the read face returns the card', { keys: card ? Object.keys(card).slice(0, 8) : null })
  eq(made.proofRefState, 'resolved', '§2c precondition: the write receipt says resolved')
  eq(card && card.proofRefState, made.proofRefState, '§2d ★★★ F75-04: the read face answers the SAME word as the write receipt', { write: made.proofRefState, read: card && card.proofRefState })
  eq(card && card.proofRefStateChecked, true, '§2e ★★ and both say it was measured')
  eq(card && card.proofRefStateSource, READ_SOURCE, '§2f ★★ the read face names itself as the reading source')
  eq(made.proofRefStateSource, WRITE_SOURCE, '§2g ★★ and the write receipt names itself (one judgement, two reading moments)')

  const bad = R(await b.call('vibe_v5_record_proposition', {
    statement: 'r2699 both missing', value: 'objects', motive: 'run2699 both missing', p: 0.5,
    proof_state: 'complete', proof_ref: 'r2699-never-written.md', member: 'r-1',
  }))
  eq(bad.ok, true, '§2h precondition: the unresolved card is filed (lock deferred)', bad && { code: bad.code })
  const badRead = R(await b.call('vibe_v5_read_library', { id: bad.recordId }))
  eq(bad.proofRefState, 'missing', '§2i precondition: the write receipt says missing')
  eq(badRead.card && badRead.card.proofRefState, bad.proofRefState, '§2j ★★★ the read face agrees on missing too', { write: bad.proofRefState, read: badRead.card && badRead.card.proofRefState })

  const plain = R(await b.call('vibe_v5_record_proposition', {
    statement: 'r2699 both absent', value: 'objects', motive: 'run2699 both absent', p: 0.5, member: 'r-1',
  }))
  const plainRead = R(await b.call('vibe_v5_read_library', { id: plain.recordId }))
  eq(plain.proofRefState, 'absent', '§2k precondition: the plain card says absent on the write face')
  eq(plainRead.card && plainRead.card.proofRefState, 'absent', '§2l ★★★ and absent on the read face')
  eq(plainRead.card && plainRead.card.proofRefStateChecked, false, '§2m ★★ absent is unchecked on both faces')
})

test('§3 R2 — without a resolver the word is unknown + checked:false + a copyable next move (never resolved)', () => {
  const reading = toolsMod.proofRefReadingOf(null, 'r2699-anything.md')
  eq(reading.checked, false, '§3a ★★★ no resolver means the pointer was NOT checked')
  eq(reading.reason, 'no-resolver', '§3b ★★ and the reason says why')
  const state = toolsMod.proofRefStateOf({ pointer: 'r2699-anything.md', reading, source: READ_SOURCE })
  eq(state.proofRefState, 'unknown', '§3c ★★★ unmeasured is unknown, NOT resolved (the old write face said resolved)')
  eq(state.proofRefStateChecked, false, '§3d ★★★ and the flag says unchecked')
  has(String(state.proofRefStateMeans || ''), '未检查', '§3e ★★ the means starts by saying NOT CHECKED')
  has(String(state.proofRefStateMeans || ''), 'vibe_v5_read_library', '§3f ★★★ the next move is copyable')
  has(String(state.proofRefStateMeans || ''), 'NOT CHECKED', '§3g ★★ ...and the English phrase travels too, so a machine reader has it')
  hasNot(String(state.proofRefStateMeans || ''), 'resolved 成功', '§3h ★★★ the unchecked means never claims success')

  const absent = toolsMod.proofRefStateOf({ pointer: '', reading: toolsMod.proofRefReadingOf(null, ''), source: WRITE_SOURCE })
  eq(absent.proofRefState, 'absent', '§3i ★★ an empty pointer is absent (nothing to check), not unknown')

  const judged = toolsMod.proofRefStateOf({ pointer: 'x.md', reading: { checked: true, resolved: false, reason: 'missing' }, source: READ_SOURCE })
  eq(judged.proofRefState, 'missing', '§3j ★★ a CHECKED failure is missing, never unknown')
})

test('§4 R3 — an absolute path and a directory are CHECKED failures, not resolved', async () => {
  const abs = R(await b.call('vibe_v5_record_proposition', {
    statement: 'r2699 absolute', value: 'objects', motive: 'run2699 absolute', p: 0.5,
    proof_state: 'complete', proof_ref: 'D:/wd/tmp/r2699-absolute.md', member: 'r-1',
  }))
  eq(abs.ok, true, '§4a precondition: the absolute-pointer write is admitted (lock deferred)', abs && { code: abs.code })
  eq(abs.proofRefState, 'missing', '§4b ★★★ an ABSOLUTE pointer is missing (the old write face said resolved)')
  eq(abs.proofRefStateChecked, true, '§4c ★★ and it is a checked failure')
  has(String(abs.proofRefStateMeans || ''), 'reason=absolute', '§4d ★★ the reason is printed')
  eq(abs.proofGate && abs.proofGate.locked, false, '§4e ★★★ the lock is deferred on an absolute pointer')
  eq(abs.proofGate && abs.proofGate.reason, 'complete-but-pointer-unresolved', '§4f ★★ and the gate names its own reason')

  mkdirSync(join(libRoot, 'r2699-dir'), { recursive: true })
  const dir = R(await b.call('vibe_v5_record_proposition', {
    statement: 'r2699 directory', value: 'objects', motive: 'run2699 directory', p: 0.5,
    proof_state: 'complete', proof_ref: 'r2699-dir', member: 'r-1',
  }))
  eq(dir.ok, true, '§4g precondition: the directory-pointer write is admitted (lock deferred)', dir && { code: dir.code })
  eq(dir.proofRefState, 'missing', '§4h ★★★ a DIRECTORY is missing (the old write face said resolved)')
  has(String(dir.proofRefStateMeans || ''), 'reason=not-a-file', '§4i ★★ the reason names the shape failure')
  eq(dir.proofGate && dir.proofGate.locked, false, '§4j ★★★ rule L14 does not lock a pointer that names no file')
})

test('§5 F75-14 is ALREADY-TRUE (render never compiles; ok:true is acceptance, not completion) — no code change', () => {
  has(PACK, 'render() writes NO file', '§5a ★★★ the render means says render writes no file')
  has(PACK, 'render never compiles', '§5b ★★★ the missing means says render never compiles')
  has(PACK, 'ok:true means the REQUEST was accepted', '§5c ★★★ ok:true is acceptance and the means says it is not completion')
  has(PACK, 'renderOkMeans', '§5d ★★ renderOk has its own sentence beside okMeans')
  has(PACK, 'renderOkMeans:', '§5e ★★ renderOkMeans is emitted beside okMeans (the sentence F75-14 asked about)')
})

test('§6 cleanup', () => {
  try { rmSync(root, { recursive: true, force: true, maxRetries: 2 }) } catch (e) { /* the OS may still hold a handle */ }
  ok(n > 0, '§6 assertions ran', { assertions: n })
})

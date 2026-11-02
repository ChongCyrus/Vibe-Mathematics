// RUN 200 — run 39 / FEEDBACK38 1.1: the pointer that was never resolved, and the round that was not a lap.
//
// 1.1  `proof_state:"complete"` is admitted on the AUTHOR's declaration (that is the rule), but nothing in the
//      institution could answer the one question the declaration raises: does the pointer name a file INSIDE the
//      library? Run 39 wrote `Members/r-acad/Propos/p-1.md#证明（已写完）` into the SESSION WORKING DIRECTORY, every
//      receipt said the pointer was fine, the card locked (L14) and `read_library` then answered
//      `libraryCardCount:0`. The kernel owns the library root AND the filesystem, so the resolver belongs there:
//      `vmu.library.resolvePointer(pointer)` answers `empty | absolute | escapes | missing | file` by name, and both
//      the write receipt and the debate gate now carry its answer instead of an instruction to go and look.
//      `ok` means "the library answered", `exists` means "the file is there" — keeping those apart is the whole point.
//
// 2.5  `drive` never said, anywhere a caller would read it, that ONE round advances ONE member. Run 39 read
//      `rounds:1` as "run the whole roster once" and had to find the truth in `notAdvanced`. The tool description and
//      the parameter doc now say it before the call is made.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const ENTRY = join(ROOT, 'vibe-math-vmu', 'vibe-math-vmu.js')
const LIBRARY = join(ROOT, 'vibe-math-vmu', 'kernel', 'library.js')
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')
const PACK = read('vibe-math-vmu/packs/v5r/tools.js')
const TURN = read('vibe-math-vmu/tools/turn.js')
const LIB = read('vibe-math-vmu/kernel/library.js')

const ok = (cond, msg, extra) => assert.ok(cond, msg + (extra === undefined ? '' : '\n' + JSON.stringify(extra, null, 2)))
const has = (hay, needle, msg) => ok(String(hay).includes(needle), msg + ' — missing: ' + needle)

async function assemble(dir, opts = {}) {
  const entry = await import(pathToFileURL(ENTRY).href)
  const specs = []
  const ctx = { effect(fn) { return fn() }, on() { return () => {} }, tools: { async register(s) { specs.push(s); return () => {} } } }
  const handle = await entry.apply(ctx, { clock: () => 1000, packs: ['v5r'], root: dir, ...(opts.vmu ? { vmu: opts.vmu } : {}) })
  await handle.ready()
  await handle.kernel.store.open()
  const call = async (name, args) => {
    const s = specs.filter((x) => x && x.name === name)[0]
    if (!s) throw new Error('no such face: ' + name)
    const raw = await s.execute(args, { kernel: handle.kernel })
    return raw && typeof raw === 'object' ? raw : JSON.parse(String(raw))
  }
  return { handle, specs, call }
}

test('RUN 200 §0 — the resolver and the round sentence are on the source they belong to (source pins)', () => {
  has(LIB, 'resolvePointer(pointer) {', '§0a ★ the kernel owns the pointer resolver (it owns the root and the filesystem)')
  has(LIB, 'const SEP = String.fromCharCode(92)', '§0b and it does not depend on how this file was quoted (both separators)')
  has(LIB, "return refused('absolute'", '§0c an absolute path is refused BY NAME, not quietly resolved')
  has(LIB, "return refused('escapes'", '§0d and so is a .. that climbs out of the library root')
  has(LIB, "reason: 'missing'", '§0e a well-formed pointer with no file behind it is its own answer')
  has(LIB, 'the pointer is well formed and INSIDE the library root, but no file exists at', '§0f ★ and it says which tree was searched')
  has(PACK, 'pointerCheck,', '§0g ★ the write receipt CARRIES the resolution instead of telling the author to check')
  has(PACK, 'pointerCheckMeans:', '§0h with a sentence, so `ok` is not read as `exists`')
  has(PACK, 'const pointer = kernel.library.resolvePointer(subjectGate.declaredProofRef)', '§0i ★ the convene receipt asks the same question (RUN 203: resolved ONCE, into `pointer`)')
  has(PACK, 'proofPointer: pointer,', '§0i-2 ★ …and hands that same answer to the receipt')
  has(PACK, 'proofPointerMeans:', '§0j and names it as the library answer about WHERE, not as a second gate')
  has(TURN, 'ONE round advances ONE member', '§0k ★★ the turn tool description says what a round is')
  has(TURN, 'drive{rounds:N} moves at most N members', '§0l and what `rounds` therefore counts')
  has(TURN, '一轮只推 ONE 个成员', '§0m also in the parameter doc, where the caller reads it before acting')
})

test('RUN 200 §1 — resolvePointer answers five questions by name, against the library root', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vmu-run200-'))
  try {
    const lib = await import(pathToFileURL(LIBRARY).href)
    const library = lib.createLibrary({ root: dir })
    mkdirSync(join(dir, 'Members', 'r-acad', 'Propos'), { recursive: true })
    const proofPath = join(dir, 'Members', 'r-acad', 'Propos', 'p-200.md')
    writeFileSync(proofPath, '# 证明\n\n对任意自然数 n，前 n 个奇数之和等于 n²。\n')
    mkdirSync(join(dir, 'Members', 'r-acad', 'Methods'), { recursive: true })

    const hit = library.resolvePointer('Members/r-acad/Propos/p-200.md')
    ok(hit.ok === true && hit.exists === true && hit.isFile === true, '§1a ★ a pointer at a real file resolves', hit)
    ok(hit.relativePath === 'Members/r-acad/Propos/p-200.md', '§1b the relative path is normalised with forward slashes', hit.relativePath)
    ok(hit.insideLibrary === true && Number(hit.bytes) > 0, '§1c and it says the file is INSIDE the library, with its size', hit)
    ok(/real file inside the library root/.test(String(hit.means || '')), '§1d the sentence names what was found', hit)

    const anchored = library.resolvePointer('Members/r-acad/Propos/p-200.md#证明（已写完）')
    ok(anchored.ok === true && anchored.exists === true, '§1e ★ the `#anchor` shape run 39 used resolves as a file', anchored)
    ok(anchored.anchor === '证明（已写完）', '§1f and the anchor is carried SEPARATELY (it is not part of the path)', anchored.anchor)
    ok(/ANCHOR inside that file/.test(String(anchored.means || '')), '§1g with a sentence that the anchor itself is not resolved', anchored)

    const missing = library.resolvePointer('Members/r-acad/Propos/p-000.md')
    ok(missing.ok === true && missing.exists === false && missing.reason === 'missing',
      '§1h ★★ a well-formed pointer with nothing behind it is `ok:true, exists:false` — the library DID answer', missing)
    ok(/no file exists at/.test(String(missing.means || '')), '§1i and the answer says where it looked', missing)

    const empty = library.resolvePointer('   ')
    ok(empty.ok === false && empty.reason === 'empty', '§1j an empty pointer is not a file at the root', empty)

    const absolute = library.resolvePointer(proofPath)
    ok(absolute.ok === false && absolute.reason === 'absolute',
      '§1k ★ an absolute path is refused by name (a card pointer is relative to the library root)', absolute)

    const escapes = library.resolvePointer('../outside.md')
    ok(escapes.ok === false && escapes.reason === 'escapes', '§1l ★ a `..` that climbs out is refused by name', escapes)

    const dirPointer = library.resolvePointer('Members/r-acad/Methods')
    ok(dirPointer.ok === true && dirPointer.exists === true && dirPointer.isFile === false && dirPointer.reason === 'not-a-file',
      '§1m a pointer at a directory exists but is named as not-a-file', dirPointer)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('RUN 200 §2 — the write receipt answers WHERE the declared pointer points', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vmu-run200-'))
  try {
    const { handle, call } = await assemble(dir)
    await call('vibe_v5_start', { researcherCount: 2 })
    const root = String(handle.kernel.library.root)
    mkdirSync(join(root, 'Members', 'r-acad', 'Propos'), { recursive: true })
    writeFileSync(join(root, 'Members', 'r-acad', 'Propos', 'p-200.md'), '# 证明\n\nn + n = 2n。\n')

    const good = await call('vibe_v5_record_proposition', {
      id: 'rec-p200', title: '已写完的证明', statement: 'n + n = 2n', value: 0.9, motive: '算术', p: 0.9, member: 'r-acad',
      proof_ref: 'Members/r-acad/Propos/p-200.md#证明', proof_state: 'complete',
    })
    ok(good.ok === true, '§2a premise: the card is written', good)
    const ev = good.proofStateEvidence || {}
    ok(ev.kind === 'proof-ref', '§2b the evidence kind is still the declaration layer', ev)
    ok(ev.pointerCheck && ev.pointerCheck.ok === true && ev.pointerCheck.exists === true,
      '§2c ★★ the receipt resolved the pointer and the file is there', ev.pointerCheck)
    ok(/resolved: the pointer names a real file/.test(String(ev.pointerCheckMeans || '')), '§2d and says so in one sentence', ev.pointerCheckMeans)

    const bad = await call('vibe_v5_record_proposition', {
      id: 'rec-p201', title: '指错地方的证明', statement: 'n + n = 3n', value: 0.4, motive: '算术', p: 0.4, member: 'r-acad',
      proof_ref: 'Members/r-acad/Propos/p-999.md#证明', proof_state: 'complete',
    })
    ok(bad.ok === true, '§2e the declaration is still admitted (the rule admits a declaration, not a verification)', bad.code || bad.ok)
    const badEv = bad.proofStateEvidence || {}
    ok(badEv.pointerCheck && badEv.pointerCheck.exists === false && badEv.pointerCheck.reason === 'missing',
      '§2f ★★ the SAME receipt now says the file is missing — run 39 got silence here', badEv.pointerCheck)
    ok(/NOT resolved: missing/.test(String(badEv.pointerCheckMeans || '')),
      '§2g and the missing pointer leads the sentence, before the pointer/lock notes', badEv.pointerCheckMeans)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('RUN 200 §3 — the debate gate carries the same answer beside its admission', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vmu-run200-'))
  try {
    const { handle, call } = await assemble(dir)
    await call('vibe_v5_start', { researcherCount: 2 })
    const root = String(handle.kernel.library.root)
    mkdirSync(join(root, 'Members', 'r-acad', 'Propos'), { recursive: true })
    writeFileSync(join(root, 'Members', 'r-acad', 'Propos', 'p-200.md'), '# 证明\n\nn + n = 2n。\n')
    const mk = async (id, ref) => {
      const r = await call('vibe_v5_record_proposition', {
        id, title: '辩论对象 ' + id, statement: 'n + n = 2n', value: 0.9, motive: '算术', p: 0.9, member: 'r-acad',
        proof_ref: ref, proof_state: 'complete',
      })
      ok(r.ok === true, '§3 premise: card ' + id + ' is written', r.code || r.ok)
    }
    await mk('rec-s200', 'Members/r-acad/Propos/p-200.md#证明')
    await mk('rec-s201', 'Members/r-acad/Propos/p-404.md#证明')

    const goodMeeting = await call('vibe_v5_meeting', { member: 'r-acad', type: 'debate', subject: 'rec-s200', agenda: '检验 n+n=2n 的证明' })
    ok(goodMeeting.ok === true, '§3a the debate convenes on a declared, resolvable proof', goodMeeting.code || goodMeeting.ok)
    const g = goodMeeting.subjectGate || {}
    ok(g.proofBasis === 'declaration-only' && g.proofPointer && g.proofPointer.exists === true,
      '§3b ★ the admission is unchanged, and the pointer question is answered beside it', g)

    const badMeeting = await call('vibe_v5_meeting', { member: 'r-acad', type: 'debate', subject: 'rec-s201', agenda: '检验一张指错地方的卡' })
    ok(badMeeting.ok === true, '§3c ★★ a declaration pointed at a missing file is STILL admitted (that is the rule)', badMeeting.code || badMeeting.ok)
    const b = badMeeting.subjectGate || {}
    ok(b.proofPointer && b.proofPointer.exists === false && b.proofPointer.reason === 'missing',
      '§3d ★★ but the receipt says the pointer names nothing — the silence run 39 read as "fine"', b.proofPointer)
    ok(/LIBRARY answer about WHERE/.test(String(b.proofPointerMeans || '')), '§3e and names that line as an answer, not a second gate', b.proofPointerMeans)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('RUN 200 §4 — a round is one member, said before the call', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vmu-run200-'))
  try {
    const { specs } = await assemble(dir)
    const spec = specs.filter((x) => x && x.name === 'vibe_vmu_turn')[0]
    ok(!!spec, '§4a the turn face is registered')
    ok(/ONE round advances ONE member/.test(String(spec.description || '')),
      '§4b ★★ the description says a round is one member, without needing a failed call to learn it')
    ok(/notAdvanced/.test(String(spec.description || '')), '§4c and points at the field that says why a drive stopped')
    // ★ the published schema wraps the param map: { type, properties, required } (a round-20 lesson that is easy to
    // forget when reading a tool spec from a test).
    const props = (spec.parameters && spec.parameters.properties) || {}
    const roundsDoc = String((props.rounds && (props.rounds.description || props.rounds.desc)) || '')
    ok(/一轮只推 ONE 个成员/.test(roundsDoc), '§4d ★ the parameter doc says the same where the caller types the number', props.rounds)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

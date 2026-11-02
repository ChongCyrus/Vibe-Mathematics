// RUN 191 (run 35 / FEEDBACK34): FIVE THINGS THE RECEIPT DID NOT SAY, MEASURED ON A LIVE RUN.
//
// Run 35 (baseline 01fa7271) reached full closure — PDF 135,270 bytes on disk, as-of-close account frozen as rec-40 — and
// its feedback named three defects and three unclear hints. Every one of them is the same species: the mechanism already
// held the fact and no READ FACE said it. This suite pins the five repairs:
//
//   1.3  `vibe_vmu_status` ACCEPTED detail:"closure-account" (RUN 187) while its declaration listed only summary/full/
//        settings/closure/provenance. The declaration was behind the implementation.
//   1.1  a file card written to `Members/r-1/Propos/…` (the path the prompt taught) was real on disk and invisible to
//        `vibe_v5_read_library`, which scans `<root>/Members/…` — and the receipt never said WHICH root it scanned.
//   1.2  `vmu.turn.leaderId` was written into THIS process's kernel while `vibe_v5_start` reported `applied:"immediate"`;
//        each member turn runs its own kernel, so the members read the empty default and reported leaderId-empty.
//   2.1  the file-card diagnosis lived only in `hint`; a reader stopping at `message` was told the wrong cause.
//   2.6  the repaired-line for the `formal` reply field taught `{decision,file,note}` while the face it dispatches to
//        reads `{statement, proof}` — the chair wrote it as taught and the face refused with VMU_MATH_INVALID_INPUT.
//
// §0 pins the SOURCE (so a later edit cannot quietly undo a sentence); §1 drives the real assembly.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const ENTRY = join(ROOT, 'vibe-math-vmu', 'vibe-math-vmu.js')
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')
const HOST = read('vibe-math-vmu/host.js')
const TOOLS = read('vibe-math-vmu/packs/v5r/tools.js')
const HANDLERS = read('vibe-math-vmu/kit/handlers.js')
const TURN = read('vibe-math-vmu/kernel/turn/index.js')
const REPLY_CHANNEL = read('vibe-math-vmu/packs/v5r/prompts/v5r-reply-channel.js')
const GATES = read('vibe-math-vmu/packs/v5r/verification-gates.js')

const ok = (cond, msg, extra) => assert.ok(cond, msg + (extra === undefined ? '' : '\n' + JSON.stringify(extra, null, 2)))
const has = (hay, needle, msg) => ok(String(hay).includes(needle), msg + ' — missing: ' + needle)
const hasNot = (hay, needle, msg) => ok(!String(hay).includes(needle), msg + ' — still present: ' + needle)

/** Assemble the real pack over a temp workspace. */
async function assemble(dir) {
  const entry = await import(pathToFileURL(ENTRY).href)
  const specs = []
  const ctx = { effect(fn) { return fn() }, on() { return () => {} }, tools: { async register(s) { specs.push(s); return () => {} } } }
  const handle = await entry.apply(ctx, { clock: () => 1000, packs: ['v5r'], root: dir })
  await handle.ready()
  await handle.kernel.store.open()
  const spec = (name) => specs.filter((s) => s && s.name === name)[0]
  const call = async (name, args) => {
    const s = spec(name)
    if (!s) throw new Error('no such face: ' + name)
    const raw = await s.execute(args, { kernel: handle.kernel })
    return raw && typeof raw === 'object' ? raw : JSON.parse(String(raw))
  }
  return { handle, specs, spec, call }
}

test('RUN 191 §0 — the five sentences are in the source, where a later edit would have to mean them', () => {
  // 1.3 the declaration names the detail it accepts
  has(HOST, "closure-account（只回关会那一刻冻结的账", '§0a status declares detail:"closure-account"')
  has(HOST, "'closure-account'", '§0b and the legal set behind the refusal still lists it')
  // 1.1 the scanned root is echoed
  has(HANDLERS, 'libraryRoot', '§0c read_library echoes the root it scanned')
  has(HANDLERS, 'libraryRootMeans', '§0d and says what that root means for a card written elsewhere')
  has(HANDLERS, 'ABSОLUTE'.replace('О', 'O'), '§0e it says ABSOLUTE, not "some root"')
  // 1.2 the scope of a runtime write is said in the same breath as `applied`
  has(TOOLS, 'visibleToMemberKernels', '§0f a runtime write states whether member kernels see it')
  has(TOOLS, 'memberKernelMeans', '§0g and says which kernels do not')
  has(TOOLS, 'chair-seated-but-leaderId-empty', '§0h ★ naming the exact self-check a member then reports')
  // 2.1 the file-card diagnosis reaches the message
  has(TOOLS, 'const fileCardClause', '§0i the refusal builds a file-card clause')
  has(TOOLS, "+ fileCardClause", '§0j and appends it to the MESSAGE (not only the hint)')
  // 2.3 the label follows the type
  has(TOOLS, "const KIND_BY_TYPE = { debate: 'verify-request', closure: 'solve-vote', division: 'division' }",
    '§0k a debate is no longer filed as `sync`')
  has(TOOLS, "'derived-from-type'", '§0l and the receipt says the label was derived, not chosen')
  // 2.4 the route to a real check is named
  has(GATES, 'lean_job:"lean-<n>"', '§0m the declaration-only note names how to get a real check')
  // 2.6 the taught shape is the shape the face reads
  has(TURN, 'export const formalCheckArgs', '§0n the formal field has an adapter')
  has(TURN, "reason: 'formal-shape'", '§0o a wrong shape is a NAMED skip, not a dead turn')
  has(REPLY_CHANNEL, '{statement, proof}', '§0p the taught line is the face\'s real shape')
  hasNot(REPLY_CHANNEL, '形式化结论 {decision,file,note}', '§0q and the old, unaccepted shape is gone')
})

test('RUN 191 §1 — a formalisation CARD in the `formal` field is skipped BY NAME instead of killing the turn', async () => {
  const turn = await import(pathToFileURL(join(ROOT, 'vibe-math-vmu', 'kernel', 'turn', 'index.js')).href)
  const good = turn.formalCheckArgs({ statement: '任意 n 个正整数的平方和等于 n(n+1)(2n+1)/6', proof: 'theorem foo : True := trivial' })
  ok(good.ok === true, '§1a the real shape is dispatched', good)
  ok(Array.isArray(good.args) && good.args[0].statement && good.args[0].proof, '§1b with statement and proof in the face\'s own argument object', good.args)
  const card = turn.formalCheckArgs({ decision: true, file: 'Formal/rec-1.lean', note: '已完成' })
  ok(card.ok === false, '§1c ★ the shape run 35 actually wrote is NOT dispatched')
  ok(card.code === 'VMU_MATH_INVALID_INPUT', '§1d the code names the same condition the face would have raised', card.code)
  has(card.message, 'formalisation CARD', '§1e ★ and the message says it is a CARD, not a proof script')
  ok(Array.isArray(card.missing) && card.missing.includes('statement') && card.missing.includes('proof'),
    '§1f the missing keys are named', card.missing)
  has(card.hint, 'statement', '§1g the hint gives the shape to send instead')
  ok(card.reason === 'formal-shape', '§1h the skip reason is a stable word', card.reason)
})

test('RUN 191 §1 — read_library names the ABSOLUTE root it scanned, and a card outside it is not silently absent', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vmu-run191-'))
  try {
    const { call } = await assemble(dir)
    // a card written where the PROMPT teaches (relative to the session cwd, i.e. NOT under the kernel root's Members/)
    mkdirSync(join(dir, 'Members', 'r-1', 'Propos'), { recursive: true })
    writeFileSync(join(dir, 'Members', 'r-1', 'Propos', 'p-cc-r1-1.md'), '# 文件卡\n\n内容\n', 'utf8')
    // …and one under the root the face really scans
    mkdirSync(join(dir, 'VibeMath', 'Members', 'r-1', 'Propos'), { recursive: true })
    const got = await call('vibe_v5_read_library', { member: 'r-1' })
    ok(got.ok !== false, '§2a the read itself answers', got.code)
    ok(typeof got.libraryRoot === 'string' && got.libraryRoot.length > 0,
      '§2b ★ the receipt says WHICH directory it scanned', got.libraryRoot)
    ok(got.libraryRoot.startsWith(dir) || got.libraryRoot.startsWith(dir.replace(/\\/g, '/')),
      '§2c and it is absolute, under the kernel root', { root: got.libraryRoot, dir })
    has(got.libraryRootMeans, 'ABSOLUTE', '§2d the meaning of that field is stated')
    has(got.libraryRootMeans, 'NOT here', '§2e ★ and that a card written elsewhere is not in this list')
    has(got.libraryRootMeans, 'not proof you filed nothing', '§2f which is the exact wrong conclusion run 35 drew')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('RUN 191 §1 — a runtime setting says whether the MEMBER kernels see it', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vmu-run191b-'))
  try {
    const { call } = await assemble(dir)
    const started = await call('vibe_v5_start', { researcherCount: 2 })
    const applied = Array.isArray(started.applied) ? started.applied : []
    const leader = applied.filter((a) => a && a.key === 'vmu.turn.leaderId')[0]
    ok(!!leader, '§3a the institute start names the leader write', applied.map((a) => a && a.key))
    ok(leader.crossKernelScope === 'this-process', '§3b the kernel already said the scope', leader.crossKernelScope)
    ok(leader.visibleToMemberKernels === false, '§3c ★ and the receipt now says the members do NOT read it',
      leader.visibleToMemberKernels)
    has(leader.memberKernelMeans, 'OWN kernel instance', '§3d naming why')
    has(leader.memberKernelMeans, 'chair-seated-but-leaderId-empty', '§3e ★ and the exact self-check a member then reports')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('RUN 191 §1 — a debate is filed under the label its type means, not `sync`', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vmu-run191c-'))
  try {
    const { call } = await assemble(dir)
    await call('vibe_v5_start', { researcherCount: 2 })
    const ordinary = await call('vibe_v5_meeting', { action: 'convene', type: 'ordinary', agenda: '例会：检查进度', member: 'r-acad' })
    ok(ordinary.ok !== false, '§4a an ordinary meeting convenes', ordinary.code)
    ok(ordinary.kindSource === 'default' || ordinary.kindSource === 'derived-from-type',
      '§4b its label is filled in, and the receipt says so', ordinary.kindSource)
    // a debate needs a finished proof carrier — use a file reference through subject_evidence
    writeFileSync(join(dir, 'proof.md'), '# 证明\n\n引理 A …\n', 'utf8')
    const debate = await call('vibe_v5_meeting', {
      action: 'convene', type: 'debate', agenda: '辩论：引理的证明是否完整', member: 'r-acad',
      subject: 'Members/r-acad/Propos/rec-1.md',
      subject_evidence: { file: { readable: true, bytes: 12, name: 'proof.md' } },
    })
    ok(debate.ok !== false, '§4c the debate convenes with a file carrier', { code: debate.code, message: debate.message })
    ok(debate.kind === 'verify-request', '§4d ★ a debate is filed as verify-request', { kind: debate.kind, type: debate.type })
    ok(debate.kindSource === 'derived-from-type', '§4e ★ and `kindSource` says nobody chose it', debate.kindSource)
    has(debate.kindSourceMeans, 'DERIVED', '§4f the sentence names the derivation')
    has(debate.typeMeans, 'debate→verify-request', '§4g and the type/kind sentence teaches the mapping')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('RUN 191 §1 — the file-card diagnosis reaches the MESSAGE of an evidence refusal', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vmu-run191d-'))
  try {
    const { call } = await assemble(dir)
    await call('vibe_v5_start', { researcherCount: 2 })
    const started = await call('vibe_v5_paper', { action: 'start', participants: ['r-acad', 'r-1'], title: '文件卡证据测试' })
    ok(started.ok !== false, '§5a the paper starts', started.code)
    const bad = await call('vibe_v5_paper', {
      action: 'part', member: 'r-1', target: started.started.id,
      body: '§1 一节正文，引用见证据列表。',
      evidence: ['Members/r-1/Propos/p-cc-r1-1.md'],
    })
    ok(bad.ok === false, '§5b a file card is still refused as evidence', bad.ok)
    ok(String(bad.code) === 'VMU_PACK_V5R_CORE_PAPER_EVIDENCE_MISSING', '§5c by the same code', bad.code)
    has(bad.message, '文件卡', '§5d ★ the MESSAGE carries the diagnosis (run 35 read only this field)')
    has(bad.message, '不是记录行', '§5e and says what it is not')
    has(bad.hint, 'rec-', '§5f the hint still gives the route')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

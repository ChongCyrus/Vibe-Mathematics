/**
 * tests/vmu-run221-feedback56.test.mjs — RUN 221: run 57 (FEEDBACK56) measured five receipts whose answer was about
 * a DIFFERENT subject than the reader's question.
 *
 *   ① `vibe-math-vmu/packs/v5r/tools.js` — a p-write settlement (the path that edits the card through the records
 *      face) printed `proofState:null` / `proofLockDeferred:false` / `proofGate:null` while the SAME receipt's
 *      `settlement.preserved` said every other line stayed byte-identical. The settlement path never READ THE CARD
 *      BACK, so a locked card looked like a card that lost its state.
 *   ② `vibe-math-vmu/packs/v5r/member-scope.js` — `denyCount:21` at the top level next to
 *      `applied:[{slot:"temp", denyCount:40}]`, with a `means` about "the member seat": one seat's number read as
 *      the count for every row.
 *   ③ `vibe-math-vmu/kernel/turn/index.js` — `toolCalls:[]`/`toolCallsTotal:0` (THIS kernel) printed beside
 *      `memberToolCalls:null` (not readable): a machine reads 0 calls where the honest answer is "unknown".
 *   ④ `packs/v5r/tools.js` render — `wrote:["md","tex","meta"]` beside `wroteWhere:{records:[…], disk:[]}`: "wrote"
 *      named a ledger write and a disk write with one word.
 *   ⑤ the same file's `vibe_v5_start` — `started.already:true` on the FIRST start in a fresh directory.
 *
 * RULE E: every fixture assertion is preceded by an explicit non-empty premise check.
 *
 * Run: node tests/vmu-run221-feedback56.test.mjs
 */
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO } from './_lib/repo-root.mjs'

import { tmpRoot as __tmpRoot } from './_lib/scratch.mjs'
const VMU = join(REPO, 'vibe-math-vmu')
const TMP = __tmpRoot() + '/r221'
mkdirSync(TMP, { recursive: true })

const SRC_TOOLS = readFileSync(join(VMU, 'packs', 'v5r', 'tools.js'), 'utf8')
const SRC_SCOPE = readFileSync(join(VMU, 'packs', 'v5r', 'member-scope.js'), 'utf8')
const SRC_TURN = readFileSync(join(VMU, 'kernel', 'turn', 'index.js'), 'utf8')
const SRC_HOST = readFileSync(join(VMU, 'host.js'), 'utf8')

let passed = 0
let failed = 0
const failures = []
function ok(cond, name, detail) {
  if (cond) { passed += 1; console.log('  ok   ' + name) }
  else { failed += 1; failures.push(name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))); console.log('  FAIL ' + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))) }
}
const has = (text, needle, name) => ok(typeof text === 'string' && text.includes(needle), name, text)
const hasNot = (text, needle, name) => ok(typeof text !== 'string' || !text.includes(needle), name, text)
const codeOf = (e) => (e && (e.code || (e.cause && e.cause.code))) || null

const entry = await import(pathToFileURL(join(VMU, 'vibe-math-vmu.js')).href)

const boot = async (config = {}) => {
  const state = { specs: [] }
  const root = config.root || mkdtempSync(join(TMP, 'k-'))
  const ctx = {
    effect: (fn) => fn(),
    on: () => () => {},
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, Object.assign({ clock: () => 1000, packs: ['v5r'] }, config, { root }))
  await handle.ready()
  const specOf = (n) => state.specs.filter((s) => s.name === n)[0] || null
  const call = async (name, args = {}) => {
    const spec = specOf(name)
    if (!spec) return { ok: false, code: 'VMU_TEST_NO_SUCH_TOOL', message: 'tool ' + name + ' was not registered', hint: null }
    try {
      const raw = await spec.execute(args)
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
      return parsed && typeof parsed === 'object' ? parsed : { ok: false, code: 'VMU_TEST_NO_RECEIPT', message: String(raw), hint: null }
    } catch (e) {
      return { ok: false, code: codeOf(e) || 'VMU_TEST_THROWN', message: String((e && e.message) || e), hint: (e && e.hint) || null }
    }
  }
  return { handle, state, specOf, call }
}

console.log('=== 0. THE REPAIRS ARE ON THE SOURCE THEY BELONG TO ===')

has(SRC_TOOLS, 'const settlementReadback = (existing !== null && settlement !== null && cardId !== null)',
  '★ ① the settlement path READS THE CARD BACK instead of answering from the request')
has(SRC_TOOLS, 'proofStateFrom:',
  '★ ① the receipt says where its `proofState` came from')
has(SRC_TOOLS, 'null ON PURPOSE: a settlement verifies nothing',
  '★ ① `proofStateEvidence` is null WITH A REASON, not a silence')
has(SRC_TOOLS, 'proofGate: proofGateFinal',
  '★ ① `proofGate` is now the READ-BACK value (a settled locked card no longer reads `null`; RUN 2699 moved the receipt to the single-producer result, see docs/03 §3.1h)')

has(SRC_SCOPE, 'const denyCountBySeat = {}',
  '★ ② the deny count is computed PER SEAT')
has(SRC_SCOPE, 'denyCountIs:',
  '★ ② and the top-level number says WHICH seat it belongs to')
has(SRC_SCOPE, 'NOT the count for every row in',
  '★ ② the words around it cannot be read as "every row in applied" (the full sentence lives on `denyCountIs`; §2i reads it at runtime)')

has(SRC_TURN, 'const toolCallsReading = toolCallsScope === \'parent-kernel\'',
  '★ ③ the unreadable case gets its OWN shape instead of a zero')
has(SRC_TURN, 'toolCallsThisKernelTotal:',
  '★ ③ this kernel\'s count travels as its own field')
has(SRC_TURN, "never that the member did nothing",
  '★ ③ and the receipt refuses the reading a zero would invite')
has(SRC_TURN, 'toolCallsCountsAbout:',
  '★ ③ every tool-call reading says what its numbers are ABOUT')

has(SRC_TOOLS, 'wroteToLedger:',
  '★ ④ the ledger write has a name of its own')
has(SRC_TOOLS, 'diskFiles: []',
  '★ ④ and the disk write is a separate, empty list (this face writes no disk file)')
has(SRC_TOOLS, 'wroteDeprecated:',
  '★ ④ the old `wrote` is kept, and labelled as the old name')

has(SRC_TOOLS, 'alreadyMeans:',
  '★ ⑤ `started` keeps the kernel\'s own key and puts the subject in a sentence (RUN 222, FEEDBACK57 ②A)')
has(SRC_TOOLS, 'startedRaw: started',
  '★ ⑤ and the raw kernel answer is still reachable, one key away')

console.log('\n=== 1. a settled locked card still reads LOCKED (FEEDBACK56 1.1) ===')

{
  const { handle, call } = await boot()
  const founded = await call('vibe_v5_start', { researcherCount: 2, problem: 'run221 readback' })
  ok(founded.ok === true, '§1a premise: the institute was founded', founded.code || founded.ok)

  const created = await call('vibe_v5_record_proposition', {
    title: '回读卡', statement: 'n + n = 2n', value: 0.8, p: 0.8, motive: '算术', member: 'r-acad',
    proof_ref: 'Members/r-acad/Propos/this-file-does-not-exist.md',
    proof_state: 'complete',
  })
  // ★ MEASURED: this face names the new row `recordId` (not `id`), and a settlement is selected by `args.id` — passing
  // the wrong key silently turned the settlement into a second CREATE, which is how the first draft of this test passed
  // a receipt with no `settlement` block at all.
  ok(created.ok === true && typeof created.recordId === 'string', '§1b premise: the card was registered', created.code || created.recordId)
  ok(created.proofState === 'complete', '§1c premise: the card CLAIMS complete', created.proofState)
  ok(created.proofLockDeferred === true, '§1d premise: its lock is DEFERRED (the proof does not resolve)', created.proofLockDeferred)
  const cardId = created.recordId

  // A settlement is the OTHER write path: it edits `p` (and the ruling row) through the records face. The receipt
  // used to answer the card's proof fields from the REQUEST, so they came back null even though nothing was touched.
  const settled = await call('vibe_v5_record_proposition', {
    id: cardId, p: 0, member: 'r-acad',
    title: '回读卡', statement: 'n + n = 2n', value: 0.8, motive: '算术',
    debate_ruling: { mode: 'unanimous', value: 0, subject: cardId, n: 2, decided: true, by: 'r-acad' },
  })
  ok(settled.ok === true, '§1e the settlement went through', settled.code || settled.message)
  ok(settled.settlement && settled.settlement.patch === true, '§1f premise: this was the SETTLEMENT path, not a create', settled.settlement)
  ok(settled.proofState === 'complete',
    '§1g ★★★ the settled card still READS `complete` — the settlement did not delete its proof state', settled.proofState)
  ok(settled.proofLockDeferred === true,
    '§1h ★★★ and its deferred lock is still true (run 57 read `false` here)', settled.proofLockDeferred)
  ok(settled.proofGate && settled.proofGate.locked === false,
    '§1i ★★ `proofGate` is present and says the lock did not bite (a deferred lock is not an applied one)', settled.proofGate)
  has(String(settled.proofStateFrom || ''), 'READ BACK',
    '§1j ★★ the receipt says the value was READ BACK from the stored row')
  ok(settled.proofStateEvidence === null, '§1k no verification was performed by the settlement, so the evidence block is null', settled.proofStateEvidence)
  has(String(settled.proofStateEvidenceMeans || ''), 'ON PURPOSE: a settlement verifies nothing',
    '§1l ★ and the null says WHY, instead of reading as "the lock check is missing"')

  const row = handle.kernel.records.get({ id: cardId, includeBody: true })
  ok(row && typeof row.body === 'string' && row.body.includes('complete'),
    '§1m the stored row really does still carry the claim (the receipt and the ledger agree)', row && typeof row.body)
}

console.log('\n=== 2. one deny-count word, two different seats (FEEDBACK56 1.2) ===')

{
  const { call } = await boot()
  const founded = await call('vibe_v5_start', { researcherCount: 2, problem: 'run221 deny' })
  ok(founded.ok === true, '§2a premise: the institute was founded', founded.code || founded.ok)
  const hired = await call('vibe_v5_hire', {
    purpose: 'run221 席位计数', initial_task: '读一份受限工具清单并报告', to: 'r-temp',
  })
  ok(hired.ok === true, '§2b premise: a temp worker was hired', hired.code || hired.message)
  // ★ MEASURED: the seat readings live in `memberScope` (the hire receipt reports the scope it just applied), not at
  // the top level — the first draft read `hired.applied` and got `undefined`, which is the same "field answered about
  // another subject" class this round is about.
  const scope = hired.memberScope && typeof hired.memberScope === 'object' ? hired.memberScope : {}
  ok(Array.isArray(scope.applied) && scope.applied.length >= 1, '§2c premise: the receipt has an `applied` list', scope.applied)
  const tempRow = (scope.applied || []).filter((r) => r && r.slot === 'temp')[0]
  ok(!!tempRow && Number.isFinite(Number(tempRow.denyCount)), '§2d premise: the temp row carries its own deny count', tempRow)
  ok(scope.denyCountBySeat && scope.denyCountBySeat.temp && Number.isFinite(Number(scope.denyCountBySeat.temp.deny)),
    '§2e ★★★ the receipt now prints the count PER SEAT', scope.denyCountBySeat)
  ok(Number(scope.denyCountBySeat.temp.deny) === Number(tempRow.denyCount),
    '§2f ★★★ the per-seat number agrees with the `applied` row for the SAME seat (one seat, one number)',
    { bySeat: scope.denyCountBySeat.temp.deny, applied: tempRow.denyCount })
  ok(Number(scope.denyCountBySeat.member.deny) === Number(scope.denyCount),
    '§2g the TOP-LEVEL number belongs to the MEMBER seat, and says so', { top: scope.denyCount, member: scope.denyCountBySeat.member.deny })
  has(String(scope.denyCountIs || ''), 'MEMBER seat',
    '§2h ★★ the top-level number names the seat it belongs to')
  has(String(scope.denyCountIs || ''), 'NOT the count for every row in',
    '§2i ★★ and rules out the reading run 57 made')
  has(String(scope.means || ''), 'seat loses',
    '§2j the sentence counts per seat instead of naming one seat for everybody')
}

console.log('\n=== 3. an unreadable member count is not a zero (FEEDBACK56 1.3) ===')

{
  const { createKernel } = await import(pathToFileURL(join(VMU, 'kernel', 'index.js')).href)
  const root = mkdtempSync(join(TMP, 'turn-'))
  const host = {
    deliverTurn: async () => ({
      reply: '```json\n{"say":"noted"}\n```',
      deliveryPath: 'activation',
      childId: 'child-r221',
      stopReason: 'completed',
      forMember: 'r-1',
      attribution: 'the host ran the member turn in a child session',
    }),
  }
  const kernel = createKernel({ settings: {}, root, host })
  // ★ MEASURED: the tool-call reading lives on the SETTLED step receipt, nested under `receipt` (the round receipt is
  // the envelope). `drive` returns a BATCH shape that carries no tool-call reading at all, so the first draft read a
  // field that does not exist there and four assertions failed for a reason unrelated to the repair.
  const step = await kernel.turn.step({ members: ['r-1'] })
  ok(step.ok === true, '§3a premise: the step completed', step.code || step.message)
  ok(step.deliveryPath === 'activation', '§3b premise: the member turn ran in a SEPARATE kernel instance', step.deliveryPath)
  const r = step.receipt
  ok(!!r && typeof r === 'object', '§3c premise: there is a settled round receipt', r)
  ok(!!r.delivery && r.delivery.path === 'activation',
    '§3d premise: the receipt carries the delivery path the count scope is derived from', r && r.delivery)
  ok(r.toolCallsScope === 'parent-kernel', '§3e premise: the receipt KNOWS the scope is the parent kernel', r.toolCallsScope)
  ok(r.toolCalls === null && r.toolCallsTotal === null,
    '§3f ★★★ an unreadable member count is `null`, never `[]`/`0`', { toolCalls: r.toolCalls, total: r.toolCallsTotal })
  ok(r.toolCallsThisKernelTotal === 0,
    '§3g ★★ this kernel\'s own count is still reported, under its own name', r.toolCallsThisKernelTotal)
  has(String(r.toolCallsThisKernelMeans || ''), 'never that the member did nothing',
    '§3h ★★ and the sentence refuses the reading a zero would invite')
  ok(r.toolCallsCountsAbout === 'this-kernel-not-the-member',
    '§3i ★★ `countsAbout` names the subject of the numbers', r.toolCallsCountsAbout)
}

console.log('\n=== 4. "wrote" named two different destinations (FEEDBACK56 1.4) ===')

{
  const { call } = await boot()
  const founded = await call('vibe_v5_start', { researcherCount: 2, problem: 'run221 wrote' })
  ok(founded.ok === true, '§4a premise: the institute was founded', founded.code || founded.ok)
  const started = await call('vibe_v5_paper', { action: 'start', participants: ['r-1', 'r-2'], target: 'run221-paper' })
  const paperTarget = started && started.started && started.started.target
  ok(typeof paperTarget === 'string', '§4b premise: a paper exists', started)
  const rendered = await call('vibe_v5_paper', { action: 'render', target: paperTarget })
  ok(rendered.ok === true, '§4c premise: the render went through', rendered.code || rendered.message)
  ok(Array.isArray(rendered.wroteToLedger) && rendered.wroteToLedger.length >= 1,
    '§4d ★★ the ledger write is named `wroteToLedger` and lists what it wrote', rendered.wroteToLedger)
  ok(Array.isArray(rendered.diskFiles) && rendered.diskFiles.length === 0,
    '§4e ★★ and the disk write is its own list — empty here, because this face writes no file', rendered.diskFiles)
  ok(rendered.wroteWhere && Array.isArray(rendered.wroteWhere.records) && rendered.wroteWhere.records.length >= 1,
    '§4f premise: the older `wroteWhere` reading is still there', rendered.wroteWhere)
  has(String(rendered.wroteDeprecated || ''), 'OLD name',
    '§4g ★ the old `wrote` key is labelled as the old name, not deleted silently')
}

console.log('\n=== 5. the first start does not say "already" (FEEDBACK56 1.5) ===')

{
  const { call } = await boot()
  const founded = await call('vibe_v5_start', { researcherCount: 2, problem: 'run221 already' })
  ok(founded.ok === true, '§5a premise: the institute was founded', founded.code || founded.ok)
  ok(founded.started && founded.started.already === true,
    '§5b the `started` block keeps the kernel\'s own word (RUN 222: the subject moved into the sentence)', founded.started)
  ok(!('middlewareAlreadyRegistered' in founded.started),
    '§5c ★★★ the invented second name is gone from the projected block', Object.keys(founded.started))
  ok(founded.startedRaw && founded.startedRaw.already === true,
    '§5d ★★ the kernel\'s own word is still reachable as `startedRaw`', founded.startedRaw)
  has(String(founded.startedMeans || ''), 'NOT a statement that the institute existed before',
    '§5e ★ and the sentence says what "already" did and did not mean')
}

console.log('\n' + (failed === 0 ? 'TOTAL ' + (passed + failed) + ' PASS ' + passed + ' FAIL 0' : 'TOTAL ' + (passed + failed) + ' PASS ' + passed + ' FAIL ' + failed))
if (failed !== 0) { for (const f of failures) console.log('  - ' + f); process.exitCode = 1 }

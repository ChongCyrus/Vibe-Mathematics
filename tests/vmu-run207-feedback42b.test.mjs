// RUN 207 — run 42 / FEEDBACK42: two receipts that answered with the wrong scope.
//
// 1.1  the office set `vmu.paper.officeConsult: "off"`, read `applied: "immediate"` + `partial: true`, and the chair's
//      `final` was still refused by `VMU_OFFICE_CONSULT_REQUIRED` in a member kernel that boots its OWN kernel over the
//      same workspace and reads the declared default. The receipt named the scope but no DURABLE route, so the next
//      agent repeats the same write. `vmu.turn.objective` read two ways for the same reason.
// 1.7  a member round whose reply fence did not parse reported `roundsRun: 0` and nothing else, while that member's
//      child session had already run tools against the shared library: a failed round is not an empty round.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { createKernel } from '../vibe-math-vmu/kernel/index.js'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const ENTRY = join(ROOT, 'vibe-math-vmu', 'vibe-math-vmu.js')
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')
const TURN = read('vibe-math-vmu/kernel/turn/index.js')
const TOOLS = read('vibe-math-vmu/packs/v5r/tools.js')

const ok = (cond, msg, extra) => assert.ok(cond, msg + (extra === undefined ? '' : '\n' + JSON.stringify(extra, null, 2)))
const has = (hay, needle, msg) => ok(String(hay).includes(needle), msg + ' — missing: ' + needle)
const tmp = () => mkdtempSync(join(tmpdir(), 'vmu-run207-'))

async function assemble(dir) {
  const entry = await import(pathToFileURL(ENTRY).href)
  const specs = []
  const ctx = { effect(fn) { return fn() }, on() { return () => {} }, tools: { async register(s) { specs.push(s); return () => {} } } }
  const handle = await entry.apply(ctx, { clock: () => 1000, packs: ['v5r'], root: dir })
  await handle.ready()
  await handle.kernel.store.open()
  const call = async (name, args) => {
    const s = specs.filter((x) => x && x.name === name)[0]
    if (!s) throw new Error('no such face: ' + name)
    const raw = await s.execute(args, { kernel: handle.kernel })
    return raw && typeof raw === 'object' ? raw : JSON.parse(String(raw))
  }
  return { call, handle }
}

test('RUN 207 §0 — every repair is on the source it belongs to (source pins)', () => {
  has(TOOLS, 'const MEMBER_FACING_SETTING_ROUTES', '§0a ★★ the pack knows which settings a member kernel cannot read')
  has(TOOLS, "'vmu.paper.officeConsult': ", '§0b ★★ the consult switch has a durable route named')
  has(TOOLS, 'action:"consult", target:"<paper>"', '§0c ★ and that route is the CONSULT ROW, not the setting')
  has(TOOLS, "'vmu.turn.objective': ", '§0d ★★ the objective has a durable route too (blueprint + proposition card)')
  has(TOOLS, 'NO face can make another kernel read this value',
    '§0e ★★ for any other key the receipt says plainly that no write can reach the members')
  has(TOOLS, 'const processOnly = !!(receipt && receipt.crossKernelScope', '§0f ★ one predicate decides the scope')
  has(TOOLS, 'reachableInstead: processOnly', '§0g ★ and the reachable route is printed only when it applies')
  has(TOOLS, "'*': '", '§0h ★ the wildcard route exists (no key may fall through to silence)')

  has(TURN, 'const failureFacts = (e) =>', '§0i ★★ a failed round has a fact-gatherer')
  has(TURN, 'out.sideEffectsUnverified = true', '§0j ★ it carries "this refusal is about the REPLY SHAPE"')
  has(TURN, 'out.replyExcerpt = e.replyText.slice(0, REFUSAL_REPLY_EXCERPT_MAX)',
    '§0k ★★ and what the member actually wrote')
  has(TURN, '...failureFacts(e) })', '§0l ★★ the BATCH receipt spreads those facts')
  has(TURN, 'e.delivery = deliveryFromAttribution()', '§0m ★ and the delivery path that played the turn is named')
})

test('RUN 207 §1 — a setting no member can read now names the durable route that does reach them', async () => {
  const dir = tmp()
  try {
    const { call } = await assemble(dir)
    const set = await call('vibe_v5_set', { key: 'vmu.paper.officeConsult', value: 'off' })
    ok(set.ok === true, '§1a the set is accepted (it IS live in this process)', set)
    const applied = (set && set.applied) || {}
    ok(applied.partial === true, '§1b ★★ and it says the scope is partial', applied)
    ok(typeof applied.reachableInstead === 'string' && applied.reachableInstead.length > 40,
      '§1c ★★ and names the route that reaches the members', applied)
    has(applied.reachableInstead, 'consult', '§1d ★★ the consult route (durable row) is the answer, not the switch')
    has(applied.reachableInstead, 'vibe_v5_paper', '§1e ★ and it names the face to call')
    ok(/durable/i.test(String(applied.reachableInsteadMeans || '')),
      '§1f ★ and the means says the route is a durable record', applied)

    const obj = await call('vibe_v5_set', { key: 'vmu.turn.objective', value: '前 n 个奇数之和是 n 的平方' })
    ok(obj.ok === true && obj.applied.partial === true, '§1g the objective has the same scope problem', obj)
    has(String(obj.applied.reachableInstead), 'blueprint', '§1h ★★ and its route is the blueprint/proposition record')

    const other = await call('vibe_v5_set', { key: 'vmu.turn.instituteName', value: 'run207-institute' })
    ok(other.ok === true && other.applied.partial === true, '§1i any runtime write is process-local', other)
    has(String(other.applied.reachableInstead), 'NO face can make another kernel read this value',
      '§1j ★★ and where no durable route exists the receipt SAYS so instead of staying silent')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('RUN 207 §2 — a failed round is not an empty round, and the batch receipt says which', async () => {
  const root = tmp()
  try {
    const host = { deliverTurn: async () => 'this reply has no fence at all' }
    const kernel = createKernel({ settings: {}, root, host })
    const out = await kernel.turn.drive({ members: ['r-1'], rounds: 1 })
    ok(out.ok === true, '§2a the batch itself completes', out)
    ok(out.roundsRun === 0 && out.roundsAttempted === 1, '§2b the round did not run', out)
    const r = (out.receipts || [])[0]
    ok(r && r.failed === true, '§2c ★★ the receipt says the round failed', r)
    ok(r.code === 'VMU_TURN_NO_FENCE', '§2d with a named code', r)
    ok(r.sideEffectsUnverified === true, '§2e ★★ and that side effects are NOT ruled out', r)
    has(String(r.sideEffectsMeans || ''), 'REPLY SHAPE', '§2f ★ the sentence says which question the refusal answered')
    ok(r.replyExcerpt === 'this reply has no fence at all', '§2g ★★ what the member actually wrote is in the receipt', r)
    ok(r.replyLength === 30 && r.replyTruncated === false && r.replyLimitChars === 500,
      '§2h ★ with its measured length and the cut that was (not) applied', r)
    const f = (out.failures || [])[0]
    ok(f && f.sideEffectsUnverified === true && f.replyExcerpt === r.replyExcerpt,
      '§2i ★★ and the failure list carries the same facts (one round, one account)', f)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

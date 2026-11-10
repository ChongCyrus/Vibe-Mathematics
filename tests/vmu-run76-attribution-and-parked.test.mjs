// ★ RUN 76 / TB-2710 (task-193) — ONE KEY, ONE QUESTION; ONE PARKED SITUATION, TWO NAMED TRIGGERS.
//
// MEASURED (run 76, real machine): 16 settled rounds — 15 really ran in the members own child sessions
// (deliveryPath activation/continuation) and 1 was played by the office (deliveryPath caller) — yet every turn
// receipt carried `memberActed:false`, because the attribution stamp answered "did the SEAT call this tool?"
// (the office called it) instead of "did the seat act in its own turn?". The same receipt carried
// `memberWorkShare.memberActs:15`, so one field said the seat never acted and another said it acted fifteen times.
//
// The repair (this suite pins it):
//   1. kernel `step` states `turnDelivered` (null / false / true) and `drive` states it for the settled batch, so the
//      delivery fact survives all the way to the tool receipt: `memberActed` is true when EITHER the call ran from
//      the seat OR a turn for that seat was really delivered; `callerIsSeat` keeps answering only the caller question.
//   2. `VMU_TURN_ALREADY_PARKED` (second dispatch while a prompt is parked) and `VMU_TURN_PARKED_NEEDS_OWNER` (a reply
//      with no parked prompt to answer) each carry a `parkedReason` on the fact block AND on the receipt, and each hint
//      opens with the trigger that makes THAT code apply.
//   3. `VMU_TURN_NO_FENCE` carries `starts`: the two calls that answer the refusal, machine-readable, not prose alone.
//
// §0 source-side readings: one predicate, one set of names, one vocabulary
// §1 a turn really delivered to the seat reads as a member act, and the share agrees
// §2 the caller-played turn (the office playing the seat) is still not a member act
// §3 a second dispatch over a parked prompt is ALREADY_PARKED, with the reason
// §4 a reply with no parked prompt is NEEDS_OWNER, and it is discarded by name
// §5 a bare prose reply is NO_FENCE, with executable starts
//
// Run: node tests/vmu-run76-attribution-and-parked.test.mjs   Last line: N passed, M failed

import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')
const TURN_SRC = join(REPO, 'vibe-math-vmu', 'kernel', 'turn', 'index.js')
const HOST_TOOLS_SRC = join(REPO, 'vibe-math-vmu', 'host-pack-tools.js')
const PROMPT_SRC = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'prompts', 'v5r-blocks-b.js')
const DOC03 = join(REPO, 'vibe-math-vmu', 'docs', '03-interface-contract.md')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++
  failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const section = (t) => console.log(NL + t)

const NL = String.fromCharCode(10)
const fence = (obj) => ['```json', JSON.stringify(obj), '```'].join(NL)

const entry = await import(pathToFileURL(ENTRY).href)
const turnSource = await readFile(TURN_SRC, 'utf8')
const hostToolsSource = await readFile(HOST_TOOLS_SRC, 'utf8')
const promptSource = await readFile(PROMPT_SRC, 'utf8')
const docSource = await readFile(DOC03, 'utf8')

const roots = []
const mkRoot = async () => {
  const d = await mkdtemp(join(tmpdir(), 'vmu-r76-'))
  roots.push(d)
  return d
}

// A fake host subagent registry. The ONE-SHOT verb (`start`) is what the kernel prefers when a provider is configured
// (ROUND 63), so this is the route a real deployment reports as deliveryPath "one-shot". The answer is a fenced member
// reply with a record-writing field (`progress`), so the turn has an ACT the work share can count.
const makeSubagents = () => {
  const seen = []
  let seq = 0
  const answer = async (kind, provider) => {
    seq += 1
    seen.push({ seq, kind, provider })
    return {
      childId: 'sim-child-' + seq,
      messageId: 'sim-msg-' + seq,
      result: Promise.resolve({
        output: [{ type: 'text', text: fence({ progress: 'r-1 自己写的进展：引理已完成。' }) }],
        stopReason: 'end_turn',
      }),
      dispose: async () => {},
    }
  }
  return {
    seen,
    list: () => ['sim'],
    interrupt: async () => {},
    sendMessage: async () => 'sim-msg',
    start: async (provider) => answer('one-shot', provider),
    startActivation: async (spec) => answer('activation', spec && spec.provider),
  }
}

const makeRootAgent = () => ({
  options: { provider: 'sim', model: 'sim' },
  session: { id: 'sim-session', header: { id: 'sim-session' } },
})

const boot = async (opts = {}) => {
  const root = await mkRoot()
  const specs = []
  const subs = opts.delegated ? makeSubagents() : null
  const rootAgent = opts.delegated ? makeRootAgent() : null
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    get(name) {
      if (!opts.delegated) return null
      if (name === 'subagents') return subs
      if (name === 'agents') return { list: () => ['sim-session'], get: () => rootAgent, currentInitiator: () => rootAgent }
      return null
    },
    tools: { register: async (spec) => { specs.push(spec); return () => {} } },
  }
  const options = {
    clock: () => 1000,
    packs: ['v5r'],
    root,
    vmu: opts.delegated ? { 'vmu.turn.deliverProvider': 'sim' } : {},
  }
  if (!opts.delegated) options.deliverMode = 'caller'
  const handle = entry.apply(ctx, options)
  await handle.ready()
  const K = handle.kernel
  await K.store.open()
  const call = async (name, args, agent) => {
    const spec = specs.find((s) => s.name === name)
    if (!spec) throw new Error('tool not registered: ' + name)
    const exec = agent ? { kernel: K, agent } : { kernel: K }
    let raw
    try { raw = await spec.execute(args, exec) }
    catch (e) { return { threw: true, ok: false, code: (e && e.code) || null, message: String((e && e.message) || e) } }
    return typeof raw === 'string' ? JSON.parse(raw) : raw
  }
  return { K, call, root, subs, rootAgent, specs }
}

const ids = (s) => (Array.isArray(s) ? s : [])

try {
  // ── §0 ONE PREDICATE, ONE SET OF NAMES ────────────────────────────────────────────────────────────────────────
  section('§0 the repair is one predicate with named facts, not four independent patches')
  {
    ok(turnSource.includes('driveTurnDelivered'), '§0a the batch route has ONE place that states delivery for the whole drive')
    ok(turnSource.includes("return p === null ? null : (p === 'caller' ? false : true)"),
      '§0b each settled round keeps its own value, derived from the row the delivery seam reported (null, not absent, when no path)')
    ok(turnSource.includes("turnDelivered: deliveredThrough === null ? null : deliveredThrough !== 'caller'"),
      '§0c the single step states the same three-valued fact (null / false / true)')
    ok(hostToolsSource.includes('const deliveredTurn = out.turnDelivered === true') && hostToolsSource.includes('const seatActed = deliveredTurn || actedBySeat'),
      '§0d the attribution stamp asks BOTH questions: caller identity OR a delivered turn')
    ok(hostToolsSource.includes('memberActed: seatActed') && hostToolsSource.includes('callerIsSeat: actedBySeat'),
      '§0e `memberActed` and `callerIsSeat` answer different questions and are computed from different facts')
    ok(turnSource.includes('PARKED_ALREADY_REASON') && turnSource.includes('e.parkedReason = PARKED_ALREADY_REASON'),
      '§0f the ALREADY refusal states its trigger on the receipt, not only inside the nested park facts')
    ok(turnSource.includes('PARKED_NEEDS_OWNER_MEANS') && turnSource.includes('e.parkedReason = reason'),
      '§0g and the NEEDS_OWNER refusal keeps doing so')
    ok(turnSource.includes('REPLY_STARTS') && turnSource.includes('starts: REPLY_STARTS'),
      '§0h NO_FENCE carries the two calls that answer it, from one constant')
    ok(promptSource.includes('VMU_TURN_ALREADY_PARKED') && promptSource.includes('VMU_TURN_PARKED_NEEDS_OWNER'),
      '§0i the prompt teaches BOTH parked codes (the second-dispatch door used to be taught as NEEDS_OWNER)')
    ok(docSource.includes('3.1j') && docSource.includes('turnDelivered') && docSource.includes('startsMeans'),
      '§0j docs/03 registers the new keys and the two triggers')
  }

  // ── §1 A DELIVERED TURN IS A MEMBER ACT ──────────────────────────────────────────────────────────────────────
  section('§1 a turn really delivered to the seat reads as a member act, and the share agrees')
  {
    const b = await boot({ delegated: true })
    const K = b.K
    await K.members.hire({ id: 'r-1', slot: 'member' })
    const r = await b.call('vibe_vmu_turn', { op: 'step', member: 'r-1', members: ['r-1'], phase: 'normal', why: 'run76 delegated step' }, b.rootAgent)
    const seen = ids(b.subs && b.subs.seen)
    ok(r && r.ok === true, '§1a the delegated turn settled', r && { ok: r.ok, code: r.code, hint: r.hint })
    ok(r && r.turnDelivered === true, '§1b the receipt states that a turn for this seat was really delivered', r && r.turnDelivered)
    ok(r && (r.deliveryPath === 'one-shot' || r.deliveryPath === 'activation'),
      '§1c and names the path the delivery actually took', r && r.deliveryPath)
    ok(r && r.memberActed === true, '§1d ★ memberActed answers DID THE SEAT ACT: true, even though the OFFICE called the tool', r && { memberActed: r.memberActed, callerIsSeat: r.callerIsSeat })
    ok(r && r.callerIsSeat === false, '§1e callerIsSeat still answers DID THE SEAT CALL THIS: false, and that is not a contradiction', r && r.callerIsSeat)
    ok(r && r.ranInOwnTurn === true, '§1f ranInOwnTurn follows the delivery fact', r && r.ranInOwnTurn)
    ok(r && typeof r.memberActedMeans === 'string' && r.memberActedMeans.includes('DELIVERED'),
      '§1g the sentence names delivery as the reason, so a false and a true are not two guesses', r && (r.memberActedMeans || '').slice(0, 80))
    ok(seen.length === 1 && seen[0].kind === 'one-shot', '§1h the host seam was really used (one delivery, on the one-shot verb)', seen)
    const share = K.turn.status().memberWorkShare
    ok(share && share.memberActs >= 1, '§1i the work share counts the act as the SEAT own', share && { memberActs: share.memberActs, office: share.officeRelayedActs })
    ok(share && share.officeRelayedActs === 0, '§1j and does not also count it as office-relayed (one act, one class)', share && share.officeRelayedActs)

    const d = await boot({ delegated: true })
    await d.K.members.hire({ id: 'r-1', slot: 'member' })
    const batch = await d.call('vibe_vmu_turn', { op: 'drive', member: 'r-1', members: ['r-1'], rounds: 1, phase: 'normal', why: 'run76 delegated drive' }, d.rootAgent)
    const rows = ids(batch && batch.receipts)
    ok(batch && batch.ok === true && Number(batch.roundsRun) >= 1, '§1k the batch ran a round', batch && { ok: batch.ok, roundsRun: batch.roundsRun, code: batch.code })
    ok(batch && batch.turnDelivered === true, '§1l the batch aggregate carries the same delivery fact (it used to die at the aggregate)', batch && batch.turnDelivered)
    ok(rows.length >= 1 && rows[0].turnDelivered === true, '§1m and each settled round keeps its own value', rows.slice(0, 1))
    ok(batch && batch.memberActed === true, '§1n ★ so a DRIVE from the office is a member act too, not only a STEP', batch && { memberActed: batch.memberActed, callerIsSeat: batch.callerIsSeat })
  }

  // ── §2 THE CALLER-PLAYED TURN IS NOT A MEMBER ACT ────────────────────────────────────────────────────────────
  section('§2 the caller-played turn (the office playing the seat) is still not a member act')
  {
    const b = await boot({ delegated: false })
    const K = b.K
    await K.members.hire({ id: 'r-1', slot: 'member' })
    const parked = await b.call('vibe_vmu_turn', { op: 'step', member: 'r-1', members: ['r-1'], phase: 'normal', why: 'run76 caller park' })
    ok(parked && parked.ok === true && parked.awaiting === true, '§2a the caller route parks the prompt instead of running a child', parked && { ok: parked.ok, awaiting: parked.awaiting })
    ok(parked && parked.memberActed === false, '§2b nothing was delivered yet, so the seat did not act')
    const answered = await b.call('vibe_vmu_turn', { op: 'step', member: 'r-1', reply: fence({ progress: '所办代成员写的进展：定义已固定。' }) })
    ok(answered && answered.ok === true, '§2c the supplied reply settles that turn', answered && { ok: answered.ok, code: answered.code })
    ok(answered && answered.turnDelivered === false, '§2d the receipt says the turn was NOT delivered to the seat (no child ran)', answered && answered.turnDelivered)
    ok(answered && answered.deliveryPath === 'caller', '§2e and names the caller path', answered && answered.deliveryPath)
    ok(answered && answered.memberActed === false, '§2f ★ so memberActed is false here: the office played the seat, the seat did not act', answered && { memberActed: answered.memberActed, means: (answered.memberActedMeans || '').slice(0, 60) })
    const share = K.turn.status().memberWorkShare
    ok(share && share.memberActs === 0 && share.officeRelayedActs >= 1,
      '§2g the share books the identical act as OFFICE-RELAYED, not as member', share && { memberActs: share.memberActs, office: share.officeRelayedActs })
    ok(share && share.memberShare === 0, '§2h and the ratio is 0 when every proven act was relayed', share && share.memberShare)

    // The same reply, through the two real paths, must move the classification — this is the anti-fake-green probe.
    const delegatedRun = await boot({ delegated: true })
    await delegatedRun.K.members.hire({ id: 'r-1', slot: 'member' })
    await delegatedRun.call('vibe_vmu_turn', { op: 'step', member: 'r-1', members: ['r-1'], phase: 'normal', why: 'run76 anti-fake' }, delegatedRun.rootAgent)
    const ds = delegatedRun.K.turn.status().memberWorkShare
    ok(ds && share && ds.memberActs >= 1 && share.officeRelayedActs >= 1,
      '§2i the SAME act lands in opposite classes depending on the real path (not on the label)', { member: ds && ds.memberActs, caller: share && share.officeRelayedActs })
  }

  // ── §3 THE SECOND DISPATCH IS ALREADY_PARKED, WITH THE REASON ────────────────────────────────────────────────
  section('§3 a second dispatch over a parked prompt is ALREADY_PARKED, with the reason')
  {
    const b = await boot({ delegated: false })
    const K = b.K
    await K.members.hire({ id: 'r-1', slot: 'member' })
    const first = await b.call('vibe_vmu_turn', { op: 'step', member: 'r-1', members: ['r-1'], phase: 'normal', why: 'run76 park for repark' })
    ok(first && first.awaiting === true, '§3a a prompt is parked', first && first.awaiting)
    const turnId = first && first.memberPrompt && first.memberPrompt.turnId
    const promptId = first && first.memberPrompt && first.memberPrompt.promptId
    const second = await b.call('vibe_vmu_turn', { op: 'step', member: 'r-1', members: ['r-1'], phase: 'normal', why: 'run76 repark' })
    ok(second && second.ok === false && second.code === 'VMU_TURN_ALREADY_PARKED',
      '§3b ★ the second dispatch is refused by the correct code (it used to be taught as NEEDS_OWNER)', second && { ok: second.ok, code: second.code })
    ok(second && typeof second.parkedReason === 'string' && second.parkedReason.length > 40,
      '§3c ★★ the receipt names WHY on the top level, not only inside the nested block', second && (second.parkedReason || '').slice(0, 60))
    const facts = second && second.parkedFacts
    ok(facts && facts.parkedReason === second.parkedReason,
      '§3d the nested park block carries the SAME sentence (one fact, two places on purpose)', facts && (facts.parkedReason || '').slice(0, 40))
    ok(facts && facts.turnId === turnId && facts.member === 'r-1' && facts.promptId === promptId,
      '§3e and identifies the held turn/member/prompt', facts && { turn: facts.turnId, member: facts.member, prompt: facts.promptId })
    ok(typeof second.hint === 'string' && second.hint.startsWith('VMU_TURN_ALREADY_PARKED applies when'),
      '§3f the hint OPENS with the trigger, so the two parked codes cannot be confused', second && (second.hint || '').slice(0, 70))
    ok(second.memberActed === false, '§3g a refused attempt is not an act', second && second.memberActed)
  }

  // ── §4 A REPLY WITH NOTHING TO ANSWER IS NEEDS_OWNER, AND DISCARDED ───────────────────────────────────────────
  section('§4 a reply with no parked prompt is NEEDS_OWNER, and it is discarded by name')
  {
    const b = await boot({ delegated: false })
    const K = b.K
    await K.members.hire({ id: 'r-1', slot: 'member' })
    const r = await b.call('vibe_vmu_turn', { op: 'step', member: 'r-1', reply: fence({ progress: '这句回答没有可答的提示。' }) })
    ok(r && r.ok === false && r.code === 'VMU_TURN_PARKED_NEEDS_OWNER',
      '§4a ★ a reply with no parked prompt is refused by ITS own code', r && { ok: r.ok, code: r.code })
    ok(r && r.parkedReason === 'no-parked-prompt', '§4b and the reason is named, not prose', r && r.parkedReason)
    ok(r && r.parkedReplyDiscarded === true, '§4c the reply is discarded, so it can never answer the NEXT turn')
    ok(typeof r.hint === 'string' && r.hint.startsWith('VMU_TURN_PARKED_NEEDS_OWNER applies when'),
      '§4d the hint opens with the OTHER trigger, distinguishable from ALREADY_PARKED in one line', r && (r.hint || '').slice(0, 70))
    ok(r.memberActed === false, '§4e a refused attempt is not an act')
  }

  // ── §5 NO_FENCE CARRIES EXECUTABLE STARTS ────────────────────────────────────────────────────────────────────
  section('§5 a bare prose reply is NO_FENCE, and the receipt carries the two calls that answer it')
  {
    const b = await boot({ delegated: false })
    const K = b.K
    await K.members.hire({ id: 'r-1', slot: 'member' })
    await b.call('vibe_vmu_turn', { op: 'step', member: 'r-1', members: ['r-1'], phase: 'normal', why: 'run76 park for prose' })
    const r = await b.call('vibe_vmu_turn', { op: 'step', member: 'r-1', reply: '我完成了这一轮，没有别的问题。' })
    ok(r && r.code === 'VMU_TURN_NO_FENCE', '§5a a bare prose reply is still refused by name', r && { ok: r.ok, code: r.code })
    const starts = r && r.starts
    ok(Array.isArray(starts) && starts.length === 2, '§5b ★ the receipt carries TWO executable next calls, not an empty shape', starts && starts.length)
    const ops = ids(starts).map((s) => s && s.op)
    ok(ops.includes('reply') && ops.includes('step'), '§5c one for the preferred report channel, one for the compatibility fence', ops)
    ok(ids(starts).every((s) => s && s.tool === 'vibe_vmu_turn' && typeof s.call === 'string' && s.call.includes('vibe_vmu_turn') && typeof s.why === 'string'),
      '§5d each start is machine-readable: tool, op, why and the call itself')
    ok(typeof r.startsMeans === 'string' && r.startsMeans.length > 40,
      '§5e and the means says these are the same two calls the hint sentence names (one vocabulary, not a fork)', r && (r.startsMeans || '').slice(0, 60))
    ok(typeof r.hint === 'string' && r.hint.includes('report through the tool'),
      '§5f the prose hint is still there for a human reader')
  }
} finally {
  for (const r of roots) { try { await rm(r, { recursive: true, force: true, maxRetries: 3 }) } catch { /* best effort */ } }
}

if (failures.length > 0) {
  console.log(NL + 'failures:')
  for (const f of failures) console.log('  - ' + f)
}
console.log('')
console.log('=== VMU RUN 76 ATTRIBUTION AND PARKED: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) process.exitCode = 1

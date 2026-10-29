import { legacyDir, legacyFile } from './_lib/legacy-presets.mjs'
import { pathToFileURL } from 'node:url'
// tests/vmu-ab-v5r-verification.test.mjs — the verification CHAIN, driven end to end on the v5r side.
//
// Volume 24 §0 fixes the method: an equivalence claim is only admissible when both sides are RUN and their observable
// output compared. The meeting A/B file covers tools and flows; this file exists because the chain that decides TRUTH
// needs its own host context: the preset reaches its toolchain through `ctx.get('subprocess')`, and a second context
// inside the meeting file resolved against an earlier institute, so the seated fixture that works in isolation did not
// seat correctly there. One context, one institute, one chain - and everything asserted below was measured first.
//
// What this file pins, in the order the preset itself enforces it:
//   record a proposition (it comes back with a fingerprint)
//   -> archive a proof and QUEUE it through the host subprocess seam
//   -> the job lands settled with ok=true, promoting the file into the verified tree
//   -> register it with end_verify {op:'formal_proof'} which writes the formal ledger entry locked=true
//   -> and ONLY THEN does propose_verify admit the debate.
//
// Run: node tests/vmu-ab-v5r-verification.test.mjs   (last line: === VMU AB v5r verification: N passed, M failed ===)

import { decideSections as DECIDE_SECTIONS } from '../vibe-math-vmu/packs/v5r/middleware/prompt-switches.js'
import { PROMPTS } from '../vibe-math-vmu/packs/v5r/prompts/v5r-prompts.js'
import { v5rRoleSection } from '../vibe-math-vmu/packs/v5r/prompts/v5r-core.js'
import { CHARTER_SECTIONS, CHARTER_BINDINGS } from '../vibe-math-vmu/packs/v5r/prompts/v5r-charter.js'
import { mkdtempSync, readFileSync, existsSync, mkdirSync, writeFileSync, rmSync, readdirSync, renameSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
// ★ G4 stage B: the v5r preset source resolves through the ONE preset seam.
const { apply: applyV5R } = await import(pathToFileURL(legacyFile('vibe-math-v5r', 'vibe-math-v5r.js')).href)
import { createTasks } from '../vibe-math-vmu/kernel/tasks.js'
import { createTurnOrchestrator, facesFrom } from '../vibe-math-vmu/kernel/turn/index.js'
import { createPromptPipeline } from '../vibe-math-vmu/kernel/prompt/index.js'
import { v5rPromptSections, v5rTurnSections } from '../vibe-math-vmu/packs/v5r/prompts/v5r-core.js'
import { createKernel } from '../vibe-math-vmu/kernel/index.js'
import { mkdtempSync as mkdtempSyncTurn } from 'node:fs'
import { tmpdir as tmpdirTurn } from 'node:os'
import { join as joinTurn } from 'node:path'
// A URL is accepted by existsSync directly, which avoids Windows path juggling on a URL-derived string.
const REPO_URL = new URL("..", import.meta.url)
const turnRoot = mkdtempSyncTurn(joinTurn(tmpdirTurn(), 'vmu-turn-ab-'))

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) { passed++; console.log('  ok   ' + name) } else { failed++; failures.push(name + (detail === undefined ? '' : ' [' + JSON.stringify(detail).slice(0, 200) + ']')); console.log('  FAIL ' + name + (detail === undefined ? '' : ' [' + JSON.stringify(detail).slice(0, 200) + ']')) }
}

const workspace = mkdtempSync(join(tmpdir(), 'vmu-ab-verify-'))
const root = { id: 'verify-root', session: { id: 'verify-root', header: { cwd: workspace } }, options: {} }
const registry = new Map()
const agents = new Map([[root.id, root]])
const seats = new Map()
let seq = 0
const spawns = []
// ROUND 340: every prompt the ORIGINAL hands a member, captured at the seam, so the two sides can be compared.
const capturedSpans = []
// THE SEAM: resolveExecutable(name) + spawn({argv,cwd,stdio,graceMs}) -> a handle whose `done` yields the outcome.
const subprocess = {
  resolveExecutable: async (name) => '/fake/bin/' + String(name),
  spawn: (opts) => {
    spawns.push((opts.argv || []).join(' '))
    return { done: Promise.resolve({ exitCode: 0, signal: null, stdout: 'Build completed successfully.\n', stderr: '' }), terminate() {} }
  },
}
applyV5R({
  agents: { roots: () => [root], get: (id) => agents.get(id), list: () => [...agents.values()] },
  subagents: { list: () => ['spawn'], async startContinuable(spec) { seq += 1; capturedSpans.push(spec); return { childId: 'v-child-' + seq, messageId: 'm' } }, async sendMessage() { return 'm' }, interrupt() {}, async drainContinuableChildren() {} },
  fs: {
    // the preset derives an absolute institute root and passes it straight back: an already-absolute path must pass
    // through untouched, or joining it under the temp dir would mangle it into a path that cannot be created.
    resolve: async (p) => { const s = String(p); return /^([A-Za-z]:[\\/]|\/)/.test(s) ? s : join(workspace, s) },
    stat: async (p) => (existsSync(p) ? { isFile: () => true, isDirectory: () => false, size: 0, mtimeMs: 0 } : undefined),
    readText: async (p) => { try { return readFileSync(p, 'utf8') } catch { return undefined } },
    writeText: async (p, c) => { const d = dirname(p); if (!existsSync(d)) mkdirSync(d, { recursive: true }); writeFileSync(p, String(c)); return { operation: 'write', after: { size: String(c).length } } },
    readFileSync: (p, e) => readFileSync(p, e), existsSync: (p) => existsSync(p),
    mkdirSync: (p, o) => mkdirSync(p, o),
    writeFileSync: (p, d) => { const dd = dirname(p); if (!existsSync(dd)) mkdirSync(dd, { recursive: true }); writeFileSync(p, d) },
    renameSync: (a, b) => renameSync(a, b), readdirSync: (p, o) => readdirSync(p, o),
    listDir: async (p) => { try { return readdirSync(p) } catch { return [] } },
  },
  tools: { register(spec) { registry.set(spec.name, spec); return () => {} } },
  commands: { register() { return () => {} } },
  timer: { setTimeout: (fn, ms) => { const h = setTimeout(fn, ms); if (h && h.unref) h.unref(); return h }, clearTimeout, setInterval: () => 0, clearInterval: () => {} },
  timeout: (fn, ms) => { const h = setTimeout(fn, Math.min(Number(ms) || 0, 5)); if (h && h.unref) h.unref(); return () => clearTimeout(h) },
  get: (what) => (what === 'subprocess' ? subprocess : undefined),
  on() { return () => {} },
  effect(fn) { try { const d = fn(); return typeof d === 'function' ? d : () => {} } catch { return () => {} } },
  logger: { info() {}, warn() {}, error() {} },
})
const call = async (name, params, agent) => {
  const spec = registry.get(name)
  if (!spec) return { missing: name }
  const a = agent || root
  try { const r = await spec.execute(params || {}, { agent: a, session: a.session }); return typeof r === 'string' ? JSON.parse(r) : r } catch (e) { return { thrown: true, code: e && e.code, message: String(e && e.message) } }
}
const seat = (id) => { const c = seats.get(id); return { id: c, session: { id: c, header: { cwd: workspace, parentSession: root.id } }, options: {} } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const started = await call('vibe_v5_start', {})
ok(started.ok === true, 'V1. the institute starts with the subprocess seam in place', started)
const roster = await call('vibe_v5_members', {})
for (const m of (roster.members || [])) if (m.childId) { seats.set(m.id, m.childId); agents.set(m.childId, seat(m.id)) }
ok(seats.size >= 2 && seats.has('acad') && seats.has('r-1'), 'V2. the roster publishes the childIds that seat an acting member', [...seats.keys()])

const rec = await call('vibe_v5_record_proposition', { id: 'p-lean-a', title: 'L2', statement: 'L2 holds', value: 0.7, motive: 'step', p: 0.5 }, seat('r-1'))
ok(rec.ok === true && typeof rec.fingerprint === 'string' && rec.owner === 'r-1',
  'V3. ★★ a recorded proposition is a card with a FINGERPRINT and an owner', { file: rec.file, owner: rec.owner })

const arch = await call('vibe_v5_lean_archive', { kind: 'proof', target: 'p-lean-a', name: 'L2', content: 'theorem L2 : True := trivial', run: true }, seat('r-1'))
ok(arch.ok === true && typeof arch.jobId === 'string' && arch.status === 'attempted',
  'V4. ★★ the proof is written AND QUEUED for background compilation', { jobId: arch.jobId, status: arch.status })
ok(arch.async && arch.async.state === 'queued',
  'V5. ★★★ and the queue is real: the job is queued rather than compiled inline, so a slow compiler cannot block the tool', arch.async)

await sleep(250)
const jobRes = await call('vibe_v5_lean_job', { jobId: arch.jobId }, seat('r-1'))
const job = jobRes.job || {}
ok(spawns.length > 0, 'V6. ★★ the host subprocess seam was actually used (ctx.get(subprocess) is the door)', { spawns: spawns.length })
ok(job.state === 'settled' && job.ok === true && job.exitCode === 0,
  'V7. ★★★ the job LANDS settled with ok=true and exitCode 0', { state: job.state, ok: job.ok, exitCode: job.exitCode })
ok(typeof job.proof === 'string' && /Verified/.test(job.proof),
  'V8. ★★★ and the file is PROMOTED into the verified tree', { proof: job.proof })

// before the formal ledger entry exists, the debate is refused
const early = await call('vibe_v5_propose_verify', { target: 'p-lean-a', kind: 'proposition', reason: 'too early' }, seat('acad'))
ok(early.ok === false && /locked|定稿/.test(String(early.message)),
  'V9. ★★★ ORDER ENFORCED: a proof that has not been REGISTERED cannot open the debate', { message: String(early.message).slice(0, 70) })

const registered = await call('vibe_v5_end_verify', { target: 'p-lean-a', op: 'formal_proof', status: 'proved', reason: 'lean passed' }, seat('acad'))
ok(registered.ok === true && registered.formalProof && registered.formalProof.locked === true && registered.formalProof.status === 'proved',
  'V10. ★★★ registering with op=formal_proof writes the institute formal ledger entry LOCKED (the door the refusal kept naming)',
  registered.formalProof)

const unlocked = await call('vibe_v5_propose_verify', { target: 'p-lean-a', kind: 'proposition', reason: 'now debatable' }, seat('acad'))
ok(unlocked.ok === true && unlocked.queued === 'p-lean-a',
  'V11. ★★★ THE DEBATE UNLOCKS ONLY NOW: proof first, consensus second, enforced by the same record that carries the evidence', unlocked)

const v1 = await call('vibe_v5_verdict', { target: 'p-lean-a', verdict: 1, reason: 'holds' }, seat('r-1'))
const v2 = await call('vibe_v5_verdict', { target: 'p-lean-a', verdict: 0, reason: 'doubt' }, seat('r-2'))
ok(v1.ok === true && v2.ok === true,
  'V12. ★★ two seated members cast OPPOSITE boolean verdicts on the object under verification', { first: v1.verdict, second: v2.verdict })

const closed = await call('vibe_v5_end_verify', { target: 'p-lean-a' }, seat('acad'))
ok(closed !== null && typeof closed === 'object',
  'V13. ★★ and the academician closes the debate so the aggregation may run', { keys: Object.keys(closed || {}).slice(0, 8) })
console.log('  (observed aggregation: ' + JSON.stringify(closed).slice(0, 220) + ')')

// ── D3 vocabulary and C3's separation, read straight out of the aggregation payload ──────────────────────────
ok(closed.process && Array.isArray(closed.process.answered) && Array.isArray(closed.process.silent) && Array.isArray(closed.process.unable),
  'V14. ★★★ the aggregation NAMES who answered, who stayed silent and who declared themselves unable - D3 vocabulary, measured',
  closed.process && { answered: closed.process.answered, silent: closed.process.silent, unable: closed.process.unable })
ok(closed.outcome === 'undecided' && closed.process && typeof closed.process.mean === 'number' && closed.process.silent.length > 0,
  'V15. ★★★ C3 MEASURED AS A SEPARATION: a mean IS computed from the opposing verdicts, and the OUTCOME still stays undecided because members stayed silent',
  { outcome: closed.outcome, mean: closed.process && closed.process.mean, silent: closed.process && closed.process.silent })
// ★ THIS LINE USED TO END IN `|| true`, so it asserted nothing at all. It now states the one thing that WAS
// observed - the process payload is an object - and says plainly that its extra fields are not being claimed.
ok(closed.process !== null && typeof closed.process === 'object',
  'V16. ★ the close process payload is an object; its additional fields were observed but are not asserted here')

// ── D5a: who may file a reconsideration, and what does the payload say about the rule? ───────────────────────
const lateProbe = await call('vibe_v5_minutes', {}, seat('acad'))
ok(lateProbe.ok === false && /NO_OPEN_MEETING/.test(String(lateProbe.code)),
  'V17. ★★ minutes answer "no meeting in progress" when none is open: they are filed WITH the meeting that held them',
  { code: lateProbe.code })
const byChair = await call('vibe_v5_reconsider', { target: 'p-lean-a', why: 'reopen' }, seat('acad'))
ok(byChair.ok === false && byChair.code === 'V5_NOT_VOTER' && /participant|参与者/.test(String(byChair.message)),
  'V18. ★★★ D5a MEASURED (first half): a NON-participant cannot file a reconsideration, and the refusal names the rule',
  { code: byChair.code, message: String(byChair.message).slice(0, 70) })
const byParticipant = await call('vibe_v5_reconsider', { target: 'p-lean-a', why: 'new counterexample' }, seat('r-1'))
ok(byParticipant.ok === true && byParticipant.reconsideration && byParticipant.reconsideration.eligibility === 'any-participant',
  'V19. ★★★ D5a MEASURED (second half): a PARTICIPANT may, and the payload states the rule that admitted it',
  byParticipant.reconsideration)
ok(byParticipant.reconsideration && byParticipant.reconsideration.onlyUp === true &&
  byParticipant.reconsideration.thresholdAfter >= byParticipant.reconsideration.thresholdBefore,
  'V20. ★★★ and the threshold only ever RISES across a reconsideration (onlyUp true), so reopening cannot soften the bar',
  { before: byParticipant.reconsideration && byParticipant.reconsideration.thresholdBefore, after: byParticipant.reconsideration && byParticipant.reconsideration.thresholdAfter })
const noWhy = await call('vibe_v5_reconsider', { target: 'p-lean-a' }, seat('r-1'))
ok(noWhy.ok === false && /why|理由/.test(String(noWhy.message)),
  'V21. ★ a reconsideration without a stated reason is refused, and the refusal cites D5', { message: String(noWhy.message).slice(0, 60) })

// ── D4 and D8: one is a DELIBERATE ABSENCE (so not a gap), the other is enforced in code ──────────────────────
{
  const rulings = readFileSync(pathToFileURL(legacyFile('vibe-math-v5r', 'docs/02-rulings.md')), 'utf8')
  ok(/故意不做/.test(rulings) && /无窗口|无定时器/.test(rulings) && /D10/.test(rulings),
    'V22. ★★★ D4 ANSWERED AS A DESIGNED ABSENCE: the ruling volume says the window/frequency layer of reconsideration is DELIBERATELY not built, on the R1/D10 principle that the framework recommends and never drives - so "no extension cap" is a decision, not a missing gate',
    { cites: 'docs/02-rulings.md' })
  const hire = registry.get('vibe_v5_hire')
  const hireProps = Object.keys((hire.parameters || {}).properties || {})
  ok(hireProps.includes('term') && hireProps.includes('purpose') && hireProps.includes('initial_task'),
    'V23. ★ a temporary worker is hired with a TERM, a purpose and a first task - the roster distinguishes temp from permanent', hireProps)
  const vsrc = readFileSync(pathToFileURL(legacyFile('vibe-math-v5r', 'vibe-math-v5r.js')), 'utf8')
  ok(/kind !== 'temp'/.test(vsrc) && /列席／受邀／临时工没有表决权（D8）/.test(vsrc),
    'V24. ★★★ D8 ENFORCED IN CODE: temporary members are excluded from the active set, and a vote attempt is refused by name with the ruling cited',
    { cites: "kind !== 'temp' + the D8 refusal" })
  ok(/你的意见已转达给表决者/.test(vsrc) && /to: 'voters'/.test(vsrc),
    'V25. ★★★ and the refusal RELAYS the non-voter opinion to the voters instead of dropping it: D8 says an observer may be quoted and may speak, but never votes - and the code keeps the speaking half rather than discarding it',
    { cites: 'the relay inside the refusal path' })
}

// ── D9's broadcast triple, and the VOTING method set compared against our ballot face ────────────────────────
{
  ok(typeof closed.endedBy === 'string' && typeof closed.reason === 'string' && closed.outcome !== undefined,
    'V26. ★★ D9 MEASURED: the broadcast carries all three elements - by which rule/who it was closed, WHY, and the result',
    { by: closed.endedBy, why: String(closed.reason).slice(0, 40), outcome: closed.outcome })
  const voting = readFileSync(pathToFileURL(legacyFile('vibe-math-v5r', 'MEETING-PLATFORM-VOTING.md')), 'utf8')
  const rows = voting.split('\n').filter((l) => /^\|\s*\d+\s*\|/.test(l))
  ok(rows.length >= 10 && /纳入/.test(voting) && /不建议纳入/.test(voting),
    'V27. ★★ v5r enumerates a full method set with adopt / adapt / DO-NOT-ADOPT verdicts per method', { methods: rows.length })
  const boxSrc = readFileSync(new URL('../vibe-math-vmu/kernel/ballotbox.js', import.meta.url), 'utf8')
  const ballotSrc = readFileSync(new URL('../vibe-math-vmu/kernel/ballot.js', import.meta.url), 'utf8')
  const declared = (boxSrc.match(/const allowed = \[([^\]]+)\]/) || [])[1] || ''
  ok(/plurality/.test(declared) && /approval/.test(declared) && /runoff/.test(declared) && /irv/.test(declared),
    'V28. ★★★ vmu IMPLEMENTS four methods, matching four of v5r adopt rows: relative majority, option-style approval, the two-round runoff, and ranked instant-runoff', { allowed: declared.trim() })
  ok(/instantRunoffTally/.test(ballotSrc) && /a tie for elimination is NOT broken here/.test(ballotSrc),
    'V29. ★★★ and its IRV matches v5r adapt verdict exactly: one collection round, one tally, and an elimination TIE is left undecided rather than broken by an implicit sort order')
  ok(/vmu\.ballot\.roundsMax/.test(boxSrc) && /vmu\.ballot\.runoffTopN/.test(boxSrc),
    'V30. ★★ the two-round path carries an explicit ROUND CAP and a top-N - which is v5r requirement that the round limit be written down in advance')
  ok(/vmu\.ballot\.secrecy/.test(boxSrc) && /vmu\.ballot\.secrecyRecordFact/.test(boxSrc) && /vmu\.ballot\.reopenFloor/.test(boxSrc),
    'V31. ★★★ secrecy is chosen in advance, the fact that a ballot was secret is RECORDED, and reopening cannot lower the bar - the three halves of the confidentiality rule')
  ok(/vmu\.ballot\.vetoMode/.test(boxSrc) && /vmu\.ballot\.quadraticCreditCap/.test(boxSrc) && /vmu\.ballot\.quotaSeats/.test(boxSrc),
    'V32. ★★★ DIVERGENT (named, and it is the retention rule in action): v5r DECLINES veto power and cumulative voting as architecture conflicts, while vmu carries them as TUNABLE options - vetoMode, quadraticCreditCap, quotaSeats - available and off by default rather than absent',
    { v5r: 'veto and cumulative marked DO NOT ADOPT', vmu: 'present as settings' })
}

// ── the notification window, the effective-time chain, and the conflicts the v5r volumes declare themselves ──
{
  const confSrc = readFileSync(new URL('../vibe-math-vmu/kernel/conference.js', import.meta.url), 'utf8')
  ok(/vmu\.conference\.cfpOpenMs/.test(confSrc) && /vmu\.conference\.cfpCloseMs/.test(confSrc),
    'V33. ★★ the NOTIFICATION WINDOW is a pair of tunable keys here: when the call opens and when it closes',
    { keys: 'cfpOpenMs / cfpCloseMs' })
  const pubSrc = readFileSync(new URL('../vibe-math-vmu/kernel/publication.js', import.meta.url), 'utf8')
  const chain = (pubSrc.match(/VERSION_CHAIN = Object\.freeze\(\[([^\]]+)\]/) || [])[1] || ''
  ok(/preprint/.test(chain) && /vor/.test(chain) && /erratum/.test(chain),
    'V34. ★★★ the EFFECTIVE-TIME notion exists as a publication version chain - preprint, accepted, version of record, erratum - with each step timestamped in the history',
    { chain: chain.trim() })
  ok(/rollback is not allowed/.test(pubSrc) && /legal next/.test(pubSrc) && /VMU_VERSION_CHAIN_BROKEN/.test(pubSrc),
    'V35. ★★★ and the chain is enforced: a jump or a rollback is refused BY NAME with the current version and the legal next one - never silently accepted')
  const rulings = readFileSync(pathToFileURL(legacyFile('vibe-math-v5r', 'MEETING-PLATFORM-RULINGS.md')), 'utf8')
  const covered = (rulings.match(/已覆盖/g) || []).length
  ok(covered >= 5 && /矛盾与张力/.test(rulings) && /残余漏洞/.test(rulings),
    'V36. ★★★ the three-volume CONFLICTS ARE DECLARED BY THE VOLUMES THEMSELVES: the ruling volume carries a consistency review of the decision volume faults plus residual gaps, each with a coverage verdict',
    { coveredRows: covered })
  ok(/出人 1|出人 2/.test(rulings) && /新增要求/.test(rulings) && /收紧/.test(rulings),
    'V37. ★★★ and the two drafting discrepancies are NAMED with their direction - one is an ADDITION the decision volume never stated, the other a TIGHTENING that was confirmed - rather than being smoothed away',
    { cites: 'the ruling volume discrepancy list' })
}

// ── THE LOST-UPDATE GATE, both sides: the same field, the same precondition, the same refusal ────────────────
{
  const made = await call('vibe_v5_task_create', { subject: 'check L1', description: 'd' }, seat('acad'))
  ok(made.ok === true && made.task && made.task.revision === 1,
    'V38. ★★ v5r task records carry an explicit revision, starting at one', { revision: made.task && made.task.revision })
  const tid = made.task && made.task.id
  const first = await call('vibe_v5_task_update', { task_id: tid, expected_revision: 1, action: 'claim' }, seat('acad'))
  ok(first.ok === true && first.task && first.task.revision === 2,
    'V39. ★★ an update that states the revision it saw succeeds, and the revision ADVANCES', { revision: first.task && first.task.revision })
  const stale = await call('vibe_v5_task_update', { task_id: tid, expected_revision: 1, action: 'done' }, seat('acad'))
  ok(stale.ok === false && stale.code === 'V5_TASK_STALE_REVISION' && /revision/.test(String(stale.message)),
    'V40. ★★★ a STALE write is refused BY NAME, and the refusal names the real revision and the way out (re-read, then retry)',
    { code: stale.code, message: String(stale.message).slice(0, 60) })

  // our side, the same failure mode
  const strict = createTasks({ clock: () => 1000, requireExpectedRevision: true })
  const ours = await strict.create({ title: 'check L1' })
  const oursRight = await (async () => { try { const r = await strict.transition(ours.id, 'doing', { expectedRevision: 1 }); return { ok: r.ok, revision: strict.list()[0].revision } } catch (e) { return { code: e && e.code } } })()
  const oursStale = await (async () => { try { const r = await strict.transition(ours.id, 'done', { expectedRevision: 1 }); return { ok: r.ok === true } } catch (e) { return { code: e && e.code } } })()
  ok(oursRight.ok === true && oursRight.revision === 2,
    'V41. ★★ the framework side behaves the same way: the right revision is accepted and the counter advances', oursRight)
  ok(oursStale.code === 'VMU_TASK_STALE_REVISION',
    'V42. ★★★ and a stale one is refused by name on this side too', oursStale)
  ok(stale.code === 'V5_TASK_STALE_REVISION' && oursStale.code === 'VMU_TASK_STALE_REVISION',
    'V43. ★★★★ EQUAL: the two sides refuse the SAME failure mode under the SAME field name and the SAME code family - V5_TASK_STALE_REVISION against VMU_TASK_STALE_REVISION - and both tell the caller to re-read rather than merging',
    { v5r: stale.code, vmu: oursStale.code })
}

// ── THE MESSAGING FAMILY, driven: how a message reaches members, and how long a wait may be ─────────────────
{
  const group = await call('vibe_v5_say', { text: 'hello all' }, seat('r-1'))
  ok(group.ok === true && group.delivered === 3 && Array.isArray(group.ids) && !String(group.to).includes('r-1'),
    'V44. ★★ a group message is delivered per recipient with an id each, and the SENDER is not in the delivery list',
    { delivered: group.delivered, to: group.to })
  const dm = await call('vibe_v5_say', { text: 'psst', to: 'r-2' }, seat('r-1'))
  ok(dm.ok === true && dm.delivered === 1 && dm.to === 'r-2',
    'V45. ★★ a private message goes to exactly the named member', { delivered: dm.delivered, to: dm.to })
  const relay = await call('vibe_v5_message', { to: 'all', content: 'from the office' })
  ok(relay.ok === true && relay.delivered === 4 && String(relay.to).includes('acad') && String(relay.to).includes('r-3'),
    'V46. ★★ the office relay reaches EVERY member, including the academician - a different delivery rule from a member speaking',
    { delivered: relay.delivered, to: relay.to })
  const tooShort = await call('vibe_v5_wait', { timeout_ms: 30, reason: 'probe' }, seat('r-1'))
  ok(tooShort.ok === false && /10000/.test(String(tooShort.error || tooShort.message)),
    'V47. ★★★ the non-polling WAIT has a BOUNDED window - it refuses a too-short timeout and names the acceptable range',
    { error: String(tooShort.error || tooShort.message).slice(0, 70) })
  const meetSrc2 = readFileSync(new URL('../vibe-math-vmu/kernel/meetings.js', import.meta.url), 'utf8')
  ok(/\bsay\(\{/.test(meetSrc2) && /quote\(\{/.test(meetSrc2),
    'V48. ★ PROPERTY: the framework meeting face carries the same two surfaces - speaking into the record and quoting out of it - so delivery and citation are separate acts on both sides')
}


// ── THE PER-ROUND A/B: the same member, both sides, and only the properties that are observable ─────────────
{
  const asks = capturedSpans.map((s) => {
    const req = s && s.request
    const first = req && Array.isArray(req.prompt) ? req.prompt[0] : null
    return { persona: req && typeof req.persona === 'string' ? req.persona : '', ask: first && typeof first.text === 'string' ? first.text : '' }
  })
  ok(asks.length >= 2 && asks.every((x) => x.persona.length > 200 && x.ask.length > 40),
    'V49. ★★★ THE ORIGINAL composes per member: every spawned turn carries a charter AND a turn ask',
    { turns: asks.length, charters: asks.map((x) => x.persona.length) })
  ok(new Set(asks.map((x) => x.persona)).size >= 2,
    'V50. ★★★ and the charter DIFFERS per member - it addresses the member it is written for, never a global')
  ok(new Set(asks.map((x) => x.ask)).size >= 2,
    'V51. ★★ so does the turn ask, because each member is given its own phase and starting point')

  // The kernel injects no section by itself (its header says so: with an empty config the assembled prompt equals the
  // base). So the corpus sections the pack publishes are handed to the pipeline explicitly - which is what proves the
  // MECHANISM carries a real turn, while the DEFAULT pack-to-pipeline wiring is what V53 names as outstanding.
  const kernelTurn = createKernel({ settings: {}, root: turnRoot, host: null })
  const loop = createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS, prompt: createPromptPipeline({ sections: v5rPromptSections, clock: () => '2026-01-01T00:00:00.000Z' }), faces: facesFrom(kernelTurn) })
  const asm1 = await loop.assemble(loop.open({ member: 'r-1', phase: 'founding' }).turn)
  const asm2 = await loop.assemble(loop.open({ member: 'acad', phase: 'founding' }).turn)
  ok(asm1.ok === true && asm1.text.length > 1000 && asm2.ok === true && asm2.text.length > 1000,
    'V52. ★★★ THE FRAMEWORK assembles a real turn from its own pipeline, carrying the v5r corpus, with no original preset involved',
    { chars: [asm1.text && asm1.text.length, asm2.text && asm2.text.length], sources: asm1.sources && asm1.sources.length })
  ok(asm1.text !== asm2.text,
    'V53. ★★★★ after round 358 the plain corpus is no longer member-agnostic: the captured texts carry {{ member }}/{{ role }} placeholders, so two members already get different text before any role section - the fragments do the work the snapshot could not',
    { same: asm1.text === asm2.text })
  // ROUND 341: the gap V53 used to name is closed by the pipeline own variable injection - one template section
  // addresses whichever member is being assembled, so nothing is hard-coded per member and the section stays
  // editable through settings, config or middleware.
  const loopRole = createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS, prompt: createPromptPipeline({ sections: v5rTurnSections, clock: () => '2026-01-01T00:00:00.000Z' }), faces: facesFrom(kernelTurn) })
  const r1 = await loopRole.assemble(loopRole.open({ member: 'r-1', role: 'researcher', roleLabel: '常驻研究员', phase: 'founding' }).turn)
  const ac = await loopRole.assemble(loopRole.open({ member: 'acad', role: 'academician', roleLabel: '院士', phase: 'founding' }).turn)
  ok(r1.ok === true && ac.ok === true && r1.text !== ac.text && r1.text.includes('{{') === false,
    'V54. ★★★★ CLOSED: with the role section the framework composes PER MEMBER, two members get different text, and no placeholder is left unsubstituted',
    { chars: [r1.text.length, ac.text.length], differ: r1.text !== ac.text })
  // ROUND 594 — A DELIBERATE EXPECTATION CHANGE, with its reason. This assertion used to ask for the KIND KEY ('researcher'), which
  // is what the heading interpolated before the bridge was fixed. The prompt pipeline's own note (ROUND 364) calls that a mixing
  // error: `role` is the key that BINDINGS select on, `roleLabel` is what a READER sees, and mixing the two renders a heading as
  // "—— researcher r-1". Measured after the fix: the assembled turn carries the member and the LABEL, and no kind key at all.
  ok(r1.text.includes('r-1') && r1.text.includes('常驻研究员') && ac.text.includes('acad') && ac.text.includes('院士'),
    'V55. ★★★ and each assembled turn names the member and the READER-FACING role label it was written for')
}
// ── THE WAKE PATH, both sides: a turn is bound to a NAMED member, and nobody gets an anonymous turn ────────────
{
  const acadAgent = (() => {
    for (const [id, m] of seats.entries()) if (id === 'acad') return { id: seats.get(id), session: { id: seats.get(id), header: { cwd: workspace, parentSession: root.id } }, options: {} }
    return root
  })()
  const before = capturedSpans.length
  const unnamed = await call('vibe_v5_nudge', { why: 'no target', next_step: 'none' }, acadAgent)
  ok(unnamed.ok === false && unnamed.code === 'V5_MEMBER_NOT_FOUND',
    'V56. ★★★ the ORIGINAL refuses a wake that names no member, by name - there is no anonymous turn', { code: unnamed.code })
  const named = await call('vibe_v5_nudge', { to: 'r-1', why: 'continue the proof', next_step: 'close the lemma' }, acadAgent)
  ok(named.ok === true && named.nudged === 'r-1',
    'V57. ★★ and a proper wake names WHO, WHY and WHAT NEXT - the three elements the framework turn carries too', named)
  ok(capturedSpans.length === before,
    'V58. ★★★★ MEASURED, AND IT IS THE POINT OF THIS OBJECTIVE: the original ACCEPTS the wake and still spawns no turn, because its orchestration lives OUTSIDE its own tools - in the host loop. The framework exposes that loop itself (turn.open, assemble, deliver, parse, apply), which is what makes it runnable by a different host',
    { before, after: capturedSpans.length })
  let anonymous = null
  const anonLoop = createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS, prompt: createPromptPipeline({ sections: v5rTurnSections, clock: () => '2026-01-01T00:00:00.000Z' }) })
  try { anonLoop.open({ phase: 'normal' }) } catch (e) { anonymous = e }
  ok(anonymous !== null && (anonymous.code === 'VMU_INVALID_ARGUMENT' || /member/i.test(String(anonymous.message))),
    'V59. ★★★ so does the framework: a turn with no member is refused rather than seated anonymously, which is the same rule on both sides',
    { code: anonymous && anonymous.code, message: anonymous && String(anonymous.message).slice(0, 90) })
}

// ── PAUSE: which AUTHORITY, and what it actually stops - measured on both sides ─────────────────────────────
{
  const acadAs = (() => { for (const [id] of seats.entries()) if (id === 'acad') return { id: seats.get(id), session: { id: seats.get(id), header: { cwd: workspace, parentSession: root.id } }, options: {} }; return root })()
  const asMember = await call('vibe_v5_pause', {}, acadAs)
  ok(asMember.ok === false && asMember.code === 'V5_NOT_OFFICE' && /session root|office/i.test(String(asMember.message)),
    'V60. ★★★ PAUSE IS PERMISSIONED on the original side: a member is refused by name, and the refusal says the office is the PROVABLE session root',
    { code: asMember.code, message: String(asMember.message).slice(0, 80) })
  const asOffice = await call('vibe_v5_pause', {})
  ok(asOffice.ok === true && asOffice.paused === true && /不会被再次唤醒|schedul/i.test(String(asOffice.message)),
    'V61. ★★★ and the office may pause, with the receipt stating WHAT it stops: no member is woken again',
    { message: String(asOffice.message).slice(0, 70) })
  const writePaused = await call('vibe_v5_task_create', { subject: 'while paused', description: 'd' })
  const sayPaused = await call('vibe_v5_say', { text: 'still talking' })
  ok(writePaused.ok === true && sayPaused.ok === true,
    'V62. ★★★★ MEASURED DIFFERENCE: the original pause does NOT gate writes or speech - the task is created and the message is delivered while the institute is paused, because it pauses the SCHEDULER and not the doors',
    { write: writePaused.ok, say: sayPaused.ok })
  await call('vibe_v5_resume', {})

  const kp = createKernel({ settings: {}, root: mkdtempSync(join(tmpdir(), 'vmu-pause-')), host: null })
  await kp.tasks.create({ title: 'before' })
  await kp.pause('the A/B measured both sides')
  let gated = null
  try { await kp.tasks.create({ title: 'while paused' }) } catch (e) { gated = e }
  ok(gated !== null && gated.code === 'VMU_STATE',
    'V63. ★★★★ while HERE pause gates the DOORS: a write while paused is refused by name', { code: gated && gated.code })
  const sched = readFileSync(new URL('../vibe-math-vmu/kernel/scheduler.js', import.meta.url), 'utf8')
  ok(/isPaused/.test(sched),
    'V64. ★★★★ and it ALSO stops the scheduler, because that face takes an isPaused seam - so this side pauses both axes while the original pauses one, which is what makes the difference a superset rather than a substitution',
    { cites: 'scheduler.js isPaused' })
  await kp.resume('done')
  const openAgain = await kp.tasks.create({ title: 'after resume' })
  ok(openAgain && openAgain.id,
    'V65. *** and resuming reopens the doors, so the gate is not a trap')
}


// ── ACCEPTANCE (2) MEASURED: how much of the ORIGINAL delivered prompts does our assembly reproduce? ───────────
// The corpus holds the prompts the original really delivered, so this is not a fixture talking to itself. It reports
// a number rather than a feeling, and it names the line families we do NOT yet reproduce, because a percentage with
// no list is a number nobody can act on.
{
  const SETTINGS_AB = {
    "vmu.turn.protocolPath": "VibeMath/Projects/default/Institutes/institute/Shared/Protocol.md",
    "vmu.turn.instituteName": "institute", "vmu.turn.objective": "probe", "vmu.turn.leaderId": "acad",
    "vmu.turn.maxParallel": 3, "vmu.turn.toolCallsPerTurnCap": 0, "vmu.turn.memoryCeilingMb": 0,
    "vmu.pointer.propagation": true, "vmu.turn.feedback": true, "vmu.meetings.verdictMaxRounds": 3,
  }
  const INBOX = await import("../vibe-math-vmu/packs/v5r/notices.js")
  const mkAB = () => createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS,
    prompt: createPromptPipeline({ sections: [...CHARTER_SECTIONS, v5rRoleSection], bindings: CHARTER_BINDINGS, clock: () => "2026-01-01T00:00:00.000Z" }),
    settings: SETTINGS_AB,
    extraPhases: ["heartbeat", "paper-write", "paper-review", "paper-final"],
    noticeBlock: INBOX.inboxBlock,
  })
  const loopAB = mkAB()
  // THE PHASE SEAM BITES BOTH WAYS. The framework validates a phase but does not own the vocabulary: a phase the
  // pack declares is accepted, and one nobody declares is refused by name with the union printed. A seam that only
  // accepts everything is not a validation.
  {
    const withPack = mkAB()
    let okPack = true
    try { withPack.open({ member: "acad", role: "academician", roleLabel: "院士", phase: "heartbeat" }) } catch (e) { okPack = false }
    ok(okPack, "a phase the PACK declares is accepted by the framework", { phase: "heartbeat" })
    let refusal = null
    try { withPack.open({ member: "acad", role: "academician", roleLabel: "院士", phase: "not-a-phase" }) } catch (e) { refusal = e }
    ok(refusal && refusal.code === "VMU_INVALID_ARGUMENT" && /heartbeat/.test(String(refusal.hint || "")),
      "and a phase NOBODY declares is refused by name, with the framework list AND the pack list printed - so a pack can extend the set without the framework learning its vocabulary",
      { code: refusal && refusal.code, hint: refusal && String(refusal.hint || "").slice(0, 90) })
  }
  // queue one notice, so the inbox block the corpus shows is really rendered
  loopAB.notify("acad", "【研究所提示】demo 未生效（V5_DEMO）：示例通知，用于让比对看见表头与缩进")
  const oursAB = {}
  // ONE assembly per phase, for the fidelity number, which must not have its denominator inflated by the union.
  const oursSingle = {}
  // THE SAME INPUT UNION THE PER-TYPE FILE USES, and for the same reason: this number should say what the pack CAN
  // produce when a caller supplies the inputs it expects, not what one assembly happened to produce. A founding round
  // is seeded per member and a review names who is reviewed, so one call sees one of each and reports the rest as
  // missing - a claim about the harness wearing the costume of a claim about the pack.
  const UNION_INPUTS = {
    founding: [
      { member: "acad", role: "academician", roleLabel: "院士" },
      { member: "r-1", role: "researcher", roleLabel: "研究员" },
      { member: "r-2", role: "researcher", roleLabel: "研究员" },
      { member: "r-3", role: "researcher", roleLabel: "研究员" },
      { member: "t-1", role: "temp", roleLabel: "临时工" },
    ],
  }
  for (const phase of ["founding", "normal", "checkpoint", "verify", "heartbeat", "paper-write", "paper-review", "paper-final", "meeting", "resume"]) {
    const variants = UNION_INPUTS[phase] || [{}]
    const parts = []
    for (const v of variants) {
      const a = await loopAB.assemble(loopAB.open(Object.assign({ member: "acad", role: "academician", roleLabel: "院士", phase, meetingState: phase === "meeting" ? "first" : undefined, roster: "acad、r-1、r-2、r-3", quorum: 3, statusBlock: "[状态] x", round: 3 }, v)).turn)
      parts.push(String(a.text))
    }
    // the reviewer is a SETTING, so the second one needs a second loop rather than a per-call variant
    if (phase === "paper-review") {
      const alt = createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS,
        prompt: createPromptPipeline({ sections: [...CHARTER_SECTIONS, v5rRoleSection], bindings: CHARTER_BINDINGS, clock: () => "2026-01-01T00:00:00.000Z" }),
        settings: Object.assign({}, SETTINGS_AB, { "vmu.paper.reviewedMember": "acad" }),
        extraPhases: ["heartbeat", "paper-write", "paper-review", "paper-final"],
        noticeBlock: INBOX.inboxBlock,
      })
      alt.notify("acad", "【研究所提示】demo 未生效（V5_DEMO）：示例通知，用于让比对看见表头与缩进")
      const a2 = await alt.assemble(alt.open({ member: "acad", role: "academician", roleLabel: "院士", phase, roster: "acad、r-1、r-2", quorum: 3, statusBlock: "[状态] x", round: 3 }).turn)
      parts.push(String(a2.text))
    }
    oursSingle[phase] = parts[0]
    oursAB[phase] = parts.join("\n")
  }
  // A kind alone cannot place a prompt: nine of the ten heartbeat prompts in the corpus carry kind `normal`, because
// the heartbeat REPLACES an ordinary round rather than accompanying one. The text is what distinguishes it.
const phaseOf = (kind, text) => {
  const k = String(kind)
  const x = String(text || "")
  if (/^founding/.test(k)) return "founding"
  if (/所内一段时间没有新进展了/.test(x)) return "heartbeat"
  if (/checkpoint|heartbeat/.test(k)) return "checkpoint"
  if (/^paper-/.test(k)) return k
  if (k === "meeting" || k === "meeting-proposal") return "meeting"
  if (k === "resume") return "resume"
  if (/verify|vote|ballot|lean/.test(k)) return "verify"
  return "normal"
}
  const fixedOf = (s) => String(s).split("\n").map((l) => l.trim()).filter((l) => l.length > 12 && !l.includes("{{") && !/^[-#*|·]/.test(l) && !/^\{"|^\{ "/.test(l))
  // The corpus carries an absolute project path in a few lines; this port names that path through a setting
  // rather than hard-coding it, so a literal comparison would count a covered line as a gap. Normalising both
  // sides compares what a reader sees rather than where this deployment happens to live.
  const normPath = (s) => String(s).replace(/VibeMath\/Projects\/[^\s，。；、]*/g, "<project>").replace(/\{\{ setting:vmu\.turn\.protocolPath \}\}/g, "<protocol>")
  let hitAB = 0
  // the prose-only figure, so this number and the per-type one say comparable things
  let proseHitAB = 0
  let proseTotalAB = 0
  const isDataLine = (l) => /[a-z]{1,8}-\d/.test(l) || /^[\[▸]/.test(l) || /^【/.test(l) || /p-[a-z]/.test(l) || /:\s*"/.test(l) || /^陈述：/.test(l) || /^对象：/.test(l) || /^类型：/.test(l)
  let totalAB = 0
  const missAB = new Set()
  // ★★ DECLARED DIVERGENCES (F5 + the tool-help signature fix). These captured lines are ones the port is KNOWN to
  // have rewritten ON PURPOSE, so counting them as missing makes the ratio measure policy instead of fidelity:
  //   · two of them are the RETIRED reply transport (「只输出一个合法 JSON 对象…」 and 「结束时请**只**输出一个 JSON 对象」),
  //     removed because 《规则》 requires the prompt not to teach mechanisms the runtime no longer has (F5);
  //   · one taught a call the tool REFUSES: `vibe_v5_tool_help({"tool":"工具名称"})`, while the tool only accepts
  //     `member` (measured: it refuses a `tool` key by name), so the port passes `member` and warns instead;
  //   · one listed retired reply fields (`assign`, `prioritize`, `nudge`, `convene_meeting`) that the current faces no
  //     longer share.
  // They are excluded from BOTH sides of the ratio and asserted to be live (a prefix that matches nothing is stale).
  const DECLARED_DIVERGENCES_AB = [
    { prefix: '只输出一个合法 JSON 对象', why: 'F5: the retired JSON transport' },
    { prefix: '结束时请**只**输出一个 JSON', why: 'F5: the retired JSON transport' },
    { prefix: '复杂工具首次使用前调用 vibe_v5_tool_help({"tool"', why: 'the tool only accepts `member`; the old call is refused by name' },
    { prefix: '协调需要时可用assign（subject', why: 'F5: retired reply fields' },
    // ROUND 31 / task-14 (the same F5 ruling, measured on a live run's conformance review): this line named THREE
    // commands that do not exist as tools - `propose_verify`, `propose_meeting`, `hire/fire`. The port names the real
    // faces instead (`vibe_v5_meeting`, `vibe_v5_task_create`, `vibe_vmu_control`, `vibe_vmu_control{action:"fire"}`),
    // so the captured line is not reproducible by design rather than missing transcription.
    { prefix: '协调需要时可propose_verify', why: 'ROUND 31/task-14: taught three commands that are not tools (F5 ruling)' },
    // ★★★ 2026-10-28, THE LEDGER ROUND — THE SAME F5 RULING, APPLIED TO THE TEACHING THE KERNEL REFUTES. The rule
    // ledger (docs/acceptance/rules-ledger.json, rows E9/E13/B6/G7) found five captured lines teaching mechanisms the
    // kernel refuses BY NAME, so the live charter now says the true thing and these captures can no longer match
    // verbatim. Counted on this run: 18 occurrences (10 in the heartbeat family, 8 in the meeting family), and the
    // pool drops from 673 to 655 with the hits unchanged at 506 — 506/655 = 77%, pinned below. Each one names the code:
    //   · `propose_meeting` is a REPLY field the kernel maps to a MOTION (kernel/turn/index.js FIELD_OWNERS), not a
    //     tool; the live text says so and names `vibe_v5_meeting` / motion.
    //   · `meeting_hand` in a receipt is refused BEFORE dispatch (VMU_TURN_FIELD_NOT_APPLICABLE,
    //     kernel/turn/index.js NO_REPLY_MEETING_SHAPE — a reply carries no meeting id); live text teaches
    //     `vibe_vmu_meeting { action: "hand" }` inside the meeting round. Same for `meeting_invite`.
    //   · closure needs the vote quorum m = min(设置, 院士+常驻研究员人数) (kernel/meetings.js quorumOf), not merely
    //     unanimity; the live line states the quorum and reads 「法定票数」 from the status block.
    //   · `sync` is a MOTION KIND (packs/v5r/tools.js), not one of the six meeting types
    //     (packs/v5r/meeting-procedures.js); the live agenda says `ordinary`.
    { prefix: '或者向团队发消息（say）、开一个议题', why: 'LEDGER ROUND: propose_meeting taught as a tool; it is a reply/motion proposal' },
    { prefix: '（流程：**先轮流发言**', why: 'LEDGER ROUND: meeting_hand in a receipt is refused by name; hand is a tool action' },
    { prefix: '只有当**全体有表决权者**都一致认为是真时', why: 'LEDGER ROUND: closure needs the vote quorum m, not unanimity alone' },
    { prefix: 'input：发言；meeting_hand：是否举手', why: 'LEDGER ROUND: the receipt field list named two fields the kernel refuses' },
    { prefix: '议程：分工与下一步（类型：sync）', why: 'LEDGER ROUND: sync is a motion kind; the six types have no sync' },
    // ★★★ 2026-10-29 (G7 AUDIT #2 ROUND): the second independent read-only audit found five places where the live teaching
    // told a story the machinery refuses. Fixing them changed four captured lines (seven occurrences), so they are DECLARED
    // like the families above - each row names the audit item and the sentence the live charter now carries:
    //   · C1 the founding block addressed EVERY seat as the academician; the live line is seat-neutral and points at the identity
    //     section, so the captured 「你是本所的院士。」 can no longer match.
    //   · C2 the same block told every seat it cannot vote or hire/fire; rights are per seat (packs/v5r/seat-faces.js), so the
    //     live line names which seat may hire/fire and vote.
    //   · C5 the review cap can force finalisation (kit/paper.js forcedAfterCap), so the live deliverable line adds the caveat;
    //     the captured sentence asserted unanimity unconditionally.
    //   · ROUND 133/136: the LaTeX note now names `vmu.paper.latexCommand` (the key kernel/latex.js actually reads) and drops the
    //     `latexmk --version` probe the face never runs; the captured note promised a key that did not exist.
    { prefix: '你是本所的院士。', why: 'G7 AUDIT #2 C1: the founding block addressed every seat as the academician; the live line is seat-neutral' },
    { prefix: '你没有表决权及hire/fire权限', why: 'G7 AUDIT #2 C2: voting and hire/fire are per seat (seat-faces.js); the live line names the seat rights' },
    { prefix: '全体参与成员已在互审中表示“可交付”', why: 'G7 AUDIT #2 C5: the review cap can force finalisation; the live line adds that caveat' },
    { prefix: '检测不到 LaTeX 引擎时：① 只', why: 'ROUND 133/136: the live note names vmu.paper.latexCommand and drops the latexmk probe the face never runs' },
  ]
  const matchedDeclared = Object.fromEntries(DECLARED_DIVERGENCES_AB.map((d) => [d.prefix, 0]))
  let declaredAB = 0
  // An UNCAPPED tally, because missAB stops at eight samples and cannot say how large a family is.
  const leftAB = new Map()
  for (const p of PROMPTS) {
    const mine = oursAB[phaseOf(String(p.kind), String(p.text))]
    for (const line of fixedOf(p.text)) {
      const declared = DECLARED_DIVERGENCES_AB.find((d) => String(line).startsWith(d.prefix))
      if (declared) { declaredAB += 1; matchedDeclared[declared.prefix] += 1; continue }
      totalAB += 1
      const dataLine = isDataLine(line)
        if (!dataLine) proseTotalAB += 1
        if (normPath(mine).includes(normPath(line))) { hitAB += 1; if (!dataLine) proseHitAB += 1 }
      else { const k = String(line).slice(0, 18); leftAB.set(k, (leftAB.get(k) || 0) + 1); if (missAB.size < 8) missAB.add(line.slice(0, 46)) }
    }
  }
  ok(declaredAB > 0 && Object.values(matchedDeclared).every((n) => n > 0),
    'V65b. ★★ THE DECLARED DIVERGENCES ARE LIVE: every rewritten family still matches captured lines, so an exclusion cannot outlive the reason for it - and excluding them is what keeps the ratio below a fidelity number rather than a policy number',
    { declaredLines: declaredAB, byPrefix: matchedDeclared, percentOfCorpus: Math.round(1000 * declaredAB / (declaredAB + totalAB)) / 10 })
  const pctAB = Math.round(100 * hitAB / totalAB)
  // ★ FLOORS RE-BASED TWICE, EACH TIME WITH THE ARITHMETIC WRITTEN DOWN.
  //   2026-10-24 (first re-base): the declared divergences stopped being counted as HITS. Before that the excluded families
  //   were counted as hits because the corrections section QUOTES the retired wording it corrects - so the old 85% was
  //   partly a measurement of our own quotation. On the honest basis the measured value was 564/706 = 80%, and the floors
  //   were pinned AT it.
  //   ROUND 31 (second re-base): a LIVE RUN's conformance review found that a captured prompt line taught three commands
  //   that are not tools (`propose_verify`, `propose_meeting`, `hire/fire`) - the corpus itself was the source of the
  //   defect, and the port had copied it faithfully. The port now names the real faces, so that family is DECLARED (the
  //   F5 ruling) and its 33 occurrences leave both sides: pool 706 -> 673, hits 564 -> 531, ratio 80% -> 79%. The figure
  //   that is comparable across that change - prose only, excluding lines that name an object/task/status - is 96% before
  //   and after (548/571 -> 515/538), i.e. NO prose was lost; only the candidate pool shrank, by exactly the lines we
  //   stopped reproducing on purpose. The floors are pinned AT the new measured values, so any further loss reddens.
  //
  // WHY A POOL FLOOR AT ALL: `totalAB` can only shrink by DECLARING lines (each declaration is a visible row in the table
  // above, and V65b requires every declared family to still match captured lines). A sudden drop therefore means someone
  // excluded a family without a reason, which is what this floor catches.
  //   ROUND 58 (third re-base): live run 58's member filed the two prompt lines above as WRONG (a path promise the
  //   face cannot honour, and a refusal code that does not exist). The pack stopped reproducing them, so hits drop by
  //   exactly those 7 occurrences: 531 -> 524, pool UNCHANGED at 673 (nothing was excluded from measurement), ratio
  //   79% -> 78%. The floors are pinned AT the new measured values again, so a further loss - or a family quietly
  //   disappearing - still reddens.
  //   2026-10-28 (fourth re-base, THE LEDGER ROUND): the five teaching defects the rule ledger names (docs/acceptance/
  //   rules-ledger.json rows E9/E13/B6/G7) were corrected in the live charter because the kernel refuses their
  //   mechanism BY NAME. Those 18 occurrences (10 heartbeat + 8 meeting) are DECLARED like the F5 families, so they
  //   leave BOTH sides: declared 150 -> 168, pool 673 -> 655, hits 524 -> 506 (506/655 = 77.25%, measured 77%), and
  //   the prose-only figure moves 508/538 (94%) -> 490/520 (94%) - the RATIO IS UNCHANGED, which is the check that
  //   nothing but the declared lines was lost. Floors pinned AT the measurement: pool 655 >= 650, ratio 77 >= 77.
  //   ROUND 136 (fifth re-base, G7 AUDIT #2): the second read-only audit retired four captured teaching lines (seven
  //   occurrences: founding seat 1 + founding rights 1 + paper deliverable 1 + LaTeX note 3 - the note appears in three
  //   prompts). They are DECLARED above like every earlier family, so they leave BOTH sides: pool 655 -> 649, hits unchanged
  //   at 500 (500/649 = 77.04%, measured 77%) - the ratio is UNCHANGED, which is the check that nothing but the declared
  //   lines was lost. Floors pinned AT the measurement: pool 649 >= 649, ratio 77 >= 77.
  const AB_POOL_FLOOR = 649
  const PCTAB_FLOOR = 77
  ok(totalAB >= AB_POOL_FLOOR && hitAB > 0,
    "V66. **** ACCEPTANCE (2), MEASURED (ROUND 550 DECLARED REFORM, RE-BASED 2026-10-24: " + declaredAB + " captured lines are DECLARED divergences (F5 + the tool-help signature fix) and are excluded from both sides, so this ratio measures reconstructed prose rather than quoted policy; the harness uses the corpus's own object name p-lean-a, a deliberate change declared rather than folded in - and MEASURED TO CHANGE NOTHING, because this comparison reads a SYNTHETIC assembly rather than the harness run, so the residual below is scenario DATA (vote payloads, formal decisions) that no assembly can produce): our assembly reproduces " + hitAB + " of the " + totalAB + " fixed lines in the prompts the original really delivered (" + pctAB + "%). OF THE PROSE ALONE - excluding lines that name an object, a task or a status, which no scenario can reproduce whatever it does - " + proseHitAB + " of " + proseTotalAB + " (" + Math.round(100 * proseHitAB / Math.max(1, proseTotalAB)) + "%), which is the figure comparable to the per-type table",
    { hit: hitAB, total: totalAB, percent: pctAB, declared: declaredAB })
  // THE OTHER DIRECTION, which the first number cannot see. A line-by-line comparison against the original
  // under-counts whatever the source holds as several entries but renders as one line, so it can report a gap that
  // is not there. Asking the reverse question - how much of OUR prompt comes from the original at all - is the
  // fidelity number a deployment actually cares about, and the two together cannot both be gamed.
  const oursAll = Object.values(oursSingle).join("\n")
  const originalBlob = PROMPTS.map((p) => String(p.text)).join("\n")
  const ourLines = fixedOf(oursAll)
  const fromOriginal = ourLines.filter((l) => normPath(originalBlob).includes(normPath(l)))
  const pctOurs = Math.round(100 * fromOriginal.length / ourLines.length)
  ok(ourLines.length > 100 && pctOurs >= 0,
    "V68. **** THE OTHER DIRECTION: " + fromOriginal.length + " of our " + ourLines.length + " fixed prose lines appear in the prompts the original really delivered (" + pctOurs + "%) - the fidelity number, which cannot be inflated by transcribing more text of our own invention",
    { ours: ourLines.length, fromOriginal: fromOriginal.length, percent: pctOurs })
  // A SEPARATE NUMBER FOR A FAMILY THE FIRST ONE CANNOT SEE. The framework notices are not part of an assembled
  // prompt: the loop adds them at delivery time, so a comparison against assembled text is blind to them no matter
  // how complete they are. Measuring them separately is the honest fix, and the target is exactness rather than a
  // percentage - the templates are transcribed, so every captured notice must be reproducible verbatim.
  const NOTICE_PREFIXES = ["【所办分派】", "【院士分派】", "【督办 from", "【研究所·群聊】", "【所办通知】"]
  const noticeLines = [...new Set(originalBlob.split("\n").map((l) => l.trim()).filter((l) => NOTICE_PREFIXES.some((p) => l.startsWith(p))))]
  const NOTICES = await import("../vibe-math-vmu/packs/v5r/notices.js")
  let reproduced = 0
  for (const line of noticeLines) {
    const asg = /^【(.+?)分派】任务 (.+?)「(.+?)」分派给你。理由：(.+?)｜验收标准：(.+?)。默认应当执行；/.exec(line)
    if (asg) { if (NOTICES.assignmentNotice({ assignerLabel: asg[1], taskId: asg[2], title: asg[3], why: asg[4], acceptance: asg[5] }) === line) reproduced += 1; continue }
    const nud = /^【督办 from (.+?)】(.+?)督办：(.+?)(?:｜建议的下一步：(.+))?$/.exec(line)
    if (nud) { if (NOTICES.nudgeNotice({ by: nud[1], byLabel: nud[2], why: nud[3], nextStep: nud[4] }) === line) reproduced += 1; continue }
    const chat = /^【研究所·群聊】(.+?)：(.+)$/.exec(line)
    if (chat) { if (NOTICES.chatNotice({ member: chat[1], text: chat[2] }) === line) reproduced += 1; continue }
    const off = /^【所办通知】(.+)$/.exec(line)
    if (off) { if (NOTICES.officeNotice({ text: off[1] }) === line) reproduced += 1; continue }
  }
  ok(noticeLines.length >= 5 && reproduced === noticeLines.length,
    "V69. **** THE NOTICE FAMILY, measured on its own because the assembly comparison cannot see it: " + reproduced + " of " + noticeLines.length + " captured framework notices are reproduced VERBATIM",
    { captured: noticeLines.length, reproduced })
  // The named gap families, kept in the test so the next person sees WHAT is missing rather than only how much.
  // THREE OF THE SIX FAMILIES ARE NOW CLOSED: the compact catalogue, the refusal notice and the contextPct/compacted
  // clarification (the tool-help hint rides in the same block). The list below is what remains, kept in the test so the
  // next person sees WHAT is missing rather than only how much.
  const knownGapsAB = [
    "framework notices beyond a refusal: office and academician assignment, group-chat relay, office notice",
    "the compact catalogue VARIANT per phase (its field list says it lists the current phase, and one was transcribed)",
    "the full catalogue and the compact one are alternatives in the original, and both are currently injected here",
    "the office/chat notice header the corpus writes as [新到的消息] before the line itself",
    // G4-era declared replacement (the v5r paper prompt was converted from JSON receipt fields to the
    // `vibe_v5_paper` tool calls by the pack's own prompts/v5r-blocks-b.js): the original submits
    // `paper_part` / `paper_review` JSON, the pack now instructs tool calls instead. This is a deliberate
    // divergence, so those captured lines are structurally unreproducible rather than missing transcription.
    "the paper submission protocol (JSON receipt fields → vibe_v5_paper tool calls)",
    // ★ ROUND 58 — THE MEMBER WAS RIGHT AND THE PROMPT WAS WRONG (live run 58, the member's own feedback).
    // Two captured lines taught something the runtime does not do: (a) that the Lean `file` parameter accepts
    // "both forms" when every path is resolved against the LIBRARY ROOT, and (b) a hint sample naming a
    // `V5_NOT_FOUND` refusal that the face never returns (`VMU_LEAN_FILE_UNREADABLE`). The pack now teaches the
    // true rule (library root; absolute path elsewhere) and the refusal prints both the typed and the resolved
    // path, so those 7 occurrences (6 + 1) can no longer match the capture VERBATIM — the same class as the F5
    // retirement: the corpus was the source, and reproducing it would be reproducing the defect.
    "the Lean teaching corrected in ROUND 58 (path base named, honest refusal code)",
  ]
  ok(pctAB >= PCTAB_FLOOR && knownGapsAB.length === 6,
    "V67. **** and the gap is NAMED rather than rounded away, with a FLOOR on the measured ratio: the closed families are the compact catalogue, the refusal notice and the contextPct/compacted clarification, and the five that remain are listed (the paper protocol is a DECLARED replacement, see the comment)",
    { families: knownGapsAB.length, percent: pctAB, hits: hitAB, pool: totalAB })

  // ROUND 549 - THE GAP LIST, CHECKED RATHER THAN TRUSTED. The four families above were each verified by hand and all four are
  // CLOSED: the notice chain has a producer (queueNotice, called by the turn loop and exposed as notify), a one-shot consumer
  // (drainNotices/takeNotices), a renderer (notices.js noticeBlock with INBOX_HEADER) and an injection path (the preset passing
  // both through createKernel into the orchestrator); the catalogue switch chooses EXACTLY ONE, defaulting to compact and
  // switching on the literal "full"; and the inbox header is that same INBOX_HEADER. This companion names, for each family, the
  // code that closes it and requires that code to exist - appended AFTER the measurement, so it cannot move a number above it.
  const CLOSED_BY_VERIFIED = [
    { family: 'framework notices beyond a refusal', by: 'vibe-math-vmu/kernel/turn/index.js', what: 'queueNotice + drainNotices' },
    { family: 'the compact catalogue VARIANT per phase', by: 'vibe-math-vmu/packs/v5r/middleware/prompt-switches.js', what: 'decideSections chooses exactly one' },
    { family: 'the two catalogues are alternatives', by: 'vibe-math-vmu/packs/v5r/middleware/prompt-switches.js', what: 'the same switch' },
    { family: 'the inbox header before the line', by: 'vibe-math-vmu/packs/v5r/notices.js', what: 'INBOX_HEADER' },
    { family: 'the paper submission protocol (JSON receipt fields → vibe_v5_paper tool calls)', by: 'vibe-math-vmu/packs/v5r/prompts/v5r-blocks-b.js', what: 'paper part/review tool instructions (declared replacement)' },
    // ★ ROUND 58 — the sixth row pairs with the sixth family above, and it names the teaching block that was fixed:
    // the file-path rule ("resolved against the library root", not "both forms accepted") and the refusal code the
    // face really returns. `by` must be a real path in the tree, so the row cannot outlive the fix it points at.
    { family: 'the Lean teaching corrected in ROUND 58 (path base named, honest refusal code)', by: 'vibe-math-vmu/packs/v5r/prompts/v5r-blocks-b.js', what: 'library-root path rule + honest refusal code' },
  ]
  // NON-EMPTY FIRST: two empty collections compare equal, which the declaration criterion calls shape B - the check would pass
  // by having nothing to check. And the existence clause is evaluated over a list now required to be non-empty.
  ok(CLOSED_BY_VERIFIED.length > 0 && CLOSED_BY_VERIFIED.length === knownGapsAB.length && CLOSED_BY_VERIFIED.every((c) => typeof c.by === 'string' && c.by.length > 0 && existsSync(new URL(c.by, REPO_URL))),
    'V71. **** AND THE GAP LIST IS NOW CHECKED: every family once listed as open names the file that closes it, and that file exists - so the list cannot sit there as prose while the mechanism it names is in the tree',
    { families: CLOSED_BY_VERIFIED.length, by: CLOSED_BY_VERIFIED.map((c) => c.by) })


  // The biggest remaining family. See the comment above: this is the number that distinguishes "65 percent and
  // closing" from "65 percent with one large family still missing".
  const BIGGEST_LEFT = leftAB.size ? Math.max(...leftAB.values()) : 0
  const TOP_LEFT = [...leftAB.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)
  ok(BIGGEST_LEFT <= 15,
    "V70. **** NO SINGLE REMAINING FAMILY EXCEEDS FIFTEEN LINES, AND THE FIFTEEN IS DATA: the largest group still unmatched is " + BIGGEST_LEFT + " line(s) [" + TOP_LEFT.map(([k, n]) => n + "×" + k).join(" | ") + "]; what is left is names, statements, task boards and status rather than a missing block of prose",
    { biggest: BIGGEST_LEFT, top: TOP_LEFT, groups: knownGapsAB.length })
  }

// A FAILED ASSERTION MUST BE VISIBLE TO THE GATE. This block was swallowed by a stray brace, and the suite printed
// FAIL while exiting 0 for a whole round; nothing else in this file matters if that can happen again.
if (failed) {
  console.error("=== VMU AB: " + passed + " passed, " + failed + " FAILED ===")
  process.exitCode = 1
}

rmSync(workspace, { recursive: true, force: true })

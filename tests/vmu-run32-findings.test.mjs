// tests/vmu-run32-findings.test.mjs — the INSTITUTE'S OWN 32nd acceptance report (㉔), pinned.
//
// WHAT IT REPORTED (its own words + receipts, transcript `_oneoff/vm-slv/full-1024-224324.jsonl`):
//   ㉔.1/㉔.2/㉔.3 all PASSED — the atomicity fix works (a refused primitive `open` leaves no record and the SAME id can be
//   retried), the collision hint now leads with its decisive sentence, and the six-item regression band held. Its verdict was
//   「本轮无实质残余：是」 with TWO readability observations it explicitly left to us:
//     (1) `t-1` is one spelling for two tables — `vibe_v5_hire` returns `task.id:"t-1"` (TASK board) while
//         `vibe_vmu_turn {op:"step"}` returns `memberPrompt.turnId:"t-1"` (TURN store), each minting from its own counter,
//         so a reader holding both receipts cannot tell which `t-1` a later call means;
//     (2) `sweep.ran:false` / `swept:0` sit NEXT TO a populated `recentTransitions` — the CLOCK was explained, the COUNT
//         was not, so "swept nothing" and "no pass ran" read the same.
//
// WHAT IS PINNED HERE (each read back from a real receipt):
//   ① the two namespaces really do collide: a freshly hired member's task id and a freshly minted turn id both match
//     /^t-\d+$/ (so the observation was not hypothetical);
//   ② each receipt now NAMES ITS OWN TABLE: `task.idRegistry === 'task-board'` and `memberPrompt.turnIdRegistry ===
//     'turn-store'`, each explanation naming the OTHER table (a label nobody can resolve is not a label);
//   ③ `sweep.sweptMeans` exists and, in the no-pass branch, says the zero is the ABSENCE of a pass; the ran-branch wording
//     is pinned by SOURCE TEXT because reaching it needs a genuinely due meeting, and a hand-built fixture would make the
//     assertion about the fixture rather than the product;
//   ④ the labels are ADDITIVE: the task payload and the assembled prompt text are still there.
//
// WHAT IT DOES NOT PROVE: that an agent reads the labels; nothing about the task board's own lifecycle; and nothing about
// whether the prefixes SHOULD have been distinct at mint time (renaming either would invalidate every stored id — that is a
// migration, not a fix).
//
// RULE E: every collection assertion carries its non-emptiness in the same expression.
import { readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const entry = await import(pathToFileURL(ENTRY).href)
let NOW = 1000

const boot = async (config = {}) => {
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, Object.assign({ clock: () => NOW }, config))
  await handle.ready()
  return { handle, state, specOf: (n) => state.specs.find((s) => s.name === n) }
}
const call = async (b, name, args = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { parsed: undefined, missing: true }
  const raw = await spec.execute(args, {})
  let parsed
  try { parsed = JSON.parse(raw) } catch { parsed = undefined }
  return { parsed, missing: false }
}

const TURN_ID = /^t-\d+$/
const root = await mkdtemp(join('D:/_tmp', 'vmu-run32-'))
try {
  // caller-played delivery: the route the live acceptance uses (`vmu.turn.deliverMode` = caller), so a step returns an
  // AWAITING receipt carrying `memberPrompt` instead of trying to run the member turn in-process.
  const b = await boot({ root, packs: ['v5r'], deliverMode: 'caller' })

  // a chair seat is needed to convene (the action is academician-only); the TASK-bearing receipt comes from the pack's
  // `hire`, which seats TEMP seats only.
  const chair = await call(b, 'vibe_vmu_control', {
    action: 'hire', member_id: 'member-1', slot: 'chair', institution: 'probe-institute',
  })
  ok((chair.parsed || {}).ok === true, 'a chair seat exists (precondition for convening)', chair.parsed)

  // ── ① + ② the hire receipt names the TASK board ────────────────────────────────────────────────────────────────
  const hired = await call(b, 'vibe_v5_hire', {
    to: 'member-2', slot: 'temp', purpose: 'collision probe', initial_task: 'probe the task id',
  })
  const hire = hired.parsed || {}
  ok(hire.ok === true, 'a temp hire succeeds (precondition for the id comparison)', hire)
  const task = hire.task && typeof hire.task === 'object' ? hire.task : null
  ok(task !== null && typeof task.id === 'string' && TURN_ID.test(task.id),
    '① the TASK board mints the t-<n> spelling too (so the collision is real)', task && task.id)
  ok(task !== null && task.idRegistry === 'task-board',
    '② the hire receipt names its table: task.idRegistry === "task-board"', task && task.idRegistry)
  ok(task !== null && typeof task.idMeans === 'string' && /TURN store/.test(task.idMeans),
    '② task.idMeans names the OTHER table too (a label nobody can resolve is not a label)', task && task.idMeans)
  ok(task !== null && typeof task.state === 'string' && task.state.length > 0,
    '④ the label is ADDITIVE: the task payload (id/state) survives', task)

  // ── ③ sweep.sweptMeans, read off the SERVICE registry's status ────────────────────────────────────────────────
  const convened = await call(b, 'vibe_v5_meeting', { member: 'member-1', agenda: 'sweep probe' })
  ok((convened.parsed || {}).ok === true, 'a service meeting is convened (precondition for its status sweep)', convened.parsed)
  const svcList = await call(b, 'vibe_vmu_meeting', { action: 'list' })
  const serviceIds = (((svcList.parsed || {}).serviceMeetings) || []).map((m) => (typeof m === 'string' ? m : m && m.id)).filter(Boolean)
  ok(serviceIds.length > 0, 'the service registry lists the meeting (non-empty)', svcList.parsed)
  const svc = await call(b, 'vibe_vmu_meeting', { action: 'status', id: serviceIds[0] })
  const svcStatus = svc.parsed || {}
  const sweep = svcStatus.sweep && typeof svcStatus.sweep === 'object' ? svcStatus.sweep : null
  ok(sweep !== null, 'the service status carries a sweep reading', Object.keys(svcStatus).slice(0, 8))
  ok(sweep !== null && sweep.ran === false, 'fresh process: no pass has run yet (precondition)', sweep && sweep.ran)
  ok(sweep !== null && typeof sweep.sweptMeans === 'string' && /ABSENCE of a pass/.test(sweep.sweptMeans),
    '② the zero COUNT is named as an absence, not as "found nothing due"', sweep && sweep.sweptMeans)
  ok(sweep !== null && typeof sweep.recentTransitionsNote === 'string',
    '② the CLOCK note is still there (the count note is additive, not a replacement)', sweep && sweep.recentTransitionsNote)

  const KERNEL_MEETINGS = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'meetings.js'), 'utf8')
  ok(/sweptMeans:[\s\S]{0,400}counts only the transitions THIS last pass settled/.test(KERNEL_MEETINGS),
    '② the ran-branch wording exists and scopes `swept` to THIS pass')

  // ── ① + ② the turn receipt names the TURN store ───────────────────────────────────────────────────────────────
  const step = await call(b, 'vibe_vmu_turn', { op: 'step', members: ['member-2'] })
  const stepOut = step.parsed || {}
  ok(stepOut.ok === true && stepOut.awaiting === true,
    'a step against a hired member returns an awaiting prompt',
    stepOut.ok === true ? { awaiting: stepOut.awaiting } : stepOut)
  const p = stepOut.memberPrompt && typeof stepOut.memberPrompt === 'object' ? stepOut.memberPrompt : null
  ok(p !== null && typeof p.turnId === 'string' && TURN_ID.test(p.turnId),
    '① the TURN store mints the same t-<n> spelling', p && p.turnId)
  ok(p !== null && p.turnIdRegistry === 'turn-store',
    '② the turn receipt names its table: memberPrompt.turnIdRegistry === "turn-store"', p && p.turnIdRegistry)
  ok(p !== null && typeof p.turnIdMeans === 'string' && /TASK board/.test(p.turnIdMeans),
    '② turnIdMeans names the OTHER table (the two labels resolve each other)', p && p.turnIdMeans)
  ok(p !== null && typeof p.text === 'string' && p.text.length > 1000,
    '④ the label is ADDITIVE on the prompt: the assembled text is still there', p && (p.text ? p.text.length : p.text))

  ok(task !== null && p !== null && task.idRegistry !== p.turnIdRegistry,
    'the two receipts give the same spelling two DIFFERENT registry names',
    task && p ? [task.id, task.idRegistry, p.turnId, p.turnIdRegistry] : null)
} finally {
  // the store writes asynchronously, so a bare `rm` can lose the race against its own io (ENOTEMPTY) — retry, never skip.
  await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
}

console.log('\n=== VMU RUN32 FINDINGS: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) console.error(failures.join('\n'))
process.exit(failed ? 1 : 0)

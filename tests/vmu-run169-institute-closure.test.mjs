// tests/vmu-run169-institute-closure.test.mjs — RUN 169 (real machine, run 15 / FEEDBACK15 F15-3):
// ONE INSTITUTE, ONE CLOSURE TALLY.
//
// THE DEFECT THIS PINS (measured on the real machine, run 15, build 248ffb59 — the first run that woke all four members):
//   · `r-acad` voted through `vibe_vmu_vote` INSIDE ITS OWN child session. Its receipt read `votesCast:1`. At the same
//     moment the office kernel read `votesCast:2, missing:["r-acad"]` — the same institute, two honest, incompatible
//     tallies, and the member HAD voted. Each member turn runs in its own kernel, and the vote Map belongs to that
//     kernel's orchestrator, so a judgement could not cross sessions at all.
//   · the agent also read `solvedThisRound: {"r-temp": false}` and could not tell whether that seat's judgement counted
//     (a temp seat holds no closure-vote permission — it never counted, and nothing said so).
// FIX: every recorded vote — from the reply field AND from `vibe_vmu_vote` — is written to the durable fold key
// `closure_votes` through ONE seam, and every closure reading merges that fold under its own session's fresher map.
// A judgement recorded outside the electorate is named in `notEligible` instead of being silently dropped.
//
// RULE E: every collection assertion states its non-emptiness (or exact shape) in the same expression.
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

import { tmpRoot as __tmpRoot } from './_lib/scratch.mjs'
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
const J = (o) => JSON.stringify(o)

const entry = await import(pathToFileURL(ENTRY).href)
const BASE = __tmpRoot() + '/r169/closures'
const roots = []
const newRoot = async (tag) => { await mkdir(BASE, { recursive: true }); const r = await mkdtemp(join(BASE, tag + '-')); roots.push(r); return r }
let tick = 1000
const boot = async (root) => {
  const specs = []
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, { root, packs: ['v5r'], clock: () => tick })
  await handle.ready()
  const specOf = (name) => specs.filter((s) => s.name === name)[0]
  const call = async (name, args) => {
    const spec = specOf(name)
    if (!spec) throw new Error('no tool ' + name)
    try { return JSON.parse(await spec.execute(args, {})) } catch (e) { return { ok: false, code: (e && e.code) || 'THROW', message: String((e && e.message) || e) } }
  }
  return { handle, kernel: handle.kernel, call }
}
const until = async (fn, ms = 5000) => {
  const t0 = Date.now()
  for (;;) {
    let v = null
    try { v = fn() } catch { v = null }
    if (v) return v
    if (Date.now() - t0 > ms) return null
    await new Promise((r) => setTimeout(r, 20))
  }
}
const SEATS = [['r-acad', 'chair'], ['r-1', 'member'], ['r-2', 'member'], ['r-temp', 'temp']]

// ── §0 the source says what this pins (a behavioural test alone could pass by coincidence) ───────────────────────────
{
  const store = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'store.js'), 'utf8')
  const index = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'index.js'), 'utf8')
  const turn = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'turn', 'index.js'), 'utf8')
  const vote = readFileSync(join(REPO, 'vibe-math-vmu', 'tools', 'vote.js'), 'utf8')
  // RUN 172 adds `closure_window` right after it (the closure tally's window number), so allow it before the bracket.
  ok(/  'closure_votes',\n/.test(store),
    '§0 the durable folder DECLARES `closure_votes` (an undeclared key would be refused by name, i.e. the whole fix a no-op)')
  // RUN 170 (FEEDBACK16 F16-2) widened the seam's argument with `voterSession` (where the VOTER ran, not where the row
  // was written), so the pin names the writer's body rather than a frozen parameter list.
  ok(new RegExp('const persistClosureVote = \\(\\{ member, solved').test(index) && /recordsStore\.patch\(CLOSURE_VOTES_FOLD/.test(index),
    '§0 the kernel owns ONE writer for that key, patched by member (last-wins, bounded)')
  ok(/persistClosureVote: \(recordsStore && typeof recordsStore\.patch === 'function'\) \? persistClosureVote : null,/.test(index),
    '§0 the seam is handed to the loop ONLY when it can persist (capability is decided once at assembly, not re-discovered per vote)')
  ok(/persistClosureVote = null \} = \{\}\) \{/.test(turn) && /if \(typeof persistClosureVote === 'function'\) \{/.test(turn),
    '§0 the loop calls that seam for EVERY recorded vote, from BOTH channels')
  ok(/const durable = typeof persistClosureVote === 'function'/.test(turn) && /durableMeans: 'this assembly has no durable store/.test(turn),
    '§0 a vote that could not reach the fold says so in ITS OWN effect (durable:false), not as a second "refused" row')
  ok(/const closureVotesMerged = \(\) => \{/.test(index) && /votes: closureVotesMerged\(\),/.test(index),
    '§0 every closure reading merges the fold under this session\'s fresher map')
  ok(/notEligible: \(\(\) => \{/.test(turn) && /notEligibleMeans:/.test(turn),
    '§0 a judgement from outside the electorate is NAMED, not silently dropped')
  ok(/solvedThisRoundMeans:/.test(turn),
    '§0 `solvedThisRound` says what it is (raw readings, including non-voting seats) and which field is the counted tally')
  ok(/closure_votes/.test(vote),
    '§0 the vote tool description names the shared ledger the caller can rely on')
}

// ── §1 ★ the defect: a vote cast in ONE kernel is read by ANOTHER ────────────────────────────────────────────────────
{
  const root = await newRoot('cross')
  const A = await boot(root)
  for (const [id, slot] of SEATS) await A.kernel.members.hire({ id, slot, institution: 'sim' })
  const B = await boot(root)
  ok(A.kernel.members.roster().length === 4 && B.kernel.members.roster().length === 4,
    '§1 fixture: both kernels read the SAME durable roster', { a: A.kernel.members.roster().length, b: B.kernel.members.roster().length })
  // the member's own session votes through the tool (this is exactly what run 15 did)
  const vote = await A.call('vibe_vmu_vote', { member: 'r-1', solved: false, why: 'run169 §1' })
  ok(vote.ok === true && vote.persistedToFold === true && vote.crossKernelScope === 'shared-fold',
    '§1 the tool receipt says the vote LEFT this process (persistedToFold + crossKernelScope)', vote)
  const seen = await until(() => { const v = B.kernel.closureVoteView(); return v.votesCast >= 1 ? v : null })
  ok(seen !== null && seen.votesCast === 1 && J(seen.against) === J(['r-1']) && seen.missing.length === 2,
    '§1 the OTHER kernel reads the same judgement (before RUN 169 it read votesCast:0, missing:["r-1"])',
    seen && { votesCast: seen.votesCast, for: seen.for, against: seen.against, missing: seen.missing })
  // the reply channel must travel the SAME road (one ledger, two input channels — the rule the writer documents)
  const applied = await A.kernel.turn.apply({ vote_solved: true }, null, 'r-acad')
  const seen2 = await until(() => { const v = B.kernel.closureVoteView(); return v.votesCast >= 2 ? v : null })
  ok(applied.ok === true && seen2 !== null && seen2.votesCast === 2 && J(seen2.for) === J(['r-acad']) && J(seen2.against) === J(['r-1']),
    '§1 a vote recorded through the REPLY field is institute-wide too (both channels write the same fold key)',
    seen2 && { votesCast: seen2.votesCast, for: seen2.for, against: seen2.against })
  const view = B.kernel.closureVoteView()
  ok(view.cast === false && view.confirmed === false && J(view.missing) === J(['r-2']),
    '§1 disagreement is still disagreement: one against keeps `cast` false, and only the member with NO judgement is missing',
    { cast: view.cast, missing: view.missing })
  // re-vote r-1 `true`: the tally composes across kernels into unanimity (latest-wins per member)
  again: {
    const revote = await A.call('vibe_vmu_vote', { member: 'r-1', solved: true, why: 'run169 §1 unanimity' })
    const r2 = await A.call('vibe_vmu_vote', { member: 'r-2', solved: true, why: 'run169 §1 unanimity' })
    const unanimous = await until(() => { const v = B.kernel.closureVoteView(); return v.cast === true ? v : null })
    ok(revote.ok === true && r2.ok === true && unanimous !== null && unanimous.confirmed === true &&
      unanimous.votesCast === 3 && unanimous.missing.length === 0 && J(unanimous.against) === J([]),
      '§1 unanimity composes from judgements made in DIFFERENT kernels (3 for, 0 against, 0 missing)',
      unanimous && { votesCast: unanimous.votesCast, for: unanimous.for, missing: unanimous.missing })
    break again
  }
  ok(JSON.stringify(B.kernel.closureVoteView()).length < 1500,
    '§1 the reading still fits its documented size pin (docs/17: detail:"closure" < 1500)',
    { chars: JSON.stringify(B.kernel.closureVoteView()).length })
}

// ── §2 ★ a judgement from OUTSIDE the electorate is named, and never counted ────────────────────────────────────────
{
  const root = await newRoot('eligible')
  const A = await boot(root)
  for (const [id, slot] of SEATS) await A.kernel.members.hire({ id, slot, institution: 'sim' })
  // a temp seat holds `speak` only, so the TOOL refuses it by name (the gate RUN 26 added)…
  const tempVote = await A.call('vibe_vmu_vote', { member: 'r-temp', solved: true })
  ok(tempVote.ok === false && tempVote.code === 'VMU_NOT_PERMITTED',
    '§2 the vote TOOL still refuses a seat with no closure-vote permission (this round did not loosen a gate)', tempVote)
  // …but the reply field is recorded without a permission gate, so such a reading CAN exist; it must be visible and unused.
  const applied = await A.kernel.turn.apply({ vote_solved: true }, null, 'r-temp')
  const view = A.kernel.closureVoteView()
  // ★ TB-2724 / RUN 77 (C) moved this shape: `notEligible` is no longer a bare id list — each row now carries the
  // judgement it recorded and why it does not count (`{member, solved, why}`), because the 77th run showed a bare id
  // next to a Means sentence promising "recorded". The old world (`J(view.notEligible) === J(['r-temp'])`) is why the
  // promise and the value could disagree; the assertions below are the same claims, one field deeper.
  ok(applied.ok === true && Array.isArray(view.notEligible) && view.notEligible.length === 1
    && view.notEligible[0].member === 'r-temp' && view.notEligible[0].solved === true
    && view.notEligible[0].why === 'no-closure-vote-permission' && view.votesCast === 0 && J(view.for) === J([]),
    '§2 a judgement from a member outside the electorate appears in `notEligible` WITH its value and why, is NOT counted, and is NOT called missing',
    { notEligible: view.notEligible, votesCast: view.votesCast, for: view.for, missing: view.missing })
  ok(/neither counted nor listed as missing/.test(view.notEligibleMeans),
    '§2 and the field says exactly that in words', view.notEligibleMeans)
  const status = A.kernel.turn.status()
  ok(/INCLUDING seats that hold no closure-vote permission/.test(status.solvedThisRoundMeans) &&
    /closureVote` is the counted tally/.test(status.solvedThisRoundMeans),
    '§2 `solvedThisRound` names which seats it may contain and points at the counted tally', status.solvedThisRoundMeans)
}

// ── §3 the honest negative: with NO durable store the vote cannot leave the process, and the receipt says so ─────────
{
  // a kernel assembled without a store (no root) has no fold to write: the seam must refuse BY NAME, and the writer
  // reports that failure as a row instead of pretending the vote was shared.
  const contexts = []
  for (const r of roots) contexts.push(r)
  ok(contexts.length >= 2, '§3 fixture: the two kernels above really had separate roots', { roots: contexts.length })
  const store = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'index.js'), 'utf8')
  ok(/no durable store, so a closure vote cannot leave this process/.test(store),
    '§3 the no-store path refuses by name rather than writing to nothing')
  ok(/kind: 'closure-vote-persist-refused'/.test(readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'turn', 'index.js'), 'utf8')),
    '§3 and the loop reports that refusal as a receipt row (a persisted-ledger failure is visible to the caller)')
}

// ── §4 ★★ F15-6: the refusal CODE says which fact it is (a finished child session is not a missing object) ───────────
{
  // run 15 read `vibe_v5_tool_help` on a member whose child session had FINISHED and got
  //   {code:"VMU_NO_SUCH_OBJECT", message:"member \"r-temp\" has a learned child session (child-…) but no LIVE Agent"}
  // — a code that contradicts the sentence beside it (the session is named, so the object is not missing).
  const hostSrc = readFileSync(join(REPO, 'vibe-math-vmu', 'host.js'), 'utf8')
  ok(hostSrc.includes("code: cause === 'child-session-not-live' ? 'VMU_MEMBER_SESSION_NOT_LIVE' : 'VMU_NO_SUCH_OBJECT'"),
    '§4 the provider separates the two causes by CODE, not only by sentence')
  const kernelSrc = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'index.js'), 'utf8')
  ok(/cause !== 'VMU_NO_SUCH_OBJECT' && cause !== 'VMU_MEMBER_SESSION_NOT_LIVE'/.test(kernelSrc),
    '§4 and the kernel accepts BOTH honest codes when it degrades the reading instead of throwing (the new code is not a dead end)')

  const root = await newRoot('notlive')
  const A = await boot(root)
  for (const [id, slot] of SEATS) await A.kernel.members.hire({ id, slot, institution: 'sim' })
  // the two causes, as the host provider throws them (host.js memberWireRefusal):
  A.kernel.turn.setVisibleToolsProvider((member) => {
    const e = new Error('member "' + member + '" has a learned child session (child-77) but no LIVE Agent: activation delivery starts a child per turn and a finished child is not queryable')
    e.code = 'VMU_MEMBER_SESSION_NOT_LIVE'
    e.hint = 'the calls that child made are in the CHILD SESSION LOG (child-77)'
    e.cause = 'child-session-not-live'
    e.learnedSession = 'child-77'
    e.childId = 'child-77'
    throw e
  })
  const view = A.kernel.toolsView({ member: 'r-1' })
  ok(view.ok === true && view.source === 'no-live-agent' && view.tools === null && view.refusal &&
    view.refusal.code === 'VMU_MEMBER_SESSION_NOT_LIVE' && view.cause === 'child-session-not-live' && view.childId === 'child-77',
    '§4 ★★ a finished child session now reads as a READABLE receipt whose code names the fact (seat exists, Agent not live), and still names the child session',
    { ok: view.ok, source: view.source, code: view.refusal && view.refusal.code, cause: view.cause, childId: view.childId })
  ok(typeof view.note === 'string' && /child session log/i.test(view.note),
    '§4 and the note still points at where that turn really is (the child session log), not at "the member never ran"', view.note)
  // ★ the FORWARDER the run-15 agent called: it must pass the honest code through untouched.
  const help = await A.call('vibe_v5_tool_help', { member: 'r-1' })
  ok(help && help.ok === true && help.tool === 'vibe_v5_tool_help' && help.refusal &&
    help.refusal.code === 'VMU_MEMBER_SESSION_NOT_LIVE' && help.tools === null,
    '§4 ★★★ `vibe_v5_tool_help` propagates the honest code verbatim (run 15 got VMU_NO_SUCH_OBJECT here)', { help })
  // ★ the OTHER cause keeps the old code: nothing was ever learned, so the object really is absent.
  A.kernel.turn.setVisibleToolsProvider((member) => {
    const e = new Error('no child session has been learned for member "' + member + '" yet, so there is no live Agent to read')
    e.code = 'VMU_NO_SUCH_OBJECT'
    e.hint = 'deliver one turn first so the child session id is learned'
    e.cause = 'no-child-session-yet'
    throw e
  })
  const never = A.kernel.toolsView({ member: 'r-1' })
  ok(never.ok === true && never.refusal && never.refusal.code === 'VMU_NO_SUCH_OBJECT' && never.cause === 'no-child-session-yet' && never.childId === null,
    '§4 a member that never ran keeps VMU_NO_SUCH_OBJECT — the two causes are not merged into one code again',
    { code: never.refusal && never.refusal.code, cause: never.cause, childId: never.childId })
}

for (const r of roots) await rm(r, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
console.log(`\n=== RUN169 OK: ${passed} passed, ${failed} failed ===`)
if (failed > 0) { console.error('FAILURES:\n- ' + failures.join('\n- ')); process.exit(1) }

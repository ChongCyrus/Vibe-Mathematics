// ★ RUN 183 — the run's twenty-ninth reading (run 29 / FEEDBACK29): a refusal that walks the reader into the wall behind
// it, a batch that wakes one member and says nothing about the other, and two receipts that answer a question nobody
// asked.
//   D10 THE HINT WAS DEAD CODE. `speak` refuses a declared NON-ATTENDING seat with "attend() first" — while `attend`
//       refuses exactly that seat. RUN 182 added the honest hint, but it looked the seat up with `K.roster()`, and the
//       meetings kernel has no `roster` member (every other site asks `members.roster()`): the try/catch swallowed the
//       TypeError and the old hint stayed. Measured in run 29: the machine followed "attend() first" and was refused.
//   D2  A BATCH THAT SAID NOTHING. `drive { members: ["r-1","r-2"], rounds: 1 }` returned ONE receipt. "one round = one
//       member" was only in the policy; the reader took `rounds:1` as "each member once", so a two-member batch woke one
//       member and the meeting closed with `turns:0`. The batch now states requested / advanced / notAdvanced.
//   D1  THE REFUSAL NAMED A FIELD BUT NOT AN ACTOR. The debate-subject gate refused a card with no registered proof and
//       said "register the proof" — with nobody awake, the office wrote the member's proof file itself. The refusal now
//       names the actor (wake the author) and says the office is not that actor.
//   D3  TWO HINTS IN A CLOSED LOOP: `op:"reply"` says "use op:'step' with reply", and that says "this seam does not
//       accept a caller-supplied reply". Both now say the reachable thing: put the ask in `next_step`.
//   D9  `complete:true` beside `pdf:null` read as "complete, no PDF". `completeMeans` says what `complete` counts.
//   D12 "you already filed a DIFFERENT ruling … this one (1)" beside "verdict 1" — the difference was the REASON. The
//       refusal now says which part differs and carries both values.
// §0 is the source-side reading; §1–§4 are answered by this entry.

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')
const MEETINGS = join(REPO, 'vibe-math-vmu', 'kernel', 'meetings.js')
const TURN = join(REPO, 'vibe-math-vmu', 'kernel', 'turn', 'index.js')
const GATES = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'verification-gates.js')
const TOOLS = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js')

let passed = 0
let failed = 0
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const entry = await import(pathToFileURL(ENTRY).href)
const meetingsSource = await readFile(MEETINGS, 'utf8')
const turnSource = await readFile(TURN, 'utf8')
const gatesSource = await readFile(GATES, 'utf8')
const toolsSource = await readFile(TOOLS, 'utf8')

const roots = []
const mkRoot = async () => { const d = await mkdtemp(join(tmpdir(), 'vmu-r183-')); roots.push(d); return d }

const boot = async (root, settings = {}) => {
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, Object.assign({ clock: () => 1000, packs: ['v5r'], root }, settings))
  await handle.ready()
  await handle.kernel.store.open()
  return { handle, K: handle.kernel, specOf: (n) => state.specs.find((s) => s.name === n) }
}

const call = async (b, name, args, exec = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { missing: true }
  let raw
  try { raw = await spec.execute(args, exec) } catch (e) {
    return { thrown: true, code: e && e.code, message: e && e.message, hint: e && e.hint }
  }
  try { return { parsed: JSON.parse(raw) } } catch { return { raw } }
}

try {
  // ── §0 THE SOURCE-SIDE READING ──
  {
    console.log('§0 each repair is a named shape in the source (a pass cannot come from a coincidence)')
    ok(meetingsSource.includes('const rosterRows = (members && typeof members.roster === \'function\') ? (members.roster() || []) : []')
      && meetingsSource.includes('const row = rosterRows.filter((x) => x && String(x.id) === String(member))[0] || null'),
      '§0a the non-attending-seat hint asks the MEMBERS service for the roster (K.roster() does not exist)')
    ok(meetingsSource.includes('the reachable channel is the CHAT face') && meetingsSource.includes('does NOT enter the minutes'),
      '§0b a non-attending seat is told the channel that exists and what it does not get')
    ok(turnSource.includes('const driveScope = (rs) => {') && turnSource.includes('const withScope = (r) => Object.assign({}, r, { scope: driveScope(r.receipts || []) })'),
      '§0c a batch states its own coverage')
    ok(turnSource.includes('notAdvanced names each requested member that was NOT woken by THIS call'),
      '§0d the coverage says why a requested member was not woken')
    ok(gatesSource.includes('REACHABLE INSTEAD (the actor matters)') && gatesSource.includes('reachable: { op: \'drive\', tool: \'vibe_vmu_turn\''),
      '§0e the proof gate names the actor, not only the field')
    ok(turnSource.includes('put the ask in `next_step` (a string) and let the member answer from its OWN turn')
      && turnSource.includes('The fenced-json compatibility path is NOT reachable on this seam either'),
      '§0f the two reply hints no longer point at each other')
    ok(toolsSource.includes('const alreadyFiledMeans = (sameVerdict, proposition, filed, incoming) =>'),
      '§0g a re-worded ruling is not reported as a DIFFERENT conclusion')
    ok(toolsSource.includes('completeMeans: \'complete means the four artifacts'),
      '§0h `complete` says what it counts')
  }

  // ── §1 D10: the TEMP seat is told the chat face ──
  {
    console.log('§1 a seat that cannot attend is told where its words CAN go')
    const b = await boot(await mkRoot())
    await b.K.members.hire({ id: 'r-acad', slot: 'chair', institution: 'VibeMath' })
    await b.K.members.hire({ id: 'r-1', slot: 'member', institution: 'VibeMath' })
    await b.K.members.hire({ id: 'r-temp', slot: 'temp', institution: 'VibeMath' })
    const opened = b.K.meetings.open({ type: 'ordinary', member: 'r-acad', reason: 'run-183 §1' })
    const meetingId = opened && opened.meeting
    ok(typeof meetingId === 'string' && meetingId !== '', '§1a a meeting opens for the probe', opened)
    let refused = null
    try { b.K.meetings.speak({ meeting: meetingId, member: 'r-temp', text: 'hello' }) } catch (e) { refused = e }
    ok(refused && refused.code === 'VMU_NOT_MEMBER', '§1b the temp seat is refused by name', refused && refused.code)
    ok(refused && String(refused.hint || '').includes('CHAT face'),
      '§1c the hint names the chat face (the LIVE RUN 183 repair: this hint was dead code)', refused && refused.hint)
    ok(refused && String(refused.hint || '').includes('does NOT enter the minutes'),
      '§1d the hint also says what the chat face does not get')
    ok(refused && !String(refused.hint || '').includes('attend() first'),
      '§1e the hint no longer walks the reader into attend(), which refuses this very seat')
  }

  // ── §2 D2: a batch states what it did NOT do ──
  {
    console.log('§2 `rounds:1` on two members is one turn, and the receipt says so')
    const b = await boot(await mkRoot())
    await b.K.members.hire({ id: 'r-1', slot: 'member', institution: 'VibeMath' })
    await b.K.members.hire({ id: 'r-2', slot: 'member', institution: 'VibeMath' })
    const drove = await b.K.turn.drive({ members: ['r-1', 'r-2'], rounds: 1 }).catch((e) => ({ thrown: true, code: e && e.code, message: e && e.message }))
    const scope = drove && drove.scope
    ok(scope && Array.isArray(scope.requested) && scope.requested.length === 2, '§2a the batch states what was requested', scope)
    ok(scope && Array.isArray(scope.advanced), '§2b and what actually advanced', scope)
    ok(scope && Array.isArray(scope.notAdvanced) && scope.notAdvanced.length === 2 - scope.advanced.length,
      '§2c and NAMES every requested member it did not wake', scope)
    const named = scope && scope.notAdvanced && scope.notAdvanced.every((r) => r && typeof r.member === 'string' && typeof r.reason === 'string' && r.reason.length > 20)
    ok(named === true, '§2d each un-woken member carries its own reason')
    ok(scope && scope.roundsRequested === 1 && String(scope.means || '').includes('rounds >= members.length'),
      '§2e the receipt says how many rounds it would take to wake everyone')
  }

  // ── §3 D9: `complete` is not "a PDF exists" ──
  {
    console.log('§3 the paper status says what `complete` counts')
    const b = await boot(await mkRoot())
    await b.K.members.hire({ id: 'r-1', slot: 'member', institution: 'VibeMath' })
    await b.K.members.hire({ id: 'r-2', slot: 'member', institution: 'VibeMath' })
    await b.K.members.hire({ id: 'r-acad', slot: 'chair', institution: 'VibeMath' })
    const started = await call(b, 'vibe_v5_paper', { action: 'start', target: 'r183', participants: ['r-1', 'r-2'], title: 'named shape' })
    ok(started.parsed && started.parsed.ok === true, '§3a a paper starts', started.parsed || started)
    const status = await call(b, 'vibe_v5_paper', { action: 'status', target: 'r183' })
    const view = status.parsed || null
    ok(view && typeof view.completeMeans === 'string' && view.completeMeans.includes('does NOT mean a PDF file was compiled'),
      '§3b `complete` disclaims the PDF question by name', view && view.completeMeans)
    ok(view && Array.isArray(view.missing) && view.missing.includes('pdf'),
      '§3c a write-stage paper still names the missing artifacts', view && view.missing)
  }

  // ── §4 D12: same number, different reason is not a different conclusion ──
  {
    console.log('§4 the "already filed" refusal says WHICH part differs')
    ok(toolsSource.includes('with the SAME verdict (') && toolsSource.includes('and a DIFFERENT reason'),
      '§4a the same-verdict branch says the REASON differs')
    ok(toolsSource.includes('{ existing: { verdict: mine[0].verdict === undefined ? null : mine[0].verdict') && toolsSource.includes('sameVerdict })'),
      '§4b the refusal carries both numbers and the sameVerdict flag')
  }
} finally {
  for (const r of roots) { try { await rm(r, { recursive: true, force: true }) } catch { /* best effort */ } }
}

console.log('')
console.log(passed + ' passed, ' + failed + ' failed')
if (failed > 0) process.exitCode = 1

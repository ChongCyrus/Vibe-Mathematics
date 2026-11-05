// tests/vmu-run236-verdict-attribution.test.mjs — RUN 236 / M3 (measured on run 60): the verdict receipt called a
// ruling "YOURS" even when the call came from the office, on the same receipt that carried `memberActed:false`.
//
// run 60's FEEDBACK60 §M3: `vibe_v5_verdict { member:"r-2", meeting, proposition_id, verdict:1 }` was typed by the
// OFFICE. The card was correctly filed in r-2's folder and the tally correctly counts it — that half was fine. But the
// receipt said "this is YOUR final ruling … the chair does not write this number for you" while the host envelope on
// the SAME receipt said `memberActed:false, actedForMember:"r-2"`. Two true sentences describing two different events:
// "a card exists in that member's folder" and "that member acted". The fix is not to change the act (the act is
// legitimate — the office may file a relayed ruling); it is to read WHO called and say it, and to keep saying "YOURS"
// only when the caller really is the seat.
//
// What this suite measures:
//   ① the SOURCE says both things (the branch exists, and it is on the caller fact, not on a guess);
//   ② CALLED BY THE OFFICE: the receipt says the call did not come from the seat, names the seat, and does NOT claim
//      "YOUR final ruling" — while the submission itself is still real and durable;
//   ③ CALLED BY THE SEAT ITSELF: the receipt still says "YOUR final ruling", i.e. the honest branch did not turn a
//      normal member call into an apology;
//   ④ the direction card's teaching is on the two seats' prompts (G10/G13/G14: the card is paperwork, not a gate) and
//      the blueprint `read` face forwards the readings `state` already carried (RUN 236 / task-26's gap).
//
// RULE E: every loop/every() is preceded by an explicit NON-EMPTY assertion.
import { mkdtemp, rm } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')
const TOOLS = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js')

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
const faces = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'seat-faces.js')).href)
const SRC = readFileSync(TOOLS, 'utf8')

const boot = async (config = {}) => {
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, Object.assign({ clock: () => 1000 }, config))
  await handle.ready()
  return { handle, state, names: state.specs.map((s) => s.name), specOf: (n) => state.specs.find((s) => s.name === n) }
}
const receipt = async (b, name, args = {}, exec = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { raw: undefined, parsed: undefined, missing: true }
  const raw = await spec.execute(args, exec)
  let parsed
  try { parsed = JSON.parse(raw) } catch { parsed = undefined }
  return { raw, parsed, missing: false }
}

console.log('=== 0. SOURCE: the branch exists and it reads the CALLER ===')
ok(/const callerOfRuling = callerFromTurn\(kernel, exec\)/.test(SRC),
  '★ source: the ruling receipt computes the caller (a fact about THIS call), not the member argument')
ok(/const rulingBySeat = callerOfRuling !== null && String\(callerOfRuling\) === String\(member\)/.test(SRC),
  '★ source: "the seat did it" means the caller IS the seat — null (office/root) is not the seat')
ok(/did NOT come from that seat/.test(SRC), 'source: the office path has its own sentence (not a reuse of "YOURS")')
ok(/who typed it is not who decided it/.test(SRC),
  'source: the office path says the distinction that matters (the card is real; the actor is not the seat)')
ok(/this is YOUR final ruling/.test(SRC), 'source: the seat path KEEPS the direct sentence (the fix is a branch, not a hedge)')
ok(/the folder is the SEAT/.test(SRC), 'source: the note about Members/<id>/Propos/ also stops calling the folder the caller\'s')

console.log('=== 0b. SOURCE: RUN 236 / task-26 read-face readings and the direction teaching ===')
const READ_FIELDS = ['outline', 'outlineCount', 'outlineDepthMax', 'outlineSource', 'outlineRequired',
  'outlineRequiredSource', 'outlineMeans', 'outlineRequiredMeans', 'revisionReason', 'revisionReasonSource', 'revisionReasonMeans']
ok(READ_FIELDS.length === 11, 'precondition: eleven readings are the set under test', READ_FIELDS.length)
ok(READ_FIELDS.every((f) => new RegExp(f + ': read\\.' + f + ' === undefined \\? null : read\\.' + f).test(SRC)),
  '★ source: every reading the `state` face spreads is also forwarded by the `read` face (eleven, by name)',
  READ_FIELDS.filter((f) => !new RegExp(f + ': read\\.' + f + ' === undefined \\? null : read\\.' + f).test(SRC)))
const chairBullets = faces.seatBulletLines('chair')
const memberBullets = faces.seatBulletLines('member')
ok(Array.isArray(chairBullets) && chairBullets.length > 0 && Array.isArray(memberBullets) && memberBullets.length > 0,
  'precondition: both seat prompt line lists are non-empty', { chair: Array.isArray(chairBullets) && chairBullets.length, member: Array.isArray(memberBullets) && memberBullets.length })
ok(chairBullets.some((l) => String(l).includes('vibe_vmu_direction')) && memberBullets.some((l) => String(l).includes('vibe_vmu_direction')),
  '★★ teaching: the chair AND the member are taught the direction card (a face nobody is taught is a face the prompt cannot use)')
ok(chairBullets.some((l) => String(l).includes('vibe_vmu_direction') && /不当闸/.test(String(l))),
  'teaching: the bullet says the card is not a gate (G10/G13/G14 are paperwork, not a score)')
const chairTaught = faces.seatTaughtNames('chair')
ok(chairTaught && Array.isArray(chairTaught.framework) && chairTaught.framework.includes('vibe_vmu_direction'),
  'teaching: it is in the FRAMEWORK list (a kernel face taught as such, not a pack-ACL row the table would call `extra`)', chairTaught && chairTaught.framework.filter((n) => n.includes('direction')))
ok(faces.RULE_INDEX && typeof faces.RULE_INDEX.mainline === 'string' && faces.RULE_INDEX.mainline !== '',
  'source: the mainline has a citable key (the rule document names the section; no invented number)', faces.RULE_INDEX && faces.RULE_INDEX.mainline)

// TEMP ROOT ON D: — scratch files never land on C: (AGENTS.md §6).
const root = await mkdtemp(join('D:/_tmp', 'vmu-run236-m3-'))
try {
  const b = await boot({ root, packs: ['v5r'] })
  const kernel = b.handle.kernel
  await kernel.members.hire({ id: 'r-acad', slot: 'chair' })
  await kernel.members.hire({ id: 'r-1', slot: 'member' })
  await kernel.members.hire({ id: 'r-2', slot: 'member' })
  ok(kernel.members.roster().length === 3, 'precondition: two members and a chair are on the roster', kernel.members.roster().map((m) => m.id))

  // A debate that r-2 took part in — the ruling needs a meeting and a proposition it can be filed against.
  const moot = await receipt(b, 'vibe_v5_meeting', { member: 'r-acad', agenda: ['命题：偶数和为偶数'], title: 'm3 裁决归属' })
  const meeting = moot.parsed && (typeof moot.parsed.meeting === 'string' ? moot.parsed.meeting : moot.parsed.meeting && moot.parsed.meeting.id)
  ok(typeof meeting === 'string' && meeting !== '', 'precondition: a meeting was convened and its id is readable', moot.parsed && Object.keys(moot.parsed))

  console.log('=== 1. CALLED BY THE OFFICE: the seat did not act, and the receipt says so ===')
  const office = await receipt(b, 'vibe_v5_verdict', { member: 'r-2', meeting, proposition_id: 'p-m3', verdict: 1, reason: 'r-2 口头裁决，所办代记' })
  const op = office.parsed || {}
  ok(op.ok === true && op.submission && op.submission.member === 'r-2',
    '★ behavior: the ruling is still FILED in r-2\'s name (the act is legitimate; the sentence was the defect)', op)
  ok(typeof op.means === 'string' && /did NOT come from that seat/.test(op.means),
    '★★ behavior: means says the call did not come from the seat (no longer "YOUR final ruling")', op.means)
  ok(typeof op.means === 'string' && !/this is YOUR final ruling/.test(op.means),
    '★★ behavior: the office path does NOT claim the ruling is the caller\'s own', op.means)
  ok(typeof op.means === 'string' && /the office\/root session/.test(op.means),
    'behavior: it names WHICH non-seat caller it saw (office/root), instead of hinting', op.means)
  ok(typeof op.means === 'string' && /who typed it is not who decided it/.test(op.means),
    'behavior: it states the distinction the reader needs (a durable card ≠ the seat acting)', op.means)
  ok(typeof op.note === 'string' && /SEAT/.test(op.note),
    'behavior: the folder note stops calling Members/<id>/Propos/ the caller\'s own folder', op.note)
  ok(op.memberActed === false && op.actedForMember === 'r-2',
    '★★ behavior: the host envelope agrees — memberActed:false, actedForMember:"r-2" (the two sentences now describe one event)', { memberActed: op.memberActed, actedForMember: op.actedForMember })

  console.log('=== 2. CALLED BY THE SEAT ITSELF: the direct sentence survives ===')
  // A DIFFERENT proposition on purpose: one member has one filed ruling per proposition, and re-filing is a named
  // refusal (VMU_RULING_ALREADY_FILED). Reusing p-m3 here would have measured the idempotency rail, not the sentence.
  const own = await receipt(b, 'vibe_v5_verdict', { member: 'r-2', meeting, proposition_id: 'p-m3-own', verdict: 1, reason: 'r-2 自己的裁决' }, { agent: { id: 'r-2' } })
  const ow = own.parsed || {}
  ok(ow.ok === true, 'precondition: the seat can file its own ruling', ow)
  ok(typeof ow.means === 'string' && /this is YOUR final ruling/.test(ow.means),
    '★ behavior: a call FROM the seat still gets the direct sentence (the branch did not turn a normal call into an apology)', ow.means)
  ok(typeof ow.means === 'string' && !/did NOT come from that seat/.test(ow.means),
    'behavior: and it does not carry the office-only caveat', ow.means)
  ok(ow.memberActed === true || ow.memberActed === undefined,
    '★ behavior: the envelope does not contradict the direct sentence (memberActed true when disclosed)', ow.memberActed)
} finally {
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
}

console.log('')
if (failed > 0) {
  console.log('FAILED: ' + failed + ' / ' + (passed + failed))
  for (const f of failures) console.log('  - ' + f)
  process.exitCode = 1
} else {
  console.log('RUN 236 M3 verdict attribution: ' + passed + ' passed, 0 failed')
}

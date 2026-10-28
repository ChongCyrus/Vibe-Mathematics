// tests/vmu-a7-a8-seat-rights.test.mjs — A7/A8 re-scan (two DECLARED seat-face gaps, one row each):
//
//   A7  「临时工（被院士或常驻研究员雇佣或解雇用于特殊任务）」—— the rule gives the DISMISS power to BOTH seats that
//        hire temp workers. The table had `vibe_v5_fire.allow.member = false`, i.e. the permanent researcher hired a
//        worker it could never dismiss ("雇了却辞不掉" = irreversible hiring). A7 asserts member ⇒ fire, chair ⇒ fire,
//        temp ⇒ still no fire, and that `hire` was NOT changed by this lane.
//   A8  「临时工……无表决权，默认不参与会议」＋「院士、常驻研究员各自的文件」—— a temp worker must not write the
//        institute's research-conclusion libraries. The table already denied method/subproblem/feedback to temp but left
//        proposition / progress / the five lean_* / paper open. A8 asserts all eight are denied to temp, that chair and
//        member keep them, and that the READ faces a temp actually needs (say/inbox/wait/task_get/task_list/task_update/
//        tool_help/read_library) are untouched.
//
// Both claims are pinned on the DERIVED values (`V5R_ROLE_TOOL_NAMES` / `V5R_ROLE_TOOL_DENY` / `V5R_TOOL_FACES`) and on
// `seatDecision`, not on a hand-written second list: the point of seat-faces.js is that the ACL, the manifest deny list and
// the prompt bullets are ONE declaration. The last section re-runs `seatTeachingCatalogue` so a grant without a bullet (or
// a bullet without a grant) is this suite's failure, not a live-run surprise.
//
// NOTE on one row the brief and the table disagreed about: the brief's example said `vibe_v5_feedback` is "still given to
// temp", but the table (A8 前, unchanged here) already had `temp: false` — and the brief's own first sentence lists feedback
// among the three libraries already closed to temp. This lane did NOT open or close it; section ③ pins the unchanged value
// and names the discrepancy so it cannot be silently "fixed" in either direction.
//
// Run: node tests/vmu-a7-a8-seat-rights.test.mjs
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const SEAT_URL = pathToFileURL(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'seat-faces.js')).href
const CORE_URL = pathToFileURL(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'prompts', 'v5r-core.js')).href
const TOOLS_URL = pathToFileURL(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js')).href

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + label); return true }
  failed += 1
  failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const seatMod = await import(SEAT_URL)
const core = await import(CORE_URL)
const { V5R_PACK_TOOLS } = await import(TOOLS_URL)

// the catalogue this pack declares — the SAME argument `prompts/v5r-core.js` hands to the table
const DECLARED = V5R_PACK_TOOLS.map((t) => t && t.name).filter((n) => typeof n === 'string')
const row = (tool) => seatMod.SEAT_TOOL_FACES[tool]
const allow = (seat, tool) => seatMod.seatDecision(seat, tool).allowed
const denyList = (seat) => core.V5R_ROLE_TOOL_DENY[seat]
const nameList = (seat) => core.V5R_ROLE_TOOL_NAMES[seat]

// the eight research-conclusion faces A8 closes to the temp seat (proposition / progress / five lean_* / paper)
const A8_TARGETS = ['vibe_v5_record_proposition', 'vibe_v5_record_progress',
  'vibe_v5_lean_run', 'vibe_v5_lean_job', 'vibe_v5_lean_lib', 'vibe_v5_lean_read', 'vibe_v5_lean_archive',
  'vibe_v5_paper']
// what a temp worker must still be able to do: speak, receive, wait, see/update ITS task, read others' libraries
const TEMP_MUST_KEEP = ['vibe_v5_say', 'vibe_v5_inbox', 'vibe_v5_wait',
  'vibe_v5_task_list', 'vibe_v5_task_get', 'vibe_v5_task_update', 'vibe_v5_tool_help', 'vibe_v5_read_library']

console.log('=== 0. the declaration is still the ONE source (every target has a row, every row is derived) ===')
{
  ok(DECLARED.length > 0 && DECLARED.length === Object.keys(seatMod.SEAT_TOOL_FACES).length,
    'the pack declares one row per tool (no row is missing, none is stale)', { declared: DECLARED.length, rows: Object.keys(seatMod.SEAT_TOOL_FACES).length })
  ok(A8_TARGETS.every((n) => row(n) !== undefined && DECLARED.includes(n)),
    'all eight A8 targets are declared pack tools with a row here', A8_TARGETS.filter((n) => !row(n)))
  ok(TEMP_MUST_KEEP.every((n) => row(n) !== undefined && DECLARED.includes(n)),
    'all the temp read/keep faces are declared pack tools', TEMP_MUST_KEEP.filter((n) => !row(n)))
  // the derived lists are COMPUTED from the table, not a second hand-maintained whitelist
  for (const seat of seatMod.SEAT_IDS) {
    const derived = seatMod.seatDenyNames(seat, DECLARED)
    ok(derived.length === denyList(seat).length && derived.every((n, i) => n === denyList(seat)[i]),
      'V5R_ROLE_TOOL_DENY.' + seat + ' is exactly `declared − allow` from this table (no second list)',
      { derived: derived.length, exported: denyList(seat).length })
    ok(nameList(seat).every((n) => allow(seat, n)) && denyList(seat).every((n) => !allow(seat, n)),
      'V5R_ROLE_TOOL_NAMES.' + seat + ' and DENY.' + seat + ' agree with seatDecision row by row')
  }
  ok(core.V5R_TOOL_FACES.temp.deny.length === denyList('temp').length
    && core.V5R_TOOL_FACES.temp.deny.every((n, i) => n === denyList('temp')[i]),
    'the manifest toolFaces.temp deny list is the same computed list (manifest and ACL cannot drift)')
}

console.log('=== 1. A7 — the member may dismiss the temp workers it is allowed to hire; chair still may; temp may not ===')
{
  ok(allow('member', 'vibe_v5_fire') === true && !denyList('member').includes('vibe_v5_fire'),
    '★ member ⇒ vibe_v5_fire is ALLOWED (A7): the permanent researcher can dismiss the worker it hired')
  ok(nameList('member').includes('vibe_v5_fire'),
    'the member\'s derived name list really carries vibe_v5_fire (this is the list the wire/gate reads)')
  ok(allow('chair', 'vibe_v5_fire') === true && !denyList('chair').includes('vibe_v5_fire'),
    'chair ⇒ vibe_v5_fire is STILL allowed (the academician coordinates the whole office\'s staffing)')
  ok(allow('temp', 'vibe_v5_fire') === false && denyList('temp').includes('vibe_v5_fire'),
    'temp ⇒ vibe_v5_fire is still DENIED (a temp worker cannot dismiss anyone)')
  ok(allow('member', 'vibe_v5_hire') === true && allow('chair', 'vibe_v5_hire') === true && allow('temp', 'vibe_v5_hire') === false,
    'hire was NOT touched by A7: chair/member hire, temp hires nobody (only fire was opened)')
  const why = String(row('vibe_v5_fire').why)
  ok(why.includes('解雇') && why.includes('临时工') && why.includes('院士') && why.includes('常驻研究员'),
    'the fire row\'s why states the rule point: both the academician and the permanent researcher may dismiss temp workers', why.length)
  ok(why.includes('都能解雇临时工') && why.includes('A7'),
    'the fire row\'s why carries the A7 sentence verbatim ("院士与常驻研究员都能解雇临时工") and its audit id')
  ok(seatMod.seatTaughtNames('member').v5.includes('vibe_v5_fire'),
    'the member\'s prompt bullets TEACH vibe_v5_fire (an allowed-but-untaught grant is the run-31 drift class)')
}

console.log('=== 2. A8 — a temp worker does not write the institute\'s research-conclusion libraries ===')
{
  const leaked = A8_TARGETS.filter((n) => allow('temp', n) || !denyList('temp').includes(n))
  ok(leaked.length === 0, '★★ temp ⇒ all eight (proposition / progress / five lean_* / paper) are DENIED and in the derived deny list',
    leaked)
  const stillOpen = A8_TARGETS.filter((n) => allow('chair', n) !== true || allow('member', n) !== true)
  ok(stillOpen.length === 0, 'A8 narrowed ONLY the temp seat: chair and member keep all eight faces', stillOpen)
  const kept = TEMP_MUST_KEEP.filter((n) => allow('temp', n) !== true || denyList('temp').includes(n))
  ok(kept.length === 0, '★ the temp seat keeps its READ faces and the task faces it needs (read_library/inbox/say/task_*)', kept)
  ok(allow('temp', 'vibe_v5_record_method') === false && allow('temp', 'vibe_v5_record_subproblem') === false,
    'the three libraries already closed to temp (method / subproblem) stay closed — A8 added rows, it did not reopen any')
  const taught = seatMod.seatTaughtNames('temp').v5
  ok(A8_TARGETS.every((n) => !taught.includes(n)),
    'the temp prompt no longer TEACHES a denied library face (bullets and ACL move together)', A8_TARGETS.filter((n) => taught.includes(n)))
  for (const tool of A8_TARGETS) {
    const why = String(row(tool).why)
    ok(why.includes('A8') && why.includes('临时工') && (why.includes('研究结论') || why.includes('所里的库') || why.includes('所里 Lean 库')),
      'why of ' + tool + ' states the A8 criterion: a temp worker only does the assigned temporary task, it does not write research conclusions into the institute\'s libraries',
      why.length)
  }
  ok(String(row('vibe_v5_paper').why).includes('临时工') && allow('chair', 'vibe_v5_paper') && allow('member', 'vibe_v5_paper'),
    'the paper row keeps the two authoring seats while naming why the temp seat is excluded')
}

console.log('=== 3. the row the brief and the table disagreed about: feedback ===')
{
  // The brief's example said "vibe_v5_feedback 仍给 temp", but the table has had temp:false since BEFORE A8 (the brief's
  // own first sentence lists feedback among the three libraries already closed to temp). This lane did not change it:
  // the assertion below pins the UNCHANGED value and the note names the discrepancy instead of silently choosing a side.
  ok(allow('temp', 'vibe_v5_feedback') === false,
    'vibe_v5_feedback.temp is UNCHANGED (false) — the table already closed it before A8; reported to the Lead, not edited here',
    { temp: allow('temp', 'vibe_v5_feedback') })
  ok(allow('member', 'vibe_v5_feedback') === true && allow('chair', 'vibe_v5_feedback') === true,
    'feedback is still open to chair and member (A7/A8 touched neither)')
}

console.log('=== 4. every changed why is non-empty and cites its rule (no silent cell edit) ===')
{
  const changed = ['vibe_v5_fire', ...A8_TARGETS]
  for (const tool of changed) {
    const r = row(tool)
    ok(String(r.why).trim().length > 20 && String(r.rule).trim().length > 0,
      tool + ': rule + non-empty why (>20 chars) — a decision without a reason is the "just open it" failure mode', String(r.why).length)
    ok(String(r.rule).split(',').map((s) => s.trim()).filter((s) => s !== '')
      .every((k) => Object.prototype.hasOwnProperty.call(seatMod.RULE_INDEX, k)),
      tool + ': every cited rule key exists in RULE_INDEX (a dangling citation is a lie about the rule)', r.rule)
  }
  ok(changed.every((t) => /A[78]/.test(String(row(t).why))), 'every changed row names its audit id (A7 / A8)')
}

console.log('=== 5. the two halves still agree (the mechanism this file exists for, re-run end to end) ===')
{
  const catalogue = seatMod.seatTeachingCatalogue(DECLARED)
  ok(catalogue.ok === true, '★★ seatTeachingCatalogue.ok — no missing/extra row, and no seat teaches a denied name or is granted an untaught one',
    { missing: catalogue.missing, extra: catalogue.extra, badRows: catalogue.badRows })
  for (const seat of seatMod.SEAT_IDS) {
    const s = catalogue.seats[seat]
    ok(s.taughtNotAllowed.length === 0 && s.allowedNotTaught.length === 0,
      seat + ': prompt bullets and declaration agree in BOTH directions', s)
  }
  const memberScope = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'member-scope.js')).href)
  const recon = seatMod.seatFaceReconciliation({ declared: DECLARED, memberScope: memberScope.TOOL_SCOPES })
  ok(recon.ok === true, '★ the two axes still reconcile with zero hard conflicts (applyMemberScope pushes this table\'s deny)',
    recon.hardConflicts.map((c) => c.seat + '·' + c.tool))
}

console.log('')
console.log('=== A7/A8 SEAT RIGHTS: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.error('  - ' + f)
process.exit(failed === 0 ? 0 : 1)

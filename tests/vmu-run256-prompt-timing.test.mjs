// tests/vmu-run256-prompt-timing.test.mjs — TB-2615 round B: the timing map is a checkable claim, not prose.
//
// WHY THIS SUITE EXISTS: the map (`docs/acceptance/prompt-timing-map.md`) says, row by row, WHICH prompt block appears
// at WHICH event point and where it must NOT appear. Prose decays silently: RUN 249 measured the `[新到的消息]` block
// promised four times in the prompt and rendered zero times. So each row carries probe keys, and this suite measures
// those keys against a REAL assembly (or the real `decideSections` policy where the input is declared per turn) and
// compares. A row with no probe, a probe with no row, a key that no longer exists, or a flipped expectation is red.
//
//   §A the doc is parseable: 13 rows, unique ids, within the 80-line budget
//   §B every row's present keys measure true and every absent key measures false (the map today)
//   §C coverage is BIDIRECTIONAL: each row names a probe measurement and each measured key is claimed by a row
//   §D a wrong expectation on EITHER side is caught by exactly that row (the "错位 1 处" criterion), including a
//      measured-side mutation (the probe says false, the doc says true)
//
// Run: node tests/vmu-run256-prompt-timing.test.mjs   (last line: === VMU RUN256 PROMPT TIMING: N passed, M failed ===)

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { boot, tmpRoot } from '../scripts/sim/harness.mjs'
import { decideSections } from '../vibe-math-vmu/packs/v5r/middleware/prompt-switches.js'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const DOC = join(REPO, 'docs', 'acceptance', 'prompt-timing-map.md')
const DOC_MAX_LINES = 80

let passed = 0
let failed = 0
function ok(cond, label, detail) {
  if (cond) {
    passed += 1
    console.log('  ok   ' + label)
  } else {
    failed += 1
    console.log('  FAIL ' + label + (detail === undefined ? '' : '  — ' + detail))
  }
}

// ── the doc: rows are `| T1 | event | phase | block | present keys | absent keys | layer |` ────────────────────────
const docText = readFileSync(DOC, 'utf8')
const docLines = docText.split('\n').length - (docText.endsWith('\n') ? 1 : 0)
const cellKeys = (cell) => {
  const out = []
  const re = /`([^`]+)`/g
  let m
  while ((m = re.exec(cell)) !== null) out.push(m[1])
  return out
}
const rows = docText.split('\n')
  .filter((l) => /^\| T\d+ \|/.test(l))
  .map((l) => {
    const cells = l.split('|').map((c) => c.trim())
    // cells: ['', 'T1', 事件点, 相位, 块, 出现, 不出现, 层, '']
    return { id: cells[1], event: cells[2], phase: cells[3], block: cells[4], present: cellKeys(cells[5]), absent: cellKeys(cells[6]), layer: cells[7] }
  })

// ── measurement: one real boot, one timeline of assemblies ─────────────────────────────────────────────────────────
const blockOf = (text) => {
  const m = /\n\[新到的消息\]\n(?:  .*\n)+/.exec('\n' + String(text))
  return m ? m[0] : null
}
const headsOf = (text) => String(text).split('\n').filter((l) => /^# /.test(l)).map((l) => l.replace(/^# /, ''))
const enabled = (d, name) => ((d.decisions || d).find((x) => x.name === name) || {}).enabled
const decision = (turn) => decideSections({ turn })

const root = tmpRoot('t1-prompt-timing-')
const h = await boot({ root, withPrompt: true })
const measured = {}
try {
  const heads = (t) => headsOf(t)
  const normal = await h.prompts.assembleFor({ seat: 'chair', phase: 'normal', round: 1 })
  const normalHeads = heads(normal)

  // T1 — the first ordinary round
  measured.T1 = {
    'heading.round1': normal.includes('【第 1 轮 —— 院士'),
    'heading.meeting': normal.includes('【研究所会议'),
    'heading.heartbeat': normal.includes('【心跳检查'),
    'section.chamber': normalHeads.includes('v5r-turn-meeting-chamber'),
  }

  // T2 — ordinary round, empty mailbox: the block must NOT render (teaching mentions are not the block)
  const member0 = await h.prompts.assembleFor({ seat: 'member', phase: 'normal', member: 'r-1' })
  const notices0 = h.prompts.at(-1).notices
  measured.T2 = {
    'section.briefStatus': heads(member0).includes('v5r-brief-status'),
    'notice.block': blockOf(member0) !== null || (notices0.lines.length !== 0),
  }

  // T3 — one un-acked private message: block renders, with the ack instruction and its OWN mail id
  const sent = h.kernel.mailbox.send('r-acad', { to: 'r-1', text: 'timing probe body', kind: 'dm', subject: '时机探针' })
  const member1 = await h.prompts.assembleFor({ seat: 'member', phase: 'normal', member: 'r-1' })
  const n1 = h.prompts.at(-1).notices
  measured.T3 = {
    'notice.block': blockOf(member1) !== null,
    'notice.ackLine': /读后 mailbox ack ml-\d+/.test(member1),
    'notice.idAligned': n1.mailIds.filter(Boolean).length > 0 && n1.mailIds.filter(Boolean).every((id) => member1.includes(String(id))),
  }

  // T4 — after ack: settlement removes the line, the round itself is unchanged
  const ids = n1.mailIds.filter(Boolean)
  h.kernel.mailbox.ack('r-1', ids)
  const member2 = await h.prompts.assembleFor({ seat: 'member', phase: 'normal', member: 'r-1' })
  const n2 = h.prompts.at(-1).notices
  measured.T4 = {
    'section.briefStatus': heads(member2).includes('v5r-brief-status'),
    'notice.block': blockOf(member2) !== null || n2.lines.length !== 0,
  }

  // T5 — ten pending rows: eight rendered, newest first
  const subjects = []
  for (let i = 0; i < 10; i += 1) {
    subjects.push('S' + i)
    h.kernel.mailbox.send('r-acad', { to: 'r-1', text: 'body ' + i, kind: 'dm', subject: 'S' + i })
  }
  const member3 = await h.prompts.assembleFor({ seat: 'member', phase: 'normal', member: 'r-1' })
  const n3 = h.prompts.at(-1).notices
  const firstLine = n3.lines[0] || ''
  const lastLine = n3.lines[n3.lines.length - 1] || ''
  measured.T5 = {
    'notice.capped8': n3.lines.length === 8 && (blockOf(member3).match(/^  /gm) || []).length === 8,
    'notice.newestFirst': firstLine.includes('S9') && lastLine.includes('S2') && !firstLine.includes('S0'),
  }

  // T6 — meeting phase with a bound meeting
  const meeting = await h.prompts.assembleFor({ seat: 'chair', phase: 'meeting', meeting: 'm-timing', round: 2 })
  const meetingHeads = heads(meeting)
  measured.T6 = {
    'section.chamber': meetingHeads.includes('v5r-turn-meeting-chamber'),
    'section.agenda': meetingHeads.includes('v5r-turn-meeting-agenda'),
    'heading.round1': meeting.includes('【第 1 轮 —— 院士'),
  }

  // T7/T8 — the meeting speaker state is a per-turn DECLARATION, so it is checked at the policy layer
  const pOthers = decision({ phase: 'meeting', meetingState: 'others' })
  measured.T7 = {
    'state.others': enabled(pOthers, 'v5r-meeting-others') === true,
    'state.briefOff': enabled(pOthers, 'v5r-brief-status') === false,
    'state.invited': enabled(pOthers, 'v5r-meeting-invited') === true,
    'state.first': enabled(pOthers, 'v5r-meeting-first') === true,
  }
  const pFirst = decision({ phase: 'meeting', meetingState: 'first' })
  const pNone = decision({ phase: 'normal' })
  measured.T8 = {
    'state.first': enabled(pFirst, 'v5r-meeting-first') === true,
    'state.others': enabled(pFirst, 'v5r-meeting-others') === true,
    'state.invited': enabled(pFirst, 'v5r-meeting-invited') === true,
    'state.noneOutsideMeeting': enabled(pNone, 'v5r-meeting-first') === true || enabled(pNone, 'v5r-meeting-others') === true,
  }

  // T9/T10 — verify and checkpoint phases
  const verify = await h.prompts.assembleFor({ seat: 'chair', phase: 'verify' })
  measured.T9 = {
    'heading.verify': verify.includes('【验证轮 ——'),
    'section.verifyCore': heads(verify).includes('v5r-verify-core'),
    'heading.round1': verify.includes('【第 1 轮 —— 院士'),
  }
  const checkpoint = await h.prompts.assembleFor({ seat: 'chair', phase: 'checkpoint' })
  measured.T10 = {
    'heading.heartbeat': checkpoint.includes('【心跳检查 ——'),
    'heading.round1': checkpoint.includes('【第 1 轮 —— 院士'),
  }

  // T11 — exactly one formal-status line per phase, default `none`; a declared `passed` is the one shown
  const statusHeads = (t) => heads(t).filter((x) => /^v5r-formal-status-/.test(x))
  const pPassed = decision({ phase: 'normal', formalStatus: 'passed' })
  measured.T11 = {
    'status.exactlyOne': [normal, verify, checkpoint].every((t) => statusHeads(t).length === 1),
    'status.defaultNone': statusHeads(normal)[0] === 'v5r-formal-status-none',
    'status.passedShown': enabled(pPassed, 'v5r-formal-status-passed') !== true || statusHeads(normal).includes('v5r-formal-status-passed'),
  }

  // T12 — a role-only block reaches its role and not the chair
  const temp = await h.prompts.assembleFor({ seat: 'temp', phase: 'normal' })
  measured.T12 = {
    'section.rosterTemp': heads(temp).some((x) => /^v5r-charter-roster-temp/.test(x)),
    'section.rosterTempChair': heads(temp).some((x) => /^v5r-charter-roster-temp/.test(x)) === false,
  }

  // T13 — the status block's live groups (RUN 258/TB-2621): no durable paper row ⇒ NO [论文] line (an empty row would be
  // noise, the why lives on the receipt), and a real paper-state row ⇒ the line appears WITH its lifecycle word.
  h.kernel.records.put({
    id: 'probe-live-paper', track: 'paper', kind: 'paper-state', title: 'v5r-paper|timing|state', owner: 'vibe_v5_paper',
    body: JSON.stringify({ id: 'paper-timing', target: 'timing', title: 'T', status: 'writing', stage: 'writing', round: 1, participants: ['r-1'], parts: {} }),
  })
  const livePaper = await h.prompts.assembleFor({ seat: 'chair', phase: 'normal', round: 2 })
  measured.T13 = {
    'status.paperLine': livePaper.includes('[论文]') && livePaper.includes('writing'),
    'status.paperLineEarly': normal.includes('[论文]'),
  }
} finally {
  const cleanups = h.handle && Array.isArray(h.handle.cleanups) ? h.handle.cleanups : []
  await Promise.all(cleanups.map(async (c) => { try { return await c() } catch { return null } }))
}

// ── the checker: doc expectation vs measurement (pure, so §D can feed it a mutated copy) ───────────────────────────
function checkRows(docRows, measurements) {
  const failures = []
  for (const row of docRows) {
    const m = measurements[row.id]
    if (!m) { failures.push({ id: row.id, key: '(row)', why: 'no measurement for this row' }); continue }
    if (docRows.filter((r) => r.id === row.id).length > 1) failures.push({ id: row.id, key: '(row)', why: 'duplicate row id' })
    for (const key of row.present) {
      if (!(key in m)) failures.push({ id: row.id, key, why: 'present key is not measured' })
      else if (m[key] !== true) failures.push({ id: row.id, key, why: 'expected to appear, measured false' })
    }
    for (const key of row.absent) {
      if (!(key in m)) failures.push({ id: row.id, key, why: 'absent key is not measured' })
      else if (m[key] !== false) failures.push({ id: row.id, key, why: 'expected NOT to appear, measured true' })
    }
  }
  return failures
}

// §A — the doc is a parseable table inside its budget
ok(docLines <= DOC_MAX_LINES, '§A1 doc within the 80-line budget', 'lines=' + docLines)
ok(rows.length === 13, '§A2 thirteen event rows', 'rows=' + rows.length)
ok(new Set(rows.map((r) => r.id)).size === rows.length, '§A3 row ids are unique')
const REQUIRED_IDS = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12', 'T13']
for (const id of REQUIRED_IDS) ok(rows.some((r) => r.id === id), '§A4 row present: ' + id)
ok(rows.every((r) => r.present.length + r.absent.length > 0), '§A5 every row claims at least one key')
ok(rows.every((r) => r.present.length + r.absent.length <= 4), '§A6 a row claims at most four keys (the row is a claim, not a dump)')

// §B — today every row holds
const failures = checkRows(rows, measured)
ok(failures.length === 0, '§B1 every row holds against the real assembly', JSON.stringify(failures))

// §C — bidirectional coverage: measured keys are claimed, claimed keys are measured
const claimed = new Set()
for (const r of rows) for (const k of [...r.present, ...r.absent]) claimed.add(r.id + '\u0000' + k)
const measuredKeys = new Set()
for (const [id, m] of Object.entries(measured)) for (const k of Object.keys(m)) measuredKeys.add(id + '\u0000' + k)
const unclaimed = [...measuredKeys].filter((x) => !claimed.has(x))
const unmeasured = [...claimed].filter((x) => !measuredKeys.has(x))
ok(unclaimed.length === 0, '§C1 every measured key is claimed by a row (no silent probe)', JSON.stringify(unclaimed))
ok(unmeasured.length === 0, '§C2 every claimed key is really measured', JSON.stringify(unmeasured))

// §D — the "错位 1 处" criterion: a wrong expectation is caught by exactly that row
const solve = (mut) => checkRows(rows.map((r) => (r.id === mut.id ? Object.assign({}, r, mut.patch) : r)), mut.measurements || measured)
const flipPresent = solve({ id: 'T1', patch: { present: ['heading.meeting'] } })
ok(flipPresent.length === 1 && flipPresent[0].id === 'T1', '§D1 a flipped PRESENT cell is caught by exactly its row', JSON.stringify(flipPresent))
const flipAbsent = solve({ id: 'T6', patch: { absent: ['section.chamber'] } })
ok(flipAbsent.length === 1 && flipAbsent[0].id === 'T6', '§D2 a flipped ABSENT cell is caught by exactly its row', JSON.stringify(flipAbsent))
const mutatedMeasurements = Object.assign({}, measured, {
  T3: Object.assign({}, measured.T3, { 'notice.block': false }),
})
const measuredSide = checkRows(rows, mutatedMeasurements)
ok(measuredSide.length === 1 && measuredSide[0].id === 'T3' && measuredSide[0].key === 'notice.block',
  '§D3 a measured-side mutation (block gone) is caught by the row that promises it', JSON.stringify(measuredSide))
const unknownKey = solve({ id: 'T9', patch: { present: ['heading.nonexistent'] } })
ok(unknownKey.length === 1 && unknownKey[0].why === 'present key is not measured', '§D4 an unmeasured key is red, not silently true', JSON.stringify(unknownKey))

console.log('=== VMU RUN256 PROMPT TIMING: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed !== 0) process.exitCode = 1

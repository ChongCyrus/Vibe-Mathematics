// tests/vmu-run102-panel-types.test.mjs — run 100's three readings.
//
// WHY THIS FILE EXISTS: run 100 (build ae84e353) was built to verify D5/D7/E13 on the real machine and returned three
// verbatim contradictions:
//   F-100a — the office wrote a state panel for "r-2" while the roster was r-acad + r-1, and the write SUCCEEDED
//            (`owner:"r-2"`): a name nobody hired got a panel, so the ledger cannot distinguish it from a real one.
//   F-100e — the member's seat holds `vibe_vmu_meeting` but not `vibe_v5_meeting`; the six meeting TYPES live only on
//            the pack face, so the vocabulary a member must obey was unreadable from the seat that must obey it
//            ("六种类型我只能背名字，读不到实例").
//   D5     — `[总任务]` carried no time at all (it comes from a settings key, which is configuration and has no
//            updatedAt) while the prompt claims all four rows carry time information. The row now names the absence.
// Everything here is measured from the public surfaces (tool handlers and the board reader), never from prose.

import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import fs from 'node:fs'
import { createKernel } from '../vibe-math-vmu/kernel/index.js'
import { statusBoardReadings, renderStatusBoard } from '../vibe-math-vmu/kernel/turn/index.js'
import { V5R_PACK_TOOLS } from '../vibe-math-vmu/packs/v5r/tools.js'
import { makeMeetingSpec } from '../vibe-math-vmu/tools/meeting.js'
import { TOOL_NAMES } from '../vibe-math-vmu/host.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const T = Date.parse('2023-11-14T22:13:20.000Z')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const PANEL = { progress: '把引理 3 的形式化补完', obstacles: 'Lean 里缺一条辅助引理', next: '先证辅助引理，再拼主证明', help: '需要一位熟悉 mathlib 的成员看一下思路' }
const progressTool = () => V5R_PACK_TOOLS.find((t) => t.name === 'vibe_v5_record_progress')

// ── §F-100a: a panel belongs to a member who EXISTS ───────────────────────────────────────────────────────────────
{
  const k = createKernel({ clock: () => T, settings: {} })
  // The kernel's own members list is attached by the plugin path; this suite drives the PACK FACE, so the roster is
  // stubbed to exactly two live seats. (The real machine run re-verifies the same refusal end to end.)
  const rosterNames = 'r-acad, r-1'
  const roster = [{ id: 'r-acad', slot: 'chair', state: 'live' }, { id: 'r-1', slot: 'member', state: 'live' }]
  Object.defineProperty(k, 'members', { value: { roster: () => roster.slice(), hire: () => ({ ok: true }) }, configurable: true })
  const tool = progressTool()

  const attempt = (fn) => { try { return { value: fn() } } catch (e) { return { error: e } } }
  const ghostAttempt = attempt(() => tool.handler({ track: 'state', member: 'r-2', ...PANEL }, { kernel: k }))
  const ghost = ghostAttempt.error || (ghostAttempt.value && ghostAttempt.value.ok === false ? ghostAttempt.value : null)
  ok(ghost && (ghostAttempt.error ? true : ghost.ok === false), 'F-100a · a state panel for an unhired id is refused', ghost && ghost.code)
  ok(ghost && ghost.code === 'VMU_NO_SUCH_OBJECT', 'F-100a · the code names a missing object, not a permission problem', ghost && ghost.code)
  ok(ghost && /there is no member "r-2" on this roster/.test(String(ghost.message)), 'F-100a · the message says the id is not on this roster', ghost && ghost.message)
  ok(ghost && /r-acad/.test(String(ghost.hint)) && /r-1/.test(String(ghost.hint)), 'F-100a · …and the hint prints the roster it checked against', ghost && ghost.hint)
  ok(ghost && /vibe_v5_hire/.test(String(ghost.hint)), 'F-100a · the hint names the way to create the member first', ghost && ghost.hint)
  ok(k.records.list({ track: 'state' }).count === 0, 'F-100a · the refused write changed nothing')

  const own = tool.handler({ track: 'state', member: 'r-1', ...PANEL }, { kernel: k, agent: { id: 'r-1' } })
  ok(own && own.ok === true, 'F-100a · a seated member still writes their own panel', own && own.code)
  ok(own && own.memberCheck === 'checked', 'F-100a · the receipt says the roster check RAN', own && own.memberCheck)
  ok(own && typeof own.memberCheckMeans === 'string' && own.memberCheckMeans.includes('exists on this roster'), 'F-100a · …and what it means', own && own.memberCheckMeans)

  // A kernel with no members face must not invent a refusal from an unread roster: it says the check was skipped.
  const bare = createKernel({ clock: () => T, settings: {} })
  if (!(bare.members && typeof bare.members.roster === 'function')) {
    const skippedAttempt = attempt(() => progressTool().handler({ track: 'state', member: 'r-nowhere', ...PANEL }, { kernel: bare }))
    const skipped = skippedAttempt.value || null
    ok(skippedAttempt.error === undefined && skipped && skipped.ok === true, 'F-100a · without a members face the write is not refused on a guess', skippedAttempt.error && skippedAttempt.error.message)
    ok(skipped && skipped.memberCheck === 'skipped', 'F-100a · …the receipt says the check was skipped', skipped && skipped.memberCheck)
    ok(skipped && typeof skipped.memberCheckMeans === 'string' && skipped.memberCheckMeans.includes('no members face'), 'F-100a · …and why', skipped && skipped.memberCheckMeans)
  } else {
    ok(false, 'F-100a · the kernel under test unexpectedly exposes a members face (the skipped branch is unmeasured)')
  }
}

// ── §F-100e: the meeting-type vocabulary is readable from the PRIMITIVE face ───────────────────────────────────────
{
  const k = createKernel({ clock: () => T, settings: { 'vmu.meetings.typeCatalog': ['ordinary', 'academic', 'debate', 'closure', 'paper', 'planning'] } })
  const param = (type, description, extra = {}) => Object.assign({ type, required: false, description }, extra)
  const refused = (code, message, hint, extra = null) => Object.assign({ ok: false, code, message, hint: hint || null }, extra || {})
  const face = makeMeetingSpec({ param, refused, TOOL_NAMES, kernel: k })
  const types = await face.run({ action: 'types' }, { kernel: k })
  ok(types && types.ok === true, 'F-100e · action types answers without any meeting id', types && types.code)
  ok(types && Array.isArray(types.declaredMeetingTypes) && types.declaredMeetingTypes.length === 6, 'F-100e · it reports the DECLARED six types', types && types.declaredMeetingTypes)
  ok(types && types.declaredSource === 'vmu.meetings.typeCatalog', 'F-100e · it names the setting it read them from', types && types.declaredSource)
  ok(types && Array.isArray(types.ballotKinds) && types.ballotKinds.join(',') === 'decisive,advisory', 'F-100e · it keeps the two vocabularies apart (this face `kind` is the ballot kind)', types && types.ballotKinds)
  ok(types && types.meetingTypeOwner === 'vibe_v5_meeting', 'F-100e · …and names which face owns meeting TYPES', types && types.meetingTypeOwner)
  ok(types && typeof types.ballotKindMeans === 'string' && types.ballotKindMeans.includes('BALLOT kind'), 'F-100e · the ballot-kind sentence is readable', types && types.ballotKindMeans)
  ok(types && typeof types.meetingTypeOwnerMeans === 'string' && types.meetingTypeOwnerMeans.includes('SERVICE record'), 'F-100e · the ownership sentence is readable', types && types.meetingTypeOwnerMeans)
  const enumHas = face.parameters && face.parameters.action && Array.isArray(face.parameters.action.enum) && face.parameters.action.enum.includes('types')
  ok(enumHas, 'F-100e · the action enum declares types (an undeclared value would be dropped by the host)')
  ok(typeof (face.description || '') === 'string' && /types/.test(face.description), 'F-100e · the description teaches it')
}

// ── §D5: every board row answers about time; the answer is deterministic ─────────────────────────────────────────
{
  const k = createKernel({ clock: () => T, settings: { 'vmu.turn.objective': '本期的总任务' } })
  k.records.put({ track: 'progress', kind: 'progress', by: 'r-1', title: '第 102 轮', body: '正在补引理 3', settled: true })
  k.tasks.create({ title: '补完引理 3 的形式化', by: 'r-1' })
  const readings = statusBoardReadings({ tasks: k.tasks, records: k.records, member: 'r-1', settings: k.settingsView(), at: T })
  const byKey = Object.fromEntries((readings.fields || []).map((f) => [f.key, f]))
  ok(byKey.objective && byKey.objective.value === '本期的总任务', 'D5 · the objective row still shows the setting value', byKey.objective)
  ok(byKey.objective && byKey.objective.at === null, 'D5 · a settings row carries NO read stamp (a prompt must stay diffable)', byKey.objective && byKey.objective.at)
  ok(byKey.objective && typeof byKey.objective.timeWhy === 'string' && byKey.objective.timeWhy.includes('设置键没有内容时间戳'), 'D5 · …and says why it has no content time', byKey.objective && byKey.objective.timeWhy)
  const board = String(renderStatusBoard(readings))
  ok(/\[总任务\].*时间未提供：设置键没有内容时间戳/.test(board), 'D5 · the rendered objective line names the absence instead of staying silent', board)
  ok(board === String(renderStatusBoard(readings)), 'D5 · two renders of the same readings are identical (prompt determinism)')
  // The records-derived rows keep the CONTENT time they really have.
  const current = byKey.current
  ok(current && typeof current.value === 'string' && current.value.includes('正在补引理 3'), 'D5 · the current-task row still reads the record', current)
  ok(current && current.at !== null && String(current.at) === new Date(T).toISOString(), 'D5 · …carrying the read instant it was given', current && current.at)
}

// ── teaching pins ──────────────────────────────────────────────────────────────────────────────────────────────
{
  const p = fs.readFileSync(join(REPO, 'vibe-math-vmu/packs/v5r/prompts/v5r-blocks-b.js'), 'utf8')
  ok(/要么带内容时间/.test(p), 'teaching · the board row rule names content time')
  ok(/时间未提供：为什么/.test(p), 'teaching · …and the named absence')
  ok(/成员席位只能改自己的/.test(p), 'teaching · a member seat may only rewrite its own panel')
  ok(/所办\/人类代笔/.test(p), 'teaching · …while the office/human path writes on behalf and discloses it')
  ok(/不在名册[\s\S]{0,24}具名拒/.test(p), 'teaching · a name that is not on the roster is refused by name')
}

if (failed > 0) {
  console.error('\nRUN102 PANEL+TYPES+BOARD: ' + passed + ' passed, ' + failed + ' failed')
  console.error('  - ' + failures.join('\n  - '))
  process.exit(1)
}
console.log('\nRUN102 PANEL+TYPES+BOARD: ' + passed + ' passed, 0 failed')

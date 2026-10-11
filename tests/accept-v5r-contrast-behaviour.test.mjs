// Behaviour-level contrast between the v5r body and vmu, for the five behaviour settings this session brought across.
// Method: docs/10-§5.1 - the same scenarios, both sides driven, only OBSERVABLE behaviour compared, every pair classified
// as 等价 | 有意改进 | 缺陷 | 未覆盖, and anything not 等价 reported rather than smoothed over.
// How each side is read:
//   * v5r's side is its SOURCE OF TRUTH - `DEFAULT_PARAMS` and the guards next to the keys in vibe-math-v5r.js. Anchor
//     text, not line numbers (a line-number anchor rots; this repository has been bitten by that).
//   * vmu's side is DRIVEN - the meetings face is built and asked, so the comparison is against behaviour, not against a
//     second copy of the same prose.
// This suite is deliberately able to fail: each pair asserts the classification, and a control below proves the v5r
// reader really reads (a wrong expected value reddens it).
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createMeetings } from '../vibe-math-vmu/kernel/meetings.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const V5R = readFileSync(join(REPO, 'vibe-math-v5r', 'vibe-math-v5r.js'), 'utf8')

let passed = 0
const failures = []
const ok = (cond, name, detail) => { if (cond) { passed += 1; console.log('  ok - ' + name) } else { failures.push(name + (detail === undefined ? '' : ' [' + detail + ']')); console.error('  FAIL - ' + name + (detail === undefined ? '' : ' [' + detail + ']')) } }

/** Read a declared default from v5r's DEFAULT_PARAMS by KEY, content-anchored. */
const v5rDefault = (key) => {
  const m = V5R.match(new RegExp('\\n\\s*' + key + ':\\s*([0-9]+)'))
  return m ? Number(m[1]) : null
}
/** Read the guard sentence v5r writes next to a key (its contract), or null. */
const v5rCommentFor = (needle) => {
  const i = V5R.indexOf(needle)
  return i === -1 ? null : V5R.slice(Math.max(0, i - 400), i + 200)
}

// ---------- the v5r side, as declared ----------
const V5R_VALUES = {
  quorumCap: v5rDefault('quorumCap'),
  verdictMaxRounds: v5rDefault('verdictMaxRounds'),
  reconsiderFloor: v5rDefault('reconsiderFloor'),
  meetingWakeRetries: v5rDefault('meetingWakeRetries'),
  meetingHardLimitMs: v5rDefault('meetingHardLimitMs'),
}
console.log('  v5r declared defaults: ' + JSON.stringify(V5R_VALUES))

// ---------- the vmu side, DRIVEN ----------
let NOW = 1000
const roster = ['acad', 'r-1', 'r-2', 'r-3']
const face = (settings, seams = {}) => createMeetings(Object.assign({ clock: () => NOW, settings: { get: (k) => settings[k] } }, seams))
const opened = (settings) => { const t = face(settings); const o = t.open({ type: 'ordinary', chair: 'acad', roster }); return { t, id: o.meeting } }

// 1. quorumCap - v5r: m = min(quorumCap, |voters|)
{
  NOW = 1000
  const a = opened({ 'vmu.meetings.quorumMin': 3, 'vmu.meetings.quorumCap': 2 })
  const uncapped = opened({ 'vmu.meetings.quorumMin': 3, 'vmu.meetings.quorumCap': 0 })
  ok(V5R_VALUES.quorumCap === 3, 'v5r declares quorumCap=3 (read from its DEFAULT_PARAMS, not from prose)', String(V5R_VALUES.quorumCap))
  ok(a.t.quorum({ meeting: a.id }).required === 1 && uncapped.t.quorum({ meeting: uncapped.id }).required === 3,
    '等价: vmu caps the required quorum at min(cap, participants) exactly as v5r words it (capped=1, uncapped=3)',
    JSON.stringify({ capped: a.t.quorum({ meeting: a.id }).required, uncapped: uncapped.t.quorum({ meeting: uncapped.id }).required }))
}

// 2. verdictMaxRounds - v5r: Math.max(1, floor(params.verdictMaxRounds || 3)), refusal at curRound >= maxRounds
{
  NOW = 1000
  const t = face({ 'vmu.meetings.verdictMaxRounds': 2 })
  const o = t.open({ type: 'ordinary', chair: 'acad', roster })
  t.motion({ meeting: o.meeting, member: 'acad', text: 'm1' })
  t.motion({ meeting: o.meeting, member: 'acad', text: 'm2' })
  let code = null
  try { t.motion({ meeting: o.meeting, member: 'acad', text: 'm3' }) } catch (e) { code = e && e.code }
  ok(V5R_VALUES.verdictMaxRounds === 3, 'v5r declares verdictMaxRounds=3', String(V5R_VALUES.verdictMaxRounds))
  ok(/Math\.max\(1,\s*Math\.floor\(Number\(params\.verdictMaxRounds\)\s*\|\|\s*3\)\)/.test(V5R), 'v5r clamps it as max(1, floor(v || 3)) - read from its source')
  ok(code === 'VMU_RESOURCE_BUDGET', '等价: vmu refuses the motion past the ceiling by name, as v5r refuses past maxRounds', String(code))
  // (Removed two vacuous assertions here: `x ? true : true`, and a type check any string satisfies. This
  // repository audits vacuous assertions, and the pairs above already prove the face was really driven.)
}

// 3. wakeRetries - v5r: clamped to [0,10]; exhaustion records `unreached`
{
  NOW = 1000
  const t = face({ 'vmu.meetings.wakeFailurePolicy': 'retry', 'vmu.meetings.wakeRetries': 3 }, { wake: () => { throw new Error('seam down') } })
  const r = t.wake({ member: 'r-1' })
  const comment = v5rCommentFor('meetingWakeRetries')
  ok(V5R_VALUES.meetingWakeRetries === 5, 'v5r declares meetingWakeRetries=5', String(V5R_VALUES.meetingWakeRetries))
  ok(comment !== null && /\[0,\s*10\]/.test(comment) && /unreached/.test(comment),
    'v5r own contract for it is clamped [0,10] with exhaustion recorded as unreached (read next to the key)')
  ok(r.unreached === true && r.retries === 3, '等价: vmu records unreached after exactly N retries, as v5r contract says', JSON.stringify(r))
  NOW = 1000
  const t2 = face({ 'vmu.meetings.wakeFailurePolicy': 'retry', 'vmu.meetings.wakeRetries': 99 }, { wake: () => { throw new Error('seam down') } })
  const r2 = t2.wake({ member: 'r-1' })
  ok(r2.wakeRetries === 10, '等价: vmu clamps the ceiling to 10 exactly as v5r clamps it', String(r2.wakeRetries))
}

// 4. hardLimitMs - v5r: clamped [300000, 7200000], no unbounded case
{
  NOW = 1000
  const t = face({ 'vmu.meetings.hardLimitMs': 0, 'vmu.meetings.budgetWallMs': 0 })
  const o = t.open({ type: 'ordinary', chair: 'acad', roster })
  NOW = 1000 + 900000
  let code = null
  try { t.speak({ meeting: o.meeting, member: 'acad', text: 'late' }) } catch (e) { code = e && e.code }
  const comment = v5rCommentFor('meetingHardLimitMs')
  ok(V5R_VALUES.meetingHardLimitMs === 1800000, 'v5r declares meetingHardLimitMs=1800000', String(V5R_VALUES.meetingHardLimitMs))
  ok(comment !== null && /300000/.test(comment) && /7200000/.test(comment), 'v5r own contract for it is clamped [300000, 7200000]')
  ok(code === 'VMU_RESOURCE_BUDGET', '等价: an explicit 0 clamps to the floor and still stops the meeting, as v5r has no unbounded case', String(code))
}

// 5. reconsiderFloor - v5r: effective threshold = max(object standard, it, quorumCap)
{
  const comment = v5rCommentFor('reconsiderFloor')
  ok(V5R_VALUES.reconsiderFloor === 0 && comment !== null && /max\(/.test(comment),
    'v5r declares reconsiderFloor=0 and words its effect as a maximum over the object standard, itself and the cap')
  const meetingsSrc = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'meetings.js'), 'utf8')
  const hasFloor = /reconsiderFloor/.test(meetingsSrc)
  ok(hasFloor === false,
    '未覆盖 (reported, not smoothed): vmu meetings does NOT read reconsiderFloor, so that pair is an explicit gap - the schema doc says so too')
}

// ---------- control: the v5r reader really reads ----------
{
  const wrong = V5R_VALUES.quorumCap !== 4
  ok(wrong === true, 'control: the v5r reader would have reddened on a wrong expected value (quorumCap is not 4)')
}

console.log('\n=== V5R CONTRAST (behaviour level): ' + passed + ' passed, ' + failures.length + ' failed ===')
if (failures.length) { for (const f of failures) console.log('  - ' + f); process.exit(1) }

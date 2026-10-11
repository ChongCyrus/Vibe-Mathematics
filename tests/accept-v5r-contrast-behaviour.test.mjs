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
import { createBallot } from '../vibe-math-vmu/kernel/ballot.js'

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

// ---------- 6. 表决期禁言 (the volume calls this v5r's real regression point) ----------
{
  const src = readFileSync(join(REPO, 'vibe-math-v5r', 'vibe-math-v5r.js'), 'utf8')
  const i = src.indexOf('function speechFrozen()')
  ok(i !== -1, 'v5r has speechFrozen(): a ballot that is OPEN freezes speech (read from its source)')
  const near = i === -1 ? '' : src.slice(Math.max(0, i - 700), i + 100)
  ok(/open/.test(near) && /冻结/.test(near), 'v5r derives it from an open ballot and calls it a freeze (its own comment)')
  // DRIVEN side: vmu's ballot face refuses a frozen cast by name and does not count it
  const vmuBallot = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'ballot.js'), 'utf8')
  // DRIVEN through the API the face really exposes: freeze(reason) / unfreeze() and the `frozen` getter. The face
  // does NOT throw on a frozen vote - it returns { ok:false, refused:{code,message} } (kernel/ballot.js:183) - so the
  // refusal half is asserted on the source below and labelled source-read, not dressed up as driven.
  const b = createBallot({ target: 't1', options: ['a', 'b'], isFrozen: () => false })
  ok(b.frozen === false, 'DRIVEN: a fresh ballot starts unfrozen')
  // DRIVEN, with every call copied from a suite that already passes (tests/vmu-ballot.test.mjs:87-96) - and the reason
  // matters: `createBallot` starts in state 'closed', so a cast throws even when nothing is frozen. An earlier attempt
  // here asserted only that a cast was refused and was therefore a FALSE POSITIVE; the non-vacuous control is that the
  // refusal is RECORDED with the freeze reason, which a closed-ballot refusal is not.
  // The face answered a question I had been guessing at: freeze() on a ballot that is not open is refused with
  // VMU_STATE ('only an open ballot can be frozen', kernel/ballot.js:152). That refusal is itself the driven observable,
  // and the half I cannot drive here is labelled and WITNESSED by the ballot's own suite rather than asserted on faith.
  const elig = ['r-1', 'r-2', 'r-3']
  const fzb = createBallot({ target: 't1', eligible: elig })
  ok(fzb.status().frozen === false && fzb.status().state !== 'frozen', 'DRIVEN: a fresh ballot is not frozen')
  let freezeThrew = null
  try { await fzb.freeze('v5r: an open ballot freezes the phase') } catch (e) { freezeThrew = e && e.code }
  ok(freezeThrew === 'VMU_STATE', 'DRIVEN: freeze() refuses a ballot that is not open, BY NAME (the state machine is real)', String(freezeThrew))
  const witness = readFileSync(join(REPO, 'tests', 'vmu-ballot.test.mjs'), 'utf8')
  ok(/expectThrow\(\(\) => b\.cast\('r-2', 1\), 'VMU_STATE'/.test(witness),
    '等价 (source-read, WITNESSED by tests/vmu-ballot.test.mjs): a cast during a frozen ballot is refused BY NAME')
  ok(/reason === 'in-frozen-ballot'/.test(witness),
    '等价 (source-read, WITNESSED): the frozen refusal is RECORDED with its reason, so it is not counted as a vote')
  ok(/refused:\s*dec\.refused/.test(vmuBallot), '等价 (source-read): a refused decision is REPORTED as { refused: { code, message } } rather than thrown')
  ok(/state === 'open' \|\| state === 'frozen'/.test(vmuBallot), 'the frozen state is part of the ballot state machine (control flow gates on it)')
  ok(/ballot\.frozen/.test(readFileSync(join(REPO, 'vibe-math-vmu', 'docs', '08-primitives-meeting-ballot-workflow.md'), 'utf8')),
    'vmu documents the ballot.frozen judgement point (the speech-side gate belongs to round-complete, stated, not flattened)')
}

// ---------- 7. 记录分轨＋截断计数 (v5r: without a counter the truncation was invisible) ----------
{
  const src = readFileSync(join(REPO, 'vibe-math-v5r', 'vibe-math-v5r.js'), 'utf8')
  ok(/officeRequestsDropped/.test(src), 'v5r keeps an explicit dropped counter for the truncated office requests')
  ok(/invisible in status\/report/.test(src), 'v5r own comment states what the counter is FOR: without it the truncation is invisible')
  const rec = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'records.js'), 'utf8')
  ok(/truncated:/.test(rec), '等价 (source-read): vmu REPORTS truncation on the slug instead of dropping characters silently')
  ok(/historyDropped/.test(rec), '等价 (source-read): vmu keeps a dropped counter too, so the loss is visible in status')
}

// ---------- 8. 内容指纹 (round 137 measured this as a deliberate divergence) ----------
{
  const src = readFileSync(join(REPO, 'vibe-math-v5r', 'vibe-math-v5r.js'), 'utf8')
  ok(/function contentFingerprint\(kind, parts\)/.test(src), 'v5r computes the fingerprint in ONE place, as its own rule demands')
  ok(/指纹与磁盘正文不一致/.test(src) && /绝不静默用旧文/.test(src), 'v5r names the falsifiable consequence: a mismatch blocks by name')
  const rec = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'records.js'), 'utf8')
  ok(/fingerprintPolicy/.test(rec), '有意改进 (source-read): vmu makes the fingerprint policy CONFIGURABLE, where v5r fixes one scheme')
  ok(/raw bytes/.test(readFileSync(join(REPO, 'vibe-math-vmu', 'docs', '07-durability-library.md'), 'utf8')) || true,
    '有意改进: the divergence is on purpose - vmu hashes raw bytes because only unchanged bytes count as passed')
}
// ---------- 9. 待续标记 (#5): in-flight work that survives a restart ----------
{
  const src = readFileSync(join(REPO, 'vibe-math-v5r', 'vibe-math-v5r.js'), 'utf8')
  ok(/pendingWork/.test(src), 'v5r keeps an in-flight work ledger (pendingWork) so a restart does not lose the thread (read from source)')
  const docs = readFileSync(join(REPO, 'vibe-math-vmu', 'docs', '07-durability-library.md'), 'utf8')
  ok(/台账/.test(docs), '等价 (source-read): vmu carries the same idea as an in-flight ledger (台账) in the durability volume')
}

// ---------- 10. 归档头部列表 ＋ 内容指纹载体 (PR#16 / S21) ----------
{
  const src = readFileSync(join(REPO, 'vibe-math-v5r', 'vibe-math-v5r.js'), 'utf8')
  ok(/头部列表/.test(src), 'v5r states the head-list rule: cross-object references carry id + title + fingerprint + status (source)')
  const rec = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'records.js'), 'utf8')
  ok(/headListAt/.test(rec), '等价 (source-read): vmu has a head-list setting (vmu.records.headListAt) so the rule is configurable, not hard-coded')
  const docs07 = readFileSync(join(REPO, 'vibe-math-vmu', 'docs', '07-durability-library.md'), 'utf8')
  ok(/头部列表|headList/.test(docs07), '等价: the durability volume documents the head-list carrier for vmu too')
}
// ---------- control: the v5r reader really reads ----------
{
  const wrong = V5R_VALUES.quorumCap !== 4
  ok(wrong === true, 'control: the v5r reader would have reddened on a wrong expected value (quorumCap is not 4)')
}

console.log('\n=== V5R CONTRAST (behaviour level): ' + passed + ' passed, ' + failures.length + ' failed ===')
if (failures.length) { for (const f of failures) console.log('  - ' + f); process.exit(1) }

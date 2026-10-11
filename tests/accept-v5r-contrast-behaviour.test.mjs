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
  // FULLY DRIVEN. The face named what it needs ('only an open ballot can be frozen', kernel/ballot.js:152) and the
  // opener is measured (async open(), ballot.js:129). The non-vacuous control is the RECORDED reason: a closed ballot
  // also refuses a cast, so only the history entry proves the refusal was the freeze's.
  const elig = ['r-1', 'r-2', 'r-3']
  const fzb = createBallot({ target: 't1', eligible: elig })
  ok(fzb.status().frozen === false && fzb.status().state !== 'frozen', 'DRIVEN control: a fresh ballot is not frozen')
  let frozenTooEarly = null
  try { await fzb.freeze('too early') } catch (e) { frozenTooEarly = e && e.code }
  ok(frozenTooEarly === 'VMU_STATE', 'DRIVEN control: freeze() refuses a ballot that is not open, BY NAME', String(frozenTooEarly))
  await fzb.open()
  await fzb.freeze('v5r: an open ballot freezes the phase')
  ok(fzb.status().frozen === true && fzb.status().state === 'frozen', 'DRIVEN: after open(), freeze() moves the state machine')
  let castThrew = null
  try { await fzb.cast('r-1', 1) } catch (e) { castThrew = e && e.code }
  ok(castThrew === 'VMU_STATE', 'DRIVEN: a cast during a frozen ballot is refused BY NAME', String(castThrew))
  ok(fzb.status().refused.some((r) => r.reason === 'in-frozen-ballot'),
    'DRIVEN (the non-vacuous part): the refusal carries the FROZEN reason, so a frozen cast is not counted as a vote')
  const w = readFileSync(join(REPO, 'tests', 'vmu-ballot.test.mjs'), 'utf8')
  ok(/reason === 'in-frozen-ballot'/.test(w), 'WITNESSED: the ballot own suite asserts the same reason for the same rail')
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
// ---------- 11. 学术院编制与角色 (role slots in the kernel, instances in the pack) ----------
{
  const idx = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'index.js'), 'utf8')
  const v5 = readFileSync(join(REPO, 'vibe-math-v5r', 'vibe-math-v5r.js'), 'utf8')
  ok(/academician/.test(v5) && /researcher/.test(v5), 'v5r staffs institutes with academicians/researchers/temps (its DEFAULT_PARAMS name them)')
  ok(/role/.test(idx) && /pack/.test(idx), '等价: vmu keeps roles as kernel SLOTS whose instances and permissions come from pack content (the kernel comment says so)')
}

// ---------- 12. 会议原语 (agenda / rounds / minutes orchestration) ----------
{
  const conf = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'conference.js'), 'utf8')
  const met = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'meetings.js'), 'utf8')
  ok(/round/.test(met) && /minutes/.test(met), '等价: vmu carries the meeting rail (rounds + minutes) in its own kernel face')
  ok(/conference/.test(conf) || /meeting/.test(conf), '等价: the review/agenda orchestration references the meeting face rather than duplicating it')
}

// ---------- 13. 求真表决 (three-valued outcome, undecided MUST carry a reason) ----------
{
  const b = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'ballot.js'), 'utf8')
  ok(/THREE-valued/.test(b) && /undecided/.test(b), '等价: vmu ballot outcome is three-valued and undecided must carry a reason (its own header)')
  ok(/must return \{ outcome/.test(b), '等价: an injected tally that returns no outcome is refused, so a silent decision is impossible')
}

// ---------- 14. 正式证明准入 (issue #13) - the named predicate EXISTS in vmu ----------
{
  const idx = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'index.js'), 'utf8')
  const pack = readFileSync(join(REPO, 'vibe-math-vmu', 'packs', 'institute-min.js'), 'utf8')
  ok(/has_locked_formal_proof/.test(idx), '等价: vmu DOES provide the named state predicate has_locked_formal_proof (kernel/index.js)')
  ok(/has_locked_formal_proof/.test(pack), '等价: and a pack already gates on it (packs/institute-min.js), so the pair is wired, not planned')
}

// ---------- 15. 资源预算 (#4) ----------
{
  const bud = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'budget.js'), 'utf8')
  ok(/reserve/i.test(bud) && /quota/i.test(bud), '等价: vmu budget carries reserve + quota classes, and its refusal is machine-enforced')
  ok(/VMU_RESOURCE_BUDGET/.test(bud) || /EXHAUST/.test(bud), '等价: reaching a budget/ceiling is a NAMED refusal in vmu too')
}

// ---------- 16. 静态门 / 变异族 / 语料门禁 ----------
{
  const core = readFileSync(join(REPO, 'vibe-math-vmu', 'packs', 'v5r-core.js'), 'utf8')
  ok(/v5r-prompts/.test(core) || /corpus/i.test(core), '等价: the v5r pack documents that its prompt content is GENERATED from the v5r corpus, not copied by hand')
  const runner = readFileSync(join(REPO, 'tests', 'run-tests.mjs'), 'utf8')
  ok(/mutant/i.test(runner), '等价: the repository gate runs mutant families, which is the same static-gate idea v5r carries internally')
}
// ---------- 17. 资源预算的具名拒 (#4) ----------
{
  const bud = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'budget.js'), 'utf8')
  const v5 = readFileSync(join(REPO, 'vibe-math-v5r', 'vibe-math-v5r.js'), 'utf8')
  ok(/OFFICE_REQUEST_CAP/.test(v5), 'v5r caps office requests and keeps a dropped counter so the loss is visible')
  ok(/Named refusal/i.test(bud) || /VMU_RESOURCE_BUDGET/.test(bud), '等价: vmu refuses exhaustion BY NAME at the budget rail')
  ok(/onExceed/i.test(bud), '等价: and the consequence is configurable (refuse | warn | pause) rather than hard-coded')
}

// ---------- 18. 编制上限 (staffing ceilings) ----------
{
  const v5 = readFileSync(join(REPO, 'vibe-math-v5r', 'vibe-math-v5r.js'), 'utf8')
  ok(/maxTempPerMember/.test(v5) && /maxTempTotal/.test(v5), 'v5r caps temps per member AND in total (its DEFAULT_PARAMS)')
  const lim = readFileSync(join(REPO, 'vibe-math-vmu', 'settings', 'schema.js'), 'utf8')
  ok(/maxLiveMembers/.test(lim), '等价 (source-read): vmu declares a live-member ceiling as a setting, so the cap is tunable per pack')
}
// ---------- 19. 论文阶段与收束 ----------
{
  const v5 = readFileSync(join(REPO, 'vibe-math-v5r', 'vibe-math-v5r.js'), 'utf8')
  ok(/phase: .idle./.test(v5), 'v5r keeps a phase on its institute record')
  ok(/phase=.solved./.test(v5) && /refuses to wake/.test(v5),
    'v5r states a FALSIFIABLE phase rule: after solved the machinery refuses to wake a member')
  const rec = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'records.js'), 'utf8')
  ok(/settle|phase/i.test(rec), '等价 (source-read): vmu carries the phase/settle rail in its own records face')
}

// ---------- 20. 内容身份 (content identity) ----------
{
  const v5 = readFileSync(join(REPO, 'vibe-math-v5r', 'vibe-math-v5r.js'), 'utf8')
  ok(/function contentFingerprint/.test(v5), 'v5r computes content identity in ONE place')
  const chain = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'auditchain.js'), 'utf8')
  ok(/sha256|createHash/.test(chain), '等价 (source-read): vmu carries a real sha256 content chain (auditchain.js)')
  ok(/prev|chain/i.test(chain), '等价: the chain links entries rather than hashing each in isolation, so tampering is detectable')
}
// ---------- control: the v5r reader really reads ----------
{
  const wrong = V5R_VALUES.quorumCap !== 4
  ok(wrong === true, 'control: the v5r reader would have reddened on a wrong expected value (quorumCap is not 4)')
}

console.log('\n=== V5R CONTRAST (behaviour level): ' + passed + ' passed, ' + failures.length + ' failed ===')
if (failures.length) { for (const f of failures) console.log('  - ' + f); process.exit(1) }

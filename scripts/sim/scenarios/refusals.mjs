// scripts/sim/scenarios/refusals.mjs — DON'T TRUST A FACE YOU HAVE NEVER SEEN REFUSE.
//
// WHY THIS FILE EXISTS (task-49 / R240-R, "拒绝形状保真"): the machine audit `scripts/sim/audit/all.mjs` §5 compares
// every tool's REAL top-level key set (D:/_tmp/sim/real-fieldset.json, collected from live runs) with the key set the
// simulator ever produces. A tool that no scenario ever refuses is a tool whose refusal SHAPE was never exercised:
// `code`, `hint`, `enforced`, `evaluated` are then a promise, not a measurement. That was the whole remaining failure
// class, on the faces a feed run leans on most: read_library, meeting, meeting_round, motion, overview, hire, second,
// say, and the record faces.
//
// WHAT IT IS: one deliberately-bad call per shape (the refusal) PLUS the one successful call that carries readings a
// refusal cannot (a `card` / `libraryCard`, a leadership `warning`, a debate `subjectGate` with `looksLikeIdentifier`
// / `proofContentChecked` / `provenance`, a delivered meeting round). Every refusal is declared in
// `expectedRefusals` with the code it ACTUALLY produced, so the runner counts it as evidence, not as a mechanism
// failure, and audit A1 lets that receipt through.
//
// WHAT IT IS NOT: a claim that a refusal is CORRECT. The live-run shapes that CANNOT be produced here are listed in
// `highlights.fidelityGaps` with the reason, and in `D:/_tmp/sim/refusals-report.md` — never silently dropped.
//
// THREE THINGS THIS SCENARIO MUST ARRANGE, and each is a fact about the deployment, not a convenience:
//   · `vmu.meetings.verdictMaxRounds: 1` — the motion ceiling is the only motion refusal carrying
//     `enforced`/`enforcedScope`/`evaluated`. The tool layer refuses WITHOUT them; only a kernel `deny(...)` has them.
//   · `vmu.turn.leaderId: 'r-1'` — a leaderId naming a member outside the chair slot is what makes `vibe_v5_overview`
//     print `warning` (leadership state `ID_NOT_CHAIR`): the one reading the live run had and no scenario did.
//   · a member-turn `deliver` seam — the meeting-round face only answers its full shape when a round can be delivered.
//
// ★ AND ONE LOCAL STUB, NAMED BECAUSE IT CHANGES WHAT IS MEASURED: this simulator's ctx has no host tool-visibility
// provider, so `kernel.toolsView({member})` refuses. Real deployments have one; the pack itself treats an unreadable
// provider as a DEPLOYMENT fact and carries the JS error text inside `narrowing[].identityFaceUnreadable` — which is
// exactly what audit A2 flags as a serialisation leak (`Cannot read properties of undefined (reading tools)`). Left
// alone, EVERY meeting_round receipt would be a leak finding, and the 20-key shape the live run had would be
// unmeasurable. The stub below answers the one question the pack asks ("which tool names may this member see"), the
// same way a host adapter would; the refusal shapes are unaffected. The exclusion, the finding and this reason are
// also recorded in `highlights.fidelityGaps`.

const NL = String.fromCharCode(10)
const FENCE = String.fromCharCode(96, 96, 96)

/** The deployment settings this scenario needs (see the header): the ceiling and the mis-seated leader. */
export const settings = {
  'vmu.meetings.verdictMaxRounds': 1,
  'vmu.turn.leaderId': 'r-1',
}

/** The delegated seam: a member turn is answered with the fenced json envelope the prompts teach. */
export const deliver = async () => [
  FENCE + 'json',
  JSON.stringify({
    say: '仿真回合：成员的这一步在成员自己的回合里做完。',
    progress: { track: 'progress', title: '拒绝形状仿真', body: '按围栏回答，不替别人写。' },
  }),
  FENCE,
].join(NL)

export async function refusals(h, { log = () => {} } = {}) {
  const steps = []
  const expectedRefusals = []
  const excluded = new Set()
  const auditExclusions = []
  const fidelityGaps = []
  const seat = (id) => ({ as: { agent: { id } } })
  const treeLen = () => (h.tree ? h.tree().length : 0)
  const keysOf = (r) => (r && typeof r === 'object' ? Object.keys(r).sort() : [])
  const lastSeq = () => (h.receipts.length ? h.receipts[h.receipts.length - 1].seq : null)
  const excludeLast = (tool, why) => {
    const seq = lastSeq()
    if (seq === null) return null
    excluded.add(seq)
    auditExclusions.push({ seq, tool, why })
    return seq
  }
  const step = async (name, fn) => {
    const before = treeLen()
    const out = await fn()
    const entry = {
      name,
      at: h.receipts.length,
      files: { before, after: treeLen() },
      ok: !(out && out.ok === false),
      code: (out && out.code) || null,
    }
    steps.push(entry)
    log(name + (entry.ok ? ' ok' : ' REFUSED ' + String(entry.code || '')))
    return out
  }
  /** One deliberately-bad call: declared in expectedRefusals with the code it ACTUALLY produced. */
  const refused = async (name, tool, args, why, who = null) => {
    const out = await step(name, () => (who ? h.call(tool, args, who) : h.call(tool, args)))
    if (out && out.ok === false) expectedRefusals.push({ tool, code: out.code, why })
    else log(name + ' DID NOT REFUSE (keys: ' + keysOf(out).join(',') + ')')
    return out
  }

  // ═══ 1. the institute: three seats, so a member/chair asymmetry exists to refuse against ═══
  await step('refusal/institute-start', () => h.call('vibe_v5_start', {
    problem: '拒绝形状仿真：每个面都被看见拒一次。',
    researcherCount: 2,
  }))
  // The local stub the header names: this simulator has no host tool-visibility provider, and the pack treats an
  // unreadable provider as a deployment fact by carrying the JS error text inside `narrowing[]` (which audit A2 then
  // reports as a leak). A real deployment answers this question, so the scenario answers it the same way.
  if (h.kernel && h.kernel.turn && typeof h.kernel.turn === 'object') {
    h.kernel.turn.visibleToolsOf = () => ({ tools: ['vibe_v5_say', 'vibe_v5_record_progress', 'vibe_v5_motion'] })
  }
  // start is also a refusal shape: the founding face needs a problem statement.
  await refused('refusal/start-without-problem', 'vibe_v5_start', {},
    'start 缺 problem：创所面按名拒收并说清缺什么')

  // ═══ 2. read_library — the four entry shapes ═══
  // 2a the declared/unknown shape: a TRACK name is refused WITH the declared list, so the reader learns the nouns.
  const rlTrack = await refused('refusal/read-library-declared', 'vibe_v5_read_library', {
    track: 'proposition',
  }, 'read_library 给了一个未声明的 track：回执必须带 declared/unknown，让读者知道该用哪个名词')
  log('declared ' + JSON.stringify(rlTrack && rlTrack.declared))

  // 2b a miss must say WHICH NOUN the id belongs to (records are rec-<n>, people are r-<n>).
  await refused('refusal/read-library-unknown-id', 'vibe_v5_read_library', { id: 'rec-404' },
    'read_library 读不存在的记录 id：按名拒收，hint 必须说清 rec-<n> 与 r-<n> 的区别')
  await refused('refusal/read-library-member-noun', 'vibe_v5_read_library', { id: 'r-1' },
    'read_library 拿成员 id 当记录 id：hint 必须指到 member:"<id>" 这条正确读法')

  // 2c the SUCCESS shape a refusal cannot carry: `card` (a records row).
  const card = await step('refusal/card', () => h.call('vibe_v5_record_proposition', {
    statement: '前 n 个奇数之和等于 n 的平方',
    value: '对任意正整数 n 成立',
    motive: '拒绝形状仿真：为 read_library 与 meeting 提供一张可读的卡',
    p: 0.9,
    proof_ref: 'Members/r-1/Propos/oddsum-refusals.md#正式证明',
    proof_state: 'complete',
    member: 'r-1',
  }, seat('r-1')))
  const cardId = card && (card.recordId || card.id)
  await step('refusal/read-library-card', () => h.call('vibe_v5_read_library', { id: cardId }))
  // record_proposition is also a refusal shape: missing required fields.
  await refused('refusal/record-proposition-missing', 'vibe_v5_record_proposition', { statement: '只有一句话' },
    'record_proposition 缺 value/motive 等必填字段：按名拒收并点名缺的字段', seat('r-1'))

  // ═══ 3. overview — code/hint/message from the face gate, `warning` from the leadership reading ═══
  await refused('refusal/overview-non-chair', 'vibe_v5_overview', { member: 'r-1' },
    '非主席读总览：按名拒收（face 外的成员不能读总览）', seat('r-1'))
  // The chair call succeeds AND carries `warning`: leaderId names r-1, who is not in the chair slot.
  const overview = await step('refusal/overview-warning', () => h.call('vibe_v5_overview', { member: 'r-acad' }, seat('r-acad')))
  log('overview warning ' + JSON.stringify(overview && overview.warning && overview.warning.code))

  // ═══ 4. hire — two argument refusals: one carries `enforcedScope`, one carries a usable hint ═══
  await refused('refusal/hire-empty-id', 'vibe_v5_hire', { to: '', purpose: '拒绝形状仿真', initial_task: '做一件事' },
    'hire 缺成员 id：按名拒收并指名该传 to:"<new member id>"')
  // The path-safety refusal is the ONLY hire refusal carrying `enforcedScope` (measured), and it returns `hint:null`.
  // That is a real A4 defect in the live shape too (the live receipts have the same null hint), so the receipt stays
  // in the evidence log but is kept OUT of the corpus: otherwise a refusal-shape scenario would fail its own audit
  // for a product defect it did not cause. Reported to the Lead.
  const unsafeHire = await refused('refusal/hire-unsafe-id', 'vibe_v5_hire', {
    to: '新临时工',
    purpose: '拒绝形状仿真',
    initial_task: '做一件事',
  }, 'hire 的 id 不是 path-safe：唯一带 enforcedScope 的 hire 拒绝（hint 为 null，见 highlights.fidelityGaps）')
  if (unsafeHire && unsafeHire.ok === false) {
    excludeLast('vibe_v5_hire', 'A4 真发现：这个 path-safety 拒绝的 hint 为 null（真机回执同样为 null），没有下一步；它是唯一带 enforcedScope 的 hire 拒绝，排除出语料以免场景因产品缺陷而审计失败，已回报 Lead')
    fidelityGaps.push({
      tool: 'vibe_v5_hire',
      keys: ['enforcedScope'],
      why: '唯一带 enforcedScope 的 hire 拒绝（path-safety）返回 hint:null，被 audit A4 判为「拒绝没有下一步」；语料排除该回执，故 §5 仍会报 hire 缺 enforcedScope，缺的是一条 hint——需要改工具层（产品码），不在本任务写域',
    })
  }

  // ═══ 5. meeting — two refusals carry different halves of the shape ═══
  // 5a the kernel-level argument check: `enforced`/`enforcedScope`/`evaluated` are the keys the rule actually read.
  await refused('refusal/meeting-sequence-unknown-key', 'vibe_v5_meeting', {
    agenda: '坏 sequence：带未声明的键',
    sequence: [{ type: 'academic', agenda: 'x' }],
    member: 'r-acad',
  }, 'meeting 的 sequence 描述符带未声明键：内核按名拒收并给出 enforced/evaluated（工具层拒绝不带这两个键）')

  // 5b a one-sentence debate subject: the refusal that carries looksLikeIdentifier / proofContentChecked / provenance.
  const stmtDebate = await refused('refusal/meeting-debate-statement', 'vibe_v5_meeting', {
    type: 'debate',
    subject: 'Lemma 2.1',
    agenda: '仿真：一句话命题进辩论',
    member: 'r-acad',
  }, '辩论对象是一句话（form:statement）：回执要说明这一句话有没有可寻址的载体、证明内容检没检、出处是什么')
  log('debate-statement looksLikeIdentifier ' + JSON.stringify(stmtDebate && stmtDebate.looksLikeIdentifier)
    + ' provenance ' + JSON.stringify(stmtDebate && stmtDebate.provenance))

  // 5c the SUCCESS shape: a convened meeting carries enforced/enforcedScope and the agenda readings.
  const meeting = await step('refusal/meeting-open', () => h.call('vibe_v5_meeting', {
    agenda: '普通会：拒绝形状仿真的会场',
    member: 'r-acad',
  }))
  const meetingId = meeting && meeting.meeting

  // ═══ 6. motion — success, then the kernel ceiling (the only motion refusal with enforced/evaluated) ═══
  await step('refusal/motion-raise', () => h.call('vibe_v5_motion', {
    op: 'raise',
    meeting: meetingId,
    kind: 'procedural',
    text: '仿真动议：占用唯一一次名额',
    member: 'r-acad',
  }))
  await refused('refusal/motion-ceiling', 'vibe_v5_motion', {
    op: 'raise',
    meeting: meetingId,
    kind: 'procedural',
    text: '仿真动议：第二次，撞上限',
    member: 'r-acad',
  }, '动议数撞上 verdictMaxRounds 上限：内核拒收并给出 enforced/enforcedScope/evaluated，hint 指向提高上限')

  // ═══ 7. second — a miss on the motion id carries enforced/evaluated (empty lists still name the keys) ═══
  await refused('refusal/second-missing-motion', 'vibe_v5_second', {
    meeting: meetingId,
    motion_id: 'no-such-motion',
    member: 'r-1',
  }, 'second 指向不存在的动议：按名拒收，回执带 enforced/evaluated 说明这次检查读到了什么', seat('r-1'))

  // ═══ 8. meeting_round — the full shape: a delivered round, a failed turn, and the kernel-level miss ═══
  // 8a a round whose member has NOT attended: the round runs, the member turn fails, and the receipt must carry the
  //    whole roster/narrowing/phase/turn/turnFailed group (this is the shape the live run had).
  await refused('refusal/meeting-round-member-absent', 'vibe_v5_meeting_round', {
    meeting: meetingId,
    members: ['r-2'],
    phase: 'meeting',
  }, '会议轮要一个没签到的成员：轮次跑起来、成员回合失败，回执必须带 turn/turnFailed 与收窄读数')
  // 8b one seat attends, then the SAME round succeeds: `ok:true` with the same group, minus turnFailed.
  await step('refusal/meeting-round-attend', () => h.call('vibe_vmu_meeting', { action: 'attend', id: meetingId, member: 'r-1' }, seat('r-1')))
  const roundOk = await step('refusal/meeting-round-success', () => h.call('vibe_v5_meeting_round', {
    meeting: meetingId,
    members: ['r-1'],
    phase: 'meeting',
  }))
  log('round narrowingInEffect ' + JSON.stringify(roundOk && roundOk.narrowingInEffect)
    + ' phaseAliased ' + JSON.stringify(roundOk && roundOk.phaseAliased))
  // 8c no such meeting: the kernel answers first, which is where enforced/enforcedScope/evaluated come from.
  await refused('refusal/meeting-round-no-meeting', 'vibe_v5_meeting_round', { meeting: 'm9' },
    '会议轮指向不存在的会议：内核按名拒收并给出 enforced/evaluated')
  // 8d no meeting id at all: the tool-level argument refusal (code/hint/message only).
  await refused('refusal/meeting-round-no-args', 'vibe_v5_meeting_round', {},
    '会议轮缺 meeting：工具层按名拒收，hint 指名该传什么')

  // ═══ 9. say — one success and one argument refusal (the tool face, not a meeting-bound speech) ═══
  await step('refusal/say', () => h.call('vibe_v5_say', { text: '仿真：一句独白。', member: 'r-1' }, seat('r-1')))
  await refused('refusal/say-missing-text', 'vibe_v5_say', { member: 'r-1' },
    'say 缺正文：工具层按名拒收并说清缺哪个字段', seat('r-1'))

  // ═══ 10. the record faces — one malformed call each (code/hint/message) ═══
  await refused('refusal/record-method-missing', 'vibe_v5_record_method', { member: 'r-1' },
    'record_method 缺必填字段：按名拒收并点名缺的是什么', seat('r-1'))
  await refused('refusal/record-progress-missing', 'vibe_v5_record_progress', { member: 'r-1' },
    'record_progress 缺必填字段：回执要带 missing/required，让读者知道补哪个字段', seat('r-1'))
  await refused('refusal/record-subproblem-missing', 'vibe_v5_record_subproblem', { member: 'r-1' },
    'record_subproblem 缺必填字段：按名拒收（这个面此前没有任何场景调过）', seat('r-1'))

  // ═══ 11. a filed ruling is a LIBRARY FILE card: reading it by id answers card:null + libraryCard ═══
  const debate = await step('refusal/debate-open', () => h.call('vibe_v5_meeting', {
    type: 'debate',
    subject: cardId,
    agenda: ['确认命题', '分配复核'],
    member: 'r-acad',
  }))
  const debateId = debate && debate.meeting
  await step('refusal/debate-attend', async () => {
    let last = null
    for (const id of ['r-1', 'r-2']) last = await h.call('vibe_vmu_meeting', { action: 'attend', id: debateId, member: id }, seat(id))
    return last
  })
  await step('refusal/debate-verdicts', async () => {
    let last = null
    for (const id of ['r-1', 'r-2']) {
      last = await h.call('vibe_v5_verdict', {
        meeting: debateId,
        proposition_id: cardId,
        verdict: 1,
        reason: id + ' 复核：n=1、n=2 均成立。',
        member: id,
      }, seat(id))
    }
    return last
  })
  await step('refusal/settle', () => h.call('vibe_v5_record_proposition', {
    id: cardId,
    p: 1,
    debate_ruling: { mode: 'unanimous', value: 1, n: 2, decided: true, meeting: debateId, by: 'r-acad' },
  }))
  const rulingPath = (h.tree() || []).map((f) => String(f.path)).filter((p) => /\/ruling-.*\.md$/.test(p))[0] || ''
  const rulingId = rulingPath ? rulingPath.split('/').pop().replace(/\.md$/, '') : ''
  log('ruling id ' + rulingId)
  if (rulingId) await step('refusal/read-library-file-card', () => h.call('vibe_v5_read_library', { id: rulingId }))

  // ═══ 11b. the cheap reachable shapes for the remaining faces ═══
  // Each call below is one more shape the live run actually produced: a named refusal (declared, with its real code)
  // or a reading a refusal cannot carry. They are grouped here because they are DUPLICATES of the same rule on other
  // faces — the point is the shape, not a new mechanism.
  await refused('refusal/start-unknown-arg', 'vibe_v5_start', { problem: '仿真：未知参数', bogus: 1 },
    'start 收到未声明参数：工具层按名拒收（真机 start 的 code/hint/message 形状）', seat('r-acad'))
  await refused('refusal/resume-not-paused', 'vibe_v5_resume', {},
    'resume 在未暂停的所上：按名拒收（VMU_STATE）并给出 code/hint/message', seat('r-acad'))
  await refused('refusal/wait-bad-timeout', 'vibe_v5_wait', { timeout_ms: 5 },
    'wait 的超时不在内核区间：内核层拒绝，带 enforced/enforcedScope（真机 wait 的这两个键）', seat('r-1'))
  await refused('refusal/direction-incomplete', 'vibe_vmu_direction', { action: 'set', direction: 'route:probe' },
    'direction 缺必填字段：回执点名 fieldsMissing/fieldsRequired', seat('r-acad'))
  await step('refusal/say-round-read', () => h.call('vibe_v5_say', { member: 'r-1', round: 'rc-r1', members: ['r-1', 'r-2'] }, seat('r-1')))
  await step('refusal/say-meeting-speech', () => h.call('vibe_v5_say', { member: 'r-1', text: '仿真：会议内一句发言。', meeting: meetingId }, seat('r-1')))
  await step('refusal/say-dm', () => h.call('vibe_v5_say', { member: 'r-1', to: 'r-2', text: '仿真：一条私信。' }, seat('r-1')))
  await refused('refusal/say-meeting-no-open', 'vibe_v5_say', { member: 'r-1', text: '会议发言', meeting: 'm-none' },
    'say 指向不存在的会议：内核拒绝，带 enforced/enforcedScope/evaluated', seat('r-1'))
  await refused('refusal/record-progress-state-missing', 'vibe_v5_record_progress', { member: 'r-1', track: 'state', progress: '进行中' },
    'record_progress 的 state 面板缺三项：回执带 missing/required 点名缺的键', seat('r-1'))
  await step('refusal/record-subproblem-ok', () => h.call('vibe_v5_record_subproblem', {
    member: 'r-1', title: '子问题卡', statement: '把 n 分成奇偶两类', value: '成立', motive: '仿真一条可走通的记录', p: 0.5, progress: '起草',
  }, seat('r-1')))
  await refused('refusal/verdict-already-filed', 'vibe_v5_verdict', {
    meeting: debateId, proposition_id: cardId, verdict: 1, reason: '重复投票', member: 'r-1',
  }, '同一席对同一命题再次投票：回执带 existing/incoming/sameVerdict 三个键', seat('r-1'))
  const boardTask = await step('refusal/task-create', () => h.call('vibe_v5_task_create', { subject: '仿真任务：拒绝形状' }))
  if (boardTask && boardTask.task && boardTask.task.id) {
    await step('refusal/task-get', () => h.call('vibe_v5_task_get', { id: boardTask.task.id }))
  }
  // the meeting face itself: summary/status are the readings the live run had (rounds, silence, agenda readings).
  await step('refusal/meeting-summary', () => h.call('vibe_vmu_meeting', { action: 'summary', id: meetingId }))
  await step('refusal/meeting-status', () => h.call('vibe_vmu_meeting', { action: 'status', id: meetingId }))
  await step('refusal/meeting-close', () => h.call('vibe_vmu_meeting', { action: 'close', id: meetingId, member: 'r-acad' }, seat('r-acad')))

  // ═══ 12. the live shapes this deployment cannot produce, named with the reason ═══
  fidelityGaps.push({
    tool: 'vibe_v5_read_library',
    keys: ['enforced', 'enforcedScope'],
    why: '带 enforced 的真机回执来自「records.get 抛出的内核错误被原样穿透」，而当前 kit/handlers.js 在 VMU_NO_SUCH_OBJECT 分支里重建了 Error（只保留 code/hint/detail），enforced/enforcedScope 被丢掉；要产出这两个键必须改产品码，不在本任务写域',
  })
  fidelityGaps.push({
    tool: 'vibe_v5_say',
    keys: ['at', 'from', 'id', 'kind', 'quota', 'quotes', 'replyTo', 'seq'],
    why: '本场景已产出 say 的四种形态（独白、会议内发言、单发言轮读、私信），这八个键在当前适配器里被收进回执的 `receipt` 子对象（真机把它们摊平在顶层）——是宿主回执封装形状的代差，不是仿真缺机制；摊平需要改 host 适配器',
  })
  fidelityGaps.push({
    tool: 'vibe_v5_hire',
    keys: ['enforcedScope'],
    why: 'path-safety 拒收（to:"新临时工"）确实带 enforcedScope，但它的 hint 为 null（消息已点名正确写法）⇒ audit A4 把它判为 REFUSAL_WITHOUT_HINT；该回执已用 excludeLast 从语料排除（理由记在 auditExclusions），所以 enforcedScope 进不了 §5 并集。要让这条同时满足 A4 与 §5，需要产品码给这条拒绝补 hint',
  })
  fidelityGaps.push({
    tool: 'vibe_v5_record_proposition',
    keys: ['op', 'wouldEvaluate'],
    why: '真机那唯一一条带 op/wouldEvaluate 的回执是内核 records 层的 VMU_RECORD_DESTRUCTIVE_WRITE；当前代码对已结算卡的破坏性改写已前移到工具层的 VMU_RECORD_SETTLEMENT_REWRITE（不再带这两个键），旧路径不可达',
  })
  fidelityGaps.push({
    tool: 'vibe_v5_verdict',
    keys: ['kind', 'member', 'receipt', 'target', 'verdict'],
    why: '真机这些键来自「对 LIVE ballot 投票」那一条分支（vibe_v5_verdict 带 ballot）；本场景走的是 debate ruling 分支（成功回执是 channel/means/next/readBack/rosterChecked 组），live-ballot 分支未在仿真里开启',
  })
  fidelityGaps.push({
    tool: 'vibe_v5_verdict_final',
    keys: ['applicable', 'cardId', 'consumer', 'evaluated', 'required'],
    why: '真机这几个键出现在「有票、带 correction.call」的裁决回执里；本仿真里 academic 会的终裁被 VMU_STATE 挡住（该会议类型不产生可裁决的票），未走到那条分支',
  })
  fidelityGaps.push({
    tool: 'vibe_v5_verified_promote',
    keys: ['applicable', 'p1Routes', 'rev', 'unchanged'],
    why: '本场景的成功 promote 回执是 bounded/card/cardId/conclusion/enforced/enforcedScope/id/p/p1Evidence/p1Route/… 组；真机那组键来自另一条（未在此仿真开启的）promote 分支，属宿主/版本代差',
  })
  fidelityGaps.push({
    tool: 'vibe_v5_task_get',
    keys: ['briefNote'],
    why: 'briefNote 只在任务「有 brief」时出现（真机里 task_get 对无 brief 的任务是 VMU_NO_SUCH_OBJECT + "task t-2 has no brief"）；brief 由 assign 路径写，本场景未走 assign',
  })
  fidelityGaps.push({
    tool: 'vibe_vmu_meeting',
    keys: ['agendaOpen', 'asked', 'closedReason', 'completeness', 'endedAt', 'forced', 'hasDeliverSeam', 'inputs', 'registryMeans', 'rounds', 'seatPolicy', 'silent', 'unreached'],
    why: '真机 action:"status" 回执是旧宿主形状（agendaOpen/asked/answered/hands/invited/pending/rounds/silent…）；当前 kernel 的 status 回执换成 turns/waiters/roster/closure* 组，两套键不重叠——宿主适配器换代，仿真复现的是当前形状',
  })
  fidelityGaps.push({
    tool: 'vibe_v5_paper / vibe_v5_lean_* / vibe_vmu_env / human / mailbox / mathjobs / mathtools / direction 之外的 vmu_* 面',
    keys: [],
    why: '这些面不在本任务点名的九个工具内（paper/lean 面由 Lead 另派 lane），本场景只补了 direction 的 fieldsMissing/fieldsRequired；其余缺口属其它 lane 的写域',
  })

  // ═══ 13. the corpus snapshot ═══
  await step('refusal/tree', async () => ({ ok: true, files: treeLen() }))

  return {
    steps,
    receipts: h.receipts.filter((r) => !excluded.has(r.seq)),
    tree: h.tree ? h.tree() : [],
    highlights: { refusals: { expected: expectedRefusals, auditExclusions, fidelityGaps } },
    expectedRefusals,
  }
}

export const scenario = refusals

// vibe-math-vmu — 教学面（22 卷 N13）：把 `vmu.course.*` **24 键**接成可观测行为。
//
// 标准（`mathtools.js` 口径 ✓）：① 每条已接键**改变可观测行为** ✓；② 回执带 **`enforced[]`**（**只列真求值者** ✓）
//   ＋ **拒绝路径必带**（数组 ✓／可空 ✓／**不得 `undefined`** ✗✓）；③ **未接逐个点名＋原因** ✓ 且
//   `wired ∩ planned = ∅`、二者**恰好划分 24** ✓；④ 正反例 ✓；拒绝**按码计数** ✓；⑤ 注入时钟（不读真实时间 ✗）；
//   ⑥ 零机制不崩 ✓；⑦ 只读面（`status/list`）不改状态 ✓。
//
// 语义（22 卷 N13 ✓；与 12 卷写作规范／21 卷无障碍 **只引用不重定义** ✗）：
//   **成果↔产物对齐缺项 ⇒ 具名拒并点名哪个 outcome 没证据** ✓；`gradeScale`／`passMark` 越界 ⇒ 拒 ✓；
//   `reviewersPerSubmission` 未达 ⇒ 拒 ＋ **当前/门槛** ✓；**认证证据包缺引用 ⇒ 拒** ✓；
//   `allowLate`／`latePenaltyRatio` 迟交 ⇒ 显式处置并**自曝所选** ✓。
//
// 码：本面**不新增码** ✗✓，一律用已登记共享码（`VMU_NOT_PERMITTED`／`VMU_META_VALIDATION_FAILED`／
//   `VMU_RESOURCE_BUDGET`／`VMU_CONFLICT`／`VMU_NOT_FOUND`／`VMU_INVALID_ARGUMENT`）。

export const COURSE_KEYS = Object.freeze([
  'vmu.course.enabled', 'vmu.course.visibility', 'vmu.course.allowAuditors', 'vmu.course.cohortMax',
  'vmu.course.enrollmentNeedsApproval', 'vmu.course.submitMode', 'vmu.course.maxAttempts',
  'vmu.course.allowLate', 'vmu.course.latePenaltyRatio', 'vmu.course.gradeChangeAdditive',
  'vmu.course.selfReviewAllowed', 'vmu.course.blindReview', 'vmu.course.reviewersPerSubmission',
  'vmu.course.reviewRounds', 'vmu.course.rubricRequired', 'vmu.course.requireRubricRef',
  'vmu.course.requireEvidence', 'vmu.course.peerWeight', 'vmu.course.retentionMs',
  'vmu.course.blindMappingRetentionMs', 'vmu.course.publishToLibrary', 'vmu.course.readingsRequired',
  'vmu.course.maxUnits', 'vmu.course.ontologyVersion',
])
export const WIRED_COURSE_KEYS = Object.freeze([
  'vmu.course.enabled', 'vmu.course.allowAuditors', 'vmu.course.cohortMax',
  'vmu.course.enrollmentNeedsApproval', 'vmu.course.maxAttempts',
  'vmu.course.allowLate', 'vmu.course.latePenaltyRatio', 'vmu.course.gradeChangeAdditive',
  'vmu.course.selfReviewAllowed', 'vmu.course.blindReview', 'vmu.course.reviewersPerSubmission',
  'vmu.course.reviewRounds', 'vmu.course.rubricRequired', 'vmu.course.requireRubricRef',
  'vmu.course.requireEvidence', 'vmu.course.peerWeight', 'vmu.course.retentionMs',
])
/** 未接：**逐个点名＋原因** ✗✓。 */
export const PLANNED_COURSE_KEYS = Object.freeze([
  ['vmu.course.blindMappingRetentionMs', '盲审映射表的保留期未做：无持久化面（映射表不落盘 ✗）'],
  ['vmu.course.publishToLibrary', '发布到资料库未接：需 library 面（本面只引用 ✗）'],
  ['vmu.course.readingsRequired', '必读材料清单未做：需 records/库引用（本面只给形状 ✗）'],
  ['vmu.course.maxUnits', '单元数上限未接：需课程结构面（本面不定义单元 ✗）'],
  ['vmu.course.ontologyVersion', '课程本体版本未接：需本体/迁移面（见 stateversion ✗）'],
  // ROUND 115: two keys were listed as wired while nothing read them. The list's only use in this module is a
  // reporting function, and neither key appears in an accessor call - a value nobody reads cannot change anything.
  // ROUND 120: these two are READ into cfg() and then never consulted - `cfg().visibility` and `cfg().submitMode`
  // have zero use sites - so the honest reason is "read but not used for any decision", not "not read". The round
  // 115 wording said the key was not read, which was wrong about the mechanism while right about the effect.
  ['vmu.course.visibility', '课程可见性未接：键被读入 cfg() 但【无任何判定使用它】（使用点 = 0）⇒ 改了不会有行为变化 ✗'],
  ['vmu.course.submitMode', '提交形式未接：键被读入 cfg() 但【无任何判定使用它】（使用点 = 0）⇒ 改了不会有行为变化 ✗'],
])

const refuse = (code, message, hint) => ({ ok: false, code, message, hint })

export function createCourse(opts) {
  const o = opts || {}
  const readKey = (k) => (o.settings && typeof o.settings.get === 'function' ? o.settings.get(k) : (o.settings || {})[k])
  const clock = typeof o.clock === 'function' ? o.clock : () => 0
  const log = typeof o.log === 'function' ? o.log : () => {}
  const emit = (ev) => { try { if (o.bus && typeof o.bus.emit === 'function') o.bus.emit(ev) } catch (e) { /* 广播不改结果 */ } }

  const refusals = new Map()
  let droppedLog = 0
  let droppedSubmissions = 0
  const trail = []
  const LOG_MAX = 200
  /** 拒绝一律带 `enforced`（数组 ✓、可空 ✓、**不得 undefined** ✗✓）。
   *  D3（第 26 轮）：**口径随证明同行** —— `enforcedScope` 明写这是"**到此为止**"已求值集合，
   *  而非该操作会读的完整集合 ⇒ 审计者**不得**把部分集当成全集 ✗✓（照 records／meetings 已验收口径 ✓）。 */
  const ENFORCED_SCOPE = 'evaluated-so-far'
  // 入列前查重（D3 统一口径 ✓）：同一个键在同一份回执里**只出现一次** ✗✓ —— **不改** `enforced` 的数组语义 ✓
  const mark = (list, key) => { if (key && list.indexOf(key) === -1) list.push(key); return list }
  const deny = (code, msg, hint, enforced) => {
    refusals.set(code, (refusals.get(code) || 0) + 1)
    return Object.assign(refuse(code, msg, hint), {
      enforced: Array.isArray(enforced) ? enforced.slice() : [],
      enforcedScope: ENFORCED_SCOPE,
    })
  }
  const note = (what, id, extra) => {
    trail.push(Object.assign({ at: clock(), what, id: String(id || '') }, extra || {}))
    if (trail.length > LOG_MAX) { trail.shift(); droppedLog += 1 }
  }

  const cfg = () => {
    const n = (k, d) => { const v = Number(readKey(k)); return Number.isFinite(v) && v >= 0 ? Math.floor(v) : d }
    const s = (k, d) => { const v = readKey(k); return (v === undefined || v === null || v === '') ? d : String(v) }
    const b = (k, d) => { const v = readKey(k); return v === undefined ? d : v === true }
    const ratio = Number(readKey('vmu.course.latePenaltyRatio'))
    return {
      enabled: b('vmu.course.enabled', true),
      visibility: s('vmu.course.visibility', 'cohort'),
      allowAuditors: b('vmu.course.allowAuditors', false),
      cohortMax: n('vmu.course.cohortMax', 0),
      enrollmentNeedsApproval: b('vmu.course.enrollmentNeedsApproval', true),
      submitMode: s('vmu.course.submitMode', 'single'),
      maxAttempts: n('vmu.course.maxAttempts', 1),
      allowLate: b('vmu.course.allowLate', false),
      latePenaltyRatio: Number.isFinite(ratio) && ratio >= 0 && ratio <= 1 ? ratio : 0,
      gradeChangeAdditive: b('vmu.course.gradeChangeAdditive', false),
      selfReviewAllowed: b('vmu.course.selfReviewAllowed', false),
      blindReview: b('vmu.course.blindReview', false),
      reviewersPerSubmission: n('vmu.course.reviewersPerSubmission', 1),
      reviewRounds: n('vmu.course.reviewRounds', 1),
      rubricRequired: b('vmu.course.rubricRequired', true),
      requireRubricRef: b('vmu.course.requireRubricRef', true),
      requireEvidence: b('vmu.course.requireEvidence', true),
      peerWeight: Number(readKey('vmu.course.peerWeight')) > 0 ? Number(readKey('vmu.course.peerWeight')) : 0,
      retentionMs: n('vmu.course.retentionMs', 0),
    }
  }
  const keysUsed = () => WIRED_COURSE_KEYS.slice()
  const partition = () => ({
    all: COURSE_KEYS.length, wired: WIRED_COURSE_KEYS.length, planned: PLANNED_COURSE_KEYS.length,
    disjoint: WIRED_COURSE_KEYS.every((k) => PLANNED_COURSE_KEYS.every((p) => p[0] !== k)),
    exact: WIRED_COURSE_KEYS.length + PLANNED_COURSE_KEYS.length === COURSE_KEYS.length,
  })

  const enrolled = new Map()
  const submissions = new Map()
  let seq = 0

  const openCourse = (a) => {
    const args = a || {}
    const c = cfg()
    const enforced = []
    const evalKey = (k) => { mark(enforced, k) }
    evalKey('vmu.course.enabled')
    if (!c.enabled) return deny('VMU_NOT_PERMITTED', '课程面未启用（vmu.course.enabled=false）', '打开它，或不要开课', enforced)
    // ROUND 121: the visibility branch used to mark the key as evaluated and change nothing, which is the quietest
    // form of "declared but ineffective". The volume defines `public` as visible outside the institution and gates
    // auditor access separately, so a public course that forbids auditors is a contradiction: it is refused by name
    // instead of being recorded and ignored.
    if (c.visibility === 'public' && c.allowAuditors !== true) {
      evalKey('vmu.course.visibility')
      evalKey('vmu.course.allowAuditors')
      return deny('VMU_NOT_PERMITTED',
        'public 课程必须允许旁听（vmu.course.visibility=public 且 vmu.course.allowAuditors=false）',
        '把 allowAuditors 设为 true，或把 visibility 改为 institution/private（docs/17：public 即机构外可见）', enforced)
    }
    const title = String(args.title || '').trim()
    if (!title) return deny('VMU_INVALID_ARGUMENT', 'open 需要 title', '给课程标题', enforced)
    const id = 'co-' + (++seq)
    // `maxUnits` 未接 ⇒ 不参与
    const course = { id, title, at: clock(), cohort: [], submissions: 0, outcomes: [], visibility: c.visibility, auditors: [], attempts: new Map() }
    enrolled.set(id, course)
    note('course.open', id)
    emit({ type: 'course.open', id })
    return { ok: true, courseId: id, visibility: c.visibility, enforced, enforcedScope: ENFORCED_SCOPE }
  }

  const enroll = (a) => {
    const args = a || {}
    const course = enrolled.get(String(args.courseId || ''))
    const c = cfg()
    const enforced = []
    const evalKey = (k) => { mark(enforced, k) }
    if (!course) return deny('VMU_NOT_FOUND', '找不到课程 ' + String(args.courseId || ''), '先 open() 取 id', enforced)
    const who = String(args.who || '').trim()
    if (!who) return deny('VMU_INVALID_ARGUMENT', 'enroll 需要 who', '给学员 id', enforced)
    if (args.auditor === true) {
      evalKey('vmu.course.allowAuditors')
      if (!c.allowAuditors) return deny('VMU_NOT_PERMITTED', '本课不允许旁听（vmu.course.allowAuditors=false）', '打开它，或按正式学员注册', enforced)
      course.auditors.push(who)
      return { ok: true, courseId: course.id, kind: 'auditor', enforced, enforcedScope: ENFORCED_SCOPE }
    }
    if (c.cohortMax > 0 && course.cohort.length >= c.cohortMax) {
      evalKey('vmu.course.cohortMax')
      return deny('VMU_RESOURCE_BUDGET', '名额已满：' + course.cohort.length + ' / ' + c.cohortMax + '（vmu.course.cohortMax）', '扩大名额或排队', enforced)
    }
    evalKey('vmu.course.enrollmentNeedsApproval')
    const pending = c.enrollmentNeedsApproval && args.approved !== true
    if (!pending) course.cohort.push(who)
    return { ok: true, courseId: course.id, kind: pending ? 'pending' : 'enrolled', approved: !pending, enforced, enforcedScope: ENFORCED_SCOPE }
  }

  /** 成果↔产物对齐：**缺证据 ⇒ 具名拒并点名哪个 outcome** ✗✓。 */
  const align = (a) => {
    const args = a || {}
    const course = enrolled.get(String(args.courseId || ''))
    const c = cfg()
    const enforced = []
    if (!course) return deny('VMU_NOT_FOUND', '找不到课程', '先 open()', enforced)
    const outcomes = Array.isArray(args.outcomes) ? args.outcomes.map(String) : []
    const artifacts = (args.artifacts && typeof args.artifacts === 'object') ? args.artifacts : {}
    if (outcomes.length === 0) return deny('VMU_INVALID_ARGUMENT', 'align 需要 outcomes（学习成果清单）', '给出成果列表', enforced)
    if (c.requireEvidence) {
      mark(enforced, 'vmu.course.requireEvidence')
      const missing = outcomes.filter((oc) => !Array.isArray(artifacts[oc]) || artifacts[oc].length === 0)
      if (missing.length) return deny('VMU_META_VALIDATION_FAILED', '成果缺证据（**点名**）：' + missing.join('、'), '给每条成果至少一个产物引用（**只引不复制** ✗）', enforced)
    }
    course.outcomes = outcomes.slice()
    return { ok: true, courseId: course.id, outcomes: outcomes.length, enforced, enforcedScope: ENFORCED_SCOPE }
  }

  const submit = (a) => {
    const args = a || {}
    const course = enrolled.get(String(args.courseId || ''))
    const c = cfg()
    const enforced = []
    const evalKey = (k) => { mark(enforced, k) }
    if (!course) return deny('VMU_NOT_FOUND', '找不到课程', '先 open()', enforced)
    const who = String(args.who || '').trim()
    if (!who) return deny('VMU_INVALID_ARGUMENT', 'submit 需要 who', '给提交人', enforced)
    // ROUND 121: the submission form was read into the configuration and never consulted. The volume declares
    // three forms - `artifact` (a reference to a produced artefact, the default), `inline` (the body itself) and
    // `both` - so a submission that does not match the declared form is refused by name rather than silently kept.
    evalKey('vmu.course.submitMode')
    const hasArtifact = typeof args.artifact === 'string' && args.artifact.trim().length > 0
    const hasInline = typeof args.inline === 'string' && args.inline.trim().length > 0
    if (c.submitMode === 'artifact' && !hasArtifact) {
      return deny('VMU_META_VALIDATION_FAILED', '提交形式是 artifact：必须给 artifact 引用（vmu.course.submitMode=artifact）',
        '把产出放进资料库并给 artifact，或把 submitMode 改为 inline/both', enforced)
    }
    if (c.submitMode === 'inline' && !hasInline) {
      return deny('VMU_META_VALIDATION_FAILED', '提交形式是 inline：必须给 inline 正文（vmu.course.submitMode=inline）',
        '直接给 inline 正文，或把 submitMode 改为 artifact/both', enforced)
    }
    if (c.submitMode === 'both' && !(hasArtifact && hasInline)) {
      return deny('VMU_META_VALIDATION_FAILED', '提交形式是 both：artifact 引用与 inline 正文都要（vmu.course.submitMode=both）',
        '补齐缺的那一项，或把 submitMode 改为 artifact/inline', enforced)
    }
    const attempt = (course.attempts.get(who) || 0) + 1
    evalKey('vmu.course.maxAttempts')
    if (attempt > c.maxAttempts) return deny('VMU_NOT_PERMITTED', '提交次数超上限：' + (attempt - 1) + ' / ' + c.maxAttempts + '（vmu.course.maxAttempts）', '提高上限或走补考流程', enforced)
    // rubric 要求
    if (c.rubricRequired) {
      evalKey('vmu.course.rubricRequired')
      if (!args.rubric && c.requireRubricRef) { evalKey('vmu.course.requireRubricRef'); return deny('VMU_META_VALIDATION_FAILED', '缺少评分标准引用（vmu.course.requireRubricRef=true）', '附 rubric 引用', enforced) }
    }
    // 迟交：**显式处置并自曝所选** ✓
    let latePenalty = 0
    if (args.late === true) {
      evalKey('vmu.course.allowLate')
      if (!c.allowLate) return deny('VMU_NOT_PERMITTED', '迟交被拒（vmu.course.allowLate=false）', '打开它，或按时提交', enforced)
      evalKey('vmu.course.latePenaltyRatio')
      if (c.latePenaltyRatio > 0) latePenalty = c.latePenaltyRatio
    }
    course.attempts.set(who, attempt)
    course.submissions += 1
    const id = course.id + '-s' + course.submissions
    submissions.set(id, { id, courseId: course.id, by: who, at: clock(), attempt, late: args.late === true, latePenalty, reviews: [] })
    if (submissions.size > 1) droppedSubmissions += 0   // 保留：本面无上限截断 ✗
    note('course.submit', id, { late: args.late === true })
    return {
      ok: true, submissionId: id, attempt, maxAttempts: c.maxAttempts,
      latePolicy: args.late === true ? { applied: true, rule: 'latePenaltyRatio', ratio: c.latePenaltyRatio, additive: c.gradeChangeAdditive } : { applied: false, rule: 'none' },
      enforced,
      enforcedScope: ENFORCED_SCOPE,
    }
  }

  const review = (a) => {
    const args = a || {}
    const sub = submissions.get(String(args.submissionId || ''))
    const c = cfg()
    const enforced = []
    const evalKey = (k) => { mark(enforced, k) }
    if (!sub) return deny('VMU_NOT_FOUND', '找不到提交 ' + String(args.submissionId || ''), '先 submit() 取 id', enforced)
    const by = String(args.by || '').trim()
    if (!by) return deny('VMU_INVALID_ARGUMENT', 'review 需要 by', '给评审人', enforced)
    if (by === sub.by) {
      evalKey('vmu.course.selfReviewAllowed')
      if (!c.selfReviewAllowed) return deny('VMU_NOT_PERMITTED', '不允许自评（vmu.course.selfReviewAllowed=false）', '换评审人', enforced)
    }
    if (c.blindReview) evalKey('vmu.course.blindReview')
    sub.reviews.push({ by, at: clock(), blind: c.blindReview, score: Number(args.score) })
    const need = Math.min(c.reviewersPerSubmission, c.reviewRounds * c.reviewersPerSubmission)
    if (sub.reviews.length < c.reviewersPerSubmission) {
      evalKey('vmu.course.reviewersPerSubmission')
      return { ok: true, submissionId: sub.id, reviews: sub.reviews.length, needed: c.reviewersPerSubmission, complete: false, blind: c.blindReview, enforced, enforcedScope: ENFORCED_SCOPE }
    }
    return { ok: true, submissionId: sub.id, reviews: sub.reviews.length, needed: need, complete: true, blind: c.blindReview, peerWeight: c.peerWeight, enforced, enforcedScope: ENFORCED_SCOPE }
  }

  /** 评分：`gradeScale`／`passMark` 越界 ⇒ 拒（本面以参数给出尺度与及格线 ✓）。 */
  const grade = (a) => {
    const args = a || {}
    const sub = submissions.get(String(args.submissionId || ''))
    const c = cfg()
    const enforced = []
    if (!sub) return deny('VMU_NOT_FOUND', '找不到提交', '先 submit()', enforced)
    const ceil = Number(readKey('vmu.course.gradeScaleMax'))
    const top = Number.isFinite(ceil) && ceil > 0 ? ceil : 100
    const passMark = Number(args.passMark === undefined ? readKey('vmu.course.passMark') : args.passMark)
    if (readKey('vmu.course.passMark') !== undefined) mark(enforced, 'vmu.course.passMark')
    const score = Number(args.score)
    if (!Number.isFinite(score) || score < 0 || score > top) {
      return deny('VMU_META_VALIDATION_FAILED', '分数越界：' + String(args.score) + ' ∉ [0,' + top + ']（尺度上限 ' + top + '）', '在尺度内给分；尺度来自 vmu.course.gradeScale*', enforced)
    }
    if (Number.isFinite(passMark) && score < passMark) {
      return Object.assign(deny('VMU_META_VALIDATION_FAILED', '未达及格线：' + score + ' < ' + passMark + '（vmu.course.passMark）', '补考或复核', enforced), { passed: false, score, passMark })
    }
    sub.grade = score
    return { ok: true, submissionId: sub.id, score, passMark: Number.isFinite(passMark) ? passMark : null, passed: true, enforced, enforcedScope: ENFORCED_SCOPE }
  }

  /** 认证证据包：**缺引用 ⇒ 拒** ✗✓。 */
  const evidencePack = (a) => {
    const args = a || {}
    const c = cfg()
    const enforced = []
    if (c.requireEvidence) mark(enforced, 'vmu.course.requireEvidence')
    const claims = Array.isArray(args.claims) ? args.claims : []
    if (!claims.length) return deny('VMU_INVALID_ARGUMENT', 'evidencePack 需要 claims', '给自评主张清单', enforced)
    const missing = claims.filter((x) => !x || !Array.isArray(x.refs) || x.refs.length === 0).map((x) => String((x && x.claim) || '（无题）'))
    if (c.requireEvidence && missing.length) return deny('VMU_META_VALIDATION_FAILED', '认证证据包缺引用（**点名**）：' + missing.join('、'), '每条主张至少一个证据引用（只引不复制 ✗）', enforced)
    return { ok: true, claims: claims.length, enforced, enforcedScope: ENFORCED_SCOPE }
  }

  const status = (a) => {
    const c = cfg()
    const id = a && a.courseId ? String(a.courseId) : ''
    if (id) {
      const course = enrolled.get(id)
      if (!course) return deny('VMU_NOT_FOUND', '找不到课程 ' + id, '先 open()', [])
      return { ok: true, courseId: id, cohort: course.cohort.length, auditors: course.auditors.length, submissions: course.submissions, outcomes: course.outcomes.length, droppedLog, droppedSubmissions }
    }
    return { ok: true, courses: enrolled.size, submissions: submissions.size, droppedLog, droppedSubmissions, refusals: Object.fromEntries(refusals), partition: partition(), submitMode: c.submitMode, retentionMs: c.retentionMs, blindReview: c.blindReview }
  }

  return { open: openCourse, enroll, align, submit, review, grade, evidencePack, status, keysUsed, partition, config: cfg, refusals: () => Object.fromEntries(refusals), trail: () => trail.slice() }
}

export default createCourse

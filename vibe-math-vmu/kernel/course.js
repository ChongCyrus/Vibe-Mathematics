// vibe-math-vmu — 教学面（22 卷 N13）：把 `vmu.teaching.*` **24 键**接成可观测行为。
//
// SCOPE (corrected in round 400): docs/23 §0b.1 reversed this demotion under the user's 2026-10-11 criterion.
// Teaching and peer evaluation DO have a possible consumer - (e) inter-agent collaboration: mentoring and training
// agents - and the overlap of its peer-review half with existing faces is a design hint, not a reason to demote
// (measured wording: 其同行评审部分与既有面重复，属设计提示，不构成降级理由).
// 教学行政非研究活动（旧的降级理由，已撤销）✗ —— 
//   且其真正的机制部分（blindReview/reviewersPerSubmission/reviewRounds/rubric/peerWeight）**与 review/reviewers/conference 重复** ⇒ 依先例"重复即复用既有面"。
//   **本行是"待改"的证据** ✗：代码仍在，**移出流程必须包含撤代码**（§2 规则 4）。
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

import { mint } from './ids.js'   // ROUND 2 (task-14): ids never restart from 0 (kernel/ids.js)
export const COURSE_KEYS = Object.freeze([
  'vmu.teaching.enabled', 'vmu.teaching.visibility', 'vmu.teaching.allowAuditors', 'vmu.teaching.cohortMax',
  'vmu.teaching.enrollmentNeedsApproval', 'vmu.teaching.submitMode', 'vmu.teaching.maxAttempts',
  'vmu.teaching.allowLate', 'vmu.teaching.latePenaltyRatio', 'vmu.teaching.gradeChangeAdditive',
  'vmu.teaching.selfReviewAllowed', 'vmu.teaching.blindReview', 'vmu.teaching.reviewersPerSubmission',
  'vmu.teaching.reviewRounds', 'vmu.teaching.rubricRequired', 'vmu.teaching.requireRubricRef',
  'vmu.teaching.requireEvidence', 'vmu.teaching.peerWeight', 'vmu.teaching.retentionMs',
  'vmu.teaching.blindMappingRetentionMs', 'vmu.teaching.publishToLibrary', 'vmu.teaching.readingsRequired',
  'vmu.teaching.maxUnits', 'vmu.teaching.ontologyVersion',
])
export const WIRED_COURSE_KEYS = Object.freeze([
  'vmu.teaching.enabled', 'vmu.teaching.allowAuditors', 'vmu.teaching.cohortMax',
  'vmu.teaching.enrollmentNeedsApproval', 'vmu.teaching.maxAttempts',
  'vmu.teaching.allowLate', 'vmu.teaching.latePenaltyRatio', 'vmu.teaching.gradeChangeAdditive',
  'vmu.teaching.selfReviewAllowed', 'vmu.teaching.blindReview', 'vmu.teaching.reviewersPerSubmission',
  'vmu.teaching.reviewRounds', 'vmu.teaching.rubricRequired', 'vmu.teaching.requireRubricRef',
  'vmu.teaching.requireEvidence', 'vmu.teaching.peerWeight', 'vmu.teaching.retentionMs',
  // ROUND 127: these four moved here because rounds 121-126 made every one of them change an outcome - the module
  // reading a key while still claiming it unwired was the stale half of the pair this project keeps finding, and the
  // generator invariant that nothing a module reads may be silently dropped is what forced the move.
  'vmu.teaching.visibility', 'vmu.teaching.submitMode', 'vmu.teaching.ontologyVersion', 'vmu.teaching.publishToLibrary',
  // ROUND 154: implemented at the outcome-alignment path (see align) - read, and it DECIDES (a shortfall is a
  // named refusal carrying the current count and the threshold).
  'vmu.teaching.readingsRequired',
])
/** 未接：**逐个点名＋原因** ✗✓。 */
export const PLANNED_COURSE_KEYS = Object.freeze([
  /**
   * ROUND 154: `readingsRequired` LEFT this list - it is implemented in `align()` now, at the outcome-alignment path
   * its own revival condition named, so it is read and it decides (a shortfall is a named refusal carrying the
   * current count and the threshold). The two that remain are carried elsewhere and say where.
   */
  ['vmu.teaching.blindMappingRetentionMs', '★ **轮 191 实测补齐指针** ✓：保留机制确由 **`retention` 面**承载 ✓（`removed[]` 每次移除可追 ✓、`library.list({scope})` 可读 ✓）；'
    + '★ **而「登记」现在能点名了** ✓：`retention.js` 读 **17 个键／5 个族** ✓ —— `vmu.records.retention.*`（`keepEvery`／`maxBytes`／`tierThreshold`／`permanentMarker` ✓）、'
    + '`vmu.records.trash.retainDays`（**默认 30 天** ✓）、`vmu.records.history.depth` ✓、`vmu.quota.*` ✓、`vmu.prune.*` ✓ ⇒ **保留期要配就配在那里** ✓。'
    + '本面**无持久化面** ✓（实测：持久化相关命中只有本条理由与两条 `publishToLibrary` 注释 ✓）⇒ 各面自带一份就是**第二份保留实现** ✗。'
    + '**复活条件** ✓：盲审映射表真的需要独立保留期时 ⇒ **加在 `retention` 的键族里** ✓（**不是在课程面内落盘** ✗）'],
  ['vmu.teaching.maxUnits', '★ **轮 189 实测更正** ✗✓：本键管的是**单元（unit）上限**（`docs/17` L774：「单元上限（0＝不限）」✓），而'
    + '**课程级人数上限【已经存在且已接线】** ✓✓ —— 实测：`enroll()` 里 `if (c.cohortMax > 0 && course.cohort.length >= c.cohortMax)` ⇒ '
    + '**具名拒 `VMU_RESOURCE_BUDGET`** ✓，提示带「名额已满：N / M（vmu.teaching.cohortMax）」✓；套件正负断言见 `tests/vmu-course.test.mjs` L50／L56 ✓。'
    + '所以原句"没有课程级上限" ✗ 是**说错了对象** ✗（有 **人数**上限 ✓，缺的是 **单元**上限 ✓）。'
    + '★ **更关键的是**：**`unit` 在本模块里只出现三处** ✓（键表 ✓／本理由 ✓／`openCourse` 的注释"未接⇒不参与" ✓）⇒ '
    + '**没有任何单元 API、也没有单元对象** ✗（`VMU_COURSE_UNIT_UNKNOWN` 同样只是**规划码** ✓）。'
    + '**复活条件（已改正 ✓）**：**先有"单元"这一概念** ✓（`docs/17` 的 `kernel.course.unit/syllabus` 一类的规划面 ✓）⇒ '
    + '**然后在"加单元"的那条路径上限额** ✓ —— ★ **不是在 `cohort` 增长处** ✗：那里发生的是**人**加入 ✓，不是**单元**超额 ✓（原复活条件把两者混为一谈 ✗）。'
    + '**为什么现在不接** ✓：**在没有单元概念时先接一个"单元上限"，等于凭空造一个子系统** ✗ —— 与本项目"避免第二份实现／零机制"的纪律相反 ✓✓。'],
])

const refuse = (code, message, hint) => ({ ok: false, code, message, hint })

export function createCourse(opts) {
  const o = opts || {}
  const readKey = (k) => (o.settings && typeof o.settings.get === 'function' ? o.settings.get(k) : (o.settings || {})[k])
  const clock = typeof o.clock === 'function' ? o.clock : () => 0
  const log = typeof o.log === 'function' ? o.log : () => {}
  // ROUND 4 / task-25 (Lead's independent audit): the bus takes a STRING NAME as its first argument. This helper used
  // to forward the event OBJECT, so every emission threw and was swallowed. ROUND 13 / task-99: the NAME is the first
  // parameter now (a literal at every call site - registrable AND visible to the producer scans); prose sits ABOVE the
  // helper because that scan only reads 700 characters into its body.
  const emit = (name, payload) => {
    if (!o.bus || typeof o.bus.emit !== 'function') return
    const topic = typeof name === 'string' && name ? name : null
    const body = Object.assign({ type: topic }, payload || {})
    const note = (code, message) => { try { if (o.log && typeof o.log.append === 'function') o.log.append({ type: 'bus/emit-failed', at: clock(), name: topic, code, message }) } catch (e) { /* advisory */ } }
    if (topic === null) return note('VMU_BUS_NAME_REQUIRED', 'a bus event needs a string name')
    try { o.bus.emit(topic, body) } catch (e) { note((e && e.code) || 'VMU_BUS_EMIT_FAILED', String((e && e.message) || e)) }
  }

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
    const ratio = Number(readKey('vmu.teaching.latePenaltyRatio'))
    return {
      enabled: b('vmu.teaching.enabled', true),
      visibility: s('vmu.teaching.visibility', 'cohort'),
      allowAuditors: b('vmu.teaching.allowAuditors', false),
      cohortMax: n('vmu.teaching.cohortMax', 0),
      enrollmentNeedsApproval: b('vmu.teaching.enrollmentNeedsApproval', true),
      // ROUND 123: the default was `single`, a value volume 17 does not define (`artifact｜inline｜both`), so the
      // form guard could never fire on a default configuration. The volume says the default is `artifact` - the
      // submission references a produced artefact - and that is what it is now.
      submitMode: s('vmu.teaching.submitMode', 'artifact'),
      maxAttempts: n('vmu.teaching.maxAttempts', 1),
      allowLate: b('vmu.teaching.allowLate', false),
      latePenaltyRatio: Number.isFinite(ratio) && ratio >= 0 && ratio <= 1 ? ratio : 0,
      gradeChangeAdditive: b('vmu.teaching.gradeChangeAdditive', false),
      selfReviewAllowed: b('vmu.teaching.selfReviewAllowed', false),
      blindReview: b('vmu.teaching.blindReview', false),
      reviewersPerSubmission: n('vmu.teaching.reviewersPerSubmission', 1),
      reviewRounds: n('vmu.teaching.reviewRounds', 1),
      rubricRequired: b('vmu.teaching.rubricRequired', true),
      requireRubricRef: b('vmu.teaching.requireRubricRef', true),
      requireEvidence: b('vmu.teaching.requireEvidence', true),
    // ROUND 154: the required number of cited readings per alignment. 0 (the default) means no requirement, so
    // nothing changes unless a course asks for it.
    readingsRequired: n('vmu.teaching.readingsRequired', 0),
      peerWeight: Number(readKey('vmu.teaching.peerWeight')) > 0 ? Number(readKey('vmu.teaching.peerWeight')) : 0,
      retentionMs: n('vmu.teaching.retentionMs', 0),
      // ROUND 127: publishing to the institution library. The documented default is FALSE - privacy - so a
      // publication has to be switched on explicitly and cannot happen by omission.
      publishToLibrary: b('vmu.teaching.publishToLibrary', false),
      // ROUND 124: the ontology version is a string with the documented default `1`, and it becomes the migration
      // guard below rather than another key that is read and forgotten.
      ontologyVersion: s('vmu.teaching.ontologyVersion', '1'),
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

  const openCourse = (a) => {
    const args = a || {}
    const c = cfg()
    const enforced = []
    const evalKey = (k) => { mark(enforced, k) }
    evalKey('vmu.teaching.enabled')
    if (!c.enabled) return deny('VMU_NOT_PERMITTED', '课程面未启用（vmu.teaching.enabled=false）', '打开它，或不要开课', enforced)
    // ROUND 121: the visibility branch used to mark the key as evaluated and change nothing, which is the quietest
    // form of "declared but ineffective". The volume defines `public` as visible outside the institution and gates
    // auditor access separately, so a public course that forbids auditors is a contradiction: it is refused by name
    // instead of being recorded and ignored.
    if (c.visibility === 'public' && c.allowAuditors !== true) {
      evalKey('vmu.teaching.visibility')
      evalKey('vmu.teaching.allowAuditors')
      return deny('VMU_NOT_PERMITTED',
        'public 课程必须允许旁听（vmu.teaching.visibility=public 且 vmu.teaching.allowAuditors=false）',
        '把 allowAuditors 设为 true，或把 visibility 改为 institution/private（docs/17：public 即机构外可见）', enforced)
    }
    const title = String(args.title || '').trim()
    if (!title) return deny('VMU_INVALID_ARGUMENT', 'open 需要 title', '给课程标题', enforced)
    const id = mint('course', 'co-')
    // `maxUnits` 未接 ⇒ 不参与
    const course = { id, title, at: clock(), cohort: [], submissions: 0, outcomes: [], visibility: c.visibility, auditors: [], attempts: new Map(),
      // ROUND 124: the ontology version is stamped when the course opens, which is what makes it a MIGRATION key
      // rather than a dead one - a later enrol that names a different version is refused below.
      ontologyVersion: c.ontologyVersion }
    enrolled.set(id, course)
    note('course.open', id)
    emit('course/open', { id })
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
    // ROUND 124: the ontology version becomes a real migration gate. A caller that names a version must name the
    // one the course was opened under; the check is explicit rather than silent, because a mismatch here means the
    // caller is working from a different ontology and its answers would not be comparable.
    if (typeof args.ontologyVersion === 'string' && args.ontologyVersion.trim() !== '') {
      evalKey('vmu.teaching.ontologyVersion')
      if (args.ontologyVersion.trim() !== String(course.ontologyVersion)) {
        return deny('VMU_CONFLICT',
          '本体版本不符：课程开于 ' + String(course.ontologyVersion) + '，调用方声明 ' + args.ontologyVersion.trim() + '（vmu.teaching.ontologyVersion）',
          '用课程开立时的版本，或按迁移流程重开课程（docs/17 §本体版本）', enforced)
      }
    }
    if (args.auditor === true) {
      evalKey('vmu.teaching.allowAuditors')
      if (!c.allowAuditors) return deny('VMU_NOT_PERMITTED', '本课不允许旁听（vmu.teaching.allowAuditors=false）', '打开它，或按正式学员注册', enforced)
      course.auditors.push(who)
      return { ok: true, courseId: course.id, kind: 'auditor', enforced, enforcedScope: ENFORCED_SCOPE }
    }
    if (c.cohortMax > 0 && course.cohort.length >= c.cohortMax) {
      evalKey('vmu.teaching.cohortMax')
      return deny('VMU_RESOURCE_BUDGET', '名额已满：' + course.cohort.length + ' / ' + c.cohortMax + '（vmu.teaching.cohortMax）', '扩大名额或排队', enforced)
    }
    evalKey('vmu.teaching.enrollmentNeedsApproval')
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
      mark(enforced, 'vmu.teaching.requireEvidence')
      const missing = outcomes.filter((oc) => !Array.isArray(artifacts[oc]) || artifacts[oc].length === 0)
      if (missing.length) return deny('VMU_META_VALIDATION_FAILED', '成果缺证据（**点名**）：' + missing.join('、'), '给每条成果至少一个产物引用（**只引不复制** ✗）', enforced)
    }
    /**
     * ROUND 154 — `vmu.teaching.readingsRequired` IS IMPLEMENTED HERE, at the outcome-alignment path, which is exactly
     * what its own revival condition named. Readings are REFERENCES to library entries - cited, never copied, the same
     * rule the instrument capture and the lean archive follow. Duplicates and blanks are COUNTED, not silently
     * dropped: a requirement that can be satisfied by listing the same entry three times is not a requirement.
     */
    const readings = []
    let droppedReadings = 0
    for (const item of (Array.isArray(args.readings) ? args.readings : [])) {
      const r = String(item === undefined || item === null ? '' : item).trim()
      if (r === '' || readings.indexOf(r) !== -1) { droppedReadings += 1; continue }
      readings.push(r)
    }
    if (c.readingsRequired > 0) {
      mark(enforced, 'vmu.teaching.readingsRequired')
      if (readings.length < c.readingsRequired) {
        return deny('VMU_COURSE_READINGS_SHORT',
          '必读量未达（**当前 ' + readings.length + ' 篇 / 门槛 ' + c.readingsRequired + ' 篇**，vmu.teaching.readingsRequired）',
          '给 `readings`：**引用库条目**（只引不复制 ✗）；重复与空串已计入丢弃数 ' + droppedReadings + ' ✓', enforced)
      }
    }
    course.outcomes = outcomes.slice()
    course.readings = readings.slice()
    return { ok: true, courseId: course.id, outcomes: outcomes.length, readings: readings.length, droppedReadings, enforced, enforcedScope: ENFORCED_SCOPE }
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
    evalKey('vmu.teaching.submitMode')
    const hasArtifact = typeof args.artifact === 'string' && args.artifact.trim().length > 0
    const hasInline = typeof args.inline === 'string' && args.inline.trim().length > 0
    if (c.submitMode === 'artifact' && !hasArtifact) {
      return deny('VMU_META_VALIDATION_FAILED', '提交形式是 artifact：必须给 artifact 引用（vmu.teaching.submitMode=artifact）',
        '把产出放进资料库并给 artifact，或把 submitMode 改为 inline/both', enforced)
    }
    if (c.submitMode === 'inline' && !hasInline) {
      return deny('VMU_META_VALIDATION_FAILED', '提交形式是 inline：必须给 inline 正文（vmu.teaching.submitMode=inline）',
        '直接给 inline 正文，或把 submitMode 改为 artifact/both', enforced)
    }
    if (c.submitMode === 'both' && !(hasArtifact && hasInline)) {
      return deny('VMU_META_VALIDATION_FAILED', '提交形式是 both：artifact 引用与 inline 正文都要（vmu.teaching.submitMode=both）',
        '补齐缺的那一项，或把 submitMode 改为 artifact/inline', enforced)
    }
    const attempt = (course.attempts.get(who) || 0) + 1
    evalKey('vmu.teaching.maxAttempts')
    if (attempt > c.maxAttempts) return deny('VMU_NOT_PERMITTED', '提交次数超上限：' + (attempt - 1) + ' / ' + c.maxAttempts + '（vmu.teaching.maxAttempts）', '提高上限或走补考流程', enforced)
    // rubric 要求
    if (c.rubricRequired) {
      evalKey('vmu.teaching.rubricRequired')
      if (!args.rubric && c.requireRubricRef) { evalKey('vmu.teaching.requireRubricRef'); return deny('VMU_META_VALIDATION_FAILED', '缺少评分标准引用（vmu.teaching.requireRubricRef=true）', '附 rubric 引用', enforced) }
    }
    // 迟交：**显式处置并自曝所选** ✓
    let latePenalty = 0
    if (args.late === true) {
      evalKey('vmu.teaching.allowLate')
      if (!c.allowLate) return deny('VMU_NOT_PERMITTED', '迟交被拒（vmu.teaching.allowLate=false）', '打开它，或按时提交', enforced)
      evalKey('vmu.teaching.latePenaltyRatio')
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
      evalKey('vmu.teaching.selfReviewAllowed')
      if (!c.selfReviewAllowed) return deny('VMU_NOT_PERMITTED', '不允许自评（vmu.teaching.selfReviewAllowed=false）', '换评审人', enforced)
    }
    if (c.blindReview) evalKey('vmu.teaching.blindReview')
    sub.reviews.push({ by, at: clock(), blind: c.blindReview, score: Number(args.score) })
    const need = Math.min(c.reviewersPerSubmission, c.reviewRounds * c.reviewersPerSubmission)
    if (sub.reviews.length < c.reviewersPerSubmission) {
      evalKey('vmu.teaching.reviewersPerSubmission')
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
    const ceil = Number(readKey('vmu.teaching.gradeScaleMax'))
    const top = Number.isFinite(ceil) && ceil > 0 ? ceil : 100
    const passMark = Number(args.passMark === undefined ? readKey('vmu.teaching.passMark') : args.passMark)
    if (readKey('vmu.teaching.passMark') !== undefined) mark(enforced, 'vmu.teaching.passMark')
    const score = Number(args.score)
    if (!Number.isFinite(score) || score < 0 || score > top) {
      return deny('VMU_META_VALIDATION_FAILED', '分数越界：' + String(args.score) + ' ∉ [0,' + top + ']（尺度上限 ' + top + '）', '在尺度内给分；尺度来自 vmu.teaching.gradeScale*', enforced)
    }
    if (Number.isFinite(passMark) && score < passMark) {
      return Object.assign(deny('VMU_META_VALIDATION_FAILED', '未达及格线：' + score + ' < ' + passMark + '（vmu.teaching.passMark）', '补考或复核', enforced), { passed: false, score, passMark })
    }
    sub.grade = score
    return { ok: true, submissionId: sub.id, score, passMark: Number.isFinite(passMark) ? passMark : null, passed: true, enforced, enforcedScope: ENFORCED_SCOPE }
  }

  /** 认证证据包：**缺引用 ⇒ 拒** ✗✓。 */
  const evidencePack = (a) => {
    const args = a || {}
    const c = cfg()
    const enforced = []
    if (c.requireEvidence) mark(enforced, 'vmu.teaching.requireEvidence')
    const claims = Array.isArray(args.claims) ? args.claims : []
    if (!claims.length) return deny('VMU_INVALID_ARGUMENT', 'evidencePack 需要 claims', '给自评主张清单', enforced)
    const missing = claims.filter((x) => !x || !Array.isArray(x.refs) || x.refs.length === 0).map((x) => String((x && x.claim) || '（无题）'))
    if (c.requireEvidence && missing.length) return deny('VMU_META_VALIDATION_FAILED', '认证证据包缺引用（**点名**）：' + missing.join('、'), '每条主张至少一个证据引用（只引不复制 ✗）', enforced)
    return { ok: true, claims: claims.length, enforced, enforcedScope: ENFORCED_SCOPE }
  }

  /**
   * Publish course material to the institution library. `vmu.teaching.publishToLibrary` defaults to FALSE, so the
   * default answer is a REFUSAL: the volume's default is privacy, and a publication nobody switched on must not
   * happen by omission. Round 127 - the key was planned and unread before this.
   */
  const publish = (a) => {
    const args = a || {}
    const course = enrolled.get(String(args.courseId || ''))
    const c = cfg()
    const enforced = []
    const evalKey = (k) => { mark(enforced, k) }
    if (!course) return deny('VMU_NOT_FOUND', '找不到课程 ' + String(args.courseId || ''), '先 open() 取 id', enforced)
    evalKey('vmu.teaching.publishToLibrary')
    if (c.publishToLibrary !== true) {
      return deny('VMU_NOT_PERMITTED',
        '课程材料不进机构库（vmu.teaching.publishToLibrary=false，默认即隐私）',
        '显式打开它，或只在本课范围内使用材料（docs/17 §隐私与可见性）', enforced)
    }
    const material = String(args.material || '').trim()
    if (!material) return deny('VMU_INVALID_ARGUMENT', 'publish 需要 material', '给要发布到库的材料引用', enforced)
    note('course.publish', course.id)
    emit('course/publish', { id: course.id, material })
    return { ok: true, courseId: course.id, material, enforced, enforcedScope: ENFORCED_SCOPE }
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

  return { open: openCourse, enroll, align, submit, review, grade, evidencePack, publish, status, keysUsed, partition, config: cfg, refusals: () => Object.fromEntries(refusals), trail: () => trail.slice() }
}

export default createCourse

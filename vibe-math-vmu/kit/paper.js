// vibe-math-vmu/kit/paper.js — PHASE 8 / B-4: the PAPER FLOW (state machine + fingerprint verification + artefact assembly).
//
// EXTRACTED from `packs/v5r/paper.js`. The split is deliberate:
//   · GENERIC (here): the lifecycle writing → reviewing → awaiting-editor → finalized, the advance/pass transitions,
//     the by-id fingerprint verification (a drift is a NAMED block, never a silent reuse), the four-artefact assembly with
//     `missing:[...]`, and the kernel-LaTeX compile path with its named refusals;
//   · POLICY (parameters, never defaults invented here): the section titles, the round cap, the engine order, the repair
//     package set, the record track/prefix, the archive author, the editor rules and the REGISTERED error codes.
//
// Kit boundaries (tests/audit-kit-boundaries): no pack import, no spawn, no filesystem, no NEW error codes — the caller
// passes codes that already belong to the institution declaring this flow.

export const PAPER_STATES = Object.freeze(['writing', 'reviewing', 'awaiting-editor', 'finalized'])
export const PAPER_ARTIFACTS = Object.freeze(['md', 'tex', 'pdf', 'meta'])
const str = (v) => (v === undefined || v === null ? '' : String(v))
const has = (v) => v !== undefined && v !== null && String(v).trim() !== ''

function refuse(code, message, hint, extra = null) {
  const e = new Error(message)
  e.code = code
  if (hint) e.hint = hint
  // ★ E4: a refusal about a SETTING must travel with the facts a caller can act on (current value, legal values, which
  // keys were enforced) — `code` alone forces the caller to re-read the settings to answer "what was it set to?".
  if (extra && typeof extra === 'object') {
    for (const k of Object.keys(extra)) if (k !== 'code' && k !== 'message' && k !== 'hint' && extra[k] !== undefined) e[k] = extra[k]
  }
  return e
}


/**
 * Create the paper subsystem over ONE kernel. Every method is a pure state transition over records; there is no timer
 * and no global: the pack's turn/middleware layer calls `pass()` when it wants the flow to move.
 */
export function createPaperFlow({
  kernel,
  sections = [],
  // ★★★ THE SECTION -> PART-FIELD MAPPING IS POLICY, so the PACK supplies it (one entry per section, '' = no field).
  // Before this, PaperMd looped over sections and, inside each, emitted every member's ENTIRE part - so the whole body was
  // copied into every top-level section ("整篇正文出现在每一节里"). A part is a set of FIELDS
  // (title/solution/methods/rules/limits/evidence); a section owns AT MOST ONE of them.
  sectionFields = [],
  maxRounds = 3,
  engineOrder = {},
  repairCore = [],
  track = 'paper',
  codes = null,
  recordPrefix = 'paper',
  author = 'paper-flow',
  outDirPrefix = 'Paper/',
  editorDefault = 'academician',
  finalizerSlot = 'chair',
  // ★ E4 — WHO answers the pre-finalisation consult is POLICY, so the PACK supplies it (the kit must not guess that the
  //   institute has an "office"). An empty list is honored as "the pack declared no answering role" ⇒ the gate can never
  //   be satisfied, which is a NAMED refusal (VMU_NOT_PERMITTED), never a silent pass.
  consultRoles = [],
  // The clock is a seam: the consult ledger records WHEN the office was asked (durability ⇒ the question survives a
  // crash) and the timeout is measured against it, so tests need to move time without sleeping.
  clock = () => Date.now(),
  // ★ E1 — THE ARTEFACT-MARKDOWN SEAM. `render` / `PaperTex` / `PaperArtifacts` all build from the closure `PaperMd`, so a
  // pack whose record-driven sections are filled AFTER the kit assembles its outline could only ever fill the TOOL RECEIPT,
  // never the .md/.tex written to `Paper/`. That was a real gap (E1: three sections were structurally empty in the archive).
  // The transformer is POLICY ⇒ the PACK supplies it and the kit only calls it once per render. It MUST return a string:
  // a fill that returns undefined would silently blank the paper, so a non-string is a named refusal, never a coercion.
  mdFill = null,
} = {}) {
  if (!codes || typeof codes !== 'object' || typeof codes.STATE !== 'string' || typeof codes.FINGERPRINT !== 'string') {
    throw refuse('VMU_INVALID_ARGUMENT', 'createPaperFlow needs the REGISTERED error codes',
      'pass codes:{STATE,FINGERPRINT,PDF_NEEDS_KERNEL,EXECUTOR,PDF_FAILED} from the institution that declares them (the kit never invents codes)')
  }
  if (!Array.isArray(sections) || sections.length === 0) {
    throw refuse('VMU_INVALID_ARGUMENT', 'createPaperFlow needs the section titles', 'pass sections:[…] (the institution paper outline)')
  }
  const SECTIONS = sections, SECTION_FIELDS = sectionFields, MAX_ROUNDS = maxRounds, ENGINE_ORDER = engineOrder, REPAIR_CORE = repairCore, TRACK = track, CODES = codes
  const MD_FILL = typeof mdFill === 'function' ? mdFill : null
  if (!kernel || !kernel.records) {
    throw refuse('VMU_ENGINE_UNAVAILABLE', 'the paper subsystem needs the records face', 'assemble a kernel with the records service')
  }
  const records = kernel.records
  const recordName = (target, artifact) => recordPrefix + '|' + str(target) + '|' + artifact

  const declaredTracks = () => {
    try {
      const v = kernel.settingsSnapshot ? kernel.settingsSnapshot()['vmu.records.tracks'] : null
      return Array.isArray(v) ? v.map(String) : []
    } catch { return [] }
  }
  const ensureTrack = () => {
    if (!declaredTracks().includes(TRACK)) {
      throw refuse('VMU_INVALID_ARGUMENT', 'the records face does not declare the "' + TRACK + '" track, so a paper cannot be archived',
        'declare vmu.records.tracks including "' + TRACK + '" (institution value layer)')
    }
  }
  const listPaper = () => {
    const rows = records.list({ track: TRACK, limit: 500 })
    return Array.isArray(rows.items) ? rows.items : []
  }
  const rowByTitle = (title) => listPaper().filter((r) => String(r.title) === title)[0] || null
  const readState = (target) => {
    const row = rowByTitle(recordName(target, 'state'))
    if (!row) return null
    const got = records.get({ id: row.id })
    const full = got && got.record ? got.record : got
    let body = full && full.body
    if (body === undefined && Array.isArray(full && full.blocks)) body = full.blocks.map((b) => (typeof b === 'string' ? b : b && b.text) || '').join('\n')
    try { return { state: JSON.parse(String(body || '{}')), row: full } } catch { return null }
  }
  const writeState = (state) => {
    // ONE state record, updated IN PLACE: `records.put` with the remembered id writes a new revision, so the paper has
    // exactly one live state row (a fresh id per write would leave duplicates whose list order decides the truth).
    const put = records.put({
      id: state.stateRecordId || null,
      track: TRACK, kind: 'paper-state', title: recordName(state.target, 'state'),
      body: JSON.stringify(state), settled: state.status === 'finalized', by: author,
    })
    if (put && put.id) state.stateRecordId = put.id
    return put
  }

  const requireState = (target) => {
    const found = readState(target)
    if (!found) {
      throw refuse(CODES.STATE, 'no paper "' + str(target) + '" exists in the records face',
        'start one first (paper.start({target, participants}))')
    }
    return found
  }

  /** ① start: writing/round 1, participants = the writing members. */
  // ── ★ E4 / OFFICE CONSULT — "最后讨论、检查无误后定稿：定稿前必须问所办" ──────────────────────────────────────
  // WHY THE GATE IS HERE. `kernel/paper.js` also carries a consult gate, but NOTHING constructs it in the live assembly
  // (only tests and scripts call `createPaper(`), so a guard there is a comment: the rule never ran. The path that
  // ACTUALLY finalises a paper is `packs/v5r/paper.js` → this kit (`vibe_v5_paper` → `recordFinal`), so the gate lives
  // here, on the registered path. POLICY STAYS IN THE PACK: who answers (`consultRoles`) and which roles are exempt come
  // in as parameters; the kit owns only the state transition, the durable ledger, and the named refusals (the CODES are
  // passed in — the kit invents none).
  const CONSULT_ROLES = Array.isArray(consultRoles) ? consultRoles.map(String).filter(has) : []
  const CONSULT_KEYS = Object.freeze([
    'vmu.paper.officeConsult',
    'vmu.paper.officeConsultOn',
    'vmu.paper.officeConsultTimeoutMs',
    'vmu.paper.officeConsultOnTimeout',
    'vmu.paper.officeConsultExemptRoles',
  ])
  const settingsSnap = () => {
    try { return (kernel.settingsSnapshot ? kernel.settingsSnapshot() : {}) || {} } catch { return {} }
  }
  /**
   * Read the five consult keys AT CALL TIME (D-13: live reads, never a boot snapshot). Two rules a settings gate owes its
   * reader: (a) an unreadable value is NEVER a quiet allow — `officeConsult` outside required|off is reported as
   * `invalid` and refuses; (b) an unrecognised `officeConsultOnTimeout` degrades to `hold` (the conservative branch),
   * because "I did not understand the policy" must not become "go ahead".
   */
  function consultPolicy() {
    const s = settingsSnap()
    const raw = s['vmu.paper.officeConsult']
    const status = raw === undefined || raw === null ? 'off'
      : (raw === true || raw === 'required') ? 'required'
      : (raw === false || raw === 'off') ? 'off'
      : 'invalid'
    const onRaw = str(s['vmu.paper.officeConsultOn'])
    const on = onRaw === '' ? 'finalize' : onRaw
    const tRaw = s['vmu.paper.officeConsultTimeoutMs']
    const timeoutMs = (typeof tRaw === 'number' && Number.isFinite(tRaw) && tRaw >= 0) ? tRaw : 0
    const onTimeoutRaw = str(s['vmu.paper.officeConsultOnTimeout'])
    const onTimeout = onTimeoutRaw === 'refuse' ? 'refuse' : 'hold'
    const exemptRaw = s['vmu.paper.officeConsultExemptRoles']
    const exemptRoles = Array.isArray(exemptRaw) ? exemptRaw.map(String).filter(has) : []
    return {
      status, on, timeoutMs, onTimeout, exemptRoles,
      raw: raw === undefined ? null : raw,
      onTimeoutRaw: onTimeoutRaw === '' ? null : onTimeoutRaw,
      values: {
        'vmu.paper.officeConsult': raw === undefined ? null : raw,
        'vmu.paper.officeConsultOn': on,
        'vmu.paper.officeConsultTimeoutMs': timeoutMs,
        'vmu.paper.officeConsultOnTimeout': attemptsDown(onTimeoutRaw, onTimeout),
        'vmu.paper.officeConsultExemptRoles': exemptRoles.slice(),
      },
    }
  }
  /** Report the timeouts as they are USED (the raw value travels separately in `onTimeoutRaw`), so a receipt never claims
   *  a policy that is not the one enforced. */
  function attemptsDown(rawOnTimeout, used) {
    return rawOnTimeout === '' || rawOnTimeout === null || rawOnTimeout === used ? used : used + ' (from ' + rawOnTimeout + ')'
  }
  const MAX_CONSULT_REQUESTS = 16
  /** The consult ledger lives INSIDE the paper's state record (one record per paper ⇒ a replay finds the questions
   *  already asked). It is BOUNDED: at most 16 entries; the counters keep the long history. */
  function consultOf(state) {
    if (!state.consult || typeof state.consult !== 'object') state.consult = { requests: [], opened: 0, answered: 0, exempted: 0, timedOut: 0 }
    const c = state.consult
    if (!Array.isArray(c.requests)) c.requests = []
    if (typeof c.opened !== 'number') c.opened = 0
    if (typeof c.answered !== 'number') c.answered = 0
    if (typeof c.exempted !== 'number') c.exempted = 0
    if (typeof c.timedOut !== 'number') c.timedOut = 0
    return c
  }
  const consultAnswered = (ledger) => ledger.requests.filter((r) => r && r.status === 'answered').slice(-1)[0] || null
  const consultAwaiting = (ledger) => ledger.requests.filter((r) => r && r.status === 'awaiting').slice(-1)[0] || null
  const rosterOf = () => {
    try { return Array.isArray(kernel.members && kernel.members.roster()) ? kernel.members.roster() : [] } catch { return [] }
  }
  /**
   * The gate. Returns `{ allowed, reason, policy, ledger, error? }` and NEVER throws: the caller owns the mutation order,
   * which is how a refusal leaves the paper exactly where it was (bar the durable request it just opened — that is the
   * point of asking: the question must survive a crash, not be re-asked from scratch).
   */
  function consultGate({ state, member }) {
    const policy = consultPolicy()
    const ledger = consultOf(state)
    const wanted = ['OFFICE_CONSULT_REQUIRED', 'OFFICE_CONSULT_TIMEOUT']
    const missing = wanted.filter((k) => !codes || typeof codes[k] !== 'string')
    if (policy.status === 'invalid') {
      return { allowed: false, policy, ledger, reason: 'invalid-policy',
        error: refuse('VMU_INVALID_ARGUMENT',
          'vmu.paper.officeConsult 只能是 "required" 或 "off"，现在是 ' + JSON.stringify(policy.raw),
          '把 vmu.paper.officeConsult 改成 "required"（定稿前必须问所办）或 "off"（不要这道闸）；来源：pack defaults / 配置 / 运行时设置',
          { enforced: CONSULT_KEYS.slice(), declared: ['required', 'off'], value: policy.raw, settingValues: policy.values }) }
    }
    if (policy.status !== 'required') {
      return { allowed: true, policy, ledger, reason: 'policy:' + policy.status, armed: false }
    }
    if (CONSULT_ROLES.length === 0) {
      // ★ A gate nobody can satisfy must fail as a CONFIGURATION error, at the gate, with the missing declaration named —
      // not open a question in the ledger that no answer can ever close (that would look like "waiting forever by design").
      return { allowed: false, policy, ledger, reason: 'no-answer-role',
        error: refuse('VMU_INVALID_ARGUMENT',
          '所办问询闸是开着的（vmu.paper.officeConsult="required"），但声明这层流程的一方没有给出"谁能答复"',
          '在 createPaperFlow 里传 consultRoles:["office"]（答复角色是机构政策，内核不替它猜）；或在 pack 里把 vmu.paper.officeConsult 设成 "off"',
          { enforced: CONSULT_KEYS.slice(), declared: [], declaredAnswerRoles: [], settingValues: policy.values }) }
    }
    if (missing.length > 0) {
      return { allowed: false, policy, ledger, reason: 'codes-missing',
        error: refuse('VMU_INVALID_ARGUMENT',
          '所办问询闸是开着的（vmu.paper.officeConsult="required"），但调用方没有把这道闸的登记码传下来',
          '在声明这层流程的机构里把 codes:{' + missing.join(',') + '} 传进 createPaperFlow（内核不发明错误码）',
          { enforced: CONSULT_KEYS.slice(), declared: wanted.slice(), missing: codes ? missing : wanted.slice(), settingValues: policy.values }) }
    }
    const answered = consultAnswered(ledger)
    if (answered) {
      return { allowed: true, policy, ledger, reason: 'answered', armed: true,
        answeredBy: answered.answeredBy || null, answer: answered.answer === undefined ? null : answered.answer, requestId: answered.id || null }
    }
    const row = rosterOf().filter((m) => m && String(m.id) === str(member))[0]
    const me = [str(member), row ? str(row.slot) : ''].filter(has)
    const hit = policy.exemptRoles.filter((r) => me.includes(str(r)))
    if (hit.length > 0) {
      ledger.exempted += 1
      writeState(state)
      return { allowed: true, policy, ledger, reason: 'exempt', armed: true, exemptedBy: hit[0],
        note: 'vmu.paper.officeConsultExemptRoles 里点了「' + hit[0] + '」，所以这一篇不再等所办' }
    }
    const awaiting = consultAwaiting(ledger)
    const now = Number(clock())
    if (awaiting) {
      const waited = Number(now) - Number(awaiting.at)
      const expired = policy.timeoutMs > 0 && Number.isFinite(waited) && waited > policy.timeoutMs
      const base = { enforced: CONSULT_KEYS.slice(), declared: ['required', 'off'], currentValue: String(policy.raw),
        settingValues: policy.values, requestId: awaiting.id || null, requestedAt: awaiting.at === undefined ? null : awaiting.at,
        waitedMs: Number.isFinite(waited) ? waited : null, timeoutMs: policy.timeoutMs, onTimeout: policy.onTimeout, actedBy: str(member) }
      if (expired && policy.onTimeout === 'refuse') {
        awaiting.status = 'timed-out'
        ledger.timedOut += 1
        writeState(state)
        return { allowed: false, policy, ledger, reason: 'timeout-refused', requestCleared: true,
          error: refuse(CODES.OFFICE_CONSULT_TIMEOUT,
            '定稿被拦住：所办 ' + policy.timeoutMs + 'ms 内没有答复（vmu.paper.officeConsultOnTimeout="refuse"）',
            '重新调 recordConsult 再问一次（这条提问已作废）；或改成 "hold"（继续等、仍不放行）；或把 vmu.paper.officeConsult 设成 "off"',
            { ...base, treatedAs: 'refused', requestCleared: true }) }
      }
      if (expired) {
        ledger.timedOut += 1
        writeState(state)
        return { allowed: false, policy, ledger, reason: 'timeout-hold', requestCleared: false,
          error: refuse(CODES.OFFICE_CONSULT_TIMEOUT,
            '所办已超过 ' + policy.timeoutMs + 'ms 未答复；vmu.paper.officeConsultOnTimeout="hold" 保持提问但**不放行**',
            '等所办答复后重试；或把 onTimeout 设成 "refuse"（作废并重新问）；不要指望它自己放行',
            { ...base, heldOnTimeout: true, requestCleared: false }) }
      }
      return { allowed: false, policy, ledger, reason: 'awaiting', requestCleared: false,
        error: refuse(CODES.OFFICE_CONSULT_REQUIRED,
          '定稿前必须问所办（vmu.paper.officeConsult="required"）：这道提问还没有答复（' + (awaiting.id || '?') + '）',
          '由所办调 recordConsult({target, by:"' + (CONSULT_ROLES[0] || 'office') + '"}) 答复后重试；或把 vmu.paper.officeConsult 设成 "off"',
          { ...base, reason: 'awaiting' }) }
    }
    ledger.opened += 1
    const request = { id: 'consult-' + str(state.target) + '-' + ledger.opened, by: str(member), at: now, note: '', status: 'awaiting', policy: 'required' }
    ledger.requests.push(request)
    if (ledger.requests.length > MAX_CONSULT_REQUESTS) ledger.requests.splice(0, ledger.requests.length - MAX_CONSULT_REQUESTS)
    writeState(state)
    return { allowed: false, policy, ledger, reason: 'opened', requestId: request.id, requestCleared: false,
      error: refuse(CODES.OFFICE_CONSULT_REQUIRED,
        '定稿前必须问所办（vmu.paper.officeConsult="required"）：已向所办(' + (CONSULT_ROLES.join('|') || '未声明') + ')提出问询 ' + request.id + '，还没有答复',
        '所办调 recordConsult({target:"' + str(state.target) + '", by:"' + (CONSULT_ROLES[0] || 'office') + '"}) 答复后重试；或把 vmu.paper.officeConsult 设成 "off"（取消这道闸）',
        { enforced: CONSULT_KEYS.slice(), declared: ['required', 'off'], currentValue: String(policy.raw), settingValues: policy.values,
          requestId: request.id, requestedAt: now, actedBy: str(member), answerRoles: CONSULT_ROLES.slice() }) }
  }
  /** The office's answer. WHO may answer is POLICY (`consultRoles`, from the pack): the kit refuses anyone else with a
   *  NAMED refusal that lists the roles it would have accepted — a gate nobody can satisfy must say so out loud. */
  function recordConsult({ target, by, note = '', answer = null } = {}) {
    const { state } = requireState(target)
    if (state.status === 'finalized') {
      throw refuse(CODES.STATE, '这篇论文已经定稿了，所办问询不能再补', '问询是"定稿前"的闸：现在开始问只能对下一篇（或先把 status 改回 awaiting-editor 再走一遍）')
    }
    if (!has(by)) throw refuse('VMU_INVALID_ARGUMENT', 'recordConsult 需要 by（谁在答复：所办）', 'pass by:"office"（pack 用 consultRoles 声明答复角色）')
    const row = rosterOf().filter((m) => m && String(m.id) === str(by))[0]
    const who = [str(by), row ? str(row.slot) : ''].filter(has)
    const okRole = CONSULT_ROLES.filter((r) => who.includes(str(r)))[0]
    if (!okRole) {
      throw refuse('VMU_NOT_PERMITTED',
        '「' + str(by) + '」不能答复所办问询：只有 ' + (CONSULT_ROLES.join('|') || '（pack 没有声明答复角色）') + ' 可以',
        '答复角色是 pack 声明的事实（createPaperSubsystem → consultRoles），不是内核替它猜的；学会说"不对"比悄悄放行安全',
        { declared: CONSULT_ROLES.slice(), received: str(by), memberSlot: row ? str(row.slot) : null })
    }
    const ledger = consultOf(state)
    const awaiting = consultAwaiting(ledger)
    const now = Number(clock())
    let request = awaiting
    if (!request) {
      ledger.opened += 1
      request = { id: 'consult-' + str(state.target) + '-' + ledger.opened, by: str(by), at: now, note: '', status: 'awaiting', policy: 'required' }
      ledger.requests.push(request)
      if (ledger.requests.length > MAX_CONSULT_REQUESTS) ledger.requests.splice(0, ledger.requests.length - MAX_CONSULT_REQUESTS)
    }
    request.status = 'answered'
    request.answeredAt = now
    request.answeredBy = str(by)
    request.answeredRole = okRole
    request.note = str(note).slice(0, 2000)
    request.answer = answer === null || answer === undefined ? null : String(answer).slice(0, 2000)
    ledger.answered += 1
    writeState(state)
    return { ok: true, target: state.target, requestId: request.id, answeredBy: request.answeredBy, answeredRole: okRole,
      answeredAt: now, answered: ledger.answered, cleared: Boolean(awaiting), note: request.note }
  }
  /** Read side: the gate's own state, so a caller (or a test) can answer "was the office asked, and what did it say?" */
  function consultState({ target } = {}) {
    const { state } = requireState(target)
    const policy = consultPolicy()
    const ledger = consultOf(state)
    const awaiting = consultAwaiting(ledger)
    const answered = consultAnswered(ledger)
    return { ok: true, target: state.target, status: state.status, armed: policy.status === 'required',
      policy: { ...policy.values, raw: policy.raw, onTimeoutRaw: policy.onTimeoutRaw, answerRoles: CONSULT_ROLES.slice() },
      awaiting: awaiting ? { id: awaiting.id, at: awaiting.at, by: awaiting.by } : null,
      answered: answered ? { id: answered.id, at: answered.answeredAt, by: answered.answeredBy, role: answered.answeredRole, note: answered.note, answer: answered.answer } : null,
      requests: ledger.requests.map((r) => ({ id: r.id, status: r.status, at: r.at, by: r.by, answeredAt: r.answeredAt || null, answeredBy: r.answeredBy || null })),
      counters: { opened: ledger.opened, answered: ledger.answered, exempted: ledger.exempted, timedOut: ledger.timedOut } }
  }

  function start({ target, participants = [], editor = editorDefault, lang = 'zh', format = 'both' } = {}) {
    ensureTrack()
    if (!has(target)) throw refuse('VMU_INVALID_ARGUMENT', 'start needs the paper target', 'pass target:"<the object being written up>"')
    const list = Array.isArray(participants) ? participants.map(String).filter((x) => x !== '') : []
    if (list.length === 0) throw refuse('VMU_INVALID_ARGUMENT', 'start needs at least one writing participant', 'pass participants:["r-1", …]')
    if (readState(str(target))) throw refuse(CODES.STATE, 'a paper for "' + str(target) + '" already exists',
      'advance/finalize the existing one, or start a paper for a different target (this face never silently overwrites)')
    const state = {
      id: 'paper-' + str(target), target: str(target), status: 'writing', stage: 'writing', round: 1,
      participants: list, editor: str(editor) || 'academician', lang: lang === 'en' ? 'en' : 'zh',
      format: ['both', 'md', 'tex'].includes(format) ? format : 'both',
      parts: {}, reviews: {}, reviewOf: {}, final: null, disagreement: [], warnings: [], forcedAfterCap: false,
      // ★ E4: the ledger starts empty here so "was the office asked?" is answerable for EVERY paper, not only the ones
      // that reached the gate (an absent field would make the reader ask a second question: does null mean no or unknown?).
      consult: { requests: [], opened: 0, answered: 0, exempted: 0, timedOut: 0 },
      createdAt: 1, updatedAt: 1,
    }
    ensureTrack()
    const put = writeState(state)
    // the first write minted the id; fold it in so every later write updates the same record
    writeState(state)
    return { ok: true, target: state.target, status: state.status, round: state.round, stateRecord: state.stateRecordId || (put && put.id), fingerprint: put && put.fingerprint }
  }

  /** ② a part: written by a PARTICIPANT, in the WRITING stage; it is archived as its own record and its kernel-computed
   *  fingerprint is remembered in the state (that is what rule ① compares against later). */
  function recordPart({ target, member, title = '', solution = '', methods = '', rules = '', limits = '', evidence = [] } = {}) {
    const { state } = requireState(target)
    if (state.status !== 'writing') throw refuse(CODES.STATE, 'the paper is not in its writing stage (now: ' + state.status + ')', 'advance it back to writing before recording a part')
    if (!state.participants.includes(str(member))) throw refuse('VMU_NO_SUCH_OBJECT', str(member) + ' is not a writing participant of this paper', 'participants: ' + state.participants.join(', '))
    const part = {
      member: str(member), round: state.round, title: str(title).slice(0, 300),
      solution: str(solution).slice(0, 20000), methods: str(methods).slice(0, 20000),
      rules: str(rules).slice(0, 12000), limits: str(limits).slice(0, 12000),
      evidence: Array.isArray(evidence) ? evidence.map(String).slice(0, 50) : [],
    }
    if (!part.title && !part.solution && !part.methods && !part.rules && !part.limits) {
      throw refuse('VMU_INVALID_ARGUMENT', 'the part carries no content', 'give at least a title and one contribution field (solution/methods/rules/limits)')
    }
    const put = records.put({ track: TRACK, kind: 'paper-part', title: recordName(state.target, 'part|' + part.member), body: JSON.stringify(part), by: author })
    const previous = state.parts[part.member] || null
    state.parts[part.member] = { recordId: put && put.id, fingerprint: put && put.fingerprint, round: part.round, at: 1, title: part.title }
    state.updatedAt = 1
    writeState(state)
    return { ok: true, recorded: part.member, round: state.round, recordId: put && put.id, fingerprint: put && put.fingerprint,
      // ★ G7 finding: the old state kept ONE part per member, so a second `part` silently replaced the first. This
      // minimal fix does not claim a multi-slot model; it NAMES what was replaced so the caller can re-record it.
      replaced: previous && previous.recordId !== (put && put.id)
        ? { recordId: previous.recordId, round: previous.round, title: previous.title || null }
        : null }
  }

  /**
   * ★ F3a — who reviewed SOMEBODY ELSE'S part? A review whose subject is the reviewer themself (or a review with no
   * subject at all) is not a cross-review, no matter which way it votes: the point of 互审 is a second pair of eyes.
   * Distinct reviewers, in the order the reviews were recorded.
   */
  function crossReviewers(state, { deliverableOnly = false } = {}) {
    const out = []
    const reviews = (state && state.reviews) || {}
    const ids = Object.keys(reviews)
    for (let i = 0; i < ids.length; i += 1) {
      const id = ids[i]
      const reviewed = reviews[id]
      if (!reviewed) continue
      const of = str(reviewed.of)
      if (!of || of === str(id)) continue
      if (deliverableOnly && reviewed.deliverable !== true) continue
      if (!out.includes(str(id))) out.push(str(id))
    }
    return out
  }

  /**
   * ★ F3a — the ONE rule both the reviewing→awaiting-editor step and the finalisation step apply: a paper may only be
   * called unanimously reviewed when at least TWO DISTINCT members reviewed somebody else's part and voted deliverable.
   * With a single participant the rotation points at the participant themself, so the old check was vacuously
   * unanimous — that is the defect this refuses. The refusal names the missing half and the exact repair.
   */
  function requireCrossReview(state, where) {
    const crossers = crossReviewers(state, { deliverableOnly: true })
    if (crossers.length >= 2) return crossers
    const participants = state.participants.slice()
    const message = participants.length < 2
      ? '一位参与者的论文无法通过互审：只有 ' + participants.length + ' 位参与者（' + (participants.join('、') || '无') + '），他只能审自己的部分，互审因此是自审（a paper with one participant cannot pass 互审）'
      : '互审必须由两位不同的、非该作者的成员完成：' + participants.length + ' 位参与者里只有 ' + crossers.length + ' 位审了别人的部分（' + (crossers.join('、') || '无') + '），其余选票没有评审对象，不能算全体一致'
    throw refuse('VMU_INVALID_ARGUMENT', message,
      '再邀请一位成员参与（start 的 participants 至少两位），并让另一位成员评审这个部分（review 的 of 指向别人的 part）；自审不算互审',
      { where, participants, crossReviewers: crossers, required: 2 })
  }

  /** ③ a review: deliverable must be a real boolean ("未表态不算可交付", the original's wording). */
  function recordReview({ target, member, deliverable, comments = '', of = null } = {}) {
    const { state } = requireState(target)
    if (state.status !== 'reviewing') throw refuse(CODES.STATE, 'the paper is not in its cross-review stage (now: ' + state.status + ')', 'advance() moves writing → reviewing')
    if (!state.participants.includes(str(member))) throw refuse('VMU_NO_SUCH_OBJECT', str(member) + ' is not a review participant of this paper', 'participants: ' + state.participants.join(', '))
    if (deliverable !== true && deliverable !== false) {
      throw refuse('VMU_INVALID_ARGUMENT', 'deliverable must be true or false (an unstated verdict is NOT deliverable)', 'pass deliverable:true/false — "未表态不算可交付"')
    }
    const assigned = state.reviewOf[String(member)] || null
    const ofId = str(of || assigned || '')
    // ★ F3a: 互审 is by SOMEBODY ELSE. Refuse a review of one's own part BY NAME rather than filing it as a review —
    // with one participant the rotation had made `reviewOf[member] === member`, so this is the self-review defect.
    if (ofId && ofId === str(member)) {
      throw refuse('VMU_INVALID_ARGUMENT',
        '互审必须由另一位成员完成：' + str(member) + ' 不能评审自己写的部分——作者就是评审人，题目、证据与推导都由同一个人看过，互审没有发生（a paper part cannot be reviewed by its author）',
        '让另一位参与者评审这一部分（review 的 of 指向别人的 part）；要过互审，start 时至少要两位参与者',
        { member: str(member), of: ofId, participants: state.participants.slice() })
    }
    const review = { member: str(member), of: ofId, round: state.round, deliverable: deliverable === true, comments: str(comments).slice(0, 8000) }
    const put = records.put({ track: TRACK, kind: 'paper-review', title: recordName(state.target, 'review|' + review.member), body: JSON.stringify(review), by: author })
    state.reviews[review.member] = { recordId: put && put.id, fingerprint: put && put.fingerprint, deliverable: review.deliverable, of: review.of, round: state.round }
    state.updatedAt = 1
    writeState(state)
    return { ok: true, recorded: review.member, of: review.of, deliverable: review.deliverable, round: state.round }
  }

  /** ④ advance: the state machine. Returns what happened, or `moved:false` with the reason (never a silent no-op). */
  function advance({ target } = {}) {
    const { state } = requireState(target)
    if (state.status === 'writing') {
      if (state.participants.length === 0) throw refuse(CODES.STATE, 'no participants: nothing can be cross-reviewed', 'record at least one part and have a second participant')
      const reviewOf = {}
      for (let i = 0; i < state.participants.length; i += 1) reviewOf[state.participants[i]] = state.participants[(i + 1) % state.participants.length]
      state.status = 'reviewing'; state.stage = 'reviewing'; state.reviewOf = reviewOf; state.reviews = {}
      writeState(state)
      return { ok: true, moved: true, from: 'writing', to: 'reviewing', round: state.round, reviewOf }
    }
    if (state.status === 'reviewing') {
      const refusers = state.participants.filter((id) => !(state.reviews[id] && state.reviews[id].deliverable === true))
      if (refusers.length === 0) {
        // ★ F3a: "everyone voted deliverable" is NOT enough when nobody reviewed anybody else's part. With one participant
        // the rotation reviews the participant themself, so the filter above was vacuously unanimous. The gate runs BEFORE
        // any mutation, so a refusal leaves the paper exactly where it was (still reviewing, nothing written).
        requireCrossReview(state, 'advance')
        state.status = 'awaiting-editor'; state.stage = 'awaiting-editor'
        writeState(state)
        return { ok: true, moved: true, from: 'reviewing', to: 'awaiting-editor', round: state.round, unanimous: true }
      }
      const entry = { round: state.round, members: refusers.slice(), detail: refusers.map((id) => id + '：' + String((state.reviews[id] || {}).comments || '未说明')).join('；') }
      state.disagreement = (state.disagreement || []).concat([entry])
      if (state.round < MAX_ROUNDS) {
        state.round += 1; state.status = 'writing'; state.stage = 'writing'; state.reviews = {}
        writeState(state)
        return { ok: true, moved: true, from: 'reviewing', to: 'writing', round: state.round, refusers }
      }
      state.status = 'awaiting-editor'; state.stage = 'awaiting-editor'
      state.forcedAfterCap = true
      state.warnings = (state.warnings || []).concat(['互审在 ' + MAX_ROUNDS + ' 轮上限仍未达成全体一致（' + refusers.join('、') + '）；分歧已写入论文附录。'])
      writeState(state)
      return { ok: true, moved: true, from: 'reviewing', to: 'awaiting-editor', round: state.round, refusers, capped: true, warnings: state.warnings }
    }
    return { ok: true, moved: false, state: state.status, note: 'the flow is ' + state.status + '; only writing/reviewing advance on their own (finalize it, or start a new paper)' }
  }

  /** ⑤ the driver: advance until nothing moves (the original's paperPass, bounded so it cannot loop forever). */
  function pass({ target, maxSteps = 6 } = {}) {
    const transitions = []
    for (let i = 0; i < maxSteps; i += 1) {
      const r = advance({ target })
      if (!r.moved) return { ok: true, moved: transitions.length > 0, transitions, stopped: r.state || null }
      transitions.push({ from: r.from, to: r.to, round: r.round })
    }
    return { ok: true, moved: transitions.length > 0, transitions, stopped: 'max-steps' }
  }

  /** ★ F-123a: what a caller can DO from the paper's current status. A refusal that names an action the flow cannot
   *  take is a dead end; these three sentences each name the call that changes the answer. */
  function nextMoveFor(state) {
    const target = state.target
    if (state.status === 'writing') return 'a paper in "writing" needs its parts first: vibe_v5_paper { action: "part", target: "' + target + '", part: "<name>", body: "<json body>", member: "<author>" } — then advance() moves it to reviewing'
    if (state.status === 'reviewing') return 'a paper in "reviewing" needs every part reviewed by a member who is NOT its author: vibe_v5_paper { action: "review", target: "' + target + '", of: "<author id>", member: "<reviewer id>", deliverable: true } — advance() only moves the flow, it does not review for you'
    if (state.status === 'finalized') return 'this paper is already finalized: start a new target, or read it with vibe_v5_paper { action: "status", target: "' + target + '" }'
    return 'the flow is ' + state.status + '; only writing/reviewing advance on their own'
  }

  /** ⑥ the final decision: academician only, decision deliverable|revise (the original's two values). */
  async function recordFinal({ target, member, decision, note = '', conclusion = '' } = {}) {
    const { state } = requireState(target)
    // ★ F-123a: the hint has to name the action that can actually change the answer. `advance()` only moves the flow
    // between writing/reviewing — it never reviews a part, so "advance() until the cross-review is unanimous" told the
    // caller (run 123) to repeat a call that cannot help. Each state names its own legal next move.
    if (state.status !== 'awaiting-editor') throw refuse(CODES.STATE, 'the paper is not awaiting its editor (now: ' + state.status + ')', nextMoveFor(state))
    if (state.editor !== editorDefault) {
      throw refuse('VMU_NOT_PERMITTED', 'paperEditor is "' + state.editor + '": this paper is not the academician\'s to finalise', 'the original lets the office finalize only after consulting the institute — that path is a named gap here')
    }
    const row = (kernel.members ? kernel.members.roster() : []).filter((m) => m.id === str(member))[0]
    if (!row || String(row.slot) !== finalizerSlot) {
      throw refuse('VMU_NOT_PERMITTED', 'the academician (chair seat) must finalise this paper; "' + str(member) + '" is ' + (row ? 'in slot "' + String(row.slot) + '"' : 'not on the roster'),
        'seat an academician in the chair slot, or configure editor:"office" with its consult gap reported (named gap)')
    }
    if (decision !== 'deliverable' && decision !== 'revise') throw refuse('VMU_INVALID_ARGUMENT', 'decision must be deliverable|revise', 'the original accepts exactly these two')
    const fin = { by: str(member), decision, note: str(note).slice(0, 4000), conclusion: str(conclusion).slice(0, 20000) }
    if (decision === 'deliverable') {
      // ★ F3a: a finalisation must rest on two DISTINCT cross-reviews by non-authors. `advance` already refuses to go
      // unanimous on a self-review, but the round-cap path can still reach awaiting-editor (a lone participant forced
      // there after MAX_ROUNDS), so the editor's gate re-applies the same rule instead of trusting the state label.
      requireCrossReview(state, 'final')
      // ★ E4: 定稿前必须问所办. The gate runs BEFORE any mutation, so a refusal leaves the paper exactly where it was
      // (except the durable request it just opened — the question has to survive a crash, that is the point of asking).
      const gate = consultGate({ state, member: fin.by })
      if (!gate.allowed) throw gate.error
      const before = { hadFinal: Object.prototype.hasOwnProperty.call(state, 'final'), final: state.final, status: state.status, stage: state.stage }
      state.final = fin; state.status = 'finalized'; state.stage = 'finalized'
      writeState(state)
      // ★ F4: the path that FINALISES must be the path that is GATED. `render` is the pack's overridden face (the quality
      // gate lives there), so call it through the returned API — one call site serves both a bare render and recordFinal,
      // and the old lexical copy (which skipped the pack's gate) is gone. A refusal restores the pre-final state, because
      // a "finalized" paper whose body failed the gate is exactly the lie this defect produced.
      let rendered = null
      try {
        rendered = api.render({ target })
      } catch (e) {
        if (before.hadFinal) state.final = before.final
        else delete state.final
        state.status = before.status; state.stage = before.stage
        writeState(state)
        throw e
      }
      // The PDF is the one artefact the KERNEL must make. Its absence is reported, never hidden: a receipt that says
      // "finalized" while the fourth artefact is missing is the paper-world version of crying wolf.
      let pdf = null
      try {
        pdf = { ok: true, ...(await compilePdf({ target })) }
      } catch (e) {
        // ★ G7 ③: keep a MACHINE-READABLE engine list on the failure (the prose message alone forces a caller to parse
        // Chinese text to answer "which engines were tried, which one failed"). The array is bounded, never full logs.
        pdf = { ok: false, code: (e && e.code) || null, message: String((e && e.message) || e),
          faceCode: (e && e.faceCode) || null,
          triedEngines: Array.isArray(e && e.triedEngines) ? e.triedEngines.slice(0, 12) : [] }
      }
      return { ok: true, finalized: true, target: state.target, final: fin, artifacts: rendered.artifacts, missing: rendered.missing, pdf,
        // ★ E4: the receipt says WHICH way the consult rule was satisfied ("off" / "answered" / "exempt"): a finalisation
        // that claims the office was consulted when the gate was simply off is the sort of quiet lie this pack refuses.
        consult: { armed: gate.armed === true, satisfiedBy: gate.reason, answeredBy: gate.answeredBy || null, requestId: gate.requestId || null, note: gate.note || null } }
    }
    state.final = fin
    if (state.round < MAX_ROUNDS) {
      state.round += 1; state.status = 'writing'; state.stage = 'writing'
      state.disagreement = (state.disagreement || []).concat([{ round: state.round - 1, members: [fin.by], detail: '定稿代表要求修订：' + (fin.note || '（未说明）') }])
      writeState(state)
      return { ok: true, finalized: false, moved: true, round: state.round, status: state.status }
    }
    throw refuse(CODES.STATE, '已到 ' + MAX_ROUNDS + ' 轮上限，定稿代表仍要求修订', 'the original would have to force it; this face refuses instead of silently finalizing a revised paper')
  }

  /** Re-read a part BY ID and compare the fingerprint remembered at write time (rule ①). */
  function readPartVerified(state, member) {
    const ref = state.parts[member]
    if (!ref) return null
    const got = records.get({ id: ref.recordId })
    const full = got && got.record ? got.record : got
    const now = full && full.fingerprint
    if (now !== ref.fingerprint) {
      throw refuse(CODES.FINGERPRINT, 'part "' + member + '" no longer matches the fingerprint the state remembers (' + String(ref.fingerprint) + ' → ' + String(now) + ')',
        'the body on disk changed behind the paper\'s back; rebuild the part explicitly (record it again) — this face will NOT silently use the old text')
    }
    let body = full && full.body
    if (body === undefined && Array.isArray(full && full.blocks)) body = full.blocks.map((b) => (typeof b === 'string' ? b : b && b.text) || '').join('\n')
    try { return JSON.parse(String(body || '{}')) } catch { return null }
  }

  /** ⑦ markdown: rebuilt from the parts (by id + fingerprint), one section per the original's list.
   *  `rawMd` is the UNFILLED markdown (the seam below is applied on top); it is exported as `PaperMdRaw` so a pack that
   *  owns the fill can also produce its AUDIT from the same base instead of calling the filled version twice. */
  function rawMd({ target } = {}) {
    const { state } = requireState(target)
    const lines = ['# 论文：' + state.target, '', '状态：' + state.status + '｜轮次：' + state.round + '｜编辑：' + state.editor, '']
    // ★ EACH SECTION OWNS AT MOST ONE FIELD, and each member contributes to it ONCE. The previous shape emitted the whole part
    // under every heading, which is why the live .md carried the full body in all nine sections.
    for (let i = 0; i < SECTIONS.length; i += 1) {
      lines.push('', '## ' + SECTIONS[i])
      if (i === 0) {
        lines.push('目标对象：' + state.target + '；参与成员：' + state.participants.join('、'))
        for (const member of state.participants) {
          const part = readPartVerified(state, member)
          if (part && has(part.title)) lines.push('', '**' + part.title + '**')
        }
        continue
      }
      const field = SECTION_FIELDS[i]
      if (!field) continue
      for (const member of state.participants) {
        const part = readPartVerified(state, member)
        if (!part || !has(part[field])) continue
        lines.push('', '### ' + member + '（第 ' + part.round + ' 轮）', '', String(part[field]))
      }
      if (field === 'evidence') {
        for (const member of state.participants) {
          const part = readPartVerified(state, member)
          if (part && Array.isArray(part.evidence) && part.evidence.length) lines.push('', member + '：' + part.evidence.join('；'))
        }
      }
    }
    if (state.warnings.length) lines.push('', '## 警告', ...state.warnings.map((w) => '- ' + w))
    return lines.join('\n')
  }

  /** ⑦b the markdown every artefact is built from — the seam is applied HERE, once, so `.md`, `.tex` and the receipt agree. */
  function PaperMd(args = {}) {
    const raw = rawMd(args)
    if (!MD_FILL) return raw
    const { state } = requireState(args && args.target)
    const filled = MD_FILL(raw, { target: state.target, state })
    if (typeof filled !== 'string') {
      throw refuse('VMU_INVALID_ARGUMENT', 'mdFill must return the markdown string (got ' + typeof filled + ')',
        'the pack supplies mdFill; return the filled markdown, or null in the option to opt out')
    }
    return filled
  }

  /** ⑧ tex: same body, with the engine order's preamble needs (ctex for Chinese). */
  function PaperTex({ target } = {}) {
    const state = requireState(target).state
    const md = PaperMd({ target })
    // ★ ** is MARKDOWN bold and it is not a TeX character - it used to travel into the .tex verbatim. Convert it first, then escape.
    const esc = (s) => String(s).replace(/\*\*([^*]+)\*\*/g, '\\\\textbf{' + '$1' + '}').replace(/([&%$#_{}])/g, '\\$1')
    const body = md.split('\n').map((line) => {
      if (line.startsWith('### ')) return '\\subsection*{' + esc(line.slice(4)) + '}'
      if (line.startsWith('## ')) return '\\section*{' + esc(line.slice(3)) + '}'
      if (line.startsWith('# ')) return '\\section*{' + esc(line.slice(2)) + '}'
      return esc(line)
    }).join('\n')
    const engines = ENGINE_ORDER[state.lang] || ENGINE_ORDER.zh
    return [
      '% generated by vibe-math-vmu/kit/paper.js — engine order for ' + state.lang + ': ' + engines.join(' → '),
      '\\documentclass[11pt]{article}',
      '\\usepackage{' + REPAIR_CORE.join(',') + '}',
      '\\begin{document}',
      body,
      '\\end{document}',
    ].join('\n')
  }

  /** ⑨ the four artefacts. Missing is NAMED; the PDF is the one this kernel cannot make (no LaTeX executor). */
  function PaperArtifacts({ target } = {}) {
    const found = readState(target)
    const present = {}
    for (const name of PAPER_ARTIFACTS) {
      // EVERY artefact — including `meta` — is its own record: the state row is the flow, not the fourth artefact.
      present[name] = !!found && !!rowByTitle(recordName(str(target), name))
    }
    const missing = PAPER_ARTIFACTS.filter((n) => present[n] !== true)
    // ★★★ AN ARTEFACT INVENTORY IS NOT AN ERROR REPORT. This branch used to carry `code: PDF_NEEDS_KERNEL` and a `why` that
    // ASSERTED "this kernel has no xelatex/pdflatex/latexmk face (measured: kernel/ has no such spawn caller)" - a one-time
    // measurement hardcoded into a string, about something decided at RENDER time. Measured on a full live run: `env probe` FOUND
    // xelatex, the agent rendered, got a PDF code it could not interpret, and could not tell whether the engine was missing or the
    // COMPILE had failed (item #23). The ambiguity was manufactured here.
    // ★ So this view reports only what is in the archive: `produced: false`. It deliberately carries NO code - a code names a
    // FAILURE, and "the pdf is not written yet" is not a failure. Only render() can name PDF_NEEDS_KERNEL (it looked and found no
    // engine) versus PDF_FAILED (an engine ran and failed).
    const pdf = missing.includes('pdf')
      ? { missing: 'pdf', produced: false,
        why: 'the pdf artefact is not in the archive yet. Whether a LaTeX executor EXISTS is decided by render(): it names PDF_NEEDS_KERNEL when it finds no engine and PDF_FAILED when an engine runs and fails. `env probe` reports what the host has; this view reports what the archive holds, and it carries no error code because a missing artefact is not an error.' }
      : null
    return { ok: missing.length === 0, target: str(target), present, missing, complete: missing.length === 0, pdf,
      note: missing.length === 0 ? 'all four artefacts are present' : 'INCOMPLETE: ' + missing.join(', ') + ' — this receipt does NOT claim completion' }
  }

  /** ⑩ render: write md/tex/meta records for the current state (pdf needs the named kernel capability — never faked). */
  function render({ target } = {}) {
    const { state } = requireState(target)
    const md = PaperMd({ target })
    const tex = PaperTex({ target })
    const meta = { id: state.id, target: state.target, status: state.status, round: state.round, editor: state.editor, lang: state.lang, format: state.format, participants: state.participants, warnings: state.warnings, forcedAfterCap: state.forcedAfterCap }
    const wrote = {}
    const wantsMd = state.format === 'both' || state.format === 'md'
    const wantsTex = state.format === 'both' || state.format === 'tex'
    if (wantsMd) wrote.md = records.put({ track: TRACK, kind: 'paper-md', title: recordName(state.target, 'md'), body: md, by: author })
    if (wantsTex) wrote.tex = records.put({ track: TRACK, kind: 'paper-tex', title: recordName(state.target, 'tex'), body: tex, by: author })
    wrote.meta = records.put({ track: TRACK, kind: 'paper-meta', title: recordName(state.target, 'meta'), body: JSON.stringify(meta), by: author })
    const artifacts = PaperArtifacts({ target })
    return { ok: artifacts.complete, target: state.target, wrote: Object.keys(wrote), artifacts, missing: artifacts.missing, pdf: artifacts.pdf }
  }

  /**
   * ★ ⑪ `paperCompilePdf` — compile through the KERNEL's LaTeX face (`kernel.latex.check`), the same
   * spawn-conditioned shape as Lean: the face owns the process, the engine probing, the timeout and the killable
   * handle; this pack only supplies the source and RECORDS the result as the fourth artefact.
   *
   * Named outcomes, never silence:
   *   · no LaTeX face on this assembly ⇒ `…PAPER_EXECUTOR_MISSING` with a hint that names the host spawn seam;
   *   · the face refused (no engine / timeout / compile error) ⇒ `…PAPER_PDF_FAILED` carrying the face's own code,
   *     the engines it tried and a bounded stderr/stdout tail;
   *   · success ⇒ a `pdf` record is written, so `PaperArtifacts` really sees four artefacts.
   */
  async function compilePdf({ target, engineOrder = null, timeoutMs = null } = {}) {
    const { state } = requireState(target)
    const tex = PaperTex({ target })
    const latexFace = kernel && kernel.latex
    if (!latexFace || typeof latexFace.check !== 'function') {
      throw refuse(CODES.EXECUTOR, 'This assembly has no LaTeX face, so a PDF cannot be compiled (host injected no spawn seam)',
        '需要宿主 spawn 接缝：kernel/index.js 只在 spawn/spawnHandle 存在时创建 kernel.latex；本包不自己起子进程')
    }
    const outDir = state.outDir || (outDirPrefix + state.id)
    const request = { source: tex, outDir, sourceName: state.id + '.tex' }
    if (Array.isArray(engineOrder) && engineOrder.length > 0) request.engineOrder = engineOrder.slice()
    if (Number.isFinite(timeoutMs) && timeoutMs > 0) request.timeoutMs = Math.floor(timeoutMs)
    const r = await latexFace.check(request)
    if (!r || r.ok !== true) {
      const tail = (s) => String(s === undefined || s === null ? '' : s).slice(-1500)
      const engineList = (r && Array.isArray(r.tried) ? r.tried : []).map((t) => {
        if (t && typeof t === 'object') return [t.engine, t.phase, t.code].filter((x) => x !== undefined && x !== null && x !== '').join(':')
        return String(t)
      }).filter((x) => x !== '')
      const failure = refuse(CODES.PDF_FAILED,
        'LaTeX 编译失败：' + String((r && r.code) || 'unknown') + (r && r.engine ? '（engine=' + r.engine + '）' : '') +
          (engineList.length ? '；已试引擎=' + engineList.join(', ') : ''),
        // ★★ THE HINT MUST NAME SOMETHING THE READER CAN ACTUALLY SEE. It used to say "把 stderrTail 交给人看", and measured on a
        // full live run the agent could not: the compiler's stderr tail IS attached to this thrown error (see `failure.stderrTail`
        // below), but the TOOL RECEIPT carries only code/message/hint - the host does not relay custom error fields. So the hint
        // pointed at a name that existed on an object the receipt had already flattened away, which is the "looks correct but is
        // unusable" shape this phase keeps removing. It now says what the receipt DOES carry and what the operator can do with it.
        '这不是"论文为假"，只是**没编译出来**：回执只带 code/message/hint；编译器 stderr 的尾部在【这条错误的 `stderrTail`】上，宿主回执不转述它 —— 请把这条 message 交给人，或直接用 LaTeX 手工重跑该 .tex；回执不声称有 pdf')
      // the face's own diagnostics travel ON the error (bounded), so the caller can put them into a receipt
      failure.faceCode = (r && r.code) || null
      failure.tried = (r && Array.isArray(r.tried)) ? r.tried.slice() : []
      // ★ G7 ③: structured engines: [{engine, phase, code}] — bounded, and only the fields a caller can act on.
      failure.triedEngines = (r && Array.isArray(r.tried) ? r.tried : []).slice(0, 12).map((t) => {
        if (t && typeof t === 'object') {
          const entry = {
            engine: t.engine === undefined || t.engine === null ? null : String(t.engine),
            phase: t.phase === undefined || t.phase === null ? null : String(t.phase),
            code: t.code === undefined ? null : t.code,
          }
          // ★ Round 15 (member-reported): the compile-branch `tried` record carries engine/phase but NO code, so the
          // structured list said code:null while the message said VMU_PAPER_LATEX_FAILED. Fall back to the FACE's own
          // code for every entry that actually failed (phase compile, or an engine that was unavailable); a
          // successfully probed engine keeps code:null, which is the explicit "this engine did not error".
          if (entry.code === null && ((entry.phase === 'compile') || (t.available === false))) entry.code = (r && r.code) || null
          return entry
        }
        return { engine: String(t), phase: null, code: (r && r.code) || null }
      })
      failure.stderrTail = tail(r && r.stderr)
      failure.stdoutTail = tail(r && r.stdout)
      failure.signal = (r && r.signal) || null
      throw failure
    }
    const put = records.put({
      track: TRACK, kind: 'paper-pdf', title: recordName(state.target, 'pdf'),
      body: JSON.stringify({ pdfPath: r.pdfPath, pdfBytes: r.pdfBytes, engine: r.engine, tried: r.tried, argv: r.argv, elapsedMs: r.elapsedMs, timeoutMs: r.timeoutMs }),
      settled: true, by: author,
    })
    return { ok: true, target: state.target, engine: r.engine, pdfPath: r.pdfPath, pdfBytes: r.pdfBytes,
      tried: r.tried, elapsedMs: r.elapsedMs, recordId: put && put.id,
      artifacts: PaperArtifacts({ target }), missing: PaperArtifacts({ target }).missing }
  }

  // ★ F4: `recordFinal` renders THROUGH this object (not through a lexical copy), so a pack that wraps `render` to add a
  // gate sees the finalising path too. Declared before the return so both definitions share one binding.
  let api = null
  api = { start, recordPart, recordReview, advance, pass, recordFinal, PaperMd, PaperMdRaw: rawMd, PaperTex, PaperArtifacts, render, compilePdf,
    recordConsult, consultState,
    sections: () => SECTIONS.slice(), state: (target) => readState(target) }
  return api
}

export default createPaperFlow

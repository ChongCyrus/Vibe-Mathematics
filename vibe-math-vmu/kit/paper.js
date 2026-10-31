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
  const SECTIONS = sections, SECTION_FIELDS = sectionFields, ROUNDS_OPTION = maxRounds, ENGINE_ORDER = engineOrder, REPAIR_CORE = repairCore, TRACK = track, CODES = codes
  // ★★ RUN 154 (real machine, run 4 / FEEDBACK3 H2b): the cap used to be captured ONCE at assembly, so
  // `vibe_v5_set { key: "vmu.paper.maxRounds", value: 6 }` answered "applied, no restart needed" and the next `final` was
  // still refused at 3. The pack now passes a READER (or a number) and this face asks it at every gate, so a receipt that
  // says the setting applied is true by construction — the same discipline `consultPolicy()` already follows.
  const roundsCap = () => {
    let v = null
    try { v = typeof ROUNDS_OPTION === 'function' ? ROUNDS_OPTION() : ROUNDS_OPTION } catch { v = null }
    if (v === null || v === undefined || v === '') return 3
    const n = Number(v)
    return Number.isFinite(n) ? n : 3
  }
  // How many editor-initiated repair rounds are allowed AFTER the cross-review cap: the cap limits the review loop, it
  // must not turn a paper into an object that can neither be finalised (content gate) nor revised (round cap).
  const REPAIR_ROUNDS = 2
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
  // ★★ RUN 162 (real machine, run 10 / FEEDBACK9 item 8 — TWO SPELLINGS, TWO OPPOSITE CONCLUSIONS): the paper track
  // carries one STATE row and four ARTEFACT rows per paper, and the artefact rows' bodies carry `id`/`target`/`status`
  // too (the meta row literally copies them). Reading `st.id` off ANY paper row therefore let an artefact row answer
  // for its paper: `target:"paper-p14"` resolved the META row (reviews {}, no consult ledger), so `final` refused
  // with "0 位互审" and `consult_state` reported "no requests" while the title spelling saw both. A paper is its
  // STATE row — the artefact rows are its outputs, never its identity.
  const stateRows = () => listPaper().filter((r) => /\|state$/.test(String(r.title || '')) || String(r.kind || '') === 'paper-state')
  const PORTABLE_TARGET = /^[A-Za-z0-9][A-Za-z0-9._-]{0,59}$/
  const stateOfRow = (row) => {
    let body = row && row.body
    if (body === undefined && row && Array.isArray(row.blocks)) body = row.blocks.map((b) => (typeof b === 'string' ? b : b && b.text) || '').join('')
    // ★★ RUN 158: `records.list` rows carry METADATA ONLY (id/track/kind/title/status/fingerprint) - no body, no blocks.
    // Reading the minted id off a listed row therefore silently answered `{}` and the id the receipt printed stayed
    // unreachable; the body has to be fetched per row (one small read per paper, only on this fallback path).
    if (body === undefined && row && row.id) {
      try {
        const got = records.get({ id: row.id })
        const full = got && got.record ? got.record : got
        body = full && full.body
        if (body === undefined && full && Array.isArray(full.blocks)) body = full.blocks.map((b) => (typeof b === 'string' ? b : b && b.text) || '').join('')
      } catch { body = undefined }
    }
    try { return JSON.parse(String(body || '{}')) } catch { return null }
  }
  // ★★ RUN 158 (real machine, run 6 / feedback N2 — THE PAPER THAT COULD NOT BE COMPILED): `start` without a target
  // names the paper after its TITLE, and that title became BOTH the plate id (`paper-第五次续跑 之 结题 现场 验证 稿`)
  // and the directory name. xelatex refused the directory (`xelatex.exe: fatal: putenv(TEXMF_OUTPUT_DIRECTORY=…)`) while
  // the very same body compiled fine under an ASCII name — so a legal Chinese title could make the compiler unreachable.
  // The TITLE is still the title (rows are titled by it and every action still addresses the paper by it); the durable
  // ID and the folder are now ASCII: a portable target keeps `paper-<target>`, anything else is minted `paper-pN`.
  const mintPaperId = () => {
    const used = new Set()
    for (const row of stateRows()) {
      const st = stateOfRow(row)
      if (st && st.id) used.add(String(st.id))
    }
    for (let n = 1; n <= 999; n += 1) {
      const cand = 'paper-p' + String(n)
      if (!used.has(cand) && !rowByTitle(recordName('p' + String(n), 'state'))) return cand
    }
    throw refuse(CODES.STATE, 'could not mint an unused paper id',
      'start the paper with an explicit target (target:"p12") so its id is portable by construction')
  }
  const readState = (target) => {
    // ★★ RUN 154 (real machine, run 4 / FEEDBACK3 H3): the tool receipt calls the object "paper-p5" while every
    // action addresses it by "p5", so a caller that copies the id it was just handed was told 'no paper "paper-p5" exists'.
    // Both spellings name the same paper here; the state keeps ONE name (the target) as the truth.
    let word = str(target)
    let row = rowByTitle(recordName(word, 'state'))
    if (!row && /^paper-/.test(word)) { word = word.replace(/^paper-/, ''); row = rowByTitle(recordName(word, 'state')) }
    // ★★ RUN 158 (N2): a paper that got a MINTED id (`paper-p3`) is not titled by that id, so the id the receipt prints
    // must still address it — otherwise the advertised repair ("address the paper by its id") names an unreachable object.
    // ★ NOTE the ORIGINAL spelling is tested here: the strip above turned `paper-p3` into `p3`, which is exactly the
    // form that is NOT a paper-p id, so testing `word` would make the advertised id unreachable again.
    if (!row && /^paper-p[0-9]+$/.test(str(target))) {
      // ★★ RUN 162: STATE rows only (see `stateRows`) — an artefact row's body also carries `id`, and matching it made
      // `final`/`consult` disagree with `status`/`render` about the same paper.
      for (const cand of stateRows()) {
        const st = stateOfRow(cand)
        if (st && String(st.id) === str(target)) { row = cand; break }
      }
    }
    // ★★ RUN 164 (FEEDBACK12 item 7): a caller that copies the paper's TITLE (what `start`/`status` print as the human
    // name, e.g. a Chinese heading) used to be told the paper does not exist, even though the title is exactly what the
    // receipts show. The title now resolves too — the state keeps ONE name (the target) as the truth, so every receipt
    // still answers with the target; this only widens what may be passed IN.
    let matchedBy = word === str(target) ? 'target' : 'paper-id'
    if (!row) {
      for (const cand of stateRows()) {
        const st = stateOfRow(cand)
        if (!st) continue
        const names = [st.title, st.target].filter((x) => x !== undefined && x !== null).map(String)
        if (names.includes(str(target))) { row = cand; matchedBy = 'title'; break }
      }
    }
    if (!row) return null
    const got = records.get({ id: row.id })
    const full = got && got.record ? got.record : got
    let body = full && full.body
    if (body === undefined && Array.isArray(full && full.blocks)) body = full.blocks.map((b) => (typeof b === 'string' ? b : b && b.text) || '').join('\n')
    try {
      const state = JSON.parse(String(body || '{}'))
      // ★★ RUN 152 (real machine, run 2, agent feedback F5 — SILENT LOST UPDATE): the state row is rewritten IN PLACE,
      // and two `part` calls that ran CONCURRENTLY both read the same body, both said ok:true, and the second write
      // dropped the first member's part (measured: rec-29 vanished while its receipt said ok). A read snapshot is now
      // remembered on the returned object (non-enumerable, so it never enters the durable body) and `writeState` refuses
      // the write when the row moved in between: a concurrent edit is a NAMED conflict, never a silent merge or a silent
      // loss.
      if (full && full.rev !== undefined) {
        Object.defineProperty(state, '__seen', { value: { rev: full.rev, updatedAt: full.updatedAt === undefined ? null : full.updatedAt }, enumerable: false, writable: true, configurable: true })
      }
      if (matchedBy === 'title') Object.defineProperty(state, '__matchedBy', { value: 'title', enumerable: false, writable: true, configurable: true })
      return { state, row: full }
    } catch { return null }
  }
  const writeState = (state) => {
    // ONE state record, updated IN PLACE: `records.put` with the remembered id writes a new revision, so the paper has
    // exactly one live state row (a fresh id per write would leave duplicates whose list order decides the truth).
    // ★★ RUN 152 (F5): before writing, verify the row has not moved since this state snapshot was read. Two concurrent
    // `part` calls used to both succeed and the later write silently dropped the earlier one; now the stale writer is
    // refused BY NAME (the caller retries on the fresh body) and nothing is lost.
    const seen = state && state.__seen ? state.__seen : null
    if (state.stateRecordId && seen && seen.rev !== undefined && seen.rev !== null) {
      let cur = null
      try {
        const got = records.get({ id: state.stateRecordId })
        cur = got && got.record ? got.record : got
      } catch { cur = null }
      if (cur && cur.rev !== undefined && cur.rev !== null && String(cur.rev) !== String(seen.rev)) {
        throw refuse(CODES.STATE,
          'paper "' + state.target + '" was changed by another writer between this call\'s read and its write (revision ' + String(seen.rev) + ' → ' + String(cur.rev) + '): this write would drop that change, so nothing was written',
          're-read the paper (vibe_v5_paper { action: "status", target: "…" }) and retry this call on the fresh state — concurrent writes to one paper are not merged silently')
      }
    }
    const put = records.put({
      id: state.stateRecordId || null,
      track: TRACK, kind: 'paper-state', title: recordName(state.target, 'state'),
      body: JSON.stringify(state), settled: state.status === 'finalized', by: author,
    })
    if (put && put.id) state.stateRecordId = put.id
    // the new revision becomes this snapshot's baseline, so a second write from the SAME call chain is not a conflict
    if (state.stateRecordId) {
      try {
        const got = records.get({ id: state.stateRecordId })
        const full = got && got.record ? got.record : got
        if (full && full.rev !== undefined) {
          Object.defineProperty(state, '__seen', { value: { rev: full.rev, updatedAt: full.updatedAt === undefined ? null : full.updatedAt }, enumerable: false, writable: true, configurable: true })
        }
      } catch { /* the write itself succeeded; only the baseline refresh is best-effort */ }
    }
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
        waitedMs: Number.isFinite(waited) ? waited : null, timeoutMs: policy.timeoutMs, onTimeout: policy.onTimeout, actedBy: str(member),
        // ★★ RUN 154 (G9, second site): this is the refusal the real office actually hit — the field the ANSWER call
        // takes is `target`, and it was only inside the hint's prose, so a caller reading fields had to parse Chinese to
        // find it. Same key, same value, now a first-class field.
        target: str(state.target), paperId: str(state.id) }
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
          { ...base, reason: 'awaiting', target: str(state.target), paperId: str(state.id) }) }
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
          requestId: request.id, requestedAt: now, actedBy: str(member), answerRoles: CONSULT_ROLES.slice(),
          // ★★ RUN 154 (G9): the key the fix has to carry is `target` (the answer call's argument), and it is now on the
          // receipt itself — run 4 measured the office answering, hitting 'no target was given', and retrying blind.
          target: str(state.target), paperId: str(state.id) }) }
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

  function start({ target, title = '', participants = [], editor = editorDefault, lang = 'zh', format = 'both' } = {}) {
    ensureTrack()
    if (!has(target)) throw refuse('VMU_INVALID_ARGUMENT', 'start needs the paper target', 'pass target:"<the object being written up>"')
    const list = Array.isArray(participants) ? participants.map(String).filter((x) => x !== '') : []
    if (list.length === 0) throw refuse('VMU_INVALID_ARGUMENT', 'start needs at least one writing participant', 'pass participants:["r-1", …]')
    // ★★ RUN 152 (real machine, run 2 of the simulation): `editor` used to be stored VERBATIM, so starting a paper with
    // `editor:"r-acad"` (the chair-seated member, i.e. the academician) produced a paper whose finalisation was then
    // refused by `recordFinal`, which only accepts the ROLE word "academician" — the flow let a caller configure a paper
    // it could never finalise, and only said so at the LAST step (4 attempts, three papers wasted). The role is
    // resolved HERE, where the answer is still actionable: a member id is accepted exactly when that member sits in the
    // chair slot, and anything else is refused by name before the paper exists.
    const editorWord = str(editor) || editorDefault
    let editorName = editorWord
    if (editorWord !== editorDefault && editorWord !== 'office') {
      const seat = (kernel.members ? kernel.members.roster() : []).filter((m) => String(m.id) === editorWord)[0] || null
      if (seat && String(seat.slot) === finalizerSlot) editorName = editorDefault
      else {
        throw refuse('VMU_INVALID_ARGUMENT',
          'paper editor "' + editorWord + '" is neither the academician role nor a member seated in the chair slot'
            + (seat ? ' (that member is in slot "' + String(seat.slot) + '")' : ' (no such member on the roster)'),
          'pass editor:"academician" (the member in the chair seat finalises: this is the default) or editor:"office" (the office finalises after consulting the institute); an id is accepted only for a chair-seated member, which is recorded as "academician"')
      }
    }
    if (readState(str(target))) throw refuse(CODES.STATE, 'a paper for "' + str(target) + '" already exists',
      'advance/finalize the existing one, or start a paper for a different target (this face never silently overwrites)')
    // ★★ RUN 158 (N2): see mintPaperId above — the id/folder must be ASCII even when the title is not.
    const targetWord = str(target)
    const asciiSafe = PORTABLE_TARGET.test(targetWord)
    const plateId = asciiSafe ? 'paper-' + targetWord : mintPaperId()
    const state = {
      id: plateId, target: targetWord, title: str(title) || targetWord, status: 'writing', stage: 'writing', round: 1,
      participants: list, editor: editorName, lang: lang === 'en' ? 'en' : 'zh',
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
    // ★★ RUN 156 (run-5 finding 6): the receipt named the target but never the paper ID, so a caller could not address the
    // paper by the id every later receipt prints; and the folder is announced HERE because a title-derived id used to
    // reach compile as a directory name with spaces (fatal for xelatex `putenv`).
    return { ok: true, target: state.target, title: state.target, paperTitle: state.title || state.target, id: state.id, folder: folderOf(state.id),
      titleMeans: "`title` on this receipt is the paper address (what every action takes as `target`) — the human name given at start is `paperTitle` (either spelling addresses the paper, and receipts answer with the address)",
      asciiSafe, idMinted: asciiSafe === false,
      idMeans: asciiSafe
        ? 'the id is paper-<target> and the folder is its slug (both portable)'
        : 'the title is not a portable file name, so the plate id and the folder were minted in ASCII (paper-pN): address the paper by this id OR by its title — both resolve — and the compiler never sees the Chinese title as a directory',
      // ★★ ROUND 159 (FEEDBACK6 item 1): `asciiSafe:false` used to be readable two ways ("the title is not ASCII"
      // vs "the directory is unsafe"). It says the first thing, and the second fact is its own sentence.
      asciiSafeMeans: asciiSafe
        ? 'the target itself is a portable ASCII name, so the plate id is derived from it and the directory is that name'
        : 'THE TITLE is not a portable ASCII file name (that is what this flag reports). The DIRECTORY and the plate id are ASCII anyway (see `id`/`folder`): the flag is not a warning that the compile path is unsafe',
      status: state.status, round: state.round,
      stateRecord: state.stateRecordId || (put && put.id), fingerprint: put && put.fingerprint }
  }

  /** ② a part: written by a PARTICIPANT, in the WRITING stage; it is archived as its own record and its kernel-computed
   *  fingerprint is remembered in the state (that is what rule ① compares against later). */
  function recordPart({ target, member, title = '', solution = '', methods = '', rules = '', limits = '', evidence = [] } = {}) {
    const { state } = requireState(target)
    // ★★ RUN 152: the hint used to say "advance it back to writing", which is a call the flow cannot make (advance
    // only moves writing→reviewing→awaiting-editor and returns moved:false at awaiting-editor). The reachable repair is
    // the editor sending the paper back with decision:"revise", which is what the hint now names.
    if (state.status !== 'writing') throw refuse(CODES.STATE, 'the paper is not in its writing stage (now: ' + state.status + ')', 'the reachable repair is the editor sending it back: vibe_v5_paper { action: "final", target: "' + state.target + '", member: "<the member in the chair seat>", decision: "revise", note: "<what to fix>" } turns it back to writing (a request to "advance it back" is not a move this flow can take); after that the part can be recorded again')
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
      // ★★ RUN 164 (FEEDBACK12 item 5): "replaced" named WHICH record went away but not how much text it carried, so a
      // second `part` from the same member read like an append to anyone who did not compare titles. The receipt now
      // carries both sizes and the fact that this is a WHOLE-SECTION REPLACEMENT, not an addition.
      replaced: previous && previous.recordId !== (put && put.id)
        ? (function () {
          let oldBytes = null
          try { const prevRow = records.get({ id: previous.recordId }); oldBytes = prevRow && prevRow.body !== undefined ? String(prevRow.body).length : null } catch { oldBytes = null }
          return { recordId: previous.recordId, round: previous.round, title: previous.title || null,
            oldBytes, newBytes: String(JSON.stringify(part)).length,
            means: 'a member holds ONE part slot: this call replaced the section recorded earlier (oldBytes → newBytes), it did not add a second section — read action:"status" to confirm what the body now holds' }
        })()
        : null }
  }

  /**
   * ★ F3a — who reviewed SOMEBODY ELSE'S part? A review whose subject is the reviewer themself (or a review with no
   * subject at all) is not a cross-review, no matter which way it votes: the point of 互审 is a second pair of eyes.
   * Distinct reviewers, in the order the reviews were recorded.
   */
  /** The durable review row for one member in THIS round, or null (the same row `advance` reads: `paper-review`
   *  titled `v5r-paper|<target>|review|<member>`, newest first). Used when the state's `reviews` CACHE is missing
   *  what the record already holds — the two faces must not disagree about whether a review happened. */
  function reviewRowOf(state, member) {
    const want = recordName(state.target, 'review|' + member)
    let rows = []
    try { const got = records.list({ track: TRACK, limit: 2000 }); rows = Array.isArray(got.items) ? got.items : [] } catch { return null }
    const row = rows.filter((r) => String(r.title) === want).sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))[0] || null
    if (!row) return null
    let body = null
    try { const g = records.get({ id: row.id }); const full = g && g.record ? g.record : g; body = JSON.parse(String((full && full.body) || '{}')) } catch { return null }
    if (!body || String(body.member) !== String(member)) return null
    return { recordId: row.id, body }
  }
  /** The durable review row for one member in THIS round, or null (the same row `advance` reads: `paper-review`
   *  titled `v5r-paper|<target>|review|<member>`, newest first). Used when the state's `reviews` CACHE is missing
   *  what the record already holds — two faces must not disagree about whether a review happened. */
  function reviewRowOf(state, member) {
    const want = recordName(state.target, 'review|' + member)
    let rows = []
    try { const got = records.list({ track: TRACK, limit: 2000 }); rows = Array.isArray(got.items) ? got.items : [] } catch { return null }
    const row = rows.filter((r) => String(r.title) === want).sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))[0] || null
    if (!row) return null
    let body = null
    try { const g = records.get({ id: row.id }); const full = g && g.record ? g.record : g; body = JSON.parse(String((full && full.body) || '{}')) } catch { return null }
    if (!body || String(body.member) !== String(member)) return null
    return { recordId: row.id, body }
  }
  function crossReviewers(state, { deliverableOnly = false } = {}) {
    const out = []
    const reviews = (state && state.reviews) || {}
    // ★★ RUN 162 (real machine, run 10 / FEEDBACK9 item 8): the cache is a CACHE. In the SAME round where `advance`
    // returned `unanimous:true` + two `reviewsRead`, `final` refused with `crossReviewers: []` because only the cache
    // was read. The durable `paper-review` row for THIS round is the truth, so it is consulted here and the cache is
    // healed — the discipline `advance` already follows, applied to the second door that makes the same claim.
    if (deliverableOnly) {
      const participants = Array.isArray(state && state.participants) ? state.participants : []
      for (const id of participants) {
        const snap = reviews[id]
        if (snap && snap.deliverable === true && str(snap.of) && str(snap.of) !== str(id)) continue
        const found = reviewRowOf(state, id)
        if (!found) continue
        const b = found.body || {}
        if (Number(b.round) !== Number(state.round)) continue
        if (b.deliverable !== true || String(b.of || '') === String(id)) continue
        reviews[id] = { recordId: found.recordId, fingerprint: null, deliverable: true, of: b.of, round: b.round, comments: str(b.comments) }
      }
    }
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
    // ★★ RUN 162: state BOTH readings, so a mismatch between the cache and the record is visible in the refusal
    // instead of presenting itself as "the members never reviewed" (run 10 lost an hour to exactly that).
    const onDisk = participants.filter((id) => {
      const found = reviewRowOf(state, id)
      const b = (found && found.body) || null
      return !!(b && Number(b.round) === Number(state.round) && b.deliverable === true && String(b.of || '') !== String(id))
    })
    const message = participants.length < 2
      ? '一位参与者的论文无法通过互审：只有 ' + participants.length + ' 位参与者（' + (participants.join('、') || '无') + '），他只能审自己的部分，互审因此是自审（a paper with one participant cannot pass 互审）'
      : '互审必须由两位不同的、非该作者的成员完成：' + participants.length + ' 位参与者里只有 ' + crossers.length + ' 位审了别人的部分（' + (crossers.join('、') || '无') + '），其余选票没有评审对象，不能算全体一致'
    throw refuse('VMU_INVALID_ARGUMENT', message,
      '再邀请一位成员参与（start 的 participants 至少两位），并让另一位成员评审这个部分（review 的 of 指向别人的 part）；自审不算互审',
      { where, participants, crossReviewers: crossers, reviewsOnDisk: onDisk, required: 2 })
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
      // ★★ RUN 154 (real machine, run 4 / FEEDBACK3 H1 — the worst one): two members filed `deliverable:true`, both
      // receipts said so, both review ROWS were on disk, and `advance` still reported one of them as a refuser ("未说明")
      // and sent the paper back to writing — 3 times in a row for the same member. The state's `reviews` map is a CACHE;
      // the durable `paper-review` row for THIS round is the truth. A member whose row says deliverable is read from the
      // row (and the cache is re-healed), so a lost snapshot write can no longer invent a disagreement.
      const readReview = (member) => {
        const snap = state.reviews[member]
        if (snap && snap.deliverable === true) return { deliverable: true, comments: str(snap.comments), source: 'state', recordId: snap.recordId || null }
        const want = recordName(state.target, 'review|' + member)
        let rows = []
        try { const got = records.list({ track: TRACK, limit: 2000 }); rows = Array.isArray(got.items) ? got.items : [] } catch { rows = [] }
        // newest first: the head projection carries `updatedAt` (not `rev`), and a corrected review is re-put
        const row = rows.filter((r) => String(r.title) === want).sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))[0] || null
        if (!row) return { deliverable: false, comments: snap ? str(snap.comments) : '', source: 'none', recordId: null }
        let body = null
        try { const g = records.get({ id: row.id }); const full = g && g.record ? g.record : g; body = JSON.parse(String((full && full.body) || '{}')) } catch { body = null }
        if (!body || String(body.member) !== String(member)) return { deliverable: false, comments: '', source: 'none', recordId: row.id }
        if (Number(body.round) !== Number(state.round)) {
          return { deliverable: false, comments: 'a review row exists for round ' + body.round + ', not this round (' + state.round + ')', source: 'durable-other-round', recordId: row.id }
        }
        state.reviews[member] = { recordId: row.id, fingerprint: row.fingerprint || null, deliverable: body.deliverable === true, of: body.of, round: body.round, comments: str(body.comments) }
        return { deliverable: body.deliverable === true, comments: str(body.comments), source: 'durable', recordId: row.id }
      }
      const verdicts = state.participants.map((id) => Object.assign({ member: id }, readReview(id)))
      const reviewsRead = verdicts.map((v) => ({ member: v.member, deliverable: v.deliverable === true, source: v.source, recordId: v.recordId || null }))
      const refusers = verdicts.filter((v) => v.deliverable !== true).map((v) => v.member)
      if (refusers.length === 0) {
        // ★ F3a: "everyone voted deliverable" is NOT enough when nobody reviewed anybody else's part. With one participant
        // the rotation reviews the participant themself, so the filter above was vacuously unanimous. The gate runs BEFORE
        // any mutation, so a refusal leaves the paper exactly where it was (still reviewing, nothing written).
        requireCrossReview(state, 'advance')
        state.status = 'awaiting-editor'; state.stage = 'awaiting-editor'
        writeState(state)
        return { ok: true, moved: true, from: 'reviewing', to: 'awaiting-editor', round: state.round, unanimous: true, reviewsRead }
      }
      // The detail must state WHAT WAS READ, not a shrug: '未说明' was printed even when the member had filed a review
      // whose row was on disk (that is exactly how run 4's disagreement looked while the cards said deliverable:true).
      const entry = { round: state.round, members: refusers.slice(), detail: refusers.map((id) => {
        const v = verdicts.filter((x) => x.member === id)[0] || { comments: '', source: 'none' }
        const why = v.comments ? String(v.comments)
          : (v.source === 'none' ? '没有本轮的评审行（未表态）' : '评审行在记录里、但这一轮不算作可交付')
        return id + '：' + why
      }).join('；') }
      state.disagreement = (state.disagreement || []).concat([entry])
      if (state.round < roundsCap()) {
        state.round += 1; state.status = 'writing'; state.stage = 'writing'; state.reviews = {}
        writeState(state)
        return { ok: true, moved: true, from: 'reviewing', to: 'writing', round: state.round, refusers, reviewsRead }
      }
      state.status = 'awaiting-editor'; state.stage = 'awaiting-editor'
      state.forcedAfterCap = true
      state.warnings = (state.warnings || []).concat(['互审在 ' + roundsCap() + ' 轮上限仍未达成全体一致（' + refusers.join('、') + '）；分歧已写入论文附录。'])
      writeState(state)
      return { ok: true, moved: true, from: 'reviewing', to: 'awaiting-editor', round: state.round, refusers, capped: true, warnings: state.warnings, reviewsRead }
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
    // ★★ RUN 152: this refusal used to be ONE sentence for two different facts, and it printed
    // "this paper is not the academician's to finalise" even when the academician WAS the signer (the paper had been
    // started with a member id as its editor) — a message that is literally false about the state it describes. The
    // two facts are now separated: an office-edited paper is the named consult gap, and anything else names the role
    // the flow accepts and how to get one. `start` above normalises a chair-seated member id to "academician", so a
    // paper created by the current build cannot reach the second branch through that spelling.
    if (state.editor === 'office') {
      throw refuse('VMU_NOT_PERMITTED', 'this paper is edited by the office, and the office may finalise only after consulting the institute — that path is a named gap in this build',
        'start the paper with editor:"academician" so the member in the chair seat finalises it (record the office consult answer with action:"consult" — the gate stays closed until the office answers, and a named gap is not a passing gate)')
    }
    if (state.editor !== editorDefault) {
      throw refuse('VMU_NOT_PERMITTED', 'paperEditor is "' + state.editor + '": the flow finalises only an "academician"-edited paper signed by the member in the chair seat',
        'start the paper with editor:"academician" (default) — a member id is accepted at start only for a chair-seated member and is recorded as "academician"')
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
        pdf = { ok: true, produced: true, ...(await compilePdf({ target })) }
      } catch (e) {
        // ★ G7 ③: keep a MACHINE-READABLE engine list on the failure (the prose message alone forces a caller to parse
        // Chinese text to answer "which engines were tried, which one failed"). The array is bounded, never full logs.
        pdf = { ok: false, code: (e && e.code) || null, message: String((e && e.message) || e),
          faceCode: (e && e.faceCode) || null,
          triedEngines: Array.isArray(e && e.triedEngines) ? e.triedEngines.slice(0, 12) : [],
          // ★★ RUN 153 (real machine, run 3 / agent report G10): `action:"compile"` carried the compiler's words and the
          // exact argv, while the FINAL receipt for the SAME failure carried neither — so the most important door
          // (finalisation) was the least informative one. One failure structure, both doors.
          argv: Array.isArray(e && e.argv) ? e.argv.slice(0, 16) : [],
          stderrTail: e && e.stderrTail ? String(e.stderrTail).slice(-1500) : '',
          stdoutTail: e && e.stdoutTail ? String(e.stdoutTail).slice(-1500) : '',
          tailSource: (e && e.tailSource) || null,
          // ★★ RUN 158 (run 6 / item 6): same fields as `action:"compile"` — one failure structure, both doors.
          outDir: (e && e.outDir) || null,
          sourceName: (e && e.sourceName) || null,
          tailsIdentical: e && e.tailsIdentical === true,
          signal: (e && e.signal) || null }
      }
      // ★★ RUN 154 (G10): run 4's final receipt said `"missing":["pdf"]` AND `"pdf":{"ok":true,...}` in the SAME answer —
      // `missing` was the pre-compile artefact list and the compile had just succeeded. The list is recomputed around the
      // compile that actually ran, so the two statements can no longer contradict each other.
      const missingAfter = (Array.isArray(rendered.missing) ? rendered.missing : []).filter((m) => !(pdf && pdf.ok === true && m === 'pdf'))
      return { ok: true, finalized: true, target: state.target, final: fin, artifacts: rendered.artifacts, missing: missingAfter, pdf,
        // ★ E4: the receipt says WHICH way the consult rule was satisfied ("off" / "answered" / "exempt"): a finalisation
        // that claims the office was consulted when the gate was simply off is the sort of quiet lie this pack refuses.
        consult: { armed: gate.armed === true, satisfiedBy: gate.reason, answeredBy: gate.answeredBy || null, requestId: gate.requestId || null, note: gate.note || null } }
    }
    state.final = fin
    const capNow = roundsCap()
    if (state.round < capNow) {
      state.round += 1; state.status = 'writing'; state.stage = 'writing'
      state.disagreement = (state.disagreement || []).concat([{ round: state.round - 1, members: [fin.by], detail: '定稿代表要求修订：' + (fin.note || '（未说明）') }])
      writeState(state)
      // ★★ RUN 158 (run 6 / N5): this branch moved the paper awaiting-editor → writing but reported `from:null,to:null`
      // (only the REPAIR branch named the move), so a reader could not tell a revision from a repair round.
      return { ok: true, finalized: false, moved: true, from: 'awaiting-editor', to: 'writing', round: state.round, status: state.status,
        repair: false, repairs: Number(state.repairs || 0), repairBudget: REPAIR_ROUNDS, cap: capNow }
    }
    // ★★ RUN 154 (real machine, run 4 / FEEDBACK3 H2 — DEADLOCK): at the cross-review cap the paper sat in
    // `awaiting-editor` where `deliverable` was refused by the content gate (a verified title line missing) and `revise`
    // was refused by the round cap — `part` only writes in `writing`, so NO call could change the body: the paper became
    // dead data. The cap limits the REVIEW loop; the editor gets a bounded number of REPAIR rounds to fix the body
    // (each one is recorded as a repair, so it can never be mistaken for a fresh review round).
    const repairs = Number(state.repairs || 0)
    if (repairs < REPAIR_ROUNDS) {
      state.repairs = repairs + 1
      state.status = 'writing'; state.stage = 'writing'
      state.disagreement = (state.disagreement || []).concat([{ round: state.round, members: [fin.by], detail: '定稿代表要求修订（轮数上限后的第 ' + state.repairs + ' 次修复轮，不计入互审轮次）：' + (fin.note || '（未说明）') }])
      writeState(state)
      return { ok: true, finalized: false, moved: true, from: 'awaiting-editor', to: 'writing', round: state.round, status: state.status, repair: true, repairs: state.repairs, repairBudget: REPAIR_ROUNDS, cap: capNow }
    }
    // ★★ RUN 158 (real machine, run 6 / feedback N1 — A HINT THAT NAMED AN UNREACHABLE EXIT): the old text offered
    // (a) "record a new part", which the flow refuses in awaiting-editor (parts write in `writing` only), so the advice
    // closed a circle; and (b) said raising `vmu.paper.maxRounds` lets the paper "revise again", which is only true when
    // the new cap is STRICTLY ABOVE the current round (otherwise the next revise is another repair round, of which there
    // are none left). Both are now stated with the numbers that decide them.
    throw refuse(CODES.STATE,
      '已到 ' + capNow + ' 轮上限，且 ' + REPAIR_ROUNDS + ' 次修复轮也用完了（round=' + state.round + '，repairsUsed=' + repairs + '/' + REPAIR_ROUNDS + '），定稿代表仍要求修订',
      'this face has no force flag. The exits that really exist: (1) raise vmu.paper.maxRounds to a number STRICTLY GREATER than the current round (' + state.round + ') with vibe_v5_set {key:"vmu.paper.maxRounds",value:' + (state.round + 1) + ',why:"…"} — the next revise is then an ordinary revision that reopens writing; raising it to ' + state.round + ' or below does NOT help, because the next revise would be another repair round and the repair budget is spent; (2) start a new paper for a new target with a body that satisfies the content gate. Recording a new part is NOT an exit here: parts can only be written while the paper is in writing')
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
    // ★ ** is MARKDOWN bold and it is not a TeX character - it used to travel into the .tex verbatim. Convert it first,
    // then escape.
    // ★★ RUN 152 (real machine, run 2): the ORDER was backwards — the bold conversion inserted a literal `\\textbf{…}`
    // and the escaping pass that ran AFTER it escaped the braces it had just produced, so every heading came out as
    // `\\textbf\{1 · …\}`. Measured: xelatex stopped at "! Undefined control sequence." and the PDF was never produced
    // (`VMU_PAPER_LATEX_FAILED`), which made the paper stage unfinishable. Escape the TEXT first (so the braces are
    // escaped as content), then wrap the bold run — the `\textbf{` this pass writes is markup and must stay unescaped.
    const escText = (s) => String(s).replace(/([&%$#_{}])/g, '\\$1')
    const esc = (s) => escText(String(s)).replace(/\*\*([^*]+)\*\*/g, (m, inner) => '\\textbf{' + inner + '}')
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
    // ★★ RUN 161 (FEEDBACK8 item 5.2): the four artefact rows are titled `v5r-paper|<the paper's OWN target>|md` …, and
    // this view built those titles from the CALLER's spelling. Measured on run 9: `final` was called with the paper's id
    // while the state's target is the title, so all four rows looked missing in the same receipt that carried a produced
    // 97 KB PDF. The canonical target comes from the state row, never from the argument.
    const canon = found && found.state && found.state.target !== undefined && found.state.target !== null && str(found.state.target) !== ''
      ? str(found.state.target)
      : str(target)
    const present = {}
    for (const name of PAPER_ARTIFACTS) {
      // EVERY artefact — including `meta` — is its own record: the state row is the flow, not the fourth artefact.
      present[name] = !!found && !!rowByTitle(recordName(canon, name))
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
    return { ok: missing.length === 0, target: canon, requestedTarget: str(target), present, missing, complete: missing.length === 0, pdf,
      // ★★ RUN 161 (FEEDBACK8 item 5.2): say what a "missing" name MEANS. These are ARCHIVE ROWS (each artefact is its own
      // record), not capabilities: an absent row says the writing activity has not run, not that the text or PDF cannot be
      // made (a produced PDF in the same receipt is the proof it was).
      missingMeans: missing.length === 0
        ? 'all four ARCHIVE rows are present: each artefact is its own record (v5r-paper|<target>|md|tex|meta|pdf), not a file in the flow state'
        : 'these are the ARCHIVE ROWS that are absent (' + missing.join(', ') + '): each artefact is written by render()/compile(), so an absent row means that write has not run yet — it is NOT a statement about whether the text/PDF can be produced',
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
  // ★★ RUN 156 (real machine, run 5, finding 6): `start` without a target names the paper after its TITLE, and the title
  // becomes the DIRECTORY name (`Paper/paper-第 4 期…`). xelatex is spawned with `-output-directory=<that dir>`; a path with
  // spaces makes TeX's `putenv` fatally fail (`xelatex.exe: fatal: putenv(...)`), so a legal paper name could make the
  // compiler unreachable. The name stays the ADDRESS (ids and fingerprints are untouched); only the FOLDER is slugged, and
  // the compile receipt reports the folder it really used.
  const folderOf = (name) => {
    const raw = String(name === undefined || name === null ? '' : name)
    const slug = raw.replace(/[\\/:*?"<>|\s]+/g, '-').replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '')
    return slug === '' ? 'paper' : slug
  }
  async function compilePdf({ target, engineOrder = null, timeoutMs = null } = {}) {
    const { state } = requireState(target)
    const tex = PaperTex({ target })
    const latexFace = kernel && kernel.latex
    if (!latexFace || typeof latexFace.check !== 'function') {
      throw refuse(CODES.EXECUTOR, 'This assembly has no LaTeX face, so a PDF cannot be compiled (host injected no spawn seam)',
        '需要宿主 spawn 接缝：kernel/index.js 只在 spawn/spawnHandle 存在时创建 kernel.latex；本包不自己起子进程')
    }
    const folder = folderOf(state.id)
    const outDir = state.outDir || (outDirPrefix + folder)
    const request = { source: tex, outDir, sourceName: folder + '.tex' }
    if (Array.isArray(engineOrder) && engineOrder.length > 0) request.engineOrder = engineOrder.slice()
    if (Number.isFinite(timeoutMs) && timeoutMs > 0) request.timeoutMs = Math.floor(timeoutMs)
    const r = await latexFace.check(request)
    if (!r || r.ok !== true) {
      const tail = (s) => String(s === undefined || s === null ? '' : s).slice(-1500)
      const engineList = (r && Array.isArray(r.tried) ? r.tried : []).map((t) => {
        if (t && typeof t === 'object') return [t.engine, t.phase, t.code].filter((x) => x !== undefined && x !== null && x !== '').join(':')
        return String(t)
      }).filter((x) => x !== '')
      // ★ LIVE RUN 133 (F-133b): "the compile failed" without ONE line of what the compiler said is a receipt the caller cannot
      // act on (measured: the agent got PDF_FAILED, could not see stderr, and could not tell a font/package problem from a
      // broken .tex). The face already carries a bounded stderr tail; the RECEIPT did not. So one collapsed line travels in the
      // message itself - bounded, single-line, no paths invented - and the full tail stays on the error for the host.
      const diagOf = (v) => {
        const raw = v === undefined || v === null ? '' : String(v)
        const flat = raw.split(String.fromCharCode(13)).join('').split(String.fromCharCode(10))
          .map((s) => s.trim()).filter((s) => s !== '')
        if (flat.length === 0) return ''
        // Prefer the first line that looks like TeX's own error report; otherwise the LAST line (the summary line).
        const hit = flat.find((s) => s.startsWith('!')) || flat[flat.length - 1]
        return hit.slice(0, 240)
      }
      const triedList = (r && Array.isArray(r.tried) ? r.tried : [])
      const lastWithErr = (() => { for (let i = triedList.length - 1; i >= 0; i -= 1) { const e = triedList[i]; if (e && e.stderr) return e.stderr } return null })()
      const diag = diagOf((r && r.stderr) || lastWithErr || (r && r.stdout) || '')
      const failure = refuse(CODES.PDF_FAILED,
        'LaTeX 编译失败：' + String((r && r.code) || 'unknown') + (r && r.engine ? '（engine=' + r.engine + '）' : '') +
          (engineList.length ? '；已试引擎=' + engineList.join(', ') : '') +
          (diag ? '；编译器说：' + diag : ''),
        // ★★ THE HINT MUST NAME SOMETHING THE READER CAN ACTUALLY SEE. It used to say "把 stderrTail 交给人看", and measured on a
        // full live run the agent could not: the compiler's stderr tail IS attached to this thrown error (see `failure.stderrTail`
        // below), but the TOOL RECEIPT carries only code/message/hint - the host does not relay custom error fields. So the hint
        // pointed at a name that existed on an object the receipt had already flattened away, which is the "looks correct but is
        // unusable" shape this phase keeps removing. It now says what the receipt DOES carry and what the operator can do with it.
        '这不是"论文为假"，只是**没编译出来**：回执这次带了一行编译器原话（在 message 的「编译器说：」之后，已压成单行、上限 240 字符）；完整尾部在【这条错误的 `stderrTail`】上（引擎把话写在 stdout 时，那里放的就是 stdout 的尾部，`tailSource` 说明来源；两者都空时才是真空），宿主回执不转述它 —— 按那句原话修 .tex/换引擎（或把绝对路径写进 `vmu.paper.latexCommand`）后重试，或直接把这条 message 交给人；回执不声称有 pdf')
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
      // ★★ RUN 152 (real machine, run 2): `xelatex` writes its diagnostics to STDOUT, not stderr, so the receipt came
      // back with `stderrTail:""` while the hint promised the compiler's words were there — the agent had to guess that
      // `stdoutTail` was the field to read. The tail the hint promises is now always non-empty when either stream has
      // text, and `tailSource` says which stream it came from, so the two statements agree.
      if (!failure.stderrTail) {
        failure.stderrTail = failure.stdoutTail
        failure.tailSource = 'stdout'
      } else {
        failure.tailSource = 'stderr'
      }
      failure.signal = (r && r.signal) || null
      // ★★ RUN 158 (run 6 / item 6 + N5): the failure object never carried the directory/source name it TRIED, and the
      // measured refusal was a fatal `putenv` on a non-ASCII directory while the receipt said `outDir:null` — the reader
      // could not see the cause. Both fields travel now. And when the engine writes everything to ONE stream, both tails
      // hold the same text: that is disclosed instead of presenting one diagnosis twice as two.
      failure.tailsIdentical = failure.stderrTail !== '' && failure.stderrTail === failure.stdoutTail
      // ROUND 159 (FEEDBACK6 items 5/7): a reader must not have to know what `tailSource` implies. And the directory is
      // the RESOLVED one the engine was told to write into (`r.outDir`), so it has the same shape as `argv`.
      failure.tailsIdenticalMeans = failure.tailsIdentical
        ? 'the two tails below are the SAME text: the engine wrote everything to one stream, and `tailSource` says which one that was'
        : 'the two tails are different streams: `tailSource` says which one the promised diagnosis came from'
      failure.outDir = (r && r.outDir) || outDir
      failure.sourceName = request.sourceName
      // ★★ RUN 155 (audit of c5d356b9, problem 1 / G10's second half): the FACE carries the exact argv it
      // spawned (`r.argv` — measured: 5 elements, absolute + forward slashes), but this failure object never copied it
      // while BOTH projections downstream read `e.argv` and default to [] — so the receipt said `argv: []` at the very
      // moment a compiler really ran. The argv travels now, and the receipt's own evidence stops lying by omission.
      failure.argv = Array.isArray(r.argv) ? r.argv.slice(0, 16) : []
      throw failure
    }
    const put = records.put({
      track: TRACK, kind: 'paper-pdf', title: recordName(state.target, 'pdf'),
      body: JSON.stringify({ pdfPath: r.pdfPath, pdfBytes: r.pdfBytes, engine: r.engine, tried: r.tried, argv: r.argv, elapsedMs: r.elapsedMs, timeoutMs: r.timeoutMs }),
      settled: true, by: author,
    })
    return { ok: true, target: state.target, engine: r.engine, pdfPath: r.pdfPath, pdfBytes: r.pdfBytes,
      // ★★ RUN 154 (G10): run 4 verified the fix from xelatex's own log because the receipt did not carry the argv that
      // proves "absolute + forward slashes". The successful compile now returns the same argv the failure path always did.
      // ★★ RUN 158: the source name reported on success MUST be the one the request carried (folder + '.tex'); the
      // old line printed `state.id + '.tex'`, so a minted id and the folder disagreed in the same receipt.
      argv: Array.isArray(r.argv) ? r.argv.slice(0, 16) : [], outDir: r.outDir || null, sourceName: folder + '.tex',
      tried: r.tried, elapsedMs: r.elapsedMs, recordId: put && put.id,
      artifacts: PaperArtifacts({ target }), missing: PaperArtifacts({ target }).missing }
  }

  // ★ F4: `recordFinal` renders THROUGH this object (not through a lexical copy), so a pack that wraps `render` to add a
  // gate sees the finalising path too. Declared before the return so both definitions share one binding.
  let api = null
  api = { start, recordPart, recordReview, advance, pass, recordFinal, PaperMd, PaperMdRaw: rawMd, PaperTex, PaperArtifacts, render, compilePdf,
    recordConsult, consultState,
    sections: () => SECTIONS.slice(), state: (target) => readState(target),
    // ★★ RUN 156 (real machine, run 5 / N2): the refusal for a target-less `status` promised `status` with no target
    // "lists the papers that exist" - and it did not. The flow keeps its ONE list helper private, so the face had no way
    // to honour the promise; expose it rather than soften the sentence.
    papers: () => listPaper() }
  return api
}

export default createPaperFlow

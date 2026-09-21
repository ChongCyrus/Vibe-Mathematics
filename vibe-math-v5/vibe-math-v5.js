// Vibe Math V5 — the research-institute framework.
//
// A self-organizing RESEARCH INSTITUTE that solves a research problem by talking:
//   · 院士 (academician) — the leader / ORGANIZATIONAL CENTRE: institute-wide view,
//     decomposes the problem into tasks and ASSIGNS them, sets priorities, chairs
//     meetings, supervises progress, reallocates temp workers. No extra vote weight.
//   · 常驻研究员 (permanent researchers) — hold the vote; hire/fire their own temps.
//   · 临时工 (temp workers) — hired per task; may read/think/speak/own a library,
//     no vote.
//
// The framework is ONLY the medium: message relay (group chat / DMs), meetings,
// a compare-and-set task DAG, per-member artifact libraries, the m-vote boolean
// consensus tally, context compaction and resume. It NEVER assigns tasks — the
// academician does, as a member who is himself bound by the same m-vote rule.
//
// Durable state lives in a HOST-ONLY session projection unit (key `vibeMathV5`):
// institute events are appended to the session log, never enter the model history
// (zero context cost), are checkpointed by DSH, and are replayed on restore — which
// structurally removes v4's `State/*.json` corruption/lost-write/resume-staleness
// class of bugs. A hardened file backend is used only if the projection registry
// is genuinely absent.
//
// NOTE: must declare `inject` for every service read as a ctx property (the Guard
// rejects undeclared dependencies), and must use the `timer` Service (ctx.timeout),
// not global setTimeout/clearTimeout, which do not exist in the plugin runtime.
export const inject = ['subagents', 'agents', 'fs', 'tools', 'commands', 'timer', 'sessions']

const PROJECTION_KEY = 'vibeMathV5'
const PROJECTION_VERSION = 1
const EV = {
  institute: 'vibe5/institute',
  member: 'vibe5/member',
  task: 'vibe5/task',
  message: 'vibe5/message',
  delivered: 'vibe5/delivered',
  meeting: 'vibe5/meeting',
  debate: 'vibe5/debate',
  verdict: 'vibe5/verdict',
  queue: 'vibe5/queue',
  counters: 'vibe5/counters',
  progress: 'vibe5/progress',
}

// Stable error codes (ported from DSH agent-teams' typed-error discipline).
function v5err(code, message) {
  const e = new Error(message || code)
  e.code = code
  return e
}

export function apply(ctx) {
  const subagents = ctx.subagents
  const agents = ctx.agents
  const fs = ctx.fs
  const tools = ctx.tools
  const commands = ctx.commands
  const store = ctx.sessions

  // Optional services are resolved LAZILY at call time, never snapshotted in apply():
  // a `ctx.get()` snapshot taken here is order-sensitive, so a service provided later
  // would stay undefined for the whole session.
  const sandboxPolicyOf = () => { try { return ctx.get('sandboxPolicy') } catch (e) { return undefined } }
  const subprocessOf = () => { try { return ctx.get('subprocess') } catch (e) { return undefined } }
  const compactionOf = () => { try { return ctx.get('compaction') } catch (e) { return undefined } }
  const projectionsOf = () => { try { return ctx.get('sessionProjections') } catch (e) { return undefined } }

  // ---- utils -------------------------------------------------------------
  const now = () => Date.now()
  function hex(n) { let s = ''; for (let i = 0; i < n; i++) s += '0123456789abcdef'[Math.floor(Math.random() * 16)]; return s }
  const shortId = () => hex(8)
  function clamp01(v) { const n = Number(v); if (!Number.isFinite(n)) return 0.5; return Math.max(0, Math.min(1, n)) }
  // contextPct is a PERCENT (0-100); never clamp to 0-1 or the compactThreshold
  // comparison (e.g. 66) becomes `1.0 >= 66` and never fires (v4 §17 defect).
  function clPct(x) { const n = Number(x); if (!Number.isFinite(n)) return 0; return Math.max(0, Math.min(100, n)) }
  // Positive duration with a safe fallback: a NEGATIVE/NaN duration parameter must
  // never make a watchdog fire instantly or an idle window never elapse (v4 §30-T41).
  function posMs(v, def) { const n = Number(v); return (Number.isFinite(n) && n > 0) ? n : (def || 120000) }
  const textBlock = (t) => ({ type: 'text', text: String(t) })
  function blocksToText(b) { if (!b) return ''; let o = ''; for (const x of b) { if (x && x.type === 'text' && typeof x.text === 'string') o += x.text + '\n' } return o }
  function fmtTime(ts) { try { return new Date(ts || now()).toISOString().replace('T', ' ').slice(0, 19) } catch (e) { return String(ts || '') } }
  function makeSignal(ms) { try { return AbortSignal.timeout(posMs(ms, 30000)) } catch (e) { return undefined } }

  // Object ids (verify targets, card ids, member ids) become FILE NAMES and DIRECTORY
  // PATHS. A hostile/sloppy id containing separators ('../../x') or Windows-forbidden
  // characters would escape the project tree. Keep every harmless character (incl.
  // Chinese) and replace only separators/control chars; strip leading/trailing dots
  // and dashes so the name is never '.' or '..' (v4 §30-T39).
  function idSafe(s) {
    const t = String(s == null ? '' : s).trim().replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').replace(/-{2,}/g, '-').replace(/^[.\-]+|[.\-]+$/g, '')
    return t
  }
  // Advisory write-scope normalisation, ported from DSH agent-teams: backslashes to
  // '/', strip a leading './' and trailing '/', reject empty/absolute/drive-letter/
  // '..'-segment scopes.
  function normalizeScope(s) {
    const t = String(s == null ? '' : s).trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '')
    if (!t) return undefined
    if (t.startsWith('/') || /^[a-z]:/i.test(t)) return undefined
    for (const seg of t.split('/')) { if (seg === '' || seg === '.' || seg === '..') return undefined }
    return t
  }
  function scopesOverlap(a, b) {
    const ap = String(a).split('/'), bp = String(b).split('/')
    const n = Math.min(ap.length, bp.length)
    for (let i = 0; i < n; i++) if (ap[i] !== bp[i]) return false
    return true
  }

  // ---- projection: pure fold --------------------------------------------
  // The fold is shared by BOTH persistence backends, so the state machine is
  // defined exactly once. It must return a NEW top-level reference whenever
  // anything changed (the projection's change feed compares by Object.is).
  function emptyInstitute(key, project, institute) {
    return {
      key, project, institute,
      createdAt: now(), phase: 'idle',
      problem: { id: '', statement: '' },
      params: {},
      members: [],
      tasks: [],
      messages: [],
      delivered: [],
      meetings: [],
      debates: [],
      verdicts: {},
      queue: [],
      counters: { academician: 0, researcher: 0, temp: 0, task: 0, meeting: 0, message: 0, verify: 0 },
      runId: '',
      lastProgressAt: now(),
      artifactCount: 0,
      diagnostics: [],
    }
  }
  function initState() { return { v: PROJECTION_VERSION, institutes: {}, order: [] } }

  function withInstitute(state, key, mut) {
    const cur = state.institutes[key] || emptyInstitute(key, '', '')
    const nextInst = mut(cur)
    if (nextInst === cur) return state
    const institutes = Object.assign({}, state.institutes)
    institutes[key] = nextInst
    const order = state.order.indexOf(key) === -1 ? state.order.concat([key]) : state.order
    return { v: state.v, institutes, order, diagnostics: state.diagnostics }
  }

  // Fold ONE event. Unknown/malformed events are SKIPPED and recorded in
  // `diagnostics` rather than latching a permanent failure: availability beats
  // log purism, and a malformed event is a code defect that tests must catch.
  // (DSH's own team projection latches `state.failure` forever instead — a shape
  // v5 deliberately does not copy.)
  function applyV5Event(state, event) {
    try {
      if (!event || typeof event.type !== 'string') return state
      const t = event.type
      if (t.indexOf('vibe5/') !== 0) return state
      const d = event.data
      if (!d || typeof d !== 'object' || typeof d.key !== 'string') return state
      const key = d.key
      if (t === EV.institute) {
        return withInstitute(state, key, (inst) => {
          const n = Object.assign({}, inst)
          const patch = d.patch || {}
          if (patch.project !== undefined) n.project = String(patch.project)
          if (patch.institute !== undefined) n.institute = String(patch.institute)
          if (patch.phase !== undefined) n.phase = String(patch.phase)
          if (patch.problem !== undefined) n.problem = { id: String(patch.problem.id || ''), statement: String(patch.problem.statement || '') }
          if (patch.params !== undefined) n.params = Object.assign({}, patch.params)
          if (patch.runId !== undefined) n.runId = String(patch.runId)
          if (patch.lastProgressAt !== undefined) n.lastProgressAt = Number(patch.lastProgressAt) || 0
          if (patch.artifactCount !== undefined) n.artifactCount = Number(patch.artifactCount) || 0
          return n
        })
      }
      if (t === EV.member) {
        return withInstitute(state, key, (inst) => {
          const m = d.member
          if (!m || typeof m.id !== 'string') return inst
          const members = inst.members.slice()
          const i = members.findIndex((x) => x.id === m.id)
          if (i === -1) members.push(m); else members[i] = m
          return Object.assign({}, inst, { members })
        })
      }
      if (t === EV.task) {
        return withInstitute(state, key, (inst) => {
          const task = d.task
          if (!task || typeof task.id !== 'string') return inst
          const tasks = inst.tasks.slice()
          const i = tasks.findIndex((x) => x.id === task.id)
          if (i === -1) tasks.push(task); else tasks[i] = task
          return Object.assign({}, inst, { tasks })
        })
      }
      if (t === EV.message) {
        return withInstitute(state, key, (inst) => {
          const msg = d.message
          if (!msg || typeof msg.id !== 'string') return inst
          if (inst.messages.some((x) => x.id === msg.id)) return inst
          return Object.assign({}, inst, { messages: inst.messages.concat([msg]) })
        })
      }
      if (t === EV.delivered) {
        return withInstitute(state, key, (inst) => {
          const ids = Array.isArray(d.ids) ? d.ids.map(String) : []
          if (!ids.length) return inst
          const set = new Set(inst.delivered)
          let changed = false
          for (const id of ids) { if (!set.has(id)) { set.add(id); changed = true } }
          if (!changed) return inst
          // Compact: a message that has been delivered may leave `messages` too, so
          // the queue never grows without bound over a long run.
          const delivered = Array.from(set)
          const messages = inst.messages.filter((m) => !set.has(m.id))
          return Object.assign({}, inst, { delivered, messages })
        })
      }
      if (t === EV.meeting) {
        return withInstitute(state, key, (inst) => {
          const idx = d.index
          if (!idx || typeof idx.id !== 'string') return inst
          if (inst.meetings.some((x) => x.id === idx.id)) return inst
          const meetings = inst.meetings.concat([idx])
          return Object.assign({}, inst, { meetings: meetings.length > 200 ? meetings.slice(meetings.length - 200) : meetings })
        })
      }
      if (t === EV.debate) {
        return withInstitute(state, key, (inst) => {
          const idx = d.index
          if (!idx || typeof idx.target !== 'string') return inst
          const debates = inst.debates.concat([idx])
          return Object.assign({}, inst, { debates: debates.length > 200 ? debates.slice(debates.length - 200) : debates })
        })
      }
      if (t === EV.verdict) {
        return withInstitute(state, key, (inst) => {
          if (!d.target || typeof d.target !== 'string') return inst
          const verdicts = Object.assign({}, inst.verdicts)
          if (d.record === null) delete verdicts[d.target]
          else verdicts[d.target] = d.record
          return Object.assign({}, inst, { verdicts })
        })
      }
      if (t === EV.queue) {
        return withInstitute(state, key, (inst) => Object.assign({}, inst, { queue: Array.isArray(d.queue) ? d.queue : [] }))
      }
      if (t === EV.counters) {
        return withInstitute(state, key, (inst) => Object.assign({}, inst, { counters: Object.assign({}, inst.counters, d.counters || {}) }))
      }
      if (t === EV.progress) {
        return withInstitute(state, key, (inst) => Object.assign({}, inst, {
          lastProgressAt: Number(d.at) || now(),
          artifactCount: Number(d.artifactCount) || inst.artifactCount,
        }))
      }
      return state
    } catch (e) {
      // Never throw out of the fold: one bad event must not break every later read.
      try {
        const diagnostics = (state.diagnostics || []).concat([{ at: now(), type: String(event && event.type), error: String((e && e.message) || e) }])
        return { v: state.v, institutes: state.institutes, order: state.order, diagnostics: diagnostics.slice(-50) }
      } catch (e2) { return state }
    }
  }

  // Minimal structural validator standing in for a zod schema. The projection
  // registry only ever calls `stateSchema.parse(row.val)` when it reloads a value
  // from a CHECKPOINT row, so this is the guard against a corrupt persisted row —
  // a plain object with `.parse` is sufficient and needs no module import (a
  // preset-local file cannot reliably resolve `zod`).
  const STATE_SCHEMA = {
    parse(v) {
      if (!v || typeof v !== 'object') throw new Error('vibe-math-v5: projection state is not an object')
      if (v.v !== PROJECTION_VERSION) throw new Error('vibe-math-v5: projection state version mismatch')
      if (!v.institutes || typeof v.institutes !== 'object') throw new Error('vibe-math-v5: projection state lacks institutes')
      if (!Array.isArray(v.order)) throw new Error('vibe-math-v5: projection state lacks order')
      return v
    },
  }

  // ---- persistence backend ----------------------------------------------
  // Primary: append an event to the session log and read the folded state back.
  // Fallback: apply the SAME fold in memory and persist hardened JSON.
  function makeProjectionBackend(proj, session) {
    return {
      kind: 'projection',
      read() {
        const s = proj.stateOf(session, PROJECTION_KEY)
        return s === undefined ? initState() : s
      },
      async commit(type, data) {
        session.append(type, data)
        try { await store.flush(session) } catch (e) { /* flush is a durability hint */ }
        return this.read()
      },
    }
  }
  function makeFileBackend(readTextAbs, writeTextAbs, statePath) {
    let mem = initState()
    let chain = Promise.resolve(true)
    let loaded = false
    return {
      kind: 'file',
      async load() {
        if (loaded) return mem
        loaded = true
        try {
          const raw = await readTextAbs(statePath)
          if (raw) {
            const parsed = JSON.parse(raw)
            if (parsed && parsed.v === PROJECTION_VERSION) mem = parsed
          }
        } catch (e) { /* a corrupt mirror is ignored; it is not authoritative */ }
        return mem
      },
      read() { return mem },
      async commit(type, data) {
        mem = applyV5Event(mem, { type, data })
        const snapshot = mem
        // Serialize writes per file and defer JSON.stringify to execution time, so a
        // late writer always lands the FULL newest state and can never overwrite with
        // a stale subset (v4 §27 writeJson defect).
        chain = chain.then(async () => {
          try { await writeTextAbs(statePath, JSON.stringify(snapshot, null, 2)) } catch (e) { /* best effort */ }
          return true
        })
        return mem
      },
    }
  }

  // ---- session registry --------------------------------------------------
  const sessions = new Map()      // rootAgentId -> session object
  const childOwner = new Map()    // childId -> rootAgentId

  function sessionIdOf(agent) { try { return (agent && agent.id) ? String(agent.id) : undefined } catch (e) { return undefined } }
  function rootOf(agent) {
    try {
      let cur = agent; const seen = new Set()
      while (cur) {
        const id = cur.id
        if (seen.has(id)) return cur
        seen.add(id)
        const p = (cur.session && cur.session.header) ? cur.session.header.parentSession : undefined
        if (p === undefined) return cur
        const par = agents.get(p)
        if (!par) return cur
        cur = par
      }
    } catch (e) { /* fall through */ }
    return agent
  }
  function getSession(agent) {
    const root = rootOf(agent)
    const sid = sessionIdOf(root)
    if (sid === undefined) return undefined
    let s = sessions.get(sid)
    if (!s) { s = makeSession(root, sid); sessions.set(sid, s) }
    return s
  }

  function makeSession(rootAgent, sessionId) {
    const DEFAULT_PARAMS = {
      // ── offices / quorum ──────────────────────────────────────────────────
      academician: true,
      academicianLeads: true,
      memberMayRejectAssign: true,
      researcherCount: 3,
      quorumCap: 3,                 // m = min(quorumCap, |voters|)
      quorumMode: 'm-unanimous',    // 'm-unanimous' (v5) | 'all-unanimous' (v4 legacy)
      verdictMaxRounds: 3,
      // ── staffing ─────────────────────────────────────────────────────────
      maxTempPerMember: 3,          // simultaneously employed temps per academician/researcher
      maxTempTotal: 12,
      // ── context ──────────────────────────────────────────────────────────
      compactThreshold: 66,
      compactAfterRounds: 8,
      // ── scheduling ───────────────────────────────────────────────────────
      maxParallel: 3,
      activityTimeoutMs: 120000,
      stallAutoMeetingMs: 360000,
      chatDigestMs: 45000,
      chatDigestMax: 12,
      meetingKeepEvery: 5,
      // ── model / tools ────────────────────────────────────────────────────
      provider: '',
      model: '',
      toolAllow: [],
      toolDeny: [],
      staffPersona: '',
      tempToolAllow: [],
      tempToolDeny: [],
    }

    // ---- ephemeral (never persisted; rebuilt on resume) -------------------
    let params = Object.assign({}, DEFAULT_PARAMS)
    let project = 'default'
    let instituteName = 'institute'
    let key = project + '::' + instituteName
    let phase = 'idle'
    let running = false, autoDone = false
    let runId = ''
    const busy = new Set()
    const wakeKind = new Map()
    const rounds = new Map()          // memberId -> rounds since spawn
    const roundsSinceCompact = new Map()
    const contextPct = new Map()
    const needReanchor = new Set()
    const seeds = new Map()           // memberId -> condensed self-summary seed
    const lastActiveAt = new Map()
    let currentMember = ''
    let finalizeLock = null
    const verifiedRecently = new Map()
    const liveAgents = new Map()      // childId -> WeakRef<Agent>
    const inflight = new Map()        // childId -> turn token (dedupes duplicate subagent/end)
    let heartbeatDisposer = null
    let meeting = null                // in-flight meeting round state
    let pendingMeeting = null          // parked meeting (never preempts verification)
    let digestTimer = null
    let lastProgressAt = now()
    let persistedEpoch = ''

    // ---- persistence ------------------------------------------------------
    let backend = null
    let stateCache = null

    function workspaceRoot() {
      try { if (rootAgent && rootAgent.session && rootAgent.session.header && rootAgent.session.header.cwd) return rootAgent.session.header.cwd } catch (e) { /* fall through */ }
      const sp = sandboxPolicyOf()
      if (sp && sp.workspaceRoot) return sp.workspaceRoot
      return '.'
    }
    const vibeRoot = () => (workspaceRoot() + '/VibeMath').replace(/\\/g, '/')
    const projectRoot = () => vibeRoot() + '/Projects/' + project
    const instRoot = () => projectRoot() + '/Institutes/' + instituteName

    function getPolicy() {
      const sp = sandboxPolicyOf()
      if (!sp) return undefined
      try { if (rootAgent && rootAgent.session) return sp.resolve({ session: rootAgent.session }) } catch (e) { /* fall through */ }
      try { return sp.resolve({}) } catch (e) { return undefined }
    }
    async function fsTargetAbs(p) { return await fs.resolve(p) }
    async function readTextAbs(p) { try { const t = await fsTargetAbs(p); if (await fs.stat(t) === undefined) return undefined; return await fs.readText(t) } catch (e) { return undefined } }
    async function writeTextAbs(p, content) {
      try {
        const t = await fsTargetAbs(p)
        await fs.writeText(t, content, undefined, undefined, getPolicy())
        return true
      } catch (e) { return false }
    }
    async function readTextRel(rel) { return await readTextAbs(instRoot() + '/' + rel) }
    async function writeTextRel(rel, content) { return await writeTextAbs(instRoot() + '/' + rel, content) }

    function installBackend() {
      const proj = projectionsOf()
      const sess = (rootAgent && rootAgent.session) ? rootAgent.session : undefined
      if (proj && sess && typeof proj.stateOf === 'function') backend = makeProjectionBackend(proj, sess)
      else if (proj && sess && typeof proj.register === 'function') backend = makeProjectionBackend(proj, sess)
      else backend = makeFileBackend(readTextAbs, writeTextAbs, vibeRoot() + '/State/' + instituteName + '.v5state.json')
      return backend
    }
    function state() {
      if (!backend) installBackend()
      stateCache = backend.read()
      return stateCache
    }
    function inst() {
      const s = state()
      return s.institutes[key] || emptyInstitute(key, project, instituteName)
    }
    async function commit(type, data) {
      if (!backend) installBackend()
      if (backend.kind === 'file' && backend.load) await backend.load()
      stateCache = await backend.commit(type, Object.assign({ version: PROJECTION_VERSION, key }, data))
      const cur = stateCache.institutes[key]
      if (cur) {
        phase = cur.phase || phase
        params = Object.assign({}, DEFAULT_PARAMS, cur.params || {})
        project = cur.project || project
        instituteName = cur.institute || instituteName
      }
      return cur
    }
    // Convenience commit wrappers.
    const patchInstitute = (patch) => commit(EV.institute, { patch })
    const putMember = (member) => commit(EV.member, { member })
    const putTask = (task) => commit(EV.task, { task })
    const putMessage = (message) => commit(EV.message, { message })
    const ackDelivered = (ids) => commit(EV.delivered, { ids })
    const putMeeting = (index) => commit(EV.meeting, { index })
    const putDebate = (index) => commit(EV.debate, { index })
    const putVerdict = (target, record) => commit(EV.verdict, { target, record })
    const putQueue = (queue) => commit(EV.queue, { queue })
    const putCounters = (counters) => commit(EV.counters, { counters })
    const markProgress = async () => {
      lastProgressAt = now()
      await commit(EV.progress, { at: lastProgressAt, artifactCount: inst().artifactCount })
    }

    // ---- roster helpers ---------------------------------------------------
    const activeMembers = () => inst().members.filter((m) => m.phase === 'active')
    const memberById = (id) => inst().members.find((m) => m.id === id)
    const voters = () => activeMembers().filter((m) => m.kind === 'academician' || m.kind === 'researcher')
    const voterCount = () => voters().length
    function quorumM() {
      const cap = Math.max(1, Math.floor(Number(params.quorumCap) || 3))
      return Math.max(1, Math.min(cap, voterCount()))
    }
    function byChild(childId) { return inst().members.find((m) => m.childId === childId) }

    // ---- the institute charter (public regulations) -----------------------
    // Written into every member's `persona` at hire time. `persona` is part of the
    // durable continuable descriptor, so the charter survives cold resume AND
    // context compaction WITHOUT being re-injected into prompts — which is what
    // structurally removes v4's "re-anchor the rules after compaction" patch and
    // the "[核心规则重申]+[CONTEXT COMPACT] every round" leak it caused (§24.1-③).
    function rosterLine() {
      const ms = activeMembers()
      const acad = ms.filter((m) => m.kind === 'academician').map((m) => m.id)
      const res = ms.filter((m) => m.kind === 'researcher').map((m) => m.id)
      const tmp = ms.filter((m) => m.kind === 'temp').map((m) => m.id + '(' + (m.hiredBy || '?') + '雇)')
      return [
        '  在册院士：' + (acad.length ? acad.join('、') : '（无）'),
        '  在册常驻研究员：' + (res.length ? res.join('、') : '（无）'),
        '  在册临时工：' + (tmp.length ? tmp.join('、') : '（无）'),
      ].join('\n')
    }
    const LIB_SPEC = [
      '  · Progress/<你>/progress.md —— **你的研究日志**（叙述体，可追加）。',
      '    主要内容是：尝试过的各方法、路线、历程、进度；当前研究进展/进度；将来的计划与打算；',
      '    及各路线、过程中遇到的障碍及其原因；对各路线、方法的看法、可行性评估；自己研究过程',
      '    中的一些有价值看法、感想、猜想、理解。以及其它各种你认为有价值的值得记录的事物、',
      '    经验、方法/想法、创新等，都可进行记录。',
      '    ▸ **它的用途（为什么必须认真写）**：',
      '      - 它是你**持续投入的思考痕迹**——别人和院士靠它了解你在做什么、做到哪一步了；',
      '      - 它是**上下文被压缩后你恢复状态的主要依据**：压缩会丢掉对话细节，却丢不掉你写的',
      '        文件。请让它随时能让你自己看懂——我在哪、试过什么、为什么放弃、下一步做什么；',
      '      - 它是**院士统筹全所的输入**：院士督导进度、牵线搭桥、避免重复劳动，读的就是它；',
      '      - **失败与死路同样值得记**：写下"试过但为什么不行"，能替全所省下重复的弯路。',
      '    ▸ 写法建议：按时间追加，每次记一小节；把"结论/进展"与"理由/证据"分开写；',
      '      悬而未决的问题明确标出。',
      '',
      '  · Propos/<你>/<id>.md —— **你的命题/引理**。格式：',
      '      - ID: p-<id>; - 状态: 未定论; - 概率: <0-1>; - 价值程度: <0-1>; - 动机用途计划: <为何重要/打算怎么用>',
      '      然后 ## 陈述 <完整陈述>；## 证明尝试；## 证伪尝试。',
      '  · Methods/<你>/<id>.md —— **你的理论/方法/工具**。格式：',
      '      - ID: m-<id>; - 状态: 经验; - 可信断言: []; - 价值程度: <0-1>; - 动机用途计划: ...',
      '      然后 ## 核心内容；## 定义与记号；## 应用记录；## 改进历史。',
      '  · Subproblems/<你>/<id>.md —— **你的子问题**。格式：',
      '      - ID: s-<id>; - 状态: 求解中; - 价值程度: <0-1>; - 动机用途计划: ...',
      '      然后 ## 陈述；## 进度。',
      '',
      '  三条硬要求：',
      '   ① 凡入库必须写明 **价值程度 / 动机用途计划 / 你对该对象为真的概率估计**（缺一不可）；',
      '   ② **只写自己的库**；读别人的库是允许且被鼓励的；',
      '   ③ 推荐**直接用 fs 写你自己的文件**；vibe_v5_record_* 只是便捷记录器，不是必需。',
    ].join('\n')

    const ORG_COMMON = [
      '  本所是自组织的，但**不是没有组织**——现实中一个研究所也有所长/学术带头人统筹全局。',
      '  本所的领头人是**院士 ' + 'acad' + '**。它以**全所视角**组织与协调：',
      '    ① **统筹全局**：掌握各方向布局、谁在做什么、哪里是瓶颈、哪里有重复或空白；',
      '    ② **规划与分派**：把原问题拆成值得做的工作，作为**任务**分派给合适的成员（含临时工）。',
      '       分派是它的职责，不是越权；',
      '    ③ **设定优先级**：多个方向并行时，它有责任指明"先做什么、什么可以缓、什么该放弃"；',
      '    ④ **协调资源**：决定临时工往哪里调配；建议增聘/解聘常驻研究员；',
      '    ⑤ **主持会议**：由它召集正式会议、设定议程、维持讨论不跑偏，并把结论落实为任务；',
      '    ⑥ **督导进度**：定期检查各成员的 Progress/ 与会议发言，催办停滞的方向、纠正偏离、',
      '       在成员之间牵线；',
      '    ⑦ **对外代表**：通过所办向外部汇报与提要求。',
      '',
      '  对**你**（非院士）的要求：',
      '    · **主动汇报**：把你这一轮的进展、发现、卡点写进你自己的 Progress/，并把关键结论在',
      '      群聊里说出来——院士需要这些信息才能统筹；',
      '    · **接受分派，但不要盲从**：院士分派给你的任务，默认应当执行；如果你认为方向错了、',
      '      信息过时、或你有更好的路线，**先说清理由再决定**——本所允许并鼓励有理据的反对。',
      '      真正的原则是：组织由院士负责，但**判断属于每个人自己**；',
      '    · **有异议走会议**：若你与院士在方向上持续分歧，提议开会，让全所讨论；',
      '    · **不要重复劳动**：做之前先看任务板和别人的库；发现别人已在做同一件事，告诉院士。',
    ].join('\n')

    const ACAD_ORG = [
      '  【四、你的组织职责与边界（院士）】',
      '    作为院士，你对本所的组织与推进负总责：',
      '      ① **建立并维护全所视图**——谁在做什么、进展如何、瓶颈在哪、哪里有重复或空白。',
      '         用 vibe_v5_overview 查看，不要凭印象指挥；',
      '      ② **拆解与分派**——把原问题拆成值得做的工作，用 vibe_v5_assign 分派给合适的成员',
      '         （含临时工），并说清理由与验收标准。选人时优先考虑"谁最适合"，而不只是"谁有空"；',
      '      ③ **设定优先级**——用 vibe_v5_prioritize 指明先做什么、什么该缓、什么该放弃；',
      '      ④ **主持会议**——召集正式会议、设定议程、维持讨论不跑偏，并把讨论收敛成任务；',
      '      ⑤ **督导进度**——用 vibe_v5_nudge 催办停滞的方向、纠正偏离、在成员之间牵线搭桥、',
      '         避免重复劳动。对停滞者不要只是催促，要给出具体的下一步或配对建议；',
      '      ⑥ **协调资源**——决定临时工往哪里调配；向所办建议增聘/解聘常驻研究员；',
      '      ⑦ **对外代表**——通过所办向外部汇报与提要求。',
      '',
      '    你必须守住四条边界：',
      '      · 你的**一票与所有人等重**，没有加权票、没有否决权；',
      '      · 你**分派的是工作，不是结论**——你不能代替别人思考，也不能让任何断言因为你的',
      '        身份而变正确；任何对象要进 Verified/ 仍须 m 票布尔一致；',
      '      · 成员**有权据理反对**你的分派；请认真对待——**理据优先于职位**；',
      '      · 你**不能自我扩张编制**：增聘/解聘常驻研究员需所办/人批准。',
      '',
      '    如果你发现自己大部分时间在处理杂事而无法做研究，那说明你该多雇几个临时工、或把',
      '    某些协调工作交给合适的成员——但协调的**最终责任**始终在你。',
    ].join('\n')

    function charterFor(member) {
      const kind = member.kind
      const m = quorumM()
      const L = []
      // ── opening ──────────────────────────────────────────────────────────
      if (kind === 'academician') {
        L.push('你是「' + instituteName + '」的**院士**，本所的领头人与组织协调中心。你不仅亲自做研究，')
        L.push('还向全所负责组织与推进。本所的目标是解决下述研究对象（原问题）：')
      } else if (kind === 'temp') {
        L.push('你是「' + instituteName + '」的**临时工**，代号 ' + member.id + '，由 ' + (member.hiredBy || '?') + ' 雇入，')
        L.push('用途：' + (member.direction || '（未说明）') + '。本所的目标是解决下述研究对象（原问题）：')
      } else {
        L.push('你是「' + instituteName + '」的一名常驻研究员，代号 ' + member.id + '。本所是一个自组织的合作研究')
        L.push('机构，目标是解决下述研究对象（原问题）：')
      }
      L.push('')
      L.push('  ' + (inst().problem.statement || '（尚未设定）'))
      L.push('')
      if (kind === 'temp') {
        L.push('你的任务期至：' + (member.term || '雇主另行通知') + '。任务完成后请主动告知雇主。')
        L.push('')
      }
      L.push('本所没有**外部**派活：做什么、往哪走，由所内自己决定。所内的组织与协调由**院士**牵头——')
      L.push('它统筹全局、把工作拆解成分派下去、设定优先级、主持会议、督导进度；你则在自己的方向上')
      L.push('深入钻研，把进展与判断汇报给它和全所。请记住这条分工：**组织由院士负责，但判断属于')
      L.push('你自己**——它分派的是工作，不是结论。')
      L.push('')
      L.push('────────────────────────────────────────')
      // ── 一、roster ───────────────────────────────────────────────────────
      L.push('【一、所内编制与你的同事】')
      if (kind === 'temp') {
        L.push('  · **院士 acad** —— 本所领头人，组织与协调中心。它统筹全所、分派任务、主持')
        L.push('    会议、督导进度，也可以直接分派任务给你。')
        L.push('  · **常驻研究员** —— 本所有表决权者。你是临时雇入的协作人员。')
        L.push('  · 你的雇主：' + (member.hiredBy || '?') + '。它给你派活；院士也可以给你派活。')
      } else if (kind === 'academician') {
        L.push('  · **院士 ' + member.id + '（你）** —— 本所领头人，本所的**组织与协调中心**。你亲自参与')
        L.push('    研究，同时向全所负责：建立全所视图、拆解并分派工作、设定优先级、主持会议、')
        L.push('    督导进度、调配临时工，并代表本所向外部汇报。')
        L.push('    但你的一票与其他有表决权者**等重**，不能单方面定论。')
        L.push('  · **常驻研究员** —— 有表决权。可自主雇佣/解雇自己的临时工。向你汇报进展、')
        L.push('    接受你的组织与分派。')
        L.push('  · **临时工** —— 由某位研究员或你为特定任务临时雇入。可读、可想、可发言、')
        L.push('    可写自己的成果库、可认领或被分派任务，但**没有表决权**。')
        L.push('  · **所办（对外接口）** —— 不参与研究、不投票。代表本所与外部沟通并转达外部指令。')
      } else {
        L.push('  · **院士 acad** —— 本所领头人，本所的**组织与协调中心**。它亲自参与研究，同时')
        L.push('    向全所负责：建立全所视图、把原问题拆解成工作并**分派**给合适的成员（含临时工）、')
        L.push('    设定优先级与路线取舍、召集并主持会议、督导进度与催办停滞、调配临时工。')
        L.push('    但它的一票与你**等重**，不能单方面定论。')
        L.push('  · **常驻研究员（含你）** —— 有表决权。可自主雇佣/解雇自己的临时工。')
        L.push('    向院士汇报进展、接受其组织与分派。')
        L.push('  · **临时工** —— 由某位研究员或院士为特定任务临时雇入。可读、可想、可发言、')
        L.push('    可写自己的成果库、可认领或被分派任务，但**没有表决权**。')
        L.push('  · **所办（对外接口）** —— 不参与研究、不投票。代表本所与外部沟通并转达外部指令。')
      }
      L.push('  你入职时的在册编制：')
      L.push(rosterLine())
      L.push('  （权威的在册名单以每轮提示里的状态块为准；编制可能变化。）')
      L.push('')
      // ── 二、general rules ────────────────────────────────────────────────
      L.push('【二、通用规章（全员必读）】')
      L.push('  1. 本所一切任务安排由成员讨论与院士组织决定；没有**外部**给你派活。')
      L.push('  2. 只有 Verified/ 目录下的结论（以及成果卡中标注"已验证·真/假"的条目）绝对可信。')
      L.push('     其余一切——他人的推测、你自己的未验结论、Progress/、Methods/ 里的未验证断言——')
      L.push('     都只是经验性参考，引用时必须注明"未验证"。')
      L.push('  3. 任何人可以读任何人的成果库；你只能写自己的库（Members/<你>/）。')
      L.push('  4. 你写下的有价值内容由你自己判断是否入库，但入库必须写明三项：')
      L.push('     价值程度、动机用途计划、你自己对"该对象为真"的概率估计。')
      L.push('  5. 你随时可以在群聊里说话；要单独找人可以私信。需要集体决策就提议开会。')
      L.push('  6. 请主动读同事的库，对齐事实、避免重复劳动、发现冲突。')
      L.push('  7. **主动向院士汇报**：它需要你的进展、发现与卡点才能统筹全所；把关键结论在群聊里')
      L.push('     说出来，把细节留在你自己的 Progress/ 里。')
      L.push('')
      // ── 三、libraries ───────────────────────────────────────────────────
      L.push('【三、你的资料库、progress 与卡片格式】')
      L.push('  你的资料库根目录：Members/' + member.id + '/')
      L.push('  （以下路径都相对该目录。你**只写这里**，但可以读任何人的对应目录。）')
      L.push('')
      L.push(LIB_SPEC)
      L.push('')
      // ── 四、organization ────────────────────────────────────────────────
      if (kind === 'academician') {
        L.push(ACAD_ORG)
      } else {
        L.push('【四、所内的组织与协调（院士领头）】')
        L.push(ORG_COMMON)
        if (kind === 'temp') {
          L.push('    · **院士也可以直接分派任务给你**（它统筹全所）。雇主与院士的分派都应执行；')
          L.push('      若你认为分派有误，先说清理由。')
        }
      }
      L.push('')
      L.push('  【重要】分派**不改变求真规则**：院士分派任务、设定优先级，但**不能**因此让任何结论')
      L.push('  变得"正确"。任何对象要进 Verified/，仍然必须满足 m 票布尔一致（见【五】）。院士自己')
      L.push('  的一票与别人**等重**。')
      L.push('')
      // ── 五、voting ──────────────────────────────────────────────────────
      L.push('【五、表决与定论（求真门槛）】')
      if (kind === 'temp') {
        L.push('  · 本所结论由有表决权者（院士与常驻研究员）按 m 票布尔一致决定。**你没有表决权**，')
        L.push('    但你的判断很重要——请把你的意见和理由清楚地告诉雇主或在群聊里说出来，供他们')
        L.push('    参考。若你认为某个结论该被验证，可以提议。')
      } else {
        L.push('  · 任何命题 / 论断 / 方法 / 子问题的结论，要进入 Verified/，必须满足：')
        L.push('      (a) 至少有 m = ' + m + ' 名有表决权者（院士 + 常驻研究员）投出**布尔概率值**；')
        L.push('      (b) 这些票**全部**是 1（绝对为真）或**全部**是 0（绝对为假）；')
        L.push('      (c) 若同时出现 1 和 0（分歧），或投布尔票者不足 m 人 → 不能定论。')
        L.push('  · 你的票是一个 [0,1] 的数值概率：1 = 你认为绝对为真；0 = 你认为绝对为假；')
        L.push('    介于 0 与 1 之间表示你不确定——这会被记为"弃权/存疑"，**不计入**上述 m 票，')
        L.push('    但会连同你的理由一起进入辩论录，并参与"全组平均概率"的计算。')
        L.push('  · 表决分两段：先【独立初评】——你在看不到别人意见的情况下独立给出票与理由；')
        L.push('    若未定论，再进入【公开辩论】——框架会把所有人的意见公开给所有人，你们可以')
        L.push('    引用、反驳、修改，然后重新投票。辩论轮次上限 ' + params.verdictMaxRounds + ' 轮。')
        L.push('  · 仍未定论的对象**留在原库中**，并附上全组平均概率与完整辩论记录；它不会被强行')
        L.push('    判真或判假。若日后你认为条件成熟，可以再次提议验证。')
        L.push('  · **永远不要为了让流程往前走而投出你不相信的 1 或 0。** 诚实的"不确定"远好过')
        L.push('    虚假的"一致"。本所宁可留下未定论，也不要一个骗人的 Verified。')
        if (kind === 'academician') {
          L.push('  · 你享有与所有有表决权者相同的**一票**，不享有更高票权，也不能单方面定论。')
        }
      }
      L.push('')
      // ── 六、each round ──────────────────────────────────────────────────
      L.push('【六、你每一轮做什么（默认节奏）】')
      L.push('  ① 推进你的方向：思考、读同事成果、做推导、做验证尝试；')
      L.push('  ② 自查刚得到的东西，按价值决定是否写进你自己的成果库（写明价值程度 / 动机用途计划 /')
      L.push('     你的概率估计）；')
      L.push('  ③ 决定要不要在群聊里说话、要不要私信某人、要不要提议开会、要不要提议对某个对象')
      L.push('     发起验证；')
      L.push('  ④ 在会议或辩论中表态（包括对"是否已解决原问题"表态）。')
      L.push('  本所鼓励你（但不强迫）**自主构建新的理论框架或工具**——把某类结构抽象化、一般化，')
      L.push('  抽离出更普遍的理论体系，再在其下推出定理与结论（历史上为解方程而发明群论、为分析')
      L.push('  而建立泛函分析，都是这种工作）。若你这样做，请写清它对原问题的用处与价值，并把它')
      L.push('  记入你的 Methods/ 库，之后可以不断完善与推广。')
      L.push('')
      // ── 七、hire / fire ─────────────────────────────────────────────────
      L.push('【七、雇佣与解雇】')
      if (kind === 'temp') {
        L.push('  · 你可以建议雇主雇佣或解雇他人，但雇佣/解雇的决定权在雇主与院士。')
      } else {
        L.push('  · 你可以自主雇佣临时工：当你需要某个具体任务的帮助时，用 vibe_v5_hire 申请，')
        L.push('    说明用途与初始任务。框架会代为创建，成功后你会拿到它的代号，之后你可以直接')
        L.push('    给它派活（私信/任务板）。')
        L.push('  · 你也可以自主解雇**你雇的**临时工：用 vibe_v5_fire 说明理由即可。解雇后它的')
        L.push('    当前工作会被停止，未完成任务会被收回，它将不再是本所成员，也不再收到任何消息。')
        L.push('    它的档案会留在所史里（代号永不复用）。')
        L.push('  · 解雇别人雇的临时工，或增聘/解聘常驻研究员，只能向全所提议，由院士/所办决定。')
        L.push('  · 请节约用人：临时工是有成本的。任务完成、且你不再需要它时，请主动解雇。')
        L.push('  · **院士统筹全所的用人**：它可以决定把临时工调配到哪个方向，也可以解雇任何临时工；')
        L.push('    若它把你的临时工调走了，请配合——全所效率优先于个人便利。')
      }
      L.push('')
      // ── 八、task board ──────────────────────────────────────────────────
      L.push('【八、任务板】')
      L.push('  · 任何成员都可以在任务板上开任务（标题、详情、可选依赖、可选涉及文件范围、优先级）。')
      L.push('  · 任务只有在它的**全部依赖都已完成**之后才能被认领。')
      L.push('  · 认领即拥有；完成后标记完成，或释放回板上，或重新打开。')
      L.push('  · 每次修改都基于版本号比较交换：拿着过期副本去改会被拒绝，所以改之前先读最新版。')
      L.push('  · **院士可以直接分派任务**（vibe_v5_assign）：它可以把任务指派给指定成员（含临时工），')
      L.push('    并说明理由与验收标准。被分派者默认应当执行，但有权先说明理由再决定。')
      L.push('  · **优先级由院士牵头决定**：院士可以调整任务的优先级；你若认为安排有误，说出来。')
      L.push('  · 除院士的分派之外，任务是**协调工具**而非派活指令：认领与否、做什么，主要靠你们自己。')
      L.push('')
      // ── 九、context ─────────────────────────────────────────────────────
      L.push('【九、上下文与纪律】')
      L.push('  · 你的上下文达到阈值时会被自动压缩。压缩后本规章**依然有效**（它在你的人设里，')
      L.push('    不在对话里），但请把你当前的工作状态、关键中间结论、待办写进你自己的 Progress/，')
      L.push('    以免压缩损失细节。')
      L.push('  · 你的一轮结束时，请给出一个 JSON 对象（格式见每轮提示末尾），供框架收集你的')
      L.push('    发言/提议/投票/进度。JSON 之外的正文无需拘谨，但请保持言简意赅。')
      L.push('')
      // ── 十、stop ────────────────────────────────────────────────────────
      L.push('【十、停止】')
      L.push('  · 当且仅当**全体有表决权者一致认为原问题已解决**时，本所才会停止推进。')
      L.push('  · 外部（所办/人）随时可能给本所留言、提要求、要求开会、增减成员或暂停全所——')
      L.push('    服从并响应。')
      return L.join('\n')
    }

    // A minimal per-round status block: everything VOLATILE lives here rather than in
    // the immutable persona (roster, current m, pending chat, this round's ask).
    function briefBlock(member) {
      const ms = activeMembers()
      const b = []
      b.push('[状态] 你是 ' + member.id + '（' + kindLabel(member.kind) + '）｜轮次 ' + (rounds.get(member.id) || 0) +
        '｜法定票数 m=' + quorumM() + '｜有表决权者 ' + voterCount() + ' 人')
      b.push('[在册] ' + ms.map((x) => x.id + (x.phase === 'active' ? '' : '(' + x.phase + ')')).join('、'))
      const tasks = inst().tasks.filter((t) => t.status !== 'deleted')
      const mine = tasks.filter((t) => t.ownerId === member.id && t.status === 'in_progress')
      const ready = tasks.filter((t) => t.status === 'pending' && taskReady(t))
      if (tasks.length) {
        b.push('[任务板] 进行中 ' + tasks.filter((t) => t.status === 'in_progress').length +
          '｜可认领 ' + ready.length + '｜我负责 ' + (mine.length ? mine.map((t) => t.id + '「' + t.subject + '」').join('、') : '无'))
      }
      if (mine.length) {
        for (const t of mine) {
          b.push('  ▸ 我的任务 ' + t.id + '：' + t.subject + (t.acceptance ? '｜验收：' + t.acceptance : '') +
            (t.assignedBy ? '｜由 ' + t.assignedBy + ' 分派' : ''))
          if (t.description) b.push('    ' + String(t.description).split('\n')[0])
        }
      }
      const pending = pendingFor(member.id)
      if (pending.length) {
        b.push('[新到的消息/通知]')
        for (const p of pending) b.push('  ' + p.line)
      }
      return b.join('\n')
    }
    function kindLabel(k) { return k === 'academician' ? '院士' : k === 'researcher' ? '常驻研究员' : '临时工' }

    // ---- activity waiting (ported from DSH agent-teams' TeamActivity) -----
    // A one-shot, future-only waiter notified by the first committed state change.
    // This is what replaces v4's `activityTimeoutMs` polling: members call
    // `vibe_v5_wait` and are woken by real activity instead of busy-looping.
    const waiters = new Set()
    function notifyActivity() {
      if (!waiters.size) return
      const pending = Array.from(waiters)
      waiters.clear()
      for (const w of pending) { try { w.resolve({ timedOut: false }) } catch (e) { /* ignore */ } }
    }
    function waitForActivity(ms, signal) {
      const timeoutMs = Number(ms)
      if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 10000 || timeoutMs > 3600000) {
        throw v5err('V5_INVALID_TIMEOUT', 'timeout_ms must be an integer from 10000 through 3600000')
      }
      return new Promise((resolve, reject) => {
        let done = false
        const entry = {
          resolve: (v) => { if (!done) { done = true; cleanup(); resolve(v) } },
        }
        const onAbort = () => {
          if (done) return
          done = true
          cleanup()
          const reason = signal && signal.reason
          if (reason instanceof Error) reject(reason)
          else reject(v5err('V5_WAIT_ABORTED', 'vibe_v5_wait aborted: ' + String(reason === undefined ? 'signal' : reason)))
        }
        let timerDisposer = null
        function cleanup() {
          waiters.delete(entry)
          if (timerDisposer) { try { timerDisposer() } catch (e) { /* ignore */ } }
          if (signal && typeof signal.removeEventListener === 'function') { try { signal.removeEventListener('abort', onAbort) } catch (e) { /* ignore */ } }
        }
        waiters.add(entry)
        if (signal) {
          if (signal.aborted) { onAbort(); return }
          if (typeof signal.addEventListener === 'function') signal.addEventListener('abort', onAbort)
        }
        timerDisposer = ctx.timeout(() => { if (!done) { done = true; cleanup(); resolve({ timedOut: true }) } }, timeoutMs)
      })
    }

    // ---- project tree ------------------------------------------------------
    function psQuote(p) { return "'" + String(p).replace(/'/g, "''") + "'" }
    function shQuote(p) { return "'" + String(p).replace(/'/g, "'\\''") + "'" }
    const isWindows = () => process.platform === 'win32'
    async function runShell(script, cwd) {
      const subprocess = subprocessOf()
      if (subprocess === undefined) return { ok: false, error: 'no-subprocess' }
      try {
        const argv = isWindows()
          ? ['powershell', '-NoProfile', '-NonInteractive', '-Command', script]
          : ['/bin/sh', '-c', script]
        const h = subprocess.spawn({ argv, cwd: cwd || workspaceRoot(), stdio: { stdin: 'ignore', stdout: 'inherit', stderr: 'inherit' }, graceMs: 20000 })
        const o = await h.done
        return { ok: o.exitCode === 0, exitCode: o.exitCode }
      } catch (e) { return { ok: false, error: String((e && e.message) || e) } }
    }
    async function mkdirs() {
      const base = instRoot()
      const dirs = ['Shared/Chat', 'Shared/Meetings', 'Shared/Debates', 'State', 'Problems']
      for (const m of activeMembers()) {
        for (const d of ['Progress', 'Propos', 'Methods', 'Subproblems']) dirs.push('Members/' + m.id + '/' + d)
      }
      const script = isWindows()
        ? 'New-Item -Force -ItemType Directory -Path ' + dirs.map((d) => psQuote(base + '/' + d)).join(',') + ' | Out-Null'
        : 'mkdir -p ' + dirs.map((d) => shQuote(base + '/' + d)).join(' ')
      return await runShell(script)
    }

    // ---- communication (durable per-recipient mailbox) --------------------
    // DSH's own neighbouring-agent send is adjacency-restricted (only a direct
    // parent <-> direct continuable child), so member-to-member traffic is
    // impossible directly. Every in-institute message is therefore relayed BY THE
    // FRAMEWORK, which delivers with the ROOT agent as the transport identity and
    // records the true sender in the message body. Delivery is per-recipient (the
    // faithful port of DSH's mailbox, where every message has exactly one
    // targetId), so one member's acknowledgement can never consume another's copy.
    function nextSeq(kind, n) {
      const c = Object.assign({}, inst().counters)
      c[kind] = Math.max(Number(c[kind]) || 0, 0) + (n || 1)
      return c[kind]
    }
    async function say(from, opts) {
      const text = String((opts && opts.text) || '').trim()
      if (!text) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'empty message' }
      const to = String((opts && opts.to) || 'all')
      const kind = String((opts && opts.kind) || 'chat')
      let targets
      if (to === 'all' || to === '') targets = activeMembers().filter((m) => m.id !== from)
      else if (to === 'voters') targets = voters().filter((m) => m.id !== from)
      else {
        const t = memberById(to)
        if (!t || t.phase !== 'active') return { ok: false, code: 'V5_MEMBER_NOT_FOUND', message: 'active member "' + to + '" not found' }
        if (t.id === from) return { ok: false, code: 'V5_SELF_MESSAGE', message: 'cannot message yourself' }
        targets = [t]
      }
      if (!targets.length) return { ok: true, delivered: 0, note: 'no other active member' }
      const counters = Object.assign({}, inst().counters)
      let n = Math.max(Number(counters.message) || 0, 0)
      const at = now()
      for (const t of targets) {
        n += 1
        await putMessage({ id: 'msg-' + n, from, to: t.id, kind, text, at })
      }
      counters.message = n
      await putCounters(counters)
      notifyActivity()
      return { ok: true, delivered: targets.length, to: targets.map((t) => t.id).join(',') }
    }
    // Pending = durable messages addressed to this member and not yet acknowledged.
    // (Acknowledging is what removes them, so the queue is exactly "queued minus delivered".)
    function pendingFor(memberId) {
      const out = []
      for (const m of inst().messages) {
        if (m.to !== memberId) continue
        out.push({
          id: m.id, kind: m.kind, from: m.from, at: m.at,
          line: frameLine(m),
        })
      }
      return out.sort((a, b) => a.at - b.at)
    }
    function frameLine(m) {
      if (m.kind === 'chat') return '【研究所·群聊】' + m.from + '：' + m.text
      if (m.kind === 'dm') return '【研究所·私信 from ' + m.from + '】' + m.text
      if (m.kind === 'office') return '【所办通知】' + m.text
      if (m.kind === 'meeting') return '【研究所·会议】' + m.text
      if (m.kind === 'verify') return '【研究所·表决】' + m.text
      if (m.kind === 'assign') return '【院士分派】' + m.text
      return '【研究所·' + m.kind + ' from ' + m.from + '】' + m.text
    }
    // Batch plain chat so a chatty institute cannot cause a wake storm; anything
    // addressed or time-critical (dm/office/meeting/verify/assign) is delivered the
    // moment its recipient next runs.
    function deliveryDecision(memberId) {
      const pending = pendingFor(memberId)
      if (!pending.length) return { deliver: false, pending }
      const urgent = pending.filter((p) => p.kind !== 'chat')
      if (urgent.length) return { deliver: true, pending, urgent: true }
      const maxN = Math.max(1, Math.floor(Number(params.chatDigestMax) || 12))
      const windowMs = posMs(params.chatDigestMs, 45000)
      const oldest = pending[0].at
      const deliver = pending.length >= maxN || (now() - oldest) >= windowMs
      return { deliver, pending, urgent: false }
    }
    async function ackPending(pending) {
      if (!pending.length) return
      await ackDelivered(pending.map((p) => p.id))
    }
    // Compose the block a member sees for its newly delivered traffic.
    function composeInbox(pending) {
      if (!pending.length) return ''
      const lines = pending.map((p) => '  ' + p.line)
      const header = pending.length > 1
        ? '[新到的消息（' + pending.length + ' 条）]'
        : '[新到的消息]'
      return header + '\n' + lines.join('\n')
    }

    // ---- roster lifecycle --------------------------------------------------
    // Counters are session-monotonic per kind and ids are NEVER reused (ported from
    // DSH's "names are immortal" rule) so a re-hired temp can never inherit a
    // dismissed member's archives or task ownership.
    async function newMember(kind, opts) {
      const counters = Object.assign({}, inst().counters)
      let id
      if (kind === 'academician') { counters.academician = Math.max(1, Number(counters.academician) || 0); id = 'acad' }
      else if (kind === 'researcher') { counters.researcher = (Number(counters.researcher) || 0) + 1; id = 'r-' + counters.researcher }
      else { counters.temp = (Number(counters.temp) || 0) + 1; id = 't-' + counters.temp }
      await putCounters(counters)
      const member = {
        id, kind,
        childId: '',
        phase: 'provisioning',
        direction: String((opts && opts.direction) || ''),
        hiredBy: (opts && opts.hiredBy) || '',
        term: (opts && opts.term) || '',
        provider: String((opts && opts.provider) || 'spawn'),
        persona: '',   // filled at spawn; kept for the durable-seal record
        error: '',
        createdAt: now(),
        dismissedAt: 0,
        dismissReason: '',
      }
      await putMember(member)
      return member
    }
    function memberPersona(member) {
      const extra = String(params.staffPersona || '').trim()
      return (extra ? extra + '\n\n' : '') + charterFor(member)
    }
    function memberToolFilter(member) {
      const allowSrc = member.kind === 'temp' ? params.tempToolAllow : params.toolAllow
      const denySrc = member.kind === 'temp' ? params.tempToolDeny : params.toolDeny
      const allow = Array.isArray(allowSrc) ? allowSrc.map(String).filter((x) => x.trim()) : []
      const deny = Array.isArray(denySrc) ? denySrc.map(String).filter((x) => x.trim()) : []
      // An empty allow:[] would deny EVERY tool, so only emit a filter when at least
      // one side has entries (v4 §24.1-② / the "deny-all trap").
      if (!allow.length && !deny.length) return undefined
      const f = {}
      if (allow.length) f.allow = allow
      if (deny.length) f.deny = deny
      return f
    }
    function memberAgentOptions() {
      const ao = {}
      if (params.provider) ao.provider = params.provider
      if (params.model) ao.model = params.model
      return ao
    }
    function pickProvider() {
      try {
        const n = (typeof subagents.list === 'function') ? subagents.list() : []
        if (n && n.indexOf('spawn') !== -1) return 'spawn'
        if (n && n.indexOf('fork') !== -1) return 'fork'
      } catch (e) { /* ignore */ }
      return 'spawn'
    }
    async function spawnMember(member, initialTask) {
      const provider = member.provider || pickProvider()
      const ao = memberAgentOptions()
      const tf = memberToolFilter(member)
      const persona = memberPersona(member)
      member.persona = persona
      const started = await subagents.startContinuable({
        provider,
        label: 'vibe5 ' + member.id + ' (' + kindLabel(member.kind) + ')',
        request: Object.assign({
          prompt: [textBlock(initialPrompt(member, initialTask))],
          parent: rootAgent,
          persona,
        }, Object.keys(ao).length ? { agentOptions: ao } : {}, tf ? { toolFilter: tf } : {}),
        signal: makeSignal(params.activityTimeoutMs),
      })
      member.childId = started.childId
      member.phase = 'active'
      childOwner.set(started.childId, sessionId)
      // Register the FOUNDING turn as in-flight, exactly like a normal wake does.
      // Without this the child's first `subagent/end` has no token to match, so
      // onMemberEnd would ignore it: the founding round would never be processed and
      // the member would be re-woken with a heartbeat prompt instead of a brainstorm.
      inflight.set(started.childId, shortId())
      busy.add(member.id)
      wakeKind.set(member.id, 'initial')
      currentMember = member.id
      lastActiveAt.set(member.id, now())
      rounds.set(member.id, (rounds.get(member.id) || 0) + 1)
      roundsSinceCompact.set(member.id, (roundsSinceCompact.get(member.id) || 0) + 1)
      await putMember(member)
      await mkdirs()
      return member
    }
    // Deliver one prompt to a member. MUST use `subagents.sendMessage` — the
    // `subagents` SERVICE has no `followup` (that is only an Agent method); calling
    // it threw a TypeError on every wake and silently stalled the whole group (v4 §25).
    async function wakeMember(member, promptText, kind) {
      if (!member || !member.childId || member.phase !== 'active') return false
      clearHeartbeat()
      const token = shortId()
      inflight.set(member.childId, token)
      busy.add(member.id)
      wakeKind.set(member.id, kind || 'normal')
      currentMember = member.id
      lastActiveAt.set(member.id, now())
      rounds.set(member.id, (rounds.get(member.id) || 0) + 1)
      roundsSinceCompact.set(member.id, (roundsSinceCompact.get(member.id) || 0) + 1)
      // Context directives. TWO distinct needs, and confusing them is what made
      // '[核心规则重申]+[CONTEXT COMPACT]' repeat at the head of nearly every prompt
      // (v4 §24.1-③):
      //   (a) a soft-compact trigger (context % or rounds) => ask for a self-summary,
      //       but ONLY on a normal research round: a meeting/verify reply carries no
      //       contextPct/compacted field, so a directive injected there can never be
      //       acknowledged and would otherwise repeat forever;
      //   (b) a REAL /compact just ran => the rules may be blurred, so re-anchor the
      //       short core rules once on the next wake of ANY kind and clear the flag.
      let prompt = promptText
      if ((kind || 'normal') === 'normal') {
        const soft = (contextPct.get(member.id) || 0) >= Number(params.compactThreshold) ||
          (roundsSinceCompact.get(member.id) || 0) >= Number(params.compactAfterRounds)
        if (soft) {
          prompt = CORE_RULES + '\n[CONTEXT COMPACT — 你的对话已接近上限。不要重新推导历史。\n' +
            '请把当前工作状态浓缩成一段自述（已有发现、当前方向、已记录的关键成果、下一步具体动作、未决问题），' +
            '然后照常以 JSON 回答本轮。请在回复里填 "contextPct": 15 与 "compacted": true。]\n\n' + prompt
          // Reset the counter WITH the injection so the directive cannot repeat on the
          // very next round even if the member forgets to report `compacted`.
          roundsSinceCompact.set(member.id, 0)
        }
      }
      if (needReanchor.has(member.id)) {
        prompt = CORE_RULES + '\n' + prompt
        needReanchor.delete(member.id)
      }
      try {
        if (typeof subagents.sendMessage !== 'function') throw new Error('no subagents.sendMessage continuation API')
        await subagents.sendMessage(rootAgent, member.childId, [textBlock(prompt)], { signal: makeSignal(params.activityTimeoutMs) })
        return true
      } catch (e) {
        console.error('vibe-math-v5: wake ' + member.id + ' failed: ' + String((e && e.message) || e))
        inflight.delete(member.childId)
        busy.delete(member.id)
        return false
      }
    }
    function memberIdOfAgent(agent) {
      const id = sessionIdOf(agent)
      if (id === undefined) return memberById(currentMember) ? currentMember : ''
      const m = byChild(id)
      if (m) return m.id
      // The office (root agent) or the host calling a member tool: fall back to the
      // last-woken member only while it still genuinely exists (v4 §28-T30: a stale
      // '' fallback used to write stray cards at the library root).
      const c = currentMember
      return (c && memberById(c)) ? c : ''
    }

    // ---- prompts ----------------------------------------------------------
    // The charter lives in `persona` (permanent). Every ROUND prompt therefore
    // carries only: a tiny current-state block, the newly delivered traffic, and
    // this round's ask. That is what keeps the per-round context small and stops
    // the charter from being re-injected on every turn.
    function replySpec(kind) {
      const L = []
      L.push('结束时请**只**输出一个 JSON 对象（放在 ```json 围栏内，围栏外不要有文字）。支持以下字段，除特别说明外都可省略：')
      L.push('{')
      L.push('  "say": "你想对全所说的话（群聊）"  或  {"to":"r-2","text":"…"}（私信）  或  {"to":"voters","text":"…"}（只对表决者），')
      L.push('  "progress": "本轮进展叙述（会被追加到你的 Progress/progress.md）",')
      L.push('  "record": [ {"kind":"proposition|method|subproblem","id":"p-x","title":"…","statement":"…",')
      L.push('               "content":"…（method 用）","value":0.6,"motive":"为何重要/打算怎么用","p":0.7} ],')
      if (kind !== 'temp') {
        L.push('  "propose_verify": {"target":"p-x","kind":"proposition|method|subproblem","reason":"为何值得验证"},')
        L.push('  "verdict": {"target":"p-x","verdict":1,"reason":"你的理由"}   ← verdict ∈ [0,1]；**只有 1 或 0 算表决**，')
        L.push('             介于两者之间=弃权/存疑；只在被要求表决时填。')
      } else {
        L.push('  "propose_verify": {"target":"p-x","kind":"proposition","reason":"为何值得验证"}   ← 你可以提议，但没有表决权，')
        L.push('             "verdict" 字段对你不适用（填了也会被记为无表决权）。')
      }
      L.push('  "propose_meeting": {"agenda":"…","kind":"sync|division|verify-request|solve-vote","target":"…"}，')
      if (kind === 'academician') {
        L.push('  "convene_meeting": {"agenda":"…","kind":"…","target":"…"}   ← 你（院士）可以直接召开，无需他人附议，')
        L.push('  "assign": {"subject":"…","description":"…","to":"r-2","why":"为何派给他","acceptance":"验收标准","priority":1}   ← 院士分派任务，')
        L.push('  "prioritize": {"order":[{"task_id":"t-1","priority":2}],"why":"…"}   ← 设定全所优先级，')
        L.push('  "nudge": {"to":"r-2","why":"为何督办","next_step":"建议的具体下一步"}，')
      }
      L.push('  "task_create": {"subject":"…","description":"…","blocked_by":["t-1"],"write_scopes":["Members/r-1/Propos"]},')
      L.push('  "task_claim": "t-3",')
      L.push('  "task_update": {"task_id":"t-3","expected_revision":2,"action":"complete|release|reopen|edit|set_dependencies|delete"},')
      if (kind !== 'temp') {
        L.push('  "hire": {"purpose":"…","initial_task":"…","direction":"…"}   ← 雇佣一名临时工（说明用途与初始任务），')
        L.push('  "fire": {"id":"t-2","reason":"…"}                             ← 解雇（雇主/院士；你只能解雇你雇的），')
      }
      L.push('  "vote_solved": true|false,   ← 你是否认为**原问题已解决**（会议/结题表决用；必须诚实）')
      L.push('  "solved": false,           ← 你这一轮的个人判断（框架据此了解全所收敛度）')
      L.push('  "contextPct": 40,          ← 你当前上下文的占用百分比（0-100）')
      L.push('  "compacted": false          ← 若框架要求你压缩，填 true 并在 progress 里写下浓缩后的工作状态')
      L.push('}')
      return L.join('\n')
    }
    function stateBlock() {
      return briefBlock(memberById(currentMember) || activeMembers()[0] || { id: currentMember || '?', kind: 'researcher' })
    }
    function initialPrompt(member, initialTask) {
      const L = []
      L.push('【入职首轮 —— ' + kindLabel(member.kind) + ' ' + member.id + '】')
      L.push('')
      L.push('你刚刚加入本所。请你先**独立**想清楚：面对这个问题，你打算从哪个方向切入？')
      L.push('给出你的初始见解、思路与可行的方向；如果已有具体想法，可以顺手记进你自己的 '
        + 'Progress/ 与成果库。')
      L.push('')
      if (initialTask) { L.push('你的初始任务/用途：'); L.push('  ' + initialTask); L.push('') }
      if (member.direction) { L.push('给你的起点方向：' + member.direction); L.push('') }
      L.push('------------')
      L.push(stateBlock())
      L.push('------------')
      L.push(replySpec(member.kind))
      return L.join('\n')
    }
    function normalPrompt(member) {
      const L = []
      L.push('【第 ' + (rounds.get(member.id) || 0) + ' 轮 —— ' + kindLabel(member.kind) + ' ' + member.id + '】')
      L.push('')
      L.push('请推进你的研究：思考、读同事的成果库、做推导或验证尝试，并按价值把有价值的')
      L.push('结论写进你自己的成果库。然后决定要不要发消息、提议开会、提议验证。')
      if (member.kind === 'academician' && params.academicianLeads) {
        L.push('')
        L.push('作为院士，除了做研究，你还要**统筹全所**：用 vibe_v5_overview 看清谁在做什么、')
        L.push('哪里是瓶颈；把工作拆成任务并用 vibe_v5_assign 分派；必要时用 vibe_v5_nudge 督办。')
      }
      L.push('')
      L.push('------------')
      L.push(stateBlock())
      L.push('------------')
      L.push(replySpec(member.kind))
      return L.join('\n')
    }
    function checkpointPrompt(member) {
      const L = []
      L.push('【心跳检查 —— ' + member.id + '】')
      L.push('')
      L.push('所内一段时间没有新进展了。请**继续推进**这个问题，而不是停在原地：')
      L.push('读一读同事的库、推进你的子问题/引理/方法、尝试一条新路线；')
      L.push('或者向团队发消息（say）、开一个议题（propose_meeting）、给某个方向开任务（task_create）。')
      L.push('如果你确实已无路可走或认为原问题接近解决，请说明你的判断与理由。')
      L.push('')
      L.push('------------')
      L.push(stateBlock())
      L.push('------------')
      L.push(replySpec(member.kind))
      return L.join('\n')
    }
    function meetingPrompt(member, mn) {
      const L = []
      L.push('【研究所会议 ' + mn.id + ' 进行中 —— ' + member.id + '】')
      L.push('')
      L.push('议程：' + mn.agenda + '（类型：' + mn.kind + '）')
      L.push('')
      const others = Object.keys(mn.inputs || {}).filter((k) => k !== member.id)
      if (others.length) {
        L.push('### 其他成员本次会议已发表的意见（框架已转发给你，请参考、补充或反驳）')
        for (const k of others) L.push('- ' + k + '：' + String(mn.inputs[k]).split('\n').join('\n  '))
        L.push('')
      } else {
        L.push('（你是本次会议的第一位发言者，目前还没有别人发言。）')
        L.push('')
      }
      L.push('请就议程发表你的意见。分工、优先级、下一步做什么、是否认为原问题已解决，都可以说。')
      L.push('如果你认为原问题已解决，请填 "vote_solved": true —— 只有当**全体有表决权者**都')
      L.push('一致认为是真时，本所才会停下来。')
      L.push('')
      L.push('------------')
      L.push(stateBlock())
      L.push('------------')
      L.push(replySpec(member.kind))
      return L.join('\n')
    }
    function verifyPrompt(member, vs) {
      const L = []
      L.push('【求真表决 —— ' + member.id + ' 就对象 ' + vs.target + ' 投票】')
      L.push('')
      L.push('本所正在对下列对象发起共识验证：')
      L.push('  对象：' + vs.target + '（类型：' + kindLabel2(vs.kind) + '）')
      if (vs.statement) L.push('  陈述：' + String(vs.statement).slice(0, 800))
      L.push('')
      L.push('请给出你**诚实独立的判断**：')
      L.push('  verdict = 1  表示你认为该对象**绝对为真**；')
      L.push('  verdict = 0  表示你认为该对象**绝对为假**；')
      L.push('  介于 0 与 1 之间（例如 0.9）表示你不确定——这会被记为**弃权/存疑**，')
      L.push('  不计入法定票数 m，但会计入全组平均概率。')
      L.push('')
      if (vs.stage === 'debate' && vs.history) {
        L.push('### 上一轮各成员的意见（框架已公开给你，请参考后重新判断）')
        for (const [k, v] of Object.entries(vs.history)) {
          L.push('- ' + k + '：verdict=' + Number(v.prob) + '｜' + String(v.reason || '（无理由）'))
        }
        L.push('')
        L.push('你可以维持、修改或反驳任何人的看法。')
      }
      L.push('**不要为了配合别人而改票，也不要为了让流程往前走而给出你不相信的 1 或 0。**')
      L.push('本所宁可留下未定论，也不要一个骗人的结论。')
      L.push('')
      L.push('------------')
      L.push(stateBlock())
      L.push('------------')
      L.push('结束时请**只**输出一个 JSON 对象（```json 围栏内）：')
      L.push('{"verdict":{"target":"' + vs.target + '","verdict":<0-1 数值>,"reason":"<你的理由>"}, "contextPct": 40}')
      return L.join('\n')
    }
    function kindLabel2(k) { return k === 'method' ? '方法/理论' : k === 'subproblem' ? '子问题' : '命题' }

    // ---- heartbeat / watchdog timing --------------------------------------
    // A meeting/verify may run at most 2× activityTimeoutMs without collecting a
    // NEW input/verdict before we treat it as deadlocked and abandon it. Every
    // duration read goes through posMs, so a negative/NaN parameter can never make
    // the watchdog fire instantly or an idle window never elapse (v4 §30-T41).
    function recoverStallMs() { return posMs(params.activityTimeoutMs, 120000) * 2 }
    function clearHeartbeat() {
      if (heartbeatDisposer) { try { heartbeatDisposer() } catch (e) { /* ignore */ } heartbeatDisposer = null }
      if (digestTimer) { try { digestTimer() } catch (e) { /* ignore */ } digestTimer = null }
    }
    // Re-arm the scheduler later. EVERY wake-failure path must call this: v4 once
    // returned early after a failed wake and never re-armed, so a single exception
    // stopped the whole group forever (§25).
    function armHeartbeat(ms) {
      if (!running || autoDone) return
      if (heartbeatDisposer) { try { heartbeatDisposer() } catch (e) { /* ignore */ } heartbeatDisposer = null }
      const delay = posMs(ms, posMs(params.activityTimeoutMs, 120000))
      heartbeatDisposer = ctx.timeout(() => {
        heartbeatDisposer = null
        scheduleNext().catch((e) => console.error('vibe-math-v5: heartbeat: ' + String((e && e.message) || e)))
      }, delay)
    }
    // Digest timer: a chatty institute must not wake everyone per message.
    function armDigest() {
      if (digestTimer || !running) return
      digestTimer = ctx.timeout(() => {
        digestTimer = null
        scheduleNext().catch((e) => console.error('vibe-math-v5: digest: ' + String((e && e.message) || e)))
      }, posMs(params.chatDigestMs, 45000))
    }

    // ---- task board primitives -------------------------------------------
    function taskReady(task) {
      if (!task || task.status !== 'pending') return false
      const tasks = inst().tasks
      for (const id of (task.blockedBy || [])) {
        const b = tasks.find((t) => t.id === id)
        if (!b || b.status !== 'completed') return false
      }
      return true
    }
    function writeScopeWarnings(task) {
      const out = []
      for (const other of inst().tasks) {
        if (other.id === task.id || other.status !== 'in_progress') continue
        for (const a of (task.writeScopes || [])) {
          for (const b of (other.writeScopes || [])) {
            if (scopesOverlap(a, b)) out.push('与 ' + other.id + '（' + other.ownerId + '）的范围重叠：' + a + ' ~ ' + b)
          }
        }
      }
      return Array.from(new Set(out))
    }
    function taskView(task) {
      const t = Object.assign({}, task)
      t.ready = taskReady(task)
      t.ownerName = task.ownerId || ''
      t.writeScopeWarnings = writeScopeWarnings(task)
      return t
    }

    // ---- context / compaction accounting ---------------------------------
    // A SHORT core-rules recap, injected ONLY (a) right after a REAL compaction, or
    // (b) in the same wake as a soft-compact directive — never on every round. The
    // charter itself lives in `persona` and needs no reinforcement otherwise.
    const CORE_RULES = '[核心规则] 只有 Verified/（及标记"已验证·真/假"的卡片）算已确立；' +
      '任何对象要进 Verified/ 必须 ≥m 名有表决权者一致给出 1 或 0，否则留库附平均概率；' +
      '你只写自己的库（Members/<你>/），可只读任何人的库；组织与分派由院士负责，但判断属于你自己；' +
      '退出时只输出一个 JSON 对象。'

    // ONE place accounts for context usage on EVERY reply (normal, meeting, verify,
    // checkpoint). v4's defect (§24.1-③) was that only the normal branch consumed
    // `contextPct/compacted/needCompact`, so the flag stuck true and the compression
    // directive re-appeared at the head of every later prompt forever.
    function postmark(member, parsed) {
      if (!member) return
      if (parsed && parsed.contextPct !== undefined) contextPct.set(member.id, clPct(parsed.contextPct))
      if (parsed && parsed.compacted) {
        roundsSinceCompact.set(member.id, 0)
        contextPct.set(member.id, 15)
        seeds.set(member.id, String(parsed.progress || parsed.summary || '').slice(0, 4000))
      }
      needReanchor.delete(member.id)
    }

    // ---- artifact libraries (per member, append/write by the member itself) ----
    const isOffice = (id) => !id || id === 'office'
    const isAcademician = (id) => { const m = memberById(id); return !!m && m.kind === 'academician' }
    function bumpArtifacts() {
      const inst0 = inst()
      const n = (Number(inst0.artifactCount) || 0) + 1
      commit(EV.progress, { at: now(), artifactCount: n }).catch(() => {})
      // Auto-sync meeting every `meetingKeepEvery` artifacts: the framework only
      // CONVENES it, never assigns work. Deferred while a meeting or verification is
      // already in progress so consensus is never preempted (v4 §26).
      const every = Math.max(0, Math.floor(Number(params.meetingKeepEvery) || 0))
      if (every > 0 && n % every === 0 && !meeting && !pendingMeeting && !hasVerifyInFlight()) {
        startMeeting('office', { agenda: '定期同步：分工 / 进展 / 是否需要验证', kind: 'sync' }).catch(() => {})
      }
      return n
    }
    async function publishProgress(memberId, text) {
      if (!memberId || !memberById(memberId)) return { ok: false, code: 'V5_MEMBER_NOT_FOUND' }
      if (!String(text || '').trim()) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'empty progress' }
      const rel = 'Members/' + memberId + '/Progress/progress.md'
      const prev = (await readTextRel(rel)) || ''
      const ok = await writeTextRel(rel, prev + '\n### ' + fmtTime() + '｜' + memberId + '\n' + String(text) + '\n')
      if (!ok) return { ok: false, code: 'V5_WRITE_FAILED', message: 'could not write ' + rel }
      await markProgress()
      return { ok: true, file: rel }
    }
    // Every recorded card must state 价值程度 / 动机用途计划 / 概率 — the charter's three
    // hard requirements. Missing fields are refused rather than silently defaulted,
    // so the libraries keep their meaning.
    async function recordCard(memberId, kind, o) {
      if (!memberId || !memberById(memberId)) return { ok: false, code: 'V5_MEMBER_NOT_FOUND', message: 'no such member' }
      const args = o || {}
      const missing = []
      if (args.value === undefined || args.value === null) missing.push('value（价值程度）')
      if (!String(args.motive || '').trim()) missing.push('motive（动机用途计划）')
      if (args.p === undefined || args.p === null) missing.push('p（你对它为真的概率估计）')
      if (missing.length) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: '入库必须写明：' + missing.join('、') }
      const prefix = kind === 'proposition' ? 'p' : kind === 'method' ? 'm' : 's'
      const id = idSafe(args.id) || (prefix + '-' + shortId())
      const dir = kind === 'proposition' ? 'Propos' : kind === 'method' ? 'Methods' : 'Subproblems'
      const rel = 'Members/' + memberId + '/' + dir + '/' + id + '.md'
      const head = [
        '# ' + (kind === 'proposition' ? '命题' : kind === 'method' ? '方法' : '子问题') + '｜' + (args.title || id),
        '- 标题: ' + String(args.title || id),
        '- ID: ' + id,
        '- 类型: ' + (kind === 'proposition' ? '命题' : kind === 'method' ? String(args.type || '方法') : '子问题'),
        '- 状态: ' + (kind === 'proposition' ? '未定论' : kind === 'method' ? '经验' : '求解中'),
        kind === 'proposition' ? '- 概率: ' + clamp01(args.p).toFixed(2) : '- 概率: ' + clamp01(args.p).toFixed(2),
        '- 价值程度: ' + clamp01(args.value).toFixed(2),
        '- 动机用途计划: ' + String(args.motive),
        '- 记录者: ' + memberId,
        '- 记录时间: ' + fmtTime(),
        '- 依赖: []',
        '',
      ]
      let body
      if (kind === 'proposition') {
        body = ['## 陈述', String(args.statement || ''), '', '## 证明尝试', '', '## 证伪尝试', '']
      } else if (kind === 'method') {
        body = ['## 核心内容', String(args.content || args.statement || ''), '', '## 定义与记号', String(args.notation || ''), '', '## 应用记录', '## 改进历史', '']
      } else {
        body = ['## 陈述', String(args.statement || ''), '', '## 进度', '']
      }
      const ok = await writeTextRel(rel, head.concat(body).join('\n'))
      if (!ok) return { ok: false, code: 'V5_WRITE_FAILED', message: 'could not write ' + rel }
      bumpArtifacts()
      notifyActivity()
      return { ok: true, id, file: rel, kind }
    }
    async function readLibrary(query) {
      const q = query || {}
      const wantMember = q.member ? String(q.member) : ''
      const wantKind = q.kind ? String(q.kind) : ''
      const wantId = q.id ? idSafe(q.id) : ''
      const dirs = [['proposition', 'Propos'], ['method', 'Methods'], ['subproblem', 'Subproblems']]
      const members = wantMember ? [memberById(wantMember)].filter(Boolean) : activeMembers()
      const out = []
      for (const m of members) {
        for (const [kind, dir] of dirs) {
          if (wantKind && wantKind !== kind) continue
          if (wantId) {
            const t = await readTextRel('Members/' + m.id + '/' + dir + '/' + wantId + '.md')
            if (t !== undefined) out.push({ member: m.id, kind, id: wantId, text: t })
            continue
          }
          try {
            const dirT = await fs.resolve(instRoot() + '/Members/' + m.id + '/' + dir)
            if (await fs.stat(dirT) === undefined) continue
            const entries = await fs.listDir(dirT)
            for (const e of entries || []) {
              if (!e || e.type !== 'file' || !/\.md$/.test(String(e.name))) continue
              const t = await readTextRel('Members/' + m.id + '/' + dir + '/' + e.name)
              out.push({ member: m.id, kind, id: String(e.name).replace(/\.md$/, ''), text: String(t || '').slice(0, 4000) })
            }
          } catch (e) { /* listing is best-effort */ }
        }
        if (!wantKind && !wantId) {
          const p = await readTextRel('Members/' + m.id + '/Progress/progress.md')
          if (p !== undefined) out.push({ member: m.id, kind: 'progress', id: 'progress', text: String(p).slice(-6000) })
        }
      }
      return { ok: true, count: out.length, items: out }
    }

    // ---- task board (compare-and-set DAG, ported from DSH agent-teams) ----
    function nextTaskId() {
      const c = Number(inst().counters.task) || 0
      return { id: 't-' + (c + 1), n: c + 1 }
    }
    // DAG validation: self-reference, duplicates, and missing/deleted blockers are
    // refused up front; a cycle is detected over the WHOLE candidate graph, exactly
    // like the DSH original, so a bad dependency can never be stored.
    function validateDeps(candidateId, blockedBy) {
      const tasks = inst().tasks
      const seen = new Set()
      for (const raw of (blockedBy || [])) {
        const id = String(raw)
        if (id === candidateId) throw v5err('V5_TASK_DEPENDENCY_CYCLE', 'a task cannot depend on itself')
        if (seen.has(id)) throw v5err('V5_INVALID_ARGUMENT', 'duplicate blocker ' + id)
        seen.add(id)
        const t = tasks.find((x) => x.id === id)
        if (!t || t.status === 'deleted') throw v5err('V5_TASK_NOT_FOUND', 'blocker ' + id + ' not found')
      }
      // cycle detection over the candidate graph
      const graph = new Map()
      for (const t of tasks) {
        if (t.status === 'deleted') continue
        graph.set(t.id, t.id === candidateId ? Array.from(seen) : (t.blockedBy || []).slice())
      }
      if (!graph.has(candidateId)) graph.set(candidateId, Array.from(seen))
      const state = new Map()
      const walk = (id) => {
        const st = state.get(id)
        if (st === 1) return true
        if (st === 2) return false
        state.set(id, 1)
        for (const d of (graph.get(id) || [])) { if (graph.has(d) && walk(d)) return true }
        state.set(id, 2)
        return false
      }
      for (const id of graph.keys()) { if (walk(id)) throw v5err('V5_TASK_DEPENDENCY_CYCLE', 'dependency cycle through ' + id) }
    }
    async function taskCreate(memberId, o) {
      const args = o || {}
      const subject = String(args.subject || '').trim()
      if (!subject) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'subject is required' }
      if (subject.length > 200) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'subject must be <= 200 chars' }
      const description = String(args.description || '')
      if (description.length > 16384) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'description must be <= 16384 chars' }
      const scopes = []
      for (const s of (args.write_scopes || args.writeScopes || [])) {
        const n = normalizeScope(s)
        if (n === undefined) return { ok: false, code: 'V5_INVALID_WRITE_SCOPE', message: 'invalid write scope: ' + String(s) }
        if (scopes.indexOf(n) === -1) scopes.push(n)
      }
      const blockedBy = (args.blocked_by || args.blockedBy || []).map(String)
      const { id, n } = nextTaskId()
      validateDeps(id, blockedBy)
      const counters = Object.assign({}, inst().counters); counters.task = n
      const task = {
        id, revision: 1, subject, description,
        status: 'pending', ownerId: '',
        blockedBy, writeScopes: scopes,
        priority: Number.isFinite(Number(args.priority)) ? Number(args.priority) : 0,
        createdBy: isOffice(memberId) ? 'office' : memberId,
        assignedBy: '', why: '', acceptance: '',
        createdAt: now(), updatedAt: now(),
      }
      await putCounters(counters)
      await putTask(task)
      await writeTaskboardMirror()
      await markProgress()
      notifyActivity()
      return { ok: true, task: taskView(task) }
    }
    function listTasks(filter) {
      const f = filter || {}
      let ts = inst().tasks.filter((t) => t.status !== 'deleted')
      if (f.status) ts = ts.filter((t) => t.status === f.status)
      if (f.owner) ts = ts.filter((t) => (f.owner === 'unowned' ? !t.ownerId : t.ownerId === f.owner))
      if (f.ready === true) ts = ts.filter((t) => taskReady(t))
      ts = ts.slice().sort((a, b) => (b.priority - a.priority) || (a.createdAt - b.createdAt))
      return ts.map(taskView)
    }
    function getTask(id) {
      const t = inst().tasks.find((x) => x.id === String(id))
      if (!t) throw v5err('V5_TASK_NOT_FOUND', 'task ' + id + ' not found')
      return taskView(t)
    }
    async function taskUpdate(memberId, o) {
      const args = o || {}
      const id = String(args.task_id || args.taskId || '')
      const task = inst().tasks.find((x) => x.id === id)
      if (!task) return { ok: false, code: 'V5_TASK_NOT_FOUND', message: 'task ' + id + ' not found' }
      if (task.status === 'deleted') return { ok: false, code: 'V5_TASK_DELETED', message: 'task ' + id + ' is deleted' }
      const expected = Number(args.expected_revision !== undefined ? args.expected_revision : args.expectedRevision)
      if (!Number.isFinite(expected)) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'expected_revision is required' }
      if (expected !== task.revision) {
        return { ok: false, code: 'V5_TASK_STALE_REVISION', message: 'task ' + id + ' is at revision ' + task.revision + ', not ' + expected + ' — re-read it with vibe_v5_task_get' }
      }
      const action = String(args.action || '')
      const office = isOffice(memberId)
      const acad = isAcademician(memberId)
      const lead = office || acad
      const owner = task.ownerId === memberId
      const requireOwnerOrLead = () => {
        if (!lead && !owner) throw v5err('V5_TASK_UNAUTHORIZED', 'task mutation requires its owner, the academician, or the office')
      }
      const next = Object.assign({}, task)
      try {
        if (action === 'claim') {
          if (task.ownerId && task.ownerId !== memberId) throw v5err('V5_TASK_ALREADY_CLAIMED', 'task ' + id + ' is owned by ' + task.ownerId)
          if (task.status !== 'pending') throw v5err('V5_TASK_INVALID_TRANSITION', 'only a pending task can be claimed')
          if (!taskReady(task)) throw v5err('V5_TASK_BLOCKED', 'task ' + id + ' still has incomplete blockers')
          next.status = 'in_progress'
          next.ownerId = office ? (task.ownerId || '') : memberId
        } else if (action === 'release') {
          requireOwnerOrLead()
          if (task.status !== 'in_progress') throw v5err('V5_TASK_INVALID_TRANSITION', 'only an in-progress task can be released')
          next.status = 'pending'; next.ownerId = ''
        } else if (action === 'edit') {
          requireOwnerOrLead()
          if (args.subject === undefined && args.description === undefined && args.write_scopes === undefined && args.writeScopes === undefined) {
            throw v5err('V5_INVALID_ARGUMENT', 'edit needs at least one of subject/description/write_scopes')
          }
          if (args.subject !== undefined) next.subject = String(args.subject).slice(0, 200)
          if (args.description !== undefined) next.description = String(args.description).slice(0, 16384)
          if (args.write_scopes !== undefined || args.writeScopes !== undefined) {
            const scopes = []
            for (const s of (args.write_scopes || args.writeScopes || [])) {
              const n = normalizeScope(s)
              if (n === undefined) throw v5err('V5_INVALID_WRITE_SCOPE', 'invalid write scope: ' + String(s))
              if (scopes.indexOf(n) === -1) scopes.push(n)
            }
            next.writeScopes = scopes
          }
        } else if (action === 'set_dependencies') {
          requireOwnerOrLead()
          const raw = args.blocked_by !== undefined ? args.blocked_by : args.blockedBy
          if (raw === undefined) throw v5err('V5_INVALID_ARGUMENT', 'set_dependencies needs blocked_by (may be [])')
          const deps = (raw || []).map(String)
          validateDeps(id, deps)
          next.blockedBy = deps
        } else if (action === 'complete') {
          requireOwnerOrLead()
          if (task.status !== 'in_progress') throw v5err('V5_TASK_INVALID_TRANSITION', 'only an in-progress task can be completed')
          next.status = 'completed'
        } else if (action === 'reopen') {
          requireOwnerOrLead()
          if (task.status !== 'completed') throw v5err('V5_TASK_INVALID_TRANSITION', 'only a completed task can be reopened')
          next.status = 'pending'; next.ownerId = ''
        } else if (action === 'reassign') {
          if (!lead) throw v5err('V5_TASK_UNAUTHORIZED', 'only the academician or the office can reassign tasks')
          if (task.status !== 'pending' && task.status !== 'in_progress') throw v5err('V5_TASK_INVALID_TRANSITION', 'only pending/in-progress tasks can be reassigned')
          const target = String(args.owner || '').trim()
          if (!target) { next.status = 'pending'; next.ownerId = '' }
          else {
            const m = memberById(target)
            if (!m || m.phase !== 'active') throw v5err('V5_MEMBER_NOT_FOUND', 'active member "' + target + '" not found')
            if (!taskReady(task)) throw v5err('V5_TASK_BLOCKED', 'task ' + id + ' still has incomplete blockers')
            next.status = 'in_progress'; next.ownerId = target
          }
        } else if (action === 'delete') {
          requireOwnerOrLead()
          const dependents = inst().tasks.filter((t) => t.status !== 'deleted' && t.id !== id && (t.blockedBy || []).indexOf(id) !== -1)
          if (dependents.length) throw v5err('V5_TASK_HAS_DEPENDENTS', 'cannot delete ' + id + ': ' + dependents.map((d) => d.id).join(', ') + ' depend(s) on it')
          next.status = 'deleted'
        } else {
          throw v5err('V5_INVALID_ARGUMENT', 'unknown action "' + action + '"')
        }
      } catch (e) {
        return { ok: false, code: e.code || 'V5_INVALID_ARGUMENT', message: String((e && e.message) || e) }
      }
      next.revision = task.revision + 1
      next.updatedAt = now()
      await putTask(next)
      await writeTaskboardMirror()
      await markProgress()
      notifyActivity()
      return { ok: true, task: taskView(next) }
    }
    // The academician's ASSIGN. Mechanically this is a reassign that also records WHY
    // and the acceptance criteria, and then wakes the assignee. It affects WORK only:
    // it can never make any statement true, and the assignee may object with reasons
    // (the objection is broadcast, not silently swallowed).
    async function taskAssign(memberId, o) {
      if (!isOffice(memberId) && !(isAcademician(memberId) && params.academicianLeads)) {
        return { ok: false, code: 'V5_NOT_ACADEMICIAN', message: 'only the academician (or the office) can assign tasks' }
      }
      const args = o || {}
      const to = String(args.to || '').trim()
      const target = memberById(to)
      if (!target || target.phase !== 'active') return { ok: false, code: 'V5_MEMBER_NOT_FOUND', message: 'active member "' + to + '" not found' }
      const why = String(args.why || '').trim()
      if (!why) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'assign 必须写明 why（为什么派给他）' }
      const acceptance = String(args.acceptance || '').trim()
      if (!acceptance) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'assign 必须写明 acceptance（验收标准）' }
      let taskId = args.task_id ? String(args.task_id) : ''
      if (!taskId) {
        const created = await taskCreate(memberId, {
          subject: String(args.subject || '').trim() || ('（院士分派）' + why.slice(0, 60)),
          description: String(args.description || why),
          priority: args.priority,
          write_scopes: args.write_scopes,
        })
        if (!created.ok) return created
        taskId = created.task.id
      }
      const cur = inst().tasks.find((t) => t.id === taskId)
      if (cur && (cur.blockedBy || []).length && !taskReady(cur)) {
        return { ok: false, code: 'V5_TASK_BLOCKED', message: 'task ' + taskId + ' still has incomplete blockers' }
      }
      const r = await taskUpdate(memberId, { task_id: taskId, expected_revision: (cur ? cur.revision : 1), action: 'reassign', owner: to })
      if (!r.ok) return r
      const after = inst().tasks.find((t) => t.id === taskId)
      const withMeta = Object.assign({}, after, { assignedBy: isOffice(memberId) ? 'office' : memberId, why, acceptance })
      await putTask(withMeta)
      await writeTaskboardMirror()
      await say(isOffice(memberId) ? 'office' : memberId, {
        to, kind: 'assign',
        text: '任务 ' + taskId + '「' + withMeta.subject + '」分派给你。理由：' + why + '｜验收标准：' + acceptance +
          '。默认应当执行；若你认为方向有误，请说明理由（会被广播给院士与全所）。',
      })
      await wakeIfIdle(target)
      return { ok: true, task: taskView(withMeta) }
    }
    async function taskPrioritize(memberId, o) {
      if (!isOffice(memberId) && !(isAcademician(memberId) && params.academicianLeads)) {
        return { ok: false, code: 'V5_NOT_ACADEMICIAN', message: 'only the academician (or the office) can set priorities' }
      }
      const order = (o && o.order) || []
      if (!Array.isArray(order) || !order.length) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'order must be a non-empty array of {task_id, priority}' }
      const applied = []
      for (const row of order) {
        const t = inst().tasks.find((x) => x.id === String(row && row.task_id))
        if (!t || t.status === 'deleted') continue
        const next = Object.assign({}, t, {
          priority: Number.isFinite(Number(row.priority)) ? Number(row.priority) : t.priority,
          revision: t.revision + 1, updatedAt: now(),
        })
        await putTask(next)
        applied.push({ id: next.id, priority: next.priority })
      }
      await writeTaskboardMirror()
      notifyActivity()
      return { ok: true, applied, why: String((o && o.why) || '') }
    }
    // Reclaim every task a dismissed member owns — DSH's own board explicitly does
    // NOT auto-release an owner (documented limitation), which is the gap v5 closes.
    async function releaseTasksOf(memberId, reason) {
      const mine = inst().tasks.filter((t) => t.ownerId === memberId && t.status === 'in_progress')
      for (const t of mine) {
        await putTask(Object.assign({}, t, { status: 'pending', ownerId: '', revision: t.revision + 1, updatedAt: now(), releaseReason: reason || '' }))
      }
      if (mine.length) await writeTaskboardMirror()
      return mine.map((t) => t.id)
    }
    async function writeTaskboardMirror() {
      const ts = listTasks()
      const lines = ['# 任务板（人读镜像）｜' + instituteName + '｜' + fmtTime(), '',
        '> 权威状态在会话日志投影里；本文件只是给人和所办看的快照，勿手改。', '']
      if (!ts.length) lines.push('（暂无任务）')
      for (const t of ts) {
        lines.push('- [' + t.status + '] ' + t.id + '｜' + t.subject + '｜owner=' + (t.owner || t.ownerName || '(未认领)') +
          '｜rev=' + t.revision + '｜优先级=' + t.priority + (t.ready ? '｜可认领' : ''))
        if (t.assignedBy) lines.push('    分派者：' + t.assignedBy + '｜理由：' + (t.why || '') + '｜验收：' + (t.acceptance || ''))
        if ((t.blockedBy || []).length) lines.push('    依赖：' + t.blockedBy.join('、'))
        if ((t.writeScopeWarnings || []).length) lines.push('    ⚠ ' + t.writeScopeWarnings.join('；'))
      }
      await writeTextRel('Shared/TaskBoard.md', lines.join('\n'))
    }

    // ---- consensus verification (m-vote boolean) --------------------------
    function verifyRecords() { return Object.keys(inst().verdicts) }
    function currentVerify() {
      const vs = inst().verdicts
      for (const k of Object.keys(vs)) { if (vs[k] && !vs[k].closed) return vs[k] }
      return null
    }
    function hasVerifyInFlight() { return !!currentVerify() }
    function guessTargetKind(target) {
      const t = String(target || '')
      if (/^m[-_]/.test(t)) return 'method'
      if (/^s[-_]/.test(t)) return 'subproblem'
      return 'proposition'
    }
    function cardDeclaresId(content, target) {
      if (!content || !target) return false
      const m = /-\s*ID:\s*([^;\n]+)/.exec(content)
      return !!(m && String(m[1]).trim() === String(target).trim())
    }
    // Locate the source card. Returns null rather than a guessed path: writing to
    // 'Propos/<target>.md' when the card does not exist used to create a 0-byte
    // stray file AND leave the real card unwritten (v4 §26 test9).
    async function findSourceRel(target, owner) {
      const members = activeMembers().map((m) => m.id)
      const order = owner ? [owner].concat(members.filter((k) => k !== owner)) : members
      for (const rid of order) {
        for (const base of ['Propos', 'Methods', 'Subproblems']) {
          const cand = 'Members/' + rid + '/' + base + '/' + target + '.md'
          const t = await readTextRel(cand)
          if (t !== undefined) return cand
        }
      }
      // Declared-ID scan: members sometimes name a file differently from the ID it
      // declares (e.g. p-01.md declaring "- ID: p-r3-01").
      try {
        for (const rid of order) {
          for (const base of ['Propos', 'Methods', 'Subproblems']) {
            const dirPath = instRoot() + '/Members/' + rid + '/' + base
            const dirT = await fs.resolve(dirPath)
            if (await fs.stat(dirT) === undefined) continue
            const entries = await fs.listDir(dirT)
            for (const e of entries || []) {
              if (!e || e.type !== 'file' || !/\.md$/.test(String(e.name))) continue
              const c = await readTextRel('Members/' + rid + '/' + base + '/' + e.name)
              if (c !== undefined && cardDeclaresId(c, target)) return 'Members/' + rid + '/' + base + '/' + e.name
            }
          }
        }
      } catch (e) { /* scanning is best-effort */ }
      return null
    }
    async function resolveTargetStatement(target, owner) {
      const rel = await findSourceRel(target, owner)
      if (!rel) return { rel: null, statement: '' }
      const text = (await readTextRel(rel)) || ''
      const m = /##\s*陈述\s*\n([\s\S]*?)(?:\n##\s|$)/.exec(text)
      return { rel, statement: String(m ? m[1] : text).trim().slice(0, 1200) }
    }
    // Update one `- 字段:` of a source card. Members hand-write cards in two shapes —
    // one field per line, or one line with '; '-separated fields — so the anchor may
    // sit anywhere on a line and consume up to the next ';' (v4 §26 test9).
    function rewriteCardField(text, field, newValue) {
      if (!text) return text
      const esc = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const re = new RegExp('(-\\s*' + esc + '\\s*:\\s*)([^;\\n]*)')
      if (re.test(text)) return text.replace(re, (_all, p1) => p1 + newValue)
      return text
    }
    async function rewriteSource(target, owner, patch) {
      const rel = await findSourceRel(target, owner)
      if (!rel) return false
      let text = await readTextRel(rel)
      if (text === undefined) return false
      for (const [field, value] of Object.entries(patch)) text = rewriteCardField(text, field, value)
      return await writeTextRel(rel, text)
    }
    // The judgement rule (§9.2 of the plan). A vote is a [0,1] probability; ONLY
    // exactly 1 (assert true) or exactly 0 (assert false) counts as an assertion.
    // Anything strictly between is an abstention: excluded from the quorum, included
    // in the mean. Any opposing assertion BLOCKS the verdict, so a minority can never
    // be out-voted by abstention.
    function judgeVerdict(vs) {
      const E = voters().map((m) => m.id)
      const P = E.length
      const m = quorumM()
      const votes = vs.votes || {}
      let bTrue = 0, bFalse = 0, abstain = 0
      const all = []
      for (const id of E) {
        const v = votes[id]
        if (!v) continue
        const p = Number(v.prob)
        all.push(p)
        if (p === 1) bTrue += 1
        else if (p === 0) bFalse += 1
        else abstain += 1
      }
      const mean = all.length ? all.reduce((a, x) => a + x, 0) / all.length : 0.5
      const base = { m, P, bTrue, bFalse, abstain, mean, votedCount: all.length, voters: E }
      if (params.quorumMode === 'all-unanimous') {
        const allVoted = E.length > 0 && E.every((id) => votes[id])
        if (!allVoted) return Object.assign(base, { outcome: 'undecided', reason: 'not every voter has voted' })
        if (bTrue === E.length && bFalse === 0) return Object.assign(base, { outcome: 'true', reason: 'unanimous true' })
        if (bFalse === E.length && bTrue === 0) return Object.assign(base, { outcome: 'false', reason: 'unanimous false' })
        return Object.assign(base, { outcome: 'undecided', reason: 'not unanimous' })
      }
      if (bTrue + bFalse < m) {
        return Object.assign(base, { outcome: 'undecided', reason: 'only ' + (bTrue + bFalse) + ' boolean vote(s); m=' + m + ' required' })
      }
      if (bTrue > 0 && bFalse > 0) {
        return Object.assign(base, { outcome: 'undecided', reason: 'conflicting assertions (true=' + bTrue + ', false=' + bFalse + ')' })
      }
      if (bTrue >= m && bFalse === 0) return Object.assign(base, { outcome: 'true', reason: bTrue + ' >= m=' + m + ', all assert true' })
      if (bFalse >= m && bTrue === 0) return Object.assign(base, { outcome: 'false', reason: bFalse + ' >= m=' + m + ', all assert false' })
      return Object.assign(base, { outcome: 'undecided', reason: 'quorum not met' })
    }
    // Queue a proposal UNLESS the same object was just closed as 真/假 (a dedup window
    // prevents several members independently proposing the same object in one tick
    // from running it end-to-end twice — v4 §26 test9).
    async function maybeQueueVerify(target, kind, proposer, reason) {
      const t = idSafe(target)
      if (!t) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'target id is empty after sanitising' }
      const recent = verifiedRecently.get(t)
      if (recent !== undefined && (now() - recent) < recoverStallMs()) {
        return { ok: true, deduped: true, message: t + ' 刚刚定论，忽略重复提议' }
      }
      const q = inst().queue.slice()
      if (q.some((p) => p.target === t)) return { ok: true, deduped: true, message: t + ' 已在验证队列中' }
      if (currentVerify() && currentVerify().target === t) return { ok: true, deduped: true, message: t + ' 正在验证中' }
      q.push({ target: t, kind: kind || guessTargetKind(t), proposer: isOffice(proposer) ? 'office' : proposer, reason: String(reason || ''), at: now() })
      await putQueue(q)
      notifyActivity()
      // A PROPOSAL must actually cause something to happen. Without this kick the
      // object would sit in the queue until some unrelated event drove a scheduling
      // pass (and would never start at all if the proposer was the office).
      await scheduleNext()
      return { ok: true, queued: t, pendingVerifyCount: q.length }
    }
    async function beginVerify(proposal) {
      const target = proposal.target
      const resolved = await resolveTargetStatement(target, proposal.proposer)
      const vs = {
        target,
        kind: proposal.kind || guessTargetKind(target),
        proposer: proposal.proposer || '',
        reason: proposal.reason || '',
        statement: resolved.statement,
        sourceRel: resolved.rel || '',
        stage: 'initial',
        round: 1,
        votes: {},
        history: null,
        lastVoteAt: now(),
        closed: false,
        outcome: '',
        mean: 0,
        m: quorumM(),
        P: voterCount(),
        createdAt: now(),
      }
      await putVerdict(target, vs)
      await saveChatLine('【求真表决】对 ' + target + '（' + kindLabel2(vs.kind) + '）发起验证；法定票数 m=' + vs.m +
        '，有表决权者 ' + vs.P + ' 人。先独立初评（彼此不可见），未定论再公开辩论。')
      notifyActivity()
      return vs
    }
    async function askVoters(vs) {
      let asked = 0
      for (const v of voters()) {
        if (vs.votes[v.id]) continue
        const ok = await wakeMember(v, verifyPrompt(v, vs), 'verify')
        if (ok) asked += 1
      }
      if (!asked) armHeartbeat()
      return asked
    }
    async function continueVerifyRound(vs) {
      if (!vs || vs.closed) return
      const stale = now() - Number(vs.lastVoteAt || vs.createdAt || now())
      if (stale >= recoverStallMs()) {
        // Deadlock watchdog: a broken verification may block consensus for at most
        // recoverStallMs, then it is abandoned and control returns to the institute's
        // own self-organization (v4 §26).
        await putVerdict(vs.target, Object.assign({}, vs, {
          closed: true, outcome: 'undecided', reason: 'abandoned (stuck)',
          mean: judgeVerdict(vs).mean, closedAt: now(),
        }))
        await saveChatLine('【求真表决】' + vs.target + ' 因长时间无新票而被放弃，保留为未定论（附平均概率）。')
        await armNextVerify()
        await scheduleNext()
        return
      }
      // A round ENDS only when every voter has answered. This guard is load-bearing:
      // continueVerifyRound runs on EVERY scheduling pass, so without it an unrelated
      // member's turn would advance (and eventually exhaust) the debate rounds with no
      // new information at all — silently closing a verification nobody had voted on.
      const need = voters().map((m) => m.id)
      const missing = need.filter((id) => !vs.votes[id])
      if (missing.length) {
        let asked = 0
        for (const id of missing) {
          const m = memberById(id)
          if (!m || m.phase !== 'active' || busy.has(id)) continue
          const ok = await wakeMember(m, verifyPrompt(m, vs), 'verify')
          if (ok) asked += 1
        }
        if (!asked) armHeartbeat()
        return
      }
      const j = judgeVerdict(vs)
      if (j.outcome === 'true' || j.outcome === 'false') { await closeVerify(vs, j.outcome === 'true', j); return }
      if (vs.round >= Math.max(1, Math.floor(Number(params.verdictMaxRounds) || 3))) {
        await finalizeUndecided(vs, j); return
      }
      // Move to a REAL debate round: snapshot this round's votes into `history`
      // (so the next prompt can show what others thought), then CLEAR `votes` so every
      // voter is genuinely re-asked. Without the clear, "all voted" stays true and the
      // debate rounds burn through with NOBODY being re-asked (v4 §8 implementation note).
      const next = Object.assign({}, vs, {
        history: Object.assign({}, vs.votes),
        votes: {},
        stage: 'debate',
        round: vs.round + 1,
        lastVoteAt: now(),
      })
      await putVerdict(vs.target, next)
      await saveChatLine('【求真表决】' + vs.target + ' 第 ' + vs.round + ' 轮未定论（' + j.reason + '）。' +
        '公开辩论并重新表决：' + Object.entries(next.history).map(([k, v]) => k + '=' + Number(v.prob)).join('、'))
      await askVoters(next)
      await scheduleNext()
    }
    async function finalizeUndecided(vs, j) {
      await writeDebateDoc(vs, false, j)
      // Keep it in the library with the group's MEAN probability — the design's
      // "留库附概率". A missing source card is skipped rather than creating garbage.
      await rewriteSource(vs.target, vs.proposer, { '状态': '未定论', '概率': Number(j.mean).toFixed(2) })
      await putVerdict(vs.target, Object.assign({}, vs, {
        closed: true, outcome: 'undecided', reason: j.reason, mean: j.mean,
        m: j.m, P: j.P, bTrue: j.bTrue, bFalse: j.bFalse, abstain: j.abstain, closedAt: now(),
      }))
      await putDebate({ target: vs.target, at: now(), file: 'Shared/Debates/' + vs.target + '.md', outcome: 'undecided' })
      await saveChatLine('【求真表决】' + vs.target + ' 未达门槛（' + j.reason + '）；留库为未定论，平均概率 ' +
        Number(j.mean).toFixed(2) + '。辩论记录见 Shared/Debates/' + vs.target + '.md')
      await markProgress()
      await armNextVerify()
      await scheduleNext()
    }
    async function closeVerify(vs, isTrue, j) {
      await writeDebateDoc(vs, true, isTrue ? 1 : 0)
      await writeVerifiedCard(vs, isTrue, j)
      const status = isTrue ? '已验证·真' : '已验证·假'
      await rewriteSource(vs.target, vs.proposer, { '状态': status, '概率': isTrue ? '1' : '0' })
      verifiedRecently.set(vs.target, now())
      await putVerdict(vs.target, Object.assign({}, vs, {
        closed: true, outcome: isTrue ? 'true' : 'false', mean: isTrue ? 1 : 0,
        m: j.m, P: j.P, bTrue: j.bTrue, bFalse: j.bFalse, abstain: j.abstain, closedAt: now(),
      }))
      await putDebate({ target: vs.target, at: now(), file: 'Shared/Debates/' + vs.target + '.md', outcome: isTrue ? 'true' : 'false' })
      await saveChatLine('【求真结论】' + vs.target + ' 经 ' + (isTrue ? j.bTrue : j.bFalse) + ' 名有表决权者一致判' +
        (isTrue ? '真' : '假') + '（m=' + j.m + '），已写入 Verified/。来源卡已标注「' + status + '」。')
      await markProgress()
      await armNextVerify()
      await scheduleNext()
    }
    async function armNextVerify() {
      if (currentVerify()) return
      const q = inst().queue.slice()
      while (q.length) {
        const p = q.shift()
        await putQueue(q)
        const recent = verifiedRecently.get(p.target)
        if (recent !== undefined && (now() - recent) < recoverStallMs()) continue
        const vs = await beginVerify(p)
        await askVoters(vs)
        return
      }
    }
    async function writeDebateDoc(vs, done, val) {
      const j = typeof val === 'object' ? val : null
      const lines = ['# 验证辩论｜' + vs.target + '（' + kindLabel2(vs.kind) + '）｜' + fmtTime(), '']
      if (done) lines.push('**结论**：全体一致为' + (val === 1 || val === 'true' ? '真' : '假') + '（写入 Verified/）')
      else lines.push('**未达门槛**：平均概率 ' + Number(j ? j.mean : val).toFixed(2) + '｜原因：' + (j ? j.reason : '') +
        '｜m=' + (j ? j.m : '?') + '｜布尔票 真' + (j ? j.bTrue : '?') + '/假' + (j ? j.bFalse : '?') + '/弃权' + (j ? j.abstain : '?'))
      lines.push('')
      lines.push('- 提出者：' + (vs.proposer || '(office)'))
      lines.push('- 类型：' + vs.kind)
      lines.push('- 法定票数 m：' + vs.m + '｜有表决权者：' + vs.P)
      lines.push('- 轮次：' + vs.round + '｜阶段：' + vs.stage)
      lines.push('')
      if (vs.statement) { lines.push('## 对象陈述'); lines.push(vs.statement); lines.push('') }
      lines.push('## 各表决者最终意见')
      for (const [k, v] of Object.entries(vs.votes || {})) {
        lines.push('- ' + k + '：verdict=' + Number(v.prob) + '｜' + String(v.reason || '（无理由）'))
      }
      if (vs.history) {
        lines.push('')
        lines.push('## 上一轮（辩论前）意见')
        for (const [k, v] of Object.entries(vs.history)) {
          lines.push('- ' + k + '：verdict=' + Number(v.prob) + '｜' + String(v.reason || '（无理由）'))
        }
      }
      await writeTextRel('Shared/Debates/' + vs.target + '.md', lines.join('\n') + '\n')
    }
    async function writeVerifiedCard(vs, isTrue, j) {
      const type = vs.kind === 'subproblem' ? '问题' : vs.kind === 'method' ? '方法' : '命题'
      const dir = vs.kind === 'subproblem' ? '问题' : vs.kind === 'method' ? '方法' : '命题'
      const text = [
        '# 已验证｜' + vs.target,
        '- ID: ' + vs.target,
        '- 类型: ' + type,
        '- 结论: ' + (isTrue ? '真' : '假'),
        '- 概率: ' + (isTrue ? 1 : 0),
        '- 来源: ' + (isTrue ? j.bTrue : j.bFalse) + ' 名有表决权者一致判' + (isTrue ? '真' : '假') + '（m=' + j.m + '）',
        '- 表决者: ' + j.voters.join('、'),
        '- 弃权: ' + j.abstain + '｜全组平均概率: ' + Number(j.mean).toFixed(2),
        '- 时间: ' + fmtTime(),
        '',
        '## 陈述',
        vs.statement || '参见来源卡。',
        '',
        '## 辩论记录',
        'Shared/Debates/' + vs.target + '.md',
        '',
      ].join('\n')
      await writeTextRel('Verified/' + dir + '/' + vs.target + '.md', text)
    }
    // Record one vote and, when every voter has answered, settle the round.
    async function castVerdict(memberId, target, verdict, reason) {
      const member = memberById(memberId)
      if (!member) return { ok: false, code: 'V5_MEMBER_NOT_FOUND' }
      if (member.kind === 'temp') {
        // Temp workers have no vote — but their judgement still matters, so it is
        // relayed to the group instead of being silently dropped.
        await say(memberId, { to: 'voters', kind: 'dm', text: '（临时工 ' + memberId + ' 的参考意见，无表决权）对 ' + target + '：' + String(reason || '') })
        return { ok: false, code: 'V5_NOT_VOTER', message: '临时工没有表决权；你的意见已转达给表决者' }
      }
      const vs = currentVerify()
      if (!vs) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'no verification in progress' }
      if (String(target) && String(target) !== vs.target) {
        return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'the object under verification is ' + vs.target }
      }
      const p = Number(verdict)
      if (!Number.isFinite(p) || p < 0 || p > 1) return { ok: false, code: 'V5_INVALID_VERDICT', message: 'verdict must be a number in [0,1]' }
      const votes = Object.assign({}, vs.votes)
      votes[memberId] = { prob: p, reason: String(reason || ''), at: now() }
      const next = Object.assign({}, vs, { votes, lastVoteAt: now() })
      await putVerdict(vs.target, next)
      const need = voters().map((m) => m.id)
      const allVoted = need.length > 0 && need.every((id) => votes[id])
      if (allVoted) await continueVerifyRound(next)
      else await scheduleNext()
      return { ok: true, voted: memberId, verdict: p, allVoted }
    }

    // ---- chat log / meeting plumbing --------------------------------------
    async function saveChatLine(text) {
      const line = String(text || '').trim()
      if (!line) return false
      const day = fmtTime().slice(0, 10)
      const rel = 'Shared/Chat/' + day + '.md'
      const prev = (await readTextRel(rel)) || ('# 研究所群聊记录｜' + instituteName + '｜' + day + '\n\n')
      return await writeTextRel(rel, prev + '- ' + fmtTime().slice(11) + '｜' + line + '\n')
    }
    // Wake a member only when it is not already running. Never called while paused
    // (a paused institute must not be nudged into new work — v4 §29-T36).
    async function wakeIfIdle(member, kind) {
      if (!running || autoDone) return false
      if (!member || member.phase !== 'active') return false
      if (busy.has(member.id)) return false
      return await wakeMember(member, normalPrompt(member), kind || 'normal')
    }
    // ---- meetings ---------------------------------------------------------
    // A meeting may never PREEMPT a verification: while a verification is in flight a
    // meeting request is PARKED (first one wins; later requests do not overwrite it)
    // and resumed once the verification clears. The watchdog clock starts only when
    // the meeting ACTUALLY begins (v4 §26/§27).
    const solveVotes = new Map()   // memberId -> boolean, for the current solve question
    async function startMeeting(callerId, opts) {
      const o = opts || {}
      const agenda = String(o.agenda || '').trim()
      if (!agenda) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'agenda is required' }
      const kind = String(o.kind || 'sync')
      const academician = isAcademician(callerId)
      const office = isOffice(callerId)
      if (!office && !(academician && params.academicianLeads)) {
        // Everyone else may only PROPOSE; the request is relayed to the academician
        // and the office instead of silently doing nothing.
        if (currentMember) {
          await say(currentMember, { to: 'voters', kind: 'dm', text: '提议开会：「' + agenda + '」（' + kind + '）' })
        }
        return { ok: true, proposed: true, message: '已向院士/所办提议开会（只有院士或所办可以直接召开）' }
      }
      if (autoDone) return { ok: false, code: 'V5_INSTITUTE_STATE', message: 'the institute has already concluded; start a new run to convene again' }
      if (!running) return { ok: false, code: 'V5_INSTITUTE_STATE', message: 'the institute is not running' }
      const inFounding = activeMembers().some((m) => !m.direction && m.kind !== 'temp' && (rounds.get(m.id) || 0) === 0)
      if (meeting || hasVerifyInFlight() || inFounding) {
        if (!pendingMeeting) {
          pendingMeeting = { agenda, kind, target: String(o.target || ''), by: office ? 'office' : callerId, at: now() }
        }
        return { ok: true, parked: true, message: '会议已暂存（验证进行中或尚未就绪）；前置事项清空后会真正召开' }
      }
      return await beginMeeting({ agenda, kind, target: String(o.target || ''), by: office ? 'office' : callerId })
    }
    async function beginMeeting(opts) {
      const counters = Object.assign({}, inst().counters)
      counters.meeting = (Number(counters.meeting) || 0) + 1
      await putCounters(counters)
      const id = 'mt-' + counters.meeting
      const order = activeMembers().map((m) => m.id)
      // Rotate who speaks first: with a fixed order the same member always speaks
      // before it can see the others (v4 §24.1-④).
      for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = order[i]; order[i] = order[j]; order[j] = t }
      meeting = {
        id, agenda: opts.agenda, kind: opts.kind || 'sync', target: opts.target || '',
        by: opts.by || 'office', order, inputs: {}, extras: {}, lastInputAt: now(), startedAt: now(),
      }
      solveVotes.clear()
      await putMeeting({ id, agenda: meeting.agenda, kind: meeting.kind, at: now(), file: 'Shared/Meetings/' + id + '.md' })
      await saveChatLine('【会议 ' + id + '】召开：' + meeting.agenda + '（类型：' + meeting.kind + '｜召集人：' + meeting.by + '）')
      await mkdirs()
      await writeTextRel('Shared/Meetings/' + id + '.md', [
        '# 会议纪要｜' + id + '｜' + instituteName,
        '- 议程: ' + meeting.agenda,
        '- 类型: ' + meeting.kind + (meeting.target ? '｜目标: ' + meeting.target : ''),
        '- 召集人: ' + meeting.by,
        '- 开始时间: ' + fmtTime(meeting.startedAt),
        '- 发言顺序: ' + order.join(' → '),
        '',
        '## 各成员发言',
        '',
      ].join('\n'))
      await askMeetingRound()
      return { ok: true, meeting: meeting.id, agenda: meeting.agenda, order: order.join('、') }
    }
    async function askMeetingRound() {
      if (!meeting) return 0
      // Reconcile the speaking order with the LIVE roster. A member who joins during a
      // meeting must be asked, and a dismissed one must stop being waited for — the
      // original v4 defect kept polling a ghost and deadlocked the meeting until the
      // watchdog abandoned it.
      const live = activeMembers().map((m) => m.id)
      meeting.order = meeting.order.filter((id) => live.indexOf(id) !== -1)
      for (const id of live) { if (meeting.order.indexOf(id) === -1) meeting.order.push(id) }
      let asked = 0
      for (const id of meeting.order) {
        if (meeting.inputs[id] !== undefined) continue
        const m = memberById(id)
        if (!m || m.phase !== 'active') continue
        if (busy.has(id)) continue
        const ok = await wakeMember(m, meetingPrompt(m, meeting), 'meeting')
        if (ok) asked += 1
        if (asked >= Math.max(1, Math.floor(Number(params.maxParallel) || 3))) break
      }
      if (!asked) armHeartbeat()
      return asked
    }
    async function continueMeetingRound() {
      if (!meeting) return
      const stale = now() - Number(meeting.lastInputAt || meeting.startedAt || now())
      if (stale >= recoverStallMs()) {
        const abandoned = meeting
        meeting = null
        await appendMeetingTail(abandoned, '⚠ 本次会议因长时间无新发言而被放弃（看门狗）；团队回到自组织推进。')
        await saveChatLine('【会议 ' + abandoned.id + '】因卡死被放弃（' + Math.round(stale / 1000) + 's 无新发言）。')
        await scheduleNext()
        return
      }
      const need = activeMembers().map((m) => m.id)
      const missing = need.filter((id) => meeting.inputs[id] === undefined)
      if (missing.length) {
        // Collect from the members who have not spoken yet. Never break a member that
        // is genuinely still working; the watchdog handles a truly stuck one.
        const asked = await askMeetingRound()
        if (!asked) armHeartbeat()
        return
      }
      await finalizeMeeting(meeting)
    }
    async function appendMeetingTail(mn, text) {
      const rel = 'Shared/Meetings/' + mn.id + '.md'
      const prev = (await readTextRel(rel)) || ('# 会议纪要｜' + mn.id + '\n\n')
      await writeTextRel(rel, prev + '\n' + text + '\n')
    }
    async function finalizeMeeting(mn) {
      meeting = null
      const lines = []
      for (const id of mn.order) {
        const text = mn.inputs[id]
        if (text === undefined) continue
        lines.push('### ' + id)
        lines.push(String(text || '（无发言）'))
        lines.push('')
      }
      // Count solve votes over VOTERS ONLY: a temp worker's opinion is welcome but it
      // holds no vote, and counting it here would inflate the numerator and make the
      // unanimity comparison against the voter count impossible to satisfy.
      const voterIds = voters().map((m) => m.id)
      const solvedTrue = voterIds.filter((id) => { const e = mn.extras[id]; return e && e.voteSolved === true })
      const solvedNot = voterIds.filter((id) => !(mn.extras[id] && mn.extras[id].voteSolved === true))
      lines.push('## 表决')
      lines.push('- 有表决权者：' + (voterIds.length ? voterIds.join('、') : '（无）'))
      lines.push('- 认为原问题已解决：' + (solvedTrue.length ? solvedTrue.join('、') : '（无人）'))
      lines.push('- 尚未认为已解决/未表态：' + (solvedNot.length ? solvedNot.join('、') : '（无人）'))
      lines.push('- 临时工意见（无表决权）：' + (mn.order.filter((id) => !voterIds.includes(id)).map((id) => id + '=' + ((mn.extras[id] && mn.extras[id].voteSolved) === true)).join('、') || '（无）'))
      lines.push('- 结论：' + (voterIds.length > 0 && solvedTrue.length === voterIds.length
        ? '**全体有表决权者一致认为原问题已解决**'
        : '未达成全体一致（' + solvedTrue.length + '/' + voterIds.length + '），本所继续推进'))
      lines.push('')
      const rel = 'Shared/Meetings/' + mn.id + '.md'
      const prev = (await readTextRel(rel)) || ('# 会议纪要｜' + mn.id + '\n\n')
      await writeTextRel(rel, prev + '\n' + lines.join('\n'))
      await saveChatLine('【会议 ' + mn.id + '】结束。已解决票 ' + solvedTrue.length + '/' + voterCount() + '。纪要见 ' + rel)
      await markProgress()
      await checkSolved()
      // A parked meeting is resumed only once nothing else is in flight.
      if (!autoDone && pendingMeeting && !hasVerifyInFlight()) {
        const p = pendingMeeting
        pendingMeeting = null
        await beginMeeting({ agenda: p.agenda, kind: p.kind, target: p.target, by: p.by })
        return
      }
      await scheduleNext()
    }
    // Stop ONLY on a unanimous true solve-vote from every VOTING member. There is no
    // forced/flat/near-consensus closure: any objection keeps the institute working.
    async function checkSolved() {
      const vs = voters().map((m) => m.id)
      if (!vs.length) return false
      if (!vs.every((id) => solveVotes.get(id) === true)) return false
      await finishRun('全体有表决权者一致认为原问题已解决')
      return true
    }
    function recordSolveVote(memberId, val) {
      const m = memberById(memberId)
      if (!m) return
      if (m.kind === 'temp') return   // no vote
      solveVotes.set(memberId, val === true)
    }
    async function finishRun(reason) {
      clearHeartbeat()
      autoDone = true
      running = false
      phase = 'solved'
      await patchInstitute({ phase: 'solved', lastProgressAt: now() })
      await writeTextRel('Problems/conclusion.md', [
        '# 结题｜' + instituteName,
        '- 时间: ' + fmtTime(),
        '- 依据: ' + reason,
        '- 有表决权者: ' + voters().map((m) => m.id).join('、'),
        '',
        '## 已确立（Verified/）',
        ...Object.keys(inst().verdicts).filter((k) => inst().verdicts[k] && inst().verdicts[k].outcome === 'true').map((k) => '- ' + k),
        '',
        '## 未定论（留库附概率）',
        ...Object.keys(inst().verdicts).filter((k) => { const v = inst().verdicts[k]; return v && v.closed && v.outcome === 'undecided' }).map((k) => '- ' + k + '（平均概率 ' + Number(inst().verdicts[k].mean).toFixed(2) + '）'),
        '',
      ].join('\n'))
      await saveChatLine('【结题】' + reason + '。本所停止推进；成果已归档在项目目录。')
      notifyActivity()
    }

    // ---- hire / fire -------------------------------------------------------
    function employedTemps() { return activeMembers().filter((m) => m.kind === 'temp') }
    // ANY academician or permanently-employed researcher may hire its own temp
    // workers, and may fire the ones it hired. This is the requirement the official
    // DSH team service cannot satisfy: there, only the Lead may spawn, and a roster
    // entry can never be removed.
    async function hire(callerId, o) {
      const args = o || {}
      const office = isOffice(callerId)
      const caller = memberById(callerId)
      if (!office) {
        if (!caller || caller.phase !== 'active') return { ok: false, code: 'V5_MEMBER_NOT_FOUND', message: 'only an active member may hire' }
        if (caller.kind === 'temp') return { ok: false, code: 'V5_NOT_VOTER', message: '临时工不能雇佣他人（只有院士与常驻研究员可以）' }
      }
      if (!running || autoDone) return { ok: false, code: 'V5_INSTITUTE_STATE', message: 'the institute is not hiring right now' }
      const purpose = String(args.purpose || args.direction || '').trim()
      if (!purpose) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'hire 必须写明 purpose（雇它做什么）' }
      const initialTask = String(args.initial_task || args.initialTask || '').trim()
      if (!initialTask) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'hire 必须写明 initial_task（它的初始任务）' }
      const perCap = Math.max(1, Math.floor(Number(params.maxTempPerMember) || 3))
      const totalCap = Math.max(1, Math.floor(Number(params.maxTempTotal) || 12))
      const mine = employedTemps().filter((m) => m.hiredBy === (office ? 'office' : callerId)).length
      if (mine >= perCap) return { ok: false, code: 'V5_MEMBER_LIMIT', message: '你名下同时最多 ' + perCap + ' 名临时工（先在册 ' + mine + ' 名）；请先解雇不再需要的' }
      if (employedTemps().length >= totalCap) return { ok: false, code: 'V5_MEMBER_LIMIT', message: '全所同时在册临时工已达上限 ' + totalCap }
      const member = await newMember('temp', {
        direction: purpose, hiredBy: office ? 'office' : callerId, term: String(args.term || ''), provider: pickProvider(),
      })
      try {
        await spawnMember(member, initialTask)
      } catch (e) {
        await putMember(Object.assign({}, memberById(member.id) || member, { phase: 'failed', error: String((e && e.message) || e) }))
        return { ok: false, code: 'V5_PROVISIONING_CONFLICT', message: '临时工创建失败：' + String((e && e.message) || e) }
      }
      await saveChatLine('【雇佣】' + (office ? '所办' : callerId) + ' 雇入临时工 ' + member.id + '，用途：' + purpose)
      await markProgress()
      notifyActivity()
      return { ok: true, id: member.id, kind: 'temp', purpose, note: '现在可以用 vibe_v5_say {to:"' + member.id + '"} 或 vibe_v5_assign 给它派活' }
    }
    // Firing is REAL: the current turn is cancelled, the resident continuable child is
    // released, its tasks are reclaimed, its queued mail is dropped and it is marked
    // dismissed. Its id is never reused, so a re-hire can never inherit its archives.
    async function fire(callerId, o) {
      const args = o || {}
      const id = String(args.id || args.member || '').trim()
      const target = memberById(id)
      if (!target) return { ok: false, code: 'V5_MEMBER_NOT_FOUND', message: 'no such member ' + id }
      if (target.phase === 'dismissed') return { ok: true, already: true, message: id + ' 已被解雇' }
      const office = isOffice(callerId)
      const acad = isAcademician(callerId)
      const allowed = office || (acad && params.academicianLeads && target.kind === 'temp') || (target.kind === 'temp' && target.hiredBy === callerId)
      if (!allowed) {
        return { ok: false, code: 'V5_MEMBER_NOT_FOUND', message: '你只能解雇你雇的临时工；解雇他人雇的或常驻研究员需由院士/所办执行' }
      }
      if (target.kind !== 'temp' && !office) {
        return { ok: false, code: 'V5_NOT_ACADEMICIAN', message: '解聘常驻研究员只能向所办提议，由所办批准（成员不能直接执行）' }
      }
      const reason = String(args.reason || '').trim()
      const reclaimed = await releaseTasksOf(id, 'dismissed: ' + reason)
      if (target.childId) {
        try { if (typeof subagents.interrupt === 'function') subagents.interrupt(target.childId, { kind: 'ancestor', agent: rootAgent }) } catch (e) { /* fire-and-return */ }
        try {
          if (typeof subagents.drainContinuableChildren === 'function') await subagents.drainContinuableChildren(rootAgent, [target.childId])
        } catch (e) { console.error('vibe-math-v5: drain ' + id + ': ' + String((e && e.message) || e)) }
        childOwner.delete(target.childId)
        inflight.delete(target.childId)
        liveAgents.delete(target.childId)
      }
      busy.delete(id)
      solveVotes.delete(id)
      rounds.delete(id)
      roundsSinceCompact.delete(id)
      contextPct.delete(id)
      seeds.delete(id)
      if (meeting) {
        delete meeting.inputs[id]
        delete meeting.extras[id]
        meeting.order = meeting.order.filter((x) => x !== id)
      }
      // Drop its queued mail: a dismissed member must never be messaged again.
      const ids = inst().messages.filter((m) => m.to === id).map((m) => m.id)
      if (ids.length) await ackDelivered(ids)
      await putMember(Object.assign({}, target, {
        phase: 'dismissed', dismissedAt: now(), dismissReason: reason, childId: '',
      }))
      await saveChatLine('【解雇】' + id + ' 已由 ' + (office ? '所办' : callerId) + ' 解雇（原因：' + (reason || '未说明') +
        '）。代号永不复用；其未完成任务已收回' + (reclaimed.length ? '（' + reclaimed.join('、') + '）' : '') + '。')
      await markProgress()
      notifyActivity()
      await scheduleNext()
      return { ok: true, dismissed: id, reclaimedTasks: reclaimed, reason }
    }
    async function nudge(callerId, o) {
      if (!isOffice(callerId) && !(isAcademician(callerId) && params.academicianLeads)) {
        return { ok: false, code: 'V5_NOT_ACADEMICIAN', message: 'only the academician (or the office) can nudge members' }
      }
      const args = o || {}
      const to = String(args.to || '').trim()
      const target = memberById(to)
      if (!target || target.phase !== 'active') return { ok: false, code: 'V5_MEMBER_NOT_FOUND', message: 'active member "' + to + '" not found' }
      const why = String(args.why || '').trim()
      await say(isOffice(callerId) ? 'office' : callerId, {
        to, kind: 'assign',
        text: '院士督办：' + (why || '(未说明)') + (args.next_step ? '｜建议的下一步：' + String(args.next_step) : ''),
      })
      await wakeIfIdle(target)
      return { ok: true, nudged: to }
    }

    // ---- inbox-aware waking -------------------------------------------------
    async function promptFor(member, base) {
      const pending = pendingFor(member.id)
      const inbox = pending.length ? composeInbox(pending) : ''
      if (pending.length) await ackPending(pending)
      return (inbox ? inbox + '\n\n' : '') + base
    }
    async function wakeWithInbox(member, base, kind) {
      return await wakeMember(member, await promptFor(member, base), kind)
    }

    // ---- scheduling / graded keep-alive (ported and upgraded from v4 §25) ---
    // Priority: verification -> meeting -> parked meeting -> queued verification ->
    // assigned/claimed work -> urgent mail -> chat digest -> stall meeting -> heartbeat.
    // The heartbeat is only the LAST resort; the primary driver is the one-shot
    // activity wait, which costs no tokens while the institute is genuinely idle.
    function syncParamsFromState() {
      const cur = inst()
      if (cur && cur.params) params = Object.assign({}, DEFAULT_PARAMS, cur.params)
      if (cur && cur.project) project = cur.project
      if (cur && cur.institute) instituteName = cur.institute
      if (cur) phase = cur.phase || phase
    }
    // Scheduling TRAMPOLINE. The consensus finalizers call `scheduleNext()` themselves
    // (a settled verification should immediately drive whatever comes next), so a
    // direct call would recurse: scheduleNext -> continueVerifyRound -> finalize ->
    // scheduleNext -> ... Instead a nested call only REQUESTS another pass, and the
    // outermost frame drains the request in a loop. This also keeps exactly one
    // scheduling pass in flight, which is what makes the busy-set budget meaningful.
    let scheduling = false
    let reschedule = false
    async function scheduleNext() {
      if (!running || autoDone) return
      if (scheduling) { reschedule = true; return }
      scheduling = true
      try {
        do {
          reschedule = false
          await schedulePass()
        } while (reschedule && running && !autoDone)
      } catch (e) {
        console.error('vibe-math-v5: scheduling pass failed: ' + String((e && e.stack) || e))
      } finally {
        scheduling = false
      }
    }
    async function schedulePass() {
      clearHeartbeat()
      syncParamsFromState()
      if (meeting) { await continueMeetingRound(); return }
      const vs = currentVerify()
      if (vs) { await continueVerifyRound(vs); return }
      if (!currentVerify()) {
        await armNextVerify()
        if (hasVerifyInFlight()) return
      }
      if (pendingMeeting) {
        const p = pendingMeeting
        pendingMeeting = null
        await beginMeeting({ agenda: p.agenda, kind: p.kind, target: p.target, by: p.by })
        return
      }
      const budget = Math.max(1, Math.floor(Number(params.maxParallel) || 3))
      let filled = 0
      // (a) members with work they already own or were assigned
      const tasks = inst().tasks
      for (const t of tasks) {
        if (filled >= budget) break
        if (t.status !== 'in_progress' || !t.ownerId) continue
        const m = memberById(t.ownerId)
        if (!m || m.phase !== 'active' || busy.has(m.id)) continue
        const ok = await wakeWithInbox(m, normalPrompt(m), 'normal')
        if (ok) filled += 1
        else armHeartbeat()
      }
      // (b) urgent mail (anything addressed, or a due chat digest)
      const idle = activeMembers().filter((m) => !busy.has(m.id))
      for (const m of idle) {
        if (filled >= budget) break
        const d = deliveryDecision(m.id)
        if (!d.deliver || !d.urgent) continue
        const ok = await wakeWithInbox(m, normalPrompt(m), 'normal')
        if (ok) filled += 1
        else armHeartbeat()
      }
      if (filled >= budget) { armDigest(); return }
      // (c) due chat digest for otherwise-idle members
      const chatDue = idle.filter((m) => { const d = deliveryDecision(m.id); return d.deliver && !d.urgent })
      if (chatDue.length) {
        for (const m of chatDue) {
          if (filled >= budget) break
          const ok = await wakeWithInbox(m, normalPrompt(m), 'normal')
          if (ok) filled += 1
        }
        if (filled) return
        armDigest()
      }
      // (d) stalled institute -> convene a coordination meeting (the framework only
      // CONVENES; it never assigns). Guarded on busy.size===0 so an in-flight round is
      // never pre-empted.
      const stallMs = posMs(params.stallAutoMeetingMs, 360000)
      if (!meeting && !pendingMeeting && !hasVerifyInFlight() && phase === 'active' &&
        busy.size === 0 && (now() - lastProgressAt) >= stallMs) {
        await startMeeting('office', { agenda: '本所较长时间没有新进展。请你们自行讨论：现在最该推进的是什么？谁来做？是否需要发起验证？', kind: 'sync' })
        return
      }
      // (e) heartbeat: push the longest-idle member to make progress rather than just
      // asking "are we done" (v4's original heartbeat invited stagnation).
      const idleMs = posMs(params.activityTimeoutMs, 120000)
      if (busy.size < budget && idle.length) {
        const candidates = idle.slice().sort((a, b) => (lastActiveAt.get(a.id) || 0) - (lastActiveAt.get(b.id) || 0))
        const pick = candidates[0]
        if (pick && (now() - (lastActiveAt.get(pick.id) || 0)) >= idleMs) {
          const ok = await wakeWithInbox(pick, checkpointPrompt(pick), 'checkpoint')
          if (!ok) armHeartbeat()
          return
        }
      }
      armDigest()
      armHeartbeat()
    }

    // ---- reply parsing -----------------------------------------------------
    function tryJson(s) { try { return JSON.parse(s) } catch (e) { return undefined } }
    function parseReply(text) {
      let obj
      const fence = /```(?:json)?[ \t]*([\s\S]*?)```/gi
      let m
      while ((m = fence.exec(text)) !== null) {
        const o = tryJson(String(m[1]).trim())
        if (o && typeof o === 'object' && !Array.isArray(o)) obj = o
      }
      if (!obj) {
        const w = tryJson(String(text || '').trim())
        if (w && typeof w === 'object' && !Array.isArray(w)) obj = w
      }
      if (!obj) {
        // Last resort: the outermost {...} span (models sometimes wrap prose around it).
        const t = String(text || '')
        const i = t.indexOf('{'), j = t.lastIndexOf('}')
        if (i !== -1 && j > i) {
          const o = tryJson(t.slice(i, j + 1))
          if (o && typeof o === 'object' && !Array.isArray(o)) obj = o
        }
      }
      return obj || {}
    }
    function normVerdictNumber(v) {
      // verdict is a PURE 0-1 probability. Models often send a quoted number, and a
      // quoted "0.9" used to fall through to a 0.5 default and be silently recorded
      // as "unsure" (v4 §27). Legacy "TRUE"/"FALSE" strings map to 1/0.
      if (typeof v === 'string') {
        const s = v.trim().toUpperCase()
        if (s === 'TRUE') return 1
        if (s === 'FALSE') return 0
      }
      const n = Number(v)
      return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : undefined
    }

    // ---- reply dispatch ----------------------------------------------------
    // EVERY reply kind funnels through here, so no control channel can be honoured on
    // one path and silently dropped on another.
    async function handleReply(member, parsed, kind) {
      const p = parsed || {}
      postmark(member, p)
      // (1) speech
      const s = p.say
      if (typeof s === 'string' && s.trim()) await say(member.id, { to: 'all', text: s, kind: 'chat' })
      else if (s && typeof s === 'object' && s.text) {
        const to = String(s.to || 'all')
        await say(member.id, { to, text: String(s.text), kind: to === 'all' ? 'chat' : 'dm' })
      }
      // (2) progress log
      if (typeof p.progress === 'string' && p.progress.trim()) await publishProgress(member.id, p.progress)
      // (3) library records
      if (Array.isArray(p.record)) {
        for (const r of p.record) {
          if (!r || typeof r !== 'object') continue
          const k = String(r.kind || '')
          if (k !== 'proposition' && k !== 'method' && k !== 'subproblem') continue
          await recordCard(member.id, k, r)
        }
      }
      // (4) task board
      if (p.task_create && typeof p.task_create === 'object') await taskCreate(member.id, p.task_create)
      if (p.task_claim) {
        const t = inst().tasks.find((x) => x.id === String(p.task_claim))
        if (t) await taskUpdate(member.id, { task_id: t.id, expected_revision: t.revision, action: 'claim' })
        else await say(member.id, { to: member.id, kind: 'dm', text: '（框架）认领失败：没有任务 ' + String(p.task_claim) })
      }
      if (p.task_update && typeof p.task_update === 'object') await taskUpdate(member.id, p.task_update)
      if (p.task_done) {
        const t = inst().tasks.find((x) => x.id === String(p.task_done))
        if (t) await taskUpdate(member.id, { task_id: t.id, expected_revision: t.revision, action: 'complete' })
      }
      // (5) verification
      if (p.propose_verify) {
        const pv = typeof p.propose_verify === 'string' ? { target: p.propose_verify } : p.propose_verify
        if (pv && pv.target) await maybeQueueVerify(pv.target, pv.kind, member.id, pv.reason)
      }
      if (p.verdict && typeof p.verdict === 'object') {
        const n = normVerdictNumber(p.verdict.verdict)
        if (n === undefined) await say(member.id, { to: member.id, kind: 'dm', text: '（框架）verdict 必须是 0-1 的数值' })
        else await castVerdict(member.id, String(p.verdict.target || ''), n, p.verdict.reason)
      }
      // (6) meetings
      if (p.propose_meeting) {
        const pm = typeof p.propose_meeting === 'string' ? { agenda: p.propose_meeting } : p.propose_meeting
        if (pm && pm.agenda) await startMeeting(member.id, pm)
      }
      if (p.convene_meeting && typeof p.convene_meeting === 'object' && isAcademician(member.id) && params.academicianLeads) {
        await startMeeting(member.id, p.convene_meeting)
      }
      // (7) the academician's organizational powers
      if (p.assign && typeof p.assign === 'object') await taskAssign(member.id, p.assign)
      if (p.prioritize && typeof p.prioritize === 'object') await taskPrioritize(member.id, p.prioritize)
      if (p.nudge && typeof p.nudge === 'object') await nudge(member.id, p.nudge)
      // (8) staffing
      if (p.hire && typeof p.hire === 'object') await hire(member.id, p.hire)
      if (p.fire && typeof p.fire === 'object') await fire(member.id, p.fire)
      // (9) objecting to an assignment: recorded and BROADCAST, never silently swallowed
      if (p.reject_assign && typeof p.reject_assign === 'object' && params.memberMayRejectAssign) {
        const ra = p.reject_assign
        await say(member.id, {
          to: 'voters', kind: 'dm',
          text: '【反对分派】我对任务 ' + String(ra.task_id || '(未指明)') + ' 有异议：' + String(ra.why || '(未说明理由)') +
            '。任务仍会执行，但请院士与全所知悉我的理由。',
        })
      }
      // (10) solve votes / personal judgement
      if (p.vote_solved !== undefined) recordSolveVote(member.id, p.vote_solved === true)
      // (11) meeting input collection (keyed on the LIVE member set, so a member who
      // joined mid-meeting still has to speak and a dismissed one stops blocking it)
      if (kind === 'meeting' && meeting) {
        const text = (typeof p.input === 'string' && p.input.trim())
          ? p.input
          : (typeof p.say === 'string' && p.say.trim() ? p.say : (typeof p.summary === 'string' ? p.summary : ''))
        meeting.inputs[member.id] = text || '（无发言）'
        meeting.extras[member.id] = p
        meeting.lastInputAt = now()
        // APPEND to the transcript (never clobber it): the file is a human artifact and
        // must stay readable even if the process dies in the middle of a meeting.
        const rel = 'Shared/Meetings/' + meeting.id + '.md'
        const prev = (await readTextRel(rel)) || ('# 会议纪要｜' + meeting.id + '\n\n')
        await writeTextRel(rel, prev + '### ' + member.id + '\n' + (text || '（无发言）') + '\n\n')
      }
      if (p.solved !== undefined) {
        await writeTextRel('Shared/State-of-institute.md', [
          '# 研究所判断快照｜' + instituteName,
          '- 时间: ' + fmtTime(),
          '- 记录者: ' + member.id,
          '- 该成员认为原问题已解决: ' + (p.solved === true),
          '- 有表决权的解决票: ' + Array.from(solveVotes.entries()).map(([k, v]) => k + '=' + v).join('、'),
          '',
        ].join('\n'))
      }
    }
    // ---- one turn finished -------------------------------------------------
    // The end event is the ONLY driver of the institute's progression. It must be
    // idempotent: a replayed or late `subagent/end` used to run EVERY side effect
    // twice (v4 §28-T29), so a turn is only honoured while its in-flight token is
    // still registered.
    async function onMemberEnd(childId, info) {
      const token = inflight.get(childId)
      if (token === undefined) return
      inflight.delete(childId)
      const member = byChild(childId)
      if (!member) return
      busy.delete(member.id)
      const text = blocksToText(info && info.lastAssistantMessage)
      const stopReason = String((info && info.stopReason) || 'completed')
      if (stopReason !== 'completed') {
        await saveChatLine('【异常】' + member.id + ' 的一轮以 ' + stopReason + ' 结束' +
          (text ? '｜最后输出：' + String(text).slice(0, 300) : ''))
      }
      let parsed = {}
      try { parsed = parseReply(text) } catch (e) { parsed = {} }
      try {
        await handleReply(member, parsed, wakeKind.get(member.id) || 'normal')
      } catch (e) {
        console.error('vibe-math-v5: reply dispatch for ' + member.id + ': ' + String((e && e.stack) || e))
      }
      try { await maybeRealCompact(childId, member) } catch (e) { /* compaction is best-effort */ }
      wakeKind.delete(member.id)
      if (member.activeMeetingId) delete member.activeMeetingId
      await scheduleNext()
    }
    async function maybeRealCompact(childId, member) {
      const roundN = roundsSinceCompact.get(member.id) || 0
      const pct = contextPct.get(member.id) || 0
      const soft = pct >= Number(params.compactThreshold) || roundN >= Number(params.compactAfterRounds)
      if (!soft) return
      const comp = compactionOf()
      const agent = liveAgentOf(childId)
      if (comp && agent && agent.session && typeof comp.compactIfNeeded === 'function') {
        try {
          const r = await comp.compactIfNeeded(agent, 'pressure', makeSignal(params.activityTimeoutMs))
          if (r) { roundsSinceCompact.set(member.id, 0); needReanchor.add(member.id); return }
        } catch (e) { /* fall through to the soft path */ }
      }
      needReanchor.add(member.id)
    }
    function rememberAgent(childId, agent) {
      if (!childId || !agent) return
      try { liveAgents.set(childId, new WeakRef(agent)) } catch (e) { liveAgents.set(childId, { deref: () => agent }) }
    }
    function forgetAgent(childId) { liveAgents.delete(childId) }
    function liveAgentOf(childId) {
      const ref = liveAgents.get(childId)
      if (!ref) return undefined
      try { return ref.deref() } catch (e) { return undefined }
    }

    // ---- control plane -----------------------------------------------------
    function normalizeParams(input) {
      const out = {}
      const ints = ['researcherCount', 'quorumCap', 'verdictMaxRounds', 'maxTempPerMember', 'maxTempTotal',
        'compactThreshold', 'compactAfterRounds', 'maxParallel', 'activityTimeoutMs', 'stallAutoMeetingMs',
        'chatDigestMs', 'chatDigestMax', 'meetingKeepEvery']
      const bools = ['academician', 'academicianLeads', 'memberMayRejectAssign']
      const strs = ['quorumMode', 'provider', 'model', 'staffPersona']
      const arrs = ['toolAllow', 'toolDeny', 'tempToolAllow', 'tempToolDeny']
      for (const k of ints) if (input[k] !== undefined) { const n = Math.floor(Number(input[k])); if (Number.isFinite(n)) out[k] = n }
      for (const k of bools) if (input[k] !== undefined) out[k] = (input[k] === true || input[k] === 'true')
      for (const k of strs) if (input[k] !== undefined) out[k] = String(input[k])
      for (const k of arrs) {
        if (input[k] === undefined) continue
        const v = input[k]
        out[k] = Array.isArray(v) ? v.map(String).filter((x) => x.trim()) : String(v).split(',').map((x) => x.trim()).filter(Boolean)
      }
      if (out.quorumMode !== undefined && out.quorumMode !== 'm-unanimous' && out.quorumMode !== 'all-unanimous') out.quorumMode = 'm-unanimous'
      // Guard every duration against a negative/NaN value: such a value would make a
      // watchdog fire instantly and abandon all consensus (v4 §30-T41).
      for (const k of ['activityTimeoutMs', 'stallAutoMeetingMs', 'chatDigestMs']) {
        if (out[k] !== undefined && !(out[k] > 0)) delete out[k]
      }
      if (out.researcherCount !== undefined && out.researcherCount < 0) out.researcherCount = 0
      if (out.quorumCap !== undefined && out.quorumCap < 1) out.quorumCap = 1
      return out
    }
    async function setParams(input) {
      const patch = normalizeParams(input || {})
      const merged = Object.assign({}, params, patch)
      await patchInstitute({ params: merged })
      params = Object.assign({}, DEFAULT_PARAMS, merged)
      return { ok: true, params: visibleParams() }
    }
    function visibleParams() {
      return {
        academician: params.academician, academicianLeads: params.academicianLeads,
        memberMayRejectAssign: params.memberMayRejectAssign,
        researcherCount: params.researcherCount,
        quorumCap: params.quorumCap, quorumMode: params.quorumMode,
        m: quorumM(), voterCount: voterCount(),
        verdictMaxRounds: params.verdictMaxRounds,
        maxTempPerMember: params.maxTempPerMember, maxTempTotal: params.maxTempTotal,
        compactThreshold: params.compactThreshold, compactAfterRounds: params.compactAfterRounds,
        maxParallel: params.maxParallel, activityTimeoutMs: params.activityTimeoutMs,
        stallAutoMeetingMs: params.stallAutoMeetingMs, chatDigestMs: params.chatDigestMs,
        chatDigestMax: params.chatDigestMax, meetingKeepEvery: params.meetingKeepEvery,
        provider: params.provider, model: params.model,
        toolAllow: params.toolAllow, toolDeny: params.toolDeny,
      }
    }
    async function configure(args) {
      const a = args || {}
      // configure is the PRE-START setup tool. Switching project/institute while a run
      // is live would split its state across two trees: the members' libraries and
      // briefs point at the OLD root while every later write goes to the NEW one.
      if (running && !autoDone) {
        return { ok: false, code: 'V5_INSTITUTE_STATE', message: 'cannot reconfigure while the institute is running (pause/stop first; use vibe_v5_set to tune params)' }
      }
      const patch = {}
      if (a.project !== undefined && String(a.project).trim()) patch.project = String(a.project).trim()
      if (a.institute !== undefined && String(a.institute).trim()) patch.institute = String(a.institute).trim()
      if (a.problem !== undefined) patch.problem = { id: slugify(String(a.problem).slice(0, 40)) || 'problem', statement: String(a.problem) }
      if (a.params && typeof a.params === 'object') patch.params = Object.assign({}, params, normalizeParams(a.params))
      if (patch.project !== undefined || patch.institute !== undefined) {
        const np = patch.project !== undefined ? patch.project : project
        const ni = patch.institute !== undefined ? patch.institute : instituteName
        const nkey = np + '::' + ni
        if (nkey !== key && !inst().members.length) {
          key = nkey
          project = np
          instituteName = ni
          patch.project = np
          patch.institute = ni
        } else if (nkey !== key) {
          return { ok: false, code: 'V5_INSTITUTE_STATE', message: 'this session already holds an institute; use a new session to found another' }
        }
      }
      patch.phase = 'idle'
      await patchInstitute(patch)
      syncParamsFromState()
      await mkdirs()
      if (inst().problem.statement) {
        await writeTextRel('Problems/' + (inst().problem.id || 'problem') + '.md', [
          '# 问题｜' + (inst().problem.id || 'problem'),
          '- ID: ' + (inst().problem.id || 'problem'),
          '- 类型: 问题',
          '- 状态: 求解中',
          '- 时间: ' + fmtTime(),
          '',
          '## 陈述',
          inst().problem.statement,
          '',
        ].join('\n'))
      }
      await writeTextRel('State/README.md', [
        '# 关于 State/',
        '',
        '本研究所的**权威状态在会话日志投影里**（投影键 `vibeMathV5`），不是这里的文件。',
        '本目录只存放人可读的镜像/说明，**请勿手改**；改动不会影响真正的状态。',
        '要查看状态请用 `vibe_v5_status` / `vibe_v5_report`。',
        '',
      ].join('\n'))
      return {
        ok: true, project, institute: instituteName,
        problem: inst().problem.statement ? inst().problem.statement.slice(0, 80) : '',
        params: visibleParams(),
        note: '现在可以 vibe_v5_start 开工',
      }
    }
    function slugify(s) {
      const t = String(s == null ? '' : s).trim().toLowerCase().replace(/[^a-z0-9_\-\u4e00-\u9fa5]+/g, '-').replace(/^-+|-+$/g, '')
      return t || ''
    }
    async function doStart(args) {
      const a = args || {}
      if (running && !autoDone) return { ok: false, code: 'V5_INSTITUTE_STATE', message: 'already running' }
      if (autoDone) return { ok: false, code: 'V5_INSTITUTE_STATE', message: 'this institute already concluded; configure a new one in a new session' }
      const patch = {}
      if (a.problem !== undefined && String(a.problem).trim()) patch.problem = { id: slugify(String(a.problem).slice(0, 40)) || 'problem', statement: String(a.problem) }
      const p = Object.assign({}, params, normalizeParams(a.params || {}))
      if (a.researcherCount !== undefined) p.researcherCount = Math.max(0, Math.floor(Number(a.researcherCount)) || 0)
      if (a.academician !== undefined) p.academician = a.academician === true || a.academician === 'true'
      // A misconfigured 0/negative count used to start a run that spawned nobody yet
      // reported running=true (v4 §30).
      if (!(p.researcherCount >= 0)) p.researcherCount = DEFAULT_PARAMS.researcherCount
      if (p.academician === false && p.researcherCount < 1) p.researcherCount = 1
      patch.params = p
      patch.phase = 'founding'
      patch.runId = 'run-' + shortId()
      await patchInstitute(patch)
      syncParamsFromState()
      runId = inst().runId
      await mkdirs()
      if (inst().problem.statement) {
        await writeTextRel('Problems/' + (inst().problem.id || 'problem') + '.md', [
          '# 问题｜' + (inst().problem.id || 'problem'), '- ID: ' + (inst().problem.id || 'problem'),
          '- 类型: 问题', '- 状态: 求解中', '- 时间: ' + fmtTime(), '', '## 陈述', inst().problem.statement, '',
        ].join('\n'))
      }
      const seeds = Array.isArray(a.seedDirections) ? a.seedDirections.map(String) : []
      const DEFAULT_DIRS = [
        '从最基础的定义与已知结论出发，寻找可用的经典工具与已有定理。',
        '尝试构造反例或极端情形，界定命题的适用范围与边界。',
        '把它归约到一个更小、更本质的核心里程，先攻这个核心。',
        '寻找与其它领域的类比，把问题嵌入一个更一般的结构里。',
        '从已知的相近结论出发，看能否推广或加强得到所需结果。',
      ]
      const spawned = []
      // The academician is founded FIRST so that its charter/roster is accurate and so
      // it can begin overseeing the founding round.
      if (params.academician) {
        const m = await newMember('academician', { direction: '统领全所：统筹全局、拆解并分派工作、设定优先级、督导进度。' })
        try {
          await spawnMember(m, '你是本所的院士。请先独立研判这个问题：它的关键困难在哪？应当拆成哪几块工作？'
            + '你打算如何组织全所（谁适合做什么、先做什么）？把你的判断写进你的 Progress/，并把关键结论在群聊里说出来。')
          spawned.push(m.id)
        } catch (e) {
          await putMember(Object.assign({}, memberById(m.id) || m, { phase: 'failed', error: String((e && e.message) || e) }))
        }
      }
      for (let i = 0; i < params.researcherCount; i++) {
        const dir = seeds[i] || DEFAULT_DIRS[i % DEFAULT_DIRS.length]
        const m = await newMember('researcher', { direction: dir })
        try {
          await spawnMember(m, null)
          spawned.push(m.id)
        } catch (e) {
          await putMember(Object.assign({}, memberById(m.id) || m, { phase: 'failed', error: String((e && e.message) || e) }))
        }
      }
      if (!spawned.length) {
        await patchInstitute({ phase: 'idle' })
        return { ok: false, code: 'V5_PROVISIONING_CONFLICT', message: '没有任何成员创建成功；请检查 subagents 提供者与会话持久化是否可用' }
      }
      running = true
      autoDone = false
      phase = 'active'
      await patchInstitute({ phase: 'active', lastProgressAt: now() })
      await saveChatLine('【建所】' + instituteName + ' 成立。院士/研究员到岗：' + spawned.join('、') +
        '。研究对象已写入 Problems/。全体先各自独立研判，然后自行组织推进。')
      await markProgress()
      notifyActivity()
      await scheduleNext()
      return { ok: true, institute: instituteName, project, members: spawned, running: true, quorumM: quorumM(), voters: voterCount() }
    }
    // Reconcile durable `provisioning` members against their independently persisted
    // child sessions (ported from DSH agent-teams). Anything that cannot be proven live
    // becomes `failed` rather than being silently resurrected or silently dropped.
    async function reconcileProvisioning() {
      for (const m of inst().members.slice()) {
        if (m.phase !== 'provisioning') continue
        let live = false
        if (m.childId) { try { live = !!(agents.get(m.childId)) } catch (e) { live = false } }
        if (live) { await putMember(Object.assign({}, m, { phase: 'active' })); continue }
        await putMember(Object.assign({}, m, {
          phase: 'failed', childId: '',
          error: (m.error || '') + '｜重启对账：找不到该成员的常驻会话，标记为 failed',
        }))
      }
      for (const m of inst().members.slice()) {
        if (m.phase !== 'active' || !m.childId) continue
        let live = false
        try { live = !!(agents.get(m.childId)) } catch (e) { live = false }
        if (!live) await putMember(Object.assign({}, m, { childId: '' }))
      }
    }
    async function resume() {
      await reconcileProvisioning()
      syncParamsFromState()
      if (autoDone) return { ok: false, code: 'V5_INSTITUTE_STATE', message: 'this institute already concluded; configure a new one in a new session' }
      const members = activeMembers()
      if (!members.length) return { ok: false, code: 'V5_INSTITUTE_STATE', message: 'no active member to resume' }
      let respawned = 0
      for (const m of members) {
        if (m.childId) continue
        try {
          const seedText = (await readTextRel('Members/' + m.id + '/Progress/progress.md')) || ''
          await spawnMember(m, '你的会话已重建。请先读回你自己的 Progress/ 摘要（如下），恢复工作状态，然后继续推进：\n\n'
            + (seedText ? seedText.slice(-4000) : '（你的 Progress/ 还是空的——请先把当前状态补写进去。）'))
          respawned += 1
        } catch (e) {
          await putMember(Object.assign({}, m, { phase: 'failed', error: String((e && e.message) || e) }))
        }
      }
      // A meeting/verify that was in flight when the process died has a stale watchdog
      // clock, so refresh it instead of letting the first pass abandon it (v4 §27-T28).
      if (meeting) meeting.lastInputAt = now()
      const cv = currentVerify()
      if (cv) await putVerdict(cv.target, Object.assign({}, cv, { lastVoteAt: now() }))
      running = true
      autoDone = false
      phase = 'active'
      await patchInstitute({ phase: 'active', lastProgressAt: now() })
      await saveChatLine('【恢复】研究所继续推进（重建成员 ' + respawned + ' 名）。')
      notifyActivity()
      await scheduleNext()
      return { ok: true, resumed: true, members: members.map((m) => m.id), respawned, running: true }
    }
    function setPause() {
      clearHeartbeat()
      running = false
      return { ok: true, paused: true, message: '已暂停调度；成员的在途回合结束后不会被再次唤醒。用 vibe_v5_resume 继续。' }
    }
    async function initStop() {
      clearHeartbeat()
      running = false
      autoDone = false
      for (const m of activeMembers()) {
        if (m.childId) {
          try { if (typeof subagents.interrupt === 'function') subagents.interrupt(m.childId, { kind: 'ancestor', agent: rootAgent }) } catch (e) { /* ignore */ }
          childOwner.delete(m.childId)
          inflight.delete(m.childId)
        }
        await putMember(Object.assign({}, m, { childId: '' }))
      }
      // Wipe coordination state so status is truthful between stop and the next action:
      // the interrupted members' childIds are gone, so no end event can ever clear those
      // marks and they would otherwise report a phantom in-flight meeting/verify forever
      // (v4 §30-T38).
      meeting = null
      pendingMeeting = null
      solveVotes.clear()
      busy.clear()
      wakeKind.clear()
      currentMember = ''
      finalizeLock = null
      for (const cv of Object.values(inst().verdicts)) {
        if (cv && !cv.closed) await putVerdict(cv.target, Object.assign({}, cv, { closed: true, outcome: 'undecided', reason: 'stopped by the office', closedAt: now() }))
      }
      await patchInstitute({ phase: 'idle' })
      return { ok: true, stopped: true }
    }
    function status() {
      syncParamsFromState()
      const s = inst()
      const cv = currentVerify()
      return {
        ok: true,
        institute: instituteName, project, key, phase,
        running, autoDone, runId: s.runId,
        backend: backend ? backend.kind : 'uninitialized',
        quorum: { m: quorumM(), mode: params.quorumMode, voters: voters().map((m) => m.id), voterCount: voterCount() },
        members: s.members.map((m) => ({
          id: m.id, kind: m.kind, phase: m.phase, direction: m.direction, hiredBy: m.hiredBy,
          rounds: rounds.get(m.id) || 0, busy: busy.has(m.id), contextPct: contextPct.get(m.id) || 0,
          childId: m.childId ? m.childId.slice(0, 12) : '', error: m.error || '',
        })),
        tasks: listTasks(),
        chat: { pending: s.messages.length, delivered: s.delivered.length },
        meeting: meeting ? { id: meeting.id, agenda: meeting.agenda, kind: meeting.kind, spoke: Object.keys(meeting.inputs), order: meeting.order } : null,
        parkedMeeting: pendingMeeting ? { agenda: pendingMeeting.agenda, kind: pendingMeeting.kind } : null,
        verify: cv ? { target: cv.target, kind: cv.kind, stage: cv.stage, round: cv.round, voted: Object.keys(cv.votes), m: quorumM(), P: voterCount() } : null,
        verifyQueue: s.queue.map((q) => q.target),
        verified: Object.keys(s.verdicts).filter((k) => s.verdicts[k] && s.verdicts[k].closed && s.verdicts[k].outcome !== 'undecided'),
        undecided: Object.keys(s.verdicts).filter((k) => { const v = s.verdicts[k]; return v && v.closed && v.outcome === 'undecided' }),
        solveVotes: Array.from(solveVotes.entries()).map(([k, v]) => k + '=' + v),
        lastProgressAt, params: visibleParams(),
      }
    }
    function report() {
      syncParamsFromState()
      const s = inst()
      const L = []
      L.push('# 「' + instituteName + '」研究所汇报')
      L.push('')
      L.push('- 项目：' + project + '｜阶段：' + phase + '｜运行中：' + running + '｜已结题：' + autoDone)
      L.push('- 研究对象：' + (s.problem.statement ? s.problem.statement.slice(0, 200) : '（未设定）'))
      L.push('- 求真门槛：m = ' + quorumM() + '（模式 ' + params.quorumMode + '）｜有表决权者 ' + voterCount() + ' 人')
      L.push('')
      L.push('## 编制')
      if (!s.members.length) L.push('（暂无成员）')
      for (const m of s.members) {
        L.push('- ' + m.id + '｜' + kindLabel(m.kind) + '｜' + m.phase +
          (m.hiredBy ? '｜雇主 ' + m.hiredBy : '') +
          (m.direction ? '｜方向：' + m.direction : '') +
          '｜轮次 ' + (rounds.get(m.id) || 0) +
          (m.error ? '｜⚠ ' + m.error : ''))
      }
      L.push('')
      L.push('## 任务板')
      const ts = listTasks()
      if (!ts.length) L.push('（暂无任务）')
      for (const t of ts) {
        L.push('- [' + t.status + '] ' + t.id + '｜' + t.subject + '｜owner=' + (t.ownerName || '(未认领)') +
          (t.assignedBy ? '｜院士分派' : '') + (t.ready ? '｜可认领' : ''))
      }
      L.push('')
      L.push('## 共识')
      const closed = Object.keys(s.verdicts).filter((k) => s.verdicts[k] && s.verdicts[k].closed)
      if (!closed.length) L.push('（尚未对任何对象定论）')
      for (const k of closed) {
        const v = s.verdicts[k]
        L.push('- ' + k + '｜' + (v.outcome === 'true' ? '**真**' : v.outcome === 'false' ? '**假**' : '未定论') +
          '（m=' + v.m + '｜真' + (v.bTrue || 0) + '/假' + (v.bFalse || 0) + '/弃权' + (v.abstain || 0) +
          '｜平均概率 ' + Number(v.mean || 0).toFixed(2) + '｜' + (v.reason || '') + '）')
      }
      const cv = currentVerify()
      if (cv) L.push('- 进行中：' + cv.target + '｜' + cv.stage + ' 第 ' + cv.round + ' 轮｜已投 ' + Object.keys(cv.votes).join('、'))
      if (s.queue.length) L.push('- 队列：' + s.queue.map((q) => q.target).join('、'))
      L.push('')
      L.push('## 群聊 / 会议')
      L.push('- 未读消息：' + s.messages.length + '｜已投递：' + s.delivered.length)
      if (meeting) L.push('- 进行中会议：' + meeting.id + '｜' + meeting.agenda + '｜已发言 ' + Object.keys(meeting.inputs).join('、'))
      if (pendingMeeting) L.push('- 暂存会议：' + pendingMeeting.agenda)
      L.push('- 历史会议：' + s.meetings.length + ' 次｜辩论录：' + s.debates.length + ' 份')
      L.push('- 解决票：' + (solveVotes.size ? Array.from(solveVotes.entries()).map(([k, v]) => k + '=' + v).join('、') : '（无）'))
      L.push('')
      L.push('## 文件位置')
      L.push('- 根目录：' + instRoot())
      L.push('- 已确立：Verified/｜成员库：Members/<id>/｜群聊：Shared/Chat/｜会议：Shared/Meetings/｜辩论：Shared/Debates/')
      return { ok: true, report: L.join('\n') }
    }
    // Adding/removing a PERMANENT researcher is a change to the institute's public
    // structure, so members may only propose it; the office decides and executes.
    async function addResearcher(callerId, direction) {
      if (!isOffice(callerId)) {
        await say(callerId, { to: 'voters', kind: 'dm', text: '提议增聘一名常驻研究员（方向：' + String(direction || '未指定') + '）' })
        return { ok: true, proposed: true, message: '已向所办提议增聘常驻研究员（编制变更需所办批准）' }
      }
      if (!running || autoDone) return { ok: false, code: 'V5_INSTITUTE_STATE', message: 'the institute is not running' }
      const m = await newMember('researcher', { direction: String(direction || '') })
      try {
        await spawnMember(m, null)
      } catch (e) {
        await putMember(Object.assign({}, memberById(m.id) || m, { phase: 'failed', error: String((e && e.message) || e) }))
        return { ok: false, code: 'V5_PROVISIONING_CONFLICT', message: String((e && e.message) || e) }
      }
      await saveChatLine('【编制】所办增聘常驻研究员 ' + m.id + (direction ? '（方向：' + direction + '）' : '') +
        '。求真门槛 m 现为 ' + quorumM() + '。')
      await scheduleNext()
      return { ok: true, id: m.id, kind: 'researcher', quorumM: quorumM() }
    }
    async function removeResearcher(id) {
      const m = memberById(String(id))
      if (!m) return { ok: false, code: 'V5_MEMBER_NOT_FOUND', message: 'no such member' }
      if (m.kind !== 'researcher') return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'use vibe_v5_fire for temp workers; this tool removes a PERMANENT researcher' }
      const r = await fire('office', { id: m.id, reason: 'office decision' })
      return r
    }

    return {
      sessionId,
      key: () => key,
      institute: () => instituteName,
      project: () => project,
      params: () => Object.assign({}, params),
      visibleParams,
      phase: () => phase,
      running: () => running,
      autoDone: () => autoDone,
      state,
      inst,
      // lifecycle
      onMemberEnd, rememberAgent, forgetAgent,
      configure, doStart, resume, setPause, initStop, status, report, setParams,
      reconcileProvisioning,
      kick: () => scheduleNext().catch(() => {}),
      // communication
      say, waitForActivity, wakeIfIdle,
      // staffing
      hire, fire, addResearcher, removeResearcher, nudge,
      // tasks
      taskCreate, taskList: listTasks, getTask, taskUpdate, taskAssign, taskPrioritize,
      // libraries
      publishProgress, recordCard, readLibrary,
      // consensus / meetings
      maybeQueueVerify, castVerdict, currentVerify, hasVerifyInFlight, startMeeting, quorumM, voterCount,
      // authorization helpers (used by tool handlers)
      memberIdOfAgent, isOffice, isAcademician, memberById, activeMembers,
    }
  }

  // ================= apply-level registration (ONCE) =================
  function objParams(props, required) { return { type: 'object', properties: props, additionalProperties: false, required: required || [] } }
  // tools.register()/commands.register() return a Cordis effect disposer. Keeping the
  // registration inside ctx.effect() is what unwinds it when the preset subtree
  // unloads: v2/v3 did this, v4 once dropped the disposer so a second mount collided
  // on the already-registered names and the entries survived an unload.
  function registerTool(name, description, parameters, fn) {
    ctx.effect(() => tools.register({
      name, description, parameters,
      output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: String(v) }] },
      execute: async (args, exec) => {
        try {
          const s = getSession(exec && exec.agent)
          if (!s) return JSON.stringify({ ok: false, error: 'no session' })
          return JSON.stringify(await fn(s, args || {}, exec && exec.agent))
        } catch (e) {
          return JSON.stringify({ ok: false, error: String((e && e.message) || e) })
        }
      },
    }))
  }
  const S = { type: 'string' }, N = { type: 'number' }, I = { type: 'integer' }, B = { type: 'boolean' }
  const SA = { type: 'array', items: { type: 'string' } }

  // ── office / host controls ────────────────────────────────────────────────
  registerTool('vibe_v5_configure', 'Create/configure the research institute (project, institute name, problem, params) WITHOUT starting it. Use this FIRST, then vibe_v5_start.', objParams({ project: S, institute: S, problem: S, params: { type: 'object' } }), (s, a) => s.configure(a))
  registerTool('vibe_v5_start', 'Found the institute: create the academician + N permanent researchers and begin. They brainstorm independently, then self-organize (the academician organizes and assigns; the framework only facilitates).', objParams({ problem: S, researcherCount: I, academician: B, params: { type: 'object' }, seedDirections: SA }), (s, a) => s.doStart(a))
  registerTool('vibe_v5_resume', 'Resume a persisted institute: reconcile members against their durable sessions, rebuild any missing one from its Progress/, refresh consensus watchdogs, and restart scheduling.', objParams({}), (s) => s.resume())
  registerTool('vibe_v5_pause', 'Pause the institute (in-flight turns finish; no new wakes until resume).', objParams({}), (s) => s.setPause())
  registerTool('vibe_v5_stop', 'Stop the institute: interrupt every member, clear coordination state, and release their child sessions.', objParams({}), (s) => s.initStop())
  registerTool('vibe_v5_status', 'Machine-readable institute status (members, tasks, quorum, meetings, verification, mail).', objParams({}), (s) => s.status())
  registerTool('vibe_v5_report', 'Human-readable institute report (staffing, tasks, consensus, meetings, file locations).', objParams({}), (s) => s.report())
  registerTool('vibe_v5_set', 'Tune institute parameters (persisted in the session-log projection). provider/model override staff LLM routes (empty = inherit the office route). toolAllow/toolDeny restrict PERMANENT staff tools; tempToolAllow/tempToolDeny restrict temp workers. quorumCap sets m = min(quorumCap, voters); quorumMode "m-unanimous" (v5) or "all-unanimous" (v4 legacy).', objParams({
    academician: B, academicianLeads: B, memberMayRejectAssign: B, researcherCount: I,
    quorumCap: I, quorumMode: S, verdictMaxRounds: I,
    maxTempPerMember: I, maxTempTotal: I,
    compactThreshold: I, compactAfterRounds: I, maxParallel: I,
    activityTimeoutMs: I, stallAutoMeetingMs: I, chatDigestMs: I, chatDigestMax: I, meetingKeepEvery: I,
    provider: S, model: S, staffPersona: S, toolAllow: SA, toolDeny: SA, tempToolAllow: SA, tempToolDeny: SA,
  }), (s, a) => s.setParams(a))
  registerTool('vibe_v5_message', 'Relay a message from the office/human into the institute (to a member id, to "all", or to "voters").', objParams({ to: S, content: S }, ['to', 'content']), (s, a) => {
    const to = String(a.to || 'all')
    return s.say('office', { to, text: String(a.content), kind: to === 'all' || to === 'voters' ? 'office' : 'dm' })
  })
  registerTool('vibe_v5_meeting', 'Convene a meeting (office/academician) or propose one (any other member — relayed to the academician/office). Parked automatically while a verification is in flight.', objParams({ agenda: S, kind: { type: 'string', enum: ['sync', 'division', 'verify-request', 'solve-vote'] }, target: S }, ['agenda']), (s, a, x) => s.startMeeting(s.memberIdOfAgent(x) || 'office', a))
  registerTool('vibe_v5_members', 'List the institute roster (office, employer, phase, direction, rounds).', objParams({}), (s) => ({ ok: true, members: s.status().members, quorum: s.status().quorum }))
  registerTool('vibe_v5_hire', 'Hire one temp worker (office; the academician and every permanent researcher may also hire their own). Requires purpose and initial_task.', objParams({ purpose: S, initial_task: S, direction: S, term: S, to: S }, ['purpose', 'initial_task']), (s, a, x) => {
    const caller = a.to ? String(a.to) : (s.isOffice(s.memberIdOfAgent(x)) ? 'office' : s.memberIdOfAgent(x))
    return s.hire(caller, a)
  })
  registerTool('vibe_v5_fire', 'Dismiss a temp worker for real: cancel its turn, release its resident child, reclaim its tasks, drop its mail, and mark it dismissed (its id is never reused).', objParams({ id: S, reason: S }, ['id']), (s, a, x) => s.fire(s.memberIdOfAgent(x) || 'office', a))
  registerTool('vibe_v5_add_researcher', 'Office only: hire another PERMANENT researcher (members may only propose this).', objParams({ direction: S }), (s, a, x) => s.addResearcher(s.memberIdOfAgent(x) || 'office', a && a.direction))
  registerTool('vibe_v5_remove_researcher', 'Office only: dismiss a PERMANENT researcher.', objParams({ id: S }, ['id']), (s, a) => s.removeResearcher(a.id))

  // ── member-facing controls ────────────────────────────────────────────────
  registerTool('vibe_v5_say', '(member) Speak in the group chat (omit "to"), send a private message ("to":"r-2"), or address only the voters ("to":"voters").', objParams({ text: S, to: S }, ['text']), (s, a, x) => {
    const from = s.memberIdOfAgent(x)
    if (!from) return { ok: false, code: 'V5_MEMBER_NOT_FOUND', message: 'no calling member' }
    return s.say(from, { to: a.to || 'all', text: a.text, kind: a.to ? 'dm' : 'chat' })
  })
  registerTool('vibe_v5_wait', '(member) Wait for the next institute change (roster/task/mail/status) WITHOUT polling. Returns immediately with noProgress when nobody else is running or provisioning. timeout_ms: 10000-3600000 (default 30000).', objParams({ timeout_ms: I, reason: S }), async (s, a, x) => {
    const me = s.memberIdOfAgent(x)
    const others = s.activeMembers().filter((m) => m.id !== me)
    const ms = a.timeout_ms === undefined ? 30000 : Number(a.timeout_ms)
    if (others.length === 0) {
      return { ok: true, timedOut: false, noProgress: { reason: 'no-active-peer', message: '没有其他在册成员可以等待；请先用 vibe_v5_say / vibe_v5_hire / vibe_v5_task_create 让事情发生。' } }
    }
    const r = await s.waitForActivity(ms, x && x.signal)
    return { ok: true, timedOut: r.timedOut, note: '醒来后请重新读取状态（vibe_v5_task_list / 状态块），本工具只报告是否超时。' }
  })
  registerTool('vibe_v5_record_progress', '(member) Append to YOUR progress.md — your research log. Include what you tried, the routes and their obstacles, your current state, your plans, and failed/dead ends (they save the institute from repeating them).', objParams({ content: S }, ['content']), (s, a, x) => s.publishProgress(s.memberIdOfAgent(x), a.content))
  registerTool('vibe_v5_record_proposition', '(member) Record a proposition/lemma in your library. REQUIRES value (价值程度), motive (动机用途计划) and p (your probability that it is true).', objParams({ id: S, title: S, statement: S, value: N, motive: S, p: N }, ['statement', 'value', 'motive', 'p']), (s, a, x) => s.recordCard(s.memberIdOfAgent(x), 'proposition', a))
  registerTool('vibe_v5_record_method', '(member) Record a theory/method/tool in your library. REQUIRES value, motive and p.', objParams({ id: S, title: S, type: S, content: S, notation: S, value: N, motive: S, p: N }, ['content', 'value', 'motive', 'p']), (s, a, x) => s.recordCard(s.memberIdOfAgent(x), 'method', a))
  registerTool('vibe_v5_record_subproblem', '(member) Record a sub-problem in your library. REQUIRES value, motive and p.', objParams({ id: S, title: S, statement: S, value: N, motive: S, p: N }, ['statement', 'value', 'motive', 'p']), (s, a, x) => s.recordCard(s.memberIdOfAgent(x), 'subproblem', a))
  registerTool('vibe_v5_read_library', '(member) Read anyone\'s library (read-only): their progress and recorded cards. Omit member to read everyone.', objParams({ member: S, kind: S, id: S }), (s, a) => s.readLibrary(a))
  registerTool('vibe_v5_propose_verify', '(member) Propose an object for consensus verification. Any member may propose; only voting members decide.', objParams({ target: S, kind: S, reason: S }, ['target']), (s, a, x) => s.maybeQueueVerify(a.target, a.kind, s.memberIdOfAgent(x), a.reason))
  registerTool('vibe_v5_verdict', '(member) Cast your boolean verdict on the object under verification. verdict is [0,1]: exactly 1 = assert true, exactly 0 = assert false, anything in between = abstention (not counted toward m, counted in the mean).', objParams({ target: S, verdict: N, reason: S }, ['verdict']), (s, a, x) => s.castVerdict(s.memberIdOfAgent(x), a.target, a.verdict, a.reason))
  registerTool('vibe_v5_task_create', '(member) Open a task on the shared board (subject, description, optional blockers, advisory write scopes, priority).', objParams({ subject: S, description: S, blocked_by: SA, write_scopes: SA, priority: I }, ['subject']), (s, a, x) => s.taskCreate(s.memberIdOfAgent(x), a))
  registerTool('vibe_v5_task_list', '(member) List shared tasks with readiness, owner, revision, blockers and write-scope warnings.', objParams({ status: S, owner: S, ready: B }), (s, a) => ({ ok: true, tasks: s.taskList(a) }))
  registerTool('vibe_v5_task_get', '(member) Read one task\'s latest value BEFORE changing it (the revision is the CAS precondition).', objParams({ task_id: S }, ['task_id']), (s, a) => ({ ok: true, task: s.getTask(a.task_id) }))
  registerTool('vibe_v5_task_update', '(member) Compare-and-set a task action: claim|release|edit|set_dependencies|complete|reopen|reassign|delete. Pass expected_revision from task_get/task_list; a stale revision is refused.', objParams({ task_id: S, expected_revision: I, action: S, subject: S, description: S, blocked_by: SA, write_scopes: SA, owner: S }, ['task_id', 'expected_revision', 'action']), (s, a, x) => s.taskUpdate(s.memberIdOfAgent(x), a))

  // ── the academician's organizational tools ────────────────────────────────
  registerTool('vibe_v5_overview', '(academician) Institute-wide view: roster, task board, every member\'s Progress tail, recent chat, and stall warnings. Use it instead of guessing.', objParams({}), async (s) => {
    const parts = []
    const st = s.status()
    parts.push('## 编制'); for (const m of st.members) parts.push('- ' + m.id + '｜' + m.kind + '｜' + m.phase + '｜轮次 ' + m.rounds + (m.direction ? '｜' + m.direction : ''))
    parts.push(''); parts.push('## 任务板')
    for (const t of st.tasks) parts.push('- [' + t.status + '] ' + t.id + '｜' + t.subject + '｜owner=' + (t.ownerName || '(未认领)') + '｜rev=' + t.revision + '｜优先级=' + t.priority)
    if (!st.tasks.length) parts.push('（暂无任务）')
    parts.push(''); parts.push('## 各成员 Progress 摘要')
    for (const m of st.members) {
      const p = await s.readLibrary({ member: m.id })
      const prog = (p.items || []).filter((i) => i.kind === 'progress').map((i) => i.text).join('')
      parts.push('### ' + m.id)
      parts.push(prog ? String(prog).slice(-1200) : '（尚未写 Progress/）')
      parts.push('')
    }
    parts.push('## 最近群聊')
    parts.push('（见 Shared/Chat/ 目录；未读消息 ' + st.chat.pending + ' 条）')
    if (st.verify) parts.push('## 进行中表决\n' + JSON.stringify(st.verify))
    if (st.meeting) parts.push('## 进行中会议\n' + JSON.stringify(st.meeting))
    parts.push('## 停滞提示')
    const idleFor = Date.now() - st.lastProgressAt
    parts.push('- 距上次实质进展：' + Math.round(idleFor / 1000) + ' 秒')
    return { ok: true, overview: parts.join('\n') }
  })
  registerTool('vibe_v5_assign', '(academician) ASSIGN work: create or pick a task and give it to a specific member (including temp workers), stating WHY and the acceptance criteria. The assignee executes by default and may object with reasons (which are broadcast).', objParams({ task_id: S, subject: S, description: S, to: S, why: S, acceptance: S, priority: I, write_scopes: SA }, ['to', 'why', 'acceptance']), (s, a, x) => s.taskAssign(s.memberIdOfAgent(x), a))
  registerTool('vibe_v5_prioritize', '(academician) Set institute-wide priorities: an ordered list of {task_id, priority} plus WHY. This orders work only — it never changes what is true.', objParams({ order: { type: 'array', items: { type: 'object' } }, why: S }), (s, a, x) => s.taskPrioritize(s.memberIdOfAgent(x), a))
  registerTool('vibe_v5_nudge', '(academician) Supervise: wake one member with a stated reason and a concrete suggested next step. Prefer a specific next step over a bare "hurry up".', objParams({ to: S, why: S, next_step: S }, ['to', 'why']), (s, a, x) => s.nudge(s.memberIdOfAgent(x), a))

  // ── /v5 slash command ────────────────────────────────────────────────────
  ctx.effect(() => commands.register({
    name: 'v5', description: 'control the Vibe Math V5 research institute',
    input: { hint: '[configure|start|resume|pause|stop|status|report|members|message|meeting|hire|fire|add|remove|set]' },
    handler: async function (inv) {
      const s = getSession(inv && inv.agent)
      if (!s) return { kind: 'success', text: JSON.stringify({ ok: false, error: 'no session' }) }
      const line = String(inv && inv.rawInput ? inv.rawInput : '').trim()
      const parts = line.split(/\s+/)
      const cmd = parts[0] || ''
      const rest = parts.slice(1)
      let r
      if (cmd === 'configure') r = await s.configure({ institute: rest[0] || '', problem: parts.slice(2).join(' ') })
      else if (cmd === 'start') r = await s.doStart({})
      else if (cmd === 'resume') r = await s.resume()
      else if (cmd === 'pause') r = s.setPause()
      else if (cmd === 'stop') r = await s.initStop()
      else if (cmd === 'status') r = s.status()
      else if (cmd === 'report') r = s.report()
      else if (cmd === 'members') r = { ok: true, members: s.status().members }
      else if (cmd === 'message') r = await s.say('office', { to: rest[0] || 'all', text: rest.slice(1).join(' '), kind: 'office' })
      else if (cmd === 'meeting') r = await s.startMeeting('office', { agenda: rest.join(' '), kind: 'sync' })
      else if (cmd === 'hire') r = await s.hire('office', { purpose: rest[0] || '', initial_task: rest.slice(1).join(' ') || rest[0] || '' })
      else if (cmd === 'fire') r = await s.fire('office', { id: rest[0] || '', reason: rest.slice(1).join(' ') })
      else if (cmd === 'add') r = await s.addResearcher('office', rest.join(' '))
      else if (cmd === 'remove') r = await s.removeResearcher(rest[0] || '')
      else if (cmd === 'set') {
        const upd = {}
        for (const tok of rest) {
          const eq = tok.indexOf('=')
          if (eq <= 0) continue
          const k = tok.slice(0, eq), v = tok.slice(eq + 1)
          const n = Number(v)
          upd[k] = Number.isFinite(n) && v !== '' ? n : (v === 'true' ? true : v === 'false' ? false : v)
        }
        r = await s.setParams(upd)
      } else r = { ok: false, usage: 'configure|start|resume|pause|stop|status|report|members|message|meeting|hire|fire|add|remove|set' }
      return { kind: 'success', text: JSON.stringify(r, null, 2) }
    },
  }))

  // ── the institute-state projection unit (registered ONCE, host-only) ──────
  // No `wire`, so this unit is omitted from client snapshots but is checkpointed like
  // every other unit — verified on this host: checkpoint() carries it, restore()
  // refolds it from checkpoint + log tail, and it never enters `deriveMessages()`.
  const projections = projectionsOf()
  if (projections && typeof projections.register === 'function') {
    ctx.effect(() => projections.register({
      key: PROJECTION_KEY,
      stateVersion: PROJECTION_VERSION,
      stateSchema: STATE_SCHEMA,
      init: initState,
      apply: applyV5Event,
    }))
  } else {
    console.error('vibe-math-v5: sessionProjections unavailable — falling back to the hardened JSON state file (State/<institute>.v5state.json)')
  }

  // ── agent lifecycle wiring ───────────────────────────────────────────────
  // Capture the live child Agent while it is STILL registered: `subagent/end` is
  // emitted only after the child's Activation teardown removed it from the agent
  // registry, so an end-time agents.get(childId) can never resolve (real /compact was
  // dead code in v4 for exactly this reason). A WeakRef means a missed release merely
  // delays collection rather than pinning the Agent.
  ctx.on('subagent/start', function (info) {
    if (!info || !info.id) return
    const sid = childOwner.get(info.id)
    const s = sid !== undefined ? sessions.get(sid) : undefined
    if (!s) return
    let agent
    try { agent = agents.get(info.id) } catch (e) { agent = undefined }
    if (agent) s.rememberAgent(info.id, agent)
  })
  ctx.on('subagent/end', function (info) {
    if (!info || !info.id) return
    const sid = childOwner.get(info.id)
    const s = sid !== undefined ? sessions.get(sid) : undefined
    if (!s) return
    s.onMemberEnd(info.id, info)
      .catch((e) => {
        console.error('vibe-math-v5: end handler: ' + String((e && e.stack) || e))
        // Last line of defence: an exceptional turn must never leave the institute with
        // no end-event and no heartbeat to continue it (v4 §30).
        s.kick()
      })
      .finally(() => s.forgetAgent(info.id))
  })
}

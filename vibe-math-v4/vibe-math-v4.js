// Vibe Math V4 — persistent self-organizing collaborative research framework.
// FACILITATOR (message bus / meetings / per-resident artifact libraries /
// unanimous-consensus verification / context compaction proxy / resume / human
// intervention). It NEVER assigns tasks: residents message & meet and decide all
// task allocation among themselves. Consumes HOST subagents/agents/fs/tools/commands.
// NOTE: must declare `inject` for every service read as a ctx property (the Guard
// rejects undeclared dependencies). `timer` IS injected and used (ctx.timeout) so every
// timer here is a fiber-owned disposer — but the global setTimeout/clearTimeout DO exist
// in this preset's runtime: a preset is a FILE row loaded by a plain host-realm import().
// The vm sandbox that traps require/setTimeout/setInterval/fetch wraps only a DYNAMIC
// package's host half (@deepseek-ai/dsh-cordis-host-runner/lib/types/sandbox.js, reached
// only from the dynamic-package start path); v2/v3 use those globals and work. An earlier
// version of this note claimed the globals do not exist — false for file rows, and it would
// only become true if this preset were ever converted to a dynamic package.
// The Lean job id and the archive de-duplication are CONTENT-hash based (`lean-incremental-async`
// spec §4.3), so the plugin needs a real SHA-256. `node:crypto` is a plain Node builtin here: a
// preset is a FILE row loaded by a host-realm import(), and the plugin already relies on Node
// builtins (`process.platform`) — see the header note about the vm sandbox applying only to a
// DYNAMIC package's host half.
import { createHash } from 'node:crypto'
// math_computation (docs/math-computation.md, `_oneoff/mc-P1-ready/INTERFACE-FREEZE.md` §5): the tool
// CORE lives in the shared module — installed byte-identically into all four presets by the
// integration owner and checked by `tests/audit-math-computation-parity.mjs`. This preset only WIRES
// it: params, one registration, and the prompt text. Names/shapes come from the module, never
// re-spelled here (the six parameter names are a frozen cross-preset contract).
import {
  registerMathComputation,
  probeMathEngines,
  MATH_TOOL_DESCRIPTION,
  MATH_PERSONA_TOOL_LINE,
  MATH_RULE_LINES,
  MATH_RULE_LINES_EN,
  MATH_ARCHIVE_WORKFLOW_LINE,
  MATH_ARCHIVE_WORKFLOW_LINE_EN,
  MATH_SUBSTITUTION_RULE_LINE,
  MATH_SUBSTITUTION_RULE_LINE_EN,
  MATH_PARAM_DEFAULTS,
  MATH_PARAM_NAMES,
  normalizeMathParams,
  mathAvailabilityLine,
} from './math-computation.js'

export const inject = ['subagents', 'agents', 'fs', 'tools', 'commands', 'timer']

// ---- host live-child cap (DSH ≥ 0.2) ----------------------------------------
// The host caps the number of LIVE continuable children PER ROOT AGENT. Evidence (installed
// dsh-subagent 0.2.0-rc.2): `materialize` calls `ActivationPool.reserve(this.maxActiveSubagents())`
// and `reserve` throws `SubagentError('subagent limit reached (active child limit: <capacity>);
// wait for an existing child to finish or complete this work with the current agents',
// 'ACTIVATION_LIMIT_REACHED')` when every slot is taken. The capacity comes from the `subagent`
// row's `maxActiveSubagents` Config key (default 8; no preset sets it), the cap is shared by all
// descendants of that root, and a slot is released when a child settles. The `.d.ts` does NOT
// document the throw.
//
// The detector and the remembered limit live at MODULE scope because the cap is a property of the
// HOST (the same number for every root of this process), not of one session. On DSH 0.1.x
// `subagents.startContinuable` never throws this code, so every branch below is inert there — the
// error code itself is the feature test, there is no version check anywhere.
let hostChildLimit                 // undefined until the host tells us its ceiling (via a refusal)
function isActivationLimitReached(e){ return String((e && e.code) || '') === 'ACTIVATION_LIMIT_REACHED' }
function noteChildLimit(e){
  const m = /active child limit:\s*(\d+)/.exec(String((e && e.message) || e || ''))
  if(m) hostChildLimit = Number(m[1])
  return hostChildLimit
}
// One actionable sentence naming the HOST ceiling and the knob that raises it.
function hostChildLimitHint(limit){
  const n = (limit === undefined || limit === null) ? '' : ('=' + limit)
  return '本宿主对「同时在活的续聊子代理」有上限（宿主 subagent 行的 maxActiveSubagents 参数' + n
    + '，写满后子代理服务抛 ACTIVATION_LIMIT_REACHED）'
}

export function apply(ctx) {
  // math_computation (v5-style structure, per-session module instances):
  //   1. a THROWAWAY capture-only host yields the frozen tool face (name/description/schema) once;
  //   2. the tool is registered ONCE with a router that resolves the CALLING session;
  //   3. each session lazily gets its OWN `registerMathComputation(...)` instance, cached by that
  //      session's host object, so there is NO "current session" slot at all and two sessions can run
  //      math calls CONCURRENTLY without ever seeing each other's params/root/fs/probe cache.
  // (An earlier revision used a single holder plus a plugin-level serialisation chain; a shared slot
  // was only safe while calls could not overlap, and serialising cost cross-session parallelism.)
  let mathToolFace = null
  const subagents = ctx.subagents
  const agents = ctx.agents
  const fs = ctx.fs
  const tools = ctx.tools
  const commands = ctx.commands
  // Optional services are resolved LAZILY at call time, never snapshotted in apply().
  // A `ctx.get()` snapshot taken here is order-sensitive: if the service has not been
  // provided yet when this preset subtree mounts, the snapshot stays undefined for the
  // whole session, so `runShell` would report 'no-subprocess' forever and `ensureDirs()`
  // would silently stop creating the project tree (only masked by fs.writeText's
  // automatic parent creation). Reading on demand removes that dependency on mount order.
  const subprocessOf = () => { try { return ctx.get('subprocess') } catch(e){ return undefined } }
  const sandboxPolicyOf = () => { try { return ctx.get('sandboxPolicy') } catch(e){ return undefined } }
  const compactionOf = () => { try { return ctx.get('compaction') } catch(e){ return undefined } }

  const sessions = new Map()      // rootAgentId -> Session
  const childOwner = new Map()    // childId -> rootAgentId
  const fileOwner = {}            // process-level write lock
  const processEpoch = String(Date.now()) + '-' + Math.random().toString(36).slice(2, 8)

  function sessionIdOf(agent){ try { return (agent&&agent.id)?String(agent.id):undefined } catch(e){ return undefined } }
  function rootOf(agent){ try { let cur=agent; const seen=new Set(); while(cur){ const id=cur.id; if(seen.has(id)) return cur; seen.add(id); const p=(cur.session&&cur.session.header)?cur.session.header.parentSession:undefined; if(p===undefined) return cur; const par=agents.get(p); if(!par) return cur; cur=par } } catch(e){} return agent }
  function getSession(agent){ const root=rootOf(agent); const sid=sessionIdOf(root); if(sid===undefined) return undefined; let s=sessions.get(sid); if(!s){ s=makeSession(root,sid); sessions.set(sid,s) } return s }

  function makeSession(rootAgent, sessionId) {
    let currentProject = 'default'
    const DEFAULT_PARAMS = {
      residentCount: 4, compactThreshold: 66, compactAfterRounds: 8,
      maxParallel: 3, activityTimeoutMs: 120000, verdictMaxRounds: 3,
      meetingKeepEvery: 5,   // 每积累 N 个新产物自动触发一次同步会议
      stallAutoMeetingMs: 360000,   // 团队空闲且无新产物的"停滞阈值"：超过则自动召集同步会议（分级保活 B）
      // model/provider inheritance: '' = the resident inherits the parent (main assistant)
      // route (provider + model). Set them to override the resident's LLM backend/model.
      provider: '', model: '', residentPersona: '',
      // tool permissions: an allow/deny list of tool names applied via startContinuable's
      // toolFilter (scoped tools.restrict() in the child). Empty = inherit all tools.
      // CAUTION: only set one of these; an empty allow:[] would deny EVERY tool.
      toolAllow: [], toolDeny: [],
      // ---- Lean formal verification (docs/formal-verification.md) ----------------
      // 'off' (default, a TRUE no-op) | 'encourage' | 'require'. The MODE is dynamic: every
      // mode-dependent prompt string is computed from params.formalVerify at the moment the
      // prompt is built, never frozen into a brief, so switching the knob takes effect on the
      // very next wake.
      formalVerify: 'off',
      leanCommand: 'lean',
      leanArgs: [],            // inserted BEFORE the file name (e.g. ['env','lean'] with lake)
      leanTimeoutMs: 120000,
      // ---- incremental + async Lean compilation (lean-incremental-async spec §1.1) ----------
      // true (default): `lean_run` / `lean_archive{run:true}` ENQUEUE a background job and return
      // immediately (`async:{jobId,state:'queued'}`); the queue is drained from the existing
      // heartbeat. false: the historical synchronous `await` path, unchanged. The compile budget
      // is `leanTimeoutMs`; the executable/args are `leanCommand`/`leanArgs` (no new parameter).
      leanAsync: true,
      // AMENDMENT §1: PROACTIVITY is a separate knob from the verification requirement.
      // `formalVerify` says how strong the check must be at VOTING time; `leanInitiative` says how
      // eager the group should be while WORKING. 'off' = no proactive nagging (verify-time only),
      // 'normal' = today's "顺手形式化" line, 'eager' = actively formalize valuable small
      // lemmas/propositions/definitions as they appear.
      leanInitiative: 'normal',
      // AMENDMENT §2: extra search roots, injected in ORDER before the automatic VibeMath root,
      // de-duplicated; an explicit --search-path/-R/--root in `leanArgs` still wins outright.
      leanSearchPaths: [],
      // AMENDMENT §5: how many background compiles may run at once (default 1 = serial).
      leanJobsMaxParallel: 1,
      // ---- final paper (docs/final-paper.md §1) ----------------------------------
      // The run's conclusion is a PAPER the whole team co-authors once consensus has converged.
      // finalPaper=true triggers it automatically at that moment (idempotent); the other four knobs
      // decide what is produced, in which language, whether PDFs are attempted, and WHO finalises.
      finalPaper: true,
      paperFormat: 'both',     // 'both' | 'md' | 'tex'
      paperLanguage: 'zh',     // 'zh' | 'en'
      paperCompilePdf: true,   // compile a PDF when a LaTeX engine is actually detected
      // v2 §A5: the editor is the SESSION ROOT / human side ("office") by default — v4 has no
      // `facilitator` roster member with an LLM — or one named resident (`resident:<id>`).
      paperEditor: 'office',
      paperLatexCommand: '',   // preferred LaTeX executable ('' = the standard detection order)
      // ---- math_computation (docs/math-computation.md) ---------------------------
      // The six MATH_* parameter names are a FROZEN cross-preset contract; the VALUES come from the
      // shared module so a drift in one preset cannot diverge from the others (the integration
      // owner's parity guard compares the four presets). `mathEngines`/`mathPackages` are copied,
      // never aliased: `MATH_PARAM_DEFAULTS` is frozen and shared.
      mathComputation: MATH_PARAM_DEFAULTS.mathComputation,   // 'auto' | 'on' | 'off' (off = true no-op)
      mathMode: MATH_PARAM_DEFAULTS.mathMode,                 // 'typed+shell' | 'typed'
      mathEngines: MATH_PARAM_DEFAULTS.mathEngines.slice(),
      mathTimeoutMs: MATH_PARAM_DEFAULTS.mathTimeoutMs,
      mathPackages: MATH_PARAM_DEFAULTS.mathPackages.slice(),
      mathInstallScope: MATH_PARAM_DEFAULTS.mathInstallScope,
    }
    let params = Object.assign({}, DEFAULT_PARAMS)
    // ── math_computation availability line (P1) ────────────────────────────────────────────────
    // The tool itself is registered ONCE at apply level (the host adapter there resolves the calling
    // session dynamically). The PROMPT line is per-session state, so it is derived here from a
    // session-local probe host: `probeMathEngines` caches per host object, so the expensive probe
    // runs once per session and every later prompt re-uses it. `mathComputation:'off'` is a true
    // no-op (no probe, no line).
    const mathProbeHost = {
      register: ()=>{},                       // probeMathEngines never registers; adaptHost requires it
      params: ()=>params,
      projectRoot: ()=>frameworkRoot(),
      writeText: (rel,text)=>writeText(rel,text),
      readText: (rel)=>readText(rel),
      exists: async (rel)=>{ try { const t=await fsTarget(rel); return (await fs.stat(t))!==undefined } catch(e){ return false } },
      // P2a/audit-R2: the module's per-project retention check (MATH_ARCHIVE_MAX_RUNS) only runs
      // when the host exposes listDir. Root ('', '.') means the project root. The field is attached
      // ONLY when the fs surface actually has the method, so "no listDir" stays expressible (a
      // never-absent function would make the module's `typeof H.listDir === 'function'` vacuous).
      ...(typeof fs.listDir === 'function' ? { listDir: async (rel)=>{ try { const t=await fsTarget(rel===''||rel==='.'?'':rel); return (await fs.listDir(t))||[] } catch(e){ return [] } } } : {}),
      resolveExecutable: async (cmd)=>{
        const sub=subprocessOf()
        if(sub===undefined||typeof sub.resolveExecutable!=='function') throw new Error('NO_SUBPROCESS')
        return await sub.resolveExecutable(String(cmd))
      },
      spawn: async (o)=>{ const r=await mathSpawnAdapter(o); return r },
      // Same capability flag as the registered host: the prompt-side probe should not advertise
      // engines on a host that cannot execute at all.
      hasSubprocess: ()=>!!subprocessOf(),
      // round-7 (fix 2): DSH's own bundled runtimes (`<home>/.dsh/dsh-runtimes/*/dependencies/<engine>/`)
      // as a LAST resort after PATH. Generic roots only; the module globs the tree name (never
      // `dsh-primary-runtime`) and accepts only the descriptor's own candidate names.
      runtimeRoots: () => { const env = process.env.DSH_HOME; if (env) return [String(env)]; const home = String(process.env.HOME || process.env.USERPROFILE || ''); return home ? [home.replace(/[\\/]+$/, '') + '/.dsh'] : [] },
      listDirAbs: async (abs)=>{ try { const t=await fsTarget(abs); const st=await fs.stat(t); if(!st) return []; return (await fs.listDir(t))||[] } catch(e){ return [] } },
      log: (kind,msg)=>logActivity(String(kind||'math'),String(msg||'')),
      refreshAvailability: ()=>refreshMathAvailability(),
    }
    /**
     * The shared module's spawn contract is flat — `{argv,cwd,timeoutMs,stdoutCap,stderrCap}` →
     * `{exit,timedOut,killed,ms,stdout,stderr}` — while the host service hands back a live handle.
     * A TIMEOUT MUST ACTIVELY KILL: the same race-and-terminate discipline `leanRunFile` uses, so the
     * module is never told "timed out" while the process is still running. Output is collected up to
     * the caller's cap; `run` passes 4MB on purpose (the module archives the COMPLETE output itself
     * and only truncates its REPLY to 64KB).
     */
    async function mathSpawnAdapter(o){
      const sub=subprocessOf()
      // `null` is the module's documented "this host cannot execute" signal (it maps it to
      // MATH_NO_SUBPROCESS), so it must NOT be papered over with an empty success-looking result.
      if(sub===undefined||typeof sub.spawn!=='function') return null
      const spec=o||{}
      const cap=Math.max(1000,Math.floor(Number(spec.timeoutMs))||MATH_PARAM_DEFAULTS.mathTimeoutMs)
      const outCap=Math.max(1024,Math.floor(Number(spec.stdoutCap))||64*1024)
      const errCap=Math.max(1024,Math.floor(Number(spec.stderrCap))||64*1024)
      const started=now()
      let handle
      try { handle=sub.spawn({ argv:Array.isArray(spec.argv)?spec.argv:[], cwd:spec.cwd||frameworkRoot(), stdio:{stdin:'ignore',stdout:{maxBytes:outCap},stderr:{maxBytes:errCap}}, graceMs:cap }) }
      catch(e){ return {exit:null,timedOut:false,killed:false,ms:now()-started,stdout:'',stderr:String((e&&e.message)||e)} }
      let killedByUs=false, timerDispose=null, outcome
      try {
        outcome=await Promise.race([
          handle.done,
          new Promise(function(resolve){
            if(typeof ctx.timeout!=='function') return   // no timer service: the host grace window is all we have
            timerDispose=ctx.timeout(function(){
              killedByUs=true
              try { if(typeof handle.terminate==='function') handle.terminate() } catch(e){ /* best effort */ }
              resolve({exitCode:null,signal:'SIGTERM'})
            }, cap)
          }),
        ])
      } catch(e){
        if(timerDispose){ try { timerDispose() } catch(_e){} }
        return {exit:null,timedOut:false,killed:killedByUs,ms:now()-started,stdout:'',stderr:String((e&&e.message)||e)}
      }
      if(timerDispose){ try { timerDispose() } catch(e){ /* already fired */ } }
      let out='', err=''
      try { if(handle.collected&&handle.collected.stdout) out=handle.collected.stdout.readFrom(0).text } catch(e){ /* best effort */ }
      try { if(handle.collected&&handle.collected.stderr) err=handle.collected.stderr.readFrom(0).text } catch(e){ /* best effort */ }
      const ms=now()-started
      const exit=(outcome&&outcome.exitCode!==undefined)?outcome.exitCode:null
      // Two ways a timeout is observed (identical to `leanRunFile`): OUR timer won and killed the
      // handle, or the host's own grace window killed it first and its `done` beat our timer.
      const timedOut=killedByUs||(exit!==0&&ms>=cap)
      return {exit, timedOut, killed:killedByUs, ms, stdout:out, stderr:err}
    }
    let running = false, autoDone = false, phase = 'idle'
    let residents = new Map(), mailboxes = new Map(), taskboard = [], decisions = []
    // round-9 (P2/D4): the participant set is frozen per verify/meeting together with this version, so
    // every view reads the SAME roster instead of re-deriving it from the live map (mid-flight
    // addMember/removeMember is possible: removeMember reconciles in-flight work, addMember has no
    // verify/meeting gate).
    let rosterVersion = 0
    let meetings = [], reports = [], activityLog = []
    let problemText = '', problemId = 'problem', runId = 'run-' + shortId()
    // Lean formalization records, keyed by object id. v4 has no session-log projection, so this
    // is persisted through v4's OWN durable State/*.json mechanism (State/formal.json) and must
    // survive `resume` — otherwise a require-mode object would lose the very record that decides
    // whether its verdict may take effect.
    let formal = {}, formalTodos = [], formalPersisted = false
    let meetingState = null, verifyState = null, pendingVerify = [], pendingMeeting = null   // pendingVerify: FIFO queue (several residents may independently propose different objects before any verify runs — a single slot silently DROPPED all but the last proposal)
    // The final-paper flow (docs/final-paper.md, v1 + v2 amendments). In-memory only: the DURABLE
    // idempotency record is `Paper/<run id>/paper.meta.json` on disk (finalizedAt + per-artifact
    // existence, v2 §C), so a re-trigger after a restart is still recognised even though this object
    // did not survive. While a paper is in flight this holds the whole team-authoring state machine.
    let paperState = null
    // ---- Lean compile queue (lean-incremental-async spec §2) --------------------------------
    // Per-SESSION in-memory FIFO (created/destroyed with the session), mirrored to
    // `<project>/Formal/Jobs/<jobId>.json` for crash recovery and `lean_lib.jobs`. Concurrency is a
    // CONSTANT (1): compiling competes with the model for CPU and Lean parallelises internally, so
    // the queue serialises instead of fanning out; the cap is not a parameter (D5: reuse, don't
    // grow the parameter surface).
    const LEAN_QUEUE_CONCURRENCY = 1   // the DEFAULT cap; `leanJobsMaxParallel` overrides it (AMENDMENT §5)
    let leanQueue = []        // job ids waiting (queued, not started)
    let leanInflight = []     // jobs currently compiling (length ≤ the concurrency cap)
    let leanJobs = {}         // jobId -> job record (mirrors Formal/Jobs/*.json)
    let leanNotices = []      // settled-job announcements, injected once into the next prompt
    let busy = new Set(), wakeKind = new Map(), currentResident = ''
    let finalizeLock = null   // 'meeting'|'verify' while a consensus finalize is running (reentry guard)
    const verifiedRecently = new Map()   // targetId -> timestamp when it was closed as Verified (dedup re-propose)
    let lastActivityAt = now(), lastProgressAt = now(), artifactCount = 0, lastSyncMeetingAt = 0, persistedEpoch = '', heartbeatDisposer = null
    // `artifactBaseline` = the artifact count observed when the auto-sync-meeting counter was last
    // re-based (see `countArtifacts`/`syncArtifactCount`): the documented behaviour is "every N NEW
    // artifacts", so the modulo test must run against the number of artifacts written SINCE the run
    // started, not against the raw file count of a possibly pre-existing project tree.
    let artifactBaseline = null
    const activityLogCap = 200

    // ---- utils ----
    // contextPct is a PERCENT (0-100); never clamp to 0-1 or the compactThreshold
    // comparison (e.g. 66) becomes `1.0 >= 66` and never fires.
    function textBlock(t){ return { type:'text', text:String(t) } }
    function logActivity(event,detail){ activityLog.push({at:now(),event,detail:String(detail||'')}); if(activityLog.length>activityLogCap) activityLog.shift() }
    function logDecision(kind,detail){ decisions.push({at:now(),kind,detail:String(detail||'')}) }
    // Record that the project made real progress (new artifact, meeting, verify, task, or a
    // resident speaking to the group). The stall auto-sync meeting (B) fires only when this has
    // NOT advanced for stallAutoMeetingMs, so a group that is genuinely producing keeps working
    // and only a truly stalled group gets a coordination meeting to reboot itself.
    function markProgress(){ lastProgressAt = now(); }
    // How long a meeting/verify may run without collecting a new input/verdict before we treat it as
    // deadlocked and abandon it. A meeting round's own signal window is activityTimeoutMs, so a
    // resident should speak within that; 2× that without ANY new input/verdict means the meeting/verify
    // is stuck and must not keep the whole group blocked.
    // Positive duration with a safe fallback: a NEGATIVE/NaN activityTimeoutMs or stallAutoMeetingMs
    // (misconfigured via vibe_v4_set) would otherwise make recoverStallMs negative → every meeting/
    // verify watchdog fires INSTANTLY (abandoning all consensus) and A-fill's idle window would never
    // elapse (waking everyone every pass). Guard every duration read with this.
    function recoverStallMs(){ return posMs(params.activityTimeoutMs,120000) * 2 }
    function pickProvider(){ try { const n=subagents.list?subagents.list():[]; if(n.indexOf('spawn')!==-1) return 'spawn'; if(n.indexOf('fork')!==-1) return 'fork' } catch(e){} return 'spawn' }
    // Per-resident model/provider inheritance: when params.provider / params.model are set,
    // the resident uses that exact route; when left '' the resident inherits the parent's
    // (main assistant) route — the documented DSH default (resolveChildAgentOptions merges
    // requested over parent). No override is applied for empty values.
    function residentAgentOptions(){ const ao={}; if(params.provider) ao.provider=params.provider; if(params.model) ao.model=params.model; return ao }
    // Tool permission (scoped toolFilter). Only emit a filter when allow or deny has entries;
    // an empty object is rejected by DSH ("must declare allow and/or deny").
    function residentToolFilter(){
      const allow=Array.isArray(params.toolAllow)?params.toolAllow.filter(x=>String(x).trim()):[]
      const deny=Array.isArray(params.toolDeny)?params.toolDeny.filter(x=>String(x).trim()):[]
      if(allow.length===0 && deny.length===0) return undefined
      const f={}; if(allow.length) f.allow=allow; if(deny.length) f.deny=deny; return f
    }
    function makeSignal(ms){ return AbortSignal.timeout(posMs(ms,30000)) }
    function workspaceRoot(){ try { if(rootAgent&&rootAgent.session&&rootAgent.session.header&&rootAgent.session.header.cwd) return rootAgent.session.header.cwd } catch(e){} const sp=sandboxPolicyOf(); if(sp&&sp.workspaceRoot) return sp.workspaceRoot; return '.' }
    function vibeRoot(){ return (workspaceRoot()+'/VibeMath').replace(/\\/g,'/') }
    function frameworkRoot(){ return vibeRoot()+'/Projects/'+currentProject }
    // Object ids (verify targets, recorded cards) become FILE NAMES and DIRECTORY PATHS
    // (Verified/命题/<id>.md, Shared/debates/<id>.md, Propos/<r>/<id>.md, source-card scans).
    // A hostile/sloppy id containing path separators ('../../x') or Windows-forbidden chars would
    // escape the project tree. Keep every harmless character (incl. Chinese) and replace only
    // separators/control chars; strip leading/trailing dots/dashes so the name is never '.'/'..'.
    let warnedNoPolicy = false
    function warnNoPolicyOnce(){ if(!warnedNoPolicy){ warnedNoPolicy=true; console.error('vibe-math-v4: sandboxPolicy unavailable; writes go out with no explicit policy') } }
    function getPolicy(){ const sp=sandboxPolicyOf(); if(!sp){ warnNoPolicyOnce(); return undefined } try { if(rootAgent&&rootAgent.session) return sp.resolve({session:rootAgent.session}) } catch(e){ warnNoPolicyOnce() } try { const p=sp.resolve({}); if(!warnedNoPolicy){ warnedNoPolicy=true; console.error('vibe-math-v4: falling back to sandboxPolicy.resolve({}) — the fence root is the host-configured workspace, not necessarily this session cwd') } return p } catch(e){ warnNoPolicyOnce() } return undefined }
    function psQuote(p){ return "'"+String(p).replace(/'/g,"''")+"'" }
    /** POSIX 单引号引用：把 ' 换成 '\'' 以安全嵌入任意路径。 */
    function shQuote(p){ return "'"+String(p).replace(/'/g,"'\\''")+"'" }
    /**
     * 执行一段 shell 脚本。**按平台选择解释器**：此前硬编码 powershell，而预设用
     * `disabled: !!js process.platform !== 'win32'` 在非 Windows 上关掉了 tool-pwsh 行——
     * 插件会调用一个自己声明不提供的二进制，且返回值无人检查，表现为静默失效。
     */
    function isWindows(){ return process.platform === 'win32' }
    function mkdirCmd(paths){
      if(isWindows()) return 'New-Item -Force -ItemType Directory -Path '+paths.map(psQuote).join(',')+' | Out-Null'
      return 'mkdir -p '+paths.map(shQuote).join(' ')
    }
    /**
     * Delete command for the same two interpreters. DSH's `fs` service has no unlink/remove at all
     * (dsh-fs FileSystem: resolve/stat/readText/writeText/editText/listDir), so the ONE place this
     * preset must remove a file — withdrawing a retracted proof on `defect` (spec §4.1) — goes
     * through the platform shell helper the preset already uses for mkdir. `-ErrorAction
     * SilentlyContinue` / `-f` keep it idempotent: deleting an already-absent file is a success.
     */
    function rmCmd(paths){
      if(isWindows()) return 'Remove-Item -Force -ErrorAction SilentlyContinue -LiteralPath '+paths.map(psQuote).join(',')
      return 'rm -f '+paths.map(shQuote).join(' ')
    }
    async function runShell(script,cwd){
      const subprocess=subprocessOf(); if(subprocess===undefined) return {ok:false,error:'no-subprocess'}
      try {
        const argv = isWindows()
          ? ['powershell','-NoProfile','-NonInteractive','-Command',script]
          : ['/bin/sh','-c',script]
        const h=subprocess.spawn({argv:argv,cwd:cwd||workspaceRoot(),stdio:{stdin:'ignore',stdout:'inherit',stderr:'inherit'},graceMs:20000})
        const o=await h.done
        return {ok:o.exitCode===0,exitCode:o.exitCode}
      } catch(e){ return {ok:false,error:String((e&&e.message)||e)} }
    }
    async function fsTarget(rel){ return await fs.resolve(rel,{cwd:frameworkRoot()}) }
    async function readText(rel){ try { const t=await fsTarget(rel); if(await fs.stat(t)===undefined) return undefined; return await fs.readText(t) } catch(e){ return undefined } }
    async function writeText(rel,content){ try { const t=await fsTarget(rel); await fs.writeText(t,content,undefined,undefined,getPolicy()); return true } catch(e){ return false } }
    // State files (taskboard/residents/session/mailboxes/decisions) are written by MANY concurrent
    // flows (parallel resident turns + end handlers + tools). Two near-simultaneous writers of the
    // SAME file each stringified their snapshot BEFORE their fs.writeText landed, so the writer with
    // the OLDER snapshot could land LAST and silently erase the other's entry (e.g. two residents
    // proposing tasks in the same tick → one task vanished from taskboard.json until the next save).
    // Fix: serialize writes PER FILE, and defer JSON.stringify until the write actually runs (so the
    // snapshot always reflects the newest in-memory state at execution time — late writers win with
    // the FULL state, never with a stale subset).
    const jsonQueues = new Map()   // rel -> tail promise (per-session file write chain)
    function writeJson(rel,obj){
      const key='j:'+rel
      const prev=jsonQueues.get(key)||Promise.resolve(true)
      const run=prev.catch(()=>{}).then(async ()=>{ try { if(!(await assertWritable(rel))) return false; const t=await fsTarget(rel); await fs.writeText(t,JSON.stringify(obj,null,2),undefined,undefined,getPolicy()); return true } catch(e){ return false } })
      jsonQueues.set(key,run.catch(()=>{}))
      return run
    }
    async function readJson(rel){ const t=await readText(rel); if(t===undefined||t==='') return undefined; try { return JSON.parse(t) } catch(e){ noteSuspect(rel); return undefined } }
    /**
     * Corruption guard. `readJson` cannot tell "no file yet" from "file present but
     * unparseable", yet loadAll() treats both as "no data" and the next saveAll()
     * writes that emptiness back — so one externally damaged State/*.json silently
     * reset the whole run (residents, taskboard, mailboxes). Any read that hits a
     * present-but-unparseable JSON file records it; writeJson then REFUSES to write
     * that path until the file is fixed or deleted. A missing file is still created
     * normally, so first-run behaviour is unchanged.
     */
    const suspectFiles = new Set()
    const warnedSuspect = {}
    function noteSuspect(rel){
      suspectFiles.add(rel)
      if(warnedSuspect[rel]) return
      warnedSuspect[rel]=true
      console.error('vibe-math-v4: '+rel+' exists but is not parseable JSON — REFUSING to overwrite it so a corrupted file cannot silently erase your run. Fix or delete the file, then retry.')
    }
    function assertWritableSync(rel){
      if(suspectFiles.has(rel)){ console.error('vibe-math-v4: write to '+rel+' blocked (file is unparseable; see the earlier warning)'); return false }
      return true
    }
    /**
     * Nothing read this path yet, so inspect the file actually on disk before
     * replacing it. This closes the case where a fresh process never ran loadAll()
     * (configure/start) and would otherwise write an empty state over a corrupt one
     * the user might still want to inspect or repair.
     */
    async function assertWritable(rel){
      if(!assertWritableSync(rel)) return false
      try {
        const raw=await readText(rel)
        if(raw!==undefined && raw!==''){
          try { JSON.parse(raw) } catch(e){ noteSuspect(rel); return false }
        }
      } catch(e){}
      return true
    }
    async function ensureDirs(){
      const base=frameworkRoot()
      const dirs=['Problems','Progress','Propos','Methods','Subproblems','Shared/meetings','Shared/debates','Verified/命题','Verified/问题','Verified/Lean','Formal','Formal/Jobs','Computation','Reliable','Notes','State']
      // The GLOBAL reuse library (Formal/Lib + Formal/Proved) deliberately lives beside the
      // project tree, NOT inside it: cross-project reuse is the whole point (spec §3). It is
      // created here so the first `lean_archive kind='def'` never has to invent its parent.
      const globalDirs=['Formal/Lib','Formal/Proved']
      return await runShell(mkdirCmd([vibeRoot()+'/Projects'].concat(dirs.map(d=>base+'/'+d)).concat(globalDirs.map(d=>vibeRoot()+'/'+d))))
    }
    async function readTextAbs(path){ try { const t=await fs.resolve(path); const s=await fs.stat(t); if(s===undefined) return undefined; return await fs.readText(t) } catch(e){ return undefined } }
    async function writeTextAbs(path,content){ try { const t=await fs.resolve(path); await fs.writeText(t,content,undefined,undefined,getPolicy()); return true } catch(e){ return false } }
    async function readCurrentProject(){ try { const t=await readTextAbs(vibeRoot()+'/.current'); if(t) return String(t).trim() } catch(e){} return currentProject }
    async function writeCurrentProject(){ try { await writeTextAbs(vibeRoot()+'/.current', currentProject) } catch(e){} }

    // ================= Lean formal verification ==============================
    // Contract: docs/formal-verification.md (shared by v2/v3/v4/v5).
    //
    // The point of this feature is a SHIFT IN WHAT MUST BE REVIEWED, not an extra chore.
    // Unanimous consensus answers "do we all believe this?"; a machine-checked Lean
    // development answers "is this true?" and shrinks the open question to the one thing a
    // human (or an agent) can actually audit:
    //
    //     do the Lean definitions / objects / conditions / assumptions / conclusion
    //     match the proposition as originally stated?
    //
    // So once a Lean run passes, the voting prompt stops asking a resident to redo the
    // derivation and asks for a FIDELITY review. `require` mode makes that concrete: a
    // 真/假 verdict does not take effect until the object is either `passed` (a green run)
    // or carries an explicit, reasoned `blocked` record — "decide by difficulty, but decide
    // out loud, and never silently skip".
    const FORMAL_MODES=['off','encourage','require']
    // Read the mode OFF `params` every single time. Nothing mode-dependent may be cached in a
    // brief/closure: the knob is switchable at runtime and members must see the NEW text on
    // their very next wake.
    const formalMode=()=>{ const m=String(params.formalVerify); return FORMAL_MODES.indexOf(m)!==-1?m:'off' }
    const formalOn=()=>formalMode()!=='off'
    const formalRoot=()=>frameworkRoot()+'/Formal'
    const formalLibRoot=()=>vibeRoot()+'/Formal/Lib'
    const formalProvedRoot=()=>vibeRoot()+'/Formal/Proved'
    const verifiedLeanRoot=()=>frameworkRoot()+'/Verified/Lean'
    const formalRecords=()=>(formal||{})
    const formalTodo=()=>(formalTodos||[])
    function formalOf(target){
      const key=idSafe(String(target==null?'':target))
      if(!key||key==='id') return {status:'none'}
      const r=formalRecords()[key]
      return r||{status:'none'}
    }
    const formalKey=(target)=>{ const k=idSafe(String(target==null?'':target)); return (k&&k!=='id')?k:'' }
    /**
     * Write one object's formal record (and optionally the TODO list) to v4's durable state.
     * ASYNC on purpose: the write goes through v4's per-file serialized `writeJson` queue, and a
     * caller that only fires-and-forgets it could have the process die (or `resume` read the file)
     * before the record lands. Every caller here awaits the result.
     */
    async function putFormal(target,record,todo){
      const key=formalKey(target); if(!key) return false
      formal[key]=record
      if(Array.isArray(todo)) formalTodos=todo
      await saveFormal()
      return true
    }
    // Once formal state has been persisted (or restored from disk) the file must KEEP being
    // written even after the mode is switched back to `off` — otherwise `start()`'s clean slate
    // would never reach disk and a later `resume` would restore a stale `passed` record for a
    // reused object id (the exact hazard that reset exists to prevent). A session that never
    // touched the feature writes NO State/formal.json at all: `off` is a TRUE no-op (v3 guards
    // its own State/formal.json the same way).
    function saveFormal(){ formalPersisted=true; return writeJson('State/formal.json',{records:formal,todo:formalTodos}) }
    // `passed` requires a GREEN RUN, not merely an archived file: a proof file that has never
    // been executed proves nothing, so a hand-written file cannot buy its way past the gate.
    const formalGateOk=(rec)=>!!rec&&(rec.status==='passed'||rec.status==='blocked')
    // Human-readable one-liner reused by the Verified card and the index. The exact strings
    // ('Lean 通过' / '阻塞（…）') are part of the card contract (docs §8).
    function formalStatusLine(target){
      const r=formalOf(target)
      if(r.status==='passed') return 'Lean 通过（'+(r.proof||r.file||'')+'）'
      if(r.status==='blocked') return '阻塞（'+(r.note||'未说明')+'）'
      // A retracted proof must not read as a plain "tried and failed": the card has to say WHY the
      // archived proof disappeared (spec §4.1 — a fidelity defect is not a refutation).
      if(r.status==='attempted'&&r.decision==='defect') return '忠实性缺陷（'+(r.note||'未说明')+'，待重做）'
      if(r.status==='attempted') return '已尝试未通过'
      return '未尝试'
    }
    const runLine=(run)=>run?(run.ok?'ok（exit 0，'+((run.ms||0)/1000).toFixed(1)+'s）':'fail（exit '+String(run.exitCode)+'，'+((run.ms||0)/1000).toFixed(1)+'s）'):'—'
    function tail(s,n){ const t=String(s==null?'':s); return t.length>n?t.slice(-n):t }

    // Lexically normalise an absolute path (collapse '.', '..' and duplicate slashes) WITHOUT
    // touching the filesystem. A plain `startsWith(root)` check is NOT enough:
    // "…/VibeMath/Projects/../../../../etc/evil.lean" still starts with the root as a string
    // while resolving outside it.
    function normalizeAbsPath(p){
      const parts=String(p==null?'':p).replace(/\\/g,'/').split('/')
      const out=[]
      for(const seg of parts){
        if(seg===''){ if(out.length===0) out.push(''); continue }
        if(seg==='.') continue
        if(seg==='..'){ if(out.length>1) out.pop(); continue }
        out.push(seg)
      }
      return out.join('/')
    }
    // Resolve a Lean path to an absolute, NORMALISED path provably inside the VibeMath root —
    // or null. Note the boundary is the VibeMath root and NOT the project: the global reuse
    // library deliberately lives at <VibeMath>/Formal/{Lib,Proved}, outside the project tree,
    // so climbing out of the project but staying inside VibeMath is legal. Every Lean file
    // access (run, archive, read) goes through this.
    function leanAbsPath(rel){
      const raw=String(rel==null?'':rel).trim()
      if(!raw) return null
      const abs=(raw.charAt(0)==='/'||/^[a-z]:/i.test(raw))?raw:frameworkRoot()+'/'+raw.replace(/^\.\//,'')
      const norm=normalizeAbsPath(abs)
      const root=normalizeAbsPath(vibeRoot())
      if(norm!==root&&norm.indexOf(root+'/')!==0) return null
      return norm
    }
    // <VibeMath>-relative → absolute. Used for the GLOBAL library, which sits beside the
    // project tree rather than inside it.
    function vibeRelAbs(rel){ return vibeRoot()+'/'+String(rel==null?'':rel).replace(/^\.\//,'') }

    // Run the toolchain on one file. NEVER throws into the scheduler loop: every failure mode
    // (no service, no executable, spawn failure, timeout, non-zero exit) becomes a readable
    // result, because a thrown error inside an end handler would strand the whole group.
    async function leanRunFile(relPath,timeoutMs){
      const started=now()
      const rel=String(relPath==null?'':relPath).trim()
      if(!rel) return {ok:false,code:'V4_INVALID_ARGUMENT',message:'file is required'}
      // Path guard: only files inside the VibeMath tree may be executed, so a crafted path can
      // never make the framework run something outside the workspace.
      const abs=leanAbsPath(rel)
      if(abs===null) return {ok:false,code:'V4_INVALID_ARGUMENT',message:'Lean file must live under '+vibeRoot().replace(/\\/g,'/')+'/ (got '+rel+')',file:rel}
      if(!/\.lean$/.test(abs)) return {ok:false,code:'V4_INVALID_ARGUMENT',message:'only .lean files can be executed',file:rel}
      if(await readTextAbs(abs)===undefined) return {ok:false,code:'V4_NOT_FOUND',message:'no such file: '+rel,file:rel}
      const sub=subprocessOf()
      if(sub===undefined||typeof sub.spawn!=='function'){
        return {ok:false,code:'NO_SUBPROCESS',message:'the host exposes no subprocess service; Lean cannot be executed here',file:rel,ms:0}
      }
      const cap=Math.max(1000,Math.floor(Number(timeoutMs))||Math.floor(Number(params.leanTimeoutMs))||120000)
      let exe
      try { exe=await sub.resolveExecutable(String(params.leanCommand||'lean')) }
      catch(e){
        return {ok:false,code:'LEAN_NOT_FOUND',message:'cannot resolve "'+String(params.leanCommand||'lean')+'": '+String((e&&e.message)||e)+' — 仍可把形式化代码写下来归档，但无法在此宿主上执行',file:rel,ms:now()-started}
      }
      // §3.1: the search path is computed HERE (never persisted into `leanArgs`): user args first,
      // then `--search-path <VibeMath root>` unless the user already stated a search root, then the
      // file. `lake env lean` therefore becomes `lake env lean --search-path <root> <file>` for free.
      const argv=leanArgv(exe, abs)
      let handle
      try {
        handle=sub.spawn({ argv, cwd:frameworkRoot(), stdio:{stdin:'ignore',stdout:{maxBytes:64*1024},stderr:{maxBytes:64*1024}}, graceMs:cap })
      } catch(e){ return {ok:false,code:'LEAN_SPAWN_FAILED',message:String((e&&e.message)||e),file:rel,ms:now()-started} }
      // A timeout must be ACTIVELY enforced. `graceMs` is only the host's own grace window; the
      // contract (§7) additionally requires `handle.terminate()` on timeout, and a host that
      // ignores/exceeds graceMs would otherwise leave the Lean process running while the framework
      // reports LEAN_TIMEOUT. Race `done` against a cap-ms timer that terminates the handle and
      // resolves a synthetic outcome. Note: the `timer` service (ctx.timeout) is the timer used here
      // because it returns the disposer we clear below when `done` wins the race (a fiber-owned
      // disposer), NOT because global timers are missing: they exist for file rows like this preset
      // (see the header note — only a DYNAMIC package's host half is vm-sandboxed).
      let killedByUs=false, timerDispose=null
      let outcome
      try {
        outcome=await Promise.race([
          handle.done,
          new Promise(function(resolve){
            if(typeof ctx.timeout!=='function') return   // no timer service: the host's graceMs is all we have
            timerDispose=ctx.timeout(function(){
              killedByUs=true
              try { if(typeof handle.terminate==='function') handle.terminate() } catch(e){ /* best effort */ }
              resolve({exitCode:null,signal:'SIGTERM'})
            }, cap)
          }),
        ])
      } catch(e){
        if(timerDispose){ try { timerDispose() } catch(_e){} }
        return {ok:false,code:'LEAN_RUN_FAILED',message:String((e&&e.message)||e),file:rel,ms:now()-started}
      }
      if(timerDispose){ try { timerDispose() } catch(e){ /* already fired */ } }
      let out='',err=''
      try { if(handle.collected&&handle.collected.stdout) out=handle.collected.stdout.readFrom(0).text } catch(e){ /* best effort */ }
      try { if(handle.collected&&handle.collected.stderr) err=handle.collected.stderr.readFrom(0).text } catch(e){ /* best effort */ }
      const exitCode=outcome?outcome.exitCode:null
      const ms=now()-started
      const ok=exitCode===0
      // Two ways a timeout is observed: OUR timer won (we terminated the handle), or the HOST's own
      // grace window killed the process first and its `done` beat our timer to the race — the latter
      // is recognised by "non-zero exit after at least cap ms", which is what the spec's
      // LEAN_TIMEOUT row describes. Keeping both means a real hang is never reported as a plain
      // compile failure just because the host's kill resolved first.
      const timedOut=killedByUs||(!ok&&ms>=cap)
      return {
        ok, exitCode, signal:(outcome&&outcome.signal)||null, ms,
        command:argv.join(' '), file:rel,
        stdout:tail(out,4000), stderr:tail(err,4000), timedOut,
        code: ok?undefined:(timedOut?'LEAN_TIMEOUT':'LEAN_FAILED'),
      }
    }
    // Record one run against an object. `passed`/`blocked` are NEVER downgraded by a later red
    // run (only an explicit re-archive decides those); everything else becomes `attempted`.
    // The comment used to describe a transition the body did not implement: `status:'attempted'`
    // was hardcoded, so ANY `lean_run {target}` on a passed object silently stripped `passed`
    // (and kept the now-stale `proof` pointer). That is not a cosmetic slip: it removes the
    // fidelity branch from the next voting prompt AND, in `require` mode, re-closes the gate on an
    // object that already has a green archived proof. docs/formal-verification.md §4 only maps
    // `none`/`attempted` → `attempted`, and v2/v5 preserve passed/blocked here.
    async function formalSetRun(target,run){
      const key=formalKey(target); if(!key) return
      const prev=formalOf(key)
      await putFormal(key,Object.assign({},prev,{
        status:prev.status==='passed'?'passed':(prev.status==='blocked'?'blocked':'attempted'),
        file:run.file||prev.file||'',
        decision:prev.decision||'used',
        run:{at:now(),ok:!!run.ok,exitCode:run.exitCode===undefined?null:run.exitCode,ms:run.ms||0,stdoutTail:tail(run.stdout,800),stderrTail:tail(run.stderr,800)},
        updatedAt:now(),
      }))
    }

    // ================= Lean compile queue + incremental reuse (§2-§4) =================
    //  · `leanAsync=true` (default): the tools ENQUEUE and return; the queue drains from the existing
    //    heartbeat (`armHeartbeat`), concurrency 1, budget = `leanTimeoutMs`.
    //  · `leanAsync=false`: the synchronous `await` path, verbatim.
    //  · ONLY a settled, green job whose file STILL MATCHES the enqueued content hash may set
    //    `passed` / write `Verified/Lean/<id>.lean`; every other outcome stays `attempted`.
    const LEAN_ASYNC_ON = () => params.leanAsync !== false
    // §3.6: the flag spelling is one constant on purpose — if a toolchain wants `-R <root>`, only
    // this line changes and the interface stays put.
    const LEAN_SEARCH_PATH_FLAG = '--search-path'
    const LEAN_READ_MAX_BYTES = 64 * 1024
    /** §3.1: never inject when the user already stated a search root (explicit config wins). */
    function leanHasSearchFlag(args){ return (Array.isArray(args)?args:[]).some(a=>{ const s=String(a); return s===LEAN_SEARCH_PATH_FLAG||s.indexOf(LEAN_SEARCH_PATH_FLAG+'=')===0||s==='-R'||s==='--root' }) }
    /** AMENDMENT §2: the roots to inject — USER paths first, then the automatic VibeMath root,
     *  de-duplicated, order preserved. */
    function leanSearchPathList(){
      const out=[]
      for(const p of (Array.isArray(params.leanSearchPaths)?params.leanSearchPaths:[])){ const s=String(p==null?'':p).trim(); if(s&&out.indexOf(s)<0) out.push(s) }
      const root=vibeRoot().replace(/\\/g,'/')
      if(out.indexOf(root)<0) out.push(root)
      return out
    }
    /** The injected flag pairs, or [] when the user's own `leanArgs` already state a search root. */
    function leanSearchPathArgs(){
      const user=(Array.isArray(params.leanArgs)?params.leanArgs:[]).map(String)
      if(leanHasSearchFlag(user)) return []
      const out=[]
      for(const p of leanSearchPathList()) out.push(LEAN_SEARCH_PATH_FLAG,p)
      return out
    }
    /** `[exe, ...userArgs, ...(search roots unless the user stated one), ...tail]` (§3.1 + AMENDMENT §2). */
    function leanArgv(exe,tail){
      const user=(Array.isArray(params.leanArgs)?params.leanArgs:[]).map(String)
      return [exe].concat(user).concat(leanSearchPathArgs()).concat(tail?[tail]:[])
    }
    /**
     * AMENDMENT §4: the job id pins the WHOLE BUILD CONTEXT — content + engine + normalized argv +
     * search paths — so a result compiled under a different toolchain/flag set can never be mistaken
     * for a verification of this one, and only THAT context's `settled(ok)` may set `passed`.
     */
    async function leanBuildContext(){
      const searchPaths=leanSearchPathList()
      let exe=String(params.leanCommand||'lean')
      const sub=subprocessOf()
      try { if(sub&&typeof sub.resolveExecutable==='function') exe=String(await sub.resolveExecutable(exe)) } catch(e){ /* keep the configured name: the run itself will report LEAN_NOT_FOUND */ }
      const argv=leanArgv(exe,null)
      return {engine:exe,argv,argvLine:argv.join(' '),searchPaths,searchArgs:leanSearchPathArgs()}
    }
    /** §4.3: CRLF/CR → LF, strip trailing whitespace per line and trailing blank lines. */
    function normalizeLeanContent(s){ return String(s==null?'':s).replace(/\r\n?/g,'\n').replace(/[ \t]+$/gm,'').replace(/\n+$/,'')+'\n' }
    function sha256Text(s){ return createHash('sha256').update(normalizeLeanContent(s),'utf8').digest('hex') }
    function leanJobsRel(){ return 'Formal/Jobs' }
    function leanJobRel(jobId){ return leanJobsRel()+'/'+jobId+'.json' }
    function leanJobId(key,buildHash){ return idSafe(String(key||'job')).replace(/\.lean$/,'')+'-'+String(buildHash).slice(0,12) }
    /** AMENDMENT §4: the id hash covers content + engine + normalized argv + search paths. */
    function leanBuildHashOf(content,ctx){ return sha256Text(JSON.stringify([sha256Text(content),String(ctx.engine||''),ctx.argv||[],ctx.searchPaths||[]])) }
    async function leanJobIdFor(key,content){ const ctx=await leanBuildContext(); return {jobId:leanJobId(key,leanBuildHashOf(content,ctx)),ctx} }
    /** Sleep through the host timer service (fiber-owned); the global fallback is what the header
     *  note documents for file rows. */
    function leanSleep(ms){ return new Promise(res=>{ if(typeof ctx.timeout==='function'){ ctx.timeout(()=>res(),ms); return } setTimeout(res,ms) }) }
    function leanJobView(j){ return j?{jobId:j.jobId,state:j.state,rel:j.rel,target:j.target||j.name||'',attempts:j.attempts||1,settledAt:j.settledAt||0,exitCode:(j.exitCode===undefined?null:j.exitCode)}:null }
    function listLeanJobs(){ return Object.keys(leanJobs).sort().map(k=>leanJobView(leanJobs[k])) }
    async function writeLeanJob(job){
      leanJobs[job.jobId]=job
      try { await writeJson(leanJobRel(job.jobId),job) } catch(e){ logActivity('formal','job 记录写入失败 '+job.jobId+': '+String((e&&e.message)||e)) }
      return job
    }
    async function readLeanJob(jobId){ try { return await readJson(leanJobRel(jobId))||undefined } catch(e){ return undefined } }
    /** §2.4: ONE line per settled job, injected into the next prompt that is constructed. */
    function pushLeanNotice(job,run){
      const sec=run&&run.ms?((run.ms/1000).toFixed(1)+'s'):'—'
      let line
      if(job.state==='settled'&&run&&run.ok) line='通过（exit 0，'+sec+(job.kind==='proof'?('，已归档 '+job.verifiedRel):'，已重建索引')+'）'
      else if(job.state==='timeout') line='超时（leanTimeoutMs='+posMs(params.leanTimeoutMs,120000)+' 已 terminate，对象保持 attempted，可重跑）'
      else if(job.state==='interrupted') line='中断（会话卸载或崩溃，已标记 attempted，可重跑）'
      else if(job.state==='failed'&&run&&!run.ok&&!run.hashMatch) line='失败（文件在编译期间被改写，结果不可用——请对新内容重跑）'
      else line='失败（exit '+String(run&&run.exitCode)+'，见 stderr 尾部：'+tail((run&&run.stderr)||'',160)+'）'
      leanNotices.push('【形式化结果】'+job.jobId+'：'+line)
      logActivity('formal','形式化结果 '+job.jobId+' → '+job.state+(job.target?('（对象 '+job.target+'）'):''))
    }
    /** Consume-and-clear the pending announcements (injected into the next constructed prompt). */
    function pendingLeanNoticeText(){ if(!leanNotices.length) return ''; const t=leanNotices.join('\n'); leanNotices=[]; return t }
    /**
     * Enqueue one compile. `job` = {kind:'run'|'def'|'lemma'|'proof', key, target, rel, content}.
     * Deduplicated by CONTENT hash (§4.3): the job id embeds `sha[0:12]`, so re-archiving identical
     * content cannot produce a second job.
     */
    async function enqueueLeanJob(job){
      const content=String(job.content==null?'':job.content)
      const sha=job.sha256||sha256Text(content)
      const ctx=job.ctx||await leanBuildContext()
      const buildHash=leanBuildHashOf(content,ctx)
      const jobId=leanJobId(job.key,buildHash)
      const existing=leanJobs[jobId]
      if(existing&&(existing.state==='queued'||existing.state==='running')) return {ok:true,duplicate:true,job:existing}
      const rec={ jobId, kind:job.kind, key:job.key, target:job.target||'', name:job.name||'', rel:job.rel, abs:job.abs||'',
        sha256:sha, buildHash, build:{engine:ctx.engine,argv:ctx.argv,searchPaths:ctx.searchPaths}, contextChanged:false,
        content, via:job.via||'', state:'queued', attempts:((existing&&existing.attempts)||0)+1,
        enqueuedAt:now(), startedAt:0, settledAt:0, exitCode:null, timedOut:false, interrupted:false, run:null, verifiedRel:'' }
      await writeLeanJob(rec)
      leanQueue.push(jobId)
      logActivity('formal','入队后台编译 '+jobId+'（'+(job.kind||'run')+' '+job.rel+'，engine='+ctx.engine+'，search-path='+(ctx.searchPaths.join(',')||'（用户自带）')+'）')
      armHeartbeat()   // §2.2: the queue is drained from the EXISTING heartbeat
      return {ok:true,job:rec}
    }
    /** §2.1/§2.4: the ONE place an object may become `passed` (and the proof be archived). */
    async function settleLeanJob(job,run){
      const nowText=await readTextAbs(job.abs)
      const hashMatch=nowText!==undefined&&sha256Text(nowText)===job.sha256
      // AMENDMENT §4: the id already pins the build context; if the user changed the toolchain while
      // the job was in flight, RECORD that the current context differs (the compile itself was done
      // with the recorded context, which is what the job id attests to).
      let contextChanged=false
      try { const nowCtx=await leanBuildContext()
        contextChanged=JSON.stringify([nowCtx.engine,nowCtx.argv,nowCtx.searchPaths])!==JSON.stringify([(job.build||{}).engine,(job.build||{}).argv,(job.build||{}).searchPaths])
        if(contextChanged) logActivity('formal','作业 '+job.jobId+' 的结果属于记录中的构建上下文（engine/argv/search-paths 已被改动，未影响该次编译的结论）')
      } catch(e){ /* best effort */ }
      const ok=!!(run&&run.ok)&&hashMatch
      const timedOut=!!(run&&run.timedOut)
      const state=ok?'settled':(timedOut?'timeout':'failed')
      const settled=Object.assign({},job,{
        state, settledAt:now(), exitCode:(run&&run.exitCode===undefined?null:run.exitCode),
        timedOut, interrupted:false, hashMatch, contextChanged,
        run:{at:now(),ok,exitCode:(run&&run.exitCode===undefined?null:run.exitCode),ms:(run&&run.ms)||0,timedOut,interrupted:false,
             hashMatch,stdoutTail:tail((run&&run.stdout)||'',800),stderrTail:tail((run&&run.stderr)||'',800)},
      })
      if(ok&&job.kind==='proof'){
        // ★ ONLY here: a green run on UNCHANGED content mints the proof and flips the record.
        settled.verifiedRel='Verified/Lean/'+job.key+'.lean'
        await writeText(settled.verifiedRel,job.content)
        const prev=formalOf(job.key)
        await putFormal(job.key,Object.assign({},prev,{ status:'passed', file:job.rel, proof:settled.verifiedRel, decision:'used',
          note:prev.note||'', async:{jobId:job.jobId,state,attempts:settled.attempts,enqueuedAt:job.enqueuedAt,startedAt:job.startedAt,settledAt:settled.settledAt,exitCode:settled.exitCode},
          run:settled.run, updatedAt:now() }))
      } else {
        const prev=formalOf(job.key)
        if(job.kind==='proof'){
          await putFormal(job.key,Object.assign({},prev,{ status:prev.status==='passed'?'attempted':(prev.status==='blocked'?'blocked':'attempted'),
            file:job.rel, proof:prev.proof||'', decision:prev.decision||'used', note:prev.note||'',
            async:{jobId:job.jobId,state,attempts:settled.attempts,enqueuedAt:job.enqueuedAt,startedAt:job.startedAt,settledAt:settled.settledAt,exitCode:settled.exitCode},
            run:settled.run, updatedAt:now() }))
        } else if(job.kind==='run'&&job.target){
          // A plain run only touches the formal records when it was aimed at an OBJECT (exactly what
          // the synchronous path does: no target, no record). `passed`/`blocked` are preserved.
          await formalSetRun(job.target,Object.assign({},run,{ok,file:job.rel,timedOut,interrupted:false}))
          const cur=formalOf(job.target)
          await putFormal(job.target,Object.assign({},cur,{status:cur.status==='passed'?'passed':(cur.status==='blocked'?'blocked':'attempted'),
            async:{jobId:job.jobId,state,attempts:settled.attempts,enqueuedAt:job.enqueuedAt,startedAt:job.startedAt,settledAt:settled.settledAt,exitCode:settled.exitCode}}))
        }
      }
      await writeLeanJob(settled)
      try { await rebuildLeanLibIndexes() } catch(e){ /* best-effort */ }
      pushLeanNotice(settled,Object.assign({},run,{ok,hashMatch}))
      return settled
    }
    /** §2.2 + AMENDMENT §5: the drain. One pass starts up to `leanJobsMaxParallel` workers and
     *  returns IMMEDIATELY (a long compile must not block the heartbeat); each worker chains the
     *  next pass when it settles. A no-op pass costs one comparison + one array check. */
    async function runLeanQueue(){
      const cap=Math.max(1,Math.floor(Number(params.leanJobsMaxParallel))||LEAN_QUEUE_CONCURRENCY)
      let started=false
      while(leanInflight.length<cap&&leanQueue.length){
        const jobId=leanQueue.shift()
        const job=leanJobs[jobId]
        if(!job) continue
        const running=Object.assign({},job,{state:'running',startedAt:now()})
        leanInflight.push(running); await writeLeanJob(running)
        started=true
        ;(async()=>{
          let run
          // Compile the ABSOLUTE path recorded at enqueue time: a `def`/`lemma` lives under the
          // global `VibeMath/Formal/{Lib,Proved}` (beside the project tree), so the project-relative
          // form would resolve to a non-existent file and report V4_NOT_FOUND.
          try { run=await leanRunFile(String(running.abs||running.rel)) }
          catch(e){ run={ok:false,code:'LEAN_RUN_FAILED',message:String((e&&e.message)||e),file:running.rel} }
          leanInflight=leanInflight.filter(j=>j.jobId!==jobId)
          if(leanJobs[jobId]&&leanJobs[jobId].state==='interrupted') return   // dispose() already settled it
          await settleLeanJob(leanJobs[jobId]||running,run)
          runLeanQueue().catch(()=>{})   // keep the pipeline moving at the cap
        })()
      }
      return started
    }
    /** §2.5: dispose/abort terminates every in-flight compile and marks it interrupted — never `passed`. */
    async function disposeLean(){
      leanQueue=[]
      const jobs=leanInflight.slice()
      leanInflight=[]
      if(!jobs.length) return false
      for(const job of jobs){
        try { if(job.handle&&typeof job.handle.terminate==='function') job.handle.terminate() } catch(e){ /* best effort */ }
        const cur=leanJobs[job.jobId]||job
        const rec=Object.assign({},cur,{state:'interrupted',interrupted:true,settledAt:now(),
          run:Object.assign({},cur.run||{},{ok:false,interrupted:true,hashMatch:false})})
        await writeLeanJob(rec)
        if(rec.kind==='proof'&&rec.key){ const prev=formalOf(rec.key)
          await putFormal(rec.key,Object.assign({},prev,{status:prev.status==='passed'?'attempted':(prev.status||'attempted'),
            async:{jobId:rec.jobId,state:'interrupted',attempts:rec.attempts,enqueuedAt:rec.enqueuedAt,startedAt:rec.startedAt,settledAt:rec.settledAt,exitCode:null}})) }
        pushLeanNotice(rec,{ok:false,exitCode:null,ms:0})
      }
      return true
    }
    /**
     * §2.6 crash/restart recovery: scan `<project>/Formal/Jobs/*.json` AFTER the project dirs exist.
     * It NEVER mints a `passed` anything unless the job record itself says exitCode===0 AND the file
     * on disk still hashes to the enqueued content.
     */
    async function recoverLeanJobs(opts){
      const o=opts||{}
      const applySettled=o.applySettled!==false
      let files=[]
      try {
        const t=await fs.resolve(leanJobsRel(),{cwd:frameworkRoot()})
        if(await fs.stat(t)===undefined) return {scanned:0}
        files=await fs.listDir(t)
      } catch(e){ return {scanned:0} }
      let queued=0,redriven=0,stale=0,completed=0
      for(const f of files||[]){
        if(!f||f.type!=='file'||!/\.json$/.test(String(f.name))) continue
        const job=await readJson(leanJobsRel()+'/'+f.name)
        if(!job||!job.jobId||!job.rel) continue
        leanJobs[job.jobId]=job
        const sha=String(job.sha256||'')
        const text=await readTextAbs(job.abs||vibeRelAbs(job.rel))
        const hashMatch=text!==undefined&&sha256Text(text)===sha
        if(job.state==='queued'){ if(leanQueue.indexOf(job.jobId)<0) leanQueue.push(job.jobId); queued++; continue }
        if(job.state==='running'){
          if(hashMatch){
            await writeLeanJob(Object.assign({},job,{state:'queued',interrupted:true,attempts:(job.attempts||1)+1,run:Object.assign({},job.run||{},{ok:false,interrupted:true,hashMatch:true})}))
            if(leanQueue.indexOf(job.jobId)<0) leanQueue.push(job.jobId)
            if(job.kind==='proof'&&job.key){ const prev=formalOf(job.key)
              await putFormal(job.key,Object.assign({},prev,{status:prev.status==='passed'?'attempted':(prev.status||'attempted'),
                async:{jobId:job.jobId,state:'queued',attempts:(job.attempts||1)+1,enqueuedAt:job.enqueuedAt,startedAt:job.startedAt,settledAt:0,exitCode:null}})) }
            leanNotices.push('【形式化结果】'+job.jobId+'：崩溃/重启中断，已按新尝试次数重新入队（旧进程结果不可知，对象保持 attempted）')
            redriven++
          } else {
            await writeLeanJob(Object.assign({},job,{state:'interrupted',interrupted:true,settledAt:now(),run:Object.assign({},job.run||{},{ok:false,interrupted:true,hashMatch:false})}))
            if(job.kind==='proof'&&job.key){ const prev=formalOf(job.key)
              await putFormal(job.key,Object.assign({},prev,{status:'attempted',
                async:{jobId:job.jobId,state:'interrupted',attempts:job.attempts||1,enqueuedAt:job.enqueuedAt,startedAt:job.startedAt,settledAt:now(),exitCode:null}})) }
            leanNotices.push('【形式化结果】'+job.jobId+'：文件已变，请手动重跑（不自动重驱，避免把旧代码的结果贴到新代码上）')
            stale++
          }
          continue
        }
        if(job.state==='settled'&&job.kind==='proof'&&job.key&&applySettled){
          const rec=formalOf(job.key)
          const applied=rec.async&&rec.async.jobId===job.jobId&&rec.async.state==='settled'
          if(!applied&&job.exitCode===0&&hashMatch&&job.verifiedRel){
            await writeText(job.verifiedRel,job.content)
            await putFormal(job.key,Object.assign({},rec,{status:'passed',file:job.rel,proof:job.verifiedRel,decision:rec.decision||'used',
              async:{jobId:job.jobId,state:'settled',attempts:job.attempts||1,enqueuedAt:job.enqueuedAt,startedAt:job.startedAt,settledAt:job.settledAt,exitCode:0},
              run:job.run||rec.run,updatedAt:now()}))
            leanNotices.push('【形式化结果】'+job.jobId+'：按作业记录补齐（通过，已归档 '+job.verifiedRel+'）')
            completed++
          }
        }
      }
      if(queued+redriven+stale+completed){ await writeLeanLibIndexesSafe() ; if(leanQueue.length) armHeartbeat() }
      return {scanned:(files||[]).length,queued,redriven,stale,completed}
    }
    async function writeLeanLibIndexesSafe(){ try { await rebuildLeanLibIndexes() } catch(e){ /* best-effort */ } }
    /**
     * §1.2 `lean_read`: read ONE archived library file VERBATIM (for import-or-copy reuse).
     * Read-only; the path is confined to `<VibeMath>/Formal/{Lib,Proved}` — the sanitised `name`
     * cannot contain a separator, and the resolved path is re-checked against the root so a crafted
     * name can never escape (a `.lean` suffix is added, never accepted as a path).
     */
    async function leanRead(o){
      const args=o||{}
      const raw=String(args.name==null?'':args.name).trim()
      const kind=String(args.kind||'auto')
      if(!raw) return {ok:false,code:'V4_INVALID_ARGUMENT',message:'name is required'}
      if(raw.indexOf('/')>=0||raw.indexOf('\\')>=0||raw.indexOf('..')>=0) return {ok:false,code:'V4_INVALID_ARGUMENT',message:'name must be a bare library name (no path separators)'}
      if(['auto','lib','proved'].indexOf(kind)<0) return {ok:false,code:'V4_INVALID_ARGUMENT',message:"kind must be 'auto' | 'lib' | 'proved'"}
      const name=idSafe(raw).replace(/\.lean$/,'')
      if(!name||name==='id') return {ok:false,code:'V4_INVALID_ARGUMENT',message:'invalid name'}
      const cands=[]
      if(kind==='auto'||kind==='lib') cands.push({kind:'lib',rel:'Formal/Lib/'+name+'.lean',abs:formalLibRoot()+'/'+name+'.lean'})
      if(kind==='auto'||kind==='proved') cands.push({kind:'proved',rel:'Formal/Proved/'+name+'.lean',abs:formalProvedRoot()+'/'+name+'.lean'})
      const checked=[]
      for(const c of cands){
        const norm=normalizeAbsPath(c.abs)
        const root=normalizeAbsPath(vibeRoot())
        if(norm.indexOf(root+'/Formal/')!==0) return {ok:false,code:'V4_INVALID_ARGUMENT',message:'refused: resolves outside the VibeMath/Formal library'}
        checked.push(c)
      }
      const found=await (async()=>{
        for(const c of checked){ const t=(await readTextAbs(c.abs)); if(t!==undefined) return {c,t} }
        return null
      })()
      if(!found) return {ok:false,code:'V4_NOT_FOUND',message:'no archived library file named '+name+(kind==='auto'?' (checked Formal/Lib and Formal/Proved)':' in Formal/'+(kind==='lib'?'Lib':'Proved')),name,kind}
      const full=String(found.t)
      const bytes=(typeof TextEncoder==='function')?new TextEncoder().encode(full).length:full.length
      const truncated=bytes>LEAN_READ_MAX_BYTES
      const text=truncated?full.slice(0,LEAN_READ_MAX_BYTES):full
      return {ok:true,name,file:found.c.rel,kind:found.c.kind,sha256:sha256Text(full),bytes,text,truncated,
        hint:'复用：新文件里写 '+(found.c.kind==='lib'?'import Formal.Lib.':'import Formal.Proved.')+name+'（模块根=VibeMath 根，框架已把它加入编译搜索路径），或按上面的原文逐字复制。'}
    }

    /**
     * AMENDMENT §3: the read-only result/wait surface. Without `jobId` it lists THIS session's jobs;
     * with it, returns the job's state / exitCode / receipt path (`Formal/Jobs/<id>.json`) / archive
     * path. `waitMs>0` waits up to that many ms and then reports the CURRENT state (never blocks
     * forever, never throws).
     */
    const LEAN_JOB_TERMINAL=['settled','failed','timeout','interrupted']
    async function leanJobTool(o){
      const args=o||{}
      const jobId=String(args.jobId||'').trim()
      const waitMs=Math.max(0,Math.min(600000,Math.floor(Number(args.waitMs))||0))
      if(!jobId){
        const ids=Object.keys(leanJobs).sort()
        return {ok:true,count:ids.length,
          jobs:ids.map(k=>Object.assign(leanJobView(leanJobs[k]),{receipt:leanJobRel(k),archive:leanJobs[k].verifiedRel||'',timedOut:!!leanJobs[k].timedOut,interrupted:!!leanJobs[k].interrupted})),
          queued:leanQueue.slice(),running:leanInflight.map(j=>j.jobId),
          hint:'有 jobId 时用 vibe_v4_lean_job {jobId, waitMs} 取结果/等待（waitMs 超时只返回当前 state）。'}
      }
      let job=leanJobs[jobId]||await readLeanJob(jobId)
      if(job&&waitMs>0){
        const t0=now()
        while(LEAN_JOB_TERMINAL.indexOf(job.state)<0&&now()-t0<waitMs){ await leanSleep(25); job=leanJobs[jobId]||job }
      }
      if(!job) return {ok:false,code:'V4_NOT_FOUND',message:'no such job: '+jobId}
      return {ok:true,jobId,job:leanJobView(job),state:job.state,exitCode:(job.exitCode===undefined?null:job.exitCode),
        rel:job.rel,receipt:leanJobRel(jobId),archive:job.verifiedRel||'',target:job.target||'',key:job.key||'',
        timedOut:!!job.timedOut,interrupted:!!job.interrupted,attempts:job.attempts||1,settledAt:job.settledAt||0,
        build:job.build||null,buildHash:job.buildHash||'',sha256:job.sha256||'',
        run:job.run||null,
        hint:LEAN_JOB_TERMINAL.indexOf(job.state)>=0?'（已终态）':'（仍在队列/编译中；可用 waitMs 再等，或等下一轮【形式化结果】公告）'}
    }

    function formalModeWord(){ return formalMode()==='require'?'强制':'鼓励' }
    /**
     * The verification-prompt block. Every branch is computed from the CURRENT mode and the
     * object's CURRENT record at call time (spec §6.1). In particular the `passed` branch is
     * what makes the feature worthwhile: it tells the voter that re-deriving is NOT the job.
     */
    function formalPromptBlock(target){
      if(!formalOn()) return ''
      const rec=target?formalOf(target):{status:'none'}
      const L=[]
      L.push('【Lean 形式化验证（'+formalModeWord()+'模式）】')
      if(rec.status==='passed'){
        L.push('  · 该对象已有**通过的 Lean 形式化证明**（'+(rec.proof||rec.file||'')+'，最近运行 exit 0）。')
        L.push('    **你不需要重新检查推导**。你的任务是**忠实性审查**：逐条核对 Lean 代码里的')
        L.push('    定义 / 对象 / 条件 / 假设 / 结论是否与命题原文**完全一致**。')
        L.push('  ▸ 一致 → verdict = 1。')
        L.push('  ▸ **发现任何偏差，不要投 0**：偏差只说明**形式化不合格**，不代表命题为假。此时请：')
        L.push("      ① verdict 给一个严格介于 0 与 1 之间的值（记为弃权），并在 reason 里写清偏差；")
        L.push("      ② 用回执 formal:{decision:'defect', note:'<具体偏差>'} 记录它。框架会撤回这条证明的")
        // Only `require` actually GATES the conclusion. In `encourage` the framework still
        // withdraws the proof (and records the defect + TODO), but it CANNOT hold the ballot —
        // promising "本次裁定不定论" there would promise behaviour the framework does not have
        // (docs §4.1-3/§6.1); the voter's own abstention is what keeps the ballot from concluding.
        L.push('         「已通过」状态（降级为 attempted、删除归档证明、写入形式化待办）'
          +(formalMode()==='require'
            ?'，本次裁定**不定论**；'
            :'；本档没有门禁：请务必给弃权值，以保证本轮无法得出一致结论；'))
        L.push('         修正形式化并重新跑通后再投票。')
        L.push('  ▸ 只有当你**独立于这份 Lean 代码**也能确定命题为假时，才投 0，并在 reason 里写清独立理由。')
      } else if(rec.status==='blocked'){
        L.push('  · 该对象已被记录为**形式化阻塞**：'+(rec.note||'未说明')+'。')
        L.push('    请复核这个判断是否成立；若你认为其实可以形式化，请指出来并动手做。')
        L.push('  ▸ 因此请把 verdict 用在"这个阻塞判断是否成立 / 是否仍有别的形式化路线"上，并给出理由。')
      } else {
        L.push('  · 请先判断该对象的**实现难度**：若能在可接受的工作量内形式化，优先写 Lean 代码并执行。')
        // lean-incremental-async spec §5 B (verbatim, after the implementation-difficulty line).
        L.push('  · 形式化只写你有把握的版本；没把握就记 blocked 并写清难点——不要用形式化掩盖不确定。')
        L.push('  · 该对象若已有后台编译在队列中，**不得**在它落地前声称已通过或走忠实性审查；等 vibe_v4_lean_lib 显示 passed 再审。')
        L.push('  · 工具：vibe_v4_lean_run（执行/入队）· vibe_v4_lean_archive（归档）· vibe_v4_lean_lib（查已有可复用库与 jobs）· vibe_v4_lean_read（读归档原文逐字复用）')
        L.push('  · 工作目录：Formal/（相对项目根）；可复用定义放 '+formalLibRoot().replace(/\\/g,'/')+'/，已证引理放 '+formalProvedRoot().replace(/\\/g,'/')+'/；写之前先 vibe_v4_lean_lib 查重。复用已归档内容：`import Formal.Lib.<name>` / `import Formal.Proved.<name>`（模块根 = VibeMath 根，框架已加入编译搜索路径）。项目工作文件 Formal/<对象 id>.lean 只是归档用，**不是**模块路径，不要 import 它。')
        L.push('  · **一旦 Lean 通过，你唯一需要确认的就是忠实性**：定义/对象/条件/假设/结论是否与命题原文逐条一致。请把注意力放在这种核对上，而不是重新做一遍推导。')
        if(formalMode()==='require'){
          L.push("  · **本模式要求**：必须产出 Lean 形式化，或**必须**给出显式的阻塞原因（vibe_v4_lean_archive kind='blocked' note=… 或回执 formal.note）。若两者都没有，本次裁定不会生效，会被记为未定论（原因 formal-required）并进入「形式化待办」。")
        } else {
          L.push("  · 若你判断不值得或无法形式化，可以不做，但请在回执的 formal 字段写明难度判断（decision='blocked' 时必须写明 note）。")
        }
        L.push('  · 归档可复用定义/引理前先跑通（vibe_v4_lean_archive run=true 或先 vibe_v4_lean_run）；跑不通不要入库。')
        L.push('  · 宿主没有 Lean 工具链（LEAN_NOT_FOUND）或根本没有 subprocess 服务（NO_SUBPROCESS）时：把代码写下来归档，并在回执的 note 里写明"宿主无 Lean 工具链"——这两种都算显式阻塞原因，定论门禁可以据此放行。')
        if(rec.status==='attempted'){
          L.push('  ▸ 该对象已有形式化尝试但尚未通过（最近一次 '+(rec.run?(rec.run.ok?'通过':'未通过'):'无运行记录')+'）。')
          L.push("    请修复后重跑（vibe_v4_lean_run），跑通后用 kind='proof' 归档。")
        } else {
          L.push("  ▸ 若你在本轮把它形式化并跑通（vibe_v4_lean_archive kind='proof'），后续轮次的")
          L.push('    审查对象就会从"推导是否正确"变成"Lean 代码是否忠实于命题"。')
        }
      }
      return L.join('\n')
    }
    /** `leanInitiative` (v5-aligned): how EAGER the group is about formalizing while working. It is a
     *  SEPARATE axis from `formalVerify` — see `leanDailyOn` below. */
    const leanInitiative=()=>(['off','normal','eager'].indexOf(String(params.leanInitiative))!==-1?String(params.leanInitiative):'normal')
    /** The DAILY line is injected when the group should formalize while working: any non-'off'
     *  initiative with `formalVerify` on, OR explicitly `eager` — which asks for it even when
     *  `formalVerify:'off'`, because the two knobs are independent (v5 uses the exact same rule).
     *  'off' never injects the daily line; the VERIFICATION prompt still follows `formalVerify`. */
    const leanDailyOn=()=>leanInitiative()!=='off'&&(formalOn()||leanInitiative()==='eager')
    /** The ordinary-work-round line (spec §6.2): formalize reusable objects as you go. Carries the
     *  three selection criteria, the blocked-instead-of-guessing rule, the look-up-first reuse path
     *  and the background-compile rule (lean-incremental-async spec §5 A, verbatim). */
    function formalWorkLine(){
      if(!leanDailyOn()) return ''
      // v5-aligned header: with `formalVerify:'off'` the mode word would be misleading, so the eager
      // 档 names itself instead.
      return '【顺手形式化（'+(formalOn()?formalModeWord():'主动（leanInitiative=eager）')+'）】把你工作中常用或可能复用的对象、假设、新定义，'
        +"用 Lean 形式化定义并归档到全局可复用库（vibe_v4_lean_archive kind='def'），已成立的引理归到 Formal/Proved/"
        +"（kind='lemma'）；写之前先 vibe_v4_lean_lib 查重，避免重复定义。"
        +'\n  · 判断标准：① 有价值或可能复用；② 较为关键或必要；③ 你对该陈述有把握（置信度高）。**没把握的先别入库**——'
        +'\n    进了 Formal/Proved 的东西会被当成已核对引理；没把握就记 blocked 并写清难点，别用形式化掩盖不确定。'
        +'\n  · 复用优先：写新定义/证明前**先 vibe_v4_lean_lib 查已有库**；复用已归档内容用'
        +'\n    `import Formal.Lib.<name>` / `import Formal.Proved.<name>`（模块根 = VibeMath 根，框架已把它加进编译搜索路径），'
        +'\n    或 `vibe_v4_lean_read {name}` 取原文逐字复制。**查不到再新写**；同内容重复归档会自动去重。'
        +'\n  · 编译默认走后台队列（leanAsync=true）：入队后你可以继续工作；用 vibe_v4_lean_lib 的 jobs 字段或下一轮提示里的'
        +'\n    【形式化结果】行看结果。**在作业落地为"通过"之前，不得把该对象当成已通过。**'
        +(formalMode()==='require'
          ? '本模式下，任何要定论为真/假的对象都必须先有 Lean 通过或显式阻塞记录。'
          : '这会让后续的验证与证明省掉大量重复工作。')
        // AMENDMENT §1: only `leanInitiative='eager'` asks for MORE proactivity than the normal line.
        // `formalVerify` is deliberately NOT consulted here: it expresses the verification-time
        // requirement, not how eagerly the group should formalize while working.
        +(leanInitiative()==='eager'
          ? '\n  · 本档（leanInitiative=eager）：工作中出现**有价值且你有把握**的小引理 / 小命题 / 小定义时，**主动**顺手形式化并归档，不必等到验证轮；把握不足就照上面的判据记 blocked。'
          : '')
        +'归档前先跑通（vibe_v4_lean_run 或 run=true）；跑不通的定义不要进可复用库。'
    }
    // ================= math_computation availability line (P1) =================
    // The line is DYNAMIC (it comes from the module's probe cache) while the resident prompts are
    // built by BOTH sync and async builders, so the two language variants are cached here and
    // refreshed from the async paths (start / resume / set / heartbeat) — a sync builder re-uses the
    // last known line and kicks off a refresh when the cache is still cold. `mathComputation:'off'`
    // is a true no-op: no probe, no line, nothing injected.
    let mathAvailZh='', mathAvailEn='', mathAvailBusy=false
    async function refreshMathAvailability(){
      if(params.mathComputation==='off'){ mathAvailZh=''; mathAvailEn=''; return }
      if(mathAvailBusy) return
      mathAvailBusy=true
      try {
        // Use THIS session's cached module instance (keyed by `mathProbeHost`): the probe cache lives
        // in the instance, so repeated refreshes cost nothing, and two sessions never share it.
        const inst=mathInstanceFor(mathProbeHost)
        const probe=inst?await inst.probe():await probeMathEngines(mathProbeHost)
        // The third argument is the MODE: the module drops the shell-fallback sentence in 'typed'
        // (prompts.md §4 consistency check 5) — the preset must not re-add it.
        mathAvailZh=mathAvailabilityLine(probe,'zh',params.mathMode)
        mathAvailEn=mathAvailabilityLine(probe,'en',params.mathMode)
        // The availability line is REQUIRED to carry the rule lines (prompts.md §2/§4). Referencing
        // both rule constants here is the drift check: if the module ever stops appending them, this
        // preset notices instead of shipping an availability line without the rules.
        if(mathAvailZh.indexOf(MATH_RULE_LINES[0])===-1||mathAvailEn.indexOf(MATH_RULE_LINES_EN[0])===-1){
          logActivity('math','警告：mathAvailabilityLine 未附带规则段（MATH_RULE_LINES/_EN），提示词可能缺少用法规则')
        }
        // P2a: the archive→edit→re-run workflow rule is part of the same contract (an old receipt is
        // NOT evidence for edited code). It is appended to the availability line by the module and to
        // both persona blocks by this preset — this is the drift check for the former.
        if(mathAvailZh.indexOf(MATH_ARCHIVE_WORKFLOW_LINE.trim())===-1||mathAvailEn.indexOf(MATH_ARCHIVE_WORKFLOW_LINE_EN.trim())===-1){
          logActivity('math','警告：mathAvailabilityLine 未附带归档工作流规则（MATH_ARCHIVE_WORKFLOW_LINE/_EN）')
        // round-6 A: substitution honesty is part of the same contract (an alternative that weakens
        // exactness must be declared). It is appended to the availability line by the module.
        if(mathAvailZh.indexOf(MATH_SUBSTITUTION_RULE_LINE.trim())===-1||mathAvailEn.indexOf(MATH_SUBSTITUTION_RULE_LINE_EN.trim())===-1){
          logActivity('math','警告：mathAvailabilityLine 未附带替代诚实性规则（MATH_SUBSTITUTION_RULE_LINE/_EN）')
        }
        }
      } catch(e){ /* a probe failure must never break a prompt; keep the last known line */ }
      finally { mathAvailBusy=false }
    }
    /** The availability + rules block: the frozen persona tool line (tools/params shape) followed by
     *  the dynamic zh + en availability lines. v4's prompts are bilingual (English frame, Chinese
     *  rules), so both variants are injected; `mathComputation:'off'` yields '' (a true no-op). */
    function mathAvailabilityBlock(){
      if(params.mathComputation==='off') return ''
      if(!mathAvailZh&&!mathAvailEn){ refreshMathAvailability().catch(()=>{}); return '' }
      return [MATH_PERSONA_TOOL_LINE, mathAvailZh, mathAvailEn].filter(Boolean).join('\n')
    }
    /** The `formal` object every non-off prompt documents in its JSON reply contract. */
    function formalReplyField(target){
      return '{"formal":{"target":"'+String(target||'p-x')+'","decision":"used|blocked|defect","file":"Formal/'+String(target||'p-x')+'.lean","note":"难度判断/阻塞原因/具体偏差"}}'
    }

    // ---- the three indexes (framework-maintained) ---------------------------
    async function writeFormalIndex(){
      const recs=formalRecords()
      const L=['# Lean 形式化索引｜'+currentProject+'｜'+fmtTime(),'',
        '> 本文件由框架维护（工具调用时更新；`vibe_v4_lean_lib` 会重建）。权威状态在 `State/formal.json`。','',
        '| 对象 | 状态 | 形式化文件 | 归档证明 | 最近运行 | 难度判断 / 阻塞原因 |','|---|---|---|---|---|---|']
      const keys=Object.keys(recs)
      if(!keys.length) L.push('| （暂无） | | | | | |')
      for(const k of keys){
        const r=recs[k]||{}
        L.push('| '+k+' | '+(r.status||'none')+' | '+(r.file||'—')+' | '+(r.proof||'—')+' | '+runLine(r.run)+' | '+String(r.note||'—').replace(/\|/g,'/').slice(0,120)+' |')
      }
      L.push('')
      if(formalTodo().length){
        L.push('## 形式化待办（require 模式：定论被搁置）')
        for(const t of formalTodo()) L.push('- '+t.id+' —— '+(t.why||'formal-required')+'（'+fmtTime(t.at)+'）')
        L.push('')
      }
      await writeText('Formal/Index.md',L.join('\n'))
    }
    async function writeFormalTodo(){
      const L=['# 形式化待办｜'+currentProject+'｜'+fmtTime(),'',
        '> 这些对象在 `require` 模式下尚不具备「Lean 已通过」或「显式阻塞记录」，因此**定论被搁置**。',
        "> 完成形式化（vibe_v4_lean_archive kind='proof'）或记录阻塞原因（kind='blocked'）后，重新提议验证即可。",'']
      const list=formalTodo()
      if(!list.length) L.push('（暂无）')
      for(const t of list) L.push('- '+t.id+'｜'+(t.why||'formal-required')+'｜'+fmtTime(t.at))
      L.push('')
      await writeText('Formal/TODO.md',L.join('\n'))
    }
    /**
     * Scan and rebuild the three indexes. Listing is deliberately CHEAP and side-effect free:
     * it does NOT execute the toolchain (running Lean on every library file each time an agent
     * asks "what can I reuse?" would be slow and surprising). Per-object run results live in
     * the object records and are shown in Formal/Index.md.
     */
    async function rebuildLeanLibIndexes(){
      const scan=async(dirAbs,dirRel,kindLabel)=>{
        const rows=[]
        try {
          const t=await fs.resolve(dirAbs)
          if(await fs.stat(t)===undefined) return rows
          const entries=await fs.listDir(t)
          for(const e of entries||[]){
            if(!e||e.type!=='file'||!/\.lean$/.test(String(e.name))) continue
            const rel=dirRel+'/'+e.name
            const txt=(await readTextAbs(dirAbs+'/'+e.name))||''
            const name=String(e.name).replace(/\.lean$/,'')
            const first=(txt.split('\n').filter(l=>l.trim()&&!/^\s*(\/\/|--|import)/.test(l))[0]||'').trim().slice(0,110)
            // §4.4: the dependency column v3 already has — one entry per `import` line, so a reader
            // can see what a reusable file pulls in (and therefore what must travel with it).
            const deps=(txt.match(/^\s*import\s+[^\s]+/gm)||[]).map(l=>l.replace(/^\s*import\s+/,'').trim()).filter(Boolean)
            rows.push('| '+name+' | '+rel+' | '+kindLabel+' | '+(deps.length?deps.join(', ').replace(/\|/g,'/'):'—')+' | '+first.replace(/\|/g,'/')+' |')
          }
        } catch(e){ /* listing is best-effort */ }
        return rows
      }
      const libRows=await scan(formalLibRoot(),'Formal/Lib','def')
      await writeTextAbs(formalLibRoot()+'/Index.md',['# 可复用 Lean 定义库（跨项目）｜'+currentProject,'',
        '> 写新定义之前先查这里：能复用就不要重新定义。复用方式：`import Formal.Lib.<名称>`（模块根 = VibeMath 根，框架已加入编译搜索路径），或用 vibe_v4_lean_read 取原文逐字复制。','',
        '| 名称 | 文件 | 类别 | 依赖 | 摘要 |','|---|---|---|---|---|']
        .concat(libRows.length?libRows:['| （暂无） | | | | |']).join('\n')+'\n')
      const provedRows=await scan(formalProvedRoot(),'Formal/Proved','lemma')
      await writeTextAbs(formalProvedRoot()+'/Index.md',['# 已成立的 Lean 命题 / 引理（机器已核对，可跨项目复用）｜'+currentProject,'',
        '> 这些文件是通过内核检查的引理，可直接 `import Formal.Proved.<名称>` 复用（模块根 = VibeMath 根）。','',
        '| 名称 | 文件 | 类别 | 依赖 | 陈述 |','|---|---|---|---|---|']
        .concat(provedRows.length?provedRows:['| （暂无） | | | | |']).join('\n')+'\n')
      await writeFormalIndex()
      await writeFormalTodo()
      return {lib:libRows.length,proved:provedRows.length,objects:Object.keys(formalRecords()).length}
    }

    /**
     * Execute one Lean file through the toolchain, record the run (optionally against an
     * object), refresh the index, and report the outcome verbatim. Deliberately callable even
     * from `off` mode: a human debugging their toolchain may want it, and registration is
     * static while the MODE only decides whether the framework TELLS members about it.
     */
    async function leanRunTool(memberId,o){
      const args=o||{}
      const rel=String(args.file||'')
      // §2.3 (leanAsync=true, the default): ENQUEUE and return immediately — the member keeps
      // working; the result lands in Formal/ + the indexes and is announced in the next prompt.
      if(LEAN_ASYNC_ON()){
        const abs=leanAbsPath(rel)
        if(abs===null||!/\.lean$/.test(abs)) return {ok:false,code:'V4_INVALID_ARGUMENT',message:'Lean file must live under '+vibeRoot().replace(/\\/g,'/')+'/ and end in .lean (got '+rel+')',file:rel}
        const content=await readTextAbs(abs)
        if(content===undefined) return {ok:false,code:'V4_NOT_FOUND',message:'no such file: '+rel,file:rel}
        const target=String(args.target||'').trim()
        const key=formalKey(target||rel.replace(/\.lean$/,''))
        const q=await enqueueLeanJob({kind:'run',key,target,rel,abs,content,via:memberId||'host'})
        if(q.duplicate) return {ok:true,async:leanJobView(q.job),jobId:q.job.jobId,file:rel,mode:formalMode(),
          message:'同一内容已在队列/已归档（'+q.job.state+'），未重复入队；用 vibe_v4_lean_lib 的 jobs 查看，或用 lean_read 取原文。'}
        logActivity('formal',(memberId||'host')+' vibe_v4_lean_run '+rel+' → 已入队 '+q.job.jobId)
        return {ok:true,async:{jobId:q.job.jobId,state:'queued'},jobId:q.job.jobId,file:rel,mode:formalMode(),
          message:'已入队后台编译；你可以继续工作。结果会写入 Formal/ 与索引，并在下一轮提示里公告；也可用 vibe_v4_lean_lib 的 jobs 字段随时查看。'}
      }
      const run=await leanRunFile(rel,args.timeout_ms)
      try {
        if(run.ok||run.file){
          if(String(args.target||'').trim()) formalSetRun(String(args.target),run)
          await writeFormalIndex()
        }
      } catch(e){ /* the index is best-effort; a run result must always come back */ }
      // The activity log is part of the injected-text surface (a host reads it out of
      // vibe_v4_report, and residents may be quoted it): use the REGISTERED tool name, never the
      // bare `lean_run` abbreviation (docs §6 hard requirement 1).
      logActivity('formal',(memberId||'host')+' vibe_v4_lean_run '+(run.file||String(args.file||''))+' → '+(run.ok?'通过':(run.code||'未通过')))
      return Object.assign({ok:!!run.ok},run,{
        // `leanAsync=false`: the historical shape, plus an explicit `async:null` so a caller can
        // tell "synchronous result" from "queued job" without guessing.
        async:null, jobId:null,
        mode:formalMode(),
        hint: run.ok
          ? "通过。若是某个对象的证明，请用 vibe_v4_lean_archive kind='proof' 归档（会写入 Verified/Lean/ 并把审查对象变成忠实性）；若是可复用定义/引理，用 kind='def'/'lemma' 归档到全局库——归档前先跑通（run=true 或先 vibe_v4_lean_run）：跑不通的定义不要进可复用库。"
          : '未通过。请按上面的编译器输出修复后重跑；若判断无法完成，用 vibe_v4_lean_archive kind=\'blocked\' 记录原因。',
      })
    }
    /**
     * One tool, three archives (spec §5.2).
     *   def/lemma → the GLOBAL cross-project library (Formal/Lib, Formal/Proved)
     *   proof     → the project working file Formal/<target>.lean, plus Verified/Lean/<target>.lean
     *               when the run is GREEN (and only then is the object `passed`)
     *   blocked   → an explicit, reasoned "we judged this infeasible" record (note REQUIRED)
     */
    async function leanArchive(memberId,o){
      const args=o||{}
      const kind=String(args.kind||'')
      const content=typeof args.content==='string'?args.content:undefined
      const from=args.from?String(args.from):''
      const bodyFrom=async()=>{
        if(content!==undefined) return {body:content}
        if(from){
          const srcAbs=leanAbsPath(from)
          if(srcAbs===null) return {error:{ok:false,code:'V4_INVALID_ARGUMENT',message:'from must be a .lean file inside the workspace (got '+from+')'}}
          const body=await readTextAbs(srcAbs)
          if(body===undefined) return {error:{ok:false,code:'V4_NOT_FOUND',message:'no such file: '+from}}
          return {body}
        }
        return {error:{ok:false,code:'V4_INVALID_ARGUMENT',message:'provide content, or from=<existing .lean file>'}}
      }
      if(kind==='def'||kind==='lemma'){
        const name=idSafe(String(args.name||''))
        if(!name||name==='id') return {ok:false,code:'V4_INVALID_ARGUMENT',message:'name is required for a reusable definition/lemma'}
        const got=await bodyFrom(); if(got.error) return got.error
        const rel='Formal/'+(kind==='def'?'Lib':'Proved')+'/'+name+'.lean'
        const abs=vibeRelAbs(rel)
        const sha=sha256Text(got.body)
        // AMENDMENT §4: de-duplication keys on the WHOLE build context (content + engine + argv +
        // search paths), so identical content compiled by a different toolchain is a NEW job.
        const jidFor=await leanJobIdFor(name,got.body)
        const jobId=jidFor.jobId
        // §4.3: the SAME content that already compiled green is a no-op — no rewrite, no recompile.
        const prior=leanJobs[jobId]
        if(prior&&prior.state==='settled'&&prior.run&&prior.run.ok&&sha256Text((await readTextAbs(abs))||'')===sha){
          logActivity('formal',String(memberId||'host')+' 归档'+kind+' '+name+' → 去重（内容与已归档版本一致）')
          return {ok:true,kind,name,file:rel,deduped:true,sha256:sha,jobId,async:leanJobView(prior),run:prior.run,
            note:'内容与已归档版本一致，跳过重写与重编译'}
        }
        if(!await writeTextAbs(abs,got.body)) return {ok:false,code:'V4_WRITE_FAILED',message:'could not write '+rel}
        if(LEAN_ASYNC_ON()){
          const q=await enqueueLeanJob({kind,key:name,name,rel,abs,content:got.body,sha256:sha,ctx:jidFor.ctx,via:memberId||'host'})
          logActivity('formal',String(memberId||'host')+' 归档'+(kind==='def'?'可复用定义':'已证引理')+' '+name+' → '+rel+'（已入队 '+(q.job&&q.job.jobId||jobId)+'）')
          return {ok:true,kind,name,file:rel,sha256:sha,jobId:(q.job&&q.job.jobId)||jobId,
            async:{jobId:(q.job&&q.job.jobId)||jobId,state:q.duplicate?'queued':'queued'},run:undefined,
            note:'已并入全局可复用库并**入队后台编译**：通过前不要在别处把它当作已核对引理；结果见 vibe_v4_lean_lib.jobs 与下一轮【形式化结果】行'}
        }
        // The global library sits BESIDE the project tree, so it must be executed through its
        // ABSOLUTE path — the project-relative form would resolve inside frameworkRoot.
        const run=args.run===false?null:await leanRunFile(abs)
        try { await rebuildLeanLibIndexes() } catch(e){ /* index rebuild is best-effort */ }
        logActivity('formal',String(memberId||'host')+' 归档'+(kind==='def'?'可复用定义':'已证引理')+' '+name+' → '+rel+(run?('（运行 '+(run.ok?'通过':'未通过')+'）'):''))
        return {ok:true,kind,name,file:rel,deduped:false,sha256:sha,async:null,run:run||undefined,note:'已并入全局可复用库，后续项目可直接 import 复用'}
      }
      if(kind==='proof'){
        const key=formalKey(String(args.target||''))
        if(!key) return {ok:false,code:'V4_INVALID_ARGUMENT',message:'target is required for kind=proof'}
        const got=await bodyFrom(); if(got.error) return got.error
        const workRel='Formal/'+key+'.lean'
        const sha=sha256Text(got.body)
        const jidFor=await leanJobIdFor(key,got.body)
        // §4.3 (proof variant): identical content + the object is ALREADY `passed` and the archived
        // proof still hashes the same ⇒ nothing to do.
        const prevRec=formalOf(key)
        if(prevRec.status==='passed'&&sha256Text((await readText('Verified/Lean/'+key+'.lean'))||'')===sha){
          logActivity('formal',String(memberId||'host')+' 归档证明 '+key+' → 去重（对象已 passed 且归档内容一致）')
          return {ok:true,kind,target:key,file:workRel,proof:prevRec.proof,passed:true,deduped:true,sha256:sha,async:leanJobView(leanJobs[jidFor.jobId])||null,status:prevRec.status}
        }
        if(!await writeText(workRel,got.body)) return {ok:false,code:'V4_WRITE_FAILED',message:'could not write '+workRel}
        if(LEAN_ASYNC_ON()){
          const q=await enqueueLeanJob({kind:'proof',key,target:key,rel:workRel,abs:leanAbsPath(workRel),content:got.body,sha256:sha,ctx:jidFor.ctx,via:memberId||'host'})
          const jid=(q.job&&q.job.jobId)||jidFor.jobId
          logActivity('formal',String(memberId||'host')+' 为 '+key+' 归档形式化证明 '+workRel+'（已入队 '+jid+'；通过前不改 passed）')
          return {ok:true,kind,target:key,file:workRel,sha256:sha,jobId:jid,
            async:{jobId:jid,state:'queued'},run:undefined,
            note:'证明已入队后台编译：**只有作业落地为通过**才会写入 Verified/Lean/'+key+'.lean 并把对象置 passed；其余情况保持 attempted，见 vibe_v4_lean_lib.jobs'}
        }
        const run=await leanRunFile(workRel)
        const prev=formalOf(key)
        const passed=!!run.ok
        const rec=Object.assign({},prev,{
          status:passed?'passed':'attempted',
          file:workRel,
          proof:passed?('Verified/Lean/'+key+'.lean'):(prev.proof||''),
          decision:'used',
          note:String(args.note||prev.note||''),
          run:{at:now(),ok:!!run.ok,exitCode:run.exitCode===undefined?null:run.exitCode,ms:run.ms||0,stdoutTail:tail(run.stdout,800),stderrTail:tail(run.stderr,800)},
          updatedAt:now(),
        })
        // ★ `passed` requires a green run: the proof is only copied into Verified/Lean/ when the
        // kernel actually accepted it. A red run still records the working file (so the agent
        // can iterate) but must not mint a proof.
        if(passed) await writeText('Verified/Lean/'+key+'.lean',got.body)
        await putFormal(key,rec)
        try { await rebuildLeanLibIndexes() } catch(e){ /* best-effort */ }
        logActivity('formal',String(memberId||'host')+' 为 '+key+' 归档形式化证明 '+workRel+(passed?'（**通过**，已归档到 '+rec.proof+'，验证转为忠实性审查）':'（**未通过**：'+tail(run.stderr||run.message,160)+'）'))
        return {ok:true,kind,target:key,file:workRel,proof:rec.proof,passed,run,status:rec.status,deduped:false,sha256:sha,async:null}
      }
      if(kind==='blocked'){
        const key=formalKey(String(args.target||''))
        if(!key) return {ok:false,code:'V4_INVALID_ARGUMENT',message:'target is required for kind=blocked'}
        const note=String(args.note||'').trim()
        // "决定权在代理，但决定必须显式、可审计" — an empty note would make the escape hatch
        // indistinguishable from silently skipping formalization, so it is refused outright.
        if(!note) return {ok:false,code:'V4_INVALID_ARGUMENT',message:'阻塞记录必须写明原因（note）——"因难度决定不做形式化"必须显式、可审计'}
        const prev=formalOf(key)
        const rec=Object.assign({},prev,{status:'blocked',decision:'blocked',note,updatedAt:now()})
        await putFormal(key,rec)
        try { await rebuildLeanLibIndexes() } catch(e){ /* best-effort */ }
        logActivity('formal',String(memberId||'host')+' 记录 '+key+' 形式化阻塞：'+note)
        return {ok:true,kind,target:key,status:'blocked',note}
      }
      return {ok:false,code:'V4_INVALID_ARGUMENT',message:"kind must be 'def' | 'lemma' | 'proof' | 'blocked'"}
    }
    /**
     * Withdraw an archived proof (spec §4.1). The RECORD is authoritative, but the FILE must not
     * survive at the exact path everyone looks for "this object's proof": a host whose shell
     * cannot delete (no `subprocess`, a stub shell that exits 0 without removing anything, a
     * permission quirk) would otherwise leave the retracted proof readable as the object's proof
     * while the record already says `attempted`. So the withdrawal is: delete → CONFIRM through
     * the fs service that it is really gone → if it still exists, OVERWRITE it with an explicit
     * withdrawal notice. Returns WHICH path it took ({ok,how:'deleted'|'overwritten'|'failed'})
     * so the caller/activity log can say so out loud instead of reporting a best-effort delete as
     * done. Every path goes through `leanAbsPath`, so this can only ever touch a `.lean` file
     * inside the VibeMath root (a hand-edited State/formal.json must not become an arbitrary-file
     * delete).
     */
    async function withdrawProof(rel){
      const raw=String(rel==null?'':rel)
      if(!raw) return {ok:false,how:'failed',skipped:true}
      const abs=leanAbsPath(raw)
      if(abs===null||!/\.lean$/.test(abs)){
        logActivity('formal','拒绝删除越界的归档证明路径：'+raw)
        return {ok:false,how:'failed',skipped:true}
      }
      const sub=subprocessOf()
      if(sub!==undefined&&typeof sub.spawn==='function'){
        const r=await runShell(rmCmd([abs]),vibeRoot())
        // Exit 0 is NOT proof of deletion: confirm through the fs service before believing it.
        if(r&&r.ok&&await readTextAbs(abs)===undefined) return {ok:true,how:'deleted',abs}
      }
      // Fallback: make the file impossible to read as this object's proof any more. The withdrawn
      // code itself is NOT lost — it stays in the working file Formal/<id>.lean.
      const notice='-- 已撤回（'+fmtTime()+'）：该形式化被认定与命题原文不一致。\n'
        +'-- 原代码保留在工作文件 Formal/'+String(raw).split('/').pop()+'；修正并重新跑通后重新归档。\n'
      if(await writeTextAbs(abs,notice)) return {ok:true,how:'overwritten',abs}
      return {ok:false,how:'failed',abs}
    }
    /**
     * §4.1 `defect`: a voter checked the Lean code against the proposition and found a FIDELITY
     * defect (written too narrow/wide, wrong object, missing hypothesis). That is a statement about
     * the FORMALIZATION, not about the proposition, so it must never be absorbed as "the
     * proposition is false". The record is therefore ALWAYS downgraded to `attempted` (even from
     * `blocked`), `proof` is cleared, `Verified/Lean/<id>.lean` is withdrawn, the deviation goes
     * into the record + Formal/Index.md + Formal/TODO.md, and the group is told in the activity
     * log. The working file `Formal/<id>.lean` is deliberately KEPT — the code is not lost, only
     * its "passed" claim. In `require` mode the downgrade also makes `formalGateOk` false, so the
     * verdict defers through the existing `deferForFormal` path (no Verified card, TODO entry).
     */
    async function recordFormalDefect(rId,key,note){
      const prev=formalOf(key)
      const proofRel=String(prev.proof||'')||('Verified/Lean/'+key+'.lean')
      const rec=Object.assign({},prev,{status:'attempted',proof:'',decision:'defect',note,updatedAt:now()})
      const why='formal-defect：形式化与命题原文不一致——'+String(note).slice(0,160)
      const todo=formalTodo().slice()
      const i=todo.findIndex(t=>t&&t.id===key)
      // The defect reason must survive the later `deferForFormal`, which keeps an EXISTING entry
      // rather than overwriting it — so the TODO file explains "formalization不合格", not merely
      // "formal-required". An already-deferred object keeps its original 真/假 tally here.
      if(i>=0) todo[i]=Object.assign({},todo[i],{why,at:now()})
      else todo.push({id:key,at:now(),why,verdict:null})
      // Durable write FIRST (record + todo together), then withdraw the file: a crash in between
      // leaves an orphaned file with a truthful record, never a record still claiming `passed`.
      await putFormal(key,rec,todo)
      const del=await withdrawProof(proofRel)
      const how=del&&del.how==='deleted'?'删除归档证明 '+proofRel
        :del&&del.how==='overwritten'?'覆盖归档证明 '+proofRel+'（宿主无法删除，已写入撤回说明，原证明内容不再可读）'
        :'⚠ 归档证明 '+proofRel+' 未能撤回（删除与覆盖均失败）——它仍停留在"该对象的证明"的位置，请不要把它当作该对象的证明'
      try { await writeFormalTodo(); await writeFormalIndex() } catch(e){ /* best-effort */ }
      // The activity log is agent/host-readable, so the same §4.1-3 rule applies here as in the
      // prompt: only `require` actually GATES the verdict, so only there may this say 不定论.
      logActivity('formal',(rId||'host')+' 报告 '+key+' 存在**忠实性缺陷**（formal.decision=defect）：'+note
        +' ——已撤回「已通过」状态（→ attempted）、'+how
        +'、写入 Formal/TODO.md；'+(formalMode()==='require'
          ?'require 门禁使本次裁定**不定论**，修正形式化并重新跑通后再投票'
          :'本档没有门禁：本轮能否定论取决于表决者是否给出弃权值，修正形式化并重新跑通后再投票'))
      return {ok:true,target:key,status:'attempted',proof:'',decision:'defect',removedProof:!!(del&&del.ok),withdrawal:del?del.how:'failed'}
    }
    /**
     * The per-round `formal` reply channel. This is the path that fires IN PRACTICE: a resident
     * that never calls a Lean tool still has to state its difficulty judgement. Every failure is
     * swallowed into the activity log — an end handler must never throw into the scheduler — but
     * each rejection still returns the preset's typed error so the caller/audit can see WHY a
     * judgement was dropped instead of silently losing it.
     */
    async function applyFormalReply(rId,formalReply){
      try {
        // `off` is a TRUE no-op: the reply contract only offers the `formal` field in non-off modes,
        // so a stray / stale / hallucinated one must NOT create Lean state (v2/v3 guard here too;
        // without this, off mode could still be made to write Formal/ records, TODO entries and
        // announcements). The TOOLS stay usable in off mode on purpose — a tool call is deliberate.
        if(!formalOn()) return {ok:false,ignored:true}
        const key=formalKey(String(formalReply.target||''))
        if(!key){
          logActivity('formal',(rId||'host')+' 的 formal 回执缺少 target（对象 id）——本次未记录（V4_INVALID_ARGUMENT）')
          return {ok:false,code:'V4_INVALID_ARGUMENT',message:'formal.target（对象 id）是必填的'}
        }
        const decision=String(formalReply.decision||'').trim()
        if(decision==='blocked'){
          const note=String(formalReply.note||'').trim()
          if(!note){
            logActivity('formal',(rId||'host')+" 的 formal.decision='blocked' 缺少 note（难度判断/阻塞原因）——本次未记录（V4_INVALID_ARGUMENT）")
            return {ok:false,code:'V4_INVALID_ARGUMENT',message:"formal.decision='blocked' 必须写明 note（难度判断/阻塞原因）"}
          }
          await leanArchive(rId,{kind:'blocked',target:key,note})
          return {ok:true,target:key,decision:'blocked',status:'blocked'}
        } else if(decision==='defect'){
          // §4.1: a fidelity defect is NOT a refutation. Accepting it as "0 / false" would make the
          // framework fabricate a negative conclusion out of a broken formalization, so the ONLY
          // thing this branch may do is RETRACT the passing proof and defer the verdict.
          const note=String(formalReply.note||'').trim()
          if(!note){
            logActivity('formal',(rId||'host')+" 的 formal.decision='defect' 缺少 note（具体偏差）——本次未记录（V4_INVALID_ARGUMENT）")
            return {ok:false,code:'V4_INVALID_ARGUMENT',message:"formal.decision='defect' 必须写明 note（具体偏差：写窄了/写宽了/换了对象/漏了条件…）"}
          }
          return await recordFormalDefect(rId,key,note)
        } else if(decision==='used'){
          const file=String(formalReply.file||('Formal/'+key+'.lean'))
          const prev=formalOf(key)
          await putFormal(key,Object.assign({},prev,{
            status:prev.status==='passed'||prev.status==='blocked'?prev.status:'attempted',
            file,decision:'used',note:String(formalReply.note||prev.note||''),updatedAt:now(),
          }))
          try { await writeFormalIndex() } catch(e){ /* best-effort */ }
          return {ok:true,target:key,decision:'used'}
        } else if(decision){
          logActivity('formal',(rId||'host')+" 的 formal.decision 只能是 'used'、'blocked' 或 'defect'（收到 "+decision+"）——本次未记录（V4_INVALID_ARGUMENT）")
          return {ok:false,code:'V4_INVALID_ARGUMENT',message:"formal.decision 只能是 'used' | 'blocked' | 'defect'（收到 "+decision+"）"}
        }
        return {ok:false,code:'V4_INVALID_ARGUMENT',message:'formal.decision 是必填的'}
      } catch(e){
        logActivity('formal','formal 回执处理失败：'+String((e&&e.message)||e))
        return {ok:false,code:'V4_INVALID_ARGUMENT',message:String((e&&e.message)||e)}
      }
    }
    /** The {mode, on, objects, todo} view the host tools report (state-storage transparency). */
    function formalView(){
      const recs=formalRecords()
      return {
        mode:formalMode(),
        on:formalOn(),
        objects:Object.keys(recs).map(k=>({target:k,status:(recs[k]||{}).status||'none',file:(recs[k]||{}).file||'',proof:(recs[k]||{}).proof||'',note:(recs[k]||{}).note||''})),
        passed:Object.keys(recs).filter(k=>(recs[k]||{}).status==='passed'),
        blocked:Object.keys(recs).filter(k=>(recs[k]||{}).status==='blocked'),
        todo:formalTodo().map(t=>t.id),
      }
    }

    // ---- persistence ----
    async function saveAll(){
      await writeJson('State/residents.json', Object.fromEntries(residents))
      await writeJson('State/mailboxes.json', Object.fromEntries(mailboxes))
      await writeJson('State/taskboard.json', taskboard)
      await writeJson('State/decisions.json', decisions)
      // `off` mode must not CREATE Lean state: a run that never used the feature leaves no
      // State/formal.json behind. Seeded/live records (or a mode that is on) still persist.
      if(formalOn()||formalPersisted||Object.keys(formal).length||formalTodos.length) await writeJson('State/formal.json', {records:formal,todo:formalTodos})
      await writeJson('State/session.json', {running,autoDone,phase,problemId,problemText,runId,meetings,reports,lastActivityAt,lastProgressAt,activityLog,processEpoch,artifactCount,artifactBaseline,
        // In-flight consensus must survive a restart too: a verification that had collected 3 of 4
        // verdicts and a meeting that had collected half the speeches used to evaporate entirely
        // (Shared/debates|meetings/<id>.md are only written by finalize*, so the partial debate was
        // not even on disk) — and the queued proposals in pendingVerify were lost with it.
        meetingState,verifyState,pendingVerify,pendingMeeting})
    }
    async function loadAll(){
      const s=await readJson('State/session.json'); if(s){ running=!!s.running; autoDone=!!s.autoDone; phase=s.phase||'idle'; problemId=s.problemId||problemId; problemText=s.problemText||problemText; runId=s.runId||runId; meetings=s.meetings||[]; reports=s.reports||[]; lastActivityAt=s.lastActivityAt||now(); lastProgressAt=s.lastProgressAt||now(); activityLog=s.activityLog||activityLog; persistedEpoch=s.processEpoch||''; artifactCount=s.artifactCount||0; artifactBaseline=(s.artifactBaseline===undefined?null:Number(s.artifactBaseline))
        // Restore the in-flight consensus (see saveAll). `resume()` refreshes the watchdog clocks right
        // after this, so a run resumed after a crash gets a fresh stall window instead of being
        // abandoned by the meeting/verify watchdog on its first serviced pass.
        meetingState=s.meetingState||null; verifyState=s.verifyState||null
        pendingVerify=Array.isArray(s.pendingVerify)?s.pendingVerify:[]
        pendingMeeting=s.pendingMeeting||null }
      const rm=await readJson('State/residents.json'); if(rm&&typeof rm==='object') residents=new Map(Object.entries(rm))
      const mb=await readJson('State/mailboxes.json'); if(mb&&typeof mb==='object') mailboxes=new Map(Object.entries(mb))
      const tb=await readJson('State/taskboard.json'); if(Array.isArray(tb)) taskboard=tb
      const dc=await readJson('State/decisions.json'); if(Array.isArray(dc)) decisions=dc
      // Formal records are part of the run's durable state: a `require`-mode object's gate
      // decision must survive a process restart, so they are restored alongside the rest.
      const fm=await readJson('State/formal.json')
      if(fm&&typeof fm==='object'){
        formal=(fm.records&&typeof fm.records==='object')?fm.records:{}
        formalTodos=Array.isArray(fm.todo)?fm.todo:[]
        if(Object.keys(formal).length||formalTodos.length) formalPersisted=true
      }
    }

    // ---- resident prompts ----
    function banner(){ const o=[]; for(const [id,r] of residents) o.push('- '+id+'「'+(r.direction||'（未定）')+'」'+r.status+'·轮'+r.rounds); return o.join('\n') }
    // Who sent this? `facilitator` is the framework/human messenger (NOT a resident, not on the
    // roster): a resident that reads a bare `[facilitator]` line tries to reply to it and gets
    // `no such resident`. The definition travels WITH the frame, so it is present on the very wake
    // that shows the message — not only in the once-only onboarding brief.
    function senderLabel(from){ return String(from)==='facilitator'?'facilitator（框架/人类信使，不是常驻成员，不要向它回信；要回话请用本轮回执的 "input" 或 vibe_v4_send_message {to:"all"}）':String(from) }
    async function inboxText(rId){ const mb=mailboxes.get(rId)||[]; if(mb.length===0) return '  (no new messages)\n'; return mb.map(m=>'  ['+senderLabel(m.from)+'] '+m.content).join('\n')+'\n' }
    function residentLibraries(){
      const base=frameworkRoot()
      return '你的资料库根目录（**绝对前缀**，下面每条都已带库根）：'+base+'/\n'
        +'  Progress/<你>/progress.md —— 你的研究日志（叙述，可追加。主要内容是尝试过的各方法、路线、历程、进度，当前研究进展/进度、将来的计划与打算，及各路线、过程中遇到的障碍及其原因，对各路线、方法的看法、可行性评估，自己研究过程中的一些有价值看法、感想、猜想、理解。以及其它各种你认为有价值的值得记录的事物、经验、方法/想法、创新等都可进行记录）。\n'
        +'  Propos/<你>/<id>.md —— 你的命题/引理。格式：\n'
        +'    - ID: p-<id>; - 状态: 未定论; - 概率: <0-1>; - 价值程度: <0-1>; - 动机用途计划: <为何重要/打算怎么用>\n'
        +'    然后 ## 陈述 <陈述>；## 证明尝试；## 证伪尝试。\n'
        +'  Methods/<你>/<id>.md —— 你的理论/方法/工具。格式：- ID: m-<id>; - 状态: 经验; - 可信断言: []; - 价值程度: <0-1>; - 动机用途计划: ...；然后 ## 核心内容；## 定义与记号；## 应用记录；## 改进历史。\n'
        +'  Subproblems/<你>/<id>.md —— 你的子问题。格式：- ID: s-<id>; - 状态: 求解中; - 价值程度: <0-1>; - 动机用途计划: ...；然后 ## 陈述；## 进度。\n'
        +'  ⚠ 你的文件工具（读/写）按**会话 cwd** 解析路径：上面列出的相对子路径都要先拼上**成员库根** '+base+'/ 再使用（例如 '+base+'/Propos/r-1/p-1.md）；计算产物同理——请用回执里的**绝对**字段 receipt.scriptAbs，或把 receipt.cwd 与 receipt.scriptPath 拼起来，不要用相对路径。\n'
    }
    function toolList(){
      return 'vibe_v4_send_message {to, content} —— 给某常驻发消息（to=all 广播）。\n'
        +'vibe_v4_meeting {agenda} —— 发起/参与会议（框架会把各常驻的实际 input 转给其他人，让大家看到并讨论/辩论）。\n'
        +'vibe_v4_propose_task/claim_task/task_done/list_tasks —— 共享任务板（提议/认领/完成/查看；任务板是你们协调分工的载体）。\n'
        +'vibe_v4_publish_progress/record_proposition/record_method/record_subproblem —— 便捷记录器（可选；推荐直接用 fs 写自己的文件，路径必须带库根 ）。\n'
        +'vibe_v4_read_progress {id} —— 只读某常驻的进展。\n'
        +'vibe_v4_list_residents / vibe_v4_list_tasks —— 查看团队组成 / 开放任务。\n'
        +'vibe_v4_report_context {pct} —— 上报上下文占比（框架据此压缩你的上下文）。\n'
        +'fs (read/write/list) —— 读取任意文件；写入你自己的文件（推荐直接用 fs 直接写自己的 md；**路径必须带库根 ，否则会落到别处**）。\n'
    }
    // A shared, complete context block so a resident always knows the situation: mission,
    // work model, what it can do, which files it owns (+ formats), what others' files are,
    // and that it may READ anyone and WRITE its own directly. level 'full' = initial brief.
    function contextBrief(r, level){
      const s=[]
      s.push('## 背景 —— 你是常驻研究团队的一员')
      s.push('You are resident researcher '+r.rId+'（常驻研究者 '+r.rId+'；共 '+params.residentCount+' 位常驻），正在协作解决：')
      s.push(problemText)
      s.push('')
      s.push('这像一个**真实的学术小组**：没有中央调度器、没有外部派活——你们自己通过 **互相发消息 + 开会讨论** 来决定一切：谁做什么、怎么分工、验证什么、何时停止。你的 Round 决定你这一轮做什么；团队的优先级与分工由大家的讨论涌现。')
      s.push('')
      s.push('### 工作模式（会发生什么）')
      s.push('1. 每人有一份持久、全组可见的专属资料库（见下）。')
      s.push('2. 你们自由发消息、开会；**会议会把每个人实际说的话（input）转给其他人**，让你看得到、能回复、能讨论、能辩论。')
      s.push('3. 你独立研究，并**直接用 fs 写入你自己的文件**（**路径必须带库根 **，按格式），供全组阅读。')
      s.push('4. 任何"已确立"的东西须**全组一致**验证（全真或全假）才作数；否则只是带概率的工作估计。')
      s.push('5. 只有**全组在会议上一致认为原问题已解决**，run 才停止。')
      s.push('')
      s.push('### 你负责的文件（你只写自己的；但可读任何人的）')
      s.push(residentLibraries())
      s.push('其他人把结论/进展写进他们的目录，你就能读到。**你应主动读别人的库**，对齐事实、彼此衔接、避免重复劳动。')
      if(level!=='full'){ s.push('（格式见你最初的说明；直接用 fs 写自己的文件即可，**路径必须带库根 **。）') }
      s.push('')
      s.push('### 可用工具')
      s.push(toolList())
      s.push('')
      if(level==='full'){
        s.push('### 可自主发明理论/工具（鼓励，但不强迫）')
        s.push('请注意：你可以（但**不强迫**，完全视实际需要而定）尝试自主构建新的理论框架或工具——例如对某种系统做抽象化、一般化，抽离/推广出更一般的结构或理论框架；然后不断完善这个理论框架，在该框架下推得各种定理、性质、结论，以利于该框架下问题的解决。这就像为解决方程问题发明了群论、为分析需要建立了泛函分析框架——它比单纯解决当前问题更有学术价值，因为你直接得到了一类更普遍的方法/理论体系。')
        s.push('若你发明了这样的理论/工具，请**阐明它对原问题的用处、价值**；后续可根据需要不断**完善、一般化、推广**它。把这类成果记入你的 Methods/<你>/ 库。')
        s.push('')
      }
      s.push('### 规则')
      s.push('- 只有 Verified/（或卡片标"已验证·真/假"）算已确立；其余都是你的实验性工作，请区分"猜想/已知"。')
      s.push('- 验证必须**全组一致**（全真或全假）；你只信全票结果。未全票的对象留在库里带概率。')
      s.push('- `facilitator` 是**框架/人类介入的信使名**（不是常驻成员，不在编制里）：它转达人类或框架的话，但**不要向它回信**（会返回 no such resident）；要回话请用本轮回执的 "input" 字段（会转给全组）或 `vibe_v4_send_message {to:"all"}`。')
      s.push('- 你自己决定做什么，但**优先级/分工由团队讨论决定**，不是固定模式。若你认为问题已解决或接近解决，请**发起会议**让团队表决。')
      s.push('- 退出时**只**输出一个 JSON 对象（放在 ```json 代码围栏内；围栏外不要有文字）。')
      return s.join('\n')
    }
    // A SHORT core-rules recap, re-injected ONLY right after a compaction so the resident
    // never loses the ground rules (they are told fully once at brainstorm, but a /compact
    // could blank them).
    function coreRulesBrief(){
      const base=frameworkRoot()
      // The formalization line is appended HERE (not frozen into a brief) because the mode is
      // dynamic: after a /compact the resident must re-anchor on the rules it is actually
      // living under right now.
      return '[核心规则重申] 只有 Verified/（及标记"已验证·真/假"）算已确立；验证须全组一致（全真或全假）才作数，否则留库附平均概率；你只写自己的库（'+base+'/ 的 Progress/<你>/、Propos/<你>/、Methods/<你>/、Subproblems/<你>/），可只读任何人的库；任务分工由团队讨论决定；退出只输出一个 JSON 对象。'
        +'\n`facilitator` 是**框架/人类介入的信使名**，不是常驻成员，也不在编制里——**不要向它回信**（`vibe_v4_send_message` 会返回 no such resident）；要回话请用本轮回执的 "input" 字段（会转给全组）或 `vibe_v4_send_message {to:"all"}`。'
        +(leanDailyOn()?('\n'+formalWorkLine()):'')
        // math_computation is INDEPENDENT of formalVerify (its own `mathComputation` switch).
        +(mathAvailabilityBlock()?('\n'+mathAvailabilityBlock()):'')
    }
    function brainstormPrompt(r){
      return (params.residentPersona?params.residentPersona+'\n':'')
        +contextBrief(r,'full')+'\n'
        +(r.direction?('\n\n你被建议的初始方向（可自行调整/细化）：\n'+r.direction+'\n'):'')
        +'## 这是你的第一轮：独立头脑风暴\n'
        +'独立地想清楚：你对这个问题的洞察 / 解决方向 / 关键子问题 / 可能的引理 / 粗略计划。你还未见到其他人，先独立产出。\n'
        +'把有价值的产物**直接用 fs 写进你自己的文件**（**路径带库根 **，按上面格式），并在 summary 里概述你的切入方向与初步结论（标注哪些是猜想、哪些凭你已确证）。\n'
        +'Reply with ONLY a JSON object:\n'
        +'{"summary":"<your insight / direction / rough plan, one tight paragraph>","solved":false}'
    }
    async function normalPrompt(r){
      // Consume-and-clear ONCE: calling the accessor twice would return '' the second time (bug).
      const leanNotice=pendingLeanNoticeText()
      // The math availability line is built from the probe cache; awaiting the refresh HERE means a
      // cold cache still yields a complete line on the first wake (later wakes hit the cache).
      await refreshMathAvailability()
      const mathAvail=mathAvailabilityBlock()
      return (params.residentPersona?params.residentPersona+'\n':'')
        +'Resident researcher '+r.rId+' — 第 '+r.rounds+' 轮。一切由你和团队讨论决定。动手前先**读别人的库**对齐事实、避免重复；把新进展/结论**直接用 fs 写进你自己的文件**（**路径带库根 **）；想对团队说的话放 "input"（会转给其他常驻）。\n'
        +'\n团队成员：\n'+banner()+'\n'
        +'New items:\n'+ (await inboxText(r.rId)) +'\n'
        // Settled background compiles are announced ONCE, in the next prompt constructed (spec §2.4):
        // the same dynamic discipline as the mode — an announcement is never frozen into a brief.
        +(leanNotice?('\n'+leanNotice+'\n'):'')
        // 顺手形式化: computed from the CURRENT mode on every wake (docs §1: the mode is dynamic).
        +(leanDailyOn()?('\n'+formalWorkLine()+'\n'):'')
        // math_computation availability (dynamic probe cache; independent of formalVerify).
        +(mathAvail?('\n'+mathAvail+'\n'):'')
        +'Reply with ONLY a JSON object:\n'
        +'{"summary":"<what you did / decided this round, 1-3 sentences>","input":"<optional: a message to the whole team, or \\"\\">","solved":false,"propose_verify":"<id|null>","propose_meeting":"<agenda|null>","propose_task":"<task title|null>","task_desc":"<optional: why this task matters / what it covers|null>","claim_task":"<task id|null>","task_done":"<task id|null>","contextPct":40'
        +(formalOn()?(',"formal":{"target":"<对象 id>","decision":"used|blocked|defect","file":"Formal/<对象 id>.lean","note":"难度判断/阻塞原因/具体偏差"}'):'')
        +'}'
    }
    function meetingPrompt(r, st){
      const prior=Object.entries(st.inputs).filter(([k])=>k!==r.rId).map(([k,iv])=>'  ['+k+'] '+String(iv.input||iv.summary||'')).join('\n')
      return (params.residentPersona?params.residentPersona+'\n':'')
        +'Resident '+r.rId+' — 团队会议进行中。 A meeting is in progress (agenda: '+st.agenda+').'
        +(prior?'\n这是一场真实讨论：下面已有人发言（转给你），请先看，然后**加入讨论/补充/反驳/表决**。':'\n本轮是**并行独立发言**：同轮内不会有人先发言给你（唤醒是并行的），你的 input 会在**下一次唤醒/下一轮**转给其他人；请先给出你自己的判断。')
        +(prior?('\n\n### 已有发言（他人 input，已转发给你）\n'+prior):'')
        +'\n\n你可以：提议任务（propose_task）、认领开放任务（claim_task）、提议验证对象（propose_verify）、或对"原问题是否已解决"表决（voteSolved）。请把**你的实际发言**写进 "input"。'
        +'\n**停止表决必须是绝对票**：`voteSolved:true` 只表示你认为原问题**已解决**；只要有一名在册常驻没投 `true`（投 false、弃权、或漏写这个字段），run 就**不会**停止。不确定就投 false。'        +'\nReply with ONLY a JSON object:\n'
        +'{"input":"<your real contribution to this discussion>","propose_task":"<task title or null>","task_desc":"...","claim_task":"<task id or null>","propose_verify":"<id or null>","voteSolved":true}'
    }
    function verifyPrompt(r, vs){
      // In a DEBATE round, show the PREVIOUS round's opinions (kept in vs.history) so the resident can
      // see others' stances and give a fresh independent judgement; in the first (independent) round no
      // others' opinions exist yet. vs.verdicts only ever holds the CURRENT round's votes.
      const src = (vs.stage==='debate' && vs.history && Object.keys(vs.history).length>0) ? vs.history : (vs.stage==='debate' ? vs.verdicts : {})
      const others=Object.entries(src).map(([k,v])=>'- '+k+': 正确概率 '+String(v.prob!=null?Number(v.prob).toFixed(2):0.5)+' → '+v.reason).join('\n')
      const L=[]
      L.push((params.residentPersona?params.residentPersona+'\n':'')
        +'Resident '+r.rId+' — 团队验证。 The group is verifying object '+vs.targetId+'（'+targetTypeWord(vs.targetType)+(String(vs.targetOwner||'').trim()?('，提出者 '+vs.targetOwner):'')+'）。\n'
        +'请给出你对「该对象为真」的**正确概率 `verdict`**，仅一个 0–1 数值：**1 = 绝对为真，0 = 绝对为假，0.5 = 完全不确定，其余为介于其间的程度**（不要给 TRUE/FALSE，就给一个数值）。\n'
        // ── THE VOTE CONTRACT (why the example below is 1 and not 0.9) ──────────────────────────
        // Only an EXACT 1 or 0 is a vote; anything strictly between is the model's honest
        // probability of truth, i.e. an ABSTENTION. The old text demonstrated `verdict:0.9` while
        // the code required `Number(prob)===1`, so a cautious-but-convinced group could never
        // converge: every round burned and the object stayed unverified forever. The rule is now
        // stated HERE, the example shows `1`, and 0.9 is explained instead of merely tolerated.
        +'**投票契约**：只有**恰好 1**（你认为是**绝对**为真）和**恰好 0**（你认为是**绝对**为假）算表决；**严格介于 0 与 1 之间**（例如 0.9、0.95、0.5）是**弃权**——它是你对"该对象为真"的**概率估计**，不是你的一票。\n'
        +'  · 有把握认为它为真就投 **1**；不要为了"留一点余地"投 0.9——那会让全组永远无法定论。\n'
        +'  · 弃权会被如实统计：本轮没有人全票 → 对象**不会**停止验证，而是把全组的**平均概率**写回它在库中的卡片（`- 概率:`），带概率继续留在库里。\n'
        +'  · 弃权的合法用途：你确实不确定（用 0.5 附近的值表达）。\n'
        +(formalOn()?('  · 另一种弃权：已归档的机器检查证明与命题原文不一致、你**不能**用 0 表达"命题为假"（此时请用 `formal` 回执的 `decision:"defect"` 报告偏差）。\n'):'')
        +'判定规则：**仅当全体在册常驻都恰好给 1（都认为是真）、或都恰好给 0（都认为是假）**，才按「真/假」写入 Verified/ 并回写来源卡的「已验证·真/假」；否则**只按概率数值（一种程度）保留在库中**，附全组平均正确概率，不写成真/假。\n'
        +'请给出你**诚实独立的判断**'
        +(vs.stage==='debate'?'，并参考他人意见：\n':'。\n')
        +(vs.stage==='debate'&&others?('### 他人上一轮意见（已转发给你）\n'+others+'\n'):''))
      // ---- Lean formalization: the block is computed from the CURRENT mode and the object's
      // CURRENT record, so a mode switch and a fresh proof both show up on the next wake ----
      if(formalOn()){
        L.push('')
        L.push(formalPromptBlock(vs.targetId))
      }
      // A settled background compile is announced once, here too: a voter must not conclude on a
      // "passed" that only landed in the queue a moment ago (spec §2.4/§5 B).
      { const notice=pendingLeanNoticeText(); if(notice){ L.push(''); L.push(notice) } }
      L.push('')
      L.push('Reply with ONLY a JSON object:')
      L.push('{"vote":{"verdict":1,"reason":"<your logic>"}}')
      if(formalOn()){
        // The formal field belongs in the VOTING contract too: voters are exactly the agents who
        // must either formalize the object or record why they judged it infeasible.
        L.push('若你本轮做了形式化或给出难度判断，请一并加上：')
        L.push(formalReplyField(vs.targetId))
      }
      return L.join('\n')
    }

    // ---- host live-child cap: a refused spawn must never kill the run --------------
    // A ROOT agent's live continuable children are capped by the host (see the module-scope note):
    // `startContinuable` throws ACTIVATION_LIMIT_REACHED once the cap is full. Without the handling
    // below that throw escaped `start()` mid-loop, so the run was left with `running=true`, a
    // half-built team and an unhandled rejection.
    let childLimitLoggedThisRound = false   // ONE actionable line per ROUND, not one per refused child
    let pendingSpawns = []                  // residents the cap refused: retried a round later
    function beginSpawnRound(){ childLimitLoggedThisRound = false }
    // LIVE continuable children of THIS framework: a resident that holds a childId and has not been
    // stopped. A refused resident carries childId '' so it can never inflate (or hide behind) the
    // real ceiling, and is never counted as a voter/speaker either (see noteSpawnRefused).
    function liveChildCount(){ let n=0; for(const [,r] of residents){ if(r.childId && r.status!=='stopped') n++ } return n }
    // Mark a resident whose spawn the host refused and say ONCE per round what the operator can do.
    // The resident is kept OUT of the live roster: a childless member must not be counted by the
    // meeting/verify consensus (they require EVERY resident to speak/vote, and no end event can ever
    // arrive for a child that was never created), and `wakeResident` could never deliver to it. It is
    // queued in `pendingSpawns` instead, so the work is deferred rather than lost.
    function noteSpawnRefused(r, limit){
      r.childId=''; r.status='refused'; r.lastActiveAt=now()
      // `start()`/`addMember` never put the resident in the roster, but a RESPAWN (resume) does:
      // drop it here (the queued retry re-registers it, and its own end event resumes the flow).
      if(residents.get(r.rId)===r) residents.delete(r.rId)
      busy.delete(r.rId); wakeKind.delete(r.rId)
      if(currentResident===r.rId) currentResident=''
      if(pendingSpawns.indexOf(r)<0) pendingSpawns.push(r)
      if(childLimitLoggedThisRound) return
      childLimitLoggedThisRound=true
      const line='vibe-math-v4: '+hostChildLimitHint(limit)+'。'+r.rId+' 等常驻本轮未能创建；'
        +'可在宿主的 subagent 行把 maxActiveSubagents 调大（或调小 residentCount），未创建的常驻已排队，有空位时自动重试。'
      console.error(line)
      logActivity('spawn-refused', line)
    }
    // One retry ROUND for the queued residents. Called from scheduleNext (the single choke point of
    // every scheduling pass) and paced by the heartbeat, so a capped team is never retried in a
    // tight loop; a successful retry registers the resident normally and its own end event resumes
    // the normal flow.
    async function retryPendingSpawns(){
      if(!pendingSpawns.length) return
      const queue=pendingSpawns.slice(); pendingSpawns=[]; beginSpawnRound()
      for(const r of queue){
        try { await spawnResident(r) }
        catch(e){
          // A non-cap failure has no other caller to report to here: say it once and drop this
          // resident (retrying a broken tool filter every round forever would be worse).
          console.error('vibe-math-v4: 重试创建常驻 '+r.rId+' 失败，已放弃该常驻：'+String((e&&e.message)||e))
          logActivity('spawn-failed', r.rId+' '+String((e&&e.message)||e))
        }
      }
      await saveAll()
      if(pendingSpawns.length) armHeartbeat()   // still capped: re-check on the next heartbeat window
    }

    // ---- resident lifecycle ----
    let residentSeq = 0
    // Spawns that are currently IN FLIGHT, plus the `subagent/start` payloads seen while they were.
    //
    // ORDERING FACT (verified against the installed host, dsh-subagent 0.2.0-rc.2): `subagent/start`
    // is emitted SYNCHRONOUSLY from inside `startContinuable`'s await — `emit('subagent/start', …)` at
    // `dsh-subagent/lib/index.js:279` (and again from the lifecycle observer at `:306` once
    // `observer.start(handle.agent)` runs at `:1116`) — and `startContinuable` resolves only
    // afterwards. `spawnResident` therefore cannot know `started.childId` when the event fires, and
    // the payload carries no label (see `SubagentRunInfo`: runId/provider/id/local only), so the ONLY
    // information available at that moment is "a child of mine just started".
    //
    // So: the start handler STASHES the live Agent by child id (no ownership guess at all), and
    // `spawnResident` CLAIMS the record for its child id as soon as the call resolves — at which point
    // ownership is known exactly. `labelHints` bridges the (mock-ish) hosts that embed the label in
    // the id for the handler's own `ownsChild` check.
    const pendingSpawnLabels = new Set()
    const pendingStartAgents = new Map()   // childId -> Agent, seen but not yet owned
    function stashStartAgent(childId, agent){
      if(!childId || !agent) return
      if(pendingStartAgents.size>=64) pendingStartAgents.delete(pendingStartAgents.keys().next().value)
      pendingStartAgents.set(String(childId), agent)
    }
    function claimStartAgent(childId){
      const id=String(childId==null?'':childId)
      const agent=pendingStartAgents.get(id)
      if(agent) pendingStartAgents.delete(id)
      return agent
    }
    function newResident(dir){ const rId='r-'+(++residentSeq); return {rId,childId:'',direction:dir||'',status:'brainstorm',rounds:0,roundsSinceCompact:0,lastActiveAt:now(),insight:'',contextPct:0,contextSeed:'',needCompact:false} }
    async function spawnResident(r){
      // Skip BEFORE touching the host when we already KNOW the ceiling and our own live children
      // fill it: the host would refuse this spawn too, and one line per ROUND (not per child) is
      // enough. The resident is queued and the next round retries it.
      if(hostChildLimit!==undefined && liveChildCount()>=hostChildLimit){ noteSpawnRefused(r, hostChildLimit); return false }
      const ao=residentAgentOptions(); const tf=residentToolFilter()
      let started
      // Register the label for the whole in-flight window: `subagent/start` fires inside this await.
      pendingSpawnLabels.add(r.rId)
      try {
        started=await startWithToolFilter(tf, function(f){ return {provider:pickProvider(),label:r.rId,request:{prompt:[textBlock(brainstormPrompt(r))],parent:rootAgent,agentOptions:ao,...(f?{toolFilter:f}:{})},signal:makeSignal(params.activityTimeoutMs||60000)} })
      } catch(e){
        // The host's live-child cap is a HOST limit (maxActiveSubagents on the `subagent` row), not
        // a defect in this preset: remember the ceiling, keep the resident for a later round, and
        // do NOT let the throw escape (it used to abort start()'s spawn loop). Every OTHER start
        // failure keeps its previous behaviour and still propagates.
        if(!isActivationLimitReached(e)) throw e
        noteSpawnRefused(r, noteChildLimit(e)); return false
      } finally { pendingSpawnLabels.delete(r.rId) }
      // The child just started, so its `subagent/start` payload has already been seen (the host emits
      // it inside the await above). Claim the stashed Agent for it NOW — ownership is exact here — and
      // that is what makes the REAL `/compact` path reachable (see the `subagent/start` listener).
      const claimed=claimStartAgent(started.childId)
      if(claimed) rememberAgent(started.childId, claimed)
      r.childId=started.childId; r.status='brainstorm'; r.lastActiveAt=now()
      childOwner.set(started.childId,sessionId); busy.add(r.rId); wakeKind.set(r.rId,'normal'); currentResident=r.rId
      residents.set(r.rId,r); await saveAll(); logActivity('spawn',r.rId+' ('+(r.direction||'brainstorm')+')')
      return true
    }
    /**
     * Is `childId` one of THIS session's residents — including a spawn that is still IN FLIGHT?
     *
     * `spawnResident` sets `r.childId` (and `childOwner`) only after `startContinuable` resolves, but
     * the host emits `subagent/start` from inside that await. So "is this mine?" must also consult the
     * pending-spawn labels registered around the call; without that, the start handler rejects every
     * child of a fresh spawn and `liveAgents` never gets populated.
     */
    function ownsChild(childId){
      const id=String(childId)
      for(const [,r] of residents){ if(r.childId===id) return true }
      for(const r of pendingSpawns){ if(r.childId===id) return true }
      // During the spawn await the child's id is not recorded anywhere yet, but the framework chose
      // the spawn's LABEL and `spawnResident` registers it for exactly this window. A host id that
      // embeds the label (`child-r-1`, the common test/mock shape) is matched by containment; an
      // opaque host id cannot be matched here, which is why the label is only a
      // best-effort bridge in addition to the roster checks above.
      for(const label of pendingSpawnLabels){ if(id===label || id.indexOf(label)>=0) return true }
      return false
    }
    async function wakeResident(r, promptText, kind){
      if(!r || !r.childId) return false   // a removed resident must never be woken (else r.childId would crash)
      clearHeartbeat()
      busy.add(r.rId); wakeKind.set(r.rId,kind||'normal'); currentResident=r.rId
      // `rounds`/`roundsSinceCompact` are advanced only AFTER the send actually succeeded (below), so
      // a wake that never reached the child cannot consume a "round" of the compaction heuristic nor
      // inflate the round number the resident is told. `lastActiveAt` still moves here on purpose: a
      // failed wake must back the A-fill off for one activityTimeoutMs instead of hammering the child.
      r.lastActiveAt=now()
      // Context compaction has TWO distinct needs. Confusing them is the bug that made
      // '[核心规则重申]+[CONTEXT COMPACT]' repeat at the start of nearly every prompt:
      //   (a) r.needCompact (set by a REAL /compact) => the resident's rules may be blurred, so
      //       re-anchor the short core rules on the next wake of ANY kind, then CLEAR the flag.
      //       (Short recap only; no self-summary directive — the real compact already condensed.)
      //   (b) soft-compact trigger (contextPct>=threshold OR roundsSinceCompact>=afterRounds) =>
      //       the resident's context genuinely grew; ask it to self-summary. ONLY on a normal
      //       research round (kind==='normal'): a meeting/verify reply has no contextPct/compacted
      //       fields, so a directive injected there is never acknowledged and would repeat forever.
      let prompt = promptText
      const isNormal = (kind||'normal')==='normal'
      const wantSoft = isNormal && (Number(r.contextPct)>=Number(params.compactThreshold) || Number(r.roundsSinceCompact)>=Number(params.compactAfterRounds))
      const wantReanchor = r.needCompact
      if(wantSoft){
        prompt = coreRulesBrief() + '\n' +
          '[CONTEXT COMPACT — your conversation is at/near the limit. Do NOT re-derive history.\n' +
          'Condense your current working state into ONE tight self-summary (findings so far, active direction, key artifacts you recorded, next concrete steps, open questions), then answer this round in the normal JSON format as usual.\n' +
          'Set "contextPct": 15 (your post-compact usage) and "compacted": true in the reply so the framework records the condensed seed.]\n\n' + promptText
        r.needCompact = true
      } else if(wantReanchor){
        prompt = coreRulesBrief() + '\n' + prompt
        r.needCompact = false
      }
      // The DSH continuable-wake API is subagents.sendMessage(sender, targetId, content, {signal}),
      // NOT subagents.followup (which is only Agent.followup, and does NOT exist on the subagents
      // service). Using a non-existent method threw TypeError and made EVERY wake fail silently →
      // the group went idle forever. Prefer sendMessage; the legacy `subagents.followup` branch is
      // kept for the earliest supported hosts only: that service method was dropped in DSH
      // 0.1.2-rc.1, so it is reachable only on 0.1.2-alpha.* — 0.1.2-rc.1 and every later release
      // this package targets expose startContinuable/sendMessage/drainContinuableChildren and
      // nothing else (checked against dsh-subagent 0.2.0-rc.2).
      try {
        if(typeof subagents.sendMessage==='function'){
          await subagents.sendMessage(rootAgent, r.childId, [textBlock(prompt)], {signal: makeSignal(params.activityTimeoutMs||60000)})
        } else if(typeof subagents.followup==='function'){
          await subagents.followup(rootAgent, r.childId, [textBlock(prompt)], {source:{kind:'user'},signal:makeSignal(params.activityTimeoutMs||60000)})
        } else {
          throw new Error('no subagent continuation API (need sendMessage or followup)')
        }
        // The turn is really in flight now: count it (F10 — a failed send must not consume a round).
        r.rounds+=1; r.roundsSinceCompact+=1
        return true
      }
      catch(e){ console.error('vibe-v4 wake '+r.rId+' failed: '+String((e&&e.message)||e)); busy.delete(r.rId); return false }
    }
    function byChild(childId){ for(const [,r] of residents){ if(r.childId===childId) return r } return undefined }

    // ---- artifact writers (resident-facing) ----
    /** Cross-preset audit D1: a member-facing tool must never answer with a bare `no such resident`.
     *  "not started yet" / "wrong id" / "already dismissed" are DIFFERENT problems, so the answer
     *  carries a code, the LIVE roster state and an actionable next step (v5's `memberDiagnosis`). */
    function noSuchResident(id, tool){
      const ids=[...residents.keys()]
      const active=[...residents.values()].filter(r=>r&&r.childId).length
      const nextTool=tool||(running?'vibe_v4_list_members':'vibe_v4_start')
      return {ok:false,code:'V4_NO_SUCH_RESIDENT',
        message:'no such resident: '+String(id||'(none)')+(running?('（当前在册 '+residents.size+' 名，active '+active+' 名）'):'（本次运行尚未 start）'),
        status:{running:!!running,autoDone:!!autoDone,residentCount:residents.size,activeCount:active,ids:ids},
        next:{tool:nextTool,
          hint:running?'核对有效 id（新建成员可能仍在 spawn 中）；列表用 vibe_v4_list_members':'先 vibe_v4_start 或 vibe_v4_add_member，再调用 '+nextTool}}
    }
    async function publishProgress(rId,content){ if(!rId||!residents.has(rId)) return noSuchResident(rId) ; const rel='Progress/'+rId+'/progress.md'; const prev=(await readText(rel))||''; await writeText(rel, prev+'\n### '+fmtTime()+'｜'+rId+'\n'+String(content||'')+'\n'); return {ok:true} }
    async function recordProposition(rId,o){ if(!rId||!residents.has(rId)) return noSuchResident(rId) ; const id=o.id?idSafe(o.id):('p-'+shortId()); const lines=['# 命题｜'+(o.title||id),'- 标题: '+(o.title||id),'- ID: '+id,'- 类型: 命题','- 状态: 未定论','- 概率: '+cl(o.prob!=null?o.prob:0.5),'- 价值程度: '+cl(o.value!=null?o.value:0.5),'- 动机用途计划: '+(o.motivation||''),'- 依赖: []','','## 陈述',String(o.statement||''),'','## 证明尝试','','## 证伪尝试','']; await writeText('Propos/'+rId+'/'+id+'.md',lines.join('\n')); logActivity('record',rId+' 命题 '+id); bumpArtifacts(); return {ok:true,id,file:'Propos/'+rId+'/'+id+'.md'} }
    async function recordMethod(rId,o){ if(!rId||!residents.has(rId)) return noSuchResident(rId) ; const id=o.id?idSafe(o.id):('m-'+shortId()); const lines=['# 方法｜'+(o.title||id),'- 标题: '+(o.title||id),'- ID: '+id,'- 类型: '+(o.type||'方法'),'- 状态: 经验','- 可信断言: []','- 价值程度: '+cl(o.value!=null?o.value:0.5),'- 动机用途计划: '+(o.motivation||''),'','## 核心内容',String(o.content||''),'','## 定义与记号',String(o.notation||''),'','## 应用记录','## 改进历史','']; await writeText('Methods/'+rId+'/'+id+'.md',lines.join('\n')); logActivity('record',rId+' 方法 '+id); bumpArtifacts(); return {ok:true,id,file:'Methods/'+rId+'/'+id+'.md'} }
    async function recordSubproblem(rId,o){ if(!rId||!residents.has(rId)) return noSuchResident(rId) ; const id=o.id?idSafe(o.id):('s-'+shortId()); const lines=['# 子问题｜'+(o.title||id),'- 标题: '+(o.title||id),'- ID: '+id,'- 状态: 求解中','- 价值程度: '+cl(o.value!=null?o.value:0.5),'- 动机用途计划: '+(o.motivation||''),'- 依赖: []','','## 陈述',String(o.statement||''),'','## 进度','']; await writeText('Subproblems/'+rId+'/'+id+'.md',lines.join('\n')); logActivity('record',rId+' 子问题 '+id); bumpArtifacts(); return {ok:true,id,file:'Subproblems/'+rId+'/'+id+'.md'} }
    // ── auto-sync meeting: every `meetingKeepEvery` NEW artifacts, convene a coordination meeting ──
    //
    // The counting basis is the RESIDENTS' card libraries themselves (Propos/Methods/Subproblems),
    // NOT the three `record_*` convenience tools. The prompt tells residents verbatim that those tools
    // are optional and that they are recommended to write their own files directly with `fs`, so a
    // team that follows the recommendation never called `bumpArtifacts` and
    // `artifactCount % meetingKeepEvery === 0` could never fire — the documented "every N new
    // artifacts auto-sync" was UNREACHABLE in the very workflow the prompt recommends, leaving the
    // stall watchdog as the only path that ever convenes an auto-meeting.
    //
    // Setting `artifactBaseline` also means a tile count of the correct sign, since residents write
    // the paths `Propos/<r>/<id>.md` explicitly.
    async function countArtifacts(){
      let n=0
      for(const base of ['Propos','Methods','Subproblems']){
        try {
          const t=await fs.resolve(base,{cwd:frameworkRoot()})
          if(await fs.stat(t)===undefined) continue
          const ents=await fs.listDir(t)
          for(const e of ents||[]){
            if(!e||e.type!=='directory') continue
            try {
              const dt=await fs.resolve(base+'/'+e.name,{cwd:frameworkRoot()})
              if(await fs.stat(dt)===undefined) continue
              const files=await fs.listDir(dt)
              for(const f of files||[]) if(f&&f.type==='file'&&/\.md$/.test(String(f.name))) n++
            } catch(e2){ /* a single unreadable library must not stop the scan */ }
          }
        } catch(e){ /* best-effort: an absent library counts as zero */ }
      }
      return n
    }
    /**
     * Re-base the artifact counter on what is on disk. Called from `start()` (a fresh run: the count
     * of NEW artifacts starts at 0 even if the project tree already held cards) and from
     * `scheduleNext` (the single choke point of every scheduling pass, right before the auto-meeting
     * test), so a group that writes its cards with `fs` still drives the documented cadence.
     * Costs no writes and never throws into the scheduler.
     */
    async function syncArtifactCount(){
      const n=await countArtifacts()
      if(artifactBaseline===null) artifactBaseline=n
      artifactCount=Math.max(artifactCount, n-(artifactBaseline||0))
      return artifactCount
    }
    /**
     * The `meetingKeepEvery` cadence: every N newly accumulated artifacts, convene ONE coordination
     * meeting. Called from BOTH paths that can observe the count:
     *   · `bumpArtifacts` (a `record_*` convenience-tool call — the counter moves immediately), and
     *   · `scheduleNext` right after `syncArtifactCount()` re-bases the counter on the files on disk,
     *     which is the ONLY way an `fs`-written card can be seen.
     * Without the second call site the documented cadence is unreachable in the very workflow the
     * prompt recommends (`record_*` 可选；推荐直接用 fs 写自己的文件). `lastSyncMeetingAt` is reused as
     * the count at which the last sync meeting was convened, so the same crossing cannot fire twice.
     */
    function maybeArtifactSyncMeeting(){
      const every=Number(params.meetingKeepEvery)
      if(!(every>0)) return false
      if(meetingState || verifyState || pendingMeeting) return false
      if(!(artifactCount>0) || artifactCount % every !== 0) return false
      if(artifactCount<=lastSyncMeetingAt) return false   // this crossing already convened a meeting
      lastSyncMeetingAt=artifactCount
      logActivity('meeting','定期同步触发：新增产物达到 '+every+' 的倍数（累计 '+artifactCount+'）')
      startMeeting('定期同步：分工/进展/是否需要验证','general',null).catch(()=>{})
      return true
    }
    function bumpArtifacts(){ artifactCount+=1; markProgress(); maybeArtifactSyncMeeting() }
    function listResidents(){ return Array.from(residents.values()).map(r=>({id:r.rId,direction:r.direction,status:r.status,rounds:r.rounds,contextPct:r.contextPct,insight:r.insight?r.insight.slice(0,80):'',roundsSinceCompact:r.roundsSinceCompact||0,needCompact:!!r.needCompact,wakeKind:wakeKind.get(r.rId)||''})) }
    // identify WHICH resident is calling a resident-facing tool: match the caller's
    // subagent id to a resident's childId. Fall back to the last-woken resident when
    // the caller is the host/assistant (or an unknown agent). This makes per-resident
    // libraries correct under concurrency (e.g. all brainstorm residents in flight).
    function residentOfAgent(agent){ try { const id=agent&&agent.id?String(agent.id):''; if(!id) return ''; for(const [,r] of residents){ if(r.childId===id) return r.rId } } catch(e){} return '' }

    // ---- task board (residents propose / claim / complete; framework wakes the claimer) ----
    async function writeTaskboard(){ const lines=['# 任务板','']; for(const t of taskboard){ lines.push('- ['+t.status+'] '+t.title+(t.claimer?('（认领:'+t.claimer+'）'):'')+(t.proposer?('（提议:'+t.proposer+'）'):'')+(t.description?('：'+t.description):'')) } await writeText('Shared/taskboard.md',lines.join('\n')) }
    async function proposeTask(title,description,proposer){ const id='t-'+shortId(); taskboard.push({id,title:String(title),description:String(description||''),status:'open',proposer:proposer||'',claimer:'',source:''}); await saveTaskboard(); markProgress(); logActivity('task','proposed '+id+'「'+title+'」'); return {ok:true,id} }
    async function claimTask(id,claimer){ const t=taskboard.find(x=>x.id===id); if(!t) return {ok:false,message:'no such task'}; if(t.status!=='open') return {ok:false,message:'task already '+t.status}; t.status='claimed'; t.claimer=claimer; await saveTaskboard(); markProgress(); logActivity('task',claimer+' claimed '+id); 
      // wake the claimer to work on it (framework moves the task, resident decides how).
      // NOT while paused/stopped: a paused run must not start new work — the claim is recorded on the
      // board and the resident (who claimed it) picks it up again after resume.
      const r=residents.get(claimer); if(r && !busy.has(claimer) && running && !autoDone){ currentResident=claimer; const ok=await wakeResident(r, (await normalPrompt(r))+'\n\n[YOU CLAIMED TASK '+id+'] '+t.title+' — '+t.description,'normal'); await saveAll(); if(!ok) armHeartbeat() }
      return {ok:true} }
    async function taskDone(id,claimer){ const t=taskboard.find(x=>x.id===id); if(!t) return {ok:false}; t.status='done'; t.doneBy=claimer; await saveTaskboard(); await writeTaskboard(); markProgress(); logActivity('task','done '+id); return {ok:true} }
    async function saveTaskboard(){ await writeJson('State/taskboard.json',taskboard); await writeTaskboard() }
    function listTasks(){ return taskboard.filter(t=>t.status!=='done') }
    async function reportContext(rId,pct){ const r=residents.get(rId); if(r){ r.contextPct=clPct(pct); if(Number(pct)<30) r.needCompact=false; } return {ok:true} }
    /**
     * Apply context/compact bookkeeping from a resident's reply.
     *
     * `kind` is the wake kind. It matters because the OLD version treated ANY non-empty `summary`
     * on ANY turn as the acknowledgement of a requested compaction: a meeting/verify reply that
     * happened to echo a summary (their contracts do not forbid it) cleared `needCompact`, zeroed
     * `roundsSinceCompact` and clamped `contextPct` to <=25 WITHOUT any compaction happening — so the
     * soft-compact trigger stayed below threshold and the compaction the flag was asking for was
     * never issued. Only a real normal research turn can acknowledge the soft directive it received
     * (`wakeResident` injects `[CONTEXT COMPACT …]` on normal rounds only); `parsed.compacted===true`
     * stays honoured on every kind, because that is the resident explicitly saying it condensed.
     */
    function postmark(r, parsed, kind){
      const cp=Number(parsed.contextPct); if(Number.isFinite(cp)) r.contextPct=clPct(cp)   // tolerate numeric strings ("40")
      const isNormalTurn=(kind||'normal')==='normal'
      if(parsed.compacted===true || (isNormalTurn && r.needCompact && parsed.summary)){
        r.contextSeed=String(parsed.summary||r.contextSeed||'')
        r.contextPct=Math.min(r.contextPct||15,25)
        r.roundsSinceCompact=0
        r.needCompact=false
        logActivity('compact', r.rId+' consolidated context')
      }
    }

    // ---- messaging ----
    async function postMessage(from,to,content){
      const r=residents.get(to); if(!r) return noSuchResident(to,'vibe_v4_send_message')
      if(!busy.has(to)){
        currentResident=r.rId
        const ok=await wakeResident(r, (await normalPrompt(r))+'\n\n[NEW MESSAGE from '+from+']\n'+content,'normal')
        await saveAll(); markProgress()
        if(ok){ logActivity('message',from+'→'+to); return {ok:true} }
        // The immediate wake FAILED (and `wakeResident` already cleared the `busy` mark, so no turn
        // actually started). Round C: the message must fall back to the MAILBOX instead of being
        // discarded — the old code logged "(wake failed; heartbeat re-armed)" and then dropped the
        // text, so the re-armed heartbeat had nothing left to do and the message was lost forever
        // while the recipient stayed cold (this is what the audit's F1 probe measured: it reported
        // "queued mail already consumed: false" but the mailbox was in fact already empty, so no
        // later pass could ever deliver anything). The mailbox is the one place a pass is guaranteed
        // to look again — including during `brainstorm`, see the delivery call at the top of
        // scheduleNext — and a successful retry marks the recipient busy and clears the queue.
        const mb=mailboxes.get(to)||[]; mb.push({from,at:now(),content}); mailboxes.set(to,mb)
        await saveAll(); armHeartbeat()
        logActivity('message',from+'→'+to+' (immediate wake failed; queued for retry)')
        return {ok:true}
      }
      const mb=mailboxes.get(to)||[]; mb.push({from,at:now(),content}); mailboxes.set(to,mb); await saveAll(); logActivity('message',from+'→'+to+' (queued)'); return {ok:true}
    }
    async function broadcast(content, from){
      let n=0
      for(const [,r] of residents){ if(from && r.rId===from) continue; const res=await postMessage(from||'facilitator',r.rId,content); if(res&&res.ok) n++ }
      logActivity('broadcast','to '+n+' resident(s)'); await saveAll(); return {ok:true,message:'broadcast to '+n+' resident(s)'}
    }
    // group conversation relay: when a resident "speaks" (input in its round), forward its
    // words to every other resident's inbox so the whole group can see & react — a real group chat.
    async function relayToGroup(from, content){
      const text=String(content||'').trim()
      if(!text) return
      for(const [,r] of residents){
        if(r.rId===from) continue
        const mb=mailboxes.get(r.rId)||[]; mb.push({from,at:now(),content:'[群聊] '+text}); mailboxes.set(r.rId,mb)
      }
      logActivity('relay',from+' → 团队: '+text.slice(0,60)); markProgress(); await saveAll()
    }

    // ---- meeting ----
    async function startMeeting(agenda,type,targetId){
      if(meetingState) return {ok:false,message:'meeting already in progress'}
      // Park-and-resume (never lose a coordination request, never create a zombie): while a
      // verification holds the floor, while the group is still brainstorming (members are busy in
      // their first rounds — a meeting started there could not be serviced and the old code let its
      // stall watchdog silently ABANDON it minutes later), or while the run is paused, the meeting
      // request is parked in pendingMeeting (FIRST request wins) and starts as soon as the floor is
      // free. A never-started session (no residents to talk) and a concluded run (autoDone) refuse
      // instead — convening there previously created a meeting nobody could ever be woken into.
      if(!running || autoDone || phase==='brainstorm' || verifyState || pendingVerify.length>0){
        if(autoDone || (!running && residents.size===0)) return {ok:false,message:'run is not active (use vibe_v4_start or vibe_v4_resume first)'}
        if(!pendingMeeting) pendingMeeting = { agenda, type:type||'general', targetId:targetId||null }
        return {ok:true,deferred:true,during: phase==='brainstorm'?'brainstorm':(!running?'paused':'verify')}
      }
      clearHeartbeat()
      const ids=Array.from(residents.keys())
      // Rotate the per-meeting speaking order so the SAME resident isn't always the "first speaker
      // who sees no one else's contribution"; a real discussion lets each member lead sometimes.
      const rot=Math.floor(Math.random()*Math.max(1,ids.length))
      const order=ids.slice(rot).concat(ids.slice(0,rot))
      meetingState={id:'mt-'+shortId(),agenda,type:type||'general',targetId:targetId||null,round:0,asked:[],inputs:{},transcript:[],order,at:now(),lastInputAt:now(),rosterSnapshot:order.slice(),rosterVersion}
      markProgress();
      logActivity('meeting','start: '+agenda); await saveAll(); await scheduleNext(); return {ok:true,id:meetingState.id}
    }
    async function continueMeetingRound(){
      if(!meetingState) return
      const st=meetingState
      // STUCK watchdog: a meeting that has been active but collected NO new input for a long while
      // is deadlocked (e.g. an in-flight/hung resident, a run of failed wakes). Abandoning it returns
      // the group to normal self-organization (A heartbeat / B auto-sync can then re-drive) instead of
      // permanently blocking the whole group behind a broken meeting.
      if(now()-(st.lastInputAt||st.at||now())>=recoverStallMs()){
        meetingState=null; wakeKind.clear(); logActivity('meeting','abandoned (stuck: no resident spoke)')
        await saveAll(); await scheduleNext(); return
      }
      const ids=(st.rosterSnapshot||Array.from(residents.keys())).slice(); const allSpoke=ids.every(id=>st.inputs[id]!==undefined)
      if(allSpoke){ await finalizeMeeting(); return }
      // only wake IDLE un-spoken residents (rotated order); in-flight ones re-trigger this on end.
      // NOTE: we deliberately do NOT flush mailboxes here — drafting an un-spoken resident into a normal
      // mail round would delay the meeting and can starve the consensus past its watchdog if the mail
      // backlog is large. Mail is delivered on scheduleNext passes when no consensus is in progress.
      const order=st.order||ids
      const id=order.find(x=>st.inputs[x]===undefined && !busy.has(x))
      if(!id){ armHeartbeat(); return }   // no idle un-spoken resident (a busy/hung one): re-check later
      const r=residents.get(id)
      const ok = await wakeResident(r, meetingPrompt(r,st), 'meeting'); await saveAll()
      if(!ok) armHeartbeat()   // a failed meeting wake must NOT silently hang the meeting
    }
    async function finalizeMeeting(){
      if(finalizeLock) return   // reentry guard: two onResidentEnd may both see allSpoke → only finalize once
      finalizeLock='meeting'
      let doSchedule=false
      try {
        const st=meetingState
        const ids=(st.rosterSnapshot||Array.from(residents.keys())).slice(); const allSpoke=ids.length>0 && ids.every(id=>st.inputs[id]!==undefined)
        const lines=['# 会议 '+st.id+'｜'+fmtTime(),'','**议程**：'+st.agenda,'']
        for(const [id,iv] of Object.entries(st.inputs)){ lines.push('### '+id); lines.push(iv.input||''); lines.push('') }
        await writeText('Shared/meetings/'+st.id+'.md', lines.join('\n'))
        // the full transcript lives on disk (Shared/meetings/<id>.md); the State array keeps a small
        // index (id/agenda/at) so session.json does not carry a second copy of every transcript and
        // rewrite it on EVERY saveAll during long runs (reports below are capped for the same reason).
        meetings.push({id:st.id,agenda:st.agenda,at:now()}); if(meetings.length>200) meetings.shift()
        logDecision('meeting',st.agenda)
        // handle what the meeting produced: task proposals/claims, verify targets, stop vote
        for(const [id,iv] of Object.entries(st.inputs)){
          if(iv.propose_task) await proposeTask(iv.propose_task, iv.task_desc||'', id)
          if(iv.claim_task) await claimTask(iv.claim_task, id)
          if(iv.propose_verify) maybeQueueVerify(iv.propose_verify, id)
        }
        // ── the STOP vote must be UNANIMOUS, abstentions included ────────────────────────────────
        // `onResidentEnd` stores `voteSolved` only when it is a real boolean, otherwise `null`. The
        // old code filtered those nulls OUT and then asked `votes.every(v=>v===true)`, so a resident
        // that omitted the field (the meeting contract makes every key except `input` optional) or
        // wrote the string "true" simply dropped out of the electorate — and 3-of-4 voting true read
        // as "the whole team agrees the problem is solved" and STOPPED the run. `finalizeVerify` was
        // already written correctly (every resident must have a verdict); this mirrors it: every
        // speaker must have produced an explicit `true`.
        const speakers=Object.values(st.inputs)
        const allSolved = allSpoke && speakers.length>0 && speakers.every(iv=>iv.voteSolved===true)
        logActivity('meeting', 'concluded'+(allSolved?' → ALL agree solved':' (no unanimous solved vote)'))
        if(allSolved){
          // ── FINAL PAPER ENTRY (docs/final-paper.md §A1) ─────────────────────────────────────────────────
          // The paper phase MUST start HERE, BEFORE `running=false; autoDone=true` and before the
          // coordination state is released: afterwards `startMeeting` refuses (autoDone), this
          // handler's meeting/verify branches return early on `!running||autoDone`, and
          // `scheduleNext` does nothing — co-writing/merge/cross-review could never run. The run
          // therefore stays `running` while the team writes; `paperFinalize()` performs the
          // completion flip once the paper exists (or has degraded safely).
          meetingState=null; pendingMeeting=null; verifyState=null; pendingVerify=[]; wakeKind.clear()
          await saveAll()
          if(params.finalPaper){
            const paper=await paperStart('auto',{deferCompletion:true})
            if(paper&&paper.ok){
              logActivity('paper','收口：一致性停止票通过（'+PAPER_CLOSURE_SIGNAL+'）→ 进入最终论文阶段，论文完成后才标记完成')
              return
            }
            logActivity('paper','最终论文未能启动（'+((paper&&paper.message)||'unknown')+'）→ 按原路径收口')
          } else logActivity('paper','finalPaper=false：跳过最终论文，直接收口')
          running=false; autoDone=true; phase='done'; clearHeartbeat()
          logActivity('stop','all residents agree: problem solved'); await saveAll(); return
        }
        meetingState=null; wakeKind.clear(); await saveAll()
        doSchedule=true
      } finally { finalizeLock=null }   // release BEFORE scheduling so a chained verify/meeting is not swallowed
      if(doSchedule) await scheduleNext()
    }

    // ---- verification (unanimous) ----
    async function beginVerify(pv){
      clearHeartbeat()
      // Re-check dedup at ACTUAL start, not just at propose time: a resident may propose object X while
      // X is already being verified (it does not know). That proposal sits in the pendingVerify queue;
      // when the current X verify closes, beginVerify would run X end-to-end a SECOND time (test9:
      // p-r3-04 was verified twice back-to-back). Drop it if X was closed within the dedup window.
      // (pv was already popped from the FIFO queue by scheduleNext — nothing else to clear here.)
      const tgt=pv&&pv.targetId?String(pv.targetId):''
      if(tgt){
        const last=verifiedRecently.get(tgt)
        if(last!==undefined && (now()-last) < recoverStallMs()){
          logActivity('verify',tgt+' queued verify dropped at start (just verified at '+fmtTime(last)+')')
          await saveAll(); await scheduleNext(); return
        }
      }
      verifyState={targetId:pv.targetId,targetType:pv.targetType,targetOwner:pv.proposer||'',stage:'independent',round:0,asked:[],verdicts:{},history:{},transcript:[],at:now(),lastVerdictAt:now(),rosterSnapshot:Array.from(residents.keys()),rosterVersion}
      markProgress();
      logActivity('verify','debate begin: '+pv.targetId+' ('+pv.targetType+')'); await saveAll(); await scheduleNext()
    }
    async function continueVerifyRound(){
      if(!verifyState) return
      const vs=verifyState
      // STUCK watchdog: a verification that has been active but collected no new verdict for a long
      // while is deadlocked (e.g. an in-flight/hung resident). Abandoning it keeps the object as an
      // unverified probability (no unanimous consensus was reachable) and returns the group to normal
      // scheduling instead of blocking the whole team behind a broken verification.
      if(now()-(vs.lastVerdictAt||vs.at||now())>=recoverStallMs()){
        verifyState=null; wakeKind.clear(); logActivity('verify',vs.targetId+' abandoned (stuck: no unanimous verdict reachable)')
        await saveAll(); await scheduleNext(); return
      }
      const ids=(vs.rosterSnapshot||Array.from(residents.keys())).slice(); const allVoted=ids.every(id=>vs.verdicts[id]!==undefined)
      if(allVoted){ await finalizeVerify(); return }
      // NOTE: we deliberately do NOT flush mailboxes here — drafting an un-voted resident into a normal
      // mail round would delay its verdict and can starve the verify past its watchdog when the backlog
      // is large. Mail is delivered on scheduleNext passes when no consensus is in progress.
      const id=ids.find(x=>vs.verdicts[x]===undefined && !busy.has(x))
      if(!id){ armHeartbeat(); return }   // no idle un-voted resident (a busy/hung one): re-check later
      const r=residents.get(id)
      const ok = await wakeResident(r, verifyPrompt(r,vs), vs.stage==='independent'?'verif-ind':'verif-deb'); await saveAll()
      if(!ok) armHeartbeat()   // a failed verify wake must NOT silently hang the verification
    }
    async function finalizeVerify(){
      if(finalizeLock) return   // reentry guard (two onResidentEnd may both see allVoted)
      finalizeLock='verify'
      let doSchedule=false
      try {
        const vs=verifyState; // F4: the requirement set is the FROZEN snapshot (live map fallback), matching allVoted in the on-end path
    const expected=(vs.rosterSnapshot||Array.from(residents.keys())).length
        const allVoted = expected>0 && Object.keys(vs.verdicts).length>=expected
        const vals=Object.values(vs.verdicts)
        // verdict is a PURE 0-1 probability; only ALL=1 (true) or ALL=0 (false) is a binary verdict.
        const allTrue = allVoted && vals.every(x=>Number(x.prob)===1)
        const allFalse = allVoted && vals.every(x=>Number(x.prob)===0)
        if(allTrue||allFalse){
          // ── the `require` gate (docs §8) ───────────────────────────────────────────────
          // A unanimous verdict is a CONSENSUS, not a proof. In `require` mode the group has
          // decided that consensus alone may not be promoted to Verified/: the object must
          // also be either machine-checked (`passed`) or carry an explicit, reasoned
          // "we judged this infeasible" record (`blocked`). The gate never wedges the run — it
          // records 未定论 + a formalization TODO so the group keeps going and can formalize
          // later. This is the SINGLE choke point: every 真/假 promotion passes through here.
          const rec=formalOf(vs.targetId)
          if(formalMode()==='require' && !formalGateOk(rec)) await deferForFormal(vs,allTrue)
          else await closeVerify(vs,allTrue)
          doSchedule=true
        }
        else if(vs.round<params.verdictMaxRounds){
          // `verdictMaxRounds` is documented (README / 实现方案 / persona) as the maximum number of
          // verification rounds: 1 independent first vote + (verdictMaxRounds-1) debate re-votes. The
          // old `vs.round+1<verdictMaxRounds` gave one round FEWER than the name and the docs promise
          // (default 3 → only 2), so the parameter read as an off-by-one from every documented surface.
          // Move to a REAL debate round: snapshot the current votes into history (so the next round's
          // prompt can show others' previous stances), then CLEAR verdicts so every resident is asked to
          // give a fresh independent judgement after seeing the debate. Without the clear, allVoted stays
          // true and the debate rounds burn through with NOBODY being re-asked (a silent no-op).
          vs.history=Object.assign({}, vs.verdicts); vs.verdicts={}
          vs.lastVerdictAt=now()   // fresh deadlock window for the re-vote round
          vs.stage='debate'; vs.round+=1; vs.asked=[]; logActivity('verify',vs.targetId+' round '+vs.round+'/'+params.verdictMaxRounds+' → debate (re-vote after seeing others)'); await saveAll(); doSchedule=true
        }
        else {
          const avg=vals.length? vals.reduce((a,x)=>a+(x.prob!=null?x.prob:0.5),0)/vals.length : 0.5
          await writeDebateDoc(vs,false,avg); await rewriteSourceProb(vs.targetId, avg, vs.targetOwner); logActivity('verify',vs.targetId+' NOT unanimous → kept unverified (avg '+avg.toFixed(2)+')')
          verifyState=null; wakeKind.clear(); await saveAll(); doSchedule=true
        }
      } finally { finalizeLock=null }   // release BEFORE scheduling (chained verifies must not be swallowed)
      if(doSchedule) await scheduleNext()
    }
    async function closeVerify(vs,isTrue){
      await writeDebateDoc(vs,true,isTrue?1:0)
      const target=vs.targetId
      await writeVerifiedCard(vs,isTrue)
      await rewriteSource(target,isTrue,vs.targetOwner)
      verifiedRecently.set(target, now())   // dedup: block an immediate re-proposal of the same object
      // A formalization TODO that has just been satisfied must not linger in the todo file.
      if(formalOn() && formalTodos.some(t=>t.id===target)){
        formalTodos=formalTodos.filter(t=>t.id!==target)
        await saveFormal()
        try { await writeFormalTodo(); await writeFormalIndex() } catch(e){ /* best-effort */ }
      }
      logActivity('verify',target+' → Verified ('+(isTrue?'真':'假')+') by unanimous consensus'+(formalOn()?('｜形式化: '+formalStatusLine(target)):''))
      verifyState=null; wakeKind.clear(); await saveAll()
      // scheduling is done by finalizeVerify AFTER it releases finalizeLock (so a chained verify is
      // never swallowed by the still-held reentry lock)
    }
    /**
     * `require` mode withheld the verdict: record it as 未定论 with a machine-readable reason, put
     * the object on the formalization TODO, and say so in the activity log. The object keeps its
     * mean probability (留库附概率, exactly like a non-unanimous round) and stays where it was, so
     * nothing is lost and the group can carry on and formalize later. Deliberately NOT routed
     * through closeVerify: no Verified card may be written, and the source card's status must not
     * become 已验证·真/假.
     */
    async function deferForFormal(vs,isTrue){
      const target=vs.targetId
      const rec=formalOf(target)
      const why='formal-required：尚未取得 Lean 形式化通过，也没有显式阻塞记录（当前状态 '+(rec.status||'none')+'）'
      await writeDebateDoc(vs,false,isTrue?1:0)   // the 真/假 tally is recorded as the debate outcome
      const vals=Object.values(vs.verdicts)
      const mean=vals.length?vals.reduce((a,x)=>a+(x.prob!=null?x.prob:0.5),0)/vals.length:(isTrue?1:0)
      // The card stays in the library with the group's mean UNCHANGED relative to a normal
      // non-unanimous round: this is not a probability revision, it is a withheld conclusion.
      await rewriteSourceProb(target,mean,vs.targetOwner)
      if(!formalTodos.some(t=>t.id===target)) formalTodos.push({id:target,at:now(),why,verdict:isTrue?1:0})
      await putFormal(target,rec,formalTodos)   // single durable write of records + todo together
      try { await writeFormalTodo(); await writeFormalIndex() } catch(e){ /* best-effort */ }
      logActivity('verify',target+' 的表决结果为 '+(isTrue?'真':'假')+'，但 **require 模式**要求先有 Lean 通过或显式阻塞记录，因此本轮**不定论**（已记入 Formal/TODO.md；原因 formal-required）')
      verifyState=null; wakeKind.clear(); await saveAll()
      // Scheduling is done by finalizeVerify (doSchedule=true) AFTER it releases finalizeLock:
      // a withheld verdict must return the group to normal work immediately, exactly like a
      // normal 未定论 round. Without it the run would sit idle until the heartbeat fired.
    }
    // Queue a verify proposal UNLESS the same object was just verified (closed as 真/假). In parallel
    // self-organization several residents may independently propose targets while a verify is already
    // settling — sometimes the SAME object (test9: p-r3-04 was Verified twice back-to-back), sometimes
    // DIFFERENT objects (e.g. a sync meeting where each member proposes its own target). pendingVerify
    // is therefore a FIFO queue with per-target dedup: every distinct proposal is honored in order, and
    // duplicates collapse to one entry. A resident who genuinely extends the object later can still
    // re-propose after the dedup window (recoverStallMs) has passed.
    function maybeQueueVerify(target, proposer){
      const t=idSafe(target)   // sanitize BEFORE it becomes file names / dedup keys / status output
      if(!t || t==='id') return false
      // The object KIND is derived from the id prefix, and it decides BOTH the directory the Verified
      // card lands in (Verified/命题/ vs Verified/问题/) and the `- 类型:` line of the source card's
      // write-back. The old fallback mapped EVERY unrecognised id to 'proposition', so proposing a
      // method/sub-problem whose id does not start with m-/s- (e.g. `2.1`, `lemma-A`) silently wrote a
      // card into Verified/命题/ carrying `类型: 命题` — a card whose location and declaration disagree.
      // The prefix IS the coordination contract (the prompt hands residents `p-`/`m-`/`s-`), so an id
      // that does not carry one is refused HERE, at the single queueing funnel, instead of guessing.
      const tt=guessTargetType(t)
      if(!tt){
        logActivity('verify',t+' 的提议被拒绝：对象 id 必须以 p-（命题）/ m-（方法）/ s-（子问题）开头，否则框架无法确定它属于哪个库（V4_INVALID_ARGUMENT）')
        return false
      }
      const last=verifiedRecently.get(t)
      if(last!==undefined && (now()-last) < recoverStallMs()){
        logActivity('verify',t+' re-propose ignored (just verified at '+fmtTime(last)+')')
        return false
      }
      if(pendingVerify.some(p=>String(p.targetId)===t)) return true   // already queued → keep ONE entry
      pendingVerify.push({targetId:t,targetType:tt,proposer:proposer||'',at:now()})
      return true
    }
    async function writeDebateDoc(vs,done,val){
      const lines=['# 验证辩论｜'+vs.targetId+'('+vs.targetType+')｜'+fmtTime(),'',(done?('**结论**：'+(val===1?'全体一致为真':'全体一致为假')):('**未达成全体一致**，平均概率 '+val.toFixed(2))),'','## 各常驻意见']
      for(const [k,v] of Object.entries(vs.verdicts)){ lines.push('### '+k+'｜正确概率 '+(v.prob!=null?Number(v.prob).toFixed(2):'0.50')); lines.push(v.reason||''); lines.push('') }
      await writeText('Shared/debates/'+vs.targetId+'.md', lines.join('\n'))
    }
    async function writeVerifiedCard(vs,isTrue){
      const isSub=vs.targetType==='subproblem'
      const dir= isSub?'问题':'命题'
      const type= isSub?'问题': vs.targetType==='method'?'方法':'命题'
      // In a non-off formal mode the card must state HOW STRONG this conclusion actually is:
      // 'Lean 通过（Verified/Lean/<id>.lean）' means the kernel checked a formalization (whose
      // fidelity the m votes then reviewed); '阻塞（…）' means the group explicitly decided not
      // to formalize and said why. `off` mode is untouched — no formal line at all.
      const formalLine=formalOn()?('\n- 形式化: '+formalStatusLine(vs.targetId)):''
      const text='# 已验证｜'+vs.targetId+'\n- ID: '+vs.targetId+'\n- 类型: '+type+'\n- 结论: '+(isTrue?'真':'假')+'\n- 概率: '+(isTrue?1:0)+'\n- 来源: 全体常驻一致'+formalLine+'\n## 陈述\n参见来源卡。\n'
      await writeText('Verified/'+dir+'/'+vs.targetId+'.md', text)
    }
    // Does `content` declare the target as its card ID? Accept both the exact `- ID: <id>` and the
    // compact single-line form (`- ID: <id>; - 状态: ...`). Residents write cards by hand via fs with
    // varying formats and (crucially) sometimes put a DIFFERENT file name than the declared ID (e.g.
    // Propos/r-3/p-01.md declares "- ID: p-r3-01"). Matching only on the file name then silently loses
    // the verified-status write-back, so we scan candidates' declared ID too.
    function cardDeclaresId(content, target){
      if(!content || !target) return false
      const m=/-\s*ID:\s*([^;\n]+)/.exec(content)
      return !!(m && String(m[1]).trim()===String(target).trim())
    }
    async function findSourceRel(target, owner){
      // 1) exact file name in the owner's library (fast path), then every resident's library
      const order = owner ? [owner, ...Array.from(residents.keys()).filter(k=>k!==owner)] : Array.from(residents.keys())
      for(const rid of order){
        for(const base of ['Propos','Methods','Subproblems']){
          const cand=base+'/'+rid+'/'+target+'.md'
          const t0=await readText(cand); if(t0!==undefined) return cand
        }
      }
      // 2) declared-ID scan: residents sometimes name the file differently from the declared card ID
      //    (e.g. p-01.md declares ID p-r3-01). Look inside every card of every library for the target ID.
      try {
        for(const rid of order){
          for(const base of ['Propos','Methods','Subproblems']){
            const dirT=await fs.resolve(base+'/'+rid, {cwd: frameworkRoot()})
            if(await fs.stat(dirT)===undefined) continue
            const entries=await fs.listDir(dirT)
            for(const e of entries||[]){
              if(!e || e.type!=='file' || !/\.md$/.test(String(e.name))) continue
              const c=await readText(base+'/'+rid+'/'+e.name)
              if(c!==undefined && cardDeclaresId(c,target)) return base+'/'+rid+'/'+e.name
            }
          }
        }
      } catch(e){ /* scanning is best-effort */ }
      return null   // NOT 'Propos/'+target+'.md': writing there would create a stray empty card
    }
    // Update the `- 状态:` / `- 概率:` fields of a source card. Residents hand-write cards in two
    // shapes: one field per line, or one line with `; `-separated fields. Accept both by allowing the
    // anchor anywhere on a line and consuming up to the next `;` when fields share the line.
    function rewriteCardField(text, field, newValue){
      if(!text) return text
      const esc=field.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
      // one-per-line: `- 状态: ...\n`  OR  inline: `; - 状态: ...;` / `- 状态: ...; - 概率:`
      const re=new RegExp('(^|\\n|;\\s*)-\\s*'+esc+':[^;\\n]*','gm')
      const replaced=text.replace(re,'$1- '+field+': '+newValue)
      return replaced===text ? text : replaced
    }
    // non-unanimous verification: keep the object in its library but write back the
    // average probability (design §8: "留库附概率"), so the card reflects the consensus estimate.
    async function rewriteSourceProb(target,prob,owner){
      const rel=await findSourceRel(target,owner)
      if(!rel){ logActivity('verify',target+' source card NOT found; avg prob '+Number(prob).toFixed(2)+' not written back'); return }
      let text=(await readText(rel))||''
      const next=rewriteCardField(text,'概率',Number(prob).toFixed(2))
      await writeText(rel,next||text)
    }
    async function rewriteSource(target,isTrue,owner){
      // find & update the source card status/prob; best effort across per-resident libs
      const rel=await findSourceRel(target,owner)
      if(!rel){ logActivity('verify',target+' source card NOT found; verified status not written back'); return }
      let text=(await readText(rel))||''
      let next=rewriteCardField(text,'状态',isTrue?'已验证·真':'已验证·假')
      next=rewriteCardField(next,'概率',isTrue?'1':'0')
      await writeText(rel,next||text)
    }
    function guessTargetType(id){ if(/^p-/.test(id)) return 'proposition'; if(/^m-/.test(id)) return 'method'; if(/^s-/.test(id)) return 'subproblem'; return '' }
    // Human-readable word for the target kind, used in the prompts. Never print the RAW internal
    // token: the voter is a model, and `proposition`/`method`/`subproblem` in an otherwise Chinese
    // contract is exactly the kind of untranslated placeholder these audits look for.
    function targetTypeWord(t){ return t==='method'?'方法':(t==='subproblem'?'子问题':'命题') }

    // ---- heartbeat / liveness helpers (boundary-A: event-driven + gated heartbeat) ----
    // A checkpoint wake is NOT "keep working forever": it nudges the least-recently-active
    // resident, after an idle timeout, to CONTINUE the work itself (self-drive), and only to
    // propose a meeting/verify/solved when it truly has nothing left. This keeps the group moving
    // on its own (framework never assigns work) but adds convergence pressure instead of letting
    // a stalled group sit idle forever.
    function heartbeatPrompt(r){
      return (params.residentPersona?params.residentPersona+'\n':'')
        +'Resident researcher '+r.rId+' — CHECKPOINT（团队空闲，请由你们继续自主推进）。当前项目尚未解决（除非你已确认）。团队在等待有人继续：请**继续解决这个问题**——读他人的库对齐、推进某个子问题/引理/方法、尝试一条路线；或向团队发消息（input）、提议任务（propose_task）让大家分工。若你确实认为问题已解决、或已彻底无路可走，才提议开会（propose_meeting）让团队表决/商量、或声明 solved=true。默认立场是：**请推进，而不是停在原地。**\n'
        +(leanDailyOn()?(formalWorkLine()+'\n'):'')
        // math_computation availability (cached; `normalPrompt` awaits the refresh, so a heartbeat
        // that follows a wake is never cold).
        +(mathAvailabilityBlock()?(mathAvailabilityBlock()+'\n'):'')
        +'Reply with ONLY a JSON object:\n'
        +'{"summary":"<what you will do / what you advanced this round>","input":"<optional: a message to the whole team, or \\"\\">","solved":false,"propose_verify":"<id|null>","propose_meeting":"<agenda|null>","propose_task":"<task title|null>","task_desc":"<optional: why this task matters / what it covers|null>","claim_task":"<id|null>","contextPct":40'
        +(formalOn()?(',"formal":{"target":"<对象 id>","decision":"used|blocked|defect","file":"Formal/<对象 id>.lean","note":"难度判断/阻塞原因/具体偏差"}'):'')
        +'}'
    }
    function clearHeartbeat(){ if(heartbeatDisposer!==null){ try{ heartbeatDisposer() }catch(e){} heartbeatDisposer=null } }
    function armHeartbeat(){
      clearHeartbeat()
      const ms=posMs(params.activityTimeoutMs,120000)
      if(typeof ctx.timeout!=='function') return
      // §2.2: the EXISTING heartbeat is the queue driver (same place, same discipline as the paper
      // retry: independent of `scheduler.running`). `runLeanQueue()` is one boolean when idle.
      heartbeatDisposer=ctx.timeout(()=>{ heartbeatDisposer=null; runLeanQueue().catch(()=>{}).then(()=>scheduleNext().catch(()=>{})) }, ms)
      // Keep the math availability line current (engines can be installed while a run is live). The
      // module's probe cache makes this a no-op after the first probe.
      refreshMathAvailability().catch(()=>{})
    }
    // Real DSH /compact of a resident's OWN session via ctx.compaction (if the host provides it);
    // falling back silently to the resident self-summary directive when the service is absent.
    //
    // WHY THE LIVE-AGENT CACHE EXISTS: `subagent/end` fires AFTER the child's Activation has
    // been torn down. The host's teardown order is
    //   dsh-subagent/lib/index.js:1231  await activation.handle.dispose()
    //   dsh-agent/lib/index.js:508      this.store.delete(entry.id)      <- child leaves the registry
    //   dsh-subagent/lib/index.js:1241  activation.observer.settle(...)  <- ONLY NOW is subagent/end emitted
    // so `agents.get(childId)` inside an end handler ALWAYS returns undefined. Looking the child
    // up there made this entire path dead code. Instead we capture the live Agent when
    // `subagent/start` fires (the child is still registered then) and hold it in a WeakRef so a
    // resident that is never released cannot pin its Agent forever.
    const liveAgents = new Map()   // childId -> WeakRef<Agent>
    function rememberAgent(childId, agent){ if(childId && agent){ try { liveAgents.set(childId, new WeakRef(agent)) } catch(e){ liveAgents.set(childId, { deref:()=>agent }) } } }
    function forgetAgent(childId){ liveAgents.delete(childId) }
    function liveAgentOf(childId){
      const ref=liveAgents.get(childId)
      if(ref){ const a=typeof ref.deref==='function'?ref.deref():undefined; if(a) return a }
      // fallback: a host that keeps the child registered through the end notification
      try { return agents.get(childId) } catch(e){ return undefined }
    }
    /**
     * Resolve the compaction service a CHILD AGENT should use — i.e. through that
     * agent's own context, not this plugin's.
     *
     * Each preset group declares `isolate: { compaction: true, toolResultPruner: true }`
     * (copied verbatim from DSH's own `standard` preset, whose comment states the realm's
     * purpose: "What a preset chooses is whether its agent compacts at all, which is
     * `compaction-basic` below"). A row sitting OUTSIDE that realm resolves the HOST ROOT
     * instance instead, so this plugin's calls would ignore the preset's own compaction
     * config, and the sub-agent's step-boundary compaction (which runs from inside the
     * realm) would use a different instance than the framework's calls here.
     *
     * `Agent.ctx` is documented as "Agent-scoped context; its contributions are
     * agent-local" (dsh-agent/lib/types/runtime-types.d.ts:148), so the child's own
     * context resolves the preset plane the child actually lives on. This keeps the
     * plugin row where it is (nothing else moves in or out of the realm) while making
     * both compaction paths agree on one instance.
     */
    // ---- toolFilter names the host may not register -------------------------
    // `tools.restrict` throws for a name outside the host's restrictable set, and that throw escapes
    // child creation, so one stale name in `vibe_v4_set{toolAllow|toolDeny}` would make every spawn
    // fail with no operator-facing message. The host's own rejection lists every registered tool, so
    // the retry below never guesses. FAIL CLOSED: if nothing survives the filter we rethrow instead of
    // spawning WITHOUT one (that would grant exactly what the operator denied).
    async function startWithToolFilter(toolFilter, makeSpec){
      try {
        return await subagents.startContinuable(makeSpec(toolFilter))
      } catch(e){
        const message = String((e && e.message) || e)
        const retry = sanitizeToolFilter(toolFilter, registeredToolsFromError(message))
        if(retry===undefined){
          console.error('vibe-math-v4: 配置的工具过滤只包含本宿主未注册的工具名，拒绝在不带过滤的情况下启动子代理。filter=' + JSON.stringify(toolFilter) + ' 宿主提示：' + message)
          throw e
        }
        if(JSON.stringify(retry) === JSON.stringify(toolFilter)) throw e
        console.error('vibe-math-v4: 工具过滤里有本宿主未注册的名字，已只保留已注册的名字重试。dropped=' + JSON.stringify(toolFilter) + ' kept=' + JSON.stringify(retry))
        // a FRESH spec (and a fresh timeout signal) for the retry
        return await subagents.startContinuable(makeSpec(retry))
      }
    }

    function compactionForAgent(agent){
      try { const c = agent && agent.ctx ? agent.ctx.get('compaction') : undefined; if(c && c.compactIfNeeded) return c } catch(e){}
      // fallback: this plugin's own plane (host root for a row outside the realm)
      return compactionOf()
    }
    async function realCompact(r){
      if(!r || !r.childId) return
      const agent = liveAgentOf(r.childId)
      if(!agent || !agent.session) return
      const compaction = compactionForAgent(agent)
      if(compaction===undefined) return
      // `compactIfNeeded` is a POLICY call on the current host: it may return null without compacting
      // and nothing records that, so a real /compact would silently do nothing. `compactNow` is the
      // forcing verb; feature-detected so older hosts keep the policy call.
      const force = typeof compaction.compactNow === 'function'
      if(!force && typeof compaction.compactIfNeeded !== 'function') return
      try {
        const signal = makeSignal(params.activityTimeoutMs||60000)
        const result = force ? await compaction.compactNow(agent, signal) : await compaction.compactIfNeeded(agent, 'pressure', signal)
        if(result && (result.shadowedSeqs||[]).length>0){
          // the resident's real session was compacted → its context is now a summary.
          // Flag needCompact so the NEXT wake re-anchors the core rules (they may have been blurred).
          r.roundsSinceCompact=0; r.needCompact=true; r.contextPct=Math.min(r.contextPct||15,25)
          logActivity('compact', r.rId+' real /compact (shadowed '+result.shadowedSeqs.length+' items, ~'+String(result.shadowedTokenCount||0)+' tokens)')
        }
      } catch(e){ /* real compaction unavailable/failed; the soft directive already covers it */ }
    }

    // ---- liveness / scheduling ----
    async function scheduleNext(){
      if(!running||autoDone){
        // A MANUALLY triggered final paper may run on an already-concluded run; it is the one thing
        // that still needs the timer, so it keeps its own pacing here (paperAdvance re-arms the
        // heartbeat while it waits and clears it once the paper is done).
        if(paperState&&paperState.status!=='done'&&paperState.status!=='failed'){ try{ await paperAdvance('scheduler-concluded') }catch(e){} return }
        clearHeartbeat(); return
      }
      // The run is CONCLUDING (its closing meeting voted unanimously to stop): the ONLY remaining
      // work is the final paper. No new research round may be dispatched behind it (docs/final-paper.md §A1).
      if(paperState&&paperState.status!=='done'&&paperState.status!=='failed'){
        try{ await paperAdvance('scheduler-paper') }catch(e){ console.error('vibe-math-v4: paper pass failed: '+String((e&&e.message)||e)) }
        return
      }
      // Residents the host's live-child cap refused are retried here — the single choke point every
      // scheduling pass goes through — so a refused spawn is deferred by a whole round (and paced by
      // the heartbeat) instead of being retried inside the loop that discovered the refusal.
      if(pendingSpawns.length) await retryPendingSpawns()
      // Queued mail MUST also be delivered while the group is still brainstorming (Round C, F1).
      // A human/team message is not "work": the brainstorm phase used to return at the next line
      // before ever reaching the delivery point below, so a wake that FAILED left the message
      // re-queued and every subsequent heartbeat firing a no-op (`maybeFinishBrainstorm` only flips
      // the phase once every resident has an insight). The scheduler then stayed cold with mail
      // still queued — the exact permanent stall F1 exists to remove, narrowed to this phase
      // (_oneoff/probe-v4-mailbox-stall.mjs used to print REPRODUCED here).
      // Deliberately conditioned on "no consensus in progress": continueMeetingRound /
      // continueVerifyRound refuse to flush mailboxes on purpose (a backlog must not starve a
      // consensus past its watchdog, see their comments), so a parked meeting/verify keeps that
      // guarantee and the mail goes out on the first pass after the consensus closes.
      if(!meetingState && !verifyState){ const delivered=await deliverNextMailbox(); if(delivered) return }
      if(phase==='brainstorm'){ await maybeFinishBrainstorm(); return }
      if(meetingState){ await continueMeetingRound(); return }
      if(verifyState){ await continueVerifyRound(); return }
      if(pendingVerify.length){ const pv=pendingVerify.shift(); await beginVerify(pv); return }
      // A meeting requested while a verify held the floor is parked in pendingMeeting; once the
      // verify queue has truly drained (no verifyState / pendingVerify), resume it before anything else.
      if(pendingMeeting){ const pm=pendingMeeting; pendingMeeting=null; await startMeeting(pm.agenda, pm.type, pm.targetId); return }
      // mailbox delivery. `wakeResident` CLEARS the heartbeat as its first act, so a pass that delivers
      // NOTHING must not return without re-arming one: a rejected `sendMessage`
      // (subagent/delivery-unavailable, a cold-resumed child whose Activation closed, a transient
      // persistence failure) re-queues the message, refreshes the recipient's lastActiveAt (so the fill
      // loop below skips it for a whole activityTimeoutMs) and used to end the pass with no wake, no
      // heartbeat and no in-flight turn — nothing else could ever re-drive the scheduler, so the whole
      // group stopped permanently with mail still queued. Falling through instead lets the branches
      // below re-arm (and B/A still get their chance); on a SUCCESSFUL delivery the recipient's own
      // subagent/end re-drives the pump, so the pass can end here as before.
      const delivered=await deliverNextMailbox(); if(delivered) return
      // maxParallel: don't start a new wake when the in-flight cap is reached
      const mp=Number(params.maxParallel)||0
      if(mp>0 && busy.size>=mp){ armHeartbeat(); return }
      // Refresh the artifact counter from the residents' own card libraries (fs-written cards count
      // too) before the auto-sync test below, so `meetingKeepEvery` measures NEW artifacts — and
      // convene the sync meeting here, because this is the only place an `fs`-written card is seen.
      await syncArtifactCount()
      if(maybeArtifactSyncMeeting()) return
      // B) stall auto-sync meeting (分级保活 B): the group has been idle with NO progress for
      //    stallAutoMeetingMs → convene a sync meeting so the residents coordinate their next move
      //    (framework convenes & records; residents decide — never assigns work). Only when no
      //    meeting/verify/pending work is active AND no resident is currently working (so it never
      //    preempts an in-flight round).
      if(phase==='active' && !meetingState && !verifyState && pendingVerify.length===0 && busy.size===0){
        const stallMs=posMs(params.stallAutoMeetingMs, posMs(params.activityTimeoutMs,120000)*3)
        if(now()-lastProgressAt>=stallMs){
          await startMeeting('团队较长时间没有新进展。请你们自行讨论：当前问题是否已解决、开放难点是什么、谁负责哪部分、下一步如何推进，并自主决定是否继续。框架只负责转达与记录，不替你们决定。','general',null)
          return
        }
      }
      // A) heartbeat / coordination: wake IDLE residents after an idle timeout to SELF-DRIVE (continue
      //    solving / message / propose task / meeting / verify). This is a CONCURRENCY FILL, not a
      //    single nudge: scheduleNext should wake up to `maxParallel` idle residents in one pass so the
      //    group can progress in parallel (design §A: "同一时刻可唤醒多个空闲常驻，受 maxParallel 上限").
      //    On a FAILED wake we re-arm the heartbeat so a single follow-up error NEVER permanently stops
      //    the group (a successful wake re-drives scheduleNext through its own onResidentEnd, which re-arms).
      clearHeartbeat()
      const atOs=posMs(params.activityTimeoutMs,120000)
      // `mp` (maxParallel) is already declared above in this function scope.
      // Collect idle (not busy) residents sorted by idle time, oldest-first (round-robin fairness).
      const idleCandidates = Array.from(residents.values())
        .filter(r=>!busy.has(r.rId))
        .sort((a,b)=>(now()-b.lastActiveAt)-(now()-a.lastActiveAt))
      // Fill the concurrency budget: keep waking the most-idle resident until either everyone idle is
      // started OR the in-flight cap (maxParallel) is reached. This turns the previous "one at a time"
      // serialization into genuine parallel progress.
      let started=0
      for(const r of idleCandidates){
        const free = mp>0 ? (mp - busy.size) : Number.MAX_SAFE_INTEGER
        if(free<=0) break            // concurrency cap reached → stop filling
        if((now()-r.lastActiveAt)<atOs) break   // the remaining are all busy-or-not-idle-enough
        // A resident with no childId has nothing to wake (wakeResident would refuse): that is a
        // resident whose spawn the host cap refused, and it is retried by retryPendingSpawns() at
        // the top of the next pass — never in a tight loop here.
        if(!r.childId) continue
        let ok=false
        try { ok = await wakeResident(r, await heartbeatPrompt(r), 'normal') } catch(e){ ok=false }
        if(ok) started++
        await saveAll()
        if(!ok) continue             // a failed wake must NOT stop the fill; try the next idle resident
      }
      if(started>0) { armHeartbeat(); return }   // started some; re-drive comes via onResidentEnd, BUT also arm a
      // safety-net heartbeat so a woken resident whose subagent/end NEVER arrives (a hung normal round) does not
      // freeze the group. Below mp, the next scheduleNext will re-fill; if all woken residents are stuck busy the
      // heartbeat just re-arms harmlessly. (Meeting/verify already have recoverStallMs watchdogs; normal A-fill did not.)
      // everyone is busy or not idle-enough: arm a heartbeat to re-check later (no infinite spin)
      armHeartbeat()
    }
    async function maybeFinishBrainstorm(){
      const pending=[]; for(const [,r] of residents){ if(r.status==='brainstorm' && !r.insight) pending.push(r.rId) }
      if(pending.length===0){ phase='active'; logActivity('phase','active — residents now self-organize'); await saveBrainstormSummary(); await saveAll(); await scheduleNext() }
    }
    async function saveBrainstormSummary(){
      const lines=['# 头脑风暴','']; for(const [,r] of residents){ if(r.insight){ lines.push('## '+r.rId+'「'+(r.direction||'')+'」'); lines.push(r.insight); lines.push('') } }
      await writeText('Shared/meetings/brainstorm.md', lines.join('\n'))
    }
    async function deliverNextMailbox(){
      // Deliver queued messages to ALL currently-idle recipients in one pass (parallel), bounded by the
      // same maxParallel concurrency cap, so a group chat (relayToGroup → many non-busy recipients) is
      // not serialized one-message-at-a-time. Returns true if anything was delivered. A busy recipient
      // keeps its message queued (avoid starving others).
      let delivered=false
      for(const [to,msgs] of mailboxes){
        if(msgs.length===0) continue
        const r=residents.get(to); if(!r){ mailboxes.delete(to); continue }   // stale recipient → drop the entry
        if(busy.has(to)) continue   // recipient busy → leave the message queued for a later pass
        const mp=Number(params.maxParallel)||0
        if(mp>0 && busy.size>=mp) break   // concurrency cap reached → stop delivering more now
        const m=msgs.shift()
        currentResident=to
        const ok = await wakeResident(r, (await normalPrompt(r))+'\n\n[MESSAGE from '+m.from+']\n'+m.content,'normal')
        await saveAll(); if(!ok) msgs.unshift(m); delivered=delivered||ok
      }
      return delivered
    }

    // ---- resident end handler ----
    async function onResidentEnd(childId, info){
      const r=byChild(childId); if(!r) return
      // A turn that is NOT marked busy is a duplicate/stale end (the same subagent/end delivered twice,
      // or an end for a turn already settled). Without this guard every side effect below — task
      // proposal, group relay, verify queueing, meetings.push — would run a SECOND time (the
      // duplicate-task/duplicate-stop class from test9 reappears whenever a host re-delivers an end).
      // Every legitimate end corresponds to a busy turn: busy is added at spawn/wake and cleared only
      // here, on wake failure, on removeMember, or on respawn (whose stale childIds no longer match).
      if(!busy.delete(r.rId)) return
      // Any resident turn that COMPLETED is real activity for the stall clock (B). Residents frequently
      // write their libraries via direct fs (not the record* tools), so relying only on
      // bumpArtifacts/markProgress would leave lastProgressAt stale and B would fire against an active
      // team. We count only a clean 'completed' turn: an error/max-tokens/refusal did NOT meaningfully
      // advance the work, so it must NOT mask a truly stalled group (B can then convene a recovery
      // meeting). A completed turn also refreshes the meeting/verify deadlock clock through lastInputAt.
      if(info && info.stopReason==='completed') markProgress()
      realCompact(r).catch(()=>{})   // best-effort real DSH /compact of this resident while idle
      const output=blocksToText(info&&info.lastAssistantMessage)
      const parsed=parseReply(output)
      const kind=wakeKind.get(r.rId)||'normal'
      postmark(r, parsed, kind)   // context/compact bookkeeping — a mid-consensus turn may NOT ack a compaction it never received
      // The final-paper flow (docs/final-paper.md §A1) has its own wake kinds and its own state machine. It is
      // handled BEFORE the meeting/verify branches and before their `!running||autoDone` guards,
      // because a manually triggered paper legitimately runs on an already-concluded run.
      if(kind.indexOf('paper:')===0){ await onPaperWakeEnd(r,parsed); return }
      if(kind==='meeting' && meetingState){
        meetingState.inputs[r.rId]={input:parsed.input||parsed.summary||'',voteSolved:typeof parsed.voteSolved==='boolean'?parsed.voteSolved:null,propose_verify:parsed.propose_verify||null,propose_task:parsed.propose_task||null,task_desc:parsed.task_desc||'',claim_task:parsed.claim_task||null}
        meetingState.lastInputAt=now()
        if(parsed.propose_verify) maybeQueueVerify(parsed.propose_verify, r.rId)
        await saveAll()
        // PAUSE/stop: record the in-flight input/verdict but do NOT start any NEW consensus wake —
        // a paused run must stay paused (resume() refreshes the consensus clocks and re-drives).
        if(!running || autoDone) return
        await continueMeetingRound(); return
      }
      if((kind==='verif-ind'||kind==='verif-deb') && verifyState){
        const v=(parsed&&parsed.vote)||{}
        // Lean difficulty judgement carried on the SAME reply. Handled BEFORE the vote is stored
        // so a voter that says "I formalized it" / "I judge this infeasible" has that recorded
        // together with its verdict. Never allowed to throw into the scheduler.
        if(parsed.formal && typeof parsed.formal==='object') await applyFormalReply(r.rId, parsed.formal)
        // verdict = 0-1 probability the object is TRUE (1=绝对真, 0=绝对假, 0.5=不确定);
        // also accept legacy 'TRUE'/'FALSE' strings AND quoted numeric strings ("0.9"), which LLMs
        // occasionally emit — without this a confident "0.9" was silently misread as 0.5 (uncertainty).
        let p
        if(typeof v.verdict==='number'){ p=clamp01(v.verdict) }
        else if(/^TRUE$/i.test(String(v.verdict))){ p=1 }
        else if(/^FALSE$/i.test(String(v.verdict))){ p=0 }
        else if(typeof v.verdict==='string' && v.verdict.trim()!=='' && Number.isFinite(Number(v.verdict))){ p=clamp01(Number(v.verdict)) }
        else { p=clamp01(Number(v.confidence)) }
        // verdict is a PURE 0-1 probability (a degree); no binary TRUE/FALSE classification.
        verifyState.verdicts[r.rId]={prob:p,confidence:p,reason:String(v.reason||parsed.summary||'')}
        verifyState.lastVerdictAt=now()
        await saveAll()
        if(!running || autoDone) return   // pause: freeze (resume refreshes the clocks and re-drives)
        await continueVerifyRound(); return
      }
      // normal turn
      // The `formal` reply field is honoured on EVERY turn kind (docs §4: 回执里 formal:{target,
      // decision:'blocked'|'used'}), because the ordinary work round is where reusable objects are
      // formalized and where a difficulty judgement is most often stated.
      if(parsed.formal && typeof parsed.formal==='object') await applyFormalReply(r.rId, parsed.formal)
      if(r.status==='brainstorm'){ r.insight=parsed.summary||output; r.status='active' }
      if(typeof parsed.solved==='boolean'){ reports.push({rId:r.rId,solved:parsed.solved,summary:parsed.summary||'',at:now()}); if(reports.length>100) reports.shift() }   // solved-signal ring (not surfaced in status/report)
      if(parsed.propose_verify) maybeQueueVerify(parsed.propose_verify, r.rId)
      // group-conversation relay: the resident may choose to speak to the whole team (input) —
      // forward it to the others so this is a real discussion group, not private monologues.
      if(typeof parsed.input==='string' && parsed.input.trim()) await relayToGroup(r.rId, parsed.input.trim())
      // task actions via reply (a resident may propose or claim a task in its round)
      if(parsed.propose_task) await proposeTask(parsed.propose_task, parsed.task_desc||'', r.rId)
      if(parsed.claim_task) await claimTask(parsed.claim_task, r.rId)
      if(parsed.task_done) await taskDone(parsed.task_done, r.rId)
      // a resident may self-trigger a meeting (resident-driven coordination, closest to the philosophy).
      // If a verify is holding the floor the meeting is deferred (pendingMeeting) and we fall through
      // so the pending verify (or mailbox/heartbeat) still advances rather than being stuck behind it.
      if(parsed.propose_meeting && !meetingState){
        const mr=await startMeeting(String(parsed.propose_meeting),'general',null); await saveAll()
        if(mr && !mr.deferred) return
      }
      await saveAll(); await scheduleNext()
    }

    // ================= final paper (docs/final-paper.md §3-§5) =================
    // When v4's consensus has converged (§2: the unanimous "solved" meeting closed, no ballot in
    // flight, nothing queued) the run must produce a PAPER, not stop at a chat log. The team
    // co-authors it: every resident writes the part it owns, the facilitator (the framework)
    // MERGES the parts, every participant CROSS-REVIEWS at least one other part, the `paperEditor`
    // finalises the merged draft, and the paper is finalised only when every participant has
    // explicitly stated it is deliverable. Dissent iterates a bounded number of rounds and, at the
    // cap, the disagreement is recorded in the appendix and the run is warned about.
    //
    // Everything the paper states comes from EVIDENCE ALREADY ON DISK (Verified/ cards, Propos/
    // cards, Methods/ cards, Shared/meetings|debates/, the Lean records) or from the team's own
    // written parts. Nothing is invented; unresolved/refuted items are flagged as such.
    const PAPER_FORMATS=['both','md','tex'], PAPER_LANGS=['zh','en']
    // v2 §A5: v4's `facilitator` is NOT a roster member and has no LLM (it is the framework / the
    // human-side messenger), so "let the facilitator unify the notation" has no author. The editor is
    // therefore the SESSION ROOT (the office = the human side) by default, or one named resident.
    const PAPER_EDITOR_DEFAULT='office'
    function paperEditorOk(v){ const s=String(v==null?'':v).trim(); return s==='office'||/^resident:[^\s]+$/.test(s) }
    // v2 §A4: v4's REAL closure signal is the closing meeting's UNANIMOUS stop vote — the branch
    // below in `finalizeMeeting` (allSolved). The v1 wording ("every verify target decided / mailbox
    // empty") is stricter than the code and would never fire, so the paper phase is entered from
    // inside that exact branch and any still-未决 item is flagged in the paper instead.
    const PAPER_CLOSURE_SIGNAL='finalizeMeeting/allSolved（一致性会议的一致停止票）'
    const PAPER_MAX_ROUNDS=2          // bounded iterations after dissent (docs/final-paper.md §4: "有上限")
    const PAPER_NUDGE_TRIES=2         // paced re-asks before the step deadline declares a timeout
    const PAPER_WAIT_FLOOR_MS=2000    // a step's deadline is at least this (tests run with tiny timeouts)
    const PAPER_KINDS={part:'paper:part',review:'paper:review',final:'paper:final',vote:'paper:vote',revise:'paper:revise'}
    const PAPER_MARK={part:'[PAPER PART]',review:'[PAPER REVIEW]',final:'[PAPER FINAL]',vote:'[PAPER DELIVERABLE]',revise:'[PAPER REVISE]'}
    const PAPER_HEAD_ZH=['标题、作者、日期与摘要','引言与问题背景','原问题的完整解法','已检验通过的命题','已解决的子问题与中间成果','创造或发现的有价值之物','规律总结','讨论、局限与展望','附录：证据与文件索引']
    const PAPER_HEAD_EN=['Title, Authors, Date and Abstract','Introduction and Problem Background','Complete Solution of the Original Problem','Verified Propositions','Solved Sub-problems and Intermediate Results','Valuable Creations and Discoveries','Patterns and Reusable Principles','Discussion, Limitations and Outlook','Appendix: Evidence and File Index']

    function paperTitles(lang){ return lang==='en'?PAPER_HEAD_EN:PAPER_HEAD_ZH }
    /** The run id doubles as the v4 "institute id": Paper/<run id>/ (docs/final-paper.md §5). Sanitised through
     *  `idSafe`+`slugify`, so a hostile problem text/title can never produce `../`. */
    function paperIdFor(){ return idSafe(slugify('v4-'+problemId))+'-'+idSafe(runId) }
    function paperDirFor(){ return 'Paper/'+paperIdFor() }
    /** Containment (docs/final-paper.md §6): every paper write must stay inside `Paper/<id>/`. */
    async function paperWriteRel(rel,content){
      const dir=paperState?paperState.dir:paperDirFor()
      const norm=String(rel).replace(/\\/g,'/')
      if(norm.indexOf(dir+'/')!==0 || norm.indexOf('..')!==-1) return false
      return await writeText(norm,content)
    }
    function paperLog(line){ const ps=paperState; if(ps) ps.log.push(fmtTime()+'｜'+String(line)) }
    function paperStepLimit(){ return Math.max(PAPER_WAIT_FLOOR_MS, recoverStallMs()*4) }
    function paperCfg(ov){
      const o=ov||{}
      const ed=String(o.editor==null?'':o.editor).trim()
      return {
        language:PAPER_LANGS.indexOf(String(o.lang))!==-1?String(o.lang):params.paperLanguage,
        format:PAPER_FORMATS.indexOf(String(o.format))!==-1?String(o.format):params.paperFormat,
        editor:paperEditorOk(ed)?ed:(paperEditorOk(params.paperEditor)?String(params.paperEditor):PAPER_EDITOR_DEFAULT),
        compilePdf:params.paperCompilePdf!==false,
      }
    }
    /** `resident:<id>` -> the id, `office`/absent -> ''. */
    function paperEditorResidentId(editor){ const m=/^resident:([^\s]+)$/.exec(String(editor||'')); return m?m[1]:'' }
    // ---- evidence (every claim in §4-§9 of the skeleton must be traceable to one of these) ----
    async function paperListDirFiles(base){
      const out=[]
      try {
        const t=await fs.resolve(base,{cwd:frameworkRoot()}); if(await fs.stat(t)===undefined) return out
        for(const e of (await fs.listDir(t))||[]){ if(!e||e.type!=='file'||!/\.md$/.test(String(e.name))) continue
          const rel=base+'/'+e.name; out.push({rel,text:(await readText(rel))||''}) }
      } catch(e){ /* best effort: an absent directory is an empty evidence set */ }
      out.sort((a,b)=>a.rel<b.rel?-1:a.rel>b.rel?1:0); return out
    }
    async function paperListCards(base){
      const out=[]
      try {
        const root=await fs.resolve(base,{cwd:frameworkRoot()}); if(await fs.stat(root)===undefined) return out
        for(const d of (await fs.listDir(root))||[]){ if(!d||d.type!=='directory') continue
          const dir=base+'/'+d.name
          try {
            const t=await fs.resolve(dir,{cwd:frameworkRoot()}); if(await fs.stat(t)===undefined) continue
            for(const e of (await fs.listDir(t))||[]){ if(!e||e.type!=='file'||!/\.md$/.test(String(e.name))) continue
              const rel=dir+'/'+e.name; out.push({rel,text:(await readText(rel))||''}) }
          } catch(e2){ /* one unreadable library must not stop the scan */ }
        }
      } catch(e){ /* best effort */ }
      out.sort((a,b)=>a.rel<b.rel?-1:a.rel>b.rel?1:0); return out
    }
    function paperField(text,name){
      const esc=String(name).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
      const re=new RegExp('(?:^|\\n|;\\s*)-\\s*'+esc+':\\s*([^;\\n]*)')
      const m=re.exec(String(text||'')); return m?m[1].trim():''
    }
    async function paperEvidence(){
      const [verifiedFiles,problemFiles,propos,methods,subproblems,meetings,debates]=await Promise.all([
        paperListDirFiles('Verified/命题'), paperListDirFiles('Verified/问题'), paperListCards('Propos'),
        paperListCards('Methods'), paperListCards('Subproblems'), paperListDirFiles('Shared/meetings'), paperListDirFiles('Shared/debates'),
      ])
      const parse=f=>({rel:f.rel,id:paperField(f.text,'ID'),结论:paperField(f.text,'结论'),概率:paperField(f.text,'概率'),
        类型:paperField(f.text,'类型'),状态:paperField(f.text,'状态')||paperField(f.text,'状态'),标题:paperField(f.text,'标题'),
        可信断言:paperField(f.text,'可信断言'),text:f.text})
      return {
        problem:problemText, problemId:problemId, runId:runId, project:currentProject, converged:!!autoDone,
        verified:verifiedFiles.map(parse), verifiedProblems:problemFiles.map(parse),
        propos:propos.map(parse), methods:methods.map(parse), subproblems:subproblems.map(parse),
        meetings:meetings.map(f=>f.rel), debates:debates.map(f=>f.rel),
        formal:formalView().objects.map(o=>({target:o.target,status:o.status,file:o.file,proof:o.proof})),
        index:[...verifiedFiles,...problemFiles,...propos,...methods,...subproblems,...meetings,...debates].map(f=>f.rel).sort(),
      }
    }
    function paperHash(s){ let h=5381; const t=String(s==null?'':s); for(let i=0;i<t.length;i++) h=((h*33)^t.charCodeAt(i))>>>0; return h.toString(16).padStart(8,'0') }
    /** Idempotency is per (run id, finalizedAt) plus per-artifact existence — docs/final-paper.md §C explicitly
     *  drops v1's multi-file inputsHash. This only fingerprints one string for the log, never a
     *  decision. */
    function paperFingerprint(ev){ return paperHash([ev.problemId,ev.runId,ev.problem,ev.index.join('|')].join('\n')) }
    // ---- prompts (stable markers so the flow is observable/driveable) ----
    function paperPrompt(kind,rid,again){
      const ps=paperState, T=paperTitles(ps.cfg.language), zh=ps.cfg.language!=='en'
      const head=zh
        ? '【最终论文·团队合写】你（'+rid+'）是本次运行的参与常驻。'
        : '[FINAL PAPER — TEAM CO-AUTHORING] You ('+rid+') are a participating resident of this run.'
      const common=(zh?'\n论文目录：`'+ps.dir+'/`（一切写入必须在这里面）。只整理**已有证据**：你自己的库、Verified/、Shared/meetings|debates/ 与既有卡片；**不得编造**；未决/被否证的条目必须显式标注。'
        :'\nPaper directory: `'+ps.dir+'/` (everything you write stays inside it). Only organise EXISTING evidence (your own library, Verified/, Shared/meetings|debates/, the recorded cards); never invent; flag unresolved/refuted items explicitly.')
      if(kind==='part') return PAPER_MARK.part+'\n'+head+'\n'+(again?(zh?'（上一次没有收到你的部分，请重发。）\n':'(no part was received from you last time — please resend.)\n'):'')
        +(zh?'请撰写**你负责的那一部分**（你库里的命题/方法/子问题/进展，以及你亲自参与的会议与争论中确立的内容），成文即可，不必追求篇幅。\n'
            :'Write the part YOU own (the propositions/methods/sub-problems/progress in your library and what you personally established in meetings/debates).\n')
        +common+'\n'+(zh?'回复一个 JSON：`{"paperPart":{"title":"<部分标题>","markdown":"<正文 markdown>"}}`（也可以直接用 fs 写到 `'+ps.dir+'/parts/'+rid+'.md`）。'
            :'Reply with one JSON object: `{"paperPart":{"title":"<title>","markdown":"<body markdown>"}}` (you may also write `'+ps.dir+'/parts/'+rid+'.md` with fs).')
        +'\n'+(zh?'九节骨架：':"The paper's nine sections: ")+T.join(' / ')
      if(kind==='review') return PAPER_MARK.review+'\n'+head+'\n'+(again?(zh?'（上一次的互审没有指名**其他**参与者，请重发。）\n':'(your last review did not name ANOTHER participant — please resend.)\n'):'')
        +(zh?'合并稿见 `'+ps.dir+'/draft.md`。请**审阅至少一位其他参与者的部分**（不能审自己），指出具体问题并给出可落实的改进。\n'
            :'The merged draft is at `'+ps.dir+'/draft.md`. Review AT LEAST ONE OTHER participant\'s part (never your own), name concrete problems and give actionable improvements.\n')
        +common+'\n'+(zh?'回复一个 JSON：`{"paperReview":{"reviewed":"<被审的参与者 id>","points":["<问题>","..."],"improvements":"<你建议的改进>"}}`'
            :'Reply with one JSON object: `{"paperReview":{"reviewed":"<other participant id>","points":["..."],"improvements":"..."}}`')
      if(kind==='final') return PAPER_MARK.final+'\n'+head+'\n'
        +(zh?'你是本次的**定稿代表**（paperEditor）。请把合并稿 `'+ps.dir+'/draft.md` 与互审意见梳理成**最终稿**：去重、统一术语与记号，保留全部证据与未决标注。\n'
            :'You are the run\'s EDITOR (paperEditor). Turn the merged draft `'+ps.dir+'/draft.md` plus the review points into the FINAL draft: deduplicate, unify terms and notation, keep every evidence pointer and unresolved flag.\n')
        +common+'\n'+(zh?'回复一个 JSON：`{"paperFinal":{"markdown":"<最终稿正文 markdown>"}}`（或直接写 `'+ps.dir+'/final.md`）。'
            :'Reply with one JSON object: `{"paperFinal":{"markdown":"<final body markdown>"}}` (or write `'+ps.dir+'/final.md`).')
      // vote / revise
      return PAPER_MARK[kind]+'\n'+head+'\n'
        +(zh?'请阅读最终稿 `'+ps.dir+'/final.md`，然后**明确表态它是否可交付**。有反对必须说明理由（框架会迭代，超限会把分歧写进附录）。\n'
            :'Read the final draft at `'+ps.dir+'/final.md` and state EXPLICITLY whether it is deliverable. Any objection must state its reason (the framework iterates; at the cap the disagreement goes into the appendix).\n')
        +common+'\n'+(zh?'回复一个 JSON：`{"paperDeliverable":true|false,"reason":"<理由>"}`'
            :'Reply with one JSON object: `{"paperDeliverable":true|false,"reason":"<why>"}`')
    }
    // ---- state machine ----
    function paperHas(step,rid){
      const ps=paperState; if(!ps) return false
      if(step==='parts') return !!ps.parts[rid]
      if(step==='review') return !!ps.reviews[rid]
      if(step==='final') return !!ps.finalDraft
      if(step==='vote') return typeof ps.deliverable[rid]==='boolean'
      return false
    }
    function paperMarkMissing(step,rid){
      const ps=paperState
      if(step==='parts') ps.parts[rid]={text:'',missing:true,source:'missing'}
      else if(step==='review') ps.reviews[rid]={missing:true}
      else if(step==='final'){ if(!ps.finalDraft) ps.finalDraft=paperFacilitatorFinal() }
      else if(step==='vote') ps.deliverable[rid]=false
      paperLog('超时：'+rid+' 在 '+step+' 阶段未回应，已按"缺少该部分/未表态"记录')
    }
    async function paperWakeSome(ids,kind){
      const ps=paperState
      for(const rid of ids){
        const r=residents.get(rid)
        if(!r||!r.childId){ paperLog('警告：'+rid+' 已不在场，跳过 '+kind); paperMarkMissing(kind==='part'?'parts':kind==='review'?'review':kind==='final'?'final':'vote',rid); continue }
        if(busy.has(rid)) continue
        const ok=await wakeResident(r,paperPrompt(kind,rid),PAPER_KINDS[kind])
        if(!ok) paperLog('警告：无法唤醒 '+rid+' 执行 '+kind)
      }
      await paperWriteLog()
    }
    async function paperWait(step){
      const ps=paperState; if(!ps) return
      const miss=ps.participants.filter(x=>!paperHas(step,x))
      if(!miss.length) return await paperAdvance('wait-recheck')
      const nowTs=now()
      if(nowTs-ps.stepAt>=paperStepLimit()){
        for(const rid of miss) paperMarkMissing(step,rid)
        ps.warning=(ps.warning?ps.warning+'；':'')+'有参与者在 '+step+' 阶段超时未回应（'+miss.join('、')+'），已按"缺少该部分"记录并继续'
        paperLog('警告：'+ps.warning); ps.stepAt=nowTs
        await paperWriteLog(); return await paperAdvance('timeout')
      }
      // Paced re-ask: at most one nudge per stall window, and only PAPER_NUDGE_TRIES in total, so an
      // unresponsive host cannot produce a wake storm while the deadline is still open.
      if(nowTs-(ps.lastNudgeAt||0)>=posMs(params.activityTimeoutMs,120000)){
        ps.lastNudgeAt=nowTs
        for(const rid of miss){
          const key=rid+':'+step
          ps.attempts[key]=(ps.attempts[key]||0)+1
          if(ps.attempts[key]>PAPER_NUDGE_TRIES) continue
          const r=residents.get(rid)
          if(!r||!r.childId||busy.has(rid)) continue
          const ok=await wakeResident(r,paperPrompt(step,rid,true),PAPER_KINDS[step])
          if(!ok) paperLog('警告：无法唤醒 '+rid+'（'+step+' 重试）')
        }
        await paperWriteLog()
      }
      armHeartbeat()   // keep the clock running so the step deadline is actually reachable
    }
    async function paperAdvance(why){
      const ps=paperState
      if(!ps||ps.status==='done'||ps.status==='failed') return
      try {
        if(ps.status==='parts'){
          if(ps.participants.every(x=>paperHas('parts',x))) return await paperMerge()
          return await paperWait('parts')
        }
        if(ps.status==='review'){
          if(ps.participants.every(x=>paperHas('review',x))) return await paperFinalStep()
          return await paperWait('review')
        }
        if(ps.status==='final'){
          if(ps.finalDraft) return await paperVoteStep()
          return await paperWait('final')
        }
        if(ps.status==='vote'){
          if(!ps.participants.every(x=>paperHas('vote',x))) return await paperWait('vote')
          if(ps.participants.every(x=>ps.deliverable[x]===true)) return await paperFinalize()
          return await paperIterate()
        }
      } catch(e){ console.error('vibe-math-v4: paper step ('+(why||'')+') failed: '+String((e&&e.stack)||e)) }
    }
    async function paperMerge(){
      const ps=paperState
      const parts=ps.participants.map(rid=>({rid,text:String((ps.parts[rid]&&ps.parts[rid].text)||'')})).filter(p=>p.text.trim())
      const seen=new Map(), dups=[], terms=new Map(), conflicts=[], body=[]
      for(const p of parts){
        const paras=p.text.replace(/\r\n/g,'\n').split(/\n{2,}/)
        for(const raw of paras){
          const para=raw.trim(); if(!para) continue
          const norm=para.replace(/\s+/g,' ').toLowerCase()
          if(norm.length>=40 && seen.has(norm)){ dups.push({owner:seen.get(norm),dup:p.rid,head:para.slice(0,60)}); continue }
          if(norm.length>=40) seen.set(norm,p.rid)
          body.push(para)
          // Notation/term unification: the FIRST definition of a `- 术语: 定义` / `**术语**：…` line
          // wins; a different definition of the same term in another part is recorded as a conflict.
          const m=/^(?:[-*]\s*)?(?:\*\*)?([\u4e00-\u9fa5A-Za-z][^:：*]{0,24})(?:\*\*)?\s*[:：]\s*(\S.*)$/.exec(para)
          if(m){ const term=m[1].trim()
            if(!terms.has(term)) terms.set(term,{owner:p.rid,def:para})
            else if(terms.get(term).owner!==p.rid && terms.get(term).def!==para) conflicts.push({term,kept:terms.get(term).owner,conflict:p.rid}) }
        }
      }
      ps.draft=body.join('\n\n')
      const L=['# 合并稿（facilitator 合并）','','- 论文 id：'+ps.id,'- 参与成员：'+(ps.participants.join('、')||'（无常驻）'),
        '- 合并规则：跨部分**完全重复**的段落只保留首次出现；同一术语的**首个定义**为准，冲突记入下方。','']
      for(const p of parts) L.push('## 部分｜'+p.rid,'',p.text.trim(),'')
      L.push('## 合并说明','')
      L.push('- 去重：'+(dups.length?dups.map(d=>'「'+d.head+'…」（'+d.dup+' 重复了 '+d.owner+'）').join('；'):'无跨部分重复段落'))
      L.push('- 术语/记号统一：'+(terms.size?[...terms.entries()].map(([k,v])=>k+'（取 '+v.owner+' 的定义）').join('；'):'未识别到形如「术语：定义」的行'))
      L.push('- 术语冲突：'+(conflicts.length?conflicts.map(c=>c.term+'（保留 '+c.kept+'，'+c.conflict+' 的定义不同）').join('；'):'无'))
      ps.mergeNotes={dups:dups.length,terms:terms.size,conflicts:conflicts.length}
      paperLog('facilitator 合并完成：'+parts.length+' 个部分，去重 '+dups.length+' 段，统一术语 '+terms.size+' 个，冲突 '+conflicts.length+' 处')
      await paperWriteRel(ps.dir+'/draft.md',L.join('\n')+'\n')
      ps.status='review'; ps.stepAt=now(); ps.lastNudgeAt=0
      await paperWriteMeta(); await paperWriteLog()
      if(!ps.participants.length){ return await paperFinalStep() }
      await paperWakeSome(ps.participants.slice(),'review')
      await paperAdvance('review-started')
    }
    /** The framework's own finalisation (paperEditor='facilitator'): the merged body plus the review
     *  round APPLIED as an attributed revision block. No new claims are introduced. */
    function paperFacilitatorFinal(){
      const ps=paperState
      const L=[String(ps.draft||'').trim()]
      const rows=ps.participants.map(rid=>ps.reviews[rid]).filter(Boolean)
      if(rows.length){
        L.push('','## 互审改进（已采纳）')
        for(const rid of ps.participants){
          const rv=ps.reviews[rid]; if(!rv) continue
          if(rv.missing){ L.push('- '+rid+'：互审超时未提交（已记入附录）'); continue }
          const pts=(rv.points||[]).map(x=>'「'+x+'」').join('、')
          L.push('- '+rid+' → 审阅 '+rv.reviewed+'：'+(pts||'（未列出具体问题）')+(rv.improvements?('；改进：'+rv.improvements):''))
        }
      }
      return L.join('\n').trim()
    }
    async function paperFinalStep(){
      const ps=paperState
      ps.status='final'; ps.stepAt=now(); ps.lastNudgeAt=0
      const wantId=paperEditorResidentId(ps.cfg.editor)
      const r=wantId?residents.get(wantId):undefined
      if(wantId && r && r.childId){
        ps.editorId=wantId
        paperLog('定稿代表：resident:'+wantId+'（paperEditor 指定）')
        const ok=await wakeResident(r,paperPrompt('final',wantId),PAPER_KINDS.final)
        if(ok){ await paperWriteMeta(); await paperWriteLog(); armHeartbeat(); return }
        ps.warning='无法唤醒定稿代表 resident:'+wantId+'，降级到 office'
        ps.editorDowngraded=true; paperLog('警告：'+ps.warning)
      } else if(wantId){
        // v2 §A5: the named editor left the roster (e.g. removeMember) -> downgrade to office and
        // RECORD the downgrade in meta + paper.log.md (never silently substitute an author).
        ps.warning='定稿代表 resident:'+wantId+' 已不在编制（可能已被解雇），降级到 office'
        ps.editorDowngraded=true; paperLog('警告：'+ps.warning)
      }
      ps.editorId='office'
      paperLog('定稿代表：office（会话根/人类侧）—— 框架依 office 之责把合并稿与互审记录整理成最终稿')
      if(!ps.finalDraft) ps.finalDraft=paperFacilitatorFinal()
      await paperWriteRel(ps.dir+'/final.md',ps.finalDraft)
      await paperWriteMeta(); await paperWriteLog()
      return await paperVoteStep()
    }
    async function paperVoteStep(){
      const ps=paperState
      if(!ps.finalDraft) ps.finalDraft=paperFacilitatorFinal()
      await paperWriteRel(ps.dir+'/final.md',ps.finalDraft)
      ps.status='vote'; ps.stepAt=now(); ps.lastNudgeAt=0
      paperLog('交付表决：请全体参与成员明确表态"可交付"')
      await paperWriteMeta(); await paperWriteLog()
      if(!ps.participants.length) return await paperFinalize()
      await paperWakeSome(ps.participants.slice(),'vote')
      await paperAdvance('vote-started')
    }
    async function paperIterate(){
      const ps=paperState
      const against=ps.participants.filter(x=>ps.deliverable[x]!==true)
      ps.dissent=against.slice()
      ps.round+=1
      paperLog('第 '+ps.round+' 轮：'+against.join('、')+' 未表示可交付（'+(against.map(x=>ps.deliverable[x]===false?'明确反对':'未表态').join('；'))+'）')
      if(ps.round>ps.maxRounds){
        ps.warning=(ps.warning?ps.warning+'；':'')+'互审/交付迭代达到上限（'+ps.maxRounds+'）：'+against.join('、')+' 的分歧已写入附录'
        paperLog('警告：'+ps.warning)
        return await paperFinalize()
      }
      for(const rid of against) ps.deliverable[rid]=undefined
      ps.status='vote'; ps.stepAt=now(); ps.lastNudgeAt=0
      await paperWriteMeta(); await paperWriteLog()
      await paperWakeSome(against,'revise')
      await paperAdvance('revise-started')
    }
    // ---- content: the nine-section skeleton, built ONLY from evidence + the team's own text ----
    function paperExtractSection(draft,words){
      const lines=String(draft||'').split(/\r?\n/)
      let start=-1,level=0
      for(let i=0;i<lines.length;i++){
        const m=/^(#{1,6})\s*(.+)$/.exec(lines[i])
        if(m&&new RegExp(words,'i').test(m[2])){ start=i+1; level=m[1].length; break }
      }
      if(start<0) return ''
      const out=[]
      for(let i=start;i<lines.length;i++){
        const m=/^(#{1,6})\s*/.exec(lines[i])
        if(m&&m[1].length<=level) break
        out.push(lines[i])
      }
      return out.join('\n').trim()
    }
    function paperBullets(items,empty){ return items.length?items.map(x=>'- '+x).join('\n'):('- '+empty) }
    function paperCompose(ps,ev,cfg){
      const zh=cfg.language!=='en', T=paperTitles(cfg.language)
      const r=(a,b)=>zh?a:b
      const body=String(ps.finalDraft||ps.draft||'').trim()
      const truth=ev.verified.filter(v=>v.结论!=='假'), refuted=ev.verified.filter(v=>v.结论==='假')
      const pending=ev.propos.filter(p=>!['已验证·真','已验证·假'].includes(p.状态))
      const firstLine=String(ev.problem||'').split(/\r?\n/)[0].trim()
      const conclusion=r(
        (truth.length?('全体一致检验通过的命题 '+truth.length+' 条'+(refuted.length?('，被否证 '+refuted.length+' 条'):'')):'本轮没有取得全体一致的检验结论')+'；未决条目 '+pending.length+' 条。',
        (truth.length?('Verified propositions: '+truth.length+(refuted.length?('; refuted: '+refuted.length):'')):'No unanimously verified proposition this run')+'; unresolved items: '+pending.length+'.')
      const sec=[];
      sec.push({title:T[0],body:[r('**摘要**：原问题——',' **Abstract** — problem: ')+firstLine,
        r('主要结论：','Main conclusion: ')+conclusion].join('\n')});
      sec.push({title:T[1],body:[r('原问题（完整陈述）：','Original problem (full statement):'),'',String(ev.problem||''),
        '','- '+r('项目','Project')+'：'+ev.project,'- '+r('运行','Run')+'：'+ev.runId,'- '+r('状态','Status')+'：'+(ev.converged?r('已收敛','converged'):r('未收敛','not converged'))].join('\n')});
      sec.push({title:T[2],body:[body||r('（团队本轮没有产出正文；以下仅为已有证据的索引。）','(The team authored no body this run; only the evidence index below.)'),
        '','### '+r('最终答案与结论','Final answer and conclusions'),paperBullets(
          truth.map(v=>v.id+(v.概率?('（'+r('判定为真，估计值','true, estimate')+' '+v.概率+'）'):'')+' ← `'+v.rel+'`'),
          r('本轮没有被全体一致判定为真的命题','No unanimously true proposition this run'))].join('\n')});
      sec.push({title:T[3],body:[paperBullets(
        ev.verified.map(v=>{ const verdict=v.结论==='假'?r('已否证','refuted'):r('真','true')
          return '['+verdict+'] '+v.id+(v.概率?('｜'+r('概率','probability')+' '+v.概率):'')+'｜'+r('证据','evidence')+' `'+v.rel+'`'+(v.类型?('｜'+v.类型):'') }),
        r('本轮没有被检验通过的命题','No verified proposition this run')),
        '','### '+r('未决 / 未通过','Unresolved / not passed'),
        paperBullets(pending.map(p=>'[未决] '+p.id+'（'+r('状态','status')+'：'+(p.状态||'未定论')+'）｜`'+p.rel+'`')
          .concat(ev.formal.filter(f=>f.status!=='passed').map(f=>'[未决·形式化] '+f.target+'（'+f.status+'）'+(f.file?('｜`'+f.file+'`'):''))),
          r('无','none'))].join('\n')});
      sec.push({title:T[4],body:[paperBullets(
        ev.verifiedProblems.map(v=>'[已解决] '+v.id+'｜`'+v.rel+'`').concat(ev.subproblems.map(s=>'['+(['已验证·真','已验证·假'].includes(s.状态)?r('已解决','solved'):r('未决','unresolved'))+'] '+s.id+(s.标题?('「'+s.标题+'」'):'')+'｜`'+s.rel+'`')),
        r('本轮没有记录子问题','No sub-problem was recorded this run'))].join('\n')});
      sec.push({title:T[5],body:[paperBullets(
        ev.methods.map(m=>m.id+(m.标题?('「'+m.标题+'」'):'')+'（'+(m.类型||r('方法','method'))+'，'+(m.状态||r('经验','experiential'))+'）'+(m.可信断言?('｜'+r('可信断言','trusted claims')+'：'+m.可信断言):'')+'｜`'+m.rel+'`'),
        r('本轮没有记录方法/理论/工具','No method/theory/tool was recorded this run')),
        '',r('已归档的形式化产物：','Archived formal artifacts: ')+paperBullets(ev.formal.filter(f=>f.status==='passed').map(f=>f.target+(f.proof?('｜`'+f.proof+'`'):'')+(f.file?('｜`'+f.file+'`'):'')),r('无','none'))].join('\n')});
      const pattern=paperExtractSection(body,zh?'规律|总结|原理':'pattern|principle')
      sec.push({title:T[6],body:[pattern||[r('团队本轮没有单独撰写"规律总结"；以下为**有证据支撑**的可复用条目（取自方法卡与已验证命题），未作外推：',
        'The team did not author a separate "patterns" section; below are the EVIDENCE-BACKED reusable items (method cards and verified propositions), with no extrapolation:'),
        paperBullets(ev.methods.filter(m=>m.可信断言).map(m=>m.可信断言+'（`'+m.rel+'`）')
          .concat(truth.map(v=>v.id+'（`'+v.rel+'`）')),r('无','none'))].join('\n')].join('\n')});
      const disc=paperExtractSection(body,zh?'讨论|局限|展望':'discussion|limitation|outlook')
      sec.push({title:T[7],body:[disc||r('（团队未单独撰写讨论；以下为框架按证据整理的局限。）','(No separate discussion was authored; the framework lists the evidenced limitations.)'),
        '','### '+r('局限与未决','Limitations and open items'),
        paperBullets([
          r('未决/未通过条目 '+pending.length+' 条（见第 4 节，均已标注）','Unresolved items: '+pending.length+' (flagged in §4)'),
          r('被否证的命题 '+refuted.length+' 条（见第 4 节）','Refuted propositions: '+refuted.length+' (see §4)'),
          (ps.compile&&ps.compile.result==='failed')?r('PDF 编译失败：已保留 paper.tex 与 paper.md 并上报','PDF compilation failed: paper.tex and paper.md were kept and reported'):'',
          (ps.compile&&ps.compile.result==='not-detected')?r('本机未检测到 LaTeX 引擎：只产出 tex+md','No LaTeX engine detected: tex+md only'):'',
          ps.dissent.length?r('交付分歧（'+ps.dissent.join('、')+'）已写入附录','Deliverability dissent ('+ps.dissent.join(', ')+') is recorded in the appendix'):'',
          ps.warning?r('过程警告：'+ps.warning,'Process warning: '+ps.warning):'',
        ].filter(Boolean),r('无','none'))].join('\n')});
      sec.push({title:T[8],body:[r('证据与文件索引（全部相对于项目根）：','Evidence and file index (all relative to the project root):'),
        '',paperBullets(ev.index.map(p=>'`'+p+'`'),r('无','none')),
        '','- '+r('过程记录','Process log')+'：`'+ps.dir+'/paper.log.md`',
        '- '+r('元数据','Metadata')+'：`'+ps.dir+'/paper.meta.json`',
        '- '+r('各成员撰写部分','Per-member parts')+'：`'+ps.dir+'/parts/`',
        '- '+r('互审记录','Cross-review records')+'：`'+ps.dir+'/reviews/`',
        '- '+r('合并稿/最终稿','Merged / final draft')+'：`'+ps.dir+'/draft.md`、`'+ps.dir+'/final.md`',
        (ps.dissent.length||ps.round>ps.maxRounds)?['','### '+r('附录：交付分歧','Appendix: deliverability dissent'),paperBullets(ps.participants.filter(x=>ps.deliverable[x]!==true).map(x=>x+'：'+(ps.deliverable[x]===false?r('反对交付','objected'):r('未表态','no statement'))+'｜'+r('迭代轮次','rounds')+' '+ps.round+'/'+ps.maxRounds),r('无','none'))].join('\n'):'']
        .filter(Boolean).join('\n')});
      const title=r('Vibe-Mathematics v4 研究报告','Vibe-Mathematics v4 Research Report')+'｜'+firstLine.slice(0,60)
      const md=L=>L
      const mdText=['# '+title,'','- '+r('作者','Authors')+'：Vibe-Mathematics v4（'+r('运行','run')+' '+ps.runId+'）',
        '- '+r('日期','Date')+'：'+fmtTime(ps.finalizedAt||now()).slice(0,10),
        '- '+r('参与成员','Participants')+'：'+(ps.participants.join('、')||r('（无常驻）','(no residents)')),
        '- '+r('定稿代表','Editor')+'：'+(ps.editorId||cfg.editor),'',
        ...sec.map((s,i)=>['## '+(i+1)+'. '+s.title,'',s.body,''].join('\n'))].join('\n')
      const texBody=sec.map((s,i)=>'\\section{'+texEsc(s.title)+'}\n'+texEsc(s.body)).join('\n\n')
      const tex=paperTex(cfg,title,texBody)
      return {title, sections:sec, md:mdText, tex, texBody}
    }
    function paperTex(cfg,title,texBody){
      const zh=cfg.language!=='en'
      const cls=zh?'ctexart':'article'
      const pkgs=['amsmath','amssymb','amsthm','geometry','hyperref','longtable','booktabs']
      return ['% generated by vibe-math-v4 (final paper)','\\documentclass[11pt]{'+cls+'}',
        ...pkgs.map(p=>'\\usepackage{'+p+'}'),
        '\\title{'+texEsc(title)+'}','\\author{Vibe-Mathematics v4}','\\date{'+texEsc(fmtTime(now()).slice(0,10))+'}',
        '\\begin{document}','\\maketitle','',texBody,'','\\end{document}',''].join('\n')
    }
    /** tex escaping (docs/final-paper.md §5): every `_ % & # $ { } ~ ^ \\` becomes a safe command/escape. */
    function texEsc(s){
      const M={'\\':'\\textbackslash{}','{':'\\{','}':'\\}','$':'\\$','&':'\\&','#':'\\#','^':'\\textasciicircum{}','_':'\\_','%':'\\%','~':'\\textasciitilde{}'}
      let out=''; for(const ch of String(s==null?'':s)) out+=(M[ch]||ch); return out
    }
    // ---- compilation (detect → compile twice → capped repair → degrade; docs/final-paper.md §D/§E) ----
    // The host fs is TEXT-ONLY (dsh-fs has no writeBytes), so `paper.pdf` can only ever be produced
    // by the compiler subprocess inside `Paper/<id>/` — the plugin just `stat`s it. The Lean seam
    // (`sub.resolveExecutable` + `sub.spawn`) is reused verbatim so a fake compiler is injectable.
    async function paperDetectEngine(lang){
      const sub=subprocessOf(); if(sub===undefined) return {ok:false,tried:[],reason:'NO_SUBPROCESS'}
      const prefer=String(params.paperLatexCommand||'').trim()
      const base=lang==='en'?['pdflatex','latexmk','xelatex','lualatex','tectonic']:['xelatex','latexmk','pdflatex','lualatex','tectonic']
      const order=(prefer?[prefer]:[]).concat(base.filter(x=>x!==prefer))
      const tried=[]
      for(let i=0;i<order.length;i++){
        const exe=order[i]
        try { const r=await sub.resolveExecutable(exe); if(r) return {ok:true,exe:String(r),tried,alts:order.slice(i+1)} }
        catch(e){ tried.push(exe) }
      }
      return {ok:false,tried,reason:'LATEX_NOT_FOUND'}
    }
    function paperEngineArgv(exe,lang){
      if(/latexmk$/.test(exe)) return [exe,'-interaction=nonstopmode',lang==='en'?'-pdf':'-xelatex','paper.tex']
      return [exe,'-interaction=nonstopmode','paper.tex']
    }
    async function paperRunEngine(exe,argv,dir,cap){
      const sub=subprocessOf(); if(sub===undefined) return {ok:false,code:'NO_SUBPROCESS'}
      let handle
      try { handle=sub.spawn({argv,cwd:dir,stdio:{stdin:'ignore',stdout:{maxBytes:64*1024},stderr:{maxBytes:64*1024}},graceMs:cap}) }
      catch(e){ return {ok:false,code:'LATEX_SPAWN_FAILED',message:String((e&&e.message)||e)} }
      let killed=false,timerDispose=null,outcome
      try {
        outcome=await Promise.race([handle.done,new Promise(function(resolve){
          if(typeof ctx.timeout!=='function') return
          timerDispose=ctx.timeout(function(){ killed=true; try{ if(typeof handle.terminate==='function') handle.terminate() }catch(e){} resolve({exitCode:null,signal:'SIGTERM'}) },cap)
        })])
      } catch(e){ if(timerDispose){ try{ timerDispose() }catch(_e){} } return {ok:false,code:'LATEX_RUN_FAILED',message:String((e&&e.message)||e)} }
      if(timerDispose){ try{ timerDispose() }catch(e){} }
      let out='',err=''
      try { if(handle.collected&&handle.collected.stdout) out=handle.collected.stdout.readFrom(0).text } catch(e){}
      try { if(handle.collected&&handle.collected.stderr) err=handle.collected.stderr.readFrom(0).text } catch(e){}
      const exitCode=outcome?outcome.exitCode:null
      return {ok:exitCode===0,exitCode,timedOut:killed,stdout:tail(out,2000),stderr:tail(err,2000)}
    }
    async function paperPdfExists(dir){
      try { const t=await fs.resolve(dir+'/paper.pdf',{cwd:frameworkRoot()}); return !!(await fs.stat(t)) } catch(e){ return false }
    }
    /** v2 §E: at most ONE engine swap, then ONE minimal-template retry, then report + degrade. */
    async function paperCompile(ps,composed,ev){
      const dir=ps.dir
      // v2 §E: `paperFormat=md` produces no tex, so "cannot compile without tex" must NOT be warned.
      if(ps.cfg.format==='md') return {result:'skipped',reason:'paperFormat=md（未产出 tex，跳过编译）',attempts:[]}
      if(!ps.cfg.compilePdf) return {result:'skipped',reason:'paperCompilePdf=false',attempts:[]}
      // Never clobber an existing pdf (v2 §D): a previously compiled artifact is kept as-is.
      if(await paperPdfExists(dir)) return {result:'ok',engine:'existing',note:'已存在 paper.pdf，未覆盖',attempts:[]}
      const det=await paperDetectEngine(ps.cfg.language)
      if(!det.ok) return {result:'not-detected',reason:'未检测到 LaTeX 引擎（'+(det.tried.join('/')||'subprocess 不可用')+'）：只产出 tex+md，不编译',tried:det.tried,attempts:[]}
      const cap=posMs(params.activityTimeoutMs,120000)
      const attempts=[]
      const runTwice=async(exe,label,passes)=>{
        const argv=paperEngineArgv(exe,ps.cfg.language)
        let ok=true,first=null
        for(let i=0;i<(passes||2);i++){ const a=await paperRunEngine(exe,argv,dir,cap); if(i===0) first=a; if(!a.ok){ ok=false; break } }
        const pdf=await paperPdfExists(dir)
        attempts.push({stage:label,engine:exe,ok:!!(ok&&pdf),exitCode:first?first.exitCode:null,pdf,stderr:String((first&&first.stderr)||'').slice(0,300)})
        return {ok:!!(ok&&pdf),last:first}
      }
      let r=await runTwice(det.exe,'initial',2)
      if(r.ok) return {result:'ok',engine:det.exe,attempts}
      // repair 1: swap to another RESOLVABLE engine (same tex, nonstopmode, twice) — capped at one swap
      const sub=subprocessOf()
      for(const alt of det.alts||[]){
        let altExe=null
        try { if(sub) altExe=String(await sub.resolveExecutable(alt)) } catch(e){ continue }
        if(!altExe||altExe===det.exe) continue
        const rr=await runTwice(altExe,'engine-switch',2)
        if(rr.ok) return {result:'ok',engine:altExe,repaired:'engine-switch',attempts}
        break
      }
      // repair 2: ONE minimal-template retry (drops every optional package / custom preamble)
      await paperWriteRel(dir+'/paper.tex',paperMinimalTemplate(ps.cfg,composed.title,composed.texBody))
      const rr=await runTwice(det.exe,'minimal-template',1)
      if(rr.ok) return {result:'ok',engine:det.exe,repaired:'minimal-template',attempts}
      const last=attempts[attempts.length-1]||{}
      return {result:'failed',engine:det.exe,attempts,error:'编译失败（已按上限尝试换引擎/最小模板）：保留 paper.tex 与 paper.md，不阻塞定稿',tail:String(last.stderr||'')}
    }
    function paperMinimalTemplate(cfg,title,texBody){
      const cls=cfg.language==='en'?'article':'ctexart'
      return ['% generated by vibe-math-v4 (minimal fallback template)','\\documentclass[11pt]{'+cls+'}',
        '\\begin{document}','\\section*{'+texEsc(title)+'}','',String(texBody||''),'','\\end{document}',''].join('\n')
    }
    async function paperEnsureArtifacts(meta,cfg){
      const filled=[]
      const dir=String(meta.dir||('Paper/'+meta.id))
      const saved=paperState
      try {
        if(!paperState||paperState.id!==meta.id){
          paperState={ id:meta.id, dir, trigger:'recheck', deferCompletion:false, startedAt:meta.startedAt||now(), finalizedAt:meta.finalizedAt||0,
            status:'done', round:meta.rounds||0, maxRounds:PAPER_MAX_ROUNDS, cfg, fingerprint:meta.fingerprint||'',
            participants:Array.isArray(meta.participants)?meta.participants:[], parts:{}, reviews:{}, deliverable:{}, dissent:meta.dissent||[],
            log:[], warning:meta.warning||'', compile:meta.compile||null, draft:'', finalDraft:'', files:meta.files||[], stepAt:now(), lastNudgeAt:0, attempts:{}, editorId:meta.editorId||'' }
        }
        const ev=await paperEvidence()
        const body=await readText(dir+'/final.md')
        if(body!==undefined&&body!=='') paperState.finalDraft=body
        const composed=paperCompose(paperState,ev,cfg)
        const wantMd=cfg.format!=='tex', wantTex=cfg.format!=='md'
        const mdRaw=await readText(dir+'/paper.md'), texRaw=await readText(dir+'/paper.tex')
        if(wantMd&&mdRaw===undefined){ if(await paperWriteRel(dir+'/paper.md',composed.md)) filled.push('paper.md') }
        if(wantTex&&texRaw===undefined){ if(await paperWriteRel(dir+'/paper.tex',composed.tex)) filled.push('paper.tex') }
        if(cfg.compilePdf&&wantTex&&!(await paperPdfExists(dir))){
          const c=await paperCompile(paperState,composed,ev)
          paperState.compile=c
          if(c.result==='ok') filled.push('paper.pdf')
        }
        if(filled.length) await paperWriteMeta()
        return filled
      } finally { paperState=saved||null }
    }
    async function paperWriteMeta(){
      const ps=paperState; if(!ps) return false
      const meta={ id:ps.id, dir:ps.dir, generatedBy:'vibe-math-v4', preset:'v4', trigger:ps.trigger,
        runId, closureSignal:PAPER_CLOSURE_SIGNAL, startedAt:ps.startedAt, finalizedAt:ps.finalizedAt||0,
        params:{finalPaper:params.finalPaper,paperFormat:ps.cfg.format,paperLanguage:ps.cfg.language,paperCompilePdf:ps.cfg.compilePdf,paperEditor:ps.cfg.editor,paperLatexCommand:params.paperLatexCommand},
        editor:ps.cfg.editor, editorId:ps.editorId||'', editorDowngraded:!!ps.editorDowngraded, participants:ps.participants, rounds:ps.round, maxRounds:ps.maxRounds,
        fingerprint:ps.fingerprint||'', warning:ps.warning||'', files:ps.files||[], compile:ps.compile||null, mergeNotes:ps.mergeNotes||null,
        parts:Object.keys(ps.parts).sort().map(k=>({id:k,chars:String((ps.parts[k]||{}).text||'').length,missing:!!(ps.parts[k]||{}).missing,source:(ps.parts[k]||{}).source||''})),
        reviews:Object.keys(ps.reviews).sort().map(k=>({id:k,reviewed:(ps.reviews[k]||{}).reviewed||'',points:((ps.reviews[k]||{}).points||[]).length,improvements:(ps.reviews[k]||{}).improvements||'',missing:!!(ps.reviews[k]||{}).missing})),
        deliverable:Object.keys(ps.deliverable).sort().map(k=>({id:k,deliverable:ps.deliverable[k]})),
        dissent:ps.dissent||[] }
      return await paperWriteRel(ps.dir+'/paper.meta.json',JSON.stringify(meta,null,2))
    }
    async function paperWriteLog(){
      const ps=paperState; if(!ps) return false
      const L=['# 最终论文过程记录（paper.log.md）','','- 论文 id：'+ps.id,'- 触发：'+ps.trigger,
        '- 语言 / 格式 / 定稿代表：'+ps.cfg.language+' / '+ps.cfg.format+' / '+ps.cfg.editor,'- 参与成员：'+(ps.participants.join('、')||'（无常驻）'),
        '- 状态：'+ps.status,'']
      L.push('## 过程（谁写了什么）'); for(const l of ps.log) L.push('- '+l); L.push('')
      L.push('## 归属与处理（谁提了什么意见、如何采纳）')
      for(const rid of ps.participants){ const p=ps.parts[rid]
        L.push('- 撰写：'+rid+(p?(p.missing?'（超时未提交）':'（'+String(p.text||'').length+' 字，来源 '+(p.source||'reply')+'）'):'（未提交）')) }
      for(const rid of ps.participants){ const rv=ps.reviews[rid]
        if(!rv||rv.missing){ L.push('- 互审：'+rid+'（'+(rv?'超时未提交，已记入附录':'未完成')+'）'); continue }
        L.push('- 互审：'+rid+' → '+rv.reviewed+'，意见 '+((rv.points||[]).length)+' 条，处理：已采纳并记入合并稿审阅记录'+(rv.improvements?('（改进：'+String(rv.improvements).slice(0,200)+'）'):'')) }
      L.push('- 定稿：'+(ps.editorId||ps.cfg.editor))
      for(const rid of ps.participants) if(typeof ps.deliverable[rid]==='boolean') L.push('- 交付表态：'+rid+' = '+(ps.deliverable[rid]?'可交付':'不可交付'))
      if(ps.compile) L.push('- 编译：'+JSON.stringify({result:ps.compile.result,engine:ps.compile.engine||'',repaired:ps.compile.repaired||'',attempts:(ps.compile.attempts||[]).length,error:ps.compile.error||''}))
      if(ps.warning) L.push('- 警告：'+ps.warning)
      return await paperWriteRel(ps.dir+'/paper.log.md',L.join('\n')+'\n')
    }
    async function paperFinalize(){
      const ps=paperState
      const ev=await paperEvidence()
      ps.fingerprint=paperFingerprint(ev)
      // final.md / draft.md must exist before composing so a re-run is reproducible
      if(!ps.finalDraft) ps.finalDraft=paperFacilitatorFinal()
      await paperWriteRel(ps.dir+'/final.md',ps.finalDraft)
      const composed=paperCompose(ps,ev,ps.cfg)
      ps.files=[]
      if(ps.cfg.format!=='tex'){ if(await paperWriteRel(ps.dir+'/paper.md',composed.md)) ps.files.push('paper.md') }
      if(ps.cfg.format!=='md'){ if(await paperWriteRel(ps.dir+'/paper.tex',composed.tex)) ps.files.push('paper.tex') }
      ps.compile=await paperCompile(ps,composed,ev)
      if(ps.compile&&ps.compile.result==='ok') ps.files.push('paper.pdf')
      ps.finalizedAt=now(); ps.status='done'
      await paperWriteMeta(); await paperWriteLog()
      // v2 §A1: the paper phase was entered from INSIDE the closing branch, BEFORE the completion
      // flags — so the run only becomes "done" here, once the paper exists (or has degraded safely).
      if(ps.deferCompletion && autoDone!==true){
        running=false; autoDone=true; phase='done'; clearHeartbeat()
        wakeKind.clear(); meetingState=null; verifyState=null; pendingMeeting=null; pendingVerify=[]
        logActivity('stop','all residents agree: problem solved（一致性停止票；最终论文已产出）')
        await saveAll()
      }
      const warn=[ps.warning,ps.compile&&ps.compile.result==='failed'?ps.compile.error:''].filter(Boolean).join('；')
      if(warn) logActivity('paper','最终论文完成（有警告）：'+ps.dir+'｜'+warn)
      else logActivity('paper','最终论文完成：'+ps.dir+'（'+ps.files.join('、')+(ps.compile?('｜编译 '+(ps.compile.result||'')):'')+'）')
      return {ok:true,id:ps.id,dir:ps.dir,files:ps.files,compile:ps.compile,rounds:ps.round,dissent:ps.dissent,warning:ps.warning}
    }
    function paperStatusView(){
      const ps=paperState
      return {
        params:{finalPaper:params.finalPaper,paperFormat:params.paperFormat,paperLanguage:params.paperLanguage,paperCompilePdf:params.paperCompilePdf,paperEditor:params.paperEditor,paperLatexCommand:params.paperLatexCommand},
        id:ps?ps.id:paperIdFor(), dir:ps?ps.dir:paperDirFor(), status:ps?ps.status:'idle',
        // round-9 (F2): with no paper state this path is a PROJECTION (f2: paperIdFor/paperDirFor are
        // pure - reading `status` touches no fs and creates no directory). Say so explicitly instead of
        // handing callers a path that looks like it exists.
        dirProjected:!ps, dirSource:ps?'paper-state':'projection', readSideEffect:false,
        running:!!(ps&&ps.status!=='done'&&ps.status!=='failed'), trigger:ps?ps.trigger:'',
        rounds:ps?ps.round:0, maxRounds:ps?ps.maxRounds:PAPER_MAX_ROUNDS, participants:ps?ps.participants:[],
        editor:ps?(ps.editorId||ps.cfg.editor):params.paperEditor, editorDowngraded:!!(ps&&ps.editorDowngraded),
        parts:ps?Object.keys(ps.parts).length:0, reviews:ps?Object.keys(ps.reviews).length:0,
        finalizedAt:ps?ps.finalizedAt:0, warning:ps?ps.warning:'', files:ps?(ps.files||[]):[], compile:ps?ps.compile:null,
        closureSignal:PAPER_CLOSURE_SIGNAL,
      }
    }
    function paperStatusSummary(){
      const v=paperStatusView()
      return {ok:true, id:v.id, dir:v.dir, status:v.status, running:v.running, trigger:v.trigger, lang:v.params.paperLanguage,
        // round-9 (F2): carry the projection flags through the SUMMARY too (this is what `status` returns).
        dirProjected:v.dirProjected, dirSource:v.dirSource, readSideEffect:v.readSideEffect,
        format:v.params.paperFormat, editor:v.editor, editorDowngraded:v.editorDowngraded, participants:v.participants,
        parts:v.parts, reviews:v.reviews, rounds:v.rounds+'/'+v.maxRounds, finalizedAt:v.finalizedAt, files:v.files,
        params:v.params,
        compile:v.compile?{result:v.compile.result,engine:v.compile.engine||'',repaired:v.compile.repaired||''}:null,
        warning:v.warning, closureSignal:v.closureSignal}
    }
    async function paperStart(trigger,opts){
      const o=opts||{}
      const force=!!o.force
      const cfg=paperCfg(o)
      const id=paperIdFor(), dir='Paper/'+id
      if(paperState && paperState.id===id && paperState.status!=='done' && paperState.status!=='failed' && !force)
        return {ok:true,id,dir,status:paperState.status,alreadyRunning:true,message:'最终论文正在进行（'+paperState.status+'）'}
      if(paperState && paperState.id!==id && paperState.status!=='done' && paperState.status!=='failed' && !force)
        return {ok:false,code:'V4_PAPER_BUSY',message:'另一篇论文正在进行（'+paperState.id+'），完成或 force 后再试'}
      // Idempotency (docs/final-paper.md §C): the run id IS the directory, so a finalizedAt in THAT directory
      // means this run already has its paper; only per-artifact existence is re-checked.
      const meta=await readJson(dir+'/paper.meta.json')
      if(!force && meta && meta.finalizedAt){
        const filled=await paperEnsureArtifacts(meta,cfg)
        return {ok:true,id,dir,idempotent:true,finalizedAt:meta.finalizedAt,filled,
          message:'论文已定稿（幂等：只补写缺失产物'+(filled.length?('：'+filled.join('、')):'：无缺失')+'）'+(params.finalPaper===false?'（finalPaper=false：自动触发已关闭，本次为手动命令）':'')}
      }
      const prevDeliver={}
      paperState={ id, dir, trigger, deferCompletion:!!o.deferCompletion, startedAt:now(), finalizedAt:0, status:'parts', round:0, maxRounds:PAPER_MAX_ROUNDS,
        cfg, fingerprint:'', participants:Array.from(residents.keys()).sort(), parts:{}, reviews:{}, deliverable:prevDeliver,
        dissent:[], log:[], warning:'', compile:null, draft:'', finalDraft:'', files:[], stepAt:now(), lastNudgeAt:0, attempts:{}, editorId:'', editorDowngraded:false }
      paperLog('触发（'+trigger+'）：'+id+'｜收敛信号='+PAPER_CLOSURE_SIGNAL+'｜语言='+cfg.language+'｜格式='+cfg.format+'｜定稿='+cfg.editor+'｜参与='+(paperState.participants.join('、')||'（无常驻）'))
      if(params.finalPaper===false) paperLog('注意：finalPaper=false —— 自动触发已关闭；本次为手动命令')
      await paperWriteMeta(); await paperWriteLog()
      if(!paperState.participants.length){
        paperState.warning='本轮没有在场常驻：正文由框架（office 侧）从既有证据整理'
        paperLog('警告：'+paperState.warning)
        await paperMerge()   // -> paperFinalStep -> vote(no participants) -> finalize
        return {ok:true,id,dir,status:paperState.status,message:'最终论文已启动（无常驻成员，由框架从既有证据整理）'+(params.finalPaper===false?'（finalPaper=false：自动触发已关闭）':'')}
      }
      await paperWakeSome(paperState.participants.slice(),'part')
      await paperAdvance('parts-started')
      return {ok:true,id,dir,status:paperState.status,participants:paperState.participants,files:paperState.files,
        message:'最终论文已启动（'+trigger+'）'+(params.finalPaper===false?'（finalPaper=false：自动触发已关闭）':'')}
    }
    async function runPaperCommand(ov,force){
      const known=['lang','format','editor']
      for(const k of Object.keys(ov||{})) if(known.indexOf(k)===-1) return {ok:false,code:'V4_INVALID_ARGUMENT',message:'未知选项 '+k+'（支持 lang=zh|en / format=md|tex|both / editor=office|resident:<id> / force）'}
      if(ov&&ov.lang&&PAPER_LANGS.indexOf(String(ov.lang))===-1) return {ok:false,code:'V4_INVALID_ARGUMENT',message:'paperLanguage 只能是 zh|en'}
      if(ov&&ov.format&&PAPER_FORMATS.indexOf(String(ov.format))===-1) return {ok:false,code:'V4_INVALID_ARGUMENT',message:'paperFormat 只能是 both|md|tex'}
      if(ov&&ov.editor&&!paperEditorOk(ov.editor)) return {ok:false,code:'V4_INVALID_ARGUMENT',message:'paperEditor 只能是 office 或 resident:<id>'}
      return await paperStart('manual',{force:!!force,lang:ov&&ov.lang,format:ov&&ov.format,editor:ov&&ov.editor})
    }
    /** A paper wake's reply. `kind` is read from wakeKind (set by wakeResident, not cleared here). */
    async function onPaperWakeEnd(r,parsed){
      const ps=paperState; if(!ps) return
      const kind=String(wakeKind.get(r.rId)||'')
      // A paper contribution may arrive as a plain string or as `{markdown:"…"}` — anything else is
      // NOT accepted (a stray object must never become "[object Object]" in the final draft).
      const pick=v=>{ if(typeof v==='string') return v; if(v&&typeof v==='object'&&typeof v.markdown==='string') return v.markdown; return '' }
      if(kind===PAPER_KINDS.part){
        let text=pick(parsed&&parsed.paperPart).trim()
        if(!text) text=String((await readText(ps.dir+'/parts/'+r.rId+'.md'))||'').trim()
        if(text){ ps.parts[r.rId]={text,at:now(),source:'reply'}; await paperWriteRel(ps.dir+'/parts/'+r.rId+'.md',text)
          paperLog(r.rId+' 提交了自己负责的部分（'+text.length+' 字）') }
        else paperLog('警告：'+r.rId+' 的部分为空（将按超时/重试处理）')
      } else if(kind===PAPER_KINDS.review){
        const rv=(parsed&&parsed.paperReview&&typeof parsed.paperReview==='object')?parsed.paperReview:{}
        const reviewed=String(rv.reviewed||'')
        const others=ps.participants.filter(x=>x!==r.rId)
        if(others.indexOf(reviewed)===-1){
          paperLog('拒绝 '+r.rId+' 的互审：未指名其他参与者（reviewed='+JSON.stringify(rv.reviewed===undefined?null:rv.reviewed)+'）——必须审阅至少一位他人')
        } else {
          const points=Array.isArray(rv.points)?rv.points.map(String).filter(Boolean):[]
          ps.reviews[r.rId]={reviewed,points,improvements:String(rv.improvements||''),at:now(),accepted:true}
          paperLog(r.rId+' 审阅了 '+reviewed+' 的部分：'+points.length+' 条意见'+(rv.improvements?'，并给出改进建议':'') )
          await paperWriteRel(ps.dir+'/reviews/'+r.rId+'.md',['# 互审记录｜'+r.rId,'','- 审阅对象：'+reviewed,'- 意见：','',
            ...points.map(p=>'- '+p),'','## 改进建议','',String(rv.improvements||'（无）')].join('\n')+'\n')
        }
      } else if(kind===PAPER_KINDS.final){
        let text=pick(parsed&&parsed.paperFinal).trim()
        if(!text) text=String((await readText(ps.dir+'/final.md'))||'').trim()
        if(text&&!/^#\s*互审记录/.test(text)){ ps.finalDraft=text; await paperWriteRel(ps.dir+'/final.md',text); paperLog('定稿代表 '+(ps.editorId||ps.cfg.editor)+' 提交了最终稿（'+text.length+' 字）') }
        else paperLog('警告：定稿代表返回空稿，改由框架（office）定稿')
      } else if(kind===PAPER_KINDS.vote||kind===PAPER_KINDS.revise){
        const d=parsed?parsed.paperDeliverable:undefined
        if(typeof d!=='boolean'){ paperLog('警告：'+r.rId+' 未明确表态"可交付/不可交付"（将按未表态处理）'); }
        else { ps.deliverable[r.rId]=d
          paperLog(r.rId+(d?' 表示：可交付':' 表示：不可交付')+(parsed&&parsed.reason?('｜理由：'+String(parsed.reason).slice(0,160)):'')) }
      }
      await paperWriteLog()
      await paperAdvance('resident-end:'+kind)
    }

    // ---- controls ----
    async function start({problem,residentCount,seedDirections}){
      await loadSettings()
      currentProject=await readCurrentProject(); if(!currentProject||currentProject==='default'){ currentProject='default'; }
      await ensureDirs()
      if(problem) problemText=String(problem)
      if(!problemText) return {ok:false,message:'problem text required (pass problem, or use vibe_v4_configure first)'}
      problemId=slugify(problemText.slice(0,40))||'problem'
      if(residentCount) params.residentCount=Number(residentCount)||4
      if(!(Number(params.residentCount)>=1)) params.residentCount=DEFAULT_PARAMS.residentCount   // a 0/negative count (settings misconfig) would spawn nobody & idle forever
      running=true; autoDone=false; phase='brainstorm'
      await writeText('Problems/'+problemId+'.md','# 问题｜'+problemId+'\n- ID: '+problemId+'\n- 类型: 问题\n- 状态: 求解中\n- 优先级: 1\n- 依赖: []\n\n## 陈述\n'+problemText+'\n')
      // A reused session may still have OLD residents in flight from a previous run (start is a FRESH
      // run that reuses the same r-1.. library paths). Interrupt them BEFORE resetting, otherwise their
      // still-running turns keep writing into the same per-resident files the new run is about to use.
      for(const [,or] of residents){ if(or.childId){ try{ subagents.interrupt(or.childId,{kind:'ancestor',agent:rootAgent}) }catch(e){} } }
      residents=new Map(); mailboxes=new Map(); taskboard=[]; decisions=[]; meetings=[]; reports=[]; verifyState=null; meetingState=null; pendingVerify=[]; residentSeq=0; artifactCount=0; clearHeartbeat()
      // A fresh run starts with a clean formal slate: the ids r-1.. and p-* are reused, so
      // carrying a previous run's records over would let a stale `passed` open the new gate.
      formal={}; formalTodos=[]
      // §2.6 recovery (fresh-run variant): a dead process may have left `Formal/Jobs/*.json` behind.
      // A FRESH run must not adopt the previous run's SETTLED outcomes (that is what the clean slate
      // above exists to prevent), so only the safe half of the table runs: `queued` jobs are
      // re-driven and `running` jobs are marked/re-queued — never a `passed` from a stale record.
      await recoverLeanJobs({mode:'start',applySettled:false})
      // Warm the math_computation availability cache so the FIRST resident prompt already carries
      // the line (the probe is cached per registered instance, so later refreshes cost nothing).
      await refreshMathAvailability()
      busy=new Set(); wakeKind=new Map(); currentResident=''; pendingMeeting=null; lastSyncMeetingAt=0; finalizeLock=null; verifiedRecently.clear()   // fresh run must NOT inherit stale concurrency/coordination state (busy/wakeKind/currentResident/pendingMeeting) from a previous run on the same reused session
      paperState=null   // a fresh run gets a fresh paper flow (its durable record lives in Paper/<run id>/)
      // Re-base the artifact counter on the cards already on disk, so the auto-sync meeting counts
      // artifacts written by THIS run (the project tree may already hold cards from an earlier run).
      artifactBaseline=null; artifactCount=0; await syncArtifactCount()
      lastActivityAt=now(); lastProgressAt=now()   // fresh stall/activity clock for the new run (else B could fire immediately on a reused session)
      const dirs=Array.isArray(seedDirections)?seedDirections.slice(0,params.residentCount):[]
      pendingSpawns=[]                 // a fresh run replaces the roster: nothing is queued from before
      beginSpawnRound()                // the whole spawn loop is ONE round (one cap notice, not N)
      let startedCount=0
      // spawnResident no longer throws for the host's live-child cap: it queues the refused resident
      // and returns false, so a capped host leaves a RUNNING team of the residents it accepted
      // instead of an aborted half-built run.
      for(let i=0;i<params.residentCount;i++){ const r=newResident(dirs[i]||''); if(await spawnResident(r)) startedCount++ }
      await saveAll()
      if(pendingSpawns.length) armHeartbeat()   // retry the queued residents on the next round
      // Report the LIVE count when the host refused part of the team: "4 resident(s)" while only 2
      // exist would be exactly the kind of half-truth this fix exists to remove.
      const refused=pendingSpawns.length
      return {ok:true,message:'v4 started: '+(refused?(startedCount+'/'+params.residentCount):params.residentCount)+' resident(s) brainstorming'
        +(refused?('（宿主同时在活的子代理已达上限，'+refused+' 个常驻已排队、有空位时自动重试；'+hostChildLimitHint(hostChildLimit)+'）'):''),project:currentProject}
    }
    async function resume(){
      currentProject=await readCurrentProject(); await ensureDirs()
      // Resume is only meaningful for a stopped/paused/crashed run. If THIS process is already driving
      // a live run whose disk state belongs to it, loadAll below would overwrite the in-memory state
      // with a slightly stale snapshot (busy marks, wake round counters, mailbox contents from the last
      // saveAll) — a silent clobber for a useless "kick". No-op instead. A cross-process restart is
      // always allowed: its disk epoch differs, so the in-memory state is empty/stale anyway.
      const pre=await readJson('State/session.json')
      if(running && !autoDone && pre && pre.processEpoch===processEpoch) return {ok:true,message:'already running (no-op)'}
      await loadAll(); await loadSettings()
      // §2.6 recovery runs AFTER loadAll (the formal records it may complete/annotate are restored
      // there — recovering earlier would write onto an unloaded `formal` and clobber them).
      await recoverLeanJobs({mode:'resume',applySettled:true})
      await refreshMathAvailability()   // same reason as start(): the next wake must carry the line
      // A run the group CONCLUDED (unanimous voteSolved → autoDone) must not be silently revived into
      // a zombie that keeps waking residents with no consensus that it should still run. The group
      // decided it is done; continuing means a NEW run (vibe_v4_start / vibe_v4_configure).
      if(autoDone) return {ok:false,message:'This run already concluded (all residents agreed solved). Start a fresh run with vibe_v4_start (vibe_v4_configure a new problem first if needed).'}
      // After loadAll the residentSeq counter is still whatever THIS process had (0 on a fresh process),
      // but persisted residents may already be r-1..r-N. Sync it to the max existing id so a later
      // addMember never collides with an existing resident (it would silently overwrite it).
      for(const key of residents.keys()){ const mm=/^r-(\d+)$/.exec(String(key)); if(mm) residentSeq=Math.max(residentSeq, Number(mm[1])) }
      lastActivityAt=now(); lastProgressAt=now()   // pause must not count as stall time; a resumed run gets a fresh clock
      if(phase==='idle' && !running && residents.size===0) return {ok:false,message:'nothing to resume'}
      // If the persisted State came from a DIFFERENT process (crash/restart), the saved
      // childIds are stale; clear them so residents re-spawn (their libraries persist on
      // disk and re-seed the resumed run). Same-process pause→resume keeps continuable ids.
      //
      // `persistedEpoch` is only ever READ here, so before this fix a same-process pause→resume
      // compared this process's random epoch against the epoch saved by ITSELF and always concluded
      // "cross-process": every resident was re-spawned, `busy`/`wakeKind` were thrown away while the
      // OLD children were still running (`resume()` never interrupts them, so the late
      // `subagent/end` that the code's own comment warns about was guaranteed, not hypothetical).
      // Re-sync it on a same-process load, which is the contract `paused` already assumes.
      const crossProcess = persistedEpoch !== processEpoch
      if(!crossProcess) persistedEpoch = processEpoch
      if(crossProcess){ for(const [,r] of residents){ r.childId=''; r.status='brainstorm'; r.roundsSinceCompact=0 } }
      // ANY re-spawn (cross-process OR a same-process abort that already cleared childIds) must get a FRESH
      // coordination/concurrency state and a brainstorm phase. Otherwise: re-spawned brainstorm residents run
      // under phase='active' (brainstorm summary never written), and a LATE subagent/end from an interrupted
      // OLD resident (same rId) deletes the NEW resident's busy mark → A-fill can wake it mid-brainstorm.
      const needRespawn = Array.from(residents.values()).some(r=>!r.childId)
      if(needRespawn){
        for(const [,r] of residents){ r.childId=''; r.status='brainstorm'; r.insight=''; r.roundsSinceCompact=0 }
        busy=new Set(); wakeKind=new Map(); currentResident=''; pendingMeeting=null; pendingVerify=[]; verifyState=null; meetingState=null; finalizeLock=null; verifiedRecently.clear()
      }
      beginSpawnRound()   // the whole re-spawn loop is ONE round for the cap notice
      for(const [,r] of residents){ if(!r.childId){ await spawnResident(r) } }
      if(!running){ running=true; autoDone=false; if(phase==='idle') phase='active' }
      if(needRespawn && phase!=='brainstorm') phase='brainstorm'   // let re-spawned residents re-bootstrap together
      // A pause froze an in-progress meeting/verify with its watchdog clock still running: refresh the
      // clocks so a resumed consensus gets a full fresh stall window instead of being abandoned the
      // instant it is serviced again (a short pause must never silently kill a real discussion).
      if(meetingState && meetingState.lastInputAt) meetingState.lastInputAt=now()
      if(verifyState && verifyState.lastVerdictAt) verifyState.lastVerdictAt=now()
      logActivity('resume','restarted'+(crossProcess?' (cross-process: re-spawned)':needRespawn?' (re-spawned)':'')); await saveAll(); await scheduleNext(); return {ok:true,message:'resumed',project:currentProject}
    }
    /** Round A F1/F2: the roster version must never be observable as unchanged while the frozen
     *  participant set changed, and a frozen set must always travel WITH its own version. Every
     *  roster change calls this AFTER all snapshot mutations (meeting + verify prunes included), so
     *  {snapshot.rosterVersion, snapshot.rosterSnapshot} is one atomic pair and the live counter
     *  still strictly increases on hire/fire. */
    function bumpRoster(){ rosterVersion++; if(meetingState&&Array.isArray(meetingState.rosterSnapshot)) meetingState.rosterVersion=rosterVersion; if(verifyState&&Array.isArray(verifyState.rosterSnapshot)) verifyState.rosterVersion=rosterVersion; return rosterVersion }
    /** The frozen participant set an operator should read right now (verify wins while it is live). */
    function activeRosterSnapshot(){ return (verifyState&&Array.isArray(verifyState.rosterSnapshot))?verifyState:((meetingState&&Array.isArray(meetingState.rosterSnapshot))?meetingState:null) }
    function status(){ return { ok:true, running, phase, autoDone, project:currentProject, residentCount:residents.size,
      // round-9 (P2): the roster VERSION travels with every status read, and an active verify/meeting
      // reports the participant set it froze (never a re-derivation from the live map).
      rosterVersion,
rosterVersion, liveRosterVersion: rosterVersion,
// Round A F1: the pair is ATOMIC - `frozen.version` is the version the SNAPSHOT recorded when it
// was frozen (and re-stamped on every roster change), never the live counter beside a stale set.
frozen: (function(sn){ return {version: sn?sn.rosterVersion:null, participants: sn?sn.rosterSnapshot:null, kind: sn?(sn===verifyState?'verify':'meeting'):null} })(activeRosterSnapshot()),
frozenParticipants: (activeRosterSnapshot()||{}).rosterSnapshot||null,   // deprecated: use `frozen` (set + version together)
      residents:listResidents(), busy:[...busy], taskboard:taskboard.length,
      // Residents the host's live-child cap refused (maxActiveSubagents): queued, not lost. Without
      // this the only trace would be the one console line, and `residentCount` alone cannot tell a
      // short team from a deliberately small one.
      pendingSpawns: pendingSpawns.length, hostChildLimit: (hostChildLimit===undefined?null:hostChildLimit),
      meetingInProgress: !!(meetingState), verifyInProgress: !!(verifyState), pendingVerify: pendingVerify.length?pendingVerify[0].targetId:null, pendingVerifyCount: pendingVerify.length,
      parkedMeeting: pendingMeeting?pendingMeeting.agenda:null,
      // The coordination counters (`spoke k/N`, `voted k/N`, the verification round) used to live only
      // in `report()`: from `status()` alone an operator could not tell "the group is progressing"
      // from "the group is stuck at 2/4 votes", which is exactly how F1/F2/F7 stay invisible.
      consensus: meetingState?{kind:'meeting',id:meetingState.id,agenda:meetingState.agenda,round:meetingState.round,rosterVersion:meetingState.rosterVersion,participants:meetingState.rosterSnapshot,spoke:Object.keys(meetingState.inputs).length,expected:(meetingState.rosterSnapshot||Array.from(residents.keys())).length,solvedVotes:Object.values(meetingState.inputs).filter(iv=>iv.voteSolved===true).length,rosterVersion:meetingState.rosterVersion}
        :(verifyState?{kind:'verify',target:verifyState.targetId,targetType:verifyState.targetType,stage:verifyState.stage,round:verifyState.round,rosterVersion:verifyState.rosterVersion,participants:verifyState.rosterSnapshot,voted:Object.keys(verifyState.verdicts).length,expected:(verifyState.rosterSnapshot||Array.from(residents.keys())).length,rosterVersion:verifyState.rosterVersion}:null),
      artifactCount: artifactCount, artifactBaseline: artifactBaseline,
      paper: paperStatusSummary(),
      // The Lean knobs and the per-object formal records are part of the readable status: without
      // them a `require`-mode run that keeps returning 未定论 would be undiagnosable from outside.
      formal: formalView(),
      // The parameter NAMES (not just the rendered string) so a caller — the `/v4 set` handler in
      // particular — can reject an unknown key instead of silently dropping it.
      paramsKeys: Object.keys(params),
      params:['residentCount','compactAfterRounds','compactThreshold','maxParallel','activityTimeoutMs','meetingKeepEvery','verdictMaxRounds','stallAutoMeetingMs','provider','model','residentPersona','toolAllow','toolDeny','formalVerify','leanCommand','leanArgs','leanTimeoutMs','finalPaper','paperFormat','paperLanguage','paperCompilePdf','paperEditor','paperLatexCommand','leanAsync','leanInitiative','leanSearchPaths','leanJobsMaxParallel'].concat(MATH_PARAM_NAMES).map(k=>k+'='+(Array.isArray(params[k])?params[k].join(','):params[k])).join(', ') } }
    function formalReportText(){
      if(!formalOn()) return '- 未启用（`formalVerify` = off；可用 vibe_v4_set 切到 encourage / require）'
      const v=formalView()
      return ['- 模式：'+formalMode()+'（'+(formalMode()==='require'?'强制：定论前必须有 Lean 通过或显式阻塞记录':'鼓励：按实现难度自行决定')+'）',
        '- 已通过：'+(v.passed.join('、')||'（无）'),
        '- 已记录阻塞：'+(v.blocked.join('、')||'（无）'),
        '- 形式化待办：'+(v.todo.join('、')||'（无）'),
        '- 可复用库：'+formalLibRoot().replace(/\\/g,'/')+'/ 与 '+formalProvedRoot().replace(/\\/g,'/')+'/（跨项目）｜本项目形式化：Formal/｜归档证明：Verified/Lean/'].join('\n')
    }
    function report(){ return { ok:true, running, phase, autoDone, project:currentProject, problem:problemText,
      residents:listResidents(), taskboard:taskboard.filter(t=>t.status!=='done'),
      meeting: meetingState?{id:meetingState.id, agenda:meetingState.agenda, spoke:Object.keys(meetingState.inputs).length+'/'+(meetingState.rosterSnapshot||Array.from(residents.keys())).length,rosterVersion:meetingState.rosterVersion}:null,
      verify: verifyState?{target:verifyState.targetId,stage:verifyState.stage, voted:Object.keys(verifyState.verdicts).length+'/'+(verifyState.rosterSnapshot||Array.from(residents.keys())).length,rosterVersion:verifyState.rosterVersion}:null,
      pendingVerify: pendingVerify.length?pendingVerify[0].targetId:null,
      parkedMeeting: pendingMeeting?pendingMeeting.agenda:null,
      formal: formalView(),
      paper: paperStatusSummary(),
      meetings:meetings.length, recentActivity: activityLog.slice(-8) } }
    /** Human-readable mirror of the formal state (kept OUT of the JSON report shape). */
    function formalReport(){ return {ok:true, formalMode:formalMode(), formalReport:'## Lean 形式化\n'+formalReportText(), formal:formalView()} }
    async function addMember(direction){
      // Adding a member starts a REAL resident turn (spawnResident → brainstorm) — refuse unless the
      // run is live: on a concluded (autoDone) or never-started/paused run the new member would work
      // with nobody to coordinate (zombie work on a project the group already declared done).
      if(!running || autoDone) return {ok:false,message:'no active run to join (start or resume first)'}
      const r=newResident(direction||'')
      beginSpawnRound()
      if(!await spawnResident(r)) return {ok:false,code:'ACTIVATION_LIMIT_REACHED',message:'本宿主同时在活的子代理已达上限，'+r.rId+' 未能创建（已排队、有空位时自动重试）。'+hostChildLimitHint(hostChildLimit)}
      // Mid-meeting additions must join the meeting's speaking order; otherwise allSpoke (over CURRENT
      // residents) can never be true for the new member (not in the snapshot order) and the meeting is
      // only ever released by the stuck watchdog instead of finalizing with everyone's input.
      if(meetingState){ if(!Array.isArray(meetingState.order)) meetingState.order=Array.from(residents.keys()); if(!meetingState.order.includes(r.rId)) meetingState.order.push(r.rId) }
    rosterVersion++   // additions never extend a frozen set: the live counter moves ahead (staleness stays visible)
      // P2: the roster CHANGED - bump the version so any frozen participant set is visibly stale.

      // Mid-verify additions are automatically asked to vote (continueVerifyRound recomputes ids from
      // the live residents map), so no extra handling is needed there.
      return {ok:true,id:r.rId,direction:r.direction} }
    async function removeMember(id){ const r=residents.get(id); if(!r) return noSuchResident(id,'vibe_v4_remove_member'); if(r.childId){ try{ subagents.interrupt(r.childId,{kind:'ancestor',agent:rootAgent}) }catch(e){} } residents.delete(id); busy.delete(id); mailboxes.delete(id); wakeKind.delete(id); if(currentResident===id) currentResident=''
      // P2: the roster CHANGED - bump the version (a frozen participant set stays readable, but is
      // now visibly stale; every view reports the same version it snapshotted).

      // Reconcile in-progress coordination so a removed member cannot hang consensus or crash a round:
      // drop its meeting speech / verify verdict and prune it from the meeting's speaking order so the
      // find() there never selects a ghost. Its QUEUED verify proposals are deliberately KEPT: a
      // proposal is a statement about an OBJECT the group can judge on its merits with its CURRENT
      // members (allVoted recomputes over the live residents), and dropping the queue entry would also
      // erase the intent of any OTHER member who independently proposed the same target (dedup keeps
      // only the first entry, which may belong to the removed member).
      if(meetingState){ delete meetingState.inputs[id]; meetingState.order=(meetingState.order||[]).filter(x=>x!==id) }
      if(verifyState){ delete verifyState.verdicts[id] }
      // P2 (round-9): REMOVAL prunes the FROZEN participant set as well - v4's long-standing contract is
      // that removing an in-flight voter RELEASES the wait (T26/T31), while the snapshot still gives
      // every view one identical set + version. Additions never touch a frozen set (that is the point
      // of freezing); the version bump above marks the set as changed.
      if(meetingState&&Array.isArray(meetingState.rosterSnapshot)) meetingState.rosterSnapshot=meetingState.rosterSnapshot.filter(x=>x!==id)
      if(verifyState&&Array.isArray(verifyState.rosterSnapshot)) verifyState.rosterSnapshot=verifyState.rosterSnapshot.filter(x=>x!==id)
    bumpRoster()   // F2: AFTER every snapshot mutation - version and set stay one atomic pair
      await saveAll()
      // Re-drive the scheduler right away. If the removed member was the ONLY turn in flight (e.g. the
      // last unspoken meeting speaker / the last unvoted voter, interrupted mid-turn), NO subagent/end
      // will ever arrive to trigger the next pass, and while a consensus is being serviced no heartbeat
      // is armed either — without this kick the meeting/verify would freeze forever behind members that
      // can already conclude. scheduleNext no-ops safely when the run is paused/stopped.
      await scheduleNext()
      return {ok:true} }
    // Normalize one parameter value to its intended type so a string from /v4 set or configure
    // becomes the right number/array. Keeps settings.json clean regardless of how it was set.
    function normalizeParam(k, v){
      const INT_KEYS=['residentCount','compactThreshold','compactAfterRounds','maxParallel','activityTimeoutMs','verdictMaxRounds','meetingKeepEvery','stallAutoMeetingMs','leanJobsMaxParallel']
      if(INT_KEYS.includes(k)){ const n=Number(v); if(!Number.isFinite(n)) return v; return Math.floor(n) }
      if(k==='toolAllow'||k==='toolDeny'||k==='leanArgs'||k==='leanSearchPaths'){ if(Array.isArray(v)) return v.map(x=>String(x).trim()).filter(Boolean); if(typeof v==='string') return v.split(',').map(x=>x.trim()).filter(Boolean); return [] }
      // ---- Lean formal verification (docs §1) ------------------------------------------
      // `formalVerify` is a three-way enum and MUST degrade to the no-op 'off' on anything else.
      // Degrading to a STRONGER mode would let a typo silently gate every conclusion — the exact
      // failure mode `require` is supposed to avoid.
      if(k==='formalVerify') return FORMAL_MODES.indexOf(String(v))!==-1?String(v):'off'
      // ---- final paper (docs/final-paper.md §B): booleans and enums are coerced HERE, because `/v4 set` hands
      // the parameter layer RAW STRINGS ('false' must become false, not stay truthy) and an unknown
      // value must fall back to the default instead of silently keeping a bogus strong setting. ----
      if(k==='finalPaper'||k==='paperCompilePdf'){
        if(typeof v==='boolean') return v
        const s=String(v==null?'':v).trim().toLowerCase()
        if(s==='true'||s==='1'||s==='yes'||s==='on') return true
        if(s==='false'||s==='0'||s==='no'||s==='off') return false
        return DEFAULT_PARAMS[k]
      }
      if(k==='paperFormat') return PAPER_FORMATS.indexOf(String(v))!==-1?String(v):DEFAULT_PARAMS.paperFormat
      if(k==='paperLanguage') return PAPER_LANGS.indexOf(String(v))!==-1?String(v):DEFAULT_PARAMS.paperLanguage
      // v2 §A5: `office` (the session root / human side) by default, or `resident:<id>`.
      if(k==='paperEditor'){ const s=String(v==null?'':v).trim(); return paperEditorOk(s)?s:DEFAULT_PARAMS.paperEditor }
      if(k==='paperLatexCommand'){ const s=String(v==null?'':v).trim(); return s }
      // math_computation P1: the six keys go through the SHARED normalizer (explicit
      // enum/array/integer coercion there), so `'false'`-style strings and unknown enum values can
      // never leak into `params` — v4's function returns unknown keys AS-IS, which is why an
      // explicit branch is mandatory. The two array keys additionally accept the comma-string form
      // that `/v4 set` produces (v4's own style for `leanArgs`), then the module is authoritative.
      if(MATH_PARAM_NAMES.indexOf(k)!==-1){
        let val=v
        if((k==='mathEngines'||k==='mathPackages')&&typeof val==='string') val=val.split(',').map(x=>x.trim()).filter(Boolean)
        const one=normalizeMathParams({[k]:val})
        if(Object.prototype.hasOwnProperty.call(one,k)) return one[k]
        const def=DEFAULT_PARAMS[k]
        return Array.isArray(def)?def.slice():def
      }
      // lean-incremental-async §1.1: an EXPLICIT branch — the string 'false' (what `/v4 set` hands us)
      // must normalise to boolean false, never survive as a truthy string.
      if(k==='leanAsync'){
        if(typeof v==='boolean') return v
        const s=String(v==null?'':v).trim().toLowerCase()
        if(s==='true'||s==='1'||s==='yes'||s==='on') return true
        if(s==='false'||s==='0'||s==='no'||s==='off') return false
        return DEFAULT_PARAMS.leanAsync
      }
      // AMENDMENT §1: three-way PROACTIVITY enum — anything unknown degrades to the default
      // ('normal'), never to a stronger setting.
      if(k==='leanInitiative') return ['off','normal','eager'].indexOf(String(v))!==-1?String(v):DEFAULT_PARAMS.leanInitiative
      // A blank command would make resolveExecutable('') fail confusingly; fall back to the default.
      if(k==='leanCommand'){ const s=String(v==null?'':v).trim(); return s||'lean' }
      // A non-positive timeout is meaningless (the run would be killed instantly) → default.
      if(k==='leanTimeoutMs'){ const n=Number(v); if(!Number.isFinite(n)||n<=0) return DEFAULT_PARAMS.leanTimeoutMs; return Math.floor(n) }
      return v
    }
    /**
     * 并发闸门相关参数的下界。
     *
     * `maxParallel` 在调度里被当成"0 或负数 = 不限流"（见 scheduleNext 的 `mp>0` 守卫与
     * `free = mp>0 ? mp-busy.size : MAX_SAFE_INTEGER`），所以用户设成 0 会让闸门**完全失效**、
     * 一次唤醒全部常驻，与"同时唤醒的常驻上限"语义正好相反 —— 这里抬到最小合法值 1。
     * `residentCount` 同理（0 会一个常驻都不建）。
     *
     * 注意**不要**给 activityTimeoutMs / compactThreshold 之类加下界：文档明确建议测试时把
     * activityTimeoutMs 设成 40ms 这种小值，钳制它会破坏受支持的配置。
     */
    const INT_MIN = { maxParallel: 1, residentCount: 1, leanJobsMaxParallel: 1 }
    function clampInt(k, n){
      const min = INT_MIN[k]
      if(min===undefined) return n
      return n < min ? min : n
    }
    /**
     * Apply a parameter update. Keys the parameter layer does not know are NOT silently dropped: the
     * caller gets them back (`ok:false` + `ignored`), because `{ok:true}` for a call that changed
     * nothing is the "declared but not received" silent failure AUDIT-CHECKLIST §1.9 names.
     */
    function setParams(upd){
      const keys=Object.keys(upd||{})
      // `k in params` 会沿原型链判真：`toString` / `constructor` / `__proto__` 这类键会被当成"已知参数"
      // 写进 params（`params['__proto__']=…` 还会真的改掉 params 的原型），而 schema 的
      // additionalProperties:false 在 v4 上**不产生运行期拒绝**（裸 tools.register，宿主不校验实参）。
      // 已知参数一律以**自有属性**为准（AUDIT-CHECKLIST §1.9 的"声明=接收"只能在自有键上成立）。
      const has = (o,k)=>Object.prototype.hasOwnProperty.call(o,k)
      const ignored=keys.filter(k=>!has(params,k))
      for(const k of keys){ if(has(params,k)){ const nv=normalizeParam(k, upd[k]); params[k]= (typeof nv==='number') ? clampInt(k, nv) : nv } }
      // A math parameter changes what the NEXT prompt must say (the availability line encodes the
      // enabled engines and the mode), so refresh it here — the probe is cached, so this is cheap.
      if(keys.some(k=>MATH_PARAM_NAMES.indexOf(k)!==-1)) refreshMathAvailability().catch(()=>{})
      saveSettings().catch(()=>{})
      if(ignored.length){
        logActivity('set','忽略未知参数：'+ignored.join(', '))
        return {ok:false,message:'unknown parameter(s): '+ignored.join(', ')+' — nothing was changed'+(ignored.length<keys.length?('（已应用：'+keys.filter(k=>!(ignored.indexOf(k)>=0)).join(', ')+'）'):''),ignored,applied:keys.filter(k=>!(ignored.indexOf(k)>=0))}
      }
      return {ok:true,applied:keys}
    }
    // ---- create / configure (no auto-start) + settings-file persistence ----
    // 同一把守护：State/settings.json 是用户可编辑的，原型链上的键名（toString/__proto__）不是参数。
    async function loadSettings(){ const s=await readJson('State/settings.json'); if(s&&typeof s==='object'){ for(const k of Object.keys(s)){ if(Object.prototype.hasOwnProperty.call(params,k)){ const nv=normalizeParam(k, s[k]); params[k]= (typeof nv==='number') ? clampInt(k, nv) : nv } } } }
    async function saveSettings(){ await writeJson('State/settings.json', params) }
    // Create/configure a project and set params/problem WITHOUT starting any resident.
    // The intended flow: vibe_v4_configure {project?, problem?, params?}  →  vibe_v4_start {}.
    async function configure(cfg){
      // configure is the PRE-START setup tool (project/problem/params). Switching the project while a
      // run is LIVE would split the run's state across two trees: residents' briefs & libraries point
      // at the OLD frameworkRoot while every subsequent saveAll/transcript/Verified card would go to the
      // NEW project. Params tuning mid-run belongs to vibe_v4_set.
      if(running && !autoDone) return {ok:false,message:'cannot configure while a run is running (pause or abort first; use vibe_v4_set to tune params)'}
      if(cfg && cfg.project && String(cfg.project).trim()) currentProject=String(cfg.project).trim()
      if(cfg && cfg.problem) problemText=String(cfg.problem)
      if(cfg && cfg.params && typeof cfg.params==='object') setParams(cfg.params)
      await writeCurrentProject(); await ensureDirs(); await saveSettings()
      // create the problem card so the project is complete BEFORE the run starts
      if(problemText){ const pid=slugify(problemText.slice(0,40))||'problem'; await writeText('Problems/'+pid+'.md','# 问题｜'+pid+'\n- ID: '+pid+'\n- 类型: 问题\n- 状态: 求解中\n- 优先级: 1\n- 依赖: []\n\n## 陈述\n'+problemText+'\n') }
      await saveAll()
      return {ok:true,project:currentProject,problem:problemText?problemText.slice(0,60):'',params:Object.keys(params).map(k=>k+'='+params[k]).join(', ')}
    }
    async function initAbort(){ clearHeartbeat(); running=false; phase='idle'; autoDone=false; for(const [,r] of residents){ if(r.childId){ try{ subagents.interrupt(r.childId,{kind:'ancestor',agent:rootAgent}) }catch(e){} } r.childId=''; r.lastActiveAt=0; r.roundsSinceCompact=0 }
      // Wipe the coordination state too: an aborted run must not report an in-flight meeting/verify,
      // a parked meeting, a verify queue, or busy residents (their childIds are gone, so no end event
      // can ever clear those marks). resume()/start() re-initialize anyway; this keeps status truthful
      // between abort and the next action.
      meetingState=null; verifyState=null; pendingMeeting=null; pendingVerify=[]; busy=new Set(); wakeKind=new Map(); currentResident=''; finalizeLock=null
      paperState=null   // an aborted run is over: its paper flow (if any) must not keep driving wakes
      await disposeLean()   // §2.5: abort terminates the in-flight compile and marks it interrupted
      await saveAll(); return {ok:true,message:'aborted'} }
    function setPause(){ clearHeartbeat(); running=false; return {ok:true,message:'paused'} }

    return {
      sessionId, running:()=>running, autoDone:()=>autoDone, phase:()=>phase,
      onResidentEnd, start, resume, status, report, addMember, removeMember, setParams,
      // live-Agent cache for the real /compact path (see `liveAgents`): the child is
      // captured at subagent/start and released once its end handler has run.
      rememberAgent, forgetAgent,
      setPause, initAbort, postMessage, startMeeting, saveAll, broadcast, configure, loadSettings,
      currentResident:()=>currentResident,
      // Final paper (docs/final-paper.md): the session API used by the `/v4 paper` command and by
      // the suites. `paperStatus` is the same view `status()`/`report()` expose.
      runPaperCommand, paperStatus:()=>paperStatusSummary(),
      /** Does this session own the given child id? (used by the `subagent/start` capture) */
      ownsChild,
      /** Stash a live Agent seen at `subagent/start` time; claimed by `spawnResident` on resolve. */
      stashStartAgent,
      // safety kick: drive one scheduler pass (used when an end handler errored, so an exceptional
      // turn can never leave the group with no end-event and no heartbeat to continue it)
      nudge:()=>scheduleNext().catch(()=>{}),
      /**
       * Which resident is calling a resident-facing tool?
       *   1. the caller's subagent id matched against a resident's childId — the exact answer;
       *   2. the last-woken resident, but ONLY when no caller identity exists at all (the mock/harness
       *      path, where `exec.agent` is undefined).
       * An agent that IS present but matches no resident is NOT guessed at: attributing a host call to
       * whichever resident happened to be woken last writes into that resident's private library with
       * no indication that the attribution was invented (AUDIT-CHECKLIST §0.2: identity is never
       * inferred from global mutable state). Such a call now fails explicitly with 'no such resident'.
       */
      residentIdOf:(agent)=>{ const m=residentOfAgent(agent); if(m) return m
        let hasId=false; try { hasId=!!(agent&&agent.id) } catch(e){ hasId=false }
        if(hasId) return ''
        const c=currentResident; return (c && residents.has(c)) ? c : '' },
      useResident:(id)=>{ currentResident=id },
      publishProgress, recordProposition, recordMethod, recordSubproblem, listResidents, reportContext,
      proposeTask, claimTask, taskDone, listTasks,
      readProgress: async (rid)=>({text:(await readText('Progress/'+rid+'/progress.md'))||''}),
      frameworkRoot:frameworkRoot, currentProject:()=>currentProject, problemText:()=>problemText,
      residentCount:()=>residents.size,
      busyCount:()=>busy.size,
      // Lean formal verification (docs/formal-verification.md) — exposed to the tool layer and to
      // the test suites exactly as v5 exposes its own helpers.
      formalMode, formalOn, formalRecords, formalTodo, formalOf, formalView, formalReport,
      rebuildLeanLibIndexes, leanArchive, leanRunTool, writeFormalIndex, writeFormalTodo,
      leanRunToolApi: async (relPath,timeoutMs)=>await leanRunFile(relPath,timeoutMs),
      // lean-incremental-async §6.3: the queue is reachable from the suite/dispatcher exactly like
      // `leanRunToolApi`, so the async paths can be driven deterministically (no timer races).
      leanQueueApi:{ enqueue:enqueueLeanJob, runQueue:runLeanQueue, state:()=>({running:leanInflight.map(leanJobView),queued:leanQueue.slice(),jobs:listLeanJobs(),notices:leanNotices.slice(),cap:Math.max(1,Math.floor(Number(params.leanJobsMaxParallel))||1)}), dispose:disposeLean, recover:recoverLeanJobs, job:leanJobTool },
      leanRead, listLeanJobs, leanJobs:()=>Object.assign({},leanJobs), leanJobTool,
      /** math_computation host surface — the SAME object the per-session module instance is keyed
       *  by (`mathInstanceFor`), so the tool path and the prompt-side probe share one instance per
       *  session (and one probe cache), and no state is shared across sessions. These accessors read
       *  LIVE state (never a snapshot — `/v4 set mathMode=typed` must change the very next call). */
      mathHost: mathProbeHost,
      /** Absolute paths the Lean layer uses (read-only display; `searchPaths` are injected per spawn). */
      leanPaths:()=>({searchPath:vibeRoot().replace(/\\/g,'/'),searchPaths:leanSearchPathList(),lib:formalLibRoot().replace(/\\/g,'/'),proved:formalProvedRoot().replace(/\\/g,'/'),jobs:leanJobsRel()}),
      /**
       * The prompt builders, addressed BY RESIDENT ID. "成员读到的文字就是产品"
       * (AUDIT-CHECKLIST §0.1): a suite that can only observe tool return values is blind to a
       * prompt defect, so the exact strings a resident would receive must be directly readable.
       * These are pure builders — calling one has no side effects on the run.
       */
      promptApi:{
        normal:(rId)=>{ const r=residents.get(String(rId)); return r?normalPrompt(r):'' },
        heartbeat:(rId)=>{ const r=residents.get(String(rId)); return r?heartbeatPrompt(r):'' },
        brainstorm:(rId)=>{ const r=residents.get(String(rId)); return r?brainstormPrompt(r):'' },
        coreRules:()=>coreRulesBrief(),
        // `vs` mirrors the live verification state ({targetId,targetType,targetOwner,stage,history,verdicts});
        // pass one explicitly to ask "what WOULD the voters read for this object right now?".
        verify:(rId,vs)=>{ const r=residents.get(String(rId)); return r?verifyPrompt(r, vs||verifyState||{targetId:'',targetType:'proposition',targetOwner:'',stage:'independent',verdicts:{}}):'' },
        // The meeting prompt is the ONLY group-chat / task-allocation / stop-vote surface this preset
        // has, so a host (or the audit corpus) must be able to READ it. Pass `st` to ask "what would
        // the next speaker read right now?"; the live meeting state is the default.
        meeting:(rId,st)=>{ const r=residents.get(String(rId)); if(!r) return ''
          const s=st||meetingState||{agenda:'（无进行中的会议）',type:'general',inputs:{},order:[]}
          return meetingPrompt(r,s) },
        formalBlock:(target)=>formalPromptBlock(target),
        formalWorkLine:()=>formalWorkLine(),
      },
      /** Dispatcher behind vibe_v4_prompts (kept here so the tool layer never re-implements it). */
      promptFor:async (which,rId,arg)=>{
        const r=residents.get(String(rId))
        if(!r) return ''
        if(which==='brainstorm') return brainstormPrompt(r)
        if(which==='heartbeat') return heartbeatPrompt(r)
        if(which==='coreRules') return coreRulesBrief()
        if(which==='meeting') return (arg&&arg.meeting)?meetingPrompt(r,arg.meeting):(meetingState?meetingPrompt(r,meetingState):meetingPrompt(r,{agenda:'（无进行中的会议）',type:'general',inputs:{},order:[]}))
        if(which==='verify'){
          const target=idSafe(String((arg&&arg.target)||''))
          // F14 的同一条尺子：前缀（p-/m-/s-）就是对象归属的契约。此前的兜底把**任何**认不出的 id
          // 都当成 proposition，于是这个"读真实提示词"的工具会展示一条带着错误对象类型的投票提示词
          // （而真正入队的入口 maybeQueueVerify 已经拒绝这种 id）。认不出就如实拒绝，不猜。
          const tt=guessTargetType(target)
          if(!tt) return 'V4_INVALID_ARGUMENT: target must start with p- (proposition) / m- (method) / s- (subproblem) — cannot render a verification prompt for an unknown object kind'
          return verifyPrompt(r,{targetId:target,targetType:tt,targetOwner:'',stage:String((arg&&arg.stage)||'independent'),history:{},verdicts:{}})
        }
        return normalPrompt(r)
      },
    }
  } // end makeSession

  // ================= apply-level registration (ONCE) =================
  function objParams(props, required){ return { type:'object', properties:props, additionalProperties:false, required:required||[] } }
  function registerTool(name, description, parameters, fn){
    // tools.register() returns a Cordis effect disposer. Both v2 and v3 keep the
    // registration inside ctx.effect() so it is wound back when the preset subtree
    // unloads; v4 used to drop the disposer, so a second mount of this preset in the
    // same process collided on the already-registered tool names and the entries
    // survived an unload. Route it through ctx.effect() like the other two.
    ctx.effect(() => tools.register({ name, description, parameters,
      output:{ schema:{ type:'string' }, render:(_a,v)=>[{type:'text',text:String(v)}] },
      execute: async (args, exec)=>{
        try { const s=getSession(exec&&exec.agent); if(!s) return JSON.stringify({ok:false,error:'no session'}); return JSON.stringify(await fn(s,args||{},exec&&exec.agent)) }
        catch(e){ return JSON.stringify({ok:false,error:String((e&&e.message)||e)}) }
      } }))
  }
  // host/assistant-facing
  registerTool('vibe_v4_configure','Create/configure a project: set project name, problem, and params WITHOUT starting a run. Use this FIRST, then vibe_v4_start to actually spawn residents.',objParams({project:{type:'string'},problem:{type:'string'},params:{type:'object'}}),(s,a)=>s.configure(a))
  registerTool('vibe_v4_start','Start V4: spawn N resident subagents (brainstorm then self-organize).',objParams({problem:{type:'string'},residentCount:{type:'integer'},seedDirections:{type:'array',items:{type:'string'}}}),(s,a)=>s.start(a))
  registerTool('vibe_v4_resume','Resume a persisted V4 run.',objParams({}),(s)=>s.resume())
  registerTool('vibe_v4_pause','Pause V4.',objParams({}),(s)=>s.setPause())
  registerTool('vibe_v4_abort','Abort V4 and interrupt residents.',objParams({}),(s)=>s.initAbort())
  registerTool('vibe_v4_status','Show V4 status.',objParams({}),(s)=>s.status())
  registerTool('vibe_v4_report','Return the V4 progress report.',objParams({}),(s)=>s.report())
  registerTool('vibe_v4_formal_report','Human-readable Lean formal-verification mirror (mode, Lean-passed objects, recorded blockers, formalization TODO, library paths).',objParams({}),(s)=>s.formalReport())
  // The exact text a resident would receive. "成员读到的文字就是产品" (AUDIT-CHECKLIST §0.1): a host
  // (or an audit) must be able to READ the prompt, not just the tool return values, or a prompt
  // defect stays invisible. Pure builder calls — no side effects on the run.
  registerTool('vibe_v4_prompts','Read the exact prompt text a resident would receive (which: brainstorm|normal|heartbeat|meeting|verify|coreRules). member = resident id; target/stage describe the object for `verify`. Prompt text is the product — this makes it auditable.',objParams({which:{type:'string',enum:['brainstorm','normal','heartbeat','meeting','verify','coreRules']},member:{type:'string'},target:{type:'string'},stage:{type:'string'}},['which']),async (s,a)=>{
    const which=String(a.which||'normal')
    if(which==='coreRules') return {ok:true,which,text:await s.promptApi.coreRules()}
    const text=await s.promptFor(which,String(a.member||'r-1'),a)
    return {ok:true,which,member:String(a.member||'r-1'),text:typeof text==='string'?text:String(text||'')}
  })
  registerTool('vibe_v4_message','Inject a message to a resident (or all).',objParams({to:{type:'string'},content:{type:'string'}},['to','content']),(s,a)=>{ const to=a.to||'all'; if(to==='all') return s.broadcast(a.content); return s.postMessage('facilitator',to,a.content) })
  registerTool('vibe_v4_meeting','Start a meeting (coordinate / allocate / propose verification).',objParams({agenda:{type:'string'}},['agenda']),(s,a)=>s.startMeeting(a.agenda))
  registerTool('vibe_v4_list_members','List residents.',objParams({}),(s)=>({ok:true,residents:s.listResidents()}))
  registerTool('vibe_v4_add_member','Add a resident.',objParams({direction:{type:'string'}}),(s,a)=>s.addMember(a.direction))
  registerTool('vibe_v4_remove_member','Close a resident.',objParams({id:{type:'string'}},['id']),(s,a)=>s.removeMember(a.id))
  // model/provider inheritance: set model/provider to override the residents' LLM route (''=inherit
  // the main assistant's route). toolAllow/toolDeny are per-resident tool permissions (scoped
  // restrict). residentPersona prepends a persona line to every resident prompt.
  // Lean knobs (docs/formal-verification.md §1): formalVerify is the three-way mode switch (the
  // MODE is dynamic — switching it changes the very next prompt), leanCommand/leanArgs select the
  // executable, leanTimeoutMs bounds one run. Invalid values fall back to the defaults and an
  // unknown mode degrades to 'off' (never to a STRONGER mode).
  registerTool('vibe_v4_set','Set V4 parameters: residentCount (how many residents a start spawns), compactThreshold (resident context % that triggers a compaction) and compactAfterRounds (rounds between soft compactions), meetingKeepEvery (every N newly accumulated artifacts an automatic sync meeting is convened), maxParallel (how many residents may be woken concurrently), activityTimeoutMs (idle window before a resident is nudged; also the heartbeat/watchdog period), stallAutoMeetingMs (how long the group may make NO progress before an auto sync meeting is convened), verdictMaxRounds (how many verification rounds one object gets: 1 independent round + re-vote debate rounds), model/provider override resident LLM route (empty=inherit main); toolAllow/toolDeny restrict resident tools (arrays of tool names); residentPersona adds a persona line; formalVerify: "off" (default, a true no-op) | "encourage" (residents decide by implementation difficulty whether to formalize in Lean; a passing Lean run turns the vote into a FIDELITY review of the Lean statements) | "require" (same, plus a gate: a unanimous true/false verdict is withheld as undecided until the object is Lean-passed or has an explicit reasoned blocker record); leanCommand/leanArgs/leanTimeoutMs configure the toolchain; leanAsync (default true) ENQUEUES each compile to a per-session background queue (concurrency 1, budget = leanTimeoutMs) and returns immediately with async:{jobId,state:\'queued\'} — results are announced in the next prompt and visible in vibe_v4_lean_lib.jobs; set leanAsync=false for the historical synchronous await; leanInitiative: "off" | "normal" (default) | "eager" is how PROACTIVE the group should be while working (it never changes what formalVerify requires at voting time); leanSearchPaths (array, default empty) adds extra compiler search roots — they are injected BEFORE the automatic VibeMath root, de-duplicated, and an explicit --search-path/-R/--root in leanArgs still wins; leanJobsMaxParallel (default 1) caps how many background compiles run at once; mathComputation: "auto" (default) | "on" | "off" enables the math_computation tool (off = a true no-op: no probe and no prompt line), mathMode: "typed+shell" (default) | "typed" drops the host-shell fallback and refuses the cli engine, mathEngines limits which engines may run (default python|r|octave|julia|matlab|maple|wolfram|cli), mathTimeoutMs bounds one computation, mathPackages is the pre-checked package list, mathInstallScope: "user" (default) | "system" is the scope an approved install plan may use (system applies to that request only and is never remembered); finalPaper (default true) writes the run\'s final PAPER automatically once the closing meeting votes unanimously to stop, paperFormat: "both" (default) | "md" | "tex" decides which text versions are produced, paperLanguage: "zh" (default) | "en", paperCompilePdf (default true) compiles a PDF when a LaTeX engine is actually detected (xelatex|latexmk|pdflatex|lualatex|tectonic, overridable via paperLatexCommand), paperEditor: "office" (default — the session root/human side) | "resident:<id>" names who finalises the merged draft after the cross-review round. A key outside this list is refused (ok:false, ignored:[...]) instead of being silently dropped.',objParams({residentCount:{type:'integer'},compactAfterRounds:{type:'integer'},compactThreshold:{type:'integer'},meetingKeepEvery:{type:'integer'},maxParallel:{type:'integer'},activityTimeoutMs:{type:'integer'},verdictMaxRounds:{type:'integer'},stallAutoMeetingMs:{type:'integer'},provider:{type:'string'},model:{type:'string'},residentPersona:{type:'string'},toolAllow:{type:'array',items:{type:'string'}},toolDeny:{type:'array',items:{type:'string'}},formalVerify:{type:'string',enum:['off','encourage','require']},leanCommand:{type:'string'},leanArgs:{type:'array',items:{type:'string'}},leanTimeoutMs:{type:'integer'},finalPaper:{type:'boolean'},paperFormat:{type:'string',enum:['both','md','tex']},paperLanguage:{type:'string',enum:['zh','en']},paperCompilePdf:{type:'boolean'},paperEditor:{type:'string'},paperLatexCommand:{type:'string'},leanAsync:{type:'boolean'},leanInitiative:{type:'string',enum:['off','normal','eager']},leanSearchPaths:{type:'array',items:{type:'string'}},leanJobsMaxParallel:{type:'integer'},mathComputation:{type:'string',enum:['auto','on','off']},mathMode:{type:'string',enum:['typed+shell','typed']},mathEngines:{type:'array',items:{type:'string'}},mathTimeoutMs:{type:'integer'},mathPackages:{type:'array',items:{type:'string'}},mathInstallScope:{type:'string',enum:['user','system']}}),(s,a)=>{ const r=s.setParams(a); const st=s.status(); if(r&&r.ok===false) return Object.assign({},st,{ok:false,warning:r.message,ignored:r.ignored}); return st })
  // resident-facing tools: route to the CALLING resident (exec.agent.id === childId);
  // fall back to the last-woken resident when called by the host/assistant.
  registerTool('vibe_v4_send_message','(resident) Send a message to another resident (to=all broadcasts to the whole team).',objParams({to:{type:'string'},content:{type:'string'}},['to','content']),(s,a,x)=>{ const from=s.residentIdOf(x); if(!from) return {ok:false,message:'no such resident'}; if(String(a.to)==='all') return s.broadcast(a.content, from); return s.postMessage(from,a.to,a.content) })
  registerTool('vibe_v4_publish_progress','(resident) Append to your own progress markdown.',objParams({content:{type:'string'}},['content']),(s,a,x)=>s.publishProgress(s.residentIdOf(x),a.content))
  registerTool('vibe_v4_record_proposition','(resident) Record a proposition to your library.',objParams({id:{type:'string'},title:{type:'string'},statement:{type:'string'},prob:{type:'number'},value:{type:'number'},motivation:{type:'string'}}),(s,a,x)=>s.recordProposition(s.residentIdOf(x),a))
  registerTool('vibe_v4_record_method','(resident) Record a method/theory to your library.',objParams({id:{type:'string'},title:{type:'string'},type:{type:'string'},content:{type:'string'},notation:{type:'string'},value:{type:'number'},motivation:{type:'string'}}),(s,a,x)=>s.recordMethod(s.residentIdOf(x),a))
  registerTool('vibe_v4_record_subproblem','(resident) Record a sub-problem to your library.',objParams({id:{type:'string'},title:{type:'string'},statement:{type:'string'},value:{type:'number'},motivation:{type:'string'}}),(s,a,x)=>s.recordSubproblem(s.residentIdOf(x),a))
  registerTool('vibe_v4_read_progress','(resident) Read another resident\'s progress (read-only).',objParams({id:{type:'string'}},['id']),async (s,a)=>{ const rp=await s.readProgress(a.id); return {ok:true,text:(rp&&rp.text)||''} })
  registerTool('vibe_v4_list_residents','(resident) List fellow residents.',objParams({}),(s)=>({ok:true,residents:s.listResidents()}))
  // task board (residents; board is the residents' own allocation mechanism)
  registerTool('vibe_v4_propose_task','(resident) Propose a task to the shared task board.',objParams({title:{type:'string'},description:{type:'string'}},['title']),(s,a,x)=>s.proposeTask(a.title,a.description,s.residentIdOf(x)))
  registerTool('vibe_v4_claim_task','(resident) Claim an open task from the board (framework then wakes you to work it).',objParams({id:{type:'string'}},['id']),(s,a,x)=>s.claimTask(a.id,s.residentIdOf(x)))
  registerTool('vibe_v4_task_done','(resident) Mark a claimed task done.',objParams({id:{type:'string'},claimer:{type:'string'}},['id']),(s,a,x)=>s.taskDone(a.id,a.claimer||s.residentIdOf(x)))
  registerTool('vibe_v4_list_tasks','(resident) List open tasks.',objParams({}),(s)=>({ok:true,tasks:s.listTasks()}))
  // context / compact (resident reports its context usage so the framework can /compact-equivalent)
  registerTool('vibe_v4_report_context','(resident) Report your context usage %; the framework compacts (self-summary) when it reaches compactThreshold.',objParams({pct:{type:'number'}},['pct']),(s,a,x)=>s.reportContext(s.residentIdOf(x),a.pct))
  // NOT IMPLEMENTED — and the description says so. These two tools were registered with
  // "Reserved: shared-file write lock", which reads as "the lock exists and works": a model following
  // the v3 convention called `claim_write`, got `{ok:true}` and concluded it held a lock that no code
  // anywhere implements (this preset has no shared file a resident writes — see the write-scope rule
  // in `contextBrief`, which restricts every resident to its OWN Progress/Propos/Methods/Subproblems
  // library, while the framework alone writes Shared/ and State/). They stay registered (removing them
  // would change the model-visible tool surface) and keep echoing the key, but they now tell the
  // truth: nothing is reserved, nothing is serialized, write only your own files.
  registerTool('vibe_v4_claim_write','NOT IMPLEMENTED: no lock exists. This returns {ok:true} without reserving anything. Each resident writes only its own library (Progress/<you>/, Propos/<you>/, Methods/<you>/, Subproblems/<you>/), so overlapping writers are not expected; the framework alone writes Shared/ and State/ (serially, per file). Do not rely on this to exclude another resident.',objParams({target:{type:'string'}},['target']),(s,a)=>({ok:true,key:a.target,locked:false,note:'no lock is implemented; write only your own library files'}))
  registerTool('vibe_v4_release_write','NOT IMPLEMENTED: there is no lock to release. Returns {ok:true} as a no-op so an agent that calls it out of habit is not misled into thinking it held a reservation.',objParams({target:{type:'string'}},['target']),(s,a)=>({ok:true,key:a.target,locked:false,note:'no lock is implemented; nothing was reserved'}))

  // ── Lean formal verification (docs/formal-verification.md §5) ─────────────
  // These three tools are registered UNCONDITIONALLY. Registration is STATIC (a mode-dependent
  // registration would be a dynamic effect and break the ctx.effect discipline), while the MODE
  // only decides whether the framework TELLS residents about them: in 'off' mode they still work
  // if a human or an agent calls them deliberately, but no prompt mentions them.
  registerTool('vibe_v4_lean_run','(resident) Execute the Lean toolchain on one .lean file inside the workspace and report the result. Never throws: a missing toolchain returns LEAN_NOT_FOUND, a non-zero exit returns the compiler output verbatim, a timeout returns LEAN_TIMEOUT. Pass target=<object id> to also record the run against that object.',objParams({file:{type:'string'},target:{type:'string'},timeout_ms:{type:'integer'}},['file']),(s,a,x)=>s.leanRunTool(s.residentIdOf(x),a))
  registerTool('vibe_v4_lean_archive',"(resident) Archive Lean code. kind=\"def\": a REUSABLE definition/object/assumption → the global cross-project library (Formal/Lib). kind=\"lemma\": a machine-checked lemma → Formal/Proved. kind=\"proof\": the formal proof of a project object → Formal/<target>.lean, and (when the run passes) also Verified/Lean/<target>.lean, marking the object Lean-passed. kind=\"blocked\": record an explicit, reasoned \"cannot/not worth formalizing\" decision (note required).",objParams({kind:{type:'string',enum:['def','lemma','proof','blocked']},name:{type:'string'},target:{type:'string'},content:{type:'string'},from:{type:'string'},note:{type:'string'},run:{type:'boolean'}},['kind']),(s,a,x)=>s.leanArchive(s.residentIdOf(x),a))
  registerTool('vibe_v4_lean_lib','(resident) List (and by default rebuild) the Lean reuse library: this project\'s Formal/Index.md, plus the global cross-project Formal/Lib and Formal/Proved indexes. Look here BEFORE writing a new definition so you reuse instead of redefining. The `paths.searchPath` field is the module root the framework injects into the compiler, and `jobs` shows the state of every background compile (leanAsync).',objParams({refresh:{type:'boolean'}}),async (s,a)=>{
    const r=(a&&a.refresh===false)?{lib:null,proved:null,objects:Object.keys(s.formalRecords()).length}:await s.rebuildLeanLibIndexes()
    return { ok:true, mode:s.formalMode(), rebuilt:!(a&&a.refresh===false), counts:r, todo:s.formalTodo(),
      objects:s.formalView().objects,
      paths:{project:'Formal/（相对项目根）',lib:'VibeMath/Formal/Lib/',proved:'VibeMath/Formal/Proved/',proofs:'Verified/Lean/',searchPath:s.leanPaths().searchPath,searchPaths:s.leanPaths().searchPaths},
      searchPath:s.leanPaths().searchPath,
      importNamespace:{lib:'import Formal.Lib.<name>',proved:'import Formal.Proved.<name>'},
      jobs:s.listLeanJobs(),
      hint:"复用优先：先在 Lib/ 里找现成定义（vibe_v4_lean_read 可取原文逐字复制）；新定义用 vibe_v4_lean_archive kind='def' 归档，已证引理用 kind='lemma'；后台编译进度看 jobs。" }
  })
  // lean-incremental-async §1.2: the ONLY new (read-only) tool. Reading an archived definition or
  // lemma VERBATIM is how a member reuses it without re-deriving it — or copies it when the local
  // toolchain cannot follow the import.
  registerTool('vibe_v4_lean_read','(resident, read-only) Read ONE archived Lean library file verbatim (for import-or-copy reuse). name is a bare library name (no path); kind is auto|lib|proved. Refuses anything outside <VibeMath>/Formal/{Lib,Proved}, and truncates at 64KB (truncated:true).',objParams({name:{type:'string'},kind:{type:'string',enum:['auto','lib','proved']}},['name']),(s,a)=>s.leanRead(a))
  // AMENDMENT §3: the read-only job/result surface (no polling tool beyond this one).
  registerTool('vibe_v4_lean_job','(resident, read-only) Background-compile jobs. Without jobId: this session\'s job list (state/receipt/archive). With jobId: that job\'s state, exitCode, receipt path (Formal/Jobs/<jobId>.json) and archive path; waitMs>0 waits up to that many milliseconds and then reports the current state (it never blocks forever).',objParams({jobId:{type:'string'},waitMs:{type:'integer'}}),(s,a)=>s.leanJobTool(a))

  // §2.5: the fiber's disposer must not leave an orphan compiler behind. Every session's in-flight
  // Lean job is terminated (and marked `interrupted`, never `passed`) when this preset subtree
  // unloads — the same lifecycle the tool/command registrations above already follow.
  ctx.effect(() => () => { for(const s of sessions.values()){ try { s.disposeLean() } catch(e){ /* best effort */ } } })

  //  (3) Per-session module instances: LAZY, cached by the session's host object. Each instance has
  //      its own adapted host (and therefore its own probe cache), so no state is shared between
  //      sessions — there is no "current session" slot to clobber, and concurrent calls from two
  //      sessions are fully independent (v5 uses the same structure).
  const mathInstances = new WeakMap()   // session host object -> module instance
  function mathInstanceFor(hostObj){
    if(!hostObj) return null
    const cached=mathInstances.get(hostObj)
    if(cached) return cached
    const inst=registerMathComputation({
      // Capture-only: the tool face was registered ONCE for the plugin instance (step 1/2 above).
      register: ()=>{},
      params: ()=>hostObj.params(),
      projectRoot: ()=>hostObj.projectRoot(),
      designator: 'vibe-math-v4',
      writeText: (rel, text)=>hostObj.writeText(rel, text),
      readText: (rel)=>hostObj.readText(rel),
      exists: (rel)=>hostObj.exists(rel),
      // audit-R2 lens-2: attached ONLY when the session surface really has it, so a surface without
      // listDir reaches the module as an ABSENT field (the module's optional-callback contract).
      ...(typeof hostObj.listDir === 'function' ? { listDir: (rel)=>hostObj.listDir(rel) } : {}),
      // round-7 (fix 2): pass the bundled-runtime seam through to the per-session module instance.
      ...(typeof hostObj.runtimeRoots === 'function' ? { runtimeRoots: ()=>hostObj.runtimeRoots() } : {}),
      ...(typeof hostObj.listDirAbs === 'function' ? { listDirAbs: (abs)=>hostObj.listDirAbs(abs) } : {}),
      resolveExecutable: (cmd)=>hostObj.resolveExecutable(cmd),
      spawn: (o)=>hostObj.spawn(o),
      // Optional capability flag: a host that KNOWS it has no subprocess service reports
      // MATH_NO_SUBPROCESS up front instead of a misleading ENGINE_NOT_FOUND + install guide.
      hasSubprocess: ()=>!!subprocessOf(),
      log: (kind, msg)=>hostObj.log(kind, msg),
    })
    mathInstances.set(hostObj, inst)
    return inst
  }
  function mathHandlerFor(session){
    const inst=mathInstanceFor(session&&session.mathHost)
    return inst?inst.handler:async()=>({ok:false,code:'MATH_INVALID_ARGUMENT',message:'math_computation: no session'})
  }

  // ================= math_computation registration (P1) =================
  // The tool CORE is the shared module (installed byte-identically in all four presets).
  //  (1) A throwaway CAPTURE-ONLY host yields the frozen tool face once: the module owns the name,
  //      description and closed schema, and this preset must advertise exactly those.
  registerMathComputation({
    register: (name, description, parameters, handler)=>{
      // The description/schema must be the module's frozen text (a local re-spelling would silently
      // diverge from the other three presets); referencing MATH_TOOL_DESCRIPTION is that check.
      if(description!==MATH_TOOL_DESCRIPTION) ctx.logger.warn('math_computation: 工具描述与共享模块的 MATH_TOOL_DESCRIPTION 不一致')
      mathToolFace={name, description, parameters, handler}
    },
    params: ()=>DEFAULT_PARAMS,
    projectRoot: ()=>'',
    writeText: async()=>false,
    readText: async()=>undefined,
    exists: async()=>false,
    resolveExecutable: async()=>{ throw new Error('NO_SUBPROCESS: capture-only host') },
    spawn: async()=>null,
    designator: 'vibe-math-v4',
    log: ()=>{},
  })
  //  (2) ONE tool registration for the whole plugin instance; the handler resolves the CALLING
  //      session's own module instance.
  registerTool(mathToolFace.name, mathToolFace.description, mathToolFace.parameters, (s,a)=>mathHandlerFor(s)(a||{}))

  // Same lifecycle rule as registerTool: commands.register() returns a disposer, so the
  // registration belongs to this fiber and must be unwound with it.
  ctx.effect(() => commands.register({
    name:'v4', description:'control the Vibe Math V4 framework',
    input:{hint:'[configure|start|resume|pause|abort|status|report|message <to|all> <content>|meeting|paper [lang=zh|en] [format=md|tex|both] [editor=office|resident:<id>] [force]|members|add|remove|set]'},
    handler: async function(inv){
      const s=getSession(inv&&inv.agent); if(!s) return {kind:'success',text:JSON.stringify({ok:false,error:'no session'})}
      const line=String(inv&&inv.rawInput?inv.rawInput:'').trim(); const parts=line.split(/\s+/); const cmd=parts[0]||''; const rest=parts.slice(1)
      let r
      if(cmd==='configure') r=await s.configure({project:rest[0]||'', problem:parts.slice(2).join(' ')})
      // `/v4 start <problem>` is the natural way to try this out and the tool it mirrors accepts a
      // problem, so the arguments are honoured instead of silently dropped (a bare `/v4 start` keeps
      // using the configured problem).
      else if(cmd==='start') r=await s.start(rest.length?{problem:rest.join(' ')}:{})
      else if(cmd==='resume') r=await s.resume()
      else if(cmd==='pause') r=s.setPause()
      else if(cmd==='abort') r=await s.initAbort()
      else if(cmd==='status') r=s.status()
      else if(cmd==='report') r=s.report()
      else if(cmd==='meeting') r=await s.startMeeting(rest.join(' '))
      else if(cmd==='message'){ const to=rest[0]||'all'; const content=rest.slice(1).join(' '); r=!content?{ok:false,usage:'message <to|all> <content>'}:((to==='all')?await s.broadcast(content):await s.postMessage('facilitator',to,content)) }
      else if(cmd==='members') r={ok:true,residents:s.listResidents()}
      else if(cmd==='add') r=await s.addMember(rest.join(' '))
      else if(cmd==='remove') r=await s.removeMember(rest[0]||'')
      else if(cmd==='set'){
        // Keys are validated HERE and the value is handed to the same `normalizeParam` the tool path
        // uses, so `/v4 set` cannot (a) coerce `provider=123` into a number for a string-typed key,
        // or (b) report success for a typo that `setParams` would silently ignore.
        const upd={}
        const known=s.status().paramsKeys||[]
        for(const tok of rest){
          const eq=tok.indexOf('='); if(eq<=0) continue
          const k=tok.slice(0,eq)
          if(known.indexOf(k)<0){ r={ok:false,message:'unknown parameter: '+k+'（用 /v4 status 查看可调参数）'}; break }
          upd[k]=tok.slice(eq+1)
        }
        if(r===undefined){
          // Apply, then answer with the SAME shape the `vibe_v4_set` TOOL answers with (the current
          // status + the applied/ignored bookkeeping): reporting only the raw setParams result would
          // make the slash command a different, less useful surface than the tool it mirrors.
          const res=s.setParams(upd)
          const st=s.status()
          r=(res&&res.ok===false)?Object.assign({},st,{ok:false,warning:res.message,ignored:res.ignored}):Object.assign({},st,{applied:res.applied})
        }
      }
      else if(cmd==='paper'){
        // Manual trigger (docs/final-paper.md §2). `lang=` / `format=` / `editor=` override THIS invocation only;
        // a bare `force` rewrites an already-finalized paper. An unknown token becomes an unknown
        // OPTION and is rejected by runPaperCommand → kind:'error' (never a silent success).
        const o={}; let force=false
        for(const tok of rest){ const eq=tok.indexOf('='); if(eq>0) o[tok.slice(0,eq)]=tok.slice(eq+1); else if(tok==='force') force=true; else if(tok) o[tok]=true }
        r=await s.runPaperCommand(o,force)
      }
      else r={ok:false,usage:'configure|start [problem]|resume|pause|abort|status|report|message <to|all> <content>|meeting|paper [lang=zh|en] [format=md|tex|both] [editor=office|resident:<id>] [force]|members|add|remove|set <k=v>...'}
      // `kind:'error'` on a rejected business action, exactly as v2/v3 do: every branch above used to
      // report `success`, so the human's only non-tool control surface read as success on failure.
      const failed = !r || r.ok === false || (r.ok === undefined && !!r.error)
      return {kind: failed?'error':'success', text:JSON.stringify(r,null,2)}
    },
  }))

  // Capture the live child Agent while it is still registered. `subagent/end` is
  // emitted only AFTER the child's Activation teardown has removed it from the agent
  // registry (dsh-subagent:1231 dispose -> dsh-agent:508 store.delete ->
  // dsh-subagent:1241 settle/emit), so an end-time `agents.get(childId)` can never
  // resolve. See `liveAgents` in the session body.
  //
  // DO NOT key this handler on `childOwner`: the host emits `subagent/start` INSIDE
  // `startContinuable`'s await (dsh-subagent/lib/index.js:1116 → `observer.start` → emit at `:306`,
  // and the direct `emit('subagent/start', …)` at `:279`), i.e. BEFORE that call resolves — and
  // `spawnResident` can only learn `started.childId` after the resolve. Keying on it made this
  // handler return for EVERY child, so `liveAgents` stayed empty for the whole run and the real
  // `/compact` path (`liveAgentOf` → `if(!agent || !agent.session) return`) was dead code.
  //
  // Ownership is therefore resolved the other way round: the handler finds the (usually single)
  // session whose spawn window is open and STASHES the Agent under the child id from the payload;
  // `spawnResident` claims that stash the moment its call resolves. For a host that embeds the spawn
  // label in the id, `ownsChild` can be decided from the payload alone — that path is used when no
  // spawn window is open, so a `subagent/start` for a child we did not spawn is never recorded.
  ctx.on('subagent/start', function(info){
    if(!info || !info.id) return
    let agent
    try { agent = agents.get(info.id) } catch(e){ agent = undefined }
    if(!agent) return
    let s
    try {
      for(const [,ss] of sessions){
        const open=ss.ownsChild && ss.ownsChild(info.id)
        if(open){ s=ss; break }
      }
      if(!s){ const sid=childOwner.get(info.id); if(sid!==undefined) s=sessions.get(sid) }
    } catch(e){ s=undefined }
    if(s){ s.rememberAgent(info.id, agent); return }
    // No owner yet — the spawn this child belongs to is still inside `startContinuable`. Stash it for
    // the first session whose spawn window is open, so the claim after the resolve can find it.
    for(const [,ss] of sessions){ if(ss.stashStartAgent){ ss.stashStartAgent(info.id, agent); return } }
  })

  ctx.on('subagent/end', function(info){
    const sid=childOwner.get(info.id); const s=sid!==undefined?sessions.get(sid):undefined
    if(s) s.onResidentEnd(info.id, info)
      .catch(e=>{ console.error('vibe-v4 end: '+String((e&&e.stack)||e)); if(s.nudge) s.nudge() })
      // Release the captured live Agent only AFTER this end has been processed, so the
      // real /compact inside onResidentEnd still sees it. The WeakRef means a missed
      // release only delays collection rather than leaking the Agent.
      .finally(()=>{ if(s.forgetAgent) s.forgetAgent(info.id) })
  })
}

// ---- test seam: pure, stateless helpers --------------------------------
// These helpers were declared inside `apply()` and are now declared at module scope, so
// `apply()` closes over exactly the same function objects this export hands out. The audit
// suites therefore exercise the REAL implementations by importing this module, instead of
// extracting source text and compiling function bodies through the Function constructor
// (dynamic code execution, rejected by the plugin-catalog security scan as
// DANGEROUS_DYNAMIC_EXECUTION).
//
// Contract: no member may touch `ctx`, session state or mutable module state. Most are pure;
// three are deliberately non-deterministic (`uuid`/`shortId` use Math.random, `fmtTime` falls back
// to the clock) and `parseProgress` normalises the object it is handed in place (pre-existing).
// Nothing here is used by the plugin at runtime except through `apply()`, and behaviour is
// byte-identical to the previous in-`apply` declarations.
export const __testHelpers = {
  uuid,
  shortId,
  clamp01,
  fmtTime,
  cl,
  clPct,
  blocksToText,
  posMs,
  slugify,
  idSafe,
  tryJson,
  parseReply,
  sanitizeToolFilter,
  registeredToolsFromError,
}

function now(){ return Date.now() }

function uuid(){ const h='0123456789abcdef'; let s=''; for(let i=0;i<36;i++){ if(i===8||i===13||i===18||i===23) s+='-'; else s+=h[Math.floor(Math.random()*16)] } return s }

function shortId(){ const h='0123456789abcdef'; let s=''; for(let i=0;i<8;i++) s+=h[Math.floor(Math.random()*16)]; return s }

function clamp01(v){ const n=Number(v); if(!Number.isFinite(n)) return 0.5; return Math.max(0,Math.min(1,n)) }

function fmtTime(ts){ try { return new Date(ts||now()).toISOString().replace('T',' ').slice(0,19) } catch(e){ return String(ts||'') } }

function cl(x){ return clamp01(Number(x)) }

function clPct(x){ const n=Number(x); if(!Number.isFinite(n)) return 0; return Math.max(0,Math.min(100,n)) }

function blocksToText(b){ if(!b) return ''; let out=''; for(const x of b){ if(x&&x.type==='text'&&typeof x.text==='string') out+=x.text+'\n' } return out.trim() }

function posMs(v,def){ const n=Number(v); return (Number.isFinite(n)&&n>0)?n:(def||120000) }

function slugify(s){ const t=String(s==null?'':s).trim().toLowerCase().replace(/[^a-z0-9_\-\u4e00-\u9fa5]+/g,'-').replace(/^-+|-+$/g,''); return t||'project' }

function idSafe(s){
  const t=String(s==null?'':s).trim().replace(/[\\/:*?"<>|\u0000-\u001f]+/g,'-').replace(/-{2,}/g,'-').replace(/^[.\-]+|[.\-]+$/g,'')
  return t||'id'
}

function tryJson(s){ try { return JSON.parse(s) } catch(e){ return undefined } }

function parseReply(text){
  let obj; const fence=/```(?:json)?[ \t]*([\s\S]*?)```/gi; let m
  while((m=fence.exec(text))!==null){ const o=tryJson(m[1].trim()); if(o&&typeof o==='object'&&!Array.isArray(o)) obj=o }
  if(!obj){ const w=tryJson(text.trim()); if(w&&typeof w==='object'&&!Array.isArray(w)) obj=w }
  return obj||{}
}

function sanitizeToolFilter(filter, known){
  if(!filter || !(known instanceof Set) || known.size === 0) return filter
  const out = {}
  for(const key of ['allow','deny']){
    const list = filter[key]
    if(!Array.isArray(list)) continue
    const kept = list.filter(function(n){ return known.has(String(n).trim()) })
    if(kept.length > 0) out[key] = kept
  }
  return (out.allow || out.deny) ? out : undefined
}

function registeredToolsFromError(message){
  const m = /known global tools:\s*([^]*)$/.exec(String(message || ''))
  if(!m) return undefined
  const names = m[1].split(',').map(function(s){ return s.trim() }).filter(Boolean)
  return names.length > 0 ? new Set(names) : undefined
}

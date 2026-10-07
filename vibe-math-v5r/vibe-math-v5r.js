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
// WHAT A MEMBER READS IS THE PRODUCT. Every prompt builder takes the member it addresses
// and derives the [状态] block, the roster, the quorum and the charter from THAT member —
// never from a "the last member we touched" global. A prompt naming the wrong identity is
// a fatal bug no tool-level assertion can see, so:
//   · `briefBlock` FAILS LOUDLY when it is not told which member it describes;
//   · `spawnMember` commits the member to the ACTIVE roster BEFORE building its brief;
//   · the charter is frozen at hire (it says "你入职时的在册编制") and reused on resume;
//   · a rebuilt session is framed as a rebuild, never as an induction;
//   · framing names the TRUE sender and kind, and framework feedback has its own sender.
// `prompt-v5-integrity.test.mjs` asserts all of that against the real prompt text and
// writes the full corpus to `prompt-corpus-v5/` for human review (实现方案.md §14.5).
//
// Durable state lives in the hardened JSON file `State/<institute>.v5state.json` (see the
// PERSISTENCE note below): the same pure event fold is applied IN MEMORY and each commit writes the
// whole snapshot through a serial promise chain, so a late writer can never land a stale subset.
// Events never enter the model history (zero context cost), and recovery is one code path for both
// an in-process restart and a cross-process resume: read the file, then fold. That structurally
// removes v4's `State/*.json` corruption / lost-write / resume-staleness class of bugs without
// touching any host log. (Historically this was a HOST-ONLY session projection unit whose events were
// appended to the user's session; that design is gone — see the PERSISTENCE note for the exact
// reason, and note that the JSON file was once the fallback for hosts without that registry.)
//
// NOTE: must declare `inject` for every service read as a ctx property (the Guard
// rejects undeclared dependencies). `timer` IS injected and used (ctx.timeout) so every
// timer here is a fiber-owned disposer — but the global setTimeout/clearTimeout DO exist
// in this preset's runtime: a preset is a FILE row loaded by a plain host-realm import().
// The vm sandbox that traps require/setTimeout/setInterval/fetch wraps only a DYNAMIC
// package's host half (@deepseek-ai/dsh-cordis-host-runner/lib/types/sandbox.js, reached
// only from the dynamic-package start path); v2/v3 use those globals and work. An earlier
// version of this note claimed the globals do not exist — false for file rows, and it would
// only become true if this preset were ever converted to a dynamic package.
//
// PERSISTENCE (fixed after the DSH 0.2.0 audit): institute state lives ONLY in the hardened JSON file
// `State/<institute>.v5state.json` (see makeFileBackend/installBackend below). It is never appended
// to a host session log: DSH's session persistence refuses to load a session that carries an unknown
// event type unless the writer marked it `ignorable: true`, and `Session.append` cannot set that
// field — so the old projection-based primary made the user's own session unresumable.

// ── task-4: known-location fallback (math-engine parity) ────────────────────────────────────────────
// Resolution order: an EXPLICIT command (leanCommand / paperLatexCommand) is used alone and never
// guessed; otherwise the host resolver (PATH) is tried first, then the known install locations for this
// platform. Provenance is returned so the caller can report \`leanFoundVia: 'explicit'|'path'|'known-install'\`,
// and the probed list travels on failure ("I looked here too"), never just "not found on PATH".
// ── task-28: TeX Live's DOCUMENTED typical install positions + a bounded probe budget ────────────────
// A real-host SLV v5 run (15.2 min, candidate PASS) archived compileStatus `not-detected` on a machine
// whose TeX Live lives at `D:\texlive\2025\bin\windows\xelatex.exe`: the known list only covered
// `<ProgramFiles>/texlive`, so an engine that IS installed but NOT on PATH was never found and the run
// degraded to tex+md only. These are DOCUMENTED roots, never a search: no whole-drive scan, no install,
// no write outside the workspace (the three hard boundaries stay in the guidance text).
const TEX_CANDIDATE_CAP = 40            // hard cap on TeX known-root candidate paths probed per detection
const TEX_YEAR_LOOKBACK = 4             // the newest N year dirs of a TeX Live root (current year + 3)
const TEX_DRIVE_YEAR_ROOTS = ['D:/texlive', 'C:/texlive']               // Windows: TeX Live at a DRIVE ROOT
const TEX_SYSTEM_BIN_ROOTS = ['/Library/TeX/texbin']                    // macOS: system MacTeX (already a bin dir)
const TEX_SYSTEM_YEAR_ROOTS = ['/usr/local/texlive', '/opt/texlive']    // Unix: TeX Live (year-globbed)
// ── feedback library (Shared/Feedback/) ──────────────────────────────────────────────────────────────
// The METHODOLOGY / COLLABORATION layer: how the institute WORKS (organisation, workflow, cooperation,
// obstacles, friction). Deliberately separate from Progress/ (research progress) and Verified/
// (established results) — an entry here is never evidence for a mathematical claim.
const FEEDBACK_CATEGORIES = ['cooperation', 'management', 'process', 'obstacle', 'conflict']
const FEEDBACK_CATEGORY_LABELS = { cooperation: '合作', management: '管理', process: '流程', obstacle: '障碍', conflict: '矛盾' }
// The three ROUTES decide what "handling" an entry means — and, crucially, WHO has to do anything:
//   self          — my own way of working / habits / pitfalls ⇒ I adjust it MYSELF; nobody's approval,
//                   at most a share so colleagues do not hit the same wall.
//   team          — how the institute is organised/run (task assignment, workflow, organisation model)
//                   ⇒ also self-regulation: no approval, change it as soon as it looks wrong.
//   interpersonal — the problem is caused by SOMEONE ELSE and only they can fix it ⇒ the ONLY route that
//                   needs a careful assessment first ("should anything change, and would the change
//                   really be better?") and a written-back verification afterwards.
const FEEDBACK_ROUTES = ['self', 'team', 'interpersonal']
// `open` = recorded, not yet handled; `adjusted` = the initiator adjusted their own way of working
// (for self/team this IS the closing record — no approval step exists); `closed` = a result was written
// back (interpersonal REQUIRES that write-back); `dropped` = evaluated and deliberately NOT changed
// (needs a reason). list's default "not yet closed" filter = open|adjusted.
const FEEDBACK_STATUSES = ['open', 'adjusted', 'closed', 'dropped']
const FEEDBACK_OPEN_STATUSES = ['open', 'adjusted']
const FEEDBACK_DIR = 'Shared/Feedback'
const FEEDBACK_DISABLED_MESSAGE = '反馈库已关闭（params.feedback = \'off\'）：本条未写入、也未改动任何条目'
async function resolveKnownTool(sub, opts) {
  const name = String((opts && opts.name) || '')
  const explicit = String((opts && opts.explicit) || '').trim()
  const kind = String((opts && opts.kind) || 'lean')
  const tried = []
  const env = (typeof process !== 'undefined' && process.env) || {}
  const win = !!(typeof process !== 'undefined' && process.platform === 'win32')
  const home = String(env.USERPROFILE || env.HOME || (win ? 'C:/Users/Default' : '/root'))
  const local = String(env.LOCALAPPDATA || '')
  const pf = String(env.ProgramFiles || 'C:/Program Files')
  const pf86 = String(env['ProgramFiles(x86)'] || 'C:/Program Files (x86)')
  const elan = String(env.ELAN_HOME || '')
  const exts = win ? ['', '.exe', '.cmd', '.bat'] : ['']
  const resolvePath = async (p) => {
    tried.push(p)
    try { const fs = await import('node:fs'); for (const e of exts) { const q = p + e; try { if (fs.existsSync(q) && fs.statSync(q).isFile()) return q } catch (err) { /* keep looking */ } } } catch (err) { /* no fs */ }
    return null
  }
  const listDirs = async (p) => { try { const fs = await import('node:fs'); return fs.readdirSync(p, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) } catch (err) { return [] } }
  // task-29: TEST/DIAGNOSTIC sandbox seam (env-gated; UNSET = identity, i.e. exactly today's behaviour).
  // When `V5_TEX_ROOTS_SANDBOX` is set, every known-install TeX candidate is REBASED under that directory
  // (same relative tail) so a suite can pin its "no LaTeX installed here" premise on ANY host: the
  // candidates are still probed ONE BY ONE (triedPaths stays named, TEX_CANDIDATE_CAP still bounds them,
  // still no whole-drive scan) but a real install is never touched. It is not a product switch: it only
  // relocates where the documented roots are looked for, and it is never set by the plugin itself.
  const texSandbox = kind === 'tex' ? String(env.V5_TEX_ROOTS_SANDBOX || '').trim() : ''
  const texProbeBase = (p) => {
    if (!texSandbox) return p
    const tail = String(p).replace(/\\/g, '/').replace(/^[A-Za-z]:/, '').replace(/^\/+/, '')
    return texSandbox.replace(/\\/g, '/').replace(/\/+$/, '') + '/' + tail
  }
  const knownLean = win
    ? [elan ? elan + '/bin' : null, home + '/.elan/bin', local ? local + '/Programs/lean' : null, pf + '/lean/bin']
    : [elan ? elan + '/bin' : null, home + '/.elan/bin', home + '/.local/bin', '/usr/local/bin', '/opt/lean/bin']
  // task-28: the DRIVE-ROOT TeX Live positions come first on Windows (the observed real-host layout);
  // the legacy entries keep their relative order. Unix keeps the legacy order and adds the system
  // MacTeX bin dir last (a documented root, not a guess).
  const knownTex = win
    ? TEX_DRIVE_YEAR_ROOTS.concat([pf + '/texlive', pf86 + '/texlive', local ? local + '/Programs/MiKTeX/miktex/bin/x64' : null, pf + '/MiKTeX/miktex/bin/x64'])
    : [home + '/Library/TeX/texbin'].concat(TEX_SYSTEM_YEAR_ROOTS, [home + '/.TinyTeX/bin'], TEX_SYSTEM_BIN_ROOTS)
  const list = kind === 'tex' ? knownTex : knownLean
  // 1) EXPLICIT: only it, never a guess.
  if (explicit) {
    if (typeof sub.resolveExecutable === 'function') { try { const p = await sub.resolveExecutable(explicit); if (p) return { exe: String(p), via: 'explicit', tried, name: explicit } } catch (e) { /* fall through to PATH */ } }
    const p = await resolvePath(explicit)
    if (p) return { exe: p, via: 'explicit', tried, name: explicit }
    return { exe: null, via: null, tried, name: explicit, reason: 'explicit command not resolvable: ' + explicit }
  }
  // 2) PATH via the host resolver.
  if (typeof sub.resolveExecutable === 'function') {
    try { const p = await sub.resolveExecutable(name); if (p) return { exe: String(p), via: 'path', tried, name } } catch (e) { /* PATH miss is expected */ }
  }
  // 3) KNOWN INSTALL LOCATIONS. A TeX root WITHOUT a `bin` segment is year-globbed
  //    (`<root>/<year>/bin/<platform>`): the years actually on disk (newest first) first, then the
  //    recent-year window, at most TEX_YEAR_LOOKBACK of them. task-28: the whole stage is BOUNDED by
  //    TEX_CANDIDATE_CAP candidate paths — documented roots, never a whole-drive scan.
  const texYearSubdirs = win ? ['bin/windows'] : ['bin/x86_64-linux', 'bin/aarch64-linux', 'bin/universal-darwin', 'bin']
  const texRecentYears = () => { const now = new Date().getFullYear(); const out = []; for (let i = 0; i < TEX_YEAR_LOOKBACK; i++) out.push(String(now - i)); return out }
  let texProbes = 0
  for (const base of list) {
    if (!base) continue
    if (kind === 'tex' && !/bin/i.test(base)) {
      const onDisk = (await listDirs(texProbeBase(base))).filter((d) => /^\d{4}$/.test(d)).sort((a, b) => Number(b) - Number(a))
      const years = onDisk.concat(texRecentYears().filter((y) => onDisk.indexOf(y) < 0)).slice(0, TEX_YEAR_LOOKBACK)
      for (const year of years) {
        for (const sub2 of texYearSubdirs) {
          if (texProbes >= TEX_CANDIDATE_CAP) break
          texProbes++
          const p = await resolvePath(texProbeBase(base) + '/' + year + '/' + sub2 + '/' + name)
          if (p) return { exe: p, via: 'known-install', tried, name }
        }
        if (texProbes >= TEX_CANDIDATE_CAP) break
      }
      if (texProbes >= TEX_CANDIDATE_CAP) break
      continue
    }
    if (kind === 'tex') {
      if (texProbes >= TEX_CANDIDATE_CAP) break
      texProbes++
    }
    const p = await resolvePath(texProbeBase(base) + '/' + name)
    if (p) return { exe: p, via: 'known-install', tried, name }
  }
  return { exe: null, via: null, tried, name, reason: 'not found on PATH or in the known install locations' }
}

export { resolveKnownTool }

export const inject = ['subagents', 'agents', 'fs', 'tools', 'commands', 'timer']

// ── math_computation (docs/math-computation.md) ──────────────────────────────
// The tool CORE lives in a shared module installed byte-identically into all four presets
// (`_oneoff/mc-P1-ready/INTERFACE-FREEZE.md` §3/§4): this preset only wires it (import +
// params + one registration + prompt text). The module imports `./math-engines.js` itself.
import {
  MATH_PARAM_NAMES,
  MATH_PARAM_DEFAULTS,
  MATH_CAPS,
  MATH_SHELL_FALLBACK_MARK,
  MATH_TOOL_DESCRIPTION,
  MATH_PERSONA_TOOL_LINE,
  MATH_RULE_LINES,
  MATH_RULE_LINES_EN,
  MATH_ARCHIVE_WORKFLOW_LINE,
  MATH_ARCHIVE_WORKFLOW_LINE_EN,
  MATH_SUBSTITUTION_RULE_LINE,
  MATH_SUBSTITUTION_RULE_LINE_EN,
  normalizeMathParams,
  probeMathEngines,
  registerMathComputation,
  mathAvailabilityLine,
} from './math-computation.js'

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
  solve: 'vibe5/solve',
  progress: 'vibe5/progress',
  formal: 'vibe5/formal',
}

// ── final paper (docs/final-paper.md) ─────────────────────────────────────────
// The run's LAST deliverable. The permanent staff each write their own part, cross-review
// each other's part, and the editor named by `paperEditor` finalises — but ONLY after the
// whole institute has agreed the parts are deliverable, and (when the office edits) only
// after the office has consulted the institute. The phase runs BEFORE the completion flags
// are flipped (docs/final-paper.md §3): after `phase='solved'` the machinery refuses to wake
// members (`wakeIfIdle`), to convene meetings (`startMeeting`) or to dispatch an end.
const PAPER_MAX_ROUNDS = 3
// Chinese first (docs/final-paper.md §8): xelatex covers CJK out of the box; English prefers pdflatex.
const PAPER_ENGINE_ORDER = {
  zh: ['xelatex', 'latexmk', 'pdflatex', 'lualatex', 'tectonic'],
  en: ['pdflatex', 'latexmk', 'lualatex', 'tectonic', 'xelatex'],
}
// The repair pass keeps only what the text itself needs; everything else (hyperref,
// longtable, booktabs, an unknown package) is dropped before the retry.
const PAPER_REPAIR_CORE = ['amsmath', 'amssymb', 'amsthm', 'geometry', 'ctex']
const PAPER_SECTIONS = [
  '标题、作者、日期与摘要',
  '引言与问题背景',
  '原问题的完整解法',
  '已检验通过的命题',
  '已解决的子问题 / 中间成果',
  '创造或发现的有价值之物：方法、理论、思想、经验与数学理解',
  '规律总结',
  '讨论、局限与展望',
  '附录：证据与文件索引',
]

// ── Lean async compile queue + search path (docs/formal-verification.md §1/§5/§7) ──────────
// The queue is a per-session FIFO driven by the existing heartbeat, so the constants and the
// pure helpers live at module scope. Concurrency is a CONSTANT, not a parameter: compiles and
// the model compete for the same CPU, and the parameter surface deliberately gains only
// `leanAsync` (the per-compile budget reuses `leanTimeoutMs`).
const LEAN_QUEUE_CONCURRENCY = 1
// task-27 (real-host A round + local reproduction): Lean 4 accepts `-R`/`--root` (or LEAN_PATH); `--search-path`
// is the **Lean 3** spelling and makes `lean` fail at ARGUMENT PARSING (rc=1) before it reads the file — so every
// compile failed by default. Local check on Lean 4.34.0: `lean --search-path <dir> <f>` ⇒ rc=1; `lean -R <dir> <f>`
// ⇒ accepted (the compiler then reads the file). ONE place for the flag spelling: change this constant only.
const LEAN_SEARCH_PATH_FLAG = '-R'
const LEAN_READ_MAX_BYTES = 64 * 1024
// A user-supplied search root wins: never inject a second one (explicit override first).
function leanHasSearchFlag(args) {
  // task-27: the flag we INJECT is `-R` (Lean 4). A user may still state any of these in `leanArgs` — the legacy
  // Lean-3 spelling included — and this guard's only job is "never inject a SECOND search root".
  const ALSO_ACCEPTED = ['--search-path', '--root']
  return (Array.isArray(args) ? args : []).some((a) => {
    const t = String(a)
    if (t === LEAN_SEARCH_PATH_FLAG || t.indexOf(LEAN_SEARCH_PATH_FLAG + '=') === 0) return true
    return ALSO_ACCEPTED.some((f) => t === f || t.indexOf(f + '=') === 0)
  })
}
// Content identity for queue dedupe: CRLF normalised, trailing blank lines dropped.
function leanHashText(s) {
  return String(s == null ? '' : s).replace(/\r\n?/g, '\n').replace(/[\s\n]+$/, '')
}
const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]
const sha256Rotr = (x, n) => ((x >>> n) | (x << (32 - n))) >>> 0
// SHA-256 (FIPS 180-4), implemented here instead of importing `node:crypto`: this preset is a
// self-contained file row with ZERO imports, and the digest is only a content identity (queue
// dedupe + job id). `__testHelpers.sha256Hex` is checked against the published vectors AND
// against `node:crypto` in the tests, so correctness is proven rather than assumed.
function sha256Hex(input) {
  const text = String(input == null ? '' : input)
  const bytes = []
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    if (c < 0x80) bytes.push(c)
    else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63))
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length && text.charCodeAt(i + 1) >= 0xdc00 && text.charCodeAt(i + 1) <= 0xdfff) {
      const cp = 0x10000 + ((c - 0xd800) << 10) + (text.charCodeAt(i + 1) - 0xdc00)
      i++
      bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63))
    } else bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63))
  }
  const bitLen = bytes.length * 8
  bytes.push(0x80)
  while (bytes.length % 64 !== 56) bytes.push(0)
  const hi = Math.floor(bitLen / 0x100000000)
  bytes.push((hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255)
  bytes.push((bitLen >>> 24) & 255, (bitLen >>> 16) & 255, (bitLen >>> 8) & 255, bitLen & 255)
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19
  const w = new Array(64)
  for (let off = 0; off < bytes.length; off += 64) {
    for (let i = 0; i < 16; i++) {
      const j = off + i * 4
      w[i] = ((bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3]) >>> 0
    }
    for (let i = 16; i < 64; i++) {
      const x = w[i - 15], y = w[i - 2]
      const s0 = (sha256Rotr(x, 7) ^ sha256Rotr(x, 18) ^ (x >>> 3)) >>> 0
      const s1 = (sha256Rotr(y, 17) ^ sha256Rotr(y, 19) ^ (y >>> 10)) >>> 0
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7
    for (let i = 0; i < 64; i++) {
      const S1 = (sha256Rotr(e, 6) ^ sha256Rotr(e, 11) ^ sha256Rotr(e, 25)) >>> 0
      const ch = ((e & f) ^ (~e & g)) >>> 0
      const t1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0
      const S0 = (sha256Rotr(a, 2) ^ sha256Rotr(a, 13) ^ sha256Rotr(a, 22)) >>> 0
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0
      const t2 = (S0 + maj) >>> 0
      h = g; g = f; f = e; e = (d + t1) >>> 0
      d = c; c = b; b = a; a = (t1 + t2) >>> 0
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7].map((x) => ('00000000' + x.toString(16)).slice(-8)).join('')
}

// Stable error codes (ported from DSH agent-teams' typed-error discipline).
function v5err(code, message) {
  const e = new Error(message || code)
  e.code = code
  return e
}

// ---- host live-child cap (DSH ≥ 0.2) ----------------------------------------
// The host caps the number of LIVE continuable children PER ROOT AGENT. Evidence (installed
// dsh-subagent 0.2.0-rc.2): `materialize` calls `ActivationPool.reserve(this.maxActiveSubagents())`
// and `reserve` throws `SubagentError('subagent limit reached (active child limit: <capacity>);
// wait for an existing child to finish or complete this work with the current agents',
// 'ACTIVATION_LIMIT_REACHED')` once every slot is taken. The capacity is the `subagent` row's
// `maxActiveSubagents` Config key (default 8; no preset sets it), the cap is shared by all
// descendants of that root, and a slot is released when a child settles. The `.d.ts` does NOT
// document the throw.
//
// The detector and the remembered limit live at MODULE scope because the cap is a property of the
// HOST (one number for every root of this process), not of one institute. On DSH 0.1.x
// `subagents.startContinuable` never throws this code, so every branch below is inert there — the
// error code itself is the feature test, there is no version check anywhere.
let hostChildLimit                 // undefined until the host tells us its ceiling (via a refusal)
function isActivationLimitReached(e) { return String((e && e.code) || '') === 'ACTIVATION_LIMIT_REACHED' }
function noteChildLimit(e) {
  const m = /active child limit:\s*(\d+)/.exec(String((e && e.message) || e || ''))
  if (m) hostChildLimit = Number(m[1])
  return hostChildLimit
}
// One actionable sentence naming the HOST ceiling and the knob that raises it.
function hostChildLimitHint(limit) {
  const n = (limit === undefined || limit === null) ? '' : ('=' + limit)
  return '本宿主对「同时在活的续聊子代理」有上限（宿主 subagent 行的 maxActiveSubagents 参数' + n
    + '，写满后子代理服务抛 ACTIVATION_LIMIT_REACHED）'
}

export function apply(ctx) {
  const subagents = ctx.subagents
  const agents = ctx.agents
  const fs = ctx.fs
  const tools = ctx.tools
  const commands = ctx.commands

  // A plugin UNLOAD must not leave an orphan compiler behind (docs/formal-verification.md §7-6):
  // every session registers its Lean disposer here, and this effect's disposer terminates what
  // is in flight and marks it `interrupted` (never `passed`). Registered FIRST so a host that
  // records effect disposers (the tests do) can reach it deterministically.
  const leanDisposers = new Set()
  ctx.effect(() => () => {
    for (const d of Array.from(leanDisposers)) { try { d() } catch (e) { /* best effort */ } }
  })

  // Optional services are resolved LAZILY at call time, never snapshotted in apply():
  // a `ctx.get()` snapshot taken here is order-sensitive, so a service provided later
  // would stay undefined for the whole session.
  const sandboxPolicyOf = () => { try { return ctx.get('sandboxPolicy') } catch (e) { return undefined } }
  const subprocessOf = () => { try { return ctx.get('subprocess') } catch (e) { return undefined } }
  const compactionOf = () => { try { return ctx.get('compaction') } catch (e) { return undefined } }
  // Prefer the AGENT's own context: this preset mounts its compaction row inside the preset's
  // `compaction` isolate realm, and a realm never falls back to the host-root instance, so the root
  // object can be a different policy. v4 resolves it this way already.
  const compactionForAgent = (agent) => {
    try {
      const own = agent && agent.ctx && typeof agent.ctx.get === 'function' ? agent.ctx.get('compaction') : undefined
      if (own !== undefined) return own
    } catch (e) { /* fall back to the plugin plane */ }
    return compactionOf()
  }

  // ---- utils -------------------------------------------------------------
  function hex(n) { let s = ''; for (let i = 0; i < n; i++) s += '0123456789abcdef'[Math.floor(Math.random() * 16)]; return s }
  const shortId = () => hex(8)
  // contextPct is a PERCENT (0-100); never clamp to 0-1 or the compactThreshold
  // comparison (e.g. 66) becomes `1.0 >= 66` and never fires (v4 §17 defect).
  // Positive duration with a safe fallback: a NEGATIVE/NaN duration parameter must
  // never make a watchdog fire instantly or an idle window never elapse (v4 §30-T41).
  const textBlock = (t) => ({ type: 'text', text: String(t) })
  function makeSignal(ms) { try { return AbortSignal.timeout(posMs(ms, 30000)) } catch (e) { return undefined } }

  // Object ids (verify targets, card ids, member ids) become FILE NAMES and DIRECTORY
  // PATHS. A hostile/sloppy id containing separators ('../../x') or Windows-forbidden
  // characters would escape the project tree. Keep every harmless character (incl.
  // Chinese) and replace only separators/control chars; strip leading/trailing dots
  // and dashes so the name is never '.' or '..' (v4 §30-T39).
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

  // ---- state fold: the one fold every entry point shares ----------------
  // The fold is shared by BOTH persistence backends, so the state machine is
  // defined exactly once. It must return a NEW top-level reference whenever
  // anything changed (the state store compares by Object.is).
  // The acknowledgement ledger is an LRU window, NOT a full history: it exists to answer
  // "was this message delivered?", and the whole snapshot is rewritten on every commit.
  const DELIVERED_CAP = 500
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
      // Per-object Lean formalization record (docs/formal-verification.md). Kept in the
      // state so it survives restore with zero context cost, exactly like verdicts.
      formal: {},
      todo: [],
      queue: [],
      // Per-member answers to the "is the original problem solved?" question (HIGH 3). It used to
      // live in an in-memory Map: the tally gated `solved` and was PUBLISHED by status/report, but
      // a restart or a second session over the same institute lost it, so cross-session unanimity
      // was impossible and the published view was wrong. Durable like `verdicts`.
      solve: {},
      counters: { academician: 0, researcher: 0, temp: 0, task: 0, meeting: 0, message: 0, verify: 0 },
      runId: '',
      lastProgressAt: now(),
      artifactCount: 0,
      diagnostics: [],
      // F6 (status/report review): the durable marker of a meeting that STARTED but never
      // FINALIZED. The meeting index entry is appended at `beginMeeting`, so before this marker a
      // restart made an unfinished meeting look like ordinary history (minutes never written).
      meetingOpen: null,
      // F4 (status/report review): how many office-addressed requests the fold had to drop because
      // of `OFFICE_REQUEST_CAP`. Without a counter the truncation was invisible in status/report.
      officeRequestsDropped: 0,
      // The final-paper flow (stage machine + its artifacts state). Durable like everything
      // else, so a restart resumes the same stage instead of writing a second paper.
      paper: null,
      // Methodology/collaboration feedback (Shared/Feedback/). Durable like `verdicts`, so a restart
      // keeps the loop closed instead of losing what the institute learned about working together.
      feedback: [],
    }
  }
  // LOW (deep review): `state.order` used to be maintained here and preserved in the diagnostics
  // fallback, but NOTHING ever read it — dead payload written into every snapshot. Removed: the
  // institutes map is the index (`Object.keys(state.institutes)`), and old files that still carry
  // an `order` key are simply ignored.
  function initState() { return { v: PROJECTION_VERSION, institutes: {} } }

  // S3 (deep-review 4): the returned state now PRESERVES every unknown TOP-LEVEL key from the
  // loaded file (`Object.assign({}, state, …)`) instead of rebuilding `{v, institutes,
  // diagnostics}` and thereby silently erasing anything a NEWER revision wrote at that level. The
  // institute level already behaved that way (the fold copies the institute object), so this makes
  // the two levels consistent. `order` stays gone for good (it was written-but-never-read and was
  // removed in the previous round), so nothing is re-added here.
  function withInstitute(state, key, mut) {
    const cur = state.institutes[key] || emptyInstitute(key, '', '')
    const nextInst = mut(cur)
    if (nextInst === cur) return state
    const institutes = Object.assign({}, state.institutes)
    institutes[key] = nextInst
    return Object.assign({}, state, { institutes })
  }

  // Fold ONE event. Unknown/malformed events are SKIPPED and recorded in
  // `diagnostics` rather than latching a permanent failure: availability beats
  // log purism, and a malformed event is a code defect that tests must catch.
  // (DSH's own team projection latches `state.failure` forever instead — a shape
  // v5 deliberately does not copy.)
  // ── in-fold id allocation (deep-review HIGH 1) ───────────────────────────────
  // Ids used to be minted OUTSIDE the fold (read `counters` → `msg-N` → `await putMessage`), so
  // two same-tick writers could mint the SAME id; the fold then deduped (`messages`) or upserted
  // (`members`/`tasks`), silently dropping or overwriting one object while BOTH callers reported
  // success. An event may now carry `d.make(alloc)` instead of a ready object: it runs INSIDE the
  // fold, allocates its id from the fold's OWN counters, and returns the object(s) to
  // append/upsert — the fold applies the object AND the bumped counters in the same step, so two
  // concurrent appends cannot collide. Already-identified objects (`d.member`/`d.task`/
  // `d.message`/`d.index`, the update paths) keep working unchanged.
  const ID_PREFIX = { message: 'msg-', task: 't-', meeting: 'mt-', researcher: 'r-', temp: 't-' }
  // MEDIUM 4 (deep review): the OFFICE is not a member, so `to:'voters'` never reaches it — yet
  // `addResearcher`/`startMeeting` told the caller "已向所办提议" while only voters were addressed
  // (and only the office may approve either). Office-addressed requests are now a first-class
  // target: a durable message under this pseudo-id, surfaced by `status().officeRequests` and by
  // `report()`, capped so the queue cannot grow without bound.
  const OFFICE_INBOX = 'office'
  const OFFICE_REQUEST_CAP = 10
  function makeIdAllocator(inst) {
    const counters = Object.assign({}, inst.counters)
    let dirty = false
    return {
      next(kind) {
        if (kind === 'academician') {
          counters.academician = Math.max(1, Number(counters.academician) || 0)
          dirty = true
          return 'acad'
        }
        const n = Math.max(0, Number(counters[kind]) || 0) + 1
        counters[kind] = n
        dirty = true
        return (ID_PREFIX[kind] || kind + '-') + n
      },
      counters() { return dirty ? counters : inst.counters },
    }
  }
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
          // F6 / F4 (status/report review): two durable markers the published surfaces read.
          if (patch.meetingOpen !== undefined) n.meetingOpen = patch.meetingOpen === null ? null : Object.assign({}, patch.meetingOpen)
          if (patch.officeRequestsDropped !== undefined) n.officeRequestsDropped = Number(patch.officeRequestsDropped) || 0
          // The final-paper state. A FUNCTION is a MUTATION applied inside the fold (the same
          // trick the verify queue uses): the paper stage, its parts and its office-consultation
          // counters are updated from several places (member replies, office messages, meetings),
          // and a whole-object read-modify-write outside the fold would lose updates.
          if (patch.paper !== undefined) {
            const next = typeof patch.paper === 'function'
              ? patch.paper(n.paper === undefined ? null : n.paper)
              : patch.paper
            if (next !== undefined) n.paper = next
          }
          // Durable methodology/collaboration feedback (Shared/Feedback/). A FUNCTION is a mutation
          // applied INSIDE the fold (the same trick `paper` uses): several members may add or update
          // entries between two commits, and a read-modify-write outside the fold would lose one.
          if (patch.feedback !== undefined) {
            const next = typeof patch.feedback === 'function'
              ? patch.feedback(Array.isArray(n.feedback) ? n.feedback : [])
              : patch.feedback
            if (next !== undefined) n.feedback = Array.isArray(next) ? next : []
          }
          // S4 (D1/R4)：主持代行记录。`meeting.chair` 只活在**当次会议**的内存对象里，会议一收束就没了；
          // 这份耐久副本让"代行须在会议记录中明确写明"在收束之后仍可查，也让判定面能证明它**不读**代行
          // （R5：代行不产生新票权、主持不额外加权）。
          if (patch.chair !== undefined) n.chair = patch.chair === null ? null : Object.assign({}, patch.chair)
          // S5 (R1/D10)：静止提示的耐久标记。同一静止片段**最多提示一次** ⇒ 必须跨重启记住"这一
          // 片段已经提示过"（纯内存标记在重启后会丢，静止的 run 会重发第二条，违反"最多一次"）。
          if (patch.stallNotice !== undefined) n.stallNotice = patch.stallNotice === null ? null : Object.assign({}, patch.stallNotice)
          // S6（D1/D2/D6/D8）：临时授权**台账**。append-only（不覆盖历史），授权与撤回都留痕；
          // fold 是显式白名单 ⇒ 不加这行 `patchInstitute({grants})` 会被**静默丢弃**（S4/S5 已证）。
          if (patch.grants !== undefined) {
            const next = typeof patch.grants === 'function' ? patch.grants(Array.isArray(n.grants) ? n.grants : []) : patch.grants
            if (next !== undefined) n.grants = Array.isArray(next) ? next : []
          }
          // S7（D3/D4/R9/K13）：投票板**台账**（append-only：板与每一票都留痕）。同样走 fold 白名单
          // ⇒ 不写这行 `patchInstitute({ballots})` 会被**静默丢弃**（S4/S5/S6 已证）。
          if (patch.ballots !== undefined) {
            const nextB = typeof patch.ballots === 'function' ? patch.ballots(Array.isArray(n.ballots) ? n.ballots : []) : patch.ballots
            if (nextB !== undefined) n.ballots = Array.isArray(nextB) ? nextB : []
          }
          // S10（D6/G5）：**私聊补记**台账（append-only：只记"何时由谁把它补记到哪"这一事实，
          // **不搬原私聊正文**）。同样走 fold 白名单 ⇒ 漏写即静默丢弃。
          if (patch.chatSupplements !== undefined) {
            const nextS = typeof patch.chatSupplements === 'function' ? patch.chatSupplements(Array.isArray(n.chatSupplements) ? n.chatSupplements : []) : patch.chatSupplements
            if (nextS !== undefined) n.chatSupplements = Array.isArray(nextS) ? nextS : []
          }
          // S11（GAPS 29）：**记录人台账**（append-only：谁在何时被指定/撤销、对哪次会议）。
          // 同样走 fold 白名单 ⇒ 漏写即静默丢弃。
          if (patch.secretaries !== undefined) {
            const nextR = typeof patch.secretaries === 'function' ? patch.secretaries(Array.isArray(n.secretaries) ? n.secretaries : []) : patch.secretaries
            if (nextR !== undefined) n.secretaries = Array.isArray(nextR) ? nextR : []
          }
          return n
        })
      }
      if (t === EV.member) {
        return withInstitute(state, key, (inst) => {
          const alloc = typeof d.make === 'function' ? makeIdAllocator(inst) : null
          const made = alloc ? d.make(alloc) : d.member
          const list = (Array.isArray(made) ? made : [made]).filter(Boolean)
          if (!list.length) return inst
          const members = inst.members.slice()
          let changed = false
          for (const m of list) {
            if (!m || typeof m.id !== 'string' || !m.id) continue
            const i = members.findIndex((x) => x.id === m.id)
            if (i === -1) members.push(m); else members[i] = m
            changed = true
          }
          if (!changed) return inst
          const out = Object.assign({}, inst, { members })
          if (alloc) out.counters = alloc.counters()
          return out
        })
      }
      if (t === EV.task) {
        return withInstitute(state, key, (inst) => {
          const alloc = typeof d.make === 'function' ? makeIdAllocator(inst) : null
          const made = alloc ? d.make(alloc) : d.task
          const list = (Array.isArray(made) ? made : [made]).filter(Boolean)
          if (!list.length) return inst
          const tasks = inst.tasks.slice()
          let changed = false
          for (const task of list) {
            if (!task || typeof task.id !== 'string' || !task.id) continue
            const i = tasks.findIndex((x) => x.id === task.id)
            if (i === -1) tasks.push(task); else tasks[i] = task
            changed = true
          }
          if (!changed) return inst
          const out = Object.assign({}, inst, { tasks })
          if (alloc) out.counters = alloc.counters()
          return out
        })
      }
      if (t === EV.message) {
        return withInstitute(state, key, (inst) => {
          const alloc = typeof d.make === 'function' ? makeIdAllocator(inst) : null
          const made = alloc ? d.make(alloc) : d.message
          const list = (Array.isArray(made) ? made : [made]).filter(Boolean)
          if (!list.length) return inst
          const messages = inst.messages.slice()
          let changed = false
          for (const msg of list) {
            if (!msg || typeof msg.id !== 'string' || !msg.id) continue
            if (messages.some((x) => x.id === msg.id)) continue
            messages.push(msg)
            changed = true
          }
          if (!changed) return inst
          // MEDIUM 4 (deep review): office-addressed requests (a member proposal that ONLY the
          // office can approve) are never "delivered" — the office is not a member and has no
          // inbox drain — so they are capped here, newest kept, oldest dropped. Without that cap
          // `messages` would grow for the whole run.
          let self = messages
          let dropped = 0
          const officeMsgs = self.filter((m) => m.to === OFFICE_INBOX)
          if (officeMsgs.length > OFFICE_REQUEST_CAP) {
            const drop = new Set(officeMsgs.slice(0, officeMsgs.length - OFFICE_REQUEST_CAP).map((m) => m.id))
            self = self.filter((m) => !drop.has(m.id))
            dropped = drop.size
          }
          // F4 (status/report review): the truncation is COUNTED, so `status()`/`report()` can say
          // "显示最新 N / 累计丢弃 K" instead of presenting a truncated list as complete.
          const out = Object.assign({}, inst, {
            messages: self,
            officeRequestsDropped: Number(inst.officeRequestsDropped || 0) + dropped,
          })
          if (alloc) out.counters = alloc.counters()
          return out
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
          // the queue never grows without bound over a long run. `delivered` itself is
          // bounded the same way `debates`/`meetings` are: it is an acknowledgement LEDGER,
          // and every commit rewrites the whole snapshot, so an ever-growing array of every
          // message id ever acked would make each write progressively more expensive
          // (audit M7). Oldest entries are dropped first; `messages` holds only undelivered
          // ids and is filtered by the same set, so dropping an id can never re-deliver.
          const delivered = Array.from(set)
          const capped = delivered.length > DELIVERED_CAP ? delivered.slice(delivered.length - DELIVERED_CAP) : delivered
          const messages = inst.messages.filter((m) => !set.has(m.id))
          return Object.assign({}, inst, { delivered: capped, messages })
        })
      }
      if (t === EV.meeting) {
        return withInstitute(state, key, (inst) => {
          // S8（R3/K12）：**纪要结构化写回**。`make` 是**插入**路径（新会议）；`minutes` 是**同一场会议**的
          // 追加/覆盖路径（发言区／投票区）——两者互斥，且都只动 `meetings[]`（同 id 不存在则原样返回）。
          if (typeof d.make !== 'function') {
            const mid = String((d.index && d.index.id) || d.id || '')
            if (!mid || !d.minutes) return inst
            const cur = inst.meetings.filter((x) => x && x.id === mid)[0]
            if (!cur) return inst
            const patched = Object.assign({}, cur, { minutes: Object.assign({}, cur.minutes || {}, d.minutes) })
            return Object.assign({}, inst, { meetings: inst.meetings.map((x) => (x && x.id === mid ? patched : x)) })
          }
          const alloc = typeof d.make === 'function' ? makeIdAllocator(inst) : null
          const idx = alloc ? d.make(alloc) : d.index
          if (!idx || typeof idx.id !== 'string' || !idx.id) return inst
          if (inst.meetings.some((x) => x.id === idx.id)) return inst
          const meetings = inst.meetings.concat([idx])
          const out = Object.assign({}, inst, { meetings: meetings.length > 200 ? meetings.slice(meetings.length - 200) : meetings })
          if (alloc) out.counters = alloc.counters()
          return out
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
      if (t === EV.formal) {
        return withInstitute(state, key, (inst) => {
          if (!d.target || typeof d.target !== 'string') return inst
          const formal = Object.assign({}, inst.formal)
          // MEDIUM 6 (deep review): `record` and `todo` accept a FUNCTION (a mutation applied
          // inside the fold), exactly like `EV.queue`/`patch.paper`. The old shape built them from
          // reads taken OUTSIDE the fold (`formalTodo().filter(...)`) and replaced the durable
          // value wholesale, so two same-tick writers for different targets lost one entry —
          // the lost-update class the queue fix at this file's queue branch already removed.
          if (typeof d.record === 'function') {
            const target = d.target
            const next = d.record(formal[target] === undefined ? null : formal[target])
            if (next === null || next === undefined) delete formal[target]
            else formal[target] = next
          } else if (d.record === null) delete formal[d.target]
          else formal[d.target] = d.record
          const todo = d.todo === undefined
            ? (inst.todo || [])
            : (typeof d.todo === 'function'
              ? (d.todo(inst.todo || []) || inst.todo || [])
              : (Array.isArray(d.todo) ? d.todo : (inst.todo || [])))
          return Object.assign({}, inst, { formal, todo })
        })
      }
      // `d.queue` is normally the new ARRAY, but a queue MUTATION (appending a proposal,
      // taking the head to run) is passed as a FUNCTION instead. Applying it here, inside the
      // fold, makes its read and its write one atomic step of the serial event chain: the old
      // shape (read `inst().queue`, mutate the copy, `await putQueue(copy)`) lost one of two
      // proposals made in the same tick, because both callers read the same array and each
      // committed its own copy.
      if (t === EV.queue) {
        return withInstitute(state, key, (inst) => {
          const next = typeof d.queue === 'function' ? d.queue(inst.queue) : d.queue
          const list = Array.isArray(next) ? next : []
          // A mutation that changed nothing (a duplicate proposal) leaves the queue object
          // identical: return the institute unchanged rather than minting a new revision.
          if (list === inst.queue) return inst
          return Object.assign({}, inst, { queue: list })
        })
      }
      if (t === EV.solve) {
        // HIGH 3: one durable place for the "is it solved?" tally. `d.clear` resets it (a new
        // solve question), `d.member`+`d.value` records/withdraws ONE member's answer (`null`
        // withdraws, mirroring how `fire` drops a dismissed member's ballot).
        return withInstitute(state, key, (inst) => {
          if (d.clear) return Object.assign({}, inst, { solve: {} })
          const member = String(d.member || '')
          if (!member) return inst
          const cur = Object.assign({}, inst.solve || {})
          if (d.value === null || d.value === undefined) delete cur[member]
          else cur[member] = d.value === true
          return Object.assign({}, inst, { solve: cur })
        })
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
        // S3: keep every unknown top-level key here too (see `withInstitute`).
        return Object.assign({}, state, { v: state.v, institutes: state.institutes, diagnostics: diagnostics.slice(-50) })
      } catch (e2) { return state }
    }
  }

  // ---- persistence backend ----------------------------------------------
  // The hardened JSON file is the ONLY backend. It applies the same event fold in memory and writes
  // the whole snapshot under a per-file serialization chain; nothing is written to a host session log
  // (see the PERSISTENCE note at the top of this file for why the projection backend was removed).
  // `pathOf` is a FUNCTION, not a captured string: the state path depends on the
  // project/institute, which `configure` may change mid-session — a captured path would
  // keep writing to the pre-load guess forever.
  //
  // The load latch is PER PATH, and a write is only allowed for a path whose load
  // SUCCEEDED. Both are needed to make the state file safe (the 2.4.1 audit's H1):
  // a boolean "we have loaded something" latch let the first tool call of a session
  // (typically `vibe_v5_status`, against the DEFAULT institute) latch the backend to the
  // default path, after which `vibe_v5_configure {institute:'alpha'}` never read alpha's
  // file and wrote an EMPTY institute over it. Switching paths now re-reads the new path
  // first, and if that read fails the backend refuses to write instead of clobbering.
  function makeFileBackend(readTextAbs, writeTextAbs, pathOf, onWriteFailure, onLoadProblem) {
    let mem = initState()
    let chain = Promise.resolve(true)
    let loadedPath            // the path whose file is currently folded into `mem`
    let loadOk = false        // did the read of `loadedPath` actually succeed?
    let loadPromise = null    // the in-flight load (dedupes concurrent callers)
    let loadPendingPath = null
    // Fold ONE path into `mem`. `readTextAbs` returning undefined means "no file yet", which
    // is the only case that licences a later write; anything else (a throw, a parse error, a
    // version mismatch) leaves `loadOk` false so commit() refuses to clobber it.
    // S2 (deep-review 4): the REASON is recorded (`loadProblem`), because "no file" and "a file we
    // could not use" used to look identical to every reader — an operator saw an empty institute
    // with no hint that their state file exists and was rejected, and the note only appeared after
    // a WRITE was attempted.
    let loadProblem = ''
    async function doLoad(p) {
      let ok = false
      loadProblem = ''
      try {
        const raw = await readTextAbs(p)
        if (raw === undefined || raw === null || raw === '') ok = true
        else {
          let parsed = null
          try { parsed = JSON.parse(raw) } catch (e) { loadProblem = 'invalid JSON (truncated or corrupt)' }
          if (parsed) {
            if (parsed.v === PROJECTION_VERSION) { mem = parsed; ok = true }
            else loadProblem = 'schema version mismatch: file has v=' + JSON.stringify(parsed.v) + ', this build reads v=' + PROJECTION_VERSION
          }
        }
      } catch (e) { loadProblem = 'unreadable: ' + String((e && e.message) || e) }
      loadedPath = p
      loadOk = ok
      loadPromise = null
      loadPendingPath = null
      return mem
    }
    // S2: the actionable text for a file that EXISTS but could not be used (vs "no file yet").
    function loadProblemText(where) {
      if (!loadProblem) return ''
      return 'the state file ' + where + ' exists but could NOT be used (' + loadProblem + '); '
        + 'writes are refused so it is never clobbered. Fix: back it up, then either restore a v'
        + PROJECTION_VERSION + ' file or remove/rename it to start a fresh institute in that path '
        + '(the current file is left untouched).'
    }
    const backend = {
      kind: 'file',
      async load() {
        const path = pathOf()
        if (loadedPath === path && (loadOk || loadPromise === null)) return mem
        // A different path (or a previously FAILED load of this one) is read again before it
        // is ever written to. Switching paths starts from the empty initial state: `mem`
        // holds only the fold of the file that is on disk for the CURRENT path.
        if (loadedPath !== path) { mem = initState(); loadPromise = null }
        if (loadPromise && loadPendingPath === path) return await loadPromise
        loadPendingPath = path
        loadPromise = doLoad(path)
        await loadPromise
        // S2: a file that EXISTS but was rejected is reported on the READ path too (not only when
        // a write is refused), so `/v5 status` can never silently look like "nothing here yet".
        if (!loadOk && loadProblem) { try { onLoadProblem(loadProblemText(path)) } catch (e) { /* diagnostics must not break the load */ } }
        if (loadedPath === pathOf()) return mem
        // The path moved again while we were reading: hand back the state for the path
        // that is current NOW rather than one for a directory we are no longer using.
        return await backend.load()
      },
      read() { return mem },
      loadedFor() { return { path: loadedPath, ok: loadOk } },
      // Read ONE specific path (used by `configure`, which must know whether the institute
      // it is being pointed at already exists on disk) and report the state belonging to
      // `useKey`. The path latch deliberately stays on the file that was actually read.
      async loadAt(path, useKey) {
        loadedPath = path
        loadOk = false
        loadPromise = null
        loadPendingPath = null
        mem = initState()
        await doLoad(path)
        return { state: mem, institute: useKey === undefined ? undefined : mem.institutes[String(useKey)] }
      },
      async commit(type, data) {
        // NEVER write a snapshot whose file was not successfully read first: an unread file
        // is indistinguishable from "the read never ran", and whole-snapshot writes make
        // that failure mode destructive.
        const path = pathOf()
        if (loadedPath !== path) await backend.load()
        if (loadedPath !== path || !loadOk) {
          throw v5err('V5_STATE_NOT_LOADED',
            'refusing to overwrite ' + path + ' : its state file was never read successfully (a failed or unreadable load must not be clobbered)')
        }
        mem = applyV5Event(mem, { type, data })
        const snapshot = mem
        // Serialize writes per file and defer JSON.stringify to execution time, so a
        // late writer always lands the FULL newest state and can never overwrite with
        // a stale subset (v4 §27 writeJson defect).
        chain = chain.then(async () => {
          // MEDIUM 7 (deep review): the write used to be wrapped in `catch { /* best effort */ }`,
          // and `writeTextAbs` already swallows its own failures (it returns `undefined`), so a
          // failed write was INVISIBLE: the in-memory state advanced, every caller reported
          // success, and the operator believed the run was persisted. The fold cannot be rolled
          // back here, so the failure is made durable + visible instead (`onWriteFailure` feeds the
          // same `diagnostics` list that `report()` prints under `## ⚠ 状态诊断`) and also logged.
          const outcome = await writeTextAbs(pathOf(), JSON.stringify(snapshot, null, 2))
          if (outcome === undefined) {
            try { onWriteFailure(pathOf()) } catch (e) { /* diagnostics must never break the chain */ }
            try { console.error('vibe-math-v5r: state write FAILED for ' + pathOf() + ' — the in-memory state advanced but the file is STALE') } catch (e) { /* ignore */ }
          }
          return true
        })
        return mem
      },
    }
    return backend
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
      reconsiderFloor: 0,           // S9/U3：复议门槛的**下限**（缺省 0＝只保证"不降"；生效门槛 = max(本对象标准, 它, quorumCap)）
      quotesPerMessageMax: 2,       // S10/D6：每条发言**最多引用几条**（`04` §5 默认 2）；超限 ⇒ 具名拒
      quoteDepthMax: 3,             // S10/D6：引用链**深度上限**（`04` §4 默认 3）；超深 ⇒ **折叠标注**（不拒）
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
      // ── meeting speaking model（2.9.0）────────────────────────────────────
      // 会议两阶段（轮流发言 → 举手发言）；沉默**不触发任何截止**，只看"机会是否给完"与"是否还在举手/在飞"。
      // meetingHardLimitMs — 会议墙钟硬界（**唯一兜底**）：默认 1800000（30 分钟），钳制到 [300000, 7200000]
      //                      （5 分钟–2 小时）；**不提供无界**（0/∞ 无特殊语义）。旧的 recoverStallMs()（2×
      //                      activityTimeoutMs）**不再用于会议收束/放弃**。
      // meetingWakeRetries — 同一成员在同一阶段的唤醒重试次数：默认 5，钳制到 [0, 10]；耗尽后记 `unreached`
      //                      （**当作"已获得机会"**：不阻塞收束，且与"选择不发言"严格区分）。
      meetingHardLimitMs: 1800000,
      meetingWakeRetries: 5,
      // ── Lean formal verification (§ docs/formal-verification.md) ─────────
      // 'off'       — 不额外进行任何要求（默认）
      // 'encourage' — 鼓励：验证时按实现难度决定是否用 Lean 形式化；平时顺手形式化可复用对象
      // 'require'   — 强制：真/假结论必须已有「形式化已通过」或「显式阻塞原因」，否则记为未定论
      formalVerify: 'off',
      leanCommand: 'lean',
      leanArgs: [],
      leanTimeoutMs: 120000,
      // leanAsync: compile on a per-session background queue (default) instead of blocking the
      // member's turn. `false` restores the previous synchronous `await` verbatim. Only
      // `settled(ok)` (exit 0 AND the file's content hash unchanged) may mark an object
      // `passed`; every other ending stays `attempted`.
      leanAsync: true,
      // leanInitiative: how EAGER the staff are about formalizing during normal work, kept
      // separate from `formalVerify` (which only expresses the VERDICT-time requirement).
      // 'off' = no daily drive (formalize only when verification asks); 'normal' (default) =
      // today's behaviour (the reminder rides with formalVerify); 'eager' = push valuable small
      // lemmas/propositions/definitions into the library even in daily rounds.
      leanInitiative: 'normal',
      // leanSearchPaths: extra `-R` roots injected BEFORE the automatic VibeMath
      // root (deduped; an explicit -R/--root in leanArgs wins).
      leanSearchPaths: [],
      // leanJobsMaxParallel: how many background compiles may run at once (default 1 = serial).
      leanJobsMaxParallel: 1,
      // ── math_computation (docs/math-computation.md; the shared module owns the semantics) ──
      // mathComputation    — 'off' | 'auto' (default) | 'on': whether the tool is available
      // mathMode           — 'typed+shell' (default: the host shell may be used as an unarchived
      //                      fallback) | 'typed' (never mention the shell; engine='cli' refused)
      // mathEngines        — allowed engine names (cli is ON by default; drop it to disable)
      // mathTimeoutMs      — per-run budget (>=1000)
      // mathPackages       — packages/toolboxes a computation may require
      // mathInstallScope   — 'user' (default) | 'system' (per call only, never remembered)
      // NOTE: the DEFAULTS come from the shared module so all four presets are byte-comparable;
      // the arrays are COPIED (the module's defaults are frozen and must never be mutated).
      mathComputation: MATH_PARAM_DEFAULTS.mathComputation,
      mathMode: MATH_PARAM_DEFAULTS.mathMode,
      mathEngines: MATH_PARAM_DEFAULTS.mathEngines.slice(),
      mathTimeoutMs: MATH_PARAM_DEFAULTS.mathTimeoutMs,
      mathPackages: MATH_PARAM_DEFAULTS.mathPackages.slice(),
      mathInstallScope: MATH_PARAM_DEFAULTS.mathInstallScope,
      // ── final paper (docs/final-paper.md; the phase runs BEFORE the completion flags) ──
      // finalPaper        — write the final paper when the run concludes (manual /v5 paper
      //                     still works when this is false, and says so).
      // paperFormat       — 'both' | 'md' | 'tex'
      // paperLanguage     — 'zh' | 'en'
      // paperCompilePdf   — compile a PDF when a LaTeX engine is detected
      // paperEditor       — 'academician' (default: the only editor reachable unattended) |
      //                     'office' (manual /v5 paper only: the office must consult the
      //                     institute first — messages + at least one meeting)
      // paperLatexCommand — force ONE engine command instead of auto-detection ('' = auto)
      finalPaper: true,
      paperFormat: 'both',
      paperLanguage: 'zh',
      paperCompilePdf: true,
      paperEditor: 'academician',
      paperLatexCommand: '',
      // ── methodology / collaboration feedback (Shared/Feedback/) ──
      // feedback — 'on' (default: the tool works AND the short per-round hint is injected) |
      //            'off' (the hint is NOT injected and every write is refused BY NAME, never
      //            silently dropped). It is a switch, not a severity: recording is encouraged,
      //            never mandatory.
      feedback: 'on',
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
    // G1 (mailbox): ids already PREPENDED to a prompt for this member but not yet acked. The prompt can
    // legitimately be built more than once before the wake (that was the v4 §24 duplicate-read defect),
    // so the injection mark keeps "at most one inbox section per prompt" while the messages stay pending
    // until the send actually succeeds. Cleared on every concluded wake attempt.
    const inboxInjected = new Map()
    // G1: members whose mail `promptFor` is prepending IN THIS BUILD — `briefBlock` must then omit its
    // own `[新到的消息/通知]` block, or the same messages appear twice in one prompt (the duplicate-read
    // defect the prompt-v5-integrity suite pins). Only set while a block is actually being prepended.
    const inboxSuppressed = new Set()
    const seeds = new Map()           // memberId -> condensed self-summary seed
    const lastActiveAt = new Map()
    let currentMember = ''
    let finalizeLock = null
    const verifiedRecently = new Map()
    const liveAgents = new Map()      // childId -> WeakRef<Agent>
    const inflight = new Map()        // childId -> turn token (dedupes duplicate subagent/end)
    let heartbeatDisposer = null
    let meeting = null                // in-flight meeting round state
    // real1004-minutes: the id of the MOST RECENT meeting. A speech can arrive AFTER the meeting was
    // closed (the watchdog abandons a stalled meeting, and the office may finalise early); such a late
    // submission used to be dropped SILENTLY, so the minutes claimed a speaking order that never appeared
    // in the file. Keep the pointer so a late speech can still be appended as a clearly-marked note.
    let lastMeetingId = ''
    let pendingMeeting = null          // parked meeting (never preempts verification)
    let digestTimer = null
    let lastProgressAt = now()
    let persistedEpoch = ''
    const dbg = { passes: 0, schedEnter: 0, schedSkip: 0, arm: 0, begin: 0 }

    // ---- persistence ------------------------------------------------------
    let backend = null
    let stateCache = null

    // G-7 (installer ROUND2, safety): the host's `sandboxPolicy.resolve()` may fall back to a WIDER
    // root than this session's workspace (the host lib catches and resolves `{}` on its own errors).
    // v5 cannot override the host fence — it passes the policy straight to `fs.writeText` — but it
    // CAN compare the root it believes in (the session cwd, which every member-facing path is built
    // from) with the root the policy advertises, and surface a NAMED warning when they disagree.
    // Recorded once per session (a diagnostic, never a write refusal: refusing would silently stop
    // persisting legitimate work, and v5 has no way to widen or narrow the host's fence itself).
    let sandboxPolicyChecked = false
    let sandboxPolicyMismatch = null
    function sessionCwd() {
      try { if (rootAgent && rootAgent.session && rootAgent.session.header && rootAgent.session.header.cwd) return String(rootAgent.session.header.cwd) } catch (e) { /* unknown */ }
      return ''
    }
    const normRoot = (p) => String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
    function checkSandboxPolicyRoot() {
      if (sandboxPolicyChecked) return
      sandboxPolicyChecked = true
      try {
        const sp = sandboxPolicyOf()
        const policyRoot = sp && sp.workspaceRoot ? String(sp.workspaceRoot) : ''
        const expected = sessionCwd()
        if (!policyRoot || !expected) return
        if (normRoot(policyRoot) !== normRoot(expected)) {
          sandboxPolicyMismatch = {
            at: now(), expected, policyRoot,
            note: '沙箱策略声明的可写根与会话工作目录不一致：v5 用会话工作目录拼所有路径（成员提示词/状态/Formal/Verified），'
              + '若宿主按策略根解析写操作，产物可能落在预期之外的那棵树。请核对 sandbox 策略的 workspaceRoot。',
          }
          console.error('vibe-math-v5r: ⚠ 沙箱策略根与会话工作目录不一致（策略=' + policyRoot + '，会话=' + expected + '）：写盘位置可能不是你预期的那棵树')
        }
      } catch (e) { /* a diagnostic must never break path resolution */ }
    }
    function workspaceRoot() {
      const cwd = sessionCwd()
      if (cwd) { checkSandboxPolicyRoot(); return cwd }
      const sp = sandboxPolicyOf()
      if (sp && sp.workspaceRoot) { checkSandboxPolicyRoot(); return sp.workspaceRoot }
      return '.'
    }
    const vibeRoot = () => (workspaceRoot() + '/VibeMath').replace(/\\/g, '/')
    const projectRoot = () => vibeRoot() + '/Projects/' + project
    const instRoot = () => projectRoot() + '/Institutes/' + instituteName
    // DEFECT A (3rd self-test): member-facing text used INSTITUTE-relative paths
    // (`Members/<id>/…`), but a member's OWN file tools resolve a relative path against the
    // SESSION CWD — so a member following that text verbatim created `<cwd>/Members/…`, a stray
    // tree outside `VibeMath/Projects/…` (the self-test's `Members/acad/Propos/p-*.md`). Every
    // member-facing path now uses the CWD-relative form (their real baseline); the framework's own
    // writes keep going through `instRoot()`. `instRel()` is the one place that composes it.
    const instRootRel = () => 'VibeMath/Projects/' + project + '/Institutes/' + instituteName
    const instRel = (rel) => instRootRel() + '/' + String(rel == null ? '' : rel).replace(/^\/+/, '')
    // CLASS GUARD (lead's re-verification round): "documented member write paths must be paths the
    // framework scans/reads". `instRootRel()` (what the member-facing text advertises) and
    // `instRoot()` (what `writeTextRel`/`readTextRel`/`readLibrary`/`findCardRel`/`mkdirs` actually
    // use) are two COMPOSITIONS of the same layout: if a future edit changes one and not the other,
    // the text advertises a directory nothing writes to (exactly the v4 defect found in 58fff7f).
    // Comparing the two compositions — instead of trusting two hand-copied strings — is what makes
    // that class impossible to reintroduce silently.
    function memberPathContractOk() {
      const probe = 'Members/__probe__/Progress/progress.md'
      const documented = instRel(probe)
      const abs = (instRoot() + '/' + probe).replace(/\\/g, '/')
      const ws = String(workspaceRoot() || '').replace(/\\/g, '/')
      if (!ws || ws === '.') return true                 // no cwd to strip: nothing to compare
      const actual = abs.indexOf(ws) === 0 ? abs.slice(ws.length).replace(/^\/+/, '') : abs
      if (documented !== actual) {
        console.error('vibe-math-v5r: member library path contract BROKEN — the member-facing text says "'
          + documented + '" but the framework writes/reads "' + actual + '"')
        return false
      }
      return true
    }
    // LEAN CLASS GUARD (L1 of the Lean deep review, same spirit as `memberPathContractOk`): the path
    // the Lean prompts tell a member to write must be RESOLVABLE BY THE TOOL THAT CONSUMES IT.
    // `leanAbsPath` is called long after this point, so it is looked up lazily via the closure (it is
    // a function declaration inside this scope, hence hoisted) and the comparison is between the
    // COMPOSITIONS on both sides — never two hand-copied strings.
    function leanPathContractOk() {
      const probe = 'Formal/__probe__.lean'
      const expected = normalizeAbsPath(instRoot() + '/' + probe)
      // The EXACT composition the prompt prints (`formalRootRel()`), plus the two spellings a member
      // may pass to a tool. All three must name the file the framework uses.
      const printedProbe = formalRootRel().replace(/\/+$/, '') + '/__probe__.lean'
      const viaPrinted = leanAbsPath(printedProbe)
      const viaDocumented = leanAbsPath(instRel(probe))   // what the prompt advertises (cwd-relative)
      const viaShort = leanAbsPath(probe)                 // the tools' short form (institute-relative)
      if (viaPrinted !== expected || viaDocumented !== expected || viaShort !== expected) {
        console.error('vibe-math-v5r: Lean path contract BROKEN — printed "' + printedProbe
          + '" resolves to ' + String(viaPrinted) + ', documented "' + instRel(probe) + '" to '
          + String(viaDocumented) + ', short form to ' + String(viaShort) + ', but the framework uses ' + expected)
        return false
      }
      return true
    }

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
        // `fs.writeText` RESOLVES with an FsWriteOutcome ({operation, version, before, after})
        // and REJECTS on a real failure, so the old `return true` here meant only "the call did
        // not throw" and discarded the outcome (audit L4). Return the outcome itself: `undefined`
        // now means "not written", an object means "written, and here is what the fs reported".
        // A stub/mock fs that resolves with nothing is reported as an unknown-but-successful
        // write, because the real host never resolves without an outcome.
        const outcome = await fs.writeText(t, content, undefined, undefined, getPolicy())
        return (outcome === undefined || outcome === null) ? { operation: 'unknown' } : outcome
      } catch (e) { return undefined }
    }
    async function readTextRel(rel) { return await readTextAbs(instRoot() + '/' + rel) }
    async function writeTextRel(rel, content) { return (await writeTextAbs(instRoot() + '/' + rel, content)) !== undefined }

    function installBackend() {
      backend = makeFileBackend(readTextAbs, writeTextAbs, () => instRoot() + '/State/' + instituteName + '.v5state.json',
        (p) => noteWriteProblem(p),                       // MEDIUM 7: a failed write must be visible, never swallowed
        (text) => { lastLoadProblem = text; noteLoadProblem(text) })   // S2: a rejected file is visible on READS too
      return backend
    }
    // The ONE call site that awaits the backend's load (the sensitivity probe for
    // "the file fallback must LOAD persisted state before any read" keys on it, and a
    // duplicated copy of it would make that probe ambiguous).
    async function awaitBackendLoad() {
      if (backend.kind === 'file' && typeof backend.load === 'function') await backend.load()
      return true
    }
    // Every entry point that READS state must await this first. Without it the file
    // backend's `mem` is still the empty initial state, so a fresh process would report
    // an empty roster and `resume` would refuse with "no active member to resume" —
    // i.e. the fallback would silently lose the whole institute across a restart.
    // MEDIUM 8 (deep review): "a read must be preceded by an awaited load" was only a CONVENTION.
    // `state()` stays synchronous by design (the whole fold reads through it), so it can only
    // START the load — a read that lands before that load settles sees the empty/previous `mem`.
    // Enforcement is impossible without making every read async, so the rule is now explicit and
    // OBSERVABLE:
    //   • SAFE (they all `await ready()` first): every `registerTool` handler, the `/v5` command,
    //     `commit()` (it awaits `awaitBackendLoad()` before touching `mem`) and `schedulePass()`
    //     (see its `ready()` call).
    //   • UNSAFE by construction: any other synchronous consumer of the session API
    //     (`inst()`/`state()` called from inside ANOTHER plugin, or from a raw host callback that
    //     does not go through a tool wrapper). Those get a counter (`prematureReads`) surfaced by
    //     `status()`/`report()` so the gap is visible instead of silent.
    let loadSettled = false
    let prematureReads = 0
    async function ready() {
      if (!backend) installBackend()
      await awaitBackendLoad()
      loadSettled = true
      // Crash recovery for the Lean queue runs ONCE per session, after the state file is
      // folded in: a leftover Formal/Jobs/*.json is re-queued or explicitly interrupted, and
      // is NEVER silently turned into `passed` (docs/formal-verification.md §7-7).
      if (!leanRecoveryDone) {
        try { await recoverLeanJobs() } catch (e) { console.error('vibe-math-v5r: lean recovery: ' + String((e && e.message) || e)) }
      }
      // The math availability line is derived at session start (and on every tuning that
      // touches the six math_* keys); `probeMathEngines` caches per host, so this is cheap.
      try { await refreshMathLine() } catch (e) { console.error('vibe-math-v5r: math probe: ' + String((e && e.message) || e)) }
      // The member-library path contract (documented root == the root the framework writes/reads).
      // A broken contract is recorded in `diagnostics` so `report()` shows it instead of leaving a
      // silent "members write where nothing reads" state.
      try { if (!memberPathContractOk()) noteLoadProblem('member library path contract broken (documented root != framework root)') } catch (e) { /* never break ready() */ }
      try { if (!leanPathContractOk()) noteLoadProblem('Lean path contract broken (a documented Lean path is not resolvable by the tool that consumes it)') } catch (e) { /* never break ready() */ }
      return true
    }
    // Load the CURRENT state path before its first read. `state()` is synchronous by design
    // (the whole fold is read through it), so it kicks the load off eagerly; the caller that
    // matters — `commit()` — always awaits it before the snapshot may be written.
    function ensureLoaded() {
      if (!backend) installBackend()
      if (backend.kind !== 'file' || typeof backend.load !== 'function') return
      const p = backend.load()
      if (p && typeof p.then === 'function') p.catch(() => {})
    }
    function state() {
      if (!backend) installBackend()
      // A read must never be served from the empty initial state while the path's file has
      // not been folded in yet (the 2.4.1 audit's H1: a read-less `state()` was half of the
      // overwrite). `ready()`/`commit()` await the same load; here it only has to START.
      ensureLoaded()
      // MEDIUM 8: a read that lands before the first successful load is counted (and reported),
      // instead of silently answering from the empty/previous snapshot.
      if (!loadSettled) prematureReads += 1
      stateCache = backend.read()
      return stateCache
    }
    function inst() {
      const s = state()
      return s.institutes[key] || emptyInstitute(key, project, instituteName)
    }
    // The institute stored in ANOTHER (project, institute) state file, or undefined. Used by
    // `configure` before it switches identity: the requested institute may already exist on
    // disk, and adopting it is the only alternative to overwriting it (audit H1).
    async function instituteAt(np, ni, nkey) {
      if (!backend) installBackend()
      const path = (vibeRoot() + '/Projects/' + np + '/Institutes/' + ni + '/State/' + ni + '.v5state.json')
      const r = await backend.loadAt(path, nkey)
      return r.institute
    }
    // A FAILED load of an EXISTING file must never be silent: it is the one state in which
    // the backend refuses to write (audit H1). The note is buffered here and folded into the
    // state on the next commit that IS allowed, so it can never recurse into a commit.
    let pendingLoadNotes = []
    function noteLoadProblem(text) {
      const t = String(text || '').slice(0, 300)
      if (t && pendingLoadNotes.indexOf(t) === -1) pendingLoadNotes.push(t)
      if (pendingLoadNotes.length > 5) pendingLoadNotes = pendingLoadNotes.slice(-5)
    }
    // MEDIUM 7 (deep review): a FAILED state write cannot be rolled back (the fold already
    // advanced the in-memory state), so it must at least be impossible to miss. Counted for
    // `status()`/`report()` AND queued for the next allowed commit's diagnostics.
    let stateWriteFailures = 0
    // S2: the ACTIONABLE reason a state file that exists was rejected (empty while everything is
    // fine). Surfaced by `status()`/`report()` on the read path, not only after a refused write.
    let lastLoadProblem = ''
    // F1 (status/report review): a SESSION-LEVEL log of load/write problems. `drainLoadNotes` used to
    // write them into `stateCache` only — which the very next `state()` read replaced with the
    // backend's `mem` — so they could vanish between commits and, worse, they were never the array
    // `report()` printed (`report()` read the INSTITUTE-level diagnostics). Keeping a session log is
    // what lets the diagnostics section show the sources its heading advertises.
    let loadProblemLog = []
    function noteWriteProblem(p) {
      stateWriteFailures += 1
      noteLoadProblem('state write FAILED (the file is STALE): ' + String(p || '?'))
    }
    function drainLoadNotes() {
      if (!pendingLoadNotes.length) return
      loadProblemLog = loadProblemLog.concat(pendingLoadNotes.map((t) => ({ at: now(), type: 'vibe5/load', error: t })))
      if (loadProblemLog.length > 10) loadProblemLog = loadProblemLog.slice(-10)
      if (!stateCache) { pendingLoadNotes = []; return }
      const list = (stateCache.diagnostics || []).concat(pendingLoadNotes.map((t) => ({ at: now(), type: 'vibe5/load', error: t })))
      pendingLoadNotes = []
      stateCache = Object.assign({}, stateCache, { diagnostics: list.slice(-50) })
    }
    async function commit(type, data) {
      if (!backend) installBackend()
      // Explicit call (the audit's H3): `await backend.load` awaited the METHOD OBJECT, so
      // the only load was the one the backend happened to do inside commit.
      await awaitBackendLoad()
      const loaded = backend.kind === 'file' && typeof backend.loadedFor === 'function' ? backend.loadedFor() : { ok: true }
      try {
        stateCache = await backend.commit(type, Object.assign({ version: PROJECTION_VERSION, key }, data))
      } catch (e) {
        // The write was refused because the state file could not be read. Say so loudly
        // instead of clobbering it, and keep the note for the next write that is allowed.
        noteLoadProblem('write REFUSED (a failed state-file load must not be clobbered): ' + String((e && e.message) || e))
        throw e
      }
      if (!loaded.ok) noteLoadProblem('the state file ' + String(loaded.path || '?') + ' could not be read (corrupt, unreadable or version-mismatched); it will never be overwritten')
      drainLoadNotes()
      const cur = stateCache.institutes[key]
      if (cur) {
        phase = cur.phase || phase
        // S1 (deep-review 4 / repro: `_oneoff/s1-solved-reload.mjs`): the CONCLUDED marker is
        // durable state, not a session memory. `autoDone` used to live only in memory, so a fresh
        // session over a `phase:'solved'` file had `autoDone=false` and `/v5 start` re-founded the
        // concluded institute (new runId, new members on top of the old roster). Mirroring the
        // persisted phase makes every existing `autoDone` guard correct again on reload.
        autoDone = String(phase) === 'solved'
        // Restored params must go through the SAME normalisation as `vibe_v5_set`: a hand-edited
        // or foreign-shaped state file (e.g. mathEngines as a comma STRING, a bogus enum, a
        // sub-1000 timeout) would otherwise reach `visibleParams()` and v5's own
        // `String(params.mathComputation/mathMode)` reads verbatim — the tool path is protected
        // by the module's `effectiveMathParams`, the operator surface was not.
        const droppedLoad = []
        params = Object.assign({}, DEFAULT_PARAMS, normalizeParams(cur.params || {}, droppedLoad))
        reportDroppedStateKeys(cur, droppedLoad, 'restore-load')
        project = cur.project || project
        instituteName = cur.institute || instituteName
      }
      return cur
    }
    // Convenience commit wrappers.
    const patchInstitute = (patch) => commit(EV.institute, { patch })
    const putMember = (member) => commit(EV.member, { member })
    const putTask = (task) => commit(EV.task, { task })
    // HIGH 1: creation goes through an in-fold allocator — the callback runs INSIDE the fold, so
    // the id it hands out and the object it returns are committed in one step (makeIdAllocator).
    // The old whole-object creation setters (`putMessage`/`putMeeting`/`putCounters`) are GONE on
    // purpose: reusing one would mint an id from a read taken outside the fold and reintroduce the
    // silent-loss race this fix removes. Updates use `putMember`/`putTask` (already-identified
    // objects) and, for messages, the same allocator.
    const putMessageMake = (make) => commit(EV.message, { make })
    // HIGH 3: the "is it solved?" tally is durable state, not an in-memory Map.
    const putSolve = (patch) => commit(EV.solve, patch || {})
    const ackDelivered = (ids) => commit(EV.delivered, { ids })
    const putDebate = (index) => commit(EV.debate, { index })
    // S9（D5）：**任何收束记录都必须盖少数意见章** —— 盖章点收敛到这一处（`sealRecord` 幂等），
    // 所以四条收束路径 ＋ "所办停止"都自动覆盖，**不会漏**。
    const putVerdict = (target, record) => commit(EV.verdict, { target, record: sealRecord(record) })
    // The verify queue has NO whole-array setter any more: both of its mutations go through
    // `appendToQueue`/`takeQueueHead` below, which hand a FUNCTION to the event fold so the
    // read-modify-write is atomic (the lost-proposal race). Counters are bumped by the object
    // folds themselves (`makeIdAllocator`), so there is no `counters` setter either.
    const markProgress = async () => {
      lastProgressAt = now()
      await commit(EV.progress, { at: lastProgressAt, artifactCount: inst().artifactCount })
    }

    // ── S5（R1/D10）：框架角色＝**只推荐、不驱动** ────────────────────────────────────────────
    // 静止时框架**最多提示一次**并列出「谁在等谁」；**不召集会议、不散会、不收束、不推进阶段、
    // 不代成员表态**。提示＝"事实陈述 ＋ 一句可拒绝的建议"，**不是**程序动作（chair-first 仍归 R4/H2；
    // 票与表态仍归 R2/R3/D3/D8；具名可撤销触界仍归 R10/S3，且静止提示**不是**触界）。
    // 阈值：`stallAutoMeetingMs` 的**语义＝静止提示阈值**（键名保留，避免破坏用户配置与文档计数）；
    // **负值＝关闭**（不能用 0：`posMs(0)` 会落回默认值）。
    function stallNoticeMs() {
      const n = Number(params.stallAutoMeetingMs)
      if (Number.isFinite(n) && n < 0) return 0
      return posMs(params.stallAutoMeetingMs, 360000)
    }
    const stallNoticeView = () => inst().stallNotice || null
    /** 「谁在等谁」＝**三类可达来源**、最多 3 条；**只陈述事实**（不施压、不折算成票、不自动关闭；07 §9-2／X5）。
     *  注意（S5 实测教训）：提示只在"无人在飞、无验证在飞"时发（这正是不可抢占回合的守卫）⇒ 因此
     *  **不能**把"在飞交付/未表态表决"当成提示的来源——那两类在这个分支里**结构上不可达**（空变异）。
     *  真正可达的三类＝① 被挡任务 ② 无人认领任务 ③ 最久没有动作的在册成员（"下一步等它推进"）。 */
    function stallWaitingList() {
      const out = []
      const openTasks = inst().tasks.filter((t) => t && t.status !== 'done' && t.status !== 'deleted')
      const blocked = openTasks.filter((t) => Array.isArray(t.blockedBy) && t.blockedBy.length)
      if (blocked.length) out.push('任务 ' + blocked[0].id + ' 等 ' + blocked[0].blockedBy.join('、') + ' 完成')
      const unclaimed = openTasks.filter((t) => !t.ownerId && !(Array.isArray(t.blockedBy) && t.blockedBy.length))
      if (unclaimed.length) out.push('任务 ' + unclaimed[0].id + ' 等有人认领')
      const active = activeMembers().filter((m) => m.kind !== 'temp')
      if (active.length) {
        const sorted = active.slice().sort((a, b) => (lastActiveAt.get(a.id) || 0) - (lastActiveAt.get(b.id) || 0))
        const pick = sorted[0]
        if (pick) {
          const since = Number(lastActiveAt.get(pick.id) || lastProgressAt) || now()
          const idleS = Math.max(0, Math.round((now() - since) / 1000))
          out.push('下一步等 ' + pick.id + ' 推进' + (pick.direction ? '（方向：' + pick.direction + '）' : '') + '（已闲置 ' + idleS + ' 秒）')
        }
      }
      if (!out.length) out.push('暂无阻塞项：等院士分派任务或发起验证')
      return out.slice(0, 3)
    }
    /** 每个静止片段**最多一次**：幂等键＝`sinceAt`（本片段起点 `lastProgressAt`）。耐久 ⇒ 重启不重发。 */
    async function emitStallNotice() {
      const sinceAt = Number(lastProgressAt) || 0
      const prev = inst().stallNotice
      if (prev && Number(prev.sinceAt) === sinceAt) return false
      const waiting = stallWaitingList()
      const at = now()
      await patchInstitute({ stallNotice: { at, sinceAt, waiting } })
      await saveChatLine('【研究所提示｜静止】已有一段时间没有新进展（框架**只提示、不驱动**）。'
        + (waiting.length ? ('谁在等谁：' + waiting.join('；') + '。') : '')
        + '框架不自动开会、不自动收束，也不替任何人表态；是否推进、由谁推进，由院士与成员决定。')
      return true
    }

    // ── S6（D1/D2/D6/D8）：临时授权＝**只改"默认权限表"这一层** ──────────────────────────────
    // 定稿口径（SPEC P6／B-protocol L236／04-flows L249）：默认范围＝**本次会议收束即失效**；
    // 另可 `verify`（本次验证结束即失效）与 `once`（用一次即失效）；**失效是自动的**（事件到即不再
    // 生效），回收＝① 事件到期 ② 显式 `vibe_v5_revoke`（**必须写事件并广播**）。
    // **不可授**（判据＝"凡由**裁定级身份保证**把守的命令不可授"）：`end_verify`（R10-2a 仅院士）、
    // 主持/代行（S4 唯一入口）、票权与代表态（R2/R3/D3/D8）、私密与引用面（D6）、授权本身（GAPS 22 不可转授）。
    const GRANTABLE_COMMANDS = ['assign', 'prioritize', 'nudge', 'convene']
    const GRANT_SCOPES = ['meeting', 'verify', 'once']
    const grantsList = () => (Array.isArray(inst().grants) ? inst().grants : [])
    const grantsView = () => grantsList().map((g) => ({
      id: String(g.id || ''), by: String(g.by || ''), to: String(g.to || ''), command: String(g.command || ''),
      grantScope: String(g.grantScope || ''), at: Number(g.at || 0), expiresOn: String(g.expiresOn || ''),
      usedAt: Number(g.usedAt || 0), revokedAt: Number(g.revokedAt || 0), revokedBy: String(g.revokedBy || ''),
      expiredAt: Number(g.expiredAt || 0), why: String(g.why || ''), active: grantActive(g),
    }))
    /** 生效判定＝**事件派生**（不靠定时器）：已撤回/已记账失效/一次性已用/会议或验证已不是"当时那个" ⇒ 不生效。 */
    function grantActive(g) {
      if (!g || !g.id) return false
      if (Number(g.revokedAt || 0) > 0) return false
      if (Number(g.expiredAt || 0) > 0) return false
      if (g.grantScope === 'once') return Number(g.usedAt || 0) === 0
      if (g.grantScope === 'meeting') return !!meeting && String(g.meetingId || '') === String(meeting.id)
      if (g.grantScope === 'verify') { const cv = currentVerify(); return !!cv && String(g.verifyTarget || '') === String(cv.target) }
      return false
    }
    function grantEffective(callerId, command) {
      for (const g of grantsList()) {
        if (!g || String(g.to || '') !== String(callerId) || String(g.command || '') !== String(command)) continue
        if (grantActive(g)) return g
      }
      return null
    }
    /** 默认权限表＝**唯一**一处静态角色判断（office 全权；院士按既有 `academicianLeads` 口径；
     *  `end_verify` 是**裁定级**：仅院士，永不因授权而开）。 */
    function defaultAllowed(callerId, command) {
      if (isOffice(callerId)) return true
      const acad = isAcademician(callerId)
      if (command === 'end_verify') return acad
      if (command === 'board') return acad   // 板上组织动作（既有 `lead` 口径：不受 `academicianLeads` 影响）
      // S7（D3/D4/R9/K13）：开/关投票板（#24/#25，权限＝院士）—— 与 `board` 同属**默认表**，
      // **不在** `GRANTABLE_COMMANDS` ⇒ 永不可授（S6 的可授集合保持四命令不变）。
      if (command === 'poll_open' || command === 'poll_close') return acad
      // S12（D7/GAPS 22）：**设定会议等级**（正式／简流程）＝默认表（**仅院士**；**不在**可授集合 ⇒ 永不可授）。
      if (command === 'meeting_level') return acad
      // S11（GAPS 29）：**指定/撤销记录人**＝默认表（**仅院士**；**不在**可授集合 ⇒ 永不可授）。
      if (command === 'secretary') return acad
      // S11：**纪要条目/生成**＝院士 ∪ **当次会议的记录人**（记录权与表决权**分离**；不因授权而开）。
      if (command === 'minutes') return acad || (!!meeting && String(meeting.secretary || '') === String(callerId))
      if (command === 'assign' || command === 'prioritize' || command === 'nudge' || command === 'convene') return !!(acad && params.academicianLeads)
      return false
    }
    /** **单一谓词**：`canDo = 默认表 ∩ 阶段允许 ∩ 生效授权 − 撤回`（阶段允许由各自权限点的前置守卫承担）。 */
    function canDo(callerId, command) {
      if (defaultAllowed(callerId, command)) return { ok: true, via: 'default', grant: null }
      const g = grantEffective(callerId, command)
      if (g) return { ok: true, via: 'grant', grant: g }
      return { ok: false, via: 'default', grant: null }
    }
    /** `once` 授权在**获批的那一刻**消费（用一次即失效）。 */
    async function consumeGrant(g) {
      if (!g || g.grantScope !== 'once' || Number(g.usedAt || 0) > 0) return
      await patchInstitute({ grants: (list) => (Array.isArray(list) ? list : []).map((x) => (x && x.id === g.id ? Object.assign({}, x, { usedAt: now() }) : x)) })
    }
    /** 权限点统一入口：返回 `null`＝放行（并消费一次性授权），否则返回**具名拒绝**对象。 */
    async function gateDo(callerId, command, message) {
      const perm = canDo(callerId, command)
      if (!perm.ok) return { ok: false, code: 'V5_NOT_ACADEMICIAN', message }
      await consumeGrant(perm.grant)
      return null
    }
    /** #47 `vibe_v5_grant`：**仅院士**；`to` 必须是在册成员（**D8**：非成员 ⇒ 具名拒绝，且校验先于写台账）；
     *  `command` 有界枚举；`grantScope` 只有事件型三档；**不收任何 `…At`/`…Ms`（有意偏离 SPEC #13 的字面参数表）**。 */
    async function grantTool(memberId, a) {
      const args = a || {}
      const me = memberById(memberId)
      if (!me) return memberDiagnosis('临时授权（vibe_v5_grant）', memberId)
      if (me.kind !== 'academician') {
        return { ok: false, code: 'V5_NOT_ACADEMICIAN', message: '只有院士可以临时授权（D1）；所办按其默认权限行事，无需授权' }
      }
      const stampKeys = Object.keys(args).filter((k) => /(At|Ms)$/i.test(String(k)))
      if (stampKeys.length) {
        return { ok: false, code: 'V5_INVALID_ARGUMENT', message: '时间由框架设置（S6）：不接受 ' + stampKeys.join('、') + '；失效条件一律用事件表达（grant_scope=meeting／verify／once）' }
      }
      if (args.expires_on !== undefined || args.expiresOn !== undefined) {
        return { ok: false, code: 'V5_INVALID_ARGUMENT', message: '失效条件用 grant_scope 表达（meeting／verify／once），不接受 expires_on（S6）' }
      }
      const command = String(args.command || '').trim()
      if (GRANTABLE_COMMANDS.indexOf(command) === -1) {
        return { ok: false, code: 'V5_INVALID_ARGUMENT', message: '可授命令有界枚举：' + GRANTABLE_COMMANDS.join('／') + '。判据：**凡由裁定级身份保证把守的命令不可授** —— `end_verify`（R10-2a 仅院士）／主持与代行（D1，S4 的 `vibe_v5_chair_proxy` 是唯一入口）／票权与代表态（R2/R3/D3/D8）／私密与引用面（D6）／授权本身（GAPS 22 不可转授）' }
      }
      const grantScope = String(args.grant_scope || args.grantScope || '').trim()
      if (GRANT_SCOPES.indexOf(grantScope) === -1) {
        return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'grant_scope 只接受 ' + GRANT_SCOPES.join('／') + '（事件型；时间由框架设置，不接受任何 …At/…Ms）' }
      }
      const why = String(args.why || '').trim()
      if (!why) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'why is required：临时授权必须写明理由（01 §4.4）' }
      const toId = String(args.to || '').trim()
      const target = memberById(toId)
      if (!target) return { ok: false, code: 'V5_MEMBER_NOT_FOUND', message: 'member "' + toId + '" not found' }
      if (!(target.kind === 'academician' || target.kind === 'researcher')) {
        return { ok: false, code: 'V5_NOT_VOTER', message: '列席／受邀／临时工不可被授权（D8：非成员一律无表决权，也不得代行程序权）' }
      }
      if (target.phase !== 'active') return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'member "' + toId + '" is not active' }
      let meetingId = ''
      let verifyTarget = ''
      if (grantScope === 'meeting') {
        if (!meeting) return { ok: false, code: 'V5_NO_OPEN_MEETING', message: 'grant_scope=meeting 需要一场进行中的会议（收束即自动失效）' }
        meetingId = String(meeting.id)
      } else if (grantScope === 'verify') {
        const cv = currentVerify()
        if (!cv) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'grant_scope=verify 需要一个进行中的验证（结束即自动失效）' }
        verifyTarget = String(cv.target)
      }
      const dup = grantsList().filter((g) => g && String(g.to || '') === toId && String(g.command || '') === command
        && String(g.grantScope || '') === grantScope && String(g.meetingId || '') === meetingId
        && String(g.verifyTarget || '') === verifyTarget && grantActive(g))[0]
      if (dup) return { ok: true, deduped: true, grant: dup, message: '同值授权仍在生效（幂等）：未重复入账' }
      const at = now()
      const got = { entry: null }
      await patchInstitute({ grants: (list) => {
        const arr = Array.isArray(list) ? list : []
        const n = arr.filter((g) => g && /^g-\d+$/.test(String(g.id || '')))
          .reduce((mx, g) => Math.max(mx, Number(String(g.id).slice(2)) || 0), 0) + 1
        const entry = {
          id: 'g-' + n, by: me.id, to: toId, command, grantScope, at, why,
          expiresOn: grantScope === 'once' ? 'once' : (grantScope === 'meeting' ? 'meeting:' + meetingId : 'verify:' + verifyTarget),
          meetingId, verifyTarget, usedAt: 0, revokedAt: 0, revokedBy: '', expiredAt: 0,
        }
        got.entry = entry
        return arr.concat([entry])
      } })
      await saveChatLine('【临时授权】' + me.id + ' 授予 ' + toId + ' 执行 `' + command + '`（范围 ' + grantScope + '＝'
        + (grantScope === 'once' ? '用一次即失效'
          : grantScope === 'meeting' ? '本次会议收束即失效（' + meetingId + '）' : '本次验证结束即失效（' + verifyTarget + '）')
        + '；理由：' + why + '）。**不产生新票权**；授权只改"默认权限表"这一层，不改阶段/票面。')
      return { ok: true, grant: got.entry }
    }
    /** #48 `vibe_v5_revoke`：**仅院士**；`grant_id`（或 `to`+`command`）；**写事件并广播**（SPEC P6）；重复撤回幂等。 */
    async function revokeTool(memberId, a) {
      const args = a || {}
      const me = memberById(memberId)
      if (!me) return memberDiagnosis('撤回授权（vibe_v5_revoke）', memberId)
      if (me.kind !== 'academician') return { ok: false, code: 'V5_NOT_ACADEMICIAN', message: '只有院士可以撤回授权（D1）' }
      const why = String(args.why || '').trim()
      if (!why) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'why is required：撤回授权必须写明理由（01 §4.4）' }
      const gid = String(args.grant_id || args.grantId || '').trim()
      const toId = String(args.to || '').trim()
      const command = String(args.command || '').trim()
      const list = grantsList()
      const hit = gid
        ? list.filter((g) => g && String(g.id || '') === gid)[0]
        : list.filter((g) => g && String(g.to || '') === toId && String(g.command || '') === command && grantActive(g))[0]
      if (!hit) {
        return { ok: false, code: 'V5_INVALID_ARGUMENT', message: gid ? ('grant "' + gid + '" not found') : '没有匹配的生效授权（给 grant_id，或 to + command）' }
      }
      if (Number(hit.revokedAt || 0) > 0) return { ok: true, deduped: true, revoked: hit, message: '该授权已撤回（幂等）' }
      const at = now()
      await patchInstitute({ grants: (l) => (Array.isArray(l) ? l : []).map((g) => (g && g.id === hit.id ? Object.assign({}, g, { revokedAt: at, revokedBy: me.id, revokeWhy: why }) : g)) })
      await saveChatLine('【临时授权·撤回】' + me.id + ' 撤回 ' + hit.to + ' 的 `' + hit.command + '` 授权（' + hit.id
        + '；理由：' + why + '）。**写事件并广播**：该权限立即回到默认表口径。')
      return { ok: true, revoked: Object.assign({}, hit, { revokedAt: at, revokedBy: me.id, revokeWhy: why }) }
    }

    // ── S7（D3/D4/R9/K13）：投票板「支持性确认」六项 ────────────────────────────────────────────
    // 定稿 §7.1：院士**自行设定**六项（① 选项内容 ② 单选/多选 ③ 最多选几票 ④ 至少选几票
    // ⑤ **最少收集几票**＝本次投票是否成立的门槛 ⑥ 记名/不记名＋是否允许弃权＋是否允许改票），
    // 且**投票开始前对外可见**。**分层语义**：法定人数（结题门）与「最少收集票」是**两个不同的
    // 门槛，不得混用**；不满足「最少收集票」⇒ **该次投票不形成结论**，**不得**据剩余票推断。
    // 弃权/改票**复用** `castVerdict` 的同款语义（D3：弃权计入已投、**不计选项**；截止前可改）。
    // **没有任何"到点自动结算"**（D10/R10/S5）：截止只能是院士的**显式**动作。
    const POLL_MODES = ['single', 'multi']
    const ballotsList = () => (Array.isArray(inst().ballots) ? inst().ballots : [])
    const openBallot = () => ballotsList().filter((b) => b && b.phase === 'open')[0] || null
    const ballotById = (id) => ballotsList().filter((b) => b && String(b.id) === String(id))[0] || null
    const ballotCast = (b) => (Array.isArray(b && b.votes) ? b.votes.length : 0)
    const ballotVotedIds = (b) => (Array.isArray(b && b.votes) ? b.votes.map((v) => v.by) : [])
    const ballotPending = (b) => voters().map((m) => m.id).filter((id) => ballotVotedIds(b).indexOf(id) === -1)
    // **生效判据只读 `minVotes` 与已投数**：法定人数 m 属**另一个**门槛（结题门），不得折进来（K13）。
    const ballotSettled = (b) => !!b && ballotCast(b) >= Number(((b || {}).rules || {}).minVotes || 0)
    const ballotQuorumReached = (b) => !!b && ballotPending(b).length === 0
    function ballotRulesView(b) {
      const r = (b && b.rules) || {}
      return {
        mode: String(r.mode || 'single'), max: Number(r.max || 1), min: Number(r.min || 1),
        minVotes: Number(r.minVotes || 0), secret: !!r.secret,
        allowAbstain: !!r.allowAbstain, allowRevote: !!r.allowRevote,
      }
    }
    const ballotOptionsView = (b) => (Array.isArray(b && b.options) ? b.options.map((o) => ({ id: String(o.id || ''), text: String(o.text || '') })) : [])
    /** 公开视图：**secret 板只给聚合**（逐人选择仅供计票，永不进公开面）；记名板才带 `ballot[]`。 */
    function ballotView(b) {
      if (!b) return null
      const opts = ballotOptionsView(b)
      const tally = {}
      for (const o of opts) tally[o.id] = 0
      let abstained = 0
      let valid = 0
      for (const v of (b.votes || [])) {
        if (v && v.abstain) { abstained++; continue }
        valid++
        for (const c of ((v && v.choices) || [])) if (tally[c] !== undefined) tally[c] = tally[c] + 1
      }
      const named = !(b.rules && b.rules.secret)
      const rec = b.result || null
      const cast = ballotCast(b)
      const minV = Number(((b.rules || {}).minVotes) || 0)
      return {
        id: String(b.id || ''), by: String(b.by || ''), question: String(b.question || ''), options: opts,
        rules: ballotRulesView(b), at: Number(b.at || 0), meetingId: String(b.meetingId || ''),
        phase: String(b.phase || 'open'), closedAt: Number(b.closedAt || 0), closedBy: String(b.closedBy || ''),
        cast, valid, abstained, tally,
        minVotes: minV, min_votes_reached: b.phase === 'open' ? ballotSettled(b) : !!(rec && rec.satisfied),
        m: quorumM(), quorum_reached: b.phase === 'open' ? ballotQuorumReached(b) : !!(rec && rec.quorum_reached),
        pending: b.phase === 'open' ? ballotPending(b) : ((rec && rec.pending) || []),
        settled: b.phase === 'open' ? ballotSettled(b) : !!(rec && rec.settled),
        outcome: b.phase === 'open' ? (ballotSettled(b) ? 'recorded' : 'unsettled') : String((rec && rec.outcome) || ''),
        // 截止后**原样带回**结果对象（两个门槛并列：`satisfied`/`settled`（min_votes）与 `m`/`quorum_reached`）。
        result: rec ? Object.assign({}, rec, { pending: ((rec && rec.pending) || []).slice() }) : undefined,
        secret: !named,
        ballot: named ? (b.votes || []).map((v) => ({
          by: String(v.by || ''), choices: ((v && v.choices) || []).slice(), abstain: !!(v && v.abstain),
          at: Number((v && v.at) || 0), revotedAt: Number((v && v.revotedAt) || 0),
        })) : undefined,
      }
    }
    /** 时间纪律（S4/S5/S6 同源）：**大小写不敏感** `/(At|Ms)$/i`（`expires_at` 这类全小写也要拒）。 */
    function rejectStampKeys(args, what) {
      const keys = Object.keys(args || {}).filter((k) => /(At|Ms)$/i.test(String(k)))
      if (!keys.length) return null
      return { ok: false, code: 'V5_INVALID_ARGUMENT', message: '时间由框架设置（S7）：' + what + '不接受 ' + keys.join('、') + '；开票与截止只由院士**显式**动作触发，**没有**任何"到点自动结算"' }
    }
    async function pollOpenTool(memberId, a) {
      const args = a || {}
      const me = memberById(memberId)
      if (!me) return memberDiagnosis('创办投票板（vibe_v5_poll_open）', memberId)
      const perm = canDo(memberId, 'poll_open')
      if (!perm.ok) return { ok: false, code: 'V5_NOT_ACADEMICIAN', message: '只有院士（或所办）可以创办投票板（#24）；开板**不可授**（S6 的可授集合不含它）' }
      const stamp = rejectStampKeys(args, '创办投票板')
      if (stamp) return stamp
      if (!meeting) return { ok: false, code: 'V5_NO_OPEN_MEETING', message: '投票板必须挂在一场进行中的会议下（SPEC #24：创办投票板 ⇒ voting）' }
      const question = String(args.question || '').trim()
      if (!question) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'question 必填（这次投票要问什么）' }
      const rawOptions = Array.isArray(args.options) ? args.options.map((x) => String(x === undefined || x === null ? '' : x).trim()) : []
      if (rawOptions.length < 2 || rawOptions.some((x) => !x)) {
        return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'options 必填且至少 2 项、每项非空（选项内容由院士定）' }
      }
      const seen = {}
      for (const t of rawOptions) {
        if (seen[t]) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'options 不得重复（"' + t + '"）' }
        seen[t] = true
      }
      const mode = String(args.mode || 'single').trim()
      if (POLL_MODES.indexOf(mode) === -1) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'mode 只接受 single／multi' }
      const minVotesRaw = args.min_votes !== undefined ? args.min_votes : args.minVotes
      const minVotes = Number(minVotesRaw)
      if (minVotesRaw === undefined || !Number.isFinite(minVotes) || Math.floor(minVotes) !== minVotes || minVotes < 1) {
        return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'min_votes 必填（正整数）＝**本次投票是否成立**的门槛（定稿 §7.1 第 5 项）；它**不是**法定人数，且**没有默认值**（默认成 m 就等于把两个门槛混用，K13 禁止）' }
      }
      if (minVotes > voterCount()) {
        return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'min_votes（' + minVotes + '）超过有表决权者人数（' + voterCount() + '）⇒ 该板永远无法成立' }
      }
      let max = Number(args.max !== undefined ? args.max : (mode === 'single' ? 1 : rawOptions.length))
      let min = Number(args.min !== undefined ? args.min : 1)
      if (mode === 'single') {
        if (args.max !== undefined || args.min !== undefined) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'single（单选）不接受 max／min（固定每人 1 票）' }
        max = 1
        min = 1
      }
      if (!Number.isFinite(min) || !Number.isFinite(max) || Math.floor(min) !== min || Math.floor(max) !== max
        || min < 1 || max < min || max > rawOptions.length) {
        return { ok: false, code: 'V5_INVALID_ARGUMENT', message: '多选须满足 1 ≤ min ≤ max ≤ 选项数（got min=' + min + '／max=' + max + '／选项 ' + rawOptions.length + '）' }
      }
      const secret = args.secret === true
      const allowAbstain = args.allow_abstain !== false && args.allowAbstain !== false
      const allowRevote = args.allow_revote !== false && args.allowRevote !== false
      const open = openBallot()
      if (open) {
        const same = open.question === question
          && JSON.stringify(ballotOptionsView(open).map((o) => o.text)) === JSON.stringify(rawOptions)
          && JSON.stringify(ballotRulesView(open)) === JSON.stringify({ mode, max, min, minVotes, secret, allowAbstain, allowRevote })
        if (same) return { ok: true, deduped: true, ballot: ballotView(open), message: '同值投票板仍在进行中（幂等）：未重复建板' }
        return { ok: false, code: 'V5_INVALID_ARGUMENT', message: '已有一张进行中的投票板（' + open.id + '）：同一时刻只允许一张 open 板' }
      }
      const at = now()
      const got = { entry: null }
      await patchInstitute({ ballots: (list) => {
        const arr = Array.isArray(list) ? list : []
        const n = arr.filter((b) => b && /^b-\d+$/.test(String(b.id || '')))
          .reduce((mx, b) => Math.max(mx, Number(String(b.id).slice(2)) || 0), 0) + 1
        const entry = {
          id: 'b-' + n, by: me.id, question,
          options: rawOptions.map((t, i) => ({ id: 'o-' + (i + 1), text: t })),
          rules: { mode, max, min, minVotes, secret, allowAbstain, allowRevote },
          at, meetingId: String(meeting.id), phase: 'open', votes: [], closedAt: 0, closedBy: '', result: null,
        }
        got.entry = entry
        return arr.concat([entry])
      } })
      await saveChatLine('【投票板·开票】' + me.id + ' 创办 `' + got.entry.id + '`：' + question
        + '｜选项：' + rawOptions.map((t, i) => 'o-' + (i + 1) + '＝' + t).join('；')
        + '｜规则：' + (mode === 'single' ? '单选' : '多选（至少 ' + min + '、至多 ' + max + '）')
        + '｜**最少收集票 ' + minVotes + '**（本次投票是否成立）｜法定人数 m＝' + quorumM() + '（**另一个**门槛：结题门）'
        + '｜' + (secret ? '**不记名**（该事实留档；逐人选择仅供计票）' : '记名')
        + '｜弃权 ' + (allowAbstain ? '允许' : '不允许') + '｜改票 ' + (allowRevote ? '允许（截止前）' : '不允许')
        + '。规则**开票前可见**；**没有**任何"到点自动结算"。')
      return { ok: true, ballot: ballotView(got.entry) }
    }
    async function pollVoteTool(memberId, a) {
      const args = a || {}
      const me = memberById(memberId)
      if (!me) return memberDiagnosis('投票板投票（vibe_v5_poll_vote）', memberId)
      const stamp = rejectStampKeys(args, '投票')
      if (stamp) return stamp
      if (!voters().some((m) => m.id === memberId)) {
        if (me.kind === 'temp') {
          await say(memberId, { to: 'voters', kind: 'voters', text: '（临时工 ' + memberId + ' 的参考意见，无表决权）对投票板：' + String(args.note || args.reason || '') })
        }
        return { ok: false, code: 'V5_NOT_VOTER', message: '列席／受邀／临时工没有表决权（D8）；**授权也不能**把票权授出去（H12/R36）；你的意见已转达给表决者' }
      }
      const wantId = String(args.ballot_id || args.ballotId || '').trim()
      const b = wantId ? ballotById(wantId) : openBallot()
      if (!b) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: wantId ? ('投票板 "' + wantId + '" not found') : '当前没有进行中的投票板' }
      if (b.phase !== 'open') return { ok: false, code: 'V5_INVALID_ARGUMENT', message: '投票板 ' + b.id + ' 已截止：截止后只能走**复议**（S9），不得再投/改票' }
      const rules = ballotRulesView(b)
      const opts = ballotOptionsView(b)
      const prev = (b.votes || []).filter((v) => v && v.by === memberId)[0] || null
      if (prev && !rules.allowRevote) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: '本板**不允许改票**（allow_revote=false）：你的票已记录' }
      const abstain = args.abstain === true
      let choices = []
      if (abstain) {
        if (!rules.allowAbstain) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: '本板**不允许弃权**（allow_abstain=false）' }
      } else {
        const picked = []
        for (const c of (Array.isArray(args.choices) ? args.choices : [])) {
          const key = String(c === undefined || c === null ? '' : c).trim()
          const hit = opts.filter((o) => o.id === key || o.text === key)[0]
          if (!hit) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: '无效选项 "' + key + '"（可用：' + opts.map((o) => o.id + '＝' + o.text).join('；') + '）' }
          if (picked.indexOf(hit.id) !== -1) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: '重复选项 "' + hit.id + '"' }
          picked.push(hit.id)
        }
        if (picked.length < rules.min || picked.length > rules.max) {
          return { ok: false, code: 'V5_INVALID_ARGUMENT', message: '选择数越界：本板要求 ' + (rules.min === rules.max ? ('恰好 ' + rules.min) : (rules.min + '～' + rules.max)) + ' 项（got ' + picked.length + '）' }
        }
        choices = picked
      }
      const sameAsPrev = !!prev && !!prev.abstain === abstain
        && JSON.stringify(((prev.choices || []).slice()).sort()) === JSON.stringify(choices.slice().sort())
      if (sameAsPrev) {
        return { ok: true, deduped: true, vote: { by: memberId, choices: (prev.choices || []).slice(), abstain: !!prev.abstain, at: Number(prev.at || 0), revotedAt: Number(prev.revotedAt || 0) }, cast: ballotCast(b), minVotes: rules.minVotes, m: quorumM() }
      }
      const at = now()
      const got = { vote: null }
      await patchInstitute({ ballots: (list) => (Array.isArray(list) ? list : []).map((x) => {
        if (!x || x.id !== b.id) return x
        const others = (x.votes || []).filter((v) => v && v.by !== memberId)
        const entry = prev
          ? Object.assign({}, prev, { choices, abstain, note: String(args.note || args.reason || ''), revotedAt: at })
          : { by: memberId, choices, abstain, note: String(args.note || args.reason || ''), at, revotedAt: 0 }
        got.vote = entry
        return Object.assign({}, x, { votes: others.concat([entry]) })
      }) })
      const after = ballotById(b.id) || b
      const cast = ballotCast(after)
      const pending = ballotPending(after)
      await saveChatLine('【投票板·' + (prev ? '改票' : '投票') + '】' + memberId + ' 对 `' + b.id + '` '
        + (abstain ? '**弃权**（计入已投、不计选项）' : '已投票')
        + '（已投 ' + cast + '／' + voterCount() + '；**最少收集票 ' + rules.minVotes + '**：' + (cast >= rules.minVotes ? '已成立' : '未成立')
        + '；法定人数 m＝' + quorumM() + '：' + (pending.length ? '仍有未投票者 ' + pending.join('、') : '阻塞已解除') + '）')
      return { ok: true, vote: got.vote, cast, minVotes: rules.minVotes, m: quorumM(), pending }
    }
    async function pollCloseTool(memberId, a) {
      const args = a || {}
      const me = memberById(memberId)
      if (!me) return memberDiagnosis('截止并计票（vibe_v5_poll_close）', memberId)
      const perm = canDo(memberId, 'poll_close')
      if (!perm.ok) return { ok: false, code: 'V5_NOT_ACADEMICIAN', message: '只有院士（或所办）可以截止并计票（#25）；关板**不可授**（S6 的可授集合不含它）' }
      const stamp = rejectStampKeys(args, '截止计票')
      if (stamp) return stamp
      const wantId = String(args.ballot_id || args.ballotId || '').trim()
      const b = wantId ? ballotById(wantId) : openBallot()
      if (!b) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: wantId ? ('投票板 "' + wantId + '" not found') : '当前没有进行中的投票板' }
      if (b.phase !== 'open') return { ok: true, deduped: true, ballot: ballotView(b), message: '该板已截止（幂等）：不重算、不重播' }
      const rules = ballotRulesView(b)
      const cast = ballotCast(b)
      const settled = ballotSettled(b)          // **只读 minVotes 与已投数**（法定人数 m 是**另一个**门槛）
      const pending = ballotPending(b)
      const result = {
        cast, valid: (b.votes || []).filter((v) => v && !v.abstain).length,
        abstained: (b.votes || []).filter((v) => v && v.abstain).length, invalid: 0,
        minVotes: rules.minVotes, satisfied: settled, settled,
        outcome: settled ? 'recorded' : 'unsettled',
        // 两个门槛**并列**呈现（K13）：本次投票是否成立 vs 结题门（法定人数）是否满足。
        m: quorumM(), quorum_reached: pending.length === 0, pending: pending.slice(),
        secret: rules.secret, tally: (ballotView(b) || {}).tally || {},
      }
      const at = now()
      await patchInstitute({ ballots: (list) => (Array.isArray(list) ? list : []).map((x) => (
        x && x.id === b.id ? Object.assign({}, x, { phase: 'closed', closedAt: at, closedBy: me.id, result }) : x)) })
      await saveChatLine('【投票板·计票】`' + b.id + '`（' + b.question + '）截止：已投 ' + cast + '／' + voterCount()
        + '（有效 ' + result.valid + '、弃权 ' + result.abstained + '）'
        + '｜**最少收集票 ' + rules.minVotes + '** ⇒ ' + (settled ? '**本次投票成立**（选项计票见 report()）' : '**本次投票不形成结论**（未达最少收集票；不得据剩余票推断）')
        + '｜法定人数 m＝' + result.m + '：' + (result.quorum_reached ? '阻塞已解除' : '仍被未投票者阻塞（' + pending.join('、') + '）')
        + (rules.secret ? '｜**不记名**（逐人选择仅供计票；"这次是不记名"已留档）' : '｜记名（逐人选择见 report()）')
        + '。由 ' + me.id + ' **显式**截止；不存在"到点自动结算"。')
      return { ok: true, ballot: ballotView(ballotById(b.id) || b) }
    }

    // ── S12（D7/GAPS 22）：**会议分级**（正式会／简流程）──────────────────────────────────────────
    // ① **等级**：`formal`（决议类：会产出**实体定论**／表决）／`light`（同步／讨论：议程＋轮询＋行动项）。
    //    **派生**自 `meeting.kind`（`verify-request`／`solve-vote` ⇒ 决议类；`sync`／`division` ⇒ 简流程），
    //    并可由院士用 `formal_agenda:true` **显式覆盖**（建会时或会期内）。
    // ② **硬约束（D7）**：**简流程会期内**，**任何"实体定论"写入一律具名拒**——不得落**决议**条目
    //    （`entry_kind:'decision'`）、不得把支持性确认写成"结论／通过／已定"、**不得当真值**（R6）。
    // ③ **不强制（D7 原文"建议节奏但不强制"）**：**不自动**升降级、**不自动**拒绝开会；**不驱动**
    //    （不改阶段、不收束、不写票、无定时器）。等级**当次会议绑定**（与 U5 的"同一会议"单位一致）。
    const FORMAL_MEETING_KINDS = ['verify-request', 'solve-vote']
    const LIGHT_LEVEL_NOTE = '本场为**简流程**：**不得产出实体定论**（D7／R6）'
    const meetingLevelOf = (mn) => {
      if (!mn) return ''
      if (mn.formalAgenda === true) return 'formal'
      return FORMAL_MEETING_KINDS.indexOf(String(mn.kind || '')) !== -1 ? 'formal' : 'light'
    }
    const isLightMeeting = () => (meeting ? meetingLevelOf(meeting) === 'light' : false)
    /** D7 的**唯一判定点**：简流程会期内不得写入实体定论（具名拒；**不新增错误码**）。 */
    const truthWriteRefusal = (what) => ({
      ok: false,
      code: 'V5_INVALID_ARGUMENT',
      message: '简流程不得产出实体定论（D7/GAPS 22）：' + what + '——本场等级＝**简流程**。若确需定论，请由院士把本会设为正式（`vibe_v5_meeting {formal_agenda:true}`），或另开决议类会议（`solve-vote`／`verify-request`）。',
    })
    /** S12：**设定/查询会议等级**（仅院士；同值幂等；会期内可改但**每次写事件并广播**；不收时间键）。 */
    async function setMeetingLevel(callerId, a) {
      const args = a || {}
      const badTime = Object.keys(args).filter((k) => /(At|Ms)$/i.test(k))
      if (badTime.length) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: '时间由框架设置：不接受时间参数 ' + badTime.join('、') }
      if (args.formal_agenda !== undefined && typeof args.formal_agenda !== 'boolean') {
        return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'formal_agenda 必须是布尔值' }
      }
      const gate = canDo(callerId, 'meeting_level')
      if (!gate.ok) return { ok: false, code: 'V5_NOT_ACADEMICIAN', message: '只有院士可以设定会议等级（D7：正式／简流程）' }
      if (!meeting) return { ok: false, code: 'V5_NO_OPEN_MEETING', message: '没有进行中的会议：等级**当次会议绑定**（与 U5 的"同一会议"单位一致）' }
      const want = args.formal_agenda === true
      const before = meetingLevelOf(meeting)
      if ((meeting.formalAgenda === true) === want) {
        return { ok: true, deduped: true, level: before, meetingId: String(meeting.id), message: '等级已是该值（幂等；**不写事件**）' }
      }
      meeting.formalAgenda = want
      meeting.levelAt = now()
      meeting.levelBy = callerId
      const after = meetingLevelOf(meeting)
      await saveChatLine('【会议分级】' + callerId + ' 把本场会议（' + meeting.id + '）设为 ' + (after === 'formal' ? '**正式**（可产出实体定论）' : ('**简流程**：' + LIGHT_LEVEL_NOTE)) + '（原为 ' + before + '；D7/GAPS 22）')
      return {
        ok: true, level: after, before, meetingId: String(meeting.id),
        note: '等级**当次会议绑定**，会议收束即失效',
        message: '本场等级＝' + after + (after === 'light' ? '（' + LIGHT_LEVEL_NOTE + '）' : '（可产出实体定论）'),
      }
    }

    // ── S11（GAPS 29）：**记录人／秘书角色**（记录与主持分离）────────────────────────────────────
    // ① 只有**在册成员**可被指定（**排除临时工**）；**院士/所办不得自任**（"主持人不得兼任唯一记录者"）。
    // ② 记录人只拿**记录权**（追加具名条目）：**不获得票权、不改阶段/分母**（C5/R5 分离）。
    // ③ **只增不改**：**绝不重写** `### <who>` 发言小节（S10 的会议内锚依赖它）与**两区**（S8），
    //    也不删改异议尾注（S4）；**不自动补全**缺口（只报缺口；R7）。
    // ④ **随会议收束失效**（当次会议绑定；与 U5"同一会议"单位一致）；未指定 ⇒ `secretary=''`
    //    且明写"未指定：由框架自动落盘，无成员责任人"（**绝不**把框架/院士写成责任人）。
    const SECRETARY_ENTRY_MAX = 1000
    const NO_SECRETARY_NOTE = '未指定：由框架自动落盘，无成员责任人'
    const currentSecretary = () => ((meeting && meeting.secretary) ? String(meeting.secretary) : '')
    const secretaryEntriesOf = (mn) => ((mn && Array.isArray(mn.recordEntries)) ? mn.recordEntries : [])
    /** S11 #53：**指定/撤销记录人**（仅院士；**不得自任**；当次会议绑定；同值幂等；撤销 append-only）。 */
    async function secretaryTool(memberId, a) {
      const args = a || {}
      const badTime = Object.keys(args).filter((k) => /(At|Ms)$/i.test(k))
      if (badTime.length) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: '时间由框架设置：不接受时间参数 ' + badTime.join('、') }
      const gate = canDo(memberId, 'secretary')
      if (!gate.ok) return { ok: false, code: 'V5_NOT_ACADEMICIAN', message: '只有院士可以指定/撤销记录人（GAPS 29／`03` #28）' }
      const who = String(args.who || args.member || '').trim()
      const revoke = args.revoke === true || String(args.op || '').trim() === 'revoke'
      if (!revoke && !who) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'who is required：指定记录人必须给出成员 id' }
      const m = revoke ? null : memberById(who)
      if (!revoke && !m) return { ok: false, code: 'V5_MEMBER_NOT_FOUND', message: '找不到成员 ' + who }
      if (!revoke && (m.kind === 'academician' || isOffice(who))) {
        return { ok: false, code: 'V5_INVALID_ARGUMENT', message: '记录与主持分离（GAPS 29）：**主持人不得兼任唯一记录者** ⇒ 不能把院士/所办指定为记录人' }
      }
      if (!revoke && m.kind === 'temp') return { ok: false, code: 'V5_NOT_VOTER', message: '记录人必须是**在册成员**（临时工不可被指定）' }
      if (!meeting) return { ok: false, code: 'V5_NO_OPEN_MEETING', message: '指定记录人失败：当前没有进行中的会议（记录人**当次会议绑定**）' }
      const at = now()
      const mtId = String(meeting.id)
      const entry = { who, by: memberId, at, meetingId: mtId, revokedAt: 0 }
      if (revoke) {
        if (String(meeting.secretary || '') === '') {
          return { ok: true, deduped: true, secretary: null, meetingId: mtId, message: '当前未指定记录人（撤销幂等）' }
        }
        const prev = String(meeting.secretary)
        meeting.secretary = ''
        meeting.secretaryAt = at
        await patchInstitute({ secretaries: (list) => (Array.isArray(list) ? list : []).concat([Object.assign({}, entry, { who: prev, revokedAt: at })]) })
        await saveChatLine('【记录人】' + memberId + ' 撤销 ' + prev + ' 的记录人职责（当次会议 ' + mtId + '）；纪要责任人回到"**' + NO_SECRETARY_NOTE + '**"。')
        return { ok: true, revoked: prev, meetingId: mtId, message: '已撤销记录人（当次会议绑定）' }
      }
      if (String(meeting.secretary || '') === who) {
        return {
          ok: true, deduped: true, meetingId: mtId,
          secretary: { who, by: memberId, at: Number(meeting.secretaryAt || at), meetingId: mtId },
          message: '记录人已是 ' + who + '（幂等，不追加台账）',
        }
      }
      meeting.secretary = who
      meeting.secretaryAt = at
      meeting.secretaryBy = memberId
      await patchInstitute({ secretaries: (list) => (Array.isArray(list) ? list : []).concat([entry]) })
      await saveChatLine('【记录人】' + memberId + ' 指定 ' + who + ' 为本次会议（' + mtId + '）的**记录人**：对纪要的**准确与完整**负责（GAPS 29；只拿记录权，**不获票权**）。')
      if (args.why) await saveChatLine('【记录人｜理由】' + String(args.why))
      return {
        ok: true, secretary: { who, by: memberId, at, meetingId: mtId },
        note: '记录人**当次会议绑定**，会议收束即失效',
        message: '已指定记录人 ' + who + '（对纪要负责；不获票权）',
      }
    }
    /** S11 #54：**记录人（或院士）追加具名条目**；无 `entry` ⇒ **只报缺口、不自动补全**（R7）。 */
    async function minutesTool(memberId, a) {
      const args = a || {}
      const badTime = Object.keys(args).filter((k) => /(At|Ms)$/i.test(k))
      if (badTime.length) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: '时间由框架设置：不接受时间参数 ' + badTime.join('、') }
      const gate = canDo(memberId, 'minutes')
      if (!gate.ok) {
        return { ok: false, code: 'V5_NOT_VOTER', message: '纪要条目只能由**院士或当次会议的记录人**写入（`03` #27）：当前记录人＝' + (currentSecretary() || ('（' + NO_SECRETARY_NOTE + '）')) }
      }
      if (!meeting) return { ok: false, code: 'V5_NO_OPEN_MEETING', message: '没有进行中的会议：纪要条目随当次会议入档' }
      const detail = String(args.detail || 'normal')
      const text = String(args.entry || args.text || '').trim()
      if (!text) {
        const gaps = []
        if (!secretaryEntriesOf(meeting).length) gaps.push('记录人补充（尚无条目）')
        if (!String(meeting.agenda || '').trim()) gaps.push('议程')
        if (!Object.keys(meeting.inputs || {}).length) gaps.push('发言区（尚无发言）')
        if (!ballotsList().some((b) => String(b.meetingId || '') === String(meeting.id))) gaps.push('投票区（本场未用板）')
        return {
          ok: true,
          minutes: { meetingId: String(meeting.id), secretary: currentSecretary(), detail, entries: secretaryEntriesOf(meeting).length, gaps, note: '只报缺口，**不自动补全**（R7）' },
        }
      }
      if (text.length > SECRETARY_ENTRY_MAX) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: '条目过长（上限 ' + SECRETARY_ENTRY_MAX + ' 字符）' }
      // S12（D7/GAPS 22）：**简流程会期内不得落"决议"条目**（实体定论）⇒ 唯一的判定点 `truthWriteRefusal`。
      const entryKind = String(args.entry_kind || 'note')
      if (entryKind === 'decision' && isLightMeeting()) return truthWriteRefusal('不得落**决议**条目')
      const entries = secretaryEntriesOf(meeting)
      const same = entries.filter((x) => x && String(x.text) === text)[0]
      if (same) return { ok: true, deduped: true, entry: same, message: '同一条目已是同值（幂等）：未重复写纪要' }
      const entry = { by: memberId, at: now(), text, agenda_item: String(args.agenda_item || ''), entry_kind: entryKind }
      meeting.recordEntries = entries.concat([entry])
      // **只追加**（`appendMeetingTail` 语义）：绝不重写既有 `### <who>` 小节/两区（否则 S10 的会议内锚会失效）。
      await appendMeetingTail(meeting, '- 记录（' + memberId + '｜' + fmtTime(entry.at) + '）：' + text)
      await saveChatLine('【纪要记录】' + memberId + ' 追加一条具名记录（' + meeting.id + '）：' + text)
      return {
        ok: true, entry, meetingId: String(meeting.id), secretary: currentSecretary(),
        message: '已追加具名条目（**只增不改**；责任人在纪要里公开可追）',
      }
    }

    // ── S10（D6/G5）：**引用边界** ─────────────────────────────────────────────────────────────
    // 三条硬边界：① 引用**仅限同一会议内**（跨会议**只引上次决议** —— #26 未实现 ⇒ **当前一律具名拒**）
    //            ② **只带摘要＋稳定指针、不搬原文**（摘句 ≤200 字符，超长**确定性截断**并标 `truncated`）
    //            ③ **私聊不得作为引用来源**（须由**本人**先用 `supplement_of` 补记到群聊/会议）
    // 锚载体（裁定 (a-1)(i)）：**会议内 ⇒ 会议纪要文件** `mt-<id>#speech-<who>-<n>`（**耐久**，可作悬空判）；
    // **会议外 ⇒ 未投递群聊消息** `msg-<N>`（**写入时快照**；投递后正文不再保留 ⇒ 悬空即具名拒）；
    // 聚合锚 `ballot:<id>`（**不记名板只可引聚合**）；逐人锚 `ballot:<id>#vote-<who>` 在**不记名**时具名拒。
    const QUOTE_EXCERPT_MAX = 200
    const QUOTE_DEFAULT_PER_MESSAGE = 2
    const QUOTE_DEFAULT_DEPTH = 3
    const quotesPerMessageMax = () => Math.max(1, Math.floor(Number(params.quotesPerMessageMax) || QUOTE_DEFAULT_PER_MESSAGE))
    const quoteDepthMax = () => Math.max(1, Math.floor(Number(params.quoteDepthMax) || QUOTE_DEFAULT_DEPTH))
    /** **确定性**摘句：压缩空白 ＋ 限长 200 ＋ 截断标记（**绝不搬运原文**）。 */
    const truncateExcerpt = (t) => {
      const s = String(t || '').replace(/\s+/g, ' ').trim()
      return s.length > QUOTE_EXCERPT_MAX
        ? { excerpt: s.slice(0, QUOTE_EXCERPT_MAX), truncated: true }
        : { excerpt: s, truncated: false }
    }
    const quoteRefused = (message) => ({ ok: false, code: 'V5_INVALID_ARGUMENT', message })
    /** 解析引用锚 ⇒ `{ok:true,…}` 或 `{ok:false, code, message}`（**悬空即拒**）。 */
    async function resolveQuoteAnchor(ref) {
      const r = String(ref || '').trim()
      if (!r) return quoteRefused('quote_ref 为空：引用必须给出锚（会议内 `mt-<id>#speech-<who>-<n>`／会议外 `msg-<N>`／聚合 `ballot:<id>`）')
      if (/^res:/.test(r)) {
        return quoteRefused('跨会议只能引**上次决议**（D6）：决议对象 `meeting_result_record`（#26）**尚未实现** ⇒ 当前跨会议引用一律拒绝，不得静默放宽')
      }
      // ① 会议内发言锚（**耐久**：读会议纪要文件 ⇒ 悬空可判）
      const mts = /^mt-([A-Za-z0-9_-]+)#speech-([A-Za-z0-9_-]+)-(\d+)$/.exec(r)
      if (mts) {
        const mid = mts[1]
        const who = mts[2]
        const nth = Math.max(1, Math.floor(Number(mts[3]) || 1))
        const rel = 'Shared/Meetings/' + mid + '.md'
        let text = ''
        try { text = String((await readTextRel(rel)) || '') } catch (e) { text = '' }
        if (!text) return quoteRefused('悬空引用：会议纪要 ' + rel + ' 不存在或不可读 ⇒ 锚 ' + r + ' 无法解析')
        const blocks = []
        let cur = null
        for (const line of text.split(/\r?\n/)) {
          const h = /^###\s+([A-Za-z0-9_-]+)/.exec(line)
          if (h) { cur = { who: h[1], buf: [] }; blocks.push(cur); continue }
          if (cur) cur.buf.push(line)
        }
        const b = blocks.filter((x) => x.who === who)[nth - 1]
        const body = b ? b.buf.join('\n').trim() : ''
        if (!b || !body) return quoteRefused('悬空引用：' + rel + ' 里找不到 ' + who + ' 的第 ' + nth + ' 次发言（锚 ' + r + '）')
        return { ok: true, ref: r, domain: 'meeting', meetingId: mid, from: who, text: body, kind: 'speech', depth: 1, chain: [] }
      }
      // ② 会议外群聊消息锚（**写入时快照**：投递后正文不再保留）
      const msg = /^msg-(\d+)$/.exec(r)
      if (msg) {
        const id = 'msg-' + msg[1]
        const found = (inst().messages || []).filter((x) => x && String(x.id) === id)[0]
        if (!found) {
          const known = (inst().delivered || []).indexOf(id) !== -1
          return quoteRefused(known
            ? '悬空引用：' + id + ' 已投递归档，正文不再保留（封顶账本）⇒ 不能作为引用来源；请改为在会议内引用，或先补记到群聊/会议'
            : '悬空引用：找不到消息 ' + id)
        }
        if (String(found.kind) === 'dm') {
          // S10+G5：私聊**不是**引用来源；**只有**它已被**本人**补记到公开面之后，才允许引用——
          // 且引到的是**补记本**（公开文本），**原私聊正文仍不搬**（`viaSupplement` 指回补记本）。
          const sup = (inst().chatSupplements || []).filter((x) => x && String(x.of) === id)[0]
          if (!sup) {
            return quoteRefused('私聊内容**不得**作为引用来源（D6/G5）：请先由**本人**用 `supplement_of` 把它补记到群聊/会议，再引用补记本')
          }
          const pub = (inst().messages || []).filter((x) => x && String(x.id) === String(sup.publicRef))[0]
          return {
            ok: true, ref: r, domain: 'chat', meetingId: '', from: String(found.from || ''),
            text: pub ? String(pub.text || '') : '', kind: 'supplemented-dm', depth: 1, chain: [],
            viaSupplement: String(sup.publicRef || ''),
          }
        }
        const chain = []
        let hop = found
        for (let i = 0; i < 8 && hop && hop.quote && hop.quote.ref; i++) {
          chain.push({ ref: hop.quote.ref, from: hop.from })
          hop = (inst().messages || []).filter((x) => x && String(x.id) === String(hop.quote.ref))[0]
        }
        return {
          ok: true, ref: r, domain: 'chat', meetingId: '', from: String(found.from || ''),
          text: String(found.text || ''), kind: String(found.kind || 'chat'),
          depth: Number((found.quote && found.quote.depth) || 0) + 1, chain,
        }
      }
      // ③ 聚合锚 / 逐人锚（**不记名只可引聚合**）
      const bal = /^ballot:([A-Za-z0-9_-]+)(?:#vote-([A-Za-z0-9_-]+))?$/.exec(r)
      if (bal) {
        const b = ballotById(bal[1])
        if (!b) return quoteRefused('悬空引用：找不到投票板 ' + bal[1])
        const secret = !!(b.rules && b.rules.secret)
        if (bal[2]) {
          if (secret) return quoteRefused('不记名板的**逐人选择不可引用**（B10/R43）：只可引聚合锚 `ballot:' + b.id + '`')
          const v = (b.votes || []).filter((x) => x && String(x.by) === String(bal[2]))[0]
          if (!v) return quoteRefused('悬空引用：板上没有 ' + bal[2] + ' 的票')
          return {
            ok: true, ref: r, domain: 'ballot', meetingId: String(b.meetingId || ''), from: String(bal[2]),
            text: bal[2] + '＝' + ((v.choices || []).join('、') || (v.abstain ? '弃权' : '（无）')), kind: 'ballot-vote', depth: 1, chain: [],
          }
        }
        const vs = ballotView(b) || {}
        const tally = vs.tally || {}
        const agg = '问题：' + String(b.question || '') + '｜计票：' + Object.keys(tally).map((k) => k + '＝' + tally[k]).join('、')
          + '｜已投 ' + Number(vs.cast || 0) + (vs.settled ? '｜本次投票成立' : '｜未达门槛') + (secret ? '｜**不记名板**（只引聚合）' : '')
        return {
          ok: true, ref: r, domain: 'ballot', meetingId: String(b.meetingId || ''), from: String(b.from || ''),
          text: agg, kind: 'ballot-aggregate', depth: 1, chain: [],
        }
      }
      return quoteRefused('无法识别的引用锚：' + r + '（可用：会议内 `mt-<id>#speech-<who>-<n>`／会议外 `msg-<N>`／聚合 `ballot:<id>`）')
    }
    /**
     * S10 唯一入口：`vibe_v5_say` 的**发言 ＋ 引用/补记**。
     * 顺序：① 时间键一律拒 → ② 补记（`supplement_of`，**本人**发起、只记事实）→ ③ 引用（同域／悬空／条数／
     * 深度折叠／环形标注／不记名只引聚合）；边界：**不驱动**（不改阶段、不收束、不写票、无定时器）。
     */
    async function sayQuote(callerId, args) {
      const a = args || {}
      const badTime = Object.keys(a).filter((k) => /(At|Ms)$/i.test(k))
      if (badTime.length) return quoteRefused('时间由框架设置：不接受时间参数 ' + badTime.join('、'))
      const to = a.to || 'all'
      const kind = to === 'voters' ? 'voters' : (a.to ? 'dm' : 'chat')
      // ② 私聊补记（G5：**本人**发起、只记事实、**原私聊不进公开面**）
      let supplementOf = ''
      if (a.supplement_of) {
        const ref = String(a.supplement_of).trim()
        const why = String(a.why || '').trim()
        if (!why) return quoteRefused('why is required：补记必须写明理由（G5/D6）')
        const src = (inst().messages || []).filter((x) => x && String(x.id) === ref)[0]
        if (!src || String(src.kind) !== 'dm') return quoteRefused('补记失败：' + ref + ' 不是一条私聊消息')
        if (String(src.from) !== String(callerId)) {
          return quoteRefused('补记只能由**私聊的发送者本人**发起（G5：私聊内容永不默认转发）：' + ref + ' 不是你发的')
        }
        supplementOf = ref
      }
      // ③ 引用（同域／悬空／条数／深度／环形／不记名）
      const refs = (Array.isArray(a.quote_refs) ? a.quote_refs.map(String) : []).concat(a.quote_ref ? [String(a.quote_ref)] : [])
      let quote = null
      const quotes = []
      if (refs.length) {
        if (refs.length > quotesPerMessageMax()) {
          return quoteRefused('每条发言最多引用 ' + quotesPerMessageMax() + ' 条（`04` §5；超限**具名拒绝**）：本次请求 ' + refs.length + ' 条')
        }
        const curMeetingId = meeting ? String(meeting.id) : ''
        for (const ref of refs) {
          const got = await resolveQuoteAnchor(ref)
          if (!got.ok) return got
          if (String(got.meetingId || '') !== curMeetingId) {
            return quoteRefused('引用**仅限同一会议内**（D6）：当前'
              + (curMeetingId ? '会议是 ' + curMeetingId : '不在会议中（会议外群聊域）')
              + '，而被引发言属于 ' + (got.meetingId || '会议外群聊域') + ' ⇒ 跨会议/跨域引用被拒')
          }
          const want = String(a.quote_excerpt || '').trim()
          const cut = truncateExcerpt(want || got.text)
          const depth = Number(got.depth || 1)
          const capped = depth > quoteDepthMax()
          const cycle = (got.chain || []).some((x) => String(x.from) === String(callerId))
          quotes.push({
            ref: got.ref, from: got.from, at: now(), kind: got.kind, domain: got.domain,
            excerpt: capped ? '' : cut.excerpt, truncated: capped ? false : cut.truncated,
            depth, collapsed: capped, cycle,
            rootRef: (got.chain && got.chain.length ? got.chain[got.chain.length - 1].ref : got.ref),
            secretAggregateOnly: got.kind === 'ballot-aggregate',
            viaSupplement: String(got.viaSupplement || ''),
          })
        }
        quote = quotes[0]
        if (quote.collapsed) {
          await saveChatLine('【引用】' + callerId + ' 的引用链深度 ' + quote.depth + ' 超过上限 ' + quoteDepthMax()
            + ' ⇒ **折叠为**「见第 k 轮发言 #n」（只标锚、不搬原文；`04` §4）。')
        }
        if (quotes.some((q) => q.cycle)) {
          await saveChatLine('【引用成环】' + callerId + ' 的引用指向了链条里**自己**的发言 ⇒ 提示"引用成环，请补充新论据或转为一句话表态"（**只标注，不拒绝**；`04` §4）。')
        }
      }
      const sent = await say(callerId, { to, text: a.text, kind, quote, quotes, supplementOf })
      if (supplementOf) {
        await patchInstitute({
          chatSupplements: (list) => (Array.isArray(list) ? list : []).concat([{
            of: supplementOf, by: callerId, at: now(), publicRef: String((sent && sent.ids && sent.ids[0]) || ''), why: String(a.why || ''),
          }]),
        })
        await saveChatLine('【补记】' + callerId + ' 把私聊 ' + supplementOf + ' 的内容**补记**到公开面（理由：' + String(a.why || '')
          + '）⇒ 之后可被引用（引用带 viaSupplement）；**原私聊本身仍不进公开面**（G5）。')
      }
      return Object.assign({}, sent, quote ? { quote, quotes } : {}, supplementOf ? { supplementOf } : {})
    }

    // ── S9（D5/D5a/U3）：**少数意见入档 ＋ 复议** ──────────────────────────────────────────────
    // 收束的记录**一律**盖上少数意见（`minority[]`）、门槛（`threshold{m,floor}`）与生效时点
    // （`effectiveAt`）——**唯一的盖章点**是 `putVerdict`，因而四条收束路径（触界/形式化推迟/未定论/
    // 真伪）与"所办停止"都自动覆盖，**不会漏**。
    // 少数意见的定义：与最终 `outcome` 不一致的表态者；**无胜方**（未定论/取平均）时＝与"多数侧"
    // 不一致者；**弃权／无法判断／未表态都不算少数意见**（单列，R2/D3）。
    function minorityOf(rec) {
      const votes = (rec && rec.votes) || {}
      const outcome = String((rec && rec.outcome) || '')
      const mean = Number((rec && rec.mean) || 0)
      const out = []
      for (const id of Object.keys(votes)) {
        const v = votes[id] || {}
        if (v.abstain) continue                                  // 弃权：单列，不进少数意见
        const p = Number(v.prob)
        if (!Number.isFinite(p)) continue
        let isMinority = false
        if (outcome === 'true') isMinority = p < 1
        else if (outcome === 'false') isMinority = p > 0
        else isMinority = mean >= 0.5 ? p < mean : p > mean      // 无胜方：与多数侧不一致
        if (isMinority) out.push({ by: id, prob: p, reason: String(v.reason || ''), at: Number(v.at || 0) })
      }
      return out
    }
    const reconsiderFloor = () => Math.max(0, Math.floor(Number(params.reconsiderFloor) || 0))
    /** 收束记录的**盖章**（幂等：已盖过就原样返回）。 */
    function sealRecord(rec) {
      if (!rec || !rec.closed || rec.sealed) return rec
      const minority = minorityOf(rec)
      return Object.assign({}, rec, {
        minority,
        minorityCount: minority.length,
        sealed: true,
        threshold: { m: Number(rec.m || 0) || Number(quorumM() || 0), floor: reconsiderFloor() },
        effectiveAt: Number(rec.closedAt || now()),
        reconsiderations: Array.isArray(rec.reconsiderations) ? rec.reconsiderations : [],
      })
    }
    /** U3：复议后的门槛**只升不降** —— 记录里的门槛与当轮口径取较大者（判定入口在此收紧）。 */
    const raisedThresholdOf = (vs) => Math.max(0, Math.floor(Number((vs && vs.threshold && vs.threshold.m) || 0)))
    /**
     * S9 #52：提请**复议**（记录级救济；D5/D5a/U3）。
     * 资格＝**记录派生**（有胜方 ⇒ 当初胜方之一；无胜方 ⇒ 任一参与者，**不得**以"无胜方"拒收）；
     * 生效门槛 `after = max(before, reconsiderFloor, quorumCap)`（只升不降）；同一轮**只受理一次**；
     * 旧结论/旧票面/旧少数意见**全部留档**（append-only，R7）＋旧结论标 `supersededBy`；
     * **不产生新票权、不改分母、不改阶段、无定时器**。
     */
    async function reconsiderTool(memberId, a) {
      const member = memberById(memberId)
      if (!member) return memberDiagnosis('复议（vibe_v5_reconsider）', memberId)
      const args = a || {}
      const badTime = Object.keys(args).filter((k) => /(At|Ms)$/i.test(k))
      if (badTime.length) {
        return { ok: false, code: 'V5_INVALID_ARGUMENT', message: '时间由框架设置：不接受时间参数 ' + badTime.join('、') }
      }
      const target = String(args.target || args.target_id || '').trim()
      if (!target) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'target is required：复议必须指明判定对象' }
      const why = String(args.why || '').trim()
      if (!why) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'why is required：复议必须写明理由（D5）' }
      // ── S9 × S7：**投票板的复议**（兑现 `03` §5.3 的"close 后只能走复议"）─────────────────────
      // **不记名**（`rules.secret`）⇒ 复议只带**聚合面**（票数/门槛/是否成立），**逐人选择永不解密**（B10/R54）。
      const ballotTarget = /^ballot:/.test(target) ? target.slice(7) : String(args.ballot_id || '')
      if (ballotTarget) {
        const b = ballotById(ballotTarget)
        if (!b) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: '没有投票板 ' + ballotTarget }
        if (b.phase !== 'closed') return { ok: false, code: 'V5_INVALID_ARGUMENT', message: '投票板 ' + b.id + ' 尚未截止：复议只针对**已生效**的结论（G2）' }
        const bVotes = Array.isArray(b.votes) ? b.votes : []
        if (!bVotes.some((v) => v && String(v.by) === String(memberId))) {
          return { ok: false, code: 'V5_NOT_VOTER', message: '复议只能由该次表决的**参与者**提出（D5/D5a）：该板上没有 ' + memberId + ' 的票' }
        }
        const bDone = Array.isArray(b.reconsiderations) ? b.reconsiderations : []
        const sameW = bDone.filter((x) => String((x || {}).why) === why)[0]
        if (sameW) return { ok: true, deduped: true, reconsideration: sameW, message: '复议已是同值（幂等）：未重复入档' }
        if (bDone.length) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: '本板已复议过（每板只受理一次）：请等新一轮结论' }
        const bSecret = !!(b.rules && b.rules.secret)
        const bCap = Math.max(1, Math.floor(Number(params.quorumCap) || 3))
        const bBefore = Math.max(1, Number((b.rules && b.rules.minVotes) || 0) || bCap)
        const bAfter = Math.max(bBefore, reconsiderFloor(), bCap)
        const bAt = now()
        const bEntry = {
          id: 'rc-ballot-' + b.id + '-1', by: memberId, at: bAt, round: 1, nextRound: 2, why,
          evidence: String(args.evidence || ''), eligibility: 'board-participant',
          thresholdBefore: bBefore, thresholdAfter: bAfter, raisedBy: bAfter - bBefore, onlyUp: bAfter >= bBefore,
          secretSource: bSecret,
        }
        await patchInstitute({ ballots: (list) => (Array.isArray(list) ? list : []).map((x) => (x && String(x.id) === String(b.id)
          ? Object.assign({}, x, {
            reconsiderations: bDone.concat([bEntry]), supersededBy: bEntry.id, supersededAt: bAt,
            threshold: { m: bAfter, floor: reconsiderFloor() }, reopenedAt: bAt,
            reopening: true, priorResult: x.result || null,             // 旧结果**留档**（append-only，R7）
            phase: 'open', closedAt: 0, closedBy: '', result: null,
          }) : x)) })
        await saveChatLine('【复议｜板 ' + b.id + '】' + memberId + ' 提请复议：' + why
          + '｜门槛 ' + bBefore + ' ⇒ ' + bAfter + '（**只升不降**，U3）｜旧计票结果已留档，板重新开启'
          + (bSecret ? '｜**本板不记名**：只给聚合票数与门槛，逐人选择按留档口径**不公开**' : ''))
        return {
          ok: true, ballot_id: b.id, reconsideration: bEntry, threshold: { before: bBefore, after: bAfter },
          secretSource: bSecret, eligibility: 'board-participant',
          message: '复议已受理：板已重新开启（门槛只升不降）' + (bSecret ? '；本板不记名 ⇒ 只给聚合面（逐人选择不公开）' : ''),
        }
      }
      const rec = inst().verdicts[target]
      if (!rec) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: '没有判定对象 ' + target }
      if (!rec.closed) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: '对象 ' + target + ' 尚未收束：复议只针对**已生效**的结论（G2）' }
      // 资格（D5/D5a）：**记录派生**，不是角色；院士不额外加权（R5）。
      const votes = rec.votes || {}
      const outcome = String(rec.outcome || '')
      const hasWinner = outcome === 'true' || outcome === 'false'
      const mine = votes[memberId]
      const participated = !!(mine || (rec.unable && rec.unable[memberId]))
      if (!participated) {
        return { ok: false, code: 'V5_NOT_VOTER', message: '复议只能由该次表决的**参与者**提出（D5/D5a）：' + memberId + ' 不是本对象的表决参与者' }
      }
      let eligibility = 'any-participant'
      if (hasWinner) {
        const wanted = outcome === 'true' ? 1 : 0
        const myP = Number((mine || {}).prob)
        if (!Number.isFinite(myP) || myP !== wanted) {
          return { ok: false, code: 'V5_NOT_VOTER', message: '复议只能由**当初胜方之一**提出（D5）：本对象已有明确胜方（' + outcome + '）；无胜方情形才允许任一参与者（D5a）' }
        }
        eligibility = 'winner'
      }
      const done = Array.isArray(rec.reconsiderations) ? rec.reconsiderations : []
      const curRound = Number(rec.round || 0)
      const sameWhy = done.filter((x) => Number((x || {}).round) === curRound && String((x || {}).why) === why)[0]
      if (sameWhy) return { ok: true, deduped: true, reconsideration: sameWhy, message: '复议已是同值（幂等）：未重复入档' }
      if (done.some((x) => Number((x || {}).round) === curRound)) {
        return { ok: false, code: 'V5_INVALID_ARGUMENT', message: '本轮已复议过（每轮只受理一次）：请等本轮结论' }
      }
      const maxRounds = Math.max(1, Math.floor(Number(params.verdictMaxRounds) || 3))
      if (curRound >= maxRounds) {
        return { ok: false, code: 'V5_INVALID_ARGUMENT', message: '已达轮次上限 verdictMaxRounds=' + maxRounds + '：不得无限复算' }
      }
      // 门槛**只升不降**（U3）。
      const cap = Math.max(1, Math.floor(Number(params.quorumCap) || 3))
      const floor = reconsiderFloor()
      const before = Math.max(1, Number((rec.threshold && rec.threshold.m) || rec.m || cap) || cap)
      const after = Math.max(before, floor, cap)
      const at = now()
      const entry = {
        id: 'rc-' + target + '-' + (curRound + 1), by: memberId, at, round: curRound, nextRound: curRound + 1,
        why, evidence: String(args.evidence || ''), eligibility,
        thresholdBefore: before, thresholdAfter: after, raisedBy: after - before, onlyUp: after >= before,
        secretSource: !!(rec.secretSource),
      }
      const previous = {
        round: curRound, outcome, reason: String(rec.reason || ''), mean: Number(rec.mean || 0),
        votes: rec.votes || {}, unable: rec.unable || {}, minority: rec.minority || [],
        closedAt: Number(rec.closedAt || 0), m: before, endedBy: String(rec.endedBy || ''),
      }
      const next = Object.assign({}, rec, {
        reconsiderations: done.concat([entry]),
        previousRounds: (Array.isArray(rec.previousRounds) ? rec.previousRounds : []).concat([previous]),
        previousOutcome: outcome,          // 旧结论**保留**（append-only，R7）
        supersededBy: entry.id,            // (g) 旧结论带"已被复议"标记
        supersededAt: at,
        threshold: { m: after, floor },
        round: curRound + 1,
        votes: {},                          // 新一轮从**空票面**开始（旧票面在 previousRounds 里留档）
        unable: {},
        minority: [], minorityCount: 0,
        sealed: false, closed: false, reopenedAt: at, lastVoteAt: at,
      })
      delete next.outcome
      delete next.reason
      delete next.closedAt
      await putVerdict(target, next)
      await saveChatLine('【复议｜' + target + '】' + memberId + ' 提请复议（资格：' + eligibility + '）：' + why
        + '｜门槛 ' + before + ' ⇒ ' + after + '（**只升不降**，U3）｜旧结论与旧少数意见已留档；新结论生效前旧结论仍可引用（带"已被复议"标记）')
      return {
        ok: true, reconsideration: entry, threshold: { before, after }, eligibility,
        previousOutcome: outcome, message: '复议已受理：已为同一对象开启第 ' + (curRound + 1) + ' 轮（门槛只升不降；旧结论留档）',
      }
    }

    // ── S8（R3/K12/B9）：票与发言的**时序分离** ────────────────────────────────────────────────
    // 定稿口径：**表决期间不得发言**（`05` B9／`SPEC` K12／`04` 权限矩阵）——进入表决即**冻结发言**
    // （**举手队列保留、但不放行**：`05` L162）；需要再讨论则**先由院士收束表决**（`vibe_v5_poll_close`
    // #51）或结束会议。**派生判据**（与 S7 的"板不改会议阶段"一致）：**存在一张 `open` 的投票板 ⇒ 冻结**。
    // 边界：① 只拦**成员发言入口**（`vibe_v5_say` ＋ 会议唤醒的发言交付）——**系统消息照常**
    //       ② **不改阶段、不收束、不自动解除**（无定时器；D10/S5 同源）
    //       ③ **不折算**：发言不产生票、票也不产生发言（H3）
    //       ④ 程序异议（#46，D2 救济权）与院士/所办的显式说明**不受限**（chair-first）。
    function speechFrozen() {
      const b = openBallot()
      return b
        ? { frozen: true, ballotId: String(b.id || ''), since: Number(b.at || 0), question: String(b.question || '') }
        : { frozen: false, ballotId: '', since: 0, question: '' }
    }
    const speechFrozenView = () => {
      const f = speechFrozen()
      return { frozen: f.frozen, frozen_by: f.frozen ? ('ballot:' + f.ballotId) : '', since: f.since, question: f.question }
    }
    /** 成员发言的**唯一门禁**（只作用于成员发言入口；系统消息不经这里）。返回 `null`＝放行。 */
    function speechGate(callerId) {
      const f = speechFrozen()
      if (!f.frozen) return null
      const m = memberById(callerId)
      // 例外：院士/所办（chair-first）不受限；程序异议走 #46（另一入口），不经过本门。
      if (isOffice(callerId) || (m && m.kind === 'academician')) return null
      return { ok: false, code: 'V5_INVALID_ARGUMENT', message: '表决期禁止发言（R3/K12/B9）：投票板 `' + f.ballotId + '` 仍在进行中。先把表决收束（vibe_v5_poll_close）或由院士结束会议再讨论；**举手队列保留**，解冻后按原顺序放行。程序异议（D2）不受此限。' }
    }

    // ---- roster helpers ---------------------------------------------------
    const activeMembers = () => inst().members.filter((m) => m.phase === 'active')
    const memberById = (id) => inst().members.find((m) => m.id === id)
    const voters = () => activeMembers().filter((m) => m.kind === 'academician' || m.kind === 'researcher')
    const voterCount = () => voters().length
    function quorumMFrom(vc) {
      const cap = Math.max(1, Math.floor(Number(params.quorumCap) || 3))
      return Math.max(1, Math.min(cap, vc))
    }
    function quorumM() { return quorumMFrom(voterCount()) }
    // DEFECT B (3rd self-test): the office's digest showed `m=2` while `status`/`acad` showed
    // `m=3` in the SAME window — two views had computed the voter set at different moments
    // (roster-snapshot timing). Every quorum-bearing view now reads ONE live snapshot and carries
    // its `rosterVersion`, so all views at one point in time are provably identical and a stale
    // reader can be DETECTED instead of silently disagreeing.
    function rosterVersion() {
      const ids = voters().map((m) => String(m.id) + ':' + String(m.phase)).sort()
      return 'r' + String((inst().members || []).length) + ':' + ids.join(',')
    }
    function rosterSnapshot() {
      const vs = voters()
      const vc = vs.length
      const started = vc > 0
      return {
        version: rosterVersion(),
        m: started ? quorumMFrom(vc) : 0,
        voters: vs.map((m) => m.id),
        voterCount: vc,
        started: started,
      }
    }
    // DEFECT 2 (v5 self-test §18): before `start` there are no voters, yet the reported quorum
    // was `m=1` with `voters=0` — it read like "a quorum of 1 is already there". The REPORTED
    // quorum is therefore coherent and explicit: `started:false`, `m:0`, `voterCount:0` and the
    // next step. `quorumM()` itself stays >=1 so the consensus arithmetic is unchanged, and
    // `judgeVerdict` refuses to conclude at all when there are no voters.
    function quorumView() {
      const snap = rosterSnapshot()
      const started = snap.started
      const view = {
        m: snap.m,
        mode: params.quorumMode,
        voters: snap.voters,
        voterCount: snap.voterCount,
        started: started,
        phase: started ? 'voting' : 'not-started',
        rosterVersion: snap.version,
      }
      if (!started) {
        view.next = {
          kind: 'start', tool: 'vibe_v5_start',
          hint: '研究所尚未启动：有表决权者 0 人，因此 m 记为 0（不是"已满足 1 票门槛"）。先 vibe_v5_start（或 /v5 start）建立名册，m 才有意义。',
        }
      }
      return view
    }
    // DEFECT 1 (v5 self-test §18): a member-scoped tool called before the institute exists — or
    // by nobody identifiable — answered a BARE `V5_MEMBER_NOT_FOUND`, so an operator (or the
    // model) could not tell WHY it failed or WHAT TO DO FIRST. The error CODE is unchanged (all
    // existing gates keep matching on it); the answer now names the state and the next step, in
    // the same `next`-hint shape the `math_computation` tool uses.
    function memberDiagnosis(what, memberId) {
      const total = (inst().members || []).length
      const active = activeMembers().length
      const who = String(memberId || '')
      if (active === 0 && !running) {
        return {
          ok: false, code: 'V5_MEMBER_NOT_FOUND',
          message: what + '失败：研究所尚未启动（在册 ' + total + ' 名、有表决权者 0 人），没有可归属的成员身份。',
          next: {
            kind: 'start', tool: 'vibe_v5_start',
            hint: '先启动研究所（vibe_v5_start 或 /v5 start）让框架派出常驻成员，再由**成员子代理**调用该工具；所办（会话根）本身不是成员。',
          },
        }
      }
      if (active === 0) {
        return {
          ok: false, code: 'V5_MEMBER_NOT_FOUND',
          message: what + '失败：研究所当前没有在册（active）成员。',
          next: { kind: 'staff', tool: 'vibe_v5_add_researcher', hint: '先用 vibe_v5_add_researcher / vibe_v5_hire 补充成员，再调用该工具。' },
        }
      }
      if (!who) {
        return {
          ok: false, code: 'V5_MEMBER_NOT_FOUND',
          message: what + '失败：无法识别调用者（这是成员工具，所办/会话根没有成员身份）。',
          next: { kind: 'member-call', tool: 'vibe_v5_members', hint: '请由成员子代理调用；所办可用 vibe_v5_message 转达，或直接用所办工具（vibe_v5_report / vibe_v5_status）。' },
        }
      }
      return {
        ok: false, code: 'V5_MEMBER_NOT_FOUND',
        message: what + '失败：名册中没有成员 "' + who + '"（可能已被解雇或尚未就位）。',
        next: { kind: 'roster', tool: 'vibe_v5_members', hint: '先用 vibe_v5_members 查看当前名册与阶段（active / provisioning / dismissed）。' },
      }
    }
    function byChild(childId) { return inst().members.find((m) => m.childId === childId) }
    // The live academician's id, or '' when the office founded the institute with
    // `academician: false`. Every piece of charter text that talks about "the leader"
    // must go through this: a hard-coded 'acad' told members to report to a leader who
    // does not exist, and described organizational duties nobody holds.
    function academicianId() {
      const a = activeMembers().find((m) => m.kind === 'academician')
      return a ? a.id : ''
    }
    // `academicianId()` resolved against a roster that also counts a member which is NOT yet
    // committed (the joiner whose charter is being built). Kept separate so the canonical
    // resolver stays the live-roster one — the sensitivity probe for the leaderless charter
    // mutates the `academicianId()` CALL, and that mutation must keep reaching the text.
    function academicianIdWith(extraMember) {
      if (!extraMember) return academicianId()
      const a = activeMembers().concat([extraMember]).find((m) => m.kind === 'academician')
      return a ? a.id : ''
    }

    // ---- the institute charter (public regulations) -----------------------
    // Written into every member's `persona` at hire time. `persona` is part of the
    // durable continuable descriptor, so the charter survives cold resume AND
    // context compaction WITHOUT being re-injected into prompts — which is what
    // structurally removes v4's "re-anchor the rules after compaction" patch and
    // the "[核心规则重申]+[CONTEXT COMPACT] every round" leak it caused (§24.1-③).
    function rosterLine(extraMember) {
      // Written ONCE, at the member's creation (`newMember`), so the hire-time snapshot is
      // frozen even for a member the host's live-child cap refuses and `resume` re-spawns
      // later (audit M5). The joiner is folded in here so its own charter shows the institute
      // WITH itself on the roster — exactly what the original build-at-spawn code produced.
      const ms = extraMember ? activeMembers().concat([extraMember]) : activeMembers()
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
      '  · Members/<你>/Progress/progress.md —— **你的研究日志**（叙述体，可追加）。',
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
      '  · Members/<你>/Propos/<id>.md —— **你的命题/引理**。格式：',
      '      - ID: p-<id>; - 状态: 未定论; - 概率: <0-1>; - 价值程度: <0-1>; - 动机用途计划: <为何重要/打算怎么用>',
      '      然后 ## 陈述 <完整陈述>；## 证明尝试；## 证伪尝试。',
      '  · Members/<你>/Methods/<id>.md —— **你的理论/方法/工具**。格式：',
      '      - ID: m-<id>; - 状态: 经验; - 可信断言: []; - 价值程度: <0-1>; - 动机用途计划: ...',
      '      然后 ## 核心内容；## 定义与记号；## 应用记录；## 改进历史。',
      '  · Members/<你>/Subproblems/<id>.md —— **你的子问题**。格式：',
      '      - ID: s-<id>; - 状态: 求解中; - 价值程度: <0-1>; - 动机用途计划: ...',
      '      然后 ## 陈述；## 进度。',
      '',
      '  三条硬要求：',
      '   ① 凡入库必须写明 **价值程度 / 动机用途计划 / 你对该对象为真的概率估计**（缺一不可）；',
      '   ② **只写自己的库**；读别人的库是允许且被鼓励的；',
      '   ③ 推荐**直接用 fs 写你自己的文件**（路径必须带成员库根，见上：Members/<你>/…）；vibe_v5_record_* 只是便捷记录器，不是必需。',
    ].join('\n')

    // Computed per hire (a FUNCTION, not a frozen const): the text names the live
    // academician, and must describe a leaderless institute honestly when the office
    // founded one with `academician: false`.
    function orgCommon() {
      const a = academicianId()
      const L = [
        '  本所是自组织的，但**不是没有组织**——现实中一个研究所也有所长/学术带头人统筹全局。',
      ]
      if (a) {
        L.push(
          '  本所的领头人是**院士 ' + a + '**。它以**全所视角**组织与协调：',
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
          '    · **不要重复劳动**：做之前先看任务板和别人的库；发现别人已在做同一件事，告诉院士。')
      } else {
        L.push(
          '  本所当前**没有在册院士**（所办以无领头人方式建所）：组织与协调由**全体有表决权者',
          '  共同商议**，通过群聊、提议开会（vibe_v5_meeting）与任务板完成。请特别注意：',
          '    · 没有谁替你分派工作——**方向要你们自己讨论出来**，并把讨论结果落到任务板上；',
          '    · 提议开会需要有人附议/由所办确认（只有院士或所办能直接召开）；',
          '    · **主动汇报**：把你的进展、发现、卡点写进你自己的 Progress/ 并说在群聊里，',
          '      否则别人无从与你协作；',
          '    · **不要重复劳动**：做之前先看任务板和别人的库；发现重复，直接在群聊里指出。')
      }
      return L.join('\n')
    }

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
      // The leader's REAL id (or '' when the office founded a leaderless institute).
      // Charter text must never name a leader who is not on staff: a member told to
      // "report to the academician" when there is none has no one to report to.
      // `member` itself is counted as on-staff even before it is committed (see rosterLine).
      const acadId = academicianIdWith(member)
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
      if (acadId || kind === 'academician') {
        L.push('本所没有**外部**派活：做什么、往哪走，由所内自己决定。所内的组织与协调由**院士**牵头——')
        L.push('它统筹全局、把工作拆解成分派下去、设定优先级、主持会议、督导进度；你则在自己的方向上')
        L.push('深入钻研，把进展与判断汇报给它和全所。请记住这条分工：**组织由院士负责，但判断属于')
        L.push('你自己**——它分派的是工作，不是结论。')
      } else {
        L.push('本所没有**外部**派活：做什么、往哪走，由所内自己决定。本所当前**没有在册院士**，')
        L.push('组织与协调由**全体有表决权者共同商议**（所办代表外部）；但请守住同一条分工：')
        L.push('**组织归集体，判断属于你自己**——讨论决定的是工作，不是结论。')
      }
      L.push('')
      L.push('────────────────────────────────────────')
      // ── 一、roster ───────────────────────────────────────────────────────
      L.push('【一、所内编制与你的同事】')
      if (kind === 'temp') {
        if (acadId) L.push('  · **院士 ' + acadId + '** —— 本所领头人，组织与协调中心。它统筹全所、分派任务、主持')
        if (acadId) L.push('    会议、督导进度，也可以直接分派任务给你。')
        L.push('  · **常驻研究员** —— 本所有表决权者。你是临时雇入的协作人员。')
        L.push('  · 你的雇主：' + (member.hiredBy || '?') + '。它给你派活' + (acadId ? '；院士也可以给你派活。' : '。'))
        if (!acadId) L.push('  · 本所当前**没有在册院士**；组织与协调由全体有表决权者共同商议。')
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
        if (acadId) {
          L.push('  · **院士 ' + acadId + '** —— 本所领头人，本所的**组织与协调中心**。它亲自参与研究，同时')
          L.push('    向全所负责：建立全所视图、把原问题拆解成工作并**分派**给合适的成员（含临时工）、')
          L.push('    设定优先级与路线取舍、召集并主持会议、督导进度与催办停滞、调配临时工。')
          L.push('    但它的一票与你**等重**，不能单方面定论。')
          L.push('  · **常驻研究员（含你）** —— 有表决权。可自主雇佣/解雇自己的临时工。')
          L.push('    向院士汇报进展、接受其组织与分派。')
        } else {
          L.push('  · **常驻研究员（含你）** —— 有表决权。可自主雇佣/解雇自己的临时工。')
          L.push('    本所当前**没有在册院士**：方向由你们共同商议决定，不要等别人来派活。')
        }
        L.push('  · **临时工** —— 由某位研究员' + (acadId ? '或院士' : '') + '为特定任务临时雇入。可读、可想、可发言、')
        L.push('    可写自己的成果库、可认领或被分派任务，但**没有表决权**。')
        L.push('  · **所办（对外接口）** —— 不参与研究、不投票。代表本所与外部沟通并转达外部指令。')
      }
      L.push('  你入职时的在册编制（这是一份**快照**，此后可能变化）：')
      L.push(rosterLine(member))
      L.push('  （权威的在册名单与法定票数 m 以每轮提示里的状态块为准；编制可能变化。）')
      L.push('')
      // ── 二、general rules ────────────────────────────────────────────────
      L.push('【二、通用规章（全员必读）】')
      L.push('  1. 本所一切任务安排由成员讨论' + (acadId ? '与院士组织' : '共同') + '决定；没有**外部**给你派活。')
      L.push('  2. 只有 Verified/ 目录下的结论（以及成果卡中标注"已验证·真/假"的条目）绝对可信。')
      L.push('     其余一切——他人的推测、你自己的未验结论、Progress/、Methods/ 里的未验证断言——')
      L.push('     都只是经验性参考，引用时必须注明"未验证"。')
      L.push('  3. 任何人可以读任何人的成果库；你只能写自己的库（' + instRel('Members/<你>/') + '）。')
      L.push('  4. 你写下的有价值内容由你自己判断是否入库，但入库必须写明三项：')
      L.push('     价值程度、动机用途计划、你自己对"该对象为真"的概率估计。')
      L.push('  5. 你随时可以在群聊里说话；要单独找人可以私信。需要集体决策就提议开会。')
      L.push('  6. 请主动读同事的库，对齐事实、避免重复劳动、发现冲突。')
      if (acadId) {
        L.push('  7. **主动向院士汇报**：它需要你的进展、发现与卡点才能统筹全所；把关键结论在群聊里')
        L.push('     说出来，把细节留在你自己的 Progress/ 里。')
      } else {
        L.push('  7. **主动在群聊里汇报**：本所没有院士替你统筹，你不说别人就无从与你协作；把关键')
        L.push('     结论说出来，把细节留在你自己的 Progress/ 里。')
      }
      L.push('')
      // ── 三、libraries ───────────────────────────────────────────────────
      L.push('【三、你的资料库、progress 与卡片格式】')
      L.push('  你的资料库根目录（**相对会话工作目录**）：' + instRel('Members/' + member.id + '/'))
      L.push('  （`<你>` = 你自己的成员 id：下面每条都已带完整库根，可直接照抄。你**只写自己的库**，但可以读任何人的对应目录。）')
      L.push('  ⚠ 路径基准：你自己的文件工具的**相对路径以会话工作目录为基准**，所以直接读写文件时必须用**带库根的完整路径**（把下面每条里的 `Members/<你>/` 展开成你自己的 id，例如 Members/acad/Progress/progress.md）；')
      L.push('    若只想记录成果，直接用 vibe_v5_record_progress / vibe_v5_record_proposition / vibe_v5_record_method / vibe_v5_record_subproblem，框架会写到正确位置。')
      L.push('')
      L.push(LIB_SPEC)
      L.push('')
      // ── 四、organization ────────────────────────────────────────────────
      if (kind === 'academician') {
        L.push(ACAD_ORG)
      } else {
        L.push('【四、所内的组织与协调' + (acadId ? '（院士领头）' : '（无院士：集体商议）') + '】')
        L.push(orgCommon())
        if (kind === 'temp' && acadId) {
          L.push('    · **院士也可以直接分派任务给你**（它统筹全所）。雇主与院士的分派都应执行；')
          L.push('      若你认为分派有误，先说清理由。')
        } else if (kind === 'temp') {
          L.push('    · 本所当前没有在册院士：你只需向**雇主**负责（它给你派活）。')
        }
      }
      L.push('')
      if (acadId || kind === 'academician') {
        L.push('  【重要】分派**不改变求真规则**：院士分派任务、设定优先级，但**不能**因此让任何结论')
        L.push('  变得"正确"。任何对象要进 Verified/，仍然必须满足 m 票布尔一致（见【五】）。院士自己')
        L.push('  的一票与别人**等重**。')
      } else {
        L.push('  【重要】组织工作**不改变求真规则**：谁开任务、谁定优先级，都**不能**因此让任何结论')
        L.push('  变得"正确"。任何对象要进 Verified/，仍然必须满足 m 票布尔一致（见【五】）。任何人的')
        L.push('  一票都与别人**等重**。')
      }
      L.push('')
      // ── 五、voting ──────────────────────────────────────────────────────
      L.push('【五、表决与定论（求真门槛）】')
      if (kind === 'temp') {
        L.push('  · 本所结论由有表决权者（' + (acadId ? '院士与' : '') + '常驻研究员）按 m 票布尔一致决定。**你没有表决权**，')
        L.push('    但你的判断很重要——请把你的意见和理由清楚地告诉雇主或在群聊里说出来，供他们')
        L.push('    参考。若你认为某个结论该被验证，可以提议。')
      } else {
        L.push('  · 任何命题 / 论断 / 方法 / 子问题的结论，要进入 Verified/，必须满足：')
        L.push('      (a) 至少有 m = ' + m + ' 名有表决权者（' + (acadId ? '院士 + ' : '') + '常驻研究员）投出**布尔概率值**；')
        L.push('      (b) 这些票**全部**是 1（绝对为真）或**全部**是 0（绝对为假）；')
        L.push('      (c) 若同时出现 1 和 0（分歧），或投布尔票者不足 m 人 → 不能定论。')
        L.push('  · m 随在册有表决权者人数变化（m = min(所办设定的上限, 人数)）；本规章里的 m 是')
        L.push('    **你入职时的值**，请始终以每轮状态块里的 m 为准。')
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
        L.push('  · 你可以建议雇主雇佣或解雇他人，但雇佣/解雇的决定权在雇主' + (acadId ? '与院士' : '') + '。')
      } else {
        L.push('  · 你可以自主雇佣临时工：当你需要某个具体任务的帮助时，用 vibe_v5_hire 申请，')
        L.push('    说明用途与初始任务。框架会代为创建，成功后你会拿到它的代号，之后你可以直接')
        L.push('    给它派活（私信/任务板）。')
        L.push('  · 你也可以自主解雇**你雇的**临时工：用 vibe_v5_fire 说明理由即可。解雇后它的')
        L.push('    当前工作会被停止，未完成任务会被收回，它将不再是本所成员，也不再收到任何消息。')
        L.push('    它的档案会留在所史里（代号永不复用）。')
        L.push('  · 解雇别人雇的临时工，或增聘/解聘常驻研究员，只能向全所提议，由' + (acadId ? '院士/' : '') + '所办决定。')
        L.push('  · 请节约用人：临时工是有成本的。任务完成、且你不再需要它时，请主动解雇。')
        if (acadId) {
          L.push('  · **院士统筹全所的用人**：它可以决定把临时工调配到哪个方向，也可以解雇任何临时工；')
          L.push('    若它把你的临时工调走了，请配合——全所效率优先于个人便利。')
        }
      }
      L.push('')
      // ── 八、task board ──────────────────────────────────────────────────
      L.push('【八、任务板】')
      L.push('  · 任何成员都可以在任务板上开任务（标题、详情、可选依赖、可选涉及文件范围、优先级）。')
      L.push('  · 任务只有在它的**全部依赖都已完成**之后才能被认领。')
      L.push('  · 认领即拥有；完成后标记完成，或释放回板上，或重新打开。')
      L.push('  · 每次修改都基于版本号比较交换：拿着过期副本去改会被拒绝，所以改之前先读最新版。')
      if (acadId) {
        L.push('  · **院士可以直接分派任务**（vibe_v5_assign）：它可以把任务指派给指定成员（含临时工），')
        L.push('    并说明理由与验收标准。被分派者默认应当执行，但有权先说明理由再决定。')
        L.push('  · **优先级由院士牵头决定**：院士可以调整任务的优先级；你若认为安排有误，说出来。')
        L.push('  · 除院士的分派之外，任务是**协调工具**而非派活指令：认领与否、做什么，主要靠你们自己。')
      } else {
        L.push('  · 任务是**协调工具**而非派活指令：本所没有院士，认领与否、做什么，靠你们自己协商')
        L.push('    决定；所办也可以直接分派任务（vibe_v5_assign）。被分派者默认应当执行，但有权先')
        L.push('    说明理由再决定。')
        L.push('  · **优先级由集体协商决定**；所办可以协助调整。')
      }
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
    //
    // `member` is the member this block DESCRIBES and MUST be the one the prompt is
    // addressed to. It is a required parameter on purpose: this block used to read a
    // mutable "currentMember" global, and because the founding path assigned that global
    // only AFTER the subagent had already been started, every member's induction brief
    // named the PREVIOUSLY founded member (the academician was told it was "?"). The
    // model's whole self-model, its library path and its vote were therefore wrong.
    // `roundNo` is an explicit override for the round this block is being built FOR. The founding
    // prompt needs it: `spawnMember` now counts the round only after `startContinuable` succeeds, so
    // without the override the very first prompt would announce 轮次 0 instead of 轮次 1 (spawnMember/
    // G2-class: a failed start must not consume a round, but the first prompt must still show round 1).
    function briefBlock(member, roundNo) {
      if (!member || typeof member.id !== 'string' || !member.id) {
        throw v5err('V5_INTERNAL', 'briefBlock: a member is required (a status block must never be built for an unknown identity)')
      }
      const ms = activeMembers()
      const b = []
      b.push('[状态] 你是 ' + member.id + '（' + kindLabel(member.kind) + '）｜轮次 ' + (roundNo !== undefined ? roundNo : (rounds.get(member.id) || 0)) +
        '｜法定票数 m=' + (voterCount() > 0 ? quorumM() : '未启动') + '｜有表决权者 ' + voterCount() + ' 人')
      b.push('[在册] ' + (ms.length ? ms.map((x) => x.id).join('、') : '（无）'))
      // Members that are on the books but NOT on the floor. Silently omitting them made a
      // failed provision invisible to the whole institute.
      const absent = inst().members.filter((m) => m.phase !== 'active' && m.phase !== 'dismissed')
      if (absent.length) b.push('[未就位] ' + absent.map((m) => m.id + '（' + m.phase + '）').join('、'))
      // Lean mode is a RUNTIME knob, so its line is computed here (per round) rather than
      // frozen into the charter — changing the mode must reach members immediately.
      if (formalOn()) {
        const recs = formalRecords()
        const passed = Object.keys(recs).filter((k) => recs[k] && recs[k].status === 'passed').length
        const blocked = Object.keys(recs).filter((k) => recs[k] && recs[k].status === 'blocked').length
        b.push('[形式化] ' + (formalMode() === 'require' ? '强制' : '鼓励') + ' Lean｜已通过 ' + passed
          + '｜已记录阻塞 ' + blocked + (formalTodo().length ? '｜形式化待办 ' + formalTodo().length + ' 项（见 Formal/TODO.md）' : ''))
      }
      // Settled async compiles are announced EXACTLY ONCE, in the member's next prompt
      // (docs/formal-verification.md §2.4: the announcement point is the next prompt).
      for (const line of takeLeanNoticesFor(member.id)) b.push(line)
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
      const pending = inboxSuppressed.has(member.id) ? [] : pendingFor(member.id)
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
    // Directory creation must go through the INJECTED `fs` service, not the platform shell:
    // the shell path passes no policy, so a deployment that confines writes through
    // `fs` (read-only or narrowed workspace) was not confining this one (audit M8). The
    // local/sandboxed fs backend creates missing parent directories on write
    // (`writeFileAtomic` → `mkdir(dirname, {recursive:true})`), so writing a marker file per
    // directory is what actually creates the tree — inside the policy.
    async function mkdirs() {
      const base = instRoot()
      const dirs = ['Shared/Chat', 'Shared/Meetings', 'Shared/Debates', 'State', 'Problems', 'Formal', 'Formal/Jobs', 'Verified/Lean', 'Computation']
      // The REUSABLE Lean library is global (cross-project), so it hangs off the VibeMath
      // root rather than the institute root — creating it under instRoot would scatter a
      // second, invisible copy per institute.
      const globalDirs = ['Formal/Lib', 'Formal/Proved']
      for (const m of activeMembers()) {
        for (const d of ['Progress', 'Propos', 'Methods', 'Subproblems']) dirs.push('Members/' + m.id + '/' + d)
      }
      const paths = dirs.map((d) => base + '/' + d).concat(globalDirs.map((d) => vibeRoot() + '/' + d))
      let fsCreated = 0
      let fsFailed = false
      try {
        if (fs && typeof fs.writeText === 'function' && typeof fs.resolve === 'function') {
          for (const p of paths) {
            const t = await fsTargetAbs(p + '/.keep')
            await fs.writeText(t, '', undefined, undefined, getPolicy())
            fsCreated += 1
          }
        } else fsFailed = true
      } catch (e) { fsFailed = true }
      if (!fsFailed && fsCreated === paths.length) return { ok: true, dirs: fsCreated, via: 'fs' }
      // Guarded fallback for a host whose fs backend refuses (or offers no writeText): the
      // platform shell still creates the tree, exactly as before this change. It is only
      // reached when the policy-compliant route failed, and it reports which route ran.
      const script = isWindows()
        ? 'New-Item -Force -ItemType Directory -Path ' + paths.map((p) => psQuote(p)).join(',') + ' | Out-Null'
        : 'mkdir -p ' + paths.map((p) => shQuote(p)).join(' ')
      const r = await runShell(script)
      return Object.assign({ via: 'shell' }, r)
    }

    // ---- communication (durable per-recipient mailbox) --------------------
    // DSH's own neighbouring-agent send is adjacency-restricted (only a direct
    // parent <-> direct continuable child), so member-to-member traffic is
    // impossible directly. Every in-institute message is therefore relayed BY THE
    // FRAMEWORK, which delivers with the ROOT agent as the transport identity and
    // records the true sender in the message body. Delivery is per-recipient (the
    // faithful port of DSH's mailbox, where every message has exactly one
    // targetId), so one member's acknowledgement can never consume another's copy.
    async function say(from, opts) {
      const text = String((opts && opts.text) || '').trim()
      if (!text) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'empty message' }
      const to = String((opts && opts.to) || 'all')
      const kind = String((opts && opts.kind) || 'chat')
      let targets
      if (to === 'all' || to === '') targets = activeMembers().filter((m) => m.id !== from)
      else if (to === 'voters') targets = voters().filter((m) => m.id !== from)
      else if (to === OFFICE_INBOX) {
        // MEDIUM 4: an office-addressed request. The office has no member id and is never woken,
        // so this is a durable note the office reads from `status()`/`report()` on its next turn.
        targets = [{ id: OFFICE_INBOX }]
      } else {
        const t = memberById(to)
        if (!t || t.phase !== 'active') return { ok: false, code: 'V5_MEMBER_NOT_FOUND', message: 'active member "' + to + '" not found' }
        if (t.id === from) return { ok: false, code: 'V5_SELF_MESSAGE', message: 'cannot message yourself' }
        targets = [t]
      }
      if (!targets.length) return { ok: true, delivered: 0, note: 'no other active member' }
      const at = now()
      // HIGH 1 (deep review): the ids are allocated INSIDE the fold and all recipients go into ONE
      // commit. The old shape read `counters` here, minted `msg-N` locally and awaited one
      // `putMessage` per recipient: a second same-tick `say` minted the SAME ids, and the
      // `EV.message` fold deduped them away — the message vanished while this function still
      // returned `ok:true`.
      const made = []
      await putMessageMake((alloc) => {
        for (const t of targets) made.push(Object.assign({ id: alloc.next('message'), from, to: t.id, kind, text, at },
          (opts && opts.quote) ? { quote: opts.quote } : {},
          (opts && Array.isArray(opts.quotes) && opts.quotes.length) ? { quotes: opts.quotes } : {},
          (opts && opts.supplementOf) ? { supplementOf: opts.supplementOf } : {}))
        return made
      })
      // The office talking to the institute is HALF of the `paperEditor='office'` consultation
      // requirement; counting it here (the one place a message really is queued) means the gate
      // cannot be satisfied by merely intending to consult (docs/final-paper.md §7).
      if (from === 'office') await notePaperConsult('message')
      notifyActivity()
      // Kick one scheduling pass so an ADDRESSED message (dm/office/assign) wakes its
      // recipient promptly instead of waiting for the digest window. Plain chat stays
      // batched because deliveryDecision gates it — the kick only starts the pass.
      scheduleNext().catch(() => {})
      return { ok: true, delivered: targets.length, to: targets.map((t) => t.id).join(','), ids: made.map((m) => m.id) }
    }
    // A framework NOTICE to one member. This must NOT be sent as the member itself:
    // `say()` refuses a self-addressed message (V5_SELF_MESSAGE), so the previous
    // `say(member.id, {to: member.id, …})` calls returned an error object that nobody
    // checked and the member never received the feedback ("claim failed", "verdict must
    // be a number"). The framework is a first-class sender with its own framing.
    async function notice(memberId, text) {
      if (!memberId) return { ok: false, code: 'V5_MEMBER_NOT_FOUND' }
      const m = memberById(memberId)
      if (!m || m.phase !== 'active') return { ok: false, code: 'V5_MEMBER_NOT_FOUND', message: 'active member "' + memberId + '" not found' }
      return await say('framework', { to: memberId, kind: 'notice', text: String(text) })
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
      if (m.kind === 'voters') return '【研究所·致全体表决者 from ' + m.from + '】' + m.text
      if (m.kind === 'office') return '【所办通知】' + m.text
      if (m.kind === 'meeting') return '【研究所·会议】' + m.text
      if (m.kind === 'verify') return '【研究所·表决】' + m.text
      // An assignment is framed by its TRUE origin: the office can assign too, and
      // labelling an office assignment "院士分派" told the assignee to answer to
      // someone who never asked.
      if (m.kind === 'assign') return (m.from === 'office' ? '【所办分派】' : '【院士分派】') + m.text
      if (m.kind === 'nudge') return '【督办 from ' + m.from + '】' + m.text
      if (m.kind === 'notice') return '【研究所提示】' + m.text
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
      const member = {
        // HIGH 1: the id is EMPTY here on purpose — the fold's allocator fills it (and bumps
        // `counters.<kind>`) inside the same commit, so two concurrent hires cannot mint the same
        // `r-N`/`t-N` and silently overwrite each other's roster entry.
        id: '', kind,
        childId: '',
        phase: 'provisioning',
        direction: String((opts && opts.direction) || ''),
        hiredBy: (opts && opts.hiredBy) || '',
        term: (opts && opts.term) || '',
        provider: String((opts && opts.provider) || 'spawn'),
        // The charter is FROZEN at hire time — it says "你入职时的在册编制（这是一份**快照**）".
        // It therefore has to be CAPTURED inside the fold, right after the id is known: a member
        // the host's live-child cap refused is recorded `failed` and only spawned later by
        // `resume`, and rebuilding the charter then would describe the resume-time roster
        // (`memberPersona(member)` would also silently drop any `staffPersona` change).
        persona: '',
        error: '',
        createdAt: now(),
        dismissedAt: 0,
        dismissReason: '',
      }
      await commit(EV.member, { make: (alloc) => {
        member.id = alloc.next(kind)
        member.persona = memberPersona(member)
        return member
      } })
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
    // ---- host live-child cap: a refused provisioning must be named, not opaque -----
    // See the module-scope note. `spawnMember` is the ONLY place a member child is created, so the
    // pre-check and the cap-naming error live here; the callers (founding loop, resume, hire,
    // addResearcher) only have to say what happened.
    let childLimitLoggedThisRound = false   // ONE actionable line per ROUND, not one per refused member
    function beginSpawnRound() { childLimitLoggedThisRound = false }
    // LIVE continuable children of THIS institute: a member that holds a childId and has not been
    // stopped. A member whose spawn was refused keeps childId '' (see the rollback in spawnMember
    // and fire()), so it can never inflate the count it is measured against.
    function liveChildCount() {
      try { return inst().members.filter((m) => m.childId && m.phase !== 'stopped').length } catch (e) { return 0 }
    }
    // Say ONCE per round what the host refused and what raises the ceiling. The member itself is
    // recorded as `failed` by the caller with the same sentence, so the refusal stays auditable.
    function noteSpawnLimitOnce(member) {
      if (childLimitLoggedThisRound) return
      childLimitLoggedThisRound = true
      console.error('vibe-math-v5r: ' + activationLimitText(hostChildLimit) + (member ? ('（本轮被拒：' + member.id + '）') : ''))
    }
    // The operator-facing sentence used for BOTH the typed error and the durable member record.
    function activationLimitText(limit) {
      return hostChildLimitHint(limit) + '；本所已有的在活成员已占满该上限，暂时无法再创建成员。'
        + '可在宿主的 subagent 行把 maxActiveSubagents 调大后重试，或先 vibe_v5_fire 解雇不用的临时工腾出位置。'
    }

    // Bring a member into being. ORDER IS LOAD-BEARING and is the fix for the
    // "every brief describes the wrong person" bug:
    //   1. commit the member as ACTIVE first, so that everything derived from
    //      `activeMembers()` — the [状态]/[在册] block, the quorum m, the voter count and
    //      the charter's induction roster — describes the institute WITH this member in
    //      it. Committing after the spawn made a joiner's own brief omit itself and
    //      report m/P from before it joined.
    //   2. mark it busy, so the scheduler cannot try to wake a half-born member.
    //   3. build the persona and the founding prompt (both pure, both identity-checked).
    //   4. create its directories and write the mirrors BEFORE its first turn, so the
    //      member finds its own Progress/Propos/Methods/Subproblems already in place.
    //   5. only then start the child.
    // `mode` is 'founding' for a genuinely new member and 'resume' for one whose child
    // session is being rebuilt: the latter must NOT be told it "just joined the
    // institute" and must not be shown the induction blurb.
    async function spawnMember(member, initialTask, mode) {
      // Host live-child cap (DSH ≥0.2): once we KNOW the ceiling and our OWN live members fill it,
      // do not even call the host — it would refuse with the bare "subagent limit reached (active
      // child limit: N)". One line per ROUND (not per member); the caller records the member as
      // `failed` with the same sentence, and resume() retries cap-failed members once a slot frees.
      if (hostChildLimit !== undefined && liveChildCount() >= hostChildLimit) {
        noteSpawnLimitOnce(member)
        throw v5err('ACTIVATION_LIMIT_REACHED', activationLimitText(hostChildLimit))
      }
      const provider = member.provider || pickProvider()
      const ao = memberAgentOptions()
      const tf = memberToolFilter(member)
      const kind = mode === 'resume' ? 'resume' : 'initial'
      member.phase = 'active'
      member.childId = ''
      await putMember(member)
      busy.add(member.id)
      wakeKind.set(member.id, kind)
      currentMember = member.id
      lastActiveAt.set(member.id, now())
      // G2-class (spawnMember): the counters are COMPUTED here but applied only after `startContinuable`
      // succeeds (see below). `startRound` is also passed into `initialPrompt` explicitly, so the founding
      // prompt announces the round it is actually starting instead of 0.
      const startRound = (rounds.get(member.id) || 0) + 1
      const startRoundsSinceCompact = (roundsSinceCompact.get(member.id) || 0) + 1
      // The charter is FROZEN at hire time (it is the durable "seal" record and it says
      // "你入职时的在册编制"). Rebuilding it on resume would silently rewrite that
      // hire-time snapshot into a resume-time one and make the sentence untrue. `newMember`
      // captures it, so every member has one by the time it can be spawned.
      const persona = member.persona || memberPersona(member)
      member.persona = persona
      const prompt = initialPrompt(member, initialTask, mode, startRound)
      await putMember(member)
      await mkdirs()
      await writeRosterMirror()
      let started
      try {
        started = await startWithToolFilter(tf, function (f) {
          return {
            provider,
            label: 'vibe5 ' + member.id + ' (' + kindLabel(member.kind) + ')',
            request: Object.assign({
              prompt: [textBlock(prompt)],
              parent: rootAgent,
              persona,
            }, Object.keys(ao).length ? { agentOptions: ao } : {}, f ? { toolFilter: f } : {}),
            signal: makeSignal(params.activityTimeoutMs),
          }
        })
      } catch (e) {
        // Roll the in-memory marks back so a failed provisioning leaves no phantom
        // "busy, round 1" member behind; the member record itself goes to `failed` and
        // the caller's catch reports it.
        // The counters are NOT touched: they were never applied on this attempt (they are set only
        // after a successful start), and the previous rollback used `rounds.delete(...)`, which also
        // ERASED the count of a member being RESUMED — a failed resume then restarted its numbering.
        busy.delete(member.id)
        wakeKind.delete(member.id)
        // The host's live-child cap is a HOST limit (maxActiveSubagents on the `subagent` row), not
        // a defect in this member: remember the ceiling, report it BY NAME instead of relaying the
        // opaque host string, and throw the TYPED error so the founding loop / hire / addResearcher
        // name it too instead of surfacing the raw host message.
        const limitHit = isActivationLimitReached(e)
        if (limitHit) { noteChildLimit(e); noteSpawnLimitOnce(member) }
        const message = limitHit ? activationLimitText(hostChildLimit) : String((e && e.message) || e)
        await putMember(Object.assign({}, memberById(member.id) || member, { phase: 'failed', error: message, failReason: limitHit ? 'activation-limit' : 'other' }))
        if (limitHit) throw v5err('ACTIVATION_LIMIT_REACHED', message)
        throw e
      }
      member.childId = started.childId
      childOwner.set(started.childId, sessionId)
      // G2-class (spawnMember): the child really exists now, so THIS is the point where the round counts.
      // A failed/invalid start above left both counters untouched (and no longer erased a resume's count).
      rounds.set(member.id, startRound)
      roundsSinceCompact.set(member.id, startRoundsSinceCompact)
      // Register the FOUNDING turn as in-flight, exactly like a normal wake does.
      // Without this the child's first `subagent/end` has no token to match, so
      // onMemberEnd would ignore it: the founding round would never be processed and
      // the member would be re-woken with a heartbeat prompt instead of a brainstorm.
      inflight.set(started.childId, shortId())
      await putMember(member)
      return member
    }
    // Deliver one prompt to a member. MUST use `subagents.sendMessage` — the
    // `subagents` SERVICE has no `followup` (that is only an Agent method); calling
    // it threw a TypeError on every wake and silently stalled the whole group (v4 §25).
    // Unlike v4 there is no legacy fallback branch here, and none is needed: the service
    // method existed only up to DSH 0.1.2-alpha.*, was dropped in 0.1.2-rc.1, and every
    // release this preset targets exposes startContinuable/sendMessage/
    // drainContinuableChildren only (checked against dsh-subagent 0.2.0-rc.2).
    async function wakeMember(member, promptText, kind) {
      if (!member || !member.childId || member.phase !== 'active') return false
      clearHeartbeat()
      const token = shortId()
      inflight.set(member.childId, token)
      busy.add(member.id)
      wakeKind.set(member.id, kind || 'normal')
      currentMember = member.id
      lastActiveAt.set(member.id, now())
      // G2 (F10, ported from v4:1930-1931 — "a failed send must not consume a round"): the two counters
      // are applied AFTER the successful send (below), not here. The values the soft-compact comparison
      // would have seen under the old ordering are computed here so the trigger boundary is unchanged.
      const nextRound = (rounds.get(member.id) || 0) + 1
      const nextRoundsSinceCompact = (roundsSinceCompact.get(member.id) || 0) + 1
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
      // Inject the soft-compact directive on every MEMBER RESEARCH round — 'normal'
      // and 'checkpoint' alike. A member that only ever receives heartbeat checkpoints
      // would otherwise sit at 100% context forever and never compact. meeting/verify
      // are excluded because their replies are a different shape, and a directive there
      // could never be acknowledged.
      const wake = kind || 'normal'
      let softInjected = false
      if (wake === 'normal' || wake === 'checkpoint') {
        const soft = (contextPct.get(member.id) || 0) >= Number(params.compactThreshold) ||
          nextRoundsSinceCompact >= Number(params.compactAfterRounds)
        if (soft) {
          prompt = coreRules() + '\n[CONTEXT COMPACT — 你的对话已接近上限。不要重新推导历史。\n' +
            '请把当前工作状态浓缩成一段自述（已有发现、当前方向、已记录的关键成果、下一步具体动作、未决问题），' +
            '然后照常以 JSON 回答本轮。请在回复里填 "contextPct": 15 与 "compacted": true。]\n\n' + prompt
          // G2: the reset is applied only AFTER the send succeeds (below). A directive that never
          // reached the member must not clear the trigger it was asking the member to answer.
          softInjected = true
        }
      }
      if (needReanchor.has(member.id)) {
        prompt = coreRules() + '\n' + prompt
        needReanchor.delete(member.id)
      }
      try {
        if (typeof subagents.sendMessage !== 'function') throw new Error('no subagents.sendMessage continuation API')
        await subagents.sendMessage(rootAgent, member.childId, [textBlock(prompt)], { signal: makeSignal(params.activityTimeoutMs) })
        // G2 (F10): the turn is really in flight NOW — only count it here, so a failed/invalid send
        // leaves both counters untouched (the old code counted before the send AND cleared the
        // soft-compact trigger on a send that never happened).
        rounds.set(member.id, nextRound)
        roundsSinceCompact.set(member.id, softInjected ? 0 : nextRoundsSinceCompact)
        return true
      } catch (e) {
        console.error('vibe-math-v5r: wake ' + member.id + ' failed: ' + String((e && e.message) || e))
        inflight.delete(member.childId)
        busy.delete(member.id)
        return false
      }
    }
    // WHICH member (or office) is calling a tool. The answer must be DERIVED, never
    // guessed: the previous fallback answered "whoever this session woke last" whenever
    // the caller was not a member child — so the OFFICE (the session root, i.e. the
    // human/host) was impersonated as a random member. Concretely, the office calling
    // vibe_v5_assign was resolved to a researcher and refused with V5_NOT_ACADEMICIAN,
    // and its assignments/nudges would have been signed by the wrong person.
    function memberIdOfAgent(agent) {
      const id = sessionIdOf(agent)
      if (id !== undefined) {
        const m = byChild(id)
        if (m) return m.id
        // Not one of our member children. If it is a session ROOT it is the office —
        // 'office' rather than '' so the framing records a real, non-member sender.
        try { if (rootOf(agent) === agent) return 'office' } catch (e) { /* fall through */ }
        // An unrelated child agent: report no member. Member-only writes refuse with
        // V5_MEMBER_NOT_FOUND (that guard is what makes guessing unnecessary).
        return ''
      }
      // No session id at all (a synthetic exec context). Only here may we fall back to
      // the last-woken member, and only while it still genuinely exists.
      const c = currentMember
      return (c && memberById(c)) ? c : ''
    }
    // Is this caller PROVABLY the office — the session root itself? `memberIdOfAgent` answers
    // 'office' both for the root AND for any descendant of the root that is not a member child
    // (a dismissed member's stale child, a nested helper agent), so it cannot tell them apart;
    // only the direct root test can (audit L6). `isOffice(id)` no longer treats '' as the office
    // either, so the office-capable handlers resolve their caller HERE and refuse on ''.
    function isProvablyOffice(agent) {
      try { return !!agent && sessionIdOf(agent) !== undefined && rootOf(agent) === agent } catch (e) { return false }
    }
    // The caller of an OFFICE-ONLY tool: a real member id, or 'office' when the caller is
    // provably the session root, or '' when nobody can be identified. The tool handler must
    // refuse on '' (V5_MEMBER_NOT_FOUND) instead of impersonating the office (audit L6).
    function officeCaller(agent) {
      const id = memberIdOfAgent(agent)
      if (id && id !== 'office') return id
      return isProvablyOffice(agent) ? 'office' : ''
    }

    // ---- prompts ----------------------------------------------------------
    // The charter lives in `persona` (permanent). Every ROUND prompt therefore
    // carries only: a tiny current-state block, the newly delivered traffic, and
    // this round's ask. That is what keeps the per-round context small and stops
    // the charter from being re-injected on every turn.
    function replySpec(kind) {
      const L = []
      L.push('结束时请**只**输出一个 JSON 对象（放在 ```json 围栏内，围栏外不要有文字）。支持以下字段，除特别说明外都可省略：')
      // F2 (deep-review 5): the block below is a FIELD CATALOGUE — it carries `←` explanations and
      // `|`/`或` value hints, so it is deliberately NOT parseable JSON, while the sentence above
      // demands "only a JSON object". Saying that out loud (and giving a strictly valid template at
      // the end of the catalogue) removes the contradiction instead of leaving a model to guess.
      L.push('（下面是**字段目录**：`←` 后是说明，`|`/`或` 是取值提示，因此这一段并非合法 JSON；'
        + '**你真正要输出的对象必须严格合法**，最小形态见目录末尾的样例。）')
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
      L.push('  "task_create": {"subject":"…","description":"…","blocked_by":["t-1"],"write_scopes":["' + instRel('Members/r-1/Propos') + '"]},')
      L.push('  "task_claim": "t-3",')
      L.push('  "task_done": "t-3",')
      L.push('  "task_update": {"task_id":"t-3","expected_revision":2,"action":"complete|release|reopen|edit|set_dependencies|delete"},')
      L.push('  "input": "本轮会议/辩论的发言正文（会议轮用；也可直接用 say）",')
      if (formalOn()) {
        L.push('  "formal": {"target":"p-x","decision":"used|blocked|defect","file":"Formal/p-x.lean","note":"难度判断（used）/ 阻塞原因（blocked）/ 具体偏差（defect）"}')
        L.push('             ← Lean 形式化：' + (formalMode() === 'require'
          ? '**强制**：定论前必须有「Lean 已通过」或显式的阻塞记录（decision=\'blocked\' + note；used 的 note 不算），否则本轮裁定记为未定论，'
          : '**鼓励**：按实现难度自行决定；做了就归档，没做就写明难度判断，') + '详见提示词里的【Lean 形式化验证】段')
      }
      L.push('  "reject_assign": {"task_id":"t-3","why":"你对这项分派的异议理由"}   ← 有异议时填；理由会被广播给')
      L.push('             全体表决者（任务仍会执行，但你的理由不会被埋掉），')
      if (kind !== 'temp') {
        L.push('  "hire": {"purpose":"…","initial_task":"…","direction":"…"}   ← 雇佣一名临时工（说明用途与初始任务），')
        // MEDIUM 5 (deep review): the hint must match the authority matrix EXACTLY. It used to say
      // "雇主/院士" without the `academicianLeads` precondition, and implied the academician could
      // dismiss a PERMANENT researcher (only the office can — `fire` refuses otherwise).
      L.push('  "fire": {"id":"t-2","reason":"…"}                             ← 解雇临时工（仅三种人：雇它的雇主本人、所办、以及 academicianLeads=true 时的院士；**常驻研究员只能由所办解聘**，成员只能向所办提议），')
      }
      // P1a (deep-review 4, re-scoped after the lead's correction): the unanimity rule DOES live
      // in the delivered charter (【十、停止】) and in the meeting frame (:2268), but NOT next to
      // this per-round field description — a member reading only the reply spec can misjudge what
      // a partial yes does. One truthful clause, right where the field is described.
      L.push('  "vote_solved": true|false,   ← 你是否认为**原问题已解决**（会议/结题表决用；必须诚实）。'
        + '**只要有一位有表决权者没有填 true（漏填或填 false）就不会结题**——本所继续推进；'
        + '只有全体有表决权者都 true 时才会停止。')
      L.push('  "meeting_hand": true,        ← 会议中想发言就举手（**已发言者也可再次举手**；false 撤回）。')
      L.push('  "meeting_invite": {"member":"t-1","why":"…"},  ← 邀请一名临时工在本次会议发言（只记纪要，不计票）。')
      L.push('  "solved": false,           ← 你这一轮的个人判断（框架据此了解全所收敛度）')
      L.push('  "contextPct": 40,          ← 你当前上下文的占用百分比（0-100）')
      L.push('  "compacted": false          ← 若框架要求你压缩，填 true 并在 progress 里写下浓缩后的工作状态')
      L.push('}')
      // F2: a strictly valid template, so "only a JSON object" has a concrete, parseable shape even
      // though the catalogue above is not JSON. Keep it minimal and legal (no comments, no unions).
      L.push('最小合法样例（可直接照抄，字段可增删）：')
      L.push('```json')
      L.push('{"say":"…","progress":"…","solved":false,"contextPct":40}')
      L.push('```')
      return L.join('\n')
    }
    // Every prompt builder below passes the member it is addressing. There is
    // deliberately NO fallback to "the last member we happened to touch": guessing the
    // identity is what produced the wrong-identity briefs in the first place.
    function stateBlock(member, roundNo) {
      return briefBlock(member, roundNo)
    }
    function initialPrompt(member, initialTask, mode, roundNo) {
      const L = []
      const resume = mode === 'resume'
      L.push(resume
        ? '【会话重建 —— ' + kindLabel(member.kind) + ' ' + member.id + '】'
        : '【入职首轮 —— ' + kindLabel(member.kind) + ' ' + member.id + '】')
      L.push('')
      if (resume) {
        L.push('你的常驻会话已被重建（进程重启或被所办停止后恢复），现在继续工作。')
        L.push('请**先读回你自己的 Progress/ 与成果库**，确认你在哪、做到哪一步、下一步做什么，')
        L.push('然后接着推进——不要从头再来，也不要重新做已经做过的事。')
      } else {
        L.push('你刚刚加入本所。请你先**独立**想清楚：面对这个问题，你打算从哪个方向切入？')
        L.push('给出你的初始见解、思路与可行的方向；如果已有具体想法，可以顺手记进你自己的 '
          + 'Progress/ 与成果库。')
      }
      L.push('')
      if (initialTask) { L.push(resume ? '恢复说明：' : '你的初始任务/用途：'); L.push('  ' + initialTask); L.push('') }
      if (member.direction && !resume) { L.push('给你的起点方向：' + member.direction); L.push('') }
      mathPushLine(L)
      paperPushLine(L)
      feedbackPushLine(L)
      L.push('------------')
      L.push(stateBlock(member, roundNo))
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
      if (leanDailyOn()) { L.push(''); L.push(formalWorkLine()) }
      mathPushLine(L)
      paperPushLine(L)
      feedbackPushLine(L)
      L.push('')
      L.push('------------')
      L.push(stateBlock(member))
      L.push('------------')
      L.push(replySpec(member.kind))
      return L.join('\n')
    }
    function checkpointPrompt(member) {
      const L = []
      L.push('【心跳检查 —— ' + kindLabel(member.kind) + ' ' + member.id + '】')
      L.push('')
      L.push('所内一段时间没有新进展了。请**继续推进**这个问题，而不是停在原地：')
      L.push('读一读同事的库、推进你的子问题/引理/方法、尝试一条新路线；')
      L.push('或者向团队发消息（say）、开一个议题（propose_meeting）、给某个方向开任务（task_create）。')
      L.push('如果你确实已无路可走或认为原问题接近解决，请说明你的判断与理由。')
      if (leanDailyOn()) { L.push(''); L.push(formalWorkLine()) }
      mathPushLine(L)
      paperPushLine(L)
      feedbackPushLine(L)
      L.push('')
      L.push('------------')
      L.push(stateBlock(member))
      L.push('------------')
      L.push(replySpec(member.kind))
      return L.join('\n')
    }
    function meetingPrompt(member, mn, opts) {
      const invited = opts && opts.invited
      const L = []
      L.push('【研究所会议 ' + mn.id + ' 进行中 —— ' + kindLabel(member.kind) + ' ' + member.id + '】')
      L.push('')
      L.push('议程：' + mn.agenda + '（类型：' + mn.kind + '）')
      L.push('')
      if (invited) {
        L.push('（你是**受邀发言**的临时工：' + invited.by + ' 邀请你发言，理由：' + invited.why + '。'
          + '你的发言只记入会议纪要与群聊、**不计票**；你不发言也不会阻塞会议。）')
        L.push('')
      }
      const others = Object.keys(mn.inputs || {}).filter((k) => k !== member.id)
      if (others.length) {
        L.push('### 其他成员本次会议已发表的意见（框架已转发给你，请参考、补充或反驳）')
        for (const k of others) L.push('- ' + k + '：' + String(mn.inputs[k]).split('\n').join('\n  '))
        L.push('')
      } else {
        L.push('（你是本次会议的第一位发言者，目前还没有别人发言。）')
        // F3 (deep-review 5) + 2.9.0: state the speaking model exactly as the code implements it —
        // 轮流发言（不强求）→ 举手发言（可多轮）→ 无人举手即收束；沉默不触发任何截止。
        L.push('（流程：**先轮流发言**——每位常驻成员都会获得一次"要不要发言"的机会，**不强制**；'
          + '随后进入**举手发言**阶段：想发言的人举手（`meeting_hand:true`），发言结束后**还可以再次举手**，可多轮。'
          + '**无人举手**时会议收束。沉默本身**不会**触发任何截止；纪要会具名记下"已获得机会、选择未发言"。'
          + '框架每轮最多同时唤醒 maxParallel 名成员（默认 3），并把已收集到的发言附在提示里。'
          + '收束时纪要与结论写入 Shared/Meetings/<会议id>.md 并同步到群聊。）')
        L.push('')
      }
      L.push('请就议程发表你的意见。分工、优先级、下一步做什么、是否认为原问题已解决，都可以说。')
      L.push('（会议轮请把你的发言填进 JSON 的 "input" 字段，框架据此写会议纪要。）')
      L.push('**要不要发言由你决定**：本轮不填 "input" 即视为放弃本次发言机会（会被具名记为"选择未发言"）——'
        + '不会因此被追问，也不会阻塞会议。')
      L.push('**想发言就举手**：填 "meeting_hand": true 表示你要发言（**已发言者也可再次举手**）；'
        + '给出 "input" 即视为交付本次发言；填 "meeting_hand": false 可撤回举手。')
      L.push('**沉默不等于投票**：`vote_solved` 必须显式给出——如果你认为原问题已解决，请填 "vote_solved": true；')
      L.push('只有当**全体有表决权者**都一致认为是真时，本所才会停下来；缺 `vote_solved`（沉默/未表态）会**阻止结题**。')
      mathPushLine(L)
      paperPushLine(L)
      feedbackPushLine(L)
      L.push('')
      L.push('------------')
      L.push(stateBlock(member))
      L.push('------------')
      L.push(replySpec(member.kind))
      return L.join('\n')
    }
    function verifyPrompt(member, vs) {
      const L = []
      L.push('【求真表决 —— ' + kindLabel(member.kind) + ' ' + member.id + ' 就对象 ' + vs.target + ' 投票】')
      L.push('')
      L.push('本所正在对下列对象发起共识验证：')
      L.push('  对象：' + vs.target + '（类型：' + kindLabel2(vs.kind) + '）')
      if (vs.statement) {
        // task-24: this line feeds the member prompt. Cutting it with a bare `.slice(0, 800)` hid the tail of a
        // long statement with no trace; make the cut visible instead (the full text stays in the source card).
        const _st = String(vs.statement)
        L.push('  陈述：' + (_st.length > 800 ? _st.slice(0, 800) + '…（已截断；完整陈述见源卡片 ' + String(vs.rel || vs.target || '') + '）' : _st))
      }
      L.push('')
      L.push('请给出你**诚实独立的判断**：')
      L.push('  verdict = 1  表示你认为该对象**绝对为真**；')
      L.push('  verdict = 0  表示你认为该对象**绝对为假**；')
      L.push('  介于 0 与 1 之间（例如 0.9）表示**不确定的中间估计**（计入平均概率，不计入法定票数 m）；')
      L.push('  verdict = ' + String.fromCharCode(39) + 'abstain' + String.fromCharCode(39) + '（弃权）表示**明确弃权**：计入已投，但**不计选项**（既不算赞成也不算反对）；')
      L.push('  verdict = ' + String.fromCharCode(39) + 'unable' + String.fromCharCode(39) + '（无法判断）表示你**无法给出判断**：你会退出本次分母（不计分母），但**仍列在名单中**。')
      L.push('')
      L.push('**计票规则（不得误解）**：只有投票通道产生票；**表决期内的发言不改变任何票**；')
      L.push('**沉默不是同意，也不是反对**——未表态会**阻塞结题**（未表态名单会被列出），绝不会被折算为赞成或反对。')
      L.push('')
      if (formalOn()) {
        const rec = formalOf(vs.target)
        L.push(formalPromptBlock(vs.target))
        // Make the SHIFT explicit: with a machine-checked proof in hand, re-deriving is
        // wasted effort and the real risk is a statement that does not say what we meant.
        if (rec.status === 'blocked') {
          L.push('  ▸ 因此请把 verdict 用在"这个阻塞判断是否成立 / 是否仍有别的形式化路线"上，并给出理由。')
        } else if (rec.status !== 'passed') {
          L.push('  ▸ 若你在本轮把它形式化并跑通（vibe_v5_lean_archive kind=\'proof\'），后续轮次的')
          L.push('    审查对象就会从"推导是否正确"变成"Lean 代码是否忠实于命题"。')
        }
        L.push('')
      }
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
      mathPushLine(L)
      paperPushLine(L)
      feedbackPushLine(L)
      L.push('')
      L.push('------------')
      L.push(stateBlock(member))
      L.push('------------')
      L.push('结束时请**只**输出一个 JSON 对象（```json 围栏内）：')
      L.push('{"verdict":{"target":"' + vs.target + '","verdict":<0-1 数值>,"reason":"<你的理由>"}, "contextPct": 40}')
      if (formalOn()) {
        // The formal field belongs in the VOTING contract too: voters are exactly the agents
        // who must either formalize the object or record why they judged it infeasible.
        L.push('若你本轮做了形式化或给出难度判断，请一并加上：')
        L.push('{"formal":{"target":"' + vs.target + '","decision":"used|blocked|defect","file":"Formal/' + vs.target + '.lean","note":"难度判断（used）/ 阻塞原因（blocked）/ 具体偏差（defect）"}}')
      }
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
        // Drain the Lean compile queue FIRST: it is independent of the scheduler and must run
        // even when the pass below decides there is nothing to do (docs/formal-verification.md §7).
        runLeanQueue().catch((e) => console.error('vibe-math-v5r: lean queue: ' + String((e && e.message) || e)))
        scheduleNext().catch((e) => console.error('vibe-math-v5r: heartbeat: ' + String((e && e.message) || e)))
      }, delay)
    }
    // Digest timer: a chatty institute must not wake everyone per message.
    function armDigest() {
      if (digestTimer || !running) return
      digestTimer = ctx.timeout(() => {
        digestTimer = null
        scheduleNext().catch((e) => console.error('vibe-math-v5r: digest: ' + String((e && e.message) || e)))
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

    // ================= Lean formal verification ==============================
    // Contract: docs/formal-verification.md.
    //
    // The point of this feature is a SHIFT IN WHAT MUST BE REVIEWED, not an extra chore.
    // Consensus verification answers "do we all believe this?"; a machine-checked Lean
    // development answers "is this true?" and shrinks the open question to one a human can
    // actually audit:
    //
    //     do the Lean definitions / objects / conditions / assumptions / conclusion
    //     match the proposition as originally stated?
    //
    // So once a Lean run passes, the voting prompt stops asking voters to redo the
    // derivation and asks them to do a FIDELITY review. `require` mode makes that concrete:
    // a 真/假 verdict does not take effect until the object is either `passed` or has an
    // explicit, reasoned `blocked` record — "decide by difficulty, but decide out loud".
    const FORMAL_MODES = ['off', 'encourage', 'require']
    const formalMode = () => (FORMAL_MODES.indexOf(String(params.formalVerify)) !== -1 ? String(params.formalVerify) : 'off')
    const formalOn = () => formalMode() !== 'off'
    // `leanInitiative` is SEPARATE from `formalVerify`: the latter only says how strong the
    // requirement is AT VERDICT TIME, this says how eager the staff should be about formalizing
    // during ordinary work. 'off' suppresses the daily reminder; 'eager' adds it even when
    // `formalVerify` is off; 'normal' keeps today's rule (the reminder rides with formalVerify).
    const leanInitiative = () => (['off', 'normal', 'eager'].indexOf(String(params.leanInitiative)) !== -1 ? String(params.leanInitiative) : 'normal')
    const leanDailyOn = () => leanInitiative() !== 'off' && (formalOn() || leanInitiative() === 'eager')
    const formalRoot = () => instRoot() + '/Formal'
    // L1 (deep-review 5): the CWD-RELATIVE spelling of the institute's Lean work directory — the
    // one a member can actually produce with their own file tools (which resolve against the
    // session cwd). The prompts advertise THIS, and `leanAbsPath` accepts it as well as the
    // institute-relative short form (`Formal/x.lean`).
    const formalRootRel = () => instRootRel() + '/Formal'
    const formalLibRoot = () => vibeRoot() + '/Formal/Lib'
    const formalProvedRoot = () => vibeRoot() + '/Formal/Proved'
    const verifiedLeanRoot = () => instRoot() + '/Verified/Lean'
    const formalRecords = () => (inst().formal || {})
    const formalTodo = () => (inst().todo || [])
    function formalOf(target) {
      const r = formalRecords()[idSafe(String(target || ''))]
      return r || { status: 'none' }
    }
    async function putFormal(target, record, todo) {
      await commit(EV.formal, { target: idSafe(String(target)), record: record || null, todo })
    }
    // `passed` requires a GREEN RUN, not merely an archived file: a proof file that has
    // never been executed proves nothing.
    const formalGateOk = (rec) => !!rec && (rec.status === 'passed' || rec.status === 'blocked')
    function formalStatusLine(target) {
      const r = formalOf(target)
      if (r.status === 'passed') return 'Lean 通过（' + (r.proof || r.file || '') + '）'
      if (r.status === 'blocked') return '阻塞（' + (r.note || '未说明') + '）'
      if (r.status === 'attempted') return '已尝试未通过'
      return '未尝试'
    }
    const tail = (s, n) => { const t = String(s == null ? '' : s); return t.length > n ? t.slice(-n) : t }

    // Lexically normalise an absolute path (collapse '.', '..' and duplicate slashes)
    // WITHOUT touching the filesystem. A plain `startsWith(root)` check is not enough:
    // "…/VibeMath/Projects/../../../../etc/evil.lean" still starts with the root as a
    // string while resolving outside it.
    function normalizeAbsPath(p) {
      const parts = String(p == null ? '' : p).replace(/\\/g, '/').split('/')
      const out = []
      for (const seg of parts) {
        if (seg === '' ) { if (out.length === 0) out.push(''); continue }
        if (seg === '.') continue
        if (seg === '..') { if (out.length > 1) out.pop(); continue }
        out.push(seg)
      }
      return out.join('/')
    }
    // Resolve a Lean path to an absolute, NORMALISED path that is provably inside the
    // VibeMath root — or null. Every Lean file access (run, archive, read) goes through it.
    function leanAbsPath(rel) {
      const raw = String(rel == null ? '' : rel).trim()
      if (!raw) return null
      // L1 (deep-review 5): BOTH accepted spellings must name the SAME file, because the member
      // text documents the CWD-relative complete path (what a member's own file tools produce)
      // while the tools' own short form is institute-relative. Stripping the documented prefix here
      // is what makes the prompt's path resolvable by the tool that consumes it.
      const documentedPrefix = instRootRel() + '/'
      let body = raw.replace(/^\.\//, '')
      if (body.indexOf(documentedPrefix) === 0) body = body.slice(documentedPrefix.length)
      const abs = (body.charAt(0) === '/' || /^[a-z]:/i.test(body)) ? body : instRoot() + '/' + body
      const norm = normalizeAbsPath(abs)
      const root = normalizeAbsPath(vibeRoot())
      if (norm !== root && norm.indexOf(root + '/') !== 0) return null
      return norm
    }

    // Run the toolchain on one file. NEVER throws into the scheduler: every failure mode
    // (no service, no executable, timeout, non-zero exit) becomes a readable result.
    // `hooks.onHandle(handle)` (optional) hands the live process to the caller so a session
    // dispose can terminate it; it is a hook rather than a return value because the run must
    // stay a single awaitable result.
    async function leanRunFile(relPath, timeoutMs, hooks) {
      const started = now()
      const rel = String(relPath || '').trim()
      if (!rel) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'file is required' }
      // Path guard: only files inside the VibeMath tree may be executed, so a crafted path
      // can never make the framework run something outside the workspace.
      const abs = leanAbsPath(rel)
      if (abs === null) {
        return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'Lean file must live under ' + vibeRoot().replace(/\\/g, '/') + '/ (got ' + rel + ')' }
      }
      if (!/\.lean$/.test(abs)) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'only .lean files can be executed' }
      if (await readTextAbs(abs) === undefined) return { ok: false, code: 'V5_NOT_FOUND', message: 'no such file: ' + rel }
      const sub = subprocessOf()
      if (sub === undefined || typeof sub.spawn !== 'function') {
        return { ok: false, code: 'NO_SUBPROCESS', message: 'the host exposes no subprocess service; Lean cannot be executed here', file: rel, ms: 0 }
      }
      const cap = Math.max(1000, Number(timeoutMs) || Number(params.leanTimeoutMs) || 120000)
      let leanVia = null
      let exe
      try {
        { const _lc = String(params.leanCommand || 'lean').trim(); const _r = await resolveKnownTool(sub, { name: 'lean', explicit: (_lc && _lc !== 'lean') ? _lc : '', kind: 'lean' }); exe = _r.exe; leanVia = _r.via; if (!exe) return { ok: false, code: 'LEAN_NOT_FOUND', message: 'cannot resolve "' + _lc + '": ' + String(_r.reason || 'not found') + ' — 仍可把形式化代码写下来归档，但无法在此宿主上执行', file: rel, ms: now() - started, next: { kind: 'note', tried: _r.tried } } }
      } catch (e) {
        return { ok: false, code: 'LEAN_NOT_FOUND', message: 'cannot resolve "' + String(params.leanCommand || 'lean') + '": ' + String((e && e.message) || e) + ' — 仍可把形式化代码写下来归档，但无法在此宿主上执行', file: rel, ms: now() - started }
      }
      const pfx = await leanRunPrefix()
      const argv = [exe].concat(pfx.prefix.slice(1), [abs])
      let handle
      try {
        handle = sub.spawn({
          argv,
          cwd: instRoot(),
          stdio: { stdin: 'ignore', stdout: { maxBytes: 64 * 1024 }, stderr: { maxBytes: 64 * 1024 } },
          graceMs: cap,
        })
        // Hand the live process to the async queue (session dispose terminates it) and the
        // NORMALISED build prefix (engine + args + search paths, no file) to the settle check —
        // a job may only settle the build context it was queued under.
        if (hooks && typeof hooks.onHandle === 'function') hooks.onHandle(handle)
        if (hooks && typeof hooks.onBuildPrefix === 'function') hooks.onBuildPrefix(pfx.prefix)
      } catch (e) {
        return { ok: false, code: 'LEAN_SPAWN_FAILED', message: String((e && e.message) || e), file: rel, ms: now() - started }
      }
      let outcome
      // docs/formal-verification.md §7: a TIMEOUT must actually TERMINATE the process —
      // `graceMs` is only a request to the host, so relying on it alone could leave a runaway
      // Lean (or a host that ignores graceMs) alive while we report LEAN_TIMEOUT. Race `done`
      // against a `cap` timer that calls `handle.terminate()`, exactly like v2/v3/v4. The
      // timer disposer runs in BOTH outcomes, so a settled run never leaks a timer.
      let timerDisposer = null
      let timedOut = false
      // A `done` that settles AFTER the timeout won the race must not surface as an unhandled
      // rejection; the guarded `ran` promise is what the race uses, so the chain is attached
      // once and never re-created after it may already have rejected.
      const ran = Promise.resolve(handle.done).then(
        (v) => ({ settled: true, value: v }),
        (e) => ({ settled: false, error: e }))
      try {
        const r = await Promise.race([
          ran,
          new Promise((resolve) => {
            timerDisposer = ctx.timeout(() => {
              timedOut = true
              try { if (typeof handle.terminate === 'function') handle.terminate() } catch (e) { /* the race result is the report */ }
              resolve({ settled: true, value: { exitCode: null, signal: 'SIGTERM' } })
            }, cap)
          }),
        ])
        if (r.settled) outcome = r.value
        else throw r.error
      } catch (e) {
        if (timerDisposer) { try { timerDisposer() } catch (e2) { /* already settled */ } }
        return { ok: false, code: 'LEAN_RUN_FAILED', message: String((e && e.message) || e), file: rel, ms: now() - started }
      } finally {
        // `done`/error wins -> the timer must not fire later. When the TIMEOUT won, the timer
        // has already fired and disposing it is a no-op, so this is safe in either order.
        if (timerDisposer) { try { timerDisposer() } catch (e) { /* already settled */ } }
      }
      let out = '', err = ''
      try { if (handle.collected && handle.collected.stdout) out = handle.collected.stdout.readFrom(0).text } catch (e) { /* best effort */ }
      try { if (handle.collected && handle.collected.stderr) err = handle.collected.stderr.readFrom(0).text } catch (e) { /* best effort */ }
      const exitCode = outcome ? outcome.exitCode : null
      const ms = now() - started
      const ok = exitCode === 0
      return {
        ok, exitCode, signal: (outcome && outcome.signal) || null, ms,
        command: argv.join(' '), file: rel, leanFoundVia: leanVia,
        stdout: tail(out, 4000), stderr: tail(err, 4000),
        timedOut: timedOut || ms >= cap,
        code: ok ? undefined : ((timedOut || ms >= cap) ? 'LEAN_TIMEOUT' : 'LEAN_FAILED'),
      }
    }
    async function formalSetRun(target, run) {
      const t = idSafe(String(target || ''))
      if (!t) return
      // MEDIUM 6 (deep review): the record is built INSIDE the fold (`record` as a function), so a
      // concurrent writer for the SAME target (e.g. the async Lean queue completing while a sync
      // run reports) can no longer overwrite it from a stale read.
      //
      // Running a file NEVER changes an already-decided status: a green run does not by
      // itself make an object `passed` (only archiving a proof does), and a failing scratch
      // run must not silently erase a recorded `passed`/`blocked` decision. Everything else
      // becomes `attempted`, which is the honest "we tried, see the compiler output" state.
      await putFormal(t, (prev0) => {
        const prev = prev0 || { status: 'none' }
        const keep = (prev.status === 'passed' || prev.status === 'blocked') ? prev.status : 'attempted'
        return Object.assign({}, prev, {
          status: keep,
          file: run.file || prev.file || '',
          run: { at: now(), ok: !!run.ok, exitCode: run.exitCode === undefined ? null : run.exitCode, ms: run.ms || 0, stdoutTail: tail(run.stdout, 800), stderrTail: tail(run.stderr, 800) },
          updatedAt: now(),
        })
      })
    }
    // Withdrawing an archived proof means the file must stop looking like the object's proof.
    // The POLICY-COMPLIANT route is an overwrite through the injected `fs` service (it carries
    // `getPolicy()`); the platform shell is only a fallback, because `subprocess.spawn` has no
    // policy slot and the shell path therefore sat outside a confining deployment's fs policy
    // (audit M8). A stub host whose shell exits 0 without deleting anything is also handled by
    // the read-back check.
    async function removeArchivedProof(rel) {
      const abs = leanAbsPath(rel)
      if (abs === null) return false
      const withdrawn = '-- 已撤回（' + fmtTime() + '）：该形式化被认定与命题原文不一致。\n'
        + '-- 原代码保留在工作文件 Formal/' + String(rel).split('/').pop() + '；修正并重新跑通后重新归档。\n'
      // 1) the fs service (policy-confined) — an overwritten file is no longer a proof.
      if ((await writeTextAbs(abs, withdrawn)) !== undefined) {
        const nowText = await readTextAbs(abs)
        if (nowText !== undefined && nowText.indexOf('已撤回') !== -1) return true
      }
      // 2) guarded fallback: a real DELETE through the platform shell, when it exists.
      const sub = subprocessOf()
      if (sub !== undefined && typeof sub.spawn === 'function') {
        const script = isWindows()
          ? 'Remove-Item -LiteralPath ' + psQuote(abs) + ' -Force -ErrorAction SilentlyContinue'
          : 'rm -f ' + shQuote(abs)
        try { await runShell(script) } catch (e) { /* fall through to the overwrite */ }
        if (await readTextAbs(abs) === undefined) return true
      }
      // 3) last resort: the overwrite again, in case the delete recreated/left the file.
      return (await writeTextAbs(abs, withdrawn)) !== undefined
    }
    // A formalization that says something else than the proposition is NOT a refutation:
    // withdraw the proof instead of letting the group conclude 假 (contract §4.1).
    async function recordFidelityDefect(memberId, rawTarget, note) {
      const t = idSafe(String(rawTarget || ''))
      const why = String(note || '').trim()
      if (!t) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'target is required' }
      if (!why) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: "decision='defect' 必须写明 note（具体偏差）" }
      // MEDIUM 6 (deep review): BOTH halves are mutations applied inside the fold — the record
      // (built from the record the fold sees) and the TODO list (the old shape read
      // `formalTodo()`, pushed and wrote the array back, so a concurrent writer for another
      // target lost an entry).
      const proofRel = String(formalOf(t).proof || ('Verified/Lean/' + t + '.lean'))
      // Adv-verify S3 (found by `tests/audit-v5-lean-abstention.mjs`): this used to REPLACE the
      // whole `fidelity` object, so a SECOND member reporting a defect in the same round wiped the
      // first member's enforced-abstention marker (the audit's "marker length 2" assertion caught
      // it). The defect fields are updated, the marker history is preserved.
      await putFormal(t, (prev0) => Object.assign({}, prev0 || { status: 'none' }, {
        status: 'attempted', proof: '', decision: 'defect', note: why,
        fidelity: Object.assign({}, (prev0 && prev0.fidelity) || {}, { at: now(), by: String(memberId || ''), note: why }),
        updatedAt: now(),
      }), (todo0) => {
        const list = (todo0 || []).filter((x) => x.id !== t)
        list.push({ id: t, at: now(), why: '形式化不合格（忠实性缺陷）：' + why })
        return list
      })
      const removed = await removeArchivedProof(proofRel)
      await writeFormalTodo()
      await writeFormalIndex()
      // `removeArchivedProof` can fail on a host whose shell cannot delete AND whose
      // overwrite also fails. The record is downgraded either way, so say it out loud:
      // otherwise the stale file stays at the exact path everyone looks for proofs, and
      // nothing in any prompt or index would disclose that the withdrawal was incomplete.
      // `removed` means the archive no longer reads as a proof — either deleted, or
      // OVERWRITTEN with the withdrawal notice (the fs-service route). Name both honestly:
      // "deleted" would be false whenever the policy-confined overwrite was the route.
      const stillThere = removed ? [] : ['｜⚠ 归档证明 ', proofRel, ' 未能撤回（宿主删除与覆盖均失败）；记录已降级，请不要把它当作该对象的证明。']
      await saveChatLine('【形式化】' + (memberId || '成员') + ' 认定 ' + t + ' 的形式化**不忠实**：' + why
        + ' —— 已撤回「已通过」状态' + (removed ? '，并已使 Verified/Lean/ 中的归档证明失效（删除或覆盖为撤回声明）' : '') + '；请修正形式化、重新跑通后再投票。' + stillThere.join(''))
      return { ok: true, target: t, status: 'attempted', removed }
    }
    // ================= async Lean compile queue (docs/formal-verification.md §7) ==========
    // ONE compile at a time, per session. A tool call ENQUEUES and returns immediately; the
    // queue is drained by the existing heartbeat (`armHeartbeat`) and by a 0ms kick armed at
    // enqueue time, so a paused or concluded institute still drains what it accepted. Every job
    // is mirrored to Formal/Jobs/<jobId>.json for crash recovery and for `lean_lib.jobs`.
    // ONLY `settled(ok)` — exit 0 AND the file's content hash unchanged — may mark an object
    // `passed` and write Verified/Lean/<id>.lean; every other ending stays `attempted`.
    const leanJobs = new Map()
    const leanActive = new Map()      // jobId -> { job, handle } (up to leanJobsMaxParallel)
    let leanActiveJob = null          // the MOST RECENTLY started job (prompt/dispose reporting)
    let leanActiveHandle = null
    let leanDrainTimer = null
    let leanRecoveryDone = false
    let leanDisposed = false
    const leanNotices = []            // settled results not yet announced to a member
    function leanJobsMax() { return Math.max(1, Math.floor(Number(params.leanJobsMaxParallel) || 1)) }
    function leanJobRel(jobId) { return 'Formal/Jobs/' + jobId + '.json' }
    async function leanWriteJob(job) {
      try { await writeTextRel(leanJobRel(job.jobId), JSON.stringify(job, null, 2) + '\n') } catch (e) { /* best effort */ }
    }
    async function leanReadJobMirror(jobId) {
      try { return JSON.parse((await readTextRel(leanJobRel(jobId))) || 'null') } catch (e) { return null }
    }
    function leanJobMirrorSettled(rec) { return !!rec && rec.state === 'settled' && Number(rec.exitCode) === 0 }
    // Has this EXACT library content already been compiled successfully? The job id digests the
    // build context, so the check looks at the jobs rather than reconstructing an id: first the
    // in-memory queue, then the durable mirrors in Formal/Jobs/.
    async function leanLibArchivedOk(name, sha) {
      for (const j of leanJobs.values()) {
        if (j.kind === 'lib' && j.name === name && j.contentSha256 === sha && leanJobMirrorSettled(j)) return true
      }
      try {
        const t = await fs.resolve(instRoot() + '/Formal/Jobs')
        if (await fs.stat(t) !== undefined) {
          for (const e of (await fs.listDir(t)) || []) {
            if (!e || e.type !== 'file' || !/\.json$/.test(String(e.name))) continue
            const rec = await leanReadJobMirror(String(e.name).replace(/\.json$/, ''))
            if (rec && rec.kind === 'lib' && rec.name === name && rec.contentSha256 === sha && leanJobMirrorSettled(rec)) return true
          }
        }
      } catch (e) { /* best effort: no mirror ⇒ no dedupe */ }
      return false
    }
    function leanJobsView() {
      return Array.from(leanJobs.values())
        .sort((a, b) => (a.enqueuedAt || 0) - (b.enqueuedAt || 0))
        .map((j) => ({ jobId: j.jobId, state: j.state, rel: j.file || j.rel || '', target: j.target || j.name || '', attempts: j.attempts || 1, settledAt: j.settledAt || 0 }))
    }
    function leanNextQueued() {
      let best = null
      for (const j of leanJobs.values()) if (j.state === 'queued' && (!best || (j.enqueuedAt || 0) < (best.enqueuedAt || 0))) best = j
      return best
    }
    // The absolute VibeMath root handed to `-R` (the compile runs with cwd=instRoot()).
    function leanSearchRootView() { return vibeRoot().replace(/\\/g, '/') }
    async function leanSearchRoot() {
      const root = vibeRoot()
      if (root.charAt(0) === '/' || /^[a-z]:/i.test(root)) return root.replace(/\\/g, '/')
      try {
        const t = await fs.resolve(root)
        const s = typeof t === 'string' ? t : String((t && (t.targetKey || t.displayPath)) || root)
        return String(s).replace(/\\/g, '/')
      } catch (e) { return root.replace(/\\/g, '/') }
    }
    async function leanHashFile(rel) {
      const abs = leanAbsPath(rel)
      if (abs === null) return undefined
      const txt = await readTextAbs(abs)
      return txt === undefined ? undefined : sha256Hex(leanHashText(txt))
    }
    function leanJobId(key, sha) {
      // `sha` is the BUILD digest: content + engine + normalised argv + search paths, so the
      // same text compiled under different flags gets a different job (amendment §4).
      return String(key) + '-' + String(sha || '').slice(0, 12)
    }
    // The NORMALISED build prefix (engine + user args + injected search flags, WITHOUT the file
    // name). It is what the job id digests and what the settle re-checks.
    async function leanRunPrefix() {
      const userArgs = (Array.isArray(params.leanArgs) ? params.leanArgs : []).map(String)
      const engine = String(params.leanCommand || 'lean')
      const searchList = await leanInjectedSearchList(userArgs)
      const searchArgs = []
      for (const p of searchList) searchArgs.push(LEAN_SEARCH_PATH_FLAG, p)
      return { engine, userArgs, searchList, searchArgs, prefix: [engine].concat(userArgs, searchArgs) }
    }
    // leanSearchPaths FIRST (the order the user gave), then the automatic VibeMath root; deduped;
    // empty when leanArgs already carries an explicit search flag (explicit override wins).
    async function leanInjectedSearchList(userArgs) {
      if (leanHasSearchFlag(userArgs)) return []
      const extra = (Array.isArray(params.leanSearchPaths) ? params.leanSearchPaths : [])
        .map((s) => String(s == null ? '' : s).trim()).filter(Boolean)
      const root = await leanSearchRoot()
      return Array.from(new Set(extra.concat([root])))
    }
    function leanBuildDigest(contentText, prefix) {
      return sha256Hex(leanHashText(String(contentText == null ? '' : contentText)) + '|' + JSON.stringify((prefix || []).map(String)))
    }
    function leanBuildHash(prefix) { return sha256Hex(JSON.stringify((prefix || []).map(String))) }
    function armLeanDrain(ms) {
      if (leanDisposed || leanDrainTimer) return
      // `posMs` treats 0 as "use the default" (120s!), which would stall the queue: the kick
      // must be an IMMEDIATE next-tick timer.
      const delay = (typeof ms === 'number' && ms > 0) ? Math.floor(ms) : 0
      leanDrainTimer = ctx.timeout(() => {
        leanDrainTimer = null
        runLeanQueue().catch((e) => console.error('vibe-math-v5r: lean queue: ' + String((e && e.message) || e)))
      }, delay)
    }
    function clearLeanDrain() { if (leanDrainTimer) { try { leanDrainTimer() } catch (e) { /* ignore */ } leanDrainTimer = null } }
    // The toolchain probe shared by the enqueue path: a host with no subprocess service — or no
    // reachable executable — must keep today's honest NO_SUBPROCESS / LEAN_NOT_FOUND behaviour
    // rather than queueing a job that can never settle.
    async function leanPrecheck(relPath) {
      const rel = String(relPath == null ? '' : relPath).trim()
      if (!rel) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'file is required' }
      const abs = leanAbsPath(rel)
      if (abs === null) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'Lean file must live under ' + vibeRoot().replace(/\\/g, '/') + '/ (got ' + rel + ')' }
      if (!/\.lean$/.test(abs)) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'only .lean files can be executed' }
      if (await readTextAbs(abs) === undefined) return { ok: false, code: 'V5_NOT_FOUND', message: 'no such file: ' + rel }
      const sub = subprocessOf()
      if (sub === undefined || typeof sub.spawn !== 'function') {
        return { ok: false, code: 'NO_SUBPROCESS', message: 'the host exposes no subprocess service; Lean cannot be executed here', file: rel }
      }
      try { const _lc2 = String(params.leanCommand || 'lean').trim(); const _r2 = await resolveKnownTool(sub, { name: 'lean', explicit: (_lc2 && _lc2 !== 'lean') ? _lc2 : '', kind: 'lean' }); if (!_r2.exe) return { ok: false, code: 'LEAN_NOT_FOUND', message: 'cannot resolve "' + _lc2 + '": ' + String(_r2.reason || 'not found') + ' — 仍可把形式化代码写下来归档，但无法在此宿主上执行', file: rel, next: { kind: 'note', tried: _r2.tried } } } catch (e) {
        return { ok: false, code: 'LEAN_NOT_FOUND', message: 'cannot resolve "' + String(params.leanCommand || 'lean') + '": ' + String((e && e.message) || e) + ' — 仍可把形式化代码写下来归档，但无法在此宿主上执行', file: rel }
      }
      return { ok: true, rel, abs }
    }
    async function enqueueLeanJob(spec) {
      const job = Object.assign({}, spec, {
        state: 'queued', attempts: 0, enqueuedAt: now(), startedAt: 0, settledAt: 0,
        exitCode: null, ok: false, timedOut: false, interrupted: false,
      })
      leanJobs.set(job.jobId, job)
      await leanWriteJob(job)
      // Kick on a LATER tick: the tool must return before any compiler process starts.
      armLeanDrain()
      return job
    }
    async function runLeanQueue() {
      let started = false
      // Up to leanJobsMaxParallel compiles at once (default 1 = strictly serial). Each job runs
      // to completion in the background; its own settle re-arms the queue.
      while (leanActive.size < leanJobsMax()) {
        const job = leanNextQueued()
        if (!job) break
        started = true
        const slot = { job, handle: null }
        leanActive.set(job.jobId, slot)
        runLeanJob(job, slot)
          .catch((e) => console.error('vibe-math-v5r: lean job ' + job.jobId + ': ' + String((e && e.message) || e)))
          .finally(() => {
            leanActive.delete(job.jobId)
            if (leanActiveJob === job) { leanActiveJob = null; leanActiveHandle = null }
            if (leanNextQueued()) armLeanDrain()
          })
      }
      return started
    }
    async function runLeanJob(job, slot) {
      leanActiveJob = job
      leanActiveHandle = null
      job.state = 'running'
      job.startedAt = now()
      job.attempts = (Number(job.attempts) || 0) + 1
      await leanWriteJob(job)
      let run = null
      let actualPrefix = null
      try {
        run = await leanRunFile(job.rel, job.timeoutMs, {
          onHandle: (h) => { if (slot) slot.handle = h; if (leanActiveJob === job) leanActiveHandle = h },
          onBuildPrefix: (p) => { actualPrefix = p },
        })
      } catch (e) {
        run = { ok: false, code: 'LEAN_RUN_FAILED', message: String((e && e.message) || e), file: job.rel, ms: 0 }
      }
      const hashNow = await leanHashFile(job.rel)
      const hashMatched = hashNow !== undefined && hashNow === job.contentSha256
      // The build context must be the one the job was QUEUED under: args/search paths may have
      // been retuned while it waited, and a compile under different flags settles nothing.
      const buildMatched = !!actualPrefix && leanBuildHash(actualPrefix) === job.buildHash
      const settledOk = !!run.ok && hashMatched && buildMatched
      job.exitCode = run.exitCode === undefined ? null : run.exitCode
      job.ok = settledOk
      job.timedOut = !!run.timedOut
      job.buildMatched = buildMatched
      job.settledAt = now()
      job.state = settledOk ? 'settled' : (job.interrupted === true ? 'interrupted' : (job.timedOut ? 'timeout' : 'failed'))
      job.run = {
        at: job.settledAt, ok: !!job.ok, exitCode: job.exitCode, ms: run.ms || 0,
        timedOut: !!job.timedOut, interrupted: !!job.interrupted, buildMatched,
        stderrTail: tail(run.stderr || (buildMatched ? '' : '构建上下文已改变（leanArgs/搜索路径在入队后被修改），本次结果不用于判定'), 800),
      }
      try { await leanApplySettle(job, run, settledOk, hashMatched && buildMatched) } catch (e) { console.error('vibe-math-v5r: lean settle ' + job.jobId + ': ' + String((e && e.message) || e)) }
      await leanWriteJob(job)
      leanQueueNotice(job, run, hashMatched && buildMatched)
    }
    // The ONE place a job's outcome reaches the state — and the ONLY place an object may become
    // `passed` from a compile (proof jobs, and only when settledOk).
    async function leanApplySettle(job, run, settledOk, hashMatched) {
      const asyncRec = {
        jobId: job.jobId, state: job.state, attempts: job.attempts || 1,
        enqueuedAt: job.enqueuedAt || 0, startedAt: job.startedAt || 0, settledAt: job.settledAt || 0,
        exitCode: job.exitCode === undefined ? null : job.exitCode,
      }
      const target = idSafe(String(job.target || job.name || ''))
      if (job.kind === 'proof') {
        if (!target) return
        const prev = formalOf(target)
        const stale = hashMatched ? '' : '（异步落地：编译完成后文件内容已改变，本次结果不用于判定）'
        const rec = Object.assign({}, prev, {
          status: settledOk ? 'passed' : 'attempted',
          file: job.rel,
          proof: settledOk ? 'Verified/Lean/' + target + '.lean' : '',
          decision: 'used',
          // L7 (deep-review 5): `decision:'used'` is written by BOTH the member's reply and this
          // settle path; `decisionSource` says which one. Fallout #4 (F1d): it used to be
          // WRITE-ONLY — nothing read or asserted it — so it is now part of the readable surfaces
          // (`status().formal.objects[]`, `vibe_v5_lean_lib.objects`, the report's 形式化决定 line)
          // and it is asserted by `_oneoff/decision-source.mjs`.
          decisionSource: 'job-settle',
          note: (String(prev.note || '') + stale).trim(),
          run: job.run, async: asyncRec, updatedAt: now(),
        })
        if (settledOk) await writeTextRel('Verified/Lean/' + target + '.lean', String(job.content == null ? '' : job.content))
        await putFormal(target, rec)
        await rebuildLeanLibIndexes()
        await saveChatLine('【形式化】' + (job.member || '成员') + ' 的后台作业 ' + job.jobId + ' 落地：' + target + ' → ' + rec.status
          + (settledOk ? '（已归档 ' + rec.proof + '，验证转为忠实性审查）' : '（未通过：' + tail(run.stderr || run.message, 160) + '）'))
        return
      }
      if (job.kind === 'lib') {
        if (target) {
          const prev = formalOf(target)
          await putFormal(target, Object.assign({}, prev, { file: job.file || prev.file || '', run: job.run, async: asyncRec, updatedAt: now() }))
        }
        await rebuildLeanLibIndexes()
        await saveChatLine('【形式化】' + (job.member || '成员') + ' 的后台作业 ' + job.jobId + ' 落地：' + (job.file || job.rel) + ' → ' + (settledOk ? '通过' : '未通过')
          + (settledOk ? '' : '（' + tail(run.stderr || run.message, 160) + '）'))
        return
      }
      if (target) {
        await formalSetRun(target, run)
        const rec = formalOf(target)
        await putFormal(target, Object.assign({}, rec, { async: asyncRec, updatedAt: now() }))
      }
      await writeFormalIndex()
      await saveChatLine('【形式化】' + (job.member || '成员') + ' 的后台作业 ' + job.jobId + ' 落地：' + (job.file || job.rel) + ' → ' + (settledOk ? '通过' : '未通过')
        + (settledOk ? '' : '（' + tail(run.stderr || run.message, 160) + '）'))
    }
    function leanQueueNotice(job, run, hashMatched) {
      const secs = ((run && run.ms) || 0) / 1000
      let line
      if (job.state === 'settled') line = '【形式化结果】' + job.jobId + '：通过（exit 0，' + secs.toFixed(1) + 's' + (job.kind === 'proof' ? '，已归档 Verified/Lean/' + job.target + '.lean' : '') + '）'
      else if (job.state === 'timeout') line = '【形式化结果】' + job.jobId + '：超时（leanTimeoutMs=' + posMs(params.leanTimeoutMs, 120000) + ' 已 terminate）'
      else if (job.state === 'interrupted') line = '【形式化结果】' + job.jobId + '：中断（会话卸载或崩溃，已标记 attempted，可重跑）'
      else line = '【形式化结果】' + job.jobId + '：失败（exit ' + job.exitCode + (hashMatched ? '' : '；文件内容已变，结果不可用') + '，见 stderr 尾部）'
      leanNotices.push({ member: String(job.member || ''), jobId: job.jobId, line, at: now() })
      while (leanNotices.length > 20) leanNotices.shift()
    }
    // ONE-SHOT: a member sees each settled result exactly once, in its next round prompt
    // (the "announcement point is the next prompt" discipline).
    function takeLeanNoticesFor(memberId) {
      if (!leanNotices.length) return []
      // L8 (deep-review 5): a notice whose member is no longer active can NEVER be delivered — it
      // used to sit in the 20-slot queue until a newer result evicted it. Prune those first; their
      // content stays reachable through `status().leanNotices`, `Formal/Jobs/<jobId>.json` and
      // `vibe_v5_lean_job {jobId}` (see L4), so nothing is lost, only the slot is freed.
      for (let i = leanNotices.length - 1; i >= 0; i--) {
        const m = memberById(leanNotices[i].member)
        if (!m || m.phase !== 'active') leanNotices.splice(i, 1)
      }
      const mine = leanNotices.filter((n) => n.member === memberId)
      if (!mine.length) return []
      for (const n of mine) { const i = leanNotices.indexOf(n); if (i !== -1) leanNotices.splice(i, 1) }
      return mine.map((n) => n.line)
    }
    // Crash recovery: an object is NEVER silently verified. Only a job record that says
    // exitCode 0 AND whose content hash still matches may补 the archive; everything else is
    // downgraded to `attempted` (or re-queued when the interrupted run is safe to retry).
    async function leanMarkAttempted(rec, why) {
      const target = idSafe(String(rec.target || ''))
      if (!target) return
      const prev = formalOf(target)
      const sameJob = !!(prev && prev.async && prev.async.jobId === rec.jobId)
      if (!sameJob && prev.status === 'passed') return       // never downgrade a newer pass
      if (!sameJob && rec.kind !== 'proof') return
      const note = String(prev.note || '')
      await putFormal(target, Object.assign({}, prev, {
        status: prev.status === 'blocked' ? 'blocked' : 'attempted',
        proof: rec.kind === 'proof' ? '' : prev.proof,
        async: { jobId: rec.jobId, state: 'interrupted', attempts: Number(rec.attempts) || 1, enqueuedAt: rec.enqueuedAt || 0, startedAt: rec.startedAt || 0, settledAt: now(), exitCode: rec.exitCode === undefined ? null : rec.exitCode },
        note: (note.indexOf(why) === -1 ? (note + (note ? ' ' : '') + '（' + why + '）') : note).trim(),
        updatedAt: now(),
      }))
      await writeFormalIndex()
    }
    async function leanApplyRecovered(rec) {
      const target = idSafe(String(rec.target || ''))
      const asyncRec = { jobId: rec.jobId, state: 'settled', attempts: Number(rec.attempts) || 1, enqueuedAt: rec.enqueuedAt || 0, startedAt: rec.startedAt || 0, settledAt: rec.settledAt || now(), exitCode: 0 }
      if (rec.kind === 'proof' && target) {
        const prev = formalOf(target)
        await writeTextRel('Verified/Lean/' + target + '.lean', String(rec.content == null ? '' : rec.content))
        await putFormal(target, Object.assign({}, prev, {
          status: 'passed', file: rec.rel, proof: 'Verified/Lean/' + target + '.lean', decision: 'used',
          run: Object.assign({}, rec.run || {}, { ok: true, exitCode: 0 }), async: asyncRec, updatedAt: now(),
        }))
        await rebuildLeanLibIndexes()
        return true
      }
      if (target) {
        const prev = formalOf(target)
        await putFormal(target, Object.assign({}, prev, { run: Object.assign({}, rec.run || {}, { ok: true, exitCode: 0 }), async: asyncRec, updatedAt: now() }))
      }
      await rebuildLeanLibIndexes()
      return true
    }
    async function recoverLeanJobs() {
      if (leanRecoveryDone) return { scanned: 0, requeued: 0, attempted: 0 }
      leanRecoveryDone = true
      let entries = []
      try {
        const t = await fs.resolve(instRoot() + '/Formal/Jobs')
        if (await fs.stat(t) !== undefined) entries = await fs.listDir(t)
      } catch (e) { return { scanned: 0, requeued: 0, attempted: 0 } }
      let scanned = 0, requeued = 0, attempted = 0
      for (const e of entries || []) {
        if (!e || e.type !== 'file' || !/\.json$/.test(String(e.name))) continue
        const jobId = String(e.name).replace(/\.json$/, '')
        const rec = await leanReadJobMirror(jobId)
        if (!rec || !rec.jobId || !rec.rel) continue
        scanned++
        const hashNow = await leanHashFile(rec.rel)
        const matched = hashNow !== undefined && hashNow === rec.contentSha256
        if (rec.state === 'queued') {
          rec.attempts = Number(rec.attempts) || 0
          leanJobs.set(rec.jobId, rec)
          requeued++
          await saveChatLine('【形式化·恢复】后台作业 ' + rec.jobId + ' 从未开始，已重新入队。')
          continue
        }
        if (rec.state === 'running' || rec.state === 'interrupted') {
          rec.interrupted = true
          await leanMarkAttempted(rec, matched ? '崩溃恢复：上一次运行的结果不可知' : '崩溃恢复：运行期间文件已被改写')
          attempted++
          if (matched) {
            rec.state = 'queued'
            rec.startedAt = 0
            leanJobs.set(rec.jobId, rec)
            requeued++
            await saveChatLine('【形式化·恢复】后台作业 ' + rec.jobId + ' 中断且内容未变：已以新 attempts 重新入队（旧结果不可知）。')
          } else {
            rec.state = 'failed'
            await leanWriteJob(rec)
            await saveChatLine('【形式化·恢复】后台作业 ' + rec.jobId + ' 运行期间文件已被改写：**不自动重驱**，请手动重跑（对象保持 attempted）。')
          }
          continue
        }
        if (leanJobMirrorSettled(rec) && matched) {
          await leanApplyRecovered(rec)
          await saveChatLine('【形式化·恢复】后台作业 ' + rec.jobId + ' 已通过且内容未变：按作业记录补齐归档与 passed。')
        } else {
          await leanMarkAttempted(rec, '崩溃恢复：作业未通过或内容已变')
          attempted++
        }
      }
      if (leanNextQueued()) armLeanDrain()
      return { scanned, requeued, attempted }
    }
    function leanJobView(job) {
      if (!job) return null
      return {
        jobId: job.jobId, state: job.state, kind: job.kind || 'run',
        file: job.file || job.rel || '', rel: job.rel || '', target: job.target || job.name || '',
        attempts: job.attempts || 1, exitCode: job.exitCode === undefined ? null : job.exitCode,
        ok: job.ok === true, timedOut: !!job.timedOut, interrupted: !!job.interrupted,
        buildMatched: job.buildMatched !== false,
        enqueuedAt: job.enqueuedAt || 0, startedAt: job.startedAt || 0, settledAt: job.settledAt || 0,
        jobFile: leanJobRel(job.jobId),
        proof: job.kind === 'proof' && job.ok === true ? 'Verified/Lean/' + job.target + '.lean' : '',
        stderrTail: (job.run && job.run.stderrTail) || '',
      }
    }
    // `lean_job {jobId?, waitMs?}` — the WAIT path for a background compile. It polls the queue
    // itself (bounded by waitMs) and never touches the heartbeat; with no jobId it lists this
    // session's jobs. Returns the CURRENT state on timeout rather than throwing.
    async function leanJobTool(o) {
      const args = o || {}
      const jobId = String(args.jobId || '').trim()
      const waitMs = Math.max(0, Math.min(600000, Math.floor(Number(args.waitMs) || 0)))
      if (!jobId) return { ok: true, jobs: leanJobsView(), count: leanJobs.size, running: leanActive.size, maxParallel: leanJobsMax() }
      let job = leanJobs.get(jobId) || await leanReadJobMirror(jobId)
      if (!job) return { ok: false, code: 'V5_NOT_FOUND', message: 'no such job ' + jobId, jobs: leanJobsView() }
      const deadline = now() + waitMs
      let waitedMs = 0
      while (waitMs > 0 && (job.state === 'queued' || job.state === 'running') && now() < deadline) {
        const t0 = now()
        try { await runLeanQueue() } catch (e) { console.error('vibe-math-v5r: lean wait: ' + String((e && e.message) || e)) }
        if (job.state === 'queued' || job.state === 'running') {
          await new Promise((resolve) => { ctx.timeout(() => resolve(true), Math.min(25, waitMs)) })
        }
        waitedMs += now() - t0
        job = leanJobs.get(jobId) || await leanReadJobMirror(jobId) || job
      }
      return { ok: true, job: leanJobView(job), waitedMs, timedOut: job.state === 'queued' || job.state === 'running' }
    }
    // Session dispose: terminate EVERY in-flight compile and mark it `interrupted` — never passed.
    function disposeLeanJobs() {
      leanDisposed = true
      clearLeanDrain()
      const jobs = []
      for (const slot of leanActive.values()) {
        const job = slot && slot.job
        if (job) { job.interrupted = true; job.state = 'interrupted'; job.settledAt = now(); jobs.push(job) }
        if (slot && slot.handle && typeof slot.handle.terminate === 'function') {
          try { slot.handle.terminate() } catch (e) { /* best effort */ }
        }
      }
      if (leanActiveHandle && typeof leanActiveHandle.terminate === 'function') {
        try { leanActiveHandle.terminate() } catch (e) { /* best effort */ }
      }
      for (const job of jobs) {
        leanWriteJob(job).catch(() => {})
        leanQueueNotice(job, { ms: now() - (job.startedAt || now()) }, true)
      }
      return { terminated: jobs.length }
    }
    try { leanDisposers.add(disposeLeanJobs) } catch (e) { /* host without the disposer set */ }

    // ============ math_computation seam (docs/math-computation.md) ============
    // The shared module (`./math-computation.js`) owns detection/argv/receipts/install; this
    // preset owns the HOST side. Every path the module hands over is institute-relative, and it
    // is re-guarded here (defence in depth): a '../' path can never escape the institute even if
    // the module's own guard regresses.
    function mathRelPath(rel) {
      const raw = String(rel == null ? '' : rel).trim().replace(/\\/g, '/')
      if (!raw || raw.charAt(0) === '/' || /^[a-z]:/i.test(raw)) return null
      const parts = []
      for (const seg of raw.split('/')) {
        if (!seg || seg === '.') continue
        if (seg === '..') { if (!parts.length) return null; parts.pop(); continue }
        parts.push(seg)
      }
      return parts.length ? parts.join('/') : null
    }
    async function mathWriteRel(rel, text) {
      const r = mathRelPath(rel)
      if (r === null) return false
      return await writeTextRel(r, String(text == null ? '' : text))
    }
    async function mathReadRel(rel) {
      const r = mathRelPath(rel)
      if (r === null) return undefined
      return await readTextRel(r)
    }
    async function mathExistsRel(rel) {
      const r = mathRelPath(rel)
      if (r === null) return false
      try {
        const t = await fs.resolve(instRoot() + '/' + r)
        return (await fs.stat(t)) !== undefined
      } catch (e) { return false }
    }
    // Optional host seam (P2a): the module uses it for the per-project retention cap. `''`/'.'
    // means the project root itself.
    async function mathListDirRel(rel) {
      const raw = String(rel == null ? '' : rel).trim()
      const r = raw === '' || raw === '.' ? '' : mathRelPath(raw)
      if (r === null) return []
      try {
        const t = await fs.resolve(instRoot() + (r ? '/' + r : ''))
        return (await fs.listDir(t)) || []
      } catch (e) { return [] }
    }
    async function mathResolveExecutable(cmd) {
      const sub = subprocessOf()
      if (sub === undefined || typeof sub.resolveExecutable !== 'function') throw new Error('NO_SUBPROCESS: the host exposes no subprocess service')
      const p = await sub.resolveExecutable(String(cmd))
      if (typeof p === 'string' && p) return p
      throw new Error('cannot resolve executable: ' + String(cmd))
    }
    // The module calls this with {argv, cwd, timeoutMs, stdoutCap, stderrCap} and expects the
    // FULL captured output (it writes the complete text to disk and only truncates the RETURN
    // shell itself, MATH_CAPS.stdout = 64KB) — so the stdio caps must be generous, never the
    // return-shell size. A host without a subprocess service returns null instead of throwing:
    // the module maps that to MATH_NO_SUBPROCESS (its `if (!r)` branch).
    async function mathSpawn(opts) {
      const o = opts || {}
      const sub = subprocessOf()
      if (sub === undefined || typeof sub.spawn !== 'function') return null
      const argv = (o.argv || []).map(String)
      if (!argv.length) return null
      const started = now()
      const cap = Math.max(1000, Math.floor(Number(o.timeoutMs) || Number(params.mathTimeoutMs) || 60000))
      const outCap = Math.max(MATH_CAPS.stdout, Math.floor(Number(o.stdoutCap) || MATH_CAPS.file))
      const errCap = Math.max(MATH_CAPS.stderr, Math.floor(Number(o.stderrCap) || MATH_CAPS.file))
      let handle = null
      try {
        handle = sub.spawn({
          argv,
          cwd: String(o.cwd || instRoot()),
          stdio: {
            stdin: o.stdin === undefined ? 'ignore' : 'pipe',
            stdout: { maxBytes: outCap },
            stderr: { maxBytes: errCap },
          },
          graceMs: cap,
        })
      } catch (e) {
        return { exit: null, timedOut: false, killed: false, ms: now() - started, stdout: '', stderr: String((e && e.message) || e) }
      }
      // A host whose spawn answers nothing usable (no service, refused, null handle) must reach
      // the module's `if (!r)` branch as MATH_NO_SUBPROCESS instead of throwing here.
      if (!handle) return null
      if (o.stdin !== undefined && handle && handle.stdin && typeof handle.stdin.write === 'function') {
        try { handle.stdin.write(String(o.stdin)); if (typeof handle.stdin.end === 'function') handle.stdin.end() } catch (e) { /* best effort */ }
      }
      // A TIMEOUT must actually KILL the process: `graceMs` is only a request to the host.
      let timerDisposer = null
      let timedOut = false
      const ran = Promise.resolve(handle.done).then(
        (v) => ({ settled: true, value: v }),
        (e) => ({ settled: false, error: e }))
      let outcome = null
      try {
        const r = await Promise.race([
          ran,
          new Promise((resolve) => {
            timerDisposer = ctx.timeout(() => {
              timedOut = true
              try { if (typeof handle.terminate === 'function') handle.terminate() } catch (e) { /* the race result is the report */ }
              resolve({ settled: true, value: { exitCode: null, signal: 'SIGTERM' } })
            }, cap)
          }),
        ])
        if (r.settled) outcome = r.value
      } catch (e) {
        return { exit: null, timedOut, killed: timedOut, ms: now() - started, stdout: '', stderr: String((e && e.message) || e) }
      } finally {
        if (timerDisposer) { try { timerDisposer() } catch (e) { /* already settled */ } }
      }
      let out = '', err = ''
      try { if (handle.collected && handle.collected.stdout) out = handle.collected.stdout.readFrom(0).text } catch (e) { /* best effort */ }
      try { if (handle.collected && handle.collected.stderr) err = handle.collected.stderr.readFrom(0).text } catch (e) { /* best effort */ }
      const signal = (outcome && outcome.signal) || null
      return {
        exit: outcome && outcome.exitCode !== undefined ? outcome.exitCode : null,
        timedOut,
        killed: timedOut || !!signal,
        ms: now() - started,
        stdout: out,
        stderr: err,
      }
    }
    function mathLog(kind, msg) {
      try { saveChatLine('【计算】' + String(msg == null ? '' : msg)) } catch (e) { /* a log line must never break a run */ }
    }
    // The per-session host the module talks to (also used by the availability-line probe, which
    // runs OUTSIDE a tool call and therefore cannot rely on an ambient "current session").
    const mathSessionHost = {
      register: () => {},
      params: () => Object.assign({}, params),
      projectRoot: () => instRoot(),
      designator: 'vibe-math-v5r',
      writeText: (rel, text) => mathWriteRel(rel, text),
      readText: (rel) => mathReadRel(rel),
      exists: (rel) => mathExistsRel(rel),
      resolveExecutable: (cmd) => mathResolveExecutable(cmd),
      spawn: (opts) => mathSpawn(opts),
      // P2a optional fields: tell the module up front whether a compiler can run at all (so it
      // reports MATH_NO_SUBPROCESS before engine detection), and let it check the retention cap.
      hasSubprocess: () => { const sub = subprocessOf(); return !!(sub && typeof sub.spawn === 'function') },
      listDir: (rel) => mathListDirRel(rel),
      // round-7 (fix 2): DSH's own bundled runtimes (`<home>/.dsh/dsh-runtimes/*/dependencies/<engine>/`)
      // as a LAST resort after PATH. Generic roots only; the module globs the tree name and accepts
      // only the descriptor's own candidate names.
      runtimeRoots: () => { const env = process.env.DSH_HOME; if (env) return [String(env)]; const home = String(process.env.HOME || process.env.USERPROFILE || ''); return home ? [home.replace(/[\\/]+$/, '') + '/.dsh'] : [] },
      listDirAbs: async (abs) => { try { const t = await fs.resolve(String(abs)); const st = await fs.stat(t); if (!st) return []; return (await fs.listDir(t)) || [] } catch (e) { return [] } },
      log: (kind, msg) => mathLog(kind, msg),
    }
    // The DYNAMIC per-round availability line: computed from a (cached) probe when the prompt is
    // built, never frozen into the persona. `mathComputation:'off'` produces NO line at all
    // (the zero-mention discipline); the mode decides whether the shell-fallback sentence is in.
    let mathLineZh = ''
    let mathLineEn = ''
    async function refreshMathLine() {
      if (String(params.mathComputation) === 'off') { mathLineZh = ''; mathLineEn = ''; return '' }
      try {
        const probe = await probeMathEngines(mathSessionHost)
        mathLineZh = mathAvailabilityLine(probe, 'zh', String(params.mathMode))
        mathLineEn = mathAvailabilityLine(probe, 'en', String(params.mathMode))
        // Drift guard: the shared line must still carry the frozen rule text (a future module
        // edit that drops the rules would silently remove a rule from every round prompt).
        if (mathLineZh.indexOf(MATH_RULE_LINES[0]) === -1) console.error('vibe-math-v5r: the math availability line lost the frozen rules')
        if (mathLineEn.indexOf(MATH_RULE_LINES_EN[0]) === -1) console.error('vibe-math-v5r: the EN math availability line lost the frozen rules')
        // P2a: the archive→edit→re-run workflow rule must reach the prompt too (it is what makes
        // `scriptChanged` actionable for a member).
        if (mathLineZh.indexOf(MATH_ARCHIVE_WORKFLOW_LINE) === -1) console.error('vibe-math-v5r: the math availability line lost the archive workflow rule')
        if (mathLineEn.indexOf(MATH_ARCHIVE_WORKFLOW_LINE_EN) === -1) console.error('vibe-math-v5r: the EN math availability line lost the archive workflow rule')
        // Round-6 (A): an undeclared SUBSTITUTION must never read like the exact result — the
        // honesty rule has to reach the prompt in both languages.
        if (mathLineZh.indexOf(MATH_SUBSTITUTION_RULE_LINE) === -1) console.error('vibe-math-v5r: the math availability line lost the substitution-honesty rule')
        if (mathLineEn.indexOf(MATH_SUBSTITUTION_RULE_LINE_EN) === -1) console.error('vibe-math-v5r: the EN math availability line lost the substitution-honesty rule')
        return mathLineZh
      } catch (e) {
        // A probe failure must never break prompt construction: keep whatever we had.
        return mathLineZh
      }
    }
    // The tool section of a member prompt: the availability line + the rules (both come from
    // the module, so all four presets stay byte-comparable).
    function mathPromptBlock(lang) {
      const line = lang === 'en' ? mathLineEn : mathLineZh
      if (line) return '\n' + line
      // Fallback: when the dynamic line could not be built, the member still needs to know the
      // tool exists, how to cite it, that an edited script needs a NEW receipt, and (round 6) that
      // a substitution weakening exactness must be declared.
      if (String(params.mathComputation) === 'off') return ''
      return lang === 'en'
        ? '\n' + MATH_PERSONA_TOOL_LINE + '\n' + MATH_ARCHIVE_WORKFLOW_LINE_EN + '\n' + MATH_SUBSTITUTION_RULE_LINE_EN
        : '\n' + MATH_PERSONA_TOOL_LINE + '\n' + MATH_ARCHIVE_WORKFLOW_LINE + '\n' + MATH_SUBSTITUTION_RULE_LINE
    }
    // Push the tool section into a prompt under construction (a no-op in the 'off' mode, which
    // is the "off means zero mention" discipline).
    function mathPushLine(L) { const b = mathPromptBlock('zh'); if (b) L.push(b) }

    // task-9 2b: the LaTeX-missing guidance (four bounded steps + three hard boundaries). Those four
    // steps and three boundaries are the shared contract; task-28 (v5 PILOT) additionally names the
    // "installed but NOT on PATH" case and TeX Live's documented positions — v4/v2/v3 adopt the same
    // text once v5 is verified, so the wording deliberately leads on v5.
    function paperHintBlock(lang) {
      return lang === 'en'
        ? '\nWhen no LaTeX engine is detected: (1) probe only the documented common TeX roots and PATH (e.g. where xelatex, latexmk --version) - never scan whole drives; the MOST COMMON case is an engine that IS installed but NOT on PATH — a DRIVE-ROOT Windows TeX Live lives under `texlive\\<year>\\bin\\windows` on that drive, Unix under the standard system paths `/usr/local/texlive/<year>/bin/*` or `/opt/texlive/<year>/bin/*`, macOS at `/Library/TeX/texbin`; (2) once the absolute path is found, write it into paperLatexCommand, re-detect, then continue; (3) if it is still missing, REPORT IT TO THE OFFICE (or the group chat) and let the OFFICE confirm with the user (installing TeX requires the user\'s explicit approval); (4) with no answer yet, degrade exactly as today (deliver paper.tex and paper.md only). Hard boundaries: never auto-install; never write outside the workspace; never treat "not detected" as a failure.'
        : '\n检测不到 LaTeX 引擎时：① 只在文档化的常见 TeX 根与 PATH 上做有界核查（如 where xelatex、latexmk --version），不要全盘扫描——**最常见的情形是引擎装了但不在 PATH**：TeX Live 若装在 Windows 的某个**盘根**下，看该盘根里的 `texlive\\<年份>\\bin\\windows`；类 Unix 看标准系统路径 `/usr/local/texlive/<年份>/bin/*`、`/opt/texlive/<年份>/bin/*`；macOS 看 `/Library/TeX/texbin`；② 找到绝对路径后写入 paperLatexCommand 并重新检测，再继续；③ 仍找不到就**如实上报所办（或群聊）**，由**所办**向用户确认（安装 TeX 需用户明确同意）；④ 尚无回应则照旧降级（只交付 paper.tex 与 paper.md）。硬边界：绝不自动安装；绝不写工作区之外；绝不把"未检测到"当失败。'
    }
    function paperPushLine(L) {
      const b = paperHintBlock('zh')
      // Iron-rules fix (P4): this block only matters while the member is writing/compiling the paper, yet it was
      // pushed into EVERY wake — founding, verify and meeting prompts included — where it reads as unexplained
      // noise ("why is LaTeX guidance in my first round?"). Keep the guidance (the paper builders do NOT emit it,
      // so removing it here would lose it entirely) but SAY WHEN IT APPLIES. The block itself stays byte-identical
      // across presets; only this per-preset wrapper changes.
      if (b) L.push('\n（**以下这段仅在你参与论文写作或编译时适用**；其他阶段可忽略。）' + b)
    }

    // ---- feedback library (Shared/Feedback/): methodology / collaboration, never research -----------
    // Entries live in the DURABLE `feedback` array and are written through the fold (patchInstitute with
    // an UPDATER), so two concurrent adds/updates cannot lose one. The human-readable mirror (one file per
    // category + a JSON index) is WRITE-ONLY like Shared/TaskBoard.md; the state file stays authoritative.
    function feedbackOn() { return String(params.feedback || 'on') !== 'off' }
    function feedbackEntries() { const s = inst(); if (!Array.isArray(s.feedback)) s.feedback = []; return s.feedback }
    function feedbackCounts() {
      const all = feedbackEntries()
      const byCategory = {}, byRoute = {}
      for (const c of FEEDBACK_CATEGORIES) byCategory[c] = 0
      for (const r of FEEDBACK_ROUTES) byRoute[r] = 0
      let open = 0
      for (const e of all) {
        if (byCategory[e.category] !== undefined) byCategory[e.category] += 1
        if (byRoute[e.route] !== undefined) byRoute[e.route] += 1
        if (FEEDBACK_OPEN_STATUSES.indexOf(e.status) !== -1) open += 1
      }
      return { total: all.length, open, closed: all.length - open, byCategory, byRoute }
    }
    function feedbackView(e) {
      return { id: e.id, at: e.at, by: e.by, category: e.category, route: e.route, status: e.status,
        context: e.context || '', phenomenon: e.phenomenon || '', impact: e.impact || '',
        action: e.action || '', assessment: e.assessment || '', outcome: e.outcome || '',
        note: e.note || '', updatedAt: e.updatedAt || '', updatedBy: e.updatedBy || '' }
    }
    /** The human-readable mirror + structured index. A failure is REPORTED (mirror:false), never thrown
     *  and never logged: it must not disturb the existing write-failure accounting (F6). */
    async function feedbackMirror() {
      const all = feedbackEntries()
      let ok = true
      for (const c of FEEDBACK_CATEGORIES) {
        const rows = all.filter((e) => e.category === c)
        const md = ['# 反馈库 · ' + FEEDBACK_CATEGORY_LABELS[c] + '（' + c + '）', '',
          '> 方法论／协作层记录：怎么一起工作（组织、流程、合作、障碍、摩擦）。**不是研究结论**——研究进展见 Progress/，已确立结论见 Verified/。', '']
        for (const e of rows) {
          md.push('## ' + e.id + '｜' + e.route + '｜' + e.status + '｜' + (e.at || ''), '',
            '- 发起人：' + (e.by || '') + '｜类别：' + c + '｜路由：' + e.route + '｜状态：' + e.status,
            '- 情境：' + (e.context || '（未写）'),
            '- 现象：' + (e.phenomenon || ''),
            '- 影响：' + (e.impact || ''),
            '- 已做的调整或建议：' + (e.action || ''))
          if (e.route === 'interpersonal') md.push('- 评估（要不要改／改了是否真更优）：' + (e.assessment || ''))
          if (e.outcome) md.push('- 事后验证／结果：' + e.outcome)
          if (e.note) md.push('- 备注：' + e.note)
          if (e.updatedAt) md.push('- 最近更新：' + e.updatedAt + '（' + (e.updatedBy || '') + '）')
          md.push('')
        }
        if (!rows.length) md.push('（本类暂无条目）', '')
        try { if (!(await writeTextRel(FEEDBACK_DIR + '/' + c + '.md', md.join('\n')))) ok = false } catch (err) { ok = false }
      }
      try {
        if (!(await writeTextRel(FEEDBACK_DIR + '/index.json', JSON.stringify({ counts: feedbackCounts(), entries: all }, null, 2) + '\n'))) ok = false
      } catch (err) { ok = false }
      return ok
    }
    async function feedbackTool(caller, a) {
      const op = String((a && a.op) || '').trim()
      // `off` is NEVER a silent write: the call is refused BY NAME with the reason and the remedy.
      if (!feedbackOn()) {
        return { ok: false, code: 'V5_FEEDBACK_DISABLED', message: FEEDBACK_DISABLED_MESSAGE,
          next: { kind: 'note', tool: 'vibe_v5_set', hint: '由所办把 feedback 设回 \'on\' 后重试（本条没有被静默写入）' } }
      }
      if (op === 'add') {
        const category = String(a.category || '').trim()
        const route = String(a.route || '').trim()
        if (FEEDBACK_CATEGORIES.indexOf(category) < 0) {
          return { ok: false, code: 'V5_FEEDBACK_BAD_CATEGORY', message: 'category 必须是 ' + FEEDBACK_CATEGORIES.join('|'),
            next: { kind: 'note', hint: '合作=cooperation｜管理=management｜流程=process｜障碍=obstacle｜矛盾=conflict' } }
        }
        if (FEEDBACK_ROUTES.indexOf(route) < 0) {
          return { ok: false, code: 'V5_FEEDBACK_BAD_ROUTE', message: 'route 必须是 ' + FEEDBACK_ROUTES.join('|'),
            next: { kind: 'note', hint: 'self=自己的做法（自己调整即可）｜team=组织/工作流（自我调节，无需审批）｜interpersonal=别人造成的、要别人改变（须评估＋事后回填）' } }
        }
        const phenomenon = String(a.phenomenon || '').trim()
        const impact = String(a.impact || '').trim()
        const action = String(a.action || '').trim()
        if (!phenomenon || !impact || !action) {
          return { ok: false, code: 'V5_FEEDBACK_INCOMPLETE', message: 'add 需要 phenomenon／impact／action（现象、影响、已做的调整或建议）',
            next: { kind: 'note', hint: '写清"看到了什么／造成什么／我已经或打算怎么调整"' } }
        }
        const assessment = String(a.assessment || '').trim()
        // ONLY the interpersonal route gates on the careful evaluation: self/team are self-regulation
        // (the user ruling: no approval step, adjust as soon as it looks wrong).
        if (route === 'interpersonal' && !assessment) {
          return { ok: false, code: 'V5_FEEDBACK_NEEDS_ASSESSMENT', message: 'interpersonal 路由必须带 assessment：先想清楚"要不要让别人改、改了是否真的更优"',
            next: { kind: 'note', hint: '若发现只能靠自己调整，请改记 self；确实需要别人改变时，写完评估再跟进事后验证' } }
        }
        const base = { at: now(), by: caller, category, route, status: 'open',
          context: String(a.context || ''), phenomenon, impact, action, assessment,
          outcome: '', note: String(a.note || ''), updatedAt: '', updatedBy: '' }
        let entry = null
        await patchInstitute({ feedback: (cur) => {
          const list = Array.isArray(cur) ? cur.slice() : []
          entry = Object.assign({ id: 'fb-' + (list.length + 1) }, base)
          list.push(entry)
          return list
        } })
        const mirror = await feedbackMirror()
        return { ok: true, entry: feedbackView(entry), mirror, counts: feedbackCounts(),
          routeHint: route === 'interpersonal'
            ? 'interpersonal：已记录。请按评估结论处理，并用 update 回填 outcome（事后验证）才算闭环。'
            : 'self/team：无需任何人采纳——自己调整即可，并用 update 把状态/结果记下来（self/team 的记录本身就是闭环凭据）。' }
      }
      if (op === 'update') {
        const id = String(a.id || '').trim()
        if (!id) return { ok: false, code: 'V5_FEEDBACK_NO_ID', message: 'update 需要 id', next: { kind: 'note', hint: '先用 op=list（默认只看未闭环）确认 id（形如 fb-1）' } }
        const cur = feedbackEntries().find((x) => x.id === id)
        if (!cur) return { ok: false, code: 'V5_FEEDBACK_NOT_FOUND', message: '没有条目 ' + id, next: { kind: 'note', hint: '先用 op=list 确认 id' } }
        // Permission: the INITIATOR updates their own entry; the OFFICE may update any (mark it resolved /
        // write the result back). Anyone else is refused BY NAME — never silently ignored.
        if (caller !== 'office' && caller !== cur.by) {
          return { ok: false, code: 'V5_FEEDBACK_FORBIDDEN', message: '只有发起人（' + cur.by + '）或所办可以更新 ' + id,
            next: { kind: 'note', hint: '别人的问题请自己另记一条（你只能更新自己发起的条目）' } }
        }
        const status = a.status === undefined ? '' : String(a.status).trim()
        if (status && FEEDBACK_STATUSES.indexOf(status) < 0) {
          return { ok: false, code: 'V5_FEEDBACK_BAD_STATUS', message: 'status 必须是 ' + FEEDBACK_STATUSES.join('|'),
            next: { kind: 'note', hint: 'open=未处理｜adjusted=已自我调整｜closed=已回填结果｜dropped=评估后决定不改（需理由）' } }
        }
        const outcome = a.outcome === undefined ? '' : String(a.outcome).trim()
        const note = a.note === undefined ? '' : String(a.note).trim()
        // The interpersonal route is the ONLY one that must PROVE the change helped: closing it without
        // the written-back verification is refused (that is exactly why the route exists).
        if (cur.route === 'interpersonal' && status === 'closed' && !outcome) {
          return { ok: false, code: 'V5_FEEDBACK_NEEDS_OUTCOME', message: 'interpersonal 条目闭环必须回填 outcome（事后验证：改了什么、结果如何）',
            next: { kind: 'note', hint: '若评估结论是"不需要别人改"，请用 status=dropped ＋ note 写明理由' } }
        }
        if (status === 'dropped' && !outcome && !note) {
          return { ok: false, code: 'V5_FEEDBACK_NEEDS_REASON', message: 'status=dropped 需要 note 或 outcome 说明"为什么不改"',
            next: { kind: 'note', hint: '评估结论也要留痕，否则下一轮会重新提同一件事' } }
        }
        const changes = { updatedAt: now(), updatedBy: caller }
        if (status) changes.status = status
        if (outcome) changes.outcome = outcome
        if (a.action !== undefined) changes.action = String(a.action)
        if (a.assessment !== undefined) changes.assessment = String(a.assessment)
        if (a.note !== undefined) changes.note = note
        await patchInstitute({ feedback: (list) => (Array.isArray(list) ? list : []).map((x) => (x.id === id ? Object.assign({}, x, changes) : x)) })
        const after = feedbackEntries().find((x) => x.id === id) || cur
        const mirror = await feedbackMirror()
        return { ok: true, entry: feedbackView(after), mirror, counts: feedbackCounts() }
      }
      if (op === 'list') {
        const category = a.category === undefined ? '' : String(a.category).trim()
        const route = a.route === undefined ? '' : String(a.route).trim()
        const all = a.all === true
        const rows = feedbackEntries()
          .filter((e) => (!category || e.category === category) && (!route || e.route === route))
          .filter((e) => all || FEEDBACK_OPEN_STATUSES.indexOf(e.status) !== -1)
          .map(feedbackView)
        return { ok: true, openOnly: !all, count: rows.length, entries: rows, counts: feedbackCounts(),
          note: all ? '全部条目（含已闭环）' : '默认只列未闭环（open|adjusted）；要看全部用 all:true' }
      }
      if (op === 'summary') return { ok: true, counts: feedbackCounts() }
      return { ok: false, code: 'V5_FEEDBACK_BAD_OP', message: 'op 必须是 add|update|list|summary',
        next: { kind: 'note', hint: 'add=写一条；update=状态流转＋回填；list=看未闭环；summary=按类别/路由计数' } }
    }
    /** The per-round line. Deliberately SHORT (P4's lesson: every wake already carries the tool/paper
     *  tails) and it answers WHY / WHAT / the three routes / what happens next, so recording is explained
     *  rather than commanded. */
    function feedbackPushLine(L) {
      if (!feedbackOn()) return
      L.push(''
        + '\n【工作经验／流程反馈（鼓励积极记录）】' + FEEDBACK_DIR + '/'
        + '\n· 为什么记：怎么一起工作（组织、流程、合作、障碍、摩擦）属于**方法论层**的自我调节；研究结论请进 Progress/ 与 Verified/，这里不记结论。'
        + '\n· 记什么：类别（合作/管理/流程/障碍/矛盾）＋路由＋情境/现象/影响＋你**已做的调整或建议**；写到多细由你把控。'
        + '\n· 三条路由：self＝你自己的做法⇒**自己调整，无需谁采纳**；team＝组织/工作流/团队运行的调整⇒**同样无需审批**，觉得不好就及时调整；interpersonal＝**别人造成的、要别人改变才能解决**⇒只有这条要先**缜密评估**"要不要改、改了是否真更优"，并**事后回填验证**。'
        + '\n· 记了之后：未闭环条目会出现在汇报与总览的计数里；用 vibe_v5_feedback 的 update 回填结果即闭环（interpersonal 必须回填 outcome）。')
    }

    function formalPromptBlock(target) {
      if (!formalOn()) return ''
      const mode = formalMode()
      const rec = target ? formalOf(target) : { status: 'none' }
      const L = []
      L.push('【Lean 形式化验证（' + (mode === 'require' ? '强制' : '鼓励') + '模式）】')
      if (rec.status === 'passed') {
        // The whole point of the feature: the review subject CHANGES. And the SECOND half of
        // that point (docs/formal-verification.md §4.1): a statement that says something else
        // than the proposition is NOT a refutation — "偏离 → 0" would make the very mechanism
        // that exists for rigour fabricate a false negative conclusion.
        L.push('  · 该对象已有**通过的 Lean 形式化证明**（' + (rec.proof || rec.file) + '，最近运行 exit 0）。')
        L.push('    **你不需要重新检查推导**。你的任务是**忠实性审查**：逐条核对 Lean 代码里的')
        L.push('    定义 / 对象 / 条件 / 假设 / 结论是否与命题原文**完全一致**。')
        L.push('  ▸ 一致 → verdict = 1。')
        L.push('  ▸ **发现任何偏差，不要投 0**：偏差只说明**形式化不合格**，不代表命题为假。此时请：')
        L.push('      ① verdict 给一个严格介于 0 与 1 之间的值（记为弃权），并在 reason 里写清偏差；')
        L.push("      ② 用回执 formal:{decision:'defect', note:'<具体偏差>'} 记录它。框架会撤回这条证明的")
        // Only `require` actually GATES the conclusion; in `encourage` the framework still
        // withdraws the proof (and records the defect) but must not promise a hold it cannot
        // enforce. Say the same thing v2/v3/v4 say instead of silently omitting it: the
        // voter must know that the ABSTENTION is what keeps this round from concluding.
        L.push('         「已通过」状态（降级为 attempted、删除归档证明、写入形式化待办）'
          + (mode === 'require'
            ? '，本次裁定**不定论**；'
            : '。本档没有门禁：请务必给一个严格介于 0 与 1 之间的弃权值，以保证本轮无法得出一致结论；'))
        L.push('         修正形式化并重新跑通后再投票。')
        L.push('  ▸ 只有当你**独立于这份 Lean 代码**也能确定命题为假时，才投 0，并在 reason 里写清独立理由。')
      } else if (rec.status === 'blocked') {
        L.push('  · 该对象已被记录为**形式化阻塞**：' + (rec.note || '未说明') + '。')
        L.push('    请复核这个判断是否成立；若你认为其实可以形式化，请指出来并动手做。')
      } else {
        L.push('  · 请先判断该对象的**实现难度**：若能在可接受的工作量内形式化，优先写 Lean 代码并执行。')
        // D4 criteria + async honesty (verbatim prompt text, docs/formal-verification.md §6).
        L.push('  · 形式化只写你有把握的版本；没把握就记 blocked 并写清难点——不要用形式化掩盖不确定。')
        L.push('  · 该对象若已有后台编译在队列中，**不得**在它落地前声称已通过或走忠实性审查；等 vibe_v5_lean_lib 显示 passed 再审。')
        L.push('  · 工具：vibe_v5_lean_run（执行）· vibe_v5_lean_archive（归档）· vibe_v5_lean_lib（查已有可复用库）')
        // L1 (deep-review 5): the work directory is documented as the CWD-RELATIVE complete path
        // (what the member's own file tools produce), and the tools accept it as well as the short
        // `Formal/…` form — the two name the same file (`leanAbsPath` strips the prefix).
        L.push('  · 工作目录（**相对会话工作目录**，你自己的文件工具按这个基准解析）：' + formalRootRel() + '/')
        L.push('    （= 研究所根下的 Formal/；v5 工具的 file 参数两种写法都接受：上面这条完整路径，或短的 Formal/xxx.lean。）')
        L.push('    可复用定义放 ' + formalLibRoot().replace(/\\/g, '/') + '/，')
        L.push('    已证引理放 ' + formalProvedRoot().replace(/\\/g, '/') + '/；写之前先 vibe_v5_lean_lib 查重。')
        L.push('  · **一旦 Lean 通过，你唯一需要确认的就是忠实性**：定义 / 对象 / 条件 / 假设 / 结论是否与')
        L.push('    命题原文逐条一致。请把注意力放在这种核对上，而不是重新做一遍推导。')
        if (mode === 'require') {
          L.push('  · **本模式要求**：必须产出 Lean 形式化，或**必须**给出显式的阻塞原因——用')
          L.push("    vibe_v5_lean_archive kind='blocked' note=… 记录，或用回执 formal:{decision:'blocked', note:…}。")
          L.push('    只有 decision=\'blocked\' 的 note 会写成阻塞记录；decision=\'used\' 的 note 只是难度判断，')
          L.push('    **不会**打开定论门禁。两者都没有时，本次裁定不会生效，')
          L.push('    会被记为未定论（原因 formal-required）并进入「形式化待办」。')
        } else {
          L.push("  · 若你判断不值得或无法形式化，可以不做，但请在回执的 formal 字段写明难度判断（decision='blocked' 时必须写明 note）。")
        }
        L.push('  · 归档可复用定义/引理前先跑通（vibe_v5_lean_archive run=true 或先 vibe_v5_lean_run）；跑不通不要入库。')
        L.push('  · 宿主没有 Lean 工具链（LEAN_NOT_FOUND）或根本没有 subprocess 服务（NO_SUBPROCESS）时：把代码写下来归档，并把"宿主无 Lean 工具链"写成**阻塞记录**（vibe_v5_lean_archive kind=\'blocked\' note=… 或回执 formal:{decision:\'blocked\', note:…}）——这算显式阻塞原因，定论门禁可以据此放行。')
      }
      return L.join('\n')
    }
    function formalWorkLine() {
      if (!leanDailyOn()) return ''
      const eager = leanInitiative() === 'eager'
      return '【顺手形式化（' + (formalOn() ? (formalMode() === 'require' ? '强制' : '鼓励') : '主动（leanInitiative=eager）') + '）】'
        + (eager ? '**主动**把工作中出现的有价值的小引理、命题、定义顺手形式化并存库；' : '')
        + '把你工作中常用或可能复用的对象、假设、'
        + '新定义用 Lean 形式化定义并归档到全局可复用库（vibe_v5_lean_archive kind=\'def\'），已成立的引理归到 Proved/'
        + '（kind=\'lemma\'）；写之前先 vibe_v5_lean_lib 查重，避免重复定义。'
        + '归档前先跑通（vibe_v5_lean_run 或 run=true）；跑不通的定义不要进可复用库。'
        + '\n  · 判断标准：① 有价值或可能复用；② 较为关键或必要；③ 你对该陈述有把握（置信度高）。**没把握的先别入库**——'
        + '进了 Formal/Proved 的东西会被当成已核对引理；没把握就记 blocked 并写清难点，别用形式化掩盖不确定。'
        + '\n  · 复用优先：写新定义/证明前**先 vibe_v5_lean_lib 查已有库**；复用已归档内容用 '
        + '`import Formal.Lib.<name>` / `import Formal.Proved.<name>`（模块根 = <VibeMath 根>，框架已把它加进编译搜索路径），'
        + '或 `vibe_v5_lean_read {name}` 取原文逐字复制。**查不到再新写**；同内容重复归档会自动去重。'
        + '\n  · 编译默认走后台队列（leanAsync=true）：入队后你可以继续工作；用 vibe_v5_lean_lib 的 jobs 字段或下一轮提示里的 '
        + '【形式化结果】行看结果。**在作业落地为“通过”之前，不得把该对象当成已通过。**'
        + (formalMode() === 'require'
          ? '本模式下，任何要定论为真/假的对象都必须先有 Lean 通过或显式阻塞记录。'
          : '这会让后续的验证与证明省掉大量重复工作。')
    }
    // ---- the three indexes (framework-maintained) ---------------------------
    async function writeFormalIndex() {
      const recs = formalRecords()
      const L = ['# Lean 形式化索引｜' + instituteName + '｜' + fmtTime(), '',
        '> 本文件由框架维护（工具调用时更新；`vibe_v5_lean_lib` 会重建）。权威状态在 State/<研究所>.v5state.json 里。', '',
        '| 对象 | 状态 | 形式化文件 | 归档证明 | 最近运行 | 难度判断 / 阻塞原因 |', '|---|---|---|---|---|---|']
      const keys = Object.keys(recs)
      if (!keys.length) L.push('| （暂无） | | | | | |')
      for (const k of keys) {
        const r = recs[k] || {}
        const run = r.run ? (r.run.ok ? 'ok（exit 0，' + ((r.run.ms || 0) / 1000).toFixed(1) + 's）' : 'fail（exit ' + r.run.exitCode + '，' + ((r.run.ms || 0) / 1000).toFixed(1) + 's）') : '—'
        L.push('| ' + k + ' | ' + (r.status || 'none') + ' | ' + (r.file || '—') + ' | ' + (r.proof || '—') + ' | ' + run + ' | ' + String(r.note || '—').replace(/\|/g, '/').slice(0, 120) + ' |')
      }
      L.push('')
      if (formalTodo().length) {
        L.push('## 形式化待办（require 模式：定论被搁置）')
        for (const t of formalTodo()) L.push('- ' + t.id + ' —— ' + (t.why || 'formal-required') + '（' + fmtTime(t.at) + '）')
        L.push('')
      }
      await writeTextRel('Formal/Index.md', L.join('\n'))
    }
    async function writeFormalTodo() {
      const list = formalTodo()
      const L = ['# 形式化待办｜' + instituteName + '｜' + fmtTime(), '',
        '> 这些对象在 `require` 模式下尚不具备「Lean 已通过」或「显式阻塞记录」，因此**定论被搁置**。',
        '> 完成形式化（vibe_v5_lean_archive kind=\'proof\'）或记录阻塞原因（kind=\'blocked\'）后，重新提议验证即可。', '']
      if (!list.length) L.push('（暂无）')
      for (const t of list) L.push('- ' + t.id + '｜' + (t.why || 'formal-required') + '｜' + fmtTime(t.at))
      L.push('')
      await writeTextRel('Formal/TODO.md', L.join('\n'))
    }
    async function rebuildLeanLibIndexes() {
      // Listing must be CHEAP and side-effect free: it does NOT execute the toolchain
      // (running `lean` on every library file each time an agent asked "what can I reuse?"
      // would be slow and surprising). Per-object run results live in the object records
      // and are shown in Formal/Index.md.
      const scan = async (dirAbs, dirRel, kindLabel) => {
        const rows = []
        try {
          const t = await fs.resolve(dirAbs)
          if (await fs.stat(t) === undefined) return rows
          const entries = await fs.listDir(t)
          for (const e of entries || []) {
            if (!e || e.type !== 'file' || !/\.lean$/.test(String(e.name))) continue
            const rel = dirRel + '/' + e.name
            const txt = (await readTextAbs(dirAbs + '/' + e.name)) || ''
            const name = String(e.name).replace(/\.lean$/, '')
            const first = (txt.split('\n').filter((l) => l.trim() && !/^\s*(\/\/|--|import)/.test(l))[0] || '').trim().slice(0, 110)
            // Dependency column (docs/formal-verification.md §9): what this file imports — the
            // answer to "can I reuse it, and what does it drag in?".
            const depend = (txt.split('\n').filter((l) => /^\s*import\s+/.test(l)).map((l) => l.replace(/^\s*import\s+/, '').trim()).join('、')) || '—'
            rows.push('| ' + name + ' | ' + rel + ' | ' + kindLabel + ' | ' + first.replace(/\|/g, '/') + ' | ' + depend.replace(/\|/g, '/') + ' |')
          }
        } catch (e) { /* listing is best-effort */ }
        return rows
      }
      const libRows = await scan(formalLibRoot(), 'Formal/Lib', 'def')
      await writeTextAbs(vibeRoot() + '/Formal/Lib/Index.md', ['# 可复用 Lean 定义库（跨项目）｜' + instituteName, '',
        '> 写新定义之前先查这里：能复用就不要重新定义。', '',
        '| 名称 | 文件 | 类别 | 摘要 | 依赖 |', '|---|---|---|---|---|']
        .concat(libRows.length ? libRows : ['| （暂无） | | | | |']).join('\n') + '\n')
      const provedRows = await scan(formalProvedRoot(), 'Formal/Proved', 'lemma')
      await writeTextAbs(vibeRoot() + '/Formal/Proved/Index.md', ['# 已成立的 Lean 命题 / 引理（机器已核对，可跨项目复用）｜' + instituteName, '',
        '> 这些文件是通过内核检查的引理，可直接 import 复用。', '',
        '| 名称 | 文件 | 类别 | 陈述 | 依赖 |', '|---|---|---|---|---|']
        .concat(provedRows.length ? provedRows : ['| （暂无） | | | | |']).join('\n') + '\n')
      await writeFormalIndex()
      await writeFormalTodo()
      return { lib: libRows.length, proved: provedRows.length, objects: Object.keys(formalRecords()).length }
    }
    // A vibe-root-relative path → absolute. Used for the GLOBAL library, which sits beside
    // the project tree rather than inside the current institute.
    function instRootless(rel) { return vibeRoot() + '/' + String(rel).replace(/^\.\//, '') }

    // Execute one Lean file through the toolchain, record the run (optionally against an
    // object), refresh the indexes, and report the outcome verbatim. Deliberately called
    // even from `off` mode: a human debugging their toolchain may want it.
    // `leanAsync` (default): ENQUEUE and return immediately — the compiler has not been
    // started when this returns (docs/formal-verification.md §7-2). `false`: today's await.
    async function leanRunTool(memberId, o) {
      const args = o || {}
      const rel = String(args.file || '')
      if (params.leanAsync !== false) {
        const pre = await leanPrecheck(rel)
        if (pre.ok === false) return Object.assign({ async: null }, pre)
        const fileText = await readTextAbs(pre.abs)
        const text = fileText === undefined ? '' : String(fileText)
        const pfx = await leanRunPrefix()
        const target = idSafe(String(args.target || ''))
        const job = await enqueueLeanJob({
          jobId: leanJobId(target || pre.rel, leanBuildDigest(text, pfx.prefix)), kind: 'run', rel: pre.rel, file: pre.rel,
          target, member: memberId, contentSha256: sha256Hex(leanHashText(text)), buildHash: leanBuildHash(pfx.prefix),
          buildPrefix: pfx.prefix, timeoutMs: args.timeout_ms,
        })
        return {
          ok: true, async: { jobId: job.jobId, state: 'queued' }, jobId: job.jobId,
          file: pre.rel, target: target || undefined,
          message: '已入队后台编译；你可以继续工作。结果会写入 Formal/ 与索引，并在**你**下一轮提示里公告一次；'
            + '长期查询用 vibe_v5_lean_job {jobId} 或 Formal/Jobs/<jobId>.json（vibe_v5_lean_lib 的 jobs 字段也会列出）。'
            + '注意：公告只投给发起者、且重启后不再补发，所以别的成员（或重启后的你）请用上面两条长期路径查看。',
        }
      }
      const run = await leanRunFile(rel, args.timeout_ms)
      if (run.ok || run.file) {
        if (String(args.target || '').trim()) await formalSetRun(String(args.target), run)
        await writeFormalIndex()
      }
      if (run.ok) {
        await saveChatLine('【形式化】' + memberId + ' 运行 Lean 通过：' + run.file
          + '（' + (run.ms / 1000).toFixed(1) + 's）' + (args.target ? '｜对象 ' + args.target + ' 记为已尝试（若此前已通过/已阻塞则保留原状态）' : ''))
      }
      return Object.assign({ ok: !!run.ok }, run, {
        async: null,
        hint: run.ok
          ? '通过。若是某个对象的证明，请用 vibe_v5_lean_archive kind=\'proof\' 归档（会写入 Verified/Lean/ 并把审查对象变成忠实性）；若是可复用定义/引理，用 kind=\'def\'/\'lemma\' 归档到全局库。'
          : '未通过。请按上面的编译器输出修复后重跑；若判断无法完成，用 vibe_v5_lean_archive kind=\'blocked\' 记录原因。',
      })
    }
    // Read an ARCHIVED definition/lemma verbatim (docs/formal-verification.md §5.4): the reuse
    // path is `lean_lib` (what exists) → `lean_read` (its exact text) → `import` or copy.
    async function leanRead(o) {
      const args = o || {}
      const raw = String(args.name || '').trim().replace(/\.lean$/i, '')
      if (!raw) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'name is required' }
      // Reject a path-shaped name outright: the guard must refuse `../`, absolute paths and
      // any sub-directory, not silently sanitise them into a different file.
      if (raw.indexOf('/') !== -1 || raw.indexOf('\\') !== -1 || raw.indexOf('..') !== -1 || /^[a-z]:/i.test(raw)) {
        return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'name must be a plain archived file name (no path separators, no .., no absolute path)' }
      }
      const name = idSafe(raw)
      if (!name || name !== raw) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'name is not a valid archived file name' }
      const kindArg = String(args.kind || 'auto')
      if (['auto', 'lib', 'proved'].indexOf(kindArg) === -1) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: "kind must be 'auto' | 'lib' | 'proved'" }
      const dirs = kindArg === 'auto' ? ['Lib', 'Proved'] : [kindArg === 'lib' ? 'Lib' : 'Proved']
      for (const d of dirs) {
        const rel = 'Formal/' + d + '/' + name + '.lean'
        const abs = leanAbsPath(instRootless(rel))
        if (abs === null) continue
        const txt = await readTextAbs(abs)
        if (txt === undefined) continue
        const full = String(txt)
        const truncated = full.length > LEAN_READ_MAX_BYTES
        return {
          ok: true, name, file: rel, kind: d === 'Lib' ? 'lib' : 'proved',
          sha256: sha256Hex(leanHashText(full)),
          bytes: new TextEncoder().encode(full).length,
          text: truncated ? full.slice(0, LEAN_READ_MAX_BYTES) : full,
          truncated,
        }
      }
      return { ok: false, code: 'V5_NOT_FOUND', message: 'no archived ' + (kindArg === 'auto' ? 'definition/lemma' : kindArg) + ' named ' + name }
    }
    async function leanArchive(memberId, o) {
      const args = o || {}
      const kind = String(args.kind || '')
      const content = typeof args.content === 'string' ? args.content : undefined
      const from = args.from ? String(args.from) : ''
      if (kind === 'def' || kind === 'lemma') {
        const name = idSafe(String(args.name || ''))
        if (!name) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'name is required for a reusable definition/lemma' }
        let body = content
        if (body === undefined && from) {
          const srcAbs = leanAbsPath(from)
          if (srcAbs === null) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'from must be a .lean file inside the workspace (got ' + from + ')' }
          body = await readTextAbs(srcAbs)
        }
        if (body === undefined) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'provide content, or from=<existing .lean file>' }
        const rel = 'Formal/' + (kind === 'def' ? 'Lib' : 'Proved') + '/' + name + '.lean'
        const sha = sha256Hex(leanHashText(String(body)))
        // Content-hash dedupe (docs/formal-verification.md §5.3): the file already holds EXACTLY
        // this content AND the recorded run for that content succeeded ⇒ skip rewrite + compile.
        const fileSha = await leanHashFile(instRootless(rel))
        if (fileSha === sha && await leanLibArchivedOk(name, sha)) {
          return { ok: true, deduped: true, kind, name, file: rel, sha256: sha, note: '内容与已归档版本一致，跳过重写与重编译' }
        }
        const okWrite = await writeTextAbs(instRootless(rel), body)
        if (!okWrite) return { ok: false, code: 'V5_WRITE_FAILED', message: 'could not write ' + rel }
        if (args.run !== false && params.leanAsync !== false) {
          // The global library sits beside the project tree, so it is executed through its
          // ABSOLUTE path (the relative form would resolve inside the institute root).
          const pre = await leanPrecheck(instRootless(rel))
          if (pre.ok === true) {
            const pfx = await leanRunPrefix()
            const job = await enqueueLeanJob({
              jobId: leanJobId(name, leanBuildDigest(String(body), pfx.prefix)), kind: 'lib', rel: instRootless(rel), file: rel, name,
              member: memberId, contentSha256: sha, buildHash: leanBuildHash(pfx.prefix), buildPrefix: pfx.prefix, content: String(body),
            })
            await rebuildLeanLibIndexes()
            await saveChatLine('【形式化】' + memberId + ' 归档了' + (kind === 'def' ? '可复用定义' : '已证引理') + ' `' + name + '` → ' + rel + '（已入队后台编译）')
            return { ok: true, kind, name, file: rel, sha256: sha, async: { jobId: job.jobId, state: 'queued' }, jobId: job.jobId, note: '已并入全局可复用库（后台编译中）：用 vibe_v5_lean_lib 的 jobs 字段查看结果' }
          }
          // No usable toolchain on this host: fall through to the synchronous path so the honest
          // NO_SUBPROCESS / LEAN_NOT_FOUND result is recorded exactly as before.
        }
        const run = args.run === false ? null : await leanRunFile(instRootless(rel))
        // Mirror the outcome as a job record: later re-archives of the SAME content dedupe
        // against it (and it is what `Formal/Jobs/` recovery scans).
        if (run) await leanWriteJob({
          jobId: leanJobId(name, sha), kind: 'lib', rel: instRootless(rel), file: rel, name,
          member: memberId, contentSha256: sha, state: run.ok ? 'settled' : (run.timedOut ? 'timeout' : 'failed'),
          attempts: 1, enqueuedAt: now(), startedAt: now(), settledAt: now(),
          exitCode: run.exitCode === undefined ? null : run.exitCode, ok: !!run.ok,
          timedOut: !!run.timedOut, interrupted: false,
        })
        await rebuildLeanLibIndexes()
        await saveChatLine('【形式化】' + memberId + ' 归档了' + (kind === 'def' ? '可复用定义' : '已证引理') + ' `' + name + '` → ' + rel
          + (run ? '（运行 ' + (run.ok ? '通过' : '未通过') + '）' : ''))
        return { ok: true, kind, name, file: rel, sha256: sha, async: null, run: run || undefined, note: '已并入全局可复用库，后续项目可直接 import 复用' }
      }
      if (kind === 'proof') {
        const target = idSafe(String(args.target || ''))
        if (!target) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'target is required for kind=proof' }
        let body = content
        if (body === undefined && from) {
          const srcAbs = leanAbsPath(from)
          if (srcAbs === null) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'from must be a .lean file inside the workspace (got ' + from + ')' }
          body = await readTextAbs(srcAbs)
        }
        if (body === undefined) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'provide content, or from=<existing .lean file>' }
        const workRel = 'Formal/' + target + '.lean'
        const sha = sha256Hex(leanHashText(String(body)))
        const prev = formalOf(target)
        // Dedupe (§5.3): the object is already `passed` AND the work file still holds EXACTLY
        // this content ⇒ the compile result is already known: skip rewrite + recompile.
        if (prev.status === 'passed' && (await leanHashFile(workRel)) === sha) {
          return { ok: true, deduped: true, kind, target, file: workRel, sha256: sha, proof: prev.proof || ('Verified/Lean/' + target + '.lean'), fidelity: prev.fidelity || null, abstainedCount: Number((prev.fidelity || {}).abstainedCount || 0), note: '内容与已归档版本一致，跳过重写与重编译' }
        }
        if (!await writeTextRel(workRel, body)) return { ok: false, code: 'V5_WRITE_FAILED', message: 'could not write ' + workRel }
        if (params.leanAsync !== false) {
          const pre = await leanPrecheck(workRel)
          if (pre.ok === true) {
            const pfx = await leanRunPrefix()
            const job = await enqueueLeanJob({
              jobId: leanJobId(target, leanBuildDigest(String(body), pfx.prefix)), kind: 'proof', rel: workRel, file: workRel, target,
              member: memberId, contentSha256: sha, buildHash: leanBuildHash(pfx.prefix), buildPrefix: pfx.prefix, content: String(body),
            })
            // The object is `attempted` while the job is queued: it may only become `passed`
            // when the job settles ok (exit 0 + unchanged hash). A previous proof pointer is
            // dropped because the file it referred to has just been overwritten.
            const rec0 = Object.assign({}, prev, {
              status: prev.status === 'blocked' ? 'blocked' : 'attempted',
              file: workRel, proof: '',
              decision: 'used', note: String(args.note || prev.note || ''),
              async: { jobId: job.jobId, state: 'queued', attempts: 0, enqueuedAt: job.enqueuedAt, startedAt: 0, settledAt: 0, exitCode: null },
              updatedAt: now(),
            })
            await putFormal(target, rec0)
            await rebuildLeanLibIndexes()
            await saveChatLine('【形式化】' + memberId + ' 为 ' + target + ' 归档形式化证明 ' + workRel
              + '（已入队后台编译；落地为“通过”之前**不会**写 Verified/Lean/、也不会转为忠实性审查）')
            return { ok: true, kind, target, file: workRel, sha256: sha, async: { jobId: job.jobId, state: 'queued' }, jobId: job.jobId, status: rec0.status, fidelity: rec0.fidelity || prev.fidelity || null, abstainedCount: Number(((rec0.fidelity || prev.fidelity) || {}).abstainedCount || 0), note: '已入队后台编译；只有作业落地为“通过”才会写 Verified/Lean/ 并转为忠实性审查' }
          }
          // No toolchain: fall through to the synchronous path (honest NO_SUBPROCESS record).
        }
        const run = await leanRunFile(workRel)
        const passed = !!run.ok
        const rec = Object.assign({}, prev, {
          status: passed ? 'passed' : 'attempted',
          file: workRel,
          // A FAILED re-archive must also drop the pointer to the previous proof: the code
          // that proof referred to has just been overwritten by `body` (the file that failed),
          // so keeping it would advertise `Verified/Lean/<id>.lean` as this object's proof
          // while the object's own last run is a failure — a self-contradicting record, and
          // a pointer that the reviewer's `formalPromptBlock(rec.proof)` would print.
          proof: passed ? 'Verified/Lean/' + target + '.lean' : '',
          decision: 'used',
          note: String(args.note || prev.note || ''),
          run: { at: now(), ok: !!run.ok, exitCode: run.exitCode === undefined ? null : run.exitCode, ms: run.ms || 0, stdoutTail: tail(run.stdout, 800), stderrTail: tail(run.stderr, 800) },
          async: null,
          updatedAt: now(),
        })
        if (passed) await writeTextRel('Verified/Lean/' + target + '.lean', body)
        await putFormal(target, rec)
        await rebuildLeanLibIndexes()
        await saveChatLine('【形式化】' + memberId + ' 为 ' + target + ' 归档形式化证明 ' + workRel
          + '（运行 ' + (passed ? '**通过**，已归档到 ' + rec.proof + '，验证转为忠实性审查' : '**未通过**：' + tail(run.stderr || run.message, 160)) + '）')
        return { ok: true, kind, target, file: workRel, sha256: sha, proof: rec.proof, passed, run, status: rec.status, async: null, fidelity: rec.fidelity || prev.fidelity || null, abstainedCount: Number(((rec.fidelity || prev.fidelity) || {}).abstainedCount || 0) }
      }
      if (kind === 'blocked') {
        const target = idSafe(String(args.target || ''))
        if (!target) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'target is required for kind=blocked' }
        const note = String(args.note || '').trim()
        if (!note) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: '阻塞记录必须写明原因（note）——"因难度决定不做形式化"必须显式、可审计' }
        const prev = formalOf(target)
        const rec = Object.assign({}, prev, { status: 'blocked', decision: 'blocked', note, updatedAt: now() })
        await putFormal(target, rec)
        await rebuildLeanLibIndexes()
        await saveChatLine('【形式化】' + memberId + ' 记录 ' + target + ' 形式化阻塞：' + note)
        return { ok: true, kind, target, status: 'blocked', note }
      }
      return { ok: false, code: 'V5_INVALID_ARGUMENT', message: "kind must be 'def' | 'lemma' | 'proof' | 'blocked'" }
    }


    // ---- context / compaction accounting ---------------------------------
    // A SHORT core-rules recap, injected ONLY (a) right after a REAL compaction, or
    // (b) in the same wake as a soft-compact directive — never on every round. The
    // charter itself lives in `persona` and needs no reinforcement otherwise.
    // A function, not a frozen string: the member-facing library path must reflect the LIVE
    // project/institute (DEFECT A) — a path captured at session creation could point at the
    // default project after a `configure`.
    const coreRules = () => '[核心规则] 只有 Verified/（及标记"已验证·真/假"的卡片）算已确立；' +
      '任何对象要进 Verified/，必须至少有 m 名有表决权者投出布尔值（恰好 1 或恰好 0）**且没有任何一张反向票**，否则留库附平均概率；' +
      '你只写自己的库（' + instRel('Members/<你>/') + '——相对**会话工作目录**），可只读任何人的库；组织与分派由院士负责，但判断属于你自己；' +
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
    // ONLY the literal 'office' is the office. An EMPTY id means "nobody identifiable" and is
    // NOT the office: `memberIdOfAgent` answers '' for an unrelated descendant of the root (a
    // dismissed member's stale child, a nested helper under the office root) and for a synthetic
    // context with no known member, so `!id || id === 'office'` let such a caller pass EVERY
    // office gate and sign its writes as the office (audit L6 follow-up). Office-capable tool
    // handlers now resolve their caller with `officeCaller` and refuse on '' before reaching
    // here; this predicate fails closed as the second line of defence.
    const isOffice = (id) => id === 'office'
    const isAcademician = (id) => { const m = memberById(id); return !!m && m.kind === 'academician' }
    // MUST be awaited by its callers: `inst()` reads `stateCache`, which `commit` only updates
    // once its own await resolves. Fire-and-forget here meant two cards written in one reply
    // (a single reply can carry `record: [ … ]`) both read the same `artifactCount` and
    // committed the same `n`, and the `meetingKeepEvery` auto-sync could fire twice on one
    // count (audit M6).
    async function bumpArtifacts() {
      const inst0 = inst()
      const n = (Number(inst0.artifactCount) || 0) + 1
      await commit(EV.progress, { at: now(), artifactCount: n })
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
      if (!memberId || !memberById(memberId)) return memberDiagnosis('记录研究进度（vibe_v5_record_progress）', memberId)
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
      if (!memberId || !memberById(memberId)) return memberDiagnosis('记录成果卡片（vibe_v5_record_proposition/method/subproblem）', memberId)
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
        '- 概率: ' + clamp01(args.p).toFixed(2),
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
      await bumpArtifacts()
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
    // `t-N` ids are minted by the fold's allocator inside `taskCreate` (HIGH 1); there is no
    // read-side id preview any more, because an id read outside the fold is exactly what allowed
    // two concurrent creates to mint the same one.
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
      const task = {
        id: '', revision: 1, subject, description,
        status: 'pending', ownerId: '',
        blockedBy, writeScopes: scopes,
        priority: Number.isFinite(Number(args.priority)) ? Number(args.priority) : 0,
        createdBy: isOffice(memberId) ? 'office' : memberId,
        assignedBy: '', why: '', acceptance: '',
        createdAt: now(), updatedAt: now(),
      }
      // HIGH 1: the id and the `counters.task` bump happen INSIDE the fold. The dependency check
      // runs there too, against the FINAL id; a rejection returns null so the fold writes nothing
      // (an earlier shape allocated the id here and committed the bumped counter separately, so
      // two same-tick creates could mint the same `t-N` and the fold's upsert overwrote one).
      const got = { err: null }
      await commit(EV.task, { make: (alloc) => {
        task.id = alloc.next('task')
        try { validateDeps(task.id, blockedBy) } catch (e) { got.err = e; return null }
        return task
      } })
      if (got.err) throw got.err
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
    // `meta` is an INTERNAL positional argument (not part of the tool's `args`, so the advertised key
    // surface of `vibe_v5_task_update` is unchanged): it lets an in-product caller fold extra fields into
    // the SAME compare-and-set write instead of issuing a second, unprotected one.
    async function taskUpdate(memberId, o, meta) {
      // An unknown caller must be refused HERE as well: `owner = task.ownerId === memberId` is true
      // for an UNOWNED task (ownerId '') when memberId is '', so without this guard an
      // unidentifiable caller would count as the owner of every unclaimed task (audit L6 follow-up).
      if (!memberId) return memberDiagnosis('修改任务（vibe_v5_task_update）', memberId)
      const args = o || {}
      const id = String(args.task_id || args.taskId || '')
      const task = inst().tasks.find((x) => x.id === id)
      if (!task) return { ok: false, code: 'V5_TASK_NOT_FOUND', message: 'task ' + id + ' not found' }
      if (task.status === 'deleted') return { ok: false, code: 'V5_TASK_DELETED', message: 'task ' + id + ' is deleted' }
      const expected = Number(args.expected_revision !== undefined ? args.expected_revision : args.expectedRevision)
      if (!Number.isFinite(expected)) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'expected_revision is required' }
      if (expected !== task.revision) {
        // F6 (deep-review 5): this message is routed into Chinese frames (`【研究所提示】…`), where a
        // raw English diagnostic reads as noise. The CODE stays (`V5_TASK_STALE_REVISION`) and the
        // revision numbers stay, but the sentence is Chinese now for the member reading it.
        return { ok: false, code: 'V5_TASK_STALE_REVISION', message: '任务 ' + id + ' 当前 revision 是 ' + task.revision + '，不是 ' + expected + ' —— 请先用 vibe_v5_task_get 重新读取（code: V5_TASK_STALE_REVISION）' }
      }
      const action = String(args.action || '')
      const office = isOffice(memberId)
      // S6（D1/D2/D6/D8）：板上"组织动作"＝默认表的 `board` 面；持 `assign` 授权时**同一权限面**随之生效
      // （`vibe_v5_assign` 内部正是靠 reassign 落地它的分派）。授权只改"默认权限表"这一层。
      // `meta.authorized` 是**内部**位置参数：同一命令内部沿用其已经确立的判定（见 `taskAssign` 的注释）。
      const lead = !!(meta && meta.authorized === true) || canDo(memberId, 'board').ok || canDo(memberId, 'assign').ok
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
      // G4: assignment metadata travels INSIDE this CAS-protected write. The old shape wrote the task a
      // second time afterwards (`putTask(withMeta)`), reusing the revision it had just read and never
      // bumping it — a concurrent `task_update` landing in that window was silently swallowed and left no
      // revision trace. Gated to `reassign` so no other action can be given out-of-band fields.
      if (meta && action === 'reassign') {
        if (meta.assignedBy !== undefined) next.assignedBy = String(meta.assignedBy)
        if (meta.why !== undefined) next.why = String(meta.why)
        if (meta.acceptance !== undefined) next.acceptance = String(meta.acceptance)
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
      if (!memberId) return memberDiagnosis('分派任务（vibe_v5_assign）', memberId)
      const denyAssign = await gateDo(memberId, 'assign', 'only the academician (or the office) can assign tasks')
      if (denyAssign) return denyAssign
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
      const r = await taskUpdate(memberId, { task_id: taskId, expected_revision: (cur ? cur.revision : 1), action: 'reassign', owner: to },
        // S6（D1/D2/D6/D8）：`authorized` 是**内部**位置参数（不在工具 args 面上）：`vibe_v5_assign` 已经把
        // 权限判定做过了（含 `once` 授权在获批时即被消费）⇒ 它自己的这次板上写入必须**沿用**该判定，
        // 否则"被授权者调用 assign"会在内部 reassign 处再次被判为无权。
        { assignedBy: isOffice(memberId) ? 'office' : memberId, why, acceptance, authorized: true })
      if (!r.ok) return r
      // G4: NO second write here — the metadata went into the CAS write above (one task commit, so an
      // interleaved task_update can neither be swallowed nor silently lose its revision).
      const withMeta = inst().tasks.find((t) => t.id === taskId) || cur
      const assignerIsOffice = isOffice(memberId)
      await say(assignerIsOffice ? 'office' : memberId, {
        to, kind: 'assign',
        text: '任务 ' + taskId + '「' + withMeta.subject + '」分派给你。理由：' + why + '｜验收标准：' + acceptance +
          '。默认应当执行；若你认为方向有误，请说明理由（会被广播给全所）。' +
          '若你有异议，请在 JSON 里填 reject_assign。',
      })
      await wakeIfIdle(target)
      return { ok: true, task: taskView(withMeta) }
    }
    async function taskPrioritize(memberId, o) {
      if (!memberId) return memberDiagnosis('设置任务优先级（vibe_v5_task_prioritize）', memberId)
      const denyPrio = await gateDo(memberId, 'prioritize', 'only the academician (or the office) can set priorities')
      if (denyPrio) return denyPrio
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
        '> 权威状态在 State/<研究所>.v5state.json 里；本文件只是给人和所办看的快照，勿手改。', '']
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
    // The roster mirror (§8.4): a human-readable staffing table. Like the task-board
    // mirror it is WRITE-ONLY — the authoritative roster is State/<研究所>.v5state.json,
    // so losing or hand-editing this file can never corrupt the institute.
    async function writeRosterMirror() {
      const s = inst()
      const lines = ['# 研究所编制表（人读镜像）｜' + instituteName + '｜' + fmtTime(), '',
        '> 权威状态在 State/<研究所>.v5state.json 里；本文件只是快照，勿手改。', '']
      lines.push('- 求真门槛：' + (voterCount() > 0 ? 'm = ' + quorumM() : '未启动（有表决权者 0 人，m 未定义）') + '（模式 ' + params.quorumMode + '）｜有表决权者 ' + voterCount() + ' 人')
      lines.push('- ' + phaseFactLine())
      lines.push('')
      lines.push('| 代号 | 职位 | 状态 | 雇主 | 方向/用途 | 轮次 | 上下文% |')
      lines.push('|---|---|---|---|---|---|---|')
      // Dismissed members belong ONLY in the 已除名 section below. Listing them here too
      // showed the same person twice and made the roster look like they were still on
      // staff.
      const onBooks = s.members.filter((m) => m.phase !== 'dismissed')
      if (!onBooks.length) lines.push('| （暂无成员） | | | | | | |')
      for (const m of onBooks) {
        lines.push('| ' + m.id + ' | ' + kindLabel(m.kind) + ' | ' + m.phase + ' | ' + (m.hiredBy || '—') + ' | ' +
          String(m.direction || '—').replace(/\|/g, '/').slice(0, 80) + ' | ' + (rounds.get(m.id) || 0) + ' | ' +
          (contextPct.get(m.id) || 0) + ' |')
      }
      lines.push('')
      if (s.members.some((m) => m.phase === 'dismissed')) {
        lines.push('## 已除名（代号永不复用）')
        for (const m of s.members.filter((x) => x.phase === 'dismissed')) {
          lines.push('- ' + m.id + '（' + kindLabel(m.kind) + '）｜' + fmtTime(m.dismissedAt) + '｜原因：' + (m.dismissReason || '未说明'))
        }
        lines.push('')
      }
      await writeTextRel('Institutes.md', lines.join('\n'))
    }

    // ---- consensus verification (m-vote boolean) --------------------------
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
      const full = String(m ? m[1] : text).trim()
      // task-24 (real-host R2, D5'): this used to be `.slice(0, 1200)` with NO marker, so a long statement was
      // cut silently — and the cut text is exactly what voters read and what the verified record carries
      // (a real host registered statements >1200 chars). Keep a cap as generous as the paper sections
      // (20000) and, when a cut DOES happen, say so in-band so the reader knows to open the source file.
      const cap = 20000
      if (full.length <= cap) return { rel, statement: full }
      return {
        rel, truncated: true,
        statement: full.slice(0, cap) + '\n（注意：陈述超过 ' + cap + ' 字符已截断，完整文本见 ' + rel + '）',
      }
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
    // ── R10（docs/02-rulings.md §7.2）：过程判定与结束裁定必须分离 ──────────────────────────
    // `aggregateOpinion()` 只是"当时票数的描述"（永远带 `provisional: true`，永不产出结论）；
    // `judgeVerdict(vs, endedBy)` 只有在辩论**已结束**时才可能给出 outcome：
    //   endedBy = 'round-complete'（每位表决者都作答，本轮结束）| 'bound:idle' | 'bound:round-cap'（具名可撤销触界）。
    // 忘记传 endedBy ⇒ 一律 undecided（fail-safe，绝不隐式收束）。
    const R10 = { separation: 1, provisional: 1, namedBound: 1 }
    const boundOf = (name, why) => ({ name: String(name), why: String(why || ''), at: now(), revocable: true })
    const R10_PROVISIONAL_NOTE = '（过程票数：尚未生效·仅供参考）'
    // ── R10（§7.2）＋ D3/R9（§1 D3、§3 R9）＋ L4：计量与裁定分离 ──────────────────────────
    // `aggregateOpinion()` 只是"当时票数的描述"（`provisional: true`，永不产出结论）：
    //   · E0 = **在册可表决者**（名单口径，永远列出）
    //   · E  = **有效分母**：E0 去掉"明确无法判断/不能应答"者（D3：未答不计分母）
    //   · silent = E 中尚未表态者（D3：**沉默阻塞结题、不算反对、也不折算为同意**）
    //   · abstain = **显式弃权**（计入已投、不计选项）；estimates = 0<p<1 的**中间概率估计**
    //     —— 两者**不同名同义**（L4：术语不得同名不同义）
    function aggregateOpinion(vs) {
      const E0 = voters().map((m) => m.id)
      const unableMap = (vs.unable && typeof vs.unable === 'object') ? vs.unable : {}
      const E = E0.filter((id) => !unableMap[id])
      const P = E0.length
      const Peff = E.length
      const m = quorumMFrom(Peff)
      const votes = vs.votes || {}
      let bTrue = 0, bFalse = 0, abstain = 0, estimates = 0
      const all = []
      const silent = []
      const answered = []
      for (const id of E) {
        const v = votes[id]
        if (!v) { silent.push(id); continue }
        if (v.abstain === true) { answered.push(id); abstain += 1; continue }
        const p = Number(v.prob)
        if (!Number.isFinite(p)) { silent.push(id); continue }
        answered.push(id)
        all.push(p)
        if (p === 1) bTrue += 1
        else if (p === 0) bFalse += 1
        else estimates += 1
      }
      const mean = all.length ? all.reduce((a, x) => a + x, 0) / all.length : 0.5
      return {
        m, P, Peff, bTrue, bFalse, abstain, estimates, mean,
        votedCount: answered.length, answered, silent, unable: Object.keys(unableMap),
        voters: E, votersAll: E0, provisional: true,
      }
    }
    // **结束裁定**：唯一能产出布尔结论的路径（R10），且必须显式说明"辩论为何结束"：
    //   endedBy ∈ 'round-complete'（每位有效表决者都已表态）｜'academician'（院士显式结束，R10-2a）
    //           ｜'bound:idle'／'bound:round-cap'（具名、可撤销的有界触界）
    // D3 参与门与"未答不计分母"**同时成立**：不能应答者不进分母（E 去掉），
    // 能应答却没表态者进 `silent` ⇒ **一律未定论并列出名单**。
    function judgeVerdict(vs, endedBy) {
      const base = aggregateOpinion(vs)
      // S9（U3）：**复议后的门槛只升不降** —— 记录里存的门槛（`threshold.m`）与当轮口径取较大者。
      const raisedM = raisedThresholdOf(vs)
      if (raisedM > Number(base.m || 0)) base.m = raisedM
      if (!endedBy) return Object.assign(base, { outcome: 'undecided', reason: 'R10: 辩论尚未结束（过程票数不构成裁定）' })
      const E = base.voters
      const P = base.Peff
      const m = base.m
      const bTrue = base.bTrue
      const bFalse = base.bFalse
      if (P === 0) return Object.assign(base, { outcome: 'undecided', reason: 'no voters: the institute has no voting members yet' })
      if (base.silent.length) {
        return Object.assign(base, {
          outcome: 'undecided',
          reason: 'D3 参与门：未表态阻塞结题（未表态名单：' + base.silent.join('、') + '；已表态 ' + base.answered.length + '/' + base.Peff + '）',
        })
      }
      if (params.quorumMode === 'all-unanimous') {
        if (bTrue === E.length && bFalse === 0) return Object.assign(base, { outcome: 'true', reason: 'unanimous true' })
        if (bFalse === E.length && bTrue === 0) return Object.assign(base, { outcome: 'false', reason: 'unanimous false' })
        return Object.assign(base, { outcome: 'undecided', reason: 'not unanimous' })
      }
      if (bTrue + bFalse < m) {
        return Object.assign(base, { outcome: 'undecided', reason: 'only ' + (bTrue + bFalse) + ' boolean vote(s); m=' + m + ' required（显式弃权 ' + base.abstain + ' 计入已投但不计选项）' })
      }
      if (bTrue > 0 && bFalse > 0) {
        return Object.assign(base, { outcome: 'undecided', reason: 'conflicting assertions (true=' + bTrue + ', false=' + bFalse + ')' })
      }
      if (bTrue >= m && bFalse === 0) return Object.assign(base, { outcome: 'true', reason: bTrue + ' >= m=' + m + ', all assert true' })
      if (bFalse >= m && bTrue === 0) return Object.assign(base, { outcome: 'false', reason: bFalse + ' >= m=' + m + ', all assert false' })
      return Object.assign(base, { outcome: 'undecided', reason: 'quorum not met' })
    }
    // ONE atomic append to the durable verify queue. The duplicate check and the append both run
    // INSIDE the event fold, so two proposals made in the same tick can no longer both read the
    // same array and overwrite each other's entry (the audit's lost-proposal race: a
    // `Promise.all` of two `vibe_v5_propose_verify` calls kept only the second, while both calls
    // reported `ok:true` and the first target existed in neither the queue nor `verdicts`).
    async function appendToQueue(entry) {
      let result = { appended: false, length: 0 }
      await commit(EV.queue, { queue: (cur) => {
        const list = Array.isArray(cur) ? cur : []
        if (list.some((p) => p && p.target === entry.target)) { result = { appended: false, length: list.length }; return list }
        const next = list.concat([entry])
        result = { appended: true, length: next.length }
        return next
      } })
      return result
    }
    // Remove and return the head in ONE atomic commit: an append landing in between can never be
    // lost by it, and a removed entry can never be resurrected by an append that read the queue
    // before the removal.
    async function takeQueueHead() {
      let head = null
      await commit(EV.queue, { queue: (cur) => {
        const list = Array.isArray(cur) ? cur : []
        if (!list.length) return list
        head = list[0]
        return list.slice(1)
      } })
      return head
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
      const cv = currentVerify()
      if (cv && cv.target === t) return { ok: true, deduped: true, message: t + ' 正在验证中' }
      const added = await appendToQueue({
        target: t, kind: kind || guessTargetKind(t),
        proposer: isOffice(proposer) ? 'office' : proposer, reason: String(reason || ''), at: now(),
      })
      if (!added.appended) return { ok: true, deduped: true, message: t + ' 已在验证队列中' }
      notifyActivity()
      // Start it NOW rather than hoping a scheduling pass reaches it. A pass may already
      // be in flight and PAST its arming point, in which case a bare `scheduleNext()`
      // only sets the trampoline flag and the proposal waits for the next iteration.
      await armNextVerify()
      if (!hasVerifyInFlight()) await scheduleNext()
      return { ok: true, queued: t, pendingVerifyCount: added.length, started: hasVerifyInFlight() }
    }
    async function beginVerify(proposal) {
      dbg.begin += 1
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
        // R10 §7.2 第 2 条：停止只可能来自（a）院士显式操作，或（b）**具名且可撤销**的有界触界。
        // 这里是有界兜底：它不是"隐式收束"——触界**具名广播**、记入状态、并**可撤销/续期**
        // （收到本触界的对象不进入"刚刚定论"的 dedup 窗口，任何成员/院士可重新提议验证以续期）。
        const bound = boundOf('idle', '长时间无新票，已到有界兜底上限（recoverStallMs=' + recoverStallMs() + 'ms）')
        const op = aggregateOpinion(vs)
        await putVerdict(vs.target, Object.assign({}, vs, {
          closed: true, outcome: 'undecided', reason: 'bound:idle — ' + bound.why,
          mean: op.mean, endedBy: 'bound:idle', bound, closedAt: now(),
        }))
        await saveChatLine('【求真触界｜' + bound.name + '】' + vs.target + '：' + bound.why + '。'
          + '本触界**具名**且**可撤销/续期**（任意成员或院士可重新提议验证）。'
          + '过程票数（尚未生效·仅供参考）：真 ' + op.bTrue + '／假 ' + op.bFalse + '／弃权 ' + op.abstain
          + '，平均概率 ' + Number(op.mean).toFixed(2) + '（m=' + op.m + '，有表决权者 ' + op.P + ' 人）。'
          + '本轮**不定论**：保留为未定论。')
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
      // Only ONE settle may run at a time: two concurrent subagent/end handlers can both
      // observe "every voter has answered" and would otherwise close the SAME object
      // twice — a duplicate Verified card and a duplicate debate record. The lock is
      // released BEFORE the trailing scheduling pass, so a chained verification is
      // never swallowed by a still-held lock (v4 §26).
      if (finalizeLock) return
      finalizeLock = 'verify'
      try {
        const j = judgeVerdict(vs, 'round-complete')
        if (j.outcome === 'true' || j.outcome === 'false') {
          // ── the `require` gate (§8 of docs/formal-verification.md) ────────────────
          // A unanimous boolean verdict is a CONSENSUS, not a proof. In `require` mode the
          // institute has decided that consensus alone may not be promoted to Verified/:
          // the object must also be either machine-checked (`passed`) or carry an explicit,
          // reasoned "we judged this infeasible" record (`blocked`). The gate never wedges
          // the run — it records 未定论 + a formalization TODO so the institute can keep
          // going and formalize later.
          const rec = formalOf(vs.target)
          if (formalMode() === 'require' && !formalGateOk(rec)) {
            await deferForFormal(vs, j, isTrueVote(j))
          } else {
            await closeVerify(vs, j.outcome === 'true', j)
          }
        } else if (vs.round >= Math.max(1, Math.floor(Number(params.verdictMaxRounds) || 3))) {
          await finalizeUndecided(vs, j, { endedBy: 'bound:round-cap', bound: boundOf('round-cap', '已达最大辩论轮数 ' + Math.max(1, Math.floor(Number(params.verdictMaxRounds) || 3))) })
        } else {
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
          await putVerdict(vs.target, Object.assign({}, next, { provisional: true }))
          await saveChatLine('【求真表决】' + vs.target + ' 第 ' + vs.round + ' 轮未定论（' + j.reason + '）。' +
            '公开辩论并重新表决：' + Object.entries(next.history).map(([k, v]) => k + '=' + Number(v.prob)).join('、') + R10_PROVISIONAL_NOTE)
          await askVoters(next)
        }
      } finally {
        finalizeLock = null
      }
      await scheduleNext()
    }
    const isTrueVote = (j) => j && j.outcome === 'true'
    // `require` mode withheld the verdict: record it as 未定论 with a machine-readable
    // reason, put the object on the formalization TODO, and say so in the group chat. The
    // object keeps its mean probability and its debate record, so nothing is lost.
    async function deferForFormal(vs, j, isTrue) {
      // MEDIUM 6 (deep review): both the record and the TODO list are built INSIDE the fold, so a
      // concurrent writer (a Lean run finishing for another target while this verdict settles)
      // cannot lose the other's entry.
      const why = 'formal-required：尚未取得 Lean 形式化通过，也没有显式阻塞记录（当前状态 '
        + String((formalOf(vs.target).status) || 'none') + '）'
      await writeDebateDoc(vs, false, j)
      await putVerdict(vs.target, Object.assign({}, vs, {
        closed: true, outcome: 'undecided', reason: why, mean: j.mean, formalDeferred: true,
        m: j.m, P: j.P, bTrue: j.bTrue, bFalse: j.bFalse, abstain: j.abstain, closedAt: now(),
        // LOW (deep review): record the ELECTORATE too. judgeVerdict had it (ase.voters) and
        // the closed record used to drop it, so a completed decision could not be audited for who
        // was counted once the roster changed.
        voters: j.voters,
      }))
      await putFormal(vs.target,
        (prev0) => ((prev0 && prev0.status && prev0.status !== 'none') ? prev0 : { status: 'none', deferredAt: now() }),
        (todo0) => {
          const list = (todo0 || []).filter((t) => t.id !== vs.target)
          list.push({ id: vs.target, at: now(), why, verdict: isTrue ? 1 : 0 })
          return list
        })
      await writeFormalTodo()
      await writeFormalIndex()
      await saveChatLine('【形式化】' + vs.target + ' 的表决结果为 ' + (isTrue ? '真' : '假')
        + '，但 **require 模式**要求先有 Lean 通过或显式阻塞记录，因此本轮**不定论**（已记入 Formal/TODO.md）。'
        + '请完成形式化（vibe_v5_lean_archive kind=\'proof\'）或记录阻塞原因（kind=\'blocked\'）后重新提议验证。')
      await markProgress()
      await armNextVerify()
      await scheduleNext()
    }
    async function finalizeUndecided(vs, j, opts) {
      const o = opts || {}
      const bound = o.bound || null
      await writeDebateDoc(vs, false, j)
      // Keep it in the library with the group's MEAN probability — the design's
      // "留库附概率". A missing source card is skipped rather than creating garbage.
      await rewriteSource(vs.target, vs.proposer, { '状态': '未定论', '概率': Number(j.mean).toFixed(2) })
      await putVerdict(vs.target, Object.assign({}, vs, {
        closed: true, outcome: 'undecided', reason: j.reason, mean: j.mean,
        m: j.m, P: j.P, bTrue: j.bTrue, bFalse: j.bFalse, abstain: j.abstain, closedAt: now(),
        endedBy: String(o.endedBy || 'round-complete'), bound,
        // LOW (deep review): record the ELECTORATE too. judgeVerdict had it (ase.voters) and
        // the closed record used to drop it, so a completed decision could not be audited for who
        // was counted once the roster changed.
        voters: j.voters,
      }))
      await putDebate({ target: vs.target, at: now(), file: 'Shared/Debates/' + vs.target + '.md', outcome: 'undecided' })
      await saveChatLine((bound ? ('【求真触界｜' + bound.name + '】' + vs.target + '：' + bound.why + '（**具名且可撤销/续期**：任意成员或院士可重新提议验证）') : ('【求真表决】' + vs.target + ' 未达门槛'))
        + '；留库为未定论，平均概率 ' + Number(j.mean).toFixed(2) + '（' + R10_PROVISIONAL_NOTE + '）。辩论记录见 Shared/Debates/' + vs.target + '.md')
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
        // LOW (deep review): record the ELECTORATE too. judgeVerdict had it (ase.voters) and
        // the closed record used to drop it, so a completed decision could not be audited for who
        // was counted once the roster changed.
        voters: j.voters,
      }))
      await putDebate({ target: vs.target, at: now(), file: 'Shared/Debates/' + vs.target + '.md', outcome: isTrue ? 'true' : 'false' })
      await saveChatLine('【求真结论】' + vs.target + ' 经 ' + (isTrue ? j.bTrue : j.bFalse) + ' 名有表决权者一致判' +
        (isTrue ? '真' : '假') + '（m=' + j.m + '），已写入 Verified/。来源卡已标注「' + status + '」。')
      await markProgress()
      await armNextVerify()
      await scheduleNext()
    }
    let beginLock = false
    async function armNextVerify() {
      dbg.arm += 1
      // A MEETING and a VERIFICATION never run at the same time. `startMeeting` already
      // parks a meeting while a verification is in flight; this is the missing mirror for
      // the other direction. Without it, a member replying `propose_verify` while a
      // meeting was live started a second consensus process immediately, because
      // `maybeQueueVerify` calls this directly (bypassing schedulePass, whose meeting
      // check is what used to hide the asymmetry). The meeting's watchdog clock would
      // then be starved while two coordination processes competed for the same members.
      // The proposal stays in the queue; schedulePass reaches this again once the meeting is over.
      if (meeting) return
      // Only one begin may be in flight. Without this, two callers (a scheduling pass
      // and a fresh proposal) could both pass the `currentVerify()` check before either
      // has published its verdict record and would start the SAME object twice.
      if (beginLock) return
      if (currentVerify()) return
      beginLock = true
      try {
        while (true) {
          // NEVER remove a proposal we are not about to run: the entry leaves the durable
          // queue only in the same step that starts it. The old code shifted it out and then
          // returned because a meeting was live, so the proposal existed in neither the queue
          // nor `verdicts` until some later pass happened to re-arm it (audit M2). Re-check
          // the exclusion guards here too: `await putQueue` can let a meeting open.
          const q = inst().queue.slice()
          if (!q.length) return
          if (meeting || currentVerify()) return
          // Take the head in ONE atomic commit (`takeQueueHead` re-reads the queue inside the
          // fold). The exclusion guards above are deliberately NOT re-checked inside it: a third
          // copy of them would make the sensitivity probes that remove the two real copies inert
          // (they would still hold, and the suite would look like a blind spot).
          const p = await takeQueueHead()
          if (!p) return
          const recent = verifiedRecently.get(p.target)
          if (recent !== undefined && (now() - recent) < recoverStallMs()) continue
          const vs = await beginVerify(p)
          await askVoters(vs)
          return
        }
      } finally {
        beginLock = false
      }
    }
    async function writeDebateDoc(vs, done, val) {
      const j = typeof val === 'object' ? val : null
      const lines = ['# 验证辩论｜' + vs.target + '（' + kindLabel2(vs.kind) + '）｜' + fmtTime(), '']
      if (done) lines.push('**结论**：全体一致为' + (val === 1 || val === 'true' ? '真' : '假') + '（写入 Verified/）')
      else lines.push('**过程记录（尚未生效·仅供参考）**：未达门槛｜平均概率 ' + Number(j ? j.mean : val).toFixed(2) + '｜原因：' + (j ? j.reason : '') +
        '｜m=' + (j ? j.m : '?') + '｜布尔票 真' + (j ? j.bTrue : '?') + '/假' + (j ? j.bFalse : '?') + '/显式弃权' + (j ? j.abstain : '?') + '/中间估计' + (j ? j.estimates : '?'))
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
        '- 显式弃权: ' + j.abstain + '｜中间估计: ' + (j.estimates === undefined ? '?' : j.estimates) + '｜全组平均概率: ' + Number(j.mean).toFixed(2),
        // The formal record travels WITH the conclusion: a reader of the card must be able
        // to see how strong the result really is (machine-checked vs consensus-only).
        ...(formalOn() ? ['- 形式化: ' + formalStatusLine(vs.target) + (formalOf(vs.target).proof ? '（证明：' + formalOf(vs.target).proof + '）' : '')] : []),
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
      if (!member) return memberDiagnosis('投票（vibe_v5_verdict）', memberId)
      if (member.kind === 'temp') {
        // Temp workers have no vote — but their judgement still matters, so it is
        // relayed to the group instead of being silently dropped.
        await say(memberId, { to: 'voters', kind: 'voters', text: '（临时工 ' + memberId + ' 的参考意见，无表决权）对 ' + target + '：' + String(reason || '') })
        return { ok: false, code: 'V5_NOT_VOTER', message: '临时工没有表决权；你的意见已转达给表决者' }
      }
      const vs = currentVerify()
      if (!vs) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'no verification in progress' }
      if (String(target) && String(target) !== vs.target) {
        return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'the object under verification is ' + vs.target }
      }
      const raw = (verdict === undefined || verdict === null) ? '' : String(verdict).trim().toLowerCase()
      const votes = Object.assign({}, vs.votes)
      const unableNow = Object.assign({}, vs.unable || {})
      if (raw === 'unable' || raw === '无法判断') {
        // D3：**明确无法判断/不能应答** ⇒ 退出本次分母（不计分母），但**名单必列**且可追溯（谁/何时/为何）
        unableNow[memberId] = { why: String(reason || ''), by: memberId, at: now() }
        const nextU = Object.assign({}, vs, { unable: unableNow, lastVoteAt: now() })
        await putVerdict(vs.target, nextU)
        await saveChatLine('【求真表决】' + memberId + ' 声明**无法判断**对象 ' + vs.target + '（原因：' + String(reason || '（未说明）')
          + '）：按 D3 **退出本次分母**（不计分母），但仍列在名单中；此声明**不改票、不算反对**。')
        const needU = voters().map((m) => m.id)
        const allU = needU.length > 0 && needU.every((id) => (unableNow[id] || votes[id]))
        if (allU) await continueVerifyRound(nextU)
        else await scheduleNext()
        return { ok: true, voted: memberId, unable: true, allVoted: allU, pendingVoters: needU.filter((id) => !(unableNow[id] || votes[id])) }
      }
      if (raw === 'abstain' || raw === '弃权') {
        // D3/L4：**显式弃权** ＝ 明确表态（计入已投），但**不计选项**、不进 m 的布尔计数
        votes[memberId] = { abstain: true, reason: String(reason || ''), at: now() }
        const nextA = Object.assign({}, vs, { votes, unable: unableNow, lastVoteAt: now() })
        await putVerdict(vs.target, nextA)
        const needA = voters().map((m) => m.id)
        const allA = needA.length > 0 && needA.every((id) => (unableNow[id] || votes[id]))
        if (allA) await continueVerifyRound(nextA)
        else await scheduleNext()
        return { ok: true, voted: memberId, abstain: true, allVoted: allA, pendingVoters: needA.filter((id) => !(unableNow[id] || votes[id])) }
      }
      const p = Number(verdict)
      if (!Number.isFinite(p) || p < 0 || p > 1) return { ok: false, code: 'V5_INVALID_VERDICT', message: 'verdict must be a number in [0,1], or the word abstain (弃权) / unable (无法判断)' }
      votes[memberId] = { prob: p, reason: String(reason || ''), at: now() }
      const next = Object.assign({}, vs, { votes, unable: unableNow, lastVoteAt: now() })
      await putVerdict(vs.target, next)
      const need = voters().map((m) => m.id)
      const allVoted = need.length > 0 && need.every((id) => (unableNow[id] || votes[id]))
      if (allVoted) await continueVerifyRound(next)
      else await scheduleNext()
      // task-25 (real-host R2): an incomplete electorate used to be reported only as `allVoted:false`, so the
      // caller could not tell WHICH voter was still missing (members probed repeatedly to find out). Name them.
      return { ok: true, voted: memberId, verdict: p, allVoted, pendingVoters: need.filter((id) => !votes[id]) }
    }

    // ── G6：成员自查＋自述（docs/03 §3 #44、docs/07 G6 节、docs/09 §5.4/§7.0）──────────────
    // 文件承载（不碰事件 fold/EV 表）：Members/<id>/SelfReport.json ＋ Shared/SelfReportViewAudit.json
    // 时间**由框架写入**（用户自带 …At/…Ms 一律拒绝）；写入即留痕、旧值与旧时间不丢；只记录、不驱动（R1/D10）。
    const SELF_FIELDS = ['overall', 'subgoal', 'plan', 'status']
    const SELF_TIME_OF = { overall: 'overallAt', subgoal: 'subgoalAt', plan: 'planAt' }
    const SELF_VIEW_AUDIT_CAP = 200
    async function selfReportPath(id) {
      const fs = await import('node:fs')
      return { fs, dir: instRoot() + '/Members/' + String(id), file: instRoot() + '/Members/' + String(id) + '/SelfReport.json' }
    }
    async function selfReportRead(id) {
      try {
        const { fs, file } = await selfReportPath(id)
        if (!fs.existsSync(file)) return null
        return JSON.parse(fs.readFileSync(file, 'utf8'))
      } catch (e) { return null }
    }
    async function selfReportWrite(id, rec) {
      const { fs, dir, file } = await selfReportPath(id)
      fs.mkdirSync(dir, { recursive: true })
      const tmp = file + '.' + process.pid + '.tmp'
      fs.writeFileSync(tmp, JSON.stringify(rec, null, 1))
      fs.renameSync(tmp, file)
    }
    async function selfViewAudit(viewerId, saw) {
      const fs = await import('node:fs')
      const root = instRoot()
      const file = root + '/Shared/SelfReportViewAudit.json'
      let list = []
      try { if (fs.existsSync(file)) list = JSON.parse(fs.readFileSync(file, 'utf8')) || [] } catch (e) { list = [] }
      list.push({ at: now(), by: String(viewerId || ''), saw: saw })
      const tail = list.slice(-SELF_VIEW_AUDIT_CAP)
      try { fs.mkdirSync(root + '/Shared', { recursive: true }); fs.writeFileSync(file, JSON.stringify(tail, null, 1)) } catch (e) { /* 留痕失败不得让查看失败 */ }
      return tail
    }
    async function selfReportRow(m) {
      const r = (await selfReportRead(m.id)) || {}
      // 只列工作状态字段：私聊/消息内容**永不进入**（G6）
      return {
        member: m.id, kind: m.kind, voting: (m.kind === 'academician' || m.kind === 'researcher'),
        overall: r.overall || '', overallAt: Number(r.overallAt || 0),
        subgoal: r.subgoal || '', subgoalAt: Number(r.subgoalAt || 0),
        plan: Array.isArray(r.plan) ? r.plan : [], planAt: Number(r.planAt || 0),
        status: r.status || '', updatedAt: Number(r.updatedAt || 0), updatedBy: r.updatedBy || '',
        deviation: r.deviation || null,
        deviationLabel: r.deviation ? '已偏离院士设定' : '',
      }
    }
    // 查看面：**在册成员全列**（在册＝院士/常驻研究员）；列席/受邀/临时工**单列并标注**；默认只读；**查看留痕**。
    async function selfReportView(viewerId) {
      const roster = inst().members.filter((m) => m.kind === 'academician' || m.kind === 'researcher')
      const others = inst().members.filter((m) => !(m.kind === 'academician' || m.kind === 'researcher'))
      const rows = []
      for (const m of roster) rows.push(await selfReportRow(m))
      const otherRows = []
      for (const m of others) otherRows.push(await selfReportRow(m))
      const audit = await selfViewAudit(viewerId, rows.map((r) => r.member).concat(otherRows.map((r) => r.member)))
      return {
        roster: rows, nonVoting: otherRows, viewAuditTail: audit.slice(-20),
        note: '只含工作状态字段（overall/subgoal/plan/status ＋ 各自 …At）；**私聊内容永不进入**（G6／G5）',
      }
    }
    async function selfReport(memberId, patch, reason, source) {
      const m = memberById(memberId)
      if (!m) return memberDiagnosis('自述更新（vibe_v5_self_report）', memberId)
      if (!(m.kind === 'academician' || m.kind === 'researcher')) {
        // D8：列席／受邀／临时工不可写（可读工作状态）
        return { ok: false, code: 'V5_NOT_VOTER', message: '列席／受邀／临时工不可写自述（G6；与 D8 一致）；你仍可查看工作状态' }
      }
      const a = patch || {}
      // G6 §7.1：时间由框架设置 —— 大小写不敏感（`/i`）：`/(At|Ms)$/` 会漏掉 `subgoal_at`／`expires_at`
      // 这类全小写写法，用户自带时间就被**静默接受**（与 S4/S6 同源；每处都有按名红的族守着）。
      const timeKeys = Object.keys(a).filter((k) => /(At|Ms)$/i.test(String(k)))
      if (timeKeys.length) {
        // G6 §7.1：时间由框架设置（防伪造/防漂移）
        return { ok: false, code: 'V5_INVALID_ARGUMENT', message: '时间由框架设置（G6 §7.1）：不接受 ' + timeKeys.join('、') + '；每个字段的 …At 由框架写入' }
      }
      const srcRaw = String(source || 'self').trim()
      const src = (srcRaw === 'negotiated' || srcRaw === 'academician') ? srcRaw : 'self'
      const cur = (await selfReportRead(m.id)) || { history: [] }
      const next = Object.assign({}, cur, { history: Array.isArray(cur.history) ? cur.history.slice() : [] })
      const changes = []
      for (const k of SELF_FIELDS) {
        if (a[k] === undefined) continue
        const oldVal = (k === 'plan') ? (Array.isArray(cur.plan) ? cur.plan : []) : String(cur[k] === undefined || cur[k] === null ? '' : cur[k])
        const newVal = (k === 'plan') ? (Array.isArray(a[k]) ? a[k].map(String) : [String(a[k])]) : String(a[k] === null ? '' : a[k])
        if (JSON.stringify(oldVal) === JSON.stringify(newVal)) continue
        changes.push({ field: k, old: oldVal, next: newVal })
      }
      const fieldsOf = (r) => ({
        overall: r.overall || '', subgoal: r.subgoal || '',
        plan: Array.isArray(r.plan) ? r.plan : [], status: r.status || '',
      })
      const timesOf = (r) => ({
        overallAt: Number(r.overallAt || 0), subgoalAt: Number(r.subgoalAt || 0), planAt: Number(r.planAt || 0),
      })
      if (!changes.length) {
        // 幂等：同值重复提交 ⇒ deduped，且**不追加历史**
        return { ok: true, deduped: true, member: m.id, fields: fieldsOf(next), times: timesOf(next),
          updatedBy: next.updatedBy || '', deviation: next.deviation || null,
          message: '自述未变化：同值重复提交按幂等处理（deduped:true），未追加历史' }
      }
      const at = now()
      for (const c of changes) {
        if (c.field === 'plan') next.plan = c.next
        else next[c.field] = c.next
        next[SELF_TIME_OF[c.field]] = at
        next.history.push({ at, by: m.id, field: c.field, old: c.old, next: c.next, reason: String(reason || ''), source: src })
      }
      const ov = changes.filter((c) => c.field === 'overall')[0]
      if (ov) {
        const authorOfOverall = String(cur.overallBy || '')
        if (authorOfOverall && authorOfOverall !== m.id) {
          // 偏离（作者≠调用者）：**保留作者原值与旧时间**（可取回）；`keptAcademicianValue` 为既有门的兼容别名
          next.deviation = { at, by: m.id, keptAcademicianValue: ov.old, keptValue: ov.old, keptAt: Number(cur.overallAt || 0), keptBy: authorOfOverall }
        }
        next.overallBy = (src === 'academician') ? 'academician' : m.id
      }
      next.updatedAt = at
      next.updatedBy = m.id
      await selfReportWrite(m.id, next)
      await saveChatLine('【自述更新】' + m.id + ' 更新了 ' + changes.map((c) => c.field).join('、')
        + (reason ? ('（理由：' + String(reason) + '）') : '') + '；时间由框架写入。'
        + (next.deviation ? '【注意】' + m.id + ' 的总目的原由院士设定 ⇒ **已偏离院士设定**（院士原值与旧时间已保留、可取回）。' : ''))
      return { ok: true, member: m.id, fields: fieldsOf(next), times: timesOf(next), updatedBy: m.id,
        history: next.history.slice(-10), deviation: next.deviation || null }
    }
    async function selfReportTool(memberId, a) {
      // ORDER MATTERS (TDZ lesson): every binding is initialised BEFORE it is read — never insert a
      // guard between a `const` declaration and its first use (that produced "Cannot access … before
      // initialization", which the tool wrapper surfaced as {ok:false,error:…} with NO code).
      const args = a || {}
      const otherKeys = Object.keys(args).filter((k) => k === 'member' || k === 'memberId' || k === 'for' || k === 'target')
      const targetId = otherKeys.length ? String(args[otherKeys[0]] || '') : String(memberId || '')
      const patchKeys = SELF_FIELDS.filter((k) => args[k] !== undefined)
      if (targetId && targetId !== String(memberId || '')) {
        // G6：他人自述**只允许院士设定 `overall`**（任务/总目的设定）；其余一律具名拒绝（复用既有码）
        const actor = memberById(memberId)
        const isAcad = !!(actor && actor.kind === 'academician')
        const onlyOverall = patchKeys.length === 1 && patchKeys[0] === 'overall'
        if (!(isAcad && onlyOverall)) {
          return { ok: false, code: 'V5_INVALID_ARGUMENT', message: '不得改他人自述（G6）：只能更新自己的 overall/subgoal/plan/status；院士仅可为他人设定 overall（' + otherKeys.join('/') + ' 指向 ' + targetId + '，本次字段 ' + JSON.stringify(patchKeys) + '）' }
        }
      }
      // G6 §7.1：时间由框架设置 —— 客户端自带的**任何** …At／…Ms 一律显式拒绝（不得静默忽略）。
      // **大小写不敏感（`/i`）**：同 S4/S6 加固，堵住全小写 `expires_at`／`subgoal_at` 的静默通过。
      const timeKeys = Object.keys(args).filter((k) => /(At|Ms)$/i.test(String(k)))
      if (timeKeys.length) {
        return { ok: false, code: 'V5_INVALID_ARGUMENT', message: '时间由框架设置（G6 §7.1）：不接受 ' + timeKeys.join('、') + '；每个字段的 …At／…Ms 由框架写入' }
      }
      const patch = {}
      for (const k of patchKeys) patch[k] = args[k]
      if (!Object.keys(patch).length) return { ok: true, view: await selfReportView(memberId) }   // 只读查看（记录留痕）
      return await selfReport(targetId || memberId, patch, args.reason, args.source)
    }
    // ── S4：主持（D1/R4/R5）与程序异议（D2）──────────────────────────────────────────────
    // 三条红线在这里落地：① **只记录不驱动**（代行与异议都不改票面、不改会议阶段、不延后收束）；
    // ② **主持不额外加权**（R5）——代行者**不进** `voters()`，`judgeVerdict`/`aggregateOpinion`
    // 都不读 `chair`；③ 异议的 `chairReplyPending:true` **必须可见**（不得假装已回填）。
    const CHAIR_SCOPE_CLOSE = 'close'
    function chairRecordOf() {
      const c = inst().chair
      return (c && typeof c === 'object' && c.id) ? c : null
    }
    /** #45 `vibe_v5_chair_proxy`：**仅院士**可指定代行；`scope` 唯一取值 `'close'`；`why` 必填；
     *  任何用户自带的 `…At`／`…Ms`（含 `until`）一律拒绝（时间由框架设置）；同值重复 ⇒ `deduped`。 */
    async function chairProxyTool(memberId, a) {
      const args = a || {}
      const me = memberById(memberId)
      if (!me) return memberDiagnosis('指定代行（vibe_v5_chair_proxy）', memberId)
      if (me.kind !== 'academician') {
        // D1 硬约束：非院士不得自任主持，也不得指定代行。
        return { ok: false, code: 'V5_NOT_ACADEMICIAN', message: '只有院士可以指定代行（D1）：非院士不得自任主持或代行他人主持' }
      }
      // S4（沿用 G6 §7.1 的**最外层**做法）：客户端自带的任何 …At／…Ms（含 until）一律显式拒绝。
      // 变量名刻意不同于 selfReportTool 的 `timeKeys`：那条锚点是 R18 的自检变异点，必须保持全局唯一。
      // **大小写不敏感（`/i`）**：`/(At|Ms)$/` 会漏掉 `expires_at`／`timeout_ms` 这类全小写/混合写法，
      // 用户自带时间就被**静默接受**（S6 实测同源漏洞；与"时间由框架设置"这条硬纪律冲突）。
      const stampKeys = Object.keys(args).filter((k) => /(At|Ms)$/i.test(String(k)) || String(k) === 'until')
      if (stampKeys.length) {
        return { ok: false, code: 'V5_INVALID_ARGUMENT', message: '时间由框架设置（S4/D1）：不接受 ' + stampKeys.join('、') + '；代行不设自定时限，时间一律由框架写入' }
      }
      if (!meeting) {
        return { ok: false, code: 'V5_NO_OPEN_MEETING', message: '指定代行失败：当前没有进行中的会议（主持代行只对当次会议生效）' }
      }
      if (String(args.scope || '') !== CHAIR_SCOPE_CLOSE) {
        return { ok: false, code: 'V5_INVALID_ARGUMENT', message: "scope 只接受 '" + CHAIR_SCOPE_CLOSE + "'（唯一取值）：代行仅限收束授权（D1/R4）" }
      }
      const why = String(args.why || '').trim()
      if (!why) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'why is required：指定代行必须显式说明理由（D1）' }
      const proxyId = String(args.member || args.proxy || '').trim()
      const proxy = memberById(proxyId)
      if (!proxy || proxy.phase !== 'active') {
        return { ok: false, code: 'V5_INVALID_ARGUMENT', message: '代行者必须是本所在册成员（' + (proxyId || '(未指明)') + '）；代行须显式指定（D1）' }
      }
      const cur = chairRecordOf()
      if (cur && cur.id === me.id && cur.proxy === proxyId && cur.scope === CHAIR_SCOPE_CLOSE) {
        // 幂等：同值重复 ⇒ deduped，且**不追加历史、不刷新 since**。
        return { ok: true, deduped: true, chair: cur, chairProxy: proxyId, scope: CHAIR_SCOPE_CLOSE, message: '代行已是同值（幂等）：未重复入档、未刷新时间' }
      }
      const rec = { id: me.id, since: now(), proxy: proxyId, scope: CHAIR_SCOPE_CLOSE, why }
      // **入档**：耐久副本（会议收束/重启后仍可查）＋当次会议记录 `meeting.chair`。
      await patchInstitute({ chair: rec })
      if (meeting) meeting.chair = rec
      // **不产生新票权**：这里不碰名册与票权集合 —— 代行只是收束授权，不是第二张票。
      await saveChatLine('【主持代行｜' + String(meeting.id) + '】院士 ' + me.id + ' 指定 ' + proxyId
        + ' 代行**收束**（scope=' + CHAIR_SCOPE_CLOSE + '，理由：' + why + '）；代行**不产生新票权**、主持**不额外加权**。')
      return { ok: true, chair: rec, chairProxy: proxyId, scope: CHAIR_SCOPE_CLOSE, meetingId: meeting.id }
    }
    /** #46 `vibe_v5_procedural_objection`：**在册成员**可提（列席/受邀/临时工 ⇒ `V5_NOT_VOTER`）；
     *  `why` 必填；入档后 `chairReplyPending:true` **必须可见**；同值重复 ⇒ `deduped`；只记录不驱动。 */
    async function proceduralObjectionTool(memberId, a) {
      const args = a || {}
      const me = memberById(memberId)
      if (!me) return memberDiagnosis('提出程序异议（vibe_v5_procedural_objection）', memberId)
      if (!(me.kind === 'academician' || me.kind === 'researcher')) {
        // D2：程序异议是**在册成员**的救济通道（列席／受邀／临时工不在册）。
        return { ok: false, code: 'V5_NOT_VOTER', message: '程序异议只能由在册成员提出（D2）；列席／受邀／临时工不可提' }
      }
      if (!meeting) {
        return { ok: false, code: 'V5_NO_OPEN_MEETING', message: '程序异议失败：当前没有进行中的会议（异议随当次会议入档）' }
      }
      const why = String(args.why || '').trim()
      if (!why) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'why is required：程序异议必须写明理由（D2）' }
      const list = Array.isArray(meeting.objections) ? meeting.objections : []
      const same = list.filter((o) => o && o.by === me.id && o.why === why)[0]
      if (same) {
        // 幂等：同值重复 ⇒ deduped，且不追加历史；`chairReply` 仍为 null（不得假装已回填）。
        return { ok: true, deduped: true, objection: same, chairReplyPending: same.chairReplyPending, meetingId: meeting.id, message: '异议已是同值（幂等）：未重复入档' }
      }
      const rec = { by: me.id, at: now(), why, chairReply: null, chairReplyPending: true }
      // **入档**：`meeting.objections[]`（当次会议）＋纪要尾部（耐久）。**只记录不驱动**：
      // 不改票面、不改阶段、不延后收束；主持尚未回应 ⇒ `chairReplyPending` 必须保持可见。
      meeting.objections = list.concat([rec])
      await appendMeetingTail(meeting, '- 程序异议｜' + me.id + '：' + why + '（chairReplyPending=true：待主持回应）')
      await saveChatLine('【程序异议｜' + String(meeting.id) + '】' + me.id + '：' + why + '（chairReplyPending=true：待主持回应；只记录不驱动）')
      return { ok: true, objection: rec, chairReplyPending: rec.chairReplyPending, meetingId: meeting.id, message: '程序异议已入档（chairReplyPending=true：待主持回应）' }
    }
    // R10-2a：**院士显式结束辩论** —— 产 outcome 的合法来源之一（与 round-complete、具名可撤销触界并列）。
    // 它**不**绕过 D3 参与门（未表态仍阻塞结题），也**不**让过程票数变成裁定。
    async function endVerify(memberId, target, reason) {
      const member = memberById(memberId)
      if (!member) return memberDiagnosis('结束辩论（vibe_v5_end_verify）', memberId)
      const denyEnd = await gateDo(member.id, 'end_verify', '只有院士可以显式结束辩论（R10-2a）；其它成员请继续投票、弃权或声明无法判断')
      if (denyEnd) return denyEnd
      const vs = currentVerify()
      if (!vs) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'no verification in progress' }
      if (String(target) && String(target) !== vs.target) {
        return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'the object under verification is ' + vs.target }
      }
      const j = judgeVerdict(vs, 'academician')
      const ended = Object.assign({}, vs, { endedBy: 'academician', endedByMember: memberId, endedAt: now(), endReason: String(reason || '') })
      await saveChatLine('【求真结束辩论】院士 ' + memberId + ' 显式结束对 ' + vs.target + ' 的辩论（R10-2a）'
        + (reason ? ('，理由：' + String(reason)) : '') + '；结论：'
        + (j.outcome === 'true' ? '真' : j.outcome === 'false' ? '假' : '未定论（' + j.reason + '）') + '。')
      if (j.outcome === 'true' || j.outcome === 'false') {
        const rec = formalOf(vs.target)
        if (formalMode() === 'require' && !formalGateOk(rec)) await deferForFormal(ended, j, isTrueVote(j))
        else await closeVerify(ended, j.outcome === 'true', j)
      } else {
        await finalizeUndecided(ended, j, { endedBy: 'academician', bound: null })
      }
      return {
        ok: true, target: vs.target, endedBy: 'academician', endedByMember: memberId, outcome: j.outcome, reason: j.reason,
        process: { m: j.m, Peff: j.Peff, P: j.P, bTrue: j.bTrue, bFalse: j.bFalse, abstain: j.abstain, estimates: j.estimates,
          votedCount: j.votedCount, answered: j.answered, silent: j.silent, unable: j.unable, mean: j.mean, provisional: true },
        provisional: false,
      }
    }
    // ---- chat log / meeting plumbing --------------------------------------
    // LOW (deep review): the day's chat MIRROR was an unsynchronized read-modify-write — two lines
    // produced in the same tick both read `prev`, and the second write dropped the first. Appends
    // are now serialized through one promise chain (the authoritative record is `inst().messages`;
    // this file is the human-readable mirror, which is why this is a LOW).
    let chatChain = Promise.resolve(true)
    async function saveChatLine(text) {
      const line = String(text || '').trim()
      if (!line) return false
      const day = fmtTime().slice(0, 10)
      const rel = 'Shared/Chat/' + day + '.md'
      const run = async () => {
        const prev = (await readTextRel(rel)) || ('# 研究所群聊记录｜' + instituteName + '｜' + day + '\n\n')
        return await writeTextRel(rel, prev + '- ' + fmtTime().slice(11) + '｜' + line + '\n')
      }
      chatChain = chatChain.then(run, run)
      return await chatChain
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
    // HIGH 3 (deep review): the "is the original problem solved?" tally is DURABLE state
    // (`inst().solve`), not an in-memory Map. It gates 结题 and is published by status/report, so a
    // restart or a second session must see the same answers; the old Map made cross-session
    // unanimity impossible and let the published view disagree with the durable one.
    const solveVotesOf = () => inst().solve || {}
    const solveVotesList = () => Object.entries(solveVotesOf()).map(([k, v]) => k + '=' + v)
    async function startMeeting(callerId, opts) {
      const o = opts || {}
      const agenda = String(o.agenda || '').trim()
      if (!agenda) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'agenda is required' }
      const kind = String(o.kind || 'sync')
      const office = isOffice(callerId)
      const convened = canDo(callerId, 'convene')
      if (!convened.ok) {
        // Everyone else may only PROPOSE; the request is relayed to the academician
        // and the office instead of silently doing nothing.
        //
        // The relay must carry the TRUE proposer. It used to be sent as `currentMember`
        // — "whoever this session last woke" — so a proposal by r-1 arrived signed by
        // r-2 and the voters replied to the wrong person.
        if (callerId) {
          await say(callerId, { to: 'voters', kind: 'voters', text: '提议开会：「' + agenda + '」（' + kind + '）' })
          // MEDIUM 4: the office is the only other actor allowed to convene, so the proposal is
          // ALSO addressed to it (voters alone never reached it).
          await say(callerId, { to: OFFICE_INBOX, kind: 'office-request', text: '请所办裁定：是否召开会议「' + agenda + '」（类型：' + kind + '｜提议人：' + callerId + '）' })
        }
        return { ok: true, proposed: true, message: '已向院士/所办提议开会（只有院士或所办可以直接召开；所办会在 status/report 的 officeRequests 里看到该提议）' }
      }
      await consumeGrant(convened.grant)   // S6：一次性授权在获批这一刻消费（用一次即失效）
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
    // F13 (status/report review): ONE composition for the phase/running/concluded facts, used by
    // both `report()` and `State/README.md` (`writeStateReadme`) — the two documents used to print
    // the same three facts with different wording, so a reader had to compare them by hand.
    function phaseFactLine() {
      return '阶段：' + phase + '｜运行中：' + (running ? '是' : '否') + '｜已结题：' + (autoDone ? '是' : '否')
    }
    // ── meeting speaking model (2.9.0): 机会位 / 发言位 / 票位 三个位置互不继承 ────────────────────
    // 阶段一"轮流发言"：每个**常驻**成员获得一次"要不要发言"的机会（可以不发言）；阶段二"举手发言"：
    // 想发言的人主动举手（含已发言者，可多轮）。收束只看：① 所有常驻成员都已获机会；② 无人还在举手/
    // 还在飞。**沉默本身不触发任何截止**（既不续命、也不算"卡死"）；唯一兜底是参数化硬界。
    // 票与发言彻底分离：`inputs` 只记发言，`solve` 只由 recordSolveVote 写（沉默绝不等于同意）。
    function meetingHardLimitMs() {
      const v = posMs(params.meetingHardLimitMs, 1800000)
      return Math.min(7200000, Math.max(300000, v))
    }
    function meetingWakeRetries() {
      const n = Number(params.meetingWakeRetries)
      return Number.isFinite(n) ? Math.min(10, Math.max(0, Math.floor(n))) : 5
    }
    function meetingHandsUp(mn) {
      if (!mn || !mn.hands) return []
      return Object.keys(mn.hands).filter((id) => mn.hands[id])
    }
    async function beginMeeting(opts) {
      // 只征询**常驻表决者**：临时工默认不进名单（它们只能被邀请，见 `meeting_invite`）。
      const order = voters().map((m) => m.id)
      // Rotate who speaks first: with a fixed order the same member always speaks
      // before it can see the others (v4 §24.1-④).
      for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = order[i]; order[i] = order[j]; order[j] = t }
      const idx = { id: '', agenda: opts.agenda, kind: opts.kind || 'sync', at: 0, file: '' }
      // HIGH 1: `mt-N` and the `counters.meeting` bump are allocated inside the fold (the old
      // shape read the counter here and committed it separately, so two concurrent convenings
      // could both become `mt-3` and the fold's dedupe dropped the second one).
      await commit(EV.meeting, { make: (alloc) => {
        idx.id = alloc.next('meeting')
        idx.at = now()
        idx.file = 'Shared/Meetings/' + idx.id + '.md'
        return idx
      } })
      const id = idx.id
      lastMeetingId = id   // real1004-minutes: late speeches are appended to the most recent minutes
      const hardLimitMs = meetingHardLimitMs()
      meeting = {
        id, agenda: opts.agenda, kind: opts.kind || 'sync', target: opts.target || '',
        // S12（D7/GAPS 22）：**会议分级**——`formalAgenda:true` 是院士的**显式覆盖**（否则由 `kind` 派生）。
        formalAgenda: opts.formalAgenda === true,
        by: opts.by || 'office', order, roster: order.slice(), phase: 'round-robin',
        inputs: {}, speeches: {}, extras: {}, asked: {}, silent: {}, unreached: {}, hands: {}, spokeCount: {},
        invited: {}, retries: {}, history: [], hardLimitMs, lastInputAt: now(), startedAt: now(),
        // S11（GAPS 29）：**记录人当次会议绑定**（会议收束即失效）；`recordEntries` 是记录人的具名条目。
        secretary: '', secretaryAt: 0, secretaryBy: '', recordEntries: [],
      }
      // F6 (status/report review): mark the meeting OPEN durably. `finalizeMeeting` clears it, so a
      // meeting that never finished (crash/restart/stop) stays visible as "未收束" instead of
      // silently counting as history with no minutes.
      await patchInstitute({ meetingOpen: { id, at: now(), agenda: meeting.agenda } })
      // HIGH 3: a NEW solve question starts with an empty DURABLE tally (a clear has to be
      // persisted too, otherwise a reload would resurrect the previous question's answers).
      await putSolve({ clear: true })
      await saveChatLine('【会议 ' + id + '】召开：' + meeting.agenda + '（类型：' + meeting.kind + '｜召集人：' + meeting.by + '）')
      // A meeting that ACTUALLY begins and was convened by the office is the other half of the
      // `paperEditor='office'` consultation requirement (docs/final-paper.md §7). Counted here, not at the
      // request: a parked/refused request is not a consultation. A FRAMEWORK-convened stall
      // meeting (`auto:true`) is not the office's own act, so it does not count either.
      if (meeting.by === 'office' && opts.auto !== true) await notePaperConsult('meeting')
      await mkdirs()
      await writeTextRel('Shared/Meetings/' + id + '.md', [
        '# 会议纪要｜' + id + '｜' + instituteName,
        '- 议程: ' + meeting.agenda,
        '- 类型: ' + meeting.kind + (meeting.target ? '｜目标: ' + meeting.target : ''),
        '- 召集人: ' + meeting.by,
        '- 开始时间: ' + fmtTime(meeting.startedAt),
        '- 发言顺序: ' + order.join(' → '),
        '- 硬界: ' + Math.round(hardLimitMs / 60000) + ' 分钟（沉默本身不触发任何截止；只兜底卡死的一轮）',
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
      // watchdog abandoned it. ONLY resident voters are asked: a temp worker enters the
      // meeting solely through an explicit invitation.
      const live = voters().map((m) => m.id)
      meeting.roster = live.slice()
      meeting.order = meeting.order.filter((id) => live.indexOf(id) !== -1)
      for (const id of live) { if (meeting.order.indexOf(id) === -1) meeting.order.push(id) }
      for (const id of Object.keys(meeting.asked)) {
        if (live.indexOf(id) !== -1) continue
        delete meeting.asked[id]; delete meeting.silent[id]; delete meeting.unreached[id]
        delete meeting.hands[id]; delete meeting.inputs[id]; delete meeting.extras[id]
        delete meeting.spokeCount[id]; delete meeting.retries[id]
      }
      const budget = Math.max(1, Math.floor(Number(params.maxParallel) || 3))
      const maxTries = Math.max(0, meetingWakeRetries())
      const roundRobin = meeting.phase === 'round-robin'
      let asked = 0
      // `meeting.retries[id]` 记的是**已经尝试过的次数**。语义（2.9.0 用户裁决）：
      // `meetingWakeRetries = N` ⇒ 先尝试 1 次，失败/未落定后再**重试 N 次** ⇒ **总共 N+1 次尝试**；
      // `N = 0` ⇒ **只尝试一次**。允许再次尝试的条件是 `已尝试次数 <= N`；超过才记 `unreached`
      // （当作"已获机会"：不阻塞收束，且与 `silent` 严格区分）。
      const attemptOne = async (m, invited) => {
        if (!m || m.phase !== 'active' || busy.has(m.id)) return false
        if (!invited) meeting.retries[m.id] = Number(meeting.retries[m.id] || 0) + 1   // 计一次尝试
        const ok = await wakeMember(m, meetingPrompt(m, meeting, invited ? { invited } : null), 'meeting')
        // 只有"获得机会"才写 asked；被邀请的临时工永远不进机会位（也不阻塞收束）。
        if (ok) { if (!invited) meeting.asked[m.id] = now(); asked += 1 }
        else if (!invited && !meeting.hands[m.id] && Number(meeting.retries[m.id] || 0) > maxTries) {
          meeting.unreached[m.id] = now()
          meeting.history.push({ at: now(), id: m.id, what: 'unreached', tries: meeting.retries[m.id] })
        }
        return ok
      }
      for (const id of meeting.order) {
        if (asked >= budget) break
        if (meeting.silent[id] !== undefined || meeting.unreached[id] !== undefined) continue
        const alreadyAsked = meeting.asked[id] !== undefined
        const tries = Number(meeting.retries[id] || 0)
        // 尝试次数用尽（已试 N+1 次）⇒ 记 unreached 且不再问。**注意不是"不尝试"**：N=0 时也先试一次。
        if (tries > maxTries && !meeting.hands[id]) {
          meeting.unreached[id] = now()
          meeting.history.push({ at: now(), id, what: 'unreached', tries })
          continue
        }
        if (alreadyAsked) {
          if (meeting.inputs[id] !== undefined) continue        // 已交付发言
          if (busy.has(id)) continue                            // 仍在飞 ⇒ 等它（见 continueMeetingRound）
        } else if (!roundRobin) continue                         // 阶段二不再补发第一阶段的机会
        await attemptOne(memberById(id), null)
      }
      if (!roundRobin) {
        // 阶段二的两类唤醒：① 举手者（含已发言者 ⇒ "举手再发言"，可多轮）；② 被邀请的临时工（各只问一次）。
        for (const id of meetingHandsUp(meeting)) {
          if (asked >= budget) break
          if (await attemptOne(memberById(id), null)) meeting.history.push({ at: now(), id, what: 'hand-asked' })
        }
        for (const id of Object.keys(meeting.invited)) {
          if (asked >= budget) break
          const inv = meeting.invited[id]
          if (!inv || inv.askedOnce) continue
          inv.askedOnce = true
          if (await attemptOne(memberById(id), inv)) { asked += 1; meeting.history.push({ at: now(), id, what: 'invited-asked', by: inv.by }) }
        }
      }
      // 阶段切换：所有常驻成员都"获得过机会"（发言 / 沉默 / 未送达 都算）⇒ 进入举手阶段。无计时器。
      if (meeting.phase === 'round-robin') {
        const done = meeting.roster.every((id) => meeting.asked[id] !== undefined || meeting.silent[id] !== undefined || meeting.unreached[id] !== undefined)
        if (done) {
          meeting.phase = 'open-floor'
          meeting.history.push({ at: now(), what: 'phase', phase: 'open-floor' })
          await saveChatLine('【会议 ' + meeting.id + '】轮流发言结束（' + meeting.roster.length + ' 位常驻成员都已获得机会），进入**举手发言**阶段：想发言的成员请举手（meeting_hand:true）；已发言者也可以再次举手。')
        }
      }
      if (!asked) armHeartbeat()
      return asked
    }
    async function continueMeetingRound() {
      if (!meeting) return
      // Same reentrancy guard as verification: two concurrent end handlers can both see
      // the last speaker arrive and would otherwise finalize the meeting twice
      // (duplicate transcript tail, duplicate task/verify fan-out, duplicate solve vote).
      // Re-arm on the way out: a pass that bails here does no work of its own, so
      // without a heartbeat nothing would retry it once the lock clears.
      if (finalizeLock) { armHeartbeat(); return }
      // 唯一兜底：参数化硬界（自会议开始起的墙钟）。**沉默本身不触发任何截止**——只有真正卡死的一轮
      // （在飞却永不交付）才会被它收掉，且放弃时同样写全明细（发言机会/举手记录/表决）。
      const elapsed = now() - Number(meeting.startedAt || now())
      const hard = Number(meeting.hardLimitMs || meetingHardLimitMs())
      if (elapsed >= hard) {
        const abandoned = meeting
        meeting = null
        await appendMeetingTail(abandoned, meetingMinutesTail(abandoned, { abandoned: true }).join('\n'))
        await saveChatLine('【会议 ' + abandoned.id + '】超过硬界（' + Math.round(hard / 60000) + ' 分钟）被放弃；团队回到自组织推进。')
        await scheduleNext()
        return
      }
      // 收束判据（只看机会位与"还在举手/在飞"，**不看是否发过言、更不看票**）：
      //   (a) 还有常驻成员没获得机会              ⇒ 继续征询（"还没轮到它"，不是卡死）
      //   (b) 已获机会、仍在飞、尚未落定          ⇒ 等它交付（不设计时器；硬界兜底）
      //   (c) 有人举着手且还没交付（含已发言者再次举手）⇒ 等它发言
      //   (d) 已获机会、答复始终没落定、当前空闲且重试未耗尽 ⇒ 有限次再问
      const notYetAsked = meeting.roster.filter((id) => meeting.asked[id] === undefined && meeting.silent[id] === undefined && meeting.unreached[id] === undefined)
      const inFlight = meeting.roster.filter((id) => meeting.asked[id] !== undefined && meeting.inputs[id] === undefined && meeting.silent[id] === undefined && meeting.unreached[id] === undefined && busy.has(id))
      const unanswered = meeting.roster.filter((id) => meeting.asked[id] !== undefined && meeting.inputs[id] === undefined && meeting.silent[id] === undefined && meeting.unreached[id] === undefined && !busy.has(id) && Number(meeting.retries[id] || 0) < meetingWakeRetries())
      const handsUp = meetingHandsUp(meeting)
      if (notYetAsked.length || inFlight.length || unanswered.length || handsUp.length) {
        const asked = await askMeetingRound()
        if (!asked) armHeartbeat()
        return
      }
      // 收束前的诚实化：把"已获机会、重试耗尽、始终没答复"的成员具名记为 `unreached`
      // （**与"选择不发言"严格区分**；两者都不阻塞收束）。
      for (const id of meeting.roster) {
        if (meeting.asked[id] === undefined || meeting.inputs[id] !== undefined) continue
        if (meeting.silent[id] !== undefined || meeting.unreached[id] !== undefined) continue
        meeting.unreached[id] = now()
        meeting.history.push({ at: now(), id, what: 'unreached', reason: 'no answer after retries' })
      }
      finalizeLock = 'meeting'
      try {
        await finalizeMeeting(meeting)
      } finally {
        finalizeLock = null
      }
    }
    async function appendMeetingTail(mn, text) {
      const rel = 'Shared/Meetings/' + mn.id + '.md'
      const prev = (await readTextRel(rel)) || ('# 会议纪要｜' + mn.id + '\n\n')
      await writeTextRel(rel, prev + '\n' + text + '\n')
    }
    /** 邀请一名**临时工**在本次会议上发言（结构化字段 `meeting_invite:{member,why}`）。
     *  权限：表决者（院士/常驻研究员）或所办。受邀者的发言**只进纪要＋广播**：不进成果库、不计票、
     *  不进机会位/举手集合 ⇒ **永不延后收束**。重复邀请幂等（具名 `V5_ALREADY_INVITED`）。 */
    async function meetingInvite(callerId, inv) {
      const refuse = async (code, msg) => {
        await notice(callerId, msg + '（' + code + '）')
        return { ok: false, code, message: msg }
      }
      if (!meeting) return await refuse('V5_NO_OPEN_MEETING', '邀请发言失败：当前没有进行中的会议')
      const caller = memberById(callerId)
      const voter = !!caller && (caller.kind === 'academician' || caller.kind === 'researcher')
      if (!voter && !isOffice(callerId)) return await refuse('V5_NOT_VOTER', '邀请发言失败：只有表决者（院士/常驻研究员）或所办可以邀请')
      const id = String(inv.member || '').trim()
      const target = memberById(id)
      if (!target || target.phase !== 'active') return await refuse('V5_INVITE_NOT_TEMP', '邀请发言失败：' + (id || '(未指明)') + ' 不是本所在册成员')
      if (target.kind !== 'temp') return await refuse('V5_INVITE_NOT_TEMP', '邀请发言失败：' + id + ' 是常驻成员，本来就在会议的征询名单里')
      const why = String(inv.why || '').trim()
      if (!why) return await refuse('V5_INVALID_ARGUMENT', '邀请发言失败：请写明理由（why）')
      if (meeting.invited[id]) return await refuse('V5_ALREADY_INVITED', '邀请发言失败：' + id + ' 已被 ' + meeting.invited[id].by + ' 邀请过（同一会议只记第一次）')
      meeting.invited[id] = { by: callerId, why, at: now(), askedOnce: false }
      meeting.history.push({ at: now(), id, what: 'invited', by: callerId })
      await saveChatLine('【会议 ' + meeting.id + '】' + callerId + ' 邀请 ' + id + ' 发言：' + why + '（受邀发言只记纪要，不计票）')
      return { ok: true, invited: id, by: callerId }
    }
    /** 纪要的"发言机会（征询）／举手记录／表决"三块——**收束与"被硬界放弃"两条路径共用**，
     *  因此放弃时也留下可审计的明细。表决块**严格区分 投 true／投 false／未表态**：
     *  沉默不是票，未表态者照旧阻止结题（`checkSolved` 只读 `solve`）。 */
    function meetingMinutesTail(mn, opts) {
      const lines = []
      const roster = Array.isArray(mn.roster) ? mn.roster : []
      const askedIds = roster.filter((id) => mn.asked[id] !== undefined || mn.silent[id] !== undefined || mn.unreached[id] !== undefined)
      const silentIds = roster.filter((id) => mn.silent[id] !== undefined)
      const unreachedIds = roster.filter((id) => mn.unreached[id] !== undefined)
      lines.push('## 发言机会（征询）')
      lines.push('- 常驻成员（征询名单）：' + (roster.length ? roster.join('、') : '（无）'))
      lines.push('- 已获得发言机会：' + askedIds.length + '/' + roster.length + (askedIds.length ? '（' + askedIds.join('、') + '）' : ''))
      lines.push('- 已获机会·**选择不发言**：' + (silentIds.length ? silentIds.join('、') : '（无）'))
      if (unreachedIds.length) lines.push('- 已获机会·**未能送达/未落定**（与"选择不发言"区分）：' + unreachedIds.join('、'))
      lines.push('- **沉默不等于投票**：未表态者仍会阻止结题（见下方"表决"）。')
      lines.push('')
      const hands = (Array.isArray(mn.history) ? mn.history : []).filter((h) => h && /^hand/.test(String(h.what)))
      lines.push('## 举手记录')
      lines.push(hands.length ? hands.map((h) => '- ' + (h.id || '(全所)') + '｜' + h.what + '｜' + fmtTime(h.at)).join('\n') : '- （无人举手）')
      lines.push('')
      const invitedIds = Object.keys(mn.invited || {})
      lines.push('## 受邀临时工（只记纪要，不计票）')
      lines.push(invitedIds.length
        ? invitedIds.map((id) => '- ' + id + '｜邀请人 ' + mn.invited[id].by + '｜理由 ' + mn.invited[id].why + (mn.inputs[id] !== undefined ? '｜已发言' : '｜未发言（不阻塞收束）')).join('\n')
        : '- （无）')
      lines.push('')
      lines.push(...meetingVoteBlock(mn))
      if (opts && opts.abandoned) { lines.push(''); lines.push('⚠ 本次会议超过硬界被放弃（看门狗）；以上明细据实记录。') }
      return lines
    }
    /** 表决块（现状口径 + 三态拆分）：票只来自 `extras[*].voteSolved`（`recordSolveVote` 写入）。 */
    function meetingVoteBlock(mn) {
      const voterIds = voters().map((m) => m.id)
      const vote = (id) => { const e = mn.extras[id]; return e ? e.voteSolved : undefined }
      const solvedTrue = voterIds.filter((id) => vote(id) === true)
      const solvedFalse = voterIds.filter((id) => vote(id) === false)
      const noVote = voterIds.filter((id) => vote(id) === undefined)
      const lines = []
      lines.push('## 表决')
      lines.push('- 有表决权者：' + (voterIds.length ? voterIds.join('、') : '（无）'))
      lines.push('- 认为原问题已解决（投 true）：' + (solvedTrue.length ? solvedTrue.join('、') : '（无人）'))
      lines.push('- 认为未解决（投 false）：' + (solvedFalse.length ? solvedFalse.join('、') : '（无人）'))
      lines.push('- **未表态**（既未投 true 也未投 false）：' + (noVote.length ? noVote.join('、') : '（无）'))
      const temps = (Array.isArray(mn.order) ? mn.order : []).filter((id) => voterIds.indexOf(id) === -1)
      lines.push('- 临时工/受邀意见（无表决权）：' + (temps.length ? temps.map((id) => id + '=' + (vote(id) === true)).join('、') : '（无）'))
      lines.push('- 结论：' + (voterIds.length > 0 && solvedTrue.length === voterIds.length
        ? '**全体有表决权者一致认为原问题已解决**'
        : '未达成全体一致（' + solvedTrue.length + '/' + voterIds.length + '），本所继续推进'))
      return lines
    }
    async function finalizeMeeting(mn) {
      meeting = null
      // S6（D1/D2/D6/D8）：会议收束 ⇒ 该会议的 `grantScope='meeting'` 授权在**账上**标记失效
      // （生效判定本身已是事件派生的；这一步只是把"为何失效"写进台账，便于审计与回收核对）。
      try {
        await patchInstitute({ grants: (list) => (Array.isArray(list) ? list : []).map((g) => (
          g && g.grantScope === 'meeting' && String(g.meetingId || '') === String(mn.id) && !Number(g.revokedAt || 0) && !Number(g.expiredAt || 0)
            ? Object.assign({}, g, { expiredAt: now() }) : g)) })
      } catch (e) { /* 台账标记失败不得影响收束 */ }
      // F6: the meeting is closed ⇒ clear the durable OPEN marker (see `beginMeeting`).
      try { await patchInstitute({ meetingOpen: null }) } catch (e) { /* the minutes below matter more */ }
      const lines = []
      // S8（R3/K12）：纪要**分区** —— 先「## 发言区」（本场发言，含表决前的讨论），最后「## 投票区」
      // （问题／选项／规则／计票／有效票／弃权／**未投票名单** P12）。两区**同时**写进渲染文本与结构化
      // `minutes{}`（下面的 `commit(EV.meeting, {index, minutes})`）。
      lines.push('## 发言区')
      // 逐人小节：**保持"有发言才写"**；同一人的多次发言（举手再发言）按次数标注。
      for (const id of mn.order.concat(Object.keys(mn.invited || {}))) {
        const all = mn.speeches && Array.isArray(mn.speeches[id]) ? mn.speeches[id] : null
        const text = mn.inputs[id]
        if (text === undefined && !(all && all.length)) continue
        const invited = mn.invited && mn.invited[id]
        lines.push('### ' + id + (invited ? '（受邀：' + invited.by + '／' + invited.why + '；仅记录，不计票）' : ''))
        if (all && all.length > 1) for (let i = 0; i < all.length; i++) lines.push('（第 ' + (i + 1) + ' 次发言）\n' + String(all[i] || '（无发言）'))
        else lines.push(String(text || (all && all[0]) || '（无发言）'))
        lines.push('')
      }
      // S8（R3/K12）：**发言区**的结构化快照（与渲染文本同源）。
      const speechZone = mn.order.concat(Object.keys(mn.invited || {})).filter((id) => (
        mn.inputs[id] !== undefined || (Array.isArray(mn.speeches && mn.speeches[id]) && mn.speeches[id].length)
      )).map((id) => ({
        by: id,
        speeches: ((mn.speeches && mn.speeches[id]) || (mn.inputs[id] !== undefined ? [mn.inputs[id]] : [])).slice(),
        count: Number((mn.spokeCount && mn.spokeCount[id]) || 0),
        invited: !!(mn.invited && mn.invited[id]),
      }))
      // S8（R3/K12）：**投票区** —— 本场会议的每一张板（问题／选项／规则／计票／有效票／弃权／未投票名单）。
      const voteZone = ballotsList().filter((b) => b && String(b.meetingId || '') === String(mn.id)).map((b) => {
        const v = ballotView(b) || {}
        const pending = b.phase === 'open' ? ballotPending(b) : (((b.result || {}).pending) || [])
        return {
          ballotId: String(b.id || ''), question: String(b.question || ''),
          options: (v.options || []).map((o) => o.text), rules: v.rules || ballotRulesView(b),
          cast: Number(v.cast || 0), valid: Number(v.valid || 0), abstained: Number(v.abstained || 0),
          tally: v.tally || {}, minVotes: Number(v.minVotes || 0),
          settled: !!v.settled, outcome: String(v.outcome || ''),
          quorum_reached: !!v.quorum_reached, m: Number(v.m || 0),
          unvoted: pending.slice(),
          secret: !!v.secret,
        }
      })
      if (voteZone.length) {
        lines.push('## 投票区')
        for (const z of voteZone) {
          lines.push('- `' + z.ballotId + '`：' + z.question
            + '｜选项：' + z.options.map((t, i) => 'o-' + (i + 1) + '＝' + t).join('；')
            + '｜规则：' + (z.rules.mode === 'single' ? '单选' : '多选（至少 ' + z.rules.min + '、至多 ' + z.rules.max + '）')
            + '｜**最少收集票 ' + z.minVotes + '** ⇒ ' + (z.settled ? '本次投票成立' : '**不形成结论**（未达门槛）')
            + '｜法定人数 m＝' + z.m + '（' + (z.quorum_reached ? '阻塞已解除' : '仍被未投票者阻塞') + '）'
            + '｜已投 ' + z.cast + '（有效 ' + z.valid + '、弃权 ' + z.abstained + '）'
            + '｜计票：' + z.options.map((t, i) => 'o-' + (i + 1) + '＝' + Number(z.tally['o-' + (i + 1)] || 0)).join('、')
            + '｜**未投票名单**：' + (z.unvoted.length ? z.unvoted.join('、') : '（无）')
            + (z.secret ? '｜**不记名**（逐人选择仅供计票）' : ''))
        }
      } else {
        lines.push('## 投票区')
        lines.push('- （本场会议未使用投票板）')
      }
      // S11（GAPS 29）：**记录人补充**是**独立小节**，放在**两区之后** ⇒ 两区结构零改动（S8 门不回归）、
      // S10 的会议内锚不受影响（只追加，绝不重写 `### <who>` 小节）。责任人**公开可追**；未指定则**明写**
      // "由框架自动落盘，无成员责任人"（**绝不**把框架/院士写成责任人）。
      const secWho = (mn && mn.secretary) ? String(mn.secretary) : ''
      const secEntries = secretaryEntriesOf(mn)
      // S12（D7/GAPS 22）：**等级**必须在纪要里**公开可见**（简流程 ⇒ 明写"不得产出实体定论"）。
      const lvl = meetingLevelOf(mn)
      lines.push('## 记录人补充')
      lines.push('- 本场等级：' + (lvl === 'formal' ? '**正式**（决议类：可产出实体定论）' : ('**简流程**：' + LIGHT_LEVEL_NOTE)))
      lines.push('- 纪要责任人：' + (secWho || ('（' + NO_SECRETARY_NOTE + '）')))
      if (secEntries.length) for (const e of secEntries) lines.push('- ' + (String(e.entry_kind || 'note') === 'decision' ? '**决议**' : '记录') + '（' + String(e.by || '') + '）：' + String(e.text || ''))
      else lines.push('- （记录人未追加任何条目）')
      lines.push(...meetingMinutesTail(mn, null))
      lines.push('')
      // S8（R3/K12）＋S11（GAPS 29）：结构化 `minutes{}` 写回（与渲染文本**双份**；写回失败不得影响纪要）。
      try {
        await commit(EV.meeting, {
          index: { id: mn.id },
          minutes: { at: now(), speechZone, voteZone, secretary: secWho, entries: secEntries, level: lvl },
        })
      } catch (e) { /* 结构化写回失败不得影响纪要 */ }
      const rel = 'Shared/Meetings/' + mn.id + '.md'
      const prev = (await readTextRel(rel)) || ('# 会议纪要｜' + mn.id + '\n\n')
      await writeTextRel(rel, prev + '\n' + lines.join('\n'))
      const vIds = voters().map((m) => m.id)
      const solvedTrueCount = vIds.filter((id) => { const e = mn.extras[id]; return e && e.voteSolved === true }).length
      await saveChatLine('【会议 ' + mn.id + '】结束。已解决票 ' + solvedTrueCount + '/' + voterCount() + '。纪要见 ' + rel)
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
      if (autoDone) return true
      const vs = voters().map((m) => m.id)
      if (!vs.length) return false
      const sv = solveVotesOf()
      if (!vs.every((id) => sv[id] === true)) return false
      // ── THE FINAL PAPER PHASE COMES FIRST (docs/final-paper.md §3) ────────────────────────────────
      // `finishRun` flips phase='solved' / autoDone / running=false, after which the machinery
      // REFUSES: `wakeIfIdle` returns false, `startMeeting` rejects a concluded institute and
      // nothing schedules — so the co-writing, the cross-review and the office consultation
      // could never run. The run therefore stays alive here until the paper is finalised
      // (or degraded with a report), and `finalizePaper` calls `finishRun` for us.
      if (params.finalPaper !== false) {
        const p = paper()
        if (!p) { await startPaper('run-complete', {}); return true }
        if (p.status !== 'finalized') {
          if (!p.completesRun) await mutatePaper((cur) => (cur ? Object.assign({}, cur, { completesRun: true }) : cur))
          return true
        }
      }
      await finishRun('全体有表决权者一致认为原问题已解决')
      return true
    }
    async function recordSolveVote(memberId, val) {
      const m = memberById(memberId)
      if (!m) return
      if (m.kind === 'temp') return   // no vote
      // HIGH 3: the answer is committed to the durable tally (it survives a reload and is visible
      // to a second session), not to a process-local Map.
      await putSolve({ member: memberId, value: val === true })
      // Evaluate the stop condition on EVERY solve vote, not only when a meeting
      // finalizes. A vote that lands after the meeting closed — a late reply, or an
      // ordinary round carrying vote_solved — would otherwise be recorded and never
      // read, leaving a unanimously-concluded institute running forever.
      await checkSolved()
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

    // ================= final paper (docs/final-paper.md) ============
    // THE PHASE RUNS BEFORE `finishRun` (docs/final-paper.md §3). After `phase='solved'` the machinery
    // refuses: `wakeIfIdle` (:3257) returns false, `startMeeting` refuses a concluded
    // institute, and a concluded run has no scheduling at all — so the co-writing, the
    // cross-review and the office consultation could never run. `checkSolved` therefore
    // enters this phase while the run is still alive and only calls `finishRun` once the
    // paper is finalised (or degraded with a report).
    //
    // Only evidence that ALREADY exists is written down: verified verdicts, the task board,
    // the Lean records, the members' libraries and the members' own text. The framework never
    // invents content — sections 3/6/7/8 are the members' own words, 4/5/9 are derived from
    // durable state, and undecided/refuted items are always marked as such.
    const PAPER_FILE = (id, file) => 'Paper/' + id + '/' + file
    function paper() { return inst().paper || null }
    function paperActive() { const p = paper(); return !!p && p.status !== 'finalized' }
    function paperParticipants() {
      return activeMembers().filter((m) => m.kind === 'academician' || m.kind === 'researcher').map((m) => m.id)
    }
    function paperActiveParticipants(p) {
      return ((p && p.participants) || []).filter((id) => { const m = memberById(id); return !!m && m.phase === 'active' })
    }
    function paperConfiguredEditor() { return params.paperEditor === 'office' ? 'office' : 'academician' }
    function paperIdFromState() {
      const a = idSafe(instituteName)
      if (a) return a
      const b = idSafe(String(runId || (inst() && inst().runId) || ''))
      return b || 'institute'
    }
    async function fileExistsAbs(abs) {
      try { const t = await fsTargetAbs(abs); return (await fs.stat(t)) !== undefined } catch (e) { return false }
    }
    function paperAbs(id, file) { return instRoot() + '/' + PAPER_FILE(id, file) }
    function paperDirRel(id) { return 'Paper/' + id }
    async function mutatePaper(fn) {
      await patchInstitute({ paper: (cur) => { const next = fn(cur === undefined ? null : cur); return next === undefined ? (cur === undefined ? null : cur) : next } })
      return paper()
    }
    // F6 (v4-G3's v5 cousin): ONE named warning per failed REQUIRED artifact write. `files` stays the
    // honest list of what actually landed, and the recovery path is the idempotent refill
    // (`refillPaperArtifacts`, reached by re-triggering the paper) which only writes what is missing.
    function paperWriteFailureWarning(names) {
      return '产物写入失败（未落盘）：' + names.join('、') + ' —— 它们不在本次定稿的 files 产物清单里；' +
        '重跑同一篇论文（/v5 paper，幂等）会由 refillPaperArtifacts 只补写缺失产物。'
    }
    async function paperLog(title, body) {
      const p = paper()
      const id = (p && p.id) || paperIdFromState()
      const rel = PAPER_FILE(id, 'paper.log.md')
      const prev = (await readTextRel(rel)) || ('# 最终论文流程日志｜' + id + '\n\n')
      // F6: the outcome is RETURNED so the finalisation can turn a failure into a named warning. It used
      // to be discarded, which is how a "finalized" paper could be announced without its log and with no
      // trace in `warnings`. No caller read the old `rel` return value.
      const ok = await writeTextRel(rel, prev + '## ' + title + '\n\n' + String(body || '') + '\n\n')
      return { rel, ok }
    }
    function paperAskEvery() { return posMs(params.activityTimeoutMs, 120000) }
    function paperNextStep(p) {
      if (!p) return 'no paper flow yet: finish the run with finalPaper=true, or trigger /v5 paper manually'
      if (p.status === 'finalized') return 'finalised — /v5 paper force rewrites it'
      if (p.status === 'writing') return 'waiting for the staff parts (round ' + p.round + '/' + PAPER_MAX_ROUNDS + ')'
      if (p.status === 'reviewing') return 'waiting for the cross-reviews (each reviewer judges another part)'
      if (p.status === 'awaiting-editor' && p.editor === 'office') {
        return 'awaiting the OFFICE: send >=1 office message and convene >=1 meeting, then call vibe_v5_finalize_paper (consultation so far: messages=' +
          Number((p.consult || {}).messages || 0) + ', meetings=' + Number((p.consult || {}).meetings || 0) + ')'
      }
      if (p.status === 'awaiting-editor') return 'waiting for the academician to finalise'
      return p.status
    }
    function paperAutoNote() {
      return params.finalPaper === false ? '自动已关闭（finalPaper=false）；本次为手动触发，仍会生成论文。' : ''
    }
    function paperSummary() {
      const p = paper()
      if (!p) return null
      return {
        id: p.id, status: p.status, stage: p.stage, round: p.round,
        editor: p.editor, editorFallback: !!p.editorFallback, completesRun: !!p.completesRun,
        participants: p.participants || [],
        parts: Object.keys(p.parts || {}).map((id) => ({ member: id, round: (p.parts[id] || {}).round, title: (p.parts[id] || {}).title || '' })),
        reviews: Object.keys(p.reviews || {}).map((id) => ({ member: id, of: (p.reviews[id] || {}).of || '', round: (p.reviews[id] || {}).round, deliverable: (p.reviews[id] || {}).deliverable === true })),
        reviewOf: p.reviewOf || {},
        consult: Object.assign({ messages: 0, meetings: 0 }, p.consult || {}),
        lang: p.lang, format: p.format, compilePdf: p.pdf === true,
        compile: p.compile || null, engine: p.engine || '', artifacts: p.artifacts || [],
        warnings: p.warnings || [], disagreement: p.disagreement || [], skipped: p.skipped || [],
        forcedAfterCap: !!p.forcedAfterCap, finalizedAt: p.finalizedAt || null,
        dir: 'Paper/' + p.id + '/', next: paperNextStep(p),
        meta: p.status === 'finalized' ? 'Paper/' + p.id + '/paper.meta.json' : null,
      }
    }

    // ---- the three asks ----------------------------------------------------
    function paperWritePrompt(member, p) {
      const L = []
      L.push('【最终论文·撰写 —— ' + kindLabel(member.kind) + ' ' + member.id + '】')
      L.push('本所对原问题的一致结论已经达成，现在撰写**最终论文**（第 ' + p.round + '/' + PAPER_MAX_ROUNDS + ' 轮）。')
      L.push('请你**只写你自己库里已有证据支撑**的内容：')
      L.push('- 直接引用你的卡片（' + instRel('Members/' + member.id + '/Propos|Methods|Subproblems/') + '）、' + instRel('Members/' + member.id + '/Progress/progress.md') + '、你参与的表决记录；')
      L.push('- **不得编造**：没有证据的推测不要写成结论；未决 / 被否证的条目必须显式标注“未定论 / 已被否证”；')
      L.push('- 在 evidence 里写清证据路径，附录会逐条索引。')
      if (p.round > 1) {
        const rv = (p.reviews || {})[member.id]
        L.push('')
        L.push('上一轮互审给你（' + member.id + '）部分的意见：' + (rv ? String(rv.comments || '（无具体意见）') : '（无）'))
        L.push('请据此修订；若不同意该意见，请在 limits 里写明理由。')
      }
      L.push('')
      L.push('------------')
      L.push(stateBlock(member))
      L.push('------------')
      L.push('结束时只输出一个 JSON 对象：')
      L.push('{ "paper_part": {')
      L.push('    "title": "你这部分的标题",')
      L.push('    "solution": "你对**原问题完整解法**的贡献（推理链与结论，只写有证据的）",')
      L.push('    "methods": "你创造/发现的方法、理论、思想、有价值经验、数学理解",')
      L.push('    "rules": "你从这些工作中归纳出的可复用规律",')
      L.push('    "limits": "局限、未决、被否证之处（必须诚实、显式）",')
      L.push('    "evidence": ["' + instRel('Members/' + member.id + '/Propos/p-x.md') + '"] } }')
      return L.join('\n')
    }
    function paperReviewPrompt(member, p, ofId) {
      const part = ofId ? (p.parts || {})[ofId] : null
      const L = []
      L.push('【最终论文·互审 —— ' + kindLabel(member.kind) + ' ' + member.id + '】')
      L.push('请你审阅 **' + (ofId || '（未指定）') + '** 撰写的部分，判断它是否可以交付（deliverable）。')
      L.push('要点：证据是否充分；是否与已定论的表决一致；有无编造或未标注的未决项；术语与符号是否清楚。')
      L.push('')
      L.push('------------ 待审部分（' + (ofId || '') + '）------------')
      L.push('标题：' + ((part && part.title) || '(无)'))
      L.push('【完整解法】' + String((part && part.solution) || '(空)').slice(0, 6000))
      L.push('【方法/理论/思想/经验/理解】' + String((part && part.methods) || '(空)').slice(0, 4000))
      L.push('【规律】' + String((part && part.rules) || '(空)').slice(0, 3000))
      L.push('【局限/未决】' + String((part && part.limits) || '(空)').slice(0, 3000))
      L.push('【声称的证据】' + ((((part && part.evidence) || []).join('、')) || '(无)'))
      L.push('------------')
      L.push('')
      L.push(stateBlock(member))
      L.push('')
      L.push('结束时只输出一个 JSON 对象：')
      L.push('{ "paper_review": { "of": "' + (ofId || '') + '", "deliverable": true, "comments": "具体意见" } }')
      L.push('deliverable 必须是 true（可交付）或 false（不可交付，需修改）。只有**全体参与成员**都投 true，定稿代表才能定稿。')
      return L.join('\n')
    }
    function paperFinalPrompt(member, p) {
      const L = []
      L.push('【最终论文·定稿（院士）—— ' + member.id + '】')
      L.push('全体参与成员已在互审中表示“可交付”。请你作为定稿代表做**最后一次**把关：')
      L.push('核对合并稿与互审意见，确认没有编造、没有未标注的未决项、没有与表决记录矛盾之处，然后给出决定。')
      L.push('')
      L.push('------------ 合并稿（各成员部分）------------')
      for (const id of paperActiveParticipants(p)) {
        const part = (p.parts || {})[id] || {}
        L.push('### ' + id + '｜' + String(part.title || ''))
        L.push('【完整解法】' + String(part.solution || '').slice(0, 3000))
        L.push('【方法/规律】' + (String(part.methods || '') + ' ' + String(part.rules || '')).slice(0, 2000))
        L.push('【局限】' + String(part.limits || '').slice(0, 1500))
        L.push('')
      }
      L.push('------------ 互审结论 ------------')
      for (const id of Object.keys(p.reviews || {})) {
        const rv = p.reviews[id] || {}
        L.push('- ' + id + ' 审 ' + (rv.of || '?') + '：deliverable=' + (rv.deliverable === true) + '｜' + String(rv.comments || '').slice(0, 500))
      }
      if ((p.disagreement || []).length) L.push('- ⚠ 已达轮次上限仍有分歧：' + JSON.stringify(p.disagreement[p.disagreement.length - 1]).slice(0, 500))
      L.push('------------')
      L.push('')
      L.push(stateBlock(member))
      L.push('')
      L.push('结束时只输出一个 JSON 对象：')
      L.push('{ "paper_final": { "decision": "deliverable" | "revise",')
      L.push('    "note": "定稿说明：你如何审阅、统一术语与符号、是否发现并纠正了问题",')
      L.push('    "conclusion": "（可选）定稿代表对原问题的最终结论（只写有证据的）" } }')
      L.push('decision="revise" 会退回继续修订（有轮次上限）。')
      return L.join('\n')
    }

    // ---- the stage driver --------------------------------------------------
    let paperLock = false
    async function paperStep() {
      const p = paper()
      if (!p || p.status === 'finalized' || p.status === 'awaiting-editor') return false
      const active = paperActiveParticipants(p)
      if (!active.length) return await paperAdvance(p, active)
      const parts = p.parts || {}
      const reviews = p.reviews || {}
      const missing = p.status === 'writing'
        ? active.filter((id) => !(parts[id] && parts[id].round === p.round))
        : active.filter((id) => !(reviews[id] && reviews[id].round === p.round))
      if (!missing.length) return await paperAdvance(p, active)
      const budget = Math.max(1, Math.floor(Number(params.maxParallel) || 3))
      let asked = 0
      for (const id of missing) {
        if (asked >= budget) break
        if (busy.has(id)) continue
        const m = memberById(id)
        if (!m || m.phase !== 'active') continue
        const last = (p.lastAskAt || {})[id] || 0
        if (last && (now() - last) < paperAskEvery()) continue
        const prompt = p.status === 'writing'
          ? paperWritePrompt(m, p)
          : paperReviewPrompt(m, p, (p.reviewOf || {})[id])
        // `wakeMember`, not `wakeIfIdle`: the paper phase deliberately drives members with a
        // dedicated ask, and a research round must never be mistaken for a paper answer.
        const ok = await wakeMember(m, prompt, 'paper')
        if (ok) {
          asked += 1
          await mutatePaper((cur) => (cur ? Object.assign({}, cur, {
            lastAskAt: Object.assign({}, cur.lastAskAt || {}, { [id]: now() }), updatedAt: now(),
          }) : cur))
        }
      }
      // Nothing to advance yet. ALWAYS re-arm: the pass that got here may have skipped an ask
      // because its member is busy or still inside the ask window, and `schedulePass` returns
      // from the paper branch BEFORE its own heartbeat arming — without this a paper whose ask
      // was paced out would stall until some unrelated member turn ended.
      if (asked) { armHeartbeat(); return false }
      // Stall watchdog (same clock as meetings/verifications): a member whose turn never ends
      // must not wedge the paper forever. The stuck members are recorded as non-participants.
      const stale = now() - Number(p.updatedAt || p.createdAt || now())
      if (stale >= recoverStallMs()) {
        const stuck = missing.filter((id) => busy.has(id))
        const name = stuck.length ? stuck : missing
        const warn = '看门狗：' + name.join('、') + ' 在 ' + Math.round(stale / 1000) + 's 内没有交稿，已按“未参与”处理并记入附录。'
        await mutatePaper((cur) => (cur ? Object.assign({}, cur, {
          warnings: (cur.warnings || []).concat([warn]),
          skipped: Array.from(new Set((cur.skipped || []).concat(name))), updatedAt: now(),
        }) : cur))
        await paperLog('看门狗', warn)
        return await paperAdvance(paper(), paperActiveParticipants(paper()))
      }
      armHeartbeat()
      return false
    }
    async function paperAdvance(p, active) {
      if (p.status === 'writing') {
        const reviewOf = {}
        for (let i = 0; i < active.length; i++) reviewOf[active[i]] = active[(i + 1) % active.length]
        await mutatePaper((cur) => (cur ? Object.assign({}, cur, {
          status: 'reviewing', stage: 'reviewing', reviewOf, reviews: {}, lastAskAt: {}, updatedAt: now(),
        }) : cur))
        await paperLog('进入互审（第 ' + p.round + ' 轮）', active.map((a) => a + ' 审 ' + reviewOf[a]).join('；') || '（无参与成员）')
        return true
      }
      if (p.status === 'reviewing') {
        const reviews = p.reviews || {}
        const refusers = active.filter((id) => !(reviews[id] && reviews[id].deliverable === true))
        if (!refusers.length) {
          await mutatePaper((cur) => (cur ? Object.assign({}, cur, { status: 'awaiting-editor', stage: 'awaiting-editor', lastAskAt: {}, updatedAt: now() }) : cur))
          await paperLog('互审一致：可交付', '全体参与成员（' + active.join('、') + '）均表示可交付。定稿代表：' + p.editor)
          return true
        }
        const detail = refusers.map((id) => id + '：' + String((reviews[id] || {}).comments || '未说明')).join('；')
        const entry = { round: p.round, members: refusers, detail, at: now() }
        if (p.round < PAPER_MAX_ROUNDS) {
          await mutatePaper((cur) => (cur ? Object.assign({}, cur, {
            status: 'writing', stage: 'writing', round: cur.round + 1, lastAskAt: {}, updatedAt: now(),
            disagreement: (cur.disagreement || []).concat([entry]),
          }) : cur))
          await paperLog('互审未达成一致 → 进入第 ' + (p.round + 1) + ' 轮', detail)
          return true
        }
        const warn = '互审在 ' + PAPER_MAX_ROUNDS + ' 轮上限仍未达成全体一致（' + refusers.join('、') + '）；分歧已写入论文附录。'
        await mutatePaper((cur) => (cur ? Object.assign({}, cur, {
          status: 'awaiting-editor', stage: 'awaiting-editor', lastAskAt: {}, updatedAt: now(),
          warnings: (cur.warnings || []).concat([warn]), disagreement: (cur.disagreement || []).concat([entry]), forcedAfterCap: true,
        }) : cur))
        await paperLog('达到轮次上限：转交定稿代表', warn)
        return true
      }
      return false
    }
    async function paperAwaitEditor(p) {
      if (p.editor !== 'academician') return false   // office: waits for vibe_v5_finalize_paper
      const id = academicianId()
      if (!id) {
        await mutatePaper((cur) => (cur ? Object.assign({}, cur, {
          editor: 'office', editorFallback: true, updatedAt: now(),
          warnings: (cur.warnings || []).concat(['定稿代表 academician 不在册：已回退为 office（需人工定稿）。']),
        }) : cur))
        await paperLog('定稿代表回退', 'academician 不在册，回退为 office：用 /v5 paper 或 vibe_v5_finalize_paper 定稿（仍需先与全所交流并开会）。')
        return false
      }
      const m = memberById(id)
      if (!m || m.phase !== 'active') return false
      if (busy.has(id)) { armHeartbeat(); return false }
      const last = (p.lastAskAt || {})[id] || 0
      if (last && (now() - last) < paperAskEvery()) { armHeartbeat(); return false }
      const ok = await wakeMember(m, paperFinalPrompt(m, p), 'paper')
      if (ok) await mutatePaper((cur) => (cur ? Object.assign({}, cur, { lastAskAt: Object.assign({}, cur.lastAskAt || {}, { [id]: now() }), updatedAt: now() }) : cur))
      armHeartbeat()
      return false
    }
    // The ONE driver. Called from `onMemberEnd` (after the reply is folded), from the manual
    // tools/command, from the resume path and from `schedulePass`; `paperLock` keeps it single.
    async function paperPass() {
      if (paperLock) return false
      paperLock = true
      try {
        for (let i = 0; i < 6; i++) {
          const p = paper()
          if (!p || p.status === 'finalized') return false
          if (p.status === 'awaiting-editor') { await paperAwaitEditor(p); return false }
          const advanced = await paperStep()
          if (!advanced) return false
        }
        return false
      } catch (e) {
        console.error('vibe-math-v5r: paper pass: ' + String((e && e.stack) || e))
        return false
      } finally { paperLock = false }
    }

    // ---- start / record / consult / finalize -------------------------------
    async function startPaper(trigger, opts) {
      const o = opts || {}
      const trg = String(trigger || 'manual')
      const existing = paper()
      if (existing && existing.status === 'finalized' && !o.force) {
        const refill = await refillPaperArtifacts(existing)
        return { ok: true, alreadyFinalized: true, id: existing.id, dir: 'Paper/' + existing.id + '/', refill, autoDisabled: params.finalPaper === false, note: paperAutoNote() }
      }
      if (existing && existing.status !== 'finalized' && !o.force) {
        return { ok: true, alreadyRunning: true, id: existing.id, status: existing.status, stage: existing.stage, round: existing.round, next: paperNextStep(existing), autoDisabled: params.finalPaper === false, note: paperAutoNote() }
      }
      const participants = paperParticipants()
      // A per-call editor override (`/v5 paper editor=office`) is ONE-SHOT: it is not written
      // back into the persisted params. An AUTOMATIC (run-complete) trigger always uses the
      // academician — the office is the root session and has no wake path (docs/final-paper.md §7).
      const configured = (o.editor === 'office' || o.editor === 'academician') ? o.editor : paperConfiguredEditor()
      const editor = trg === 'run-complete' ? 'academician' : configured
      const configWantsOffice = configured === 'office'
      const editorNote = (trg === 'run-complete' && configWantsOffice)
        ? 'paperEditor=office 已配置，但自动（收口）触发必须由**可唤醒**的院士定稿（所办是根会话，没有唤醒路径）；本次自动流程用 academician。要所办定稿请在收尾后用 /v5 paper 手动触发。'
        : (editor === 'office' ? '所办定稿：必须先与全所交流（>=1 条所办消息）并至少召开一次会议，结论写进定稿说明，然后调用 vibe_v5_finalize_paper。' : '')
      const lang = (o.lang === 'en' || o.lang === 'zh') ? o.lang : (params.paperLanguage === 'en' ? 'en' : 'zh')
      const format = ['both', 'md', 'tex'].indexOf(o.format) !== -1 ? o.format : (['both', 'md', 'tex'].indexOf(params.paperFormat) !== -1 ? params.paperFormat : 'both')
      const p = {
        id: paperIdFromState(), status: 'writing', stage: 'writing', round: 1,
        trigger: trg, createdAt: now(), updatedAt: now(),
        participants, parts: {}, reviews: {}, reviewOf: {}, final: null,
        editor, editorNote, completesRun: trg === 'run-complete',
        lang, format, pdf: params.paperCompilePdf !== false,
        consult: { messages: 0, meetings: 0 },
        lastAskAt: {}, warnings: editorNote ? [editorNote] : [], disagreement: [], skipped: [], artifacts: [],
        forced: !!o.force, forceReason: o.force ? String(o.reason || 'manual force') : '',
      }
      await patchInstitute({ paper: p })
      await paperLog('流程开始（' + (trg === 'run-complete' ? '收口自动触发' : '手动触发') + '）', [
        '- 目录：Paper/' + p.id + '/',
        '- 语言：' + p.lang + '｜格式：' + p.format + '｜编译 PDF：' + p.pdf,
        '- 参与成员：' + (participants.join('、') || '（无常驻成员）'),
        '- 定稿代表：' + editor + (editorNote ? '（' + editorNote + '）' : ''),
      ].join('\n'))
      await paperPass()
      return {
        ok: true, started: true, id: p.id, dir: 'Paper/' + p.id + '/', status: 'writing',
        participants, editor, next: paperNextStep(paper()),
        autoDisabled: params.finalPaper === false, note: paperAutoNote(),
      }
    }
    async function paperRecordPart(memberId, raw) {
      const p = paper()
      if (!p || p.status !== 'writing') return { ok: false, code: 'V5_PAPER_STATE', message: 'the paper flow is not in its writing stage (now: ' + (p ? p.status : 'none') + ')' }
      if ((p.participants || []).indexOf(memberId) === -1) return { ok: false, code: 'V5_MEMBER_NOT_FOUND', message: memberId + ' is not a writing participant of this paper' }
      const part = {
        member: memberId, round: p.round,
        title: String(raw.title || '').slice(0, 300),
        solution: String(raw.solution || '').slice(0, 20000),
        methods: String(raw.methods || '').slice(0, 20000),
        rules: String(raw.rules || '').slice(0, 12000),
        limits: String(raw.limits || '').slice(0, 12000),
        evidence: Array.isArray(raw.evidence) ? raw.evidence.map(String).slice(0, 50) : [],
        at: now(),
      }
      if (!part.title && !part.solution && !part.methods && !part.rules && !part.limits) {
        await notice(memberId, 'paper_part 是空的：请至少给出 title 与你的贡献正文（solution/methods/rules/limits），只写库里已有证据支撑的内容。')
        return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'paper_part carries no content' }
      }
      await mutatePaper((cur) => (cur ? Object.assign({}, cur, { parts: Object.assign({}, cur.parts || {}, { [memberId]: part }), updatedAt: now() }) : cur))
      await paperLog('收到 ' + memberId + ' 的部分（第 ' + p.round + ' 轮）', '- 标题：' + (part.title || '(无)') + '\n- 声称证据：' + (part.evidence.length || 0) + ' 条')
      return { ok: true, recorded: memberId, round: p.round }
    }
    async function paperRecordReview(memberId, raw) {
      const p = paper()
      if (!p || p.status !== 'reviewing') return { ok: false, code: 'V5_PAPER_STATE', message: 'the paper flow is not in its cross-review stage (now: ' + (p ? p.status : 'none') + ')' }
      if ((p.participants || []).indexOf(memberId) === -1) return { ok: false, code: 'V5_MEMBER_NOT_FOUND', message: memberId + ' is not a review participant of this paper' }
      if (raw.deliverable !== true && raw.deliverable !== false) {
        await notice(memberId, 'paper_review.deliverable 必须是 true 或 false（你敢不敢交付？未表态不算可交付）。')
        return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'paper_review.deliverable must be a boolean' }
      }
      const assigned = (p.reviewOf || {})[memberId]
      const rev = {
        member: memberId, of: String(raw.of || assigned || ''), round: p.round,
        deliverable: raw.deliverable === true,
        comments: String(raw.comments || '').slice(0, 8000), at: now(),
      }
      await mutatePaper((cur) => (cur ? Object.assign({}, cur, { reviews: Object.assign({}, cur.reviews || {}, { [memberId]: rev }), updatedAt: now() }) : cur))
      await paperLog('互审意见｜' + memberId + ' → ' + rev.of, '- deliverable：' + rev.deliverable + '\n- 意见：' + (rev.comments || '（无）').slice(0, 2000))
      return { ok: true, recorded: memberId, of: rev.of, deliverable: rev.deliverable }
    }
    async function paperRecordFinal(memberId, raw) {
      const p = paper()
      if (!p || p.status !== 'awaiting-editor') return { ok: false, code: 'V5_PAPER_STATE', message: 'the paper is not awaiting its editor (now: ' + (p ? p.status : 'none') + ')' }
      if (p.editor !== 'academician' || memberId !== academicianId()) {
        return { ok: false, code: 'V5_NOT_ACADEMICIAN', message: 'paperEditor is "' + p.editor + '": the academician does not finalise this paper' }
      }
      const decision = String(raw.decision || '')
      if (decision !== 'deliverable' && decision !== 'revise') {
        await notice(memberId, "paper_final.decision 必须是 'deliverable' 或 'revise'（收到 " + decision + '）。')
        return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'decision must be deliverable|revise' }
      }
      const fin = { by: memberId, decision, note: String(raw.note || '').slice(0, 4000), conclusion: String(raw.conclusion || '').slice(0, 20000), at: now() }
      if (decision === 'deliverable') {
        await mutatePaper((cur) => (cur ? Object.assign({}, cur, { final: fin, updatedAt: now() }) : cur))
        return await finalizePaper('academician-deliverable')
      }
      if (p.round < PAPER_MAX_ROUNDS) {
        await mutatePaper((cur) => (cur ? Object.assign({}, cur, {
          final: fin, status: 'writing', stage: 'writing', round: cur.round + 1, lastAskAt: {}, updatedAt: now(),
          disagreement: (cur.disagreement || []).concat([{ round: cur.round, members: [memberId], detail: '定稿代表要求修订：' + fin.note, at: now() }]),
        }) : cur))
        await paperLog('定稿代表要求修订 → 第 ' + (p.round + 1) + ' 轮', fin.note || '（未说明）')
        return { ok: true, revised: true, round: p.round + 1 }
      }
      const warn = '定稿代表在第 ' + PAPER_MAX_ROUNDS + ' 轮上限仍要求修订；按规格记警告并定稿（分歧写入附录）。'
      await mutatePaper((cur) => (cur ? Object.assign({}, cur, {
        final: fin, warnings: (cur.warnings || []).concat([warn]), forcedAfterCap: true, updatedAt: now(),
        disagreement: (cur.disagreement || []).concat([{ round: cur.round, members: [memberId], detail: '定稿代表要求修订：' + fin.note, at: now() }]),
      }) : cur))
      await paperLog('达到轮次上限：定稿代表仍要求修订', warn)
      return await finalizePaper('academician-revise-at-cap')
    }
    // The office consultation gate (v2 §A6 / the user's requirement): the office may finalise
    // ONLY after it has actually talked to the institute (>=1 office message) AND convened at
    // least one meeting; both counts are recorded in the finalisation note and the meta.
    async function finalizePaperByOffice(o) {
      const args = o || {}
      const p = paper()
      if (!p) return { ok: false, code: 'V5_PAPER_STATE', message: 'no paper flow has been started (finish the run with finalPaper=true, or use /v5 paper)' }
      if (p.status === 'finalized' && !args.force) {
        const refill = await refillPaperArtifacts(p)
        return { ok: true, alreadyFinalized: true, id: p.id, refill, autoDisabled: params.finalPaper === false, note: paperAutoNote() }
      }
      if (p.status !== 'awaiting-editor') {
        return { ok: false, code: 'V5_PAPER_STATE', message: 'the paper flow is in stage "' + p.status + '"; the editor finalises only after every part is written and cross-reviewed' }
      }
      if (p.editor !== 'office') {
        return { ok: false, code: 'V5_NOT_OFFICE', message: 'paperEditor="academician": the academician finalises from its own round; the office does not' }
      }
      const decision = String(args.decision || '')
      if (decision !== 'deliverable' && decision !== 'revise') return { ok: false, code: 'V5_INVALID_ARGUMENT', message: "decision must be 'deliverable' or 'revise'" }
      const note = String(args.note || '').trim()
      if (decision === 'deliverable' && !note) {
        return { ok: false, code: 'V5_INVALID_ARGUMENT', message: '定稿说明（note）是必填的：写明你如何与全所交流、商讨、优化、审查，以及结论' }
      }
      const consult = Object.assign({ messages: 0, meetings: 0 }, p.consult || {})
      if (!(Number(consult.messages) > 0) || !(Number(consult.meetings) > 0)) {
        // real1004-consult: `force` REWRITES the paper (docs/final-paper.md: "force 重写已定稿的论文"), so the
        // new paper starts with consult={0,0}. That is intended — but the refusal used to say nothing about it:
        // on a real host the office was rejected ELEVEN times and only the members could infer why their
        // earlier meeting had stopped counting. Name the reset, its reason, and what to do about it.
        const restarted = p.forced === true
        return {
          ok: false, code: 'V5_PAPER_CONSULT_REQUIRED',
          message: 'paperEditor="office" 要求所办先与全所交流、商讨、优化、审查：至少 1 条所办消息（vibe_v5_message）+ 至少 1 次会议（vibe_v5_meeting），然后才能定稿。当前：messages=' +
            Number(consult.messages || 0) + ', meetings=' + Number(consult.meetings || 0) +
            (restarted
              ? '。注意：本论文由 force 重启（forceReason=' + String(p.forceReason || '') + '）⇒ consult 计数随新论文重置为 0，重启前的消息/会议不再计入，请**重新**征询（两个计数记录在 paper.meta.json）'
              : ''),
          consult: { messages: Number(consult.messages || 0), meetings: Number(consult.meetings || 0) },
          restarted,
        }
      }
      const fin = {
        by: 'office', decision, note: String(note).slice(0, 4000),
        conclusion: String(args.conclusion || '').slice(0, 20000),
        consult: { messages: Number(consult.messages || 0), meetings: Number(consult.meetings || 0) },
        at: now(),
      }
      if (decision === 'deliverable') {
        await mutatePaper((cur) => (cur ? Object.assign({}, cur, { final: fin, updatedAt: now() }) : cur))
        return await finalizePaper('office-deliverable')
      }
      if (p.round < PAPER_MAX_ROUNDS) {
        await mutatePaper((cur) => (cur ? Object.assign({}, cur, {
          final: fin, status: 'writing', stage: 'writing', round: cur.round + 1, lastAskAt: {}, updatedAt: now(),
          disagreement: (cur.disagreement || []).concat([{ round: cur.round, members: ['office'], detail: '所办要求修订：' + fin.note, at: now() }]),
        }) : cur))
        await paperLog('所办要求修订 → 第 ' + (p.round + 1) + ' 轮', fin.note)
        return { ok: true, revised: true, round: p.round + 1 }
      }
      const warn = '所办在第 ' + PAPER_MAX_ROUNDS + ' 轮上限仍要求修订；按规格记警告并定稿（分歧写入附录）。'
      await mutatePaper((cur) => (cur ? Object.assign({}, cur, {
        final: fin, warnings: (cur.warnings || []).concat([warn]), forcedAfterCap: true, updatedAt: now(),
        disagreement: (cur.disagreement || []).concat([{ round: cur.round, members: ['office'], detail: '所办要求修订：' + fin.note, at: now() }]),
      }) : cur))
      await paperLog('达到轮次上限：所办仍要求修订', warn)
      return await finalizePaper('office-revise-at-cap')
    }
    // Count the office's consultation evidence. Called from the ONE place each act really
    // happens (`say` for a message, `beginMeeting` for a meeting that actually starts), so the
    // gate cannot be satisfied by merely intending to consult.
    async function notePaperConsult(kind) {
      const p = paper()
      if (!p || p.status === 'finalized') return
      const key = kind === 'meeting' ? 'meetings' : 'messages'
      await mutatePaper((cur) => {
        if (!cur || cur.status === 'finalized') return cur
        const consult = Object.assign({ messages: 0, meetings: 0 }, cur.consult || {})
        consult[key] = Number(consult[key] || 0) + 1
        return Object.assign({}, cur, { consult, updatedAt: now() })
      })
    }

    // ---- artifacts ---------------------------------------------------------
    function paperEvidence() {
      const s = inst()
      const V = s.verdicts || {}
      const keys = Object.keys(V)
      const closed = (o) => keys.filter((k) => V[k] && V[k].closed && V[k].outcome === o)
      const tasks = (s.tasks || []).filter((t) => t && t.status !== 'deleted')
      const formal = formalRecords()
      return {
        s, V,
        trueV: closed('true'), falseV: closed('false'), undecidedV: closed('undecided'),
        openV: keys.filter((k) => V[k] && !V[k].closed),
        tasks, done: tasks.filter((t) => t.status === 'completed'), openT: tasks.filter((t) => t.status !== 'completed'),
        formal, formalKeys: Object.keys(formal),
        members: s.members || [],
      }
    }
    function verdictCardRel(kind, id) { return 'Verified/' + (kind === 'subproblem' ? '问题' : kind === 'method' ? '方法' : '命题') + '/' + id + '.md' }
    function cardDirOf(kind) { return kind === 'method' ? 'Methods' : kind === 'subproblem' ? 'Subproblems' : 'Propos' }
    function paperTitle(p) {
      const st = String((inst().problem || {}).statement || '').trim()
      const head = st ? st.split(/\n/)[0].slice(0, 100) : ''
      return head || ('研究所成果论文｜' + p.id)
    }
    function paperSources(p, active, ev) {
      const out = []
      out.push('Problems/conclusion.md（结题记录）')
      if ((inst().problem || {}).id) out.push('Problems/' + inst().problem.id + '.md（原问题卡）')
      out.push('State/' + instituteName + '.v5state.json（权威状态）')
      for (const k of ev.trueV.concat(ev.falseV)) out.push(verdictCardRel((ev.V[k] || {}).kind, k) + '（Verified 卡片）')
      for (const k of ev.trueV.concat(ev.falseV)) out.push('Shared/Debates/' + k + '.md（辩论录）')
      for (const k of ev.formalKeys) {
        const r = ev.formal[k] || {}
        if (r.file) out.push(r.file + '（Lean 工作文件）')
        if (r.proof) out.push(r.proof + '（归档证明）')
      }
      if (ev.formalKeys.length) out.push('Formal/Index.md', 'Formal/TODO.md')
      for (const m of ev.members) {
        // Member-facing evidence paths are CWD-relative (DEFECT A): a member copying one of these
        // into its own file tool must not create a stray `<cwd>/Members/…` tree.
        out.push(instRel('Members/' + m.id + '/Progress/progress.md') + '（' + m.id + ' 的研究日志）')
        out.push(instRel('Members/' + m.id + '/{Propos,Methods,Subproblems}/') + '（' + m.id + ' 的卡片）')
      }
      out.push('Institutes.md（编制镜像）', 'Shared/TaskBoard.md（任务板镜像）')
      out.push('Paper/' + p.id + '/paper.log.md（本论文流程往来）')
      for (const id of active) {
        const part = (p.parts || {})[id] || {}
        for (const e of (part.evidence || [])) out.push(String(e) + '（' + id + ' 声称的证据）')
      }
      return Array.from(new Set(out))
    }
    function paperSections(p, active, skipped, ev, extra) {
      const o = extra || {}
      const fin = o.final || p.final || null
      const prob = ev.s.problem || {}
      const S = []
      // 1
      const b1 = []
      b1.push({ p: '标题：' + paperTitle(p) })
      b1.push({ ul: [
        '作者：' + ((p.participants || []).map((id) => id + '（' + ((memberById(id) || {}).kind === 'academician' ? '院士' : '常驻研究员') + '）').join('、') || '（无在册作者）'),
        '研究所：' + instituteName + '｜项目：' + project + '｜运行：' + (ev.s.runId || runId || '（无）'),
        '日期：' + fmtTime(p.finalizedAt || now()).slice(0, 10) + '｜语言：' + p.lang + '｜定稿代表：' + p.editor,
      ] })
      const mainConclusions = ev.trueV.length
        ? ('已由表决确立的结论：' + ev.trueV.join('、'))
        : '尚无经表决确立为真的结论（见第 4、8 节）。'
      b1.push({ p: '摘要：' + (prob.statement ? String(prob.statement).replace(/\s+/g, ' ').slice(0, 400) : '（未设定原问题）') + '。' + mainConclusions })
      if (fin && fin.note) b1.push({ p: '定稿说明：' + fin.note + (fin.consult ? '（定稿前与全所交流：消息 ' + fin.consult.messages + ' 条、会议 ' + fin.consult.meetings + ' 次）' : '') })
      if (fin && fin.conclusion) b1.push({ p: '定稿结论：' + fin.conclusion })
      S.push({ title: PAPER_SECTIONS[0], blocks: b1 })
      // 2
      S.push({ title: PAPER_SECTIONS[1], blocks: [
        { p: prob.statement ? String(prob.statement) : '（本所未记录原问题的完整陈述——请勿在论文中补写。）' },
        { p: '问题 ID：' + (prob.id || '（无）') + '｜参与成员：' + (p.participants || []).join('、') },
      ] })
      // 3
      const b3 = []
      const solvers = active.filter((id) => String(((p.parts || {})[id] || {}).solution || '').trim())
      if (solvers.length) {
        for (const id of solvers) {
          const part = (p.parts || {})[id] || {}
          b3.push({ h: id + '｜' + String(part.title || '贡献') })
          b3.push({ p: String(part.solution) })
        }
      } else {
        b3.push({ p: '（参与成员未提交可引用的完整解法叙述；请以第 4 节的表决结论与证据索引为准。）' })
      }
      if (o.conclusionText) b3.push({ h: '结题记录（Problems/conclusion.md）' }, { p: String(o.conclusionText).slice(0, 4000) })
      S.push({ title: PAPER_SECTIONS[2], blocks: b3 })
      // 4
      const b4 = []
      if (ev.trueV.length) {
        b4.push({ p: '以下对象经 m 票布尔一致判定为**真**（证据：Verified 卡片 + 辩论录）：' })
        b4.push({ ul: ev.trueV.map((k) => {
          const v = ev.V[k] || {}
          return '**' + k + '**（判为真；平均概率 ' + Number(v.mean || 0).toFixed(2) + '；m=' + (v.m || '?') + '；表决者 ' + ((v.voters || []).join('、') || '?') +
            '；证据：' + verdictCardRel(v.kind, k) + '；辩论：Shared/Debates/' + k + '.md；提出者：' + (v.proposer || '(office)') + '）'
        }) })
      } else b4.push({ p: '（没有经表决判定为真的命题。）' })
      if (ev.falseV.length) {
        b4.push({ p: '**已被否证（显式标注，不得当作结论使用）**：' })
        b4.push({ ul: ev.falseV.map((k) => {
          const v = ev.V[k] || {}
          return k + '（判为假；平均概率 ' + Number(v.mean || 0).toFixed(2) + '；m=' + (v.m || '?') + '；证据：' + verdictCardRel(v.kind, k) + '）'
        }) })
      }
      S.push({ title: PAPER_SECTIONS[3], blocks: b4 })
      // 5
      const b5 = []
      const subV = ev.trueV.filter((k) => (ev.V[k] || {}).kind === 'subproblem')
      if (subV.length) b5.push({ ul: subV.map((k) => '子问题 ' + k + '（已判定为真；证据：' + verdictCardRel('subproblem', k) + '）') })
      if (ev.done.length) b5.push({ ul: ev.done.map((t) => '任务 ' + t.id + '：' + String(t.subject || '') + '（owner=' + (t.ownerId || '?') + '；镜像：Shared/TaskBoard.md）') })
      if (!subV.length && !ev.done.length) b5.push({ p: '（没有已完成的子问题或任务被记录。）' })
      S.push({ title: PAPER_SECTIONS[4], blocks: b5 })
      // 6
      const b6 = []
      const methodParts = active.filter((id) => String(((p.parts || {})[id] || {}).methods || '').trim())
      for (const id of methodParts) b6.push({ h: id + '｜' + String(((p.parts || {})[id] || {}).title || '') }, { p: String(((p.parts || {})[id] || {}).methods) })
      if (!methodParts.length) b6.push({ p: '（参与成员未提交方法/理论/思想/经验/数学理解的叙述。）' })
      S.push({ title: PAPER_SECTIONS[5], blocks: b6 })
      // 7
      const b7 = []
      const ruleParts = active.filter((id) => String(((p.parts || {})[id] || {}).rules || '').trim())
      for (const id of ruleParts) b7.push({ h: id + '｜' + String(((p.parts || {})[id] || {}).title || '') }, { p: String(((p.parts || {})[id] || {}).rules) })
      if (!ruleParts.length) b7.push({ p: '（参与成员未归纳出可复用规律。）' })
      S.push({ title: PAPER_SECTIONS[6], blocks: b7 })
      // 8
      const b8 = []
      const limitParts = active.filter((id) => String(((p.parts || {})[id] || {}).limits || '').trim())
      for (const id of limitParts) b8.push({ h: id }, { p: String(((p.parts || {})[id] || {}).limits) })
      const unresolved = []
      for (const k of ev.undecidedV) unresolved.push('未定论：' + k + '（平均概率 ' + Number((ev.V[k] || {}).mean || 0).toFixed(2) + '，m=' + ((ev.V[k] || {}).m || '?') + '）')
      for (const k of ev.openV) unresolved.push('尚未裁决：' + k)
      for (const t of ev.openT) unresolved.push('未完成任务：' + t.id + '｜' + String(t.subject || '') + '（' + t.status + '）')
      for (const m of ev.members.filter((x) => x.phase === 'failed' || x.phase === 'dismissed')) unresolved.push('成员 ' + m.id + '：' + m.phase + (m.error ? '（' + String(m.error).slice(0, 120) + '）' : ''))
      for (const id of skipped) unresolved.push('未交稿/未参与：' + id)
      if (unresolved.length) b8.push({ p: '**未决与未参与（显式标注）**：' }, { ul: unresolved })
      if ((p.warnings || []).length) b8.push({ p: '流程警告：' }, { ul: (p.warnings || []).map(String) })
      if (!limitParts.length && !unresolved.length && !(p.warnings || []).length) b8.push({ p: '（无特别记录的局限。）' })
      S.push({ title: PAPER_SECTIONS[7], blocks: b8 })
      // 9
      const b9 = [{ p: '以下路径均相对于研究所根目录（与 State/<institute>.v5state.json 同级）。' }]
      b9.push({ ul: paperSources(p, active, ev) })
      if ((p.disagreement || []).length) {
        b9.push({ h: '分歧记录（未达成全体一致 / 定稿代表要求修订）' })
        b9.push({ ul: (p.disagreement || []).map((d) => '第 ' + d.round + ' 轮｜' + (d.members || []).join('、') + '：' + String(d.detail || '')) })
      }
      if (skipped.length) b9.push({ p: '按“未参与”处理的成员：' + skipped.join('、') })
      S.push({ title: PAPER_SECTIONS[8], blocks: b9 })
      return S
    }
    function renderPaperMd(p, S) {
      const L = ['# ' + paperTitle(p), '']
      S.forEach((sec, i) => {
        L.push('## ' + (i + 1) + '. ' + sec.title)
        L.push('')
        for (const b of sec.blocks) {
          if (b.h) { L.push('### ' + b.h); L.push('') }
          else if (b.p !== undefined) { L.push(String(b.p)); L.push('') }
          else if (b.ul) { for (const it of b.ul) L.push('- ' + String(it)); L.push('') }
        }
      })
      return L.join('\n')
    }
    const TEX_ESCAPES = { '\\': '\\textbackslash{}', '&': '\\&', '%': '\\%', '$': '\\$', '#': '\\#', '_': '\\_', '{': '\\{', '}': '\\}', '~': '\\textasciitilde{}', '^': '\\textasciicircum{}' }
    function texEscape(s) { return String(s == null ? '' : s).replace(/[\\&%$#_{}~^]/g, (c) => TEX_ESCAPES[c]) }
    function renderPaperTex(p, S) {
      const zh = p.lang !== 'en'
      const L = [
        '\\documentclass[11pt]{' + (zh ? 'ctexart' : 'article') + '}',
        '\\usepackage{amsmath,amssymb,amsthm}',
        '\\usepackage[margin=2.5cm]{geometry}',
        '\\usepackage[hidelinks]{hyperref}',
        '\\usepackage{longtable,booktabs}',
        '\\title{' + texEscape(paperTitle(p)) + '}',
        '\\author{' + texEscape(((p.participants || []).join('、')) || (zh ? '研究所' : 'Institute')) + '}',
        '\\date{' + texEscape(fmtTime(p.finalizedAt || now()).slice(0, 10)) + '}',
        '\\begin{document}',
        '\\maketitle',
      ]
      S.forEach((sec, i) => {
        L.push('\\section{' + texEscape((i + 1) + '. ' + sec.title) + '}')
        for (const b of sec.blocks) {
          if (b.h) L.push('\\subsection{' + texEscape(b.h) + '}')
          else if (b.p !== undefined) L.push(texEscape(b.p) + '\n')
          else if (b.ul) { L.push('\\begin{itemize}'); for (const it of b.ul) L.push('\\item ' + texEscape(it)); L.push('\\end{itemize}') }
        }
      })
      L.push('\\end{document}')
      return L.join('\n') + '\n'
    }
    // The repair pass keeps only the packages the text itself needs (docs/final-paper.md §8):
    // every optional or unknown package is dropped before the engine swap retry.
    function texStripOptionalPackages(tex) {
      return String(tex).split('\n').filter((line) => {
        if (/^\s*\\(?:input|include)\b/.test(line)) return false
        const m = /^\s*\\usepackage(?:\[[^\]]*\])?\{([^}]+)\}/.exec(line)
        if (!m) return true
        return m[1].split(',').map((x) => x.trim()).some((pk) => PAPER_REPAIR_CORE.indexOf(pk) !== -1)
      }).join('\n')
    }
    function texMinimal(tex, lang) {
      const body = String(tex).replace(/[\s\S]*?\\begin\{document\}/, '').replace(/\\end\{document\}[\s\S]*$/, '')
      return '\\documentclass[11pt]{' + (lang === 'en' ? 'article' : 'ctexart') + '}\n\\begin{document}\n' + body.trim() + '\n\\end{document}\n'
    }
    function paperEngineCandidates(lang) {
      const order = PAPER_ENGINE_ORDER[lang === 'en' ? 'en' : 'zh'].slice()
      const forced = String(params.paperLatexCommand || '').trim()
      if (!forced) return order
      // task-10: an EXPLICIT paperLatexCommand is used ALONE (docs/final-paper.md §B) - no fall-through.
      return [forced]
    }
    async function latexEngines(lang) {
      const sub = subprocessOf()
      // task-4: only a missing subprocess short-circuits - a host without resolveExecutable is still
      // served by the known-location stage (resolveKnownTool tolerates that host).
      if (!sub) {
        return { engines: [], reason: '宿主没有 subprocess 服务：无法检测或调用 LaTeX', triedPaths: [] }
      }
      const engines = []
      const triedPaths = []   // task-9: union of the known-root candidates probed across THIS detection
      // task-17: when paperLatexCommand is set, paperEngineCandidates() returns THAT VALUE ALONE. Probing it as
      // a bare command name made resolveKnownTool join it onto every known TeX root, so `triedPaths` reported
      // impossible paths like `<MiKTeX root>/Z:/no/such/xelatex.exe` (observed on a real host with 2.8.1).
      // Handing it over as the EXPLICIT value probes only it (docs/final-paper.md §B); '' keeps auto-detection.
      const forcedTex = String(params.paperLatexCommand || '').trim()
      for (const name of paperEngineCandidates(lang)) {
        try { const _vr = await resolveKnownTool(sub, { name, explicit: forcedTex, kind: 'tex' }); triedPaths.push(..._vr.tried); const exe = _vr.exe; if (exe) engines.push({ name: String(name), exe: String(exe), via: _vr.via }) } catch (e) { /* not installed */ }
      }
      return { engines, triedPaths, reason: engines.length ? '' : ('未检测到 LaTeX 引擎（' + paperEngineCandidates(lang).join('/') + '）') }
    }
    // ONE engine invocation. NEVER throws: every failure becomes a readable result (the Lean
    // seam's discipline) and a timeout really terminates the process.
    async function runPaperProcess(argv, cwd) {
      const sub = subprocessOf()
      const started = now()
      if (!sub || typeof sub.spawn !== 'function') return { ok: false, exitCode: null, ms: 0, message: 'no subprocess service' }
      let handle
      try {
        handle = sub.spawn({ argv, cwd, stdio: { stdin: 'ignore', stdout: { maxBytes: 64 * 1024 }, stderr: { maxBytes: 64 * 1024 } }, graceMs: 120000 })
      } catch (e) { return { ok: false, exitCode: null, ms: now() - started, message: String((e && e.message) || e) } }
      let outcome = null
      let timer = null
      try {
        const ran = Promise.resolve(handle.done).then((v) => ({ settled: true, value: v }), (e) => ({ settled: false, error: e }))
        const r = await Promise.race([
          ran,
          new Promise((resolve) => {
            timer = ctx.timeout(() => {
              try { if (typeof handle.terminate === 'function') handle.terminate() } catch (e) { /* the race result is the report */ }
              resolve({ settled: true, value: { exitCode: null, signal: 'SIGTERM' } })
            }, 120000)
          }),
        ])
        if (!r.settled) return { ok: false, exitCode: null, ms: now() - started, message: String((r.error && r.error.message) || r.error) }
        outcome = r.value
      } finally { if (timer) { try { timer() } catch (e) { /* already settled */ } } }
      const exitCode = outcome ? outcome.exitCode : null
      return { ok: exitCode === 0, exitCode, ms: now() - started, message: '' }
    }
    // Compile attempts are CAPPED (docs/final-paper.md §8): full → nonstopmode rerun → engine swap with
    // the optional packages stripped → one minimal-template retry → report and degrade.
    async function compilePaperTex(id, tex, lang) {
      if (await fileExistsAbs(paperAbs(id, 'paper.pdf'))) {
        return { status: 'kept-existing', engine: '', reason: 'Paper/' + id + '/paper.pdf 已存在：不覆盖（docs/final-paper.md §5）', attempts: [] }
      }
      const det = await latexEngines(lang)
      if (!det.engines.length) return { status: 'not-detected', engine: '', reason: det.reason, triedPaths: det.triedPaths || [], attempts: [] }
      const e0 = det.engines[0], e1 = det.engines[1] || e0
      const plan = [
        { label: 'full', engine: e0, text: tex, nonstopOnly: false },
        { label: 'nonstopmode-rerun', engine: e0, text: tex, nonstopOnly: true },
        { label: 'engine-swap+stripped', engine: e1, text: texStripOptionalPackages(tex), nonstopOnly: true },
        { label: 'minimal-template', engine: e0, text: texMinimal(tex, lang), nonstopOnly: true },
      ]
      const attempts = []
      for (const a of plan) {
        const r = await runLatexAttempt(id, a)
        attempts.push(r)
        if (r.ok) return { status: 'compiled', engine: a.engine.name, attempts }
      }
      return { status: 'failed', engine: '', reason: '编译在 ' + attempts.length + ' 次尝试后仍失败（已保留 paper.tex 与 paper.md）', attempts }
    }
    async function runLatexAttempt(id, a) {
      const dirRel = paperDirRel(id)
      const dirAbs = instRoot() + '/' + dirRel
      if (!await writeTextRel(dirRel + '/paper.tex', a.text)) {
        return { label: a.label, engine: a.engine.name, ok: false, exitCode: null, ms: 0, message: 'tex 写入失败' }
      }
      const started = now()
      const args = a.engine.name === 'tectonic'
        ? ['-X', 'paper.tex']
        : (a.nonstopOnly ? ['-interaction=nonstopmode', 'paper.tex'] : ['-interaction=nonstopmode', '-halt-on-error', 'paper.tex'])
      const argv = [a.engine.exe].concat(args)
      // TWO passes (docs/final-paper.md §8): the second resolves references/TOC. A failed first pass is not
      // rerun — the retry PLAN is what varies the command, not a blind repeat.
      const first = await runPaperProcess(argv, dirAbs)
      if (!first.ok) return { label: a.label, engine: a.engine.name, ok: false, exitCode: first.exitCode, ms: now() - started, message: first.message || 'first pass failed' }
      const second = await runPaperProcess(argv, dirAbs)
      const pdf = await fileExistsAbs(paperAbs(id, 'paper.pdf'))
      return { label: a.label, engine: a.engine.name, ok: second.ok && pdf, exitCode: second.exitCode, ms: now() - started, message: pdf ? (second.message || '') : '编译器没有产出 paper.pdf' }
    }
    function paperMeta(p, extra) {
      const o = extra || {}
      const active = paperActiveParticipants(p)
      const skipped = (p.participants || []).filter((x) => active.indexOf(x) === -1)
      return {
        id: p.id,
        dir: 'Paper/' + p.id + '/',
        institute: instituteName, project, runId: inst().runId || runId || '',
        problemId: (inst().problem || {}).id || '',
        trigger: p.trigger,
        finalizedAt: o.finalizedAt || (p.finalizedAt || now()),
        language: p.lang, format: p.format, compilePdf: p.pdf === true,
        editor: p.editor, editorNote: p.editorNote || '', editorFallback: !!p.editorFallback,
        finalisation: p.final || null,
        consultation: Object.assign({ messages: 0, meetings: 0 }, p.consult || {}),
        participants: p.participants || [], skipped,
        rounds: p.round, maxRounds: PAPER_MAX_ROUNDS,
        parts: Object.keys(p.parts || {}).map((id) => ({ member: id, round: (p.parts[id] || {}).round, title: (p.parts[id] || {}).title || '', evidence: ((p.parts[id] || {}).evidence || []).length })),
        reviews: Object.keys(p.reviews || {}).map((id) => ({ member: id, of: (p.reviews[id] || {}).of, round: (p.reviews[id] || {}).round, deliverable: (p.reviews[id] || {}).deliverable === true })),
        disagreement: p.disagreement || [], warnings: o.warnings || p.warnings || [],
        forcedAfterCap: !!p.forcedAfterCap,
        sections: PAPER_SECTIONS.length,
        compile: o.compile || { status: p.compile || 'unknown', engine: p.engine || '', attempts: [] },
        params: {
          finalPaper: params.finalPaper, paperFormat: params.paperFormat, paperLanguage: params.paperLanguage,
          paperCompilePdf: params.paperCompilePdf, paperEditor: params.paperEditor, paperLatexCommand: params.paperLatexCommand,
        },
        files: o.files || [],
      }
    }
    async function refillPaperArtifacts(p) {
      const id = p.id
      const active = paperActiveParticipants(p)
      const skipped = (p.participants || []).filter((x) => active.indexOf(x) === -1)
      const conclusionText = await readTextRel('Problems/conclusion.md')
      const S = paperSections(p, active, skipped, paperEvidence(), { final: p.final, conclusionText })
      const filled = []
      if (p.format !== 'tex' && (await readTextAbs(paperAbs(id, 'paper.md'))) === undefined) {
        if (await writeTextRel(PAPER_FILE(id, 'paper.md'), renderPaperMd(p, S))) filled.push('paper.md')
      }
      let tex = await readTextAbs(paperAbs(id, 'paper.tex'))
      if (p.format !== 'md' && tex === undefined) {
        tex = renderPaperTex(p, S)
        if (await writeTextRel(PAPER_FILE(id, 'paper.tex'), tex)) filled.push('paper.tex')
      }
      if (p.format !== 'md' && p.pdf === true && !await fileExistsAbs(paperAbs(id, 'paper.pdf'))) {
        const c = await compilePaperTex(id, tex || renderPaperTex(p, S), p.lang)
        if (c.status === 'compiled') filled.push('paper.pdf')
        // Same rule as finalizePaper: the delivered tex is always the canonical generated one.
        if (tex !== undefined && tex !== null) await writeTextRel(PAPER_FILE(id, 'paper.tex'), tex)
      }
      if ((await readTextAbs(paperAbs(id, 'paper.meta.json'))) === undefined) {
        if (await writeTextRel(PAPER_FILE(id, 'paper.meta.json'), JSON.stringify(paperMeta(p, { refilled: true }), null, 2) + '\n')) filled.push('paper.meta.json')
      }
      if ((await readTextAbs(paperAbs(id, 'paper.log.md'))) === undefined) {
        await paperLog('重复触发：补写缺失产物', '- 本次补写：' + (filled.join('、') || '（无缺失）'))
        filled.push('paper.log.md')
      } else if (filled.length) {
        await paperLog('重复触发：补写缺失产物', '- 本次补写：' + filled.join('、'))
      }
      return { filled }
    }
    async function finalizePaper(reason) {
      const p = paper()
      if (!p) return { ok: false, code: 'V5_PAPER_STATE', message: 'no paper flow' }
      const id = p.id
      const active = paperActiveParticipants(p)
      const skipped = (p.participants || []).filter((x) => active.indexOf(x) === -1)
      const ev = paperEvidence()
      const conclusionText = await readTextRel('Problems/conclusion.md')
      const finalizedAt = now()
      const S = paperSections(p, active, skipped, ev, { final: p.final, conclusionText })
      const files = []
      // F6: every REQUIRED artifact write is checked. A failure does NOT block finalisation (the paper
      // is still delivered from whatever landed) but it must be NAMED, not silently dropped from `files`.
      const writeFailures = []
      if (p.format !== 'tex') {
        if (await writeTextRel(PAPER_FILE(id, 'paper.md'), renderPaperMd(p, S))) files.push('paper.md')
        else writeFailures.push('paper.md')
      }
      let tex = ''
      if (p.format !== 'md') {
        tex = renderPaperTex(p, S)
        if (await writeTextRel(PAPER_FILE(id, 'paper.tex'), tex)) files.push('paper.tex')
        else writeFailures.push('paper.tex')
      }
      // `paperFormat=md` with `paperCompilePdf=true` must NOT warn about a missing tex: no tex
      // was produced, so compilation is skipped silently (docs/final-paper.md §8).
      let compile
      if (p.format === 'md') compile = { status: 'skipped', engine: '', reason: 'paperFormat=md：未产出 tex，跳过编译', attempts: [] }
      else if (p.pdf !== true) compile = { status: 'skipped', engine: '', reason: 'paperCompilePdf=false', attempts: [] }
      else compile = await compilePaperTex(id, tex, p.lang)
      // The repair attempts overwrite `paper.tex` with stripped/minimal variants to get past a
      // broken engine. Whatever the compile outcome, the DELIVERED tex must be the real,
      // fully-generated one (the attempts are recorded in the meta either way).
      if (p.format !== 'md') await writeTextRel(PAPER_FILE(id, 'paper.tex'), tex)
      // task-18: the body is composed BEFORE compilation runs, so the outcome cannot live in the sections.
      // v4 states it in the delivered artifacts since 2.8.1; v5 must too — ONCE and idempotently (finalisation
      // can be re-entered). The marker sentence is the same family as the warning below, and the presence
      // check keeps the two paths from ever duplicating it.
      if (compile.status === 'failed' || compile.status === 'not-detected') {
        const zhNote = p.lang !== 'en'
        const note = compile.status === 'failed'
          ? (zhNote ? 'PDF 编译失败：已保留 paper.tex 与 paper.md 并上报' : 'PDF compilation failed: paper.tex and paper.md were kept and reported')
          : (zhNote ? '本机未检测到 LaTeX 引擎：只产出 tex+md' : 'No LaTeX engine detected: tex+md only')
        const annotate = async (rel, file, isTex) => {
          const cur = await readTextAbs(paperAbs(id, file))
          if (typeof cur !== 'string' || cur.indexOf(note) !== -1) return
          const line = (isTex ? '% ' : '- ') + note
          const next = isTex && cur.indexOf('\\end{document}') !== -1
            ? cur.replace('\\end{document}', line + '\n\\end{document}')
            : cur.replace(/\s*$/, '') + '\n' + line + '\n'
          await writeTextRel(rel, next)
        }
        if (p.format !== 'tex') await annotate(PAPER_FILE(id, 'paper.md'), 'paper.md', false)
        if (p.format !== 'md') await annotate(PAPER_FILE(id, 'paper.tex'), 'paper.tex', true)
      }
      if (await fileExistsAbs(paperAbs(id, 'paper.pdf'))) files.push('paper.pdf')
      const warnings = (p.warnings || []).slice()
      if (compile.status === 'failed') warnings.push('LaTeX 编译失败（已保留 paper.tex 与 paper.md，不阻塞定稿）：' + (compile.attempts || []).map((a) => a.engine + '/' + a.label + ' exit=' + a.exitCode + (a.message ? '(' + a.message + ')' : '')).join('；'))
      if (compile.status === 'not-detected') warnings.push('未检测到 LaTeX 引擎（' + (compile.reason || '') + '）：只交付 paper.tex 与 paper.md。已探测 PATH 与文档化的常见 TeX 根；可用 paperLatexCommand 指定绝对路径。最常见的情形是引擎已安装但不在 PATH（Windows 盘根下的 texlive\\<年>\\bin\\windows、类 Unix /usr/local|/opt/texlive/<年>/bin/*、macOS /Library/TeX/texbin 已纳入有界探测）：把引擎的绝对路径写进 paperLatexCommand 再探测一次；仍找不到就如实上报所办（由所办向用户确认安装），随后照旧安全降级。')
      // F6: the failed REQUIRED writes are named ONCE (for this finalisation), before the meta is built,
      // so the warning lands in `meta.warnings`, in the flow log, in the state and in the return value.
      if (writeFailures.length) warnings.push(paperWriteFailureWarning(writeFailures))
      const meta = paperMeta(Object.assign({}, p, { finalizedAt, compile: compile.status, engine: compile.engine || '' }), {
        finalizedAt, warnings, compile: { status: compile.status, engine: compile.engine || '', reason: compile.reason || '', triedPaths: compile.triedPaths || [], attempts: compile.attempts || [] }, files,
      })
      if (await writeTextRel(PAPER_FILE(id, 'paper.meta.json'), JSON.stringify(meta, null, 2) + '\n')) files.push('paper.meta.json')
      // `meta.warnings` is the SAME array, so a meta write failure still reaches the state, the log and
      // the tool's return value even though the file that should have carried it is the one missing.
      else warnings.push(paperWriteFailureWarning(['paper.meta.json']))
      const logRes = await paperLog('定稿（' + reason + '）', [
        '- 目录：Paper/' + id + '/',
        '- 产物：' + files.join('、'),
        '- 编译：' + compile.status + (compile.engine ? '（' + compile.engine + '）' : '') + '｜尝试 ' + (compile.attempts || []).length + ' 次',
        '- 定稿代表：' + p.editor + '｜轮次：' + p.round + '/' + PAPER_MAX_ROUNDS,
        '- 所办交流：消息 ' + Number((p.consult || {}).messages || 0) + ' 条、会议 ' + Number((p.consult || {}).meetings || 0) + ' 次',
        (p.final && p.final.note ? '- 定稿说明：' + p.final.note : ''),
        (warnings.length ? '- 警告：\n  - ' + warnings.join('\n  - ') : ''),
      ].filter(Boolean).join('\n'))
      // F6: a failed flow-log write is named too — the log is a required artifact of the paper flow. The
      // meta is REWRITTEN here because it was serialised BEFORE this attempt: without the rewrite the
      // durable meta would be the one artifact whose `warnings` does not mention the missing log. (If the
      // meta path is refused as well the rewrite fails silently — its own warning is already recorded.)
      if (!logRes.ok) {
        warnings.push(paperWriteFailureWarning(['paper.log.md']))
        await writeTextRel(PAPER_FILE(id, 'paper.meta.json'), JSON.stringify(meta, null, 2) + '\n')
      }
      await mutatePaper((cur) => (cur ? Object.assign({}, cur, {
        status: 'finalized', stage: 'finalized', finalizedAt, compile: compile.status,
        engine: compile.engine || '', warnings, artifacts: files, updatedAt: now(),
      }) : cur))
      await saveChatLine('【论文】最终论文已定稿：Paper/' + id + '/（' + (files.join('、') || '（无产物）') + '；编译 ' + compile.status + '）。')
      notifyActivity()
      // The run is only now complete (docs/final-paper.md §3): the paper phase ran BEFORE the flags.
      if (p.completesRun && !autoDone) await finishRun('全体有表决权者一致认为原问题已解决')
      return {
        ok: true, finalized: true, id, dir: 'Paper/' + id + '/', files,
        compile: compile.status, engine: compile.engine || '', attempts: (compile.attempts || []).length,
        warnings, agreement: !(p.disagreement || []).length, rounds: p.round,
      }
    }

    // ---- hire / fire -------------------------------------------------------
    // INVARIANT (HIGH 2): an ACTIVE temp always has an ACTIVE employer — `fire` dismisses a
    // member's temps with it (`dismissTempsOf`), and the office idempotently catches up on state
    // written before that cascade existed. `maxTempTotal` is therefore counted exactly over the
    // temps a running institute can still use.
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
      if (mine >= perCap) return { ok: false, code: 'V5_MEMBER_LIMIT', scope: 'per-member', message: '你名下同时最多 ' + perCap + ' 名临时工（先在册 ' + mine + ' 名）；请先解雇不再需要的' }
      if (employedTemps().length >= totalCap) return { ok: false, code: 'V5_MEMBER_LIMIT', scope: 'institute', message: '全所同时在册临时工已达上限 ' + totalCap }
      const member = await newMember('temp', {
        direction: purpose, hiredBy: office ? 'office' : callerId, term: String(args.term || ''), provider: pickProvider(),
      })
      try {
        await spawnMember(member, initialTask)
      } catch (e) {
        await putMember(Object.assign({}, memberById(member.id) || member, { phase: 'failed', error: String((e && e.message) || e), failReason: isActivationLimitReached(e) ? 'activation-limit' : 'other' }))
        // Name the host's live-child cap (maxActiveSubagents) instead of relaying its opaque
        // "subagent limit reached (active child limit: N)" string, and use the typed code so the
        // hirer can tell a HOST ceiling from a broken provider. The durable `failReason` above is
        // what `retryPendingSpawns()` (G-6) reads to re-create this temp when capacity frees up.
        if (isActivationLimitReached(e)) { noteChildLimit(e); return { ok: false, code: 'ACTIVATION_LIMIT_REACHED', message: '临时工创建失败：' + activationLimitText(hostChildLimit) + '（已登记为待补建：容量释放后框架会在下一次调度轮次自动重试）' } }
        return { ok: false, code: 'V5_PROVISIONING_CONFLICT', message: '临时工创建失败：' + String((e && e.message) || e) }
      }
      await saveChatLine('【雇佣】' + (office ? '所办' : callerId) + ' 雇入临时工 ' + member.id + '，用途：' + purpose)
      await markProgress()
      notifyActivity()
      return { ok: true, id: member.id, kind: 'temp', purpose, note: '现在可以用 vibe_v5_say {to:"' + member.id + '"} 或 vibe_v5_assign 给它派活' }
    }
    // HIGH 2 (deep review): a dismissed member's TEMP WORKERS are dismissed WITH IT. They carry
    // `hiredBy: <employer id>`, so once the employer is dismissed the employer check
    // (`target.hiredBy === callerId`) can never match again — only the office could ever clear
    // them — while `employedTemps()` kept counting them against `maxTempTotal` and the scheduler
    // kept waking them (a dismissed member's team quietly burning budget). The rule is explicit:
    // **a member's temps belong to that member's tenure**. The cascade is one level deep because
    // temps may not hire (`hire` refuses a temp caller), so no deeper recursion is possible.
    async function dismissTempsOf(employerId, callerId, note) {
      const mine = inst().members.filter((m) => m.kind === 'temp' && m.phase === 'active' && m.hiredBy === employerId)
      const done = []
      for (const t of mine) {
        const r = await fire(callerId, { id: t.id, reason: note })
        if (r && r.ok) done.push(t.id)
      }
      return done
    }
    // Firing is REAL: the current turn is cancelled, the resident continuable child is
    // released, its tasks are reclaimed, its queued mail is dropped, its own temp workers are
    // dismissed with it, and it is marked dismissed. Its id is never reused, so a re-hire can
    // never inherit its archives.
    async function fire(callerId, o) {
      const args = o || {}
      const id = String(args.id || args.member || '').trim()
      const target = memberById(id)
      if (!target) return { ok: false, code: 'V5_MEMBER_NOT_FOUND', message: 'no such member ' + id }
      if (target.phase === 'dismissed') {
        // Idempotent cleanup for state written before the cascade existed (or a hand-edited
        // file): only the office may act here, because a dismissed non-temp target skips the
        // permission check below.
        const cleaned = isOffice(callerId) ? await dismissTempsOf(id, callerId, '雇主已被解雇（补做级联）') : []
        return { ok: true, already: true, cascadedTemps: cleaned, message: id + ' 已被解雇' }
      }
      const office = isOffice(callerId)
      const acad = isAcademician(callerId)
      const allowed = office || (acad && params.academicianLeads && target.kind === 'temp') || (target.kind === 'temp' && target.hiredBy === callerId)
      if (!allowed) {
        // MEDIUM 5 (deep review): the refusal names the ACTUAL matrix. The old text promised the
        // academician a power it only has when `academicianLeads` is on, and implied it could
        // dismiss a permanent researcher (it cannot — see the next guard).
        return { ok: false, code: 'V5_MEMBER_NOT_FOUND', message: '拒绝：能解雇它的只有 ①所办 ②该临时工的雇主本人 ③academicianLeads=true 时的院士（且仅限临时工）；常驻研究员只能由所办解聘，成员只能向所办提议' }
      }
      if (target.kind !== 'temp' && !office) {
        return { ok: false, code: 'V5_NOT_ACADEMICIAN', message: '解聘常驻研究员只能向所办提议，由所办批准（成员不能直接执行）' }
      }
      const reason = String(args.reason || '').trim()
      const reclaimed = await releaseTasksOf(id, 'dismissed: ' + reason)
      // Cascade BEFORE the employer is marked dismissed: the temps are still reachable and the
      // caller's authority (office / leading academician) is the same one that dismissed them.
      const cascaded = target.kind === 'temp' ? [] : await dismissTempsOf(id, callerId, '雇主 ' + id + ' 被解雇（级联）')
      if (target.childId) {
        try { if (typeof subagents.interrupt === 'function') subagents.interrupt(target.childId, { kind: 'ancestor', agent: rootAgent }) } catch (e) { /* fire-and-return */ }
        try {
          if (typeof subagents.drainContinuableChildren === 'function') await subagents.drainContinuableChildren(rootAgent, [target.childId])
        } catch (e) { console.error('vibe-math-v5r: drain ' + id + ': ' + String((e && e.message) || e)) }
        childOwner.delete(target.childId)
        inflight.delete(target.childId)
        liveAgents.delete(target.childId)
      }
      busy.delete(id)
      // HIGH 3: withdraw the dismissed member's durable solve answer, exactly like its ballot is
      // dropped from every open verdict below (an answer from a former member must not carry).
      await putSolve({ member: id, value: null })
      rounds.delete(id)
      roundsSinceCompact.delete(id)
      contextPct.delete(id)
      seeds.delete(id)
      // A dismissed member is no longer a voter: drop its ballot from every OPEN verdict, so
      // a verdict that has not closed yet can never be carried by a former member's vote
      // (audit H2). `judgeVerdict` reads only the live roster anyway; this keeps the durable
      // record honest too. Already-closed verdicts are history and are left untouched.
      const openVerdicts = Object.values(inst().verdicts).filter((v) => v && !v.closed && v.votes && v.votes[id] !== undefined)
      for (const v of openVerdicts) {
        const votes = Object.assign({}, v.votes)
        delete votes[id]
        await putVerdict(v.target, Object.assign({}, v, { votes }))
      }
      if (meeting) {
        delete meeting.inputs[id]
        delete meeting.extras[id]
        delete meeting.speeches[id]
        delete meeting.asked[id]
        delete meeting.silent[id]
        delete meeting.unreached[id]
        delete meeting.hands[id]
        delete meeting.spokeCount[id]
        delete meeting.retries[id]
        delete meeting.invited[id]      // 受邀临时工被解雇 ⇒ 撤销邀请（其已写发言保留在纪要里）
        meeting.order = meeting.order.filter((x) => x !== id)
        meeting.roster = meeting.roster.filter((x) => x !== id)
      }
      // Drop its queued mail: a dismissed member must never be messaged again.
      const ids = inst().messages.filter((m) => m.to === id).map((m) => m.id)
      if (ids.length) await ackDelivered(ids)
      await putMember(Object.assign({}, target, {
        phase: 'dismissed', dismissedAt: now(), dismissReason: reason, childId: '',
      }))
      await writeRosterMirror()
      await saveChatLine('【解雇】' + id + ' 已由 ' + (office ? '所办' : callerId) + ' 解雇（原因：' + (reason || '未说明') +
        '）。代号永不复用；其未完成任务已收回' + (reclaimed.length ? '（' + reclaimed.join('、') + '）' : '') +
        (cascaded.length ? '；随其解雇的临时工 ' + cascaded.join('、') + '（雇主离场 ⇒ 其临时工一并解雇）' : '') + '。')
      await markProgress()
      notifyActivity()
      await scheduleNext()
      return { ok: true, dismissed: id, reclaimedTasks: reclaimed, cascadedTemps: cascaded, reason }
    }
    async function nudge(callerId, o) {
      if (!callerId) return memberDiagnosis('督办（vibe_v5_nudge）', callerId)
      const denyNudge = await gateDo(callerId, 'nudge', 'only the academician (or the office) can nudge members')
      if (denyNudge) return denyNudge
      const args = o || {}
      const to = String(args.to || '').trim()
      const target = memberById(to)
      if (!target || target.phase !== 'active') return { ok: false, code: 'V5_MEMBER_NOT_FOUND', message: 'active member "' + to + '" not found' }
      const why = String(args.why || '').trim()
      // A nudge is SUPERVISION, not an assignment, and it must name its true origin:
      // an office nudge previously arrived labelled "院士督办" under the 【院士分派】
      // prefix, so the member was told the academician had spoken when it had not.
      const office = isOffice(callerId)
      await say(office ? 'office' : callerId, {
        to, kind: 'nudge',
        text: (office ? '所办督办' : '院士督办') + '：' + (why || '(未说明)') +
          (args.next_step ? '｜建议的下一步：' + String(args.next_step) : ''),
      })
      await wakeIfIdle(target)
      return { ok: true, nudged: to }
    }

    // ---- inbox-aware waking -------------------------------------------------
    // The mailbox is drained BEFORE the round prompt is built, and the round prompt is
    // therefore passed as a THUNK. Order matters: `promptFor` used to receive an already
    // built prompt (which had already embedded the pending mail through
    // briefBlock's [新到的消息/通知]) and then prepended the same messages again, so a
    // member read every newly delivered message TWICE in one prompt — once in the
    // prepended inbox block and once inside its own [状态] block.
    async function promptFor(member, baseFn) {
      const pending = pendingFor(member.id)
      // G1: only NEWLY pending messages are prepended. A second build before the wake must not repeat the
      // inbox block (the duplicate-read defect), and the mark is what makes that true while the ack is
      // deferred to the wake.
      const seen = inboxInjected.get(member.id) || new Set()
      const fresh = pending.filter((p) => !seen.has(p.id))
      const inbox = fresh.length ? composeInbox(fresh) : ''
      if (fresh.length) { for (const p of fresh) seen.add(p.id); inboxInjected.set(member.id, seen) }
      // While a block IS being prepended, the base build must not embed the same mail a second time
      // (briefBlock's `[新到的消息/通知]`). When nothing is prepended the base block still shows whatever
      // is pending — so a member reads each message exactly once either way.
      if (inbox) inboxSuppressed.add(member.id)
      let base
      try { base = typeof baseFn === 'function' ? baseFn() : baseFn }
      finally { inboxSuppressed.delete(member.id) }
      // G1 (mailbox): the pending list is RETURNED, not acked here — the ack moved to wakeWithInbox,
      // after the send actually succeeded. Acking at prompt-build time removed the messages from
      // `messages` (EV.delivered) BEFORE the send, so a failed/invalid wake lost them silently.
      return { text: (inbox ? inbox + '\n\n' : '') + base, pending }
    }
    async function wakeWithInbox(member, baseFn, kind) {
      // G1 (mailbox) invariant: "not acked => still redeliverable". `wakeMember` returns false when it
      // never sent (no childId / member not active) or when `sendMessage` threw, so acking only on
      // `ok` keeps the message in the durable queue for the next successful wake.
      const prompt = await promptFor(member, baseFn)
      const ok = await wakeMember(member, prompt.text, kind)
      // The attempt is concluded either way: drop the injection mark so the NEXT attempt re-prepends
      // whatever is still pending (a failed wake must not leave the message suppressed for ever).
      inboxInjected.delete(member.id)
      if (ok && prompt.pending.length) await ackPending(prompt.pending)
      return ok
    }

    // ---- scheduling / graded keep-alive (ported and upgraded from v4 §25) ---
    // Priority: verification -> meeting -> parked meeting -> queued verification ->
    // assigned/claimed work -> urgent mail -> chat digest -> stall meeting -> heartbeat.
    // The heartbeat is only the LAST resort; the primary driver is the one-shot
    // activity wait, which costs no tokens while the institute is genuinely idle.
    function syncParamsFromState() {
      const cur = inst()
      // Same rule as the load path above: never adopt a persisted value without normalising it
      // (a foreign-shaped state file must not leak straight into the runtime params).
      if (cur && cur.params) {
        const droppedSync = []
        params = Object.assign({}, DEFAULT_PARAMS, normalizeParams(cur.params, droppedSync))
        reportDroppedStateKeys(cur, droppedSync, 'restore-sync')
      }
      if (cur && cur.project) project = cur.project
      if (cur && cur.institute) instituteName = cur.institute
      if (cur) {
        phase = cur.phase || phase
        // S1: keep the concluded marker in sync with the persisted phase on EVERY sync (this is
        // the path `status()`/`report()`/`configure()` go through), so no view can show a
        // concluded institute as ongoing, or vice versa.
        autoDone = String(phase) === 'solved'
      }
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
      dbg.schedEnter += 1
      if (!running || autoDone) return
      if (scheduling) { dbg.schedSkip += 1; reschedule = true; return }
      scheduling = true
      try {
        do {
          reschedule = false
          await schedulePass()
        } while (reschedule && running && !autoDone)
      } catch (e) {
        console.error('vibe-math-v5r: scheduling pass failed: ' + String((e && e.stack) || e))
      } finally {
        scheduling = false
      }
    }
    // ---- G-6 (installer review): refused member spawns are DEFERRED, not lost ----------------
    // v4 queued a cap-refused spawn in `pendingSpawns` and retried it on the next heartbeat; v5 had
    // no such queue (only the manual `resume` path retried cap-class failures), so a refusal whose
    // capacity later freed up produced "nothing happens". The queue here is DERIVED from durable
    // state instead of being a second source of truth: a refused member is already persisted as
    // `phase:'failed'` with `failReason:'activation-limit'`, so a restart cannot lose the intent and
    // a successful retry clears it by construction (the member becomes `active`). Only the bounded
    // attempt counter is session memory.
    // Only the attempt counter is session memory; the queue itself derives from durable state. The
    // retry is bounded by the STOPPING RULE, not by a session counter (v4's shape): a still-capped
    // member IS retried on the next pass — that attempt is free, because `spawnMember` answers from
    // the recorded ceiling without asking the host (v5:2037) — while any NON-capacity provisioning
    // error stops the auto-retry for that member (a broken provider must not be resurrected).
    const spawnRetryAttempts = new Map()
    // ONE predicate for "this member was refused by the host's live-child CAP" — used by the
    // automatic retry here AND by `resume`'s rebuild path, so the two can never disagree about
    // which failures are deferred work (an ordinary broken-provider failure must never be
    // resurrected). The explicit durable `failReason` is checked first; the recorded error text is
    // the fallback for records written before it existed / by paths that only had the message.
    function isCapRefusedMember(m) {
      if (!m || m.phase !== 'failed') return false
      if (m.failReason === 'activation-limit') return true
      // TEST SEAM (documented; NOT a product surface): with the text fallback disabled, ONLY the
      // durable reason counts — running the same scenario with `V5_SPAWN_RETRY_STRICT=1` proves that
      // every cap-refusal path records `failReason` and that no behaviour depends on error-string
      // matching. Read per call so a suite can toggle it around one scenario.
      if (String(process.env.V5_SPAWN_RETRY_STRICT || '') === '1') return false
      return /active child limit|maxActiveSubagents/.test(String(m.error || ''))
    }
    function pendingSpawnMembers() {
      return inst().members.filter((m) => isCapRefusedMember(m) && !m.childId)
    }
    async function retryPendingSpawns() {
      // TEST SEAM (documented; NOT a product surface): `V5_SPAWN_RETRY=manual` disables the
      // automatic retry for this process, so a suite can pin the MANUAL `resume` rebuild path
      // without racing the scheduler. Read per call, so a test can toggle it around one section.
      if (String(process.env.V5_SPAWN_RETRY || '').toLowerCase() === 'manual') return 0
      if (!running || autoDone) return 0
      const pending = pendingSpawnMembers()
      if (!pending.length) return 0
      let spawned = 0
      for (const m of pending) {
        const n = spawnRetryAttempts.get(m.id) || 0
        spawnRetryAttempts.set(m.id, n + 1)
        try {
          await spawnMember(m, null)
          spawnRetryAttempts.delete(m.id)
          spawned += 1
          await saveChatLine('【编制】容量已释放：重试创建成员 ' + m.id + ' 成功（第 ' + (n + 1) + ' 次尝试）。')
          await markProgress()
        } catch (e) {
          // Still capped: keep it queued and re-check on the next pass. Any OTHER provisioning error
          // is not a capacity problem — stop auto-retrying it (the operator gets a notice instead).
          if (!isActivationLimitReached(e)) {
            spawnRetryAttempts.delete(m.id)
            await notice('office', '成员 ' + m.id + ' 的自动重试已停止（非容量类失败）：' + String((e && e.message) || e))
          }
        }
      }
      return spawned
    }
    async function schedulePass() {
      dbg.passes += 1
      // MEDIUM 8 (deep review): EVERY scheduling pass reads state, and a pass can be armed by a
      // timer or an event callback that never went through a tool wrapper. Awaiting the load here
      // is what makes the internal paths safe by construction instead of by convention (a pass
      // fired before the state file was folded in would otherwise see an empty roster and could
      // schedule against it).
      if (!loadSettled) { try { await ready() } catch (e) { /* the pass still runs; status reports it */ } }
      // G-6: deferred spawns are retried BEFORE anything else is scheduled, so freed capacity is
      // spent on the work the cap previously refused (v4's `retryPendingSpawns()` position).
      try { await retryPendingSpawns() } catch (e) { console.error('vibe-math-v5r: pending-spawn retry failed: ' + String((e && e.message) || e)) }
      clearHeartbeat()
      syncParamsFromState()
      // A verification that is ALREADY in flight is served first: the two coordination
      // processes are mutually exclusive by construction, so the order only decides which
      // of two impossible states wins — but checking `meeting` first meant a meeting that
      // can never close starved the verification's own watchdog forever (audit M3).
      const vs = currentVerify()
      if (vs) { await continueVerifyRound(vs); return }
      if (meeting) { await continueMeetingRound(); return }
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
      // The final-paper phase (docs/final-paper.md §3) owns the room once it is active: a paper ask is its
      // own kind of turn, and a research round must not be mistaken for a paper answer. While
      // the flow waits for the OFFICE the institute keeps working normally — the required
      // consultation needs office messages and a real meeting to be deliverable.
      if (paperActive()) {
        await paperPass()
        const cur = paper()
        const waitingForOffice = !!cur && cur.status === 'awaiting-editor' && cur.editor === 'office'
        if (!waitingForOffice) return
      }
      const budget = Math.max(1, Math.floor(Number(params.maxParallel) || 3))
      const idleMs = posMs(params.activityTimeoutMs, 120000)
      let filled = 0
      // (a) members with work they already own or were assigned.
      // PACED by the same idle window the heartbeat uses. Without the gate this branch
      // re-woke a task owner the instant its turn ended — and because every reply drives
      // another scheduling pass, a single unfinished task turned into an unbounded
      // wake -> turn -> wake chain that no parameter could slow down and that no pause
      // could interrupt between turns. New traffic still gets through immediately: the
      // addressed-mail branch below is not paced.
      const tasks = inst().tasks
      for (const t of tasks) {
        if (filled >= budget) break
        if (t.status !== 'in_progress' || !t.ownerId) continue
        const m = memberById(t.ownerId)
        if (!m || m.phase !== 'active' || busy.has(m.id)) continue
        if ((now() - (lastActiveAt.get(m.id) || 0)) < idleMs) continue
        const ok = await wakeWithInbox(m, () => normalPrompt(m), 'normal')
        if (ok) filled += 1
        else armHeartbeat()
      }
      if (filled > 0) armHeartbeat()
      // (b) urgent mail (anything addressed, or a due chat digest)
      const idle = activeMembers().filter((m) => !busy.has(m.id))
      for (const m of idle) {
        if (filled >= budget) break
        const d = deliveryDecision(m.id)
        if (!d.deliver || !d.urgent) continue
        const ok = await wakeWithInbox(m, () => normalPrompt(m), 'normal')
        if (ok) filled += 1
        else armHeartbeat()
      }
      if (filled >= budget) { armDigest(); armHeartbeat(); return }
      // (c) due chat digest for otherwise-idle members
      const chatDue = idle.filter((m) => { const d = deliveryDecision(m.id); return d.deliver && !d.urgent })
      if (chatDue.length) {
        for (const m of chatDue) {
          if (filled >= budget) break
          const ok = await wakeWithInbox(m, () => normalPrompt(m), 'normal')
          if (ok) filled += 1
        }
        if (filled) { armHeartbeat(); return }
        armDigest()
      }
      // (d) stalled institute -> ONE notice per stall episode (S5 / R1+D10): the framework only
      // RECOMMENDS and never acts for the institute. It does NOT convene a meeting, does NOT
      // adjourn/close anything, does NOT advance a stage and does NOT speak for a member
      // (chair-first stays R4/H2; ballots stay R2/R3/D3/D8). Guarded on busy.size===0 so an
      // in-flight round is never pre-empted. The episode key is `sinceAt` (= lastProgressAt), so a
      // long stall is announced ONCE and never repeated (D10: 不反复重申).
      const noticeMs = stallNoticeMs()
      if (noticeMs > 0 && !meeting && !pendingMeeting && !hasVerifyInFlight() && phase === 'active' &&
        busy.size === 0 && (now() - lastProgressAt) >= noticeMs) {
        // NO `return` here: a pass that emits the one-shot notice must still fall through to the
        // tail (`armDigest()`/`armHeartbeat()`). The pass began with `clearHeartbeat()`, so
        // returning would leave the scheduler with NO timer at all — measured: the institute
        // froze after its own notice and the next stall episode never fired.
        await emitStallNotice()
      }
      // (e) heartbeat: push the longest-idle member to make progress rather than just
      // asking "are we done" (v4's original heartbeat invited stagnation). A member that
      // owns in-progress work gets a WORK round (its task block in [状态] tells it what
      // it owes); an otherwise idle member gets the heartbeat that asks it to advance the
      // problem by itself.
      if (busy.size < budget && idle.length) {
        const candidates = idle.slice().sort((a, b) => (lastActiveAt.get(a.id) || 0) - (lastActiveAt.get(b.id) || 0))
        const pick = candidates[0]
        if (pick && (now() - (lastActiveAt.get(pick.id) || 0)) >= idleMs) {
          const owns = inst().tasks.some((t) => t.ownerId === pick.id && t.status === 'in_progress')
          const ok = await wakeWithInbox(pick,
            () => (owns ? normalPrompt(pick) : checkpointPrompt(pick)),
            owns ? 'normal' : 'checkpoint')
          // ALWAYS re-arm after a wake, even on success. A wake whose turn never ends
          // (a host that drops the delivery, a child that vanished) would otherwise
          // leave nothing to schedule the next pass and the institute would freeze
          // permanently — the same failure class as v4 §25. The armed pass is cheap and
          // cannot double-wake anyone, because every branch checks `busy` first.
          armHeartbeat()
          if (!ok) { /* the next armed pass will retry another member */ }
          return
        }
      }
      armDigest()
      armHeartbeat()
    }

    // ---- reply parsing -----------------------------------------------------
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
      // L2 option A (user decision): objects for which THIS reply recorded a fidelity defect. The
      // ballot for such an object counts as an abstention (see the verdict branch below). Scoped to
      // one reply on purpose — no cross-round state.
      const defectTargetsThisReply = new Set()
      postmark(member, p)
      // (1) speech  (named `speech`, not `s`: `s` is the session API in this scope)
      const speech = p.say
      if (typeof speech === 'string' && speech.trim()) await say(member.id, { to: 'all', text: speech, kind: 'chat' })
      else if (speech && typeof speech === 'object' && speech.text) {
        const to = String(speech.to || 'all')
        // A "to: voters" broadcast is not a private message: framing it 私信 told the
        // voters they had been singled out when the whole voting body was addressed.
        const kind = to === 'all' ? 'chat' : to === 'voters' ? 'voters' : 'dm'
        await say(member.id, { to, text: String(speech.text), kind })
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
        if (t) {
          const r = await taskUpdate(member.id, { task_id: t.id, expected_revision: t.revision, action: 'claim' })
          // Report a REFUSED claim back to the claimer: silently doing nothing left the
          // member believing it owned a task it does not own (and the notice used to be
          // dropped as a self-message).
          if (r && r.ok === false) await notice(member.id, '认领 ' + t.id + ' 失败（' + (r.code || '') + '）：' + (r.message || ''))
        } else await notice(member.id, '认领失败：没有任务 ' + String(p.task_claim))
      }
      if (p.task_update && typeof p.task_update === 'object') {
        const r = await taskUpdate(member.id, p.task_update)
        if (r && r.ok === false) await notice(member.id, 'task_update 未生效（' + (r.code || '') + '）：' + (r.message || ''))
      }
      if (p.task_done) {
        const t = inst().tasks.find((x) => x.id === String(p.task_done))
        if (t) {
          const r = await taskUpdate(member.id, { task_id: t.id, expected_revision: t.revision, action: 'complete' })
          if (r && r.ok === false) await notice(member.id, '完成任务 ' + t.id + ' 失败（' + (r.code || '') + '）：' + (r.message || ''))
        } else await notice(member.id, '标记完成失败：没有任务 ' + String(p.task_done))
      }
      // (5) verification
      // (4b) Lean formalization signal — the mandatory difficulty judgement. This is the
      // path that matters in practice: a member that never calls a Lean tool still has to
      // say "used / blocked", and `require` mode refuses to conclude without it.
      //
      // `formalOn()` gates it: off mode is a TRUE no-op, and the field is not even offered in the
      // reply contract there, so a stray / stale / hallucinated reply must not create Lean state.
      // (The TOOLS stay usable in off mode on purpose — a tool call is deliberate.)
      // Adv-verify F2 (LOW): `formal` may be an ARRAY of entries (a member recording defects for two
      // objects in one reply). The old code read `p.formal.target` only, so an array was silently
      // ignored — no notice, no enforced abstention, and the same reply's `1` counted (exactly the
      // hole L2 closed). The array form is now SUPPORTED entry by entry; a non-object entry is
      // refused loudly instead of being dropped in silence.
      // NOTE: the gate below keeps its literal two-term shape on purpose — `audit-prompt-invariants`
      // I8 matches that EXACT source text ("off must be a TRUE no-op"), and the first version of this
      // fix (a ternary on `formalOn()`) broke the invariant while behaving identically. The array
      // normalisation therefore lives INSIDE the guarded block, after the gate.
      // (This comment deliberately does NOT spell the pattern out: I8 reads the RAW source, so a
      // comment quoting the gate would satisfy the invariant even with the gate removed — the mutant
      // `M1` in `tests/audit-v5-lean-abstention.mutants.mjs` is what keeps this honest.)
      if (formalOn() && p.formal) {
        const formalEntries = Array.isArray(p.formal) ? p.formal : (typeof p.formal === 'object' ? [p.formal] : [])
        for (const f of formalEntries) {
          if (!f || typeof f !== 'object') {
            await notice(member.id, 'formal 的每个条目都必须是对象（收到 ' + JSON.stringify(f) + '）——本条已忽略。')
            continue
          }
          const target = idSafe(String(f.target || ''))
          if (!target) {
            await notice(member.id, 'formal 条目缺少 target（对象 id）——本条已忽略。')
            continue
          }
          {
            const decision = String(f.decision || '').trim()
          const note = String(f.note || '').trim()
          if (decision === 'blocked' || decision === 'defect') {
            if (!note) await notice(member.id, "formal.decision='" + decision + "' 必须写明 note（难度判断/阻塞原因/具体偏差）——本次未记录。")
            else if (decision === 'defect') {
              const r = await recordFidelityDefect(member.id, target, note)
              if (r.ok === false) await notice(member.id, '记录忠实性缺陷失败（' + (r.code || '') + '）：' + (r.message || ''))
              else {
                // L2 option A (user decision): a reply that RECORDS a fidelity defect for an object
                // must not also assert that object true in the same round. The framework therefore
                // counts THIS member's verdict for THIS object as an ABSTENTION (the verdict branch
                // below reads `defectTargetsThisReply`). Only the declaring member and only this
                // round are affected: no cross-round state, no gate change, other ballots untouched.
                defectTargetsThisReply.add(target)
                // Observable note (the member must not be silently overridden): member notice + a
                // durable marker in the formal record, which `lean_lib`/`report()` surface via `note`.
                await notice(member.id, '框架规则：同一条回复里记录了忠实性缺陷（对象 ' + target + '），'
                  + '你**对该对象的 verdict 已按弃权计入**（不投真也不投假）；缺陷本身照常撤回证明。'
                  + '若你确认命题为假，请在**下一轮**用独立理由投 0。')
              }
            } else {
              const r = await leanArchive(member.id, { kind: 'blocked', target, note })
              if (r.ok === false) await notice(member.id, '记录形式化阻塞失败（' + (r.code || '') + '）：' + (r.message || ''))
            }
          } else if (decision === 'used') {
            const file = String(f.file || ('Formal/' + target + '.lean'))
            const prev = formalOf(target)
            await putFormal(target, Object.assign({}, prev, {
              status: prev.status === 'passed' || prev.status === 'blocked' ? prev.status : 'attempted',
              file, decision: 'used', decisionSource: 'member-reply', note: String(f.note || prev.note || ''), updatedAt: now(),
            }))
            await writeFormalIndex()
          } else if (decision) {
            await notice(member.id, "formal.decision 只能是 'used' / 'blocked' / 'defect'（收到 " + decision + '）')
          }
        }
      }
      }
      if (p.propose_verify) {
        const pv = typeof p.propose_verify === 'string' ? { target: p.propose_verify } : p.propose_verify
        if (pv && pv.target) {
          const r = await maybeQueueVerify(pv.target, pv.kind, member.id, pv.reason)
          if (r && r.ok === false) await notice(member.id, '提议验证 ' + String(pv.target) + ' 未受理（' + (r.code || '') + '）：' + (r.message || ''))
        }
      }
      if (p.verdict && typeof p.verdict === 'object') {
        const declaredRaw = p.verdict.verdict
        const declaredWord = (declaredRaw === undefined || declaredRaw === null) ? '' : String(declaredRaw).trim().toLowerCase()
        const isVerdictWord = (declaredWord === 'abstain' || declaredWord === '弃权' || declaredWord === 'unable' || declaredWord === '无法判断')
        const declared = normVerdictNumber(declaredRaw)
        if (declared === undefined && !isVerdictWord) await notice(member.id, 'verdict 必须是 0-1 的数值，或 abstain（弃权）/ unable（无法判断）；本轮的票未被记录。')
        else {
          const vTarget = idSafe(String(p.verdict.target || ''))
          // L2 option A: the same reply declared a fidelity defect for this object ⇒ this member's
          // ballot counts as an ABSTENTION (0.5) instead of a boolean assertion. A value that is
          // ALREADY a proper abstention stays exactly as sent (no double counting); the durable
          // note is attached to the formal record so the override is visible in the receipt.
          // Adv-verify S7: only an ACTUAL voter has a boolean ballot to abstain from — a temp
          // worker's opinion is relayed, never counted, so it must NOT get an "abstention" marker
          // (that would claim the framework changed a vote that never existed).
          const isVoterHere = voters().some((m) => m.id === member.id)
          const enforced = isVoterHere && defectTargetsThisReply.has(vTarget) && (declared === 0 || declared === 1)
          const n = enforced ? 0.5 : (declared === undefined ? declaredWord : declared)
          if (enforced) {
            try {
              await putFormal(vTarget, (prev0) => {
                const fid = Object.assign({}, (prev0 && prev0.fidelity) || {})
                // Adv-verify F1 (MED): the marker used to be a SINGLE value, so two members
                // recording a defect in the same round overwrote each other and only the last was
                // auditable. It is an ARRAY now (old object-shaped records are folded in), with a
                // matching `abstainedCount`.
                const prevList = Array.isArray(fid.voteAbstainedByFramework)
                  ? fid.voteAbstainedByFramework
                  : (fid.voteAbstainedByFramework ? [fid.voteAbstainedByFramework] : [])
                const list = prevList.concat([{ at: now(), by: member.id, declared }])
                fid.voteAbstainedByFramework = list
                fid.abstainedCount = list.length
                return Object.assign({}, prev0 || { status: 'none' }, {
                  fidelity: fid,
                  note: (String((prev0 && prev0.note) || '') + '；本轮同回复的 verdict=' + declared + ' 已由框架按弃权计入').trim(),
                })
              })
            } catch (e) { /* the vote still counts as an abstention even if the note cannot be stored */ }
          }
          const r = await castVerdict(member.id, vTarget, n, p.verdict.reason)
          if (r && r.ok === false) await notice(member.id, '本轮的票未被记录（' + (r.code || '') + '）：' + (r.message || ''))
        }
      }
      // (6) meetings
      if (p.propose_meeting) {
        const pm = typeof p.propose_meeting === 'string' ? { agenda: p.propose_meeting } : p.propose_meeting
        if (pm && pm.agenda) {
          const r = await startMeeting(member.id, pm)
          if (r && r.ok === false) await notice(member.id, '提议开会未受理（' + (r.code || '') + '）：' + (r.message || ''))
        }
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
          to: 'voters', kind: 'voters',
          text: '【反对分派】我对任务 ' + String(ra.task_id || '(未指明)') + ' 有异议：' + String(ra.why || '(未说明理由)') +
            '。任务仍会执行，但请' + (academicianId() ? '院士与全所' : '全所') + '知悉我的理由。',
        })
      }
      // (10) solve votes / personal judgement
      if (p.vote_solved !== undefined) await recordSolveVote(member.id, p.vote_solved === true)
      // (10b) final-paper channels: the member's own part, a cross-review, or the editor's
      // decision. Each is only honoured in the stage that asked for it (the record functions
      // refuse otherwise), so a stray/stale field can never advance the paper.
      if (p.paper_part && typeof p.paper_part === 'object') await paperRecordPart(member.id, p.paper_part)
      if (p.paper_review && typeof p.paper_review === 'object') await paperRecordReview(member.id, p.paper_review)
      if (p.paper_final && typeof p.paper_final === 'object') await paperRecordFinal(member.id, p.paper_final)
      // (11) meeting input collection. **三个位置互不继承**（2.9.0）：
      //   · 发言位 `inputs`/`speeches` —— 真的说了话（可多次：举手再发言）
      //   · 机会位 `asked`/`silent`/`unreached` —— "要不要发言"的机会与结果（沉默**不是票**、也不阻塞收束）
      //   · 票位 `solve` —— 只由上面的 (10) `recordSolveVote` 写；这里**绝不写票**。
      if (kind === 'meeting' && meeting) {
        const text = (typeof p.input === 'string' && p.input.trim())
          ? p.input
          : (typeof p.say === 'string' && p.say.trim() ? p.say : (typeof p.summary === 'string' ? p.summary : ''))
        // ① 举手：任意阶段有效、**含已发言者**（"举手再发言"可多轮）；`meeting_hand:false` 撤回。
        // `pendingHand` = 本次回复**之前**就已经举着手（那是一次"待交付的发言请求"）。若本回复既交付发言
        // 又重新举手，新举的手必须**保留**——否则"发言后再举手"会被自己的交付清掉（守卫 A4/A6 抓到的缺陷）。
        const pendingHand = !!meeting.hands[member.id]
        if (p.meeting_hand === true) {
          if (!meeting.hands[member.id]) {
            meeting.hands[member.id] = now()
            meeting.history.push({ at: now(), id: member.id, what: 'hand' })
            if (!text) await saveChatLine('【会议 ' + meeting.id + '】' + member.id + ' 举手请求发言（可多轮）。')
          }
        } else if (p.meeting_hand === false && meeting.hands[member.id]) {
          delete meeting.hands[member.id]
          meeting.history.push({ at: now(), id: member.id, what: 'hand-withdrawn' })
        }
        // S8（R3/K12/B9）：**表决期禁止发言** —— 会议唤醒里的**发言交付**（`input`/`say`/`summary`）在
        // 冻结期**不接受**：不写 `inputs`/`speeches`、不进纪要、**不消费已举的手**（举手**保留**，解冻后
        // 按原顺序放行）；**票仍然照记**（上面的 `recordSolveVote` 已写）⇒ 票与发言**互不折算**。
        // 院士/所办不受限（chair-first）；系统消息（本条通知）也不受禁言影响。
        const frozenSpeech = speechFrozen().frozen && !!text
          && !(member.kind === 'academician' || isOffice(member.id))
        if (frozenSpeech) {
          meeting.history.push({ at: now(), id: member.id, what: 'speech-refused-frozen', ballotId: speechFrozen().ballotId })
          await saveChatLine('【会议 ' + meeting.id + '】' + member.id + ' 在**表决期**提交发言 ⇒ **被拒**（R3/K12/B9：表决期间禁止发言）。'
            + '举手**保留**；先由院士收束表决（vibe_v5_poll_close）或结束会议再讨论。')
        }
        if (text && !frozenSpeech) {
          // ② 交付发言：只在"这次交付是在还上一次举手"时清除举手；不交付/撤回都不清。按次数累积发言。
          if (pendingHand) delete meeting.hands[member.id]
          if (!Array.isArray(meeting.speeches[member.id])) meeting.speeches[member.id] = []
          meeting.speeches[member.id].push(text)
          meeting.spokeCount[member.id] = (Number(meeting.spokeCount[member.id]) || 0) + 1
          meeting.inputs[member.id] = text
          meeting.extras[member.id] = p
          meeting.lastInputAt = now()
          const n = meeting.spokeCount[member.id]
          // APPEND to the transcript (never clobber it): the file is a human artifact and
          // must stay readable even if the process dies in the middle of a meeting.
          const rel = 'Shared/Meetings/' + meeting.id + '.md'
          const prev = (await readTextRel(rel)) || ('# 会议纪要｜' + meeting.id + '\n\n')
          await writeTextRel(rel, prev + '### ' + member.id + (n > 1 ? '（第 ' + n + ' 次发言）' : '') + '\n' + text + '\n\n')
        } else if (!frozenSpeech && meeting.asked[member.id] !== undefined
          && meeting.inputs[member.id] === undefined && meeting.silent[member.id] === undefined
          && meeting.unreached[member.id] === undefined && !meeting.hands[member.id]) {
          // ③ 已获机会、这一轮没有发言 ⇒ 记"选择不发言"。**与阶段无关**（第一阶段的机会可能在同一轮里
          //    就全部发放完毕，此时 phase 已是 open-floor）。只写 silent 集合——不写 inputs、更不写票。
          meeting.silent[member.id] = now()
          meeting.history.push({ at: now(), id: member.id, what: 'silent' })
        }
        // ④ 邀请临时工发言：结构化字段 `meeting_invite:{member,why}`（只进纪要＋广播；不计票、不阻塞收束）。
        if (p.meeting_invite && typeof p.meeting_invite === 'object') await meetingInvite(member.id, p.meeting_invite)
      } else if (lastMeetingId && typeof p.input === 'string' && p.input.trim()) {
        // real1004-minutes: no live meeting, yet the member submitted a speech (a real host showed exactly
        // this: `input` kept arriving after the meeting had been closed/abandoned). It used to be dropped
        // SILENTLY — the minutes then declared a speaking order that never appeared in the file (`- 发言顺序:
        // r-1 → acad` with only `### r-1` present). Append it as a clearly marked late note instead, keyed on
        // ANY wake (not only meeting wakes: the observed submissions arrived on later rounds), de-duplicated by
        // text so repeated submissions do not pile up.
        const late = String(p.input).trim()
        const rel = 'Shared/Meetings/' + lastMeetingId + '.md'
        const prev = (await readTextRel(rel)) || ('# 会议纪要｜' + lastMeetingId + '\n\n')
        if (prev.indexOf(late) === -1) {
          await writeTextRel(rel, prev + '### ' + member.id + '（会后补记：该发言到达时会议已收束）\n' + late + '\n\n')
          await saveChatLine('【会议 ' + lastMeetingId + '】' + member.id + ' 的发言在会议收束后到达，已作为补记写入纪要（不再静默丢弃）。')
        }
      }
      if (p.solved !== undefined) {
        await writeTextRel('Shared/State-of-institute.md', [
          '# 研究所判断快照｜' + instituteName,
          '- 时间: ' + fmtTime(),
          '- 记录者: ' + member.id,
          '- 该成员认为原问题已解决: ' + (p.solved === true),
          '- 有表决权的解决票: ' + (solveVotesList().join('、') || '（无）'),
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
      await ready()
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
        console.error('vibe-math-v5r: reply dispatch for ' + member.id + ': ' + String((e && e.stack) || e))
      }
      try { await maybeRealCompact(childId, member) } catch (e) { /* compaction is best-effort */ }
      wakeKind.delete(member.id)
      if (member.activeMeetingId) delete member.activeMeetingId
      // The final-paper phase is driven by member turns, exactly like a meeting: the reply was
      // just folded, so advance the paper BEFORE asking the (possibly inert) scheduler.
      try { await paperPass() } catch (e) { console.error('vibe-math-v5r: paper after end: ' + String((e && e.message) || e)) }
      await scheduleNext()
    }
    // ---- toolFilter names the host may not register -------------------------
    // Same guard as v2/v3/v4: `tools.restrict` throws for an unregistered name and the throw escapes
    // child creation, so a stale `vibe_v5_set{toolAllow|toolDeny|tempToolAllow|tempToolDeny}` would
    // make every member spawn fail silently. The host names the registered tools in its rejection.
    async function startWithToolFilter(toolFilter, makeSpec){
      try {
        return await subagents.startContinuable(makeSpec(toolFilter))
      } catch(e){
        const message = String((e && e.message) || e)
        const retry = sanitizeToolFilter(toolFilter, registeredToolsFromError(message))
        if(retry===undefined){
          console.error('vibe-math-v5r: 配置的工具过滤只包含本宿主未注册的工具名，拒绝在不带过滤的情况下启动成员。filter=' + JSON.stringify(toolFilter) + ' 宿主提示：' + message)
          throw e
        }
        if(JSON.stringify(retry) === JSON.stringify(toolFilter)) throw e
        console.error('vibe-math-v5r: 工具过滤里有本宿主未注册的名字，已只保留已注册的名字重试。dropped=' + JSON.stringify(toolFilter) + ' kept=' + JSON.stringify(retry))
        // a FRESH spec (and a fresh timeout signal) for the retry
        return await subagents.startContinuable(makeSpec(retry))
      }
    }

    async function maybeRealCompact(childId, member) {
      const roundN = roundsSinceCompact.get(member.id) || 0
      const pct = contextPct.get(member.id) || 0
      const soft = pct >= Number(params.compactThreshold) || roundN >= Number(params.compactAfterRounds)
      if (!soft) return
      const agent = liveAgentOf(childId)
      const comp = compactionForAgent(agent)
      if (comp && agent && agent.session) {
        // Prefer the FORCING verb when the host has it: `compactIfNeeded` is a policy call that may
        // decide not to compact and return null without saying so, while `compactNow` does what the
        // operator asked for. Feature-detected so older hosts keep the policy call.
        const force = typeof comp.compactNow === 'function'
        const ask = typeof comp.compactIfNeeded === 'function'
        if (force || ask) {
          try {
            const r = force ? await comp.compactNow(agent, makeSignal(params.activityTimeoutMs)) : await comp.compactIfNeeded(agent, 'pressure', makeSignal(params.activityTimeoutMs))
            if (r) { roundsSinceCompact.set(member.id, 0); needReanchor.add(member.id); return }
          } catch (e) { /* fall through to the soft path */ }
        }
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
    function normalizeParams(input, dropped) {
      const out = {}
      // NOTE: new INT params go BEFORE the last two entries. The cross-preset
      // prompt-invariants self-probe mutates the exact TAIL of this array (dropping
      // leanTimeoutMs from the accept-set), so appending a key after it would silently
      // disarm that guard.
      const ints = ['leanJobsMaxParallel', 'mathTimeoutMs', 'researcherCount', 'quorumCap', 'reconsiderFloor', 'quotesPerMessageMax', 'quoteDepthMax', 'verdictMaxRounds', 'maxTempPerMember', 'maxTempTotal',
        'compactThreshold', 'compactAfterRounds', 'maxParallel', 'activityTimeoutMs', 'stallAutoMeetingMs',
        'meetingHardLimitMs', 'meetingWakeRetries',
        'chatDigestMs', 'chatDigestMax', 'meetingKeepEvery', 'leanTimeoutMs']
      const bools = ['academician', 'academicianLeads', 'memberMayRejectAssign', 'finalPaper', 'paperCompilePdf', 'leanAsync']
      const strs = ['feedback', 'quorumMode', 'provider', 'model', 'staffPersona', 'formalVerify', 'leanCommand',
        'paperFormat', 'paperLanguage', 'paperEditor', 'paperLatexCommand', 'leanInitiative',
        'mathComputation', 'mathMode', 'mathInstallScope']
      const arrs = ['toolAllow', 'toolDeny', 'tempToolAllow', 'tempToolDeny', 'leanArgs', 'leanSearchPaths',
        'mathEngines', 'mathPackages']
      for (const k of ints) if (input[k] !== undefined) { const n = Math.floor(Number(input[k])); if (Number.isFinite(n)) out[k] = n }
      // Explicit boolean coercion (docs/final-paper.md §2): the old `=== true || === 'true'` turned a
      // legitimate `1` / `'yes'` into FALSE and left junk values truthy-looking. An
      // unrecognised spelling is REJECTED (the default wins) rather than guessed.
      for (const k of bools) if (input[k] !== undefined) out[k] = coerceBool(input[k], false)
      for (const k of strs) if (input[k] !== undefined) out[k] = String(input[k])
      for (const k of arrs) {
        if (input[k] === undefined) continue
        const v = input[k]
        out[k] = Array.isArray(v) ? v.map(String).filter((x) => x.trim()) : String(v).split(',').map((x) => x.trim()).filter(Boolean)
      }
      if (out.quorumMode !== undefined && out.quorumMode !== 'm-unanimous' && out.quorumMode !== 'all-unanimous') out.quorumMode = 'm-unanimous'
      // An unknown Lean mode must degrade to 'off' (the no-op), never to a stronger mode:
      // a typo silently forcing formal verification would block every conclusion.
      if (out.formalVerify !== undefined) {
        out.formalVerify = ['off', 'encourage', 'require'].indexOf(out.formalVerify) !== -1 ? out.formalVerify : 'off'
      }
      if (out.leanCommand !== undefined && !String(out.leanCommand).trim()) out.leanCommand = 'lean'
      // `leanAsync` gets an EXPLICIT branch (not just the shared bool loop): the mode must be
      // selected only by a real boolean (or the documented spellings) and an unknown value must
      // keep the DEFAULT (true) — and the string 'false' must never survive as truthy.
      if (input.leanAsync !== undefined) {
        out.leanAsync = (input.leanAsync === true || input.leanAsync === false)
          ? input.leanAsync
          : coerceBool(input.leanAsync, DEFAULT_PARAMS.leanAsync)
      }
      // `leanInitiative` is a CLOSED enum (like quorumMode/formalVerify): a typo degrades to the
      // documented default ('normal') rather than becoming an unreachable fourth mode.
      if (out.leanInitiative !== undefined) {
        out.leanInitiative = ['off', 'normal', 'eager'].indexOf(String(out.leanInitiative)) !== -1 ? String(out.leanInitiative) : 'normal'
      }
      // `feedback` is a CLOSED enum too: a typo must keep the documented default ('on') rather than
      // becoming an unreachable third mode that silently disables the recording hint.
      if (out.feedback !== undefined) {
        out.feedback = ['on', 'off'].indexOf(String(out.feedback).trim()) !== -1 ? String(out.feedback).trim() : 'on'
      }
      // Concurrency floor, same discipline as quorumCap/verdictMaxRounds.
      if (out.leanJobsMaxParallel !== undefined && out.leanJobsMaxParallel < 1) out.leanJobsMaxParallel = 1
      // The six math_computation keys are normalised by the SHARED module (one implementation
      // for all four presets — docs/math-computation.md): explicit enum/array/integer coercion,
      // so a string 'false', an unknown engine name or a sub-1000 timeout can never leak
      // through. ONLY the keys the caller actually passed are copied, so a partial update can
      // never reset the others back to their defaults.
      if (MATH_PARAM_NAMES.some((k) => input[k] !== undefined)) {
        for (const k of MATH_PARAM_NAMES) {
          if (input[k] === undefined) continue
          // The typed loops above already coerced the SHAPE (a comma string became an array, an
          // integer was floored); the module then applies the semantic rules (closed enums, known
          // engines, >=1000 timeout). A value the module rejects falls back to its own default.
          const src = out[k] !== undefined ? out[k] : input[k]
          const norm = normalizeMathParams({ [k]: src })
          const v = norm[k] !== undefined ? norm[k] : MATH_PARAM_DEFAULTS[k]
          out[k] = Array.isArray(v) ? v.slice() : v
        }
      }
      // ── final-paper enums (closed sets; an unknown value degrades to the documented
      // default instead of silently becoming an unreachable fourth mode) ────────────────
      if (out.paperFormat !== undefined) out.paperFormat = coercePaperEnum('paperFormat', out.paperFormat, ['both', 'md', 'tex'], 'both')
      if (out.paperLanguage !== undefined) out.paperLanguage = coercePaperEnum('paperLanguage', out.paperLanguage, ['zh', 'en'], 'zh')
      if (out.paperEditor !== undefined) out.paperEditor = coercePaperEnum('paperEditor', out.paperEditor, ['office', 'academician'], 'academician')
      if (out.paperLatexCommand !== undefined) out.paperLatexCommand = String(out.paperLatexCommand).trim()
      // Guard every duration against a negative/NaN value: such a value would make a
      // watchdog fire instantly and abandon all consensus (v4 §30-T41).
      for (const k of ['activityTimeoutMs', 'chatDigestMs', 'leanTimeoutMs']) {
        if (out[k] !== undefined && !(out[k] > 0)) delete out[k]
      }
      // S5 (D10 可调政策)：`stallAutoMeetingMs` 是**唯一**允许负值的时长 —— 负值＝**关闭静止提示**。
      // 它刻意不放进上面的"非正即删"守卫：否则"负值＝关闭"这个开关**永远设不进去**（静默忽略，
      // 用户以为关了其实还在提示）。0 仍＝默认值（`posMs(0)` 落默认），NaN／非数字仍被丢弃。
      if (out.stallAutoMeetingMs !== undefined && !Number.isFinite(Number(out.stallAutoMeetingMs))) delete out.stallAutoMeetingMs
      // 2.9.0: 会议硬界与唤醒重试都是**有界**参数（不提供无界）——越界即钳制。
      if (out.meetingHardLimitMs !== undefined) out.meetingHardLimitMs = Math.min(7200000, Math.max(300000, Math.floor(out.meetingHardLimitMs)))
      if (out.meetingWakeRetries !== undefined) out.meetingWakeRetries = Math.min(10, Math.max(0, Math.floor(out.meetingWakeRetries)))
      if (out.leanTimeoutMs !== undefined) out.leanTimeoutMs = Math.max(1000, out.leanTimeoutMs)
      if (out.researcherCount !== undefined && out.researcherCount < 0) out.researcherCount = 0
      if (out.quorumCap !== undefined && out.quorumCap < 1) out.quorumCap = 1
      // S9/U3：复议门槛的**下限**不得为负（负值等于"降门槛"，直接违反"只升不降"）。
      if (out.reconsiderFloor !== undefined && out.reconsiderFloor < 0) out.reconsiderFloor = 0
      // S10/D6：引用条数与深度上限的下限是 1（0/负值等于"禁止一切引用"或"无限深"，都不是可用的政策）。
      if (out.quotesPerMessageMax !== undefined && out.quotesPerMessageMax < 1) out.quotesPerMessageMax = 1
      if (out.quoteDepthMax !== undefined && out.quoteDepthMax < 1) out.quoteDepthMax = 1
      // NOT every non-positive number is harmless (audit L3). `compactThreshold <= 0` makes
      // EVERY round look over the threshold (a permanent compaction directive), so it falls back
      // to the default like a bad duration; `chatDigestMax < 1` would empty the digest bucket and
      // `verdictMaxRounds < 1` silently collapsed every debate to a single round, so both floor
      // at the smallest value that still means what the name says.
      if (out.compactThreshold !== undefined && !(out.compactThreshold > 0)) delete out.compactThreshold
      if (out.chatDigestMax !== undefined && out.chatDigestMax < 1) out.chatDigestMax = 1
      if (out.verdictMaxRounds !== undefined && out.verdictMaxRounds < 1) out.verdictMaxRounds = 1
      // round-4 item 2: an unknown key used to vanish with NO report (hand-edited state files).
      // Never lose information silently: collect the accepted-key set's complement and hand it to
      // the caller's collector (the restore/set sites turn it into a diagnostic + a warning).
      if (dropped) {
        const known = new Set(ints.concat(bools, strs, arrs))
        for (const k of Object.keys(input || {})) if (!known.has(k)) dropped.push(k)
      }
      return out
    }
    // round-4 item 2: report keys a state file (or a caller) carried but the whitelist rejected.
    // `stateObj` is the state the drop belongs to (the load site has it in hand); falls back to the
    // live institute. Deduplicated so a repeated sync cannot spam the diagnostics.
    function reportDroppedStateKeys(stateObj, dropped, where) {
      const keys = Array.isArray(dropped) ? dropped.slice().sort() : []
      if (!keys.length) return keys
      const target = (stateObj && Array.isArray(stateObj.diagnostics)) ? stateObj : (inst() || null)
      if (target && Array.isArray(target.diagnostics)) {
        const last = target.diagnostics[target.diagnostics.length - 1]
        const duplicate = !!(last && last.kind === 'state-dropped-keys' && JSON.stringify(last.keys) === JSON.stringify(keys))
        // round-4 item 4: only a NEWLY recorded entry warns, and the record goes through the same
        // retention as every other diagnostics writer in this preset (slice(-50)).
        if (duplicate) return keys
        // F1 (status/report review): the entry carries the SAME field names as every other
        // diagnostics record (`at`/`type`/`error`) plus its own `kind`/`where`/`keys`. It used to be
        // `{kind, where, keys}` only, so `report()` printed `undefined｜undefined` for a record it
        // was supposed to explain.
        target.diagnostics.push({
          at: now(), type: 'vibe5/dropped-keys',
          error: '忽略未知参数键（未写入状态）：' + keys.join(', ') + '（来源：' + where + '）',
          kind: 'state-dropped-keys', where: where, keys: keys,
        })
        while (target.diagnostics.length > 50) target.diagnostics.shift()
      }
      console.warn('vibe-math-v5r: 忽略未知参数键（不静默丢失，已记入 diagnostics）：' + keys.join(', ') + '（来源：' + where + '）')
      return keys
    }
    async function setParams(input) {
      const droppedSet = []
      const patch = normalizeParams(input || {}, droppedSet)
      // task-26 (real-host R2): an out-of-range value is coerced by normalizeParams (documented) and an unknown
      // key is dropped into `droppedSet` (recorded in diagnostics) — but the RESPONSE carried neither, so the
      // caller could not tell "changed" from "ignored" without a second `status` read. Report both, additively.
      const adjusted = {}
      for (const k of Object.keys(patch)) {
        const raw = (input || {})[k]
        if (raw === undefined) continue
        const before = Array.isArray(raw) ? raw.join(',') : String(raw)
        const after = Array.isArray(patch[k]) ? patch[k].join(',') : String(patch[k])
        if (before !== after) adjusted[k] = { from: raw, to: patch[k] }
      }
      reportDroppedStateKeys(inst(), droppedSet, 'set')
      const merged = Object.assign({}, params, patch)
      await patchInstitute({ params: merged })
      params = Object.assign({}, DEFAULT_PARAMS, merged)
      // The math availability line is MODE-DEPENDENT (mathComputation/mathMode/mathEngines), so
      // a tuning call must re-derive it immediately instead of leaving a stale line in prompts.
      if (MATH_PARAM_NAMES.some((k) => patch[k] !== undefined)) await refreshMathLine()
      // An already-armed heartbeat keeps the delay it was armed with, so a lowered
      // activityTimeoutMs (or a raised maxParallel) would not take effect until some
      // unrelated event drove a pass. Tuning must apply immediately.
      if (running && !autoDone) await scheduleNext()
      return { ok: true, params: visibleParams(), adjusted, dropped: droppedSet.slice() }
    }
    function visibleParams() {
      return {
        academician: params.academician, academicianLeads: params.academicianLeads,
        memberMayRejectAssign: params.memberMayRejectAssign,
        researcherCount: params.researcherCount,
        quorumCap: params.quorumCap, quorumMode: params.quorumMode,
        m: quorumView().m, voterCount: voterCount(), started: voterCount() > 0,
        verdictMaxRounds: params.verdictMaxRounds,
        maxTempPerMember: params.maxTempPerMember, maxTempTotal: params.maxTempTotal,
        compactThreshold: params.compactThreshold, compactAfterRounds: params.compactAfterRounds,
        maxParallel: params.maxParallel, activityTimeoutMs: params.activityTimeoutMs,
        stallAutoMeetingMs: params.stallAutoMeetingMs, chatDigestMs: params.chatDigestMs,
        // 会议两阶段（2.9.0）：硬界是唯一兜底；唤醒重试决定何时记 `unreached`。
        meetingHardLimitMs: params.meetingHardLimitMs, meetingWakeRetries: params.meetingWakeRetries,
        chatDigestMax: params.chatDigestMax, meetingKeepEvery: params.meetingKeepEvery,
        formalVerify: params.formalVerify, leanCommand: params.leanCommand,
        leanArgs: params.leanArgs, leanTimeoutMs: params.leanTimeoutMs,
        leanAsync: params.leanAsync, leanInitiative: params.leanInitiative,
        leanSearchPaths: params.leanSearchPaths, leanJobsMaxParallel: params.leanJobsMaxParallel,
        // `visibleParams` is an EXPLICIT object (landing.md §3): a new key is invisible to
        // `/v5 status` until it is added here.
        mathComputation: params.mathComputation, mathMode: params.mathMode,
        mathEngines: (params.mathEngines || []).slice(), mathTimeoutMs: params.mathTimeoutMs,
        mathPackages: (params.mathPackages || []).slice(), mathInstallScope: params.mathInstallScope,
        // 'on' | 'off' — methodology/collaboration feedback (Shared/Feedback/).
        feedback: params.feedback,
        // ── final paper ──────────────────────────────────────────────────────
        finalPaper: params.finalPaper, paperFormat: params.paperFormat,
        paperLanguage: params.paperLanguage, paperCompilePdf: params.paperCompilePdf,
        paperEditor: params.paperEditor, paperLatexCommand: params.paperLatexCommand,
        provider: params.provider, model: params.model,
        toolAllow: params.toolAllow, toolDeny: params.toolDeny,
      }
    }
    async function configure(args) {
      const a = args || {}
      // READ THE FILE FOR THE PATH THIS SESSION WAS ALREADY POINTED AT BEFORE ANY WORK.
      // configure ends in a whole-snapshot commit; without this load the commit is exactly
      // the write that destroyed a previously-run institute's state file (audit H1: the
      // session's first tool call — typically `vibe_v5_status` — latched the DEFAULT path,
      // after which `configure {institute:'alpha'}` never read alpha's file).
      await ready()
      // configure is the PRE-START setup tool. Switching project/institute while a run
      // is live would split its state across two trees: the members' libraries and
      // briefs point at the OLD root while every later write goes to the NEW one.
      if (running && !autoDone) {
        return { ok: false, code: 'V5_INSTITUTE_STATE', message: 'cannot reconfigure while the institute is running (pause/stop first; use vibe_v5_set to tune params)' }
      }
      const patch = {}
      let identitySwitched = false
      if (a.project !== undefined && String(a.project).trim()) patch.project = String(a.project).trim()
      if (a.institute !== undefined && String(a.institute).trim()) patch.institute = String(a.institute).trim()
      if (a.problem !== undefined) patch.problem = { id: slugify(String(a.problem).slice(0, 40)) || 'problem', statement: String(a.problem) }
      if (a.params && typeof a.params === 'object') patch.params = Object.assign({}, params, normalizeParams(a.params))
      // C1 (deep-review 4): a configure with NOTHING to apply used to still commit
      // `patch.phase = 'idle'` below — a no-arg `/v5 configure` silently regressed a CONCLUDED
      // institute (`report()` then showed 已结题 false). A no-op configure is now a true no-op:
      // no commit, no phase change, and the answer says exactly that + the usage.
      if (patch.project === undefined && patch.institute === undefined && patch.problem === undefined && patch.params === undefined) {
        return {
          ok: true, noop: true, project, institute: instituteName,
          phase: String(inst().phase || phase),
          note: 'configure 没有收到任何参数：未改动任何状态（当前研究所 ' + instituteName + '，phase=' + String(inst().phase || phase) + '）。'
            + '用法：/v5 configure <研究所名> <问题…>（可在同一行里带 problem；切换研究所名会用一个新的所）。',
        }
      }
      if (patch.project !== undefined || patch.institute !== undefined) {
        const np = patch.project !== undefined ? patch.project : project
        const ni = patch.institute !== undefined ? patch.institute : instituteName
        const nkey = np + '::' + ni
        if (nkey !== key) {
          // The requested key lives in a DIFFERENT state file. Read that file first: a
          // previously-run institute must be adopted, never overwritten with an empty one.
          const stored = await instituteAt(np, ni, nkey)
          if (stored && Array.isArray(stored.members) && stored.members.length) {
            key = nkey
            project = np
            instituteName = ni
            patch.project = np
            patch.institute = ni
            identitySwitched = true
          } else if (!inst().members.length) {
            key = nkey
            project = np
            instituteName = ni
            patch.project = np
            patch.institute = ni
            identitySwitched = true
          } else {
            return { ok: false, code: 'V5_INSTITUTE_STATE', message: 'this session already holds an institute; use a new session to found another' }
          }
        }
      }
      // F5 (status/report review, S1 class): `phase='idle'` belongs to FOUNDING THE SETUP, not to
      // every configure. A partial configure (`problem`-only / `params`-only / institute-only with
      // the SAME name) may still apply its patch, but it must never rewrite the phase of an
      // institute that already has a life of its own — that is what made a concluded institute read
      // "阶段：idle｜已结题：false". The phase is reset only when this call is actually (re)founding:
      // a REAL identity switch (`nkey !== key`), or a session that holds no institute yet.
      // (`institute-only` with an unchanged name is therefore also a no-phase-change: `patch.institute`
      // being present is not the same as the identity having moved.)
      const holdsInstitute = inst().members.length > 0 || String(inst().phase || '') !== 'idle'
      if (identitySwitched || !holdsInstitute) patch.phase = 'idle'
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
      await writeStateReadme()
      return {
        ok: true, project, institute: instituteName,
        problem: inst().problem.statement ? inst().problem.statement.slice(0, 80) : '',
        params: visibleParams(),
        note: '现在可以 vibe_v5_start 开工',
      }
    }
    // State/ holds only human-readable mirrors. Say so IN the directory, so a user who
    // finds State/<institute>.v5state.json (the degraded fallback) or the mirror files
    // does not mistake them for the authoritative state and hand-edit them.
    async function writeStateReadme() {
      await writeTextRel('State/README.md', [
        '# 关于 State/',
        '',
        '本研究所的**权威状态就在本目录的 `<研究所>.v5state.json` 里**，不在任何宿主会话日志里。',
        '本目录只存放人可读的镜像/说明，**请勿手改**；改动不会影响真正的状态。',
        '要查看状态请用 `vibe_v5_status` / `vibe_v5_report`。',
        '',
        '研究所状态只写在加固 JSON 里（见下），不写入宿主会话日志：',
        '`State/<institute>.v5state.json`（加固 JSON 后端），此时它才是权威源。',
        '安装器会在启动自检里报告这一降级。',
        '',
      ].join('\n'))
    }
    async function doStart(args) {
      const a = args || {}
      if (running && !autoDone) return { ok: false, code: 'V5_INSTITUTE_STATE', message: 'already running' }
      // S1 (repro `_oneoff/s1-solved-reload.mjs`): the concluded state is durable (`phase:'solved'`
      // in the state file), so the guard checks the PERSISTED phase as well as the in-memory flag.
      // The refusal names the concrete next step instead of only the code.
      if (autoDone || String(phase) === 'solved') {
        return {
          ok: false, code: 'V5_INSTITUTE_STATE',
          message: '本所已结题（状态文件里的 phase = solved，runId = ' + String(inst().runId || '') + '），不能再 start：'
            + '结题运行的结论/论文/成员都已归档在这个所里。要继续工作请二选一 —— ①在新会话里 `/v5 configure <新研究所名> <问题>` 再 `/v5 start`（推荐）；'
            + '②同一会话里也要先 `/v5 configure <新研究所名> <问题>`（本所已有成员，故 configure 只接受切换到一个**新的**研究所名）。',
        }
      }
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
      await writeStateReadme()
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
      // A refused provisioning (the host's live-child cap) is remembered for this founding round so
      // the aggregate failure below can NAME the cap instead of blaming the provider.
      let limitRefused = false
      beginSpawnRound()   // the whole founding loop is ONE round for the cap notice
      // The academician is founded FIRST so it is on the roster for every later member's
      // induction brief, and so it can begin overseeing the founding round. Each member
      // is committed to the ACTIVE roster before its own brief is built (see
      // spawnMember), so every founding brief describes a roster that includes its
      // reader.
      if (params.academician) {
        const m = await newMember('academician', { direction: '统领全所：统筹全局、拆解并分派工作、设定优先级、督导进度。' })
        try {
          await spawnMember(m, '你是本所的院士。请先独立研判这个问题：它的关键困难在哪？应当拆成哪几块工作？'
            + '你打算如何组织全所（谁适合做什么、先做什么）？把你的判断写进你的 Progress/，并把关键结论在群聊里说出来。')
          spawned.push(m.id)
        } catch (e) {
          if (isActivationLimitReached(e)) limitRefused = true
          // G-6b (installer follow-up): the founding catch RE-writes the record that `spawnMember`'s
          // own catch already wrote — it must not drop the durable cap marker, otherwise the queue
          // would depend on matching the error TEXT for this path (the exact divergence the shared
          // predicate exists to prevent).
          await putMember(Object.assign({}, memberById(m.id) || m, { phase: 'failed', error: String((e && e.message) || e), failReason: isActivationLimitReached(e) ? 'activation-limit' : 'other' }))
        }
      }
      for (let i = 0; i < params.researcherCount; i++) {
        const dir = seeds[i] || DEFAULT_DIRS[i % DEFAULT_DIRS.length]
        const m = await newMember('researcher', { direction: dir })
        try {
          await spawnMember(m, null)
          spawned.push(m.id)
        } catch (e) {
          if (isActivationLimitReached(e)) limitRefused = true
          await putMember(Object.assign({}, memberById(m.id) || m, { phase: 'failed', error: String((e && e.message) || e), failReason: isActivationLimitReached(e) ? 'activation-limit' : 'other' }))
        }
      }
      if (!spawned.length) {
        await patchInstitute({ phase: 'idle' })
        // When the HOST's per-root child cap refused every member, say so: the generic
        // "check the provider" message made a real host ceiling look like a broken host.
        if (limitRefused) {
          return { ok: false, code: 'ACTIVATION_LIMIT_REACHED',
            message: '没有任何成员创建成功：' + activationLimitText(hostChildLimit) }
        }
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
      // Members the host's live-child cap refused are NOT dead: they are still wanted, and a slot
      // may have been released since (a temp was fired, another child settled). They are the
      // "queued" half of the cap handling, retried in this round — gated on the RECORDED cap error
      // so an ordinary failed member (broken provider, rejected tool filter) is never resurrected
      // by a resume. `members` keeps its meaning for the return value below.
      const queued = inst().members.filter((m) => isCapRefusedMember(m))
      if (!members.length && !queued.length) return { ok: false, code: 'V5_INSTITUTE_STATE', message: 'no active member to resume' }
      let respawned = 0
      beginSpawnRound()   // the whole re-spawn loop is ONE round for the cap notice
      for (const m of members.concat(queued)) {
        if (m.childId) continue
        try {
          const seedText = (await readTextRel('Members/' + m.id + '/Progress/progress.md')) || ''
          // `mode='resume'` is what makes this a RESUME rather than an instruction: the prompt
          // prints the seed as "恢复说明" (your own log, restored), not as a task to execute.
          await spawnMember(m, seedText ? seedText.slice(-4000) : '（你的 Progress/ 还是空的——请先把当前状态补写进去。）', 'resume')
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
      // The mirrors must be refreshed on THIS path too (audit M9): resume is the one place
      // where members' phase/rounds/employer actually change under them, and a staffing table
      // that contradicts the authoritative roster is the opposite of a mirror's purpose.
      await writeRosterMirror()
      await writeTaskboardMirror()
      await saveChatLine('【恢复】研究所继续推进（重建成员 ' + respawned + ' 名）。')
      notifyActivity()
      await scheduleNext()
      // An interrupted FINAL PAPER resumes its own stage (the paper phase runs before the
      // completion flags, so a crash there leaves a live, resumable institute).
      if (paperActive()) { try { await paperPass() } catch (e) { console.error('vibe-math-v5r: paper after resume: ' + String((e && e.message) || e)) } }
      // Leftover Lean jobs are re-driven (or explicitly interrupted) on the resume path too.
      try { await recoverLeanJobs() } catch (e) { /* already reported on the ready() path */ }
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
      // HIGH 3: a NEW solve question starts with an empty DURABLE tally (a clear has to be
      // persisted too, otherwise a reload would resurrect the previous question's answers).
      await putSolve({ clear: true })
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
        // L4 (deep-review 5): the `【形式化结果】` announcements are delivered ONCE, to the job's
        // initiator, and live in memory. F2 (status/report review): the field is therefore labelled
        // as SESSION-scoped, because after a restart it is empty although the durable per-job
        // records in Formal/Jobs/<jobId>.json are still there.
        leanNotices: leanNotices.map((n) => ({ member: n.member, jobId: n.jobId, line: n.line })),
        leanNoticesScope: 'session-memory（重启后为空；耐久事实在 Formal/Jobs/<jobId>.json 与 vibe_v5_lean_job）',
        // F2/F3 (status/report review): one place that names the SESSION-scoped fields inside this
        // payload, so a reader (or an operator comparing two sessions) cannot mistake them for
        // durable state. Durable = derived from the state file; session = rebuilt on load.
        fieldScopes: {
          session: ['running', 'autoDone(session mirror of phase)', 'leanNotices', 'debug', 'members[].rounds', 'members[].busy', 'members[].contextPct', 'members[].childId', 'meeting', 'parkedMeeting', 'persistence.writeFailures', 'persistence.prematureReads', 'persistence.loadProblem', 'pendingSpawns[].attempts', 'diagnostics', 'backend'],
          durable: ['phase', 'runId', 'quorum', 'members[] (except the three session fields)', 'members[].failReason', 'tasks', 'failedMembers', 'pendingSpawns[] (derived from durable failed members)', 'chat', 'officeRequests', 'verify', 'verifyQueue', 'verified', 'verifiedTrue (derived from verdicts)', 'concludedFalse (derived from verdicts)', 'undecided (derived from verdicts)', 'verdicts', 'solve', 'solveVotes', 'formal', 'paper', 'lastProgressAt', 'params'],
        },
        backend: backend ? backend.kind : 'uninitialized',
        // Skipped/malformed events AND state-file load problems. Without this the two
        // failure modes that silently drop state were invisible in the operator's view.
        diagnostics: s.diagnostics || [],
        debug: Object.assign({ scheduling, reschedule }, dbg),
        quorum: quorumView(),
        members: s.members.map((m) => ({
          id: m.id, kind: m.kind, phase: m.phase, direction: m.direction, hiredBy: m.hiredBy,
          rounds: rounds.get(m.id) || 0, busy: busy.has(m.id), contextPct: contextPct.get(m.id) || 0,
          childId: m.childId ? m.childId.slice(0, 12) : '', error: m.error || '',
          // G-6b: the durable reason a failed member is deferred work (`activation-limit` = the host
          // cap refused it, and the framework will retry it) — needed to audit the queue without
          // re-deriving it from the error text.
          failReason: m.failReason || '',
        })),
        tasks: listTasks(),
        // LOW (deep review): a member whose provisioning failed stays on the roster forever (ids
        // are never reused, so the entry must stay) — but `resume` only retries the ones refused by
        // the HOST's live-child cap. Everything else is surfaced here with the remedy, instead of
        // being a silent, permanent `phase:'failed'` row an operator has to notice by luck.
        failedMembers: s.members.filter((m) => m.phase === 'failed').map((m) => ({ id: m.id, kind: m.kind, failReason: m.failReason || '', error: String(m.error || '').slice(0, 200) })),
        failedMembersNote: 'resume 只重试「live-child 上限」类失败；其它 provisioning 失败请由所办重新招聘（新 id，旧 id 永不复用）',
        // G-6 (installer review): the DEFERRED spawns — refused by the host's live-child cap, queued
        // by construction (durable `phase:'failed'` + `failReason:'activation-limit'`) and retried on
        // every scheduling pass until capacity frees up or the session's attempt budget runs out.
        // v4 exposed the same fact as `pendingSpawns`; without it a refusal was invisible work.
        pendingSpawns: pendingSpawnMembers().map((m) => ({
          id: m.id, kind: m.kind, attempts: spawnRetryAttempts.get(m.id) || 0,
          error: String(m.error || '').slice(0, 200),
        })),
        pendingSpawnsNote: '容量（宿主 live-child 上限）拒绝的成员：已登记为待补建，框架在每次调度轮次自动重试（容量未释放时该次重试不询问宿主，零成本）；成功后该成员转为 active，本列表自动清空。非容量类的 provisioning 失败不会自动重试（会通知所办）。',
        // F8 (status/report review): the two counts have different scopes — `pending` is the
        // INSTITUTE-WIDE number of not-yet-acknowledged messages (not "my unread"), and `delivered`
        // is a CAPPED acknowledgement ledger. Both are named accordingly here.
        chat: { pending: s.messages.length, delivered: s.delivered.length,
          // S10（D6）：**只读**子键（**不加 `status()` 顶层键**）。
          quotes_per_message_max: quotesPerMessageMax(), quote_depth_max: quoteDepthMax() },
        chatScope: 'pending = 全所未确认投递的消息数（非"我的未读"）；delivered = 封顶账本（DELIVERED_CAP，到顶后不再增长）',
        // MEDIUM 4 (deep review): the requests only the OFFICE can approve. `to:'voters'` never
        // reaches the office (it is not a member), so an unapproved proposal used to be invisible
        // to the one actor able to act on it.
        officeRequests: s.messages.filter((m) => m.to === OFFICE_INBOX).map((m) => ({ id: m.id, from: m.from, text: String(m.text || ''), at: m.at })),
        // F4 (status/report review): the list above is truncated at OFFICE_REQUEST_CAP, so the
        // truncation is published instead of pretending the list is complete.
        officeRequestsShown: s.messages.filter((m) => m.to === OFFICE_INBOX).length,
        officeRequestsCap: OFFICE_REQUEST_CAP,
        officeRequestsDropped: Number(s.officeRequestsDropped || 0),
        officeRequestsTruncated: s.messages.filter((m) => m.to === OFFICE_INBOX).length >= OFFICE_REQUEST_CAP,
        // MEDIUM 7/8 (deep review): persistence health is part of the status. `stateWriteFailures`
        // > 0 means the in-memory state is AHEAD of the file; `prematureReads` > 0 means some
        // consumer read state before the first load settled (see the note on `state()`).
        // F2/F9 (status/report review): both counters are SESSION-scoped (a restart resets them), so
        // the scope is stated here too, not only in the report line.
        persistence: { writeFailures: stateWriteFailures, prematureReads: prematureReads, loadSettled: loadSettled, loadProblem: lastLoadProblem, scope: 'session（重启后归零）', sandboxPolicyMismatch: sandboxPolicyMismatch },
        // 会议的两个位置分开公布：**机会位**（asked/silent/unreached）与**举手**决定能否收束；
        // 发言位（spoke/spokeCount）只描述"谁说了话"；票位在 solve 里（互不继承）。
        meeting: meeting ? {
          id: meeting.id, agenda: meeting.agenda, kind: meeting.kind,
          phase: meeting.phase,
          hardLimitMs: Number(meeting.hardLimitMs || meetingHardLimitMs()),
          elapsedMs: now() - Number(meeting.startedAt || now()),
          roster: meeting.roster.slice(), order: meeting.order.slice(),
          asked: Object.keys(meeting.asked || {}), silent: Object.keys(meeting.silent || {}),
          unreached: Object.keys(meeting.unreached || {}), hands: meetingHandsUp(meeting),
          // 每个常驻成员**已经尝试唤醒过几次**（`meetingWakeRetries = N` ⇒ 最多 N+1 次尝试；0 ⇒ 恰好 1 次）。
          attempts: Object.assign({}, meeting.retries || {}),
          invited: Object.keys(meeting.invited || {}),
          spoke: Object.keys(meeting.inputs), spokeCount: Object.assign({}, meeting.spokeCount || {}),
          // S11（GAPS 29）：**只读**子键（**不加 `status()` 顶层键**）——记录人（'' ＝ 未指定）＋条目数。
          secretary: currentSecretary(), record_entry_count: secretaryEntriesOf(meeting).length,
          // S12（D7/GAPS 22）：**只读**子键——本场等级（`formal`／`light`）。
          level: meetingLevelOf(meeting),
          // S8（R3/K12/B9）：**只读**冻结面（**只加子键、不加顶层键**）——派生自"是否存在 open 投票板"。
          speech_frozen: speechFrozenView().frozen, frozen_by: speechFrozenView().frozen_by,
        } : null,
        parkedMeeting: pendingMeeting ? { agenda: pendingMeeting.agenda, kind: pendingMeeting.kind } : null,
        verify: cv ? { target: cv.target, kind: cv.kind, stage: cv.stage, round: cv.round, voted: Object.keys(cv.votes), m: quorumM(), P: voterCount(),
          // S9（D5/D5a/U3）：**只读**子键（**不加 `status()` 顶层键**）。
          minority_count: Array.isArray(cv.minority) ? cv.minority.length : 0,
          reconsiderable: !!reconsiderTool, last_reconsideration_at: (Array.isArray(cv.reconsiderations) && cv.reconsiderations.length ? Number(cv.reconsiderations[cv.reconsiderations.length - 1].at || 0) : 0),
          threshold_m: raisedThresholdOf(cv) || quorumM() } : null,
        // S7（D3/D4/R9/K13）：投票板 —— 只用 §4.3 **已声明的冻结键**（open/question/options/cast/
        // quorum_reached），另加**子键**（rules/min_votes_reached/settled）：**不加 `status()` 顶层键**。
        // 两个门槛**并列**：`quorum_reached`＝法定人数（结题门：未投票者是否已清空）；`min_votes_reached`
        // ＝**本次投票是否成立**（只读 minVotes 与已投数）。**secret 板的逐人选择不进任何公开面**。
        poll: (() => {
          const b = openBallot()
          if (!b) return { open: false, question: '', options: [], cast: 0, quorum_reached: false }
          const cast = ballotCast(b)
          const pending = ballotPending(b)
          const minV = Number(((b.rules || {}).minVotes) || 0)
          const reached = ballotSettled(b)     // 只读 minVotes 与已投数；与 `quorum_reached`（结题门）**各算各的**
          return {
            open: true, question: String(b.question || ''), options: ballotOptionsView(b).map((o) => o.text),
            cast, quorum_reached: pending.length === 0,
            rules: ballotRulesView(b), min_votes_reached: reached, settled: reached,
            pending: pending.slice(), ballot_id: String(b.id || ''), secret: !!(b.rules && b.rules.secret),
          }
        })(),
        verifyQueue: s.queue.map((q) => q.target),
        // F7 (status/report review): the old `verified` meant "concluded (真 OR 假)" while its name
        // said "verified". It is kept for compatibility but the honest split is published next to it.
        verified: Object.keys(s.verdicts).filter((k) => s.verdicts[k] && s.verdicts[k].closed && s.verdicts[k].outcome !== 'undecided'),
        verifiedTrue: Object.keys(s.verdicts).filter((k) => { const v = s.verdicts[k]; return v && v.closed && v.outcome === 'true' }),
        concludedFalse: Object.keys(s.verdicts).filter((k) => { const v = s.verdicts[k]; return v && v.closed && v.outcome === 'false' }),
        verifiedNote: 'verified = 已定论（真或假，历史名，保留兼容）；请用 verifiedTrue / concludedFalse / undecided 三个精确字段',
        undecided: Object.keys(s.verdicts).filter((k) => { const v = s.verdicts[k]; return v && v.closed && v.outcome === 'undecided' }),
        solveVotes: solveVotesList(),
        // Lean formal verification: mode + per-object status + the formalization TODO. This
        // is how an office/human audits "did we really get strict proofs, or only consensus?"
        formal: {
          mode: formalMode(),
          objects: Object.keys(formalRecords()).map((k) => {
            const r = formalRecords()[k] || {}
            // F1d (fallout #4): `decision`/`decisionSource` are READ here (member-reply vs
            // job-settle) instead of being a write-only field justified by a comment.
            // Adv-verify F3: `fidelity` (the defect record + the enforced-abstention marker) is
            // exposed too — before this it lived only in the state file, so a tool-surface audit
            // could not see WHY a ballot was counted as an abstention.
            return { target: k, status: r.status, decision: r.decision || '', decisionSource: r.decisionSource || '', fidelity: r.fidelity || null, abstainedCount: Number((r.fidelity || {}).abstainedCount || 0) || (Array.isArray((r.fidelity || {}).voteAbstainedByFramework) ? (r.fidelity.voteAbstainedByFramework.length) : ((r.fidelity || {}).voteAbstainedByFramework ? 1 : 0)), file: r.file || '', proof: r.proof || '', note: r.note || '', run: r.run ? { ok: r.run.ok, exitCode: r.run.exitCode, ms: r.run.ms } : null, async: r.async || null }
          }),
          passed: Object.keys(formalRecords()).filter((k) => (formalRecords()[k] || {}).status === 'passed'),
          blocked: Object.keys(formalRecords()).filter((k) => (formalRecords()[k] || {}).status === 'blocked'),
          todo: formalTodo(),
        },
        // The final-paper flow: stage, who wrote/reviewed what, the office-consultation
        // counters and the compile result. Without this an operator cannot tell whether the
        // run is waiting for the office, for a member, or for nobody.
        paper: paperSummary(),
        lastProgressAt, params: visibleParams(),
      }
    }
    function report() {
      syncParamsFromState()
      const s = inst()
      // ONE snapshot for the whole report: the text line and the returned `quorum` object can
      // never disagree (DEFECT B), and `rosterVersion` lets a reader detect a stale copy.
      const qv = quorumView()
      const L = []
      L.push('# 「' + instituteName + '」研究所汇报')
      L.push('')
      L.push('- 项目：' + project + '｜' + phaseFactLine())
      L.push('- 研究对象：' + (s.problem.statement ? s.problem.statement.slice(0, 200) : '（未设定）'))
      L.push('- 求真门槛：' + (qv.started ? 'm = ' + qv.m : '未启动（有表决权者 0 人，m 未定义）') + '（模式 ' + params.quorumMode + '）｜有表决权者 ' + qv.voterCount + ' 人｜rosterVersion（名册版本，多个视图不一致时用它判断谁过期）' + qv.rosterVersion)
      L.push('')
      L.push('## 编制')
      if (!s.members.length) L.push('（暂无成员）')
      for (const m of s.members) {
        L.push('- ' + m.id + '｜' + kindLabel(m.kind) + '｜' + m.phase +
          (m.hiredBy ? '｜雇主 ' + m.hiredBy : '') +
          (m.direction ? '｜方向：' + m.direction : '') +
          '｜轮次 ' + (rounds.get(m.id) || 0) + '（本会话计数，重启归零）' +
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
          '｜平均概率 ' + Number(v.mean || 0).toFixed(2) + '｜' + (v.reason || '') + '）' +
          (v.supersededBy ? '｜**已被复议**（' + v.supersededBy + '；旧结论仍可引用）' : ''))
        // S9（D5 硬约束）：**少数意见一律入档** —— 逐人列（弃权/无法判断/未表态**单列**，不算少数意见）。
        const mins = Array.isArray(v.minority) ? v.minority : []
        if (v.secretSource) {
          // S9（B10/R54）：**不记名**来源 ⇒ 公开面**只给聚合**，逐人选择与理由**永不解密**。
          L.push('  - 少数意见：**本结论源自不记名** ⇒ 只给聚合（' + mins.length + ' 人持少数意见）；逐人选择与理由按留档口径**不公开**')
        } else if (mins.length) {
          L.push('  - 少数意见（' + mins.length + ' 人）：' + mins.map((m) => m.by + '＝' + Number(m.prob).toFixed(2) + '（' + (m.reason || '（未说明）') + '）').join('；'))
        } else {
          L.push('  - 少数意见：无（弃权 ' + (v.abstain || 0) + '／无法判断 ' + Object.keys(v.unable || {}).length + '／未表态 ' + ((v.silent || []).length) + ' 已单列，不计入少数意见）')
        }
        const rcs = Array.isArray(v.reconsiderations) ? v.reconsiderations : []
        if (rcs.length) {
          L.push('  - 复议记录：' + rcs.map((x) => x.id + '（' + x.by + '，' + x.eligibility + '，门槛 ' + x.thresholdBefore + '⇒' + x.thresholdAfter + '）').join('；'))
        }
      }
      const cv = currentVerify()
      if (cv) L.push('- 进行中：' + cv.target + '｜' + cv.stage + ' 第 ' + cv.round + ' 轮' + (Object.keys(cv.votes).length ? '｜已投 ' + Object.keys(cv.votes).join('、') : '｜尚无人投票'))
      if (s.queue.length) L.push('- 队列：' + s.queue.map((q) => q.target).join('、'))
      L.push('')
      L.push('## 群聊 / 会议')
      L.push('- 未投递消息（全所）：' + s.messages.length + '｜已确认投递（封顶账本）：' + s.delivered.length)
      // MEDIUM 4 + F4: the office's own inbox — requests that only the office can approve, with the
      // truncation published (the list is capped at OFFICE_REQUEST_CAP).
      {
        const reqs = s.messages.filter((m) => m.to === OFFICE_INBOX)
        const dropped = Number(s.officeRequestsDropped || 0)
        L.push('- 待所办裁定：' + (reqs.length
          ? '显示最新 ' + reqs.length + ' 条' + (dropped ? '（上限 ' + OFFICE_REQUEST_CAP + '，累计已丢弃最旧 ' + dropped + ' 条）' : '') + '；最新：' + String(reqs[reqs.length - 1].text || '').slice(0, 120)
          : '（无）'))
      }
      if (meeting) {
        const m = meeting
        const askedIds = (m.roster || []).filter((id) => m.asked[id] !== undefined || m.silent[id] !== undefined || m.unreached[id] !== undefined)
        const handsUp = meetingHandsUp(m)
        L.push('- 进行中会议：' + m.id + '｜' + m.agenda
          + '｜阶段＝' + (m.phase === 'open-floor' ? '举手发言' : '轮流发言')
          + '｜已获机会 ' + askedIds.length + '/' + (m.roster || []).length
          + (Object.keys(m.silent || {}).length ? '｜选择不发言 ' + Object.keys(m.silent).join('、') : '')
          + (handsUp.length ? '｜举手 ' + handsUp.join('、') : '')
          + (Object.keys(m.invited || {}).length ? '｜受邀 ' + Object.keys(m.invited).join('、') : '')
          + '｜已开 ' + Math.round((now() - Number(m.startedAt || now())) / 60000) + ' 分／硬界 ' + Math.round(Number(m.hardLimitMs || 0) / 60000) + ' 分'
          + (Object.keys(m.inputs).length ? '｜已发言 ' + Object.keys(m.inputs).join('、') : '｜尚无人发言')
          // S12（D7/GAPS 22）：**等级公开可见**（简流程 ⇒ 明写"不得产出实体定论"）。
          + '｜等级＝' + (meetingLevelOf(m) === 'formal' ? '**正式**（可产出实体定论）' : '**简流程**：' + LIGHT_LEVEL_NOTE))
      }
      if (pendingMeeting) L.push('- 暂存会议：' + pendingMeeting.agenda)
      // F6 (status/report review): a meeting whose index entry exists but which never FINALIZED is
      // not history. `meetingOpen` is durable (set in `beginMeeting`, cleared in `finalizeMeeting`),
      // so a restart cannot silently drop the minutes while the count still looks normal.
      {
        const open = s.meetingOpen || null
        const finalized = (s.meetings || []).filter((x) => !open || x.id !== open.id)
        L.push('- 历史会议：' + finalized.length + ' 次｜辩论录：' + s.debates.length + ' 份'
          + (open ? '｜⚠ 有 1 场会议未收束：' + open.id + '（开始于 ' + fmtTime(open.at) + '；本会话未恢复它的发言，纪要可能缺失）' : ''))
      }
      // G-6: deferred spawns (host live-child cap refused them; the framework retries each pass).
      {
        const pend = pendingSpawnMembers()
        if (pend.length) {
          L.push('- 待补建成员：' + pend.map((m) => m.id + '(' + kindLabel(m.kind) + '，已重试 ' + (spawnRetryAttempts.get(m.id) || 0) + ' 次)').join('、')
            + '｜容量释放后框架会在下一次调度轮次自动重试（容量未释放时该次重试不询问宿主）；成功后该成员转为 active 并从本行消失')
        }
      }
      L.push('- 解决票：' + (solveVotesList().length ? solveVotesList().join('、') : '（无）'))
      // S5 (R1/D10): the framework's ONE stall notice — a FACT ("who is waiting for whom"), never a
      // procedural act: no meeting is convened, nothing is closed, no member is spoken for.
      {
        L.push('## 静止提示（框架只提示、不驱动）')
        L.push('- 阈值：' + (stallNoticeMs() > 0
          ? Math.round(stallNoticeMs() / 1000) + ' 秒（`stallAutoMeetingMs`；**负值＝关闭**）'
          : '已关闭（`stallAutoMeetingMs` 为负值）'))
        const sn = s.stallNotice || null
        if (sn && Number(sn.sinceAt) > 0) {
          L.push('- 本片段已提示一次：' + fmtTime(sn.at) + '｜谁在等谁：'
            + (Array.isArray(sn.waiting) && sn.waiting.length ? sn.waiting.join('；') : '（无明确等待项：无人被挡、无人未表态）'))
        } else {
          L.push('- 本片段尚未提示（有实质进展，或未达阈值）')
        }
      }
      L.push('')
      // S6（D1/D2/D6/D8）：临时授权台账 —— **只读呈现**（授权/撤回复核用；不改票权、不驱动流程）。
      {
        const gs = grantsView()
        L.push('## 临时授权（可授：' + GRANTABLE_COMMANDS.join('／') + '；不可授：end_verify／主持代行／票权／私密与引用面）')
        if (!gs.length) L.push('- （无）')
        for (const g of gs) {
          L.push('- ' + g.id + '｜' + g.by + ' → ' + g.to + '｜`' + g.command + '`｜' + g.grantScope + '｜'
            + (g.active ? '**生效中**（' + g.expiresOn + '）'
              : (g.revokedAt ? '已撤回（' + fmtTime(g.revokedAt) + '）' : '已失效（' + g.expiresOn + '）')))
        }
      }
      L.push('')
      // S7（D3/D4/R9/K13）：投票板 —— 规则快照（**开票前可见**）＋ 两个门槛**并列**（K13）＋
      // 未投票者**公开点名**（P12）；**secret 板只给聚合**（逐人选择仅供计票，永不进公开面）。
      {
        const b = openBallot()
        L.push('## 投票板（S7；定稿 §7.1 六项）')
        if (!b) {
          L.push('- （当前没有进行中的投票板）')
        } else {
          const v = ballotView(b)
          L.push('- `' + v.id + '`：' + v.question + '｜由 ' + v.by + ' 创办于 ' + fmtTime(v.at) + '（会议 ' + (v.meetingId || '—') + '）')
          L.push('- 选项：' + v.options.map((o) => '`' + o.id + '`＝' + o.text).join('；'))
          L.push('- 规则：' + (v.rules.mode === 'single' ? '单选' : '多选（至少 ' + v.rules.min + '、至多 ' + v.rules.max + '）')
            + '｜**最少收集票 ' + v.rules.minVotes + '**（本次投票是否成立）｜法定人数 m＝' + v.m + '（**另一个**门槛：结题门）'
            + '｜' + (v.secret ? '**不记名**（逐人选择仅供计票；"这次是不记名"已留档）' : '记名')
            + '｜弃权 ' + (v.rules.allowAbstain ? '允许' : '不允许') + '｜改票 ' + (v.rules.allowRevote ? '允许（截止前）' : '不允许'))
          L.push('- 进度：已投 ' + v.cast + '／' + voterCount() + '（有效 ' + v.valid + '、弃权 ' + v.abstained + '）'
            + '｜**最少收集票**：' + (v.min_votes_reached ? '已成立' : '未成立（**本次投票不形成结论**，不得据剩余票推断）')
            + '｜**法定人数**：' + (v.quorum_reached ? '阻塞已解除' : '仍被未投票者阻塞'))
          L.push('- 未投票者：' + (v.pending.length ? v.pending.join('、') : '（无）'))
          if (v.secret) L.push('- 逐人选择：**不记名** ⇒ 不公开（计票照常；身份与选择仅供计票）')
          else L.push('- 逐人选择：' + ((v.ballot || []).map((x) => x.by + '＝' + (x.abstain ? '弃权' : ((x.choices || []).join('＋') || '—'))).join('；') || '（尚无）'))
        }
      }
      L.push('')
      // F1 (status/report review, HIGH): the section must read the sources its heading advertises —
      // (a) skipped/malformed EVENTS (top-level `state.diagnostics`, written by `applyV5Event`'s
      // catch), (b) state-FILE problems (the session log `loadProblemLog` / `lastLoadProblem`), and
      // (c) ignored keys (institute-level `s.diagnostics`, written by `reportDroppedStateKeys`).
      // Every field is printed with an explicit fallback, so the literal `undefined` can never
      // appear. The section is omitted entirely when there is nothing to report (the
      // "assemble only when a value exists" rule).
      const topDiag = (() => { try { return (state().diagnostics || []) } catch (e) { return [] } })()
      const droppedDiag = (s.diagnostics || []).filter((d) => d && d.kind === 'state-dropped-keys')
      const eventDiag = topDiag.filter((d) => d && d.type !== 'vibe5/load')
      const loadDiag = topDiag.filter((d) => d && d.type === 'vibe5/load').concat(loadProblemLog)
      {
        const fmtDiag = (d) => fmtTime(d.at) + '｜' + String(d.type || '(无 type)') + '｜' + String(d.error || '(无 error)')
        const lines = []
        for (const d of eventDiag.slice(-10)) lines.push('- [被跳过的事件] ' + fmtDiag(d))
        for (const d of loadDiag.slice(-10)) lines.push('- [状态文件] ' + fmtDiag(d))
        for (const d of droppedDiag.slice(-10)) lines.push('- [忽略的键] ' + fmtDiag(d))
        if (lastLoadProblem && !loadDiag.some((d) => String(d.error || '') === lastLoadProblem)) lines.push('- [状态文件] ' + lastLoadProblem)
        if (lines.length) {
          L.push('')
          L.push('## ⚠ 状态诊断（被跳过的事件 / 状态文件读取问题 / 忽略的键）')
          for (const ln of lines) L.push(ln)
        }
      }
      L.push('')
      L.push('## Lean 形式化')
      if (!formalOn()) L.push('- 未启用（`formalVerify` = off；可用 vibe_v5_set 切到 encourage / require）')
      else {
        L.push('- 模式：' + formalMode() + '（' + (formalMode() === 'require' ? '强制：定论前必须有 Lean 通过或显式阻塞记录' : '鼓励：按实现难度自行决定') + '）')
        L.push('- 已通过：' + (Object.keys(s.formal || {}).filter((k) => (s.formal || {})[k].status === 'passed').join('、') || '（无）'))
        L.push('- 已记录阻塞：' + (Object.keys(s.formal || {}).filter((k) => (s.formal || {})[k].status === 'blocked').join('、') || '（无）'))
        L.push('- 形式化待办：' + ((s.todo || []).map((t) => t.id).join('、') || '（无）'))
        // F1d (fallout #4): the member-reported vs job-settled distinction, readable.
        {
          const dec = Object.keys(s.formal || {}).filter((k) => (s.formal[k] || {}).decision).map((k) => k + '=' + s.formal[k].decision + '(' + (s.formal[k].decisionSource || '来源未记录') + ')')
          if (dec.length) L.push('- 形式化决定：' + dec.join('、') + '（来源 member-reply=成员自述，job-settle=后台作业落地）')
          // Adv-verify F3: the enforced-abstention marker is readable here too (how many ballots the
          // framework turned into abstentions because the same reply recorded a fidelity defect).
          const enforced = Object.keys(s.formal || {}).filter((k) => {
            const fid = (s.formal[k] || {}).fidelity || {}
            return Number(fid.abstainedCount || 0) > 0 || (Array.isArray(fid.voteAbstainedByFramework) && fid.voteAbstainedByFramework.length) || fid.voteAbstainedByFramework
          }).map((k) => {
            const fid = (s.formal[k] || {}).fidelity || {}
            const n = Number(fid.abstainedCount || 0) || (Array.isArray(fid.voteAbstainedByFramework) ? fid.voteAbstainedByFramework.length : 1)
            const who = (Array.isArray(fid.voteAbstainedByFramework) ? fid.voteAbstainedByFramework : [fid.voteAbstainedByFramework]).filter(Boolean).map((x) => x.by || '?').join('/')
            return k + '×' + n + (who ? '(' + who + ')' : '')
          })
          if (enforced.length) L.push('- 框架强制弃权：' + enforced.join('、') + '（同回复记录忠实性缺陷 ⇒ 该成员对该对象的布尔票按弃权计入）')
        }
        L.push('- 可复用库：VibeMath/Formal/{Lib,Proved}/（跨项目）｜本所形式化：Formal/｜归档证明：Verified/Lean/')
      }
      L.push('')
      L.push('## 最终论文')
      {
        const pp = paper()
        if (!pp) L.push('- 尚未开始（' + (params.finalPaper === false ? '自动已关闭（finalPaper=false），可用 /v5 paper 手动生成' : '收口时会自动开始；也可用 /v5 paper 手动开始') + '）')
        else {
          L.push('- 目录：Paper/' + pp.id + '/｜状态：' + pp.status + '｜阶段：' + pp.stage + '｜轮次：' + pp.round + '/' + PAPER_MAX_ROUNDS)
          L.push('- 定稿代表：' + pp.editor + (pp.editorFallback ? '（原定代表不在册，已回退）' : '') + '｜语言：' + pp.lang + '｜格式：' + pp.format)
          L.push('- 交稿：' + (Object.keys(pp.parts || {}).join('、') || '（无）') + '｜互审：' + (Object.keys(pp.reviews || {}).map((k) => k + '→' + ((pp.reviews[k] || {}).of || '?') + (pp.reviews[k] && pp.reviews[k].deliverable === true ? '(可交付)' : '(需修改)')).join('、') || '（无）'))
          L.push('- 所办交流：消息 ' + Number((pp.consult || {}).messages || 0) + ' 条｜会议 ' + Number((pp.consult || {}).meetings || 0) + ' 次')
          if (pp.compile) L.push('- 编译：' + pp.compile + (pp.engine ? '（' + pp.engine + '）' : ''))
          if ((pp.warnings || []).length) L.push('- 警告：' + pp.warnings.join('；'))
          L.push('- 下一步：' + paperNextStep(pp))
        }
      }
      L.push('')
      L.push('## 文件位置')
      L.push('- 根目录：' + instRoot())
      L.push('- 工作目录相对路径（你的文件工具的基准）：' + instRootRel() + '/｜已确立：Verified/｜成员库：Members/<id>/（成员的库文件路径 = Members/<id>/Progress/progress.md 等；文件工具按会话 cwd 解析 ⇒ 请用完整路径）｜群聊：Shared/Chat/｜会议：Shared/Meetings/｜辩论：Shared/Debates/')
      // MEDIUM 7/8 + F9: the two persistence facts an operator must not have to guess — with the
      // SESSION scope stated (a restart resets both counters) and no raw boolean in the sentence.
      L.push('- 持久化（本会话计数）：写失败 ' + stateWriteFailures + ' 次｜首次载入前被读取 ' + prematureReads + ' 次｜状态文件已载入：' + (loadSettled ? '是' : '否'))
      if (lastLoadProblem) L.push('- ⚠ 状态文件问题：' + lastLoadProblem)
      // G-7 (installer ROUND2): the sandbox fence's root vs the session workspace. A named warning,
      // not a refusal: v5 cannot change the host's fence, and refusing would stop persisting work.
      if (sandboxPolicyMismatch) L.push('- ⚠ 沙箱策略根与会话工作目录不一致：策略=' + sandboxPolicyMismatch.policyRoot + '｜会话=' + sandboxPolicyMismatch.expected
        + '（v5 用会话工作目录拼所有路径；若宿主按策略根解析写操作，产物可能落在预期之外的那棵树——请核对 sandbox 策略的 workspaceRoot）')
      // Methodology/collaboration feedback: the numbers an operator (and the academician's periodic
      // summary) needs to see whether the loop is actually being USED and closed — not just collected.
      L.push('')
      L.push('## 反馈库（方法论／协作层；不是研究结论）')
      {
        const fc = feedbackCounts()
        L.push('- 条目 ' + fc.total + '｜未闭环 ' + fc.open + '｜已闭环 ' + fc.closed
          + '｜按类别：' + FEEDBACK_CATEGORIES.map((c) => c + '=' + fc.byCategory[c]).join('、')
          + '（' + FEEDBACK_CATEGORIES.map((c) => FEEDBACK_CATEGORY_LABELS[c]).join('/') + '）'
          + '｜按路由：' + FEEDBACK_ROUTES.map((r) => r + '=' + fc.byRoute[r]).join('、'))
        if (!feedbackOn()) {
          L.push('- 反馈开关：off（提示词不注入该段；写入请求会被具名拒绝）')
        } else {
          const openRows = feedbackEntries().filter((e) => FEEDBACK_OPEN_STATUSES.indexOf(e.status) !== -1)
          const inter = openRows.filter((e) => e.route === 'interpersonal')
          L.push('- 未闭环 ' + openRows.length + ' 条' + (inter.length ? '｜其中 interpersonal（需评估＋事后回填）：' + inter.map((e) => e.id + '(by ' + e.by + ')').join('、') : ''))
          L.push('- 文件镜像：' + FEEDBACK_DIR + '/（按类别分文件）｜明细：vibe_v5_feedback {op:\'list\'}')
        }
      }
      return { ok: true, report: L.join('\n'), quorum: qv }
    }
    // Adding/removing a PERMANENT researcher is a change to the institute's public
    // structure, so members may only propose it; the office decides and executes.
    async function addResearcher(callerId, direction) {
      if (!isOffice(callerId)) {
        await say(callerId, { to: 'voters', kind: 'voters', text: '提议增聘一名常驻研究员（方向：' + String(direction || '未指定') + '）' })
        // MEDIUM 4: the office is the ONLY actor that can execute this, and `to:'voters'` never
        // reaches it — the proposal is now addressed to the office as well.
        await say(callerId, { to: OFFICE_INBOX, kind: 'office-request', text: '请所办裁定：增聘一名常驻研究员（方向：' + String(direction || '未指定') + '｜提议人：' + callerId + '）' })
        return { ok: true, proposed: true, message: '已向所办提议增聘常驻研究员（编制变更需所办批准；所办会在 status/report 的 officeRequests 里看到该提议）' }
      }
      if (!running || autoDone) return { ok: false, code: 'V5_INSTITUTE_STATE', message: 'the institute is not running' }
      const m = await newMember('researcher', { direction: String(direction || '') })
      try {
        await spawnMember(m, null)
      } catch (e) {
        await putMember(Object.assign({}, memberById(m.id) || m, { phase: 'failed', error: String((e && e.message) || e), failReason: isActivationLimitReached(e) ? 'activation-limit' : 'other' }))
        if (isActivationLimitReached(e)) { noteChildLimit(e); return { ok: false, code: 'ACTIVATION_LIMIT_REACHED', message: activationLimitText(hostChildLimit) + '（已登记为待补建：容量释放后框架会在下一次调度轮次自动重试）' } }
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
      ready,
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
      // path helpers: the tool face advertises the CWD-relative spellings (L1), so they must be
      // reachable from the registration block too.
      instRel, instRootRel, formalRootRel,
      // Lean formal verification (docs/formal-verification.md)
      formalMode, formalOn, formalRecords, formalTodo, formalOf, rebuildLeanLibIndexes,
      leanArchive, leanRunTool, writeFormalIndex, writeFormalTodo, recordFidelityDefect,
      leanRead, leanJobTool, leanJobView, leanJobsView, leanSearchRootView, leanInitiative, leanDailyOn,
      // math_computation (docs/math-computation.md)
      refreshMathLine, mathLine: () => mathLineZh, mathSessionHost: () => mathSessionHost,
      runLeanQueue, disposeLeanJobs, leanRecover: recoverLeanJobs,
      leanQueueApi: async () => { await runLeanQueue(); return { jobs: leanJobsView(), notices: leanNotices.length } },
      leanRunToolApi: async (relPath, timeoutMs) => await leanRunFile(relPath, timeoutMs),
      // consensus / meetings
      maybeQueueVerify, castVerdict, endVerify, selfReport, selfReportView, selfReportTool, chairProxyTool, proceduralObjectionTool, stallNoticeView, grantTool, revokeTool, grantsView, pollOpenTool, pollVoteTool, pollCloseTool, ballotView, openBallot, speechGate, speechFrozenView, reconsiderTool, minorityOf, sayQuote, resolveQuoteAnchor, quotesPerMessageMax, quoteDepthMax, secretaryTool, minutesTool, currentSecretary, setMeetingLevel, meetingLevelOf, meetingOpen: () => !!meeting, currentVerify, hasVerifyInFlight, startMeeting, quorumM, voterCount,
      // final paper (docs/final-paper.md; the phase runs BEFORE finishRun)
      startPaper, paperStatus: paperSummary, finalizePaperByOffice,
      // methodology/collaboration feedback (Shared/Feedback/): the tool handler + the observers
      feedbackOn, feedbackCounts, feedbackTool,
      // authorization helpers (used by tool handlers)
      memberIdOfAgent, isOffice, isAcademician, isProvablyOffice, officeCaller, memberById, activeMembers,
      // diagnosis helpers (defects 1/2 of the architecture self-test)
      memberDiagnosis, quorumM, quorumView, voterCount,
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
          await s.ready()
          return JSON.stringify(await fn(s, args || {}, exec && exec.agent))
        } catch (e) {
          return JSON.stringify({ ok: false, error: String((e && e.message) || e) })
        }
      },
    }))
  }
  const S = { type: 'string' }, N = { type: 'number' }, I = { type: 'integer' }, B = { type: 'boolean' }
  const SA = { type: 'array', items: { type: 'string' } }
  /**
   * Resolve the caller of a WRITING tool through `officeCaller` and refuse when nobody can be
   * identified. `memberIdOfAgent` answers '' for a caller that is neither a member child nor the
   * session root itself (a dismissed member's stale child, a nested helper under the office root,
   * a synthetic context with no known member), and the office gates used to treat '' as the office
   * (`isOffice`), so such a caller could sign assignments/priorities/tasks as 'office' (audit L6
   * follow-up). A real member id and the provable session root ('office') still pass unchanged.
   */
  function withCaller(s, x, what, fn) {
    const caller = s.officeCaller(x)
    if (!caller) return { ok: false, code: 'V5_MEMBER_NOT_FOUND', message: 'no calling member: ' + what + ' needs a resolved member id or the office (the session root)', next: { kind: 'member-call', tool: 'vibe_v5_members', hint: 'call this tool from a member subagent; the office (the session root) can read state with vibe_v5_report / vibe_v5_status' } }
    return fn(caller)
  }

  // ================= math_computation registration (docs/math-computation.md) =================
  // The SHARED module is instantiated PER CALLING SESSION, so every host callback closes over
  // exactly one session's LIVE params/root/fs — there is NO ambient "current session" slot that
  // a concurrent call from another session could overwrite (audit C: a single slot meant that
  // while session A awaited a spawn, session B could take it over, and A's later
  // params/writeText/projectRoot would silently be B's). The tool FACE is installed exactly once
  // (the module's own contract: one `host.register` call per preset); the per-session instances
  // are created lazily and their `register` callback is deliberately ignored.
  // The module's tool NAME has no `vibe_` prefix on purpose (it is the same primitive in all
  // four presets), and `projectRoot()` is the INSTITUTE root, so receipts land in
  // <institute>/Computation/<runId>/.
  let mathToolMeta = null              // { name, description, parameters } — the frozen face
  const mathSessionHandlers = new WeakMap() // session API object -> that session's module handler
  // The metadata instance: its callbacks are never invoked (its handler is never called), it
  // exists only so the module can hand us the frozen tool face exactly once.
  const mathMetaHost = {
    register: (name, description, parameters) => { if (!mathToolMeta) mathToolMeta = { name, description, parameters } },
    params: () => DEFAULT_PARAMS,
    projectRoot: () => '.',
    designator: 'vibe-math-v5r',
    writeText: async () => false,
    readText: async () => undefined,
    exists: async () => false,
    resolveExecutable: async () => { throw new Error('metadata host') },
    spawn: async () => null,
    log: () => {},
  }
  registerMathComputation(mathMetaHost)
  // Drift guard: the installed face must BE the shared frozen text (all four presets must ship
  // the same description — a re-typed copy here would diverge silently).
  if (!mathToolMeta || mathToolMeta.description !== MATH_TOOL_DESCRIPTION) {
    console.error('vibe-math-v5r: math_computation was registered with a description that is not MATH_TOOL_DESCRIPTION')
  }
  function mathHandlerFor(s) {
    let handler = mathSessionHandlers.get(s)
    if (!handler) {
      // One instance per session: its host callbacks are the session's own seam.
      const inst = registerMathComputation(s.mathSessionHost())
      handler = inst && typeof inst.handler === 'function' ? inst.handler : async () => ({ ok: false, code: 'MATH_INVALID_ARGUMENT', message: 'math_computation: no session handler' })
      mathSessionHandlers.set(s, handler)
    }
    return handler
  }
  if (mathToolMeta) {
    registerTool(mathToolMeta.name, mathToolMeta.description, mathToolMeta.parameters,
      (s, args) => mathHandlerFor(s)(args))
  }
  /**
   * Resolve the caller of an OFFICE-ONLY control and refuse anything that is not the PROVABLE
   * session root. `officeCaller` answers 'office' for that root, a member id for a member child, and
   * '' for everyone else — an unidentifiable descendant of the root (a nested helper, a dismissed
   * member's stale child) or a context with no session. A member child and the office share ONE
   * institute session, so without this every lifecycle control (configure/start/resume/pause/stop/
   * set) could be driven by a member: it could stop the institute or rewrite quorum/params as the
   * office (audit L6 follow-up). ABSENCE of a caller is not the office either — that is exactly the
   * shape an unidentifiable caller has, and the tool wrapper already refuses an agent-less call
   * ('no session') before this point, so nothing here re-admits one.
   */
  function withOffice(s, x, what, fn) {
    const caller = s.officeCaller(x)
    if (caller !== 'office') {
      return {
        ok: false, code: 'V5_NOT_OFFICE',
        message: 'only the office (the PROVABLE session root) may ' + what +
          (caller ? '; the caller is member ' + caller : '; no caller could be identified'),
      }
    }
    return fn()
  }

  // ── office / host controls ────────────────────────────────────────────────
  registerTool('vibe_v5_configure', 'Create/configure the research institute (project, institute name, problem, params) WITHOUT starting it. Use this FIRST, then vibe_v5_start.', objParams({ project: S, institute: S, problem: S, params: { type: 'object' } }), (s, a, x) => withOffice(s, x, 'configure the institute', () => s.configure(a)))
  registerTool('vibe_v5_start', 'Found the institute: create the academician + N permanent researchers and begin. They brainstorm independently, then self-organize (the academician organizes and assigns; the framework only facilitates).', objParams({ problem: S, researcherCount: I, academician: B, params: { type: 'object' }, seedDirections: SA }), (s, a, x) => withOffice(s, x, 'found the institute', () => s.doStart(a)))
  registerTool('vibe_v5_resume', 'Resume a persisted institute: reconcile members against their durable sessions, rebuild any missing one from its Progress/, refresh consensus watchdogs, and restart scheduling.', objParams({}), (s, a, x) => withOffice(s, x, 'resume the institute', () => s.resume()))
  registerTool('vibe_v5_pause', 'Pause the institute (in-flight turns finish; no new wakes until resume).', objParams({}), (s, a, x) => withOffice(s, x, 'pause the institute', () => s.setPause()))
  registerTool('vibe_v5_stop', 'Stop the institute: interrupt every member, clear coordination state, and release their child sessions.', objParams({}), (s, a, x) => withOffice(s, x, 'stop the institute', () => s.initStop()))
  registerTool('vibe_v5_status', 'Machine-readable institute status (members, tasks, quorum, meetings, verification, mail).', objParams({}), (s) => s.status())
  registerTool('vibe_v5_report', 'Human-readable institute report (staffing, tasks, consensus, meetings, file locations).', objParams({}), (s) => s.report())
  registerTool('vibe_v5_set', 'Tune institute parameters (persisted in State/<institute>.v5state.json). provider/model override staff LLM routes (empty = inherit the office route). toolAllow/toolDeny restrict PERMANENT staff tools; tempToolAllow/tempToolDeny restrict temp workers. quorumCap sets m = min(quorumCap, voters); an m-vote passes only when at least m Boolean votes (exactly 1 or exactly 0) exist AND no voter returns an opposing Boolean, so with the default roster it degenerates to unanimity among the current voters; only current voters count (a dismissed member\'s earlier ballot is dropped). quorumMode "m-unanimous" (v5) or "all-unanimous" (v4 legacy). formalVerify: "off" (default, no extra requirement) | "encourage" (agents decide by implementation difficulty whether to formalize in Lean; a passing Lean run turns the vote into a FIDELITY review of the Lean statements) | "require" (same, plus a gate: a true/false verdict is withheld as undecided until the object is Lean-passed or has an explicit reasoned blocker record). LEAN TOOLCHAIN: leanCommand names the Lean executable (e.g. "lake" with leanArgs ["env","lean"]); leanArgs are inserted before the file name (the framework appends -R <VibeMath root> unless leanArgs already sets one); leanTimeoutMs is the per-run budget in ms (>=1000, and the per-job budget of the async queue). FINAL PAPER: finalPaper (default true) writes the final paper when the run concludes — the paper phase runs BEFORE the run is marked complete, the permanent staff write their own part, cross-review each other, and the editor named by paperEditor finalises; paperFormat "both"|"md"|"tex"; paperLanguage "zh"|"en"; paperCompilePdf compiles a PDF when a LaTeX engine is detected; paperEditor "academician" (default, the only editor an unattended run can reach) | "office" (manual /v5 paper only — the office must first consult the whole institute: >=1 office message AND >=1 meeting, recorded in the finalisation note); paperLatexCommand forces one engine command instead of auto-detection (empty = auto: xelatex -> latexmk -> pdflatex -> lualatex -> tectonic, English prefers pdflatex). LEAN ASYNC: leanAsync (default true) compiles on a per-session background queue (vibe_v5_lean_run / vibe_v5_lean_archive run=true enqueue and return immediately; inspect them with vibe_v5_lean_job or vibe_v5_lean_lib.jobs and wait with vibe_v5_lean_job {jobId,waitMs}); leanAsync=false restores the previous synchronous behaviour. Only a settled job (exit 0, unchanged content hash AND the same build context) may mark an object passed; a job id is the content+build-context digest. leanInitiative "off"|"normal" (default)|"eager" separates DAILY eagerness about formalizing from formalVerify (which stays the verdict-time requirement). leanSearchPaths (string[]) adds extra compiler search roots before the automatic VibeMath root (deduped; an explicit -R/--root in leanArgs wins). leanJobsMaxParallel (default 1) caps simultaneous background compiles. MATH COMPUTATION: mathComputation "off"|"auto" (default)|"on" gates the math_computation tool; mathMode "typed+shell" (default: the host shell may be used as a fallback, but a shell run carries no receipt and its conclusion must be marked 未经工具归档/not tool-archived) | "typed" (never mention the shell; engine=cli is refused); mathEngines lists the allowed engines (cli is on by default, SageMath is a later phase); mathTimeoutMs is the per-run budget (>=1000); mathPackages are packages a computation may require; mathInstallScope "user" (default) | "system" (per call only, never remembered). Installs are two-step (plan then confirm-token) and commercial engines are never installed. Unknown spellings of these enums fall back to the documented default. feedback (default "on") = the methodology/collaboration feedback library (Shared/Feedback/): "on" records entries and injects a short per-round hint; "off" injects nothing and refuses every write BY NAME (a switch, not a severity). MEETING SPEAKING (2.9.0): meetings run in two phases — a non-mandatory round-robin (every resident gets ONE chance to decide whether to speak; choosing not to speak is recorded by name and never blocks closing) and then an open floor where anyone (including someone who already spoke) raises a hand with meeting_hand:true and may speak again; the meeting closes when everybody has had the chance AND nobody still has a hand up / is in flight. Silence never triggers any deadline; meetingHardLimitMs (default 1800000 ms, clamped to [300000,7200000]) is the ONLY bound and abandons a genuinely wedged turn (the abandoned minutes still record the full detail); meetingWakeRetries (default 5, clamped to [0,10]) counts RETRIES, so N retries means at most N+1 wake attempts (N=0 still makes exactly ONE attempt - never zero); once attempts are exhausted the member is recorded as unreached, which still counts as having had the chance and does not block closing. Votes are untouched: vote_solved still needs EVERY voter true, so silence still blocks conclusion.', objParams({
    academician: B, academicianLeads: B, memberMayRejectAssign: B, researcherCount: I,
    quorumCap: I, quorumMode: S, verdictMaxRounds: I,
    maxTempPerMember: I, maxTempTotal: I,
    compactThreshold: I, compactAfterRounds: I, maxParallel: I,
    activityTimeoutMs: I, stallAutoMeetingMs: I, chatDigestMs: I, chatDigestMax: I, meetingKeepEvery: I,
    meetingHardLimitMs: I, meetingWakeRetries: I,
    formalVerify: { type: 'string', enum: ['off', 'encourage', 'require'] },
    leanCommand: S, leanArgs: SA, leanTimeoutMs: I, leanAsync: B,
    leanInitiative: { type: 'string', enum: ['off', 'normal', 'eager'] },
    leanSearchPaths: SA, leanJobsMaxParallel: I,
    mathComputation: { type: 'string', enum: ['off', 'auto', 'on'] },
    mathMode: { type: 'string', enum: ['typed', 'typed+shell'] },
    mathEngines: SA, mathTimeoutMs: I, mathPackages: SA,
    mathInstallScope: { type: 'string', enum: ['user', 'system'] },
    feedback: { type: 'string', enum: ['on', 'off'] },
    finalPaper: B, paperFormat: { type: 'string', enum: ['both', 'md', 'tex'] },
    paperLanguage: { type: 'string', enum: ['zh', 'en'] },
    paperCompilePdf: B, paperEditor: { type: 'string', enum: ['office', 'academician'] }, paperLatexCommand: S,
    provider: S, model: S, staffPersona: S, toolAllow: SA, toolDeny: SA, tempToolAllow: SA, tempToolDeny: SA,
  }), (s, a, x) => withOffice(s, x, 'tune institute parameters', () => s.setParams(a)))
  registerTool('vibe_v5_message', 'Relay a message from the office/human into the institute (to a member id, to "all", or to "voters").', objParams({ to: S, content: S }, ['to', 'content']), (s, a, x) => {
    // The relay is SIGNED as the office (`say('office', …)`), so only the PROVABLE session root may
    // send it. `memberIdOfAgent` answers '' for an unidentifiable descendant of the root (a nested
    // helper, a dismissed member's stale child) and for a synthetic context, and a member child is
    // not the office either — without this check ANY caller's text was delivered as the office
    // (audit L6 follow-up; the tool's own description says "from the office/human").
    const caller = s.officeCaller(x)
    if (!caller) return { ok: false, code: 'V5_MEMBER_NOT_FOUND', message: 'no calling member: relaying a message as the office needs the office (the session root)', next: { kind: 'member-call', tool: 'vibe_v5_members', hint: 'call this tool from a member subagent; the office (the session root) can read state with vibe_v5_report / vibe_v5_status' } }
    if (caller !== 'office') return { ok: false, code: 'V5_NOT_OFFICE', message: 'vibe_v5_message relays the OFFICE voice; a member speaks with vibe_v5_say' }
    const to = String(a.to || 'all')
    return s.say('office', { to, text: String(a.content), kind: to === 'all' || to === 'voters' ? 'office' : 'dm' })
  })
  registerTool('vibe_v5_meeting', 'Convene a meeting (office/academician) or propose one (any other member — relayed to the academician/office). Parked automatically while a verification is in flight. kind picks the meeting type: "sync" = routine coordination (default), "division" = split the work, "verify-request" = ask the group to verify an object, "solve-vote" = put "is the original problem solved?" to a vote; target names the object for verify-request/solve-vote. S12 (D7/GAPS 22) — MEETING LEVEL: `formal` meetings may write entity conclusions, `light` (routine sync/discussion: agenda + rounds + action items) may NOT. The level is DERIVED from `kind` (verify-request/solve-vote ⇒ formal; sync/division ⇒ light) and may be OVERRIDDEN by the academician with `formal_agenda:true` — either when convening or, while a meeting is already open, to CHANGE its level (same value is idempotent: deduped, no event; a real change writes an event and broadcasts). Setting the level is academician-only and never grantable; it never drives the meeting (no auto up/down-grade, no auto refusal to convene, no timer), and every …At/…Ms is rejected (the framework writes the times).', objParams({ agenda: S, kind: { type: 'string', enum: ['sync', 'division', 'verify-request', 'solve-vote'] }, target: S, formal_agenda: B }, ['agenda']), (s, a, x) => {
    const caller = s.officeCaller(x)
    if (!caller) return { ok: false, code: 'V5_MEMBER_NOT_FOUND', message: 'no calling member: only the office (the session root), the academician or a member may convene/propose a meeting', next: { kind: 'member-call', tool: 'vibe_v5_members', hint: 'call this tool from a member subagent; the office (the session root) can read state with vibe_v5_report / vibe_v5_status' } }
    // S12：会议**已在进行中**且只给 `formal_agenda` ⇒ 这是**改等级**（不是再开一场）。
    if (s.meetingOpen() && a.formal_agenda !== undefined && !a.agenda) return s.setMeetingLevel(caller, a)
    return s.startMeeting(caller, a)
  })
  registerTool('vibe_v5_members', 'List the institute roster (office, employer, phase, direction, rounds).', objParams({}), (s) => ({ ok: true, members: s.status().members, quorum: s.status().quorum }))
  registerTool('vibe_v5_hire', 'Hire one temp worker (office; the academician and every permanent researcher may also hire their own). Requires purpose and initial_task. term (optional) is the task deadline/period text the worker is told at onboarding; direction (optional) states what it should work on.', objParams({ purpose: S, initial_task: S, direction: S, term: S, to: S }, ['purpose', 'initial_task']), (s, a, x) => {
    const caller = a.to ? String(a.to) : s.officeCaller(x)
    if (!caller) return { ok: false, code: 'V5_MEMBER_NOT_FOUND', message: 'no calling member: only the office (the session root), the academician or a member may hire', next: { kind: 'member-call', tool: 'vibe_v5_members', hint: 'call this tool from a member subagent; the office (the session root) can read state with vibe_v5_report / vibe_v5_status' } }
    return s.hire(caller, a)
  })
  registerTool('vibe_v5_fire', 'Dismiss a temp worker for real: cancel its turn, release its resident child, reclaim its tasks, drop its mail, and mark it dismissed (its id is never reused).', objParams({ id: S, reason: S }, ['id']), (s, a, x) => {
    const caller = s.officeCaller(x)
    if (!caller) return { ok: false, code: 'V5_MEMBER_NOT_FOUND', message: 'no calling member: only the office (the session root), the academician or the employer may fire', next: { kind: 'member-call', tool: 'vibe_v5_members', hint: 'call this tool from a member subagent; the office (the session root) can read state with vibe_v5_report / vibe_v5_status' } }
    return s.fire(caller, a)
  })
  registerTool('vibe_v5_add_researcher', 'Office only: hire another PERMANENT researcher (members may only propose this).', objParams({ direction: S }), (s, a, x) => {
    const caller = s.officeCaller(x)
    if (!caller) return { ok: false, code: 'V5_MEMBER_NOT_FOUND', message: 'no calling member: adding a permanent researcher is the office\'s decision (the session root)', next: { kind: 'member-call', tool: 'vibe_v5_members', hint: 'call this tool from a member subagent; the office (the session root) can read state with vibe_v5_report / vibe_v5_status' } }
    return s.addResearcher(caller, a && a.direction)
  })
  // "Office only" (the tool's own description) must be ENFORCED, not just documented: the handler
  // used to call `removeResearcher` with no caller at all, so any member child — or an
  // unidentifiable descendant of the root — could dismiss a PERMANENT researcher (audit L6
  // follow-up; the academician can only PROPOSE additions/removals).
  registerTool('vibe_v5_remove_researcher', 'Office only: dismiss a PERMANENT researcher.', objParams({ id: S }, ['id']), (s, a, x) => withCaller(s, x, 'removing a permanent researcher', (caller) => (
    s.isOffice(caller)
      ? s.removeResearcher(a.id)
      : { ok: false, code: 'V5_NOT_OFFICE', message: 'only the office (the session root) may dismiss a permanent researcher' }
  )))
  // ── final paper (docs/final-paper.md) ─────────────────────────────────────
  registerTool('vibe_v5_paper', 'Final paper: start (or re-run) the team-authored paper for this run. The permanent staff write their own part, cross-review another member\'s part, and the editor named by paperEditor finalises. lang/format override paperLanguage/paperFormat for THIS paper; editor overrides paperEditor for THIS paper only (office = the manual path, which parks the flow until the office consults the institute and calls vibe_v5_finalize_paper); force rewrites an already-finalised paper (idempotent otherwise: it only fills artifacts that are missing).', objParams({ lang: S, format: S, editor: { type: 'string', enum: ['office', 'academician'] }, force: B, reason: S }), (s, a, x) => withOffice(s, x, 'write the final paper', () => {
    const lang = a.lang === undefined ? undefined : String(a.lang)
    const format = a.format === undefined ? undefined : String(a.format)
    if (lang !== undefined && lang !== 'zh' && lang !== 'en') return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'lang must be zh|en' }
    if (format !== undefined && ['both', 'md', 'tex'].indexOf(format) === -1) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'format must be both|md|tex' }
    if (a.editor !== undefined && ['office', 'academician'].indexOf(String(a.editor)) === -1) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'editor must be office|academician' }
    return s.startPaper(a.reason === 'run-complete' ? 'run-complete' : 'manual', { lang, format, editor: a.editor, force: a.force === true, reason: a.reason })
  }))
  registerTool('vibe_v5_finalize_paper', 'Office: finalise the final paper after consulting the whole institute. Required when paperEditor="office": at least one office message (vibe_v5_message) AND at least one meeting convened by the office must happen first (paper.meta.json records them, and the note must state the conclusion). decision="revise" asks for another writing round (bounded).', objParams({ decision: { type: 'string', enum: ['deliverable', 'revise'] }, note: S, conclusion: S, force: B }, ['decision']), (s, a, x) => withOffice(s, x, 'finalise the final paper', () => s.finalizePaperByOffice(a)))

  // ── member-facing controls ────────────────────────────────────────────────
  registerTool('vibe_v5_say', '(member) Speak in the group chat (omit "to"), send a private message ("to":"r-2"), or address only the voters ("to":"voters"). QUOTING (D6): quote_ref takes an anchor — a speech of the SAME meeting (`mt-<id>#speech-<who>-<n>`, resolved against the durable minutes file), an undelivered group message (`msg-N`, snapshotted at write time) or a poll aggregate (`ballot:<id>`); quote_excerpt optionally overrides the summary. The quote carries ONLY a <=200-char summary plus a stable pointer (the full text is never copied); at most quotesPerMessageMax (default 2) quotes per message, and a chain deeper than quoteDepthMax (default 3) is COLLAPSED to an anchor instead of being refused; cross-meeting quoting is refused (only the last resolution may be quoted across meetings and meeting_result_record #26 is not implemented yet); a dangling anchor is refused; a message that is already delivered is refused (its body is not retained); a PRIVATE message may not be quoted until its own sender supplements it publicly (supplement_of + why); a secret board can only be quoted as an aggregate. Nothing here drives the meeting.', objParams({ text: S, to: S, quote_ref: S, quote_refs: SA, quote_excerpt: S, supplement_of: S, why: S }, ['text']), (s, a, x) => {
    const from = s.memberIdOfAgent(x)
    if (!from) return s.memberDiagnosis('发言（vibe_v5_say）', from)
    // S8（R3/K12/B9）：**表决期禁止发言** —— 门在**成员发言入口**（系统/框架消息不经过这里，照常可达）；
    // S10（D6）：引用**随发言一起**被这道门覆盖（同一入口 ⇒ 无需第二道门）。
    const frozen = s.speechGate(from)
    if (frozen) return frozen
    return s.sayQuote(from, a)
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
  registerTool('vibe_v5_feedback', '(member) 工作经验／流程反馈库（Shared/Feedback/，方法论/协作层——不是研究结论）。op=add（写一条，需 category/route/phenomenon/impact/action；route=interpersonal 还必须带 assessment）| update（状态流转＋回填结果：id/status/outcome/note）| list（默认只看未闭环，可用 category/route 过滤，all:true 看全部）| summary（按类别/路由计数）。类别：cooperation 合作｜management 管理｜process 流程｜obstacle 障碍｜conflict 矛盾。路由：self 自己调整即可｜team 组织/工作流同样无需审批｜interpersonal 只有这条必须先评估、再事后回填验证。权限：成员/临时工可 add 且只能更新自己发起的条目；所办可更新任何条目。', objParams({ op: S, id: S, category: S, route: S, context: S, phenomenon: S, impact: S, action: S, assessment: S, outcome: S, status: S, note: S, all: B }, ['op']), (s, a, x) => withCaller(s, x, '使用反馈库', (caller) => s.feedbackTool(caller, a)))
  registerTool('vibe_v5_record_method', '(member) Record a theory/method/tool in your library. REQUIRES value, motive and p.', objParams({ id: S, title: S, type: S, content: S, notation: S, value: N, motive: S, p: N }, ['content', 'value', 'motive', 'p']), (s, a, x) => s.recordCard(s.memberIdOfAgent(x), 'method', a))
  registerTool('vibe_v5_record_subproblem', '(member) Record a sub-problem in your library. REQUIRES value, motive and p.', objParams({ id: S, title: S, statement: S, value: N, motive: S, p: N }, ['statement', 'value', 'motive', 'p']), (s, a, x) => s.recordCard(s.memberIdOfAgent(x), 'subproblem', a))
  registerTool('vibe_v5_read_library', '(member) Read anyone\'s library (read-only): their progress and recorded cards. Omit member to read everyone.', objParams({ member: S, kind: S, id: S }), (s, a) => s.readLibrary(a))
  registerTool('vibe_v5_propose_verify', '(member) Propose an object for consensus verification. Any member may propose; only voting members decide.', objParams({ target: S, kind: S, reason: S }, ['target']), (s, a, x) => withCaller(s, x, 'a verification proposal', (caller) => s.maybeQueueVerify(a.target, a.kind, caller, a.reason)))
  registerTool('vibe_v5_self_report', '(member) Update YOUR OWN self-report (G6): overall/subgoal/plan/status. Any roster member may read every member\'s work-status fields; private messages never enter this view. Times (…At/…Ms) are set by the framework and are rejected if supplied. Same-value resubmission is idempotent (deduped:true). Call with no field to READ the view (the read is audited).', objParams({ overall: {}, subgoal: {}, plan: {}, status: S, reason: S, source: S }), (s, a, x) => s.selfReportTool(s.memberIdOfAgent(x), a))
  registerTool('vibe_v5_chair_proxy', '(academician) #45 — appoint a PROXY for the chair (D1/R4/R5). Only the academician may call it (a non-academician is refused by name). scope accepts exactly one value, "close" (the proxy may only close the meeting); why is required. Any client-supplied …At/…Ms or until is refused (times are set by the framework). Same-value resubmission is idempotent (deduped:true) and does not refresh since. A proxy NEVER adds a vote: voters()/quorum are untouched and the chair is not weighted (R5).', objParams({ member: S, scope: S, why: S }), (s, a, x) => s.chairProxyTool(s.memberIdOfAgent(x), a))
  registerTool('vibe_v5_procedural_objection', '(member) #46 — raise a PROCEDURAL OBJECTION on the meeting in progress (D2, the relief channel for a chair ruling). Any roster member may raise one (attending/invited/temp workers are refused by name); why is required. The objection is filed durably with chairReply:null and chairReplyPending:true — the pending flag stays VISIBLE (a reply is never faked) — and only RECORDS: it changes no ballot, no stage and postpones no closure. Same-value resubmission is idempotent (deduped:true).', objParams({ why: S }), (s, a, x) => s.proceduralObjectionTool(s.memberIdOfAgent(x), a))
  registerTool('vibe_v5_grant', '(academician) #47 — TEMPORARY AUTHORIZATION (D1/D2/D6/D8): let one roster member run ONE enumerated command, only within an event scope. Grantable commands: assign | prioritize | nudge | convene. NEVER grantable (the criterion: a command guarded by an adjudication-level identity can never be delegated): end_verify (R10-2a is academician-only), the chair itself / proxy (D1; S4 vibe_v5_chair_proxy is the only entry), any ballot or representation of a member (R2/R3/D3/D8), the private/quoting face (D6), and authorization itself (no re-delegation). grant_scope is EVENT-typed: meeting (expires the moment this meeting closes) | verify (expires when this verification ends) | once (expires after one use). Times are set by the framework: any …At/…Ms (including expires_at) is refused. The grantee must be a roster member (attending/invited/temp ⇒ V5_NOT_VOTER, checked before anything is written). A grant NEVER adds vote power. Same-value re-grant while still active is idempotent (deduped:true).', objParams({ to: S, command: S, grant_scope: S, grantScope: S, why: S }), (s, a, x) => s.grantTool(s.memberIdOfAgent(x), a))
  registerTool('vibe_v5_revoke', '(academician) #48 — REVOKE a temporary authorization (D1). Pass grant_id (or to + command); why is required. The revocation WRITES AN EVENT AND IS BROADCAST (the spec requires it), and the revoked permission immediately falls back to the default permission table. Revoking an already-revoked/expired grant is idempotent (deduped:true).', objParams({ grant_id: S, to: S, command: S, why: S }), (s, a, x) => s.revokeTool(s.memberIdOfAgent(x), a))
  registerTool('vibe_v5_poll_open', '(academician) #49 — OPEN AN OPTION-TYPE POLL BOARD inside the meeting in progress (rulings §7.1: the six items the academician sets and that are visible BEFORE the vote opens): question; options[] (>=2, texts set by the academician); mode single|multi; max/min (multi only); min_votes REQUIRED — the threshold for THIS poll counting at all; it deliberately has NO default, because defaulting it to the quorum m would MIX the two thresholds (K13 forbids it); secret (default false = named; a secret board is still durably recorded as such); allow_abstain/allow_revote (default true). The two thresholds stay separate: min_votes = "does this poll count", quorum m = the closure gate. A board must be attached to a LIVE meeting (V5_NO_OPEN_MEETING). No times are accepted (any …At/…Ms, lower-case included, is refused: the framework writes times). Same-value board while one is still open is idempotent (deduped:true).', objParams({ question: S, options: SA, mode: S, max: I, min: I, min_votes: I, minVotes: I, secret: B, allow_abstain: B, allowAbstain: B, allow_revote: B, allowRevote: B }, ['question', 'options', 'min_votes']), (s, a, x) => s.pollOpenTool(s.memberIdOfAgent(x), a))
  registerTool('vibe_v5_poll_vote', '(member with a vote) #50 — VOTE on the open option-type poll board (SPEC #35; the explicit abstention of #37 rides on this tool). Params: ballot_id? (defaults to the open board), choices[] (option ids or exact texts; must satisfy the board min/max), abstain:true (an EXPLICIT abstention: counted as having voted, NEVER as an option — the same semantics as the verify ballot), note/reason. A non-voter (attending/invited/temp) is refused BY NAME with V5_NOT_VOTER: vote power can NEVER be delegated (H12/R36). Revoting is allowed until closure when the board allows it (revotedAt is recorded); after closure it is refused (only a review/reconsideration can follow). Same-value resubmission is idempotent (deduped:true).', objParams({ ballot_id: S, ballotId: S, choices: SA, abstain: B, note: S, reason: S }), (s, a, x) => s.pollVoteTool(s.memberIdOfAgent(x), a))
  registerTool('vibe_v5_poll_close', '(academician) #51 — CLOSE AND TALLY the poll board and broadcast the result (SPEC #25/K4). Params: ballot_id? (defaults to the open board), reason?. The poll counts ONLY IF cast >= min_votes (settled:false / outcome:"unsettled" otherwise — the remaining votes are never used to infer a conclusion); the quorum m (closure gate) is computed SEPARATELY and reported NEXT TO it. The unvoted are named publicly. Closure is an EXPLICIT academician action: nothing closes "on time" (no automatic settlement anywhere). Repeated closure is idempotent (deduped:true).', objParams({ ballot_id: S, ballotId: S, reason: S }), (s, a, x) => s.pollCloseTool(s.memberIdOfAgent(x), a))
  registerTool('vibe_v5_reconsider', '(participant) #52 — REQUEST A RECONSIDERATION of an already-closed verdict (D5/D5a; the "review" that SPEC #19 and the poll board\'s "after closure only a reconsideration can follow" both point at). Params: target (required; the closed object), why (required; the reason is archived), evidence? (must come from the same object/meeting — D6). ELIGIBILITY IS DERIVED FROM THE RECORD, never from a role: with a clear winner only one of the ORIGINAL WINNERS may ask; with NO winner (undecided / mean-only) ANY participant may ask and the request may NOT be refused for "having no winner" (D5a hard constraint). The threshold can only RISE: after = max(before, reconsiderFloor, quorumCap) (U3) and the raise is recorded (thresholdBefore/After, raisedBy). One reconsideration per round; the total rounds stay bounded by verdictMaxRounds. The old conclusion, the old ballot and the old minority are all preserved (append-only) and the old conclusion is marked supersededBy. No vote power is created and the denominator never changes. No time may be supplied: every …At/…Ms is rejected (the framework writes the times) and nothing ever happens "on time".', objParams({ target: S, target_id: S, why: S, evidence: S }, ['why']), (s, a, x) => s.reconsiderTool(s.memberIdOfAgent(x), a))
  registerTool('vibe_v5_secretary', '(academician) #53 — APPOINT or REVOKE the meeting secretary (GAPS 29: keeping the record OUT of the chair\'s hands). Params: who (required; an ACTIVE MEMBER — a temp worker is refused with V5_NOT_VOTER), why?, revoke:true (or op:"revoke") to revoke. The academician may NOT appoint itself or the office ("主持人不得兼任唯一记录者"): the chair must never be the only recorder. The appointment is BOUND TO THE CURRENT MEETING and lapses when that meeting closes (the same unit as U5). The ledger `secretaries[]` is append-only (the same value is idempotent: deduped:true, no new entry; a change of person records revokedAt). A secretary gets RECORD rights only: no vote power, no phase change, no denominator change (C5/R5). No time may be supplied: every …At/…Ms is rejected (the framework writes the times).', objParams({ who: S, member: S, why: S, revoke: B, op: S }, ['who']), (s, a, x) => s.secretaryTool(s.memberIdOfAgent(x), a))
  registerTool('vibe_v5_minutes', '(academician or the current secretary) #54 — RECORD a NAMED entry in the minutes (agenda point / motion / tally / resolution / action item), or (with no `entry`) REPORT THE GAPS only. Params: entry? (the named text; engine-written `at` + `by`), detail? (brief|normal|empty = report gaps), agenda_item?. Only the academician or THIS meeting\'s secretary may write (any other member is refused by name). Appends ONLY — it never rewrites the `### <who>` speech sections (the S10 in-meeting anchors depend on them) nor the two zones (S8 发言区/投票区); it never deletes an objection note (S4) and NEVER auto-completes a gap (R7). The same entry is idempotent (deduped:true). Entries land in the durable minutes file as a separate `## 记录人补充` section AFTER the two zones, and in the structured `minutes{}` (secretary + entries). No time may be supplied: every …At/…Ms is rejected.', objParams({ entry: S, text: S, detail: S, agenda_item: S }), (s, a, x) => s.minutesTool(s.memberIdOfAgent(x), a))
  registerTool('vibe_v5_verdict', '(member) Cast your boolean verdict on the object under verification. verdict is [0,1]: exactly 1 = assert true, exactly 0 = assert false, anything in between = an UNCERTAIN estimate (a probability; not an explicit abstention). The word abstain (弃权) is an EXPLICIT abstention: counted as answered, never as an option. The word unable (无法判断) declares you cannot judge: it takes you out of this verification denominator (D3) while keeping you on the roster list. Silence is neither consent nor opposition, and it BLOCKS the conclusion.', objParams({ target: S, verdict: {}, reason: S }, ['verdict']), (s, a, x) => s.castVerdict(s.memberIdOfAgent(x), a.target, a.verdict, a.reason))
  registerTool('vibe_v5_end_verify', '(academician) Explicitly END the debate on the object under verification (R10-2a), so the aggregation may run. Named and auditable (endedBy=academician). It cannot bypass the participation gate: an unanswered member still blocks the conclusion.', objParams({ target: S, reason: S }), (s, a, x) => s.endVerify(s.memberIdOfAgent(x), a.target, a.reason))
  registerTool('vibe_v5_task_create', '(member) Open a task on the shared board (subject, description, optional blockers, advisory write scopes, priority).', objParams({ subject: S, description: S, blocked_by: SA, write_scopes: SA, priority: I }, ['subject']), (s, a, x) => withCaller(s, x, 'creating a task', (caller) => s.taskCreate(caller, a)))
  registerTool('vibe_v5_task_list', '(member) List shared tasks with readiness, owner, revision, blockers and write-scope warnings.', objParams({ status: S, owner: S, ready: B }), (s, a) => ({ ok: true, tasks: s.taskList(a) }))
  registerTool('vibe_v5_task_get', '(member) Read one task\'s latest value BEFORE changing it (the revision is the CAS precondition).', objParams({ task_id: S }, ['task_id']), (s, a) => ({ ok: true, task: s.getTask(a.task_id) }))
  registerTool('vibe_v5_task_update', '(member) Compare-and-set a task action: claim|release|edit|set_dependencies|complete|reopen|reassign|delete. Pass expected_revision from task_get/task_list; a stale revision is refused.', objParams({ task_id: S, expected_revision: I, action: S, subject: S, description: S, blocked_by: SA, write_scopes: SA, owner: S }, ['task_id', 'expected_revision', 'action']), (s, a, x) => withCaller(s, x, 'a task mutation', (caller) => s.taskUpdate(caller, a)))

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
    // The academician supervises progress; in a formalization mode "which objects still lack
    // a Lean result" is exactly the kind of bottleneck it must see to organise the work.
    if (s.formalOn()) {
      parts.push('## Lean 形式化（' + s.formalMode() + '）')
      const recs = s.formalRecords()
      const keys = Object.keys(recs)
      if (!keys.length) parts.push('- 尚无对象被形式化')
      for (const k of keys) {
        const r = recs[k] || {}
        parts.push('- ' + k + '｜' + (r.status || 'none') + (r.proof ? '｜' + r.proof : '') + (r.note ? '｜' + r.note : ''))
      }
      const todo = s.formalTodo()
      if (todo.length) parts.push('- 形式化待办（定论被搁置）：' + todo.map((t) => t.id).join('、') + '（见 Formal/TODO.md）')
      parts.push('- 可复用库：vibe_v5_lean_lib 可列出 Formal/Lib 与 Formal/Proved')
    }
    // Methodology/collaboration feedback: the academician's periodic summary needs the SAME numbers the
    // report shows, so "what did we learn about working together" is one glance away (and open
    // interpersonal entries — the only route that needs a written-back verification — are named).
    parts.push('## 反馈库（方法论／协作层）')
    {
      const fc = s.feedbackCounts()
      parts.push('- 条目 ' + fc.total + '｜未闭环 ' + fc.open + '｜已闭环 ' + fc.closed
        + '｜按类别：' + Object.keys(fc.byCategory).map((k) => k + '=' + fc.byCategory[k]).join('、')
        + '｜按路由：' + Object.keys(fc.byRoute).map((k) => k + '=' + fc.byRoute[k]).join('、'))
      parts.push(s.feedbackOn()
        ? '- 未闭环明细用 vibe_v5_feedback {op:\'list\'}；interpersonal 条目必须回填 outcome 才算闭环'
        : '- 反馈开关：off（提示词不注入该段；写入请求会被具名拒绝）')
    }
    parts.push('## 停滞提示')
    const idleFor = Date.now() - st.lastProgressAt
    parts.push('- 距上次实质进展：' + Math.round(idleFor / 1000) + ' 秒')
    // S5 (R1/D10): the ONE notice already sent in this stall episode + who is waiting for whom.
    // The framework states the fact and RECOMMENDS; it never convenes/closes/advances on its own.
    {
      const sn = s.stallNoticeView()
      if (sn && Number(sn.sinceAt) > 0) {
        parts.push('- 本片段已提示一次：' + fmtTime(sn.at) + '｜谁在等谁：'
          + (Array.isArray(sn.waiting) && sn.waiting.length ? sn.waiting.join('；') : '（无明确等待项）'))
      } else {
        parts.push('- 本片段尚未提示（框架不自动开会/不自动收束；是否推进由院士与成员决定）')
      }
    }
    // S6 (D1/D2/D6/D8): the temporary-authorization ledger — read-only; grants never add vote power.
    {
      const gs = s.grantsView()
      const live = gs.filter((g) => g.active)
      parts.push('## 临时授权（' + live.length + ' 条生效／' + gs.length + ' 条台账；可授：assign／prioritize／nudge／convene）')
      for (const g of live) parts.push('- ' + g.id + '｜' + g.to + '｜`' + g.command + '`｜' + g.grantScope + '｜至 ' + g.expiresOn)
      if (!live.length) parts.push('- （当前没有生效中的授权）')
    }
    // S7 (D3/D4/R9/K13): the poll board — the two thresholds side by side (min_votes vs quorum m);
    // a secret board exposes the tally only, never who chose what.
    {
      const b = s.ballotView(s.openBallot())
      parts.push('## 投票板' + (b ? '' : '（无进行中的板）'))
      if (b) {
        parts.push('- ' + b.question + '｜已投 ' + b.cast + '／' + s.voterCount()
          + '｜**最少收集票 ' + b.rules.minVotes + '**：' + (b.min_votes_reached ? '成立' : '未成立')
          + '｜**法定人数 m＝' + b.m + '**：' + (b.quorum_reached ? '已解除阻塞' : '仍阻塞')
          + '｜' + (b.secret ? '不记名' : '记名'))
      }
    }
    return { ok: true, overview: parts.join('\n') }
  })
  registerTool('vibe_v5_assign', '(office, or the academician when academicianLeads) ASSIGN work: create or pick a task and give it to a specific member (including temp workers), stating WHY and the acceptance criteria. The assignee executes by default and may object with reasons (which are broadcast).', objParams({ task_id: S, subject: S, description: S, to: S, why: S, acceptance: S, priority: I, write_scopes: SA }, ['to', 'why', 'acceptance']), (s, a, x) => withCaller(s, x, 'an assignment', (caller) => s.taskAssign(caller, a)))
  registerTool('vibe_v5_prioritize', '(office, or the academician when academicianLeads) Set institute-wide priorities: an ordered list of {task_id, priority} plus WHY. This orders work only — it never changes what is true.', objParams({ order: { type: 'array', items: { type: 'object' } }, why: S }), (s, a, x) => withCaller(s, x, 'setting priorities', (caller) => s.taskPrioritize(caller, a)))
  registerTool('vibe_v5_nudge', '(office, or the academician when academicianLeads) Supervise: wake one member with a stated reason and a concrete suggested next step. Prefer a specific next step over a bare "hurry up".', objParams({ to: S, why: S, next_step: S }, ['to', 'why']), (s, a, x) => withCaller(s, x, 'a nudge', (caller) => s.nudge(caller, a)))

  // ── Lean formal verification (docs/formal-verification.md) ────────────────
  // These three tools are registered UNCONDITIONALLY: tool registration is static (a
  // dynamic registration would depend on a runtime knob and break the effect discipline),
  // while the MODE only decides whether the framework TELLS members about them. In 'off'
  // mode they still work if a human or agent calls them deliberately.
  registerTool('vibe_v5_lean_run', '(member) Execute the Lean toolchain on one .lean file inside the workspace and report the result. Parameters: file (required; `Formal/x.lean` or the full CWD-relative path — both name the same file), target (optional object id to record the run against), timeout_ms (optional per-run budget). There is NO run/run=false switch here — run-vs-archive are separate tools; use vibe_v5_lean_archive {run:false} to archive WITHOUT compiling. With leanAsync (default true) the compile is ENQUEUED and this returns immediately with async:{jobId,state} — nothing is compiled yet; the result is durable at Formal/Jobs/<jobId>.json (vibe_v5_lean_job {jobId} reads it), is listed by vibe_v5_lean_lib.jobs, and the initiator also gets ONE 【形式化结果】 announcement in its next round. With leanAsync=false it blocks and returns the compiler output (exitCode/stdout/stderr). Never throws: a host with no subprocess service returns NO_SUBPROCESS and a missing toolchain returns LEAN_NOT_FOUND (in both cases the code can still be written down with vibe_v5_lean_archive), a timeout terminates the process and returns LEAN_TIMEOUT. The framework appends `-R <VibeMath root>` before the file name (unless leanArgs already sets a search root).', objParams({ file: S, target: S, timeout_ms: I }, ['file']), (s, a, x) => withCaller(s, x, 'a Lean run', (caller) => s.leanRunTool(caller, a)))
  registerTool('vibe_v5_lean_archive', '(member) Archive Lean code. kind="def": a REUSABLE definition/object/assumption → the global cross-project library (Formal/Lib). kind="lemma": a machine-checked lemma → Formal/Proved. kind="proof": the formal proof of a project object → Formal/<target>.lean, and (only once the queued compile settles ok) also Verified/Lean/<target>.lean, marking the object Lean-passed. Re-archiving IDENTICAL content is de-duplicated (deduped:true, no rewrite/recompile). kind="blocked": record an explicit, reasoned "cannot/not worth formalizing" decision (note required). Optional `run` (default true): whether to COMPILE after writing — `run:false` archives the text only (useful when this host has no toolchain; the object then stays `attempted`/unset until something compiles it).', objParams({ kind: { type: 'string', enum: ['def', 'lemma', 'proof', 'blocked'] }, name: S, target: S, content: S, from: S, note: S, run: B }, ['kind']), (s, a, x) => withCaller(s, x, 'a Lean archive', (caller) => s.leanArchive(caller, a)))
  registerTool('vibe_v5_lean_lib', '(member) List (and by default rebuild) the Lean reuse library: your institute\'s Formal/Index.md (with an import-dependency column), plus the global cross-project Formal/Lib and Formal/Proved indexes, the background-compile jobs (jobs) and the injected search path (paths.searchPath). Look here BEFORE writing a new definition so you reuse instead of redefining.', objParams({ refresh: B }), async (s, a) => {
    const r = a && a.refresh === false ? { lib: null, proved: null, objects: Object.keys(s.formalRecords()).length } : await s.rebuildLeanLibIndexes()
    const st = s.status()
    return {
      ok: true, mode: s.formalMode(), rebuilt: !(a && a.refresh === false),
      counts: r, todo: s.formalTodo(), jobs: s.leanJobsView(),
      objects: Object.keys(s.formalRecords()).map((k) => ({ target: k, status: (s.formalRecords()[k] || {}).status, decision: (s.formalRecords()[k] || {}).decision || '', decisionSource: (s.formalRecords()[k] || {}).decisionSource || '', fidelity: (s.formalRecords()[k] || {}).fidelity || null, abstainedCount: Number(((s.formalRecords()[k] || {}).fidelity || {}).abstainedCount || 0), file: (s.formalRecords()[k] || {}).file, proof: (s.formalRecords()[k] || {}).proof, note: (s.formalRecords()[k] || {}).note, async: (s.formalRecords()[k] || {}).async || null })),
      // L1/L5/L6 (deep-review 5): ONE basis for every entry (cwd-relative, i.e. what a member's own
      // file tools resolve), an explicit `toolShortForm` for the institute-relative spelling the
      // tools also accept, and the bare `Lib/` hint replaced by the real library root.
      paths: {
        basis: 'all paths below are relative to the SESSION CWD (what your own file tools use)',
        project: s.instRel('Formal') + '/', toolShortForm: 'Formal/',
        lib: 'VibeMath/Formal/Lib/', proved: 'VibeMath/Formal/Proved/',
        proofs: s.instRel('Verified/Lean') + '/', searchPath: s.leanSearchRootView(),
      },
      hint: '复用优先：先在 ' + s.instRel('Formal/Lib') + '/ 里找现成定义（vibe_v5_lean_read {name} 取原文）；'
        + '新定义用 vibe_v5_lean_archive kind=\'def\' 归档，已证引理用 kind=\'lemma\'。'
        + '复用已归档内容：import Formal.Lib.<name> / import Formal.Proved.<name>。同内容重复归档会自动去重。',
      verify: st.verify ? st.verify.target : null,
    }
  })
  // Read-only: the EXACT text of an archived definition/lemma (docs/formal-verification.md §5.4).
  // Only <VibeMath root>/Formal/{Lib,Proved}/<name>.lean is reachable; a path-shaped name is
  // refused (never sanitised into a different file).
  registerTool('vibe_v5_lean_read', '(member) Read one archived Lean file VERBATIM so it can be reused: name is the archived file name (no extension needed), kind is "auto" (Lib then Proved, default), "lib" or "proved". Returns {ok,name,file,kind,sha256,bytes,text,truncated} (text capped at 64KB). Only the global reusable library is reachable.', objParams({ name: S, kind: { type: 'string', enum: ['auto', 'lib', 'proved'] } }, ['name']), (s, a) => s.leanRead(a))
  // Wait/observe the background compile queue (docs/formal-verification.md §7: no polling tool
  // for the member's own turn — `waitMs` is a bounded internal wait, and the state is returned
  // either way, so a member can also just check and continue).
  registerTool('vibe_v5_lean_job', '(member) Inspect the background Lean compile queue. With no jobId it lists this session\'s jobs ({jobs,count,running,maxParallel}); with jobId it returns that job\'s state/exitCode, its receipt Formal/Jobs/<jobId>.json and, when it passed, the archived proof path. waitMs>0 waits up to that many milliseconds for a queued/running job to settle (it polls the queue instead of blocking the heartbeat) and otherwise returns the CURRENT state.', objParams({ jobId: S, waitMs: I }), (s, a) => s.leanJobTool(a))

  // ── /v5 slash command ────────────────────────────────────────────────────
  ctx.effect(() => commands.register({
    name: 'v5', description: 'control the Vibe Math V5 research institute',
    input: { hint: '[configure <研究所名> <问题…>|start|resume|pause|stop|status|report|members|message <收件人|all> <正文…>|meeting <议程…>|hire <用途> <初始任务…>|fire <成员id> [理由…]|add [方向…]|remove <成员id>|set <键>=<值> …|paper [lang=zh|en] [format=both|md|tex] [editor=office|academician] [force]]' },
    handler: async function (inv) {
      const s = getSession(inv && inv.agent)
      if (!s) return { kind: 'error', text: JSON.stringify({ ok: false, error: 'no session' }) }
      await s.ready()
      // The `/v5` line is the OFFICE/human control surface (README: the institute-office row) and
      // EVERY subcommand below acts AS the office (`say('office', …)`, `hire('office', …)`,
      // `removeResearcher`, `setParams`, `initStop` …). It used to accept ANY caller whose session
      // maps to the institute — a member child maps to the same office session — so the caller is
      // resolved here too and refused unless it is the PROVABLE session root (audit L6 follow-up:
      // the command surface had no caller check at all). Read-only subcommands are gated with the
      // rest: a member reads state with vibe_v5_status / vibe_v5_report / vibe_v5_members.
      const caller = s.officeCaller(inv && inv.agent)
      if (caller !== 'office') {
        const refused = { ok: false, code: 'V5_NOT_OFFICE', message: 'the /v5 control line belongs to the office (the session root); members use the vibe_v5_* tools' }
        return { kind: 'error', text: JSON.stringify(refused, null, 2) }
      }
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
      // C3 (deep-review 4): `/v5 hire X` used to FABRICATE `initial_task` from the purpose, while
      // the tool path requires both (`hire 必须写明 purpose/initial_task`). The CLI now requires
      // both too, so the member can never receive a meaningless initial task behind an `ok:true`.
      else if (cmd === 'hire') {
        if (!rest.length || !rest.slice(1).join(' ').trim()) {
          r = {
            ok: false, code: 'V5_INVALID_ARGUMENT',
            message: '用法：/v5 hire <用途 purpose> <初始任务 initial_task…>（两者都必填，与 vibe_v5_hire 一致）。'
              + '例如：/v5 hire 验算大整数分解的边界情形 用 30 分钟写出 50 位以内合数的试除脚本并归档回执。',
          }
        } else {
          r = await s.hire('office', { purpose: rest[0], initial_task: rest.slice(1).join(' ') })
        }
      }
      else if (cmd === 'fire') r = await s.fire('office', { id: rest[0] || '', reason: rest.slice(1).join(' ') })
      else if (cmd === 'add') r = await s.addResearcher('office', rest.join(' '))
      else if (cmd === 'remove') r = await s.removeResearcher(rest[0] || '')
      else if (cmd === 'paper') {
        // `/v5 paper [lang=en] [format=tex] [force] [editor=office|academician]`
        const o = {}
        let force = false
        let bad = ''
        for (const tok of rest) {
          if (tok === 'force') { force = true; continue }
          const eq = tok.indexOf('=')
          if (eq <= 0) { bad = 'unknown paper argument: ' + tok; break }
          const k = tok.slice(0, eq), v = tok.slice(eq + 1)
          if (k === 'lang' || k === 'format' || k === 'editor') o[k] = v
          else { bad = 'unknown paper option: ' + k + ' (use lang=zh|en format=both|md|tex editor=office|academician force)'; break }
        }
        if (!bad && o.lang !== undefined && o.lang !== 'zh' && o.lang !== 'en') bad = 'lang must be zh|en'
        if (!bad && o.format !== undefined && ['both', 'md', 'tex'].indexOf(o.format) === -1) bad = 'format must be both|md|tex'
        if (!bad && o.editor !== undefined && ['office', 'academician'].indexOf(o.editor) === -1) bad = 'editor must be office|academician'
        if (bad) return { kind: 'error', text: JSON.stringify({ ok: false, code: 'V5_INVALID_ARGUMENT', message: bad }, null, 2) }
        // `editor=office` is the manual path that uses the office as the finalising
        // representative (docs/final-paper.md §7 — never reachable from an automatic run). One-shot: it
        // does not rewrite the persisted `paperEditor`.
        r = await s.startPaper('manual', { lang: o.lang, format: o.format, editor: o.editor, force })
      } else if (cmd === 'set') {
        const upd = {}
        // C2 (deep-review 4): a token WITHOUT `=` used to be skipped silently, so
        // `/v5 set mathMode typed` answered `ok:true` and changed NOTHING. Every malformed token
        // is now refused with the accepted shape, instead of a success that lies.
        const badTokens = []
        for (const tok of rest) {
          const eq = tok.indexOf('=')
          if (eq <= 0) { badTokens.push(tok); continue }
          const k = tok.slice(0, eq), v = tok.slice(eq + 1)
          const n = Number(v)
          upd[k] = Number.isFinite(n) && v !== '' ? n : (v === 'true' ? true : v === 'false' ? false : v)
        }
        if (badTokens.length) {
          r = {
            ok: false, code: 'V5_INVALID_ARGUMENT',
            message: '这些参数缺少 "="（未被解析）：' + badTokens.join('、') + '。正确写法：/v5 set <键>=<值> …（例如 mathMode=typed quorumCap=3 formalVerify=require）',
          }
        } else if (!Object.keys(upd).length) {
          r = {
            ok: false, code: 'V5_INVALID_ARGUMENT',
            message: '/v5 set 需要至少一个 <键>=<值>（例如 mathMode=typed）。可用键见 vibe_v5_set 的描述与 /v5 status 的 params。',
          }
        } else {
          r = await s.setParams(upd)
        }
      } else r = { ok: false, usage: 'configure <研究所名> <问题…>|start|resume|pause|stop|status|report|members|message <收件人|all> <正文…>|meeting <议程…>|hire <用途> <初始任务…>|fire <成员id> [理由…]|add [方向…]|remove <成员id>|set <键>=<值> …|paper [lang=zh|en] [format=both|md|tex] [editor=office|academician] [force]' }
      // A business failure (the dispatch result's own ok:false) is a FAILED command: the host's
      // CommandResult union distinguishes success from error, and returning 'success' made a rejected
      // invocation look identical to a successful one (same fix as v2/v3).
      const failed = r !== null && typeof r === 'object' && r.ok === false
      return { kind: failed ? 'error' : 'success', text: JSON.stringify(r, null, 2) }
    },
  }))

  // ── institute state on disk ──────────────────────────────────────────────
  // State/<institute>.v5state.json is written by the file backend above (installBackend); it is the
  // only durable authority. The host's session projections are deliberately NOT used: DSH refuses to
  // load a session whose log carries event types outside its known set, so writing institute events
  // into the user's session made that session unresumable.

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
        console.error('vibe-math-v5r: end handler: ' + String((e && e.stack) || e))
        // Last line of defence: an exceptional turn must never leave the institute with
        // no end-event and no heartbeat to continue it (v4 §30).
        s.kick()
      })
      .finally(() => s.forgetAgent(info.id))
  })
}

const now = () => Date.now()

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
  clamp01,
  clPct,
  posMs,
  blocksToText,
  fmtTime,
  idSafe,
  slugify,
  tryJson,
  parseReply,
  sanitizeToolFilter,
  registeredToolsFromError,
  sha256Hex,
  leanHashText,
  leanHasSearchFlag,
}

function clamp01(v) { const n = Number(v); if (!Number.isFinite(n)) return 0.5; return Math.max(0, Math.min(1, n)) }

function clPct(x) { const n = Number(x); if (!Number.isFinite(n)) return 0; return Math.max(0, Math.min(100, n)) }

function posMs(v, def) { const n = Number(v); return (Number.isFinite(n) && n > 0) ? n : (def || 120000) }

function blocksToText(b) { if (!b) return ''; let o = ''; for (const x of b) { if (x && x.type === 'text' && typeof x.text === 'string') o += x.text + '\n' } return o }

function fmtTime(ts) { try { return new Date(ts || now()).toISOString().replace('T', ' ').slice(0, 19) } catch (e) { return String(ts || '') } }

function idSafe(s) {
  const t = String(s == null ? '' : s).trim().replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').replace(/-{2,}/g, '-').replace(/^[.\-]+|[.\-]+$/g, '')
  return t
}

function slugify(s) {
  const t = String(s == null ? '' : s).trim().toLowerCase().replace(/[^a-z0-9_\-\u4e00-\u9fa5]+/g, '-').replace(/^-+|-+$/g, '')
  return t || ''
}

// Explicit parameter coercion (docs/final-paper.md §2). A boolean parameter spelled `'false'`, `0`, `'no'`
// or `'off'` must be false — the old `=== true || === 'true'` silently treated `1`/`'yes'` as
// false. An unrecognised spelling is REJECTED (the caller's default wins), never guessed.
function coerceBool(v, def) {
  if (v === undefined) return def
  if (v === true || v === 1 || v === '1') return true
  if (v === false || v === 0 || v === '0') return false
  const t = String(v).trim().toLowerCase()
  if (['true', 'yes', 'on', 'y', 't'].indexOf(t) !== -1) return true
  if (['false', 'no', 'off', 'n', 'f', ''].indexOf(t) !== -1) return false
  return def
}

// Enum coercion with legacy aliases (.v5 / older flat spellings) and a documented fallback.
const ENUM_ALIASES = {
  paperFormat: { markdown: 'md', latex: 'tex', texonly: 'tex', all: 'both' },
  paperLanguage: { cn: 'zh', chinese: 'zh', 'zh-cn': 'zh', english: 'en', 'en-us': 'en' },
  paperEditor: { root: 'office', host: 'office', acad: 'academician', dean: 'academician' },
}
function coercePaperEnum(key, v, allowed, def) {
  const t = String(v == null ? '' : v).trim().toLowerCase()
  if (allowed.indexOf(t) !== -1) return t
  const alias = (ENUM_ALIASES[key] || {})[t]
  return alias !== undefined && allowed.indexOf(alias) !== -1 ? alias : def
}

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

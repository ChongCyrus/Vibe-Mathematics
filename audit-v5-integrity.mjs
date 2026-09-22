// ============================================================
// V5 INTEGRITY AUDIT — static self-check of vibe-math-v5.js against the ways this
// kind of single-file plugin actually breaks:
//   1. a function CALLED but never defined (ReferenceError at runtime only)
//   2. a `params.X` read for a key that DEFAULT_PARAMS never declares (silent undefined)
//   3. a tool handler calling `s.NAME(...)` on the session API object that the session
//      never returns (TypeError only when that tool is used)
//   4. documented error codes that are never raised, and raised codes never documented
//   5. leftover development markers / TODO scaffolding
// Run: node audit-v5-integrity.mjs   (exit 1 on any finding)
// ============================================================
import { readFileSync, existsSync } from 'node:fs'

const FILE = new URL('./vibe-math-v5/vibe-math-v5.js', import.meta.url)
const raw = readFileSync(FILE, 'utf8')
// Strip comments and string literals before any identifier scan. Without this the
// heuristic matches English words inside comments that merely precede a '(' (e.g.
// "// per unit (" becomes a phantom call to unit()), drowning the real findings.
function stripNoise(s) {
  let out = ''
  let i = 0
  const n = s.length
  while (i < n) {
    const c = s[i], c2 = s[i + 1]
    if (c === '/' && c2 === '/') { while (i < n && s[i] !== '\n') i++; continue }
    if (c === '/' && c2 === '*') { i += 2; while (i < n && !(s[i] === '*' && s[i + 1] === '/')) i++; i += 2; continue }
    if (c === "'" || c === '"' || c === '`') {
      const q = c
      i++
      while (i < n) {
        if (s[i] === '\\') { i += 2; continue }
        if (s[i] === q) { i++; break }
        if (q !== '`' && s[i] === '\n') break
        i++
      }
      out += q + q   // keep a placeholder so `X: ''` shape survives
      continue
    }
    out += c
    i++
  }
  return out
}
const src = stripNoise(raw)
const findings = []
const notes = []

const lineOf = (idx) => src.slice(0, idx).split('\n').length

// ---- 1. called-but-undefined -------------------------------------------
const defined = new Set()
for (const m of src.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)) defined.add(m[1])
for (const m of src.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g)) defined.add(m[1])
for (const m of src.matchAll(/(?:const|let|var)\s+\{([^}]+)\}\s*=/g)) {
  for (const part of m[1].split(',')) { const n = part.split(':').pop().trim(); if (n) defined.add(n) }
}
for (const m of src.matchAll(/catch\s*\(\s*([A-Za-z_$][\w$]*)\s*\)/g)) defined.add(m[1])
// Function/method PARAMETERS are locally bound identifiers too, not free calls.
for (const m of src.matchAll(/function\s*[A-Za-z_$]*\s*\(([^)]*)\)/g)) {
  for (const raw of m[1].split(',')) {
    const name = raw.trim().replace(/[={].*$/s, '').trim()
    if (/^[A-Za-z_$][\w$]*$/.test(name)) defined.add(name)
  }
}
for (const m of src.matchAll(/\(([^()]*)\)\s*=>/g)) {
  for (const raw of m[1].split(',')) {
    const name = raw.trim().replace(/[={].*$/s, '').trim()
    if (/^[A-Za-z_$][\w$]*$/.test(name)) defined.add(name)
  }
}
for (const m of src.matchAll(/([A-Za-z_$][\w$]*)\s*=>/g)) defined.add(m[1])
// JS/DSH globals that are legitimately free
const GLOBALS = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'function', 'new', 'await', 'delete', 'void', 'do', 'else', 'try',
  'Array', 'Object', 'JSON', 'Number', 'String', 'Boolean', 'Math', 'Date', 'Promise', 'Set', 'Map', 'WeakRef', 'WeakMap', 'Symbol', 'Error',
  'isFinite', 'isNaN', 'parseInt', 'parseFloat', 'encodeURIComponent', 'decodeURIComponent', 'structuredClone',
  'AbortSignal', 'console', 'require', 'import', 'super', 'this', 'of', 'in', 'instanceof',
  'RegExp', 'Proxy', 'Reflect', 'AggregateError', 'TextEncoder', 'TextDecoder', 'URL', 'BigInt', 'Intl', 'Buffer', 'process',
])
const LOCAL_METHODS = new Set()
for (const m of src.matchAll(/[{,]\s*([A-Za-z_$][\w$]*)\s*[:(]/g)) LOCAL_METHODS.add(m[1])
for (const m of src.matchAll(/\.\s*([A-Za-z_$][\w$]*)\s*\(/g)) LOCAL_METHODS.add(m[1])

const called = new Map()
for (const m of src.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) {
  const name = m[1]
  if (GLOBALS.has(name) || LOCAL_METHODS.has(name)) continue
  if (!called.has(name)) called.set(name, { n: 0, line: lineOf(m.index) })
  called.get(name).n++
}
for (const [name, info] of called) {
  if (!defined.has(name)) findings.push('line ' + info.line + ': called but never defined: ' + name + '()  (' + info.n + ' call site(s))')
}

// ---- 2. params keys ----------------------------------------------------
const dpBlock = /const DEFAULT_PARAMS = \{([\s\S]*?)\n    \}/.exec(src)
if (!dpBlock) findings.push('could not locate DEFAULT_PARAMS')
else {
  const declared = new Set()
  for (const m of dpBlock[1].matchAll(/^\s*([A-Za-z_$][\w$]*)\s*:/gm)) declared.add(m[1])
  const used = new Map()
  for (const m of src.matchAll(/\bparams\.([A-Za-z_$][\w$]*)/g)) used.set(m[1], (used.get(m[1]) || 0) + 1)
  for (const [k, n] of used) {
    if (!declared.has(k)) findings.push('params.' + k + ' read but not declared in DEFAULT_PARAMS (' + n + ' use(s))')
  }
  notes.push('DEFAULT_PARAMS keys: ' + declared.size + '; params.* reads: ' + used.size)
}

// ---- 3. session-API surface used by tool handlers -----------------------
// The returned API object is the last `return { ... }` inside makeSession.
const apiStart = src.lastIndexOf('    return {\n      sessionId,')
if (apiStart === -1) findings.push('could not locate the session API return object')
else {
  const apiEnd = src.indexOf('\n    }\n  }', apiStart)
  const apiText = src.slice(apiStart, apiEnd === -1 ? apiStart + 4000 : apiEnd)
  const apiKeys = new Set()
  for (const m of apiText.matchAll(/(?:^|[\s{,])([A-Za-z_$][\w$]*)\s*:/g)) apiKeys.add(m[1])
  for (const m of apiText.matchAll(/(?:^|[\s{,])([A-Za-z_$][\w$]*)\s*,/g)) apiKeys.add(m[1])
  const usedOnS = new Map()
  for (const m of src.matchAll(/(?<![\w$.])s\.([A-Za-z_$][\w$]*)\s*\(/g)) {
    if (!usedOnS.has(m[1])) usedOnS.set(m[1], lineOf(m.index))
  }
  for (const [k, line] of usedOnS) {
    if (!apiKeys.has(k)) findings.push('line ' + line + ': tool handler calls s.' + k + '() but the session API does not export it')
  }
  notes.push('session API keys: ' + apiKeys.size + '; s.*() called: ' + usedOnS.size)
}

// ---- 4. error codes ----------------------------------------------------
// Scan the RAW source: these patterns live inside string literals, which `src` strips.
const raised = new Set()
for (const m of raw.matchAll(/v5err\(\s*'(V5_[A-Z_]+)'/g)) raised.add(m[1])
for (const m of raw.matchAll(/code:\s*'(V5_[A-Z_]+)'/g)) raised.add(m[1])
const docs = readFileSync(new URL('./vibe-math-v5/实现方案.md', import.meta.url), 'utf8')
const documented = new Set()
for (const m of docs.matchAll(/`(V5_[A-Z_]+)`/g)) documented.add(m[1])
const onlyDocs = new Set()
for (const m of docs.matchAll(/(V5_[A-Z_]+)/g)) onlyDocs.add(m[1])
const raisedNotDocumented = [...raised].filter(c => !onlyDocs.has(c))
const documentedNotRaised = [...documented].filter(c => !raised.has(c))
if (raisedNotDocumented.length) findings.push('error codes raised but absent from 实现方案.md: ' + raisedNotDocumented.join(', '))
if (documentedNotRaised.length) notes.push('documented but not raised in code (ok if advisory): ' + documentedNotRaised.join(', '))
notes.push('error codes raised: ' + raised.size)

// ---- 5. leftover scaffolding -------------------------------------------
for (const bad of ['@@V5_SECTION@@', 'TODO', 'FIXME', 'XXX', 'PLACEHOLDER']) {
  if (src.includes(bad)) findings.push('leftover development marker: ' + bad)
}
// every event type declared in EV must be appended somewhere
const evBlock = /const EV = \{([\s\S]*?)\n\}/.exec(raw)
if (evBlock) {
  const keys = [...evBlock[1].matchAll(/([A-Za-z]+):\s*'(vibe5\/[a-z]+)'/g)]
  for (const [, prop, literal] of keys) {
    const uses = (raw.match(new RegExp("EV\\." + prop + "\\b", 'g')) || []).length
    if (uses <= 1) findings.push('event type EV.' + prop + ' (' + literal + ') is declared but never committed')
  }
  notes.push('event types declared: ' + keys.length)
}

// ---- 6. composition sanity --------------------------------------------
// The v5 preset is a composition, and a typo in a row `name` is a mounting failure that
// no unit test of the plugin can catch (the mock calls apply() directly and never goes
// through the loader). v4 is a proven-good composition mounted on the same hosts, so any
// package row v5 names that v4 does not is either a genuine new dependency or a typo —
// and a new dependency must be justified, so surface it for review.
function packageRows(yaml) {
  const rows = []
  const lines = yaml.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const idm = /^\s*-\s*id:\s*(\S+)\s*$/.exec(lines[i])
    if (!idm) continue
    const row = { id: idm[1], name: '', disabled: false, line: i + 1 }
    for (let j = i + 1; j < lines.length && j < i + 12; j++) {
      if (/^\s*-\s*id:\s*\S+\s*$/.test(lines[j])) break
      const nm = /^\s*name:\s*'?([^'\n]+?)'?\s*$/.exec(lines[j])
      if (nm && !row.name) row.name = nm[1].trim()
      if (/^\s*disabled:\s*true/.test(lines[j])) row.disabled = true
    }
    if (row.name) rows.push(row)
  }
  return rows
}
const v5yaml = readFileSync(new URL('./vibe-math-v5/agent.cordis.yml', import.meta.url), 'utf8')
const v4yaml = readFileSync(new URL('./vibe-math-v4/agent.cordis.yml', import.meta.url), 'utf8')
const v5rows = packageRows(v5yaml)
const v4names = new Set(packageRows(v4yaml).map(r => r.name))
const RELATIVE_OK = new Set(['./vibe-math-v5.js'])
if (!v5rows.length) findings.push('composition: no rows parsed out of agent.cordis.yml (is the file still YAML?)')
for (const r of v5rows) {
  if (r.name === 'cordis:group') continue
  if (r.name.startsWith('./')) {
    if (!RELATIVE_OK.has(r.name)) findings.push('composition line ' + r.line + ': relative row name "' + r.name + '" has no matching file in the preset directory')
    continue
  }
  if (!v4names.has(r.name)) findings.push('composition line ' + r.line + ': row "' + r.id + '" names "' + r.name + '", which v4 does not — verify the package/name is correct')
}
// the preset must reference its own plugin row, and that file must exist
if (!v5rows.some(r => r.name === './vibe-math-v5.js')) findings.push('composition: the preset never mounts ./vibe-math-v5.js')
// prefix AND text are required on the persona row for the DSH schema and for back-compat
const personaBlock = /- id:\s*persona[\s\S]*?(?=\n-\s*id:)/.exec(v5yaml)
if (!personaBlock) findings.push('composition: no persona row found')
else {
  if (!/^\s*prefix:\s*\|/m.test(personaBlock[0])) findings.push('composition: persona row lacks the required `prefix` key')
  if (!/^\s*text:\s*\|/m.test(personaBlock[0])) findings.push('composition: persona row lacks the legacy `text` key')
}
notes.push('composition rows: ' + v5rows.length + '; non-v4 package rows: ' + v5rows.filter(r => r.name !== 'cordis:group' && !r.name.startsWith('./') && !v4names.has(r.name)).length)

// ---- 7. requirements traceability against the plan ---------------------
// "No missing logic" is only checkable mechanically if the SPEC is machine-readable.
// The plan's §15 names every tool and §16 every parameter, so compare those sets
// against the implementation: a name in the plan but not the code is an unimplemented
// requirement, and a name in the code but not the plan is undocumented surface.
{
  const plan = readFileSync(new URL('./vibe-math-v5/实现方案.md', import.meta.url), 'utf8')
  const planTools = new Set()
  for (const m of plan.matchAll(/\bvibe_v5_[a-z_]+/g)) planTools.add(m[0])
  const codeTools = new Set()
  for (const m of raw.matchAll(/registerTool\(\s*'(vibe_v5_[a-z_]+)'/g)) codeTools.add(m[1])
  // documented-but-wildcarded placeholders are not real tools
  const IGNORE = new Set(['vibe_v5_', 'vibe_v5_record_', 'vibe_v5_lean_', 'vibe_v5_task_'])
  for (const t of planTools) {
    if (IGNORE.has(t)) continue
    if (!codeTools.has(t)) findings.push('plan names tool ' + t + ' but the plugin never registers it')
  }
  const undocumented = [...codeTools].filter(t => !planTools.has(t))
  if (undocumented.length) notes.push('tools registered but not named in the plan: ' + undocumented.join(', '))
  notes.push('plan tools: ' + planTools.size + '; registered tools: ' + codeTools.size)

  // Parameters: only the §16 default table, NOT the §15 tool tables (whose rows also
  // begin with a backticked name).
  const declared2 = new Set()
  if (dpBlock) for (const m of dpBlock[1].matchAll(/^\s*([A-Za-z_$][\w$]*)\s*:/gm)) declared2.add(m[1])
  const sec16 = /##\s*16\.[\s\S]*?(?=\n##\s*17\.)/.exec(plan)
  const paramRows = new Set()
  if (sec16) {
    for (const m of sec16[0].matchAll(/^\|\s*`([A-Za-z][\w]*)`(?:\s*\/\s*`([A-Za-z][\w]*)`)?\s*\|/gm)) {
      paramRows.add(m[1])
      if (m[2]) paramRows.add(m[2])
    }
  } else findings.push('could not locate the plan\'s §16 parameter table')
  for (const p of paramRows) {
    if (!declared2.has(p)) findings.push('plan documents parameter `' + p + '` but DEFAULT_PARAMS does not declare it')
  }
  notes.push('plan §16 parameter rows: ' + paramRows.size)

  // The plan's philosophy is enforced by concrete gates; assert the load-bearing ones
  // still exist so a future edit cannot quietly drop a guard.
  const GATES = [
    ['temp workers cannot vote', "if (m.kind === 'temp') return   // no vote"],
    ['temp workers cannot hire', "if (caller.kind === 'temp') return { ok: false, code: 'V5_NOT_VOTER'"],
    ['only the academician assigns', "code: 'V5_NOT_ACADEMICIAN', message: 'only the academician (or the office) can assign tasks'"],
    ['only the academician sets priorities', "code: 'V5_NOT_ACADEMICIAN', message: 'only the academician (or the office) can set priorities'"],
    ['permanent-staff changes need the office', "code: 'V5_NOT_ACADEMICIAN', message: '解聘常驻研究员只能向所办提议，由所办批准（成员不能直接执行）'"],
    ['assignment objections are broadcast', 'if (p.reject_assign && typeof p.reject_assign === \'object\' && params.memberMayRejectAssign)'],
    ['the academician has no extra vote weight', 'const E = voters().map((m) => m.id)'],
    ['members may reject an assignment', "memberMayRejectAssign: true,"],
    ['the charter states the progress definition', "'  · Progress/<你>/progress.md —— **你的研究日志**（叙述体，可追加）。'"],
    ['the charter describes the academician as organizer', "'  【四、你的组织职责与边界（院士）】'"],
    ['the framework never assigns on its own', "agenda: '本所较长时间没有新进展。请你们自行讨论：现在最该推进的是什么？谁来做？是否需要发起验证？'"],

    // ── PROMPT / INTERACTION CORRECTNESS GATES ─────────────────────────────
    // The 2026-09 field test shipped a framework whose every member brief named the WRONG
    // member. These gates keep the structural fixes in place, and the companion
    // prompt-v5-integrity.test.mjs asserts the TEXT those fixes produce.
    ['the status block takes the member it describes', 'function briefBlock(member) {'],
    ['an unknown identity fails loudly instead of being guessed', "throw v5err('V5_INTERNAL', 'briefBlock: a member is required"],
    ['the status block is built from that member, never a global', 'function stateBlock(member) {\n      return briefBlock(member)\n    }'],
    ['the joiner is committed to the roster BEFORE its brief is built', "member.phase = 'active'\n      member.childId = ''\n      await putMember(member)"],
    ['the charter is frozen at hire and reused on resume', 'const persona = member.persona || memberPersona(member)'],
    ['a rebuilt session is framed as a rebuild', "const resume = mode === 'resume'"],
    ['leadership text follows the live roster', 'function academicianId() {'],
    ['no charter invents a leader when there is none', "本所当前**没有在册院士**"],
    ['the office resolves as the office, never as a guessed member', "try { if (rootOf(agent) === agent) return 'office' } catch (e) { /* fall through */ }"],
    ['the mailbox is acked BEFORE the round prompt is built', 'if (pending.length) await ackPending(pending)\n      const base = typeof baseFn === \'function\' ? baseFn() : baseFn'],
    ['framework feedback has its own sender (never a self-message)', "return await say('framework', { to: memberId, kind: 'notice', text: String(text) })"],
    ['an assignment is framed by its true origin', "if (m.kind === 'assign') return (m.from === 'office' ? '【所办分派】' : '【院士分派】') + m.text"],
    ['a nudge is framed as supervision, not as an assignment', "to, kind: 'nudge',"],
    ['a voters-only broadcast is framed as such', "if (m.kind === 'voters') return '【研究所·致全体表决者 from ' + m.from + '】' + m.text"],
    ['relayed messages carry their true sender', "await say(callerId, { to: 'voters', kind: 'voters', text: '提议开会：「' + agenda + '」（' + kind + '）' })"],
    ['a member that failed to provision stays visible', "b.push('[未就位] ' + absent.map((m) => m.id + '（' + m.phase + '）').join('、'))"],
    ['the objection channel is documented in the reply spec', '"reject_assign": {"task_id":"t-3"'],
    ['the task-done channel is documented in the reply spec', '"task_done": "t-3",'],
    ['the meeting input channel is documented in the reply spec', '"input": "本轮会议/辩论的发言正文'],
    ['the work push is paced, not an unbounded loop', 'if ((now() - (lastActiveAt.get(m.id) || 0)) < idleMs) continue'],

    // ── LEAN FORMAL VERIFICATION GATES (docs/formal-verification.md) ─────────
    ['the formal-verification mode defaults to off', "formalVerify: 'off',"],
    ['an unknown mode degrades to off, never to a stronger mode', "indexOf(out.formalVerify) !== -1 ? out.formalVerify : 'off'"],
    ['the mode is read at prompt-build time (never frozen into the charter)', 'const formalOn = () => formalMode()'],
    ['a passing run — not merely an archived file — is what makes an object passed', 'const formalGateOk = (rec) => !!rec && (rec.status === \'passed\' || rec.status === \'blocked\')'],
    ['a passing Lean run switches the review subject to fidelity', '你的任务是**忠实性审查**'],
    ['the voting prompt tells voters not to re-derive once a proof exists', '**你不需要重新检查推导**'],
    ['require mode withholds a verdict without a formal record', 'if (formalMode() === \'require\' && !formalGateOk(rec)) {'],
    ['a withheld verdict is recorded as undecided with a machine-readable reason', 'formal-required：尚未取得 Lean 形式化通过'],
    ['the withheld object goes on a formalization TODO', "'Formal/TODO.md'"],
    ['a blocker record must carry a reason', "if (!note) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: '阻塞记录必须写明原因（note）"],
    ['the proof of an object is archived under Verified/Lean/', "await writeTextRel('Verified/Lean/' + target + '.lean', body)"],
    ['reusable definitions live in the GLOBAL cross-project library', 'const okWrite = await writeTextAbs(instRootless(rel), body)'],
    ['the Lean path guard normalises .. (no string-prefix traversal hole)', 'const norm = normalizeAbsPath(abs)'],
    ['a missing toolchain degrades to a readable result, not a crash', "code: 'LEAN_NOT_FOUND'"],
    ['the formal record is durable projection state', "formal: 'vibe5/formal',"],
    ['the state block advertises the formalization counts', "b.push('[形式化] ' + (formalMode()"],
    ['the reply contract carries the difficulty judgement', "L.push('  \"formal\": {"],
  ]
  for (const [label, needle] of GATES) {
    if (!raw.includes(needle)) findings.push('philosophy gate missing from the implementation: ' + label)
  }
  notes.push('philosophy gates checked: ' + GATES.length)

  // The prompt corpus is a SHIPPED deliverable, not a build artifact: a human must be able
  // to read the exact text every member receives without decoding session logs.
  const REPO_ROOT = new URL('.', import.meta.url)
  const needFiles = [
    ['the prompt-integrity suite is shipped', 'prompt-v5-integrity.test.mjs'],
    ['the machine-readable prompt corpus is shipped', 'prompt-corpus-v5/prompt-corpus-v5.json'],
    ['the human-readable prompt corpus is shipped', 'prompt-corpus-v5/prompt-corpus-v5.md'],
    ['the persona-surface suite is shipped', 'audit-persona-surface.test.mjs'],
    ['the four-preset persona corpus is shipped (machine-readable)', 'prompt-corpus-persona/persona-corpus.json'],
    ['the four-preset persona corpus is shipped (human-readable)', 'prompt-corpus-persona/persona-corpus.md'],
  ]
  for (const [label, rel] of needFiles) {
    let ok = false
    try { ok = existsSync(new URL(rel, REPO_ROOT)) } catch (e) { ok = false }
    if (!ok) findings.push('missing shipped prompt-correctness artifact: ' + label + ' (' + rel + ')')
  }
  notes.push('prompt-correctness artifacts checked: ' + needFiles.length)

  // The corpus must actually contain the interactions a reviewer needs to see, and must
  // never contain a wrong-identity brief.
  try {
    const corpusPath = new URL('prompt-corpus-v5/prompt-corpus-v5.json', REPO_ROOT)
    const c = JSON.parse(readFileSync(corpusPath, 'utf8'))
    const kinds = new Set((c.prompts || []).map(p => p.kind))
    const need = ['founding', 'founding-temp', 'founding-leaderless', 'resume', 'normal', 'checkpoint',
      'verify', 'verify-debate', 'meeting', 'meeting-proposal', 'inbox-dm', 'inbox-voters', 'inbox-chat',
      'inbox-office', 'inbox-assign', 'inbox-nudge', 'inbox-office-assign', 'inbox-office-nudge',
      'notice', 'notice-claim', 'after-failure',
      // the Lean formal-verification interaction must be reviewable by a human too — including
      // the `require` gate wording and the state a member sees AFTER a fidelity defect withdrew
      // a proof (both were missing from the first corpus, so nobody could read them).
      'lean-work', 'lean-verify', 'lean-fidelity', 'lean-require', 'lean-after-defect']
    for (const k of need) if (!kinds.has(k)) findings.push('the prompt corpus is missing a ' + k + ' prompt')
    const all = (c.prompts || []).map(p => p.prompt + '\n' + (p.charter || '')).join('\n')
    if (/你是 \?/.test(all)) findings.push('the prompt corpus contains a wrong-identity "你是 ?" brief')
    if (/\[状态\][^\n]*你是\s+(\S+?)[^\n]*\n/.test(all)) {
      // every [状态] line must name a real member id, never a placeholder
      for (const m of all.match(/\[状态\][^\n]*/g) || []) {
        const id = (/\[状态\]\s*你是\s+(\S+?)（/.exec(m) || [])[1]
        if (!id || id === '?' || id === 'undefined') findings.push('the prompt corpus has a bad identity line: ' + m.slice(0, 60))
      }
    }
    notes.push('prompt corpus: ' + (c.total || 0) + ' prompts, ' + kinds.size + ' kinds')
  } catch (e) {
    findings.push('the prompt corpus could not be read/parsed: ' + String((e && e.message) || e))
  }

  // The persona surface of ALL FOUR presets is a shipped prompt-correctness artifact too:
  // it is the only prompt the MAIN agent receives, and no e2e suite loads the YAML, so a
  // human reviewer needs the corpus on disk (generated by audit-persona-surface.test.mjs).
  try {
    const pc = JSON.parse(readFileSync(new URL('prompt-corpus-persona/persona-corpus.json', REPO_ROOT), 'utf8'))
    for (const d of ['vibe-math-v2', 'vibe-math-v3', 'vibe-math-v4', 'vibe-math-v5']) {
      if (!(pc.presets || []).some((p) => p.preset === d)) findings.push('the persona corpus is missing preset ' + d)
    }
    const emptyBlocks = (pc.presets || []).filter((p) => !p.prefix || !p.text).map((p) => p.preset)
    if (emptyBlocks.length) findings.push('the persona corpus has an empty persona block: ' + emptyBlocks.join(', '))
    notes.push('persona corpus: ' + (pc.presets || []).length + ' presets')
  } catch (e) {
    findings.push('the persona corpus could not be read/parsed: ' + String((e && e.message) || e))
  }
}

// ---- report ------------------------------------------------------------
console.log('-- V5 integrity audit --')
for (const n of notes) console.log('  note: ' + n)
console.log('')
if (findings.length) {
  for (const f of findings) console.error('  FINDING: ' + f)
  console.error('')
  console.error(findings.length + ' finding(s)')
  process.exit(1)
}
console.log('clean: no undefined calls, no undeclared params keys, no missing session API, no leftover markers')
process.exit(0)

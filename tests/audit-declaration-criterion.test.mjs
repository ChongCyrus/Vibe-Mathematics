// tests/audit-declaration-criterion.test.mjs — the "declaration must name its execution point" gate
// (tenth + ELEVENTH case of this stage).
//
// WHY: `scripts/generate-zero-mechanism-matrix.mjs` implemented a `--selftest` mode that passed by hand
// and yet NOTHING in `tests/**` executed it — a self-proof with no execution point (tenth case).
// The first version of THIS gate then violated its own criterion (eleventh case): it counted a mere
// MENTION in a gate's source as "executed", its hand-written flag tables were not reconciled against the
// real scripts, and its RULE C table only looked at three field names. All three are fixed here.
//
//   RULE A — a self-proof mode counts ONLY when a gate REALLY RUNS it (spawnSync + exit 0 asserted).
//            A mention in source text is a HINT, never a pass.               (missing/failing ⇒ RED)
//   RULE B — a registry/manifest must have a gate that reconciles declared vs fact.   (missing ⇒ RED)
//   RULE C — every self-reported field (declared OR discovered) must be scanned by a gate; a field
//            outside the table must still be DISCOVERED — "not in the table" is not a pass. (⇒ RED)
import { readdirSync, readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const SCRIPTS = join(REPO, 'scripts')
const TESTS = join(REPO, 'tests')

let pass = 0, fail = 0
const ok = (cond, label) => { if (cond) { pass++ } else { fail++; console.log('FAIL ' + label) } }
const red = (violations, label) => { if (violations.length === 0) { pass++ } else { fail++; console.log('FAIL ' + label + ' ⇒ ' + violations.join('; ')) } }
const readIf = (p) => { try { return readFileSync(p, 'utf8') } catch { return '' } }
const listFiles = (dir, filter) => { try { return readdirSync(dir).filter(filter).map((f) => join(dir, f)) } catch { return [] } }

// ── the checkers (pure, so fixtures can drive them) ───────────────────────────────────────────────────

/** Flags a script implements: `--selftest`, `--self-test`, `--check`, `--json`, `--kernel`, … */
export function flagsOf(src) {
  const out = new Set()
  for (const m of String(src).matchAll(/--([a-z][a-z0-9-]{2,})/g)) out.add('--' + m[1])
  return [...out].sort()
}

/** RULE A/C tables — DECLARED, and reconciled against what the scripts actually implement. */
export const SELF_PROOF_FLAGS = Object.freeze(['--selftest', '--self-test'])
export const DIAGNOSTIC_FLAGS = Object.freeze(['--check', '--json', '--kernel'])
/** The shape of a self-proof flag, so a NEW spelling cannot slip past the declared table. */
export const SELF_PROOF_SHAPE = /^--self-?test$/

/** Reconcile the declared flag tables against the flags the scripts really implement. */
export function auditFlagTables({ scriptSources, selfProof = SELF_PROOF_FLAGS, diagnostic = DIAGNOSTIC_FLAGS }) {
  const implemented = new Set()
  for (const s of scriptSources) for (const f of flagsOf(s.src)) implemented.add(f)
  const violations = []
  for (const f of implemented) {
    if (SELF_PROOF_SHAPE.test(f) && !selfProof.includes(f)) violations.push('self-proof flag ' + f + ' is implemented but MISSING from SELF_PROOF_FLAGS (blind spot)')
  }
  for (const f of [...selfProof, ...diagnostic]) {
    if (!implemented.has(f)) violations.push('declared flag ' + f + ' is implemented by NO script (ghost entry)')
  }
  return { violations, implemented: [...implemented].sort(), declared: { selfProof: [...selfProof], diagnostic: [...diagnostic] } }
}

/** RULE A: a self-proof mode counts ONLY when it was really run (evidence), never on a mention. */
export function auditSelfProofExecution({ scriptFiles, gateSources, evidence = [], selfProof = SELF_PROOF_FLAGS }) {
  const violations = []
  const coverage = []
  for (const f of scriptFiles) {
    const src = readIf(f)
    const script = basename(f)
    const selfProofs = flagsOf(src).filter((x) => selfProof.includes(x) || SELF_PROOF_SHAPE.test(x))
    for (const flag of selfProofs) {
      const ran = evidence.find((e) => basename(e.script) === script && e.flag === flag)
      const ranOk = !!(ran && ran.status === 0)
      const mentioned = gateSources.some((g) => g.src.includes(script) && g.src.includes(flag))
      if (!ranOk) {
        violations.push(script + ' implements ' + flag + ' but no gate REALLY RUNS it' +
          (ran && ran.status !== 0 ? ' (it ran with exit ' + ran.status + ')' : mentioned ? ' (only MENTIONED in a gate: a mention is not an execution point)' : ''))
      }
      coverage.push({ script, flag, reallyRan: ranOk, exit: ran ? ran.status : null, mentionedOnly: mentioned && !ranOk })
    }
  }
  return { violations, coverage }
}

/** RULE B: a registry/manifest needs a gate reconciling declaration vs fact. */
export function auditRegistryReconciliation({ sources, gateSources, registryMarkers = ['GUARD_FACES', 'EXPECT', 'REGISTRY', 'MANIFEST'] }) {
  const violations = []
  const coverage = []
  for (const s of sources) {
    const found = registryMarkers.filter((m) => new RegExp('\\b' + m + '\\b').test(s.src))
    if (found.length === 0) continue
    const gate = gateSources.find((g) => found.some((m) => g.src.includes(m)) && /compare|declar|fact|scan|reconcil|must match|diff/i.test(g.src))
    if (!gate) violations.push(basename(s.file) + ' exposes ' + found.join('/') + ' but no gate reconciles declaration vs fact')
    coverage.push({ file: basename(s.file), markers: found, reconciledBy: gate ? basename(gate.file) : null })
  }
  return { violations, coverage }
}

/**
 * Discover self-reported field names MECHANICALLY, from the source STRUCTURE — task-201 (twelfth case):
 * the previous version was a prefix whitelist, so a field matching no known prefix (e.g. `reallyRan`) was
 * invisible to the very gate that introduced it. Two independent extractors are unioned:
 *   (a) the legacy prefix shape (kept, so its 8 fields are never lost);
 *   (b) top-level keys of every `return { … }` object literal whose value is a CLAIM-shaped literal
 *       (a boolean, a number, or a `.length`) — a claim is exactly what a gate can verify.
 */
export const SELF_REPORT_SHAPE = /\b(usedBy[A-Za-z]*|verifiedBy[A-Za-z]*|scanned[A-Za-z]*|counted[A-Za-z]*|attested[A-Za-z]*|receipted[A-Za-z]*|reached[A-Za-z]*|runtimeWrites|lastRuntimeWrite)\b/g

/** The declared table (must reconcile BOTH ways with the mechanical discovery). */
export const DECLARED_SELF_REPORT_FIELDS = Object.freeze([
  // the original prefix-shape fields (task-177/179) — their coverage must never be lost
  'usedByProduction', 'verifiedBy', 'scanned', 'counted', 'countedContributors', 'countedInQuota',
  'reached', 'runtimeWrites', 'lastRuntimeWrite',
  // task-201: this gate's OWN new fields (it can see them now) and the fields it returns in `coverage`
  'reallyRan', 'mentionedOnly', 'scannedByGate', 'scannedRows',
  // fields the mechanical (claim-family) extraction discovered across the kernel — declared after review
  'accounts', 'alreadyRecused', 'attested', 'collusionScan', 'extraWiredCount', 'ran', 'receipted',
  'recorded', 'refused', 'reputationGrantsAuthority', 'reused', 'trustUsedForAuthority',
  'unknownKindRefused', 'unknownVersionRefused', 'unverifiable', 'unverified', 'unwiredCount',
  'usedBy', 'usedBytes', 'verified', 'wired', 'wiredCount',
  // a fixture-only field name (it exists only inside this gate's own negative fixture, and is scanned here)
  'surprisingScan',
])

/** Top-level keys of every `return { … }` object literal in one source. */
export function extractReturnKeys(src) {
  const keys = new Set()
  const re = /return\s*\{/g
  let m
  while ((m = re.exec(String(src)))) {
    let i = m.index + m[0].length, depth = 1, buf = ''
    for (; i < src.length && depth > 0; i++) {
      const ch = src[i]
      if (ch === '{') depth++
      else if (ch === '}') { depth--; if (depth === 0) break }
      buf += ch
    }
    let d = 0, cur = ''
    const parts = []
    for (const ch of buf) {
      if (ch === '{' || ch === '[' || ch === '(') d++
      else if (ch === '}' || ch === ']' || ch === ')') d--
      if (ch === ',' && d === 0) { parts.push(cur); cur = '' } else cur += ch
    }
    parts.push(cur)
    for (const p of parts) {
      const km = /^\s*(?:\.\.\.)?([A-Za-z_$][\w$]*)\s*:/.exec(p)
      if (km) keys.add(km[1])
    }
  }
  return [...keys].sort()
}

/** Claim-shaped keys: the returned value is a literal boolean/number/empty literal or a `.length`. */
export function claimShapedKeys(src) {
  const out = new Set()
  for (const k of extractReturnKeys(src)) {
    if (!SELF_REPORT_CLAIM_FAMILY.test(k)) continue     // a *self-report* claim, not every status key
    const re = new RegExp('\\b' + k.replace(/\$/g, '\\$') + '\\s*:\\s*(?:true|false|-?\\d+(?:\\.\\d+)?|\\[\\]|\\{\\}|[A-Za-z_$][\\w$.]*\\.length\\b)')
    if (re.test(String(src))) out.add(k)
  }
  return [...out].sort()
}

/**
 * The CLAIM FAMILY (task-201): a field is a self-report when its NAME says something was counted,
 * verified, scanned, reached, ran, mentioned, attested, recorded, wired or proven — regardless of the
 * exact prefix. This is what generalises the old whitelist without flooding on ordinary status keys.
 */
export const SELF_REPORT_CLAIM_FAMILY = /(counted|counts|verified|verif|scanned|scan|usedby|used|reached|reach|ran|mentioned|attested|receipted|recorded|claimed|wired|proven|proved|checked|coverage)/i

/** The union the audit actually uses. */
export function discoverSelfReportedFields(sources) {
  const found = new Set()
  for (const s of sources) {
    for (const m of String(s.src).matchAll(SELF_REPORT_SHAPE)) found.add(m[1])
    for (const k of claimShapedKeys(s.src)) found.add(k)
  }
  return [...found].sort()
}

/** Reconcile the DECLARED table with the mechanical discovery (ghost AND blind spot are both red). */
export function auditSelfReportTable({ sources, declared = DECLARED_SELF_REPORT_FIELDS }) {
  const discovered = discoverSelfReportedFields(sources)
  const violations = []
  for (const f of declared) if (!discovered.includes(f)) violations.push('declared self-report field "' + f + '" is not discovered anywhere (ghost entry)')
  for (const f of discovered) if (!declared.includes(f)) violations.push('discovered self-report field "' + f + '" is MISSING from the declared table (blind spot)')
  return { violations, discovered, declared: [...declared] }
}

/** RULE C: every DISCOVERED self-reported field must be scanned by some gate. */
export function auditSelfReportedStatus({ sources, gateSources, declared = DECLARED_SELF_REPORT_FIELDS }) {
  const violations = []
  const table = auditSelfReportTable({ sources, declared })
  const discovered = table.discovered
  const coverage = []
  for (const s of sources) {
    const fields = discovered.filter((f) => s.src.includes(f))
    for (const f of fields) {
      const gate = gateSources.some((g) => g.src.includes(f))
      if (!gate) violations.push(basename(s.file) + ' reports status field "' + f + '" but no gate scans it' + (declared.includes(f) ? '' : ' (and it is NOT in the declared table)'))
      coverage.push({ file: basename(s.file), field: f, scannedByGate: gate, declared: declared.includes(f) })
    }
  }
  return { violations, coverage, discovered, tableViolations: table.violations }
}

// ── RULE D (task-211): documented tool names must exist in host.js TOOL_NAMES, or be marked planned ──

/** The "not implemented" marker style this repo already uses (⛔ / 规划 / 未实现 / roadmap …). */
export const DOC_PLANNED_MARKERS = /未实现|未接线|规划|计划|提案|待实现|目标形态|尚未|roadmap|not implemented|planned|⛔/i

export function extractToolNames(src) {
  return [...new Set([...String(src).matchAll(/vibe_vmu_[a-z0-9_]+/g)].map((m) => m[0]))]
}

/** The REAL tool set: parsed from host.js's `export const TOOL_NAMES = Object.freeze({ … })`. */
export function implementedToolNames(hostSrc) {
  const out = new Set()
  const block = /export const TOOL_NAMES = Object\.freeze\(\{([\s\S]*?)\}\)/.exec(String(hostSrc))
  for (const m of (block ? block[1] : '').matchAll(/'(vibe_vmu_[a-z0-9_]+)'/g)) out.add(m[1])
  return out
}

/**
 * RULE D: every `vibe_vmu_*` name a doc mentions must be (a) in TOOL_NAMES, or (b) marked as
 * planned/not-implemented — on its own line, OR inside a marked section/table (the "planning list"
 * exception: a table whose header/heading carries the marker covers its rows).
 */
export function auditDocToolNames({ docs, implemented, markers = DOC_PLANNED_MARKERS }) {
  const violations = []
  const coverage = []
  for (const d of docs) {
    const lines = String(d.src).split('\n')
    let sectionMarked = false
    lines.forEach((line, i) => {
      // a heading or a table header row carrying the marker marks the whole following block
      if (/^\s*#{1,6}\s/.test(line) || /^\s*\|/.test(line)) sectionMarked = markers.test(line)
      for (const name of extractToolNames(line)) {
        const lineMarked = markers.test(line) || sectionMarked
        const okImpl = implemented.has(name)
        if (!okImpl && !lineMarked) {
          violations.push(basename(d.file) + ':' + (i + 1) + ' documents "' + name + '" which is NOT in host.js TOOL_NAMES and carries no 规划/未实现 marker')
        }
        coverage.push({ file: basename(d.file), line: i + 1, name, implemented: okImpl, marked: lineMarked })
      }
    })
  }
  return { violations, coverage }
}

// ── RULE E (task-221): "vacuous pass" assertions — a gate that guards nothing ────────────────────────

/** An explicit opt-out comment: the author states the empty case is intended. */
export const EMPTY_ALLOWED = /EMPTY_ALLOWED/
/** Evidence that a collection really was non-empty BEFORE the assertion (the required precondition).
 *  task-222 precision fix: an equality assertion against a POSITIVE integer (`length === 24`) also proves
 *  non-emptiness — the first version only accepted `> 0`/`!== 0`/`>= 1`, which produced many false hits. */
export const NON_EMPTY_GUARD = /(\.length\s*>\s*0|\.length\s*!==\s*0|\.length\s*>=\s*1|\.length\s*===\s*[1-9]\d*|non-vacuous|scanned\s*>\s*0)/
/** Shape A is COUNTED, not failed (the `EXPECT_UNDECIDED` pattern): visible, tracked, no permanent red.
 *  The baseline is "must not grow": a NEW shape-A vacuous pass turns the gate red. */
export const A_CLASS_BASELINE = 193
export function aClassGrowth(violations, baseline = A_CLASS_BASELINE) {
  const a = violations.filter((v) => /\[A\]/.test(v)).length
  return {
    a, baseline, grew: a > baseline,
    violations: a > baseline ? ['shape A grew from ' + baseline + ' to ' + a + ' (a NEW vacuous pass was introduced): ' + violations.filter((v) => /\[A\]/.test(v)).slice(baseline, baseline + 5).join(' | ')] : [],
  }
}

/**
 * RULE E: find assertions that can pass VACUOUSLY.
 *   A — `.every(...)` / `.filter(...).length === 0` / `for (… of X)` with no adjacent non-empty guard
 *   B — `a.length === b.length` / stringified collections where both sides may be empty
 *   C — a conditional assertion `if (…) { ok(…) }` (the branch may never run)
 *   D — `try { … } catch { ok(true) }` (the failure is swallowed)
 * Exceptions must be EXPLICIT: an `EMPTY_ALLOWED` comment, or a non-empty guard near the line.
 */
/**
 * Is the iterable/receiver a NON-EMPTY ARRAY LITERAL (possibly spanning lines)? task-224 precision fix:
 * `[a, b].every(...)` / `for (const k of [\n a,\n b\n])` can NEVER be vacuous, so flagging them is a false
 * positive. The exemption is granted only when the literal is PROVABLY non-empty: closed brackets, at
 * least one element, and no spread (`...`) which could expand to nothing.
 */
export function literalNonEmpty(text, window = 60) {
  const s = String(text).split('\n').slice(0, window).join('\n')
  const i = s.indexOf('[')
  if (i < 0) return false
  let depth = 0, body = ''
  for (let j = i; j < s.length; j++) {
    const ch = s[j]
    if (ch === '[') depth++
    else if (ch === ']') { depth--; if (depth === 0) break }
    else if (depth === 1) body += ch
  }
  // A literal that is still open after the window is a LARGE literal (it starts with `[` and has text
  // inside) ⇒ provably non-empty for our purposes; `[]`/`[ ]` are the only empty literals and they close.
  if (depth !== 0) return body.length > 0
  if (/\.\.\./.test(body)) return false             // spread ⇒ could expand to nothing
  return body.split(',').map((x) => x.trim()).filter(Boolean).length >= 1
}

export function auditVacuousAssertions({ files, window = 3 }) {
  const violations = []
  const coverage = []
  for (const f of files) {
    const lines = String(f.src).split('\n')
    lines.forEach((line, i) => {
      if (!/\b(ok|assert|assert\.ok)\s*\(/.test(line) && !/\bfor\s*\(const\s+\w+\s+of\s+/.test(line)) return
      const near = lines.slice(Math.max(0, i - window), i + 1).join('\n')
      const excused = EMPTY_ALLOWED.test(line) || EMPTY_ALLOWED.test(near) || NON_EMPTY_GUARD.test(near)
      const add = (shape, why) => {
        coverage.push({ file: basename(f.file), line: i + 1, shape, excused, text: line.trim(), ctx: lines.slice(Math.max(0, i - 3), i + 3).map((l) => l.trim()) })
        if (!excused) violations.push(basename(f.file) + ':' + (i + 1) + ' [' + shape + '] ' + why)
      }
      if (/\.every\s*\(/.test(line)) {
        const recv = /([A-Za-z_$][\w$.\[\]]*)\.every\s*\(/.exec(line)
        // task-222/224 precision fix: a receiver that IS a provably non-empty literal is never vacuous.
        const receiverIsLiteral = literalNonEmpty(line.slice(0, line.indexOf('.every')))
        if (!receiverIsLiteral) {
          add('A', 'every() is TRUE on an empty set: "' + (recv ? recv[1] : 'the collection') + '" may be empty, so nothing is checked')
        }
      }
      if (/\.filter\s*\([^)]*\)\.length\s*===\s*0/.test(line)) add('A', 'filter(...).length === 0 also holds when the SOURCE was empty (nothing was filtered)')
      if (/\bfor\s*\(const\s+\w+\s+of\s+/.test(line)) {
        // (a) a PROVABLY non-empty literal iterable (possibly MULTI-LINE) is never vacuous (task-224);
        // (b) the assertion must be INSIDE the loop body — an assertion after the loop is not evidence.
        const afterOf = lines.slice(i, i + 12).join('\n')
        const iterText = afterOf.slice(afterOf.indexOf('of ') + 3)
        const literal = /^\s*\[/.test(iterText) && literalNonEmpty(iterText)
        if (!literal) {
          let depth = 0, started = false, body = ''
          for (let j = i; j < lines.length && j < i + 40; j++) {
            body += lines[j] + '\n'
            for (const ch of lines[j]) { if (ch === '{') { depth++; started = true } else if (ch === '}') depth-- }
            if (started && depth <= 0) break
          }
          const inner = body.slice(body.indexOf('{') + 1)
          if (/\b(ok|assert|assert\.ok)\s*\(/.test(inner)) {
            const recv = /\bof\s+([A-Za-z_$][\w$.\[\]]*)/.exec(line)
            add('A', 'a for…of body runs zero times when "' + (recv ? recv[1] : 'the collection') + '" is empty, so its assertions never run')
          }
        }
      }
      const eq = /(\w+)\.length\s*===\s*(\w+)\.length/.exec(line) || /JSON\.stringify\((\w+)\)\s*===\s*JSON\.stringify\((\w+)\)/.exec(line)
      if (eq) add('B', 'both sides (' + eq[1] + ', ' + eq[2] + ') may be empty: two empty collections compare equal')
      if (/\bif\s*\([^)]*\)\s*\{\s*[^}]*\b(ok|assert)\s*\(/.test(line)) add('C', 'the assertion lives inside a conditional: if the branch never runs, the check is skipped silently')
      if (/catch\s*(\([^)]*\))?\s*\{[^}]*\b(ok|assert)\s*\(\s*true/.test(line)) add('D', 'the catch block asserts success: a thrown failure is swallowed as a pass')
    })
  }
  return { violations, coverage }
}

// ── real inventory (paths matter: the kernel lives under the preset directory) ────────────────────────

const scriptFiles = listFiles(SCRIPTS, (f) => f.endsWith('.mjs'))
const SELF_FILE = join(TESTS, 'audit-declaration-criterion.test.mjs')
// task-201: this gate scans ITSELF too — its own new self-report fields (`reallyRan`, `mentionedOnly`) are
// claims like any other, and it asserts on them, so they are discovered AND scanned.
const gateFiles = listFiles(TESTS, (f) => f.endsWith('.mjs')).concat([join(TESTS, 'run-tests.mjs')]).filter((f) => existsSync(f))
const gateSources = gateFiles.map((f) => ({ file: f, src: readIf(f) }))
const kernelFiles = listFiles(join(REPO, 'vibe-math-vmu', 'kernel'), (f) => f.endsWith('.js'))
const sourceFiles = kernelFiles.concat(scriptFiles).concat([SELF_FILE]).map((f) => ({ file: f, src: readIf(f) }))
ok(kernelFiles.length > 0, 'the inventory really found kernel sources under vibe-math-vmu/kernel (non-vacuous scan)')
ok(sourceFiles.length > 0 && sourceFiles.every((s) => s.src.length > 0), 'every scanned source was actually read (non-vacuous)')

// ── 0) REALLY RUN the self-proof modes (the only evidence RULE A accepts) ─────────────────────────────

const executedEvidence = []
const runSelfProof = (scriptName, flag) => {
  const script = join(SCRIPTS, scriptName)
  if (!existsSync(script)) { console.log('  EXECUTED: (missing) ' + scriptName + ' ' + flag); return null }
  const r = spawnSync(process.execPath, [script, flag], { cwd: REPO, encoding: 'utf8', timeout: 300000 })
  console.log('  EXECUTED: node scripts/' + scriptName + ' ' + flag + ' ⇒ exit=' + r.status + ' | ' + String(r.stdout || '').trim().split('\n').slice(-1)[0])
  executedEvidence.push({ script, flag, status: r.status })
  return r
}
const matrixRun = runSelfProof('generate-zero-mechanism-matrix.mjs', '--selftest')
ok(matrixRun && matrixRun.status === 0, 'the matrix --selftest really runs green (tenth case: it now HAS an execution point)')
const cleanRun = runSelfProof('clean-temp.mjs', '--self-test')
ok(cleanRun && cleanRun.status === 0, 'clean-temp --self-test really runs green (declared self-proof flag #2)')
const releaseRun = runSelfProof('release-check.mjs', '--self-test')
ok(releaseRun && releaseRun.status === 0, 'release-check --self-test really runs green (declared self-proof flag #3)')
const regenRun = runSelfProof('regen-all.mjs', '--check')
ok(regenRun && regenRun.status === 0, 'regen-all --check really runs green (the aggregate chain now has an execution point)')

// ── 1) flag tables reconciled against the scripts ────────────────────────────────────────────────────

const tables = auditFlagTables({ scriptSources: scriptFiles.map((f) => ({ file: f, src: readIf(f) })) })
console.log('  FLAG TABLES: implemented=' + JSON.stringify(tables.implemented))
red(tables.violations, 'FLAG TABLES (declared self-proof/diagnostic flags match the scripts)')
ok(tables.implemented.includes('--selftest') && tables.implemented.includes('--self-test'), 'both real self-proof spellings were discovered')

// ── 2) RULE A on the real tree ───────────────────────────────────────────────────────────────────────

const ruleA = auditSelfProofExecution({ scriptFiles, gateSources, evidence: executedEvidence })
red(ruleA.violations, 'RULE A (every self-proof mode is REALLY RUN by a gate)')
ok(ruleA.coverage.length >= 3 && ruleA.coverage.every((c) => c.reallyRan === true), 'all discovered self-proof modes really ran (' + ruleA.coverage.map((c) => c.script + c.flag).join(', ') + ')')

// ── 3) RULE B / RULE C on the real tree ──────────────────────────────────────────────────────────────

const ruleB = auditRegistryReconciliation({ sources: sourceFiles, gateSources })
const ruleC = auditSelfReportedStatus({ sources: sourceFiles, gateSources })
console.log('  RULE B coverage: ' + JSON.stringify(ruleB.coverage))
console.log('  RULE C discovered: ' + JSON.stringify(ruleC.discovered))
red(ruleB.violations, 'RULE B (registries are reconciled against fact)')
// task-201: the declared self-report table is reconciled in BOTH directions (ghost / blind spot).
red(ruleC.tableViolations, 'RULE C TABLE (declared self-report fields ↔ mechanical discovery)')
red(ruleC.violations, 'RULE C (every discovered self-reported field is scanned by a gate)')
ok(ruleB.coverage.some((c) => c.markers.includes('EXPECT') && c.reconciledBy), 'the EXPECT registry in the matrix generator is reconciled by a named gate')
ok(ruleC.coverage.some((c) => ['usedByProduction', 'verifiedBy'].includes(c.field) && c.scannedByGate === true), 'the usedByProduction/verifiedBy surface is scanned by a gate')
ok(ruleC.discovered.includes('runtimeWrites') || ruleC.discovered.includes('lastRuntimeWrite'), 'the mechanical discovery still sees the runtime-write surface')

// ── 3b) RULE D on the real tree: documented tool names vs host.js TOOL_NAMES ─────────────────────────

const hostSrc = readIf(join(REPO, 'vibe-math-vmu', 'host.js'))
const implementedTools = implementedToolNames(hostSrc)
const docFiles = listFiles(join(REPO, 'vibe-math-vmu', 'docs'), (f) => f.endsWith('.md')).map((f) => ({ file: f, src: readIf(f) }))
const ruleD = auditDocToolNames({ docs: docFiles, implemented: implementedTools })
console.log('  RULE D implemented tools=' + JSON.stringify([...implementedTools].sort()))
console.log('  RULE D documented names=' + ruleD.coverage.length + ' hits=' + ruleD.violations.length)
{
  const byFile = {}
  for (const v of ruleD.violations) { const f = v.split(':')[0]; byFile[f] = (byFile[f] || 0) + 1 }
  console.log('  RULE D hits by volume: ' + JSON.stringify(byFile))
}
ok(implementedTools.size >= 9, 'the implemented tool set was really parsed from host.js TOOL_NAMES (' + implementedTools.size + ' names)')
red(ruleD.violations, 'RULE D (every documented vibe_vmu_* tool is implemented or explicitly marked 规划/未实现)')

// ── 3c) RULE E on the real tree: assertions that can pass vacuously ──────────────────────────────────

// The gate itself is excluded: it deliberately CONTAINS the bad shapes as negative fixtures.
const vacuousFiles = listFiles(TESTS, (f) => f.endsWith('.mjs') && f !== 'audit-declaration-criterion.test.mjs').map((f) => ({ file: f, src: readIf(f) }))
const ruleE = auditVacuousAssertions({ files: vacuousFiles })
console.log('  RULE E scanned files=' + vacuousFiles.length + ' candidate lines=' + ruleE.coverage.length + ' hits=' + ruleE.violations.length)
{
  const byShape = {}
  const byFile = {}
  for (const c of ruleE.coverage) if (!c.excused) { byShape[c.shape] = (byShape[c.shape] || 0) + 1; byFile[c.file] = (byFile[c.file] || 0) + 1 }
  console.log('  RULE E hits by shape: ' + JSON.stringify(byShape))
  console.log('  RULE E hits by file: ' + JSON.stringify(byFile))
}
ok(vacuousFiles.length >= 20, 'RULE E really scanned the test tree (non-vacuous scan: ' + vacuousFiles.length + ' files)')
// task-222 GRADED enforcement: B/C/D fail immediately (27 hits, C being the most dangerous); shape A is
// COUNTED and listed but does not fail — except that it must NOT GROW (a new vacuous pass ⇒ red).
const ruleENonA = ruleE.violations.filter((v) => !/\[A\]/.test(v))
red(ruleENonA, 'RULE E (shapes B/C/D must not exist: conditional assertions / empty-vs-empty comparisons / swallowed failures)')
const growth = aClassGrowth(ruleE.violations)
console.log('  RULE E shape A (counted, not failing): a=' + growth.a + ' baseline=' + growth.baseline)
red(growth.violations, 'RULE E shape A must not GROW beyond the recorded baseline')
ok(ruleE.violations.filter((v) => /\[A\]/.test(v)).length <= A_CLASS_BASELINE, 'shape-A vacuous passes are at or below the baseline (' + growth.a + ' ≤ ' + A_CLASS_BASELINE + ')')
for (const v of ruleE.violations.slice(0, 60)) console.log('    RULE-E-HIT ' + v)

// task-224: SINGLE SOURCE OF TRUTH — the triage script (re)uses THIS gate's detection by asking it to dump
// the un-excused RULE E coverage as JSON, so the sample can never diverge from the enforced criterion.
if (process.argv.includes('--dump-rule-e')) {
  const hits = ruleE.coverage.filter((c) => !c.excused).map((c) => ({ file: c.file, line: c.line, shape: c.shape, text: c.text, ctx: c.ctx }))
  console.log('RULE_E_DUMP ' + JSON.stringify({ files: vacuousFiles.length, hits }))
  process.exit(0)
}

// ── 4) deliberate-breakage fixtures: the checker must be able to go red ──────────────────────────────

{
  const dir = mkdtempSync(join(tmpdir(), 'decl-criterion-'))
  try {
    // fixture A: `--selftest` that no gate runs
    const fakeScript = join(dir, 'generate-fake.mjs')
    writeFileSync(fakeScript, "if (process.argv.includes('--selftest')) { console.log('ok'); process.exit(0) }\n", 'utf8')
    const a = auditSelfProofExecution({ scriptFiles: [fakeScript], gateSources: [], evidence: [] })
    ok(a.violations.length === 1 && /generate-fake\.mjs implements --selftest but no gate REALLY RUNS it/.test(a.violations[0]), 'fixture A: an unexecuted --selftest is flagged by name')
    const aRan = auditSelfProofExecution({ scriptFiles: [fakeScript], gateSources: [], evidence: [{ script: fakeScript, flag: '--selftest', status: 0 }] })
    ok(aRan.violations.length === 0, 'fixture A (control): a REAL run clears it')

    // fixture A′: THE ELEVENTH CASE — a gate that only MENTIONS the flag must NOT clear the violation
    const aMention = auditSelfProofExecution({ scriptFiles: [fakeScript], gateSources: [{ file: 'gate', src: '// we should run scripts/generate-fake.mjs --selftest someday' }], evidence: [] })
    ok(aMention.violations.length === 1 && /only MENTIONED in a gate/.test(aMention.violations[0]), 'fixture A′ (eleventh case): a COMMENT mention stays RED')
    ok(aMention.coverage[0].mentionedOnly === true && aMention.coverage[0].reallyRan === false, 'fixture A′: the mention is recorded as a hint, never as an execution')

    // fixture A″: a self-proof that runs but FAILS is red too
    const aFail = auditSelfProofExecution({ scriptFiles: [fakeScript], gateSources: [], evidence: [{ script: fakeScript, flag: '--selftest', status: 1 }] })
    ok(aFail.violations.length === 1 && /it ran with exit 1/.test(aFail.violations[0]), 'fixture A″: a self-proof that exits non-zero is flagged')

    // fixture B: a registry with no declaration-vs-fact reconciliation
    const b = auditRegistryReconciliation({ sources: [{ file: 'fake-kernel.js', src: 'export const GUARD_FACES = [1,2,3]\n' }], gateSources: [{ file: 'gate', src: 'import { GUARD_FACES } from "x"' }] })
    ok(b.violations.length === 1 && /GUARD_FACES/.test(b.violations[0]), 'fixture B: a registry without a reconciliation gate is flagged')
    const bFixed = auditRegistryReconciliation({ sources: [{ file: 'fake-kernel.js', src: 'export const GUARD_FACES = [1]\n' }], gateSources: [{ file: 'gate', src: 'GUARD_FACES: reconcile declaration vs fact (scan)' }] })
    ok(bFixed.violations.length === 0, 'fixture B (control): a reconciliation gate clears it')

    // fixture C: a self-reported field with no scanning gate — INCLUDING one the table never declared
    const c = auditSelfReportedStatus({ sources: [{ file: 'fake-kernel.js', src: 'function status(){ return { usedByProduction: true, scannedRows: 3 } }' }], gateSources: [{ file: 'gate', src: 'assert(x === 1)' }] })
    ok(c.violations.length === 2 && c.violations.some((v) => /usedByProduction/.test(v)) && c.violations.some((v) => /scannedRows/.test(v)), 'fixture C: an undeclared field (scannedRows) is discovered and flagged, not ignored')
    const cFixed = auditSelfReportedStatus({ sources: [{ file: 'fake-kernel.js', src: 'function status(){ return { usedByProduction: true } }' }], gateSources: [{ file: 'gate', src: 'assert(status().usedByProduction === true)' }] })
    ok(cFixed.violations.length === 0, 'fixture C (control): a scanning gate clears it')

    // fixture D: the tables themselves — a ghost entry and a missing spelling must both be caught
    const dGhost = auditFlagTables({ scriptSources: [{ file: 's.mjs', src: "if (process.argv.includes('--check')) {}\n" }], selfProof: ['--selftest', '--verify'], diagnostic: ['--check'] })
    ok(dGhost.violations.some((v) => /ghost entry/.test(v)), 'fixture D: a declared-but-unimplemented flag (ghost) is flagged')
    const dMissing = auditFlagTables({ scriptSources: [{ file: 's.mjs', src: "if (process.argv.includes('--self-test')) {}\n" }], selfProof: ['--selftest'], diagnostic: [] })
    ok(dMissing.violations.some((v) => /--self-test is implemented but MISSING/.test(v)), 'fixture D: an undeclared self-proof spelling is flagged (blind spot)')

    // fixture E: THE TWELFTH CASE — a field matching NO known prefix must still be discovered and flagged
    const e = auditSelfReportedStatus({ sources: [{ file: 'fake-kernel.js', src: 'function status(){ return { reallyRan: true } }' }], gateSources: [{ file: 'gate', src: 'nothing here scans it' }] })
    ok(e.discovered.includes('reallyRan'), 'fixture E (twelfth case): a prefix-less field (reallyRan) IS discovered mechanically')
    ok(e.violations.length === 1 && /reallyRan/.test(e.violations[0]), 'fixture E: …and it goes RED when no gate scans it')
    const eMentioned = auditSelfReportedStatus({ sources: [{ file: 'fake-kernel.js', src: 'function status(){ return { mentionedOnly: false } }' }], gateSources: [{ file: 'gate', src: 'no scan' }] })
    ok(eMentioned.discovered.includes('mentionedOnly') && eMentioned.violations.length === 1, 'fixture E: mentionedOnly is discovered and flagged too (the gate can see its own new fields)')
    const eScanned = auditSelfReportedStatus({ sources: [{ file: 'fake-kernel.js', src: 'function status(){ return { reallyRan: true } }' }], gateSources: [{ file: 'gate', src: 'assert(status().reallyRan === true)' }] })
    ok(eScanned.violations.length === 0, 'fixture E (control): a scanning gate clears it')

    // fixture F: the declared table must reconcile BOTH ways
    const fGhost = auditSelfReportTable({ sources: [{ file: 'x.js', src: 'function status(){ return { dropped: 0 } }' }], declared: ['ghostField', 'dropped'] })
    ok(fGhost.violations.some((v) => /ghostField.*ghost entry/.test(v)), 'fixture F: a declared-but-undiscovered field is flagged as a ghost')
    const fBlind = auditSelfReportTable({ sources: [{ file: 'x.js', src: 'function status(){ return { surprisingScan: true } }' }], declared: [] })
    ok(fBlind.violations.some((v) => /surprisingScan.*blind spot/.test(v)), 'fixture F: a discovered-but-undeclared field is flagged as a blind spot')

    // fixture G (task-211): RULE D — three two-way self-tests, none of them a false red
    const impl = new Set(['vibe_vmu_status', 'vibe_vmu_records'])
    const gRed = auditDocToolNames({ docs: [{ file: 'fake-doc.md', src: 'call `vibe_vmu_ballot` here\n' }], implemented: impl })
    ok(gRed.violations.length === 1 && /fake-doc\.md:1 documents "vibe_vmu_ballot"/.test(gRed.violations[0]), 'fixture G①: an unimplemented, unmarked tool name ⇒ RED with file:line')
    const gImpl = auditDocToolNames({ docs: [{ file: 'fake-doc.md', src: 'call `vibe_vmu_status` here\n' }], implemented: impl })
    ok(gImpl.violations.length === 0, 'fixture G②: a name that IS in TOOL_NAMES ⇒ green')
    const gMarked = auditDocToolNames({ docs: [{ file: 'fake-doc.md', src: '`vibe_vmu_ballot`（规划 ✗ 未实现）\n' }], implemented: impl })
    ok(gMarked.violations.length === 0, 'fixture G③: an unimplemented name WITH an explicit marker ⇒ green (no false red)')
    // the "planning list" exception: a marked table header covers its rows…
    const gTable = auditDocToolNames({ docs: [{ file: 'fake-doc.md', src: '| 工具（规划/未实现 ⛔） | 说明 |\n|---|---|\n| `vibe_vmu_ballot` | 目标形态 |\n' }], implemented: impl })
    ok(gTable.violations.length === 0, 'fixture G④: a marked table header covers its rows (planning-list exception)')
    // …but an unmarked table must NOT be excused
    const gTableBare = auditDocToolNames({ docs: [{ file: 'fake-doc.md', src: '| 工具 | 说明 |\n|---|---|\n| `vibe_vmu_ballot` | 表决 |\n' }], implemented: impl })
    ok(gTableBare.violations.length === 1, 'fixture G⑤: an UNMARKED table row is still red (the exception is not a loophole)')

    // fixture H (task-221): RULE E — three two-way self-tests
    const hA = auditVacuousAssertions({ files: [{ file: 'fake.test.mjs', src: 'const arr = []\nok(arr.every((x) => x > 0), "all positive")\n' }] })
    ok(hA.violations.length === 1 && /\[A\]/.test(hA.violations[0]), 'fixture H①: arr.every(...) with no non-empty precondition ⇒ RED (shape A)')
    const hGuard = auditVacuousAssertions({ files: [{ file: 'fake.test.mjs', src: 'const arr = []\nok(arr.length > 0, "non-vacuous")\nok(arr.every((x) => x > 0), "all positive")\n' }] })
    ok(hGuard.violations.length === 0, 'fixture H②: the same line WITH a non-empty guard ⇒ green')
    const hCond = auditVacuousAssertions({ files: [{ file: 'fake.test.mjs', src: 'if (mode === "strict") { ok(codes.length > 2, "more than two codes") }\n' }] })
    ok(hCond.violations.length === 1 && /\[C\]/.test(hCond.violations[0]), 'fixture H③: a conditional assertion whose branch may never run ⇒ RED (shape C)')
    const hCatch = auditVacuousAssertions({ files: [{ file: 'fake.test.mjs', src: 'try { risky() } catch (e) { ok(true, "no throw") }\n' }] })
    ok(hCatch.violations.length === 1 && /\[D\]/.test(hCatch.violations[0]), 'fixture H④: catch{ok(true)} swallows the failure ⇒ RED (shape D)')
    const hAllowed = auditVacuousAssertions({ files: [{ file: 'fake.test.mjs', src: 'ok(arr.every((x) => x > 0), "all positive") // EMPTY_ALLOWED: the empty case is the point\n' }] })
    ok(hAllowed.violations.length === 0 && hAllowed.coverage[0].excused === true, 'fixture H⑤: an explicit EMPTY_ALLOWED comment is the sanctioned exception')
    // fixture I (task-222): graded enforcement — B/C/D red, A counted but not red, A GROWTH red
    const iBCD = auditVacuousAssertions({ files: [{ file: 'fake.test.mjs', src: 'if (m) { ok(a.length > 2, "more than two") }\ntry { go() } catch (e) { ok(true, "swallowed") }\n' }] })
    ok(iBCD.violations.length === 2 && iBCD.violations.every((v) => !/\[A\]/.test(v)), 'fixture I①: C and D are violations, unrelated to shape A')
    const iA = auditVacuousAssertions({ files: [{ file: 'fake.test.mjs', src: 'ok(arr.every((x) => x > 0), "all positive")\n' }] })
    ok(iA.violations.length === 1 && /\[A\]/.test(iA.violations[0]), 'fixture I②: a shape-A hit is produced (counted)')
    const atBaseline = aClassGrowth(['f:1 [A] x', 'f:2 [A] y'], 2)
    const overBaseline = aClassGrowth(['f:1 [A] x', 'f:2 [A] y', 'f:3 [A] z'], 2)
    ok(atBaseline.grew === false && atBaseline.violations.length === 0, 'fixture I③: A at the baseline does NOT fail')
    ok(overBaseline.grew === true && /shape A grew from 2 to 3/.test(overBaseline.violations[0]), 'fixture I④: ONE new shape-A vacuous pass ⇒ RED (the sink cannot grow back)')
    const iGuardEq = auditVacuousAssertions({ files: [{ file: 'fake.test.mjs', src: 'ok(arr.length === 5, "five")\nok(arr.every((x) => x > 0), "all positive")\n' }] })
    ok(iGuardEq.violations.length === 0, 'fixture I⑤: `length === <positive int>` counts as a non-empty guard (task-222 precision fix)')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

console.log('  RULE A coverage: ' + JSON.stringify(ruleA.coverage))
console.log('=== DECLARATION CRITERION: ' + pass + ' passed, ' + fail + ' failed ===')
process.exit(fail ? 1 : 0)

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
import { TOOL_NAMES } from '../vibe-math-vmu/host.js'

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
  // ROUND 224: `paused` - kernel/control.js reports the paused scopes in status(); the mechanical extraction found the
  // field and the gate demanded it be declared rather than left as a blind spot.
  'paused',
  'accounts', 'alreadyRecused', 'attested', 'collusionScan', 'extraWiredCount', 'ran', 'receipted',
  'recorded', 'refused', 'reputationGrantsAuthority', 'reused', 'trustUsedForAuthority',
  // ROUND 205: `unreached` - the wake-retry rail reports an exhausted member this way (vmu.meetings.wakeRetries);
  // the claim-family discovery finds it through `reach`, and tests/vmu-meetings.test.mjs is the gate that scans it.
  'unknownKindRefused', 'unknownVersionRefused', 'unreached', 'unverifiable', 'unverified', 'unwiredCount',
  'usedBy', 'usedBytes', 'verified', 'wired', 'wiredCount',
  // a fixture-only field name (it exists only inside this gate's own negative fixture, and is scanned here)
  'surprisingScan',
  // ROUND 520: mechanically DISCOVERED by this suite's own scan and missing from the declared table -
  // the blind spot the audit exists to find, found in its own subject. `droppedIsCounted` is reported by a ring/retention
  // path when a row is dropped and the drop is counted.
  'droppedIsCounted',
  // ROUND 2 (handover): three fields this suite's own mechanical extraction discovered in the round's new/rewritten
  // modules. Each is declared WITH its meaning and its source file, because an undeclared discovery is exactly the
  // blind spot this rule exists to find (and the fix is to declare it here, never to stop discovering it):
  //   · `countsTowardsRound` - kernel/meeting.js:392 - a speech receipt says whether the speech counts toward the
  //     round, so a caller can never mistake a recorded-but-not-counted speech for a delivered one.
  //   · `unwired`            - kernel/arbitration.js:110 - counts wiring gaps (bus topics / the minutes seam) and
  //     publishes them on the `arbitration/hook-unwired` rail.
  //   · `wiredKeys`          - kernel/mathadapters.js:708 - status() reports how many settings keys the adapter
  //     face actually wired.
  'countsTowardsRound', 'unwired', 'wiredKeys',
  // ROUND 4: discovered by this suite's own mechanical scan. `checked` is the RESUME READBACK's count of the
  // expectations it actually compared (`kernel/resume.js:649` returns `{ consistent, checked: expectations.size,
  // drift, code }`, and `:889` forwards it into the recovery report's `readback` step) - the number that turns
  // "we verified it" into a measurement instead of a claim. NOTE `host.js:326` also uses `checked:false` (the
  // tool-filter passthrough): same word, different surface, which is exactly why the source is written here.
  'checked',
  // ROUND 520 (live run 8, finding F): the no-transport REFUSAL now carries the same two facts its status() does, so the
  // mechanical extraction sees `transportInjected` (and the pair `neverDrives`/`drives`) on the refusal path as well as
  // on the read face. Declared here WITH the reason: `kernel/report.js` report/tick receipts report whether a delivery
  // transport was injected, because "nothing was sent" must be readable from the call that failed - and a refusal is a
  // read face too. `neverDrives` rides along in the same declaration for the same reason (drives:false is a claim).
  'transportInjected',
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
/** Evidence that a collection really was non-empty BEFORE the assertion (the required precondition).
 *  task-233 precision fix: `>= <positive int>` (NOT `>= 0`, which is trivially true), `.size > 0` for
 *  Set/Map, and `Object.keys(x).length > 0` all PROVE non-emptiness; they used to be false positives. */
export const NON_EMPTY_GUARD = /(\.length\s*>\s*0|\.length\s*!==\s*0|\.length\s*>=\s*[1-9]\d*|\.length\s*===\s*[1-9]\d*|\.size\s*>\s*0|\.size\s*>=\s*[1-9]\d*|\.size\s*!==\s*0|Object\.keys\([^)]*\)\.length|non-vacuous|scanned\s*>\s*0)/
/** The deliberately-NOT-a-guard forms (kept explicit so a fixture can prove they stay red). */
export const NOT_A_GUARD = /\.length\s*>=\s*0|\.size\s*>=\s*0|\.length\s*!==\s*-1/
/**
 * Stable per-hit receiver text. ROUND 182: the fingerprint is `file:shape:receiver`, WITHOUT the line number - task-228
 * had `file:line:shape:receiver`, and the measured cost of the line was eight phantom "new vacuous passes" paired with
 * eight phantom "disappeared baseline entries" after one beneficial edit, the pairs differing only by the offset. A line
 * number carries no semantics for the question this baseline asks, and duplicates collapsing into one entry is right: a
 * second instance of a known shape is not news.
 */
export function receiverOf(shape, line) {
  if (shape === 'B') {
    const eq = /(\w+)\.length\s*===\s*(\w+)\.length/.exec(line) || /JSON\.stringify\((\w+)\)\s*===\s*JSON\.stringify\((\w+)\)/.exec(line)
    return eq ? eq[1] + '~' + eq[2] : 'pair'
  }
  if (shape === 'C') return 'conditional'
  // ROUND 17 / task-118 ②: the MULTI-LINE twin of C. Its receiver is the FILE (fingerprint `file:C2:conditional`, one
  // entry per file) on purpose: MEASURED, this shape occurs 199 times on this tree and 125 of those are unexcused -
  // overwhelmingly ORDINARY scenario/feature control flow (`if (P.dir === 'vibe-math-v4') {`, `if (scn.outcomeDiff) {`,
  // `if (SELF_PROBE) {`). A per-LINE identity would churn the baseline on every edit, so the unit is the file.
  if (shape === 'C2') return 'conditional'
  if (shape === 'D') return 'catch'
  if (shape === 'A') {
    const every = /([A-Za-z_$][\w$.\[\]]*)\.every\s*\(/.exec(line)
    if (every) return every[1]
    const filt = /([A-Za-z_$][\w$.\[\]]*)\.filter\s*\([^)]*\)\.length\s*===\s*0/.exec(line)
    if (filt) return 'filter:' + filt[1]
    const of = /\bof\s+([A-Za-z_$][\w$.\[\]]*)/.exec(line)
    if (of) return 'for:' + of[1]
  }
  return 'line'
}
export const A_FINGERPRINT_SHAPE = 'file:shape:receiver'
export const hitFingerprint = (c) => c.file + ':' + c.shape + ':' + (c.receiver || 'line')
/** Set difference: pure additions AND pure deletions are both violations (the list must be synced). */
export function diffFingerprints(baseline, current) {
  const base = new Set(baseline)
  const cur = new Set(current)
  return { added: [...cur].filter((f) => !base.has(f)).sort(), removed: [...base].filter((f) => !cur.has(f)).sort() }
}
// A-CLASS-BASELINE-BEGIN (generated by: node tests/audit-declaration-criterion.test.mjs --write-baseline)
export const A_CLASS_BASELINE_FINGERPRINTS = Object.freeze([
  'audit-artifact-docs.mutants.mjs:A:for:probes',
  'audit-code-status.test.mjs:A:handCodes]',
  'audit-code-status.test.mjs:A:implemented',
  'audit-corrupt-file-guard.test.mjs:A:for:CASES',
  'audit-diagram-assets.test.mjs:A:want',
  'audit-doc-line-refs.test.mjs:A:KNOWN_OUT_OF_RANGE',
  'audit-installer-assertions.mutants.mjs:A:for:CASES',
  'audit-math-computation-contract.mjs:A:for:PRESETS',
  'audit-math-computation-contract.mjs:A:for:SIX',
  'audit-participant-set-parity.mjs:A:producers',
  'audit-participant-set-parity.mjs:A:setAndVersion',
  'audit-path-consistency.test.mjs:A:for:ids',
  'audit-path-consistency.test.mjs:A:for:returned',
  'audit-prompt-retired-mechanisms.test.mjs:A:for:OBSOLETE',
  'audit-prompt-retired-mechanisms.test.mjs:A:for:assemblies',
  'audit-prompt-retired-mechanisms.test.mjs:A:for:o.needles',
  'audit-prompt-tool-params.test.mjs:A:PROMPT_PARAM_DIVERGENCES',
  'audit-prompt-tool-params.test.mjs:A:for:PROMPT_PARAM_DIVERGENCES',
  'audit-prompt-tool-params.test.mjs:A:for:PROMPT_PARAM_DIVERGENCES',
  'audit-readme-counts.mjs:A:for:text.matchAll',
  'audit-status-report-fields.mjs:A:for:cases',
  'b1prime-reportfeedback-shape-pin.test.mjs:A:KEYS',
  'b1prime-reportfeedback-shape-pin.test.mjs:A:KEYS',
  'e2e-v4-fixes.test.mjs:A:st1.busy',
  'formal-verify-v4.test.mjs:A:corpus',
  'math-computation-archive-rerun.mutants.mjs:A:for:CASES',
  'math-computation-discovery.mutants.mjs:A:for:CASES',
  'v3-fix-probes.test.mjs:A:files',
  'v4-final-paper.test.mjs:A:heads',
  'v4-final-paper.test.mjs:A:heads',
  'vmu-ab-v5r-verification.test.mjs:A:line',
  'vmu-alerts.test.mjs:A:after.results',
  'vmu-audit.test.mjs:A:items',
  'vmu-bidding-audit.test.mjs:A:for:Object.keys',
  'vmu-board-audit.test.mjs:A:for:Object.keys',
  'vmu-capacity.test.mjs:A:outcomes',
  'vmu-clockguard.test.mjs:A:skews',
  'vmu-compliance.test.mjs:A:ar.fired',
  'vmu-conference.test.mjs:A:r1.agenda.placements',
  'vmu-containment.test.mjs:A:PACK.codes',
  'vmu-course.test.mjs:A:for:WIRED_COURSE_KEYS',
  'vmu-crypto.test.mjs:A:five',
  'vmu-fairness.test.mjs:A:crossed.shares',
  'vmu-fairness.test.mjs:A:line',
  'vmu-fairness.test.mjs:A:many.shares',
  'vmu-fairness.test.mjs:A:rb.shares',
  'vmu-host-hooks.test.mjs:A:line',
  'vmu-host-hooks.test.mjs:A:line',
  'vmu-host-hooks.test.mjs:A:line',
  'vmu-host.test.mjs:A:after.entries',
  'vmu-host.test.mjs:A:spec.parameters.required',
  'vmu-math.test.mjs:A:for:cases',
  'vmu-mathtools.test.mjs:A:for:failures',
  'vmu-mathtools.test.mjs:A:st.plannedKeys',
  'vmu-meeting-procedures-catalog.test.mjs:A:noSkeleton',
  'vmu-metrics.test.mjs:A:allAt',
  'vmu-metrics.test.mjs:A:line',
  'vmu-migration.test.mjs:A:outcomes',
  'vmu-minutes-tool.test.mjs:A:line',
  'vmu-ops-cannot-decide.test.mjs:A:for:VERDICT_WRITES',
  'vmu-pack-defaults-named.test.mjs:A:LOST_TOOLS',
  'vmu-pack-manifest-pointers.test.mjs:A:for:dirs',
  'vmu-pack-tool-args.test.mjs:A:for:cardTools',
  'vmu-paper.test.mjs:A:PLANNED_KEYS',
  'vmu-planned-settings.test.mjs:A:keys',
  'vmu-prompt-v5r-bridge.test.mjs:A:names',
  'vmu-prompt-v5r-bridge.test.mjs:A:v5rPromptSections',
  'vmu-prompt.test.mjs:A:sections',
  'vmu-rules.test.mjs:A:capabilityKeys',
  'vmu-run14-findings.test.mjs:A:hist',
  'vmu-scheduler.test.mjs:A:line',
  'vmu-settings.test.mjs:A:defs',
  'vmu-store.test.mjs:A:m.PUBLIC_KEYS',
  'vmu-storepolicy.test.mjs:A:for:receipts',
  'vmu-ten-faces-tunable.test.mjs:A:for:the',
  'vmu-tenure.test.mjs:A:ar.fired',
  'vmu-transaction.test.mjs:A:line',
  'vmu-trust.test.mjs:A:four',
  'vmu-turn.test.mjs:A:for:CHARTER_BLOCKS.filter',
  'vmu-turn.test.mjs:A:for:phases',
  'vmu-turn.test.mjs:A:for:variants',
  'vmu-turn.test.mjs:A:ticks',
  'vmu-turn.test.mjs:A:ticks',
])
// A-CLASS-BASELINE-END
// ROUND 17 / task-118 ②: the shape-C blind spot is CLOSED by seeing the multi-line form, but it is enforced the same
// way shape A is - as a per-FILE fingerprint set - because MEASURED, this syntactic shape is overwhelmingly ordinary
// scenario/feature control flow (125 unexcused occurrences before the baseline existed; the inventory is in
// `docs/acceptance/verify-round17-report.md` §2). A blanket red would be a false-positive machine and would push authors
// to sprinkle EMPTY_ALLOWED comments everywhere - exactly the whitelist drift this repo keeps fighting. What the
// baseline buys: a NEW file with a multi-line conditional assertion is RED, and REMOVING one is red until the list is
// synced, so the shape can only shrink deliberately. (This comment sits OUTSIDE the generated block on purpose:
// `--write-baseline` rewrites everything between the markers.)
// MULTILINE-C-BASELINE-BEGIN (generated by: node tests/audit-declaration-criterion.test.mjs --write-baseline)
export const MULTILINE_C_BASELINE_FINGERPRINTS = Object.freeze([
  'accept-ab-v5-minimal.test.mjs:C2:conditional',
  'audit-artifact-docs.mutants.mjs:C2:conditional',
  'audit-doc-actions.test.mjs:C2:conditional',
  'audit-enforced-consistency.test.mjs:C2:conditional',
  'audit-engine-faces.mjs:C2:conditional',
  'audit-f2-filter-fix.test.mjs:C2:conditional',
  'audit-generators-current.test.mjs:C2:conditional',
  'audit-math-computation-contract.mjs:C2:conditional',
  'audit-path-discipline.mjs:C2:conditional',
  'audit-persona-surface.mutants.mjs:C2:conditional',
  'audit-preset-declaration-group.test.mjs:C2:conditional',
  'audit-readme-counts.mjs:C2:conditional',
  'audit-readme-counts.mutants.mjs:C2:conditional',
  'audit-settings-channels.test.mjs:C2:conditional',
  'audit-status-report-fields.mjs:C2:conditional',
  'audit-status-report-fields.mutants.mjs:C2:conditional',
  'audit-vmu-orphan-methods.test.mjs:C2:conditional',
  'b1prime-reportfeedback-shape-pin.test.mjs:C2:conditional',
  'clean-temp-root-guard.test.mjs:C2:conditional',
  'e2e-business.test.mjs:C2:conditional',
  'e2e-v3.test.mjs:C2:conditional',
  'formal-verify-v2.test.mjs:C2:conditional',
  'formal-verify-v3.test.mjs:C2:conditional',
  'formal-verify-v4.test.mjs:C2:conditional',
  'math-computation-shared.test.mjs:C2:conditional',
  'math-computation-v4.test.mjs:C2:conditional',
  'prompt-v5-integrity.test.mjs:C2:conditional',
  'run-tests.mjs:C2:conditional',
  'run-tests.mutants.mjs:C2:conditional',
  'selfdrive-v5.mjs:C2:conditional',
  'v2-fix-probes.test.mjs:C2:conditional',
  'v2-list-agents-and-next-step.mutants.mjs:C2:conditional',
  'v2-tool-cap.test.mjs:C2:conditional',
  'vmu-assistant-host-slice.test.mjs:C2:conditional',
  'vmu-assistant-report.test.mjs:C2:conditional',
  'vmu-ballot.test.mjs:C2:conditional',
  'vmu-board-audit.test.mjs:C2:conditional',
  'vmu-bus.test.mjs:C2:conditional',
  'vmu-control.test.mjs:C2:conditional',
  'vmu-entry.test.mjs:C2:conditional',
  'vmu-fidelity-conclude.test.mjs:C2:conditional',
  'vmu-formal-pipeline.test.mjs:C2:conditional',
  'vmu-funding.test.mjs:C2:conditional',
  'vmu-host-hooks.test.mjs:C2:conditional',
  'vmu-host.test.mjs:C2:conditional',
  'vmu-kernel.test.mjs:C2:conditional',
  'vmu-library.test.mjs:C2:conditional',
  'vmu-loader.test.mjs:C2:conditional',
  'vmu-math.test.mjs:C2:conditional',
  'vmu-meeting.test.mjs:C2:conditional',
  'vmu-meetings.test.mjs:C2:conditional',
  'vmu-members.test.mjs:C2:conditional',
  'vmu-migration.test.mjs:C2:conditional',
  'vmu-pack.test.mjs:C2:conditional',
  'vmu-prompt.test.mjs:C2:conditional',
  'vmu-registry.test.mjs:C2:conditional',
  'vmu-resume-e2e.test.mjs:C2:conditional',
  'vmu-rules.test.mjs:C2:conditional',
  'vmu-script-bridge.test.mjs:C2:conditional',
  'vmu-script-service.test.mjs:C2:conditional',
  'vmu-script.test.mjs:C2:conditional',
  'vmu-set-attribution.test.mjs:C2:conditional',
  'vmu-settings.test.mjs:C2:conditional',
  'vmu-store.test.mjs:C2:conditional',
  'vmu-v3-prompts.test.mjs:C2:conditional',
  'vmu-v5r-tools.test.mjs:C2:conditional',
])
// MULTILINE-C-BASELINE-END
/** Kept for visibility: the COUNT is reported, but the enforcement is the fingerprint SET below. */
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
        const receiver = receiverOf(shape, line)
        coverage.push({ file: basename(f.file), line: i + 1, shape, receiver, excused, text: line.trim(), ctx: lines.slice(Math.max(0, i - 3), i + 3).map((l) => l.trim()) })
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
    // ROUND 17 / task-118 ② — THE BLIND SPOT THIS CLOSES, in its OWN pass so the candidate set of the shapes above is
    // untouched (their baselines must not move): the rule above only sees `if (…) { ok(…) }` written on ONE line, so a
    // conditional assertion spread over lines was INVISIBLE - and R16's four escapes (assertions that had NEVER
    // executed) lived in exactly that shadow. The judge is deliberately NARROW: statement-position `if` (a string
    // literal or a mutant's `find:` text is not code - 第七条), a brace-tracked block, an assertion inside, and NOT a
    // pure failure report (`ok(false, …)` FAILS when taken, so that branch silently skips nothing).
    lines.forEach((line, i) => {
      if (/^[ \t]*(?:\}[ \t]*)?(?:else[ \t]+)?if\s*\(/.test(line)
        && !/\bif\s*\([^)]*\)\s*\{\s*[^}]*\b(ok|assert|red)\s*\(/.test(line)) {
        let c2depth = 0, c2started = false, c2body = ''
        for (let j = i; j < Math.min(lines.length, i + 40); j++) {
          c2body += lines[j] + '\n'
          for (const ch of lines[j]) { if (ch === '{') { c2depth++; c2started = true } else if (ch === '}') c2depth-- }
          if (c2started && c2depth <= 0) break
        }
        if (c2started) {
          const c2open = c2body.indexOf('{')
          const c2inner = c2body.slice(c2open + 1, c2body.lastIndexOf('}'))
          const c2asserts = (c2inner.match(/\b(ok|assert|assert\.ok|red)\s*\(/g) || []).length
          const c2failOnly = (c2inner.match(/\b(ok|assert|assert\.ok|red)\s*\(\s*false/g) || []).length
          if (c2asserts > 0 && c2asserts !== c2failOnly) {
            const c2near = lines.slice(Math.max(0, i - window), i + 1).join('\n')
            const c2excused = EMPTY_ALLOWED.test(c2body) || EMPTY_ALLOWED.test(c2near)
              || NON_EMPTY_GUARD.test(c2body) || NON_EMPTY_GUARD.test(c2near)
            coverage.push({ file: basename(f.file), line: i + 1, shape: 'C2', receiver: 'conditional', excused: c2excused, text: line.trim(), ctx: lines.slice(Math.max(0, i - 3), i + 3).map((l) => l.trim()) })
            if (!c2excused) violations.push(basename(f.file) + ':' + (i + 1) + ' [C2] a MULTI-LINE conditional assertion: if the branch never runs, the check is skipped and nothing else reports it')
          }
        }
      }
    })
  }
  return { violations, coverage }
}

/**
 * RULE F (task-238 — the FIFTEENTH case): the shared timevalue entry point has ONE sentinel (`NaN`) and ONE
 * strict twin (`msStrict`). A call to a LOOSE alias (`ms`, or `ms as toMs`) must handle "cannot interpret" at
 * the call site — a `Number.isFinite(...)`/`Number.isNaN(...)` check on the same line or within `window`
 * lines. A call to a STRICT alias is self-guarding and always clean. Comments are not call sites.
 * Why: three faces used to disagree on an unparseable instant (one refused, one returned ok:true, one stored
 * the raw string) — the gate turns "handled it" into a machine criterion instead of a promise.
 */
export function auditTimeValueHandling({ sources, window = 3 }) {
  const violations = []
  const coverage = []
  for (const f of sources) {
    const src = String(f.src)
    const imp = /import\s*\{([^}]*)\}\s*from\s*'\.\/timevalue\.js'/.exec(src)
    if (!imp) continue
    const loose = []
    const strict = []
    for (const raw of imp[1].split(',')) {
      const m = /^(\w+)(?:\s+as\s+(\w+))?$/.exec(raw.trim())
      if (!m) continue
      const local = m[2] || m[1]
      if (m[1] === 'ms') loose.push(local)
      else if (m[1] === 'msStrict') strict.push(local)
    }
    if (!loose.length && !strict.length) continue
    const lines = src.split('\n')
    lines.forEach((line, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return            // comments are not call sites (block comments too)
      const code = line.split('//')[0]
      if (!code.trim()) return
      const hits = (aliases) => aliases.find((a) => new RegExp('(?<![\\w$.])' + a + '\\s*\\(').test(code))
      const strictHit = hits(strict)
      const looseHit = hits(loose)
      if (strictHit && !looseHit) { coverage.push({ file: basename(f.file), line: i + 1, alias: strictHit, strict: true, guarded: true }); return }
      if (!looseHit) return
      const near = lines.slice(i, i + window + 1).join('\n')
      const guarded = /Number\.isFinite\s*\(|Number\.isNaN\s*\(|\bisNaN\s*\(/.test(near)
      coverage.push({ file: basename(f.file), line: i + 1, alias: looseHit, strict: false, guarded })
      if (!guarded) {
        violations.push(basename(f.file) + ':' + (i + 1) + ' calls ' + looseHit + '(...) without handling NaN (add Number.isFinite(...) or use msStrict)')
      }
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
// ROUND 3: `generate-wired-schema.mjs` grew a `--selftest` (the KEY_SHAPE / comment-borne pseudo-key probe). A
// self-proof mode with no execution point is exactly the eleventh case this gate exists to catch, so it is RUN
// here rather than merely declared in the script's flag table.
const keyShapeRun = runSelfProof('generate-wired-schema.mjs', '--selftest')
ok(keyShapeRun && keyShapeRun.status === 0,
  'the wired-schema KEY_SHAPE --selftest really runs green (round 3: the "a key quoted in a COMMENT is not a key" probe has an execution point)',
  keyShapeRun ? 'exit=' + keyShapeRun.status : 'not run')
const inspectRun = runSelfProof('slv-inspect.mjs', '--selftest')
ok(inspectRun && inspectRun.status === 0, 'slv-inspect --selftest really runs green (it plants prompt/wire/unknown-call mismatches and must report them)')
const noConsumerRun = runSelfProof('audit-readers.mjs', '--selftest')
ok(noConsumerRun && noConsumerRun.status === 0, 'audit-readers --selftest really runs green (renamed from audit-no-consumer: the wiring layer asks 读点／读取者, never 消费者 — docs/01 §1.4.2; it plants a mechanism with no reader and requires A)')
const cleanRun = runSelfProof('clean-temp.mjs', '--self-test')
ok(cleanRun && cleanRun.status === 0, 'clean-temp --self-test really runs green (declared self-proof flag #2)')
const releaseRun = runSelfProof('release-check.mjs', '--self-test')
ok(releaseRun && releaseRun.status === 0, 'release-check --self-test really runs green (declared self-proof flag #3)')
// ROUND 9: `scripts/audit-pack-value-domain.mjs` (vmu-pack's value-domain gate, D-05) grew a `--selftest` that
// PROVES the checker bites: it plants an out-of-domain value and requires the checker to report it. A self-proof
// mode with no execution point is the very case this rule exists for, so it is RUN here.
const valueDomainRun = runSelfProof('audit-pack-value-domain.mjs', '--selftest')
ok(valueDomainRun && valueDomainRun.status === 0,
  'the pack value-domain --selftest really runs green (round 9: it plants an out-of-domain value and requires the checker to report it - and it caught a REAL instance on its first day)',
  valueDomainRun ? 'exit=' + valueDomainRun.status : 'not run')
// ROUND 11 / task-88: `scripts/audit-pack-middleware-shape.mjs` proves the two middleware SHAPES are told apart
// (an inline handler must not reach for `api` or claim `trigger-workflow`; a module shape must declare the
// capabilities it really uses). Its `--selftest` plants four malformed entries and requires each to be refused.
// A self-proof with no execution point is exactly what this rule exists for, so it is RUN here.
const middlewareShapeRun = runSelfProof('audit-pack-middleware-shape.mjs', '--selftest')
ok(middlewareShapeRun && middlewareShapeRun.status === 0,
  'the pack middleware-shape --selftest really runs green (round 11: it plants four malformed entries and requires each to be refused - so a declared shape cannot be silently unhonoured)',
  middlewareShapeRun ? 'exit=' + middlewareShapeRun.status : 'not run')
// ROUND 11 / task-83: `scripts/audit-projection-census.mjs` is SELF-PROVING - it files every declared projection
// face into attached/viaAlias/notAttached and then PLANTS a non-existent face to require that the census reports
// it. A self-proof with no execution point is the very case this rule exists for, so it is RUN here (with no flag:
// the probe is inline, not behind `--selftest`).
const censusRun = runSelfProof('audit-projection-census.mjs', '')
ok(censusRun && censusRun.status === 0,
  'the projection census really runs green (round 11: it files every declared face with a code+reason and proves it would report a planted face - so no declaration can go missing silently)',
  censusRun ? 'exit=' + censusRun.status : 'not run')
// ROUND 13 / task-102, count corrected in ROUND 15 / task-114 (the declared numbers must be the MEASURED ones:
// `--selftest` printed `14 passed, 0 failed`, and these are exactly what its §0/§0b/§0c/§0d drive). A self-proof mode
// with no execution point is exactly what RULE A exists for, so it is RUN here.
//   §0  four predicate cases (an acquisition without a `finally` fires; the SAME acquisition WITH one is quiet while
//       the site is still seen; a timer AND a listener fire; a comment/string is not a site - D7);
//   §0b  SEVEN refused directions of the FIVE-WORD closed ruling vocabulary (unknown word / tripwire / unbacked
//       `成对-finally` / unbacked `睡式-无柄` / `他门已守` without a gate, with a DEAD gate, with a gate that never
//       mentions the module) and FOUR accepted directions (a real sleep, a no-site `不涉及`, a real `finally`, a gate
//       pointer that really guards);
//   §0c  R14's authority word: FIVE refused directions (authority with no lock store / authority + timer / authority +
//       listener / an authority filed `不涉及` / an authority without a gate pointer) and TWO accepted (a synthetic
//       authority, and the LIVE `kernel/storepolicy.js`);
//   §0d  the REAL-TREE rule (§2/§3/§5) as ONE pure `judgeTree()` driven by NINE planted violations that each redden
//       the list they name, plus an honest fixture that must leave all five lists EMPTY (so the planted direction is
//       not "everything is always red");
//   §1   one REAL-file injection through `mutateOnce` that must redden BOTH granularities, and `resume.js` as the
//       positive control that the scanner is not blind.
const acquireReleaseRun = runSelfProof('audit-acquire-release.mjs', '--selftest')
ok(acquireReleaseRun && acquireReleaseRun.status === 0,
  'the acquire↔release --selftest really runs green (round 13, counts corrected round 15: four predicate cases, SEVEN refused + FOUR accepted directions of the five-word closed ruling vocabulary, R14\'s authority word with FIVE refused + TWO accepted directions, NINE planted violations driving the same real-tree `judgeTree()` plus an all-empty honest fixture, a real-file one-line injection that reddens BOTH granularities, and a positive control that the scanner is not blind)',
  acquireReleaseRun ? 'exit=' + acquireReleaseRun.status : 'not run')
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
  ok(implementedTools.size === Object.keys(TOOL_NAMES).length, 'the parsed count EQUALS the imported TOOL_NAMES (' + implementedTools.size + ' names), so a narrowing parse cannot pass on a low bound')
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
// task-222 GRADED enforcement: B/C/D fail immediately (C being the most dangerous); shape A is COUNTED
// and listed but does not fail — task-228: it is enforced as a FINGERPRINT SET (see below), so an
// "equivalent replacement" (drop one, add one, same total) can no longer slip through.
// ROUND 17: [C2] (the MULTI-LINE form) is enforced by its own baseline below - deliberately NOT part of the
// zero-tolerance B/C/D band, because MEASURED it is overwhelmingly ordinary scenario control flow (see the C2 block).
const ruleENonA = ruleE.violations.filter((v) => !/\[A\]/.test(v) && !/\[C2\]/.test(v))
red(ruleENonA, 'RULE E (shapes B/C/D must not exist: conditional assertions / empty-vs-empty comparisons / swallowed failures)')
// ── PHASE 6 · 创始人指示（去掉不必要的门禁约束）：TWO RELAXATIONS, both deliberate ─────────────────────────
// (1) a `.every()` / `filter(...).length===0` over a NON-EMPTY LITERAL ARRAY defined in the same file can never be
//     vacuous, so it is its own non-empty guard. MEASURED false positive (this round): a constant list of five
//     names in a new test was flagged and demanded a baseline sync.
// (2) the A BASELINE is now ONE-WAY: a NEW fingerprint is red (the real defect), but a DISAPPEARED one is printed,
//     not red. Fixing a vacuous pass must not also be a bookkeeping task.
const literalArrayNames = (src) => new Set([...String(src).matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=\s*\[([\s\S]*?)\]/g)]
  .filter((m) => m[2].trim() !== '' && !/^[\s,]*$/.test(m[2])).map((m) => m[1]))
const literalCache = new Map()
const literalArraysOf = (file) => {
  if (!literalCache.has(file)) literalCache.set(file, literalArrayNames(readIf(file)))
  return literalCache.get(file)
}
for (const c of ruleE.coverage) {
  if (c.shape === 'A' && typeof c.receiver === 'string' && c.receiver && !c.receiver.includes('.') && literalArraysOf(c.file).has(c.receiver)) c.excused = true
}
ok(literalArrayNames('const X = [1, 2]\n').has('X') && !literalArrayNames('const Y = []\n').has('Y'),
  '★ SELF-PROOF: a NON-EMPTY literal array counts as its own non-empty guard, an empty one does not (synthetic)')
const growth = aClassGrowth(ruleE.violations)
const currentFingerprints = ruleE.coverage.filter((c) => !c.excused && c.shape === 'A').map(hitFingerprint).sort()
const fpDiff = diffFingerprints(A_CLASS_BASELINE_FINGERPRINTS, currentFingerprints)
console.log('  RULE E fingerprints: shape=' + A_FINGERPRINT_SHAPE + ' current=' + currentFingerprints.length + ' baseline=' + A_CLASS_BASELINE_FINGERPRINTS.length)
console.log('  RULE E shape A count (visibility only): a=' + growth.a + ' countBaseline=' + growth.baseline + ' (enforcement is the SET, not the count)')
red(fpDiff.added.map((f) => 'NEW vacuous pass (not in the baseline list): ' + f),
  'RULE E fingerprint set: pure ADDITIONS are red even when the total count is unchanged')
if (fpDiff.removed.length > 0) console.log('  ★ REPORT ONLY (no assertion): baseline entries no longer present (a fix, or a rename) = ' + fpDiff.removed.join(', '))
ok(fpDiff.added.length === 0, 'the A-class fingerprint set has no NEW entry (deletions are reported, not gated: `' + fpDiff.removed.length + '` disappeared)')
ok(diffFingerprints(['a'], ['a', 'b']).added.length === 1 && diffFingerprints(['a'], []).removed.length === 1,
  '★ SELF-PROOF: the one-way policy still SEES both an addition and a deletion — the addition reds, the deletion only reports')
// ── ROUND 17: the multi-line form of shape C (the blind spot), enforced as its own per-file fingerprint set ──────
// GRANULARITY, stated so it is not overclaimed: the fingerprint is `file:C2:conditional` - one entry per FILE, for the
// same reason ROUND 182 removed line numbers from shape A's fingerprints (a line number made ONE beneficial edit look
// like EIGHT new violations). Consequence, named rather than hidden: a NEW FILE containing the shape is RED, but a NEW
// occurrence inside an already-baselined file is NOT. The occurrence COUNT is printed beside the file count so growth
// stays visible; making the count itself a red was rejected because it punishes legitimate refactors (the same reason
// the A-class count is visibility-only, `A_CLASS_BASELINE`).
const multiCoverage = ruleE.coverage.filter((c) => !c.excused && c.shape === 'C2')
const currentMultiC = [...new Set(multiCoverage.map(hitFingerprint))].sort()
const multiDiff = diffFingerprints(MULTILINE_C_BASELINE_FINGERPRINTS, currentMultiC)
// ★ PHASE 6 · 创始人指示：C2 IS NOW A REPORT, NOT A GATE. Reason (the gate's own measurement, kept): this shape is
// overwhelming ordinary scenario/feature control flow, and gating it made every new file with a normal `if (x) { ok() }`
// a `--write-baseline` chore. The DETECTOR is unchanged and the self-probes below still prove it sees the shape; what
// stops being enforced is only the per-file baseline sync. Shapes B/C/D and one-line C above remain RED.
console.log('  RULE E multi-line C REPORT ONLY: files=' + currentMultiC.length + ' baseline=' + MULTILINE_C_BASELINE_FINGERPRINTS.length
  + ' newSinceBaseline=' + multiDiff.added.length + ' goneSinceBaseline=' + multiDiff.removed.length
  + ' (enforcement RELAXED: the shape is printed, not gated)')
if (multiDiff.added.length > 0) console.log('  ★ REPORT ONLY (no assertion): new multi-line conditional files = ' + multiDiff.added.join(', '))
ok(MULTILINE_C_BASELINE_FINGERPRINTS.length > 0 && Array.isArray(currentMultiC),
  'the multi-line C inventory was really read (non-vacuous scan), so the report is about a measured list')
// The OPPOSITE SELF-PROBES (docs/11 §4.2 第四条/第九条). Without them "the blind spot is closed" would itself be an
// unverified claim - and the compliant forms below are exactly the ones a blanket red would have punished.
{
  const c2of = (src) => auditVacuousAssertions({ files: [{ file: 'fake.test.mjs', src }] }).violations.filter((v) => /\[C2\]/.test(v))
  ok(c2of('if (mode === "strict") {\n  ok(codes.length > 2, "more than two")\n}\n').length === 1,
    '★ SELF-PROBE (multi-line C): a conditional assertion SPREAD OVER LINES is caught - this is the shape R16 was blind to')
  ok(c2of('if (codes.length > 0) {\n  ok(codes.every((c) => c), "all codes")\n}\n').length === 0,
    '★ SELF-PROBE (multi-line C): a branch carrying a NON-EMPTY GUARD stays QUIET (the compliant multi-line form)')
  ok(c2of('if (mode === "strict") { // EMPTY_ALLOWED: a declared accounting skip\n  ok(codes.length > 2, "x")\n}\n').length === 0,
    '★ SELF-PROBE (multi-line C): an explicitly accounted branch (EMPTY_ALLOWED) stays QUIET')
  ok(c2of('if (bad) {\n  ok(false, "the anchor is missing")\n}\n').length === 0,
    '★ SELF-PROBE (multi-line C): a FAILURE REPORT inside a branch stays QUIET (taken ⇒ it reddens by itself)')
  ok(c2of('const t = "if (x) { ok(1) }"\n').length === 0,
    '★ SELF-PROBE (multi-line C): an `if` inside a STRING LITERAL is not code (第七条)')
  ok(auditVacuousAssertions({ files: [{ file: 'fake.test.mjs', src: 'if (m) { ok(a.length > 2, "x") }\n' }] }).violations.filter((v) => /\[C\]/.test(v)).length === 1,
    '★ SELF-PROBE: the ONE-LINE form is still caught by shape C (the new pass did not replace it)')
}
if (process.argv.includes('--dump-rule-e')) {
  const hits = ruleE.coverage.filter((c) => !c.excused).map((c) => ({ file: c.file, line: c.line, shape: c.shape, receiver: c.receiver, fingerprint: hitFingerprint(c), text: c.text, ctx: c.ctx }))
  console.log('RULE_E_DUMP ' + JSON.stringify({ files: vacuousFiles.length, fingerprints: currentFingerprints, hits }))
  process.exit(0)
}
if (process.argv.includes('--write-baseline')) {
  const self = readFileSync(fileURLToPath(import.meta.url), 'utf8')
  const block = '// A-CLASS-BASELINE-BEGIN (generated by: node tests/audit-declaration-criterion.test.mjs --write-baseline)\n'
    + 'export const A_CLASS_BASELINE_FINGERPRINTS = Object.freeze([\n'
    + currentFingerprints.map((f) => "  '" + f + "',").join('\n') + '\n])\n'
    + '// A-CLASS-BASELINE-END'
  // ROUND 17: the multi-line C inventory gets its own generated block (same mechanism, same replacement semantics).
  const blockC = '// MULTILINE-C-BASELINE-BEGIN (generated by: node tests/audit-declaration-criterion.test.mjs --write-baseline)\n'
    + 'export const MULTILINE_C_BASELINE_FINGERPRINTS = Object.freeze([\n'
    + currentMultiC.map((f) => "  '" + f + "',").join('\n') + '\n])\n'
    + '// MULTILINE-C-BASELINE-END'
  const next = self.replace(/\/\/ A-CLASS-BASELINE-BEGIN[\s\S]*?\/\/ A-CLASS-BASELINE-END/, block)
    .replace(/\/\/ MULTILINE-C-BASELINE-BEGIN[\s\S]*?\/\/ MULTILINE-C-BASELINE-END/, blockC)
  writeFileSync(fileURLToPath(import.meta.url), next, 'utf8')
  console.log('WROTE-BASELINE entries=' + currentFingerprints.length + ' multiLineC=' + currentMultiC.length)
  process.exit(0)
}
for (const v of ruleE.violations.slice(0, 60)) console.log('    RULE-E-HIT ' + v)

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

    // fixture J (task-228): the A-class baseline is a FINGERPRINT SET — "equivalent replacement" is red
    const jReplace = diffFingerprints(['a.mjs:1:A:x', 'b.mjs:2:A:y'], ['a.mjs:1:A:x', 'c.mjs:3:A:z'])
    ok(jReplace.added.length === 1 && jReplace.removed.length === 1 && jReplace.removed[0] === 'b.mjs:2:A:y',
      'fixture J① (FOURTEENTH CASE): drop one + add one, SAME total ⇒ RED (a count-only baseline would have stayed green)')
    const jAdd = diffFingerprints(['a.mjs:1:A:x'], ['a.mjs:1:A:x', 'b.mjs:2:A:y'])
    ok(jAdd.added.length === 1 && jAdd.removed.length === 0, 'fixture J②: a pure ADDITION ⇒ red')
    const jDel = diffFingerprints(['a.mjs:1:A:x', 'b.mjs:2:A:y'], ['a.mjs:1:A:x'])
    ok(jDel.removed.length === 1 && jDel.added.length === 0, 'fixture J③: a pure DELETION ⇒ red (the list must be synced explicitly)')
    ok(hitFingerprint({ file: 'x.mjs', line: 7, shape: 'A', receiver: 'arr' }) === 'x.mjs:A:arr' && A_FINGERPRINT_SHAPE === 'file:shape:receiver',
  'fixture J④: the fingerprint shape is file:shape:receiver, and the LINE NUMBER is deliberately absent')
ok(hitFingerprint({ file: 'x.mjs', line: 999, shape: 'A', receiver: 'arr' }) === hitFingerprint({ file: 'x.mjs', line: 1, shape: 'A', receiver: 'arr' }),
  'fixture J⑤ (round 182): the same hit at two different lines fingerprints IDENTICALLY, so an unrelated edit above it cannot redden this check')

    // fixture K (task-233): the extended non-empty guards, and the trivially-true form that must stay red
    const kGe2 = auditVacuousAssertions({ files: [{ file: 'fake.test.mjs', src: 'ok(arr.length >= 2, "at least two")\nok(arr.every((x) => x > 0), "all positive")\n' }] })
    ok(kGe2.violations.length === 0, 'fixture K①: `length >= 2` counts as a non-empty guard ⇒ green')
    const kSet = auditVacuousAssertions({ files: [{ file: 'fake.test.mjs', src: 'ok(set.size > 0, "non-empty set")\nok([...set].every((x) => x > 0), "all positive")\n' }] })
    ok(kSet.violations.length === 0, 'fixture K②: `.size > 0` (Set/Map) counts as a guard ⇒ green')
    const kGe0 = auditVacuousAssertions({ files: [{ file: 'fake.test.mjs', src: 'ok(arr.length >= 0, "trivially true")\nok(arr.every((x) => x > 0), "all positive")\n' }] })
    ok(kGe0.violations.length === 1 && /\[A\]/.test(kGe0.violations[0]), 'fixture K③: `length >= 0` is TRIVIALLY TRUE ⇒ still RED (precision must not become laxity)')
    const kKeys = auditVacuousAssertions({ files: [{ file: 'fake.test.mjs', src: 'ok(Object.keys(obj).length > 0, "has keys")\nok(arr.every((x) => x > 0), "all positive")\n' }] })
    ok(kKeys.violations.length === 0, 'fixture K④: `Object.keys(x).length > 0` counts as a guard ⇒ green')
    ok(NOT_A_GUARD.test('arr.length >= 0') && !NON_EMPTY_GUARD.test('arr.length >= 0'), 'fixture K⑤: the trivially-true form is explicitly classified as NOT a guard')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// ---- RULE F (task-238): every loose `ms()`/alias call site must handle an uninterpretable instant ---------
{
  // Runtime call sites only: the kernel (this gate's own fixture strings are not call sites — scanning them
  // would make RULE F redden on its own self-proofs).
  const ruleF = auditTimeValueHandling({ sources: kernelFiles.map((f) => ({ file: f, src: readIf(f) })) })
  red(ruleF.violations, 'RULE F (every ms()/alias call site handles an uninterpretable instant)')
  ok(ruleF.coverage.length >= 3, 'RULE F: the scan really found call sites (non-vacuous: ' + ruleF.coverage.length + ')')
  ok(ruleF.coverage.some((c) => c.strict), 'RULE F: at least one call site uses the strict self-guarding form')
  ok(ruleF.coverage.every((c) => c.strict || c.guarded), 'RULE F: every loose call site carries a finiteness guard')
  // self-proof ①: a call site with NO guard ⇒ RED
  const f1 = auditTimeValueHandling({ sources: [{ file: 'fixture-unguarded.js', src: "import { ms } from './timevalue.js'\nconst t = ms(at)\nreturn t\n" }] })
  ok(f1.violations.length === 1, 'RULE F self-proof ①: ms(at) with no Number.isFinite guard ⇒ RED')
  // self-proof ②: the same call site WITH a guard ⇒ GREEN
  const f2 = auditTimeValueHandling({ sources: [{ file: 'fixture-guarded.js', src: "import { ms } from './timevalue.js'\nconst t = ms(at)\nif (!Number.isFinite(t)) throw new Error('no')\n" }] })
  ok(f2.violations.length === 0 && f2.coverage[0].guarded === true, 'RULE F self-proof ②: the guarded call site is GREEN')
  // self-proof ③: the strict entry point is self-guarding ⇒ GREEN
  const f3 = auditTimeValueHandling({ sources: [{ file: 'fixture-strict.js', src: "import { msStrict } from './timevalue.js'\nconst t = msStrict(at, 'at')\n" }] })
  ok(f3.violations.length === 0 && f3.coverage[0].strict === true, 'RULE F self-proof ③: msStrict(...) is GREEN (it refuses by name itself)')
  // self-proof ④: a COMMENT mentioning the helper is not a call site ⇒ GREEN (no false positive)
  const f4 = auditTimeValueHandling({ sources: [{ file: 'fixture-comment.js', src: "import { ms } from './timevalue.js'\n// ms(at) would need a guard\n" }] })
  ok(f4.violations.length === 0 && f4.coverage.length === 0, 'RULE F self-proof ④: a comment is not a call site (no false positive)')
  // self-proof ⑤: an ALIASED import (ms as toMs) is tracked ⇒ RED when unguarded
  const f5 = auditTimeValueHandling({ sources: [{ file: 'fixture-alias.js', src: "import { ms as toMs } from './timevalue.js'\nconst t = toMs(at)\n" }] })
  ok(f5.violations.length === 1 && f5.coverage[0].alias === 'toMs', 'RULE F self-proof ⑤: an aliased import (ms as toMs) is tracked too')
}

console.log('  RULE A coverage: ' + JSON.stringify(ruleA.coverage))
console.log('=== DECLARATION CRITERION: ' + pass + ' passed, ' + fail + ' failed ===')
process.exit(fail ? 1 : 0)

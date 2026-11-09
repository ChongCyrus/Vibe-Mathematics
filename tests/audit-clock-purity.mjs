// tests/audit-clock-purity.mjs — RUN 256 / TB-2623: the STATIC half of the clock-purity criterion.
//
// The runtime suite (tests/vmu-run256-clock-purity.test.mjs) proves that an injected clock REACHES the four write
// paths it names. This script is the opposite direction: it ENUMERATES every place the product code could read a
// wall clock, so a stray `Date.now()` on a branch nobody exercised cannot hide — a runtime assertion only watches
// the calls it makes, and that is exactly how the original mixed timestamps survived a whole round.
//
// Four buckets, because "not fixed" and "legitimately wall clock" are different facts:
//   • FINDING       a product path reads the wall clock at run time and nothing explains it        → exit 1
//   • NAMED FALLBACK a factory default / the single named fallback of a face that reports its own  → allowed, listed
//                     clock source in the receipt
//   • LEGACY        a real wall-clock read in a file this task was NOT allowed to change           → listed by name,
//                     with the owner, so the debt is enumerated instead of silently tolerated
//   • NOT A CLOCK   `Date.parse(<arg>)` parses an existing stamp, `new Date(<arg>)` formats one, comments say words
//
// Usage:
//   node tests/audit-clock-purity.mjs            # human table, exit 1 on any FINDING
//   node tests/audit-clock-purity.mjs --json     # machine reading
//
// Tests import `auditClockPurity({ extraSources })` to prove the scanner is not blind (a synthetic finding must be
// reported) — a scanner that can only say "clean" is a slogan, not a criterion.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = fileURLToPath(new URL('../', import.meta.url))

/** Where product code lives. Tests and scripts are NOT scanned: they are allowed to read the wall clock. */
export const DEFAULT_ROOTS = Object.freeze([
  'vibe-math-vmu/kernel',
  'vibe-math-vmu/packs/v5r',
  'vibe-math-vmu/kit',
  'vibe-math-vmu/tools',
  'vibe-math-vmu/host.js',
  'vibe-math-vmu/host-pack-tools.js',
  'vibe-math-vmu/vibe-math-vmu.js',
])

/**
 * Lines that LOOK like a wall-clock read but are an allowed shape. Each entry is `{ test, why }` where
 * `test(file, line)` answers "is this line the allowed shape?". Keeping them as predicates (not a file allowlist)
 * means a NEW `Date.now()` anywhere — including in an already-allowed file — still shows up as a finding.
 */
const ALLOWED = Object.freeze([
  {
    why: 'factory default: `clock = () => Date.now()` / `clock = () => new Date().toISOString()` — the caller injects a clock; only a caller that injects nothing reaches it, and that face names the source',
    test: (file, line) => /(?:clock|now)\s*[:=][^\n]*?=>\s*(?:Date\.now\(\)|new\s+Date\(\)\.toISOString\(\))/.test(line),
  },
  {
    why: 'factory default written as a conditional: `clock: typeof clock === function ? clock : () => Date.now()`',
    test: (file, line) => /clock\s*:\s*[^\n]*\?\s*[^\n]*:\s*\(\)\s*=>\s*Date\.now\(\)/.test(line),
  },
  {
    why: 'a fallback in the same expression as an injected clock: `o.clock ? o.clock() : Date.now()` — the only path is "no clock was injected", named at the call site',
    test: (file, line) => /clock\s*\?\s*[^\n]*clock\(\)[^\n]*:\s*Date\.now\(\)/.test(line),
  },
  {
    why: 'clockguard.js IS the guard: its unguarded default base is the one place allowed to read the wall clock, and status() self-exposes guarded:false',
    test: (file) => file === 'vibe-math-vmu/kernel/clockguard.js',
  },
  {
    why: 'kernel/paper.js: the single NAMED fallback body (PAPER_WALL_CLOCK counts it; clockSource() reports injected:false)',
    test: (file, line) => file === 'vibe-math-vmu/kernel/paper.js' && /^\s*return Date\.now\(\)\s*$/.test(line),
  },
  {
    why: 'blueprint.js: the single NAMED fallback body of wallClockReadingOf (WALL_CLOCK_READS counts it; receipts carry atSource:"wall-clock")',
    test: (file, line) => file === 'vibe-math-vmu/packs/v5r/blueprint.js' && /^\s*return Date\.now\(\)\s*$/.test(line),
  },
  {
    why: 'packs/v5r/paper.js: the ONE named fallback body of paperClockOf (PAPER_SUBSYSTEM_WALL_CLOCK counts it; flow.clockSource() reports source:"wall-clock")',
    test: (file, line) => file === 'vibe-math-vmu/packs/v5r/paper.js' && /^\s*return Date\.now\(\)\s*$/.test(line),
  },
  {
    why: 'packs/v5r/tools.js: the single NAMED fallback of kernelClockIsoOf — it answers atSource:"wall-clock", so no receipt can mistake it for the injected clock',
    test: (file, line) => file === 'vibe-math-vmu/packs/v5r/tools.js' && /atSource: ['"]wall-clock['"]/.test(line),
  },
])

/**
 * Real wall-clock reads that STAY wall-clock reads — on purpose, not from neglect — and that a reader must be able to
 * check. RUN 257 / TB-2636 turned this bucket from a per-FILE allowlist into per-SITE DECLARATIONS, because a file-wide
 * entry silently absorbed every future `Date.now()` in that file: a legacy debt that cannot grow is a criterion, one
 * that can grow is an excuse.
 *
 * Every entry is `{file, match, count, owner, why, wouldBeWrongIf, test}`:
 *   • `match` + `count`  anchor the declaration to the exact line(s) it explains — a NEW hit in the same file (or one
 *                        more than `count` matching lines) is a FINDING, not legacy;
 *   • `owner`            who is responsible for clearing it (subsystem, not a person);
 *   • `why`              WHY this read must not take the injected clock — at least 24 characters, checked below;
 *   • `wouldBeWrongIf`   the concrete thing that would go wrong if it were migrated anyway, so a reader can re-judge it;
 *   • `test`             the suite that proves the declaration still holds (`'none'` only with a §四 report to the Lead).
 *
 * The list is verified against the code: a declaration whose `match` no longer occurs, or occurs fewer/more times than
 * `count`, is `staleLegacy` and fails the scan. Legacy may only SHRINK (legacyBudget below); it may never grow.
 */
const LEGACY_BUDGET = 26
const LEGACY = Object.freeze([
  {
    file: 'vibe-math-vmu/kernel/turn/index.js',
    match: 'parkedAt: Date.now()',
    count: 1,
    owner: 'state-lane / the turn loop (`deliverByReturning`, parked prompt)',
    why: 'the parked prompt is closed by AGE against the wall clock (`abandonAfterMs`), and a frozen injected clock would make that deadline never fire, so the anchor of a timeout stays a real elapsed measurement.',
    wouldBeWrongIf: 'a caller injects a fixed clock and `op:"abandon"`/the timed-out close waits forever: the deadline would compare one frozen instant with itself (tests/vmu-run241-turn-lock.test.mjs §3 sleeps 90 ms against a 40 ms deadline).',
    test: 'tests/vmu-run256-parked-turn.test.mjs §5c + tests/vmu-run241-turn-lock.test.mjs §3',
  },
  {
    file: 'vibe-math-vmu/kernel/turn/index.js',
    match: 'return new Date().toISOString()',
    count: 1,
    owner: 'state-lane / `isoStampOf`, the turn loop\'s one text conversion',
    why: 'it is the LAST fallback of a converter whose input is already a clock reading: it only runs when the caller supplied neither readable text nor a finite number, i.e. when the injected clock answered something unreadable, and the alternative is fabricating a stamp.',
    wouldBeWrongIf: 'a kernel clock answered `null`/an object and the row were stamped with nothing: every receipt that has an `at` would lose it silently instead of falling back to the wall clock.',
    test: 'tests/vmu-run257-clock-legacy.test.mjs §7 (the fallback is named, and the migrated stamps carry `atSource`)',
  },
  {
    file: 'vibe-math-vmu/kernel/turn/index.js',
    match: 'parkedForMs: at === null ? null : Math.max(0, Date.now() - at)',
    count: 1,
    owner: 'state-lane / parked-prompt readings (`parkedFactsOf`)',
    why: 'this duration is derived from the SAME wall-clock anchor as `parkedAt`; migrating only the subtraction would subtract a frozen injected instant from a real one and report a duration of ~1.7e12 ms.',
    wouldBeWrongIf: '`parkedForMs` and `parkedSince` come from two different clocks and the receipt contradicts itself by the offset between them.',
    test: 'tests/vmu-run257-clock-legacy.test.mjs §9 (the paired reads stay paired)',
  },
  {
    file: 'vibe-math-vmu/kernel/turn/index.js',
    match: 'const itemStartedAt = Date.now()',
    count: 1,
    owner: 'state-lane / the dispatch pump (`dispatchStats`)',
    why: 'it opens an ELAPSED measurement whose only consumer is the duration `ms`; a duration must be read from the clock that measures elapsed time, and under a frozen injected clock every dispatch would report `ms: 0` instead of how long it really took.',
    wouldBeWrongIf: 'the dispatch durations became artefacts of the injected clock (always 0, or negative when the clock steps back) and a slow dispatch could no longer be told from a fast one.',
    test: 'tests/vmu-run257-clock-legacy.test.mjs §10 (the elapsed pair is declared together)',
  },
  {
    file: 'vibe-math-vmu/kernel/turn/index.js',
    match: 'ms: Date.now() - itemStartedAt',
    count: 2,
    owner: 'state-lane / the dispatch pump (`dispatchStats.recentCompleted`)',
    why: 'the closing half of the dispatch duration above: it must subtract the same wall-clock instant `itemStartedAt` took, on both the success and the failure branch, or the number is meaningless.',
    wouldBeWrongIf: 'one branch measured against the injected clock and the other against the wall clock, so the same slow dispatch read as 0 ms when it succeeded and 3000 ms when it threw.',
    test: 'tests/vmu-run257-clock-legacy.test.mjs §10',
  },
  {
    file: 'vibe-math-vmu/kernel/turn/index.js',
    match: 'const parkedAgeMs = Number.isFinite(Number(parkedOnly.parkedAt))',
    count: 1,
    owner: 'state-lane / the turn loop (`abandonTurn`, parked close)',
    why: 'it decides whether a parked prompt is PAST `abandonAfterMs`, i.e. whether the loop closes it: a deadline compared against a frozen clock never expires.',
    wouldBeWrongIf: 'the timed-out release never fired under an injected clock, and a stalled parked prompt would hold the seat forever (the exact "locked and nobody can release it" failure RUN 241 closed).',
    test: 'tests/vmu-run241-turn-lock.test.mjs §3 + tests/vmu-run256-parked-turn.test.mjs §5c',
  },
  {
    file: 'vibe-math-vmu/kernel/turn/index.js',
    match: 'const ageMs = turnInFlightSince > 0 ? Date.now() - turnInFlightSince : null',
    count: 2,
    owner: 'state-lane / the turn lock (`run`, `VMU_TURN_REENTRANT`)',
    why: 'the turn lock is released by AGE (`abandonAfterMs`), so its age must be real elapsed time; both the abandon path and the REENTRANT refusal read it, and a frozen clock would strand a lock that nobody can release.',
    wouldBeWrongIf: 'a real 4000 ms stall report as 0 ms and the backstop that closes it never fired — one hung delivery would hold the whole loop.',
    test: 'tests/vmu-run241-turn-lock.test.mjs §3',
  },
  {
    file: 'vibe-math-vmu/kernel/turn/index.js',
    match: 'const ageMs = Number.isFinite(parkedAtMs) && parkedAtMs > 0 ? Date.now() - parkedAtMs : null',
    count: 1,
    owner: 'state-lane / the turn lock (`abandonTurn`, parked turn)',
    why: 'the same elapsed-age rule at the second close path: the parked prompt is closed when its age passes `abandonAfterMs`, so the age is measured against real time.',
    wouldBeWrongIf: 'the same as above at this second door: a frozen clock makes this release a no-op while the first door still closes, and the two doors disagree about the same deadline.',
    test: 'tests/vmu-run241-turn-lock.test.mjs §3',
  },
  {
    file: 'vibe-math-vmu/kernel/turn/index.js',
    match: 'inFlightForMs: turnInFlightSince > 0 ? Date.now() - turnInFlightSince : null',
    count: 1,
    owner: 'state-lane / the turn loop (`turnLoopReading`)',
    why: 'the status board reports how long the lock has been held; it is the READING of the same elapsed measurement the deadline uses, so it follows the wall clock rather than a frozen one.',
    wouldBeWrongIf: '`vibe_vmu_turn { op:"status" }` said a turn had been in flight 0 ms while the 30-minute backstop was still counting down against real time.',
    test: 'tests/vmu-run241-turn-lock.test.mjs §3 + tests/vmu-run245-audit12.test.mjs',
  },
  {
    file: 'vibe-math-vmu/kernel/turn/index.js',
    match: 'Math.max(0, Date.now() - Number(p.parkedAt))',
    count: 1,
    owner: 'state-lane / parked-prompt readings (`turnLoopReading`)',
    why: 'the status board\'s parked age is the reading of the same wall-clock anchor `parkedAt` stores; it must subtract the clock that stamped that anchor.',
    wouldBeWrongIf: 'the board reported a parked prompt as 0 ms old while the timeout was about to fire, so a caller could not tell a fresh park from an expiring one.',
    test: 'tests/vmu-run257-clock-legacy.test.mjs §9',
  },
  {
    file: 'vibe-math-vmu/kernel/turn/index.js',
    match: 'const myToken = { seq: ++lockSeq, at: Date.now() }',
    count: 1,
    owner: 'state-lane / the turn lock (`run`)',
    why: 'the lock token carries when the lock was taken; it belongs to the lock\'s real-time bookkeeping (the token is compared, and its age is what the backstop reads), not to a receipt a caller reads.',
    wouldBeWrongIf: 'the token\'s `at` went backwards under a stepped-injected clock and the "is this still my lock" comparison or the age arithmetic mis-read a live lock as stale.',
    test: 'tests/vmu-run241-turn-lock.test.mjs §2',
  },
  {
    file: 'vibe-math-vmu/kernel/turn/index.js',
    match: 'turnInFlightSince = Date.now()',
    count: 1,
    owner: 'state-lane / the turn lock (`run`)',
    why: 'this is the instant every lock-age comparison subtracts from (`abandonAfterMs`, `VMU_TURN_REENTRANT`); a lock deadline is real elapsed time, so this stays a wall-clock read.',
    wouldBeWrongIf: 'the lock deadline was compared with a frozen clock and a hung delivery held the loop forever instead of being closed by name.',
    test: 'tests/vmu-run241-turn-lock.test.mjs §3',
  },
  {
    file: 'vibe-math-vmu/kernel/store.js',
    match: 'const tmpFile = () => file + \'.\' + process.pid',
    count: 1,
    owner: 'records-lane / `createStore` (atomic write)',
    why: 'a temp-file name must be UNIQUE across processes and instants; deriving it from an injected clock would make two writers of the same workspace pick the same name and corrupt the atomic rename, so uniqueness is exactly what the wall clock buys here.',
    wouldBeWrongIf: 'two kernels writing one workspace in the same millisecond minted the same tmp path: one rename clobbers the other\'s in-progress file.',
    test: 'tests/vmu-store*.test.mjs (atomic-write suites)',
  },
  {
    file: 'vibe-math-vmu/kernel/store.js',
    match: 'const started = Date.now()',
    count: 1,
    owner: 'records-lane / `createStore` (file lock)',
    why: 'the store lock is held for a REAL timeout (`lockTimeoutMs`): an injected frozen clock would make the lock wait forever, and the lock exists precisely because two kernels write one file in real time.',
    wouldBeWrongIf: 'a lock held by a crashed kernel was never treated as timed out, so every later write blocked until the process died.',
    test: 'tests/vmu-store*.test.mjs (lock-timeout suites)',
  },
  {
    file: 'vibe-math-vmu/kernel/store.js',
    match: 'if (Date.now() - started > lockTimeoutMs) break',
    count: 1,
    owner: 'records-lane / `createStore` (file lock)',
    why: 'the closing half of the store lock timeout: it must subtract the same real instant `started` took, or a frozen clock makes the timeout unreachable.',
    wouldBeWrongIf: 'the timeout compared two frozen instants and never expired, the same failure as above on the other side of the comparison.',
    test: 'tests/vmu-store*.test.mjs (lock-timeout suites)',
  },
  {
    file: 'vibe-math-vmu/kernel/index.js',
    match: 'return Number.isFinite(parsed) ? parsed : Date.now()',
    count: 1,
    owner: 'state-lane / `kernel/index.js` (`storePolicyClock`, the normalising clock)',
    why: 'this function EXISTS to turn any clock (ISO string, epoch number, null) into a finite number for the store policy, whose clock is informational (lock `at`, waitedMs); if the injected clock answers nothing parseable the only honest last resort is the wall clock, and this branch is its named body.',
    wouldBeWrongIf: 'this branch returned NaN/null instead: the recovery lock would compare garbage and every recovery would be refused as VMU_RESUME_BUSY (measured in ROUND 4 / task-25, see the comment above the function).',
    test: 'tests/vmu-resume*.test.mjs (recovery lock) — the branch is only reachable with an unparseable injected clock',
  },
  {
    file: 'vibe-math-vmu/tools/meeting.js',
    match: 'const bid = ballotId || (\'b-\'',
    count: 1,
    owner: 'state-lane / the meeting tool (`action:"ballot"`, ballot id)',
    why: 'a ballot id must stay UNIQUE across processes and instants; the counter prefix alone repeats when two kernels convene from the same live list, so the time suffix is the only collision-free part, and an injected frozen clock would mint identical ids.',
    wouldBeWrongIf: 'two ballots cast in one millisecond (or with a frozen injected clock) shared an id, so a vote could be counted twice or a ballot opened over another.',
    test: 'tests/vmu-meeting-types.test.mjs (ballot id shape) — no suite yet exercises the collision itself, reported to the Lead',
  },
  {
    file: 'vibe-math-vmu/vibe-math-vmu.js',
    match: 'kernel.report.tick({ at: Date.now()',
    count: 1,
    owner: 'Lead-owned entry / `vibe-math-vmu.js` (report heartbeat)',
    why: 'this is a LIVENESS heartbeat ("a turn just ended, here is when"), not a business instant: a frozen injected clock would freeze the heartbeat itself, so a stalled loop could not be told from a running one.',
    wouldBeWrongIf: 'the heartbeat carried a fixed instant and every turn-end looked simultaneous, so the report could not show that the institute was moving.',
    test: 'tests/vmu-report*.test.mjs (heartbeat) — the tick is observation-only and never decides a turn',
  },
])

/** The four declaration fields every legacy entry must carry, plus the two anchors that bind it to code. */
export const LEGACY_DECLARATION_FIELDS = Object.freeze(['owner', 'why', 'wouldBeWrongIf', 'test'])

/**
 * RUN 257 / TB-2636: a DECLARATION is a claim, so it needs a criterion too. An entry that says who owns the read but
 * not WHY it must stay a wall-clock read is the "owner as exemption" shape this task exists to prevent.
 * Returns `[{index, file, missing:[field…], whyTooShort}]` — empty means every entry can be re-judged by a reader.
 */
export function legacyDeclarationProblems(entries = LEGACY) {
  const problems = []
  const list = Array.isArray(entries) ? entries : []
  for (let i = 0; i < list.length; i += 1) {
    const entry = list[i] || {}
    const missing = []
    for (const field of LEGACY_DECLARATION_FIELDS) {
      if (typeof entry[field] !== 'string' || entry[field].trim() === '') missing.push(field)
    }
    if (typeof entry.match !== 'string' || entry.match === '') missing.push('match')
    if (!Number.isInteger(entry.count) || entry.count < 1) missing.push('count')
    if (typeof entry.file !== 'string' || entry.file === '') missing.push('file')
    const whyTooShort = typeof entry.why === 'string' && entry.why.trim() !== '' && entry.why.trim().length < 24
    if (missing.length > 0 || whyTooShort) problems.push({ index: i, file: entry.file || null, match: entry.match || null, missing, whyTooShort })
  }
  return problems
}


// A `+ new Date(x)` that follows a quote is STRING CONCATENATION (formatting a stamp that was already supplied),
// not a coercion to "now": only an operator context counts as reading the clock.
const isDateCoercion = (line) => /\+\s*new\s+Date\b/.test(line) && !/['"`]\s*\+\s*new\s+Date/.test(line)

const PATTERNS = Object.freeze([
  { code: 'DATE_NOW', test: (line) => /Date\.now\s*\(/.test(line) },
  { code: 'NEW_DATE', test: (line) => /new\s+Date\s*\(\s*\)/.test(line) },
  { code: 'DATE_COERCION', test: isDateCoercion },
  { code: 'PERF_NOW', test: (line) => /performance\.now\s*\(/.test(line) },
])

const isComment = (line) => {
  const t = line.trim()
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')
}

function walk(dir, out) {
  let entries = []
  try { entries = readdirSync(dir, { withFileTypes: true }) } catch (e) { return }
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) { walk(full, out); continue }
    if (!entry.isFile() || !/\.m?js$/.test(entry.name)) continue
    out.push(full)
  }
}

/**
 * Scan the given roots (repo-relative file or directory); `extraSources` injects synthetic files for the mutant and
 * `legacy` overrides the declaration table (so a test can prove that a bad declaration is REPORTED, not merely absent).
 */
export function auditClockPurity({ roots = DEFAULT_ROOTS, repo = REPO, extraSources = [], legacy: legacyEntries = LEGACY } = {}) {
  const files = []
  for (const root of roots) {
    const full = join(repo, root)
    let st = null
    try { st = statSync(full) } catch (e) { continue }
    if (st.isDirectory()) walk(full, files)
    else if (st.isFile()) files.push(full)
  }
  const sources = files.map((full) => ({ file: relative(repo, full).replace(/\\/g, '/'), text: readFileSync(full, 'utf8') }))
  for (const extra of extraSources) sources.push({ file: extra.file, text: extra.text })

  const findings = []
  const allowed = []
  const legacy = []
  const declared = Array.isArray(legacyEntries) ? legacyEntries : []
  const matchedCounts = new Array(declared.length).fill(0)
  for (const source of sources) {
    const lines = source.text.split(/\r?\n/)
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i]
      if (isComment(line)) continue
      const hit = PATTERNS.filter((p) => p.test(line))
      if (hit.length === 0) continue
      const item = {
        file: source.file,
        line: i + 1,
        code: hit.map((h) => h.code).join('+'),
        text: line.trim().slice(0, 160),
      }
      const rule = ALLOWED.find((r) => r.test(source.file, line))
      if (rule) { allowed.push(Object.assign(item, { why: rule.why })); continue }
      // ★ A declaration is anchored to the LINE it explains (`match`) and to HOW MANY lines it explains (`count`).
      // A file-wide entry would absorb every future read in that file; matching by content means a NEW read in the
      // SAME file is a finding, and one line more than `count` is a finding too (see `staleLegacy` below).
      const entryIndex = declared.findIndex((entry) => entry && entry.file === source.file && typeof entry.match === 'string' && entry.match !== '' && line.includes(entry.match))
      if (entryIndex >= 0) {
        matchedCounts[entryIndex] += 1
        const entry = declared[entryIndex]
        if (matchedCounts[entryIndex] > (Number.isInteger(entry.count) ? entry.count : 1)) findings.push(item)
        else legacy.push(Object.assign(item, { why: entry.why, owner: entry.owner || null }))
        continue
      }
      findings.push(item)
    }
  }

  // A declaration that no longer matches the code (or matches fewer lines than it claims) is STALE: leaving it in
  // place would be a live exemption for a line that has since moved, been renamed, or been fixed. Stale is a failure.
  const staleLegacy = []
  for (let i = 0; i < declared.length; i += 1) {
    const entry = declared[i] || {}
    const count = Number.isInteger(entry.count) ? entry.count : 1
    if (matchedCounts[i] !== count) staleLegacy.push({ file: entry.file || null, match: entry.match || null, declared: count, matched: matchedCounts[i] })
  }
  const declarationProblems = legacyDeclarationProblems(declared)
  // The budget bounds the NUMBER OF READ SITES once they are declared (the contract TB-2623 left behind was 26 hits),
  // and it bounds the declaration list too: a split into more, finer entries must not become a way to grow the debt.
  const overBudget = declared.length > LEGACY_BUDGET || legacy.length > LEGACY_BUDGET
  const ok = findings.length === 0 && staleLegacy.length === 0 && declarationProblems.length === 0 && !overBudget
  const means = findings.length > 0
    ? findings.length + ' product path(s) read the wall clock at run time; each must either take the injected clock or be demoted to ONE named fallback with a receipt field'
    : staleLegacy.length > 0
      ? staleLegacy.length + ' legacy declaration(s) no longer match the code (declared count != matched lines): fix the declaration or remove it — a stale entry is a live exemption for a line that no longer exists'
      : declarationProblems.length > 0
        ? declarationProblems.length + ' legacy declaration(s) are incomplete (owner/why(>=24 chars)/wouldBeWrongIf/test/match/count): an owner alone is an exemption, not a declaration'
        : overBudget
          ? 'the legacy list grew past its budget (declared ' + declared.length + ' / read sites ' + legacy.length + ' > ' + LEGACY_BUDGET + '): legacy may only SHRINK'
          : 'no unexplained product path reads the wall clock: every remaining hit is a named factory default (whose face reports its clock source), the clockguard itself, or an enumerated legacy read declared by file, line anchor, owner, why and counterfactual'
  return {
    ok,
    scannedFiles: sources.length,
    findings,
    allowed,
    legacy,
    staleLegacy,
    declarationProblems,
    legacyBudget: LEGACY_BUDGET,
    means,
  }
}

/** ★ The SELF-PROOF, runnable on its own (`--selftest`): a synthetic product wall-clock read MUST be reported, an
 *  owner-only legacy declaration MUST be reported, and a stale declaration MUST be reported. Returns the number of
 *  mutants the scanner failed to catch. This is what `tests/audit-scanner-selfproof.test.mjs` classifies as proof:
 *  without it, a clean run of this scanner cannot be told apart from a predicate that never fires. It scans nothing
 *  from the repository, so it is cheap enough to run inside a gate. */
function clockPurityMutants(json) {
  let bad = 0
  // The mutant: the scanner must be able to FIND a wall clock, or "CLEAN" would be a slogan.
  const mutant = auditClockPurity({ roots: [], extraSources: [{ file: 'vibe-math-vmu/kernel/mutant.js', text: 'const t = Date.now()\n' }] })
  if (mutant.findings.length !== 1) {
    console.log('[clock-purity] FAIL mutant: a synthetic Date.now() must be reported, got ' + mutant.findings.length)
    bad += 1
  }
  // ★ The DECLARATION mutant (RUN 257 / TB-2636): an entry with only `owner` is the shape "an owner is an exemption".
  // If the scanner accepted it, every legacy row could be justified by naming a person, so this must be a failure.
  const badDeclaration = auditClockPurity({ roots: [], legacy: [{ file: 'vibe-math-vmu/kernel/mutant.js', match: 'Date.now()', count: 1, owner: 'somebody' }] })
  if (badDeclaration.declarationProblems.length === 0) {
    console.log('[clock-purity] FAIL mutant: a legacy declaration with only `owner` (no why/wouldBeWrongIf/test) must be reported')
    bad += 1
  }
  // ★ The STALE mutant: a declaration whose line no longer exists is a live exemption, so it must be reported.
  const staleDeclaration = auditClockPurity({ roots: [], legacy: [{ file: 'vibe-math-vmu/kernel/mutant.js', match: 'Date.now()', count: 1, owner: 'nobody', why: 'this declaration points at a line that is not in the scanned sources at all', wouldBeWrongIf: 'it would keep an exemption nobody re-reads', test: 'tests/vmu-run257-clock-legacy.test.mjs' }] })
  if (staleDeclaration.staleLegacy.length === 0) {
    console.log('[clock-purity] FAIL mutant: a stale legacy declaration (no matching line) must be reported')
    bad += 1
  }
  if (json) process.stdout.write(JSON.stringify({ mutant: mutant.findings.length === 1 ? 'reported' : 'missed', declarationMutant: badDeclaration.declarationProblems.length > 0 ? 'reported' : 'missed', staleMutant: staleDeclaration.staleLegacy.length > 0 ? 'reported' : 'missed' }, null, 2) + '\n')
  else if (bad === 0) {
    console.log('[clock-purity] mutant: a synthetic Date.now() IS reported')
    console.log('[clock-purity] mutants: an owner-only declaration IS reported, a stale declaration IS reported (the scanner is not blind)')
  }
  return bad
}

function main() {
  const json = process.argv.includes('--json')
  if (process.argv.includes('--selftest')) {
    const bad = clockPurityMutants(json)
    process.exitCode = bad === 0 ? 0 : 1
    return
  }
  const reading = auditClockPurity()
  if (json) { process.stdout.write(JSON.stringify(reading, null, 2) + '\n') }
  else {
    console.log('[clock-purity] scanned ' + reading.scannedFiles + ' file(s); findings=' + reading.findings.length + '; allowed=' + reading.allowed.length + '; legacy=' + reading.legacy.length)
    for (const f of reading.findings) console.log('  FAIL ' + f.file + ':' + f.line + ' [' + f.code + '] ' + f.text)
    for (const a of reading.allowed) console.log('  allowed ' + a.file + ':' + a.line + ' — ' + a.why)
    for (const l of reading.legacy) console.log('  legacy ' + l.file + ':' + l.line + ' [' + l.code + '] — ' + (l.owner ? '[' + l.owner + '] ' : '') + l.why)
    for (const s of reading.staleLegacy) console.log('  FAIL stale legacy declaration ' + s.file + ' `' + s.match + '` — declared ' + s.declared + ', matched ' + s.matched)
    for (const p of reading.declarationProblems) console.log('  FAIL incomplete legacy declaration ' + (p.file || '(no file)') + ' `' + (p.match || '') + '` — missing: ' + p.missing.join(', ') + (p.whyTooShort ? ' (why shorter than 24 characters)' : ''))
    console.log('[clock-purity] ' + reading.means)
  }
  if (clockPurityMutants(json) !== 0) process.exitCode = 1
  if (!reading.ok) process.exitCode = 1
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()

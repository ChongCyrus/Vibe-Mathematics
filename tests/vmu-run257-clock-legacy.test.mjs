// ★ RUN 257 / TB-2636 (task-117) — THE LEGACY CLOCK BUCKET STOPS BEING A BLACK BOX.
//
// TB-2623 built the runtime half of the clock contract (an injected clock must REACH the write paths) and the static
// half (`tests/audit-clock-purity.mjs`, which enumerates every place product code could read a wall clock). It left
// `legacy=26`: real wall-clock reads it could not clear. That bucket was a per-FILE allowlist, so ONE entry for
// `kernel/turn/index.js` absorbed every future `Date.now()` in that 6 000-line file — a debt that could grow silently,
// which is exactly the "silent mixed timestamps" defect the contract exists to prevent.
//
// THIS SUITE pins the second phase, in two directions:
//   A. MIGRATION (where the read is a receipt FACT): the stamps a caller reads (`ledgerLastFail.at`, `failedLast.at`,
//      `dispatchStats.lastError.at`, a queued wake's `at`) take the ONE injected clock and say so (`atSource`), so the
//      same turn produces the same receipt bytes on two runs. Durations that DECIDE a timeout deliberately do NOT move
//      (a frozen injected clock would never time out) — they are DECLARED, with owner + why + counterfactual + test.
//   B. DECLARATION (where the read must stay wall clock): every remaining hit is declared per SITE — file, line
//      anchor (`match`), declared count — and the scanner fails on (i) a new hit in a declared file, (ii) one line more
//      than the count, (iii) a stale declaration, (iv) a declaration without the four fields, (v) a why shorter than
//      24 characters, (vi) growth past the budget.
//
// The negative cases are the point: a scanner that only ever says CLEAN is a slogan. §3/§4/§5 prove that an owner-only
// declaration, a stale one, and a NEW read in an already-declared file are all REPORTED — including the fact that the
// old per-file behaviour would have swallowed §4's line.
//
// Run: node tests/vmu-run257-clock-legacy.test.mjs    Last line: N passed, M failed

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const TURN_SRC = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'turn', 'index.js'), 'utf8')

const AUDIT = await import(pathToFileURL(join(HERE, 'audit-clock-purity.mjs')).href)
const { auditClockPurity, legacyDeclarationProblems, LEGACY_DECLARATION_FIELDS } = AUDIT
const TURN_MOD = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'kernel', 'turn', 'index.js')).href)
const { createTurnOrchestrator, deliverByReturning } = TURN_MOD
const { createPromptPipeline } = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'kernel', 'prompt', 'index.js')).href)

const NL = String.fromCharCode(10)
let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + label); return true }
  failed += 1
  failures.push(label + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail).slice(0, 600)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail).slice(0, 600)))
  return false
}

// The scanner's own reading of the real tree, used by §1/§2/§6/§7.
const reading = auditClockPurity()

// The declarations as the scanner sees them: the module keeps `LEGACY` private, so read them off a scan that injected
// nothing. `reading.legacy` is the HIT list; the declaration list is checked through the exported validator, and the
// per-site shape is re-derived from the hits (each hit must name its owner, so an entry is not just a file-wide claim).
const declaredLegacy = reading.legacy

const nonCommentDateNow = (text) => text.split(/\r?\n/).filter((line) => {
  const t = line.trim()
  if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return false
  return /Date\.now\s*\(/.test(line)
})

const makeLoop = (opts = {}) => createTurnOrchestrator({
  sectionPolicy: () => ({ decisions: [] }),
  prompt: createPromptPipeline({ sections: [{ name: 'v5r-charter-opening', order: 100, text: 'OPENING' }], bindings: [], clock: () => '2026-01-01T00:00:00.000Z' }),
  deliver: opts.deliver || deliverByReturning(),
  ...(opts.clock === undefined ? {} : { clock: opts.clock }),
  ...(opts.turnLedger === undefined ? {} : { turnLedger: opts.turnLedger }),
})

try {
  console.log('=== 1. the scanner still says CLEAN, and legacy only SHRANK (26 -> ' + reading.legacy.length + ') ===')
  ok(reading.findings.length === 0, 'no unexplained product path reads the wall clock', reading.findings)
  ok(reading.ok === true, 'the scanner reading is ok (no findings, no stale declaration, no incomplete declaration)', { stale: reading.staleLegacy, problems: reading.declarationProblems })
  ok(reading.staleLegacy.length === 0, 'every declaration still matches the code it explains (a stale entry is a live exemption)', reading.staleLegacy)
  ok(reading.declarationProblems.length === 0, 'every declaration is complete (owner/why/wouldBeWrongIf/test/match/count)', reading.declarationProblems)
  ok(reading.legacy.length <= reading.legacyBudget && reading.legacyBudget === 26,
    'legacy is ' + reading.legacy.length + ' <= its budget (' + reading.legacyBudget + '): the list may only shrink', { legacy: reading.legacy.length, budget: reading.legacyBudget })
  ok(reading.legacy.length === reading.legacy.length && reading.legacy.length > 0,
    'the legacy bucket is EMPTY-ALLOWED-FREE: there are real declared reads to judge (not a vacuous zero)', { legacy: reading.legacy.length })

  console.log('=== 2. every remaining hit is declared WITH its four fields, per SITE ===')
  ok(declaredLegacy.length > 0, 'there is at least one declared legacy read (the list is not silently empty)', declaredLegacy.length)
  ok(declaredLegacy.every((hit) => typeof hit.owner === 'string' && hit.owner.trim() !== ''),
    'every declared read names an OWNER (a subsystem, not "nobody")', declaredLegacy.filter((h) => !h.owner).map((h) => h.file + ':' + h.line))
  ok(declaredLegacy.every((hit) => typeof hit.why === 'string' && hit.why.trim().length >= 24),
    'every declared read explains WHY it must stay a wall-clock read (>= 24 characters)',
    declaredLegacy.filter((h) => !(typeof h.why === 'string' && h.why.trim().length >= 24)).map((h) => h.file + ':' + h.line))
  const legacyFiles = new Set(declaredLegacy.map((h) => h.file))
  ok(legacyFiles.has('vibe-math-vmu/kernel/turn/index.js') && legacyFiles.has('vibe-math-vmu/kernel/store.js') && legacyFiles.has('vibe-math-vmu/tools/meeting.js') && legacyFiles.has('vibe-math-vmu/vibe-math-vmu.js'),
    'the declarations cover every file TB-2623 handed over (turn, store, meeting, the CLI shell)', [...legacyFiles])

  console.log('=== 3. an owner-only declaration is a FAILURE (the "owner as exemption" shape) ===')
  const ownerOnly = auditClockPurity({ roots: [], legacy: [{ file: 'vibe-math-vmu/kernel/mutant.js', match: 'Date.now()', count: 1, owner: 'somebody' }] })
  ok(ownerOnly.declarationProblems.length === 1, 'a declaration with ONLY owner is reported (one problem)', ownerOnly.declarationProblems)
  ok(ownerOnly.declarationProblems.length > 0 && ownerOnly.declarationProblems[0].missing.includes('why'),
    'the problem names the missing `why` — the field that makes the claim checkable', ownerOnly.declarationProblems[0])
  ok(ownerOnly.ok === false, 'the scanner reading is NOT ok when a declaration is owner-only', ownerOnly.ok)
  const shortWhy = auditClockPurity({ roots: [], legacy: [{ file: 'f.js', match: 'x', count: 1, owner: 'o', why: 'too short', wouldBeWrongIf: 'it would', test: 'none' }] })
  ok(shortWhy.declarationProblems.length === 1 && shortWhy.declarationProblems[0].whyTooShort === true,
    'a why shorter than 24 characters is reported as whyTooShort (the reason must actually explain)', shortWhy.declarationProblems)
  const complete = auditClockPurity({ roots: [], legacy: [{ file: 'f.js', match: 'x', count: 1, owner: 'o', why: 'this read must stay a wall-clock read because a frozen clock would never expire the deadline', wouldBeWrongIf: 'the deadline would never fire', test: 'none' }] })
  ok(complete.declarationProblems.length === 0,
    'the control: a complete four-field declaration is ACCEPTED (so §3 proves the criterion, not a blanket refusal)', complete.declarationProblems)

  console.log('=== 4. a NEW wall-clock read in an ALREADY-DECLARED file is a FINDING (the per-file hole is closed) ===')
  const newRead = auditClockPurity({ roots: [], extraSources: [{ file: 'vibe-math-vmu/kernel/turn/index.js', text: 'const sneaked = Date.now()' + NL }] })
  ok(newRead.findings.length === 1,
    'a fresh Date.now() in kernel/turn/index.js — a file that carries declarations — is reported as a FINDING', newRead.findings)
  ok(newRead.ok === false, 'that reading is not ok (a declared file is not a blanket exemption)', newRead.ok)
  const namedOnly = auditClockPurity({ roots: [], extraSources: [{ file: 'vibe-math-vmu/kernel/clockguard.js', text: 'const t = Date.now()' + NL }] })
  ok(namedOnly.findings.length === 0 && namedOnly.allowed.length === 1,
    'the control: the one place allowed to read the wall clock (clockguard.js) still reports as named-allowed, not legacy', { findings: namedOnly.findings.length, allowed: namedOnly.allowed.length })

  console.log('=== 5. the COUNT anchor: one line more than declared is a finding, and a stale declaration fails ===')
  const overCount = auditClockPurity({ roots: [], extraSources: [{ file: 'vibe-math-vmu/kernel/turn/index.js', text: 'turnInFlightSince = Date.now()' + NL + 'turnInFlightSince = Date.now()' + NL }] })
  ok(overCount.findings.length === 1,
    'a second copy of a line declared `count: 1` is a FINDING, not absorbed by the first declaration', overCount.findings)
  const overEntry = overCount.staleLegacy.find((s) => s.match === 'turnInFlightSince = Date.now()') || null
  ok(overEntry !== null && overEntry.declared === 1 && overEntry.matched === 2,
    'the declaration is reported STALE with declared/matched counts, so the reader can re-judge it', overEntry)
  const stale = auditClockPurity({ roots: [] })
  ok(stale.staleLegacy.length > 0 && stale.legacy.length === 0 && stale.staleLegacy.every((s) => s.matched === 0),
    'scanning NO sources leaves every declaration unmatched, and each one is reported STALE (a declaration for a line that is not there)', { stale: stale.staleLegacy.length, matched: stale.legacy.length })
  ok(stale.ok === false, 'that reading is not ok: a declaration pointing at nothing is a live exemption nobody re-reads', stale.ok)

  console.log('=== 6. MIGRATION: the receipt stamps take the injected clock and say so ===')
  ok(TURN_SRC.includes('const clockMsOf = () => {'),
    'the turn loop has ONE named reader that turns the injected clock into milliseconds')
  ok(!TURN_SRC.includes('counts.ledgerLastFail = { at: Date.now()'),
    'the ledger-failure stamp no longer reads the wall clock')
  ok(!TURN_SRC.includes('dispatchStats.lastError = { code, message, turn: item.turn.id, member: item.turn.member, at: Date.now()'),
    'the dispatch-error stamp no longer reads the wall clock')
  ok(TURN_SRC.includes('at: clockMsOf(), settle })') && !/at:\s*Date\.now\(\),\s*settle/.test(TURN_SRC),
    'a queued wake is stamped from the injected clock (clockMsOf), not Date.now()')
  const atSourceCount = (TURN_SRC.match(/atSource: 'kernel-clock'/g) || []).length
  ok(atSourceCount >= 3,
    'the migrated receipts NAME their source (`atSource: \'kernel-clock\'`) so a reader can tell them from wall time', atSourceCount)
  ok(TURN_SRC.includes("queuedForMsSource: 'kernel-clock'"),
    'the queued-wake duration names the clock it was measured against (no mixing of two sources)')
  const turnLegacyHits = declaredLegacy.filter((h) => h.file === 'vibe-math-vmu/kernel/turn/index.js')
  ok(turnLegacyHits.length === 14 && nonCommentDateNow(TURN_SRC).length === 13,
    'exactly the 14 DECLARED wall-clock reads remain in kernel/turn/index.js (6 Date.now() stamps migrated; 13 DATE_NOW + 1 NEW_DATE)',
    { declared: turnLegacyHits.length, dateNow: nonCommentDateNow(TURN_SRC).length, lines: nonCommentDateNow(TURN_SRC).map((l) => l.trim().slice(0, 60)) })

  console.log('=== 7. running the same turn twice under an injected clock reproduces the receipt stamp ===')
  const brokenLedger = { record: () => { throw new Error('the shared turn ledger is unwritable (test seam)') } }
  const stampOf = async () => {
    const loop = makeLoop({ clock: () => '2026-03-01T00:00:00.000Z', turnLedger: brokenLedger })
    await loop.step({ members: ['r-1'], phase: 'normal' })
    const counts = loop.status().counts || {}
    return counts.ledgerLastFail || null
  }
  const stampA = await stampOf()
  const stampB = await stampOf()
  ok(stampA !== null && typeof stampA === 'object',
    'a failing shared ledger leaves a NAMED last-failure record (the migrated stamp is observable, not dead code)', stampA)
  ok(stampA !== null && stampA.at === '2026-03-01T00:00:00.000Z',
    'the stamp is the INJECTED clock instant, not the wall clock', stampA && stampA.at)
  ok(stampA !== null && stampA.atSource === 'kernel-clock',
    'the stamp names its source (`atSource: \'kernel-clock\'`)', stampA && stampA.atSource)
  ok(stampB !== null && Object.keys(stampA || {}).length > 0 && Object.keys(stampB || {}).length > 0,
    'both runs produced a NAMED, non-empty stamp to compare (a vacuous two-empty compare would pass here)', { a: stampA, b: stampB })
  ok(JSON.stringify(stampA) === JSON.stringify(stampB),
    'two runs of the same turn produce the SAME bytes (the determinism gate TB-2605 relies on)', { a: stampA, b: stampB })

  console.log('=== 8. the declarations are the ones a reader can check: fields exist as a named contract ===')
  ok(JSON.stringify(LEGACY_DECLARATION_FIELDS) === JSON.stringify(['owner', 'why', 'wouldBeWrongIf', 'test']),
    'the four declared fields are exported by name (the criterion is inspectable, not implied)', LEGACY_DECLARATION_FIELDS)
  ok(typeof legacyDeclarationProblems === 'function' && legacyDeclarationProblems([]).length === 0,
    'the validator accepts an empty table and is exported for reuse (one predicate, not a copy)', typeof legacyDeclarationProblems)
  const withCounterfactual = declaredLegacy.filter((hit) => typeof hit.why === 'string' && hit.why.trim().length >= 24 && typeof hit.file === 'string')
  ok(withCounterfactual.length === declaredLegacy.length,
    'every declared hit carries a checkable reason and a file anchor (no declaration without a reader)', { declared: declaredLegacy.length, checked: withCounterfactual.length })

  console.log('=== 9. the paired reads stay PAIRED (never one half injected, the other half wall clock) ===')
  const mixedForward = /Date\.now\(\)\s*-\s*(clockMsOf\(\)|Number\(clockMsOf\(\)\))/
  const mixedBackward = /clockMsOf\(\)\s*-\s*Date\.now\(\)/
  ok(!mixedForward.test(TURN_SRC) && !mixedBackward.test(TURN_SRC),
    'no subtraction mixes an injected instant with a wall-clock instant (that would report ~1.7e12 ms)')
  ok(TURN_SRC.includes('parkedAt: Date.now()') && TURN_SRC.includes('Math.max(0, Date.now() - at)'),
    'the parked anchor AND the parked duration it subtracts from are the same wall-clock pair (both declared)')
  ok(TURN_SRC.includes('turnInFlightSince = Date.now()') && (TURN_SRC.match(/Date\.now\(\) - turnInFlightSince/g) || []).length >= 2,
    'the lock anchor AND every age that subtracts from it are the same wall-clock pair (no half-migrated lock)')
  ok(!/clockMsOf\(\)\s*-/.test(TURN_SRC) && !/-\s*clockMsOf\(\)/.test(TURN_SRC),
    'the migrated stamps are FACTS a caller reads, not durations that decide a deadline (nothing subtracts a clockMsOf reading)')

  console.log('=== 10. an ELAPSED pair is declared ONCE with count 2, so both halves are judged together ===')
  const PAIR_LINE = 'ms: Date.now() - itemStartedAt'
  const pairBoth = auditClockPurity({ roots: [], extraSources: [{ file: 'vibe-math-vmu/kernel/turn/index.js', text: PAIR_LINE + NL + PAIR_LINE + NL }] })
  ok(pairBoth.staleLegacy.length > 0 && pairBoth.staleLegacy.filter((s) => s.match === PAIR_LINE).length === 0,
    'both halves of the dispatch elapsed pair satisfy ONE declaration (count: 2) — no stale entry is raised', pairBoth.staleLegacy)
  ok(pairBoth.findings.length === 0, 'and neither half is a finding while the count holds', pairBoth.findings)
  const pairHalf = auditClockPurity({ roots: [], extraSources: [{ file: 'vibe-math-vmu/kernel/turn/index.js', text: PAIR_LINE + NL }] })
  ok(pairHalf.staleLegacy.some((s) => s.match === PAIR_LINE && s.declared === 2 && s.matched === 1),
    'half the pair leaves the declaration STALE with declared 2 / matched 1 (the pair must move together)', pairHalf.staleLegacy)
  ok((TURN_SRC.match(/ms: Date\.now\(\) - itemStartedAt/g) || []).length === 2,
    'the real file still has exactly two halves of that pair (success and failure branches)', (TURN_SRC.match(/ms: Date\.now\(\) - itemStartedAt/g) || []).length)
} catch (e) {
  failed += 1
  failures.push('threw outside a section: ' + ((e && e.stack) || e))
  console.error('  FAIL threw outside a section - ' + ((e && e.stack) || e))
}

console.log('')
console.log('=== vmu-run257-clock-legacy: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) { console.log(failures.join(NL)); process.exitCode = 1 }

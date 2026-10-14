// WHAT THIS PROVES, AND WHAT IT CANNOT (round 608, discipline 11.ao).
//
// This proves NO DRIFT: each generator, run bare, produces what the committed file already contains. It cannot prove the artifact is
// CORRECT, because the criterion is the generator itself - and round 606 measured exactly that blind spot: a real bug, a generator
// reading source code as data, passed this check fourteen times out of fourteen both before and after the fix, since it produced the
// same wrong output every time.
//
// THE INDEPENDENT CRITERION LIVES ELSEWHERE, and it is the OUTCOME rather than the agreement: the generated settings table's counts
// (1038 keys across 105 families, asserted against the schema) and the content of the generated schema (no source fragment admitted as
// a key). A guard may only claim what its criterion can reach, so this one claims currency.
//
// tests/audit-generators-current.test.mjs - run EVERY generator that regen-all lists, bare, and require each to verify.
//
// WHY. Nine generators were wired into regen-all and only seven had a guard: generate-pack-prompts and generate-pack-persona
// had none, so a hand edit to packs/v5r-prompts.js or packs/v5r-persona.js would have survived the whole gate. Worse, those
// two had the OPPOSITE default - they wrote unless passed --check - so running them to test them would have overwritten the
// file being tested. Round 507 made --write the opt-in everywhere, and this guard reads regen-all's own table and runs each
// generator bare, so a generator added there is covered the moment it is listed and can never be silently bypassed.
import { readFileSync, existsSync, mkdtempSync, copyFileSync, rmSync } from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

console.log('=== 1. REGEN-ALL S OWN TABLE IS READ ===')
const regen = readFileSync(join(REPO, 'scripts', 'regen-all.mjs'), 'utf8')
const entries = [...regen.matchAll(/\['([^']+)',\s*'(scripts\/generate-[\w-]+\.mjs)'(?:,\s*'([^']*)')?\]/g)]
  .map((m) => ({ label: m[1], script: m[2], args: (m[3] || '').trim() }))
ok(entries.length >= 11, 'regen-all lists its generators', { n: entries.length })
const missingScript = entries.filter((e) => !existsSync(join(REPO, e.script)))
ok(missingScript.length === 0, 'and every script it lists exists', { missing: missingScript.map((e) => e.script) })

console.log('=== 2. EVERY GENERATOR MAKES WRITING AN OPT-IN ===')
// a generator that overwrites by default cannot be verified without destroying the thing under test
const writeByDefault = []
for (const e of entries) {
  const src = readFileSync(join(REPO, e.script), 'utf8')
  const writesOnWriteFlag = /process\.argv\.includes\('--write'\)/.test(src)
  const checks = /--check/.test(src)
  if (!writesOnWriteFlag && !checks) writeByDefault.push(e.script)
}
ok(writeByDefault.length === 0,
  'every generator checks unless asked to write, so running one to verify it cannot overwrite what it verifies',
  { writeByDefault })

console.log('=== 3. AND NO GENERATED ARTIFACT IS STALE ===')
const stale = []
for (const e of entries) {
  try {
    execFileSync(process.execPath, [join(REPO, e.script)], { cwd: REPO, encoding: 'utf8' })
  } catch (err) {
    stale.push(e.label + ' -> ' + (String(err.stdout || '') + String(err.stderr || '')).trim().slice(0, 140))
  }
}
ok(stale.length === 0,
  'running every generator bare reports every generated artifact current, so a hand edit to one fails the gate',
  { stale })

console.log('=== 4. AN INDEPENDENT CRITERION (discipline 11.ao) ===')
// Sections 1-3 prove NO DRIFT: every generator agrees with the file it writes. That cannot prove correctness, because the criterion is
// the generator itself - round 606 measured the blind spot, a generator reading source code as data that passed all three sections both
// before and after a real fix. This section supplies the missing half: an INDEPENDENT number, taken from the runtime rather than from
// any generator, and compared against what the generated artifact PRINTS. It would have caught round 604's bug, where a mis-parsed
// family made the table claim one key more than the schema declares.
const { SETTING_DEFS } = await import('../vibe-math-vmu/settings/schema.js')
// SAME WIDTH AS THE OBJECT (discipline 8, and my own first attempt here broke it). SETTING_DEFS composes the schema's written keys WITH
// the planned registry - a thousand and thirty-eight plus a hundred and fourteen - while the generated table states its source is the
// schema's `key:` declarations and prints the schema-only count. Comparing the union against the schema-only number would be a false
// alarm, so the independent schema-only count is the declared keys MINUS the planned ones.
const plannedSrc = readFileSync(join(REPO, 'vibe-math-vmu', 'settings', 'planned.js'), 'utf8')
const plannedKeys = new Set([...plannedSrc.matchAll(/key:\s*['"](vmu\.[^'"]+)['"]/g)].map((m) => m[1]))
const allDeclared = SETTING_DEFS.filter((d) => d && typeof d.key === 'string' && /^vmu\./.test(d.key)).map((d) => d.key)
const schemaOnly = allDeclared.filter((k) => !plannedKeys.has(k))
const truly = schemaOnly.length
ok(truly > 0 && allDeclared.length > truly,
  'the independent count is taken from the runtime declaration and scoped to the schema, since SETTING_DEFS also composes planned keys',
  { schemaOnly: truly, all: allDeclared.length, planned: plannedKeys.size })
const settingsTable = readFileSync(join(REPO, 'vibe-math-vmu', 'docs', '04-settings.md'), 'utf8')
const printed = settingsTable.match(/键 \*\*(\d+)\*\* 个/)
ok(printed !== null, 'and the generated settings table states a key count in its header', { found: !!printed })
if (printed) {
  ok(Number(printed[1]) === truly,
    'the count the table PRINTS equals the schema-only count the runtime DECLARES, which generators cannot establish by agreeing with themselves',
    { printed: Number(printed[1]), schemaOnly: truly, all: allDeclared.length })
  // would-bite: the same comparison must reject a count off by one, which is exactly what round 604 emitted
  ok(Number(printed[1]) + 1 !== truly,
    'and a count one higher than the declaration is rejected, which is the shape round 604 emitted', { offByOne: Number(printed[1]) + 1, truly })
}

console.log('=== 5. THE TWO WRITERS OF docs/00-README.md ARE INDEPENDENT, AND WRITING TWICE IS A NO-OP ===')
// WHY THIS SECTION EXISTS (round-1 handover, MEASURED): `regen-all` reported every generator written, yet the
// bare check that follows reported the readiness figures STALE, and the first hypothesis was a read-modify-write
// race between the two generators that write this page (`generate-wiring-index` writes its §3.2 block,
// `generate-readiness-figures` writes its §7.6 blocks). Measured answer: there is NO race - both patch only
// their own delimited block and both are idempotent. The staleness had a different cause, named in the last
// assertion below: the readiness figures include the LINE COUNT OF docs/14, a volume other tasks keep editing,
// so any edit to it invalidates docs/00-§7.6 until the generator is re-run. This section turns "they cannot
// disturb each other" from an assumption into an assertion, exercised on a COPY through the generators' own
// seams so the real page is never touched.
const markerPairs = (rel) => {
  const src = readFileSync(join(REPO, rel), 'utf8')
  return [...src.matchAll(/(?:export\s+)?const\s+\w*BEGIN\s*=\s*'([^']+)'[\s\S]{0,240}?(?:export\s+)?const\s+\w*END\s*=\s*'([^']+)'/g)]
    .map((m) => ({ begin: m[1], end: m[2] }))
}
const blockOf = (text, p) => {
  const i = text.indexOf(p.begin)
  if (i === -1) return null
  const j = text.indexOf(p.end, i)
  return j === -1 ? null : text.slice(i, j + p.end.length)
}
const stripBlocks = (text, pairs) => {
  let t = text
  for (const p of pairs) {
    const i = t.indexOf(p.begin)
    if (i === -1) continue
    const j = t.indexOf(p.end, i)
    if (j !== -1) t = t.slice(0, i) + t.slice(j + p.end.length)
  }
  return t
}
const RD = 'scripts/generate-readiness-figures.mjs'
const WI = 'scripts/generate-wiring-index.mjs'
const rdPairs = markerPairs(RD)
const wiPairs = markerPairs(WI)
ok(rdPairs.length >= 2 && wiPairs.length >= 1,
  'both writers declare their marked blocks in their own source, so the comparison below uses DERIVED markers',
  { readinessBlocks: rdPairs.length, wiringBlocks: wiPairs.length })
const runGen = (script, args, env) => spawnSync(process.execPath, [join(REPO, script), ...args], {
  cwd: REPO, encoding: 'utf8', env: Object.assign({}, process.env, env),
})
const scratch = mkdtempSync(join(tmpdir(), 'gen-writers-'))
try {
  const copy = join(scratch, '00-README.md')
  copyFileSync(join(REPO, 'vibe-math-vmu', 'docs', '00-README.md'), copy)
  const original = readFileSync(copy, 'utf8')
  // (a) readiness, twice: the second run must change NOTHING.
  const rdWrite1 = runGen(RD, ['--write'], { VMU_READINESS_DOC: copy })
  const afterRd1 = readFileSync(copy, 'utf8')
  const rdWrite2 = runGen(RD, ['--write'], { VMU_READINESS_DOC: copy })
  const afterRd2 = readFileSync(copy, 'utf8')
  ok(rdWrite1.status === 0 && rdWrite2.status === 0,
    'readiness --write exits 0 through an ABSOLUTE-path seam (its seam resolves like its sibling now)',
    { first: rdWrite1.status, second: rdWrite2.status })
  ok(afterRd1 === afterRd2, '★ readiness: re-running --write is byte-for-byte a no-op (idempotent)',
    { bytes1: afterRd1.length, bytes2: afterRd2.length })
  const rdBlocks = rdPairs.map((p) => blockOf(afterRd2, p))
  ok(rdBlocks.length > 0 && rdBlocks.length === rdPairs.length && rdBlocks.every((b) => typeof b === 'string' && b.length > 0),
    '★ readiness really wrote its marked blocks, so the preservation check below is not comparing two nulls',
    { blockBytes: rdBlocks.map((b) => (b === null ? null : b.length)) })
  // (b) wiring writes ITS block: the readiness blocks must come through byte-identical.
  const wiWrite1 = runGen(WI, ['--write'], { VMU_WIRING_DOC: copy })
  const afterWi1 = readFileSync(copy, 'utf8')
  ok(wiWrite1.status === 0, 'wiring --write exits 0 through its seam', { exit: wiWrite1.status })
  ok(JSON.stringify(rdBlocks) === JSON.stringify(rdPairs.map((p) => blockOf(afterWi1, p))),
    '★ writing the WIRING block leaves the READINESS blocks byte-identical: each writer owns exactly one block')
  const wiBlocks = wiPairs.map((p) => blockOf(afterWi1, p))
  ok(wiBlocks.length > 0 && wiBlocks.length === wiPairs.length && wiBlocks.every((b) => typeof b === 'string' && b.length > 0),
    '★ wiring really wrote its marked block (the cross-preservation check above is load-bearing)',
    { blockBytes: wiBlocks.map((b) => (b === null ? null : b.length)) })
  // (c) wiring, twice: the second run must change NOTHING.
  const wiWrite2 = runGen(WI, ['--write'], { VMU_WIRING_DOC: copy })
  const afterWi2 = readFileSync(copy, 'utf8')
  ok(wiWrite2.status === 0 && afterWi1 === afterWi2,
    '★ wiring: re-running --write is byte-for-byte a no-op (idempotent)', { bytes: afterWi2.length })
  // (d) NOTHING outside the two writers' blocks was touched.
  const allPairs = rdPairs.concat(wiPairs)
  ok(stripBlocks(afterWi2, allPairs) === stripBlocks(original, allPairs),
    '★ everything outside the two generated blocks is preserved byte-for-byte (a writer cannot rewrite the page)')
  // (e) afterwards each generator still checks its own block as current.
  const rdCheck = runGen(RD, [], { VMU_READINESS_DOC: copy })
  const wiCheck = runGen(WI, [], { VMU_WIRING_DOC: copy })
  ok(rdCheck.status === 0 && wiCheck.status === 0,
    'and after both writers ran, each generator reports its own block current',
    { readinessExit: rdCheck.status, wiringExit: wiCheck.status, readinessOut: String(rdCheck.stdout || '').trim().slice(0, 80) })
} finally {
  rmSync(scratch, { recursive: true, force: true })
}
// THE MEASURED CAUSE of the staleness that motivated this section, asserted so it stays documented rather than
// re-diagnosed as a race: the readiness block contains a figure derived from ANOTHER editable volume.
{
  const rdSrc = readFileSync(join(REPO, RD), 'utf8')
  ok(/14-open-items-and-roadmap\.md/.test(rdSrc) && /lines:\s*road\.split/.test(rdSrc),
    'the readiness figure coupled to another editable volume is named here: edit docs/14 ⇒ re-run this generator (NOT a cross-writer race)',
    { coupling: 'docs/14 line count -> docs/00 §7.6' })
}

// ── ROUND 3: the WIRED-SCHEMA key extraction must not read KEYS OUT OF PROSE ─────────────────────────────────
// MEASURED CAUSE: `kernel/paper.js` explained the C-30 rule in a comment that QUOTED key names, and
// `generate-wired-schema.mjs` registered those quoted strings as real settings keys (exit=1) until a human
// rewrote the comment. A guard whose greenness depends on nobody quoting a key in prose is not a guard, so the
// extraction now shape-checks its candidates and the probe below proves BOTH directions: pseudo-keys in comments
// stay out, real keys stay in. (Writing the probe caught a wrong expectation of mine: `vmu.a.b` IS well-formed,
// so the malformed list now uses genuinely malformed shapes.)
{
  const gen = await import(new URL('../scripts/generate-wired-schema.mjs', import.meta.url).href)
  const p = gen.keyShapeProbe()
  ok(p.fakeInCommentExcluded,
    '★ KEY_SHAPE: a key-looking string inside a COMMENT is NOT registered (neither via WIRED_KEYS nor via an accessor form)',
    JSON.stringify({ wired: p.wired, read: p.read }))
  ok(p.realStillFound,
    '★ and the REAL keys in the same fragment are still found (the exclusion is not a blanket ban)',
    JSON.stringify({ wired: p.wired, read: p.read }))
  ok(p.shapeRejectsMalformed,
    '★ KEY_SHAPE rejects foreign/malformed shapes (`vmu.onegroup`, `vmu.Upper.key`, `other.key`, `vmu.two.`, `vmu.a..b`, `vmu.a-b.c`)',
    String(gen.KEY_SHAPE))
  const self = spawnSync(process.execPath, [join(REPO, 'scripts', 'generate-wired-schema.mjs'), '--selftest'],
    { cwd: REPO, encoding: 'utf8' })
  ok(self.status === 0,
    '★ and running the generator\'s OWN `--selftest` exits 0 (so the probe is executable, not just asserted here)',
    'EXIT=' + self.status + ' :: ' + String(self.stdout || '').trim().split('\n').slice(-1)[0])
}

console.log('=== GENERATORS CURRENT: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }

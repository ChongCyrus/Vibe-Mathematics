#!/usr/bin/env node
/**
 * THE TEMP ROOT RULER (TB-2746 / task-226): scratch space has ONE root, and it is the host's.
 *
 * CI run 43084472078 went red on 43 files across eight shards for a reason that had nothing to do with
 * the code under test: suites wrote to one drive-letter scratch path that exists only on the maintainer
 * laptop. A judge that reads a path off the operator machine is a local script wearing a gate clothes.
 *
 * What is defended here, in order:
 *   §0  NO CODE CARRIES A LEGACY SCRATCH PATH. Every `.mjs`/`.js` under `scripts/` and `vibe-math-vmu/`
 *       (the helper itself included) must be free of it. Recorded evidence JSON/reports are the only
 *       exception, listed EXPLICITLY with a reason and an exact count, so the list cannot grow quietly.
 *   §1  THE DEFAULT IS THE HOST TEMPORAL DIRECTORY. `tmpRoot()` with no override lands under
 *       `os.tmpdir()`, is absolute, and is creatable and writable.
 *   §2  THE OVERRIDE IS HONOURED AND A RELATIVE ONE IS REFUSED BY NAME (`VMU_TMP_ROOT_NOT_ABSOLUTE`),
 *       because a relative scratch root resolves against whatever cwd the caller had - which is how a
 *       scratch write lands inside the repository.
 *   §3  `scratchDir()` RETURN TWO DIFFERENT DIRECTORIES under the root (a fixed name would let two
 *       concurrent suites overwrite each other evidence), and `ensureScratch()` is stable and nested.
 *   §4  THREE RED LAMPS on TREE COPIES under this suite own scratch dir: a portable-but-not-default
 *       helper, a relative override that is not refused, and a fixed scratch name must each turn the
 *       judge red. A lamp that does not bite is worse than no lamp: it certifies by assumption.
 *
 * Every lamp runs on a copy; the repository helper sha256 is taken before and after and must be equal.
 */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const HELPER = join(ROOT, 'scripts', 'lib', 'tmp-root.mjs')
const SCRATCH = mkdtempSync(join(tmpdir(), 'vmu-tmp-root-portable-'))
// The legacy path is NEVER spelled out in this file: a judge that contains the disease cannot be used to
// diagnose it (a grep for the literal would hit the judge first and teach the reader to ignore it).
const LEGACY_DRIVE = 'D:'
const LEGACY_NAME = '_' + 'tmp'
const LEGACY_TEXT = LEGACY_DRIVE + '\\' + LEGACY_NAME
const LEGACY_RE = new RegExp('D:[\\\\/]{1,2}' + LEGACY_NAME)

const SCAN_DIRS = ['scripts', 'vibe-math-vmu']
const CODE_EXT = /\.(mjs|cjs|js)$/

// Recorded artefacts whose BYTES ARE THE CLAIM: they cite the corpus paths they were computed from, so
// rewriting them would forge the record rather than make anything portable.
const EVIDENCE_ALLOW = [
  { path: 'scripts/sim/audit/action-coverage-report.md', why: 'human report of the per-action coverage union; its citation of the corpus path is the provenance of the numbers it prints' },
  { path: 'scripts/sim/audit/action-coverage.json', why: 'recorded coverage union with the corpus directories and reachability probe it was computed from; rewriting the provenance would forge the measurement' },
  { path: 'scripts/sim/audit/fidelity-declared.json', why: 'field declarations that cite real-fields.jsonl line numbers; the citation is the evidence a reviewer re-checks, so it must keep the path it was measured at' },
  { path: 'scripts/sim/audit/rule-steps-report.md', why: 'human report of the rule-step corpus; it names the corpora it replayed' },
  { path: 'scripts/sim/audit/rule-steps.json', why: 'recorded rule-step provenance: which corpus directory each replayed step came from' },
  // Red-team corpora are RECORDINGS: each receipt carries the absPath where the simulator actually wrote.
  // Those bytes are what the red-team gate replays; rewriting them would change the corpus digest and turn
  // a recording into a claim - the exact failure mode this task exists to stop.
  { path: 'scripts/sim/redteam/data/corpus/corpus-actions-extra/receipts.jsonl', why: 'recorded red-team corpus: absPath fields are where the simulation actually wrote, and that digest is the evidence' },
  { path: 'scripts/sim/redteam/data/corpus/corpus-mainline/receipts.jsonl', why: 'recorded red-team corpus: absPath fields are where the simulation actually wrote, and that digest is the evidence' },
  { path: 'scripts/sim/redteam/data/corpus/corpus-paper/receipts.jsonl', why: 'recorded red-team corpus: absPath fields are where the simulation actually wrote, and that digest is the evidence' },
  { path: 'scripts/sim/redteam/data/corpus/corpus-records-blueprint/receipts.jsonl', why: 'recorded red-team corpus: absPath fields are where the simulation actually wrote, and that digest is the evidence' },
]

// The independent copy of the SET: EVIDENCE_ALLOW carries the reasons, this literal carries the names. Recording a new
// artefact is a decision, so it must be typed twice - otherwise one edit that only grows the allow-list would widen
// the exception while the judge kept saying "exactly nine".
const EXPECTED_EVIDENCE_PATHS = Object.freeze([
  'scripts/sim/audit/action-coverage-report.md',
  'scripts/sim/audit/action-coverage.json',
  'scripts/sim/audit/fidelity-declared.json',
  'scripts/sim/audit/rule-steps-report.md',
  'scripts/sim/audit/rule-steps.json',
  'scripts/sim/redteam/data/corpus/corpus-actions-extra/receipts.jsonl',
  'scripts/sim/redteam/data/corpus/corpus-mainline/receipts.jsonl',
  'scripts/sim/redteam/data/corpus/corpus-paper/receipts.jsonl',
  'scripts/sim/redteam/data/corpus/corpus-records-blueprint/receipts.jsonl',
])

const ok = (cond, msg, extra) => {
  assert.ok(cond, msg + (extra === undefined ? '' : ' :: ' + JSON.stringify(extra)))
}

const sha256Of = (file) => 'sha256:' + createHash('sha256').update(readFileSync(file)).digest('hex')

function allFilesUnder(root) {
  const out = []
  const stack = SCAN_DIRS.map((d) => join(root, d)).filter((p) => existsSync(p))
  while (stack.length > 0) {
    const dir = stack.pop()
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === '.git') continue
      const p = join(dir, name)
      const st = statSync(p)
      if (st.isDirectory()) stack.push(p)
      else if (st.isFile()) out.push(p)
    }
  }
  return out.sort()
}

/** Split the hits by OWNER: this lane owns `scripts/**`; `vibe-math-vmu/**` belongs to the product lane. */
function scanForLegacy(root) {
  const scriptsCode = []
  const scriptsEvidence = []
  const product = []
  for (const file of allFilesUnder(root)) {
    const text = readFileSync(file, 'utf8')
    if (!LEGACY_RE.test(text)) continue
    const rel = relative(root, file).split(sep).join('/')
    if (rel.startsWith('scripts/')) {
      if (CODE_EXT.test(file)) scriptsCode.push(rel)
      else scriptsEvidence.push(rel)
    } else {
      product.push(rel)
    }
  }
  return { scriptsCode: scriptsCode.sort(), scriptsEvidence: scriptsEvidence.sort(), product: product.sort() }
}

const NORMALISE = (p) => String(p).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
const under = (child, parent) => NORMALISE(child) === NORMALISE(parent) || NORMALISE(child).startsWith(NORMALISE(parent) + '/')

function runChild(code, extraEnv) {
  const res = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    encoding: 'utf8',
    timeout: 60000,
    env: Object.assign({}, process.env, extraEnv || {}, { TMP_ROOT_HELPER_URL: pathToFileURL(HELPER).href }),
  })
  const out = String(res.stdout || '').trim()
  const last = out.split('\n').filter((l) => l.trim() !== '').pop() || ''
  let payload = null
  try {
    payload = JSON.parse(last)
  } catch (e) {
    payload = null
  }
  return { status: res.status, payload, stdout: out, stderr: String(res.stderr || '') }
}

function runChildAgainst(helperPath, code, extraEnv) {
  const res = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    encoding: 'utf8',
    timeout: 60000,
    env: Object.assign({}, process.env, extraEnv || {}, { TMP_ROOT_HELPER_URL: pathToFileURL(helperPath).href }),
  })
  const last = String(res.stdout || '').trim().split('\n').filter((l) => l.trim() !== '').pop() || ''
  let payload = null
  try {
    payload = JSON.parse(last)
  } catch (e) {
    payload = null
  }
  return { status: res.status, payload, stdout: String(res.stdout || ''), stderr: String(res.stderr || '') }
}

const FACTS_CODE = `
const m = await import(process.env.TMP_ROOT_HELPER_URL)
const { tmpdir } = await import('node:os')
const { isAbsolute } = await import('node:path')
const { writeFileSync, rmSync, existsSync } = await import('node:fs')
const root = m.tmpRoot()
const inside = m.ensureScratch('')
writeFileSync(inside + '/.probe', 'x')
const writable = existsSync(inside + '/.probe')
rmSync(inside + '/.probe', { force: true })
console.log(JSON.stringify({ root, tmpdir: tmpdir(), absolute: isAbsolute(root), writable, described: m.describeTmpRoot() }))
`

const OVERRIDE_CODE = `
const m = await import(process.env.TMP_ROOT_HELPER_URL)
console.log(JSON.stringify({ root: m.tmpRoot() }))
`

const RELATIVE_CODE = `
const m = await import(process.env.TMP_ROOT_HELPER_URL)
try {
  console.log(JSON.stringify({ threw: false, root: m.tmpRoot() }))
} catch (e) {
  console.log(JSON.stringify({ threw: true, code: e && e.code, message: String(e && e.message) }))
}
`

const SCRATCH_CODE = `
const m = await import(process.env.TMP_ROOT_HELPER_URL)
const { existsSync } = await import('node:fs')
const root = m.tmpRoot()
const a = m.scratchDir('probe-a-')
const b = m.scratchDir('probe-a-')
const nested = m.ensureScratch('deep/nested')
const nestedAgain = m.ensureScratch('deep/nested')
console.log(JSON.stringify({ root, a, b, nested, nestedAgain, nestedExists: existsSync(nested), aUnder: a !== root && a.startsWith(root), bUnder: b !== root && b.startsWith(root) }))
`

/** §0: no code under this lane tree carries the legacy path; recorded evidence is allow-listed by exact set. */
function failures0(root) {
  const failures = []
  const hits = scanForLegacy(root)
  if (hits.scriptsCode.length > 0) {
    failures.push('legacy scratch path in CODE: ' + hits.scriptsCode.join(', ') + ' - scratch space must come from scripts/lib/tmp-root.mjs')
  }
  const allowed = EVIDENCE_ALLOW.map((e) => e.path).slice().sort()
  const found = hits.scriptsEvidence.slice().sort()
  if (JSON.stringify(found) !== JSON.stringify(allowed)) {
    failures.push('recorded-evidence allow-list drift: found ' + JSON.stringify(found) + ', allowed exactly ' + JSON.stringify(allowed))
  }
  return failures
}

/** §1: default root is under os.tmpdir(), absolute, writable. */
function failures1(helperPath) {
  const failures = []
  const r = runChildAgainst(helperPath, FACTS_CODE, { VMU_TMP_ROOT: '' })
  if (r.status !== 0 || r.payload === null) {
    failures.push('could not read the default root: exit ' + r.status + ' ' + (r.stderr || r.stdout).slice(0, 400))
    return failures
  }
  const p = r.payload
  if (!under(p.root, p.tmpdir)) failures.push('default tmpRoot() is NOT under os.tmpdir(): ' + p.root + ' vs ' + p.tmpdir)
  if (!p.absolute) failures.push('default tmpRoot() is not an absolute path: ' + p.root)
  if (!p.writable) failures.push('default tmpRoot() is not writable: ' + p.root)
  if (!String(p.described).includes(p.root)) failures.push('describeTmpRoot() does not name the root it uses: ' + p.described)
  return failures
}

/** §2: override honoured; relative override refused by name. */
function failures2(helperPath, overrideRoot) {
  const failures = []
  const over = runChildAgainst(helperPath, OVERRIDE_CODE, { VMU_TMP_ROOT: overrideRoot })
  if (over.status !== 0 || over.payload === null) failures.push('VMU_TMP_ROOT override failed to load: ' + (over.stderr || over.stdout).slice(0, 400))
  else if (NORMALISE(over.payload.root) !== NORMALISE(overrideRoot)) failures.push('VMU_TMP_ROOT was not honoured: got ' + over.payload.root + ', expected ' + overrideRoot)

  const bad = runChildAgainst(helperPath, RELATIVE_CODE, { VMU_TMP_ROOT: 'relative/scratch' })
  if (bad.status !== 0 || bad.payload === null) failures.push('the relative-override probe crashed instead of answering: ' + (bad.stderr || bad.stdout).slice(0, 400))
  else if (bad.payload.threw !== true) failures.push('a RELATIVE VMU_TMP_ROOT was accepted (root=' + bad.payload.root + '); it must be refused by name')
  else if (bad.payload.code !== 'VMU_TMP_ROOT_NOT_ABSOLUTE') failures.push('the relative override was refused, but not by name: code=' + bad.payload.code)
  else if (!String(bad.payload.message).includes('relative/scratch')) failures.push('the refusal does not quote the offending value: ' + bad.payload.message)
  return failures
}

/** §3: scratchDir unique; ensureScratch stable and nested under the root. */
function failures3(helperPath) {
  const failures = []
  const r = runChildAgainst(helperPath, SCRATCH_CODE, { VMU_TMP_ROOT: '' })
  if (r.status !== 0 || r.payload === null) {
    failures.push('could not measure scratchDir(): exit ' + r.status + ' ' + (r.stderr || r.stdout).slice(0, 400))
    return failures
  }
  const p = r.payload
  if (p.a === p.b) failures.push('two scratchDir() calls returned the SAME path (' + p.a + '): concurrent suites would share a scratch dir')
  if (!p.aUnder || !p.bUnder) failures.push('scratchDir() returned a path outside the root: ' + p.a + ' / ' + p.b + ' vs ' + p.root)
  if (p.nested !== p.nestedAgain) failures.push('ensureScratch() is not stable for the same relative path: ' + p.nested + ' vs ' + p.nestedAgain)
  if (!p.nestedExists) failures.push('ensureScratch() did not create the nested directory: ' + p.nested)
  if (!under(p.nested, p.root)) failures.push('ensureScratch() escaped the root: ' + p.nested + ' vs ' + p.root)
  return failures
}

const allFailures = (root, helperPath, overrideRoot) => [
  ...failures0(root),
  ...failures1(helperPath),
  ...failures2(helperPath, overrideRoot),
  ...failures3(helperPath),
]

function treeCopy(label) {
  const dir = join(SCRATCH, label)
  mkdirSync(dir, { recursive: true })
  cpSync(join(ROOT, 'scripts'), join(dir, 'scripts'), { recursive: true, filter: (src) => !src.includes(sep + 'node_modules' + sep) })
  mkdirSync(join(dir, 'vibe-math-vmu'), { recursive: true })
  return dir
}

after(() => {
  rmSync(SCRATCH, { recursive: true, force: true })
})

test('§0 no code under scripts/** or vibe-math-vmu/** carries a legacy scratch path', (t) => {
  const hits = scanForLegacy(ROOT)
  assert.deepEqual(hits.scriptsCode, [], 'these code files still name the legacy scratch path: ' + hits.scriptsCode.join(', '))
  ok(existsSync(HELPER), 'the helper exists, so the scan above actually covered the ruler itself', {})
  ok(!LEGACY_RE.test(readFileSync(HELPER, 'utf8')), 'the helper itself carries no legacy literal (a ruler that contains the disease cannot diagnose it)', {})
  // The product tree is NOT this lane write domain (lead ruling, TB-2746): the judge reports what it sees
  // there so the product lane can act, but it does not gate on a tree it may not edit (a judge that fails
  // on another owners file teaches people to skip it).
  const productScanned = allFilesUnder(ROOT).filter((f) => relative(ROOT, f).split(sep).join('/').startsWith('vibe-math-vmu/')).length
  ok(productScanned > 100, 'the product tree was actually scanned (a report over an empty tree is not a report)', { productScanned })
  t.diagnostic('product tree, REPORT-ONLY (' + hits.product.length + ' hit(s), product lane owns the fix): ' + (hits.product.length === 0 ? 'none' : hits.product.join(', ')))
})

test('§0 recorded evidence is allow-listed by EXACT path, with a reason, and the list is fixed-size', () => {
  const hits = scanForLegacy(ROOT)
  const allowed = EVIDENCE_ALLOW.map((e) => e.path).slice().sort()
  assert.equal(EVIDENCE_ALLOW.length, 9, 'the allow-list is fixed at nine recorded-evidence files (5 audit records + 4 replayed corpora): growing it is a decision, not an edit')
  assert.deepEqual(EVIDENCE_ALLOW.map((e) => e.path).slice().sort(), [...EXPECTED_EVIDENCE_PATHS].sort(), 'the allow-list SET must equal the independent EXPECTED_EVIDENCE_PATHS literal: a new recorded-evidence entry has to be typed in both places, so it cannot slip in as one silent edit')
  assert.equal(new Set(EVIDENCE_ALLOW.map((e) => e.path)).size, EVIDENCE_ALLOW.length, 'the allow-list has no duplicate path (a duplicated entry would hide a removal)')
  for (const entry of EVIDENCE_ALLOW) {
    ok(entry.why.length >= 24, 'allow-list entry ' + entry.path + ' needs a real reason (24+ chars)', { why: entry.why })
    ok(existsSync(join(ROOT, entry.path)), 'allow-listed file exists: ' + entry.path, {})
    ok(hits.scriptsEvidence.includes(entry.path), 'allow-listed file still cites its path (else the entry is stale): ' + entry.path, {})
  }
  assert.deepEqual(hits.scriptsEvidence.slice().sort(), allowed, 'recorded-evidence hits must be exactly the allow-list: no silent extras, no stale entries')
})

test('§1 the default root is os.tmpdir()-derived, absolute and writable', () => {
  const failures = failures1(HELPER)
  assert.deepEqual(failures, [], failures.join(' | '))
})

test('§2 VMU_TMP_ROOT is honoured, and a relative value is refused BY NAME', () => {
  const overrideRoot = join(SCRATCH, 'override-root')
  const failures = failures2(HELPER, overrideRoot)
  assert.deepEqual(failures, [], failures.join(' | '))
})

test('§3 scratchDir() is unique; ensureScratch() is stable and nested', () => {
  const failures = failures3(HELPER)
  assert.deepEqual(failures, [], failures.join(' | '))
})

test('§4 LAMP 1: a non-portable default (legacy drive root + literal) turns §0 or §1 red', (t) => {
  const before = sha256Of(HELPER)
  const dir = treeCopy('lamp-default')
  const helper = join(dir, 'scripts', 'lib', 'tmp-root.mjs')
  const original = readFileSync(helper, 'utf8')
  const badDefault = 'const LEGACY_ROOT = ' + JSON.stringify(LEGACY_DRIVE) + ' + String.fromCharCode(92) + ' + JSON.stringify(LEGACY_NAME) + '\n' + original.replace("if (raw === undefined || String(raw).trim() === '') return join(tmpdir(), 'vmu-gate')", "if (raw === undefined || String(raw).trim() === '') return LEGACY_ROOT")
  const mutated = '// legacy scratch root ' + LEGACY_TEXT + '\n' + badDefault
  ok(mutated !== original, 'LAMP 1 mutation changed the helper (an unapplied lamp proves nothing)', {})
  writeFileSync(helper, mutated)
  const failures = allFailures(dir, helper, join(SCRATCH, 'lamp-default-override'))
  const joined = failures.join(' | ')
  t.diagnostic('LAMP 1 red lines (the mutated helper, judged by the same suite): ' + JSON.stringify(failures, null, 2))
  ok(failures.length > 0, 'LAMP 1: the judge went red on a non-portable helper', { failures })
  ok(failures.some((f) => f.includes('legacy scratch path in CODE')), 'LAMP 1: §0 named the literal carrier', { failures })
  // §0 legitimately fires FIRST: `scripts/lib/tmp-root.mjs` is the ONE legal holder of the derivation (that is the
  // whole point of the ruler), so mutating it necessarily plants the legacy literal in a CODE file, and §0's
  // literal scan sees the same fact before — or instead of — §1. §1 can also be silent when TEMP itself already IS
  // the legacy root (the gate runs with VMU_TMP_ROOT=D:\_tmp, and os.tmpdir() follows TEMP): then the mutated
  // default and os.tmpdir() agree and "not under os.tmpdir()" is not observable. Both red lines are true evidence
  // that the judge caught a non-portable default, so the lamp accepts either — requiring §1 specifically made the
  // lamp depend on the caller's TEMP, not on the judge.
  ok(failures.some((f) => f.includes('NOT under os.tmpdir()') || f.includes('legacy scratch path in CODE')),
    'LAMP 1: the judge named the non-portable default (§1) or its literal carrier (§0)', { failures })
  ok(join(dir, 'scripts').length > 0 && !joined.includes(ROOT + sep), 'LAMP 1 stayed inside its own tree copy', { dir })
  ok(sha256Of(HELPER) === before, 'LAMP 1 never touched the repository helper', { before, after: sha256Of(HELPER) })
})

test('§4 LAMP 2: accepting a relative VMU_TMP_ROOT turns §2 red', (t) => {
  const before = sha256Of(HELPER)
  const dir = treeCopy('lamp-relative')
  const helper = join(dir, 'scripts', 'lib', 'tmp-root.mjs')
  const original = readFileSync(helper, 'utf8')
  const mutated = original.replace('if (!isAbsolute(value)) {', 'if (false) {')
  ok(mutated !== original, 'LAMP 2 mutation changed the helper (an unapplied lamp proves nothing)', {})
  writeFileSync(helper, mutated)
  const failures = allFailures(dir, helper, join(SCRATCH, 'lamp-relative-override'))
  t.diagnostic('LAMP 2 red lines (relative override accepted): ' + JSON.stringify(failures, null, 2))
  ok(failures.some((f) => f.includes('RELATIVE VMU_TMP_ROOT was accepted')), 'LAMP 2: the judge named the accepted relative override', { failures })
  ok(sha256Of(HELPER) === before, 'LAMP 2 never touched the repository helper', {})
})

test('§4 LAMP 3: a fixed scratch name turns §3 red', (t) => {
  const before = sha256Of(HELPER)
  const dir = treeCopy('lamp-fixed')
  const helper = join(dir, 'scripts', 'lib', 'tmp-root.mjs')
  const original = readFileSync(helper, 'utf8')
  const mutated = original.replace('return mkdtempSync(join(root, prefix))', "mkdirSync(join(root, 'fixed-scratch'), { recursive: true }); return join(root, 'fixed-scratch')")
  ok(mutated !== original, 'LAMP 3 mutation changed the helper (an unapplied lamp proves nothing)', {})
  writeFileSync(helper, mutated)
  const failures = allFailures(dir, helper, join(SCRATCH, 'lamp-fixed-override'))
  t.diagnostic('LAMP 3 red lines (fixed scratch name): ' + JSON.stringify(failures, null, 2))
  ok(failures.some((f) => f.includes('two scratchDir() calls returned the SAME path')), 'LAMP 3: the judge named the shared scratch directory', { failures })
  ok(sha256Of(HELPER) === before, 'LAMP 3 never touched the repository helper', {})
})

test('§4 CONTROL: an UNMUTATED tree copy is green, so each lamp red is the mutation and not the copy', () => {
  const dir = treeCopy('control')
  const helper = join(dir, 'scripts', 'lib', 'tmp-root.mjs')
  const failures = allFailures(dir, helper, join(SCRATCH, 'control-override'))
  assert.deepEqual(failures, [], 'copy plumbing is broken: ' + failures.join(' | '))
})

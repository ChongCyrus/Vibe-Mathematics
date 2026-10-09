// vmu library — the capability scenario for kernel/library.js (docs/07 §4).
//
// The four lessons this module exists to encode, each verified against the failure mode it prevents:
//   1. content identity is computed in ONE place, over substantive parts only: a changed statement
//      changes identity, a changed TITLE does not (under the default policy), and the same content twice
//      is idempotent (same id, no duplicate file);
//   2. the head list carries exactly the seven documented fields and NO body, and it is rebuilt from disk
//      (rewriting a file behind the library's back is visible on the next list());
//   3. a dangling id is refused BY NAME - never an empty body, never an approximation;
//   4. the persisted fingerprint is READ BACK, not recomputed: a record whose stored fingerprint is
//      deliberately bogus still reports that stored value, which is what keeps writer and reader in sync.
// Plus: unknown tracks are refused by name, and truncation always carries a notice AND a counted record.
//
// `--self-probe` copies the module, REMOVES the dangling-id refusal and requires the corresponding
// assertion to fail (the technique tests/run-tests.mutants.mjs uses on the runner).

import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = resolve(HERE, '..')
const MODULE = resolve(REPO, 'vibe-math-vmu', 'kernel', 'library.js')
const SELF_PROBE = process.argv.includes('--self-probe')

let passed = 0, failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) passed++
  else { failed++; failures.push(name + (detail === undefined ? '' : ' [' + detail + ']')) }
}
const expectThrow = async (fn, code, name) => {
  try { await fn(); failed++; failures.push(name + ' (did not throw)') }
  catch (e) { ok(e && e.code === code, name, e && e.code) }
}

const m = await import(pathToFileURL(MODULE).href)
const root = await mkdtemp(join(tmpdir(), 'vmu-lib-'))
const mk = (opts = {}) => m.createLibrary(Object.assign({ root, clock: () => '2026-10-09T00:00:00.000Z' }, opts))

// ---- 1. content identity, in one place ---------------------------------------------------------
{
  const lib = mk()
  const a = lib.fingerprint('proposition', { statement: 'S', proof: 'P' })
  const b = lib.fingerprint('proposition', { statement: 'S', proof: 'P' })
  const c = lib.fingerprint('proposition', { statement: 'S2', proof: 'P' })
  const d = lib.fingerprint('proposition', { statement: 'S', proof: 'P', title: 'other', recorder: 'r-9' })
  ok(a === b, 'identical content => identical fingerprint')
  ok(a !== c, 'a changed statement changes identity')
  ok(a === d, 'the display head (title/recorder) does NOT change identity (content-only policy)')
  const shown = mk({ fingerprintPolicy: 'content+display' })
  ok(shown.fingerprint('proposition', { statement: 'S', proof: 'P', title: 'x' }) !==
     shown.fingerprint('proposition', { statement: 'S', proof: 'P', title: 'y' }),
    'under content+display the title DOES participate (the policy is explicit, not implicit)')
  ok(/^[0-9a-f]{64}$/.test(a), 'the fingerprint is a sha256 hex digest', a.slice(0, 12))
  await expectThrow(() => Promise.resolve(lib.fingerprint('proposition', { statement: '   ' })), 'VMU_INVALID_ARGUMENT',
    'an empty statement is refused (no identity for nothing)')
  await expectThrow(() => Promise.resolve(lib.fingerprint('theorem', { statement: 'S' })), 'VMU_INVALID_ARGUMENT',
    'an unknown kind is refused')
}

// ---- 2. append is idempotent and persists the identity -----------------------------------------
{
  const lib = mk()
  const r1 = await lib.append({ kind: 'proposition', statement: 'S', proof: 'P', owner: 'r-1', title: 'Card' })
  ok(r1.ok === true && r1.deduplicated === false, 'the first append writes a record')
  const r2 = await lib.append({ kind: 'proposition', statement: 'S', proof: 'P', owner: 'r-1', title: 'RENAMED' })
  ok(r2.deduplicated === true && r2.id === r1.id, 'the same content appends to the SAME record (idempotent)')
  const files = await readdir(join(root, 'Members', 'r-1', 'Propos'))
  ok(files.length === 1, 'no duplicate file is created', files.join(','))
  const raw = await readFile(r1.file, 'utf8')
  ok(raw.indexOf('fingerprint: ' + r1.fingerprint) !== -1, 'the fingerprint is PERSISTED with the record')
  const r3 = await lib.append({ kind: 'proposition', statement: 'S2', proof: 'P', owner: 'r-1' })
  ok(r3.deduplicated === false && r3.id !== r1.id, 'a different statement is a different record')
}

// ---- 3. the head list: seven fields, no body, rebuilt from disk --------------------------------
{
  const root3 = await mkdtemp(join(tmpdir(), 'vmu-lib-list-'))
  const lib = m.createLibrary({ root: root3, clock: () => '2026-10-09T00:00:00.000Z' })
  await lib.append({ kind: 'method', statement: 'M', owner: 'r-2', title: 'Method card' })
  const rows = await lib.list()
  ok(rows.length === 1, 'one record in the list', rows.length)
  ok(JSON.stringify(Object.keys(rows[0]).sort()) === JSON.stringify([...m.HEAD_FIELDS].sort()),
    'the head list carries exactly the seven documented fields', Object.keys(rows[0]).join(','))
  ok(!('body' in rows[0]) && !('statement' in rows[0]), 'the head list never carries a body')
  const file = join(root3, 'Members', 'r-2', 'Methods', (await readdir(join(root3, 'Members', 'r-2', 'Methods')))[0])
  await writeFile(file, (await readFile(file, 'utf8')).replace('title: Method card', 'title: Renamed behind its back'), 'utf8')
  const again = await lib.list()
  ok(again[0].title === 'Renamed behind its back', 'list() is rebuilt from disk (no stale cache)', again[0].title)
  await rm(root3, { recursive: true, force: true })
}

// ---- 4. a dangling id is refused by name -------------------------------------------------------
{
  const lib = mk()
  await expectThrow(() => lib.expand('does-not-exist'), 'VMU_NO_SUCH_OBJECT', 'expanding a dangling id is refused by name')
  const bad = await lib.expand('does-not-exist').catch((e) => e)
  ok(!('body' in bad) || bad.body === undefined, 'a refusal is an error object, never an empty body')
  const r = await lib.append({ kind: 'subproblem', statement: 'Q', owner: 'r-3' })
  const got = await lib.expand(r.id)
  ok(got.ok === true && got.body.indexOf('Q') !== -1 && got.head.id === r.id, 'a real id expands to its body and head')
}

// ---- 5. identity is READ BACK, never recomputed ------------------------------------------------
{
  const lib = mk()
  const dir = join(root, 'Members', 'r-4', 'Propos')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'hand-written.md'),
    '---\nid: hand-written\nkind: proposition\ntitle: T\nstatus: open\nowner: r-4\nfingerprint: 0000000000\nupdatedAt: 2026-01-01T00:00:00.000Z\n---\n\nbody', 'utf8')
  const got = await lib.storedFingerprint('hand-written')
  ok(got.fingerprint === '0000000000',
    'the persisted fingerprint is read back verbatim (recomputing it would let writer and reader disagree)',
    String(got.fingerprint))
  const head = (await lib.list()).find((h) => h.id === 'hand-written')
  ok(head && head.fingerprint === '0000000000', 'the head list reports the stored identity, not a fresh hash')
}

// ---- 6. tracks are a closed set -----------------------------------------------------------------
{
  const lib = mk()
  await lib.record('r-1', 'routes', 'tried X')
  const f = join(root, 'Members', 'r-1', 'Progress', 'routes.md')
  ok((await readFile(f, 'utf8')).indexOf('tried X') !== -1, 'a declared track accepts a record')
  await lib.record('r-1', 'obstacles', 'blocked on Y')
  ok((await readFile(join(root, 'Members', 'r-1', 'Progress', 'obstacles.md'), 'utf8')).indexOf('blocked on Y') !== -1,
    'negative knowledge has its own track (obstacles), separate from routes')
  await expectThrow(() => lib.record('r-1', 'random-track', 'x'), 'VMU_INVALID_ARGUMENT',
    'an undeclared track is refused by name')
}

// ---- 7. truncation is counted and visible ------------------------------------------------------
{
  const lib = mk()
  const r = await lib.append({ kind: 'method', statement: 'M'.repeat(400), owner: 'r-5' })
  const small = await lib.expand(r.id, { capBytes: 50 })
  ok(small.truncated === true && /已省略更早 \d+ 字符/.test(small.body), 'a truncated body carries the notice in the text')
  const rep = lib.truncationReport()
  ok(rep.length === 1 && rep[0].dropped > 0, 'the truncation is counted', JSON.stringify(rep))
  const big = await lib.expand(r.id, { capBytes: 100000 })
  ok(big.truncated === false && lib.truncationReport().length === 1, 'an untruncated read adds no count')
}

// ---- 8. status() composes the library's own facts (the gap that let a real bug ship) -----------
{
  const root = await mkdtemp(join(tmpdir(), 'vmu-lib-status-'))
  const lib = m.createLibrary({ root, tracks: ['progress', 'rejected'], headListAt: 7 })
  await lib.append({ kind: 'proposition', statement: 'P', proof: 'pf' }, {})
  await lib.append({ kind: 'method', statement: 'M', proof: 'pf' }, {})
  const st = await lib.status()
  ok(st.root === root && st.records === 2, 'status() reports the root and the record count', JSON.stringify({ root: st.root, records: st.records }))
  ok(st.headListAt === 7 && st.tracks.join(',') === 'progress,rejected', 'status() reports the declared switches')
  ok(Array.isArray(st.truncation) && st.truncation.length === 0, 'status() reports truncation as a list (this line threw a ReferenceError before it was fixed)')
  ok(st.kinds.proposition === 1 && st.kinds.method === 1, 'status() counts records by kind', JSON.stringify(st.kinds))
  await rm(root, { recursive: true, force: true })
}

// ---- 9. self-probe ----------------------------------------------------------------------------
if (SELF_PROBE) {
  const src = await readFile(MODULE, 'utf8')
  const guard = "      if (!rec) {\n        throw refuse('VMU_NO_SUCH_OBJECT', 'no record with id ' + String(id),"
  if (src.indexOf(guard) === -1) {
    ok(false, 'self-probe anchor applies (the dangling-id refusal is present)', 'ANCHOR MISS')
  } else {
    const dir = await mkdtemp(join(tmpdir(), 'vmu-lib-mut-'))
    await mkdir(join(dir, 'kernel'), { recursive: true })
    const mutated = src.replace(guard, "      if (false) {\n        throw refuse('VMU_NO_SUCH_OBJECT', 'no record with id ' + String(id),")
    await writeFile(join(dir, 'kernel', 'library.js'), mutated, 'utf8')
    const mm = await import(pathToFileURL(join(dir, 'kernel', 'library.js')).href + '?probe=1')
    const ml = mm.createLibrary({ root: await mkdtemp(join(tmpdir(), 'vmu-lib-probe-')) })
    let namedRefusal = true
    try { await ml.expand('dangling') } catch (e) { namedRefusal = e && e.code === 'VMU_NO_SUCH_OBJECT' }
    // With the guard removed the failure is a TypeError, not the named refusal: the assertion below MUST fail.
    ok(namedRefusal === true, 'self-probe: guard removed => the dangling-id assertion fails (as required)', 'namedRefusal=' + namedRefusal)
    await rm(dir, { recursive: true, force: true })
  }
  console.log('=== VMU LIBRARY SELF-PROBE: ' + (failed > 0 ? 'guard can fail (as required)' : 'GUARD CANNOT FAIL') + ' ===')
  await rm(root, { recursive: true, force: true })
  process.exit(failed > 0 ? 0 : 1)
}

await rm(root, { recursive: true, force: true })
console.log('=== VMU LIBRARY: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)

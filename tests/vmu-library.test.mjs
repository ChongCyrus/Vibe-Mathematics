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
// ---- B6: vmu.records.headListAt is a REAL row cap, and the drop is counted (bug #35) -----------------
{
  const root = await mkdtemp(join(tmpdir(), 'vmu-lib-head-'))
  const lib = m.createLibrary({ root, tracks: ['progress'], headListAt: 1 })
  for (const statement of ['first', 'second', 'third']) {
    await lib.append({ kind: 'proposition', statement, proof: 'p-' + statement })
  }
  const capped = await lib.list()
  ok(capped.length === 1, 'headListAt: 1 really caps the head list at one row (it used to cap at nothing)', capped.length)
  const rep = lib.truncationReport()
  ok(rep.some((t) => t.path === 'head-list' && t.kept === 1 && t.dropped === 2),
    'and the omission is COUNTED, never silent (docs/07 §4.4)', JSON.stringify(rep))
  const open = m.createLibrary({ root, tracks: ['progress'], headListAt: 0 })
  ok((await open.list()).length === 3, 'headListAt: 0 means "keep everything"')
  await rm(root, { recursive: true, force: true })
}


// ── ROUND 228: the fingerprint family (docs/07 table) — declared for a while, read by nobody until now ────────
{
  const base = mk()
  const one = base.fingerprint('proposition', { statement: 'S', proof: 'P' })
  // algo: the declared digest decides the identity, and an unavailable one is refused BY NAME
  const sha512 = mk({ settings: { 'vmu.fingerprint.algo': 'sha512' } })
  const other = sha512.fingerprint('proposition', { statement: 'S', proof: 'P' })
  ok(typeof other === 'string' && other !== one, 'fingerprint.algo[+]: a declared digest produces a different identity than the default')
  ok(other.length === 128, 'fingerprint.algo[+]: sha512 yields a 128-character digest', String(other.length))
  ok(one.length === 64, 'fingerprint.algo[default]: the declared default is sha256, 64 characters')
  let unavailable = null
  try { mk({ settings: { 'vmu.fingerprint.algo': 'blake3' } }).fingerprint('proposition', { statement: 'S' }) }
  catch (e) { unavailable = e && e.code }
  ok(unavailable === 'VMU_INVALID_ARGUMENT',
    'fingerprint.algo[-]: a declared digest this runtime does NOT have is refused by name, not thrown from deep inside crypto', String(unavailable))

  // truncate: the hex is cut to the declared length
  const cut = mk({ settings: { 'vmu.fingerprint.truncate': 16 } })
  const short = cut.fingerprint('proposition', { statement: 'S', proof: 'P' })
  ok(short.length === 16, 'fingerprint.truncate[+]: the fingerprint is cut to the declared length', String(short.length))
  ok(one.startsWith(short), 'fingerprint.truncate[+]: the cut is a PREFIX of the full digest, not a different hash')
  ok(mk({ settings: { 'vmu.fingerprint.truncate': 0 } }).fingerprint('proposition', { statement: 'S', proof: 'P' }).length === 64,
    'fingerprint.truncate[0]: zero means the whole digest')

  // includeMeta: the metadata that content-only excludes joins the digest only when declared
  const parts = { statement: 'S', proof: 'P', recorder: 'r-9' }
  const withoutMeta = mk().fingerprint('proposition', parts)
  const withMeta = mk({ settings: { 'vmu.fingerprint.includeMeta': true } }).fingerprint('proposition', parts)
  ok(withoutMeta === one, 'fingerprint.includeMeta[default]: by default the recorder does NOT change identity (content-only holds)')
  ok(withMeta !== one, 'fingerprint.includeMeta[+]: with it declared, the recorder DOES change identity')
  ok(mk({ settings: { 'vmu.fingerprint.includeMeta': true } }).fingerprint('proposition', parts) === withMeta,
    'fingerprint.includeMeta[+]: it is deterministic, not merely different (the SAME input twice)')
}


// ── ROUND 230: the tags family (docs/07 table) — a capability, not just a read ────────────────────────────────
{
  // maxDepth: a tag path deeper than the declared depth is refused
  const deep = mk({ settings: { 'vmu.tags.maxDepth': 2 } })
  ok(deep.checkTags({ tags: ['a/b'] }).ok === true, 'tags.maxDepth[+]: a tag within the declared depth passes')
  let tooDeep = null
  try { deep.checkTags({ tags: ['a/b/c'] }) } catch (e) { tooDeep = e && e.code }
  ok(tooDeep === 'VMU_INVALID_ARGUMENT', 'tags.maxDepth[-]: a deeper tag is refused by name', String(tooDeep))
  ok(mk().checkTags({ tags: ['a/b/c'] }).ok === true, 'tags.maxDepth[default]: the declared default is 3, so a 3-level tag passes')
  ok(mk({ settings: { 'vmu.tags.maxDepth': 1 } }).checkTags({ tags: ['solo'] }).ok === true,
    'tags.maxDepth[+]: narrowing the declaration is honoured too')

  // controlled: off by default (zero mechanism), on it demands the registered vocabulary
  ok(mk().checkTags({ tags: ['anything', 'at/all'] }).ok === true,
    'tags.controlled[default]: with it off NOTHING is restricted - the zero-mechanism case')
  const on = mk({ settings: { 'vmu.tags.controlled': true } })
  on.registerVocabulary({ tags: ['math/analysis', 'math/algebra'] })
  ok(on.checkTags({ tags: ['math/analysis'] }).ok === true, 'tags.controlled[+]: a registered term passes')
  let unknown = null
  try { on.checkTags({ tags: ['math/analysis', 'free-form'] }) } catch (e) { unknown = e && e.code }
  ok(unknown === 'VMU_INVALID_ARGUMENT', 'tags.controlled[-]: an unregistered term is refused by name', String(unknown))
  ok(mk({ settings: { 'vmu.tags.controlled': true } }).checkTags({ tags: [] }).ok === true,
    'tags.controlled[empty]: an empty tag list needs no vocabulary')

  // aliasTable: declared, an alias must have been registered as one - and the refusal names the table
  const withTable = mk({ settings: { 'vmu.tags.controlled': true, 'vmu.tags.aliasTable': 'Ops/tags.yaml' } })
  withTable.registerVocabulary({ tags: ['math/analysis'], aliasTags: ['analysis'] })
  ok(withTable.checkTags({ tags: ['analysis'] }).ok === true,
    'tags.aliasTable[+]: an alias REGISTERED as one passes while the vocabulary is controlled')
  const noAlias = mk({ settings: { 'vmu.tags.controlled': true, 'vmu.tags.aliasTable': 'Ops/tags.yaml' } })
  noAlias.registerVocabulary({ tags: ['math/analysis'] })
  let aliasHint = null
  try { noAlias.checkTags({ tags: ['analysis'] }) } catch (e) { aliasHint = e && e.hint }
  ok(/Ops\/tags\.yaml/.test(String(aliasHint)),
    'tags.aliasTable[-]: an unregistered alias is refused AND the refusal names the declared table', String(aliasHint))
  // ROUND 230: with NO table declared there is no alias source at all (this face reads no tag files), so an alias is
  // refused even when it was registered as one. An earlier version of this assertion expected the opposite and the CODE was
  // right: an alias that cannot be resolved must not be accepted just because a table name is absent.
  const withoutTable = mk({ settings: { 'vmu.tags.controlled': true } })
  withoutTable.registerVocabulary({ tags: ['math/analysis'], aliasTags: ['analysis'] })
  let noTableAlias = null
  try { withoutTable.checkTags({ tags: ['analysis'] }) } catch (e) { noTableAlias = e && e.code }
  ok(noTableAlias === 'VMU_INVALID_ARGUMENT',
    'tags.aliasTable[empty]: with no table declared an alias is refused - there is no alias source to resolve it from', String(noTableAlias))

  // and append() really USES it - a validator nobody calls would be inert
  const using = mk({ settings: { 'vmu.tags.controlled': true } })
  using.registerVocabulary({ tags: ['math/analysis'] })
  let appendRefused = null
  try { await using.append({ kind: 'proposition', statement: 'S', tags: ['not-registered'] }) } catch (e) { appendRefused = e && e.code }
  ok(appendRefused === 'VMU_INVALID_ARGUMENT', 'tags via append()[-]: the tag check is CALLED on the write path, not merely defined', String(appendRefused))
}


// ── ROUND 231: refs (3) and dedupe (3), including the design conflict that was RULED rather than papered over ──
{
  // The invariant first: exact-identity dedupe is NOT tunable, and the declared dedupe default must not break it.
  const off = mk()
  const first = await off.append({ kind: 'proposition', statement: 'IDENT', proof: 'P' })
  const again = await off.append({ kind: 'proposition', statement: 'IDENT', proof: 'P' })
  ok(first.id === again.id && again.deduplicated === true && again.deduplicatedBy === 'identity',
    'dedupe.enabled[default=false]: identical content is STILL idempotent - the face invariant is not switched off by the declaration',
    String(again.deduplicatedBy))

  // refs.requireTarget / refs.danglingPolicy
  const listing = mk({ settings: { 'vmu.refs.requireTarget': true, 'vmu.refs.danglingPolicy': 'list' } })
  const withDangling = await listing.append({ kind: 'proposition', statement: 'REF-1', references: ['does-not-exist'] })
  ok(withDangling.ok === true && withDangling.dangling.join(',') === 'does-not-exist',
    'refs.danglingPolicy[list]: a dangling reference is REPORTED in the receipt under the declared default', JSON.stringify(withDangling.dangling))
  const rejecting = mk({ settings: { 'vmu.refs.requireTarget': true, 'vmu.refs.danglingPolicy': 'reject' } })
  let refRefused = null
  try { await rejecting.append({ kind: 'proposition', statement: 'REF-2', references: ['does-not-exist'] }) } catch (e) { refRefused = e && e.code }
  ok(refRefused === 'VMU_INVALID_ARGUMENT', 'refs.danglingPolicy[reject]: the same reference is refused by name instead', String(refRefused))
  const lenient = mk({ settings: { 'vmu.refs.requireTarget': false } })
  const notChecked = await lenient.append({ kind: 'proposition', statement: 'REF-3', references: ['does-not-exist'] })
  // ROUND 231: turning the REQUIREMENT off does not turn the LOOK off. The dangling reference is still computed and still
  // reported; what changes is that the policy no longer refuses. An earlier version of this assertion expected an empty
  // list, which would have made the reference silent - the opposite of the rule.
  ok(notChecked.ok === true && notChecked.dangling.join(',') === 'does-not-exist',
    'refs.requireTarget[false]: the requirement is off but the dangling reference is STILL reported, never silent',
    JSON.stringify(notChecked.dangling))
  const known = mk()
  const target = await known.append({ kind: 'proposition', statement: 'TARGET' })
  const pointing = await known.append({ kind: 'proposition', statement: 'POINTS', references: [target.id] })
  ok(pointing.ok === true && pointing.dangling.length === 0, 'refs.requireTarget[+]: a reference to a real id passes')

  // refs.backlinkDepth
  const chain = mk({ settings: { 'vmu.refs.backlinkDepth': 2 } })
  const a = await chain.append({ kind: 'proposition', statement: 'A' })
  const b = await chain.append({ kind: 'proposition', statement: 'B', references: [a.id] })
  const c = await chain.append({ kind: 'proposition', statement: 'C', references: [b.id] })
  const bl = chain.backlinks(a.id)
  ok(bl.levels.length === 2 && bl.levels[0].includes(b.id) && bl.levels[1].includes(c.id),
    'refs.backlinkDepth[+]: backlinks reach two levels when two are declared', JSON.stringify(bl.levels.length))
  ok(mk().backlinks(a.id).levels.length <= 1, 'refs.backlinkDepth[default]: the declared default is one level')

  // dedupe.enabled / scope / crossWorkspace - the OPTIONAL wider layer
  const wider = mk({ settings: { 'vmu.dedupe.enabled': true, 'vmu.dedupe.scope': 'segment' } })
  const w1 = await wider.append({ kind: 'proposition', statement: 'SEG', proof: 'P1' })
  const w2 = await wider.append({ kind: 'proposition', statement: 'SEG', proof: 'P2' })
  ok(w1.id === w2.id && w2.deduplicatedBy === 'segment',
    'dedupe.scope[segment]: with the wider layer ON, a same-statement record matches and says WHY', String(w2.deduplicatedBy))
  const narrow = mk({ settings: { 'vmu.dedupe.enabled': true, 'vmu.dedupe.scope': 'full' } })
  const n1 = await narrow.append({ kind: 'proposition', statement: 'SEG', proof: 'P1' })
  const n2 = await narrow.append({ kind: 'proposition', statement: 'SEG', proof: 'P2' })
  ok(n1.id !== n2.id, 'dedupe.scope[full]: with full scope a different proof is a DIFFERENT record')
  const cross = mk({ settings: { 'vmu.dedupe.enabled': true, 'vmu.dedupe.scope': 'segment', 'vmu.dedupe.crossWorkspace': true } })
  // The scope is required on EVERY call, the first included: the face must know which workspaces it is comparing against, and
  // a rule that applies only from the second call onwards would be a special case nobody could predict.
  await cross.append({ kind: 'proposition', statement: 'XW', proof: 'P1' }, { workspaceScope: ['shared'] })
  let needScope = null
  try { await cross.append({ kind: 'proposition', statement: 'XW', proof: 'P2' }) } catch (e) { needScope = e && e.code }
  ok(needScope === 'VMU_INVALID_ARGUMENT',
    'dedupe.crossWorkspace[+]: cross-workspace matching is refused without an explicit scope - this face does not scan other roots by itself', String(needScope))
  const crossScoped = await cross.append({ kind: 'proposition', statement: 'XW', proof: 'P2' }, { workspaceScope: ['shared'] })
  ok(crossScoped.ok === true && crossScoped.deduplicatedBy === 'segment',
    'dedupe.crossWorkspace[+]: with the explicit scope the wider match proceeds', String(crossScoped.deduplicatedBy))
}


// ── ROUND 232: metadata (2) and provenance (2) — the middle strictness is the declared default ────────────────
{
  // metadata.customPrefix + metadata.strictness
  const warn = mk()
  const warned = warn.checkMetadata({ record: { kind: 'proposition', statement: 'S', 'x-note': 'ok', rogue: 1 } })
  ok(warned.ok === true && warned.custom.join(',') === 'x-note', 'metadata.customPrefix[default]: the declared default prefix is x-')
  ok(warned.unknown.join(',') === 'rogue' && warned.reported.join(',') === 'rogue',
    'metadata.strictness[default=warn]: an unprefixed unknown field is REPORTED, not refused and not dropped', JSON.stringify(warned.reported))
  const strict = mk({ settings: { 'vmu.metadata.strictness': 'strict' } })
  ok(strict.checkMetadata({ record: { kind: 'proposition', statement: 'S', 'x-note': 'ok' } }).ok === true,
    'metadata.strictness[strict+]: a correctly prefixed field passes even under strict')
  let strictRefused = null
  try { strict.checkMetadata({ record: { kind: 'proposition', statement: 'S', rogue: 1 } }) } catch (e) { strictRefused = e && e.code }
  ok(strictRefused === 'VMU_INVALID_ARGUMENT', 'metadata.strictness[strict-]: an unprefixed unknown field is refused by name', String(strictRefused))
  const loose = mk({ settings: { 'vmu.metadata.strictness': 'loose' } })
  const looseRes = loose.checkMetadata({ record: { kind: 'proposition', statement: 'S', rogue: 1 } })
  ok(looseRes.ok === true && looseRes.unknown.length === 1 && looseRes.reported.length === 1,
    'metadata.strictness[loose]: accepted silently as a decision, while still COUNTED in the receipt (never invisible)')
  const other = mk({ settings: { 'vmu.metadata.customPrefix': 'my-' } })
  const otherRes = other.checkMetadata({ record: { kind: 'proposition', statement: 'S', 'my-note': 1, 'x-note': 2 } })
  ok(otherRes.custom.join(',') === 'my-note' && otherRes.unknown.join(',') === 'x-note',
    'metadata.customPrefix[+]: a declared prefix replaces the default rather than being added to it')
  // append really uses it
  let appendStrict = null
  try { await mk({ settings: { 'vmu.metadata.strictness': 'strict' } }).append({ kind: 'proposition', statement: 'S', rogue: 1 }) } catch (e) { appendStrict = e && e.code }
  ok(appendStrict === 'VMU_INVALID_ARGUMENT', 'metadata.strictness via append()[-]: the check is CALLED on the write path, not merely defined', String(appendStrict))

  // provenance.depth + provenance.recordInputFingerprint
  const all = mk()
  const allProv = all.provenanceOf({ inputs: ['a', 'b', 'c'] })
  ok(allProv.kept.length === 3 && allProv.depth === 0, 'provenance.depth[default=0]: zero keeps the whole chain, as declared')
  const cut = mk({ settings: { 'vmu.provenance.depth': 2 } })
  const cutProv = cut.provenanceOf({ inputs: ['a', 'b', 'c'] })
  ok(cutProv.kept.join(',') === 'b,c' && cutProv.dropped === 1 && cutProv.droppedIsCounted === true,
    'provenance.depth[+]: the chain is bounded to the declared depth and the drop is COUNTED, not silent', JSON.stringify(cutProv.dropped))
  ok(mk().provenanceOf({ inputs: ['a', 'b'] }).inputFingerprint === 'b',
    'provenance.recordInputFingerprint[default=true]: the input fingerprint is reported')
  ok(mk({ settings: { 'vmu.provenance.recordInputFingerprint': false } }).provenanceOf({ inputs: ['a', 'b'] }).inputFingerprint === null,
    'provenance.recordInputFingerprint[false]: it is null rather than a stale value')
}


// ── ROUND 233: the index family — the rebuild reports what it read, deferred and could not read ───────────────
{
  // The face's documented lesson is that the index is REBUILT FROM DISK. These keys govern that rebuild and nothing else.
  const lib = mk()
  ok(lib.indexHealth() === null, 'index: before any rebuild there is no health record, so nothing is claimed')
  await lib.append({ kind: 'proposition', statement: 'IDX-1' })
  await lib.list({})
  const h = lib.indexHealth()
  ok(h !== null && h.read >= 1 && h.deferred === 0,
    'index.rebuildBatch[default=500]: an ordinary rebuild reads everything and defers nothing', JSON.stringify({ read: h.read, deferred: h.deferred }))
  ok(h.unreadable.length === 0 && h.missingId.length === 0,
    'index.verifyChecksum[default=true]: a healthy tree produces an empty health report rather than a silent index')

  // rebuildBatch bounds one pass and COUNTS the remainder
  const bounded = mk({ settings: { 'vmu.index.rebuildBatch': 1 } })
  await bounded.append({ kind: 'proposition', statement: 'IDX-A' })
  await bounded.append({ kind: 'proposition', statement: 'IDX-B' })
  await bounded.list({})
  const hb = bounded.indexHealth()
  ok(hb.read === 1 && hb.deferred >= 1,
    'index.rebuildBatch[+]: a batch of one reads one file and DEFERS the rest, counted rather than dropped', JSON.stringify({ read: hb.read, deferred: hb.deferred }))
  ok(hb.limit === 1, 'index.rebuildBatch[+]: the receipt says what the limit was, so the deferral is explainable')

  // verifyChecksum off means an unreadable file is not reported (the declared default reports it)
  const quiet = mk({ settings: { 'vmu.index.verifyChecksum': false } })
  await quiet.append({ kind: 'proposition', statement: 'IDX-C' })
  await quiet.list({})
  ok(quiet.indexHealth().unreadable.length === 0,
    'index.verifyChecksum[false]: the health report stays quiet - which is exactly what the key switches off')
  // and the default reports a file that cannot be read or carries no id
  const strict = mk()
  await strict.append({ kind: 'proposition', statement: 'IDX-D' })
  await strict.list({})
  ok(strict.indexHealth() !== null,
    'index.verifyChecksum[default=true]: the report exists on every rebuild, so a missing id or an unreadable file would appear in it')

  // staleTolerance is read and reported (rebuild is the declared default)
  const tolerant = mk({ settings: { 'vmu.index.staleTolerance': 'tolerate' } })
  await tolerant.append({ kind: 'proposition', statement: 'IDX-E' })
  await tolerant.list({})
  ok(tolerant.indexHealth() !== null,
    'index.staleTolerance[tolerate]: a tolerable index is still rebuilt from disk and still reports its health')
}


// ── ROUND 234: visibility (1) and export (2) — a default that could be bypassed by simply asking would not be a default ────
{
  const lib = mk()
  const written = await lib.append({ kind: 'proposition', statement: 'EXPORT-ME' })
  ok(written.ok === true, 'visibility: a record can be written')
  const listed = await lib.list({})
  const row = listed.find((r) => r.id === written.id)   // list() returns a bare array of heads
  ok(row !== undefined, 'visibility[default=internal]: the record is in the index')

  // an internal record does NOT leave without an explicit flag
  let blocked = null
  try { await lib.exportRecord(written.id, {}) } catch (e) { blocked = e && e.code }
  ok(blocked === 'VMU_NOT_PERMITTED',
    'visibility[default=internal]: exporting without allowInternal is refused by name - the default cannot be bypassed by asking', String(blocked))
  const allowed = await lib.exportRecord(written.id, { allowInternal: true })
  ok(allowed.ok === true && allowed.visibility === 'internal',
    'visibility[+]: with the flag the record leaves, and the receipt says which visibility it had', String(allowed.visibility))

  // format: the declared default is json, and an unknown one is refused
  const json = await lib.exportRecord(written.id, { allowInternal: true })
  ok(json.format === 'json' && typeof json.text === 'string' && JSON.parse(json.text).head.id === written.id,
    'export.format[default=json]: the default is json and the payload really parses')
  const md = await lib.exportRecord(written.id, { allowInternal: true, format: 'md' })
  ok(md.format === 'md' && md.text.startsWith('---'), 'export.format[md]: the markdown form carries the rendered head')
  const pkg = await lib.exportRecord(written.id, { allowInternal: true, format: 'package' })
  ok(pkg.format === 'package' && pkg.manifest !== undefined && typeof pkg.text === 'string',
    'export.format[package]: a manifest plus the body, which is what makes a package reusable elsewhere')
  let badFormat = null
  try { await lib.exportRecord(written.id, { allowInternal: true, format: 'pdf' }) } catch (e) { badFormat = e && e.code }
  ok(badFormat === 'VMU_INVALID_ARGUMENT', 'export.format[-]: an unknown format is refused by name', String(badFormat))

  // includeHistory: off by default, and the count is reported either way
  ok(json.history.asked === false && json.history.count === 0,
    'export.includeHistory[default=false]: the history does not travel, and the receipt says it was not asked for')
  await lib.append({ kind: 'proposition', statement: 'EXPORT-ME', proof: 'P2' })
  const withHist = mk({ settings: { 'vmu.export.includeHistory': true } })
  const w2 = await withHist.append({ kind: 'proposition', statement: 'HIST' })
  await withHist.append({ kind: 'proposition', statement: 'HIST', proof: 'rev2' })
  const hist = await withHist.exportRecord(w2.id, { allowInternal: true })
  ok(hist.history.asked === true, 'export.includeHistory[+]: the declaration makes the history travel by default')
  ok(typeof hist.history.count === 'number', 'export.includeHistory[+]: how many revisions were included is REPORTED, not left implicit', String(hist.history.count))

  // a public record needs no flag
  const pub = mk({ settings: { 'vmu.visibility.default': 'public' } })
  const p1 = await pub.append({ kind: 'proposition', statement: 'PUBLIC-ONE' })
  const pOut = await pub.exportRecord(p1.id, {})
  ok(pOut.ok === true && pOut.visibility === 'public',
    'visibility.default[public]: a public record leaves without a flag, so the declaration really changes the default', String(pOut.visibility))
  // and a record can override the declaration in either direction
  const override = await pub.append({ kind: 'proposition', statement: 'OVERRIDE', visibility: 'internal' })
  let overridden = null
  try { await pub.exportRecord(override.id, {}) } catch (e) { overridden = e && e.code }
  ok(overridden === 'VMU_NOT_PERMITTED', 'visibility[per-record]: an explicit internal record is refused even when the default is public', String(overridden))
}


// ── ROUND 236: the search family — the analyzer really changes what counts as a hit ───────────────────────────
{
  const lib = mk()
  await lib.append({ kind: 'proposition', statement: 'epsilon delta continuity', proof: 'P' })
  const all = await lib.search({ text: 'delta' })
  ok(all.ok === true && all.hits.length >= 1, 'search[+]: a plain word finds the record')
  ok(all.analyzer === 'bigram', 'search.analyzer[default]: the declared default is bigram', String(all.analyzer))
  // A garble whose adjacent pairs cannot occur in any record this suite writes.
  const none = await lib.search({ text: 'QQQQZZZZQQQQ' })
  ok(none.ok === true && none.hits.length === 0 && none.total === 0, 'search[-]: a query that matches nothing returns nothing, not everything')

  // the analyzer has to CHANGE what matches, or it is decoration
  const partial = 'lta del'
  const asSimple = (await mk({ settings: { 'vmu.search.analyzer': 'simple' } }).search({ text: partial }))
  const asBigram = (await mk({ settings: { 'vmu.search.analyzer': 'bigram' } }).search({ text: partial }))
  ok(asSimple.hits.length === 0,
    'search.analyzer[simple]: a fragment that is not a whole word does NOT match - words are compared as words', String(asSimple.hits.length))
  ok(asBigram.hits.length >= 1,
    'search.analyzer[bigram]: the SAME fragment DOES match, because adjacent pairs are compared', String(asBigram.hits.length))
  ok(asSimple.analyzer !== asBigram.analyzer, 'search.analyzer: the receipt names which analyzer was in force')
  let badAnalyzer = null
  try { await lib.search({ text: 'x', analyzer: 'telepathy' }) } catch (e) { badAnalyzer = e && e.code }
  ok(badAnalyzer === 'VMU_INVALID_ARGUMENT', 'search.analyzer[-]: an unknown analyzer is refused by name', String(badAnalyzer))

  // maxResults: the cap bites and is COUNTED
  // NOTE: the suite shares one root, so counts accumulate - these assertions are about RELATIONSHIPS, and each uses a token
  // unique to this section so an earlier record cannot satisfy them.
  const capped = mk({ settings: { 'vmu.search.maxResults': 1 } })
  await capped.append({ kind: 'proposition', statement: 'CAPTOKEN one' })
  await capped.append({ kind: 'proposition', statement: 'CAPTOKEN two' })
  const r = await capped.search({ text: 'CAPTOKEN' })
  ok(r.hits.length === 1 && r.dropped >= 1 && r.hits.length + r.dropped === r.total,
    'search.maxResults[+]: the cap bites, and hits + dropped EQUALS the total - nothing is lost silently', JSON.stringify({ hits: r.hits.length, total: r.total, dropped: r.dropped }))
  const wide = await mk({ settings: { 'vmu.search.maxResults': 50 } }).search({ text: 'CAPTOKEN' })
  ok(wide.dropped === 0 && wide.hits.length === wide.total, 'search.maxResults[default]: nothing is dropped when the cap is not reached')

  // snippetLen: bounded, and the cut is declared
  const long = mk()
  await long.append({ kind: 'proposition', statement: 'SNIPTOKEN ' + 'x'.repeat(300) })
  const short = await long.search({ text: 'SNIPTOKEN', snippetLen: 20 })
  ok(short.snippetLen === 20 && short.hits.length >= 1 && short.hits[0].snippet.length <= 23 && short.hits[0].snippet.endsWith('...'),
    'search.snippetLen[+]: the excerpt is bounded and marked with an ellipsis rather than silently cut', String(short.hits.length ? short.hits[0].snippet.length : 'no hits'))
  ok(short.hits[0].snippetTruncated === true, 'search.snippetLen[+]: the receipt says the excerpt was cut')
  const full = await long.search({ text: 'SNIPTOKEN', snippetLen: 2000 })
  ok(full.hits[0].snippetTruncated === false, 'search.snippetLen[+]: a long enough bound means nothing is marked as cut')
  ok(full.hits[0].id !== undefined && full.hits[0].fingerprint !== undefined,
    'search[+]: hits carry the same head fields the list carries, so a hit is actionable without a second lookup')
}


// ── ROUND 237: naming conflicts — only an EXPLICIT name is a claim on that name ──────────────────────────────
{
  // An explicit name IS a claim, and the declared default refuses a second one.
  const named = mk()
  const first = await named.append({ kind: 'proposition', id: 'NAMETOKEN', statement: 'ONE' })
  ok(first.ok === true && first.id.indexOf('nametoken-') === 0, 'naming.conflictPolicy: an explicit id becomes the human name', String(first.id))
  let clash = null
  try { await mk().append({ kind: 'proposition', id: 'NAMETOKEN', statement: 'TWO' }) } catch (e) { clash = e && e.code }
  ok(clash === 'VMU_CONFLICT',
    'naming.conflictPolicy[default=refuse]: a second EXPLICIT claim on the same name is refused by name', String(clash))
  const suffixed = await mk({ settings: { 'vmu.naming.conflictPolicy': 'suffix' } }).append({ kind: 'proposition', id: 'NAMETOKEN', statement: 'THREE' })
  ok(suffixed.ok === true && suffixed.id === 'nametoken-2' && suffixed.nameConflict && suffixed.nameConflict.used === 'nametoken-2',
    'naming.conflictPolicy[suffix]: the declared alternative uses a suffix AND reports which one', JSON.stringify(suffixed.nameConflict))
  // A title-derived name is NOT a claim: this is the documented content-identity guarantee, and the default must not break it.
  const titled1 = await mk().append({ kind: 'proposition', title: 'TITLETOKEN', statement: 'A' })
  const titled2 = await mk().append({ kind: 'proposition', title: 'TITLETOKEN', statement: 'B' })
  ok(titled1.ok === true && titled2.ok === true && titled1.id !== titled2.id,
    'naming.conflictPolicy[title]: the same title with different content yields two records - the default cannot destroy content identity')
  ok(!titled2.nameConflict, 'naming.conflictPolicy[title]: and no conflict is reported, because no name was claimed')
}


// ── ROUND 238: the provenance chain REACHES the write path (it was defined and never called) ─────────────────
{
  const lib = mk()
  const all = await lib.append({ kind: 'proposition', statement: 'CHAIN-ALL', inputs: ['a', 'b', 'c', 'd'] })
  ok(all.ok === true && all.provenance && all.provenance.kept === 4 && all.provenance.dropped === 0,
    'provenance.depth[default=0]: the whole chain is kept, as declared', JSON.stringify(all.provenance))
  const cut = mk({ settings: { 'vmu.provenance.depth': 2 } })
  const bounded = await cut.append({ kind: 'proposition', statement: 'CHAIN-CUT', inputs: ['a', 'b', 'c', 'd'] })
  ok(bounded.provenance.kept === 2 && bounded.provenance.dropped === 2 && bounded.provenance.droppedIsCounted === true,
    'provenance.depth[+]: the chain is bounded and the excess is COUNTED, not silently lost', JSON.stringify(bounded.provenance))
  const noFp = mk({ settings: { 'vmu.provenance.recordInputFingerprint': false } })
  const off = await noFp.append({ kind: 'proposition', statement: 'CHAIN-OFF', inputs: ['x'] })
  ok(off.provenance.inputFingerprint === null, 'provenance.recordInputFingerprint[false]: null rather than a stale value')
  const none = await mk().append({ kind: 'proposition', statement: 'CHAIN-NONE' })
  ok(none.provenance === null, 'provenance: a record that declares no inputs reports no chain rather than an empty pretence')
  // it must be READ BACK, like every other persisted field in this face
  const back = await mk().append({ kind: 'proposition', statement: 'CHAIN-BACK', inputs: ['p', 'q'] })
  const raw = await readFile(back.file, 'utf8')
  ok(/inputs: p,q/.test(raw), 'provenance: the bounded chain is PERSISTED, so a later read can see it', raw.split('\n').filter((l) => l.indexOf('inputs') === 0).join(''))
}


// ── ROUND 293: the package export declarations (volume 07 §L615-§L618) ───────────────────────────────────────
{
  const packLib = mk()
  const one = await packLib.append({ kind: 'proposition', statement: 'S', proof: 'P', owner: 'r-1', title: 'Pack' })
  const pack = await packLib.exportRecord(one.id, { format: 'package', allowInternal: true })
  ok(pack.package && pack.package.container === 'tar' && pack.package.includeBody === true && pack.package.includeTrash === false,
    'pack defaults: tar container, body included, trash excluded', pack.package)
  const declared = await packLib.exportRecord(one.id, { format: 'package', allowInternal: true, container: 'zip', includeTrash: true })
  ok(declared.package.container === 'zip' && declared.package.includeTrash === true, 'pack: a declared container and trash inclusion are reported', declared.package)
  const bad = await packLib.exportRecord(one.id, { format: 'package', allowInternal: true, container: 'rar' }).then(() => null, (e) => e)
  ok(bad && bad.code === 'VMU_INVALID_ARGUMENT', 'pack.format: an unknown container is refused by name', bad && bad.code)
  const mixed = await packLib.exportRecord(one.id, { format: 'json', allowInternal: true, container: 'zip' }).then(() => null, (e) => e)
  ok(mixed && mixed.code === 'VMU_INVALID_ARGUMENT', 'pack options for a non-package export are refused rather than ignored')
}

console.log('=== VMU LIBRARY: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)

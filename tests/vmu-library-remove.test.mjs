// tests/vmu-library-remove.test.mjs — the deletion contract added to createLibrary (task-81).
// Scenarios: hard remove / soft moveToTrash / restore (version + fingerprint) / removeRevision,
// permanent-marker protection, missing object refused by name, trace fields, existing behaviour intact.
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLibrary } from '../vibe-math-vmu/kernel/library.js'

let pass = 0, fail = 0
const ok = (cond, label) => { if (cond) { pass++ } else { fail++; console.log('FAIL ' + label) } }
const rejects = async (fn) => { try { await fn(); return { threw: false } } catch (e) { return { threw: true, code: e && e.code, msg: String(e && e.message), hint: e && e.hint } } }

const root = await mkdtemp(join(tmpdir(), 'vmu-lib-remove-'))
const fixed = '2026-10-10T00:00:00.000Z'
const lib = createLibrary({ root, settings: {}, clock: () => fixed })

// 0) existing behaviour intact: append + list + expand still work
{
  const a = await lib.append({ kind: 'proposition', statement: 'n^2+n is even', title: 'even', owner: 'acad' })
  ok(a.ok === true && typeof a.fingerprint === 'string' && a.deduplicated === false, 'append works (existing behaviour)')
  const again = await lib.append({ kind: 'proposition', statement: 'n^2+n is even', title: 'even', owner: 'acad' })
  ok(again.deduplicated === true, 'append still deduplicates by content identity')
  const heads = await lib.list()
  ok(Array.isArray(heads) && heads.length === 1 && heads[0].id === a.id, 'list() unchanged (trash invisible by default)')
  const ex = await lib.expand(a.id)
  ok(ex.ok === true && ex.body.includes('n^2+n'), 'expand() unchanged')
}

// 1) moveToTrash: named trace, at from the injected clock, invisible in list(), visible in listTrash()
let trashedId = null
{
  const a = await lib.append({ kind: 'method', statement: 'descent by parity', title: 'parity', owner: 'acad' })
  trashedId = a.id
  const t = await lib.moveToTrash({ id: a.id, reason: 'superseded' })
  ok(t.ok === true && t.step === 'done' && t.at === fixed && t.reason === 'superseded', 'trash trace has id/reason/at(clock)/step')
  ok(typeof t.fingerprint === 'string' && t.fingerprint.length > 0, 'trash trace keeps the fingerprint')
  const heads = await lib.list()
  ok(!heads.some((h) => h.id === a.id), 'trashed record is gone from list()')
  const withTrash = await lib.list({ includeTrash: true })
  ok(withTrash.some((h) => h.id === a.id), 'list({includeTrash:true}) shows it')
  const trash = await lib.listTrash()
  ok(trash.some((r) => r.id === a.id && r.reason === 'superseded' && r.trashedAt === fixed), 'listTrash() shows why and when')
}

// 2) restore: same id, same stored fingerprint, back in the head list
{
  const heads0 = await lib.list()
  const before = heads0.find((h) => h.id === trashedId)
  ok(before === undefined, 'precondition: not present')
  const r = await lib.restore({ id: trashedId })
  ok(r.ok === true && r.step === 'done' && typeof r.fingerprint === 'string', 'restore returns fingerprint + step')
  const heads = await lib.list()
  const after = heads.find((h) => h.id === trashedId)
  ok(!!after && after.fingerprint === r.fingerprint, 'restored record keeps the stored fingerprint')
  const stored = await lib.storedFingerprint(trashedId)
  ok(stored.fingerprint === r.fingerprint, 'fingerprint is the persisted one (never recomputed)')
  const ex = await lib.expand(trashedId)
  ok(ex.body.includes('parity'), 'body restored intact')
}

// 3) hard remove: trace + gone from disk
{
  const a = await lib.append({ kind: 'subproblem', statement: 'show the bound is tight', title: 'tight', owner: 'r-2' })
  const rm1 = await lib.remove({ id: a.id, reason: 'void' })
  ok(rm1.ok === true && rm1.at === fixed && rm1.reason === 'void' && rm1.step === 'done', 'remove trace complete')
  const gone = await rejects(() => lib.expand(a.id))
  ok(gone.threw && gone.code === 'VMU_NO_SUCH_OBJECT', 'removed record is refused by name on expand')
}

// 4) permanent marker: cannot be removed or trashed (VMU_RETENTION_CONFLICT)
{
  const a = await lib.append({ kind: 'proposition', statement: 'permanent claim', title: 'perm', owner: 'acad' })
  const rec = await lib.list()
  const head = rec.find((h) => h.id === a.id)
  ok(!!head, 'permanent candidate exists')
  // mark it permanent on disk (the kernel reads the stored marker)
  const raw = await readFile(join(root, 'Members', 'acad', 'Propos', a.id + '.md'), 'utf8')
  await writeFile(join(root, 'Members', 'acad', 'Propos', a.id + '.md'), raw.replace('status: open', 'status: permanent'), 'utf8')
  const r1 = await rejects(() => lib.remove({ id: a.id }))
  ok(r1.threw && r1.code === 'VMU_RETENTION_CONFLICT' && !!r1.hint, 'permanent remove refused by name + hint')
  const r2 = await rejects(() => lib.moveToTrash({ id: a.id }))
  ok(r2.threw && r2.code === 'VMU_RETENTION_CONFLICT', 'permanent trash refused by name')
  const still = await lib.expand(a.id)
  ok(still.ok === true, 'permanent record untouched after refusals')
}

// 5) missing object: remove / moveToTrash / restore / removeRevision all refuse by name (never silent)
{
  ok((await rejects(() => lib.remove({ id: 'ghost' }))).code === 'VMU_NO_SUCH_OBJECT', 'remove ghost refused')
  ok((await rejects(() => lib.moveToTrash({ id: 'ghost' }))).code === 'VMU_NO_SUCH_OBJECT', 'trash ghost refused')
  ok((await rejects(() => lib.restore({ id: 'ghost' }))).code === 'VMU_NO_SUCH_OBJECT', 'restore ghost refused')
  const a = await lib.append({ kind: 'proposition', statement: 'revision host', title: 'rev', owner: 'acad' })
  ok((await rejects(() => lib.removeRevision({ id: a.id, rev: 9 }))).code === 'VMU_NO_SUCH_OBJECT', 'missing revision refused')
  ok((await rejects(() => lib.removeRevision({ id: a.id }))).code === 'VMU_INVALID_ARGUMENT', 'missing rev argument refused')
}

// 6) removeRevision: deletes exactly one revision file, leaves the record
{
  const a = await lib.append({ kind: 'method', statement: 'revisioned method', title: 'rv', owner: 'acad' })
  const dir = join(root, 'Members', 'acad', 'Methods')
  await writeFile(join(dir, a.id + '@2.md'), '---\nid: ' + a.id + '\nkind: method\n---\n\nold revision\n', 'utf8')
  const r = await lib.removeRevision({ id: a.id, rev: 2, reason: 'stale' })
  ok(r.ok === true && r.rev === '2' && r.at === fixed, 'removeRevision trace complete')
  const gone = await rejects(() => lib.removeRevision({ id: a.id, rev: 2 }))
  ok(gone.threw && gone.code === 'VMU_NO_SUCH_OBJECT', 'revision really removed')
  ok((await lib.expand(a.id)).ok === true, 'record itself still there')
}

// 7) zero-config: empty library refuses by name and never crashes
{
  const empty = createLibrary({ root: join(root, 'empty-root'), settings: {}, clock: () => fixed })
  const r = await rejects(() => empty.remove({ id: 'nope' }))
  ok(r.threw && r.code === 'VMU_NO_SUCH_OBJECT', 'empty library refuses by name')
  ok(JSON.stringify(await empty.listTrash()) === '[]', 'empty trash is an empty list')
  ok((await empty.list()).length === 0, 'empty head list')
}

await rm(root, { recursive: true, force: true })
console.log('=== VMU LIBRARY REMOVE: ' + pass + ' passed, ' + fail + ' failed ===')
process.exit(fail ? 1 : 0)

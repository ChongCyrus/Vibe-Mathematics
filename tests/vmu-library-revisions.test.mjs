// tests/vmu-library-revisions.test.mjs — the revision write path added to createLibrary (task-87).
// Scenarios: commit → list → read back → prune one → commit again; rev monotonic and never reused;
// trace completeness (who/when/why, `at` from the injected clock); diff mode protects the baseline;
// missing object refused by name; read-only surfaces; existing behaviour unchanged.
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLibrary } from '../vibe-math-vmu/kernel/library.js'

let pass = 0, fail = 0
const ok = (cond, label) => { if (cond) { pass++ } else { fail++; console.log('FAIL ' + label) } }
const rejects = async (fn) => { try { await fn(); return { threw: false } } catch (e) { return { threw: true, code: e && e.code, msg: String(e && e.message), hint: e && e.hint } } }

const root = await mkdtemp(join(tmpdir(), 'vmu-lib-rev-'))
const fixed = '2026-10-10T00:00:00.000Z'
const lib = createLibrary({ root, settings: {}, clock: () => fixed })

// 0) existing behaviour unchanged (append / list / expand)
let id = null
{
  const a = await lib.append({ kind: 'proposition', statement: 'n^2+n is even', title: 'even', owner: 'acad' })
  id = a.id
  ok(a.ok === true && typeof a.fingerprint === 'string', 'append works (existing behaviour)')
  ok((await lib.list()).length === 1, 'list() unchanged')
  ok((await lib.expand(id)).ok === true, 'expand() unchanged')
}

// 1) commit → list → read back
{
  const c1 = await lib.commitRevision({ id, by: 'acad', reason: 'first freeze' })
  ok(c1.ok === true && c1.rev === 1 && c1.at === fixed && c1.step === 'done', 'commit trace has rev/at(clock)/step')
  ok(c1.by === 'acad' && c1.reason === 'first freeze' && typeof c1.fingerprint === 'string', 'commit records who/why and the fingerprint')
  const list = await lib.revisions({ id })
  ok(list.total === 1 && list.dropped === 0 && list.storeMode === 'full', 'revisions() lists with total/dropped/storeMode')
  const r1 = await lib.revision({ id, rev: 1 })
  ok(r1.ok === true && r1.by === 'acad' && r1.reason === 'first freeze' && r1.at === fixed, 'revision() reads back the trace')
  ok(r1.body.includes('n^2+n'), 'revision() returns the frozen body')
  ok(r1.baseline === true, 'rev 1 is flagged baseline')
}

// 2) rev monotonic and never reused
{
  const c2 = await lib.commitRevision({ id, by: 'r-2', reason: 'second freeze' })
  ok(c2.rev === 2, 'rev increments monotonically')
  const list = await lib.revisions({ id })
  ok(list.total === 2 && list.items.map((i) => i.rev).join(',') === '1,2', 'revisions() sorted ascending')
  // read-only: calling them again changes nothing
  const before = JSON.stringify(await lib.revisions({ id }))
  await lib.revision({ id, rev: 2 }); await lib.revisions({ id })
  ok(JSON.stringify(await lib.revisions({ id })) === before, 'revision/revisions are read-only')
}

// 3) prune one revision, then commit again: the freed number must NOT be reused
{
  const rm1 = await lib.removeRevision({ id, rev: 2, reason: 'stale' })
  ok(rm1.ok === true && rm1.rev === '2', 'removeRevision prunes rev 2 (from task-81)')
  const c3 = await lib.commitRevision({ id, by: 'acad', reason: 'third freeze' })
  ok(c3.rev === 3, 'rev 3 (never reuses the freed 2)')
  const missing = await rejects(() => lib.revision({ id, rev: 2 }))
  ok(missing.threw && missing.code === 'VMU_NO_SUCH_OBJECT', 'pruned rev is refused by name')
}

// 4) diff store mode protects the baseline revision
{
  const diffRoot = join(root, 'diff-root')
  const dl = createLibrary({ root: diffRoot, settings: { 'vmu.records.history.storeMode': 'diff' }, clock: () => fixed })
  const a = await dl.append({ kind: 'method', statement: 'parity descent', title: 'parity', owner: 'acad' })
  const c1 = await dl.commitRevision({ id: a.id, by: 'acad', reason: 'baseline' })
  const c2 = await dl.commitRevision({ id: a.id, by: 'acad', reason: 'delta' })
  ok(c1.rev === 1 && c2.rev === 2, 'diff mode commits two revisions')
  const base = await rejects(() => dl.removeRevision({ id: a.id, rev: 1 }))
  ok(base.threw && base.code === 'VMU_RETENTION_CONFLICT' && !!base.hint, 'baseline prune refused in diff mode')
  const okPrune = await dl.removeRevision({ id: a.id, rev: 2 })
  ok(okPrune.ok === true, 'non-baseline revision can still be pruned in diff mode')
  const listed = await dl.revisions({ id: a.id })
  ok(listed.storeMode === 'diff' && listed.total === 1, 'revisions() reports diff mode and the surviving baseline')
}

// 5) missing object / bad arguments refused by name (never silent)
{
  ok((await rejects(() => lib.commitRevision({ id: 'ghost', by: 'acad' }))).code === 'VMU_NO_SUCH_OBJECT', 'commit on ghost refused')
  ok((await rejects(() => lib.commitRevision({ id, reason: 'no committer' }))).code === 'VMU_INVALID_ARGUMENT', 'commit without by refused')
  ok((await rejects(() => lib.revisions({ id: 'ghost' }))).code === 'VMU_NO_SUCH_OBJECT', 'revisions on ghost refused')
  ok((await rejects(() => lib.revision({ id }))).code === 'VMU_INVALID_ARGUMENT', 'revision without rev refused')
  ok((await rejects(() => lib.revision({ id, rev: 99 }))).code === 'VMU_NO_SUCH_OBJECT', 'missing revision refused')
}

// 6) counted truncation on revisions()
{
  const tl = createLibrary({ root: join(root, 'trunc-root'), settings: {}, clock: () => fixed })
  const a = await tl.append({ kind: 'proposition', statement: 'many revisions', title: 'many', owner: 'acad' })
  for (let i = 0; i < 4; i++) await tl.commitRevision({ id: a.id, by: 'acad', reason: 'r' + i })
  const l = await tl.revisions({ id: a.id, limit: 2 })
  ok(l.items.length === 2 && l.total === 4 && l.dropped === 2, 'revisions() reports dropped count')
  ok(tl.truncationReport().some((t) => String(t.path).startsWith('revisions:')), 'truncation is recorded in truncationReport()')
}

// 7) zero-config: empty library never crashes on reads
{
  const empty = createLibrary({ root: join(root, 'empty-root'), settings: {}, clock: () => fixed })
  const r = await rejects(() => empty.commitRevision({ id: 'x', by: 'a' }))
  ok(r.threw && r.code === 'VMU_NO_SUCH_OBJECT', 'empty library refuses by name')
  const l = await rejects(() => empty.revisions({ id: 'x' }))
  ok(l.threw && l.code === 'VMU_NO_SUCH_OBJECT', 'empty library revisions refuses by name')
}

// 8) the frozen file really exists on disk with its trace (auditable outside the API)
{
  const list = await lib.revisions({ id })
  const first = list.items[0]
  const raw = await readFile(first.path, 'utf8')
  ok(/by: acad/.test(raw) && /reason: first freeze/.test(raw) && new RegExp('at: ' + fixed).test(raw), 'revision file carries who/why/when')
  ok(/rev: 1/.test(raw) && /baseline: true/.test(raw), 'revision file carries rev and baseline marker')
}

await rm(root, { recursive: true, force: true })
console.log('=== VMU LIBRARY REVISIONS: ' + pass + ' passed, ' + fail + ' failed ===')
process.exit(fail ? 1 : 0)

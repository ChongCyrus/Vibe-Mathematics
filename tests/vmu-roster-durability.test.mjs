// §1-(5) CROSS-KERNEL ROSTER DURABILITY: two kernels over ONE durable file — the shape the real machine has once
// members are real subagent sessions (run 13: every member's kernel said "the roster holds 0 member(s)" while the
// office's had 3).
//
// Measured facts this suite pins (each one first seen on the live run, then reproduced here):
//   1. the pack declares `members` in `vmu.resume.projections`, but the attach loop runs at the END of the factory and
//      `members` is created LATER by `declareSlots()` ⇒ the loop reported `VMU_RESUME_NO_TARGET`, the durable `members`
//      key stayed the store's `[]` seed, and every child kernel booted with an empty roster. Declaring a projection is
//      not enough — the DECLARING CALL must attach it.
//   2. the resume engine refuses every write-through until it has READ the fold (`VMU_RESUME_WRITE_BEFORE_READ`), so an
//      attached projection was decoration: the face's `snapshot()` was right while the durable key stayed `[]`. The
//      declaring call must read first.
//   3. a kernel that boots AFTER a hire must SEE it (boot-time hydration of a `mode:'state'` envelope);
//   4. a kernel that booted BEFORE a later hire must see it on the next roster read (the read-through refresh).
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const REPO = process.cwd()
const m = await import(pathToFileURL(resolve(REPO, 'vibe-math-vmu', 'kernel', 'index.js')).href)

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => { if (cond) passed++; else { failed++; failures.push(name + (detail === undefined ? '' : ' [' + detail + ']')) } }

const SLOTS = [{ id: 'chair', label: '院士', capacity: 1, permissions: ['convene', 'close', 'vote'] },
  { id: 'member', label: '常驻研究员', capacity: 5, permissions: ['vote'] }]
const SETTINGS = {
  'vmu.resume.projections': ['members', 'meetings', 'ballotbox', 'minutes', 'chat', 'panel', 'budget'],
  'vmu.resume.autoRecover': true,
  'vmu.resume.writeThrough': true,
}

const root = await mkdtemp(join(tmpdir(), 'vmu-xkernel-'))
// `settle()` drains the write-through promises the after-hook registered; without it a test would read the disk before
// the durable write landed and call a working mechanism broken (the reverse false-failure).
const flush = async (k) => { if (k.resumeService && typeof k.resumeService.settle === 'function') await k.resumeService.settle() }
const openKernel = async () => {
  const k = m.createKernel({ root, clock: () => Date.now(), settings: Object.assign({}, SETTINGS) })
  await k.store.open()
  const declared = k.declareSlots(SLOTS)
  return { k, declared }
}
try {
  // ── 1. declaration order + 2. read-before-write: both must be handled by declareSlots
  const A = await openKernel()
  ok(A.declared.hasRoster === true, 'the roster exists after declareSlots')
  ok(A.declared.projection && A.declared.projection.attached === true,
    '★★ declareSlots ATTACHES the members projection (the factory-end attach loop ran before the roster existed)',
    JSON.stringify(A.declared.projection))

  const hired = await A.k.members.hire({ id: 'member-1', slot: 'member', why: 'durability probe' })
  ok(hired.ok === true && A.k.members.roster().length === 1, 'A hired member-1')
  await flush(A.k)

  const raw = JSON.parse(await readFile(join(root, 'vmu', 'state.json'), 'utf8'))
  const env = raw.keys && raw.keys.members
  ok(env && typeof env === 'object' && !Array.isArray(env) && env.mode === 'state' && env.key === 'members',
    '★★ the durable members key became a mode:state ENVELOPE (write-through fired; before the fix it stayed the [] seed)',
    JSON.stringify(env).slice(0, 160))
  ok(env && env.value && env.value.data && Array.isArray(env.value.data.members) && env.value.data.members.length === 1,
    'and it carries the roster', JSON.stringify(env && env.value && env.value.data))

  // ── 3. a kernel that boots AFTER the hire sees it
  const B = await openKernel()
  ok(B.declared.projection && B.declared.projection.hydrated === true,
    '★★ B hydrated the roster at declareSlots time (boot after hire)', JSON.stringify(B.declared.projection))
  ok(B.k.members.roster().length === 1 && B.k.members.roster()[0].id === 'member-1',
    '★★ B sees member-1 without ever writing', JSON.stringify(B.k.members.roster().map((r) => r.id)))

  // ── 4. a kernel that booted FIRST sees a LATER hire on its next roster read
  const C = await openKernel()
  ok(C.k.members.roster().length === 1, 'C boots with member-1', JSON.stringify(C.k.members.roster().map((r) => r.id)))
  await A.k.members.hire({ id: 'member-2', slot: 'member', why: 'later hire' })
  await flush(A.k)
  const seen = C.k.members.roster().map((r) => r.id).sort().join(',')
  ok(seen === 'member-1,member-2',
    '★★ C (booted BEFORE the hire) sees member-2 on the next roster read - the read-through refresh', seen)

  // ── and the write-through still works from the other direction
  await C.k.members.hire({ id: 'member-3', slot: 'member', why: 'from C' })
  await flush(C.k)
  ok(A.k.members.roster().map((r) => r.id).indexOf('member-3') !== -1, 'A sees C\'s hire too',
    A.k.members.roster().map((r) => r.id).join(','))
} finally {
  await rm(root, { recursive: true, force: true })
}


// ── §5 THE RELOAD PATH MUST NOT RESURRECT A PAST INSTITUTE ────────────────────────────────────────────────────────
// Measured: `tests/vmu-meeting-invite.test.mjs` §10 flaked ~50% — three hired members vanished between the hire and an
// `attend()` that then refused `VMU_NOT_MEMBER`. Cause: the read-refresh hook re-read the durable fold and the members
// adapter restored it with `{replace:true}`, so a read whose fold lagged the LIVE roster replaced the roster with the
// stale one: a read destroying state. The reload path now uses an ADDITIVE restore — it may add or update a member,
// never delete one (deletion has its own name: `end()`).
{
  const K5 = await openKernel()
  const k = K5.k
  await k.members.hire({ id: 'r-chair', slot: 'chair' })
  await k.members.hire({ id: 'r-9', slot: 'member' })
  await k.members.hire({ id: 'r-10', slot: 'member' })
  await flush(k)
  const live = k.members.roster().map((x) => x.id).sort()
  ok(live.length === 3, '★★ setup: three members are really live before the stale fold is applied', JSON.stringify(live))
  const stale = k.members.snapshot()
  stale.data.members = stale.data.members.filter((x) => x.id === 'r-chair')
  const merged = k.members.restore(stale, { merge: true })
  const afterIds = k.members.roster().map((x) => x.id).sort()
  ok(merged && merged.mode === 'merge', '★ the additive restorer names its mode', merged && merged.mode)
  ok(afterIds.length === 3 && afterIds.includes('r-9') && afterIds.includes('r-10'),
    '★★ a RELOAD over a stale fold KEEPS the members this kernel hired (a read cannot delete)', JSON.stringify(afterIds))
  ok(Array.isArray(merged.kept) && merged.kept.length === 2 && merged.kept.includes('r-9'),
    '★★ and the receipt NAMES what it kept, so the merge is auditable instead of silent', merged && JSON.stringify(merged.kept))
  ok(merged.added.length === 0 && merged.updated.length === 1,
    '★★ it still applies the snapshot row it does have (chair updated, nothing added)', merged && JSON.stringify({ added: merged.added, updated: merged.updated }))
  const withNew = k.members.snapshot()
  withNew.data.members = withNew.data.members.concat([{ id: 'r-11', slot: 'member', state: 'live', permissions: ['vote'] }])
  const merged2 = k.members.restore(withNew, { merge: true })
  ok(merged2.added.includes('r-11') && k.members.roster().some((x) => x.id === 'r-11'),
    '★★ the additive path really ADDS a member this kernel had never seen (freshness kept)', JSON.stringify(merged2.added))
  let conflict = null
  try { k.members.restore(stale) } catch (e) { conflict = e }
  ok(conflict && conflict.code === 'VMU_RESUME_RESTORE_CONFLICT',
    '★★ recovery (no merge) still REFUSES a different snapshot on a non-empty roster — the two modes did not collapse', conflict && conflict.code)
  const idxSrc = await readFile(join(REPO, 'vibe-math-vmu', 'kernel', 'index.js'), 'utf8')
  ok(/restoreReload: \(v\) => members\.restore\(v, \{ merge: true \}\)/.test(idxSrc),
    '★ the members adapter exposes a reload-mode restorer', null)
  ok(/const additive = typeof adapter\.restoreReload === 'function'/.test(idxSrc) && /const restorer = additive \? adapter\.restoreReload : adapter\.restore/.test(idxSrc),
    '★★ and the read-refresh hook PREFERS it over the replacing one (otherwise the fix is decoration)', null)
}
console.log('=== VMU ROSTER DURABILITY: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) { for (const f of failures) console.log('  FAIL ' + f); process.exit(1) }

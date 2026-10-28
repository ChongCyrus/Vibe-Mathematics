// ★ RUN 119 — F-119a: an OPTIONAL part that is simply ABSENT is not a FAILED LOOKUP.
//
// THE DEFECT (measured on a live run): a member read its own task with `vibe_v5_task_get`; nobody had attached a brief, so the
// answer carried `hasBrief:false, brief:null, briefNote:"brief lookup failed: VMU_NO_SUCH_OBJECT"`. The member believed the
// mechanism was broken and wrote an obstacle card about it ("the brief cannot be read"), spending its round on a problem that
// did not exist. A read that SUCCEEDED reported its own success as a failure.
//
// THE LINE THE FIX DRAWS: absence gets its own sentence that names the setter; only a real failure keeps the "lookup failed:"
// form. Both halves are asserted here, plus the cross-kernel half (a brief attached elsewhere must be READABLE), because a
// wording fix that quietly stopped reading the shared fold would be a second defect wearing the first one's clothes.

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')

let passed = 0
let failed = 0
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const entry = await import(pathToFileURL(ENTRY).href)
const roots = []
const mkRoot = async () => { const d = await mkdtemp(join(tmpdir(), 'vmu-r119-')); roots.push(d); return d }

const boot = async (root) => {
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, { clock: () => 2000, packs: ['v5r'], root })
  await handle.ready()
  await handle.kernel.store.open()
  return { handle, K: handle.kernel, specOf: (n) => state.specs.find((s) => s.name === n) }
}
const call = async (b, name, args, exec = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { missing: true }
  let raw
  try { raw = await spec.execute(args, exec) } catch (e) {
    return { thrown: true, code: e && e.code, message: e && e.message, hint: e && e.hint }
  }
  try { return { parsed: JSON.parse(raw) } } catch { return { raw } }
}
const until = async (fn, ms = 3000) => {
  const t0 = Date.now()
  for (;;) {
    const v = await fn()
    if (v) return v
    if (Date.now() - t0 > ms) return null
    await new Promise((r) => setTimeout(r, 25))
  }
}

try {
  // ── §1 absence is a reading, not a failure
  {
    console.log('§1 a task with NO brief answers "there is none", not "the lookup failed"')
    const root = await mkRoot()
    const b = await boot(root)
    const made = await b.K.tasks.create({ title: '度量尝试失败的原因' })
    ok(made && typeof made.id === 'string' && made.id.length > 0, 'the board minted a task', made)

    const got = await call(b, 'vibe_v5_task_get', { id: made.id })
    const r = got.parsed || {}
    ok(r.ok === true, 'the read succeeds', r)
    ok(r.task && r.task.id === made.id, 'the row is returned whole (a read must not fail because an optional part is absent)', r.task)
    ok(r.task && r.task.hasBrief === false, 'the row says hasBrief:false', r.task && r.task.hasBrief)
    ok(r.brief === null || r.brief === undefined, 'the brief slot is empty', r.brief)
    ok(r.briefNote === undefined || r.briefNote === null, '★ no "lookup failed" on an ABSENT brief (this is F-119a)', r.briefNote)
    ok(typeof r.briefMeans === 'string' && /has no brief attached/.test(r.briefMeans), 'the means sentence says there is no brief attached', r.briefMeans)
    ok(/vibe_vmu_task \{ action: "brief"/.test(String(r.briefMeans)), 'and it names the setter a caller can actually run', r.briefMeans)
    ok(/No brief ≠ a broken lookup/.test(String(r.briefMeans)), 'and it says absence is not a failure, in one sentence', r.briefMeans)
    await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
  }

  // ── §2 a REAL failure still says so (the fix must not swallow broken reads)
  {
    console.log('§2 a lookup that really FAILS still reports the failure')
    const root = await mkRoot()
    const b = await boot(root)
    const made = await b.K.tasks.create({ title: '会被坏掉的读' })
    const real = b.K.tasks.briefOf
    b.K.tasks.briefOf = () => { const e = new Error('the store refused the read'); e.code = 'VMU_STORE_FAILED'; throw e }
    const got = await call(b, 'vibe_v5_task_get', { id: made.id })
    const r = got.parsed || {}
    ok(r.ok === true, 'the row is still returned (one broken part does not take the read down)', r)
    ok(typeof r.briefNote === 'string' && /brief lookup failed: VMU_STORE_FAILED/.test(r.briefNote), '★ a real failure keeps the "lookup failed:" form and its code', r.briefNote)
    ok(r.briefMeans === undefined || r.briefMeans === null, 'and no "there is no brief" sentence is invented for it', r.briefMeans)
    b.K.tasks.briefOf = real
    await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
  }

  // ── §3 another kernel's brief is READABLE (absence wording must not become a blindness)
  {
    console.log('§3 a brief attached in ONE kernel is readable in the other')
    const root = await mkRoot()
    const a = await boot(root)
    const made = await a.K.tasks.create({ title: '共享任务' })
    await a.K.tasks.brief(made.id, '验收：写一条障碍卡，卡里同时有原因段与进度行', { by: 'r-acad' })
    const mine = await call(a, 'vibe_v5_task_get', { id: made.id })
    ok(mine.parsed && mine.parsed.task && mine.parsed.task.hasBrief === true, 'the writing kernel sees hasBrief:true', mine.parsed && mine.parsed.task)
    ok(mine.parsed && mine.parsed.brief && /验收/.test(String(mine.parsed.brief.brief)), 'and reads the brief text', mine.parsed && mine.parsed.brief)

    const b = await boot(root) // the member's own kernel: same root, its own board instance
    const seen = await until(async () => {
      const r = (await call(b, 'vibe_v5_task_get', { id: made.id })).parsed
      return r && r.brief && typeof r.brief.brief === 'string' ? r : null
    })
    ok(seen !== null, '★ the second kernel reads the brief from the shared board (a pull, not a copy)', seen)
    ok(seen && /验收/.test(String(seen.brief.brief)), 'and the text is the same text', seen && seen.brief && seen.brief.brief)
    ok(seen && seen.by === undefined && seen.brief && seen.brief.by === 'r-acad', 'the brief carries who attached it', seen && seen.brief && seen.brief.by)
    await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
  }
} finally {
  for (const r of roots) { try { await rm(r, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 }) } catch { /* best effort */ } }
}

console.log('\n=== RUN 119 BRIEF ABSENCE: passed=' + passed + ' failed=' + failed + ' ===')
if (failed > 0) process.exit(1)

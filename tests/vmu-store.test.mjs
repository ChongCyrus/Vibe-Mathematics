// vmu store — the capability scenario for kernel/store.js (docs/07).
//
// The four scenarios the document promises (docs/07 §6), each one tied to a defect this repository
// has already paid for:
//   1. concurrent writes in the SAME tick must not lose one (e2e-v5-round2, and the v5r
//      leanApplySettle case) — this is why mutations go through `patch(key, current => next)`;
//   2. the key whitelist is enforced on write AND on load: an undeclared key is an error, never a
//      silent drop;
//   3. writes are atomic (temp + rename) and acknowledged only once the file is complete;
//   4. migration is all-or-nothing, backs up first, and refuses to start half-migrated.
// Plus observability (R11), subscriptions with their disposer, and export/import round-trip.
//
// `--self-probe` swaps `patch` for a naive read-modify-write and REQUIRES the concurrency assertion to
// fail: that proves the check can actually catch a lost update instead of passing by construction.

import { mkdtemp, rm, readFile, readdir, writeFile, mkdir, stat, utimes } from 'node:fs/promises'
import { cpSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = resolve(HERE, '..')
const SELF_PROBE = process.argv.includes('--self-probe')

const m = await import(pathToFileURL(resolve(REPO, 'vibe-math-vmu', 'kernel', 'store.js')).href)

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

const root = await mkdtemp(join(tmpdir(), 'vmu-store-'))
const openStore = async (opts = {}) => {
  const s = m.createStore(Object.assign({ root, clock: () => '2026-10-09T00:00:00.000Z' }, opts))
  const info = await s.open()
  if (!SELF_PROBE) return { store: s, info }
  // deliberately naive: read outside the fold, then write the whole value back => lost update
  const naive = Object.create(s)
  naive.patch = async (key, fn) => { const cur = s.read(key); return s.write(key, fn(cur)) }
  return { store: naive, info }
}

// ---- 1. open creates a harmless fold -----------------------------------------------------------
{
  const { store, info } = await openStore()
  ok(info.opened === 'created', 'a fresh workspace creates the durable file')
  ok(info.version === m.STATE_VERSION, 'the created file carries the current projection version')
  ok(m.PUBLIC_KEYS.every((k) => store.read(k) !== undefined), 'every public key exists with a harmless default')
  ok(Array.isArray(store.read('members')) && store.read('members').length === 0, 'defaults enable nothing')
  ok(store.read('phase') === null, 'the default phase is "none"')
  const st = store.stats()
  ok(st.open === true && st.keys === m.PUBLIC_KEYS.length, 'stats() reports the open fold (R11)')

  // ---- 2. round-trip, clone isolation and compare-and-set -------------------------------------
  await store.write('phase', 'explore')
  ok(store.read('phase') === 'explore', 'write then read round-trips')
  const copy = store.read('members')
  copy.push('not-in-the-fold')
  ok(store.read('members').length === 0, 'read returns a clone: a caller cannot mutate the fold')
  // ★ P0-d C#10（ROUND-1 audit）：并发/过期 compare-and-set 现在有专属具名码 `VMU_STORE_CONFLICT`（旧期望钉的是
  // 通用 `VMU_STORE_FAILED`——那读起来像「store 坏了」，而事实是「另一个写者先落地了」）。行为判据：该写不落盘、
  // 回执带 expected/current、hint 指路重读重试（vmu-turn P0d-6/P0d-7 用指纹 CAS 覆盖同一契约）。
  const staleCas = await expectThrow(() => store.write('phase', 'x', { expect: 999 }), 'VMU_STORE_CONFLICT',
    'a stale compare-and-set expectation is refused by its own name (VMU_STORE_CONFLICT, C#10)')

  // ---- 3. concurrent patches in one tick must both survive ------------------------------------
  await Promise.all([
    store.patch('members', (cur) => cur.concat('m-1')),
    store.patch('members', (cur) => cur.concat('m-2')),
  ])
  const after = store.read('members').slice().sort()
  ok(after.length === 2 && after[0] === 'm-1' && after[1] === 'm-2',
    'two patches in the same tick both survive (no lost update)', JSON.stringify(after))
  const untouched = await store.patch('members', () => undefined)
  ok(untouched.changed === false, 'a patch returning undefined changes nothing')

  // ---- 4. the whitelist is enforced on write ... ----------------------------------------------
  await expectThrow(() => store.write('not.declared', 1), 'VMU_INVALID_ARGUMENT', 'writing an undeclared key is refused')
  await expectThrow(() => store.read('not.declared'), 'VMU_INVALID_ARGUMENT', 'reading an undeclared key is refused')
  await expectThrow(() => store.patch('not.declared', () => 1), 'VMU_INVALID_ARGUMENT', 'patching an undeclared key is refused')

  // ---- 5. subscriptions fire with (next, prev) and their disposer works ------------------------
  const seen = []
  const off = store.subscribe('phase', (next, prev) => seen.push(next + '<-' + prev))
  await store.write('phase', 'formalize')
  off()
  await store.write('phase', 'close')
  ok(seen.length === 1 && seen[0] === 'formalize<-explore', 'subscribe fires once, with next and prev', JSON.stringify(seen))

  // ---- 6. atomic writes leave no debris and always a complete document ------------------------
  const entries = await readdir(join(root, 'vmu'))
  ok(!entries.some((f) => f.endsWith('.tmp')), 'no temp file survives a write')
  const parsed = JSON.parse(await readFile(store.file, 'utf8'))
  ok(parsed && parsed.version === m.STATE_VERSION && parsed.keys.phase === 'close', 'the visible file is a complete document')

  // ---- 7. export / import round-trip ----------------------------------------------------------
  const snap = store.export()
  await store.write('phase', 'mutated')
  await store.import(snap)
  ok(store.read('phase') === 'close', 'import restores an exported snapshot')
  await expectThrow(() => store.import({ version: m.STATE_VERSION, keys: { nope: 1 } }), 'VMU_INVALID_ARGUMENT',
    'import refuses a snapshot with an undeclared key')
}

// ---- 8. migration: all-or-nothing, backed up, never half-migrated -----------------------------
{
  const dir = await mkdtemp(join(tmpdir(), 'vmu-store-mig-'))
  await mkdir(join(dir, 'vmu'), { recursive: true })
  const keys = {}
  for (const k of m.PUBLIC_KEYS) keys[k] = k === 'phase' ? null : (k === 'settings.resolved' || k === 'budget' ? {} : [])
  keys.phase = 'legacy'
  await writeFile(join(dir, 'vmu', 'state.json'), JSON.stringify({ version: 0, keys }, null, 2), 'utf8')

  await expectThrow(async () => {
    const s = m.createStore({ root: dir })
    await s.open()
  }, 'VMU_STORE_MIGRATION', 'a version bump without a migrator refuses to start (never half-migrated)')

  const s2 = m.createStore({
    root: dir,
    migrators: [{ from: 0, id: 'v0->v1', up: (state) => { state.keys.phase = 'migrated' } }],
  })
  const info = await s2.open()
  ok(info.migration.applied.length === 1 && info.migration.backedUp === true, 'the migrator ran and the old file was backed up')
  ok(s2.read('phase') === 'migrated', 'the migrated value is visible after open')
  const files = await readdir(join(dir, 'vmu'))
  ok(files.some((f) => f.includes('.bak.0')), 'the pre-migration backup is on disk', files.join(','))

  // newer than this build: refuse
  await writeFile(join(dir, 'vmu', 'state.json'), JSON.stringify({ version: m.STATE_VERSION + 1, keys }, null, 2), 'utf8')
  await expectThrow(async () => { const s = m.createStore({ root: dir }); await s.open() }, 'VMU_STORE_MIGRATION',
    'a durable file newer than this build is refused, not downgraded')

  // corrupt: refuse and leave the evidence alone
  await writeFile(join(dir, 'vmu', 'state.json'), '{ this is not json', 'utf8')
  await expectThrow(async () => { const s = m.createStore({ root: dir }); await s.open() }, 'VMU_STORE_FAILED',
    'a corrupt durable file is refused')
  ok((await readFile(join(dir, 'vmu', 'state.json'), 'utf8')) === '{ this is not json',
    'the corrupt file is left untouched for inspection')

  // undeclared key inside the file: refuse
  await writeFile(join(dir, 'vmu', 'state.json'), JSON.stringify({ version: m.STATE_VERSION, keys: Object.assign({}, keys, { ghost: 1 }) }, null, 2), 'utf8')
  await expectThrow(async () => { const s = m.createStore({ root: dir }); await s.open() }, 'VMU_STORE_FAILED',
    'a durable file carrying an undeclared key is refused on load')

  await rm(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
}


// ---- 8. C#10 (ROUND-4 cross audit, P0): same-size + same-mtime-tick writes must still conflict ---------------
// The freshness stamp is `mtimeMs:size`. A write that keeps the size and lands within the same mtime tick is INVISIBLE
// to it, so a stale fold matched the caller's stale fingerprint and the CAS passed — audited: 20/25 rapid interleaved
// writes were silently overwritten. The CAS now re-reads the FILE and compares CONTENT fingerprints, so this test makes
// the defective condition DETERMINISTIC (same-size values + the file's mtime restored to the pre-write instant) and
// demands 25/25 conflicts.
{
  const cdir = await mkdtemp(join(tmpdir(), 'vmu-store-cas-stamp-'))
  const cfile = join(cdir, 'vmu', 'state.json')
  try {
    const A = m.createStore({ root: cdir, clock: () => 1000 })
    const B = m.createStore({ root: cdir, clock: () => 1000 })
    await A.open(); await B.open()
    await A.write('phase', 'base')                       // 4 chars: every token below is also 4 chars
    const T = new Date(1000000)                       // a FIXED mtime: the stamp the two stores compare is this exact value
    await utimes(cfile, T, T)
    B.refresh()                                        // B adopts fold=base + stamp=T (a genuinely stale fold with a matching stamp)
    let conflicts = 0
    let silent = 0
    for (let i = 0; i < 25; i += 1) {
      const tokenA = 'A' + String(i).padStart(3, '0')
      const tokenB = 'B' + String(i).padStart(3, '0')
      const staleFp = B.fingerprintOf('phase')           // B's view, one write behind
      await A.write('phase', tokenA)
      await utimes(cfile, T, T)                          // SAME SIZE + SAME STAMP: the stamp cannot see A's write
      const outcome = await B.write('phase', tokenB, { expectFingerprint: staleFp }).then(() => null, (e) => e)
      if (outcome && outcome.code === 'VMU_STORE_CONFLICT') conflicts += 1
      else silent += 1
    }
    ok(conflicts === 25 && silent === 0,
      'C10-10 ★★★ 同尺寸 + 同一 mtime tick 的 25 次紧邻交错写 ⇒ 25/25 VMU_STORE_CONFLICT、0 静默覆盖（freshness 不再靠 mtime+size）',
      { conflicts, silent })
    ok((await A.read('phase')) === 'A024',
      'C10-11 ★ loser 一次都没有落盘：磁盘上始终是 A 的最新值', { disk: await A.read('phase') })
    // ★ lamp: copy tree, make the content re-read a no-op -> the stamp-only path silently overwrites again (the audited
    // 20/25 shape). Deterministic here: same-size + restored mtime means the stale fold matches the stale token.
    const lampRootDir = await mkdtemp(join(tmpdir(), 'vmu-store-cas-lamp-'))
    try {
      const lampTree = join(lampRootDir, 'vibe-math-vmu')
      cpSync(join(REPO, 'vibe-math-vmu'), lampTree, { recursive: true })
      const storePath = join(lampTree, 'kernel', 'store.js')
      const src = readFileSync(storePath, 'utf8')
      const from = 'if (opts.expectFingerprint !== undefined) {\n      const memoryValue = fold.keys[key]'
      ok(src.indexOf(from) !== -1, 'C10 lamp-setup: the content-resync branch exists')
      writeFileSync(storePath, src.replace(from, 'if (false) {\n      const memoryValue = fold.keys[key]'))
      const lampStoreMod = await import(pathToFileURL(storePath).href + '?c10round4lamp=1')
      const ldir = await mkdtemp(join(tmpdir(), 'vmu-store-cas-lamp-ws-'))
      try {
        const lA = lampStoreMod.createStore({ root: ldir, clock: () => 1000 })
        const lB = lampStoreMod.createStore({ root: ldir, clock: () => 1000 })
        await lA.open(); await lB.open()
        await lA.write('phase', 'base')
        const lfile = join(ldir, 'vmu', 'state.json')
        const lst = await stat(lfile)
        let lampSilent = 0
        for (let i = 0; i < 5; i += 1) {
          const stale = lB.fingerprintOf('phase')
          await lA.write('phase', 'A' + String(i).padStart(3, '0'))
          await utimes(lfile, lst.atime, lst.mtime)
          const out = await lB.write('phase', 'B' + String(i).padStart(3, '0'), { expectFingerprint: stale }).then(() => 'ok', (e) => e)
          if (out === 'ok') lampSilent += 1
        }
        ok(lampSilent > 0,
          'C10 lamp RED-worthy: 撤掉内容重读、只靠 mtime+size ⇒ 同尺寸同 tick 的写又被静默覆盖（audit 的 20/25 原状）',
          { silent: lampSilent, disk: await lA.read('phase') })
      } finally { await rm(ldir, { recursive: true, force: true }) }
    } finally { await rm(lampRootDir, { recursive: true, force: true }) }
  } finally { await rm(cdir, { recursive: true, force: true }) }
}


// ---- 8b. TB-2791 §B-1/B-2: the CAS content-resync must HYDRATE projections, and must not parse the whole file --------
{
  const hroot = await mkdtemp(join(tmpdir(), 'vmu-store-cas-hydrate-'))
  try {
    const A = m.createStore({ root: hroot, clock: () => 1000 })
    const B = m.createStore({ root: hroot, clock: () => 1000 })
    await A.open(); await B.open()
    await A.write('phase', 'base')
    const hfile = join(hroot, 'vmu', 'state.json')
    const HFIX = new Date(1000000)
    await utimes(hfile, HFIX, HFIX)
    B.refresh()                                       // B holds fold=base + stamp=HFIX (a genuinely stale fold, matching stamp)
    let hooks = 0
    B.onReload(() => { hooks += 1 })
    const hBefore = B.stats()
    await A.write('phase', 'AAAB')                    // another kernel's update lands (same size)
    await utimes(hfile, HFIX, HFIX)                   // restore the stamp: mtime+size cannot see it
    const stale = B.fingerprintOf('phase')            // still 'base' (stale fold, matching stamp)
    let conflict = null
    try { await B.write('phase', 'BBBB', { expectFingerprint: stale }) } catch (e) { conflict = e }
    const hAfter = B.stats()
    ok(!!conflict && conflict.code === 'VMU_STORE_CONFLICT',
      'B1-1 (precondition) the interleaved CAS write is still refused by name', conflict && conflict.code)
    ok(hooks === hBefore.reloads + 1 - hBefore.reloads && hooks === 1,
      'B1-2 ★★ TB-2791 §B-1：CAS 采纳磁盘 fold 会触发 onReload（内核用它水化 members/meetings/ballotbox 等 Map 投影）——hooks 调用 +1',
      { hooks })
    ok(hAfter.reloads === hBefore.reloads + 1 && hAfter.adopts === hBefore.adopts + 1,
      'B1-3 ★★ …并且 stats.reloads +1 / stats.adopts +1（采纳被记录成一次 reload，不再是静默直赋）',
      { before: hBefore, after: hAfter })
    // hash fast path: the file is byte-identical to what this instance last persisted/adopted, so no JSON.parse is needed
    const fpNow = B.fingerprintOf('phase')
    const pBefore = B.stats()
    await B.write('phase', 'CCCC', { expectFingerprint: fpNow })
    const pAfter = B.stats()
    ok(pAfter.casHashHits > pBefore.casHashHits && pAfter.casParses === pBefore.casParses,
      'B2-1 ★★ TB-2791 §B-2：文件字节与上次持久化/采纳完全相同的 CAS 写走 sha256 快路（casHashHits+1，0 次 JSON.parse）',
      { hits: pAfter.casHashHits - pBefore.casHashHits, parses: pAfter.casParses - pBefore.casParses })
    ok(pAfter.casReads > pBefore.casReads,
      'B2-2 …仍然读了文件字节（内容判据不变：不是退回 mtime+size）', { reads: pAfter.casReads - pBefore.casReads })
    // ★ lamp: copy tree, restore the OLD direct assignment (fold = disk; adoptStamp()) in the CAS branch -> hooks never fire
    const lampDir = await mkdtemp(join(tmpdir(), 'vmu-store-cas-hy-lamp-'))
    try {
      const tree = join(lampDir, 'vibe-math-vmu')
      cpSync(join(REPO, 'vibe-math-vmu'), tree, { recursive: true })
      const storePath = join(tree, 'kernel', 'store.js')
      const src = readFileSync(storePath, 'utf8')
      const fromAdopt = 'adoptDiskFold(disk, { why: \'cas-content-resync\', key })'
      ok(src.indexOf(fromAdopt) !== -1, 'B1 lamp-setup: the CAS adoption seam exists')
      writeFileSync(storePath, src.replace(fromAdopt, 'fold = disk; adoptStamp()'))
      const lampMod = await import(pathToFileURL(storePath).href + '?tb2791lamp=1')
      const ldir = await mkdtemp(join(tmpdir(), 'vmu-store-cas-hy-lamp-ws-'))
      try {
        const lA = lampMod.createStore({ root: ldir, clock: () => 1000 })
        const lB = lampMod.createStore({ root: ldir, clock: () => 1000 })
        await lA.open(); await lB.open()
        await lA.write('phase', 'base')
        const lfile = join(ldir, 'vmu', 'state.json')
        const LFIX = new Date(1000000)
        await utimes(lfile, LFIX, LFIX)
        lB.refresh()
        let lHooks = 0
        lB.onReload(() => { lHooks += 1 })
        const lBefore = lB.stats()
        await lA.write('phase', 'AAAB')
        await utimes(lfile, LFIX, LFIX)
        const lStale = lB.fingerprintOf('phase')
        try { await lB.write('phase', 'BBBB', { expectFingerprint: lStale }) } catch { /* the conflict itself is not the lamp */ }
        const lAfter = lB.stats()
        ok(lHooks === 0 && lAfter.reloads === lBefore.reloads && lAfter.adopts === lBefore.adopts,
          'B1 lamp RED-worthy: 走旧直赋路径 ⇒ 采纳磁盘 fold 不触发 hooks、不增 reloads（投影不水化——TB-2791 §B-1 的缺陷形状）',
          { hooks: lHooks, before: lBefore, after: lAfter })
      } finally { await rm(ldir, { recursive: true, force: true }) }
    } finally { await rm(lampDir, { recursive: true, force: true }) }
  } finally { await rm(hroot, { recursive: true, force: true }) }
}

// ---- 9. self-probe ----------------------------------------------------------------------------
if (SELF_PROBE) {
  ok(failed > 0, 'self-probe: the naive read-modify-write lost an update and the assertion caught it', failed)
  console.log('=== VMU STORE SELF-PROBE: ' + (failed > 0 ? 'guard can fail (as required)' : 'GUARD CANNOT FAIL') + ' ===')
  await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
  process.exit(failed > 0 ? 0 : 1)
}

await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
console.log('=== VMU STORE: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)

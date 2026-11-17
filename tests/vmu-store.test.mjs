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


// ---- 8c. ROUND-6: one adoption seam, import hydrates, migration hash is consistent ------------------------------
{
  // (a) SOURCE: no path may assign the fold directly any more — adopting the disk file is ONE seam.
  const src = await readFile(join(REPO, 'vibe-math-vmu', 'kernel', 'store.js'), 'utf8')
  const direct = src.split('\n').filter((line) => /^\s*fold = /.test(line))
  ok(direct.length === 1 && direct[0].trim() === 'fold = disk',
    'R6-1 ★★ 只有 adoptDiskFold 自身体内允许 `fold = disk`：reloadIfStale / open / import 全部改调 seam（无第二份采纳实现）',
    direct)
  ok(!/^\s*fold = (?:loaded|clone\()/m.test(src),
    'R6-2 ★ open / import 不再直赋 fold（它们走 adoptDiskFold）', direct)
  // (b) IMPORT fires the reload hooks (projections hydrated after a whole-fold import)
  const iroot = await mkdtemp(join(tmpdir(), 'vmu-store-import-hooks-'))
  try {
    const s1 = m.createStore({ root: iroot, clock: () => 1000 })
    await s1.open()
    await s1.write('phase', 'before-import')
    const snapshot = s1.export()
    let hooks = 0
    s1.onReload(() => { hooks += 1 })
    const before = s1.stats()
    await s1.import(snapshot)
    const after = s1.stats()
    ok(hooks === 1 && after.reloads === before.reloads + 1 && after.adopts === before.adopts + 1,
      'R6-3 ★★★ import 也是「采纳磁盘 fold」⇒ 必须 fire reloadHooks（否则 members/meetings/ballotbox 等 Map 投影停在导入前）+ reloads/adopts 各 +1',
      { hooks, before, after })
    ok(s1.read('phase') === 'before-import',
      'R6-4 导入后 fold 内容正确（hooks 不是把数据改坏的那种「重载」）', s1.read('phase'))
  } finally { await rm(iroot, { recursive: true, force: true }) }
  // (c) MIGRATION: the migrated fold is written back at open, so the byte-hash fast path cannot mistake pre-migration
  // bytes for the in-memory fold (P3). On-disk version is STATE_VERSION immediately after open, and a CAS write works.
  const mroot = await mkdtemp(join(tmpdir(), 'vmu-store-mig-hash-'))
  try {
    await mkdir(join(mroot, 'vmu'), { recursive: true })
    const legacyKeys = {}
    for (const k of m.PUBLIC_KEYS) legacyKeys[k] = k === 'phase' ? 'legacy' : (k === 'settings.resolved' || k === 'budget' ? {} : [])
    await writeFile(join(mroot, 'vmu', 'state.json'), JSON.stringify({ version: 0, keys: legacyKeys }, null, 2), 'utf8')
    const s2 = m.createStore({ root: mroot, clock: () => 1000, migrators: [{ from: 0, id: 'v0->v1', up: (state) => { state.keys.phase = 'migrated' } }] })
    const info = await s2.open()
    const onDisk = JSON.parse(await readFile(join(mroot, 'vmu', 'state.json'), 'utf8'))
    ok(info.migration.applied.length === 1 && onDisk.version === m.STATE_VERSION && onDisk.keys.phase === 'migrated',
      'R6-5 ★★ P3：迁移后的 fold 在 open 时就落盘（同一份 bytes 与内存 fold 一致）⇒ 字节 hash 快路不会把迁移前字节当成内存 fold',
      { applied: info.migration.applied, diskVersion: onDisk.version, diskPhase: onDisk.keys.phase })
    const fp = s2.fingerprintOf('phase')
    const st = s2.stats()
    await s2.write('phase', 'after-migration-cas', { expectFingerprint: fp })
    const st2 = s2.stats()
    ok((await s2.read('phase')) === 'after-migration-cas' && st2.casHashHits > st.casHashHits,
      'R6-6 ★ 迁移后首次 CAS 写走字节 hash 快路且写入正确（hash 在迁移落盘后重算，不是迁移前字节）', { hits: st2.casHashHits - st.casHashHits })
  } finally { await rm(mroot, { recursive: true, force: true }) }
}


// ---- 8d. R6 follow-up (final21 G1): hooks are PER-PATH — open() adopts WITHOUT hydrating; import/CAS DO hydrate -------
{
  const root = await mkdtemp(join(tmpdir(), 'vmu-store-hooks-paths-'))
  try {
    // open() must not fire reload hooks: the kernel/resume flow owns hydration at startup (pre-R6 semantics kept).
    const probe = m.createStore({ root, clock: () => 1000 })
    let openedHooks = 0
    probe.onReload(() => { openedHooks += 1 })
    await probe.open()
    const st = probe.stats()
    ok(openedHooks === 0 && st.reloads === 0,
      'R6-7 ★★ 旧语义/新语义：open() 走同一 adoptDiskFold seam 但 **不 fire hooks**（恢复流程自己负责水化；R6 的缺陷是「没有 seam」，不是「open 必须水化」）',
      { openedHooks, reloads: st.reloads, adopts: st.adopts })
    // import DOES fire them (same seam, hooks:true) — the pair is the point, not one side of it.
    await probe.write('phase', 'x')
    let importHooks = 0
    probe.onReload(() => { importHooks += 1 })
    await probe.import(probe.export())
    ok(importHooks === 1,
      'R6-8 ★ import 仍 fire hooks（同一个 seam 的另一侧；两套语义不能互相吞掉）', { importHooks })
    // ★ lamp: copy tree, force fireHooks=true (ignore meta.hooks) -> open() hydrates and R6-7 reddens.
    const lampDir = await mkdtemp(join(tmpdir(), 'vmu-store-hooks-lamp-'))
    try {
      const tree = join(lampDir, 'vibe-math-vmu')
      cpSync(join(REPO, 'vibe-math-vmu'), tree, { recursive: true })
      const storePath = join(tree, 'kernel', 'store.js')
      const src = readFileSync(storePath, 'utf8')
      const from = 'const fireHooks = meta.hooks !== false'
      ok(src.indexOf(from) !== -1, 'R6 lamp-setup: the per-path hooks switch exists')
      writeFileSync(storePath, src.replace(from, 'const fireHooks = true'))
      const lampMod = await import(pathToFileURL(storePath).href + '?r6hooks=1')
      const ldir = await mkdtemp(join(tmpdir(), 'vmu-store-hooks-lamp-ws-'))
      try {
        const lp = lampMod.createStore({ root: ldir, clock: () => 1000 })
        let lh = 0
        lp.onReload(() => { lh += 1 })
        await lp.open()
        ok(lh > 0,
          'R6 lamp RED-worthy: 若忽略 hooks:false（open 也水化）⇒ 恢复流程会多触发一次水合（final21 G1 的六套回归形状）', { hooks: lh })
      } finally { await rm(ldir, { recursive: true, force: true }) }
    } finally { await rm(lampDir, { recursive: true, force: true }) }
  } finally { await rm(root, { recursive: true, force: true }) }
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

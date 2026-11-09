// RUN 256 / TB-2617 (P0-3): 记录面只许一张脸。
//
// 修复前（audit round14 量到的原文）：
//   kernel.records.list({ by: 'r-1' })  -> excluded: { shapeMismatch: 1, noWriter: ['rec-1'], timeUnknown: [] }
//   vibe_vmu_records { action: 'list', by: 'r-1' }  -> excluded: { shapeMismatch: 0, noWriter: [], timeUnknown: [], untracked: 0 }
// 同一条查询、同一刻：内核面说「丢了一行」，工具面说「什么都没丢」，而且工具面没有 totalUniverse，
// 读者无法用恒等式核对「这一页 + 被排除 = 全体」。根因：host 的 records 分支只过滤 library 一侧、
// 从未合并 listed.excluded，自算了一套 excluded 与 total。
//
// 本套件的判据是外部源：两面在同一条查询下的 excluded / totalUniverse / rows 数逐字相等（JSON 深比），
// 恒等式 rows + excluded 计数 === totalUniverse 在两面都成立，ok:false 同码同 facts 原样抛出。
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// TB-2681: the checkout is derived, never written down; VMU_REPO lets CI point at another clone.
const REPO = process.env.VMU_REPO || fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, '')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')

let passed = 0
let failed = 0
const ok = (cond, msg) => { if (cond) { passed += 1; return } failed += 1; console.log('FAIL: ' + msg) }
const isEmptyish = (v) => v === '' || v === null || v === undefined || (Array.isArray(v) && v.length === 0) || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0)
const eq = (a, b, msg) => {
  // non-vacuous precondition: two empty values compare equal without proving anything, so this guard runs FIRST.
  const bothEmpty = isEmptyish(a) && isEmptyish(b)
  ok(!bothEmpty, msg + ' (precondition: non-vacuous comparison)')
  ok(Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b), msg + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')')
}

const entry = await import(pathToFileURL(ENTRY).href)
const boot = async (config = {}) => {
  const specs = []
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, Object.assign({ clock: () => 1000 }, config))
  await handle.ready()
  return { handle, specOf: (n) => specs.find((x) => x.name === n) }
}

async function receipt(b, name, args) {
  const spec = b.specOf(name)
  const out = await spec.execute(args || {}, {})
  return typeof out === 'string' ? JSON.parse(out) : out
}

const stateFile = (root) => join(root, 'vmu', 'state.json')

async function readState(root) {
  return JSON.parse(await readFile(stateFile(root), 'utf8'))
}

async function patchRows(root, fn) {
  const st = await readState(root)
  st.keys.records = fn(Array.isArray(st.keys.records) ? st.keys.records : [])
  await writeFile(stateFile(root), JSON.stringify(st), 'utf8')
}

const base = await mkdtemp(join(tmpdir(), 'vmu-run256-one-face-'))
let kernel = null
let spec = null
try {
  const b = await boot({ root: base, packs: ['v5r'] })
  kernel = b.handle.kernel
  spec = b
  await kernel.members.hire({ id: 'acad', slot: 'chair' })
  await kernel.members.hire({ id: 'r-1', slot: 'member' })
  await kernel.members.hire({ id: 'office', slot: 'member' })

  // ── 0. source pins ────────────────────────────────────────────────────────
  const KSRC = await readFile(join(REPO, 'vibe-math-vmu/kernel/records.js'), 'utf8')
  const HSRC = await readFile(join(REPO, 'vibe-math-vmu/host.js'), 'utf8')
  const DOC03 = await readFile(join(REPO, 'vibe-math-vmu/docs/03-interface-contract.md'), 'utf8')
  ok(KSRC.includes('totalUniverse'), 'kernel list 回执必须带 totalUniverse')
  ok(KSRC.includes('externalSource'), 'kernel list 必须接受外部行（external/externalSource），否则合并/过滤/计数只能落在 host')
  ok(/const excluded = \{ shapeMismatch: 0, noWriter: \[\], timeUnknown: \[\], untracked: 0/.test(KSRC), 'excluded 只许一个容器：untracked 并进同一对象，不许另开')
  ok(DOC03.includes('一个形状、两处名字、一个恒等式'), 'docs/03 §10 必须写明 一个形状、两处名字、一个恒等式')

  // ── 1. 造三条坏行：noWriter / timeUnknown / 正常行 ───────────────────────
  const r1 = kernel.records.put({ track: 'paper', kind: 'finding', title: 'bad-writer', body: 'no by, no owner' })
  const r2 = kernel.records.put({ track: 'paper', kind: 'finding', title: 'good', body: 'written', by: 'r-1' })
  const r3 = kernel.records.put({ track: 'paper', kind: 'finding', title: 'bad-time', body: 'time unknown', by: 'r-1' })
  ok(r1 && r1.id, 'put 需要返回 id')
  void r3

  // ── 2. 修复前就红的形状：两面逐字相等 ────────────────────────────────────
  // timeUnknown 的丢弃分支：外部行（另一 store 的行）没有可读 updatedAt 时，必须在同一个 excluded 里具名。
  // （记录行的 updatedAt 由 put 写入，测试无法把它造成不可读；这条用 external 行证明分支与命名，而不是伪造一条坏记录。）
  const kTime = await kernel.records.list({ since: '2020-01-01', limit: 0, external: [{ id: 'ext-1', kind: 'finding', title: 'no time' }], externalSource: 'probe' })
  ok(kTime.excluded && kTime.excluded.timeUnknown.includes('ext-1'), '内核面：since 查询把 updatedAt 不可读的外部行具名进 timeUnknown（同一个丢弃分支）')
  eq(kTime.excluded.shapeMismatch, kTime.excluded.shapeMismatchIds.length, 'shapeMismatch 计数与 ids 由同一处给出')

  // ── 2. 修复前就红的形状：两面逐字相等（同一刻、同一查询） ────────────────
  const kBy = await kernel.records.list({ by: 'r-1', limit: 0 })
  const tBy = await receipt(spec, 'vibe_vmu_records', { action: 'list', by: 'r-1', limit: 0 })
  ok(kBy.excluded.shapeMismatch >= 1, '内核面 by 查询把无 writer 的行计进 shapeMismatch')
  eq(tBy.excluded, kBy.excluded, '工具面的 excluded 与内核面逐字相等（同刻同查询）')
  ok(Number.isInteger(tBy.totalUniverse), '工具面必须带 totalUniverse（修复前是 undefined）')
  eq(tBy.totalUniverse, kBy.totalUniverse, '两面的 totalUniverse 相等')
  eq(tBy.records.length, (kBy.items || []).length, '两面的行数一致')
  eq(tBy.returned, tBy.records.length, 'returned 就是这一页的行数')
  // 恒等式：rows + excluded 计数 === totalUniverse（limit:0 时页就是全集）
  const exclCount = (ex) => (ex.shapeMismatch || 0) + (ex.untracked || 0)
  eq(tBy.records.length + exclCount(tBy.excluded), tBy.totalUniverse, '恒等式：rows + excluded 计数 === totalUniverse')
  eq(kBy.items.length + exclCount(kBy.excluded), kBy.totalUniverse, '内核面同一恒等式成立')
  ok(kBy.identity && kBy.identity.holds === true && tBy.identity && tBy.identity.holds === true, '两面都报 identity.holds:true')

  // ── 2b. muted road: totalUniverse 是问题的分母，不被 mute；被 mute 挡下的行必须具名 (mutedDropped) ──
  // 修复前：muted 页返回 0 行而 totalUniverse 仍是全量，恒等式当场不守恒（0 + 0 + 0 !== 全量）。
  const mRoot = await mkdtemp(join(tmpdir(), 'vmu-run256-one-face-muted-'))
  const mb = await boot({ root: mRoot, packs: ['v5r'], 'vmu.records.pointerPropagation': false })
  const mk = mb.handle.kernel
  await mk.records.put({ track: 'paper', kind: 'finding', title: 'muted-reader', body: 'x', by: 'r-1' })
  await mk.records.put({ track: 'paper', kind: 'finding', title: 'muted-nowriter', body: 'y' })
  const mTool = await receipt(mb, 'vibe_vmu_records', { action: 'list', limit: 0 })
  const mMuted = mTool.mutedDropped
  ok(mTool.ok === true && Array.isArray(mTool.records) && mTool.records.length === 0, 'muted 页确实一行都不返回（mute 的是页面，不是问题）')
  ok(Number.isInteger(mMuted) && mMuted === 2, 'mutedDropped 具名统计被 mute 挡下的行数（= 该查询本会返回的 2 行）', { mutedDropped: mMuted })
  ok(mTool.totalUniverse === 2 && mTool.identity && mTool.identity.holds === true,
    '恒等式在「有行被 mute」时也成立：0 + 0 + 0 + 0 + 2 === 2（裸 list 不做 shape 丢弃，所以 shapeMismatch 为 0）', { totalUniverse: mTool.totalUniverse, identity: mTool.identity })
  eq(mTool.identity.mutedDropped, mMuted, 'identity 里的 mutedDropped 与顶层同一个数（同源一次计算）')
  const mKernel = mk.records.list({ limit: 0 })
  eq(mKernel.identity.mutedDropped, 2, '内核面同样的 mutedDropped')
  ok(kBy.mutedDropped === 0 && tBy.mutedDropped === 0, '未 mute 的页面 mutedDropped 恒 0（同一个字段，两种读数）')

  // ── 3. by 查询：noWriter 两面一致，正常行不被误伤 ────────────────────────
  eq(tBy.excluded, kBy.excluded, 'by 查询：两面 excluded 逐字相等')
  eq(tBy.totalUniverse, kBy.totalUniverse, 'by 查询：两面 totalUniverse 相等')
  ok(kBy.excluded.noWriter.includes(r1.id), 'noWriter 具名 rec-1')
  ok(!kBy.items.some((x) => x.id === r1.id), 'noWriter 行不在返回页里')
  eq(tBy.total, kBy.total, '工具面 total 与内核面同一口径（过滤集合大小）')

  // ── 4. limit 页面：total 不变、rows + dropped 仍等于过滤集合 ─────────────
  const kPage = await kernel.records.list({ by: 'r-1', limit: 1 })
  const tPage = await receipt(spec, 'vibe_vmu_records', { action: 'list', by: 'r-1', limit: 1 })
  eq(tPage.total, kPage.available, 'limit 页：total 是过滤集合大小，不是页大小')
  eq(tPage.records.length, 1, 'limit 页只回一行')
  eq(tPage.limitUsed, 1, 'limitUsed 报调用者的页大小')
  ok(tPage.truncated === true, '被页裁剪要说 truncated:true')

  // ── 5. ok:false 原样抛：同码同 facts ─────────────────────────────────────
  let kRefusal = null
  try { await kernel.records.list({ track: 'no-such-track' }) } catch (e) { kRefusal = e }
  const tRefusal = await receipt(spec, 'vibe_vmu_records', { action: 'list', track: 'no-such-track' })
  ok(kRefusal && kRefusal.code === 'VMU_INVALID_ARGUMENT', '内核面拒绝未知 track')
  eq(tRefusal.code, kRefusal.code, '工具面同码')
  eq(tRefusal.message, String(kRefusal.message), '工具面同 message')
  eq(tRefusal.hint, kRefusal.hint, '工具面同 hint（facts 的一部分）')

  // ── 6. 裸 list 的 untracked 路：容器仍是同一个 ──────────────────────────
  await writeFile(join(base, 'Members', 'm-1', 'Propos', 'card-1.md'), '# card-1\n', 'utf8').catch(async () => {
    await mkdir(join(base, 'Members', 'm-1', 'Propos'), { recursive: true })
    await writeFile(join(base, 'Members', 'm-1', 'Propos', 'card-1.md'), '# card-1\n', 'utf8')
  })
  const tBare = await receipt(spec, 'vibe_vmu_records', { action: 'list', limit: 0 })
  ok(tBare.excluded && typeof tBare.excluded === 'object' && !Array.isArray(tBare.excluded), 'excluded 仍是一个对象')
  ok(['shapeMismatch', 'noWriter', 'timeUnknown', 'untracked'].every((k) => k in tBare.excluded), 'untr.acked 与三种形状丢弃同容器')
  ok(!('untrackedBy' in tBare.excluded), '不许另开第二个排除容器')
} finally {
  await rm(base, { recursive: true, force: true, maxRetries: 5 }).catch(() => {})
}

console.log('=== RUN-256 RECORDS ONE FACE: ' + passed + ' passed, ' + failed + ' failed ===')
process.exitCode = failed === 0 ? 0 : 1

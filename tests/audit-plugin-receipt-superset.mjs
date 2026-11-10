// vibe-math-vmu —— 第三层（插件面）回执单一生产者判据：插件转发的 `appliedPacks` 不许把内核已经算出的键丢掉。
//
// 运行：`node tests/audit-plugin-receipt-superset.mjs`。退出码 0 = 没有未解释的丢键；1 = 有（逐条打印 branch/site/missingKey）。
//
// 为什么这一层要单独判（TB-2680）：内核 `apply` 回执带 `declarations`（TB-2649 起它是「这次真的折了什么」的权威读数），
// 插件入口把它原样放进 `appliedPacks()`；但 `packReport()` / `packMerge()` 以及它们的 adapter seam 把同一事实投影成
// 「只要 id」的数组 —— 同一回执两个生产者，语义在转发层静默消失。Phase 1（host.js 七个显式面）与 Phase 2（51 个
// make<Face>Spec 工厂面）已用 `tests/audit-host-receipt-superset.mjs` 守住；本文件守第三层。
//
// 判据形状（与任务书、以及 Lead 2026-11-10 的裁定一致）：
//   · 分支必须**从运行时实测枚举**，不手抄清单：遍历 handle / adapter 上有返回值的函数属性，凡是返回对象里带
//     `appliedPacks` 数组的，都算一条转发分支；
//   · 内核侧真相 = 插件 `appliedPacks()` 里的条目（它是唯一保留内核 `declarations` 的面），不是旁路 SQL/常量；
//   · 每个分支的**条目事实**从 `appliedPacksDetail` 读（Lead 裁定：`appliedPacks` 保持 id 字符串数组一字不改，
//     全量条目落在 `appliedPacksDetail`）；REKEYED 表必须具名说明哪条窄名答旧问题、哪条全名答新问题，why≥24 字；
//   · 逐条比较 `kernelItemKeys − detailItemKeys`，递归一层；缺失即报 `branch / site / missingKey`；
//   · 另有一条形状契约：`appliedPacks` 的条目必须仍是**字符串**（旧公开形状不许改），`appliedPacksDetail` 必须存在
//     且是对象数组 —— 只测「detail 有没有键」而放过「旧字段被改形状」等于把判据写成只测自己；
//   · 没有 `appliedPacks` 的 handle/adapter 函数面计入 `PENDING_SCOPE` 并计数（不许静默跳过）。
//
// 本判据是只读的：它不改产品码、不写任何仓库文件、不碰 `package.json`。
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as entryMod from '../vibe-math-vmu/vibe-math-vmu.js'

const fakeCtx = () => ({ effect(fn) { return fn() }, on() { return () => {} }, tools: { register: async () => () => {} } })

let covered = 0
let pending = 0
const failures = []
const branches = []

// REKEYED：旧字段答旧问题（id 投影），全量条目在新字段。why 必须说清「同源、窄名不丢事实」。
const REKEYED = {
  appliedPacks: {
    rekeyedTo: 'appliedPacksDetail',
    why: 'appliedPacks is the public id-projection (unchanged by ruling); the per-entry facts live on appliedPacksDetail, and both are produced from the SAME appliedPacks() array',
  },
}

const whyOk = (w) => typeof w === 'string' && w.length >= 24
const itemKeysOf = (item) => (item !== null && typeof item === 'object' ? Object.keys(item).sort() : [])
const unique = (xs) => Array.from(new Set(xs))

const collect = (owner, label) => {
  if (!owner || typeof owner !== 'object') return
  for (const key of Object.keys(owner)) {
    if (key === 'kernel' || key === 'adapter' || key === 'instance' || key === 'hooks') continue
    let value
    try { value = owner[key] } catch (e) { continue }
    if (typeof value !== 'function') continue
    let out
    try { out = value.call(owner) } catch (e) {
      branches.push({ branch: label + '.' + key, site: label + '.' + key + '()', kind: 'threw', note: String((e && e.code) || (e && e.message) || e) })
      continue
    }
    if (!out || typeof out !== 'object' || Array.isArray(out) || !Array.isArray(out.appliedPacks)) continue
    branches.push({ branch: label + '.' + key, site: label + '.' + key + '()', out })
  }
}

const root = mkdtempSync(join(tmpdir(), 'vmu-plugin-superset-'))
const handle = entryMod.apply(fakeCtx(), {
  clock: () => 1000,
  root,
  packs: ['v5r'],
  'vmu.packs.active': ['v5r'],
})
await handle.ready()

const kernelItems = handle.appliedPacks()
const kernelKeys = unique(kernelItems.flatMap(itemKeysOf)).sort()
const rekeyAllows = Object.keys(REKEYED).filter((k) => whyOk(REKEYED[k].why))

collect(handle, 'handle')
collect(handle.adapter, 'adapter')

for (const b of branches) {
  if (b.kind === 'threw') {
    failures.push({ branch: b.branch, site: b.site, missingKey: '(branch threw)', detail: b.note })
    continue
  }
  // 形状契约：旧字段保 id 字符串；全量条目必须在新字段且是对象数组。
  const idItems = b.out.appliedPacks
  const idsAreStrings = idItems.every((x) => typeof x === 'string')
  if (!idsAreStrings) failures.push({ branch: b.branch, site: b.site, missingKey: '(appliedPacks shape)', detail: 'appliedPacks must stay a string-id array (public shape is frozen by the Lead ruling)' })

  let detail = b.out.appliedPacksDetail
  let detailIsArray = Array.isArray(detail)
  if (idsAreStrings && !detailIsArray) {
    // 没有全量字段：REKEYED 表不许凭空宽恕 —— 只有登记了「窄名迁移到全名」的分支才允许，且必须真的存在全名字段。
    failures.push({ branch: b.branch, site: b.site, missingKey: '(appliedPacksDetail missing)', detail: 'the id projection hides every per-entry fact; add appliedPacksDetail from the same appliedPacks() array' })
    detail = []
  }
  const detailItems = Array.isArray(detail) && detail.length > 0 && detail[0] !== null && typeof detail[0] === 'object'
    ? detail
    : []
  const branchKeys = unique(detailItems.flatMap(itemKeysOf)).sort()
  const order = (k) => (k === 'declarations' ? 0 : k === 'applied' ? 1 : 2)
  const missing = kernelKeys
    .filter((k) => !branchKeys.includes(k))
    .filter((k) => !(rekeyAllows.includes('appliedPacks') && k === 'id')) // id 字符串仍是 id 的值
    .sort((a, z) => order(a) - order(z) || a.localeCompare(z))
  if (missing.length === 0) { covered += 1; continue }
  for (const k of missing) {
    failures.push({
      branch: b.branch,
      site: b.site,
      missingKey: k,
      itemShape: detailItems.length ? 'object' : 'id-string',
      detail: detailItems.length ? 'appliedPacksDetail exists but does not carry this key' : 'branch has no appliedPacksDetail, so every per-entry fact disappears behind the id projection',
    })
  }
}

// PENDING_SCOPE：没有 appliedPacks 的 handle/adapter 函数面不是这条判据的分支，但也不许当作「已核对」。
{
  let count = 0
  for (const owner of [handle, handle.adapter]) {
    if (!owner || typeof owner !== 'object') continue
    const label = owner === handle ? 'handle' : 'adapter'
    for (const key of Object.keys(owner)) {
      if (key === 'kernel' || key === 'adapter' || key === 'hooks') continue
      let v
      try { v = owner[key] } catch (e) { continue }
      if (typeof v !== 'function') continue
      if (branches.some((b) => b.site === label + '.' + key + '()')) continue
      count += 1
    }
  }
  pending = count
}

const line = 'plugin faces: branches=' + branches.length + ' covered=' + covered + ' pendingScope=' + pending +
  ' kernelItemKeys=' + JSON.stringify(kernelKeys)
console.log(line)
if (failures.length === 0) {
  console.log('VERDICT: PASS — every plugin branch that forwards appliedPacks carries every kernel item key')
  rmSync(root, { recursive: true, force: true, maxRetries: 2 })
  process.exit(0)
}
console.log('VERDICT: FAIL — ' + failures.length + ' missing key(s) across ' + unique(failures.map((f) => f.branch)).length + ' branch(es)')
const byBranch = new Map()
for (const f of failures) {
  if (!byBranch.has(f.branch)) byBranch.set(f.branch, [])
  byBranch.get(f.branch).push(f)
}
for (const [branch, list] of byBranch) {
  console.log('--- ' + branch + ' (' + list[0].site + ')')
  for (const f of list) console.log('  missingKey=' + f.missingKey + (f.detail ? '  [' + f.detail + ']' : ''))
}
rmSync(root, { recursive: true, force: true, maxRetries: 2 })
process.exit(1)

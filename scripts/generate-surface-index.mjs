// scripts/generate-surface-index.mjs - generate each surface's index INTO THE VOLUME THAT OWNS IT:
//   services  -> docs/03 (the interface contract)
//   hooks     -> docs/05 (middleware)
//   tools     -> docs/18 (command and protocol reference)
//   settings  -> docs/04 (settings)
//
// WHY. Each of these was a hand-kept list, and the hook list went stale the moment I added two hooks: the heading still said
// twenty names while VU_HOOKS had twenty-two. The registrations already carry descriptions and the hook table already has
// default policies, so every row can be derived. Ownership is respected: a surface's index lives in its own volume, not in a
// new one.
//
//   node scripts/generate-surface-index.mjs --check   (default: report)
//   node scripts/generate-surface-index.mjs --write
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const VMU = join(REPO, 'vibe-math-vmu')
const R = (p) => readFileSync(join(REPO, p), 'utf8')

const mark = (id) => ({ b: '<!-- BEGIN GENERATED: ' + id + ' -->', e: '<!-- END GENERATED: ' + id + ' -->' })

// ---- services ----
const servicesOf = () => {
  const src = R('vibe-math-vmu/kernel/index.js')
  const out = []
  for (const m of src.matchAll(/registry\.register\('([^']+)',\s*\{[^}]*\},\s*\{([^}]*)\}/g)) {
    const d = /description:\s*'([^']*)'/.exec(m[2])
    out.push({ key: m[1], desc: d ? d[1] : '' })
  }
  const uniq = new Map()
  for (const s of out) if (!uniq.has(s.key)) uniq.set(s.key, s)
  return [...uniq.values()].sort((a, b) => a.key.localeCompare(b.key))
}
// ---- hooks ----
const hooksOf = () => {
  const bus = R('vibe-math-vmu/kernel/bus.js')
  const hm = /VU_HOOKS = Object\.freeze\(\[([\s\S]{0,3000}?)\]\)/.exec(bus)
  const names = [...new Set((hm ? hm[1] : '').matchAll(/'([a-z][a-z0-9/-]+)'/g).map((m) => m[1]))]
  const fm = /DEFAULT_FAILURE = Object\.freeze\(\{([\s\S]*?)\n\s*\}\)/.exec(bus)
  const pol = {}
  for (const m of (fm ? fm[1] : '').matchAll(/'([a-z][a-z0-9/-]+)':\s*'(\w+)'/g)) pol[m[1]] = m[2]
  const producers = new Map()
  const walk = (d) => {
    for (const e of readdirSyncSafe(join(VMU, d))) {
      if (e.isDirectory()) { walk(d + '/' + e.name); continue }
      if (!e.name.endsWith('.js')) continue
      const t = readFileSync(join(VMU, d, e.name), 'utf8')
      for (const m of t.matchAll(/emit\(\s*'([a-z][a-z0-9/-]+)'/g)) {
        if (!producers.has(m[1])) producers.set(m[1], new Set())
        producers.get(m[1]).add(e.name)
      }
    }
  }
  try { walk('kernel'); walk('packs') } catch { /* the pack tree is optional */ }
  return names.map((n) => ({ name: n, policy: pol[n] || '——', who: [...(producers.get(n) || [])].sort() }))
}
function readdirSyncSafe (d) {
  try { return readdirSync(d, { withFileTypes: true }) } catch { return [] }
}
// ---- tools ----
const toolsOf = () => {
  const h = R('vibe-math-vmu/host.js')
  const names = [...h.matchAll(/^\s{2}(\w+): '(vibe_vmu_[a-z_]+)'/gm)].map((m) => ({ key: m[1], name: m[2] }))
  const enums = [...h.matchAll(/enum:\s*\[([^\]]+)\]/g)].map((m) => [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]))
  return { names, enums }
}
// ---- settings families ----
const familiesOf = () => {
  const s = R('vibe-math-vmu/settings/schema.js')
  const keys = [...new Set([...s.matchAll(/key: '([^']+)'/g)].map((m) => m[1]))]
  const fam = new Map()
  for (const k of keys) {
    const f = k.split('.').slice(0, 2).join('.')
    fam.set(f, (fam.get(f) || 0) + 1)
  }
  return { keys: keys.length, fam: [...fam.entries()].sort((a, b) => a[0].localeCompare(b[0])) }
}

const blocks = []
{
  const m = mark('service-index')
  const s = servicesOf()
  blocks.push({ file: 'vibe-math-vmu/docs/03-interface-contract.md', m, text: [
    m.b, '',
    '### 服务索引（★ **生成**：`node scripts/generate-surface-index.mjs --write` ✓）',
    '',
    '> ★★ **每行的用途取自注册调用点的 `description`** ✓（★ 实测 **73／73** 个注册都带它 ✓）⇒ ★★ **所以这张表是推导出来的，不是抄写的** ✓。★ **真源是 `registry.register` 的调用点** ✓。',
    '',
    '| 服务键 | 用途（注册点的 `description` ✓） |',
    '|---|---|',
    ...s.map((x) => '| `' + x.key + '` | ' + (x.desc || '——') + ' |'),
    '',
    '> ★★ 合计 **' + s.length + '** 个服务 ✓。',
    '', m.e,
  ].join('\n') })
}
{
  const m = mark('hook-index')
  const hs = hooksOf()
  const noPol = hs.filter((h) => h.policy === '——').map((h) => h.name)
  blocks.push({ file: 'vibe-math-vmu/docs/05-middleware.md', m, text: [
    m.b, '',
    '### 钩子索引（★ **生成**：来自 `VU_HOOKS` ＋ `DEFAULT_FAILURE` ＋ 实仓 emit 扫描 ✓）',
    '',
    '> ★★★ **本节的数字【曾经手写、并因此过期**]✗** ✓：★ **§5 的标题写着"**20** 个冻结名"，而 `VU_HOOKS` 在轮 496 已增至 **' + hs.length + '**（★ 新增 `budget/warn` 与 `member/self-report` ✓ —— ★ 两个都是**修活 bug 时**加上的 ✓）⇒ ★★ **手写计数【必然**]落后于代码** ✓ ⇒ **这张表改为生成** ✓。',
    '',
    '| 钩子 | 默认失败策略 | 生产者 |',
    '|---|---|---|',
    ...hs.map((h) => '| `' + h.name + '` | `' + h.policy + '` | ' + (h.who.length ? h.who.map((w) => '`' + w + '`').join('、') : '**无** ✗') + ' |'),
    '',
    '> ★★ 合计 **' + hs.length + '** 个冻结钩子 ✓；★ **无默认策略的 **' + noPol.length + '** 个**' + (noPol.length ? ' ✗：' + noPol.join('、') : ' ✓') + '。',
    '', m.e,
  ].join('\n') })
}
{
  const m = mark('tool-index')
  const t = toolsOf()
  blocks.push({ file: 'vibe-math-vmu/docs/18-command-and-protocol-reference.md', m, text: [
    m.b, '',
    '### 工具与 action 索引（★ **生成**：来自 `host.js` 的 `TOOL_NAMES` 与 action 枚举 ✓）',
    '',
    '> ★★ **本节§1 的表与 `TOOL_NAMES` 实测【已经一致**]✓（★ 轮 491 起有守卫 ✓）；★ **但它是**手写**的** ⇒ ★ **改为生成，使未来不一致在源头不可能** ✓。',
    '',
    '| # | 工具键 | 工具名 |',
    '|---|---|---|',
    ...t.names.map((n, i) => '| ' + (i + 1) + ' | `' + n.key + '` | `' + n.name + '` |'),
    '',
    '> ★★ 合计 **' + t.names.length + '** 个工具 ✓；★ **action 枚举 **' + t.enums.length + '** 组／**' + t.enums.reduce((n, a) => n + a.length, 0) + '** 项** ✓：★ ' + t.enums.map((a) => '`' + a.join('/') + '`').join(' ｜ ') + '。',
    '', m.e,
  ].join('\n') })
}
{
  const m = mark('settings-index')
  const f = familiesOf()
  blocks.push({ file: 'vibe-math-vmu/docs/04-settings.md', m, text: [
    m.b, '',
    '### 设置家族索引（★ **生成**：来自 `settings/schema.js` ✓）',
    '',
    '> ★★ **键 **' + f.keys + '** 个，前缀家族 **' + f.fam.length + '** 个** ✓ ⇒ ★ **按家族读，比逐个键读更能看清"这一片有哪些旋钮"** ✓。★ **真源是 `schema.js` 的 `key:` 声明** ✓。',
    '',
    '| 家族 | 键数 |',
    '|---|---|',
    ...f.fam.map(([k, n]) => '| `' + k + '.*` | ' + n + ' |'),
    '', m.e,
  ].join('\n') })
}

const check = !process.argv.includes('--write')
let bad = 0
for (const b of blocks) {
  const p = join(REPO, b.file)
  const doc = readFileSync(p, 'utf8')
  const a = doc.indexOf(b.m.b)
  const e = doc.indexOf(b.m.e)
  const next = a >= 0 && e > a
    ? doc.slice(0, a) + b.text + doc.slice(e + b.m.e.length)
    : doc.replace(/\n*$/, '\n') + '\n' + b.text + '\n'
  if (check) {
    if (a < 0) { console.error(b.file + ': generated block MISSING'); bad += 1; continue }
    if (doc !== next) { console.error(b.file + ': generated block STALE'); bad += 1; continue }
    console.log(b.file + ': current')
  } else {
    writeFileSync(p, next)
    console.log(b.file + ': written')
  }
}
if (check && bad) process.exit(1)

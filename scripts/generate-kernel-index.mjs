// scripts/generate-kernel-index.mjs - build the kernel module index in docs/02 from the modules' own header comments.
//
// WHY GENERATED. The architecture volume named 24 of the kernel's 84 modules by hand, and a hand-kept list is exactly what
// this session keeps finding stale. The modules already carry good headers - the header of audit.js cites its spec volumes,
// budget.js names its quota classes - so the index is derived from them and can be checked rather than trusted.
//
//   node scripts/generate-kernel-index.mjs --check   (default: report)
//   node scripts/generate-kernel-index.mjs --write
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const KERNEL = join(REPO, 'vibe-math-vmu', 'kernel')
const DOC = join(REPO, 'vibe-math-vmu', 'docs', '02-architecture.md')
const BEGIN = '<!-- BEGIN GENERATED: kernel-index -->'
const END = '<!-- END GENERATED: kernel-index -->'

const headerOf = (src) => {
  const out = []
  for (const l of src.split('\n')) {
    const t = l.trim()
    if (t === '') { if (out.length) break; else continue }
    if (t.startsWith('//')) { out.push(t.replace(/^\/\/\s?/, '')); continue }
    break
  }
  return out.join(' ').trim()
}
const exportsOf = (src) => [...new Set([...src.matchAll(/^export (?:function|const) (\w+)/gm)].map((m) => m[1]))]
  .filter((e) => e !== 'apiVersion' && e !== 'refuse')

const mods = readdirSync(KERNEL).filter((f) => f.endsWith('.js')).sort()
const rows = mods.map((m) => {
  const src = readFileSync(join(KERNEL, m), 'utf8')
  return { m, header: headerOf(src), exports: exportsOf(src) }
})
const headerless = rows.filter((r) => r.header.length < 25).map((r) => r.m)
const lines = [
  BEGIN,
  '',
  '### 内核模块索引（★ **生成**：`node scripts/generate-kernel-index.mjs --write` ✓）',
  '',
  '> ★★ **为什么是生成的**：★ **本卷原先【手写**]了 84 个模块里的 24 个** ✗ —— ★ 而**手维护的清单，正是这个会话一再发现【会过期**]的那类东西 ✓。★ **真源是每个模块自己的头部注释** ✓（★ 它们本来就写得好：`audit.js` 的头部**点名了它的 spec 卷** ✓、`budget.js` 的头部**点名了它的四类配额** ✓）⇒ ★★ **所以这张索引是【推导**]出来的，可以**被核对**，而不是**被信任** ✓。',
  '',
  '| 模块 | 用途（取自其头部注释 ✓） | 公开导出 |',
  '|---|---|---|',
  ...rows.map((r) => '| `' + r.m + '` | ' + (r.header || '——**（头部缺失 ✗）**') + ' | ' + (r.exports.length ? r.exports.map((e) => '`' + e + '`').join('、') : '——（无公开导出 ✓）') + ' |'),
  '',
  '> ★★ **合计 **' + rows.length + '** 个模块** ✓；★ **头部缺失 **' + headerless.length + '** 个**' + (headerless.length ? ' ✗：`' + headerless.join('`、`') + '`' : ' ✓') + '。★★ **由 `tests/audit-kernel-index.test.mjs` 守着**：★ **索引必须与目录逐个一致（双向）** ✓，★ **且每个模块都要有可用的头部注释** ✓。',
  '',
  END,
].join('\n')

const doc = readFileSync(DOC, 'utf8')
const a = doc.indexOf(BEGIN)
const b = doc.indexOf(END)
const next = a >= 0 && b >= 0 ? doc.slice(0, a) + lines + doc.slice(b + END.length) : doc.replace(/\n*$/, '\n') + '\n' + lines + '\n'
const check = !process.argv.includes('--write')
if (check) {
  if (a < 0 || b < 0) { console.error('kernel-index: the generated block is MISSING from docs/02'); process.exit(1) }
  if (doc !== next) { console.error('kernel-index: docs/02 is STALE - run node scripts/generate-kernel-index.mjs --write'); process.exit(1) }
  console.log('kernel-index: docs/02 matches the kernel (' + rows.length + ' modules, ' + headerless.length + ' headerless)')
} else {
  writeFileSync(DOC, next)
  console.log('kernel-index: written (' + rows.length + ' modules, ' + headerless.length + ' headerless)')
}

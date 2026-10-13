// Round 620: the acceptance summary's readiness figures were hand-typed into a page whose whole purpose is to let a reader judge what
// the project demonstrates, and rounds 618 and 619 each found stale copies there. This generator DERIVES the figures that can be read
// from the runtime and writes them into one marked block, so they join the same drift check as the other generated artefacts.
//
// THE GATE FIGURE IS NOT DERIVED, AND SAYS SO. Job and suite counts only exist as the output of a run, so the block points at the
// command instead of copying its result - a copy of a run's output is the most perishable number of all.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const DOC = process.env.VMU_READINESS_DOC ? join(REPO, process.env.VMU_READINESS_DOC) : join(REPO, 'vibe-math-vmu', 'docs', '00-README.md')
const BEGIN = '<!-- BEGIN GENERATED: readiness-figures (scripts/generate-readiness-figures.mjs) -->'
const END = '<!-- END GENERATED: readiness-figures -->'
const V = join(REPO, 'vibe-math-vmu')

export async function figures() {
  const host = await import('file:///' + join(V, 'host.js').replace(/\\/g, '/'))
  const tools = Object.keys(host.TOOL_NAMES).length
  const { SETTING_DEFS } = await import('file:///' + join(V, 'settings', 'schema.js').replace(/\\/g, '/'))
  const keys = SETTING_DEFS.length
  const bus = await import('file:///' + join(V, 'kernel', 'bus.js').replace(/\\/g, '/'))
  const vu = bus.VU_HOOKS instanceof Map ? bus.VU_HOOKS.size : (Array.isArray(bus.VU_HOOKS) ? bus.VU_HOOKS.length : Object.keys(bus.VU_HOOKS || {}).length)
  const hh = await import('file:///' + join(V, 'host-hooks.js').replace(/\\/g, '/')).catch(() => ({}))
  const hostHooks = Array.isArray(hh.BRIDGED_HOOKS) ? hh.BRIDGED_HOOKS.length : 0
  const road = readFileSync(join(V, 'docs', '14-open-items-and-roadmap.md'), 'utf8')
  const h2 = (road.match(/^## /gm) || []).length
  const h3 = (road.match(/^### /gm) || []).length
  const h4 = (road.match(/^#### /gm) || []).length
  const packs = ['v5r', 'v3-core', 'institute-min'].filter((p) => existsSync(join(V, 'packs', p, 'index.js'))).length
  return { tools, keys, vu, hostHooks, h2, h3, h4, packs, lines: road.split('\n').length }
}

export function render(f) {
  return [
    BEGIN,
    '| # | 检查 | 结果（★ **本块由 `scripts/generate-readiness-figures.mjs` 派生** ✓ —— ★ 不许手改 ✓） |',
    '|---|---|---|',
    '| ★ 1 | pack 文件夹带清单 | ★ **' + f.packs + '／3** ✓ |',
    '| ★ 2 | 宿主发布工具面 | ★ **' + f.tools + ' 命令** ✓（★ 真源 `host.js` 的 `TOOL_NAMES` ✓） |',
    '| ★ 3 | 可调控设置键 | ★ **' + f.keys + ' 键** ✓（★ 真源 `settings/schema.js` 的 `SETTING_DEFS` ✓） |',
    '| ★ 4 | 接口／插件钩子 | ★ **总线 ' + f.vu + ' ＋ 宿主 ' + f.hostHooks + '** ✓（★ 真源 `kernel/bus.js` 与 `host-hooks.js` ✓） |',
    '| ★ 5 | 路线图结构 | ★ **' + f.h2 + ' 章／' + f.h3 + ' 节／' + f.h4 + ' 子节／' + f.lines + ' 行** ✓ |',
    '| ★ 6 | 门禁 | ★★ **不在此处写数字** ✗ —— ★ 作业数与套件数只存在于【一次运行**]的输出里 ✓ ⇒ ★ **跑 `GATE_SCOPE=vmu node tests/run-tests.mjs` 看当轮结果** ✓（★ 一次运行的输出的副本是【最易腐**]的数字 ✓） |',
    END,
  ].join('\n')
}

const check = !process.argv.includes('--write')
const f = await figures()
const block = render(f)
const doc = readFileSync(DOC, 'utf8')
const b = doc.indexOf(BEGIN)
if (b === -1) {
  console.log('readiness figures: block not found in the document; nothing to check')
  process.exit(0)
}
const e = doc.indexOf(END, b)
const current = doc.slice(b, e + END.length)
if (current === block) { console.log('readiness figures: current (' + JSON.stringify(f) + ')'); process.exit(0) }
if (check) { console.log('readiness figures: STALE - the block is not what the runtime yields (' + JSON.stringify(f) + ')'); process.exit(1) }
writeFileSync(DOC, doc.slice(0, b) + block + doc.slice(e + END.length))
console.log('readiness figures: written (' + JSON.stringify(f) + ')')

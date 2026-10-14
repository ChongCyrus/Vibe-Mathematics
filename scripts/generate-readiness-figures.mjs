// Round 620: the acceptance summary's readiness figures were hand-typed into a page whose whole purpose is to let a reader judge what
// the project demonstrates, and rounds 618 and 619 each found stale copies there. This generator DERIVES the figures that can be read
// from the runtime and writes them into one marked block, so they join the same drift check as the other generated artefacts.
//
// THE GATE FIGURE IS NOT DERIVED, AND SAYS SO. Job and suite counts only exist as the output of a run, so the block points at the
// command instead of copying its result - a copy of a run's output is the most perishable number of all.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
// The seam takes a RELATIVE path or an ABSOLUTE one: `resolve` handles both, while `join(REPO, x)` silently
// produced a broken path for an absolute `x` (spotted while a guard tried to point the writer at a temp copy
// outside the repository). Its sibling `generate-wiring-index.mjs` already resolves its seam this way.
const DOC = process.env.VMU_READINESS_DOC ? resolve(REPO, process.env.VMU_READINESS_DOC) : join(REPO, 'vibe-math-vmu', 'docs', '00-README.md')
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
  // ROUND 623, AND THE LESSON OF THE ROUND: a marker count and a `{{ roleLabel }}` count were computed here and then REMOVED, because they
  // did not measure the same quantity as the figures the documents state - the first counted every check/cross glyph in the tree, the
  // second counted occurrences in one source file, while the documents' figures come from a scan and from the bridge's output
  // respectively. A generated block carrying a "derived" label over a different quantity is worse than a hand-typed copy, so the
  // computation is gone rather than merely unused: a number you can compute is not the same as a number you can compute CORRECTLY.
  return { tools, keys, vu, hostHooks, h2, h3, h4, packs, lines: road.split('\n').length }
}

export const FACES_BEGIN = '<!-- BEGIN GENERATED: readiness-faces (scripts/generate-readiness-figures.mjs) -->'
export const FACES_END = '<!-- END GENERATED: readiness-faces -->'

export function renderFaces(f) {
  return [
    FACES_BEGIN,
    '> ★★★★ **下面这些值由 `scripts/generate-readiness-figures.mjs` 派生** ✓（★ 轮 623 ✓ —— ★ 按本卷那条规矩：★ "凡可由作业打印的数字，本文不手写" ✓）—— ★ **要当前值就读这里、★ 不要改** ✓；★★ **而"由作业打印"的那几行是【一次运行的结果**]，★ 本表不复制它们** ✓。',
    '>',
    '> ★★★★★ **只收【能按同一口径派生**]的量** ✓（★ 轮 623 实测的教训 ✓）：★★ **第一版把"文档里所有 `✓✗⚠` 字符数"当成"标记账目"，★ 派生出 730／26919，★ 而 `docs/14` §8 那个数是【另一种口径**]的 1364 ✗✓ ⇒ ★★★ **"能算"不等于"算的是同一个量"** ✓ ⇒ ★ **故那两个量【已撤出本块**]，★ 仍由各自的作业打印** ✓（★ 否则本块会给出一个【带着"派生"标签、★ 却量着别的东西**]的数，★ 比手写副本更坏 ✗）** ✓✓。',
    '',
    '| ★ 量 | ★ 值（★ 派生 ✓） |',
    '|---|---|',
    '| ★ 可调控设置键 | ★ **' + f.keys + '** ✓ |',
    '| ★ 宿主发布工具面 | ★ **' + f.tools + '** ✓ |',
    '| ★ 钩子（总线／宿主） | ★ **' + f.vu + ' ／ ' + f.hostHooks + '** ✓ |',
    '| ★ pack 文件夹（带清单） | ★ **' + f.packs + '** ✓ |',
    '| ★ 路线图结构（章／节／子节／行） | ★ **' + f.h2 + ' ／ ' + f.h3 + ' ／ ' + f.h4 + ' ／ ' + f.lines + '** ✓ |',
    FACES_END,
  ].join('\n')
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
const doc = readFileSync(DOC, 'utf8')
let next = doc
let stale = []
for (const [B, E, block] of [[BEGIN, END, render(f)], [FACES_BEGIN, FACES_END, renderFaces(f)]]) {
  const b = next.indexOf(B)
  if (b === -1) { stale.push('no-block'); continue }
  const e = next.indexOf(E, b)
  const current = next.slice(b, e + E.length)
  if (current !== block) stale.push(B.includes('faces') ? 'faces' : 'figures')
  else next = next.slice(0, b) + block + next.slice(e + E.length)
}
if (stale.length === 0) { console.log('readiness figures: current (' + JSON.stringify(f) + ')'); process.exit(0) }
if (stale.includes('no-block')) { console.log('readiness figures: block not found in the document; nothing to check'); process.exit(0) }
if (check) { console.log('readiness figures: STALE (' + stale.join(',') + ') - the block is not what the runtime yields (' + JSON.stringify(f) + ')'); process.exit(1) }
// write mode: rebuild every block in place
let out = doc
for (const [B, E, block] of [[BEGIN, END, render(f)], [FACES_BEGIN, FACES_END, renderFaces(f)]]) {
  const b = out.indexOf(B)
  if (b === -1) continue
  const e = out.indexOf(E, b)
  out = out.slice(0, b) + block + out.slice(e + E.length)
}
writeFileSync(DOC, out)
console.log('readiness figures: written (' + JSON.stringify(f) + ')')

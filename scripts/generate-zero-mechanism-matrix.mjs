#!/usr/bin/env node
// vmu · E5 零机制行为矩阵（生成式）—— 回答"**零配置下该期待什么**"（第 12 轮 C4 遗留 ✓）。
//
// 用法：
//   node scripts/generate-zero-mechanism-matrix.mjs            # 打印矩阵（人看）
//   node scripts/generate-zero-mechanism-matrix.mjs --check     # 与 11 卷里的生成块比对；**漂移即红** ✗✓
//   node scripts/generate-zero-mechanism-matrix.mjs --write     # 把矩阵写回 11 卷的生成块（标记内 ✓）
//
// 原则（Lead 口径 ✓）：
//   · **只读**：以 `create({clock})`（**不传 settings** ✗）创建每个内核模块，调用一个代表性操作，采集
//     "**返回/拒绝形状 ＋ 自曝字段**" ✓ —— **绝不改任何模块语义** ✗✓；
//   · 列＝`模块 | 零机制下的返回形状 | 是否具名拒（码） | 自曝字段 | 期望（设计）` ✓；
//   · **"期望"与"实测"不一致 ⇒ 门禁红** ✗✓（要么修模块，要么在 EXPECT 里明写"设计如此"＋理由 ✓；
//     **不许为了让矩阵好看而改模块** ✗✓ —— 本脚本**无权改模块** ✓）；
//   · 已知四形态（期望值来源 ✓）：`idempotency`＝显式 `absent` ✓／`mathtools`＝`ok + enforced:[]` ✓／
//     `meetings`＝按声明**默认开成** ✓／`records`·`ballotbox`＝**具名拒或 ok** ✓。

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const KERNEL = join(HERE, '..', 'vibe-math-vmu', 'kernel')
const DOC = join(HERE, '..', 'vibe-math-vmu', 'docs', '11-gates-and-development.md')
const BEGIN = '<!-- BEGIN GENERATED: zero-mechanism-matrix -->'
const END = '<!-- END GENERATED: zero-mechanism-matrix -->'

/** 期望（设计）表：`模块 → {shape, note}` ✓；**未登记 ⇒ 显式标"设计未定"** ✗✓（不算漂移，但计数 ✓）。 */
const EXPECT = {
  idempotency: { shape: '显式 absent', note: '零机制＝无状态可去重 ⇒ 显式 `absent` ✓' },
  mathtools: { shape: 'ok + enforced:[]', note: '零机制＝无限额可管 ⇒ 放行且 `enforced` 为空 ✓' },
  meetings: { shape: '按声明默认开成', note: '零机制＝按声明默认值开成（不拒）✓' },
  records: { shape: '具名拒或 ok', note: '零机制＝无键则具名拒；有默认则 ok ✓' },
  ballotbox: { shape: '具名拒或 ok', note: '同 records ✓' },
}

const shape = (v) => {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array[' + v.length + ']'
  if (typeof v !== 'object') return typeof v + '(' + JSON.stringify(v) + ')'
  if (v.ok === false) return 'refusal'
  if (v.ok === true) return 'ok'
  return 'object'
}
const disclosed = (v) => {
  if (!v || typeof v !== 'object') return '—'
  const keys = ['enforced', 'fired', 'assumed', 'absent', 'dropped', 'droppedBytes', 'noop', 'validated', 'enforcedScope', 'truncated']
  const hit = keys.filter((k) => v[k] !== undefined).map((k) => k + '=' + (Array.isArray(v[k]) ? '[' + v[k].length + ']' : String(v[k])))
  return hit.length ? hit.join(' ') : '—'
}

/** 探测一个模块：**不传 settings** ✗；先用第一个 `create*` 工厂，再调它的首个零参操作 ✓。 */
async function probe(file) {
  const name = file.replace(/\.js$/, '')
  const mod = await import(pathToFileURL(join(KERNEL, file)).href)
  const factoryKey = Object.keys(mod).find((k) => /^create[A-Z]/.test(k) && typeof mod[k] === 'function')
  if (!factoryKey) return { module: name, shape: '（无 create* 工厂）', refusal: '—', disclosed: '—', note: '跳过（非服务模块）' }
  let inst
  try { inst = mod[factoryKey]({ clock: () => 0 }) } catch (e) { return { module: name, shape: 'create 抛出', refusal: '—', disclosed: '—', note: String((e && e.message) || e) } }
  const opKey = Object.keys(inst).find((k) => typeof inst[k] === 'function' && /^(open|run|plan|put|status|state|advance|submit|check|build|propose|stages|record|list)$/.test(k))
    || Object.keys(inst).find((k) => typeof inst[k] === 'function')
  if (!opKey) return { module: name, shape: '（无操作）', refusal: '—', disclosed: '—', note: '跳过' }
  let out
  try { out = await inst[opKey]({}) } catch (e) { return { module: name, shape: 'op 抛出', refusal: '—', disclosed: '—', note: opKey + '(): ' + String((e && e.message) || e) } }
  const v = (out && typeof out === 'object' && 'value' in out) ? out.value : out
  return {
    module: name, op: opKey, shape: shape(v),
    refusal: (v && v.ok === false && v.code) ? String(v.code) : (v && v.ok === false ? '（无名）✗' : '—'),
    disclosed: disclosed(v),
    note: (v && v.ok === false) ? '具名拒（零机制下拒绝 ✓）' : (v && v.ok === true ? '放行 ✓' : '—'),
  }
}

function build(rows) {
  const head = '| 模块 | 零机制下的返回形状 | 是否具名拒（码） | 自曝字段 | 期望（设计） |'
  const sep = '|---|---|---|---|---|'
  const body = rows.map((r) => {
    const e = EXPECT[r.module]
    const exp = e ? (e.shape + '（' + e.note + '）') : '（**设计未定** ✗：本模块未登记期望）'
    return '| `' + r.module + (r.op ? '` · `' + r.op + '()`' : '`') + ' | ' + r.shape + ' | ' + r.refusal + ' | ' + r.disclosed + ' | ' + exp + ' |'
  })
  return [head, sep].concat(body).join('\n')
}

/** 漂移判定 ✓：**只对已登记期望的模块**比对；未登记 ⇒ 计数不算红（设计未定 ✓）；
 *  `probe-error`（op 需参数 ⇒ 探针缺参）**不算零机制缺陷** ✗✓，单列计数 ✓；**具名拒无名 ⇒ 红** ✗✓。 */
function judge(rows) {
  const mism = []
  let unregistered = 0
  let probeErrors = 0
  for (const r of rows) {
    if (/抛出|import 失败|create 抛出/.test(r.shape)) { probeErrors += 1; continue }
    if (r.refusal === '（无名）✗') { mism.push(r.module + ': 拒绝**没有具名码** ✗'); continue }
    const e = EXPECT[r.module]
    if (!e) { unregistered += 1; continue }
    const s = r.shape
    const okShape = (e.shape === '具名拒或 ok') ? (s === 'refusal' || s === 'ok')
      : (e.shape === 'ok + enforced:[]') ? (s === 'ok' && /enforced=\[0\]/.test(r.disclosed))
        : (e.shape === '显式 absent') ? (/absent=/.test(r.disclosed) || s === 'ok')
          : (e.shape === '按声明默认开成') ? (s === 'ok')
            : false
    if (!okShape) mism.push(r.module + ': 实测 `' + s + '`／自曝 `' + r.disclosed + '` ≠ 期望「' + e.shape + '」')
  }
  return { mism, unregistered, probeErrors }
}

const main = async () => {
  const files = readdirSync(KERNEL).filter((f) => f.endsWith('.js')).sort()
  const rows = []
  for (const f of files) { try { rows.push(await probe(f)) } catch (e) { rows.push({ module: f, shape: 'import 失败', refusal: '—', disclosed: '—', note: String((e && e.message) || e) }) } }
  const table = build(rows)
  const { mism, unregistered, probeErrors } = judge(rows)
  const last = '=== ZERO-MECHANISM MATRIX: ' + rows.length + ' modules, ' + mism.length + ' mismatches, ' + unregistered + ' unregistered, ' + probeErrors + ' probe-errors ==='
  const block = [BEGIN, '<!-- 本块由 `scripts/generate-zero-mechanism-matrix.mjs` 生成（生成式 ✓，勿手写 ✗） -->', '', table, '', last, END].join('\n')

  const args = process.argv.slice(2)
  if (args.includes('--write')) {
    const doc = readFileSync(DOC, 'utf8')
    const next = doc.includes(BEGIN) ? doc.replace(new RegExp(BEGIN + '[\\s\\S]*?' + END), block) : doc.trimEnd() + '\n\n' + block + '\n'
    writeFileSync(DOC, next)
    console.log('written: ' + mism.length + ' mismatches, ' + unregistered + ' unregistered')
  } else if (args.includes('--check')) {
    const doc = readFileSync(DOC, 'utf8')
    const m = doc.match(new RegExp(BEGIN + '([\\s\\S]*?)' + END))
    if (!m) { console.log('FAIL generated block not found in 11-gates-and-development.md'); process.exit(1) }
    const onDisk = (BEGIN + m[1] + END).trim()
    if (onDisk !== block.trim()) { console.log('FAIL matrix drifted (run without --write/--check to see, then --write)'); process.exit(1) }
    console.log(last)
  } else {
    console.log(table); console.log(last)
  }
  for (const x of mism) console.log('FINDING ' + x)
  process.exit(mism.length > 0 ? 1 : 0)
}
main()

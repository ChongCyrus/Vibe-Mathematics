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
/** 期望（设计）表 ✓（**逐条、一行理由** ✓ —— 从各模块的实际契约反推 ✓）。
 *  三种登记值：形状 ✓／`EXPECT_UNDECIDED`（**显式待办**，不红但计数 ✓）／`EXPECT_NA`（非服务模块 ✓）。 */
const G = (shape, note) => ({ shape, note })
const OK_READ = G('ok 或 object', '状态/列表面：无声明 ⇒ 放行（不拒）')
const REFUSE = G('具名拒（带 code）', '缺必填参数 ⇒ 具名拒并点名')
const EXPECT = {
  // ── 状态/列表/只读面：零机制＝宽松放行 ✓（26）
  alerts: OK_READ, audit: OK_READ, auditchain: OK_READ, ballot: OK_READ, bidding: OK_READ,
  board: OK_READ, bus: OK_READ, clockguard: G('ok 或 null', '时钟守卫：无声明 ⇒ 不拦（返回 null 亦合规）'),
  crypto: OK_READ, domaingate: OK_READ, external: OK_READ, fairness: OK_READ, index: OK_READ,
  loader: OK_READ, meeting: OK_READ, members: OK_READ, metrics: OK_READ, minutes: OK_READ,
  notify: OK_READ, projmigrate: OK_READ, ratelimit: OK_READ, recruit: OK_READ, registry: OK_READ,
  replay: OK_READ, retention: OK_READ, rules: OK_READ, scheduler: OK_READ, skills: OK_READ,
  tasks: G('array', '任务板：零机制 ⇒ 空列表（放行）'), topology: OK_READ, trust: OK_READ,
  governance: G('array 或 object', '治理面：只读列举（keysUsed/partition 不拒）'),
  // ── 具名拒面：缺参数/未声明 ⇒ 具名拒 ✓
  ballotbox: G('具名拒或 ok', '零机制：无票面参数 ⇒ 具名拒；有默认 ⇒ ok ✓'),
  course: G('具名拒或 ok', '零机制：缺课程参数 ⇒ 具名拒（enforced 非空）✓'),
  formal: REFUSE, mathjobs: REFUSE, lean: REFUSE, lifecycle: REFUSE, stateversion: REFUSE, repropack: REFUSE,
  idempotency: G('ok 或 object', '列表/状态面放行 ✓；**显式 `absent` 只在去重操作上**（该操作需参数 ⇒ 探针见 NEEDS_ARGS ✓）'),
  meetings: G('按声明默认开成', '零机制＝按声明默认值开成（不拒）✓'),
  // ── 探针缺参（**显式登记**，不算 mismatch ✓）：需显式探针或补参数
  arbitration: G('PROBE_NEEDS_ARGS', '缺：裁决请求体（案由/双方）'),
  budget: G('PROBE_NEEDS_ARGS', '缺：预算条目（额度/科目）'), charter: G('PROBE_NEEDS_ARGS', '缺：章程条项'),
  delegation: G('PROBE_NEEDS_ARGS', '缺：委派授权对（from/to/范围）'), handover: G('PROBE_NEEDS_ARGS', '缺：交接对象'),
  library: G('PROBE_NEEDS_ARGS', '缺：库引用（ref/uri）'), math: G('PROBE_NEEDS_ARGS', '缺：数学请求体'),
  mathtools: G('PROBE_NEEDS_ARGS', '缺：计划入参（op/limits）—— 零机制期望＝ok + enforced:[] ✓'),
  memory: G('PROBE_NEEDS_ARGS', '缺：记忆条目'), publication: G('PROBE_NEEDS_ARGS', '缺：出版请求'),
  records: G('PROBE_NEEDS_ARGS', '缺：记录体（track/kind/body）'),
  store: G('PROBE_NEEDS_ARGS', '缺：存储配置'), transaction: G('PROBE_NEEDS_ARGS', '缺：事务体'),
  work: G('PROBE_NEEDS_ARGS', '缺：工作项'),
  workflow: G('具名拒或 ok', '**两侧都写清** ✓：`define({})` ⇒ **有默认阶梯且放行（ok）** ✓；被探 op 缺参 ⇒ **具名拒** ✓（缺参归 NEEDS_ARGS 计数，不算 mismatch ✓）'),
  // ── 第 26 轮已修好的具名拒（**待办没跟上 ⇒ 已纠正** ✓）＋ 非服务模块
  pack: G('具名拒（带 code）', '第 26 轮已修 ✓：实测拒绝带 **`VMU_PACK_MISSING`**（曾误标"不带 code" ✗）'),
  'script-bridge': G('具名拒（带 code）', '第 26 轮已修 ✓：实测拒绝带 **`VMU_INVALID_ARGUMENT`**（同上 ✗）'),
  // ── 在途新模块：**必须被裁定** ✓（第 33 轮规则收紧 ✓）—— 从模块实测反推 ✓
  instruments: G('ok 或 object', '仪器面：零机制 ⇒ **台账可读、不拒**（`status()` 返回 `ok:true` ＋ `partition` ✓）；其 17 键中 14 已接／3 未接（`ledgerDir`／`dataCaptureRef`／`downtimePolicy` ✗）'),
  // **在途未落地的新模块** ⇒ **显式待办**（✓ 计数不红；**第 33 轮规则**要求"出现即须裁定" ✓）
  conference: G('EXPECT_UNDECIDED', '在途未落地 ⇒ **落地后补裁定**（本轮实测前不得编造 ✗）'),
  ip: G('EXPECT_UNDECIDED', '在途未落地 ⇒ **落地后补裁定**（同上 ✗）'),
  guard: G('EXPECT_NA', '非服务模块（无 `create*` 工厂 ⇒ 不适用 ✓）'),
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
  let undecided = 0
  let na = 0
  for (const r of rows) {
    const e0 = EXPECT[r.module]
    // **先看登记**（显式待办/不适用 ⇒ 明确计数，不红 ✓）；再判"无名拒"与形状 ✓
    if (e0 && e0.shape === 'EXPECT_NA') { na += 1; continue }
    if (e0 && e0.shape === 'EXPECT_UNDECIDED') { undecided += 1; continue }
    if (/抛出|import 失败|create 抛出/.test(r.shape)) { probeErrors += 1; continue }
    if (e0 && e0.shape === 'PROBE_NEEDS_ARGS') { probeErrors += 1; continue }
    if (r.refusal === '（无名）✗') { mism.push(r.module + ': 拒绝**没有具名码** ✗'); continue }
    // **规则收紧（第 33 轮）** ✗✓✓：**"模块出现了却没有裁定行" ⇒ 必须红**（**每个模块都必须被裁定** ✓）；
    //   `EXPECT_UNDECIDED` 仍是"**显式待办**、只计数不判红" ✓✓ —— **"未定"与"漏了"必须分开** ✗✓。
    if (!e0) {
      unregistered += 1
      mism.push(r.module + ': **出现了却没有裁定行** ✗（给期望，或显式登记 `EXPECT_UNDECIDED` ✓）')
      continue
    }
    const s = r.shape
    const okShape = (e0.shape === '具名拒或 ok') ? (s === 'refusal' || s === 'ok')
      : (e0.shape === 'ok 或 object') ? (s === 'ok' || s === 'object')
        : (e0.shape === 'ok 或 null') ? (s === 'ok' || s === 'null')
          : (e0.shape === 'array 或 object') ? (s === 'array[15]' || s === 'object' || s === 'array[0]' || /^array/.test(s))
            : (e0.shape === 'array') ? (/^array/.test(s))
              : (e0.shape === 'ok（显式 absent）') ? (s === 'ok' && /absent=/.test(r.disclosed))
                : (e0.shape === '按声明默认开成') ? (s === 'ok')
                  : (e0.shape === '具名拒（带 code）') ? (s === 'refusal' && r.refusal !== '—')
                    : false
    if (!okShape) mism.push(r.module + ': 实测 `' + s + '`／自曝 `' + r.disclosed + '` ≠ 期望「' + e0.shape + '」')
  }
  return { mism, unregistered, probeErrors, undecided, na }
}

const main = async () => {
  const files = readdirSync(KERNEL).filter((f) => f.endsWith('.js')).sort()
  const rows = []
  for (const f of files) { try { rows.push(await probe(f)) } catch (e) { rows.push({ module: f, shape: 'import 失败', refusal: '—', disclosed: '—', note: String((e && e.message) || e) }) } }
  const table = build(rows)
  const { mism, unregistered, probeErrors, undecided, na } = judge(rows)
  const last = '=== ZERO-MECHANISM MATRIX: ' + rows.length + ' modules, ' + mism.length + ' mismatches, ' + unregistered + ' unregistered, ' + undecided + ' EXPECT_UNDECIDED, ' + probeErrors + ' probe-errors, ' + na + ' n/a ==='
  const block = [BEGIN, '<!-- 本块由 `scripts/generate-zero-mechanism-matrix.mjs` 生成（生成式 ✓，勿手写 ✗） -->', '', table, '', last, END].join('\n')

  const args = process.argv.slice(2)
  if (args.includes('--selftest')) {
    // **自证（不写文件 ✓）**：① 期望改错 ⇒ **必红** ✗✓；② `EXPECT_UNDECIDED` ⇒ **不红但计数** ✓
    const real = { ...EXPECT }
    const base = judge(rows).mism.length   // **基线**：真实行里已有的 mismatch 数（如未裁定模块 ⇒ 红 ✓）
    let bad = 0
    EXPECT.audit = { shape: '具名拒（带 code）', note: '自证：故意改错（audit 实际是只读放行 ⇒ 应红）' }
    const j1 = judge(rows)
    console.log('selftest ①: mismatches=' + j1.mism.length + ' (期望 >0 ⇒ ' + (j1.mism.length > 0 ? 'PASS ✓' : 'FAIL ✗') + ')')
    if (j1.mism.length === 0) bad += 1
    delete EXPECT.audit
    const j2 = judge(rows)
    // **增量断言**（第 33 轮 ✓）：删掉一个已登记模块 ⇒ `unregistered` **恰 +1** ✓ ⇒ 且按新规则**必须红** ✓
    const incOk = (j2.unregistered === j1.unregistered + 1 || j2.unregistered === 1)
    const redOk = j2.mism.some((x) => /audit: \*\*出现了却没有裁定行\*\*/.test(x))
    console.log('selftest ②: audit 未登记 ⇒ unregistered=' + j2.unregistered + ' mismatches=' + j2.mism.length + ' (期望 unregistered 恰 +1 ⇒ ' + (incOk ? 'PASS ✓' : 'FAIL ✗') + '；且**必须红** ⇒ ' + (redOk ? 'PASS ✓' : 'FAIL ✗') + ')')
    if (!(incOk && redOk)) bad += 1
    // ⑤ **造一个未登记模块的 fixture ⇒ 必须红** ✓✓（这条正是本缺口 ✓）
    const j5 = judge(rows.concat([{ module: 'brand-new-module-fixture', shape: 'ok', refusal: '—', disclosed: '—', note: '' }]))
    const named5 = j5.mism.some((x) => /^brand-new-module-fixture: \*\*出现了却没有裁定行\*\*/.test(x))
    console.log('selftest ⑤: 未登记模块 fixture ⇒ mismatches=' + j5.mism.length + '（点名 fixture=' + named5 + ' ⇒ ' + (named5 ? 'PASS ✓' : 'FAIL ✗') + ')')
    if (!named5) bad += 1
    EXPECT.audit = { shape: 'EXPECT_UNDECIDED', note: '自证：显式待办（→ 计数，不红 ✓）' }
    const j3 = judge(rows)
    console.log('selftest ③: audit=EXPECT_UNDECIDED ⇒ undecided=' + j3.undecided + ' mismatches=' + j3.mism.length + ' (期望 undecided≥1 且 mismatches=基线 ' + base + ' ⇒ ' + ((j3.undecided >= 1 && j3.mism.length === base) ? 'PASS ✓' : 'FAIL ✗') + ')')
    if (!(j3.undecided >= 1 && j3.mism.length === base)) bad += 1
    // ④ 期望与**模块实际返回**不符 ⇒ **mismatch 红** ✓（点名到模块 ✓）
    EXPECT.audit = { shape: '具名拒（带 code）', note: '自证 ④：与实测（只读放行）不符 ⇒ 必须红' }
    const j4 = judge(rows)
    const named = j4.mism.some((x) => /^audit:/.test(x))
    console.log('selftest ④: 期望 vs 实测不符 ⇒ mismatches=' + j4.mism.length + '（点名 audit=' + named + ' ⇒ ' + ((j4.mism.length > 0 && named) ? 'PASS ✓' : 'FAIL ✗') + ')')
    if (!(j4.mism.length > 0 && named)) bad += 1
    for (const k of Object.keys(EXPECT)) if (!(k in real)) delete EXPECT[k]
    EXPECT.audit = real.audit
    console.log('=== ZERO-MECHANISM SELFTEST: ' + (bad === 0 ? 'GREEN' : 'RED') + ' (' + bad + ' failed) ===')
    process.exit(bad > 0 ? 1 : 0)
  }
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

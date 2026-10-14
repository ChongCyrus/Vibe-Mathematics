#!/usr/bin/env node
// vmu 文档一致性 linter（"文档即门禁"的最小可执行版本）
// 位置：**仓库内** `scripts/check-docs.mjs`（handover D-05：此前在仓库外 `_oneoff/vmu/tools/check-docs.mjs`，
// 干净 clone 跑不到；进仓后由 `scripts/preflight.mjs`（T0）第 5 项调用）。
// 用法：node scripts/check-docs.mjs [--json]
// 检查项：
//   D0 卷的两类归属：每个 NN-*.md 必须**恰好**归入"设计卷"或"附录·登记卷"（显式列表 + 断言，不许静默增长）；
//      新增卷必须显式归类，两类都非空，且不得同时出现在两类里
//   D1 编号完整性：00..14 齐全、无缺口、无重复
//   D2 必需头部：**设计卷**（除 00/14）必须有"上位"引用行
//   D3 验收判据：**设计卷**（除 00）必须有"验收"字样（门禁/验收判据）
//   D4 交叉引用：形如 `NN-§…` / `NN 号文档` 的引用，目标文档必须存在
//   D5 章节引用：形如 `NN-§X` 且 X 形如数字/数字.数字 ⇒ 目标文档存在形如 `## X`/`### X` 的标题
//   D6 命名一致：03/12 必须出现 `vibe_vmu_`；不得把 `vibe_v5_` 当"选定命名"（仅允许出现在迁移/兼容/别名字样附近）
//   D7 未核登记：出现"未核"字样的文档必须在 14 号（U1..U7）或自身有"未核项"字样
//   D8 **设计卷**必备结构：状态行（00 除外）＋ 未核项小节
//   D9 仓库安全：文档不得含未标注的盘符绝对路径字面量
//   D10 R↔门禁映射无空缺；D11 公开面登记一致性；D12 命名契约（无第二套前缀）
//   D13 验收判据机器可判定；D14 错误码必须在 03-§8 登记；D15 未核项可追溯
//   D16 文档↔模块公开面一致性（从工厂 return 对象键取面）
// 退出码：0 = 全过；1 = 有问题
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
// Default: the volume set that ships with THIS repository. VMU_DOCS_DIR stays the injectable seam the
// mutant families use, and is resolved against the repository root when it is relative.
const REPO_DIR_DEFAULT = path.resolve(HERE, '..')
const DOCS = process.env.VMU_DOCS_DIR
  ? path.resolve(REPO_DIR_DEFAULT, process.env.VMU_DOCS_DIR)
  : path.join(REPO_DIR_DEFAULT, 'vibe-math-vmu', 'docs')
const json = process.argv.includes('--json')
const files = fs.readdirSync(DOCS).filter((f) => f.endsWith('.md'))
const byNum = new Map()
for (const f of files) {
  const m = /^(\d\d)-/.exec(f)
  if (m) byNum.set(m[1], f)
}
const issues = []
const notes = []
const add = (id, msg) => issues.push({ id, msg })

// D1 编号完整性
for (let i = 0; i <= 14; i++) {
  const k = String(i).padStart(2, '0')
  if (!byNum.has(k)) add('D1', '缺少文档 ' + k)
}
// The design set GROWS (00 §3.1 allows volumes 15+), so the guard is a FLOOR plus CONTIGUITY from 00, never an
// equality: the equality is what forced a growing design set into exactly fifteen files (the in-repo audit had
// the same flaw and was changed the same way).
if (byNum.size < 15) add('D1', '编号数量=' + byNum.size + '（少于核心 15 卷）')
{
  const nums = [...byNum.keys()].map(Number).sort((a, b) => a - b)
  if (!nums.every((n, i) => n === i)) add('D1', '编号不连续（应从 00 起无跳号）: ' + nums.join(','))
}
for (const f of files) if (!/^\d\d-/.test(f)) add('D1', '文件名不符合 NN- 约定: ' + f)

const texts = new Map()
for (const [k, f] of byNum) texts.set(k, fs.readFileSync(path.join(DOCS, f), 'utf8'))

// ── D0 卷的两类归属（Round 2 · Lead 的 D 项）────────────────────────────────────────────────────
// 设计集已长成两类卷，它们的义务不同：
//   · **设计卷**（design）：**定义能力**的卷 —— 必须带 上位 / 状态 / 验收 / 未核项，且未核项小节要指向 14 的编号登记；
//   · **附录·登记卷**（appendix/registry）：**记录**用的卷（历史、被降级域、containment、目录形态、未决台账、roadmap）——
//     它仍然必须是"卷"（存在、与编号连续、非平凡），但"设计结构"那几条**不描述它**：强套只会永远红，
//     或者逼出没有意义的样板头（这正是它们此前红着的原因）。
// 归属**必须被断言、不许静默**：盘上每个 `NN-*.md` 必须**恰好**落在一类里。新卷不能"自动落进"某一类而不被看见——
// 这正是 Lead 要求的"不许静默增长"。D2/D3/D8/D15 只对**设计卷**生效；D1/D4/D5/D9… 仍对**全部**卷生效。
const DESIGN_VOLUMES = ['00', '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13',
  '15', '16', '17', '18', '19', '20', '21', '22']
const APPENDIX_VOLUMES = ['14', '23', '24', '25', '26', '27', '28']
{
  const dup = DESIGN_VOLUMES.filter((k) => APPENDIX_VOLUMES.includes(k))
  if (dup.length) add('D0', '同一个编号同时出现在两类里: ' + dup.join(','))
  const unclassified = [...byNum.keys()].filter((k) => !DESIGN_VOLUMES.includes(k) && !APPENDIX_VOLUMES.includes(k))
  if (unclassified.length) add('D0', '这些卷没有归类（新卷必须显式归入"设计卷"或"附录·登记卷"）: ' + unclassified.join(','))
  const phantom = [...DESIGN_VOLUMES, ...APPENDIX_VOLUMES].filter((k) => !byNum.has(k))
  if (phantom.length) add('D0', '分类表里点名了盘上不存在的卷: ' + phantom.join(','))
  if (DESIGN_VOLUMES.length === 0 || APPENDIX_VOLUMES.length === 0) add('D0', '两类都必须非空，否则"分类"退化成"全都不查"')
}
const DESIGN = new Set(DESIGN_VOLUMES)

// D2 必需头部（**只对设计卷**）
for (const [k, t] of texts) {
  if (!DESIGN.has(k)) continue
  if (k === '00' || k === '14') continue
  if (!/^> 上位/m.test(t)) add('D2', k + ' 缺少 "> 上位" 行')
}

// D3 验收判据（**只对设计卷**）
for (const [k, t] of texts) {
  if (!DESIGN.has(k)) continue
  if (k === '00') continue
  if (!/验收/.test(t)) add('D3', k + ' 全文没有"验收"字样（缺验收判据）')
}

// D4/D5 交叉引用 ＋ **文件名引用**（独立批评者第 5 轮：16 卷曾引用 `06-prompting.md` / `07-archival.md` /
// `08-meetings.md`，三个文件都不存在，而 D4/D5 只看 `NN-§` 编号 ⇒ 悬空文件名整类漏网 ✗）。判据是"该文件名
// 必须真实存在于**已知文档树**"（设计卷 ＋ 仓库内 md ＋ 仓库外的侦察文档 ✓），而不是"必须等于同号设计卷"
// —— 后者会把对 `_oneoff/vmu/design/*.md` 的合法引用误判为悬空 ✗。
const KNOWN_MD = new Set()
const scanMd = (d, n) => {
  if (n > 4) return
  let ents = []
  try { ents = fs.readdirSync(d, { withFileTypes: true }) } catch { return }
  for (const e of ents) {
    if (e.name === 'node_modules' || e.name === '.git') continue
    const p = path.join(d, e.name)
    if (e.isDirectory()) scanMd(p, n + 1)
    else if (e.name.endsWith('.md')) KNOWN_MD.add(e.name)
  }
}
scanMd(DOCS, 0)
scanMd(path.join(DOCS, '..', '..'), 0)
// The design reconnaissance docs live OUTSIDE the repository, at the WORKSPACE root's `_oneoff/vmu/design`
// (moved there by ruling). The scan is best-effort: absent on a clean clone, and its absence must not redden D4.
scanMd(path.resolve(HERE, '..', '..', '_oneoff', 'vmu', 'design'), 0)
const fileRefRe = /`([0-9]{2}-[A-Za-z0-9-]+\.md)`/g
for (const [k, t] of texts) {
  for (const m of t.matchAll(fileRefRe)) {
    if (!KNOWN_MD.has(m[1])) add('D4', k + ' 引用了找不到的文档文件 ' + m[1])
  }
}

const refRe = /\b(\d\d)-§([\d.]+)/g
const numRefRe = /(\d\d)\s*号文档/g
for (const [k, t] of texts) {
  const seen = new Set()
  for (const m of t.matchAll(refRe)) {
    const target = m[1]
    const sec = m[2]
    const key = target + '-' + sec
    if (seen.has(key)) continue
    seen.add(key)
    if (!texts.has(target)) { add('D4', k + ' 引用了不存在的文档 ' + target + '（' + m[0] + '）'); continue }
    const tt = texts.get(target)
    const re = new RegExp('^#{2,3} ' + sec.replace(/\./g, '\\.') + '(?:\\.|\\s|$)', 'm')
    if (!re.test(tt)) add('D5', k + ' 引用 ' + target + '-§' + sec + '，但 ' + target + ' 里找不到该编号标题')
  }
  for (const m of t.matchAll(numRefRe)) {
    if (!texts.has(m[1])) add('D4', k + ' 引用了不存在的文档编号 ' + m[1])
  }
}

// D6 命名一致
for (const k of ['03', '12']) {
  const t = texts.get(k) || ''
  if (!/vibe_vmu_/.test(t)) add('D6', k + ' 未出现 `vibe_vmu_`（命名契约缺失）')
}
for (const [k, t] of texts) {
  const lines = t.split('\n')
  lines.forEach((ln, i) => {
    if (/vibe_v5_/.test(ln) && !/迁移|兼容|别名|旧|历史|v5r-pack|V5_/.test(ln)) {
      notes.push('D6(提示) ' + k + ':' + (i + 1) + ' 出现 vibe_v5_ 但上下文未标明"旧名/别名/迁移"：' + ln.trim().slice(0, 90))
    }
  })
}

// D7 未核登记
for (const [k, t] of texts) {
  if (k === '14' || k === '00') continue
  if (/未核/.test(t) && !/未核项|未核登记|未核（/.test(t)) {
    notes.push('D7(提示) ' + k + ' 使用"未核"但未给出"未核项"小节的字样')
  }
}

// D8 每篇必备结构：状态行（00 除外）＋ 未核项小节（**只对设计卷**）
for (const [k, t] of texts) {
  if (!DESIGN.has(k)) continue
  if (k !== '00' && !/^> 状态/m.test(t)) add('D8', k + ' 缺少 "> 状态" 行')
  if (k !== '00' && k !== '14' && !/^#{2,3} .*未核项/m.test(t)) add('D8', k + ' 缺少"未核项"小节')
}

// D9 仓库安全：文档不得含盘符绝对路径字面量（仓库门禁 audit-path-discipline 风险）
for (const [k, t] of texts) {
  const lines = t.split('\n')
  lines.forEach((ln, i) => {
    if (/[A-Za-z]:\\\\/.test(ln) || /[A-Za-z]:\\[^\\]/.test(ln)) {
      // 允许出现在"_oneoff/…（仓库外）"说明里的引用，但需显式标注
      if (!/仓库外|_oneoff|本机|实测|旧副本|不可再用/.test(ln)) {
        add('D9', k + ':' + (i + 1) + ' 含盘符绝对路径且未标注"仓库外/实测"：' + ln.trim().slice(0, 90))
      }
    }
  })
}

// D10 R↔门禁映射无空缺：01 里出现的 R\bN\b 必须都在 11 号里出现
{
  const phil = texts.get('01') || ''
  const gates = texts.get('11') || ''
  const rs = new Set()
  for (const m of phil.matchAll(/\bR(\d{1,2})\b/g)) rs.add('R' + m[1])
  const missing = [...rs].filter((r) => !new RegExp('\\*\\*' + r + '\\*\\*|\\b' + r + '\\b').test(gates))
  if (missing.length) add('D10', '11 号文档缺少这些要求的门禁映射: ' + missing.sort().join(','))
  if (rs.size < 15) notes.push('D10(提示) 01 号只提到 ' + rs.size + ' 条 R 要求（期望 ≥15）')
}

// D11 公开面登记一致性：03 里登记的服务键应在至少 1 篇其它文档出现
{
  const c = texts.get('03') || ''
  const svc = new Set()
  for (const m of c.matchAll(/`vmu\.[a-zA-Z]+`/g)) svc.add(m[0].replace(/`/g, ''))
  const others = [...texts.entries()].filter(([k]) => k !== '03').map(([, t]) => t).join('\n')
  const orphan = [...svc].filter((s) => others.indexOf(s) === -1)
  if (orphan.length) notes.push('D11(提示) 03 登记但其它文档从未提及的服务: ' + orphan.join(','))
}

// D12 命名契约：不得出现第二套前缀（vibe_v5_/vibe_v4_… 仅允许在迁移/兼容/别名语境）
{
  const bad = []
  for (const [k, t] of texts) {
    t.split('\n').forEach((ln, i) => {
      if (/vibe_v[234]_/.test(ln) && !/迁移|兼容|别名|旧|历史|v5r-pack/.test(ln)) bad.push(k + ':' + (i + 1))
    })
  }
  if (bad.length) add('D12', '出现非 vmu 命名且未标注迁移语境: ' + bad.slice(0, 6).join(', '))
}

// D13 验收判据必须机器可判定：验收小节里要有 ≥2 个可判定词
for (const [k, t] of texts) {
  if (k === '00') continue
  const idx = t.search(/^#{2,3} .*(?:验收|门禁)/m)
  if (idx === -1) continue
  const tail = t.slice(idx)
  const marks = ['红', '断言', '场景', '具名']
  const hit = marks.filter((m) => tail.indexOf(m) !== -1).length
  if (hit < 2) add('D13', k + ' 的验收小节机器可判定词不足（需 ≥2：红/断言/场景/具名）')
}

// D14 文档中出现、但未在 03-§8 登记的错误码
{
  const reg = texts.get('03') || ''
  const codes = new Set()
  for (const [, t] of texts) for (const m of t.matchAll(/\bVMU_[A-Z][A-Z_]*\b/g)) codes.add(m[0])
  // A FAMILY PREFIX (`VMU_ARCHIVE_`, `VMU_LEAN_*`, `VMU_MIGRATE_*`) is prose about a code NAMESPACE, not a claim
  // that a concrete code exists. The in-repo audit already skips these (its isPlaceholder rule), so this linter
  // must use the SAME rule - otherwise the two gates contradict each other on an identical document set, which
  // is exactly what happened once the design volumes started writing families (07/08/13/15).
  const isFamily = (c) => c.endsWith('_')
  const unreg = [...codes].filter((c) => !isFamily(c) && reg.indexOf(c) === -1)
  if (unreg.length) add('D14', '未在 03-§8 登记的错误码: ' + unreg.sort().join(', '))
}

// D15 未核项必须可追溯：设计卷的"未核项"小节需指向 14-§1/§2（编号登记处）
for (const [k, t] of texts) {
  if (!DESIGN.has(k)) continue
  if (k === '00' || k === '14') continue
  const m = t.match(/^#{2,3} .*未核项[\s\S]*$/m)
  if (!m) continue
  if (!/14-§[12]|14 号|U\d|O\d/.test(m[0])) add('D15', k + ' 的"未核项"小节未指向 14-§1/§2 的编号登记')
}

// D16 文档↔模块公开面一致性：03-§2.1 登记的每个服务，其文档方法必须在模块的**返回对象键**里存在。
// 取面方式很重要（实证教训）：从工厂 `return { ... }` 的对象字面量键提取，而不是从内部声明提取，
// 否则"简写暴露"的成员（如 library.fingerprint、prompt.register）会被误报成漂移。
{
  const contract = texts.get('03') || ''
  const MODULES = {
    'vmu.library': 'vibe-math-vmu/kernel/library.js',
    'vmu.members': 'vibe-math-vmu/kernel/members.js',
    'vmu.store': 'vibe-math-vmu/kernel/store.js',
    'vmu.bus': 'vibe-math-vmu/kernel/bus.js',
    'vmu.prompts': 'vibe-math-vmu/kernel/prompt/index.js',
  }
  // DOCS is <repo>/vibe-math-vmu/docs, so the repository root is two levels up.
  const REPO_DIR = path.dirname(path.dirname(DOCS))
  // Heuristic (documented, so its limits are visible): a module file contains several `return { ... }`
  // blocks - receipts, refusals, nested objects. The factory's PUBLIC surface is the block with the most
  // top-level members, so that is the one we keep. A false negative is reported as a NOTE, never as a
  // false FAIL, so the check cannot invent drift.
  const candidateKeys = (src) => {
    const SKIP = ['if', 'for', 'while', 'return', 'const', 'let', 'switch', 'try', 'catch', 'function']
    const blocks = []
    // Two shapes occur in this codebase: `return { ... }` (library, members) and
    // `const theThing = { ... }; return theThing` (store, bus, prompt). Scan both.
    const OPENER = /(?:return |(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*)\{/g
    let hit
    while ((hit = OPENER.exec(src)) !== null) {
      const i = hit.index + hit[0].length - 1
      let depth = 0, j = i, end = -1
      const start = i + 1
      for (; j < src.length; j++) {
        if (src[j] === '{') depth++
        else if (src[j] === '}') { depth--; if (depth === 0) { end = j; break } }
      }
      if (end === -1) continue
      const keys = new Set()
      let methods = 0
      let d = 0
      for (const line of src.slice(start, end).split('\n')) {
        if (d === 0) {
          const t = line.trim()
          const m = /^(?:async\s+)?(?:get\s+|set\s+)?([A-Za-z_$][\w$]*)\s*[(,:]/.exec(t)
          if (m && !SKIP.includes(m[1])) keys.add(m[1])
          if (/^(?:async\s+)?[A-Za-z_$][\w$]*\s*\([^)]*\)\s*\{/.test(t)) methods++
        }
        d += (line.match(/[{([]/g) || []).length - (line.match(/[})\]]/g) || []).length
      }
      blocks.push({ keys, methods })
    }
    blocks.sort((a, b) => (b.methods - a.methods) || (b.keys.size - a.keys.size))
    return (blocks[0] && blocks[0].keys) || new Set()
  }
  const publicKeys = candidateKeys
  for (const [svc, rel] of Object.entries(MODULES)) {
    // §2 (services table) comes FIRST and §2.1 (signature table) LATER: take the LAST matching row, so
    // the comparison is against the signature table that carries the implemented parameters.
    const rows = [...contract.matchAll(new RegExp('^\\| `' + svc.replace('.', '\\.') + '`.*$', 'gm'))]
    const row = rows.length ? rows[rows.length - 1] : null
    if (!row) continue // not yet registered as implemented: nothing to compare
    if (row[0].indexOf('待实现') !== -1) continue
    let src
    try { src = fs.readFileSync(path.join(REPO_DIR, rel), 'utf8') } catch { add('D16', svc + ': module not found: ' + rel); continue }
    const impl = publicKeys(src)
    const DOC_SKIP = ['async', 'await', 'if', 'for', 'while', 'return', 'function', 'new', 'typeof']
    const documented = new Set([...row[0].matchAll(/`?([a-zA-Z][a-zA-Z0-9]*)\(/g)]
      .map((m) => m[1]).filter((n) => !DOC_SKIP.includes(n)))
    const docOnly = [...documented].filter((d) => !impl.has(d))
    if (docOnly.length) add('D16', svc + ' documents methods the module does not expose: ' + docOnly.join(', '))
    // Read-only GETTERS are observability surfaces, documented in prose rather than as callable methods,
    // so they are excluded from the "not listed yet" note instead of producing noise on every run.
    const implOnly = [...impl].filter((i) => !documented.has(i) && !['status', 'ok', 'root', 'file', 'dir'].includes(i))
    if (implOnly.length) notes.push('D16(提示) ' + svc + ' exposes methods the contract does not list yet: ' + implOnly.join(', '))
  }
}

const out = { docs: files.length, issues, notes }
if (json) console.log(JSON.stringify(out, null, 2))
else {
  console.log('vmu doc-lint: docs=' + files.length + '  issues=' + issues.length + '  notes=' + notes.length)
  for (const i of issues) console.log('  FAIL [' + i.id + '] ' + i.msg)
  for (const n of notes) console.log('  note ' + n)
  console.log(issues.length === 0 ? 'DOC LINT: PASS' : 'DOC LINT: FAIL')
}
process.exit(issues.length === 0 ? 0 : 1)

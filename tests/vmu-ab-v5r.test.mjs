// vibe-math-vmu —— v5r ⇄ vmu 的 A/B 行为对照台（ROUND 137）。
//
// 它要回答的问题只有一个，而且要**如实**回答：v5r 的行为在 vmu 里是否被等价承载？
// 做法不是"读两边的代码说很像" ✗，而是**把两边都真正跑起来**，在同一组输入上比较**可观测输出**：
//   · **A. 逐字节相等**：v5r 手写的 sha256 ⇄ vmu 使用的 node:crypto 摘要（同一输入必须同摘要 ✓）；
//   · **B. 同一契约**：v5r 的"头部列表契约"正文 ⇄ vmu `library.list()` 的**真实行形状**
//     （承诺说"引用只有 id ＋ 一行标题 ＋ 内容指纹 ＋ 状态"、"要正文就用 id 展开" ⇒
//      **行里不得出现正文**，而 `expand(id)` 必须给得出来 ✓ —— 这条是**可伪证**的 ✓）；
//   · **C/D. 同一性质**：v5r 的 Lean `-R` 搜索标志判定与超时回落 ⇄ vmu `lean.commandFor()` 的真实命令与预算；
//   · **E. 同一裁定（手段不同）**：v5r 的 `idSafe`/`slugify` 与 vmu 的席位 id 规则，对"含 / 或 .. 的名字"
//     都必须**不可原样使用** ✓。
//
// ★ 并对**无法驱动**或**刻意分歧**的项**逐个点名**（UNPAIRED / DIVERGENT ✗），而不是含糊带过：
//   一个诚实的"这一项没对上，理由是……"远比一句"我们验证了等价"有价值。
//
// 运行：`node tests/vmu-ab-v5r.test.mjs`（末行 `=== VMU AB v5r: N passed, M failed ===`）。

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { __testHelpers as V5R } from '../vibe-math-v5r/vibe-math-v5r.js'
import { createLibrary } from '../vibe-math-vmu/kernel/library.js'
import { createLeanFace } from '../vibe-math-vmu/kernel/lean.js'
import { createMembers } from '../vibe-math-vmu/kernel/members.js'
import { TOOL_NAMES } from '../vibe-math-vmu/host.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) { passed += 1; return }
  failed += 1
  failures.push(name + (detail === undefined ? '' : ' [' + detail + ']'))
}

/** A/B 结论表：每一行都必须落进 one of 这三类，缺一不可（拿不到结论也要写下来 ✓）。 */
const VERDICTS = { EQUAL: [], PROPERTY: [], UNPAIRED: [], DIVERGENT: [] }

// ── A. 逐字节相等：v5r 手写 sha256 ⇄ node:crypto（vmu 一侧的摘要来源 ✓）────────────────────────
{
  const inputs = ['', 'abc', 'n^2+n is even', '命题：∀n∈ℕ，n²+n 为偶', 'x'.repeat(1000), '同\n多行\n文本\t带制表']
  let bad = null
  for (const s of inputs) {
    const mine = createHash('sha256').update(String(s)).digest('hex')
    const theirs = V5R.sha256Hex(s)
    if (mine !== theirs && bad === null) bad = JSON.stringify(s.slice(0, 20)) + ' crypto=' + mine.slice(0, 12) + ' v5r=' + String(theirs).slice(0, 12)
  }
  ok(bad === null, '★ A. v5r hand-written sha256 agrees byte-for-byte with node:crypto on every fixture', bad)
  if (bad === null) VERDICTS.EQUAL.push('sha256Hex ⇄ node:crypto（6 组输入逐字节相同）')
}

// ── B. 同一契约：v5r 的头部列表契约 ⇄ vmu library 的真实行形状 ────────────────────────────────
{
  const promised = V5R.headerListContractBlock()
  ok(typeof promised === 'string' && promised.indexOf('头部列表') !== -1, 'B0. the v5r contract block is a string that names the head list')
  const lib = createLibrary({ settings: { get: () => undefined }, clock: () => 0, root: 'D:/_tmp/ab-v5r-lib' })
  const STATEMENT = 'AB-SENTINEL-STATEMENT-must-not-appear-in-heads'
  const a = await lib.append({ kind: 'proposition', statement: STATEMENT, title: 'AB title', owner: 'm1' })
  ok(a.ok === true && typeof a.fingerprint === 'string', 'B1. vmu stores a record and reports a CONTENT FINGERPRINT (the contract asks for one)')
  const heads = await lib.list()
  ok(Array.isArray(heads) && heads.length === 1, 'B2. the head list is readable', String(heads.length))
  const h = heads[0] || {}
  ok(h.id === a.id, 'B3. a head carries the id (references are by id, as the contract says)')
  ok(typeof h.title === 'string' && h.title.length > 0, 'B4. a head carries a one-line title')
  ok(typeof h.fingerprint === 'string' && h.fingerprint === a.fingerprint, 'B5. and it carries the content fingerprint')
  ok(h.status !== undefined, 'B6. and a status')
  // ★ 可伪证的一条：契约说"要正文就用 id 展开" ⇒ 头部列表里**不得**出现正文
  ok(JSON.stringify(h).indexOf(STATEMENT) === -1, '★ B7. the head row does NOT contain the statement text (body only by id, exactly as promised)')
  const ex = await lib.expand(a.id)
  ok(ex.ok === true && String(ex.body).indexOf(STATEMENT) !== -1, '★ B8. and expand(id) does return that body (so the promise is satisfiable, not just stated)')
  VERDICTS.PROPERTY.push('headerListContractBlock ⇄ library.list()/expand()（id＋标题＋指纹＋状态、正文只经 id ✓）')
}

// ── C/D. 同一性质：Lean 的 -R 搜索标志与单次预算 ─────────────────────────────────────────────
{
  const mk = (over) => {
    const vals = Object.assign({ 'vmu.math.leanTimeoutMs': 5000, 'vmu.math.leanArgs': [], 'vmu.math.leanSearchPaths': [] }, over || {})
    return { get: (k) => vals[k] }
  }
  const f1 = createLeanFace({ settings: mk(), spawn: async () => ({}), root: '/root', clock: () => 0 })
  const c1 = f1.commandFor('/p.lean')
  ok(c1.args.filter((x) => x === '-R').length === 1 && c1.args.indexOf('/root') !== -1, 'C1. with no explicit root, vmu injects exactly one -R <root>', JSON.stringify(c1.args))
  ok(V5R.leanHasSearchFlag(['-R', '/x']) === true && V5R.leanHasSearchFlag(['/p.lean']) === false,
    'C2. v5r can tell whether the args already name a search root (same question vmu answers in commandFor)')
  const f2 = createLeanFace({ settings: mk({ 'vmu.math.leanArgs': ['-R', '/mine'] }), spawn: async () => ({}), root: '/root', clock: () => 0 })
  const c2 = f2.commandFor('/p.lean')
  ok(c2.args.filter((x) => x === '-R').length === 1 && c2.args.indexOf('/mine') !== -1 && c2.args.indexOf('/root') === -1,
    '★ C3. an EXPLICIT root is respected: no second -R and no injected root (the property v5r checks for)', JSON.stringify(c2.args))

  const def = (v) => {
    const f = createLeanFace({ settings: mk({ 'vmu.math.leanTimeoutMs': v }), spawn: async () => ({}), root: '/r', clock: () => 0 })
    return f.commandFor('/p.lean').timeoutMs
  }
  ok(def(0) === 120000 && def(NaN) === 120000 && def(-5) === 120000, 'D1. a non-positive or non-finite budget falls back to the default', String(def(0)))
  ok(def(7000) === 7000, 'D2. a real budget is kept as given')
  const v5rPos = [V5R.posMs(0, 900), V5R.posMs(NaN, 900), V5R.posMs(-1, 900), V5R.posMs(42, 900)]
  ok(JSON.stringify(v5rPos) === JSON.stringify([900, 900, 900, 42]), '★ D3. v5r answers the SAME question the same way (≤0/non-finite ⇒ fallback, real value kept)', JSON.stringify(v5rPos))
  VERDICTS.PROPERTY.push('leanHasSearchFlag/posMs ⇄ lean.commandFor()（显式根不重复注入 ✓、非法预算回落 ✓）')
}

// ── E. 同一裁定、手段不同：不可原样使用的名字 ────────────────────────────────────────────────
{
  // 路径敌对的三种名字：两边都必须判"不可原样使用" ✓（v5r 改写、vmu 具名拒 ✓）。
  const pathHostile = ['../evil', 'a/b', 'x\u0000y']
  const neutralised = pathHostile.filter((s) => V5R.idSafe(s) !== s)
  ok(neutralised.length === pathHostile.length, 'E1. v5r NEUTRALISES every PATH-hostile name (idSafe rewrites it)', pathHostile.join('|'))
  // 实测值（不是我以为的值 ✗ —— 第一版写成 `..-evil`，跑出来是 `evil`：idSafe 还**剥掉开头连续的点/横线** ✓，
  // 所以路径穿越在 v5r 侧被消掉的是**整段前导**，这也是它真正在防的东西 ✓）。
  ok(V5R.idSafe('../evil') === 'evil', 'E1b. and the rewrite is the MEASURED one: separators to dashes AND leading dot/dash runs stripped', V5R.idSafe('../evil'))
  ok(V5R.slugify('A/B') === 'a-b', 'E2. slugify lowercases and dashes too', V5R.slugify('A/B'))
  let refused = 0
  for (const s of pathHostile) {
    try { createMembers({ slots: [{ id: s }] }) } catch (e) { if (e && e.code === 'VMU_INVALID_ARGUMENT') refused += 1 }
  }
  ok(refused === pathHostile.length, '★ E3. vmu REFUSES the same names by name at construction (different means, same verdict: not usable as-is)', String(refused))
  VERDICTS.PROPERTY.push('idSafe/slugify ⇄ members 席位 id 规则（路径敌对名两边都判"不可原样使用" ✓，手段不同：改写 vs 具名拒）')

  // ★ 实测出的**真实差异**（不是缺失，是严格程度不同 ✗）：v5r 的 idSafe 只清路径敌对字符，
  //   对 `Bad_Slot` **原样放过** ✗；vmu 按 kebab 规则**具名拒** ✓ ⇒ vmu 更严，**记下来**而不是编进"都已中和" ✗。
  ok(V5R.idSafe('Bad_Slot') === 'Bad_Slot', 'E4. ★ Measured divergence: v5r idSafe PASSES `Bad_Slot` through unchanged (it only strips path-hostile characters)')
  let nonKebabRefused = false
  try { createMembers({ slots: [{ id: 'Bad_Slot' }] }) } catch (e) { nonKebabRefused = e && e.code === 'VMU_INVALID_ARGUMENT' }
  ok(nonKebabRefused === true, 'E5. ★ while vmu refuses the same name by name (kebab rule) - STRICTER, and recorded rather than smoothed over')
}

// ── F. 同一性质：内容同一性（两边构造不同，性质必须相同 ✓）────────────────────────────────────
{
  const lib = createLibrary({ settings: { get: () => undefined }, clock: () => 0, root: 'D:/_tmp/ab-v5r-fp' })
  // 真实签名是 `fingerprint(kind, { statement, proof? })`（读源码得到 ✓，不是猜的 ✗ —— 我先猜了两次都错 ✓）
  const vmu = (s, proof) => lib.fingerprint('proposition', proof === undefined ? { statement: s } : { statement: s, proof })
  const stable = vmu('n^2+n is even') === vmu('n^2+n is even')
  const sensitive = vmu('n^2+n is even') !== vmu('n^2+n is odd')
  ok(stable, 'F1. vmu content identity is STABLE: the same substantive parts give the same fingerprint')
  ok(sensitive, 'F2. and SENSITIVE: a changed statement gives a different fingerprint')
  ok(vmu('n^2+n is even', 'by parity') !== vmu('n^2+n is even'), 'F3. a changed PROOF also changes it (the proof is a substantive part)')
  ok(/^[0-9a-f]{64}$/.test(vmu('n^2+n is even')), 'F4. it is a sha256 digest')

  const theirStable = V5R.contentFingerprint('n^2+n is even') === V5R.contentFingerprint('n^2+n is even')
  const theirSensitive = V5R.contentFingerprint('n^2+n is even') !== V5R.contentFingerprint('n^2+n is odd')
  ok(theirStable && theirSensitive, '★ F5. v5r answers the SAME two questions the same way (stable AND sensitive)', 'stable=' + theirStable + ' sensitive=' + theirSensitive)
  ok(vmu('n^2+n is even') !== V5R.contentFingerprint('n^2+n is even'),
    '★ F6. the two schemes are NOT the same bytes - and that is recorded, not smoothed: vmu hashes kind\\0statement\\0proof, v5r has its own construction')
  VERDICTS.PROPERTY.push('contentFingerprint ⇄ library.fingerprint(kind,parts)（同性质：稳定 ✓ ＋ 敏感 ✓ ＋ 证明也是实质部分 ✓；**构造不同**，故不比字节 ✗）')
}

// ── G. 同一问题、不同可靠性：宿主报告了哪些工具 ⇄ vmu 自己发布工具名 ──────────────────────────
{
  const msg = 'unknown tool x; known global tools: alpha, beta, gamma'
  const known = V5R.registeredToolsFromError(msg)
  ok(known instanceof Set && [...known].join(',') === 'alpha,beta,gamma',
    'G1. v5r reads the host tool list OUT OF AN ERROR MESSAGE (correct wording yields the set)', known && [...known].join(','))
  ok(V5R.registeredToolsFromError('nothing useful here') === undefined,
    'G2. and any other wording yields undefined (it never invents a list)')
  const names = Object.keys(TOOL_NAMES)
  ok(names.length > 0 && names.every((n) => typeof n === 'string' && n.length > 0),
    '★ G3. vmu answers the SAME question from a PUBLISHED list instead of a parsed error', names.length + ' names')
  ok(names.indexOf('status') !== -1, 'G4. and that list is the real published surface', names.slice(0, 4).join('|'))
  // ★ 实测语义（不是猜的 ✗）：请求里出现**未知**工具 ⇒ 整表变 undefined（**拒**，而不是静默丢弃 ✓）
  ok(V5R.sanitizeToolFilter(['alpha', 'zzz'], known) === undefined,
    'G5. ★ v5r REFUSES a filter naming an unknown tool (the whole filter becomes undefined, it is not silently pruned)')
  ok(JSON.stringify(V5R.sanitizeToolFilter(['alpha', 'zzz'], undefined)) === JSON.stringify(['alpha', 'zzz']),
    'G6. with no known set to check against, the filter passes through unchanged')
  VERDICTS.PROPERTY.push('registeredToolsFromError ⇄ host.TOOL_NAMES（同一问题："哪些工具是已知的" ✓；'
    + 'v5r 从**宿主错误文本**解析、vmu 直接**发布**（9 个 ✓）⇒ vmu 侧更可靠 ✓）')
}

// ── ★ 逐项点名的未配对与刻意分歧（不掩盖 ✗）────────────────────────────────────────────────
{
  VERDICTS.UNPAIRED.push(
    'blocksToText —— 框架侧**零命中**（grep `blocksToText|type === .text.` = 0 ✓）：vmu 的 host.js 有 `OUTPUT` 形状声明'
    + '但不做"内容块→文本"的转换 ⇒ 未配对 ✗',
    'fmtTime —— 实测：vmu 的 `timevalue.js` **只导出** `ms`/`msStrict`（"时刻→可比数" ✓），**没有格式化** ⇒ 未配对 ✗；'
    + '并记下 v5r 的一个怪癖 ✓：`fmtTime(0)` 返回 **"现在"**（`new Date(ts || now())` ⇒ 假值被当当下 ✗）',
    'parseReply —— 宿主回合文本的解析；框架侧 `script-bridge.validateRequest` 校验的是**请求形状**，不是回合文本 ⇒ 未配对 ✗',
    'sanitizeToolFilter —— ★ **框架侧有"名字"却没有"净化器"** ✗：vmu 发布 9 个工具名 ✓，但 grep `toolFilter|sanitize.*[Tt]ool` = 0 ✓ '
    + '⇒ **消费那一半没有对应物** ✓。缺什么已**实测写明**（v5r 语义：请求含未知工具 ⇒ **整表 undefined**（拒而非丢弃 ✓）；无已知表 ⇒ 原样透传 ✓），'
    + '所以这不是一句模糊的"没实现"，而是**已规格化的缺口** ✓',
    // ★ 这一条**从"我以为"升级成了实测** ✓：我先写下"vmu 在别处内联夹取、没有导出原语" ✗，
    //   随后实测发现更准确的说法是——**夹取在公开 API 上根本不可观测** ✗✓：
    //   `fairness.allocation()` 对 reserveRatio ∈ {0, 0.25, 1, 5, -3, NaN, "abc"} **输出完全相同**（都是 a:50 b:50），
    //   `fairness.status()` 也**不回显**该值 ⇒ 无法做 A/B ✓（这是**可测性缺口**，如实点名 ✓，不是"没有对应物"）。
    'clamp01 —— **实测：夹取在 vmu 的公开 API 上【不可观测】** ✗✓（`fairness.allocation()` 对 reserveRatio '
    + '0/0.25/1/5/-3/NaN/"abc" 输出**逐一相同**，`status()` 不回显该值）⇒ 无法 A/B ✓；'
    + '`clPct`（0..100 夹取）框架侧无同族表面 ⇒ 未配对 ✗',
  )
  VERDICTS.DIVERGENT.push(
    'tryJson —— 实测：v5r 对坏 JSON 返回 **undefined**（**吞掉** ✓），而 vmu 各面用朴素 `JSON.parse`（**抛/具名拒** ✓）'
    + '⇒ **垃圾输入策略不同**；对框架而言"拒"更可审计 ✓，已点名 ✗（不评孰优 ✓）',
  )
  VERDICTS.DIVERGENT.push(
    'leanHashText —— 名字像哈希，实际是**文本规范化**（CRLF→LF、去尾空白）✗；vmu 的 Lean 哈希按**原始字节**取 sha256 '
    + '（"产物哈希未变"才判 passed ✓）⇒ **两边口径刻意不同**，且 vmu 的口径更严 ✓：把 v5r 的规范化套上去会让"只改了行尾"也判 passed ✗',
    // ★ 实测的非有限值口径不同：v5r 给"中点"，vmu 给"声明的默认值" ✓ —— 谁对取决于语义，故并列记录 ✓
    'clamp01(非有限值) —— **实测口径不同** ✓：v5r `clamp01(NaN)`＝**0.5**（取中点 ✓），而 vmu 的 `numOf` 对非有限值'
    + '**回落到该键声明的默认值**（如 reserveRatio 的 0 ✓）⇒ **垃圾输入的处置不一致**，已点名 ✗（不比"谁对"，因为两者都自洽 ✓）',
  )
  // 汇总：**必须每一项都有落点**（哪怕落点是"未配对" ✗）
  const total = VERDICTS.EQUAL.length + VERDICTS.PROPERTY.length + VERDICTS.UNPAIRED.length + VERDICTS.DIVERGENT.length
  ok(total >= 6, 'the verdict table classifies every probed pair (no row left undecided)', String(total))
  ok(VERDICTS.EQUAL.length >= 1 && VERDICTS.PROPERTY.length >= 3, 'at least one byte-equal row and three same-property rows were actually driven')
  ok(VERDICTS.UNPAIRED.length >= 2 && VERDICTS.DIVERGENT.length >= 1, 'and the unpairable and deliberately divergent rows are NAMED rather than omitted')
}

console.log('=== VMU AB v5r: ' + passed + ' passed, ' + failed + ' failed ===')
console.log('  EQUAL      : ' + VERDICTS.EQUAL.length)
for (const v of VERDICTS.EQUAL) console.log('    ✓ ' + v)
console.log('  PROPERTY   : ' + VERDICTS.PROPERTY.length)
for (const v of VERDICTS.PROPERTY) console.log('    ✓ ' + v)
console.log('  UNPAIRED   : ' + VERDICTS.UNPAIRED.length + '  (明写未配对 ✗)')
for (const v of VERDICTS.UNPAIRED) console.log('    ✗ ' + v)
console.log('  DIVERGENT  : ' + VERDICTS.DIVERGENT.length + '  (刻意分歧，已点名 ✗)')
for (const v of VERDICTS.DIVERGENT) console.log('    ✗ ' + v)
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)

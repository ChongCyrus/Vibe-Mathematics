/**
 * RUN 247 — 提示词不再逐条复述 tools 数组（去重守门）
 *
 * THE DEFECT CLASS THIS PINS. `fixtureMode: 'tools'` 的提示词里，同一份信息被说两遍：
 *   · 每轮 tools 数组本来就带 name + description + parameters（`vibe_v5_record_proposition` 的
 *     statement/value/motive/p 是否必填，由这份 schema 说，且与本轮真正挂载的工具一致）；
 *   · 用户提示词却又抄了一遍「工具目录 + 参数表 + 用法说明」：`v5r-tools-academician` 曾点名 56 个工具、
 *     逐条写「—— 写命题卡（statement/value/motive/p 必填…）」，turn 段还抄了 `vibe_v5_record_progress
 *     {member,track,content,…}`、`vibe_v5_poll_open { question, options: [≥2 个] }`、`vibe_v5_hire
 *     { purpose, initial_task, to }`、`vibe_v5_meeting { type, agenda, at?, … }` 这类调用签名；
 *   · 回执样例「可直接照抄」在三个角色段 + fixture-tools 段各印一遍。
 * 重复的代价不是字数，而是**两份来源会漂移**：tools 数组改了参数，提示词里的旧参数表继续教错形状。
 *
 * WHAT THIS SUITE REQUIRES (machine criterion; rendered text, not source grep):
 *   §1 真装配 3 席 × 4 相位：0 个空 section，chair/normal ≤ RUN 247 实测 26944 ＋ RUN 248 教学 548 ＋ RUN 249 教学
 *      445（=27937：逐条记账，没有余量），三份 normal 合计 ≤ RUN 247 实测 70689 ＋ RUN 248 机制教学预算 2000 ＋
 *      RUN 249 机制教学 1335（=74024：预约/广播/投递可见的时机教学，属 tools 数组之外的内容，见 §1 注释），且三份
 *      normal 里「参数表/调用签名」不回到 prompts（RUN 247 水位）；
 *   §2 三个角色工具段的「目录行」只剩**名字 + 规则**：行形状是 `· name[/name…][ —— 规则]`，不允许出现参数对象；
 *      每条规则行 ≤300 字符；仍有规则行（chair ≥15 / member ≥5 / temp ≥2），不许把规则删光；段字数有上限；
 *   §3 被删掉的参数表/调用签名/照抄样例，在**整份装配文本**里一次都不再出现；
 *   §4 fixture-tools 段把「本角色可用的工具」明确定性为职责清单，并指向宿主每轮装配的
 *      【本轮你实际能调用的工具】（真正的权威来源是 tools 数组 + wire，不是这段散文）；
 *   §5 同一次装配内没有未解释的整句重复（analyzeSections 的 assemblyDups）。
 *
 * 断言的是 RUN 247 之后的形状，不是某个具体措辞：把参数表/样例搬回来，或把角色段重新撑大，都会红。
 *
 * Run: node tests/vmu-run247-prompt-dedup.test.mjs
 * Last line: === VMU RUN247 PROMPT DEDUP: N passed, M failed ===
 */
import { dirname, join } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { seatBulletLines } from '../vibe-math-vmu/packs/v5r/seat-faces.js'

// The section analyzer is dev-only tooling under `scripts/sim/` (NOT a shipped module), so it is loaded the way the
// other sim-based suite loads it (`tests/vmu-run241-prompt-budget.test.mjs`): a runtime import by absolute URL. A
// static relative import here would be read by `tests/audit-package-membership.mjs` as a shipped-module reference
// and would fail the package-closure gate for a file that is deliberately not shipped.
const REPO = dirname(dirname(fileURLToPath(import.meta.url)))
const { collect, analyzeSections } = await import(pathToFileURL(join(REPO, 'scripts/sim/audit/prompt-sections.mjs')).href)

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++
  failures.push(label + (detail === undefined ? '' : ' — ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' — ' + JSON.stringify(detail)))
  return false
}
const J = (v) => JSON.stringify(v)

const ROLE = {
  chair: { section: 'v5r-tools-academician', title: '【本角色可用的工具｜院士】', cap: 3600, minRules: 15 },
  member: { section: 'v5r-tools-researcher', title: '【本角色可用的工具｜研究员】', cap: 2100, minRules: 5 },
  temp: { section: 'v5r-tools-temp', title: '【本角色可用的工具｜临时成员】', cap: 1300, minRules: 2 },
}
// 角色目录行的合法形状：名字（可用 / 分组）+ 可选的一段规则。没有参数对象、没有纯描述尾巴。
const BULLET = /^· vibe_[a-z0-9_]+( \/ vibe_[a-z0-9_]+)*( —— .+)?$/
// 调用签名/参数表的形状：`{ param, param`（单个形参或 `{action:` 这种不算）。
const SIGNATURE = /\{ *[a-z_][a-z_0-9.?]* *, *[a-z_]/
// RUN 247 删除的参数表 / 调用签名 / 照抄样例（基线测量里逐条出现过的东西）。
const RETIRED = [
  'vibe_v5_record_progress {member, track',
  'vibe_v5_poll_open { question',
  'vibe_v5_start { problem',
  'vibe_v5_script { op: "archive"',
  '写命题卡（statement/value/motive/p 必填',
  '★★ 回执样例（可直接照抄）',
  '{ type, agenda, at?, sequence?, lateAdmission?, durationMs? }',
  'question, options: [≥2 个]',
]
// 本轮真正做过去重的 section（参数表在这里被删掉；回执样例为语料保真度单独保留在 v5r-reply-compact）。
// v5r-turn-hiring 不在名单里：`vibe_v5_hire { purpose, initial_task, to }` 被 docs/acceptance/rules-ledger.json 的 A9
// 条目引为 evidence（docs 不在 RUN 247 的写域，改台账才能删这行），所以它留在提示词里。
const DEDUPED = [
  'v5r-fixture-tools', 'v5r-turn-tracks', 'v5r-turn-loop-stuck', 'v5r-turn-convene',
  'v5r-turn-scripts', 'v5r-turn-polls', 'v5r-turn-compute', 'v5r-turn-chat-admin',
]

console.log('=== 0. 真装配：3 席 × 4 相位 ===')
const { combos, sections } = await collect()
ok(combos.length === 12, '§0a 装配出 3 席 × 4 相位 = 12 份真提示词', combos.length)
ok(combos.every((c) => c.empty === 0), '§0b ★ 每份装配 0 个空 section（空标题=教了个寂寞）', combos.filter((c) => c.empty !== 0))
ok(sections.length > 500, '§0c 切出的 section 数量合理（真是按渲染文本切的）', sections.length)

const at = (slot, phase, id) => sections.find((s) => s.slot === slot && s.phase === phase && s.sectionId === id)
const charsOf = (slot, phase) => combos.find((c) => c.slot === slot && c.phase === phase).chars

console.log('=== 1. 验收线（RUN 247 的硬指标，锁成回归） ===')
{
  // RUN 247 的验收线（基线 78698 ⇒ ≤70828，降 ≥10%）是**一次实测快照**，它假定「总量只降不升」。RUN 248 往
  // 提示词里加了一类 RUN 247 时还不存在的内容：**内核行为的时机教学**——预约会议何时把耐久行投到哪个块、
  // 主席对全体发言何时推到每个在席者、被邀者要 ack 要 attend 才算数。这不是 tools 数组能给的（数组只说
  // 「有这个工具、这些参数」，不说「谁在什么时候看到哪一行、看到后该做什么」）。把它算成「重复」会让守门
  // 把必需教学当垃圾，所以按 RUN 247 的**真判据**（提示词不得复述 tools 数组已声明的参数表/调用签名）拆成
  // 同口径的两半：
  //   §1b 总量 = 上一轮实测 + 本轮机制教学预算。上一轮实测 = 013b4c65（RUN 247 收敛后的 HEAD，
  //        在本仓 HEAD 镜像上跑同一个 collect() 测得：chair 26944 / member 23200 / temp 20545，合计 70689）；
  //        本轮预算 2000（实测增量 1939：chair +548 / member +1008 / temp +383；余量 61 给同段里补 required
  //        形参这类纠错）。⇒ ≤72689。**这不是把旧阈值抬高**：涨的每一字符都记在「机制教学」这一类里。
  //   §1c 同口径 = 三份 normal 里「参数表/调用签名」的字符与行数必须停在 RUN 247 的水位（HEAD 实测 8 行／
  //        1738 字符／席）——RUN 248 一个字符都没新增复述，将来谁把参数表抄回提示词都会立刻红。
  //   ★ RUN 249（task-71 第 2 项 / task-69 落地后）再涨了一次，同样**逐条记账、不算余量**：`[新到的消息]` 块真的
  //        会渲染（`notices` 的 `lines`/`rendered`/`blockChars` 是回执读数、无未读时块头不出现）、回复正文超
  //        `vmu.turn.replyLimitChars` 只留摘录而全文落 `Members/<你>/Turns/<turn>.md`、`emptyReply` 与工具通道分开
  //        （RUN 251-A 反转了它的含义，见下）。实测增量每席 +445（三席同值，因为这段在 shared 段），合计 +1335 ⇒ 上限
  //        70689 + 2000 + 1335 = 74024，比实测 73963 多 61（与 RUN 248 保持同一份余量，没有新开口子）。
  //   ★ RUN 251 再涨一次，仍逐条记账：`emptyReply` 的语义被 RUN 251-A 反转（只说回复**文本**通道，true＝0 字符，
  //        写了字就是 false；工具通道看 `source`/`fields`/`executed`/`writes`），截断键的唯一权威改名成
  //        `truncated`/`excerptLen`（旧名只留在回合回执）；这一句在 shared 段，三席同值 +198，合计 +594 ⇒
  //        上限 70689 + 2000 + 1356 + 594 = 74639，比实测 74578 多 61（仍与 RUN 248 同一份余量）。
  //   ★ RUN 252-C 再涨一次（F72-10 / F72-2 / F72-6），仍逐条记账：`verdicts` 的元素形状逐字给出（数值键是 `p`，
  //        不是 `vibe_v5_verdict` 的 `verdict`）＝chair 专属 +322；`proof_state`（形参）与 `proofState`（回执/卡体读回）
  //        分名 + 归档 sha 只覆盖正文这两句在 charter/shared 段，三席同值 +151，合计 +775 ⇒ 上限
  //        70689 + 2000 + 1356 + 594 + 775 = 75414，比实测 75353 多 61（仍与 RUN 248 同一份余量）。
  const RUN247 = { chair: 26944, member: 23200, temp: 20545, sum: 70689 }
  const RUN248_TEACHING = { chair: 548, member: 1008, temp: 383, sum: 1939, budget: 2000 }
  const RUN249_TEACHING = { chair: 452, member: 452, temp: 452, sum: 1356 }
  const RUN251_TEACHING = { chair: 198, member: 198, temp: 198, sum: 594 }
  const RUN252_TEACHING = { chair: 473, member: 151, temp: 151, sum: 775 }
  const SIGNATURE = /\{ *[a-z_][a-z_0-9.?]* *, *[a-z_]/
  const signatureRows = (slot) => {
    let lines = 0
    let chars = 0
    for (const r of sections.filter((s) => s.slot === slot && s.phase === 'normal')) {
      for (const l of r.text.split('\n')) if (SIGNATURE.test(l)) { lines += 1; chars += l.length }
    }
    return { lines, chars }
  }
  const chairNormal = charsOf('chair', 'normal')
  const chairCeiling = RUN247.chair + RUN248_TEACHING.chair + RUN249_TEACHING.chair + RUN251_TEACHING.chair + RUN252_TEACHING.chair
  ok(chairNormal <= chairCeiling,
    `§1a ★ chair/normal ≤ ${chairCeiling} 字符（= RUN 247 实测 ${RUN247.chair} ＋ RUN 248 教学 ${RUN248_TEACHING.chair} ＋ RUN 249 教学 ${RUN249_TEACHING.chair} ＋ RUN 251 教学 ${RUN251_TEACHING.chair} ＋ RUN 252 教学 ${RUN252_TEACHING.chair}，逐条记账、无余量）`, chairNormal)
  const sum = charsOf('chair', 'normal') + charsOf('member', 'normal') + charsOf('temp', 'normal')
  const sumCeiling = RUN247.sum + RUN248_TEACHING.budget + RUN249_TEACHING.sum + RUN251_TEACHING.sum + RUN252_TEACHING.sum
  ok(sum <= sumCeiling,
    `§1b ★ 三份 normal 合计 ≤ ${sumCeiling}（RUN 247 实测 ${RUN247.sum} ＋ RUN 248 机制教学预算 ${RUN248_TEACHING.budget} ＋ RUN 249 机制教学 ${RUN249_TEACHING.sum} ＋ RUN 251 机制教学 ${RUN251_TEACHING.sum} ＋ RUN 252 机制教学 ${RUN252_TEACHING.sum}）`, sum)
  for (const seat of ['chair', 'member', 'temp']) {
    const s = signatureRows(seat)
    ok(s.lines <= 8 && s.chars <= 1738,
      `§1c ★ 同口径：${seat}/normal 的参数表/调用签名停在 RUN 247 水位（≤8 行／≤1738 字符），不新增复述`, s)
  }
}

console.log('=== 2. 角色工具段：名字 + 规则，不再复述参数 ===')
for (const seat of ['chair', 'member', 'temp']) {
  const spec = ROLE[seat]
  const row = at(seat, 'normal', spec.section)
  if (!ok(Boolean(row), `§2 ${seat}：角色工具段存在（${spec.section}）`)) continue
  const lines = row.text.split('\n')
  const bullets = lines.filter((l) => l.trim().startsWith('·')).map((l) => l.trim())
  const expected = seatBulletLines(seat).map((l) => String(l).trim()).filter(Boolean)
  ok(expected.length > 0, `§2 ${seat}：期待清单非空（非空守卫：下面的逐行比对才有东西可比）`, expected.length)
  ok(bullets.length === expected.length && J(bullets) === J(expected),
    `§2 ${seat}：目录行与 seatBulletLines 逐行一致（${bullets.length} 行）`, { got: bullets.length, want: expected.length })
  ok(lines[0].trim() === spec.title, `§2 ${seat}：首行是角色标题「${spec.title}」`, lines[0])
  const malformed = bullets.filter((l) => !BULLET.test(l))
  ok(malformed.length === 0, `§2 ${seat}：每条目录行都是「名字 + 可选规则」，没有别的形状`, malformed.slice(0, 3))
  const withParams = bullets.filter((l) => /[{}]/.test(l))
  ok(withParams.length === 0, `§2 ${seat}：目录行里没有参数对象（tools 数组才是参数来源）`, withParams.slice(0, 2))
  const ruleLines = bullets.filter((l) => l.includes(' —— '))
  ok(ruleLines.length >= spec.minRules, `§2 ${seat}：仍保留 ≥${spec.minRules} 条带规则尾巴的目录行（规则没被删光）`, ruleLines.length)
  const tooLong = bullets.filter((l) => l.length > 300)
  ok(tooLong.length === 0, `§2 ${seat}：没有超长目录行（>300 字符＝又把用法/参数写回来了）`, tooLong.map((l) => l.length))
  ok(row.chars <= spec.cap, `§2 ${seat}：角色段 ≤${spec.cap} 字符`, row.chars)
  ok(!row.text.includes('回执样例') && !row.text.includes('回执示例'), `§2 ${seat}：角色段不再重复回执样例（样例只留一处）`)
  ok(row.text.includes('上表是职责说明') && row.text.includes('以【本轮你实际能调用的工具】为准'),
    `§2 ${seat}：角色段声明「实际可调用工具以本轮装配为准」`, null)
}

console.log('=== 3. 被删的参数表 / 调用签名 / 照抄样例不再出现 ===')
ok(RETIRED.length > 0, '§3 退役清单非空（非空守卫：下面的循环才有东西可拒）', RETIRED.length)
for (const r of RETIRED) {
  const hits = sections.filter((s) => s.text.includes(r))
  ok(hits.length === 0, `§3 ★ 全量装配里没有「${r}」`, hits.slice(0, 3).map((s) => s.slot + '/' + s.phase + '/' + s.sectionId))
}

console.log('=== 4. 去重过的 section：不再出现调用签名 ===')
ok(DEDUPED.length > 0, '§4 去重清单非空（非空守卫：下面的循环才有东西可查）', DEDUPED.length)
for (const id of DEDUPED) {
  const rows = sections.filter((s) => s.sectionId === id)
  ok(rows.length > 0, `§4 ${id}：真装配里存在`, rows.length)
  const hits = []
  for (const r of rows) for (const l of r.text.split('\n')) if (SIGNATURE.test(l)) hits.push({ combo: r.slot + '/' + r.phase, line: l.slice(0, 100) })
  ok(hits.length === 0, `§4 ${id}：没有任何 ` + '`{ param, param }`' + ' 参数表行', hits.slice(0, 3))
}

console.log('=== 5. fixture-tools：把权威来源指向每轮 tools 数组 ===')
{
  const row = at('chair', 'normal', 'v5r-fixture-tools')
  ok(Boolean(row), '§5a fixture-tools 段存在')
  if (row) {
    ok(row.text.includes('角色职责清单'), '§5b 明说「本角色可用的工具」是职责清单（不是挂载承诺）')
    ok(row.text.includes('不承诺「本回合已挂载」'), '§5c 明说不承诺本回合已挂载')
    ok(row.text.includes('上表是职责说明'), '§5d 保留「上表是职责说明」这句澄清')
    ok(!row.text.includes('回执示例（可直接照抄）'), '§5e 不再印「可直接照抄」的重复样例')
  }
}

console.log('=== 6. 同一次装配内没有未解释的整句重复 ===')
{
  const a = analyzeSections(sections)
  const unexplained = a.assemblyDups.filter((d) => d.kind === 'unexplained')
  ok(unexplained.length === 0, '§6 ★ assemblyDups 全部有解释（无 unexplained 重复句）', unexplained.slice(0, 3))
  ok(a.timing.filter((t) => t.kind === 'always-empty').length === 0, '§6b 没有 always-empty 的来源', null)
}

console.log('')
if (failed) {
  console.error('FAILURES:')
  for (const f of failures) console.error('  · ' + f)
}
console.log(`=== VMU RUN247 PROMPT DEDUP: ${passed} passed, ${failed} failed ===`)
process.exit(failed ? 1 : 0)

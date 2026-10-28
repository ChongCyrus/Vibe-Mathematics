/**
 * LEDGER TEACHING PINS — the sentences that close the remaining
 * "teaching-side incomplete" rows of docs/acceptance/rules-ledger.json.
 *
 * Each pin is a grep-able literal in the LIVE teaching
 * (vibe-math-vmu/packs/v5r/prompts/*.js; the generated v5r-prompts.js is a
 * historical corpus capture and is deliberately not asserted here). The
 * assertion is literal, so a future rewrite that drops the sentence reds this
 * test instead of silently un-teaching the rule:
 *
 *   F5  定稿主体 = 主席席（即院士），所办不代签        packs/v5r/paper.js finalizerSlot:'chair'
 *   G2  计算并发 = vmu.math.maxParallel（不是唤醒数）   settings/schema.js vmu.math.maxParallel
 *   D3  三通道判据（邮箱/私信 urgent/群聊）             kernel/mailbox.js urgentKinds
 *   E10 hardLimitMs / extendlimit / extend / lapse      kernel/meetings.js hardLimitMs
 *   E29 verdictMaxRounds 只是上限，界内院士决定          kernel/meetings.js:1249-1256
 *   C12 formalVerify 三档 off|encourage|require         settings/schema.js:250
 *   F1  系统梳理  F2 分派与合并  F3 互审（谁审谁/怎么合并）  F4 四项质量要求
 *   E12 命令随类型与身份不同   E13 六种类型（sync 是动议 kind）
 *
 * Run: node tests/vmu-ledger-teaching-pins.test.mjs
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const PROMPTS = resolve(ROOT, 'vibe-math-vmu/packs/v5r/prompts')

let pass = 0
let fail = 0
const ok = (cond, name, extra) => {
  if (cond) { pass += 1; return }
  fail += 1
  console.error('FAIL ' + name + (extra ? ' :: ' + extra : ''))
}
const text = (file) => readFileSync(resolve(PROMPTS, file), 'utf8')

const blocksA = text('v5r-blocks-a.js')
const blocksB = text('v5r-blocks-b.js')
const paper = text('v5r-paper-prompts.js')
const reply = text('v5r-reply-channel.js')

const PIN = (file, src, needle, row) => {
  ok(src.includes(needle), row + ' pin: ' + file + ' contains ' + JSON.stringify(needle))
}

// ── F5: one finaliser, and the office does not sign for it ────────────────────
PIN('v5r-paper-prompts.js', paper, '定稿席位就是院士（即主席席）', 'F5')
ok(paper.includes('不代签'), 'F5 pin: the office only archives / does not sign')
PIN('v5r-blocks-b.js', blocksB, '只有主席席（即院士）可以定稿', 'F5')
ok(!/学术委员会主席席/.test(paper), 'F5: the "学术委员会主席席" wording is gone from the live paper prompts')
ok(!/学术委员会主席席/.test(blocksB), 'F5: the "学术委员会主席席" wording is gone from the live charter blocks')

// ── G2: engine/compute concurrency, not the wake count ───────────────────────
PIN('v5r-blocks-b.js', blocksB, 'vmu.math.maxParallel', 'G2')
ok(blocksB.includes('vmu.turn.maxParallel'), 'G2: the wake-count key is named separately (so the two are not mixed up)')
ok(blocksB.includes('所办可设'), 'G2: the office can set the compute concurrency')

// ── D3: one-line decision rule for the three channels ────────────────────────
PIN('v5r-blocks-b.js', blocksB, '三通道的紧急语义', 'D3')
ok(blocksB.includes('要对方**这一轮就看到**') && blocksB.includes('只留记录'), 'D3 pin: the channel choice rule is executable')
ok(blocksB.includes('urgent: true'), 'D3 pin: urgent is the DM flag')

// ── E10: the duration ceiling and what is extendable ─────────────────────────
PIN('v5r-blocks-b.js', blocksB, 'vmu.meetings.hardLimitMs', 'E10')
ok(blocksB.includes('钳制 300000–7200000'), 'E10 pin: the clamp is stated')
ok(blocksB.includes('`extendlimit`') && blocksB.includes('墙钟上界'), 'E10 pin: extendlimit = wall clock ceiling')
ok(blocksB.includes('`extend` 是**发言延长**') || blocksB.includes('发言延长'), 'E10 pin: extend = speech extension')
ok(blocksB.includes('`lapse`'), 'E10 pin: lapse is named')
ok(blocksB.includes('没有墙钟在走'), 'E10 pin: a not-yet-started scheduled meeting has no wall clock')

// ── E29: the setting is a ceiling, the chair decides inside it ───────────────
PIN('v5r-blocks-a.js', blocksA, '辩论轮数由院士决定', 'E29')
ok(blocksA.includes('VMU_RESOURCE_BUDGET'), 'E29 pin: exceeding the ceiling is refused by name')
ok(!/辩论轮次上限\s*\{\{\s*setting:vmu\.meetings\.verdictMaxRounds\s*\}\}\s*轮[\u3002,，]/.test(blocksA), 'E29: no hard-pinned "round limit = setting" sentence remains')

// ── C12: the encourage switch, three tiers ──────────────────────────────────
PIN('v5r-blocks-b.js', blocksB, 'vmu.math.formalVerify', 'C12')
ok(blocksB.includes('off') && blocksB.includes('encourage') && blocksB.includes('require'), 'C12 pin: all three tiers are named')
ok(blocksB.includes('由**所办**改'), 'C12 pin: the office owns the switch')

// ── F1-F4: the paper phases ─────────────────────────────────────────────────
PIN('v5r-paper-prompts.js', paper, '系统梳理', 'F1')
PIN('v5r-paper-prompts.js', paper, '分工与合并', 'F2')
PIN('v5r-paper-prompts.js', paper, '互审', 'F3')
ok(paper.includes('审完怎么合并'), 'F3 pin: how the reviewed parts are merged')
ok(paper.includes('整篇') || paper.includes('合并成一篇'), 'F3 pin: merge target is the whole paper')
PIN('v5r-paper-prompts.js', paper, '四项质量要求', 'F4')
ok(paper.includes('`qualityGate`') && paper.includes('CITATION_UNKNOWN') && paper.includes('EVIDENCE_MISSING') && paper.includes('VERIFIED_MISSING'),
  'F4 pin: the DELIVERY quality gate is taught by its four named codes (packs/v5r/paper-quality.js QUALITY_CODES)')
ok(!paper.includes('本流程**没有**自动质检门'),
  'F4: the false "there is no quality gate at all" claim is gone (the four reader-facing qualities are human-judged; the delivery gate is mechanical)')

// ── E12/E13: commands follow type + identity; the six real types ────────────
PIN('v5r-blocks-b.js', blocksB, '可用的命令随类型与身份不同', 'E12')
for (const t of ['ordinary', 'academic', 'debate', 'closure', 'paper', 'planning']) {
  ok(blocksB.includes(t), 'E13 pin: meeting type "' + t + '" is listed')
}
ok(blocksB.includes('`sync` 是**动议 kind**'), 'E13 pin: sync is a motion kind, not a meeting type')
ok(blocksB.includes('故意不给推荐骨架'), 'E13 pin: ordinary has no skeleton on purpose')

// ── the envelope division (G6) stays taught ─────────────────────────────────
ok(blocksB.includes('工具做事，回执汇报'), 'G6 pin: tools act, the envelope reports')
ok(!/"(?:meeting_hand|meeting_invite)":\s*(?:true|false|\{)/.test(blocksB), 'G6: no receipt-field instruction for hand/invite remains')

// ── THE LEDGER-TEACHING ROUND (2026-10-28, second pass): four rule lines that had NO teaching,
//    plus the five rows whose evidence used to land in a comment or an unrelated paragraph.
//    Each assert is the sentence the ledger's `prompt` pattern should now point at. ─────────────────
// L10 (rule: 院士、常驻研究员各自的文件) — the temp boundary is taught where the libraries are taught
ok(blocksB.includes('临时工不写这些库'), 'L10 pin: the temp worker does not write the member libraries (seat-faces.js denies record_method/record_subproblem for temp)')
ok(blocksB.includes('产出由指派者归档'), 'L10 pin: the assigner archives a temp worker\'s output')
// L32 (rule: 院士通过命令…决策会议进行中的一切内容、控制、活动) — chair authority is the FALLBACK authority
ok(blocksB.includes('都由你的命令决定'), 'L32 pin: inside a running meeting, the chair\'s commands decide content/control/activity')
ok(blocksB.includes('只是常用手段，不是穷举'), 'L32 pin: the listed verbs are common means, not an exhaustive list')
// L32 (rule: 框架推荐流程骨架…是否遵循完全由院士决定) — the skeleton is ADVISORY, not a gate
ok(blocksB.includes('`procedureNote` 是**建议**'), 'L32 pin: procedure/procedureNote in the open receipt are advice (meeting-procedures.js binding:\'recommendation\')')
ok(blocksB.includes('`binding:"recommendation"`'), 'L32 pin: the advisory binding is cited by name')
// L3 (rule: 临时工…用于特殊任务临时任务) — hiring states a purpose, temp is not a standing seat
ok(blocksB.includes('vibe_v5_hire { purpose, initial_task, to }'), 'L3 pin: hiring requires purpose + initial_task + to')
ok(blocksB.includes('不是常设席位'), 'L3 pin: a temp is for special/temporary tasks, not a standing seat')
// L53 (rule: 并发通知命题卡持有者改值) — a ruling nobody is told changes nothing
ok(blocksA.includes('裁决落地靠**通知**'), 'L53 pin: the ruling is only landed once the holder is notified')
ok(blocksA.includes('`notification.state`') && blocksA.includes('`queued`'), 'L53 pin: the receipt reports delivered vs queued (still in the inbox, unread)')
// A2 (item: 有进展时自动唤起所办汇报) — the trigger chain is declared, not automatic
ok(readFileSync(resolve(PROMPTS, 'v5r-assistant.js'), 'utf8').includes('「有进展就唤起所办」不会自己发生'),
  'A2 pin: the report trigger is declarative (vmu.report.reports; kernel/report.js TRIGGER_KINDS), not automatic')
// A4 (item: 院士＝chair 席) — the seat mapping is taught in prose, not only in a code comment
ok(blocksB.includes('院士＝`chair`'), 'A4 pin: the seat mapping (院士=chair, 常驻研究员=member, 临时工=temp) is taught')
// D1/D5 (items: 各自推进各自的总任务 / 四字段含时间等基础信息)
ok(blocksB.includes('每人各自推进各自的'), 'D1 pin: each member advances their OWN 总任务')
ok(blocksB.includes('四行都带**时间等基础信息**'), 'D5 pin: the four board rows carry time as basic information')
// C10/C11/E24 (items: Lean 代码与编译结果归档 / 忠实性审查 is the debate focus when p≠1)
ok(blocksB.includes('Lean 代码与这次运行的结果'), 'C10 pin: the Lean code AND the run result are archived together')
ok(blocksB.includes('忠实性审查'), 'C11/E24 pin: the debate after a passed Lean run reviews FIDELITY (definitions/conclusions vs the original proposition)')

console.log('=== LEDGER TEACHING PINS: ' + pass + ' passed, ' + fail + ' failed ===')
if (fail > 0) process.exitCode = 1

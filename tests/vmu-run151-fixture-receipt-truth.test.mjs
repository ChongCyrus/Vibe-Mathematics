/**
 * RUN 151 — 真机反馈 rec-2 的修法：`v5r-fixture-tools` 的「顶层只允许这四个字段」是假话，且与同一次装配里的
 * reply-channel 段（教 `formal`）互相矛盾，成员因此放弃了「形式化偏差可以用 formal:{decision:'defect'} 撤回」这条路。
 *
 * THE DEFECT CLASS THIS PINS.  `fixtureMode: 'tools'` 的装配里同时有两段：
 *   · `v5r-fixture-tools`（v5r-core.js，order 603）说「顶层**只允许**这四个字段 —— progress / say / solved /
 *     vote_solved」，并暗示别的名字非法；
 *   · `v5r-reply-channel`（v5r-reply-channel.js）逐行列出回执字段，其中一行教 `formal`（内核真字段，
 *     `FIELD_OWNERS.formal = { face:'vmu.formal', op:'check' }`）。
 * 实测 REPLY_FIELDS=29（FIELD_OWNERS 22 + RECORDED_FIELDS 7），所以「只允许四个」把 25 个真被接受的名字说成非法；
 * 真机 run-1 的成员 r-1 在 feedback 里点名这条互斥（`rec-2`），并说它因此不敢写 `formal`。F5 的机制奇偶门
 * （tests/vmu-prompt-mechanism-parity.test.mjs）把这个家族连条目一起登记在白名单里，`expiry` 写明的解除条件就是
 * 「改成：这四个字段是本夹具的收敛口径，内核另接受 N 个已登记字段，并给出可查清单」——本套件钉住那次改写。
 *   §0 句子与机制：29 个字段里有 formal；新句给出收敛口径与「另接受」两件事；旧话从整面消失
 *   §1 真装配（fixtureMode=tools）：同一段文本里同时有收敛口径与 `formal`，且没有旧话
 *   §2 真回合：`formal` 不再是未知字段（会被派发/具名跳过而不是 UNKNOWN_FIELD），而 `note` 仍然被具名拒
 *   §3 白名单缩表：F5 的 divergences 里不再有 reply-field-catalogue 条目（修好即删，shrink-only）
 *
 * Run: node tests/vmu-run151-fixture-receipt-truth.test.mjs
 * Last line: === VMU RUN151 FIXTURE RECEIPT TRUTH: N passed, M failed ===
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = pathToFileURL(join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')).href
const CORE = pathToFileURL(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'prompts', 'v5r-core.js')).href
const KERNEL_TURN = pathToFileURL(join(REPO, 'vibe-math-vmu', 'kernel', 'turn', 'index.js')).href
const WHITELIST = pathToFileURL(join(REPO, 'tests', '_lib', 'prompt-mechanism-whitelist.mjs')).href
const PROMPTS_DIR = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'prompts')

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

const entry = await import(ENTRY)
const core = await import(CORE)
const kernelTurn = await import(KERNEL_TURN)
const whitelist = await import(WHITELIST)

const roots = []
const boot = async (settings = {}) => {
  const root = await mkdtemp(join(tmpdir(), 'vmu-run151-receipt-'))
  roots.push(root)
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, Object.assign({ root, packs: ['v5r'], clock: () => 1000, deliverMode: 'caller' }, settings))
  await handle.ready()
  return { root, kernel: handle.kernel, names: state.specs.map((s) => s.name), specs: state.specs }
}
const NL = String.fromCharCode(10)
const fenced = (obj) => ['```json', JSON.stringify(obj), '```'].join(NL)
const detailOf = (step, key) => (step && step.receipt && Array.isArray(step.receipt[key]) ? step.receipt[key] : [])
const OLD_CLAIM = /顶层只允许这四个字段/
const NEW_RECIPE = '回执契约（本夹具的收敛口径）'
const allPromptSources = () => readdirSync(PROMPTS_DIR)
  .filter((f) => f.endsWith('.js'))
  .map((f) => ({ f, text: readFileSync(join(PROMPTS_DIR, f), 'utf8') }))

try {
  console.log('=== 0. 源码口径：29 个已登记字段里有 formal；新句说清「收敛口径」与「另接受」 ===')
  {
    const owners = Object.keys(kernelTurn.FIELD_OWNERS)
    ok(owners.length === 22, '§0a FIELD_OWNERS 仍是 22 个（机制没有被这套修法改动）', owners.length)
    ok(kernelTurn.RECORDED_FIELDS.length === 7, '§0b RECORDED_FIELDS 仍是 7 个', kernelTurn.RECORDED_FIELDS.length)
    ok(kernelTurn.REPLY_FIELDS.length === 29 && kernelTurn.REPLY_FIELDS.includes('formal'),
      '§0c ★ REPLY_FIELDS=29 且其中真有 formal（「只允许四个」因此是假话）', kernelTurn.REPLY_FIELDS.length)
    // non-vacuous: the 29-name list is a literal union of two named sources, so the count cannot be 0 by accident.
    ok(kernelTurn.REPLY_FIELDS.length === new Set(kernelTurn.REPLY_FIELDS).size,
      '§0d 29 个名字无重复（计数不是被重复项撑起来的）')

    const toolsText = String(core.v5rFixtureTools.text)
    ok(toolsText.includes(NEW_RECIPE), '§0e ★★★ fixture-tools 段已改成「本夹具的收敛口径」口径', toolsText.slice(0, 0))
    ok(toolsText.includes('29 个已登记字段') && toolsText.includes('`formal`'),
      '§0f ★★★ 新句点名「内核另接受 29 个已登记字段」并举例 formal')
    ok(toolsText.includes('progress / say / solved / vote_solved'), '§0g 四个字段的收敛样例仍在（不是把教学删掉了）')
    ok(!OLD_CLAIM.test(toolsText), '§0h ★★★ 旧话「顶层只允许这四个字段」已从该段消失')
    // self-probe: the needle really matches the retired wording, so §0h/§0i are not empty assertions.
    ok(OLD_CLAIM.test('★★ 回执契约：**顶层只允许这四个字段** —— progress / say'), '§0i 自检：反例正则确实会命中 RUN 151 之前的原句')
    ok(NEW_RECIPE.length > 0 && toolsText.includes('本夹具要求用工具做'),
      '§0j 同段仍保留「本夹具要求用工具做」（F5 白名单里另一条缩写仍被它覆盖）')

    const offenders = allPromptSources().filter((s) => OLD_CLAIM.test(s.text))
    ok(offenders.length === 0, '§0k ★★★ 整面扫描：全部活提示词源里没有任何一处还在说「顶层只允许这四个字段」',
      offenders.map((s) => s.f))
    // non-vacuous: the scan is over the real directory of prompt sources (10 .js files today).
    const files = allPromptSources()
    ok(files.length >= 10 && files.some((s) => s.f === 'v5r-core.js') && files.some((s) => s.f === 'v5r-reply-channel.js'),
      '§0l 扫描面非空且含两个当事文件', files.map((s) => s.f))
  }

  console.log('=== 1. 真装配（fixtureMode=tools）：收敛口径与 formal 同在，且没有旧话 ===')
  {
    const b = await boot()
    const settings = b.kernel.settingsSnapshot()
    const asm = await b.kernel.prompt.assemble({
      settings: Object.assign({}, settings, { 'vmu.v5r.fixtureMode': 'tools' }),
      member: 'r-2',
      role: 'member',
      roleLabel: '常驻研究员',
      phase: 'normal',
      round: 3,
    })
    ok(Boolean(asm) && typeof asm.text === 'string' && asm.text.length > 2000, '§1a 装配真的产出了提示词', asm && asm.text.length)
    const text = String(asm.text)
    ok(text.includes(NEW_RECIPE), '§1b ★★★ 装配里带着新的收敛口径句')
    ok(text.includes('29 个已登记字段'), '§1c ★★★ 装配里带着「内核另接受 29 个已登记字段」')
    ok(text.includes('formal'), '§1d ★★★ 同一份装配里 reply-channel 仍教 formal —— 两句现在相容', (text.match(/formal/g) || []).length)
    ok(!OLD_CLAIM.test(text), '§1e ★★★ 同一份装配里没有旧话（矛盾消失）')
    // the reply-channel row that teaches `formal` is the OTHER side of the contradiction; name it explicitly.
    const replyChannel = readFileSync(join(PROMPTS_DIR, 'v5r-reply-channel.js'), 'utf8')
    ok(/field: 'formal'/.test(replyChannel) && /face: 'vmu\.formal'/.test(replyChannel),
      '§1f 另一侧确实是「回执字段 formal → vmu.formal.check」（不是随便出现的 formal 字样）')
    ok(String(asm.text).includes('形式化'), '§1g 装配里 formal 的用途行也在（说明它不是孤儿字样）')
    await b.kernel.dispose ? await b.kernel.dispose() : null
  }

  console.log('=== 2. 真回合：formal 不再是「未知字段」，note 仍被具名拒 ===')
  {
    const b = await boot()
    await b.kernel.members.hire({ id: 'r-chair', slot: 'chair' })
    await b.kernel.members.hire({ id: 'r-1', slot: 'member' })
    // 2a — formal is a real registered field: it must NOT come back as VMU_TURN_UNKNOWN_FIELD.
    await b.kernel.turn.step({ members: ['r-1'], phase: 'normal', why: 'run151 §2' })
    await b.kernel.turn.supplyMemberReply(fenced({ formal: { target: 'p-x', decision: 'defect', file: 'F.lean', note: 'run151' } }), 'r-1')
    const withFormal = await b.kernel.turn.step({ members: ['r-1'], phase: 'normal', why: 'run151 §2' })
    ok(Boolean(withFormal) && withFormal.ok === true, '§2a 带 formal 的回合存活', withFormal && withFormal.code)
    const formalUnknown = /VMU_TURN_UNKNOWN_FIELD/.test(JSON.stringify(withFormal || {}))
    ok(!formalUnknown, '§2b ★★★ formal 没有被判未知字段（旧话「只允许四个」在这一刻就是假话）')
    const formalTouched = detailOf(withFormal, 'executedDetail').concat(detailOf(withFormal, 'skippedDetail'))
      .some((d) => d && d.field === 'formal')
    ok(formalTouched, '§2c formal 走的是字段派发路径（不是被静默丢弃）', detailOf(withFormal, 'skippedDetail').map((d) => d && d.field))
    // 2d — the honest half of the sentence stays true: an UNREGISTERED name is still refused by name.
    await b.kernel.turn.step({ members: ['r-1'], phase: 'normal', why: 'run151 §2' })
    await b.kernel.turn.supplyMemberReply(fenced({ note: 'run151 未登记字段' }), 'r-1')
    const withNote = await b.kernel.turn.step({ members: ['r-1'], phase: 'normal', why: 'run151 §2' })
    const blob = JSON.stringify(withNote || {})
    ok(/VMU_TURN_UNKNOWN_FIELD/.test(blob) || (withNote && withNote.ok === true && Array.isArray(withNote.receipt && withNote.receipt.unknownFields)),
      '§2d ★★ 未登记的 note 仍被具名拒/记名（「不在内核清单的名字会被拒」这半句仍然是真的）',
      (blob.match(/VMU_TURN_[A-Z_]+/g) || []).slice(0, 4))
    if (b.kernel.dispose) await b.kernel.dispose()
  }

  console.log('=== 3. F5 白名单缩表：修好即删（shrink-only） ===')
  {
    const entries = whitelist.PROMPT_MECHANISM_DIVERGENCES
    ok(Array.isArray(entries) && entries.length > 0, '§3a 白名单仍是非空台账', Array.isArray(entries) ? entries.length : entries)
    const still = entries.filter((e) => e && e.family === 'reply-field-catalogue')
    ok(still.length === 0, '§3b ★★★ 台账里不再有 reply-field-catalogue 条目（修好即删，不许留一条空转的豁免）', still.map((e) => e.contains))
    const toolParam = entries.filter((e) => /顶层只允许这四个字段/.test(String(e.contains || '')))
    ok(toolParam.length === 0, '§3c 也没有别的条目靠那句旧话立足', toolParam.map((e) => e.contains))
  }

  console.log('')
  console.log('=== VMU RUN151 FIXTURE RECEIPT TRUTH: ' + passed + ' passed, ' + failed + ' failed ===')
  if (failed) console.error('failures:' + NL + failures.join(NL))
  process.exit(failed ? 1 : 0)
} finally {
  for (const r of roots) { try { await rm(r, { recursive: true, force: true }) } catch { /* temp dir */ } }
}

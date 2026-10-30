/**
 * RUN 150 / G7 audit19 C-1 + C-2 — the reply field `verdict` is RETIRED, and the vote entrance is the tool face.
 *
 * audit19 measured two contradictions on one surface:
 *   C-2  the catalogue taught `verdict: { target, verdict: 1|0, reason }`, and that shape can NEVER cast: the ballot
 *        box reads `boxId` and `by`, the reply envelope has neither, so every taught payload came back `VMU_NOT_FOUND`
 *        / `VMU_CONFLICT cast 需要 by`. The only shape that DID cast (`{boxId, choice, by}`) was never taught.
 *   C-1  a payload that carried the box id and the voter did cast — from a TEMPORARY WORKER too, though rule L3 gives
 *        temporary workers no vote — so the prompt's "临时工 verdict 不计票" was false for this channel.
 * THE FIX THIS SUITE PINS: the field is `notApplicable` in the catalogue and `noReplyShape` in the kernel, so it is
 * refused BY NAME before any face is touched (no vote can ever be cast through a reply, by any seat), and the vote
 * entrance the prompt teaches is the tool face, which is where `requireVoter` enforces rule L3.
 *   §0 the sentences and the machinery declaration (and the retired promise, gone)
 *   §1 a real turn: every taught shape AND the one that used to cast are skipped by name; the box stays at 0 votes
 *   §2 the tool face: the chair opens a poll, a permanent member votes, a temporary worker is refused BY NAME
 *   §3 the renders: the three seats see the corrected wording, and the assembly says the vote has one entrance
 *
 * Run: node tests/vmu-run150-verdict-channel.test.mjs
 * Last line: === VMU RUN150 VERDICT CHANNEL: N passed, M failed ===
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = pathToFileURL(join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')).href
const REPLY_CHANNEL = pathToFileURL(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'prompts', 'v5r-reply-channel.js')).href
const KERNEL_TURN = pathToFileURL(join(REPO, 'vibe-math-vmu', 'kernel', 'turn', 'index.js')).href
const BLOCKS_B = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'prompts', 'v5r-blocks-b.js')
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
const decl = await import(REPLY_CHANNEL)
const kernelTurn = await import(KERNEL_TURN)

const roots = []
const boot = async (settings = {}) => {
  const root = await mkdtemp(join(tmpdir(), 'vmu-run150-verdict-'))
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
const row = (field) => decl.REPLY_FIELD_ROWS.find((r) => r.field === field)
const detailOf = (step, key) => (step && step.receipt && Array.isArray(step.receipt[key]) ? step.receipt[key] : [])
const livePromptText = () => readFileSync(BLOCKS_B, 'utf8') + NL + readFileSync(join(PROMPTS_DIR, 'v5r-reply-channel.js'), 'utf8')
const RETIRED = /两个入口都算票|本回执的`verdict`字段也真的会派发到票箱|填了也不计票/
const TOOL_CALL = (specs, name) => specs.find((s) => s.name === name)
const parse = (res) => (typeof res === 'string' ? JSON.parse(res) : res)
const refusalOf = async (fn) => {
  try { return parse(await fn()) } catch (e) { return { ok: false, code: e && e.code, message: e && e.message } }
}

try {
  console.log('=== 0. 源码口径：回执 verdict 没有可用形状、投票走工具；旧承诺已删 ===')
  {
    const v = row('verdict')
    ok(Boolean(v), '§0a 目录里仍有 verdict 这一行（退休不是删除）', Boolean(v))
    ok(Boolean(v) && v.notApplicable === true, '§0b ★★★ 这一行标了 notApplicable（回执没有可用形状）', v && v.notApplicable)
    ok(Boolean(v) && String(v.route || '').includes('vibe_v5_verdict'), '§0c ★★ route 指到真正能投票的工具', v && v.route)
    const note = String((v && v.note) || '')
    ok(/没有可用形状/.test(note) && note.includes('投递前') && note.includes('票不进箱'),
      '§0d ★★★ 行注说清「没有可用形状、投递前就被具名跳过、票不进箱」', note.slice(0, 200))
    ok(note.includes('vibe_v5_verdict') && note.includes('vibe_v5_poll_vote'), '§0e ★★ 行注给出两条真入口（活票箱 / 投票板）', note.slice(0, 220))
    ok(note.includes('VMU_NOT_PERMITTED') && /L3/.test(note), '§0f ★★★ 行注把票权写到席位与规则 L3 上（临时工无表决权）', note.slice(-160))
    ok(!/∈\s*\[\s*0\s*,\s*1\s*\]/.test(livePromptText()), '§0g ★★★ 活提示词不再教「verdict ∈ [0,1]」这个永远投不进去的形状')
    const owner = kernelTurn.FIELD_OWNERS && kernelTurn.FIELD_OWNERS.verdict
    ok(Boolean(owner) && Boolean(owner.noReplyShape), '§0h ★★★ kernel FIELD_OWNERS.verdict 带了 noReplyShape', owner)
    const shape = (owner && owner.noReplyShape) || {}
    ok(shape.code === 'VMU_TURN_FIELD_NOT_APPLICABLE', '§0i 具名码是 VMU_TURN_FIELD_NOT_APPLICABLE', shape.code)
    const msg = String(shape.message || '')
    ok(/NO usable shape/i.test(msg) && /BEFORE any face/i.test(msg), '§0j ★★ message 说清「投递前、任何面都没碰」', msg.slice(0, 200))
    ok(msg.includes('boxId') && /\bby\b/.test(msg), '§0k ★★ message 点名票箱真正需要的两个东西（boxId / by）', msg.slice(0, 220))
    ok(/temporary worker has no vote|L3/i.test(msg), '§0l ★★★ message 把席位规则（L3 临时工无表决权）说成工具面的事', msg.slice(-200))
    ok(/真的|really counts|counts the vote/.test(msg) === false, '§0m message 不再声称回执这一票会被计（audit19 C-1）', msg.slice(0, 120))
    const hint = String(shape.hint || '')
    ok(hint.includes('vibe_v5_verdict') && hint.includes('vibe_v5_poll_vote'), '§0n ★★ hint 同时给出两条真入口', hint.slice(0, 200))
    // RUN 151 / audit20 C-1: the poll tool's parameter is `ballot_id`; `boxId` is what the BALLOT BOX's cast() reads,
    // not what vibe_v5_poll_vote declares. Teaching the wrong name is an operational promise that fails by name.
    ok(/vibe_v5_poll_vote\s*\{\s*ballot_id/.test(hint), '§0n2 ★★★ hint 里投票板的形参写对了（ballot_id）', hint.slice(0, 260))
    ok(!/vibe_v5_poll_vote\s*\{\s*boxId/.test(hint), '§0n3 ★★★ hint 不再把 ballot_id 教成 boxId（audit20 C-1）', hint.slice(0, 260))
    ok(/vibe_v5_poll_vote\s*\{\s*ballot_id/.test(note), '§0n4 ★★★ 行注里投票板的形参也写对了（ballot_id）', note.slice(0, 260))
    ok(!/vibe_v5_poll_vote\s*\{\s*boxId/.test(note), '§0n5 ★★★ 行注不再把 ballot_id 教成 boxId（audit20 C-1）', note.slice(0, 260))
    ok(!/原句留在回执 notes/.test(note), '§0n6 ★★ 行注不再声称这一条会留在 notes（notApplicable 分支不写 keptNotes，audit20 C-2）', note.slice(0, 200))
    const kernelSet = Object.keys(kernelTurn.FIELD_OWNERS).filter((k) => kernelTurn.FIELD_OWNERS[k] && kernelTurn.FIELD_OWNERS[k].noReplyShape).sort()
    const packSet = decl.REPLY_FIELD_ROWS.filter((r) => r.notApplicable).map((r) => r.field).sort()
    ok(kernelSet.length > 0 && packSet.length > 0, '§0o-pre 两侧集合都非空（R35e 的比较不可能是「两空相等」）', { kernelSet, packSet })
    ok(kernelSet.length > 0 && JSON.stringify(kernelSet) === JSON.stringify(packSet),
      '§0o ★ R35e：内核 noReplyShape 集合与目录 notApplicable 集合双向一致', { kernelSet, packSet })
    const footer = decl.replyCatalogueLines({ mode: 'compact' }).join(NL)
    ok(footer.includes('拒绝点各不相同') && footer.includes('vote_solved 不計票'), '§0p footer 把拒绝点讲清并保留「vote_solved 不計票」这句真话', footer.slice(0, 200))
    ok(!footer.includes('权限由属主面各自判'), '§0q ★★ footer 不再把拒绝点笼统说成「属主面」（audit18 的老错）', footer.slice(0, 160))
    const temp = String((decl.REPLY_SEAT_NOTES || {}).temp || '')
    ok(temp.includes('没有可用形状') && temp.includes('VMU_NOT_PERMITTED') && /L3/.test(temp),
      '§0r ★★★ 临时工席注：回执字段被具名跳过 + 投票工具具名拒 + 规则 L3', temp.slice(0, 220))
    const blocks = readFileSync(BLOCKS_B, 'utf8')
    ok(blocks.includes('投票只有一个入口'), '§0s ★★★ 活教学说清「投票只有一个入口：工具」')
    ok(!RETIRED.test(livePromptText()), '§0t ★★★ 整面扫描：没有任何活句子还在说「两个入口都算票 / 本回执的 verdict 真的会派发」',
      (livePromptText().match(RETIRED) || [])[0])
    // non-vacuous: RETIRED is a three-alternative literal, so §0t cannot pass on an empty pattern.
    ok(RETIRED.test('两个入口都算票') && RETIRED.test('本回执的`verdict`字段也真的会派发到票箱'),
      '§0u 自检：反例正则确实会命中 audit19 之前的原句（否则 §0t 是空断言）')
  }

  console.log('=== 1. 真回合：教过的形状与「本来能投进去」的形状，都被具名跳过；票箱一票不增 ===')
  {
    const b = await boot()
    await b.kernel.members.hire({ id: 'r-chair', slot: 'chair' })
    await b.kernel.members.hire({ id: 'r-1', slot: 'member' })
    await b.kernel.members.hire({ id: 'r-t', slot: 'temp' })
    const box = b.kernel.ballotbox.open({ question: 'run150 §1', options: ['A', 'B'] })
    const boxId = box && (box.boxId || box.id)
    ok(Boolean(boxId), '§1a 先开一个投票板（§1 的「票数不增」有东西可对照）', box && box.ok)
    const votesOf = () => {
      const st = b.kernel.ballotbox.status({ boxId })
      if (!st) return -1
      if (typeof st.votes === 'number') return st.votes
      if (Array.isArray(st.votes)) return st.votes.length
      return -1
    }
    ok(votesOf() === 0, '§1b 开板后 0 票', votesOf())
    // the shape the catalogue used to teach
    await b.kernel.turn.step({ members: ['r-1'], phase: 'normal', why: 'run150 §1' })
    await b.kernel.turn.supplyMemberReply(fenced({ verdict: { target: boxId, verdict: 1, reason: 'run150 §1' } }), 'r-1')
    const taught = await b.kernel.turn.step({ members: ['r-1'], phase: 'normal', why: 'run150 §1' })
    const taughtSkip = detailOf(taught, 'skippedDetail').find((d) => d && d.field === 'verdict')
    ok(Boolean(taught) && taught.ok === true, '§1c 轮次存活（退休字段不杀轮）', taught && taught.code)
    ok(Boolean(taughtSkip) && taughtSkip.reason === 'no-supported-shape' && taughtSkip.code === 'VMU_TURN_FIELD_NOT_APPLICABLE',
      '§1d ★★★ 教过的形状 ⇒ 具名跳过 no-supported-shape/VMU_TURN_FIELD_NOT_APPLICABLE', taughtSkip && (taughtSkip.reason + ' ' + taughtSkip.code))
    ok(!detailOf(taught, 'executedDetail').some((d) => d && d.field === 'verdict'), '§1e 它没有被执行')
    ok(votesOf() === 0, '§1f ★★★ 票箱仍然 0 票', votesOf())
    // the shape that used to cast (boxId + by) — the channel is retired, so it must be skipped too
    await b.kernel.turn.step({ members: ['r-t'], phase: 'normal', why: 'run150 §1' })
    await b.kernel.turn.supplyMemberReply(fenced({ verdict: { boxId, choice: 'A', by: 'r-t' } }), 'r-t')
    const tempStep = await b.kernel.turn.step({ members: ['r-t'], phase: 'normal', why: 'run150 §1' })
    const tempSkip = detailOf(tempStep, 'skippedDetail').find((d) => d && d.field === 'verdict')
    ok(Boolean(tempSkip) && tempSkip.reason === 'no-supported-shape' && tempSkip.code === 'VMU_TURN_FIELD_NOT_APPLICABLE',
      '§1g ★★★ 临时工写「票箱+投票人」的真形状 ⇒ 也一样具名跳过（通道退休，没有旁路）', tempSkip && (tempSkip.reason + ' ' + tempSkip.code))
    ok(votesOf() === 0, '§1h ★★★ 临时工的票没有进箱（audit19 C-1 的反例就此消失）', votesOf())
    await b.kernel.turn.step({ members: ['r-1'], phase: 'normal', why: 'run150 §1' })
    await b.kernel.turn.supplyMemberReply(fenced({ verdict: { boxId, choice: 'A', by: 'r-1' } }), 'r-1')
    const memberStep = await b.kernel.turn.step({ members: ['r-1'], phase: 'normal', why: 'run150 §1' })
    ok(detailOf(memberStep, 'skippedDetail').some((d) => d && d.field === 'verdict'), '§1i 常驻研究员同样走不到票箱（同一条形状闸）')
    ok(votesOf() === 0, '§1j 票箱仍 0 票', votesOf())
  }

  console.log('=== 2. 工具面：院士开板、常驻研究员投票、临时工被具名拒 ===')
  {
    const b = await boot()
    await b.kernel.members.hire({ id: 'r-chair', slot: 'chair' })
    await b.kernel.members.hire({ id: 'r-1', slot: 'member' })
    await b.kernel.members.hire({ id: 'r-t', slot: 'temp' })
    const openTool = TOOL_CALL(b.specs, 'vibe_v5_poll_open')
    const voteTool = TOOL_CALL(b.specs, 'vibe_v5_poll_vote')
    ok(Boolean(openTool) && Boolean(voteTool), '§2a 工具面发布了 poll_open / poll_vote', { open: Boolean(openTool), vote: Boolean(voteTool) })
    const opened = await openTool.execute({ question: 'run150 §2', options: ['A', 'B'], member: 'r-chair' }, {})
    const openedP = parse(opened)
    ok(Boolean(openedP) && openedP.ok === true && typeof openedP.boxId === 'string', '§2b ★★ 院士开板成功', openedP && (openedP.code || openedP.boxId))
    const boxId = openedP && openedP.boxId
    const memberVote = await refusalOf(() => voteTool.execute({ ballot_id: boxId, choice: 'A', member: 'r-1' }, {}))
    ok(Boolean(memberVote) && memberVote.ok === true, '§2c ★★★ 常驻研究员在工具面投票成功（票权按席位判）', memberVote && (memberVote.code || memberVote.tool))
    const tempVote = await refusalOf(() => voteTool.execute({ ballot_id: boxId, choice: 'B', member: 'r-t' }, {}))
    ok(Boolean(tempVote) && tempVote.ok === false && tempVote.code === 'VMU_NOT_PERMITTED',
      '§2d ★★★ 临时工在工具面被具名拒 VMU_NOT_PERMITTED（规则 L3 的拒绝点在这里）', tempVote && (tempVote.code + ' ' + String(tempVote.message).slice(0, 120)))
    const verdictTool = TOOL_CALL(b.specs, 'vibe_v5_verdict')
    ok(Boolean(verdictTool), '§2e 工具面发布了 vibe_v5_verdict（活票箱那条入口）')
    const gateTemp = b.kernel.memberFaceGate({ member: 'r-t', toolName: 'vibe_v5_verdict' })
    ok(Boolean(gateTemp) && gateTemp.ok === false, '§2f ★★ 临时工的工具面里没有 vibe_v5_verdict（席位 ACL 前置拒）', gateTemp && (gateTemp.code + ' slot=' + gateTemp.slot))
    // RUN 151 / audit20 C-1 — the taught shape must be the ACCEPTED shape. This is the general check: every
    // `vibe_v5_poll_vote { … }` a seat can read must only name parameters the tool really declares, and it must name
    // `ballot_id`; the old sentence named `boxId`, which the tool refuses by name (VMU_INVALID_ARGUMENT).
    const pollParams = Object.keys((voteTool.parameters && voteTool.parameters.properties) || {})
    ok(pollParams.includes('ballot_id') && !pollParams.includes('boxId'),
      '§2g ★★★ 投票板工具声明的形参是 ballot_id，没有 boxId', pollParams.join(','))
    const taughtPoll = []
    const teachingSources = [String(kernelTurn.FIELD_OWNERS.verdict.noReplyShape.hint || ''), String(row('verdict').note || ''), readFileSync(BLOCKS_B, 'utf8')].join(NL)
    for (const m of teachingSources.matchAll(/vibe_v5_poll_vote\s*\{([^}]*)\}/g)) taughtPoll.push(m[1])
    ok(taughtPoll.length > 0, '§2h-pre 活教学里至少有一处教投票板的形状（否则下面的子集检查是空的）', taughtPoll.length)
    // non-vacuous: taughtPoll is filled by matchAll over a three-source literal, and the guard above refuses an empty list.
    const keysOf = (src) => src.split(',').map((piece) => piece.trim().split(':')[0].trim()).filter((k) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(k))
    const taughtKeys = Array.from(new Set(taughtPoll.flatMap(keysOf)))
    ok(taughtKeys.length > 0 && taughtKeys.every((k) => pollParams.includes(k)),
      '§2i ★★★ 教给席位的每个形参都在工具声明里（教得出、投得进）', { taughtKeys, pollParams })
    ok(!taughtPoll.some((src) => /boxId/.test(src)), '§2j ★★★ 没有一处活句子把投票板形参教成 boxId（audit20 C-1 的反例）', taughtPoll)
    // RUN 152 / audit21 G30 — an abbreviated shape must still carry the parameters the tool REQUIRES, otherwise the
    // sentence teaches a call that is refused by name ("poll_vote needs the acting member id"). Same rule for
    // poll_open, whose required trio is question/options/member.
    const requiredOf = (spec) => (spec && spec.parameters && Array.isArray(spec.parameters.required) ? spec.parameters.required : [])
    const pollRequired = requiredOf(voteTool)
    ok(pollRequired.length > 0 && taughtPoll.length > 0 && taughtPoll.every((src) => pollRequired.every((k) => keysOf(src).includes(k))),
      '§2l ★★★ 每个教出来的投票板形状都带齐了工具 required 的形参（教得出、投得进）', { pollRequired, taughtPoll })
    const openRequired = requiredOf(openTool)
    const taughtOpen = []
    for (const m of teachingSources.matchAll(/vibe_v5_poll_open\s*\{([^}]*)\}/g)) taughtOpen.push(m[1])
    ok(taughtOpen.length > 0 && openRequired.length > 0 && taughtOpen.every((src) => openRequired.every((k) => keysOf(src).includes(k))),
      '§2l2 ★★★ 每个教出来的开板形状也带齐了 required（question/options/member）', { openRequired, taughtOpen })
    const taughtBoard = parse(await openTool.execute({ question: 'run150 §2 taught', options: ['A', 'B'], member: 'r-chair' }, {}))
    const taughtBoardId = taughtBoard && taughtBoard.boxId
    const taughtVote = await refusalOf(() => voteTool.execute({ ballot_id: taughtBoardId, choice: 'A', member: 'r-1' }, {}))
    ok(Boolean(taughtVote) && taughtVote.ok === true,
      '§2k ★★★ 照活教学里那个形状真投，成功（教与做一致）', taughtVote && (taughtVote.code || taughtVote.tool))
    // RUN 153 / audit22 C-1 — the second taught branch (`abstain: true`) must CAST an abstention, not fall through to
    // "选项不在票面上". The face has exactly one abstention shape (`choice === 'abstain'`), so the pack has to translate;
    // a taught branch that cannot be executed is the same defect class as a wrong parameter name.
    const abstainBoard = parse(await openTool.execute({ question: 'run150 §2 abstain', options: ['A', 'B'], min_votes: 1, member: 'r-chair' }, {}))
    const abstainBoardId = abstainBoard && abstainBoard.boxId
    const abstainVote = await refusalOf(() => voteTool.execute({ ballot_id: abstainBoardId, abstain: true, member: 'r-1' }, {}))
    ok(Boolean(abstainVote) && abstainVote.ok === true && abstainVote.member === 'r-1',
      '§2m ★★★ 教的第二支 `abstain: true` 真的投成弃权（audit22 C-1 的反例）', abstainVote && (abstainVote.code || String(abstainVote.message || '').slice(0, 120)))
    const abstainReceipt = abstainVote && abstainVote.receipt
    ok(Boolean(abstainReceipt) && (abstainReceipt.kind === 'abstain' || abstainReceipt.abstain === true),
      '§2m2 ★★ 回执说明这一票是弃权（kind/abstain 字段）', abstainReceipt && JSON.stringify(abstainReceipt).slice(0, 160))
    const abstainStatus = b.kernel.ballotbox.status({ boxId: abstainBoardId })
    const abstainClose = parse(await TOOL_CALL(b.specs, 'vibe_v5_poll_close').execute({ ballot_id: abstainBoardId, member: 'r-chair' }, {}))
    ok(Boolean(abstainStatus) && Number(abstainStatus.abstain) === 1 && Number(abstainStatus.votes) === 0,
      '§2m3 ★★★ 票箱记下这一票是弃权（abstain 1 / votes 0）——它被投进去了，只是弃权不顶 cast', abstainStatus && JSON.stringify({ votes: abstainStatus.votes, abstain: abstainStatus.abstain }))
    ok(Boolean(abstainClose) && abstainClose.code === 'VMU_BALLOT_MIN_VOTES_NOT_MET',
      '§2m4 ★★ 只有弃权票时结票被具名拒（弃权不是 cast，门槛照旧按 cast 算）', abstainClose && (abstainClose.code || String(abstainClose.message || '').slice(0, 120)))
    const TOOLS_SRC = readFileSync(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js'), 'utf8')
    ok(/if \(args\.abstain === true\) castArgs\.choice = 'abstain'/.test(TOOLS_SRC) && !/castArgs\.abstain = true/.test(TOOLS_SRC),
      '§2m5 ★★★ 包把 `abstain:true` 翻成票面唯一认的弃权形状（不再把 flag 透传给从不读它的内核）')
    // §2m6 — the kernel FACE itself now reads the flag as an alias of `choice: 'abstain'` (audit22 asked this be
    // settled): a direct caller of kernel.ballotbox.cast({abstain:true}) no longer falls through to 选项不在票面上.
    const kB = b.kernel.ballotbox.open({ question: 'run150 §2m6', options: ['A', 'B'] })
    const kAbstain = b.kernel.ballotbox.cast({ boxId: kB.boxId, by: 'r-1', abstain: true })
    ok(Boolean(kAbstain) && kAbstain.ok === true && kAbstain.kind === 'abstain',
      '§2m6 ★★★ 内核面 `cast({abstain:true})` 与 `cast({choice:"abstain"})` 同义（flag 是别名，不再是死形参）', JSON.stringify(kAbstain).slice(0, 160))
    // §2m7 — both shapes at once is refused BY NAME (the teaching says OR, so precedence must not be silent).
    const bothBoard = parse(await openTool.execute({ question: 'run150 §2m7', options: ['A', 'B'], member: 'r-chair' }, {}))
    const bothErr = await refusalOf(() => voteTool.execute({ ballot_id: bothBoard && bothBoard.boxId, choices: ['A'], abstain: true, member: 'r-1' }, {}))
    ok(Boolean(bothErr) && bothErr.code === 'VMU_INVALID_ARGUMENT' && /not both/.test(String(bothErr.message || '')),
      '§2m7 ★★★ `choices` 与 `abstain:true` 同现被具名拒（弃权不静默压过选项）', bothErr && (bothErr.code + ' ' + String(bothErr.message || '').slice(0, 90)))
    // §2n — audit22 §2 B.2b also showed WHY the dead branch survived three audits: nothing checked that every taught
    // shape names the parameters its tool actually REQUIRES. `vibe_v5_say { round, text }` is such a shape (its tool
    // requires `member`, because the pack has no agent→member map). Both halves are pinned here: the sentence carries
    // the required name, and the real tool refuses the shape that omits it BY NAME instead of guessing the sender.
    const sayTool = TOOL_CALL(b.specs, 'vibe_v5_say')
    const sayRequired = (sayTool.parameters && sayTool.parameters.required) || []
    ok(sayRequired.includes('member'), '§2n ★★ `vibe_v5_say` 的 required 里有 member（没有它就猜不出谁在说）', JSON.stringify(sayRequired))
    const sayRefused = parse(await sayTool.execute({ round: 'run150-say', text: 'x' }, {}))
    ok(Boolean(sayRefused) && sayRefused.code === 'VMU_INVALID_ARGUMENT' && /member id/.test(String(sayRefused.message || '')),
      '§2n2 ★★★ 照缺 member 的缩写真调 ⇒ 被具名拒（不是静默用别人的身份）', sayRefused && (sayRefused.code + ' ' + String(sayRefused.message || '').slice(0, 90)))
    const sayOk = parse(await sayTool.execute({ round: 'run150-say', text: 'x', member: 'r-1' }, {}))
    ok(Boolean(sayOk) && sayOk.ok === true, '§2n3 ★★ 带上 member 就真的说了（教与做一致）', sayOk && (sayOk.code || sayOk.id))
    // §2n4 — the GENERALISED door: every `vibe_x { … }` shape written in the LIVE prompt sources must (a) use only
    // declared parameter names and (b) unless it is explicitly abbreviated with an ellipsis, carry every required one.
    // This is the check that would have caught audit20 C-1 (boxId), audit21 G30 (missing member) and audit22 C-1 in one
    // place, so it is pinned rather than re-derived by hand each round.
    const promptsDir = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'prompts')
    const decls = new Map(b.specs.map((s) => [s.name, s]))
    const offenders = []
    const abbrevSkips = []
    for (const f of readdirSync(promptsDir).filter((n) => n.endsWith('.js') && n !== 'v5r-prompts.js')) {
      const src = readFileSync(join(promptsDir, f), 'utf8')
      for (const m of src.matchAll(/(vibe_[A-Za-z0-9_]+)\s*\{([^}]{0,400})\}/g)) {
        const name = m[1]
        const body = m[2]
        const spec = decls.get(name)
        if (!spec) { offenders.push(f + ': no such tool ' + name); continue }
        const props = Object.keys((spec.parameters && spec.parameters.properties) || {})
        const req = (spec.parameters && spec.parameters.required) || []
        const keys = Array.from(new Set(body.split(',').map((p) => p.trim().split(':')[0].trim()).filter((k) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(k))))
        const extra = keys.filter((k) => !props.includes(k))
        if (extra.length) offenders.push(f + ': ' + name + ' has undeclared ' + extra.join('/'))
        if (body.includes('…')) { abbrevSkips.push(f + ':' + name); continue }
        const missing = req.filter((k) => !keys.includes(k))
        if (missing.length) offenders.push(f + ': ' + name + ' omits required ' + missing.join('/'))
      }
    }
    ok(offenders.length === 0, '§2n4 ★★★ 活教学里每个工具形状只用已声明形参、且（非省略式）带齐 required（审计三轮的死分支在这里被一次抓住）', offenders.join(' | '))
    ok(abbrevSkips.length > 0, '§2n5 ★ 扫描非空转：确有带省略号的缩写形状被检查过', String(abbrevSkips.length))
  }

  console.log('=== 3. 渲染：三席看到修正后的句子，装配里说「投票只有一个入口」 ===')
  {
    for (const seat of ['chair', 'member', 'temp']) {
      const full = decl.replyCatalogueLines({ mode: 'full', seat }).join(NL)
      ok(full.includes('票不进箱') || full.includes('没有可用形状'), '§3a ' + seat + ' 的 full 目录带上「没有可用形状/票不进箱」', seat)
      const compact = decl.replyCatalogueLines({ mode: 'compact', seat }).join(NL)
      ok(!RETIRED.test(compact), '§3b ' + seat + ' 的 compact 目录里没有旧承诺', seat)
    }
    const b = await boot()
    await b.kernel.members.hire({ id: 'r-chair', slot: 'chair' })
    await b.kernel.members.hire({ id: 'r-1', slot: 'member' })
    // The reply catalogue is the DELIVERED surface for these sentences (it is the deployment assembly that renders it;
    // the charter sub-assembly used by T99 does not). So the delivered sentence is pinned where a seat really reads it.
    const compactMember = decl.replyCatalogueLines({ mode: 'compact', seat: 'member' }).join(NL)
    ok(compactMember.includes('拒绝点各不相同') && compactMember.includes('vote_solved 不計票'),
      '§3c ★★★ 交付给成员的 compact 目录说清拒绝点，并保留「vote_solved 不計票」')
    ok(compactMember.includes('`verdict`→vibe_v5_verdict'), '§3d ★★★ compact 边界行把 verdict 指到 vibe_v5_verdict', compactMember.slice(-260))
    ok(!RETIRED.test(compactMember), '§3e 交付给成员的 compact 目录里没有旧承诺')
  }
} catch (e) {
  failed++
  failures.push('THREW ' + (e && e.stack ? e.stack.split(NL)[0] : String(e)))
  console.error('  FAIL THREW ' + (e && e.stack ? e.stack : e))
} finally {
  for (const r of roots) await rm(r, { recursive: true, force: true }).catch(() => {})
}

console.log('')
if (failed) { console.error('FAILURES:'); for (const f of failures) console.error('  - ' + f) }
console.log('=== VMU RUN150 VERDICT CHANNEL: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed ? 1 : 0)

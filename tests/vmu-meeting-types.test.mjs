// tests/vmu-meeting-types.test.mjs — GOAL ROUND 3 (rule conformance): 「院士可以设置会议的类型」 / 辩论会议的额外对象字段 /
// 框架给特殊类型推荐流程骨架。
//
// THE DEFECT CLASS THIS PINS (all three measured by reading the call sites, not inferred):
//   · `vibe_v5_meeting` passed `type: 'ordinary'` HARDCODED to `kernel.meetings.open` ⇒ the academician could not set
//     the meeting type at all, although the rule says 院士可以设置会议的类型; its `kind` was validated and then dropped.
//   · its schema declared `target` and NOTHING read `args.target` ⇒ the rule's 「辩论会议额外字段（辩论的对象或文件引用）」
//     existed as a declared parameter with no consumer.
//   · nothing anywhere carried a recommended procedure skeleton, so "框架会给予院士推荐的会议进行流程骨架" had no shape.
//
// WHAT THIS SUITE PROVES:
//   ① the type catalog is the pack's (six ids) and NOT a framework vocabulary;
//   ② the kernel CARRIES the type and the subject and reads them BACK (receipt / summary / meetingView) — 「设了值」≠「生效了」;
//   ③ a non-string subject is refused by name (no `String({})` → "[object Object]" ever reaches the state);
//   ④ an unknown type is refused with the legal list; a debate without a subject is refused (no debate about nothing);
//   ⑤ the recommended procedure is labelled `binding:'recommendation'` and is NOT a gate;
//   ⑥ the steps the framework has NOT implemented are REPORTED (`pendingSteps`) — an honest half, not a fake whole.
//
// WHAT IT DOES NOT PROVE (named, so nobody reads more into it): it does not drive a live model through the skeleton, so
// it says nothing about whether a model follows the recommendation. That is a real-machine question.
//
// RULE E: every loop/every() below is preceded by an explicit NON-EMPTY assertion.
import { mkdtemp, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const proc = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'meeting-procedures.js')).href)
const entry = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')).href)

const boot = async (config = {}) => {
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, Object.assign({ clock: () => 1000 }, config))
  await handle.ready()
  return { handle, state, specOf: (n) => state.specs.find((s) => s.name === n) }
}
const call = async (b, name, args = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { missing: true }
  const raw = await spec.execute(args, {})
  let parsed
  try { parsed = JSON.parse(raw) } catch { parsed = undefined }
  return { raw, parsed, missing: false }
}

const root = await mkdtemp(join('D:/_tmp', 'vmu-meeting-types-'))
try {
  // ── ① THE CATALOG LIVES IN THE PACK ────────────────────────────────────────────────────────────────────────
  console.log('=== 1. THE MEETING TYPE CATALOG IS THE PACK\'S OWN VOCABULARY ===')
  ok(Array.isArray(proc.MEETING_TYPES) && proc.MEETING_TYPES.length === 6, 'the rule names six types and the catalog declares six', proc.MEETING_TYPES && proc.MEETING_TYPES.length)
  const ids = proc.MEETING_TYPE_IDS
  ok(ids.length === 6, 'the id list is non-empty (RULE E)', ids.length)
  ok(['ordinary', 'academic', 'debate', 'closure', 'paper', 'planning'].every((t) => ids.includes(t)),
    'the six ids are the rule\'s own list (正常/学术交流/辩论/结题/论文交流/未来规划策划)', ids)
  ok(new Set(ids).size === ids.length, 'no duplicate type id')
  const debate = proc.MEETING_TYPES.find((t) => t.id === 'debate')
  ok(!!debate && debate.subjectRequired === true, 'ONLY the debate type requires the object field (the rule names only debate)', debate)
  ok(proc.MEETING_TYPES.filter((t) => t.subjectRequired === true).length === 1, 'exactly one type requires a subject (not a blanket rule)', proc.MEETING_TYPES.map((t) => [t.id, t.subjectRequired]))
  // the framework must NOT learn this vocabulary: the six ids must not appear in the kernel's own meeting code
  const { readFile } = await import('node:fs/promises')
  const kernelSrc = await readFile(join(REPO, 'vibe-math-vmu', 'kernel', 'meetings.js'), 'utf8')
  const leaked = ids.filter((t) => t !== 'ordinary' && kernelSrc.includes("'" + t + "'"))
  ok(leaked.length === 0, '★ zero mechanism: none of the five institutional type ids is hardcoded in kernel/meetings.js', leaked)

  // ── ② THE RECOMMENDED PROCEDURE IS A RECOMMENDATION, NOT A GATE ────────────────────────────────────────────
  console.log('=== 2. THE RECOMMENDED SKELETON: PRESENT FOR DEBATE, ABSENT (AND EXPLAINED) ELSEWHERE ===')
  const d = proc.procedureFor('debate')
  ok(d.known === true && d.hasProcedure === true, 'debate has a recommended procedure', { known: d.known, has: d.hasProcedure })
  ok(d.binding === 'recommendation', '★ the binding is machine-readably a RECOMMENDATION (the rule: 是否遵循完全由院士自己决定)', d.binding)
  ok(Array.isArray(d.procedure.steps) && d.procedure.steps.length === 4, 'the skeleton has the rule\'s four steps', d.procedure && d.procedure.steps && d.procedure.steps.length)
  const steps = d.procedure.steps
  ok(steps.length === 4, 'the step list is non-empty (RULE E)', steps.length)
  ok(steps[0].status === 'supported' && /概率/.test(steps[0].what) && /理由/.test(steps[0].what),
    'step 1 is the independent simultaneous estimate round (布尔概率 + 理由)', steps[0].what)
  ok(/轮数由院士/.test(steps[1].what), 'step 2 leaves the number of rounds to the academician (the rule says so)', steps[1].what)
  ok(steps[2].status === 'supported' && /最终裁决/.test(steps[2].what), 'step 3 is the final verdict round', steps[2].what)
  // ★ 状态变了：第 4 步（聚合 + 通知卡片持有者）已从 pending 变成 supported —— 内核 `vmu.meetingverdict`
  //   提供算术与校验、pack 面 `vibe_v5_verdict_final` 是唯一触发者。这里两侧都钉住，免得"实现回退"被当成无事发生。
  ok(steps[3].status === 'supported' && /平均/.test(steps[3].what) && /通知/.test(steps[3].what),
    '★ step 4 (aggregate + notify the card holder) is now IMPLEMENTED: both branches of the rule are spelled out', steps[3].what)
  ok(Array.isArray(d.pendingSteps) && d.pendingSteps.length === 0,
    '`pendingSteps` is empty, and it stays a FIELD (an empty list is the honest form of "nothing is pending")', d.pendingSteps)
  // every step must name only tools that really exist
  const toolNames = steps.reduce((a, s) => a.concat(s.tools.map((t) => t.split(' ')[0])), [])
  // the legal set is DERIVED from the pack manifest + the kernel faces the skeleton may name (never hand-typed:
  // a hand-typed allowlist silently rots when a tool is renamed, and then this assertion stops meaning anything)
  const { V5R_PACK_TOOLS } = await import('../vibe-math-vmu/packs/v5r/tools.js')
  const published = new Set(V5R_PACK_TOOLS.map((t) => t && t.name).filter(Boolean)
    .concat(['vibe_vmu_meeting', 'vibe_vmu_turn', 'vibe_vmu_records', 'vibe_vmu_mailbox', 'vibe_vmu_status', 'vibe_vmu_tools']))
  ok(published.size >= 45, 'the derived tool vocabulary is the full published surface (RULE E: a non-empty set)', published.size)
  ok(toolNames.length > 0 && toolNames.every((t) => published.has(t)), 'every tool a step names is a real published tool', toolNames)
  // ★ 用户裁定（2026-10-24）推翻了这条 D5 判据：规则原文是「特殊类型会议下框架初始给院士**推荐流程**」，
  //   ordinary（正常会议）**不是**特殊类型 ⇒ 它不该有骨架，而且必须以具名理由说出来（不是静默 null）。
  //   这里逐类钉：特殊类型有骨架 / 步骤非空 / 每步点名的工具真存在 / 回执里写明"推荐不是门禁"；ordinary 另行钉。
  const ordinaryProc = proc.procedureFor('ordinary')
  ok(ordinaryProc.known === true && ordinaryProc.hasProcedure === false && ordinaryProc.procedure === null,
    '★ ordinary has NO recommended skeleton（用户裁定 2026-10-24：普通会议不需要推荐流程骨架）',
    { hasProcedure: ordinaryProc.hasProcedure, procedure: ordinaryProc.procedure })
  ok(/具名决定/.test(String(ordinaryProc.note)),
    '★★ ordinary 的「没有骨架」必须具名说明 —— null 从不沉默', ordinaryProc.note)
  const others = ids.filter((t) => t !== 'debate' && t !== 'ordinary')
  ok(others.length === 4, 'the special-type list is non-empty (RULE E)', others.length)
  ok(others.every((t) => proc.procedureFor(t).hasProcedure === true && Array.isArray(proc.procedureFor(t).procedure.steps)
      && proc.procedureFor(t).procedure.steps.length >= 1),
    '★ the four other SPECIAL types EACH carry a recommended skeleton',
    others.map((t) => [t, proc.procedureFor(t).hasProcedure, proc.procedureFor(t).procedure && proc.procedureFor(t).procedure.steps.length]))
  const otherSteps = others.reduce((a, t) => a.concat(proc.procedureFor(t).procedure.steps), [])
  ok(otherSteps.every((s) => typeof s.what === 'string' && s.what.length > 0),
    'every step of every skeleton says WHAT to do (no placeholder step)', otherSteps.length)
  ok(otherSteps.every((s) => s.tool === undefined || published.has(s.tool)),
    '★ every machine-checkable `tool:` a step names is a REAL published tool (a fake tool name is a fake promise)',
    otherSteps.map((s) => s.tool).filter(Boolean))
  ok(others.length > 0 && others.every((t) => /推荐/.test(String(proc.procedureFor(t).note)) && /不是门禁/.test(String(proc.procedureFor(t).note))),
    'each says in words that the skeleton is a RECOMMENDATION, not a gate', proc.procedureFor('closure').note)
  const decisions = proc.MEETING_PROCEDURE_DECISIONS
  ok(Array.isArray(decisions) && decisions.length > 0 && decisions.length === ids.length
      && ids.every((t) => decisions.some((d) => d.type === t && typeof d.hasProcedure === 'boolean'
        && (d.hasProcedure === true || (typeof d.reason === 'string' && d.reason.length > 10)))),
    '★ EVERY type has a recorded decision (a skeleton, or a NAMED reason) — "no decision" is not a legal state',
    (decisions || []).map((d) => d.type + ':' + d.hasProcedure + (d.reason ? ' / ' + String(d.reason).slice(0, 24) : '')))
  const unknown = proc.procedureFor('weekly-sync')
  ok(unknown.known === false && unknown.hasProcedure === false && /legal:/.test(unknown.note),
    'an unknown type is unknown-by-name and lists the legal values (never a silent empty)', unknown.note)
  const gaps = proc.MEETING_PROCEDURE_GAPS
  // 聚合缺口已闭合（`verdict-aggregation` 从 GAPS 里删除，因为它不再是缺口）；剩下的是人数下限那条。
  ok(Array.isArray(gaps) && gaps.length === 1 && gaps[0].id === 'min-voters',
    'exactly the ONE still-unimplemented rule is registered as a gap (the aggregation gap was closed, not hidden)', gaps && gaps.map((g) => g.id))
  ok(gaps.every((g) => g.status === 'not-implemented' && typeof g.rule === 'string' && typeof g.owner === 'string'),
    'each gap carries the rule text, its status and who must implement it', gaps.map((g) => g.id))

  // ── ③ THE KERNEL CARRIES TYPE + SUBJECT AND READS THEM BACK ────────────────────────────────────────────────
  console.log('=== 3. TYPE AND SUBJECT SURVIVE THE KERNEL AND COME BACK ON THREE READ FACES ===')
  const b = await boot({ root, packs: ['v5r'] })
  const kernel = b.handle.kernel
  await kernel.members.hire({ id: 'r-acad', slot: 'chair' })
  await kernel.members.hire({ id: 'r-1', slot: 'member' })
  const opened = kernel.meetings.open({ type: 'debate', chair: 'r-acad', actor: 'r-acad', roster: ['r-acad', 'r-1'], materials: '辩论 p-1', subject: 'p-1' })
  ok(!!opened && typeof opened.meeting === 'string', 'the kernel convenes a typed meeting', opened && opened.meeting)
  ok(opened.type === 'debate', 'the receipt reports the TYPE it stored (not a hardcoded ordinary)', opened.type)
  ok(opened.subject === 'p-1', '★ the receipt reports the SUBJECT back (the extra field has a consumer now)', opened.subject)
  const mid = opened.meeting
  const sum = kernel.meetings.summary({ meeting: mid })
  ok(sum.ok === true && sum.type === 'debate', 'summary() reports the type', sum && sum.type)
  ok(sum.subject === 'p-1', 'summary() reports the subject', sum.subject)
  const view = kernel.meetings.meetingView({ meeting: mid })
  ok(view.ok === true && view.type === 'debate' && view.subject === 'p-1', 'meetingView() reports both', { type: view && view.type, subject: view && view.subject })
  // a non-string is refused BY NAME: `String({})` would silently store "[object Object]"
  const bad = (() => { try { kernel.meetings.open({ type: 'debate', chair: 'r-acad', actor: 'r-acad', roster: ['r-acad'], subject: { id: 'p-1' } }); return null } catch (e) { return e } })()
  ok(!!bad && bad.code === 'VMU_INVALID_ARGUMENT' && /got object/.test(String(bad.message)),
    '★ a non-string subject is refused by name and its TYPE is named in the message', bad && bad.code + ' / ' + bad.message)
  // an empty/blank subject is stored as null, never as ''
  const blank = kernel.meetings.open({ type: 'academic', chair: 'r-acad', actor: 'r-acad', roster: ['r-acad'], materials: '交流', subject: '   ' })
  ok(blank.subject === null, '★ a blank subject normalises to null (an empty string is not a reference)', blank.subject)
  ok(kernel.meetings.summary({ meeting: blank.meeting }).subject === null, 'the null is what a reader sees (no "" leaking through)', kernel.meetings.summary({ meeting: blank.meeting }).subject)
  // the declared typeCatalog now BINDS in this pack
  const notDeclared = (() => { try { kernel.meetings.open({ type: 'secret', chair: 'r-acad', actor: 'r-acad', roster: ['r-acad'], materials: 'x' }); return null } catch (e) { return e } })()
  ok(!!notDeclared && notDeclared.code === 'VMU_NO_SUCH_OBJECT' && /typeCatalog/.test(String(notDeclared.message)),
    '★ the pack\'s declared typeCatalog binds: an undeclared type is refused with the key named', notDeclared && notDeclared.code + ' / ' + notDeclared.message)
  ok(notDeclared && /ordinary, academic, debate, closure, paper, planning/.test(String(notDeclared.hint)),
    'the refusal lists the legal values (the academician learns the vocabulary from the refusal)', notDeclared && notDeclared.hint)

  // ── ③b THE TITLE: its own carried field (the rule says the chair sets 标题 AND 内容事项, two things) ────────────
  const titled = kernel.meetings.open({ type: 'academic', chair: 'r-acad', actor: 'r-acad', roster: ['r-acad', 'r-1'], materials: '议题正文', title: '第一次学术交流' })
  ok(titled.title === '第一次学术交流', '★ the receipt reports the TITLE back (it is a carried field, not re-derived from the agenda)', titled.title)
  ok(titled.receipt && titled.receipt.title === '第一次学术交流', 'the receipt RECORD carries it too (a reader of the log sees the title)', titled.receipt && titled.receipt.title)
  const titledSum = kernel.meetings.summary({ meeting: titled.meeting })
  ok(titledSum.title === '第一次学术交流' && titledSum.materials === '议题正文',
    '★★ summary() reports title AND materials as TWO DIFFERENT things — the title is not the first line of the agenda',
    { title: titledSum.title, materials: titledSum.materials })
  const noTitle = kernel.meetings.open({ type: 'academic', chair: 'r-acad', actor: 'r-acad', roster: ['r-acad'], materials: 'x' })
  ok(noTitle.title === null && kernel.meetings.summary({ meeting: noTitle.meeting }).title === null,
    '★ omitting the title stores null (no invented title, no crash)', noTitle.title)
  // ★★ the agenda pointer used to be VALIDATED AND THEN DROPPED: `m.materials` had zero readers, so a chair could
  // state 内容事项 and no read face could ever return it. Both halves are asserted, plus the "not derived" proof.
  const titledView = kernel.meetings.meetingView({ meeting: titled.meeting })
  ok(titledView.title === '第一次学术交流' && titledView.materials === '议题正文',
    '★★ meetingView() reports BOTH carried fields (the face the live run actually reads)', { title: titledView.title, materials: titledView.materials })
  const sameAgenda = kernel.meetings.open({ type: 'academic', chair: 'r-acad', actor: 'r-acad', roster: ['r-acad'], materials: '议题正文', title: '另一个标题' })
  ok(kernel.meetings.summary({ meeting: sameAgenda.meeting }).title === '另一个标题' && sameAgenda.title !== titled.title,
    '★★ same agenda text, different title ⇒ different titles (proof the title is CARRIED, not re-derived from materials)',
    { first: titled.title, second: sameAgenda.title })
  const badMaterials = (() => { try { kernel.meetings.open({ type: 'academic', chair: 'r-acad', actor: 'r-acad', roster: ['r-acad'], materials: ['a', 'b'] }); return null } catch (e) { return e } })()
  ok(!!badMaterials && badMaterials.code === 'VMU_INVALID_ARGUMENT' && /got object/.test(String(badMaterials.message)),
    '★ a non-string agenda is refused by name (the pointer is a string, not an array of items)', badMaterials && badMaterials.message)
  const badTitle = (() => { try { kernel.meetings.open({ type: 'academic', chair: 'r-acad', actor: 'r-acad', roster: ['r-acad'], title: { text: 'x' } }); return null } catch (e) { return e } })()
  ok(!!badTitle && badTitle.code === 'VMU_INVALID_ARGUMENT' && /got object/.test(String(badTitle.message)),
    '★ a non-string title is refused by name and its TYPE is named (no "[object Object]" title)', badTitle && badTitle.code + ' / ' + badTitle.message)
  const blankTitle = kernel.meetings.open({ type: 'academic', chair: 'r-acad', actor: 'r-acad', roster: ['r-acad'], title: '   ' })
  ok(blankTitle.title === null, '★ a blank title normalises to null', blankTitle.title)
  ok(kernel.meetings.summary({ meeting: blankTitle.meeting }).materials === null, '★ an omitted agenda reads back as null, never ""', kernel.meetings.summary({ meeting: blankTitle.meeting }).materials)

  // ── ④ THE PACK TOOL: TYPE + SUBJECT REACH THE KERNEL ───────────────────────────────────────────────────────
  console.log('=== 4. THE TOOL FACE PASSES THE TYPE AND THE SUBJECT THROUGH ===')
  const typed = await call(b, 'vibe_v5_meeting', { member: 'r-acad', agenda: '辩论 p-2 的定义是否符合原意', type: 'debate', subject: 'p-2' })
  ok(typed.parsed && typed.parsed.ok === true, 'the tool convenes a debate', typed.parsed)
  ok(typed.parsed && typed.parsed.type === 'debate', 'the receipt carries the requested type (it is no longer hardcoded)', typed.parsed && typed.parsed.type)
  ok(typed.parsed && typed.parsed.subject === 'p-2', 'the receipt carries the subject', typed.parsed && typed.parsed.subject)
  ok(typed.parsed && typed.parsed.procedure && typed.parsed.procedureBinding === 'recommendation',
    '★ a debate receives the recommended skeleton and its binding is printed on the receipt', typed.parsed && typed.parsed.procedureBinding)
  ok(typed.parsed && Array.isArray(typed.parsed.pendingSteps) && typed.parsed.pendingSteps.length === 0,
    '★ the receipt itself reports the (now empty) pending list instead of omitting the field', typed.parsed && typed.parsed.pendingSteps)
  ok(typed.parsed && /推荐/.test(String(typed.parsed.procedureNote)) && /不是门禁/.test(String(typed.parsed.procedureNote)),
    'the receipt says, in words, that the skeleton is a recommendation and not a gate', typed.parsed && typed.parsed.procedureNote)
  const backSum = kernel.meetings.summary({ meeting: typed.parsed.meeting })
  ok(backSum.type === 'debate' && backSum.subject === 'p-2', '★ read-back from the service confirms what the tool claimed', { type: backSum.type, subject: backSum.subject })
  const plain = await call(b, 'vibe_v5_meeting', { member: 'r-acad', agenda: '一般议事' })
  ok(plain.parsed && plain.parsed.ok === true && plain.parsed.type === 'ordinary', 'the default type is ordinary (old callers keep working)', plain.parsed && plain.parsed.type)
  ok(plain.parsed && plain.parsed.procedure === null && plain.parsed.procedureBinding === null
      && /具名决定/.test(String(plain.parsed.procedureNote)),
    '★★ an ordinary meeting reports NO skeleton AND says why（用户裁定 2026-10-24：普通会议不需要推荐骨架）',
    plain.parsed && (plain.parsed.procedureNote || '').slice(0, 90))
  const noSubject = await call(b, 'vibe_v5_meeting', { member: 'r-acad', agenda: '辩论一个没说是什么的东西', type: 'debate' })
  ok(noSubject.parsed && noSubject.parsed.ok === false && noSubject.parsed.code === 'VMU_INVALID_ARGUMENT' && /subject/.test(String(noSubject.parsed.message)),
    '★ a debate with no object is refused by name (never a debate about nothing)', noSubject.parsed && noSubject.parsed.code)
  const badType = await call(b, 'vibe_v5_meeting', { member: 'r-acad', agenda: 'x', type: 'weekly-sync' })
  ok(badType.parsed && badType.parsed.ok === false && badType.parsed.code === 'VMU_INVALID_ARGUMENT' && /ordinary, academic, debate/.test(String(badType.parsed.hint)),
    '★ an unknown type is refused with the legal list in the hint', badType.parsed && badType.parsed.hint)
  // `target` stays a working alias (it was the declared-but-unread parameter; now it has a consumer in both spellings)
  const alias = await call(b, 'vibe_v5_meeting', { member: 'r-acad', agenda: '辩论别名', type: 'debate', target: 'p-3' })
  ok(alias.parsed && alias.parsed.ok === true && alias.parsed.subject === 'p-3', '★ `target` is a live alias for the debate object (it was dead before)', alias.parsed && alias.parsed.subject)

  // ── ⑤ THE CHAIR RAILS (会议只能由院士召开 / 关闭 / 延长) ──────────────────────────────────────────────────────
  // Why this block exists: the rule has THREE verbs, and the first implementation guarded only the shape the kernel
  // could see. Each rail is asserted in BOTH directions (refuses the wrong actor, ACCEPTS the chair) because a gate
  // that refuses everything is not a gate; each refusal is read for its CODE and its named cause, not just "it threw".
  console.log('=== 5. ONLY THE CHAIR CONVENES, CLOSES, EXTENDS ===')
  let now = 1000
  const c = await boot({ root: join(root, 'rails'), packs: ['v5r'], clock: () => now })
  const ck = c.handle.kernel
  await ck.members.hire({ id: 'acad', slot: 'chair' })
  await ck.members.hire({ id: 'r-1', slot: 'member' })
  const err = (fn) => { try { return { value: fn() } } catch (e) { return { error: e } } }

  // ⑤a CONVENE
  const anon = err(() => ck.meetings.open({ chair: 'acad', roster: ['acad', 'r-1'], materials: 'x' }))
  ok(!!anon.error && anon.error.code === 'VMU_NOT_PERMITTED' && /must name that chair as its actor/.test(String(anon.error.message)),
    '★ a convene that installs a chair WITHOUT naming the actor is refused by name', anon.error && anon.error.code)
  const forged = err(() => ck.meetings.open({ chair: 'acad', actor: 'r-1', roster: ['acad', 'r-1'], materials: 'x' }))
  ok(!!forged.error && forged.error.code === 'VMU_NOT_PERMITTED' && /only the member who takes the chair/.test(String(forged.error.message)),
    '★ convening ON BEHALF of another chair is refused (the forgery this rule is about)', forged.error && forged.error.code)
  const asChair = ck.meetings.open({ chair: 'acad', actor: 'acad', roster: ['acad', 'r-1'], materials: '议题' })
  ok(asChair.ok === true && asChair.openedBy === 'acad', 'the chair convening as itself is accepted, and the receipt records openedBy', asChair && asChair.openedBy)
  // ★ THE BOUNDARY, asserted on purpose rather than left implicit: a CHAIRLESS convene has no authority to protect, and
  // that is the shape `v5r.stall-meeting` uses from `control/idle`. The kernel cannot tell a workflow from a member, so
  // it does not pretend to — 「只有院士能召开」 is enforced on the TOOL face below, where the seat is known.
  const chairless = ck.meetings.open({ kind: 'stall', reason: 'idle', materials: '停摆', at: now })
  ok(chairless.ok === true && chairless.openedBy === null,
    '★ the documented boundary: a CHAIRLESS convene is allowed and records openedBy:null (workflow path, not a member path)', chairless && chairless.openedBy)

  // ⑤b CLOSE
  const closeAnon = err(() => ck.meetings.close({ meeting: asChair.meeting }))
  ok(!!closeAnon.error && closeAnon.error.code === 'VMU_NOT_PERMITTED' && /needs the chair to name itself/.test(String(closeAnon.error.message)),
    '★ closing without naming the chair is refused by name', closeAnon.error && closeAnon.error.code)
  const closeWrong = err(() => ck.meetings.close({ meeting: asChair.meeting, actor: 'r-1' }))
  ok(!!closeWrong.error && closeWrong.error.code === 'VMU_NOT_PERMITTED' && /only the declared chair may close/.test(String(closeWrong.error.message)),
    '★ a non-chair member cannot close the meeting', closeWrong.error && closeWrong.error.code)
  const closed = ck.meetings.close({ meeting: asChair.meeting, actor: 'acad' })
  ok(closed.ok === true && closed.closedBy === 'acad', '★ the chair closes it and the receipt records WHO closed', closed && closed.closedBy)
  const closeChairless = ck.meetings.close({ meeting: chairless.meeting })
  ok(closeChairless.ok === true, '★ the chairless boundary holds for close too (a rail must not leave an un-closeable record behind)')

  // ⑤c EXTEND — the MEETING wall bound, not a speech slot
  const forExtend = ck.meetings.open({ chair: 'acad', actor: 'acad', roster: ['acad', 'r-1'], materials: '要延长的会' })
  ok(Number.isFinite(forExtend.wallLimitMs) && forExtend.wallLimitMs > 0, 'a newly opened meeting carries its own wall bound', forExtend.wallLimitMs)
  const extAnon = err(() => ck.meetings.extendWall({ meeting: forExtend.meeting, ms: 600000 }))
  ok(!!extAnon.error && extAnon.error.code === 'VMU_NOT_PERMITTED', '★ extending without naming the chair is refused', extAnon.error && extAnon.error.code)
  const extWrong = err(() => ck.meetings.extendWall({ meeting: forExtend.meeting, ms: 600000, actor: 'r-1' }))
  ok(!!extWrong.error && extWrong.error.code === 'VMU_NOT_PERMITTED' && /only the declared chair may extend/.test(String(extWrong.error.message)),
    '★ a non-chair member cannot extend the meeting', extWrong.error && extWrong.error.code)
  const extBadMs = err(() => ck.meetings.extendWall({ meeting: forExtend.meeting, ms: 0, actor: 'acad' }))
  ok(!!extBadMs.error && extBadMs.error.code === 'VMU_INVALID_ARGUMENT' && /positive step/.test(String(extBadMs.error.message)),
    '★ "extend it a bit" is not an amount: a non-positive step is refused', extBadMs.error && extBadMs.error.code)
  const ext = ck.meetings.extendWall({ meeting: forExtend.meeting, ms: 600000, actor: 'acad', why: '辩论没走完' })
  ok(ext.ok === true && ext.wallLimitMs === forExtend.wallLimitMs + 600000 && ext.receipt.extendedMs === 600000,
    '★ the chair extends it and BOTH numbers come back (before + step)', { before: forExtend.wallLimitMs, after: ext.wallLimitMs })
  ok(ext.receipt.why === '辩论没走完' && ext.receipt.actor === 'acad', 'the extension is auditable (who + why)', { who: ext.receipt.actor, why: ext.receipt.why })
  const extCeil = err(() => ck.meetings.extendWall({ meeting: forExtend.meeting, ms: 86400000, actor: 'acad' }))
  ok(!!extCeil.error && extCeil.error.code === 'VMU_RESOURCE_BUDGET' && /extendCeilingMs/.test(String(extCeil.error.message) + ' ' + String(extCeil.error.hint)),
    '★ extension is NOT unbounded: past the declared ceiling it is refused with the key named', extCeil.error && extCeil.error.code)
  // ★★ THE ASSERTION THAT ACTUALLY MATTERS: the raised bound must be CONSULTED, not merely stored. Speak once past the
  // ORIGINAL limit (must now be allowed) and once past the EXTENDED limit (must be refused, saying it was extended).
  // the speaker must be PRESENT before speak() answers about the wall clock (otherwise the presence rail fires first,
  // and a test that reads the wrong rail as a failure would "prove" the extension for the wrong reason)
  ck.meetings.attend({ meeting: forExtend.meeting, member: 'r-1' })
  now = 1000 + forExtend.wallLimitMs + 1000
  const stillSpoken = err(() => ck.meetings.speak({ meeting: forExtend.meeting, member: 'r-1', text: '时间已超原上界，但会已延长' }))
  ok(!stillSpoken.error, '★★ past the ORIGINAL wall bound but under the extended one the meeting is still usable (the extension is real, not a receipt field)', stillSpoken.error && stillSpoken.error.message)
  now = 1000 + ext.wallLimitMs + 1000
  const nowBlocked = err(() => ck.meetings.speak({ meeting: forExtend.meeting, member: 'r-1', text: '超时' }))
  ok(!!nowBlocked.error && nowBlocked.error.code === 'VMU_RESOURCE_BUDGET' && /extended from/.test(String(nowBlocked.error.message)),
    '★★ past the EXTENDED bound the wall clock refuses AND the message says the bound was extended', nowBlocked.error && nowBlocked.error.code)

  // ⑤d THE TOOL FACES: the pack's convene is chair-only; the kernel face reaches the service's extend
  const byMember = await call(b, 'vibe_v5_meeting', { member: 'r-1', agenda: '我不想让院士开这个会' })
  ok(byMember.parsed && byMember.parsed.ok === false && byMember.parsed.code === 'VMU_NOT_PERMITTED' && /chair seat/.test(String(byMember.parsed.message)),
    '★★ the PACK tool refuses a member who is not in the chair seat (the rule, enforced where the seat is known)', byMember.parsed && byMember.parsed.code)
  const extByTool = await call(b, 'vibe_vmu_meeting', { action: 'extendlimit', id: 'no-such-meeting', ms: 600000, actor: 'acad' })
  ok(extByTool.parsed && extByTool.parsed.ok === false && extByTool.parsed.code === 'VMU_NO_SUCH_OBJECT',
    '★ the kernel face really offers `extendlimit` (an unknown id is refused by name — the action is reachable)', extByTool.parsed && extByTool.parsed.code)

  // ── ⑥ 预约 / 等待 / 继续开会 ────────────────────────────────────────────────────────────────────────────────
  // The rule has three sentences and each one needs its own machine shape: 「院士可以设置（预约）会议时间」,
  // 「到点但法定人数不足 ⇒ 等待阶段」, 「等待超时 ⇒ 院士自行决定怎么做」. The third one is the interesting one:
  // a framework that "helps" by auto-opening on timeout would be a MECHANISM with no authorization, so the honest
  // shape is "make the deadline visible, refuse to decide, and give the chair exactly one attributable way out".
  console.log('=== 6. SCHEDULED START / WAITING / THE CHAIR\'S OWN WAY OUT ===')
  let now2 = 1000
  const HOUR = 3600000
  // a quorum that can actually be UNMET: the default quorum is met by construction (quorumMin 0, quorumCap 3 clamps
  // the requirement to the people present), so a test that never sets these would "prove" the waiting state by
  // silently never entering it.
  const s = await boot({
    root: join(root, 'schedule'), packs: ['v5r'], clock: () => now2,
    // ★ settings arrive as the NESTED `config.vmu` tree (or as dotted `vmu.*` keys on the config itself). A nested
    // `{ settings: {...} }` object is HOST config, not settings — it is accepted and then silently does nothing, which
    // is exactly the "设了值 ≠ 生效了" trap this suite exists to catch: the first version of this block passed
    // `settings: {...}` and every waiting-state assertion below went red because the quorum stayed at its default.
    vmu: { meetings: { quorumMin: 2, quorumCap: 0 } },
  })
  const sk = s.handle.kernel
  await sk.members.hire({ id: 'acad', slot: 'chair' })
  await sk.members.hire({ id: 'r-1', slot: 'member' })
  await sk.members.hire({ id: 'r-2', slot: 'member' })
  const serr = (fn) => { try { return { value: fn() } } catch (e) { return { error: e } } }

  // ⑥a a future `at` creates a SCHEDULED meeting — not an open one carrying a decorative field
  const sched = sk.meetings.open({ chair: 'acad', actor: 'acad', roster: ['acad', 'r-1'], materials: '预约的会', at: now2 + HOUR })
  ok(sched.state === 'scheduled' && sched.scheduledFor === now2 + HOUR && sched.receipt.state === 'scheduled',
    '★★ open({ at: future }) creates a SCHEDULED meeting and the receipt says so (a schedule is a STATE, not a field)', { state: sched.state, at: sched.scheduledFor })
  const sView = sk.meetings.meetingView({ meeting: sched.meeting })
  ok(sView.state === 'scheduled' && sView.scheduledFor === now2 + HOUR && sView.activatedAt === null,
    '★ the read face shows "not started yet" honestly (scheduled + scheduledFor + activatedAt:null)', { state: sView.state, activatedAt: sView.activatedAt })
  const sAct = serr(() => sk.meetings.speak({ meeting: sched.meeting, member: 'acad', text: '提前说话' }))
  ok(!!sAct.error && sAct.error.code === 'VMU_STATE' && /SCHEDULED/.test(String(sAct.error.message)) && /reads .* work now/.test(String(sAct.error.hint)),
    '★★ acting in a meeting that has not started is refused BY NAME, and the hint says reading still works', sAct.error && sAct.error.code)
  const earlyProceed = serr(() => sk.meetings.proceed({ meeting: sched.meeting, actor: 'acad' }))
  ok(!!earlyProceed.error && earlyProceed.error.code === 'VMU_STATE' && /has not arrived yet/.test(String(earlyProceed.error.hint)),
    '★ proceed() BEFORE the start time is refused: nothing is late yet (a way out that is always open is not a way out)', earlyProceed.error && earlyProceed.error.code)
  const sStatus = sk.meetings.status()
  ok(sStatus.scheduledMeetings.some((x) => x.meeting === sched.meeting),
    '★ status() lists it under scheduledMeetings (an operator can tell runnable from scheduled without opening it)', sStatus.scheduledMeetings)

  // ⑥b the WAIT is the only act allowed before the start, and it is what lets the wait ever succeed
  const earlyAttend = sk.meetings.attend({ meeting: sched.meeting, member: 'r-1' })
  ok(earlyAttend.ok === true && earlyAttend.state === 'scheduled' && earlyAttend.settled === null,
    '★★ attending BEFORE the start time is allowed and recorded — without this exemption a waiting meeting could never reach quorum (the wait would be a dead end)', { state: earlyAttend.state, settled: earlyAttend.settled })
  now2 = now2 + HOUR
  const dueMet = sk.meetings.meetingView({ meeting: sched.meeting })
  ok(dueMet.state === 'open' && dueMet.startedLate === true && dueMet.activatedAt === now2,
    '★★ at the scheduled time with the quorum met, the NEXT TOUCH opens it — no timer, no background job, replayable', { state: dueMet.state, activatedAt: dueMet.activatedAt })

  // ⑥c quorum SHORT at the due time ⇒ waiting (and it is a named state, not "still scheduled")
  now2 = now2 + HOUR
  const shortMtg = sk.meetings.open({ chair: 'acad', actor: 'acad', roster: ['acad', 'r-1'], materials: '到点人不够', at: now2 + HOUR })
  now2 = now2 + HOUR
  const waiting = sk.meetings.meetingView({ meeting: shortMtg.meeting })
  ok(waiting.state === 'waiting' && Number.isFinite(waiting.waitStartedAt) && waiting.waitDecisionDue === false,
    '★★ quorum short at the due time ⇒ WAITING, with the moment the wait began on the record', { state: waiting.state, waitStartedAt: waiting.waitStartedAt })
  const wAct = serr(() => sk.meetings.speak({ meeting: shortMtg.meeting, member: 'acad', text: '人没到齐就说话' }))
  ok(!!wAct.error && wAct.error.code === 'VMU_STATE' && /WAITING/.test(String(wAct.error.message)) && /waitOnDueMs/.test(String(wAct.error.hint)),
    '★ acting while WAITING is refused by name and the hint names the wait key', wAct.error && wAct.error.code)
  const wStatus = sk.meetings.status()
  ok(wStatus.waitingMeetings.some((x) => x.meeting === shortMtg.meeting) && wStatus.waitDecisionDue.length === 0,
    '★ status() separates waitingMeetings from waitDecisionDue (the actionable half is not mixed in)', { waiting: wStatus.waitingMeetings.length, due: wStatus.waitDecisionDue.length })
  // ★★ THE ASSERTION THE EXEMPTION EXISTS FOR: the latecomer arrives and the meeting starts by itself
  const lateArrive = sk.meetings.attend({ meeting: shortMtg.meeting, member: 'r-1' })
  ok(lateArrive.settled === 'started' && lateArrive.state === 'open',
    '★★ a latecomer completing the roster turns WAITING into a running meeting on that touch — the wait is not a dead end', { settled: lateArrive.settled, state: lateArrive.state })

  // ⑥d the wait EXPIRES and the framework still does NOT decide
  now2 = now2 + HOUR
  const expiring = sk.meetings.open({ chair: 'acad', actor: 'acad', roster: ['acad', 'r-1', 'r-2'], materials: '等到超时', at: now2 + HOUR })
  now2 = now2 + HOUR
  const startedWait = sk.meetings.meetingView({ meeting: expiring.meeting })
  ok(startedWait.state === 'waiting', 'the second scheduled meeting is waiting (RULE E: the expiry assertion below is not vacuous)', startedWait.state)
  now2 = now2 + 300000 + 1
  const expired = sk.meetings.meetingView({ meeting: expiring.meeting })
  ok(expired.state === 'waiting' && expired.waitDecisionDue === true,
    '★★ when the wait EXPIRES the state is still `waiting` and only the deadline flag flips — the framework makes the decision VISIBLE instead of making it', { state: expired.state, due: expired.waitDecisionDue })
  ok(sk.meetings.status().waitDecisionDue.includes(expiring.meeting),
    '★ the expired wait is in the operator-visible actionable list (waitDecisionDue)', sk.meetings.status().waitDecisionDue)
  // the chair's one way out, and it is attributable
  const pAnon = serr(() => sk.meetings.proceed({ meeting: expiring.meeting }))
  ok(!!pAnon.error && pAnon.error.code === 'VMU_NOT_PERMITTED' && /needs the chair to name itself/.test(String(pAnon.error.message)),
    '★★ overriding an unmet quorum without saying WHO is refused by name (an authority act must be attributable)', pAnon.error && pAnon.error.code)
  const pWrong = serr(() => sk.meetings.proceed({ meeting: expiring.meeting, actor: 'r-1' }))
  ok(!!pWrong.error && pWrong.error.code === 'VMU_NOT_PERMITTED' && /only the meeting’s chair/.test(String(pWrong.error.message)),
    '★★ a non-chair member cannot start a waiting meeting', pWrong.error && pWrong.error.code)
  const proceed = sk.meetings.proceed({ meeting: expiring.meeting, actor: 'acad', why: '只剩三个人，等不起了' })
  ok(proceed.ok === true && proceed.state === 'open' && proceed.startedLate === true,
    '★★ the chair starts it anyway, and the receipt records startedLate', { state: proceed.state, startedLate: proceed.startedLate })
  ok(proceed.beforeDeadline === false && proceed.receipt.beforeDeadline === false && proceed.waitedMs > 300000,
    '★ the receipt says the chair decided AFTER the declared wait (an early start would have to be distinguishable from an on-time one)', { beforeDeadline: proceed.beforeDeadline, waitedMs: proceed.waitedMs })
  ok(proceed.receipt.by === 'acad' && proceed.receipt.why === '只剩三个人，等不起了',
    '★ who + why are on the record (the meeting is now legally running with a short quorum)', { by: proceed.receipt.by })
  // ★★ R5 — THE AUTHORITY RAIL MUST NOT BE SHADOWED BY THE STATE RAIL. Measured in the phase-12 live run: the state
  // gate came first, so a non-chair on a meeting that was NOT waiting received the byte-identical `VMU_STATE` reply the
  // chair receives, i.e. "only the chair decides" was true but unobservable. These three assertions pin the ORDER.
  {
    const openMtg = sk.meetings.open({ chair: 'acad', actor: 'acad', roster: ['acad', 'r-1'], materials: '状态闸与权轨的先后' })
    const byWrongOnOpen = serr(() => sk.meetings.proceed({ meeting: openMtg.meeting, actor: 'r-1' }))
    const byChairOnOpen = serr(() => sk.meetings.proceed({ meeting: openMtg.meeting, actor: 'acad' }))
    const byAnonOnOpen = serr(() => sk.meetings.proceed({ meeting: openMtg.meeting }))
    ok(!!byWrongOnOpen.error && byWrongOnOpen.error.code === 'VMU_NOT_PERMITTED',
      '★★★ R5: a NON-chair is refused for WHO IT IS even when the meeting is not waiting — the seat rail is asked first', byWrongOnOpen.error && byWrongOnOpen.error.code)
    ok(!!byChairOnOpen.error && byChairOnOpen.error.code === 'VMU_STATE',
      '★★★ R5: and the CHAIR then gets the state refusal — the two callers are now distinguishable', byChairOnOpen.error && byChairOnOpen.error.code)
    ok(byWrongOnOpen.error.code !== byChairOnOpen.error.code && !/is open|is scheduled/.test(String(byWrongOnOpen.error.message)),
      '★★★ R5: the two refusals differ by code AND the non-chair is not told the meeting\'s phase', { nonChair: byWrongOnOpen.error.code, chair: byChairOnOpen.error.code })
    ok(!!byAnonOnOpen.error && byAnonOnOpen.error.code === 'VMU_NOT_PERMITTED' && /name itself/.test(String(byAnonOnOpen.error.message)),
      '★★ R5: no actor is a named refusal too (never a silent "well, you are not the chair, whoever you are")', byAnonOnOpen.error && byAnonOnOpen.error.code)
  }
  const afterProceed = sk.meetings.attend({ meeting: expiring.meeting, member: 'r-1' })
  const speakAfter = sk.meetings.speak({ meeting: expiring.meeting, member: 'r-1', text: '开始了' })
  ok(afterProceed.ok === true && speakAfter.ok !== false,
    '★★ after proceed() the meeting really RUNS (attending and speaking are no longer refused) — the exit is not cosmetic', { attend: afterProceed.ok, speak: speakAfter.ok })

  // ⑥e the other half of the deadline flag: an EARLY proceed is recorded distinguishably
  now2 = now2 + HOUR
  const earl = sk.meetings.open({ chair: 'acad', actor: 'acad', roster: ['acad', 'r-1', 'r-2'], materials: '没超时就接着开', at: now2 + HOUR })
  now2 = now2 + HOUR
  const earlyWake = sk.meetings.proceed({ meeting: earl.meeting, actor: 'acad' })
  ok(earlyWake.ok === true && earlyWake.beforeDeadline === true,
    '★ the chair may also decide BEFORE the declared wait runs out, and the receipt marks it as such', { beforeDeadline: earlyWake.beforeDeadline })

  // ⑥f the capability can be turned OFF, and then it is a NAMED refusal — never a silent "open now"
  const off = await boot({ root: join(root, 'off'), packs: ['v5r'], clock: () => now2, vmu: { meetings: { scheduleAllowed: false } } })
  const offk = off.handle.kernel
  await offk.members.hire({ id: 'acad', slot: 'chair' })
  const offErr = serr(() => offk.meetings.open({ chair: 'acad', actor: 'acad', roster: ['acad'], materials: 'x', at: now2 + HOUR }))
  ok(!!offErr.error && offErr.error.code === 'VMU_STATE' && /vmu\.meetings\.scheduleAllowed=false/.test(String(offErr.error.message)),
    '★★ with vmu.meetings.scheduleAllowed=false, scheduling is refused BY NAME and the key is printed (the old behaviour was to silently open now)', offErr.error && offErr.error.code)
  const offNow = offk.meetings.open({ chair: 'acad', actor: 'acad', roster: ['acad'], materials: '立即开' })
  ok(offNow.ok === true && offNow.state === 'open',
    '★ the switch is about SCHEDULING, not about meetings: an immediate convene still works with it off', offNow.state)

  // ⑥g A TIME IS A NUMBER **OR** AN ISO STRING — and anything else is refused by name
  // Measured before this existed: `const ms = at === null ? clock() : at` stored the raw value, so an ISO string became a
  // STRING `openedAt`, `ms > clock()` was a string/number comparison (always false ⇒ the "scheduled" meeting silently
  // opened NOW), and `ms + budgetWallMs` string-concatenated the wall bound. A model passing a timestamp is normal,
  // so the framework takes both forms; it must not coerce the difference away.
  const isoFuture = new Date(now2 + HOUR).toISOString()
  const isoMtg = sk.meetings.open({ chair: 'acad', actor: 'acad', roster: ['acad', 'r-1'], materials: '用 ISO 时间预约', at: isoFuture })
  ok(isoMtg.state === 'scheduled' && isoMtg.scheduledFor === (now2 + HOUR),
    '★★ an ISO-8601 string is accepted as a start time and normalised to epoch ms (a model passes timestamps, not numbers)', { state: isoMtg.state, scheduledFor: isoMtg.scheduledFor })
  ok(typeof isoMtg.scheduledFor === 'number' && Number.isFinite(isoMtg.wallLimitMs),
    '★★ the stored start time is a NUMBER (the old code stored the string and `ms + budgetWallMs` concatenated it)', { type: typeof isoMtg.scheduledFor, wall: isoMtg.wallLimitMs })
  const badAt = serr(() => sk.meetings.open({ chair: 'acad', actor: 'acad', roster: ['acad'], materials: 'x', at: 'next tuesday' }))
  ok(!!badAt.error && badAt.error.code === 'VMU_INVALID_ARGUMENT' && /not a usable time/.test(String(badAt.error.message)) && /next tuesday/.test(String(badAt.error.message)),
    '★★ an unparseable time is refused BY NAME and the offending value is printed (never coerced to 0 ⇒ "open now")', badAt.error && badAt.error.code)
  const nullAt = serr(() => sk.meetings.open({ chair: 'acad', actor: 'acad', roster: ['acad'], materials: 'x', at: { soon: true } }))
  ok(!!nullAt.error && nullAt.error.code === 'VMU_INVALID_ARGUMENT' && /got object/.test(String(nullAt.error.message)),
    '★ a non-string non-number is refused and its TYPE is named', nullAt.error && nullAt.error.code)

  // ── ⑧ ONE CALL, SEVERAL CONSECUTIVE MEETINGS (PHASE 12 D6) ────────────────────────────────────────────────
  // 「允许一次性设置连续展开的多个会议（例如先进行学术交流会议再开展未来规划交流和任务安排分配会议）」
  // Before this existed the sentence had no shape at all: `open()` took one meeting and `close()` ended the story.
  // The assertions below split into three questions that must not be confused:
  //   (a) is the DECLARATION validated when it is made (not three meetings later)?
  //   (b) does closing really OPEN the next one, with the declared type, and does the read-back say what is pending?
  //   (c) when the next one cannot open, is that a NAMED failure that does not eat the closure and does not consume
  //       the sequence (a silent skip would look exactly like "there was nothing left").
  console.log('=== 8. 一次性设置连续展开的多个会议: 声明即校验、关闭即展开、失败具名 ===')
  const seqMs = 3000
  const qb = await boot({ root: join(root, 'seq'), packs: ['v5r'], clock: () => seqMs })
  const qk = qb.handle.kernel
  await qk.members.hire({ id: 'acad', slot: 'chair' })
  await qk.members.hire({ id: 'r-1', slot: 'member' })

  const seqOpen = qk.meetings.open({
    chair: 'acad', actor: 'acad', roster: ['acad', 'r-1'], materials: '学术交流', type: 'academic',
    sequence: [{ type: 'planning', materials: '未来规划', subject: 'p-plan' }, { type: 'closure', materials: '结题' }],
  })
  ok(seqOpen.sequence && seqOpen.sequence.total === 3, '★ one call declares THIS meeting plus two follow-ups (total 3)', seqOpen.sequence)
  ok(seqOpen.sequence.next && seqOpen.sequence.next.type === 'planning', '★ the receipt names the NEXT meeting it will open (not just a count)', seqOpen.sequence && seqOpen.sequence.next)
  const seqSum = qk.meetings.summary({ meeting: seqOpen.meeting })
  ok(seqSum.sequence && seqSum.sequence.remaining === 2 && seqSum.sequence.total === 3, '★★ the pending count READS BACK from the kernel (a declared-only sequence would be invisible here)', seqSum.sequence)
  const seqView = qk.meetings.meetingView({ meeting: seqOpen.meeting })
  ok(seqView.sequence && seqView.sequence.next && seqView.sequence.next.subject === 'p-plan', '★ the next one\'s subject survives the round trip (its materials text does NOT — a head view is a pointer)', seqView.sequence && seqView.sequence.next)

  // (a) the declaration is validated NOW — every refusal names the entry INDEX and the offending thing
  const badSeq = (args) => serr(() => qk.meetings.open(Object.assign({ chair: 'acad', actor: 'acad', roster: ['acad'], materials: 'x' }, args)))
  const sNotArray = badSeq({ sequence: 'planning' })
  ok(!!sNotArray.error && sNotArray.error.code === 'VMU_INVALID_ARGUMENT' && /ARRAY/.test(String(sNotArray.error.message)) && /got string/.test(String(sNotArray.error.message)),
    '★ a non-array sequence is refused by name and its TYPE is printed', sNotArray.error && sNotArray.error.code)
  const sUnknownKey = badSeq({ sequence: [{ agenda: 'x' }] })
  ok(!!sUnknownKey.error && sUnknownKey.error.code === 'VMU_INVALID_ARGUMENT' && /sequence\[0\]/.test(String(sUnknownKey.error.message)) && /unknown key "agenda"/.test(String(sUnknownKey.error.message)),
    '★★ an unknown descriptor key is refused WITH ITS INDEX — never silently ignored (a typo would otherwise become a default meeting)', sUnknownKey.error && sUnknownKey.error.message)
  const sChair = badSeq({ sequence: [{ chair: 'r-9' }] })
  ok(!!sChair.error && sChair.error.code === 'VMU_INVALID_ARGUMENT' && /unknown key "chair"/.test(String(sChair.error.message)) && /inherited/.test(String(sChair.error.hint)),
    '★★ a descriptor may NOT install a chair: that would be a second convene path that never passed the convene rail', sChair.error && sChair.error.message)
  const sBadType = badSeq({ sequence: [{ type: 'secret' }] })
  ok(!!sBadType.error && sBadType.error.code === 'VMU_NO_SUCH_OBJECT' && /sequence\[0\]/.test(String(sBadType.error.message)) && /typeCatalog/.test(String(sBadType.error.message)),
    '★ the type of a follow-up is checked against the SAME catalogue before anything is opened', sBadType.error && sBadType.error.code)
  const sBadAt = badSeq({ sequence: [{ at: 'next tuesday' }] })
  ok(!!sBadAt.error && sBadAt.error.code === 'VMU_INVALID_ARGUMENT' && /sequence\[0\]\.at/.test(String(sBadAt.error.message)),
    '★ an unparseable follow-up time is refused with the entry index', sBadAt.error && sBadAt.error.code)
  const sNull = badSeq({ sequence: [null] })
  ok(!!sNull.error && sNull.error.code === 'VMU_INVALID_ARGUMENT' && /must be an OBJECT/.test(String(sNull.error.message)),
    '★ a null entry is refused (no crash, no silent skip)', sNull.error && sNull.error.code)

  // (b) closing really opens the next one
  const close1 = qk.meetings.close({ meeting: seqOpen.meeting, actor: 'acad' })
  ok(typeof close1.nextMeeting === 'string' && close1.nextMeeting !== seqOpen.meeting, '★★ closing the first meeting OPENED the second one', { next: close1.nextMeeting })
  ok(close1.receipt && close1.receipt.sequence && close1.receipt.sequence.index === 1 && close1.receipt.sequence.total === 2,
    '★★ the close RECEIPT records which step of the sequence advanced (index 1 of 2)', close1.receipt && close1.receipt.sequence)
  const second = qk.meetings.summary({ meeting: close1.nextMeeting })
  ok(second.ok === true && second.type === 'planning', '★★ the follow-up opened with the type the chair DECLARED (not ordinary)', { type: second && second.type })
  ok(second.sequence && second.sequence.remaining === 1, '★ the remaining part of the sequence was carried onto the new meeting', second.sequence)
  const close2 = qk.meetings.close({ meeting: close1.nextMeeting, actor: 'acad' })
  const third = qk.meetings.summary({ meeting: close2.nextMeeting })
  ok(third.ok === true && third.type === 'closure' && third.sequence && third.sequence.remaining === 0,
    '★★ the second close opened the third and last meeting; nothing is left pending', { type: third && third.type, seq: third && third.sequence })
  const close3 = qk.meetings.close({ meeting: close2.nextMeeting, actor: 'acad' })
  ok(close3.nextMeeting === null && close3.nextMeetingError === null,
    '★ the last close reports `null` for the next meeting and NO error: "there was nothing left" is a different fact from "one was refused"', { next: close3.nextMeeting, err: close3.nextMeetingError })

  // (c) a refused advance is NAMED, does not undo the closure, and does not consume the sequence
  const rb = await boot({ root: join(root, 'seq-refuse'), packs: ['v5r'], clock: () => seqMs, vmu: { meetings: { scheduleAllowed: false } } })
  const rk = rb.handle.kernel
  await rk.members.hire({ id: 'acad', slot: 'chair' })
  // ★ WHY THIS BOOT SHAPE: `vmu.meetings.scheduleAllowed` is read ONCE, at construction (`meetings.js:164`
  // `sget(...)`), so flipping it on a live kernel would prove nothing about the rail — that is the old trap
  // 「设了值 ≠ 生效了」. The deployment below is the realistic one: scheduling is OFF and the chair still
  // declares a follow-up that needs a future start time.
  const willRefuse = rk.meetings.open({
    chair: 'acad', actor: 'acad', roster: ['acad'], materials: '下一场是预约的',
    sequence: [{ type: 'academic', materials: '预约的下一场', at: seqMs + HOUR }],
  })
  ok(willRefuse.ok === true, '★ the immediate meeting itself still opens (the switch is about SCHEDULING, not meetings)', willRefuse && willRefuse.state)
  const closeRefused = rk.meetings.close({ meeting: willRefuse.meeting, actor: 'acad' })
  ok(closeRefused.ok === true, '★★ the closure itself SUCCEEDED — a refused follow-up must not un-close a meeting that really closed', closeRefused && closeRefused.ok)
  ok(closeRefused.nextMeeting === null && closeRefused.nextMeetingError && closeRefused.nextMeetingError.code === 'VMU_STATE',
    '★★ the refused advance is named (`VMU_STATE`, scheduleAllowed=false) instead of silently skipped', closeRefused.nextMeetingError && closeRefused.nextMeetingError.code)
  ok(/vmu\.meetings\.scheduleAllowed=false/.test(String(closeRefused.nextMeetingError && closeRefused.nextMeetingError.message)),
    '★ the refusal prints the SETTING that refused it (the reader does not have to guess)', closeRefused.nextMeetingError && closeRefused.nextMeetingError.message)
  // ── ⑧ FINDINGS (g) AND (j) OF THE INSTITUTE'S OWN ACCEPTANCE REPORT (phase 12, live run 12) ────────────────
  console.log('=== 8. TWO MISLEADING REFUSALS THE INSTITUTE REPORTED ITSELF ===')
  const bb = await boot({ root: join(root, 'x8'), packs: ['v5r'] })
  // (j) the pack's meeting face CONVENES ONLY. A read call sent to it used to be silently re-interpreted as "convene
  // with no agenda", so the refusal named a field the caller never meant to supply.
  const readOnConvene = await call(bb, 'vibe_v5_meeting', { action: 'status', id: 'm-1' })
  ok(readOnConvene.missing === false, 'setup: the convene face is present', readOnConvene.missing)
  ok(readOnConvene.parsed && readOnConvene.parsed.ok === false && readOnConvene.parsed.code === 'VMU_INVALID_ARGUMENT',
    '(j) an action on the convene-only face is a NAMED refusal', readOnConvene.parsed && (readOnConvene.parsed.code || readOnConvene.raw))
  ok(typeof readOnConvene.parsed.message === 'string' && /CONVENES/.test(readOnConvene.parsed.message),
    '(j) the message says the face only convenes (so the reader stops looking for a dispatch bug)', readOnConvene.parsed && readOnConvene.parsed.message)
  ok(typeof readOnConvene.parsed.message === 'string' && !/agenda/i.test(readOnConvene.parsed.message),
    '★ (j) and it does NOT claim an agenda is missing - that was the misleading part', readOnConvene.parsed && readOnConvene.parsed.message)
  ok(typeof readOnConvene.parsed.hint === 'string' && /vibe_vmu_meeting/.test(readOnConvene.parsed.hint) && /status/.test(readOnConvene.parsed.hint),
    '(j) the hint points at the face that can answer (vibe_vmu_meeting { action: "status" })', readOnConvene.parsed && readOnConvene.parsed.hint)
  const plainConvene = await call(bb, 'vibe_v5_meeting', { member: 'r-acad', agenda: 'x' })
  ok(plainConvene.parsed && plainConvene.parsed.ok !== undefined,
    'control: a real convene still reaches the kernel (the guard above did not block it)', plainConvene.parsed && plainConvene.parsed.code)

  // (g) a selection is accepted in the three shapes the docs describe, and an unreadable one is REFUSED, never silently
  // replaced by the default roster. Before the fix only {id} objects survived; plain strings were filtered out.
  ok(bb.handle.kernel && bb.handle.kernel.turn && typeof bb.handle.kernel.turn.step === 'function',
    'setup: the kernel exposes the turn step (otherwise (g) is not reachable here)', bb.handle.kernel && bb.handle.kernel.turn)
  let unreadableErr = null
  try { await bb.handle.kernel.turn.step({ members: [{ nope: 1 }] }) } catch (e) { unreadableErr = e }
  ok(unreadableErr !== null && unreadableErr.code === 'VMU_INVALID_ARGUMENT',
    '(g) an unreadable members entry REFUSES by name (the silent fallback to the default roster is gone)', unreadableErr && (unreadableErr.code || String(unreadableErr)))
  ok(unreadableErr !== null && /entries in members/.test(String(unreadableErr.message)) && /nope/.test(String(unreadableErr.message) + String(unreadableErr.hint || '')),
    '(g) and the message quotes the offending value, so the caller can fix it without guessing', unreadableErr && String(unreadableErr.message))
  let stringOutcome = null
  try { stringOutcome = await bb.handle.kernel.turn.step({ members: ['definitely-not-a-member'] }) } catch (e) { stringOutcome = { thrown: e, code: e && e.code, message: String((e && e.message) || e) } }
  const stringRefusal = stringOutcome && stringOutcome.thrown === undefined && stringOutcome.ok === false ? String(stringOutcome.code || '') + ' ' + String(stringOutcome.message || '') : (stringOutcome ? String(stringOutcome.code || stringOutcome.message || '') : '')
  // ★ THE POINT IS *NOT* WHICH FAILURE: it is that the selection was not silently replaced by the default roster. Before the
  // fix the list became empty here and the turn ran for somebody else; now the named member reaches the loop and the loop
  // says something about THAT member (a step failure is a returned outcome by design, not a throw).
  // The loop got as far as DELIVERY and refused there (no subagents service in this boot) - which is exactly what proves
  // the explicit selection was honoured. Before the fix the same call returned `stopped:'no-members'` because the string
  // was filtered out and no roster member was passed through. (The delivery refusal itself does not name the member;
  // that is a separate reading, recorded here rather than asserted away.)
  ok(stringOutcome !== null && stringOutcome.stopped !== 'no-members' && stringOutcome.code === 'VMU_ENGINE_UNAVAILABLE',
    '★ (g) a PLAIN STRING selection is no longer filtered away: the loop accepts the id and only refuses at DELIVERY (before, it stopped at no-members and would have used the DEFAULT roster)', stringOutcome && (stringOutcome.code || stringOutcome.stopped || stringOutcome.message))
} finally {
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
}


  console.log('=== 9. QUORUM FLOOR SOURCE: under the v5r rule an UNSET setting is not "no floor" ===')
  // The rule: 「辩论、结题表决的人数至少为某一定数量，这个数量取用户设置的数量和『院士+常驻研究员』数量的最小值」.
  // Read literally that is min(user setting, chair+residents). When the user set NO number the honest reading is that the
  // floor IS chair+residents — but the framework's long-standing reading of 0/0 is "the deployment declared no floor".
  // Both readings are real, so the SOURCE is a declared policy (kernel default 'setting' = old behaviour, v5r declares
  // 'universe'). This section pins BOTH, plus the direction of the min: a declared number may only NARROW the universe.
  const bootFloor = async (vmu2, tag) => boot({ root: join(root, 'floor-' + tag), packs: ['v5r'], clock: () => 1000, vmu: vmu2 })
  const seat3 = async (k) => {
    await k.members.hire({ id: 'acad', slot: 'chair' })
    await k.members.hire({ id: 'f-1', slot: 'member' })
    await k.members.hire({ id: 'f-2', slot: 'member' })
  }

  // ⑨a the framework default: 0/0 means NO floor, and the receipt says exactly that
  const bA = await bootFloor({ meetings: { quorumFloorSource: 'setting' } }, 'a')
  await seat3(bA.handle.kernel)
  const oA = bA.handle.kernel.meetings.open({ chair: 'acad', actor: 'acad', roster: ['acad', 'f-1', 'f-2'], materials: 'floor-a' })
  ok(oA.quorum.voteFloor.source === 'setting' && oA.quorum.required === 0,
    '★★ source=setting: an unset quorumMin/quorumRatio still means NO floor (the framework default is untouched)', { source: oA.quorum.voteFloor.source, required: oA.quorum.required })
  ok(/declared no floor/.test(String(oA.quorum.voteFloor.zeroBecause)),
    '★ and the 0 is EXPLAINED (zeroBecause names the input) instead of being left for a reader to infer', oA.quorum.voteFloor.zeroBecause)

  // ⑨b v5r's declaration: the floor is the eligible universe, so 0/0 can no longer mean "the bar is absent"
  const bB = await bootFloor({ meetings: { quorumFloorSource: 'universe' } }, 'b')
  await seat3(bB.handle.kernel)
  const oB = bB.handle.kernel.meetings.open({ chair: 'acad', actor: 'acad', roster: ['acad', 'f-1', 'f-2'], materials: 'floor-b' })
  ok(oB.quorum.voteFloor.source === 'universe' && oB.quorum.required === 3,
    '★★ source=universe: with no declared number the floor is chair+residents (3 of 3), not 0 — the rule finally has a landing point', { source: oB.quorum.voteFloor.source, required: oB.quorum.required, universe: oB.quorum.voteFloor.eligibleUniverse })
  ok(/院士/.test(String(oB.quorum.voteFloor.sourceMeans)) && /min\(/.test(String(oB.quorum.voteFloor.sourceMeans)),
    '★ the receipt quotes the RULE it implements (院士＋常驻 + the min) instead of only naming a switch', oB.quorum.voteFloor.sourceMeans)
  ok(oB.quorum.voteFloor.zeroBecause === null,
    '★ zeroBecause is null here: 0 is not reachable by 0/0 policy any more', oB.quorum.voteFloor.zeroBecause)

  // ⑨c the min runs the RULE's way: a declared number NARROWS, it never raises
  const bC = await bootFloor({ meetings: { quorumFloorSource: 'universe', quorumMin: 2, quorumCap: 3 } }, 'c')
  await seat3(bC.handle.kernel)
  const oC = bC.handle.kernel.meetings.open({ chair: 'acad', actor: 'acad', roster: ['acad', 'f-1', 'f-2'], materials: 'floor-c' })
  ok(oC.quorum.required === 2,
    '★★ a declared quorumMin=2 NARROWS the 3-seat universe to 2 (min(用户设置, 院士+常驻))', { required: oC.quorum.required })
  const bD = await bootFloor({ meetings: { quorumFloorSource: 'universe', quorumMin: 5, quorumCap: 3 } }, 'd')
  await seat3(bD.handle.kernel)
  const oD = bD.handle.kernel.meetings.open({ chair: 'acad', actor: 'acad', roster: ['acad', 'f-1', 'f-2'], materials: 'floor-d' })
  ok(oD.quorum.required === 3,
    '★★★ quorumMin=5 on a 3-seat universe yields 3, NOT 5 — the discriminating case: max() would have demanded an unmeetable 5, the rule says min(setting, universe)', { required: oD.quorum.required, universe: oD.quorum.voteFloor.eligibleUniverse })

console.log('')
if (failures.length) { console.error('FAILURES:'); for (const f of failures) console.error('  · ' + f) }
console.log('=== VMU MEETING TYPES: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed ? 1 : 0)

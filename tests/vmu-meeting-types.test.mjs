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
  ok(steps[3].status === 'pending' && typeof steps[3].pendingReason === 'string' && steps[3].pendingReason.length > 40,
    '★ step 4 (aggregate + notify the card holder) is reported as NOT implemented, with a reason', steps[3].status)
  ok(Array.isArray(d.pendingSteps) && d.pendingSteps.length === 1 && d.pendingSteps[0].n === 4,
    'the tool-facing `pendingSteps` names exactly the unimplemented step', d.pendingSteps)
  // every step must name only tools that really exist
  const toolNames = steps.reduce((a, s) => a.concat(s.tools.map((t) => t.split(' ')[0])), [])
  const known = ['vibe_vmu_meeting', 'vibe_v5_verdict', 'vibe_v5_say', 'vibe_v5_message']
  ok(toolNames.length > 0 && toolNames.every((t) => known.includes(t)), 'every tool a step names is a real published tool', toolNames)
  const others = ids.filter((t) => t !== 'debate')
  ok(others.length === 5, 'the non-debate list is non-empty (RULE E)', others.length)
  ok(others.every((t) => proc.procedureFor(t).hasProcedure === false && proc.procedureFor(t).procedure === null),
    '★ the five other types report NO skeleton (nothing is invented) ', others.map((t) => [t, proc.procedureFor(t).hasProcedure]))
  ok(others.every((t) => /没有推荐流程骨架/.test(proc.procedureFor(t).note)), 'each says WHY it has none', proc.procedureFor('closure').note)
  const unknown = proc.procedureFor('weekly-sync')
  ok(unknown.known === false && unknown.hasProcedure === false && /legal:/.test(unknown.note),
    'an unknown type is unknown-by-name and lists the legal values (never a silent empty)', unknown.note)
  const gaps = proc.MEETING_PROCEDURE_GAPS
  ok(Array.isArray(gaps) && gaps.length === 2, 'the two unimplemented RULES are registered as gaps', gaps && gaps.length)
  ok(gaps.every((g) => g.status === 'not-implemented' && typeof g.rule === 'string' && typeof g.owner === 'string'),
    'each gap carries the rule text, its status and who must implement it', gaps.map((g) => g.id))

  // ── ③ THE KERNEL CARRIES TYPE + SUBJECT AND READS THEM BACK ────────────────────────────────────────────────
  console.log('=== 3. TYPE AND SUBJECT SURVIVE THE KERNEL AND COME BACK ON THREE READ FACES ===')
  const b = await boot({ root, packs: ['v5r'] })
  const kernel = b.handle.kernel
  await kernel.members.hire({ id: 'r-acad', slot: 'chair' })
  await kernel.members.hire({ id: 'r-1', slot: 'member' })
  const opened = kernel.meetings.open({ type: 'debate', chair: 'r-acad', roster: ['r-acad', 'r-1'], materials: '辩论 p-1', subject: 'p-1' })
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
  const bad = (() => { try { kernel.meetings.open({ type: 'debate', chair: 'r-acad', roster: ['r-acad'], subject: { id: 'p-1' } }); return null } catch (e) { return e } })()
  ok(!!bad && bad.code === 'VMU_INVALID_ARGUMENT' && /got object/.test(String(bad.message)),
    '★ a non-string subject is refused by name and its TYPE is named in the message', bad && bad.code + ' / ' + bad.message)
  // an empty/blank subject is stored as null, never as ''
  const blank = kernel.meetings.open({ type: 'academic', chair: 'r-acad', roster: ['r-acad'], materials: '交流', subject: '   ' })
  ok(blank.subject === null, '★ a blank subject normalises to null (an empty string is not a reference)', blank.subject)
  ok(kernel.meetings.summary({ meeting: blank.meeting }).subject === null, 'the null is what a reader sees (no "" leaking through)', kernel.meetings.summary({ meeting: blank.meeting }).subject)
  // the declared typeCatalog now BINDS in this pack
  const notDeclared = (() => { try { kernel.meetings.open({ type: 'secret', chair: 'r-acad', roster: ['r-acad'], materials: 'x' }); return null } catch (e) { return e } })()
  ok(!!notDeclared && notDeclared.code === 'VMU_NO_SUCH_OBJECT' && /typeCatalog/.test(String(notDeclared.message)),
    '★ the pack\'s declared typeCatalog binds: an undeclared type is refused with the key named', notDeclared && notDeclared.code + ' / ' + notDeclared.message)
  ok(notDeclared && /ordinary, academic, debate, closure, paper, planning/.test(String(notDeclared.hint)),
    'the refusal lists the legal values (the academician learns the vocabulary from the refusal)', notDeclared && notDeclared.hint)

  // ── ④ THE PACK TOOL: TYPE + SUBJECT REACH THE KERNEL ───────────────────────────────────────────────────────
  console.log('=== 4. THE TOOL FACE PASSES THE TYPE AND THE SUBJECT THROUGH ===')
  const typed = await call(b, 'vibe_v5_meeting', { member: 'r-acad', agenda: '辩论 p-2 的定义是否符合原意', type: 'debate', subject: 'p-2' })
  ok(typed.parsed && typed.parsed.ok === true, 'the tool convenes a debate', typed.parsed)
  ok(typed.parsed && typed.parsed.type === 'debate', 'the receipt carries the requested type (it is no longer hardcoded)', typed.parsed && typed.parsed.type)
  ok(typed.parsed && typed.parsed.subject === 'p-2', 'the receipt carries the subject', typed.parsed && typed.parsed.subject)
  ok(typed.parsed && typed.parsed.procedure && typed.parsed.procedureBinding === 'recommendation',
    '★ a debate receives the recommended skeleton and its binding is printed on the receipt', typed.parsed && typed.parsed.procedureBinding)
  ok(typed.parsed && Array.isArray(typed.parsed.pendingSteps) && typed.parsed.pendingSteps.length === 1,
    '★ the receipt itself reports the unimplemented step (no silent half)', typed.parsed && typed.parsed.pendingSteps)
  ok(typed.parsed && /推荐/.test(String(typed.parsed.procedureNote)) && /不是门禁/.test(String(typed.parsed.procedureNote)),
    'the receipt says, in words, that the skeleton is a recommendation and not a gate', typed.parsed && typed.parsed.procedureNote)
  const backSum = kernel.meetings.summary({ meeting: typed.parsed.meeting })
  ok(backSum.type === 'debate' && backSum.subject === 'p-2', '★ read-back from the service confirms what the tool claimed', { type: backSum.type, subject: backSum.subject })
  const plain = await call(b, 'vibe_v5_meeting', { member: 'r-acad', agenda: '一般议事' })
  ok(plain.parsed && plain.parsed.ok === true && plain.parsed.type === 'ordinary', 'the default type is ordinary (old callers keep working)', plain.parsed && plain.parsed.type)
  ok(plain.parsed && plain.parsed.procedure === null && /没有推荐流程骨架/.test(String(plain.parsed.procedureNote)),
    '★ an ordinary meeting reports null + the reason (no invented skeleton)', plain.parsed && plain.parsed.procedureNote)
  const noSubject = await call(b, 'vibe_v5_meeting', { member: 'r-acad', agenda: '辩论一个没说是什么的东西', type: 'debate' })
  ok(noSubject.parsed && noSubject.parsed.ok === false && noSubject.parsed.code === 'VMU_INVALID_ARGUMENT' && /subject/.test(String(noSubject.parsed.message)),
    '★ a debate with no object is refused by name (never a debate about nothing)', noSubject.parsed && noSubject.parsed.code)
  const badType = await call(b, 'vibe_v5_meeting', { member: 'r-acad', agenda: 'x', type: 'weekly-sync' })
  ok(badType.parsed && badType.parsed.ok === false && badType.parsed.code === 'VMU_INVALID_ARGUMENT' && /ordinary, academic, debate/.test(String(badType.parsed.hint)),
    '★ an unknown type is refused with the legal list in the hint', badType.parsed && badType.parsed.hint)
  // `target` stays a working alias (it was the declared-but-unread parameter; now it has a consumer in both spellings)
  const alias = await call(b, 'vibe_v5_meeting', { member: 'r-acad', agenda: '辩论别名', type: 'debate', target: 'p-3' })
  ok(alias.parsed && alias.parsed.ok === true && alias.parsed.subject === 'p-3', '★ `target` is a live alias for the debate object (it was dead before)', alias.parsed && alias.parsed.subject)
} finally {
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
}

console.log('')
if (failures.length) { console.error('FAILURES:'); for (const f of failures) console.error('  · ' + f) }
console.log('=== VMU MEETING TYPES: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed ? 1 : 0)

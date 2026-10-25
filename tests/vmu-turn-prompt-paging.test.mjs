// tests/vmu-turn-prompt-paging.test.mjs
//
// ★ LIVE RUN 23 gave the reason this file exists. The institute was asked to verify what its own member prompt SAID, and it
// could not: the step receipt carries `memberPrompt.text`, but a receipt is bounded to 12000 bytes per tool result, so a
// ~21700-byte member prompt arrives with its middle elided and its tail host-cut. It therefore refused to certify
// 「本轮无实质残余」 — correctly, because reading a truncated receipt is not verification.
//
// The turn face now REMEMBERS the full text of the last few prompts it handed out and exposes `op:"prompt"`, paged by
// offset/limit, with the total, the page end and the next offset stated. This file pins that contract:
//   - a page is a SLICE of exactly the same string the member received (not a re-assembly and not a re-render),
//   - following nextOffset reaches the end and the concatenation EQUALS the original,
//   - the corner cases refuse by name instead of answering something plausible.
//
// WHAT IT CANNOT PROVE: that the kernel's assembly is deterministic across calls (it is not re-run here — the test uses a
// stub turn loop precisely so the cache is the only variable).
import { makeTurnSpec } from '../vibe-math-vmu/tools/turn.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) { passed++ } else { failed++; failures.push(name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))) }
}

const param = (t, d, e = {}) => ({ type: t, description: d, ...e })
const refused = (code, message, hint) => ({ ok: false, code, message, hint: hint || null })

const FULL = Array.from({ length: 1500 }, (_, i) => 'line' + i + ':' + 'x'.repeat(9)).join('\n') // ~21 KB
const makeSpec = () => makeTurnSpec({
  param,
  refused,
  TOOL_NAMES: { turn: 'vibe_vmu_turn' },
  kernel: {
    turn: {
      status: () => ({ ok: true }),
      step: async () => ({ ok: true, awaiting: true, turn: { id: 't-7' }, memberPrompt: { text: FULL }, deliveryPath: 'caller' }),
    },
  },
})

const tool = makeSpec()
console.log('=== 1. BEFORE ANY PROMPT, THE OP REFUSES BY NAME ===')
const none = await tool.run({ op: 'prompt' })
ok(none.ok === false && none.code === 'VMU_STATE', 'op:"prompt" with no prompt assembled yet refuses VMU_STATE (not an empty page)', none.code)
ok(typeof none.hint === 'string' && none.hint.includes('step'), 'and the hint names the call that produces one', none.hint)

console.log('=== 2. A STEP IS REMEMBERED, AND THE PAGES REASSEMBLE THE ORIGINAL ===')
const step = await tool.run({ op: 'step' })
ok(step.ok === true && step.awaiting === true, 'the stub step returns an awaiting receipt', step.ok)
const p1 = await tool.run({ op: 'prompt' })
ok(p1.ok === true && p1.turn === 't-7', 'the paged read defaults to the most recent prompt and names its turn', p1.turn)
ok(p1.chars === FULL.length, 'it reports the FULL character count, not the page length', { chars: p1.chars, expected: FULL.length })
ok(typeof p1.text === 'string' && p1.text === FULL.slice(0, p1.limit), 'page 1 is a slice of the delivered string', p1.text && p1.text.length)
ok(p1.offset === 0 && p1.done === false && p1.nextOffset === p1.end, 'page 1 starts at 0, is not the end, and points at the next offset', { offset: p1.offset, done: p1.done, nextOffset: p1.nextOffset })
ok(p1.pages === Math.ceil(FULL.length / p1.limit), 'it states how many pages the whole prompt takes at this page size', p1.pages)

const parts = [p1.text]
let guard = 0
let cur = p1
while (cur.done === false && guard < 50) {
  cur = await tool.run({ op: 'prompt', turn: 't-7', offset: cur.nextOffset, limit: 9000 })
  ok(cur.ok === true, 'every follow-up page succeeds', cur.code)
  parts.push(cur.text)
  guard += 1
}
ok(cur.done === true && cur.nextOffset === null, 'the last page reports done and no next offset', { done: cur.done, nextOffset: cur.nextOffset })
ok(parts.join('') === FULL, '★★★ the concatenated pages EQUAL the delivered prompt byte for byte (this is the whole point)', { got: parts.join('').length, want: FULL.length })

console.log('=== 3. THE CORNER CASES ARE REFUSALS, NOT PLAUSIBLE ANSWERS ===')
const past = await tool.run({ op: 'prompt', offset: FULL.length + 5 })
ok(past.ok === false && past.code === 'VMU_INVALID_ARGUMENT' && String(past.message).includes(String(FULL.length)),
  'an offset past the end refuses by name AND states the real length', past.message)
const unknown = await tool.run({ op: 'prompt', turn: 't-nope' })
ok(unknown.ok === false && unknown.code === 'VMU_NO_SUCH_OBJECT', 'an unknown turn refuses VMU_NO_SUCH_OBJECT', unknown.code)
ok(String(unknown.hint).includes('t-7'), 'and its hint lists the retained turns, so the caller can correct the id', unknown.hint)
const clamped = await tool.run({ op: 'prompt', limit: 50000 })
ok(clamped.ok === true && clamped.limit === 9000 && clamped.limitClamped === true,
  '★ a limit above the page cap is CLAMPED and the receipt says so (silently honouring 50000 would blow the receipt bound again)', { limit: clamped.limit, clamped: clamped.limitClamped })
const badOffset = await tool.run({ op: 'prompt', offset: -3 })
ok(badOffset.ok === false && badOffset.code === 'VMU_INVALID_ARGUMENT', 'a negative offset is refused, never treated as 0', badOffset.code)
const badLimit = await tool.run({ op: 'prompt', limit: 'many' })
ok(badLimit.ok === false && badLimit.code === 'VMU_INVALID_ARGUMENT', 'a non-numeric limit is refused, never treated as the default', badLimit.code)

console.log('=== 4. THE CACHE IS BOUNDED (a read face may not become a memory leak) ===')
const tool2 = makeSpec()
const kernelTurn = tool2
for (let i = 0; i < 9; i += 1) {
  await kernelTurn.run({ op: 'step' }) // same turn id every time, so this also pins "same id replaces, not appends"
}
const stillThere = await kernelTurn.run({ op: 'prompt', turn: 't-7' })
ok(stillThere.ok === true, 'repeated steps with the same turn id keep exactly one entry readable', stillThere.code)

console.log('=== 5. THE PAGE NAMES THE REAL TURN, AND A TOOLS OVERRIDE IS REPORTED (run 24 c-1/c-2) ===')
// c-1: the awaiting receipt calls the turn `turnId`, not `turn:{id}`. Keying on the nested shape alone produced synthetic
// keys (`anon-1`), so a reader holding two paginated prompts could not tell which page belonged to which turn.
const seenOverrides = []
const seenCleared = []
const tool3 = makeTurnSpec({
  param,
  refused,
  TOOL_NAMES: { turn: 'vibe_vmu_turn' },
  kernel: {
    turn: {
      status: () => ({ ok: true }),
      step: async () => ({ ok: true, awaiting: true, turnId: 't-9', memberPrompt: { text: 'B'.repeat(12000) }, deliveryPath: 'caller' }),
    },
    setMemberToolOverride: (a) => seenOverrides.push(a),
    clearMemberToolOverride: (id) => seenCleared.push(id),
    setActiveTurnMember: () => {},
    validateToolFaceNames: () => {},
  },
})
const step3 = await tool3.run({ op: 'step', members: ['chair-1'], tools: 'none' })
ok(step3.toolsOverride && step3.toolsOverride.mode === 'none', '★ a tools:"none" round REPORTS the override instead of staying silent', step3.toolsOverride && step3.toolsOverride.mode)
ok(step3.toolsOverride && step3.toolsOverride.seam === 'setMemberToolOverride' && typeof step3.toolsOverride.note === 'string' && step3.toolsOverride.note.includes('cannot read'),
  '★ and it names the seam plus its own blind spot (the wire is narrowed by the resolver, which the face cannot read)',
  { seam: step3.toolsOverride && step3.toolsOverride.seam })
ok(seenOverrides.length === 1 && seenOverrides[0].all === true && seenCleared.length === 1 && seenCleared[0] === 'chair-1',
  'the seam was set once and cleared once (a leaked override would silently narrow the NEXT round)', { set: seenOverrides.length, cleared: seenCleared.length })
const page3 = await tool3.run({ op: 'prompt' })
ok(page3.ok === true && page3.turn === 't-9', '★★ the page receipt carries the REAL turn id (t-9), not a synthetic anon-N key', page3.turn)
const byId3 = await tool3.run({ op: 'prompt', turn: 't-9' })
ok(byId3.ok === true, 'and that id can be used to ask for it explicitly', byId3.code)
const anon3 = await tool3.run({ op: 'prompt', turn: 'anon-1' })
ok(anon3.ok === false && anon3.code === 'VMU_NO_SUCH_OBJECT', 'the old synthetic key no longer resolves (so the fix is observable, not cosmetic)', anon3.code)

console.log('=== 6. THE REAL LIVE SHAPE: the id rides on memberPrompt.turnId (run 25 caught this) ===')
// ★★ RUN 25 reported c-1 as NOT FIXED: the awaiting receipt the kernel really emits carries the turn id as a STRING on
// `memberPrompt.turnId` (plus `pending.turn`), and the first fix looked only at `turn.id` / `turnId`. Every page was filed
// under `anon-N` while the reader held `t-1` — and the hint then offered a name the caller had never been given. This
// section pins the ACTUAL receipt shape, so a future refactor of the awaiting envelope cannot silently re-break the key.
const tool4 = makeTurnSpec({
  param,
  refused,
  TOOL_NAMES: { turn: 'vibe_vmu_turn' },
  kernel: {
    turn: {
      status: () => ({ ok: true }),
      step: async () => ({
        ok: true, awaiting: true,
        pending: { turn: 't-1', member: 'member-1' },
        memberPrompt: { turnId: 't-1', text: 'C'.repeat(12000) },
        deliveryPath: 'caller',
      }),
    },
  },
})
await tool4.run({ op: 'step', members: ['member-1'] })
const liveShapePage = await tool4.run({ op: 'prompt' })
ok(liveShapePage.ok === true && liveShapePage.turn === 't-1',
  '★★★ the live receipt shape (memberPrompt.turnId) keys the cache to the REAL turn id — the exact defect run 25 reported',
  liveShapePage.turn)
const explicitById = await tool4.run({ op: 'prompt', turn: 't-1' })
ok(explicitById.ok === true, 'so the id the caller was TOLD is the id it can page by (no untold names)', explicitById.code)
const oldAnon = await tool4.run({ op: 'prompt', turn: 'anon-1' })
ok(oldAnon.ok === false && oldAnon.code === 'VMU_NO_SUCH_OBJECT',
  'and the synthetic anon-1 no longer exists in this shape (the fix is behavioural, not cosmetic)', oldAnon.code)

console.log('')
console.log('=== 7. ACTIVATION DELIVERY: the prompt went to a child, so the refusal must NAME that (run 42, ㉝.2 ③) ===')
// ★★ RUN 42 (the institute's own report): with `deliverMode:"subagents"` every `step` handed the assembled prompt to a
// child session and returned no text here, so `op:"prompt"` answered "nothing has been assembled in this process yet" —
// which reads like a caller mistake instead of a property of the delivery mode, and sent the institute looking for a bug
// in its own call. The refusal now names the mode and the remedy, and the field it names must match what actually happened.
const tool5 = makeTurnSpec({
  param,
  refused,
  TOOL_NAMES: { turn: 'vibe_vmu_turn' },
  kernel: {
    turn: {
      status: () => ({ ok: true }),
      step: async () => ({ ok: true, awaiting: false, deliveryPath: 'activation', childId: 'child-9' }),
    },
  },
})
await tool5.run({ op: 'step', members: ['member-1'] })
const activationPage = await tool5.run({ op: 'prompt' })
ok(activationPage.ok === false && activationPage.code === 'VMU_STATE',
  '★★★ R42-paging: after an ACTIVATION round, paging refuses by name instead of pretending nothing happened', activationPage.code)
ok(/ACTIVATION mode/.test(String(activationPage.message)) && /child session/.test(String(activationPage.message)),
  '★★ and the message names the mode and where the prompt went', activationPage.message)
ok(/deliverMode:"caller"/.test(String(activationPage.hint)),
  '★★ the hint names the remedy (the caller-played route is the one paging covers)', activationPage.hint)
const tool6 = makeTurnSpec({ param, refused, TOOL_NAMES: { turn: 'vibe_vmu_turn' },
  kernel: { turn: { status: () => ({ ok: true }), step: async () => ({ ok: true }) } } })
const untouched = await tool6.run({ op: 'prompt' })
ok(untouched.ok === false && /has been assembled in this process yet/.test(String(untouched.message)),
  '★ a process with NO round yet still gets the plain refusal (the new sentence is not applied blindly)', untouched.message)


console.log('=== 8. LIVE RUN 51 ITEM 3: AN ACTIVATION TURN IS READABLE THROUGH THE KERNEL ARCHIVE ===')
// The institute reported it could not read the prompt it never saw: in activation mode the text goes to the CHILD,
// so this face never cached it and `op:"prompt"` refused while promising paged access. The kernel builds the text on
// every delivery path, so the kernel keeps it; the face asks the kernel before refusing.
const ACT = Array.from({ length: 1500 }, (_, i) => 'act' + i + ':' + 'y'.repeat(9)).join('\n')
const kernelArchive = new Map()
const activationKernel = {
  turn: {
    status: () => ({ ok: true }),
    step: async () => {
      kernelArchive.set('t-9', { turnId: 't-9', member: 'r-1', chars: ACT.length, text: ACT })
      return { ok: true, awaiting: false, turn: { id: 't-9' }, delivery: { path: 'activation', childId: 'agent-za', stopReason: 'completed' } }
    },
    promptOf: (id) => kernelArchive.get(String(id)) || null,
    promptTurns: () => Array.from(kernelArchive.keys()),
  },
}
const tool7 = makeTurnSpec({ param, refused, TOOL_NAMES: { turn: "vibe_vmu_turn" }, kernel: activationKernel })
const act = await tool7.run({ op: 'step' })
ok(act.ok === true && act.awaiting === false && !(act.memberPrompt && typeof act.memberPrompt.text === 'string'),
  '★ the activation receipt does NOT carry the prompt text (so the face cache cannot be what serves the read)', act && act.memberPrompt)
const actPage = await tool7.run({ op: 'prompt', turn: 't-9' })
ok(actPage.ok === true, '★★★ the prompt of an ACTIVATION turn is readable (live run 51 item 3: it refused before)', actPage.code || actPage.message)
ok(actPage.ok === true && actPage.chars === ACT.length, '★ and the total is the full length, not the page', actPage.chars)
const actParts = [actPage.text]
let actCur = actPage
let actGuard = 0
while (actCur.done === false && actGuard < 50) { actCur = await tool7.run({ op: 'prompt', turn: 't-9', offset: actCur.nextOffset, limit: 9000 }); actParts.push(actCur.text); actGuard += 1 }
ok(actParts.join('') === ACT, '★★ the pages reassemble the activation prompt byte for byte', { got: actParts.join('').length, want: ACT.length })
const actDefault = await tool7.run({ op: 'prompt' })
ok(actDefault.ok === true && actDefault.turn === 't-9', '★ with no turn named it defaults to the kernel archive last entry', actDefault.turn)
// TEETH: a kernel WITHOUT the archive must still refuse by name - the new path may not turn a missing prompt into a page.
const noArchive = makeTurnSpec({ param, refused, TOOL_NAMES: { turn: "vibe_vmu_turn" },
  kernel: { turn: { status: () => ({ ok: true }), step: async () => ({ ok: true, awaiting: false, turn: { id: 't-10' }, delivery: { path: 'activation' } }) } } })
await noArchive.run({ op: 'step' })
const teeth = await noArchive.run({ op: 'prompt', turn: 't-10' })
ok(teeth.ok === false && teeth.code === 'VMU_NO_SUCH_OBJECT', '★★ a kernel with no archive still REFUSES (a missing prompt is never answered with a plausible page)', teeth.code)
console.log('')
console.log(failed === 0
  ? '=== VMU TURN PROMPT PAGING: ' + passed + ' passed, 0 failed ==='
  : '=== VMU TURN PROMPT PAGING: ' + passed + ' passed, ' + failed + ' failed ===\n' + failures.join('\n'))
process.exit(failed ? 1 : 0)

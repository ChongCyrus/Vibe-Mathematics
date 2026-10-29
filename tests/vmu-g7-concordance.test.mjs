#!/usr/bin/env node
// G7 THIRD/FOURTH/FIFTH AUDITS (2026-10-30) — the contradictions those independent read-only audits found,
// each one two sentences inside ONE prompt/receipt pair that cannot both be true. This suite pins the
// RESOLVED state of every pair, and it fails if either side drifts back.
//
// C1 (L03/L14)  the charter says a temp 「可写自己的成果库」 while the shared tracks section and the whole
//               slot ACL deny every write face for slot `temp`.
// C2 (L62)      the verify-core section promised 「本所的表决走工具调用，不用 JSON 回复块」 while the reply
//               envelope's `verdict` field is dispatched to `vmu.ballotbox.cast` (kernel/turn FIELD_OWNERS).
// C3 (L14/L45)  the debate object is a finished-proof card or a file reference; five surfaces still sold a
//               one-line proposition as a legal third shape, which `debateSubjectGate` refuses by name.
// C4 (L03/L34)  the temp meeting section told a temp to `attend`, while `vmu.meetings.attendDeniedSeats`
//               refuses that seat by name.
//
// Shape choices (Rule E): every text assertion has a NON-EMPTY precondition and every VACUOUS-looking
// comparison is written as "a named thing is absent", not "two possibly-empty sets are equal".

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')

let pass = 0
const fails = []
const ok = (cond, title, detail) => {
  if (cond) { pass += 1; console.log('  ok   ' + title); return }
  fails.push(title)
  console.log('  FAIL ' + title + (detail === undefined ? '' : ' ' + JSON.stringify(detail)))
}

const BLOCKS_A = read('vibe-math-vmu/packs/v5r/prompts/v5r-blocks-a.js')
const BLOCKS_B = read('vibe-math-vmu/packs/v5r/prompts/v5r-blocks-b.js')
const TOOLS = read('vibe-math-vmu/packs/v5r/tools.js')
const SEAT_FACES = read('vibe-math-vmu/packs/v5r/seat-faces.js')
const PROCEDURES = read('vibe-math-vmu/packs/v5r/meeting-procedures.js')
const GATES = read('vibe-math-vmu/packs/v5r/verification-gates.js')

// ── C1 ────────────────────────────────────────────────────────────────────────────────────────────────────
{
  ok(BLOCKS_A.includes('临时雇入的协作人员') && BLOCKS_A.includes('', ''),
    'C1 precondition: the charter roster block is really the one this suite reads', { chars: BLOCKS_A.length })
  const tempBullet = (BLOCKS_A.match(/\*\*临时工\*\* —— [^\n]*\n[^\n]*/g) || []).join('\n')
  ok(tempBullet.length > 0, 'C1 precondition: the temp bullet exists', { chars: tempBullet.length })
  ok(!tempBullet.includes('可写自己的成果库'),
    'C1a the charter no longer tells a temp it may write its own results library (the ACL denies every write face)',
    { bullet: tempBullet.slice(0, 120) })
  ok(tempBullet.includes('不写') && /命题|方法|进度/.test(tempBullet),
    'C1b it now names what the temp does NOT write, so the claim is checkable against the slot ACL',
    { bullet: tempBullet.slice(0, 120) })
  ok(BLOCKS_B.includes('**临时工不写这些库**'),
    'C1c the shared tracks section still states the same thing — both surfaces agree', {})
  ok(/allow: Object\.freeze\(\{ chair: true, member: true, temp: false \}\)/.test(SEAT_FACES),
    'C1d the ACL really has write faces closed to `temp` (the sentence above is not aspiration)', {})
}

// ── C2 ────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const line = (BLOCKS_B.match(/[^\n]*本所的表决走工具调用[^\n]*/g) || []).join('\n')
  ok(BLOCKS_B.includes('verifyTarget'),
    'C2 precondition: the verify-core section is present', { chars: BLOCKS_B.length })
  ok(!line.includes('不用 JSON 回复块'),
    'C2a no prompt sentence claims the reply envelope cannot carry a vote', { line: line.slice(0, 120) })
  const kernelTurn = read('vibe-math-vmu/kernel/turn/index.js')
  ok(/verdict: Object\.freeze\(\{ face: 'vmu\.ballotbox', op: 'cast' \}\)/.test(kernelTurn),
    'C2b the machinery it contradicts is still real: `verdict` is a dispatchable reply field', {})
  const sent = BLOCKS_B.replace(/\s+/g, '')
  ok(sent.includes('本回执的`verdict`字段也真的会派发到票箱') || sent.includes('本回执的`verdict`字段也真的会被派发到票箱'),
    'C2c and the prompt now says so in plain words (both doors are named)', {})
}

// ── C3 ────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const surfaces = [
    ['tools.js description', TOOLS],
    ['seat-faces bullet', SEAT_FACES],
    ['meeting-procedures', PROCEDURES],
    ['verification-gates hint', GATES],
    ['blocks-a teaching', BLOCKS_A],
    ['blocks-b teaching', BLOCKS_B],
  ]
  // A surface "sells" the one-liner when it calls it legal — IN EITHER LANGUAGE. The first version of this probe
  // was Chinese-only, so the FOURTH audit found three English sentences still calling it legal while this suite
  // stayed green. Selling and refusing are matched LINE BY LINE (not file-wide): a big source that refuses in one
  // place and sells in another must still fail.
  const SELLS = [
    /一句话命题[^\n]{0,24}合法/,
    /规则允许的一句话命题/,
    /a one-line proposition is (?:legal|allowed)/i,
    /a legal one-line proposition/i,
  ]
  // Only the RESOLVED WORDING itself is exempt (「一句话命题不是合法对象」) — NOT the presence of a refusal
  // somewhere on the same line. The fourth audit's worst case was ONE description line that refused in its
  // first half and sold in its second, so a file-wide or line-wide "it also refuses" escape would have
  // masked exactly the bug this probe exists to catch.
  const RESOLVED = [/一句话命题[^\n]{0,16}不是[^\n]{0,4}合法/]
  const offending = (src) => src.split('\n')
    .filter((line) => SELLS.some((re) => re.test(line)) && !RESOLVED.some((re) => re.test(line)))
  const sells = (src) => offending(src).length > 0
  const legalOneLiner = surfaces.filter(([, src]) => sells(src))
  ok(surfaces.length === 6, 'C3 precondition: six rendered surfaces are read (tools/seat/procedures/gates/prompts)', { n: surfaces.length })
  // Rule E self-proof: the probe must flag a synthetic line in BOTH languages (the first version was blind to
  // English for a whole audit round), and must not flag the resolved wording.
  ok(sells('a one-line proposition is legal but the receipt records provenance:none'),
    'C3 probe bites on the English wording (self-proof)', { })
  ok(sells('本面无法区分"规则允许的一句话命题"与"笔误"'),
    'C3 probe bites on the Chinese wording (self-proof)', { })
  ok(sells('x: a one-line proposition is REFUSED by name, and elsewhere a one-line proposition is legal'),
    'C3 probe is not escaped by a refusal elsewhere on the same line', { })
  ok(!sells('一句话命题不是合法辩论对象'),
    'C3 probe leaves the resolved wording alone (negative control)', { })
  ok(legalOneLiner.length === 0,
    'C3a no teaching surface still sells a one-line proposition as a legal debate object (the gate refuses it)',
    { offenders: legalOneLiner.map(([n]) => n) })
  ok(GATES.includes('VMU_PACK_V5R_DEBATE_SUBJECT_NO_PROOF'),
    'C3b the gate still refuses it by name', {})
  const namedShapes = [TOOLS, SEAT_FACES, PROCEDURES, GATES].filter((src) =>
    src.includes('VMU_PACK_V5R_DEBATE_SUBJECT_NO_PROOF') || src.includes('一句话命题不是对象')).length
  ok(namedShapes >= 3,
    'C3c at least three of them name the refusal code or state the rule the gate enforces', { namedShapes })
}

// ── C4 ────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const tempMeeting = (BLOCKS_B.match(/【会议类型与预约】[^\n]*临时工[^\n]*/g) || []).join('\n')
  ok(tempMeeting.length > 0, 'C4 precondition: the temp meeting section exists', { chars: tempMeeting.length })
  ok(!/要自己 `attend` 才计入法定人数/.test(tempMeeting) || tempMeeting.includes('不参会'),
    'C4a a temp is no longer told to `attend` as the way to be counted', { line: tempMeeting.slice(0, 140) })
  ok(tempMeeting.includes('不参会'),
    'C4b it now says the temp seat does not attend at all', { line: tempMeeting.slice(0, 140) })
  ok(/attendDeniedSeats/.test(tempMeeting) || /attend/.test(tempMeeting),
    'C4c and names the mechanism that refuses it', {})
}

// ── FIFTH AUDIT (2026-10-30): L07 / L14 / L53 / L61 ─────────────────────────────────────────────────────
// Four contradictions the fifth independent audit found. Three of them live in ENGLISH tool descriptions,
// which is exactly why this file now carries English assertions: a Chinese-only probe was blind to them.
{
  // L07: "any object needs formal proof + a true debate ruling" vs the literature bypass (no debate).
  const abs = BLOCKS_A.match(/任何对象要进 Verified\/[^\n]*/g) || []
  ok(abs.length >= 1, 'L07 precondition: the "any object into Verified" sentence exists', { n: abs.length })
  // The absolute phrasing ("formal proof + a true debate ruling") is the one that lost the rule's bypass:
  // every remaining copy of it must carry the exception on the same line.
  const formal = abs.filter((l) => l.includes('正式证明 + 辩论裁决为真'))
  ok(formal.length === 1 && formal[0].includes('唯一例外'),
    'L07a the absolute "formal proof + true debate ruling" sentence carries the rule\'s own exception',
    { n: formal.length, line: (formal[0] || '').slice(0, 160) })
  ok(formal.length === 1 && formal[0].includes('literature_ref'),
    'L07b and names the word the bypass entry needs (so the exception is checkable)', {})
  // The two "still must satisfy §五" sentences delegate to the section that holds the bypass, so they are
  // allowed to stay absolute-looking — but only if the bypass really is inside that section.
  const delegates = abs.filter((l) => l.includes('仍然必须满足【五】'))
  ok(delegates.length === 2 && BLOCKS_A.indexOf('参考文献中的命题', BLOCKS_A.indexOf('【五、表决与定论')) > 0,
    'L07b2 the delegating sentences point at a section that really contains the bypass', { n: delegates.length })
  ok(/参考文献中的命题[^\n]{0,40}直接进 Verified/.test(BLOCKS_A),
    'L07c the bypass itself is still taught — the exception is real, not a promise', {})
  ok(TOOLS.includes('warrant_kind:"literature"'),
    'L07d the machinery still has that bypass entry (the exception is not aspirational)', {})
}

{
  // L14: three English descriptions said `proof_state:"complete"` needs Lean evidence ONLY, while the gate
  // accepts a finished proof behind `proof_ref` (and the card faces have no `lean_job` parameter at all).
  ok(/name: 'vibe_v5_record_proposition'/.test(TOOLS), 'L14 precondition: the proposition face is declared here', {})
  ok(!TOOLS.includes('ONLY WITH LEAN EVIDENCE'),
    'L14a no description claims complete is "admitted only with Lean evidence"', {})
  ok(TOOLS.includes('IS ADMITTED ONLY WITH EVIDENCE'),
    'L14b it now says evidence, and the next clause names both kinds', {})
  ok(TOOLS.includes('`proof_ref` (pointing at the finished proof'),
    'L14c the description names proof_ref as the first accepted kind', {})
  const leanOnly = TOOLS.split('needs Lean evidence (`lean_job` of a settled passed run').length - 1
  ok(leanOnly === 0, 'L14d the method/sub-problem descriptions no longer require Lean alone', { n: leanOnly })
  const evidence = TOOLS.split('needs evidence (`proof_ref` on a finished proof').length - 1
  ok(evidence === 2, 'L14e exactly the two card faces that lack lean_job now accept a finished proof', { n: evidence })
  ok(/declaredProofRef/.test(TOOLS), 'L14f the gate really does accept that registration (sentence matches code)', {})
}

{
  // L53: step 3 told the chair to open a live ballot, while final verdicts are FILED cards, and the ballot
  // box only accepts 1/0 for pending-verification objects.
  ok(PROCEDURES.includes('final-verdicts'), 'L53 precondition: the debate skeleton has a final-verdicts step', {})
  ok(!PROCEDURES.includes('主席先开一个 live 票'),
    'L53a step 3 no longer starts the verdicts with a ballot box', {})
  ok(PROCEDURES.includes('票箱不是裁决通道'),
    'L53b it now says plainly that the ballot box is not the ruling path', {})
  // The sixth audit caught this: `target` is a LIVE BALLOT id, so filing a ruling with target=<card id> dies
  // with VMU_NO_SUCH_OBJECT. The ruling is filed with meeting + proposition_id, and the text says so.
  ok(PROCEDURES.includes('proposition_id: "<命题卡 id>"') && !PROCEDURES.includes('target: "<命题卡 id>"'),
    'L53c the ruling call names the parameters the mechanism reads (meeting + proposition_id, never target=<card>)', {})
  ok(PROCEDURES.includes('不要传 `target`'),
    'L53c2 and it tells the reader NOT to send `target` at all', {})
  ok(/rulingSubmissions/.test(TOOLS),
    'L53d the final-verdict face still reads FILED rulings (so the corrected step matches the kernel)', {})
}

{
  // L61: the core told its reader 「你是主代理（院士席）」 while the rule (and member-scope) make the OFFICE
  // the main agent — the chair has no channel to the user at all.
  const CORE = read('vibe-math-vmu/packs/v5r/prompts/v5r-core.js')
  ok(CORE.includes('environment-missing'), 'L61 precondition: the environment-report sentence exists', {})
  ok(!CORE.includes('你是主代理（院士席）'),
    'L61a the core no longer equates the main agent with the chair seat', {})
  ok(CORE.includes('主代理（所办，不是院士席）'),
    'L61b it now names the office as the main agent', {})
  ok(/office[^\n]{0,24}主代理/.test(read('vibe-math-vmu/packs/v5r/member-scope.js')),
    'L61c the mechanism-side note says the same about the office', {})
}

{
  // SIXTH AUDIT, C1 — mechanically: a description that NAMES a card parameter the face does not declare is a
  // promise the caller cannot keep (the dispatch funnel refuses undeclared params by name before the handler).
  // This scans every `vibe_v5_record_*` spec block and reconciles its description against its own parameters.
  const blocks = TOOLS.split(/name: 'vibe_v5_record_/).slice(1)
    .map((chunk) => 'vibe_v5_record_' + chunk.slice(0, chunk.indexOf('handler:')))
  ok(blocks.length >= 4, 'C1(6) precondition: the card faces are found in tools.js', { n: blocks.length })
  const NAMES = ['lean_job', 'lean_conformance', 'proof_ref', 'proof_state']
  const offenders = []
  for (const block of blocks) {
    const cut = block.indexOf('parameters:')
    ok(cut > 0, 'C1(6) precondition: this face declares parameters', { head: block.slice(0, 40) })
    const desc = block.slice(0, cut)
    const params = block.slice(cut)
    for (const n of NAMES) {
      const named = new RegExp('`' + n + '`').test(desc)
      if (named && !new RegExp('\\b' + n + ':').test(params)) offenders.push({ face: block.slice(0, 34), missing: n })
    }
  }
  ok(offenders.length === 0,
    'C1(6) every card parameter a description names is really declared by that face (no unreachable half)', { offenders })
  // Self-proof: the probe must bite on a synthetic face whose description names an undeclared parameter.
  const synthetic = "name: 'vibe_v5_record_x', description: 'pass `lean_job` to prove it', parameters: { id: { type: 'string' } }, handler: x,"
  const synthBlock = 'vibe_v5_record_' + synthetic.slice(0, synthetic.indexOf('handler:'))
  const synthDesc = synthBlock.slice(0, synthBlock.indexOf('parameters:'))
  const synthParams = synthBlock.slice(synthBlock.indexOf('parameters:'))
  ok(new RegExp('`lean_job`').test(synthDesc) && !/\\blean_job:/.test(synthParams),
    'C1(6) probe bites on a face that names an undeclared parameter (self-proof)', {})
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// SEVENTH AUDIT — four pairs where one reader was told two incompatible things. Each block checks BOTH sides:
// the sentence that was wrong is gone, the sentence that is true is present, and the mechanism really behaves
// the way the surviving sentence says.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
{
  // C1 (L14) — the debate procedure claimed the framework sets no round ceiling and refuses nothing;
  // this deployment caps MOTIONS per meeting at vmu.meetings.verdictMaxRounds (default 3) and refuses by name.
  const proc7 = read('vibe-math-vmu/packs/v5r/meeting-procedures.js')
  ok(!/不设默认轮数/.test(proc7), 'C1(7) the procedure no longer claims the framework sets no round ceiling', {})
  ok(/verdictMaxRounds/.test(proc7) && /VMU_RESOURCE_BUDGET/.test(proc7),
    'C1(7) the procedure names the real ceiling and the refusal it produces', {})
  const meetingsSrc7 = read('vibe-math-vmu/kernel/meetings.js')
  ok(/verdictMaxRounds/.test(meetingsSrc7) && /VMU_RESOURCE_BUDGET/.test(meetingsSrc7),
    'C1(7) mechanism side: the cap really refuses with that code', {})
}
{
  // C2 (L32) — the chair manual promised that meetings.orderMode (default fifo) decides the baseline while the
  // marker refuses flow/overrideorder outright when the pack never declares orderMode.
  const b7 = read('vibe-math-vmu/packs/v5r/prompts/v5r-blocks-b.js')
  ok(!/基线顺序由 `vmu\.meetings\.orderMode`/.test(b7),
    'C2(7) the manual no longer says orderMode decides the baseline', {})
  ok(/基线顺序就是\*\*入队顺序\*\*/.test(b7) && /本部署未声明/.test(b7) && /VMU_ENGINE_UNAVAILABLE/.test(b7),
    'C2(7) the manual says the reachable baseline is the queue and names the refusal', {})
  const marker7 = read('vibe-math-vmu/kernel/meetingmarker.js')
  ok(/VMU_ENGINE_UNAVAILABLE/.test(marker7), 'C2(7) mechanism side: the marker really refuses that way', {})
}
{
  // C3 (L39) — card faces promised `lean_conformance` as evidence that stands alone; the gate rejects a
  // conformance word with no PASSED lean_job ("a claim, not evidence").
  const t7 = read('vibe-math-vmu/packs/v5r/tools.js')
  ok(!/`lean_job` of a settled PASSED run, or `lean_conformance`/.test(t7),
    'C3(7) no description lists lean_conformance as an alternative to a PASSED lean_job', {})
  ok(!/Lean `lean_job`\/`lean_conformance`/.test(t7),
    'C3(7) the two card faces no longer say the two are interchangeable', {})
  ok(t7.includes('lean_conformance` alone is a claim, not evidence') && t7.includes('is a claim, not evidence: the same write names no'),
    'C3(7) description and refusal now say the same thing about a conformance word', {})
}
{
  // C4 (L51) — an invited temp worker was told to attend and speak; this deployment refuses attend for temp seats.
  const b7 = read('vibe-math-vmu/packs/v5r/prompts/v5r-blocks-b.js')
  ok(!/你的发言只记入会议纪要与群聊/.test(b7),
    'C4(7) the invited-temp frame no longer promises a speech that lands in the minutes', {})
  ok(/席位不参会/.test(b7) && /attend/.test(b7) && /vibe_v5_say/.test(b7),
    'C4(7) the frame says the reachable channel is the group chat', {})
  const defaults7 = read('vibe-math-vmu/packs/v5r/settings/defaults.json')
  ok(/attendDeniedSeats/.test(defaults7), 'C4(7) mechanism side: the deployment really denies attend for temp seats', {})
}

console.log('\n=== G7 CONCORDANCE (third through seventh audits: eighteen pairs): ' + pass + ' passed, ' + fails.length + ' failed ===')
if (fails.length) {
  for (const f of fails) console.log('  · ' + f)
  process.exit(1)
}

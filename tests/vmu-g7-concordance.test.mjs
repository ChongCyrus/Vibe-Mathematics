#!/usr/bin/env node
// G7 THIRD AUDIT (2026-10-30) — the four contradictions the third independent read-only audit found,
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

console.log('\n=== G7 CONCORDANCE (third audit, four pairs): ' + pass + ' passed, ' + fails.length + ' failed ===')
if (fails.length) {
  for (const f of fails) console.log('  · ' + f)
  process.exit(1)
}

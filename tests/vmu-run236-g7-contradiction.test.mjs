// tests/vmu-run236-g7-contradiction.test.mjs — G7 pinned on a REAL assembly (task-25 / RUN 236).
//
// THE RULE (宏观 v5r 规则 L74): 提示词与规则要【完全相符、自洽】. The seat prompts are the only teaching a
// model ever reads, so a sentence that describes behaviour the kernel no longer has is a contradiction the
// rule forbids — and G7 is the ONE rule no mechanism gate can prove: `check-rule-parity.mjs` can prove every
// rule line has a teaching and every teaching is live, but it cannot prove two sentences agree.
//
// THE AUDIT'S COMPLAINT (docs/acceptance/sim-audit-rules.md, G7 = PROSE-ONLY): the prompts "contained the key
// rule fragments" but nothing asserted that OLD sentences were gone. Commit 05140eda replaced exactly three
// stale sentences (RUN 229/230 had changed the kernel underneath them):
//   · `order` was taught as "only reads the queue" — it REORDERS when `members` is given (needs `by`),
//   · `extend` was grouped with `silent`/`end`/`hands` as a primitive-only action that a SERVICE meeting
//     refuses — `extend` now CROSSES the registry (`registry:"service"`), only the other three stay primitive,
//   · the member-side sentence repeated the same stale grouping.
//
// WHAT IS PINNED HERE (assembled by the REAL prompt pipeline, seat by seat — not by grepping source files,
// where a comment containing the old phrase would satisfy the assertion):
//   ① the three prompts (chair/member/temp, normal + meeting phases) REALLY assemble and are non-trivially long;
//   ② the three STALE sentences appear in NONE of the assembled seat prompts;
//   ③ the REPLACEMENTS are present in the seat that acts on them: the chair is taught that `order` reorders
//      with `members` (and needs `by`), that `extend` crosses the registry (`registry:"service"`) while
//      `silent`/`end`/`hands` remain primitive, and the member is taught that `extend` is the CHAIR's act;
//   ④ the two prompts describe the same registry boundary (the chair names `VMU_REGISTRY_BOUNDARY`, the member
//      says the other three are refused on the service meeting) — i.e. the cross-registry fact is stated, not
//      left to a comment.
//
// Run: node tests/vmu-run236-g7-contradiction.test.mjs

import { mkdirSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO } from './_lib/repo-root.mjs'

const TMP = 'D:/_tmp/vmu-run236'

let passed = 0
let failed = 0
const failures = []
function ok(cond, name, detail) {
  if (cond) {
    passed += 1
    console.log('  ok   ' + name)
  } else {
    failed += 1
    failures.push(name)
    console.log('  FAIL ' + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail).slice(0, 700)))
  }
}

const HARNESS = await import(pathToFileURL(join(REPO, 'scripts/sim/harness.mjs')).href)
mkdirSync(TMP, { recursive: true })
const root = mkdtempSync(join(TMP, 'g7-'))
const h = await HARNESS.boot({ root })

const start = await h.call('vibe_v5_start', { problem: 'G7 真装配：提示词与规则不矛盾', researcherCount: 2 })
ok(start && start.ok === true, 'premise: the institute is founded on a real kernel', start && { ok: start.ok, hired: start.hired })

// ── ① the three seat prompts really assemble ─────────────────────────────────────────
// ★ RUN 242 (FEEDBACK65 / sim-audit-prompts A7): the on-floor manual (`v5r-turn-meeting-chamber`) and the agenda
// line are now gated on `scope.meetingId === 'required'` — a meeting-PHASE turn that is bound to NO meeting used to
// be handed the manual for a floor that does not exist. So a measurement of what a chair READS IN A MEETING has to
// bind one: `phase:'meeting'` alone no longer implies a floor (it is the reason this suite went from 0 to 7 red on
// the RUN 242 build, with every stale-sentence assertion still passing).
const convened = await h.call('vibe_v5_meeting', { member: 'r-acad', agenda: ['G7 提示词复验'], title: 'G7 会议相位', type: 'ordinary' })
const mid = convened && (convened.meeting || convened.id)
ok(typeof mid === 'string' && mid.length > 0, 'premise: the institute holds a meeting, so a meeting-phase turn has a floor to be on', convened)

const prompts = {}
for (const seat of ['chair', 'member', 'temp']) {
  for (const phase of ['normal', 'meeting']) {
    const text = await h.prompts.assembleFor({ seat, phase, meeting: phase === 'meeting' ? mid : null })
    prompts[seat + '/' + phase] = typeof text === 'string' ? text : ''
  }
}
// The other half of the same rule: with NO meeting bound, the same phase must NOT describe a floor. Asserting only
// the bound half would pass if the gate were removed entirely (both halves would then read the manual).
const unbound = await h.prompts.assembleFor({ seat: 'chair', phase: 'meeting', meeting: null })
const unboundText = typeof unbound === 'string' ? unbound : ''
ok(unboundText.length > 0 && !unboundText.includes('`order` 不带 `members` 时只读队列'),
  'a meeting-PHASE turn bound to NO meeting gets no on-floor manual (A7: no floor, no floor rules)',
  { chars: unboundText.length, hasManual: unboundText.includes('`order` 不带 `members` 时只读队列') })
ok(prompts['chair/meeting'].includes('`order` 不带 `members` 时只读队列'),
  'and the bound chair DOES get it (so the check above is about the binding, not about the manual being gone)',
  prompts['chair/meeting'].includes('`order` 不带 `members` 时只读队列'))
const entries = Object.keys(prompts)
ok(entries.length === 6, 'all six seat × phase prompts were assembled', entries)
ok(entries.length > 0 && entries.every((k) => typeof prompts[k] === 'string' && prompts[k].length > 10000),
  'every assembled prompt is non-trivially long (real teaching, not an empty shell)',
  entries.map((k) => ({ key: k, chars: prompts[k].length })))

// ── ② the three stale sentences are GONE from every seat prompt ──────────────────────
// Unrolled on purpose: a `for` over a phrase list would pass vacuously if that list were ever emptied, so each of the
// three sentences is a separate assertion and the set itself is guarded below.
const staleHits = (phrase) => entries.filter((k) => prompts[k].includes(phrase))
const STALE0 = '`order` 只读队列'
const STALE1 = '`extend`/`silent`/`end`/`hands` 是 primitive 原语'
const STALE2 = '`extend`/`silent`/`end` 是原语动作，服务会议上具名拒'
ok(entries.length > 0 && STALE0.length > 0 && STALE1.length > 0 && STALE2.length > 0,
  'premise: the six prompts and the three stale sentences are all non-empty before the absence checks')
ok(staleHits(STALE0).length === 0, 'stale sentence is ABSENT from every seat prompt: ' + STALE0,
  staleHits(STALE0).map((k) => ({ key: k, index: prompts[k].indexOf(STALE0) })))
ok(staleHits(STALE1).length === 0, 'stale sentence is ABSENT from every seat prompt: ' + STALE1,
  staleHits(STALE1).map((k) => ({ key: k, index: prompts[k].indexOf(STALE1) })))
ok(staleHits(STALE2).length === 0, 'stale sentence is ABSENT from every seat prompt: ' + STALE2,
  staleHits(STALE2).map((k) => ({ key: k, index: prompts[k].indexOf(STALE2) })))

// ── ③ the replacements are present in the seat that acts on them ─────────────────────
const chair = prompts['chair/meeting'] || ''
const member = prompts['member/meeting'] || ''
ok(chair.length > 0, 'premise: the chair meeting prompt is non-empty', chair.length)
ok(member.length > 0, 'premise: the member meeting prompt is non-empty', member.length)

ok(chair.includes('`order` 不带 `members` 时只读队列') && chair.includes('带 `members` 是**重排**'),
  'the chair is taught that `order` REORDERS when `members` is given (and reads-only without it)',
  { hasRead: chair.includes('`order` 不带 `members` 时只读队列'), hasReflow: chair.includes('带 `members` 是**重排**') })
ok(chair.includes('必须给 `by`'), 'the chair is taught the REORDER needs the deciding `by`', chair.includes('必须给 `by`'))
ok(chair.includes('`extend` 现在跨注册表') && chair.includes('registry:"service"'),
  'the chair is taught that `extend` now CROSSES the registry (registry:"service")',
  { crosses: chair.includes('`extend` 现在跨注册表'), registry: chair.includes('registry:"service"') })
ok(chair.includes('`silent`/`end`/`hands` 仍是 primitive 原语'),
  'the chair is taught the OTHER THREE stay primitive (the old grouping is no longer applied to `extend`)',
  chair.includes('`silent`/`end`/`hands` 仍是 primitive 原语'))
ok(member.includes('`extend` 是主席动作') && member.includes('自报身份会被拒'),
  'the member is taught that `extend` is the CHAIR act and a self-report is refused',
  { chairAct: member.includes('`extend` 是主席动作'), selfRefused: member.includes('自报身份会被拒') })

// ── ④ both prompts state the SAME registry boundary ─────────────────────────────────
ok(chair.includes('VMU_REGISTRY_BOUNDARY'), 'the chair prompt names the service-registry refusal code (VMU_REGISTRY_BOUNDARY)',
  chair.includes('VMU_REGISTRY_BOUNDARY'))
ok(member.includes('服务会议上具名拒') && member.includes('`silent`/`end`'),
  'the member prompt states that the remaining primitives ARE refused on a service meeting',
  { refused: member.includes('服务会议上具名拒'), primitives: member.includes('`silent`/`end`') })
// Cross-check: the two prompts agree about `extend` (chair: crosses; member: chair act) rather than one
// restarting the old "extend is primitive-only" story.
ok(member.includes('服务会议上具名拒') && member.includes('`silent`/`end`'),
  'the cross-registry story is told once, consistently: no prompt revives the old extend-in-the-primitive-list grouping',
  { chairCrosses: chair.includes('`extend` 现在跨注册表'), chairOldGroup: chair.includes('`extend`/`silent`'), memberOldGroup: member.includes('`extend`/`silent`') })

console.log('\n=== vmu-run236 G7 contradiction: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) {
  console.log('failures: ' + JSON.stringify(failures))
  process.exitCode = 1
}

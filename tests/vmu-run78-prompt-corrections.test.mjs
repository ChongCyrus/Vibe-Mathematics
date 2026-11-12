// RUN 78 (TB-2732) — seven prompt corrections from the 78th live run. Every assertion reads the ASSEMBLED text
// through the same collector the budget audit uses (never a source grep): the defects were readers following the
// prompt and doing the wrong thing (wrong receipt key, wrong closure denominator, contradictory reply paths), so
// only shipped text counts. Each positive assertion has a matching negative ("old world") assertion; the three
// lamps in D:/_tmp/lamp2732/tree break exactly these assertions.
import { strict as assert } from 'node:assert'
import { test } from 'node:test'

const { collect } = await import(new URL('../scripts/sim/audit/prompt-sections.mjs', import.meta.url).href)

const got = await collect({ slots: ['chair', 'member', 'temp'], phases: ['normal', 'meeting'] })
const sections = got.sections
const textOf = (slot, phase) => sections.filter((s) => s.slot === slot && s.phase === phase).map((s) => s.text).join('\n')
const normalCombos = Object.fromEntries(got.combos.filter((c) => c.phase === 'normal').map((c) => [c.slot, c.chars]))

const normal = { chair: textOf('chair', 'normal'), member: textOf('member', 'normal'), temp: textOf('temp', 'normal') }
const meeting = { chair: textOf('chair', 'meeting'), member: textOf('member', 'meeting'), temp: textOf('temp', 'meeting') }
const normalSum = Object.values(normalCombos).reduce((a, b) => a + b, 0)

const BARE_LIBRARY_ROOT = /(?<!roots\.)libraryRoot/g // only `roots.libraryRoot` is legal

console.log('### RUN 78 / TB-2732 — the seven prompt corrections, asserted on assembled text')

test('§1 D4 the library root key is roots.libraryRoot; the bare libraryRoot teaching is gone', () => {
  for (const [slot, text] of Object.entries(normal)) {
    assert.ok(text.includes('roots.libraryRoot'), slot + ': teaches the real key roots.libraryRoot')
    const stripped = text.split('roots.libraryRoot').join('')
    const bare = [...stripped.matchAll(BARE_LIBRARY_ROOT)].map((m) => m[0])
    assert.deepEqual(bare, [], slot + ': no bare libraryRoot teaching survives (only roots.libraryRoot)')
    assert.ok(!text.includes('看回执的 `libraryRoot`'), slot + ': the old "look at receipt libraryRoot" sentence is gone')
  }
})

test('§2 D5 the reply vote_solved is no longer promised to be silently ignored; the tool stays the one entry', () => {
  for (const [slot, text] of Object.entries(normal)) {
    assert.ok(text.includes('vibe_vmu_vote'), slot + ': names the closure vote tool')
    assert.ok(text.includes('唯一入口'), slot + ': says the tool is the one entry')
    assert.ok(text.includes('fieldsIgnored'), slot + ': names the receipt surface that says why the reply vote was ignored')
    assert.ok(text.includes('按原因改渠道'), slot + ': tells the reader to change channel by that reason')
    for (const why of ['tool-not-mounted', 'tool-visible', 'tool-used-this-turn', 'tool-visibility-unprovable', 'legacy-row']) {
      assert.ok(text.includes(why), slot + ': the reason code ' + why + ' is named')
    }
    assert.ok(!text.includes('静默忽略'), slot + ': no blanket silent-ignore promise in the shipped prompt')
    assert.ok(!text.includes('只有它计结题票'), slot + ': the false claim "only the reply field counts" stays gone')
  }
})

test('§3 D6 closure needs every enfranchised member voting true; m is the ruling floor, not the closure denominator', () => {
  const chairMeeting = meeting.chair
  assert.ok(chairMeeting.includes('全体有表决权者一律投 true'), 'closure rule says all enfranchised must vote true')
  assert.ok(chairMeeting.includes('分母=全体有表决权席'), 'the denominator is named')
  assert.ok(chairMeeting.includes('m 是辩论裁决下限'), 'm is described as the ruling floor')
  assert.ok(chairMeeting.includes('不是结题分母'), 'm is explicitly not the closure denominator')
  assert.ok(!chairMeeting.includes('且无人投反对'), 'the old "quorum and nobody against" rule is gone')
  assert.ok(!chairMeeting.includes('达到法定人数 m = min('), 'the old quorum-only closure wording is gone')
})

test('§4 D7 activation and caller-relay are two paths, each with its own channel; the member rule is an explicit prohibition and the caller sentence stays scoped', () => {
  // OLD WORLD: TB-2732 removed a blanket "do not call op:reply" because it contradicted the caller-relay sentence, but
  // then the same shared block taught the caller channel to members without qualification. TB-2733 narrows the member
  // tool face, so the block now says: activation = the reply body is the output; members/temps must NOT call op:reply
  // (office relay only; a member call is refused with VMU_NOT_PERMITTED); the caller sentence is explicitly office-scoped.
  for (const slot of ['chair', 'member']) {
    const text = normal[slot]
    assert.ok(text.includes('activation（宿主派发）'), slot + ': names the activation path')
    assert.ok(/activation（宿主派发）\*\*：你的回复就是本回合的文字输出，只写围栏/.test(text), slot + ': activation path is fence-only, the reply body is the output')
    assert.ok(text.includes('成员/临时工不要调用'), slot + ': the member-facing prohibition is explicit')
    assert.ok(text.includes('VMU_NOT_PERMITTED'), slot + ': names the member refusal code')
    assert.ok(text.includes('caller 代转'), slot + ': names the caller-relay path')
    assert.ok(text.includes('（所办代转时）'), slot + ': the caller sentence is scoped to the office relay')
    assert.ok(text.includes('VMU_TURN_NO_PENDING_MEMBER'), slot + ': names the activation refusal code')
    assert.ok(!/caller 代转\*\*：`vibe_vmu_turn \{ op:"reply"/.test(text), slot + ': the old unbounded caller sentence (no office qualifier) is gone')
    assert.ok(!text.includes('不要调用 `op:"reply"`'), slot + ': the old blanket "do not call op:reply" literal stays gone')
  }
})

test('§5 criticism 7 the office-consult gate is readable in the chair NORMAL prompt (paper-final-only teaching would not count)', () => {
  assert.ok(normal.chair.includes('VMU_OFFICE_CONSULT_REQUIRED'), 'chair normal prompt names the gate code')
  assert.ok(/VMU_OFFICE_CONSULT_REQUIRED[^。]*consult/.test(normal.chair), 'the escape (consult) is taught next to the code')
  assert.equal(normal.chair.split('VMU_OFFICE_CONSULT_REQUIRED').length - 1, 1, 'the gate is taught exactly once (no duplicate bullet)')
})

test('§6 criticism 9 the office dispatches and relays; writing stays with the seat — one authoritative sentence, no restatement in charter-org', () => {
  const fixture = sections.filter((s) => s.slot === 'chair' && s.phase === 'normal' && s.sectionId === 'v5r-fixture-tools').map((s) => s.text).join('\n')
  assert.ok(fixture.includes('所办只派回合与转达'), 'fixture-tools keeps the one authoritative sentence')
  assert.ok(fixture.includes('写入由席位自己完成'), 'the writing boundary is stated')
  assert.ok(!fixture.includes('立所、雇佣'), 'the old office-dispatch wording is gone from the fixture block')
  const charterOrg = sections.filter((s) => s.slot === 'chair' && s.phase === 'normal' && /charter-org/.test(s.sectionId)).map((s) => s.text).join('\n')
  assert.ok(!charterOrg.includes('立所、雇佣'), 'charter-org no longer restates office duties')
})

test('§7 criticism 10 members/temps are told only op:"status" of vibe_vmu_turn is meaningful for them', () => {
  for (const slot of ['member', 'temp']) {
    const text = normal[slot]
    assert.ok(text.includes('`vibe_vmu_turn` 只有 `op:"status"` 有意义'), slot + ': limits vibe_vmu_turn to op:status')
    assert.ok(/step\/drive\/abandon (是|归)所办\/主席/.test(text), slot + ': names the actions that belong to office/chair')
  }
})

// The ceiling is the measurement taken at the start of TB-2732 (29 500 / 26 002 / 22 669 = 78 171). The seven
// corrections are a net-zero task: merging restatements had to pay for every added sentence, so the sum must not
// grow past that measurement.
const TB2732_BASELINE = { chair: 29500, sum: 78171 }
// ★ TB-2752 / RUN 80 (prompt-lane review + audit): four prompt corrections measured on the SAME collect() ruler as the
// RUN 78 baseline. RUN 78's ceiling is a net-zero measurement and RUN 80's batch is not net-zero, so its growth enters
// this suite as a NAMED line item — never by editing 78 171 into the measured number (that would erase the baseline).
// Per seat: chair +51 (roster bullet +45, seat-faces paper-flow bullet +6), member +45, temp 0; sum +96, still inside
// the taskbook's +120 envelope. No cap / ratchet was raised.
const TB2752_RUN80_FIXES = { chair: 51, member: 45, temp: 0, sum: 96 }
test('§8 the RUN 78 corrections are net-zero, plus the NAMED RUN 80 batch (+96): three-seat normal sum ≤ baseline + TB-2752', () => {
  assert.equal(Object.keys(normalCombos).length, 3, 'three seats measured (a shrunken set would pass vacuously)')
  const sumCeiling = TB2732_BASELINE.sum + TB2752_RUN80_FIXES.sum
  const chairCeiling = TB2732_BASELINE.chair + TB2752_RUN80_FIXES.chair
  assert.ok(normalSum <= sumCeiling, 'three-seat normal sum ' + normalSum + ' ≤ ' + sumCeiling + ' (baseline ' + TB2732_BASELINE.sum + ' + TB-2752 +' + TB2752_RUN80_FIXES.sum + ')')
  assert.ok(normalCombos.chair <= chairCeiling, 'chair/normal ' + normalCombos.chair + ' ≤ ' + chairCeiling + ' (baseline ' + TB2732_BASELINE.chair + ' + TB-2752 +' + TB2752_RUN80_FIXES.chair + ')')
})

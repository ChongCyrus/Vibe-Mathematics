// RUN 79 (TB-2741) — ten prompt corrections from the 79th live run. Every assertion reads the ASSEMBLED text through
// the same collector the budget audit uses (never a source grep): the defects were readers following the prompt and
// doing the wrong thing (proof_ref under the session cwd, a reply vote that never counted, a `[蓝图]` block that does
// not exist), so only shipped text counts. Each item has a positive assertion and a matching "old world" negative; the
// three lamps in D:/_tmp/tb2741/tree break exactly these assertions.
import { strict as assert } from 'node:assert'
import { test } from 'node:test'

const { collect } = await import(new URL('../scripts/sim/audit/prompt-sections.mjs', import.meta.url).href)

const got = await collect({ slots: ['chair', 'member', 'temp'], phases: ['normal', 'meeting'] })
const sections = got.sections
const textOf = (slot, phase) => sections.filter((s) => s.slot === slot && s.phase === phase).map((s) => s.text).join('\n')
const sectionOf = (slot, phase, id) => sections.filter((s) => s.slot === slot && s.phase === phase && s.sectionId === id).map((s) => s.text).join('\n')

const normal = { chair: textOf('chair', 'normal'), member: textOf('member', 'normal'), temp: textOf('temp', 'normal') }
const meeting = { chair: textOf('chair', 'meeting'), member: textOf('member', 'meeting'), temp: textOf('temp', 'meeting') }
const normalCombos = Object.fromEntries(got.combos.filter((c) => c.phase === 'normal').map((c) => [c.slot, c.chars]))
const normalSum = Object.values(normalCombos).reduce((a, b) => a + b, 0)
const ALL = Object.values(normal).join('\n')

console.log('### RUN 79 / TB-2741 — the ten prompt corrections, asserted on assembled text')

test('§1 item 1 the proof path example uses a real seat id and the library root; proof_ref resolves against the root', () => {
  for (const [slot, text] of Object.entries(normal)) {
    assert.ok(text.includes('<roots.libraryRoot>/Members/<你的 id>/Proofs/…'), slot + ': the path example starts at the library root')
    assert.ok(text.includes('<roots.libraryRoot>/Members/r-acad/Proofs/p-1.md'), slot + ': the example uses the real roster id r-acad')
    assert.ok(text.includes('**`proof_ref` 的基准是库根**'), slot + ': proof_ref is said to resolve against the library root')
    assert.ok(!text.includes('Members/acad/Progress/progress.md'), slot + ': the old example with the non-roster id acad is gone')
    assert.ok(!text.includes('Members/acad/'), slot + ': no non-roster id survives in a path example')
  }
})

test('§2 item 2 vote_solved is a bookkeeping field that never counts alone; the tool is the only closure channel', () => {
  for (const [slot, text] of Object.entries(normal)) {
    assert.ok(text.includes('**只走工具** `vibe_vmu_vote`'), slot + ': the closure vote goes through the tool')
    assert.ok(text.includes('书账字段，永不单独计票'), slot + ': the reply field is bookkeeping, never counted alone')
    assert.ok(text.includes('fieldsIgnored'), slot + ': names the receipt surface that explains the ignore')
    for (const why of ['tool-not-mounted', 'tool-visible', 'tool-used-this-turn', 'tool-visibility-unprovable', 'legacy-row']) {
      assert.ok(text.includes(why), slot + ': the reason code ' + why + ' is named')
    }
    assert.ok(!text.includes('唯一入口，计 `vote_solved`'), slot + ': the contradictory "one entry that counts vote_solved" phrasing is gone')
    assert.ok(!text.includes('计 `vote_solved`'), slot + ': no sentence says the reply field is counted')
  }
})

test('§3 item 3 the receipt contract calls its fields an example, not a whitelist', () => {
  for (const [slot, text] of Object.entries(normal)) {
    assert.ok(text.includes('示例（不是白名单）'), slot + ': the four fields are introduced as an example, not a whitelist')
    assert.ok(!text.includes('最小集：'), slot + ': the old "minimal set" wording is gone')
  }
})

test('§4 item 4 no promise that the [蓝图] block always renders; the board status route is named instead', () => {
  for (const [slot, text] of Object.entries(normal)) {
    assert.ok(text.includes('`[蓝图]` 行由内核注入'), slot + ': the blueprint line is said to be kernel-injected')
    assert.ok(text.includes('liveReadings.blueprint'), slot + ': the fallback route names liveReadings.blueprint')
    assert.ok(text.includes('不会因为'), slot + ': the reader is told absence of the block is not evidence of absence')
    assert.ok(!text.includes('**`[蓝图]` 恒渲染**'), slot + ': the old "always renders" promise is gone')
  }
})

test('§5 item 5 each face names its own phase closed set and says the other face is not this one', () => {
  for (const [slot, text] of Object.entries(normal)) {
    assert.ok(text.includes('派回合面'), slot + ': names the dispatch face')
    assert.ok(text.includes('`vibe_v5_meeting_round` 的 phase 以工具声明为准，不属于本面'), slot + ': the meeting-round face is explicitly another face')
    // OLD WORLD: the closed-set sentence was written as a bare universal ("phase 是闭集，只有四个全名"), which a reader
    // took as the only phase vocabulary in the product. It stays, but must now be scoped to its face in the same breath.
    const at = text.indexOf('phase` 是闭集，只有四个全名')
    assert.ok(at >= 0, slot + ': the dispatch-face closed set is still taught')
    const scoped = text.slice(at, at + 400)
    assert.ok(scoped.includes('派回合面') && scoped.includes('不属于本面'), slot + ': the closed-set sentence is qualified by its face')
  }
})

test('§6 item 6 draft rows are shared while the draft file is private; who may edit which half is stated', () => {
  for (const [slot, text] of Object.entries(normal)) {
    assert.ok(text.includes('共享的是行、私有的是文件'), slot + ': states the shared-row / private-file split')
    assert.ok(text.includes('md 是你自己的文件（只有你能改）'), slot + ': says only the author edits the md file')
    assert.ok(!text.includes('草案不是私有的：propose'), slot + ': the old "the draft is not private" sentence is gone')
  }
})

test('§7 item 7 the action boundary is one paragraph that branches by delivery path', () => {
  const fixture = sectionOf('chair', 'normal', 'v5r-fixture-tools')
  assert.ok(fixture.includes('所办只派回合与转达'), 'fixture-tools keeps the one authoritative dispatch sentence')
  assert.ok(fixture.includes('写入由席位自己完成'), 'the writing boundary stays in the same sentence')
  assert.ok(fixture.includes('activation'), 'the fixture block names the activation path')
  assert.ok(fixture.includes('caller 代转'), 'the fixture block names the caller-relay path')
  assert.ok(fixture.includes('（所办代转时）'), 'the caller sentence is scoped to the office relay')
  const boundary = sectionOf('member', 'normal', 'v5r-seat-act-boundary')
  assert.ok(boundary.includes('按交付方式分支'), 'the boundary section branches by delivery mode')
  assert.ok(!boundary.includes('所办只派回合与转达'), 'the boundary section does not restate the office sentence (merged once)')
})

test('§8 item 8 the status board is taught as kernel-injected, with the column meanings', () => {
  const board = sections.filter((s) => s.slot === 'member' && s.phase === 'normal' && s.sectionId === 'v5r-turn-board').map((s) => s.text).join('\n')
  assert.ok(board.includes('由内核注入'), 'the board section says the block is kernel-injected')
  assert.ok(board.includes('「读数｜来源｜取值时刻」'), 'the three column meanings are given')
  assert.ok(board.includes('具名理由'), 'a missing timestamp must carry a named reason')
})

test('§9 item 9 tool_help has one authority (the tool description); the prompt keeps only a pointer and no fake signature', () => {
  assert.ok(ALL.includes('见工具 description'), 'the prompt points at the tool description')
  assert.ok(!ALL.includes('tool_help({"tool"'), 'the old wrong tool_help signature is gone from shipped text')
  assert.ok(!ALL.includes('declarationSet') && !ALL.includes('measuredSet'), 'the two-reading vocabulary stays in the description, not duplicated in prompts')
})

test('§10 item 10 next_step is orchestration advice, not a conclusion; the "no external dispatch" claim is gone', () => {
  for (const [slot, text] of Object.entries(normal)) {
    assert.ok(text.includes('编排建议'), slot + ': next_step is called orchestration advice')
    assert.ok(!text.includes('本所没有**外部**派活'), slot + ': the old "no external dispatch" claim is gone')
  }
})

// The baseline is the measurement taken at the start of TB-2741 (29 491 / 25 993 / 22 660 = 78 144). The ten
// corrections were a net-zero task: every added sentence had to be paid for by merging a restatement.
// RUN 272 paid 90 back on purpose: the net-zero budget had deleted three clauses that carry CONDITIONS rather
// than wording, and T1 caught it (see the RUN272_RUN79_RESTORE ledger in vmu-run256-prompts-compress and
// vmu-run77-prompt-corrections). +8 the "（旧任务书简写）" relapse anchor, +14 "形状问题 != 引擎不可用", +8
// "别自己数人头" — 30 per seat, 90 across the three normal seats. The ceiling moves by exactly that, and the
// equality below is what keeps the accounting honest: neither a silent trim nor a silent re-bloat passes.
const TB2741_BASELINE = { chair: 29491, sum: 78144 }
// What the ten corrections actually saved per seat, and what RUN 272 paid back. Both are measured, not hoped:
// the equality below fails on any silent trim or silent re-bloat in either direction.
const TB2741_CORRECTIONS_NET = { chair: -22, sum: -66 }
const RUN272_RUN79_RESTORE = { chair: 30, sum: 90 }
test('§11 three-seat normal sum is the baseline plus the corrections plus the RUN 272 restore, and nothing else', () => {
  assert.equal(Object.keys(normalCombos).length, 3, 'three seats measured (a shrunken set would pass vacuously)')
  assert.equal(normalSum, TB2741_BASELINE.sum + TB2741_CORRECTIONS_NET.sum + RUN272_RUN79_RESTORE.sum,
    'three-seat normal sum ' + normalSum + ' = baseline ' + TB2741_BASELINE.sum + ' · corrections ' + TB2741_CORRECTIONS_NET.sum + ' · restore ' + RUN272_RUN79_RESTORE.sum)
  assert.equal(normalCombos.chair, TB2741_BASELINE.chair + TB2741_CORRECTIONS_NET.chair + RUN272_RUN79_RESTORE.chair,
    'chair/normal ' + normalCombos.chair + ' = baseline ' + TB2741_BASELINE.chair + ' · corrections ' + TB2741_CORRECTIONS_NET.chair + ' · restore ' + RUN272_RUN79_RESTORE.chair)
})

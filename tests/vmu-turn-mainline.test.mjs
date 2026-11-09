// RUN 203 — USER DECISION (m21130): the mainline must not be something the institute is told ONCE and then forgets.
// Two claims are measured here, on the REAL assembled prompt rather than on source text that merely looks right:
//   1. the section `v5r-turn-mainline` is in the ALWAYS-ON list (`kind: 'role'`), so all three seats render it in
//      EVERY phase — a reminder that can be switched off is one that lies by omission;
//   2. the seat's prompt still fits the T99 budget, whose cap is now 30000 because the mainline had to fit in it.
// The CONTENT claim (the seven rules in the operator's doc are each anchored, verbatim, in the ledger) is measured
// too, because a doctrine nobody can point at is exactly what this repository refuses to ship.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { createTurnOrchestrator, statusBoardReadings } from '../vibe-math-vmu/kernel/turn/index.js'
import { createRecords } from '../vibe-math-vmu/kernel/records.js'
import { createTasks } from '../vibe-math-vmu/kernel/tasks.js'
import { createPromptPipeline } from '../vibe-math-vmu/kernel/prompt/index.js'
import { collectPackSections } from '../vibe-math-vmu/kernel/pack.js'
import { PACK } from '../vibe-math-vmu/packs/v5r/prompts/v5r-core.js'
import { decideSections as DECIDE_SECTIONS } from '../vibe-math-vmu/packs/v5r/middleware/prompt-switches.js'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')
const BLOCKS = read('vibe-math-vmu/packs/v5r/prompts/v5r-blocks-b.js')
const TURN_TEST = read('tests/vmu-turn.test.mjs')
const LEDGER = JSON.parse(read('docs/acceptance/rules-ledger.json'))
const DOC = read('../宏观层面v5r运行规则.md')

const ok = (cond, msg, extra) => assert.ok(cond, msg + (extra === undefined ? '' : '\n' + JSON.stringify(extra, null, 2)))
const has = (hay, needle, msg) => ok(String(hay).includes(needle), msg + ' — missing: ' + needle)

// The defaults are parsed from the SCHEMA file rather than hard-coded, so this test is not agreeing with itself.
const defaults = {}
for (const m of read('vibe-math-vmu/settings/schema.js').matchAll(/\{ key: '([^']+)',[^}]*?def: (?:'([^']*)'|([0-9.]+)|(true|false))[^}]*\}/g)) {
  defaults[m[1]] = m[2] !== undefined ? m[2] : (m[3] !== undefined ? Number(m[3]) : m[4] === 'true')
}

const MARK = '【核心推进方向（主线）】'

// ★ RUN 262 / TB-2672 (lead m07337-B): G8 and G14 used to be held up by a KEYWORD only (`蓝图`, `类似问题`). A keyword
// pin survives the two mutations that matter — deleting the condition half, and reversing the meaning — because the word
// is still there. Each rule now gets a WHOLE-SENTENCE pin measured on the REAL assembly (`loop.assemble`), and the
// sentence carries its own conditions: G8's 「不是零散任务清单，每一步都要能说清在蓝图上推进了什么」 (what the mainline
// is NOT), G14's 「先查蓝图与归档，能迁移复用就复用，别重复探索」 (the order of the check and the reuse exception).
// The keyword pins §1b/§1c stay as SMOKE; the sentence pins are the CRITERION. Do not delete the keyword pins: two pins,
// two jobs — the words must still be there AND the sentence must still say what the rule requires.
// If this pin goes red because the prompt was reworded, that is the LITERAL pin working as designed (TB-2672 class C):
// a HUMAN must confirm it is a wording-only change, and the constant is updated in the SAME commit with that note in the
// commit message. Do NOT edit the constant just to turn the pin green, and never trim it to a keyword (see the 1j/1k guards).
const G8_SENTENCE = '一条主线＝**原问题的实现蓝图的策划、细化、调整，以及由粗到细的构建、扩张、推进与实现**；不是零散任务清单，每一步都要能说清在蓝图上推进了什么。'
const G14_SENTENCE = '③**以前是否处理过类似问题**——先查蓝图与归档，能迁移复用就复用，别重复探索。'
const ctxOf = (role, phase) => ({
  member: 'r-1',
  role,
  roleLabel: role === 'academician' ? '院士' : (role === 'temp' ? '临时工' : '常驻研究员'),
  phase,
  round: 3,
  roster: 'acad、r-1',
  quorum: 2,
  statusBlock: '[状态] x',
  settings: defaults,
})
const loopOf = () => createTurnOrchestrator({
  sectionPolicy: DECIDE_SECTIONS,
  prompt: createPromptPipeline({ sections: collectPackSections([PACK]), clock: () => '2026-01-01T00:00:00.000Z' }),
})

test('the mainline reaches every seat, every round', async () => {
  console.log('\nRUN 203 — the mainline block (user decision): every seat, every phase, and the budget to hold it')
  // ── §0 the block is DECLARED as an always-on role section, before the blueprint it points at ────────────────
  {
    const at = BLOCKS.indexOf("name: 'v5r-turn-mainline'")
    ok(at > 0, '§0 the mainline section is declared in the prompt blocks (a reminder nobody declares is nobody\'s)')
    const block = BLOCKS.slice(Math.max(0, at - 1200), BLOCKS.indexOf("name: 'v5r-turn-blueprint'", at))
    has(block, 'order: 829', '§0a ordered 829 — IMMEDIATELY BEFORE the blueprint block (order 830), so the reminder is read where the blueprint is described')
    has(block, "kind: 'role'", '§0b kind role — a role section, not a phase-scoped one: it cannot be absent from any seat prompt')
    const seats = ['academician', 'researcher', 'temp'].filter((s) => block.includes(s + ': ['))
    ok(seats.length === 3, '§0c all THREE seats have their own text', { seats })
    // ★ RUN 206 (FEEDBACK43 1.7): one SHARED core, three seat duties — a per-seat rewrite is what made three seats quote
    // three different paragraphs back. The marker now appears ONCE (in the core) and all three seats reference it.
    // The CORE is declared ABOVE the blocks array, so the marker is counted over the whole file and the references are
    // counted inside the block slice: one body, three seats.
    ok((BLOCKS.match(/核心推进方向（主线）/g) || []).length === 1,
      '§0d the shared core body carries the marker exactly once (the seats append only their own duty)',
      { markers: (BLOCKS.match(/核心推进方向（主线）/g) || []).length })
    ok((block.match(/MAINLINE_CORE/g) || []).length === 3,
      '§0d-2 all THREE seats render that one core (a seat that stops using it would drift silently)',
      { refs: (block.match(/MAINLINE_CORE/g) || []).length })
    has(BLOCKS, 'mainline-v2', '§0d-3 the core carries a VERSION, so a paraphrase can be detected instead of argued')
    has(BLOCKS.slice(BLOCKS.indexOf('const MAINLINE_SEAT'), BLOCKS.indexOf('export const CHARTER_BLOCKS_B')), 'vibe_v5_blueprint',
      '§0e the seat DUTY names the face that updates a blueprint — a duty with no tool is a slogan')
    has(BLOCKS, 'T99 cap 30000', '§0f the file comment states the cap this round raised (20000 → 30000)')
    has(TURN_TEST, 'asmLen.text.length < 30000', '§0g the budget gate itself was raised, not just the comment')
  }

  // ── §1 the REAL assembled prompt carries it, per seat, in every phase ──────────────────────────────────────
  {
    const seen = {}
    for (const role of ['academician', 'researcher', 'temp']) {
      for (const phase of ['normal', 'meeting', 'checkpoint']) {
        const loop = loopOf()
        const asm = await loop.assemble(loop.open(ctxOf(role, phase)).turn)
        const hits = (asm.text.match(new RegExp(MARK.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length
        ok(hits === 1, `§1 ${role}/${phase}: the mainline appears EXACTLY ONCE (twice is noise, zero is forgetting)`, { role, phase, hits })
        if (phase === 'normal') seen[role] = asm.text
      }
    }
    for (const [role, text] of Object.entries(seen)) {
      // SMOKE (kept on purpose, TB-2672 §3): a word that disappeared is still a defect, and this pin names it cheaply.
      has(text, '类似问题', `§1b ${role}: SMOKE — the words "类似问题" are still in the assembled prompt (the criterion is §1b2)`)
      has(text, '蓝图', `§1c ${role}: SMOKE — the word "蓝图" is still in the assembled prompt (the criterion is §1c2)`)
      // CRITERION (TB-2672): the WHOLE sentence, on the real assembly, per seat. Deleting the condition half or reversing
      // the meaning turns this red even though every keyword is still present.
      has(text, G8_SENTENCE, `§1c2 ${role}: G8 — the whole sentence is in the assembled prompt, including "不是零散任务清单，每一步都要能说清在蓝图上推进了什么" (a keyword-only pin cannot see a deleted condition)`)
      has(text, G14_SENTENCE, `§1b2 ${role}: G14 — the whole sentence is in the assembled prompt, including "先查蓝图与归档，能迁移复用就复用，别重复探索" (the check BEFORE the work, with the reuse exception)`)
      // ── G9/G11/G12/G13: the accumulation clause is ONE sentence in the shared core; each rule is a readable
      //    分句 of it, measured on the REAL assembly above (`loop.assemble`), never on the source literal. A source
      //    pin would stay green while the assembled prompt dropped the sentence — the RUN 249 `[新到的消息]`
      //    failure mode. Each assertion names the rule it holds up.
      has(text, '持续积累与主线推进、改进、调整相关的认知与有价值反馈',
        `§1e ${role}: G9 — cognition and feedback that move the mainline are ACCUMULATED, said in the assembled prompt`)
      has(text, '据实践反馈调整、细化蓝图并更新节点信息',
        `§1f ${role}: G11 — the blueprint is refined FROM PRACTICE and its nodes updated, said in the assembled prompt`)
      has(text, '吸取经验持续改进',
        `§1g ${role}: G12 — experience keeps improving the way of working, said in the assembled prompt`)
      has(text, '把经验一般化、迁移到新问题',
        `§1h ${role}: G13 — valuable experience is GENERALISED and transferred to new problems, said in the assembled prompt`)
      if (role === 'researcher') {
        has(text, '让下一个人不必重走',
          '§1i researcher: G13 — the seat duty keeps obstacle-solution experience so the next person need not repeat it')
      }
    }
    // §1j/§1k: the two criteria are not slogans. Each sentence must still carry the half that gives the rule its teeth —
    // trim the constant down to "一条主线" or "以前是否处理过类似问题" and these fail FIRST, so the sentence pin cannot go
    // vacuously green by measuring a shortened copy of itself.
    ok(G8_SENTENCE.includes('不是零散任务清单') && G8_SENTENCE.includes('每一步都要能说清'),
      '§1j G8: the criterion still carries the condition half (what a mainline is NOT, and the per-step test)')
    ok(G14_SENTENCE.includes('先查蓝图与归档') && G14_SENTENCE.includes('能迁移复用就复用') && G14_SENTENCE.includes('别重复探索'),
      '§1k G14: the criterion still carries the check-BEFORE-work half and the reuse exception')
    ok(seen.researcher.length < 30000, '§1d the researcher prompt still fits the raised cap, so the mainline is not a budget fiction', { chars: seen.researcher.length })
  }

  // ── §2 the operator's doc and the ledger agree, line for line ──────────────────────────────────────────────
  {
    const items = LEDGER.items.filter((it) => /^G(8|9|1[0-4])$/.test(it.id))
    ok(items.length === 7, '§2 seven mainline rules are in the ledger (G8–G14: the existing ids stop at G7)', { got: items.map((i) => i.id) })
    for (const it of items) {
      ok(it.status === 'DONE', `§2a ${it.id} is DONE, with evidence (a doctrine row that is not landed is a wish)`, { status: it.status, next: it.next })
      ok(typeof it.ruleText === 'string' && it.ruleText.trim().length >= 10 && (DOC.split(it.ruleText).length - 1) === 1, `§2b ${it.id} carries the operator's sentence verbatim, and that sentence identifies exactly ONE line`, { ruleText: it.ruleText, occurrences: typeof it.ruleText === 'string' ? DOC.split(it.ruleText).length - 1 : null })
      has(DOC, it.ruleText, `§2c ${it.id}: that sentence is really in the operator's doc (a paraphrase is a different rule)`)
      ok(Array.isArray(it.mechanism) && it.mechanism.length > 0, `§2d ${it.id} names the code that makes it more than prose`)
      ok(Array.isArray(it.tool) && it.tool.length > 0, `§2e ${it.id} names the tool face a member would actually call`)
    }
    has(DOC, '## 核心推进方向（主线）', '§2f the operator\'s doc has the new section, written BEFORE 流程 so it is read first')
    ok(DOC.indexOf('## 核心推进方向（主线）') < DOC.indexOf('## 流程'), '§2g and it sits BEFORE the process section, exactly as decided')
    ok((DOC.match(/## 核心推进方向（主线）/g) || []).length === 1, '§2h it is one section, not a heading repeated per phase')
  }
})

// ── D1 (rule L37 `- 各自推进各自的总任务。`): "each advances its OWN total task" ────────────────────────────────
// What was PROSE before this block: the status board's ②③④ were per-member derivations, but every test that touched
// them fed `statusBoardReadings` a FIXTURE. A fixture proves the formatter, never that two real members reading the
// REAL ledger get different own-slices. This block boots the real orchestrator + real records/tasks handles and
// measures the prompt each member would actually receive.
//
// Reading of the rule (deliberate, and different from a naive "two different objectives"): ① the INSTITUTE objective
// is legitimately one value in this kernel (`vmu.turn.objective`), so the rule is NOT satisfied by giving two members
// two different objectives — that would be two institutes. It is satisfied when (a) ① is explicitly labelled
// institute-wide so no member mistakes it for their own, and (b) ②③④ are the caller's own slice of the ONE plan,
// derived from the real ledger, with the institute totals still visible but attributed. That is what the assertions
// below hold up.
test('D1 — two members advance their OWN task, off the real ledger', async () => {
  let tick = 0
  const clock = () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)).toISOString()
  const settings = { 'vmu.turn.objective': '证出主定理' }
  const records = createRecords({ clock, settings })
  const tasks = createTasks({ clock, settings })

  // r-1 owns t-1 and t-3; r-2 owns t-2. Both members are REAL rows in the SAME ledger.
  await tasks.create({ title: '把主定理拆成引理', owner: 'r-1' })
  await tasks.create({ title: '找反例', owner: 'r-2' })
  await tasks.create({ title: '写引理 3 的证明', owner: 'r-1' })
  // r-1 writes first, r-2 writes LAST — so "the newest progress row in the track" is r-2's. A board that read the
  // track's global newest row would show rec-2 to BOTH members; the rule needs each member to see their own.
  records.put({ track: 'progress', kind: 'progress', title: '引理 3 进度', body: '- 进度：2/5', by: 'r-1', settled: true })
  records.put({ track: 'progress', kind: 'progress', title: '反例搜索', body: '- 进度：1/3', by: 'r-2', settled: true })

  const boardOf = async (member) => {
    const loop = createTurnOrchestrator({
      sectionPolicy: DECIDE_SECTIONS,
      prompt: createPromptPipeline({ sections: collectPackSections([PACK]), clock }),
      faces: { 'vmu.tasks': tasks, 'vmu.records': records },
      settings,
      clock,
    })
    const opened = loop.open({ member, role: 'researcher', roleLabel: '常驻研究员', phase: 'normal', round: 1, rosterIds: ['r-1', 'r-2'] })
    ok(opened.ok === true, `§D1 ${member}: the real turn opens (a board cannot be measured on a turn that never started)`, opened)
    const asm = await loop.assemble(opened.turn)
    // The status block is the LAST line group the loop synthesised from the ledger — take the block that starts with
    // a line that IS `[状态板]` (the teaching prose mentions it inside a sentence, so an exact line match is the cut).
    const lines = String(asm.text).split('\n')
    const at = lines.findIndex((l) => l.trim() === '[状态板]')
    ok(at >= 0, `§D1 ${member}: the assembled prompt carries the status block header`, { chars: asm.text.length })
    const row = (key) => lines.slice(at).find((l) => l.startsWith(key)) || ''
    return { text: asm.text, objective: row('[总任务]'), plan: row('[规划]'), tasks: row('[各任务完成状态]'), current: row('[当前小任务]') }
  }

  const a = await boardOf('r-1')
  const b = await boardOf('r-2')

  // §D1a: the REAL assembly, not a fixture — both members' prompts carry all four rows.
  for (const [who, board] of [['r-1', a], ['r-2', b]]) {
    for (const key of ['[总任务]', '[规划]', '[各任务完成状态]', '[当前小任务]']) {
      has(board.text, key, `§D1a ${who}: the assembled prompt carries ${key} (the board is read off the ledger, not passed in)`)
    }
  }

  // §D1b: ① is ONE institute objective, and it SAYS so. Two different objectives would be two institutes; the rule is
  // honoured by labelling the single objective as institute-wide instead of letting a member read it as their own.
  has(a.objective, '全所总任务，内核只有一份', '§D1b r-1: the objective row names itself as the institute\'s single objective (not "your task")')
  has(b.objective, '全所总任务，内核只有一份', '§D1b r-2: the same row carries the same label for the other member')
  has(a.objective, '你自己的份额是 owner 是你的那些任务', '§D1b-2 r-1: and it points the member at where their OWN share lives (②③)')

  // §D1c: ② 规划 leads with the caller's OWN slice — and that slice is the caller's owner rows, not the institute plan.
  const ownPlan = (board, member) => {
    const m = board.plan.match(new RegExp('属于你（' + member + '，未完成 \\d+ 条）：(.*?)；全所可开工：'))
    ok(m !== null, `§D1c ${member}: the plan row leads with an own-slice segment`, { plan: board.plan })
    return m[1]
  }
  const aOwn = ownPlan(a, 'r-1')
  const bOwn = ownPlan(b, 'r-2')
  has(aOwn, 't-1「把主定理拆成引理」', '§D1c r-1: own slice carries t-1 (owner r-1)')
  has(aOwn, 't-3「写引理 3 的证明」', '§D1c r-1: own slice carries t-3 (owner r-1)')
  ok(!aOwn.includes('t-2'), '§D1c r-1: own slice does NOT carry t-2 — that task belongs to r-2', { own: aOwn })
  has(bOwn, 't-2「找反例」', '§D1c r-2: own slice carries t-2 (owner r-2)')
  ok(!bOwn.includes('t-1') && !bOwn.includes('t-3'), '§D1c r-2: own slice does NOT carry r-1\'s tasks', { own: bOwn })

  // §D1d: ③ counts the same own slice, so the two members read different completion states of the one plan.
  has(a.tasks, '属于你（r-1，未完成 2 条）：assigned 2', '§D1d r-1: ③ counts r-1\'s two unfinished tasks')
  has(b.tasks, '属于你（r-2，未完成 1 条）：assigned 1', '§D1d r-2: ③ counts r-2\'s one unfinished task — a different reading of the same board')
  has(a.tasks, '全所：共 3 条', '§D1d-2 r-1: the institute total is still visible (own slice is a slice, not a filter on the truth)')

  // §D1e: ④ is THIS member's newest progress row. r-2 wrote last, so a global-newest board would hand rec-2 to r-1.
  has(a.current, 'rec-1', '§D1e r-1: ④ is r-1\'s own newest progress row (rec-1)')
  ok(!a.current.includes('rec-2'), '§D1e r-1: ④ is NOT the track\'s global newest row (rec-2 belongs to r-2)', { current: a.current })
  has(b.current, 'rec-2', '§D1e r-2: ④ is r-2\'s own newest progress row (rec-2)')
  ok(!b.current.includes('rec-1'), '§D1e r-2: ④ is NOT r-1\'s row', { current: b.current })

  // §D1f: cross-read — the institute line still names the other member's task WITH its owner, so "visible" and
  // "adopted" are different readings, not the same one.
  has(a.plan, 't-2「找反例」（r-2）', '§D1f r-1: the institute part of the plan names r-2\'s task with its owner (visible, not adopted)')
  has(b.plan, 't-1「把主定理拆成引理」（r-1）', '§D1f r-2: the institute part names r-1\'s task with its owner')

  // §D1g: the board's isolation is backed by the LEDGER's own writer filter — not by the formatter.
  const mineA = records.list({ track: 'progress', by: 'r-1' })
  const mineB = records.list({ track: 'progress', by: 'r-2' })
  ok(mineA.count === 1 && mineA.items[0].id === 'rec-1', '§D1g the records face itself returns exactly r-1\'s progress row for by:"r-1"', { count: mineA.count })
  ok(mineB.count === 1 && mineB.items[0].id === 'rec-2', '§D1g and exactly r-2\'s row for by:"r-2" (each writes their own, nobody overwrites)')

  // §D1h: the office view (no member) is unchanged — a member's reading must not rewrite the institute board.
  const office = statusBoardReadings({ tasks, records, member: undefined, settings, at: clock() })
  ok(!String(office.plan.value).includes('属于你'), '§D1h the office board has NO own-slice lead-in (its plan is the institute plan)', { plan: office.plan.value })
  ok(!office.objective.scopeNote, '§D1h the office objective carries no member-facing scope note (that note exists to stop a MEMBER mis-reading ①)')
  ok(office.current.value === null || /未指定成员/.test(String(office.current.value)), '§D1h the office board does not pretend to have a personal current task', { current: office.current.value })
})

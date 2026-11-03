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
import { createTurnOrchestrator } from '../vibe-math-vmu/kernel/turn/index.js'
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
      has(text, '类似问题', `§1b ${role}: the seat is told to ask whether the problem was handled BEFORE — reuse over re-exploration`)
      has(text, '蓝图', `§1c ${role}: the point is named as the blueprint, not as a task list`)
    }
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

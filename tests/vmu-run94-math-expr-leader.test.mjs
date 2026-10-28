// ROUND 94 (real machine, run 94): three readings the institute was entitled to and did not get.
//
//  ① `vibe_vmu_mathtools { action:"run", args:{ expr:"2**10+1" } }` answered `ok:true, value:0, stdout:""`.
//     The engine had evaluated the expression and printed NOTHING, and `kernel/math.js` turned "printed
//     nothing" into the number 0 — a value nobody computed, on the SUCCESS path. Expression mode now
//     PRINTS its value (per-engine `exprPrint`), and an empty stdout reads as `value:null` + a named
//     `valueMissing` instead of an invented zero.
//  ② `vibe_v5_meeting { action:"agendaitems", id:"m2" }` opened with "no PRIMITIVE meeting with id m2" —
//     the first clause reads as "the meeting is missing" when the real answer is "this verb never crosses
//     registries". A boundary-first refusal says the true thing first.
//  ③ `vibe_v5_start` seated the academician and left `vmu.turn.leaderId` empty, so every prompt opened with
//     `chair-seated-but-leaderId-empty` (the charter said the institute had no academician). The act that
//     seats the chair now records who leads — without overwriting a leader the operator chose.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import * as math from '../vibe-math-vmu/kernel/math.js'
import { MATH_ENGINES } from '../vibe-math-vmu/math-engines.js'
import { primitiveMissError } from '../vibe-math-vmu/tools/meeting.js'
import { V5R_PACK_TOOLS } from '../vibe-math-vmu/packs/v5r/tools.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')

function fakeHost({ stdout = '1025\n', exit = 0 } = {}) {
  const spawns = []
  return {
    spawns,
    register() { return { ok: true } },
    projectRoot() { return 'X:/fake/project' },
    writeText() { return { ok: true } },
    readText() { return { ok: false, code: 'ENOENT' } },
    exists() { return false },
    resolveExecutable(cmd) { return String(cmd) },
    listDir() { return { ok: true, entries: [] } },
    params() { return { mathEngines: ['python'] } },
    async spawn(req) {
      spawns.push(req)
      const argv = JSON.stringify(req.argv || req.args || [])
      if (argv.includes('--version')) return { exit: 0, stdout: 'Python 3.12.10\n', stderr: '', ms: 3, timedOut: false }
      return { exit, stdout, stderr: '', ms: 3, timedOut: false }
    },
  }
}

test('§1 every engine that can evaluate an expression also has a template that PRINTS it', () => {
  const printable = Object.keys(MATH_ENGINES).filter((k) => Array.isArray(MATH_ENGINES[k].exprPrint))
  assert.deepEqual(printable.sort(), ['julia', 'maple', 'matlab', 'octave', 'python', 'r', 'wolfram'])
  for (const k of printable) {
    const tmpl = MATH_ENGINES[k].exprPrint.join(' ')
    assert.equal(tmpl.includes('<expr>'), true, k + ' exprPrint carries the placeholder')
    assert.match(tmpl, /print|disp|Print/i, k + ' exprPrint must PRINT the value')
  }
  // the generic cli descriptor has no evaluator and stays out of the list
  assert.equal(MATH_ENGINES.cli.exprPrint, undefined)
})

test('§2 mode:expr reaches the engine through the PRINTING template (not a silent evaluation)', async () => {
  const host = fakeHost({ stdout: '1025\n' })
  const surface = math.createMathSurface({ host })
  const out = await surface.runPlan({ op: 'numeric', args: { expr: '2**10+1', engine: 'python' } })
  assert.equal(out.ok, true)
  const exec = host.spawns.filter((s) => !JSON.stringify(s.argv || []).includes('--version'))
  assert.equal(exec.length >= 1, true, 'the expression was executed')
  const argv = JSON.stringify(exec[exec.length - 1].argv || [])
  assert.equal(argv.includes('print(2**10+1)'), true, 'the expression is wrapped in print(), argv=' + argv)
  assert.equal(out.result.value, '1025')
  assert.equal(out.result.valueMissing, null)
})

test('§3 an empty stdout is NO value — the kernel no longer invents a zero', async () => {
  const silent = math.createMathSurface({ host: fakeHost({ stdout: '', exit: 0 }) }).runPlan({ op: 'numeric', args: { expr: '2**10+1', engine: 'python' } })
  const out = await silent
  assert.equal(out.ok, true, 'the run itself succeeded (exit 0)')
  assert.equal(out.result.value, null, 'nothing was printed, so there is no value')
  assert.equal(out.result.valueMissing, 'stdout-empty')
  assert.match(out.result.valueMeans, /NO value was reported/)
  // ★ ROUND 96: the sentence is shared with math_computation.js#printedValueOf, so it names the CAUSE (expression
  // modes print nothing), not the request field.
  assert.match(out.result.valueMeans, /expression modes evaluate without printing/)
  assert.match(out.result.valueMeans, /invented/)
})

test('§4 a printed value still reads as that value (code mode unchanged)', async () => {
  const out = await math.createMathSurface({ host: fakeHost({ stdout: '1025\r\n', exit: 0 }) }).runPlan({ op: 'numeric', args: { code: 'print(2**10+1)', engine: 'python' } })
  assert.equal(out.ok, true)
  assert.equal(out.result.value, '1025')
  assert.equal(out.result.valueMissing, null)
})

test('§5 a verb that never crosses registries says THAT first, not "the meeting is missing"', () => {
  const e = primitiveMissError({ id: 'm2', inService: true, action: 'agendaitems' })
  assert.match(e.message, /addresses the PRIMITIVE registry only and never crosses/)
  assert.match(e.message, /lives in the SERVICE registry/)
  assert.equal(e.message.startsWith('no PRIMITIVE meeting with id'), false, 'the boundary fact leads')
  assert.equal(e.boundaryOnly, true)
  // ★ ROUND 96: the id exists in the other registry, so "no such object" was the wrong CODE for a boundary.
  assert.equal(e.code, 'VMU_REGISTRY_BOUNDARY')
  assert.match(e.hint, /PRIMITIVE registry only and does NOT cross/)
  // a verb that DOES cross keeps the old shape (its problem is the other registry's method list)
  const crossing = primitiveMissError({ id: 'm2', inService: true, action: 'status' })
  assert.equal(crossing.boundaryOnly, false)
  assert.match(crossing.message, /no PRIMITIVE meeting with id m2/)
})

test('§6 seating the chair records who leads (and never overwrites an operator choice)', async () => {
  const tool = V5R_PACK_TOOLS.filter((t) => t.name === 'vibe_v5_start')[0]
  assert.ok(tool, 'the start tool is declared')

  function fakeKernel(store) {
    const roster = []
    const defs = {
      'vmu.turn.leaderId': { key: 'vmu.turn.leaderId', hot: 'H2', who: 'office', type: 'string' },
      'vmu.turn.objective': { key: 'vmu.turn.objective', hot: 'H2', who: 'office', type: 'string' },
    }
    return {
      store,
      settingDef(k) { return defs[k] || null },
      members: {
        async hire({ id, slot }) { roster.push({ id, slot, state: 'live' }); return { id, slot } },
        roster() { return roster.slice() },
      },
      settingsView() { return { get: (k) => store[k] } },
      async start() { return { ok: true } },
      setSettingsValue(key, value) { store[key] = value; return { ok: true, key, applied: 'immediate' } },
      setMemberToolOverride() { return { ok: true } },
    }
  }
  const empty = {}
  const first = await tool.handler({ academician: true, researcherCount: 1 }, { kernel: fakeKernel(empty) })
  assert.equal(first.ok, true)
  assert.equal(empty['vmu.turn.leaderId'], 'r-acad', 'the seated chair becomes the leader in the same act')
  const appliedKeys = first.applied.map((a) => a && a.key).filter(Boolean)
  assert.equal(appliedKeys.includes('vmu.turn.leaderId'), true, 'the receipt reports what it wrote')

  const chosen = { 'vmu.turn.leaderId': 'r-7' }
  const second = await tool.handler({ academician: true, researcherCount: 1 }, { kernel: fakeKernel(chosen) })
  assert.equal(second.ok, true)
  assert.equal(chosen['vmu.turn.leaderId'], 'r-7', 'an existing leader is never overwritten')
  const chosenKeys = second.applied.map((a) => a && a.key).filter(Boolean)
  assert.equal(chosenKeys.includes('vmu.turn.leaderId'), false)
})

test('§7 the source keeps the three lessons as comments a reader can find', () => {
  const km = readFileSync(join(ROOT, 'vibe-math-vmu/kernel/math.js'), 'utf8')
  assert.equal(km.includes('★ ROUND 94'), true)
  // ★ ROUND 96: the sentence moved to math-computation.js#printedValueOf (ONE answer for both faces).
  assert.equal(km.includes('printedValueOf(raw.stdout)'), true)
  const mc = readFileSync(join(ROOT, 'vibe-math-vmu/math-computation.js'), 'utf8')
  assert.equal(mc.includes('would have been invented'), true)
  const pt = readFileSync(join(ROOT, 'vibe-math-vmu/packs/v5r/tools.js'), 'utf8')
  assert.equal(pt.includes('chair-seated-but-leaderId-empty'), true)
  const mt = readFileSync(join(ROOT, 'vibe-math-vmu/tools/meeting.js'), 'utf8')
  assert.equal(mt.includes('Name the boundary FIRST'), true)
  const eng = readFileSync(join(ROOT, 'vibe-math-vmu/math-engines.js'), 'utf8')
  assert.equal(eng.includes('exprPrint'), true)
})

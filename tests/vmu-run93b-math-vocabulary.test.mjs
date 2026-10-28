// ROUND 93 (real machine, run 93): two vocabularies on one seam.
//
// run 93 asked `vibe_vmu_mathtools { action: "run", op: "numeric", args: { expr: "2**10+1" } }` and got
// `MATH_INVALID_ARGUMENT: unknown argument: args` — the POLICY layer speaks {op, args, seed, backend,
// limits} while the engine surface speaks {op: run, mode, code|file|expr}. The face had never judged an
// op at all; the refusal named a key the caller never invented. This suite pins the translation (and its
// named refusal), the vocabulary reading, and the agenda verbs' primitive-only truth.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import * as math from '../vibe-math-vmu/kernel/math.js'

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
      // a version probe answers the marker, an execution answers the script: two different questions
      if (argv.includes('--version')) return { exit: 0, stdout: 'Python 3.12.10' + String.fromCharCode(10), stderr: '', ms: 3, timedOut: false }
      return { exit, stdout, stderr: '', ms: 3, timedOut: false }
    },
  }
}

test('§1 a plan request with an engine body is translated into the computation vocabulary', () => {
  const out = math.planToComputationRequest({ op: 'numeric', args: { expr: '2**10+1' }, seed: 7, backend: 'auto' })
  assert.equal(out.ok, true)
  assert.equal(out.args.op, 'run')
  assert.equal(out.args.mode, 'expr')
  assert.equal(out.args.expr, '2**10+1')
  assert.equal(out.translated.from, 'plan')
  assert.equal(out.translated.to, 'computation')
  assert.equal(out.translated.body, 'expr')
  assert.equal(out.translated.planOp, 'numeric')
  // engine/packages ride along; seed/backend are recorded as translation facts, not smuggled into argv
  const code = math.planToComputationRequest({ op: 'optim/minimize', args: { code: 'print(1)', engine: 'python', packages: ['numpy'] } })
  assert.equal(code.args.mode, 'code')
  assert.equal(code.args.engine, 'python')
  assert.deepEqual(code.args.packages, ['numpy'])
  const file = math.planToComputationRequest({ op: 'x', args: { file: 'Computation/x.py' } })
  assert.equal(file.args.mode, 'file')
  assert.equal(file.args.file, 'Computation/x.py')
})

test('§2 a plan request with NO engine body is refused by name, not silently nulled', () => {
  const out = math.planToComputationRequest({ op: 'numeric', args: { tolerance: 1e-9 } })
  assert.equal(out.ok, false)
  assert.equal(out.code, 'VMU_MATH_VOCABULARY')
  assert.match(out.reason, /op: numeric/)
  assert.match(out.reason, /code\/file\/expr/)
  assert.match(out.next.hint, /math_computation/)
  assert.match(out.next.hint, /PLANNING backend/)
  // an empty body is not a body either
  const empty = math.planToComputationRequest({ op: 'numeric', args: { expr: '   ' } })
  assert.equal(empty.ok, false)
  // no args at all
  assert.equal(math.planToComputationRequest({ op: 'numeric' }).ok, false)
})

test('§3 runPlan hands the translated request to the engine surface and returns its value', async () => {
  const host = fakeHost()
  const surface = math.createMathSurface({ host })
  const out = await surface.runPlan({ op: 'numeric', args: { expr: '2**10+1' } })
  assert.equal(out.ok, true)
  assert.equal(out.isRefutation, false)
  assert.equal(out.result.vocabulary, 'computation')
  assert.equal(out.result.planOp, 'numeric')
  assert.equal(out.result.value, '1025')
  assert.equal(out.result.mode, 'expr')
  assert.equal(host.spawns.length >= 1, true)
  // the first spawn is the version probe; the execution is the one whose argv carries the body
  const allArgv = JSON.stringify(host.spawns.map((s) => s.argv || s.args || []))
  assert.equal(allArgv.includes('2**10+1'), true, 'the expr reached the engine argv')
  assert.equal(host.spawns.some((s) => JSON.stringify(s.argv || []).includes('--version')), true, 'the engine was probed first')
})

test('§4 runPlan refuses a body-less plan by name (and never returns a null value)', async () => {
  const surface = math.createMathSurface({ host: fakeHost() })
  const out = await surface.runPlan({ op: 'numeric', args: { tolerance: 1e-9 } })
  assert.equal(out.ok, false)
  assert.equal(out.code, 'VMU_MATH_VOCABULARY')
  assert.equal(out.result, undefined)
  assert.match(out.hint, /math_computation/)
})

test('§5 the surface states which vocabulary the seam speaks', () => {
  const v = math.createMathSurface({ host: fakeHost() }).planVocabulary()
  assert.equal(v.seam, 'engine-execution')
  assert.deepEqual(v.seamOp, ['probe', 'run', 'receipt', 'install'])
  assert.deepEqual(v.seamBody, ['code', 'file', 'expr'])
  assert.match(v.translate, /kernel\/index\.js/)
})

test('§6 the kernel wires the translating entry, not the raw one', () => {
  const src = readFileSync(join(ROOT, 'vibe-math-vmu/kernel/index.js'), 'utf8')
  assert.equal(src.includes('mathSurface().runPlan(req)'), true)
  assert.equal(src.includes('mathSurface().run(req)'), false)
})

test('§7 agenda verbs are primitive-meeting verbs, and the teaching says so', () => {
  const teaching = readFileSync(join(ROOT, 'vibe-math-vmu/packs/v5r/prompts/v5r-blocks-b.js'), 'utf8')
  assert.equal(teaching.includes('这两个动词只认**内核原语会**'), true)
  assert.equal(teaching.includes('用 `vibe_v5_meeting` 开的**服务会**要用 `status`/`summary` 读议程'), true)
  // the refusal sentence must stay honest: agendaitems does NOT cross registries
  const face = readFileSync(join(ROOT, 'vibe-math-vmu/tools/meeting.js'), 'utf8')
  const m = face.match(/SERVICE_CROSSING_ACTIONS = Object\.freeze\(\[([^\]]*)\]\)/)
  assert.ok(m, 'the crossing set is still declared at module scope')
  assert.equal(m[1].includes("'agendaitems'"), false, 'agendaitems must not claim to cross registries')
  assert.equal(m[1].includes("'status'"), true)
})

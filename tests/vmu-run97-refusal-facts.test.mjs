#!/usr/bin/env node
// tests/vmu-run97-refusal-facts.test.mjs — ROUND 97: a refusal is a CONTRACT, so every fact the thrower attached
// reaches the caller; only the envelope's own keys and machinery are excluded.
//
// WHY (real machine, round 97): the boundary refusal on a service meeting came back as
//   {ok:false, code:"VMU_REGISTRY_BOUNDARY", message:"action \"agendaitems\" …", hint:"…", receiptMeta:{…}}
// — correct code, correct sentence, and NONE of `boundaryOnly`/`askedAction`/`actionCrosses`/`registry`, which
// docs/03 has promised since R84. The round-96 unit test passed because it supplied its own `refused` shim that
// copied `extra` wholesale; the PRODUCTION helper copied only `hostStack`/`shape`, and the host bridge copied only
// `enforced`/`enforcedScope`/`settingValues`. Two allow-lists, one contract, every new fact dropped at one of them.
//
// THE FIX IS INVERTED, NOT WIDENED: copy every own enumerable fact, exclude the envelope keys (`ok`/`code`/`message`/
// `hint`) and machinery (`name`/`stack`), drop values a receipt cannot carry, cap a long string. R52 dropped
// `enforced`, R95 dropped `cause`/`learnedSession`, R97 dropped four more — the same bug with three names.
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const load = (rel) => import(pathToFileURL(join(REPO, rel)).href)
let passed = 0
let failed = 0
const ok = async (name, fn) => {
  try { await fn(); passed += 1; console.log('ok   ' + name) }
  catch (e) { failed += 1; console.log('FAIL ' + name + ' :: ' + String(e && e.message).slice(0, 300)) }
}

const host = await load('vibe-math-vmu/host.js')
const { refusalFacts, REFUSAL_FACT_RESERVED, toHostSpec, TOOL_NAMES } = host

// ── §1 the helper: copy the facts, exclude the envelope, never crash ────────────────────────────────────────
await ok('every own enumerable fact the thrower set is copied', () => {
  const err = Object.assign(new Error('boom'), {
    code: 'VMU_REGISTRY_BOUNDARY',
    hint: 'h',
    boundaryOnly: true,
    askedAction: 'agendaitems',
    actionCrosses: false,
    registry: 'service',
    count: 0,
    list: ['a', 'b'],
    nested: { k: 1 },
    nothing: null,
  })
  assert.deepEqual(refusalFacts(err), {
    boundaryOnly: true,
    askedAction: 'agendaitems',
    actionCrosses: false,
    registry: 'service',
    count: 0,
    list: ['a', 'b'],
    nested: { k: 1 },
    nothing: null,
  })
})

await ok('the envelope keys and machinery are never copied', () => {
  for (const k of REFUSAL_FACT_RESERVED) assert.ok(REFUSAL_FACT_RESERVED.includes(k))
  assert.deepEqual(REFUSAL_FACT_RESERVED.slice().sort(), ['code', 'hint', 'message', 'name', 'ok', 'stack'].sort())
  const err = Object.assign(new Error('x'), { ok: false, code: 'C', message: 'M', hint: 'H' })
  assert.deepEqual(refusalFacts(err), {})
})

await ok('values a receipt cannot carry are dropped, not fatal', () => {
  const err = new Error('x')
  err.fn = () => 1
  err.sym = Symbol('s')
  err.undef = undefined
  err.inner = new Error('nested error')
  err.cycle = null
  err.cycle = { self: null }
  err.cycle.self = err.cycle // circular JSON
  assert.deepEqual(refusalFacts(err), {})
  assert.deepEqual(refusalFacts(null), {})
  assert.deepEqual(refusalFacts('plain string'), {})
})

await ok('a long string is capped and hostStack keeps its own smaller cap', () => {
  const out = refusalFacts({ text: 'a'.repeat(9000), hostStack: 'b'.repeat(9000) })
  assert.equal(out.text.length, 4000)
  assert.equal(out.hostStack.length, 2000)
})

// ── §2 the PRODUCTION face path (not a test shim): the receipt carries the four boundary facts ──────────────
const { makeMeetingSpec, primitiveMissError } = await load('vibe-math-vmu/tools/meeting.js')
const faceKernel = {
  liveMeeting: () => null,
  liveBallot: () => null,
  meetings: { status: () => ({ liveMeetings: ['m1'] }) },
}
// NOTE (round 99): this used to look the face up through toolSpecs(); the face is built directly below, so the
// registry-shaped lookup was a second way of asserting the same thing and it broke when toolSpecs' arity changed.
const refusedOf = (code, message, hint, extra = null) => Object.assign(
  { ok: false, code, message, hint: hint || null }, extra && typeof extra === 'object' ? refusalFacts(extra) : {})

await ok('the face builder (refused → refusalFacts) keeps the four facts a program reads', async () => {
  const built = makeMeetingSpec({
    param: () => ({}),
    refused: refusedOf,
    TOOL_NAMES: { meeting: 'vibe_vmu_meeting' },
    kernel: faceKernel,
  })
  const out = await built.run({ action: 'agendaitems', id: 'm1' })
  assert.equal(out.ok, false)
  assert.equal(out.code, 'VMU_REGISTRY_BOUNDARY')
  assert.equal(out.boundaryOnly, true)
  assert.equal(out.askedAction, 'agendaitems')
  assert.equal(out.actionCrosses, false)
  assert.equal(out.registry, 'service')
  assert.ok(String(out.message).indexOf('this action') < 0, 'the placeholder must never reach a member')
})

// ── §3 the HOST bridge path: a thrown refusal keeps its facts and loses its stack ──────────────────────────
await ok('toHostSpec forwards a thrown refusal\'s facts through the one serializer', async () => {
  const thrown = Object.assign(new Error('the guard said no'), {
    code: 'VMU_NOT_PERMITTED',
    hint: 'ask the chair',
    enforced: ['vmu.meetings.closeRequiresChair'],
    boundaryOnly: true,
    askedAction: 'close',
    actionCrosses: false,
    registry: 'service',
  })
  const spec = toHostSpec({ name: 'probe_tool', description: 'd', parameters: {}, run: async () => { throw thrown } })
  const out = JSON.parse(await spec.execute({}, {}))
  assert.equal(out.ok, false)
  assert.equal(out.code, 'VMU_NOT_PERMITTED')
  assert.equal(out.hint, 'ask the chair')
  assert.deepEqual(out.enforced, ['vmu.meetings.closeRequiresChair'])
  assert.equal(out.boundaryOnly, true)
  assert.equal(out.askedAction, 'close')
  assert.equal(out.actionCrosses, false)
  assert.equal(out.registry, 'service')
  assert.equal(out.name, undefined, 'an Error\'s name is machinery, not a fact')
  assert.equal(out.stack, undefined, 'a stack trace is not a receipt')
  assert.ok(out.receiptMeta && out.receiptMeta.truncated === false, 'a refusal is a receipt of the same species')
})

await ok('the bridge cannot be tricked into rewriting the envelope', async () => {
  const thrown = Object.assign(new Error('real message'), { ok: true, code: 'REAL', message: 'real', hint: 'real' })
  const spec = toHostSpec({ name: 'probe_tool', description: 'd', parameters: {}, run: async () => { throw thrown } })
  const out = JSON.parse(await spec.execute({}, {}))
  assert.equal(out.ok, false)
  assert.equal(out.code, 'REAL')
  assert.equal(out.message, 'real')
})

// ── §4 the source contract: one copy rule, two call sites, no second allow-list ───────────────────────────
await ok('host.js routes BOTH refusal builders through refusalFacts (no per-fact allow-list survives)', () => {
  const src = readFileSync(join(REPO, 'vibe-math-vmu/host.js'), 'utf8')
  assert.ok(src.indexOf('export function refusalFacts(e)') >= 0)
  assert.ok(src.indexOf("extra && typeof extra === 'object' ? refusalFacts(extra) : {}") >= 0,
    'the face-level refused() must use the copying rule')
  assert.ok(src.indexOf('}, refusalAttribution(e), refusalFacts(e)))') >= 0,
    'the host bridge must use the copying rule')
  assert.ok(src.indexOf("extra.hostStack ? { hostStack: String(extra.hostStack).slice(0, 2000) } : {}") < 0,
    'the old two-field allow-list must be gone')
})

await ok('docs/03 records the contract (all attached facts reach the caller)', () => {
  const doc = readFileSync(join(REPO, 'vibe-math-vmu/docs/03-interface-contract.md'), 'utf8')
  assert.ok(doc.indexOf('拒绝回执的附加事实') >= 0, 'docs/03 must name the refusal-fact contract')
})

console.log('RUN97 REFUSAL FACTS: ' + passed + ' passed, ' + failed + ' failed')
if (failed) process.exit(1)

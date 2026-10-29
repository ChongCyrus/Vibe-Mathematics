#!/usr/bin/env node
/**
 * RUN 124, E9 — 院士邀请入会成员：`members` 必须是这一面的词，且收窄要能读回。
 *
 * WHAT RUN 124 MEASURED. The convene face refused `members` by name ("pack tool vibe_v5_meeting does not accept
 * parameter(s) \"members\"") while the handler had been forwarding an explicit subset to
 * `kernel.meetings.open({ members })` since the wave-2 pass. The rule ("院士邀请入会成员") therefore had exactly one
 * reachable door — the PRIMITIVE face — and the SERVICE face that the teaching names refused the rule's own word.
 * Two claims are checked here, both against a real kernel and the real pack:
 *
 *   ① the declaration lists `members` (so a dispatcher cannot refuse it before the handler runs), and
 *   ② a convene WITH `members` reads back `rosterNarrowed:true` + the narrowed `roster`, while a convene WITHOUT it
 *      reads back `rosterNarrowed:false` over the live roster — the flag must mean something, not be always-true.
 */
import { mkdirSync, rmSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import os from 'node:os'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PKG_ROOT = path.resolve(HERE, '..')
const ENTRY = pathToFileURL(path.join(PKG_ROOT, 'vibe-math-vmu', 'vibe-math-vmu.js')).href

let passed = 0
const failures = []
const ok = (cond, msg) => { if (cond) { passed++; console.log('  ok   ' + msg) } else { failures.push(msg); console.log('  FAIL ' + msg) } }
// ★ RULE E (shape B): a comparison of two values that may BOTH be empty proves nothing (two emptied readings compare
// equal). Every comparison here goes through a rendered form that is asserted non-empty FIRST, so "nothing" can never
// masquerade as "the same thing".
const eq = (a, b, msg) => {
  const A = JSON.stringify(a)
  const B = JSON.stringify(b)
  ok(typeof A === 'string' && A.length > 0 && A === B, msg + ' - ' + A + ' vs ' + B)
}

async function boot(root) {
  const entry = await import(ENTRY)
  const specs = []
  const ctx = {
    effect: (fn) => fn(),
    on: () => () => {},
    get: () => undefined,
    tools: { register: async (spec) => { specs.push(spec); return () => {} } }
  }
  // apply() 返回 handle（{ kernel, ready() }）——不是 promise，也不在 default 上（模块只有具名导出 apply）。
  const handle = entry.apply(ctx, { clock: () => NOW += 1000, packs: ['v5r'], root })
  await handle.ready()
  const byName = new Map(specs.map((t) => [t.name, t]))
  const call = async (name, args) => {
    const spec = byName.get(name)
    if (!spec) throw new Error('tool not registered: ' + name)
    let raw
    try { raw = await spec.execute(args || {}, { kernel: handle.kernel }) } catch (e) {
      return { ok: false, code: e && e.code ? e.code : 'THROWN', message: String(e && e.message ? e.message : e), hint: e && e.hint }
    }
    const text = raw && typeof raw === 'object' && typeof raw.content === 'string' ? raw.content : raw
    if (typeof text === 'string') { try { return JSON.parse(text) } catch { return { raw: text } } }
    return text || {}
  }
  return { call, tools: specs, kernel: handle.kernel }
}

let NOW = 1000

async function main() {
  const root = path.join(os.tmpdir(), 'vmu-run124-narrow-' + process.pid + '-' + Date.now())
  mkdirSync(path.join(root, 'VibeMath'), { recursive: true })
  try {
    const b = await boot(root)
    const started = await b.call('vibe_v5_start', { problem: '第 124 轮：窄名单', researcherCount: 2, academician: true })
    ok(started.json ? started.json.ok !== false : started.ok !== false, '① start succeeds')

    // the declaration itself: the dispatcher derives its key set from this exact object
    const conveneSpec = b.tools.filter((t) => t.name === 'vibe_v5_meeting')[0]
    ok(!!conveneSpec, '② the convene face is registered')
    const declaredKeys = Object.keys((conveneSpec.parameters && conveneSpec.parameters.properties) || conveneSpec.parameters || {})
    ok(declaredKeys.includes('members'), '③ the DECLARATION names `members` (the handler already read it; the dispatcher refused it)')

    // ★ the roster is a KERNEL fact, not a field of the start receipt: `vibe_v5_start` reports `hired:[…]` ids and the
    // seats live on `kernel.members.roster()`. Reading the receipt here would have tested the receipt, not the bench.
    const benchRows = b.kernel.members.roster()
    const chairRow = benchRows.filter((m) => m.slot === 'chair')[0] || null
    const chairId = chairRow && chairRow.id ? String(chairRow.id) : 'r-acad'
    const members = benchRows.filter((m) => m.slot === 'member').map((m) => String(m.id))
    ok(members.length === 2, '④ the boot seated two resident researchers - ' + JSON.stringify(members))

    // ⑤ a narrowed convene: the chair asks for exactly ONE resident (the other stays on the bench)
    const narrowed = await b.call('vibe_v5_meeting', {
      agenda: '窄名单会', title: '窄名单', type: 'academic', member: chairId, members: [members[0]]
    })
    ok(narrowed.ok === true, '⑤ convene with `members` is accepted (run 124 refused the parameter by name) - ' + (narrowed.code || ''))
    eq(narrowed.rosterNarrowed, true, '⑥ the receipt says the roster is NARROWER than the live roster')
    ok(Array.isArray(narrowed.roster) && narrowed.roster.includes(members[0]), '⑦ the narrowed roster names the invited member')
    ok(Array.isArray(narrowed.roster) && !narrowed.roster.includes(members[1]), '⑨ the UN-INVITED resident is not on the roster')
    ok(typeof narrowed.rosterMeans === 'string' && narrowed.rosterMeans.length > 20, '⑩ the receipt explains what the roster bounds')

    // ★ `roster` is the INVITE list, not the chair list: the chair convenes and is PRESENT by construction, and a
    // narrowed roster that does not name it must not read as "the chair was not invited". The two facts are separate,
    // and `present` is where the second one is readable (run 124: the write receipt carries the roster, the view
    // carries who is actually on the floor).
    const view = await b.call('vibe_vmu_meeting', { action: 'status', id: narrowed.meeting })
    const v = view.meeting && view.meeting.id ? view.meeting : view
    ok(Array.isArray(v.present) && v.present.includes(chairId), '⑧ the chair is PRESENT by construction (the roster is the invite list, not the chair list)')
    eq(v.rosterNarrowed, true, '⑪ status reads the same narrowing back')

    // ⑫ the control: a convene WITHOUT `members` is not narrowed — the flag must not be always-true
    const full = await b.call('vibe_v5_meeting', { agenda: '全员会', title: '全员', type: 'academic', member: chairId })
    ok(full.ok === true, '⑫ convene without `members` still works')
    eq(full.rosterNarrowed, false, '⑬ an un-narrowed convene reports rosterNarrowed:false')
    ok(Array.isArray(full.roster) && full.roster.includes(members[1]), '⑭ the un-narrowed roster carries the other resident too')
  } finally {
    try { rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 }) } catch {}
  }
  console.log('')
  console.log('=== RUN 124 E9 NARROW ROster: passed=' + passed + ' failed=' + failures.length + ' ===')
  if (failures.length) { for (const f of failures) console.log('  !! ' + f); process.exitCode = 1 }
}
main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exitCode = 1 })

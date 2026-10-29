// tests/vmu-run131-cross-face-pointers.test.mjs — D6: THE TWO READ FACES FOR "what is this member doing" MUST NAME
// EACH OTHER.
//
// MEASURED IN RUN 131 (build 6bf4a946): reading a member's state through `vibe_v5_read_library {member, kind:"state"}`
// returned cards whose `hint` was null, and reading the same member's panel through `vibe_vmu_panel {action:"get"}`
// returned the four fields with no sentence pointing back. Both answers were TRUE; neither was COMPLETE, and the only
// face the prompts teach is the library one. The rule 「可查看其他成员当前状态版」 is answered by the PANEL (it is the
// live view), while the records `state` track holds what was written into the ledger — so each receipt now carries a
// pointer to the other call.
//
// Pins: both pointers exist, both name an executable call with the member id, the library pointer says whether the
// panel is known in THIS kernel, and a whole-institute read (no member) honestly carries no single-owner pointer.
//
// Run: node tests/vmu-run131-cross-face-pointers.test.mjs
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PKG_ROOT = path.resolve(HERE, '..')
const ENTRY = pathToFileURL(path.join(PKG_ROOT, 'vibe-math-vmu', 'vibe-math-vmu.js')).href

let passed = 0
const failures = []
const ok = (cond, msg) => { if (cond) { passed++; console.log('  ok   ' + msg) } else { failures.push(msg); console.log('  FAIL ' + msg) } }

let NOW = 1_000
async function boot(root) {
  const entry = await import(ENTRY)
  const specs = []
  const ctx = { effect: (fn) => fn(), on: () => () => {}, get: () => undefined, tools: { register: async (s) => { specs.push(s); return () => {} } } }
  const handle = entry.apply(ctx, { clock: () => (NOW += 1_000), packs: ['v5r'], root })
  await handle.ready()
  const byName = new Map(specs.map((t) => [t.name, t]))
  const call = async (name, args, exec) => {
    const spec = byName.get(name)
    if (!spec) throw new Error('tool not registered: ' + name)
    let raw
    try { raw = await spec.execute(args || {}, exec === undefined ? { kernel: handle.kernel } : exec) } catch (e) {
      return { ok: false, code: (e && e.code) || 'THROWN', message: String((e && e.message) || e), hint: e && e.hint }
    }
    const text = raw && typeof raw === 'object' && typeof raw.content === 'string' ? raw.content : raw
    if (typeof text === 'string') { try { return JSON.parse(text) } catch { return { raw: text } } }
    return text || {}
  }
  return { call, kernel: handle.kernel }
}

console.log('=== 1. THE LIBRARY READ POINTS AT THE PANEL ===')
const root = mkdtempSync(path.join(tmpdir(), 'vmu-131-'))
try {
  const { call, kernel } = await boot(root)
  const start = await call('vibe_v5_start', { problem: '两扇读面互指', researcherCount: 2, academician: true })
  ok(start.ok === true, 'the institute started - ' + JSON.stringify(start.ok))
  const roster = kernel.members.roster()
  const chair = roster.find((m) => m.slot === 'chair')
  const member = roster.find((m) => m.slot === 'member')
  ok(chair && member && chair.id !== member.id, 'two different seats exist - ' + (chair && chair.id) + ' / ' + (member && member.id))

  // The member keeps a panel (written by the office on their behalf - the write door is D7's business, not this suite).
  const set = await call('vibe_vmu_panel', { action: 'set', member: member.id, overall: '把两扇读面读出同一个人', status: '进行中' })
  ok(set.ok === true, 'the member panel was written - ' + JSON.stringify(set.ok === true ? set.member : set))

  const libRead = await call('vibe_v5_read_library', { member: member.id, kind: 'state' })
  ok(libRead.ok === true, 'the state track read answered')
  ok(libRead.panelPointer !== null && typeof libRead.panelPointer === 'object', 'the library receipt carries a panel pointer')
  ok(String(libRead.panelPointer.call).includes('vibe_vmu_panel'), 'the pointer names the panel TOOL - ' + String(libRead.panelPointer.call))
  ok(String(libRead.panelPointer.call).includes(member.id), 'the pointer names THIS member id')
  ok(libRead.panelPointer.known === true, 'the pointer says the panel IS known in this kernel')
  ok(typeof libRead.panelPointerMeans === 'string' && libRead.panelPointerMeans.length > 40,
    'the pointer explains the difference between the two faces (length ' + String((libRead.panelPointerMeans || '').length) + ')')
  ok(/不是同一份账/.test(libRead.panelPointerMeans), 'the explanation says they are not the same ledger')

  console.log('=== 2. THE PANEL GET POINTS BACK AT THE LIBRARY ===')
  const got = await call('vibe_vmu_panel', { action: 'get', member: member.id })
  ok(got.ok === true && got.known === true, 'the panel read answered with the live view')
  ok(got.overall === '把两扇读面读出同一个人', 'the live view carries what was written')
  ok(got.libraryPointer !== null && typeof got.libraryPointer === 'object', 'the panel receipt carries a library pointer')
  ok(String(got.libraryPointer.call).includes('vibe_v5_read_library'), 'the pointer names the library tool - ' + String(got.libraryPointer.call))
  ok(String(got.libraryPointer.call).includes('kind:"state"'), 'the pointer narrows the call to the state track')
  ok(String(got.libraryPointer.call).includes(member.id), 'the pointer names THIS member id')
  ok(typeof got.libraryPointerMeans === 'string' && /不是同一份账/.test(got.libraryPointerMeans), 'the mirror explanation is present')

  console.log('=== 3. A WHOLE-INSTITUTE READ HAS NO SINGLE OWNER TO POINT AT ===')
  const all = await call('vibe_v5_read_library', { kind: 'state' })
  ok(all.ok === true, 'the unspecific read answered')
  ok(all.panelPointer === null, 'no member named => no panel pointer (null, not a made-up id)')
  ok(typeof all.panelPointerMeans === 'string' && all.panelPointerMeans.length > 40, 'the absence is still explained')

  console.log('=== 4. AN UNWRITTEN PANEL IS REPORTED AS NOT-KNOWN, NOT AS "no state" ===')
  const ghost = await call('vibe_v5_read_library', { member: chair.id, kind: 'state' })
  ok(ghost.ok === true, 'the chair state read answered')
  ok(ghost.panelPointer !== null && ghost.panelPointer.known === false, 'the pointer says this kernel has no panel for that seat')
  ok(/不是「该成员没有状态」/.test(ghost.panelPointerMeans), 'the meaning warns against reading known:false as "no state"')
} finally {
  try { rmSync(root, { recursive: true, force: true, maxRetries: 3 }) } catch { /* windows lock */ }
}

console.log('')
console.log(passed + ' passed, ' + failures.length + ' failed')
if (failures.length > 0) { for (const f of failures) console.log(' - ' + f); process.exitCode = 1 }

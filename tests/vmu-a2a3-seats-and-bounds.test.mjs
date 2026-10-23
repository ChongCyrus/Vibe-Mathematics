// tests/vmu-a2a3-seats-and-bounds.test.mjs — A2/A3 re-scan (round 17, vmu-verify): the two claims in
// docs/acceptance/conformance/lane-d10-members.md rows A2/A3 were ✅ implemented but NOT tested in both
// directions. A one-way gate is the vacuous kind: a check that only shows the legal call works cannot tell
// "the rule bites" from "the rule was deleted". So every claim below is asserted BOTH ways on the REAL entry:
//
//   A2 (§A2) 主席席：`vibe_v5_overview` 只给 chair —— chair ⇒ ok；非 chair 成员 ⇒ 具名拒 VMU_NOT_PERMITTED 且 hint
//             指出座位；未知成员 ⇒ 具名拒（绝不静默降级）。
//   A3 (§A3) 常驻研究员：`vibe_v5_start` 的 `researcherCount` 默认 3、域 0..50 —— 省略 ⇒ 3；0 ⇒ 合法（只有主席）；
//             51 / -1 ⇒ 具名拒 VMU_INVALID_ARGUMENT（不是截断，也不是静默 3）。
//
// The line refs that used to be cited for these rows had DRIFTED (cited `packs/v5r/tools.js:188-190` for the
// chair refusal — that is now the report return object; cited `:749-766` for `vibe_v5_start` — that is now a
// Lean comment block). This suite anchors the claims by CALL, not by line, so the next shift cannot make it lie.
// Run: node tests/vmu-a2a3-seats-and-bounds.test.mjs
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + label); return true }
  failed += 1
  failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const entry = await import(pathToFileURL(ENTRY).href)
const boot = async (config = {}) => {
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, Object.assign({ clock: () => 1000 }, config))
  await handle.ready()
  return { handle, specOf: (n) => state.specs.find((s) => s.name === n) }
}
const call = async (b, name, args = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { parsed: undefined, missing: true }
  const raw = await spec.execute(args, {})
  let parsed
  try { parsed = JSON.parse(raw) } catch { parsed = undefined }
  return { raw, parsed, missing: false }
}
const rosterIds = (kernel) => kernel.members.roster().map((m) => String(m.id))

const root = await mkdtemp(join('D:/_tmp', 'vmu-a2a3-'))
try {
  const b = await boot({ root, packs: ['v5r'] })

  console.log('=== A3 · `vibe_v5_start` researcherCount：默认 3 / 0 合法 / 越界具名拒 ===')
  {
    const r = await call(b, 'vibe_v5_start', {})
    ok(r.parsed && r.parsed.ok === true, '省略 researcherCount ⇒ 启动成功', r.parsed)
    const kernel = b.handle.kernel
    // the chair is seated separately; the rest are the researchers
    const researchers = rosterIds(kernel).filter((id) => id !== 'r-acad')
    ok(researchers.length === 3, '★ 默认值真的是 3（不是 0、不是 2）', rosterIds(kernel))
  }
  {
    const b0 = await boot({ root: await mkdtemp(join('D:/_tmp', 'vmu-a2a3-z-')), packs: ['v5r'] })
    const r = await call(b0, 'vibe_v5_start', { researcherCount: 0 })
    ok(r.parsed && r.parsed.ok === true, 'researcherCount=0 是合法域内值（只有主席）', r.parsed)
    const researchers = rosterIds(b0.handle.kernel).filter((id) => id !== 'r-acad')
    ok(researchers.length === 0, '★ 0 真的坐 0 个研究员（域下界不是摆设）', rosterIds(b0.handle.kernel))
  }
  for (const bad of [51, -1]) {
    const b1 = await boot({ root: await mkdtemp(join('D:/_tmp', 'vmu-a2a3-b-')), packs: ['v5r'] })
    const r = await call(b1, 'vibe_v5_start', { researcherCount: bad })
    ok(r.parsed && r.parsed.ok === false && r.parsed.code === 'VMU_INVALID_ARGUMENT',
      '★ researcherCount=' + bad + ' ⇒ 具名拒 VMU_INVALID_ARGUMENT（不截断、不静默取默认）', r.parsed)
    ok(r.parsed && typeof r.parsed.hint === 'string' && r.parsed.hint.length > 0,
      '★ 拒绝带 hint（域是 0..50，调用者能改对）', r.parsed && r.parsed.hint)
    const ids = rosterIds(b1.handle.kernel)
    ok(ids.length === 0, '★ 被拒的启动没有坐任何人（零副作用）', ids)
  }

  console.log('=== A2 · `vibe_v5_overview` 只给 chair 席位 ===')
  {
    const chair = await call(b, 'vibe_v5_overview', { member: 'r-acad' })
    ok(chair.parsed && chair.parsed.ok === true, '★ chair 席位 ⇒ ok（正路）', chair.parsed && chair.parsed.tool)
    const member = await call(b, 'vibe_v5_overview', { member: 'r-1' })
    ok(member.parsed && member.parsed.ok === false && member.parsed.code === 'VMU_NOT_PERMITTED',
      '★ 非 chair 成员 ⇒ 具名拒 VMU_NOT_PERMITTED', member.parsed)
    ok(member.parsed && /chair/.test(String(member.parsed.message)) && typeof member.parsed.hint === 'string',
      '★ 拒绝点名 chair 座位并给出路（不是裸异常）', member.parsed && member.parsed.message)
    const unknown = await call(b, 'vibe_v5_overview', { member: 'r-nobody' })
    ok(unknown.parsed && unknown.parsed.ok === false && typeof unknown.parsed.code === 'string',
      '★ 未知成员 ⇒ 具名拒（绝不静默当成 chair）', unknown.parsed)
    // the roster view must still be reachable to everyone else THROUGH THE STATUS FACE (the refusal hint says so)
    const status = b.handle.kernel.status()
    ok(status && Array.isArray(status.packTools) && status.packTools.length > 0,
      '★ 拒绝的 hint 所说的替代读点（status 面）确实存在', status && status.packTools.length)
  }

  console.log('=== RULE E: 双向断言里没有靠空集合成立的检查 ===')
  {
    const codes = ['VMU_NOT_PERMITTED', 'VMU_INVALID_ARGUMENT']
    ok(codes.length > 0, 'the checked code list is non-empty (RULE E)', codes)
    const seen = new Set()
    const member = await call(b, 'vibe_v5_overview', { member: 'r-1' })
    if (member.parsed && member.parsed.code) seen.add(member.parsed.code)
    const bad = await call(b, 'vibe_v5_start', { researcherCount: 51 })
    if (bad.parsed && bad.parsed.code) seen.add(bad.parsed.code)
    ok(codes.length === 2 && codes.every((c) => seen.has(c)), 'both named codes were really observed (not asserted on an empty set)', [...seen])
  }
} finally {
  await rm(root, { recursive: true, force: true })
}

console.log('')
console.log('=== A2/A3 SEATS AND BOUNDS: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.error('  - ' + f)
process.exit(failed === 0 ? 0 : 1)

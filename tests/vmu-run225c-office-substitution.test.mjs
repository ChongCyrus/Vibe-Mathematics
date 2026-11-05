// tests/vmu-run225c-office-substitution.test.mjs — RUN 225-C: WHO ACTED?
//
// The office (a root session, which is not a seat) can call any pack tool while NAMING a member
// (`member:"r-1"`). Until RUN 225-C nothing in the receipt said which of two things happened:
//   · the seat acted in its own turn, or
//   · the office wrote the record IN THAT SEAT'S NAME.
// The prompts describe that difference; this suite proves a receipt finally records it, from the CALL
// (who is running) and the QUESTION (which seat the args name) — never from what the tool intended.
//
// Run: node tests/vmu-run225c-office-substitution.test.mjs

import { mkdirSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const REPO = 'D:/wd/vibemath开发/Vibe-Mathematics'
const VMU = join(REPO, 'vibe-math-vmu')
const TMP = 'D:/_tmp/run225'

const SRC_PACK_TOOLS = (await import('node:fs')).readFileSync(join(VMU, 'host-pack-tools.js'), 'utf8')

let passed = 0
let failed = 0
const failures = []
function ok(cond, name, detail) {
  if (cond) {
    passed += 1
    console.log('  ok   ' + name)
  } else {
    failed += 1
    failures.push(name)
    console.log('  FAIL ' + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail)))
  }
}
function has(text, needle, name) {
  ok(typeof text === 'string' && text.indexOf(needle) !== -1, name, { needle })
}

mkdirSync(TMP, { recursive: true })
const root = mkdtempSync(join(TMP, 'k-sub-'))
const specs = []
const ctx = {
  effect: (fn) => fn(),
  on: () => () => {},
  tools: { register: async (spec) => { specs.push(spec); return () => {} } },
}
const entry = await import(pathToFileURL(join(VMU, 'vibe-math-vmu.js')).href)
const handle = entry.apply(ctx, { clock: () => 1000, packs: ['v5r'], root })
await handle.ready()
await handle.kernel.store.open()

const specOf = (name) => specs.filter((s) => s && s.name === name)[0] || null
const call = async (name, args = {}, exec = { kernel: handle.kernel }) => {
  const spec = specOf(name)
  if (!spec) return { ok: false, code: 'NO_SUCH_TOOL', name }
  let raw
  try {
    raw = await spec.execute(args, exec)
  } catch (e) {
    return { ok: false, code: (e && e.code) || null, message: String((e && e.message) || e) }
  }
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) } catch (e) { return { ok: false, code: 'NON_JSON', raw } }
  }
  return raw
}

// ── §0 the disclosure exists in the ONE dispatch point every pack tool goes through ──────────────────────────────
{
  console.log('\n=== §0 the dispatch point states who acted ===')
  has(SRC_PACK_TOOLS, 'memberActed: actedBySeat', 'the dispatcher computes memberActed from the call')
  has(SRC_PACK_TOOLS, 'actedForMember: namedMember', 'the dispatcher names the seat the call was for')
  has(SRC_PACK_TOOLS, 'callerMemberNow', 'the dispatcher resolves the caller once and reuses it')
  has(SRC_PACK_TOOLS, 'orchestrating on a seat', 'the means sentence distinguishes orchestrating from acting')
}

// ── §1 the office names a member: the seat did NOT act in its own turn ───────────────────────────────────────────
let office = null
{
  console.log('\n=== §1 the office writes in a seat\'s name (memberActed:false) ===')
  const started = await call('vibe_v5_start', { problem: '前 n 个奇数之和 = n²。', researcherCount: 2 })
  ok(started && started.ok === true, 'the institute starts (r-acad / r-1 / r-2 exist)', started)

  office = await call('vibe_v5_record_proposition', { statement: '前 n 个奇数之和 = n²', value: 0.5, p: 0.5, motive: '归纳可见但未证（p 是倾向不是结论）', member: 'r-1' })
  ok(office && office.ok === true, 'the office CAN call the face naming a seat', office)
  ok(office && office.memberActed === false, 'the receipt states the seat did not act in its own turn', office && office.memberActed)
  ok(office && office.actedForMember === 'r-1', 'the receipt names which seat the call was for', office && office.actedForMember)
  ok(office && office.callerMember === null, 'the receipt says the caller is not a seat (null, not a guess)', office && office.callerMember)
  ok(typeof (office && office.memberActedMeans) === 'string' && office.memberActedMeans.indexOf('OFFICE') !== -1,
    'the means sentence says the call came from the office', office && office.memberActedMeans)
  ok(typeof (office && office.memberActedMeans) === 'string' && office.memberActedMeans.indexOf('memberActed:false') !== -1,
    'the means sentence points at the field a reader must read', office && office.memberActedMeans)
}

// ── §2 the seat calls as itself: memberActed:true ────────────────────────────────────────────────────────────────
{
  console.log('\n=== §2 the seat acts in its own turn (memberActed:true) ===')
  const own = await call('vibe_v5_record_proposition', { statement: '前 n 个偶数之和 = n(n+1)', value: 0.5, p: 0.5, motive: '同一归纳，待证', member: 'r-1' },
    { kernel: handle.kernel, agent: { id: 'r-1' } })
  ok(own && own.ok === true, 'the seat can call the face as itself', own)
  ok(own && own.memberActed === true, 'the receipt states the seat acted in its own turn', own && own.memberActed)
  ok(own && own.callerMember === 'r-1', 'the receipt names the caller seat', own && own.callerMember)
  ok(typeof (own && own.memberActedMeans) === 'string' && own.memberActedMeans.indexOf('own turn') !== -1,
    'the means sentence says it is the seat\'s own act', own && own.memberActedMeans)
}

// ── §3 a name that is not a seat is NOT dressed up as a substitution ───────────────────────────────────────────
{
  console.log('\n=== §3 a name that is not on the roster answers `memberActed:null` (refused, and honest about it) ===')
  const ghost = await call('vibe_v5_record_proposition', { statement: '某命题', value: 1, motive: '不该成立', member: 'r-999' })
  ok(ghost && ghost.ok === false, 'a name outside the roster is refused (or reported), not silently accepted', ghost)
  // ★ RUN 236 / M2 修 pin：旧断言是 `memberActed === undefined`（「不存在的人一律不发三件套」）。
  // 那个世界下的沉默是**有歧义**的：读回执的人分不清「没人被点名」和「这个座位没动」。现在的约定：
  // 只要这一次**点了名**，拒绝回执就必须回答「谁试过」——名字不在名册时答案 `memberActed:null`
  // （「这个名字不指向一个座位」，不是「那个座位没做」），`actedForMember` 原样保留被点的名字。
  ok(ghost && ghost.memberActed === null,
    '★ a ghost name now answers `memberActed:null` — refused, and never readable as "the seat did/did not act"', ghost && ghost.memberActed)
  ok(ghost && ghost.actedForMember === 'r-999',
    '★ the name that was tried is kept verbatim (an audit needs the name, even when it is not a seat)', ghost && ghost.actedForMember)
  ok(ghost && typeof ghost.memberActedMeans === 'string' && ghost.memberActedMeans.indexOf('not a seat on the roster') !== -1,
    '★ and the sentence says why the answer is null instead of false', ghost && ghost.memberActedMeans)
}

// ── §4 the `read` receipt carries the md/index comparison (`state` did; `read` used to drop it) ───────────────────
{
  console.log('\n=== §4 blueprint read forwards the md fields state prints ===')
  const proposed = await call('vibe_v5_blueprint', { action: 'propose', path: 'Shared/Protocol.md', member: 'r-acad', text: '# 公共蓝图\n- 命题：前 n 个奇数之和 = n²。\n- 步骤：归纳。' })
  ok(proposed && proposed.ok === true, 'the blueprint accepts a proposal', proposed)
  const id = proposed && typeof proposed.id === 'string' ? proposed.id : ''
  ok(id !== '', 'the proposal names the row it created', proposed && Object.keys(proposed))
  const read = await call('vibe_v5_blueprint', { action: 'read', id, path: 'Shared/Protocol.md' })
  ok(read && read.ok === true, 'read answers for that row', read)
  ok(read && typeof read.md === 'object' && read.md !== null, 'read carries the md block (it used to drop it)', read && Object.keys(read))
  ok(read && typeof read.mdFingerprint === 'string' && read.mdFingerprint.indexOf('sha256:') === 0, 'read carries the file fingerprint', read && read.mdFingerprint)
  ok(read && read.mdChangedSinceIndex === false, 'a freshly written md is not reported as changed on disk', read && read.mdChangedSinceIndex)
  ok(read && typeof read.mdMeans === 'string' && read.mdMeans.length > 0, 'read carries the md means', read && read.mdMeans)
}

console.log('\n=== RUN 225-C office substitution: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) {
  console.log('failures: ' + JSON.stringify(failures))
  process.exitCode = 1
}

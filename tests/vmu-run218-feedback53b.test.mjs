/**
 * tests/vmu-run218-feedback53b.test.mjs — RUN 218：run 54（FEEDBACK53）量到的「共享的东西被当成私有的」与「第一个词说错了地方」。
 *
 * THE THREE DEFECTS THIS SUITE PINS (all MEASURED in run 54, task-sim54.txt):
 *   ① `vibe-math-vmu/packs/v5r/blueprint.js` — the office filed a DIAGNOSTIC propose ("just to test the face", never
 *      adopted) and it silently joined the draft two members were writing. The receipt named id/revision and nothing said
 *      the row is INSTITUTE-WIDE: every member kernel over this workspace reads it, and it stays until the draft is
 *      adopted or pruned. `draftSharing{scope, revision, appendedTo, authors, means}` now says so on BOTH returns.
 *   ② `vibe-math-vmu/packs/v5r/tools.js` — the blueprint description said "the existing draft" without saying WHICH one
 *      (the row this call continues, named by `continuedBase.actual`; null when the previous draft was already adopted).
 *      The description now defines it and adds that a draft is not private.
 *   ③ `vibe-math-vmu/packs/v5r/tools.js` — `vibe_v5_start`'s applied block printed `applied:"immediate"` first and
 *      `partial:true` three fields later; the word a reader quotes travels without its scope. The value itself now
 *      carries it (`immediate (THIS PROCESS ONLY)`) and `appliedScope` names the scope as a field.
 *   ④ `vibe-math-vmu/packs/v5r/prompts/v5r-core.js` — the record-book contract ("your own record book is a DRAFT, private
 *      to your kernel") has one exception and never said so: the blueprint draft is shared. A member (and the office)
 *      could read the contract as "nothing I write is visible to others", which is false on the blueprint face.
 *
 * RULE E: every fixture assertion is preceded by an explicit non-empty check; refusals are normalised from BOTH shapes.
 *
 * Run: node tests/vmu-run218-feedback53b.test.mjs
 */
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const REPO = 'D:/wd/vibemath开发/Vibe-Mathematics'
const VMU = join(REPO, 'vibe-math-vmu')
const TMP = 'D:/_tmp/r218'
mkdirSync(TMP, { recursive: true })

const SRC_BLUEPRINT = readFileSync(join(VMU, 'packs', 'v5r', 'blueprint.js'), 'utf8')
const SRC_TOOLS = readFileSync(join(VMU, 'packs', 'v5r', 'tools.js'), 'utf8')
const SRC_CORE = readFileSync(join(VMU, 'packs', 'v5r', 'prompts', 'v5r-core.js'), 'utf8')

let passed = 0
let failed = 0
const failures = []
function ok(cond, name, detail) {
  if (cond) { passed += 1; console.log('  ok   ' + name) } else { failed += 1; failures.push(name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))); console.log('  FAIL ' + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))) }
}
const codeOf = (e) => (e && (e.code || (e.cause && e.cause.code))) || null

const entry = await import(pathToFileURL(join(VMU, 'vibe-math-vmu.js')).href)

const boot = async (config = {}) => {
  const state = { specs: [] }
  const ctx = {
    effect: (fn) => fn(),
    on: () => () => {},
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, Object.assign({ clock: () => 1000, packs: ['v5r'] }, config))
  await handle.ready()
  const specOf = (n) => state.specs.filter((s) => s.name === n)[0] || null
  const call = async (name, args = {}) => {
    const spec = specOf(name)
    if (!spec) return { ok: false, code: 'VMU_TEST_NO_SUCH_TOOL', message: 'tool ' + name + ' was not registered', hint: 'the spec registry is empty for this name' }
    try {
      const raw = await spec.execute(args)
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
      return parsed && typeof parsed === 'object' ? parsed : { ok: false, code: 'VMU_TEST_NO_RECEIPT', message: 'the face answered ' + String(raw), hint: null }
    } catch (e) {
      return { ok: false, code: codeOf(e) || 'VMU_TEST_THROWN', message: String((e && e.message) || e), hint: (e && e.hint) || null }
    }
  }
  return { handle, state, specOf, call }
}

console.log('=== 0. THE SENTENCES ARE IN THE SOURCE ===')

ok(SRC_BLUEPRINT.includes('const draftSharingOf = ('),
  '★ ① both propose returns describe the draft as shared (one helper, so the two branches cannot disagree)', SRC_BLUEPRINT.includes('draftSharingOf'))
ok(SRC_BLUEPRINT.includes("scope: 'institute-wide'"),
  '★ ① the scope is stated as a field, not implied by the word "draft"', SRC_BLUEPRINT.includes('institute-wide'))
ok(SRC_BLUEPRINT.includes('appendedTo: joinedId'),
  '★ ① and the receipt names WHAT this call joined (null = it started the row)', SRC_BLUEPRINT.includes('appendedTo'))
ok(SRC_BLUEPRINT.includes('draftSharing: draftSharingOf(null, authors, false)') && SRC_BLUEPRINT.includes('draftSharing: draftSharingOf(String(target.id), authors, true)'),
  '★ ① the new-draft branch and the continuation branch BOTH carry it', [SRC_BLUEPRINT.includes('draftSharingOf(null, authors, false)'), SRC_BLUEPRINT.includes('draftSharingOf(String(target.id), authors, true)')])

ok(SRC_TOOLS.includes('a leading copy of the draft THIS CALL CONTINUES is stripped'),
  '★ ② the description defines WHICH draft is compared (the one this call continues)', SRC_TOOLS.includes('THIS CALL CONTINUES'))
ok(SRC_TOOLS.includes('`continuedBase.actual` names the row your text was joined to'),
  '★ ② and points at the field that names it', SRC_TOOLS.includes('continuedBase.actual'))
ok(SRC_TOOLS.includes('A draft is NOT private'),
  '★ ② the description says a proposal is not private either', SRC_TOOLS.includes('A draft is NOT private'))

ok(SRC_TOOLS.includes("(processOnly && kApplied === 'immediate') ? 'immediate (THIS PROCESS ONLY)'"),
  '★ ③ the applied value carries its scope, so the quoted word cannot be repeated without the qualifier', SRC_TOOLS.includes('THIS PROCESS ONLY'))
// RUN 220 kept the FIELD and made the WORD follow the route: a key with a named member-facing route no longer borrows
// the no-route word. The pin asks for the branch shape, not for one literal.
ok(SRC_TOOLS.includes('appliedScope: processOnly') && SRC_TOOLS.includes("'this-process-only'"),
  '★ ③ and the scope is also a field (a boolean `partial` three fields later was easy to skim past)', SRC_TOOLS.includes('appliedScope'))

ok(SRC_CORE.includes('蓝图/协议（blueprint）草案不是私有的'),
  '★ ④ the record-book contract now names its one exception (the shared blueprint draft)', SRC_CORE.includes('蓝图/协议'))

console.log('=== 1. ① A PROPOSE JOINS THE SHARED DRAFT AND THE RECEIPT SAYS SO (run 54: authors had three rows, nothing said it) ===')
const A = await boot({ root: mkdtempSync(join(TMP, 'k-')) })
const kernel = A.handle.kernel
ok(kernel !== null && typeof kernel.records === 'object', 'the kernel booted with a records face (a null kernel would make every assertion below vacuous)', kernel === null)
const founded = await A.call('vibe_v5_start', { researcherCount: 2, problem: '前 n 个奇数之和等于 n 的平方' })
ok(founded.ok !== false && Array.isArray(founded.hired) && founded.hired.length >= 3,
  'the institute is founded with a chair and two researchers (an empty roster would make the seats below unresolvable)', { ok: founded.ok, hired: founded.hired })
const first = await A.call('vibe_v5_blueprint', { action: 'propose', member: 'r-1', text: '第一行：本所的目标是证明奇数求和恒等式。' })
ok(first.ok !== false && String(first.id || '') !== '', 'the first proposal is filed (without a row there is nothing to join)', { ok: first.ok, code: first.code, id: first.id })
const share1 = first.draftSharing || null
ok(share1 !== null && typeof share1 === 'object', '★ ① the propose receipt carries a `draftSharing` block', first.draftSharing)
ok(share1 !== null && share1.scope === 'institute-wide',
  '★★ ① and it says the revision is institute-wide (run 54 filed a "throwaway" proposal that two members were writing on)', share1 && share1.scope)
ok(share1 !== null && share1.appendedTo === null,
  '★ ① a FIRST proposal says appendedTo:null (it started the row, so the next author writes on top of it)', share1 && share1.appendedTo)
ok(share1 !== null && Array.isArray(share1.authors) && share1.authors.length === 1 && share1.authors[0] === 'r-1',
  '★ ① the authors list is the receipt\'s own answer to "whose text is this"', share1 && share1.authors)
ok(share1 !== null && typeof share1.means === 'string' && share1.means.includes('STARTED it'),
  '★ ① and the means says this call STARTED the shared row', share1 && share1.means)

const second = await A.call('vibe_v5_blueprint', { action: 'propose', member: 'r-2', text: '## 共同设计补充｜r-2' + '\n' + '- 复核分工：我先验归纳步。' })
ok(second.ok !== false && String(second.id || '') === String(first.id),
  'the second proposal continues the SAME row (that is the shared-draft shape under test)', { ok: second.ok, id: second.id, firstId: first.id })
const share2 = second.draftSharing || null
ok(share2 !== null && share2.appendedTo === String(first.id),
  '★★ ① the continuation names the row it joined, so "I only added my section" is checkable', share2 && share2.appendedTo)
ok(share2 !== null && Array.isArray(share2.authors) && share2.authors.length === 2 && share2.authors.includes('r-1') && share2.authors.includes('r-2'),
  '★★ ① and the authors list shows the OTHER member\'s name (the run-54 office had to count rows to learn this)', share2 && share2.authors)
ok(share2 !== null && typeof share2.means === 'string' && share2.means.includes('SAME row') && share2.means.includes('prune'),
  '★ ① the means says why a diagnostic proposal is not throwaway, and names the one route that discards it', share2 && share2.means)

console.log('=== 2. ③ A SETTING\'S FIRST WORD CARRIES ITS SCOPE (run 54: applied:"immediate" then partial:true) ===')
const applied = Array.isArray(founded.applied) ? founded.applied : []
const leader = applied.filter((a) => a && a.key === 'vmu.turn.leaderId')[0] || null
ok(leader !== null, 'the founded receipt reports the leaderId write (without it there is nothing to read)', applied.map((a) => a && a.key))
ok(leader !== null && leader.partial === true && leader.appliedScope === 'this-process-only',
  '★ ③ a write the member kernels do NOT see reports its scope as a field', leader && { partial: leader.partial, appliedScope: leader.appliedScope })
ok(leader !== null && leader.applied === 'immediate (THIS PROCESS ONLY)',
  '★★ ③ and the value a reader quotes carries the qualifier (run 54 quoted "immediate" and concluded the members had it)', leader && leader.applied)
// `leaderId` has NO member-facing route (a member kernel reads the DECLARED default), and the field says exactly that
// instead of naming a call that cannot exist — the '*' entry of MEMBER_FACING_SETTING_ROUTES.
ok(leader !== null && typeof leader.reachableInstead === 'string' && leader.reachableInstead.includes('NO face can make another kernel read this value'),
  '★ ③ where no member-facing route exists the field says so by name (it never invents a call)', leader && leader.reachableInstead)

console.log('')
console.log(failed === 0 ? 'RUN 218 FEEDBACK53b: ' + passed + ' passed, ' + failed + ' failed' : 'RUN 218 FEEDBACK53b FAILURES:')
if (failed !== 0) { for (const f of failures) console.log('  - ' + f); process.exitCode = 1 }

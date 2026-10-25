// tests/vmu-member-wire.test.mjs — the MEMBER SEAT'S PACK-TOOL WIRE is narrowed by DECLARATION, and the narrowing is
// read from the registration, not asserted from a source grep.
//
// WHY THIS FILE EXISTS (measured, not hypothetical): live run 51's own acceptance report said
//   「vibe_v5_verdict_final 在成员会话里返回 VMU_NO_SUCH_OBJECT('没有这个对象') —— 这是错误的错误名」
// The child was OFFERED a face it can never run: a child session boots a FRESH kernel with no institute state, so the
// pack's rule 「本轮的最终裁决不得由代笔执行」 was enforced by a MISNAMED refusal instead of by the wire. The fix has three
// pieces and this file pins all three:
//   ① the pack DECLARES which faces are office-only (`packs/v5r/member-scope.js`);
//   ② the preset row DERIVES `packToolAllow` from that declaration (`scripts/build-preset-rows.mjs`);
//   ③ the host FILTERS registration by it (`host.js#toolSpecs` → `appendPackToolSpecs({allow})`).
// ③ is asserted BEHAVIOURALLY on the real helper, because a gate that only greps source passes while the registration
// still publishes the withheld tools.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const VMU = join(REPO, 'vibe-math-vmu')
const read = (rel) => readFileSync(join(VMU, rel), 'utf8')

let passed = 0, failed = 0
const failures = []
function ok(cond, name, detail) {
  if (cond) { passed++; return }
  failed++
  failures.push(name + (detail === undefined ? '' : ' — ' + JSON.stringify(detail)))
  console.error('FAIL ' + name + (detail === undefined ? '' : ' — ' + JSON.stringify(detail)))
}

const { TOOL_SCOPES, MEMBER_SAFE_TOOLS, OFFICE_ONLY_TOOLS } = await import(pathToFileURL(join(VMU, 'packs/v5r/member-scope.js')).href)
const { appendPackToolSpecs } = await import(pathToFileURL(join(VMU, 'host-pack-tools.js')).href)
const scopeOf = (n) => (Object.prototype.hasOwnProperty.call(TOOL_SCOPES, n) ? TOOL_SCOPES[n] : 'unknown')

// ── ① the declaration is a PARTITION, not a filter list ──────────────────────────────────────────────────────
{
  const overlap = MEMBER_SAFE_TOOLS.filter((n) => OFFICE_ONLY_TOOLS.includes(n))
  ok(overlap.length === 0, '★ the two scopes are DISJOINT (a face cannot be both seat-safe and office-only)', overlap)
  ok(MEMBER_SAFE_TOOLS.length >= 20, 'the seat keeps a usable research surface', MEMBER_SAFE_TOOLS.length)
  ok(OFFICE_ONLY_TOOLS.length >= 10, 'the office-only list is non-trivial', OFFICE_ONLY_TOOLS.length)
  ok(!MEMBER_SAFE_TOOLS.includes('vibe_v5_verdict_final'), '★ the seat is not offered the final-verdict face')
  ok(scopeOf('vibe_v5_verdict_final') === 'office', 'the table names the final verdict office-side', scopeOf('vibe_v5_verdict_final'))
  ok(scopeOf('vibe_v5_say') === 'member', 'speech stays on the seat', scopeOf('vibe_v5_say'))
  ok(scopeOf('vibe_v5_not_a_real_tool') === 'unknown', 'an unclassified name is `unknown`, never defaulted', scopeOf('vibe_v5_not_a_real_tool'))
}

// ── ③ the registration filter, measured on the real helper ──────────────────────────────────────────────────
{
  const entries = ['a', 'b', 'c'].map((name) => ({ name, description: 'x' }))
  const all = appendPackToolSpecs([], entries, [], null)
  ok(all.appended.length === 3 && all.withheld.length === 0, 'no allow-list ⇒ nothing withheld (the office row)', all)
  const narrowed = appendPackToolSpecs([], entries, [], null, { allow: ['a', 'c'] })
  ok(narrowed.appended.length === 2 && narrowed.appended.join() === 'a,c', 'allow-list keeps the declared ones', narrowed.appended)
  ok(narrowed.withheld.length === 1 && narrowed.withheld[0] === 'b', '★ the filter says WHAT it withheld (a claim, not a silence)', narrowed.withheld)
  ok(narrowed.appended.length + narrowed.withheld.length === 3, 'every entry is accounted for')
  const collided = appendPackToolSpecs([], entries, ['b'], null, { allow: ['b'] })
  ok(collided.appended.length === 0, 'a reserved name stays unpublished even when allowed', collided)
}

// ── ② the row DERIVES the list; the office row narrows nothing ──────────────────────────────────────────────
{
  const yaml = readFileSync(join(REPO, 'cordis.patch.yml'), 'utf8')
  const memberStart = yaml.indexOf('- id: preset-vibe-math-vmu-member')
  ok(memberStart > 0, 'the member preset row exists in the shipped patch')
  const nextRow = yaml.indexOf('\n      - id:', memberStart)
  const memberBlock = yaml.slice(memberStart, nextRow === -1 ? undefined : nextRow)
  const m = memberBlock.match(/packToolAllow:\n((?:\s+- [^\n]+\n)+)/)
  ok(m !== null, '★ the member row carries a DERIVED packToolAllow list')
  const derived = m ? m[1].split('\n').map((l) => l.trim()).filter(Boolean).map((l) => l.replace(/^- /, '')) : []
  ok(MEMBER_SAFE_TOOLS.length > 0 && derived.length > 0 && derived.length === MEMBER_SAFE_TOOLS.length, 'the row lists exactly the declaration (non-vacuous)', [derived.length, MEMBER_SAFE_TOOLS.length])
  ok(derived.every((n) => MEMBER_SAFE_TOOLS.includes(n)) && MEMBER_SAFE_TOOLS.every((n) => derived.includes(n)),
    '★ the row and the declaration are the SAME SET (hand-copied drift fails here)',
    derived.filter((n) => !MEMBER_SAFE_TOOLS.includes(n)))
  ok(!memberBlock.includes('vibe_v5_verdict_final'), 'the member row does not offer the final-verdict face')
  const officeStart = yaml.indexOf('- id: preset-vibe-math-vmu\n')
  const officeBlock = officeStart > 0 ? yaml.slice(officeStart, memberStart) : ''
  ok(officeStart > 0 && officeBlock.length > 100 && !officeBlock.includes('packToolAllow'),
    '★ the office row is NOT narrowed by construction')
}

// ── the host reads the config key and states the scope ─────────────────────────────────────────────────────
{
  const host = read('host.js')
  ok(/config\.packToolAllow/.test(host), 'host.js reads config.packToolAllow')
  ok(/\{ allow: packToolAllow \}/.test(host), 'host.js passes it to the ONE pack-tool funnel')
  ok(/specs\.packToolScope\s*=\s*\{/.test(host), 'host.js records what was allowed/withheld on the spec list')
  ok(/withheld: packToolAllow \? packToolScope\.withheld : \[\]/.test(host), 'the recorded scope reports the withheld names')
}

// ── the generator IMPORTS the declaration (the derivation is real, not a promise) ───────────────────────────
{
  const gen = readFileSync(join(REPO, 'scripts/build-preset-rows.mjs'), 'utf8')
  ok(/MEMBER_SAFE_TOOLS\s*\}\s*=\s*await import\('\.\.\/vibe-math-vmu\/packs\/v5r\/member-scope\.js'\)/.test(gen),
    '★ build-preset-rows.mjs DERIVES the list from the pack module')
  ok(/packToolAllow:/.test(gen), 'the generator emits the key')
}

console.log(`=== VMU MEMBER WIRE: ${passed} passed, ${failed} failed ===`)
if (failed) { for (const f of failures) console.error('  · ' + f); process.exit(1) }

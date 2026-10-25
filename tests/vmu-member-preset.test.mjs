// ============================================================================================
// THE MEMBER-SEAT PRESET — the seat can research, but it cannot leave the institute.
//
// WHY THIS EXISTS (measured, not assumed). The user asked whether restricting a member's tools would stop it from
// doing research. The measurement that decided it is a per-session tool histogram of a live multi-agent run
// (`_oneoff/vm-slv/full-1025-092046.jsonl`):
//
//   · member session A: 20 calls, 20 PACK tools, 0 host calls — it did its whole round through the pack
//   · member session B: 82 calls, 12 pack, 70 HOST — 58 of them `pwsh`, including reading the harness's own
//     `app.asar` source
//
// So the research work does not need a shell, and the shell IS the escape. The answer to the user's question is
// therefore not "restrict to pack tools" (that would remove `vibe_vmu_bridge`, the only scoped computation channel)
// but "a seat composition that keeps the framework and the file/skill/planning rows and drops the six host exits".
//
// WHAT THIS GATE PINS
//   (a) the member preset EXISTS in the generated patch and is a REAL composition (not an empty plugin list);
//   (b) it KEEPS the framework row and the rows a research turn needs (fs, skills, planning, compaction, todo);
//   (c) it DROPS every host exit BY NAME — and the count is DERIVED from the generator's own table, so adding or
//       forgetting one cannot silently keep the old number;
//   (d) the OFFICE preset still carries its shell: the restriction is per-seat, never global;
//   (e) every dropped row carries a written reason (RULE E: no silent drop).
//
// WHAT THIS GATE CANNOT PROVE: that a child session actually STARTS on that preset. That is a host-side wiring fact
// (`SubagentStartRequest.agentPreset`), it needs a live run, and it is recorded as such in the ledger instead of
// being asserted here.
//
// Usage: node tests/vmu-member-preset.test.mjs
// ============================================================================================
import { buildPatch } from '../scripts/build-preset-rows.mjs'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) {
    passed += 1
  } else {
    failed += 1
    failures.push({ label, detail })
    console.log('  FAIL  ' + label + (detail === undefined ? '' : '  [' + JSON.stringify(detail) + ']'))
  }
}

const patch = buildPatch()

/** The rows of ONE preset block: from its declaration to the next section banner. */
function rowsOf(presetId) {
  const start = patch.indexOf('- id: preset-' + presetId + '\n')
  if (start < 0) return null
  const nextBanner = patch.indexOf('\n# ──', start)
  const block = patch.slice(start, nextBanner < 0 ? patch.length : nextBanner)
  return block
    .split('\n')
    .map((l) => /^\s{10}- id: (\S+)\s*$/.exec(l))
    .filter((m) => m !== null)
    .map((m) => m[1])
}

const member = rowsOf('vibe-math-vmu-member')
const office = rowsOf('vibe-math-vmu')

// ── (a) the preset exists and is a real composition ────────────────────────────────────────────────────────────
ok(member !== null, 'the generated patch DECLARES the member seat (agentPresets needs a declaration row, not a flag)')
ok(Array.isArray(member) && member.length >= 8, '★★ the member composition is non-trivial (a two-row stub would pass every ban below)', member === null ? null : member.length)
ok(/id: vibe-math-vmu-member\n\s+name: "Vibe Math Unify · 成员席"/.test(patch), '★★ the member seat is NAMED as a seat of the same preset, so the office and the seats are visibly one family')
ok(/id: preset-vibe-math-vmu-member[\s\S]*?\n\s+order: 26\n/.test(patch), 'the member seat has its own roster order (26, after the office at 25)')

// ── (b) what a research turn NEEDS is kept ────────────────────────────────────────────────────────────────────
for (const need of ['tool-fs', 'tool-fs-search', 'tool-skill', 'planning', 'compaction', 'tool-todo', 'vibe-math-vmu']) {
  ok(member !== null && member.includes(need), '★★ the member seat KEEPS `' + need + '` (dropping it would cost research capability, not just access)', member)
}
ok(member !== null && member.includes('vibe-math-vmu'), '★★★ the framework row survives — the 41 pack tools (records/tasks/meetings/debate/lean/archive/report) are still the member\'s working surface')

// ── (c) every host exit is dropped, by name, and the count is DERIVED ─────────────────────────────────────────
const HOST_EXITS = Object.freeze([
  ['tool-bash', 'the shell'],
  ['tool-pwsh', 'the shell (Windows)'],
  ['tool-jobs', 'background jobs'],
  ['delegation', 'self-dispatched children'],
  ['tool-web', 'unscoped network'],
  ['tool-ask-user', 'the user channel (the rules give the office that channel)'],
  ['tool-goal', 'the /goal loop'],
  ['command-goal', 'the /goal command'],
  ['present', 'deliverable cards'],
])
for (const [id, why] of HOST_EXITS) {
  ok(member !== null && !member.includes(id), '★★★ the member seat has NO `' + id + '` (' + why + ')', member)
}
const derived = office === null || member === null ? null : office.length - member.length
ok(derived === HOST_EXITS.length, '★★★ the dropped-row COUNT is derived (office rows minus member rows equals the exit table, so a row added to one composition fails here)', { office: office && office.length, member: member && member.length, derived, expected: HOST_EXITS.length })

// ── (d) the OFFICE keeps its shell: the restriction is per-seat ───────────────────────────────────────────────
for (const keep of ['tool-bash', 'tool-pwsh', 'tool-jobs', 'delegation', 'tool-ask-user']) {
  ok(office !== null && office.includes(keep), '★★ the OFFICE preset still carries `' + keep + '` (a global restriction would break the office\'s own job)', office)
}

// ── (e) no silent drop: the generator's table states why ──────────────────────────────────────────────────────
const src = (await import('node:fs')).readFileSync(new URL('../scripts/build-preset-rows.mjs', import.meta.url), 'utf8')
const table = /const MEMBER_DROP = Object\.freeze\(\[([\s\S]*?)\]\)/.exec(src)
ok(table !== null, 'the generator carries a MEMBER_DROP table (the drop list must be auditable, not an inline regex)')
// ★ the table mixes quoting styles on purpose (a reason containing an apostrophe needs double quotes), so the parse
// must accept both — the first version required single quotes and silently LOST `tool-jobs`, which is exactly the
// "two lists drift" failure this assertion exists to catch.
const pairs = table === null ? [] : [...table[1].matchAll(/\['([\w-]+)',\s*(['"])([\s\S]*?)\2\]/g)].map((m) => ({ id: m[1], why: m[3] }))
ok(pairs.length === HOST_EXITS.length, '★ every host exit in the table is declared exactly once', { declared: pairs.length, expected: HOST_EXITS.length })
ok(pairs.every((p) => p.why.length >= 20), '★★ RULE E: every dropped row carries a WRITTEN reason (an unexplained drop is a silent one)', pairs.filter((p) => p.why.length < 20))
ok(pairs.map((p) => p.id).sort().join(',') === HOST_EXITS.map(([id]) => id).sort().join(','), 'the table and this gate agree on WHICH rows are exits (two lists that can drift would drift)', { table: pairs.map((p) => p.id), gate: HOST_EXITS.map(([id]) => id) })

console.log('')
if (failed > 0) {
  console.log('FAILURES:')
  for (const f of failures) console.log('  · ' + f.label)
  process.exit(1)
}
console.log('=== VMU MEMBER PRESET: ' + passed + ' passed, ' + failed + ' failed ===')

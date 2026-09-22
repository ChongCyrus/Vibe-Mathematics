// ============================================================
// PERSONA SURFACE SENSITIVITY PROBES
//
// `audit-persona-surface.test.mjs` compares each preset's persona prompt against the tools
// that preset actually registers. It is the only guard against two failures that no other
// suite can see (they all call apply(ctx) directly and never load the YAML):
//
//   · a registered tool that the persona never names  → the agent cannot discover it;
//   · a persona that names an unregistered tool       → the agent is told to call a tool
//     that does not exist.
//
// The Lean formal-verification feature shipped with both, in three of four presets. This
// script proves the guard is not vacuous: each probe copies the preset tree, applies ONE
// mutation, and requires the suite to go RED.
//
// False-green traps handled (see AUDIT-CHECKLIST.md §2):
//   1. a probe whose own spawn fails — reported as SETUP-FAIL, never as a detection;
//   2. a suite that ignores its override env var — `PERSONA_ROOT` is exercised in both
//      directions (a NON-mutated copy must keep the suite GREEN before any probe runs);
//   3. a semantically inert mutation — the anchor must match an exact, asserted count, and
//      for YAML probes the mutated copy must still yield the persona's two literal blocks;
//   4. a mutation that breaks syntax — every mutated `.js` copy is `node --check`ed, and a
//      mutated `.yml` whose persona markers are damaged is a SETUP-FAIL, not a detection.
//
// Run: node audit-persona-sensitivity.mjs
// ============================================================
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, cpSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const REPO = fileURLToPath(new URL('.', import.meta.url))
const SUITE = join(REPO, 'audit-persona-surface.test.mjs')
const PRESETS = [
  { dir: 'vibe-math-v2', js: 'vibe-math-v2.js' },
  { dir: 'vibe-math-v3', js: 'vibe-math-v3.js' },
  { dir: 'vibe-math-v4', js: 'vibe-math-v4.js' },
  { dir: 'vibe-math-v5', js: 'vibe-math-v5.js' },
]

/** Prepare a private copy of every preset (persona + plugin), so one probe cannot leak. */
function prepareRoot() {
  const root = mkdtempSync(join(tmpdir(), 'persona-sens-'))
  for (const P of PRESETS) {
    mkdirSync(join(root, P.dir), { recursive: true })
    cpSync(join(REPO, P.dir, 'agent.cordis.yml'), join(root, P.dir, 'agent.cordis.yml'))
    cpSync(join(REPO, P.dir, P.js), join(root, P.dir, P.js))
  }
  return root
}

/** The persona's two literal blocks must survive a YAML mutation, or the probe is unfair. */
function yamlStillHasPersona(yml) {
  if (!/^\s*-\s*id:\s*persona\s*$/m.test(yml)) return false
  const markers = yml.match(/^\s*(?:prefix|text):\s*\|-?\s*$/gm) || []
  return markers.length === 2
}

function runSuite(root) {
  const env = Object.assign({}, process.env, { PERSONA_ROOT: root })
  const r = spawnSync(process.execPath, [SUITE], { env, encoding: 'utf8', cwd: REPO })
  return { status: r.status, error: r.error, out: String(r.stdout || '') + String(r.stderr || '') }
}

// A sanity gate first: the UNMUTATED copy must be GREEN through the override, otherwise
// every probe below would "detect" the override itself rather than the mutation (trap 2).
const sanityRoot = prepareRoot()
{
  const r = runSuite(sanityRoot)
  if (r.status !== 0) {
    console.error('  SETUP-FAIL - the suite is RED on an unmutated copy through PERSONA_ROOT:')
    console.error(r.out.split('\n').filter((l) => l.includes('FAIL')).slice(0, 8).join('\n'))
    rmSync(sanityRoot, { recursive: true, force: true })
    process.exit(1)
  }
  console.log('  ok   - control: unmutated copy is GREEN through PERSONA_ROOT (the override works)')
}
rmSync(sanityRoot, { recursive: true, force: true })

const probes = [
  // ── v2 ─────────────────────────────────────────────────────────────────────
  {
    name: 'v2-lean-tools-line-removed',
    preset: 'vibe-math-v2', file: 'agent.cordis.yml', nth: 'all', expect: 2,
    guarantee: 'the three Lean tools must be named in the persona the main agent receives',
    from: '      - vibe_math_lean_run / vibe_math_lean_archive / vibe_math_lean_lib — Lean formal\n        verification (execute / archive / list the reuse library). The scheduler\'s child agents\n        use them too; they work in every mode.\n',
    to: '',
  },
  {
    name: 'v2-phantom-tool-mentioned',
    preset: 'vibe-math-v2', file: 'agent.cordis.yml', nth: 'all', expect: 2,
    guarantee: 'the persona must not advertise a tool that is not registered (the agent would call it and fail)',
    from: '      - vibe_math_lean_run / vibe_math_lean_archive / vibe_math_lean_lib — Lean formal',
    to: '      - vibe_math_lean_exec / vibe_math_lean_run / vibe_math_lean_archive / vibe_math_lean_lib — Lean formal',
  },

  // ── v3 ─────────────────────────────────────────────────────────────────────
  {
    name: 'v3-persona-tool-name-typo',
    preset: 'vibe-math-v3', file: 'agent.cordis.yml', nth: 'all', expect: 2,
    guarantee: 'a typo in a persona tool name must be caught (an agent copying it calls a tool that does not exist)',
    from: 'vibe_math_lean_archive',
    to: 'vibe_math_lean_archiv',
  },
  {
    name: 'v3-tool-registered-but-not-documented',
    preset: 'vibe-math-v3', file: 'vibe-math-v3.js', nth: 'first', expect: 2,
    guarantee: 'a newly registered tool must be documented in the persona (or the snapshot updated on purpose)',
    from: "  registerTool('vibe_math_lean_run', '(member) Execute the Lean toolchain",
    to: "  registerTool('vibe_math_extra_tool', 'x', objParams({}), async function () { return {} })\n  registerTool('vibe_math_lean_run', '(member) Execute the Lean toolchain",
  },

  // ── v4 ─────────────────────────────────────────────────────────────────────
  {
    name: 'v4-formal-mode-renamed-in-persona',
    preset: 'vibe-math-v4', file: 'agent.cordis.yml', nth: 'all', expect: 2,
    guarantee: 'the persona must spell the three mode names exactly as the parameter accepts them',
    from: "        - 'off' (default, no extra requirement) | 'encourage' (the residents decide by implementation\n          difficulty whether to formalize in Lean; once a Lean run passes, their unanimous vote becomes\n          a FIDELITY review — do the Lean definitions/objects/conditions/assumptions/conclusion match\n          the proposition as stated) | 'require' (same, plus a gate: a unanimous true/false verdict is",
    to: "        - 'off' (default, no extra requirement) | 'encourage' (the residents decide by implementation\n          difficulty whether to formalize in Lean; once a Lean run passes, their unanimous vote becomes\n          a FIDELITY review — do the Lean definitions/objects/conditions/assumptions/conclusion match\n          the proposition as stated) | 'forced' (same, plus a gate: a unanimous true/false verdict is",
  },
  {
    name: 'v4-formal-report-tool-hidden',
    preset: 'vibe-math-v4', file: 'agent.cordis.yml', nth: 'all', expect: 2,
    guarantee: 'the formal-report tool must be named in the persona (it is the coordinator-facing Lean view)',
    from: '        - vibe_v4_formal_report — human-readable Lean formal-verification mirror (mode, Lean-passed',
    to: '        - vibe_v4_formal_reportX — human-readable Lean formal-verification mirror (mode, Lean-passed',
  },

  // ── v5 ─────────────────────────────────────────────────────────────────────
  {
    name: 'v5-prefix-text-drift',
    preset: 'vibe-math-v5', file: 'agent.cordis.yml', nth: 'second', expect: 2,
    guarantee: 'prefix and text must stay identical apart from line 0 (old and new hosts must see the same surface)',
    from: 'TRUST RULE: only Verified/',
    to: 'TRUST RULE (amended): only Verified/',
  },
  {
    name: 'v5-tool-renamed-in-plugin',
    preset: 'vibe-math-v5', file: 'vibe-math-v5.js', nth: 'first', expect: 1,
    guarantee: 'renaming a registered tool must be caught (the persona still advertises the old name)',
    from: "  registerTool('vibe_v5_meeting',",
    to: "  registerTool('vibe_v5_meeting2',",
  },
  {
    name: 'v4-usage-advertises-phantom-subcommand',
    preset: 'vibe-math-v4', file: 'vibe-math-v4.js', nth: 'first', expect: 1,
    guarantee: 'the unknown-subcommand usage string must not advertise a subcommand that no branch implements',
    from: "usage:'configure|start|resume|pause|abort|status|report|message <to|all> <content>|meeting|members|add|remove|set'",
    to: "usage:'configure|start|resume|pause|abort|status|report|message <to|all> <content>|meeting|members|add|remove|scan|set'",
  },
  {
    name: 'v4-hint-advertises-unimplemented-subcommand',
    preset: 'vibe-math-v4', file: 'vibe-math-v4.js', nth: 'first', expect: 1,
    guarantee: 'the typing hint must not advertise a subcommand the handler does not implement',
    from: "message <to|all> <content>|meeting|members|add|remove|set]'",
    to: "message <to|all> <content>|meeting|add|remove|set]'",
  },
  {
    name: 'v5-persona-slash-list-drops-add-remove',
    preset: 'vibe-math-v5', file: 'agent.cordis.yml', nth: 'all', expect: 2,
    guarantee: "the persona's /v5 list must match the command hint (a human reading the persona must see every subcommand)",
    from: 'meeting|hire|fire|add|remove|set)',
    to: 'meeting|hire|fire|set)',
  },
]

let ok = 0
let bad = 0
console.log('')
console.log('-- persona surface sensitivity probes --')
console.log('(a probe passes when breaking the guarantee turns audit-persona-surface.test.mjs RED)')
console.log('')

for (const p of probes) {
  const root = prepareRoot()
  const target = join(root, p.preset, p.file)
  const original = readFileSync(target, 'utf8')
  // The repo's YAML files are CRLF; anchors are written with \n. Normalise both directions so
  // a multi-line anchor matches regardless of the checkout's line endings.
  const eol = original.includes('\r\n') ? '\r\n' : '\n'
  const from = p.from.split('\n').join(eol)
  const to = p.to.split('\n').join(eol)
  p.from = from
  p.to = to
  const occurrences = original.split(p.from).length - 1
  if (occurrences !== p.expect) {
    console.error(`  SETUP-FAIL - ${p.name}: anchor matched ${occurrences} times (need ${p.expect})`)
    bad++
    rmSync(root, { recursive: true, force: true })
    continue
  }
  let mutated
  if (p.nth === 'all') mutated = original.split(p.from).join(p.to)
  else if (p.nth === 'first') mutated = original.replace(p.from, p.to)
  else if (p.nth === 'second') {
    const i = original.indexOf(p.from)
    const j = original.indexOf(p.from, i + 1)
    mutated = original.slice(0, j) + p.to + original.slice(j + p.from.length)
  } else throw new Error('unknown nth ' + p.nth)

  if (mutated === original) {
    console.error(`  SETUP-FAIL - ${p.name}: the mutation is a no-op`)
    bad++
    rmSync(root, { recursive: true, force: true })
    continue
  }
  if (p.file.endsWith('.yml') && !yamlStillHasPersona(mutated)) {
    console.error(`  SETUP-FAIL - ${p.name}: the mutated persona no longer has its two literal blocks (unfair mutation)`)
    bad++
    rmSync(root, { recursive: true, force: true })
    continue
  }
  writeFileSync(target, mutated, 'utf8')

  if (p.file.endsWith('.js')) {
    const chk = spawnSync(process.execPath, ['--check', target], { encoding: 'utf8' })
    if (chk.status !== 0) {
      console.error(`  SETUP-FAIL - ${p.name}: the mutated copy has a syntax error:\n` + String(chk.stderr || '').split('\n').slice(0, 4).join('\n'))
      bad++
      rmSync(root, { recursive: true, force: true })
      continue
    }
  }

  const r = runSuite(root)
  if (r.status === null) {
    console.error(`  SETUP-FAIL - ${p.name}: the suite could not be started (${String(r.error && r.error.message)})`)
    bad++
    rmSync(root, { recursive: true, force: true })
    continue
  }
  if (r.status !== 0) {
    const firstFail = (r.out.split('\n').find((l) => l.trim().startsWith('FAIL')) || '').trim().slice(0, 110)
    ok++
    console.log(`  ok - ${p.name} [${p.preset}] => suite went RED as required  [${p.guarantee}]`)
    if (firstFail) console.log(`         ${firstFail}`)
  } else {
    bad++
    console.error(`  BLIND SPOT - ${p.name} [${p.preset}] => suite stayed GREEN, so it does NOT detect: ${p.guarantee}`)
  }
  rmSync(root, { recursive: true, force: true })
}

console.log('')
console.log(`persona sensitivity: ${ok} probes detected the break, ${bad} problems`)
if (bad) process.exit(1)
console.log('ALL PERSONA PROBES RED AS REQUIRED')
process.exit(0)

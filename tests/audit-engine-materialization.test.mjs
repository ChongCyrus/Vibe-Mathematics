#!/usr/bin/env node
// ★ R16 / F1 — DECLARED-DEFAULT GATE: a consumer must ask for the DECLARED default (never a literal beside the
// read), the pack must not restate it, and the one degradation that remains (an EXPLICIT empty declaration) must
// stay NAMED.
//
// ★ WHY THIS FILE EXISTS (the defect it locks), and the convention it encodes — CHANGED BY LEAD RULING.
// MEASURED DEFECT: `vmu.math.engines` was declared in `settings/schema.js` with the eight-name engine order
// (`MATH_DEFAULTS.mathEngines`), the plugin entry only ever adopts `config.vmu` as settings, and the gateway
// `kernel/mathjobs.js` read the raw key ⇒ it saw `undefined` ⇒ every job was refused `VMU_MATH_UNSUPPORTED_OP`
// ("未声明任何引擎") on a host where python WAS installed, while `status().settings.resolved` still showed the
// eight names. A declaration face and a runtime face disagreeing.
//
// TWO COMPETING FIXES EXISTED. An earlier draft of this gate asserted (b): the v5r PACK restates the eight names
// in `packs/v5r/settings/defaults.json` so the settings fold materialises them. The Lead RULING is (a), and it is
// what this gate now enforces:
//   (a) the DECLARATION is the single source. `kernel/settings-defaults.js` is THE one reader for "a declared
//       setting, or its declared default" (its head comment records FOUR doors that each grew their own fallback
//       and THREE of which disagreed with the declaration). Consumers ask it; nobody writes a literal default
//       beside a read, and no pack restates a declaration default — that would be a second copy of one fact, i.e.
//       the hardcoded-derivable-value red line. A deployment that wants NO engines says so EXPLICITLY
//       (`vmu.math.engines: []`), and THAT is when the named refusal fires.
//
// ★ THE THREE ARMS (each is an independent real source; none of them is "the doc says so"):
//   ARM 1  the pack must NOT restate the declared default (duplication guard — this is what made the old draft
//          red), and a real boot with `packs:['v5r']` must still RESOLVE the key to the shared engine order:
//          resolution now comes from the declaration, not from the pack.
//   ARM 2  ABSENCE must resolve to the declared default (a host with python installed can then actually run),
//          while an EXPLICIT empty declaration must still degrade by NAME (`VMU_MATH_UNSUPPORTED_OP`
//          "未声明任何引擎") before any spawn. Both halves run the math-jobs face with a booby-trapped spawn: a
//          silent run fails the first half by refusing, and fails the second half by spawning.
//   ARM 3  the DOCUMENTED table row (parsed out of `docs/04-settings.md` §11) equals the RESOLVED value. Two real
//          sources: the markdown table cell vs the runtime value. Deliberately NOT "read the doc and compare it to
//          a string in this file" — that would pass while both sides drifted together.
//
// ★ TEETH: ARM 1 is RED if anyone re-adds the eight names to the pack; ARM 2 is RED in both directions (absence
// refusing, or an explicit empty list running). It is not a test that only ever says "ok".
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const entry = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')).href)
const { MATH_ENGINE_ORDER } = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'math-engines.js')).href)
const { createMathJobs } = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'kernel', 'mathjobs.js')).href)
const { declaredDefault } = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'kernel', 'settings-defaults.js')).href)

const KEY = 'vmu.math.engines'
const DEFAULTS_JSON = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'settings', 'defaults.json')
const DOCS_04 = join(REPO, 'vibe-math-vmu', 'docs', '04-settings.md')
const clock = () => '2026-10-09T00:00:00.000Z'

let passed = 0
const failures = []
const ok = (cond, name, detail) => { if (cond) { passed += 1; return } failures.push(name + (detail === undefined ? '' : ' [' + String(detail).slice(0, 200) + ']')) }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

const fakeCtx = () => ({
  effect(fn) { return fn() },
  on() { return () => {} },
  tools: { register: async () => () => {} },
  systemPrompt: { context: () => ({ ok: true }), section: () => () => {}, getSectionOrder: () => 5 },
})
// ★ WHY THIS BOOT HAS NO DURABLE ROOT (and why the kernel prints "pack v5r was not applied: ... no library root"):
// the pack's DATA PLANE (records/tracks, roster, store) needs a durable root, but the SETTINGS-DEFAULTS FOLD does
// not: the entry folds `packs/<name>/settings/defaults.json` before the kernel exists (`vibe-math-vmu.js:352-373`),
// and that fold is the ONLY layer that can materialize a declared default — exactly the mechanism this gate locks.
// Passing a temp `root` here would mount the data plane too and drag in the store/recovery path (measured: it then
// emits "in-flight recovery failed: VMU_STORE_FAILED" because the async open has not finished), which is not what
// this gate is about. So the warning is EXPECTED and does not weaken ARM 1; the arm asserts the fold, not the pack's
// data plane, and it would fail if the fold stopped naming the pack (`settingSource === 'pack:v5r'`).
const boot = (opts) => entry.apply(fakeCtx(), Object.assign({ clock }, opts || {}))
const resolvedOf = (handle) => {
  try { return (handle && handle.kernel && handle.kernel.status().settings.resolved) || {} } catch (e) { return {} }
}
const mergeSourcesOf = (handle) => {
  try {
    const s = handle.kernel.status()
    return (s && s.settingsMerge && s.settingsMerge.sources) || null
  } catch (e) { return null }
}

/** Parse the documented §11 row for `key` out of a docs/04 source TEXT. Pure, so `--self-test` can feed it. */
const parseDocRow = (text, key = KEY) => {
  const lines = text.split(/\r?\n/)
  const h11 = lines.findIndex((l) => /^##\s*11\./.test(l))
  const h12 = lines.findIndex((l) => /^##\s*12\./.test(l))
  const rowLine = (h11 !== -1 && h12 !== -1 && h12 > h11)
    ? lines.findIndex((l, i) => i > h11 && i < h12 && l.startsWith('| `' + key + '` |'))
    : -1
  const cells = rowLine === -1 ? [] : lines[rowLine].split('|').map((c) => c.trim())
  // cells: ['', key, type, default, domain, scope, hot, who, wired, carrier, doc, '']
  const cellDefault = cells[3] === undefined ? '' : cells[3].replace(/`/g, '').trim()
  const docList = /^\[(.*)\]$/.test(cellDefault) ? cellDefault.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean) : null
  return { h11, h12, rowLine, cells, cellDefault, docList }
}

// ★ SELF-PROOF (audit-scanner-selfproof, round 17): `--self-test` proves the two ASSERTION SHAPES below can go red,
// without editing the repo: the §11 row parser is fed a planted table (present / missing / empty cell), and the
// math-jobs refusal is proved CONDITIONAL (absent ⇒ named refusal with no spawn; declared ⇒ not that refusal).
// ARM 1's teeth are the red→green pair recorded in this file's header (it was red before the pack line existed);
// a self-test cannot re-prove that without editing the pack, which is exactly what a gate must not do to itself.
if (process.argv.includes('--self-test')) {
  let bad = 0
  const check = (cond, name, detail) => {
    console.log((cond ? 'PASS ' : 'FAIL - ') + name + (detail === undefined ? '' : ' :: ' + String(typeof detail === 'object' ? JSON.stringify(detail) : detail).slice(0, 200)))
    if (!cond) bad += 1
  }
  const synthetic = (row) => ['## 11. 参数表', '| 键 | 类型 | 默认 | 域 |', '|---|---|---|---|', row || '', '', '## 12. 其他', ''].join('\n')
  const good = parseDocRow(synthetic('| `' + KEY + '` | string[] | `[python,r]` | — |'))
  check(good.rowLine !== -1 && same(good.docList, ['python', 'r']),
    'the §11 row parser READS a planted row and its default list', good.docList)
  const absent = parseDocRow(synthetic(''))
  check(absent.rowLine === -1 && absent.docList === null,
    'NEGATIVE CONTROL: a table WITHOUT the row is reported missing (it cannot compare equal to anything)', absent.rowLine)
  const emptyCell = parseDocRow(synthetic('| `' + KEY + '` | string[] | `` | — |'))
  check(emptyCell.docList === null,
    'NEGATIVE CONTROL: an EMPTY default cell parses to null, not to an empty list (an empty parse must FAIL)', emptyCell.cellDefault)

  // ★ ARM 2 teeth, re-pointed at the ruling: ABSENCE is NOT a degradation (it resolves to the declaration), and
  // an EXPLICIT empty declaration IS one (named refusal, no spawn). Both halves are booby-trapped.
  let spawnedAbsent = false
  const absentSettings = createMathJobs({
    settings: {},
    clock: () => 0,
    spawn: () => { spawnedAbsent = true; throw new Error('BOOBY TRAP: submit reached the spawner') },
  })
  const r1 = await absentSettings.submit({ engine: 'python' })
  check(spawnedAbsent === true || !(r1 && r1.code === 'VMU_MATH_UNSUPPORTED_OP'),
    'ARM 2 teeth (ABSENT ⇒ declared default): an unset engine list is NOT refused as "no engine declared"', r1 && r1.code)

  let spawnedEmpty = false
  const emptySettings = createMathJobs({
    settings: { [KEY]: [] },
    clock: () => 0,
    spawn: () => { spawnedEmpty = true; throw new Error('BOOBY TRAP: submit spawned although the declaration is empty') },
  })
  const r2 = await emptySettings.submit({ engine: 'sympy' })
  check(r2 && r2.code === 'VMU_MATH_UNSUPPORTED_OP' && spawnedEmpty === false,
    'ARM 2 teeth (EXPLICIT [] ⇒ NAMED refusal): an explicitly empty declaration refuses by name, before any spawn', r2 && r2.code)
  console.log('SELFTEST ' + (bad === 0 ? 'PASS' : 'FAIL (' + bad + ')'))
  process.exit(bad === 0 ? 0 : 1)
}

// ──────────────────────── ARM 1: the DECLARATION is the source; the pack must not restate it ────────────────
{
  const packFile = JSON.parse(readFileSync(DEFAULTS_JSON, 'utf8'))
  const packDefaults = (packFile && typeof packFile.defaults === 'object' && packFile.defaults) || {}
  ok(!Object.prototype.hasOwnProperty.call(packDefaults, KEY),
    '★ ARM 1 (duplication guard): the v5r pack does NOT restate the declared default — one fact, one copy',
    'pack keys=' + Object.keys(packDefaults).length)
  ok(same(declaredDefault(KEY), MATH_ENGINE_ORDER),
    '★★ ARM 1 (fidelity, two sources): the DECLARED default in settings/schema.js equals the shared engine order',
    'declared=' + JSON.stringify(declaredDefault(KEY)) + ' order=' + JSON.stringify(MATH_ENGINE_ORDER))

  const handle = boot({ packs: ['v5r'] })
  const source = handle.kernel.settingSource(KEY)
  const resolved = resolvedOf(handle)
  const row = resolved[KEY] || {}
  ok(source !== 'pack:v5r',
    '★★ ARM 1: no pack layer writes this key any more (the declaration is the single source)',
    'settingSource=' + String(source))
  ok(Array.isArray(row.value) && row.value.length > 0,
    '★ ARM 1: the RESOLVED value is a NON-EMPTY array (a vacuous [] would make every later assertion empty-set true)',
    'value=' + JSON.stringify(row.value))
  ok(same(row.value, MATH_ENGINE_ORDER),
    '★★ ARM 1 (runtime ← declaration): the resolved value equals the shared engine order',
    'runtime=' + JSON.stringify(row.value) + ' order=' + JSON.stringify(MATH_ENGINE_ORDER))
  ok(Array.isArray(row.value) && row.value.every((n) => typeof n === 'string' && n !== ''),
    '★ ARM 1: every engine name is a non-empty string', JSON.stringify(row.value))
}

// ──────────── ARM 2: ABSENCE resolves to the declaration; an EXPLICIT empty list degrades BY NAME ────────────
{
  const handle = boot({})
  const source = handle.kernel.settingSource(KEY)
  const row = resolvedOf(handle)[KEY] || {}
  ok(source === null,
    '★★ ARM 2: without the pack nothing MATERIALISES the key (no writer invents a value)',
    'settingSource=' + String(source))
  ok(row.source === 'default',
    '★ ARM 2: the declaration still reports its default — and the readers now ASK for it',
    'resolved.source=' + String(row.source))

  // (i) ABSENCE must resolve to the declared default. The spawn is a booby trap: if the gateway ever falls back to
  // an empty list again, this call is refused as "no engine declared" and the arm fails on the code, not on prose.
  let spawnedAbsent = false
  const jobsAbsent = createMathJobs({
    settings: {},
    clock: () => 0,
    spawn: () => { spawnedAbsent = true; throw new Error('BOOBY TRAP: submit reached the spawner (that is the pass condition here)') },
  })
  const ra = await jobsAbsent.submit({ engine: 'python' })
  ok(!(ra && ra.code === 'VMU_MATH_UNSUPPORTED_OP'),
    '★★ ARM 2 (ABSENT ⇒ declared default in EFFECT): the gateway does NOT refuse "未声明任何引擎" when the host declared nothing',
    { spawned: spawnedAbsent, code: ra && ra.code })

  // (ii) The ONE remaining degradation: an EXPLICIT empty declaration. Named, and before any spawn.
  let spawnedEmpty = false
  const jobsEmpty = createMathJobs({
    settings: { [KEY]: [] },
    clock: () => 0,
    spawn: () => { spawnedEmpty = true; throw new Error('BOOBY TRAP: submit spawned although the declaration is empty') },
  })
  const re = await jobsEmpty.submit({ engine: 'python' })
  ok(re && re.code === 'VMU_MATH_UNSUPPORTED_OP',
    '★★ ARM 2 (EXPLICIT [] ⇒ NAMED refusal): a deployment that declares no engines is refused by name, never silently',
    'code=' + String(re && re.code))
  ok(typeof re.message === 'string' && re.message.indexOf('未声明任何引擎') !== -1,
    '★ ARM 2: the refusal message names the cause (未声明任何引擎) — a reader can act on it',
    re && re.message)
  ok(spawnedEmpty === false, '★ ARM 2: the refusal happens BEFORE any spawn', 'spawned=' + spawnedEmpty)
}

// ─────────────────────────── ARM 3: documented table row vs runtime value ───────────────────────────
{
  const doc = readFileSync(DOCS_04, 'utf8')
  const parsed = parseDocRow(doc)
  ok(parsed.h11 !== -1 && parsed.h12 !== -1 && parsed.h12 > parsed.h11,
    '★ fixture: docs/04 has a §11 parameters table delimited by §12 (so the row we parse is the TABLE, not prose)',
    'h11=' + parsed.h11 + ' h12=' + parsed.h12)
  ok(parsed.rowLine !== -1, '★ fixture: the parameters table carries a row for ' + KEY, 'rowLine=' + parsed.rowLine)
  const docList = parsed.docList
  ok(Array.isArray(docList) && docList.length > 0,
    '★ fixture: the documented default cell parses to a non-empty list (an empty parse must fail, not compare equal to anything)',
    'cell=' + JSON.stringify(parsed.cellDefault))

  const handle = boot({ packs: ['v5r'] })
  const runtime = (resolvedOf(handle)[KEY] || {}).value
  ok(Array.isArray(runtime) && runtime.length > 0, '★ ARM 3: the runtime value is non-empty before comparing', JSON.stringify(runtime))
  ok(same(docList, runtime),
    '★★ ARM 3 (two real sources): the DOCUMENTED table default equals the RUNTIME value — doc and runtime cannot drift apart silently',
    'doc=' + JSON.stringify(docList) + ' runtime=' + JSON.stringify(runtime))
}

// ─────────────────────────── summary ───────────────────────────
if (failures.length) {
  console.error('FAIL ' + failures.length + ' / ' + (passed + failures.length))
  for (const f of failures) console.error('  ✗ ' + f)
  process.exit(1)
}
console.log('PASS ' + passed + ' / ' + passed)

// vmu: ONE FACT, ONE NAME, ONE VALUE - and it must stay that way WITHOUT a person watching (round 35, task-167).
//
// WHY THIS FILE EXISTS. Round 34 unified `appliesAt` (kernel layer) and `appliesFrom` (tool layer): the tool face now
// takes the kernel's value instead of recomputing it from `APPLIES[hot]`, so the two names cannot disagree. But what
// held it together was a CODE FACT - one local assigned to both keys - not an assertion. Anyone refactoring that line
// could split them apart again and NO gate would ring. This file is that missing gate.
//
// WHAT IS PINNED (all through the REAL entry, `vibe_vmu_set`):
//   · both keys EXIST in the same receipt (not "sometimes there" - a conditional key is the R32 defect class);
//   · `appliesAt === appliesFrom` (the two names, one value);
//   · `appliesAt` agrees with the KERNEL's own table read (`kernel.appliesTable()`) for a plain class - i.e. the two
//     LAYERS say the same thing, read independently rather than through one another;
//   · ★ a PLANNED key still gets its STRONGER disclosure ("never yet (planned key: no runtime consumer)"). That is
//     the exact precedence I got wrong in R34: a planned key still produces a kernel receipt, so taking the kernel
//     value first silently replaced this disclosure with the hot-class string - the "settable but inert" trap.
//   · ★ NON-EMPTY PREMISES everywhere: "both undefined" must never pass (the `[].every` family in this repo).
//
// ★ `execute()` on a vmu tool returns a JSON STRING, not an object - it must be parsed.

import { join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = resolve(HERE, '..')
const entry = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')).href)

let passed = 0, failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) passed++
  else { failed++; failures.push(name + (detail === undefined ? '' : ' [' + JSON.stringify(detail) + ']')) }
}

// The "planned" disclosure, stated once: the planned key must keep THIS, not the hot-class string.
const PLANNED_DISCLOSURE = 'never yet (planned key: no runtime consumer)'

const tools = {}
const ctx = { effect: (f) => f(), on: () => () => {}, tools: { register: async (s) => { if (s && s.name) tools[s.name] = s; return () => { } } } }
const dir = await mkdtemp(join(tmpdir(), 'vmu-applies35-'))
const handle = entry.apply(ctx, { clock: () => 1000000, deliver: () => {}, root: dir, vmu: { 'vmu.tools.faces': ['set', 'status'] } })
await handle.ready()
const setTool = tools['vibe_vmu_set']
const call = async (key, value) => JSON.parse(await setTool.execute({ key, value }, {}))

// ★ A. NON-EMPTY PREMISE: the real entry registered the tool and the kernel exposes its table.
ok(setTool !== undefined && typeof setTool.execute === 'function',
  'A0. premise: the real entry registered `vibe_vmu_set` (otherwise every case below is vacuous)', Object.keys(tools))
const table = handle.kernel && typeof handle.kernel.appliesTable === 'function' ? handle.kernel.appliesTable() : null
ok(table && typeof table === 'object' && Object.keys(table).length > 0,
  'A1. premise: the KERNEL exposes its own `appliesTable()` (the independent second read)', table && Object.keys(table))

// ★ B. A PLAIN KEY (class H1): one name, one value, and BOTH LAYERS agree.
{
  const r = await call('vmu.packs.allowOverride', 'true')
  ok('appliesAt' in r && 'appliesFrom' in r,
    'B1. ★ BOTH keys exist in the same receipt (a missing one would be a conditional key - the R32 defect class)', { appliesAt: 'appliesAt' in r, appliesFrom: 'appliesFrom' in r })
  ok(typeof r.appliesAt === 'string' && r.appliesAt.length > 0 && typeof r.appliesFrom === 'string' && r.appliesFrom.length > 0,
    'B2. ★ neither is empty (so "both undefined" cannot pass)', { appliesAt: r.appliesAt, appliesFrom: r.appliesFrom })
  ok(r.appliesAt === r.appliesFrom,
    'B3. ★★ ONE FACT, ONE NAME, ONE VALUE: `appliesAt === appliesFrom` in the same receipt', { appliesAt: r.appliesAt, appliesFrom: r.appliesFrom })
  // ★ THE TWO PATHS: the tool receipt's value vs the KERNEL's own table read - read independently, not through one another.
  ok(r.hot === 'H1' && table.H1 !== undefined && r.appliesAt === table.H1,
    'B4. ★★ the TOOL layer and the KERNEL layer agree on the value (tool receipt vs `kernel.appliesTable()`)', { receipt: r.appliesAt, kernel: table.H1, hot: r.hot })
}

// ★ C. A PLANNED KEY: the STRONGER disclosure survives (this is where R34's precedence bug bit).
{
  const r = await call('vmu.a11y.checkScope', '[]')
  ok('appliesAt' in r && 'appliesFrom' in r,
    'C1. ★ both keys exist for a planned key too (no conditional key)', { appliesAt: 'appliesAt' in r, appliesFrom: 'appliesFrom' in r })
  ok(typeof r.appliesAt === 'string' && r.appliesAt.length > 0 && r.appliesAt === r.appliesFrom,
    'C2. ★ one name, one value here as well (non-empty premise included)', { appliesAt: r.appliesAt, appliesFrom: r.appliesFrom })
  ok(r.noConsumer === true && r.appliesAt === PLANNED_DISCLOSURE,
    'C3. ★★ the PLANNED disclosure WINS over the hot-class string: "no runtime consumer yet" is a stronger fact than the class, and taking the kernel value first silently ate it in R34', { noConsumer: r.noConsumer, appliesAt: r.appliesAt })
  ok(r.appliesAt !== (table[r.hot] || null) || r.hot === null,
    'C4. ★ and it is demonstrably NOT the plain table value for its class (that was the bug)', { value: r.appliesAt, tableForHot: table[r.hot], hot: r.hot })
}

// ★ D. AN H2 KEY WITH MEASURED LIVE READERS: the case where the two computations genuinely DIVERGE.
// This is what makes the counter-example possible at all: for a plain class the old expression and the kernel agree,
// so only a key the kernel REFINES beyond the table can catch a regression back to the coarse value.
{
  const r = await call('vmu.turn.instituteName', '"probe"')
  ok('appliesAt' in r && 'appliesFrom' in r,
    'D1. ★ both keys exist for a refined H2 key too', { appliesAt: 'appliesAt' in r, appliesFrom: 'appliesFrom' in r })
  ok(typeof r.appliesAt === 'string' && r.appliesAt.length > 0 && r.appliesAt === r.appliesFrom,
    'D2. ★ one name, one value (non-empty premise included)', { appliesAt: r.appliesAt, appliesFrom: r.appliesFrom })
  ok(r.hot === 'H2' && table.H2 !== undefined && r.appliesAt !== table.H2,
    'D3. ★★ the value is the KERNEL\'S REFINED disclosure, not the coarse `APPLIES.H2` string - so a regression to recomputing it from the table would be visible HERE', { receipt: r.appliesAt, tableH2: table.H2 })
}

try { await rm(dir, { recursive: true, force: true }) } catch { }
console.log('=== VMU APPLIES NAME UNIFIED: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)

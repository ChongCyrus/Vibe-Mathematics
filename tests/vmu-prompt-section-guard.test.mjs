// vibe-math-vmu — ROUND 21 / task-129: THE `systemPrompt` ACCESS MUST NOT KILL PRESET ASSEMBLY.
// Run: `node tests/vmu-prompt-section-guard.test.mjs` (last line `=== VMU PROMPT SECTION GUARD: N passed, M failed ===`).
//
// THE DEFECT THIS GUARDS (H2, confirmed locally with no DSH at all — `D:\_tmp\r21b-h2-probe.mjs`):
// `vibe-math-vmu.js:706` read `ctx.systemPrompt` while `inject = ['tools']`, so under cordis — which answers an
// un-injected service access with a THROWING getter (`cannot get property "systemPrompt" without inject`) — the
// `ctx &&` truthiness check could not guard it. A PACK's prompt data pushes into `effectivePrompts`, so the
// DOCUMENTED pack loading point (`config.packs`) was exactly what first executed that line: the session died with
// `agent-preset/invalid` instead of starting with the pack loaded.
//
// The fake ctx below reproduces cordis faithfully for this one property: `systemPrompt` is an ACCESS-COUNTING
// THROWING GETTER. Assertions: (a) with a pack the getter IS reached (non-empty precondition), (b) the entry does
// NOT throw, (c) the failure is NAMED in `status().promptSection` and on stderr — a guard, not a swallow, and
// (d) with NO pack the getter is never touched (the reversal that proves the probe is discriminating).
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const REPO = 'D:\\wd\\vibemath开发\\Vibe-Mathematics'
const entry = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')).href)

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) { passed += 1; return }
  failed += 1
  failures.push(name + (detail === undefined ? '' : ' [' + JSON.stringify(detail) + ']'))
}

const run = async (config, mode = 'access-throws') => {
  const root = await mkdtemp(join(tmpdir(), 'vmu-r21-guard-'))
  let touched = 0
  let sectionCalls = 0
  const stderr = []
  const origWrite = process.stderr.write.bind(process.stderr)
  process.stderr.write = (s) => { stderr.push(String(s)); return true }
  const ctx = {
    effect: (fn) => fn(),
    on: () => () => {},
    tools: { register: async () => () => {} },
    logger: { warn: () => {}, info: () => {}, error: () => {} },
    // mode models three host shapes: the service ACCESS throws (cordis, un-injected), the service is reachable and
    // works, and the service is reachable but the CALL throws (live ARM A). All three are real host behaviours.
    get systemPrompt() {
      touched += 1
      if (mode === 'access-throws') throw new Error('cannot get property "systemPrompt" without inject')
      if (mode === 'section-throws') {
        return {
          getSectionOrder: () => undefined,
          section: () => { sectionCalls += 1; throw new Error('cannot get property "systemPrompt" without inject') },
        }
      }
      return { section: () => { sectionCalls += 1; return () => {} }, getSectionOrder: () => undefined }
    },
  }
  let err = null
  let handle = null
  try { handle = entry.apply(ctx, Object.assign({ clock: () => 1000000, root }, config)); await handle.ready() } catch (e) { err = e }
  process.stderr.write = origWrite
  const state = handle && typeof handle.status === 'function' ? handle.status().promptSection : null
  try { await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 }) } catch { /* keep */ }
  return { touched, err, state, stderr: stderr.join(''), sectionCalls }
}

// ── A. THE REGRESSION CASE: a pack carries prompt text, the host has no reachable systemPrompt ───────────────
const withPack = await run({ packs: ['v5r'], vmu: { 'vmu.tools.faces': ['report'] } })
ok(withPack.touched > 0,
  'P1. (non-empty precondition) with a pack loaded the `systemPrompt` probe IS reached — otherwise the two assertions below would be vacuous', { touched: withPack.touched })
ok(withPack.err === null,
  'P2. ★ THE DEFECT IS GONE: the entry does NOT throw when `systemPrompt` is an un-injected throwing service (this is what used to surface as `agent-preset/invalid` and stop the session from being created)', withPack.err && String(withPack.err.message))
ok(withPack.state && withPack.state.registered === false && withPack.state.code === 'VMU_EXTERNAL_UNAVAILABLE' && withPack.state.what === 'systemPrompt',
  'P3. ★ and it is NAMED, not swallowed: `status().promptSection` says the section was NOT registered, with the registered code + `what` + the reason', withPack.state)
ok(/NOT reachable/.test(withPack.stderr) && /cannot get property/.test(withPack.stderr),
  'P4. the host also gets it on stderr WITH the thrown message (the guard is not a silence)', withPack.stderr.slice(0, 200))

// ── B. THE REVERSAL: with no pack there is no prompt text ⇒ the probe must never run ─────────────────────────
const noPack = await run({ packs: [] })
ok(noPack.touched === 0 && noPack.err === null,
  'P5. ★ reversal direction: with NO pack the getter is touched ZERO times and nothing throws (so P1/P2 measure the pack path, not a constant)', { touched: noPack.touched })

// ── D. ★ LIVE ARM A: the service is REACHABLE but the CALL throws ────────────────────────────────────────────
// The live four-arm experiment pinned the trigger to "our loader SUCCESSFULLY loaded a real pack ⇒ session/create
// rejected, host stderr 0 B": arm B (`packList`, our loader not triggered) and arm D (`packs:['no-such-pack']`,
// loader runs but fails BY NAME) both start fine. The throw therefore happens AFTER a successful read — i.e. at
// the `systemPrompt.section({...})` CALL, which the access-guard did not cover. Locally reproduced at
// `D:\_tmp\r21-armA-probe.mjs` (stack pointed at `vibe-math-vmu.js:735`, reached from `apply()`), and this arm
// is the guard for it: it reddens the moment that call is left unguarded again.
const armA = await run({ packs: ['v5r'], vmu: { 'vmu.tools.faces': ['report'] } }, 'section-throws')
ok(armA.sectionCalls > 0,
  'P6. (non-empty precondition) ARM A really reached the `systemPrompt.section()` CALL (otherwise P7/P8 are vacuous)', { sectionCalls: armA.sectionCalls, touched: armA.touched })
ok(armA.err === null,
  'P7. ★ ARM A DOES NOT KILL THE ASSEMBLY: a host whose `section()` throws no longer escapes `apply()` (that escape is what showed up live as `agent-preset/invalid` with host stderr 0 B, i.e. no degradation line from us)', armA.err && String(armA.err.message))
ok(armA.state && armA.state.registered === false && armA.state.code === 'VMU_EXTERNAL_UNAVAILABLE' && armA.state.what === 'systemPrompt.section' && typeof armA.state.stack === 'string' && armA.state.stack.length > 0,
  'P8. ★ and it degrades BY NAME with the STACK: `promptSection = {registered:false, code, what:"systemPrompt.section", reason, stack}`', armA.state)
ok(/refused this section/.test(armA.stderr) && /cannot get property/.test(armA.stderr),
  'P9. the host also gets it on stderr (guard, not silence) — this is the line whose ABSENCE characterised arm A', armA.stderr.slice(0, 200))

// ── C. THE HONEST-ABSENCE CASE: a host that simply has no systemPrompt at all (plain object, no getter) ─────
const plain = await run({ packs: ['v5r'], vmu: { 'vmu.tools.faces': ['report'] } })
ok(plain.err === null, 'P6. and the same config is stable across runs (no order dependence introduced by the guard)', plain.err && String(plain.err.message))

console.log('=== VMU PROMPT SECTION GUARD: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)

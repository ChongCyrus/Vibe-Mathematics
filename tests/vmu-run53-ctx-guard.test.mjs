#!/usr/bin/env node
// vmu RUN 53 — THE PLUGIN CONTEXT IS GUARDED: A READ THAT IS REFUSED IS "NO SESSION ID", NEVER A CRASH.
//
// THE OBSERVED DEFECT (live machine, run 53, before the first turn ran): `session/create` answered
//   agent-preset/invalid — vibe-math-vmu: cannot get property "sessionId" without inject
// and the drive died with an empty transcript. Round 52 added `kernelSession: ctx.sessionId` to the assembly so the
// status board could name WHICH kernel resolved a setting value; the unit tests passed because they hand `apply()` a
// plain object that answers every property. The framework hands it a GUARDED context that throws for anything the
// plugin did not declare in `inject`, so the very assembly that carries the new seam could not be constructed.
//
// WHAT THIS SUITE PROVES:
//   1. a context that REFUSES `sessionId` still assembles, and the board says the resolution is this kernel's without
//      naming it (an unnamed kernel is a fact, not an error);
//   2. a context that ANSWERS with a session id is named in the board line and in `settings.resolvedIn`;
//   3. a context that answers nothing directly but holds EXACTLY ONE live session is named from that store; two live
//      sessions are NOT guessed between (a wrong name is worse than no name);
//   4. the refusal itself is caught where it happens: `apply()` returns a working handle instead of throwing.
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')
const entry = await import(pathToFileURL(ENTRY).href)

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const plainCtx = () => ({
  effect(fn) { return fn() },
  on() { return () => {} },
  tools: { register: async () => () => {} },
})

/**
 * The framework's guard, reproduced from the measured failure: `sessionId` is a VALUE the plugin did not declare in
 * `inject`, so READING it throws. The context API itself (`effect`/`on`/`tools`/`get`) is present — the live run's
 * failure was the value read, not the API (`ctx.get` did not throw there, which is why only this property is guarded).
 */
const guardedCtx = ({ sessionId, sessions } = {}) => {
  const base = plainCtx()
  base.get = (key) => (key === 'sessions' && sessions !== undefined ? sessions : null)
  return new Proxy(base, {
    get(target, prop) {
      if (prop === 'sessionId') {
        if (sessionId === undefined) throw new TypeError('cannot get property "sessionId" without inject')
        return sessionId
      }
      if (prop in target) return target[prop]
      throw new TypeError('cannot get property "' + String(prop) + '" without inject')
    },
    has(target, prop) { return prop in target },
  })
}

const boot = async (ctx, config = {}) => {
  const handle = entry.apply(ctx, Object.assign({ clock: () => 1000, packs: ['v5r'] }, config))
  await handle.ready()
  return handle
}

const dir = await mkdtemp(join(tmpdir(), 'vmu-run53-ctx-'))
try {
  // ── 1: a REFUSED read must not break the assembly ───────────────────────────────────────────────────────────
  {
    let threw = null
    let handle = null
    try { handle = await boot(guardedCtx({}), { root: dir }) } catch (e) { threw = e }
    ok(threw === null, 'a context that refuses `sessionId` still assembles (no throw out of apply)', threw && String(threw.message))
    if (handle) {
      const st = handle.kernel.status({ detail: 'settings' })
      ok(st && st.settings && st.settings.resolvedIn && st.settings.resolvedIn.kernelSession === null, 'the receipt says this kernel has no name', st && st.settings && st.settings.resolvedIn)
      ok(typeof st.settings.resolvedInMeans === 'string' && st.settings.resolvedInMeans.includes('without a session id'), 'the receipt explains what the unnamed map is', st.settings.resolvedInMeans)
    }
  }

  // ── 2: an ANSWERED id is named in the receipt ───────────────────────────────────────────────────────────────
  {
    const handle = await boot(guardedCtx({ sessionId: 'session-kernel-53' }), { root: dir })
    const st = handle.kernel.status({ detail: 'settings' })
    ok(st.settings.resolvedIn.kernelSession === 'session-kernel-53', 'a context that answers names the kernel', st.settings.resolvedIn)
    ok(String(st.settings.resolvedInMeans).includes('own'), 'the receipt states what the map is evidence about', st.settings.resolvedInMeans)
  }

  // ── 3: the one-live-session fallback, and the refusal to choose between two ─────────────────────────────────
  {
    const one = { list: () => [{ id: 'session-only-live' }] }
    const handle = await boot(guardedCtx({ sessions: one }), { root: dir })
    ok(handle.kernel.status({ detail: 'settings' }).settings.resolvedIn.kernelSession === 'session-only-live',
      'exactly one live session names the kernel (no id is invented)', handle.kernel.status({ detail: 'settings' }).settings.resolvedIn)

    const two = { list: () => [{ id: 'session-a' }, { id: 'session-b' }] }
    const handle2 = await boot(guardedCtx({ sessions: two }), { root: dir })
    ok(handle2.kernel.status({ detail: 'settings' }).settings.resolvedIn.kernelSession === null,
      'two live sessions are NOT guessed between', handle2.kernel.status({ detail: 'settings' }).settings.resolvedIn)
  }

  // ── 4: the ordinary plain-object context still works (the shape the unit tests use) ─────────────────────────
  {
    const ctx = plainCtx()
    ctx.sessionId = 'session-plain'
    const handle = await boot(ctx, { root: dir })
    ok(handle.kernel.status({ detail: 'settings' }).settings.resolvedIn.kernelSession === 'session-plain',
      'a plain context with an id keeps working', handle.kernel.status({ detail: 'settings' }).settings.resolvedIn)
  }
} finally {
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => {})
}

console.log('')
if (failed === 0) console.log('=== VMU RUN 53 CTX GUARD: ' + passed + ' passed, 0 failed ===')
else { console.log('=== VMU RUN 53 CTX GUARD: ' + passed + ' passed, ' + failed + ' failed ==='); for (const f of failures) console.log('  - ' + f); process.exitCode = 1 }

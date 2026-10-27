#!/usr/bin/env node
// tests/vmu-run46-readface.test.mjs — ROUND 46: TWO READ FACES THAT DISAGREED ABOUT THE SAME FACT.
//
// MEASURED ON THE REAL MACHINE (run 46, build 71a837c2):
//   · A refused a mute that had EXPIRED. `vibe_vmu_chat { action:"mute", member:"r-1", by:"r-acad",
//     durationMs:600000 }` returned `muted:["r-1"]`, and ~500s after `until` the office read
//     `vibe_vmu_chat { action:"status" }` and STILL got `muted:["r-1"]` — while a `send` by that member
//     succeeded (the gate consults `until`). Two faces of one fact disagreed: the enforcement said
//     "expired", the readout said "muted". The row is only pruned lazily by a later send.
//   · The refusal that names the wrong way out. `vibe_vmu_meeting { action:"open", id:"m-pr46",
//     kind:"debate" }` correctly refused `kind` (it is the BALLOT kind on that face) — then its hint
//     told the caller to use `vibe_v5_meeting {action:"open", kind:"debate", subject:"…"}`, a shape that
//     does not exist on the service face (that face takes `type`, `agenda`, `member`, no `action`).
//     A hint that names an impossible call is worse than no hint: the caller tries it and gets a second
//     refusal for a reason the first hint invented.
//   · A message with two languages in one sentence. The delegated-decide refusal read
//     "…which is not an approver, but 被代办者不是审批角色 — the decision would be ATTRIBUTED …": the
//     English half says what happened, the Chinese fragment was a leftover from the lane that wrote it,
//     and the sentence has no grammatical joint. The product surface speaks one language; a receipt is
//     read by a model AND printed to a person.
//
// WHAT THIS SUITE PINS: (1) `status.muted` lists the mutes IN FORCE, not every row ever written; the
// expired row is still in the book (the ledger is not rewritten) and `send` still agrees with the gate;
// (2) a no-expiry mute (`until:0`) keeps being listed after the clock moves; (3) the primitive-open
// refusal's hint names the SERVICE face with its REAL shape; (4) the delegated-decide refusal contains
// no CJK characters in the sentence it leads with.
//
// Run:  node tests/vmu-run46-readface.test.mjs
import { mkdtemp, rm } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const VMU = join(REPO, 'vibe-math-vmu')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + label); return true }
  failed += 1
  failures.push(label + (detail === undefined ? '' : ' — ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' — ' + JSON.stringify(detail)))
  return false
}
const J = (o) => JSON.stringify(o)

const entry = await import(pathToFileURL(join(VMU, 'vibe-math-vmu.js')).href)
let NOW = 1_000_000
const boot = async (config = {}) => {
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, Object.assign({ clock: () => NOW }, config))
  await handle.ready()
  return { handle, kernel: handle.kernel, spec: (n) => state.specs.find((s) => s.name === n) }
}
// The kernel-core faces (vibe_vmu_chat / vibe_vmu_meeting) are built by `tools/*.js` factories; construct
// them over the SAME kernel the entry created, so a test drives the face an agent drives (run 45's
// meeting-parity suite does the same).
const TOOL_NAMES = { meeting: 'vibe_vmu_meeting', minutes: 'vibe_vmu_minutes', chat: 'vibe_vmu_chat', mailbox: 'vibe_vmu_mailbox', panel: 'vibe_vmu_panel' }
const param = (type, description, extra = {}) => Object.assign({ type, required: false, description }, extra)
const refused = (code, message, hint) => ({ ok: false, code, message, hint: hint || null })
const face = async (b, name) => {
  const mod = await import(pathToFileURL(join(VMU, 'tools', name + '.js')).href)
  const make = mod['make' + name.charAt(0).toUpperCase() + name.slice(1) + 'Spec']
  return make({ param, refused, TOOL_NAMES, kernel: b.kernel })
}
const call = async (spec, args = {}) => {
  try {
    const r = await spec.run(args)
    return r
  } catch (e) {
    return Object.assign({ ok: false, THREW: true }, e && typeof e === 'object' ? { code: e.code, message: String(e.message || e), hint: e.hint } : {})
  }
}

const roots = []
const freshRoot = async () => {
  const r = await mkdtemp(join(tmpdir(), 'vmu-run46-readface-'))
  roots.push(r)
  return r
}

try {
  // ══ §1 THE EXPIRY READ FACE (the measured defect) ═══════════════════════════════════════════════════════
  {
    const root = await freshRoot()
    const b = await boot({ root, 'vmu.chat.admins': ['office'] })
    const chat = await face(b, 'chat')
    NOW = 1_000_000
    const mute = await call(chat, { action: 'mute', member: 'r-1', by: 'office', durationMs: 1000, reason: 'run46 replay' })
    ok(mute.ok === true && Array.isArray(mute.muted) && mute.muted.includes('r-1'),
      'setup: the mute receipt names r-1 as muted now', mute && mute.muted)
    const until = mute.until
    ok(Number.isFinite(until) && until > NOW, 'setup: the receipt carries the instant the mute ends', until)
    console.error('DEBUG immediate book', JSON.stringify(b.kernel.chat.snapshot().data.mutes))

    // INSIDE the window both faces agree.
    NOW = until - 1
    const during = await call(chat, { action: 'status', by: 'office' })
    ok(J(during.muted) === J(['r-1']), 'inside the window status.muted still names r-1', during.muted)

    // OUTSIDE the window: the read face must agree with the gate (run 46 read ["r-1"] here).
    NOW = until + 500 * 1000
    const after = await call(chat, { action: 'status', by: 'office' })
    ok(J(after.muted) === J([]),
      '★★★ R46a: past `until`, status.muted lists NOBODY (the run-46 read kept naming the expired member)',
      after.muted)
    ok(typeof after.mutedMeans === 'string' && after.mutedMeans.indexOf('until') !== -1,
      '…and the readout says what it counts (rows past `until` are not listed)', after.mutedMeans)

    // The ledger keeps the row: the readout is a VIEW, not a silent delete.
    const snap = b.kernel.chat.snapshot()
    const book = (snap && snap.data && snap.data.mutes) || {}
    const row = book['r-1']
    console.error('DEBUG book', JSON.stringify(book), 'until', until)
    ok(!!row && row.until === until,
      'the row is still in the book (the readout filters, it does not rewrite history)', row)

    // The gate and the readout now tell one story: the same member may speak.
    const send = await call(chat, { action: 'send', by: 'r-1', text: 'expired mute, may I speak' })
    ok(send.ok === true, 'the gate agrees: the expired member speaks right after the readout says unmuted', send && (send.code || send.ok))

    // …and the receipt of a LATER mute lists the live book, not the stale row.
    NOW += 1000
    const again = await call(chat, { action: 'mute', member: 'r-2', by: 'office', durationMs: 600000 })
    ok(J(again.muted) === J(['r-2']), 'a later mute receipt lists only the live mute (not the expired r-1 row)', again.muted)
    await b.handle.dispose ? await b.handle.dispose() : null
  }

  // ══ §2 NO-EXPIRY MUTE IS LISTED FOREVER (until:0 is a decision, not a bug) ═══════════════════════════════
  {
    const root = await freshRoot()
    const b = await boot({ root, 'vmu.chat.admins': ['office'] })
    const chat = await face(b, 'chat')
    NOW = 5_000_000
    const mute = await call(chat, { action: 'mute', member: 'r-3', by: 'office', durationMs: 0, reason: 'permanent' })
    ok(mute.ok === true && mute.until === 0, 'a duration-0 mute is "no expiry" and the receipt says until:0', mute && mute.until)
    NOW = 5_000_000 + 86_400_000
    const st = await call(chat, { action: 'status', by: 'office' })
    ok(J(st.muted) === J(['r-3']), 'a no-expiry mute is still listed a day later', st.muted)
    const send = await call(chat, { action: 'send', by: 'r-3', text: 'may I speak' })
    ok(send.ok === false && send.code === 'VMU_CHAT_MUTED', '…and the gate still refuses it (both faces agree)', send && send.code)
    await b.handle.dispose ? await b.handle.dispose() : null
  }

  // ══ §3 THE HINT THAT NAMED AN IMPOSSIBLE CALL (service face's real shape) ════════════════════════════════
  {
    const root = await freshRoot()
    const b = await boot({ root })
    const meeting = await face(b, 'meeting')
    const refusal = await call(meeting, { action: 'open', id: 'm-r46-hint', kind: 'debate', subject: '定向复验' })
    ok(refusal.ok === false && refusal.code === 'VMU_INVALID_ARGUMENT',
      'the primitive `open` still refuses `kind` by name', refusal && (refusal.code || refusal.ok))
    const hint = String(refusal.hint || '')
    ok(hint.indexOf('type:"debate"') !== -1,
      '★★★ R46b: the hint names the SERVICE face with its REAL shape (`type:"debate"`)', hint.slice(0, 200))
    ok(hint.indexOf('vibe_v5_meeting {action:"open", kind:"debate"') === -1,
      '…and no longer tells the caller to send a shape that face does not accept',
      hint.indexOf('vibe_v5_meeting {action:"open", kind:"debate"'))
    ok(hint.indexOf('agenda') !== -1, '…it also names the field the service face actually takes for the topic', hint.slice(0, 200))
    await b.handle.dispose ? await b.handle.dispose() : null
  }

  // ══ §4 ONE LANGUAGE IN A REFUSAL SENTENCE ════════════════════════════════════════════════════════════════
  {
    const src = readFileSync(join(VMU, 'tools', 'human.js'), 'utf8')
    const start = src.indexOf('const named = delegate.role === null')
    const end = src.indexOf('enforced: [key],', start)
    ok(start !== -1 && end !== -1, 'setup: the delegated-decide refusal is locatable in the face source', { start, end })
    const block = src.slice(start, end)
    ok(!/[\u3400-\u9fff]/.test(block),
      '★★★ R46c: the delegated-decide refusal sentence carries no CJK fragment (run 46 read "but 被代办者不是审批角色")',
      block.match(/[\u3400-\u9fff]+/g))
    ok(block.indexOf('the DELEGATE is not an approver') !== -1,
      '…the English sentence says it outright', block.indexOf('the DELEGATE is not an approver'))
  }
} finally {
  for (const r of roots) { try { await rm(r, { recursive: true, force: true, maxRetries: 3 }) } catch {} }
}

console.log('\n=== VMU RUN 46 READ FACES: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.log('\nFAILURES:'); for (const f of failures) console.log('  · ' + f); process.exit(1) }

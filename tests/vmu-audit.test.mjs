// tests/vmu-audit.test.mjs — independent test for kernel/audit.js (batch-1 slice 6).
// Scenarios: append-only (no mutate/delete entry), redaction BEFORE store, named write failure,
// counted ring drops, injected clock determinism, zero-config, read-only views.
import { createAudit, DEFAULT_REDACT_KEYS } from '../vibe-math-vmu/kernel/audit.js'

let pass = 0, fail = 0
const ok = (cond, label) => { if (cond) { pass++ } else { fail++; console.log('FAIL ' + label) } }
const throws = (fn) => { try { fn(); return { threw: false } } catch (e) { return { threw: true, code: e && e.code, hint: e && e.hint, what: e && e.what } } }

// 1) append-only surface: no mutate/delete/update entry points are exported
{
  const a = createAudit({ clock: () => 1 })
  const names = Object.keys(a)
  ok(!names.includes('update') && !names.includes('delete') && !names.includes('remove') && !names.includes('splice'), 'no mutate/delete entry point')
  ok(typeof a.append === 'function' && typeof a.tail === 'function' && typeof a.query === 'function', 'public surface present')
}

// 2) redaction happens BEFORE store: plaintext never appears in tail()/export()
{
  const a = createAudit({ clock: () => 1000 })
  a.append({ what: 'auth', token: 'SECRET-XYZ', nested: { password: 'pw-1' }, note: 'ok' })
  const t = a.tail({ limit: 5 })
  const s = JSON.stringify(t.items)
  ok(!s.includes('SECRET-XYZ') && !s.includes('pw-1'), 'secrets absent from stored rows')
  ok(s.includes('[redacted]'), 'secrets replaced by [redacted]')
  ok(JSON.stringify(a.export({ format: 'jsonl' }).text).includes('[redacted]'), 'export shows redacted text only')
  ok(Array.isArray(DEFAULT_REDACT_KEYS) && DEFAULT_REDACT_KEYS.includes('authorization'), 'default redact keys')
}

// 3) named write failure: sink refusal ⇒ VMU_AUDIT_WRITE_FAILED (never swallowed)
{
  const a = createAudit({ clock: () => 1, sink: () => false })
  const r = throws(() => a.append({ what: 'error', msg: 'x' }))
  ok(r.threw && r.code === 'VMU_AUDIT_WRITE_FAILED' && !!r.hint, 'sink false ⇒ named failure + hint')
  const a2 = createAudit({ clock: () => 1, sink: { write() { throw new Error('disk full') } } })
  const r2 = throws(() => a2.append({ what: 'error' }))
  ok(r2.threw && r2.code === 'VMU_AUDIT_WRITE_FAILED', 'sink throw ⇒ named failure')
  ok(a.status().rows === 0 || a.status().rows === undefined ? true : a.status().rows === 0, 'failed row did not enter the ring')
}

// 4) counted ring drops
{
  const a = createAudit({ clock: () => 7, ringMax: 3 })
  for (let i = 0; i < 5; i++) a.append({ what: 'update', i })
  const t = a.tail({ limit: 10 })
  ok(t.total === 3 && t.dropped === 2, 'ring keeps 3, dropped counted = 2')
  ok(a.status().dropped === 2, 'status reports dropped')
}

// 5) injected clock determinism (no real time)
{
  const a = createAudit({ clock: () => 4242 })
  a.append({ what: 'create' })
  ok(a.tail({ limit: 1 }).items[0].at === 4242, 'rows carry injected clock time')
}

// 6) zero-config never throws
{
  const a = createAudit()
  a.append({ what: 'create' })
  a.append({ what: 'custom-what-not-in-vocab' })
  ok(a.status().rows === 2 && a.status().sink === 'memory-only', 'zero-config appends without sink')
}

// 7) read-only views do not mutate
{
  const a = createAudit({ clock: () => 9, ringMax: 10 })
  a.append({ what: 'vote' })
  const before = JSON.stringify({ t: a.tail(), q: a.query({ what: 'vote' }), s: a.status(), v: a.verify() })
  a.tail(); a.query({ what: 'vote' }); a.status(); a.verify(); a.export()
  ok(JSON.stringify({ t: a.tail(), q: a.query({ what: 'vote' }), s: a.status(), v: a.verify() }) === before, 'reads are side-effect free')
}

// 8) query filters + reports unknown `what`
{
  const a = createAudit({ clock: () => 1 })
  a.append({ what: 'vote' }); a.append({ what: 'assign' })
  ok(a.query({ what: 'vote' }).items.length === 1, 'query filters by what')
  ok(a.query({ what: 'weird' }).unknownWhat === 'weird', 'unknown what is reported')
}

// 9) rotate keeps history accounting (never silently loses rows)
{
  // INTEGRATOR NOTE: the injected key was renamed to the DECLARED 07 §4.3 name. The module used to read a
  // retention.keepEvery key that no volume owns; one knob must have exactly one name.
  const a = createAudit({ clock: () => 1, ringMax: 100, settings: { 'vmu.records.retention.keepEvery': 2 } })
  for (let i = 0; i < 6; i++) a.append({ what: 'update', i })
  const r = a.rotate()
  ok(r.kept === 3 && r.removed === 3, 'rotate keeps every 2nd and counts removals')
  ok(a.status().dropped === 3, 'rotate removals counted as dropped')
}

// 10) verify(): monotonically increasing seq
{
  const a = createAudit({ clock: () => 1 })
  a.append({ what: 'create' }); a.append({ what: 'update' })
  const v = a.verify()
  ok(v.ok === true && v.lastSeq > v.firstSeq, 'verify reports monotonic seq')
}

// 11) missing `what` ⇒ named failure
{
  const a = createAudit({ clock: () => 1 })
  const r = throws(() => a.append({}))
  ok(r.threw && r.code === 'VMU_AUDIT_WRITE_FAILED', 'append without what refuses by name')
}

// 12) sink is the only persistence path (module has no fs import)
{
  const src = (await import('node:fs')).readFileSync(new URL('../vibe-math-vmu/kernel/audit.js', import.meta.url), 'utf8')
  ok(!/from 'node:fs'|require\('fs'\)|from "node:fs"/.test(src), 'audit.js does not import fs')
  const written = []
  const a = createAudit({ clock: () => 1, sink: (row) => { written.push(row); return true } })
  a.append({ what: 'vote' })
  ok(written.length === 1 && written[0].what === 'vote', 'injected sink receives rows')
}

// task-194: `vmu.audit.retentionDays` is READ FOR REAL and CHANGES BEHAVIOUR (the docs audit had caught it
// as "claimed wired, no runtime source reads it"). Retention 0/absent ⇒ nothing is ever aged out.
{
  // (a) absent / 0 / negative / NaN ⇒ retention DISABLED (zero-mechanism unchanged)
  for (const settings of [{}, { 'vmu.audit.retentionDays': 0 }, { 'vmu.audit.retentionDays': -3 }, { 'vmu.audit.retentionDays': 'nope' }]) {
    const a = createAudit({ clock: () => 1000, settings })
    a.append({ what: 'create', id: 'x' })
    const r = a.expire({ at: 1000 + 400 * 86400000 })
    ok(a.status().policy.retentionDays === 0 && r.expired === 0 && a.status().rows === 1 && a.status().expired === 0,
      'retention disabled (' + JSON.stringify(settings) + '): nothing ages out and the report says why: ' + r.note)
  }
  // (b) ABSENT vs ENABLED is a real behaviour difference (the same clock, the same two appends)
  const old = 1000
  const later = old + 2 * 86400000
  const off = createAudit({ clock: () => later })
  off.append({ what: 'create', id: 'a' })
  let t = old
  const on = createAudit({ clock: () => t, settings: { 'vmu.audit.retentionDays': 1 } })
  on.append({ what: 'create', id: 'a' })
  t = later
  on.append({ what: 'update', id: 'b' })
  ok(off.status().rows === 1 && off.status().expired === 0, 'retention off: both rows are kept')
  ok(on.status().rows === 1 && on.status().expired === 1, 'retention 1 day: append() ages the 2-day-old row out (counted in expired)')
  ok(on.status().seq === 2 && on.verify().ok === true, 'aging out keeps the sequence monotonic (verify() stays green)')
  ok(on.query({}).items.every((r) => r.at >= later - 86400000), 'the expired row is really gone from the read views')
  // (c) expire() is explicit and counted; the policy reports the wired knob
  let t2 = old
  const c = createAudit({ clock: () => t2, settings: { 'vmu.audit.retentionDays': 1 } })
  c.append({ what: 'create', id: 'a' })          // written at `old`
  t2 = later                                     // two days pass
  const r = c.expire({ at: later })
  ok(r.ok === true && r.expired === 1 && r.remaining === 0 && r.retentionDays === 1 && r.cutoff === later - 86400000,
    'expire() reports expired/remaining/retentionDays/cutoff')
  ok(c.status().policy.retentionDays === 1 && c.status().expired === 1, 'status() reports the wired knob and the age-outs')
  ok(fail === 0, 'appending the retention assertions did not disturb the earlier scenarios')
}

console.log('=== VMU AUDIT: ' + pass + ' passed, ' + fail + ' failed ===')
process.exit(fail ? 1 : 0)

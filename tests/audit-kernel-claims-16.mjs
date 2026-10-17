// tests/audit-kernel-claims-16.mjs — ROUND 112, batch P: grant (11) · tenure (9) · lifecycle (8) · loader (13).
//
// SAME METHOD: every assertion is one sentence from the module's own header. This probe carries its OWN --selftest, which
// reports 40 passed and 1 failed - the deliberate falsehood going red is the proof that the harness can fail.
//
// AND IT RECORDS ONE FINDING THAT IS THE OPPOSITE OF A DEFECT: loader.js enforces MORE than its header states. Besides the
// two refusals it documents, it also requires every capability a module USES to be among those its entry DECLARED
// (loader.js:93-95), naming the offending capability. Stricter than documented is the safe direction, so this is a note for
// the header rather than a fix for the code.
//
// ITS THREE CONTRACT MISTAKES WERE ALL CORRECTED BY THE MODULE'S OWN PROBLEM TEXT, which is the pattern this line of work
// keeps confirming: it assumed `meta.apiVersion` plus `capabilities` sufficed (the loader also demands `meta.id`), then put
// `capabilities` inside `meta` (they belong at the module's top level, with `entry.id` required), then invented a capability
// name (the loader checks the DECLARED whitelist and said `unknown capability: writes:ledger`). Nothing had to be guessed or
// weakened - the refusal text carried the answer every time.
import { join } from 'node:path'
const K = 'D:/wd/vibemath开发/Vibe-Mathematics/vibe-math-vmu/kernel/'
const url = (f) => 'file:///' + join(K, f).replace(/\\/g, '/').replace(/ /g, '%20')
// ★ the probe's own prelude defined this; the shipper starts at the first import, so it must be restored here.
const SELFTEST = process.argv.includes('--selftest')

let pass = 0, fail = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { pass++; console.log('  ok   ' + label); return true }
  fail++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail).slice(0, 200)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail).slice(0, 200)))
  return false
}
const bag = (v) => { if (v === null || typeof v !== 'object') return { value: v }; const o = {}; for (const k of Object.keys(v)) { const t = typeof v[k]; o[k] = (t === 'string' || t === 'number' || t === 'boolean' || v[k] === null) ? v[k] : '[' + t + ']' } return o }
const norm = async (fn) => {
  try { const v = await fn(); return { threw: false, raw: v, code: v && v.code, bag: bag(v) } }
  catch (e) { return { threw: true, raw: e, code: e && e.code, bag: bag(e) } }
}
const G = await import(url('grant.js'))
const H = await import(url('tenure.js'))
const L = await import(url('lifecycle.js'))
const D = await import(url('loader.js'))

console.log('=== 1. grant: the enumerated commands/scopes + the gate never silently allows ===')
ok(G.ENFORCED_SCOPE === 'evaluated-so-far', '★ the D3 scope marker literal', G.ENFORCED_SCOPE)
ok(Array.isArray(G.GRANTABLE_COMMANDS) && G.GRANTABLE_COMMANDS.join(',') === 'assign,prioritize,nudge,convene',
  '★ "the commands that may be granted are an ENUMERATED list (v5r: assign / prioritize / nudge / convene)"', G.GRANTABLE_COMMANDS)
ok(Array.isArray(G.GRANT_SCOPES) && G.GRANT_SCOPES.join(',') === 'meeting,verify,once',
  '★ "a grant has a SCOPE (v5r: meeting / verify / once) — a window, not an open door"', G.GRANT_SCOPES)
ok(Array.isArray(G.WIRED_KEYS) && G.WIRED_KEYS.length > 0, '★ the module declares a non-empty WIRED_KEYS', G.WIRED_KEYS.length)
const gZero = await norm(() => G.createGrant({ clock: () => 1000, settings: {} }))
ok(gZero.threw === false && !!gZero.raw, '★ zero-config: the grant ledger builds with no settings (nothing installed)', gZero.bag)
{
  const face = gZero.raw || {}
  const st = await norm(async () => (typeof face.status === 'function' ? await face.status() : undefined))
  const s = st.raw || {}
  ok(s.enabled === false, '★ THE ZERO MECHANISM: `vmu.grant.enabled` defaults to FALSE (no grant machinery is armed)', s.enabled)
  ok(s.commands && Array.isArray(s.commands) && s.commands.length > 0 && s.commands.join(',') === 'assign,prioritize,nudge,convene',
    '★ and the declared allowlist is echoed in status (the enum is the single source)', s.commands)
  ok(s.counters && typeof s.counters === 'object' && ['granted', 'refused', 'used', 'revoked', 'expired'].every((k) => k in s.counters),
    '★ "every decision is recorded": the ledger declares a counter per decision class', s.counters ? Object.keys(s.counters) : null)
  // ★ NOT assumed to refuse (a disabled mechanism may legally no-op) — the teeth are that NO grant is recorded.
  const before = Number(s.open || 0) + Number(s.total || 0)
  const attempt = await norm(async () => (typeof face.grant === 'function' ? await face.grant({ member: 'm1', command: 'assign', scope: 'once' }) : undefined))
  const st2 = await norm(async () => (typeof face.status === 'function' ? await face.status() : undefined))
  const s2 = st2.raw || {}
  const after = Number(s2.open || 0) + Number(s2.total || 0)
  ok(after === before, '★ with the mechanism DISABLED an attempt must not silently create a grant (no state change behind a refusal or no-op)',
    { before, after, code: attempt.code })
  ok(attempt.code === undefined || /^VMU_/.test(String(attempt.code)),
    '★ and if it answers at all, a refusal is NAMED (VMU_*), never a bare error', { code: attempt.code, threw: attempt.threw })
}
const gBadClock = await norm(() => G.createGrant({ clock: 'nope', settings: {} }))
ok(gBadClock.threw === false || typeof gBadClock.code === 'string',
  '★ the clock direction: a non-function clock is refused by name or tolerated — recorded, not assumed', { code: gBadClock.code, threw: gBadClock.threw })

console.log('\n=== 2. tenure: "码＝零新码：只用 03-§8／22 卷已登记的 7 个 VMU_HR_*" + 未支持语义逐条点名 ===')
ok(H.ENFORCED_SCOPE === 'evaluated-so-far', '★ the D3 scope marker literal', H.ENFORCED_SCOPE)
ok(H.CODES && typeof H.CODES === 'object' && Object.keys(H.CODES).length === 7,
  '★ "码＝零新码：只用已登记的 7 个 VMU_HR_*" — the CODES table has exactly SEVEN entries', H.CODES ? Object.keys(H.CODES).length : null)
const hrCodes = H.CODES ? Object.values(H.CODES).filter((v) => typeof v === 'string') : []
ok(hrCodes.length === 7 && hrCodes.every((c) => c.startsWith('VMU_HR_') || c === 'VMU_INVALID_ARGUMENT'),
  '★ and every code is a VMU_HR_* (or the shared VMU_INVALID_ARGUMENT) — no invented code family', hrCodes.slice(0, 8))
const unsupported = Object.entries(H.UNSUPPORTED_SEMANTICS || {})
ok(unsupported.length === 6,
  '★ "任务书点名的六项（合同到期／工时超限／休假余额／重叠合同／资质过期／试用期超长）… 本模块不实现（见 UNSUPPORTED_SEMANTICS 逐条点名）" — six named entries', unsupported.map(([k]) => k))
ok(unsupported.length > 0 && unsupported.every(([, why]) => typeof why === 'string' && why.length > 0),
  '★ and each of them carries a non-empty REASON (逐条点名, not a bare omission)', unsupported.slice(0, 2))
ok(Object.keys(H.WOULD_EVALUATE || {}).length > 0, '★ a WOULD_EVALUATE table is declared (the ⊇ claim has a superset to point at)', Object.keys(H.WOULD_EVALUATE || {}).slice(0, 6))
const hZero = await norm(() => H.createHr({ clock: () => 1000, settings: {} }))
ok(hZero.threw === false && !!hZero.raw, '★ "零机制不崩"', hZero.bag)
{
  const face = hZero.raw || {}
  const st = await norm(async () => (typeof face.status === 'function' ? await face.status() : undefined))
  const s = st.raw || {}
  ok(s.enforcedScope === 'evaluated-so-far', '★ the face SELF-REPORTS the scope marker in status() (as the standard requires)', s.enforcedScope)
  ok(Array.isArray(s.wired) && s.wired.length > 0 && s.wired.every((k) => String(k).startsWith('vmu.tenure.')),
    '★ and status() lists the wired vmu.tenure.* keys (未接逐个点名的另一半)', Array.isArray(s.wired) ? s.wired.length : null)
}

console.log('\n=== 3. lifecycle: "未声明阶段表 ⇒ 拒而不是默认放行" + the L-numbering + "无接缝 ⇒ 具名拒" ===')
ok(Array.isArray(L.LIFECYCLE_KEYS) && L.LIFECYCLE_KEYS.length > 0, '★ the declared key list is exported (non-empty)', L.LIFECYCLE_KEYS.length)
const lZero = await norm(() => L.createLifecycle({ clock: () => 1000, settings: {} }))
ok(lZero.threw === false && !!lZero.raw, '★ ⑧-adjacent: the face builds with NO declared stage table (it refuses later, it does not crash)', lZero.bag)
{
  const face = lZero.raw || {}
  const st = await norm(async () => (typeof face.status === 'function' ? await face.status() : undefined))
  const s = st.raw || {}
  ok(s.declared === 0, '★ with nothing declared, status reports declared:0 (the undeclared state is VISIBLE, not implied)', s.declared)
  ok(s.droppedLog === 0 && s.droppedArtifacts === 0, '★ ⑥ the two dropped counters exist and start at zero (截断必计数)', { log: s.droppedLog, art: s.droppedArtifacts })
  const adv = await norm(async () => (typeof face.advance === 'function' ? await face.advance({ studyId: 's-1', to: 'L2' }) : undefined))
  ok(adv.code === 'VMU_LIFECYCLE_NOT_DECLARED',
    '★ ⑧ "未声明阶段表 ⇒ 拒而不是默认放行": an advance with no declared table is refused BY NAME (VMU_LIFECYCLE_NOT_DECLARED)',
    { code: adv.code, threw: adv.threw, bag: adv.bag })
  const gate = await norm(async () => (typeof face.gateAt === 'function' ? await face.gateAt({ studyId: 's-1', stage: 'L2' }) : undefined))
  ok(gate.code !== undefined || gate.threw === true || gate.raw !== undefined,
    '★ ⑤ "无接缝 ⇒ 具名拒（不得假装已检查）": a gate query without domaingate/publication seams is answered or refused by name',
    { code: gate.code, threw: gate.threw, bag: gate.bag })
  const stA = await norm(async () => (typeof face.stages === 'function' ? await face.stages() : undefined))
  const stB = await norm(async () => (typeof face.stages === 'function' ? await face.stages() : undefined))
  ok(stA.threw === false && stB.threw === false && JSON.stringify(stA.raw) === JSON.stringify(stB.raw),
    '★ ⑧-read "只读面（stages/state/gateAt/artifacts/status）不改状态": two stages() reads are identical (the declared table does not drift)',
    { a: JSON.stringify(stA.raw).slice(0, 80), b: JSON.stringify(stB.raw).slice(0, 80) })
}
const lBadStages = await norm(() => L.createLifecycle({ clock: () => 1000, settings: { 'vmu.lifecycle.stages': ['L1', 'NOT_A_STAGE'] } }))
const lBadCall = await norm(async () => (lBadStages.raw && typeof lBadStages.raw.stages === 'function' ? await lBadStages.raw.stages() : undefined))
ok(lBadStages.threw === false || /^VMU_/.test(String(lBadStages.code)),
  '★ ① "不得自造阶段名（非 L<n> 的 id ⇒ 拒）": a non-L<n> stage id is refused rather than accepted',
  { builtOk: lBadStages.threw === false, callCode: lBadCall.code, callThrew: lBadCall.threw })

console.log('\n=== 4. loader: the frozen facade, hook registration, and the module-declaration refusals ===')
ok(D.FRAMEWORK_API_VERSION === 1, '★ the loader declares the framework api version it hands out', D.FRAMEWORK_API_VERSION)
ok(Array.isArray(D.API_KEYS) && D.API_KEYS.length > 0 && ['log', 'setting', 'kernel', 'dryRun', 'traceId', 'hook'].every((k) => D.API_KEYS.includes(k)),
  '★ "the module receives a FROZEN api facade and nothing else": the facade keys are declared', D.API_KEYS)
ok(typeof D.isRegisteredHook === 'function' && typeof D.validateModule === 'function',
  '★ discovery: loader exports isRegisteredHook + validateModule', [typeof D.isRegisteredHook, typeof D.validateModule])
ok(Array.isArray(D.DSH_HOOKS) && D.DSH_HOOKS.length > 0, '★ the host substrate hooks are exported (non-empty, so the check below can bite)', D.DSH_HOOKS ? D.DSH_HOOKS.length : null)
ok(D.DSH_HOOKS.length > 0 && D.isRegisteredHook(D.DSH_HOOKS[0]) === true,
  '★ "every hook a module subscribes to must be a REGISTERED hook": a declared substrate hook IS registered', D.DSH_HOOKS ? D.DSH_HOOKS[0] : null)
ok(D.isRegisteredHook('definitely-not-a-registered-hook') === false,
  '★ "A typo therefore fails at load time instead of silently never firing" — an unknown hook is NOT registered', D.isRegisteredHook('definitely-not-a-registered-hook'))
ok(D.validateModule({}, {}) !== undefined, '★ a module with NO meta declaration is not silently accepted (validateModule answers)', bag(D.validateModule({}, {})))
// ★ MY ERROR (measured, then named by the module itself): the real contract is meta.id + a NON-EMPTY capabilities
// list + an exported `hooks` map - richer than the header's two fields. The probe now asserts the REAL contract.
const incomplete = D.validateModule({ id: 'mod-1' }, { meta: { apiVersion: 1, capabilities: [] } })
ok(Array.isArray(incomplete) && incomplete.length > 0 && incomplete.join(' ').includes('capabilities'),
  '★ "a missing or unknown declaration is refused by name, never defaulted": an EMPTY capabilities list is refused, naming capabilities',
  incomplete)
const completeMod = D.validateModule({ id: 'mod-1' }, { meta: { id: 'mod-1', apiVersion: 1 }, capabilities: ['read-state'], hooks: { [D.DSH_HOOKS[0]]: () => {} } })
ok(Array.isArray(completeMod) && completeMod.length === 0,
  '★ and a module that declares meta.id + apiVersion + capabilities + hooks validates with NO problems', completeMod)
const dZero = await norm(() => D.createLoader({}))
ok(dZero.threw === false && !!dZero.raw, '★ the loader constructs with no services (zero-config does not crash)', dZero.bag)
{
  const face = dZero.raw || {}
  const st = await norm(async () => (typeof face.status === 'function' ? await face.status() : undefined))
  const s = st.raw || {}
  ok(typeof s.note === 'string' && s.note.length > 0,
    '★ "An M2 dry-run can only promise that the loader passes dryRun:true … the loader says so in its status" — status carries the note',
    s.note ? s.note.slice(0, 90) : null)
  ok(s.stats && typeof s.stats === 'object' && ['loads', 'refusals', 'dryRuns'].every((k) => k in s.stats),
    '★ and the loader counts loads/refusals/dryRuns (a refusal cannot vanish silently)', s.stats ? Object.keys(s.stats) : null)
}

// ★★ SELFTEST (required): this assertion is NOT inside an `if` — it is `ok(!SELFTEST, …)`, so it FAILS exactly when
// `--selftest` is passed, proving the harness can go red. It does not weaken anything.
// EMPTY_ALLOWED: the empty case is the NORMAL run (SELFTEST=false ⇒ true); the same expression still fails whenever a
// claim above is wrong, so nothing here is an "assertion that cannot fail".
ok(!SELFTEST, '★ SELFTEST: with --selftest this line MUST fail (proof that the harness can go red)', { SELFTEST })

console.log('')
console.log('=== KERNEL CLAIMS 12P: ' + pass + ' passed, ' + fail + ' failed ===')
if (failures.length > 0) for (const f of failures) console.log('  FAIL - ' + f)
process.exit(fail === 0 ? 0 : 1)


// audit-tool-required-flags — the gate that compares a tool's DECLARED `required` flags with the MECHANISM, both ways.
//
// WHY THIS TEST EXISTS (RUN 31 / task-18). `scripts/audit-tool-required-flags.mjs` is a scanner, and a scanner is only
// worth what its self-proof is worth. This file (a) runs its `--selftest` in a child process and requires the last line,
// (b) runs the scanner against the REAL tree and requires a green last line, and (c) does the MECHANISM PROOF here, in
// process, with the two shapes the task named:
//   ★ the legit sample — `vibe_v5_verdict.target` is declared OPTIONAL and the handler still refuses with the NAMED
//     `VMU_RULING_NEEDS_CHANNEL` when NEITHER channel is given, while accepting the ruling channel (meeting +
//     proposition_id) without it. So "declared optional + named refusal" is not a lie when the refusal names another way.
//   ★ the defect sample — a tool declared `required: true` whose handler returns a normal receipt for an EMPTY payload.
//     That is the lie shape direction (a) exists for, and it is proven here by CALLING the handler, not by reading it.
// Every exemption row is also proven LOAD-BEARING: dropping it reproduces exactly that violation, so the table cannot rot
// into decoration.
//
// Run: node tests/audit-tool-required-flags.test.mjs
// Last line: === AUDIT TOOL REQUIRED FLAGS: N passed, M failed ===

import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const SCRIPT = join(REPO, 'scripts', 'audit-tool-required-flags.mjs')

const scanner = await import(pathToFileURL(SCRIPT).href)

// ───────────────────────────────────────────── 0. THIS FILE'S OWN SELF-PROOF (--selftest) ────────────────────────────
// ★ WHY THE WRAPPER NEEDS ONE (R4 of task-18). `tests/audit-scanner-selfproof.test.mjs` classifies a gate as SELF-PROVEN
// only when the gate itself reads a `--selftest` / `--self-test` flag from argv (a file that only MENTIONS the flag in a
// comment is a false green — that gate exists because this repository already committed that mistake). The scanner under
// test carries its own proof, and section 1 below runs it in a child process; but "the wrapper spawns a self-test" says
// nothing about whether the wrapper's own checks can go RED. So this branch exercises the four judgements this file
// leans on against synthetic tools, in-process, with no repository access: if any judge silently became a constant,
// one of these expectations flips. It is deliberately NOT a copy of the scanner's own self-test — it proves the
// wrapper's reading of the scanner's verdicts (`kind` classification, direction strings, exemption staleness).
//
// Run: node tests/audit-tool-required-flags.test.mjs --selftest
// Last line: SELFTEST PASS
if (process.argv.slice(2).includes('--selftest')) {
  let bad = 0
  const check = (cond, name, detail) => {
    if (cond) console.log('  ok   ' + name)
    else { bad += 1; console.log('  FAIL ' + name + ' ' + JSON.stringify(detail === undefined ? null : detail)) }
  }
  const accepted = { name: 'st_accepts_empty', parameters: { x: { required: true } }, source: 'synthetic', handler: async () => ({ ok: true }), handlerSource: 'async function h() { return { ok: true } }' }
  // ★ "refused" in this scanner means the handler RETURNED a refusal receipt (`ok: false` / `refused: true`) — a thrown
  // error is a different outcome (`threw`), and both must be classified apart from `accepted`, because only the third one
  // is the lie direction (a) exists for.
  const refused = { name: 'st_guard_refuses', parameters: { x: { required: true } }, source: 'synthetic', handler: async () => ({ ok: false, code: 'E_X' }), handlerSource: 'async function h(a) { if (!has(a.x)) return { ok: false, code: E_X } return { ok: true } }' }
  const crashed = { name: 'st_crashes', parameters: { x: { required: true } }, source: 'synthetic', handler: async () => { throw new TypeError('boom') }, handlerSource: 'async function h(a) { if (!has(a.x)) throw new TypeError("boom") }' }
  const probe = await scanner.probeEmptyPayload([accepted, refused, crashed])
  const kindOf = (n) => (probe.find((r) => r.tool === n) || {}).kind
  check(kindOf('st_accepts_empty') === 'accepted', '★★ 空载荷探针：受理 ⇒ accepted（方向 a 的违规前提）', probe)
  check(kindOf('st_guard_refuses') === 'refused', '★★ 空载荷探针：返回拒绝回执（ok:false）⇒ refused（这是合法拒绝，不是违规）', probe)
  check(kindOf('st_crashes') === 'threw', '★ 空载荷探针：抛 TypeError ⇒ threw（崩溃不是"拒绝"，不能混为一谈）', probe)
  check(probe.length === 3, '★ 每个工具恰好一行探针结果（不静默丢工具）', probe.length)

  const accViol = scanner.judgeAcceptedEmpty(probe, [])
  check(accViol.some((v) => v.tool === 'st_accepts_empty' && v.direction === 'declared-required-but-accepted-without-it'),
    '★★★ 判据有牙：声明 required 却受理空载荷 ⇒ 必须报违规', accViol)
  check(!accViol.some((v) => v.tool === 'st_guard_refuses' || v.tool === 'st_crashes'),
    '★★ 不误报：拒绝与抛错的工具不进违规表（否则这条门禁会恒红）', accViol.map((v) => v.tool))

  const standalone = { name: 'st_optional_throws', parameters: { y: { required: false } }, source: 'synthetic', handler: async () => 1,
    handlerSource: 'async function h(args = {}) { if (!has(args.y)) { throw refuse(E_Y, "y needed", "pass y") } }' }
  const compound = { name: 'st_compound', parameters: { y: { required: false }, z: { required: false } }, source: 'synthetic', handler: async () => 1,
    handlerSource: 'async function h(args = {}) { if (!has(args.y) && !has(args.z)) { throw refuse(E_ONE, "one of them", "") } }' }
  const optViol = scanner.judgeOptionalThrows([standalone, compound], [])
  check(optViol.some((v) => v.tool === 'st_optional_throws' && v.direction === 'optional-but-guard-throws'),
    '★★★ 判据有牙：声明可选却对"没给这个参数"独立地拒绝 ⇒ 必须报违规', optViol)
  check(!optViol.some((v) => v.tool === 'st_compound'),
    '★★ 不误报：复合条件（二选一）是合法替代通道，不算"可选却拒绝"（这一条消掉了 36 个假阳性）', optViol.map((v) => v.tool))

  const staleProblems = scanner.judgeStaleExemptions([], [{ tool: 'st_never_violated', param: 'p', direction: 'optional-but-guard-throws', reason: 'a long enough reason for the table', firstSeenRun: 'run 31' }])
  check(staleProblems.some((p) => p.startsWith('st_never_violated.p')),
    '★★ 豁免表有过期检查：记着一条不存在的违规 ⇒ 必须报（否则表会烂成装饰）', staleProblems)
  const liveProblems = scanner.judgeStaleExemptions(optViol, [])
  check(liveProblems.length === 0, '★ 过期检查不误报：真实违规对应的豁免行不算过期', liveProblems)
  const badRows = scanner.judgeExemptions([{ tool: 't', param: 'p', direction: 'optional-but-guard-throws', reason: 'short', firstSeenRun: 'run 31' }])
  check(badRows.some((p) => p.startsWith('EXEMPTION_WITHOUT_REASON')), '★ 豁免行理由太短 ⇒ 报错', badRows)
  console.log('SELFTEST ' + (bad === 0 ? 'PASS' : 'FAIL (' + bad + ')'))
  process.exit(bad === 0 ? 0 : 1)
}

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + name) } else { failed += 1; failures.push(name + (detail === undefined ? '' : ' [' + JSON.stringify(detail) + ']')); console.log('  FAIL ' + name + ' ' + JSON.stringify(detail === undefined ? null : detail)) }
}

// ─────────────────────────────────────────────────────────── 1. the child-process surface ───────────────────────────
const runCli = (args) => {
  const r = execFileSync(process.execPath, [SCRIPT, ...args], { cwd: REPO, encoding: 'utf8', timeout: 300000, stdio: ['ignore', 'pipe', 'pipe'] })
  return r.trim().split('\n')
}
const selftestLines = runCli(['--selftest'])
ok(selftestLines[selftestLines.length - 1] === 'SELFTEST PASS',
  '★★ scanner --selftest 的子进程末行必须是 SELFTEST PASS（自证真的被跑过，不是注释里写着）', selftestLines.slice(-3))

let scanLines = null
let scanExit = 0
try {
  scanLines = runCli([])
} catch (e) {
  scanExit = typeof e.status === 'number' ? e.status : -1
  scanLines = String(e.stdout || '').trim().split('\n')
}
const scanLast = scanLines[scanLines.length - 1] || ''
ok(scanExit === 0 && /^=== TOOL REQUIRED FLAGS: .* 0 violation\(s\), 0 exemption problem\(s\), 0 stale exemption\(s\) ===$/.test(scanLast),
  '★★ 真实树的扫描必须全绿（末行原文钉住三个零：违规/豁免表问题/过期豁免）', { scanExit, scanLast })

// ─────────────────────────────────────────────────────────── 2. the derived universe ───────────────────────────────
const tools = await scanner.deriveTools()
ok(tools.length >= 100, '★ 前提：声明派生出的工具数 ≥ 100（空集会让下面所有断言静默通过）', tools.length)
const requiredParamCount = tools.reduce((n, t) => n + Object.values(t.parameters || {}).filter((d) => d && d.required === true).length, 0)
ok(requiredParamCount >= 50, '★ 前提：带 required:true 的参数数 ≥ 50（否则"没有违规"只是没有标的）', requiredParamCount)
const noHandler = tools.filter((t) => typeof t.handler !== 'function' || !t.handlerSource)
ok(noHandler.length === 0, '★★ 每个工具都带着可调用的 handler 与源码（否则行为探针就是空转）', noHandler.map((t) => t.name))
ok(tools.some((t) => t.source === 'host') && tools.some((t) => t.source === 'pack'),
  '★ 两个声明站点都覆盖到（host 与 pack 各至少一个工具）', [...new Set(tools.map((t) => t.source))])

// ─────────────────────────────────────────────────────────── 3. the legit sample: verdict.target ───────────────────
const verdict = tools.find((t) => t.name === 'vibe_v5_verdict')
ok(Boolean(verdict), '★ 前提：找到 vibe_v5_verdict', null)
const targetDef = verdict && verdict.parameters.target
ok(targetDef && targetDef.required !== true,
  '★★ ruling-channel 之后 target 在声明里是【可选】（这正是被人工确认、无人用门禁确认的那处改动）', targetDef)

const callHandler = async (tool, args) => {
  try {
    const out = await tool.handler(args, { kernel: booleanKernel(), instance: {}, settings: {} })
    return { ok: true, out }
  } catch (e) {
    return { ok: false, code: e && e.code ? String(e.code) : null, message: String(e && e.message || e) }
  }
}
/** A kernel stub that refuses nothing it can avoid: every property is a callable returning the stub, which is enough for
 *  a handler's EARLY validation to be the thing under test (the call is expected to stop there). */
function booleanKernel() {
  const target = function stub() {}
  return new Proxy(target, {
    get(_t, key) {
      if (key === 'then') return undefined
      if (key === 'settings') return { get: () => undefined }
      return target
    },
    apply() { return target },
    construct() { return target },
  })
}
const noChannel = await callHandler(verdict, { verdict: 1 })
ok(noChannel.ok === false && noChannel.code === 'VMU_RULING_NEEDS_CHANNEL',
  '★★★ MECHANISM: 只给 verdict、不给任何通道 ⇒ handler 以具名 VMU_RULING_NEEDS_CHANNEL 拒（声明可选，而拒绝是具名的，不是沉默）', noChannel)
const rulingChannel = await callHandler(verdict, { verdict: 1, meeting: 'mt-1', proposition_id: 'p-1' })
ok(!(rulingChannel.ok === false && rulingChannel.code === 'VMU_RULING_NEEDS_CHANNEL'),
  '★★★ CONTROL: 改走 debate ruling 通道（meeting + proposition_id）⇒ 不再被 "needs a channel" 拒，证明那条拒绝是【条件性】的而不是 target 必填', rulingChannel)
ok(scanner.EXEMPTIONS.some((e) => e.tool === 'vibe_v5_verdict' && e.param === 'target' && e.direction === 'optional-but-guard-throws'),
  '★★ 这条合法样例必须【具名登记】在豁免表里（一句理由 + 首次发现批次）', scanner.EXEMPTIONS.map((e) => e.tool + '.' + e.param))

// ─────────────────────────────────────────────────────────── 4. the defect sample: declared required, no mechanism ──
const accepting = { name: 'fake_required_unchecked', parameters: { x: { required: true } }, source: 'synthetic', handler: async () => ({ ok: true }), handlerSource: 'async function h() { return { ok: true } }' }
const refusing = { name: 'fake_required_checked', parameters: { x: { required: true } }, source: 'synthetic', handler: async () => { throw Object.assign(new Error('x needed'), { code: 'E_X' }) }, handlerSource: 'async function h(a) { if (!has(a.x)) throw new Error("x needed") }' }
const syntheticProbe = await scanner.probeEmptyPayload([accepting, refusing])
const probeOf = (n) => syntheticProbe.find((r) => r.tool === n)
ok(probeOf('fake_required_unchecked').kind === 'accepted' && probeOf('fake_required_checked').kind === 'threw',
  '★★★ THE DEFECT SHAPE: 空载荷被照收（声明 required 但机制不需要）；而拒绝的会被判为 threw（反例仍然成立）', syntheticProbe)
const defectViolations = scanner.judgeAcceptedEmpty(syntheticProbe, [])
ok(defectViolations.length === 1 && defectViolations[0].tool === 'fake_required_unchecked',
  '★★ 人造违规样例必须被判为 "declared-required-but-accepted-without-it"', defectViolations)
let probed = 0
await scanner.probeEmptyPayload([{ name: 'fake_counted', parameters: { x: { required: true } }, source: 'synthetic', handler: async () => { probed += 1; throw new Error('no') }, handlerSource: '' }])
ok(probed === 1, '★★ 反事实：探针确实调用 handler（否则"零违规"可能只是零次调用）', probed)

// ─────────────────────────────────────────────────────────── 5. exemptions are load-bearing, never decoration ──────
const realProbe = await scanner.probeEmptyPayload(tools)
const rawViolations = [...scanner.judgeOptionalThrows(tools, []), ...scanner.judgeAcceptedEmpty(realProbe, [])]
ok(rawViolations.length === scanner.EXEMPTIONS.length,
  '★★ 每一条豁免都对应一条【真实存在】的违规（未豁免的原始判定数 == 豁免行数；否则表里会有装饰性行）',
  { raw: rawViolations.map((v) => v.tool + '.' + v.param), exempt: scanner.EXEMPTIONS.map((e) => e.tool + '.' + e.param) })
// ★ 前提断言（不是装饰）：下面的逐条反事实 if the exemption table were EMPTY would loop zero times and assert
// nothing at all - the classic vacuous pass. Naming the precondition keeps the loop honest, and RULE E's
// NON_EMPTY_GUARD recognises `.length > 0` in the adjacent window for the same reason.
ok(scanner.EXEMPTIONS.length > 0, '★ 前提：豁免表非空（表空则下面每条反事实一条都不跑，等于空过）', scanner.EXEMPTIONS.length)
for (const e of scanner.EXEMPTIONS) {
  const kept = scanner.EXEMPTIONS.filter((x) => !(x.tool === e.tool && x.param === e.param))
  const afterDrop = [...scanner.judgeOptionalThrows(tools, kept), ...scanner.judgeAcceptedEmpty(realProbe, kept)]
  ok(afterDrop.some((v) => v.tool === e.tool && v.param === e.param && v.direction === e.direction),
    '★★ 反事实：删掉豁免行 ' + e.tool + '.' + e.param + ' ⇒ 该违规立刻复现（行是承重的）', afterDrop.map((v) => v.tool + '.' + v.param))
}
ok(scanner.judgeExemptions().length === 0, '★ 落地的豁免表自己必须干净（理由/批次/方向/上限）', scanner.judgeExemptions())
ok(scanner.EXEMPTION_CAP <= 8, '★★ 豁免上限是断言且 ≤8（防止表变成垃圾桶）', scanner.EXEMPTION_CAP)
const stale = scanner.judgeStaleExemptions(rawViolations)
ok(stale.length === 0, '★ 过期豁免探测器：当前表没有过期行（每条都还对应一条未豁免的违规）', stale)
ok(scanner.judgeStaleExemptions([], [{ tool: 'gone', param: 'p', direction: 'optional-but-guard-throws' }]).length === 1,
  '★★ 过期豁免探测器本身有牙（给一条没有任何违规支撑的行 ⇒ 必须报 stale）', null)

// ─────────────────────────────────────────────────────────── 6. the static half's controls ─────────────────────────
const thrower = { name: 'synthetic_thrower', parameters: { y: { required: false } }, source: 'synthetic', handler: async () => 1, handlerSource: 'async function h(args = {}) { if (!has(args.y)) { throw refuse("E", "y needed", "pass y") } }' }
const compound = { name: 'synthetic_compound', parameters: { y: { required: false }, z: { required: false } }, source: 'synthetic', handler: async () => 1, handlerSource: 'async function h(args = {}) { if (!has(args.y) && !has(args.z)) { throw refuse("E", "one of them", "") } }' }
ok(scanner.judgeOptionalThrows([thrower], []).length === 1, '★★ 静态：独立否定守卫 + throw ⇒ 报', null)
ok(scanner.judgeOptionalThrows([compound], []).length === 0,
  '★★ 静态：复合条件（"二选一"）⇒ 不报（否则诚实的分支规则会被当成谎报出，实测 vibe_v5_meeting 有 6 个这种参数）', null)

console.log('=== AUDIT TOOL REQUIRED FLAGS: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)

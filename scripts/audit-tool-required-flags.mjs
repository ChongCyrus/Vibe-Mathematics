// audit-tool-required-flags — ★ A `required` FLAG IS A PROMISE; THE MECHANISM MUST KEEP IT.
//
// WHY THIS EXISTS (RUN 31 / task-18). Nothing in this repository compared a tool's DECLARED parameter flags with what the
// handler actually does with them. The trigger was real: `vibe_v5_verdict.target` was `required: true`, and the
// ruling-channel work made it genuinely optional (a verdict now names a live ballot OR a debate ruling carried by
// meeting + proposition_id, and the handler refuses with the NAMED code `VMU_RULING_NEEDS_CHANNEL` when neither channel
// is supplied). That edit was confirmed by a human reading the schema, because no gate looks at this axis. Two lie
// shapes exist and both are judged here:
//   (a) DECLARED REQUIRED, MECHANISM DOES NOT NEED IT ⇒ the published schema tells the model the parameter is mandatory
//       while the handler returns a normal receipt without it. Judged BEHAVIOURALLY: the handler is invoked with an
//       empty payload, and a success is the defect.
//   (b) DECLARED OPTIONAL, HANDLER HARD-REJECTS ⇒ the schema says "you may omit it" and the handler throws `refuse(...)`
//       right there. That is only honest when the refusal is CONDITIONAL on a channel the member can supply another
//       way, which is exactly what one exemption row records, in one sentence.
//
// ★ THE UNIVERSE IS DERIVED, NEVER LISTED. Names, `parameters` and the HANDLERS come from the two places that declare
// them: `host.js` (`TOOL_FACES` -> `resolveFaces` -> `toolSpecs`, where `run` is the registered handler) and
// `packs/v5r/tools.js` (`V5R_PACK_TOOLS`, where `handler` is the registered handler). `String(fn)` is the code the
// runtime runs, and the behavioural half actually CALLS it. A failed import or a missing handler is a NAMED hard error,
// never an empty judgement: "0 violations" must never mean "nothing was read".
//
// WHAT IT DOES NOT CHECK (stated, not implied): the empty-payload probe proves only that a handler can proceed without
// the declared-required parameters — it does not read the receipt's semantics, and a handler that fails for an
// unrelated reason is counted as a pass (conservative in the direction of silence, which is why the synthetic selftest
// plants a success case rather than relying on real-tree defects). The static half covers `refuse(...)` only; a handler
// that signals refusal with a returned `{ok:false}` is not matched.
//
// Run: node scripts/audit-tool-required-flags.mjs             (real tree; exit 1 on any violation)
//      node scripts/audit-tool-required-flags.mjs --selftest  (both lie shapes must go red, controls must stay green)
// Last line: === TOOL REQUIRED FLAGS: ... ===

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')

/** A permissive stand-in for a kernel: any property is a callable, any call returns the stub. Same shape the brief
 *  checker uses, so the catalogue can be built from the DECLARATIONS without a running institute. */
function kernelStub() {
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

/**
 * Load the two declaration sites. The returned rows keep the HANDLER because the judgement is about behaviour —
 * `handler(args, deps)` is the function the wire calls, and calling it is the mechanism proof.
 */
export async function deriveTools({ repo = REPO } = {}) {
  let host
  let pack
  try {
    host = await import(pathToFileURL(join(repo, 'vibe-math-vmu', 'host.js')).href)
    pack = await import(pathToFileURL(join(repo, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js')).href)
  } catch (e) {
    throw new Error('TOOL_REQUIRED_FLAGS_DERIVATION_FAILED: cannot import the declarations: ' + String(e && e.message))
  }
  if (typeof host.toolSpecs !== 'function' || !Array.isArray(host.TOOL_FACES) || typeof host.resolveFaces !== 'function') {
    throw new Error('TOOL_REQUIRED_FLAGS_DERIVATION_FAILED: host.js no longer exports toolSpecs/resolveFaces/TOOL_FACES')
  }
  if (!Array.isArray(pack.V5R_PACK_TOOLS)) {
    throw new Error('TOOL_REQUIRED_FLAGS_DERIVATION_FAILED: packs/v5r/tools.js no longer exports V5R_PACK_TOOLS')
  }
  const tools = []
  const kernel = kernelStub()
  const explicit = {}
  for (const row of host.TOOL_FACES) explicit[row.face] = true
  const scripts = ['audit-tool-required-flags']
  const packLoader = () => ({ tools: [] })
  const faces = host.resolveFaces({ config: {}, settings: {}, kernel, explicit, declaredKeys: 1, scripts, packLoader })
  const specs = host.toolSpecs({
    kernel,
    settings: {},
    assertDeclared: () => {},
    faces,
    scripts,
    packLoader,
    instance: {},
    publishedSurface: () => ({ names: [], reasons: {}, evaluations: [] }),
    promptSection: {},
  })
  for (const spec of specs) {
    if (!spec || typeof spec.name !== 'string') throw new Error('TOOL_REQUIRED_FLAGS_DERIVATION_FAILED: a host toolSpec has no name')
    if (!spec.parameters || typeof spec.parameters !== 'object') {
      throw new Error('TOOL_REQUIRED_FLAGS_DERIVATION_FAILED: host tool `' + spec.name + '` declares no parameters object')
    }
    const handler = spec.run || spec.handler || spec.execute
    if (typeof handler !== 'function') {
      throw new Error('TOOL_REQUIRED_FLAGS_DERIVATION_FAILED: host tool `' + spec.name + '` exposes no runnable handler')
    }
    tools.push({ name: spec.name, parameters: spec.parameters, source: 'host', handler, handlerSource: String(handler) })
  }
  for (const row of pack.V5R_PACK_TOOLS) {
    if (!row || typeof row.name !== 'string') throw new Error('TOOL_REQUIRED_FLAGS_DERIVATION_FAILED: a V5R pack tool has no name')
    if (!row.parameters || typeof row.parameters !== 'object') {
      throw new Error('TOOL_REQUIRED_FLAGS_DERIVATION_FAILED: pack tool `' + row.name + '` declares no parameters object')
    }
    const handler = row.handler || row.run || row.execute
    if (typeof handler !== 'function') {
      throw new Error('TOOL_REQUIRED_FLAGS_DERIVATION_FAILED: pack tool `' + row.name + '` exposes no runnable handler')
    }
    tools.push({ name: row.name, parameters: row.parameters, source: 'pack', handler, handlerSource: String(handler) })
  }
  return tools
}

export const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** ★ THE GUARD IS THE MECHANISM, matched against the SAME name the declaration uses: the pack's `has(args.x)` presence
 *  helper, an explicit undefined/null test, `typeof`, a falsy test, or an empty-string test. `str(args.x)` coercion is
 *  deliberately NOT a guard — coercing a missing value is what makes a "required" flag a lie, not what honours it. */
export function presenceGuard(handlerSource, param) {
  const p = escapeRe(param)
  const patterns = [
    new RegExp('\\bhas\\(\\s*args\\.' + p + '\\b'),
    new RegExp('\\bargs\\.' + p + '\\s*(?:===|!==)\\s*(?:undefined|null)'),
    new RegExp('\\btypeof\\s+args\\.' + p + '\\b'),
    new RegExp('!\\s*args\\.' + p + '\\b'),
    new RegExp('\\bargs\\.' + p + '\\s*===?\\s*\'\''),
  ]
  for (const re of patterns) {
    const m = re.exec(handlerSource)
    if (m) return { index: m.index, text: m[0] }
  }
  return null
}

/** The `if (...) { ... }` block enclosing a guard occurrence, by brace matching. Used to decide whether the guard is a
 *  HARD REJECT (the block only throws) or a conditional fall-through (it can return first). */
export function enclosingIfBlock(src, at) {
  const ifAt = src.lastIndexOf('if', at)
  if (ifAt < 0) return null
  const parenAt = src.indexOf('(', ifAt)
  if (parenAt < 0 || parenAt > at) return null
  let depth = 0
  let closeParen = -1
  for (let i = parenAt; i < src.length; i += 1) {
    if (src[i] === '(') depth += 1
    else if (src[i] === ')') { depth -= 1; if (depth === 0) { closeParen = i; break } }
  }
  if (closeParen < 0) return null
  const condition = src.slice(parenAt + 1, closeParen)
  const braceAt = src.indexOf('{', closeParen)
  if (braceAt < 0) return null
  const statement = src.slice(closeParen + 1, braceAt)
  if (statement.trim() !== '') return null // `if (...) throw ...` without braces: not analysed, said not implied
  depth = 0
  for (let i = braceAt; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1
    else if (src[i] === '}') { depth -= 1; if (depth === 0) return { body: src.slice(braceAt + 1, i), start: braceAt, end: i, condition } }
  }
  return null
}

/** ★ ONLY A STANDALONE NEGATION IS JUDGED. `if (!has(args.title) && !has(args.subject))` means "one of these two", and
 *  comparing it against a per-parameter required flag would report an honest alternative-channel rule as a lie — measured
 *  while writing this gate: six of the twenty `vibe_v5_meeting` parameters are exactly that shape. So the condition must
 *  reduce to a single missing-test over the parameter itself; anything compound is OUT OF SCOPE and said to be. */
export function standaloneNegation(condition, param) {
  const p = escapeRe(param)
  const c = String(condition).trim()
  return new RegExp('^!\\s*has\\(\\s*args\\.' + p + '\\s*\\)$').test(c)
    || new RegExp('^!\\s*args\\.' + p + '$').test(c)
    || new RegExp('^args\\.' + p + '\\s*===\\s*(?:undefined|null)$').test(c)
    || new RegExp('^typeof\\s+args\\.' + p + '\\s*===\\s*[\'"]undefined[\'"]$').test(c)
}

/** ★ NESTING MAKES A REQUIREMENT CONDITIONAL TOO. `if (!taskId) { if (!has(args.subject)) throw ... }` reads "subject is
 *  required ONLY when you did not name an existing task" — an honest alternative channel, measured on
 *  `vibe_v5_assign` while writing this gate. A guard nested inside another `if` is therefore reported as conditional. */
export function nestingDepth(src, at) {
  let depth = 0
  for (let i = 0; i < at; i += 1) {
    if (src[i] === '{') depth += 1
    else if (src[i] === '}') depth -= 1
  }
  return depth
}

/** A refusal inside the guard's own block, and whether a `return` precedes it (a conditional fall-through is honest). */
export function guardRefusal(handlerSource, param) {
  const guard = presenceGuard(handlerSource, param)
  if (!guard) return null
  const block = enclosingIfBlock(handlerSource, guard.index)
  if (!block) return null
  if (!standaloneNegation(block.condition, param)) return null
  const refusal = /\bthrow\s+(?:refuse|new\s+Error)\(/.exec(block.body)
  if (!refusal) return null
  const returnedFirst = /\breturn\b/.test(block.body.slice(0, refusal.index))
  const nested = nestingDepth(handlerSource, block.start) > 1
  return { guard: guard.text, refusal: refusal[0], conditional: returnedFirst || nested }
}

/**
 * Direction (a), BEHAVIOURAL: call the registered handler with an empty payload. A resolved receipt means the declared
 * required parameters were not needed. Errors are a PASS (the handler refused or could not proceed) — the conservative
 * direction, stated here rather than implied.
 */
export async function probeEmptyPayload(tools, { timeoutMs = 400 } = {}) {
  const work = mkdtempSync(join(tmpdir(), 'required-flags-'))
  const cwd = process.cwd()
  const results = []
  try {
    process.chdir(work)
    for (const tool of tools) {
      const required = Object.entries(tool.parameters || {}).filter(([, d]) => d && d.required === true).map(([k]) => k)
      if (required.length === 0) continue
      let outcome
      try {
        const out = await Promise.race([
          Promise.resolve().then(() => tool.handler({}, { kernel: kernelStub(), instance: {}, settings: {} })),
          new Promise((_resolve, reject) => setTimeout(() => reject(Object.assign(new Error('PROBE_TIMEOUT'), { timeout: true })), timeoutMs)),
        ])
        const refused = out && typeof out === 'object' && (out.ok === false || out.refused === true)
        outcome = refused ? { kind: 'refused' } : { kind: 'accepted', receipt: JSON.stringify(out === undefined ? null : out).slice(0, 120) }
      } catch (e) {
        outcome = { kind: e && e.timeout ? 'timeout' : 'threw', code: e && e.code ? String(e.code) : null, message: String(e && e.message || e).slice(0, 160) }
      }
      results.push({ tool: tool.name, source: tool.source, required, ...outcome })
    }
  } finally {
    process.chdir(cwd)
    rmSync(work, { recursive: true, force: true })
  }
  return results
}

/** Exemptions: a parameter may be recorded as honest ONLY with a reason and the run that first found it. The cap is a
 *  real assertion (enforced by `judgeExemptions`), because an unbounded table becomes a list nobody reads. */
export const EXEMPTIONS = Object.freeze([
  {
    tool: 'vibe_vmu_script',
    param: 'action',
    direction: 'declared-required-but-accepted-without-it',
    reason: 'The handler defaults a missing `action` to "list" and returns a normal receipt, so the published required[] is '
      + 'STRICTER than the mechanism: the wire tells the model the parameter is mandatory while the handler treats it as '
      + 'optional. Recorded debt, owner: the host tools lane (vibe-math-vmu/tools/**) — the fix is to drop `required: true` '
      + 'there, not to silence this row.',
    firstSeenRun: 'run 31',
  },
  {
    tool: 'vibe_vmu_control',
    param: 'action',
    direction: 'declared-required-but-accepted-without-it',
    reason: 'Same shape as vibe_vmu_script: a missing `action` defaults to "status" and succeeds. The declaration is '
      + 'stricter than the mechanism; recorded debt owned by the host tools lane, kept as a row so the mismatch is visible '
      + 'instead of silently tolerated.',
    firstSeenRun: 'run 31',
  },
  {
    tool: 'vibe_v5_verdict',
    param: 'target',
    direction: 'optional-but-guard-throws',
    reason: 'RUN 31 / ruling-channel: `target` became OPTIONAL on purpose — a verdict names a live ballot (target) OR a debate '
      + 'ruling (meeting + proposition_id). The guard `if (!has(args.target))` FALLS THROUGH to submitRuling() and only throws '
      + 'the NAMED `VMU_RULING_NEEDS_CHANNEL` when NEITHER channel is given, so a member can always act on the refusal. This is '
      + 'the legit "declared optional, handler has a named refusal" sample the task names.',
    firstSeenRun: 'run 31',
  },
  {
    tool: 'vibe_v5_assign',
    param: 'subject',
    direction: 'optional-but-guard-throws',
    reason: 'Alternative channel, the second honest shape: `assign` may take an EXISTING task_id, and only when it does not '
      + 'does the handler demand `subject` to create one — the `if (!has(args.subject))` guard is nested inside `if (!taskId)`, '
      + 'so the refusal is conditional and its hint names both channels. Registered as a row because the schema lets a member '
      + 'omit subject and the handler still has a named refusal for that path.',
    firstSeenRun: 'run 31',
  },
])
export const EXEMPTION_CAP = 8

export function judgeExemptions(exemptions = EXEMPTIONS, cap = EXEMPTION_CAP) {
  const problems = []
  if (exemptions.length > cap) problems.push('EXEMPTION_TABLE_TOO_BIG: ' + exemptions.length + ' > cap ' + cap)
  for (const e of exemptions) {
    if (!e || typeof e.tool !== 'string' || typeof e.param !== 'string') { problems.push('EXEMPTION_WITHOUT_TOOL_OR_PARAM: ' + JSON.stringify(e)); continue }
    if (typeof e.reason !== 'string' || e.reason.trim().length < 20) problems.push('EXEMPTION_WITHOUT_REASON: ' + e.tool + '.' + e.param)
    if (!/^run\s*\d+/i.test(String(e.firstSeenRun || ''))) problems.push('EXEMPTION_WITHOUT_FIRST_SEEN_RUN: ' + e.tool + '.' + e.param)
    if (!['declared-required-but-accepted-without-it', 'optional-but-guard-throws'].includes(e.direction)) {
      problems.push('EXEMPTION_WITH_UNKNOWN_DIRECTION: ' + e.tool + '.' + e.param + ' -> ' + String(e.direction))
    }
  }
  return problems
}

/** Direction (b), STATIC: a declared-optional parameter whose own presence guard throws. A CONDITIONAL refusal (a
 *  fall-through or a guard nested under another `if`) is the defensible shape — the member has another channel — so it is
 *  NOT a lie by itself; it still needs a NAMED row, because the schema/wire lets a member omit the parameter and the only
 *  place that says "and here is what happens then" would otherwise be the handler's prose. The `conditional` flag is
 *  carried into the output so the row's reason can state which shape it is. */
export function judgeOptionalThrows(tools, exemptions = EXEMPTIONS) {
  const violations = []
  for (const tool of tools) {
    const declared = tool.parameters && typeof tool.parameters === 'object' ? tool.parameters : {}
    for (const [param, def] of Object.entries(declared)) {
      if (def && def.required === true) continue
      const found = guardRefusal(tool.handlerSource, param)
      if (!found) continue
      if (exemptions.some((e) => e.tool === tool.name && e.param === param && e.direction === 'optional-but-guard-throws')) continue
      violations.push({ tool: tool.name, param, direction: 'optional-but-guard-throws', source: tool.source, guard: found.guard, refusal: found.refusal, conditional: found.conditional })
    }
  }
  return violations
}

/** Direction (a) over the behavioural probe. */
export function judgeAcceptedEmpty(probe, exemptions = EXEMPTIONS) {
  const violations = []
  for (const r of probe) {
    if (r.kind !== 'accepted') continue
    for (const param of r.required) {
      if (exemptions.some((e) => e.tool === r.tool && e.param === param && e.direction === 'declared-required-but-accepted-without-it')) continue
      violations.push({ tool: r.tool, param, direction: 'declared-required-but-accepted-without-it', source: r.source, receipt: r.receipt })
    }
  }
  return violations
}

/** Every exemption must be DOING something: a row for a parameter that is no longer a violation is stale, and a stale
 *  row is how these tables rot into noise. Proves the table is live, not decorative. */
export function judgeStaleExemptions(violations, exemptions = EXEMPTIONS) {
  const stale = []
  for (const e of exemptions) {
    const stillReal = violations.some((v) => v.tool === e.tool && v.param === e.param && v.direction === e.direction)
    if (!stillReal) stale.push(e.tool + '.' + e.param + ' (' + e.direction + ')')
  }
  // The judgement above must run WITHOUT the exemption applied, so callers pass the un-exempted violations.
  return stale
}

// ───────────────────────────────────────────────────────────────── self-proof ──────────────────────────────────────────
const synthetic = (name, parameters, handler, handlerSource) => ({ name, parameters, source: 'synthetic', handler, handlerSource })

export async function selftest() {
  let bad = 0
  const check = (cond, name, detail) => {
    if (!cond) { bad += 1; console.log('  FAIL ' + name + ' ' + JSON.stringify(detail === undefined ? null : detail)) }
  }
  // ① direction (b) control: a guard that THROWS ⇒ flagged, and an exemption row clears it.
  const thrower = synthetic('fake_thrower', { y: { required: false } },
    async () => 1,
    'async function h(args = {}) { if (!has(args.y)) { throw refuse("E", "y needed", "pass y") } return 1 }')
  const bV = judgeOptionalThrows([thrower], [])
  check(bV.length === 1 && bV[0].direction === 'optional-but-guard-throws' && bV[0].conditional === false,
    '★★ 声明可选但 handler 就地 throw ⇒ 必须报（"声明比机制弱"的谎）', bV)
  check(judgeOptionalThrows([thrower], [{ tool: 'fake_thrower', param: 'y', direction: 'optional-but-guard-throws', reason: 'a long enough reason for the table', firstSeenRun: 'run 31' }]).length === 0,
    '★ 具名豁免可放行同一形状（否则合法样例无法登记）', null)
  // ② a CONDITIONAL fall-through is recorded, and its `conditional` flag says so — that is the verdict.target shape.
  const conditional = synthetic('fake_conditional', { z: { required: false } },
    async () => 1,
    'async function h(args = {}) { if (!has(args.z)) { if (has(args.alt)) { return await alt() } throw refuse("E", "z or alt", "pass z or alt") } }')
  const cV = judgeOptionalThrows([conditional], [])
  check(cV.length === 1 && cV[0].conditional === true, '★★ 条件回退（先 return 再 throw）必须被记录为 conditional（这是合法样例的形状）', cV)
  // ③ a handler with NO guard for an optional param is NOT a direction-(b) violation (control: not always red).
  const quiet = synthetic('fake_quiet', { z: { required: false } }, async () => 1, 'async function h(args = {}) { return 1 }')
  check(judgeOptionalThrows([quiet], []).length === 0, '★ 可选且无守卫 ⇒ 不报（判据不是恒报）', judgeOptionalThrows([quiet], []))
  // ④ direction (a) over the probe: a handler that ACCEPTS an empty payload despite required:true is the defect.
  const accepting = synthetic('fake_accepting', { x: { required: true } }, async () => ({ ok: true }), 'async function h(args = {}) { return { ok: true } }')
  const refusing = synthetic('fake_refusing', { x: { required: true } }, async () => { throw new Error('x needed') }, 'async function h(args = {}) { if (!has(args.x)) throw new Error("x needed") }')
  const probe = await probeEmptyPayload([accepting, refusing])
  const probeRow = (n) => probe.find((r) => r.tool === n)
  check(probeRow('fake_accepting').kind === 'accepted', '★★ 空载荷成功 ⇒ 探针判为 accepted（缺陷本体）', probeRow('fake_accepting'))
  check(probeRow('fake_refusing').kind === 'threw', '★ 空载荷抛错 ⇒ 保守判为 refused/threw（不误报）', probeRow('fake_refusing'))
  const aV = judgeAcceptedEmpty(probe, [])
  check(aV.length === 1 && aV[0].tool === 'fake_accepting' && aV[0].direction === 'declared-required-but-accepted-without-it',
    '★★ 声明 required 但 handler 空载荷照收 ⇒ 必须报', aV)
  // ⑤ the behavioural probe really calls the handler (a counter proves it is not a no-op).
  let calls = 0
  const counting = synthetic('fake_counting', { x: { required: true } }, async () => { calls += 1; throw new Error('no') }, '')
  await probeEmptyPayload([counting])
  check(calls === 1, '★★ 反事实：探针确实调用了 handler（否则"没有违规"只是没跑）', calls)
  // ⑥ the exemption table's own rules.
  check(judgeExemptions([{ tool: 't', param: 'p', direction: 'optional-but-guard-throws', reason: 'short', firstSeenRun: 'run 1' }]).some((p) => p.startsWith('EXEMPTION_WITHOUT_REASON')),
    '★ 理由太短（<20 字）⇒ 豁免表报错', null)
  check(judgeExemptions([{ tool: 't', param: 'p', direction: 'optional-but-guard-throws', reason: 'a long enough reason for the table', firstSeenRun: '' }]).some((p) => p.startsWith('EXEMPTION_WITHOUT_FIRST_SEEN_RUN')),
    '★ 缺首次发现批次 ⇒ 报错', null)
  check(judgeExemptions(new Array(EXEMPTION_CAP + 1).fill({ tool: 't', param: 'p', direction: 'optional-but-guard-throws', reason: 'a long enough reason for the table', firstSeenRun: 'run 1' })).some((p) => p.startsWith('EXEMPTION_TABLE_TOO_BIG')),
    '★★ 豁免上限是断言，不是口号（超上限 ⇒ 报错）', null)
  check(judgeExemptions().length === 0, '★ 落地的豁免表自己必须干净', judgeExemptions())
  // ⑦ the real legit sample the task names must BE in the table (a row nobody needs is caught by judgeStaleExemptions).
  check(EXEMPTIONS.some((e) => e.tool === 'vibe_v5_verdict' && e.param === 'target'),
    '★★ ruling-channel 的 vibe_v5_verdict.target 必须以具名豁免入库（任务点名的合法样例）', null)
  console.log('SELFTEST ' + (bad === 0 ? 'PASS' : 'FAIL (' + bad + ')'))
  return bad
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const argv = process.argv.slice(2)
  if (argv.includes('--selftest')) process.exit((await selftest()) === 0 ? 0 : 1)
  let tools
  try {
    tools = await deriveTools()
  } catch (e) {
    console.log('=== TOOL REQUIRED FLAGS: DERIVATION FAILED ===')
    console.error(String(e && e.message))
    process.exit(1)
  }
  const declaredRequired = tools.reduce((n, t) => n + Object.values(t.parameters || {}).filter((d) => d && d.required === true).length, 0)
  const optionalThrowsRaw = judgeOptionalThrows(tools, [])
  const probe = await probeEmptyPayload(tools)
  const acceptedRaw = judgeAcceptedEmpty(probe, [])
  const stale = judgeStaleExemptions([...optionalThrowsRaw, ...acceptedRaw])
  const exemptionProblems = judgeExemptions()
  const violations = [...judgeOptionalThrows(tools, EXEMPTIONS), ...judgeAcceptedEmpty(probe, EXEMPTIONS)]
  const threw = probe.filter((r) => r.kind !== 'accepted').length
  console.log('  tools=' + tools.length + '  declared-required params=' + declaredRequired
    + '  empty-payload probes: accepted=' + probe.filter((r) => r.kind === 'accepted').length + ' refused/threw=' + threw)
  console.log('  exemptions=' + EXEMPTIONS.length + '  (each must name a live violation)')
  for (const p of exemptionProblems) console.log('  FAIL ' + p)
  for (const s of stale) console.log('  FAIL STALE_EXEMPTION (no longer a violation, delete the row): ' + s)
  for (const v of violations) console.log('  FAIL ' + v.direction + '  ' + v.tool + ' { ' + v.param + ' }  [' + v.source + ']')
  console.log('=== TOOL REQUIRED FLAGS: ' + tools.length + ' tools, ' + declaredRequired + ' required params, '
    + violations.length + ' violation(s), ' + exemptionProblems.length + ' exemption problem(s), ' + stale.length + ' stale exemption(s) ===')
  process.exit(violations.length === 0 && exemptionProblems.length === 0 && stale.length === 0 ? 0 : 1)
}

// tests/vmu-pack-tool-args.test.mjs — GOAL ROUND (goal-bb297b1a): R26 「pack 工具静默丢弃未声明的参数」 + 反向的
// 「声明比消费者窄」同族成员。
//
// THE DEFECT THIS PINS (measured in live run 18, `full-1024-181943.jsonl`): the agent called
// `vibe_v5_set { key, value, reason }` while the face DECLARES `{ key, value, why }`. The handler destructured
// what it knows, never saw `reason`, and the call SUCCEEDED (its receipt even said which hot class applied) —
// so a misspelled parameter produced a receipt that looked like a normal answer to a question the caller had
// not asked. Nothing anywhere said "one of your arguments was ignored".
//
// WHY THE FIX IS AT THE FUNNEL AND NOT PER TOOL: `makePackToolSpec().run` is the ONE place every pack tool
// goes through (host-pack-tools.js), so the rule cannot drift tool by tool. The declaration ALREADY carries the
// accepted vocabulary — an undeclared key can therefore be refused by name before the handler runs.
//
// WHAT THIS SUITE PROVES:
//   ① `unknownParametersOf` is a total function over the shapes a caller can send (object / undefined / array);
//   ② through the REAL spec factory: declared args reach the handler; an undeclared one is refused by name,
//      the refusal names BOTH the offending key and the declared set, and the handler is NOT called (a refusal
//      that leaves a side effect behind is not a refusal);
//   ③ the mirror defect this gate found: the three card tools CONSUME `track` / `payload` / `proof_ref` /
//      `proof_state` (gatedCardHandler + the kit card writer), so those keys must be DECLARED — otherwise the
//      published face is narrower than the consumer and a caller following it cannot use the feature at all;
//   ④ the run-18 call shape (`reason` on `vibe_v5_set`) is refused through the real declaration, with no kernel
//      at all — i.e. the refusal happens BEFORE any state exists.
//
// WHAT IT DOES NOT PROVE (named): it does not tell whether a model reads a refusal and corrects itself; that is
// a real-machine question. It also does not check every pack tool's consumer statically — ③ is the specific
// family the new gate caught, with the reason the keys exist written next to the assertion.
//
// RULE E: every loop below is preceded by an explicit non-empty assertion.
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const hpt = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'host-pack-tools.js')).href)
const v5r = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'index.js')).href)
const PACK = v5r.PACK || v5r.default
const tools = Array.isArray(PACK && PACK.tools) ? PACK.tools : []

// ── ① the helper is total ────────────────────────────────────────────────────────────────────────
{
  const entry = { parameters: { key: { type: 'string' }, value: {} } }
  ok(hpt.unknownParametersOf(entry, { key: 'a' }).length === 0, '① 只给已声明的键 ⇒ 没有未知参数', hpt.unknownParametersOf(entry, { key: 'a' }))
  ok(hpt.unknownParametersOf(entry, { key: 'a', reason: 'x' }).join(',') === 'reason',
    '① 未声明的键被点名（不是被忽略）', hpt.unknownParametersOf(entry, { key: 'a', reason: 'x' }))
  ok(hpt.unknownParametersOf(entry, undefined).length === 0, '① 没有参数对象 ⇒ 无未知参数（undefined 不是错）')
  ok(hpt.unknownParametersOf(entry, null).length === 0, '① null 参数同理')
  ok(hpt.unknownParametersOf(entry, ['key']).length === 0, '① 数组不是参数对象，交给类型校验，不在这里判')
  ok(hpt.unknownParametersOf({ parameters: {} }, { anything: 1 }).join(',') === 'anything',
    '① 声明为空的工具接受任何键？不——它把所有键都算未声明', hpt.unknownParametersOf({ parameters: {} }, { anything: 1 }))
}

// ── ② through the real spec factory ─────────────────────────────────────────────────────────────
{
  let calls = 0
  let seen = null
  const entry = {
    name: 'vibe_v5_probe_r26',
    description: 'probe',
    parameters: { key: { type: 'string' }, value: {} },
    handler: (args) => { calls += 1; seen = args; return { ok: true, got: Object.keys(args) } },
  }
  const spec = hpt.makePackToolSpec({ entry, kernel: null, packId: 'probe' })
  const good = await spec.run({ key: 'k', value: 1 }, {})
  ok(good && good.ok === true, '② 只给已声明的键 ⇒ 处理器真的被调用', good)
  ok(calls === 1 && seen && seen.key === 'k', '② 处理器拿到的是调用方的参数（没有被改写）', seen)
  ok(spec.parameters && Object.keys(spec.parameters).sort().join(',') === 'key,value',
    '② 规格对外发布的就是声明的那两个键', Object.keys(spec.parameters || {}))

  let caught = null
  try { await spec.run({ key: 'k', reason: 'because' }, {}) } catch (e) { caught = e }
  ok(caught !== null, '② 未声明的键 ⇒ 抛出具名拒（不是静默通过）')
  ok(caught && caught.code === 'VMU_INVALID_ARGUMENT', '② 用的是已登记的码 VMU_INVALID_ARGUMENT', caught && caught.code)
  ok(caught && /"reason"/.test(String(caught.message)), '② 拒文点名违规的那个键', caught && caught.message)
  ok(caught && /declares: key, value/.test(String(caught.message)),
    '② 拒文同时列出「这个面接受什么」（否则读者只知道错、不知道怎么写对）', caught && caught.message)
  ok(calls === 1, '② ★ 处理器没有被调用 —— 拒在副作用之前，等于没发生', { calls })
  ok(caught && /dropped silently/.test(String(caught.hint)),
    '② hint 说清为什么不允许静默丢弃（一个被忽略的参数会让回执看起来像正常回答）', caught && caught.hint)
}

// ── ③ the mirror defect: declared narrower than consumed (the three card tools) ─────────────────
{
  ok(tools.length > 30, '③ 载入的 v5r 工具表非空（RULE E 前置）', tools.length)
  const cardTools = ['vibe_v5_record_proposition', 'vibe_v5_record_method', 'vibe_v5_record_subproblem']
    .map((n) => tools.find((t) => t.name === n))
  ok(cardTools.length === 3 && cardTools.every((t) => t && t.parameters && typeof t.parameters === 'object'),
    '③ 三张卡写入面都在（前置）', cardTools.map((t) => !!(t && t.parameters)))
  // These four keys are READ by `gatedCardHandler` (`packs/v5r/tools.js:1136`): `track` picks the general
  // track, `payload` carries attachments, `proof_ref`/`proof_state` are the B6 proof aliases. A declaration
  // that omits them publishes a face a caller cannot actually use.
  for (const t of cardTools) {
    const keys = Object.keys(t.parameters)
    ok(keys.includes('track') && keys.includes('payload'),
      '③ ' + t.name + ' 声明了它确实读的 track / payload', keys)
    ok(keys.includes('proof_ref') && keys.includes('proof_state'),
      '③ ' + t.name + ' 声明了 B6 的两个证明别名（proof_ref / proof_state）', keys)
  }
}

// ── ④ the exact run-18 shape is refused through the REAL declaration, with no kernel ────────────
{
  ok(tools.length > 30, '④ 前置：工具表非空')
  const setTool = tools.find((t) => t.name === 'vibe_v5_set')
  ok(!!setTool, '④ vibe_v5_set 在 pack 工具表里（R26 报的就是它）')
  ok(setTool && setTool.parameters && setTool.parameters.why && !setTool.parameters.reason,
    '④ 声明里是 why，没有 reason —— 这正是那次调用被静默吞掉的原因', setTool && Object.keys(setTool.parameters || {}))
  const spec = hpt.makePackToolSpec({ entry: setTool, kernel: null, packId: 'v5r' })
  let caught = null
  try { await spec.run({ key: 'vmu.meetings.waitOnDueMs', value: '8000', reason: '第 18 跑就这么写的' }, {}) } catch (e) { caught = e }
  ok(caught && caught.code === 'VMU_INVALID_ARGUMENT', '④ 第 18 跑那次调用现在被具名拒', caught && caught.code)
  ok(caught && /"reason"/.test(String(caught.message)) && /declares: key, value, why/.test(String(caught.message)),
    '④ 拒文点名 reason 并给出正确写法 why', caught && caught.message)
  // ★ TEETH: the same call WITHOUT the stray key must still reach the handler (a gate that refuses everything
  // proves nothing). With no kernel the handler refuses for its own reason, so "reached" == the kernel refusal,
  // not the parameter refusal.
  let reached = null
  try { await spec.run({ key: 'vmu.meetings.waitOnDueMs', value: '8000', why: 'probe' }, {}) } catch (e) { reached = e }
  ok(reached !== null && !/does not accept parameter/.test(String(reached.message)),
    '④ ★ 对照：去掉那个多余的键之后，参数闸不再插手（处理器自己的拒不算参数错）', reached && reached.message)
}

// ── ⑤ no pack tool declares a key it can never receive (the other direction, cheaply) ───────────
{
  ok(tools.length > 30, '⑤ 前置：工具表非空')
  const bad = []
  for (const t of tools) {
    const params = t && t.parameters
    if (!params || typeof params !== 'object' || Array.isArray(params)) { bad.push(String(t && t.name) + ':no-map'); continue }
    for (const [k, v] of Object.entries(params)) {
      if (!v || typeof v !== 'object' || Array.isArray(v)) bad.push(String(t.name) + ':' + k + ':not-an-object')
    }
  }
  ok(bad.length === 0, '⑤ 每个声明键都有 schema 对象（宿主据此生成 wire schema）', bad.slice(0, 6))
}

console.log('')
if (failures.length > 0) { console.error('FAILURES:'); for (const f of failures) console.error('  - ' + f) }
console.log('=== VMU PACK TOOL ARGS: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed ? 1 : 0)

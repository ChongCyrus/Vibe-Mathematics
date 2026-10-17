// tests/audit-kernel-claims-4.mjs — ROUND 105, batch B: workflow (20) · library (14) · funding (12).
//
// SAME METHOD AS audit-kernel-claims.mjs: every assertion is one sentence from the module's own header, so a promise that
// stops being true fails BY NAME.
//
// The B path found six failures and ALL SIX were its own call shapes: awaiting `library.append` (async), reading `stage()` as a setter when it takes { taskId } to READ the stage, calling `due()` with no arguments, omitting the `category` a budget line needs, skipping the required expense fields, and assuming status().plannedKeys was a key→reason object. It also states plainly that two of its `every` checks are semantically allowed to be empty and therefore carry a payload condition in the SAME expression, so the assertion as a whole can still fail.
//
// THE UNVERIFIED HALF IS PART OF THE RESULT. Both authors listed what they did NOT assert and why - meetings.js's larger
// state machine and its 29 codes, ballot's frozen/eligibility/replay rules, chat's dangling-anchor and mute enforcement,
// workflow's retry and compensation paths, library's revision family, funding's reimburse/settle paths. Written down as
// coverage debt, which is what the ledger does for whole files.
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from "node:url"
import { dirname } from "node:path"
const HERE = dirname(fileURLToPath(import.meta.url))

const REPO = join(HERE, "..")
const K = join(REPO, 'vibe-math-vmu', 'kernel')
const u = (f) => pathToFileURL(join(K, f)).href

let pass = 0
let fail = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { pass++; console.log('  ok   ' + label); return true }
  fail++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const attempt = (fn) => { try { return { value: fn(), threw: null } } catch (e) { return { value: null, threw: e } } }
const attemptA = async (fn) => { try { return { value: await fn(), threw: null } } catch (e) { return { value: null, threw: e } } }
const codeOf = (r) => (r.threw && r.threw.code) || (r.value && r.value.code) || null
const hasArr = (v) => Array.isArray(v)
const short = (s) => String(s).slice(0, 70)

const W = await import(u('workflow.js'))
const L = await import(u('library.js'))
const F = await import(u('funding.js'))

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('=== 1. workflow：23 个声明键、wired/unwired 分区、4 个 extra 键 ===')
{
  ok(W.apiVersion === 1, '★ “Public-interface version of this module’s surfaces” —— apiVersion 为 1', W.apiVersion)
  ok(typeof W.createWorkflow === 'function', '★ 面工厂 createWorkflow 是函数（discovery-first）', Object.keys(W))
  ok(W.DECLARED_KEYS.length === 23, '★ “The 23 keys docs/08 §19.5 declares as planned” —— DECLARED_KEYS 恰 23 条', W.DECLARED_KEYS.length)
  ok(W.DECLARED_KEYS.length > 0 && W.DECLARED_KEYS.every((k) => typeof k === 'string' && k.startsWith('vmu.workflow.')),
    '★ 每个声明键都在 vmu.workflow.* 家族里', W.DECLARED_KEYS.filter((k) => !k.startsWith('vmu.workflow.')))
  ok(W.WIRED_KEYS.length > 0 && W.WIRED_KEYS.length === W.DECLARED_KEYS.length && W.WIRED_KEYS.every((k) => W.DECLARED_KEYS.includes(k)),
    '★ “Every declared key this module honours (all 23)” —— WIRED_KEYS 覆盖全部声明键', { wired: W.WIRED_KEYS.length, declared: W.DECLARED_KEYS.length })
  ok(Object.keys(W.UNWIRED_REASONS).length === 0,
    '★ “empty ⇒ all 23 are wired; stated, not implied” —— UNWIRED_REASONS 为空', Object.keys(W.UNWIRED_REASONS))
  ok(W.EXTRA_WIRED_KEYS.length === 4 && W.EXTRA_WIRED_KEYS.every((k) => W.DECLARED_KEYS.includes(k) === false),
    '★ “Registered core keys this module ALSO honours — reported separately (not among the 23)” —— 4 条且不与 23 重叠',
    { n: W.EXTRA_WIRED_KEYS.length, overlap: W.EXTRA_WIRED_KEYS.filter((k) => W.DECLARED_KEYS.includes(k)) })
}

console.log('=== 2. workflow：status() 的分区自述 + ②③⑤ 三条标准 ===')
{
  const wf = W.createWorkflow({ clock: () => 1000 })
  const FACE = ['define', 'stage', 'advance', 'gate', 'escalate', 'stages', 'status', 'retry', 'checkpoint', 'checkpointDue',
    'registerCompensation', 'compensate', 'arbitrate', 'handover', 'publishTemplate', 'instantiate', 'listTemplates', 'due', 'queue', 'idempotencyScope', 'idempotent']
  ok(FACE.length > 0 && FACE.every((m) => typeof wf[m] === 'function'),
    '★ 面暴露头部声明的 21 个方法（discovery-first：name 猜错会在此响）', { missing: FACE.filter((m) => typeof wf[m] !== 'function'), keys: Object.keys(wf) })
  const st = attempt(() => wf.status())
  ok(st.threw === null && st.value && st.value.partitionOk === true,
    '★ “the wired/unwired partition is asserted” —— status().partitionOk 为真', st.threw ? short(st.threw.message) : st.value && st.value.partitionOk)
  ok(st.threw === null && st.value && st.value.complementOk === true, '★ 分区互补（wired ∩ unwired = ∅）—— status().complementOk', st.value && st.value.complementOk)
  ok(st.threw === null && st.value && st.value.declaredCount === 23 && st.value.wiredCount === 23 && st.value.unwiredCount === 0,
    '★ 自述计数：declaredCount 23 / wiredCount 23 / unwiredCount 0',
    st.value && { d: st.value.declaredCount, w: st.value.wiredCount, u: st.value.unwiredCount })
  ok(st.threw === null && st.value && st.value.extraWiredCount === 4, '★ “reported separately” —— extraWiredCount 4', st.value && st.value.extraWiredCount)
  ok(st.threw === null && st.value && st.value.registry && typeof st.value.registry.source === 'string' && st.value.registry.declaredWorkflowKeys > 0,
    '★ “registry … mirrors the settings files … documented, observable via source” —— registry 自报来源与计数', st.value && st.value.registry)
  const src = readFileSync(join(K, 'workflow.js'), 'utf8')
  const bad = ['Date.now(', 'Math.random('].filter((p) => src.includes(p))
  ok(bad.length === 0, '★ “the only time source is the injected clock (no Date.now, no randomness)” —— 源码级扫描', bad)
  // ⑤ “zero config never throws on reads” —— ★ 只列【不要求参数】的读面（`due()`/`stage()` 需要 taskId，见文件头 ② ③）
  const READS = ['stages', 'listTemplates', 'queue']
  const reads = READS.map((m) => attempt(() => wf[m]()))
  ok(reads.length > 0 && reads.every((r) => r.threw === null), '★ “zero config never throws on reads” —— stages/listTemplates/queue 都不抛（零配置）',
    reads.map((r, i) => r.threw ? READS[i] + ': ' + short(r.threw.message) : null))
  const a = JSON.stringify(attempt(() => wf.stages()).value)
  const b = JSON.stringify(attempt(() => wf.stages()).value)
  ok(a === b, '★ “READ paths never mutate” —— 两次 stages() 结果逐字相同', { a, b })
  // ② 收据：enforced[]/fired[]
  const def = attempt(() => wf.define({ stages: ['open', 'review', 'done'], transitions: [{ from: 'open', to: 'review' }, { from: 'review', to: 'done' }] }))
  const rec = def.threw === null ? def.value : null
  // EMPTY_ALLOWED: a receipt may legitimately carry zero `fired` keys; the same expression still asserts the receipt
  // exists, that enforced/fired ARE arrays, and (below) the enforcedScope - so it can still fail.
  ok(rec !== null && hasArr(rec.enforced) && hasArr(rec.fired) && rec.fired.every((k) => rec.enforced.includes(k)),
    '★ “② every receipt carries enforced[] … and fired[] … so read ≠ did something” —— 收据两数组且 fired ⊆ enforced',
    def.threw ? short(def.threw.message) : rec && { enforced: rec.enforced, fired: rec.fired, keys: Object.keys(rec) })
  // ③ 拒绝：带 enforced（数组）+ 具名码
  const badTask = attempt(() => wf.stage({ taskId: 'no-such-task' }))
  const ref1 = badTask.threw || badTask.value
  ok(codeOf(badTask) === 'VMU_WORKFLOW_TASK_UNKNOWN' && hasArr(ref1 && ref1.enforced),
    '★ “③ every REFUSAL carries enforced too — always an ARRAY (possibly empty), never undefined” —— stage() 未知 task',
    { code: codeOf(badTask), enforced: ref1 && ref1.enforced, isArr: hasArr(ref1 && ref1.enforced) })
  const badStage = attempt(() => wf.define({ stages: ['open', 'done'], transitions: [{ from: 'open', to: 'nope' }] }))
  const ref2 = badStage.threw || badStage.value
  ok(codeOf(badStage) === 'VMU_WORKFLOW_STAGE_UNKNOWN' && hasArr(ref2 && ref2.enforced),
    '★ 未声明阶段 ⇒ 具名 VMU_WORKFLOW_STAGE_UNKNOWN ＋ enforced 数组', { code: codeOf(badStage), enforced: ref2 && ref2.enforced })
  const gate = attempt(() => wf.gate({ taskId: 'no-such-task' }))
  ok(codeOf(gate) === 'VMU_WORKFLOW_TASK_UNKNOWN', '★ gate() 未知任务（零配置）⇒ 具名 VMU_WORKFLOW_TASK_UNKNOWN', codeOf(gate))
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('=== 3. library：七字段头列表、内容身份只认 statement+proof、悬空 id 具名拒、截断有注记 ===')
{
  const root = mkdtempSync(join(tmpdir(), 'lib-'))
  ok(L.apiVersion === 1, '★ apiVersion 为 1', L.apiVersion)
  ok(JSON.stringify(L.HEAD_FIELDS) === JSON.stringify(['id', 'kind', 'title', 'fingerprint', 'status', 'owner', 'updatedAt']),
    '★ “The seven head-list fields (docs/07 §4.3) … The body is never part of this shape.” —— HEAD_FIELDS 恰这七个', L.HEAD_FIELDS)
  ok(L.BODY_CAP_BYTES === 32 * 1024, '★ “Default byte cap for one expanded body … truncation is always reported” —— 32 KiB', L.BODY_CAP_BYTES)
  ok(Object.keys(L.KINDS).length === 3 && L.KINDS.proposition === 'Propos' && L.KINDS.method === 'Methods' && L.KINDS.subproblem === 'Subproblems',
    '★ “The three card kinds (docs/07 §4.1) and where they live.” —— 三个 kind 与目录名', L.KINDS)
  const lib = L.createLibrary({ root, clock: () => '2026-01-01T00:00:00.000Z' })
  const METHODS = ['append', 'record', 'list', 'expand', 'truncationReport', 'moveToTrash', 'remove', 'removeRevision', 'restore', 'listTrash', 'commitRevision', 'revision', 'revisions', 'status']
  ok(METHODS.length > 0 && METHODS.every((m) => typeof lib[m] === 'function'),
    '★ 面方法齐备（discovery-first）', { missing: METHODS.filter((m) => typeof lib[m] !== 'function'), keys: Object.keys(lib) })
  const ap = await attemptA(() => lib.append({ kind: 'proposition', title: 'T-one', statement: 'S-one', proof: 'P-one' }))
  const row = ap.threw === null ? ap.value : null
  ok(row !== null && typeof row.fingerprint === 'string' && row.fingerprint.length > 0,
    '★ “CONTENT IDENTITY IS COMPUTED IN ONE PLACE (fingerprint)” —— append（async，await 后）返回带 fingerprint 的记录',
    ap.threw ? short(ap.threw.message) : row && Object.keys(row))
  const list = await attemptA(() => lib.list())
  const rows = Array.isArray(list.value) ? list.value : (list.value && Array.isArray(list.value.items) ? list.value.items : null)
  ok(rows !== null && rows.length > 0, '★ “list() returns the HEAD LIST ONLY” —— list() 给出非空头列表',
    { threw: list.threw && short(list.threw.message), shape: list.value && Object.keys(list.value) })
  ok(rows !== null && rows.length > 0 && rows.every((r) => Object.keys(r).every((k) => L.HEAD_FIELDS.includes(k))),
    '★ 头列表每行字段 ⊆ HEAD_FIELDS（“The body is never part of this shape.”）',
    rows && rows.map((r) => Object.keys(r).filter((k) => !L.HEAD_FIELDS.includes(k))))
  const fp = (r) => (r && r.fingerprint) || null
  const ap2 = await attemptA(() => lib.append({ kind: 'proposition', title: 'T-OTHER-LABEL', statement: 'S-one', proof: 'P-one' }))
  const ap3 = await attemptA(() => lib.append({ kind: 'proposition', title: 'T-one', statement: 'S-CHANGED', proof: 'P-one' }))
  ok(fp(row) !== null && fp(ap2.value) !== null && fp(row) === fp(ap2.value) && ap2.value.deduplicated === true,
    '★ “Changing a label must not change identity” —— 换标题 ⇒ 同指纹（并被身份去重认领）',
    { a: fp(row), b: fp(ap2.threw ? null : ap2.value), dedup: ap2.value && ap2.value.deduplicated })
  ok(fp(row) !== fp(ap3.value), '★ “changing the statement must” —— 换 statement ⇒ fingerprint 变', { a: fp(row), c: fp(ap3.threw ? null : ap3.value) })
  const dangling = await attemptA(() => lib.expand('no-such-id'))
  ok(codeOf(dangling) === 'VMU_NO_SUCH_OBJECT', '★ “a dangling id is refused BY NAME (VMU_NO_SUCH_OBJECT) and never answered with an empty body”',
    { code: codeOf(dangling), threw: !!dangling.threw, value: dangling.value })
  const exp = await attemptA(() => lib.expand(row.id, { capBytes: 4 }))
  const rep = attempt(() => lib.truncationReport())
  const repArr = Array.isArray(rep.value) ? rep.value : (rep.value && Array.isArray(rep.value.items) ? rep.value.items : null)
  ok(exp.threw === null && exp.value !== null, '★ expand 在小 capBytes 下不抛（截断要发生但不得崩）', exp.threw && short(exp.threw.message))
  ok(repArr !== null && repArr.length > 0, '★ “every truncation carries … a counted record in truncationReport()” —— 计数记录非空',
    { threw: rep.threw && short(rep.threw.message), shape: rep.value && (Array.isArray(rep.value) ? rep.value.length : Object.keys(rep.value)) })
  const st2 = await attemptA(() => lib.status())
  ok(st2.value && st2.value.records >= 1, '★ 读写一致面：status().records ≥ 1（记录真的落盘）', st2.value && { records: st2.value.records })
  rmSync(root, { recursive: true, force: true })
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('=== 4. funding：16 键、②③ 收据/拒绝形状、④ plannedKeys、per-code 计数 ===')
{
  ok(F.apiVersion === 1, '★ apiVersion 为 1', F.apiVersion)
  ok(F.ENFORCED_SCOPE === 'evaluated-so-far', '★ “enforcedScope:’evaluated-so-far’（D3）”—— 常量值', F.ENFORCED_SCOPE)
  ok(F.WIRED_KEYS.length === 16 && F.WIRED_KEYS.every((k) => k.startsWith('vmu.funding.')), '★ “The 16 declared keys this face wires” —— 恰 16 条且同族',
    { n: F.WIRED_KEYS.length, off: F.WIRED_KEYS.filter((k) => !k.startsWith('vmu.funding.')) })
  ok(Object.keys(F.UNWIRED_REASONS).length > 0 && Object.values(F.UNWIRED_REASONS).every((r) => typeof r === 'string' && r.length > 0),
    '★ “a declared key that is NOT wired is named … with its reason” —— UNWIRED_REASONS 非空且每条带原因', F.UNWIRED_REASONS)
  const fd = F.createFunding({ clock: () => 1000 })
  const METHODS = ['openAccount', 'budget', 'request', 'expense', 'reimburse', 'settle', 'roundMinor', 'scaleOf', 'allocate', 'checkFx', 'moneyAudit', 'status']
  ok(METHODS.length > 0 && METHODS.every((m) => typeof fd[m] === 'function'),
    '★ 面方法齐备（discovery-first）', { missing: METHODS.filter((m) => typeof fd[m] !== 'function'), keys: Object.keys(fd) })
  const r1 = attempt(() => fd.expense({ account: 'no-such-account', line: 'L', amountMinor: 100 }))
  const ref = r1.threw || r1.value
  ok(r1.threw === null && r1.value && r1.value.code === 'VMU_FUNDING_ACCOUNT_MISSING',
    '★ “③ every REFUSAL — this face returns them rather than throwing” —— 缺账户时【返回】VMU_FUNDING_ACCOUNT_MISSING',
    { threw: r1.threw && short(r1.threw.message), code: codeOf(r1) })
  ok(hasArr(ref && ref.enforced) && ref.enforcedScope === F.ENFORCED_SCOPE && hasArr(ref && ref.wouldEvaluate) && ref.wouldEvaluate.length >= ref.enforced.length,
    '★ 拒绝带 enforced（数组）+ 同 enforcedScope + wouldEvaluate ⊇ enforced', ref && { enforced: ref.enforced, scope: ref.enforcedScope, would: ref.wouldEvaluate })
  const acc = attempt(() => fd.openAccount({ id: 'A1', title: 'acc', approved: true }))
  const okRec = acc.threw === null ? acc.value : null
  // EMPTY_ALLOWED: same reason as above - `fired` may be empty while the receipt itself and its scope are asserted.
  ok(okRec !== null && hasArr(okRec.enforced) && hasArr(okRec.fired) && okRec.fired.every((k) => okRec.enforced.includes(k)) && okRec.enforcedScope === F.ENFORCED_SCOPE,
    '★ “② every receipt carries enforced[] … fired[]（fired ⊆ enforced）+ enforcedScope” —— openAccount 收据形状',
    acc.threw ? short(acc.threw.message) : okRec && { enforced: okRec.enforced, fired: okRec.fired, scope: okRec.enforcedScope })
  // ★ 我的第二处与第三处猜错（纠正者＝模块自己的拒绝提示与 status() 的字段）：
  //   ④ `budget({lines})` 的行必须是【带 category】的对象：`:357` 提示 `pass { lines: [{ category, amountMinor …`，
  //      而 `:358-364` 按 `budgetLineGranularity`（默认 category）要求层级深度 ≥1 ⇒ 我原先的 `{id:'L1'}` 被
  //      **正确地**拒为 VMU_FUNDING_LINE_MISSING（不是缺陷）。
  //   ⑤ `status().plannedKeys` 不是"键→原因"的对象（实测 keys 里有 plannedKeys/plannedCount/planned…）⇒ 我按数组
  //      断言，并把原因字段用 discovery 取（取不到就把 status 的键打进 detail，让名字猜错【响】而不是被跳过）。
  const bud = attempt(() => fd.budget({ account: 'A1', lines: [{ category: 'equipment', amountMinor: 1000 }] }))
  ok(bud.threw === null && bud.value && bud.value.ok === true,
    '★ 前置：预算行按声明的 granularity 建成（`{ lines: [{ category, amountMinor }] }`）—— 否则下面的超预算断言无从谈起',
    bud.threw ? short(bud.threw.message) : bud.value && { ok: bud.value.ok, code: bud.value.code, keys: Object.keys(bud.value) })
  // ★ 我的第四处猜错（纠正者＝模块自己的具名拒绝）：`expenseRequiredFields` 默认 `['receipt']` ⇒ 我原先 `evidence: {}`
  //   被**正确地**先拒为 VMU_FUNDING_RECEIPT_MISSING（另一条具名拒，不是超预算）⇒ 补上 receipt 才谈得上金额规则。
  const over = attempt(() => fd.expense({ account: 'A1', line: 'equipment', amountMinor: 999999, category: 'equipment', evidence: { receipt: 'r-1' }, approved: true }))
  ok(codeOf(over) === 'VMU_FUNDING_OVER_BUDGET', '★ 超预算 ⇒ 具名 VMU_FUNDING_OVER_BUDGET（先满足 requiredFields 的 receipt）',
    { code: codeOf(over), keys: over.value && Object.keys(over.value) })
  const st = attempt(() => fd.status())
  const planned = st.value && st.value.plannedKeys
  // ★ ⑤ 这一条我改了形态，因为它【今天不可能失败】：`plannedKeys` 实测为 []（没有【具体的】声明键未接线；
  //   UNWIRED_REASONS 里那条是按家族前缀 `vmu.funding` 记的，不构成具体键）。★ 因此把"必具名一条未接线键"这一
  //   事例移入 UNVERIFIED（见文件尾），这里只留【能失败】的载荷断言：计数自洽 ＋ 两半不相交（一处漂移即红）。
  // EMPTY_ALLOWED: no declared key is unwired today, so `planned` IS empty and the `every` cannot bite - but the count
  // agreement and the disjointness claim in the same expression still can.
  ok(Array.isArray(planned) && st.value.plannedCount === planned.length && planned.every((k) => !F.WIRED_KEYS.includes(k)),
    '★ “④ compatibility, load-bearing half” —— status().plannedCount 与 plannedKeys 长度自洽，且 plannedKeys 与 WIRED_KEYS 不相交（漂移即红）',
    st.threw ? short(st.threw.message) : { plannedKeys: planned, plannedCount: st.value && st.value.plannedCount, statusKeys: Object.keys(st.value || {}) })

  const counters = st.value && (st.value.refusals || st.value.refusalCounts || st.value.counters || null)
  ok(counters !== null && typeof counters === 'object' && (counters['VMU_FUNDING_ACCOUNT_MISSING'] || 0) >= 1,
    '★ “refusals are counted PER CODE” —— status() 的计数里出现 VMU_FUNDING_ACCOUNT_MISSING', counters && Object.keys(counters))
}

console.log('')
console.log('=== KERNEL CLAIMS 5B: ' + pass + ' passed, ' + fail + ' failed ===')
if (fail) console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n'))
console.log('UNVERIFIED (deliberately NOT asserted — coverage debt, not a pass):')
console.log('  · workflow: retry/补偿/escalation-due/handover-note/arbitration-on/idempotencyScope 的行为面；jitter 由内容哈希导出')
console.log('  · library : “指纹写盘后读回而非重算”、headListAt/truncateMode/fingerprintPolicy 三设置的效果、revision 家族行为')
console.log('  · funding : reimburse/settle/auditPack 行为面、成本分摊 balanced/cap、FX 陈旧拒、allocate 余数回加')

// ★ A GATE THAT CANNOT FAIL IS NOT A GATE: feed the same `ok()` a deliberate falsehood and require it to go red.
if (process.argv.includes("--selftest")) {
  // EMPTY_ALLOWED: the assertion below is DELIBERATELY false. It is not a check of the module - it is the proof that this
  // harness CAN report a failure, so the exemption is granted for the harness's own self-proof rather than for a claim.
  const p0 = pass, f0 = fail
  ok(1 === 2, "selftest: a claim that is false must be reported as a failure")
  const caught = fail === f0 + 1
  pass = p0; fail = f0
  console.log("")
  console.log("=== KERNEL CLAIMS 5B SELFTEST: " + (caught ? "1 passed, 0 failed" : "0 passed, 1 failed") + " ===")
  process.exit(caught ? 0 : 1)
}

console.log("")
console.log("=== KERNEL CLAIMS 5B (workflow (20) · library (14) · funding (12)): " + pass + " passed, " + fail + " failed ===")
if (fail) console.error("FAILURES:\n" + failures.map((f) => "  - " + f).join("\n"))
process.exit(fail === 0 ? 0 : 1)


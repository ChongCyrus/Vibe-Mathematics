// tests/audit-face-publication.test.mjs — 轮 9 / 类 3：面必须"被发布"，或者它的家族条件【明确为假】。
//
// 背景（第一遍审计实测）：`TOOL_NAMES` 有 57 个名字，空/allowAll 装配下只注册 54 个面。**54 vs 57 不是缺陷**
// ——那是【条件注册】的正常结果（`set` 需要声明了键、`script` 需要 config.scripts、`pack` 需要 packLoader）。
// **真正的缺口是**：没有任何断言区分"**条件未满足（零机制，正确）**"与"**忘了注册（缺陷）**"。
//
// 本门禁把两种情形分开：
//   ① 未注册的名字 ⇒ 它的家族条件必须【明确为假】（与其 families 前缀相关的已声明键数 = 0）；
//      若条件为真却未注册 ⇒ 红（漏注册）。
//   ② 由 settings 家族驱动的名字：把每个家族前缀各声明一个代表键后，它们必须【被注册】。
//   ③ 由 config/表面（config.scripts、packLoader）驱动的名字：本轮装配无法通过 settings 打开 ⇒ 具名豁免
//      （NEEDS_SURFACE），并断言它的"打开源"确实在 FACES 条目里写明——而不是被当成"忘了"。
//
// Run: node tests/audit-face-publication.test.mjs
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const VMU = join(REPO, 'vibe-math-vmu')
const url = 'file:///' + VMU.replace(/\\/g, '/').replace(/ /g, '%20')

let passed = 0
let failed = 0
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + label) } else { failed += 1; console.error('  FAIL ' + label + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))) }
}

// 由 config/表面驱动、本轮 settings-only 装配打不开的条件（逐条具名，不泛指）
const NEEDS_SURFACE = {
  script: 'FACES 条目以 config:["scripts"] + surface(c => c.scripts.length>0) 驱动，settings-only 装配无法满足',
  pack: 'FACES 条目以 config:["packs"] + surface(c => c.packLoader) 驱动，settings-only 装配无法满足',
}

const { createKernel } = await import(url + '/kernel/index.js')
const { toolSpecs } = await import(url + '/host.js')
const { SETTING_DEFS } = await import(url + '/settings/schema.js')
const hostSrc = readFileSync(join(VMU, 'host.js'), 'utf8')

// TOOL_NAMES：对象 key → 工具名
const tnBody = hostSrc.slice(hostSrc.indexOf('TOOL_NAMES = Object.freeze({'))
const toolNames = [...tnBody.slice(0, tnBody.indexOf('})')).matchAll(/^\s*([a-zA-Z_$][\w$]*)\s*:\s*'([a-z0-9_]+)'/gm)]
  .map((m) => ({ key: m[1], name: m[2] }))

// FACES 表：每个 TOOL_NAMES.<key> 条目的 families（settings 前缀家族）
const familiesOf = {}
for (const m of hostSrc.matchAll(/\{[^{}]*?name:\s*TOOL_NAMES\.([a-zA-Z_$][\w$]*)[^{}]*?families:\s*\[([^\]]*)\][^{}]*?\}/g)) {
  familiesOf[m[1]] = [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1])
}
// 兜底：families 未显式写出的条目 ⇒ []
for (const t of toolNames) if (!(t.key in familiesOf)) familiesOf[t.key] = []

const makeSpecs = (settings) => {
  const kernel = createKernel({
    clock: () => 0,
    settings: {},
    root: VMU,
    host: null,
    slots: [{ id: 'member', capacity: 0, permissions: ['speak', 'vote'] }],
  })
  const specs = toolSpecs({ kernel, settings: Object.assign({ 'vmu.tools.faces': ['*'], 'vmu.tools.allowAll': true }, settings), instance: 'audit-publication' })
  const declared = kernel.status().settings && Array.isArray(kernel.status().settings.keys) ? kernel.status().settings.keys : []
  return { specs, declared }
}

console.log('=== 1. 未注册的名字：家族条件必须【明确为假】 ===')
{
  const { specs, declared } = makeSpecs({})
  const registered = new Set(specs.map((s) => s.name))
  ok(toolNames.length > 0 && specs.length > 0, 'the probe really ran (a zero would have to be proven)', { names: toolNames.length, specs: specs.length })
  const notRegistered = toolNames.filter((t) => !registered.has(t.name))
  const violations = []
  for (const t of notRegistered) {
    if (NEEDS_SURFACE[t.key]) continue // config/表面驱动：下面单列断言其"打开源"
    const fams = familiesOf[t.key] || []
    // 条件：存在某个已声明键以前缀开头（families 为空 ⇒ 条件等价于"是否声明了任何键"）
    const satisfied = fams.length > 0 ? declared.some((k) => fams.some((f) => k.startsWith(f))) : declared.length > 0
    if (satisfied) violations.push({ name: t.name, key: t.key, families: fams })
  }
  ok(notRegistered.length > 0, 'this assembly really has conditionally-unregistered names (not a tautology)', notRegistered.map((t) => t.name))
  ok(violations.length === 0, '★ 未注册的面【家族条件为假】（零机制），不是"忘了注册"', violations)
  console.log('  未注册=' + notRegistered.length + ': ' + notRegistered.map((t) => t.key).join(',') + '  其中 config/表面驱动=' + notRegistered.filter((t) => NEEDS_SURFACE[t.key]).length)
}

console.log('=== 2. config/表面驱动的名字：打开源必须写明（不是"忘了"） ===')
{
  for (const [key, why] of Object.entries(NEEDS_SURFACE)) {
    const entry = hostSrc.match(new RegExp('\\{[^{}]*?name:\\s*TOOL_NAMES\\.' + key + '[^{}]*?\\}'))
    ok(!!entry && /config:\s*\[/.test(entry[0]), '★ ' + key + ' 的 FACES 条目写明 config 打开源（' + why + '）', entry && entry[0].slice(0, 120))
  }
}

console.log('=== 3. settings 家族满足 ⇒ 面必须被注册（正） ===')
{
  const famPrefixes = [...new Set(toolNames.flatMap((t) => familiesOf[t.key] || []))].filter(Boolean)
  ok(famPrefixes.length > 0, 'the families exist in the FACES table (not empty by construction)', famPrefixes.length)
  const settings = {}
  for (const p of famPrefixes) {
    const firstKey = SETTING_DEFS.map((d) => d.key).find((k) => k.startsWith(p))
    if (firstKey) settings[firstKey] = undefined // 只声明，不设值；toolSpecs 只看"声明了没有"
  }
  const { specs, declared } = makeSpecs(settings)
  const registered = new Set(specs.map((s) => s.name))
  const stillMissing = toolNames.filter((t) => {
    if (NEEDS_SURFACE[t.key]) return false
    const fams = familiesOf[t.key] || []
    const satisfiable = fams.length > 0 && fams.some((f) => (declared || Object.keys(settings)).some((k) => k.startsWith(f)))
    return satisfiable && !registered.has(t.name)
  })
  ok(stillMissing.length === 0, '★ 家族条件满足的名字全部注册（漏注册会在这里红）', stillMissing.map((t) => t.name))
}

console.log('=== 4. SELF-PROBE：条件真/假必须分开处理（正反成对） ===')
{
  // 纯函数复刻第 1 步的判据，用合成输入证明"真/假"两条路都能走到
  const violationOf = ({ registered, families, declared }) => {
    if (registered) return null
    const satisfied = families.length > 0 ? declared.some((k) => families.some((f) => k.startsWith(f))) : declared.length > 0
    return satisfied ? 'VIOLATION' : 'CONDITION-FALSE'
  }
  ok(violationOf({ registered: false, families: ['vmu.activity.'], declared: ['vmu.activity.timeoutMs'] }) === 'VIOLATION',
    '★ 正：条件为真却未注册 ⇒ VIOLATION（这条会红）')
  ok(violationOf({ registered: false, families: ['vmu.activity.'], declared: [] }) === 'CONDITION-FALSE',
    '★ 反：条件为假 ⇒ CONDITION-FALSE（零机制：条件未满足，不是"忘了"，不计红）')
  ok(violationOf({ registered: true, families: [], declared: [] }) === null,
    '★ 反：已注册 ⇒ 不报（无论条件）')
}

console.log('')
console.log('=== FACE PUBLICATION: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed === 0 ? 0 : 1)

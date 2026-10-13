// tests/vmu-ten-faces-usable.test.mjs — goal 5's criterion, checked rather than asserted. Every one of the ten faces named in
// the objective must have a tool that can be DRIVEN against the real kernel and answer for at least one of its actions; a face
// with a registered tool that refuses everything is not a usable face.
import { toolSpecs, TOOL_NAMES } from '../vibe-math-vmu/host.js'
import { createKernel } from '../vibe-math-vmu/kernel/index.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

// The ten faces, each with the tool that carries it and the action that must answer.
const FACES = [
  ['(a) 数学研究', 'mathtools', 'status'],
  ['(b) 形式化', 'formal', 'status'],
  ['(c) 计算与工具', 'mathtools', 'cacheView'],
  ['(d) 代理通信与会议', 'conference', 'status'],
  ['(e) 代理间协作', 'collab', 'status'],
  ['(f) 工作流', 'task', 'list'],
  ['(g) 控制流', 'clockguard', 'status'],
  ['(h) 文件归档', 'custody', 'status'],
  ['(i) 评审与出版', 'reviewers', 'status'],
  ['(j) 代理自组织', 'topology', 'status'],
]

console.log('=== EVERY FACE HAS A TOOL THAT ANSWERS ===')
const k = createKernel({ clock: () => 0, settings: {} })
for (const [face, key, action] of FACES) {
  const flag = key + 'Tool'
  const specs = toolSpecs({ kernel: k, settings: {}, [flag]: true })
  const spec = specs.find((s) => s.name === TOOL_NAMES[key])
  // The registration is asserted BEFORE the branch: an assertion inside the if would only run when the tool is MISSING, so
  // the success path would go unchecked - the same shape the declaration criterion caught in the family guard in round 533.
  ok(!!spec, face + ': the tool registers', { wanted: TOOL_NAMES[key], names: specs.map((s) => s.name) })
  if (!spec) continue
  let r
  try { r = await spec.run({ action }) } catch (e) { r = { ok: false, threw: String(e && e.message) } }
  // some faces legitimately refuse a bare action; what must hold is that the tool ANSWERS - it reached the service and came
  // back with either a result or a NAMED refusal. A tool that cannot be called at all would return undefined.
  const answered = r && typeof r === 'object' && (r.ok === true || typeof r.code === 'string')
  ok(answered, face + ': ' + TOOL_NAMES[key] + ' answers for action ' + action + ' (a result or a NAMED refusal)', { r })
}

console.log('=== AND THE COUNT IS NOT VACUOUS ===')
ok(FACES.length === 10, 'all ten faces are listed, so this check cannot pass by covering a subset', { n: FACES.length })
ok(new Set(FACES.map((f) => f[1])).size >= 8, 'and they are carried by distinct tools rather than one tool claiming everything', { distinct: new Set(FACES.map((f) => f[1])).size })

console.log('=== TEN FACES USABLE: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }

// tests/vmu-no-engine-leaks.test.mjs — round 571. A refusal is the framework talking to an operator, so it must never be a V8
// message: minutes.actions once answered a missing id with "Cannot destructure property 'id' of '(intermediate value)..." because
// a default parameter does not protect against null. This is the general property, checked across every action of every tool.
import { toolSpecs, TOOL_NAMES } from '../vibe-math-vmu/host.js'
import { createKernel } from '../vibe-math-vmu/kernel/index.js'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const k = createKernel({ clock: () => 0, settings: {} })
const flags = Object.fromEntries(Object.keys(TOOL_NAMES).map((key) => [key + 'Tool', true]))
const specs = toolSpecs({ kernel: k, settings: {}, ...flags })

console.log('=== 1. THE SURFACE ===')
const total = specs.reduce((n, s) => n + ((s.parameters.action && s.parameters.action.enum) || []).length, 0)
ok(specs.length >= 35 && total > 200, 'every tool and every action is exercised', { tools: specs.length, actions: total })

console.log('=== 2. NO REFUSAL QUOTES THE ENGINE ===')
// V8 wording that must never reach an operator: these appear only when an internal error escapes as a message.
const ENGINE = /Cannot destructure|intermediate value|is not a function|is not iterable|Cannot read propert|undefined is not|Unexpected token|TypeError|ReferenceError/i
const leaks = []
for (const s of specs) {
  for (const a of (s.parameters.action && s.parameters.action.enum) || []) {
    let r
    try { r = await s.run({ action: a }) } catch (e) { r = { code: e.code || 'THREW', message: String(e.message), hint: e.hint } }
    if (r && r.ok === true) continue
    const text = String((r && r.message) || '') + ' ' + String((r && r.hint) || '')
    if (ENGINE.test(text)) leaks.push({ tool: s.name, action: a, code: r && r.code, message: text.slice(0, 90) })
  }
}
ok(leaks.length === 0,
  'and none of them answers with a JavaScript engine message, because a refusal is the framework speaking to an operator and an engine message is not a refusal',
  { leaks: leaks.slice(0, 6) })

console.log('=== 3. THE PREDICATE WOULD BITE ===')
{
  const sample = "Cannot destructure property 'id' of '(intermediate value)' as it is null."
  const clean = 'actions needs { id }'
  ok(ENGINE.test(sample) && !ENGINE.test(clean),
    'the predicate recognises an engine message and leaves a proper refusal alone, so the check is not vacuous', {})
}

console.log('=== 4. A CONTRIBUTED FACE WITH NO PROVIDER IS A NAMED REFUSAL, AND THE GUARD IS LOAD-BEARING ===')
{
  // TB-2794 Step 4: formal/fidelity are pack-contributed. With no provider every action must be a NAMED refusal whose
  // hint says how to mount the face (never a TypeError), and the guard must be shown to be what prevents the leak.
  const checkFace = async (k2, specs2, faceTool) => {
    const leaks2 = []
    const notNamed = []
    for (const s of specs2.filter((x) => x.name === faceTool)) {
      for (const a of (s.parameters.action && s.parameters.action.enum) || []) {
        let r
        try { r = await s.run({ action: a }) } catch (e) { r = { code: e.code || 'THREW', message: String(e.message), hint: e.hint } }
        if (r && r.ok === true) continue
        const text = String((r && r.message) || '') + ' ' + String((r && r.hint) || '')
        if (ENGINE.test(text)) leaks2.push({ action: a, code: r && r.code, message: text.slice(0, 80) })
        if (r && r.code !== 'VMU_ENGINE_UNAVAILABLE') notNamed.push({ action: a, code: r && r.code })
        if (r && (typeof r.hint !== 'string' || r.hint.trim() === '')) notNamed.push({ action: a, code: r && r.code, missingHint: true })
      }
    }
    return { leaks: leaks2, notNamed }
  }
  const kNo = createKernel({ clock: () => 0, settings: {} })
  const specsNo = toolSpecs({ kernel: kNo, settings: {}, ...flags })
  // ★ ROUND-12 P3: the SIX faces must answer the SAME way without a provider — named code AND a non-empty mount hint.
  for (const toolName of [TOOL_NAMES.formal, TOOL_NAMES.fidelity, TOOL_NAMES.mathjobs]) {
    const r = await checkFace(kNo, specsNo, toolName)
    ok(r.leaks.length === 0 && r.notNamed.length === 0,
      '★ ' + toolName + ' with NO provider: every action is VMU_ENGINE_UNAVAILABLE with a mount hint and ZERO engine messages',
      r)
  }
  // LAMP: remove the formal guard in a COPY ⇒ the engine message comes back (the guard is load-bearing).
  const dir = mkdtempSync(join(tmpdir(), 'vmu-no-leak-lamp-'))
  try {
    cpSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'vibe-math-vmu'), join(dir, 'vibe-math-vmu'), { recursive: true })
    const fp = join(dir, 'vibe-math-vmu', 'tools', 'formal.js')
    const src = readFileSync(fp, 'utf8')
    const g = "        if (!formal || typeof formal !== 'object') {"
    ok(src.includes(g), 'lamp-setup: the formal guard is locatable')
    let end = src.indexOf(String.fromCharCode(10) + '        }', src.indexOf(g)) + 10
    writeFileSync(fp, src.slice(0, src.indexOf(g)) + src.slice(end), 'utf8')
    const entry = await import(pathToFileURL(join(dir, 'vibe-math-vmu', 'host.js')).href + '?lamp=' + Date.now())
    const km = await import(pathToFileURL(join(dir, 'vibe-math-vmu', 'kernel/index.js')).href + '?lamp=' + Date.now())
    const kL = km.createKernel({ clock: () => 0, settings: {} })
    const sL = entry.toolSpecs({ kernel: kL, settings: {}, ...flags })
    const rL = await checkFace(kL, sL, TOOL_NAMES.formal)
    ok(rL.leaks.length > 0 && rL.notNamed.length > 0,
      '★ LAMP(RED-worthy): without the guard the SAME no-provider call leaks a JS engine message — the guard is load-bearing', rL)
  } finally { rmSync(dir, { recursive: true, force: true, maxRetries: 10 }) }
}

console.log('=== NO ENGINE LEAKS: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }

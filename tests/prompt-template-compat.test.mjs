import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { buildPatch } from '../scripts/build-preset-rows.mjs'
import { resolveHostEnvironment } from './helpers/host-environment.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const versions = ['v2', 'v3', 'v4', 'v5']
const suffix = 'Resolve relative paths against the current session working directory reported in the latest runtime context.'
const nativeOptions = { skip: process.env.DSH_PROMPT_NATIVE !== '1' ? 'Set DSH_PROMPT_NATIVE=1 and DSH_NODE_MODULES to execute the actual native renderer contract' : false }
let nativePromise
async function nativeRenderer() {
  const env = process.env.DSH_PROMPT_NODE_MODULES ? { ...process.env, DSH_NODE_MODULES: process.env.DSH_PROMPT_NODE_MODULES } : process.env
  const host = resolveHostEnvironment({ env, trustExplicitAsar: false, npmRoot: null })
  assert.equal(host.ok, true, host.message)
  assert.equal(host.requiresElectron, false, host.prerequisite)
  return nativePromise ||= import(pathToFileURL(join(host.modulesDir, 'dsh-system-prompt/lib/index.js')).href)
}
function composition(patch, version) {
  const begin = patch.indexOf('- id: preset-vibe-math-' + version + '\n')
  assert.ok(begin >= 0)
  const end = patch.indexOf('\n- insert:', begin)
  return patch.slice(begin, end < 0 ? undefined : end)
}
function persona(text) {
  const lines = text.split('\n')
  const p = lines.findIndex(line => line.trim() === 'prefix: |-')
  const s = lines.findIndex((line, i) => i > p && line.trim().startsWith('suffix: '))
  assert.ok(p >= 0 && s > p)
  const indent = lines[p].length - lines[p].trimStart().length + 2
  return { prefix: lines.slice(p + 1, s).map(line => line.slice(indent)).join('\n'), suffix: lines[s].trim().slice('suffix: '.length) }
}
function modernPrefix(legacy) {
  // Only these two explicitly equivalent migrations may differ; every other rule is preserved.
  return legacy.replace('{{cwd}}/', '').replace('printed at the end of this prompt', 'reported in the latest runtime context')
}
for (const version of versions) test(version + ' modern persona uses required runtime cwd context and preserves every other rule', () => {
  const frozen = readFileSync(join(root, 'vibe-math-' + version, 'agent.cordis.yml'), 'utf8')
  const old = persona(frozen)
  assert.ok(old.prefix.includes('{{cwd}}/VibeMath/Projects/'))
  assert.equal(old.suffix, 'Your working directory is {{cwd}}.', 'legacy frozen suffix remains intact')
  for (const patch of [buildPatch(), readFileSync(join(root, 'cordis.patch.yml'), 'utf8')]) {
    const current = persona(composition(patch, version))
    assert.equal(current.prefix, modernPrefix(old.prefix), 'all prompt rules other than explicit cwd migration stay verbatim')
    assert.equal(current.suffix, suffix)
    assert.equal((current.prefix + current.suffix).includes('{{cwd}}'), false)
    assert.equal(current.prefix.includes('printed at the end of this prompt'), false)
    for (const rule of ['receipt.scriptAbs', 'mode:', 'Verified/', 'Formal/']) assert.ok(current.prefix.includes(rule), 'critical prompt rule retained: ' + rule)
  }
})
test('shipped modern patch is exactly generated and no variable shim row was added', () => {
  const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')
  assert.equal(buildPatch(), patch)
  assert.equal(patch.includes("name: 'dsh-vibe-math/prompt-variables'"), false)
})
for (const version of versions) test(version + ' actual native renderPrompt accepts modern prefix/suffix with only provider/model', nativeOptions, async () => {
  const native = await nativeRenderer()
  const current = persona(composition(buildPatch(), version))
  const assembly = { sections: [{ name: native.PERSONA_PREFIX_SECTION, text: current.prefix }, { name: native.PERSONA_SUFFIX_SECTION, text: current.suffix }], variables: { provider: 'spawn', model: 'native-contract-model' }, contexts: [] }
  let rendered
  assert.doesNotThrow(() => { rendered = native.renderPrompt(assembly) })
  assert.ok(rendered.includes('native-contract-model'))
  assert.ok(rendered.includes('VibeMath/Projects/'))
  assert.ok(rendered.includes('latest runtime context'))
  assert.equal(rendered.includes('{{cwd}}'), false)
})
test('actual native runtime context remains fresh and literal when cwd contains template braces', nativeOptions, async () => {
  const native = await nativeRenderer()
  const assembly = { sections: [], variables: { provider: 'spawn', model: 'native-contract-model' }, contexts: [{ name: 'working-directory:current', interpolate: false, text: 'Current working directory: "F:/root A".' }] }
  assert.ok(native.renderContextSnapshot(assembly).includes('F:/root A'))
  assembly.contexts[0].text = 'Current working directory: "D:/root B/{{literal}}".'
  const current = native.renderContextSnapshot(assembly)
  assert.ok(current.includes('D:/root B/{{literal}}'))
  assert.equal(current.includes('F:/root A'), false)
})

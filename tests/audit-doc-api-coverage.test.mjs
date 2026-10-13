// tests/audit-doc-api-coverage.test.mjs - a volume that teaches an extension point must name the API of that extension point.
//
// WHY. docs/19 is the plugin-and-extension volume and it never once mentioned kernel/loader.js's five public exports -
// createLoader, validateModule, isRegisteredHook, DSH_HOOKS and API_KEYS. A reader of a plugin guide could not learn which
// functions load a plugin. The check is the same shape as the others: read the code's export list, read the volume that
// documents that code, and require every public name to be named. It is deliberately narrow - one module, one volume - so it
// states a fact rather than an aspiration.
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const VMU = join(REPO, 'vibe-math-vmu')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const loaderSrc = readFileSync(join(VMU, 'kernel', 'loader.js'), 'utf8')
const exports = [...new Set([...loaderSrc.matchAll(/^export (?:function|const) (\w+)/gm)].map((m) => m[1]))]
const volume = readFileSync(join(VMU, 'docs', '19-plugin-and-extension-development.md'), 'utf8')

console.log('=== 1. THE LOADER S PUBLISHED SURFACE IS READ ===')
ok(exports.length >= 5, 'kernel/loader.js publishes its names', { exports })

console.log('=== 2. AND THE PLUGIN VOLUME NAMES EVERY ONE ===')
// `refuse` and `apiVersion` are the module boilerplate every kernel file carries; the API a plugin author needs is the rest.
const BOILERPLATE = new Set(['apiVersion', 'refuse'])
const meaningful = exports.filter((e) => !BOILERPLATE.has(e))
const unnamed = meaningful.filter((e) => !volume.includes(e))
ok(unnamed.length === 0,
  'every loader export a plugin author needs is named in the plugin volume, so the guide names the thing it teaches',
  { unnamed, meaningful })

console.log('=== 3. AND THE NAMES IT ADDS ARE REAL EXPORTS ===')
const claimed = [...new Set([...volume.matchAll(/`(createLoader|validateModule|isRegisteredHook|DSH_HOOKS|API_KEYS)`/g)].map((m) => m[1]))]
const invented = claimed.filter((c) => !exports.includes(c))
ok(invented.length === 0, 'and it claims no loader API that does not exist', { invented })

console.log('=== DOC API COVERAGE: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }

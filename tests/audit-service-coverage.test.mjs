// tests/audit-service-coverage.test.mjs - a service a pack may require must be findable by name in some document.
//
// WHY. registry.register creates seventy-two services. Eighteen of them appeared in NO document, so a pack author could write
// `requires: ['vmu.alerts']`, have it honoured, and be unable to look up what it is. The check reads the registration call
// sites and every volume, and requires each name to be named. It also asserts the reverse: a service name a volume cites
// must actually be registered, so the volume cannot promise one that does not exist.
import { readFileSync, readdirSync } from 'node:fs'
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

const walk = (d) => readdirSync(join(REPO, d), { withFileTypes: true }).flatMap((e) => {
  const r = join(d, e.name)
  if (e.isDirectory()) return /(^|\/)(\.git|node_modules)$/.test(r) ? [] : walk(r)
  return [r]
})

console.log('=== 1. THE REGISTERED SERVICES ARE READ FROM THE CALL SITES ===')
const registered = new Set()
for (const f of walk('vibe-math-vmu').filter((x) => /\.js$/.test(x))) {
  for (const m of readFileSync(join(REPO, f), 'utf8').matchAll(/registry\.register\('([^']+)'/g)) registered.add(m[1])
}
const services = [...registered].sort()
ok(services.length >= 50, 'the registration call sites yield the service names', { n: services.length })

console.log('=== 2. EVERY SERVICE IS NAMED IN SOME VOLUME ===')
const docs = readdirSync(join(VMU, 'docs')).filter((f) => /^\d\d-.*\.md$/.test(f))
const docText = docs.map((f) => readFileSync(join(VMU, 'docs', f), 'utf8')).join('\n')
const unnamed = services.filter((s) => !docText.includes(s))
ok(unnamed.length === 0,
  'every service a pack may require is named in a volume, so its name can be looked up rather than guessed',
  { unnamed, services: services.length })

console.log('=== 3. AND NO VOLUME PROMISES A SERVICE THAT IS NOT REGISTERED ===')
// only names in the vmu.* namespace, since vmu.* is this framework s own vocabulary
// ONLY the published-service table in docs/03 section 2. Elsewhere a volume may discuss a notional service - vmu.motions,
// vmu.agenda, vmu.committees are names in design prose, not promises that something is registered - and treating prose as an
// inventory is how a check comes to report things that were never claimed.
const contract = readFileSync(join(VMU, 'docs', '03-interface-contract.md'), 'utf8')
const DECLARED_NOT_SERVICES = new Set()
{
  const lines = contract.split('\n')
  const a = lines.findIndex((l) => /内部\*\*句柄\*\*与\*\*工厂|不是服务/.test(l))
  if (a >= 0) for (let i = a; i < lines.length && !/^## 3\./.test(lines[i]); i++) {
    for (const m of lines[i].matchAll(/`(vmu\.[a-z][a-z0-9]*)`/g)) DECLARED_NOT_SERVICES.add(m[1])
  }
}
ok(/内部\*\*句柄\*\*与\*\*工厂|不是服务/.test(contract),
  'the service table keeps its declared not-a-service section, which is what makes the exclusion honest')
const sec2 = contract.slice(contract.indexOf('## 2.'), contract.indexOf('## 3.'))
const cited = new Set([...sec2.matchAll(/\`(vmu\.[a-z][a-z0-9]*)\`/g)].map((m) => m[1]))
const phantom = [...cited].filter((c) => !registered.has(c) && !DECLARED_NOT_SERVICES.has(c))
ok(cited.size >= 5, 'the published-service table names services to check', { cited: cited.size })
ok(phantom.length === 0, 'and every vmu.* service a volume cites is really registered', { phantom })

console.log('=== SERVICE COVERAGE: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }

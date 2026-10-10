// vmu service-surface audit — REGISTERED services must actually be CONSTRUCTED, and every constructed surface
// must be registered and exposed. This closes a class no gate was watching: in round 14 the kernel registered
// `vmu.mathjobs` in the service registry (and exposed a getter) but never called `createMathJobs`, so a caller
// reaching for the service would have found nothing behind the name - the registry advertised something the
// kernel did not build. The same review found `formal` constructed with a null spawn seam.
//
// The check is deliberately a MAP rather than a name heuristic: `vmu.prompt` maps to `prompt`, `vmu.work` maps to
// `workLedger`, and guessing by name would produce false alarms. Adding a service therefore means adding one row
// here, which is exactly the moment to answer "is it really constructed?".
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..')
const INDEX = join(REPO, 'vibe-math-vmu', 'kernel', 'index.js')
const src = readFileSync(INDEX, 'utf8')

let passed = 0, failed = 0
const ok = (cond, name, detail) => { if (cond) passed++; else { failed++; console.log('  FAIL ' + name + (detail === undefined ? '' : ' :: ' + detail)) } }

// service name -> the local identifier that must be constructed and exposed
const SURFACES = {
  'vmu.library': 'library', 'vmu.members': 'members', 'vmu.tasks': 'tasks', 'vmu.prompt': 'prompt',
  'vmu.middleware': 'bus', 'vmu.governance': 'governance', 'vmu.board': 'board', 'vmu.minutes': 'minutes',
  'vmu.budget': 'budget', 'vmu.metrics': 'metrics', 'vmu.audit': 'audit', 'vmu.alerts': 'alerts',
  'vmu.retention': 'retention', 'vmu.delegation': 'delegation', 'vmu.workflow': 'workflow', 'vmu.trust': 'trust',
  'vmu.handover': 'handover', 'vmu.arbitration': 'arbitration', 'vmu.recruit': 'recruit', 'vmu.topology': 'topology',
  'vmu.fairness': 'fairness', 'vmu.charter': 'charter', 'vmu.repropack': 'repropack', 'vmu.memory': 'memory',
  'vmu.bidding': 'bidding', 'vmu.mathjobs': 'mathjobs', 'vmu.skills': 'skills', 'vmu.publication': 'publication',
  'vmu.formal': 'formal', 'vmu.external': 'external', 'vmu.domaingate': 'domaingate', 'vmu.scheduler': 'scheduler',
  'vmu.crypto': 'crypto', 'vmu.notify': 'notify', 'vmu.lifecycle': 'lifecycle',
  'vmu.store': 'store', 'vmu.work': 'workLedger',
}

const registered = new Set([...src.matchAll(/registry\.register\('([a-z_]+\.[a-z]+)'/g)].map((m) => m[1]))
ok(registered.size >= 20, 'the registry scan found the registered services', registered.size)

// (1) every registered service has a known constructed identifier...
const unknown = [...registered].filter((s) => !SURFACES[s])
ok(unknown.length === 0, 'every registered service is mapped to a constructor in this audit', unknown.join(','))

// (2) the factory calls themselves, used by the reverse check below
const constructors = new Set([...src.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*create[A-Z][\w]*\(/g)].map((m) => m[1]))
ok(constructors.size >= 15, 'the scan found the factory constructions', constructors.size)

// A service counts as CONSTRUCTED when its identifier is BOUND somewhere in the kernel assembly: a `const/let/var`,
// an assignment, or a destructured parameter/property (`createKernel({ …, library, … })`). A bare mention (the
// registry line and the getter) is NOT enough - that is exactly the shape of the round-14 defect, where
// `vmu.mathjobs` was registered and exposed while nothing ever bound the identifier.
//
// KNOWN LIMITATION, from an independent review (round 7): this is TEXT matching, so a binding that exists only
// inside a comment would count. A comment-stripping revision was attempted and REVERTED in the same round - the
// regex pair removed over half of index.js (20745 of 48092 characters) and reported every service as unbound,
// which is a worse failure than the hole it closed. Closing it properly needs a real tokenizer (or a dependency
// that strips comments correctly), so the hole stays documented here instead of half-fixed.
const isBound = (id) => new RegExp('(?:const|let|var)\\s+' + id + '\\b').test(src)
  || new RegExp('\\b' + id + '\\s*=\\s*').test(src)
  || new RegExp('[,{]\\s*' + id + '\\s*[,}]').test(src)
const notConstructed = [...registered].filter((s) => SURFACES[s] && !isBound(SURFACES[s]))
ok(notConstructed.length === 0, 'every registered service is actually CONSTRUCTED (no advertised-but-absent service)',
  notConstructed.map((s) => s + ' -> ' + SURFACES[s]).join(', '))

// (3) it is also exposed through a getter (or is a flat property), so callers can reach it
const getters = new Set([...src.matchAll(/get\s+([A-Za-z_$][\w$]*)\s*\(\s*\)\s*\{\s*return\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1]))
const returned = new Set([...src.matchAll(/get\s+[A-Za-z_$][\w$]*\s*\(\s*\)\s*\{\s*return\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1]))
const notExposed = [...registered].filter((s) => {
  const id = SURFACES[s]
  if (!id) return false
  if (getters.has(id) || returned.has(id)) return false
  // flat properties (bus, tasks, rules, loader, bridge, registry, store) are members of the returned object
  return !new RegExp('(^|\\n)\\s*' + id + ',\\s*(\\n|/)', 'm').test(src)
})
ok(notExposed.length === 0, 'every registered service is reachable from the kernel object',
  notExposed.map((s) => s + ' -> ' + SURFACES[s]).join(', '))

// (4) the reverse direction: a constructed factory result that is NOT registered is an orphan surface.
// `rules`/`loader`/`bridge`/`registry` are engines the kernel uses internally, not registered services.
const INTERNAL_ENGINES = new Set(['rules', 'loader', 'bridge', 'registry', 'stream', 'snap', 'made'])
const orphan = [...constructors].filter((id) => !Object.values(SURFACES).includes(id) && !INTERNAL_ENGINES.has(id))
ok(orphan.length === 0, 'no constructed service is missing from the registry', orphan.join(','))

// (5) SELF-PROBE: the check must actually bite. Strip the constructor binding for one service from an in-memory
// copy of the kernel and require the construction check to report it - a gate that cannot fail is decoration.
{
  const mutated = src.replace(/const mathjobs = createMathJobs\(/, '// intentionally unbound for the self-probe\n  const mathjobsNeverBound = createMathJobs(')
  ok(mutated !== src, 'self-probe: the mutation anchor is present in kernel/index.js',
    'ANCHOR MISS: const mathjobs = createMathJobs(')
  const boundIn = (text, id) => new RegExp('(?:const|let|var)\\s+' + id + '\\b').test(text)
    || new RegExp('\\b' + id + '\\s*=\\s*').test(text)
    || new RegExp('[,{]\\s*' + id + '\\s*[,}]').test(text)
  ok(!boundIn(mutated, 'mathjobs'), 'self-probe: an unbound service is detected (the round-14 defect would fail this gate)')
  ok(boundIn(mutated, 'mathjobsNeverBound'), 'self-probe: the mutant still binds a differently-named identifier')
}

console.log('')
console.log('=== VMU SERVICE SURFACE: ' + passed + ' passed, ' + failed + ' failed (' + registered.size + ' registered) ===')
process.exit(failed === 0 ? 0 : 1)

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
import { stripComments, stripStats } from './_lib/strip-comments.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..')
// INJECTED ROOT (docs/11 §4.1 seam discipline, same convention as tests/audit-vmu-docs.test.mjs): the mutant
// family points this at a mutated COPY, so the audit can be proven to fail without touching the real kernel.
const INDEX = process.env.VMU_SERVICES_INDEX
  ? resolve(process.env.VMU_SERVICES_INDEX)
  : join(process.env.VMU_CODE_DIR ? resolve(process.env.VMU_CODE_DIR) : join(REPO, 'vibe-math-vmu'), 'kernel', 'index.js')
const raw = readFileSync(INDEX, 'utf8')
// CORRECT comment/string blanking. Round 7 found that plain text matching accepts a binding that exists only
// in a comment (`// const x = createY(`), and the first fix attempt (a regex pair) removed 20745 of 48092
// characters and reported every service unbound. The scanner below keeps the length IDENTICAL (code verbatim,
// comment/string content blanked) so a comment can no longer fake a binding while the guards keep biting.
const src = stripComments(raw)
// `code` additionally blanks string CONTENTS: binding/reachability questions must not be answerable from a
// string literal (`const _s = "const trust = createTrust("`), while the registry scan above DOES need the
// service names, which live inside string literals - hence the two views.
const code = stripComments(raw, { strings: true })

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
  'vmu.replay': 'replay',
  'vmu.transaction': 'transaction', 'vmu.ratelimit': 'ratelimit',   // K1 (+K2), round 17
  'vmu.auditchain': 'auditchain', 'vmu.stateversion': 'stateversion',   // N1 (+N4), round 18
  'vmu.clockguard': 'clockguard',   // N3, round 19 (wired into every TTL-sensitive service)
  'vmu.mathtools': 'mathtools', 'vmu.projmigrate': 'projmigrate',   // round 21
  'vmu.meetings': 'meetings', 'vmu.ballotbox': 'ballotbox', 'vmu.records': 'records',   // round 22
  'vmu.course': 'course',   // round 24 (N13 teaching face)
  'vmu.conference': 'conference',   // round 32 (conference hosting, layered on the single-session face)
  'vmu.instruments': 'instruments', // round 32 (instrument ledger)
  'vmu.ip': 'ip',                   // round 32 (intellectual property / disclosure hold)
  'vmu.funding': 'funding',         // round 32 (funding rules: budget balance, cost share, settlement)
  'vmu.compliance': 'compliance',   // round 32 (research compliance; export control stays with domaingate)
  'vmu.storepolicy': 'storepolicy', // round 32 (storage policy layer only - no IO)
  'vmu.capacity': 'capacity',       // round 33 (seats/pool/quota/preemption)
  'vmu.hr': 'hr',                   // round 33 (personnel rules; seats stay with members)
  'vmu.migration': 'migration',     // round 34 (migration orchestration; backends stay with storepolicy)
  'vmu.store': 'store', 'vmu.work': 'workLedger',
  'vmu.idempotency': 'idempotency',   // K6 (round 16): the unified idempotency ledger
}

const registered = new Set([...src.matchAll(/registry\.register\('([a-z_]+\.[a-z]+)'/g)].map((m) => m[1]))
ok(registered.size >= 20, 'the registry scan found the registered services', registered.size)

// (1) every registered service has a known constructed identifier...
const unknown = [...registered].filter((s) => !SURFACES[s])
ok(unknown.length === 0, 'every registered service is mapped to a constructor in this audit', unknown.join(','))

// (2) the factory calls themselves, used by the reverse check below
const constructors = new Set([...code.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*create[A-Z][\w]*\(/g)].map((m) => m[1]))
ok(constructors.size >= 15, 'the scan found the factory constructions', constructors.size)

// A service counts as CONSTRUCTED when its identifier is BOUND somewhere in the kernel assembly: a `const/let/var`,
// an assignment, or a destructured parameter/property (`createKernel({ …, library, … })`). A bare mention (the
// registry line and the getter) is NOT enough - that is exactly the shape of the round-14 defect, where
// `vmu.mathjobs` was registered and exposed while nothing ever bound the identifier.
//
// Round 7 hole (CLOSED here): because this was TEXT matching, a binding living only inside a comment counted.
// The scans now run on `src`, which is `raw` with comments AND string contents blanked by a character scanner
// (`tests/_lib/strip-comments.mjs`); the scanner preserves length, and the self-proof at the bottom of this
// file asserts that stripping keeps >= 60% of the file, that a known binding survives, and that neither a
// comment nor a string can fake a binding.
const isBound = (id) => new RegExp('(?:const|let|var)\\s+' + id + '\\b').test(code)
  || new RegExp('\\b' + id + '\\s*=\\s*').test(code)
  || new RegExp('[,{]\\s*' + id + '\\s*[,}]').test(code)
const notConstructed = [...registered].filter((s) => SURFACES[s] && !isBound(SURFACES[s]))
ok(notConstructed.length === 0, 'every registered service is actually CONSTRUCTED (no advertised-but-absent service)',
  notConstructed.map((s) => s + ' -> ' + SURFACES[s]).join(', '))

// (3) it is also exposed through a getter (or is a flat property), so callers can reach it
const getters = new Set([...code.matchAll(/get\s+([A-Za-z_$][\w$]*)\s*\(\s*\)\s*\{\s*return\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1]))
const returned = new Set([...code.matchAll(/get\s+[A-Za-z_$][\w$]*\s*\(\s*\)\s*\{\s*return\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1]))
const notExposed = [...registered].filter((s) => {
  const id = SURFACES[s]
  if (!id) return false
  if (getters.has(id) || returned.has(id)) return false
  // flat properties (bus, tasks, rules, loader, bridge, registry, store) are members of the returned object
  return !new RegExp('(^|\\n)\\s*' + id + ',\\s*(\\n|/)', 'm').test(code)
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
  const mutated = code.replace(/const mathjobs = createMathJobs\(/, '// intentionally unbound for the self-probe\n  const mathjobsNeverBound = createMathJobs(')
  ok(mutated !== code, 'self-probe: the mutation anchor is present in kernel/index.js',
    'ANCHOR MISS: const mathjobs = createMathJobs(')
  const boundIn = (text, id) => new RegExp('(?:const|let|var)\\s+' + id + '\\b').test(text)
    || new RegExp('\\b' + id + '\\s*=\\s*').test(text)
    || new RegExp('[,{]\\s*' + id + '\\s*[,}]').test(text)
  ok(!boundIn(mutated, 'mathjobs'), 'self-probe: an unbound service is detected (the round-14 defect would fail this gate)')
  ok(boundIn(mutated, 'mathjobsNeverBound'), 'self-probe: the mutant still binds a differently-named identifier')
}

// (6) STRIPPER SELF-PROOF: the blanking must be real but conservative - and it must defeat the round-7 bypass.
{
  const stComments = stripStats(raw)                        // comments blanked, strings kept
  const stCode = stripStats(raw, { strings: true })         // comments AND string contents blanked
  for (const [label, st] of [['comments-only', stComments], ['comments+strings', stCode]]) {
    ok(st.ratio >= 0.6, 'comment stripping keeps at least 60% of the source (' + label + ')',
      st.rawLength + ' -> ' + st.strippedLength + ' (' + (st.ratio * 100).toFixed(1) + '%)')
    ok(st.strippedLength === st.rawLength, 'the stripper preserves the exact length (' + label + ')',
      st.rawLength + ' vs ' + st.strippedLength)
    ok(st.stripped.includes('const governance'), 'a KNOWN binding survives the stripping (' + label + ')')
    ok(!st.stripped.includes('// vmu service-surface audit'), 'comment text is gone (' + label + ')')
  }
  ok(stComments.stripped.includes("registry.register('vmu.governance'"),
    'registry names (string literals) survive the comments-only view')
  ok(!stCode.stripped.includes("registry.register('vmu.governance'"),
    'the comments+strings view blanks string contents (bindings cannot hide in strings)')
  // the documented hole: a COMMENT-only binding must no longer count ...
  const bind = (text, id) => new RegExp('(?:const|let|var)\\s+' + id + '\\b').test(stripComments(text, { strings: true }))
  ok(!bind(src + '\n// const ghostService = createGhost(\n', 'ghostService'),
    'a binding that exists only in a COMMENT does not count (round-7 bypass closed)')
  // ... and neither must a STRING containing one ...
  ok(!bind(src + '\nconst _s = "const ghostService2 = createGhost2("\n', 'ghostService2'),
    'a binding that exists only inside a STRING does not count')
  // ... while a REAL code binding still counts (control), and the hole is real without the stripper.
  ok(bind(src + '\nconst ghostService3 = createGhost3(\n', 'ghostService3'), 'a real code binding still counts (control)')
  ok(/(?:const|let|var)\s+ghostService\b/.test(src + '\n// const ghostService = createGhost(\n'),
    'without stripping, the same comment WOULD have counted (proves the hole was real)')

  // 6b) ROUND-8 REGRESSION SET (each case was an independent-review false red; length must stay exact):
  // a regex literal must not be read as a comment/string start, and U+2028/U+2029 must terminate `//`.
  const rounds8 = [
    ['a regex char class containing /*', 'const re = /[/*]/; const keep = createKeep('],
    ['a regex containing a backtick', 'const re = /`/; const keep = createKeep('],
    ['a regex char class containing a quote', 'const re = /["]/; const keep = createKeep('],
    ['a LINE SEPARATOR (U+2028) ending a line comment', '// comment\u2028const keep = createKeep('],
    ['a PARAGRAPH SEPARATOR (U+2029) ending a line comment', '// comment\u2029const keep = createKeep('],
    ['an escaped slash inside a regex', 'const re = /\\//; const keep = createKeep('],
    ['division still reading as division', 'const a = b / c; const keep = createKeep('],
    ['a CRLF shebang line', '#!/usr/bin/env node\r\nconst keep = createKeep('],
  ]
  for (const [label, probe] of rounds8) {
    const out = stripComments(probe, { strings: true })
    ok(out.length === probe.length, 'round-8 case keeps the exact length: ' + label, probe.length + ' vs ' + out.length)
    ok(/const keep = createKeep\(/.test(out), 'round-8 case keeps the following BINDING visible: ' + label)
  }
  // the reverse direction must keep working: a real comment is still blanked, so the orphan scan cannot be
  // fooled into shrinking (the round-8 false-green risk was a constructor set shrunk by a misread).
  const commentProbe = stripComments('// const ghostOrphan = createGhost(\nconst realOrphan = createReal(\n', { strings: true })
  ok(!/ghostOrphan/.test(commentProbe) && /const realOrphan = createReal\(/.test(commentProbe),
    'a real comment is blanked while real code after it stays visible (no shrunk constructor set)')
}

console.log('')
console.log('=== VMU SERVICE SURFACE: ' + passed + ' passed, ' + failed + ' failed (' + registered.size + ' registered) ===')
process.exit(failed === 0 ? 0 : 1)

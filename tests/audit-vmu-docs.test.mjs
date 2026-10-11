// vmu docs & surface audit — the repository-side guard for the vmu design set (docs/00–14).
//
// Until now the design set was guarded by a linter that lives OUTSIDE the repository (_oneoff/vmu/tools/
// check-docs.mjs). That means a clone of this package carries no guard of its own: the docs could drift
// from the code and no shipped job would notice. This job brings the essential checks in-repo, so the
// package's own gate covers its own documentation:
//
//   A. every design doc 00..14 exists and is non-trivial;
//   B. every `VMU_*` code that appears in the DOCS is registered in the 03 error-code table;
//   C. every `VMU_*` code that appears in the vmu CODE is registered there too (a code the code can throw
//      but the contract does not list is exactly the drift that made the docs useless before);
//   D. the docs<->module surface check (03 §2.1 rows vs the public surfaces the modules expose);
//   E. every doc that must declare its open questions has a "未核项" section (docs/02, 03, 08, 12 …).
//
// `tests/audit-vmu-docs.mutants.mjs` breaks each of these one at a time and requires the named red.

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = resolve(HERE, '..')
// INJECTED ROOTS (docs/11 §4.1 seam discipline): the mutant family points these at a mutated COPY, so the
// audit can be proven to fail without ever touching the real files.
const DOCS = process.env.VMU_DOCS_DIR ? resolve(process.env.VMU_DOCS_DIR) : join(REPO, 'vibe-math-vmu', 'docs')
const VMU = process.env.VMU_CODE_DIR ? resolve(process.env.VMU_CODE_DIR) : join(REPO, 'vibe-math-vmu')

let passed = 0, failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) passed++
  else { failed++; failures.push(name + (detail === undefined ? '' : ' [' + detail + ']')) }
}

// The doc set is DISCOVERED, never remembered: a hard-coded filename list drifts silently (the first
// version of this audit listed six names that do not exist).
const DOC_FILES = readdirSync(DOCS)
  .filter((f) => /^\d\d-[A-Za-z0-9-]+\.md$/.test(f))
  .map((f) => f.replace(/\.md$/, ''))
  .sort()
// The set is DISCOVERED *and it GROWS*: the volume map (00 §3) may add 15, 16, ... as the design phase
// expands, so the guard is a FLOOR plus CONTIGUITY from 00 - never an equality. The equality is what forced a
// growing design set into exactly fifteen files, which made the audit itself the bottleneck of the expansion.
ok(DOC_FILES.length >= 15, 'the design set has at least the 15 core docs (00..14)', DOC_FILES.join(','))
{
  const nums = DOC_FILES.map((n) => Number(n.slice(0, 2)))
  ok(nums.every((n, i) => n === i), 'the design set is numbered contiguously from 00 with no gaps', nums.join(','))
}

// ---- A. the design set exists and is non-trivial -------------------------------------------------
const docText = new Map()
ok(DOC_FILES.length > 0, 'non-vacuous: DOC_FILES must not be empty')
for (const name of DOC_FILES) {
  const p = join(DOCS, name + '.md')
  if (!existsSync(p)) { ok(false, 'design doc exists: ' + name, 'missing'); continue }
  const text = readFileSync(p, 'utf8')
  docText.set(name, text)
  ok(text.length > 800, 'design doc is non-trivial: ' + name, text.length + ' chars')
}
ok(docText.size === DOC_FILES.length, 'every design doc 00..14 is present',
  [...docText.keys()].length + '/' + DOC_FILES.length)

// ---- B. codes used in the DOCS are registered in 03's table --------------------------------------
const contract = docText.get('03-interface-contract') || ''
// A registration row may list SEVERAL codes in its first column (`| \`A\` / \`B\` |`), so every code in
// that column counts as registered - taking only the first one produced four false positives.
const registered = new Set()
for (const row of contract.matchAll(/^\| ([^|]+)\|/gm)) {
  // ANY registered code, including the SHARED-MODULE namespaces (`MATH_*`/`ARCHIVE_*`/`SCRIPT_*`) - the old
  // scan only read `VMU_*`, so the shared table could not have satisfied the checks that now include them.
  for (const m of row[1].matchAll(/`((?:VMU|MATH|ARCHIVE|SCRIPT)_[A-Z0-9_]+)`/g)) registered.add(m[1])
}
ok(registered.size >= 15, 'the error-code table registers a substantial set', registered.size)
// A FAMILY PREFIX (`VMU_ARCHIVE_`) is prose about a namespace, not a claim that a code exists. This used to
// also exempt any code CONTAINING "PACKID"/"REASON", which silently skipped REAL codes whose last segment is
// the word REASON (`VMU_REASON_REQUIRED`, `VMU_DELEGATION_REASON_REQUIRED`) - an independent reviewer proved
// the hole. The only placeholder form is the trailing-underscore family prefix.
const isPlaceholder = (code) => code.endsWith('_')
// SHARED-MODULE CODES (independent reviewer, round 5): the math / archive / script modules throw their own
// codes (`MATH_ENGINE_NOT_FOUND`, `ARCHIVE_RETENTION_EXCEEDED`, `SCRIPT_CHANGED_DURING_RUN`, ...) and the old
// scan only looked at `VMU_*`, so half of the "named refusals" were outside the registration gate entirely.
// They are registered in 03-§8's shared-module table and checked in BOTH directions from now on.
const CODE_RE = /\b((?:VMU|MATH|ARCHIVE|SCRIPT)_[A-Z0-9_]{3,})\b/g
const CODE_LITERAL_RE = /['"`]((?:VMU|MATH|ARCHIVE|SCRIPT)_[A-Z0-9_]{3,})['"`]/g
const codeUse = new Map()
for (const [name, text] of docText) {
  for (const m of text.matchAll(CODE_RE)) {
    const code = m[1]
    if (isPlaceholder(code)) continue
    if (!codeUse.has(code)) codeUse.set(code, new Set())
    codeUse.get(code).add(name)
  }
}
const unregisteredInDocs = [...codeUse.entries()]
  .filter(([code]) => !registered.has(code))
  .map(([code, docs]) => code + ' (' + [...docs].join(',') + ')')
ok(unregisteredInDocs.length === 0, 'every VMU_* code used in the docs is registered in 03-§8',
  unregisteredInDocs.slice(0, 8).join(' | '))

// ---- C. codes used in the CODE are registered too -------------------------------------------------
const codeFiles = []
const walk = (dir, depth) => {
  if (depth > 3) return
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue
    const p = join(dir, entry.name)
    if (entry.isDirectory()) { if (entry.name !== 'docs') walk(p, depth + 1) }
    else if (entry.name.endsWith('.js')) codeFiles.push(p)
  }
}
walk(VMU, 0)
ok(codeFiles.length >= 12, 'the vmu runtime modules were found for the code audit', codeFiles.length)
const codeCodes = new Map()
for (const file of codeFiles) {
  const text = readFileSync(file, 'utf8')
  // Only string literals that look like a code: quoted, or a `code:` field value. SHARED-MODULE prefixes are
  // included, so a new `MATH_*`/`ARCHIVE_*`/`SCRIPT_*` code the code can throw must be registered too.
  for (const m of text.matchAll(CODE_LITERAL_RE)) {
    if (!codeCodes.has(m[1])) codeCodes.set(m[1], new Set())
    codeCodes.get(m[1]).add(file.replace(VMU + '\\', '').replace(VMU + '/', ''))
  }
}
const unregisteredInCode = [...codeCodes.entries()]
  .filter(([code]) => !registered.has(code) && !code.startsWith('VMU_PACK_') && !isPlaceholder(code))
  .map(([code, files]) => code + ' (' + [...files].slice(0, 2).join(',') + ')')
ok(unregisteredInCode.length === 0,
  'every framework VMU_* code the CODE can throw is registered in 03-§8 (pack codes are namespaced)',
  unregisteredInCode.slice(0, 8).join(' | '))
{
  const packish = [...codeCodes.keys()].filter((c) => c.startsWith('VMU_PACK_') && !isPlaceholder(c))
  ok(packish.length > 0 && packish.every((c) => /^VMU_PACK_[A-Z0-9_]+$/.test(c)),
    'pack codes keep the VMU_PACK_<ID>_<REASON> shape (R-d)', packish.join(','))
}

// ---- D. docs 03 §2.1 rows vs the public surfaces the modules expose ------------------------------
{
  // The PUBLISHED services only (docs/03 §2 table ①). The bus is an internal handle, not a published
  // service, so it is not parity-checked here - and `vmu.prompt` is singular, which is what the code says.
  const MODULES = {
    'vmu.library': 'kernel/library.js',
    'vmu.members': 'kernel/members.js',
    'vmu.tasks': 'kernel/tasks.js',
    'vmu.store': 'kernel/store.js',
    'vmu.prompt': 'kernel/prompt/index.js',
    'vmu.middleware': 'kernel/bus.js',
    'vmu.work': 'kernel/work.js',
  }
  const publicKeys = (src) => {
    const SKIP = ['if', 'for', 'while', 'return', 'const', 'let', 'switch', 'try', 'catch', 'function']
    const blocks = []
    const OPENER = /(?:return |(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*)\{/g
    let hit
    while ((hit = OPENER.exec(src)) !== null) {
      const i = hit.index + hit[0].length - 1
      let depth = 0, j = i, end = -1
      const start = i + 1
      for (; j < src.length; j++) {
        if (src[j] === '{') depth++
        else if (src[j] === '}') { depth--; if (depth === 0) { end = j; break } }
      }
      if (end === -1) continue
      const keys = new Set()
      let methods = 0
      let d = 0
      for (const line of src.slice(start, end).split('\n')) {
        if (d === 0) {
          const t = line.trim()
          const m = /^(?:async\s+)?(?:get\s+|set\s+)?([A-Za-z_$][\w$]*)\s*[(,:]/.exec(t)
          if (m && !SKIP.includes(m[1])) keys.add(m[1])
          if (/^(?:async\s+)?[A-Za-z_$][\w$]*\s*\([^)]*\)\s*\{/.test(t)) methods++
        }
        d += (line.match(/[{([]/g) || []).length - (line.match(/[})\]]/g) || []).length
      }
      blocks.push({ keys, methods })
    }
    blocks.sort((a, b) => (b.methods - a.methods) || (b.keys.size - a.keys.size))
    return (blocks[0] && blocks[0].keys) || new Set()
  }
  const GLOBAL_SKIP = ['status', 'ok', 'root', 'file', 'dir']
  for (const [svc, rel] of Object.entries(MODULES)) {
    const rows = [...contract.matchAll(new RegExp('^\\| `' + svc.replace('.', '\\.') + '`.*$', 'gm'))]
    ok(rows.length > 0, 'contract row exists for ' + svc, 'missing')
    if (rows.length === 0) continue
    const row = rows[rows.length - 1][0]
    const impl = publicKeys(readFileSync(join(VMU, rel), 'utf8'))
    const DOC_SKIP = ['async', 'await', 'if', 'for', 'while', 'return', 'function', 'new', 'typeof']
    const documented = new Set([...row.matchAll(/`?([a-zA-Z][a-zA-Z0-9]*)\(/g)].map((m) => m[1]).filter((n) => !DOC_SKIP.includes(n)))
    const docOnly = [...documented].filter((d) => !impl.has(d))
    const implOnly = [...impl].filter((i) => !documented.has(i) && !GLOBAL_SKIP.includes(i))
    ok(docOnly.length === 0, svc + ': the contract does not document methods the module lacks', docOnly.join(','))
    ok(implOnly.length === 0, svc + ': the module does not expose methods the contract omits', implOnly.join(','))
  }
}

// ---- E. the docs that must state their open questions do -----------------------------------------
{
  // Derived from the DISCOVERED docs (a hard-coded list of names drifted the moment it was written).
  const NEEDS_OPEN = DOC_FILES.filter((name) => /^(02|03|08|12)-/.test(name))
  const missing = NEEDS_OPEN.filter((name) => !/未核项/.test(docText.get(name) || ''))
  ok(NEEDS_OPEN.length >= 3, 'the docs that must state open questions were found', NEEDS_OPEN.join(','))
  ok(missing.length === 0, 'every doc that must declare its open questions has a 未核项 section', missing.join(','))
}

// ---- F. the TOOL surface: what the docs name vs what the host registers ---------------------------
// The doc set is the interface contract, so a tool the manual tells a reader to call must exist - or the
// line that names it must SAY it does not exist yet. Twelve phantom tool names (`vibe_vmu_mw`,
// `vibe_vmu_pack`, ...) shipped in the manuals as if they were callable, and no gate noticed.
{
  const hostSrc = readFileSync(join(VMU, 'host.js'), 'utf8')
  const from = hostSrc.indexOf('export const TOOL_NAMES')
  const block = hostSrc.slice(from, hostSrc.indexOf('})', from))
  const implemented = new Set([...block.matchAll(/'(vibe_vmu_[a-z_]+)'/g)].map((m) => m[1]))
  ok(implemented.size >= 5, 'TOOL_NAMES was read out of host.js', [...implemented].join(','))

  const documented = new Map()
  for (const [name, text] of docText) {
    text.split('\n').forEach((line, i) => {
      for (const m of line.matchAll(/\b(vibe_vmu_[a-z_]+)\b/g)) {
        if (!documented.has(m[1])) documented.set(m[1], [])
        documented.get(m[1]).push({ doc: name, line: i + 1, text: line })
      }
    })
  }
  const missingInContract = [...implemented].filter((t) => !contract.includes('`' + t + '`'))
  ok(missingInContract.length === 0, 'every tool the host registers is registered in 03-§3', missingInContract.join(','))

  // `计划` is included deliberately: it is the natural Chinese word for "planned", and a volume that writes
  // "（计划）" IS marking the tool as not-yet-registered. The audit's job is that the reader is told, not that a
  // particular word is used; the volumes also use 规划/未实现/⛔ (docs/00 §4 fixes the vocabulary).
  const MARKERS = /未实现|未接线|规划|计划|提案|roadmap|⛔|待实现|目标形态|尚未/
  const unmarked = []
  for (const [name, hits] of documented) {
    if (implemented.has(name)) continue
    if (!hits.some((h) => MARKERS.test(h.text))) {
      unmarked.push(name + ' (' + hits[0].doc + ':' + hits[0].line + ')')
    }
  }
  ok(unmarked.length === 0,
    'every documented tool the host does NOT register is marked as unimplemented on the line that names it',
    unmarked.slice(0, 10).join(' | '))
}

// ---- G. the SETTINGS surface: documented keys must exist, and the wired column must be honest -----
{
  const { SETTING_DEFS } = await import(pathToFileURL(join(VMU, 'settings', 'schema.js')).href)
  const keys = new Set(SETTING_DEFS.map((d) => d.key))
  const namespaces = new Set([...keys].map((k) => k.split('.').slice(0, 2).join('.')))
  // Dotted names that are SERVICE/registry names or namespaces, not setting keys.
  const NON_SETTING = new Set(['vmu.prompt', 'vmu.library', 'vmu.members', 'vmu.tasks', 'vmu.store', 'vmu.bus',
    'vmu.kernel', 'vmu.settings', 'vmu.rules', 'vmu.bridge', 'vmu.loader', 'vmu.registry', 'vmu.meetings',
    'vmu.budget', 'vmu.packs', 'vmu.middleware', 'vmu.records', 'vmu.core', 'vmu.limits', 'vmu.safety',
    'vmu.math', 'vmu.ballot', 'vmu.meeting', 'vmu.schema', 'vmu.status',
    // ROUND 108: the five `vmu.ip.*` service surfaces (fifteen knobs and these five make the twenty the module
    // declares). Dotted like keys, but no pack can tune a method name.
    'vmu.ip.hold', 'vmu.ip.ownership', 'vmu.ip.contributors', 'vmu.ip.recordSearch', 'vmu.ip.transfer'])
  const bogus = new Set()
  for (const [name, text] of docText) {
    for (const m of text.matchAll(/\bvmu\.[a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9]+)+\b/g)) {
      const k = m[0]
      // A FAMILY wildcard (`vmu.math.lean*`) is prose about a family, not a claim about a key.
      const after = text.slice(m.index + k.length, m.index + k.length + 1)
      if (after === '*' || after === '…') continue
      if (keys.has(k) || NON_SETTING.has(k) || namespaces.has(k)) continue
      bogus.add(k + ' (' + name + ')')
    }
  }
  // ROUND 99: same rule and same set as the planned gate, but this file imports the file helpers rather than
  // `docVolumes` - calling that helper here is what made an earlier attempt throw a ReferenceError instead of
  // failing an assertion, which is a much worse way to learn that a name is missing.
  {
    const documented = new Set()
    // ROUND 100: reuse the text this gate ALREADY loaded through its binding. Reading the files directly here
    // bypassed the binding the mutation suite injects, so all fourteen mutants failed with a readdir error
    // instead of testing what they were written to test - a green audit and a fully red mutant suite.
    for (const [, text] of docText) {
      for (const m of text.matchAll(/\bvmu\.[a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9]+)+\b/g)) documented.add(m[0])
    }
    for (const entry of [...bogus]) {
      const k = entry.split(" (")[0]
      if ([...documented].some((o) => o !== k && o.startsWith(k + "."))) bogus.delete(entry)
    }
  }
  ok(bogus.size === 0, 'every vmu.* key named in the docs exists in settings/schema.js', [...bogus].slice(0, 8).join(' | '))

  const settingsDoc = docText.get(DOC_FILES.find((n) => /^04-/.test(n))) || ''
  // Concrete key rows only: the table also carries namespace PATTERN rows (`vmu.core.*`) which describe a
  // family rather than a key, so they neither need a wired marker nor count towards the key total.
  const rows = settingsDoc.split('\n').filter((l) => /^\| `vmu\.[a-zA-Z0-9.]+`/.test(l))
  ok(rows.length > 0 && SETTING_DEFS.length > 0, '04 §11 really has key rows and the registry really declares keys (non-vacuous comparison)',
    rows.length + ' rows / ' + SETTING_DEFS.length + ' declared')
  ok(rows.length - SETTING_DEFS.length === 0, '04 §11 has exactly one row per declared key', rows.length + '/' + SETTING_DEFS.length)
  const unmarkedRows = rows.filter((r) => !/已接线|未接线/.test(r))
  ok(unmarkedRows.length === 0, 'every settings row states whether the key is WIRED (no silent promises)',
    unmarkedRows.slice(0, 3).map((r) => (r.split('|')[1] || '').trim()).join(','))

  // Independently recompute the wired set: a key is wired when its literal appears in the runtime sources.
  const runtimeFiles = ['vibe-math-vmu.js', 'host.js', 'host-hooks.js', 'host-spawn.js'].map((f) => join(VMU, f))
  const walkRuntime = (dir, depth) => {
    if (depth > 3 || !existsSync(dir)) return
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', 'docs', 'settings'].includes(e.name)) continue
      const p = join(dir, e.name)
      if (e.isDirectory()) walkRuntime(p, depth + 1)
      else if (e.name.endsWith('.js') && !['math-computation.js', 'math-engines.js'].includes(e.name)) runtimeFiles.push(p)
    }
  }
  walkRuntime(VMU, 0)
  const runtimeText = runtimeFiles.filter((f) => existsSync(f)).map((f) => readFileSync(f, 'utf8')).join('\n')
  const trulyUnwired = new Set(SETTING_DEFS.filter((d) => !runtimeText.includes("'" + d.key + "'")).map((d) => d.key))
  const claimedUnwired = new Set(rows.filter((r) => /未接线/.test(r))
    .map((r) => ((r.match(/`(vmu\.[a-zA-Z0-9.]+)`/) || [])[1])).filter(Boolean))
  const claimedWired = new Set(rows.filter((r) => /已接线/.test(r))
    .map((r) => ((r.match(/`(vmu\.[a-zA-Z0-9.]+)`/) || [])[1])).filter(Boolean))
  const lyingWired = [...claimedWired].filter((k) => trulyUnwired.has(k))
  const lyingUnwired = [...claimedUnwired].filter((k) => !trulyUnwired.has(k))
  ok(lyingWired.length === 0, 'no key is claimed WIRED while no runtime source reads it', lyingWired.slice(0, 8).join(','))
  ok(lyingUnwired.length === 0, 'no key is marked unwired although a runtime source reads it', lyingUnwired.slice(0, 8).join(','))
  ok(claimedUnwired.size > 0, 'the doc set admits which keys are declared-but-not-wired (today: ' + claimedUnwired.size + ')')
}

// ---- H. the real WIRING surface is documented ----------------------------------------------------
// The shipped plugin is configured with `config.packs` / `config.modules` / `config.scripts` on its profile
// row. None of those appeared anywhere in the docs, so no reader could actually install a pack or a module.
{
  const all = [...docText.values()].join('\n')
  const missing = ['config.packs', 'config.modules', 'config.scripts'].filter((k) => !all.includes(k))
  ok(missing.length === 0, 'the docs state the real wiring surface (config.packs / config.modules / config.scripts)',
    missing.join(','))
}

// ---- I. every registered vmu hook is EMITTED or explicitly declared as not-yet-emitted -----------------
// A registered hook with no producer is a挂点 that silently never fires - exactly the failure mode docs/02
// §2 used to hide (it listed hook domains that nothing emits). The check is two-sided on purpose: a hook
// that has no producer must be declared, AND a declared hook that HAS gained a producer must leave the list.
{
  const busSrc = readFileSync(join(VMU, 'kernel', 'bus.js'), 'utf8')
  const from = busSrc.indexOf('export const VU_HOOKS')
  const block = busSrc.slice(from, busSrc.indexOf('])', from))
  const registered = [...new Set([...block.matchAll(/'([a-z0-9-]+\/[a-z0-9-]+)'/g)].map((m) => m[1]))]
  ok(registered.length >= 15, 'the registered vmu hooks were read out of bus.js', registered.length)

  const emitted = new Set()
  const kernelFiles = [join(VMU, 'vibe-math-vmu.js'), join(VMU, 'host-hooks.js')]
  for (const dir of ['kernel', 'packs']) {
    const abs = join(VMU, dir)
    if (!existsSync(abs)) continue
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        for (const sub of readdirSync(join(abs, entry.name), { withFileTypes: true })) {
          if (sub.name.endsWith('.js')) kernelFiles.push(join(abs, entry.name, sub.name))
        }
      } else if (entry.name.endsWith('.js') && entry.name !== 'bus.js') kernelFiles.push(join(abs, entry.name))
    }
  }
  for (const file of kernelFiles) {
    const emits = [...readFileSync(file, 'utf8').matchAll(/bus\.emit\('([^']+)'/g)]
    // EMPTY_ALLOWED: 有些 kernel 文件本来就不发起 bus 事件（本扫描是"收集全体发射者"），空集即合规；
    // 全体规模由下面的 `emitted.size >= 10` 把关，不会被空集掩盖。
    for (const m of emits) emitted.add(m[1])
  }
  ok(emitted.size >= 10, 'the emitter scan found the real producers', [...emitted].sort().join(','))

  // Declared gaps: registered, no producer yet. Keeping this list HONEST is the point (docs/05 §4.3).
  // Two hooks have LEFT this list in this session, each the moment a real producer appeared: the drifted
  // `prompt/assemble` was replaced by the frozen `prompt/section-assembled`, and `budget/exceeded` gained a
  // producer in kernel/fairness.js (the doc-side row in 05 was corrected in the same change).
  // `record/appended` LEFT this list in round 32: kernel/compliance.js:89 really emits it (so do domaingate,
  // handover and minutes), which made this list stale - and a stale exemption is exactly the kind of "the checker
  // stopped seeing it" state this suite exists to catch. Removing it TIGHTENS the audit; the remaining three have
  // no producer anywhere.
  const KNOWN_UNEMITTED = new Set(['turn/reply-parsed', 'record/append-before',
    'pack/loading', 'pack/loaded'])
  const missing = registered.filter((h) => !emitted.has(h) && !KNOWN_UNEMITTED.has(h))
  ok(missing.length === 0,
    'every registered vmu hook is either EMITTED or explicitly listed as not-yet-emitted',
    missing.join(','))
  const stale = [...KNOWN_UNEMITTED].filter((h) => emitted.has(h))
  ok(stale.length === 0,
    'and the not-yet-emitted list does not hide hooks that already gained a producer', stale.join(','))
}

const out = '=== VMU DOCS AUDIT: ' + passed + ' passed, ' + failed + ' failed ==='
console.log(out)
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)

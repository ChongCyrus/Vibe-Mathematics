// TB-2704 — a hint may only name commands the reader can actually type.
//
// THE DISEASE (measured): `vibe-math-vmu/kernel/members.js` said 「roster() shows who is live」 in two refusals
// (wake() of an ended member, selfReport() of an ended member). `roster()` is the kernel's INTERNAL seam — every
// caller in the tree holds the member object (`kernel/index.js`, `host.js`, `kernel/bidding.js`,
// `kernel/delegation.js`); no tool by that name exists, so a model holding only the receipt cannot copy the hint.
// This is the same family as TB-2694 / F75-17 (`VMU_NO_SUCH_OBJECT`'s 「the roster holds the live ids」).
//
// THE JUDGE: the set of "commands a seat can type" is COMPUTED from the two production declarations
// (`host.js#toolSpecs()` + `packs/v5r/tools.js#V5R_PACK_TOOLS`), never hand-written. Any `name()` occurrence inside
// a hint that does not resolve there is a red. The scanner is itself tested against the old sentence (§7) — a judge
// that cannot catch the original disease is not a judge.
//
// THE SHAPE: both hints must be BYTE-IDENTICAL to the pack's `ROSTER_ID_REACHABLE_HINT` (TB-2694 D 段). The kernel
// cannot import a pack (the pack imports the kernel), so the "one copy" rule degrades to "several copies, provably
// identical" per TB-2704 §6.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createMembers, ROSTER_ID_REACHABLE_HINT } from '../vibe-math-vmu/kernel/members.js'
import * as host from '../vibe-math-vmu/host.js'
import { V5R_PACK_TOOLS } from '../vibe-math-vmu/packs/v5r/tools.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) { passed++; console.log('  ok   ' + name) } else { failed++; failures.push(name + ' :: ' + JSON.stringify(detail)); console.log('  FAIL ★★★ ' + name + ' :: ' + JSON.stringify(detail)) }
}
const has = (text, needle, name) => ok(typeof text === 'string' && text.includes(needle), name, typeof text === 'string' ? text.slice(0, 300) : text)
const hasNot = (text, needle, name) => ok(typeof text === 'string' && !text.includes(needle), name, typeof text === 'string' ? text.slice(0, 300) : text)

const REPO = new URL('../', import.meta.url)
const MEMBERS_SRC = readFileSync(new URL('../vibe-math-vmu/kernel/members.js', import.meta.url), 'utf8')
const PACK_SRC = readFileSync(new URL('../vibe-math-vmu/packs/v5r/tools.js', import.meta.url), 'utf8')

// ── the COMPUTED command set: the same two declarations the production registration path uses ─────────────────────
const kernelStub = () => {
  const target = function stub() {}
  const handler = {
    get(_t, key) { return key === 'then' ? undefined : target },
    apply() { return target },
    construct() { return target },
  }
  return new Proxy(target, handler)
}
const derivedCommands = () => {
  const names = new Set()
  const params = new Set()
  const explicit = {}
  for (const row of host.TOOL_FACES) explicit[row.face] = true
  const packLoader = () => ({ tools: [] })
  const kernel = kernelStub()
  const faces = host.resolveFaces({ config: {}, settings: {}, kernel, explicit, declaredKeys: 1, scripts: ['vmu-run2704'], packLoader })
  const specs = host.toolSpecs({
    kernel,
    settings: {},
    assertDeclared: () => {},
    faces,
    scripts: ['vmu-run2704'],
    packLoader,
    instance: {},
    publishedSurface: () => ({ names: [], reasons: {}, evaluations: [] }),
    promptSection: {},
  })
  for (const spec of specs) {
    if (!spec || typeof spec.name !== 'string') continue
    names.add(spec.name)
    for (const k of Object.keys(spec.parameters || {})) params.add(k)
  }
  for (const row of V5R_PACK_TOOLS) {
    if (!row || typeof row.name !== 'string') continue
    names.add(row.name)
    for (const k of Object.keys(row.parameters || {})) params.add(k)
  }
  return { names, params }
}
const COMMANDS = derivedCommands()
// A hint is a STRING the model copies. Scan only the hint literals of members.js — scanning the whole source would
// flag the module's own JavaScript (`Map()`, `hire()`, `clock()`), and scanning raw text would read the apostrophes
// inside comments as string delimiters. So: strip comments first (string-aware), then take the literals.
const stripComments = (src) => {
  let out = ''
  let i = 0
  let quote = null
  while (i < src.length) {
    const c = src[i]
    const n = src[i + 1]
    if (quote) {
      out += c
      if (c === '\\') { out += n === undefined ? '' : n; i += 2; continue }
      if (c === quote) quote = null
      i += 1
      continue
    }
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i += 1; continue }
    if (c === '/' && n === '*') {
      const end = src.indexOf('*/', i + 2)
      i = end === -1 ? src.length : end + 2
      continue
    }
    if (c === "'" || c === '"' || c === '`') { quote = c; out += c; i += 1; continue }
    out += c
    i += 1
  }
  return out
}
const stringLiterals = (src) => {
  const out = []
  const re = /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g
  let m
  while ((m = re.exec(src)) !== null) out.push(m[1] !== undefined ? m[1] : m[2])
  return out
}
const MEMBERS_CODE = stripComments(MEMBERS_SRC)
const HINT_LITERALS = stringLiterals(MEMBERS_CODE).filter((s) => s.includes('REACHABLE INSTEAD') || s.includes('roster()'))
// The old disease sentence must be catchable by the SAME scanner: `roster` is not a tool the seat can type.
// A parameter is never callable, so `name()` resolves only against tool names — otherwise a parameter called
// `roster` would launder the old sentence back into "copyable".
const scanCallLikeNames = (text) => {
  const out = []
  const re = /(?:^|[^A-Za-z0-9_.])([A-Za-z_][A-Za-z0-9_]*)\s*\(\s*\)/g
  let m
  while ((m = re.exec(String(text || ''))) !== null) out.push(m[1])
  return out
}
const unresolvedIn = (text) => scanCallLikeNames(text).filter((n) => !COMMANDS.names.has(n))

console.log('── §1 the two members.js hints no longer teach `roster()`')
ok(HINT_LITERALS.length >= 1, '§1a members.js still has a hint literal to inspect (the check is not vacuous)', { hintLiteralCount: HINT_LITERALS.length })
ok(!HINT_LITERALS.some((s) => s.includes('roster()')), '§1b NO hint literal in members.js teaches `roster()` (the internal kernel seam)', { hints: HINT_LITERALS.map((s) => s.slice(0, 90)) })
const badCalls = HINT_LITERALS.flatMap((s) => unresolvedIn(s))
ok(badCalls.length === 0, '§1c every call-shaped name in a members.js hint is a tool the registry mounts', { badCalls, sampleCommands: Array.from(COMMANDS.names).slice(0, 5) })

console.log('── §2 both refusals carry the SAME sentence, byte for byte')
const members = createMembers({ slots: [{ id: 'member', capacity: 0 }], clock: () => 1000 })
await members.hire({ id: 'r-1', slot: 'member' })
await members.end('r-1', 'tb2704')
let wakeHint = null
let wakeCode = null
try { await members.wake('r-1', 'do a turn') } catch (e) { wakeCode = e && e.code; wakeHint = e && e.hint }
ok(wakeCode === 'VMU_STATE', '★ §2a wake() of an ended member still refuses by name (VMU_STATE)', { wakeCode })
ok(wakeHint === ROSTER_ID_REACHABLE_HINT, '★★★ §2b wake()\'s hint IS the copyable sentence (byte-identical to the exported constant)', { wakeHint })
let reportHint = null
let reportCode = null
try { await members.selfReport('r-1', { overall: 'still here' }) } catch (e) { reportCode = e && e.code; reportHint = e && e.hint }
ok(reportCode === 'VMU_STATE', '★ §2c selfReport() of an ended member still refuses by name (VMU_STATE)', { reportCode })
ok(reportHint === ROSTER_ID_REACHABLE_HINT, '★★★ §2d selfReport()\'s hint IS the same sentence (the two sites cannot drift apart)', { reportHint })
// The THIRD site (members.js#member(): 「no member with id」) is the same disease one level down — the walk found it,
// not the taskbook. Same sentence, proven behaviorally: an unknown id must not teach `roster()` either.
let unknownHint = null
let unknownCode = null
try { await members.wake('ghost-42', 'do a turn') } catch (e) { unknownCode = e && e.code; unknownHint = e && e.hint }
ok(unknownCode === 'VMU_NO_SUCH_OBJECT', '★ §2e an unknown member id is still refused by name (VMU_NO_SUCH_OBJECT)', { unknownCode })
ok(unknownHint === ROSTER_ID_REACHABLE_HINT, '★★★ §2f the unknown-id hint is the SAME copyable sentence (the inner site cannot keep teaching `roster()`)', { unknownHint })

console.log('── §3 the sentence is COPYABLE: who → how to list → how to verify')
for (const [label, hint] of [['wake', wakeHint], ['selfReport', reportHint]]) {
  has(hint, 'REACHABLE INSTEAD:', '★★ §3a ' + label + ' hint carries the ASCII prefix a model can recognise')
  has(hint, 'vibe_v5_overview', '★★ §3b ' + label + ' hint names the tool that reveals the live roster')
  has(hint, '{member:"<你的 id>"}', '★★ §3c ' + label + ' hint names the real PARAMETER (`member`) and the placeholder to fill')
  has(hint, 'state:"live"', '★★ §3d ' + label + ' hint says which rows are alive (not just "some ids")')
  has(hint, 'vibe_v5_inbox', '★★ §3e ' + label + ' hint names the second call (verify the id can receive)')
  has(hint, '{action:"list", member:"<roster id>"}', '★★ §3f ' + label + ' hint spells the second call out completely')
  has(hint, '<roster id>', '★★ §3g ' + label + ' hint tells the reader to reuse a ROSTER id (not invent one)')
}

console.log('── §4 every vibe_* name in the hints is a REAL registered tool (computed, not a hand list)')
for (const [label, hint] of [['wake', wakeHint], ['selfReport', reportHint]]) {
  const mentioned = Array.from(new Set(String(hint || '').match(/vibe_[a-z0-9_]+/g) || []))
  const missing = mentioned.filter((n) => !COMMANDS.names.has(n))
  ok(mentioned.length >= 2 && missing.length === 0,
    '★★★ §4 ' + label + ' names only tools the registry actually mounts', { mentioned, missing, registrySize: COMMANDS.names.size })
}

console.log('── §5 no call-shaped name survives in the hint text')
for (const [label, hint] of [['wake', wakeHint], ['selfReport', reportHint]]) {
  const names = scanCallLikeNames(hint)
  const unresolved = unresolvedIn(hint)
  ok(unresolved.length === 0, '★★★ §5 ' + label + ' hint contains no `name()` the seat cannot type', { names, unresolved })
}

console.log('── §6 the kernel copy and the pack copy cannot drift (cross-module duplication, proven)')
const packConst = (PACK_SRC.match(/const ROSTER_ID_REACHABLE_HINT = '((?:[^'\\]|\\.)*)'/) || [])[1] || null
ok(packConst !== null, '★ §6a the pack constant is still a single quoted literal we can read', packConst === null ? 'NOT FOUND' : packConst.slice(0, 80))
ok(packConst !== null && packConst === ROSTER_ID_REACHABLE_HINT, '★★★ §6b the kernel\'s sentence is BYTE-IDENTICAL to packs/v5r/tools.js#ROSTER_ID_REACHABLE_HINT', { pack: packConst, kernel: ROSTER_ID_REACHABLE_HINT })

console.log('── §7 the judge itself catches the old disease (a judge that cannot red is not a judge)')
const oldNames = scanCallLikeNames('roster() shows who is live')
const oldUnresolved = unresolvedIn('roster() shows who is live')
ok(oldNames.includes('roster') && oldUnresolved.includes('roster'),
  '★★★ §7a the scanner flags the OLD sentence (`roster()` is not a tool the seat can type)', { oldNames, oldUnresolved })
ok(!COMMANDS.names.has('roster'), '★★ §7b …because `roster` is not in the computed tool set (it is an internal kernel seam)', { names: Array.from(COMMANDS.names).length, hasRoster: COMMANDS.names.has('roster') })

console.log('\n' + '─'.repeat(60))
console.log('── §8 WHOLE TREE (TB-2708): every hint in kernel/, tools/, packs/ (and the rest of the tree)')

// The population is the same one the TB-2704 inventory measured: hint literals in `vibe-math-vmu/**` and `scripts/**`.
// A hint is: the LAST argument of `refuse('CODE', msg, hint)` and any `hint: '…'` property. JSDoc prose is not a hint.
const REPO_PATH = fileURLToPath(new URL('../', import.meta.url))
const walkJs = (dir) => {
  const out = []
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name)
    const st = statSync(abs)
    if (st.isDirectory()) out.push(...walkJs(abs))
    else if (/\.m?js$/.test(name)) out.push(abs)
  }
  return out
}
const splitTopLevel = (inner) => {
  const parts = []
  let depth = 0
  let quote = null
  let start = 0
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i]
    if (quote) { if (c === '\\') i += 1; else if (c === quote) quote = null; continue }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue }
    if (c === '(' || c === '[' || c === '{') depth += 1
    else if (c === ')' || c === ']' || c === '}') depth -= 1
    else if (c === ',' && depth === 0) { parts.push(inner.slice(start, i)); start = i + 1 }
  }
  parts.push(inner.slice(start))
  return parts
}
const literalText = (expr) => {
  const trimmed = expr.trim()
  const m = trimmed.match(/^'((?:[^'\\]|\\.)*)'$/) || trimmed.match(/^"((?:[^"\\]|\\.)*)"$/)
  return m ? m[1] : null
}
const relOf = (abs) => abs.slice(REPO_PATH.length).split('\\').join('/')
const collectHints = (files) => {
  const hints = []
  for (const file of files) {
    const src = readFileSync(file, 'utf8')
    const lineOf = (index) => src.slice(0, index).split('\n').length
    let idx = 0
    while ((idx = src.indexOf('refuse(', idx)) !== -1) {
      let i = idx + 'refuse('.length
      let depth = 1
      let quote = null
      while (i < src.length && depth > 0) {
        const c = src[i]
        if (quote) { if (c === '\\') i += 1; else if (c === quote) quote = null; i += 1; continue }
        if (c === "'" || c === '"' || c === '`') { quote = c; i += 1; continue }
        if (c === '(') depth += 1
        else if (c === ')') depth -= 1
        i += 1
      }
      const args = splitTopLevel(src.slice(idx + 'refuse('.length, i - 1))
      const last = args.length >= 3 ? literalText(args[args.length - 1]) : null
      if (last) hints.push({ file: relOf(file), line: lineOf(idx), text: last })
      idx = i
    }
    for (const m of src.matchAll(/hint\s*[:=]\s*(['"])((?:\\.|(?!\1).)*)\1/g)) hints.push({ file: relOf(file), line: lineOf(m.index), text: m[2] })
  }
  return hints
}
const HINTS = collectHints(walkJs(join(REPO_PATH, 'vibe-math-vmu')).concat(walkJs(join(REPO_PATH, 'scripts'))))
const OCCURRENCE = new Map()
for (const h of HINTS) {
  for (const name of scanCallLikeNames(h.text)) {
    const key = h.file + ':' + h.line + ':' + name
    if (!OCCURRENCE.has(key)) OCCURRENCE.set(key, { file: h.file, line: h.line, name })
  }
}
// Whole tree ONLY (TB-2708 §2): the口径 the taskbook states is "resolvable as a tool name OR a parameter name".
// `list()`/`archive()`/`open()` are ACTION names a seat reaches through their tool's `action` parameter, so a param
// match counts here. The members.js check above stays TOOL-ONLY on purpose (TB-2704 §7: a parameter named `roster`
// must not launder the old sentence). Both sets are COMPUTED, never hand-written.
const wholeTree = (name) => COMMANDS.names.has(name) || COMMANDS.params.has(name)
const live = [...OCCURRENCE.values()].filter((o) => !wholeTree(o.name))

// The TB-2704 inventory measured 58 un-typable mentions. This judge keeps that number as the BASELINE: every one of
// the 58 must now be either FIXED into a real tool name (it disappears from `live`) or REGISTERED with a per-item
// `why` naming its reader. `fixed + registered === 58` is the conservation law, so a silent deletion is as red as a
// silent addition.
const BASELINE_UNRESOLVABLE = 58
const ALLOWLIST_PATH = join(REPO_PATH, 'docs/acceptance/hint-author-facing-allowlist.json')
let allowlist = []
try { allowlist = JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf8')) } catch (e) { allowlist = null }
const entries = Array.isArray(allowlist) ? allowlist : (allowlist && Array.isArray(allowlist.entries) ? allowlist.entries : [])
const liveByKey = new Map(live.map((o) => [o.file + ':' + o.line + ':' + o.name, o]))
const READERS = /(host author|kernel author|seat)/i
const blockers = []
const stale = []
const malformed = []
const seen = new Set()
for (const e of entries) {
  const key = e && typeof e.file === 'string' && Number.isInteger(e.line) && typeof e.name === 'string' ? e.file + ':' + e.line + ':' + e.name : null
  const whyOk = e && typeof e.why === 'string' && e.why.length >= 24 && READERS.test(e.why)
  const ownerOk = e && typeof e.owner === 'string' && e.owner.length >= 2
  if (!key || !whyOk || !ownerOk) { malformed.push({ entry: e, whyOk, ownerOk }); continue }
  if (seen.has(key)) { malformed.push({ entry: e, duplicateKey: key }); continue }
  seen.add(key)
  if (!liveByKey.has(key)) stale.push(e)
}
for (const [key, o] of liveByKey) if (!seen.has(key)) blockers.push(o.file + ':' + o.line + ' ' + o.name + '()')
const registered = entries.length - stale.length - malformed.length
const fixed = BASELINE_UNRESOLVABLE - live.length
console.log('WHOLE-TREE HINTS: hintLiterals=' + HINTS.length + ' callMentions=' + OCCURRENCE.size + ' unresolvable=' + live.length +
  ' registered=' + registered + ' fixed=' + fixed + ' (fixed+registered === ' + BASELINE_UNRESOLVABLE + ')')
ok(HINTS.length > 500 && OCCURRENCE.size > 50, '§8a the whole-tree sweep is not vacuous (it really reads the tree)', { hintLiterals: HINTS.length, callMentions: OCCURRENCE.size })
ok(Array.isArray(entries), '§8b the allowlist is a readable array (or {entries:[…]})', allowlist === null ? 'MISSING FILE: ' + ALLOWLIST_PATH : typeof allowlist)
ok(blockers.length === 0, '★★★ §9a no BLOCKER: every un-typable name is either fixed into a real tool or individually registered', { blockers: blockers.slice(0, 80), blockerCount: blockers.length })
ok(stale.length === 0, '★★★ §9b no STALE: every registered entry still exists at its file:line (the allowlist is not a trash can)', { stale: stale.slice(0, 20), staleCount: stale.length })
ok(malformed.length === 0, '★★★ §9c every entry is well-formed: file+line+name, why ≥24 chars naming the reader (host author / kernel author / seat), owner, no duplicate key', { malformed: malformed.slice(0, 10), malformedCount: malformed.length })
ok(registered === entries.length && seen.size === registered && live.length === registered,
  '★★★ §9d SET conservation: the registered set IS the live un-typable set (not merely an equal count)', { registered, liveUnTypable: live.length, entries: entries.length, matchedKeys: seen.size })
ok(fixed >= 0 && fixed + registered === BASELINE_UNRESOLVABLE,
  '★★★ §9e baseline accounting: ' + BASELINE_UNRESOLVABLE + ' un-typable mentions = ' + fixed + ' fixed + ' + registered + ' registered', { fixed, registered })

console.log('\n' + '─'.repeat(60))
if (failed === 0) {
  console.log('hint names real commands (TB-2704 members.js + TB-2708 whole tree): ' + passed + ' passed, 0 failed')
  console.log('RESULT: PASS')
} else {
  console.log('hint names real commands (TB-2704 members.js + TB-2708 whole tree): ' + passed + ' passed, ' + failed + ' failed')
  console.log('FAILURES:')
  for (const f of failures) console.log('  · ' + f)
  console.log('RESULT: FAIL')
  process.exitCode = 1
}

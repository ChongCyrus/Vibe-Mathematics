#!/usr/bin/env node
// scripts/check-rule-parity.mjs — the end-to-end parity check between the RULE document, its ledger, and the
// LIVE teaching (G7).
//
// WHY THIS EXISTS. `check-rules-coverage.mjs` proves that every claim in the ledger resolves to a file: a renamed
// symbol reds it. That is citation-checking, and it has two blind spots that a rule-by-rule implementation can
// fall into:
//
//   ① the ledger may CITE a file that is not live teaching at all. `packs/v5r/prompts/v5r-prompts.js` is a
//      historical corpus capture and `v5r-persona.js` is dead data (v5r-core.js:404-406 says the runtime renders
//      the hand-written charter instead) — citing either would make "the teaching says it" true about text nobody
//      reads.
//   ② live teaching may exist that NO rule claims. A block added for one round and forgotten is drift: the
//      teaching says something the ledger does not map to a rule line, so nothing keeps it true.
//
// This gate computes the LIVE set from the IMPORT GRAPH (starting at prompts/v5r-core.js, following relative
// imports, minus an explicit deny list with a reason each), then checks four parities of the LEDGER:
//
//   P1  every rule line 1..source.lineCount is claimed by a ruleLines range
//   P2  no ledger evidence cites a non-live prompt file (a citation must point at text a seat actually reads)
//   P3  every live prompt file is cited by at least one ledger item (no orphan teaching)
//   P4  every item id named in tests/vmu-ledger-teaching-pins.test.mjs exists in the ledger (no orphan pin)
//
// …plus three parities of the DECLARATIONS the teaching rests on:
//
//   P5  every tool id a live teaching file names is declared by some face (no invented capability)
//   P6  a seat's teaching bullet names only tools that SAME seat may call. Both halves live in ONE file
//       (vibe-math-vmu/packs/v5r/seat-faces.js): `SEAT_TOOL_FACES` is the ACL, `SEAT_TEACHING` is what the prompt
//       renders. Comparing them here is what makes "the prompt says you may X" and "the face lets you X" one fact
//       instead of two documents that can drift; the file's own test compares them too, and this gate does not assume
//       that test ran. If the bullets cannot be read the gate fails by name (`…_SEAT_FACE_BULLET_UNPARSED`) rather
//       than passing on an empty parse.
//   P7  every setting key a live teaching prompt names is declared in vibe-math-vmu/settings/schema.js. A prompt that
//       tells a seat to set `vmu.x.y` while no `key: 'vmu.x.y'` exists is teaching a key that `vibe_v5_configure` /
//       `vibe_v5_set` will refuse as undeclared — the school tells its researchers about a dial it does not have.
//       Only the five live teaching files are scanned; historical capture snapshots are not (see the constant below).
//
// ✓ node scripts/check-rule-parity.mjs
// ✓ node scripts/check-rule-parity.mjs --json
// ✓ node scripts/check-rule-parity.mjs --ledger other.json
// ✓ node scripts/check-rule-parity.mjs --selftest     # plants every failure (in temp ledger copies / in-memory text);
//                                                     # each planted defect must be caught, each negative control clean
//
// Exit codes: 0 = every parity holds; 1 = at least one problem (or a selftest case did not behave as declared).
import { readFileSync, existsSync, writeFileSync, mkdtempSync, rmSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const JSON_OUT = args.includes('--json')
const SELFTEST = args.includes('--selftest')
const ledgerArg = (() => {
  const i = args.indexOf('--ledger')
  if (i >= 0 && args[i + 1]) return args[i + 1]
  const eq = args.find((a) => a.startsWith('--ledger='))
  return eq ? eq.slice('--ledger='.length) : null
})()

const PROMPTS_REL = 'vibe-math-vmu/packs/v5r/prompts'
const PROMPTS_DIR = join(REPO, PROMPTS_REL)
const CORE = 'v5r-core.js'
const PINS_TEST = 'tests/vmu-ledger-teaching-pins.test.mjs'

// P6 reads ONE file: the seat ACL and the bullet text are declared side by side there, which is the whole point of the
// refactor that created it (before it, the prompt WAS the ACL, reverse-derived from whatever bullets somebody wrote).
const SEAT_FACES_REL = 'vibe-math-vmu/packs/v5r/seat-faces.js'
const SEAT_IDS_ORDER = ['chair', 'member', 'temp']

// P7's declared sources. Hand-picked and NARROW on purpose: these five are what a seat actually reads. `v5r-prompts.js`
// is a historical corpus capture and `v5r-persona.js` is dead data, so a setting key named only there is not taught to
// anybody — holding the schema to it would red the gate for text nobody reads (and would invite exemptions that hide a
// live drift). The list is explicit because "the live teaching" for this check is a fact about these files, not
// something to re-derive; the P2/P3 live set still comes from the import graph.
const PROMPT_SETTING_SCAN_FILES = [
  'vibe-math-vmu/packs/v5r/prompts/v5r-blocks-a.js',
  'vibe-math-vmu/packs/v5r/prompts/v5r-blocks-b.js',
  'vibe-math-vmu/packs/v5r/prompts/v5r-core.js',
  'vibe-math-vmu/packs/v5r/seat-faces.js',
  'vibe-math-vmu/packs/v5r/prompts/v5r-paper-prompts.js',
]
const SCHEMA_REL = 'vibe-math-vmu/settings/schema.js'

// Not live teaching, with the reason a citation of it would be false.
const NON_TEACHING = {
  'v5r-prompts.js': 'historical corpus capture (SOURCE_REL/SHA256), not rendered to any seat',
  'v5r-persona.js': 'dead persona data: v5r-core.js says the runtime renders the hand-written charter instead',
}

function walk(dir) {
  return readFileSync // placeholder to keep the linter quiet about unused imports
}

const problems = []
const note = []
const fail = (code, message, detail) => problems.push({ code, message, detail: detail || null })

// The live set: transitive relative imports from the core prompt module, minus NON_TEACHING.
function liveTeachingFiles() {
  const seen = new Set()
  const queue = [CORE]
  const edges = new Map()
  while (queue.length) {
    const file = queue.shift()
    if (seen.has(file)) continue
    seen.add(file)
    const abs = join(PROMPTS_DIR, file)
    if (!existsSync(abs)) continue
    let text = ''
    try { text = readFileSync(abs, 'utf8') } catch { continue }
    const deps = []
    for (const m of text.matchAll(/from\s+'\.\/([\w.-]+\.js)'/g)) deps.push(m[1])
    edges.set(file, deps)
    for (const d of deps) if (!seen.has(d)) queue.push(d)
  }
  const live = []
  const excluded = []
  for (const f of seen) {
    if (NON_TEACHING[f]) excluded.push({ file: f, why: NON_TEACHING[f] })
    else live.push({ file: f, importedBy: [...edges].filter(([, deps]) => deps.includes(f)).map(([from]) => from) })
  }
  live.sort((a, b) => a.file.localeCompare(b.file))
  return { live, excluded, edges }
}

/** Declared capability names: the tools a seat can call and the settings keys a deployment can set. */
function capabilityNames() {
  const tools = new Set()
  const settings = new Set()
  const sources = ['vibe-math-vmu/tools', 'vibe-math-vmu/packs/v5r/tools.js', 'vibe-math-vmu/kit']
  const addFrom = (text) => {
    for (const m of text.matchAll(/name:\s*'(vibe_[a-z0-9_]+)'/g)) tools.add(m[1])
    for (const m of text.matchAll(/'(vibe_[a-z0-9_]+)'/g)) tools.add(m[1])
  }
  const readDir = (dir) => {
    const abs = join(REPO, dir)
    if (!existsSync(abs)) return
    for (const f of readdirSync(abs)) {
      if (!f.endsWith('.js')) continue
      try { addFrom(readFileSync(join(abs, f), 'utf8')) } catch { /* unreadable file is not a teaching fact */ }
    }
  }
  readDir('vibe-math-vmu/tools')
  readDir('vibe-math-vmu/kit')
  for (const f of ['vibe-math-vmu/packs/v5r/tools.js', 'vibe-math-vmu/host.js', 'vibe-math-vmu/host-pack-tools.js']) {
    try { addFrom(readFileSync(join(REPO, f), 'utf8')) } catch { /* declared set stays short, and that shows up as a red */ }
  }
  // An alias is a name the pack accepts, so it is a declared name too (`from: 'vibe_v5_x', to: 'vmu.y'`).
  const walk = (dirAbs) => {
    if (!existsSync(dirAbs)) return
    for (const entry of readdirSync(dirAbs, { withFileTypes: true })) {
      const abs = join(dirAbs, entry.name)
      if (entry.isDirectory()) { walk(abs); continue }
      if (!entry.name.endsWith('.js')) continue
      try {
        const text = readFileSync(abs, 'utf8')
        for (const m of text.matchAll(/from:\s*'(vibe_[a-z0-9_]+)'/g)) tools.add(m[1])
      } catch { /* skip unreadable file */ }
    }
  }
  walk(join(REPO, 'vibe-math-vmu/packs/v5r'))
  for (const f of ['vibe-math-vmu/packs/v5r/settings/defaults.json', 'vibe-math-vmu/packs/v5r/settings/schema.js', 'vibe-math-vmu/packs/v5r/settings/defaults.js', 'vibe-math-vmu/packs/v5r/settings/planned.js']) {
    const abs = join(REPO, f)
    if (!existsSync(abs)) continue
    let text = ''
    try { text = readFileSync(abs, 'utf8') } catch { continue }
    for (const m of text.matchAll(/"(vmu\.[A-Za-z0-9_.]+)"/g)) settings.add(m[1])
    for (const m of text.matchAll(/'(vmu\.[A-Za-z0-9_.]+)'/g)) settings.add(m[1])
  }
  return { tools }
}

/**
 * P5 — NAMES. A teaching sentence may mention a tool or a setting; if it names one that no seat can call and no
 * deployment can set, the sentence teaches a capability that does not exist. This is mechanical and narrow on
 * purpose: it proves the NAMES, not the meaning. Semantic contradiction between two sentences is audited by the
 * closing lanes (see docs/acceptance/phase12-v5r-rules-conformance.md), and this gate says so instead of implying
 * it covers it.
 */
function checkTeachingNames(live, exempt) {
  const { tools } = capabilityNames()
  const unknown = (token) => {
    for (const e of exempt) if (e.name === token) return false
    return true
  }
  for (const item of live) {
    const abs = join(PROMPTS_DIR, item.file)
    let text = ''
    try { text = readFileSync(abs, 'utf8') } catch { continue }
    const lines = text.split(String.fromCharCode(10))
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      for (const m of line.matchAll(/(vibe_[a-z0-9_]+)/g)) {
        const token = m[1]
        if (tools.has(token)) continue
        if (!unknown(token)) continue
        fail('VMU_RULE_PARITY_UNKNOWN_NAME', PROMPTS_REL + '/' + item.file + ':' + (i + 1) + ' teaches the tool `' + token + '`, which no face declares', item.file)
      }
    }
  }
}

// ── P6: the seat teaching bullets vs the seat ACL (both declared in seat-faces.js) ─────────────────────────────────────
//
// WHY READ THE FILE AS TEXT AND NOT `import` IT: an import would let a renamed export or a reshaped table evaluate to
// "nothing to compare" and the gate would stay green on an empty check — the exact silent pass the third code exists to
// prevent. A text reader can say "this file no longer has the shape I audit" and fail by name, and it can print a real
// file:line for every contradiction, which a parsed module object cannot.

const clip = (text, n) => (text.length > n ? text.slice(0, n) + '…' : text)

/** Read one JS string literal starting at `at`. Returns `{value, end}` or null when unterminated. */
function readJsString(src, at) {
  const quote = src[at]
  if (quote !== "'" && quote !== '"' && quote !== '`') return null
  let value = ''
  for (let i = at + 1; i < src.length; i += 1) {
    const ch = src[i]
    if (ch === '\\') {
      // The bullets escape their inner quotes (`action:\'probe\'`), so an escape consumes the next character verbatim.
      const next = src[i + 1]
      value += next === 'n' ? String.fromCharCode(10) : next === 't' ? String.fromCharCode(9) : (next || '')
      i += 1
      continue
    }
    if (ch === quote) return { value, end: i + 1 }
    value += ch
  }
  return null
}

/** Offset of the delimiter closing the one at `openAt`; string literals and comments are skipped, so a `}` in prose
 *  can never end a table early. -1 when unbalanced (which the caller reports as UNPARSED, never as "clean"). */
function closingDelimiter(src, openAt, open, close) {
  let depth = 0
  for (let i = openAt; i < src.length; i += 1) {
    const ch = src[i]
    if (ch === "'" || ch === '"' || ch === '`') {
      const s = readJsString(src, i)
      if (!s) return -1
      i = s.end - 1
      continue
    }
    if (ch === '/' && src[i + 1] === '/') {
      const nl = src.indexOf(String.fromCharCode(10), i)
      i = nl < 0 ? src.length - 1 : nl
      continue
    }
    if (ch === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2)
      if (end < 0) return -1
      i = end + 1
      continue
    }
    if (ch === open) depth += 1
    else if (ch === close) {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

function lineAt(src, index) {
  let line = 1
  for (let i = 0; i < index && i < src.length; i += 1) if (src[i] === String.fromCharCode(10)) line += 1
  return line
}

/** One `{ names: [...], (framework: true,) text: '…' }` teaching row, or null when it cannot be read. */
function parseTeachingRow(rowSrc) {
  const namesAt = /names:\s*\[/.exec(rowSrc)
  if (!namesAt) return null
  const namesOpen = namesAt.index + namesAt[0].length - 1
  const namesEnd = closingDelimiter(rowSrc, namesOpen, '[', ']')
  if (namesEnd < 0) return null
  const names = []
  const namesSrc = rowSrc.slice(namesOpen + 1, namesEnd)
  for (let i = 0; i < namesSrc.length; i += 1) {
    if (namesSrc[i] !== "'" && namesSrc[i] !== '"') continue
    const s = readJsString(namesSrc, i)
    if (!s) return null
    names.push(s.value)
    i = s.end - 1
  }
  if (!names.length) return null
  const textAt = rowSrc.indexOf('text:')
  if (textAt < 0) return null
  let i = textAt + 'text:'.length
  const readOne = () => {
    while (i < rowSrc.length && /\s/.test(rowSrc[i])) i += 1
    const s = readJsString(rowSrc, i)
    if (!s) return null
    i = s.end
    return s.value
  }
  const first = readOne()
  if (first === null) return null
  let text = first
  for (;;) {
    let j = i
    while (j < rowSrc.length && /\s/.test(rowSrc[j])) j += 1
    if (rowSrc[j] !== '+') break
    i = j + 1
    const more = readOne()
    if (more === null) return null
    text += more
  }
  return { names, framework: /framework:\s*true/.test(rowSrc), text }
}

/**
 * Read `SEAT_TOOL_FACES` (name → per-seat allow decision + line) and `SEAT_TEACHING` (seat → rows with line) out of the
 * file's TEXT. Returns `{acl, teaching}` or `{error}` — every shape change is an error with a reason, never a short set.
 */
function parseSeatFaces(src) {
  const aclHead = /export const SEAT_TOOL_FACES = Object\.freeze\(\{/.exec(src)
  if (!aclHead) return { error: 'SEAT_TOOL_FACES is not declared as `export const SEAT_TOOL_FACES = Object.freeze({…})`' }
  const aclStart = aclHead.index + aclHead[0].length - 1
  const aclEnd = closingDelimiter(src, aclStart, '{', '}')
  if (aclEnd < 0) return { error: 'the SEAT_TOOL_FACES table is not closed' }
  const acl = new Map()
  const rowHits = []
  for (const m of src.slice(aclStart, aclEnd).matchAll(/^ {2}(vibe_[a-z0-9_]+): Object\.freeze\(\{/gm)) {
    rowHits.push({ name: m[1], index: aclStart + m.index })
  }
  if (!rowHits.length) return { error: 'SEAT_TOOL_FACES declares no tool rows' }
  for (let i = 0; i < rowHits.length; i += 1) {
    const from = rowHits[i].index
    const to = i + 1 < rowHits.length ? rowHits[i + 1].index : aclEnd
    const body = src.slice(from, to)
    const allow = /allow:\s*Object\.freeze\(\{\s*chair:\s*(true|false)\s*,\s*member:\s*(true|false)\s*,\s*temp:\s*(true|false)\s*\}\)/.exec(body)
    if (!allow) return { error: 'the row for `' + rowHits[i].name + '` has no `allow: Object.freeze({chair,member,temp})` decision' }
    acl.set(rowHits[i].name, {
      line: lineAt(src, from),
      allow: { chair: allow[1] === 'true', member: allow[2] === 'true', temp: allow[3] === 'true' },
    })
  }

  const teachHead = /export const SEAT_TEACHING = Object\.freeze\(\{/.exec(src)
  if (!teachHead) return { error: 'SEAT_TEACHING is not declared as `export const SEAT_TEACHING = Object.freeze({…})`' }
  const teachStart = teachHead.index
  const teachBrace = teachStart + teachHead[0].length - 1
  const teachEnd = closingDelimiter(src, teachBrace, '{', '}')
  if (teachEnd < 0) return { error: 'the SEAT_TEACHING table is not closed' }
  const seatHits = []
  for (const m of src.matchAll(/^ {2}(chair|member|temp): Object\.freeze\(\[/gm)) {
    if (m.index < teachStart || m.index > teachEnd) continue
    seatHits.push({ seat: m[1], index: m.index, open: m.index + m[0].length - 1 })
  }
  const teaching = {}
  for (let i = 0; i < seatHits.length; i += 1) {
    const seat = seatHits[i].seat
    const arrayEnd = closingDelimiter(src, seatHits[i].open, '[', ']')
    if (arrayEnd < 0) return { error: 'the bullet array of seat `' + seat + '` is not closed' }
    const rows = []
    const slice = src.slice(seatHits[i].open, arrayEnd)
    for (const m of slice.matchAll(/\{\s*names:\s*\[/g)) {
      const rowAt = seatHits[i].open + m.index
      const rowEnd = closingDelimiter(src, rowAt, '{', '}')
      if (rowEnd < 0) return { error: 'the bullet at line ' + lineAt(src, rowAt) + ' (seat `' + seat + '`) is not closed' }
      const row = parseTeachingRow(src.slice(rowAt, rowEnd + 1))
      if (!row) {
        return { error: 'the bullet at line ' + lineAt(src, rowAt) + ' (seat `' + seat + '`) has no readable `names` + `text`' }
      }
      rows.push({ ...row, line: lineAt(src, rowAt) })
    }
    if (!rows.length) return { error: 'seat `' + seat + '` has no teaching bullet rows' }
    teaching[seat] = rows
  }
  for (const seat of SEAT_IDS_ORDER) {
    if (!teaching[seat]) return { error: 'SEAT_TEACHING declares no bullet array for seat `' + seat + '`' }
  }
  return { acl, teaching }
}

/**
 * P6 — THE CONTRADICTION THIS CATCHES: a bullet shown to a seat whose `allow` is false for a tool the bullet names. The
 * teaching then promises a capability the face gate will refuse (`VMU_TOOL_NOT_IN_FACE` at runtime), and the seat reads
 * that refusal as its own mistake. The reverse direction (allowed but never taught) belongs to the pack's own test, which
 * knows the declared catalogue; this gate can only speak about names that appear on both sides of THIS file.
 *
 * Scope rules, stated so a reader can check them:
 *   · `vibe_vmu_*` (framework) names are OUT OF SCOPE: this pack does not narrow framework faces, so `SEAT_TOOL_FACES`
 *     carries no decision for them and there is no promise to contradict. Their EXISTENCE is P5's job.
 *   · a `vibe_v5_*` name with NO row is reported: `seatDecision` documents that such a name is denied to every seat
 *     (fail-closed), so teaching it is the same contradiction with a different cause.
 *   · both the `names:` list and the bullet WORDING are scanned: the wording is prose, but a tool name there is still
 *     read by a seat as "you may call this".
 */
function seatFaceBulletProblems(src, label) {
  const out = []
  if (typeof src !== 'string') {
    out.push({
      code: 'VMU_RULE_PARITY_SEAT_FACE_BULLET_UNPARSED',
      message: label + ' does not exist, so the seat bullets cannot be checked against the seat ACL at all',
      detail: label,
    })
    return out
  }
  const parsed = parseSeatFaces(src)
  if (parsed.error) {
    out.push({
      code: 'VMU_RULE_PARITY_SEAT_FACE_BULLET_UNPARSED',
      message: label + ': ' + parsed.error + ' — the bullets cannot be read, so this gate refuses to claim they promise only what the seat gets',
      detail: label,
    })
    return out
  }
  for (const seat of SEAT_IDS_ORDER) {
    for (const row of parsed.teaching[seat]) {
      const taught = new Set([...row.names, ...(row.text.match(/vibe_[a-z0-9_]+/g) || [])])
      for (const name of taught) {
        if (!/^vibe_v5_/.test(name)) continue // framework faces: no decision here to contradict (their existence is P5)
        const decision = parsed.acl.get(name)
        const bullet = JSON.stringify(clip(row.text, 64))
        if (!decision) {
          out.push({
            code: 'VMU_RULE_PARITY_SEAT_FACE_BULLET_NOT_ALLOWED',
            message: label + ':' + row.line + ' the ' + seat + " seat's bullet " + bullet + ' names `' + name + '`, which has no row in SEAT_TOOL_FACES — such a name is denied to every seat (fail-closed), so the teaching promises a tool the face refuses',
            detail: label,
          })
          continue
        }
        if (decision.allow[seat] !== true) {
          out.push({
            code: 'VMU_RULE_PARITY_SEAT_FACE_BULLET_NOT_ALLOWED',
            message: label + ':' + row.line + ' the ' + seat + " seat's bullet " + bullet + ' names `' + name + '`, but its decision (line ' + decision.line + ') says allow.' + seat + '=false — a seat must not be taught a tool it is refused',
            detail: label,
          })
        }
      }
    }
  }
  return out
}

// ── P7: setting keys named by the live teaching vs settings/schema.js ─────────────────────────────────────────────────

/**
 * A candidate setting key on one line: `\bvmu\.[A-Za-z0-9_.]+`, then narrowed by shape.
 *
 * The narrowing is what makes the check trustworthy rather than noisy, and each rule has a measured reason in these very
 * files: prose ends a sentence with the key (`… vmu.math.*` → a trailing dot), `vmu.tasks` / `vmu.members` / `vmu.records`
 * are SERVICE names this pack requires (`{ service: 'vmu.tasks' }`) and not settings, a 4-segment key is legitimate
 * (`vmu.records.retention.keepEvery`), and a `${…}` placeholder or glob is not a key anybody can set. A key therefore has
 * to be at least `vmu.<family>.<name>` with every segment an identifier.
 */
function settingKeyCandidates(line) {
  const out = []
  for (const m of line.matchAll(/\bvmu\.[A-Za-z0-9_.]+/g)) {
    const raw = m[0].replace(/\.+$/, '')
    const segments = raw.split('.')
    if (segments.length < 3) continue
    if (!segments.every((s) => /^[a-z][A-Za-z0-9]*$/.test(s))) continue
    out.push(raw)
  }
  return out
}

/** Declared `key:` values, or null when the schema cannot be read (then NOTHING counts as declared and P7 says so). */
function declaredSettingKeys() {
  const abs = join(REPO, SCHEMA_REL)
  if (!existsSync(abs)) return null
  try {
    const keys = new Set()
    for (const m of readFileSync(abs, 'utf8').matchAll(/\bkey:\s*'([^']+)'/g)) keys.add(m[1])
    return keys
  } catch {
    return null
  }
}

function promptSettingSources() {
  const sources = []
  for (const rel of PROMPT_SETTING_SCAN_FILES) {
    const abs = join(REPO, rel)
    if (!existsSync(abs)) { sources.push({ rel }); continue }
    try { sources.push({ rel, text: readFileSync(abs, 'utf8') }) } catch { sources.push({ rel }) }
  }
  return sources
}

/**
 * P7 — THE CONTRADICTION THIS CATCHES: the teaching names a settings key the office does not declare. `vibe_v5_configure`
 * and `vibe_v5_set` refuse undeclared keys BY NAME (`SETTING_UNKNOWN`-style receipts), so the seat is told to turn a dial
 * that does not exist; the natural next move is to invent the key or to conclude the refusal is a bug. Scanning only the
 * live files keeps the promise honest: a key named solely in a historical capture is not taught to anyone.
 */
function promptSettingProblems(sources) {
  const out = []
  const declared = declaredSettingKeys()
  if (!declared) {
    out.push({
      code: 'VMU_RULE_PARITY_PROMPT_NAMES_UNDECLARED_SETTING',
      message: SCHEMA_REL + ' cannot be read, so every settings key the live teaching names is undeclared by construction',
      detail: SCHEMA_REL,
    })
    return out
  }
  for (const source of sources) {
    if (typeof source.text !== 'string') {
      out.push({
        code: 'VMU_RULE_PARITY_SETTINGS_SOURCE_MISSING',
        message: source.rel + ' is declared as live teaching but cannot be read, so the settings keys it names were NOT checked',
        detail: source.rel,
      })
      continue
    }
    const lines = source.text.split(String.fromCharCode(10))
    for (let i = 0; i < lines.length; i += 1) {
      const seen = new Set()
      for (const key of settingKeyCandidates(lines[i])) {
        if (declared.has(key) || seen.has(key)) continue
        seen.add(key)
        out.push({
          code: 'VMU_RULE_PARITY_PROMPT_NAMES_UNDECLARED_SETTING',
          message: source.rel + ':' + (i + 1) + ' names the setting `' + key + '` in live teaching, but ' + SCHEMA_REL + " declares no `key: '" + key + "'` — a seat told to set it would be refused as undeclared. text: " + JSON.stringify(clip(lines[i].trim(), 90)),
          detail: source.rel,
        })
      }
    }
  }
  return out
}

function loadLedger(path) {
  if (!existsSync(path)) { fail('VMU_RULE_PARITY_NO_LEDGER', 'no ledger at ' + path); return null }
  try {
    const ledger = JSON.parse(readFileSync(path, 'utf8'))
    if (!ledger || typeof ledger !== 'object' || !Array.isArray(ledger.items)) {
      fail('VMU_RULE_PARITY_BAD_LEDGER', 'the ledger must be an object with items[]')
      return null
    }
    return ledger
  } catch (e) {
    fail('VMU_RULE_PARITY_BAD_JSON', 'the ledger is not valid JSON: ' + String(e.message || e))
    return null
  }
}

// Claimed rule lines, expanded from keys like `L47-L51`.
function claimedLines(ruleLines) {
  const lines = new Set()
  const bad = []
  for (const key of Object.keys(ruleLines || {})) {
    const m = /^L(\d+)(?:-L?(\d+))?$/.exec(key)
    if (!m) { bad.push(key); continue }
    const from = Number(m[1])
    const to = m[2] ? Number(m[2]) : from
    if (to < from) { bad.push(key); continue }
    for (let n = from; n <= to; n += 1) lines.add(n)
  }
  return { lines, bad }
}

function citedPromptFiles(ledger) {
  const cited = new Map() // file -> item ids
  for (const item of ledger.items) {
    if (!item || typeof item !== 'object') continue
    for (const cat of ['mechanism', 'tool', 'prompt', 'live']) {
      const list = item[cat]
      if (!Array.isArray(list)) continue
      for (const entry of list) {
        const cut = String(entry).indexOf('::')
        if (cut <= 0) continue
        const rel = String(entry).slice(0, cut).replace(/\\/g, '/')
        const at = rel.lastIndexOf(PROMPTS_REL + '/')
        if (at < 0) continue
        const file = rel.slice(at + PROMPTS_REL.length + 1)
        if (!cited.has(file)) cited.set(file, new Set())
        cited.get(file).add(String(item.id))
      }
    }
  }
  return cited
}

function pinIds() {
  const abs = join(REPO, PINS_TEST)
  if (!existsSync(abs)) return { ids: new Set(), missingFile: true }
  const text = readFileSync(abs, 'utf8')
  const ids = new Set()
  for (const m of text.matchAll(/^\s*\*\s+([A-G]\d+[a-z]?)\b/gm)) ids.add(m[1])
  return { ids, missingFile: false }
}

function check(ledgerPath, overrides = {}) {
  const ledger = loadLedger(ledgerPath)
  if (!ledger) return null
  const { live, excluded } = liveTeachingFiles()
  const liveSet = new Set(live.map((l) => l.file))
  const ledgerIds = new Set(ledger.items.filter((i) => i && i.id).map((i) => String(i.id)))
  const { lines, bad } = claimedLines(ledger.ruleLines)
  for (const key of bad) fail('VMU_RULE_PARITY_BAD_RULE_KEY', 'ruleLines key does not look like L3 or L47-L51: ' + key)

  const lineCount = Number(ledger.source && ledger.source.lineCount)
  if (!Number.isInteger(lineCount) || lineCount <= 0) {
    fail('VMU_RULE_PARITY_NO_LINE_COUNT', 'source.lineCount must record how many lines the rule document has')
  }
  for (const n of lines) {
    if (lineCount > 0 && n > lineCount) fail('VMU_RULE_PARITY_LINE_OUT_OF_RANGE', 'ruleLines claims L' + n + ' but the document has ' + lineCount + ' lines')
  }

  const structural = new Map()
  for (const entry of Array.isArray(ledger.source && ledger.source.structuralLines) ? ledger.source.structuralLines : []) {
    const m = entry && /^L(\d+)$/.exec(String(entry.line))
    if (!m) { fail('VMU_RULE_PARITY_BAD_STRUCTURAL', 'structuralLines entry must be {line:"L7", why:"..."}: ' + JSON.stringify(entry)); continue }
    if (typeof entry.why !== 'string' || entry.why.trim().length < 4) {
      fail('VMU_RULE_PARITY_STRUCTURAL_NO_REASON', 'structural line ' + entry.line + ' needs a reason')
    }
    structural.set(Number(m[1]), String(entry.why || ''))
  }
  // P1 is DOCUMENT-GROUNDED: when the rule document is readable we check that the ledger is a claim about THIS
  // version of it (revision = sha256, lineCount = lines) and that every line declared structural really is a blank
  // line, a `---` separator or a heading. A silent edit of the document therefore reds the gate instead of drifting.
  // The document path is declared under whichever key the ledger shape uses: a migrated ledger writes `source.path`,
  // an older one `source.pathRelative`, and today's writes `source.file`. All three are read, in that order.
  const docFile = ['path', 'pathRelative', 'file']
    .map((key) => (ledger.source && typeof ledger.source[key] === 'string' ? ledger.source[key].trim() : ''))
    .find((value) => value) || ''
  if (!docFile) {
    fail('VMU_RULE_PARITY_NO_SOURCE_FILE', 'source.file must point at the rule document')
  } else if (!existsSync(docFile)) {
    note.push('rule document not readable here (' + docFile + '): revision/lineCount/structural checks skipped')
  } else {
    const buf = readFileSync(docFile)
    const sha = createHash('sha256').update(buf).digest('hex')
    if (sha !== String(ledger.source.revision || '')) {
      fail('VMU_RULE_PARITY_DOC_CHANGED', 'the rule document changed since the ledger was written (sha256 ' + sha.slice(0, 12) + ' != ' + String(ledger.source.revision || '').slice(0, 12) + '): re-audit the ledger')
    }
    const docLines = buf.toString('utf8').split(/\r?\n/)
    if (docLines.length !== lineCount) {
      fail('VMU_RULE_PARITY_LINE_COUNT', 'source.lineCount says ' + lineCount + ' but the document has ' + docLines.length + ' lines')
    }
    for (const [n, why] of structural) {
      const text = String(docLines[n - 1] || '')
      const trimmed = text.trim()
      const isStructural = trimmed === '' || trimmed === '---' || trimmed.startsWith('#') || (/[：:]$/.test(trimmed) && trimmed.length <= 16 && !/[。！？；]/.test(trimmed))
      if (!isStructural) {
        fail('VMU_RULE_PARITY_STRUCTURAL_NOT_STRUCTURAL', 'L' + n + ' is declared structural (' + why + ') but the document line is text: ' + JSON.stringify(trimmed.slice(0, 40)))
      }
      // NOTE (2026-10-28 audit): a HEADING line can also be quoted by an anchor row (a row that quotes a sentence from
      // the section it introduces); that is not a contradiction and is no longer reported. Only a CONTENT line is
      // refused as structural, which the check above already does.
    }
    // P1 also accepts ANCHOR claims. A migrated ledger replaces `ruleLines` with `ruleText` quotes; the anchor's own
    // line IS the declaration, so without this fallback the migration would red the gate on lines nobody can claim.
    if (!Object.keys(ledger.ruleLines || {}).length) {
      const docText = docLines.join(String.fromCharCode(10))
      let anchoredLines = 0
      for (const item of ledger.items) {
        if (!item || typeof item.ruleText !== 'string' || !item.ruleText.trim()) continue
        const quote = item.ruleText
        const hits = []
        for (let i = docText.indexOf(quote); i >= 0; i = docText.indexOf(quote, i + 1)) hits.push(i)
        if (hits.length !== 1) continue
        lines.add(docText.slice(0, hits[0]).split(String.fromCharCode(10)).length)
        anchoredLines += 1
      }
      note.push('ruleLines absent: ' + anchoredLines + ' claim line(s) derived from ruleText anchors')
    }
  }

  const cited = citedPromptFiles(ledger)
  for (const [file, ids] of cited) {
    if (liveSet.has(file)) continue
    const why = NON_TEACHING[file] || (existsSync(join(PROMPTS_DIR, file)) ? 'not reachable from prompts/v5r-core.js by imports' : 'no such prompt file')
    fail('VMU_RULE_PARITY_DEAD_TEACHING', 'item(s) ' + [...ids].join(',') + ' cite ' + PROMPTS_REL + '/' + file + ' as teaching, but ' + why, file)
  }
  const exempt = new Map()
  for (const entry of Array.isArray(ledger.source && ledger.source.parityExempt) ? ledger.source.parityExempt : []) {
    const file = entry && typeof entry.file === 'string' ? entry.file : ''
    if (!file) { fail('VMU_RULE_PARITY_BAD_EXEMPTION', 'parityExempt entries must name a file'); continue }
    if (!liveSet.has(file)) { fail('VMU_RULE_PARITY_EXEMPT_NOT_LIVE', 'parityExempt names ' + file + ', which is not live teaching'); continue }
    if (typeof entry.why !== 'string' || entry.why.trim().length < 20) {
      fail('VMU_RULE_PARITY_EXEMPT_NO_REASON', 'exemption for ' + file + ' needs a reason (and a BACKLOG remark when it is debt)')
    }
    exempt.set(file, String(entry.why || ''))
  }
  for (const { file } of live) {
    if (exempt.has(file)) continue
    if (!cited.has(file)) fail('VMU_RULE_PARITY_ORPHAN_TEACHING', PROMPTS_REL + '/' + file + ' is live teaching but no ledger item claims it', file)
  }

  const nameExempt = Array.isArray(ledger.source && ledger.source.teachingNameExempt) ? ledger.source.teachingNameExempt : []
  checkTeachingNames(live, nameExempt)

  // P6 — the seat bullets against the seat ACL, read out of ONE file. `overrides.seatFacesText` exists for the
  // selftest: a planted contradiction is injected into the TEXT in memory, so the real file is never edited and the
  // probe proves the reader bites on content it has not seen before.
  const seatFacesAbs = join(REPO, SEAT_FACES_REL)
  let seatFacesText
  if (typeof overrides.seatFacesText === 'string') seatFacesText = overrides.seatFacesText
  else if (existsSync(seatFacesAbs)) {
    try { seatFacesText = readFileSync(seatFacesAbs, 'utf8') } catch { seatFacesText = undefined }
  }
  for (const p of seatFaceBulletProblems(seatFacesText, SEAT_FACES_REL)) problems.push(p)

  // P7 — every setting key the live teaching names is declared. `overrides.extraPromptSources` APPENDS to the real
  // five (never replaces them), so a probe proves the planted key is caught without hiding what the real files say.
  const promptSources = promptSettingSources()
  for (const extra of Array.isArray(overrides.extraPromptSources) ? overrides.extraPromptSources : []) promptSources.push(extra)
  for (const p of promptSettingProblems(promptSources)) problems.push(p)

  const pins = pinIds()
  if (pins.missingFile) fail('VMU_RULE_PARITY_NO_PINS', PINS_TEST + ' does not exist, so the teaching pins are not executed')
  for (const id of pins.ids) {
    if (!ledgerIds.has(id)) fail('VMU_RULE_PARITY_UNKNOWN_PIN_ID', 'pins test names ' + id + ', which is not a ledger item')
  }

  const structuralCount = Array.isArray(ledger.source && ledger.source.structuralLines) ? ledger.source.structuralLines.length : 0
  const exemptCount = Array.isArray(ledger.source && ledger.source.parityExempt) ? ledger.source.parityExempt.length : 0
  return { ledger, live, excluded, cited, lineCount, ledgerIds, structuralCount, exemptCount }
}

function report(ok, summary) {
  if (JSON_OUT) {
    process.stdout.write(JSON.stringify({ ok, summary, problems }, null, 2) + '\n')
    return
  }
  if (summary) {
    console.log('RULE PARITY: live teaching ' + summary.live + ' (exempt ' + summary.exempt + ') · not live ' + summary.excluded + ' · structural rule lines ' + summary.structural + '/' + summary.lineCount + ' · ledger ids ' + summary.ids)
    console.log('  scope: P1-P4 = every rule line claimed, every citation live, no orphan teaching, no orphan pin; P5 = every tool/setting a teaching names exists; P6 = a seat\'s bullet names only tools that seat may call (seat-faces.js ACL vs SEAT_TEACHING); P7 = every setting key the live prompts name is declared in settings/schema.js. Contradiction between two sentences is audited by the closing lanes, not proven here.')
    console.log('RULE PARITY SCOPE: P1 rule lines claimed · P2 citations live · P3 no orphan teaching · P4 no orphan pin · P5 named tools and settings exist · P6 seat teaching names only tools that seat gets · P7 prompt-named settings are declared · NOT PROVEN HERE: semantic contradiction between two sentences (audited by the closing lanes; verdicts recorded in phase12 §-sections)')
    for (const e of summary.excludedList) console.log('  not live: ' + PROMPTS_REL + '/' + e.file + ' — ' + e.why)
  }
  for (const n of note) console.log('  note: ' + n)
  for (const p of problems) console.log('  ' + p.code + ' :: ' + p.message)
  console.log((ok ? 'RULE PARITY: PASS' : 'RULE PARITY: FAIL') + ' (' + problems.length + ' problem(s))')
}

function runOnce(ledgerPath, overrides = {}) {
  problems.length = 0
  const res = check(ledgerPath, overrides)
  const summary = res && {
    live: res.live.length,
    excluded: res.excluded.length,
    excludedList: res.excluded,
    lineCount: res.lineCount,
    ids: res.ledgerIds.size,
    structural: res.structuralCount || 0,
    exempt: res.exemptCount || 0,
  }
  return { ok: problems.length === 0, summary, problems: problems.slice() }
}

if (!SELFTEST) {
  const ledgerPath = ledgerArg ? (isAbsolute(ledgerArg) ? ledgerArg : join(REPO, ledgerArg)) : join(REPO, 'docs/acceptance/rules-ledger.json')
  const r = runOnce(ledgerPath)
  report(r.ok, r.summary)
  process.exitCode = r.ok ? 0 : 1
} else {
  // Fault injection: each planted defect must be caught, each NEGATIVE CONTROL must stay clean, and the untouched
  // repository must pass first. `ok` on a case means "behaved as declared" — caught for a plant, clean for a control.
  const REAL_LEDGER = join(REPO, 'docs/acceptance/rules-ledger.json')
  const base = JSON.parse(readFileSync(REAL_LEDGER, 'utf8'))
  const tmp = mkdtempSync(join(tmpdir(), 'vmu-parity-'))
  const plant = (name, mutate) => {
    const copy = JSON.parse(JSON.stringify(base))
    mutate(copy)
    const file = join(tmp, name + '.json')
    writeFileSync(file, JSON.stringify(copy, null, 2))
    return file
  }
  const cases = []
  const expect = (name, file, code, overrides) => {
    const r = runOnce(file, overrides)
    const caught = !r.ok && r.problems.some((p) => p.code === code)
    cases.push({ name, ok: caught, codes: r.problems.map((p) => p.code) })
  }
  // A negative control: the SAME code must NOT be reported and the run must be clean. Without these, a check that reds
  // everything would pass its own positive probes and prove nothing.
  const expectClean = (name, file, code, overrides) => {
    const r = runOnce(file, overrides)
    const clean = r.ok && !r.problems.some((p) => p.code === code)
    cases.push({ name, ok: clean, codes: r.problems.map((p) => p.code) })
  }
  // control: the real repository must pass — including P6 and P7, so a live contradiction is reported here too.
  const control = runOnce(REAL_LEDGER)
  cases.push({ name: 'control-real-repository', ok: control.ok, codes: control.problems.map((p) => p.code) })

  expect('plant-doc-changed', plant('docchanged', (l) => {
    l.source.revision = '0'.repeat(64)
  }), 'VMU_RULE_PARITY_DOC_CHANGED')

  expect('plant-structural-not-structural', plant('structtext', (l) => {
    l.source.structuralLines.push({ line: 'L7', why: 'planted: L7 carries a real requirement' })
  }), 'VMU_RULE_PARITY_STRUCTURAL_NOT_STRUCTURAL')

  expect('plant-dead-teaching', plant('dead', (l) => {
    l.items[0].prompt = [PROMPTS_REL + '/v5r-prompts.js::anything']
  }), 'VMU_RULE_PARITY_DEAD_TEACHING')

  expect('plant-orphan-teaching', plant('orphan', (l) => {
    for (const item of l.items) {
      for (const cat of ['mechanism', 'tool', 'prompt', 'live']) {
        if (!Array.isArray(item[cat])) continue
        item[cat] = item[cat].filter((e) => !String(e).includes('v5r-blocks-b.js'))
      }
    }
  }), 'VMU_RULE_PARITY_ORPHAN_TEACHING')

  expect('plant-unknown-pin', plant('pin', (l) => {
    for (const item of l.items) if (item.id === 'C12') item.id = 'C12x'
    for (const list of Object.values(l.ruleLines)) {
      for (let i = 0; i < list.length; i += 1) if (list[i] === 'C12') list[i] = 'C12x'
    }
  }), 'VMU_RULE_PARITY_UNKNOWN_PIN_ID')

  expect('plant-structural-without-reason', plant('struct', (l) => {
    const first = l.source.structuralLines && l.source.structuralLines[0]
    if (first) first.why = ''
  }), 'VMU_RULE_PARITY_STRUCTURAL_NO_REASON')

  // ── P6/P7 probes. The seat-face TEXT is mutated in memory (the real file is never touched): a planted row is inserted
  // as the chair's first bullet. `vibe_v5_script` is the honest choice — every seat's row denies it — so the probe proves
  // the check compares the BULLET'S seat against that seat's own decision, not "is this tool allowed to anybody".
  const seatFacesText = readFileSync(join(REPO, SEAT_FACES_REL), 'utf8')
  const chairAnchor = '  chair: Object.freeze(['
  const withChairBullet = (bullet) => {
    if (!seatFacesText.includes(chairAnchor)) return null
    return seatFacesText.replace(chairAnchor, chairAnchor + String.fromCharCode(10) + bullet)
  }
  const deniedProbe = withChairBullet("    { names: ['vibe_v5_script'], text: 'planted: the chair is told to archive run scripts' },")
  const allowedProbe = withChairBullet("    { names: ['vibe_v5_meeting'], text: 'planted: the chair is told it may convene' },")
  if (deniedProbe === null || allowedProbe === null) {
    cases.push({ name: 'plant-seat-bullet-denied-tool', ok: false, codes: ['SEAT_TEACHING anchor not found'] })
    cases.push({ name: 'control-seat-bullet-allowed-tool', ok: false, codes: ['SEAT_TEACHING anchor not found'] })
  } else {
    expect('plant-seat-bullet-denied-tool', REAL_LEDGER, 'VMU_RULE_PARITY_SEAT_FACE_BULLET_NOT_ALLOWED', { seatFacesText: deniedProbe })
    expectClean('control-seat-bullet-allowed-tool', REAL_LEDGER, 'VMU_RULE_PARITY_SEAT_FACE_BULLET_NOT_ALLOWED', { seatFacesText: allowedProbe })
  }
  // The UNPARSED branch: a reshaped table must fail by NAME instead of comparing an empty set and passing. Renaming the
  // export is the smallest realistic refactor that would otherwise silently disable this check.
  expect('plant-seat-bullets-unparsed', REAL_LEDGER, 'VMU_RULE_PARITY_SEAT_FACE_BULLET_UNPARSED', {
    seatFacesText: seatFacesText.replace('export const SEAT_TEACHING', 'const SEAT_TEACHING_V2'),
  })

  // P7 probes: a key with the right shape but no `key:` in the schema, and its negative control (a declared key). The
  // fixtures carry their own rel path so the failure message's file:line is the fixture's, not a real teaching file's.
  expect('plant-prompt-undeclared-setting', REAL_LEDGER, 'VMU_RULE_PARITY_PROMPT_NAMES_UNDECLARED_SETTING', {
    extraPromptSources: [{ rel: 'probe/planted-prompts.js', text: 'const planted = "vmu.parity.notDeclaredAnywhere"' + String.fromCharCode(10) }],
  })
  expectClean('control-prompt-declared-setting', REAL_LEDGER, 'VMU_RULE_PARITY_PROMPT_NAMES_UNDECLARED_SETTING', {
    extraPromptSources: [{ rel: 'probe/planted-prompts-ok.js', text: 'const planted = "vmu.math.formalVerify"' + String.fromCharCode(10) }],
  })

  rmSync(tmp, { recursive: true, force: true })
  const failed = cases.filter((c) => !c.ok)
  for (const c of cases) console.log((c.ok ? '  ok      ' : '  MISSED  ') + c.name + (c.ok ? '' : ' :: ' + c.codes.join(',')))
  console.log('RULE PARITY SELFTEST: ' + (cases.length - failed.length) + '/' + cases.length + ' as expected')
  process.exitCode = failed.length === 0 ? 0 : 1
}

// audit-prompt-tool-names — ★ A PACK'S PROMPT MUST NOT TEACH A TOOL THAT DOES NOT EXIST.
//
// WHY THIS EXISTS (F2 of the phase-11 review classes, "prompts only covered 11 explicit call samples"). Two real defects
// this phase came from exactly this gap: the v5r prompts taught members to file a paper by writing reply FIELDS that a
// previous round had removed, and one passage said "it is not a tool, do not look for a tool of that name" about the very
// tool that had replaced them - backwards. Members followed the prompt, not the schema, and the wire refused them.
//
// WHAT IT CHECKS: every `vibe_v5_*` / `vibe_vmu_*` name that appears in a pack's prompt corpus must be a name the
// repository actually defines - a host tool, a tools/ spec, a pack tool, or an ALIAS `from` (a legitimate reference).
//
// WHAT IT DOES NOT CHECK (stated, not implied): it does not verify the PARAMETERS a passage teaches, only the names. A
// prompt can still teach a real tool with a wrong argument, which is the harder half of F2 and needs schema reading.
//
// AND THE "0 MISSING" RESULT IS ONLY WORTH ANYTHING IF THE PREDICATE CAN FIRE, so `--selftest` builds a tree whose prompt
// cites an invented tool and requires the scan to name it.

import { readdirSync, readFileSync, existsSync, mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { stripComments } from './_lib/strip-comments.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const VMU = join(REPO, 'vibe-math-vmu')

/** ★ A SCAN THAT ITERATES OVER A POSSIBLY-EMPTY LISTING CAN PASS VACUOUSLY, and RULE E in
 *  `audit-declaration-criterion` said so twice about this very file: first the `existsSync ? readdir : []` ternary, then
 *  a `for` whose iterable was `readdirSync(...)`. Both times it was right — an empty listing means the body never runs,
 *  so "0 missing" would mean "nothing was looked at", which is the false negative this gate exists to prevent. Every
 *  listing now goes through here and `mayBeEmpty` has to be SAID rather than assumed. */
const listing = (dir, { mayBeEmpty }) => {
  const names = readdirSync(dir)
  if (!mayBeEmpty && names.length === 0) throw new Error('refusing to scan nothing: ' + dir + ' is empty')
  return names
}

/** Every vibe_* name this repository defines, by scanning the places that can declare one. */
export function knownToolNames(root = VMU) {
  const known = new Set()
  const add = (src) => { for (const m of stripComments(src).matchAll(/['"](vibe_(?:v5|vmu)_[a-z0-9_]+)['"]/g)) known.add(m[1]) }
  // host faces (TOOL_NAMES), the tool specs, the packs, and the kit
  for (const rel of ['host.js', 'host-hooks.js', 'host-pack-tools.js']) {
    const p = join(root, rel)
    if (existsSync(p)) add(readFileSync(p, 'utf8'))
  }
  for (const dir of ['tools', 'kit']) {
    const d = join(root, dir)
    if (!existsSync(d)) continue
    const jsFiles = listing(d, { mayBeEmpty: false }).filter((n) => n.endsWith('.js'))
    for (const f of jsFiles) add(readFileSync(join(d, f), 'utf8'))
  }
  // ★ A MISSING packs/ DIRECTORY IS A BROKEN REPOSITORY, NOT AN EMPTY SCAN. `audit-no-silent-reads` rejected the
  // try/catch that swallowed a missing directory, and letting the read throw is the fix it asks for.
  const packs = join(root, 'packs')
  const packDirs = listing(packs, { mayBeEmpty: false })
  for (const pack of packDirs) {
    const pd = join(packs, pack)
    if (!existsSync(pd)) continue
    const packFiles = listing(pd, { mayBeEmpty: false }).filter((n) => n.endsWith('.js'))
    for (const f of packFiles) add(readFileSync(join(pd, f), 'utf8'))
  }
  // ★ ALIASES ARE LEGITIMATE REFERENCES, not tool definitions: `{ from: 'vibe_v5_members', to: 'vmu.members' }` names a
  // tool the pack forwards to a service. A scan that does not know about them reports a false positive - measured, this
  // was the LAST of three false positives this check produced while being written.
  const aliasFroms = new Set()
  for (const pack of packDirs) {
    for (const dir of ['', 'prompts']) {
      const d = join(packs, pack, dir)
      if (!existsSync(d)) continue
      // A pack may legitimately have no prompts directory, so THIS one is allowed empty - said, not assumed.
      const aliasFiles = listing(d, { mayBeEmpty: true }).filter((n) => n.endsWith('.js'))
      for (const f of aliasFiles) {
        for (const m of stripComments(readFileSync(join(d, f), 'utf8')).matchAll(/from:\s*['"](vibe_(?:v5|vmu)_[a-z0-9_]+)['"]/g)) aliasFroms.add(m[1])
      }
    }
  }
  return { known, aliasFroms }
}

/** Tool names cited by the prompt corpus under `promptDir` that the repository does not define. */
export function missingNames(promptDir, declared) {
  const { known, aliasFroms } = declared
  const out = new Map()
  const promptFiles = listing(promptDir, { mayBeEmpty: false }).filter((n) => n.endsWith('.js'))
  for (const f of promptFiles) {
    const code = stripComments(readFileSync(join(promptDir, f), 'utf8'))
    // A trailing underscore marks a PREFIX (e.g. `vibe_v5_record_*`), not a name - measured false positive #2.
    for (const m of code.matchAll(/\bvibe_(?:v5|vmu)_[a-z0-9_]*[a-z0-9]\b/g)) {
      const name = m[0]
      if (name.endsWith('_')) continue
      if (known.has(name) || aliasFroms.has(name)) continue
      if (!out.has(name)) out.set(name, new Set())
      out.get(name).add(f)
    }
  }
  return [...out.entries()].map(([name, files]) => ({ name, files: [...files].sort() })).sort((a, b) => a.name.localeCompare(b.name))
}

const argv = process.argv.slice(2)

if (argv.includes('--selftest')) {
  const dir = mkdtempSync(join(tmpdir(), 'promptnames-'))
  let bad = 0
  const check = (cond, name, detail) => { if (!cond) { bad += 1; console.log('  FAIL ' + name + ' ' + JSON.stringify(detail || null)) } }
  try {
    const prompts = join(dir, 'prompts')
    mkdirSync(prompts)
    writeFileSync(join(prompts, 'p.js'),
      'export const A = [\n' +
      '  "call `vibe_vmu_task` with action list",\n' +        // a real host face
      '  "and `vibe_v5_record_*` for the log",\n' +           // a PREFIX, not a name
      '  "`vibe_v5_members` forwards to the service",\n' +    // an alias - legitimate
      '  "but `vibe_vmu_motion` does not exist",\n' +         // ★ the invented one
      ']\n')
    const declared = { known: new Set(['vibe_vmu_task']), aliasFroms: new Set(['vibe_v5_members']) }
    const miss = missingNames(prompts, declared)
    const names = miss.map((m) => m.name)
    check(names.includes('vibe_vmu_motion'), '★★ 提示词里编造的工具名必须被抓到', names)
    check(!names.includes('vibe_vmu_task'), '★ 真实工具名不算缺失', names)
    check(!names.includes('vibe_v5_members'), '★★ 别名 from 不算缺失（否则这是假阳性）', names)
    check(!names.some((n) => n.endsWith('_')), '★ 前缀（vibe_v5_record_）不算名字', names)
    check(miss.length === 1, '★ 只报那一个（判据不是恒报也不是恒静）', names)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  console.log('SELFTEST ' + (bad === 0 ? 'PASS' : 'FAIL (' + bad + ')'))
  process.exit(bad === 0 ? 0 : 1)
}

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) passed += 1
  else { failed += 1; failures.push(name + (detail === undefined ? '' : ' [' + JSON.stringify(detail) + ']')) }
}

const declared = knownToolNames()
ok(declared.known.size > 0 && declared.aliasFroms.size > 0,
  '★ 前提：两组名字都收集到了（空集会让下面永远绿 —— 本门禁存在的理由就是这个）', { known: declared.known.size, aliases: declared.aliasFroms.size })

const packsRoot = join(VMU, 'packs')
const packRoots = listing(packsRoot, { mayBeEmpty: false })
// ★ THIS ASSERTION IS THE POINT, NOT A FORMALITY. Everything below runs inside a loop over the pack directories, so if
// that list were empty every per-pack assertion would never run and the gate would report "0 failed" about nothing.
// `audit-declaration-criterion`'s RULE E flagged exactly this shape three times while this file was being written (the
// ternary listing, a `for` over a `readdirSync(...)` call, then a `for` over a helper call) and it was right each time.
ok(packRoots.length > 0,
  '★ 前提：至少一个整合包目录（否则下面的逐包断言一条都不会跑，门禁会静默通过）', packRoots)
for (const pack of packRoots) {
  const pd = join(packsRoot, pack, 'prompts')
  if (!existsSync(pd)) continue
  const miss = missingNames(pd, declared)
  ok(miss.length === 0,
    '★★ packs/' + pack + ' 的提示词只提到仓内真实存在的工具（别名与工具表都算）—— 编造的工具名会让成员照着提示词调一个不存在的面',
    miss)
}

console.log('=== PROMPT TOOL NAMES: ' + passed + ' passed, ' + failed + ' failed ===')
console.log('  known=' + declared.known.size + '  aliases=' + declared.aliasFroms.size)
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)

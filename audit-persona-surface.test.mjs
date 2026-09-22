#!/usr/bin/env node
/**
 * PERSONA SURFACE — prompt/allocation consistency for the four presets.
 *
 * WHY THIS EXISTS
 *   The persona row of each `agent.cordis.yml` is the prompt the MAIN agent actually
 *   receives, and it is the only place the main agent learns which `vibe_*` tools exist
 *   and which parameters it may tune. Two failure modes are invisible to every other
 *   suite, because those suites call `apply(ctx)` directly and never load the YAML:
 *
 *     1. a tool is registered but never named in the persona  → the agent does not know
 *        the capability exists (it cannot even guess the exact name);
 *     2. the persona names a tool that is NOT registered       → the agent calls a tool
 *        that will fail, and (in the worst case) is told to rely on it.
 *
 *   The Lean formal-verification feature shipped with exactly this bug in three of four
 *   presets: the three `*_lean_*` tools were registered unconditionally but the v2/v3/v4
 *   personas never listed them (v5's did), and v4's `vibe_v4_set` parameter list omitted
 *   `formalVerify`/`leanCommand`/`leanArgs`/`leanTimeoutMs`, so the coordinator could not
 *   discover the switch at all. Nothing in the build noticed. Hence this guard.
 *
 * INVARIANTS (per preset)
 *   A. the persona row carries both `prefix` and `text` literal blocks, and both parse
 *      into a non-empty body (both keys are required for DSH schema/back-compat);
 *   B. the two blocks are IDENTICAL apart from their first line — an old host that uses
 *      `text` must not receive a different tool surface from a new host that uses `prefix`;
 *   C. mentions ⊆ registered: every `vibe_*` token in the persona is a registered tool
 *      (a `name*` mention is allowed when some registered tool carries that prefix);
 *   D. registered \ mentioned equals an explicit, reviewed snapshot — so adding a tool
 *      without documenting it (or deleting a tool the persona still advertises) fails
 *      loudly and forces the author to make a decision;
 *   E. the parameter surface of the Lean feature (the four names) and its semantics
 *      (three modes, the fidelity switch, the project/global paths) appear in BOTH blocks.
 *
 * The snapshots below are the reviewed answer to "is this tool intentionally absent from
 * the coordinator's persona?" — virtually all of them are `(member)` / `(academician)` /
 * `(resident)` tools that only subagents call.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('./', import.meta.url))
/**
 * `PERSONA_ROOT` points the preset lookup at a prepared copy. It exists so that
 * `audit-persona-sensitivity.mjs` can prove this suite is not vacuous: each probe mutates a
 * copy of one persona (or one plugin) and requires this suite to go RED. Without the
 * override the mutation would never be loaded and every probe would be a false green.
 * `docs/formal-verification.md` is always read from this file's own directory, because the
 * shared contract is not part of a preset copy.
 */
const BASE = process.env.PERSONA_ROOT ? resolve(process.env.PERSONA_ROOT) : ROOT

let passed = 0
let failed = 0
const failures = []
function ok(cond, msg) {
  if (cond) { passed++; return true }
  failed++
  failures.push(msg)
  return false
}
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  return ok(a === e, `${msg}\n      expected: ${e}\n      actual:   ${a}`)
}

/**
 * Extract a YAML literal block scalar (`prefix: |-`) by indentation. Deliberately does
 * not depend on a YAML library: this file must run inside the published package, where
 * only the DSH host (not this repo) has one. The block's own indentation is stripped so
 * the `prefix` and `text` bodies can be compared line by line.
 */
function literalBlocks(yml) {
  const out = {}
  const lines = yml.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)([A-Za-z_][\w-]*):\s*\|-?\s*$/.exec(lines[i])
    if (!m) continue
    const ind = m[1].length
    const body = []
    for (let j = i + 1; j < lines.length; j++) {
      const L = lines[j]
      if (L.trim() === '') { body.push(''); continue }
      const li = L.length - L.trimStart().length
      if (li <= ind) break
      body.push(L.slice(ind + 2))
    }
    out[m[2]] = body
  }
  return out
}

/**
 * The slice of a plugin that describes and implements its `/vN` slash command: the
 * `commands.register({...})` block, plus — for v2/v3, which dispatch through a named function —
 * the `dispatchVibeCommand` body (that is where their branch list and usage string live).
 * The anchor includes the `{` on purpose: the files also mention `commands.register()` in a
 * prose comment *before* the real call, and anchoring on the call's object literal skips it.
 */
function commandRegion(src) {
  const i = src.indexOf('commands.register({')
  if (i < 0) return null
  const end = src.indexOf('\n  }))', i)
  let region = src.slice(i, end > i ? end : Math.min(src.length, i + 8000))
  if (!/cmd\s*===\s*'/.test(region)) {
    const d = src.indexOf('dispatchVibeCommand(cmd, args)')
    if (d >= 0) {
      const dEnd = src.indexOf('\n  }', d)
      region += '\n' + src.slice(d, dEnd > d ? dEnd : d + 8000)
    }
  }
  return region
}

/** Split a `a|b <x|y>|c` advertised list into bare subcommand names. */
function cmdsFrom(list) {
  const out = []
  const bare = String(list).replace(/\[[^\]]*\]/g, ' ').replace(/<[^>]*>/g, ' ')
  for (const tok of bare.split('|')) {
    const t = tok.trim()
    if (!t || t === '...') continue
    const name = t.split(/\s+/)[0]
    if (/^[a-z][a-z0-9-]*$/.test(name)) out.push(name)
  }
  return out
}

const PRESETS = [
  {
    dir: 'vibe-math-v2',
    js: 'vibe-math-v2.js',
    prefix: 'vibe_math_',
    tools: 25,
    // member-facing write-lock / scheduler-metadata tools; the v2 coordinator never
    // writes Markdown itself, so they stay out of its persona.
    undocumented: [],
    lean: { tools: ['vibe_math_lean_run', 'vibe_math_lean_archive', 'vibe_math_lean_lib'], extra: [] },
  },
  {
    dir: 'vibe-math-v3',
    js: 'vibe-math-v3.js',
    prefix: 'vibe_math_',
    tools: 33,
    undocumented: ['vibe_math_claim_write', 'vibe_math_release_write', 'vibe_math_sync_meta'],
    lean: { tools: ['vibe_math_lean_run', 'vibe_math_lean_archive', 'vibe_math_lean_lib'], extra: [] },
  },
  {
    dir: 'vibe-math-v4',
    js: 'vibe-math-v4.js',
    prefix: 'vibe_v4_',
    tools: 32,
    // resident-facing tools (mail, library cards, task board, write lock). The
    // coordinator drives residents through vibe_v4_message / _meeting / _add_member.
    undocumented: [
      'vibe_v4_send_message', 'vibe_v4_publish_progress', 'vibe_v4_record_proposition',
      'vibe_v4_record_method', 'vibe_v4_record_subproblem', 'vibe_v4_read_progress',
      'vibe_v4_list_residents', 'vibe_v4_propose_task', 'vibe_v4_claim_task',
      'vibe_v4_task_done', 'vibe_v4_list_tasks', 'vibe_v4_report_context',
      'vibe_v4_claim_write', 'vibe_v4_release_write',
    ],
    lean: { tools: ['vibe_v4_lean_run', 'vibe_v4_lean_archive', 'vibe_v4_lean_lib'], extra: ['vibe_v4_formal_report'] },
  },
  {
    dir: 'vibe-math-v5',
    js: 'vibe-math-v5.js',
    prefix: 'vibe_v5_',
    tools: 35,
    // member- and academician-facing tools; the office (main agent) holds only the
    // institute-level controls plus the hiring authority.
    undocumented: [
      'vibe_v5_wait', 'vibe_v5_record_progress', 'vibe_v5_record_proposition',
      'vibe_v5_record_method', 'vibe_v5_record_subproblem', 'vibe_v5_read_library',
      'vibe_v5_propose_verify', 'vibe_v5_verdict', 'vibe_v5_task_create',
      'vibe_v5_task_list', 'vibe_v5_task_get', 'vibe_v5_task_update',
      'vibe_v5_overview', 'vibe_v5_assign', 'vibe_v5_prioritize', 'vibe_v5_nudge',
    ],
    lean: { tools: ['vibe_v5_lean_run', 'vibe_v5_lean_archive', 'vibe_v5_lean_lib'], extra: [] },
  },
]

const LEAN_PARAMS = ['formalVerify', 'leanCommand', 'leanArgs', 'leanTimeoutMs']

for (const P of PRESETS) {
  const ymlPath = join(BASE, P.dir, 'agent.cordis.yml')
  const jsPath = join(BASE, P.dir, P.js)
  const yml = readFileSync(ymlPath, 'utf8')
  const src = readFileSync(jsPath, 'utf8')

  // ---- registered tools -------------------------------------------------
  const registered = new Set()
  for (const m of src.matchAll(/registerTool\(\s*'([A-Za-z0-9_]+)'/g)) registered.add(m[1])
  eq(registered.size, P.tools, `${P.dir}: registered tool count changed (update this snapshot deliberately)`)

  // ---- A. both literal blocks exist and are non-empty -------------------
  const blocks = literalBlocks(yml)
  const hasPersona = /^\s*-\s*id:\s*persona\s*$/m.test(yml)
  ok(hasPersona, `${P.dir}: no persona row in agent.cordis.yml`)
  for (const key of ['prefix', 'text']) {
    ok(Array.isArray(blocks[key]) && blocks[key].length > 0, `${P.dir}: persona.config.${key} is missing or not a literal block`)
  }
  if (!blocks.prefix || !blocks.text) { ok(false, `${P.dir}: cannot continue without both blocks`); continue }

  // ---- B. the two blocks must not drift --------------------------------
  const trimTail = (a) => { const b = a.slice(); while (b.length && b[b.length - 1] === '') b.pop(); return b }
  const p = trimTail(blocks.prefix)
  const t = trimTail(blocks.text)
  eq(p.length, t.length, `${P.dir}: prefix and text have different line counts`)
  const drift = []
  for (let i = 1; i < Math.max(p.length, t.length); i++) if (p[i] !== t[i]) drift.push(i)
  ok(drift.length === 0, `${P.dir}: prefix and text differ on line(s) ${drift.slice(0, 5).join(', ')} (only line 0 may differ)`)
  ok(/\{\{model\}\}/.test(p[0]) || /\{\{model\}\}/.test(t[0]), `${P.dir}: line 0 does not interpolate {{model}}`)

  // ---- C/D. mention <-> registry ----------------------------------------
  for (const key of ['prefix', 'text']) {
    const body = blocks[key].join('\n')
    const mentioned = new Set()
    const wildcards = new Set()
    // Uppercase is part of the token class on purpose: a drifted name such as
    // `vibe_v4_formal_reportX` must be captured whole and judged unregistered, instead of
    // being read as a mention of the registered `vibe_v4_formal_report`.
    const re = new RegExp('\\b' + P.prefix.replace(/_$/, '') + '_[A-Za-z0-9_]+', 'g')
    for (const m of body.matchAll(re)) {
      if (body[m.index + m[0].length] === '*') { wildcards.add(m[0]); continue }
      mentioned.add(m[0])
    }
    const stale = [...mentioned].filter((n) => !registered.has(n)).sort()
    eq(stale, [], `${P.dir} [${key}]: persona advertises tool(s) that are not registered`)
    for (const w of wildcards) {
      ok([...registered].some((n) => n.startsWith(w)), `${P.dir} [${key}]: wildcard mention ${w}* matches no registered tool`)
    }
    const undocumented = [...registered].filter((n) => !mentioned.has(n)).sort()
    eq(undocumented, [...P.undocumented].sort(), `${P.dir} [${key}]: undocumented-tool snapshot changed`)
  }

  // ---- F. the slash-command surface -------------------------------------
  // The persona enumerates the `/vN` subcommands; the plugin advertises them twice more
  // (the command `hint` the user sees while typing, and the `usage` string returned by the
  // unknown-subcommand path) and implements them in a third place. A `/v4` usage string once
  // advertised a `message` subcommand that no branch implemented; the v5 persona and plan
  // omitted `add|remove` although the handler implements them. All three surfaces must agree.
  const region = commandRegion(src)
  if (!ok(region !== null, `${P.dir}: no commands.register(...) block found`)) continue
  const hinted = cmdsFrom(region.match(/hint:\s*'\[(.*)\]'/)?.[1] || '')
  // The LAST `usage:` is the unknown-subcommand advertisement; earlier ones are inline
  // per-branch usage hints (e.g. `/v4 message <to|all> <content>`).
  const usageMatches = [...region.matchAll(/usage:\s*'([^']*)'/g)]
  const used = cmdsFrom(usageMatches.length ? usageMatches[usageMatches.length - 1][1] : '')
  const implemented = [...new Set([...region.matchAll(/cmd\s*===\s*'([a-z0-9_-]+)'/g)].map((m) => m[1]))].sort()
  const hintOpen = /\.\.\./.test(region.match(/hint:\s*'\[(.*)\]'/)?.[1] || '')
  ok(hinted.length > 0 && implemented.length > 0, `${P.dir}: could not extract the slash-command surface (hint ${hinted.length}, branches ${implemented.length})`)
  eq(hinted.filter((c) => !implemented.includes(c)).sort(), [], `${P.dir}: the slash hint advertises subcommand(s) that no branch implements`)
  if (!hintOpen) eq(implemented.filter((c) => !hinted.includes(c)).sort(), [], `${P.dir}: implemented slash subcommand(s) are missing from the hint`)
  eq(used.sort(), implemented, `${P.dir}: the usage string and the implemented slash subcommands disagree`)
  const personaEnum = /slash command mirrors[^(]*\(([\s\S]*?)\)/.exec(blocks.prefix.join('\n') + '\n' + blocks.text.join('\n'))
  if (personaEnum && personaEnum[1].includes('|')) {
    const personaCmds = cmdsFrom(personaEnum[1].replace(/^\s*\/[a-z0-9]+\s+/, ''))
    if (personaCmds.length) {
      eq(personaCmds.filter((c) => !hinted.includes(c)).sort(), [], `${P.dir}: the persona enumerates slash subcommand(s) the hint does not know`)
      if (!/\.\.\./.test(personaEnum[1]) && !hintOpen) eq(personaCmds.slice().sort(), hinted.slice().sort(), `${P.dir}: the persona's /vN list and the command hint disagree`)
    }
  }

  // ---- E. the Lean feature's prompt surface ----------------------------
  const names = (s) => new RegExp('\\b' + s + '\\b')
  for (const key of ['prefix', 'text']) {
    const body = blocks[key].join('\n')
    for (const tool of P.lean.tools) ok(names(tool).test(body), `${P.dir} [${key}]: Lean tool ${tool} is never named`)
    for (const tool of P.lean.extra) ok(names(tool).test(body), `${P.dir} [${key}]: ${tool} is never named`)
    for (const prm of LEAN_PARAMS) ok(names(prm).test(body), `${P.dir} [${key}]: Lean parameter ${prm} is never named`)
    for (const mode of ['off', 'encourage', 'require']) ok(body.includes(`'${mode}'`), `${P.dir} [${key}]: Lean mode ${mode} is never spelled out`)
    ok(/FIDELITY|忠实性/.test(body), `${P.dir} [${key}]: the fidelity switch of a passing Lean run is not stated`)
    ok(body.includes('Formal/Lib') && body.includes('Formal/Proved'), `${P.dir} [${key}]: the cross-project Lean library paths are not stated`)
    ok(body.includes('Verified/Lean'), `${P.dir} [${key}]: the archived-proof path Verified/Lean is not stated`)
  }
}

// ---- the shared contract must stay in step with the personas -----------
try {
  const contract = readFileSync(join(ROOT, 'docs', 'formal-verification.md'), 'utf8')
  for (const prm of LEAN_PARAMS) ok(contract.includes(prm), `docs/formal-verification.md: parameter ${prm} is not documented`)
  for (const sec of ['off', 'encourage', 'require']) ok(new RegExp('`' + sec + '`').test(contract), `docs/formal-verification.md: mode ${sec} is not documented`)
  ok(contract.includes('Verified/Lean'), 'docs/formal-verification.md: the archived-proof path is not documented')
  ok(contract.includes('Formal/Lib') && contract.includes('Formal/Proved'), 'docs/formal-verification.md: the global library paths are not documented')
} catch (e) {
  ok(false, `docs/formal-verification.md: cannot read the shared contract (${e.message})`)
}

// ---- G. the human-reviewable persona corpus (shipped) -------------------
// Assertions are not enough: the reviewer must be able to READ what the main agent receives
// without digging through YAML (see AUDIT-CHECKLIST §2.4). This writes the exact persona text
// of all four presets to `prompt-corpus-persona/` and is skipped when running against a copy
// (PERSONA_ROOT), so a mutation probe can never overwrite the shipped corpus.
{
  const rows = PRESETS.map((P) => {
    const yml = readFileSync(join(BASE, P.dir, 'agent.cordis.yml'), 'utf8')
    const b = literalBlocks(yml)
    const src = readFileSync(join(BASE, P.dir, P.js), 'utf8')
    const registered = [...new Set([...src.matchAll(/registerTool\(\s*'([A-Za-z0-9_]+)'/g)].map((m) => m[1]))].sort()
    const region = commandRegion(src) || ''
    return {
      preset: P.dir,
      tools: registered.length,
      prefix: (b.prefix || []).join('\n'),
      text: (b.text || []).join('\n'),
      slashHint: (region.match(/hint:\s*'\[(.*)\]'/) || [])[1] || '',
    }
  })
  eq(rows.length, PRESETS.length, 'persona corpus: not every preset was captured')
  ok(rows.every((r) => r.prefix.length > 0 && r.text.length > 0), 'persona corpus: a preset has an empty persona block')
  const corpusDir = join(ROOT, 'prompt-corpus-persona')
  if (!process.env.PERSONA_ROOT) {
    const md = ['# 四个预设的 persona 原文（主代理实际收到的提示词）', '',
      '> 本文件由 `audit-persona-surface.test.mjs` 生成，供人工复核：四个预设的主代理分别被告知了',
      '> 哪些工具、哪些参数、哪些斜杠子命令。`prefix` 与 `text` 两个块**只允许第 0 行不同**。', '']
    for (const r of rows) {
      md.push(`## ${r.preset}`, '', `- 注册工具数：**${r.tools}**`, `- 斜杠命令 hint：\`${r.slashHint}\``, '',
        '### config.prefix', '', '```text', r.prefix, '```', '', '### config.text', '', '```text', r.text, '```', '')
    }
    mkdirSync(corpusDir, { recursive: true })
    writeFileSync(join(corpusDir, 'persona-corpus.md'), md.join('\n'), 'utf8')
    writeFileSync(join(corpusDir, 'persona-corpus.json'), JSON.stringify({ presets: rows }, null, 2) + '\n', 'utf8')
  }
  // Round-trip check: the shipped corpus must name all four presets and carry line 0 of each block.
  // Skipped under PERSONA_ROOT: there `rows` describe the mutated copy while the corpus on disk
  // describes the real presets, so comparing them would be meaningless.
  if (process.env.PERSONA_ROOT) {
    ok(existsSync(join(corpusDir, 'persona-corpus.md')) && existsSync(join(corpusDir, 'persona-corpus.json')),
      'persona corpus: the shipped corpus files are missing from the repository')
  } else {
    try {
      const back = readFileSync(join(corpusDir, 'persona-corpus.md'), 'utf8')
      for (const r of rows) {
        ok(back.includes(`## ${r.preset}`), `persona corpus: ${r.preset} is missing from the shipped corpus`)
        ok(back.includes(r.prefix.split('\n')[0]), `persona corpus: ${r.preset} prefix line 0 is missing from the shipped corpus`)
      }
      const backJson = JSON.parse(readFileSync(join(corpusDir, 'persona-corpus.json'), 'utf8'))
      eq(backJson.presets.length, PRESETS.length, 'persona corpus (json): not every preset was captured')
    } catch (e) {
      ok(false, `persona corpus: cannot read back the shipped corpus (${e.message})`)
    }
  }
}

console.log('')
for (const f of failures) console.log('  FAIL ' + f)
console.log(`\n=== PERSONA SURFACE RESULT: ${passed} passed, ${failed} failed ===`)
process.exit(failed === 0 ? 0 : 1)

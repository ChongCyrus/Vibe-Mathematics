#!/usr/bin/env node
/**
 * PROMPT/INTERACTION INVARIANTS — the specific defect CLASSES this project has actually shipped,
 * encoded as static invariants over all four presets. This is the mechanical answer to
 * "are the prompt defects really fixed, and can they come back silently?".
 *
 * Every check below exists because the class was found in a real audit round:
 *   I1  abbreviated tool names in agent-facing text   (lean_archive is not a registered tool)
 *   I2  a fidelity defect expressed as a 0 vote        ("偏离 → 0" records 命题为假)
 *   I3  the defect rule missing from the injected text (不要投 0 + decision:'defect')
 *   I4  `defect` advertised but not handled by code    (the v2 dead-channel class)
 *   I5  the reply contract not offering `defect`       (a defect would be unrecordable)
 *   I6  a defect accepted without a reason             (silent, unauditable decisions)
 *   I7  the wrong reply field name in the fidelity text (`verdict` where the parser reads `Result`)
 *   I8  the `formal` reply channel live in `off` mode  (off must be a TRUE no-op)
 *   I9  corpus non-determinism / machine-path leaks / missing mode coverage
 *   I10 the prompt-rule sensitivity probes going missing (a guard that is not proven to go red)
 *   I11 the "no Lean toolchain" guidance naming only one of the two failure codes
 *   I12 the fidelity branch promising a hold that `encourage` cannot enforce
 *   I13 the Lean switch unreachable THROUGH the closed tool schema (v3 2.3.1: all four params
 *       missing from vibe_math_set_params, invisible to every suite because suites call handlers)
 *   I14 a parameter the tool schema advertises but the parameter layer silently drops
 *
 * Run: node audit-prompt-invariants.mjs        (add --json for a machine-readable report)
 *      node audit-prompt-invariants.mjs --self-probe
 *          prove the guard is a guard: re-run itself on mutated sources and require the matching
 *          invariant to go RED (control run must stay green)
 */
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const HERE = fileURLToPath(new URL('./', import.meta.url))
/**
 * `PROMPT_INVARIANTS_MUTATE` carries a JSON `[rel, from, to]` triple: a single file is mutated IN
 * MEMORY for one child run, so `--self-probe` can demonstrate that the invariant keyed to it really
 * turns red. (Not a NUL-separated string: env values may not contain NUL bytes.)
 */
function readRaw(rel) {
  const p = join(HERE, rel)
  if (!existsSync(p)) return null
  let text = readFileSync(p, 'utf8')
  const mut = process.env.PROMPT_INVARIANTS_MUTATE
  if (mut) {
    try {
      const [rel2, from, to] = JSON.parse(mut)
      if (rel2 === rel && from) text = text.replace(from, to)
    } catch (e) { /* a malformed mutation is a harness error, not an invariant failure */ }
  }
  return text
}
const read = readRaw

/**
 * Each mutation is a real defect shape from this project's history. `expect` is a substring that
 * MUST appear in the failing run; `control: true` marks the unmutated run, which must stay green.
 */
const SELF_PROBE_MUTATIONS = [
  { name: 'control (no mutation)', rel: '', from: '', to: '', expect: '', control: true },
  {
    name: 'v3: one set_params registration loses the Lean params (I13 — the v2.3.1 shipped defect)',
    rel: 'vibe-math-v3/vibe-math-v3.js',
    from: 'formalVerify: { type: \'string\'',
    to: 'formalVerifyDISABLED: { type: \'string\'',
    expect: 'v3 I13: every vibe_math_set_params schema advertises',
  },
  {
    name: 'v3: objParams stops closing the schema (I13 premise)',
    rel: 'vibe-math-v3/vibe-math-v3.js',
    from: "additionalProperties: false, required: required || [] }",
    to: 'required: required || [] }',
    expect: 'v3 I13: every objParams definition closes tool schemas',
  },
  {
    name: 'v4: the schema advertises a knob the parameter layer drops (I14)',
    rel: 'vibe-math-v4/vibe-math-v4.js',
    from: "leanTimeoutMs:{type:'integer'}",
    to: "leanTimeoutMs:{type:'integer'},bogusKnob:{type:'string'}",
    expect: 'v4 I14: every key vibe_v4_set advertises is actually accepted',
  },
  {
    name: 'v5: normalizeParams stops accepting an advertised key (I14)',
    rel: 'vibe-math-v5/vibe-math-v5.js',
    from: "'meetingKeepEvery', 'leanTimeoutMs']",
    to: "'meetingKeepEvery']",
    expect: 'advertised but dropped: [leanTimeoutMs]',
  },
]

if (process.argv.includes('--self-probe')) {
  const bad = []
  for (const mut of SELF_PROBE_MUTATIONS) {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--json'], {
      cwd: HERE,
      env: Object.assign({}, process.env, mut.control ? {} : { PROMPT_INVARIANTS_MUTATE: JSON.stringify([mut.rel, mut.from, mut.to]) }),
      encoding: 'utf8',
    })
    let parsed = null
    try { parsed = JSON.parse(r.stdout) } catch (e) { /* fall through to the diagnostic below */ }
    const text = (r.stdout || '') + (r.stderr || '')
    if (mut.control) {
      const ok = r.status === 0 && parsed && parsed.failed === 0
      console.log((ok ? 'PASS ' : 'FAIL ') + 'control: the unmutated run stays green (' + (parsed ? parsed.failed + ' failures' : 'unparsable output') + ')')
      if (!ok) bad.push('control run was not green')
      continue
    }
    const hit = text.includes(mut.expect)
    const red = r.status === 1 && parsed && parsed.failed > 0
    const ok = red && hit
    console.log((ok ? 'PASS ' : 'FAIL ') + mut.name + (ok ? '' : '  → exit=' + r.status + ' hit=' + hit))
    if (!ok) bad.push(mut.name + ' (exit ' + r.status + ', expected ' + JSON.stringify(mut.expect) + ')')
  }
  console.log('')
  console.log('PROMPT INVARIANT SELF-PROBE: ' + (SELF_PROBE_MUTATIONS.length - bad.length) + '/' + SELF_PROBE_MUTATIONS.length + ' as required')
  for (const b of bad) console.error('  FAIL ' + b)
  process.exit(bad.length === 0 ? 0 : 1)
}

/**
 * Blank out comments (line + block) while preserving string/template REGEX literals, so invariants
 * about "text shown to an agent" do not fire on a COMMENT that quotes an anti-pattern. A naive regex
 * would both miss block comments and mangle strings containing `//` (URLs), so this walks the
 * source as a tiny scanner. Newlines are preserved to keep any line-based diagnostics aligned.
 *
 * Regex literals matter: all four presets contain `/[\\/:*?"<>|\u0000-\u001f]+/` — a regex whose
 * character class contains a DOUBLE QUOTE. Without regex handling the scanner treats that quote as
 * the start of a string, keeps the state machine wrong for the rest of the file, and then either
 * leaves a comment in the "code" stream (a spurious invariant failure) or blanks real code (a
 * missed defect). X5/X6 below are self-checks for exactly that.
 */
function stripComments(src) {
  const out = []
  let i = 0
  let state = 'code' // code | line | block | sq | dq | tpl | regex
  let prev = '' // last significant code token (a single char, or a whole word such as `return`)
  let word = '' // identifier/keyword accumulator, so `return /re/` is not read as division
  // A `/` starts a REGEX LITERAL after an operator/keyword, and DIVISION after a value. Tracking only
  // the previous CHARACTER is not enough: `return /^\s*import/.test(l)` (v3 really contains it) puts
  // an identifier before the slash. Getting this wrong is exactly the bug X5–X8 guard against.
  const REGEX_AFTER_KEYWORD = /^(?:return|typeof|case|delete|void|instanceof|in|of|yield|await|new|do|else)$/
  while (i < src.length) {
    const c = src[i]
    const c2 = src[i + 1]
    if (state === 'code') {
      if (c === '/' && c2 === '/') { state = 'line'; out.push('  '); i += 2; continue }
      if (c === '/' && c2 === '*') { state = 'block'; out.push('  '); i += 2; continue }
      if (c === '/' && (prev === '' || REGEX_AFTER_KEYWORD.test(prev) || /[(,=:[!&|?{};+\-*%~^<>]/.test(prev))) {
        state = 'regex'; out.push(c); i++; continue
      }
      if (c === "'") state = 'sq'
      else if (c === '"') state = 'dq'
      else if (c === '`') state = 'tpl'
      if (/[A-Za-z0-9_$]/.test(c)) word += c
      else { if (word) { prev = word; word = '' } if (!/\s/.test(c)) prev = c }
      out.push(c); i++; continue
    }
    if (state === 'line') {
      if (c === '\n') { state = 'code'; out.push(c) } else out.push(' ')
      i++; continue
    }
    if (state === 'block') {
      if (c === '*' && c2 === '/') { state = 'code'; out.push('  '); i += 2; continue }
      out.push(c === '\n' ? c : ' '); i++; continue
    }
    if (state === 'regex') {
      if (c === '\\') { out.push(c, c2 === undefined ? '' : c2); i += 2; continue }
      if (c === '[') { state = 'regexClass'; out.push(c); i++; continue }
      if (c === '/') { // end of the literal: copy it plus any flags
        out.push(c); i++
        while (i < src.length && /[a-z]/i.test(src[i])) { out.push(src[i]); i++ }
        state = 'code'; prev = ')'
        continue
      }
      out.push(c); i++; continue
    }
    if (state === 'regexClass') {
      if (c === '\\') { out.push(c, c2 === undefined ? '' : c2); i += 2; continue }
      if (c === ']') state = 'regex'
      out.push(c); i++; continue
    }
    // inside a string/template: copy verbatim, honouring escapes and the closing quote
    if (c === '\\') { out.push(c, c2 === undefined ? '' : c2); i += 2; continue }
    if ((state === 'sq' && c === "'") || (state === 'dq' && c === '"') || (state === 'tpl' && c === '`')) state = 'code'
    out.push(c); i++
  }
  return out.join('')
}

/**
 * Balanced-bracket slice starting at src[openIdx] (one of ( [ {), string/comment aware.
 * Used by the TOOL-SURFACE invariants (I13/I14) to read a real parameter schema out of the source.
 */
function balanced(src, openIdx) {
  let depth = 0
  let i = openIdx
  let state = 'code'
  while (i < src.length) {
    const c = src[i]
    const c2 = src[i + 1]
    if (state === 'code') {
      if (c === "'" || c === '"' || c === '`') { state = c; i++; continue }
      if (c === '(' || c === '[' || c === '{') depth++
      else if (c === ')' || c === ']' || c === '}') { depth--; if (depth === 0) return src.slice(openIdx, i + 1) }
      i++; continue
    }
    if (c === '\\') { i += 2; continue }
    if (c === state) state = 'code'
    i++
  }
  return src.slice(openIdx)
}
/** Split an object-body on TOP-LEVEL commas only (brackets and strings respected). */
function splitTopLevel(body) {
  const parts = []
  let cur = ''
  let depth = 0
  let state = 'code'
  for (let i = 0; i < body.length; i++) {
    const c = body[i]
    const c2 = body[i + 1]
    if (state === 'code') {
      if (c === "'" || c === '"' || c === '`') { state = c; cur += c; continue }
      if (c === '{' || c === '[' || c === '(') depth++
      else if (c === '}' || c === ']' || c === ')') depth--
      if (c === ',' && depth === 0) { parts.push(cur); cur = ''; continue }
      cur += c; continue
    }
    if (c === '\\') { cur += c + (c2 || ''); i++; continue }
    if (c === state) state = 'code'
    cur += c
  }
  parts.push(cur)
  return parts.map((p) => p.trim()).filter(Boolean)
}
/** Property keys of the object literal at/after `at` (null when there is no object literal there). */
function objectKeys(src, at) {
  const open = src.indexOf('{', at)
  if (open < 0) return null
  const region = balanced(src, open)
  return splitTopLevel(region.slice(1, -1))
    .map((p) => { const m = p.match(/^['"]?([A-Za-z_$][\w$]*)['"]?\s*:/); return m ? m[1] : null })
    .filter(Boolean)
}

const PRESETS = [
  { tag: 'v2', js: 'vibe-math-v2/vibe-math-v2.js', suite: 'formal-verify-v2.test.mjs', corpus: 'prompt-corpus-v2/formal-verify-v2.md', valueField: 'Result', prefix: 'vibe_math_', setTool: 'vibe_math_set_params' },
  { tag: 'v3', js: 'vibe-math-v3/vibe-math-v3.js', suite: 'formal-verify-v3.test.mjs', corpus: 'prompt-corpus-v3/formal-verify-v3.md', valueField: 'Result', prefix: 'vibe_math_', setTool: 'vibe_math_set_params' },
  { tag: 'v4', js: 'vibe-math-v4/vibe-math-v4.js', suite: 'formal-verify-v4.test.mjs', corpus: 'prompt-corpus-v4/formal-verify-v4.md', valueField: 'verdict', prefix: 'vibe_v4_', setTool: 'vibe_v4_set' },
  { tag: 'v5', js: 'vibe-math-v5/vibe-math-v5.js', suite: 'formal-verify-v5.test.mjs', corpus: 'prompt-corpus-v5/prompt-corpus-v5.md', valueField: 'verdict', prefix: 'vibe_v5_', setTool: 'vibe_v5_set' },
]
const LEAN_PARAMS = ['formalVerify', 'leanCommand', 'leanArgs', 'leanTimeoutMs']

let passed = 0
const failures = []
const notes = []
function check(cond, label, detail) {
  if (cond) { passed++; return true }
  failures.push(label + (detail ? ' — ' + detail : ''))
  return false
}

for (const P of PRESETS) {
  const js = read(P.js)
  const suite = read(P.suite)
  const corpus = read(P.corpus)
  if (!check(js !== null, P.tag + ': plugin source readable', P.js)) continue
  if (!check(suite !== null, P.tag + ': suite readable', P.suite)) continue
  if (!check(corpus !== null, P.tag + ': prompt corpus shipped', P.corpus)) continue

  // I1/I2 run on the source with comments blanked: a comment may legitimately quote an
  // anti-pattern as documentation, but any STRING can reach an agent.
  const code = stripComments(js)

  // I1 — no abbreviated tool name in code/strings (code identifiers are leanArchive / leanRunTool,
  // so a bare lean_* token is always a string that can be shown to an agent).
  const bare = code.match(/(^|[^A-Za-z0-9_])lean_(run|archive|lib)\b/g) || []
  check(bare.length === 0, P.tag + ' I1: no abbreviated Lean tool name in agent-facing text', 'found ' + JSON.stringify(bare.slice(0, 3)))

  // I2 — never tell a voter to answer 0 for a faithfulness defect (comments excluded).
  check(!/偏离\s*(?:→|->|=>)\s*0/.test(code), P.tag + ' I2: no "偏离 → 0" instruction')

  // I3 — the defect rule is in the injected text.
  check(js.includes('不要投 0'), P.tag + ' I3: injected text forbids a 0 vote on a defect')
  check(/'defect'/.test(js) || /"defect"/.test(js), P.tag + ' I3: injected text names decision=\'defect\'')

  // I4 — the defect decision is actually HANDLED (comparison + a downgrade to `attempted`).
  const comparesDefect = /(?:===|==)\s*'defect'/.test(js) || /'defect'\s*(?:===|==)/.test(js)
  check(comparesDefect, P.tag + ' I4: the code compares decision against \'defect\'')
  const downgrades = /status:\s*'attempted'/.test(js) || /status='attempted'/.test(js) || /status:\s*"attempted"/.test(js)
  check(downgrades, P.tag + " I4: a defect downgrades the record to 'attempted'")

  // I5 — the reply contract offers the defect decision.
  const contractCount = js.split('"decision":"used|blocked|defect"').length - 1
  check(contractCount >= 1, P.tag + ' I5: the reply contract offers used|blocked|defect', 'occurrences=' + contractCount)

  // I6 — a defect without a reason is refused.
  check(/!note/.test(js), P.tag + ' I6: a defect/blocker without a note is rejected')

  // I7 — the fidelity instruction names the field the parser really reads.
  {
    const lines = js.split(/\r?\n/)
    const i = lines.findIndex((l) => l.includes('不要投 0'))
    const window = i >= 0 ? lines.slice(Math.max(0, i - 3), i + 8).join('\n') : ''
    check(i >= 0 && window.includes(P.valueField),
      P.tag + ' I7: the fidelity instruction names ' + P.valueField + ' (the real reply field)',
      i < 0 ? 'the 不要投 0 rule was not found' : 'window: ' + window.slice(0, 120).replace(/\n/g, ' | '))
    if (P.tag === 'v2' || P.tag === 'v3') {
      check(!/给出\s*verdict/.test(js), P.tag + ' I7b: no "给出 verdict" in a Result-based preset')
    }
  }

  // I8 — the `formal` reply channel is inert in off mode (tools stay usable on purpose).
  const offGuards = {
    v2: /absorbFormal(?:From)?Reply[\s\S]{0,900}!formalOn\(\)/,
    v3: /absorbFormal(?:From)?Reply[\s\S]{0,900}!formalOn\(\)/,
    v4: /applyFormalReply[\s\S]{0,900}!formalOn\(\)/,
    v5: /formalOn\(\)\s*&&\s*p\.formal/,
  }
  check(offGuards[P.tag].test(js), P.tag + ' I8: the reply channel is gated on formalOn() (off stays a no-op)')

  // I9 — the corpus covers every mode and is deterministic / machine-path free.
  check(corpus.includes('【Lean 形式化验证（鼓励模式）】'), P.tag + ' I9: corpus covers encourage mode')
  check(corpus.includes('【Lean 形式化验证（强制模式）】'), P.tag + ' I9: corpus covers REQUIRE mode')
  check(corpus.includes('不要投 0'), P.tag + ' I9: corpus contains the fidelity/defect rule')
  check(/used\|blocked\|defect/.test(corpus), P.tag + ' I9: corpus contains the reply contract line')
  check(/【顺手形式化/.test(corpus), P.tag + ' I9: corpus contains the work-round line')
  check(!/[A-Za-z]:[\\/]/.test(corpus), P.tag + ' I9: corpus leaks no absolute path')
  check(!/\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(corpus), P.tag + ' I9: corpus carries no timestamp (deterministic)')
  check(!/vibe-v[0-9]-[a-z]+-[A-Za-z0-9]{4,}/.test(corpus), P.tag + ' I9: corpus leaks no temp-dir name')

  // I10 — the prompt-rule probes exist for this preset (a guard nobody can prove is a guard nobody has).
  const probeSrc = read('audit-formal-sensitivity.mjs') || ''
  for (const kind of ['fidelity-defect-rule-removed', 'abbreviated-tool-name-injected', 'require-wording-removed', 'defect-decision-not-offered']) {
    check(probeSrc.includes("tag + '-" + kind + "'") || probeSrc.includes("'" + P.tag + '-' + kind + "'"),
      P.tag + ' I10: probe exists for ' + kind)
  }

  // I10b — the suite asserts the defect path (behaviourally, not just wording).
  check(/\bdefect\b/.test(suite), P.tag + ' I10b: the suite exercises the defect path')

  // I11 — the "no toolchain" guidance must name BOTH failure codes. An agent that only knows
  // LEAN_NOT_FOUND treats NO_SUBPROCESS as an unknown failure and retries instead of recording the
  // blocker (contract §6 hard rule 4).
  {
    const lines = js.split(/\r?\n/)
    const gi = lines.findIndex((l) => l.includes('宿主无 Lean 工具链'))
    const win = gi >= 0 ? lines.slice(Math.max(0, gi - 3), gi + 1).join('\n') : ''
    check(gi >= 0 && /LEAN_NOT_FOUND/.test(win) && /NO_SUBPROCESS/.test(win),
      P.tag + ' I11: the no-toolchain guidance names LEAN_NOT_FOUND AND NO_SUBPROCESS',
      gi < 0 ? 'the guidance line was not found' : 'window: ' + win.slice(0, 140).replace(/\n/g, ' | '))
  }

  // I12 — the fidelity branch must qualify its promise BY MODE. Only `require` has a gate, so the
  // text must say "本次裁定不定论" for require AND explicitly tell the voter, for encourage, that
  // this mode has no gate and their abstention is what prevents a conclusion. Shipping the
  // unconditional claim was a real defect that survived in three presets after v5 was fixed.
  check(js.includes('本档没有门禁'), P.tag + ' I12: the fidelity text states the encourage branch has no gate')
  check(js.includes('本次裁定**不定论**') || js.includes('本次裁定不定论'), P.tag + ' I12: the fidelity text states the require hold')

  // I13 — the Lean switch must be REACHABLE THROUGH THE TOOL SCHEMA. Every tool schema here is
  // built by `objParams`, which closes it with `additionalProperties:false`: a key the schema does
  // not list is REJECTED by any schema-validating provider. v3 shipped 2.3.0/2.3.1 with all four
  // Lean params missing from `vibe_math_set_params` and every suite stayed green, because the
  // suites call the handler directly and never look at the schema — the feature could not be turned
  // on at all. So: EVERY registration of the parameter tool (v2/v3 register it twice, for two agent
  // scopes) must advertise all four, and the closed-schema premise must still hold.
  {
    // EVERY objParams definition must close its schema: one open definition (v2/v3 define it twice,
    // for two agent scopes) would let tools registered through it accept arbitrary keys.
    const defs = [...code.matchAll(/function objParams\(/g)].map((m) => m.index)
    const closedDefs = defs.filter((i) => /additionalProperties:\s*false/.test(code.slice(i, i + 220)))
    check(defs.length > 0 && closedDefs.length === defs.length,
      P.tag + ' I13: every objParams definition closes tool schemas (additionalProperties:false)',
      'definitions=' + defs.length + ' closed=' + closedDefs.length +
      (defs.length ? '; if this is gone the schema no longer rejects unlisted keys and I13 loses its premise' : ''))
    const regRe = new RegExp("registerTool\\(\\s*['\"]" + P.setTool + "['\"]", 'g')
    const schemas = []
    let m
    while ((m = regRe.exec(code))) {
      const rest = code.slice(m.index)
      const oi = rest.indexOf('objParams(')
      schemas.push(oi < 0 ? null : objectKeys(rest, oi + 'objParams'.length))
    }
    check(schemas.length >= 1, P.tag + ' I13: the parameter tool ' + P.setTool + ' is registered',
      'no registerTool(\'' + P.setTool + '\') call found')
    const bad = schemas.map((s, i) => (s === null ? 'reg#' + i + ': no objParams schema'
      : LEAN_PARAMS.filter((k) => !s.includes(k)))).filter((x) => (Array.isArray(x) ? x.length : true))
    check(schemas.length >= 1 && bad.length === 0,
      P.tag + ' I13: every ' + P.setTool + ' schema advertises ' + LEAN_PARAMS.join('/'),
      bad.length ? JSON.stringify(bad) : 'no registration found')

    // I14 — a key the schema ACCEPTS must really be accepted by the parameter layer. Otherwise the
    // tool advertises a knob that is silently dropped: the caller sees {ok:true} and nothing changes.
    // The accept gate is DEFAULT_PARAMS for v2/v3/v4 (`if (k in params)`) and the typed lists inside
    // normalizeParams for v5 (only those keys are copied through).
    let accepts = null
    if (P.tag === 'v5') {
      const fn = code.search(/function\s+normalizeParams\s*\(/)
      const region = fn < 0 ? '' : balanced(code, code.indexOf('{', fn))
      const names = []
      for (const kind of ['ints', 'bools', 'strs', 'arrs']) {
        const ai = region.search(new RegExp('const\\s+' + kind + '\\s*=\\s*\\['))
        if (ai < 0) continue
        const arr = balanced(region, region.indexOf('[', ai))
        for (const lit of arr.match(/'[A-Za-z_$][\w$]*'/g) || []) names.push(lit.slice(1, -1))
      }
      accepts = names.length ? [...new Set(names)] : null
    } else {
      const di = code.search(/DEFAULT_PARAMS\s*=\s*\{/)
      accepts = di < 0 ? null : objectKeys(code, di)
    }
    check(accepts !== null && accepts.length > 0, P.tag + ' I14: the parameter accept-set is readable',
      'extractor found no parameter set — the invariant cannot be checked')
    const union = [...new Set(schemas.filter(Boolean).flat())]
    const dropped = accepts ? union.filter((k) => !accepts.includes(k)) : []
    check(accepts !== null && dropped.length === 0,
      P.tag + ' I14: every key ' + P.setTool + ' advertises is actually accepted (no silently-dropped knob)',
      'advertised but dropped: [' + dropped.join(',') + ']')
    check(union.length >= LEAN_PARAMS.length, P.tag + ' I14: the parameter schema was parsed (' + union.length + ' keys)',
      'schema extraction returned ' + union.length + ' keys')
  }

  notes.push(P.tag + ': plugin ' + js.length + 'B · suite ' + suite.length + 'B · corpus ' + corpus.length + 'B')
}

// Cross-preset: the probe script must refuse to report success on an empty selection (false green).
{
  const probeSrc = read('audit-formal-sensitivity.mjs') || ''
  check(/selected\.length === 0/.test(probeSrc), 'X1: the probe runner fails on an empty selection instead of reporting success')
  const runner = read('run-tests.mjs') || ''
  check(/no suites matched/.test(runner), 'X2: the suite runner fails when no suite matches')
  check(/argv\[i \+ 1\]/.test(runner) && /argv\[\+\+i\]/.test(runner), 'X3: the suite runner accepts both --flag=x and --flag x')
}

// X5–X7: guard the guard. I1/I13/I14 trust stripComments(), and all four presets contain a regex
// literal whose character class holds a double quote (`/[\\/:*?"<>|…]+/`). If the scanner mistook
// that quote for a string start, the rest of the file would be misread — a comment quoting an
// anti-pattern would look like code (spurious failure) or real code would be blanked (missed bug).
{
  const fixtureRegex = 'const t = s.replace(/[\\\\/:*?"<>|]+/g, "-")\n// lean_run is NOT a tool name\nconst b = 1'
  check(!stripComments(fixtureRegex).includes('lean_run'),
    'X5: the comment scanner survives a regex literal containing a quote (a following comment stays blanked)')
  const fixtureUrl = "L.push('see https://example.com/a')\nconst c = 2"
  check(stripComments(fixtureUrl).includes('https://example.com/a'),
    'X6: a // inside a STRING is not treated as a comment start (URLs must survive)')
  const fixtureBlock = "const d = /a\\/b/g\n/* lean_lib quoted in a block comment */\nconst e = 3"
  check(!stripComments(fixtureBlock).includes('lean_lib'),
    'X7: an escaped slash inside a regex does not end it early (a block comment after it stays blanked)')
  for (const [label, src] of [['X5', fixtureRegex], ['X6', fixtureUrl], ['X7', fixtureBlock]]) {
    check(stripComments(src).split('\n').length === src.split('\n').length,
      label + ': comment blanking preserves line structure (diagnostics stay aligned)')
  }
}

// X8 — the strongest scanner oracle there is: the comment-stripped source of EVERY preset must still
// PARSE. A scanner that mis-lexes (regex read as division, or a quote inside a regex read as a string
// start) corrupts real code, and `node --check` sees it. Sensitivity is MEASURED, not assumed:
//   · the 2.3.2 scanner (no regex support at all) → SyntaxError on all four presets → X8 red;
//   · the 2.3.3 scanner (regex-aware but no keyword rule) → X8 still green, which is exactly why
//     X8b below exists (it covers that narrower gap).
{
  const dir = mkdtempSync(join(tmpdir(), 'prompt-invariants-strip-'))
  try {
    for (const P of PRESETS) {
      const src = read(P.js)
      if (!src) continue
      const f = join(dir, P.tag + '.mjs')
      writeFileSync(f, stripComments(src))
      const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' })
      check(r.status === 0,
        'X8: the comment-stripped source of ' + P.tag + ' is still valid JS (the scanner must not corrupt code)',
        String(r.stderr || '').split('\n').filter((l) => l.trim()).slice(-2).join(' ').slice(0, 160))
    }
    // X8b: a fixture that needs the KEYWORD rule — a regex AFTER `return` whose character class holds
    // a quote (v3 really has `return /^\s*…/.test()`, so the rule is not hypothetical). A scanner that
    // reads that `/` as division enters "string" state at the quote and then leaves the NEXT comment
    // unblanked. Sensitivity MEASURED: the 2.3.3 scanner fails the second assertion below
    // (comment-blanked=false) while passing the first; the current scanner passes both.
    const fixtureKeyword = [
      'function f(l) { return /["\']/.test(l) }',
      '// lean_run must stay blanked',
      'const h = 4 / 2',
    ].join('\n')
    const f2 = join(dir, 'fixture.mjs')
    const stripped = stripComments(fixtureKeyword)
    writeFileSync(f2, stripped)
    const r2 = spawnSync(process.execPath, ['--check', f2], { encoding: 'utf8' })
    check(r2.status === 0, 'X8b: a regex after a KEYWORD (return /…/) does not corrupt the scan', String(r2.stderr || '').slice(0, 120))
    check(!stripped.includes('lean_run'), 'X8b: and the comment after it is still blanked (the keyword rule is what decides this)')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const out = { passed, failed: failures.length, failures, notes }
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(out, null, 2))
} else {
  console.log('-- prompt/interaction invariants (all four presets) --')
  for (const n of notes) console.log('  note ' + n)
  console.log('')
  for (const f of failures) console.error('  FAIL ' + f)
  console.log('')
  console.log('PROMPT INVARIANTS: ' + passed + ' passed, ' + failures.length + ' failed')
}
process.exit(failures.length === 0 ? 0 : 1)

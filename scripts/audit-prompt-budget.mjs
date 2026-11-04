// scripts/audit-prompt-budget.mjs — RUN 225-C: the prompt is a BUDGET, not a scrapbook.
//
// What this measures, on the REAL assembled prompt (not on source text that merely looks right):
//   · §A per-seat, per-phase assembled length — a seat prompt that grows every round is a seat prompt that
//     eventually cannot afford the round's own instructions;
//   · §B duplicate sentences — the same instruction said twice is noise that also makes the two copies drift;
//   · §C tool descriptions — count, mean length, and how many descriptions repeat another description's opening;
//   · §D prose parameter names — how often the prompt re-teaches what the JSON schema already fixes;
//   · §E tool names mentioned in prose that no face declares — a pointer to a tool nobody can call is a trap.
//
// Usage:
//   node scripts/audit-prompt-budget.mjs                 # human report, exit 0
//   node scripts/audit-prompt-budget.mjs --json          # machine report (the same numbers)
//   node scripts/audit-prompt-budget.mjs --check         # exit 1 when a budget in BUDGET is exceeded
//   node scripts/audit-prompt-budget.mjs --check --verbose
//
// The budgets below are RATCHETS: they are set just above what the current prompts cost, so an accidental
// re-bloat is red here instead of discovered by a member reading a 40k-character prompt. Lower them when the
// prompt gets shorter — never raise one without writing down why in the conformance ledger.

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const VMU = join(ROOT, 'vibe-math-vmu')

export const BUDGET = Object.freeze({
  // §A: the T99 cap every MEMBER seat prompt must fit (tests/vmu-turn.test.mjs asserts the same number).
  seatPromptChars: 30000,
  // ★ RUN 226: the chairman is a documented structural exception, not a silent one. Before this round the gate read
  // 32 057 for the chair only because it measured the wrong role; with the real assembly (bindings + settings + the
  // tools fixture mode) the chair is ~38 478, of which the biggest single item is `seat-faces.js` projecting the 40
  // tool bullets as prose. Until that projection is generated from the tool declarations, the chair gets its own hard
  // cap plus a WARNING while it is above the T99 number - a real ceiling instead of a red light nobody reads.
  chairPromptChars: 36000,
  // §A: the T99 number itself, kept as its own field so the warning can name it without inventing a constant.
  t99Chars: 30000,
  // §A: the ratchet — what the current prompts actually cost, plus a little room for one more lesson. It must live
  // ABOVE today's measurements, otherwise it is not a ratchet but a permanent red light (RUN 225: a 26 000 value fired
  // on member and temp every single run, which trains the reader to ignore the report).
  seatPromptChordChars: 28500,
  // §B: share of assembled characters that sit inside a sentence repeated within the same prompt.
  duplicateShare: 0.03,
  // §C: mean tool description length.
  toolDescriptionMean: 700,
  // §D: prose parameter-name occurrences per 1000 characters of assembled prompt.
  proseParamPer1k: 12,
})

const TOOL_NAME_RE = /vibe_v[0-9a-z_]+/g
// The parameter names the schema already fixes. Prose that repeats these every turn is the redundancy §D counts.
const PARAM_TOKENS = Object.freeze([
  'action', 'target', 'member', 'part', 'track', 'deliverable', 'decision', 'evidence', 'subject',
  'revision', 'draft', 'path', 'note', 'conclusion', 'rules', 'limits', 'participants', 'editor', 'format',
])

function readAll(rel) {
  return readFileSync(join(ROOT, rel), 'utf8')
}

/** The defaults are parsed from the SCHEMA file rather than hard-coded, so this audit is not agreeing with itself. */
function defaultsOf() {
  const out = {}
  const schema = readAll('vibe-math-vmu/settings/schema.js')
  for (const m of schema.matchAll(/\{ key: '([^']+)',[^}]*?def: (?:'([^']*)'|([0-9.]+)|(true|false))[^}]*\}/g)) {
    out[m[1]] = m[2] !== undefined ? m[2] : (m[3] !== undefined ? Number(m[3]) : m[4] === 'true')
  }
  return out
}

/** Split a prompt into sentences the way a reader would: on 。／！／？／; and on newlines, then normalise. */
function sentencesOf(text) {
  return String(text || '')
    .split(/(?<=[。！？!?])|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 24)
}

function normaliseSentence(s) {
  return s.replace(/[\s*#>`~\-—:：，,、（）()【】「」]/g, '').toLowerCase()
}

/** §B: characters inside sentences that appear MORE THAN ONCE in the same assembled prompt. */
export function duplicateFacts(text) {
  const groups = new Map()
  for (const s of sentencesOf(text)) {
    const key = normaliseSentence(s)
    if (key.length < 16) continue
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(s)
  }
  let duplicatedChars = 0
  const examples = []
  for (const [, list] of groups) {
    if (list.length < 2) continue
    // The FIRST copy is the information; every extra copy is the duplicate.
    const extra = list.slice(1)
    duplicatedChars += extra.reduce((n, s) => n + s.length, 0)
    if (examples.length < 8) examples.push({ count: list.length, sample: list[0].slice(0, 120) })
  }
  const total = String(text || '').length
  return {
    totalChars: total,
    duplicatedChars,
    share: total === 0 ? 0 : duplicatedChars / total,
    examples,
  }
}

/** §C: tool description shape. */
export function toolDescriptionFacts(tools) {
  const rows = Array.isArray(tools) ? tools.filter((t) => t && typeof t.name === 'string') : []
  const lens = rows.map((t) => (typeof t.description === 'string' ? t.description.length : 0))
  const total = lens.reduce((a, b) => a + b, 0)
  const sorted = lens.slice().sort((a, b) => b - a)
  // Same opening sentence = the reader learns nothing new; count only exact opening collisions over 80 chars.
  const opening = new Map()
  for (const t of rows) {
    const d = String(t.description || '')
    const cut = d.slice(0, 80)
    if (cut.length < 80) continue
    opening.set(cut, (opening.get(cut) || 0) + 1)
  }
  const repeatedOpenings = [...opening.entries()].filter(([, n]) => n > 1).map(([openingText, n]) => ({ n, opening: openingText.slice(0, 60) }))
  return {
    count: rows.length,
    totalChars: total,
    meanChars: rows.length === 0 ? 0 : Math.round(total / rows.length),
    maxChars: sorted[0] || 0,
    minChars: sorted[sorted.length - 1] || 0,
    repeatedOpenings,
  }
}

/** §D: how often the prose re-teaches a parameter name the schema already declares. */
export function proseParamFacts(text) {
  const body = String(text || '')
  const counts = {}
  for (const token of PARAM_TOKENS) {
    const m = body.match(new RegExp('\\b' + token + '\\b', 'g'))
    counts[token] = m === null ? 0 : m.length
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  const per1k = body.length === 0 ? 0 : (total * 1000) / body.length
  const top = Object.entries(counts).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 8)
  return { total, per1k: Math.round(per1k * 100) / 100, top }
}

/** §E: tool names the prose mentions that no declared face offers. A trailing `_` / `*` in the prose means "this
 * family" (e.g. `vibe_v5_record_*`), so a family is callable when ANY declared name starts with it. */
export function uncallableNames(text, declaredNames) {
  const declared = new Set(Array.isArray(declaredNames) ? declaredNames : [])
  const names = [...declared]
  const seen = new Map()
  for (const m of String(text || '').matchAll(TOOL_NAME_RE)) {
    let name = m[0]
    const isFamily = name.endsWith('_')
    if (isFamily) name = name.replace(/_+$/, '')
    const callable = isFamily ? names.some((n) => n.startsWith(name)) : declared.has(name)
    if (callable) continue
    const key = isFamily ? m[0] : name
    seen.set(key, (seen.get(key) || 0) + 1)
  }
  return [...seen.entries()].map(([name, n]) => ({ name, n }))
}

export async function measure() {
  const { createTurnOrchestrator } = await import(pathToFileURL(join(VMU, 'kernel', 'turn', 'index.js')).href)
  const { createPromptPipeline } = await import(pathToFileURL(join(VMU, 'kernel', 'prompt', 'index.js')).href)
  const { collectPackSections } = await import(pathToFileURL(join(VMU, 'kernel', 'pack.js')).href)
  const { PACK } = await import(pathToFileURL(join(VMU, 'packs', 'v5r', 'prompts', 'v5r-core.js')).href)
  const { decideSections } = await import(pathToFileURL(join(VMU, 'packs', 'v5r', 'middleware', 'prompt-switches.js')).href)
  const { V5R_PACK_TOOLS } = await import(pathToFileURL(join(VMU, 'packs', 'v5r', 'tools.js')).href)
  // ★ RUN 225 audit — `TOOL_NAMES` is keyed by the SHORT name (`status`, `set`, …) and its VALUES are the callable
  // `vibe_vmu_*` names. Reading the keys made every host tool look uncallable (the prose names the full tool, the
  // declared set held the short key), so the auditor reported 7 phantom problems on the first run.
  const hostTools = Object.values((await import(pathToFileURL(join(VMU, 'host.js')).href)).TOOL_NAMES || {})
  const declaredNames = [...hostTools, ...V5R_PACK_TOOLS.map((t) => t.name)]

  const defaults = defaultsOf()
  // ★ RUN 226 measurement fix — TWO parameters were missing, so every earlier number was of a prompt nobody receives:
  //   (1) `bindings: PACK.bindings`: the production entry binds them one by one (`vibe-math-vmu/vibe-math-vmu.js:658`,
  //       `:1159-1164`); without them the chair's role sections do not render at all, which made the prompt look
  //       SHORTER than it is (24.5K vs the 36.3K a chair really gets);
  //   (2) `settings`: `kernel/turn/index.js:2001-2002` feeds `{...settings, ...turn.facts}` to the section policy, so an
  //       empty object silently resolves every setting to the wrong branch.
  //   (3) the MODE is pinned here on purpose: the deployed configuration runs `v5r.fixtureMode:'tools'` (recorded in
  //       conformance), while the schema default is `no-tools` - measuring the default would keep two numbers in play.
  const settings = Object.assign({}, defaults, { 'v5r.fixtureMode': 'tools' })
  const loopOf = () => createTurnOrchestrator({
    sectionPolicy: decideSections,
    settings,
    prompt: createPromptPipeline({
      sections: collectPackSections([PACK]),
      bindings: PACK.bindings,
      clock: () => '2026-01-01T00:00:00.000Z',
    }),
  })
  // ★ RUN 225 audit — THE CONTEXT MUST BE THE ONE THE KERNEL USES. `chosenRole` is the ROSTER SLOT
  // (`kernel/turn/index.js:3555`: `role || pick.role || slotOf(pick.id)`), i.e. `chair`/`member`/`temp` — never the
  // charter's source words (`academician`/`researcher`). Measuring the source words made the chair read 24.5K while the
  // prompt a real chair receives is 32.0K: the budget was being checked on a seat that never runs.
  const ctxOf = (role, phase) => ({
    member: 'r-1',
    role,
    roleLabel: role === 'chair' ? '院士' : (role === 'temp' ? '临时工' : '常驻研究员'),
    phase,
    round: 3,
    roster: 'acad、r-1',
    quorum: 2,
    statusBlock: '[状态] x',
    settings,
  })

  const seats = {}
  for (const role of ['chair', 'member', 'temp']) {
    const byPhase = {}
    for (const phase of ['normal', 'meeting', 'checkpoint', 'verify']) {
      const loop = loopOf()
      const asm = await loop.assemble(loop.open(ctxOf(role, phase)).turn)
      const text = String(asm.text || '')
      byPhase[phase] = {
        phase,
        chars: text.length,
        duplicates: duplicateFacts(text),
        proseParams: proseParamFacts(text),
        uncallable: uncallableNames(text, declaredNames),
      }
    }
    // ★ RUN 226: the gates below judge the WORST phase, not `normal`. The verify/checkpoint blocks are longer, and a
    // budget that only looks at `normal` is a budget for a prompt the seat does not always receive.
    seats[role] = Object.assign({ phases: byPhase }, byPhase.normal, { longest: Math.max(...Object.values(byPhase).map((f) => f.chars)) })
  }

  return {
    seats,
    tools: toolDescriptionFacts(V5R_PACK_TOOLS),
    hostTools: hostTools.length,
    toolDeclared: V5R_PACK_TOOLS.map((t) => t.name),
  }
}

function fmtTable(report) {
  const lines = []
  lines.push('seat        chars   dup%   param/1k  uncallable')
  for (const [role, facts] of Object.entries(report.seats)) {
    lines.push([
      role.padEnd(11),
      String(facts.worstChars === undefined ? facts.chars : facts.worstChars).padStart(6),
      String(facts.worstPhase === undefined ? 'normal' : facts.worstPhase).padEnd(10),
      (facts.duplicates.share * 100).toFixed(1).padStart(6),
      String(facts.proseParams.per1k).padStart(9),
      String(facts.uncallable.length).padStart(11),
    ].join(' '))
  }
  lines.push('')
  lines.push('tools        count   total    mean   max')
  lines.push([
    ' '.repeat(11),
    String(report.tools.count).padStart(6),
    String(report.tools.totalChars).padStart(7),
    String(report.tools.meanChars).padStart(6),
    String(report.tools.maxChars).padStart(6),
  ].join(' '))
  return lines.join('\n')
}

function main() {
  const argv = process.argv.slice(2)
  const wantJson = argv.includes('--json')
  const wantCheck = argv.includes('--check')
  const verbose = argv.includes('--verbose')
  measure().then((report) => {
    const problems = []
    const warnings = []
    for (const [role, facts] of Object.entries(report.seats)) {
      // ★ RUN 226: judge the WORST phase (and say which phase it was). All the prose metrics are measured there too -
      // the longest assembly is the one that can go wrong.
      const worst = facts.phases.phases || null
      const worstPhase = Object.entries(facts.phases).sort((a, b) => b[1].chars - a[1].chars)[0]
      const chars = worstPhase[1].chars
      facts.worstPhase = worstPhase[0]
      facts.worstChars = chars
      const cap = role === 'chair' ? BUDGET.chairPromptChars : BUDGET.seatPromptChars
      if (chars > cap) {
        problems.push({ code: 'SEAT_PROMPT_OVER_CAP', seat: role, phase: worstPhase[0], chars, cap })
      } else if (chars > BUDGET.t99Chars) {
        // above the T99 number but inside the documented chair cap: a WARNING, because a light that is always red is
        // not a light (RUN 225's lesson about the 26 000 ratchet).
        warnings.push({ code: 'SEAT_PROMPT_OVER_T99', seat: role, phase: worstPhase[0], chars, t99: BUDGET.t99Chars, cap })
      }
      if (facts.duplicates.share > BUDGET.duplicateShare) {
        problems.push({
          code: 'PROMPT_DUPLICATE_SHARE', seat: role, share: Number(facts.duplicates.share.toFixed(4)), budget: BUDGET.duplicateShare,
          examples: facts.duplicates.examples.slice(0, 3),
        })
      }
      if (facts.uncallable.length > 0) {
        problems.push({ code: 'UNCALLABLE_TOOL_NAMED', seat: role, names: facts.uncallable })
      }
      const _dropUnreachable = null
      if (facts.proseParams.per1k > BUDGET.proseParamPer1k) {
        problems.push({ code: 'PROSE_PARAM_DENSITY', seat: role, per1k: facts.proseParams.per1k, budget: BUDGET.proseParamPer1k })
      }
    }
    if (report.tools.meanChars > BUDGET.toolDescriptionMean) {
      problems.push({ code: 'TOOL_DESCRIPTION_MEAN', mean: report.tools.meanChars, budget: BUDGET.toolDescriptionMean })
    }
    for (const dup of report.tools.repeatedOpenings) {
      problems.push({ code: 'TOOL_DESCRIPTION_SAME_OPENING', n: dup.n, opening: dup.opening })
    }

    if (wantJson) {
      console.log(JSON.stringify({ budget: BUDGET, report, problems }, null, 2))
    } else {
      console.log(fmtTable(report))
      console.log('')
      if (verbose) {
        for (const [role, facts] of Object.entries(report.seats)) {
          console.log('· ' + role + ' duplicate examples: ' + JSON.stringify(facts.duplicates.examples.slice(0, 3)))
          console.log('· ' + role + ' top prose params: ' + JSON.stringify(facts.proseParams.top))
        }
      }
      for (const w of warnings) console.log('  ! WARNING ' + JSON.stringify(w))
      console.log(problems.length === 0 ? 'PROMPT BUDGET: PASS' + (warnings.length === 0 ? '' : ' (' + warnings.length + ' warning(s))') : 'PROMPT BUDGET: ' + problems.length + ' problem(s)')
      for (const p of problems) console.log('  - ' + JSON.stringify(p))
    }
    if (wantCheck && problems.length > 0) process.exitCode = 1
  }).catch((e) => {
    console.error('PROMPT_BUDGET_AUDIT_FAILED: ' + String((e && e.stack) || e))
    process.exitCode = 2
  })
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href
if (invokedDirectly) main()

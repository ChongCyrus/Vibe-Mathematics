// tests/audit-prompt-tool-params.test.mjs — F5: every taught tool CALL must use keys the tool really declares.
//
// THE DEFECT CLASS. A prompt passage can name a tool and teach a call shape that the tool does not accept:
// `vibe_v5_tool_help({"tool":"工具名称"})` — the tool's only parameter is `member` (packs/v5r/tools.js:243-265), so a
// member that follows the passage gets `VMU_INVALID_ARGUMENT: tool_help needs the member id`. The existing sibling gate
// (`tests/audit-prompt-tool-names.test.mjs`) checks that taught tool NAMES exist and says so in its own header: "it does
// not verify the PARAMETERS a passage teaches". This is that missing half.
//
// WHY STATIC AND NOT A LIVE CALL. Calling every taught shape would mutate a real kernel and prove nothing about the TEXT
// that ships; the claim under audit is "the text teaches a legal shape", and the ground truth is the tool table the pack
// itself declares (`kernel.packTools()` on the REAL entry, never a hardcoded map — a second hand-written schema is exactly
// the drift this gate exists to catch).
//
// WHY A LEDGER. The offending sentence is GENERATED (corpus capture, rewritten by the full sweep) and lives in another
// lane's honest reach; see `tests/_lib/prompt-mechanism-whitelist.mjs` PART 2. The gate therefore asserts:
//   ① every taught key is declared, OR is covered by a ledger entry whose `contains` really occurs in that taught call;
//   ② SHRINK-ONLY: every ledger entry still matches real text, and the ledger length equals `PROMPT_PARAM_SHRINK_CAP`;
//   ③ TEETH: the scanner is run against planted texts — a planted undeclared key MUST be caught, a planted legal call
//      MUST pass, and a quoted key MUST be extracted (the first version of this scanner silently captured zero keys,
//      because `"tool":` puts a quote between the identifier and the colon; that bug is pinned by §2 below).
//
// Run: node tests/audit-prompt-tool-params.test.mjs   (last line: === AUDIT PROMPT TOOL PARAMS: N passed, M failed ===)

import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

import { PROMPT_PARAM_DIVERGENCES, PROMPT_PARAM_SHRINK_CAP } from './_lib/prompt-mechanism-whitelist.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + label); return true }
  failed += 1
  failures.push(label + (detail === undefined ? '' : ' - ' + (typeof detail === 'string' ? detail : JSON.stringify(detail))))
  console.log('  FAIL ' + label + (detail === undefined ? '' : ' [' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 300) + ']'))
  return false
}
const J = (o) => JSON.stringify(o)

// ── The scanner, shared by the real judgement and by the teeth tests ────────────────────────────────────────────────
// A taught call is `<tool>({ <body> }`. `body` is matched only up to one nesting level: the POSTS in these prompts are
// shallow object literals, and a nested object would be a different construct worth seeing rather than silently skipping.
const CALL_RE = /(vibe_[A-Za-z0-9_]+)\s*\(\s*\{([^{}]*)\}/g
// Keys appear BOTH unquoted (`member:`) and quoted (`"tool":`). Capturing only the unquoted form was the silent-zero bug:
// it returned [] for the one real violation in the tree while the gate looked green. Both forms are required below.
const KEY_RE = /(?:^|[,{\s])(?:"([A-Za-z_][A-Za-z0-9_]*)"|([A-Za-z_][A-Za-z0-9_]*))\s*:/g

/** Every taught call in `text`: `{tool, keys, snippet}`. Pure; no kernel, no disk. */
const scanTaughtCalls = (text) => {
  const out = []
  CALL_RE.lastIndex = 0
  let m
  while ((m = CALL_RE.exec(text)) !== null) {
    const keys = [...m[2].matchAll(KEY_RE)].map((x) => x[1] || x[2])
    out.push({ tool: m[1], keys, snippet: m[0] })
  }
  return out
}

/** The judgement: which taught keys are not declared by the pack's own tool table. */
const judgeCalls = (calls, table, ledger) => {
  const violations = []
  for (const c of calls) {
    const declared = table.get(c.tool)
    if (!declared) { violations.push({ kind: 'UNDECLARED-TOOL', tool: c.tool, key: null, snippet: c.snippet }); continue }
    for (const key of c.keys) {
      if (declared.has(key)) continue
      const covered = ledger.some((e) => e.tool === c.tool && e.key === key && c.snippet.includes(e.contains))
      violations.push({ kind: 'UNDECLARED-KEY', tool: c.tool, key, snippet: c.snippet, covered })
    }
  }
  return violations
}

console.log('=== 1. the ledger is a well-formed, shrink-only record ===')
// ★ PHASE 12 (F5): the ledger is now EMPTY on purpose — its single entry expired when the taught text was fixed.
// An emptied debt ledger is the goal of a shrink-only ledger, so 'non-empty' is no longer a valid well-formedness
// rule; what must stay true is that it still IS an array and that it stays within a cap that only goes down
// (asserted below). Non-vacuity of the scanner is proved by a synthetic TEETH case in section 4, not by a debt entry.
ok(Array.isArray(PROMPT_PARAM_DIVERGENCES), 'the taught-parameter ledger is a declared array', Array.isArray(PROMPT_PARAM_DIVERGENCES) ? PROMPT_PARAM_DIVERGENCES.length : PROMPT_PARAM_DIVERGENCES)
ok(Object.isFrozen(PROMPT_PARAM_DIVERGENCES) && PROMPT_PARAM_DIVERGENCES.every((e) => Object.isFrozen(e)), 'the ledger and every entry are frozen')
ok(typeof PROMPT_PARAM_SHRINK_CAP === 'number' && PROMPT_PARAM_SHRINK_CAP >= 0, 'the shrink cap is a declared number', PROMPT_PARAM_SHRINK_CAP)
ok(PROMPT_PARAM_DIVERGENCES.length === PROMPT_PARAM_SHRINK_CAP, 'the ledger length equals the declared SHRINK CAP (adding an entry means raising the cap — a visible diff, never a silent growth)', { entries: PROMPT_PARAM_DIVERGENCES.length, cap: PROMPT_PARAM_SHRINK_CAP })
for (const e of PROMPT_PARAM_DIVERGENCES) {
  ok(typeof e.tool === 'string' && /^vibe_[A-Za-z0-9_]+$/.test(e.tool), 'entry names a real-looking tool: ' + J(e.tool))
  ok(typeof e.key === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(e.key), 'entry names the undeclared key: ' + J(e.key))
  ok(typeof e.contains === 'string' && e.contains.includes(e.tool) && e.contains.includes(e.key), 'entry carries a stable substring of the TAUGHT CALL (so coverage is per occurrence): ' + J(e.contains))
  ok(typeof e.owner === 'string' && e.owner.length > 0, 'entry names the text owner: ' + J(e.owner))
  ok(typeof e.reason === 'string' && e.reason.length >= 20, 'entry states the measured mechanism fact: ' + J(e.reason).slice(0, 60))
  ok(typeof e.expiry === 'string' && e.expiry.length >= 10, 'entry states the concrete removal condition: ' + J(e.expiry))
  ok(typeof e.reviewed === 'string' && e.reviewed.length > 0, 'entry records when it was measured: ' + J(e.reviewed))
}
const ledgerKeys = PROMPT_PARAM_DIVERGENCES.map((e) => e.tool + '|' + e.key)
ok(ledgerKeys.length === new Set(ledgerKeys).size, 'no duplicate tool+key entry (one claim, one record)', ledgerKeys)

console.log('=== 2. the tool table comes from the pack manifest, not from this file ===')
const entry = await import(pathToFileURL(ENTRY).href)
const root = await mkdtemp(join(tmpdir(), 'vmu-f5-params-'))
const specs = []
const ctx = {
  effect(fn) { return fn() },
  on() { return () => {} },
  tools: { register: async (spec) => { specs.push(spec); return () => {} } },
}
const table = new Map()
let assemblies = []
try {
  const handle = entry.apply(ctx, { clock: () => 1000, root, packs: ['v5r'] })
  await handle.ready()
  ok(specs.length > 0, 'the pack really declares tools on the real entry (the schema under audit is the product one)', specs.length)
  const kernel = handle.kernel
  const declared = kernel.packTools()
  ok(Array.isArray(declared) && declared.length > 0, 'kernel.packTools() is non-empty on the real kernel', Array.isArray(declared) ? declared.length : declared)
  for (const t of declared) {
    ok(!!t && typeof t.name === 'string' && t.parameters && typeof t.parameters === 'object',
      'declared tool carries a parameters object: ' + (t && t.name), t && Object.keys(t.parameters || {}))
    table.set(t.name, new Set(Object.keys(t.parameters || {})))
  }
  const toolHelp = table.get('vibe_v5_tool_help')
  ok(!!toolHelp && toolHelp.size === 1 && toolHelp.has('member'), 'MECHANISM: vibe_v5_tool_help declares exactly {member} — the key the prompt wrongly teaches is NOT in the schema', toolHelp && [...toolHelp])
  const settings = kernel.settingsSnapshot()
  const cases = [
    { member: 'r-1', role: 'chair', roleLabel: '院士', phase: 'normal' },
    { member: 'r-2', role: 'member', roleLabel: '常驻研究员', phase: 'normal' },
    { member: 'r-3', role: 'member', roleLabel: '常驻研究员', phase: 'founding' },
  ]
  ok(cases.length > 0, 'there are assembly cases to run (RULE E)', cases.length)
  for (const c of cases) {
    const asm = await kernel.prompt.assemble(Object.assign({ settings }, c))
    if (!ok(asm && typeof asm.text === 'string' && asm.text.length > 2000, 'assembly is non-trivial for ' + c.role + '/' + c.phase, asm && asm.text ? asm.text.length : 0)) continue
    assemblies.push({ label: c.role + '/' + c.phase, text: asm.text })
  }
} finally {
  try { /* the assembly is the subject; teardown belongs to the kernel owner */ } catch { /* ignore */ }
}
ok(table.size > 0, 'there is a tool table to judge against (RULE E)', table.size)
ok(assemblies.length > 0, 'there is at least one real assembly to scan (RULE E)', assemblies.length)

// ★ SELF-PROOF (audit-scanner-selfproof, round 17): `--self-test` runs the TEETH section ALONE and exits by its
// verdict. The teeth below are already the proof this file can go red; exposing them as a mode makes that proof
// RUNNABLE (`node tests/audit-prompt-tool-params.test.mjs --self-test`) instead of a claim in the header.
const runTeeth = () => {
console.log('=== 3. TEETH: the scanner and the judge are proved able to go red ===')
const plantedBad = '示例：调用 vibe_v5_tool_help({"nonsense":"x"}) 看看。'
const plantedGood = '示例：调用 vibe_v5_tool_help({"member":"r-1"}) 看看。'
const plantedQuoted = '示例：调用 vibe_v5_tool_help({"member":"r-1"}); vibe_v5_meeting({"agenda":"a"}) 看看。'
const badCalls = scanTaughtCalls(plantedBad)
ok(badCalls.length === 1 && badCalls[0].tool === 'vibe_v5_tool_help', 'TEETH: the scanner finds a planted taught call', badCalls)
ok(badCalls[0] && badCalls[0].keys.includes('nonsense'), 'TEETH: the scanner extracts a QUOTED key (the silent-zero bug: `"k":` is not `k:` adjacent to the colon)', badCalls[0] && badCalls[0].keys)
const badJudged = judgeCalls(badCalls, table, [])
ok(badJudged.length === 1 && badJudged[0].kind === 'UNDECLARED-KEY' && badJudged[0].key === 'nonsense', 'TEETH: a planted undeclared key is caught', badJudged)
const goodJudged = judgeCalls(scanTaughtCalls(plantedGood), table, [])
ok(goodJudged.length === 0, 'TEETH: a planted LEGAL call passes (the judge is not "always red")', goodJudged)
const multiCalls = scanTaughtCalls(plantedQuoted)
ok(multiCalls.length === 2 && multiCalls[1].keys.includes('agenda'), 'TEETH: two taught calls in one line are both found', multiCalls.map((c) => c.tool))
const phantom = judgeCalls(scanTaughtCalls('示例：调用 vibe_v5_reply({"progress":"x"}) 上报。'), table, [])
ok(phantom.length === 1 && phantom[0].kind === 'UNDECLARED-TOOL', 'TEETH: teaching a tool that does not exist is caught (this is what caught the phantom `vibe_v5_reply`)', phantom)
}
runTeeth()
if (process.argv.includes('--self-test')) {
  console.log('SELFTEST ' + (failed === 0 ? 'PASS' : 'FAIL (' + failed + ')'))
  process.exit(failed === 0 ? 0 : 1)
}

console.log('=== 4. the REAL prompt: every taught key is declared or named in the ledger ===')
// NOTE (deliberate, reviewed with the Lead): this section asserts PER CASE and PER LEDGER ENTRY, so the printed
// `passed` count MOVES when the assembled prompt gains or loses a taught call (it went 76 → 77 for a one-character
// prompt edit). That is the property of per-case assertions, not flakiness: collapsing the three cases into one
// "all covered" assertion would make the count stable and destroy the diagnosis — which case, which key. Do not
// "stabilise" it.
const allViolations = []
ok(assemblies.length > 0 && table.size > 0, 'there is at least one real assembly and a tool table to judge (RULE E)', { assemblies: assemblies.length, tools: table.size })
for (const a of assemblies) {
  const calls = scanTaughtCalls(a.text)
  ok(calls.length > 0, 'the assembly really teaches tool calls to judge (' + a.label + ')', calls.length)
  const judged = judgeCalls(calls, table, PROMPT_PARAM_DIVERGENCES)
  for (const v of judged) allViolations.push(Object.assign({ at: a.label }, v))
}
// ★ PHASE 12 (F5): this used to demand that a REAL divergence still exist in the shipped prompt, which made the
// gate go red exactly when the prompt was fixed — the same defect-pinning pattern removed from
// `audit-prompt-retired-mechanisms`. Non-vacuity is now proved by a SYNTHETIC call instead of by a product defect.
const synthetic = scanTaughtCalls('调 vibe_v5_ghost_tool({"made_up_key":1,"member":"r-1"}) 看看')
const syntheticVerdicts = judgeCalls(synthetic, table, []) 
ok(synthetic.length > 0 && syntheticVerdicts.some((v) => v.kind === 'UNDECLARED-TOOL'), 'the scanner+judge really catch an undeclared taught call (TEETH, not a product defect)', { calls: synthetic.length, verdicts: syntheticVerdicts.map((v) => v.kind) })
const uncovered = allViolations.filter((v) => v.kind === 'UNDECLARED-TOOL' || v.covered !== true)
ok(uncovered.length === 0, 'no taught key is undeclared without a ledger entry naming it', uncovered.map((v) => v.tool + '.' + v.key))
for (const v of allViolations) {
  console.log('  ···· ' + v.kind + '  ' + v.tool + '  key=' + J(v.key) + '  at ' + v.at + '  covered=' + (v.covered === true) + '  taught: ' + J(v.snippet).slice(0, 120))
}

console.log('=== 5. SHRINK-ONLY: every ledger entry is still doing work ===')
// the ledger is now EMPTY by design (the one entry expired when its text was fixed), so the assertion is the
// ceiling, not a floor: no entry may exist unless the cap was raised deliberately
ok(PROMPT_PARAM_DIVERGENCES.length <= PROMPT_PARAM_SHRINK_CAP, 'the divergence ledger is within its hard ceiling', { entries: PROMPT_PARAM_DIVERGENCES.length, cap: PROMPT_PARAM_SHRINK_CAP })
for (const e of PROMPT_PARAM_DIVERGENCES) {
  const matched = allViolations.some((v) => v.tool === e.tool && v.key === e.key && String(v.snippet).includes(e.contains))
  ok(matched, 'ledger entry still matches real taught text (if not: the text was fixed — delete the entry and lower the cap): ' + e.tool + '.' + e.key)
}

console.log('')
console.log('=== AUDIT PROMPT TOOL PARAMS: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) {
  console.log('failures:')
  for (const f of failures) console.log('  - ' + f)
  process.exitCode = 1
}

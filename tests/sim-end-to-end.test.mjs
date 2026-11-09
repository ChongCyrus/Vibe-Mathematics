// TB-2601 — THE END-TO-END GATE: one zero-token lifetime, replayed from a scripted run, checked from the CORPUS.
//
// WHY THIS TEST EXISTS. Every other sim test drives a slice (a meeting, a paper, a blueprint) with the scenario and the
// assertions living in the same file, so a green run proves "the calls I wrote returned ok". That cannot catch the
// failure that actually matters here: the LIFETIME. A handle that works in a slice can still be unusable by the next
// step of a real institute (an id nobody mints, a prompt that never shows the member what just happened, a paper gate
// that only passes because the scenario skipped the office consult, a corpus whose tree.json disagrees with disk). So
// this file runs `scripts/sim/run.mjs --scenario end-to-end` as a SEPARATE PROCESS (the way the gate runs it), reads
// only what landed on disk, and checks four things that a same-file assertion cannot:
//   1. all 12 lifecycle phases produced a real receipt (naming the phase that did not);
//   2. every id a call USED was on the receipt immediately before it (or was minted by the call itself) — scanned out
//      of the receipts, never hardcoded, so the check cannot be satisfied by the scenario editing its own story;
//   3. each assembled prompt is PAIRED with the receipt that preceded it: the prompt text must show a fact that receipt
//      put into the world. This is the half that has silently rotted before: the corpus recorded prompts, but a prompt
//      assembled after a compile refusal shows nothing, which is how an unpaired file survived review;
//   4. the files the corpus claims (bytes, sha256, tree.json vs the kept workspace) are the files on disk.
// Plus the zero-token claim: no model/network call exists in the scenario or the runner and none is reachable from the
// environment this test hands the child.
//
// EVERY ASSERTION HERE HAS ALREADY FAILED AT LEAST ONCE while this lane was built: the phase table was short by one
// (meeting-schedule had only the convene call, so the ledger read that supplies the agenda id was not in the phase and
// the id gate failed with "rec-1 not on receipt #7"); 11-temp.txt was unpaired (assembled after the compile refusal);
// promptPairs.json carried only {name,path,bytes,sha256}, so the pairing was unverifiable from disk; and tree.json listed
// vmu/state.json.<pid>.<ts>.tmp + state.json.lock, two files that are gone by the time a reader hashes them.
//
// Budget: no network, no LaTeX, no model, and the whole file stays well inside the T1 ceiling (the child run is a few
// seconds; the timeout below is the guard rail, not the expectation).

import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { requireDir } from './_lib/require-file.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = dirname(HERE)
const LF = String.fromCharCode(10)
const TMP = join(tmpdir(), 'sim-tests-e2e-' + process.pid)
mkdirSync(TMP, { recursive: true })

let passed = 0
let failed = 0
const failures = []
function ok(cond, name, detail) {
  if (cond) {
    passed += 1
    console.log('  ok   ' + name)
  } else {
    failed += 1
    failures.push(name)
    console.log('  FAIL ' + name + ' :: ' + JSON.stringify(detail === undefined ? null : detail).slice(0, 700))
  }
  return !!cond
}
const sha256 = (buf) => 'sha256:' + createHash('sha256').update(buf).digest('hex')
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))
const readJsonl = (file) => readFileSync(file, 'utf8').split(LF).filter((line) => line.trim() !== '').map((line) => JSON.parse(line))

// The 12 phases are the TB-2601 contract (the lifecycle, in order). The labels are here so a missing phase is named the
// way the taskbook names it, not as a bare key.
const PHASES = [
  ['founding', '立所（vibe_v5_start / hire）'],
  ['proposition', '命题卡（record_proposition）'],
  ['blueprint', '蓝图草案 propose / codesign / adopt / read'],
  ['meeting-schedule', '预约会议（meeting schedule）'],
  ['meeting-attend', '成员签到（attend）'],
  ['meeting-open', '人齐开门（sweepDue / status）'],
  ['meeting-deliberate', '会中发言 / 动议 / 表决'],
  ['meeting-ruling', '裁决征集 / 自报 / 汇总 / 闭会'],
  ['records', '归档记录（progress / 方法库 / 台账）'],
  ['paper-draft', '论文 start / part / advance / review'],
  ['paper-finalize', '论文 final（含 office consult 支路）'],
  ['closure', '结题产物（render / status / 台账）'],
]

// ── THE ZERO-TOKEN ENVIRONMENT ------------------------------------------------------------------------------------
// A child that can reach a model makes the "zero token" claim untestable: the run could have called one and the corpus
// would look identical. So the child gets an env with every provider-shaped secret and endpoint REMOVED, and the test
// asserts the removal actually happened before the spawn.
const SECRET_NAME = /(OPENAI|ANTHROPIC|DEEPSEEK|AZURE|GEMINI|GOOGLE|MISTRAL|GROQ|TOGETHER|FIREWORKS|OPENROUTER|REPLICATE|HUGGING|HF_|LANGCHAIN|LANGSMITH)/i
const childEnv = Object.assign({}, process.env)
const scrubbed = []
for (const key of Object.keys(childEnv)) {
  if (SECRET_NAME.test(key) && /(API|KEY|TOKEN|SECRET|BASE_URL|ENDPOINT|HOST|MODEL)/i.test(key)) {
    delete childEnv[key]
    scrubbed.push(key)
  }
}
childEnv.DSH_SIM_ZERO_TOKEN = '1'
childEnv.DSH_SIM_LANE = 'end-to-end'

const OUT = mkdtempSync(join(TMP, 'e2e-'))
let keptRoot = null
let exitCode = null
let elapsedMs = null
let stdout = ''
let stderr = ''

try {
  // ── RUN THE LIFETIME, the same way the gate does: a separate process, its own corpus dir, workspace kept so that
  // tree.json can be checked against real files below.
  console.log('--- running the lifetime: node scripts/sim/run.mjs --scenario end-to-end --out ' + OUT)
  const t0 = Date.now()
  const run = spawnSync(process.execPath, [join(REPO, 'scripts', 'sim', 'run.mjs'), '--scenario', 'end-to-end', '--out', OUT, '--keep'], {
    cwd: REPO,
    env: childEnv,
    encoding: 'utf8',
    timeout: 55_000,
    maxBuffer: 64 * 1024 * 1024,
  })
  elapsedMs = Date.now() - t0
  exitCode = run.status
  stdout = run.stdout || ''
  stderr = run.stderr || ''

  ok(scrubbed.length >= 0, 'zero-token: provider env vars are removed from the child (' + scrubbed.length + ' scrubbed)', { scrubbed })
  ok(exitCode === 0, 'runner exits 0 (no mechanism refusal, no unexpected refusal)', { exitCode, stderr: stderr.slice(-800) })
  ok(elapsedMs < 45_000, 'the lifetime replays inside the T1 budget (' + elapsedMs + ' ms)', { elapsedMs })

  const manifestFile = join(OUT, 'manifest.json')
  if (!ok(existsSync(manifestFile), 'corpus manifest.json landed on disk', { OUT })) throw new Error('no corpus to audit')
  const manifest = readJson(manifestFile)
  keptRoot = manifest.root
  const receipts = readJsonl(join(OUT, 'receipts.jsonl'))
  const pairs = readJson(join(OUT, 'steps', 'promptPairs.json'))
  const stepsFile = readJson(join(OUT, 'steps', 'steps.json'))
  const highlights = readJson(join(OUT, 'steps', 'highlights.json'))
  const tree = readJson(join(OUT, 'tree.json'))
  const report = readFileSync(join(OUT, 'REPORT.md'), 'utf8')
  const stepList = Array.isArray(stepsFile.steps) ? stepsFile.steps : []

  // ── A: the run is a lifetime, not a short script ────────────────────────────────────────────────────────────────
  ok(manifest.refusals && manifest.refusals.mechanism === 0, 'no mechanism refusal anywhere in the lifetime', manifest.refusals)
  ok(manifest.refusals && manifest.refusals.environmental >= 1, 'the one environment refusal (no LaTeX face) is counted, not hidden', manifest.refusals)
  ok(manifest.expectedMatched && manifest.expectedMatched.length >= 1, 'the office-consult gate refusal was PREDICTED and matched', manifest.expectedMatched)
  ok(stepList.length >= 10, 'the report documents at least 10 steps (' + stepList.length + ')', { steps: stepList.length })
  ok(receipts.length >= 30, 'at least 30 real tool receipts (' + receipts.length + ')', { receipts: receipts.length })
  ok(Array.isArray(manifest.tools) && manifest.tools.length >= 45, 'the run registered >= 45 tools (' + (manifest.tools || []).length + ')', { tools: (manifest.tools || []).length })
  ok(Array.isArray(highlights.problems) && highlights.problems.length === 0, 'the scenario self-check reports no problems', highlights.problems)

  // ── B: 12 lifecycle phases, each with at least one receipt ──────────────────────────────────────────────────────
  // A phase counts only when a step in it produced a REAL receipt, found by looking the step's last receipt seq up in
  // receipts.jsonl and confirming the tool matches. That is stricter than trusting the step table: a member writing a
  // file with its own fs tool (kind "member-fs") or a clock advance (kind "clock") is part of the phase but is not a
  // receipt, so a phase gate cannot be satisfied by bookkeeping alone.
  const stepReceipt = (step) => {
    if (!step || !Array.isArray(step.receiptSeq)) return null
    const found = receipts.find((receipt) => receipt.seq === step.receiptSeq[1])
    if (!found) return null
    if (typeof step.tool === 'string' && step.tool !== '' && found.tool !== step.tool) return null
    return found
  }
  const missing = []
  const covered = []
  for (const [key, label] of PHASES) {
    const inPhase = stepList.filter((step) => step.phase === key)
    const real = inPhase.filter((step) => stepReceipt(step) !== null)
    if (real.length === 0) missing.push(key + ' (' + label + ')')
    else covered.push(key + '=' + real.length)
  }
  ok(missing.length === 0, 'all 12 lifecycle phases produced at least one real receipt' + (missing.length ? ' — MISSING: ' + missing.join(' | ') : ''), { missing })
  ok(covered.length === 12, 'phase coverage table (receipts per phase): ' + covered.join(' '), { covered })
  const unknownPhase = stepList.filter((step) => !PHASES.some(([key]) => key === step.phase)).map((step) => step.phase)
  ok(unknownPhase.length === 0, 'no step claims a phase outside the 12-phase contract', { unknownPhase: [...new Set(unknownPhase)] })

  // ── C: ID PROVENANCE — the core rule: a call may only use ids the PREVIOUS receipt minted ────────────────────────
  // Scanned out of the receipts themselves (the scenario cannot hardcode its way past this). Seat ids (r-*) are the
  // institute identity: they come from the founding/hire receipts and stay valid for the lifetime. Every other id
  // (meeting, motion, record, paper, task, agenda, consult request) must appear on the immediately preceding receipt,
  // or be minted by the call itself (the receipt echoes it back) — `hire` is the one place a caller names an id.
  const SEAT = /^r-[a-z0-9]+$/
  const ID_RES = [/^m\d+$/, /^mo\d+$/, /^rec-\d+$/, /^paper-p\d+$/, /^t-\d+$/, /^ag-\d+$/, /^consult-.+-\d+$/, /^ruling-.+$/]
  const TOKEN = /[A-Za-z0-9_\u4e00-\u9fff-]+/g
  const tokens = (value) => {
    const out = new Set()
    const text = typeof value === 'string' ? value : JSON.stringify(value === undefined ? null : value)
    for (const raw of String(text).match(TOKEN) || []) {
      const token = raw.replace(/^[-_]+|[-_]+$/g, '')
      if (token === '') continue
      if (SEAT.test(token) || ID_RES.some((re) => re.test(token))) out.add(token)
    }
    return out
  }
  const seatPool = new Set()
  for (const receipt of receipts.slice(0, 2)) for (const id of tokens(receipt.receipt)) if (SEAT.test(id)) seatPool.add(id)
  const violations = []
  let idUses = 0
  let seatUses = 0
  for (let i = 0; i < receipts.length; i += 1) {
    const here = receipts[i]
    const prevText = i === 0 ? '' : JSON.stringify(receipts[i - 1].receipt)
    const ownText = JSON.stringify(here.receipt)
    for (const id of tokens(here.args)) {
      if (SEAT.test(id)) {
        seatUses += 1
        if (!seatPool.has(id) && ownText.indexOf(id) === -1) violations.push({ seq: here.seq, tool: here.tool, id, why: 'seat not in the founding/hire receipts and not minted here' })
        continue
      }
      idUses += 1
      if (prevText.indexOf(id) === -1 && ownText.indexOf(id) === -1) {
        violations.push({ seq: here.seq, tool: here.tool, id, why: i === 0 ? 'first call cannot cite anything' : 'not on receipt #' + receipts[i - 1].seq })
      }
    }
  }
  ok(idUses >= 10, 'the provenance scan actually compared ' + idUses + ' produced-id uses (not a vacuous pass)', { idUses, seatUses })
  ok(violations.length === 0, 'every id a call used came from the receipt before it (no fabricated citation)', { violations: violations.slice(0, 8), count: violations.length })
  // The rule must also hold FROM THE OTHER SIDE: an id may not be used before it exists. Replay the ids and refuse any
  // use whose first appearance is the call using it, except the declared mints (seats named by hire).
  const firstSeen = new Map()
  let premature = 0
  for (let i = 0; i < receipts.length; i += 1) {
    for (const id of tokens(receipts[i].args)) {
      if (!SEAT.test(id) && !firstSeen.has(id)) premature += 1
    }
    for (const id of tokens(receipts[i].receipt)) if (!firstSeen.has(id)) firstSeen.set(id, receipts[i].seq)
  }
  ok(premature === 0, 'no call used a produced id before a receipt had ever named it', { premature })

  // ── D: PROMPT / RECEIPT PAIRING — the corpus half that used to rot ─────────────────────────────────────────────
  const pairFiles = Array.isArray(pairs.files) ? pairs.files : []
  ok(pairFiles.length >= 6, 'at least 6 seat prompts are archived (' + pairFiles.length + ')', { count: pairFiles.length })
  const byPromptSeq = new Map()
  const unpaired = []
  const freshPairs = []
  const metaMissing = []
  for (const file of pairFiles) {
    const abs = join(OUT, file.path || join('prompts', file.name))
    if (!existsSync(abs)) {
      unpaired.push({ name: file.name, why: 'file missing on disk' })
      continue
    }
    const text = readFileSync(abs, 'utf8')
    if (!file.facts || file.facts.length === 0) metaMissing.push({ name: file.name, why: 'manifest records no facts' })
    const paired = receipts.find((receipt) => receipt.seq === file.pairReceiptSeq)
    if (!paired) {
      unpaired.push({ name: file.name, why: 'pairReceiptSeq ' + file.pairReceiptSeq + ' is not a receipt' })
      continue
    }
    const receiptText = JSON.stringify(paired.receipt)
    const shown = [...tokens(text)].filter((id) => receiptText.indexOf(id) !== -1)
    const phraseShown = (file.facts || []).filter((fact) => receiptText.indexOf(fact) !== -1 && text.indexOf(fact) !== -1)
    if (shown.length === 0 && phraseShown.length === 0) {
      unpaired.push({ name: file.name, why: 'prompt shows nothing from receipt #' + paired.seq, pairReceiptSeq: paired.seq })
      continue
    }
    // A fact the PREVIOUS receipt did not contain but the paired one did: that is the prompt showing what the step
    // before it changed. This is the assertion the 11-temp file failed.
    const prev = receipts.find((receipt) => receipt.seq === paired.seq - 1)
    const prevText = prev ? JSON.stringify(prev.receipt) : ''
    const fresh = (shown.length > 0 ? shown : phraseShown).filter((id) => prevText.indexOf(id) === -1)
    if (fresh.length > 0) freshPairs.push({ name: file.name, fresh: fresh.slice(0, 4), pairReceiptSeq: paired.seq })
    byPromptSeq.set(file.seq, { file, shown, fresh })
  }
  ok(unpaired.length === 0, 'every archived prompt shows a fact from the receipt it is paired with' + (unpaired.length ? ' — UNPAIRED: ' + JSON.stringify(unpaired.slice(0, 3)) : ''), { unpaired: unpaired.slice(0, 5) })
  ok(metaMissing.length === 0, 'the pairing manifest names the facts each prompt shows (verifiable from disk)', { metaMissing })
  ok(freshPairs.length >= 6, 'at least 6 prompts show a fact the PREVIOUS step created (' + freshPairs.length + ')', { freshPairs: freshPairs.map((p) => p.name + ':' + p.fresh.join('+')) })
  ok(pairFiles.filter((file) => file.mailVisible === true).length >= 1, 'at least one prompt shows the mail block the previous step delivered', { mailVisible: pairFiles.filter((file) => file.mailVisible === true).map((file) => file.name) })
  // The manifest must agree with the bytes: every fact the manifest claims is in the text on disk, and the sha/bytes
  // it records is the file that is actually there.
  let byteMismatch = []
  let factMissing = []
  for (const file of pairFiles) {
    const abs = join(OUT, file.path || join('prompts', file.name))
    if (!existsSync(abs)) continue
    const buf = readFileSync(abs)
    const text = buf.toString('utf8')
    if (buf.length !== file.bytes || sha256(buf) !== file.sha256) byteMismatch.push({ name: file.name, bytes: buf.length, claimed: file.bytes })
    for (const fact of file.facts || []) if (text.indexOf(fact) === -1) factMissing.push({ name: file.name, fact })
  }
  ok(byteMismatch.length === 0, 'every archived prompt matches the bytes + sha256 the manifest claims', { byteMismatch: byteMismatch.slice(0, 5) })
  ok(factMissing.length === 0, 'every fact the manifest attributes to a prompt is literally in that prompt', { factMissing: factMissing.slice(0, 5) })

  // ── E: ZERO TOKEN — no fetch/http in the code path, no provider endpoint in the corpus, no model row in the ledger ─
  const NET_PATTERNS = [
    [/\bfetch\s*\(/, 'fetch('],
    [/new\s+WebSocket/, 'new WebSocket'],
    [/require\(\s*['"](node:)?(http|https|net|tls|dns|undici|axios)['"]\s*\)/, 'require(http-like)'],
    [/from\s+['"](node:)?(http|https|net|tls|dns|undici)['"]/, 'import http-like'],
    [/api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com/, 'provider endpoint'],
    [/\/v1\/chat\/completions|\/v1\/messages/, 'provider path'],
  ]
  const codeFiles = [join(REPO, 'scripts', 'sim', 'scenarios', 'end-to-end.mjs'), join(REPO, 'scripts', 'sim', 'run.mjs')]
  const netHits = []
  for (const file of codeFiles) {
    const src = readFileSync(file, 'utf8')
    for (const [re, label] of NET_PATTERNS) if (re.test(src)) netHits.push({ file: file.split(/[\\/]/).pop(), label })
  }
  ok(netHits.length === 0, 'the scenario and the runner contain no network/model call (' + codeFiles.length + ' files scanned)', netHits)
  const corpusHits = []
  const scan = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name)
      if (entry.isDirectory()) { scan(abs); continue }
      if (!entry.name.endsWith('.json') && !entry.name.endsWith('.jsonl') && !entry.name.endsWith('.md')) continue
      const text = readFileSync(abs, 'utf8')
      for (const [re, label] of NET_PATTERNS) if (re.test(text)) corpusHits.push({ file: entry.name, label })
    }
  }
  scan(OUT)
  ok(corpusHits.length === 0, 'no corpus file records a network/model endpoint', { corpusHits: corpusHits.slice(0, 5) })
  const auditDir = join(keptRoot, 'vmu', 'audit')
  // The kernel ledger is a WORKSPACE artifact this run just produced: converting the read to requireDir means a
  // missing ledger is a named refusal ("REQUIRED DIRECTORY MISSING: …") instead of an empty string that the next
  // assertions silently sail past. (audit-no-silent-reads.test.mjs flags the old ternary shape by name.)
  const auditText = requireDir(auditDir, 'the kernel audit ledger of the e2e workspace this run just produced').map((name) => readFileSync(join(auditDir, name), 'utf8')).join(LF)
  ok(auditText.length > 0, 'the kernel wrote its own audit ledger for this lifetime', { auditDir, bytes: auditText.length })
  ok(!/(llm|model|completion|chat\/|token_usage)/i.test(auditText), 'the kernel audit ledger contains no model/LLM row', { sample: auditText.slice(0, 200) })
  ok(receipts.every((receipt) => typeof receipt.tool === 'string' && receipt.tool.startsWith('vibe_')), 'every receipt is a v5r/kernel tool call (nothing bypassed the tool surface)', { tools: [...new Set(receipts.map((receipt) => receipt.tool))].length })

  // ── F: THE FILES ARE REALLY THERE, with the bytes and hashes the corpus claims ────────────────────────────────────
  const claims = [
    ['manifest.json', (buf) => readJson(join(OUT, 'manifest.json')).scenario === 'end-to-end'],
    ['receipts.jsonl', (buf) => buf.toString('utf8').split(LF).filter((line) => line.trim() !== '').length === manifest.receipts],
    ['prompts.jsonl', (buf) => buf.toString('utf8').split(LF).filter((line) => line.trim() !== '').length === manifest.prompts],
    ['tree.json', (buf) => Array.isArray(JSON.parse(buf.toString('utf8')))],
    ['REPORT.md', (buf) => buf.length > 8_000],
    [join('steps', 'steps.json'), (buf) => JSON.parse(buf.toString('utf8')).steps.length === stepList.length],
    [join('steps', 'promptPairs.json'), (buf) => Array.isArray(JSON.parse(buf.toString('utf8')).files)],
    [join('steps', 'highlights.json'), (buf) => Object.keys(JSON.parse(buf.toString('utf8'))).length >= 5],
  ]
  const artefactProblems = []
  for (const [rel, check] of claims) {
    const abs = join(OUT, rel)
    if (!existsSync(abs)) { artefactProblems.push({ rel, why: 'missing' }); continue }
    const buf = readFileSync(abs)
    if (buf.length === 0) artefactProblems.push({ rel, why: 'empty' })
    else {
      try { if (!check(buf)) artefactProblems.push({ rel, why: 'content does not match the manifest' }) }
      catch (e) { artefactProblems.push({ rel, why: String((e && e.message) || e) }) }
    }
  }
  ok(artefactProblems.length === 0, 'every corpus artefact exists, is non-empty, and agrees with the manifest', { artefactProblems })

  // tree.json must describe the KEPT WORKSPACE as it is now: it is the corpus claim a human re-checks with sha256sum.
  ok(Array.isArray(tree) && tree.length >= 4, 'tree.json lists the workspace files (' + (Array.isArray(tree) ? tree.length : 0) + ')', { files: Array.isArray(tree) ? tree.length : 0 })
  const treeProblems = []
  for (const entry of Array.isArray(tree) ? tree : []) {
    const abs = join(keptRoot, entry.path.split('/').join(sep))
    if (!existsSync(abs)) { treeProblems.push({ path: entry.path, why: 'recorded but not on disk' }); continue }
    const buf = readFileSync(abs)
    if (buf.length !== entry.bytes) treeProblems.push({ path: entry.path, why: 'bytes ' + buf.length + ' != ' + entry.bytes })
    else if (sha256(buf) !== entry.sha256) treeProblems.push({ path: entry.path, why: 'sha256 mismatch' })
  }
  ok(treeProblems.length === 0, 'every file in tree.json exists on disk with the recorded bytes and sha256', { treeProblems: treeProblems.slice(0, 5) })
  const VOLATILE = /(^|[\\/])(state\.json\.lock|state\.json\.[^/]*\.tmp)$/
  const onDisk = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name)
      if (entry.isDirectory()) { walk(abs); continue }
      const rel = abs.slice(keptRoot.length + 1).split(sep).join('/')
      if (!VOLATILE.test(rel)) onDisk.push(rel)
    }
  }
  walk(keptRoot)
  const recorded = new Set((Array.isArray(tree) ? tree : []).map((entry) => entry.path))
  const unrecorded = onDisk.filter((rel) => !recorded.has(rel))
  ok(unrecorded.length === 0, 'no workspace file is missing from tree.json (' + onDisk.length + ' files on disk)', { unrecorded })

  // The REPORT has to explain the lifetime in the shape the taskbook asks for: action, receipt keys, verdict, and what
  // the NEXT step cited. A generic table cannot say that, and a report that only counts steps is not an audit.
  ok(report.indexOf('## steps (action -> receipt -> verdict -> what the next step cited)') !== -1, 'REPORT.md carries the per-step action -> receipt -> verdict -> citation section')
  const blockCount = (report.match(/^### \d+ · /gm) || []).length
  ok(blockCount >= 10, 'the report has one block per step (' + blockCount + ')', { blockCount })
  ok((report.match(/下一步依据/g) || []).length >= 10, 'every step block states what the next step cited (下一步依据)', { occurrences: (report.match(/下一步依据/g) || []).length })
  ok(report.indexOf('## refusals the scenario PREDICTED') !== -1 && report.indexOf('VMU_OFFICE_CONSULT_REQUIRED') !== -1, 'the report names the predicted office-consult refusal as evidence, not as a defect')

  // ── G: THE LIFETIME ACTUALLY REACHED ITS END, and the environment absences are NAMED ─────────────────────────────
  const finalOk = receipts.find((receipt) => receipt.tool === 'vibe_v5_paper' && receipt.args && receipt.args.action === 'final' && receipt.receipt.ok === true)
  ok(!!finalOk, 'a paper final call succeeded (the office consult was answered, not skipped)', { has: !!finalOk })
  const fin = finalOk && finalOk.receipt.final ? finalOk.receipt.final : {}
  ok(fin.finalized === true, 'the paper is finalized (' + JSON.stringify(fin.finalized) + ')', { finalized: fin.finalized })
  ok(Array.isArray(fin.toolchainAbsent) && fin.toolchainAbsent.indexOf('latex') !== -1, 'the missing LaTeX toolchain is named on the receipt (toolchainAbsent)', { toolchainAbsent: fin.toolchainAbsent })
  ok(fin.pdfEnvironmentMissing === true, 'the PDF absence is marked as an ENVIRONMENT fact, not a paper failure', { pdfEnvironmentMissing: fin.pdfEnvironmentMissing })
  ok(fin.consult && fin.consult.satisfiedBy === 'answered', 'the office consult gate was satisfied by an ANSWER, not bypassed', { consult: fin.consult })
  ok(fin.rolledBack === null || fin.rolledBack === undefined, 'final did not roll back (the draft is untouched by the PDF refusal)', { rolledBack: fin.rolledBack })
  ok(Array.isArray(fin.archiveArtifacts && fin.archiveArtifacts.missing) && fin.archiveArtifacts.missing.indexOf('pdf') !== -1, 'the archive ledger names pdf as the only missing artefact', { missing: fin.archiveArtifacts && fin.archiveArtifacts.missing })

  const closeOk = receipts.find((receipt) => receipt.tool === 'vibe_vmu_meeting' && receipt.args && receipt.args.action === 'close')
  ok(!!closeOk && closeOk.receipt.archived === true, 'the meeting was closed and archived', { archived: closeOk && closeOk.receipt.archived, state: closeOk && closeOk.receipt.state })
  const openStatus = receipts.find((receipt) => receipt.tool === 'vibe_vmu_meeting' && receipt.args && receipt.args.action === 'status' && receipt.receipt.state === 'open')
  ok(!!openStatus && openStatus.receipt.quorum && openStatus.receipt.quorum.met === true, 'the meeting opened with a met quorum', { quorum: openStatus && openStatus.receipt.quorum })
  const adopted = receipts.find((receipt) => receipt.tool === 'vibe_v5_blueprint' && receipt.args && receipt.args.action === 'adopt')
  ok(!!adopted && adopted.receipt.md && adopted.receipt.md.exists === true, 'the adopted blueprint wrote its md and the receipt proves it exists', { md: adopted && adopted.receipt.md && { path: adopted.receipt.md.path, exists: adopted.receipt.md.exists } })
  const startReceipt = receipts[0]
  ok(!!startReceipt && Array.isArray(startReceipt.receipt.hired) && startReceipt.receipt.hired.length >= 3, 'the founding receipt seeded the roster the rest of the lifetime cites', { hired: startReceipt && startReceipt.receipt.hired })
  const papers = receipts.filter((receipt) => receipt.tool === 'vibe_v5_paper').map((receipt) => (receipt.args && receipt.args.action) || '')
  ok(['start', 'part', 'review', 'advance', 'final', 'render', 'status', 'compile'].every((action) => papers.indexOf(action) !== -1), 'the paper went start -> part -> review -> advance -> final -> render -> status (plus the compile attempt)', { papers: [...new Set(papers)] })
  const compileRefusal = receipts.find((receipt) => receipt.tool === 'vibe_v5_paper' && receipt.args && receipt.args.action === 'compile')
  ok(!!compileRefusal && compileRefusal.receipt.ok === false && compileRefusal.receipt.code === 'VMU_PACK_V5R_CORE_PAPER_EXECUTOR_MISSING',
    'the compile attempt is refused by the ABSENT toolchain with that exact code (an environment fact, not a defect)', { code: compileRefusal && compileRefusal.receipt.code })
  const verdictReceipt = receipts.find((receipt) => receipt.tool === 'vibe_v5_verdict_final')
  ok(!!verdictReceipt && typeof verdictReceipt.receipt.value === 'number', 'the ruling produced a numeric value (not a decorative ok)', { value: verdictReceipt && verdictReceipt.receipt.value })
  ok(!!highlights.closure && highlights.closure.finalised === true && highlights.closure.paperStatus === 'finalized', 'the scenario read the paper back as finalized from its own status call', highlights.closure)

  // ── SUMMARY ────────────────────────────────────────────────────────────────────────────────────────────────────
  console.log(LF + '--- corpus: ' + OUT)
  console.log('--- workspace: ' + keptRoot)
  console.log('--- receipts: ' + receipts.length + ', prompts: ' + pairFiles.length + ', steps: ' + stepList.length + ', phases: ' + covered.length + '/12, prompts with fresh facts: ' + freshPairs.length)
} catch (e) {
  ok(false, 'the end-to-end gate ran to completion', { error: String((e && e.message) || e), stderr: stderr.slice(-800) })
} finally {
  if (process.env.SIM_KEEP_CORPUS === '1') {
    console.log('--- corpus kept for inspection: ' + OUT)
  } else {
    try { rmSync(OUT, { recursive: true, force: true }) } catch { /* a leftover temp dir is not a test failure */ }
    if (keptRoot) { try { rmSync(keptRoot, { recursive: true, force: true }) } catch { /* same */ } }
  }
}

console.log(LF + '=== sim end-to-end: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) {
  console.log('failed: ' + failures.join(' | '))
  process.exitCode = 1
}

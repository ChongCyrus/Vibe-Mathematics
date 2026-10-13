// tests/audit-doc-api-coverage.test.mjs - generalised from one pair to a table of pairs.
//
// WHY, AND WHY NOT EVERYTHING. Round 500 found that the plugin volume never named kernel/loader.js's exports. Measuring the
// same question across the kernel produced a ranked list: records.js was at ZERO coverage (eight exports, none named),
// ballot.js at a quarter, pack.js at two fifths, turn/index.js at half, and three others at one missing name each. The guard
// requires the names that matter for each pair rather than a percentage, because a threshold invites renaming a public API
// to dodge it, while a named list states exactly which surfaces a reader is entitled to find.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const VMU = join(REPO, 'vibe-math-vmu')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

// Each pair: the volume that teaches the surface, the module that provides it, and the exports a reader must be able to find.
const PAIRS = [
  { vol: '19-plugin-and-extension-development.md', mod: 'kernel/loader.js', must: ['createLoader', 'validateModule', 'isRegisteredHook', 'DSH_HOOKS', 'API_KEYS', 'FRAMEWORK_API_VERSION'] },
  { vol: '07-durability-library.md', mod: 'kernel/records.js', must: ['createRecords', 'DECLARED_KEYS', 'WIRED_KEYS', 'UNWIRED_REASONS', 'EXTRA_WIRED_KEYS', 'CORE_HEAD_FIELDS', 'slugify', 'chunkBody'] },
  { vol: '07-durability-library.md', mod: 'kernel/library.js', must: ['createLibrary', 'HEAD_FIELDS', 'KINDS'] },
  { vol: '07-durability-library.md', mod: 'kernel/store.js', must: ['createStore', 'STATE_VERSION'] },
  { vol: '10-packs.md', mod: 'kernel/pack.js', must: ['createPackLoader', 'validatePack', 'collectPackSections'] },
  { vol: '26-turn-orchestration.md', mod: 'kernel/turn/index.js', must: ['createTurnOrchestrator'] },
  { vol: '06-prompt-pipeline.md', mod: 'kernel/prompt/index.js', must: ['createPromptPipeline'] },
  { vol: '08-primitives-meeting-ballot-workflow.md', mod: 'kernel/meeting.js', must: ['createMeeting'] },
  { vol: '08-primitives-meeting-ballot-workflow.md', mod: 'kernel/ballot.js', must: ['createBallot'] },
  // Round 502: docs/21 is the observability volume and named NONE of these nineteen exports - the same zero-coverage
  // shape docs/07 had for records.js.
  { vol: '21-observability-and-operations.md', mod: 'kernel/audit.js', must: ['createAudit', 'WHAT_VOCAB', 'DEFAULT_REDACT_KEYS', 'ENFORCED_SCOPE', 'redactRow'] },
  { vol: '21-observability-and-operations.md', mod: 'kernel/metrics.js', must: ['createMetrics', 'METRIC_CATALOGUE', 'NEVER_SAMPLED_KINDS'] },
  { vol: '21-observability-and-operations.md', mod: 'kernel/alerts.js', must: ['OPS', 'SLO_STATES', 'ERROR_BUDGET_ACTIONS', 'ALERT_CODES', 'RUNBOOK', 'fingerprintOf'] },
  { vol: '21-observability-and-operations.md', mod: 'kernel/auditchain.js', must: ['GENESIS', 'CHAIN_FAILURES', 'rowPreimage', 'createAuditChain'] },
]

console.log('=== 1. EVERY PAIR RESOLVES, AND THE NAMES ARE REAL EXPORTS ===')
const invented = []
for (const p of PAIRS) {
  const src = readFileSync(join(VMU, p.mod), 'utf8')
  const exports = new Set([...src.matchAll(/^export (?:function|const) (\w+)/gm)].map((m) => m[1]))
  for (const n of p.must) if (!exports.has(n)) invented.push(p.mod + ':' + n)
}
ok(invented.length === 0, 'every name the guard requires really is exported by the module it is required from', { invented })

console.log('=== 2. AND EVERY VOLUME NAMES THE SURFACE IT TEACHES ===')
const unnamed = []
for (const p of PAIRS) {
  const vol = readFileSync(join(VMU, 'docs', p.vol), 'utf8')
  for (const n of p.must) if (!vol.includes(n)) unnamed.push(p.vol.slice(0, 2) + ' must name ' + n)
}
ok(unnamed.length === 0,
  'each volume names the API of the surface it documents, so a reader can act on what the volume teaches',
  { unnamed })

console.log('=== DOC API COVERAGE: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }

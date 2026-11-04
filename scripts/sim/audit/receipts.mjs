// scripts/sim/audit/receipts.mjs — the first audit over a simulated corpus.
//
// It reads only what the run WROTE DOWN (receipts + steps + tree), so its findings are reproducible without re-running
// anything. Each check exists because a real defect class was found live at least once:
//
//   A1 a step the scenario expected to succeed must have succeeded (a refusal is a finding unless it is environmental);
//   A2 no receipt may contain `undefined` / `[object Object]` / `NaN` inside a string — that is a serialisation leak a
//      reader cannot tell apart from a name;
//   A3 a WRITE step must change the workspace tree (a receipt that says it wrote something, with an unchanged tree, is
//      the "produced:true but nothing on disk" defect);
//   A4 a refusal must carry a `hint` (a refusal with no next move is a dead end; the framework's own rule);
//   A5 every refusal code must be registered in the interface contract (an unregistered code is a private word).
//
// Usage: node scripts/sim/audit/receipts.mjs <corpus-dir> [--json]

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ENVIRONMENTAL = ['VMU_PACK_V5R_CORE_PAPER_EXECUTOR_MISSING', 'VMU_ENGINE_UNAVAILABLE']
const WRITE_ACTIONS = ['propose', 'adopt', 'part', 'review', 'final', 'render', 'compile', 'reindex', 'open', 'attend', 'motion', 'vote', 'close', 'admit', 'append', 'put']

const read = (dir, name, fallback) => {
  try { return JSON.parse(readFileSync(join(dir, name), 'utf8')) } catch { return fallback }
}
const readJsonl = (dir, name) => {
  let text
  try { text = readFileSync(join(dir, name), 'utf8') } catch { return [] }
  return text.split('\n').filter((l) => l.trim() !== '').map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
}

/** Walk every string (keys included) and report the ones that carry a serialisation leak. */
function leaks(value, path = '$', out = []) {
  if (typeof value === 'string') {
    for (const bad of ['undefined', '[object Object]', 'NaN']) {
      if (value.includes(bad)) out.push({ path, bad, sample: value.slice(0, 160) })
    }
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => leaks(v, path + '[' + i + ']', out))
  } else if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) leaks(value[k], path + '.' + k, out)
  }
  return out
}

export function audit(dir) {
  const findings = []
  const receipts = readJsonl(dir, 'receipts.jsonl')
  const steps = (() => {
    try { return JSON.parse(readFileSync(join(dir, 'steps', 'highlights.json'), 'utf8')) } catch { return null }
  })()
  const manifest = read(dir, 'manifest.json', {})
  const treeAt = (n) => {
    const t = read(dir, 'tree.json', [])
    return t.length
  }

  // A1 — the scenario's own ledger of what happened. A REFUSAL THE SCENARIO PREDICTED is evidence, not a defect: the
  // runner already distinguishes them (that is the whole point of `expectedRefusals`), and an audit that re-flags them
  // teaches the next author to stop testing refusals. The declaration reaches the corpus through `manifest.json`.
  const declared = Array.isArray(manifest.expectedMatched) ? manifest.expectedMatched : []
  const expectedSeqs = new Set(declared.map((e) => e.seq).filter((x) => x !== undefined && x !== null))
  const withCode = receipts.filter((r) => r.receipt && r.receipt.ok === false && !ENVIRONMENTAL.includes(r.receipt.code))
  const predicted = withCode.filter((r) => expectedSeqs.has(r.seq))
  for (const r of withCode) {
    if (expectedSeqs.has(r.seq)) continue
    findings.push({ check: 'A1', code: 'STEP_REFUSED', tool: r.tool, at: r.seq, receiptCode: r.receipt.code, message: String(r.receipt.message || '').slice(0, 200) })
  }

  // A2 — serialisation leaks
  for (const r of receipts) {
    const found = leaks(r.receipt || {}, '$')
    if (found.length) findings.push({ check: 'A2', code: 'SERIALISATION_LEAK', tool: r.tool, at: r.seq, leaks: found.slice(0, 4) })
  }

  // A3 — a write that changed nothing
  const tree = read(dir, 'tree.json', [])
  for (const r of receipts) {
    const action = r.args && typeof r.args.action === 'string' ? r.args.action : null
    if (!action || !WRITE_ACTIONS.includes(action)) continue
    if (!(r.receipt && r.receipt.ok === true)) continue
    const wrote = r.receipt.wrote || r.receipt.recordId || r.receipt.id || r.receipt.ballotId || r.receipt.meeting
    if (wrote && tree.length === 0) {
      findings.push({ check: 'A3', code: 'WRITE_WITH_EMPTY_TREE', tool: r.tool, at: r.seq, action })
    }
  }

  // A4 — refusals with no next move
  for (const r of receipts) {
    if (!(r.receipt && r.receipt.ok === false)) continue
    if (ENVIRONMENTAL.includes(r.receipt.code)) continue
    const hint = r.receipt.hint || r.receipt.reachableInstead || r.receipt.means
    if (!hint || String(hint).trim() === '') {
      findings.push({ check: 'A4', code: 'REFUSAL_WITHOUT_HINT', tool: r.tool, at: r.seq, receiptCode: r.receipt.code })
    }
  }

  // A5 — refusal codes must be part of the declared contract
  // ★★ A CONTRACT THE AUDIT CANNOT READ IS A FINDING, NOT SILENCE. This used to `catch { return '' }`, so
  // moving/renaming the contract would have switched A5 off without a word - the audit would keep reporting
  // "0 findings" while checking nothing. `tests/audit-no-silent-reads.test.mjs` flags exactly this shape
  // (`try-read-catch-empty`), and the honest repair is to report the failure, not to declare the read optional:
  // A5 is a check we PROMISED, so its input is required.
  const CONTRACT_PATH = 'vibe-math-vmu/docs/03-interface-contract.md'
  let contract = ''
  try {
    contract = readFileSync(join('D:/wd/vibemath开发/Vibe-Mathematics', CONTRACT_PATH), 'utf8')
  } catch (e) {
    findings.push({ check: 'A5', code: 'CONTRACT_UNREADABLE', path: CONTRACT_PATH, message: String((e && e.message) || e) })
  }
  const seen = new Set()
  for (const r of receipts) {
    const code = r.receipt && r.receipt.code
    if (!code || seen.has(code)) continue
    seen.add(code)
    if (contract !== '' && !contract.includes(code)) {
      findings.push({ check: 'A5', code: 'UNREGISTERED_CODE', receiptCode: code, tool: r.tool, at: r.seq })
    }
  }

  return {
    corpus: dir, scenario: manifest.scenario || null, calls: receipts.length, treeFiles: tree.length,
    // Printed (not hidden) so a reader can see that the refusal evidence was checked and expected.
    expectedRefusals: predicted.map((r) => ({ seq: r.seq, tool: r.tool, code: (r.receipt && r.receipt.code) || null })),
    findings,
  }
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/sim/audit/receipts.mjs')
if (isMain) {
  const dir = process.argv[2]
  if (!dir) { console.error('usage: node scripts/sim/audit/receipts.mjs <corpus-dir> [--json]'); process.exit(2) }
  if (!readdirSync(dir).length) { console.error('empty corpus: ' + dir); process.exit(2) }
  const out = audit(dir)
  if (process.argv.includes('--json')) { console.log(JSON.stringify(out, null, 2)) } else {
    const byCheck = {}
    for (const f of out.findings) byCheck[f.check] = (byCheck[f.check] || 0) + 1
    console.log('corpus: ' + out.corpus + (out.scenario ? ' (' + out.scenario + ')' : ''))
    console.log('calls: ' + out.calls + '  tree files: ' + out.treeFiles + (out.expectedRefusals.length ? '  expected refusals: ' + out.expectedRefusals.length : ''))
    console.log('findings: ' + out.findings.length + '  ' + JSON.stringify(byCheck))
    for (const f of out.findings.slice(0, 40)) console.log('  ' + f.check + ' ' + f.code + ' ' + (f.tool || '') + (f.at ? ' #' + f.at : '') + (f.receiptCode ? ' [' + f.receiptCode + ']' : '') + (f.message ? ' — ' + f.message : ''))
  }
  process.exit(out.findings.length === 0 ? 0 : 1)
}

// audit-face-spread — ★ A FACE MUST NOT MERGE A SERVICE RESULT WITHOUT CHECKING IT IS AN OBJECT.
//
// WHY THIS EXISTS. Measured on a full live run: `vibe_vmu_mathjobs jobsDir` returned {"0":"M","1":"a",…}. The cause was one shape,
// repeated across the faces:
//
//     Object.assign({ ok: true, action }, await svc[action](rest))
//
// `Object.assign` spreads the second argument, so a service that returns a STRING is spread character by character, and the caller
// receives a receipt that LOOKS like data and is a bug. `jobsDir` returns a path; `bidding.fingerprintOf` a hex string;
// `bidding.normalizePlan` JSON text. All three were leaking.
//
// A RUNTIME PROBE FOUND THEM, A STATIC SCAN COULD NOT: looking for `return <literal>` at method level found five candidates, four of
// them my own regex matching `if(` and `for(`, and it never saw `jobsDir` at all because that method returns a COMPUTED path. So this
// gate does not try to infer service return types. It does the one decidable thing: it counts the raw spread shape per file and
// requires the count to be NAMED. Adding a new face that spreads an `await` is RED; converting a baselined file so it no longer
// spreads is ALSO RED until its row is deleted, because a stale exemption lies about the gate's state.
//
// THE SAFE FORM IS `spreadReceipt(action, value)` in kernel/receiptbounds.js: a primitive comes back as `result` instead of being
// spread. Using it is how a file LEAVES this baseline.
//
// MODES: no argument runs the gate; `--list` prints the per-file counts; `--selftest` proves the predicate can fire.

import { readdirSync, readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { stripComments } from './_lib/strip-comments.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const VMU = join(REPO, 'vibe-math-vmu')

// ★ THE NAMED DEBT: files that still contain the raw spread shape. Shrink-only. Each conversion deletes a row.
const BASELINE = new Set([
  'admission.js', 'arbitration.js', 'audit.js', 'auditchain.js', 'bidding.js', 'board.js', 'bridge.js', 'budget.js',
  'capacity.js', 'charter.js', 'citations.js', 'clockguard.js', 'collab.js', 'conference.js', 'control.js', 'custody.js',
  'discipline.js', 'env.js', 'explain.js', 'external.js', 'fairness.js', 'fidelity.js', 'formal.js', 'handover.js', 'idempotency.js', 'ip.js', 'mailbox.js', 'mathadapters.js', 'mathtools.js', 'minutes.js',
  'notify.js', 'projmigrate.js', 'publication.js', 'ratelimit.js', 'recruit.js', 'retention.js', 'reviewers.js',
  'task.js', 'topology.js', 'transaction.js',
])

const RAW = /Object\.assign\(\{\s*ok:\s*true,\s*action\s*\},\s*await\b/g

/** Count the raw spread shape per face file under `dir`. Pure in its argument, so --selftest can point it elsewhere. */
function countsByFile(dir) {
  const out = new Map()
  const names = readdirSync(dir).filter((n) => n.endsWith('.js'))
  if (names.length === 0) throw new Error('refusing to scan nothing: ' + dir + ' has no .js files')
  for (const n of names) {
    const code = stripComments(readFileSync(join(dir, n), 'utf8'))
    const hits = (code.match(RAW) || []).length
    if (hits > 0) out.set(n, hits)
  }
  return out
}

const judge = (counts, baseline) => {
  const unnamed = [...counts.keys()].filter((n) => !baseline.has(n)).sort()
  const stale = [...baseline].filter((n) => !counts.has(n)).sort()
  return { unnamed, stale, total: [...counts.values()].reduce((a, b) => a + b, 0), files: counts.size }
}

const argv = process.argv.slice(2)

if (argv.includes('--list')) {
  const j = judge(countsByFile(join(VMU, 'tools')), BASELINE)
  console.log('files spreading a raw await: ' + j.files + '  sites: ' + j.total + '  baseline: ' + BASELINE.size)
  console.log('★ UNNAMED (must be zero): ' + j.unnamed.length + (j.unnamed.length ? ' :: ' + j.unnamed.join(', ') : ''))
  console.log('☆ STALE (baselined but clean now): ' + j.stale.length + (j.stale.length ? ' :: ' + j.stale.join(', ') : ''))
  process.exit(0)
}

if (argv.includes('--selftest')) {
  const dir = mkdtempSync(join(tmpdir(), 'facespread-'))
  let bad = 0
  const check = (cond, name, detail) => { if (!cond) { bad += 1; console.log('  FAIL ' + name + ' ' + JSON.stringify(detail || null)) } }
  try {
    writeFileSync(join(dir, 'spreads.js'), 'export const a = async (svc) => Object.assign({ ok: true, action }, await svc.x())\n')
    writeFileSync(join(dir, 'safe.js'), 'export const b = async (svc) => spreadReceipt(action, await svc.x())\n')
    writeFileSync(join(dir, 'comment-only.js'), '// Object.assign({ ok: true, action }, await svc.x())\n')
    const counts = countsByFile(dir)
    check(counts.has('spreads.js'), '★ 正：真的摊开 await 的文件被计数', [...counts.keys()])
    check(!counts.has('safe.js'), '★ 负：走 spreadReceipt 的文件不计', [...counts.keys()])
    check(!counts.has('comment-only.js'), '★★ 负：只在注释里出现的形状不计（否则剥注释就没意义了）', [...counts.keys()])
    const j1 = judge(counts, new Set())
    check(j1.unnamed.includes('spreads.js'), '★★ 未登记 ⇒ 报 unnamed（新面不许悄悄摊开）', j1.unnamed)
    const j2 = judge(counts, new Set(['spreads.js']))
    check(j2.unnamed.length === 0 && j2.stale.length === 0, '★ 登记了 ⇒ 两者皆空（判据不是恒报）', j2)
    const j3 = judge(counts, new Set(['spreads.js', 'safe.js']))
    check(j3.stale.includes('safe.js'), '★★ 已改好却仍在基线 ⇒ 报 stale（陈旧豁免是谎言）', j3.stale)
    console.log('SELFTEST ' + (bad === 0 ? 'PASS' : 'FAIL (' + bad + ')'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  process.exit(bad === 0 ? 0 : 1)
}

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) passed += 1
  else { failed += 1; failures.push(name + (detail === undefined ? '' : ' [' + JSON.stringify(detail) + ']')) }
}

const j = judge(countsByFile(join(VMU, 'tools')), BASELINE)

ok(j.unnamed.length === 0,
  '★★ 反：新出现的"直接摊开 await"面必须显式进基线，或者改用 spreadReceipt（原始值会被摊成字符对象）', j.unnamed)
ok(j.stale.length === 0,
  '★★ 反：已不再摊开的文件仍留在基线里 ⇒ 红（行必须在同一改动里删掉）', j.stale)
ok(j.files > 0 && j.total > 0,
  '★ 正：扫描确实命中了一些站点（否则本门禁的判据可能静默空过）', { files: j.files, total: j.total })

console.log('=== FACE SPREAD: ' + passed + ' passed, ' + failed + ' failed ===')
console.log('  files=' + j.files + '  sites=' + j.total + '  baseline=' + BASELINE.size)
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)

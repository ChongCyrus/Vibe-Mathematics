// Registered mutant harness for the v5 institute fixes — the suite carries its own proof.
// Each family is a SINGLE content-anchored mutation of the v5 preset (no line numbers); the suite runs
// through the V5_PLUGIN seam. Child runs are bounded (a timeout is a HANG); skipped families are printed
// and counted. Exit criterion: every family reddens BY NAME; ALL MUTANTS RED AS REQUIRED + exit 0 only then.
// Run: node tests/v5-institute-fixes.mutants.mjs
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const PRESET = 'vibe-math-v5'
const MAIN = PRESET + '.js'
const SUITE = 'tests/e2e-v5-round2.test.mjs'
const ENV = 'V5_PLUGIN'
// This suite is long, so the default child budget is generous; MUTANT_CHILD_TIMEOUT_MS overrides it.
const CHILD_TIMEOUT_MS = Number(process.env.MUTANT_CHILD_TIMEOUT_MS || 300000)
const TIMES = []
const hangs = []
const skipped = []
function copyGraph(file, dest) {
  const src = join(REPO, PRESET, file)
  copyFileSync(src, join(dest, file))
  for (const m of readFileSync(src, 'utf8').matchAll(/from\s+'(\.\/[A-Za-z0-9_.-]+\.js)'/g)) {
    const dep = m[1].slice(2)
    if (!readdirSync(dest).includes(dep)) copyGraph(dep, dest)
  }
}
function runFamily(f) {
  const dest = join(tmpdir(), 'v5fix-mut-' + Math.random().toString(36).slice(2, 10))
  mkdirSync(dest, { recursive: true })
  copyGraph(MAIN, dest)
  const target = join(dest, f.editFile || MAIN)
  const before = readFileSync(target, 'utf8')
  const n = before.split(f.from).length - 1
  const okCount = f.lastOnly || f.all ? n >= 1 : n === 1
  if (!okCount) {
    skipped.push(f.name + ' (anchor x' + n + ')')
    console.error('  SKIP - ' + f.name + ' (anchor x' + n + ')')
    rmSync(dest, { recursive: true, force: true })
    return false
  }
  const mutated = f.lastOnly
    ? (() => { const i = before.lastIndexOf(f.from); return before.slice(0, i) + f.to + before.slice(i + f.from.length) })()
    : before.split(f.from).join(f.to)
  writeFileSync(target, mutated, 'utf8')
  try { execFileSync(process.execPath, ['--check', target], { stdio: 'pipe' }) }
  catch (e) {
    writeFileSync(target, before, 'utf8')
    skipped.push(f.name + ' (mutation did not compile)')
    console.error('  SKIP - ' + f.name + ' (mutation did not compile; restored)')
    rmSync(dest, { recursive: true, force: true })
    return false
  }
  const t0 = Date.now()
  let out = ''
  let code = 0
  let hang = false
  try {
    out = execFileSync(process.execPath, [SUITE], {
      cwd: REPO, encoding: 'utf8', timeout: CHILD_TIMEOUT_MS, killSignal: 'SIGKILL',
      env: Object.assign({}, process.env, { [ENV]: join(dest, MAIN) }),
    })
  } catch (e) {
    if (e && (e.killed || e.signal === 'SIGKILL')) hang = true
    code = (e && e.status) || 1
    out = String((e && e.stdout) || '') + String((e && e.stderr) || '')
  }
  const ms = Date.now() - t0
  TIMES.push([f.name, ms])
  if (hang) hangs.push(f.name + '(' + Math.round(ms / 1000) + 's)')
  const named = out.split(/\r?\n/).filter((l) => /^\s*(FAIL - | {2}- )/.test(l) && f.expect.test(l)).map((l) => l.trim())
  const ok = !hang && code !== 0 && named.length > 0
  console.log((hang ? '  HANG - ' : (ok ? '  ok - ' : '  FAIL - ')) + f.name + ' [' + ms + 'ms]' + (named.length ? ' :: ' + named[0].slice(0, 150) : ' :: no named red (exit=' + code + ')'))
  rmSync(dest, { recursive: true, force: true })
  return ok
}
const FAMILIES = [
  {
    // G1: acking at prompt-build time again — a failed wake then consumes the message.
    name: 'G1: the mailbox is acked BEFORE the wake again',
    from: 'if (ok && prompt.pending.length) await ackPending(prompt.pending)',
    to: 'if (prompt.pending.length) await ackPending(prompt.pending)',
    expect: /\[G1\] a message whose wake FAILED is still pending/,
  },
  {
    // G2: counting the round BEFORE a send that can fail (the historical shape v4 fixed as F10).
    name: 'G2: the round counter is applied BEFORE the send again',
    from: 'const nextRound = (rounds.get(member.id) || 0) + 1',
    to: 'rounds.set(member.id, (rounds.get(member.id) || 0) + 1); const nextRound = (rounds.get(member.id) || 0) + 1',
    expect: /\[G2\] a failed send must not consume a round/,
  },
  {
    // G4: restoring the second, unprotected whole-object write after the CAS (the lost-update window).
    name: 'G4: a second task write after the CAS is restored',
    from: "const r = await taskUpdate(memberId, { task_id: taskId, expected_revision: (cur ? cur.revision : 1), action: 'reassign', owner: to },\n        { assignedBy: isOffice(memberId) ? 'office' : memberId, why, acceptance })",
    to: "const r = await taskUpdate(memberId, { task_id: taskId, expected_revision: (cur ? cur.revision : 1), action: 'reassign', owner: to })\n      if (r.ok) await putTask(Object.assign({}, inst().tasks.find((t) => t.id === taskId), { assignedBy: isOffice(memberId) ? 'office' : memberId, why, acceptance }))",
    expect: /\[G4\] the assign path issues NO second, unprotected task write/,
  },
  {
    // A5: a permanent researcher founded with the academician KIND - the count stays 3 but the id
    // set and the kind multiset both break (the allocator also repeats the academician id).
    name: 'A5: a permanent researcher is founded with the academician kind',
    from: "const m = await newMember('researcher', { direction: dir })",
    to: "const m = await newMember('academician', { direction: dir })",
    expect: /A5 the founded (ID SET|KIND MULTISET)/,
  },
  {
    // A5-ids: the COUNT stays 3 and the kinds stay right, but the researcher id PREFIX changes, so the
    // founded ID SET is no longer {acad, r-1, r-2}. This is the discriminator the count cannot catch.
    name: 'A5-ids: the researcher id prefix is renamed (count still 3)',
    from: "researcher: 'r-',",
    to: "researcher: 'rX-',",
    expect: /A5 the founded ID SET is exactly/,
  },
  {
    // A5-kinds: the COUNT stays 3 and the ids stay right, but a founded researcher's KIND is rewritten,
    // so the kind MULTISET is no longer {academician:1, researcher:2}.
    name: 'A5-kinds: a founded researcher kind is rewritten (count still 3)',
    from: "id: '', kind,",
    to: "id: '', kind: kind === 'researcher' ? 'temp' : kind,",
    expect: /A5 the founded KIND MULTISET is exactly/,
  },
]
let red = 0
for (const f of FAMILIES) { const ok = runFamily(f); if (ok) red++ }
console.log('')
console.log('mutant families reddening the v5 institute fixes by name: ' + red + '/' + FAMILIES.length)
console.log('timings: ' + TIMES.map((t) => String(t[0]).split(':')[0] + '=' + t[1] + 'ms').join('  '))
console.log('hangs=[' + hangs.join(' | ') + ']')
console.log('skipped=[' + skipped.join(' | ') + ']')
if (red !== FAMILIES.length || skipped.length || hangs.length) process.exit(1)
console.log('ALL MUTANTS RED AS REQUIRED')

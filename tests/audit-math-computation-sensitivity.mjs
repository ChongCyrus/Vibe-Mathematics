// ============================================================================================
// math_computation — SENSITIVITY probes (integration owner).
//
// Proves the shared contract suite is FALSIFIABLE: for each mutation of the module, the suite must
// go RED for the RIGHT assertion (the probe checks both the exit code and the failing label, so a
// suite that merely crashes does not count as evidence).
//
// Mechanism: copy the canonical module pair into a temp dir, apply ONE textual mutation, then run
// `tests/math-computation-shared.test.mjs` with MATH_COMPUTATION_MODULE pointed at the mutated copy.
// The shipped copies are never touched.
//
// Usage: node tests/audit-math-computation-sensitivity.mjs
// A probe PASSES when the mutated run fails AND the expected label is among the failures.
// ============================================================================================
import { spawnSync } from 'node:child_process'
import { mkdtempSync, copyFileSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = resolve(HERE, '..')
const SRC = join(REPO, 'vibe-math-v2')
const SUITE = join(HERE, 'math-computation-shared.test.mjs')

const PROBES = [
  {
    name: 'cli-default-off',
    file: 'math-computation.js',
    from: 'mathEngines: MATH_ENGINE_ORDER.slice(),',
    to: "mathEngines: MATH_ENGINE_ORDER.filter(function (n) { return n !== 'cli' }),",
    expect: 'cli runs with DEFAULT params (default-on)',
  },
  {
    name: 'cli-policy-ignored',
    file: 'math-computation.js',
    from: "if (p.mathMode !== 'typed+shell') return bad('engine=cli is disabled while mathMode=' + p.mathMode, 'MATH_REFUSED', next('reason', { reason: 'policy' }))",
    to: 'if (false) return bad(\'noop\')',
    expect: 'cli refused while mathMode=typed',
  },
  {
    name: 'argv-echo-removed',
    file: 'math-computation.js',
    from: '    argv: assembled.argv.slice(),\n    scriptPath: scriptRel, scriptHash: scriptHash,',
    to: '    scriptPath: scriptRel, scriptHash: scriptHash,',
    expect: 'receipt argv === returned argv',
  },
  {
    name: 'bad-argv-collapsed',
    file: 'math-computation.js',
    from: "      const out = fail('MATH_ENGINE_BAD_ARGV', engineLabel,",
    to: "      const out = fail('MATH_NONZERO_EXIT', engineLabel,",
    expect: 'usage/option error -> MATH_ENGINE_BAD_ARGV (not collapsed into NONZERO_EXIT)',
  },
  {
    name: 'timeout-not-reported',
    file: 'math-computation.js',
    from: '  if (receipt.timedOut) {',
    to: '  if (false) {',
    expect: 'hang -> MATH_TIMEOUT',
  },
  {
    name: 'param-renamed',
    file: 'math-computation.js',
    from: "  'mathComputation', 'mathMode', 'mathEngines', 'mathTimeoutMs', 'mathPackages', 'mathInstallScope',",
    to: "  'mathComputation', 'mathMode', 'mathEngines', 'mathTimeoutMs', 'mathPkgs', 'mathInstallScope',",
    expect: 'six frozen param names in order',
  },
  {
    name: 'no-subprocess-flag-ignored',
    file: 'math-computation.js',
    from: "  if (typeof H.hasSubprocess === 'function' && H.hasSubprocess() === false) {",
    to: '  if (false) {',
    expect: 'host that declares no subprocess -> MATH_NO_SUBPROCESS (not ENGINE_NOT_FOUND)',
  },
  // ── P2a: archive -> edit -> re-run integrity ─────────────────────────────────────────────────
  {
    name: 'script-fields-dropped-from-return',
    file: 'math-computation.js',
    from: '    scriptPath: scriptRel, scriptHash: scriptHash,\n    attempt: attempt, attemptDir: dir, baseRunDir: baseDir,\n    scriptChanged: scriptChanged, scriptChangedDuringRun: scriptChangedDuringRun,\n    sourceFile: fileRel || null,\n    previousReceipt: receipt.previousReceipt,\n    packages: pk.found,',
    to: '    packages: pk.found,',
    expect: 'scriptPath + scriptHash are in the return value AND the receipt',
  },
  {
    name: 'script-changed-never-flagged',
    file: 'math-computation.js',
    from: "  const scriptChanged = !!(mode === 'file' && prevReceipt && prevReceipt.scriptHash && prevReceipt.scriptHash !== scriptHash)",
    to: '  const scriptChanged = false',
    expect: 'edited file -> scriptChanged:true (no silent pass)',
  },
  {
    name: 'mid-run-change-unflagged',
    file: 'math-computation.js',
    from: '    scriptChangedDuringRun = sourceHashAfter !== sourceHashBefore\n  }\n  if (!r) return fail(\'MATH_NO_SUBPROCESS\'',
    to: '    scriptChangedDuringRun = false\n  }\n  if (!r) return fail(\'MATH_NO_SUBPROCESS\'',
    expect: 'mid-run edit -> scriptChangedDuringRun:true',
  },
  {
    name: 'archive-overwrite-instead-of-append',
    file: 'math-computation.js',
    from: "  const hasFirst = await H.exists(baseDir + '/receipt.json')\n  if (!hasFirst) return { attempt: 1, dir: baseDir }\n  let n = 2",
    to: "  const hasFirst = await H.exists(baseDir + '/receipt.json')\n  return { attempt: 1, dir: baseDir }\n  let n = 2",
    expect: 'a repeat is appended as attempt 2 (never overwriting attempt 1)',
  },
  {
    name: 'retention-warning-silenced',
    file: 'math-computation.js',
    from: '  if (attempt > MATH_ARCHIVE_MAX_ATTEMPTS_PER_RUN) {',
    to: '  if (false) {',
    expect: 'over the retention cap the tool warns (ARCHIVE_RETENTION_EXCEEDED)',
  },
  {
    name: 'receipt-reconciliation-skipped',
    file: 'math-computation.js',
    from: '  const scriptChanged = scriptMissing || (currentHash !== null && recordedHash !== null && currentHash !== recordedHash)',
    to: '  const scriptChanged = false',
    expect: 'op=receipt reports scriptChanged for an edited archive script',
  },
  // ── audit-C fixes ───────────────────────────────────────────────────────────────────────────
  {
    name: 'archive-allocation-unlocked',
    file: 'math-computation.js',
    // Each call gets its own lock chain, i.e. the per-archive-id serialisation is gone while the
    // call itself is still awaited.
    from: '  return await withArchiveLock(baseDir, async () => {',
    to: "  return await withArchiveLock(baseDir + ':' + Math.random(), async () => {",
    expect: '★ 同一 id 的并发运行绝不共用一个 attempt 目录（并发下的 append-only）',
  },
  {
    name: 'deleted-source-unflagged',
    file: 'math-computation.js',
    from: '    scriptChangedDuringRun = sourceHashAfter !== sourceHashBefore',
    to: '    scriptChangedDuringRun = false',
    expect: 'the source file disappearing mid-run is a change: scriptChangedDuringRun:true',
  },
  {
    name: 'missing-archive-script-unflagged',
    file: 'math-computation.js',
    from: '  const scriptChanged = scriptMissing || (currentHash !== null && recordedHash !== null && currentHash !== recordedHash)',
    to: '  const scriptChanged = false',
    expect: 'a deleted archive script makes op=receipt report scriptChanged (fail-closed)',
  },
  {
    name: 'listdir-retention-skipped',
    file: 'math-computation.js',
    from: "  if (typeof H.listDir === 'function' && H.listDir) {",
    to: '  if (false) {',
    expect: 'listDir shows more than MATH_ARCHIVE_MAX_RUNS -> ARCHIVE_RETENTION_EXCEEDED (warn only)',
  },
  // ── audit-B fixes ───────────────────────────────────────────────────────────────────────────
  {
    name: 'override-ignored',
    file: 'math-computation.js',
    from: '  const o = ov && isObj(ov) ? ov[det.name] : null\n  if (!o) return d',
    to: '  const o = ov && isObj(ov) ? ov[det.name] : null\n  if (!o || o) return d',
    expect: 'the overridden scriptArgv really changes the assembled argv',
  },
  {
    name: 'override-not-accepted',
    file: 'math-computation.js',
    from: "'dryRun', 'confirm', 'mathEngineOverride']",
    to: "'dryRun', 'confirm']",
    expect: 'mathEngineOverride is ACCEPTED (previously rejected as an unknown argument)',
  },
  {
    name: 'archive-missing-not-refused',
    file: 'math-computation.js',
    from: "  if (json === undefined) return fail('MATH_REFUSED', null, '没有找到回执归档：",
    to: "  if (json === undefined) return fail('MATH_INVALID_ARGUMENT', null, '没有找到回执归档：",
    expect: 'op=receipt on a missing archive -> MATH_REFUSED',
  },
  {
    name: 'shell-line-in-all-tiers',
    file: 'math-computation.js',
    from: "  const shell = mode === 'typed+shell' ? '\\n' + MATH_SHELL_RULE_LINE : ''",
    to: "  const shell = '\\n' + MATH_SHELL_RULE_LINE",
    expect: 'typed tier drops the shell-fallback sentence',
  },
]

let ok = 0, bad = 0
console.log('-- math_computation sensitivity probes --')
console.log('(a probe passes when the mutation makes the shared contract suite RED for the named assertion)')
console.log('')

function runSuite(modulePath) {
  const r = spawnSync(process.execPath, [SUITE], {
    cwd: REPO, encoding: 'utf8',
    env: Object.assign({}, process.env, { MATH_COMPUTATION_MODULE: modulePath }),
  })
  const out = String(r.stdout || '') + String(r.stderr || '')
  const fails = out.split('\n').filter((l) => /FAIL /.test(l)).map((l) => l.trim())
  return { code: r.status, fails, out }
}

// control: the unmutated canonical pair must be GREEN, otherwise every probe below is meaningless
{
  const dir = mkdtempSync(join(tmpdir(), 'mc-sens-control-'))
  copyFileSync(join(SRC, 'math-engines.js'), join(dir, 'math-engines.js'))
  copyFileSync(join(SRC, 'math-computation.js'), join(dir, 'math-computation.js'))
  const r = runSuite(join(dir, 'math-computation.js'))
  const tail = r.out.trim().split('\n').filter(Boolean).slice(-1)[0] || ''
  if (r.code === 0) { ok++; console.log('  ok   control (unmutated copy) -> suite GREEN  ' + tail) }
  else { bad++; console.log('  FAIL control (unmutated copy) went RED: ' + r.fails.slice(0, 3).join(' | ')) }
  rmSync(dir, { recursive: true, force: true })
}

for (const p of PROBES) {
  const dir = mkdtempSync(join(tmpdir(), 'mc-sens-' + p.name + '-'))
  copyFileSync(join(SRC, 'math-engines.js'), join(dir, 'math-engines.js'))
  const src = readFileSync(join(SRC, p.file), 'utf8')
  if (src.indexOf(p.from) === -1) {
    bad++
    console.log('  FAIL ' + p.name + ' — mutation anchor no longer applies (drift): ' + JSON.stringify(p.from.slice(0, 60)))
    rmSync(dir, { recursive: true, force: true })
    continue
  }
  writeFileSync(join(dir, p.file), src.split(p.from).join(p.to))
  const r = runSuite(join(dir, p.file))
  const hit = r.fails.some((f) => f.indexOf(p.expect) !== -1)
  if (r.code !== 0 && hit) { ok++; console.log('  ok   ' + p.name + ' -> RED on "' + p.expect + '"') }
  else {
    bad++
    console.log('  FAIL ' + p.name + ' -> exit=' + r.code + ' expectedLabelFound=' + hit + ' fails=' + r.fails.slice(0, 3).join(' | '))
  }
  rmSync(dir, { recursive: true, force: true })
}

console.log('')
console.log('math_computation sensitivity: ' + ok + ' probe(s) detected the break, ' + bad + ' problem(s)')
process.exit(bad === 0 ? 0 : 1)

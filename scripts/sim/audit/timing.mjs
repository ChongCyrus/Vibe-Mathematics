// The segment budget's ruler: how much would this segment cost on the documented reference machine?
//
// Why not wall-clock: the gate runs three child processes while other lanes share the box. On the
// TB-2728 box a quiet meeting-matrix segment cost 8.3-8.7 s; with three CPU hogs alongside it cost
// 17.4-19.1 s (2.14x) without a single line of product code changing. Raising the baseline (14000
// ms) hides that, but it also hides a real 60 % regression, so the number stops meaning anything.
//
// Why a child-process calibration: the segment's slow-down under contention comes from process
// startup, V8 compilation and multi-threaded GC -- none of which a single-threaded CPU counter in
// the parent sees (measured: parent-side factor stayed at 1.0-1.5 while the segment doubled). The
// calibration workload is spawned with process.execPath, i.e. it is the same KIND of process as the
// segment, so the ratio cancels both machine speed and contention. The calibration's own CPU time
// is NOT usable either: it rose 770 -> 1607 ms under the same hogs.
//
// The ruler is thus:  factor = FASTEST calibration sample seen in this gate / documented calib-ref
//                     costMs = segment wall / factor
// The sample (not the median, not the max) is the estimate of machine speed: ambient load only ever makes a program
// slower, so the fastest pass is the best available reading of "how fast is this machine"; a median or a max would bake
// another lane's burst into the budget. Measured inside one quiet gate, samples spanned 253-653 ms (2.6x) while the
// long segments' wall times moved by 4 % -- so the estimator has to be a floor, not a centre.
// A quiet machine gives factor ~1.0 and costMs ~= wall. A fully loaded machine gives factor ~2.0
// and costMs ~= the quiet cost. See docs/acceptance/sim-gate-scope.md for the measured tables.

import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
export const CALIBRATION_SCRIPT = join(HERE, 'calibration-work.mjs')
export const CALIBRATION_TIMEOUT_MS = 120000

/** Reject a calibration that cannot be trusted, rather than letting it divide. */
export function factorOf(calibMs, refMs) {
  if (!Number.isFinite(calibMs) || calibMs <= 0) {
    return { ok: false, factor: null, why: 'CALIBRATION-NOT-MEASURED: the calibration reported ' + calibMs + ' ms - a zero-length yardstick would call every segment free' }
  }
  if (!Number.isFinite(refMs) || refMs <= 0) {
    return { ok: false, factor: null, why: 'CALIB-REF-MISSING: the documented line must carry calib-ref=<median ms> measured on the reference machine; without it the ratio has no unit' }
  }
  const factor = calibMs / refMs
  if (factor < 0.25 || factor > 8) {
    return { ok: false, factor, why: 'CALIBRATION-IMPLAUSIBLE: factor ' + factor.toFixed(2) + ' means this machine is ' + (factor < 1 ? 'much faster' : 'much slower') + ' than the reference - either the calibration work changed (re-pin calib-ref) or the wrong script ran' }
  }
  return { ok: true, factor }
}

/**
 * Run the fixed calibration workload in a child process (the same kind of process as a segment).
 * Returns every raw number the gate prints, plus a named refusal for each way this can go wrong.
 */
export function calibration(options = {}) {
  const execPath = options.execPath || process.execPath
  const script = options.script || CALIBRATION_SCRIPT
  const timeoutMs = options.timeoutMs || CALIBRATION_TIMEOUT_MS
  const startedAt = Date.now()
  const result = spawnSync(execPath, [script], { encoding: 'utf8', timeout: timeoutMs, maxBuffer: 1024 * 1024 })
  const spawnWallMs = Date.now() - startedAt
  if (result.error) {
    return { ok: false, spawnWallMs, why: 'CALIBRATION-SPAWN-FAILED: ' + String(result.error.message || result.error) }
  }
  if (result.status !== 0) {
    return { ok: false, spawnWallMs, why: 'CALIBRATION-EXIT-' + result.status + ': ' + String(result.stderr || '').trim().slice(0, 300) }
  }
  let parsed = null
  try {
    const lines = String(result.stdout || '').trim().split(/\r?\n/).filter(Boolean)
    parsed = JSON.parse(lines[lines.length - 1])
  } catch (e) {
    return { ok: false, spawnWallMs, why: 'CALIBRATION-UNPARSEABLE: the calibration child did not print one JSON row (' + String(e.message || e) + ')' }
  }
  const medianMs = Number(parsed.medianMs)
  const minMs = Number(parsed.minMs)
  if (!Number.isFinite(medianMs) || medianMs <= 0) {
    return { ok: false, spawnWallMs, why: 'CALIBRATION-NOT-MEASURED: the child printed medianMs=' + parsed.medianMs }
  }
  if (!Array.isArray(parsed.samples) || parsed.samples.length !== 3) {
    return { ok: false, spawnWallMs, why: 'CALIBRATION-SHAPE: expected 3 samples, got ' + JSON.stringify(parsed.samples) }
  }
  // The frozen workload: 4 passes x 40000 items. It has to be LONG (~4.5-6 s per sample, ~18 s per point) because a
  // short child under-reports contention: TB-2728 measured a 1.7 s child at 1.69-1.74x under three CPU hogs while the
  // 8 s meeting-matrix segment inflated 2.27x. Changing this count changes what 'calib-ref' means, so it is refused.
  if (parsed.items !== 160000) {
    return { ok: false, spawnWallMs, why: 'CALIBRATION-WORK-CHANGED: expected 160000 items (the frozen workload), got ' + parsed.items + ' - re-pin calib-ref before trusting the ratio' }
  }
  return { ok: true, medianMs, minMs, samples: parsed.samples, cpuMs: parsed.cpuMs, sink: parsed.sink, spawnWallMs, why: null }
}

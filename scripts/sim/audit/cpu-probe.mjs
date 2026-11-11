// CPU probe, loaded into EVERY node process the gate starts (segments, their children, the slow self-proof wrapper)
// through NODE_OPTIONS=--import=... . It records the process's own CPU time (user+system) at exit, so the gate can sum
// the whole process tree instead of timing the wall clock.
//
// WHY: wall time on a shared box is mostly other people's work. TB-2728 measured, under three CPU hogs on 4 cores,
// meeting-matrix's wall going 8.3 s -> 15-22 s while its CPU stayed 9.7 s -> 12.2 s (+26 %), and end-to-end's wall
// going 1.7 s -> 5.0 s while its CPU stayed 2.2 s -> 2.4 s (+8 %). A wall clock calls the second case a 3x regression;
// the CPU it actually burned says +8 %. Cost means work, so cost is measured here.
//
// It records user and system CPU SEPARATELY, and the gate rules on USER time only. Measured on meeting-matrix, quiet
// vs three CPU hogs: user 8937/9093 -> 10015/10421 ms (+12..15 %), system 1578/1750 -> 1937/2203 ms, total
// 9812 -> 12218 ms (+25 %). System time grows with scheduling churn -- that is the MACHINE being busy, not the code
// getting slower -- so judging total CPU would still turn a busy box into a red gate. User time is the work.
//
// The write is best-effort by construction: a measurement layer that can fail a run would be a new way to lose a
// green gate, and this file deliberately has no opinion about the run's success.
import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = process.env.VMU_GATE_CPU_DIR
if (dir) {
  process.on('exit', () => {
    try {
      const usage = process.cpuUsage()
      mkdirSync(dir, { recursive: true })
      appendFileSync(join(dir, 'cpu.jsonl'), JSON.stringify({
        pid: process.pid,
        ppid: process.ppid,
        userMs: Math.round(usage.user / 1000),
        sysMs: Math.round(usage.system / 1000),
        cpuMs: Math.round((usage.user + usage.system) / 1000),
      }) + '\n')
    } catch {
      // A missing CPU row can only make a segment look uncounted; the gate refuses an uncounted segment by name,
      // so silence here is loud downstream. Crashing the process we are measuring is not an option.
    }
  })
}

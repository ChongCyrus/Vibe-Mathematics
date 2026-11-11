// A FIXED calibration workload for the segment budget (TB-2728).
//
// Why a child process: the gate's segments are child processes too (node startup, V8
// compilation, GC). CPU contention slows exactly those multi-threaded phases, so a CPU counter
// inside the gate process measures a different machine -- the TB-2728 diagnosis showed the
// in-process calibration staying at factor 1.0 while the segment's wall time doubled. The gate
// therefore spawns THIS script and compares its wall time with the segment's wall time; both see
// the same contention, and the ratio cancels it.
//
// Why a warm-up pass and several samples: the first pass through these loops pays V8 tier-up
// (measured 656-1112 ms cold vs 1145-1195 ms warm for the same work). After the discarded
// warm-up the samples are stable; the gate uses their MEDIAN as "how fast is this machine right
// now", because the minimum would only record our luckiest sample.
//
// The work is deterministic: no Math.random, no clock reads, no I/O, no environment reads.
// KEEP THIS FILE FROZEN: changing the work changes the ruler and requires re-pinning calib-ref.

const ITEMS_PER_SAMPLE = 40000
const SAMPLES = 3

function pass(items) {
  const startedAt = process.hrtime.bigint()
  let hash = 0x811c9dc5n
  let bytes = 0
  for (let i = 0; i < items; i += 1) {
    const row = {
      id: 'rec-' + i,
      md: '| a | b |' + String.fromCharCode(10) + '| ' + i + ' | ' + (i * 3) + ' |',
      nested: { x: i, y: 'v' + i, list: [i, i + 1, i + 2] },
    }
    bytes += JSON.stringify(row).length
    for (let j = 0n; j < 3000n; j += 1n) {
      hash = (hash ^ j) * 0x01000193n
      hash &= 0xffffffffn
      hash ^= hash >> 7n
    }
  }
  return { wallMs: Number(process.hrtime.bigint() - startedAt) / 1e6, items, bytes, sink: Number(hash & 0xffffn) }
}

const cpu0 = process.cpuUsage()
const warm = pass(ITEMS_PER_SAMPLE) // warm-up: JIT-compile both hot loops, then throw the timing away
const samples = []
for (let k = 0; k < SAMPLES; k += 1) samples.push(Math.round(pass(ITEMS_PER_SAMPLE).wallMs * 10) / 10)
const cpu = process.cpuUsage(cpu0)

process.stdout.write(JSON.stringify({
  samples,
  minMs: Math.min(...samples),
  medianMs: samples.slice().sort((a, b) => a - b)[Math.floor(samples.length / 2)],
  cpuMs: Math.round((cpu.user + cpu.system) / 10) / 100,
  items: warm.items * (SAMPLES + 1),
  sink: warm.sink + warm.bytes,
}) + String.fromCharCode(10))

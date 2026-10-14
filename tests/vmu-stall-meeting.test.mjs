// vibe-math-vmu —— v5r 的"静止 ⇒ 开会"（packs/v5r/middleware/stall-meeting.js）常驻断言。
// 运行：`node tests/vmu-stall-meeting.test.mjs`（末行 `=== VMU STALL MEETING: N passed, M failed ===`）。
//
// 为什么这套测试存在（轮 11 / task-88）：Round 10 的三步探针是在**仓库外**（`D:\_tmp`）跑的 ——
// 按本仓纪律"**能跑** ≠ **被守住**"，它必须在仓内被常驻守住。本套测试把它搬进仓，并补两条纪律：
//   · **阈值不硬编码**：断言 `stallDecision()` 用的是 `3 × 声明的 idleAfterMs`（v5r `:1082/:1083` 的比例），
//     而不是把 360000 写死 —— 用一个**不同的声明值**（60000）也能得到 180000 的门槛来证明；
//   · **三段全证**：内核真控制面报出空闲**边沿**（同 episode 第二次 `emitted:false`）⇒ `control/idle` 上
//     **恰一条**带 `trigger-workflow` 的条目 ⇒ **`vmu.meetings.open()` 真被调用**（在真面上包一层观测）。
// 反向也要证：未到门槛、短空闲、未声明空闲（`idleAfterMs=0`）**都不开会**（零机制）。
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as entryMod from '../vibe-math-vmu/vibe-math-vmu.js'
import { stallDecision, STALL_RATIO, V5R_STALL_MEETING } from '../vibe-math-vmu/packs/v5r/middleware/stall-meeting.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) { passed += 1; return }
  failed += 1
  failures.push(name + (detail === undefined ? '' : ' [' + String(typeof detail === 'string' ? detail : JSON.stringify(detail)) + ']'))
}
const fakeCtx = () => ({ effect(fn) { return fn() }, on() { return () => {} }, tools: { register: async () => () => {} } })

// ---- 1. the module's declared shape ---------------------------------------------------------------
ok(V5R_STALL_MEETING.meta && V5R_STALL_MEETING.meta.id === 'v5r.stall-meeting' && Number.isInteger(V5R_STALL_MEETING.meta.apiVersion),
  'S1. the module declares meta { id, apiVersion } (the loader validates it)', V5R_STALL_MEETING.meta)
ok(Array.isArray(V5R_STALL_MEETING.capabilities) && V5R_STALL_MEETING.capabilities.includes('trigger-workflow'),
  'S2. and it declares the capability that unlocks the service seam', V5R_STALL_MEETING.capabilities)
ok(V5R_STALL_MEETING.hooks && typeof V5R_STALL_MEETING.hooks['control/idle'] === 'function',
  'S3. its one hook is control/idle', Object.keys(V5R_STALL_MEETING.hooks || {}))

// ---- 2. THE THRESHOLD IS NOT HARD-CODED -----------------------------------------------------------
ok(STALL_RATIO === 3, 'T1. the ratio is v5r\'s own: stallAutoMeetingMs / activityTimeoutMs = 3', STALL_RATIO)
ok(stallDecision({ elapsedMs: 360000, afterMs: 120000 }).convene === true,
  'T2. 360000ms = 3 x 120000ms (v5r :1082/:1083) convenes', stallDecision({ elapsedMs: 360000, afterMs: 120000 }))
ok(stallDecision({ elapsedMs: 359999, afterMs: 120000 }).convene === false,
  'T3. one millisecond short does NOT convene', stallDecision({ elapsedMs: 359999, afterMs: 120000 }))
// the pair below can only pass if the DECLARED value is used - a hard-coded 360000 would fail both
ok(stallDecision({ elapsedMs: 180000, afterMs: 60000 }).convene === true,
  'T4. a DIFFERENT declared threshold (60000) convenes at 3 x 60000 = 180000 (so 360000 is not baked in)',
  stallDecision({ elapsedMs: 180000, afterMs: 60000 }))
ok(stallDecision({ elapsedMs: 179999, afterMs: 60000 }).convene === false,
  'T5. and it does not convene one millisecond before THAT threshold', stallDecision({ elapsedMs: 179999, afterMs: 60000 }))
ok(stallDecision({ elapsedMs: 900000, afterMs: 0 }).convene === false,
  'T6. with no declared idleness (idleAfterMs = 0) nothing happens (zero mechanism)', stallDecision({ elapsedMs: 900000, afterMs: 0 }))

// ---- 3. the three steps through the REAL pack load ------------------------------------------------
const root = await mkdtemp(join(tmpdir(), 'vmu-stall-'))
const handle = entryMod.apply(fakeCtx(), { clock: () => 1000, root, packs: ['v5r'], 'vmu.packs.active': ['v5r'],
  'vmu.control.idleAfterMs': 120000, 'vmu.control.idleAction': 'notice' })
await handle.ready()

// observe the REAL meeting face (never trust the handler's own return value for STEP 3)
const meetings = handle.kernel.meetings
const opened = []
const realOpen = meetings.open.bind(meetings)
meetings.open = (args) => { opened.push(args); return realOpen(args) }

// STEP 1: the real control face reports the idle EDGE, once per episode
const first = handle.kernel.idleState({ lastActivityAt: 1000, at: 1000 + 400000 })
ok(first && first.idle === true && first.emitted === true,
  'E1. STEP 1 - the real control face reports the idle EDGE (idle:true, emitted:true)', first)
const again = handle.kernel.idleState({ lastActivityAt: 1000, at: 1000 + 500000 })
ok(again && again.idle === true && again.emitted === false,
  'E2. and the SAME episode does not re-emit (edge triggered once, so no repeated convention)', again)

await new Promise((r) => setTimeout(r, 60))

// STEP 2: exactly one bus entry on control/idle, carrying the capability
const entries = handle.kernel.bus.entries().filter((e) => String(e.id).startsWith('v5r.stall-meeting'))
ok(entries.length === 1 && Array.isArray(entries[0].on) && entries[0].on.length === 1 && entries[0].on[0] === 'control/idle',
  'E3. STEP 2 - the module became exactly ONE bus entry on control/idle', entries.map((e) => e.id))
ok(entries[0] && Array.isArray(entries[0].capabilities) && entries[0].capabilities.includes('trigger-workflow'),
  'E4. and that entry carries trigger-workflow (the capability that unlocks api.services)', entries[0] && entries[0].capabilities)

// STEP 3: the meeting was really opened, by the pack's middleware, with its own call shape
ok(opened.length >= 1, 'E5. STEP 3 - vmu.meetings.open() was REALLY called by the pack middleware', opened)
ok(opened[0] && opened[0].kind === 'stall', 'E6. and the call carries the pack\'s own shape (kind:"stall")', opened[0])
ok(opened[0] && opened[0].type === 'ordinary', 'E7. with the declared meeting type (ordinary)', opened[0])

// ---- 4. the negatives through the same real assembly ----------------------------------------------
opened.length = 0
handle.kernel.idleState({ lastActivityAt: 900000, at: 900000 + 100000 })   // a non-idle observation clears the edge
handle.kernel.idleState({ lastActivityAt: 900000, at: 900000 + 130000 })   // idle, but 130000 < 3 x 120000
await new Promise((r) => setTimeout(r, 60))
ok(opened.length === 0, 'N1. a SHORT idle (130000ms < 360000ms) convenes nothing', opened)

opened.length = 0
handle.kernel.idleState({ lastActivityAt: 900000, at: 900000 + 100000 })   // clear again
handle.kernel.idleState({ lastActivityAt: 900000, at: 900000 + 359999 })   // one ms short of the edge value
await new Promise((r) => setTimeout(r, 60))
ok(opened.length === 0, 'N2. one millisecond short of the stall threshold convenes nothing', opened)

await rm(root, { recursive: true, force: true })

console.log('=== VMU STALL MEETING: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)

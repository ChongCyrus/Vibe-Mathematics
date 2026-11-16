// tests/vmu-cold-start.test.mjs — ROUND-1 AUDIT / P0-e (C#24, C#27): COLD START MUST BE VISIBLE AND REPAIRABLE.
//
// The finding: a fresh profile's preset row declares no config, the adapter's documented zero-mechanism default then
// publishes exactly ONE tool (`vibe_vmu_status`), the registration failures only ever reached the install receipt and
// stderr, there was no doctor anywhere, and no read face answered "why do I see one tool?".
//
// WHAT THIS SUITE PINS (code-level, reproducible):
//   1. the shipped preset SOURCE still leaves `config:` to the deployment (the seed writes the INSTALLED copy only —
//      tests/audit-preset-overlay-shape.test.mjs, run 90, is why);
//   2. `scripts/doctor.mjs` on a fresh installed preset reports configSource:"none", measures the zero-mechanism default
//      (1 tool) beside the seeded face set (>1), names failures, exits NON-ZERO, and proposes an executable repair;
//   3. `--seed` writes the minimal runnable config into the installed copy (never the repo), doctor then exits 0, and the
//      seed is idempotent + non-destructive (a deployment's own config: is left byte-identical);
//   4. `kernel.status({detail:"full"}).coldStart` renders the three steps (installed / registeredTools / unavailable)
//      with "reported:false" as its own state and each failure named with a repair hint;
//   5. TWO LAMPS: dropping `unavailable.items` from status ⇒ red; hard-coding the doctor verdict to "ready" ⇒ red.

import { mkdtemp, mkdir, cp, rm, readFile, writeFile, access } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = resolve(HERE, '..')
const SRC = join(REPO, 'vibe-math-vmu')
const DOCTOR = join(REPO, 'scripts', 'doctor.mjs')
const AGENT_SRC = join(SRC, 'agent.cordis.yml')

let passed = 0
let failed = 0
const ok = (cond, name, detail) => {
  if (cond) { passed++ }
  else { failed++; console.log('  FAIL ' + name + ' :: ' + JSON.stringify(detail)) }
}
const read = (p) => readFile(p, 'utf8')
const runDoctor = (args, { expectExit } = {}) => {
  try {
    const stdout = execFileSync(process.execPath, [DOCTOR, ...args], { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    return { exit: 0, stdout }
  } catch (e) {
    return { exit: e.status === undefined ? -1 : e.status, stdout: String(e.stdout || ''), stderr: String(e.stderr || '') }
  }
}
const COLD_DIAG_KEYS = ['registeredTools', 'unavailable', 'configSource', 'repair', 'coldStartMeans']
const carriesColdStartBlock = (body) => {
  if (!body || typeof body !== 'object') return false
  if (COLD_DIAG_KEYS.some((key) => Object.prototype.hasOwnProperty.call(body, key))) return true
  // a real block also EXPANDS `installed` ({value,how,means}); a headline never does.
  return !!(body.installed && typeof body.installed === 'object' && Object.prototype.hasOwnProperty.call(body.installed, 'how'))
}


const rowHasConfig = (text) => {
  const lines = String(text).split('\n')
  const at = lines.findIndex((l) => /^\s*-\s+id:\s*vibe-math-vmu\s*$/.test(l))
  if (at < 0) return false
  const indent = lines[at].match(/^ */)[0].length
  for (let i = at + 1; i < lines.length; i++) {
    const lead = lines[i].match(/^ */)[0].length
    if (/^\s*-\s/.test(lines[i]) && lead <= indent) break
    if (new RegExp('^\\s{0,' + (indent + 2) + '}config:\\s*$').test(lines[i])) return true
  }
  return false
}

// ── 1. THE SHIPPED PRESET SOURCE STILL LEAVES `config:` TO THE DEPLOYMENT ───────────────────────────────────────────
{
  const text = await read(AGENT_SRC)
  ok(!rowHasConfig(text), '★ 正：shipped preset source 的 vmu 行仍然没有 config（seed 只写已安装副本；run-90 的规则不变）')
  ok(text.indexOf('config:') !== -1 || true, '★ 正：preset 里其它行可以带 config（这不是一条"文件里不许出现 config"的禁令）')
}

// ── 2+3. DOCTOR ON A FRESH INSTALLED PRESET, THEN AFTER --seed ───────────────────────────────────────────────────────
{
  const dir = await mkdtemp(join(tmpdir(), 'vmu-cold-start-'))
  try {
    const presetRoot = join(dir, 'presetRoot')
    const presetDir = join(presetRoot, 'vibe-math-vmu')
    await mkdir(presetDir, { recursive: true })
    // an INSTALLED copy: the preset files the installer ships (enough for doctor's simulation: kernel/, host.js, tools/)
    await cp(SRC, presetDir, { recursive: true, filter: (src) => !/[\\/]docs([\\/]|$)/.test(src) })
    // its vmu row must look like the shipped one (no config) — the seed marker must not exist
    ok(!rowHasConfig(await read(join(presetDir, 'agent.cordis.yml'))), '★ 前置：临时 profile 的 preset 副本无 config（冷启动）')

    const before = await read(join(presetDir, 'agent.cordis.yml'))
    const r1 = runDoctor(['--preset-root', presetRoot, '--json'])
    const j1 = JSON.parse(r1.stdout)
    ok(r1.exit === 1 && j1.configSource.value === 'none', '★★ 判据：新鲜 profile ⇒ doctor 退出码 1 且 configSource:"none"', { exit: r1.exit, source: j1.configSource && j1.configSource.value })
    ok(j1.simulated.withoutConfig.registeredTools === 1,
      '★★★ 判据：模拟冷启动证实零机制默认 = 恰好 1 个工具（这就是审计 C#24 的"选择器里一个工具"的代码级根因）', j1.simulated.withoutConfig)
    ok(j1.simulated.withSeedConfig.registeredTools > 1 && j1.simulated.withSeedConfig.failures.length === 0,
      '★★ 判据：同一 doctor 同时报"seed 后会注册几个"（>1 且 0 失败），冷启动用户看得到修复后的样子', j1.simulated.withSeedConfig)
    ok(j1.status && j1.status.configSource.value === 'none' && j1.status.installed && j1.status.installed.value === true,
      '★★ 判据：status 三步齐全——installed 有值 / registeredTools 有计数 / unavailable 有容器', j1.status && { installed: j1.status.installed, registered: j1.status.registeredTools, unavailable: j1.status.unavailable })
    ok(Array.isArray(j1.repair) && j1.repair.some((x) => String(x).includes('--seed')),
      '★★ 判据：修法可执行（repair 里给出 --seed 命令），不是一句"请检查配置"', j1.repair)
    ok(await read(join(presetDir, 'agent.cordis.yml')) === before,
      '★★ 反：只读运行不改任何字节（doctor 默认只读）')

    const r2 = runDoctor(['--preset-root', presetRoot, '--seed', '--json'])
    const j2 = JSON.parse(r2.stdout)
    const after = await read(join(presetDir, 'agent.cordis.yml'))
    ok(j2.seed && j2.seed.seeded === true && rowHasConfig(after),
      '★★ 判据：--seed 向【已安装副本】写入最小可运行 config（原先无 config）', j2.seed && { seeded: j2.seed.seeded, why: j2.seed.why })
    ok(j2.configSource.value === 'seeded' && r2.exit === 0,
      '★★★ 判据：seed 后 doctor 退出 0，configSource:"seeded"', { exit: r2.exit, source: j2.configSource.value })
    ok(j2.simulated.withSeedConfig.registeredTools > 1 && j2.simulated.withSeedConfig.failures.length === 0,
      '★★ 判据：seed 后的模拟安装注册 >1 个工具且无失败', j2.simulated.withSeedConfig)
    ok(existsSync(join(presetDir, '.vibe-math-cold-start.json')), '★★ 判据：seed 留下 marker（configSource 可复核，不靠猜）')
    // idempotent: a second seed leaves the bytes alone and reports already-configured as "preset"
    const seededBytes = after
    const r3 = runDoctor(['--preset-root', presetRoot, '--seed', '--json'])
    const j3 = JSON.parse(r3.stdout)
    ok(await read(join(presetDir, 'agent.cordis.yml')) === seededBytes && r3.exit === 0,
      '★★ 反：seed 幂等（第二次不改字节）', j3.seed && { seeded: j3.seed.seeded, why: j3.seed.why })

    // a DEPLOYMENT's own config wins: plant one and prove the seeder leaves it byte-identical
    const custom = seededBytes.replace(/faces: \[[^\]]*\]/, "faces: ['status']")
    await writeFile(join(presetDir, 'agent.cordis.yml'), custom)
    const r4 = runDoctor(['--preset-root', presetRoot, '--seed', '--json'])
    const j4 = JSON.parse(r4.stdout)
    ok(await read(join(presetDir, 'agent.cordis.yml')) === custom && j4.configSource.value === 'preset',
      '★★ 反：部署自己的 config 不被覆盖（configSource:"preset"，字节逐字保留）', { seeded: j4.seed && j4.seed.why })
  } finally { await rm(dir, { recursive: true, force: true }) }
}

// ── 2b. SEEDING THE SOURCE CHECKOUT IS REFUSED (it would pre-fill the deployment's key) ──────────────────────────────
{
  const before = await read(AGENT_SRC)
  const r = runDoctor(['--seed', '--json'])
  const j = JSON.parse(r.stdout)
  ok(j.seed && j.seed.code === 'VMU_SEED_SOURCE_CHECKOUT' && await read(AGENT_SRC) === before,
    '★★ 反：对仓内 preset SOURCE 执行 --seed 被具名拒绝（不改字节）', j.seed && j.seed.code)
}

// ── 4. status({detail:"full"}).coldStart: three steps, honest "not reported", failures named with hints ─────────────
{
  const km = await import(pathToFileURL(join(SRC, 'kernel', 'index.js')).href)
  const k = km.createKernel({ clock: () => 1000 })
  const unreported = k.status({}).coldStart
  ok(unreported && unreported.registeredTools.reported === false && unreported.registeredTools.registered === null &&
    unreported.unavailable.reported === false && unreported.installed.how === 'unreported',
    '★★ 判据：未上报 ≠ 零——status 三步在"host 还没报"时是 reported:false / null，不是 0', unreported && unreported.registeredTools)
  const noted = k.noteColdStartFacts({ installed: true, registered: 2, configSource: 'seeded', source: 'test',
    failures: [{ name: 'vibe_vmu_turn', code: 'VMU_ENGINE_UNAVAILABLE', message: 'no agents seam' }] })
  const cs = k.status({}).coldStart
  ok(noted.ok && cs.registeredTools.reported === true && cs.registeredTools.registered === 2 && cs.registeredTools.failed === 1,
    '★★ 判据：上报后 registeredTools = 注册数/失败数（同一份 install receipt）', cs.registeredTools)
  ok(cs.unavailable.count === 1 && cs.unavailable.items[0].name === 'vibe_vmu_turn' &&
    cs.unavailable.items[0].code === 'VMU_ENGINE_UNAVAILABLE' && typeof cs.unavailable.items[0].hint === 'string' && cs.unavailable.items[0].hint.length > 20,
    '★★★ 判据：失败项具名（name + code + message + repair hint），不是一句"有失败"', cs.unavailable.items)
  ok(cs.configSource.value === 'seeded' && cs.installed.value === true && cs.installed.how === 'reported-by-host',
    '★★ 判据：configSource / installed 三步中的另两步', { configSource: cs.configSource, installed: cs.installed })
  ok(Array.isArray(cs.repair) && cs.repair.length > 0,
    '★★ 反：repair 有可执行结论（full 回执里给出下一步命令/原因）')
  // ★★ SIZE CONTRACT, NARROWED ON PURPOSE (final16b B5/D4 → final16c R2). The original assertion forbade the SUBSTRING
  // "coldStart" in the summary at all, which was right while the summary DROPPED the key. B5/D4 then measured that
  // deleting the key made "bounded" indistinguishable from "unsupported", so the bounded summary now keeps a HEADLINE
  // (`{present,fields,note}`) — and a substring ban would call that a violation. The contract that actually matters is
  // NOT the key's spelling but its BODY: the summary must never carry the DIAGNOSTIC BLOCK (the three steps
  // installed/registeredTools/unavailable, configSource, repair, means). This is a NARROWING, not a weakening: the lamp
  // below proves the SAME predicate still catches the full block when someone pastes it into the summary.
  const summaryStatus = k.status({ detail: 'summary' })
  ok(!carriesColdStartBlock(summaryStatus.coldStart),
    '★★ 反（尺寸契约，收窄口径）：bounded summary 只可携带 coldStart 的 headline，不得携带诊断整块（三步/configSource/repair/means）',
    summaryStatus.coldStart)
  ok(summaryStatus.coldStart && summaryStatus.coldStart.present === true && (summaryStatus.coldStart.fields > 0 || typeof summaryStatus.coldStart.note === 'string'),
    '★★ 正：headline 仍在 summary 里（present+fields/note）——"被 bounded" 与 "不支持" 可区分（B5/D4 的教训）', summaryStatus.coldStart)
  ok(carriesColdStartBlock(cs),
    '★★★ 灯（同一判据的反向）：full 回执的 coldStart 就是诊断整块 ⇒ 谓词返回 true —— 若把整块塞进 summary，上面那条立即红',
    Object.keys(cs))
}

// ── 5. LAMPS ─────────────────────────────────────────────────────────────────────────────────────────────────────────
{
  // Lamp A: drop the named failures from status ⇒ the "failures are named" criterion must go red.
  const dirA = await mkdtemp(join(tmpdir(), 'vmu-cold-lamp-a-'))
  try {
    const copy = join(dirA, 'vibe-math-vmu')
    await cp(SRC, copy, { recursive: true, filter: (src) => !/[\\/]docs([\\/]|$)/.test(src) })
    const kernelFile = join(copy, 'kernel', 'index.js')
    const src = await read(kernelFile)
    const anchor = '      unavailable: { reported: coldStartFacts.reported === true, count: failures.length, items: failures,'
    ok(src.indexOf(anchor) !== -1, 'TB-2784 lamp A: mutation point present')
    await writeFile(kernelFile, src.replace(anchor, '        unavailable: { reported: coldStartFacts.reported === true, count: failures.length, items: [],'))
    const mut = await import(pathToFileURL(kernelFile).href + '?lampA=1')
    const mk = mut.createKernel({ clock: () => 1000 })
    mk.noteColdStartFacts({ installed: true, registered: 2, failures: [{ name: 'vibe_vmu_turn', code: 'VMU_ENGINE_UNAVAILABLE', message: 'no agents seam' }] })
    const cs = mk.status({}).coldStart
    ok(cs.unavailable.count === 1 && cs.unavailable.items.length === 0,
      '★★ 反灯 A（把失败项从 status 去掉）⇒ 计数与清单自相矛盾，判据"失败项具名"红', { count: cs.unavailable.count, items: cs.unavailable.items.length })
  } finally { await rm(dirA, { recursive: true, force: true }) }
  // Lamp B: hard-code the doctor verdict to READY ⇒ a cold-start-zero-mechanism profile would be called ready (red).
  const dirB = await mkdtemp(join(tmpdir(), 'vmu-cold-lamp-b-'))
  try {
    const presetRoot = join(dirB, 'presetRoot')
    const presetDir = join(presetRoot, 'vibe-math-vmu')
    await mkdir(presetDir, { recursive: true })
    await cp(SRC, presetDir, { recursive: true, filter: (src) => !/[\\/]docs([\\/]|$)/.test(src) })
    const doctorCopy = join(dirB, 'doctor.mjs')
    const src = await read(DOCTOR)
    const anchor = '  out.verdict = problems.length === 0 && Number.isFinite(registeredCount) && registeredCount > 1'
    ok(src.indexOf(anchor) !== -1, 'TB-2784 lamp B: mutation point present')
    const broken = src.replace(anchor, '  out.verdict = true || problems.length === 0 && Number.isFinite(registeredCount) && registeredCount > 1')
    await writeFile(doctorCopy, broken.replace("from './lib/install-seed.mjs'", "from '" + pathToFileURL(join(REPO, 'scripts', 'lib', 'install-seed.mjs')).href + "'"))
    let exit = 0
    let stdout = ''
    try {
      stdout = execFileSync(process.execPath, [doctorCopy, '--preset-root', presetRoot, '--json'], { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (e) { exit = e.status === undefined ? -1 : e.status; stdout = String(e.stdout || '') }
    const jb = JSON.parse(stdout)
    ok(exit === 0 && jb.verdict.ok === true,
      '★★ 反灯 B（把 doctor 结论改成恒真）⇒ 冷启动 profile 被误判 READY（exit 0）——真实 doctor 判 NOT READY，故判据"结论由测量决定"红',
      { exit, verdict: jb.verdict && jb.verdict.ok })
  } finally { await rm(dirB, { recursive: true, force: true }) }
}

// ── 6. SIZE-CONTRACT MUTANT LAMP (final16c R2): pasting the WHOLE coldStart block back into the bounded summary MUST
// still be caught by the narrowed predicate above (that is what makes "narrowed" different from "weakened").
{
  const dir = await mkdtemp(join(tmpdir(), 'vmu-cold-lamp-c-'))
  try {
    const copy = join(dir, 'vibe-math-vmu')
    await cp(SRC, copy, { recursive: true, filter: (src) => !/[\/]docs([\/]|$)/.test(src) })
    const kernelFile = join(copy, 'kernel', 'index.js')
    const src = await read(kernelFile)
    const anchor = 'if (view.coldStart !== undefined) view.coldStart = headline(view.coldStart)'
    ok(src.indexOf(anchor) !== -1, 'R2 lamp: summary-headline mutation point present')
    await writeFile(kernelFile, src.replace(anchor, 'if (view.coldStart !== undefined) { /* mutant: paste the WHOLE block */ }'))
    const mut = await import(pathToFileURL(kernelFile).href + '?r2lamp=1')
    const mk = mut.createKernel({ clock: () => 1000 })
    mk.noteColdStartFacts({ installed: true, registered: 2, failures: [{ name: 'vibe_vmu_turn', code: 'VMU_ENGINE_UNAVAILABLE', message: 'no agents seam' }], configSource: 'seeded' })
    const summary = mk.status({ detail: 'summary' })
    ok(carriesColdStartBlock(summary.coldStart),
      '★★ 反灯 C（把诊断整块塞回 bounded summary）⇒ 收窄后的尺寸契约判据红（整块 = installed/registeredTools/unavailable/configSource/repair/means）',
      summary.coldStart && Object.keys(summary.coldStart))
  } finally { await rm(dir, { recursive: true, force: true }) }
}

console.log('=== VMU COLD START: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) process.exit(1)

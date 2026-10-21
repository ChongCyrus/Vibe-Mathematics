// tests/audit-refusal-regressions.test.mjs — 轮 9 / 类 1 样板桶：环境面两条"已实现却无测试"的拒绝。
//
// 来源（第一遍审计）：§8.1 标注"已实现"、代码里有生产点、但**没有任何测试引用**的码共 71 条（30 桶）。
// 本文件做掉【最小的优先桶】之一：`VMU_ENV_NO_PROBE`（kernel/env.js:65）与 `VMU_ENV_PROBE_FAILED`
// （kernel/env.js:85），并带一条**反例**证明"接缝正常时不该拒"。
// 每一桶的最小回归样板＝"用真实的 createXxxFace 驱动到该拒绝分支，断言 code 相等"——不 mock 出 code，
// 因为那只会测试测试自己。
//
// Run: node tests/audit-refusal-regressions.test.mjs
import { mkdtempSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const VMU = join(HERE, '..', 'vibe-math-vmu')
const url = 'file:///' + VMU.replace(/\\/g, '/').replace(/ /g, '%20')
const { createEnvFace } = await import(url + '/kernel/env.js')

let passed = 0
let failed = 0
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + label) } else { failed += 1; console.error('  FAIL ' + label + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))) }
}
const root = mkdtempSync(process.env.TEMP_SLV_INSPECT || 'D:\\_tmp')

try {
  console.log('=== 桶 env（2 条）===')
  {
    // ① 声明了一个"没有 probe.command"的需求 ⇒ 具名 VMU_ENV_NO_PROBE（kernel/env.js:65）
    const env = createEnvFace({ settings: { 'vmu.env.needs': { zz_no_probe: { why: 'only a why, no probe command' } } } })
    const r = await env.probe({ need: 'zz_no_probe' })
    ok(r && r.ok === false && r.code === 'VMU_ENV_NO_PROBE', '★ VMU_ENV_NO_PROBE：需求没有 probe.command ⇒ 具名拒（kernel/env.js:65）', r && { ok: r.ok, code: r.code })
    ok(r && typeof r.message === 'string' && r.message.length > 0 && r.installCommand === null, '★ 且 message 非空、installCommand 不臆造（缺 probe 不等于缺安装命令）', r && r.message)
  }
  {
    // ② spawn 接缝抛错 ⇒ 具名 VMU_ENV_PROBE_FAILED（kernel/env.js:85）
    const env = createEnvFace({
      settings: { 'vmu.env.needs': { zz_throws: { probe: { command: 'definitely-not-a-real-command', args: [] } } } },
      spawn: async () => { throw new Error('seam exploded') },
    })
    const r = await env.probe({ need: 'zz_throws' })
    ok(r && r.ok === false && r.code === 'VMU_ENV_PROBE_FAILED', '★ VMU_ENV_PROBE_FAILED：spawn 接缝抛错 ⇒ 具名拒（kernel/env.js:85）', r && { ok: r.ok, code: r.code })
    ok(r && r.found === false && /seam exploded/.test(String(r.message || '')), '★ 且把接缝的错因带进回执（不吞异常）', r && r.message)
  }
  {
    // ③ 反例：接缝正常 ⇒ 不该拒（证明上面两条不是"永远拒"）
    const env = createEnvFace({
      settings: { 'vmu.env.needs': { zz_ok: { probe: { command: 'x', args: [] } } } },
      spawn: async () => ({ exitCode: 0, stdout: 'v1.2.3', stderr: '' }),
    })
    const r = await env.probe({ need: 'zz_ok' })
    ok(r && r.ok === true && !r.code, '★ 反：接缝正常 ⇒ ok:true 且无拒绝码（正反成对，非恒真）', r && { ok: r.ok, code: r.code })
  }
  console.log('')
  console.log('=== REFUSAL REGRESSIONS (env bucket): ' + passed + ' passed, ' + failed + ' failed ===')
} finally { rmSync(root, { recursive: true, force: true }) }
process.exit(failed === 0 ? 0 : 1)

// tests/fixtures/minimal-pack/index.js
// ★ TB-2618 可定义性夹具：一个「manifest + 1 个 handler」的整合包，用来证明「不改任何内核文件」也能定义
//   自己的阶段 / 记录轨道 / 会议类型 / 席位 / 一条策略。
//
// 用法（见 tests/vmu-run256-pack-declarations.test.mjs §5）：
//   entry.apply(ctx, { packs: [PACK], packManifests: [PACK] })
//   - packManifests 让声明在 createKernel 之前被 foldPackDeclarations() 折叠（构造期消费者才看得见）；
//   - packs 让包真的装载：middleware 的 handler 上总线（`vibe_vmu_pack {action:"apply"}` 的模块装载路径）。
//   同一个 manifest 同时出现在两处是刻意的最小形状：声明走构造期，行为走装载期，二者都由框架负责接上。
//
// 这个文件只有数据和一个 handler：没有 import、没有内核知识，也没有任何「回填内核」的动作。
export const HANDLER = async (envelope = {}) => ({ ok: true, pack: 'minimal-fixture', hook: envelope && envelope.hook })

export const PACK = {
  id: 'minimal-fixture',
  version: '1.0.0',
  phases: ['thesis-intake'],
  recordTracks: ['thesis'],
  meetingTypeCatalog: ['thesis-defense'],
  slots: [{ id: 'supervisor', title: '导师' }],
  middleware: [{ id: 'minimal-fixture-policy', on: 'turn/before', handler: HANDLER }],
}

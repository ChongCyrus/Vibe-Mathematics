// vibe-math-vmu/tools/retention.js — the retention tool spec (round 548).
export function makeRetentionSpec({ param, refused, TOOL_NAMES, kernel }) {
  return {
    name: TOOL_NAMES.retention,
    description: 'vmu 留存面（(h) 文件归档）：9 个动作。★ 配额、宽限与永久标记都由内核服务强制（★ 默认 dryRun ✓ —— 不会先删后说 ✓）；本工具只做寻址与调用（整对象透传 ✓）。',
    parameters: {
      action: param('string', 'apply｜gc｜plan｜purge｜quota｜refuse｜restore｜status｜trash', { required: true,
        enum: ['apply','gc','plan','purge','quota','refuse','restore','status','trash'] }),
      request: param('object', '非 id 动作的请求（形状由服务校验 ✓）'),
      id: param('string', 'trash／restore 的对象 id（★ 服务会给出可用示例 ✓）'),
    },
    run: async ({ action, request, id } = {}) => {
      try {
        const retention = kernel.retention
        if (action === 'apply') return Object.assign({ ok: true, action }, await retention.apply(request))
        if (action === 'gc') return Object.assign({ ok: true, action }, await retention.gc(request || {}))
        if (action === 'plan') return Object.assign({ ok: true, action }, await retention.plan(request || {}))
        if (action === 'purge') return Object.assign({ ok: true, action }, await retention.purge(request || {}))
        if (action === 'quota') return Object.assign({ ok: true, action }, await retention.quota(request || {}))
        if (action === 'refuse') return Object.assign({ ok: true, action }, await retention.refuse(request || {}))
        if (action === 'restore') return Object.assign({ ok: true, action }, await retention.restore({ ...(request || {}), ...(id !== undefined && id !== null ? { id } : {}) }))
        if (action === 'status') return Object.assign({ ok: true, action }, await retention.status(request || {}))
        if (action === 'trash') return Object.assign({ ok: true, action }, await retention.trash({ ...(request || {}), ...(id !== undefined && id !== null ? { id } : {}) }))
        return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
      } catch (e) {
        return refused(e.code || 'VMU_STATE', String(e.message), e.hint)
      }
    },
  }
}

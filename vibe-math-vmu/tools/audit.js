// vibe-math-vmu/tools/audit.js — the audit tool spec (round 554). The capability existed and was found by reading a
// document line that said only its tool name was missing; this is that tool.
export function makeAuditSpec({ param, refused, TOOL_NAMES, kernel }) {
  return {
    name: TOOL_NAMES.audit,
    description: 'vmu 审计面（(i) 评审与出版 ＋ 基础设施）：10 个动作。★ 脱敏、保留期与复算角色都由内核服务强制（★ `recount` 按【角色**]拒 ✓：`declared: office, chair` ✓）；★ 未标红的键不写（`redactKeys` ✓）；本工具只做寻址与调用（整对象透传 ✓）。',
    parameters: {
      action: param('string', 'append｜expire｜export｜exportScoped｜query｜recount｜rotate｜status｜tail｜verify', { required: true,
        enum: ['append','expire','export','exportScoped','query','recount','rotate','status','tail','verify'] }),
      request: param('object', '写动作与查询的请求（★ 形状由服务校验 ✓）'),
      id: param('string', '目标 id（可选；★ 需要时服务会具名索要 ✓）'),
    },
    run: async ({ action, request, id } = {}) => {
      try {
        const audit = kernel.audit
        if (action === 'append') return Object.assign({ ok: true, action }, await audit.append(request))
        if (action === 'expire') return Object.assign({ ok: true, action }, await audit.expire({ ...(request || {}), ...(id !== undefined && id !== null ? { id } : {}) }))
        if (action === 'export') return Object.assign({ ok: true, action }, await audit.export({ ...(request || {}) }))
        if (action === 'exportScoped') return Object.assign({ ok: true, action }, await audit.exportScoped({ ...(request || {}) }))
        if (action === 'query') return Object.assign({ ok: true, action }, await audit.query({ ...(request || {}), ...(id !== undefined && id !== null ? { id } : {}) }))
        if (action === 'recount') return Object.assign({ ok: true, action }, await audit.recount(request))
        if (action === 'rotate') return Object.assign({ ok: true, action }, await audit.rotate(request))
        if (action === 'status') return Object.assign({ ok: true, action }, await audit.status({ ...(request || {}), ...(id !== undefined && id !== null ? { id } : {}) }))
        if (action === 'tail') return Object.assign({ ok: true, action }, await audit.tail({ ...(request || {}), ...(id !== undefined && id !== null ? { id } : {}) }))
        if (action === 'verify') return Object.assign({ ok: true, action }, await audit.verify({ ...(request || {}), ...(id !== undefined && id !== null ? { id } : {}) }))
        return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
      } catch (e) {
        return refused(e.code || 'VMU_STATE', String(e.message), e.hint)
      }
    },
  }
}

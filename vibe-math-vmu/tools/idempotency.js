// vibe-math-vmu/tools/idempotency.js — the idempotency tool spec (round 550).
export function makeIdempotencySpec({ param, refused, TOOL_NAMES, kernel }) {
  return {
    name: TOOL_NAMES.idempotency,
    description: 'vmu 幂等面（(f) 工作流）：12 个动作。★ 键、窗口与重放判定都由内核服务强制（★ 重复执行【不产生二次效果**]✓）；本工具只做寻址与调用（整对象透传 ✓）。',
    parameters: {
      action: param('string', 'abort｜begin｜commit｜durable｜fingerprintOf｜history｜list｜lookup｜persist｜reap｜reload｜status', { required: true,
        enum: ['abort','begin','commit','durable','fingerprintOf','history','list','lookup','persist','reap','reload','status'] }),
      request: param('object', '写动作的请求（形状由服务校验 ✓）'),
      id: param('string', '目标 id（可选；★ 需要时服务会具名索要 ✓）'),
    },
    run: async ({ action, request, id } = {}) => {
      try {
        const idempotency = kernel.idempotency
        if (action === 'abort') return Object.assign({ ok: true, action }, await idempotency.abort({ ...(request || {}), ...(id !== undefined && id !== null ? { id } : {}) }))
        if (action === 'begin') return Object.assign({ ok: true, action }, await idempotency.begin({ ...(request || {}), ...(id !== undefined && id !== null ? { id } : {}) }))
        if (action === 'commit') return Object.assign({ ok: true, action }, await idempotency.commit({ ...(request || {}), ...(id !== undefined && id !== null ? { id } : {}) }))
        if (action === 'durable') return Object.assign({ ok: true, action }, await idempotency.durable({ ...(request || {}), ...(id !== undefined && id !== null ? { id } : {}) }))
        if (action === 'fingerprintOf') return Object.assign({ ok: true, action }, await idempotency.fingerprintOf({ ...(request || {}), ...(id !== undefined && id !== null ? { id } : {}) }))
        if (action === 'history') return Object.assign({ ok: true, action }, await idempotency.history({ ...(request || {}), ...(id !== undefined && id !== null ? { id } : {}) }))
        if (action === 'list') return Object.assign({ ok: true, action }, await idempotency.list({ ...(request || {}), ...(id !== undefined && id !== null ? { id } : {}) }))
        if (action === 'lookup') return Object.assign({ ok: true, action }, await idempotency.lookup({ ...(request || {}), ...(id !== undefined && id !== null ? { id } : {}) }))
        if (action === 'persist') return Object.assign({ ok: true, action }, await idempotency.persist({ ...(request || {}), ...(id !== undefined && id !== null ? { id } : {}) }))
        if (action === 'reap') return Object.assign({ ok: true, action }, await idempotency.reap({ ...(request || {}), ...(id !== undefined && id !== null ? { id } : {}) }))
        if (action === 'reload') return Object.assign({ ok: true, action }, await idempotency.reload({ ...(request || {}), ...(id !== undefined && id !== null ? { id } : {}) }))
        if (action === 'status') return Object.assign({ ok: true, action }, await idempotency.status({ ...(request || {}), ...(id !== undefined && id !== null ? { id } : {}) }))
        return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
      } catch (e) {
        return refused(e.code || 'VMU_STATE', String(e.message), e.hint)
      }
    },
  }
}

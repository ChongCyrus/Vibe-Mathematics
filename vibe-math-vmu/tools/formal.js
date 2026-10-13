// vibe-math-vmu/tools/formal.js — the formal tool spec (round 540). This is the FORMALISATION face, and it is deliberately the
// one thin tool that forwards WHOLE request objects rather than unpacking them: `check` and `axioms` take the service's own
// shapes, and the service refuses by name when a seam is missing rather than pretending a proof compiled.
export function makeFormalSpec({ param, refused, TOOL_NAMES, kernel }) {
  return {
    name: TOOL_NAMES.formal,
    description: 'vmu 形式化面（★ **(b) 形式化** ✓）：action=check|axioms|sorryReport|artifacts|reproduce|list|status|keysUsed|config|trail。' +
      '★ 服务的硬不变式（★ 本工具**原样透传、不复制** ✓）：★ `spawn` 未注入 ⇒ **具名拒、不假装编译过** ✗；★ `sorry` ⇒ **默认拒并点名行列** ✓；' +
      '★ 白名单外公理 ⇒ 点名拒 ✓；★★ **"编译失败 ≠ 命题为假"** ⇒ 回执给 `verdict=\'undecided\'` ✓。',
    parameters: {
      action: param('string', 'check｜axioms｜sorryReport｜artifacts｜reproduce｜list｜status｜keysUsed｜config｜trail', { required: true,
        enum: ['check', 'axioms', 'sorryReport', 'artifacts', 'reproduce', 'list', 'status', 'keysUsed', 'config', 'trail'] }),
      request: param('object', 'check 的请求（★ 形状由服务校验 ✓：★ 含源、目标与 argv 等 ✓）'),
      query: param('object', 'axioms 的查询（可选；★ 形状由服务决定 ✓）'),
      id: param('string', 'artifacts／reproduce 的目标 id（可选）'),
    },
    run: async ({ action, request, query, id } = {}) => {
      try {
        const formal = kernel.formal
        if (action === 'check') return Object.assign({ ok: true, action }, await formal.check(request))
        if (action === 'axioms') return Object.assign({ ok: true, action }, await formal.axioms(query))
        if (action === 'sorryReport') return Object.assign({ ok: true, action }, await formal.sorryReport())
        if (action === 'artifacts') return Object.assign({ ok: true, action }, await formal.artifacts(id))
        if (action === 'reproduce') return Object.assign({ ok: true, action }, await formal.reproduce(id))
        if (action === 'list') return Object.assign({ ok: true, action }, await formal.list())
        if (action === 'status') return Object.assign({ ok: true, action }, await formal.status())
        if (action === 'keysUsed') return Object.assign({ ok: true, action }, { keysUsed: await formal.keysUsed() })
        if (action === 'config') return Object.assign({ ok: true, action }, await formal.config())
        if (action === 'trail') return Object.assign({ ok: true, action }, { trail: await formal.trail() })
        return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
      } catch (e) {
        return refused(e.code || 'VMU_STATE', String(e.message), e.hint)
      }
    },
  }
}

// vibe-math-vmu/tools/citations.js — the citations tool spec, split out of host.js (round 538) so the host file stays
// inside the DECIDED 1200-line limit (docs/02). The spec is a factory: host.js supplies the shared helpers, and the guard
// condition stays in host.js, because which intent declares a tool is policy and policy belongs with the host.
export function makeCitationsSpec({ param, refused, TOOL_NAMES, kernel }) {
  return {
      name: TOOL_NAMES.citations,
      description: 'vmu 引用面：action=identify|validate|render|status。' +
        '标识符优先级、必填字段与渲染样式都由内核服务强制；本工具只做**寻址与调用**，不复制任何策略。',
      parameters: {
        action: param('string', 'identify｜validate｜render｜status', { required: true,
          enum: ['identify', 'validate', 'render', 'status'] }),
        ids: param('object', '标识符表（identify 用；★ 优先级见服务自己的 idPriority ✓）'),
        title: param('string', '标题（validate/render 用）'),
        authors: param('array', '作者列表（validate/render 用）'),
        year: param('number', '年份（validate/render 用）'),
        freeText: param('string', '自由文本条目（validate/render 用；★ 是否允许由服务自己的 allowFreeText 决定 ✓）'),
        style: param('string', '渲染样式（render 用；★ 默认见服务自己的 style ✓）'),
      },
      run: async ({ action, ids, title, authors, year, freeText, style } = {}) => {
        try {
          const citations = kernel.citations
          if (action === 'identify') return Object.assign({ ok: true, action }, await citations.identify({ ids }))
          if (action === 'validate') return Object.assign({ ok: true, action }, await citations.validate({ title, authors, year, ids, freeText }))
          if (action === 'render') return Object.assign({ ok: true, action }, await citations.render({ title, authors, year, ids, freeText, style }))
          if (action === 'status') return Object.assign({ ok: true, action }, await citations.status())
          return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
        } catch (e) {
          return refused(e.code || 'VMU_STATE', String(e.message), e.hint)
        }
      },
  }
}

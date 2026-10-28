// vibe-math-vmu/tools/mathtools.js — the mathtools tool spec, split out of host.js (round 538) so the host file stays
// inside the DECIDED 1200-line limit (docs/02). The spec is a factory: host.js supplies the shared helpers, and the guard
// condition stays in host.js, because which intent declares a tool is policy and policy belongs with the host.
export function makeMathtoolsSpec({ param, refused, TOOL_NAMES, kernel }) {
  return {
      name: TOOL_NAMES.mathtools,
      description: 'vmu 数学工具面：action=plan|run|cacheMarkCorrupt|cacheView|receiptsView|status。' +
        '沙箱上限、缓存与回执都由内核服务强制；本工具只做**寻址与调用**，不复制任何策略（★ `op` 的取值与参数形状由接缝校验，本工具不另行发明运算名 —— 当前接缝是 `math_computation`，它认 op: probe|run|receipt|install 加 mode: code|file|expr + engine/code/file/expr；接缝的拒绝会原样带回它的 code/message/hint ✓）。',
      parameters: {
        action: param('string', 'plan｜run｜cacheMarkCorrupt｜cacheView｜receiptsView｜status', { required: true,
          enum: ['plan', 'run', 'cacheMarkCorrupt', 'cacheView', 'receiptsView', 'status'] }),
        op: param('string', '运算名（plan/run 必填；★ 例见服务自己的 hint ✓）'),
        args: param('object', '运算参数（plan/run 可选；★ 形状由服务决定 ✓）'),
        cacheKey: param('string', '缓存键（cacheMarkCorrupt 必填；★ 可从回执的 `cacheKey` 取 ✓）'),
      },
      run: async ({ action, op, args, cacheKey } = {}) => {
        try {
          const mathtools = kernel.mathtools
          if (action === 'plan') return Object.assign({ ok: true, action }, await mathtools.plan({ op, args }))
          if (action === 'run') return Object.assign({ ok: true, action }, await mathtools.run({ op, args }))
          if (action === 'cacheMarkCorrupt') return Object.assign({ ok: true, action }, await mathtools.cacheMarkCorrupt({ cacheKey }))
          if (action === 'cacheView') return Object.assign({ ok: true, action }, await mathtools.cacheView())
          if (action === 'receiptsView') return Object.assign({ ok: true, action }, await mathtools.receiptsView())
          if (action === 'status') return Object.assign({ ok: true, action }, await mathtools.status())
          return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
        } catch (e) {
          return refused(e.code || 'VMU_STATE', String(e.message), e.hint)
        }
      },
  }
}

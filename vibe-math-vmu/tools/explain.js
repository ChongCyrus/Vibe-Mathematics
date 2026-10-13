// vibe-math-vmu/tools/explain.js — the explain tool spec, split out of host.js (round 538) so the host file stays
// inside the DECIDED 1200-line limit (docs/02). The spec is a factory: host.js supplies the shared helpers, and the guard
// condition stays in host.js, because which intent declares a tool is policy and policy belongs with the host.
export function makeExplainSpec({ param, refused, TOOL_NAMES, kernel }) {
  return {
      name: TOOL_NAMES.explain,
      description: 'vmu 解释面：action=checkReason|correlate|build|render|status。' +
        '「这一步为什么发生」由内核服务回答：理由必填、按 traceId/taskId 关联、报表由它构建与渲染；本工具只做**寻址与调用**，不复制任何策略。',
      parameters: {
        action: param('string', 'checkReason｜correlate｜build｜render｜status', { required: true,
          enum: ['checkReason', 'correlate', 'build', 'render', 'status'] }),
        reason: param('string', '理由（checkReason/build 用；★ 服务的 reasonRequired 会强制它 ✓）'),
        targetAction: param('string', '要解释或被检查的那个动作（★ 转交给服务的 `action` 形参 ✓；本工具的 action 是分派器）'),
        traceId: param('string', '关联用的 trace id（correlate/build 用；★ 关联轴由服务的 correlateBy 决定 ✓）'),
        taskId: param('string', '关联用的任务 id（可选）'),
        chains: param('boolean', 'build 是否含链（可选）'),
        scores: param('boolean', 'build 是否含评分（可选）'),
        fields: param('array', 'build 的字段选择（可选）'),
        report: param('object', 'render 的报表（★ build 的产物 ✓）'),
        format: param('string', 'render 的格式（可选；★ 默认见服务 ✓）'),
      },
      run: async ({ action, reason, targetAction, traceId, taskId, chains, scores, fields, report, format } = {}) => {
        try {
          const explain = kernel.explain
          if (action === 'checkReason') return Object.assign({ ok: true, action }, await explain.checkReason({ reason, action: targetAction || null }))
          if (action === 'correlate') return Object.assign({ ok: true, action }, await explain.correlate({ traceId, taskId }))
          if (action === 'build') return Object.assign({ ok: true, action }, await explain.build({ action: targetAction || null, reason, traceId, taskId, chains, scores, fields }))
          if (action === 'render') return Object.assign({ ok: true, action }, await explain.render({ report, format }))
          if (action === 'status') return Object.assign({ ok: true, action }, await explain.status())
          return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
        } catch (e) {
          return refused(e.code || 'VMU_STATE', String(e.message), e.hint)
        }
      },
  }
}

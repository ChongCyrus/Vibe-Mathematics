// vibe-math-vmu/tools/transaction.js — the transaction tool spec, split out of host.js (round 537) so the host file stays
// inside the DECIDED 1200-line limit (docs/02). The spec is a factory: host.js supplies the shared helpers, and the guard
// condition stays in host.js, because which intent declares a tool is policy and policy belongs with the host.
export function makeTransactionSpec({ param, refused, TOOL_NAMES, kernel }) {
  return {
      name: TOOL_NAMES.transaction,
      description: 'vmu 事务面：action=begin|run|status|list|history|compensate。' +
        '步骤与补偿由内核服务强制（★ 失败时【补偿**]而不是静默 ✓）；本工具只做**寻址与调用**，不复制任何策略。',
      parameters: {
        action: param('string', 'begin｜run｜status｜list｜history｜compensate', { required: true,
          enum: ['begin', 'run', 'status', 'list', 'history', 'compensate'] }),
        id: param('string', '事务 id（begin／run／compensate 必填；★ 服务会给出可用示例 ✓）'),
        steps: param('array', 'begin 的步骤（★ 形状由服务决定 ✓）'),
      },
      run: async ({ action, id, steps } = {}) => {
        try {
          const transaction = kernel.transaction
          if (action === 'begin') return Object.assign({ ok: true, action }, await transaction.begin({ id, steps }))
          if (action === 'run') return Object.assign({ ok: true, action }, await transaction.run({ id }))
          if (action === 'status') return Object.assign({ ok: true, action }, await transaction.status())
          if (action === 'list') return Object.assign({ ok: true, action }, await transaction.list())
          if (action === 'history') return Object.assign({ ok: true, action }, await transaction.history())
          if (action === 'compensate') return Object.assign({ ok: true, action }, await transaction.compensate({ id }))
          return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
        } catch (e) {
          return refused(e.code || 'VMU_STATE', String(e.message), e.hint)
        }
      },
    }
}

// vibe-math-vmu/tools/projmigrate.js — the projmigrate tool spec, split out of host.js (round 538) so the host file stays
// inside the DECIDED 1200-line limit (docs/02). The spec is a factory: host.js supplies the shared helpers, and the guard
// condition stays in host.js, because which intent declares a tool is policy and policy belongs with the host.
export function makeProjmigrateSpec({ param, refused, TOOL_NAMES, kernel }) {
  return {
      name: TOOL_NAMES.projmigrate,
      description: 'vmu 迁移面：action=register|read|upgrade|status。' +
        '未知版本必须具名拒、迁移步骤必须显式声明 —— 这两条不变式由内核服务守着；本工具只做**寻址与调用**，不复制任何策略。',
      parameters: {
        action: param('string', 'register｜read｜upgrade｜status', { required: true,
          enum: ['register', 'read', 'upgrade', 'status'] }),
        kind: param('string', '迁移家族名（register/read/upgrade 必填；★ 服务自己的码会点名它 ✓）'),
        version: param('number', 'register 的当前版本号'),
        migrate: param('array', 'register 的迁移步骤（★ 必须显式 ✓）'),
        doc: param('object', 'read/upgrade 的文档'),
        to: param('number', 'upgrade 的目标版本'),
      },
      run: async ({ action, kind, version, migrate, doc, to } = {}) => {
        try {
          const projmigrate = kernel.projmigrate
          if (action === 'register') return Object.assign({ ok: true, action }, await projmigrate.register({ kind, version, migrate }))
          if (action === 'read') return Object.assign({ ok: true, action }, await projmigrate.read({ kind, doc }))
          if (action === 'upgrade') return Object.assign({ ok: true, action }, await projmigrate.upgrade({ kind, doc, to }))
          if (action === 'status') return Object.assign({ ok: true, action }, await projmigrate.status())
          return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
        } catch (e) {
          return refused(e.code || 'VMU_STATE', String(e.message), e.hint)
        }
      },
  }
}

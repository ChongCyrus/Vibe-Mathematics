// vibe-math-vmu/tools/topology.js — the topology tool spec (round 539). This is the AGENT SELF-ORGANISATION face: the service
// selects among organisation shapes (flat, star, committee, market, pipeline, swarm, ...) and reports zeroMechanism when none
// is declared, which is the framework's default everywhere.
export function makeTopologySpec({ param, refused, TOOL_NAMES, kernel }) {
  return {
    name: TOOL_NAMES.topology,
    description: 'vmu 组织拓扑面（★ **代理自组织** ✓）：action=select|describe|route|assert|list|status。' +
      '★ 拓扑的取向与路由都由内核服务强制（★ 零配置下 `zeroMechanism:true` ✓）；本工具只做**寻址与调用**，不复制任何策略。',
    parameters: {
      action: param('string', 'select｜describe｜route｜assert｜list｜status', { required: true,
        enum: ['select', 'describe', 'route', 'assert', 'list', 'status'] }),
      kind: param('string', '拓扑名（select／describe 必填；★ 可用值见 `list` ✓）'),
      from: param('string', 'route 的发起方（可选）'),
      to: param('string', 'route 的接收方（可选）'),
      subject: param('string', 'route／assert 的主题（可选）'),
    },
    run: async ({ action, kind, from, to, subject } = {}) => {
      try {
        const topology = kernel.topology
        if (action === 'select') return Object.assign({ ok: true, action }, await topology.select({ kind }))
        if (action === 'describe') return Object.assign({ ok: true, action }, await topology.describe({ kind }))
        if (action === 'route') return Object.assign({ ok: true, action }, await topology.route({ from, to, subject }))
        if (action === 'assert') return Object.assign({ ok: true, action }, await topology.assert({ subject }))
        if (action === 'list') return Object.assign({ ok: true, action }, await topology.list())
        if (action === 'status') return Object.assign({ ok: true, action }, await topology.status())
        return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
      } catch (e) {
        return refused(e.code || 'VMU_STATE', String(e.message), e.hint)
      }
    },
  }
}

// vibe-math-vmu/tools/governance.js — the governance tool spec, split out of host.js (round 538) so the host file stays
// inside the DECIDED 1200-line limit (docs/02). The spec is a factory: host.js supplies the shared helpers, and the guard
// condition stays in host.js, because which intent declares a tool is policy and policy belongs with the host.
export function makeGovernanceSpec({ param, refused, TOOL_NAMES, kernel }) {
  return {
      name: TOOL_NAMES.governance,
      description: 'vmu 治理面：action=keysUsed|config|droppedEvents。' +
        '议程/动议读了哪些设置、解析出来的配置是什么、有多少事件因未声明而被丢弃，全部由内核服务回答；本工具只做**寻址与调用**，不复制任何策略。',
      parameters: {
        action: param('string', 'keysUsed｜config｜droppedEvents', { required: true,
          enum: ['keysUsed', 'config', 'droppedEvents'] }),
      },
      run: async ({ action } = {}) => {
        try {
          const governance = kernel.governance
          if (action === 'keysUsed') return Object.assign({ ok: true, action }, { keysUsed: await governance.keysUsed() })
          if (action === 'config') return Object.assign({ ok: true, action }, { config: await governance.config() })
          if (action === 'droppedEvents') return Object.assign({ ok: true, action }, { droppedEvents: await governance.droppedEvents() })
          return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
        } catch (e) {
          return refused(e.code || 'VMU_STATE', String(e.message), e.hint)
        }
      },
  }
}

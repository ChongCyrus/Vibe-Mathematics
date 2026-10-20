// vibe-math-vmu/tools/member-tools.js — PHASE 8 / B-1: the FRAMEWORK'S OWN introspection tool.
//
// WHY THIS IS KERNEL-SIDE: "what can this member call right now?" is answered by the kernel's tool table plus the
// visible-tools provider (`turn.visibleToolsOf`); it is not an institution's vocabulary. The pack alias
// `vibe_v5_tool_help` becomes a thin forwarder to this same reading (B-1), not a second implementation.
//
// SOURCE OF TRUTH: names come from the LIVE provider only. No live Agent ⇒ the provider's named refusal propagates;
// this face never returns an empty list and calls it success. Purposes come from the host's published descriptions,
// registered with `kernel.setToolFaceDescriptions`; an unregistered name gets `purpose:null` rather than an invented one.
export function makeMemberToolsSpec({ param, refused, TOOL_NAMES, kernel }) {
  return {
    name: TOOL_NAMES.memberTools,
    description: '本成员此刻【真实可见】的工具表：名字来自内核的 visible-tools provider（不是 pack 声明），每项附一句用途。只读。无 live Agent ⇒ 具名拒。',
    parameters: {
      member: param('string', '成员 id（必填；没有 live Agent 的成员会被具名拒，而不是返回空表）', { required: true }),
    },
    // ★ tools/ 下每个面都写成 `run: async ({ … } = {}, exec) => …`，本面也一样 —— 校验工具参数形状的门禁
    // 读的就是这个签名（units: vmu-tools-action-arity）。本面是**单用途**（没有 action/op），所以它只解构 `member`。
    run: async ({ member: memberId } = {}, exec = null) => {
      const args = { member: memberId }
      const member = typeof args.member === 'string' ? args.member : ''
      if (!member) return refused('VMU_INVALID_ARGUMENT', 'vibe_vmu_tools needs member', 'pass member:"<roster id>"')
      if (!kernel || typeof kernel.toolsView !== 'function') {
        return refused('VMU_ENGINE_UNAVAILABLE', 'this kernel has no toolsView reader',
          'assemble a kernel with the visible-tools provider (host adapter)')
      }
      return kernel.toolsView({ member })
    },
  }
}

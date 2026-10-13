// vibe-math-vmu/tools/auditchain.js — the auditchain tool spec, split out of host.js (round 538) so the host file stays
// inside the DECIDED 1200-line limit (docs/02). The spec is a factory: host.js supplies the shared helpers, and the guard
// condition stays in host.js, because which intent declares a tool is policy and policy belongs with the host.
export function makeAuditchainSpec({ param, refused, TOOL_NAMES, kernel }) {
  return {
      name: TOOL_NAMES.auditchain,
      description: 'vmu 审计链面：action=append|verifyChain|link|checkpoint|status|refresh。' +
        '★ **这是一条真的哈希链**（`prevHash`／`hash`／`GENESIS` ✓）：追加、校验、锚定与检查点都由内核服务强制；本工具只做**寻址与调用**，不复制任何策略。',
      parameters: {
        action: param('string', 'append｜verifyChain｜link｜checkpoint｜status｜refresh', { required: true,
          enum: ['append', 'verifyChain', 'link', 'checkpoint', 'status', 'refresh'] }),
        entry: param('object', 'append 的条目（可选；★ 形状由服务决定 ✓）'),
        seq: param('number', 'checkpoint／link 的序号（可选）'),
        note: param('string', 'checkpoint 的备注（可选）'),
        key: param('string', 'refresh 的键（可选）'),
      },
      run: async ({ action, entry, seq, note, key } = {}) => {
        try {
          const auditchain = kernel.auditchain
          if (action === 'append') return Object.assign({ ok: true, action }, await auditchain.append({ entry }))
          if (action === 'verifyChain') return Object.assign({ ok: true, action }, await auditchain.verifyChain())
          if (action === 'link') return Object.assign({ ok: true, action }, { link: await auditchain.link({ seq }) })
          if (action === 'checkpoint') return Object.assign({ ok: true, action }, await auditchain.checkpoint({ seq, note }))
          if (action === 'status') return Object.assign({ ok: true, action }, await auditchain.status())
          if (action === 'refresh') return Object.assign({ ok: true, action }, await auditchain.refresh({ key }))
          return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
        } catch (e) {
          return refused(e.code || 'VMU_STATE', String(e.message), e.hint)
        }
      },
  }
}

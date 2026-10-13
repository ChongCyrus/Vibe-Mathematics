// vibe-math-vmu/tools/custody.js — the custody tool spec (round 538). It is the first tool written directly in the new
// structure: one module exporting a factory, plus one line in host.js.
export function makeCustodySpec({ param, refused, TOOL_NAMES, kernel }) {
  return {
    name: TOOL_NAMES.custody,
    description: 'vmu 保管链面：action=registerEntry|transfer|storageCycle|destroy|chainOf|status。' +
      '转移、储存周期与销毁都由内核服务强制（★ 保管链可查 ✓，★ 账本目录由策略决定 ✓）；本工具只做**寻址与调用**，不复制任何策略。',
    parameters: {
      action: param('string', 'registerEntry｜transfer｜storageCycle｜destroy｜chainOf｜status', { required: true,
        enum: ['registerEntry', 'transfer', 'storageCycle', 'destroy', 'chainOf', 'status'] }),
      pseudonym: param('string', 'registerEntry 必填的化名（★ 服务只收化名，不收真实身份 ✓）'),
      entry: param('string', '条目标识（transfer／storageCycle／destroy／chainOf 必填）'),
      to: param('string', 'transfer 的接收方（可选）'),
      note: param('string', '备注（可选）'),
    },
    run: async ({ action, pseudonym, entry, to, note } = {}) => {
      try {
        const custody = kernel.custody
        if (action === 'registerEntry') return Object.assign({ ok: true, action }, await custody.registerEntry({ pseudonym, note }))
        if (action === 'transfer') return Object.assign({ ok: true, action }, await custody.transfer({ entry, to, note }))
        if (action === 'storageCycle') return Object.assign({ ok: true, action }, await custody.storageCycle({ entry, note }))
        if (action === 'destroy') return Object.assign({ ok: true, action }, await custody.destroy({ entry, note }))
        if (action === 'chainOf') return Object.assign({ ok: true, action }, await custody.chainOf({ entry }))
        if (action === 'status') return Object.assign({ ok: true, action }, await custody.status())
        return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
      } catch (e) {
        return refused(e.code || 'VMU_STATE', String(e.message), e.hint)
      }
    },
  }
}

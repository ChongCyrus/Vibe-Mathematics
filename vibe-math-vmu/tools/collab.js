// vibe-math-vmu/tools/collab.js — the collab tool spec (round 541). One module plus one line in the host.
export function makeCollabSpec({ param, refused, TOOL_NAMES, kernel }) {
  return {
    name: TOOL_NAMES.collab,
    description: 'vmu 协作面（★ **(e) 代理间协作** ✓）：action=addCounterparty|openAgreement|signAgreement|reviewAgreement|exchange|settle|authorship|agreements|status。★ 协议、签署与结算都由内核服务强制（★ 策略 `agreementRequired:true` ✓ —— 没有协议就不能交换 ✗）；本工具只做**寻址与调用**，不复制任何策略。',
    parameters: {
      action: param('string', 'addCounterparty｜openAgreement｜signAgreement｜reviewAgreement｜exchange｜settle｜authorship｜agreements｜status', { required: true,
        enum: ['addCounterparty','openAgreement','signAgreement','reviewAgreement','exchange','settle','authorship','agreements','status'] }),
      name: param('string', 'addCounterparty 必填的名字（★ 服务会回可用示例 ✓）'),
      counterparty: param('string', '协议／交换的对方（openAgreement／exchange 必填）'),
      agreement: param('string', '协议 id（signAgreement／reviewAgreement／settle／authorship 必填）'),
      terms: param('object', '协议条款（可选；★ 形状由服务决定 ✓）'),
      resource: param('string', 'exchange 的资源名（可选）'),
    },
    run: async ({ action, name, counterparty, agreement, terms, resource } = {}) => {
      try {
        const collab = kernel.collab
        if (action === 'addCounterparty') return Object.assign({ ok: true, action }, await collab.addCounterparty({ name }))
        if (action === 'openAgreement') return Object.assign({ ok: true, action }, await collab.openAgreement({ counterparty, terms }))
        if (action === 'signAgreement') return Object.assign({ ok: true, action }, await collab.signAgreement({ agreement }))
        if (action === 'reviewAgreement') return Object.assign({ ok: true, action }, await collab.reviewAgreement({ agreement }))
        if (action === 'exchange') return Object.assign({ ok: true, action }, await collab.exchange({ counterparty, resource }))
        if (action === 'settle') return Object.assign({ ok: true, action }, await collab.settle({ agreement }))
        if (action === 'authorship') return Object.assign({ ok: true, action }, await collab.authorship({ agreement }))
        if (action === 'agreements') return Object.assign({ ok: true, action }, await collab.agreements())
        if (action === 'status') return Object.assign({ ok: true, action }, await collab.status())
        return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
      } catch (e) {
        return refused(e.code || 'VMU_STATE', String(e.message), e.hint)
      }
    },
  }
}

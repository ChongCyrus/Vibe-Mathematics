/**
 * packs/v5r/reply-field-adapters.js — THE V5R REPLY-FIELD ADAPTERS (TB-2794 Step 2).
 *
 * WHY THEY LIVE HERE: `formal` was the last reply field whose taught shape was enforced by a kernel adapter
 * (the kernel's former `formalCheckArgs`). The field itself is INSTITUTION vocabulary (a v5r member writes `formal:{statement,proof}` and the
 * institute turns it into a formal-check call), so both the declaration (`runtime.json replyFields`) and the adapter move
 * to the pack. The kernel keeps only the generic seam: a field may declare `adapter:"<name>"`, the pack supplies the
 * function via `PACK.replyFieldAdapters`, and dispatch resolves it at call time
 * (`VMU_TURN_FIELD_ADAPTER_NOT_WIRED` when the pack is not mounted).
 *
 * The adapter contract — unchanged from RUN 191: {ok:true,args:[…]} dispatches; {ok:false,reason,code,message,hint}
 * SKIPS the field by name and keeps the rest of the turn. `ctx.describeShape` is provided by the dispatcher so this file
 * never imports kernel code (a pack is a consumer of the framework, not its reverse).
 */
export function formalCheckPayload(payload, ctx = {}) {
  const describe = typeof ctx.describeShape === 'function' ? ctx.describeShape : (v) => (v === null ? 'null' : typeof v)
  const hint = 'send { formal: { statement: "<命题原文>", proof: "<Lean 证明脚本正文>" } } — the field dispatches to the formal-check service, whose real arguments are statement and proof (allowSorry optional); {decision,file,note} is a CARD, not a proof script, and this field cannot carry it'
  const missing = []
  const problems = []
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    missing.push('statement', 'proof')
    problems.push('the field holds ' + describe(payload) + ' instead of an object')
  } else {
    if (typeof payload.statement !== 'string' || payload.statement.trim() === '') {
      missing.push('statement')
      problems.push('statement is ' + describe(payload.statement))
    }
    if (typeof payload.proof !== 'string' || payload.proof.trim() === '') {
      missing.push('proof')
      problems.push('proof is ' + describe(payload.proof))
    }
    const extra = Object.keys(payload).filter((k) => ['statement', 'proof', 'allowSorry'].indexOf(k) < 0)
    if (extra.length) {
      const cardish = extra.some((k) => ['decision', 'file', 'note'].indexOf(k) >= 0)
      problems.push(cardish
        ? 'it also carries ' + extra.join(', ') + ' — that is the shape of a formalisation CARD ({decision,file,note}), and a card is not a proof script: the face reads statement and proof'
        : 'unknown key(s) ' + extra.join(', ') + ' (accepted: statement, proof, allowSorry)')
    }
  }
  if (missing.length) {
    return { ok: false, reason: 'formal-shape', code: 'VMU_MATH_INVALID_INPUT', missing,
      message: 'the formal reply field cannot be dispatched: ' + problems.join('; '), hint }
  }
  const args = { statement: payload.statement, proof: payload.proof }
  if (payload.allowSorry !== undefined) args.allowSorry = payload.allowSorry
  return { ok: true, args: [args] }
}

/** The manifest contribution: `PACK.replyFieldAdapters` (see kernel/pack.js apply → kernel.registerReplyFieldAdapter). */
export const V5R_REPLY_FIELD_ADAPTERS = Object.freeze([
  Object.freeze({ name: 'v5r-formal-check', adapt: formalCheckPayload }),
])

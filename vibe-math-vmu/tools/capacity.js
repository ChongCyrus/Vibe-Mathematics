// vibe-math-vmu/tools/capacity.js — the capacity tool spec.
//
// ★★★★★★★ ROUND 83 — THE ACTION SET IS NOW DERIVED FROM THE SERVICE, NOT HAND-LISTED BESIDE IT. This face stated its own
// contract in one line: it ADDRESSES and CALLS, and the service enforces everything ("本工具只做寻址与调用（整对象透传 ✓）").
// The implementation had drifted away from that in four separate ways, all of them invisible while the tool merely
// registered:
//   * a `retire` branch called `capacity.retire`, a method the service does not have - so a real run answered with the
//     ENGINE'S OWN message ("capacity.retire is not a function"), which is what the no-engine-leaks gate exists to catch;
//   * `calibrate`, `available` and `blocked` had branches but were NOT reachable, because the enum never offered them;
//   * `reserve`, `release`, `list` and `status` were each handled TWICE, the second copy dead;
//   * the DESCRIPTION named a different action set again (register/retire/calibrate/available/blocked), and claimed ten
//     actions while the enum listed nine.
// A hand-written list beside a hand-written dispatch drifts by construction. Deriving both from the service removes the
// failure mode instead of correcting one instance of it: the enum IS the service's own function-valued keys, and the
// dispatch is one generic pass-through. There is no second list left to disagree with the first.
export function makeCapacitySpec({ param, refused, TOOL_NAMES, kernel }) {
  const capacity = kernel && kernel.capacity ? kernel.capacity : null
  // Derived ONCE, at assembly: the set of things this face can actually address.
  const ACTIONS = capacity && typeof capacity === 'object'
    ? Object.keys(capacity).filter((k) => typeof capacity[k] === 'function').sort()
    : []
  const spelled = ACTIONS.length ? ACTIONS.join('｜') : '(服务未提供任何方法)'
  return {
    name: TOOL_NAMES.capacity,
    description: 'vmu 容量面（(f) 工作流／(j) 自组织的资源侧）：★ 动作集由【服务自身推导】，本工具只做寻址与调用'
      + '（整对象透传 ✓，形状由服务校验），所以它无法与服务的实际能力漂移。可用：' + spelled,
    parameters: {
      action: param('string', '★ 取值＝服务实际暴露的方法：' + spelled, { required: true, enum: ACTIONS }),
      request: param('object', '写动作的请求（形状由服务校验 ✓）'),
      id: param('string', 'read 动作要寻址的目标 id（可选；只会在需要时附加）'),
    },
    run: async ({ action, request, id } = {}) => {
      try {
        if (!capacity) {
          return refused('VMU_ENGINE_UNAVAILABLE', 'this assembly has no capacity service to address',
            'the capacity face is registered whenever the tool is declared; a deployment that wants it must provide kernel.capacity')
        }
        // ★ ASK "CAN I CALL IT?", NOT "IS IT AN OWN PROPERTY?". The first version of this dispatch checked
        // `hasOwnProperty`, which is stricter than the question the face is actually asking and refuses services whose
        // methods live on a prototype, behind a getter, or on a Proxy - cases where a plain `capacity.status()` works
        // perfectly. A tool that refuses an action the service would have answered is worse than one that forwards it:
        // the caller learns nothing about the real service, and the SERVICE'S OWN refusal code (the thing an operator
        // needs) never survives. Measured by the rejection guard, which replaces the service with a Proxy and expects
        // its code back.
        const fn = typeof capacity[action] === 'function' ? capacity[action] : null
        if (!fn) {
          // REFUSED BY NAME, and the refusal carries the enforced list - so a caller who guessed an action learns the
          // real set here rather than from an engine error. The message keeps the repository's own wording for this
          // case ("unknown action: …", as in tools/control.js); the FACE is named by the hint, which also lists what
          // the service does implement.
          return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action),
            'the capacity face addresses these: ' + spelled)
        }
        // The face ADDRESSES and CALLS; the service validates the request shape. `id` travels only when the caller gave
        // one, so a read that takes no target is not handed a fabricated one.
        const payload = Object.assign({}, request && typeof request === 'object' ? request : {},
          id === undefined || id === null ? {} : { id })
        return Object.assign({ ok: true, action }, await fn(payload))
      } catch (e) {
        return refused(e.code || 'VMU_STATE', String(e.message), e.hint)
      }
    },
  }
}

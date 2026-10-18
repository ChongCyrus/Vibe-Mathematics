// vibe-math-vmu — C-45：**忠实性缺陷 ⇒ 强制弃权**（内核谓词；v5r 的 L2 option A / Adv-verify F1）。
//
// 为什么它单独成面（而不是塞进 `kernel/formal.js` 的方法表）：
//   · `kernel/formal.js` 的 10 个方法**一一对应** `vibe_vmu_formal` 的 10 个 action（那条门禁要求"工具枚举
//     与服务方法表逐个对齐、谁都不许漂移"）。忠实性弃权不是那个工具的一个动作，它是**表决面消费的判定点**，
//     所以它有自己的服务键、自己的读面、自己的留痕目录 —— 这样两边都不会出现"藏起来的第十一个方法"。
//
// 判定点落在哪里（本轮 C 的结论）：**内核谓词**，不是 pack 声明。
//   · pack/代理只能**声明**"这份形式化不忠实"（且必须写明偏差）—— 那是判断，属于策略层；
//   · **能不能把它变成一张 1 或 0 的票**由内核回答，答案永远是"不能"：
//     被登记者在该对象上的布尔票一律被 `applyAbstention` 改写为 0.5（弃权），并留耐久 marker。
//   因此 pack 无法关掉它，成员也无法"忘记弃权"——这正是"强制"二字的落点。
//
// 硬不变式：
//   ① 缺 target／by／note ⇒ **具名拒**（匿名缺陷声明不可审计：'不好'不是理由）；
//   ② 留痕 append-only：同一对象第二个缺陷**追加**，绝不抹掉第一个人（v5r/Adv-verify F1 的同一课）；
//   ③ 不忠实**永远不是反证**：所有返回 `isRefutation:false`（编译失败/不忠实 ≠ 命题为假）；
//   ④ 留痕可跨实例重载（`loadDefects()`）；没有 fs 接缝 ⇒ `durable:false` **具名**，不假装持久；
//   ⑤ 一切拒绝带 `enforced[]` ＋ `enforcedScope`（D3：没有作用域的结果不存在）。
//
// 注入：`createFidelityRegistry({ clock, log, bus, ids, fs })`
//   · ids —— 可选 `kernel/ids.js` 实例（缺省模块级单例）⇒ marker 号经唯一铸号者（D15）
//   · fs  —— 可选 `{ writeText, readText, listDir }` ⇒ `Formal/Defects/<target>.json`
//   · bus —— 可选；事件 `formal/fidelity-defect`、`formal/abstention-enforced`、`formal/defects-loaded`

import { mint as mintId } from './ids.js'
import { ENFORCED_SCOPE } from './mathjobs.js'

/** 强制弃权的票值：严格介于 0 与 1 之间 ⇒ 按定义计作弃权（v5r 的 L2 option A）。 */
export const FIDELITY_ABSTENTION_VOTE = 0.5
/** 耐久 marker 的目录（研究所相对；仅在注入 fs 接缝时使用）。 */
export const FIDELITY_DEFECT_DIR = 'Formal/Defects'

const LOG_MAX = 200

export function refuse(code, message, hint, enforced) {
  return {
    ok: false, code, message, hint,
    enforced: Array.isArray(enforced) ? enforced.slice() : [],
    enforcedScope: ENFORCED_SCOPE,
  }
}

export function createFidelityRegistry(opts) {
  const o = opts || {}
  const clock = typeof o.clock === 'function' ? o.clock : () => 0
  const log = typeof o.log === 'function' ? o.log : () => {}
  const fsSeam = (o.fs && typeof o.fs.writeText === 'function' && typeof o.fs.readText === 'function') ? o.fs : null
  const emit = (name, payload) => {
    try {
      if (!o.bus || typeof o.bus.emit !== 'function') return
      const r = o.bus.emit(String(name), payload || {})
      if (r && typeof r.catch === 'function') r.catch(() => {})
    } catch (e) { /* 广播不改结果 */ }
  }
  const defects = new Map()          // target -> { target, at, by, note, markerId, history:[…] }
  let defectsDeclared = 0
  let abstentionsEnforced = 0
  let loadedRecords = 0
  let droppedLog = 0
  const trail = []
  const note = (what, id, extra) => {
    trail.push(Object.assign({ at: clock(), what, id: String(id || '') }, extra || {}))
    if (trail.length > LOG_MAX) { trail.shift(); droppedLog += 1 }
  }
  const targetSafe = (t) => String(t == null ? '' : t).trim().replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').replace(/-{2,}/g, '-').replace(/^[.\-]+|[.\-]+$/g, '')
  const defectRel = (target) => FIDELITY_DEFECT_DIR + '/' + targetSafe(target) + '.json'
  const mintMarkerId = () => (o.ids && typeof o.ids.mint === 'function' ? o.ids.mint('formaldefect', 'fd-') : mintId('formaldefect', 'fd-'))

  /** 登记 ONE 忠实性缺陷。没有 note 就没有可审计的内容 ⇒ 具名拒。 */
  const declareDefect = async (a) => {
    const args = a || {}
    const target = targetSafe(args.target)
    const by = String(args.by || '').trim()
    const defectNote = String(args.note || '').trim()
    if (!target) return refuse('VMU_MATH_INVALID_INPUT', 'declareDefect 需要 target（被判定不忠实的对象）', '指出对象 id：忠实性缺陷必须挂在具体对象上，不能匿名', [])
    if (!by) return refuse('VMU_MATH_INVALID_INPUT', 'declareDefect 需要 by（谁判定它不忠实）', '具名是留痕的一半：缺陷声明必须署名', [])
    if (!defectNote) return refuse('VMU_MATH_INVALID_INPUT', 'declareDefect 需要 note（具体偏差）', "写清哪一条定义/条件/假设/结论与命题原文不一致 —— '不好'不算理由", [])
    const prev = defects.get(target)
    const marker = {
      markerId: mintMarkerId(), target, by, note: defectNote, at: clock(),
      kind: 'fidelity-defect',
      enforcedVote: FIDELITY_ABSTENTION_VOTE,
      reason: 'fidelity-defect: the formalisation does not say what the proposition says — the framework counts this member\'s ballot on this object as an abstention',
      // The claim being withdrawn travels with the marker (v5r withdrew the archived proof in the same step).
      passedWithdrawn: true,
    }
    const rec = {
      target,
      at: marker.at,
      by, note: defectNote, markerId: marker.markerId,
      history: (prev && Array.isArray(prev.history) ? prev.history.slice() : []).concat([marker]),
    }
    defects.set(target, rec)
    defectsDeclared += 1
    note('fidelity.declareDefect', target, { by, markerId: marker.markerId })
    // Durable marker FIRST — a mark that survives the process is the "留痕" half of the criterion.
    let persisted = false
    if (fsSeam) {
      try { persisted = (await fsSeam.writeText(defectRel(target), JSON.stringify(rec, null, 1) + '\n')) !== false } catch (e) { persisted = false }
    }
    emit('formal/fidelity-defect', { target, by, markerId: marker.markerId, enforcedVote: FIDELITY_ABSTENTION_VOTE, persisted })
    return {
      ok: true,
      target, by, note: defectNote,
      marker,
      // The SHAPE the ballot face consumes: an abstention is not a suggestion, it is the decision.
      enforcedAbstention: { vote: FIDELITY_ABSTENTION_VOTE, enforced: true, reason: 'fidelity-defect', markerId: marker.markerId, target },
      persisted,
      durable: persisted,
      isRefutation: false,   // a fidelity defect NEVER refutes the proposition
    }
  }

  /** 纯谓词：该成员对该对象的票是否**被强制**为弃权。 */
  const abstentionFor = (q) => {
    const target = targetSafe(q && q.target)
    const by = String((q && q.by) || '').trim()
    const rec = defects.get(target)
    if (!rec || !by) return null
    const hit = rec.history.filter((m) => m.by === by).pop()
    return hit ? { vote: FIDELITY_ABSTENTION_VOTE, enforced: true, reason: 'fidelity-defect', markerId: hit.markerId, target, note: hit.note, at: hit.at } : null
  }

  /**
   * **唯一强制点**。计票方必须把布尔票路由过这里：
   *   · 被登记者 ⇒ 无论他声明 1 还是 0，票值都是 0.5（`enforced:true`）；
   *   · 其他人 ⇒ 原样通过（`enforced:false`）。
   */
  const applyAbstention = (q) => {
    const args = q || {}
    const declared = args.declared
    const f = abstentionFor({ target: args.target, by: args.by })
    if (!f) return { ok: true, vote: declared, enforced: false, marker: null, isRefutation: false }
    // Only a BOOLEAN assertion is overridden: an already-uncertain value stays exactly as sent.
    if (!(declared === 0 || declared === 1)) {
      return { ok: true, vote: declared, enforced: false, marker: f.markerId, note: 'already not a boolean assertion — nothing to override', isRefutation: false }
    }
    abstentionsEnforced += 1
    note('fidelity.abstentionEnforced', String(args.target || ''), { by: String(args.by || ''), declared, markerId: f.markerId })
    emit('formal/abstention-enforced', { target: f.target, by: String(args.by || ''), declared, vote: FIDELITY_ABSTENTION_VOTE, markerId: f.markerId })
    return { ok: true, vote: FIDELITY_ABSTENTION_VOTE, enforced: true, reason: 'fidelity-defect', marker: f.markerId, note: f.note, declared, isRefutation: false }
  }

  /**
   * 纯谓词（P1-9 的共读真源）：该对象是否有一条 `passedWithdrawn:true` 的 defect 标记。
   * 返回 `{ok:true,target,withdrawn:true,markerId,note,by,at}` 或 `null`。**证明读点（verified 面）必须调用它**，
   * 否则 `declareDefect` 写下的 `passedWithdrawn` 就只是一行没人看的字。
   */
  const passedWithdrawnFor = (q) => {
    const target = targetSafe(typeof q === 'string' ? q : (q && q.target))
    if (!target) return null
    const rec = defects.get(target)
    if (!rec) return null
    const hit = (Array.isArray(rec.history) ? rec.history : []).filter((m) => m && m.passedWithdrawn === true).pop()
    if (!hit) return null
    return { ok: true, target, withdrawn: true, markerId: hit.markerId, note: hit.note, by: hit.by, at: hit.at }
  }

  /** 重载耐久 marker（在 `store`/`fs` 装好之后调用一次，像作业恢复那样）。 */
  const loadDefects = async () => {
    if (!fsSeam) {
      return refuse('VMU_MATH_JOBS_MIRROR_UNWIRED', '未注入 fs 接缝：忠实性缺陷留痕不可重载',
        '注入 fs{writeText,readText,listDir}；或明确接受"只在内存"（view().durable=false）', [])
    }
    let entries = []
    try { entries = (await fsSeam.listDir(FIDELITY_DEFECT_DIR)) || [] } catch (e) { entries = [] }
    let loaded = 0
    for (const e of entries) {
      if (!e || e.type !== 'file' || !/\.json$/.test(String(e.name))) continue
      let rec = null
      try { rec = JSON.parse((await fsSeam.readText(FIDELITY_DEFECT_DIR + '/' + e.name)) || 'null') } catch (err) { rec = null }
      if (!rec || !rec.target || !Array.isArray(rec.history)) continue
      defects.set(rec.target, rec)
      loaded += 1
    }
    loadedRecords = loaded
    emit('formal/defects-loaded', { loaded })
    return { ok: true, loaded, count: defects.size }
  }

  /** READ-ONLY view（C-45 的审计面）。 */
  const view = () => ({
    ok: true,
    count: defects.size,
    declared: defectsDeclared,
    abstentionsEnforced,
    durable: !!fsSeam,
    dir: fsSeam ? FIDELITY_DEFECT_DIR : null,
    loaded: loadedRecords,
    enforcedVote: FIDELITY_ABSTENTION_VOTE,
    droppedLog,
    defects: [...defects.values()].map((r) => ({ target: r.target, at: r.at, by: r.by, note: r.note, markerId: r.markerId, markers: r.history.length })),
  })

  const status = () => ({ ok: true, durable: !!fsSeam, defects: defects.size, declared: defectsDeclared, abstentionsEnforced, dir: fsSeam ? FIDELITY_DEFECT_DIR : null })

  return { declareDefect, abstentionFor, applyAbstention, passedWithdrawnFor, loadDefects, view, status, trail: () => trail.slice() }
}

export default createFidelityRegistry

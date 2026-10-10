// vibe-math-vmu — 治理面最小可用切片：**议程 ＋ 动议**（照 docs/08 §2.3/§10/§13/§19-§20 的语义）。
//
// 不变式（硬）：
//   ① 每个拒绝**具名**（`VMU_*` ＋ `hint`，绝不抛裸异常）；
//   ② **计数式截断**（任何上限都报"丢了多少"，绝不静默）；
//   ③ **零机制**（不配置时最小、不崩：所有键都有安全缺省）；
//   ④ **确定性**（只走注入的 `clock`；**不读真实时间** ✗）；
//   ⑤ **只读与写入分离**（`list()`／`status()` 不改状态 ⇒ 无副作用、可重复调用）。
//
// 注入：`createGovernance({ clock, log, settings, bus })`
//   · clock    —— `() => ms`（缺省 0；**不读 Date.now** ✓）
//   · log      —— 可选 `(line) => void`
//   · settings —— 读值接缝：`settings.get(key)` 优先，退回 `settings[key]`（**真读值** ✓）
//   · bus      —— 可选 `{ emit?: (event) => void }`（写路径广播；失败不影响返回 ✓）
//
// 已登记的键（`settings/planned.js`）与码（`docs/03` §8）都在 `KEYS`／拒绝函数里逐条出现 ✓。

export const AGENDA_KEYS = Object.freeze([
  'vmu.agenda.maxItems',
  'vmu.agenda.ownerRequired',
  'vmu.agenda.timeboxRequired',
  'vmu.agenda.splitDepthMax',
  'vmu.agenda.carryOnAdjourn',
  'vmu.agenda.reorderAudit',
])
export const MOTION_KEYS = Object.freeze([
  'vmu.motions.secondThreshold',
  'vmu.motions.expireMs',
  'vmu.motions.withdrawable',
  'vmu.motions.tabledMax',
  'vmu.motions.maxOpen',
  'vmu.motions.proceduralKinds',
  'vmu.motions.privilegedKinds',
  'vmu.motions.amendFriendlyInline',
  'vmu.motions.amendSubstantiveMode',
])
export const AUDIT_MAX = 200 // 审计/事件环形上限；超出即计数丢弃（不变式 ②）

const refuse = (code, message, hint) => ({ ok: false, code, message, hint })

export function createGovernance(opts) {
  const o = opts || {}
  const readKey = (k) => (o.settings && typeof o.settings.get === 'function' ? o.settings.get(k) : (o.settings || {})[k])
  const clock = typeof o.clock === 'function' ? o.clock : () => 0
  const log = typeof o.log === 'function' ? o.log : () => {}
  const emit = (ev) => { try { if (o.bus && typeof o.bus.emit === 'function') o.bus.emit(ev) } catch (e) { /* 广播绝不改变结果 */ } }

  // ── 设置（唯一口径；缺省＝最小且不崩）──────────────────────────────────────
  const cfg = () => {
    const n = (k, d) => { const v = Number(readKey(k)); return Number.isFinite(v) && v >= 0 ? Math.floor(v) : d }
    return {
      maxItems: n('vmu.agenda.maxItems', 0),                   // 0＝不限
      ownerRequired: readKey('vmu.agenda.ownerRequired') === true,
      timeboxRequired: readKey('vmu.agenda.timeboxRequired') === true,
      splitDepthMax: n('vmu.agenda.splitDepthMax', 1),
      carryOnAdjourn: readKey('vmu.agenda.carryOnAdjourn') === true,
      reorderAudit: readKey('vmu.agenda.reorderAudit') === true,
      secondThreshold: Math.max(1, n('vmu.motions.secondThreshold', 1)),
      expireMs: n('vmu.motions.expireMs', 0),                  // 0＝不失效
      withdrawable: readKey('vmu.motions.withdrawable') !== false,
      tabledMax: n('vmu.motions.tabledMax', 0),                // 0＝不限
      maxOpen: n('vmu.motions.maxOpen', 0),                    // 0＝不限
      proceduralKinds: Array.isArray(readKey('vmu.motions.proceduralKinds')) ? readKey('vmu.motions.proceduralKinds').map(String) : [],
      privilegedKinds: Array.isArray(readKey('vmu.motions.privilegedKinds')) ? readKey('vmu.motions.privilegedKinds').map(String) : [],
      amendFriendlyInline: readKey('vmu.motions.amendFriendlyInline') === true,
      amendSubstantiveMode: String(readKey('vmu.motions.amendSubstantiveMode') || 'vote'),
    }
  }
  const keysUsed = () => AGENDA_KEYS.concat(MOTION_KEYS)

  // ── 内存状态 ＋ 事件环（环形 ⇒ 丢弃必计数）───────────────────────────────
  const items = new Map()
  const order = []
  const motions = new Map()
  let seq = 0
  let droppedEvents = 0
  const events = []
  const note = (what, id) => {
    events.push({ at: clock(), what, id: String(id || '') })
    if (events.length > AUDIT_MAX) { events.shift(); droppedEvents += 1 }
  }
  const newId = (p) => p + '-' + (++seq)

  // ── 议程 ──────────────────────────────────────────────────────────────────
  const agenda = {
    add(a) {
      const c = cfg()
      const title = String((a && a.title) || '').trim()
      const owner = String((a && a.owner) || '').trim()
      if (!title) return refuse('VMU_AGENDA_ITEM_REQUIRED', '议程条目必须有 title', '一等议程条目：给 title（其余字段可省）')
      if (c.ownerRequired && !owner) return refuse('VMU_AGENDA_OWNER_REQUIRED', '该配置要求议程条目带 owner', '设 owner，或关掉 vmu.agenda.ownerRequired')
      if (c.timeboxRequired && !(Number(a && a.timeboxMs) > 0)) return refuse('VMU_AGENDA_ITEM_REQUIRED', '该配置要求议程条目带 timeboxMs', '给正数 timeboxMs，或关掉 vmu.agenda.timeboxRequired')
      if (c.maxItems > 0 && order.length >= c.maxItems) {
        return refuse('VMU_CONFLICT', '议程已达上限 ' + c.maxItems + '（未入队）', '先删/合并条目，或调大 vmu.agenda.maxItems')
      }
      const it = { id: newId('ag'), title, owner, kind: String((a && a.kind) || 'topic'), timeboxMs: Number((a && a.timeboxMs) || 0), depth: 0, parent: '', state: 'pending' }
      items.set(it.id, it); order.push(it.id)
      note('agenda.add', it.id); emit({ type: 'agenda.add', id: it.id })
      return { ok: true, item: view(it) }
    },
    list() {
      const c = cfg()
      // **只读**：不改状态；`maxItems` 只影响"展示"，超出的部分**报丢弃计数**（不变式 ②）
      const shown = c.maxItems > 0 ? order.slice(0, c.maxItems) : order.slice()
      return { ok: true, count: order.length, dropped: Math.max(0, order.length - shown.length), droppedEvents, items: shown.map((id) => view(items.get(id))) }
    },
    reorder(ids) {
      const want = Array.isArray(ids) ? ids.map(String) : null
      if (!want || want.length !== order.length || want.slice().sort().join(',') !== order.slice().sort().join(',')) {
        return refuse('VMU_NOT_FOUND', 'reorder 需要当前全部议程 id 的一个排列', '先 list() 取 id；缺项/多项都会被拒')
      }
      order.length = 0; for (const id of want) order.push(id)
      if (cfg().reorderAudit) note('agenda.reorder', want.join(','))
      emit({ type: 'agenda.reorder', ids: want.slice() })
      return { ok: true, order: want.slice() }
    },
    split(id) {
      const c = cfg()
      const it = items.get(String(id))
      if (!it) return refuse('VMU_NOT_FOUND', '找不到议程条目 ' + String(id), '先 list() 取 id')
      if (it.depth + 1 > c.splitDepthMax) return refuse('VMU_AGENDA_SPLIT_DEPTH', '拆分超深（' + (it.depth + 1) + ' > ' + c.splitDepthMax + '）', '调大 vmu.agenda.splitDepthMax，或不要继续拆')
      const child = { id: newId('ag'), title: it.title + '（拆分）', owner: it.owner, kind: it.kind, timeboxMs: 0, depth: it.depth + 1, parent: it.id, state: 'pending' }
      items.set(child.id, child); order.splice(order.indexOf(it.id) + 1, 0, child.id)
      it.state = 'split'
      note('agenda.split', child.id); emit({ type: 'agenda.split', id: child.id, parent: it.id })
      return { ok: true, item: view(child) }
    },
    status() {
      // **只读**（不改状态）：按 state 计数
      const by = {}
      for (const id of order) { const s = items.get(id).state; by[s] = (by[s] || 0) + 1 }
      return { ok: true, count: order.length, by, droppedEvents }
    },
  }

  // ── 动议 ──────────────────────────────────────────────────────────────────
  const live = (m) => m.state === 'open' || m.state === 'seconded'
  const expiredNow = (m) => { const c = cfg(); return c.expireMs > 0 && live(m) && (clock() - m.at) > c.expireMs }
  /** 双形态视图：动议（有 `seconds`）／议程条目（无 `seconds`）—— 同一处渲染，避免两条路径漂移。 */
  const view = (x) => (Array.isArray(x && x.seconds)
    ? { id: x.id, kind: x.kind, text: x.text, by: x.by, state: x.state, at: x.at, seconds: x.seconds.slice(), expired: expiredNow(x) }
    : { id: x.id, title: x.title, owner: x.owner, kind: x.kind, timeboxMs: x.timeboxMs, depth: x.depth, parent: x.parent, state: x.state })
  const motion = {
    propose(a) {
      const c = cfg()
      const kind = String((a && a.kind) || '').trim()
      const text = String((a && a.text) || '').trim()
      const by = String((a && a.by) || '').trim()
      if (!kind || !text) return refuse('VMU_MOTION_NOT_SECONDED', '动议需要 kind 与 text', '两者必填；附议门槛见 vmu.motions.secondThreshold')
      if (!by) return refuse('VMU_MOTION_NOT_SECONDED', '动议需要 by（提出者）', 'by 必填：撤回权与审计都依赖它')
      if (c.maxOpen > 0 && [...motions.values()].filter(live).length >= c.maxOpen) {
        return refuse('VMU_CONFLICT', '同时开放的动议已达上限 ' + c.maxOpen + '（未受理）', '先结束/搁置旧动议，或调大 vmu.motions.maxOpen')
      }
      const m = { id: newId('mo'), kind, text, by, state: 'open', at: clock(), seconds: [] }
      motions.set(m.id, m)
      note('motion.propose', m.id); emit({ type: 'motion.propose', id: m.id })
      return { ok: true, motion: view(m), needed: c.secondThreshold }
    },
    second(id, by) {
      const c = cfg()
      const m = motions.get(String(id))
      if (!m) return refuse('VMU_NOT_FOUND', '找不到动议 ' + String(id), '先 list() 取 id')
      if (m.state === 'withdrawn') return refuse('VMU_MOTION_WITHDRAWN', '动议已撤回，不能再附议', '重新 propose')
      if (expiredNow(m)) return refuse('VMU_MOTION_EXPIRED', '动议已过期（>' + c.expireMs + ' ms）', '重新 propose，或调大 vmu.motions.expireMs')
      if (m.state === 'tabled') return refuse('VMU_CONFLICT', '动议处于搁置中，不能附议', '先取消搁置（本切片未实现 un-table ✗）')
      const who = String(by || '').trim()
      if (!who) return refuse('VMU_NOT_MEMBER', '附议需要 by', 'by 必填')
      // **幂等**：同一人重复附议不重复计数（且不改状态）
      if (m.seconds.indexOf(who) !== -1) return { ok: true, deduped: true, motion: view(m) }
      m.seconds.push(who)
      if (m.seconds.length >= c.secondThreshold) m.state = 'seconded'
      note('motion.second', m.id); emit({ type: 'motion.second', id: m.id, by: who })
      return { ok: true, motion: view(m), deduped: false }
    },
    withdraw(id, by) {
      const c = cfg()
      const m = motions.get(String(id))
      if (!m) return refuse('VMU_NOT_FOUND', '找不到动议 ' + String(id), '先 list() 取 id')
      if (m.state === 'withdrawn') return refuse('VMU_MOTION_WITHDRAWN', '动议已撤回（幂等调用也报此码）', '重复撤回是具名拒；重新 propose')
      if (!c.withdrawable) return refuse('VMU_CONFLICT', '该配置不允许撤回（vmu.motions.withdrawable=false）', '打开它，或让动议自然结束')
      if (String(by || '').trim() !== m.by) return refuse('VMU_NOT_MEMBER', '只有提出者可以撤回（by 不匹配）', '由 ' + m.by + ' 撤回')
      m.state = 'withdrawn'
      note('motion.withdraw', m.id); emit({ type: 'motion.withdraw', id: m.id })
      return { ok: true, motion: view(m) }
    },
    table(id) {
      const c = cfg()
      const m = motions.get(String(id))
      if (!m) return refuse('VMU_NOT_FOUND', '找不到动议 ' + String(id), '先 list() 取 id')
      const tabled = [...motions.values()].filter((x) => x.state === 'tabled').length
      if (c.tabledMax > 0 && tabled >= c.tabledMax) return refuse('VMU_MOTION_TABLE_LIMIT', '搁置数已达上限 ' + c.tabledMax, '先取回/结束旧搁置，或调大 vmu.motions.tabledMax')
      if (m.state === 'withdrawn') return refuse('VMU_MOTION_WITHDRAWN', '已撤回的动议不能搁置', '重新 propose')
      m.state = 'tabled'
      note('motion.table', m.id); emit({ type: 'motion.table', id: m.id })
      return { ok: true, motion: view(m) }
    },
    amend(id, patch, by) {
      const c = cfg()
      const m = motions.get(String(id))
      if (!m) return refuse('VMU_NOT_FOUND', '找不到动议 ' + String(id), '先 list() 取 id')
      const p = patch || {}
      const substantive = p.text !== undefined || p.kind !== undefined
      if (substantive) {
        if (c.amendSubstantiveMode !== 'inline') {
          return refuse('VMU_AMENDMENT_REJECTED', '实质性修正需要表决（mode=' + c.amendSubstantiveMode + '）', '只改 kind/text 之外的字段，或把 mode 设为 inline')
        }
      } else if (!c.amendFriendlyInline) {
        return refuse('VMU_AMENDMENT_REJECTED', '友好修正未开启（vmu.motions.amendFriendlyInline=false）', '打开它，或改为实质性修正路径')
      }
      if (p.text !== undefined) m.text = String(p.text)
      if (p.kind !== undefined) m.kind = String(p.kind)
      note('motion.amend', m.id); emit({ type: 'motion.amend', id: m.id, by: String(by || '') })
      return { ok: true, motion: view(m) }
    },
    list() {
      const c = cfg()
      const all = [...motions.values()]
      const shown = c.maxOpen > 0 ? all.slice(0, c.maxOpen) : all
      return { ok: true, count: all.length, dropped: Math.max(0, all.length - shown.length), droppedEvents, motions: shown.map(view) }
    },
    status() {
      const by = {}
      for (const m of motions.values()) { const s = expiredNow(m) ? 'expired' : m.state; by[s] = (by[s] || 0) + 1 }
      return { ok: true, count: motions.size, by, open: [...motions.values()].filter(live).length, droppedEvents }
    },
  }

  return { agenda, motion, keysUsed, config: cfg, droppedEvents: () => droppedEvents }
}

export default createGovernance

// vmu kernel · funding — the RESEARCH-FUNDING face (docs/13, docs/22 §2/§8).
//
// WHAT IT IS: accounts, budget lines, expenses, reimbursement, cross-institution settlement and the audit
// pack. It REFERENCES the other faces and redefines none of them: `kernel/budget.js` owns generic quotas,
// `kernel/store.js` owns persistence, `kernel/library.js` owns records, and this face owns the MONEY RULES
// the 16 declared `vmu.funding.*` keys describe.
//
// THE ACCEPTED FACE CONVENTIONS (same as kernel/mathtools.js, kernel/conference.js, kernel/ip.js):
//   ② every receipt carries `enforced[]` (keys EVALUATED for that call) + `fired[]` (keys that CHANGED its
//      outcome, `fired ⊆ enforced`) + `enforcedScope:'evaluated-so-far'` (D3: never mistake "so far" for the
//      whole key set);
//   ③ every REFUSAL — this face returns them rather than throwing — carries `enforced` (an ARRAY, possibly
//      empty, never undefined), the same `enforcedScope`, and `wouldEvaluate ⊇ enforced`;
//   ④ a declared key that is NOT wired is named in `status().plannedKeys` with its reason;
//   refusals are counted PER CODE; the injected clock is the only time source; read surfaces never mutate.
//
// Codes: ALL already registered in 03-§8 (the VMU_FUNDING_* family) — this file invents none:
// VMU_FUNDING_ACCOUNT_MISSING · VMU_FUNDING_LINE_MISSING · VMU_FUNDING_OVER_BUDGET ·
// VMU_FUNDING_RECEIPT_MISSING · VMU_FUNDING_APPROVAL_REQUIRED · VMU_FUNDING_UNAPPROVED_EXPENSE ·
// VMU_FUNDING_COSTSHARE_UNBALANCED · VMU_FUNDING_SETTLEMENT_OVERDUE · VMU_FUNDING_AUDIT_PACK_INCOMPLETE ·
// VMU_ALLOCATION_REMAINDER · VMU_QUOTA_EXCEEDED · VMU_NOT_PERMITTED · VMU_STATE · VMU_NO_SUCH_OBJECT ·
// VMU_META_VALIDATION_FAILED · VMU_INVALID_ARGUMENT
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export const apiVersion = 1
export const ENFORCED_SCOPE = 'evaluated-so-far'
const DAY_MS = 86400000

export function refuse(code, message, hint) {
  const e = new Error(message)
  e.code = code
  if (hint) e.hint = hint
  return e
}

/** The 16 declared keys this face wires (each one changes an observable result — see the test). */
export const WIRED_KEYS = Object.freeze([
  'vmu.funding.accountsDir', 'vmu.funding.currency', 'vmu.funding.request', 'vmu.funding.requiredFields',
  'vmu.funding.approvalThresholdMinor', 'vmu.funding.costSharePolicy', 'vmu.funding.split',
  'vmu.funding.budgetLineGranularity', 'vmu.funding.expenseRequiredFields', 'vmu.funding.pettyCashLimitMinor',
  'vmu.funding.reimbursementSlaDays', 'vmu.funding.crossInstitutionSettlementDays',
  'vmu.funding.settlementRoundMinor', 'vmu.funding.auditPack', 'vmu.funding.auditPackFields',
  'vmu.funding.auditPackFormat',
])

/** Why a declared-but-unwired key would not be honoured (kept for future declarations). */
export const UNWIRED_REASONS = Object.freeze({
  'vmu.funding': '尚未接线：本面只覆盖 13/22 卷声明的 16 条资助旋钮；新声明的键需要一个语义（默认原因）',
})
const reasonFor = (key) => UNWIRED_REASONS[key.split('.').slice(0, 2).join('.')] || '尚未接线：该键需要一个尚未存在的子系统或策略语义'

const intOr = (v, d) => (Number.isInteger(v) && v >= 0 ? v : d)
const str = (v) => (typeof v === 'string' ? v : '')
const listOr = (v) => (Array.isArray(v) ? v.map(String) : [])
const uniq = (v) => [...new Set(Array.isArray(v) ? v : [])]
const mark = (list, key) => { if (!list.includes(key)) list.push(key); return list }
const markAll = (list, keys) => { for (const k of keys) mark(list, k); return list }

const DEFAULTS = Object.freeze({
  'vmu.funding.accountsDir': '', 'vmu.funding.currency': 'EUR', 'vmu.funding.request': 'manual',
  'vmu.funding.requiredFields': [], 'vmu.funding.approvalThresholdMinor': 0,
  'vmu.funding.costSharePolicy': 'balanced', 'vmu.funding.split': [],
  'vmu.funding.budgetLineGranularity': 'category', 'vmu.funding.expenseRequiredFields': ['receipt'],
  'vmu.funding.pettyCashLimitMinor': 0, 'vmu.funding.reimbursementSlaDays': 30,
  'vmu.funding.crossInstitutionSettlementDays': 90, 'vmu.funding.settlementRoundMinor': 1,
  'vmu.funding.auditPack': false, 'vmu.funding.auditPackFields': [], 'vmu.funding.auditPackFormat': 'json',
})
const GRANULARITIES = Object.freeze(['category', 'subcategory', 'item'])
const COST_SHARE_POLICIES = Object.freeze(['balanced', 'allow-any', 'cap'])
const AUDIT_FORMATS = Object.freeze(['json', 'markdown', 'csv'])

export function createFunding({ clock = () => 0, log = null, settings = {}, bus = null } = {}) {
  if (typeof clock !== 'function') {
    const e = refuse('VMU_INVALID_ARGUMENT', 'createFunding needs a clock function', 'pass { clock: () => ms } — the only time source is the injected clock')
    e.enforced = []
    e.enforcedScope = ENFORCED_SCOPE
    e.wouldEvaluate = []
    return { ok: false, code: e.code, message: e.message, hint: e.hint, enforced: [], enforcedScope: ENFORCED_SCOPE, wouldEvaluate: [] }
  }
  const sget = (key) => {
    if (settings && typeof settings.get === 'function') { const v = settings.get(key); return v === undefined ? DEFAULTS[key] : v }
    if (settings && Object.prototype.hasOwnProperty.call(settings, key)) return settings[key]
    return DEFAULTS[key]
  }
  const say = (ev) => { if (log && typeof log.append === 'function') { try { log.append(ev) } catch (e) { /* advisory */ } } }
  const emit = (ev) => { if (bus && typeof bus.emit === 'function') { try { bus.emit(ev) } catch (e) { /* advisory */ } } }

  const K = {
    accountsDir: str(sget('vmu.funding.accountsDir')),
    currency: str(sget('vmu.funding.currency')) || 'EUR',
    request: ['auto', 'manual', 'off'].includes(sget('vmu.funding.request')) ? sget('vmu.funding.request') : 'manual',
    requiredFields: listOr(sget('vmu.funding.requiredFields')),
    approvalThresholdMinor: intOr(sget('vmu.funding.approvalThresholdMinor'), 0),
    costSharePolicy: COST_SHARE_POLICIES.includes(sget('vmu.funding.costSharePolicy')) ? sget('vmu.funding.costSharePolicy') : 'balanced',
    split: listOr(sget('vmu.funding.split')),
    budgetLineGranularity: GRANULARITIES.includes(sget('vmu.funding.budgetLineGranularity')) ? sget('vmu.funding.budgetLineGranularity') : 'category',
    expenseRequiredFields: listOr(sget('vmu.funding.expenseRequiredFields')),
    pettyCashLimitMinor: intOr(sget('vmu.funding.pettyCashLimitMinor'), 0),
    reimbursementSlaDays: intOr(sget('vmu.funding.reimbursementSlaDays'), 30),
    settlementDays: intOr(sget('vmu.funding.crossInstitutionSettlementDays'), 90),
    settlementRoundMinor: Math.max(1, intOr(sget('vmu.funding.settlementRoundMinor'), 1)),
    auditPack: sget('vmu.funding.auditPack') === true,
    auditPackFields: listOr(sget('vmu.funding.auditPackFields')),
    auditPackFormat: AUDIT_FORMATS.includes(sget('vmu.funding.auditPackFormat')) ? sget('vmu.funding.auditPackFormat') : 'json',
  }

  const counters = { accounts: 0, lines: 0, requests: 0, expenses: 0, reimbursed: 0, settlements: 0, auditPacks: 0, remainderMinor: 0, refused: 0, autoApproved: 0, needsApproval: 0 }
  const refusals = new Map()
  const accounts = new Map()
  const receiptRing = []
  const ringDropped = { n: 0 }

  /** The RETURN-TYPE refusal (never a bare throw): array `enforced` + scope + `wouldEvaluate ⊇ enforced`. */
  const deny = (code, message, hint, enforced = [], extra = null, fired = []) => {
    counters.refused += 1
    refusals.set(code, (refusals.get(code) || 0) + 1)
    const list = uniq(Array.isArray(enforced) ? enforced : [])
    const firedKeys = uniq(Array.isArray(fired) ? fired : []).filter((k) => list.includes(k))
    say({ type: 'funding/refused', at: clock(), code, message, enforced: list, fired: firedKeys, enforcedScope: ENFORCED_SCOPE })
    return Object.assign({ ok: false, code, message, hint: hint || null, at: clock() },
      { enforced: list, fired: firedKeys, enforcedScope: ENFORCED_SCOPE, wouldEvaluate: list.slice() },
      extra || {})
  }
  const receipt = (obj, enforced, fired) => {
    const list = uniq(enforced)
    const firedKeys = uniq(fired).filter((k) => list.includes(k))
    const r = Object.assign({ ok: true, at: clock() }, obj, { enforced: list, fired: firedKeys, enforcedScope: ENFORCED_SCOPE })
    receiptRing.push(r)
    while (receiptRing.length > 200) { receiptRing.shift(); ringDropped.n += 1 }
    return r
  }
  const accountOf = (id) => accounts.get(String(id))
  const mustAccount = (id, enforced) => {
    const a = accountOf(id)
    if (!a) {
      return { error: deny('VMU_FUNDING_ACCOUNT_MISSING', 'no such funding account: ' + String(id),
        accounts.size ? 'open ones: ' + [...accounts.keys()].sort().join(', ') : 'open an account first (openAccount())', enforced) }
    }
    return { account: a }
  }
  const lineKeyOf = (line) => (line && typeof line === 'object' ? [line.category, line.subcategory, line.item].filter((x) => x !== undefined && x !== null).map(String).join('/') : String(line === undefined || line === null ? '' : line))
  /** How many levels the declared granularity requires — that is what `budgetLineGranularity` MEANS. */
  const depthOf = (line) => (line && typeof line === 'object' ? [line.category, line.subcategory, line.item].filter((x) => x !== undefined && x !== null && String(x).length > 0).length : (String(line || '').split('/').filter(Boolean).length))
  const requiredDepth = () => (K.budgetLineGranularity === 'item' ? 3 : K.budgetLineGranularity === 'subcategory' ? 2 : 1)

  const api = {
    apiVersion,
    WIRED_KEYS, UNWIRED_REASONS, ENFORCED_SCOPE, GRANULARITIES, COST_SHARE_POLICIES, AUDIT_FORMATS,

    /** Open an account. Rails: `accountsDir` (declare one directory) and `currency` (one currency per account).
     *  NOTE: `vmu.funding.request` is deliberately NOT consulted here — it governs the INTAKE OF REQUESTS
     *  (see request()), not the funding body's own act of opening an account. */
    openAccount({ id = null, title = null, dir = null, currency = null, approved = false } = {}) {
      const enforced = []
      markAll(enforced, ['vmu.funding.accountsDir', 'vmu.funding.currency'])
      const fired = []
      if (K.accountsDir) {
        if (dir !== null && String(dir) !== K.accountsDir) {
          mark(fired, 'vmu.funding.accountsDir')
          return deny('VMU_FUNDING_ACCOUNT_MISSING', 'accountsDir "' + String(dir) + '" differs from the declared one',
            'declared=' + K.accountsDir + ', requested=' + String(dir) + ' (vmu.funding.accountsDir)', enforced, null, fired)
        }
      }
      if (!(typeof title === 'string' && title.trim())) {
        return deny('VMU_INVALID_ARGUMENT', 'an account needs a title', 'pass { title }', enforced, null, fired)
      }
      const cur = currency === null ? K.currency : String(currency)
      mark(fired, 'vmu.funding.currency')
      if (cur !== K.currency) {
        return deny('VMU_META_VALIDATION_FAILED', 'currency "' + cur + '" differs from the declared one',
          'declared=' + K.currency + ', requested=' + cur + ' (vmu.funding.currency)', enforced, null, fired)
      }
      const aid = id === null ? 'f' + (counters.accounts + 1) : String(id)
      if (accounts.has(aid)) return deny('VMU_STATE', 'account already open: ' + aid, 'use another id', enforced, null, fired)
      const account = {
        id: aid, title: String(title), currency: cur, openedAt: clock(), dir: K.accountsDir || null,
        lines: new Map(), expenses: [], requests: [], approved: approved === true, settled: null, settlementDueAt: null,
      }
      accounts.set(aid, account)
      counters.accounts += 1
      const r = receipt({ action: 'openAccount', account: aid, currency: cur, accountsDir: account.dir, request: K.request }, enforced, fired)
      emit({ type: 'funding/account-opened', at: r.at, account: aid })
      return r
    },

    /** Declare budget lines. `budgetLineGranularity` decides HOW DEEP a line must be (a shallow line is refused). */
    budget({ account, lines = [] } = {}) {
      const enforced = []
      markAll(enforced, ['vmu.funding.budgetLineGranularity', 'vmu.funding.currency'])
      const fired = []
      const found = mustAccount(account, enforced)
      if (found.error) return found.error
      const acc = found.account
      const list = Array.isArray(lines) ? lines : []
      if (list.length === 0) return deny('VMU_FUNDING_LINE_MISSING', 'a budget needs at least one line', 'pass { lines: [{ category, amountMinor }] }', enforced, null, fired)
      const need = requiredDepth()
      const shallow = list.filter((l) => depthOf(l) < need)
      if (shallow.length) {
        mark(fired, 'vmu.funding.budgetLineGranularity')
        return deny('VMU_FUNDING_LINE_MISSING',
          'line(s) below the declared granularity "' + K.budgetLineGranularity + '" (need ' + need + ' level(s)): ' + shallow.map((l) => lineKeyOf(l)).join(', '),
          'vmu.funding.budgetLineGranularity=' + K.budgetLineGranularity + ': name every level', enforced, { requiredDepth: need }, fired)
      }
      const added = []
      for (const l of list) {
        const key = lineKeyOf(l)
        const amount = intOr(l && l.amountMinor, 0)
        const cur = l && l.currency !== undefined ? String(l.currency) : acc.currency
        mark(fired, 'vmu.funding.currency')
        if (cur !== acc.currency) {
          return deny('VMU_META_VALIDATION_FAILED', 'line "' + key + '" is in ' + cur + ' but the account is in ' + acc.currency,
            'vmu.funding.currency=' + acc.currency, enforced, null, fired)
        }
        const prev = acc.lines.get(key)
        acc.lines.set(key, { key, depth: depthOf(l), category: l.category === undefined ? null : String(l.category), subcategory: l.subcategory === undefined ? null : String(l.subcategory), item: l.item === undefined ? null : String(l.item), budgetMinor: amount, spentMinor: prev ? prev.spentMinor : 0, currency: cur })
        added.push(key)
        counters.lines += 1
      }
      return receipt({ action: 'budget', account: acc.id, lines: added, totalMinor: [...acc.lines.values()].reduce((a, l) => a + l.budgetMinor, 0), granularity: K.budgetLineGranularity, currency: acc.currency }, enforced, fired)
    },

    /**
     * Submit a funding REQUEST (an application). Rails: `request` (auto|manual|off), `requiredFields`,
     * `approvalThresholdMinor`, `costSharePolicy` (with `split`) and the open-settlement rule.
     */
    request({ account, title = null, amountMinor = 0, fields = {}, costShareMinor = 0, at = null } = {}) {
      const enforced = []
      markAll(enforced, ['vmu.funding.request', 'vmu.funding.requiredFields', 'vmu.funding.approvalThresholdMinor', 'vmu.funding.costSharePolicy', 'vmu.funding.split', 'vmu.funding.currency'])
      const fired = []
      const now = at === null ? clock() : at
      const found = mustAccount(account, enforced)
      if (found.error) return found.error
      const acc = found.account
      if (K.request === 'off') {
        mark(fired, 'vmu.funding.request')
        return deny('VMU_NOT_PERMITTED', 'vmu.funding.request=off: new requests are closed', 'set vmu.funding.request to "auto" or "manual"', enforced, null, fired)
      }
      // 未结项 ⇒ 新申请先拒（先结清上一项）
      if (acc.settlementDueAt !== null && acc.settled === null) {
        if (now > acc.settlementDueAt) {
          mark(fired, 'vmu.funding.crossInstitutionSettlementDays')
          return deny('VMU_FUNDING_SETTLEMENT_OVERDUE', 'the previous project of ' + acc.id + ' is not settled and its settlement window has passed',
            '现值=' + now + 'ms, 截止=' + acc.settlementDueAt + 'ms (vmu.funding.crossInstitutionSettlementDays=' + K.settlementDays + ')', enforced, null, fired)
        }
        mark(fired, 'vmu.funding.settlementRoundMinor')
        return deny('VMU_STATE', 'account ' + acc.id + ' has an OPEN settlement: settle it before a new request',
          'call settle() first — an unsettled project cannot be re-funded', enforced, { openSettlement: true }, fired)
      }
      const missing = K.requiredFields.filter((f) => fields === null || fields[f] === undefined || fields[f] === null || fields[f] === '')
      if (missing.length) {
        mark(fired, 'vmu.funding.requiredFields')
        return deny('VMU_META_VALIDATION_FAILED', 'request is missing required field(s): ' + missing.join(', '),
          'vmu.funding.requiredFields=' + (K.requiredFields.join(', ') || '(none)'), enforced, { missing }, fired)
      }
      const amount = intOr(amountMinor, 0)
      mark(fired, 'vmu.funding.approvalThresholdMinor')
      let approved = false
      let needsApproval = false
      if (K.approvalThresholdMinor > 0 && amount > K.approvalThresholdMinor) {
        needsApproval = true
        counters.needsApproval += 1
        if (K.request === 'auto') {
          return deny('VMU_FUNDING_APPROVAL_REQUIRED', 'amount ' + amount + ' exceeds the auto-approval threshold ' + K.approvalThresholdMinor,
            '现值=' + amount + 'Minor, 上限=' + K.approvalThresholdMinor + 'Minor (vmu.funding.approvalThresholdMinor): human approval is required', enforced, { needsApproval: true }, fired)
        }
      } else if (K.request === 'auto') {
        approved = true
        counters.autoApproved += 1
      }
      // co-funding ratio: costShareMinor / amount must satisfy the declared policy
      const share = intOr(costShareMinor, 0)
      if (share > 0 || K.costSharePolicy !== 'balanced') mark(fired, 'vmu.funding.costSharePolicy')
      if (amount > 0 && share > 0) {
        const ratio = share / amount
        const declaredRatio = K.split.reduce((a, s) => a + Number(s), 0)
        if (K.costSharePolicy === 'balanced' && declaredRatio > 0 && Math.abs(ratio - declaredRatio) > 0.001) {
          mark(fired, 'vmu.funding.split')
          return deny('VMU_FUNDING_COSTSHARE_UNBALANCED',
            'the co-funding share ' + (ratio * 100).toFixed(1) + '% does not match the declared split ' + (declaredRatio * 100).toFixed(1) + '%',
            '现值=' + (ratio * 100).toFixed(1) + '%, 声明=' + (declaredRatio * 100).toFixed(1) + '% (vmu.funding.costSharePolicy=' + K.costSharePolicy + ', vmu.funding.split)', enforced, { ratio, declaredRatio }, fired)
        }
        if (K.costSharePolicy === 'cap' && declaredRatio > 0 && ratio > declaredRatio + 0.001) {
          mark(fired, 'vmu.funding.split')
          return deny('VMU_FUNDING_COSTSHARE_UNBALANCED',
            'the co-funding share exceeds the cap: ' + (ratio * 100).toFixed(1) + '% > ' + (declaredRatio * 100).toFixed(1) + '%',
            '现值=' + (ratio * 100).toFixed(1) + '%, 上限=' + (declaredRatio * 100).toFixed(1) + '% (vmu.funding.costSharePolicy=cap)', enforced, { ratio, cap: declaredRatio }, fired)
        }
      }
      const rid = 'q' + (acc.requests.length + 1)
      const req = { id: rid, title: String(title === null ? '(untitled)' : title), amountMinor: amount, costShareMinor: share, currency: acc.currency, at: now, approved, needsApproval, status: approved ? 'approved' : (needsApproval ? 'awaiting-approval' : 'pending') }
      acc.requests.push(req)
      counters.requests += 1
      return receipt({ action: 'request', account: acc.id, request: rid, amountMinor: amount, currency: acc.currency, approved, needsApproval, costSharePolicy: K.costSharePolicy, split: K.split.slice() }, enforced, fired)
    },

    /**
     * Record an EXPENSE. Rails: `budgetLineGranularity` (an expense needs a matching line — the "category
     * outside the budget" refusal), `expenseRequiredFields` (evidence), `pettyCashLimitMinor`,
     * `approvalThresholdMinor` (unapproved spend) and `currency`.
     */
    expense({ account, line, amountMinor = 0, category = null, evidence = {}, cash = false, approved = false, currency = null, at = null } = {}) {
      const enforced = []
      markAll(enforced, ['vmu.funding.budgetLineGranularity', 'vmu.funding.expenseRequiredFields', 'vmu.funding.pettyCashLimitMinor', 'vmu.funding.approvalThresholdMinor', 'vmu.funding.currency'])
      const fired = []
      const now = at === null ? clock() : at
      const found = mustAccount(account, enforced)
      if (found.error) return found.error
      const acc = found.account
      const key = lineKeyOf(line !== undefined && line !== null ? line : [{ category }])
      const target = acc.lines.get(key)
      if (!target) {
        mark(fired, 'vmu.funding.budgetLineGranularity')
        return deny('VMU_FUNDING_LINE_MISSING', 'no budget line "' + key + '" on ' + acc.id + ' (a category outside the budget cannot be spent)',
          'declared lines: ' + ([...acc.lines.keys()].join(', ') || '(none)') + ' — granularity=' + K.budgetLineGranularity, enforced, { line: key }, fired)
      }
      const missingEvidence = K.expenseRequiredFields.filter((f) => evidence === null || evidence[f] === undefined || evidence[f] === null || evidence[f] === '')
      if (missingEvidence.length) {
        mark(fired, 'vmu.funding.expenseRequiredFields')
        return deny('VMU_FUNDING_RECEIPT_MISSING', 'expense evidence is incomplete, missing: ' + missingEvidence.join(', '),
          'vmu.funding.expenseRequiredFields=' + (K.expenseRequiredFields.join(', ') || '(none)') + ' — no receipt, no reimbursement', enforced, { missing: missingEvidence }, fired)
      }
      const cur = currency === null ? acc.currency : String(currency)
      if (cur !== acc.currency) {
        mark(fired, 'vmu.funding.currency')
        return deny('VMU_META_VALIDATION_FAILED', 'expense currency "' + cur + '" differs from the account currency ' + acc.currency,
          'vmu.funding.currency=' + acc.currency, enforced, null, fired)
      }
      const amount = intOr(amountMinor, 0)
      if (cash && K.pettyCashLimitMinor > 0 && amount > K.pettyCashLimitMinor) {
        mark(fired, 'vmu.funding.pettyCashLimitMinor')
        return deny('VMU_QUOTA_EXCEEDED', 'petty-cash expense above the limit: ' + amount + ' > ' + K.pettyCashLimitMinor,
          '现值=' + amount + 'Minor, 上限=' + K.pettyCashLimitMinor + 'Minor (vmu.funding.pettyCashLimitMinor)', enforced, null, fired)
      }
      if (K.approvalThresholdMinor > 0 && amount > K.approvalThresholdMinor && approved !== true) {
        mark(fired, 'vmu.funding.approvalThresholdMinor')
        return deny('VMU_FUNDING_UNAPPROVED_EXPENSE', 'expense above the approval threshold was not approved: ' + amount + ' > ' + K.approvalThresholdMinor,
          '现值=' + amount + 'Minor, 上限=' + K.approvalThresholdMinor + 'Minor (vmu.funding.approvalThresholdMinor)', enforced, { approved: false }, fired)
      }
      const remaining = target.budgetMinor - target.spentMinor
      if (amount > remaining) {
        mark(fired, 'vmu.funding.budgetLineGranularity')
        return deny('VMU_FUNDING_OVER_BUDGET', 'expense exceeds the remaining balance of "' + key + '": ' + amount + ' > ' + remaining,
          '现值=' + amount + 'Minor, 可用余额=' + remaining + 'Minor (budget ' + target.budgetMinor + ' − spent ' + target.spentMinor + ')', enforced, { remaining, budgetMinor: target.budgetMinor }, fired)
      }
      target.spentMinor += amount
      const exp = { id: 'e' + (acc.expenses.length + 1), line: key, amountMinor: amount, currency: cur, cash: cash === true, approved: approved === true, evidenceKeys: Object.keys(evidence || {}).sort(), at: now, reimbursedAt: null, requestedAt: now }
      acc.expenses.push(exp)
      counters.expenses += 1
      return receipt({ action: 'expense', account: acc.id, expense: exp.id, line: key, amountMinor: amount, currency: cur, remainingMinor: target.budgetMinor - target.spentMinor }, enforced, fired)
    },

    /** Reimburse an expense. `reimbursementSlaDays` is the SLA: paying after it is a NAMED overdue refusal. */
    reimburse({ account, expense, at = null } = {}) {
      const enforced = []
      markAll(enforced, ['vmu.funding.reimbursementSlaDays'])
      const fired = []
      const now = at === null ? clock() : at
      const found = mustAccount(account, enforced)
      if (found.error) return found.error
      const acc = found.account
      const exp = acc.expenses.find((e) => e.id === String(expense))
      if (!exp) return deny('VMU_NO_SUCH_OBJECT', 'no such expense: ' + String(expense), 'known: ' + (acc.expenses.map((e) => e.id).join(', ') || '(none)'), enforced, null, fired)
      if (exp.reimbursedAt !== null) return deny('VMU_STATE', 'expense ' + exp.id + ' was already reimbursed', 'a reimbursement is never paid twice', enforced, null, fired)
      const dueAt = exp.requestedAt + K.reimbursementSlaDays * DAY_MS
      mark(fired, 'vmu.funding.reimbursementSlaDays')
      if (now > dueAt) {
        return deny('VMU_FUNDING_SETTLEMENT_OVERDUE', 'the reimbursement is past its SLA: ' + now + ' > ' + dueAt,
          '现值=' + now + 'ms, 截止=' + dueAt + 'ms (vmu.funding.reimbursementSlaDays=' + K.reimbursementSlaDays + ' days)', enforced, { dueAt }, fired)
      }
      exp.reimbursedAt = now
      counters.reimbursed += 1
      return receipt({ action: 'reimburse', account: acc.id, expense: exp.id, amountMinor: exp.amountMinor, dueAt, slaDays: K.reimbursementSlaDays }, enforced, fired)
    },

    /**
     * Settle across institutions. Rails: `crossInstitutionSettlementDays` (the deadline),
     * `split` (the declared institution shares) and `settlementRoundMinor` (rounding — the REMAINDER is
     * reported, never silently dropped).
     */
    settle({ account, shares = null, at = null } = {}) {
      const enforced = []
      markAll(enforced, ['vmu.funding.split', 'vmu.funding.settlementRoundMinor', 'vmu.funding.crossInstitutionSettlementDays', 'vmu.funding.currency', 'vmu.funding.costSharePolicy'])
      const fired = []
      const now = at === null ? clock() : at
      const found = mustAccount(account, enforced)
      if (found.error) return found.error
      const acc = found.account
      const requested = shares === null ? K.split : listOr(shares)
      mark(fired, 'vmu.funding.split')
      if (requested.length === 0) {
        return deny('VMU_FUNDING_COSTSHARE_UNBALANCED', 'a settlement needs the institution shares',
          'declare vmu.funding.split (e.g. ["0.6","0.4"]) or pass { shares }', enforced, null, fired)
      }
      if (acc.openedAt !== null && K.settlementDays > 0) {
        mark(fired, 'vmu.funding.crossInstitutionSettlementDays')
        const dueAt = acc.openedAt + K.settlementDays * DAY_MS
        if (now > dueAt) {
          return deny('VMU_FUNDING_SETTLEMENT_OVERDUE', 'the settlement window closed at ' + dueAt + ' (now ' + now + ')',
            '现值=' + now + 'ms, 截止=' + dueAt + 'ms (vmu.funding.crossInstitutionSettlementDays=' + K.settlementDays + ')', enforced, { dueAt }, fired)
        }
      }
      const total = [...acc.lines.values()].reduce((a, l) => a + l.spentMinor, 0)
      const unit = K.settlementRoundMinor
      mark(fired, 'vmu.funding.settlementRoundMinor')
      const allocations = requested.map((s, i) => {
        const raw = total * Number(s)
        const rounded = Math.round(raw / unit) * unit
        return { institution: 'i' + (i + 1), share: Number(s), rawMinor: Math.round(raw), amountMinor: rounded }
      })
      const allocated = allocations.reduce((a, x) => a + x.amountMinor, 0)
      const remainder = total - allocated
      counters.remainderMinor += Math.abs(remainder)
      if (Math.abs(remainder) > 0) mark(fired, 'vmu.funding.settlementRoundMinor')
      acc.settled = { at: now, totalMinor: total, allocations, remainderMinor: remainder, roundMinor: unit }
      acc.settlementDueAt = acc.openedAt + K.settlementDays * DAY_MS
      counters.settlements += 1
      const r = receipt({
        action: 'settle', account: acc.id, totalMinor: total, currency: acc.currency, shares: requested.slice(),
        allocations, remainderMinor: remainder, roundingUnitMinor: unit,
        remainderPolicy: 'the rounding remainder is REPORTED (and counted), never silently absorbed (VMU_ALLOCATION_REMAINDER)',
        remainderCode: Math.abs(remainder) > 0 ? 'VMU_ALLOCATION_REMAINDER' : null,
      }, enforced, fired)
      if (Math.abs(remainder) > 0) say({ type: 'funding/allocation-remainder', at: now, account: acc.id, remainderMinor: remainder, code: 'VMU_ALLOCATION_REMAINDER' })
      return r
    },

    /**
     * Build the audit pack. Rails: `auditPack` (on/off), `auditPackFields` (what MUST be inside) and
     * `auditPackFormat` (how it is rendered).
     */
    auditPack({ account } = {}) {
      const enforced = []
      markAll(enforced, ['vmu.funding.auditPack', 'vmu.funding.auditPackFields', 'vmu.funding.auditPackFormat', 'vmu.funding.accountsDir', 'vmu.funding.currency'])
      const fired = []
      const found = mustAccount(account, enforced)
      if (found.error) return found.error
      const acc = found.account
      mark(fired, 'vmu.funding.auditPack')
      if (!K.auditPack) {
        return deny('VMU_NOT_PERMITTED', 'vmu.funding.auditPack=false: the audit pack is not produced',
          'set vmu.funding.auditPack=true to generate it', enforced, null, fired)
      }
      const pack = {
        account: acc.id, accountsDir: acc.dir, currency: acc.currency, generatedAt: clock(),
        lines: [...acc.lines.values()].map((l) => ({ key: l.key, budgetMinor: l.budgetMinor, spentMinor: l.spentMinor })),
        expenses: acc.expenses.map((e) => ({ id: e.id, line: e.line, amountMinor: e.amountMinor, evidenceKeys: e.evidenceKeys.slice(), approved: e.approved, reimbursedAt: e.reimbursedAt })),
        totalMinor: [...acc.lines.values()].reduce((a, l) => a + l.spentMinor, 0),
        template: 'funding-audit-v1',
      }
      if (K.auditPackFields.length) {
        mark(fired, 'vmu.funding.auditPackFields')
        const missing = K.auditPackFields.filter((f) => pack[f] === undefined || pack[f] === null)
        if (missing.length) {
          return deny('VMU_FUNDING_AUDIT_PACK_INCOMPLETE', 'the audit pack is missing declared field(s): ' + missing.join(', '),
            'vmu.funding.auditPackFields=' + K.auditPackFields.join(', ') + ' — the pack must carry every declared field', enforced, { missing }, fired)
        }
      }
      mark(fired, 'vmu.funding.auditPackFormat')
      const fmt = K.auditPackFormat
      const rendered = fmt === 'json' ? JSON.stringify(pack)
        : fmt === 'markdown' ? '# funding audit ' + acc.id + '\n\n- total: ' + pack.totalMinor + ' ' + acc.currency
          : 'account,totalMinor,currency\n' + acc.id + ',' + pack.totalMinor + ',' + acc.currency
      counters.auditPacks += 1
      return receipt({ action: 'auditPack', account: acc.id, format: fmt, fields: K.auditPackFields.slice(), pack, rendered }, enforced, fired)
    },

    // ── READ-ONLY surfaces (they never mutate) ──────────────────────────────────────────────────────────
    accountView({ account } = {}) {
      const enforced = ['vmu.funding.currency', 'vmu.funding.budgetLineGranularity']
      const found = mustAccount(account, enforced)
      if (found.error) return found.error
      const acc = found.account
      return Object.assign({ ok: true, account: acc.id, currency: acc.currency, lines: [...acc.lines.values()].map((l) => Object.assign({}, l)), expenses: acc.expenses.map((e) => Object.assign({}, e)), settled: acc.settled ? Object.assign({}, acc.settled) : null },
        { enforced: uniq(enforced), fired: [], enforcedScope: ENFORCED_SCOPE })
    },
    list() {
      return { ok: true, accounts: [...accounts.keys()].sort(), receipts: receiptRing.length, enforced: [], fired: [], enforcedScope: ENFORCED_SCOPE }
    },
    receiptsView({ limit = 20 } = {}) {
      const n = intOr(limit, 20) || 20
      const kept = receiptRing.slice(-n)
      return { ok: true, items: kept.map((r) => Object.assign({}, r)), total: receiptRing.length, omitted: receiptRing.length - kept.length, ringDropped: ringDropped.n, enforced: [], fired: [], enforcedScope: ENFORCED_SCOPE }
    },
    /** The declared universe (read from the generated registry — never guessed) + the wiring self-report. */
    status() {
      const declared = declaredKeys()
      const wired = WIRED_KEYS.slice()
      const plannedKeys = declared.keys.filter((k) => !wired.includes(k))
      return {
        ok: true, apiVersion, wired, wiredCount: wired.length,
        plannedKeys, plannedCount: plannedKeys.length, plannedSource: declared.source,
        unwiredReasons: Object.fromEntries(plannedKeys.map((k) => [k, reasonFor(k)])),
        declaredFundingKeys: declared.count,
        overlapWithWired: plannedKeys.filter((k) => wired.includes(k)),
        wiredNotDeclared: declared.count > 0 ? wired.filter((k) => !declared.keys.includes(k)) : [],
        complementOk: plannedKeys.length + wired.length === declared.count && plannedKeys.filter((k) => wired.includes(k)).length === 0,
        keys: keysSnapshot(K),
        counters: Object.assign({}, counters),
        refusals: Object.fromEntries([...refusals.keys()].sort().map((k) => [k, refusals.get(k)])),
        refusalsTotal: [...refusals.values()].reduce((a, b) => a + b, 0),
        enforcedScope: ENFORCED_SCOPE,
        note: 'every key in `wired` changes an observable result; receipts carry enforced[] + fired[] (fired ⊆ enforced) and refusals carry enforced[] + enforcedScope + wouldEvaluate ⊇ enforced; the rounding remainder is reported as VMU_ALLOCATION_REMAINDER',
        at: clock(),
      }
    },
  }

  function declaredKeys() {
    try {
      const here = dirname(fileURLToPath(import.meta.url))
      const p = join(here, '..', 'settings', 'planned.js')
      if (!existsSync(p)) return { keys: [], count: 0, source: 'unavailable' }
      const text = readFileSync(p, 'utf8')
      const all = [...new Set([...text.matchAll(/key: "(vmu\.funding\.[^"]+)"/g)].map((m) => m[1]))].sort()
      return { keys: all, count: all.length, source: 'settings/planned.js' }
    } catch (e) { return { keys: [], count: 0, source: 'error:' + String((e && e.message) || e) } }
  }

  return api
}

/** The value record for every wired key (explicit map; a name-derived lookup silently produced nulls). */
function keysSnapshot(K) {
  return {
    'vmu.funding.accountsDir': K.accountsDir, 'vmu.funding.currency': K.currency, 'vmu.funding.request': K.request,
    'vmu.funding.requiredFields': K.requiredFields, 'vmu.funding.approvalThresholdMinor': K.approvalThresholdMinor,
    'vmu.funding.costSharePolicy': K.costSharePolicy, 'vmu.funding.split': K.split,
    'vmu.funding.budgetLineGranularity': K.budgetLineGranularity, 'vmu.funding.expenseRequiredFields': K.expenseRequiredFields,
    'vmu.funding.pettyCashLimitMinor': K.pettyCashLimitMinor, 'vmu.funding.reimbursementSlaDays': K.reimbursementSlaDays,
    'vmu.funding.crossInstitutionSettlementDays': K.settlementDays, 'vmu.funding.settlementRoundMinor': K.settlementRoundMinor,
    'vmu.funding.auditPack': K.auditPack, 'vmu.funding.auditPackFields': K.auditPackFields, 'vmu.funding.auditPackFormat': K.auditPackFormat,
  }
}

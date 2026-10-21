// tests/_lib/package-exemptions.mjs — THE ONE PLACE a "disk file under a preset source root is deliberately NOT
// shipped" is stated. Consumed by tests/audit-package-membership.mjs (the preset-source-root disk closure).
//
// WHY A SHARED PURE-DATA TABLE (round 15, vmu-pack2 §B): the same idea already exists in four inline copies
// (audit-package-membership.mjs EXCLUDED, audit-installer-policy.test.mjs EXEMPT, vmu-tools-await-rejections
// EXEMPT_WITH_REASON, vmu-tools-action-arity EXEMPT). "Who is exempt" has to be countable in ONE place, or
// exemption growth is invisible and the gate goes quietly greener the more it is used (docs/11 §4.2 第九条).
//
// SHAPE (every field is required, and the gate reddens when one is missing):
//   path          EXACT repo-relative path. NO wildcards, NO directory prefixes: one `docs/audit/*` entry would
//                 silently swallow every future audit draft, and that is the only way an exemption becomes a
//                 source of drift.
//   reason        one sentence saying WHY IT MUST NOT SHIP (not "it was missing").
//   approvedBy    who approved it (a name, not "the team").
//   approveRound  the round it was granted in (this repo counts in rounds; dates are not comparable across
//                 members' clocks).
//   reviewRound   the round at which it must be revisited. The gate COUNTS expired entries every run; an
//                 exemption never inherits itself forever.
//
// ANTI-DRIFT SWITCHES the gate proves on every run (six self-probes, all in the gate's own output):
//   1. drop an exemption (or the file)                       -> RED, naming that path  [criterion (e)]
//   2. an exemption for a path that is GONE from disk        -> RED                    [criterion (f)]
//   3. an exemption for a path that IS in package.json#files -> RED ("granted but unnecessary") [criterion (g)]
//   4. the same path twice                                   -> RED
//   5. an empty reason / an empty approvedBy                 -> RED
//   6. reviewRound reached                                   -> COUNTED in the summary (visibility, not a red)
//
// ROUND 15 CONTENT: the six `vibe-math-vmu/docs/audit/` working papers. They are in-repo audit drafts (source /
// prompt / runtime coverage, backlog, downgrade candidates, pack content review), NOT preset payload: they are
// not import targets, the loader never reads them, and `docs/27 §6` states that the managed roster lists only
// runtime files that ship WITH the preset. Not shipping them is the CORRECT state - the defect was that nobody
// could tell "deliberately not shipped" from "forgotten", which is exactly what this table fixes.
export const PACKAGE_EXEMPTIONS = Object.freeze([
  { path: 'vibe-math-vmu/docs/audit/BACKLOG.md', reason: '仓内审计工作稿（待办账本），不是预设载荷；不随 tarball 交付是正确状态', approvedBy: 'Lead', approveRound: 15, reviewRound: 25 },
  { path: 'vibe-math-vmu/docs/audit/downgrade-candidates.md', reason: '仓内审计工作稿（降级候选清单），不是预设载荷；不随 tarball 交付是正确状态', approvedBy: 'Lead', approveRound: 15, reviewRound: 25 },
  { path: 'vibe-math-vmu/docs/audit/pack-content-review.md', reason: '仓内审计工作稿（pack 内容评审），不是预设载荷；不随 tarball 交付是正确状态', approvedBy: 'Lead', approveRound: 15, reviewRound: 25 },
  { path: 'vibe-math-vmu/docs/audit/source-detail-verification.md', reason: '仓内审计工作稿（源细节核验），不是预设载荷；不随 tarball 交付是正确状态', approvedBy: 'Lead', approveRound: 15, reviewRound: 25 },
  { path: 'vibe-math-vmu/docs/audit/source-prompt-coverage.md', reason: '仓内审计工作稿（提示词来源覆盖），不是预设载荷；不随 tarball 交付是正确状态', approvedBy: 'Lead', approveRound: 15, reviewRound: 25 },
  { path: 'vibe-math-vmu/docs/audit/source-runtime-coverage.md', reason: '仓内审计工作稿（运行时来源覆盖），不是预设载荷；不随 tarball 交付是正确状态', approvedBy: 'Lead', approveRound: 15, reviewRound: 25 },
  // ROUND 13 (this round's census rename): the readers-census note is the same kind of working paper - it documents
  // WHY audit-readers.mjs is named that way and carries the B-class adjudications. Not an import target, never read
  // by the loader, and not preset payload; naming it here keeps "deliberately not shipped" distinguishable from
  // "forgotten" (the exact purpose of this table).
  { path: 'vibe-math-vmu/docs/audit/readers-census.md', reason: '仓内审计工作稿（读点普查正名与 B 类裁定），不是预设载荷；不随 tarball 交付是正确状态', approvedBy: 'Lead', approveRound: 13, reviewRound: 26 },
])

/** The round this gate is running in - used ONLY for the reviewRound expiry COUNT (never for a red).
 *  ROUND 16: bumped 15 -> 16 so the printed "review due at round N" tracks the round it is read in.
 *  LEAD RULING (round 16, task-116 ③): a due exemption is REPORTED, never a red. Turning the accounting date into a
 *  gate failure would push people to edit the DATE instead of the content - the whitelist-drift failure this repo
 *  keeps hunting. Verified by self-probe 6b in tests/audit-package-membership.mjs. */
export const GATE_ROUND = 16

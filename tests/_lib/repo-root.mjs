// tests/_lib/repo-root.mjs — THE one way a suite names the checkout it lives in (TB-2709).
//
// WHY THIS EXISTS (measured false green, TB-2706 B4): 42 test files wrote `const REPO = 'D:/wd/…/Vibe-Mathematics'`.
// A harness that copies the repo to a temp clone and breaks the implementation there still loaded the ORIGINAL repo,
// so the mutation never ran: the suite reported 32/0 green where 9 assertions should have been red. The same literal
// also made every such suite ERR_MODULE_NOT_FOUND on another machine, and made "does this run on a clean checkout"
// unanswerable.
//
// CONTRACT
//   · REPO is derived from THIS module's own location (tests/_lib -> two levels up), never from an absolute literal
//     and never from process.cwd() (cwd is the caller's, and a harness may call from anywhere).
//   · A suite that needs a path under the checkout builds it with path.join(REPO, …) — the clone and the original
//     are indistinguishable by layout.
//   · If a test INTENTIONALLY names this machine (a probe of the real installed app), it may not import this module;
//     it carries a line-scoped `// PORTABLE-ALLOW: <why >= 24 chars>` instead, and tests/audit-portability.mjs enforces
//     both halves (the literal is a BLOCKER anywhere under tests/**; the exemption must explain why hard-coding is safe).
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

export const REPO = resolve(HERE, '..', '..')
export const VMU = resolve(REPO, 'vibe-math-vmu')
export const KERNEL = resolve(VMU, 'kernel')

// vmu framework notice block — ★★★ RUN 249 (task-69 / F-11): the run that rendered ZERO mails.
//
// THE DEFECT, IN THE RUN'S OWN WORDS. The 69th live run had 7 unread mails in the members' mailboxes, and the loop
// delivered them to every turn's notice channel — but the `[新到的消息]` block never appeared in any prompt (0 hits in
// the whole capture). The queue was connected (kernel/index.js `noticeSource`), and the block was rendered ONLY when
// a deployment supplied a pack's `noticeBlock`; a deployment with none (the framework's own default) put the notice
// lines into the status block, where they read as part of the round brief and the header never appeared at all.
//
// So the framework ships the rendering as a MECHANISM, not as an institution's wording: same header, same two-space
// indent, same blank line the corpus shows, and EMPTY INPUT RENDERS NOTHING (zero mechanism: no notices, no header).
// A pack that wants different wording still passes its own `noticeBlock` and wins (kernel/index.js prefers the pack).
//
// Why this file exists instead of importing the pack's: the kernel must be usable with NO pack at all (goal 2), and a
// kernel file may not import a pack (dependency direction). The shape is therefore stated here, once, as the
// framework's own default — and `tests/vmu-run249-notice-and-reply.test.mjs` pins that this default and the v5r pack's
// block agree line-for-line, so the two cannot drift apart silently.

/** The header the corpus precedes queued notices with. Declared here because the framework's default block needs it. */
export const INBOX_HEADER = '[新到的消息]'

/**
 * Render the queued notices the way the corpus renders them: the header, every notice INDENTED BY TWO SPACES, then a
 * blank line. The indentation is load-bearing: it separates what the framework is telling the member from what the
 * round is asking, and an unindented notice reads as part of the task.
 *
 * Empty / non-array input renders '' (not a bare header): zero notices means zero mechanism.
 */
export function inboxBlock(notices = []) {
  const lines = (Array.isArray(notices) ? notices : []).filter((l) => typeof l === 'string' && l.trim() !== '')
  if (!lines.length) return ''
  return [INBOX_HEADER, ...lines.map((l) => '  ' + l.trim()), ''].join('\n')
}

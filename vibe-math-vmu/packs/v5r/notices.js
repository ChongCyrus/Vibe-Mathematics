/**
 * THE FRAMEWORK NOTICE SHAPES (goal 3: parity with the original).
 *
 * WHAT THESE ARE. The original prepends short framework notices to a member's next prompt: an assignment the office or
 * the academician made, a nudge telling someone their progress looks slow, a line relayed from the group chat, and an
 * office announcement. They were the largest remaining family the acceptance measurement could not reproduce, and the
 * measurement is what found them - the earlier item-by-item accounting had never noticed them, because they are not
 * sections of a prompt but lines the framework adds on its own.
 *
 * WHY THEY LIVE HERE AND NOT IN THE KERNEL. They are wording, and wording belongs to the institution: a different
 * institution says these things differently, and the framework's job is to carry the line, not to compose it. The
 * templates below are transcribed VERBATIM from the delivered-prompt corpus, with the variable parts marked.
 *
 * WHAT THE FRAMEWORK STILL OWNS. The DELIVERY: a notice is queued for one member and consumed by that member's next
 * assembly exactly once, which the turn loop already implements. These functions only format.
 *
 * MISSING FIELDS ARE REFUSED BY NAME rather than filled with a placeholder, because "任务 undefined" reaching a model
 * is worse than a refusal that names what was not supplied.
 */

function refuse(code, message, hint) {
  const e = new Error(message)
  e.code = code
  if (hint) e.hint = hint
  return e
}

/** Every required field must be a non-empty string; a notice is a line a member reads. */
function need(fields, required, kind) {
  const missing = required.filter((k) => typeof fields[k] !== 'string' || fields[k].trim() === '')
  if (missing.length) {
    throw refuse('VMU_INVALID_ARGUMENT',
      'a ' + kind + ' notice is missing ' + missing.join(', '),
      'pass them as strings; a notice with a blank field would reach the member as a hole')
  }
}

/**
 * 【{assignerLabel}分派】任务 {taskId}「{title}」分派给你。理由：{why}｜验收标准：{acceptance}。
 * 默认应当执行；若你认为方向有误，请在会议轮用 vibe_v5_say 说明理由（会议楼层全体可见），并把理由用
 * vibe_v5_record_progress（track "obstacles"）记进账本。★ 回执里的 reject_assign 没有可用形状：它会被当成会议发言而
 * 回执不带会议，普通轮直接跳过，到不了全体表决者（VMU_TURN_FIELD_NOT_APPLICABLE，见 v5r-reply-channel.js 的 `reject_assign` 行）。
 *
 * The corpus has the same shape under two labels - 所办分派 and 院士分派 - so the label is the variable. ★ AUDIT12: the
 * captured sentence promised that an objection reason is BROADCAST to the whole institute and told the member to put
 * `reject_assign` in the reply JSON. Both were unreachable (the reply field has no dispatchable shape and is skipped on
 * ordinary rounds), so the notice now names the two routes that do reach people: meeting speech, and the obstacles track.
 */
export function assignmentNotice(fields = {}) {
  need(fields, ['assignerLabel', 'taskId', 'title', 'why', 'acceptance'], 'assignment')
  return '【' + fields.assignerLabel + '分派】任务 ' + fields.taskId + '「' + fields.title + '」分派给你。理由：'
    + fields.why + '｜验收标准：' + fields.acceptance + '。默认应当执行；若你认为方向有误，请在会议轮用 vibe_v5_say 说明理由（会议楼层全体可见），'
    + '并把理由用 vibe_v5_record_progress（track "obstacles"）记进账本——回执里的 reject_assign 没有可用形状，写了会被具名拒。'
}

/**
 * 【督办 from {by}】{byLabel}督办：{why}｜建议的下一步：{nextStep}
 *
 * The suggestion is OPTIONAL in the corpus: one captured notice carries it and one does not. That is why it is
 * appended conditionally rather than always rendered - a required field here would refuse a notice the original
 * really sends.
 */
export function nudgeNotice(fields = {}) {
  need(fields, ['by', 'byLabel', 'why'], 'nudge')
  const tail = typeof fields.nextStep === 'string' && fields.nextStep.trim() !== ''
    ? '｜建议的下一步：' + fields.nextStep
    : ''
  return '【督办 from ' + fields.by + '】' + fields.byLabel + '督办：' + fields.why + tail
}

/** 【研究所·群聊】{member}：{text} - a line relayed from the institute's group chat. */
export function chatNotice(fields = {}) {
  need(fields, ['member', 'text'], 'chat')
  return '【研究所·群聊】' + fields.member + '：' + fields.text
}

/** 【所办通知】{text} - an office announcement. The heading repeats the kind, which is how the corpus writes it. */
export function officeNotice(fields = {}) {
  need(fields, ['text'], 'office')
  return '【所办通知】' + fields.text
}

/** The four shapes by name, for a caller that stores the kind rather than the function. */
export const NOTICE_SHAPES = Object.freeze({
  assignment: assignmentNotice,
  nudge: nudgeNotice,
  chat: chatNotice,
  office: officeNotice,
})

/**
 * THE INBOX HEADER AND BLOCK (corpus-derived, and the shape matters).
 *
 * Twenty of the sixty-seven delivered prompts begin with this block, which is a third of the corpus: a header line, then
 * every queued notice INDENTED BY TWO SPACES, then a blank line, and only then the ordinary round heading. It is not
 * decoration. The indentation is what separates what the framework is telling the member from what the round is asking,
 * and a notice that arrives unindented reads as part of the task.
 *
 * This is a rendering the loop must perform rather than a line it can carry: the loop knows which notices are queued
 * for this member, and the pack knows how to write them down. The seam is `noticeBlock`.
 */
export const INBOX_HEADER = '[新到的消息]'

/** Render the queued notices as the corpus renders them: header, each line indented, then a blank line. */
export function inboxBlock(notices = []) {
  const lines = (Array.isArray(notices) ? notices : []).filter((l) => typeof l === 'string' && l.trim() !== '')
  if (!lines.length) return ''
  return [INBOX_HEADER, ...lines.map((l) => '  ' + l.trim()), ''].join('\n')
}

/** Format by name, refusing an unknown kind rather than guessing which shape was meant. */
export function formatNotice(kind, fields = {}) {
  const fn = NOTICE_SHAPES[kind]
  if (typeof fn !== 'function') {
    throw refuse('VMU_INVALID_ARGUMENT', 'unknown notice kind: ' + String(kind),
      'one of: ' + Object.keys(NOTICE_SHAPES).join(', '))
  }
  return fn(fields)
}

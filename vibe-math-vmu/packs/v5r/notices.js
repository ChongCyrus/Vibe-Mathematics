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
 * 默认应当执行；若你认为方向有误，请说明理由（会被广播给全所）。若你有异议，请在 JSON 里填 reject_assign。
 *
 * The corpus has the same shape under two labels - 所办分派 and 院士分派 - so the label is the variable, and the
 * sentence that follows is identical in both, including the promise that the reason is broadcast to the whole
 * institute and the instruction to file a reject_assign objection.
 */
export function assignmentNotice(fields = {}) {
  need(fields, ['assignerLabel', 'taskId', 'title', 'why', 'acceptance'], 'assignment')
  return '【' + fields.assignerLabel + '分派】任务 ' + fields.taskId + '「' + fields.title + '」分派给你。理由：'
    + fields.why + '｜验收标准：' + fields.acceptance + '。默认应当执行；若你认为方向有误，请说明理由（会被广播给全所）。'
    + '若你有异议，请在 JSON 里填 reject_assign。'
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

/** Format by name, refusing an unknown kind rather than guessing which shape was meant. */
export function formatNotice(kind, fields = {}) {
  const fn = NOTICE_SHAPES[kind]
  if (typeof fn !== 'function') {
    throw refuse('VMU_INVALID_ARGUMENT', 'unknown notice kind: ' + String(kind),
      'one of: ' + Object.keys(NOTICE_SHAPES).join(', '))
  }
  return fn(fields)
}

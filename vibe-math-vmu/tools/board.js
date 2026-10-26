// vibe-math-vmu/tools/board.js — the board tool spec, split out of host.js (round 538) so the host file stays
// inside the DECIDED 1200-line limit (docs/02). The spec is a factory: host.js supplies the shared helpers, and the guard
// condition stays in host.js, because which intent declares a tool is policy and policy belongs with the host.
//
// ★★★ ROUND 30 / task-19 — WHERE THE STATUS BOARD IS READ, AND WHY NOT HERE. The four v5r fields (总任务/规划/各任务
// 完成状态/当前小任务) are read by the TURN LOOP and rendered into the per-round status block
// (`kernel/turn/index.js statusBoardReadings` + `renderStatusBoard`), i.e. where rule C3 puts the board: in the text
// every member receives each round. This tool deliberately gains no eighth action: `tests/vmu-board-tool.test.mjs` §2
// pins the enum to EXACTLY the kernel board service's method list ("neither can drift"), and a read face belongs to the
// turn loop, not to the kanban service — so adding `statusBoard` here would have broken that invariant to duplicate a
// reading the prompt already carries.
export function makeBoardSpec({ param, refused, TOOL_NAMES, kernel }) {
  return {
      name: TOOL_NAMES.board,
      description: 'vmu 看板面：action=columns|addColumn|move|setWip|swimlanes|aging|status。' +
        '看板由内核服务保管（列、WIP 上限、泳道、老化都由它强制）；本工具只做**寻址与调用**，不复制任何策略。',
      parameters: {
        action: param('string', 'columns｜addColumn｜move｜setWip｜swimlanes｜aging｜status', { required: true,
          enum: ['columns', 'addColumn', 'move', 'setWip', 'swimlanes', 'aging', 'status'] }),
        id: param('string', 'addColumn 的列 id'),
        name: param('string', 'addColumn 的列名'),
        wipLimit: param('number', 'addColumn 的 WIP 上限（可选）'),
        order: param('number', 'addColumn 的次序（可选）'),
        taskId: param('string', 'move 的任务 id'),
        toColumn: param('string', 'move 的目标列'),
        by: param('string', 'move 的执行者（可选）'),
        transition: param('string', 'move 的迁移标签（可选）'),
        column: param('string', 'setWip 的列 id'),
        limit: param('number', 'setWip 的上限（aging 时是返回条数上限）'),
        warnMs: param('number', 'aging 的告警阈值毫秒（可选）'),
      },
      run: async ({ action, id, name, wipLimit, order, taskId, toColumn, by, transition, column, limit, warnMs } = {}) => {
        try {
          const board = kernel.board
          if (action === 'columns') return Object.assign({ ok: true, action }, await board.columns())
          if (action === 'addColumn') return Object.assign({ ok: true, action }, await board.addColumn({ id, name, wipLimit, order }))
          if (action === 'move') return Object.assign({ ok: true, action }, await board.move({ taskId, toColumn, by, transition }))
          if (action === 'setWip') return Object.assign({ ok: true, action }, await board.setWip({ column, limit }))
          if (action === 'swimlanes') return Object.assign({ ok: true, action }, await board.swimlanes())
          if (action === 'aging') return Object.assign({ ok: true, action }, await board.aging({ warnMs, limit }))
          if (action === 'status') return Object.assign({ ok: true, action }, await board.status())
          return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
        } catch (e) {
          return refused(e.code || 'VMU_STATE', String(e.message), e.hint)
        }
      },
  }
}

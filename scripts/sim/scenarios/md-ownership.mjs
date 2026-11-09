// scripts/sim/scenarios/md-ownership.mjs — RUN 255 / TB-2613: WHO OWNS A DOCUMENT, MEASURED WITHOUT A MODEL.
//
// The user ruling (2026-11-06) made a document the SEAT's own md file. This scenario walks the ways such a file can
// come to exist, against a REAL kernel, and checks the ownership evidence a reader is handed:
//
//   ① a member's FILE CARD (a plain md under `Members/<member>/Propos/`, the tree the library face scans) is readable
//      by the member's own read face (`read_library` → `libraryCards`) with an address that really opens;
//   ② a member's vmu md DOCUMENT (under the records document root, `<root>/VibeMath/…`) is adopted by
//      `records.mdReindex` (md is the truth) and the index row's `- mdFingerprint：` equals the sha256 of the bytes on
//      disk — recomputed here by reading the file, never copied from the receipt;
//   ③ a blueprint draft the member wrote → `propose(mdPath)` says writtenBy:"member-file" and prints the disk sha;
//   ④ a draft the KERNEL wrote (explicit `materialize:true`) → writtenBy:"kernel-materialized" — NEVER "member-file";
//   ⑤ a default propose (no mdPath, no materialize) writes NOTHING and says `draftMdMissing:true`.
//
// Zero tokens: no model is consulted. `failures` makes the run exit NON-ZERO when one of these contracts moves — a
// self-check that only lives in a comment is not a check (see scripts/sim/run.mjs, RUN 255).
//
// TWO TREES, BOTH REAL (and the distinction is measured, not assumed): the LIBRARY face scans `<root>/Members/…`
// (kernel/library.js `rebuildIndex`, printed as `libraryRoot` on every read), while the RECORDS document root is
// `<root>/VibeMath` (kernel/records.js `mdRoot`). A document written to the wrong tree is not "invisible": it is in the
// OTHER tree, and this scenario walks each tree through the face that actually reads it.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const NL = String.fromCharCode(10)
const shaOf = (abs) => 'sha256:' + createHash('sha256').update(readFileSync(abs)).digest('hex')
const bytesOf = (abs) => readFileSync(abs).length

// The tracks the member documents declare in their `- track：` header. `records.mdReindex` only adopts a track the
// ledger DECLARES (`vmu.records.tracks`), and the ledger default does not carry the library tracks, so the scenario
// states the deployment it needs — the same way paper-gates declares its paper policy.
export const settings = {
  'vmu.records.tracks': ['progress', 'routes', 'obstacles', 'rejected', 'state', 'propositions', 'methods', 'problems', 'blueprint'],
}

export async function mdOwnership(h, { log = () => {} } = {}) {
  const steps = []
  const failures = []
  const step = async (name, fn) => {
    const before = h.tree ? h.tree().length : 0
    const out = await fn()
    const after = h.tree ? h.tree().length : 0
    steps.push({ name, at: h.receipts.length, files: { before, after }, ok: !(out && out.ok === false), code: out && out.code ? out.code : null })
    log(name + (out && out.ok === false ? '  [' + (out.code || 'refused') + ']' : ''))
    return out
  }
  const red = (code, means, evidence) => failures.push({ code, means, evidence })
  const wsOf = (rel) => join(h.root, 'VibeMath', rel)
  const libOf = (rel) => join(h.root, rel)

  // ① the institute exists (a real roster is what makes the seat names meaningful)
  const started = await step('institute/start', () => h.call('vibe_v5_start', {
    problem: '前 n 个奇数之和等于 n 的平方（占位题：本场景只压 md 归属，不压数学）。',
    researcherCount: 2,
  }))

  // ② THE MEMBER PLAYS ITS OWN FS TOOL, IN THE TREE THE LIBRARY FACE READS. A file card is a plain markdown document
  //    under `Members/<member>/{Propos,Methods,Subproblems}/`. `mdCompose` only supplies the FORMAT; the bytes are put
  //    on disk by `writeFileSync`, which is the fs act the member owns.
  const cardRel = 'Members/r-1/Propos/card-x.md'
  const cardAbs = libOf(cardRel)
  await step('member/fs-write-file-card', async () => {
    mkdirSync(dirname(cardAbs), { recursive: true })
    writeFileSync(cardAbs, '# 命题 x' + NL + NL + '- 命题：前 n 个奇数之和 = n²。' + NL + '- 这是成员本人用 fs 写的文件卡。' + NL)
    return { ok: true, path: cardRel }
  })

  // ③ the member's OWN read face lists that file card under `libraryCards` (a records `count`/`cards` is a DIFFERENT
  //    readout: file cards are not ledger rows), and the address it prints really opens on disk.
  const libRead = await step('read/library', () => h.call('vibe_v5_read_library', { member: 'r-1', limit: 5 }))
  const libCards = (libRead && libRead.libraryCards) || []
  const cardHit = libCards.filter((c) => String((c && c.path) || '').includes('card-x.md'))[0] || null
  if (libRead && libRead.ok === false) {
    red('MD_OWNERSHIP_READ_LIBRARY_REFUSED', 'the read face refused a member reading its own library, so ownership cannot be read the way a member would read it', libRead)
  } else if (cardHit === null) {
    red('MD_OWNERSHIP_READ_FACE_HIDES_FILE', 'the read face did not list the member file card that is on disk under the very root the receipt names (libraryRoot), so the member cannot see what it wrote', { cardRel, libraryRoot: libRead && libRead.libraryRoot, libraryCards: libCards })
  } else if (cardHit.path === null || !existsSync(String(cardHit.path))) {
    red('MD_OWNERSHIP_READ_FACE_PATH_UNOPENABLE', 'the read face printed a file card whose address does not open: a reader cannot reach the bytes it claims to list', { path: cardHit.path, cardAbs })
  }

  // ④ A MEMBER WRITTEN vmu md DOCUMENT, in the RECORDS document root. `mdReindex` adopts it; the index row must carry the
  //    sha256 of the bytes THIS scenario can read itself (the body holds `- mdFingerprint：`, the head does not).
  const propRel = 'Members/r-1/Propos/x.md'
  const propAbs = wsOf(propRel)
  const propDoc = h.records.mdCompose({
    title: 'x：前 n 个奇数之和 = n²', track: 'propositions', kind: 'proposition',
    fields: { owner: 'r-1', path: 'Propos/x.md' },
    text: '# x' + NL + NL + '- 命题：前 n 个奇数之和 = n²。' + NL + '- 状态：待证（本文件由成员本人用 fs 写）。',
  })
  await step('member/fs-write-records-doc', async () => {
    mkdirSync(dirname(propAbs), { recursive: true })
    writeFileSync(propAbs, propDoc.content)
    return { ok: true, path: propRel }
  })
  const reindex = await step('records/md-reindex', () => h.records.mdReindex({ by: 'sim-md-ownership' }))
  let rowBody = null
  let row = null
  if (!reindex || reindex.available !== true) {
    red('MD_OWNERSHIP_REINDEX_UNAVAILABLE', 'the records face could not scan a workspace, so no md ownership can be measured', reindex)
  } else {
    const adoptedPaths = (reindex.adopted || []).map((a) => String(a.rel || a.path || ''))
    if (!adoptedPaths.includes(propRel)) {
      red('MD_OWNERSHIP_MEMBER_FILE_NOT_ADOPTED', 'a member-written md on disk was not adopted by mdReindex, so the index would claim nothing owns it', { rel: propRel, adoptedPaths, skipped: reindex.skipped })
    }
    if ((reindex.skipped || []).some((s) => ['not-a-vmu-md', 'undeclared-track'].includes(String(s.whyClass)))) {
      red('MD_OWNERSHIP_MEMBER_FILE_SKIPPED', 'a member file this scenario wrote in the DECLARED format was skipped, so the format and the reindex disagree', reindex.skipped)
    }
    // The row is found by its md TITLE (the index row is keyed by the document, not by the file path: `- path：` inside
    // the body names the DOCUMENT). The sha it carries must be the sha of the file THIS scenario can read itself.
    const rows = h.records.list({ track: 'propositions', limit: 0 }).items || []
    row = rows.filter((r) => String(r.title || '').includes('x：前 n 个奇数之和'))[0] || null
    if (row === null) {
      red('MD_OWNERSHIP_ROW_NAMES_NO_FILE', 'the adopted row cannot be found under its md title, so no reader can reach the bytes', { propRel, rows: rows.map((r) => ({ id: r.id, title: r.title })) })
    } else {
      try {
        const full = h.records.get({ id: row.id })
        rowBody = String((full && full.record ? full.record.body : full && full.body) || '')
      } catch { rowBody = null }
      const indexed = /^-\s*mdFingerprint\s*[：:=]\s*(\S+)\s*$/m.exec(rowBody || '')
      const indexSha = indexed === null ? null : indexed[1]
      if (indexSha !== shaOf(propAbs)) {
        red('MD_OWNERSHIP_INDEX_SHA_DISAGREES_WITH_DISK', 'the index row carries a different sha256 than the bytes on disk: the md is not the truth any more', { indexSha, diskSha: shaOf(propAbs), bytes: bytesOf(propAbs) })
      }
    }
  }

  // ⑤ A BLUEPRINT DRAFT THE MEMBER WROTE: propose(mdPath) must credit the MEMBER, not the kernel, and its ownership
  //    evidence must print the sha of the bytes on disk.
  const draftRel = 'Members/r-1/Drafts/protocol-r1.md'
  const draftAbs = wsOf(draftRel)
  const draftBody = '# 公共蓝图 r1' + NL + NL + '- 命题：前 n 个奇数之和 = n²。' + NL + '- 路线：对 n 归纳。' + NL
  await step('blueprint/member-draft-md', async () => {
    mkdirSync(dirname(draftAbs), { recursive: true })
    writeFileSync(draftAbs, draftBody)
    return { ok: true, path: draftRel }
  })
  const memberPropose = await step('blueprint/propose-member-file', () => h.call('vibe_v5_blueprint', {
    action: 'propose', path: 'Shared/Protocol.md', member: 'r-1', mdPath: draftRel,
    text: '# 公共蓝图 r1' + NL + NL + '- 命题：前 n 个奇数之和 = n²。' + NL + '- 路线：对 n 归纳。',
  }))
  if (memberPropose && memberPropose.ok !== false) {
    if (!memberPropose.md || memberPropose.md.writtenBy !== 'member-file') {
      red('MD_OWNERSHIP_MEMBER_FILE_NOT_CREDITED', 'a draft md the member wrote by hand was not credited to the member-file writer', { writtenBy: memberPropose.md && memberPropose.md.writtenBy, md: memberPropose.md })
    }
    if (memberPropose.md && memberPropose.md.written === true) {
      red('MD_OWNERSHIP_MEMBER_FILE_REWRITTEN', 'the kernel REWROTE a file the member owned instead of reading the bytes as they stand', { md: memberPropose.md })
    }
    if (!memberPropose.mdOwner || memberPropose.mdOwner.sha256 !== shaOf(draftAbs)) {
      red('MD_OWNERSHIP_MEMBER_FILE_SHA_DISAGREES', 'the ownership evidence carries a sha256 that is not the sha of the bytes on disk', { ownerSha: memberPropose.mdOwner && memberPropose.mdOwner.sha256, diskSha: shaOf(draftAbs) })
    }
  } else if (memberPropose) {
    red('MD_OWNERSHIP_MEMBER_PROPOSE_REFUSED', 'a member file in the declared shape was refused, so the fs-first route did not work', memberPropose)
  }

  // ⑥ THE KERNEL-WRITTEN PATH IS STILL REACHABLE, AND IT IS A DIFFERENT WRITER BY NAME.
  const kernelPropose = await step('blueprint/propose-kernel-materialized', () => h.call('vibe_v5_blueprint', {
    action: 'propose', path: 'Shared/Methods.md', member: 'r-1', materialize: true,
    text: '# 方法蓝图 r1' + NL + NL + '- 判据：每一步都可复算。',
  }))
  if (kernelPropose && kernelPropose.ok !== false) {
    if (!kernelPropose.md || kernelPropose.md.writtenBy === undefined || kernelPropose.md.writtenBy === null) {
      red('MD_OWNERSHIP_KERNEL_WRITER_NOT_NAMED', 'the kernel wrote a file but did not name itself as the writer, so the two routes cannot be told apart', { md: kernelPropose.md })
    }
    if (kernelPropose.md && kernelPropose.md.writtenBy === 'member-file') {
      red('MD_OWNERSHIP_KERNEL_WRITER_MISCREDITED', 'the kernel wrote the file itself and credited the MEMBER file writer', { md: kernelPropose.md, mdOwner: kernelPropose.mdOwner })
    }
    if (kernelPropose.filed !== true) {
      red('MD_OWNERSHIP_KERNEL_PROPOSE_NOT_FILED', 'the explicit materialize:true path did not file the draft', kernelPropose)
    }
  } else if (kernelPropose) {
    red('MD_OWNERSHIP_KERNEL_PROPOSE_REFUSED', 'the explicit materialize:true legacy path was refused', kernelPropose)
  }

  // ⑦ THE DEFAULT WRITES NOTHING: no mdPath, no materialize ⇒ the member still owes the file. A file appearing here
  //    would be the kernel inventing a document (the exact behavior this change removes).
  const draftsBefore = (h.tree ? h.tree() : []).map((e) => (e && (e.path || e.rel)) || '').filter((p) => String(p).includes('Shared/Drafts/')).sort()
  const defaultPropose = await step('blueprint/propose-default', () => h.call('vibe_v5_blueprint', {
    action: 'propose', path: 'Shared/Progress.md', member: 'r-1', text: '# 默认路线的草案 r1' + NL + NL + '- 不应落盘。',
  }))
  const draftsAfter = (h.tree ? h.tree() : []).map((e) => (e && (e.path || e.rel)) || '').filter((p) => String(p).includes('Shared/Drafts/')).sort()
  if (defaultPropose && defaultPropose.ok === false) {
    red('MD_OWNERSHIP_DEFAULT_REFUSED', 'the default propose refused instead of answering the named absence', defaultPropose)
  } else if (defaultPropose) {
    if (defaultPropose.filed !== false || defaultPropose.draftMdMissing !== true) {
      red('MD_OWNERSHIP_DEFAULT_RECEIPT_SHAPE', 'the default propose did not say {filed:false, draftMdMissing:true} — the two keys that tell a caller nothing was written', defaultPropose)
    }
    if (JSON.stringify(draftsBefore) !== JSON.stringify(draftsAfter)) {
      red('MD_OWNERSHIP_DEFAULT_WROTE_A_FILE', 'a propose without mdPath and without materialize:true put a file on disk: the default is supposed to write NOTHING', { before: draftsBefore, after: draftsAfter })
    }
  }

  // ⑧ the corpus says, in one object, what this scenario measured (so the audit does not have to re-derive it).
  const contract = {
    libraryCardReadable: cardHit !== null && cardHit.path !== null && existsSync(String(cardHit.path)),
    memberFileAdopted: (reindex && Array.isArray(reindex.adopted)) ? reindex.adopted.some((a) => String(a.rel || a.path || '') === propRel) : false,
    indexShaEqualsDisk: row !== null && /^-\s*mdFingerprint\s*[：:=]\s*(\S+)\s*$/m.test(rowBody || '') && shaOf(propAbs) === (/^-\s*mdFingerprint\s*[：:=]\s*(\S+)\s*$/m.exec(rowBody || '') || [])[1],
    memberWriter: memberPropose && memberPropose.md ? String(memberPropose.md.writtenBy || '') : null,
    kernelWriter: kernelPropose && kernelPropose.md ? String(kernelPropose.md.writtenBy || '') : null,
    defaultFiled: defaultPropose ? defaultPropose.filed : null,
    defaultWroteFile: JSON.stringify(draftsBefore) !== JSON.stringify(draftsAfter),
  }
  return {
    steps,
    failures,
    contract,
    receipts: h.receipts,
    tree: h.tree ? h.tree() : [],
    highlights: { started, cardHit, reindex, row, memberPropose, kernelPropose, defaultPropose, contract },
    expectedRefusals: [],
  }
}

export const scenario = mdOwnership
export default mdOwnership

// tests/vmu-paper-render-teaching.test.mjs — RUN 89's root cause, as an AUDITABLE screen fact.
//
// RUN 89 measured: after a second successful `final`, the seat opened the closing window WITHOUT ever calling
// `render` — render=0, no `recordIds{md,tex,meta}`, V14/V20 never green. The cause was the final guide: it taught
// `final` but not the standard chain after it. A test that asserts the guide once is not enough; the assertion must be
// on the SCREEN a seat reads (the policy-filtered paper prompt), and it must go RED when the teaching sentence is
// deleted from the tree. This suite therefore:
//   1. renders the three paper screens through `prompt-sections.collect()` (same policy-filtered assembly as the
//      matrix test) and asserts, PER SCREEN, the exact teaching the lead's criterion names:
//        · paper-final : the render call + recordIds{md,tex,meta} + "不 render = 标准链未走完 / V14 FAIL";
//        · paper-review: the cross-review self-check (crossReviewers / VMU_PAPER_CROSS_REVIEW_UNMET);
//        · paper-write : the per-section 「证据等级：」 line (VMU_PAPER_GRADE_LINE_MISSING);
//   2. exposes the collector's `highlights.paper` reading (the audit reads the counts, not the prose);
//   3. proves the assertions are not decoration: it COPIES the tree, deletes the sentence from the copied pack, and
//      re-runs the detector in a child process — each lamp must come back RED (the screen assertion, not merely a
//      source grep, is what fails).
import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..')
const { collect, PAPER_PHASES } = await import(new URL('../scripts/sim/audit/prompt-sections.mjs', import.meta.url).href)
const got = await collect({ slots: ['chair', 'member', 'temp'], phases: [...PAPER_PHASES] })
const textOf = (slot, phase) => (got.texts || []).filter((t) => t.slot === slot && t.phase === phase).map((t) => t.text).join('\n')

test('paper-final teaches the post-final standard chain: render → recordIds → reopen-closure, with the V14 consequence', () => {
  for (const slot of ['chair', 'member', 'temp']) {
    const t = textOf(slot, 'paper-final')
    assert.ok(t.includes('vibe_v5_paper { action:"render", target }'), slot + ': the render call is named verbatim')
    assert.ok(t.includes('recordIds{md,tex,meta}'), slot + ': the render receipt keys are named')
    assert.ok(t.includes('不 render = 标准链未走完'), slot + ': skipping render is named as an incomplete standard chain')
    assert.ok(t.includes('V14 直接判 FAIL'), slot + ': the consequence (V14 FAIL) is named')
    assert.ok(t.indexOf('action:"render"') < t.indexOf('reopen-closure'), slot + ': render comes BEFORE the closing window')
    assert.equal(got.highlights.paper.final.slots.includes(slot), true, slot + ': the collector highlight records the final-screen hit')
  }
})

test('paper-review teaches the cross-review self-check (two DIFFERENT non-authors, deliverable:true)', () => {
  for (const slot of ['chair', 'member', 'temp']) {
    const t = textOf(slot, 'paper-review')
    assert.ok(t.includes('调用 final 前的互审自检'), slot + ': the self-check is a named block')
    assert.ok(t.includes('两位**不同**'), slot + ': two DIFFERENT members are required')
    assert.ok(t.includes('都不是本节作者'), slot + ': neither may be the part author')
    assert.ok(t.includes('deliverable:true'), slot + ': the accepted vote value is named')
    assert.ok(t.includes('crossReviewers'), slot + ': the gate detail field a seat checks is named')
    assert.ok(t.includes('VMU_PAPER_CROSS_REVIEW_UNMET'), slot + ': the named refusal is taught')
    assert.equal(got.highlights.paper.review.slots.includes(slot), true, slot + ': the collector highlight records the review-screen hit')
  }
})

test('paper-write teaches the per-section 「证据等级：」 line requirement', () => {
  for (const slot of ['chair', 'member', 'temp']) {
    const t = textOf(slot, 'paper-write')
    assert.ok(t.includes('证据等级：'), slot + ': the grade-line literal is taught')
    assert.ok(t.includes('VMU_PAPER_GRADE_LINE_MISSING'), slot + ': the named refusal is taught')
    assert.ok(t.includes('每一节正文必须有'), slot + ': the requirement is per section, not once per paper')
    assert.equal(got.highlights.paper.write.slots.includes(slot), true, slot + ': the collector highlight records the write-screen hit')
  }
})

test('LAMP: copying the tree and deleting the final-guide render sentence turns the screen assertion RED', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'paper-render-lamp-'))
  try {
    for (const dir of ['vibe-math-vmu', join('scripts', 'sim'), join('scripts', 'lib')]) {
      cpSync(join(REPO, dir), join(tmp, dir), { recursive: true })
    }
    cpSync(join(REPO, 'package.json'), join(tmp, 'package.json'))
    const packFile = join(tmp, 'vibe-math-vmu', 'packs', 'v5r', 'prompts', 'v5r-paper-prompts.js')
    const original = readFileSync(packFile, 'utf8')
    const probeFile = join(tmp, 'probe.mjs')
    const collectorUrl = pathToFileURL(join(tmp, 'scripts', 'sim', 'audit', 'prompt-sections.mjs')).href
    // The probe reports the SAME literal assertions the suite above makes, per screen. (The highlight detector alone
    // is intentionally softer: it also accepts the pre-existing cross-review sentence in the review guide, so it must
    // not be the lamp's subject — a lamp has to die when the exact teaching sentence dies.)
    writeFileSync(probeFile, [
      "const { collect } = await import(" + JSON.stringify(collectorUrl) + ")",
      "const got = await collect({ slots: ['member'], phases: ['paper-final', 'paper-review', 'paper-write'] })",
      "const txt = (phase) => got.texts.filter((t) => t.phase === phase).map((t) => t.text).join('\\n')",
      "const finalText = txt('paper-final'), reviewText = txt('paper-review'), writeText = txt('paper-write')",
      "const reading = {",
      "  final: Number(finalText.includes('vibe_v5_paper { action:\\\"render\\\", target }') && finalText.includes('recordIds{md,tex,meta}') && finalText.includes('不 render = 标准链未走完')),",
      "  review: Number(reviewText.includes('调用 final 前的互审自检') && reviewText.includes('crossReviewers') && reviewText.includes('VMU_PAPER_CROSS_REVIEW_UNMET')),",
      "  write: Number(writeText.includes('证据等级：') && writeText.includes('VMU_PAPER_GRADE_LINE_MISSING') && writeText.includes('每一节正文必须有')),",
      "}",
      "console.log(JSON.stringify(reading))",
    ].join('\n'))
    const runProbe = () => {
      const res = spawnSync(process.execPath, [probeFile], { cwd: tmp, encoding: 'utf8', timeout: 180000 })
      assert.equal(res.status, 0, 'lamp probe must run: ' + String(res.stderr || '').slice(-500))
      return JSON.parse(String(res.stdout || '').trim().split('\n').pop())
    }
    assert.deepEqual(runProbe(), { final: 1, review: 1, write: 1 }, 'lamp precondition: the unmutated copy is GREEN')
    const lamps = [
      { what: 'final render sentence', needle: /^\s*'· ★ \*\*final 成功后的标准链[^\n]*\n/m, key: 'final' },
      { what: 'review crossReviewers sentence', needle: /^\s*'· ★ \*\*调用 final 前的互审自检[^\n]*\n/m, key: 'review' },
      { what: 'write 证据等级 sentence', needle: /^\s*'· ★ \*\*每一节正文必须有[^\n]*\n/m, key: 'write' },
    ]
    for (const lamp of lamps) {
      const mutated = original.replace(lamp.needle, '')
      assert.notEqual(mutated, original, 'lamp precondition: the ' + lamp.what + ' exists in the copied tree')
      writeFileSync(packFile, mutated)
      const reading = runProbe()
      assert.equal(reading[lamp.key], 0, 'LAMP FAILED: deleting the ' + lamp.what + ' did not turn the screen assertion RED')
      writeFileSync(packFile, original)
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

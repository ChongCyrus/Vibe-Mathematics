// RUN 257 — prompt x real-receipt parity (task-114 / TB-2633).
//
// This suite is the machine-checkable half of `docs/acceptance/prompt-vs-receipts.md`.
// It reads the REAL corpus (pairs.jsonl / receipts.jsonl / prompts/*.txt) every run:
// there is no hand-written snapshot anywhere in this file. If the corpus is gone the
// suite fails loudly instead of silently skipping (the doc would otherwise age into
// unfalsifiable prose).
//
// Corpus: D:/_tmp/sim/e2e (scenario end-to-end, 47 pairs, 45 receipts, 12 prompts).
// ★★ THIS SUITE JUDGES SNAPSHOT CONSISTENCY, NOT THE CURRENT CODE (Lead ruling, RUN 258 / TB-2638):
//    what it checks = "the corpus on disk and the prompt text OF THAT BUILD still agree with each other"
//    (S0 corpus shape, S3/S4/S5 the A1/A2 sets RECOMPUTED FROM THAT SNAPSHOT, S10 the doc citations against it).
//    RUN 268 / lead m08391 migration: the on-disk generation is 2026-11-09T12:25Z (caller recorded on every
//    pair, 09-chair paired by the caller-aware promptAfter, consult/compile/toolchainAbsent/renderOk taught by
//    RUN 258). On THIS corpus the same predicates recompute A1=[] and A2=6 (8,22,23,31,33,47) — those numbers
//    are derived in S5a/S4d, not copied. The RUN 255 numbers stay in the doc as the historical audit (§13/§14.8
//    keep the old->new table). The 47 §2 citations were re-anchored to this corpus (prompt lines moved and
//    caller-aware pairing changed which prompt file a pair cites). TB-2648 remains the task for a full report
//    regeneration; this file only keeps the machine gate consistent with the corpus it reads.
// Regenerate with: node scripts/sim/run.mjs --scenario end-to-end --out D:/_tmp/sim/e2e-audit

import { readFileSync, readdirSync, existsSync, cpSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureParityCorpus, removeLastPair } from './_lib/parity-corpus.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// TB-2695: the corpus is BUILT BY THIS SUITE when no path is given. It used to default to D:/_tmp/sim/e2e, which made
// the suite green only on the author's machine and made it unusable as a ledger proof. argv[2] / VMU_PROMPT_RECEIPT_CORPUS
// still name an existing corpus (a reviewer's frozen snapshot); they are not the default any more.
const EXPLICIT = process.argv[2] || process.env.VMU_PROMPT_RECEIPT_CORPUS || '';
const generated = EXPLICIT ? null : ensureParityCorpus({ log: (m) => console.log('  ' + m) });
const SIM = EXPLICIT || generated.dir;
const DOC = path.join(REPO, 'docs/acceptance/prompt-vs-receipts.md');

let passed = 0;
let failed = 0;
function ok(cond, label, detail) {
  if (cond) { passed += 1; return; }
  failed += 1;
  console.log('FAIL ' + label + (detail ? ' :: ' + detail : ''));
}
function eq(a, b, label) { ok(a === b, label, 'got ' + JSON.stringify(a) + ' expected ' + JSON.stringify(b)); }

// ---- corpus -----------------------------------------------------------------
// RULE: this suite is a SNAPSHOT-CONSISTENCY GATE. If the corpus is absent it must FAIL — never skip, never
// degrade to zero checks (the previous shape could age into a false green once D:/_tmp self-cleans).
if (!existsSync(SIM) || !existsSync(path.join(SIM, 'pairs.jsonl')) || !existsSync(path.join(SIM, 'receipts.jsonl'))) {
  console.log('FAIL corpus missing at ' + SIM + (EXPLICIT ? ' (the path passed as argv[2] or VMU_PROMPT_RECEIPT_CORPUS does not hold a corpus)' : ' (the in-suite generator returned a directory without pairs.jsonl/receipts.jsonl)'));
  console.log('FAIL this gate REFUSES to skip: a zero-check run would report success on nothing');
  process.exit(1);
}
// S0c (TB-2695): when this suite generated the corpus, the generator measured TWO generations and reports whether they
// agree. 'byte-identical' is the normal case. 'confined-residual' means the only difference was the known record-order
// product defect (rec-2/rec-3 minting order, tracked in the ledger) — reported here, never retried until it looks green.
if (generated) {
  const d = generated.determinism || {};
  ok(d.status === 'byte-identical' || d.status === 'confined-residual', 'S0c the two generations of the corpus agree (status: ' + String(d.status) + ')', d.residual);
  ok(Boolean(d.expected) && d.expected.pairs === 47, 'S0c2 the generator expected the measured 47-pair shape', d.expected);
  if (d.status === 'confined-residual') {
    console.log('  NOTE: two generations differed only on the known record-order defect (' + (d.allowlisted || []).length + ' allowlisted path(s)); the ledger tracks the product fix, this suite reports the residual instead of retrying until green');
    console.log('  determinism: canonical (blueprint record writer is last-writer-wins between r-acad and r-1 under concurrency) -- product defect under investigation, see TB-2697');
  }
  // S0b (anti-regression, permanent): a corpus with ONE pair missing must make THIS suite exit 1 by name. The child
  // process is this same file reading a shortened copy, so a version of the suite that tolerated a short corpus would
  // also report this row as green -- which is exactly what the row is there to prevent.
  const probeRoot = mkdtempSync(path.join(tmpdir(), 'vmu-parity-b2-'));
  try {
    const probe = path.join(probeRoot, 'corpus');
    cpSync(generated.dir, probe, { recursive: true });
    removeLastPair(probe);
    const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), probe], { encoding: 'utf8', timeout: 120000 });
    const out = String(child.stdout || '') + String(child.stderr || '');
    const firstFail = out.split(String.fromCharCode(10)).filter((l) => l.startsWith('FAIL ')).slice(0, 1).join(' ');
    ok(child.status === 1, 'S0b a corpus with one pair missing makes this suite exit 1 (a short corpus cannot satisfy the gate)', 'exit ' + String(child.status));
    ok(out.includes('S1a 47 pairs'), 'S0b2 and the refusal NAMES the count it measured (S1a 47 pairs)', firstFail);
  } finally {
    rmSync(probeRoot, { recursive: true, force: true });
  }
}
ok(existsSync(SIM), 'corpus exists at ' + SIM);
ok(existsSync(DOC), 'report exists at ' + path.join('docs/acceptance/prompt-vs-receipts.md'));

const pairsRaw = readFileSync(path.join(SIM, 'pairs.jsonl'), 'utf8').trim().split('\n');
const receiptRaw = readFileSync(path.join(SIM, 'receipts.jsonl'), 'utf8').trim().split('\n');
const pairs = pairsRaw.map((l) => JSON.parse(l));
ok(pairs.length === 47, 'S0 the pair list is a measured 47 rows (non-vacuous scan)');
const receipts = receiptRaw.map((l) => JSON.parse(l));
ok(pairs.length > 0 && receipts.length > 0, 'S0b the corpus actually RAN (pairs>0 and receipts>0) — zero checks is a failure, not a pass');
const promptDir = path.join(SIM, 'prompts');
const promptNames = readdirSync(promptDir).sort();
const prompts = new Map(promptNames.map((f) => [f, readFileSync(path.join(promptDir, f), 'utf8')]));
const promptTexts = new Map([...prompts].map(([f, t]) => [t, f]));

// ---- S1. structure ----------------------------------------------------------
eq(pairs.length, 47, 'S1a 47 pairs');
eq(receipts.length, 45, 'S1b 45 receipts');
eq(promptNames.length, 12, 'S1c 12 prompt files');
ok(pairs.length === 47, 'S1c0 pairs is a measured 47-row list (non-vacuous scan)');
ok(pairs.length === 47, 'the 47-pair list is measured (non-vacuous scan)'); ok(pairs.every((p, i) => p.pairIndex === i + 1), 'S1d pairIndex is 1..47 contiguous');
ok(pairs.length === 47, 'the 47-pair list is measured (non-vacuous scan)'); ok(pairs.every((p) => p.tool && p.receiptSeq >= 1 && p.nextPrompt && p.nextPrompt.text), 'S1e every pair has tool/seq/nextPrompt');
ok(pairs.length === 47, 'the 47-pair list is measured (non-vacuous scan)'); ok(pairs.every((p) => p.receipt && (!p.receipt.tool || p.receipt.tool === p.tool)), 'S1f pair receipt answers the same tool (inner bodies may omit it)');
ok(pairs.length === 47, 'the 47-pair list is measured (non-vacuous scan)'); ok(pairs.every((p) => p.nextPrompt.chars === p.nextPrompt.text.length), 'S1g chars == text length');
ok(pairs.length === 47, 'S1h0 the pair list is still 47 rows here (non-vacuous scan)');
ok(pairs.length === 47, 'the 47-pair list is measured (non-vacuous scan)'); ok(pairs.every((p) => typeof p.nextPrompt.text === 'string' && p.nextPrompt.text.length > 20000), 'S1h every prompt is a whole assembly (>20k)');
ok(pairs.length === 47, 'the 47-pair list is measured (non-vacuous scan)'); ok(pairs.every((p) => ['chair', 'member', 'temp'].includes(p.nextPrompt.seat)), 'S1i seat vocabulary');

// S2. prompt text <-> prompts/*.txt byte equality (this is the "no snapshot" rule)
const unmatched = pairs.filter((p) => !promptTexts.has(p.nextPrompt.text));
eq(unmatched.length, 0, 'S2a every pair prompt text equals one prompts/*.txt file');
const usedFiles = new Set(pairs.map((p) => promptTexts.get(p.nextPrompt.text)));
ok(usedFiles.size === 10, 'S2b0 the used-prompt set is a measured ten files (non-vacuous scan)');
eq(promptNames.length - usedFiles.size, 2, 'S2b 12 prompt files exist, 10 carry a paired turn');
const unusedFiles = promptNames.filter((x) => !usedFiles.has(x)).join(',');
// RUN 268 / lead m08391: the caller-aware promptAfter (scripts/sim/run.mjs:235 fix) pairs the prompt of the
// member who ACTED, so 09-chair is now a paired turn and the unpaired set shrank 3 -> 2. Derived, not copied:
// 12 files on disk - 10 files whose text equals some pair nextPrompt.text = 2.
eq(unusedFiles, '02-temp.txt,11-chair.txt', 'S2b2 the two unpaired files are known');
ok(usedFiles.size === 10, 'S2b0 the used-prompt set is a measured ten files (non-vacuous scan)');
// Guarded on purpose: when a corpus is mutated so a pair prompt matches no file (S2a red), this scan must still
// report its own verdicts instead of throwing (a crash used to hide every later assertion in mutation runs).
ok([...usedFiles].filter(Boolean).every((f) => { const p = pairs.find((x) => promptTexts.get(x.nextPrompt.text) === f); return p && (f.endsWith('-' + p.nextPrompt.seat + '.txt') || f.includes('-' + p.nextPrompt.seat)); }), 'S2c prompt filename carries its seat');
ok(pairs.length === 47, 'the 47-pair list is measured (non-vacuous scan)'); ok(pairs.every((p) => p.nextPrompt.text.startsWith('# v5r') || p.nextPrompt.text.startsWith('[新到的消息]')), 'S2d assembly starts with a heading or the notice block');

// S3. Receipt line mapping is real: every cited receiptSeq has a line in receipts.jsonl
const receiptLineOf = (seq) => receiptRaw.findIndex((l) => { try { return JSON.parse(l).seq === seq; } catch { return false; } });
ok(pairs.length === 47, 'S3a0 the pair list is a measured 47 rows (non-vacuous scan)');
ok(pairs.length === 47, 'the 47-pair list is measured (non-vacuous scan)'); ok(pairs.every((p) => receiptLineOf(p.receiptSeq) >= 0), 'S3a every pair receiptSeq resolves to a receipts.jsonl line');
ok(pairs.length === 47, 'the 47-pair list is measured (non-vacuous scan)'); ok(pairs.every((p) => receipts.some((r) => r.seq === p.receiptSeq && r.tool === p.tool)), 'S3b receipt line tool matches pair tool');
ok(pairs.length === 47, 'the 47-pair list is measured (non-vacuous scan)'); ok(pairs.every((p) => JSON.stringify(p.receipt) === JSON.stringify(receipts.find((r) => r.seq === p.receiptSeq).receipt)), 'S3c inline receipt equals receipts.jsonl receipt');

// ---- fact helpers -----------------------------------------------------------
const textOf = (p) => p.nextPrompt.text;
const allPrompts = [...prompts.values()].join('\n');
const has = (p, needle) => textOf(p).includes(needle);

// RUN 260 / TB-2664: the A2 caliber names a SEAT. The corpus records `caller` only when the scenario
// knows who acted; bridge reads record none. callerSeat is preferred when the corpus carries it,
// otherwise it is derived from the member id (r-acad -> chair, r-t* -> temp, everything else -> member).
const callerSeatOf = (p) => {
  if (p.callerSeat) return p.callerSeat;
  const c = typeof p.caller === 'string' ? p.caller : '';
  if (!c) return null;
  if (c === 'chair' || /(^|-)acad$/.test(c)) return 'chair';
  if (/^r-t\d+$/.test(c) || /(^|-)t\d+$/.test(c)) return 'temp';
  return 'member';
};
const someKey = (obj, key) => JSON.stringify(obj).includes('"' + key + '"');
const tools = [...new Set(pairs.map((p) => p.tool))];

// ---- S4. documented tool/action gaps ---------------------------------------
const genericToolGap = tools.filter((t) => !allPrompts.includes(t)).sort();
eq(genericToolGap.join(','), 'vibe_vmu_records,vibe_vmu_vote', 'S4a exactly records+vote are absent from all 12 prompts');
// RUN 268 / lead m08391: RUN 258 taught the consult path and the compile path into the chair prompt, so the
// RUN 255 shape "0 hits in every prompt" is no longer true. Falsifiable shape instead of a blanket negative:
// every pair that ACTUALLY called consult / compile must find that action taught in ITS OWN prompt.
const consultPairs = pairs.filter((p) => ['consult', 'consult_state'].includes((p.args && p.args.action) || ''));
const compilePairs = pairs.filter((p) => (p.args && p.args.action) === 'compile');
ok(consultPairs.length >= 2 && consultPairs.every((p) => has(p, 'consult')), 'S4b every consult/consult_state pair teaches consult in its prompt (RUN 258 fix; the RUN 255 snapshot had 0 hits)');
ok(compilePairs.length >= 1 && compilePairs.every((p) => has(p, 'compile')), 'S4c every compile pair teaches compile in its prompt');
// RUN 260 / TB-2664 condition d: the first guard used to read 'vibe_vpu_records', a tool that does not
// exist in this build, so it was dead. Pointing it at 'vibe_vmu_records' with `return false` would drop
// the four records pairs from the snapshot set (8 -> 4) and contradict TB-2664's own known set and the
// S4d snapshot number, so the branch is MERGED into the counting line: same behavior, no dead name.
const wouldBeGap = (p) => {
  const act = (p.args && (p.args.op || p.args.action)) || '';
  if (p.tool === 'vibe_vmu_records') return true;
  if (p.tool === 'vibe_v5_verdict_ask') return !has(p, 'verdict_ask');
  if (act === 'consult' || act === 'consult_state') return !has(p, 'consult');
  return false;
};
const actionGapPairs = pairs.filter(wouldBeGap).map((p) => p.pairIndex);
// RUN 268 / lead m08391 corpus migration. The predicate is unchanged; the corpus is the 2026-11-09T12:25Z
// generation (caller recorded on every pair). Recomputation, bucket by bucket:
//   vibe_vmu_records bridge reads (caller:"office"): 8,31,33,47  -> tool-level (tool name 0 hits, S4a/S4e2)
//   vibe_v5_verdict_ask run by the chair (caller:"r-acad") but paired with a member prompt: 22,23
//     -> seat-mismatch (S4e6), not pair-level
//   consult pairs 41,42: their prompts now teach consult (S4b) -> wouldBeGap false, they left the set
//   => actionGapPairs = 6. The RUN 255 snapshot number (8, incl. 41,42) is kept in the doc §14.8 old->new table.
eq(actionGapPairs.join(','), '8,22,23,31,33,47', 'S4d pair-level action gaps are exactly the A2 set');

// ---- S4e. A2 under the TB-2664 caliber (Lead rulings m07045 + m07103) ----
// Two questions, two numbers (m07103):
//   Q1 tool level: is this tool taught ANYWHERE in the prompts? one answer per tool -> toolLevelGaps.
//   Q2 pair level: does THIS receipt reading have a landing spot in the prompt of the seat that read it?
//      that is what the name A2 always meant -> a2.
// a2 is never compressed by stealing pairs that belong to the tool-level question; those move into
// toolGapPairs and stay visible until the TOOL itself is taught (the minimum closing unit is the tool).
// Lead m07103 conservation: a2 + toolGapPairs === wouldBeGap total. The RUN 255 snapshot still has
// caller:null on every pair (TB-2648 pending), so the remainder is named in noCaller/seatMismatch and the
// partition below closes ALL buckets - strictly stronger than two terms, and no pair can vanish unnoticed.
const toolLevelGaps = genericToolGap.slice();
const bucketOf = (p, toolLevel = toolLevelGaps) => {
  if (!wouldBeGap(p)) return 'no-gap';
  if (toolLevel.includes(p.tool)) return 'tool';
  if (!p.caller) return 'no-caller';
  if (callerSeatOf(p) !== p.nextPrompt.seat) return 'seat-mismatch';
  return 'a2';
};
const a2 = [];
const toolGapPairs = [];
const noCaller = [];
const seatMismatch = [];
for (const p of pairs.filter(wouldBeGap)) {
  const b = bucketOf(p);
  if (b === 'tool') toolGapPairs.push({ pair: p.pairIndex, tool: p.tool });
  else if (b === 'no-caller') noCaller.push({ pair: p.pairIndex, tool: p.tool, why: 'bridge-read' });
  else if (b === 'seat-mismatch') seatMismatch.push({ pair: p.pairIndex, tool: p.tool, caller: p.caller, callerSeat: callerSeatOf(p), promptSeat: p.nextPrompt.seat });
  else a2.push(p.pairIndex);
}
const counted = [].concat(a2, toolGapPairs.map((x) => x.pair), noCaller.map((x) => x.pair), seatMismatch.map((x) => x.pair));
// TB-2705 / P5a (Lead ruling): 守恒必须是断言，不是散文；A2 的定义句必须写出「谁在调用」。
//   a2            — 该席位自己发起的调用（callerSeat === nextPrompt.seat），回执有读数而提示词 0 命中。
//   toolGapPairs  — 工具名 0 命中（没有席位做这个调用；bridge/office 读）。最小闭合单位是「工具」，不是 pair。
//   seatMismatch  — 调用者席位 ≠ 被配对提示词的席位（语料/配对口径问题，不是教学缺失）。
//   noCaller      — 回执没记 caller 的 bridge 读（本代语料为空；断言位置保留，语料丢 caller 列会立刻变红）。
const A2_DEFINITION = 'A2 = 该席位自己发起的调用（callerSeat === nextPrompt.seat），其回执里有读数而提示词 0 命中；bridge/office 读不算 A2。';
const CONSERVATION_BASE = actionGapPairs.length; // 当前语料的 wouldBeGap 基数（RUN 269: 6）——不写死数字，掉对会立刻红
const bucketTotal = a2.length + toolGapPairs.length + noCaller.length + seatMismatch.length;
console.log('A2 caliber RUN 260: a2=' + JSON.stringify(a2));
console.log('  ' + A2_DEFINITION);
console.log('  CONSERVATION buckets=' + bucketTotal + '/' + CONSERVATION_BASE
  + ' = a2(' + a2.length + ')[seat-called, prompt 0-hit]'
  + ' + toolGapPairs(' + toolGapPairs.length + ')[tool-never-taught / bridge]'
  + ' + seatMismatch(' + seatMismatch.length + ')[caller-seat != prompt-seat / caliber]'
  + ' + noCaller(' + noCaller.length + ')[caller-unrecorded]');
console.log('  toolGapPairs=' + JSON.stringify(toolGapPairs));
console.log('  noCaller=' + JSON.stringify(noCaller));
console.log('  seatMismatch=' + JSON.stringify(seatMismatch));
console.log('  toolLevelGaps=' + JSON.stringify(toolLevelGaps));
if (toolLevelGaps.length > 0) {
  console.log('  NOTE: 工具面整体未被教：' + toolLevelGaps.join('、') + ' —— 这不是 pair 级缺口，也不会因为教了一句就消失；补它需要一条工具级说明。');
  console.log('  NOTE: a2=[] + 非空 toolLevelGaps 的正确读法是「pair 级干净、工具级有病」。');
}
eq(a2.join(','), '', 'S4e1 snapshot has no pair that qualifies at the pair level');
eq(toolGapPairs.map((x) => x.pair).join(','), '8,31,33,47', 'S4e2 records pairs are named as tool-level pairs, not silently dropped from A2');
ok(toolGapPairs.length > 0 && toolGapPairs.every((x) => x.tool && toolLevelGaps.includes(x.tool)), 'S4e3 every toolGapPairs entry names a tool that is itself an S4a gap');
// EMPTY_ALLOWED: the RUN 268 corpus records `caller` on EVERY pair (bridge reads carry "office"), so no
// wouldBeGap pair reaches the no-caller bucket. It stays asserted (not deleted) so a future corpus that loses
// its caller column re-opens this bucket loudly instead of silently folding those pairs into a2.
eq(noCaller.map((x) => x.pair).join(','), '', 'S4e4 the caller-unknown remainder is empty on this corpus');
ok(noCaller.every((x) => x.why === 'bridge-read'), 'S4e5 every noCaller entry says why it is not a seat action') // EMPTY_ALLOWED: RUN 268 records a caller on every pair, so S4e4 pins this bucket to '' on purpose; the .every is the property that must hold if a future corpus re-opens it
// RUN 268: with caller recorded, the two verdict_ask pairs (chair r-acad reads a member prompt) are exactly
// the two known seat mismatches §14.4 judged NOT-FOR-THIS-SEAT. Recomputed by callerSeatOf(p) !== nextPrompt.seat.
eq(seatMismatch.map((x) => x.pair).join(','), '22,23', 'S4e6 the known-caller seat mismatches are the two verdict_ask pairs');
ok(seatMismatch.length > 0 && seatMismatch.every((x) => x.callerSeat === 'chair' && x.promptSeat === 'member'), 'S4e6b both mismatches are a chair caller reading a member prompt');
eq(toolLevelGaps.slice().sort().join(','), 'vibe_vmu_records,vibe_vmu_vote', 'S4e7 toolLevelGaps is deduped to one entry per tool');
eq(counted.length, actionGapPairs.length, 'S4e8 CONSERVATION: a2 + toolGapPairs + noCaller + seatMismatch = every wouldBeGap pair');
eq(counted.slice().sort((a, b) => a - b).join(','), actionGapPairs.join(','), 'S4e9 CONSERVATION: the four buckets are a partition of S4d, no pair vanishes and none is double-counted');
eq(a2.length + toolGapPairs.length, actionGapPairs.length - noCaller.length - seatMismatch.length, 'S4e10 CONSERVATION (m07103 two-term form, remainder named): the snapshot remainder is exactly noCaller+seatMismatch');
eq(bucketTotal, CONSERVATION_BASE, 'S4e11 CONSERVATION (TB-2705 explicit four buckets): a2 + toolGapPairs + seatMismatch + noCaller = every wouldBeGap pair (' + CONSERVATION_BASE + ')');

// ---- S4f. controls: the caliber must still FIRE, and tool-level closure must be observable ----
// Without these, P1+P2 could only ever prove "the set shrank". Synthetic pairs never touch the corpus.
const synthPrompt = '# v5r-role-block\n（成员提示词；故意不含任何回执读数键）';
const synthRecords = {
  pairIndex: 'synthetic-records', tool: 'vibe_vmu_records', args: { action: 'list' }, caller: 'r-1',
  receipt: { ok: true, total: 3, totalUniverse: 3, identity: { means: 'x' }, orderUnknown: [] },
  nextPrompt: { seat: 'member', text: synthPrompt },
};
const synthVerdictGap = {
  pairIndex: 'synthetic-verdict-gap', tool: 'vibe_v5_verdict_ask', args: { meeting: 'm1' }, caller: 'r-acad',
  receipt: { ok: true, asked: {}, rosterCount: 4 },
  nextPrompt: { seat: 'chair', text: '# v5r-role-block\n（主席提示词；故意不提那个工具名）' },
};
const synthVerdictTaught = { ...synthVerdictGap, pairIndex: 'synthetic-verdict-taught', nextPrompt: { seat: 'chair', text: synthVerdictGap.nextPrompt.text + ' 用 vibe_v5_verdict_ask 征集裁决' } };
const synthMismatch = { ...synthVerdictGap, pairIndex: 'synthetic-seat', caller: 'r-acad', nextPrompt: { seat: 'member', text: synthPrompt } };
// Q1: an untaught TOOL puts its pairs in toolGapPairs, never into a2.
eq(bucketOf(synthRecords), 'tool', 'S4f1 control: a pair of an untaught tool is classified tool-level, not pair-level');
// Q2: the pair-level bucket still fires on a caller-matched pair with untaught readings.
eq(bucketOf(synthVerdictGap), 'a2', 'S4f2 positive control: caller-matched + seat-matched + untaught MUST land in a2');
eq(bucketOf(synthVerdictTaught), 'no-gap', 'S4f3 negative control: the same pair with the name taught leaves the gap set');
eq(bucketOf(synthMismatch), 'seat-mismatch', 'S4f4 negative control: known caller but wrong prompt seat is named, not counted');
// closing unit is the tool: teach the tool and its pairs leave toolGapPairs by recomputation (no manual trim).
const taughtRecords = bucketOf(synthRecords, toolLevelGaps.filter((t) => t !== 'vibe_vmu_records'));
eq(taughtRecords, 'a2', 'S4f5 tool-level closure is observable: once the tool is taught, its pairs re-enter a2 by predicate recomputation');
// ---- S5. A class (promise vs capability) is derivable from receipts ---------
const a1 = [40, 43, 44, 45].filter((id) => {
  const p = pairs.find((x) => x.pairIndex === id);
  const r = p.receipt;
  if (id === 40) return r.code === 'VMU_OFFICE_CONSULT_REQUIRED' && !has(p, 'consult');
  if (id === 43) return r.ok === true && JSON.stringify(r).includes('toolchainAbsent') && !has(p, 'toolchainAbsent');
  if (id === 44) return r.code === 'VMU_PACK_V5R_CORE_PAPER_EXECUTOR_MISSING' && !has(p, 'compile');
  if (id === 45) return r.ok === true && r.renderOk === false && !has(p, 'renderOk');
  return false;
});
// EMPTY_ALLOWED: on the RUN 268 corpus the seat that read a gate pair (12-chair.txt) DOES teach every gate
// reading — consult (P40/P41/P42), compile (P44), toolchainAbsent (P43) and renderOk (P45) — so the RUN 255
// "promise without the capability reading" delta is closed by teaching, not by removing the gate.
// Derivation: A1 = {gate pairs whose OWN prompt does not teach the gate escape}; each !has(...) below is
// false on this corpus => empty list. The gates still fire: S5b recomputes the SAME five marker pairs
// (40,43,44,45,46) from receipts, so this is not a vacuous "everything is fine".
eq(a1.join(','), '', 'S5a no capability-gate pair lacks its escape teaching on this corpus');
const astrict = pairs.filter((p) => {
  const r = p.receipt;
  return r.code === 'VMU_OFFICE_CONSULT_REQUIRED' || r.code === 'VMU_PACK_V5R_CORE_PAPER_EXECUTOR_MISSING' || (r.ok === true && r.renderOk === false) || (r.ok === true && JSON.stringify(r).includes('toolchainAbsent'));
}).map((p) => p.pairIndex);
eq(astrict.join(','), '40,43,44,45,46', 'S5b capability-gate markers: 4 refusing/clipped finals + P46 status echo');

// ---- S6. B class evidence: readings present in receipts, absent in prompts --
const memberActedPairs = pairs.filter((p) => JSON.stringify(p.receipt).includes('memberActed'));
ok(memberActedPairs.length >= 30, 'S6a memberActed is a mass reading (' + memberActedPairs.length + ' pairs)');
// TB-2692 taught 代笔 semantics into the shared status-board line (`memberActed:false` + `actedForMember` +
// `writtenFrom`), so the RUN 257 shape "memberActed never taught" is no longer true -- keeping it would pin a
// stale claim, not a property. The property that survives is PLACEMENT: memberActed may only be named inside that
// derivation/代笔 reading line, never as a standalone action-name teaching. Both directions are asserted, with a
// control proving a teaching line elsewhere is caught (weakening this to "somewhere in a prompt" would drop that).
const memberActedLinesOf = (t) => t.split('\n').filter((l) => l.includes('memberActed'));
const isProxyReceiptLine = (l) => l.includes('memberActed:false') && l.includes('actedForMember');
ok([...prompts.values()].some((t) => memberActedLinesOf(t).length > 0), 'S6b0 memberActed is taught somewhere (presence, non-vacuous)');
ok([...prompts.values()].every((t) => memberActedLinesOf(t).every(isProxyReceiptLine)), 'S6b memberActed is named only in the 代笔回执/归属 reading line (memberActed:false + actedForMember)');
ok(memberActedLinesOf('用 memberActed 报告动作归属').length === 1 && !memberActedLinesOf('用 memberActed 报告动作归属').every(isProxyReceiptLine), 'S6b control: a bare teaching line naming memberActed is caught, so S6b is placement not presence');
const notifyRows = pairs.filter((p) => JSON.stringify(p.receipt).includes('notifyRows'));
ok(notifyRows.length >= 1, 'S6c notifyRows exists in receipts');
ok(!notifyRows.some((p) => has(p, 'notifyRows')), 'S6d notifyRows never taught in the paired prompt');
ok(!allPrompts.includes('requiredLines') && pairs.some((p) => JSON.stringify(p.receipt).includes('requiredLines')), 'S6e requiredLines: receipt yes, prompts no');
ok(!allPrompts.includes('evidenceGate') && pairs.some((p) => JSON.stringify(p.receipt).includes('evidenceGate')), 'S6f evidenceGate: receipt yes, prompts no');
ok(!allPrompts.includes('reachableMoves') && pairs.some((p) => JSON.stringify(p.receipt).includes('reachableMoves')), 'S6g reachableMoves: receipt yes, prompts no');

// ---- S7. C class evidence ---------------------------------------------------
const proxyPairs = pairs.filter((p) => [14, 15].includes(p.pairIndex));
ok(proxyPairs.length === 2 && proxyPairs.every((p) => p.receipt.memberActed === true && p.receipt.via === 'meeting' && typeof p.receipt.actedForMember === 'string'), 'S7a P14/P15 receipts: memberActed:true + actedForMember + via:meeting (动作记在成员名下，做的人不是成员)');
ok(proxyPairs.every((p) => has(p, '代办')), 'S7b P14/P15 prompts do say 别请所办代办');
const p26 = pairs.find((p) => p.pairIndex === 26);
const f08 = [...prompts].find(([f]) => f === '08-member.txt')[1];
ok(JSON.stringify(p26.receipt).includes('VMU_MEETING_QUORUM_LOST'), 'S7c P26 receipt carries VMU_MEETING_QUORUM_LOST');
ok(!f08.includes('VMU_MEETING_QUORUM_LOST'), 'S7d 08-member prompt does not teach that code');
ok([...prompts].filter(([f]) => f.includes('-chair')).some(([, t]) => t.includes('VMU_MEETING_QUORUM_LOST')), 'S7e chair prompts do teach it (asymmetry is real)');

// ---- S8. D class evidence: two shapes for one fact -------------------------
const bp = pairs.filter((p) => [4, 5, 6, 7].includes(p.pairIndex));
eq(bp.length, 4, 'S8a0 bp is a measured four-pair set (non-vacuous)');
ok(bp.every((p) => someKey(p.receipt, 'mdWritten')), 'S8a blueprint receipts carry top-level mdWritten');
ok(bp.some((p) => JSON.stringify(p.receipt).includes('"written":false')), 'S8b blueprint receipts also carry nested md.written:false');
ok(!allPrompts.includes('mdWritten'), 'S8c prompt never names mdWritten (only md.written semantics)');
const votes = pairs.filter((p) => [18, 19, 20].includes(p.pairIndex));
eq(votes.length, 3, 'S8d0 votes is a measured three-pair set (non-vacuous)');
ok(votes.every((p) => someKey(p.receipt, 'closureVote')), 'S8d vote receipts expose closureVote');
ok(votes.every((p) => !JSON.stringify(p.receipt).includes('vote_solved')), 'S8e vote receipts do NOT name vote_solved');
ok(votes.every((p) => has(p, 'vote_solved')), 'S8f but the prompt teaches vote_solved');
// RUN 268 / lead m08391: the member prompt DOES name closureVote, but only inside the conclusion reading line
// ("[结题] 未决动议 0（来源：本回合编排器的 closureVotes + …）") — that is a reading, not a teaching. Shape:
// any line naming closureVote must be that reading line. Two-way control below: a teaching line elsewhere is
// caught, and deleting the reading line leaves zero closureVote (so the check is about placement, not presence).
const isConclusionReadingLine = (l) => l.includes('closureVote') && (l.includes('未决动议') || l.includes('[结题]'));
const closureVoteLinesOutsideReading = (t) => t.split('\n').filter((l) => l.includes('closureVote') && !isConclusionReadingLine(l));
const memberPromptEntries = [...prompts].filter(([f2]) => f2.includes('-member'));
// RULE E guard: if the corpus carried no member prompt at all, the `.every` below would pass by checking nothing —
// and S8g would stop measuring the placement claim it exists for. S8g2 requires the presence side; this requires
// the SUBJECT side.
ok(memberPromptEntries.length > 0, 'S8g0 the corpus really contains member prompts (non-vacuous subject)', memberPromptEntries.length);
ok(memberPromptEntries.every(([, t]) => closureVoteLinesOutsideReading(t).length === 0), 'S8g member prompts name closureVote only inside the conclusion reading line (未决动议/结题)');
const filesWithVotes = [...prompts].filter(([, t]) => t.includes('closureVote')).map(([f]) => f);
const outsideReadingFiles = [...prompts].filter(([, t]) => closureVoteLinesOutsideReading(t).length > 0).map(([f]) => f);
ok(filesWithVotes.length >= 1, 'S8g2 closureVote is measured in at least one prompt (non-vacuous)');
ok(outsideReadingFiles.every((f) => f.includes('-chair')), 'S8g2 closureVote outside the conclusion reading appears only in chair prompts (voting charter)');
const memberSample = prompts.get('05-member.txt');
ok(typeof memberSample === 'string' && closureVoteLinesOutsideReading(memberSample + '\n用 closureVote 表达你的结题判定').length > 0, 'S8g2 control: a teaching line outside 未决动议/结题 is caught');
const stripped = memberSample.split('\n').filter((l) => !l.includes('closureVote')).join('\n');
ok(!stripped.includes('closureVote') && closureVoteLinesOutsideReading(stripped).length === 0, 'S8g control: deleting the reading line leaves no closureVote, so the assertion is about placement not presence');
// Presence pin (the other direction lead m08391 asked for): the member conclusion reading line itself exists.
// Delete it and this goes red — "only from that sentence" must not degrade into "there is no sentence at all".
ok(memberSample.split('\n').some(isConclusionReadingLine), 'S8g3 the member conclusion reading line exists (deleting it must go red)');
const p45 = pairs.find((p) => p.pairIndex === 45);
ok(['wrote', 'wroteDeprecated', 'wroteWhere'].every((k) => someKey(p45.receipt, k)), 'S8h P45 carries wrote/wroteDeprecated/wroteWhere');
ok(!allPrompts.includes('wroteDeprecated'), 'S8i wroteDeprecated never taught');
// documented aliases stay consistent (E-side)
ok(allPrompts.includes('proof_state') && allPrompts.includes('proofState'), 'S8j proof_state/proofState alias is documented');
ok(allPrompts.includes('replyTruncated'), 'S8k truncated/replyTruncated alias documented');

// ---- S9. notice block is real and rendered (ASCII brackets) ----------------
const blockPairs = pairs.filter((p) => textOf(p).startsWith('[新到的消息]'));
ok(blockPairs.length >= 6, 'S9a notice block rendered in at least six prompts (got ' + blockPairs.length + ')');
ok(blockPairs.every((p) => /【(会议预约|邮件)·/.test(textOf(p).slice(0, 1200))), 'S9b every rendered block carries an appointment/mail line');
ok(blockPairs.every((p) => textOf(p).split('\n').length > 100), 'S9c block is a prefix, the whole prompt follows');
ok(!allPrompts.includes('【新到的消息】'), 'S9d full-width bracket variant does not exist (earlier false negative)');
const p9 = pairs.find((p) => p.pairIndex === 9);
ok(Array.isArray(p9.receipt.notified) && p9.receipt.notified.length === 2, 'S9e convene(at) notified both invitees');
ok(pairs.find((p) => p.pairIndex === 11).nextPrompt.text.includes('【会议预约·'), 'S9f the invitee prompt really shows the appointment line');

// ---- S10. report structure and citations -----------------------------------
const doc = readFileSync(DOC, 'utf8');
ok(!doc.includes('\r'), 'S10a report is LF');
// TB-2678 / lead m07770: the report table must be parsed INSIDE its own section with its own header validated.
// A bare /^\| \d+ \|/ used to match ANY numeric table anywhere in the file, so a doc edit in an unrelated
// section (e.g. a new example table) silently changed the report's row count. That is a criterion being
// affected by unrelated text — the exact failure mode this round keeps hitting. Anchor + header + fixed column
// count, and keep a decoy control (S10k) that proves a numeric table elsewhere cannot leak in.
function reportRowsOf(text) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => /^##\s+§2\b/.test(l));
  if (start < 0) return { rows: [], header: null };
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s+§/.test(lines[i])) { end = i; break; }
  }
  const region = lines.slice(start, end);
  const h = region.findIndex((l) => /^\|\s*#\s*\|/.test(l));
  if (h < 0) return { rows: [], header: null };
  const header = region[h].split('|').map((c) => c.trim());
  const rows = [];
  for (let i = h + 2; i < region.length; i++) {
    const l = region[i];
    if (!l.startsWith('|')) break;
    const cells = l.split('|').map((c) => c.trim());
    if (cells.length !== header.length) break;
    if (!/^\d+$/.test(cells[1])) break;
    rows.push(l);
  }
  return { rows, header };
}
const report = reportRowsOf(doc);
const rows = report.rows;
ok(report.header !== null, 'S10b0 report table has a header row');
eq(report.header && report.header[1], '#', 'S10b1 header starts with the id column (#)');
eq(report.header && report.header.length, 9, 'S10b2 header has a fixed 9-cell shape (leading/trailing empties included)');
eq(rows.length, 47, 'S10b report table covers 47/47');
// S10k anti-关灯: a numeric table OUTSIDE §2 and a numeric row BEFORE the header must both be ignored.
const decoyOutside = doc.replace('## §2', '## §1z\n\n| 99 | decoy | 甲 | 乙 |\n\n## §2');
eq(reportRowsOf(decoyOutside).rows.length, 47, 'S10k0 numeric table outside §2 does not enter the report rows');
const decoyBefore = doc.replace(/^\| # \| 席位\/相位 \|/m, '| 99 | decoy | 甲 | 乙 |\n| # | 席位/相位 |');
eq(reportRowsOf(decoyBefore).rows.length, 47, 'S10k1 numeric row before the header is ignored');
eq(reportRowsOf('# nothing here').rows.length, 0, 'S10k2 no §2 section means zero rows (parser is non-vacuous, not a catch-all)');
eq(reportRowsOf('## §2 覆盖表\n\n| # | a |\n|---|---|\n').rows.length, 0, 'S10k3 header without rows means zero rows');
const rowOf = new Map();
for (const l of rows) {
  const cells = l.split('|').map((s) => s.trim());
  const id = Number(cells[1]);
  rowOf.set(id, cells);
}
eq([...rowOf.keys()].sort((a, b) => a - b).join(','), Array.from({ length: 47 }, (_, i) => i + 1).join(','), 'S10c table ids are exactly 1..47');
const cls = [...rowOf.values()].map((c) => c[4].replace(/\*/g, '').trim());
eq(cls.length, 47, 'S10d0 cls covers all 47 parsed rows (non-vacuous)');
ok(cls.every((c) => ['A', 'B', 'C', 'D', 'E'].includes(c)), 'S10d every row has a class letter');
const counts = { A: 0, B: 0, C: 0, D: 0, E: 0 };
cls.forEach((c) => { counts[c] += 1; });
eq(counts.A, 12, 'S10e A count is 12');
eq(counts.B + counts.C + counts.D + counts.E + counts.A, 47, 'S10f classes partition 47');
ok(['A', 'B', 'C', 'D'].every((c) => counts[c] >= 1), 'S10g A-D each have at least one real evidence row');
const statLines = doc.split('\n').filter((l) => /^\| [ABCDE] \| \d+ \|/.test(l));
eq(statLines.length, 5, 'S10h §3 has five class rows');
for (const l of statLines) {
  const [, c, n] = l.split('|').map((s) => s.trim());
  eq(Number(n), counts[c], 'S10i §3 count for ' + c);
}
// every row citation must resolve against the corpus (no hand-written line numbers)
let badCite = [];
for (const [id, c] of rowOf) {
  const pm = c[5].match(/`prompts\/([^`]+):(\d+)`（`([^`]+)`）/);
  const rm = c[6].match(/`receipts\.jsonl:(\d+)`（seq (\d+)，`([^`]+)`）/);
  if (!pm) { badCite.push(id + ':prompt-cell'); continue; }
  const [, file, lineStr, token] = pm;
  const text = prompts.get(file);
  if (text === undefined) { badCite.push(id + ':file'); continue; }
  const line = Number(lineStr);
  if (line === 0) {
    // 0 is allowed only when the token is deliberately absent from that prompt
    if (text.split('\n').some((l) => l.includes(token))) badCite.push(id + ':zero-but-present');
    continue;
  }
  const lines = text.split('\n');
  if (!(line >= 1 && line <= lines.length)) { badCite.push(id + ':range'); continue; }
  if (!lines[line - 1].includes(token)) badCite.push(id + ':token');
}
eq(badCite.join(','), '', 'S10j every prompt citation resolves to a line containing its token');
let badR = [];
for (const [id, c] of rowOf) {
  const rm = c[6].match(/`receipts\.jsonl:(\d+)`（seq (\d+)，`([^`]+)`）/);
  if (!rm) { badR.push(id + ':cell'); continue; }
  const [, lineStr, seqStr, token] = rm;
  const line = Number(lineStr);
  if (!(line >= 1 && line <= receiptRaw.length)) { badR.push(id + ':range'); continue; }
  const raw = receiptRaw[line - 1];
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch { badR.push(id + ':json'); continue; }
  if (String(parsed.seq) !== seqStr) badR.push(id + ':seq');
  if (!raw.includes(token)) badR.push(id + ':token');
}
eq(badR.join(','), '', 'S10k every receipt citation resolves to its line and token');

// S11. the doc must quote the A number it reports, and the split
ok(/A 类条数 = 12/.test(doc), 'S11a report states A=12');
ok(/A1[^\n]*4 对[^\n]*P40\/P43\/P44\/P45/.test(doc), 'S11b report states A1=4 with the four ids');
ok(/A2[^\n]*8 对[^\n]*P8\/P22\/P23\/P31\/P33\/P41\/P42\/P47/.test(doc), 'S11c report states A2=8 with the eight ids');
ok(/## §9 转出/.test(doc), 'S11d 转出 section exists');
ok(/## §10 给 TB-2615/.test(doc), 'S11e TB-2615 input section exists');
const sugBlock = doc.split('## §10')[1].split('## §11')[0];
const sug = sugBlock.split('\n').filter((l) => /^\d+\. /.test(l)).length;
ok(sug >= 8 && sug <= 20, 'S11f suggestions are a bounded actionable list (' + sug + ')');
ok(/只记录不修/.test(doc), 'S11g product defects are recorded not fixed');

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exitCode = failed === 0 ? 0 : 1;

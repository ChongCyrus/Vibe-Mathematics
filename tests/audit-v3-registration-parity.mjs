/**
 * Probe for prompt-audit M3 (v3): the two registerTool paths must not drift.
 *
 * v3 declares each tool twice — the session handler table inside makeSession()
 * (registerTool(name, description, parameters, executeFn)) and the real
 * `tools.register` at apply scope (registerTool(name, description, parameters,
 * handlerName)). The parameter schemas are guarded by audit-prompt-invariants
 * (I13/I14); the DESCRIPTIONS were not, and five of them had already drifted.
 *
 * Checks per tool (33 of them):
 *   - MISSING      : registered on only one path
 *   - DESC-DRIFT   : the description argument text differs between the two paths
 *   - SCHEMA-DRIFT : the parameter-schema argument text differs
 *   - NO-SOURCE    : a description is not read from the shared module-level table
 *                    (the "one source of truth" claim would be nominal only)
 *   - BAD-REF      : a TOOL_DESC.<name> reference has no matching entry in the table
 *
 * Read-only: parses the source text, never executes the plugin.
 *
 * Sensitivity probe (the suite must be falsifiable):
 *   node tests/audit-v3-registration-parity.mjs --self-probe '["<from>","<to>"]'
 *   The pair is applied to the source text, so a first-occurrence mutation makes the
 *   second path disagree and the probe must exit 1.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
let SRC = readFileSync(join(HERE, '..', 'vibe-math-v3', 'vibe-math-v3.js'), 'utf8');

const SELF_PROBE = process.argv.indexOf('--self-probe');
if (SELF_PROBE !== -1 && process.argv[SELF_PROBE + 1]) {
  const [from, to] = JSON.parse(process.argv[SELF_PROBE + 1]);
  const before = SRC;
  SRC = SRC.replace(from, to);
  if (SRC === before) { console.log('MUTATION DID NOT APPLY: ' + from); process.exit(2); }
}

/** Skip a string literal (any quote) starting at i; returns the index after it. */
function skipString(s, i) {
  const q = s[i];
  i++;
  while (i < s.length) {
    if (s[i] === '\\') { i += 2; continue; }
    if (s[i] === q) return i + 1;
    i++;
  }
  return i;
}

// Normalise line endings: this file is checked out with CRLF on Windows, and a stray \r
// between an entry's `,` and its key would make the table parser under-count (it did).
SRC = SRC.replace(/\r/g, '');

/** Collect a top-level-comma-separated argument list starting at `open` (an index of `(`). */
function argsOf(s, open) {
  let depth = 0;
  const args = [];
  let cur = '';
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (c === '"' || c === "'" || c === '`') { const j = skipString(s, i); cur += s.slice(i, j); i = j - 1; continue; }
    if (c === '(' || c === '[' || c === '{') { depth++; cur += c; continue; }
    if (c === ')' || c === ']' || c === '}') {
      depth--;
      if (depth === 0) { args.push(cur.trim()); return args; }
      cur += c; continue;
    }
    if (c === ',' && depth === 1) { args.push(cur.trim()); cur = ''; continue; }
    if (depth >= 1) cur += c;
  }
  return args;
}

const calls = [];
for (const m of SRC.matchAll(/registerTool\(\s*'([A-Za-z0-9_]+)'/g)) {
  const open = SRC.indexOf('(', m.index + 'registerTool'.length);
  calls.push({ name: m[1], at: m.index, args: argsOf(SRC, open) });
}

const byName = new Map();
for (const c of calls) {
  if (!byName.has(c.name)) byName.set(c.name, []);
  byName.get(c.name).push(c);
}

// The shared description table (module-level `const TOOL_DESC = { … }`).
//
// Keys are collected with an ANCHORED PER-LINE regex inside the table's own text slice —
// string values are blanked out first (keeping every newline) so the `{`/`}` braces inside
// the sync_meta documentation text cannot shift a brace-depth scanner (that mis-parse is
// exactly how an earlier version of this probe silently saw 15 of 33 entries).
const tableAt = SRC.search(/const\s+TOOL_DESC\s*=\s*\{/);
const tableKeys = new Set();
if (tableAt !== -1) {
  const open = SRC.indexOf('{', tableAt);
  // slice to the matching close brace with strings blanked (newlines preserved)
  let depth = 0;
  let end = -1;
  let blanked = '';
  for (let i = open; i < SRC.length; i++) {
    const c = SRC[i];
    if (c === '"' || c === "'" || c === '`') {
      const stop = skipString(SRC, i);
      for (let k = i; k < stop; k++) blanked += (SRC[k] === '\n' ? '\n' : ' ');
      i = stop - 1;
      continue;
    }
    blanked += c;
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  const tableText = blanked.slice(0, end === -1 ? blanked.length : end - open + 1);
  for (const m of tableText.matchAll(/^[ \t]*([A-Za-z_$][\w$]*)\s*:/gm)) tableKeys.add(m[1]);
}

let descDrift = 0;
let schemaDrift = 0;
let noSource = 0;
let badRef = 0;
const missing = [];
for (const [name, list] of byName) {
  if (list.length !== 2) { missing.push(name + ' (' + list.length + ' registration(s))'); continue; }
  const [a, b] = list.map((c) => ({ desc: c.args[1], schema: c.args[2] }));
  if (a.desc !== b.desc) {
    descDrift++;
    console.log('DESC-DRIFT   ' + name);
    console.log('   path#1: ' + String(a.desc).slice(0, 140));
    console.log('   path#2: ' + String(b.desc).slice(0, 140));
  }
  if (a.schema !== b.schema) {
    schemaDrift++;
    console.log('SCHEMA-DRIFT ' + name);
    console.log('   path#1: ' + String(a.schema).slice(0, 140));
    console.log('   path#2: ' + String(b.schema).slice(0, 140));
  }
  for (const d of [a.desc, b.desc]) {
    const want = 'TOOL_DESC.' + name;
    if (d === want) continue;
    if (/^TOOL_DESC\./.test(d)) { badRef++; console.log('BAD-REF      ' + name + ' → ' + d); continue; }
    noSource++;
    console.log('NO-SOURCE    ' + name + ' → ' + String(d).slice(0, 140));
  }
}

console.log('shared TOOL_DESC entries: ' + tableKeys.size);
console.log('tools registered twice: ' + [...byName.values()].filter((v) => v.length === 2).length + ' / ' + byName.size);
console.log('DESC-DRIFT count: ' + descDrift);
console.log('SCHEMA-DRIFT count: ' + schemaDrift);
console.log('descriptions not from the shared table: ' + noSource);
console.log('bad TOOL_DESC references: ' + badRef);
console.log('one-path-only tools: ' + (missing.length ? missing.join(', ') : 'none'));
const ok = descDrift === 0 && schemaDrift === 0 && noSource === 0 && badRef === 0 && missing.length === 0 && tableKeys.size === byName.size;
console.log(ok ? '=== DESC PARITY OK ===' : '=== DESC PARITY FAILED ===');
process.exit(ok ? 0 : 1);

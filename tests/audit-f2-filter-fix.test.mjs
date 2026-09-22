/**
 * Regression test for the F-2 fix.
 *
 * The bug: v2/v3 built their tool permission filter from hardcoded names
 * ['web_search','web','fetch'] / ['bash','pwsh']. The host applies that filter
 * when establishing a continuable child (dsh-subagent:554) and throws on any name
 * outside its registered set (dsh-tools:2803), so the child was never created.
 *
 * What this test asserts, without a mock of the behaviour under test:
 *   1. the source no longer names the non-tools 'web'/'fetch';
 *   2. the script-tool list matches THIS platform's registered interpreter;
 *   3. a retry driven by the host's real rejection message yields a filter the
 *      host accepts, by running the plugin's own sanitizer loaded from its source.
 *
 * Usage: node tests/audit-f2-filter-fix.test.mjs
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

let passed = 0;
let failed = 0;
const assert = (cond, msg) => {
  if (cond) { passed += 1; console.log('  ok - ' + msg) }
  else { failed += 1; console.error('  FAIL - ' + msg) }
};

const REPO = fileURLToPath(new URL('..', import.meta.url));
const PLUGINS = {
  'vibe-math-v2': `${REPO}/vibe-math-v2/vibe-math-v2.js`,
  'vibe-math-v3': `${REPO}/vibe-math-v3/vibe-math-v3.js`,
};

/** What this win32 preset composition registers (see prove-f2-toolfilter-throws). */
const REGISTERED = new Set([
  'pwsh', 'read', 'write', 'edit', 'glob', 'grep', 'web_search', 'todo_write',
  'ask_user_question', 'skill', 'present', 'job_output', 'job_list', 'job_kill',
  'create_goal', 'get_goal', 'update_goal', 'ralph', 'interrupt_agent',
  'list_subagents', 'subagent', 'workflow', 'send_message', 'read_image',
]);

/** The host's real rejection message shape (dsh-tools/lib/index.js:2803). */
const hostRejection = (unknown) =>
  `tools.restrict() names unknown global tool${unknown.length > 1 ? 's' : ''} ` +
  `${unknown.map((n) => `"${n}"`).join(', ')}; known global tools: ${[...REGISTERED].sort().join(', ')}`;

/** The host's actual acceptance rule. */
function hostAccepts(filter) {
  for (const key of ['allow', 'deny']) {
    const list = filter[key];
    if (!list) continue;
    if (list.some((n) => !REGISTERED.has(n))) return false;
  }
  return true;
}

/**
 * Load the plugin's own sanitizeToolFilter / registeredToolsFromError by
 * evaluating its source in a sandbox that exposes only those declarations.
 * This runs the REAL implementation text, not a re-implementation.
 */
async function loadSanitizer(file) {
  const src = await readFile(file, 'utf8');
  const grab = (name) => {
    const start = src.indexOf(`function ${name}(`);
    if (start < 0) throw new Error(`could not find ${name}`);
    // brace matching from the first '{' of the body
    let i = src.indexOf('{', start);
    let depth = 0;
    for (let j = i; j < src.length; j++) {
      if (src[j] === '{') depth += 1;
      else if (src[j] === '}') { depth -= 1; if (depth === 0) return src.slice(start, j + 1) }
    }
    throw new Error(`unterminated ${name}`);
  };
  const body = `${grab('sanitizeToolFilter')}\n${grab('registeredToolsFromError')}\nreturn { sanitizeToolFilter, registeredToolsFromError };`;
  return new Function(body)();
}

for (const [preset, file] of Object.entries(PLUGINS)) {
  console.log(`\n=== ${preset} ===`);
  const src = await readFile(file, 'utf8');

  // (1) the non-tools are gone
  assert(!/['"]web['"]/.test(src.replace(/[^:]\/\/.*$/gm, '')), `no bare 'web' tool name remains`);
  assert(!/['"]fetch['"]/.test(src.replace(/[^:]\/\/.*$/gm, '')), `no bare 'fetch' tool name remains`);

  // (2) platform-correct script interpreter
  const isWin = process.platform === 'win32';
  assert(
    src.includes(`process.platform === 'win32'`) && /SCRIPT_TOOLS\s*=\s*IS_WINDOWS/.test(src),
    `script-tool list is platform-split (expect ${isWin ? 'pwsh' : 'bash'} on ${process.platform})`,
  );
  const scriptMatch = src.match(/const SCRIPT_TOOLS\s*=\s*IS_WINDOWS\s*\?\s*\[([^\]]*)\]\s*:\s*\[([^\]]*)\]/);
  assert(scriptMatch !== null, 'SCRIPT_TOOLS parses as a platform ternary');
  if (scriptMatch) {
    const win = scriptMatch[1].match(/['"]([^'"]+)['"]/)[1];
    const nix = scriptMatch[2].match(/['"]([^'"]+)['"]/)[1];
    const chosen = isWin ? win : nix;
    assert(REGISTERED.has(chosen), `chosen script tool "${chosen}" is registered on ${process.platform}`);
    assert(chosen === (isWin ? 'pwsh' : 'bash'), `chosen script tool is the platform interpreter`);
    const other = isWin ? nix : win;
    assert(!REGISTERED.has(other), `the other platform's tool "${other}" is correctly excluded here`);
  }

  // (3) the retry cycle, using the plugin's real sanitizer
  const { sanitizeToolFilter, registeredToolsFromError } = await loadSanitizer(file);

  // simulate the OLD (buggy) filter to prove the sanitizer rescues it
  const buggyDeny = { deny: ['web_search', 'web', 'fetch', 'bash', 'pwsh'] };
  assert(!hostAccepts(buggyDeny), 'the pre-fix filter is genuinely rejected by the host rule');

  const rejection = hostRejection(buggyDeny.deny.filter((n) => !REGISTERED.has(n)));
  assert(/names unknown global tool/.test(rejection), 'host rejection message has the expected shape');

  const known = registeredToolsFromError(rejection);
  assert(known instanceof Set && known.size === REGISTERED.size, 'registeredToolsFromError recovered every registered name');

  const rescued = sanitizeToolFilter(buggyDeny, known);
  assert(rescued !== undefined, 'sanitizeToolFilter returned a non-empty filter');
  assert(hostAccepts(rescued), `host now ACCEPTS the sanitized filter ${JSON.stringify(rescued)}`);
  assert(rescued.deny.includes('web_search'), 'the deny intent that DOES exist is preserved (web_search)');
  assert(rescued.deny.includes('pwsh'), 'the deny intent that DOES exist is preserved (pwsh)');
  assert(!rescued.deny.includes('web'), 'the non-tool "web" was dropped');
  assert(!rescued.deny.includes('bash'), 'the unregistered "bash" was dropped');

  // a filter that sanitizes to nothing must be dropped, not passed empty
  const allBad = sanitizeToolFilter({ deny: ['web', 'fetch'] }, known);
  assert(allBad === undefined, 'a filter whose every name is unknown collapses to undefined (not an empty object)');

  // a valid filter passes through untouched
  const good = { deny: ['web_search'] };
  assert(
    JSON.stringify(sanitizeToolFilter(good, known)) === JSON.stringify(good),
    'an already-valid filter is unchanged',
  );
}

console.log(`\n=== F-2 FILTER FIX RESULT: ${passed} passed, ${failed} failed ===`);
process.exitCode = failed === 0 ? 0 : 1;

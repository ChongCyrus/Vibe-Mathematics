/**
 * tests/vmu-run56-mailbox-seam-means.test.mjs — the mailbox health reading must say WHICH seam its boolean is about.
 *
 * WHY THIS EXISTS (live run 56, finding F-41). A member read `delivery.hasDeliverSeam: false` (actually
 * `mechanism.hasDeliverSeam`) and reported it as a product defect — "my mail is not being delivered". The boolean was
 * TRUE about its own subject (no push seam was injected into that mailbox face) and the member's conclusion was
 * FALSE about a different subject (the turn loop carries prompts by its own path). Every reading that publishes a
 * capability boolean has to publish, in the same receipt, what the boolean is a statement about — and what its
 * absence does NOT mean. This suite pins that sentence and the fact that it never claims delivery works.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { createMailbox } = await import('../vibe-math-vmu/kernel/mailbox.js')

let pass = 0
let fail = 0
const t = (name, fn) => { try { fn(); pass++; process.stdout.write('  ok ' + name + '\n') } catch (e) { fail++; process.stdout.write('  FAIL ' + name + '\n    ' + (e && e.message) + '\n') } }

const dirs = []
const tempRoot = () => { const d = mkdtempSync(join(tmpdir(), 'vmu56-mail-')); dirs.push(d); return d }

const makeMailbox = (opts = {}) => createMailbox(Object.assign({ kernelSession: 'session-seam' }, opts))

/**
 * §1 the reading is present and says which seam it is about — on a mailbox with NO push seam (the live shape: the
 * host does not inject one, because delivery to members happens through the turn loop).
 */
{
  const box = makeMailbox({ root: tempRoot() })
  const status = box.status()
  const mechanism = status.mechanism
  t('§1.1 mechanism publishes a means sentence next to the booleans', () => {
    assert.equal(typeof mechanism.means, 'string')
    assert.ok(mechanism.means.length > 80, 'the sentence must be long enough to be about something')
  })
  t('§1.2 the sentence names the seam it is about (open({deliver}))', () => {
    assert.ok(mechanism.means.includes('open({deliver})'), 'must name the actual seam: ' + mechanism.means)
  })
  t('§1.3 the sentence says where mail is delivered instead (the turn loop)', () => {
    assert.ok(/turn loop/.test(mechanism.means), 'must point at the loop that does carry mail: ' + mechanism.means)
  })
  t('§1.4 the sentence says absence is NOT invisibility', () => {
    assert.ok(/NOT evidence that mail is invisible/.test(mechanism.means), 'must refuse the wrong conclusion: ' + mechanism.means)
  })
  t('§1.5 the boolean on an uninjected face is still false — the fix is a sentence, not a lie', () => {
    assert.equal(mechanism.hasDeliverSeam, false)
  })
}

/** §2 the same receipt must not pretend the seam exists: with one injected, the boolean is true and the sentence is unchanged. */
{
  const delivered = []
  const box = makeMailbox({ root: tempRoot(), deliver: (row) => { delivered.push(row) } })
  const mechanism = box.status().mechanism
  t('§2.1 an injected push seam flips the boolean', () => { assert.equal(mechanism.hasDeliverSeam, true) })
  t('§2.2 the means sentence does not depend on the value (it describes both cases)', () => {
    assert.ok(/PUSH seam/.test(mechanism.means))
    assert.ok(/false means mail is not pushed/.test(mechanism.means))
  })
}

/**
 * §3 the sentence is the same on a mailbox whose shared store is not bound — the mechanism statement is about seams,
 * not about storage, and a reader must not be able to confuse the two.
 */
{
  const box = makeMailbox({ root: tempRoot() })
  const mechanism = box.status().mechanism
  t('§3.1 storage facts stay separate from seam facts', () => {
    assert.equal(typeof mechanism.hasStore, 'boolean')
    assert.ok(!/hasStore/.test(mechanism.means), 'the means sentence is about the deliver seam only')
  })
  t('§3.2 the mechanism block keeps the keys older readers rely on', () => {
    for (const key of ['hasDeliverSeam', 'hasAudienceSeam', 'hasStore', 'clockInjected']) {
      assert.ok(Object.prototype.hasOwnProperty.call(mechanism, key), 'missing ' + key)
    }
  })
}

for (const d of dirs) { try { rmSync(d, { recursive: true, force: true }) } catch { /* temp */ } }

process.stdout.write('\nRUN56 MAILBOX SEAM MEANS  ' + pass + ' passed / ' + fail + ' failed\n')
process.exitCode = fail === 0 ? 0 : 1

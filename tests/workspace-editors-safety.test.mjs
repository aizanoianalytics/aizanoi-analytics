import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const workspace = read('frontend/js/v3/apps/workspace/src/app.js');
const notepad = read('frontend/js/v3/apps/notepad/src/app.js');
const webEditor = read('frontend/js/v3/apps/web-editor/src/app.js');
const recycle = read('frontend/js/v3/apps/recycle-bin/src/app.js');

test('A01: backup restore needs an explicit ok; Cancel/Escape/backdrop ("cancel") must not import', () => {
  const restore = workspace.slice(workspace.indexOf('async function restoreBackup'), workspace.indexOf('async function protectStorage'));
  assert.match(restore, /approved!=='ok'/);
  assert.match(restore, /if\(approved!=='ok'[^;]*\)return/);
  assert.doesNotMatch(restore, /if\(!approved\)/);
  assert.ok(restore.indexOf("approved!=='ok'") < restore.indexOf('importBackup'));
});

test('dialog resolves Escape/backdrop/close to the non-ok "cancel" value', async () => {
  const dialog = read('frontend/js/v3/workspace/dialog.js');
  assert.match(dialog, /\.then\(\(value\) => value \|\| 'cancel'\)/);
  assert.match(dialog, /event\.key === 'Escape'[\s\S]{0,120}settle\(null\)/);
});

test('revision tracker: a save only clears the edits it captured', async () => {
  for (const app of ['notepad', 'web-editor']) {
    const { createRevisionTracker } = await import(`../frontend/js/v3/apps/${app}/src/revision.js`);
    const r = createRevisionTracker();
    r.baseline();
    assert.equal(r.dirty, false);
    r.touch();
    const snap = r.snapshot();
    r.touch(); // typed while the write was in flight
    assert.equal(r.markSaved(snap), true);
    assert.equal(r.dirty, true, 'newer edit stays dirty');
    r.markSaved(r.snapshot());
    assert.equal(r.dirty, false);
  }
});

test('revision tracker: out-of-order saves and saves of a replaced document', async () => {
  const { createRevisionTracker } = await import('../frontend/js/v3/apps/notepad/src/revision.js');
  const r = createRevisionTracker();
  r.baseline();
  r.touch(); const a = r.snapshot();
  r.touch(); const b = r.snapshot();
  r.markSaved(b); r.markSaved(a);
  assert.equal(r.dirty, false, 'late older save must not re-dirty');
  r.touch(); const old = r.snapshot();
  r.baseline(); // another file loaded
  assert.equal(r.markSaved(old), false, 'stale save must not change identity');
  assert.equal(r.dirty, false);
});

test('Notepad and Web Editor bind saves and loads to revisions/tokens', () => {
  assert.match(notepad, /markSaved\(snap\)/);
  assert.match(notepad, /seq!==loadSeq/);
  assert.match(webEditor, /markSaved\(snap\)/);
  assert.match(webEditor, /seq!==loadSeq/);
  assert.doesNotMatch(notepad + webEditor, /\bdirty=(true|false)/);
});

test('A27: Web Editor Tab is escapable (Esc then Tab, Shift+Tab, toggle) and announced', () => {
  assert.match(webEditor, /event\.key==='Escape'&&tabIndent/);
  assert.match(webEditor, /event\.shiftKey\|\|tabEscape/);
  assert.match(webEditor, /data-web-tab-toggle/);
  assert.match(webEditor, /announceTab\(/);
});

test('A28/A08/A10/A30/A31 guards exist', () => {
  assert.match(webEditor, /if\(openButton\)\{/);
  assert.match(workspace, /gen!==previewGen/);
  assert.match(workspace, /finally\{fileInput\.value=''/);
  assert.match(workspace, /ArrowDown/);
  assert.match(workspace, /closeMenu\(\{restoreFocus:action==='cancel'\}\)/);
  assert.match(recycle, /focusSuccessor\(/);
});

test('A03/A04: concurrent edits stay dirty after an in-flight save resolves', async () => {
  for (const app of ['notepad', 'web-editor']) {
    const { createRevisionTracker } = await import(`../frontend/js/v3/apps/${app}/src/revision.js`);
    const tracker = createRevisionTracker();
    tracker.baseline();
    tracker.touch(); // user typed "one two"
    const snap = tracker.snapshot();
    const write = (async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
      return tracker.markSaved(snap);
    })();
    tracker.touch(); // user typed "three" while the write was in flight
    assert.equal(await write, true, `${app}: save resolves for its own snapshot`);
    assert.equal(tracker.dirty, true, `${app}: newer edit stays dirty`);
    assert.equal(tracker.markSaved(tracker.snapshot()), true);
    assert.equal(tracker.dirty, false, `${app}: saving the newest revision clears dirty`);
  }
});

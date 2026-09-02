import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const workspaceApp = read('frontend/js/v3/apps/workspace/src/app.js');
const backupModule = read('frontend/js/v3/workspace/backup.js');
const capabilities = read('frontend/js/v3/capabilities.js');
const cameraApp = read('frontend/js/v3/apps/camera/src/app.js');

test('Workspace exposes versioned backup, restore, quota and persistence controls through capabilities', () => {
  assert.match(backupModule, /aizanoi-workspace-backup/);
  assert.match(backupModule, /BACKUP_VERSION = 1/);
  assert.match(backupModule, /exportWorkspaceBackup/);
  assert.match(backupModule, /importWorkspaceBackup/);
  assert.match(backupModule, /navigator\?\.storage|globalThis\.navigator\?\.storage/);
  assert.match(backupModule, /storage\.estimate/);
  assert.match(backupModule, /storage\.persist/);
  assert.match(capabilities, /exportBackup:backup\.exportWorkspaceBackup/);
  assert.match(capabilities, /importBackup:backup\.importWorkspaceBackup/);
  assert.match(workspaceApp, /data-ws-export/);
  assert.match(workspaceApp, /data-ws-restore/);
  assert.match(workspaceApp, /data-ws-persist/);
  assert.match(workspaceApp, /Origin storage/);
});

test('Workspace validates a backup before opening the destructive restore transaction', () => {
  const validateIndex = backupModule.indexOf('const nodes = validateArchive(parsed);');
  const clearIndex = backupModule.indexOf('store.clear();');
  assert.ok(validateIndex >= 0, 'restore must validate the archive');
  assert.ok(clearIndex > validateIndex, 'restore must not clear IndexedDB before archive validation completes');
  assert.match(backupModule, /parent\/child relationship is inconsistent/);
  assert.match(backupModule, /missing required system folders/);
});

test('Workspace omits action menus for locked system folders', () => {
  assert.match(workspaceApp, /lockedIds=new Set/);
  assert.match(workspaceApp, /isLockedId\(child\.id\)\?'':/);
  assert.match(workspaceApp, /if\(isLockedId\(id\)\)return/);
});

test('Camera photo flow cannot request microphone access', () => {
  assert.match(cameraApp, /getUserMedia\(\{video:\{facingMode:'user'\},audio:false\}\)/);
  assert.doesNotMatch(cameraApp, /audio:true|microphoneActive|requestOptionalMicrophone/);
  assert.match(cameraApp, /Audio is not requested, recorded or uploaded/);
});

test('Workspace HTML escaping keeps complete entities for attribute-safe labels', () => {
  assert.match(workspaceApp, /'"':'&quot;'/);
});

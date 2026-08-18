import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless:true });

async function openWorkspace(viewport={width:1440,height:900}, mobile=false) {
  const context = await browser.newContext({ viewport, isMobile:mobile, hasTouch:mobile, deviceScaleFactor:mobile ? 2 : 1 });
  const page = await context.newPage();
  const errors=[];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => { if (message.type()==='error') errors.push(message.text()); });
  await page.route('**/api/health', (route) => route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify({ ok:true }) }));
  await page.route('**/api/chat', (route) => route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify({ reply:'Mock contextual response' }) }));
  await page.goto(`${base}/`, { waitUntil:'networkidle' });
  await page.waitForFunction(() => !document.getElementById('boot') || document.getElementById('boot').classList.contains('hide'), null, { timeout:6000 });
  await page.waitForFunction(() => Boolean(window.AIZANOI_OS && window.AIZANOI_PLATFORM && window.AIZANOI_WORKSPACE), null, { timeout:8000 });
  return { context, page, errors };
}

{
  const { context, page, errors } = await openWorkspace();
  assert.equal(await page.locator('link[rel="manifest"]').getAttribute('href'), '/manifest.webmanifest');
  assert.ok(await page.locator('link[href="/css/os-distribution.css"]').count(), 'distribution design layer missing');
  assert.deepEqual(await page.evaluate(() => window.AIZANOI_WORKSPACE.archive.collections), ['Notes','Sources','Screenshots','Datasets','Exports','Uploads']);
  assert.equal(await page.evaluate(() => window.AIZANOI_PLATFORM.VERSION), '2.1.0-field');

  await page.evaluate(() => window.AIZANOI_OS.launchApp('archive'));
  const archive = page.locator('.az-workbench-window[data-workbench-app="archive"]');
  await archive.waitFor();
  assert.match(await archive.innerText(), /FIELD ARCHIVE/);
  assert.match(await archive.innerText(), /Welcome to Aizanoi Field Archive/);

  const fileInput = archive.locator('[data-archive-file-input]');
  await fileInput.setInputFiles([
    { name:'people.csv', mimeType:'text/csv', buffer:Buffer.from('name,team,score\nAda,Research,91\nMarcus,Field,84\nLivia,Research,88\n') },
    { name:'excavation.md', mimeType:'text/markdown', buffer:Buffer.from('# Excavation note\n\nTemple sector context and stratigraphy.') },
    { name:'artifact.svg', mimeType:'image/svg+xml', buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160"><rect width="240" height="160" fill="#172630"/><circle cx="120" cy="80" r="42" fill="#58d7d0"/><path d="M60 120h120" stroke="#d7b46a" stroke-width="6"/></svg>') },
  ]);
  await page.waitForFunction(() => document.querySelectorAll('.az-workbench-window[data-workbench-app="archive"] [data-file-id]').length >= 4);
  assert.ok(await archive.locator('[data-file-id]').filter({hasText:'people.csv'}).count(), 'CSV import missing');
  assert.ok(await archive.locator('[data-file-id]').filter({hasText:'excavation.md'}).count(), 'Markdown import missing');
  assert.ok(await archive.locator('[data-file-id]').filter({hasText:'artifact.svg'}).count(), 'image import missing');

  const markdown = archive.locator('[data-file-id]').filter({hasText:'excavation.md'}).first();
  await markdown.click();
  await markdown.press('Space');
  await page.waitForSelector('#az-quicklook.open');
  assert.match(await page.locator('#az-quicklook').innerText(), /Excavation note/);
  await page.keyboard.press('Escape');

  const csv = archive.locator('[data-file-id]').filter({hasText:'people.csv'}).first();
  await csv.dblclick();
  const lab = page.locator('.az-workbench-window[data-workbench-app="data-lab"]');
  await lab.waitFor();
  assert.match(await lab.innerText(), /DATA LAB/);
  assert.match(await lab.innerText(), /3\s*loaded locally/);
  assert.equal(await lab.locator('.az-data-table tbody tr').count(), 3, 'Data Lab row preview mismatch');
  await lab.locator('[data-lab-filter]').fill('Research');
  assert.equal(await lab.locator('.az-data-table tbody tr').count(), 2, 'Data Lab filtering failed');

  await page.keyboard.press('Control+K');
  await page.waitForSelector('#az-command.open');
  assert.match(await page.locator('#az-context-commands').innerText(), /Open Datasets/, 'contextual Data Lab command missing');
  await page.keyboard.press('Escape');

  await page.evaluate(() => window.AIZANOI_OS.launchApp('archive'));
  await archive.locator('[data-file-id]').filter({hasText:'excavation.md'}).dblclick();
  const reader = page.locator('.az-workbench-window[data-workbench-app="source-reader"]');
  await reader.waitFor();
  assert.match(await reader.innerText(), /SOURCE READER/);
  assert.match(await reader.innerText(), /Temple sector context/);
  await reader.locator('[data-source-search]').fill('Temple');
  assert.match(await reader.innerText(), /1 MATCH/);

  await page.evaluate(() => window.AIZANOI_OS.launchApp('archive'));
  await archive.locator('[data-file-id]').filter({hasText:'artifact.svg'}).dblclick();
  const viewer = page.locator('.az-workbench-window[data-workbench-app="artifact-viewer"]');
  await viewer.waitFor();
  assert.ok(await viewer.locator('[data-artifact-image]').count(), 'Artifact Viewer image missing');
  await viewer.locator('[data-artifact-action="plus"]').click();
  assert.match(await viewer.locator('[data-artifact-zoom]').innerText(), /115%/);

  await page.evaluate(() => window.AIZANOI_OS.launchApp('notes'));
  const notes = page.locator('.az-workbench-window[data-workbench-app="notes"]');
  await notes.waitFor();
  await notes.locator('[data-notes-action="new"]').click();
  await notes.locator('[data-note-title]').fill('QA field note');
  await notes.locator('[data-note-area]').fill('Persistent workstation note from Chromium smoke.');
  await page.waitForTimeout(650);
  assert.match(await notes.locator('[data-note-state]').innerText(), /SAVED LOCALLY/);
  const storedNote = await page.evaluate(async () => (await window.AIZANOI_WORKSPACE.archive.all()).find((item) => item.name === 'QA field note.md')?.text || '');
  assert.equal(storedNote, 'Persistent workstation note from Chromium smoke.');

  await page.evaluate(() => window.AIZANOI_OS.launchApp('monitor'));
  const monitor = page.locator('.az-workbench-window[data-workbench-app="monitor"]');
  await monitor.waitFor();
  assert.match(await monitor.innerText(), /Workspace Monitor/);
  assert.match(await monitor.innerText(), /AI API\s*Online/i);

  await page.locator('#start-btn').click();
  await page.waitForSelector('#az-index.open');
  for (const id of ['archive','notes','data-lab','monitor']) assert.ok(await page.locator(`#az-index-apps [data-app="${id}"]`).count(), `Aizanoi Index missing ${id}`);
  await page.keyboard.press('Escape');

  assert.deepEqual(errors, [], `workstation desktop browser errors: ${errors.join(' | ')}`);
  await context.close();
}

{
  const { context, page, errors } = await openWorkspace({width:390,height:844}, true);
  await page.waitForSelector('#az-mobile-home:not(.hidden)');
  assert.ok(await page.locator('#az-mobile-apps [data-app="archive"]').count(), 'mobile Archive launcher missing');
  assert.ok(await page.locator('#az-mobile-apps [data-app="data-lab"]').count(), 'mobile Data Lab launcher missing');
  await page.locator('#az-mobile-apps [data-app="archive"]').click();
  const archive = page.locator('.az-workbench-window[data-workbench-app="archive"]');
  await archive.waitFor();
  const box = await archive.boundingBox();
  assert.ok(box && box.width <= 390 && box.height <= 844, 'mobile Archive exceeds viewport');
  assert.ok(await archive.locator('[data-archive-action="import"]').isVisible(), 'mobile Archive import action missing');
  assert.deepEqual(errors, [], `workstation mobile browser errors: ${errors.join(' | ')}`);
  await context.close();
}

await browser.close();
console.log('Aizanoi distribution/workstation Chromium smoke passed');

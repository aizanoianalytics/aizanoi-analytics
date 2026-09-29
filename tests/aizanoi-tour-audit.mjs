// Section 14: "Rework Aizanoi exploration UX". The tour must feel like a real
// experience, not a sequence of teleports: clear progress, stop title, short
// explanatory text, source/evidence context, next/previous, skip/exit, and
// accessible focus. Evidence mode must distinguish evidence classes without
// destroying readability, and the visitor must be able to leave.
//
// This drives the real world in a real browser: enters it, runs the tour, and
// reads what the visitor actually sees.
import { chromium } from 'playwright';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.AIZANOI_BASE_URL || 'http://127.0.0.1:4173';
const ROUTE = `${BASE}/worlds/aizanoi-225/`;
const userDataDir = mkdtempSync(join(tmpdir(), 'aizanoi-tour-'));
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

await page.goto(ROUTE, { waitUntil: 'domcontentloaded', timeout: 60000 });

// Real entry, the way a visitor does it.
await page.waitForSelector('#btn-enter', { timeout: 30000 });
await page.click('#btn-enter');
await page.waitForFunction(() => window.__WORLD_DEBUG__?.ready, null, { timeout: 180000 });
console.log('[entry] runtime ready');

// The exit control must exist and must know where it is going.
const exitState = await page.evaluate(() => {
  const btn = document.getElementById('btn-world-exit');
  return {
    exists: Boolean(btn),
    tag: btn?.tagName ?? null,
    label: btn?.getAttribute('aria-label') ?? null,
    hasHardHref: Boolean(btn?.getAttribute('href'))
  };
});
console.log(`[exit] ${JSON.stringify(exitState)}`);

// Start the tour through the real control.
await page.click('#btn-tour');
await page.waitForSelector('#tour-bar', { state: 'visible', timeout: 15000 });

const readTour = () => page.evaluate(() => {
  const q = (s) => document.querySelector(s);
  const bar = q('#tour-bar');
  const progress = q('.tour-bar__progress');
  return {
    visible: bar ? getComputedStyle(bar).display !== 'none' : false,
    badge: q('#tour-step-badge')?.textContent ?? '',
    title: q('#tour-title')?.textContent ?? '',
    description: (q('#tour-desc')?.textContent ?? '').length,
    evidence: (q('#tour-evidence')?.textContent ?? '').trim(),
    evidenceHidden: q('#tour-evidence')?.hidden ?? true,
    evidenceClass: q('#tour-evidence')?.dataset?.evidenceClass ?? '',
    progressWidth: q('#tour-progress-fill')?.style.width ?? '',
    ariaNow: progress?.getAttribute('aria-valuenow') ?? null,
    ariaMax: progress?.getAttribute('aria-valuemax') ?? null,
    ariaText: progress?.getAttribute('aria-valuetext') ?? '',
    prevDisabled: q('#btn-tour-prev')?.disabled ?? null,
    nextText: q('#btn-tour-next')?.textContent ?? '',
    hasRestart: Boolean(q('#btn-tour-reset')),
    focusInsidePanel: bar ? bar.contains(document.activeElement) : false
  };
});

const stop1 = await readTour();
console.log(`[stop1] ${JSON.stringify(stop1)}`);

// Next: progress must advance and the evidence must be per-stop, not static.
await page.click('#btn-tour-next');
await page.waitForTimeout(1200);
const stop2 = await readTour();
console.log(`[stop2] ${JSON.stringify(stop2)}`);

// Previous must go back, and the edge button must be disabled at the start.
const prevDisabledAtStart = await page.evaluate(() =>
  document.getElementById('btn-tour-prev')?.disabled);
if (prevDisabledAtStart !== true) {
  // If it is enabled at the first stop, walk back and try again.
  await page.click('#btn-tour-prev');
  await page.waitForTimeout(600);
}
const backAtStart = await readTour();
console.log(`[back-to-start] ${JSON.stringify(backAtStart)}`);

// Evidence mode must be distinguishable without relying on colour alone.
const evidenceMode = await page.evaluate(async () => {
  const before = document.getElementById('btn-evidence')?.getAttribute('aria-pressed');
  document.getElementById('btn-evidence')?.click();
  await new Promise((done) => { setTimeout(done, 400); });
  const after = document.getElementById('btn-evidence')?.getAttribute('aria-pressed');
  return { before, after, active: window.__WORLD_DEBUG__?.evidenceActive ?? null };
});
console.log(`[evidence-mode] ${JSON.stringify(evidenceMode)}`);

// Skip/exit must leave cleanly and return focus to the opener.
await page.click('#btn-tour-close');
await page.waitForTimeout(500);
const afterExit = await page.evaluate(() => {
  const bar = document.getElementById('tour-bar');
  return {
    hidden: !bar || getComputedStyle(bar).display === 'none',
    focusOnOpener: document.activeElement?.id === 'btn-tour',
    beaconVisible: window.__WORLD_DEBUG__?.tour?.beacon?.visible ?? null
  };
});
console.log(`[tour-exit] ${JSON.stringify(afterExit)}`);

console.log(`[console-errors] ${consoleErrors.length ? consoleErrors.join(' | ') : 'none'}`);

const findings = [];
if (!exitState.exists) findings.push('no exit control');
if (exitState.hasHardHref) findings.push('the exit is still a hard-coded link, so it cannot return to the shell');
if (!stop1.visible) findings.push('the tour panel did not appear');
if (!stop1.title) findings.push('the first stop has no title');
if (!stop1.description) findings.push('the first stop has no explanatory text');
if (stop1.prevDisabled !== true) findings.push('Prev must be disabled at the first stop');
if (!stop1.hasRestart) findings.push('the tour has no restart control');
if (stop2.ariaNow === stop1.ariaNow) findings.push('the progress indicator did not advance');
if (stop2.progressWidth === stop1.progressWidth) findings.push('the progress bar did not fill');
if (stop2.evidenceHidden) findings.push('no evidence context is shown on a tour stop');
if (stop2.evidence === stop1.evidence) findings.push('the evidence text is identical on every stop, so it is not per-landmark');
if (!stop2.ariaText) findings.push('the progress bar exposes no aria-valuetext');
if (evidenceMode.before === evidenceMode.after) findings.push('evidence mode did not toggle');
if (!afterExit.hidden) findings.push('the tour panel stayed visible after exit');
if (!afterExit.focusOnOpener) findings.push('exiting the tour did not return focus to the opener');

console.log(`[findings] ${findings.length ? findings.join(' | ') : 'none'}`);

await browser.close();
rmSync(userDataDir, { recursive: true, force: true });
process.exitCode = findings.length ? 1 : 0;

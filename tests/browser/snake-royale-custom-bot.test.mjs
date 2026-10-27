// Use node:test and playwright like the other browser suites; Playwright Test fixtures cannot run under node --test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';

async function withPage(run) {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    await run(page);
  } finally {
    await browser.close();
  }
}

async function waitForFightEnabled(page) {
  await page.waitForFunction(() => {
    const button = document.getElementById('sr-fight');
    return button && !button.disabled;
  });
}

async function openArena(page) {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.goto(`${base}/arcade/snake-royale/`);
  await waitForFightEnabled(page);
  assert.equal(await page.locator('#sr-fight').isEnabled(), true);

  const rosterSize = await page.evaluate(() => window.__SNAKE_ROYALE__().bots);
  assert.equal(await page.locator('#sr-a option').count(), rosterSize);
  assert.equal(await page.locator('#sr-b option').count(), rosterSize);
  assert.equal(await page.locator('#sr-a option[value="custom"]').count(), 0);
  assert.equal(await page.locator('#sr-b option[value="custom"]').count(), 0);

  // The shipped benchmark roster uses haiku and beam, not a documented sample-* naming convention.
  const samples = ['haiku', 'beam'];
  const rosterIds = await page.locator('#sr-a option').evaluateAll(options =>
    options.map(option => option.value)
  );
  assert.ok(samples.every(id => rosterIds.includes(id)),
    'The arena must provide both shipped reference bots: haiku and beam');
  await page.selectOption('#sr-a', samples[0]);
  await page.selectOption('#sr-b', samples[1]);
  await page.selectOption('#sr-p1', 'off');
  await page.selectOption('#sr-p2', 'off');
  await page.selectOption('#sr-series', '1');
  await page.selectOption('#sr-speed', '0');

  return { pageErrors, rosterSize };
}

async function upload(page, trigger, name, code) {
  // pick() opens the hidden input synchronously; Playwright auto-dismisses an unhandled native
  // chooser (a cancel), so accept it like a user would.
  const chooser = page.waitForEvent('filechooser');
  await trigger();
  const dialog = await chooser;
  assert.equal(await page.locator('#arena-custom-file').count(), 1);
  assert.equal(await page.locator('#arena-custom-file').isHidden(), true);
  await dialog.setFiles({
    name,
    mimeType: 'text/javascript',
    buffer: Buffer.from(code),
  });
  await waitForFightEnabled(page);
  assert.equal(await page.locator('#sr-fight').isEnabled(), true);
}

async function finishFight(page, name, pageErrors) {
  const notices = [];
  await page.exposeFunction('__recordSnakeCustomNotice', message => {
    notices.push(message);
  });
  await page.evaluate(() => {
    const ticker = document.getElementById('sr-ticker');
    const observer = new MutationObserver(() => {
      window.__recordSnakeCustomNotice(ticker.textContent);
    });
    observer.observe(ticker, { childList: true, characterData: true, subtree: true });
    window.__snakeCustomTestObserver = observer;
  });

  try {
    await page.click('#sr-fight');
    await page.locator('#sr-result').waitFor({ state: 'visible', timeout: 60000 });
    assert.equal(await page.locator('#sr-result').isVisible(), true);
    assert.match(await page.locator('#sr-result').textContent(), /wins|Draw/);
    const customCard = page.locator('#sr-cards .sr-card').filter({ hasText: name });
    assert.equal(await customCard.count(), 1);
    assert.match(await customCard.textContent(), /You/);
    assert.doesNotMatch(await page.locator('#sr-cards').textContent(), /load-error/);
    assert.doesNotMatch(await page.locator('#sr-ticker').textContent(), /failed to start/);
    await page.waitForFunction(() => window.__SNAKE_ROYALE__().running === false);
    assert.equal(await page.evaluate(() => window.__SNAKE_ROYALE__().running), false);
  } finally {
    await page.evaluate(async () => {
      window.__snakeCustomTestObserver.disconnect();
      // Flush exposed-function calls before inspecting the captured notices.
      await window.__recordSnakeCustomNotice(
        document.getElementById('sr-ticker').textContent
      );
    });
  }

  assert.doesNotMatch(notices.join('\n'), /failed to start/);
  assert.deepEqual(pageErrors, []);
}

test('Snake Royale: upload button adds a custom seat and completes an Instant sample royale', { timeout: 90000 }, async () => {
  await withPage(async page => {
    const { pageErrors, rosterSize } = await openArena(page);
    await upload(
      page,
      () => page.click('#sr-custom'),
      'my-snake.js',
      "module.exports = function move(state) { return 'left'; };"
    );

    assert.equal(await page.locator('.sr-extra').count(), 1);
    assert.equal(await page.locator('.sr-extra').inputValue(), 'custom');
    assert.equal(
      await page.locator('.sr-extra option[value="custom"]').textContent(),
      'Your bot: my-snake.js'
    );
    assert.equal(await page.locator('#sr-a option').count(), rosterSize);
    assert.equal(await page.locator('#sr-b option').count(), rosterSize);
    assert.equal(await page.locator('#sr-mode').textContent(), '19 × 19 · ROYALE');

    await finishFight(page, 'my-snake.js', pageErrors);
  });
});

test('Snake Royale: an extra bot select can upload and play a custom bot', { timeout: 90000 }, async () => {
  await withPage(async page => {
    const { pageErrors, rosterSize } = await openArena(page);
    await page.click('#sr-add');
    assert.equal(await page.locator('.sr-extra').count(), 1);
    assert.equal(
      await page.locator('.sr-extra option').first().getAttribute('value'),
      'custom'
    );

    await upload(
      page,
      () => page.selectOption('.sr-extra', 'custom'),
      'extra-snake.js',
      "exports.move = function (state) { return 'up'; };"
    );

    assert.equal(await page.locator('.sr-extra').inputValue(), 'custom');
    assert.equal(
      await page.locator('.sr-extra option[value="custom"]').textContent(),
      'Your bot: extra-snake.js'
    );
    assert.equal(await page.locator('#sr-a option').count(), rosterSize);
    assert.equal(await page.locator('#sr-b option').count(), rosterSize);

    await finishFight(page, 'extra-snake.js', pageErrors);
  });
});

test('Snake Royale: cancelling an extra-seat upload restores its previous choice', { timeout: 90000 }, async () => {
  await withPage(async page => {
    const { pageErrors } = await openArena(page);
    await page.click('#sr-add');
    const previous = await page.locator('.sr-extra').inputValue();
    await page.selectOption('.sr-extra', 'custom');
    await page.locator('#arena-custom-file').waitFor({ state: 'attached' });
    assert.equal(await page.locator('#arena-custom-file').count(), 1);
    await page.locator('#arena-custom-file').dispatchEvent('cancel');

    await page.waitForFunction(value =>
      document.querySelector('.sr-extra')?.value === value, previous);
    assert.equal(await page.locator('.sr-extra').inputValue(), previous);
    await waitForFightEnabled(page);
    assert.equal(await page.locator('#sr-fight').isEnabled(), true);
    assert.deepEqual(pageErrors, []);
  });
});

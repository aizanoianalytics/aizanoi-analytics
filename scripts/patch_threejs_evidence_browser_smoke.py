from pathlib import Path

path = Path('experiments/threejs-rome-renderer/scripts/browser-smoke.mjs')
text = path.read_text(encoding='utf-8')
old = """  await page.evaluate(() => window.__ROME_THREE_POC__.destroy());
  await page.waitForFunction(() => document.querySelectorAll('canvas').length === 0);
  assert.deepEqual(errors, [], errors.join('\\n'));
  console.log(`Desktop smoke passed · ${baseline.triangles} triangles · ${baseline.calls} calls · 216 instanced Colosseum piers`);
"""
new = """  await page.evaluate(() => window.__ROME_THREE_POC__.destroy());
  await page.waitForFunction(() => document.querySelectorAll('canvas').length === 0);

  await page.locator('#evidence').click();
  await page.locator('#evidenceModal:not(.hidden)').waitFor({ state: 'visible' });
  const evidenceText = await page.locator('#evidenceBody').innerText();
  assert.match(evidenceText, /Archaeologically supported/);
  assert.match(evidenceText, /Plausible reconstruction/);
  assert.match(evidenceText, /visual detail does not equal historical certainty/i);

  assert.deepEqual(errors, [], errors.join('\\n'));
  console.log(`Desktop smoke passed · ${baseline.triangles} triangles · ${baseline.calls} calls · 216 instanced Colosseum piers · evidence survives renderer teardown`);
"""
count = text.count(old)
if count != 1:
    raise SystemExit(f'Expected one desktop teardown block, found {count}')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
print('Patched browser smoke to prove evidence survives renderer teardown.')

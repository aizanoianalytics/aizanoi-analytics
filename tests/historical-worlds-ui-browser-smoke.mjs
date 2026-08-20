import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless:true });

const layouts = [
  { name:'desktop', options:{ viewport:{ width:1280, height:800 }, hasTouch:false } },
  { name:'tablet', options:{ viewport:{ width:900, height:1180 }, hasTouch:true } },
  { name:'mobile', options:{ viewport:{ width:390, height:844 }, hasTouch:true, isMobile:true, deviceScaleFactor:2 } },
];
const worlds = [
  { id:'aizanoi', path:'/historic-world/', intro:'#boot:not(.hidden)', enter:'#enterBtn', entered:'#hud:not(.hidden)' },
  { id:'rome', path:'/ancient-cities/rome-410-476/', intro:'#intro:not(.hidden)', enter:'#enter', hiddenAfterEnter:'#intro' },
  { id:'athens', path:'/ancient-cities/athens-450-430/', intro:'#intro:not(.hidden)', enter:'#enter', hiddenAfterEnter:'#intro' },
];

function overlaps(a,b,pad=0){
  if(!a||!b)return false;
  return a.x < b.x+b.width+pad && a.x+a.width+pad > b.x && a.y < b.y+b.height+pad && a.y+a.height+pad > b.y;
}

async function enterWorld(page, world) {
  await page.goto(`${base}${world.path}`, { waitUntil:'networkidle' });
  await page.waitForSelector(world.intro, { timeout:12000 });
  await page.locator(world.enter).click();
  if (world.hiddenAfterEnter) {
    await page.waitForFunction((selector) => document.querySelector(selector)?.classList.contains('hidden'), world.hiddenAfterEnter, { timeout:12000 });
  } else {
    await page.waitForSelector(world.entered, { state:'visible', timeout:12000 });
  }
  await page.waitForSelector('#aw-tools-toggle', { state:'visible', timeout:8000 });
  await page.waitForFunction(() => Boolean(document.getElementById('ancient-world-experience-style')?.sheet));
  // Desktop worlds may enter pointer lock immediately after the Enter gesture.
  // Release it before testing clickable HUD controls; this mirrors the real
  // visitor flow of pressing Esc to regain the cursor before opening Explore.
  await page.evaluate(() => document.exitPointerLock?.());
  await page.waitForFunction(() => document.pointerLockElement === null);
}

for (const layout of layouts) {
  const context = await browser.newContext(layout.options);
  for (const world of worlds) {
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await enterWorld(page, world);
    assert.equal(await page.locator('body').getAttribute('data-city'), world.id, `${world.id}/${layout.name}: wrong shared city identity`);
    assert.equal(await page.locator('#aw-tools-panel').isVisible(), false, `${world.id}/${layout.name}: secondary tools should start closed`);

    if (world.id === 'aizanoi') {
      assert.equal(await page.locator('.deviceChip').count(), 1, `${layout.name}: runtime-owned device chip hook is missing`);
      assert.equal(await page.locator('.deviceChip').evaluate((el) => getComputedStyle(el).display), 'none', `${layout.name}: passive device chip should be hidden`);
      assert.equal(await page.locator('.bottomBar').evaluate((el) => getComputedStyle(el).display), 'none', `${layout.name}: Aizanoi permanent bottom toolbar still occupies the viewport`);
      assert.equal(await page.locator('#headingHud').evaluate((el) => getComputedStyle(el).display), 'none', `${layout.name}: heading HUD should be retired from the passive view`);
      assert.equal(await page.locator('#elevationHud').evaluate((el) => getComputedStyle(el).display), 'none', `${layout.name}: elevation HUD should be retired from the passive view`);
      assert.equal(await page.locator('#mapBox').evaluate((el) => getComputedStyle(el).display), 'none', `${layout.name}: Aizanoi minimap should be opt-in`);
      for (const id of ['settingsBtn','fullscreenBtn','tourBtn','atlasBtn','sourcesBtn','soundBtn']) {
        assert.equal(await page.locator(`#${id}`).evaluate((el) => el.parentElement?.id), 'aw-tools-panel', `${layout.name}: ${id} was not moved to Explore`);
      }
    } else {
      for (const id of ['atlas','modern','audio','evidence','sources']) {
        assert.equal(await page.locator(`#${id}`).evaluate((el) => el.parentElement?.id), 'aw-tools-panel', `${world.id}/${layout.name}: ${id} was not moved to Explore`);
      }
      assert.equal(await page.locator('.miniWrap').evaluate((el) => getComputedStyle(el).display), 'none', `${world.id}/${layout.name}: passive minimap should be opt-in`);
    }

    if(layout.name==='mobile'){
      const back=await page.locator('#ancient-world-back-to-os').boundingBox();
      const primary=await page.locator(world.id==='aizanoi'?'.topbar':'.controls').boundingBox();
      const jump=await page.locator(world.id==='aizanoi'?'#teleport':'#jump').boundingBox();
      const explore=await page.locator('#aw-tools-toggle').boundingBox();
      assert.ok(back&&primary&&jump&&explore,`${world.id}/mobile: primary mobile navigation geometry unavailable`);
      assert.equal(overlaps(back,primary,2),false,`${world.id}/mobile: Field System return overlaps primary world controls`);
      assert.equal(overlaps(jump,explore,2),false,`${world.id}/mobile: jump control overlaps Explore`);
      assert.ok(primary.x>=0&&primary.y>=0&&primary.x+primary.width<=391&&primary.y+primary.height<=845,`${world.id}/mobile: primary controls escape viewport`);
      assert.equal(await page.locator('#mobileCompass').evaluate((el)=>getComputedStyle(el).display),'none',`${world.id}/mobile: redundant top touch badge should be hidden`);
      if(world.id==='aizanoi'){
        const era=await page.locator('.eraWrap').boundingBox();
        const toast=page.locator('#toast');
        assert.ok(era,`${world.id}/mobile: chronology row geometry unavailable`);
        if(await toast.isVisible()){
          const toastBox=await toast.boundingBox();
          assert.equal(overlaps(era,toastBox,2),false,'aizanoi/mobile: entry toast overlaps chronology controls');
        }
      }
    }

    await page.locator('#aw-tools-toggle').click();
    await page.locator('#aw-tools-panel').waitFor({ state:'visible' });
    assert.equal(await page.locator('body').evaluate((el) => el.classList.contains('aw-tools-open')), true, `${world.id}/${layout.name}: drawer state not published`);
    const movementBlocked = await page.evaluate(() => {
      const event = new KeyboardEvent('keydown', { code:'KeyW', key:'w', bubbles:true, cancelable:true });
      document.dispatchEvent(event);
      return event.defaultPrevented;
    });
    assert.equal(movementBlocked, true, `${world.id}/${layout.name}: traversal input continued while Explore was open`);

    const compact = layout.name !== 'desktop';
    assert.equal(await page.locator('#aw-mini-toggle').count(), compact ? 0 : 1, `${world.id}/${layout.name}: minimap toggle does not match layout intent`);
    if (!compact) {
      await page.locator('#aw-mini-toggle').click();
      const mapSelector = world.id === 'aizanoi' ? '#mapBox' : '.miniWrap';
      assert.notEqual(await page.locator(mapSelector).evaluate((el) => getComputedStyle(el).display), 'none', `${world.id}: desktop minimap did not open on demand`);
    }

    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.getElementById('aw-tools-panel')?.hidden === true);
    assert.equal(await page.locator('body').evaluate((el) => el.classList.contains('aw-tools-open')), false, `${world.id}/${layout.name}: Escape did not close Explore`);

    assert.equal(pageErrors.length, 0, `${world.id}/${layout.name}: browser errors: ${pageErrors.join(' | ')}`);
    await page.close();
  }

  if (layout.name === 'desktop') {
    const sessionPage=await context.newPage();
    await sessionPage.goto(`${base}/historic-world/?jump=qa-aizanoi-landmark`,{waitUntil:'domcontentloaded'});
    await sessionPage.waitForFunction(()=>document.body?.dataset.city==='aizanoi' && Boolean(window.__AIZANOI_CITY_EXPERIENCE__));
    const first=await sessionPage.evaluate(()=>JSON.parse(localStorage.getItem('aizanoi-field-session-v1')||'null'));
    assert.equal(first?.worldId,'aizanoi','field session did not record Aizanoi');
    assert.equal(first?.landmark,'qa-aizanoi-landmark','field session did not record the Aizanoi landmark');

    await sessionPage.goto(`${base}/ancient-cities/rome-410-476/`,{waitUntil:'domcontentloaded'});
    await sessionPage.waitForFunction(()=>document.body?.dataset.city==='rome' && Boolean(window.__AIZANOI_CITY_EXPERIENCE__));
    const second=await sessionPage.evaluate(()=>JSON.parse(localStorage.getItem('aizanoi-field-session-v1')||'null'));
    assert.equal(second?.worldId,'rome','field session did not switch to Rome');
    assert.equal(second?.landmark,null,'field session leaked an Aizanoi landmark into Rome');
    await sessionPage.close();
  }

  await context.close();
}

await browser.close();
console.log('Historical Worlds shared UI desktop/tablet/mobile smoke passed');
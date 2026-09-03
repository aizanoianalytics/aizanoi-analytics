import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';

const base = process.env.AIZANOI_NGINX_BASE_URL || 'http://127.0.0.1:4174';

test('production-like Nginx permits explicit camera/microphone and blob media while keeping CSP active', async () => {
  const browser = await chromium.launch({
    headless:true,
    args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'],
  });
  const context = await browser.newContext({
    viewport:{ width:1280, height:860 },
    permissions:['camera','microphone'],
    serviceWorkers:'block',
  });
  const page = await context.newPage();
  try {
    const response = await page.goto(`${base}/?nginx-policy=${Date.now()}`, { waitUntil:'networkidle' });
    assert.ok(response?.ok(), `Nginx root returned ${response?.status()}`);
    const headers = response.headers();
    assert.match(headers['permissions-policy'] || '', /microphone=\(self\)/);
    assert.match(headers['permissions-policy'] || '', /camera=\(self\)/);
    assert.match(headers['content-security-policy'] || '', /media-src 'self' blob:/);

    const result = await page.evaluate(async () => {
      const violations = [];
      document.addEventListener('securitypolicyviolation', (event) => violations.push({ directive:event.violatedDirective, blocked:event.blockedURI }));
      let capture = false;
      let stream = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video:true, audio:true });
        capture = stream.getVideoTracks().length > 0 && stream.getAudioTracks().length > 0;
      } finally {
        stream?.getTracks().forEach((track) => track.stop());
      }
      const audio = document.createElement('audio');
      const url = URL.createObjectURL(new Blob([new Uint8Array([0, 1, 2, 3])], { type:'audio/mpeg' }));
      audio.src = url;
      document.body.appendChild(audio);
      audio.load();
      await new Promise((resolve) => { setTimeout(resolve, 150); });
      audio.remove();
      URL.revokeObjectURL(url);
      return { capture, violations };
    });
    assert.equal(result.capture, true, 'same-origin Camera permission must survive the production policy');
    assert.equal(result.violations.some((item) => item.directive === 'media-src' && String(item.blocked).startsWith('blob:')), false, JSON.stringify(result.violations));
  } finally {
    await browser.close();
  }
});

test('route-scoped production policy lets the Web Editor Run action execute sandboxed inline HTML and JavaScript', async () => {
  const root=process.cwd().replaceAll('\\','/');
  const config='/tmp/aizanoi-web-editor-nginx.conf';
  const pid='/tmp/aizanoi-web-editor-nginx.pid';
  const port=4175;
  writeFileSync(config,`pid ${pid};\nerror_log /tmp/aizanoi-web-editor-nginx-error.log;\nevents {}\nhttp {\n  include /etc/nginx/mime.types;\n  access_log off;\n  server {\n    listen 127.0.0.1:${port};\n    root ${root}/frontend;\n    index index.html;\n    include ${root}/infra/nginx/snippets/aizanoi-static-security-headers.conf.example;\n    location = /web-editor-preview { return 301 /web-editor-preview/; }\n    location = /web-editor-preview/ { include ${root}/infra/nginx/snippets/aizanoi-web-editor-preview-headers.conf.example; try_files /web-editor-preview/index.html =404; }\n    location ^~ /web-editor-preview/ { include ${root}/infra/nginx/snippets/aizanoi-web-editor-preview-headers.conf.example; try_files $uri =404; }\n    location / { try_files $uri $uri/ =404; }\n  }\n}\n`);
  const testConfig=spawnSync('nginx',['-t','-c',config],{encoding:'utf8'});
  assert.equal(testConfig.status,0,`${testConfig.stdout}\n${testConfig.stderr}`);
  const start=spawnSync('nginx',['-c',config],{encoding:'utf8'});
  assert.equal(start.status,0,`${start.stdout}\n${start.stderr}`);

  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1280,height:860}});
  try{
    let response=null;
    for(let attempt=0;attempt<20;attempt++){
      try{response=await page.goto(`http://127.0.0.1:${port}/?web-editor-policy=${Date.now()}`,{waitUntil:'networkidle',timeout:3000});if(response?.ok())break;}catch{}
      await new Promise((resolve)=>{setTimeout(resolve,100);});
    }
    assert.ok(response?.ok(),`Web Editor Nginx root returned ${response?.status()}`);
    await page.evaluate(()=>window.AIZANOI_OS.openApp('web-editor'));
    const editor=page.locator('.az-window[data-app-id="web-editor"] [data-web-source]');
    await editor.waitFor({state:'visible'});
    const source='<!doctype html><html><body><h1 id="policy-run">Waiting</h1><script>document.querySelector("#policy-run").textContent="Run works";<\/script></body></html>';
    await editor.fill(source);
    await page.locator('.az-window[data-app-id="web-editor"] [data-web-action="run"]').click();
    const frame=page.frameLocator('.az-window[data-app-id="web-editor"] [data-web-preview]');
    await frame.locator('#policy-run').waitFor({state:'visible',timeout:5000});
    assert.equal((await frame.locator('#policy-run').innerText()).trim(),'Run works');
    assert.equal(await page.locator('.az-window[data-app-id="web-editor"] [data-web-preview-state]').isHidden(),true);
  }finally{
    await browser.close();
    spawnSync('nginx',['-s','stop','-c',config],{encoding:'utf8'});
    rmSync(config,{force:true});
    rmSync(pid,{force:true});
  }
});

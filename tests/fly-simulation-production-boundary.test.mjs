import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const nginx = read('infra/nginx/aizanoianalytics.com.conf.example');
const runtime = read('frontend/labs/fly-world/glb-runtime-v3.js');
const start = read('scripts/fly-simulation/start.mjs');
const unitPath = 'infra/systemd/aizanoi-fly-simulation.service.example';

test('production exposes only the exact read-only Fly telemetry exception', () => {
  const proxies = [...nginx.matchAll(/proxy_pass\s+([^;]+);/g)].map((match) => match[1]);
  assert.deepEqual(proxies, ['http://127.0.0.1:8787/spectator/telemetry-1']);
  assert.match(nginx, /location = \/labs\/fly-world\/telemetry-1/);
  assert.match(nginx, /proxy_set_header Upgrade \$http_upgrade/);
  assert.match(nginx, /proxy_set_header Connection "upgrade"/);
  assert.match(nginx, /proxy_set_header Origin \$http_origin/);
  assert.match(nginx, /proxy_set_header Host 127\.0\.0\.1:8787/);
  assert.match(nginx, /proxy_buffering off/);
  assert.match(nginx, /proxy_read_timeout 30s/);
  assert.match(nginx, /location = \/api\/chat[\s\S]*return 410;/);
  assert.match(nginx, /location \^~ \/api\/[\s\S]*return 404;/);
});

test('browser selects same-origin WSS only on the canonical production host', () => {
  assert.match(runtime, /location\.protocol === 'https:'/);
  assert.match(runtime, /location\.hostname === 'aizanoianalytics\.com'/);
  assert.match(runtime, /wss:\/\/\$\{location\.host\}\/labs\/fly-world\/telemetry-1/);
  assert.match(runtime, /window\.__FLY_TELEMETRY_CONFIG__/);
  assert.doesNotMatch(runtime, /ws:\/\/127\.0\.0\.1:8787/);
});

test('production service binds loopback with exact host/origin validation', () => {
  assert.match(start, /FLY_SIM_HOST \?\? '127\.0\.0\.1'/);
  assert.match(start, /allowedHosts/);
  assert.match(start, /allowedOrigins/);
  assert.match(start, /requireOrigin:\s*true/);
  assert.match(start, /maxClients/);
});

test('systemd unit is a hardened narrow service with no generic backend privileges', () => {
  assert.equal(existsSync(unitPath), true);
  const unit = read(unitPath);
  assert.match(unit, /ExecStart=\/usr\/bin\/env node scripts\/fly-simulation\/start\.mjs/);
  assert.match(unit, /Environment=FLY_SIM_HOST=127\.0\.0\.1/);
  assert.match(unit, /Environment=FLY_SIM_PORT=8787/);
  assert.match(unit, /NoNewPrivileges=true/);
  assert.match(unit, /PrivateTmp=true/);
  assert.match(unit, /ProtectSystem=strict/);
  assert.match(unit, /ProtectHome=true/);
  assert.match(unit, /RestrictAddressFamilies=AF_INET AF_INET6/);
  assert.doesNotMatch(unit, /EnvironmentFile|\.env|bash|sh -c/);
});

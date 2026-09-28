import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const REPO = new URL('..', import.meta.url).pathname;
const CAPTURE = join(REPO, 'tests/historical-worlds-visual-capture.mjs');

/** Minimal RGB PNG encoder, so the test needs no image dependency. */
function makePng(file, width, height, rgb) {
  const raw = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const i = row + 1 + x * 3;
      raw[i] = rgb[0]; raw[i + 1] = rgb[1]; raw[i + 2] = rgb[2];
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crcTable = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
    let crc = 0xffffffff;
    for (const byte of body) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([len, body, crcBuf]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  writeFileSync(file, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]));
}

/** Run meanLuma() out of the capture script without launching a browser. */
function measure(file) {
  const script = readFileSync(CAPTURE, 'utf8');
  const body = script.slice(script.indexOf('function meanLuma'), script.indexOf('const base='));
  // The capture script's imports are above meanLuma, so the extracted function
  // is self-contained; only the stdlib imports it needs are prepended.
  const out = execFileSync(process.execPath, [
    '-e', `import {readFileSync} from 'node:fs';\nimport {inflateSync} from 'node:zlib';\n${body}\nconsole.log(meanLuma(${JSON.stringify(file)}));`,
  ], { encoding: 'utf8' });
  return Number(out.trim());
}

test('the capture luma gate really measures the pixels it claims to', () => {
  const dir = mkdtempSync(join(tmpdir(), 'luma-gate-'));
  try {
    // A black frame -- the exact failure this gate exists to catch.
    makePng(join(dir, 'black.png'), 8, 8, [4, 4, 5]);
    // A normally lit frame.
    makePng(join(dir, 'lit.png'), 8, 8, [200, 205, 210]);
    // A pure-white frame: the upper bound.
    makePng(join(dir, 'white.png'), 8, 8, [255, 255, 255]);

    const black = measure(join(dir, 'black.png'));
    const lit = measure(join(dir, 'lit.png'));
    const white = measure(join(dir, 'white.png'));

    assert.ok(black < 24, `black frame must fall below the gate, got ${black}`);
    assert.ok(lit > 24, `lit frame must clear the gate, got ${lit}`);
    assert.ok(white > lit, 'white must be brighter than lit');
    // Luma is a weighted average, so pure white is exactly 255.
    assert.ok(Math.abs(white - 255) < 0.5, `white must measure 255, got ${white}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the capture script refuses to publish a black hero frame', () => {
  const src = readFileSync(CAPTURE, 'utf8');
  assert.match(src, /mean luma/, 'the failure message must name the measurement');
  assert.match(src, /luma<24/, 'the black-frame threshold must be enforced, not just logged');
  // The capture must not trust a single blind frame: it re-samples until the
  // frame is actually lit, because the first post-teleport frame can be drawn
  // before the pose has landed. The old code slept once and shot once.
  const loop = src.slice(src.indexOf('for(let attempt'), src.indexOf('console.log(`${id} hero captured'));
  assert.ok(loop.length > 0, 'the capture must re-sample instead of trusting one frame');
  assert.match(loop, /luma=meanLuma\(`\$\{out\}\/\$\{id\}-hero\.png`\)/,
    'each sample must be measured from the saved frame');
  assert.match(loop, /if\(luma>=24\) break;/,
    'sampling must stop as soon as the frame is actually lit');
  assert.ok(!/await page\.waitForTimeout\(1500\)/.test(loop),
    'the flat 1.5s sleep that produced black captures must not come back');
});

test('every world re-arms the frame loop on teleport', () => {
  // A paused loop keeps writing the pre-teleport position from pose.sample(),
  // which rendered Rome and Athens as 96%-black hero captures.
  for (const world of ['aizanoi-225', 'rome-410-476', 'athens-450-430', 'iga-airport']) {
    const src = readFileSync(join(REPO, 'frontend/worlds', world, 'js/main.js'), 'utf8');
    const handler = src.slice(src.indexOf('ui.onTeleport = '), src.indexOf('ui.hideTeleportMenu()'));
    assert.ok(handler.length > 0, `${world} must expose ui.onTeleport`);
    assert.match(handler, /isRunning = true/,
      `${world} must re-arm isRunning inside onTeleport, or the frame renders black`);
    assert.match(handler, /pose\.snap\(\)/,
      `${world} must snap the pose blender on teleport`);
  }
});

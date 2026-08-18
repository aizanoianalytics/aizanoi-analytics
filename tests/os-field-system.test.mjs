import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const stateSource = read('frontend/js/os-state.js');
const shellSource = read('frontend/js/os-shell.js');
const shellCss = read('frontend/css/os-aizanoi-next.css');
const chatSource = read('frontend/js/chat.js');
const navigationSource = read('frontend/ancient-world/engine/navigation.js');

test('Aizanoi Field System ships as isolated shell modules over the mature SPA runtime', () => {
  for (const path of [
    'frontend/js/os-state.js',
    'frontend/js/os-shell.js',
    'frontend/css/os-aizanoi-next.css',
    'frontend/assets/wallpapers/aizanoi-field.svg',
  ]) assert.ok(existsSync(resolve(root, path)), `${path} missing`);

  assert.match(chatSource, /os-aizanoi-next\.css/);
  assert.match(chatSource, /\/js\/os-state\.js/);
  assert.match(chatSource, /\/js\/os-shell\.js/);
  assert.match(chatSource, /legacy shell remains available/i);
});

test('Field System registry contains the real product suite and keeps removed Markets product out', () => {
  for (const label of ['Aizanoi AI','Historical Worlds','Projects','Field Terminal','Field Notes','Aizanoi TV','Games','Archive Docs']) {
    assert.match(stateSource, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  for (const world of ['Aizanoi','Rome','Athens']) assert.match(stateSource, new RegExp(`label:'${world}'`));

  // Historical language such as “market” is valid for the Macellum. What stays
  // removed is the former Markets product/route itself.
  for (const source of [stateSource, shellSource]) {
    assert.doesNotMatch(source, /\bid\s*:\s*['"]markets?['"]/i);
    assert.doesNotMatch(source, /\b(appId|worldId)\s*:\s*['"]markets?['"]/i);
    assert.doesNotMatch(source, /\/markets?\//i);
    assert.doesNotMatch(source, /launchApp\(\s*['"]markets?['"]/i);
  }
});

test('Field System owns original shell identity instead of exposing XP shell as primary UI', () => {
  assert.match(shellCss, /Aizanoi Field System/);
  assert.match(shellCss, /aizanoi-field\.svg/);
  assert.match(shellCss, /body\.aizanoi-next #start-menu\s*\{\s*display:\s*none/i);
  assert.match(shellCss, /#az-field-card/);
  assert.match(shellCss, /#az-command/);
  assert.match(shellCss, /#az-mobile-home/);
  assert.match(shellCss, /aizanoi-snap-left/);
  assert.match(shellCss, /aizanoi-snap-right/);
});

test('command surface provides Index, universal search, real settings, AI and mobile navigation', () => {
  assert.match(shellSource, /Aizanoi Index/);
  assert.match(shellSource, /Search apps, worlds, monuments/);
  assert.match(shellSource, /System Panel/);
  assert.match(shellSource, /data-mobile-nav="home"/);
  assert.match(shellSource, /data-mobile-nav="search"/);
  assert.match(shellSource, /data-mobile-nav="ai"/);
  assert.match(shellSource, /data-mobile-nav="recent"/);
  assert.match(shellSource, /event\.ctrlKey \|\| event\.metaKey/);
  assert.match(shellSource, /event\.key\.toLowerCase\(\) === 'k'/);
  assert.match(shellSource, /launchWorld\(world\.id, landmark\)/);
  assert.match(shellSource, /window\.AIZANOI_OS = Object\.freeze/);
});

test('Aizanoi AI exposes a contextual programmatic ask surface without displaying hidden context in the user bubble', () => {
  assert.match(chatSource, /ask\(text, context = ''\)/);
  assert.match(chatSource, /User request:\s*\$\{visibleText\}/);
  assert.match(chatSource, /addMessage\('user', visibleText\)/);
  assert.match(chatSource, /body:\s*JSON\.stringify\(\{ history:\s*chatHistory \}\)/);
});

test('shared historical navigation accepts deep links for Aizanoi, Rome and Athens using each existing public UI', () => {
  assert.match(navigationSource, /consumeHistoricalWorldDeepLink/);
  assert.match(navigationSource, /worldId:'aizanoi'/);
  assert.match(navigationSource, /enterSelector:'#enterBtn'/);
  assert.match(navigationSource, /jumpSelector:'#teleport'/);
  assert.match(navigationSource, /worldId:'rome'/);
  assert.match(navigationSource, /worldId:'athens'/);
  assert.match(navigationSource, /url\.searchParams\.get\('jump'\)/);
  assert.match(navigationSource, /dispatchEvent\(new Event\('change'/);
});

test('workspace session/context updates are idempotent and cannot self-trigger an endless state render loop', () => {
  const local = new Map();
  const session = new Map();
  const events = [];
  const context = {
    console,
    localStorage: {
      getItem:key => local.has(key) ? local.get(key) : null,
      setItem:(key,value) => local.set(key,String(value)),
    },
    sessionStorage: {
      getItem:key => session.has(key) ? session.get(key) : null,
      setItem:(key,value) => session.set(key,String(value)),
      removeItem:key => session.delete(key),
    },
    CustomEvent: class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } },
  };
  context.window = {
    dispatchEvent(event) { events.push(event); },
  };
  vm.createContext(context);
  vm.runInContext(stateSource, context, { filename:'os-state.js' });
  const state = context.window.AIZANOI_OS_STATE;
  assert.ok(state, 'state API missing');
  let sessionNotifications = 0;
  let contextNotifications = 0;
  state.subscribe(({ type }) => {
    if (type === 'session') sessionNotifications++;
    if (type === 'context') contextNotifications++;
  });
  assert.equal(state.setSessionApps(['chatbot'], 'chatbot'), true);
  assert.equal(state.setSessionApps(['chatbot'], 'chatbot'), false);
  assert.equal(sessionNotifications, 1);
  state.setContext({ type:'app', label:'Aizanoi AI', appId:'chatbot', worldId:null, landmark:null });
  state.setContext({ type:'app', label:'Aizanoi AI', appId:'chatbot', worldId:null, landmark:null });
  assert.equal(contextNotifications, 1);
  assert.equal(state.getState().lastActive, 'chatbot');
});

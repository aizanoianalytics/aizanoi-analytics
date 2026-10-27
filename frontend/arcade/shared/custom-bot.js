/*
 * ArenaCustomBot — classic browser script; no dependencies.
 *
 * pick({ game }) -> Promise<{ name, code, bytes } | null>
 *   Opens #arena-custom-file synchronously, then reads one .js file (<= 256 KiB).
 *   Cancellation returns null; invalid files/read failures reject with a message.
 *   Call directly from a user gesture. Only one picker may be open at a time.
 *
 * get(game) -> { name, code, bytes } | null
 * forget(game) -> void
 *   Uploads are retained in memory only, separately for each game. Nothing is
 *   uploaded or persisted. Forgetting does not terminate existing workers.
 *
 * createWorker({ game, workerUrl, scripts, code }) -> Promise<Worker>
 *   Fetches same-origin classic worker/engine scripts, in scripts-array order,
 *   and creates one classic Blob worker. Supply absolute or document-relative
 *   URLs; include map-data.js before engine.js where the engine requires it.
 *   The caller owns initialization, deadlines, message handlers and termination.
 *   Pending calls cannot be cancelled: callers must terminate late arrivals.
 *
 * Worker integration:
 *   __ARENA_INLINE__ skips regular engine/bot imports.
 *   __ARENA_BOT__ contains the CommonJS export or a declared move function.
 *   __ARENA_LOAD_ERROR__ contains a caught top-level exception, if any.
 *   Workers must report that exception as their usual init-time fail response.
 *   Syntax errors and worker startup failures use Worker.onerror; runners must
 *   convert those into their usual load-failure result.
 *
 * Bot code is compiled only by the browser's classic Worker loader. Seeded
 * Math.random is installed by the game worker at init, AFTER top-level bot code.
 * Top-level bot code must not depend on Math.random; use it inside move/decide/act.
 *
 * This is execution isolation, not a security boundary for hostile code: workers
 * retain browser worker capabilities permitted by the site's CSP. Load only code
 * you trust. Required CSP: script-src 'self'; worker-src 'self' blob:.
 */
(function () {
  'use strict';

  const MAX_BYTES = 256 * 1024;
  const FETCH_TIMEOUT_MS = 15000;
  const uploads = new Map();
  let input = null;
  let picking = false;

  function gameKey(game) {
    if (typeof game !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(game)) {
      throw new TypeError('A valid arena game identifier is required');
    }
    return game;
  }

  function get(game) {
    return uploads.get(gameKey(game)) || null;
  }

  function forget(game) {
    uploads.delete(gameKey(game));
  }

  function fileInput() {
    if (!input) {
      input = document.createElement('input');
      input.id = 'arena-custom-file';
      input.type = 'file';
      input.accept = '.js,text/javascript';
      input.hidden = true;
      input.setAttribute('aria-label', 'Upload your JavaScript bot');
      document.body.append(input);
    }
    return input;
  }

  function pick(options = {}) {
    let key;
    try {
      key = gameKey(options.game);
    } catch (error) {
      return Promise.reject(error);
    }
    if (picking) {
      return Promise.reject(new Error('A bot file picker is already open'));
    }

    return new Promise((resolve, reject) => {
      const picker = fileInput();
      picking = true;
      picker.value = '';
      let finished = false;
      let reading = false;

      function finish(value, error) {
        if (finished) return;
        finished = true;
        picking = false;
        picker.removeEventListener('change', change);
        picker.removeEventListener('cancel', cancel);
        // File contents survive only in the per-game memory entry.
        picker.value = '';
        if (error) reject(error);
        else resolve(value);
      }

      function cancel() {
        if (!reading) finish(null);
      }

      async function change() {
        if (reading || finished) return;
        const file = picker.files && picker.files[0];
        if (!file) {
          finish(null);
          return;
        }
        reading = true;
        try {
          if (!/\.js$/i.test(file.name)) {
            throw new Error('Choose a JavaScript bot file ending in .js');
          }
          if (file.size > MAX_BYTES) {
            throw new Error('Bot files must be 256 KB (262,144 bytes) or smaller');
          }
          const code = await file.text();
          if (new TextEncoder().encode(code).byteLength > MAX_BYTES) {
            throw new Error('Bot files must be 256 KB (262,144 bytes) or smaller');
          }
          const result = Object.freeze({
            name: file.name,
            code,
            bytes: file.size
          });
          uploads.set(key, result);
          finish(result);
        } catch (error) {
          finish(null, error instanceof Error ? error : new Error('Could not read bot file'));
        }
      }

      picker.addEventListener('change', change);
      picker.addEventListener('cancel', cancel);
      try {
        picker.click();
      } catch (error) {
        finish(null, error);
      }
    });
  }

  function sameOriginUrl(value) {
    const url = new URL(value, document.baseURI);
    if (url.origin !== window.location.origin ||
        !/^https?:$/.test(url.protocol) || url.username || url.password) {
      throw new Error('Arena worker scripts must use same-origin HTTP(S) URLs');
    }
    return url.href;
  }

  async function createWorker(options = {}) {
    gameKey(options.game);
    if (typeof options.code !== 'string') {
      throw new TypeError('Bot code must be a string');
    }
    if (new TextEncoder().encode(options.code).byteLength > MAX_BYTES) {
      throw new Error('Bot files must be 256 KB (262,144 bytes) or smaller');
    }
    if (typeof options.workerUrl !== 'string' ||
        !Array.isArray(options.scripts) ||
        options.scripts.some(script => typeof script !== 'string')) {
      throw new TypeError('Provide workerUrl and an ordered scripts array');
    }

    const locations = [
      ...options.scripts.map(sameOriginUrl),
      sameOriginUrl(options.workerUrl)
    ];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let sources;
    try {
      sources = await Promise.all(locations.map(async location => {
        const response = await fetch(location, {
          credentials: 'same-origin',
          redirect: 'error',
          signal: controller.signal
        });
        if (!response.ok) {
          throw new Error(`Could not load arena script (${response.status})`);
        }
        return response.text();
      }));
    } catch (error) {
      controller.abort();
      if (error && error.name === 'AbortError') {
        throw new Error('Loading the custom bot worker timed out');
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }

    const workerSource = sources.pop();
    const source =
      'self.__ARENA_INLINE__ = true;\n' +
      sources.map(text => text + '\n;').join('\n') +
      '\ntry {\n' +
      ';(function () { var module = { exports: {} }; var exports = module.exports;\n' +
      options.code +
      '\n;self.__ARENA_BOT__ = module.exports && ' +
      "(typeof module.exports === 'function' || Object.keys(module.exports).length) " +
      "? module.exports : (typeof move === 'function' ? { move: move } : module.exports); })();\n" +
      '} catch (error) {\n' +
      '  self.__ARENA_LOAD_ERROR__ = String((error && error.message) || error).slice(0, 120);\n' +
      '}\n' +
      workerSource +
      '\n';

    const blob = new Blob([source], { type: 'text/javascript' });
    const blobUrl = URL.createObjectURL(blob);
    try {
      return new Worker(blobUrl);
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  }

  window.ArenaCustomBot = Object.freeze({
    pick,
    get,
    forget,
    createWorker
  });
})();

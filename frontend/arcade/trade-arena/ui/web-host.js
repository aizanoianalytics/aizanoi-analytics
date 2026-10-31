// One outstanding request per shipped strategy, with an absolute hard deadline.
export class WebHost {
  constructor(file, seed, initMs, barMs) {
    this.initMs = initMs; this.barMs = barMs; this.seq = 0; this.dead = false; this.logs = []; this.pending = null;
    this.worker = new Worker(new URL('./bot-worker.js', import.meta.url));
    this.worker.onmessage = ({ data }) => {
      if (data.log) { if (this.logs.length < 200) this.logs.push(data.log); return; }
      const pending = this.pending;
      if (!pending || pending.id !== data.id) return;
      clearTimeout(pending.soft); clearTimeout(pending.hard); this.pending = null;
      if (!pending.expired) pending.resolve(data);
    };
    this.worker.onerror = event => { event.preventDefault?.(); this.kill(String(event.message || 'worker error')); };
    this.worker.onmessageerror = () => this.kill('Invalid worker message');
    this.loaded = this.call('load', { file, seed }, 5000);
  }
  kill(error) {
    this.dead = true; this.worker.terminate();
    const pending = this.pending; this.pending = null;
    if (pending) {
      clearTimeout(pending.soft); clearTimeout(pending.hard);
      if (!pending.expired) pending.resolve({ ok:false,error,fatal:true });
    }
  }
  call(type, payload, ms) {
    if (this.dead) return Promise.resolve({ ok:false,error:'bot retired',fatal:true });
    if (this.pending) return Promise.resolve({ ok:false,error:'previous request still running',timeout:true });
    const id = ++this.seq;
    return new Promise(resolve => {
      const pending = { id, resolve, expired:false };
      pending.soft = setTimeout(() => {
        pending.expired = true;
        resolve({ ok:false,error:`timed out after ${ms} ms`,timeout:true });
      }, ms);
      pending.hard = setTimeout(() => this.kill('hard timeout'), ms + 2000);
      this.pending = pending;
      this.worker.postMessage({ id, type, payload });
    });
  }
  async init(info) {
    const loaded = await this.loaded;
    if (!loaded.ok) return { ok:false,error:loaded.error,fatal:true };
    this.meta = loaded.meta;
    return this.call('init', info, this.initMs);
  }
  onBar(state) { return this.call('bar', state, this.barMs); }
  close() { this.kill('host closed'); }
}

(function () {
  'use strict';

  // ---------- static map cache ----------
  let G = null;
  function init(state) {
    if (G) return G;
    const prov = {};
    state.map.provinces.forEach(p => { prov[p.id] = p; });
    const adj = state.map.adjacency;
    const ids = Object.keys(prov).sort();
    const scs = ids.filter(id => prov[id].sc);
    // distance graphs per unit type
    function canMoveT(type, from, to) {
      if (typeof PactEngine !== 'undefined' && PactEngine.canMove) {
        return PactEngine.canMove({ type, at: from, power: 'x' }, to);
      }
      const a = prov[from], b = prov[to];
      if (type === 'army') return a.type === 'land' && b.type === 'land';
      if (b.type === 'land' && !b.coastal) return false;
      if (a.type === 'sea' || b.type === 'sea') return true;
      return adj[from].some(s => prov[s].type === 'sea' && adj[to].includes(s));
    }
    const dist = { army: {}, fleet: {} };
    ['army', 'fleet'].forEach(type => {
      ids.forEach(src => {
        const d = {}; d[src] = 0;
        const q = [src];
        for (let i = 0; i < q.length; i++) {
          const x = q[i];
          (adj[x] || []).forEach(y => {
            if (d[y] === undefined && canMoveT(type, x, y)) { d[y] = d[x] + 1; q.push(y); }
          });
        }
        dist[type][src] = d;
      });
    });
    // plain graph distance (for disband logic)
    const gdist = {};
    ids.forEach(src => {
      const d = {}; d[src] = 0; const q = [src];
      for (let i = 0; i < q.length; i++) (adj[q[i]] || []).forEach(y => { if (d[y] === undefined) { d[y] = d[q[i]] + 1; q.push(y); } });
      gdist[src] = d;
    });
    G = { prov, adj, ids, scs, dist, gdist, canMoveT };
    return G;
  }

  // fast adjudicator (port of engine semantics), returns {units, dislodged}
  function fastAdj(units, orders, canMv) {
    const n = units.length;
    const idx = {};
    for (let i = 0; i < n; i++) idx[units[i].at] = i;
    const typ = new Array(n), dst = new Array(n), tgt = new Array(n), tdst = new Array(n), pw = new Array(n);
    const given = new Array(n).fill(null), cnt = new Array(n).fill(0);
    for (const o of orders) {
      if (!o) continue;
      const i = idx[o.unit];
      if (i === undefined) continue;
      if (cnt[i]++ === 0) given[i] = o;
    }
    for (let i = 0; i < n; i++) {
      const u = units[i]; pw[i] = u.power; typ[i] = 0; dst[i] = null;
      const o = given[i];
      if (!o || cnt[i] > 1) continue;
      if (o.type === 'move' && canMv(u, o.dest)) { typ[i] = 1; dst[i] = o.dest; }
      else if (o.type === 'support' && idx[o.target] !== undefined && o.target !== u.at) {
        const holding = o.targetDest === 'hold' || o.targetDest === undefined;
        const d = holding ? o.target : o.targetDest;
        if (canMv(u, d) && (holding || canMv(units[idx[o.target]], d))) { typ[i] = 2; tgt[i] = idx[o.target]; tdst[i] = holding ? 'hold' : d; }
      }
    }
    // matched supports
    const sups = [];
    for (let i = 0; i < n; i++) if (typ[i] === 2) {
      const t = tgt[i];
      const ok = tdst[i] === 'hold' ? typ[t] !== 1 : (typ[t] === 1 && dst[t] === tdst[i]);
      if (ok) sups.push(i);
    }
    const moves = [];
    for (let i = 0; i < n; i++) if (typ[i] === 1) moves.push(i);
    function calculate(removed) {
      const live = moves.filter(m => removed[m] === undefined || removed[m] !== dst[m]);
      const liveSet = new Array(n).fill(false); live.forEach(m => { liveSet[m] = true; });
      const incoming = {};
      live.forEach(m => { (incoming[dst[m]] = incoming[dst[m]] || []).push(m); });
      const cut = s => {
        const at = units[s].at;
        const inc = incoming[at]; if (!inc) return false;
        const exc = tdst[s] === 'hold' ? units[tgt[s]].at : tdst[s];
        return inc.some(m => pw[m] !== pw[s] && units[m].at !== exc);
      };
      const helpers = new Array(n);
      for (let i = 0; i < n; i++) helpers[i] = [];
      const active = [];
      sups.forEach(s => { if (removed[s] === undefined && !cut(s)) { active.push(s); helpers[tgt[s]].push(s); } });
      const strength = (i, excl) => { let c = 1; for (const s of helpers[i]) if (pw[s] !== excl) c++; return c; };
      const cand = new Array(n).fill(false);
      Object.keys(incoming).forEach(d => {
        const a = incoming[d];
        let best = 0; a.forEach(m => { const s = strength(m); if (s > best) best = s; });
        const w = a.filter(m => strength(m) === best);
        if (w.length === 1) cand[w[0]] = true;
      });
      const success = {}; const visiting = {};
      function succeeds(m) {
        if (success[m] !== undefined) return success[m];
        if (!cand[m]) return false;
        if (visiting[m]) return true;
        visiting[m] = true;
        const di = idx[dst[m]];
        let ok = di === undefined;
        if (di !== undefined) {
          const head = typ[di] === 1 && dst[di] === units[m].at;
          const vac = !head && typ[di] === 1 && succeeds(di);
          if (vac) ok = true;
          else if (pw[di] !== pw[m]) {
            const att = strength(m, pw[di]);
            const def = head ? strength(di) : typ[di] === 1 ? 1 : strength(di);
            ok = att > def && incoming[dst[m]].every(r => r === m || att > strength(r));
          }
        }
        visiting[m] = false;
        success[m] = ok;
        return ok;
      }
      moves.forEach(succeeds);
      const dis = {};
      moves.forEach(m => { if (success[m]) { const di = idx[dst[m]]; if (di !== undefined && !success[di]) dis[di] = units[m].at; } });
      return { success, dis };
    }
    let removed = {}, solved;
    const key = o => Object.keys(o).sort().map(k => k + ':' + o[k]).join(',');
    const seen = {};
    for (let it = 0; it < 20; it++) {
      solved = calculate(removed);
      // removed maps unit index -> attacker origin; engine compares removed[move.unit] !== move.dest
      const k = key(solved.dis);
      if (k === key(removed)) break;
      if (seen[k]) break;
      seen[k] = 1;
      removed = solved.dis;
    }
    const out = [], dislodged = [];
    for (let i = 0; i < n; i++) {
      const u = units[i];
      if (solved.dis[i] !== undefined) dislodged.push({ power: u.power, type: u.type, at: u.at, attacker: solved.dis[i] });
      else out.push({ power: u.power, type: u.type, at: solved.success[i] ? dst[i] : u.at });
    }
    return { units: out, dislodged };
  }

  // ---------- memory ----------
  const mem = { aggression: {}, attackedMe: {}, lastSeen: -1 };

  function living(state) {
    return Object.keys(state.centresByPower).filter(p => p !== state.you &&
      (state.centresByPower[p] > 0 || state.units.some(u => u.power === p)));
  }

  function isFinalAutumn(state) {
    return state.year >= state.limits.maxYears && state.season === 'Autumn';
  }
  function isFinalYear(state) { return state.year >= state.limits.maxYears; }

  function trustOf(state, p) {
    const t = state.trust[p];
    if (!t) return 0.5;
    return (t.kept + 1) / (t.kept + t.broken * 2 + 2);
  }

  function updateMemory(state) {
    const h = state.history;
    if (!h || !h.length) return;
    const key = h[h.length - 1].year * 2 + (h[h.length - 1].season === 'Autumn' ? 1 : 0);
    if (key === mem.lastSeen) return;
    mem.lastSeen = key;
    const last = h[h.length - 1];
    // count aggression against me from the last season
    (last.resolution || []).forEach(o => {
      if (o.power === state.you) return;
      if (o.type === 'move') {
        mem.aggression[o.power] = (mem.aggression[o.power] || 0) + 1;
      }
    });
    // who attacked my units (pre-resolution positions are given by resolution unit ids)
    const mine = new Set((last.resolution || []).filter(o => o.power === state.you).map(o => o.unit));
    (last.resolution || []).forEach(o => {
      if (o.power !== state.you && o.type === 'move' && mine.has(o.dest)) {
        mem.attackedMe[o.power] = (mem.attackedMe[o.power] || 0) + 1;
      }
    });
  }

  function partners(state) {
    const s = new Set();
    state.accepted.forEach(p => {
      if (p.type === 'peace' || p.type === 'alliance') s.add(p.power === state.you ? p.partner : p.power);
    });
    return s;
  }

  // ---------- target values ----------
  function targetSet(state) {
    const me = state.you;
    const t = [];
    G.scs.forEach(id => {
      if (state.owners[id] !== me) t.push(id);
    });
    return t;
  }

  function nearestTargetDist(state, unit, targets) {
    const d = G.dist[unit.type][unit.at];
    let best = 20;
    targets.forEach(t => { const v = d[t]; if (v !== undefined && v < best) best = v; });
    return best;
  }

  // ---------- enemy scenario generation ----------
  function makeRng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function enemyScenario(state, rnd, ctx) {
    const me = state.you;
    const occ = ctx.occ;
    const orders = [];
    const byPower = {};
    state.units.forEach(u => { if (u.power !== me) (byPower[u.power] = byPower[u.power] || []).push(u); });
    Object.keys(byPower).forEach(power => {
      const us = byPower[power];
      const peaceWithMe = ctx.partners.has(power);
      const tr = trustOf(state, power);
      const ownT = G.scs.filter(id => state.owners[id] !== power);
      const plan = {};
      const claimed = {};
      us.forEach(u => {
        const opts = [{ type: 'hold', w: 1 }];
        const ownerHere = state.owners[u.at];
        if (G.prov[u.at].sc && ownerHere !== power && state.season === 'Spring') opts[0].w = 1.2;
        if (G.prov[u.at].sc && ownerHere !== power && state.season === 'Autumn') opts[0].w = 6;
        if (G.prov[u.at].sc && ownerHere === power) {
          const threatened = G.adj[u.at].some(a => occ[a] && occ[a].power !== power);
          if (threatened) opts[0].w += 2;
        }
        const d0 = nearestTargetDist(state, u, ownT);
        G.adj[u.at].forEach(dst => {
          if (!G.canMoveT(u.type, u.at, dst)) return;
          let w = 0.4;
          const o = occ[dst];
          const p = G.prov[dst];
          if (p.sc && state.owners[dst] !== power) w = o ? 2.2 : 5;
          else {
            const d1 = nearestTargetDist(state, { type: u.type, at: dst }, ownT);
            if (d1 < d0) w = 1.5;
          }
          if (o && o.power === power) w *= 0.3;
          if (o && o.power === me) {
            if (peaceWithMe) w *= (1 - 0.8 * tr);
            w *= 1 + 0.3 * Math.min(3, mem.attackedMe[power] || 0);
          }
          opts.push({ type: 'move', dest: dst, w });
        });
        let tot = 0; opts.forEach(o => { tot += o.w; });
        let r = rnd() * tot, pick = opts[0];
        for (const o of opts) { r -= o.w; if (r <= 0) { pick = o; break; } }
        if (pick.type === 'move' && claimed[pick.dest]) {
          // convert to support of the claimer
          const cl = claimed[pick.dest];
          if (G.canMoveT(u.type, u.at, pick.dest)) {
            plan[u.at] = { unit: u.at, type: 'support', target: cl, targetDest: pick.dest };
            return;
          }
        }
        if (pick.type === 'move') { claimed[pick.dest] = u.at; plan[u.at] = { unit: u.at, type: 'move', dest: pick.dest }; }
        else plan[u.at] = { unit: u.at, type: 'hold' };
      });
      // some holders support attacks
      us.forEach(u => {
        if (plan[u.at].type !== 'hold' || rnd() < 0.4) return;
        const cands = Object.keys(claimed).filter(d => d !== u.at && G.adj[u.at].includes(d) && G.canMoveT(u.type, u.at, d) && occ[d]);
        if (cands.length) {
          const d = cands[Math.floor(rnd() * cands.length)];
          plan[u.at] = { unit: u.at, type: 'support', target: claimed[d], targetDest: d };
        }
      });
      Object.values(plan).forEach(o => orders.push(o));
    });
    // partner support promises to me
    state.accepted.forEach(p => {
      if (p.type === 'support' && p.power !== me && p.partner === me) {
        const sup = state.units.find(u => u.power === p.power &&
          u.at !== p.terms.unit && G.canMoveT(u.type, u.at, p.terms.dest === 'hold' ? p.terms.unit : p.terms.dest));
        if (sup && rnd() < trustOf(state, p.power)) {
          const i = orders.findIndex(o => o.unit === sup.at);
          if (i >= 0) orders[i] = { unit: sup.at, type: 'support', target: p.terms.unit, targetDest: p.terms.dest };
        }
      }
    });
    return orders;
  }

  // ---------- evaluation ----------
  function evaluate(state, ctx, res, myOrders) {
    const me = state.you;
    const autumn = state.season === 'Autumn';
    let score = 0;
    const occ = {};
    res.units.forEach(u => { occ[u.at] = u; });
    if (autumn) {
      let myC = 0;
      const counts = {};
      G.scs.forEach(id => {
        const o = occ[id];
        const owner = o ? o.power : state.owners[id];
        if (owner) counts[owner] = (counts[owner] || 0) + 1;
        if (owner === me) myC++;
      });
      score += 10 * myC;
      // slight preference to hurt the leader
      let lead = 0; Object.keys(counts).forEach(p => { if (p !== me && counts[p] > lead) lead = counts[p]; });
      score -= 1.5 * lead;
      if (ctx.finalAutumn) {
        score += 0; // pure centre count
      }
    } else {
      G.scs.forEach(id => {
        const o = occ[id];
        if (!o) {
          if (state.owners[id] === me) {
            // threatened empty own centre
            const thr = G.adj[id].some(a => occ[a] && occ[a].power !== me);
            if (thr) score -= 2.5;
          }
          return;
        }
        if (o.power === me) {
          if (state.owners[id] !== me) score += 5;
          else score += 0.5;
        } else if (state.owners[id] === me) score -= 5;
      });
    }
    let myUnits = 0;
    res.units.forEach(u => {
      if (u.power !== me) return;
      myUnits++;
      score -= 0.35 * nearestTargetDist(state, u, ctx.targets);
    });
    res.dislodged.forEach(u => {
      if (u.power === me) {
        // retreat possible? losing tempo/unit
        score -= autumn ? 6 : 5;
      } else score += 1.5;
    });
    if (autumn && !ctx.finalAutumn) {
      // threats to my centres next year
      G.scs.forEach(id => {
        const owner = occ[id] ? occ[id].power : state.owners[id];
        if (owner !== me || occ[id]) return;
        const thr = G.adj[id].some(a => occ[a] && occ[a].power !== me);
        if (thr) score -= 1;
      });
    }
    return score;
  }

  function promiseCost(state, ctx, order) {
    if (ctx.finalAutumn) return 0;
    let c = 0;
    const dest = order.type === 'move' ? order.dest : order.type === 'support' && order.targetDest !== 'hold' ? order.targetDest : null;
    if (dest) {
      const o = ctx.occ[dest];
      if (o && ctx.partners.has(o.power)) c += ctx.breakCost;
      if (order.type === 'move' && ctx.dmz.has(dest)) c += ctx.breakCost;
    }
    return c;
  }

  // ---------- order search ----------
  function chooseOrders(state) {
    init(state);
    updateMemory(state);
    const me = state.you;
    const mine = state.units.filter(u => u.power === me);
    if (!mine.length) return [];
    const occ = {};
    state.units.forEach(u => { occ[u.at] = u; });
    const ctx = {
      occ,
      partners: partners(state),
      dmz: new Set(state.accepted.filter(p => p.type === 'dmz').map(p => p.terms.province)),
      targets: targetSet(state),
      finalAutumn: isFinalAutumn(state),
      breakCost: isFinalYear(state) ? 1 : 3
    };
    if (!ctx.targets.length) ctx.targets = G.scs.slice();
    const seed = (state.seed ^ (state.year * 7919) ^ (state.season === 'Autumn' ? 104729 : 0) ^ me.length * 31) >>> 0;
    const rnd = makeRng(seed + (Math.floor(Math.random() * 1e6)));
    const NS = mine.length > 8 ? 10 : 14;
    const scen = [];
    for (let i = 0; i < NS; i++) scen.push(enemyScenario(state, rnd, ctx));

    // candidate orders per unit
    const myAt = new Set(mine.map(u => u.at));
    const cands = {};
    mine.forEach(u => {
      const legal = state.legalOrders[u.at] || [{ unit: u.at, type: 'hold' }];
      cands[u.at] = legal.filter(o => o.type !== 'support' || myAt.has(o.target));
    });

    // our promised supports
    const forced = {};
    state.accepted.forEach(p => {
      if (p.type === 'support' && p.power === me) {
        const sup = mine.find(u => !forced[u.at] && (state.legalOrders[u.at] || []).some(o =>
          o.type === 'support' && o.target === p.terms.unit && o.targetDest === p.terms.dest));
        if (sup && !ctx.finalAutumn) forced[sup.at] = { unit: sup.at, type: 'support', target: p.terms.unit, targetDest: p.terms.dest };
      }
    });

    const plan = {};
    // greedy init: move toward targets
    const used = {};
    mine.forEach(u => {
      if (forced[u.at]) { plan[u.at] = forced[u.at]; return; }
      let best = { unit: u.at, type: 'hold' }, bs = -nearestTargetDist(state, u, ctx.targets) + (G.prov[u.at].sc && state.owners[u.at] !== me ? 3 : 0);
      cands[u.at].forEach(o => {
        if (o.type !== 'move' || used[o.dest] || myAt.has(o.dest)) return;
        const s = -nearestTargetDist(state, { type: u.type, at: o.dest }, ctx.targets) + (G.prov[o.dest].sc && state.owners[o.dest] !== me ? 3 : 0) - (occ[o.dest] ? 2 : 0) - promiseCost(state, ctx, o);
        if (s > bs) { bs = s; best = o; }
      });
      plan[u.at] = best;
      if (best.type === 'move') used[best.dest] = 1;
    });

    function scoreOf(p) {
      const orders = Object.values(p);
      let tot = 0;
      for (let i = 0; i < scen.length; i++) {
        const res = fastAdj(state.units, orders.concat(scen[i]), canMv);
        tot += evaluate(state, ctx, res, orders);
      }
      let pc = 0; orders.forEach(o => { pc += promiseCost(state, ctx, o); });
      return tot / scen.length - pc;
    }

    const t0 = Date.now();
    const budget = 500;
    const canMv = (u, d) => G.canMoveT(u.type, u.at, d);
    let cur = scoreOf(plan);
    let improved = true, pass = 0;
    while (improved && pass < 4) {
      improved = false; pass++;
      for (const u of mine) {
        if (forced[u.at]) continue;
        if (Date.now() - t0 > budget) break;
        const orig = plan[u.at];
        for (const o of cands[u.at]) {
          if (Date.now() - t0 > budget) break;
          if (JSON.stringify(o) === JSON.stringify(plan[u.at])) continue;
          const trial = Object.assign({}, plan);
          trial[u.at] = o;
          // paired move for support-to-move
          if (o.type === 'support' && o.targetDest !== 'hold' && !forced[o.target]) {
            trial[o.target] = { unit: o.target, type: 'move', dest: o.targetDest };
          }
          const s = scoreOf(trial);
          if (s > cur + 1e-9) {
            cur = s; Object.assign(plan, trial); improved = true;
          }
        }
        void orig;
      }
    }
    return mine.map(u => plan[u.at] || { unit: u.at, type: 'hold' });
  }

  // ---------- negotiation ----------
  function propose(state) {
    init(state);
    updateMemory(state);
    const me = state.you;
    const others = living(state);
    if (!state.units.some(u => u.power === me)) return [];
    const out = [];
    // peace with everyone; prefer those adjacent to us
    const sorted = others.slice().sort((a, b) => (state.centresByPower[b] - state.centresByPower[a]) || (a < b ? -1 : 1));
    // find the leader (to name as alliance target)
    const leader = sorted[0];
    sorted.forEach(p => {
      if (out.length >= 6) return;
      if (leader && p !== leader && others.length >= 3 && state.centresByPower[leader] >= state.centresByPower[me]) {
        out.push({ to: p, type: 'alliance', terms: { target: leader } });
      } else out.push({ to: p, type: 'peace', terms: {} });
    });
    return out.slice(0, 6);
  }

  function answer(state) {
    init(state);
    const me = state.you;
    const res = {};
    state.inbox.forEach(p => {
      let ok = false;
      if (p.type === 'peace' || p.type === 'alliance') ok = true;
      else if (p.type === 'support') ok = true; // they promise to help us
      else if (p.type === 'dmz') {
        const prov = p.terms.province;
        // accept only if we have no interest in entering it: our own centre with our unit, or far away
        const myUnits = state.units.filter(u => u.power === me);
        const near = myUnits.some(u => u.at !== prov && G.adj[u.at].includes(prov));
        ok = !near || (state.owners[prov] === me && myUnits.some(u => u.at === prov));
      } else if (p.type === 'request-support') {
        // accept if cheap: a unit of ours could support it and it doesn't hurt us
        const dest = p.terms.dest === 'hold' ? p.terms.unit : p.terms.dest;
        const target = state.units.find(u => u.at === dest);
        const harmless = !target || target.power !== me;
        const capable = state.units.some(u => u.power === me && (state.legalOrders[u.at] || []).some(o =>
          o.type === 'support' && o.target === p.terms.unit && o.targetDest === p.terms.dest));
        ok = harmless && capable && p.terms.dest === 'hold' && trustOf(state, p.from) > 0.4 && !isFinalYear(state);
      }
      res[p.id] = ok ? 'accept' : 'reject';
    });
    return res;
  }

  // ---------- retreats ----------
  function retreats(state) {
    init(state);
    const me = state.you;
    const out = {};
    const taken = {};
    const targets = targetSet(state);
    state.retreats.forEach(u => {
      if (u.power && u.power !== me) return;
      let best = null, bs = -1e9;
      (u.options || []).forEach(o => {
        if (taken[o]) return;
        let s = -0.5 * nearestTargetDist(state, { type: u.type, at: o }, targets);
        if (G.prov[o].sc) {
          if (state.owners[o] !== me) s += state.season === 'Autumn' ? 8 : 3;
          else s += 2;
        }
        if (s > bs) { bs = s; best = o; }
      });
      if (best) taken[best] = 1;
      out[u.at] = best;
    });
    return out;
  }

  // ---------- builds ----------
  function builds(state) {
    init(state);
    const me = state.you;
    const mine = state.units.filter(u => u.power === me);
    const delta = state.centresByPower[me] - mine.length;
    const targets = targetSet(state);
    if (delta > 0) {
      const homes = G.ids.filter(id => G.prov[id].home === me && state.owners[id] === me &&
        !state.units.some(u => u.at === id));
      const fleets = mine.filter(u => u.type === 'fleet').length;
      const out = [];
      homes.sort((a, b) => {
        const da = nearestTargetDist(state, { type: 'army', at: a }, targets);
        const db = nearestTargetDist(state, { type: 'army', at: b }, targets);
        return da - db || (a < b ? -1 : 1);
      });
      homes.slice(0, delta).forEach(h => {
        let type = 'army';
        if (G.prov[h].coastal) {
          const da = nearestTargetDist(state, { type: 'army', at: h }, targets);
          const df = nearestTargetDist(state, { type: 'fleet', at: h }, targets);
          if (df + 1 < da && fleets === 0) type = 'fleet';
        }
        out.push({ type, at: h });
      });
      return out;
    }
    if (delta < 0) {
      const scored = mine.map(u => {
        let v = -nearestTargetDist(state, u, targets);
        if (G.prov[u.at].sc) v += 4;
        const homeD = Math.min.apply(null, G.ids.filter(id => G.prov[id].home === me).map(h => G.gdist[h][u.at] === undefined ? 99 : G.gdist[h][u.at]));
        v -= 0.2 * homeD;
        return { u, v };
      }).sort((a, b) => a.v - b.v || (a.u.at < b.u.at ? -1 : 1));
      return scored.slice(0, -delta).map(x => ({ disband: x.u.at }));
    }
    return [];
  }

  function safe(fn, fallback) {
    return function (state) {
      try { return fn(state); } catch (e) { return fallback(state); }
    };
  }

  module.exports = {
    name: 'Opus Strategos',
    propose: safe(propose, () => []),
    answer: safe(answer, () => ({})),
    orders: safe(chooseOrders, state => state.units.filter(u => u.power === state.you).map(u => ({ unit: u.at, type: 'hold' }))),
    retreats: safe(retreats, () => ({})),
    builds: safe(builds, () => [])
  };
})();

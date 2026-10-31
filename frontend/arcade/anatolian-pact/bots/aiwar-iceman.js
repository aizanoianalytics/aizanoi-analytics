(function () {
  'use strict';

  const NAME = 'Iceman';

  function own(state) {
    return state.units.filter(u => u.power === state.you);
  }

  function isLiving(state, power) {
    if (power === state.you) return true;
    return (state.centresByPower[power] || 0) > 0 || state.units.some(u => u.power === power);
  }

  function allied(state) {
    const set = new Set();
    for (let i = 0; i < state.accepted.length; i++) {
      const p = state.accepted[i];
      if (p.type === 'peace' || p.type === 'alliance') {
        const other = p.power === state.you ? p.partner : p.power;
        if (other) set.add(other);
      }
    }
    return set;
  }

  function dmzSet(state) {
    const set = new Set();
    for (let i = 0; i < state.accepted.length; i++) {
      const p = state.accepted[i];
      if (p.type === 'dmz') set.add(p.terms.province);
    }
    return set;
  }

  function canSupportMove(state, supporterUnit, targetUnit, dest) {
    const legal = state.legalOrders[supporterUnit.at] || [];
    for (let i = 0; i < legal.length; i++) {
      const o = legal[i];
      if (o.type === 'support' && o.target === targetUnit.at && o.targetDest === dest) return true;
    }
    return false;
  }

  function hasSupportFor(state, unit, dest) {
    const units = own(state);
    for (let i = 0; i < units.length; i++) {
      const s = units[i];
      if (s.at === unit.at) continue;
      if (canSupportMove(state, s, unit, dest)) return s;
    }
    return null;
  }

  module.exports = {
    name: NAME,
    propose(state) {
      const allies = allied(state);
      const candidates = [];
      const powers = Object.keys(state.centresByPower);
      for (let i = 0; i < powers.length; i++) {
        const p = powers[i];
        if (p === state.you) continue;
        if (!isLiving(state, p)) continue;
        if (allies.has(p)) continue;
        candidates.push(p);
      }
      candidates.sort((a, b) => {
        const ca = state.centresByPower[a] || 0;
        const cb = state.centresByPower[b] || 0;
        if (cb !== ca) return cb - ca;
        return a.localeCompare(b);
      });
      const res = [];
      for (let i = 0; i < candidates.length && res.length < 2; i++) {
        res.push({ to: candidates[i], type: 'peace', terms: {} });
      }
      return res;
    },
    answer(state) {
      const ans = {};
      const allies = allied(state);
      for (let i = 0; i < state.inbox.length; i++) {
        const p = state.inbox[i];
        if (p.type === 'peace' || p.type === 'dmz') {
          if (!allies.has(p.from)) { ans[p.id] = 'accept'; continue; }
        }
        if (p.type === 'alliance') {
          ans[p.id] = 'reject';
          continue;
        }
        if (p.type === 'request-support') {
          if (allies.has(p.from)) {
            const ok = own(state).some(u => {
              const legal = state.legalOrders[u.at] || [];
              for (let j = 0; j < legal.length; j++) {
                const o = legal[j];
                if (o.type === 'support' && o.target === p.terms.unit && o.targetDest === p.terms.dest) return true;
              }
              return false;
            });
            if (ok) { ans[p.id] = 'accept'; continue; }
          }
          ans[p.id] = 'reject';
          continue;
        }
        if (p.type === 'support') {
          if (allies.has(p.from)) { ans[p.id] = 'accept'; continue; }
          ans[p.id] = 'reject';
          continue;
        }
        ans[p.id] = 'reject';
      }
      return ans;
    },
    orders(state) {
      const allies = allied(state);
      const dmz = dmzSet(state);
      const plan = {};
      const ownUnits = own(state);
      for (let i = 0; i < ownUnits.length; i++) {
        plan[ownUnits[i].at] = { unit: ownUnits[i].at, type: 'hold' };
      }
      const promised = state.accepted.filter(p => p.power === state.you && p.type === 'support');
      for (let i = 0; i < promised.length; i++) {
        const pr = promised[i];
        for (let j = 0; j < ownUnits.length; j++) {
          const s = ownUnits[j];
          if (plan[s.at].type !== 'hold') continue;
          const legal = state.legalOrders[s.at] || [];
          for (let k = 0; k < legal.length; k++) {
            const o = legal[k];
            if (o.type === 'support' && o.target === pr.terms.unit && o.targetDest === pr.terms.dest) {
              plan[s.at] = { unit: s.at, type: 'support', target: pr.terms.unit, targetDest: pr.terms.dest };
              break;
            }
          }
          if (plan[s.at].type === 'support') break;
        }
      }
      const moves = [];
      for (let i = 0; i < ownUnits.length; i++) {
        const u = ownUnits[i];
        if (plan[u.at].type !== 'hold') continue;
        const legal = state.legalOrders[u.at] || [];
        for (let j = 0; j < legal.length; j++) {
          const o = legal[j];
          if (o.type !== 'move') continue;
          if (dmz.has(o.dest)) continue;
          const occ = state.units.find(x => x.at === o.dest);
          if (occ && occ.power === state.you) continue;
          if (occ && allies.has(occ.power)) continue;
          const owner = state.owners[o.dest];
          if (owner && owner !== state.you && allies.has(owner)) continue;
          const isSc = (function(){ const p = state.map.provinces.find(pr=>pr.id===o.dest); return p ? p.sc : false; })();
          let score = 0;
          if (isSc && owner && owner !== state.you) score += 40;
          else if (isSc && !owner) score += 25;
          else if (!occ) score += 10;
          else score -= 5;
          if (state.owners[u.at] === state.you) score -= 1;
          moves.push({ unit: u, order: o, score: score });
        }
      }
      moves.sort((a,b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (a.unit.at !== b.unit.at) return a.unit.at.localeCompare(b.unit.at);
        return a.order.dest.localeCompare(b.order.dest);
      });
      const claimed = new Set();
      for (let m = 0; m < moves.length; m++) {
        const mv = moves[m];
        if (plan[mv.unit.at].type !== 'hold') continue;
        if (claimed.has(mv.order.dest)) continue;
        const occ = state.units.find(x => x.at === mv.order.dest);
        if (occ && occ.power !== state.you) {
          const helper = hasSupportFor(state, mv.unit, mv.order.dest);
          if (!helper || plan[helper.at].type !== 'hold') continue;
          plan[mv.unit.at] = mv.order;
          claimed.add(mv.order.dest);
          plan[helper.at] = { unit: helper.at, type: 'support', target: mv.unit.at, targetDest: mv.order.dest };
        } else {
          plan[mv.unit.at] = mv.order;
          claimed.add(mv.order.dest);
        }
      }
      const res = [];
      for (let i = 0; i < ownUnits.length; i++) {
        res.push(plan[ownUnits[i].at]);
      }
      return res;
    },
    retreats(state) {
      const out = {};
      for (let i = 0; i < state.retreats.length; i++) {
        const r = state.retreats[i];
        out[r.at] = r.options && r.options.length ? r.options[0] : null;
      }
      return out;
    },
    builds(state) {
      const delta = (state.centresByPower[state.you] || 0) - own(state).length;
      if (delta <= 0) return [];
      const res = [];
      const provs = state.map.provinces;
      for (let i = 0; i < provs.length && res.length < delta; i++) {
        const p = provs[i];
        if (p.home !== state.you) continue;
        if (state.owners[p.id] !== state.you) continue;
        if (state.units.some(u => u.at === p.id)) continue;
        if (p.coastal) res.push({ type: 'fleet', at: p.id });
        else res.push({ type: 'army', at: p.id });
      }
      return res;
    }
  };
})();

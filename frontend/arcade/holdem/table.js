(function () {
  'use strict';

  const SUITS = { c: '♣', d: '♦', h: '♥', s: '♠' };
  const SUIT_NAMES = { c: 'clubs', d: 'diamonds', h: 'hearts', s: 'spades' };
  const RANK_NAMES = { T: '10', J: 'Jack', Q: 'Queen', K: 'King', A: 'Ace' };
  const format = value => Number(value || 0).toLocaleString('en-US');
  const PHONE_SEATS = [
    [50, 90],
    [16, 74],
    [16, 54],
    [16, 34],
    [24, 12],
    [76, 12],
    [84, 34],
    [84, 54],
    [84, 74]
  ];

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function card(value) {
    const valid = typeof value === 'string' && /^[2-9TJQKA][cdhs]$/.test(value);
    const node = element('span', `ph-card${valid ? '' : ' ph-back'}`);
    if (!valid) {
      node.setAttribute('aria-label', 'Hidden card');
      return node;
    }
    const rank = value[0] === 'T' ? '10' : value[0];
    if (value[1] === 'd' || value[1] === 'h') node.classList.add('ph-red');
    node.append(element('b', null, rank), element('span', null, SUITS[value[1]]));
    node.setAttribute('aria-label', `${RANK_NAMES[value[0]] || rank} of ${SUIT_NAMES[value[1]]}`);
    return node;
  }

  function create(root) {
    let destroyed = false;
    let lastState = null;
    let lastOptions = null;
    const phone = window.matchMedia('(max-width: 600px)');
    const originalMinHeight = root.style.getPropertyValue('min-height');
    const originalMinHeightPriority = root.style.getPropertyPriority('min-height');
    root.classList.add('ph-table');
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', 'Hold’em table');

    function restoreMinHeight() {
      if (originalMinHeight) {
        root.style.setProperty('min-height', originalMinHeight, originalMinHeightPriority);
      } else {
        root.style.removeProperty('min-height');
      }
    }

    function update(state, options = {}) {
      if (destroyed) return;
      lastState = state;
      lastOptions = options;
      const phoneLayout = phone.matches && state.seats.length >= 7;
      if (phoneLayout) root.style.setProperty('min-height', '800px');
      else restoreMinHeight();
      root.dataset.seats = String(state.seats.length);
      const fragment = document.createDocumentFragment();
      fragment.appendChild(element('div', 'ph-felt'));
      const centre = element('div', 'ph-centre');
      centre.appendChild(element('span', 'ph-table-brand', 'AIZANOI · AI WAR'));
      const pots = element('div', 'ph-pots');
      pots.setAttribute('aria-label', 'Pots');
      const potList = state.pots || [];
      const total = potList.reduce((sum, pot) => sum + pot.amount, 0);
      pots.appendChild(element('strong', 'ph-pot-total', `POT ${format(total)}`));
      if (potList.length > 1) {
        const layers = element('span', 'ph-pot-layers', potList.map(pot => format(pot.amount)).join(' + '));
        layers.title = 'Current contribution layers; unmatched chips are refunded at settlement';
        layers.setAttribute('aria-label', `Contribution layers: ${potList.map(pot => format(pot.amount)).join(', ')}`);
        pots.appendChild(layers);
      }
      centre.appendChild(pots);
      const board = element('div', 'ph-board');
      board.setAttribute('aria-label', 'Community cards');
      for (let index = 0; index < 5; index++) {
        const value = state.board[index];
        const face = card(value);
        if (!value) {
          face.classList.remove('ph-back');
          face.classList.add('ph-empty');
          face.setAttribute('aria-label', 'Undealt community card');
        }
        board.appendChild(face);
      }
      centre.appendChild(board);
      if (options.lastAction) {
        centre.appendChild(element('p', 'ph-table-action', options.lastAction));
      }
      fragment.appendChild(centre);

      const acting = options.highlight === undefined ? state.toAct : options.highlight;
      state.seats.forEach((seat, index) => {
        const angle = Math.PI / 2 + index * Math.PI * 2 / state.seats.length;
        const plate = element('section', 'ph-seat');
        plate.dataset.seatId = seat.id;
        if (phoneLayout) {
          // Separate the top pair horizontally instead of crowding an ellipse.
          const slot = Math.floor(index * PHONE_SEATS.length / state.seats.length);
          const [x, y] = PHONE_SEATS[slot];
          plate.style.setProperty('--x', `${x}%`);
          plate.style.setProperty('--y', `${y}%`);
          plate.style.setProperty('position', 'absolute');
          plate.style.setProperty('left', `${x}%`);
          plate.style.setProperty('top', `${y}%`);
          plate.style.setProperty('right', 'auto');
          plate.style.setProperty('bottom', 'auto');
          plate.style.setProperty('transform', 'translate(-50%, -50%)');
          plate.style.setProperty('width', '28%');
          plate.style.setProperty('min-width', '0');
          plate.style.setProperty('max-width', 'none');
          plate.style.setProperty('height', '126px');
          plate.style.setProperty('min-height', '0');
          plate.style.setProperty('max-height', 'none');
          plate.style.setProperty('box-sizing', 'border-box');
          plate.style.setProperty('margin', '0');
          plate.style.setProperty('padding', '6px');
        } else {
          plate.style.setProperty('--x', `${50 + Math.cos(angle) * 36}%`);
          plate.style.setProperty('--y', `${50 + Math.sin(angle) * 38}%`);
        }
        plate.classList.toggle('ph-acting', acting === seat.id);
        plate.classList.toggle('ph-out', Boolean(seat.out));
        plate.classList.toggle('ph-folded', Boolean(seat.folded));
        plate.setAttribute('aria-label', `${seat.name}, ${format(seat.stack)} chips${acting === seat.id ? ', to act' : ''}`);

        const title = element('div', 'ph-seat-title');
        const name = element('b', 'ph-seat-name', seat.name);
        name.title = seat.name;
        title.appendChild(name);
        if (seat.isButton) {
          const dealer = element('span', 'ph-dealer', 'D');
          dealer.setAttribute('aria-label', 'Dealer button');
          title.appendChild(dealer);
        }
        plate.append(title, element('span', 'ph-stack', format(seat.stack)));
        const status = seat.out ? `Out · #${seat.place || '—'}` :
          seat.folded ? 'Folded' : seat.allIn ? 'ALL-IN' :
            acting === seat.id ? 'TO ACT' :
              state.smallBlindSeat === index ? 'Small blind' :
                state.bigBlindSeat === index ? 'Big blind' : '';
        plate.appendChild(element('span', 'ph-status', status || '\u00a0'));

        const cards = element('div', 'ph-hole');
        const visible = Boolean(seat.cards && (!seat.private || seat.id === options.revealFor));
        cards.dataset.revealed = visible ? 'true' : 'false';
        cards.setAttribute('aria-label', visible ? `${seat.name} cards` : 'Hidden cards');
        // A player eliminated at this showdown still has public shown cards.
        if (!seat.out || visible) {
          cards.append(card(visible ? seat.cards[0] : null), card(visible ? seat.cards[1] : null));
        }
        plate.appendChild(cards);
        plate.appendChild(element('span', 'ph-bet', seat.bet > 0 ? `● ${format(seat.bet)}` : '\u00a0'));
        fragment.appendChild(plate);
      });
      root.replaceChildren(fragment);
    }

    function onLayoutChange() {
      if (lastState) update(lastState, lastOptions);
    }

    phone.addEventListener('change', onLayoutChange);

    function destroy() {
      destroyed = true;
      phone.removeEventListener('change', onLayoutChange);
      lastState = null;
      lastOptions = null;
      restoreMinHeight();
      root.replaceChildren();
    }

    return { update, destroy };
  }

  window.HoldemTable = { create };
})();

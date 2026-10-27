(function () {
  'use strict';

  const SUITS = { c: '♣', d: '♦', h: '♥', s: '♠' };
  const format = value => Number(value || 0).toLocaleString('en-US');

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
    node.setAttribute('aria-label', `${rank}${SUITS[value[1]]}`);
    return node;
  }

  function create(root) {
    let destroyed = false;
    root.classList.add('ph-table');
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', 'Hold’em table');

    function update(state, options = {}) {
      if (destroyed) return;

      const fragment = document.createDocumentFragment();
      fragment.appendChild(element('div', 'ph-felt'));

      const centre = element('div', 'ph-centre');
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

      const pots = element('div', 'ph-pots');
      pots.setAttribute('aria-label', 'Pots');
      const potList = state.pots || [];
      if (!potList.length) pots.appendChild(element('span', null, 'Pot 0'));
      potList.forEach((pot, index) => {
        pots.appendChild(element(
          'span',
          'ph-pot',
          `${index ? `Side pot ${index}` : 'Pot'} ${format(pot.amount)}`,
        ));
      });
      centre.appendChild(pots);

      if (options.lastAction) {
        centre.appendChild(element('p', 'ph-table-action', options.lastAction));
      }
      fragment.appendChild(centre);

      const acting = options.highlight === undefined ? state.toAct : options.highlight;
      state.seats.forEach((seat, index) => {
        const angle = Math.PI / 2 + index * Math.PI * 2 / state.seats.length;
        const plate = element('section', 'ph-seat');
        plate.dataset.seatId = seat.id;
        plate.style.setProperty('--x', `${50 + Math.cos(angle) * 39}%`);
        plate.style.setProperty('--y', `${50 + Math.sin(angle) * 39}%`);
        plate.classList.toggle('ph-acting', acting === seat.id);
        plate.classList.toggle('ph-out', Boolean(seat.out));
        plate.setAttribute('aria-label', `${seat.name}, ${format(seat.stack)} chips`);

        const title = element('div', 'ph-seat-title');
        title.appendChild(element('b', 'ph-seat-name', seat.name));
        if (seat.isButton) title.appendChild(element('span', 'ph-dealer', 'D'));
        plate.append(title, element('span', 'ph-stack', format(seat.stack)));

        const status = seat.out
          ? `Out · #${seat.place || '—'}`
          : seat.folded ? 'Fold' : seat.allIn ? 'All-in' : '';
        plate.appendChild(element('span', 'ph-status', status || '\u00a0'));

        const cards = element('div', 'ph-hole');
        const visible = seat.cards && (!seat.private || seat.id === options.revealFor);
        cards.dataset.revealed = visible ? 'true' : 'false';
        cards.setAttribute('aria-label', visible ? `${seat.name} cards` : 'Hidden cards');

        if (!seat.out) {
          cards.append(
            card(visible ? seat.cards[0] : null),
            card(visible ? seat.cards[1] : null),
          );
        }
        plate.appendChild(cards);

        if (seat.bet > 0) {
          plate.appendChild(element('span', 'ph-bet', `● ${format(seat.bet)}`));
        }
        fragment.appendChild(plate);
      });

      root.replaceChildren(fragment);
    }

    function destroy() {
      destroyed = true;
      root.replaceChildren();
    }

    return { update, destroy };
  }

  window.HoldemTable = { create };
})();

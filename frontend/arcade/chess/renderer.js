(function () {
  'use strict';

  const GLYPHS = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' };
  const NAMES = { K: 'king', Q: 'queen', R: 'rook', B: 'bishop', N: 'knight', P: 'pawn' };
  const FONT = '"Segoe UI Symbol","Noto Sans Symbols2","DejaVu Sans",serif';

  function create(canvas, options = {}) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas rendering is unavailable');

    let destroyed = false;
    let view = null;
    let width = 720;
    let height = 720;
    let focused = false;
    let cursor = { column: 4, row: 6 };

    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'application');
    canvas.setAttribute('aria-roledescription', 'interactive chess board');

    function squareAt(column, row) {
      const file = view.flipped ? 7 - column : column;
      const rank = view.flipped ? row : 7 - row;
      return { file, rank, name: String.fromCharCode(97 + file) + (rank + 1) };
    }

    function describe() {
      if (!view) return;
      const square = squareAt(cursor.column, cursor.row);
      const piece = view.board[7 - square.rank][square.file];
      const occupant = piece
        ? `${piece[0] === 'w' ? 'White' : 'Black'} ${NAMES[piece[1]]}`
        : 'empty';
      canvas.setAttribute('aria-description',
        `${square.name}, ${occupant}. ` +
        `${view.selected ? `Selected ${view.selected}. ` : ''}` +
        'Arrow keys move focus; Enter or Space selects. Escape clears selection. ' +
        'For unambiguous castling select the king then its rook. ' +
        'The Move in UCI form below is an alternative.');
    }

    function checked(name, piece) {
      if (!piece || piece[1] !== 'K') return false;
      if (typeof view.check === 'string') return view.check === name;
      return Boolean(view.check) && piece[0] === view.turn;
    }

    function paintPiece(piece, x, y, cellWidth, cellHeight, isChecked) {
      const size = Math.min(cellWidth, cellHeight);
      const white = piece[0] === 'w';
      context.save();
      context.font = `${size * 0.79}px ${FONT}`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.lineJoin = 'round';
      context.lineWidth = Math.max(1.2, size * 0.022);
      context.strokeStyle = white ? '#0a1121' : '#dce6fa';
      context.fillStyle = white ? '#fffaf0' : '#101729';
      context.shadowColor = isChecked ? '#ff5269' : 'rgba(0,0,0,0.45)';
      context.shadowBlur = isChecked ? size * 0.25 : size * 0.055;
      context.shadowOffsetY = size * 0.025;
      const glyph = GLYPHS[piece[1]];
      const centerX = x + cellWidth / 2;
      const centerY = y + cellHeight * 0.53;
      context.strokeText(glyph, centerX, centerY);
      context.fillText(glyph, centerX, centerY);
      context.restore();
    }

    function paintCoordinates(column, row, square, x, y, cellWidth, cellHeight) {
      const size = Math.min(cellWidth, cellHeight);
      context.save();
      context.fillStyle = '#d0dbef';
      context.font = `700 ${Math.max(10, size * 0.145)}px system-ui,sans-serif`;
      if (column === 0) {
        context.textAlign = 'left';
        context.textBaseline = 'top';
        context.fillText(String(square.rank + 1), x + 3, y + 3);
      }
      if (row === 7) {
        context.textAlign = 'right';
        context.textBaseline = 'bottom';
        context.fillText(square.name[0], x + cellWidth - 3, y + cellHeight - 2);
      }
      context.restore();
    }

    function paintSquare(column, row) {
      const cellWidth = width / 8;
      const cellHeight = height / 8;
      const x = column * cellWidth;
      const y = row * cellHeight;
      const square = squareAt(column, row);
      const piece = view.board[7 - square.rank][square.file];
      const isChecked = checked(square.name, piece);
      const last = view.lastMove;

      context.fillStyle = (square.file + square.rank) % 2 === 0
        ? '#19243a' : '#354663';
      context.fillRect(x, y, cellWidth, cellHeight);
      if (last && (last.from === square.name || last.to === square.name)) {
        context.fillStyle = 'rgba(45,212,191,0.36)';
        context.fillRect(x, y, cellWidth, cellHeight);
        context.fillStyle = '#70ffe0';
        context.fillRect(x + 2, y + cellHeight - 4, cellWidth - 4, 2);
      }
      if (isChecked) {
        const glow = context.createRadialGradient(
          x + cellWidth / 2, y + cellHeight / 2, 0,
          x + cellWidth / 2, y + cellHeight / 2,
          Math.max(cellWidth, cellHeight) * 0.72);
        glow.addColorStop(0, 'rgba(255,65,95,0.86)');
        glow.addColorStop(1, 'rgba(255,65,95,0)');
        context.fillStyle = glow;
        context.fillRect(x, y, cellWidth, cellHeight);
      }
      if (piece) paintPiece(piece, x, y, cellWidth, cellHeight, isChecked);
      if (view.targets.has(square.name)) {
        context.save();
        context.fillStyle = 'rgba(110,255,223,0.85)';
        context.strokeStyle = '#8affdf';
        context.lineWidth = Math.max(2, cellWidth * 0.045);
        context.beginPath();
        context.arc(x + cellWidth / 2, y + cellHeight / 2,
          Math.min(cellWidth, cellHeight) * (piece ? 0.39 : 0.11),
          0, Math.PI * 2);
        if (piece) context.stroke();
        else context.fill();
        context.restore();
      }
      if (view.selected === square.name ||
          (focused && cursor.column === column && cursor.row === row)) {
        context.save();
        context.strokeStyle = view.selected === square.name ? '#ffd84d' : '#ffffff';
        context.lineWidth = Math.max(2, cellWidth * 0.045);
        if (view.selected !== square.name) context.setLineDash([5, 3]);
        const inset = context.lineWidth / 2 + 1;
        context.strokeRect(x + inset, y + inset,
          cellWidth - inset * 2, cellHeight - inset * 2);
        context.restore();
      }
      paintCoordinates(column, row, square, x, y, cellWidth, cellHeight);
    }

    function paint() {
      if (destroyed) return;
      const rectangle = canvas.getBoundingClientRect();
      if (rectangle.width <= 0 || rectangle.height <= 0) return;
      width = rectangle.width;
      height = rectangle.height;
      const ratio = window.devicePixelRatio || 1;
      const pixelWidth = Math.max(1, Math.round(width * ratio));
      const pixelHeight = Math.max(1, Math.round(height * ratio));
      if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
      if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
      context.setTransform(pixelWidth / width, 0, 0, pixelHeight / height, 0, 0);
      context.fillStyle = '#0f1526';
      context.fillRect(0, 0, width, height);
      if (!view) return;
      for (let row = 0; row < 8; row++) {
        for (let column = 0; column < 8; column++) paintSquare(column, row);
      }
    }

    function update(game, settings = {}) {
      if (destroyed) return;
      const flipped = Boolean(settings.flipped);
      if (view && view.flipped !== flipped) {
        cursor = { column: 7 - cursor.column, row: 7 - cursor.row };
      }
      view = {
        board: game.board(), turn: game.turn, flipped,
        selected: settings.selected || null,
        targets: new Set(settings.targets || []),
        lastMove: settings.lastMove === undefined ? game.lastMove : settings.lastMove,
        check: settings.check === undefined ? game.inCheck() : settings.check
      };
      describe();
      paint();
    }

    function activate() {
      if (typeof options.onSquare === 'function') {
        options.onSquare(squareAt(cursor.column, cursor.row).name);
      }
    }

    function onPointer(event) {
      if (destroyed || !view || event.isPrimary === false) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      const rectangle = canvas.getBoundingClientRect();
      if (!rectangle.width || !rectangle.height) return;
      const column = Math.floor((event.clientX - rectangle.left) * 8 / rectangle.width);
      const row = Math.floor((event.clientY - rectangle.top) * 8 / rectangle.height);
      if (column < 0 || column > 7 || row < 0 || row > 7) return;
      cursor = { column, row };
      describe();
      activate();
      paint();
    }

    function onKey(event) {
      if (destroyed || !view || event.altKey || event.ctrlKey || event.metaKey) return;
      const delta = {
        ArrowLeft: [-1, 0], ArrowRight: [1, 0],
        ArrowUp: [0, -1], ArrowDown: [0, 1]
      }[event.key];
      if (delta) {
        event.preventDefault();
        cursor.column = Math.max(0, Math.min(7, cursor.column + delta[0]));
        cursor.row = Math.max(0, Math.min(7, cursor.row + delta[1]));
      } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        cursor.column = event.key === 'Home' ? 0 : 7;
        if (event.shiftKey) cursor.row = event.key === 'Home' ? 0 : 7;
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        activate();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        if (typeof options.onCancel === 'function') options.onCancel();
      } else return;
      describe();
      paint();
    }

    function onFocus() { focused = true; describe(); paint(); }
    function onBlur() { focused = false; paint(); }

    canvas.addEventListener('pointerup', onPointer);
    canvas.addEventListener('keydown', onKey);
    canvas.addEventListener('focus', onFocus);
    canvas.addEventListener('blur', onBlur);
    window.addEventListener('resize', paint);
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(paint) : null;
    if (observer) observer.observe(canvas);

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      canvas.removeEventListener('pointerup', onPointer);
      canvas.removeEventListener('keydown', onKey);
      canvas.removeEventListener('focus', onFocus);
      canvas.removeEventListener('blur', onBlur);
      window.removeEventListener('resize', paint);
      if (observer) observer.disconnect();
      view = null;
    }

    paint();
    return { update, destroy };
  }

  window.ChessBoardRenderer = Object.freeze({ create });
})();

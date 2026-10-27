(function () {
  'use strict';

  const GLYPHS = {
    K: '♚',
    Q: '♛',
    R: '♜',
    B: '♝',
    N: '♞',
    P: '♟'
  };
  const FONT = '"Segoe UI Symbol","Noto Sans Symbols2","DejaVu Sans",serif';

  function create(canvas, options = {}) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas rendering is unavailable');

    let destroyed = false;
    let view = null;
    let width = 720;
    let height = 720;

    function squareAt(column, row) {
      const file = view.flipped ? 7 - column : column;
      const rank = view.flipped ? row : 7 - row;
      return {
        file,
        rank,
        name: String.fromCharCode(97 + file) + (rank + 1)
      };
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
      context.lineWidth = Math.max(1, size * 0.018);
      context.strokeStyle = white ? '#11151f' : '#d2dbea';
      context.fillStyle = white ? '#f4f6fb' : '#11151f';

      if (isChecked) {
        context.shadowColor = '#ff5269';
        context.shadowBlur = size * 0.25;
      }

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
      context.fillStyle = '#b5c4de';
      context.font = `600 ${Math.max(9, size * 0.14)}px system-ui,sans-serif`;

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
        ? '#1a2236'
        : '#2a3550';
      context.fillRect(x, y, cellWidth, cellHeight);

      if (last && (last.from === square.name || last.to === square.name)) {
        context.fillStyle = 'rgba(45,212,191,0.35)';
        context.fillRect(x, y, cellWidth, cellHeight);
      }

      if (isChecked) {
        const radius = Math.max(cellWidth, cellHeight) * 0.72;
        const glow = context.createRadialGradient(
          x + cellWidth / 2,
          y + cellHeight / 2,
          0,
          x + cellWidth / 2,
          y + cellHeight / 2,
          radius
        );
        glow.addColorStop(0, 'rgba(255,65,95,0.8)');
        glow.addColorStop(1, 'rgba(255,65,95,0)');
        context.fillStyle = glow;
        context.fillRect(x, y, cellWidth, cellHeight);
      }

      if (piece) paintPiece(piece, x, y, cellWidth, cellHeight, isChecked);

      if (view.targets.has(square.name)) {
        context.save();
        context.fillStyle = 'rgba(110,255,223,0.72)';
        context.strokeStyle = '#6effdf';
        context.lineWidth = Math.max(2, cellWidth * 0.045);
        context.beginPath();
        context.arc(
          x + cellWidth / 2,
          y + cellHeight / 2,
          Math.min(cellWidth, cellHeight) * (piece ? 0.39 : 0.11),
          0,
          Math.PI * 2
        );
        if (piece) context.stroke();
        else context.fill();
        context.restore();
      }

      if (view.selected === square.name) {
        context.save();
        context.strokeStyle = '#ffd84d';
        context.lineWidth = Math.max(2, cellWidth * 0.045);
        const inset = context.lineWidth / 2;
        context.strokeRect(
          x + inset,
          y + inset,
          cellWidth - inset * 2,
          cellHeight - inset * 2
        );
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
      for (let row = 0; row < 8; row += 1) {
        for (let column = 0; column < 8; column += 1) {
          paintSquare(column, row);
        }
      }
    }

    function update(game, settings = {}) {
      if (destroyed) return;

      view = {
        board: game.board(),
        turn: game.turn,
        flipped: Boolean(settings.flipped),
        selected: settings.selected || null,
        targets: new Set(settings.targets || []),
        lastMove: settings.lastMove === undefined ? game.lastMove : settings.lastMove,
        check: settings.check === undefined ? game.inCheck() : settings.check
      };

      paint();
    }

    function onPointer(event) {
      if (destroyed || !view || event.isPrimary === false) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;

      const rectangle = canvas.getBoundingClientRect();
      if (!rectangle.width || !rectangle.height) return;

      const column = Math.floor((event.clientX - rectangle.left) * 8 / rectangle.width);
      const row = Math.floor((event.clientY - rectangle.top) * 8 / rectangle.height);

      if (column < 0 || column > 7 || row < 0 || row > 7) return;
      if (typeof options.onSquare === 'function') {
        options.onSquare(squareAt(column, row).name);
      }
    }

    canvas.addEventListener('pointerup', onPointer);
    window.addEventListener('resize', paint);

    const observer = typeof ResizeObserver === 'function'
      ? new ResizeObserver(paint)
      : null;
    if (observer) observer.observe(canvas);

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      canvas.removeEventListener('pointerup', onPointer);
      window.removeEventListener('resize', paint);
      if (observer) observer.disconnect();
      view = null;
    }

    paint();
    return { update, destroy };
  }

  window.ChessBoardRenderer = Object.freeze({ create });
})();

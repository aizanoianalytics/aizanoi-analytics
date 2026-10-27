(function () {
  'use strict';

  const RED = '#ff4d4d';
  const BLUE = '#3b82f6';

  function create(canvas) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is unavailable');
    let previous = null;
    let current = null;
    let latestSeats = [];
    let latestAlpha = 1;
    let destroyed = false;

    function circle(x, y, radius, fill, stroke, width = 1) {
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      if (fill) {
        context.fillStyle = fill;
        context.fill();
      }
      if (stroke) {
        context.strokeStyle = stroke;
        context.lineWidth = width;
        context.stroke();
      }
    }

    function line(x1, y1, x2, y2) {
      context.beginPath();
      context.moveTo(x1, y1);
      context.lineTo(x2, y2);
      context.stroke();
    }

    function goal(side) {
      const x = side < 0 ? -460 : 420;
      context.fillStyle = '#192738';
      context.fillRect(x, -65, 40, 130);
      context.save();
      context.beginPath();
      context.rect(x, -65, 40, 130);
      context.clip();
      context.strokeStyle = '#ffffff30';
      context.lineWidth = 1;
      for (let offset = -140; offset < 180; offset += 10) {
        line(x, offset, x + 40, offset + 40);
        line(x, offset, x + 40, offset - 40);
      }
      context.restore();
      context.strokeStyle = '#cbd5e1';
      context.lineWidth = 2;
      context.strokeRect(x, -65, 40, 130);
    }

    function pitch() {
      context.fillStyle = '#0f1526';
      context.fillRect(-480, -246, 960, 492);
      goal(-1);
      goal(1);
      for (let index = 0; index < 12; index++) {
        context.fillStyle = index % 2 ? '#2a6034' : '#2f6b3a';
        context.fillRect(-420 + index * 70, -200, 70, 400);
      }
      context.strokeStyle = '#ffffffb8';
      context.lineWidth = 2;
      context.strokeRect(-420, -200, 840, 400);
      line(0, -200, 0, 200);
      circle(0, 0, 70, null, '#ffffffb8', 2);
      circle(0, 0, 3, '#ffffff');
      context.strokeRect(-420, -130, 120, 260);
      context.strokeRect(300, -130, 120, 260);
      context.strokeRect(-420, -85, 45, 170);
      context.strokeRect(375, -85, 45, 170);
      circle(-330, 0, 3, '#ffffffb8');
      circle(330, 0, 3, '#ffffffb8');
    }

    function position(item, old, alpha) {
      if (!old) return item;
      return {
        x: old.x + (item.x - old.x) * alpha,
        y: old.y + (item.y - old.y) * alpha
      };
    }

    function paint() {
      if (!current || destroyed) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const width = canvas.getBoundingClientRect().width || 900;
      const height = width * 460 / 900;
      const pixelWidth = Math.max(1, Math.round(width * dpr));
      const pixelHeight = Math.max(1, Math.round(height * dpr));
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      context.setTransform(canvas.width / 960, 0, 0, canvas.height / 492,
        canvas.width / 2, canvas.height / 2);
      pitch();

      const samePhase = previous && previous.phase === current.phase;
      const alpha = samePhase ? latestAlpha : 1;
      const oldPlayers = new Map((previous ? previous.players : []).map(player => [player.id, player]));
      const seats = new Map(latestSeats.map(seat => [seat.id, seat]));
      for (const player of current.players) {
        const point = position(player, oldPlayers.get(player.id), alpha);
        const seat = seats.get(player.id);
        circle(point.x, point.y + 3, 16, '#00000030');
        circle(point.x, point.y, 15, player.team === 'red' ? RED : BLUE,
          player.kicking ? '#fffbd0' : '#ffffff', player.kicking ? 4 : 2);
        context.fillStyle = '#ffffff';
        context.font = 'bold 10px system-ui, sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(seat && seat.shortName || player.id.toUpperCase(), point.x, point.y);
        context.font = '11px system-ui, sans-serif';
        context.textBaseline = 'top';
        context.lineWidth = 3;
        context.strokeStyle = '#0f1526';
        const label = String(seat && seat.name || player.name || player.id).slice(0, 24);
        context.strokeText(label, point.x, point.y + 20);
        context.fillText(label, point.x, point.y + 20);
      }

      const ball = position(current.ball, previous && previous.ball, alpha);
      context.save();
      context.shadowColor = '#00000070';
      context.shadowBlur = 7;
      context.shadowOffsetY = 3;
      circle(ball.x, ball.y, 10, '#ffffff', '#152133', 2);
      context.restore();
      circle(ball.x - 2, ball.y - 2, 2.5, '#cbd5e1');
      for (const x of [-420, 420]) {
        for (const y of [-65, 65]) circle(x, y, 8, '#ffffff', '#cbd5e1', 1);
      }
    }

    function draw(state, seats, { alpha = 1 } = {}) {
      if (destroyed) return;
      if (!current || state.step !== current.step) {
        previous = current && state.step > current.step ? current : state;
      }
      current = state;
      latestSeats = seats || [];
      latestAlpha = Math.max(0, Math.min(1, alpha));
      paint();
    }

    const observer = new ResizeObserver(paint);
    observer.observe(canvas);
    window.addEventListener('resize', paint);

    return {
      draw,
      destroy() {
        destroyed = true;
        observer.disconnect();
        window.removeEventListener('resize', paint);
        previous = null;
        current = null;
        latestSeats = [];
      }
    };
  }

  window.FootballRenderer = { create };
})();

(function () {
  'use strict';

  const RED = '#ff596b';
  const BLUE = '#58a6ff';

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
      const color = side < 0 ? RED : BLUE;
      context.fillStyle = '#122a3b';
      context.fillRect(x, -65, 40, 130);
      context.save();
      context.beginPath();
      context.rect(x, -65, 40, 130);
      context.clip();
      context.strokeStyle = '#d4efff30';
      context.lineWidth = 1;
      for (let offset = -140; offset < 180; offset += 10) {
        line(x, offset, x + 40, offset + 40);
        line(x, offset, x + 40, offset - 40);
      }
      context.restore();
      context.save();
      context.strokeStyle = color;
      context.lineWidth = 3;
      context.shadowColor = color;
      context.shadowBlur = 8;
      context.strokeRect(x, -65, 40, 130);
      context.restore();
    }

    function pitch() {
      context.fillStyle = '#0b1424';
      context.fillRect(-480, -246, 960, 492);
      goal(-1);
      goal(1);
      for (let index = 0; index < 12; index++) {
        context.fillStyle = index % 2 ? '#174b43' : '#1b5449';
        context.fillRect(-420 + index * 70, -200, 70, 400);
      }
      const glow = context.createRadialGradient(0, 0, 20, 0, 0, 470);
      glow.addColorStop(0, '#81ffda0e');
      glow.addColorStop(1, '#000b172b');
      context.fillStyle = glow;
      context.fillRect(-420, -200, 840, 400);
      context.strokeStyle = '#c5f6e2ae';
      context.lineWidth = 2;
      context.strokeRect(-420, -200, 840, 400);
      line(0, -200, 0, 200);
      circle(0, 0, 70, null, '#c5f6e2ae', 2);
      circle(0, 0, 3, '#e4fff3');
      context.strokeRect(-420, -130, 120, 260);
      context.strokeRect(300, -130, 120, 260);
      context.strokeRect(-420, -85, 45, 170);
      context.strokeRect(375, -85, 45, 170);
      circle(-330, 0, 3, '#c5f6e2ae');
      circle(330, 0, 3, '#c5f6e2ae');
      if (current.phase === 'kickoff') {
        circle(0, 0, 70, null, '#ffe69a', 3);
      }
    }

    function position(item, old, alpha) {
      if (!old) return item;
      return {
        x: old.x + (item.x - old.x) * alpha,
        y: old.y + (item.y - old.y) * alpha
      };
    }

    function human(item) {
      return Boolean(item && (item.human === true || item.isHuman === true ||
        item.type === 'human' || item.kind === 'human' || item.controller === 'human'));
    }

    function fitted(text, maxWidth) {
      const original = String(text);
      if (context.measureText(original).width <= maxWidth) return original;
      let value = original;
      while (value.length && context.measureText(value + '…').width > maxWidth) {
        value = value.slice(0, -1);
      }
      return value + '…';
    }

    function drawOverlay(players, ball, width, height) {
      const sx = width / 960;
      const sy = height / 492;
      const screen = point => ({ x: width / 2 + point.x * sx, y: height / 2 + point.y * sy });
      const compact = width < 600;
      const fontSize = compact ? 11 : 12;
      const padding = 5;
      const labelHeight = fontSize + 8;
      const boxes = [];
      const orb = screen(ball);
      const bodies = players.map(item => ({
        ...item,
        screen: screen(item.point),
        human: human(item.seat) || human(item.player)
      }));

      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.font = `800 ${compact ? 9 : 11}px system-ui, sans-serif`;
      for (const item of bodies) {
        const identity = String(item.seat && item.seat.shortName || item.player.id).toUpperCase();
        context.fillStyle = '#07101f';
        context.fillText(fitted(identity, Math.max(14, 28 * sx)), item.screen.x, item.screen.y);
      }

      const occupied = bodies.map(item => ({
        left: item.screen.x - 15 * sx - 2,
        right: item.screen.x + 15 * sx + 2,
        top: item.screen.y - 15 * sy - 2,
        bottom: item.screen.y + 15 * sy + 2
      }));
      occupied.push({
        left: orb.x - 10 * sx - 3, right: orb.x + 10 * sx + 3,
        top: orb.y - 10 * sy - 3, bottom: orb.y + 10 * sy + 3
      });
      function intersects(a, b) {
        return a.left < b.right + 2 && a.right > b.left - 2 &&
          a.top < b.bottom + 2 && a.bottom > b.top - 2;
      }

      bodies.sort((a, b) => Number(b.human) - Number(a.human) ||
        Math.hypot(a.point.x - ball.x, a.point.y - ball.y) -
        Math.hypot(b.point.x - ball.x, b.point.y - ball.y) ||
        String(a.player.id).localeCompare(String(b.player.id)));

      context.font = `600 ${fontSize}px system-ui, sans-serif`;
      for (const item of bodies) {
        const id = String(item.seat && item.seat.shortName || item.player.id).toUpperCase();
        const name = item.seat && item.seat.name || item.player.name || id;
        const text = fitted(compact ? id : `${id} · ${name}`, compact ? 54 : 155);
        const labelWidth = context.measureText(text).width + padding * 2;
        const gap = Math.max(10, 15 * sy) + 5;
        const candidates = [
          [item.screen.x - labelWidth / 2, item.screen.y + gap],
          [item.screen.x - labelWidth / 2, item.screen.y - gap - labelHeight],
          [item.screen.x + gap, item.screen.y - labelHeight / 2],
          [item.screen.x - gap - labelWidth, item.screen.y - labelHeight / 2],
          [item.screen.x - labelWidth / 2, item.screen.y + gap + labelHeight + 4],
          [item.screen.x - labelWidth / 2, item.screen.y - gap - labelHeight * 2 - 4]
        ];
        let chosen = null;
        for (const candidate of candidates) {
          const left = Math.max(3, Math.min(width - labelWidth - 3, candidate[0]));
          const top = Math.max(23, Math.min(height - labelHeight - 4, candidate[1]));
          const box = { left, top, right: left + labelWidth, bottom: top + labelHeight };
          if (!boxes.some(other => intersects(box, other)) &&
              !occupied.some(other => intersects(box, other))) {
            chosen = box;
            break;
          }
        }
        // Seat lettering remains on every player even if no label fits.
        if (!chosen) continue;
        boxes.push(chosen);
        context.fillStyle = '#091322f2';
        context.strokeStyle = item.player.team === 'red' ? RED : BLUE;
        context.lineWidth = 1;
        context.beginPath();
        context.roundRect(chosen.left, chosen.top, labelWidth, labelHeight, 5);
        context.fill();
        context.stroke();
        context.fillStyle = '#f4faff';
        context.fillText(text, chosen.left + labelWidth / 2, chosen.top + labelHeight / 2);
      }

      context.font = `800 ${compact ? 10 : 12}px system-ui, sans-serif`;
      context.textAlign = 'left';
      context.fillStyle = '#ff9ba7';
      context.fillText('RED →', 12, 12);
      context.textAlign = 'right';
      context.fillStyle = '#9acaff';
      context.fillText('← BLUE', width - 12, 12);

      if (current.phase === 'goal' || current.phase === 'kickoff') {
        const text = current.phase === 'goal' ? 'GOAL!' :
          `${current.kickoffTeam.toUpperCase()} KICKOFF`;
        context.font = `900 ${compact ? 12 : 17}px system-ui, sans-serif`;
        const bannerWidth = context.measureText(text).width + 24;
        const bannerHeight = compact ? 25 : 32;
        const left = (width - bannerWidth) / 2;
        context.fillStyle = '#091322ed';
        context.beginPath();
        context.roundRect(left, 4, bannerWidth, bannerHeight, 7);
        context.fill();
        context.strokeStyle = '#ffe69a';
        context.lineWidth = 1;
        context.stroke();
        context.textAlign = 'center';
        context.fillStyle = '#ffe69a';
        context.fillText(text, width / 2, 4 + bannerHeight / 2);
      }
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
      const players = [];
      for (const player of current.players) {
        const point = position(player, oldPlayers.get(player.id), alpha);
        const seat = seats.get(player.id);
        const color = player.team === 'red' ? RED : BLUE;
        players.push({ player, seat, point });
        circle(point.x, point.y + 4, 16, '#00000050');
        if (human(seat)) circle(point.x, point.y, 20, null, '#fff2ad', 2);
        if (player.kicking) circle(point.x, point.y, 19, null, '#fff2ad', 3);
        circle(point.x, point.y, 15, color, '#edf6ff', 2);
        circle(point.x - 4, point.y - 5, 4, '#ffffff25');
      }

      const ball = position(current.ball, previous && previous.ball, alpha);
      context.save();
      context.shadowColor = '#ccfff7';
      context.shadowBlur = 7;
      circle(ball.x, ball.y, 10, '#ffffff', '#102435', 2);
      context.restore();
      circle(ball.x - 2, ball.y - 2, 2.5, '#b3c9d4');
      for (const x of [-420, 420]) {
        for (const y of [-65, 65]) circle(x, y, 8, '#ffffff', '#cbd5e1', 1);
      }

      // UI text is measured in CSS pixels, not shrinking pitch units.
      context.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
      drawOverlay(players, ball, width, height);
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

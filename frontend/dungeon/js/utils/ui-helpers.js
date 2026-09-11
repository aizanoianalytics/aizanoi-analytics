// js/utils/ui-helpers.js
// AizanoiOS Stili Arayüz Yardımcıları

export function createGlassButton(scene, x, y, width, height, text, onClick) {
  const container = scene.add.container(x, y);

  const bg = scene.add.rectangle(0, 0, width, height, 0xffffff, 0.88);
  bg.setStrokeStyle(2, 0xc5a059);
  bg.setInteractive({ useHandCursor: true });

  const label = scene.add.text(0, 0, text, {
    fontSize: '14px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    color: '#1e293b',
    fontStyle: 'bold',
  }).setOrigin(0.5);

  bg.on('pointerover', () => {
    bg.setFillStyle(0xf8fafc, 0.98);
    bg.setStrokeStyle(2, 0xd4ac0d);
  });

  bg.on('pointerout', () => {
    bg.setFillStyle(0xffffff, 0.88);
    bg.setStrokeStyle(2, 0xc5a059);
  });

  bg.on('pointerdown', () => {
    bg.setFillStyle(0xe2e8f0, 1.0);
    onClick();
  });

  container.add([bg, label]);
  return container;
}

export function drawStatBar(graphics, x, y, width, height, current, max, fillColor, bgColor = 0x1e293b) {
  graphics.clear();
  // Background
  graphics.fillStyle(bgColor, 0.7);
  graphics.fillRoundedRect(x, y, width, height, 3);
  // Border
  graphics.lineStyle(1.5, 0xc5a059, 0.8);
  graphics.strokeRoundedRect(x, y, width, height, 3);
  // Fill
  const percent = Math.max(0, Math.min(1, current / max));
  if (percent > 0) {
    graphics.fillStyle(fillColor, 1.0);
    graphics.fillRoundedRect(x + 1, y + 1, (width - 2) * percent, height - 2, 2);
  }
}

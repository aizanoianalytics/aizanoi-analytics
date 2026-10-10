// js/scenes/VictoryScene.js
// Zeus Tapınağı Arındırıldı Zafer Sahnesi

import { createGlassButton } from '../utils/ui-helpers.js';
import { LEVELS } from '../data/levels.js';

export class VictoryScene extends Phaser.Scene {
  constructor() {
    super({ key: 'VictoryScene' });
  }

  create() {
    const { width, height } = this.cameras.main;

    this.add.rectangle(width / 2, height / 2, width, height, 0x141824, 0.95);

    // Zafer Kutlaması Yapan Aizo (Defne Tacı açmış)
    const aizoHero = this.add.sprite(width / 2, height / 2 - 148, 'aizo', 60).setScale(3.4);
    aizoHero.play('aizo-victory');

    this.add.text(width / 2, height / 2 - 74, 'THE TEMPLE OF ZEUS IS CLEANSED', {
      fontSize: '24px', color: '#f5d77f', fontStyle: 'bold',
      shadow: { blur: 16, color: '#c5a059', fill: true },
    }).setOrigin(0.5);

    // The brief asks for a useful run summary. Every number was already being
    // recorded by ProgressionSystem; this screen simply never showed any of it,
    // so a finished run told the player nothing about how it had gone. Each
    // figure below comes from runSummary(), so it traces back to a real event
    // rather than being a flourish.
    const summary = this.buildSummary();

    // A framed ledger: a run report should look like a record, not a column of
    // floating labels.
    const panelW = 440;
    const panelH = 32 + summary.rows.length * 22;
    const panelX = width / 2 - panelW / 2;
    const panelY = height / 2 - 44;
    this.add.rectangle(panelX + panelW / 2, panelY + panelH / 2, panelW, panelH, 0x0d1220, 0.86)
      .setStrokeStyle(1, 0x3d4a63, 0.85);
    this.add.rectangle(panelX + panelW / 2, panelY + 15, panelW - 2, 28, 0x1a2338, 0.92);
    this.add.text(panelX + panelW / 2, panelY + 15, 'RUN LEDGER', {
      fontSize: '13px', color: '#c5a059', fontStyle: 'bold',
    }).setOrigin(0.5);

    summary.rows.forEach((row, i) => {
      const y = panelY + 42 + i * 22;
      this.add.text(panelX + 22, y, row.label, {
        fontSize: '12px', color: '#93a4bd',
      }).setOrigin(0, 0.5);
      this.add.text(panelX + panelW - 22, y, row.value, {
        fontSize: '13px', color: row.emphasis ? '#f5d77f' : '#e8edf6', fontStyle: 'bold',
      }).setOrigin(1, 0.5);
      // A hairline between rows, so the ledger reads as a ledger.
      if (i < summary.rows.length - 1) {
        this.add.rectangle(panelX + panelW / 2, y + 11, panelW - 44, 1, 0x2a3450, 0.6);
      }
    });

    // Butonlar
    createGlassButton(this, width / 2, panelY + panelH + 30, 260, 40, 'Enter the Endless Pantheon', () => {
      this.game.scene.stop('VictoryScene');
      this.game.scene.start('GameScene', { chapterIndex: LEVELS.length - 1, isEndless: true });
    });

    createGlassButton(this, width / 2, panelY + panelH + 80, 260, 40, 'Main menu', () => {
      this.game.scene.stop('VictoryScene');
      this.game.scene.start('MenuScene');
    });
  }

  /**
   * Pull the summary from the live progression system. If it is not reachable
   * (the scene was started directly, or a save load failed) the screen still
   * renders, with the figures marked unavailable rather than invented.
   */
  buildSummary() {
    const scene = this.scene.get('GameScene');
    const progression = scene?.progression || this.registry.get('progression') || null;
    const s = progression?.runSummary?.() || null;

    const chapterTotal = LEVELS.filter((l) => !l.isEndless).length;
    if (!s) return { rows: [{ label: 'Run statistics', value: 'unavailable' }] };

    return {
      rows: [
        { label: 'Chapters cleared', value: `${s.chaptersCleared} of ${chapterTotal}`, emphasis: true },
        { label: 'Enemies defeated', value: String(s.enemiesKilled) },
        { label: 'Bosses felled', value: String(s.bossesDefeated) },
        { label: 'Levels gained this run', value: `+${s.levelsGained} (now ${s.levelNow})` },
        { label: 'Denarii earned', value: String(s.denariiEarned) },
        { label: 'XP earned', value: String(s.xpEarned) },
        { label: 'Denarii unspent', value: String(s.denariiLeft) }
      ]
    };
  }
}

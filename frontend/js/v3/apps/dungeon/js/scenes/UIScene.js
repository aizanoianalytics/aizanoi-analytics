// js/scenes/UIScene.js
// Dark-glass HUD: HP, objective, LoL-style bar, live minimap

import { drawStatBar } from '../utils/ui-helpers.js';
import { audioManager } from '../systems/AudioManager.js';
import { loadSettings } from '../systems/SettingsSystem.js';
import { uiScale, contrastBoost } from '../systems/AccessibilitySystem.js';

export class UIScene extends Phaser.Scene {
  constructor() {
    super({ key: 'UIScene' });
  }

  init(data) {
    this.gameScene = data.gameScene;
  }

  /**
   * The text helpers, on the instance rather than inside create().
   *
   * The HUD is built by more than one method, and scoping these to create()
   * meant createAbilityBar() drew its labels with a bare number and threw
   * "px is not defined" the moment the scene came up.
   */
  textStyle() {
    const scale = uiScale();
    const hi = contrastBoost();
    // A 9px label in a 640px-tall canvas is not readable, and section 22 asks
    // for no tiny text on mobile. The floor is 11px always, and 13px with the
    // contrast option on: a HUD you have to squint at is not a HUD.
    // Phaser renders text at whatever size it is handed, so every label has to
    // go through this rather than carrying a fixed pixel size of its own.
    return {
      px: (n) => `${Math.round(n * scale)}px`,
      readable: (n) => Math.max(n, hi ? 13 : 11),
      // The contrast option lifts the dimmest label colours to one that reads on
      // a dim screen, so the option changes actual pixels.
      ink: (normal) => (hi ? '#f8fafc' : normal)
    };
  }

  create() {
    const { px, readable, ink } = this.textStyle();
    const { width, height } = this.cameras.main;
    const glass = 0x0f1624;

    this.add.rectangle(128, 44, 236, 72, glass, 0.82).setStrokeStyle(1, 0xc5a059);
    this.add.sprite(36, 42, 'aizo', 0).setScale(1.35);
    this.levelBadge = this.add.text(36, 64, 'Lv.1', {
      fontSize: px(readable(10)), color: '#f5d77f', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.hpGraphics = this.add.graphics();
    this.xpGraphics = this.add.graphics();
    // Authored bar skins sit under the live fills. The graphics remain the
    // dynamic layer so fractional health/xp still renders accurately.
    this.add.image(153, 40, 'health-bar').setDisplaySize(158, 19).setAlpha(0.9);
    this.add.image(153, 64, 'spark-bar').setDisplaySize(158, 15).setAlpha(0.9);
    this.hpText = this.add.text(74, 22, 'HP: 120/120', { fontSize: px(readable(11)), color: '#e8eef8', fontStyle: 'bold' });
    this.xpText = this.add.text(74, 46, 'SPARK: 0/50', { fontSize: px(readable(10)), color: '#b7c0d0', fontStyle: 'bold' });

    this.chapterText = this.add.text(width / 2, 18, '', {
      fontSize: px(readable(13)), color: '#f5d77f', fontStyle: 'bold',
      backgroundColor: '#0f1624cc', padding: { x: 12, y: 5 },
    }).setOrigin(0.5);

    this.objectiveText = this.add.text(width / 2, 42, '', {
      fontSize: px(readable(11)), color: ink('#d1d5db'),
      backgroundColor: '#0f1624aa', padding: { x: 10, y: 3 },
    }).setOrigin(0.5);

    // Boss health bar. The name plate, the bar, the frame and the current phase
    // pips are all created once here and simply hidden when no boss is alive —
    // creating and destroying them mid-fight would cost a texture alloc every
    // transition. The phase pips exist because a chapter 10 boss has three
    // phases and the player has to see how far it has escalated.
    const bossY = 76;
    this.bossBarY = bossY;
    this.bossFrame = this.add.rectangle(width / 2, bossY, 260, 22, 0x0b1220, 0.9)
      .setStrokeStyle(1.5, 0xc5a059).setVisible(false);
    this.bossBarGfx = this.add.graphics().setVisible(false);
    this.bossNameText = this.add.text(width / 2 - 126, bossY - 13, '', {
      fontSize: px(readable(11)), color: '#f5d77f', fontStyle: 'bold',
      backgroundColor: '#0f1624cc', padding: { x: 8, y: 2 },
    }).setOrigin(0, 0.5).setVisible(false);
    this.bossPhasePips = [];
    for (let i = 0; i < 3; i++) {
      this.bossPhasePips.push(this.add.circle(width / 2 + 126 - 12 - i * 14, bossY, 3.5, 0x5a3a48)
        .setVisible(false));
    }

    this.add.rectangle(width - 118, 28, 150, 36, glass, 0.82).setStrokeStyle(1, 0xc5a059);
    this.add.image(width - 178, 28, 'coin-icon').setScale(1.2);
    this.goldText = this.add.text(width - 160, 20, '0', { fontSize: px(readable(14)), color: '#f5d77f', fontStyle: 'bold' });

    const soundBox = this.add.rectangle(width - 28, 28, 32, 32, glass, 0.82)
      .setStrokeStyle(1, 0xc5a059).setInteractive({ useHandCursor: true });
    this.soundIcon = this.add.text(width - 28, 28, audioManager.isMuted ? '🔇' : '🔊', { fontSize: px(readable(14)) }).setOrigin(0.5);
    soundBox.on('pointerdown', () => {
      this.soundIcon.setText(audioManager.toggleMute() ? '🔇' : '🔊');
    });

    this.createAbilityBar();

    this.minimapEnabled = loadSettings().showMinimap !== false;
    this.minimapContainer = this.add.container(width - 68, height - 68).setVisible(this.minimapEnabled);
    // Phaser display-list order: children added later are drawn ON TOP of
    // earlier siblings. The dark rectangle background must be appended first
    // so the dot graphics for player/enemies/portal/base render above it and
    // remain visible; the MAP label goes last so it never gets occluded by a
    // nearby dot. Earlier this was [gfx, bg, hint] which made the background
    // cover every dot.
    this.minimapBg = this.add.rectangle(0, 0, 112, 112, 0x0b1220, 0.88).setStrokeStyle(1.5, 0xc5a059);
    this.minimapGfx = this.add.graphics();
    this.minimapHint = this.add.text(0, -60, 'MAP', {
      fontSize: px(readable(9)), color: ink('#9aa8be'),
    }).setOrigin(0.5);
    this.minimapContainer.add([this.minimapBg, this.minimapGfx, this.minimapHint]);

    this.hintText = this.add.text(width / 2, height - 78, '', {
      fontSize: px(readable(11)), color: '#f8fafc',
      backgroundColor: '#141822cc', padding: { x: 8, y: 3 },
    }).setOrigin(0.5);
  }

  createAbilityBar() {
    const { px, readable, ink } = this.textStyle();
    const cx = this.cameras.main.width / 2;
    const cy = this.cameras.main.height - 34;
    this.abilitySlots = {};
    const defs = [
      { key: 'q', label: 'Q', x: cx - 104, name: 'Beam' },
      { key: 'r', label: 'R', x: cx - 52, name: 'Aegis' },
      { key: 'b', label: 'B', x: cx + 0, name: 'Recall' },
      { key: 'e', label: 'E', x: cx + 52, name: 'Shop' },
      // Dash sits on its own at the far edge. It is the only slot that is not a
      // cooldown-fed spell, so it is deliberately given a distinct colour (the
      // i-frame blue) instead of the shared gold the spells use.
      // "SHFT" rather than the ⇧ glyph: the retro pixel font does not carry the
      // arrow-symbol codepoints, and it rendered as a missing-glyph box.
      { key: 'dash', testKey: 'shift', label: 'SHFT', x: cx + 104, name: 'Dash', accent: 0x7dd3fc },
    ];
    defs.forEach((def) => {
      const box = this.add.image(def.x, cy, 'slot-empty').setDisplaySize(46, 46);
      box.setInteractive({ useHandCursor: true });
      box.on('pointerdown', () => {
        box.setTexture('slot-filled');
        this.time.delayedCall(90, () => { if (box.active) box.setTexture('slot-empty'); });
      });
      this.add.text(def.x, cy - 10, def.label, { fontSize: px(readable(12)), color: '#f5d77f', fontStyle: 'bold' }).setOrigin(0.5);
      const name = this.add.text(def.x, cy + 3, def.name.toUpperCase(), { fontSize: px(readable(6)), color: '#d7deea', fontStyle: 'bold' }).setOrigin(0.5);
      const cd = this.add.text(def.x, cy + 16, 'RDY', { fontSize: px(readable(8)), color: '#3dcea8', fontStyle: 'bold' }).setOrigin(0.5);
      this.abilitySlots[def.key] = { box, name, cd, accent: def.accent };
    });
  }

  setSlot(key, ready, seconds) {
    const slot = this.abilitySlots[key];
    if (!slot) return;
    // A slot may declare its own accent (the dash slot does). When it cools
    // down it desaturates to the shared "not ready" colour, so the accent is
    // only ever the ready-state signal.
    const accent = slot.accent ?? 0xc5a059;
    if (ready) {
      slot.cd.setText('RDY').setColor('#3dcea8');
      slot.box.setTint(accent);
    } else {
      slot.cd.setText(`${seconds}s`).setColor('#f07186');
      slot.box.setTint(0x5a3a48);
    }
  }

  update() {
    if (!this.gameScene || !this.gameScene.player) return;
    const gs = this.gameScene;
    const player = gs.player;
    const prog = gs.progression;
    const { width, height } = this.cameras.main;

    const hpColor = player.hp / player.maxHp <= 0.25 ? 0xe74c3c : 0x27ae60;
    drawStatBar(this.hpGraphics, 74, 34, 158, 13, player.hp, player.maxHp, hpColor);
    drawStatBar(this.xpGraphics, 74, 60, 158, 9, prog.currentXp, prog.nextXp, 0xa569bd);
    this.hpText.setText(`HP: ${Math.max(0, Math.round(player.hp))}/${player.maxHp}`);
    this.xpText.setText(`SPARK: ${prog.currentXp}/${prog.nextXp}`);
    this.levelBadge.setText(`Lv.${prog.level}`);
    this.goldText.setText(`${prog.gold}`);

    const chapterName = gs.isEndless
      ? `Endless Pantheon — Wave ${gs.endlessWave}`
      : gs.currentLevelConfig.name;
    this.chapterText.setText(chapterName);

    // A Phaser Group stores its members in a Set, not an array. Array.isArray on
    // it was never true, so `remaining` was always 0 and the objective line read
    // "portal open" from the first frame of every floor -- including a floor with
    // enemies still standing on it.
    const list = gs.enemies?.getChildren?.() || [];
    const remaining = list.filter((e) => e.active && e.hp > 0).length;
    const ready = remaining === 0;
    this.objectiveText.setText(ready ? 'Portal open — walk in' : `Clear the floor · ${remaining} left`);
    this.objectiveText.setColor(ready ? '#3dcea8' : '#d1d5db');

    this.setSlot('q', player.skill1Cooldown <= 0, Math.ceil((player.skill1Cooldown || 0) / 1000));
    this.setSlot('r', player.skill2Cooldown <= 0, Math.ceil((player.skill2Cooldown || 0) / 1000));
    this.setSlot('b', !(gs.recallChannel > 0), Math.ceil((gs.recallChannel || 0) / 1000));
    this.setSlot('e', Boolean(player.isInBase), player.isInBase ? 0 : 1);
    // Dash cooldown, in tenths so the split-second windows after a dodge are
    // readable instead of rounding to "1s" for most of the gap.
    this.setSlot('dash', (player.dashCooldown || 0) <= 0, Math.ceil((player.dashCooldown || 0) / 100) / 10);
    if (player.isInBase) this.abilitySlots.e.cd.setText('OPEN').setColor('#3dcea8');
    else this.abilitySlots.e.cd.setText('BASE').setColor('#9aa8be');

    this.hintText.setText(player.isInBase ? 'E Shop   I Relics   P Pause' : 'SHIFT Dash');

    // Boss bar: pick the alive boss, or hide the whole group. Drawing into one
    // graphics object (rather than a scaled rectangle) keeps the bar's inner
    // fill from stretching its border as it drains.
    const boss = (gs.enemies?.getChildren?.() || []).find((e) => e.active && e.hp > 0 && e.isBoss);
    if (!boss) {
      this.bossFrame.setVisible(false);
      this.bossBarGfx.setVisible(false).clear();
      this.bossNameText.setVisible(false);
      this.bossPhasePips.forEach((p) => p.setVisible(false));
      this.bossRef = null;
    } else {
      if (this.bossRef !== boss) {
        // A new boss (or the same one respawned) resets the name plate. The
        // pips are resized per boss so a two-phase mini-boss shows two, not three.
        this.bossRef = boss;
        this.bossNameText.setText(boss.name ?? 'Boss');
        const maxPhases = boss.type?.isFinalBoss ? 3 : 2;
        this.bossPhasePips.forEach((p, i) => p.setVisible(i < maxPhases));
        this.bossFrame.setVisible(true);
        this.bossNameText.setVisible(true);
      }
      this.bossBarGfx.setVisible(true);
      const w = 254;
      const h = 12;
      const ratio = Phaser.Math.Clamp(boss.hp / boss.maxHp, 0, 1);
      // Colour escalates with the phase so the last third reads as alarming.
      const phase = boss.encounter?.phase ?? 0;
      const fill = phase >= 2 ? 0xe74c3c : phase === 1 ? 0xf39c12 : 0x9b59b6;
      const barY = this.bossBarY;
      this.bossBarGfx.clear();
      this.bossBarGfx.fillStyle(0x241a26, 1);
      this.bossBarGfx.fillRect(width / 2 - w / 2, barY - h / 2, w, h);
      this.bossBarGfx.fillStyle(fill, 1);
      this.bossBarGfx.fillRect(width / 2 - w / 2, barY - h / 2, w * ratio, h);
      this.bossPhasePips.forEach((p, i) => p.setFillStyle(i <= phase ? 0xf5d77f : 0x5a3a48));
    }

    if (!this.minimapEnabled) return;
    this.minimapGfx.clear();
    if (!gs.mapData) return;
    const mapW = gs.mapData.width * 32;
    const mapH = gs.mapData.height * 32;
    const ox = -50;
    const oy = -50;
    const scaleX = 100 / mapW;
    const scaleY = 100 / mapH;
    const plot = (x, y, color, r = 2) => {
      this.minimapGfx.fillStyle(color, 1);
      this.minimapGfx.fillCircle(ox + x * scaleX, oy + y * scaleY, r);
    };
    plot(gs.baseAltar?.x || 0, gs.baseAltar?.y || 0, 0xf5d77f, 3);
    plot(gs.exitPortal?.x || 0, gs.exitPortal?.y || 0, ready ? 0x00d2ff : 0x64748b, 3);
    for (const enemy of gs.enemies?.getChildren?.() || []) {
      if (enemy.active && enemy.hp > 0) {
        plot(enemy.x, enemy.y, enemy.isBoss ? 0xf39c12 : 0xe74c3c, enemy.isBoss ? 3 : 1.6);
      }
    }
    plot(player.x, player.y, 0x7ea0ff, 3);
  }
}

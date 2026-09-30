// js/scenes/OptionsScene.js
// Section 22: "volume control" and "keyboard accessibility for menus".
//
// The Dungeon already read four settings and there was no way to change any of
// them: no options screen existed at all. This is that screen, and it is fully
// keyboard operable -- every row is reachable with the arrow keys, Space and
// Enter toggle or adjust it, and Escape goes back. That is not extra polish, it
// is the only way a keyboard-only player can reach these settings.

import { audioManager } from '../systems/AudioManager.js';
import {
  loadAccessibilitySettings,
  saveAccessibilitySettings,
  reducedMotionActive,
  contrastBoost,
  uiScale,
} from '../systems/AccessibilitySystem.js';

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

export class OptionsScene extends Phaser.Scene {
  constructor() {
    super({ key: 'OptionsScene' });
  }

  init(data) {
    this.returnTo = data?.from || 'MenuScene';
  }

  /**
   * The text helpers. Phaser renders text at whatever size it is handed, so every
   * label goes through here: a fixed pixel size in a preference-driven screen is a
   * preference that changes the stored number and nothing else.
   */
  textStyle() {
    const scale = uiScale();
    const hi = contrastBoost();
    return {
      px: (n) => `${Math.round(n * scale)}px`,
      // A 9px label is not readable; section 22 asks for no tiny text on mobile.
      readable: (n) => Math.max(n, hi ? 13 : 11),
      ink: (normal) => (hi ? '#f8fafc' : normal)
    };
  }

  create() {
    const { width, height } = this.cameras.main;
    if (typeof window !== 'undefined') window.__AIZANOI_DUNGEON_SCENE = 'OptionsScene';

    audioManager.ensureContext();

    this.add.rectangle(width / 2, height / 2, width, height, 0x0f141f);
    for (let x = 0; x < width; x += 64) {
      this.add.image(x, height / 2, 'tiles-floor', 0).setAlpha(0.14).setScale(2);
    }

    // Readable contrast: the section title and the row labels are the two
    // things a low-vision player has to be able to read, so they are the two
    // things the contrast preference changes.
    const boost = contrastBoost();
    const titleColour = boost ? '#ffffff' : '#f5d77f';
    const labelColour = boost ? '#f8fafc' : '#cbd5e1';
    const scale = uiScale();

    this.add.text(width / 2, 58, 'OPTIONS', {
      fontSize: `${Math.round(30 * scale)}px`,
      color: titleColour,
      fontStyle: 'bold',
      fontFamily: FONT,
    }).setOrigin(0.5);

    this.add.text(width / 2, 88, 'Arrow keys to move  •  Space or Enter to change  •  Esc to go back', {
      fontSize: `${Math.round(13 * scale)}px`,
      color: labelColour,
      fontFamily: FONT,
    }).setOrigin(0.5);

    const s = loadAccessibilitySettings();

    // Each row is a toggle or a stepper. A stepper rather than a drag slider,
    // because a drag target cannot be operated from a keyboard and this screen
    // has to be usable without a mouse.
    this.rows = [
      {
        key: 'reducedShake',
        label: 'Reduced screen shake',
        kind: 'toggle',
        read: () => loadAccessibilitySettings().reducedShake,
        note: () => (reducedMotionActive() && !loadAccessibilitySettings().reducedShake
          ? 'on (your system asks for reduced motion)' : '')
      },
      {
        key: 'nonAudioTelegraphs',
        label: 'Non-audio telegraphs',
        kind: 'toggle',
        read: () => loadAccessibilitySettings().nonAudioTelegraphs,
        note: () => 'shows a mark above a winding-up boss'
      },
      {
        key: 'highContrast',
        label: 'Readable contrast',
        kind: 'toggle',
        read: () => loadAccessibilitySettings().highContrast,
        note: () => ''
      },
      {
        key: 'uiScale',
        label: 'Text size',
        kind: 'step',
        steps: [0.85, 1, 1.25, 1.5, 2],
        read: () => uiScale(),
        render: (v) => `${Math.round(v * 100)}%`,
        note: () => ''
      },
      {
        key: 'masterVolume',
        label: 'Volume',
        kind: 'step',
        steps: [0, 0.25, 0.5, 0.75, 1],
        read: () => audioManager.getVolume(),
        render: (v) => (v === 0 ? 'muted' : `${Math.round(v * 100)}%`),
        note: () => ''
      },
    ];

    const top = 140;
    const rowH = Math.max(46, Math.round(52 * scale));
    this.cursor = 0;

    this.rows.forEach((row, i) => {
      const y = top + i * rowH;
      const plate = this.add
        .rectangle(width / 2, y, Math.min(width - 80, 520), rowH - 10, 0x1e293b, 0.72)
        .setStrokeStyle(1, 0xc5a059, 0.5);
      const label = this.add.text(
        width / 2 - Math.min(width - 80, 520) / 2 + 18, y, row.label,
        { fontSize: `${Math.round(16 * scale)}px`, color: labelColour, fontFamily: FONT }
      ).setOrigin(0, 0.5);
      const value = this.add.text(
        width / 2 + Math.min(width - 80, 520) / 2 - 18, y, '',
        { fontSize: `${Math.round(16 * scale)}px`, color: titleColour, fontFamily: FONT, fontStyle: 'bold' }
      ).setOrigin(1, 0.5);
      const note = this.add.text(
        width / 2, y + 17, '',
        { fontSize: `${Math.round(11 * scale)}px`, color: labelColour, fontFamily: FONT }
      ).setOrigin(0.5, 0);
      row.plate = plate;
      row.valueText = value;
      row.noteText = note;
      this.registerLabel(label, value, note, 16, labelColour);
      // A generous invisible hit area, so the row is a real target on a phone
      // rather than only the text being tappable.
      const hit = this.add.zone(width / 2, y, Math.min(width - 80, 520), rowH - 10)
        .setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => { this.cursor = i; this.activate(i); });
    });

    this.add.text(width / 2, height - 46, 'Esc — back', {
      fontSize: `${Math.round(14 * scale)}px`,
      color: labelColour,
      fontFamily: FONT,
    }).setOrigin(0.5).setName('hint');

    // The keys are created once. addKey() inside the update loop allocated a new
    // key object every frame, which both leaks and loses the pressed state the
    // JustDown check depends on.
    this.k = {
      up: this.input.keyboard.addKey('UP'),
      down: this.input.keyboard.addKey('DOWN'),
      space: this.input.keyboard.addKey('SPACE'),
      enter: this.input.keyboard.addKey('ENTER'),
      esc: this.input.keyboard.addKey('ESC'),
      w: this.input.keyboard.addKey('W'),
      s: this.input.keyboard.addKey('S')
    };
    this._held = false;

    this.render();
    this.refreshTitle();
  }

  refreshTitle() {
    // The contrast preference has to be visible in this scene, not only in the
    // dungeon, or a player has no way to tell whether the toggle worked.
    const s = loadAccessibilitySettings();
    this.children.list
      .filter((o) => o.type === 'Text')
      .forEach((t) => {
        if (t.text === 'OPTIONS') t.setColor(s.highContrast ? '#ffffff' : '#f5d77f');
      });
  }

  update() {
    // Phaser's own update runs after the keyboard plugin has consumed this
    // frame's events, so JustDown is current here. Reading it from a scene
    // 'update' listener is a frame behind and silently drops a fast tap: the
    // first version of this screen moved the cursor but Space did nothing.
    const k = this.k;
    const step = (delta) => {
      if (this._held) return;
      this.cursor = (this.cursor + delta + this.rows.length) % this.rows.length;
      this._held = true;
      this.render();
    };
    if (k.down.isDown || k.s.isDown) step(1);
    else if (k.up.isDown || k.w.isDown) step(-1);
    else this._held = false;

    if (Phaser.Input.Keyboard.JustDown(k.space) || Phaser.Input.Keyboard.JustDown(k.enter)) {
      this.activate(this.cursor);
    }
    if (Phaser.Input.Keyboard.JustDown(k.esc)) this.goBack();
  }

  activate(i) {
    const row = this.rows[i];
    if (row.kind === 'toggle') {
      saveAccessibilitySettings({ [row.key]: !row.read() });
    } else {
      const cur = row.read();
      const idx = row.steps.findIndex((v) => Math.abs(v - cur) < 0.001);
      const next = row.steps[(Math.max(0, idx) + 1) % row.steps.length];
      saveAccessibilitySettings({ [row.key]: next });
      if (row.key === 'masterVolume') audioManager.setVolume(next);
    }
    this.render();
    this.refreshTitle();
  }

  render() {
    // Re-read the scale every time: the text-size row changes it, and a screen
    // that offers a text-size control but keeps drawing at the old size is a
    // control that does nothing. This is the same thing the dungeon HUD does,
    // through the same helper, so the two cannot drift apart.
    const { px, readable, ink } = this.textStyle();
    this.rows.forEach((row, i) => {
      const focused = i === this.cursor;
      row.plate.setFillStyle(focused ? 0x334155 : 0x1e293b, focused ? 0.95 : 0.72);
      row.plate.setStrokeStyle(focused ? 2 : 1, focused ? 0xf5d77f : 0xc5a059, focused ? 1 : 0.5);
      const v = row.read();
      row.valueText.setText(row.kind === 'toggle' ? (v ? 'ON' : 'OFF') : row.render(v));
      row.noteText.setText(row.note() || '');
    });
    for (const t of this._labels || []) {
      t.label.setFontSize(px(readable(t.base)));
      t.value.setFontSize(px(readable(t.base)));
      if (t.note) {
        t.note.setFontSize(px(readable(9)));
        t.note.setColor(ink(t.baseColor));
      }
    }
  }

  /** The text objects, registered so render() can restyle them on a scale change. */
  registerLabel(label, value, note, base, baseColor) {
    const { px, readable, ink } = this.textStyle();
    label.setFontSize(px(readable(base)));
    value.setFontSize(px(readable(base)));
    if (note) {
      note.setFontSize(px(readable(9)));
      note.setColor(ink(baseColor));
    }
    (this._labels ||= []).push({ label, value, note, base, baseColor });
  }

  goBack() {
    this.scene.start(this.returnTo);
  }
}

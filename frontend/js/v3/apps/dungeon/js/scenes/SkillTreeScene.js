// js/scenes/SkillTreeScene.js
// Aizo'nun Kutsal Yetenek Ağacı Overlay Sahnesi

import { createGlassButton } from '../utils/ui-helpers.js';
import { SKILL_TREE } from '../data/skills.js';

export class SkillTreeScene extends Phaser.Scene {
  constructor() {
    super({ key: 'SkillTreeScene' });
  }

  create() {
    const { width, height } = this.cameras.main;
    this.gameScene = this.scene.get('GameScene');
    if (this.gameScene) this.gameScene.scene.pause();

    // Panel
    const panel = this.add.rectangle(width / 2, height / 2, 620, 440, 0xffffff, 0.94)
      .setStrokeStyle(3, 0xc5a059);

    this.add.text(width / 2, height / 2 - 190, '⚡ AIZO\'NUN KUTSAL YETENEK AĞACI', {
      fontSize: '18px', color: '#1e293b', fontStyle: 'bold',
    }).setOrigin(0.5);

    createGlassButton(this, width / 2 + 250, height / 2 - 190, 60, 28, '✕ Kapat', () => {
      if (this.gameScene) this.gameScene.scene.resume();
      this.scene.stop();
    });

    const branches = [SKILL_TREE.offense, SKILL_TREE.defense, SKILL_TREE.utility];
    const colWidth = 190;
    const startX = width / 2 - colWidth;

    branches.forEach((branch, colIdx) => {
      const bx = startX + colIdx * colWidth;

      // Başlık
      this.add.text(bx, height / 2 - 150, `${branch.icon} ${branch.name.split(' ')[0]}`, {
        fontSize: '14px', color: branch.color, fontStyle: 'bold',
      }).setOrigin(0.5);

      branch.skills.forEach((skill, sIdx) => {
        const sy = height / 2 - 100 + sIdx * 54;
        const isUnlocked = this.gameScene.progression.unlockedSkills.has(skill.id);
        const prereqMet = !skill.prerequisite || this.gameScene.progression.unlockedSkills.has(skill.prerequisite);
        const canUnlock = (this.gameScene.progression.level >= skill.requiredLevel) && prereqMet;

        const box = this.add.rectangle(bx, sy, 175, 46, isUnlocked ? 0xdcfce7 : (canUnlock ? 0xfef9c3 : 0xf1f5f9), 0.9)
          .setStrokeStyle(1.5, isUnlocked ? 0x22c55e : (canUnlock ? 0xd4ac0d : 0x94a3b8));

        this.add.text(bx - 75, sy - 12, `${skill.iconSymbol} ${skill.name}`, {
          fontSize: '11px', color: '#1e293b', fontStyle: 'bold',
        });
        this.add.text(bx - 75, sy + 4, `Lv.${skill.requiredLevel} · ${isUnlocked ? 'AÇIK' : 'AÇ'}`, {
          fontSize: '10px', color: isUnlocked ? '#15803d' : '#64748b',
        });

        if (!isUnlocked && canUnlock) {
          box.setInteractive({ useHandCursor: true });
          box.on('pointerdown', () => {
            this.gameScene.progression.unlockedSkills.add(skill.id);
            this.gameScene.progression.save();
            this.scene.restart();
          });
        }
      });
    });
  }
}

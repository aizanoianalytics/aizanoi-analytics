// js/entities/Enemy.js
// Antik Aizanoi Düşman Taban Sınıfı

import { CombatSystem } from '../systems/CombatSystem.js';
import { applyEliteAffix, ELITE_AFFIXES } from '../data/elite-affixes.js';
import { audioManager } from '../systems/AudioManager.js';
import { shakeCamera, nonAudioTelegraphsActive } from '../systems/AccessibilitySystem.js';

const ELITE_COLORS = Object.fromEntries((ELITE_AFFIXES || []).map((a) => [a.id, a.color]));

// An acolyte may only keep this many summons on the field at once. Without a
// cap a single summoner in a very_high chapter can add enemies faster than the
// player kills them and the floor never clears.
const MAX_SUMMONS_PER_CASTER = 3;

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, typeConfig) {
    const isBoss = typeConfig.isMiniBoss || typeConfig.isFinalBoss;
    // A roster entry may point at its own sheet (`spriteSheet`) for the later
    // archetypes; anything else falls back to the shared 'enemies' sheet, so a
    // new enemy never silently renders as a frame from the wrong sheet.
    const texture = isBoss ? 'bosses' : (typeConfig.spriteSheet || 'enemies');
    const initialFrame = isBoss ? (typeConfig.isFinalBoss ? 1 : 0) : ((typeConfig.spriteRow ?? 0) * 8 || 0);

    super(scene, x, y, texture, initialFrame);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.type = typeConfig;
    this.name = typeConfig.name;
    this.hp = typeConfig.hp;
    this.maxHp = typeConfig.hp;
    this.attackDamage = typeConfig.attackDamage;
    this.attackSpeed = typeConfig.attackSpeed;
    this.attackRange = typeConfig.attackRange;
    this.moveSpeed = typeConfig.moveSpeed;
    this.armor = typeConfig.armor;
    this.xpReward = typeConfig.xpReward;
    this.goldReward = typeConfig.goldReward;
    this.behavior = typeConfig.behavior;
    this.aggroRange = typeConfig.aggroRange;
    this.isBoss = isBoss;
    // A summon (not a level placement) pays no loot and is flagged so death
    // handling can tell it apart from a room spawn.
    this.isSummon = Boolean(typeConfig.isSummon);
    this.eliteAffix = isBoss ? null : typeConfig.eliteAffix;
    const eliteStats = applyEliteAffix({ moveSpeed: this.moveSpeed, armor: this.armor }, this.eliteAffix);
    this.moveSpeed = eliteStats.moveSpeed;
    this.armor = eliteStats.armor;
    this.vampiricRate = eliteStats.vampiricRate || 0;
    this.volatileDamage = eliteStats.volatileDamage || 0;
    this.stormInterval = eliteStats.stormInterval || 0;
    this.stormTimer = this.stormInterval;

    this.attackCooldown = 0;
    this.isDead = false;
    this.knockbackTimer = 0;

    // Boss vs regular collision body sizing
    if (typeConfig.isFinalBoss) {
      this.body.setSize(72, 80);
      this.body.setOffset(28, 24);
      this.setScale(1.0);
    } else if (typeConfig.isMiniBoss) {
      this.body.setSize(56, 60);
      this.body.setOffset(36, 34);
      this.setScale(0.9);
    } else {
      this.body.setSize(24, 24);
      this.body.setOffset(20, 20);
      // Siluet ayrışımı: her davranış 1 saniyede tanınsın
      if (typeConfig.behavior === 'stealth_ambush') this.setScale(0.85, 1.18); // ince-uzun wraith
      else if (typeConfig.behavior === 'melee_tank') this.setScale(1.18, 1.05); // iri centurion
      else if (typeConfig.behavior === 'shield_bash_charge') this.setScale(1.24, 1.08); // geniş praetorian
    }
    this.baseScaleX = this.scaleX;
    this.baseScaleY = this.scaleY;

    // Zemin gölgesi: karakteri zeminden koparır, derinlik hissi
    const shadowW = this.isBoss ? 64 : 26;
    this.shadow = null;
    try {
      if (typeof scene.add.ellipse === 'function') {
        this.shadow = scene.add.ellipse(x, y + (this.isBoss ? 40 : 14), shadowW, shadowW * 0.32, 0x000000, 0.35);
        this.shadow.setDepth(8);
      }
    } catch (_) { this.shadow = null; }

    // Readability rim: a low-alpha cool halo separates dark silhouettes from
    // slate walls without turning the enemy into a glowing billboard. It moves
    // with the sprite in update(), just like the existing contact shadow.
    this.readabilityRing = null;
    try {
      const ringColor = typeConfig.isFinalBoss ? 0xf0c878 : (typeConfig.behavior === 'ranged_kite' || typeConfig.behavior === 'ranged_aoe' ? 0x8fc6e8 : 0xc7b7d8);
      this.readabilityRing = scene.add.ellipse(x, y, this.isBoss ? 92 : 38, this.isBoss ? 92 : 38, ringColor, this.isBoss ? 0.12 : 0.10);
      this.readabilityRing.setDepth(8);
      this.readabilityRing.setBlendMode(Phaser.BlendModes.SCREEN);
    } catch (_) { this.readabilityRing = null; }

    // A sprite rim works at native pixel scale where a soft ellipse disappears
    // against a dark wall: the duplicate is one pixel larger and only its
    // exposed edge shows around the silhouette. The rim follows the frame so
    // an animating enemy keeps it, and it moves with the sprite below.
    this.readabilitySprite = null;
    try {
      const rimColor = typeConfig.isFinalBoss ? 0xffd67d : (typeConfig.behavior === 'ranged_kite' || typeConfig.behavior === 'ranged_aoe' ? 0x8fc6e8 : 0xbda6d5);
      this.readabilitySprite = scene.add.sprite(x, y, texture, initialFrame)
        .setScale(this.scaleX * 1.10, this.scaleY * 1.10)
        .setTint(rimColor)
        .setAlpha(this.isBoss ? 0.28 : 0.34)
        .setDepth(8.5)
        .setBlendMode(Phaser.BlendModes.ADD);
    } catch (_) { this.readabilitySprite = null; }

    // The permanent threat pip: a 3px bright key above every non-boss enemy.
    // A soft rim reads as character detail in a dark room; a hard key dot is
    // what actually answers "is that thing alive and hostile?" at speed.
    // It stays visible whether the enemy is inside or outside a light pool.
    this.threatPip = null;
    if (!typeConfig.isFinalBoss) {
      const pipColor = typeConfig.isMiniBoss ? 0xd88943 : 0xc33f3a;
      if (typeof scene.add.rectangle === 'function') {
        this.threatPip = scene.add.rectangle(x, y - (this.isBoss ? 46 : 20), 2, 2,
          pipColor, typeConfig.isMiniBoss ? 0.58 : 0.38);
        this.threatPip.setDepth(8.6);
        this.threatPip.setBlendMode(Phaser.BlendModes.ADD);
      } else {
        // Headless combat tests intentionally provide only the minimal display
        // stub; keep the gameplay object valid without weakening the browser
        // path, which always has Phaser's rectangle factory.
        this.threatPip = { active: false, setPosition() {}, destroy() {} };
      }
    }

    // Elit aurası: affix renginde nabız gibi atan hale — neyle karşılaştığın belli olsun
    this.eliteGlow = null;
    if (this.eliteAffix && ELITE_COLORS[this.eliteAffix] !== undefined) {
      try {
        this.eliteGlow = scene.add.ellipse(x, y, 44, 44, ELITE_COLORS[this.eliteAffix], 0.28);
        this.eliteGlow.setBlendMode(Phaser.BlendModes.ADD);
        this.eliteGlow.setDepth(8);
        scene.tweens.add({
          targets: this.eliteGlow,
          alpha: 0.12,
          scaleX: 1.25,
          scaleY: 1.25,
          duration: 600,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      } catch (_) { this.eliteGlow = null; }
    }

    this.setDepth(9);

    // Actors respond to the room's light. Placing the sprite on the Light2D
    // pipeline makes the brazier pools wash across the enemy the same way they
    // wash across the floor, so a gargoyle standing in torchlight looks like it
    // is IN the torchlight instead of pasted on top of it.
    //
    // The readability rim stays off the pipeline deliberately: it is a
    // gameplay-clarity element, not a material, and dimming it in unlit corners
    // would remove the very separation it exists to provide.
    if (typeof this.setPipeline === 'function' && scene.lights?.active) {
      try { this.setPipeline('Light2D'); } catch (_) {}
    }

    // Sağlık barı grafiği
    this.hpBar = scene.add.graphics();
    this.hpBar.setDepth(15);
    this.stats = { attackDamage: this.attackDamage, critChance: 0, armor: this.armor };
    this.isAmbushing = false;
    // Shield-bash charge state: windup -> charge -> recovery. Kept in one
    // object so the phase is readable in the update loop below.
    this.charge = { phase: 'idle', timer: 0, angle: 0, hit: false };
    // Generic telegraphed ground attack state, shared by the golem slam and the
    // acolyte's summon windup. Same shape as the charge: windup (dodge window)
    // -> active -> recovery.
    this.groundAttack = { phase: 'idle', timer: 0, radius: 0, damage: 0, hit: false };
    // Flanker orbit state. `until` is an absolute scene-clock deadline for the
    // current phase (orbit or lunge) so the pattern is frame-rate independent.
    this.orbit = { phase: 'idle', until: 0, dir: 1, angle: 0 };
    // Summoner bookkeeping. `nextSummonAt` lives on the scene clock (see
    // updateSummoner) rather than as a countdown, and `summons` is the live list
    // the cap is enforced against.
    this.nextSummonAt = undefined;
    this.summons = [];
    // Boss encounter state. The brief is explicit that a boss must not be "a
    // large stat block": it needs readable phases, telegraphed attacks, arena
    // progression and an escalation. Phases advance on health thresholds and
    // are the single source of truth for what the boss does next.
    this.encounter = {
      boss: isBoss,
      phase: 0,
      enraged: false,
      move: { phase: 'idle', timer: 0, angle: 0, hit: false },
      stormCooldown: 0,
      hazardCooldown: 0,
      // One-shot flags, so an intro or a threshold only fires once.
      announced: false,
      phaseFlash: 0
    };
  }

  // Phaser crashes when velocity is set on a body that has been destroyed
  // (an enemy killed by an overlapping physics overlap, a summon whose caster
  // died, or an update fired on the frame the scene tears down). Every
  // behaviour in this file calls setVelocity, so the guard lives here once
  // instead of at twenty call sites.
  setVelocity(x, y) {
    if (this.body && typeof this.body.setVelocity === 'function') {
      this.body.setVelocity(x, y);
    }
    return this;
  }

  update(time, delta, player) {
    if (this.isDead || !this.active || !player || player.isDead) {
      this.hpBar.clear();
      return;
    }

    // Gölge takibi
    if (this.shadow && this.shadow.active) {
      this.shadow.setPosition(this.x, this.y + (this.isBoss ? 40 : 14));
    }
    if (this.eliteGlow && this.eliteGlow.active) {
      this.eliteGlow.setPosition(this.x, this.y);
    }
    if (this.readabilityRing && this.readabilityRing.active) {
      this.readabilityRing.setPosition(this.x, this.y);
    }
    if (this.readabilitySprite && this.readabilitySprite.active) {
      this.readabilitySprite.setPosition(this.x, this.y);
      this.readabilitySprite.setFrame(this.frame.name);
    }
    if (this.threatPip && this.threatPip.active) {
      const pipY = this.y - (this.isBoss ? 46 : 20);
      this.threatPip.setPosition(this.x, pipY);
      // A restrained heartbeat gives the eye a living threat signal without
      // turning every enemy into a neon marker. Mini-bosses pulse slower and
      // brighter; normal enemies remain a quiet, steady key.
      if (this.type?.isMiniBoss) {
        const pulse = 0.48 + Math.sin(time * 0.006) * 0.18;
        this.threatPip.setAlpha(pulse);
      } else {
        this.threatPip.setAlpha(0.38);
      }
    }

    // Geri tepme: kisa sure hareket AI durur, itme velocity korunur
    if (this.knockbackTimer > 0) {
      this.knockbackTimer -= delta;
      this.drawHealthBar();
      return;
    }

    // Aizo gölgede gizlenmişse (Shadow Melding), aggro kesilir
    if (player.isStealthed) {
      this.setVelocity(0, 0);
      this.drawHealthBar();
      return;
    }

    this.drawHealthBar();

    if (this.attackCooldown > 0) {
      this.attackCooldown -= delta;
    }

    const dist = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);

    if (this.stormTimer > 0) this.stormTimer -= delta;
    if (this.stormInterval && dist <= this.aggroRange && this.stormTimer <= 0) {
      this.stormTimer = this.stormInterval;
      this.scene.fireEnemyProjectile(this, player, 'curse_orb', Math.max(1, Math.round(this.attackDamage * 0.65)), 'lightning');
    }

    // 1. Telegraph Warning for Boss Slam
    if (this.isBoss || this.type.isMiniBoss) {
      if (this.attackCooldown > 0 && this.attackCooldown <= 400) {
        this.setTint(0xff4444);
      } else {
        this.clearTint();
      }
    }

    // 2. Stealth Ambush behavior
    if (this.behavior === 'stealth_ambush') {
      if (dist > 80 && !this.isAmbushing) {
        this.setAlpha(0.25);
      } else {
        this.setAlpha(1.0);
        this.isAmbushing = true;
      }
    }

    // 3. Boss encounter phases run before the ordinary movement block, so a
    // boss never falls back to "walk at the player" during its own mechanics.
    if (this.updateEncounter(time, delta, dist, player)) {
      this.drawHealthBar();
      return;
    }

    // 4. Shield-bash charge: a committed, telegraphed rush. Unlike the plain
    // chasers, this one locks its heading during the windup, so sidestepping
    // it actually works and running in a straight line does not.
    if (this.behavior === 'shield_bash_charge' && this.updateCharge(time, delta, dist, player)) {
      this.drawHealthBar();
      return;
    }

    // 4b. Summoner: keeps its distance and raises a fresh gargoyle on a timer.
    // The summon is telegraphed, so the player is never surprised by a new
    // enemy appearing on top of them, and it is capped so a chain of them can
    // never outpace the player.
    if (this.behavior === 'summoner' && this.updateSummoner(time, delta, dist, player)) {
      this.drawHealthBar();
      return;
    }

    // 4c. Heavy slam: a slow, telegraphed ground attack with a readable ring.
    // A tank that only walks at the player is a bigger health bar, not a
    // different fight; this makes its space matter.
    if (this.behavior === 'armored_slam' && this.updateGroundSlam(time, delta, dist, player)) {
      this.drawHealthBar();
      return;
    }

    // 4d. Flanker: orbits at a fixed distance, then commits to a lunge. The
    // orbit is what makes it feel unlike the plain chasers.
    if (this.behavior === 'flank_circle' && this.updateFlanker(time, delta, dist, player)) {
      this.drawHealthBar();
      return;
    }

    // 5. Distance and Movement logic
    if (dist <= this.aggroRange) {
      // Ranged Kiter: Oyuncu çok yaklaşırsa (120px) geri çekil
      if (this.behavior === 'ranged_kite' && dist < 120) {
        const angle = Phaser.Math.Angle.Between(player.x, player.y, this.x, this.y);
        this.setVelocity(Math.cos(angle) * this.moveSpeed * 0.9, Math.sin(angle) * this.moveSpeed * 0.9);
      } else if (dist <= this.attackRange) {
        this.setVelocity(0, 0);
        if (this.attackCooldown <= 0) {
          this.executeAttack(player);
          this.attackCooldown = 1000 / this.attackSpeed;
        }
      } else {
        // Hedefe doğru yürü
        const angle = Phaser.Math.Angle.Between(this.x, this.y, player.x, player.y);
        this.setVelocity(Math.cos(angle) * this.moveSpeed, Math.sin(angle) * this.moveSpeed);
      }
    } else {
      this.setVelocity(0, 0);
    }
  }

  // ---- Boss encounters -------------------------------------------------
  // Section 18: a boss needs readable phases and mechanics, not a bigger hp
  // pool. Phases are health-gated so the escalation is visible: each one
  // changes what the boss does, and the transition is telegraphed.
  updateEncounter(time, delta, dist, player) {
    const e = this.encounter;
    if (!e.boss) return false;

    // Health-gated phases. The final boss has three, the mini boss two.
    const maxPhases = this.type.isFinalBoss ? 3 : 2;
    const thresholds = this.type.isFinalBoss ? [0.66, 0.33] : [0.5];
    let wanted = 0;
    for (const t of thresholds) {
      if (this.hp / this.maxHp <= t) wanted += 1;
    }
    if (wanted > e.phase && wanted < maxPhases) {
      e.phase = wanted;
      e.phaseFlash = 900;
      this.announcePhase(player);
    }

    if (this.type.isFinalBoss) {
      // Enrage: the last third is faster and hits harder, and it is announced
      // rather than silently changing the rules.
      const enragedNow = this.hp / this.maxHp <= 0.22;
      if (enragedNow && !e.enraged) {
        e.enraged = true;
        this.moveSpeed = Math.round(this.moveSpeed * 1.35);
        this.attackSpeed = Math.round(this.attackSpeed * 1.3 * 100) / 100;
        this.scene.createFloatingText(this.x, this.y - 74, 'ENRAGED', '#e74c3c', 26);
        shakeCamera(this.scene, 260, 0.009);
        this.scene.playSfx?.('sfx-boss-warning', 0.85);
      }
    }

    if (e.phaseFlash > 0) e.phaseFlash -= delta;

    // Section 22: non-audio telegraphs for critical cues. A player who is deaf,
    // in a noisy room, or playing with the sound off still has to be able to see
    // that the Colossus is winding up. The audio cue already existed; this is
    // the visual channel, and it is a shape above the boss rather than text
    // scrolled across it, so it stays readable at any UI scale.
    // The teardown has to be outside the preference check. Inside it, turning the
    // preference off meant this block was skipped entirely: the mark that was
    // already on screen stayed there, because nothing looked at it again. A
    // player who switches the setting off still saw the cue.
    const telegraphsWanted = nonAudioTelegraphsActive();
    const committed = e.move.phase === 'windup' || e.move.phase === 'charge';
    const want = telegraphsWanted && (committed || e.phaseFlash > 0 || e.enraged);
    if (want && !this.telegraphMark) {
      this.telegraphMark = this.scene.add
        .triangle(0, 0, 0, 22, 20, 0, 40, 22, 0xf39c12, 0.95)
        .setOrigin(0.5, 1)
        .setDepth((this.depth ?? 5) + 1)
        .setScrollFactor(0.35);
    } else if (!want && this.telegraphMark) {
      this.telegraphMark.destroy();
      this.telegraphMark = null;
    }
    if (this.telegraphMark) {
      this.telegraphMark.setPosition(this.x, this.y - 92);
      this.telegraphMark.setFillStyle(e.enraged ? 0xe74c3c : 0xf39c12, 0.95);
      // Pulse so the mark reads as urgency rather than decoration.
      const pulse = 0.75 + Math.sin(time / 120) * 0.25;
      this.telegraphMark.setScale(pulse, pulse);
    }

    if (this.type.isFinalBoss) {
      this.runFinalBossMoves(time, delta, dist, player);
    } else {
      this.runMiniBossMoves(time, delta, dist, player);
    }

    // A phase transition or an enrage is a free punish window: the boss stands
    // still so the escalation is an opportunity, not a difficulty spike the
    // player cannot answer.
    if (e.phaseFlash > 0) {
      this.setVelocity(0, 0);
      return true;
    }
    // CRITICAL: while a committed move is running, this method owns the boss's
    // velocity. Returning false here let the generic walk-towards-player block
    // overwrite it every single frame, so the charge was measured at walking
    // speed and never actually happened.
    return e.move.phase !== 'idle';
  }

  announcePhase(player) {
    const names = this.type.isFinalBoss
      ? ['The colossus wakes', 'The storm breaks', 'Final form']
      : ['The minotaur roars'];
    const label = names[Math.min(this.encounter.phase - 1, names.length - 1)];
    this.scene.createFloatingText(this.x, this.y - 70, label, '#f39c12', 22);
    shakeCamera(this.scene, 200, 0.006);
    this.scene.playSfx?.('sfx-boss-warning', 0.7);
  }

  // Marble Minotaur: a telegraphed charge plus a ground slam that hurts in a
  // radius, so the fight rewards spacing rather than trading hits.
  runMiniBossMoves(time, delta, dist, player) {
    const e = this.encounter;
    const m = e.move;

    if (m.phase === 'idle') {
      if (dist > 200 || dist <= this.attackRange * 1.3) return;
      m.phase = 'windup';
      m.timer = 700;
      m.angle = Phaser.Math.Angle.Between(this.x, this.y, player.x, player.y);
      m.hit = false;
      this.setTint(0xff8844);
      this.setVelocity(0, 0);
      return;
    }

    if (m.phase === 'windup') {
      m.timer -= delta;
      this.setTint(Math.sin(time / 80) > 0 ? 0xffcc44 : 0xff4411);
      this.setVelocity(0, 0);
      if (m.timer <= 0) {
        m.phase = 'charging';
        m.timer = 1100;
        this.clearTint();
      }
      return;
    }

    if (m.phase === 'charging') {
      m.timer -= delta;
      const speed = 380;
      this.setVelocity(Math.cos(m.angle) * speed, Math.sin(m.angle) * speed);
      if (!m.hit && dist <= this.attackRange + 14) {
        m.hit = true;
        CombatSystem.processAttack(this, player);
        this.scene.createDamageSpark(player.x, player.y);
      }
      if (m.timer <= 0 || this.body?.blocked?.left || this.body?.blocked?.right ||
          this.body?.blocked?.up || this.body?.blocked?.down) {
        m.phase = 'slam';
        m.timer = 0;
        this.setVelocity(0, 0);
        this.scene.spawnVolatileZone(this.x, this.y, 96, 12, 1600);
        shakeCamera(this.scene, 220, 0.012);
      }
      return;
    }

    if (m.phase === 'slam') {
      m.timer -= delta;
      if (m.timer <= 0) { m.phase = 'recovery'; m.timer = 800; }
      return;
    }

    m.timer -= delta;
    this.setAlpha(0.7);
    this.setVelocity(0, 0);
    if (m.timer <= 0) { m.phase = 'idle'; this.clearAlpha(); }
  }

  // Titan Colossus: a storm identity. It seeds lightning orbs around the
  // arena, keeps a permanent storm interval that intensifies with the phase,
  // and gains its heaviest attack in the final phase. It also commits to a
  // telegraphed ground pound, so the final boss closes distance instead of
  // being a stationary turret.
  runFinalBossMoves(time, delta, dist, player) {
    const e = this.encounter;
    const m = e.move;

    // Committed telegraphed rush, shared shape with the mini boss but slower
    // and heavier. Uses the same move object so the phase is observable.
    if (m.phase !== 'idle') {
      if (m.phase === 'windup') {
        m.timer -= delta;
        this.setTint(Math.sin(time / 90) > 0 ? 0xffe082 : 0x7c4dff);
        this.setVelocity(0, 0);
        if (m.timer <= 0) { m.phase = 'charging'; m.timer = 1300; this.clearTint(); }
        return;
      }
      if (m.phase === 'charging') {
        m.timer -= delta;
        const speed = e.enraged ? 460 : 340;
        this.setVelocity(Math.cos(m.angle) * speed, Math.sin(m.angle) * speed);
        if (!m.hit && dist <= this.attackRange + 18) {
          m.hit = true;
          CombatSystem.processAttack(this, player);
          this.scene.createDamageSpark(player.x, player.y);
          this.scene.createFloatingText(player.x, player.y - 30, 'CRUSHED', '#ba68c8', 20);
        }
        if (m.timer <= 0 || this.body?.blocked?.left || this.body?.blocked?.right ||
            this.body?.blocked?.up || this.body?.blocked?.down) {
          m.phase = 'recovery';
          m.timer = 750;
          this.setVelocity(0, 0);
          this.scene.spawnVolatileZone(this.x, this.y, 110, 14, 1800);
          shakeCamera(this.scene, 260, 0.014);
        }
        return;
      }
      m.timer -= delta;
      this.setAlpha(0.7);
      this.setVelocity(0, 0);
      if (m.timer <= 0) { m.phase = 'idle'; this.clearAlpha(); }
      return;
    }

    // Start the rush from a standstill at mid range.
    if (dist > 170 && dist <= 330 && (!this.body?.velocity ||
        Math.hypot(this.body.velocity.x, this.body.velocity.y) <= 20)) {
      m.phase = 'windup';
      m.timer = 820;
      m.angle = Phaser.Math.Angle.Between(this.x, this.y, player.x, player.y);
      m.hit = false;
      this.setVelocity(0, 0);
      return;
    }

    // Storm cadence tightens each phase: 2600 -> 1800 -> 1100ms.
    const cadence = e.enraged ? 1100 : (e.phase >= 2 ? 1800 : 2600);
    e.stormCooldown -= delta;
    if (e.stormCooldown <= 0 && dist <= this.aggroRange) {
      e.stormCooldown = cadence;
      const bolts = e.phase >= 2 ? 3 : 2;
      for (let i = 0; i < bolts; i++) {
        const angle = Phaser.Math.Angle.Between(this.x, this.y, player.x, player.y) +
          (i - (bolts - 1) / 2) * 0.5;
        const target = this.scene.getRandomWalkablePosition?.() ?? player;
        this.scene.fireEnemyProjectile(
          this, { x: target.x, y: target.y }, 'curse_orb',
          Math.max(1, Math.round(this.attackDamage * 0.55)), 'lightning'
        );
        void angle;
      }
      this.scene.createDamageSpark(this.x, this.y);
    }

    // Phase 2+ leaves a denial zone under the player, so standing still is
    // not a safe default.
    if (e.phase >= 1) {
      e.hazardCooldown -= delta;
      if (e.hazardCooldown <= 0) {
        e.hazardCooldown = e.phase >= 2 ? 2200 : 3400;
        this.scene.spawnVolatileZone(player.x, player.y, 70, 9, 2200);
      }
    }
  }

  // Returns true while this enemy is locked into a charge phase, so the caller
  // skips the ordinary chase logic. Phases:
  //   windup    - stops, tints red, locks a heading (the player's dodge window)
  //   charging  - runs at a fixed heading, damages on contact, ends on a wall
  //   recovery  - stands still and takes extra damage (the punish window)
  updateCharge(time, delta, dist, player) {
    const c = this.charge;
    const WINDUP = 520;
    const RECOVERY = 700;
    const CHARGE_SPEED = 420;
    const RANGE = 260;

    if (c.phase === 'idle') {
      if (dist > RANGE || dist <= this.attackRange * 1.4) return false;
      // Only start from a standstill, so a knockback cannot chain charges.
      if (this.body?.velocity && Math.hypot(this.body.velocity.x, this.body.velocity.y) > 20) return false;
      c.phase = 'windup';
      c.timer = WINDUP;
      c.angle = Phaser.Math.Angle.Between(this.x, this.y, player.x, player.y);
      c.hit = false;
      this.setTint(0xff8844);
      this.setVelocity(0, 0);
      return true;
    }

    if (c.phase === 'windup') {
      c.timer -= delta;
      // Keep telegraphing: a steady red pulse and a slow turn toward the target
      // would be readable, but the heading must NOT track the player or the
      // dodge window disappears.
      const pulse = Math.sin(time / 90) > 0 ? 0xffcc44 : 0xff4411;
      this.setTint(pulse);
      this.setVelocity(0, 0);
      if (c.timer <= 0) {
        c.phase = 'charging';
        c.timer = 900;
        this.clearTint();
      }
      return true;
    }

    if (c.phase === 'charging') {
      c.timer -= delta;
      this.setVelocity(Math.cos(c.angle) * CHARGE_SPEED, Math.sin(c.angle) * CHARGE_SPEED);
      // Contact damage, once per charge.
      if (!c.hit && dist <= this.attackRange + 10) {
        c.hit = true;
        CombatSystem.processAttack(this, player);
        this.scene.createDamageSpark(player.x, player.y);
        this.scene.createFloatingText(player.x, player.y - 24, 'CHARGED', '#ff8844');
      }
      // Slamming into geometry ends the rush: this is what makes wall-bashing
      // a real tactic rather than decoration.
      if (c.timer <= 0 || this.body?.blocked?.left || this.body?.blocked?.right ||
          this.body?.blocked?.up || this.body?.blocked?.down) {
        c.phase = 'recovery';
        c.timer = RECOVERY;
        this.setVelocity(0, 0);
        // Impact feedback at the point of contact.
        this.scene.createDamageSpark(this.x, this.y);
        shakeCamera(this.scene, 140, 0.006);
      }
      return true;
    }

    // recovery: the punish window. Stands still, visibly exhausted.
    c.timer -= delta;
    this.setAlpha(0.7);
    this.setVelocity(0, 0);
    if (c.timer <= 0) {
      c.phase = 'idle';
      this.clearAlpha();
    }
    return true;
  }

  // ── Summoner (cultAcolyte) ──────────────────────────────────────────────
  // Keeps its distance, tees up a summon, then raises a gargoyle. The active
  // summon cap is what keeps a wave of these from being unwinnable: without it
  // the floor fills faster than the player can clear it.
  // Short visual cue for an attack the enemy starts. The roster has no
  // per-enemy animation sheets, so the shared convention (see the boss
  // windups) is a tint pulse plus a scale pop, which reads on any sprite.
  flashAttackCue(color = 0xffd54f, times = 1) {
    if (this.isDead) return;
    this.setTint(color);
    this.scene.tweens.add({
      targets: this,
      scaleX: this.baseScaleX * 1.14,
      scaleY: 1.14,
      duration: 120,
      yoyo: true,
      repeat: times,
      onComplete: () => { this.clearTint(); this.setScale(this.baseScaleX, 1); },
    });
  }

  // Keeps a plain-sprite enemy oriented at its target without an animation
  // sheet. Used by the non-boss locomotion branches.
  faceToward(target) {
    if (!target) return;
    this.setFlipX(target.x < this.x);
  }

  // Shared locomotion helper for the behaviour branches. Inlining the same
  // "walk at the player at moveSpeed" angle math four times was what produced
  // the crash: one branch called a helper that never existed, so the whole
  // enemy's update loop threw the first frame it ran.
  moveTowardPlayer(player) {
    if (!player) return;
    const angle = Phaser.Math.Angle.Between(this.x, this.y, player.x, player.y);
    this.setVelocity(Math.cos(angle) * this.moveSpeed, Math.sin(angle) * this.moveSpeed);
  }

  updateSummoner(time, delta, dist, player) {
    // Prune summons that died or left the scene so the cap stays honest.
    this.summons = this.summons.filter((s) => s && !s.isDead && s.scene);

    const cd = this.type.summonCooldown ?? this.type.summonInterval ?? 6000;

    // The next cast is tracked as an absolute clock time, not a countdown. A
    // countdown only drains on the frames that run, so on a slow machine the
    // summoner would cast far less often than the design intends, and on a
    // fast one it would flood. `time` is the scene clock, so the cadence is the
    // same everywhere.
    if (this.nextSummonAt === undefined) this.nextSummonAt = time + cd;

    if (time < this.nextSummonAt) {
      // Kite while the cooldown runs: retreat from a close player, hold a
      // comfortable casting distance otherwise.
      const ideal = this.type.idealRange ?? 220;
      const away = dist < ideal * 0.7;
      const dir = away ? -1 : dist > ideal ? 0.25 : 0;
      const angle = Math.atan2(this.y - player.y, this.x - player.x);
      this.setVelocity(Math.cos(angle) * this.moveSpeed * dir, Math.sin(angle) * this.moveSpeed * dir);
      this.faceToward(player);
      return true;
    }

    // Cooldown ready: cast if under the cap, otherwise keep kiting until a
    // summon dies and frees a slot.
    if (this.summons.length >= MAX_SUMMONS_PER_CASTER) {
      const angle = Math.atan2(this.y - player.y, this.x - player.x);
      this.setVelocity(Math.cos(angle) * this.moveSpeed, Math.sin(angle) * this.moveSpeed);
      return true;
    }

    this.flashAttackCue();
    this.nextSummonAt = time + cd;
    this.scene.enemySummonGargoyle(this);
    return true;
  }

  // ── Armored slam (stoneGolem) ───────────────────────────────────────────
  // Slow approach -> readable ground circle -> high damage -> recovery. The
  // windup is the whole point: it is the window in which moving away works.
  updateGroundSlam(time, delta, dist, player) {
    const g = this.groundAttack;

    if (g.phase === 'idle') {
      if (dist > this.attackRange * 0.9) {
        this.moveTowardPlayer(player);
        this.faceToward(player);
        return true;
      }
      g.phase = 'windup';
      g.timer = this.type.slamWindup ?? 650;
      g.radius = this.type.slamRadius ?? 72;
      g.damage = this.type.slamDamage ?? this.attackDamage;
      g.hit = false;
      this.setVelocity(0, 0);
      this.faceToward(player);
      return true;
    }

    if (g.phase === 'windup') {
      g.timer -= delta;
      this.setVelocity(0, 0);
      this.faceToward(player);
      if (g.timer <= 0) {
        g.phase = 'active';
        g.timer = 220;
        this.scene.spawnTelegraphRing(this.x, this.y, g.radius, this.type.telegraphColor ?? 0xff7b3d, 'slam');
      }
      return true;
    }

    if (g.phase === 'active') {
      g.timer -= delta;
      if (!g.hit && Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y) <= g.radius) {
        g.hit = true;
        this.scene.handleAreaDamage(player, g.damage, this);
      }
      if (g.timer <= 0) {
        g.phase = 'recovery';
        g.timer = this.type.slamRecovery ?? 700;
      }
      return true;
    }

    g.timer -= delta;
    if (g.timer <= 0) g.phase = 'idle';
    return true;
  }

  // ── Flanker (ferryman) ──────────────────────────────────────────────────
  // Commits to an orbit at a fixed distance and only breaks it for a lunge.
  // Circling means a player who stands still gets hit, while one who keeps
  // moving keeps the angle closed — the opposite trade to the plain chasers.
  // Orbit and lunge are timed on the scene clock, like the summoner's cadence,
  // so the pattern reads the same on a 30fps laptop and a 144fps desktop.
  updateFlanker(time, delta, dist, player) {
    const o = this.orbit;
    const ideal = this.type.flankDistance ?? 90;
    const orbitMs = this.type.flankDuration ?? 1400;
    const lungeMs = this.type.lungeDuration ?? 320;

    if (o.phase === 'idle') {
      if (dist < ideal * 0.6 || dist > ideal * 1.8) {
        // Too far or uncomfortably close: close the distance straight on.
        this.moveTowardPlayer(player);
        this.faceToward(player);
        return true;
      }
      // Absolute deadlines on the scene clock: a countdown would drain only on
      // the frames that actually run, so a slow machine would orbit forever and
      // a fast one would lunge twice a second.
      o.phase = 'orbit';
      o.until = time + orbitMs;
      o.dir = Math.random() < 0.5 ? -1 : 1;
      return true;
    }

    if (o.phase === 'orbit') {
      const angle = Math.atan2(player.y - this.y, player.x - this.x);
      const tang = angle + (Math.PI / 2) * o.dir;
      const radial = (ideal - dist) * 1.6;
      this.setVelocity(
        (Math.cos(tang) * this.moveSpeed) + (Math.cos(angle) * radial),
        (Math.sin(tang) * this.moveSpeed) + (Math.sin(angle) * radial)
      );
      this.faceToward(player);
      if (time >= o.until) {
        o.phase = 'lunge';
        o.until = time + lungeMs;
        o.angle = angle;
        this.setVelocity(Math.cos(o.angle) * this.moveSpeed * 2.6, Math.sin(o.angle) * this.moveSpeed * 2.6);
        this.flashAttackCue();
      }
      return true;
    }

    // Lunge: one committed dash, then back to orbit.
    if (time >= o.until) {
      o.phase = 'idle';
      o.until = 0;
      this.setVelocity(0, 0);
    }
    return true;
  }

  executeAttack(player) {
    if (this.type.projectileType) {
      this.scene.fireEnemyProjectile(this, player, this.type.projectileType, this.attackDamage);
      // Ground denial: leave the lingering zone that makes this a
      // "ranged_aoe" archetype rather than a plain ranged one.
      if (this.behavior === 'ranged_aoe' && this.type.volatileDamage) {
        this.scene.spawnVolatileZone(
          player.x, player.y,
          this.type.volatileRadius ?? 56,
          this.type.volatileDamage,
          this.type.volatileDuration ?? 3000
        );
      }
    } else {
      this.stats.attackDamage = this.attackDamage;
      CombatSystem.processAttack(this, player);
      this.scene.createDamageSpark(player.x, player.y);
    }
  }

  heal(amount) {
    if (this.isDead) return;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    this.scene.createFloatingText(this.x, this.y - 20, `+${amount}`, '#27ae60');
  }

  drawHealthBar() {
    this.hpBar.clear();
    // A boss's health lives in the HUD's boss bar (name, phase pips, colour
    // escalation). Keeping a second, tiny bar over its head as well would show
    // the same number twice at two different sizes and make both harder to
    // read, so the boss path is skipped here.
    if (this.isBoss) return;
    const always = Boolean(this.eliteAffix);
    if (!always && this.hp >= this.maxHp) return;

    const barW = 28;
    const barH = 4;
    const x = this.x - barW / 2;
    const y = this.y - 24;

    this.hpBar.fillStyle(0x0b1220, 0.9);
    this.hpBar.fillRect(x - 1, y - 1, barW + 2, barH + 2);
    const pct = Math.max(0, this.hp / this.maxHp);
    const color = this.eliteAffix ? 0xa569bd : 0xe74c3c;
    this.hpBar.fillStyle(color, 1.0);
    this.hpBar.fillRect(x, y, barW * pct, barH);
  }

  takeDamage(amount, isCritical = false, attacker = null) {
    if (this.isDead) return;

    const hpBefore = this.hp;
    this.hp -= amount;
    this.scene.createFloatingText(this.x, this.y - 15, `-${amount}`, isCritical ? '#f1c40f' : '#ffffff', isCritical ? 22 : 15);
    audioManager.playHit(isCritical);

    // Impact feel: freeze the world briefly on a landed hit. A crit, a kill or
    // a boss hit all land heavier than a routine jab, and none of them is
    // long enough to cost the player a decision.
    if (this.scene?.applyHitstop) {
      const killed = this.hp <= 0 && hpBefore > 0;
      const weight = this.isBoss ? 2 : (this.type?.isMiniBoss ? 1.5 : 1);
      const ms = Math.round((killed ? 105 : isCritical ? 80 : 55) * weight);
      this.scene.applyHitstop(ms, isCritical ? 0.006 : 0.004);
    }

    // Kucuk knockback (boss haric): saldirgandan uza it
    if (attacker && typeof attacker.x === 'number' && !this.isBoss) {
      const angle = Phaser.Math.Angle.Between(attacker.x, attacker.y, this.x, this.y);
      this.setVelocity(Math.cos(angle) * 170, Math.sin(angle) * 170);
      this.knockbackTimer = 120;
    }

    // Hasar flaşı: önce beyaz parıltı (Brotato juice), sonra sön
    if (typeof this.setTintFill === 'function') this.setTintFill(0xffffff);
    else if (typeof this.setTint === 'function') this.setTint(0xff6666);
    // Ezilme: vuruşta jöle gibi squash
    try {
      this.scene.tweens.add({
        targets: this,
        scaleX: this.baseScaleX * 1.12,
        scaleY: this.baseScaleY * 0.88,
        duration: 60,
        yoyo: true,
        ease: 'Quad.easeOut',
        onComplete: () => { if (this.active) { this.setScale(this.baseScaleX, this.baseScaleY); } },
      });
    } catch (_) {}
    this.scene.time.delayedCall(80, () => {
      if (this.active) this.clearTint();
    });

    // Boss isabeti: hafif ekran sarsintisi (olumdeki buyuk sarsintidan ayri)
    if (this.isBoss) {
      shakeCamera(this.scene, 140, 0.006);
    }

    if (this.hp <= 0) {
      this.die();
    }
  }

  die() {
    if (this.isDead) return;
    this.isDead = true;
    this.setVelocity(0, 0);

    // The telegraph mark belongs to the scene, not to this sprite, so it would
    // survive the enemy and hang in the next chapter's room.
    if (this.telegraphMark) {
      this.telegraphMark.destroy();
      this.telegraphMark = null;
    }

    audioManager.playEnemyDeath(this.isBoss);

    if (this.isBoss) {
      shakeCamera(this.scene, 350, 0.015);
    }

    if (this.volatileDamage && this.scene.triggerEliteExplosion) {
      this.scene.triggerEliteExplosion(this);
    }

    // Ölüm patlaması: taş-kül parçacıkları
    if (typeof this.scene.spawnDeathBurst === 'function') {
      this.scene.spawnDeathBurst(this.x, this.y, this.isBoss);
    }

    // Düşürme (Drop): Denarii ve Zeus Kıvılcımı
    // A summoned gargoyle carries no gold or XP. It is part of the summoner's
    // toolkit, so paying out for every copy it raises would turn killing one
    // summoner into the chapter's economy and trivialise the shop.
    if (!this.isSummon) {
      this.scene.dropLoot(this.x, this.y, this.goldReward, this.xpReward);
      // Elit kalbi: %10 şansla 25 HP (ölüm sarmalına panzehir)
      if (this.eliteAffix && Math.random() < 0.1 && typeof this.scene.dropHeart === 'function') {
        this.scene.dropHeart(this.x + 14, this.y + 6, 25);
      }
    }
    // Kombo sayacı
    if (typeof this.scene.registerKill === 'function') {
      this.scene.registerKill(this.x, this.y);
    }
    this.scene.progression.recordKill(this.isBoss);

    this.destroy();
  }

  preDestroy() {
    if (this.hpBar) {
      this.hpBar.destroy();
      this.hpBar = null;
    }
    if (this.shadow) {
      this.shadow.destroy();
      this.shadow = null;
    }
    if (this.eliteGlow) {
      this.eliteGlow.destroy();
      this.eliteGlow = null;
    }
    if (this.readabilityRing) {
      this.readabilityRing.destroy();
      this.readabilityRing = null;
    }
    if (this.readabilitySprite) {
      this.readabilitySprite.destroy();
      this.readabilitySprite = null;
    }
    if (this.threatPip) {
      this.threatPip.destroy();
      this.threatPip = null;
    }
    super.preDestroy();
  }
}


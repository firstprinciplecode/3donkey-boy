import * as THREE from 'three';
import { sfx, toggleMute, unlockAudio } from './audio';
import { music } from './music';
import { SkyCritters } from './background';
import {
  BARREL,
  CAMERA,
  COLORS,
  FIRE,
  GAME_RULES,
  GHOST,
  HAMMER,
  HISCORE_KEY,
  PHYSICS,
  PLAYER_SIZE,
  RAINBOW,
  SCORE,
} from './config';
import { BarrelManager, createBarrelPile } from './entities/barrels';
import { Boss } from './entities/boss';
import { Fire } from './entities/fire';
import { Ghost } from './entities/ghost';
import { ITEM_RADIUS, Item } from './entities/items';
import { Particles } from './entities/particles';
import { Player } from './entities/player';
import { createOneUpToken } from './entities/token';
import type { Hud } from './hud';
import type { Input } from './input';
import { BOSS_POS, Level, sideYaw, squareCoords } from './level';
import { LEVELS } from './levels/defs';
import { validateLevel } from './levels/validate';
import { Obstacles } from './obstacles';
import type { Stage } from './stage';
import { LIGHTING, timeForRound, type TimeOfDay } from './timeOfDay';
import { formatScore, randRange, sphereHitsCylinder } from './utils';
import { buildWorld, disposeWorld } from './world';

type GameState = 'title' | 'ready' | 'playing' | 'paused' | 'dying' | 'clear' | 'gameover';

const READY_TIME = 1.6;
const DEATH_TIME = 2.2;
const CLEAR_TIME = 3.2;
const HINT_COOLDOWN = 1.4;

function loadHiScore(): number {
  try {
    const value = Number(window.localStorage.getItem(HISCORE_KEY));
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  } catch {
    return 0;
  }
}

function saveHiScore(value: number): void {
  try {
    window.localStorage.setItem(HISCORE_KEY, String(Math.floor(value)));
  } catch {
    // Storage can be unavailable (private mode, quota); the hi-score just won't persist.
  }
}

export class Game {
  private state: GameState = 'title';
  private stateTime = 0;
  private clock = 0;
  private score = 0;
  private hiScore: number;
  private lives: number = GAME_RULES.lives;
  private round = 1;
  private speedMul = 1;
  private bonus: number = GAME_RULES.bonusStart;
  private bonusClock = 0;
  private bossClock = 0;
  private footstepClock = 0;
  private hammerTime = 0;
  private hintClock = 0;

  private readonly stage: Stage;
  private readonly hud: Hud;
  private readonly input: Input;
  private readonly player: Player;
  private readonly barrels: BarrelManager;
  private readonly boss = new Boss();
  private readonly particles = new Particles();
  private readonly sky = new SkyCritters();
  private readonly levelLayer = new THREE.Group();
  private readonly itemLayer = new THREE.Group();
  private readonly ghostLayer = new THREE.Group();
  private readonly fireLayer = new THREE.Group();
  private readonly goal: THREE.Group;
  private readonly goalBase = new THREE.Vector3();
  private readonly throwOrigin = new THREE.Vector3();
  private readonly cameraFocus = new THREE.Vector3();
  private readonly showcaseFocus = new THREE.Vector3();
  private showcaseZoom: number = CAMERA.showcaseZoom;
  private levelIndex = -1;
  private time: TimeOfDay = 'day';
  private level: Level;
  private obstacles: Obstacles;
  private world: THREE.Group | null = null;
  private pile: THREE.Group | null = null;
  private ghosts: Ghost[] = [];
  private items: Item[] = [];
  private fires: Fire[] = [];
  /** Pyramid side the play camera is locked to. */
  private viewSide = 0;
  /** Unwrapped camera azimuth, so turns always take the short way round. */
  private viewAzimuth = 0;
  private turn: { from: number; to: number; t: number } | null = null;

  constructor(stage: Stage, hud: Hud, input: Input) {
    this.stage = stage;
    this.hud = hud;
    this.input = input;

    if (import.meta.env.DEV) {
      for (const problem of LEVELS.flatMap(validateLevel)) console.warn(`[level] ${problem}`);
    }

    this.level = new Level(LEVELS[0]);
    this.obstacles = new Obstacles(this.level);
    this.player = new Player(this.level);
    this.barrels = new BarrelManager(this.level);
    this.goal = createOneUpToken(0.8);
    this.boss.group.rotation.y = Math.PI / 2;

    stage.scene.add(
      this.levelLayer,
      this.player.group,
      this.boss.group,
      this.barrels.group,
      this.particles.group,
      this.itemLayer,
      this.ghostLayer,
      this.fireLayer,
      this.goal,
      this.sky.group,
    );

    this.barrels.onDrum = (b) => {
      if (this.state !== 'playing') return;
      this.particles.burst(b.pos.x, b.pos.y + 1.4, b.pos.z, [COLORS.orange, COLORS.yellow, COLORS.red], 10, 3);
      sfx.drum();
      if (this.fires.length < this.level.def.fires) this.spawnFire();
    };
    this.barrels.onPit = (b) => {
      this.particles.burst(b.pos.x, b.pos.y + 0.4, b.pos.z, RAINBOW, 8, 3);
    };

    this.hiScore = loadHiScore();
    this.hud.setHi(this.hiScore);
    this.hud.setScore(0);
    this.hud.setLives(this.lives);
    this.hud.setBonus(this.bonus);
    this.hud.setRound(this.round);

    this.loadLevel(0);
    this.player.reset(this.level.def.playerStart);
    this.spawnItems();
    this.spawnGhosts(0);
    this.hud.showTitle();
  }

  update(dt: number): void {
    this.stateTime += dt;
    this.clock += dt;
    this.hintClock = Math.max(0, this.hintClock - dt);

    if (this.input.consume('KeyM')) {
      this.hud.banner(toggleMute() ? 'sound off' : 'sound on', 900);
    }

    switch (this.state) {
      case 'title':
        for (const g of this.ghosts) g.update(dt);
        if (this.input.consume('Space')) {
          unlockAudio();
          this.startGame();
        }
        break;
      case 'ready':
        if (this.stateTime >= READY_TIME) this.setState('playing');
        break;
      case 'playing':
        if (!this.turn) this.updatePlaying(dt);
        break;
      case 'paused':
        if (this.input.consume('KeyP') || this.input.consume('Escape') || this.input.consume('Space')) this.resume();
        break;
      case 'dying':
        if (this.stateTime >= DEATH_TIME) {
          if (this.lives <= 0) this.gameOver();
          else this.startRound(false);
        }
        break;
      case 'clear':
        this.updateClear(dt);
        break;
      case 'gameover':
        if (this.stateTime > 1 && this.input.consume('Space')) this.startGame();
        break;
    }

    this.animate(dt);
    this.input.endFrame();
  }

  /** Called when the tab is hidden so the player doesn't die while away. */
  autoPause(): void {
    if (this.state === 'playing') this.pause();
  }

  private setState(state: GameState): void {
    this.state = state;
    this.stateTime = 0;
    if (state === 'playing') music.start();
    else if (state === 'paused') music.pause();
    else music.stop();
  }

  /** Swap in a level: rebuilds the voxel world and obstacles, and moves the boss, goal and pile. */
  private loadLevel(index: number, time: TimeOfDay = 'day'): void {
    const i = index % LEVELS.length;
    if (i === this.levelIndex && time === this.time) return;
    this.levelIndex = i;
    this.time = time;

    if (this.world) {
      this.levelLayer.remove(this.world);
      disposeWorld(this.world);
    }
    this.levelLayer.remove(this.obstacles.group);
    this.obstacles.dispose();
    if (this.pile) this.levelLayer.remove(this.pile);

    const level = new Level(LEVELS[i]);
    this.level = level;
    this.world = buildWorld(level, LIGHTING[time].glow);
    this.stage.setLighting(LIGHTING[time]);
    this.obstacles = new Obstacles(level);
    this.player.level = level;
    this.barrels.level = level;
    this.barrels.env = this.obstacles;

    const summitY = level.tierTop(level.summitTier);
    this.boss.group.position.set(BOSS_POS.x, summitY, BOSS_POS.z);
    this.throwOrigin.set(BOSS_POS.x + 1.3, summitY + 2.4, BOSS_POS.z - 0.6);
    const top = level.summitPath.point(level.summitPath.length);
    this.goalBase.set(top.x, top.y + 2, top.z);
    this.goal.position.copy(this.goalBase);
    this.pile = createBarrelPile(BOSS_POS.x - 0.4, summitY, 2.1);
    this.levelLayer.add(this.world, this.obstacles.group, this.pile);

    this.showcaseFocus.set(0, summitY / 2, 0);
    this.showcaseZoom = Math.min(CAMERA.showcaseZoom, 8 / level.tierHalf(0));
    document.body.dataset.skin = level.def.skin;
    document.body.dataset.time = time;
    this.hud.setLevel(i + 1, level.def.name);
  }

  private startGame(): void {
    this.score = 0;
    this.lives = GAME_RULES.lives;
    this.round = 1;
    this.hud.setScore(0);
    this.hud.setLives(this.lives);
    this.hud.hideOverlay();
    this.startRound(true);
  }

  /** How many times the player has gone through every level. */
  private get loop(): number {
    return Math.floor((this.round - 1) / LEVELS.length);
  }

  private startRound(fresh: boolean): void {
    if (fresh) this.loadLevel(this.round - 1, timeForRound(this.round, LEVELS.length));
    const def = this.level.def;
    this.speedMul = Math.min(GAME_RULES.maxSpeedMul, 1 + 0.2 * this.loop + 0.06 * this.levelIndex);
    this.barrels.clear();
    this.barrels.speedMul = this.speedMul;
    this.barrels.ladderChance = Math.min(0.5, BARREL.ladderChance + 0.05 * this.loop);
    this.particles.clear();
    this.clearFires();
    this.obstacles.reset(fresh);
    this.player.reset(def.playerStart);
    this.hammerTime = 0;
    music.setSpeed(this.speedMul);
    music.setHammer(false);
    this.turnTo(def.playerStart.side);
    this.bonus = GAME_RULES.bonusStart;
    this.bonusClock = 0;
    this.bossClock = 1.2;
    if (fresh) this.spawnItems();
    this.spawnGhosts(this.loop);
    this.hud.setBonus(this.bonus);
    this.hud.setRound(this.round);
    const when = this.time === 'day' ? '' : ` · ${this.time}`;
    this.hud.banner(`round-${this.round}`, READY_TIME * 1000, `level ${this.levelIndex + 1} · ${def.name}${when}`);
    this.setState('ready');
  }

  private spawnItems(): void {
    this.itemLayer.clear();
    this.items = this.level.def.items.map((spawn, i) => new Item(this.level, spawn.type, spawn.spot, i));
    for (const item of this.items) this.itemLayer.add(item.group);
  }

  private spawnGhosts(loop: number): void {
    this.ghostLayer.clear();
    const def = this.level.def;
    const count = Math.min(def.ghosts + loop, def.patrols.length);
    this.ghosts = def.patrols.slice(0, count).map((p) => new Ghost(this.level, p, GHOST.speed * this.speedMul));
    for (const g of this.ghosts) this.ghostLayer.add(g.group);
  }

  private spawnFire(): void {
    const fire = new Fire(this.level);
    this.fires.push(fire);
    this.fireLayer.add(fire.group);
    sfx.fire();
  }

  private clearFires(): void {
    this.fireLayer.clear();
    this.fires = [];
  }

  private updatePlaying(dt: number): void {
    if (this.input.consume('KeyP') || this.input.consume('Escape')) {
      this.pause();
      return;
    }

    const controls = this.input.controls();
    const env = this.obstacles;
    let jump = controls.jump;
    let remaining = dt;
    while (remaining > 1e-6 && this.state === 'playing') {
      const h = Math.min(PHYSICS.substep, remaining);
      remaining -= h;
      const result = this.player.step(h, { ...controls, jump }, env);
      jump = false;
      if (result.jumped) sfx.jump();
      if (result.landed) sfx.land();
      if (result.blockedLadder >= 0) this.lockHint(result.blockedLadder);
      if (result.hammerBlocked) this.hint("can't climb holding the hammer");
      if (result.fellInPit) {
        this.die(true);
        return;
      }
      if (result.reachedSummit) {
        this.clearRound();
        return;
      }
      this.barrels.update(h);
      for (const g of this.ghosts) g.update(h);
      for (const f of this.fires) f.update(h, env, this.speedMul);
      const events = this.obstacles.update(h, { ring: this.player.ring, s: this.player.s, grounded: this.player.grounded });
      if (events.crumbled) sfx.crumble();
      if (events.switched) {
        sfx.switch();
        this.popupAtPlayer('gate open!');
      }
      this.checkCollisions();
    }
    if (this.state !== 'playing') return;

    if (this.hammerTime > 0) {
      this.hammerTime -= dt;
      this.player.hammerBlink = this.hammerTime < HAMMER.warnAt && Math.floor(this.hammerTime * 8) % 2 === 0;
      if (this.hammerTime <= 0) {
        this.player.setHammer(false);
        music.setHammer(false);
      }
    }

    this.bossClock -= dt;
    if (this.bossClock <= 0 && !this.boss.busy && this.barrels.count < BARREL.maxAlive) {
      this.boss.playThrow();
      this.bossClock = randRange(BARREL.minInterval, BARREL.maxInterval) / this.speedMul;
    }

    this.bonusClock += dt;
    if (this.bonusClock >= GAME_RULES.bonusInterval) {
      this.bonusClock -= GAME_RULES.bonusInterval;
      this.bonus = Math.max(0, this.bonus - GAME_RULES.bonusStep);
      this.hud.setBonus(this.bonus);
      if (this.bonus === 0) {
        this.die();
        return;
      }
    }

    if (this.player.isWalking || this.player.isClimbing) {
      this.footstepClock += dt;
      if (this.footstepClock > 0.16) {
        this.footstepClock = 0;
        if (this.player.isClimbing) sfx.climb();
        else sfx.step();
      }
    }
  }

  private hint(text: string): void {
    if (this.hintClock > 0) return;
    this.hintClock = HINT_COOLDOWN;
    sfx.locked();
    this.popupAtPlayer(text);
  }

  private lockHint(ladder: number): void {
    const kind = this.obstacles.lockKind(ladder);
    this.hint(kind === 'key' ? 'locked · find the key!' : 'gated · find the switch!');
  }

  private popupAtPlayer(text: string): void {
    const p = this.player.position;
    this.popup(text, p.x, p.y + 2.2, p.z);
  }

  private hitsPlayer(x: number, y: number, z: number, r: number): boolean {
    const p = this.player.position;
    return sphereHitsCylinder(x, y, z, r, p.x, p.y, p.z, PLAYER_SIZE.halfWidth, PLAYER_SIZE.height);
  }

  private smash(x: number, y: number, z: number, points: number): void {
    this.particles.burst(x, y, z, [COLORS.cream, COLORS.yellow, COLORS.orange], 14, 5);
    this.addScore(points, new THREE.Vector3(x, y, z), 0.8);
    sfx.smash();
  }

  private checkCollisions(): void {
    const p = this.player;
    const pp = p.position;
    const R = BARREL.radius;
    const armed = p.hasHammer;

    for (const b of this.barrels.barrels) {
      if (b.done || b.state === 'sink') continue;
      if (this.hitsPlayer(b.pos.x, b.pos.y + R, b.pos.z, R * 0.8)) {
        if (!armed) return this.die();
        this.barrels.smash(b);
        this.smash(b.pos.x, b.pos.y + R, b.pos.z, SCORE.smashBarrel);
        continue;
      }
      const clearedAbove =
        p.state === 'air' &&
        b.state === 'roll' &&
        b.ring === p.ring &&
        Math.hypot(pp.x - b.pos.x, pp.z - b.pos.z) < 0.7 &&
        pp.y > b.pos.y + R * 2 - 0.1 &&
        pp.y - b.pos.y < 2.4;
      if (!b.scored && clearedAbove) {
        b.scored = true;
        this.addScore(SCORE.jumpBarrel, b.pos, 1.4);
        sfx.score();
      }
    }

    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      if (!this.hitsPlayer(f.position.x, f.position.y, f.position.z, FIRE.radius)) continue;
      if (!armed) return this.die();
      this.fireLayer.remove(f.group);
      this.fires.splice(i, 1);
      this.smash(f.position.x, f.position.y, f.position.z, SCORE.smashFire);
    }

    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const g = this.ghosts[i];
      if (!this.hitsPlayer(g.position.x, g.position.y, g.position.z, GHOST.radius)) continue;
      if (!armed) return this.die();
      this.ghostLayer.remove(g.group);
      this.ghosts.splice(i, 1);
      this.smash(g.position.x, g.position.y, g.position.z, SCORE.smashGhost);
    }

    for (const item of this.items) {
      const c = item.position;
      if (!item.collected && this.hitsPlayer(c.x, c.y, c.z, ITEM_RADIUS)) this.collect(item);
    }
  }

  private collect(item: Item): void {
    item.collected = true;
    this.itemLayer.remove(item.group);
    const c = item.position;
    switch (item.type) {
      case 'gem':
        this.addScore(SCORE.gem, c, 0.6);
        this.particles.burst(c.x, c.y, c.z, RAINBOW, 10, 3);
        sfx.pickup();
        break;
      case 'hotdog':
        this.addScore(SCORE.hotdog, c, 0.6);
        this.particles.burst(c.x, c.y, c.z, [COLORS.red, COLORS.tan, COLORS.yellow], 12, 4);
        sfx.pickup();
        break;
      case 'oneup':
        this.lives = Math.min(GAME_RULES.maxLives, this.lives + 1);
        this.hud.setLives(this.lives);
        this.popup('1-up!', c.x, c.y + 0.6, c.z);
        this.particles.burst(c.x, c.y, c.z, [COLORS.grass, COLORS.cream, COLORS.grassDark], 16, 4);
        sfx.oneUp();
        break;
      case 'hammer':
        this.hammerTime = HAMMER.duration;
        this.player.setHammer(true);
        music.setHammer(true);
        this.popup('hammer!', c.x, c.y + 0.6, c.z);
        this.particles.burst(c.x, c.y, c.z, [COLORS.charcoal, COLORS.yellow], 12, 4);
        sfx.hammer();
        break;
      case 'key':
        this.obstacles.unlockKeyDoors();
        this.popup('door unlocked!', c.x, c.y + 0.6, c.z);
        this.particles.burst(c.x, c.y, c.z, [COLORS.yellow, COLORS.cream], 16, 4);
        sfx.unlock();
        break;
    }
  }

  private addScore(points: number, at?: THREE.Vector3, lift = 0): void {
    this.score += points;
    this.hud.setScore(this.score);
    if (this.score > this.hiScore) {
      this.hiScore = this.score;
      this.hud.setHi(this.hiScore);
    }
    if (at) this.popup(`${points}-pt`, at.x, at.y + lift, at.z);
  }

  private popup(text: string, x: number, y: number, z: number): void {
    const s = this.stage.toScreen(x, y, z);
    this.hud.popup(text, s.x, s.y);
  }

  private die(fell = false): void {
    if (this.state !== 'playing') return;
    this.setState('dying');
    this.player.die();
    this.player.setHammer(false);
    music.setHammer(false);
    this.hammerTime = 0;
    this.lives -= 1;
    this.hud.setLives(this.lives);
    const pp = this.player.position;
    this.particles.burst(pp.x, pp.y + 0.8, pp.z, [COLORS.orange, COLORS.cyan, COLORS.yellow], 18, 5);
    if (fell) sfx.fall();
    else sfx.hit();
    saveHiScore(this.hiScore);
  }

  private clearRound(): void {
    this.setState('clear');
    for (const b of this.barrels.barrels) {
      this.particles.burst(b.pos.x, b.pos.y + BARREL.radius, b.pos.z, RAINBOW, 8, 4);
    }
    this.barrels.clear();
    this.clearFires();
    this.particles.burst(this.goalBase.x, this.goalBase.y, this.goalBase.z, RAINBOW, 30, 7);
    sfx.clear();
    this.hud.banner('round clear!', CLEAR_TIME * 1000, `bonus ${this.bonus}`);
  }

  private updateClear(dt: number): void {
    if (this.bonus > 0 && this.stateTime > 0.6) {
      const chunk = Math.min(this.bonus, Math.ceil(dt * 5000));
      this.bonus -= chunk;
      this.addScore(chunk);
      this.hud.setBonus(this.bonus);
      this.hud.setBannerSub(`bonus ${this.bonus}`);
    }
    if (this.stateTime >= CLEAR_TIME) {
      saveHiScore(this.hiScore);
      this.round += 1;
      this.startRound(true);
    }
  }

  private gameOver(): void {
    this.setState('gameover');
    saveHiScore(this.hiScore);
    sfx.gameOver();
    this.hud.showMessage('game over', `score ${formatScore(this.score)}pt · press space to play again`);
  }

  private pause(): void {
    this.setState('paused');
    this.hud.showMessage('paused', 'press p to resume');
  }

  private resume(): void {
    this.hud.hideOverlay();
    this.setState('playing');
  }

  private animate(dt: number): void {
    this.player.animate(dt);
    if (this.boss.update(dt) && this.state === 'playing') {
      this.barrels.spawn(this.throwOrigin);
      sfx.throw();
    }
    for (const item of this.items) if (!item.collected) item.animate(dt);
    this.particles.update(dt);
    this.sky.update(dt);

    this.goal.rotation.y += dt * (this.state === 'clear' ? 12 : 1.6);
    this.goal.position.y = this.goalBase.y + Math.sin(this.clock * 2) * 0.15;

    const showcase = this.state === 'title' || this.state === 'gameover';
    if (showcase) {
      this.turn = null;
      this.viewAzimuth = showcaseAzimuth(this.clock);
      this.stage.follow(
        {
          focus: this.showcaseFocus,
          azimuth: this.viewAzimuth,
          polar: SHOWCASE_POLAR,
          zoom: this.showcaseZoom,
          distance: CAMERA.showcaseDistance,
        },
        dt,
      );
      return;
    }

    const pp = this.player.position;
    if (!this.turn && this.state === 'playing') {
      const { side, offset, radius } = squareCoords(pp.x, pp.z);
      if (side !== this.viewSide && Math.abs(offset) < radius - CAMERA.turnHysteresis) {
        this.turnTo(side);
        sfx.turn();
      }
    }
    if (this.turn) {
      this.turn.t = Math.min(1, this.turn.t + dt / CAMERA.turnDuration);
      this.viewAzimuth = THREE.MathUtils.lerp(this.turn.from, this.turn.to, easeInOutCubic(this.turn.t));
      if (this.turn.t >= 1) this.turn = null;
    }

    this.cameraFocus.set(pp.x, pp.y + 1.5, pp.z);
    this.stage.follow(
      {
        focus: this.cameraFocus,
        azimuth: this.viewAzimuth,
        polar: PLAY_POLAR,
        zoom: 1,
        distance: CAMERA.playDistance,
      },
      dt,
    );
  }

  /** Starts an eased turn from the current view to face `side` head-on, the short way round. */
  private turnTo(side: number): void {
    this.viewSide = side;
    const target = sideYaw(side) + YAW_BIAS;
    const delta = THREE.MathUtils.euclideanModulo(target - this.viewAzimuth + Math.PI, Math.PI * 2) - Math.PI;
    this.turn = Math.abs(delta) < 1e-4 ? null : { from: this.viewAzimuth, to: this.viewAzimuth + delta, t: 0 };
  }
}

const PLAY_POLAR = THREE.MathUtils.degToRad(CAMERA.playPolarDeg);
const SHOWCASE_POLAR = THREE.MathUtils.degToRad(CAMERA.showcasePolarDeg);
const YAW_BIAS = THREE.MathUtils.degToRad(CAMERA.yawBiasDeg);
const SHOWCASE_TURN_TIME = 0.8;

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/** Holds each face for a beat, then snaps a quarter turn, like Fez's rotations. */
function showcaseAzimuth(clock: number): number {
  const every = CAMERA.showcaseTurnEvery;
  const step = Math.floor(clock / every);
  const phase = clock - step * every;
  const t = THREE.MathUtils.clamp((phase - (every - SHOWCASE_TURN_TIME)) / SHOWCASE_TURN_TIME, 0, 1);
  return (step + easeInOutCubic(t)) * (Math.PI / 2) + YAW_BIAS;
}

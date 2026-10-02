import * as THREE from 'three';
import { sfx, toggleMute, unlockAudio } from './audio';
import { music } from './music';
import { SkyCritters } from './background';
import {
  BARREL,
  CAMERA,
  COLORS,
  CRAWLER,
  FIRE,
  GAME_RULES,
  GHOST,
  HAMMER,
  PHYSICS,
  PLAYER_SIZE,
  RAINBOW,
  SCORE,
  TOTEM,
} from './config';
import { Cascades } from './cascades';
import { Combo } from './combo';
import type { GameEvent, SmashTarget } from './gameEvents';
import { orbSpots } from './levels/orbs';
import { Totem } from './entities/totem';
import { BarrelManager, barrelCentreY, createBarrelPile } from './entities/barrels';
import { PROJECTILES } from './entities/projectiles';
import { Boss } from './entities/boss';
import { Crawler } from './entities/crawler';
import { Fire } from './entities/fire';
import { Ghost } from './entities/ghost';
import { ITEM_RADIUS, Item, LETTER_CHARS } from './entities/items';
import { Particles } from './entities/particles';
import { Player } from './entities/player';
import { createOneUpToken } from './entities/token';
import type { HiScoreEntry } from './hiscore';
import {
  bestFor,
  cycleLetter,
  insertScore,
  insertionIndex,
  loadBoard,
  loadPlayerName,
  saveBoard,
  savePlayerName,
  submitScore,
  syncBoard,
  topScore,
} from './hiscore';
import { Hazards, type HazardEvents } from './hazards';
import { byInput, type Hud } from './hud';
import type { Input } from './input';
import { BOSS_POS, Level, sideYaw, squareCoords } from './level';
import { LEVELS } from './levels/defs';
import { SKINS } from './levels/skins';
import { validateLevel } from './levels/validate';
import { Obstacles } from './obstacles';
import type { Stage } from './stage';
import { lightingFor, timeForLevel, type TimeOfDay } from './timeOfDay';
import { levelTitle, randRange, sphereHitsCylinder } from './utils';
import { buildWorld, disposeWorld } from './world';

type GameState = 'title' | 'ready' | 'playing' | 'paused' | 'dying' | 'clear' | 'initials' | 'gameover';

const READY_TIME = 1.6;
const DEATH_TIME = 2.2;
const CLEAR_TIME = 3.2;
const HINT_COOLDOWN = 1.4;

export class Game {
  private state: GameState = 'title';
  private stateTime = 0;
  private clock = 0;
  private score = 0;
  private hiScore = 0;
  private board: HiScoreEntry[] = [];
  private initials: string[] = ['A', 'A', 'A'];
  private initialCursor = 0;
  /** The initials were pre-filled from a previous save. */
  private returning = false;
  private lives: number = GAME_RULES.lives;
  private round = 1;
  private speedMul = 1;
  private bonus: number = GAME_RULES.bonusStart;
  private bonusClock = 0;
  private bossClock = 0;
  private footstepClock = 0;
  private hammerTime = 0;
  /** Hit-stop: seconds left with the world frozen. Input is kept, so presses made now still land. */
  private freeze = 0;
  private readonly combo = new Combo();
  private hintClock = 0;
  /** Started from a later level (dev level select), so the score stays off the hi-score table. */
  private practice = false;
  /** Space on the initials screen is held until the shared table answers. */
  private savingScore = false;
  /** Achievements and rich presence listen here. */
  onEvent: (event: GameEvent) => void = () => {};
  /** Set where the game can close itself (the desktop build); adds Q / Y to quit from menus. */
  onQuit: (() => void) | null = null;

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
  private readonly crawlerLayer = new THREE.Group();
  private readonly totemLayer = new THREE.Group();
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
  private hazards: Hazards;
  private world: THREE.Group | null = null;
  private pile: THREE.Group | null = null;
  private ghosts: Ghost[] = [];
  private items: Item[] = [];
  private fires: Fire[] = [];
  private crawlers: Crawler[] = [];
  private totems: Totem[] = [];
  private cascades: Cascades | null = null;
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
      console.info(`[dev] press 1-${Math.min(9, LEVELS.length)} on the title screen to start at that level`);
    }

    this.level = new Level(LEVELS[0]);
    this.obstacles = new Obstacles(this.level);
    this.hazards = new Hazards(this.level);
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
      this.crawlerLayer,
      this.totemLayer,
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
    this.barrels.onSplit = (b) => {
      if (this.state !== 'playing') return;
      this.particles.burst(b.pos.x, barrelCentreY(b), b.pos.z, PROJECTILES[b.look].burst, 10, 3);
      sfx.crumble();
    };
    this.barrels.onScorch = (at) => {
      if (this.state !== 'playing') return;
      this.particles.burst(at.x, at.y + 0.3, at.z, [COLORS.lava, COLORS.orange, COLORS.yellow], 8, 3);
      if (at.distanceTo(this.player.position) < 10) sfx.fire();
    };

    this.board = loadBoard();
    this.hiScore = topScore(this.board);
    this.hud.setHi(this.hiScore);
    void this.refreshBoard();
    this.hud.setScore(0);
    this.hud.setLives(this.lives);
    this.hud.setBonus(this.bonus);
    this.hud.setRound(this.round);

    this.loadLevel(0);
    this.player.reset(this.level.def.playerStart);
    this.spawnItems();
    this.spawnGhosts(0);
    this.spawnCrawlers();
    this.spawnTotems();
    this.hud.showTitle(this.board);
  }

  update(dt: number): void {
    if (this.freeze > 0) {
      this.freeze = Math.max(0, this.freeze - dt);
      this.stage.settle(dt);
      return;
    }
    this.stateTime += dt;
    this.clock += dt;
    this.hintClock = Math.max(0, this.hintClock - dt);

    if (this.input.consume('KeyM')) {
      this.hud.banner(toggleMute() ? 'Sound off' : 'Sound on', 900);
    }

    switch (this.state) {
      case 'title':
        for (const g of this.ghosts) g.update(dt);
        for (const c of this.crawlers) c.update(dt, this.obstacles);
        for (const t of this.totems) t.update(dt, this.obstacles);
        if (this.input.consume('Space')) {
          unlockAudio();
          this.startGame();
        } else if (this.quitPressed()) {
          this.onQuit?.();
        } else if (import.meta.env.DEV) {
          let pick = 0;
          for (let n = 1; n <= Math.min(9, LEVELS.length); n++) {
            if (this.input.consume(`Digit${n}`) || this.input.consume(`Numpad${n}`)) pick = n;
          }
          if (pick) {
            unlockAudio();
            this.startGame(pick);
          }
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
        else if (this.quitPressed()) this.onQuit?.();
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
      case 'initials':
        this.editInitials();
        break;
      case 'gameover':
        if (this.stateTime > 1 && this.input.consume('Space')) this.startGame();
        else if (this.quitPressed()) this.onQuit?.();
        break;
    }

    this.animate(dt);
    this.input.endFrame();
  }

  /** Called when the tab is hidden so the player doesn't die while away. */
  autoPause(): void {
    if (this.state === 'playing') this.pause();
  }

  private quitPressed(): boolean {
    return this.onQuit !== null && (this.input.consume('KeyQ') || this.input.consume('GamepadY'));
  }

  private emit(event: GameEvent): void {
    if (!this.practice) this.onEvent(event);
  }

  private setState(state: GameState): void {
    this.state = state;
    this.stateTime = 0;
    this.input.textEntry = state === 'initials';
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
    this.levelLayer.remove(this.obstacles.group, this.hazards.group);
    this.obstacles.dispose();
    if (this.cascades) {
      this.levelLayer.remove(this.cascades.group);
      this.cascades.dispose();
    }
    if (this.pile) this.levelLayer.remove(this.pile);

    const level = new Level(LEVELS[i]);
    this.level = level;
    this.world = buildWorld(level, lightingFor(time, level.def.skin).glow);
    this.stage.setLighting(lightingFor(time, level.def.skin));
    this.obstacles = new Obstacles(level);
    this.hazards = new Hazards(level);
    this.player.level = level;
    this.barrels.level = level;
    this.barrels.env = this.obstacles;
    this.barrels.look = SKINS[level.def.skin].projectile;

    const summitY = level.tierTop(level.summitTier);
    this.boss.setLook(level.def.skin);
    this.boss.group.position.set(BOSS_POS.x, summitY, BOSS_POS.z);
    this.throwOrigin.set(BOSS_POS.x + 1.3, summitY + 2.4, BOSS_POS.z - 0.6);
    const top = level.summitPath.point(level.summitPath.length);
    this.goalBase.set(top.x, top.y + 2, top.z);
    this.goal.position.copy(this.goalBase);
    this.pile = createBarrelPile(BOSS_POS.x - 0.4, summitY, 2.1, this.barrels.look);
    this.cascades = new Cascades(level);
    this.levelLayer.add(this.world, this.obstacles.group, this.hazards.group, this.pile, this.cascades.group);

    this.showcaseFocus.set(0, summitY / 2, 0);
    this.showcaseZoom = Math.min(CAMERA.showcaseZoom, 8 / level.tierHalf(0));
    document.body.dataset.skin = level.def.skin;
    document.body.dataset.time = time;
    music.setTheme(level.def.skin);
    this.hud.setLevel(i + 1, level.def.name);
  }

  /** Dev builds only: number keys on the title screen start at that level. */
  private startGame(startLevel = 1): void {
    this.practice = startLevel > 1;
    this.score = 0;
    this.lives = GAME_RULES.lives;
    this.round = startLevel;
    this.hud.setScore(0);
    this.hud.setLives(this.lives);
    this.hud.hideOverlay();
    this.emit({ type: 'runStart' });
    this.startRound(true);
  }

  /** How many times the player has gone through every level. */
  private get loop(): number {
    return Math.floor((this.round - 1) / LEVELS.length);
  }

  private startRound(fresh: boolean): void {
    const skin = LEVELS[(this.round - 1) % LEVELS.length].skin;
    if (fresh) this.loadLevel(this.round - 1, timeForLevel(this.round, LEVELS.length, skin));
    const def = this.level.def;
    this.speedMul = Math.min(GAME_RULES.maxSpeedMul, 1 + 0.2 * this.loop + 0.06 * this.levelIndex);
    this.barrels.clear();
    this.combo.reset();
    this.barrels.speedMul = this.speedMul;
    this.barrels.ladderChance = Math.min(0.5, BARREL.ladderChance + 0.05 * this.loop);
    this.particles.clear();
    this.clearFires();
    this.obstacles.reset(fresh);
    this.hazards.reset();
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
    this.spawnCrawlers();
    this.spawnTotems();
    this.hud.setBonus(this.bonus);
    this.hud.setRound(this.round);
    const when = this.time === 'day' ? '' : ` · ${this.time === 'dusk' ? 'Dusk' : 'Night'}`;
    const tip = def.tip && this.loop === 0 ? ` · ${def.tip}` : '';
    this.hud.banner(
      `Round ${this.round}`,
      READY_TIME * 1000 + (tip ? 900 : 0),
      `Level ${this.levelIndex + 1} · ${levelTitle(def.name)}${when}${tip}`,
    );
    this.emit({ type: 'roundStart', level: this.levelIndex + 1, levelName: def.name, round: this.round });
    this.setState('ready');
  }

  private spawnCrawlers(): void {
    this.crawlerLayer.clear();
    const look = SKINS[this.level.def.skin].crawler;
    const speed = CRAWLER.speed * this.speedMul;
    this.crawlers = (this.level.def.crawlers ?? []).map((p) => new Crawler(this.level, p, look, speed));
    for (const c of this.crawlers) this.crawlerLayer.add(c.group);
  }

  private spawnTotems(): void {
    this.totemLayer.clear();
    const speed = TOTEM.speed * this.speedMul;
    const look = SKINS[this.level.def.skin].totem;
    this.totems = (this.level.def.totems ?? []).map((p) => new Totem(this.level, p, speed, look));
    for (const t of this.totems) this.totemLayer.add(t.group);
  }

  private get lettersHeld(): boolean[] {
    return (['letter-1', 'letter-u', 'letter-p'] as const).map((type) =>
      this.items.some((it) => it.type === type && it.collected),
    );
  }

  private get relicsLeft(): number {
    return this.items.filter((it) => it.type === 'relic' && !it.collected).length;
  }

  private onHazards(events: HazardEvents): void {
    if (events.cracked) sfx.crack();
    for (const s of events.shattered) {
      this.particles.burst(s.at.x, s.at.y, s.at.z, s.colors, 10, 3);
      sfx.shatter();
    }
    if (events.erupted.some((at) => at.distanceTo(this.player.position) < 9)) sfx.jet();
  }

  private spawnItems(): void {
    this.itemLayer.clear();
    this.items = this.level.def.items.map((spawn, i) => new Item(this.level, spawn.type, spawn.spot, i));
    orbSpots(this.level).forEach((spot, i) => this.items.push(new Item(this.level, 'orb', spot, i)));
    for (const item of this.items) this.itemLayer.add(item.group);
    this.hud.setLetters(this.lettersHeld);
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

    this.combo.update(dt);
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
      if (result.grabbed) sfx.climb();
      if (result.bounced) {
        sfx.spring();
        this.obstacles.boing(this.player.ring, this.player.s);
      }
      if (result.blockedLadder >= 0) this.lockHint(result.blockedLadder);
      if (result.hammerBlocked) this.hint("Can't climb holding the hammer");
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
      for (const c of this.crawlers) c.update(h, env);
      for (const t of this.totems) {
        t.update(h, env);
        if (t.landed) this.onTotemLanded(t);
      }
      this.onHazards(this.hazards.update(h, this.player));
      const events = this.obstacles.update(h, { ring: this.player.ring, s: this.player.s, grounded: this.player.grounded });
      if (events.crumbled) sfx.crumble();
      if (events.switched) {
        sfx.switch();
        this.popupAtPlayer('Gate open!');
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
    if (kind === 'relics') {
      const left = this.relicsLeft;
      const name = SKINS[this.level.def.skin].relic.name;
      this.hint(`Sealed · ${left} ${name}${left === 1 ? '' : 's'} to go!`);
      return;
    }
    this.hint(kind === 'key' ? 'Locked · Find the key!' : 'Gated · Find the switch!');
  }

  private popupAtPlayer(text: string): void {
    const p = this.player.position;
    this.popup(text, p.x, p.y + 2.2, p.z);
  }

  private hitsPlayer(x: number, y: number, z: number, r: number): boolean {
    const p = this.player.position;
    return sphereHitsCylinder(x, y, z, r, p.x, p.y, p.z, PLAYER_SIZE.halfWidth, PLAYER_SIZE.height);
  }

  private smash(
    target: SmashTarget,
    x: number,
    y: number,
    z: number,
    points: number,
    colors: readonly number[] = SPLINTERS,
  ): void {
    this.particles.burst(x, y, z, colors, 14, 5);
    this.addScore(points, new THREE.Vector3(x, y, z), 0.8);
    this.hitStop(0.06, 0.35);
    sfx.smash();
    this.emit({ type: 'smash', target });
  }

  private checkCollisions(): void {
    const p = this.player;
    const pp = p.position;
    const R = BARREL.radius;
    const armed = p.hasHammer;

    for (const b of this.barrels.barrels) {
      if (b.done || b.state === 'sink') continue;
      const br = b.radius;
      const cy = barrelCentreY(b);
      if (this.hitsPlayer(b.pos.x, cy, b.pos.z, br * 0.8)) {
        if (!armed) return this.die();
        this.barrels.smash(b);
        this.smash('barrel', b.pos.x, cy, b.pos.z, SCORE.smashBarrel, PROJECTILES[b.look].burst);
        continue;
      }
      const clearedAbove =
        p.state === 'air' &&
        b.state === 'roll' &&
        b.ring === p.ring &&
        Math.hypot(pp.x - b.pos.x, pp.z - b.pos.z) < 0.7 &&
        pp.y > cy + br - 0.1 &&
        pp.y - b.pos.y < 2.4;
      if (!b.scored && clearedAbove) {
        b.scored = true;
        // Bigger projectiles are riskier to clear, so they pay more: a full-size snowball pays 200.
        this.addJumpScore(Math.round((SCORE.jumpBarrel * (br / R)) / 50) * 50, b.pos, 1.4);
      }
    }

    for (const d of this.barrels.dangers) {
      if (this.hitsPlayer(d.x, d.y, d.z, d.r)) return this.die();
    }

    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      if (!this.hitsPlayer(f.position.x, f.position.y, f.position.z, FIRE.radius)) continue;
      if (!armed) return this.die();
      this.fireLayer.remove(f.group);
      this.fires.splice(i, 1);
      this.smash('fire', f.position.x, f.position.y, f.position.z, SCORE.smashFire);
    }

    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const g = this.ghosts[i];
      if (!this.hitsPlayer(g.position.x, g.position.y, g.position.z, GHOST.radius)) continue;
      if (!armed) return this.die();
      this.ghostLayer.remove(g.group);
      this.ghosts.splice(i, 1);
      this.smash('ghost', g.position.x, g.position.y, g.position.z, SCORE.smashGhost);
    }

    for (let i = this.crawlers.length - 1; i >= 0; i--) {
      const c = this.crawlers[i];
      const cp = c.position;
      if (this.hitsPlayer(cp.x, cp.y, cp.z, c.radius)) {
        if (!armed) return this.die();
        this.crawlerLayer.remove(c.group);
        this.crawlers.splice(i, 1);
        this.smash('crawler', cp.x, cp.y, cp.z, SCORE.smashCrawler);
        continue;
      }
      if (p.grounded) c.scored = false;
      const floor = c.group.position.y;
      const clearedAbove =
        p.state === 'air' && c.ring === p.ring && Math.hypot(pp.x - cp.x, pp.z - cp.z) < 0.8 && pp.y > floor + c.height - 0.1;
      if (!c.scored && clearedAbove) {
        c.scored = true;
        this.addJumpScore(SCORE.jumpCrawler, cp, 1.2);
      }
    }

    for (let i = this.totems.length - 1; i >= 0; i--) {
      const t = this.totems[i];
      const tp = t.position;
      if (this.hitsPlayer(tp.x, tp.y, tp.z, t.radius) || this.hitsPlayer(t.head.x, t.head.y, t.head.z, t.radius)) {
        if (!armed) return this.die();
        this.totemLayer.remove(t.group);
        this.totems.splice(i, 1);
        this.smash('totem', tp.x, tp.y, tp.z, SCORE.smashTotem);
        continue;
      }
      const floor = this.level.tierTop(t.ring);
      const passedUnder =
        t.airborne && t.ring === p.ring && Math.hypot(pp.x - tp.x, pp.z - tp.z) < 0.5 && pp.y + PLAYER_SIZE.height < floor + t.clearance;
      if (!t.scored && passedUnder) {
        t.scored = true;
        this.addJumpScore(SCORE.underTotem, pp, 2);
        this.emit({ type: 'underTotem' });
      }
    }

    for (const d of this.hazards.dangers) {
      if (this.hitsPlayer(d.x, d.y, d.z, d.r)) return this.die();
    }

    for (const item of this.items) {
      const c = item.position;
      if (!item.collected && this.hitsPlayer(c.x, c.y, c.z, ITEM_RADIUS)) this.collect(item);
    }
  }

  private onTotemLanded(t: Totem): void {
    const g = t.group.position;
    this.particles.burst(g.x, g.y + 0.1, g.z, [COLORS.cream, COLORS.creamDark, COLORS.charcoal], 8, 3);
    const near = t.group.position.distanceTo(this.player.position);
    if (near < 10) {
      sfx.stomp();
      if (this.state === 'playing') this.stage.shake(0.25 * (1 - near / 10));
    }
  }

  private collectLetter(item: Item): void {
    const c = item.position;
    this.particles.burst(c.x, c.y, c.z, [COLORS.yellow, COLORS.orange, COLORS.cream], 14, 4);
    const held = this.lettersHeld;
    this.hud.setLetters(held);
    if (held.every(Boolean)) {
      this.lives = Math.min(GAME_RULES.maxLives, this.lives + 1);
      this.hud.setLives(this.lives);
      this.addScore(SCORE.spelled);
      this.popup('1-U-P! extra life', c.x, c.y + 0.8, c.z);
      this.particles.burst(c.x, c.y, c.z, RAINBOW, 30, 6);
      sfx.spelled();
      this.emit({ type: 'spelled' });
      return;
    }
    this.addScore(SCORE.letter);
    this.popup(`${LETTER_CHARS[item.type]} · ${held.filter(Boolean).length}/3`, c.x, c.y + 0.6, c.z);
    sfx.letter();
  }

  private collect(item: Item): void {
    item.collected = true;
    this.itemLayer.remove(item.group);
    const c = item.position;
    if (LETTER_CHARS[item.type]) return this.collectLetter(item);
    switch (item.type) {
      case 'orb':
        this.addScore(SCORE.orb, c, 0.4);
        this.particles.burst(c.x, c.y, c.z, [COLORS.cream, COLORS.cyan, COLORS.pink], 10, 3);
        sfx.orb();
        break;
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
        this.popup('1-Up!', c.x, c.y + 0.6, c.z);
        this.particles.burst(c.x, c.y, c.z, [COLORS.grass, COLORS.cream, COLORS.grassDark], 16, 4);
        sfx.oneUp();
        break;
      case 'hammer':
        this.hammerTime = HAMMER.duration;
        this.player.setHammer(true);
        music.setHammer(true);
        this.popup('Hammer!', c.x, c.y + 0.6, c.z);
        this.particles.burst(c.x, c.y, c.z, [COLORS.charcoal, COLORS.yellow], 12, 4);
        sfx.hammer();
        this.emit({ type: 'hammer' });
        break;
      case 'key':
        this.obstacles.unlockKeyDoors();
        this.popup('Door unlocked!', c.x, c.y + 0.6, c.z);
        this.particles.burst(c.x, c.y, c.z, [COLORS.yellow, COLORS.cream], 16, 4);
        sfx.unlock();
        break;
      case 'relic': {
        this.addScore(SCORE.relic);
        this.particles.burst(c.x, c.y, c.z, [COLORS.gold, COLORS.yellow, COLORS.cream], 16, 4);
        const left = this.relicsLeft;
        const total = this.items.filter((it) => it.type === 'relic').length;
        if (left === 0 && this.obstacles.unlockRelicDoors()) {
          this.popup('Summit unsealed!', c.x, c.y + 0.6, c.z);
          sfx.unlock();
        } else {
          this.popup(`${levelTitle(SKINS[this.level.def.skin].relic.name)} ${total - left}/${total}`, c.x, c.y + 0.6, c.z);
          sfx.relic();
        }
        break;
      }
    }
  }

  private addScore(points: number, at?: THREE.Vector3, lift = 0): void {
    this.score += points;
    this.hud.setScore(this.score);
    this.emit({ type: 'score', score: this.score });
    if (this.score > this.hiScore) {
      this.hiScore = this.score;
      this.hud.setHi(this.hiScore);
    }
    if (at) this.popup(`${points} pt`, at.x, at.y + lift, at.z);
  }

  /** Jump-overs chain into a combo: each one within the window multiplies its points. */
  private addJumpScore(base: number, at: THREE.Vector3, lift: number): void {
    const mult = this.combo.hit();
    const points = base * mult;
    this.addScore(points);
    this.popup(mult > 1 ? `${points} pt x${mult}` : `${points} pt`, at.x, at.y + lift, at.z);
    sfx.score(mult);
    if (mult > 1) this.emit({ type: 'combo', multiplier: mult });
  }

  private hitStop(seconds: number, shake: number): void {
    this.freeze = Math.max(this.freeze, seconds);
    this.stage.shake(shake);
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
    this.combo.reset();
    this.hitStop(0.12, 0.6);
    this.lives -= 1;
    this.hud.setLives(this.lives);
    this.emit({ type: 'lifeLost' });
    const pp = this.player.position;
    this.particles.burst(pp.x, pp.y + 0.8, pp.z, [COLORS.orange, COLORS.cyan, COLORS.yellow], 18, 5);
    if (fell) sfx.fall();
    else sfx.hit();
  }

  private clearRound(): void {
    this.setState('clear');
    for (const b of this.barrels.barrels) {
      this.particles.burst(b.pos.x, b.pos.y + b.radius, b.pos.z, RAINBOW, 8, 4);
    }
    this.barrels.clear();
    this.clearFires();
    this.particles.burst(this.goalBase.x, this.goalBase.y, this.goalBase.z, RAINBOW, 30, 7);
    sfx.clear();
    this.hud.banner('Round clear!', CLEAR_TIME * 1000, `Bonus ${this.bonus}`);
    this.emit({ type: 'roundClear', levelName: this.level.def.name, round: this.round, time: this.time });
  }

  private updateClear(dt: number): void {
    if (this.bonus > 0 && this.stateTime > 0.6) {
      const chunk = Math.min(this.bonus, Math.ceil(dt * 5000));
      this.bonus -= chunk;
      this.addScore(chunk);
      this.hud.setBonus(this.bonus);
      this.hud.setBannerSub(`Bonus ${this.bonus}`);
    }
    if (this.stateTime >= CLEAR_TIME) {
      this.round += 1;
      this.startRound(true);
    }
  }

  private gameOver(): void {
    sfx.gameOver();
    this.emit({ type: 'gameOver', score: this.score });
    if (this.practice || insertionIndex(this.board, this.score) === null) return this.showGameOver(null);
    const known = loadPlayerName();
    if (known && bestFor(this.board, known) >= this.score) {
      return this.showGameOver(this.board.findIndex((entry) => entry.name === known));
    }
    this.initials = [...(known ?? 'AAA')];
    this.initialCursor = 0;
    this.returning = known !== null;
    this.setState('initials');
    this.hud.showInitials(this.initials, this.initialCursor, this.score, this.returning);
  }

  /** Three-letter name entry. Up/down cycles a slot, left/right moves, typing fills it. */
  private editInitials(): void {
    let changed = false;
    if (this.input.consume('ArrowLeft')) {
      this.initialCursor = (this.initialCursor + 2) % 3;
      changed = true;
    } else if (this.input.consume('ArrowRight')) {
      this.initialCursor = (this.initialCursor + 1) % 3;
      changed = true;
    }

    if (this.input.consume('ArrowUp')) {
      this.initials[this.initialCursor] = cycleLetter(this.initials[this.initialCursor], 1);
      changed = true;
    } else if (this.input.consume('ArrowDown')) {
      this.initials[this.initialCursor] = cycleLetter(this.initials[this.initialCursor], -1);
      changed = true;
    }

    for (const letter of this.input.consumeLetters()) {
      this.initials[this.initialCursor] = letter;
      if (this.initialCursor < 2) this.initialCursor += 1;
      changed = true;
    }

    if (this.input.consume('Backspace') && this.initialCursor > 0) {
      this.initialCursor -= 1;
      changed = true;
    }

    if (this.input.consume('Space') || this.input.consume('Enter') || this.input.consume('NumpadEnter')) {
      if (this.savingScore) return;
      this.savingScore = true;
      const name = this.initials.join('');
      savePlayerName(name);
      void this.commitScore(name);
      return;
    }

    if (changed) {
      sfx.land();
      this.hud.showInitials(this.initials, this.initialCursor, this.score, this.returning);
    }
  }

  /** Replaces the title table with the shared one once the server answers. */
  private async refreshBoard(): Promise<void> {
    const board = await syncBoard();
    if (!board) return;
    this.board = board;
    this.hiScore = topScore(board);
    this.hud.setHi(this.hiScore);
    if (this.state === 'title') this.hud.showTitle(this.board);
  }

  /** Writes the score to the shared table, and to this browser if the server can't be reached. */
  private async commitScore(name: string): Promise<void> {
    try {
      const remote = await submitScore(name, this.score);
      const placed = remote ?? insertScore(this.board, name, this.score);
      if (!placed) {
        this.emit({ type: 'scoreSaved', rank: null });
        this.showGameOver(null);
        return;
      }
      this.board = placed.board;
      saveBoard(this.board);
      this.hiScore = topScore(this.board);
      this.hud.setHi(this.hiScore);
      if (placed.improved) sfx.score();
      this.emit({ type: 'scoreSaved', rank: placed.index });
      this.showGameOver(placed.index);
    } finally {
      this.savingScore = false;
    }
  }

  private showGameOver(highlight: number | null): void {
    this.setState('gameover');
    this.hud.showGameOver(this.score, this.board, highlight);
  }

  private pause(): void {
    this.setState('paused');
    this.hud.showMessage(
      'Paused',
      this.onQuit
        ? byInput('P resumes · Q quits', 'Tap II to resume', 'Start resumes · Y quits')
        : byInput('Press P to resume', 'Tap II to resume', 'Press start to resume'),
    );
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
    this.cascades?.update(dt);

    this.goal.rotation.y += dt * (this.state === 'clear' ? 12 : 1.6);
    this.goal.position.y = this.goalBase.y + Math.sin(this.clock * 2) * 0.15;

    const showcase = this.state === 'title' || this.state === 'gameover' || this.state === 'initials';
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
const SPLINTERS = [COLORS.cream, COLORS.yellow, COLORS.orange];

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

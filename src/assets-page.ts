import './assets-page.css';
import * as THREE from 'three';
import { SkyCritters } from './background';
import { COLORS } from './config';
import { PROJECTILES } from './entities/projectiles';
import type { ProjectileLook } from './levels/skins';
import { Boss } from './entities/boss';
import { Crawler } from './entities/crawler';
import { Fire } from './entities/fire';
import { Ghost } from './entities/ghost';
import { Item, makeLetter } from './entities/items';
import { Player } from './entities/player';
import { Totem } from './entities/totem';
import { TOTEM_NAMES } from './entities/totemLooks';
import { Frame } from './frame';
import { castleMonster, rainbowBanner, rainbowTrail, steppedCloud } from './posterScenery';
import { dropParts, jetParts, ledgeParts } from './hazards';
import { Level } from './level';
import { LEVELS } from './levels/defs';
import type { CrawlerLook, DecorKind, DropLook, TotemLook } from './levels/skins';
import type { SkinName } from './levels/types';
import { springParts } from './obstacles';
import {
  makeBarrelCapTexture,
  makeBarrelSideTexture,
  makeCascadeTexture,
  makeConveyorTexture,
  makeOneUpTexture,
} from './textures';
import { box, VoxelBuilder } from './voxel';
import { buildDecorPiece } from './world';

const level = new Level(LEVELS[0]);
const spot = { ring: 0, side: 0, offset: 0 };

function rest(object: THREE.Object3D): void {
  object.position.set(0, 0, 0);
  object.rotation.set(0, 0.45, 0);
  object.updateMatrixWorld(true);
}

function baked(fill: (vb: VoxelBuilder) => void, glowing = false): THREE.Group {
  const vb = new VoxelBuilder();
  fill(vb);
  return vb.build(glowing);
}

function block(vb: VoxelBuilder, x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number): void {
  vb.box(x, y + sy / 2, z, sx, sy, sz, color);
}

function ladder(): THREE.Group {
  return baked((vb) => {
    vb.box(-0.32, 1.5, 0, 0.1, 3, 0.1, COLORS.yellow);
    vb.box(0.32, 1.5, 0, 0.1, 3, 0.1, COLORS.yellow);
    for (let y = 0.35; y < 2.8; y += 0.42) vb.box(0, y, 0, 0.6, 0.08, 0.08, COLORS.cream);
  });
}

function chute(): THREE.Group {
  return baked((vb) => {
    block(vb, 0, 0, -1.2, 1.2, 0.06, 0.9, COLORS.yellow);
    block(vb, 0, 0, -0.4, 1.2, 0.06, 0.6, COLORS.pink);
    block(vb, 0, -0.35, 0.3, 1.2, 0.3, 0.6, COLORS.yellow);
    block(vb, 0, -0.95, 0.75, 1.2, 0.3, 0.5, COLORS.pink);
  });
}

function drum(): THREE.Group {
  return baked((vb) => {
    block(vb, 0, 0, 0, 1, 1.2, 1, COLORS.pink);
    vb.box(0, 0.3, 0, 1.04, 0.1, 1.04, COLORS.black);
    vb.box(0, 0.9, 0, 1.04, 0.1, 1.04, COLORS.black);
    block(vb, -0.2, 1.2, 0.1, 0.28, 0.4, 0.28, COLORS.orange);
    block(vb, 0.18, 1.2, -0.12, 0.22, 0.6, 0.22, COLORS.yellow);
    block(vb, 0.04, 1.2, 0.25, 0.18, 0.28, 0.18, COLORS.red);
  });
}

function spikes(): THREE.Group {
  return baked((vb) => {
    vb.box(0, -0.5, 0, 2.2, 0.3, 1.2, COLORS.charcoal);
    for (const x of [-0.7, 0, 0.7]) vb.cone(x, -0.35, 0, 0.2, 0.6, x === 0 ? COLORS.cream : COLORS.creamDark);
  });
}

function lantern(): THREE.Group {
  return baked((vb) => {
    vb.box(0, 0.5, 0, 0.08, 1.1, 0.08, COLORS.charcoal);
    vb.box(0, 0.9, 0.18, 0.34, 0.06, 0.34, COLORS.charcoal);
    vb.glow(0, 0.72, 0.18, 0.26, 0.3, 0.26, COLORS.yellow);
  }, true);
}

function balloon(): THREE.Group {
  return baked((vb) => {
    vb.glow(0, 2.2, 0, 1.2, 1.4, 1.2, COLORS.red);
    vb.glow(0, 2.3, 0, 1.4, 0.9, 1.4, COLORS.red);
    vb.box(-0.25, 2.55, 0.71, 0.3, 0.3, 0.02, 0xffffff);
    vb.box(0, 1.4, 0, 0.3, 0.2, 0.3, COLORS.red);
    vb.box(0, 0.5, 0, 0.04, 1.6, 0.04, COLORS.charcoal);
  }, true);
}

function tower(): THREE.Group {
  return baked((vb) => {
    const height = 7;
    for (let y = 0; y < height; y++) {
      for (let ix = 0; ix < 3; ix++) {
        for (let iz = 0; iz < 3; iz++) {
          if (ix === 1 && iz === 1) continue;
          const isWindow = (ix === 1 || iz === 1) && y % 3 === 1 && y < height - 2;
          const color = isWindow ? COLORS.pink : (ix + iz + y) % 2 ? COLORS.creamDark : COLORS.cream;
          if (isWindow) vb.glow(ix - 1, y + 0.5, iz - 1, 1, 1, 1, color);
          else vb.box(ix - 1, y + 0.5, iz - 1, 1, 1, 1, color);
        }
      }
    }
    vb.cone(-0.8, height, 0, 0.45, 1.7, COLORS.cream);
    vb.cone(0.8, height, 0, 0.45, 1.7, COLORS.cream);
    vb.box(-0.6, height - 1.2, 1.52, 0.5, 0.5, 0.05, COLORS.pink);
    vb.box(0.6, height - 1.2, 1.52, 0.5, 0.5, 0.05, COLORS.pink);
  }, true);
}

function cloud(): THREE.Group {
  return baked((vb) => {
    const puffs: [number, number, number, number][] = [
      [0, 0.4, 0, 1.3],
      [-0.9, 0.2, 0.2, 1],
      [0.85, 0.15, -0.15, 0.95],
      [0.2, 0.7, 0.3, 0.8],
    ];
    for (const [x, y, z, s] of puffs) vb.box(x, y, z, s, s * 0.8, s, COLORS.cream);
  });
}

/** Poster scenery is authored facing the pyramid (-v); side 2 turns that towards this camera. */
const facingViewer = () => new Frame(2, 0, 0);
const fixedRand = () => 0.45;

function picketFence(): THREE.Group {
  return baked((vb) => {
    for (let i = 0; i <= 8; i++) {
      const x = -1.2 + i * 0.3;
      block(vb, x, 0, 0, 0.08, 0.42, 0.06, COLORS.cream);
      block(vb, x, 0.42, 0, 0.05, 0.06, 0.05, COLORS.cream);
    }
    vb.box(0, 0.14, 0, 2.4, 0.05, 0.03, COLORS.creamDark);
    vb.box(0, 0.32, 0, 2.4, 0.05, 0.03, COLORS.creamDark);
    vb.box(0, -0.15, 0, 2.8, 0.3, 0.8, COLORS.grass);
  });
}

function neonPanel(): THREE.Group {
  return baked((vb) => {
    const palette = [COLORS.neon, COLORS.pink, COLORS.magenta, COLORS.violet];
    for (let y = 0; y < 4; y++) for (let x = -1.5; x <= 1.5; x++) vb.box(x, 3.5 - y, 0, 1, 1, 1, palette[y]);
    for (let x = -1; x <= 1; x++) vb.glow(x, 2, 0.55, 0.12, 3.9, 0.1, 0xffb3ec);
  }, true);
}

function baseSpikes(): THREE.Group {
  return baked((vb) => {
    for (let x = -1.5; x <= 1.5; x++) {
      vb.box(x, 0.5, 0, 1, 1, 1, [COLORS.red, COLORS.orange, COLORS.yellow, COLORS.grass][x + 1.5]);
      vb.spike(x, 0, 0, 1.35, 0.8 + ((x + 2) % 3) * 0.6, x % 2 ? COLORS.black : COLORS.charcoal);
    }
  });
}

function cascade(kind: 'rainbow' | 'water'): THREE.Group {
  const g = new THREE.Group();
  const texture = makeCascadeTexture(kind);
  texture.repeat.set(1, 0.8);
  const fall = new THREE.Mesh(new THREE.PlaneGeometry(kind === 'rainbow' ? 2.1 : 1.6, 3.2), new THREE.MeshBasicMaterial({ map: texture }));
  fall.position.set(0, 1.6, 0.52);
  g.add(fall, box(2.8, 3.2, 1, COLORS.stoneDark, 0, 1.6, 0));
  return g;
}

function scenery(fill: (vb: VoxelBuilder) => void): THREE.Group {
  return baked(fill, true);
}

const DECOR_NAMES: [DecorKind, string][] = [
  ['tree', 'tree'],
  ['pine', 'pine'],
  ['pot', 'flower pot'],
  ['arcade', 'arcade'],
  ['cart', 'cart'],
  ['cactus', 'cactus'],
  ['palm', 'palm'],
  ['lollipop', 'lollipop'],
  ['maple', 'maple'],
  ['pumpkin', 'pumpkin'],
  ['haystack', 'haystack'],
  ['mushroom', 'mushroom'],
  ['snowpine', 'snowy pine'],
  ['snowman', 'snowman'],
  ['iceblock', 'ice block'],
  ['obelisk', 'obelisk'],
  ['urn', 'urn'],
  ['rock', 'rock'],
  ['tiki', 'tiki'],
  ['topiary', 'topiary'],
  ['shrub', 'lime shrub'],
  ['pottree', 'potted tree'],
];

const CRAWLER_NAMES: [CrawlerLook, string][] = [
  ['hedgehog', 'hedgehog'],
  ['penguin', 'penguin'],
  ['snake', 'snake'],
  ['scorpion', 'scorpion'],
];

const DROP_NAMES: [DropLook, string][] = [
  ['acorn', 'acorn'],
  ['icicle', 'icicle'],
  ['spike', 'stalactite'],
  ['lavarock', 'lava rock'],
];

function crawler(look: CrawlerLook): THREE.Group {
  return new Crawler(level, { ring: 0, from: [0, 0], to: [0, 0] }, look, 0).group;
}

function drop(look: DropLook): THREE.Group {
  const g = new THREE.Group();
  g.add(...ledgeParts(look, 2));
  const hanging = new THREE.Group();
  hanging.position.y = -0.35;
  hanging.add(...dropParts(look));
  g.add(hanging);
  return g;
}

function jet(): THREE.Group {
  const g = new THREE.Group();
  const { vent, grille, flame } = jetParts();
  g.add(vent, ...grille, flame);
  return g;
}

function spring(): THREE.Group {
  const g = new THREE.Group();
  const { base, coil } = springParts();
  g.add(base, coil);
  return g;
}

function iceSheet(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(3, 0.05, 2.2, COLORS.ice, 0, 0.025, 0, { opacity: 0.85 }), box(0.5, 0.02, 0.06, COLORS.snow, -0.8, 0.06, 0.4));
  g.add(box(0.3, 0.02, 0.06, COLORS.snow, 0.6, 0.06, -0.5), box(3.2, 0.2, 2.4, COLORS.snowShade, 0, -0.1, 0));
  return g;
}

function relic(levelIndex: number): THREE.Group {
  return new Item(new Level(LEVELS[levelIndex]), 'relic', spot, 0).group;
}

function gate(kind: 'switch' | 'key' | 'relics'): THREE.Group {
  const g = new THREE.Group();
  const color = kind === 'switch' ? COLORS.red : COLORS.pink;
  if (kind === 'switch') {
    g.add(box(0.14, 2, 0.14, color, -0.65, 1, 0), box(0.14, 2, 0.14, color, 0.65, 1, 0));
    for (let y = 0.35; y < 2; y += 0.4) g.add(box(1.3, 0.08, 0.08, COLORS.yellow, 0, y, 0));
    for (let x = -0.33; x <= 0.34; x += 0.33) g.add(box(0.07, 1.9, 0.07, COLORS.yellow, x, 0.95, 0));
  } else if (kind === 'key') {
    g.add(
      box(1.4, 2.2, 0.26, color, 0, 1.1, 0),
      box(1.56, 0.16, 0.34, COLORS.cream, 0, 2.2, 0),
      box(0.3, 0.3, 0.1, COLORS.yellow, 0, 1.2, 0.16),
      box(0.12, 0.3, 0.1, COLORS.yellow, 0, 0.95, 0.16),
    );
  } else {
    g.add(
      box(1.5, 2.3, 0.3, COLORS.teal, 0, 1.15, 0),
      box(1.7, 0.2, 0.4, COLORS.gold, 0, 2.35, 0),
      box(0.2, 2.3, 0.36, COLORS.gold, -0.75, 1.15, 0),
      box(0.2, 2.3, 0.36, COLORS.gold, 0.75, 1.15, 0),
    );
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * 0.38;
      g.add(box(0.24, 0.24, 0.06, COLORS.black, x, 1.5, 0.17), box(0.12, 0.12, 0.08, COLORS.gold, x, 1.5, 0.18));
    }
  }
  return g;
}

function floorSwitch(): THREE.Group {
  const g = new THREE.Group();
  g.add(
    box(0.9, 0.12, 0.9, COLORS.charcoal, 0, 0.06, 0),
    box(0.55, 0.22, 0.55, COLORS.red, 0, 0.23, 0),
    box(0.06, 1.8, 0.06, COLORS.cream, 0, 0.9, -0.9),
    box(0.5, 0.32, 0.04, COLORS.red, 0.27, 1.6, -0.9),
  );
  return g;
}

function platform(): THREE.Group {
  const g = new THREE.Group();
  const width = 2.2;
  const depth = 2.4;
  g.add(
    box(width, 0.3, depth, COLORS.yellow, 0, 0.15, 0),
    box(width + 0.04, 0.12, 0.2, COLORS.pink, 0, 0.04, depth / 2 - 0.1),
    box(width + 0.04, 0.12, 0.2, COLORS.pink, 0, 0.04, -depth / 2 + 0.1),
  );
  return g;
}

function conveyor(): THREE.Group {
  const g = new THREE.Group();
  const texture = makeConveyorTexture();
  texture.repeat.set(3, 1);
  const belt = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ map: texture }));
  belt.scale.set(3, 0.08, 1.6);
  belt.position.y = 0.04;
  g.add(belt, box(3.1, 0.14, 0.12, COLORS.grey, 0, 0.08, 0.86), box(3.1, 0.14, 0.12, COLORS.grey, 0, 0.08, -0.86));
  return g;
}

function skyCritter(): THREE.Group {
  const critters = new SkyCritters(1);
  const flyer = critters.group.children[0];
  flyer.scale.setScalar(1);
  flyer.position.set(0, 0, 0);
  flyer.rotation.set(0, 0, 0);
  return critters.group;
}

const flame = new Fire(level);
flame.group.children[0].scale.setScalar(1);

type Entry = { name: string; object?: THREE.Object3D; image?: CanvasImageSource };

const PROJECTILE_NAMES: Record<ProjectileLook, string> = {
  barrel: 'barrel',
  snowball: 'snowball',
  tumbleweed: 'tumbleweed',
  pumpkin: 'pumpkin',
  lavarock: 'lava rock',
  boulder: 'boulder',
  gumball: 'gumball',
};

const BOSS_NAMES: Record<SkinName, string> = {
  meadow: 'meadow monster',
  candy: 'gummy monster',
  desert: 'sphinx',
  autumn: 'pumpkin brute',
  winter: 'yeti',
  tomb: 'mummy',
  volcano: 'lava golem',
};

/** Shown at its starting size, so the boulder reads as big next to the others. */
function projectile(look: ProjectileLook): THREE.Object3D {
  const spec = PROJECTILES[look];
  const mesh = spec.mesh();
  mesh.scale.setScalar(spec.scale);
  return mesh;
}

const sections: { title: string; cells: Entry[] }[] = [
  {
    title: 'Characters',
    cells: [
      { name: 'player', object: new Player(level).group },
      { name: 'ghost', object: new Ghost(level, level.def.patrols[0], 1).group },
      { name: 'flame', object: flame.group },
      { name: 'sky critter', object: skyCritter() },
    ],
  },
  {
    title: 'Bosses',
    cells: (Object.keys(BOSS_NAMES) as SkinName[]).map((skin) => ({ name: BOSS_NAMES[skin], object: new Boss(skin).group })),
  },
  {
    title: 'Projectiles',
    cells: (Object.keys(PROJECTILES) as ProjectileLook[]).map((look) => ({ name: PROJECTILE_NAMES[look], object: projectile(look) })),
  },
  {
    title: 'Ground monsters',
    cells: [
      ...CRAWLER_NAMES.map(([look, name]) => ({ name, object: crawler(look) })),
    ],
  },
  {
    title: 'Totems',
    cells: (Object.keys(TOTEM_NAMES) as TotemLook[]).map((look) => ({
      name: TOTEM_NAMES[look],
      object: new Totem(level, { ring: 0, from: [0, 0], to: [0, 0] }, 0, look).group,
    })),
  },
  {
    title: 'Pickups',
    cells: [
      { name: 'gem', object: new Item(level, 'gem', spot, 3).group },
      { name: 'hot dog', object: new Item(level, 'hotdog', spot, 0).group },
      { name: 'hammer', object: new Item(level, 'hammer', spot, 0).group },
      { name: 'key', object: new Item(level, 'key', spot, 0).group },
      { name: '1-up', object: new Item(level, 'oneup', spot, 0).group },
      { name: 'pumpkin relic', object: relic(3) },
      { name: 'present relic', object: relic(4) },
      { name: 'golden idol', object: relic(5) },
      { name: 'letter 1', object: makeLetter('1') },
      { name: 'letter U', object: makeLetter('U') },
      { name: 'letter P', object: makeLetter('P') },
      { name: 'bonus orb', object: new Item(level, 'orb', spot, 0).group },
    ],
  },
  {
    title: 'Hazards',
    cells: [
      { name: 'fire jet', object: jet() },
      { name: 'spring pad', object: spring() },
      { name: 'ice sheet', object: iceSheet() },
      ...DROP_NAMES.map(([look, name]) => ({ name, object: drop(look) })),
    ],
  },
  {
    title: 'Stage',
    cells: [
      { name: 'drum', object: drum() },
      { name: 'spikes', object: spikes() },
      { name: 'ladder', object: ladder() },
      { name: 'chute', object: chute() },
      { name: 'conveyor', object: conveyor() },
      { name: 'platform', object: platform() },
      { name: 'switch gate', object: gate('switch') },
      { name: 'key door', object: gate('key') },
      { name: 'relic seal', object: gate('relics') },
      { name: 'floor switch', object: floorSwitch() },
      { name: 'picket fence', object: picketFence() },
      { name: 'neon ribbed wall', object: neonPanel() },
      { name: 'base spikes', object: baseSpikes() },
      { name: 'rainbow cascade', object: cascade('rainbow') },
      { name: 'waterfall', object: cascade('water') },
    ],
  },
  {
    title: 'Scenery',
    cells: [
      ...DECOR_NAMES.map(([kind, name]) => ({ name, object: buildDecorPiece(kind) })),
      { name: 'lantern', object: lantern() },
      { name: 'balloon', object: balloon() },
      { name: 'tower', object: tower() },
      { name: 'cloud', object: cloud() },
      { name: 'stepped cloud', object: scenery((vb) => steppedCloud(vb, facingViewer(), 0, 4, fixedRand)) },
      { name: 'rainbow banner', object: scenery((vb) => rainbowBanner(vb, facingViewer(), 0, 'D', fixedRand)) },
      { name: 'rainbow trail', object: scenery((vb) => rainbowTrail(vb, facingViewer(), 0, fixedRand)) },
      { name: 'castle monster', object: scenery((vb) => castleMonster(vb, facingViewer(), 0, 20)) },
    ],
  },
  {
    title: 'Painted textures',
    cells: [
      { name: '1-up face', image: makeOneUpTexture().image },
      { name: 'barrel side', image: makeBarrelSideTexture().image },
      { name: 'barrel cap', image: makeBarrelCapTexture().image },
      { name: 'conveyor mark', image: makeConveyorTexture().image },
      { name: 'rainbow cascade', image: makeCascadeTexture('rainbow').image },
      { name: 'waterfall', image: makeCascadeTexture('water').image },
    ],
  },
];

const VIEW_W = 440;
const VIEW_H = 360;
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(1);
renderer.setSize(VIEW_W, VIEW_H, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xfff6df, 0xb7d98a, 1.15));
const sun = new THREE.DirectionalLight(0xffffff, 1.7);
sun.position.set(3, 7, 5);
scene.add(sun);
const camera = new THREE.PerspectiveCamera(30, VIEW_W / VIEW_H, 0.05, 200);

function paintObject(object: THREE.Object3D, canvas: HTMLCanvasElement): void {
  rest(object);
  scene.add(object);
  object.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(object);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z, 0.25) * 0.62;
  const distance = radius / Math.sin((camera.fov * Math.PI) / 360);
  camera.position.copy(center).add(new THREE.Vector3(0.72, 0.58, 1).normalize().multiplyScalar(distance * 1.08));
  camera.lookAt(center);
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  scene.remove(object);
  canvas.getContext('2d')?.drawImage(renderer.domElement, 0, 0);
}

function paintImage(image: CanvasImageSource, canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const iw = 'width' in image ? Number(image.width) : VIEW_W;
  const ih = 'height' in image ? Number(image.height) : VIEW_H;
  const fit = Math.min(VIEW_W / iw, VIEW_H / ih) * 0.86;
  const dw = iw * fit;
  const dh = ih * fit;
  ctx.drawImage(image, (VIEW_W - dw) / 2, (VIEW_H - dh) / 2, dw, dh);
}

const root = document.querySelector('#sheet');
if (!root) throw new Error('Missing #sheet');

for (const section of sections) {
  const blockEl = document.createElement('section');
  const heading = document.createElement('h2');
  heading.textContent = section.title.toUpperCase();
  const grid = document.createElement('div');
  grid.className = 'grid';
  for (const cell of section.cells) {
    const card = document.createElement('figure');
    card.className = 'card';
    const canvas = document.createElement('canvas');
    canvas.width = VIEW_W;
    canvas.height = VIEW_H;
    if (cell.object) paintObject(cell.object, canvas);
    else if (cell.image) paintImage(cell.image, canvas);
    const caption = document.createElement('figcaption');
    caption.textContent = cell.name;
    card.append(canvas, caption);
    grid.append(card);
  }
  blockEl.append(heading, grid);
  root.append(blockEl);
}

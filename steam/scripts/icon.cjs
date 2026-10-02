// Draws the app icon (the stepped pyramid with the 1-up coin on top) as 32×32 pixel art in the
// game's palette, scaled to a 512px PNG at resources/icon.png. electron-builder makes the .ico
// and .icns from it. Plain Node, so packaging needs no display or image tools.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const GRID = 32;
const SCALE = 16;
const CORNER = 5;

const C = {
  clear: [0, 0, 0, 0],
  sky: [211, 235, 198, 255],
  grass: [155, 210, 60, 255],
  grassDark: [116, 181, 44, 255],
  cream: [244, 241, 230, 255],
  creamDark: [220, 214, 194, 255],
  pink: [255, 47, 122, 255],
  magenta: [216, 27, 96, 255],
  charcoal: [46, 46, 56, 255],
  grey: [69, 69, 79, 255],
  red: [255, 59, 59, 255],
  orange: [255, 154, 31, 255],
  yellow: [255, 210, 58, 255],
  blue: [45, 127, 216, 255],
  purple: [142, 79, 216, 255],
};

const px = Array.from({ length: GRID }, () => Array(GRID).fill(C.sky));
const rect = (x0, y0, x1, y1, color) => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) px[y][x] = color;
};
const checker = (x0, y0, x1, y1, a, b) => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) px[y][x] = (x >> 1) % 2 === (y >> 1) % 2 ? a : b;
};

/** One terrace: a grass lip, a patterned wall, and a darker bottom course. */
function tier(x0, x1, top, height, wallA, wallB, base) {
  rect(x0, top, x1, top, C.grass);
  rect(x0, top + 1, x1, top + 1, C.grassDark);
  checker(x0, top + 2, x1, top + height - 2, wallA, wallB);
  rect(x0, top + height - 1, x1, top + height - 1, base);
}

tier(3, 28, 18, 7, C.pink, C.magenta, C.magenta);
tier(7, 24, 13, 5, C.cream, C.creamDark, C.creamDark);
tier(11, 20, 9, 4, C.charcoal, C.grey, C.charcoal);
[C.red, C.orange, C.yellow, C.grass, C.blue, C.purple].forEach((color, i) => rect(3, 25 + i, 28, 25 + i, color));

// The 1-up coin: a green disc with a cream "1".
for (let y = 2; y <= 8; y++) {
  for (let x = 12; x <= 19; x++) {
    const d = Math.hypot(x - 15.5, y - 5);
    if (d <= 3.6) px[y][x] = d > 2.7 ? C.grassDark : C.grass;
  }
}
rect(16, 3, 16, 7, C.cream);
px[4][15] = C.cream;

// Rounded tile corners.
for (let y = 0; y < GRID; y++) {
  for (let x = 0; x < GRID; x++) {
    const cx = Math.min(Math.max(x + 0.5, CORNER), GRID - CORNER);
    const cy = Math.min(Math.max(y + 0.5, CORNER), GRID - CORNER);
    if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > CORNER) px[y][x] = C.clear;
  }
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

const size = GRID * SCALE;
const raw = Buffer.alloc(size * (size * 4 + 1));
for (let y = 0; y < size; y++) {
  const row = y * (size * 4 + 1);
  for (let x = 0; x < size; x++) {
    Buffer.from(px[Math.floor(y / SCALE)][Math.floor(x / SCALE)]).copy(raw, row + 1 + x * 4);
  }
}
const header = Buffer.alloc(13);
header.writeUInt32BE(size, 0);
header.writeUInt32BE(size, 4);
header.set([8, 6, 0, 0, 0], 8);

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', header),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
const out = path.join(__dirname, '..', 'resources', 'icon.png');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, png);
console.log(`icon: ${path.relative(process.cwd(), out)} (${size}×${size})`);

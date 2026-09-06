/**
 * 產生 PWA 圖示 PNG，不用任何套件：深色底、金色圓、中間一道深色籌碼缺口。
 *   node scripts/make-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function icon(size, maskable) {
  const c = size / 2;
  const radius = size * (maskable ? 0.32 : 0.4);
  const corner = size * 0.18;
  return png(size, (x, y) => {
    // 圓角方形底
    const dx = Math.max(Math.abs(x - c) - (c - corner), 0);
    const dy = Math.max(Math.abs(y - c) - (c - corner), 0);
    const outside = !maskable && Math.hypot(dx, dy) > corner;
    if (outside) return [0, 0, 0, 0];
    const d = Math.hypot(x - c, y - c);
    // 籌碼：金色圓，外圈缺口，中心深色小圓
    if (d < radius * 0.42) return [0x11, 0x13, 0x18, 255];
    if (d < radius) {
      const angle = Math.atan2(y - c, x - c);
      const notch = Math.abs(Math.sin(angle * 3)) > 0.93 && d > radius * 0.8;
      return notch ? [0x11, 0x13, 0x18, 255] : [0xf5, 0xc5, 0x42, 255];
    }
    return [0x11, 0x13, 0x18, 255];
  });
}

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', icon(192, false));
writeFileSync('public/icons/icon-512.png', icon(512, false));
writeFileSync('public/icons/icon-maskable-512.png', icon(512, true));
writeFileSync('public/icons/apple-touch-icon.png', icon(180, true));
console.log('icons written to public/icons');

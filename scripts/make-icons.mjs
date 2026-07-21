// One-shot PWA icon generator — zero deps (built-in zlib). Renders "435" in
// war-paint cyan on the dark theme background as proper PNGs, so the home-screen
// install (Open-Wave remote-access slate) has a legible icon. Re-run any time:
//   node scripts/make-icons.mjs
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

const CRC = (() => {
  const t = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return buf => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
})();

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(CRC(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function png(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit, RGBA
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * stride + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const FONT = { // 5×7 digits
  '3': ['11111', '00001', '00010', '00110', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
};
const BG = [0x0b, 0x0e, 0x13, 0xff], PANEL = [0x16, 0x1d, 0x29, 0xff], FG = [0x4c, 0xc2, 0xff, 0xff];

function icon(size) {
  const buf = Buffer.alloc(size * size * 4);
  const set = (x, y, c) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4; buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = c[3];
  };
  const pad = Math.round(size * 0.1), b = Math.max(2, Math.round(size * 0.04));
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const inPanel = x >= pad && y >= pad && x < size - pad && y < size - pad;
    const onFrame = inPanel && (x < pad + b || y < pad + b || x >= size - pad - b || y >= size - pad - b);
    set(x, y, onFrame ? FG : inPanel ? PANEL : BG);
  }
  const digits = ['4', '3', '5'], cols = 5, rows = 7, gap = 1;
  const cells = digits.length * cols + (digits.length - 1) * gap;
  const scale = Math.floor(size * 0.5 / cells);
  let ox = Math.floor((size - (cells * scale)) / 2);
  const oy = Math.floor((size - rows * scale) / 2);
  for (const d of digits) {
    const g = FONT[d];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (g[r][c] === '1')
      for (let yy = 0; yy < scale; yy++) for (let xx = 0; xx < scale; xx++) set(ox + c * scale + xx, oy + r * scale + yy, FG);
    ox += (cols + gap) * scale;
  }
  return png(size, buf);
}

for (const s of [192, 512]) {
  fs.writeFileSync(path.join(OUT, `icon-${s}.png`), icon(s));
  console.log(`wrote public/icon-${s}.png`);
}

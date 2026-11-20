import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
const [file, ...probes] = process.argv.slice(2);
const buf = readFileSync(file);
let off = 8, w = 0, h = 0, bpp = 4; const idat = [];
while (off < buf.length) {
  const len = buf.readUInt32BE(off); const type = buf.toString('ascii', off + 4, off + 8);
  if (type === 'IHDR') { w = buf.readUInt32BE(off + 8); h = buf.readUInt32BE(off + 12); bpp = buf[off + 17] === 6 ? 4 : 3; }
  if (type === 'IDAT') idat.push(buf.subarray(off + 8, off + 8 + len));
  off += 12 + len;
}
const raw = inflateSync(Buffer.concat(idat));
const stride = w * bpp, out = Buffer.alloc(h * stride);
for (let y = 0; y < h; y++) {
  const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
  for (let x = 0; x < stride; x++) {
    const a = x >= bpp ? out[y * stride + x - bpp] : 0, b = y > 0 ? out[(y - 1) * stride + x] : 0;
    const c = x >= bpp && y > 0 ? out[(y - 1) * stride + x - bpp] : 0; let v = line[x];
    if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
    else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
    out[y * stride + x] = v & 255;
  }
}
for (const probe of probes) {
  const [name, xs, ys] = probe.split(':'); const x = +xs, y = +ys; const i = y * stride + x * bpp;
  console.log(`${name} (${x},${y}) rgb ${out[i]} ${out[i + 1]} ${out[i + 2]}`);
}

import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";

const outDir = path.join(process.cwd(), "electron-tray", "assets");
await fs.mkdir(outDir, { recursive: true });

function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
}

const crcTable = makeCrcTable();
function crc32(buf) {
  let crc = 0xffffffff;
  for (const b of buf) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ b) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  const checksum = crc32(Buffer.concat([typeBuf, data]));
  crc.writeUInt32BE(checksum, 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function createPng(width, height, rgba) {
  const header = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const rows = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 4);
    row[0] = 0;
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      row[1 + x * 4] = rgba[idx];
      row[1 + x * 4 + 1] = rgba[idx + 1];
      row[1 + x * 4 + 2] = rgba[idx + 2];
      row[1 + x * 4 + 3] = rgba[idx + 3];
    }
    rows.push(row);
  }
  const idat = zlib.deflateSync(Buffer.concat(rows));
  return Buffer.concat([header, pngChunk("IHDR", ihdr), pngChunk("IDAT", idat), pngChunk("IEND", Buffer.alloc(0))]);
}

function flatColor(width, height, color) {
  const [r, g, b, a] = color;
  const buf = Buffer.alloc(width * height * 4);
  for (let i = 0; i < buf.length; i += 4) {
    buf[i] = r;
    buf[i + 1] = g;
    buf[i + 2] = b;
    buf[i + 3] = a;
  }
  return buf;
}

const variants = {
  "icon-ok.png": [44, 186, 83, 255],
  "icon-warn.png": [255, 188, 45, 255],
  "icon-error.png": [220, 38, 38, 255]
};
for (const [name, color] of Object.entries(variants)) {
  const png = createPng(16, 16, flatColor(16, 16, color));
  await fs.writeFile(path.join(outDir, name), png);
}
console.log("Generated tray icons.");

/**
 * Lê pixels de um PNG, sem dependência nenhuma.
 *
 * Existe porque a alternativa é confiar no olho, e o olho erra: nesta
 * base já se perdeu meio dia afinando a abertura de uma pálpebra que
 * não estava sendo desenhada, e meia hora achando que um globo ocular
 * furava a silhueta quando ele parava 22 px antes dela. Diante de uma
 * dúvida visual, o caminho curto é medir.
 *
 * PIL não está instalado e não há decodificador de PNG no projeto, daí
 * o inflate na mão. Cobre o que o Chromium produz: 8 bits por canal,
 * RGB ou RGBA, sem entrelaçamento.
 *
 * ## Uso
 *
 * ```sh
 * node tools/pixels.mjs img.png nome:x:y [nome:x:y ...]   # pontos
 * LINHA=378 node tools/pixels.mjs img.png                 # varre uma linha
 * COLUNA=466 node tools/pixels.mjs img.png                # varre uma coluna
 * ```
 *
 * A varredura classifica cada pixel (céu, pele, tecido, grama…) e
 * imprime só as transições: é assim que se mede uma silhueta, a
 * largura de uma abertura ou onde um volume começa.
 */

import { readFileSync } from 'fs';
import zlib from 'zlib';

const arquivo = process.argv[2];
if (!arquivo) {
  console.error('uso: node tools/pixels.mjs <png> [nome:x:y ...]');
  process.exit(1);
}

const buf = readFileSync(arquivo);
let cursor = 8;
let largura = 0;
let altura = 0;
let tipoCor = 6;
const pedacos = [];
while (cursor < buf.length) {
  const tamanho = buf.readUInt32BE(cursor);
  const tipo = buf.toString('ascii', cursor + 4, cursor + 8);
  if (tipo === 'IHDR') {
    largura = buf.readUInt32BE(cursor + 8);
    altura = buf.readUInt32BE(cursor + 12);
    tipoCor = buf[cursor + 17];
  }
  if (tipo === 'IDAT') pedacos.push(buf.subarray(cursor + 8, cursor + 8 + tamanho));
  cursor += tamanho + 12;
}

const canais = tipoCor === 6 ? 4 : 3;
const linha = largura * canais;
const bruto = zlib.inflateSync(Buffer.concat(pedacos));
const px = Buffer.alloc(altura * linha);

// Desfaz os cinco filtros do PNG, linha a linha.
let p = 0;
for (let y = 0; y < altura; y += 1) {
  const filtro = bruto[p];
  p += 1;
  const origem = bruto.subarray(p, p + linha);
  p += linha;
  for (let x = 0; x < linha; x += 1) {
    const a = x >= canais ? px[y * linha + x - canais] : 0;
    const b = y > 0 ? px[(y - 1) * linha + x] : 0;
    const c = x >= canais && y > 0 ? px[(y - 1) * linha + x - canais] : 0;
    let v = origem[x];
    if (filtro === 1) v += a;
    else if (filtro === 2) v += b;
    else if (filtro === 3) v += (a + b) >> 1;
    else if (filtro === 4) {
      const pa = Math.abs(b - c);
      const pb = Math.abs(a - c);
      const pc = Math.abs(a + b - 2 * c);
      v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
    }
    px[y * linha + x] = v & 255;
  }
}

const em = (x, y) => [px[y * linha + x * canais], px[y * linha + x * canais + 1], px[y * linha + x * canais + 2]];

/** Classe grosseira de um pixel, suficiente para achar bordas. */
function classe([r, g, b]) {
  if (b > r + 25 && b > 120) return 'CEU';
  if (g > r + 8 && g > b + 20) return 'GRAMA';
  if (r > 215 && g > 210 && b > 200) return 'TECIDO';
  if (r > 110 && r > b + 22 && g > b) return 'PELE';
  return 'escuro';
}

if (process.env.LINHA || process.env.COLUNA) {
  const fixo = Number(process.env.LINHA ?? process.env.COLUNA);
  const horizontal = process.env.LINHA !== undefined;
  const limite = horizontal ? largura : altura;
  const inicio = Number(process.env.DE || 0);
  let anterior = '';
  for (let i = inicio; i < limite; i += 1) {
    const cor = horizontal ? em(i, fixo) : em(fixo, i);
    const k = classe(cor);
    if (k !== anterior) {
      console.log(`${horizontal ? 'x' : 'y'}=${String(i).padStart(4)} ${k.padEnd(7)} ${cor.join(',')}`);
      anterior = k;
    }
  }
} else {
  for (const alvo of process.argv.slice(3)) {
    const [nome, x, y] = alvo.split(':');
    console.log(nome, em(Number(x), Number(y)).join(','));
  }
}

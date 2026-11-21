/**
 * Assinaturas de malha — a prova de que um marco mexeu só em quem devia.
 *
 * O problema que esta ferramenta resolve apareceu no marco da Haru, e
 * nenhum teste o teria visto. Uma correção de raio caiu no `case`
 * errado e alterou o cabelo **da Akemi**, cujo marco já estava
 * mesclado. A ficha dela não mudou, a contagem de vértices não mudou,
 * a contagem de triângulos não mudou e a suíte inteira continuou
 * verde — só as **posições** de alguns vértices tinham se deslocado
 * meio milímetro.
 *
 * O que pega uma coisa dessas é comparar a malha inteira, vértice por
 * vértice, contra a `main`. É isso que este arquivo faz.
 *
 * Como usar:
 *
 *     git worktree add /tmp/base <commit-da-main>
 *     cp -r node_modules /tmp/base/node_modules
 *     cp tools/assinaturas.ts /tmp/base/tools/
 *     (cd /tmp/base && npx vite-node tools/assinaturas.ts) > /tmp/antes.txt
 *     npx vite-node tools/assinaturas.ts > /tmp/depois.txt
 *     diff /tmp/antes.txt /tmp/depois.txt
 *
 * Cada linha é `chave  assinatura`. Toda chave que mudar de
 * assinatura é uma malha que o marco alterou; se a lista não bater
 * **exatamente** com quem o marco devia tocar, há dano colateral.
 *
 * Duas escolhas importantes:
 *
 *  · a assinatura cobre **todos os atributos** de geometria, não só
 *    `position`. Cor, acabamento, normal, pesos de esqueleto e
 *    índices entram. Uma peça repintada sem sair do lugar é uma
 *    alteração tão involuntária quanto uma peça movida, e a primeira
 *    versão desta conta — que olhava só posição — teria deixado
 *    passar;
 *  · a varredura cobre **as três malhas** do avatar (corpo, rosto,
 *    halo) e enumera o catálogo inteiro peça a peça, não só as fichas
 *    do Panteão. Penteado, traje e acessório são campos
 *    compartilhados com os habitantes sorteados: um marco que mexa em
 *    `curto` ou em `aero` muda gente pelo mundo todo, e amostragem
 *    aleatória pode simplesmente não sortear o estilo afetado.
 */

import * as THREE from 'three';
import { PANTHEON } from '../src/characters/Pantheon';
import { Avatar } from '../src/player/Avatar';
import {
  ACCESSORIES,
  DEFAULT_APPEARANCE,
  HAIR_STYLES,
  OUTFITS,
  randomAppearance,
  type AvatarAppearance,
} from '../src/player/AvatarAppearance';
import type { BODY_DETAIL } from '../src/player/body/BodyRig';
import { createRng } from '../src/utils/math';

type Nivel = keyof typeof BODY_DETAIL;
const NIVEIS: readonly Nivel[] = ['baixa', 'media', 'alta', 'ultra'];

/**
 * Hash de uma geometria inteira.
 *
 * Os atributos entram em ordem alfabética para que a conta não dependa
 * da ordem em que o construtor os registrou, e cada número é
 * arredondado a cinco casas — abaixo disso é ruído de ponto flutuante,
 * acima disso um deslocamento de décimo de milímetro passaria batido.
 */
function assinar(geometry: THREE.BufferGeometry): number {
  let s = 0;
  const comer = (v: number): void => {
    s = (s * 31 + Math.round(v * 1e5)) | 0;
  };
  for (const nome of Object.keys(geometry.attributes).sort()) {
    for (const ch of nome) comer(ch.charCodeAt(0));
    const attr = geometry.getAttribute(nome);
    const arr = attr.array as ArrayLike<number>;
    comer(arr.length);
    for (let i = 0; i < arr.length; i += 1) comer(arr[i]);
  }
  const index = geometry.getIndex();
  if (index) {
    const arr = index.array as ArrayLike<number>;
    comer(arr.length);
    for (let i = 0; i < arr.length; i += 1) comer(arr[i]);
  }
  return s;
}

/** Assina o avatar inteiro: corpo, rosto, halo e o que mais houver. */
function assinarAvatar(appearance: AvatarAppearance, nivel: Nivel): string {
  const avatar = new Avatar({ ...DEFAULT_APPEARANCE, ...appearance });
  avatar.setDetail(nivel);
  const partes: string[] = [];
  avatar.root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    partes.push(`${mesh.name || 'sem-nome'}:${assinar(mesh.geometry)}`);
  });
  // A ordem de travessia é estável, mas ordenar custa nada e remove a
  // dúvida.
  return partes.sort().join(' ');
}

const linhas: string[] = [];
const anotar = (chave: string, appearance: AvatarAppearance): void => {
  for (const nivel of NIVEIS) linhas.push(`${chave} ${nivel} ${assinarAvatar(appearance, nivel)}`);
};

// 1. O Panteão inteiro, com a ficha de cada um.
for (const c of PANTHEON) anotar(`panteao/${c.id}`, c.appearance);

// 2. Cada penteado do catálogo, com o resto no padrão. Pega marco que
//    mexeu num penteado que os habitantes herdam.
for (const h of HAIR_STYLES) anotar(`cabelo/${h}`, { ...DEFAULT_APPEARANCE, hairStyle: h });

// 3. Cada traje. Pega marco que mexeu no `aero` do Criador.
for (const o of OUTFITS) anotar(`traje/${o}`, { ...DEFAULT_APPEARANCE, outfit: o });

// 4. Cada acessório.
for (const a of ACCESSORIES) anotar(`acessorio/${a}`, { ...DEFAULT_APPEARANCE, accessory: a });

// 5. Habitantes sorteados com semente fixa: pega o que a enumeração
//    acima não cobre, que é a **combinação** de campos.
const rng = createRng(20261112);
for (let i = 0; i < 60; i += 1) {
  const ap = randomAppearance(rng);
  linhas.push(`habitante/${String(i).padStart(2, '0')} alta ${assinarAvatar(ap, 'alta')}`);
}

console.log(linhas.join('\n'));
console.error(`${linhas.length} assinaturas`);

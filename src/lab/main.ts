/**
 * Bancada de validação visual — WebGL 2.0 de verdade.
 *
 * Tudo o que o remaster dos personagens mudou (rugosidade por
 * vértice, brilho de tecido, verniz do olho, reflexo do mapa de
 * ambiente, oclusão assada) **não aparece** no rasterizador dos
 * testes: ele é um sombreador difuso simples, que mostra geometria e
 * cor de vértice e mais nada. Durante todo o PR #24 a parte PBR ficou
 * justificada por física e verificada por compilação, nunca vista.
 *
 * Esta página existe para fechar esse buraco. Ela monta a cena com as
 * peças reais do jogo — `Avatar`, `Environment` (relógio, atmosfera,
 * céu, sol, névoa e o PMREM que alimenta os reflexos) e o `Renderer`
 * com o mesmo mapeamento de tons — e não com uma luz improvisada.
 * Uma bancada que iluminasse diferente do jogo não validaria nada.
 *
 * Não entra no build de produção: o Vite só compila `index.html`.
 */

import * as THREE from 'three';
import { Avatar } from '../player/Avatar';
import { AvatarAnimator } from '../player/AvatarAnimator';
import { DEFAULT_APPEARANCE, type AvatarAppearance } from '../player/AvatarAppearance';
import type { BodyDetailLevel } from '../player/body/BodyRig';
import { Environment } from '../world/Environment';
import { CREATURE_DETAIL, buildCreature, type CreatureParts } from '../creatures/CreatureMesh';
import { allSpecies } from '../creatures/Species';
import { QUALITY_LEVELS, profileFor } from '../systems/QualitySystem';

type Mode = 'corpo' | 'rosto' | 'bichos' | 'niveis';

const canvas = document.getElementById('tela') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 1200);
const environment = new Environment(scene, renderer);
environment.applyQuality({
  shadows: { enabled: true, mapSize: 2048, distance: 12 },
  cloudCount: 14,
  cloudDetail: 2,
  viewDistance: 600,
  envUpdateHours: 0.5,
});

// Chão: sem ele não há sombra projetada para julgar, e o reflexo do
// ambiente fica sem nada por baixo.
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(14, 48).rotateX(-Math.PI / 2),
  new THREE.MeshStandardMaterial({ color: 0x8fc07a, roughness: 0.95, metalness: 0 }),
);
ground.receiveShadow = true;
scene.add(ground);

const animator = new AvatarAnimator();
const avatars: Avatar[] = [];
const creatures: CreatureParts[] = [];
const criaturas = new THREE.Group();
scene.add(criaturas);

const ui = {
  modo: 'corpo' as Mode,
  nivel: 'ultra' as BodyDetailLevel,
  roupa: 'vestido' as AvatarAppearance['outfit'],
  bust: 0,
  curve: 0,
  girar: true,
  hora: 10,
};

let angle = 0;
/** Multiplicador de distância da câmera, para aproximar um detalhe. */
let zoom = 1;
/** Deslocamento do alvo, para enquadrar algo fora do centro. */
const alvoOff = new THREE.Vector3();

function limpar(): void {
  for (const a of avatars) {
    scene.remove(a.root);
    a.dispose();
  }
  avatars.length = 0;
  for (const c of creatures) {
    criaturas.remove(c.root);
    for (const m of c.materials) m.dispose();
    for (const g of c.geometries) g.dispose();
  }
  creatures.length = 0;
}

function novoAvatar(nivel: BodyDetailLevel, x: number): Avatar {
  const avatar = new Avatar({ ...DEFAULT_APPEARANCE, outfit: ui.roupa });
  avatar.setDetail(nivel);
  avatar.setShadows(true);
  avatar.setMaterialTier(nivel === 'ultra' || nivel === 'alta');
  avatar.root.position.x = x;
  scene.add(avatar.root);
  avatars.push(avatar);
  return avatar;
}

function montar(): void {
  limpar();
  if (ui.modo === 'niveis') {
    // Os quatro níveis lado a lado, na mesma luz: é a única forma
    // honesta de ver o que o LOD custa em aparência.
    QUALITY_LEVELS.forEach((nivel, i) => novoAvatar(nivel as BodyDetailLevel, (i - 1.5) * 0.85));
  } else if (ui.modo === 'bichos') {
    const porMovimento = new Map<string, ReturnType<typeof allSpecies>[number]>();
    for (const sp of allSpecies()) if (!porMovimento.has(sp.movement)) porMovimento.set(sp.movement, sp);
    [...porMovimento.values()].slice(0, 6).forEach((sp, i) => {
      const parts = buildCreature(sp, 1, CREATURE_DETAIL[ui.nivel]);
      parts.root.position.set((i % 3) * 1.6 - 1.6, 0, Math.floor(i / 3) * 1.6 - 0.8);
      parts.root.traverse((n) => {
        const mesh = n as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        }
      });
      criaturas.add(parts.root);
      creatures.push(parts);
    });
  } else {
    novoAvatar(ui.nivel, 0);
  }
  aplicarMorph();
}

function aplicarMorph(): void {
  for (const a of avatars) a.setMorph(ui.bust, ui.curve);
}

function enquadrar(): void {
  const rosto = ui.modo === 'rosto';
  const largo = ui.modo === 'niveis' || ui.modo === 'bichos';
  // O alvo do rosto fica na linha do nariz, não na dos olhos: era por
  // isso que a boca e o queixo saíam fora do quadro.
  const alvo = new THREE.Vector3(0, rosto ? 1.56 : 0.95, 0);
  const dist = (rosto ? 0.95 : largo ? 6.2 : 3.6) * zoom;
  alvo.add(alvoOff);
  camera.position.set(alvo.x + Math.sin(angle) * dist, alvo.y + (rosto ? 0.04 : 0.35) * zoom, alvo.z + Math.cos(angle) * dist);
  camera.lookAt(alvo);
}

function redimensionar(): void {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width === w && canvas.height === h) return;
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

let last = performance.now();
let elapsed = 0;
const motion = { state: 'idle' as const, speed: 0, stridePhase: 0, verticalSpeed: 0, elapsed: 0 };

function quadro(): void {
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  elapsed += dt;
  if (ui.girar) angle += dt * 0.5;

  environment.clock.setHours(ui.hora);
  environment.update(dt, elapsed, camera.position, new THREE.Vector3(0, 0.9, 0), false);

  motion.elapsed = elapsed;
  const pose = animator.update(dt, motion);
  for (const a of avatars) a.applyPose(pose, dt);

  redimensionar();
  enquadrar();
  renderer.render(scene, camera);
  requestAnimationFrame(quadro);
}

/* ------------------------------ controles ----------------------------- */

function ligar(id: string, fn: (valor: string) => void): void {
  const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
  if (!el) return;
  el.addEventListener('input', () => fn(el.value));
}

ligar('modo', (v) => {
  ui.modo = v as Mode;
  montar();
});
ligar('nivel', (v) => {
  ui.nivel = v as BodyDetailLevel;
  montar();
});
ligar('roupa', (v) => {
  ui.roupa = v as AvatarAppearance['outfit'];
  montar();
});
ligar('bust', (v) => {
  ui.bust = Number(v);
  (document.getElementById('bustv') as HTMLElement).textContent = `${Math.round(ui.bust * 100)}%`;
  aplicarMorph();
});
ligar('curve', (v) => {
  ui.curve = Number(v);
  (document.getElementById('curvev') as HTMLElement).textContent = `${Math.round(ui.curve * 100)}%`;
  aplicarMorph();
});
ligar('hora', (v) => {
  ui.hora = Number(v);
  (document.getElementById('horav') as HTMLElement).textContent = `${ui.hora}h`;
});
document.getElementById('girar')?.addEventListener('click', () => {
  ui.girar = !ui.girar;
});

// Diagnóstico visível: sem isto não há como provar que o contexto é
// WebGL 2 e que o perfil pedido é o que está desenhando.
const gl = renderer.getContext();
const dbg = gl.getExtension('WEBGL_debug_renderer_info');
(document.getElementById('gpu') as HTMLElement).textContent = [
  renderer.capabilities.isWebGL2 ? 'WebGL 2.0' : 'WebGL 1',
  dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : 'renderer desconhecido',
  `perfis: ${QUALITY_LEVELS.map((n) => `${n}→${profileFor(n).characterDetail}${profileFor(n).characterPhysical ? '+pbr' : ''}`).join(' · ')}`,
].join(' — ');

// Alça de depuração: a bancada existe para ser cutucada de fora (o
// capturador automatizado liga e desliga termos para isolar causa).
(window as unknown as { eden: unknown }).eden = {
  scene,
  renderer,
  camera,
  environment,
  avatars,
  ui,
  montar,
  /** Trava a câmera num ângulo exato — comparar dois renders exige o mesmo enquadramento. */
  olhar(a: number) {
    ui.girar = false;
    angle = a;
  },
  /** Aproxima (f < 1) ou afasta (f > 1) a câmera. */
  perto(f: number) {
    zoom = f;
  },
  /** Move o alvo da câmera, para enquadrar algo fora do centro. */
  mirar(x: number, y: number, z: number) {
    alvoOff.set(x, y, z);
  },
};

montar();
quadro();

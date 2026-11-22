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
import * as aftersMorph from '../afters/AftersMorph';
import { getCharacter } from '../characters/Pantheon';
import { Avatar } from '../player/Avatar';
import { AvatarAnimator } from '../player/AvatarAnimator';
import { DEFAULT_APPEARANCE, type AvatarAppearance } from '../player/AvatarAppearance';
import type { BodyDetailLevel } from '../player/body/BodyRig';
import { Environment } from '../world/Environment';
import { CREATURE_DETAIL, buildCreature, type CreatureParts } from '../creatures/CreatureMesh';
import { passoQuadrupede } from '../creatures/WildlifeView';
import type { MotionState } from '../player/PlayerMotor';
import { allSpecies } from '../creatures/Species';
import { QUALITY_LEVELS, profileFor } from '../systems/QualitySystem';

type Mode = 'corpo' | 'rosto' | 'bichos' | 'niveis' | 'elenco' | 'bet' | 'betrampa' | 'deusa';

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
  /** Qual deusa a cena `deusa` monta. */
  deusa: 'luma',
  andando: false,
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

/**
 * O elenco de validação: um cidadão, uma cidadã, cabelo longo, cabelo
 * curto e um corpo com os Afters no máximo. Validar só o avatar padrão
 * esconde justamente o que varia entre personagens.
 */
const ELENCO: readonly { nome: string; aparencia: Partial<AvatarAppearance>; bust?: number; curve?: number }[] = [
  { nome: 'cidadão', aparencia: { hairStyle: 'curto', hairColor: '#2b1d16', outfit: 'casual', skin: '#cf8f63' } },
  { nome: 'cidadã', aparencia: { hairStyle: 'rabo', hairColor: '#8a5a2b', outfit: 'vestido', skin: '#ffe0c8' } },
  { nome: 'cabelo longo', aparencia: { hairStyle: 'longo', hairColor: '#d9a441', outfit: 'aero', skin: '#e8ab82' } },
  { nome: 'cabelo curto', aparencia: { hairStyle: 'espetado', hairColor: '#c0392b', outfit: 'esportivo', skin: '#7d4a2c' } },
  { nome: 'Afters no máximo', aparencia: { hairStyle: 'coque', hairColor: '#2b1d16', outfit: 'vestido', skin: '#f6c9a4' }, bust: 1, curve: 1 },
];

/**
 * Cena BET — os quatro estados que precisam ser comparados lado a lado.
 *
 * Um slider mostra um estado por vez, e comparar dois estados virando o
 * slider é comparar de memória. Aqui os quatro aparecem no mesmo quadro,
 * na mesma luz e no mesmo ângulo, que é a única comparação que vale.
 */
const BET_ESTADOS: readonly { nome: string; bust: number; curve: number }[] = [
  { nome: 'original', bust: 0, curve: 0 },
  { nome: 'AfterBust®', bust: 1.5, curve: 0 },
  { nome: 'AfterCurve®', bust: 0, curve: 1.5 },
  { nome: 'combinado', bust: 1.5, curve: 1.5 },
];

/** Rampa de intensidade: o mesmo corpo em cinco passos do mesmo canal. */
// A matriz de intensidade pedida na validação: 0, 25, 50, 75, 100, 150,
// 200 e 250%, os dois canais juntos.
const BET_RAMPA: readonly number[] = [0, 0.25, 0.5, 0.75, 1, 1.5, 2, 2.5];

/** Tempo de construção do último `montar`, por avatar, em ms. */
const custos: { nome: string; ms: number; verts: number }[] = [];

function novoAvatar(nivel: BodyDetailLevel, x: number, extra?: Partial<AvatarAppearance>): Avatar {
  const t0 = performance.now();
  const avatar = new Avatar({ ...DEFAULT_APPEARANCE, outfit: ui.roupa, ...extra });
  avatar.setDetail(nivel);
  avatar.setShadows(true);
  avatar.setMaterialTier(nivel === 'ultra' || nivel === 'alta');
  avatar.root.position.x = x;
  scene.add(avatar.root);
  avatars.push(avatar);
  const geometry = (avatar as unknown as { body: THREE.Mesh }).body.geometry as THREE.BufferGeometry;
  custos.push({ nome: `${nivel}${extra?.hairStyle ? ' ' + extra.hairStyle : ''}`, ms: performance.now() - t0, verts: geometry.getAttribute('position').count });
  return avatar;
}

function montar(): void {
  limpar();
  custos.length = 0;
  if (ui.modo === 'niveis') {
    // Os quatro níveis lado a lado, na mesma luz: é a única forma
    // honesta de ver o que o LOD custa em aparência.
    QUALITY_LEVELS.forEach((nivel, i) => novoAvatar(nivel as BodyDetailLevel, (i - 1.5) * 0.85));
  } else if (ui.modo === 'elenco') {
    ELENCO.forEach((quem, i) => {
      const avatar = novoAvatar(ui.nivel, (i - 2) * 0.82, quem.aparencia);
      if (quem.bust !== undefined || quem.curve !== undefined) avatar.setMorph(quem.bust ?? 0, quem.curve ?? 0);
    });
  } else if (ui.modo === 'bet') {
    BET_ESTADOS.forEach((estado, i) => {
      const avatar = novoAvatar(ui.nivel, (i - 1.5) * 0.85);
      avatar.setMorph(estado.bust, estado.curve);
    });
  } else if (ui.modo === 'betrampa') {
    // A rampa usa os dois canais juntos: o que se quer ver aqui é a
    // progressão, e progressão de um canal só esconde a interação.
    BET_RAMPA.forEach((valor, i) => {
      const avatar = novoAvatar(ui.nivel, (i - (BET_RAMPA.length - 1) / 2) * 0.78);
      avatar.setMorph(valor, valor);
    });
  } else if (ui.modo === 'deusa') {
    // A deusa escolhida como o jogo a monta: aparência do panteão e os
    // Afters dela. A cena nasceu para a Luma e foi generalizada no
    // marco da Suki — toda remasterização seguinte entra aqui em vez
    // de ganhar um modo próprio.
    const ficha = getCharacter(ui.deusa);
    if (ficha) {
      const avatar = novoAvatar(ui.nivel, 0, ficha.appearance);
      if (ficha.afters) avatar.setMorph(ficha.afters.bust, ficha.afters.curve);
      // A gestação é traço de personagem, não produto cosmético, e o
      // jogo a aplica em `CharacterModels`. A bancada não aplicava, e
      // por isso a Amara aparecia aqui **sem o ventre** — montada de
      // um jeito que não existe em lugar nenhum da cidade. Quem for
      // vestir uma deusa grávida precisa vê-la grávida.
      avatar.setGestation(ficha.gestation ?? 0);
    }
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

/** Cenas em que cada avatar tem a própria silhueta, e os sliders não mandam. */
function morphPorAvatar(): boolean {
  return ui.modo === 'bet' || ui.modo === 'betrampa' || ui.modo === 'elenco' || ui.modo === 'deusa';
}

function aplicarMorph(): void {
  if (morphPorAvatar()) return;
  for (const a of avatars) a.setMorph(ui.bust, ui.curve);
}

function enquadrar(): void {
  const rosto = ui.modo === 'rosto';
  const largo =
    ui.modo === 'niveis' || ui.modo === 'bichos' || ui.modo === 'elenco' || ui.modo === 'bet' || ui.modo === 'betrampa';
  // O alvo do rosto fica na linha do nariz, não na dos olhos: era por
  // isso que a boca e o queixo saíam fora do quadro.
  const alvo = new THREE.Vector3(0, rosto ? 1.56 : 0.95, 0);
  // O painel come os 280 px da esquerda da tela. Nas cenas largas o
  // primeiro personagem caía atrás dele, o que não é um defeito do
  // modelo mas estragava a captura — e uma captura de validação que
  // esconde um dos sujeitos não valida esse sujeito. Em vez de mexer
  // no espaçamento de cada cena, o alvo da câmera anda para a
  // esquerda: o grupo inteiro desliza para a direita, para dentro da
  // área livre, e o espaçamento continua dizendo respeito só à cena.
  if (largo) alvo.x -= 0.85 * zoom;
  // O elenco são cinco corpos lado a lado: precisa de mais recuo que
  // os quatro níveis, senão o das pontas sai do quadro.
  const dist =
    (rosto ? 0.95 : ui.modo === 'betrampa' ? 10.2 : ui.modo === 'elenco' ? 7.4 : ui.modo === 'niveis' || ui.modo === 'bet' ? 6.9 : largo ? 6.2 : 3.6) *
    zoom;
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
/** Janela de quadros para medir FPS: média móvel sobre 1 s. */
const fpsJanela: number[] = [];
let fps = 0;
const motion: {
  state: MotionState;
  speed: number;
  stridePhase: number;
  verticalSpeed: number;
  elapsed: number;
} = { state: 'idle', speed: 0, stridePhase: 0, verticalSpeed: 0, elapsed: 0 };

function quadro(): void {
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  elapsed += dt;
  fpsJanela.push(dt);
  let soma = 0;
  for (let i = fpsJanela.length - 1; i >= 0; i -= 1) {
    soma += fpsJanela[i];
    if (soma > 1) {
      fpsJanela.splice(0, i);
      break;
    }
  }
  if (soma > 0.2) fps = fpsJanela.length / soma;
  if (ui.andando) {
    // O ciclo de caminhada de verdade, a mesma função que o jogo usa.
    for (const parts of creatures) if (parts.knees.length > 0) passoQuadrupede(parts, elapsed, 1.2, true);
    // E o avatar anda de verdade também: o BET precisa ser visto em
    // movimento, porque é com o tronco girando e a perna subindo que
    // uma deformação mal costurada se denuncia.
    motion.state = 'walk';
    motion.speed = 1.6;
    motion.stridePhase = (motion.stridePhase + dt * 1.6 * 1.9) % (Math.PI * 2);
  } else {
    motion.state = 'idle';
    motion.speed = 0;
  }
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
ligar('deusa', (v) => {
  ui.deusa = v;
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
  // `morph` é para sondagem: a deformação BET mora no shader, então um
  // raycast normal acerta a malha parada. Com isto dá para projetar o
  // vértice já deslocado e descobrir o que aparece num pixel.
  morph: aftersMorph,
  // `three` é para sondagem: sem ele um raycast de dentro da página
  // precisaria refazer a matemática da câmera à mão.
  three: THREE,
  scene,
  renderer,
  camera,
  environment,
  avatars,
  criaturas: creatures,
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
  /** Quadros por segundo, média móvel de um segundo. */
  get fps() {
    return fps;
  },
  /** Custo de construção do último `montar`. */
  get custos() {
    return custos.slice();
  },
  /** Liga o ciclo de caminhada das criaturas. */
  andar(on: boolean) {
    ui.andando = on;
  },
  /** Move o alvo da câmera, para enquadrar algo fora do centro. */
  mirar(x: number, y: number, z: number) {
    alvoOff.set(x, y, z);
  },
};

montar();
quadro();

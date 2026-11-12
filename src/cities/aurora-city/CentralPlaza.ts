import * as THREE from 'three';
import { type GeometryBatcher, xform } from '../../utils/geometry';
import { TAU } from '../../utils/math';
import { BLOSSOM_COLORS } from '../../world/Vegetation';
import type { CityContext } from './CityContext';
import { type Props, headingTo } from './Decorations';
import { annulus, box, crystalShard, cyl, disc, lathe, scaleUV, sphere, torus, tube } from './Kit';
import { AVENUES, H0, PLAZA } from './Layout';

/** Altura do piso da praça. */
export const PLAZA_Y = H0 + PLAZA.lift;
const POOL_RADIUS = 10;
const POOL_FLOOR_Y = PLAZA_Y - 0.04;
const POOL_WATER_Y = PLAZA_Y + 0.24;
const RIM_TOP_Y = PLAZA_Y + 0.34;
export const SPHERE_CENTER = new THREE.Vector3(0, PLAZA_Y + 6.3, 0);
const SPHERE_RADIUS = 2.6;

/** Piso da praça: ladrilhos polares de pedra clara com faixas de vidro luminoso. */
function createPlazaFloorMaterial(glow: { value: number }): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.02 });
  material.name = 'plazaFloor';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPlazaGlow = glow;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPlazaPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPlazaPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        varying vec3 vPlazaPos;
        uniform float uPlazaGlow;
        float plazaHash(vec2 p) {
          p = fract(p * vec2(127.1, 311.7));
          p += dot(p, p + 34.5);
          return fract(p.x * p.y);
        }`,
      )
      .replace(
        '#include <map_fragment>',
        /* glsl */ `
        float pR = length(vPlazaPos.xz);
        float pAng = atan(vPlazaPos.z, vPlazaPos.x) / 6.2831853 + 0.5;
        // Tamanho de um pixel em metros (para suavizar linhas finas).
        float pPx = max(length(dFdx(vPlazaPos.xz)), length(dFdy(vPlazaPos.xz)));

        float pRingW = 2.0;
        float pRi = floor(pR / pRingW);
        float pRf = fract(pR / pRingW);
        float pTiles = max(16.0, floor((pRi + 0.5) * pRingW * 6.2831853 / 2.6 / 16.0 + 0.5) * 16.0);
        float pAt = pAng * pTiles + mod(pRi, 2.0) * 0.5;
        float pAf = fract(pAt);
        float pTileW = 6.2831853 * max(pR, 0.5) / pTiles;

        float pLineR = min(pRf, 1.0 - pRf) * pRingW;
        float pLineA = min(pAf, 1.0 - pAf) * pTileW;
        float pFade = 1.0 - smoothstep(0.1, 0.45, pPx);
        float pGrout = (1.0 - smoothstep(0.02, 0.035 + pPx, min(pLineR, pLineA))) * pFade;

        float pRnd = plazaHash(vec2(pRi, floor(pAt)));
        vec3 pStone = vec3(0.985, 0.975, 0.945) * (0.93 + 0.07 * pRnd);
        vec3 pGlassCol = vec3(0.55, 0.9, 0.97);

        // Zonas de vidro: anel interno, faixa luminosa e ladrilhos esparsos.
        float pInner = 1.0 - smoothstep(17.3, 17.5, pR);
        float pBand = smoothstep(29.4, 29.5, pR) * (1.0 - smoothstep(31.0, 31.1, pR));
        float pGem = step(0.955, pRnd) * step(17.5, pR) * (1.0 - step(44.0, pR)) * (1.0 - pBand);
        float pGlass = clamp(pInner + pBand + pGem, 0.0, 1.0);

        // Raios de luz embutidos no piso.
        float pRay = abs(fract(pAng * 16.0 + 0.5) - 0.5) / 16.0 * 6.2831853 * pR;
        float pStrip = (1.0 - smoothstep(0.07, 0.09 + pPx, pRay)) * smoothstep(17.5, 18.2, pR) * (1.0 - smoothstep(43.6, 44.0, pR)) * (1.0 - smoothstep(0.5, 1.2, pPx));
        // Borda externa em mármore.
        float pBorder = smoothstep(44.5, 44.6, pR);

        vec3 pCol = mix(pStone, vec3(0.74, 0.9, 0.95), pGrout * 0.9);
        pCol = mix(pCol, pGlassCol * (0.9 + 0.1 * pRnd), pGlass * (1.0 - pGrout * 0.4));
        pCol = mix(pCol, vec3(1.0), pBorder);
        pCol = mix(pCol, vec3(0.6, 0.96, 1.0), pStrip);
        diffuseColor.rgb *= pCol;
        `,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.07, clamp(pGlass + pStrip, 0.0, 1.0));
        roughnessFactor = mix(roughnessFactor, 0.22, pBorder);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(0.16, 0.82, 1.0) * (pStrip * 1.6 + pBand * 0.5 + pGem * 0.6 + pInner * 0.22) * uPlazaGlow;`,
      );
  };
  material.customProgramCacheKey = () => 'eden-plaza-floor-v1';
  return material;
}

/** Fonte em taça ("Fonte dos Desejos"). */
export function buildWishFountain(ctx: CityContext, batch: GeometryBatcher, x: number, z: number, y: number, index: number): void {
  const m = ctx.materials;
  const at = xform(x, y, z);
  batch.add(annulus(3.4, 3.85, 0, 0.36, { segments: 36 }), m.white, at.clone());
  batch.add(disc(3.45, 0, 0.05, 32), m.glassFloor, at.clone());
  batch.add(disc(3.42, 0.24, 0.26, 32), m.poolWater, at.clone());
  batch.add(
    lathe(
      [
        [0.85, 0.05],
        [0.5, 0.5],
        [0.3, 1.2],
        [0.34, 1.72],
      ],
      20,
    ),
    m.white,
    at.clone(),
  );
  // Taça (parede externa + interna).
  batch.add(
    lathe(
      [
        [0.3, 1.7],
        [1.2, 1.86],
        [1.9, 2.12],
        [1.98, 2.27],
        [1.86, 2.25],
        [1.1, 2.02],
        [0.05, 1.96],
      ],
      28,
    ),
    m.white,
    at.clone(),
  );
  batch.add(disc(1.84, 2.18, 2.2, 24), m.poolWater, at.clone());
  batch.add(crystalShard(0.22, 1.15), m.crystal, xform(x, y + 2.0, z));
  batch.add(sphere(0.15, 10, 8), m.aquaGlow, xform(x, y + 3.25, z));
  batch.add(torus(3.62, 0.04, 6, 40), m.aquaGlow, xform(x, y + 0.2, z));

  // Lâmina de água caindo da taça.
  const sheet = cyl(1.93, 1.99, 1.95, 28, true);
  scaleUV(sheet, 6, 1);
  batch.add(sheet, m.waterfall, xform(x, y + 0.26, z));

  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU;
    ctx.jets.push({ x, y: y + 3.2, z, vx: Math.cos(a) * 1.1, vy: 3.4, vz: Math.sin(a) * 1.1, spread: 0.12, count: 14, size: 0.12 });
  }
  ctx.waterSounds.push({ x, z, radius: 20, gain: 0.7 });

  ctx.physics.addCylinder({ x, z, radius: 3.85, innerRadius: 3.4, yMin: y - 0.5, yMax: y + 0.36, blocksCamera: false, tag: 'fonte-borda' });
  ctx.physics.addCylinder({ x, z, radius: 3.4, yMin: y - 0.5, yMax: y + 0.05, surface: 'water', blocksCamera: false, tag: 'fonte-fundo' });
  ctx.physics.addCylinder({ x, z, radius: 0.95, yMin: y - 0.5, yMax: y + 2.3, walkable: false, blocksCamera: false, tag: 'fonte-coluna' });
  ctx.addInteractable({
    id: `fonte-desejos-${index}`,
    name: 'Fonte dos Desejos',
    action: 'Fazer um pedido',
    x,
    y: y + 1.0,
    z,
    range: 5.4,
    cooldown: 1.2,
    payload: { type: 'fonte', splashAt: { x, y: y + 0.3, z } },
  });
}

/**
 * Praça Central de Aurora City: piso de pedra clara e vidro, espelho
 * d'água com a Esfera Aurora, fontes, canteiros, bancos, cristais,
 * hologramas e luzes ambientais.
 */
export function buildCentralPlaza(ctx: CityContext, props: Props): void {
  const m = ctx.materials;
  const batch = ctx.batch();
  const glow = { value: 0.3 };
  const floorMaterial = createPlazaFloorMaterial(glow);
  ctx.disposables.push(floorMaterial);

  /* ----- Piso -------------------------------------------------------- */
  batch.add(annulus(POOL_RADIUS + 0.6, PLAZA.radius, H0 - 0.3, PLAZA_Y, { segments: 96 }), floorMaterial);
  ctx.physics.addCylinder({ x: 0, z: 0, radius: PLAZA.radius, innerRadius: POOL_RADIUS + 0.6, yMin: H0 - 2, yMax: PLAZA_Y, solid: false, surface: 'stone', tag: 'praca-piso' });
  // Faixa de vidro: som de passos diferente.
  ctx.physics.addCylinder({ x: 0, z: 0, radius: 17.4, innerRadius: POOL_RADIUS + 0.6, yMin: H0 - 2, yMax: PLAZA_Y + 0.005, solid: false, surface: 'glass', tag: 'praca-vidro' });

  /* ----- Espelho d'água central ---------------------------------------- */
  batch.add(annulus(POOL_RADIUS, POOL_RADIUS + 0.6, H0 - 0.2, RIM_TOP_Y, { segments: 72 }), m.white);
  batch.add(torus(POOL_RADIUS + 0.62, 0.05, 6, 72), m.aquaGlow, xform(0, PLAZA_Y + 0.1, 0));
  batch.add(disc(POOL_RADIUS + 0.02, H0 - 0.2, POOL_FLOOR_Y, 64), m.glassFloor);
  batch.add(disc(POOL_RADIUS, POOL_WATER_Y - 0.02, POOL_WATER_Y, 64), m.poolWater);
  ctx.physics.addCylinder({ x: 0, z: 0, radius: POOL_RADIUS + 0.6, innerRadius: POOL_RADIUS, yMin: H0 - 2, yMax: RIM_TOP_Y, blocksCamera: false, tag: 'espelho-borda' });
  ctx.physics.addCylinder({ x: 0, z: 0, radius: POOL_RADIUS, yMin: H0 - 2, yMax: POOL_FLOOR_Y, solid: false, surface: 'water', tag: 'espelho-fundo' });

  /* ----- Pedestal em flor-de-lótus e Esfera Aurora --------------------- */
  batch.add(
    lathe(
      [
        [3.3, POOL_FLOOR_Y],
        [3.1, PLAZA_Y + 0.5],
        [2.3, PLAZA_Y + 0.8],
        [1.6, PLAZA_Y + 1.5],
        [1.2, PLAZA_Y + 2.6],
        [1.5, PLAZA_Y + 3.3],
        [0.05, PLAZA_Y + 3.45],
      ],
      36,
    ),
    m.white,
  );
  batch.add(torus(3.2, 0.06, 6, 48), m.aquaGlow, xform(0, PLAZA_Y + 0.56, 0));
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const arm = tube(
      [
        new THREE.Vector3(c * 2.2, PLAZA_Y + 0.7, s * 2.2),
        new THREE.Vector3(c * 3.9, PLAZA_Y + 3.0, s * 3.9),
        new THREE.Vector3(c * 3.75, PLAZA_Y + 6.0, s * 3.75),
        new THREE.Vector3(c * 2.5, PLAZA_Y + 8.5, s * 2.5),
      ],
      0.2,
      28,
      8,
    );
    batch.add(arm, m.white);
    batch.add(sphere(0.3, 10, 8), m.aquaGlow, xform(c * 2.5, PLAZA_Y + 8.55, s * 2.5));
  }
  ctx.physics.addCylinder({ x: 0, z: 0, radius: 3.5, yMin: H0 - 2, yMax: PLAZA_Y + 7, walkable: false, blocksCamera: false, tag: 'esfera-pedestal' });

  const sphereGeometry = new THREE.SphereGeometry(SPHERE_RADIUS, 40, 28);
  const orbMaterial = m.orb.clone();
  orbMaterial.uniforms.uTime = m.time;
  orbMaterial.uniforms.uCore.value = new THREE.Color(0xeaffff);
  orbMaterial.uniforms.uRim.value = new THREE.Color(0x29c8ff);
  const sphereMesh = new THREE.Mesh(sphereGeometry, orbMaterial);
  sphereMesh.name = 'EsferaAurora';
  sphereMesh.position.copy(SPHERE_CENTER);
  const halo = new THREE.Mesh(sphereGeometry, m.orbHalo.clone());
  halo.scale.setScalar(1.42);
  halo.position.copy(SPHERE_CENTER);
  halo.renderOrder = 3;

  const ringGeometry = new THREE.TorusGeometry(3.75, 0.07, 8, 72);
  const ringA = new THREE.Mesh(ringGeometry, m.aquaGlow);
  const ringB = new THREE.Mesh(ringGeometry, m.white);
  ringB.scale.setScalar(1.16);
  const ringPivot = new THREE.Group();
  ringPivot.position.copy(SPHERE_CENTER);
  ringPivot.add(ringA, ringB);

  const light = new THREE.PointLight(0x7fe9ff, 20, 70, 2);
  light.position.copy(SPHERE_CENTER);
  light.castShadow = false;

  const sphereGroup = new THREE.Group();
  sphereGroup.name = 'EsferaAuroraGroup';
  sphereGroup.add(sphereMesh, halo, ringPivot, light);
  ctx.root.add(sphereGroup);
  ctx.disposables.push(sphereGeometry, ringGeometry, orbMaterial, halo.material as THREE.Material);

  // Modos de cor da esfera (alternados ao interagir).
  const sphereModes = [
    { name: 'Aurora', core: new THREE.Color(0xeaffff), rim: new THREE.Color(0x29c8ff), light: new THREE.Color(0x7fe9ff) },
    { name: 'Esmeralda', core: new THREE.Color(0xf0fff0), rim: new THREE.Color(0x24e08a), light: new THREE.Color(0x7dffc0) },
    { name: 'Pérola', core: new THREE.Color(0xffffff), rim: new THREE.Color(0xa9d8ff), light: new THREE.Color(0xdff1ff) },
    { name: 'Alvorada', core: new THREE.Color(0xfff6e6), rim: new THREE.Color(0xff9fd0), light: new THREE.Color(0xffc4e4) },
  ];
  const sphereState = { mode: 0, pulse: 0 };
  const targetCore = sphereModes[0].core.clone();
  const targetRim = sphereModes[0].rim.clone();
  const targetLight = sphereModes[0].light.clone();
  const applyMode = (index: number): string => {
    sphereState.mode = ((index % sphereModes.length) + sphereModes.length) % sphereModes.length;
    const mode = sphereModes[sphereState.mode];
    targetCore.copy(mode.core);
    targetRim.copy(mode.rim);
    targetLight.copy(mode.light);
    return mode.name;
  };
  ctx.sphere = {
    center: SPHERE_CENTER,
    get mode(): number {
      return sphereState.mode;
    },
    cycleMode(): string {
      sphereState.pulse = 1;
      return applyMode(sphereState.mode + 1);
    },
    setMode(index: number): void {
      applyMode(index);
    },
    pulse(): void {
      sphereState.pulse = 1;
    },
  };

  ctx.animate(({ dt, elapsed, atmosphere }) => {
    const k = 1 - Math.exp(-dt * 3);
    (orbMaterial.uniforms.uCore.value as THREE.Color).lerp(targetCore, k);
    (orbMaterial.uniforms.uRim.value as THREE.Color).lerp(targetRim, k);
    light.color.lerp(targetLight, k);
    (halo.material as THREE.MeshBasicMaterial).color.lerp(targetLight, k);

    sphereState.pulse = Math.max(0, sphereState.pulse - dt * 0.9);
    const breath = 1 + Math.sin(elapsed * 0.9) * 0.025 + sphereState.pulse * 0.16;
    sphereMesh.scale.setScalar(breath);
    sphereMesh.position.y = SPHERE_CENTER.y + Math.sin(elapsed * 0.6) * 0.14;
    halo.position.y = sphereMesh.position.y;
    halo.scale.setScalar(1.42 * breath + sphereState.pulse * 1.4);
    (halo.material as THREE.MeshBasicMaterial).opacity = 0.16 + atmosphere.night * 0.14 + sphereState.pulse * 0.25;
    orbMaterial.uniforms.uPower.value = 1.2 + atmosphere.night * 0.35 + sphereState.pulse * 0.8;

    ringPivot.position.y = sphereMesh.position.y;
    ringA.rotation.set(Math.PI / 2 + Math.sin(elapsed * 0.31) * 0.5, elapsed * 0.42, 0);
    ringB.rotation.set(Math.PI / 2 + Math.cos(elapsed * 0.23) * 0.7, -elapsed * 0.3, 0.4);

    light.intensity = 18 + 190 * atmosphere.night + sphereState.pulse * 160;
    glow.value = 0.28 + 0.9 * atmosphere.night + sphereState.pulse * 0.6;
  });

  ctx.addInteractable({
    id: 'esfera-aurora',
    name: 'Esfera Aurora',
    action: 'Tocar a luz',
    x: 0,
    y: PLAZA_Y + 1.2,
    z: 0,
    range: 11.4,
    cooldown: 1,
    payload: { type: 'esfera' },
  });

  // Jatos em arco convergindo para a esfera.
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * TAU;
    ctx.jets.push({
      x: Math.cos(a) * 7.2,
      y: POOL_WATER_Y,
      z: Math.sin(a) * 7.2,
      vx: -Math.cos(a) * 2.25,
      vy: 8.8,
      vz: -Math.sin(a) * 2.25,
      spread: 0.05,
      count: 34,
      size: 0.17,
    });
    batch.add(cyl(0.09, 0.14, 0.2, 8), m.metal, xform(Math.cos(a) * 7.2, POOL_WATER_Y - 0.12, Math.sin(a) * 7.2));
  }
  ctx.waterSounds.push({ x: 0, z: 0, radius: 34, gain: 1 });

  /* ----- Faixa holográfica giratória ------------------------------------ */
  const banner = m.createHologram(2048, 96, (c, w, h) => {
    c.fillStyle = 'rgba(120, 235, 255, 0.12)';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#ffffff';
    c.font = '700 54px "Segoe UI", "Trebuchet MS", Arial, sans-serif';
    c.textBaseline = 'middle';
    const text = 'AURORA CITY   ✦   A WORLD BEYOND IMAGINATION   ✦   ';
    const width = c.measureText(text).width;
    for (let x = 0; x < w + width; x += width) c.fillText(text, x, h / 2 + 2);
    c.fillStyle = 'rgba(255,255,255,0.9)';
    c.fillRect(0, 2, w, 3);
    c.fillRect(0, h - 5, w, 3);
  });
  banner.texture.wrapS = THREE.RepeatWrapping;
  const bannerGeometry = scaleUV(new THREE.CylinderGeometry(5.6, 5.6, 0.82, 64, 1, true), 2, 1);
  const bannerMesh = new THREE.Mesh(bannerGeometry, banner.material);
  bannerMesh.position.set(0, PLAZA_Y + 11.4, 0);
  bannerMesh.renderOrder = 4;
  ctx.root.add(bannerMesh);
  ctx.disposables.push(bannerGeometry);
  ctx.animate(({ dt }) => {
    bannerMesh.rotation.y -= dt * 0.16;
  });

  /* ----- Fontes dos Desejos (diagonais) ---------------------------------- */
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    buildWishFountain(ctx, batch, Math.cos(a) * 24.8, Math.sin(a) * 24.8, PLAZA_Y, k + 1);
  }

  /* ----- Canteiros com árvores floridas ---------------------------------- */
  const flowerPalette = [0xff7fb0, 0xffd84a, 0xffffff, 0xff8f6b, 0xb58cff];
  const lumenPalette = [0x6ff5ff, 0x7dffc4, 0xff9fe0, 0xcfe9ff];
  for (let k = 0; k < 8; k++) {
    const a = Math.PI / 8 + (k * Math.PI) / 4;
    const x = Math.cos(a) * 37;
    const z = Math.sin(a) * 37;
    const top = props.planter(batch, x, z, 2.4, PLAZA_Y, 0.5);
    ctx.vegetation.addTree({
      kind: 'frondosa',
      x,
      z,
      y: top,
      scale: 0.88,
      rotation: ctx.rng() * TAU,
      color: new THREE.Color(BLOSSOM_COLORS[k % 2 === 0 ? 0 : 1]),
    });
    ctx.vegetation.addFlowerPatch({ x, z, y: top, radius: 2.0, density: 4.2, palette: k % 2 === 0 ? flowerPalette : lumenPalette, luminous: k % 2 === 1 });

    // Bancos ladeando cada canteiro, voltados para a esfera.
    for (const side of [-1, 1]) {
      const ba = a + side * 0.105;
      const bx = Math.cos(ba) * 35.2;
      const bz = Math.sin(ba) * 35.2;
      props.bench(bx, bz, headingTo(bx, bz, 0, 0), PLAZA_Y);
    }
  }

  /* ----- Bancos ao redor do espelho d'água -------------------------------- */
  for (let k = 0; k < 8; k++) {
    const a = Math.PI / 8 + (k * Math.PI) / 4;
    const x = Math.cos(a) * 13.6;
    const z = Math.sin(a) * 13.6;
    props.bench(x, z, headingTo(x, z, 0, 0), PLAZA_Y);
  }

  /* ----- Postes, cristais e orbes ------------------------------------------ */
  for (let k = 0; k < 16; k++) {
    const a = Math.PI / 16 + (k * Math.PI) / 8;
    props.lamp(Math.cos(a) * 44.2, Math.sin(a) * 44.2, PLAZA_Y);
  }
  AVENUES.forEach((avenue, i) => {
    for (const side of [-1, 1]) {
      const a = avenue.angle + side * 0.19;
      props.crystals(batch, Math.cos(a) * 41, Math.sin(a) * 41, 1.05, (i + (side > 0 ? 1 : 0)) % 2 === 0, PLAZA_Y);
    }
  });
  for (let k = 0; k < 18; k++) {
    const a = (k / 18) * TAU + 0.1;
    const r = k % 2 === 0 ? 21.5 : 31.5;
    props.orb(Math.cos(a) * r, PLAZA_Y + 3.2 + (k % 3) * 0.9, Math.sin(a) * r, 0.8 + (k % 3) * 0.25);
  }

  /* ----- Placas das avenidas ------------------------------------------------ */
  const signTexts: Record<string, { title: string; subtitle: string; paragraphs: string[] }> = {
    norte: {
      title: 'DISTRITO CRISTAL',
      subtitle: 'Avenida Boreal · Torre Aurora',
      paragraphs: [
        'Ao norte fica o Distrito Cristal, onde a Torre Aurora — o pináculo de cristal que dá nome à cidade — toca as nuvens.',
        'Siga pela Avenida Boreal para ver de perto as agulhas de vidro e os anéis de luz que orbitam a torre.',
      ],
    },
    leste: {
      title: 'MIRANTE CELESTE',
      subtitle: 'Avenida Alvorada · Vila das Nuvens',
      paragraphs: [
        'A leste, a Avenida Alvorada leva ao Observatório e à trilha em espiral do Mirante Celeste, o ponto mais alto de Aurora City.',
        'Do topo é possível avistar toda a ilha. Use o telescópio para apreciar a paisagem.',
      ],
    },
    sul: {
      title: 'ORLA CRISTALINA',
      subtitle: 'Avenida das Marés · Píer e Palco Aurora',
      paragraphs: [
        'Ao sul, a Avenida das Marés desce até a Orla Cristalina: praia de areia clara, o Píer da Orla e o Palco Aurora.',
        'A água do Éden é tão limpa que dá para ver o fundo do mar a partir do píer.',
      ],
    },
    oeste: {
      title: 'PARQUE DAS ÁGUAS',
      subtitle: 'Avenida do Orvalho · Jardins Suspensos',
      paragraphs: [
        'A oeste fica o Parque das Águas, com o Lago Espelho, a Ilha do Gazebo e o rio que corre até o mar.',
        'Mais ao norte, os Jardins Suspensos sobem em terraços floridos com ilhas flutuantes.',
      ],
    },
  };
  AVENUES.forEach((avenue) => {
    const info = signTexts[avenue.id];
    const a = avenue.angle - 0.105;
    const x = Math.cos(a) * 43.2;
    const z = Math.sin(a) * 43.2;
    const position = props.sign(batch, x, z, headingTo(x, z, 0, 0), info.title, info.subtitle, PLAZA_Y);
    ctx.addInteractable({
      id: `placa-avenida-${avenue.id}`,
      name: avenue.name,
      action: 'Ler',
      x: position.x,
      y: position.y,
      z: position.z,
      payload: { type: 'placa', title: info.title, paragraphs: info.paragraphs, entryId: `avenida-${avenue.id}` },
    });
  });

  /* ----- Holomapa ---------------------------------------------------------- */
  {
    const a = (112.5 * Math.PI) / 180;
    const x = Math.cos(a) * 21.5;
    const z = Math.sin(a) * 21.5;
    batch.add(
      lathe(
        [
          [1.25, 0],
          [1.0, 0.14],
          [0.42, 0.42],
          [0.5, 0.84],
          [1.3, 0.96],
          [1.3, 1.02],
          [0.05, 1.02],
        ],
        28,
      ),
      m.white,
      xform(x, PLAZA_Y, z),
    );
    batch.add(torus(1.18, 0.05, 6, 36), m.aquaGlow, xform(x, PLAZA_Y + 1.04, z));
    const globe = m.createHologram(512, 256, (c, w, h) => {
      c.strokeStyle = 'rgba(255,255,255,0.85)';
      c.lineWidth = 2;
      for (let i = 0; i <= 12; i++) {
        c.beginPath();
        c.moveTo((i / 12) * w, 0);
        c.lineTo((i / 12) * w, h);
        c.stroke();
      }
      for (let j = 1; j < 6; j++) {
        c.beginPath();
        c.moveTo(0, (j / 6) * h);
        c.lineTo(w, (j / 6) * h);
        c.stroke();
      }
      // "Continentes" estilizados.
      c.fillStyle = 'rgba(255,255,255,0.75)';
      const blobs: [number, number, number, number][] = [
        [0.2, 0.42, 58, 34],
        [0.33, 0.6, 30, 44],
        [0.58, 0.36, 70, 30],
        [0.7, 0.62, 40, 26],
        [0.88, 0.48, 34, 40],
      ];
      for (const [bx, by, rx, ry] of blobs) {
        c.beginPath();
        c.ellipse(bx * w, by * h, rx, ry, 0.3, 0, TAU);
        c.fill();
      }
    });
    globe.texture.wrapS = THREE.RepeatWrapping;
    const globeGeometry = new THREE.SphereGeometry(0.82, 28, 18);
    const globeMesh = new THREE.Mesh(globeGeometry, globe.material);
    globeMesh.position.set(x, PLAZA_Y + 2.25, z);
    globeMesh.renderOrder = 4;
    const globeRing = new THREE.Mesh(new THREE.TorusGeometry(1.12, 0.025, 6, 48), m.aquaGlow);
    globeRing.position.copy(globeMesh.position);
    ctx.root.add(globeMesh, globeRing);
    ctx.disposables.push(globeGeometry, globeRing.geometry);
    ctx.animate(({ dt, elapsed }) => {
      globeMesh.rotation.y += dt * 0.35;
      globeMesh.position.y = PLAZA_Y + 2.25 + Math.sin(elapsed * 1.1) * 0.06;
      globeRing.rotation.set(Math.PI / 2 + 0.35, 0, elapsed * 0.5);
    });
    ctx.physics.addCylinder({ x, z, radius: 1.3, yMin: H0 - 1, yMax: PLAZA_Y + 1.02, walkable: false, blocksCamera: false, tag: 'holomapa' });
    ctx.lightSpots.push({ x, y: PLAZA_Y + 0.05, z, radius: 5, color: 0x7feaff });
    ctx.addInteractable({ id: 'holomapa', name: 'Holomapa de Aurora', action: 'Abrir mapa', x, y: PLAZA_Y + 1.2, z, range: 3.2, payload: { type: 'holomapa' } });
  }

  /* ----- Painel de eventos --------------------------------------------------- */
  {
    const a = (67.5 * Math.PI) / 180;
    const x = Math.cos(a) * 21.5;
    const z = Math.sin(a) * 21.5;
    const heading = headingTo(x, z, 0, 34);
    for (const side of [-1, 1]) {
      const px = x + Math.cos(heading) * side * 1.75;
      const pz = z - Math.sin(heading) * side * 1.75;
      batch.add(cyl(0.07, 0.1, 3.3, 10), m.white, xform(px, PLAZA_Y, pz));
      batch.add(sphere(0.12, 10, 8), m.aquaGlow, xform(px, PLAZA_Y + 3.36, pz));
      ctx.physics.addCylinder({ x: px, z: pz, radius: 0.14, yMin: H0 - 1, yMax: PLAZA_Y + 3.3, walkable: false, blocksCamera: false, tag: 'painel' });
    }
    batch.add(box(3.7, 0.08, 0.5), m.white, xform(x, PLAZA_Y, z, 0, heading, 0));
    const board = m.createHologram(768, 448, (c, w, h) => {
      c.fillStyle = 'rgba(8, 66, 124, 0.66)';
      c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgb(170, 244, 255)';
      c.lineWidth = 5;
      c.strokeRect(8, 8, w - 16, h - 16);
      c.fillStyle = '#ffffff';
      c.textAlign = 'center';
      c.font = '700 54px "Segoe UI", "Trebuchet MS", Arial, sans-serif';
      c.fillText('EVENTOS DO ÉDEN', w / 2, 84);
      c.fillRect(w * 0.2, 108, w * 0.6, 3);
      c.font = '500 34px "Segoe UI", "Trebuchet MS", Arial, sans-serif';
      const lines = ['EdenGala', 'EdenCon', 'Concurso Divino', 'Shows de Lilly', 'Eventos de Bitnara'];
      lines.forEach((line, i) => c.fillText(line, w / 2, 164 + i * 46));
      c.font = '700 30px "Segoe UI", "Trebuchet MS", Arial, sans-serif';
      c.fillText('✦ EM BREVE ✦', w / 2, h - 38);
    });
    // Duas faces (frente e verso) para o texto nunca aparecer espelhado.
    board.material.side = THREE.FrontSide;
    const boardGeometry = new THREE.PlaneGeometry(3.4, 1.98);
    for (const flip of [0, Math.PI]) {
      const boardMesh = new THREE.Mesh(boardGeometry, board.material);
      boardMesh.position.set(x, PLAZA_Y + 2.2, z);
      boardMesh.rotation.y = heading + flip;
      boardMesh.renderOrder = 4;
      ctx.root.add(boardMesh);
    }
    ctx.disposables.push(boardGeometry);
    ctx.lightSpots.push({ x, y: PLAZA_Y + 0.05, z, radius: 5, color: 0x7feaff });
    ctx.addInteractable({ id: 'painel-eventos', name: 'Painel de Eventos', action: 'Ver programação', x, y: PLAZA_Y + 1.2, z, range: 3.4, payload: { type: 'eventos' } });
  }

  ctx.commit(batch, 'CentralPlaza');
}

/**
 * A cena de um interior: a camada que transforma a planta em prédio.
 *
 * Ela orquestra três coisas, nesta ordem:
 *
 *  1. **a casca** (`InteriorShell`) — piso, paredes, teto, janelas e
 *     escada, de todos os andares, derivados da planta;
 *  2. **o acabamento** (`fitouts/`) — a mobília que dá identidade ao
 *     lugar, quando o ambiente tem um;
 *  3. **a gente** (`InteriorPeople`) — atendentes, moradores e
 *     clientes andando.
 *
 * Ambiente sem acabamento ainda sobe: ganha a casca completa e uma
 * mobília genérica tirada de `props`. É o bastante para a porta não
 * mentir — e não é o bastante para chamar de pronto.
 *
 * **Coordenadas.** O interior é montado num canto do mundo bem longe
 * do exterior (`INTERIOR_ORIGIN`) e a câmera é levada até lá. Isso
 * custava o bug mais feio do jogo: a essa distância o relevo vale
 * −7 m e o limite circular da região fica a 5 km, então o jogador
 * nadava e era arrancado da sala no primeiro passo. `physics.setIndoor`
 * desliga as duas regras enquanto se está dentro.
 *
 * **A física é pedida a cada uso, nunca guardada.** Viajar de região
 * destrói o mundo e monta outro — `World.build` cria uma `PhysicsWorld`
 * nova. Esta cena nasce uma vez e vive a sessão inteira; enquanto ela
 * guardava a física recebida no construtor, o primeiro prédio aberto
 * depois de uma viagem subia inteiro na física **morta**: as paredes
 * iam para um mundo que ninguém mais consulta, `setIndoor` ligava o
 * modo interior onde ninguém mais olha, e o jogador — ainda sujeito ao
 * limite circular — era atirado a 5 km dali, para o meio do oceano,
 * com o exterior escondido. É exatamente a cena de "entrei na casa e
 * caí nadando no vazio". Por isso `physics` aqui é uma função.
 */

import * as THREE from 'three';
import type { Interactable, InteractionPayload } from '../interactions/Interactable';
import type { Collider } from '../physics/Collision';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { QualityProfile } from '../systems/QualitySystem';
import { createRng, randRange } from '../utils/math';
import type { MaterialLibrary } from '../world/Materials';
import type { InteriorDef, InteriorProp, InteriorRoom } from './Interior';
import { roomsOnFloor } from './Interior';
import { dressRoom } from './InteriorDressing';
import { FLOOR_HEIGHT, InteriorBuild } from './InteriorKit';
import type { InteriorLoader } from './InteriorManager';
import { InteriorPalette } from './InteriorPalette';
import { type FloorHeight, InteriorPeople, type PersonSpec } from './InteriorPeople';
import { createOfficialAvatar } from '../characters/CharacterModels';
import { AvatarAnimator } from '../player/AvatarAnimator';
import type { Avatar } from '../player/Avatar';
import { buildBackdrop, buildShell, buildStaircase, footprintOf, stairHeightAt, stairwellOf } from './InteriorShell';
import { getFitout } from './fitouts';

/**
 * Os materiais do mundo que um interior poderia querer emprestados.
 *
 * Hoje nenhum: a mobília e os acabamentos saem todos da paleta própria
 * dos interiores (`InteriorPalette`), que não pertence a região
 * nenhuma. O tipo fica porque descreve o empréstimo — mas a cena **não
 * guarda** materiais do mundo, e é de propósito: `World.dispose()` os
 * destrói a cada viagem, e uma cena que vive a sessão inteira não pode
 * segurar nada que morra antes dela.
 */
export type InteriorMaterials = Pick<MaterialLibrary, 'wood' | 'stone' | 'white' | 'facade' | 'glass' | 'crystal' | 'metal'>;

/** Onde os interiores são montados, longe de qualquer terreno. */
export const INTERIOR_ORIGIN = { x: 4000, z: 4000 };

/** Clima de luz ambiente de cada tipo de interior. */
const LIGHTING: Record<InteriorDef['lighting'], { color: number; intensity: number; ambient: number }> = {
  quente: { color: 0xffd9a6, intensity: 1.5, ambient: 0.55 },
  fria: { color: 0xcfe8ff, intensity: 1.4, ambient: 0.6 },
  neon: { color: 0xff7ad9, intensity: 1.8, ambient: 0.4 },
  natural: { color: 0xffffff, intensity: 1.2, ambient: 0.85 },
  penumbra: { color: 0xffc98f, intensity: 0.9, ambient: 0.28 },
};

/** Verbo mostrado no HUD para cada tipo de móvel. */
const ACTION_LABEL: Record<InteriorProp['action'], string> = {
  sentar: 'Sentar',
  olhar: 'Examinar',
  comprar: 'Comprar',
  conversar: 'Conversar',
  usar: 'Usar',
  subir: 'Subir',
  descer: 'Descer',
};

/** Um personagem oficial parado dentro de um prédio. */
interface OfficialResident {
  avatar: Avatar;
  animator: AvatarAnimator;
}

export interface InteriorSceneOptions {
  scene: THREE.Scene;
  /**
   * A física **viva** do mundo.
   *
   * Aceita uma função justamente porque o mundo é trocado a cada
   * viagem: guardar a referência de hoje é guardar a física de ontem.
   * Passar o objeto direto continua valendo para quem não viaja (os
   * testes), mas o motor deve passar `() => world.physics`.
   */
  physics: PhysicsWorld | (() => PhysicsWorld);
  /** Chamado quando a cena muda, para o motor reapontar os interativos. */
  onInteractables: (items: readonly Interactable[]) => void;
  /** Resolve o id de um morador no interativo de conversa correspondente. */
  resolvePerson?: (residentId: string, prop: InteriorProp) => { personId: string; divino: boolean } | null;
}

/** Onde o jogador nasce dentro do interior, já em coordenadas do mundo. */
export interface InteriorSpawn {
  x: number;
  y: number;
  z: number;
  heading: number;
}

export class InteriorScene implements InteriorLoader {
  readonly group = new THREE.Group();
  private readonly options: InteriorSceneOptions;
  private readonly palette = new InteriorPalette();
  private readonly interactables: Interactable[] = [];
  private readonly colliders: Collider[] = [];
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly lights: THREE.Light[] = [];
  private people: InteriorPeople | null = null;
  /** Personagens oficiais presentes neste prédio (modelo completo). */
  private readonly residents: OfficialResident[] = [];
  private current: InteriorDef | null = null;
  private spawn: InteriorSpawn | null = null;
  private floorY = 0;
  private quality: QualityProfile | null = null;
  /**
   * A física em que o prédio **aberto agora** foi montado.
   *
   * Desmontar tem de desfazer exatamente onde se fez. Se uma viagem
   * acontecesse com um prédio aberto, pedir a física de novo na hora
   * de sair devolveria a nova — e as paredes ficariam para sempre na
   * antiga, junto com o modo interior ligado.
   */
  private bound: PhysicsWorld | null = null;

  constructor(options: InteriorSceneOptions) {
    this.options = options;
    this.group.name = 'Interior';
    this.group.visible = false;
    options.scene.add(this.group);
  }

  /** A física viva do mundo, perguntada agora. */
  private get physics(): PhysicsWorld {
    const source = this.options.physics;
    return typeof source === 'function' ? source() : source;
  }

  get active(): InteriorDef | null {
    return this.current;
  }

  /** O que dá para fazer lá dentro. */
  get items(): readonly Interactable[] {
    return this.interactables;
  }

  /** Onde o jogador aparece ao entrar (coordenadas do mundo). */
  get spawnPoint(): InteriorSpawn | null {
    return this.spawn;
  }

  /** Altura do piso do interior ativo. */
  get groundY(): number {
    return this.floorY;
  }

  /** Quantas pessoas estão dentro do prédio agora. */
  get population(): number {
    return this.people?.count ?? 0;
  }

  load(interior: InteriorDef): void {
    // Garantia dura: nunca dois ao mesmo tempo, mesmo que alguém chame
    // `load` duas vezes seguidas sem passar pelo manager.
    if (this.current) this.unload(this.current);
    this.current = interior;
    this.floorY = 0;
    // Tudo que este prédio tocar na física — colisores e modo
    // interior — vai para esta, e é desta que sairá ao fechar.
    const physics = this.physics;
    this.bound = physics;

    const origin = INTERIOR_ORIGIN;
    const climate = LIGHTING[interior.lighting];
    const fitout = getFitout(interior.fitout);
    const people: PersonSpec[] = [];
    const peopleFloors: number[] = [];

    for (let floor = 0; floor < Math.max(1, interior.floors); floor += 1) {
      const rooms = roomsOnFloor(interior, floor);
      if (rooms.length === 0) continue;
      const build = new InteriorBuild({
        origin,
        palette: this.palette,
        physics,
        baseY: floor * FLOOR_HEIGHT,
        tag: 'interior',
      });

      buildShell(build, { interior, floor, hasFloorAbove: roomsOnFloor(interior, floor + 1).length > 0 });

      // Escada para o andar de cima, com guarda-corpo no vão de lá.
      if (roomsOnFloor(interior, floor + 1).length > 0) {
        buildStaircase(build, stairwellOf(interior), { withRailing: true });
      }

      // Vista da janela: sem isto, as janelas dariam para o vazio,
      // porque o exterior fica escondido enquanto se está dentro.
      if (floor === 0) buildBackdrop(build, footprintOf(rooms));

      // Mobília: do acabamento, quando há; genérica, quando não há.
      const before = people.length;
      if (fitout) {
        fitout({ b: build, interior, floor, people, room: (id) => interior.rooms.find((room) => room.id === id) });
      } else {
        // Sem acabamento próprio: cada cômodo ganha o básico que o
        // faz parecer um cômodo, e depois os móveis declarados. A
        // decoração se afasta do que já está ali.
        const declared = interior.props.filter((prop) => prop.floor === floor);
        for (const room of rooms) dressRoom(build, room, declared);
        for (const prop of declared) this.buildGenericProp(build, prop);
      }
      for (let i = before; i < people.length; i += 1) peopleFloors.push(floor);

      // Luz ambiente do andar.
      const area = footprintOf(rooms);
      const ambient = new THREE.HemisphereLight(climate.color, 0x3a4048, climate.ambient * 2);
      ambient.position.set(origin.x + area.x + area.w / 2, floor * FLOOR_HEIGHT + FLOOR_HEIGHT, origin.z + area.z + area.d / 2);
      this.group.add(ambient);
      this.lights.push(ambient);
      for (const room of rooms) {
        build.light(
          room.x + room.w / 2,
          FLOOR_HEIGHT - 0.55,
          room.z + room.d / 2,
          climate.color,
          climate.intensity * 4.5,
          Math.max(room.w, room.d) * 1.5,
        );
      }

      const mesh = build.finish(`interior:${interior.id}:andar-${floor}`);
      mesh.traverse((object) => {
        const candidate = object as THREE.Mesh;
        if (candidate.geometry) this.geometries.add(candidate.geometry);
      });
      this.group.add(mesh);
      this.colliders.push(...build.colliders);
      for (const light of build.lights) {
        this.group.add(light);
        this.lights.push(light);
      }
      this.interactables.push(...build.interactables);
    }

    // Interativos dos móveis declarados: continuam vindo dos dados,
    // com ou sem acabamento, para que a lista de ações do prédio não
    // dependa de quem desenhou a cadeira.
    for (const prop of interior.props) this.addPropInteractable(prop, interior);

    // Entrada: a porta fica no muro, e o jogador nasce um passo para
    // dentro dela — não em cima dela, como antes.
    const entrance = interior.entrance ?? { x: interior.spawn.x, z: interior.spawn.z, yaw: interior.spawn.heading };
    this.spawn = {
      x: origin.x + interior.spawn.x,
      y: this.floorY,
      z: origin.z + interior.spawn.z,
      heading: interior.spawn.heading,
    };
    this.buildEntrance(interior, entrance);

    // Gente. Quem é do panteão ganha o modelo oficial; o resto, a
    // figura simples da casa — que é barata o bastante para dez por
    // loja num celular, e é para isso que ela existe.
    // Onde fica o piso para quem anda aqui dentro. Fora do vão da
    // escada é o andar; dentro dele, o degrau — a mesma geometria em
    // que o jogador pisa, para que ninguém flutue na diagonal.
    const stair = Math.max(1, interior.floors) > 1 ? stairwellOf(interior) : null;
    const topFloor = Math.max(1, interior.floors) - 1;
    const floorHeight: FloorHeight = (x, z, floor) => {
      if (stair) {
        const rise = stairHeightAt(stair, x, z);
        // O lance pertence sempre ao andar de baixo: quem desce o
        // usa de cima para baixo, e as alturas batem nos dois sentidos.
        if (rise !== null) {
          const lower = Math.min(Math.max(0, Math.floor(floor + 0.001)), Math.max(0, topFloor - 1));
          return lower * FLOOR_HEIGHT + rise;
        }
      }
      return floor * FLOOR_HEIGHT;
    };

    this.people = new InteriorPeople(this.palette, origin, 0, floorHeight);
    people.forEach((spec, index) => {
      const floor = peopleFloors[index] ?? 0;
      const baseY = floor * FLOOR_HEIGHT;
      if (spec.character && this.addOfficialResident(spec, origin, baseY)) return;
      this.people?.add({ ...spec, baseY, floor: spec.floor ?? floor });
    });
    this.group.add(this.people.group);

    // A física passa a servir o interior: sem relevo, sem limite
    // circular. É o que impede o jogador de "nadar" dentro do prédio.
    physics.setIndoor(this.floorY);

    if (this.quality) this.applyQuality(this.quality);
    this.group.visible = true;
    this.options.onInteractables(this.interactables);
  }

  unload(_interior: InteriorDef): void {
    this.group.visible = false;
    // Desfaz onde se fez — ver `bound`.
    const physics = this.bound ?? this.physics;
    physics.setIndoor(null);
    for (const collider of this.colliders) physics.remove(collider);
    this.bound = null;
    this.colliders.length = 0;
    for (const light of this.lights) {
      light.removeFromParent();
      light.dispose?.();
    }
    this.lights.length = 0;
    this.people?.dispose();
    this.people = null;
    for (const resident of this.residents) resident.avatar.dispose();
    this.residents.length = 0;
    for (const geometry of this.geometries) geometry.dispose();
    this.geometries.clear();
    this.group.clear();
    this.interactables.length = 0;
    this.current = null;
    this.spawn = null;
    this.options.onInteractables(this.interactables);
  }

  /** Move quem mora aqui. Chamado todo quadro enquanto se está dentro. */
  update(dt: number, elapsed: number): void {
    if (!this.current) return;
    this.people?.update(dt, elapsed);
    for (const resident of this.residents) {
      const pose = resident.animator.update(dt, { state: 'idle', speed: 0, stridePhase: 0, verticalSpeed: 0, elapsed });
      resident.avatar.applyPose(pose, elapsed);
      resident.avatar.updateFace(dt);
    }
  }

  /**
   * Põe um personagem oficial de pé dentro do prédio.
   *
   * O modelo vem da mesma fábrica que o `NpcSystem` usa ao ar livre:
   * é literalmente o mesmo corpo, com a mesma escala e a mesma
   * gestação de cânone.
   *
   * @returns `false` se o id não for de um personagem oficial — aí a
   *   pessoa vira uma figura comum, e não um buraco na loja.
   */
  private addOfficialResident(spec: PersonSpec, origin: { x: number; z: number }, baseY: number): boolean {
    const avatar = createOfficialAvatar(spec.character as string, { fill: 0.14, shadows: this.quality?.shadows ?? true });
    if (!avatar) return false;
    avatar.root.position.set(origin.x + spec.x, this.floorY + baseY, origin.z + spec.z);
    avatar.root.rotation.y = spec.yaw ?? 0;
    this.group.add(avatar.root);
    this.residents.push({ avatar, animator: new AvatarAnimator() });
    return true;
  }

  /**
   * Respeita o nível de qualidade escolhido.
   *
   * Num celular fraco, o que pesa num interior são as luzes pontuais e
   * as sombras — não o número de caixas, que o batcher já funde. Então
   * é isso que se corta, e a mobília continua inteira.
   */
  applyQuality(profile: QualityProfile): void {
    this.quality = profile;
    const budget = profile.level === 'baixa' ? 6 : profile.level === 'media' ? 12 : 64;
    let used = 0;
    for (const light of this.lights) {
      if (light instanceof THREE.HemisphereLight) continue;
      used += 1;
      light.visible = used <= budget;
    }
    this.group.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh) mesh.castShadow = profile.shadows;
    });
  }

  dispose(): void {
    if (this.current) this.unload(this.current);
    this.palette.dispose();
    this.group.removeFromParent();
  }

  /* ------------------------------ entrada ------------------------------ */

  private buildEntrance(interior: InteriorDef, entrance: { x: number; z: number; yaw: number }): void {
    const build = new InteriorBuild({
      origin: INTERIOR_ORIGIN,
      palette: this.palette,
      physics: this.bound ?? this.physics,
      baseY: 0,
      tag: 'interior',
    });
    build.door(entrance.x, entrance.z, entrance.yaw, { label: 'entrada' });
    const mesh = build.finish(`interior:${interior.id}:porta`);
    mesh.traverse((object) => {
      const candidate = object as THREE.Mesh;
      if (candidate.geometry) this.geometries.add(candidate.geometry);
    });
    this.group.add(mesh);
    this.colliders.push(...build.colliders);

    this.interactables.push({
      id: `interior:saida:${interior.id}`,
      name: interior.name,
      action: 'Sair',
      position: new THREE.Vector3(INTERIOR_ORIGIN.x + entrance.x, this.floorY + 1.2, INTERIOR_ORIGIN.z + entrance.z),
      range: 3.2,
      enabled: true,
      payload: { type: 'porta', interiorId: interior.id, exit: { regionId: interior.regionId, x: 0, z: 0, heading: 0 } },
    });
  }

  /* ------------------------------ móveis ------------------------------- */

  private addPropInteractable(prop: InteriorProp, interior: InteriorDef): void {
    const x = INTERIOR_ORIGIN.x + prop.x;
    const z = INTERIOR_ORIGIN.z + prop.z;
    const y = this.floorY + prop.floor * FLOOR_HEIGHT + 1.1;
    this.interactables.push({
      id: `interior:${interior.id}:${prop.id}`,
      name: prop.name,
      action: ACTION_LABEL[prop.action],
      position: new THREE.Vector3(x, y, z),
      range: 2.8,
      enabled: true,
      payload: this.payloadFor(prop, interior, x, z),
    });
  }

  private payloadFor(prop: InteriorProp, interior: InteriorDef, x: number, z: number): InteractionPayload {
    if (prop.action === 'sentar') {
      return { type: 'assento', seat: { x, y: this.floorY + prop.floor * FLOOR_HEIGHT + 0.6, z, heading: 0 } };
    }
    if (prop.action === 'conversar') {
      const resolved = this.options.resolvePerson?.(interior.residents[0] ?? prop.id, prop);
      if (resolved) return { type: 'conversa', personId: resolved.personId, divino: resolved.divino };
    }
    return {
      type: 'placa',
      title: prop.name,
      paragraphs: [prop.note],
      entryId: `interior:${interior.id}:${prop.id}`,
    };
  }

  /**
   * Mobília genérica, para ambientes sem acabamento próprio.
   *
   * Não tenta ser bonita: tenta ser **sólida e presente**, para que um
   * interior recém-declarado já tenha volume, sombra e algo em que
   * esbarrar enquanto ninguém o decorou.
   */
  private buildGenericProp(build: InteriorBuild, prop: InteriorProp): void {
    const palette = build.palette;
    const rng = createRng(prop.id.length * 131 + prop.x * 7 + prop.z * 13);
    const place = build.at(prop.x, prop.z, 0);

    switch (prop.action) {
      case 'sentar': {
        const wide = /cama|sofá|sofa/i.test(prop.name);
        place.box(wide ? 2.0 : 1.3, 0.24, wide ? 1.7 : 1.1, palette.fabric, 0, 0.46, 0);
        place.box(wide ? 2.0 : 1.3, 0.62, 0.2, palette.wood, 0, 0.78, -(wide ? 0.78 : 0.48));
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) place.cyl(0.06, 0.06, 0.36, 8, palette.chrome, sx * 0.5, 0.18, sz * 0.42);
        place.solid(wide ? 1.0 : 0.66, wide ? 0.86 : 0.56, 0.8, prop.id);
        break;
      }
      case 'comprar': {
        place.box(2.6, 1.0, 1.1, palette.gloss, 0, 0.5, 0);
        place.box(2.8, 0.08, 1.25, palette.trim, 0, 1.03, 0);
        place.box(2.4, 0.08, 0.04, palette.neonAqua, 0, 0.3, 0.56);
        place.solid(1.4, 0.6, 1.08, prop.id);
        break;
      }
      case 'olhar': {
        place.box(1.9, 2.0, 0.44, palette.woodDark, 0, 1.0, 0);
        for (let i = 0; i < 3; i += 1) {
          place.box(1.8, 0.06, 0.4, palette.wood, 0, 0.52 + i * 0.5, 0.02);
          for (let k = 0; k < 4; k += 1) {
            const s = randRange(rng, 0.12, 0.22);
            place.box(s, s * 1.9, s, k % 2 ? palette.glossAqua : palette.glossRose, -0.72 + k * 0.48, 0.62 + i * 0.5 + s, 0.06);
          }
        }
        place.solid(0.95, 0.22, 2.0, prop.id);
        break;
      }
      case 'conversar': {
        place.cyl(0.78, 0.84, 0.07, 20, palette.neonAqua, 0, 0.04, 0);
        place.cyl(0.6, 0.6, 0.02, 20, palette.gloss, 0, 0.08, 0);
        break;
      }
      case 'usar': {
        place.box(1.5, 0.9, 1.1, palette.aluminium, 0, 0.45, 0);
        place.box(1.3, 0.06, 0.9, palette.trim, 0, 0.93, 0);
        place.box(0.8, 0.5, 0.04, palette.screen, 0, 1.25, -0.2);
        place.solid(0.78, 0.58, 1.2, prop.id);
        break;
      }
      default: {
        for (let i = 0; i < 6; i += 1) {
          place.box(1.7, 0.16, 0.44, palette.floorLight, 0, 0.17 + i * 0.3, -1.2 + i * 0.44);
          place.walkable(0.85, 0.22, 0.25 + i * 0.3, `degrau:${prop.id}:${i}`, 0, -1.2 + i * 0.44);
        }
        break;
      }
    }
  }
}

/** Reexportado para quem precise medir a altura de um andar. */
export { FLOOR_HEIGHT };
export type { InteriorRoom };

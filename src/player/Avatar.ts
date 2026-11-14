import * as THREE from 'three';
import { MAX_INTENSITY, aftersMorphGLSL } from '../afters/AftersMorph';
import { MAX_GESTATION, gestationGLSL } from './Gestation';
import { clamp } from '../utils/math';
import { Ch, type Pose } from './AvatarAnimator';
import { type Expression, FaceController, buildFaceGeometry } from './AvatarFace';
import { type AvatarAppearance, DEFAULT_APPEARANCE } from './AvatarAppearance';
import { buildBodyGeometry } from './body/BodyBuilder';
import {
  BODY_DETAIL,
  type BodyDetailLevel,
  type BodyMetrics,
  Bone,
  bodyMetrics,
  createSkeleton,
  poseSkirt,
} from './body/BodyRig';
import { type BodyProportions, DEFAULT_PROPORTIONS, sameProportions, sanitizeProportions } from './body/BodyProportions';

export { HIP_HEIGHT } from './body/BodyRig';
export type { BodyProportions } from './body/BodyProportions';

/** Quanto o ombro abre por unidade de AfterBust® (0–2.5). */
const SHOULDER_SPREAD = 0.034;
/** Quanto a perna abre por unidade de AfterCurve® (0–2.5). */
const LEG_SPREAD = 0.022;
/** Quanto o braço afasta do corpo na gestação plena: contorna o ventre. */
const GESTATION_SHOULDER_SPREAD = 0.04;
/**
 * Inclinação do tronco para trás na gestação plena (radianos).
 *
 * É o contrapeso que o corpo faz sozinho quando o centro de massa anda
 * para a frente. Pequeno de propósito: sem isto a postura fica de quem
 * engoliu uma bola; com exagero, de quem está caindo para trás.
 */
const GESTATION_LEAN = 0.075;

/** Semente estável por aparência: desencontra as piscadas entre habitantes. */
function seedFrom(appearance: AvatarAppearance): number {
  const text = `${appearance.skin}${appearance.hairColor}${appearance.hairStyle}${appearance.outfit}`;
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash % 100000);
}

/**
 * GLSL que leva a deformação dos Afters e da gestação para o corpo único.
 *
 * As bandas dos dois sistemas foram escritas quando cada junta era uma
 * malha, e medem altura e raio **no espaço da junta**. A malha agora é
 * uma só, autorada no espaço do quadril. Em vez de reescrever a
 * matemática — que tem teste comparando TypeScript e GLSL vértice a
 * vértice —, cada vértice carrega a origem da sua junta num atributo,
 * e aqui a gente subtrai antes e soma depois.
 *
 * Três linhas de indireção no lugar de duas matemáticas divergindo com
 * o tempo.
 */
function bodyMorphGLSL(): string {
  return `
attribute vec3 aMorphOrigin;

vec3 edenBodyPosition(vec3 pos) {
  vec3 o = aMorphOrigin;
  return edenGestationPosition(edenAftersPosition(pos - o)) + o;
}

vec3 edenBodyNormal(vec3 pos, vec3 nrm) {
  vec3 o = aMorphOrigin;
  vec3 local = pos - o;
  return edenGestationNormal(local, edenAftersNormal(local, nrm));
}
`;
}

/**
 * Avatar orgânico do EDENWORLD, 100% procedural.
 *
 * **Um corpo, não onze peças.** Até o Marco M o avatar era uma pilha de
 * malhas rígidas — quadril, tronco, cabeça, dois braços, dois
 * antebraços, duas coxas, duas canelas — cada uma girando inteira na
 * sua junta. Era de onde vinha a aparência de boneco articulado: o
 * cotovelo não dobrava, ele *rodava um pedaço*, e na dobra uma
 * primitiva entrava na outra.
 *
 * Agora há uma malha indexada só, com pesos de esqueleto, costurada
 * sobre os mesmos onze ossos. Os vértices perto de uma articulação
 * pertencem aos dois ossos ao mesmo tempo, em proporção, e por isso a
 * superfície **dobra** em vez de quebrar. Os nomes dos ossos e as
 * posições relativas são os mesmos de antes, então `AvatarAnimator`,
 * `Gestures` e `PlayerMotor` não souberam da troca.
 *
 * Três chamadas de desenho: corpo, rosto e auréola.
 */
export class Avatar {
  /** Origem nos pés; `rotation.y` é a direção do personagem. */
  readonly root = new THREE.Group();
  private readonly scaler = new THREE.Group();
  private readonly pivot = new THREE.Group();
  private body: THREE.SkinnedMesh;
  private bones: THREE.Bone[] = [];
  private metrics: BodyMetrics;
  /** Sobrancelhas, pálpebras e boca: a malha que muda de expressão. */
  private readonly faceMesh: THREE.Mesh;
  /** Mistura de expressões, fala e piscadas. */
  readonly face: FaceController;
  private readonly halo: THREE.Mesh;
  private readonly material: THREE.MeshStandardMaterial;
  /** Material de profundidade com a mesma deformação: a sombra acompanha. */
  private readonly depthMaterial: THREE.MeshDepthMaterial;
  private readonly haloMaterial: THREE.MeshBasicMaterial;
  /** Fração da cor própria somada à luz recebida (uniforme do shader). */
  private readonly fillUniform = { value: 0.1 };
  /** Intensidade do AfterBust® aplicada à silhueta (0–2.5). */
  private readonly bustUniform = { value: 0 };
  /** Intensidade do AfterCurve® aplicada à silhueta (0–2.5). */
  private readonly curveUniform = { value: 0 };
  /** Gestação (0–1). Traço de personagem, não produto: ver `Gestation.ts`. */
  private readonly gestationUniform = { value: 0 };
  private current: AvatarAppearance = DEFAULT_APPEARANCE;
  private currentProportions: BodyProportions = DEFAULT_PROPORTIONS;
  private currentDetail: BodyDetailLevel = 'alta';
  private shadowsOn = true;

  constructor(appearance: AvatarAppearance = DEFAULT_APPEARANCE, proportions: BodyProportions = DEFAULT_PROPORTIONS) {
    this.root.name = 'avatar';
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.52, metalness: 0.02 });
    this.material.name = 'avatar';
    // Luz de preenchimento: soma um pouco da própria cor para que a pele e as
    // roupas não fiquem acinzentadas na sombra (a luz ambiente é azulada).
    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.avatarFill = this.fillUniform;
      shader.uniforms.uBust = this.bustUniform;
      shader.uniforms.uCurve = this.curveUniform;
      shader.uniforms.uGestation = this.gestationUniform;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float avatarFill;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += diffuseColor.rgb * avatarFill;');
      // A deformação acontece no espaço de bind, **antes** da pele: é por
      // isso que o volume continua certo com o braço levantado ou o corpo
      // sentado. O Three.js injeta o `skinning_vertex` logo depois deste
      // ponto, então a ordem sai de graça.
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${aftersMorphGLSL()}\n${gestationGLSL()}\n${bodyMorphGLSL()}`)
        .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n\tobjectNormal = edenBodyNormal(position, objectNormal);')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n\ttransformed = edenBodyPosition(transformed);');
    };
    this.material.customProgramCacheKey = () => 'eden-avatar-organico';

    // O mapa de sombras usa um material próprio: sem isto a sombra do
    // avatar continuaria com a silhueta antiga enquanto o corpo muda.
    this.depthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    this.depthMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.uBust = this.bustUniform;
      shader.uniforms.uCurve = this.curveUniform;
      shader.uniforms.uGestation = this.gestationUniform;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${aftersMorphGLSL()}\n${gestationGLSL()}\n${bodyMorphGLSL()}`)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n\ttransformed = edenBodyPosition(transformed);');
    };
    this.depthMaterial.customProgramCacheKey = () => 'eden-avatar-organico-profundidade';
    this.haloMaterial = new THREE.MeshBasicMaterial({ color: 0xfff2a8, toneMapped: false });

    this.faceMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    this.faceMesh.name = 'rosto';
    this.faceMesh.castShadow = false;
    this.faceMesh.receiveShadow = false;
    this.face = new FaceController(seedFrom(appearance));

    this.halo = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.016, 8, 28), this.haloMaterial);
    this.halo.rotation.x = Math.PI / 2;
    this.halo.position.set(0, 0.44, 0);
    this.halo.visible = false;

    this.root.add(this.scaler);
    this.scaler.add(this.pivot);

    this.currentProportions = sanitizeProportions({ ...proportions, height: appearance.height });
    this.metrics = bodyMetrics(this.currentProportions);
    const rig = this.rebuild(appearance, this.currentProportions, this.currentDetail);
    this.body = rig.body;
    this.bones = rig.bones;
    this.current = { ...appearance };
  }

  /* ----------------------------- construção ----------------------------- */

  /**
   * Monta malha, esqueleto e rosto do zero.
   *
   * O esqueleto é refeito junto com a malha porque as medidas mudam o
   * comprimento dos ossos: um corpo de pernas longas tem a junta do
   * joelho mais embaixo, e a malha foi autorada com ela ali. Vincular
   * uma malha nova a um esqueleto velho é a receita de membro esticado.
   */
  private rebuild(
    appearance: AvatarAppearance,
    proportions: BodyProportions,
    detail: BodyDetailLevel,
  ): { body: THREE.SkinnedMesh; bones: THREE.Bone[] } {
    const metrics = bodyMetrics(proportions);
    this.metrics = metrics;
    const geometry = buildBodyGeometry(appearance, proportions, metrics, BODY_DETAIL[detail]);
    const rig = createSkeleton(metrics);

    const body = new THREE.SkinnedMesh(geometry, this.material);
    body.name = 'corpo';
    body.customDepthMaterial = this.depthMaterial;
    body.castShadow = this.shadowsOn;
    body.receiveShadow = false;
    // Vincular com a malha fora da cena: a matriz de bind sai identidade
    // e o Three.js recalcula `bindMatrixInverse` a cada quadro a partir
    // da matriz de mundo. O avatar pode ser movido, girado e escalado à
    // vontade depois disso.
    body.add(rig.root);
    body.bind(rig.skeleton);

    // O rosto é uma malha à parte porque tem alvos de morph próprios —
    // e fica pendurado no osso da cabeça, que é um `Object3D` como
    // qualquer outro. Vira e inclina junto sem uma linha de código.
    rig.bones[Bone.Head].add(this.faceMesh);
    rig.bones[Bone.Head].add(this.halo);
    this.faceMesh.scale.setScalar(proportions.headSize);
    this.halo.position.y = 0.44 * proportions.headSize;

    this.pivot.add(body);
    this.pivot.position.y = metrics.hipHeight;
    this.scaler.scale.setScalar(proportions.height);

    this.applyFaceGeometry(appearance);
    // Os ossos entram no campo antes do acerto das juntas: o construtor
    // chama este método, e `updateRig` lê `this.bones`.
    this.bones = rig.bones;
    this.updateRig();
    return { body, bones: rig.bones };
  }

  /** Troca a geometria do rosto e reinicia os pesos de morph. */
  private applyFaceGeometry(appearance: AvatarAppearance): void {
    const previous = this.faceMesh.geometry;
    const next = buildFaceGeometry(appearance);
    // O material do corpo declara `aMorphOrigin`; o rosto nunca deforma,
    // mas o atributo precisa existir para o shader ser um só.
    if (!next.getAttribute('aMorphOrigin')) {
      const count = next.getAttribute('position').count;
      next.setAttribute('aMorphOrigin', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    }
    this.faceMesh.geometry = next;
    this.faceMesh.updateMorphTargets();
    this.face.reset();
    if (previous !== next) previous.dispose();
  }

  /** Desmonta a malha e o esqueleto atuais, preservando rosto e auréola. */
  private teardown(): void {
    this.faceMesh.removeFromParent();
    this.halo.removeFromParent();
    this.body.geometry.dispose();
    this.body.skeleton.dispose();
    this.body.removeFromParent();
  }

  /* -------------------------------- estado ------------------------------- */

  get appearance(): AvatarAppearance {
    return this.current;
  }

  /** As medidas do corpo em vigor. */
  get proportions(): BodyProportions {
    return this.currentProportions;
  }

  /** As medidas em metros derivadas delas. */
  get measurements(): BodyMetrics {
    return this.metrics;
  }

  /** Nível de detalhe da malha em vigor. */
  get detail(): BodyDetailLevel {
    return this.currentDetail;
  }

  setAppearance(appearance: AvatarAppearance): void {
    this.setBody(appearance, { ...this.currentProportions, height: appearance.height });
  }

  /**
   * Troca as medidas do corpo sem mexer nas cores nem na roupa.
   *
   * Reconstrói a malha, que é caro — mas acontece quando um habitante
   * entra em cena, não a cada quadro, e é o preço de cada pessoa da
   * praça ter um corpo em vez de todas terem o mesmo.
   */
  setProportions(proportions: BodyProportions): void {
    this.setBody(this.current, proportions);
  }

  /**
   * Troca o nível de detalhe da malha.
   *
   * É o LOD do personagem: a mesma pessoa, com menos anéis por membro.
   * A silhueta e as proporções não mudam — só a contagem de vértices —
   * então ninguém encolhe nem engorda ao mudar a qualidade gráfica.
   */
  setDetail(detail: BodyDetailLevel): void {
    if (detail === this.currentDetail) return;
    this.currentDetail = detail;
    this.setBody(this.current, this.currentProportions, true);
  }

  private setBody(appearance: AvatarAppearance, proportions: BodyProportions, force = false): void {
    const next = sanitizeProportions({ ...proportions, height: appearance.height });
    const sameLook =
      !force &&
      this.current.skin === appearance.skin &&
      this.current.hairStyle === appearance.hairStyle &&
      this.current.hairColor === appearance.hairColor &&
      this.current.eyeColor === appearance.eyeColor &&
      this.current.outfit === appearance.outfit &&
      this.current.topColor === appearance.topColor &&
      this.current.bottomColor === appearance.bottomColor &&
      this.current.shoeColor === appearance.shoeColor &&
      this.current.accessory === appearance.accessory &&
      sameProportions(this.currentProportions, next);

    this.current = { ...appearance };
    this.currentProportions = next;

    if (sameLook) {
      // Só a escala mudou: não vale reconstruir dez mil vértices por isso.
      this.scaler.scale.setScalar(next.height);
      this.halo.visible = appearance.accessory === 'aureola';
      return;
    }

    this.teardown();
    const rig = this.rebuild(appearance, next, this.currentDetail);
    this.body = rig.body;
    this.bones = rig.bones;
    this.halo.visible = appearance.accessory === 'aureola';
    this.setShadows(this.shadowsOn);
  }

  /**
   * Transformação de silhueta dos Afters®, aplicada ao vivo.
   *
   * Escrever aqui custa dois `float`: não reconstrói geometria, não troca
   * material e não interrompe a animação. `0, 0` devolve exatamente a
   * silhueta original.
   *
   * @param bust intensidade do AfterBust® (0 a 2.5, ou seja 0% a 250%)
   * @param curve intensidade do AfterCurve® (0 a 2.5)
   */
  setMorph(bust: number, curve: number): void {
    this.bustUniform.value = clamp(bust, 0, MAX_INTENSITY);
    this.curveUniform.value = clamp(curve, 0, MAX_INTENSITY);
    this.updateRig();
  }

  /**
   * Gestação do personagem (0 = não gestante, 1 = gestação plena).
   *
   * Não é um produto Afters e não aparece em interface nenhuma: é um
   * traço de identidade, declarado em `EdenCharacter.gestation`. Custa um
   * `float` — não reconstrói geometria nem interrompe a animação, então o
   * ventre continua correto andando, sentada ou conversando.
   */
  setGestation(value: number): void {
    this.gestationUniform.value = clamp(value, 0, MAX_GESTATION);
    this.updateRig();
  }

  /** Gestação em vigor (0–1). */
  get gestation(): number {
    return this.gestationUniform.value;
  }

  /**
   * Acerta as juntas em volta do volume do corpo.
   *
   * Deslocamento de junta, não deformação: braços e pernas continuam do
   * mesmo tamanho, só deixam de atravessar o corpo quando ele é mais
   * largo — por Afters ou por gestação.
   */
  private updateRig(): void {
    const shoulder = this.metrics.shoulderX + this.bustUniform.value * SHOULDER_SPREAD + this.gestationUniform.value * GESTATION_SHOULDER_SPREAD;
    this.bones[Bone.ArmL].position.x = shoulder;
    this.bones[Bone.ArmR].position.x = -shoulder;
    const leg = this.metrics.legX + this.curveUniform.value * LEG_SPREAD;
    this.bones[Bone.ThighL].position.x = leg;
    this.bones[Bone.ThighR].position.x = -leg;
  }

  /** Intensidades em vigor neste instante (já limitadas). */
  get morph(): { bust: number; curve: number } {
    return { bust: this.bustUniform.value, curve: this.curveUniform.value };
  }

  /**
   * Troca a expressão do rosto. A mudança é suave: os pesos de morph
   * caminham até o alvo em alguns décimos de segundo.
   */
  setExpression(expression: Expression): void {
    this.face.setExpression(expression);
  }

  /** Nível de fala (0–1): a boca abre e fecha enquanto o texto aparece. */
  setTalking(level: number): void {
    this.face.setTalking(level);
  }

  /** Expressão em vigor. */
  get expression(): Expression {
    return this.face.expression;
  }

  /**
   * Avança o rosto e copia os pesos para a malha.
   *
   * Separado de `applyPose` porque o corpo e o rosto têm ritmos diferentes:
   * a pose vem do animador a cada quadro, o rosto anda sozinho (piscadas,
   * boca) mesmo quando a pose não muda.
   */
  updateFace(dt: number): void {
    this.face.update(dt);
    const influences = this.faceMesh.morphTargetInfluences;
    if (!influences) return;
    const weights = this.face.weights;
    for (let i = 0; i < influences.length && i < weights.length; i += 1) influences[i] = weights[i];
  }

  /** Intensidade da luz de preenchimento (0 = só a luz do cenário). */
  get fill(): number {
    return this.fillUniform.value;
  }

  set fill(value: number) {
    this.fillUniform.value = value;
  }

  /** Altura aproximada do topo da cabeça (para etiquetas e câmera). */
  get topHeight(): number {
    return (this.metrics.hipHeight + this.metrics.crown) * this.currentProportions.height;
  }

  applyPose(pose: Pose, elapsed = 0): void {
    const b = this.bones;
    this.pivot.position.y = this.metrics.hipHeight + pose[Ch.HipsY];
    this.pivot.rotation.x = pose[Ch.BodyPitch];
    // O contrapeso da gestação é somado à pose, nunca escrito por cima:
    // o animador reescreve `pose` a cada quadro, e um valor absoluto aqui
    // apagaria o gesto que estiver em andamento.
    b[Bone.Torso].rotation.set(pose[Ch.TorsoX] - this.gestationUniform.value * GESTATION_LEAN, pose[Ch.TorsoY], pose[Ch.TorsoZ]);
    b[Bone.Head].rotation.set(pose[Ch.HeadX], pose[Ch.HeadY], 0);
    b[Bone.ArmL].rotation.set(pose[Ch.ArmLX], 0, pose[Ch.ArmLZ]);
    b[Bone.ArmR].rotation.set(pose[Ch.ArmRX], 0, pose[Ch.ArmRZ]);
    b[Bone.ForeL].rotation.x = pose[Ch.ForeL];
    b[Bone.ForeR].rotation.x = pose[Ch.ForeR];
    b[Bone.ThighL].rotation.set(pose[Ch.LegLX], 0, pose[Ch.LegLZ]);
    b[Bone.ThighR].rotation.set(pose[Ch.LegRX], 0, pose[Ch.LegRZ]);
    b[Bone.ShinL].rotation.x = pose[Ch.ShinL];
    b[Bone.ShinR].rotation.x = pose[Ch.ShinR];
    // A saia lê a mesma pose que o corpo: não há estado próprio nem
    // aviso de "sentou", então vale igual para jogador, NPC e Panteão.
    poseSkirt(b, pose[Ch.LegLX], pose[Ch.LegRX], pose[Ch.LegLZ], pose[Ch.LegRZ]);
    if (this.halo.visible) this.halo.position.y = (0.44 + Math.sin(elapsed * 2.2) * 0.012) * this.currentProportions.headSize;
  }

  setShadows(enabled: boolean): void {
    this.shadowsOn = enabled;
    this.body.castShadow = enabled;
  }

  dispose(): void {
    this.teardown();
    this.faceMesh.geometry.dispose();
    this.halo.geometry.dispose();
    this.material.dispose();
    this.depthMaterial.dispose();
    this.haloMaterial.dispose();
    this.root.removeFromParent();
  }
}

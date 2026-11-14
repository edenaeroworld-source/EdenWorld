import * as THREE from 'three';
import { Avatar } from '../player/Avatar';
import type { BodyProportions } from '../player/Avatar';
import type { AvatarAppearance } from '../player/AvatarAppearance';
import { AvatarAnimator } from '../player/AvatarAnimator';
import type { MotionState } from '../player/PlayerMotor';
import type { Expression } from '../player/Expressions';
import { damp } from '../utils/math';

/**
 * De onde a prévia tira o que mostrar.
 *
 * Tudo aqui é leitura do estado real do jogo. A prévia não guarda
 * cópia de aparência, de proporções nem de intensidade dos Afters —
 * ela pergunta, a cada quadro, e só reconstrói quando a resposta
 * muda. É isso que garante que não existam dois personagens com
 * verdades diferentes.
 */
export interface PreviewSource {
  appearance(): AvatarAppearance;
  proportions(): BodyProportions;
  gestation(): number;
  expression(): Expression;
  /** Estado de movimento do jogador, para a prévia respirar junto. */
  motion(): { state: MotionState; speed: number };
}

export interface PreviewHooks {
  /**
   * Chamado com o avatar da prévia assim que ele existe.
   *
   * É por aqui que o `AftersBodySystem` recebe o novo avatar: o mesmo
   * ator do jogador passa a escrever a silhueta nos dois corpos, com
   * os mesmos valores e a mesma animação. Sem isto a prévia precisaria
   * de um segundo sistema de transformação — exatamente o que não se
   * quer.
   */
  attach(avatar: Avatar): void;
  detach(avatar: Avatar): void;
}

/**
 * Como o contexto da prévia é pedido ao navegador.
 *
 * `alpha: true` é o requisito que torna a janela uma projeção em vez
 * de um quadro: sem ele o canvas vem com fundo opaco e o personagem
 * aparece dentro de uma caixa preta. Fica exportado para que o teste
 * possa cobrar exatamente isto.
 */
export const PREVIEW_RENDERER_OPTIONS = {
  alpha: true,
  antialias: true,
  depth: true,
  stencil: false,
  powerPreference: 'low-power',
} as const;

/** Fábrica do renderizador — trocável nos testes, que não têm WebGL. */
export type PreviewRendererFactory = (canvas: HTMLCanvasElement) => THREE.WebGLRenderer;

const defaultRendererFactory: PreviewRendererFactory = (canvas) => new THREE.WebGLRenderer({ canvas, ...PREVIEW_RENDERER_OPTIONS });

/** Quadros por segundo da prévia. O celular não precisa de 60. */
const PREVIEW_FPS = 30;
/** Giro de vitrine: velocidade angular (rad/s) e amplitude (rad). */
const SPIN_RATE = 0.45;
const SPIN_SWING = 0.55;

/** Limite de densidade de pixels: a janela é pequena, 2x já é nítido. */
const MAX_PIXEL_RATIO = 2;

/**
 * Enquadramento, em frações da altura do próprio personagem.
 *
 * O jogo vai de ~1,56 m a ~1,91 m de topo de cabeça. Um enquadramento
 * fixo ou cortaria o mais alto ou deixaria o mais baixo perdido no
 * meio da janela; medindo em frações, todo mundo aparece do mesmo
 * jeito — da cabeça (com um palmo de folga) até os joelhos.
 */
const FRAME_TOP = 1.1;
const FRAME_BOTTOM = 0.24;
/** Campo de visão vertical da prévia (graus). */
const PREVIEW_FOV = 32;

/**
 * Prévia 3D do personagem dentro do EdenPhone.
 *
 * **Por que um renderizador próprio.** A cena do mundo desenha num
 * canvas que fica atrás de toda a interface; para o personagem
 * aparecer *dentro* do celular ele teria de ser recortado na tela e
 * veria o mundo ao fundo em vez do vidro do aparelho. Um renderizador
 * pequeno, com `alpha: true`, desenha num canvas que é só mais um
 * elemento do celular: o fundo fica realmente transparente, o vidro
 * aqua aparece por trás do personagem e nada precisa de caixa preta.
 *
 * **O que é compartilhado.** A geometria e os materiais vêm da mesma
 * classe `Avatar` do jogador, montada com a mesma aparência e as
 * mesmas proporções; os Afters são escritos pelo mesmo ator. O que
 * não é compartilhado é a simulação: a prévia não tem física, não tem
 * colisão, não tem sombra e roda a 30 quadros.
 */
export class CharacterPreview {
  readonly canvas: HTMLCanvasElement;

  private renderer: THREE.WebGLRenderer | null = null;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(PREVIEW_FOV, 1, 0.1, 20);
  private readonly pivot = new THREE.Group();
  private readonly animator = new AvatarAnimator();
  private avatar: Avatar | null = null;

  /** Assinatura da aparência com que o avatar atual foi montado. */
  private builtAppearance = '';
  private builtProportions = '';
  private spin = 0;
  private clock = 0;
  private stride = 0;
  private running = false;
  private failed = false;
  private width = 0;
  private height = 0;

  constructor(
    private readonly source: PreviewSource,
    private readonly hooks: PreviewHooks,
    private readonly makeRenderer: PreviewRendererFactory = defaultRendererFactory,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'phone-preview__canvas';
    // A prévia é decorativa para quem usa leitor de tela: o estado real
    // está nos controles de Afters e de roupa, com texto.
    this.canvas.setAttribute('aria-hidden', 'true');
    // Um contexto perdido (aba em segundo plano, memória de vídeo
    // apertada) não pode derrubar o celular: a janela some e o resto
    // do aparelho continua inteiro.
    this.canvas.addEventListener('webglcontextlost', this.onContextLost);

    this.scene.add(this.pivot);

    // Luz de estúdio: uma chave morna de cima, um preenchimento frio
    // de baixo. Nada de sombra projetada — a prévia não tem chão.
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(1.4, 2.6, 2.2);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xa6ffe4, 0.9);
    rim.position.set(-1.8, 1.2, -1.6);
    this.scene.add(rim);
    this.scene.add(new THREE.HemisphereLight(0xd2ecff, 0xa6dc9c, 1.25));

    this.frame(1.735);
  }

  /**
   * Recoloca a câmera para enquadrar um personagem de `top` metros.
   *
   * Nada de inclinar: a câmera olha na horizontal, porque apontá-la
   * para baixo encurtaria as pernas e para cima afunilaria a cabeça.
   */
  private frame(top: number): void {
    const half = ((FRAME_TOP - FRAME_BOTTOM) / 2) * top;
    const center = ((FRAME_TOP + FRAME_BOTTOM) / 2) * top;
    const distance = half / Math.tan((PREVIEW_FOV / 2) * THREE.MathUtils.DEG2RAD);
    this.camera.position.set(0, center, distance);
    this.camera.lookAt(0, center, 0);
    this.camera.updateMatrixWorld(true);
  }

  /** `true` quando o contexto WebGL não pôde ser criado. */
  get unavailable(): boolean {
    return this.failed;
  }

  /**
   * Liga a prévia. Só aqui o contexto WebGL é criado: um celular que
   * nunca foi aberto não paga por um segundo contexto.
   */
  start(): void {
    if (this.running || this.failed) return;
    if (!this.renderer) {
      try {
        this.renderer = this.makeRenderer(this.canvas);
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.NeutralToneMapping;
        this.renderer.toneMappingExposure = 1.0;
        // Transparente de verdade: alfa zero, nada de cor de fundo.
        this.renderer.setClearColor(0x000000, 0);
        this.renderer.shadowMap.enabled = false;
      } catch (error) {
        console.warn('[CharacterPreview] sem contexto WebGL para a prévia.', error);
        this.failed = true;
        return;
      }
    }
    this.running = true;
    this.sync(true);
  }

  /**
   * Reapresenta o avatar da prévia ao ator de Afters.
   *
   * Depois de uma viagem o jogo recria o ator com a lista de corpos do
   * mundo; sem isto a prévia continuaria viva mas com a silhueta
   * congelada no valor anterior.
   */
  reattach(): void {
    if (this.avatar) this.hooks.attach(this.avatar);
  }

  /** Desliga a prévia e para de gastar quadros. O avatar é mantido. */
  stop(): void {
    this.running = false;
  }

  get active(): boolean {
    return this.running;
  }

  /**
   * Avança a prévia um quadro.
   *
   * Reconstrói o avatar quando a aparência mudou, acompanha os Afters
   * (que são escritos de fora, pelo ator do jogador) e desenha.
   */
  update(dt: number): void {
    if (!this.running || !this.renderer || this.failed) return;
    this.sync(false);
    const avatar = this.avatar;
    if (!avatar) return;

    this.clock += dt;
    const motion = this.source.motion();
    // A prévia respira junto com o jogador: parado ele respira, andando
    // ele anda. É o mesmo animador do mundo, com a mesma entrada.
    this.stride += dt * motion.speed * 2.1;
    const pose = this.animator.update(dt, {
      state: motion.state,
      speed: motion.speed,
      stridePhase: this.stride,
      verticalSpeed: 0,
      slope: 0,
      elapsed: this.clock,
    });
    avatar.applyPose(pose, this.clock);
    avatar.updateFace(dt);
    avatar.fill = damp(avatar.fill, 0.35, 6, dt);

    // Giro lento de vitrine: vai e volta em torno da frente (±31°) a
    // cada ~14 s, mostrando o perfil sem nunca dar as costas.
    this.spin += dt * SPIN_RATE;
    this.pivot.rotation.y = Math.sin(this.spin) * SPIN_SWING;

    if (!this.resize()) return;
    this.renderer.render(this.scene, this.camera);
  }

  /** Intervalo mínimo entre quadros da prévia, em segundos. */
  get frameInterval(): number {
    return 1 / PREVIEW_FPS;
  }

  /**
   * Relê a fonte e reconstrói o que mudou.
   *
   * Trocar de roupa muda a geometria, então o avatar é remontado;
   * mudar gestação ou expressão é só um número. Os Afters não entram
   * aqui de propósito — quem os escreve é o ator do jogador, no mesmo
   * quadro em que escreve no corpo do mundo.
   */
  private sync(force: boolean): void {
    const appearance = this.source.appearance();
    const proportions = this.source.proportions();
    const appearanceKey = JSON.stringify(appearance);
    const proportionsKey = JSON.stringify(proportions);

    if (force || !this.avatar || appearanceKey !== this.builtAppearance) {
      this.rebuild(appearance, proportions);
    } else if (proportionsKey !== this.builtProportions) {
      this.avatar.setProportions(proportions);
      this.builtProportions = proportionsKey;
    }
    const avatar = this.avatar;
    if (!avatar) return;
    const gestation = this.source.gestation();
    if (avatar.gestation !== gestation) avatar.setGestation(gestation);
    const expression = this.source.expression();
    if (avatar.expression !== expression) avatar.setExpression(expression);
  }

  private rebuild(appearance: AvatarAppearance, proportions: BodyProportions): void {
    const previous = this.avatar;
    if (previous) {
      this.hooks.detach(previous);
      this.pivot.remove(previous.root);
      previous.dispose();
    }
    const avatar = new Avatar(appearance, proportions);
    avatar.setShadows(false);
    avatar.setGestation(this.source.gestation());
    avatar.setExpression(this.source.expression());
    this.pivot.add(avatar.root);
    this.avatar = avatar;
    this.builtAppearance = JSON.stringify(appearance);
    this.builtProportions = JSON.stringify(proportions);
    // Personagem novo, altura nova: o enquadramento acompanha.
    this.frame(avatar.topHeight);
    // Só agora o ator dos Afters conhece o corpo novo: trocar de roupa
    // não pode zerar a silhueta escolhida.
    this.hooks.attach(avatar);
  }

  /** Ajusta o buffer ao tamanho real do elemento. Devolve `false` se não há área. */
  private resize(): boolean {
    const renderer = this.renderer;
    if (!renderer) return false;
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    if (rect.width < 2 || rect.height < 2) return false;
    if (width !== this.width || height !== this.height) {
      this.width = width;
      this.height = height;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
      renderer.setSize(width, height, false);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    }
    return true;
  }

  private readonly onContextLost = (event: Event): void => {
    event.preventDefault();
    this.running = false;
    this.failed = true;
    console.warn('[CharacterPreview] contexto WebGL perdido; a prévia foi desligada.');
  };

  dispose(): void {
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.running = false;
    if (this.avatar) {
      this.hooks.detach(this.avatar);
      this.pivot.remove(this.avatar.root);
      this.avatar.dispose();
      this.avatar = null;
    }
    this.renderer?.dispose();
    this.renderer = null;
  }
}

import * as THREE from 'three';
import type { AftersConfig } from '../afters/AftersCatalog';
import { fromPercent, getAftersPreset } from '../afters/AftersState';
import { AftersBodySystem } from '../afters/AftersBodySystem';
import { AftersSystem } from '../afters/AftersSystem';
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera';
import { type DialogueEffect, DialogueRunner, MemoryFlags, type DialogueTree } from '../characters/Dialogue';
import { CHARACTER_JOURNAL, PANTHEON, getCharacter } from '../characters/Pantheon';
import { EdenSocial } from '../edenos/EdenSocial';
import { libraryFor } from '../edenos/Library';
import { citizenGreeting, citizenWaveBack } from '../npc/CitizenData';
import type { CitizenSim } from '../npc/CitizenSim';
import type { NpcLife } from '../npc/NpcLife';
import { type AftersCityEvent, NpcSystem } from '../npc/NpcSystem';
import { DialogueScreen } from '../interface/DialogueScreen';
import { BUILDINGS, PLAZA } from '../cities/aurora-city/Layout';
import { hasScene } from '../cities';
import { InteriorScene } from '../interiors/InteriorScene';
import { populateRegion, wildlifeBudget } from '../creatures/Wildlife';
import type { ExitPoint } from '../interiors/Interior';
import { type EdenConnectService, OfflineEdenConnect } from '../eden-connect/EdenConnect';
import { InputManager } from '../input/InputManager';
import type { GameAction } from '../input/InputSettings';
import type { GamepadStatus, InputDevice } from '../input/InputTypes';
import { Collectibles } from '../interactions/Collectibles';
import type { Interactable } from '../interactions/Interactable';
import { InteractionSystem } from '../interactions/InteractionSystem';
import { AvatarCreatorScreen } from '../interface/AvatarCreator';
import { EdenPhoneUI, type JournalEntry, type PhoneApp, type PhoneHost, type WeatherChoice } from '../interface/EdenPhoneUI';
import { HUD, type HudHint } from '../interface/HUD';
import { renderBaseMap } from '../interface/MapRenderer';
import { DialogScreen, LoadingScreen, MainMenuScreen, PauseScreen, showErrorScreen } from '../interface/Screens';
import { SettingsScreen } from '../interface/SettingsScreen';
import { UIManager } from '../interface/UIManager';
import type { AvatarAppearance } from '../player/AvatarAppearance';
import { Player } from '../player/Player';
import type { MoveIntent } from '../player/PlayerMotor';
import { LocalSocial, type SocialService } from '../social/SocialSystem';
import { AudioSystem } from '../systems/AudioSystem';
import { Benchmark, type BenchmarkReport, formatReport, readBenchmarkRequest } from '../systems/Benchmark';
import { ProgressSystem } from '../systems/ProgressSystem';
import { CharacterGround } from '../characters/CharacterGround';
import { type GraphicsSettings, QualitySystem, defaultGraphicsSettings, isQualityLevel, suggestQualityLevel } from '../systems/QualitySystem';
import { type LoadStatus, type SaveData, SaveSystem, createNewSave, getBrowserStorage } from '../systems/SaveSystem';
import { CHARACTER_VOICES, VoiceSystem } from '../systems/VoiceSystem';
import { clamp01, formatDistance, formatDuration, wrapAngle } from '../utils/math';
import { World } from '../world/World';
import { type RegionValidation, checkRegionIntegrity, runRegionTransition } from '../world/RegionTransition';
import { checkLightingIsolation } from '../world/SceneLighting';
import { Zone } from '../world/ZoneMap';
import { getRegion } from '../regions/Region';
import { UniverseSystem } from '../universe/UniverseSystem';
import { CAMERA, type DebugFlags, GAME, PLAYER, WORLD, readDebugFlags } from './Config';
import { GameLoop } from './GameLoop';
import { SystemRegistry } from './GameSystem';
import { type Orientation, type PlatformInfo, detectPlatform, orientationOf, shouldSuggestLandscape } from './Platform';
import { Renderer } from './Renderer';

type Mode = 'menu' | 'creator' | 'play' | 'scenic' | 'photo';

const AUTOSAVE_SECONDS = 20;
/** Luz de preenchimento do avatar: no mundo e no estúdio do criador. */
const AVATAR_FILL_WORLD = 0.1;
const AVATAR_FILL_STUDIO = 0.42;
/** A câmera do estúdio fica à frente do avatar, um pouco para o lado (ver `ThirdPersonCamera.enterCreator`). */
const STUDIO_CAMERA_SIDE = 0.35;
/** Espaço livre desejado (m) entre o avatar e a câmera do estúdio. */
const STUDIO_CLEARANCE = 4.6;
/** Giro da câmera ao sair de um portal (rad). */
const PORTAL_CAMERA_TURN = 0.95;
const ABOUT_TEXT = [
  `${GAME.name} ${GAME.versionLabel} é a primeira versão jogável do universo ${GAME.universe}: um passeio livre por Aurora City, direto no navegador.`,
  'Explore a Praça Central, o Parque das Águas, os Jardins Suspensos, o Mirante Celeste, a Orla Cristalina e o Distrito Cristal. Encontre os Cristais de Luz, ative os portais e leia as placas para preencher seu diário.',
  'Tudo o que você vê e ouve é gerado pelo próprio jogo: não há modelos, texturas ou músicas baixados.',
  'Recursos como Éden Connect, EdenStore, EdenReads, EdenPawl e os eventos do Éden ainda não existem nesta versão e aparecem apenas como "em breve".',
];

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

/** Lê o nome do adaptador gráfico em um contexto temporário (para sugerir a qualidade). */
function probeGpuName(): string {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return 'desconhecido';
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : 'desconhecido';
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return name;
  } catch {
    return 'desconhecido';
  }
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

let filePicker: HTMLInputElement | null = null;

/** Abre o seletor de arquivos do navegador e entrega o arquivo escolhido. */
function pickFile(accept: string, onFile: (file: File) => void): void {
  filePicker?.remove();
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.hidden = true;
  input.setAttribute('aria-hidden', 'true');
  input.tabIndex = -1;
  const discard = (): void => {
    input.remove();
    if (filePicker === input) filePicker = null;
  };
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    discard();
    if (file) onFile(file);
  });
  input.addEventListener('cancel', discard);
  filePicker = input;
  document.body.appendChild(input);
  input.click();
}

function timestamp(): string {
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/**
 * Orquestra o jogo: cria os sistemas, conecta-os entre si e conduz o
 * fluxo carregamento → menu → criador de avatar → exploração.
 */
/**
 * Quanto tempo (s) o habitante fica de conversa antes de voltar a andar.
 * É renovado a cada quadro enquanto a caixa de diálogo estiver aberta,
 * então só conta depois que a conversa acaba ou é interrompida.
 */
const CONVERSATION_HOLD = 8;

export class Engine {
  readonly systems = new SystemRegistry();
  private readonly flags: DebugFlags;
  private readonly renderer: Renderer;
  private readonly scene = new THREE.Scene();
  private readonly rig = new ThirdPersonCamera();
  private readonly world: World;
  private readonly loop: GameLoop;
  private readonly ui: UIManager;
  private readonly hud: HUD;
  private readonly input: InputManager;
  private readonly audio: AudioSystem;
  private readonly voice: VoiceSystem;
  /** Conversa em andamento (quem fala com o jogador agora). */
  private talking: { citizen: CitizenSim | null; characterId: string | null; life: NpcLife | null } | null = null;
  private readonly talkTarget = new THREE.Vector3();
  private readonly saveSystem: SaveSystem;
  private readonly quality: QualitySystem;
  /** Aparelho identificado na abertura: sistema, formato e toque. */
  readonly platform: PlatformInfo = detectPlatform();
  private orientation: Orientation = 'paisagem';
  /** O aviso de "vire o aparelho" aparece uma vez por sessão. */
  private landscapeHintShown = false;
  /** Medição de desempenho em curso (`?bench`), quando pedida. */
  private benchmark: Benchmark | null = null;
  /** Duração pedida por `?bench`, à espera de o jogo começar. */
  private pendingBenchmark: number | null = null;
  /** Último relatório desta sessão (exposto em `__eden.desempenho()`). */
  private lastBenchmark: BenchmarkReport | null = null;
  private readonly connect: EdenConnectService;
  /** Regiões, economia, moradia, bichos, fauna e atividades. */
  private universe: UniverseSystem;
  private readonly social: SocialService;
  private save: SaveData;
  private progress: ProgressSystem;
  private player!: Player;
  private npcs!: NpcSystem;
  private afters!: AftersSystem;
  private aftersBody!: AftersBodySystem;
  private edenSocial: EdenSocial;
  private story: MemoryFlags;
  private collectibles!: Collectibles;
  private interactions!: InteractionSystem;
  private journalEntries: Omit<JournalEntry, 'read'>[] = [];

  private readonly mainMenu: MainMenuScreen;
  private readonly pauseScreen: PauseScreen;
  private readonly settingsScreen: SettingsScreen;
  private readonly creator: AvatarCreatorScreen;
  private readonly phone: EdenPhoneUI;

  private mode: Mode = 'menu';
  private elapsed = 0;
  private jumpQueued = false;
  private readonly intent: MoveIntent = { x: 0, z: 0, run: false, jump: false, jumpHeld: false };
  private readonly focus = new THREE.Vector3();
  private readonly shadowFocus = new THREE.Vector3(PLAZA.x, WORLD.plateauHeight, PLAZA.z);
  private currentAreaId: string | null = null;
  private areaName = 'Praça Central';
  private slowTimer = 0;
  private areaTimer = 0;
  private autosaveTimer = 0;
  private dirty = false;
  private readonly loadStatus: LoadStatus;
  /** `true` depois de avisar que o progresso não está sendo gravado. */
  private saveWarned = false;
  /** Verdadeiro entre gravar um salvamento importado e recarregar a página. */
  private importing = false;
  private graphicsChosen: boolean;
  private readonly qualityOverride: boolean;
  private appearanceBeforeEdit: AvatarAppearance | null = null;
  private baseMapCanvas: HTMLCanvasElement | null = null;
  private weatherChoice: WeatherChoice = 'auto';
  private transitioning = false;
  /** A camada que monta a geometria dos interiores. */
  /**
   * Chão e colisão dos personagens que não são o jogador.
   *
   * Mesma física, mesma resposta: foi a divergência entre esta
   * consulta e `HeightField.getHeight` que deixava habitantes e deuses
   * enterrados em pontes, decks e tablados.
   */
  private characterGround!: CharacterGround;
  private interiorScene: InteriorScene | null = null;
  /** Interativos do interior ativo (vazio quando se está na rua). */
  private interiorInteractables: readonly Interactable[] = [];
  /** De onde o jogador entrou, para a saída devolvê-lo ao mesmo lugar. */
  private interiorReturn: { x: number; z: number; heading: number; y: number } | null = null;
  private sitHintShown = false;
  private creatorDrag: { id: number; x: number } | null = null;
  private frames = 0;
  private lastDistance = 0;
  /** Último volume de música usado (para o interruptor do EdenMusic). */
  private musicMemory = 0.55;
  /** A próxima foto vai para a galeria do EdenGram em vez do disco. */
  private gramCapture = false;
  private disposed = false;

  /** Cria e inicia o jogo. Lança erro se o navegador não oferecer WebGL2. */
  static async start(canvas: HTMLCanvasElement, uiRoot: HTMLElement): Promise<Engine> {
    const engine = new Engine(canvas, uiRoot);
    await engine.init();
    return engine;
  }

  private constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly uiRoot: HTMLElement,
  ) {
    this.flags = readDebugFlags();
    this.saveSystem = new SaveSystem(getBrowserStorage());
    const loaded = this.saveSystem.load();
    this.save = loaded.data;
    this.progress = new ProgressSystem(this.save.progress);
    this.loadStatus = loaded.status;
    this.edenSocial = new EdenSocial(this.save.social);
    this.story = new MemoryFlags(this.save.flags);
    this.universe = new UniverseSystem(this.save);
    this.musicMemory = this.save.settings.audio.music > 0 ? this.save.settings.audio.music : 0.55;
    if (loaded.status === 'corrompido') console.warn('[Save] Salvamento inválido: iniciando um novo jogo.');

    // Qualidade gráfica: preferência salva, ou sugestão conforme o aparelho.
    const suggested = suggestQualityLevel({
      isTouchDevice: this.platform.touch,
      hardwareConcurrency: navigator.hardwareConcurrency || 4,
      deviceMemory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
      gpuName: probeGpuName(),
      platform: this.platform,
    });
    this.graphicsChosen = this.save.settings.graphics !== null;
    let graphics: GraphicsSettings = this.save.settings.graphics ?? defaultGraphicsSettings(suggested, this.platform.mobile);
    this.qualityOverride = isQualityLevel(this.flags.quality);
    if (isQualityLevel(this.flags.quality)) graphics = { ...graphics, quality: this.flags.quality };
    this.quality = new QualitySystem(graphics);

    this.renderer = new Renderer({ canvas, antialias: graphics.quality !== 'baixa' });
    this.renderer.setResolution(this.quality.current);
    this.world = new World(this.scene, this.renderer.three);

    this.ui = new UIManager(uiRoot);
    this.audio = new AudioSystem(this.save.settings.audio, !this.flags.noAudio);
    this.ui.sound = (kind) => this.audio.ui(kind);
    // Voz: sem dublagem gravada no jogo. O sistema existe para clipes
    // futuros e para a síntese do navegador, que o jogador liga se quiser.
    this.voice = new VoiceSystem();
    for (const [id, profile] of Object.entries(CHARACTER_VOICES)) this.voice.setProfile(id, profile);
    this.applyVoiceSettings();
    this.input = new InputManager(canvas, uiRoot, this.save.settings.input, this.platform);
    this.input.keyboard.usePointerLock = this.save.settings.gameplay.pointerLock;
    this.rig.autoAlign = this.save.settings.gameplay.autoCamera;

    this.systems.register(this.universe);
    this.connect = this.systems.register(new OfflineEdenConnect(this.save.profile.name));
    this.social = this.systems.register(new LocalSocial());

    this.hud = new HUD(uiRoot, {
      onPhone: () => this.openPhone('home'),
      onMenu: () => this.pause(),
      onInteract: () => this.handleAction('interact'),
      onExitMode: () => this.exitSpecialMode(),
      onCapture: () => this.capturePhoto(),
      onLeaveBuilding: () => {
        if (this.universe.interiors.isInside) void this.exitInterior();
      },
    });

    this.mainMenu = new MainMenuScreen({
      onContinue: () => this.startFromMenu(),
      onNewGame: () => this.confirmNewGame(),
      onSettings: () => this.ui.open(this.settingsScreen),
      onAbout: () => this.showAbout(),
    });
    this.pauseScreen = new PauseScreen({
      onResume: () => this.ui.close(this.pauseScreen),
      onSettings: () => this.ui.open(this.settingsScreen),
      onAvatar: () => {
        this.ui.close(this.pauseScreen, true);
        this.openCreator(true);
      },
      onUnstuck: () => {
        this.ui.close(this.pauseScreen, true);
        const spawn = this.world.spawn;
        void this.travelTo(spawn.x, spawn.z, spawn.heading, undefined, this.world.regionName);
      },
      onQuit: () => this.quitToMenu(),
    });
    this.settingsScreen = new SettingsScreen({
      save: this.save,
      input: this.input,
      graphics: () => this.quality.graphics,
      setGraphics: (patch) => {
        this.graphicsChosen = true;
        this.quality.update(patch);
        this.dirty = true;
      },
      commit: (kind) => this.commitSettings(kind),
      testVibration: () => this.input.gamepad.vibrate(0.8, 0.5, 260),
      exportSave: () => this.exportSave(),
      importSave: () => this.importSave(),
      resetProgress: () => this.confirmReset(),
      close: () => {
        this.ui.close(this.settingsScreen);
        this.persist();
      },
    });
    this.creator = new AvatarCreatorScreen({
      onPreview: (appearance) => this.player.setAppearance(appearance),
      onConfirm: (name, appearance) => this.finishCreator(name, appearance),
      onCancel: () => this.cancelCreator(),
      onRotate: (delta) => this.rig.addLook(delta, 0),
    });
    this.phone = new EdenPhoneUI(this.createPhoneHost());

    this.loop = new GameLoop((dt, elapsed) => this.frame(dt, elapsed));
    this.loop.onFatalError = (error) => this.fatal(error);
  }

  /* ------------------------------------------------------------------ */
  /* Inicialização                                                       */
  /* ------------------------------------------------------------------ */

  private async init(): Promise<void> {
    const loading = new LoadingScreen(this.uiRoot);
    loading.setProgress(0.02, 'Preparando o Éden…');
    await nextFrame();

    // A região carregada é a do salvamento: quem salvou em Rosas Park
    // acorda em Rosas Park, não em Aurora.
    await this.world.build(async (fraction, label) => {
      loading.setProgress(0.04 + fraction * 0.82, label);
      await nextFrame();
    }, this.universe.regions.currentRegionId);
    const city = this.world.city;

    loading.setProgress(0.9, 'Despertando seu avatar…');
    await nextFrame();

    this.player = new Player(this.scene, this.world.physics, this.save.profile.appearance);
    this.player.name = this.save.profile.name;
    this.player.setListener({
      onJump: () => this.audio.jump(),
      onLand: (impact, surface) => {
        this.audio.land(impact, surface);
        if (impact > 9) this.input.vibrate(0.5, 0.2, 90);
      },
      onStep: (surface, running) => this.audio.step(surface, running),
      onSplash: (strength) => this.audio.splash(strength),
    });
    this.player.teleport(this.world.spawn.x, this.world.spawn.z, this.world.spawn.heading);
    this.player.visible = false;

    this.collectibles = new Collectibles(city.collectibles, (id) => this.progress.hasCrystal(id));
    this.scene.add(this.collectibles.group);

    loading.setProgress(0.92, `Chamando os habitantes de ${this.world.regionName}…`);
    await nextFrame();
    // Lê do mundo a cada chamada, e não de um instantâneo: quando a
    // região é reconstruída, os habitantes acompanham o terreno novo.
    this.characterGround = this.makeCharacterGround();
    this.npcs = this.systems.register(
      new NpcSystem({
        scene: this.scene,
        body: this.characterGround,
        ground: (x, z) => this.world.heightField.getHeight(x, z),
        blocked: (x, z) => {
          if (Math.hypot(x, z) > this.world.boundaryRadius - 8) return true;
          if (this.world.heightField.getHeight(x, z) < WORLD.waterLevel + 0.35) return true;
          return this.world.zones.has(x, z, Zone.Water | Zone.Building);
        },
        quality: this.quality.current,
        regionId: this.universe.regions.currentRegionId,
      }),
    );
    this.afters = this.systems.register(
      new AftersSystem(this.scene, {
        onSound: (kind) => {
          if (kind === 'ligar') this.audio.discovery();
          else if (kind === 'trocar') this.audio.ui('toggle');
          else this.audio.ui('close');
        },
      }),
    );
    this.afters.setConfig(this.save.afters, false);
    // Transformação de silhueta: escreve direto no avatar, quadro a quadro.
    this.aftersBody = this.systems.register(
      new AftersBodySystem({
        onTransition: (_channel, from, to) => {
          if (!this.save.afters.sound) return;
          if (to > from + 0.01) this.audio.discovery();
          else if (to < from - 0.01) this.audio.ui('close');
        },
        onChange: (body) => {
          this.save.afters = { ...this.save.afters, body };
          this.dirty = true;
        },
      }),
    );
    this.aftersBody.setAvatars([this.player.avatar]);
    this.aftersBody.setBody(this.save.afters.body, false);
    // A população usa a mesma tecnologia pelo mesmo sistema: cada habitante
    // ganha um ator com a configuração do próprio perfil.
    this.npcs.attachAfters(this.aftersBody);
    this.npcs.restoreAftersOverrides(this.save.afters.citizens);
    this.npcs.applyAftersEvent(this.cityAftersEvent(), true);

    // Encontros com o panteão viram registros do diário. Valem no
    // universo inteiro, não numa cidade só, então entram uma vez.
    for (const entry of CHARACTER_JOURNAL) this.journalEntries.push(entry);

    this.interactions = new InteractionSystem([]);
    this.registerInteractions();
    this.interactions.onTargetChange = (item) => this.showPrompt(item);

    // A primeira carga é uma transição como qualquer outra: daqui em
    // diante abrir o jogo e viajar percorrem exatamente o mesmo
    // caminho de religação.
    this.applyRegionState(this.universe.regions.currentRegionId);
    this.wireEvents();

    this.quality.onChange((profile) => {
      this.renderer.setResolution(profile);
      this.world.applyQuality(profile);
      this.npcs.applyQuality(profile);
      this.interiorScene?.applyQuality(profile);
      this.afters.applyQuality(profile.particleDensity, profile.environmentEffects);
      this.player.avatar.setShadows(profile.shadows);
      const size = this.renderer.size;
      this.world.setViewport(size.width, size.height, this.renderer.effectivePixelRatio, this.rig.fov);
    });
    this.world.applyQuality(this.quality.current);
    this.afters.applyQuality(this.quality.current.particleDensity, this.quality.current.environmentEffects);
    this.player.avatar.setShadows(this.quality.current.shadows);
    this.renderer.onResize((width, height) => {
      this.rig.setViewport(width, height);
      this.world.setViewport(width, height, this.renderer.effectivePixelRatio, this.rig.fov);
      this.updateCreatorOffset(true);
      this.applyOrientation(orientationOf(width, height));
    });
    this.applyOrientation(orientationOf(this.renderer.size.width, this.renderer.size.height));

    // Compila os shaders antes de mostrar o mundo (evita travadas na primeira visão).
    loading.setProgress(0.95, 'Acendendo a aurora…');
    await nextFrame();
    this.rig.enterOrbit({ x: PLAZA.x, y: 0, z: PLAZA.z }, 60, 18, 9);
    this.rig.update(0.016, this.focus, 0, false, this.world.physics);
    this.world.update(0.016, 0, this.rig.camera, this.shadowFocus, false);
    try {
      await this.renderer.three.compileAsync(this.scene, this.rig.camera);
    } catch {
      /* compilação antecipada é opcional */
    }
    this.renderer.render(this.scene, this.rig.camera);
    loading.setProgress(1, 'Bem-vindo(a) a Aurora City!');
    await nextFrame();

    this.loop.start();
    if (this.flags.skipMenu) {
      if (!this.save.profile.created) this.save.profile.created = true;
      this.enterPlay(this.save.player === null);
    } else {
      this.showMenu();
    }
    if (this.flags.enabled) this.installDebugApi();
    // `?bench` mede o desempenho real deste aparelho — começa quando o
    // jogo começar, não no menu, onde não há cidade para desenhar.
    this.pendingBenchmark = readBenchmarkRequest(typeof location !== 'undefined' ? location.search : '');
    void loading.finish();
    if (!this.saveSystem.persistent) {
      this.saveWarned = true;
      this.hud.toast('Este navegador bloqueou o salvamento: o progresso não será guardado.', 'info', 7);
    } else if (this.loadStatus === 'corrompido') {
      this.hud.toast('Não foi possível ler o salvamento anterior. Um novo jogo foi preparado.', 'info', 8);
    }
  }

  private wireEvents(): void {
    this.ui.onChange = () => this.syncInputState();
    this.input.events.on('action', (action) => this.handleAction(action));
    this.input.events.on('nav', (command) => {
      this.audio.unlock();
      if (!this.ui.handleNav(command) && command === 'menu') this.pause();
    });
    this.input.events.on('device', (device) => this.onDeviceChange(device));
    this.uiRoot.dataset.device = this.input.device;
    this.uiRoot.dataset.platform = this.platform.form;
    this.input.events.on('gamepad', (status) => this.onGamepadStatus(status));
    this.input.events.on('pointerUnlock', () => {
      if (this.mode === 'play' && !this.ui.hasModal) this.pause();
      else if (this.mode === 'scenic' || this.mode === 'photo') this.exitSpecialMode();
    });

    const unlock = (): void => this.audio.unlock();
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pagehide', this.onPageHide);

    this.renderer.onContextLost = () => {
      // Grava antes de parar: a mensagem abaixo promete que o progresso está salvo.
      this.persist();
      this.loop.stop();
      showErrorScreen(this.uiRoot, 'Os gráficos foram interrompidos', ['O navegador suspendeu o contexto gráfico do jogo. Seu progresso está salvo.', 'Recarregue a página para continuar.']);
    };
    this.renderer.onContextRestored = () => location.reload();

    // Girar o avatar arrastando na tela do criador.
    this.canvas.addEventListener('pointerdown', (event) => {
      if (this.mode === 'creator') this.creatorDrag = { id: event.pointerId, x: event.clientX };
    });
    window.addEventListener('pointermove', (event) => {
      const drag = this.creatorDrag;
      if (!drag || drag.id !== event.pointerId || this.mode !== 'creator') return;
      this.rig.addLook((event.clientX - drag.x) * -0.009, 0);
      drag.x = event.clientX;
    });
    const endDrag = (): void => {
      this.creatorDrag = null;
    };
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
  }

  private readonly onVisibility = (): void => {
    if (document.hidden) this.persist();
  };

  private readonly onPageHide = (): void => {
    this.persist();
  };

  private fatal(error: unknown): void {
    console.error('[EDENWORLD] Erro fatal:', error);
    this.persist();
    showErrorScreen(this.uiRoot, 'Algo deu errado', ['O jogo encontrou um erro inesperado e precisou parar. Seu progresso foi salvo.', 'Recarregue a página para continuar explorando Aurora City.']);
  }

  /* ------------------------------------------------------------------ */
  /* Fluxo de telas                                                      */
  /* ------------------------------------------------------------------ */

  private setMode(mode: Mode): void {
    this.mode = mode;
    // No criador o avatar recebe luz de estúdio: cores fiéis a qualquer hora do dia.
    this.player.fillTarget = mode === 'creator' ? AVATAR_FILL_STUDIO : AVATAR_FILL_WORLD;
    this.syncInputState();
    this.maybeSuggestLandscape();
    if (mode === 'play' && this.pendingBenchmark !== null) {
      const seconds = this.pendingBenchmark;
      this.pendingBenchmark = null;
      // Um respiro para a cidade terminar de aparecer antes de cronometrar.
      window.setTimeout(() => this.startBenchmark(seconds), 2000);
    }
  }

  private syncInputState(): void {
    const active = (this.mode === 'play' || this.mode === 'scenic' || this.mode === 'photo') && !this.ui.hasModal && !this.transitioning;
    this.input.setGameplayEnabled(active);
    this.input.setTouchControlsAllowed(this.mode === 'play');
  }

  private showMenu(): void {
    this.setMode('menu');
    this.player.visible = false;
    this.hud.setVisible(false);
    this.rig.enterOrbit({ x: PLAZA.x, y: 0, z: PLAZA.z }, 60, 18, 9);
    this.audio.setMusicActive(true);
    this.mainMenu.configure(this.save.profile.created ? this.save.profile.name : null);
    this.ui.closeAll();
    this.ui.open(this.mainMenu, true);
  }

  private startFromMenu(): void {
    this.audio.unlock();
    this.audio.ui('confirm');
    if (!this.save.profile.created) {
      this.ui.close(this.mainMenu, true);
      this.openCreator(false);
    } else {
      this.enterPlay(this.save.player === null);
    }
  }

  private showAbout(): void {
    const dialog = new DialogScreen({
      id: 'sobre',
      title: `Sobre o ${GAME.name}`,
      paragraphs: ABOUT_TEXT,
      note: `${GAME.versionLabel} (v${GAME.version})`,
      actions: [{ label: 'Fechar', kind: 'ghost', onClick: () => this.ui.close(dialog) }],
    });
    this.ui.open(dialog);
  }

  private confirmNewGame(): void {
    const dialog = new DialogScreen({
      id: 'novo-jogo',
      title: 'Começar um novo jogo?',
      paragraphs: ['Seu avatar e todo o progresso atual (cristais, diário, portais) serão apagados. As configurações serão mantidas.'],
      actions: [
        { label: 'Cancelar', kind: 'ghost', onClick: () => this.ui.close(dialog) },
        {
          label: 'Apagar e começar',
          kind: 'danger',
          onClick: () => {
            this.resetGameState();
            this.ui.closeAll();
            this.openCreator(false);
          },
        },
      ],
      onDismiss: () => this.ui.close(dialog),
    });
    this.ui.open(dialog);
  }

  private confirmReset(): void {
    const dialog = new DialogScreen({
      id: 'apagar',
      title: 'Apagar todo o progresso?',
      paragraphs: ['Seu avatar, cristais, diário e portais serão apagados deste navegador. Esta ação não pode ser desfeita.'],
      actions: [
        { label: 'Cancelar', kind: 'ghost', onClick: () => this.ui.close(dialog) },
        {
          label: 'Apagar progresso',
          kind: 'danger',
          onClick: () => {
            this.resetGameState();
            this.showMenu();
            this.hud.toast('Progresso apagado.', 'info');
          },
        },
      ],
      onDismiss: () => this.ui.close(dialog),
    });
    this.ui.open(dialog);
  }

  /** Zera avatar e progresso, preservando as configurações. */
  private resetGameState(): void {
    const fresh = createNewSave();
    this.save.profile = fresh.profile;
    this.save.player = null;
    this.save.world = fresh.world;
    this.save.progress = fresh.progress;
    this.save.flags = fresh.flags;
    this.save.social = fresh.social;
    this.save.afters = fresh.afters;
    this.save.createdAt = fresh.createdAt;
    const totals = this.progress.totals;
    this.progress = new ProgressSystem(this.save.progress);
    this.progress.totals = totals;
    this.story = new MemoryFlags(this.save.flags);
    this.edenSocial = new EdenSocial(this.save.social);
    // O universo também recomeça: cristais iniciais, nenhuma casa,
    // nenhum bicho, só as regiões que já são conhecidas de saída.
    this.save.regions = fresh.regions;
    this.save.economy = fresh.economy;
    this.save.housing = fresh.housing;
    this.save.pets = fresh.pets;
    this.save.sightings = fresh.sightings;
    this.save.missions = fresh.missions;
    this.save.interiors = fresh.interiors;
    this.universe = new UniverseSystem(this.save);
    this.afters.setConfig(this.save.afters, false);
    this.aftersBody.setBody(this.save.afters.body, false);
    this.npcs.restoreAftersOverrides(this.save.afters.citizens);
    this.collectibles.reset(() => false);
    this.world.city.sphere?.setMode(0);
    this.player.setAppearance(this.save.profile.appearance);
    this.player.name = this.save.profile.name;
    this.connect.setDisplayName(this.save.profile.name);
    this.applyClockFromSave();
    this.currentAreaId = null;
    this.lastDistance = 0;
    this.hud.setLeaveBuilding(null);
    this.saveSystem.save(this.save);
  }

  private applyClockFromSave(): void {
    const clock = this.world.environment.clock;
    clock.setHours(this.save.world.hours);
    clock.day = this.save.world.day;
    clock.pace = this.save.settings.gameplay.timePace;
  }

  /**
   * Grava a hora do mundo antes de desmontar a região.
   *
   * `World.build` cria um relógio novo, que começa às 9h30 — a manhã
   * clara do primeiro dia. Sem guardar a hora corrente antes de
   * descarregar, atravessar um portal à noite devolvia Aurora City em
   * plena manhã: não era um vazamento de material nem de iluminação,
   * era o relógio voltando ao início. Esta é a etapa A da travessia.
   */
  private captureWorldClock(): void {
    const clock = this.world.environment.clock;
    this.save.world = { hours: clock.hours, day: clock.day };
  }

  /**
   * Religa todos os sistemas à região que acabou de ser montada.
   *
   * **Um método só, usado pela primeira carga e por toda viagem.** A
   * razão de existir é essa: enquanto abrir o jogo e atravessar um
   * portal eram dois caminhos diferentes, o segundo esquecia metade
   * do que o primeiro fazia — o relógio, a esfera, os Afters da
   * população, a limpeza do progresso — e a cidade voltava diferente
   * de como tinha ficado.
   *
   * Qualquer região nova que entre no jogo herda isto de graça: basta
   * existir um blueprint, e o cenário, a população, a luz e o
   * progresso são religados pelas mesmas regras.
   */
  private applyRegionState(regionId: string): void {
    const region = this.world.city;

    // Diário: uma entrada por placa com `entryId`, sem repetir as que
    // já foram lidas noutra região.
    const known = new Set(this.journalEntries.map((entry) => entry.id));
    for (const item of region.interactables) {
      if (item.payload.type !== 'placa' || !item.payload.entryId || known.has(item.payload.entryId)) continue;
      known.add(item.payload.entryId);
      this.journalEntries.push({ id: item.payload.entryId, title: item.payload.title, paragraphs: item.payload.paragraphs });
    }

    // A física antiga foi embora com a cidade antiga: a população
    // precisa do chão da região nova antes de dar o primeiro passo.
    this.characterGround = this.makeCharacterGround();
    this.npcs.setBody(this.characterGround);
    this.npcs.setRegion(regionId);
    // Trocar de região respawna os habitantes; a silhueta de cada um
    // volta do salvamento, e não do padrão.
    this.npcs.restoreAftersOverrides(this.save.afters.citizens);
    this.npcs.applyAftersEvent(this.cityAftersEvent(), true);

    // Progresso: contagens e faxina sempre no escopo desta região. O
    // que pertence às outras não é tocado.
    this.progress.setRegion(regionId);
    this.progress.totals = {
      crystals: region.collectibles.length,
      entries: this.journalEntries.length,
      areas: this.world.areas.length,
      portals: region.portals.length,
    };
    this.progress.retainKnown(
      {
        crystals: region.collectibles.map((spot) => spot.id),
        entries: this.journalEntries.map((entry) => entry.id),
        areas: this.world.areas.map((area) => area.id),
        portals: region.portals.map((portal) => portal.id),
      },
      regionId,
    );
    this.progress.refreshPortalReadiness();

    this.refreshInteractables();
    region.sphere?.setMode(this.progress.sphereMode);
    this.applyClockFromSave();
    this.refreshWildlife();
    this.world.applyQuality(this.quality.current);
    this.baseMapCanvas = null;
  }

  /**
   * Etapa D da travessia: a região está jogável?
   *
   * Confere o que o jogador veria de imediato — personagem duplicado,
   * enterrado, flutuando ou fora do mapa. O laudo vai para o console
   * de depuração; o jogo não trava por causa dele, mas nenhum
   * problema passa silenciosamente.
   */
  private validateRegion(regionId: string): RegionValidation {
    const ground = this.characterGround;
    const report = checkRegionIntegrity({
      regionId,
      characters: this.npcs.placedCharacters(),
      groundAt: (x, z) => (ground ? ground.settle(x, z) : this.world.heightField.getHeight(x, z)),
      boundaryRadius: this.world.boundaryRadius,
    });

    // A luz entra na mesma conferência que as posições.
    //
    // Duas vezes a região de destino chegou clara demais porque algo
    // da anterior tinha ficado para trás — primeiro a hora do
    // relógio, depois o sol e a luz de ambiente, que continuavam
    // pendurados na cena. Nos dois casos quem percebeu foi o
    // jogador, olhando. Agora quem percebe é a etapa de validação,
    // na chegada, e o problema sai no console com nome e número.
    const lighting = checkLightingIsolation(this.scene);
    const problems = [...report.problems, ...lighting.problems];

    if (problems.length > 0 && this.flags.enabled) {
      for (const problem of problems) console.warn(`[eden] ${problem}`);
    }
    return { ok: problems.length === 0, problems };
  }

  /**
   * @param stand posição de estúdio (Estação de Estilo); sem ela, o avatar
   *   apenas se vira para o lado em que a câmera tem a vista mais livre.
   */
  private openCreator(editing: boolean, stand?: { x: number; z: number; heading: number }): void {
    this.audio.unlock();
    this.appearanceBeforeEdit = editing ? { ...this.player.avatar.appearance } : null;
    if (!editing) {
      const spawn = this.world.spawn;
      this.player.teleport(spawn.x, spawn.z, spawn.heading);
    } else {
      if (this.player.motor.isSitting) this.player.motor.standUp();
      if (stand) this.player.teleport(stand.x, stand.z, stand.heading, this.player.motor.position.y + 0.6);
      else this.faceStudioCamera();
    }
    this.player.visible = true;
    this.hud.setVisible(false);
    this.interactions.clearTarget();
    this.setMode('creator');
    this.rig.enterCreator(this.player.motor.heading);
    this.creator.configure(this.save.profile.name === 'Viajante' && !editing ? '' : this.save.profile.name, this.save.profile.appearance, editing);
    this.ui.open(this.creator, true);
    this.updateCreatorOffset(false);
  }

  /** Vira o avatar para a direção em que nada fica entre ele e a câmera do estúdio. */
  private faceStudioCamera(): void {
    const motor = this.player.motor;
    const p = motor.position;
    const chest = p.y + 1.15;
    let best = motor.heading;
    let bestFree = -1;
    for (let k = 0; k < 8; k++) {
      // Alterna os lados (0, +45°, −45°, +90°...) para girar o mínimo possível.
      const turn = (Math.ceil(k / 2) * Math.PI) / 4 * (k % 2 === 0 ? -1 : 1);
      const heading = motor.heading + turn;
      const toCamera = heading + STUDIO_CAMERA_SIDE;
      const free = this.world.physics.raycast(p.x, chest, p.z, Math.sin(toCamera), 0.1, Math.cos(toCamera), STUDIO_CLEARANCE, true);
      if (free > bestFree + 0.2) {
        bestFree = free;
        best = heading;
      }
      if (bestFree >= STUDIO_CLEARANCE - 0.01) break;
    }
    if (best !== motor.heading) this.player.teleport(p.x, p.z, wrapAngle(best), p.y + 0.3);
  }

  private updateCreatorOffset(immediate: boolean): void {
    if (this.mode !== 'creator') return;
    const { width, height } = this.renderer.size;
    if (width / height < 0.9) this.rig.setScreenOffset(0, 0.25, immediate);
    else this.rig.setScreenOffset(Math.min(0.3, 224 / width), 0, immediate);
  }

  private finishCreator(name: string, appearance: AvatarAppearance): void {
    const editing = this.appearanceBeforeEdit !== null;
    this.appearanceBeforeEdit = null;
    this.save.profile = { name, appearance, created: true };
    this.player.setAppearance(appearance);
    this.player.name = name;
    this.connect.setDisplayName(name);
    this.audio.ui('confirm');
    this.ui.close(this.creator, true);
    if (editing) {
      this.resumePlay();
      this.hud.toast('Visual atualizado!', 'avatar');
    } else {
      this.enterPlay(true);
    }
    this.persist();
  }

  private cancelCreator(): void {
    if (this.appearanceBeforeEdit) this.player.setAppearance(this.appearanceBeforeEdit);
    this.appearanceBeforeEdit = null;
    this.ui.close(this.creator);
    this.resumePlay();
  }

  /** Volta à exploração depois de um modo auxiliar (criador, telescópio, foto). */
  private resumePlay(): void {
    this.rig.enterFollow();
    this.player.visible = true;
    this.hud.setMode('normal');
    this.hud.setVisible(true);
    this.setMode('play');
  }

  private enterPlay(first: boolean): void {
    this.ui.closeAll();
    const saved = this.save.player;
    if (first || !saved) this.player.teleport(this.world.spawn.x, this.world.spawn.z, this.world.spawn.heading);
    else this.player.teleport(saved.x, saved.z, saved.heading, saved.y + 0.4);
    this.player.visible = true;
    this.rig.enterFollow();
    this.rig.reset(this.player.motor.heading, true);
    this.lastDistance = this.player.motor.distanceTravelled;
    // O portal da praça é o ponto de partida: já nasce ativado. Quem
    // decide se dá para viajar é a rede, logo abaixo.
    this.progress.advancePortal('praca', 'ativado', 1);
    this.progress.refreshPortalReadiness();
    this.currentAreaId = null;
    this.hud.setMode('normal');
    this.hud.setVisible(true);
    this.hud.setCrystals(this.progress.crystalCount, this.progress.totals.crystals);
    this.hud.setFps(null);
    this.setMode('play');
    this.refreshHints();
    this.audio.setMusicActive(true);
    this.updateArea(true);
    if (first) {
      this.hud.toast(`Bem-vindo(a) a Aurora City, ${this.save.profile.name}!`, 'star', 6);
      this.audio.discovery();
    }
    this.dirty = true;
  }

  private quitToMenu(): void {
    this.persist();
    this.showMenu();
  }

  private pause(): void {
    if (this.mode === 'scenic' || this.mode === 'photo') {
      this.exitSpecialMode();
      return;
    }
    if (this.mode !== 'play' || this.ui.hasModal || this.transitioning) return;
    this.ui.open(this.pauseScreen);
  }

  private openPhone(app: PhoneApp): void {
    if (this.mode !== 'play' || this.transitioning) return;
    if (this.ui.isOpen(this.phone.id)) {
      this.phone.show(app, true);
      return;
    }
    if (this.ui.hasModal) return;
    this.phone.prepare(app);
    this.ui.open(this.phone);
  }

  /* ------------------------------------------------------------------ */
  /* Comandos                                                            */
  /* ------------------------------------------------------------------ */

  private handleAction(action: GameAction): void {
    this.audio.unlock();
    if (this.mode === 'scenic' || this.mode === 'photo') {
      if (action === 'interact' && this.mode === 'photo') this.capturePhoto();
      else if (action === 'pause' || action === 'interact' || action === 'jump' || action === 'phone') this.exitSpecialMode();
      return;
    }
    if (this.mode !== 'play') return;
    switch (action) {
      case 'jump':
        this.jumpQueued = true;
        break;
      case 'interact':
        if (this.interactions.interact(this.elapsed)) this.input.vibrate(0.15, 0.3, 60);
        break;
      case 'phone':
        this.openPhone('home');
        break;
      case 'pause':
        this.pause();
        break;
      case 'emote':
        if (!this.player.motor.swimming) {
          this.player.wave();
          this.player.express('feliz');
          this.social.sendEmote('acenar');
          // Quem está por perto responde: acenar para a cidade tem efeito.
          this.npcs.greetBack(this.player.position.x, this.player.position.z);
        }
        break;
      case 'cameraReset':
        this.rig.reset(this.player.motor.heading);
        break;
      default:
        break;
    }
  }

  /**
   * Em pé ou deitado. O jogo funciona inteiro nas duas posições — deitado
   * é só a orientação recomendada, porque cabe mais mundo na tela. O aviso
   * aparece uma vez por sessão e some sozinho.
   */
  private applyOrientation(orientation: Orientation): void {
    this.orientation = orientation;
    this.uiRoot.dataset.orientation = orientation;
    this.input.touch.setOrientation(orientation);
    this.maybeSuggestLandscape();
  }

  /** O convite para deitar o aparelho. Uma vez por sessão, e só no jogo. */
  private maybeSuggestLandscape(): void {
    if (this.landscapeHintShown || this.mode !== 'play') return;
    if (!shouldSuggestLandscape(this.platform, this.orientation)) return;
    this.landscapeHintShown = true;
    this.hud.toast('Deite o aparelho para ver mais da cidade. Em pé funciona igual.', 'info', 6);
  }

  /* ------------------------------------------------------------------ */
  /* Medição de desempenho                                               */
  /* ------------------------------------------------------------------ */

  /**
   * Inicia uma medição de FPS real neste aparelho.
   *
   * Não há como medir desempenho de celular sem um celular. O que dá para
   * fazer é deixar a régua pronta: `?bench` liga a medição, e quem estiver
   * com o aparelho na mão colhe o número.
   */
  startBenchmark(seconds = 20): void {
    this.benchmark = new Benchmark(seconds);
    this.hud.toast(`Medindo desempenho por ${Math.round(seconds)} s — ande pela cidade.`, 'info', 5);
  }

  private sampleBenchmark(dt: number): void {
    const bench = this.benchmark;
    if (!bench) return;
    if (!bench.sample(dt)) return;
    this.benchmark = null;
    const info = this.renderer.three.info;
    const report = bench.report({
      device: this.platform.label,
      quality: this.quality.current.level,
      target: this.quality.fpsTarget,
      resolutionScale: this.quality.current.resolutionScale,
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
    });
    this.lastBenchmark = report;
    const text = formatReport(report);
    console.info(text);
    (window as unknown as Record<string, unknown>).__edenBench = report;
    this.hud.toast(`${report.averageFps.toFixed(0)} FPS médios · 1% pior ${report.onePercentLowFps.toFixed(0)} — relatório no console`, 'star', 9);
  }

  private onDeviceChange(device: InputDevice): void {
    // A folha de estilos adapta o HUD ao dispositivo em uso (ex.: dicas acima dos controles de toque).
    this.uiRoot.dataset.device = device;
    this.showPrompt(this.interactions?.current ?? null);
    if (this.mode === 'play') this.refreshHints();
  }

  private onGamepadStatus(status: GamepadStatus): void {
    if (status.connected) {
      this.hud.toast('Controle conectado', 'gamepad');
    } else {
      this.hud.toast('Controle desconectado', 'gamepad');
      if (this.mode === 'play' && !this.ui.hasModal) this.pause();
    }
  }

  private refreshHints(): void {
    if (!this.save.settings.gameplay.hints) {
      this.hud.setHints(null);
      return;
    }
    const input = this.input;
    let hints: HudHint[];
    if (input.device === 'controle') {
      hints = [
        { key: 'L', label: 'Mover' },
        { key: 'R', label: 'Câmera' },
        { key: input.actionHint('run'), label: 'Correr' },
        { key: input.actionHint('jump'), label: 'Pular' },
        { key: input.actionHint('interact'), label: 'Interagir' },
        { key: input.actionHint('phone'), label: 'EdenPhone' },
        { key: input.actionHint('pause'), label: 'Menu' },
      ];
    } else if (input.device === 'toque') {
      hints = [];
    } else {
      const k = input.settings.keys;
      const move = k.forward[0] === 'KeyW' && k.left[0] === 'KeyA' && k.back[0] === 'KeyS' && k.right[0] === 'KeyD' ? 'WASD' : input.actionHint('forward');
      hints = [
        { key: move, label: 'Mover' },
        { key: 'Mouse', label: 'Câmera' },
        { key: input.actionHint('run'), label: 'Correr' },
        { key: input.actionHint('jump'), label: 'Pular' },
        { key: input.actionHint('interact'), label: 'Interagir' },
        { key: input.actionHint('phone'), label: 'EdenPhone' },
        { key: input.actionHint('pause'), label: 'Menu' },
      ];
    }
    this.hud.setHints(hints);
  }

  private showPrompt(item: Interactable | null): void {
    if (!item) {
      this.hud.setPrompt(null);
      this.input.touch.setInteraction(null);
      return;
    }
    this.hud.setPrompt({ key: this.input.actionHint('interact'), round: this.input.device === 'controle', action: item.action, name: item.name });
    this.input.touch.setInteraction(`${item.action}: ${item.name}`);
  }

  /* ------------------------------------------------------------------ */
  /* Interações                                                          */
  /* ------------------------------------------------------------------ */

  private registerInteractions(): void {
    const interactions = this.interactions;
    const city = this.world.city;

    interactions.register('assento', (_item, payload) => {
      this.player.sit(payload.seat);
      this.audio.sit();
      this.interactions.clearTarget();
      if (!this.sitHintShown) {
        this.sitHintShown = true;
        this.hud.toast('Mova-se ou pule para levantar.', 'info');
      }
    });

    interactions.register('fonte', () => {
      this.progress.wishes += 1;
      this.audio.wish();
      this.hud.toast(this.progress.wishes === 1 ? 'Você fez seu primeiro pedido à Fonte dos Desejos.' : `Pedido feito! Já são ${this.progress.wishes} pedidos.`, 'star');
      this.dirty = true;
    });

    interactions.register('placa', (_item, payload) => {
      const isNew = payload.entryId ? this.progress.readEntry(payload.entryId) : false;
      const dialog = new DialogScreen({
        id: 'placa',
        title: payload.title,
        paragraphs: payload.paragraphs,
        note: isNew ? 'Novo registro adicionado ao seu Diário.' : undefined,
        actions: [{ label: 'Fechar', kind: 'ghost', onClick: () => this.ui.close(dialog) }],
      });
      this.ui.open(dialog);
      if (isNew) {
        this.audio.discovery();
        this.dirty = true;
      }
    });

    interactions.register('portal', (item, payload) => {
      // O portal sobe a escada de estados em vez de acender de uma vez:
      // descoberto -> ativado -> pronto. Tocar nele ativa; ficar pronto
      // depende da rede ter um destino, o que `refreshPortalReadiness`
      // decide. Assim um portal salvo pela metade volta pela metade.
      const isNew = this.progress.advancePortal(payload.portalId, 'ativado', 1);
      this.progress.refreshPortalReadiness();
      if (isNew) {
        this.audio.discovery();
        this.hud.toast(`Portal ativado: ${item.name}`, 'portal', 4.5);
        this.dirty = true;
      }
      if (this.progress.travelReady(payload.portalId)) this.openPhone('mapa');
      else if (!isNew) this.hud.toast('Ative outros portais para viajar entre eles.', 'portal');
    });

    interactions.register('esfera', () => {
      const sphere = city.sphere;
      if (!sphere) return;
      const name = sphere.cycleMode();
      sphere.pulse();
      this.progress.sphereMode = sphere.mode;
      this.audio.sphere(sphere.mode);
      this.hud.toast(`Esfera Aurora: modo ${name}`, 'star');
      this.dirty = true;
    });

    interactions.register('telescopio', (item, payload) => {
      this.rig.enterScenic(payload.view);
      this.hud.setMode('scenic', `${item.name} · arraste para olhar, use o zoom para aproximar`);
      this.interactions.clearTarget();
      this.setMode('scenic');
      this.audio.ui('open');
    });

    interactions.register('conversa', (item, payload) => this.startConversation(item.id, payload.personId, payload.divino));

    interactions.register('atelie', (_item, payload) => this.openCreator(true, payload.stand));
    interactions.register('holomapa', () => this.openPhone('mapa'));
    // Estação do Éden: abre o mapa das regiões já na lista de destinos.
    interactions.register('estacao', () => this.openPhone('atlas'));

    // Portas: o mesmo interativo serve para entrar e para sair. Dentro,
    // é a porta do interior; fora, é a porta do prédio.
    interactions.register('porta', (_item, payload) => {
      if (this.universe.interiors.isInside) void this.exitInterior();
      else void this.enterInterior(payload.interiorId, payload.exit);
    });
    interactions.register('eventos', () => this.openPhone('eventos'));
  }

  /** Abre a conversa com alguém do panteão ou com um habitante. */
  private startConversation(interactableId: string, personId: string, divino: boolean): void {
    if (this.ui.hasModal) return;
    const speakerName = divino ? (getCharacter(personId)?.name ?? personId) : (this.npcs.citizenOf(interactableId)?.profile.name ?? 'Habitante');
    const tree = divino ? this.pantheonDialogue(personId) : this.citizenDialogue(interactableId);
    if (!tree) return;
    const character = divino ? getCharacter(personId) : undefined;
    const citizen = divino ? null : this.npcs.citizenOf(interactableId);
    const life = divino ? this.npcs.characterLife(personId) : this.npcs.lifeOf(interactableId);
    const player = this.player.position;

    // Conversar é um fato do mundo: as atividades que pediam para falar
    // com alguém avançam sozinhas, sem o jogador precisar "entregar".
    if (character) this.universe.talkedTo(character.id);

    // O personagem para o que estava fazendo, se vira para quem chamou e
    // cumprimenta. A rotina dele fica guardada para depois.
    if (character) this.npcs.lookAt(character.id, player.x, player.z);
    if (citizen) {
      citizen.startTalking(player.x, player.z, CONVERSATION_HOLD);
      if (this.edenSocial.meetCitizen(citizen.profile.name)) this.dirty = true;
    }
    life?.beginConversation(player.x, player.z);

    // O jogador também participa: olha para quem está falando.
    const target = character ? this.npcs.characterPosition(character.id) : citizen ? { x: citizen.x, y: citizen.y, z: citizen.z } : null;
    if (target) {
      this.talkTarget.set(target.x, target.y + 1.5, target.z);
      this.player.lookAt(this.talkTarget);
    }

    const voiceId = divino ? personId : `cidadao:${citizen?.profile.seed ?? 0}`;
    const runner = new DialogueRunner(tree.tree, this.story, tree.start);
    const screen = new DialogueScreen({
      speaker: {
        name: speakerName,
        title: character?.title ?? citizen?.profile.archetype.label ?? 'Habitante de Aurora City',
        color: character?.colors[0] ?? '#8fe6ff',
        place: character?.place.label ?? this.areaName,
      },
      runner,
      playerName: this.save.profile.name,
      onEffects: (effects) => this.applyDialogueEffects(effects),
      onLine: (line) => {
        // Cada fala move o rosto e, quando há gesto no roteiro, o corpo.
        life?.speak(line.mood, line.first ? line.gesture : undefined);
        if (citizen) citizen.keepTalking(CONVERSATION_HOLD);
        this.voice.speak({ characterId: voiceId, nodeId: line.nodeId, line: line.pageIndex, text: line.text, profile: this.voice.profileOf(divino ? personId : 'cidadao') });
      },
      onTalking: (level) => {
        life?.setTalking(level);
        if (level <= 0) this.voice.stop();
      },
      onChoice: () => this.audio.ui('click'),
      onClose: () => {
        // Fim da conversa: despedida, rosto de descanso e volta à rotina.
        life?.endConversation();
        citizen?.stopTalking();
        this.voice.stop();
        this.player.lookAt(null);
        this.talking = null;
        this.ui.close(screen);
        this.interactions.clearTarget();
      },
    });
    this.talking = { citizen, characterId: character?.id ?? null, life };
    this.audio.ui('open');
    this.ui.open(screen);
  }

  private pantheonDialogue(id: string): { tree: DialogueTree; start?: string } | null {
    const character = getCharacter(id);
    if (!character) return null;
    const knows = this.edenSocial.hasMet(id);
    const hasReencontro = character.dialogue.nodes.some((node) => node.id === 'reencontro');
    return { tree: character.dialogue, start: knows && hasReencontro ? 'reencontro' : undefined };
  }

  private citizenDialogue(interactableId: string): { tree: DialogueTree; start?: string } | null {
    const citizen = this.npcs.citizenOf(interactableId);
    if (!citizen) return null;
    const lines = citizenGreeting(citizen.profile, {
      period: this.world.environment.clock.period,
      weather: this.world.environment.weather.label,
      area: this.areaName,
      playerName: this.save.profile.name,
    });
    const persona = citizen.life.persona;
    const tree: DialogueTree = {
      start: 'fala',
      nodes: [
        {
          id: 'fala',
          mood: persona.greetMood,
          text: lines,
          choices: [
            { label: 'Acenar', to: 'aceno', effects: [{ kind: 'mensagem', id: 'acenar' }] },
            { label: 'Boa conversa. Até mais!' },
          ],
        },
        {
          // O aceno do jogador tem resposta: ninguém acena para o vazio.
          id: 'aceno',
          mood: persona.greetMood,
          gesture: 'acenar',
          text: [citizenWaveBack(citizen.profile.name)],
        },
      ],
    };
    return { tree };
  }

  private applyDialogueEffects(effects: readonly DialogueEffect[]): void {
    for (const effect of effects) {
      switch (effect.kind) {
        case 'contato': {
          if (this.edenSocial.meet(effect.id)) {
            const character = getCharacter(effect.id);
            this.hud.toast(`Novo contato no EdenPhone: ${character?.name ?? effect.id}`, 'people', 4.5);
            this.audio.discovery();
            this.dirty = true;
          }
          break;
        }
        case 'diario': {
          if (this.progress.readEntry(effect.id)) {
            this.hud.toast('Novo registro no seu Diário.', 'book', 3.6);
            this.dirty = true;
          }
          break;
        }
        case 'afters': {
          const config: AftersConfig = { ...this.afters.current, unlocked: true, body: this.aftersBody.current };
          this.afters.setConfig(config, false);
          this.save.afters = config;
          this.hud.toast('Painel Afters liberado no EdenPhone.', 'sparkle', 5);
          this.dirty = true;
          break;
        }
        case 'mensagem': {
          if (effect.id === 'acenar' && !this.player.motor.swimming) {
            this.player.wave();
            this.player.express('feliz');
          }
          break;
        }
        case 'bandeira':
          this.dirty = true;
          break;
      }
    }
  }

  private exitSpecialMode(): void {
    if (this.mode !== 'scenic' && this.mode !== 'photo') return;
    const gram = this.gramCapture;
    this.gramCapture = false;
    this.audio.ui('close');
    this.resumePlay();
    // Voltou da câmera do EdenGram: reabre o aplicativo na galeria.
    if (gram) this.openPhone('gram');
  }

  /**
   * @param forGram quando verdadeiro, a próxima foto vai para a galeria do
   *   EdenGram (dentro do jogo) em vez de ser baixada como arquivo.
   */
  private enterPhotoMode(forGram = false): void {
    this.ui.closeAll();
    this.interactions.clearTarget();
    this.gramCapture = forGram;
    this.hud.setMode('photo', forGram ? 'EdenGram · enquadre e toque em Interagir para publicar' : 'Modo foto · gire a câmera e ajuste o zoom');
    this.setMode('photo');
  }

  /** Guarda a foto na galeria do EdenGram (miniatura JPEG, só neste aparelho). */
  private storeGramPhoto(): void {
    const source = this.canvas;
    const width = 384;
    const height = Math.max(1, Math.round((width * source.height) / Math.max(1, source.width)));
    const thumb = document.createElement('canvas');
    thumb.width = width;
    thumb.height = height;
    const ctx = thumb.getContext('2d');
    if (!ctx) throw new Error('sem contexto 2d');
    ctx.drawImage(source, 0, 0, width, height);
    this.edenSocial.addPhoto({
      id: `foto-${Date.now().toString(36)}`,
      data: thumb.toDataURL('image/jpeg', 0.72),
      place: this.areaName,
      clock: this.world.environment.clock.label,
      at: Date.now(),
    });
    this.hud.toast('Foto publicada no EdenGram (só neste aparelho).', 'camera', 4);
  }

  private capturePhoto(): void {
    if (this.mode !== 'photo') return;
    // O desenho precisa acontecer no mesmo instante da captura; a foto usa a
    // resolução nativa da tela, mesmo que o jogo esteja em resolução reduzida.
    const toGram = this.gramCapture;
    try {
      this.renderer.renderForCapture(this.scene, this.rig.camera, () => {
        if (toGram) {
          this.storeGramPhoto();
          return;
        }
        this.canvas.toBlob((blob) => {
          if (!blob) {
            this.hud.toast('Não foi possível salvar a foto.', 'camera');
            return;
          }
          downloadBlob(blob, `edenworld-foto-${timestamp()}.png`);
          this.hud.toast('Foto salva nos seus downloads.', 'camera');
        }, 'image/png');
      });
    } catch {
      this.hud.toast('Não foi possível salvar a foto.', 'camera');
      return;
    }
    this.hud.flash();
    this.audio.shutter();
    this.progress.photos += 1;
    this.dirty = true;
  }

  /** Teleporta o jogador com uma transição suave. */
  /**
   * @param cameraTurn giro da câmera em relação às costas do personagem. Ao sair
   *   de um portal a câmera fica de lado, para o anel não tapar a vista.
   */
  private async travelTo(x: number, z: number, heading: number, y: number | undefined, placeName: string, cameraTurn = 0): Promise<void> {
    if (this.transitioning) return;
    this.transitioning = true;
    this.ui.closeAll();
    this.syncInputState();
    this.audio.portal();
    await this.hud.fade(true);
    this.player.teleport(x, z, heading, y);
    this.rig.reset(heading + cameraTurn, true);
    this.currentAreaId = null;
    await wait(120);
    this.transitioning = false;
    this.syncInputState();
    this.updateArea(true);
    await this.hud.fade(false);
    void placeName;
  }

  /**
   * Viagem entre regiões do universo.
   *
   * Aurora City é a única região com cenário tridimensional construído
   * até agora. Viajar para outra região registra a chegada de verdade
   * (posição, bichos, atividades, salvamento) e avisa, com todas as
   * letras, que o cenário dela ainda não existe — em vez de deixar o
   * jogador numa planície vazia achando que o jogo quebrou.
   */
  private requestTravel(regionId: string): void {
    if (this.transitioning) return;
    const motor = this.player.motor;
    const here = { x: motor.position.x, y: motor.position.y, z: motor.position.z, heading: motor.heading };
    const target = getRegion(regionId);
    if (!target) return;
    // Já estamos lá: só reposiciona, sem desmontar o mundo à toa.
    if (regionId === this.world.regionId) {
      const entry = this.universe.regions.entryPoint(regionId);
      void this.travelTo(entry.x, entry.z, entry.heading, undefined, target.name);
      return;
    }
    const event = this.universe.travelTo(regionId, here);
    if (!event) return;

    this.dirty = true;
    this.persist();

    if (hasScene(regionId)) {
      void this.enterRegion(regionId);
      return;
    }

    // Região sem cenário ainda: o jogador continua onde estava no mundo
    // 3D, mas o universo registra que ele está lá. É honesto e é
    // reversível — o mapa deixa voltar a qualquer momento.
    this.hud.toast(`${target.name}: ${target.tagline} O cenário desta região ainda está em construção.`, 'info', 7);
  }

  /**
   * Troca a região 3D ativa.
   *
   * Desmonta o cenário anterior inteiro e monta o novo. O que **não**
   * é desmontado é o jogador: inventário, cristais, bichos, atividades,
   * progresso e salvamento atravessam a viagem, porque nada disso vive
   * no cenário. É o que diferencia uma região de uma fase.
   */
  private async enterRegion(regionId: string): Promise<void> {
    if (this.transitioning) return;
    this.transitioning = true;
    this.ui.closeAll();
    this.syncInputState();
    this.audio.portal();
    await this.hud.fade(true);

    // Interior aberto não atravessa viagem. `leaveInterior` já manda
    // a cena desmontar — e a cena desmonta na física em que montou,
    // que daqui a pouco deixa de existir.
    if (this.universe.interiors.isInside) {
      this.universe.leaveInterior();
      this.setExteriorVisible(true);
      this.interiorInteractables = [];
      this.interiorReturn = null;
      this.hud.setLeaveBuilding(null);
    }

    const loading = new LoadingScreen(this.uiRoot);
    loading.setProgress(0.03, 'Guardando as suas coisas…');
    await nextFrame();

    // A travessia inteira em quatro tempos — a mesma ordem para todas
    // as regiões, hoje e para as que ainda não existem.
    await runRegionTransition(
      {
        // A. Guardar: a hora do mundo e o progresso saem antes de
        // qualquer coisa ser destruída.
        save: () => {
          this.captureWorldClock();
          this.progress.refreshPortalReadiness();
        },
        // B. Descarregar: cenário, coletáveis e física da região antiga.
        unload: () => {
          this.collectibles.dispose();
          this.scene.remove(this.collectibles.group);
          this.world.dispose();
        },
        // C. Carregar: monta a região nova e religa tudo nela.
        load: async (progress) => {
          await this.world.build(async (fraction, label) => {
            await progress(fraction, label);
          }, regionId);
          this.player.motor.setPhysics(this.world.physics);
          this.collectibles = new Collectibles(this.world.city.collectibles, (id) => this.progress.hasCrystal(id));
          this.scene.add(this.collectibles.group);
          this.applyRegionState(regionId);

          const entry = this.universe.regions.entryPoint(regionId);
          this.player.teleport(entry.x, entry.z, entry.heading);
          this.rig.reset(entry.heading, true);
          this.currentAreaId = null;
        },
        // D. Validar: ninguém recebe o controle de volta sobre uma
        // cidade com personagem enterrado ou duplicado sem que isso
        // apareça.
        validate: () => this.validateRegion(regionId),
      },
      {
        onProgress: async (fraction, label) => {
          loading.setProgress(0.05 + fraction * 0.88, label);
          await nextFrame();
        },
      },
    );

    await loading.finish();
    this.transitioning = false;
    this.syncInputState();
    this.updateArea(true);
    await this.hud.fade(false);
    this.hud.banner(this.world.regionName, getRegion(regionId)?.tagline ?? '');
    this.dirty = true;
    this.persist();
  }

  /**
   * Entra num prédio.
   *
   * O exterior é escondido, não destruído: voltar é instantâneo e a
   * região continua simulando. O `InteriorManager` continua sendo a
   * autoridade sobre haver **um** interior por vez; aqui só se monta a
   * geometria que ele pede.
   */
  private async enterInterior(interiorId: string, exit: ExitPoint): Promise<void> {
    if (this.transitioning) return;
    const scene = this.ensureInteriorScene();
    if (!this.universe.enterInterior(interiorId, exit)) {
      this.hud.toast('Esta porta ainda não abre.', 'info');
      return;
    }
    this.transitioning = true;
    this.ui.closeAll();
    this.syncInputState();
    await this.hud.fade(true);

    const motor = this.player.motor;
    this.interiorReturn = { x: exit.x, z: exit.z, heading: exit.heading + Math.PI, y: motor.position.y };

    const spawn = scene.spawnPoint;
    // Sem ponto de entrada, o prédio não subiu. Entrar assim mesmo
    // deixaria o jogador do lado de fora com o cenário escondido —
    // a tela preta que parecia "ambiente vazio". Melhor não abrir a
    // porta e dizer isso.
    if (!spawn || !this.world.physics.indoor) {
      this.universe.leaveInterior();
      this.setExteriorVisible(true);
      this.transitioning = false;
      this.syncInputState();
      await this.hud.fade(false);
      this.hud.toast('Esta porta não abriu. Tente de novo.', 'info');
      return;
    }
    this.player.teleport(spawn.x, spawn.z, spawn.heading, spawn.y + 0.4);
    this.rig.reset(spawn.heading, true);
    // O exterior some de vista: nada dele é desenhado lá dentro.
    this.setExteriorVisible(false);
    this.interiorInteractables = scene.items;
    this.refreshInteractables();

    this.transitioning = false;
    this.syncInputState();
    const interior = this.universe.interiors.current?.interior;
    this.hud.setPlace(interior?.name ?? 'Interior', this.world.regionName);
    this.hud.banner(interior?.name ?? 'Interior', interior?.note ?? '');
    // A saída fica à mão o tempo todo lá dentro, inclusive do andar de
    // cima, onde a porta está longe demais para ser alcançada.
    this.hud.setLeaveBuilding(interior?.name ?? 'Interior');
    await this.hud.fade(false);
    this.dirty = true;
  }

  /** Sai do prédio e volta exatamente à porta por onde entrou. */
  private async exitInterior(): Promise<void> {
    if (this.transitioning) return;
    const exit = this.universe.leaveInterior();
    this.transitioning = true;
    this.syncInputState();
    this.hud.setLeaveBuilding(null);
    await this.hud.fade(true);

    this.interiorInteractables = [];
    this.setExteriorVisible(true);
    const back = this.interiorReturn;
    if (exit) this.player.teleport(exit.x, exit.z, exit.heading + Math.PI, back?.y);
    else if (back) this.player.teleport(back.x, back.z, back.heading, back.y);
    this.rig.reset(this.player.motor.heading, true);
    this.interiorReturn = null;
    this.currentAreaId = null;
    this.refreshInteractables();

    this.transitioning = false;
    this.syncInputState();
    this.updateArea(true);
    await this.hud.fade(false);
    this.dirty = true;
  }

  /** Cria a camada de interiores na primeira vez que alguém abre uma porta. */
  private ensureInteriorScene(): InteriorScene {
    if (this.interiorScene) return this.interiorScene;
    const scene = new InteriorScene({
      scene: this.scene,
      // Função, não referência: `World.build` troca a física a cada
      // viagem, e esta cena vive a sessão inteira. Entregar o objeto
      // de hoje era entregar o mundo de ontem no primeiro prédio
      // aberto depois de viajar.
      physics: () => this.world.physics,
      onInteractables: (items) => {
        this.interiorInteractables = items;
        if (this.universe.interiors.isInside) this.refreshInteractables();
      },
      resolvePerson: (residentId) => {
        const character = PANTHEON.find((person) => person.id === residentId);
        return character ? { personId: character.id, divino: true } : null;
      },
    });
    this.universe.interiors.setLoader(scene);
    scene.applyQuality(this.quality.current);
    this.interiorScene = scene;
    return scene;
  }

  /** Esconde ou mostra o cenário externo (ao entrar e sair de prédios). */
  private setExteriorVisible(visible: boolean): void {
    this.world.terrain.group.visible = visible;
    this.world.water.mesh.visible = visible;
    this.world.city.group.visible = visible;
    this.world.vegetation.group.visible = visible;
    this.world.particles.group.visible = visible;
    this.world.wildlife.group.visible = visible;
    this.collectibles.group.visible = visible;
    this.npcs.group.visible = visible;
  }

  /**
   * Avistar um bicho é um fato do mundo.
   *
   * Ver de perto, com os próprios olhos, é o que registra a espécie no
   * guia — não abrir uma tela. Por isso o avistamento nasce aqui, do
   * que está realmente desenhado à volta do jogador.
   */
  private noticeWildlife(): void {
    if (!this.world.ready || this.universe.interiors.isInside) return;
    for (const speciesId of this.world.wildlife.visibleSpecies) {
      const position = this.firstWildlifeNear(speciesId);
      if (!position) continue;
      if (!this.universe.sightSpecies(speciesId)) continue;
      this.audio.discovery();
      this.dirty = true;
    }
  }

  /** O bicho desta espécie está perto o bastante para contar como avistado? */
  private firstWildlifeNear(speciesId: string): boolean {
    const p = this.player.position;
    const spot = this.world.wildlife.nearest(speciesId, p.x, p.z);
    return spot !== null && Math.hypot(spot.x - p.x, spot.z - p.z) < 18;
  }

  /** Reaponta o sistema de interação para o que existe agora. */
  private refreshInteractables(): void {
    const inside = this.interiorScene?.active;
    const items = inside ? this.interiorInteractables : [...this.world.city.interactables, ...this.npcs.interactables];
    this.interactions.setItems(items);
  }

  /** Período do dia na última vez que a fauna foi repovoada. */
  private wildlifePeriod = '';

  /**
   * Repovoa a fauna visível.
   *
   * A quantidade vem do orçamento de qualidade que já existia, e as
   * espécies da própria região — um bicho não aparece onde não vive.
   */
  /**
   * Monta o chão compartilhado dos personagens sobre a física atual.
   *
   * O corpo usado é o mesmo do jogador (raio, altura e degrau vêm de
   * `PLAYER`): se o jogador cabe, o habitante cabe; se o jogador sobe,
   * o habitante sobe. Era isso que faltava para as duas metades do
   * jogo concordarem sobre onde fica o chão.
   */
  private makeCharacterGround(): CharacterGround {
    return new CharacterGround({
      physics: this.world.physics,
      terrain: (x, z) => this.world.heightField.getHeight(x, z),
      radius: PLAYER.radius,
      height: PLAYER.height,
      stepHeight: PLAYER.stepHeight,
    });
  }

  private refreshWildlife(): void {
    this.wildlifePeriod = this.world.environment.clock.period;
    const regionId = this.world.regionId;
    const hour = this.world.environment.clock.hours;
    const budget = wildlifeBudget(this.quality.current.level);
    const animals = populateRegion(regionId, hour, budget, this.save.world.day * 31 + Math.floor(hour / 6));
    this.world.setWildlife(animals);
  }

  /* ------------------------------------------------------------------ */
  /* Configurações e salvamento                                          */
  /* ------------------------------------------------------------------ */

  private commitSettings(kind: 'audio' | 'input' | 'gameplay'): void {
    const settings = this.save.settings;
    if (kind === 'audio') {
      this.audio.applySettings(settings.audio);
      this.applyVoiceSettings();
    } else if (kind === 'input') {
      this.input.applySettings(settings.input);
      this.showPrompt(this.interactions.current);
    } else {
      this.rig.autoAlign = settings.gameplay.autoCamera;
      this.input.keyboard.usePointerLock = settings.gameplay.pointerLock;
      this.world.environment.clock.pace = settings.gameplay.timePace;
      if (!settings.gameplay.hints) this.hud.setHints(null);
    }
    this.dirty = true;
  }

  /**
   * Mantém a conversa de pé a cada quadro.
   *
   * O habitante continua encarando o jogador (ele pode ter se mexido) e
   * o relógio de conversa é renovado, para ninguém sair andando no meio
   * de uma frase. O jogador, por sua vez, segue olhando para quem fala.
   */
  private holdConversation(): void {
    const talking = this.talking;
    if (!talking) return;
    const p = this.player.position;
    if (talking.citizen) {
      talking.citizen.faceTowards(p.x, p.z);
      talking.citizen.keepTalking(CONVERSATION_HOLD);
      this.talkTarget.set(talking.citizen.x, talking.citizen.y + 1.5, talking.citizen.z);
      this.player.lookAt(this.talkTarget);
    } else if (talking.characterId) {
      this.npcs.lookAt(talking.characterId, p.x, p.z);
      const position = this.npcs.characterPosition(talking.characterId);
      if (position) {
        this.talkTarget.set(position.x, position.y + 1.6, position.z);
        this.player.lookAt(this.talkTarget);
      }
    }
    talking.life?.lookAt(p.x, p.z, Number.POSITIVE_INFINITY);
    // Sincronia labial: com voz, a boca segue as sílabas que saem do
    // sintetizador; sem voz, segue o texto que aparece na tela.
    if (talking.life && this.voice.active) talking.life.setTalking(this.voice.level);
  }

  /** Leva o volume e o modo de voz escolhidos para o sistema de fala. */
  private applyVoiceSettings(): void {
    const audio = this.save.settings.audio;
    this.voice.setMode(audio.voiceMode);
    this.voice.setVolume(audio.voice, audio.muted || this.flags.noAudio);
  }

  /** Grava o estado atual no armazenamento local. */
  private persist(): void {
    // Durante uma importação, o arquivo já gravado não pode ser sobrescrito.
    if (this.disposed || this.importing || !this.player) return;
    const save = this.save;
    const motor = this.player.motor;
    if (save.profile.created && this.mode !== 'menu' && this.mode !== 'creator') {
      const safe = motor.swimming || !motor.grounded ? motor.lastSafePosition : null;
      const p = safe ?? motor.position;
      save.player = { x: p.x, y: p.y, z: p.z, heading: motor.heading };
    }
    const clock = this.world.environment.clock;
    save.world = { hours: clock.hours, day: clock.day };
    save.progress = this.progress.toData();
    save.flags = [...this.story.all];
    save.social = this.edenSocial.toData();
    save.afters = { ...this.afters.current, body: this.aftersBody.current, citizens: this.npcs.aftersOverridesData() };
    // O universo inteiro num só lugar: as sete partes saem do mesmo
    // objeto, então não há risco de salvar metade do estado.
    Object.assign(save, this.universe.toJSON());
    if (this.graphicsChosen && !this.qualityOverride) save.settings.graphics = { ...this.quality.graphics };
    const ok = this.saveSystem.save(save);
    // Armazenamento cheio ou bloqueado no meio da sessão: avisa uma única vez.
    if (!ok && !this.saveWarned) {
      this.saveWarned = true;
      this.hud.toast('Não foi possível salvar o progresso neste navegador.', 'info', 7);
    }
    this.dirty = false;
    this.autosaveTimer = 0;
  }

  private exportSave(): void {
    this.persist();
    downloadBlob(new Blob([SaveSystem.serialize(this.save)], { type: 'application/json' }), `edenworld-save-${timestamp()}.json`);
    this.hud.toast('Salvamento exportado.', 'check');
  }

  /** Lê um arquivo exportado anteriormente e pede confirmação antes de aplicá-lo. */
  private importSave(): void {
    // O navegador só abre o seletor de arquivos a partir de um gesto direto;
    // o botão acionado pelo controle não conta como tal.
    const activation = navigator.userActivation as UserActivation | undefined;
    if (activation && !activation.isActive) {
      this.hud.toast('Para escolher o arquivo, use o mouse, o teclado ou o toque neste botão.', 'info', 7);
      return;
    }
    pickFile('.json,application/json', (file) => {
      const invalid = (): void => this.hud.toast('Este arquivo não é um salvamento do EDENWORLD.', 'info', 6);
      if (file.size === 0 || file.size > 2_000_000) {
        invalid();
        return;
      }
      file.text().then(
        (text) => {
          const imported = SaveSystem.parse(text);
          if (!imported) invalid();
          else if (!imported.profile.created) this.hud.toast('Este salvamento ainda não tem um jogo iniciado.', 'info', 6);
          else this.confirmImport(imported);
        },
        () => this.hud.toast('Não foi possível ler o arquivo.', 'info', 6),
      );
    });
  }

  private confirmImport(imported: SaveData): void {
    const totals = this.progress.totals;
    const crystals = Math.min(imported.progress.crystals.length, totals.crystals);
    const dialog = new DialogScreen({
      id: 'importar',
      title: 'Importar este salvamento?',
      paragraphs: [
        `Jogador: ${imported.profile.name} · ${crystals} de ${totals.crystals} Cristais de Luz.`,
        'O avatar e o progresso deste navegador serão substituídos pelos do arquivo. As configurações deste aparelho serão mantidas.',
      ],
      note: 'O jogo será recarregado para aplicar o salvamento.',
      actions: [
        { label: 'Cancelar', kind: 'ghost', onClick: () => this.ui.close(dialog) },
        { label: 'Importar', onClick: () => this.applyImport(imported) },
      ],
      onDismiss: () => this.ui.close(dialog),
    });
    this.ui.open(dialog);
  }

  private applyImport(imported: SaveData): void {
    // Gráficos, áudio e controles pertencem a este aparelho, não ao arquivo.
    this.persist();
    const next: SaveData = { ...imported, settings: this.save.settings };
    if (!this.saveSystem.save(next)) {
      this.ui.close('importar');
      this.hud.toast('Não foi possível gravar o salvamento neste navegador.', 'info', 7);
      return;
    }
    this.importing = true;
    window.location.reload();
  }

  /* ------------------------------------------------------------------ */
  /* EdenPhone                                                           */
  /* ------------------------------------------------------------------ */

  private createPhoneHost(): PhoneHost {
    return {
      playerName: () => this.save.profile.name,
      universe: () => this.universe,
      worldHour: () => this.world.environment.clock.hours,
      requestTravel: (regionId) => this.requestTravel(regionId),
      refresh: () => this.phone.refreshCurrent(),
      clockLabel: () => this.world.environment.clock.label,
      weatherLabel: () => this.world.environment.weather.label,
      areaName: () => this.areaName,
      baseMap: () => this.getBaseMap(),
      playerPose: () => ({ x: this.player.position.x, z: this.player.position.z, heading: this.player.motor.heading }),
      // O mapa do EdenPhone mostra o que está pronto para viajar, não o
      // que já foi tocado: um portal ativado sozinho não leva a lugar
      // nenhum, e oferecê-lo seria uma promessa falsa.
      portals: () => this.world.city.portals.map((p) => ({ id: p.id, name: p.name, x: p.x, z: p.z, unlocked: this.progress.travelReady(p.id) })),
      travel: (id) => {
        const portal = this.world.city.portals.find((p) => p.id === id);
        if (portal && this.progress.travelReady(id)) void this.travelTo(portal.x, portal.z, portal.heading, portal.y + 0.5, portal.name, PORTAL_CAMERA_TURN);
      },
      journal: () => this.journalEntries.map((entry) => ({ ...entry, read: this.progress.hasEntry(entry.id) })),

      /* --- Aplicativos do EdenOS --- */
      metCharacters: () => this.edenSocial.contactIds,
      citizensMet: () => this.edenSocial.citizenCount,
      threads: () => this.edenSocial.threads(),
      markThreadRead: (id) => {
        this.edenSocial.markThreadRead(id);
        this.dirty = true;
      },
      photos: () => this.edenSocial.photos,
      deletePhoto: (id) => {
        this.edenSocial.removePhoto(id);
        this.dirty = true;
      },
      openGramCamera: () => this.enterPhotoMode(true),
      feed: () =>
        this.edenSocial.feed({
          playerName: this.save.profile.name,
          clock: this.world.environment.clock.label,
          weather: this.world.environment.weather.label,
          area: this.areaName,
          day: this.world.environment.clock.day,
          crystals: [this.progress.crystalCount, this.progress.totals.crystals],
          areas: [this.progress.areaCount, this.progress.totals.areas],
          portals: [this.progress.portalCount, this.progress.totals.portals],
          night: this.world.environment.clock.isNight,
          hasFlag: (flag) => this.story.has(flag),
        }),
      library: () => libraryFor((flag) => this.story.has(flag)),
      afters: () => ({ ...this.afters.current, body: this.aftersBody.current }),
      setAfters: (patch) => {
        const next: AftersConfig = { ...this.afters.current, ...patch, body: this.aftersBody.current };
        this.afters.setConfig(next);
        this.save.afters = next;
        this.dirty = true;
      },
      // Silhueta ao vivo: cada chamada muda o avatar no mesmo quadro, sem
      // sair da cidade e sem interromper o movimento.
      aftersBody: () => this.aftersBody.current,
      aftersStatus: () => this.aftersBody.status,
      setAftersIntensity: (channel, percent) => this.aftersBody.setIntensity(channel, fromPercent(percent)),
      setAftersActive: (channel, active) => this.aftersBody.setActive(channel, active),
      setAftersCombined: (active) => this.aftersBody.setCombined(active),
      setAftersDuration: (seconds) => this.aftersBody.setDuration(seconds),
      applyAftersPreset: (id) => {
        const preset = getAftersPreset(id);
        if (preset) this.aftersBody.applyPreset(preset);
      },
      resetAfters: (channel) => this.aftersBody.reset(channel),
      resetAftersAll: () => this.aftersBody.resetAll(),
      aftersAllOff: () => {
        this.aftersBody.turnOff();
        this.afters.setConfig({ ...this.afters.current, productId: null });
        this.save.afters = { ...this.afters.current, body: this.aftersBody.current };
        this.dirty = true;
      },
      musicEnabled: () => this.save.settings.audio.music > 0,
      musicVolume: () => (this.save.settings.audio.music > 0 ? this.save.settings.audio.music : this.musicMemory),
      setMusic: (patch) => {
        const audio = this.save.settings.audio;
        if (patch.volume !== undefined) {
          this.musicMemory = Math.max(0.05, patch.volume);
          audio.music = patch.volume;
        }
        if (patch.enabled !== undefined) audio.music = patch.enabled ? this.musicMemory : 0;
        this.audio.applySettings(audio);
        this.dirty = true;
      },
      stats: () => {
        const t = this.progress.totals;
        return {
          crystals: [this.progress.crystalCount, t.crystals],
          entries: [this.progress.entryCount, t.entries],
          areas: [this.progress.areaCount, t.areas],
          portals: [this.progress.portalCount, t.portals],
          distance: formatDistance(this.progress.distance),
          playTime: formatDuration(this.progress.playSeconds),
          wishes: this.progress.wishes,
          photos: this.progress.photos,
          completion: this.progress.completion,
          day: this.world.environment.clock.day,
        };
      },
      crystalHint: () => {
        const nearest = this.collectibles.nearest(this.player.position.x, this.player.position.z);
        return nearest ? `${nearest.spot.hint} (a cerca de ${formatDistance(nearest.distance)})` : null;
      },
      setHour: (hours) => {
        this.world.environment.clock.glideTo(hours);
        this.ui.close(this.phone);
      },
      timePace: () => this.save.settings.gameplay.timePace,
      setTimePace: (pace) => {
        this.save.settings.gameplay.timePace = pace;
        this.commitSettings('gameplay');
      },
      weather: () => this.weatherChoice,
      setWeather: (choice) => {
        this.weatherChoice = choice;
        const weather = this.world.environment.weather;
        weather.automatic = choice === 'auto';
        if (choice !== 'auto') weather.setWeather(choice);
      },
      openCamera: () => this.enterPhotoMode(),
      openAvatar: () => {
        this.ui.close(this.phone, true);
        this.openCreator(true);
      },
      openSettings: () => this.ui.open(this.settingsScreen),
      close: () => this.ui.close(this.phone),
    };
  }

  private getBaseMap(): HTMLCanvasElement {
    if (!this.baseMapCanvas) {
      const field = this.world.heightField;
      const zones = this.world.zones;
      this.baseMapCanvas = renderBaseMap(
        384,
        { getHeight: (x, z) => field.getHeight(x, z), isPaved: (x, z) => (zones.flags(x, z) & (Zone.Paved | Zone.Path)) !== 0 },
        BUILDINGS,
      );
    }
    return this.baseMapCanvas;
  }

  /* ------------------------------------------------------------------ */
  /* Quadro                                                              */
  /* ------------------------------------------------------------------ */

  /**
   * Evento de cidade que a população responde com a silhueta.
   *
   * No Palco Aurora a cidade sobe o tom; à noite, quem tem esse gosto no
   * perfil reforça um pouco. Fora disso, cada um com a própria configuração.
   */
  private cityAftersEvent(): AftersCityEvent {
    if (this.currentAreaId === 'palco') return 'palco';
    return this.world.environment.clock.isNight ? 'noite' : 'normal';
  }

  private updateArea(showBanner: boolean): void {
    const p = this.player.position;
    const area = this.world.areaAt(p.x, p.z);
    const id = area?.id ?? 'arredores';
    if (id === this.currentAreaId) return;
    this.currentAreaId = id;
    this.areaName = area?.name ?? `Arredores de ${this.world.regionName}`;
    this.hud.setPlace(this.areaName, this.world.regionName);
    if (showBanner) this.hud.banner(this.world.regionName, this.areaName);
    if (area && this.progress.visitArea(area.id)) {
      this.dirty = true;
      if (this.progress.areaCount > 1) {
        this.audio.discovery();
        this.hud.toast(`Nova área descoberta: ${area.name}`, 'map');
      }
    }
  }

  private frame(dt: number, elapsed: number): void {
    this.elapsed = elapsed;
    const input = this.input.update(dt);
    this.ui.update();

    const mode = this.mode;
    const modal = this.ui.hasModal;
    const playing = mode === 'play';
    const motor = this.player.motor;
    let intent: MoveIntent | null = null;

    if (playing && !modal && !this.transitioning) {
      const yaw = this.rig.yaw;
      const sin = Math.sin(yaw);
      const cos = Math.cos(yaw);
      intent = this.intent;
      intent.x = sin * input.moveY - cos * input.moveX;
      intent.z = cos * input.moveY + sin * input.moveX;
      intent.run = input.run;
      intent.jump = this.jumpQueued;
      intent.jumpHeld = input.jumpHeld;
      this.rig.addLook(input.lookX, input.lookY);
      this.rig.addZoom(input.zoom);
    } else if ((mode === 'scenic' || mode === 'photo') && !modal) {
      this.rig.addLook(input.lookX, input.lookY);
      this.rig.addZoom(input.zoom);
    }
    this.jumpQueued = false;

    if (mode !== 'menu') {
      this.player.update(dt, elapsed, intent);
      this.player.getFocus(this.focus, CAMERA.targetHeight);
      this.shadowFocus.copy(this.player.position);
    } else {
      this.shadowFocus.set(PLAZA.x, WORLD.plateauHeight, PLAZA.z);
    }
    this.rig.update(dt, this.focus, motor.heading, motor.speed > 0.6, this.world.physics);
    this.player.visible = mode !== 'menu' && !this.rig.hideAvatar;

    const p = this.player.position;
    if (playing) {
      this.interactions.enabled = !motor.isSitting && !modal;
      this.interactions.update(p.x, p.y, p.z, motor.heading, elapsed);
      const travelled = motor.distanceTravelled - this.lastDistance;
      this.lastDistance = motor.distanceTravelled;
      if (travelled > 0 && travelled < 5) this.progress.distance += travelled;
      if (!modal) this.progress.playSeconds += dt;
      this.areaTimer += dt;
      if (this.areaTimer > 0.3) {
        this.areaTimer = 0;
        this.updateArea(true);
        this.noticeWildlife();
      }
    }

    const collected = this.collectibles.update(dt, elapsed, p.x, p.y, p.z, playing && !this.transitioning);
    if (collected && this.progress.collectCrystal(collected.id)) {
      const count = this.progress.crystalCount;
      const total = this.progress.totals.crystals;
      this.audio.pickup(count);
      this.input.vibrate(0.3, 0.7, 140);
      this.hud.setCrystals(count, total);
      this.hud.toast(count >= total ? 'Você encontrou todos os Cristais de Luz de Aurora City!' : `Cristal de Luz encontrado! (${count}/${total})`, 'crystal', 4.2);
      this.dirty = true;
    }

    // Conversa em andamento: a voz respira e os dois continuam de frente
    // um para o outro, mesmo que alguém se mexa um pouco.
    this.voice.update(dt);
    if (this.talking) this.holdConversation();

    const worldActive = (playing || mode === 'scenic' || mode === 'photo') && !this.ui.isOpen(this.pauseScreen.id);
    // Habitantes: a simulação acompanha o jogador e o horário do mundo.
    this.npcs.setFocus(p.x, p.y, p.z);
    const period = this.world.environment.clock.period;
    this.npcs.setPeriod(period);
    // Vira a noite, vira a fauna: a coruja não espera o jogador
    // reiniciar a região para aparecer, e o passarinho vai dormir.
    if (period !== this.wildlifePeriod) {
      this.wildlifePeriod = period;
      if (!this.universe.interiors.isInside) this.refreshWildlife();
    }
    // Dentro de um prédio, a cidade lá fora espera. Não é economia: é
    // que `setIndoor` faz toda consulta de chão responder "o piso do
    // interior", e desliga o limite da região. Os habitantes, que
    // reconsultam o chão a cada quadro, afundariam no andar do prédio
    // e poderiam andar para fora do mapa enquanto o jogador faz
    // compras. Invisíveis, a esta altura — mas voltariam errados.
    this.npcs.enabled = worldActive && !this.universe.interiors.isInside;
    // Afters: o brilho acompanha o avatar (ou o manequim do criador).
    this.afters.setTarget(p.x, p.y, p.z, this.player.avatar.appearance.height);
    this.afters.setVisible(this.player.visible && mode !== 'menu');
    this.world.update(dt, elapsed, this.rig.camera, this.shadowFocus, worldActive);
    this.systems.update(dt, elapsed);
    // Quem está dentro do prédio continua vivo: atendentes respiram,
    // clientes andam pelos corredores.
    if (this.universe.interiors.isInside) this.interiorScene?.update(dt, elapsed);

    const env = this.world.environment;
    const listenerX = mode === 'menu' ? this.rig.camera.position.x : p.x;
    const listenerZ = mode === 'menu' ? this.rig.camera.position.z : p.z;
    const fromCenter = Math.hypot(listenerX, listenerZ);
    const coast = this.world.coastRadius(Math.atan2(listenerZ, listenerX));
    this.audio.update({
      x: listenerX,
      z: listenerZ,
      night: env.atmosphere.night,
      wind: env.weather.wind.z,
      coast: clamp01(1 - (coast - fromCenter) / 95),
      swimming: mode !== 'menu' && motor.swimming,
      waterSources: this.world.city.waterSounds,
    });

    this.renderer.render(this.scene, this.rig.camera);

    // Atualizações de baixa frequência (HUD, qualidade, salvamento).
    this.slowTimer += dt;
    if (this.slowTimer >= 0.5) {
      this.slowTimer = 0;
      if (mode !== 'menu') {
        this.hud.setClock(env.clock.label, env.clock.isNight, env.weather.label);
        // Evento de cidade: show no Palco Aurora, ou a noite chegando.
        this.npcs.applyAftersEvent(this.cityAftersEvent());
        // Multijogador (quando houver servidor): viaja só quem saiu do padrão.
        if (this.social.online) {
          this.aftersBody.applyNetStates(this.social.npcAfters);
          this.social.publishNpcAfters(this.aftersBody.netStates(this.npcs.aftersOverrideIds()));
        }
        const graphics = this.quality.graphics;
        this.hud.setFps(graphics.showFps ? `${Math.round(this.loop.fps)} FPS · ${Math.round(this.quality.current.resolutionScale * 100)}%` : null);
      }
      if (playing && !modal) this.quality.monitor(0.5, this.loop.fps);
    }
    if (this.benchmark) this.sampleBenchmark(dt);
    if (mode !== 'menu' && mode !== 'creator') {
      this.autosaveTimer += dt;
      if (this.autosaveTimer >= AUTOSAVE_SECONDS && (this.dirty || playing)) this.persist();
    }

    if (this.flags.enabled) {
      this.frames += 1;
      const w = window as unknown as Record<string, unknown>;
      w.__frames = this.frames;
      const info = this.renderer.three.info;
      w.__info = { calls: info.render.calls, triangles: info.render.triangles, programs: info.programs?.length ?? 0 };
    }
  }

  /* ------------------------------------------------------------------ */
  /* Depuração e encerramento                                            */
  /* ------------------------------------------------------------------ */

  /** API de depuração (apenas com `?debug` na URL), usada pelos testes automatizados. */
  private installDebugApi(): void {
    const params = new URLSearchParams(location.search);
    const num = (key: string): number | null => (params.has(key) && Number.isFinite(Number(params.get(key))) ? Number(params.get(key)) : null);
    const x = num('x');
    const z = num('z');
    if (x !== null && z !== null && this.mode === 'play') {
      this.player.teleport(x, z, num('heading') ?? Math.PI);
      this.rig.reset(this.player.motor.heading, true);
    }
    const yaw = num('yaw');
    if (yaw !== null) this.rig.yaw = yaw;
    const pitch = num('pitch');
    if (pitch !== null) this.rig.pitch = pitch;
    const distance = num('dist');
    if (distance !== null) this.rig.distance = distance;
    const hour = num('h');
    if (hour !== null) this.world.environment.clock.setHours(hour);

    const api = {
      state: () => {
        const motor = this.player.motor;
        return {
          mode: this.mode,
          modal: this.ui.top?.id ?? null,
          device: this.input.device,
          gameplay: this.input.gameplayEnabled,
          gamepad: this.input.gamepad.status,
          player: { x: motor.position.x, y: motor.position.y, z: motor.position.z, heading: motor.heading, state: motor.state, grounded: motor.grounded, speed: motor.speed },
          camera: { yaw: this.rig.yaw, pitch: this.rig.pitch, distance: this.rig.distance, mode: this.rig.mode, fov: this.rig.fov },
          area: this.areaName,
          target: this.interactions.current?.id ?? null,
          clock: this.world.environment.clock.label,
          crystals: this.progress.crystalCount,
          portals: this.progress.portalCount,
          entries: this.progress.entryCount,
          quality: this.quality.current.level,
          fps: this.loop.fps,
          audio: this.audio.isUnlocked,
          name: this.save.profile.name,
          appearance: this.player.avatar.appearance,
        };
      },
      teleport: (tx: number, tz: number, heading = Math.PI) => {
        this.player.teleport(tx, tz, heading);
        this.rig.reset(heading, true);
      },
      setHour: (hours: number) => this.world.environment.clock.setHours(hours),
      look: (yawValue: number, pitchValue: number, dist?: number) => {
        this.rig.yaw = yawValue;
        this.rig.pitch = pitchValue;
        if (dist !== undefined) this.rig.distance = dist;
      },
      save: () => this.persist(),
      interactables: () => this.world.city.interactables.map((i) => ({ id: i.id, type: i.payload.type, x: i.position.x, y: i.position.y, z: i.position.z })),
      collectibles: () => this.world.city.collectibles.map((c) => ({ id: c.id, x: c.x, y: c.y, z: c.z })),
      portals: () => this.world.city.portals.map((portal) => ({ ...portal })),
      // Habitantes e panteão: posição atual e estado de conhecimento.
      npcs: () => ({
        populacao: this.npcs.population,
        visiveis: this.npcs.interactables.filter((item) => item.enabled && item.id.startsWith('cidadao:')).length,
        panteao: PANTHEON.map((character) => ({
          id: character.id,
          nome: character.name,
          conhecido: this.edenSocial.hasMet(character.id),
          ...(this.npcs.characterPosition(character.id) ?? {}),
        })),
      }),
      /** Teleporta para um personagem do panteão: `__eden.irPara('haru')`. */
      irPara: (characterId: string) => {
        const place = this.npcs.characterPosition(characterId);
        if (!place) return false;
        const angle = Math.atan2(place.x - this.player.position.x, place.z - this.player.position.z);
        void this.travelTo(place.x - Math.sin(angle) * 2.5, place.z - Math.cos(angle) * 2.5, angle, undefined, getCharacter(characterId)?.place.label ?? 'Aurora City');
        return true;
      },
      bandeiras: () => [...this.story.all],
      /** Plataforma detectada: sistema, formato e esquema de comando. */
      plataforma: () => ({ ...this.platform, esquema: this.input.scheme, orientacao: this.orientation }),
      /** Mede o FPS real deste aparelho: `__eden.medir(20)`. */
      medir: (seconds = 20) => {
        this.startBenchmark(seconds);
        return `Medindo por ${seconds} s…`;
      },
      /** Último relatório de desempenho desta sessão. */
      desempenho: () => (this.lastBenchmark ? { ...this.lastBenchmark, texto: formatReport(this.lastBenchmark) } : null),
      afters: () => ({ ...this.afters.current, body: this.aftersBody.current, silhueta: this.aftersBody.status }),
      /** Silhueta da cidade: quantos usam, quem está fora do padrão. */
      aftersCidade: () => ({
        evento: this.cityAftersEvent(),
        atores: this.aftersBody.actorCount,
        comTransformacao: this.aftersBody.activeActorCount,
        roteiro: this.npcs.aftersOverrideIds(),
      }),
      /** Roteiro: `__eden.aftersNpc('cidadao:12', { bust: 150 })`. */
      aftersNpc: (id: string, patch: { bust?: number; curve?: number; bustActive?: boolean; curveActive?: boolean; duration?: number }) => this.npcs.setAftersFor(id, patch),
      /** Roteiro: liga/desliga a transformação de um habitante. */
      aftersNpcAtivo: (id: string, active: boolean) => this.npcs.setAftersActiveFor(id, active),
      /** Roteiro: aplica um preset (`'aurora'`, `'palco'`, …) a um habitante. */
      aftersNpcPreset: (id: string, presetId: string) => this.npcs.setAftersPresetFor(id, presetId),
      /** Roteiro: força um evento de cidade (`'noite'`, `'palco'`, `'desligado'`). */
      aftersEvento: (event: AftersCityEvent) => {
        this.npcs.applyAftersEvent(event, true);
        return event;
      },
    };
    (window as unknown as Record<string, unknown>).__eden = api;
  }

  dispose(): void {
    if (this.disposed) return;
    this.persist();
    this.disposed = true;
    this.loop.stop();
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pagehide', this.onPageHide);
    this.systems.dispose();
    this.input.dispose();
    this.audio.dispose();
    this.ui.dispose();
    this.hud.dispose();
    this.collectibles.dispose();
    this.player.dispose();
    this.world.dispose();
    this.renderer.dispose();
  }
}

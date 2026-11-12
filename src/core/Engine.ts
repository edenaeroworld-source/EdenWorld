import * as THREE from 'three';
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera';
import { AREAS, BUILDINGS, PLAZA, SPAWN, areaAt, coastRadius } from '../cities/aurora-city/Layout';
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
import { ProgressSystem } from '../systems/ProgressSystem';
import { type GraphicsSettings, QualitySystem, defaultGraphicsSettings, isQualityLevel, suggestQualityLevel } from '../systems/QualitySystem';
import { type LoadStatus, type SaveData, SaveSystem, createNewSave, getBrowserStorage } from '../systems/SaveSystem';
import { clamp01, formatDistance, formatDuration, wrapAngle } from '../utils/math';
import { World } from '../world/World';
import { Zone } from '../world/ZoneMap';
import { CAMERA, type DebugFlags, GAME, WORLD, readDebugFlags } from './Config';
import { GameLoop } from './GameLoop';
import { SystemRegistry } from './GameSystem';
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
  private readonly saveSystem: SaveSystem;
  private readonly quality: QualitySystem;
  private readonly connect: EdenConnectService;
  private readonly social: SocialService;
  private save: SaveData;
  private progress: ProgressSystem;
  private player!: Player;
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
  private sitHintShown = false;
  private creatorDrag: { id: number; x: number } | null = null;
  private frames = 0;
  private lastDistance = 0;
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
    if (loaded.status === 'corrompido') console.warn('[Save] Salvamento inválido: iniciando um novo jogo.');

    // Qualidade gráfica: preferência salva, ou sugestão conforme o dispositivo.
    const touch = (navigator.maxTouchPoints ?? 0) > 0;
    const suggested = suggestQualityLevel({
      isTouchDevice: touch,
      hardwareConcurrency: navigator.hardwareConcurrency || 4,
      deviceMemory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
      gpuName: probeGpuName(),
    });
    this.graphicsChosen = this.save.settings.graphics !== null;
    let graphics: GraphicsSettings = this.save.settings.graphics ?? defaultGraphicsSettings(suggested);
    this.qualityOverride = isQualityLevel(this.flags.quality);
    if (isQualityLevel(this.flags.quality)) graphics = { ...graphics, quality: this.flags.quality };
    this.quality = new QualitySystem(graphics);

    this.renderer = new Renderer({ canvas, antialias: graphics.quality !== 'baixa' });
    this.renderer.setResolution(this.quality.current);
    this.world = new World(this.scene, this.renderer.three);

    this.ui = new UIManager(uiRoot);
    this.audio = new AudioSystem(this.save.settings.audio, !this.flags.noAudio);
    this.ui.sound = (kind) => this.audio.ui(kind);
    this.input = new InputManager(canvas, uiRoot, this.save.settings.input);
    this.input.keyboard.usePointerLock = this.save.settings.gameplay.pointerLock;
    this.rig.autoAlign = this.save.settings.gameplay.autoCamera;

    this.connect = this.systems.register(new OfflineEdenConnect(this.save.profile.name));
    this.social = this.systems.register(new LocalSocial());

    this.hud = new HUD(uiRoot, {
      onPhone: () => this.openPhone('home'),
      onMenu: () => this.pause(),
      onInteract: () => this.handleAction('interact'),
      onExitMode: () => this.exitSpecialMode(),
      onCapture: () => this.capturePhoto(),
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
        void this.travelTo(SPAWN.x, SPAWN.z, SPAWN.heading, undefined, 'Praça Central');
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

    await this.world.build(async (fraction, label) => {
      loading.setProgress(0.04 + fraction * 0.82, label);
      await nextFrame();
    });
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
    this.player.teleport(SPAWN.x, SPAWN.z, SPAWN.heading);
    this.player.visible = false;

    this.collectibles = new Collectibles(city.collectibles, (id) => this.progress.hasCrystal(id));
    this.scene.add(this.collectibles.group);

    // Registros do diário: uma entrada por placa com `entryId`.
    const seen = new Set<string>();
    for (const item of city.interactables) {
      if (item.payload.type !== 'placa' || !item.payload.entryId || seen.has(item.payload.entryId)) continue;
      seen.add(item.payload.entryId);
      this.journalEntries.push({ id: item.payload.entryId, title: item.payload.title, paragraphs: item.payload.paragraphs });
    }
    this.progress.totals = { crystals: city.collectibles.length, entries: this.journalEntries.length, areas: AREAS.length, portals: city.portals.length };
    this.progress.retainKnown({
      crystals: city.collectibles.map((spot) => spot.id),
      entries: this.journalEntries.map((entry) => entry.id),
      areas: AREAS.map((area) => area.id),
      portals: city.portals.map((portal) => portal.id),
    });

    this.interactions = new InteractionSystem(city.interactables);
    this.registerInteractions();
    this.interactions.onTargetChange = (item) => this.showPrompt(item);
    city.sphere?.setMode(this.progress.sphereMode);

    this.applyClockFromSave();
    this.wireEvents();

    this.quality.onChange((profile) => {
      this.renderer.setResolution(profile);
      this.world.applyQuality(profile);
      this.player.avatar.setShadows(profile.shadows);
      const size = this.renderer.size;
      this.world.setViewport(size.width, size.height, this.renderer.effectivePixelRatio, this.rig.fov);
    });
    this.world.applyQuality(this.quality.current);
    this.player.avatar.setShadows(this.quality.current.shadows);
    this.renderer.onResize((width, height) => {
      this.rig.setViewport(width, height);
      this.world.setViewport(width, height, this.renderer.effectivePixelRatio, this.rig.fov);
      this.updateCreatorOffset(true);
    });

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
    this.save.createdAt = fresh.createdAt;
    const totals = this.progress.totals;
    this.progress = new ProgressSystem(this.save.progress);
    this.progress.totals = totals;
    this.collectibles.reset(() => false);
    this.world.city.sphere?.setMode(0);
    this.player.setAppearance(this.save.profile.appearance);
    this.player.name = this.save.profile.name;
    this.connect.setDisplayName(this.save.profile.name);
    this.applyClockFromSave();
    this.currentAreaId = null;
    this.lastDistance = 0;
    this.saveSystem.save(this.save);
  }

  private applyClockFromSave(): void {
    const clock = this.world.environment.clock;
    clock.setHours(this.save.world.hours);
    clock.day = this.save.world.day;
    clock.pace = this.save.settings.gameplay.timePace;
  }

  /**
   * @param stand posição de estúdio (Estação de Estilo); sem ela, o avatar
   *   apenas se vira para o lado em que a câmera tem a vista mais livre.
   */
  private openCreator(editing: boolean, stand?: { x: number; z: number; heading: number }): void {
    this.audio.unlock();
    this.appearanceBeforeEdit = editing ? { ...this.player.avatar.appearance } : null;
    if (!editing) {
      this.player.teleport(SPAWN.x, SPAWN.z, SPAWN.heading);
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
    if (first || !saved) this.player.teleport(SPAWN.x, SPAWN.z, SPAWN.heading);
    else this.player.teleport(saved.x, saved.z, saved.heading, saved.y + 0.4);
    this.player.visible = true;
    this.rig.enterFollow();
    this.rig.reset(this.player.motor.heading, true);
    this.lastDistance = this.player.motor.distanceTravelled;
    this.progress.unlockPortal('praca');
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
          this.social.sendEmote('acenar');
        }
        break;
      case 'cameraReset':
        this.rig.reset(this.player.motor.heading);
        break;
      default:
        break;
    }
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
      const isNew = this.progress.unlockPortal(payload.portalId);
      if (isNew) {
        this.audio.discovery();
        this.hud.toast(`Portal ativado: ${item.name}`, 'portal', 4.5);
        this.dirty = true;
      }
      if (this.progress.portalCount >= 2) this.openPhone('mapa');
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

    interactions.register('atelie', (_item, payload) => this.openCreator(true, payload.stand));
    interactions.register('holomapa', () => this.openPhone('mapa'));
    interactions.register('eventos', () => this.openPhone('eventos'));
  }

  private exitSpecialMode(): void {
    if (this.mode !== 'scenic' && this.mode !== 'photo') return;
    this.audio.ui('close');
    this.resumePlay();
  }

  private enterPhotoMode(): void {
    this.ui.closeAll();
    this.interactions.clearTarget();
    this.hud.setMode('photo', 'Modo foto · gire a câmera e ajuste o zoom');
    this.setMode('photo');
  }

  private capturePhoto(): void {
    if (this.mode !== 'photo') return;
    // O desenho precisa acontecer no mesmo instante da captura; a foto usa a
    // resolução nativa da tela, mesmo que o jogo esteja em resolução reduzida.
    try {
      this.renderer.renderForCapture(this.scene, this.rig.camera, () => {
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

  /* ------------------------------------------------------------------ */
  /* Configurações e salvamento                                          */
  /* ------------------------------------------------------------------ */

  private commitSettings(kind: 'audio' | 'input' | 'gameplay'): void {
    const settings = this.save.settings;
    if (kind === 'audio') {
      this.audio.applySettings(settings.audio);
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
      clockLabel: () => this.world.environment.clock.label,
      weatherLabel: () => this.world.environment.weather.label,
      areaName: () => this.areaName,
      baseMap: () => this.getBaseMap(),
      playerPose: () => ({ x: this.player.position.x, z: this.player.position.z, heading: this.player.motor.heading }),
      portals: () => this.world.city.portals.map((p) => ({ id: p.id, name: p.name, x: p.x, z: p.z, unlocked: this.progress.hasPortal(p.id) })),
      travel: (id) => {
        const portal = this.world.city.portals.find((p) => p.id === id);
        if (portal && this.progress.hasPortal(id)) void this.travelTo(portal.x, portal.z, portal.heading, portal.y + 0.5, portal.name, PORTAL_CAMERA_TURN);
      },
      journal: () => this.journalEntries.map((entry) => ({ ...entry, read: this.progress.hasEntry(entry.id) })),
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

  private updateArea(showBanner: boolean): void {
    const p = this.player.position;
    const area = areaAt(p.x, p.z);
    const id = area?.id ?? 'arredores';
    if (id === this.currentAreaId) return;
    this.currentAreaId = id;
    this.areaName = area?.name ?? 'Arredores de Aurora';
    this.hud.setPlace(this.areaName, 'Aurora City');
    if (showBanner) this.hud.banner('Aurora City', this.areaName);
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

    const worldActive = (playing || mode === 'scenic' || mode === 'photo') && !this.ui.isOpen(this.pauseScreen.id);
    this.world.update(dt, elapsed, this.rig.camera, this.shadowFocus, worldActive);
    this.systems.update(dt, elapsed);

    const env = this.world.environment;
    const listenerX = mode === 'menu' ? this.rig.camera.position.x : p.x;
    const listenerZ = mode === 'menu' ? this.rig.camera.position.z : p.z;
    const fromCenter = Math.hypot(listenerX, listenerZ);
    const coast = coastRadius(Math.atan2(listenerZ, listenerX));
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
        const graphics = this.quality.graphics;
        this.hud.setFps(graphics.showFps ? `${Math.round(this.loop.fps)} FPS · ${Math.round(this.quality.current.resolutionScale * 100)}%` : null);
      }
      if (playing && !modal) this.quality.monitor(0.5, this.loop.fps);
    }
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

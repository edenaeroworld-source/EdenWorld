import * as THREE from 'three';

export interface RendererOptions {
  canvas: HTMLCanvasElement;
  antialias: boolean;
}

export interface RendererResolution {
  /** Limite superior do devicePixelRatio. */
  pixelRatioCap: number;
  /** Escala adicional de resolução interna (0,5–1). */
  resolutionScale: number;
}

/**
 * Encapsula o WebGLRenderer do Three.js (WebGL2) e cuida de resolução,
 * redimensionamento e perda/restauração de contexto.
 */
export class Renderer {
  readonly three: THREE.WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  readonly antialias: boolean;
  private pixelRatioCap = 2;
  private resolutionScale = 1;
  private width = 1;
  private height = 1;
  private readonly resizeListeners = new Set<(width: number, height: number) => void>();

  onContextLost: (() => void) | null = null;
  onContextRestored: (() => void) | null = null;

  /** Verifica suporte a WebGL2 sem criar o renderer definitivo. */
  static isWebGL2Available(): boolean {
    try {
      const canvas = document.createElement('canvas');
      return typeof WebGL2RenderingContext !== 'undefined' && canvas.getContext('webgl2') !== null;
    } catch {
      return false;
    }
  }

  constructor(options: RendererOptions) {
    this.canvas = options.canvas;
    this.antialias = options.antialias;
    this.three = new THREE.WebGLRenderer({
      canvas: options.canvas,
      antialias: options.antialias,
      alpha: false,
      stencil: false,
      depth: true,
      powerPreference: 'high-performance',
    });

    this.three.outputColorSpace = THREE.SRGBColorSpace;
    this.three.toneMapping = THREE.NeutralToneMapping;
    this.three.toneMappingExposure = 1.0;
    this.three.shadowMap.enabled = true;
    this.three.shadowMap.type = THREE.PCFShadowMap;
    this.three.setClearColor(0x9fdcff, 1);
    this.three.info.autoReset = true;

    this.canvas.addEventListener('webglcontextlost', this.handleContextLost, false);
    this.canvas.addEventListener('webglcontextrestored', this.handleContextRestored, false);
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('orientationchange', this.handleResize);
    window.visualViewport?.addEventListener('resize', this.handleResize);
    this.handleResize();
  }

  private readonly handleContextLost = (event: Event): void => {
    event.preventDefault();
    console.warn('[Renderer] Contexto WebGL perdido.');
    this.onContextLost?.();
  };

  private readonly handleContextRestored = (): void => {
    console.info('[Renderer] Contexto WebGL restaurado.');
    this.onContextRestored?.();
  };

  private readonly handleResize = (): void => {
    const width = Math.max(1, Math.floor(window.innerWidth));
    const height = Math.max(1, Math.floor(window.innerHeight));
    this.width = width;
    this.height = height;
    this.applySize();
    for (const listener of this.resizeListeners) listener(width, height);
  };

  private applySize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, this.pixelRatioCap) * this.resolutionScale;
    this.three.setPixelRatio(Math.max(0.35, dpr));
    this.three.setSize(this.width, this.height, false);
  }

  onResize(listener: (width: number, height: number) => void): () => void {
    this.resizeListeners.add(listener);
    listener(this.width, this.height);
    return () => this.resizeListeners.delete(listener);
  }

  setResolution(resolution: RendererResolution): void {
    if (this.pixelRatioCap === resolution.pixelRatioCap && this.resolutionScale === resolution.resolutionScale) return;
    this.pixelRatioCap = resolution.pixelRatioCap;
    this.resolutionScale = resolution.resolutionScale;
    this.applySize();
  }

  get size(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  get aspect(): number {
    return this.width / this.height;
  }

  /** Razão de pixels efetiva (após limite e escala). */
  get effectivePixelRatio(): number {
    return this.three.getPixelRatio();
  }

  get maxAnisotropy(): number {
    return this.three.capabilities.getMaxAnisotropy();
  }

  /** Nome do adaptador gráfico, quando o navegador o expõe. */
  getGpuName(): string {
    try {
      const gl = this.three.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (ext) return String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
    } catch {
      /* informação opcional */
    }
    return 'desconhecido';
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.three.render(scene, camera);
  }

  /**
   * Desenha um quadro na resolução nativa da tela — ignorando a escala
   * reduzida usada para ganhar desempenho — e chama `capture` enquanto a
   * imagem ainda está no canvas. Usado pelo modo foto, para que a imagem
   * salva não saia granulada nas qualidades mais baixas.
   */
  renderForCapture(scene: THREE.Scene, camera: THREE.Camera, capture: () => void): void {
    const normal = this.three.getPixelRatio();
    const native = Math.min(window.devicePixelRatio || 1, 2);
    const boosted = native > normal + 0.01;
    if (boosted) this.three.setPixelRatio(native);
    try {
      this.three.render(scene, camera);
      capture();
    } finally {
      if (boosted) {
        // Volta à resolução de jogo e redesenha, para não piscar um quadro vazio.
        this.applySize();
        this.three.render(scene, camera);
      }
    }
  }

  dispose(): void {
    this.canvas.removeEventListener('webglcontextlost', this.handleContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.handleContextRestored);
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('orientationchange', this.handleResize);
    window.visualViewport?.removeEventListener('resize', this.handleResize);
    this.resizeListeners.clear();
    this.three.dispose();
  }
}

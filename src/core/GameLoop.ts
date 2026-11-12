/**
 * Laço principal do jogo baseado em requestAnimationFrame.
 * Entrega um delta de tempo limitado (evita "saltos" após troca de aba)
 * e mede FPS com média móvel para o sistema de qualidade.
 */
export type FrameCallback = (dt: number, elapsed: number) => void;

const MAX_DELTA = 0.1;
const MAX_CONSECUTIVE_ERRORS = 5;

export class GameLoop {
  private rafId = 0;
  private running = false;
  private lastTime = 0;
  private elapsed = 0;
  private consecutiveErrors = 0;
  private fpsAccumulator = 0;
  private fpsFrames = 0;

  /** FPS médio medido na última janela (~0,5 s). */
  fps = 0;
  /** Tempo médio de quadro em milissegundos. */
  frameMs = 0;

  onFatalError: ((error: unknown) => void) | null = null;

  constructor(private readonly onFrame: FrameCallback) {}

  get isRunning(): boolean {
    return this.running;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  private readonly tick = (now: number): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.tick);

    const rawDelta = (now - this.lastTime) / 1000;
    this.lastTime = now;
    if (rawDelta <= 0) return;

    this.fpsAccumulator += rawDelta;
    this.fpsFrames += 1;
    if (this.fpsAccumulator >= 0.5) {
      this.fps = this.fpsFrames / this.fpsAccumulator;
      this.frameMs = (this.fpsAccumulator / this.fpsFrames) * 1000;
      this.fpsAccumulator = 0;
      this.fpsFrames = 0;
    }

    const dt = Math.min(rawDelta, MAX_DELTA);
    this.elapsed += dt;

    try {
      this.onFrame(dt, this.elapsed);
      this.consecutiveErrors = 0;
    } catch (error) {
      this.consecutiveErrors += 1;
      console.error('[GameLoop] Erro durante o quadro:', error);
      if (this.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        this.stop();
        this.onFatalError?.(error);
      }
    }
  };
}

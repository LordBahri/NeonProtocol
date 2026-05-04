export interface FixedTickOptions {
  tickRate: number;
  maxCatchupTicks: number;
  onTick: (dt: number, tickIndex: number) => void;
  onInterpolate: (alpha: number) => void;
}

/**
 * Runs simulation at a fixed timestep independent of render framerate.
 * Render callback receives an alpha [0,1] for interpolating between ticks.
 * Guards against spiral of death via maxCatchupTicks.
 */
export class FixedTickScheduler {
  private readonly dt: number;
  private readonly maxCatchupTicks: number;
  private readonly onTick: (dt: number, tickIndex: number) => void;
  private readonly onInterpolate: (alpha: number) => void;

  private accumulator = 0;
  private tickIndex = 0;
  private lastTime = 0;
  private running = false;
  private rafHandle = 0;

  constructor(opts: FixedTickOptions) {
    this.dt = 1 / opts.tickRate;
    this.maxCatchupTicks = opts.maxCatchupTicks;
    this.onTick = opts.onTick;
    this.onInterpolate = opts.onInterpolate;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now() / 1000;
    this.loop();
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafHandle);
  }

  private loop = (): void => {
    if (!this.running) return;
    this.rafHandle = requestAnimationFrame(this.loop);

    const now = performance.now() / 1000;
    let frameTime = now - this.lastTime;
    this.lastTime = now;

    if (frameTime > this.dt * this.maxCatchupTicks) {
      frameTime = this.dt * this.maxCatchupTicks;
    }

    this.accumulator += frameTime;

    while (this.accumulator >= this.dt) {
      this.onTick(this.dt, this.tickIndex++);
      this.accumulator -= this.dt;
    }

    const alpha = this.accumulator / this.dt;
    this.onInterpolate(alpha);
  };

  get currentTickIndex(): number { return this.tickIndex; }
}

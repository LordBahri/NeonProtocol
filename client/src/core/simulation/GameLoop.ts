import { FixedTickScheduler } from './FixedTickScheduler.ts';
import type { World } from '../ecs/World.ts';
import type { SystemScheduler } from '../ecs/SystemScheduler.ts';

export interface GameLoopOptions {
  simulationTickRate: number;
  world: World;
  scheduler: SystemScheduler;
  onRenderTick: (alpha: number, world: World) => void;
}

export class GameLoop {
  private scheduler: FixedTickScheduler;
  private world: World;
  private systemScheduler: SystemScheduler;
  private onRenderTick: (alpha: number, world: World) => void;
  private _tickCount = 0;
  private _isRunning = false;

  constructor(opts: GameLoopOptions) {
    this.world = opts.world;
    this.systemScheduler = opts.scheduler;
    this.onRenderTick = opts.onRenderTick;

    this.scheduler = new FixedTickScheduler({
      tickRate: opts.simulationTickRate,
      maxCatchupTicks: 5,
      onTick: this.tick,
      onInterpolate: this.interpolate,
    });
  }

  private tick = (dt: number, _tickIndex: number): void => {
    this._tickCount++;
    this.systemScheduler.runAll(this.world, dt);
  };

  private interpolate = (alpha: number): void => {
    this.onRenderTick(alpha, this.world);
  };

  start(): void {
    if (this._isRunning) return;
    this._isRunning = true;
    this.scheduler.start();
  }

  stop(): void {
    this._isRunning = false;
    this.scheduler.stop();
  }

  get tickCount(): number { return this._tickCount; }
  get isRunning(): boolean { return this._isRunning; }
}

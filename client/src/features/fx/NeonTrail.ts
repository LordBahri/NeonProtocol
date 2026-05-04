import { Container, Graphics } from 'pixi.js';

interface TrailPoint {
  x: number;
  y: number;
  age: number;
}

export interface NeonTrailOptions {
  maxPoints: number;
  trailLifetime: number;
  color: number;
  maxWidth: number;
  minWidth: number;
  additive?: boolean;
}

export class NeonTrail {
  readonly container: Container;
  private gfx: Graphics;
  private points: TrailPoint[] = [];
  private readonly opts: NeonTrailOptions;

  constructor(opts: NeonTrailOptions) {
    this.opts = opts;
    this.container = new Container();
    this.container.label = 'trail';
    this.gfx = new Graphics();
    if (opts.additive) {
      this.gfx.blendMode = 'add';
    }
    this.container.addChild(this.gfx);
  }

  addPoint(x: number, y: number): void {
    this.points.push({ x, y, age: 0 });
    if (this.points.length > this.opts.maxPoints) {
      this.points.shift();
    }
  }

  update(dt: number): void {
    for (let i = this.points.length - 1; i >= 0; i--) {
      this.points[i]!.age += dt;
      if (this.points[i]!.age > this.opts.trailLifetime) {
        this.points.splice(i, 1);
      }
    }
    this.render();
  }

  private render(): void {
    this.gfx.clear();
    if (this.points.length < 2) return;

    for (let i = 1; i < this.points.length; i++) {
      const prev = this.points[i - 1]!;
      const curr = this.points[i]!;
      const t = 1 - curr.age / this.opts.trailLifetime;
      const width = this.opts.minWidth + (this.opts.maxWidth - this.opts.minWidth) * t;

      this.gfx.moveTo(prev.x, prev.y);
      this.gfx.lineTo(curr.x, curr.y);
      this.gfx.stroke({ color: this.opts.color, width, alpha: t * 0.8 });
    }

    for (let i = 1; i < this.points.length; i++) {
      const prev = this.points[i - 1]!;
      const curr = this.points[i]!;
      const t = 1 - curr.age / this.opts.trailLifetime;
      const width = (this.opts.minWidth + (this.opts.maxWidth - this.opts.minWidth) * t) * 0.4;

      this.gfx.moveTo(prev.x, prev.y);
      this.gfx.lineTo(curr.x, curr.y);
      this.gfx.stroke({ color: 0xffffff, width, alpha: t * 0.5 });
    }
  }

  clear(): void {
    this.points.length = 0;
    this.gfx.clear();
  }
}

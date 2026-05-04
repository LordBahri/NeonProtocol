import { Container, Graphics } from 'pixi.js';
import { ObjectPool } from '../../core/renderer/ObjectPool.ts';

interface Particle {
  gfx: Graphics;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  startAlpha: number;
  color: number;
  size: number;
  gravity: number;
  drag: number;
  rotation: number;
  rotationSpeed: number;
}

function createParticle(): Particle {
  return {
    gfx: new Graphics(),
    x: 0, y: 0, vx: 0, vy: 0,
    life: 0, maxLife: 1,
    startAlpha: 1,
    color: 0xffffff, size: 2,
    gravity: 0, drag: 0.95,
    rotation: 0, rotationSpeed: 0,
  };
}

function resetParticle(p: Particle): void {
  p.gfx.visible = false;
  p.life = 0;
}

export interface EmitOptions {
  count: number;
  x: number;
  y: number;
  color: number | number[];
  minSize: number;
  maxSize: number;
  minSpeed: number;
  maxSpeed: number;
  minLife: number;
  maxLife: number;
  angle?: number;
  spread?: number;
  gravity?: number;
  drag?: number;
  additive?: boolean;
}

export class ParticleEmitter {
  private pool: ObjectPool<Particle>;
  private active: Particle[] = [];
  readonly container: Container;
  private seed = 0;

  constructor(prewarm = 256, maxPool = 2048) {
    this.container = new Container();
    this.container.label = 'particles';
    this.pool = new ObjectPool(createParticle, resetParticle, prewarm, maxPool);
  }

  emit(opts: EmitOptions): void {
    for (let i = 0; i < opts.count; i++) {
      const p = this.pool.acquire();

      const angle = (opts.angle ?? Math.PI * 2 * this.rand()) +
        (opts.spread ?? Math.PI * 2) * (this.rand() - 0.5);
      const speed = opts.minSpeed + this.rand() * (opts.maxSpeed - opts.minSpeed);

      p.x = opts.x;
      p.y = opts.y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.maxLife = opts.minLife + this.rand() * (opts.maxLife - opts.minLife);
      p.life = p.maxLife;
      p.gravity = opts.gravity ?? 0;
      p.drag = opts.drag ?? 0.95;
      p.size = opts.minSize + this.rand() * (opts.maxSize - opts.minSize);
      p.startAlpha = 1;
      p.rotationSpeed = (this.rand() - 0.5) * 6;

      const colorArr = Array.isArray(opts.color) ? opts.color : [opts.color];
      p.color = colorArr[Math.floor(this.rand() * colorArr.length)]!;

      this.drawParticle(p);
      p.gfx.visible = true;
      p.gfx.x = p.x;
      p.gfx.y = p.y;

      if (opts.additive) {
        p.gfx.blendMode = 'add';
      }

      this.container.addChild(p.gfx);
      this.active.push(p);
    }
  }

  update(dt: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i]!;
      p.life -= dt;

      if (p.life <= 0) {
        this.container.removeChild(p.gfx);
        this.active.splice(i, 1);
        this.pool.release(p);
        continue;
      }

      p.vy += p.gravity * dt;
      p.vx *= p.drag;
      p.vy *= p.drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation += p.rotationSpeed * dt;

      p.gfx.x = p.x;
      p.gfx.y = p.y;
      p.gfx.rotation = p.rotation;
      p.gfx.alpha = p.startAlpha * (p.life / p.maxLife);
    }
  }

  private drawParticle(p: Particle): void {
    p.gfx.clear();
    p.gfx.circle(0, 0, p.size);
    p.gfx.fill({ color: p.color });
    if (p.size > 1.5) {
      p.gfx.circle(0, 0, p.size * 1.8);
      p.gfx.fill({ color: p.color, alpha: 0.25 });
    }
  }

  private rand(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }

  clear(): void {
    for (const p of this.active) {
      this.container.removeChild(p.gfx);
      this.pool.release(p);
    }
    this.active.length = 0;
  }

  get activeCount(): number { return this.active.length; }
}

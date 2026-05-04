import { Container, Graphics } from 'pixi.js';
import { ObjectPool } from '../../core/renderer/ObjectPool.ts';

interface ProjectileSprite {
  gfx: Graphics;
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: number;
  size: number;
  type: 'laser' | 'cannon' | 'missile';
}

function createProjectileSprite(): ProjectileSprite {
  return {
    gfx: new Graphics(),
    active: false,
    x: 0, y: 0, vx: 0, vy: 0,
    life: 0, maxLife: 1,
    color: 0x00ffff, size: 3,
    type: 'laser',
  };
}

function resetProjectileSprite(p: ProjectileSprite): void {
  p.active = false;
  p.x = 0; p.y = 0; p.vx = 0; p.vy = 0;
  p.life = 0; p.maxLife = 1;
  p.gfx.visible = false;
}

export class ProjectilePool {
  private pool: ObjectPool<ProjectileSprite>;
  private active: ProjectileSprite[] = [];
  readonly container: Container;

  constructor(prewarm = 128) {
    this.container = new Container();
    this.container.label = 'projectiles';
    this.pool = new ObjectPool(createProjectileSprite, resetProjectileSprite, prewarm, 1024);
  }

  spawn(
    x: number,
    y: number,
    vx: number,
    vy: number,
    maxLife: number,
    color: number,
    size: number,
    type: ProjectileSprite['type'],
  ): ProjectileSprite {
    const p = this.pool.acquire();
    p.active = true;
    p.x = x; p.y = y;
    p.vx = vx; p.vy = vy;
    p.life = maxLife; p.maxLife = maxLife;
    p.color = color; p.size = size;
    p.type = type;

    this.drawProjectile(p);
    p.gfx.visible = true;
    p.gfx.x = x;
    p.gfx.y = y;
    this.container.addChild(p.gfx);
    this.active.push(p);
    return p;
  }

  update(dt: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i]!;
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.gfx.x = p.x;
      p.gfx.y = p.y;

      const lifeFrac = p.life / p.maxLife;
      p.gfx.alpha = Math.max(0, lifeFrac);

      if (p.type === 'laser') {
        const angle = Math.atan2(p.vy, p.vx);
        p.gfx.rotation = angle;
      }

      if (p.life <= 0) {
        this.container.removeChild(p.gfx);
        this.active.splice(i, 1);
        this.pool.release(p);
      }
    }
  }

  private drawProjectile(p: ProjectileSprite): void {
    p.gfx.clear();

    if (p.type === 'laser') {
      const len = 20;
      p.gfx.rect(-len * 0.5, -p.size * 0.5, len, p.size);
      p.gfx.fill({ color: p.color, alpha: 1 });
      p.gfx.rect(-len * 0.5, -p.size, len, p.size * 2);
      p.gfx.fill({ color: p.color, alpha: 0.3 });
    } else if (p.type === 'cannon') {
      p.gfx.circle(0, 0, p.size);
      p.gfx.fill({ color: p.color, alpha: 1 });
      p.gfx.circle(0, 0, p.size * 2);
      p.gfx.fill({ color: p.color, alpha: 0.25 });
    } else {
      p.gfx.circle(0, 0, p.size);
      p.gfx.fill({ color: 0xff6600, alpha: 1 });
      p.gfx.circle(0, 0, p.size * 1.5);
      p.gfx.fill({ color: 0xff2200, alpha: 0.4 });
    }
  }

  despawnAll(): void {
    for (const p of this.active) {
      this.container.removeChild(p.gfx);
      this.pool.release(p);
    }
    this.active.length = 0;
  }

  get activeCount(): number { return this.active.length; }
}

import { Container, Graphics } from 'pixi.js';
import { ObjectPool } from '../../core/renderer/ObjectPool.ts';
import { globalBus } from '../../core/network/MessageBus.ts';
import type { EntityId } from '../../core/ecs/types.ts';

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
  length: number;
  type: 'laser' | 'cannon' | 'missile';
}

interface MissileVisual {
  id: number;
  gfx: Graphics;
  trailGfx: Graphics;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

function createProjectileSprite(): ProjectileSprite {
  return {
    gfx: new Graphics(),
    active: false,
    x: 0, y: 0, vx: 0, vy: 0,
    life: 0, maxLife: 1,
    color: 0x00ffff, size: 3, length: 20,
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
  private missiles = new Map<number, MissileVisual>();
  readonly container: Container;
  private missileLayer: Container;
  private unsubs: Array<() => void> = [];

  constructor(prewarm = 128) {
    this.container = new Container();
    this.container.label = 'projectiles';
    this.missileLayer = new Container();
    this.missileLayer.label = 'missiles';
    this.container.addChild(this.missileLayer);
    this.pool = new ObjectPool(createProjectileSprite, resetProjectileSprite, prewarm, 1024);

    this.unsubs.push(
      globalBus.on<{
        ownerEntity: EntityId; x: number; y: number; vx: number; vy: number;
        life: number; color: number; size: number; length: number; type: 'laser' | 'cannon';
      }>(
        'combat:projectile_fired',
        ({ x, y, vx, vy, life, color, size, length, type }) => {
          this.spawn(x, y, vx, vy, life, color, size, length, type);
        },
      ),

      globalBus.on<{ id: number; x: number; y: number; vx: number; vy: number; color: number; isEMP: boolean }>(
        'combat:missile_spawned',
        ({ id, x, y, vx, vy, color }) => {
          const g     = new Graphics();
          const trail = new Graphics();
          g.blendMode     = 'add';
          trail.blendMode = 'add';
          this.missileLayer.addChild(trail);
          this.missileLayer.addChild(g);

          this._drawMissile(g, color);
          g.x = x; g.y = y;

          const vis: MissileVisual = { id, gfx: g, trailGfx: trail, x, y, vx, vy };
          this.missiles.set(id, vis);
        },
      ),

      globalBus.on<{ id: number; x: number; y: number; vx: number; vy: number }>(
        'combat:missile_move',
        ({ id, x, y, vx, vy }) => {
          const vis = this.missiles.get(id);
          if (!vis) return;
          const prevX = vis.x;
          const prevY = vis.y;
          vis.x = x; vis.y = y; vis.vx = vx; vis.vy = vy;
          vis.gfx.x = x; vis.gfx.y = y;
          vis.gfx.rotation = Math.atan2(vy, vx);

          // Draw short trail
          vis.trailGfx.clear();
          vis.trailGfx.moveTo(x, y);
          vis.trailGfx.lineTo(prevX, prevY);
          vis.trailGfx.stroke({ width: 2, color: 0xff6600, alpha: 0.5 });
        },
      ),

      globalBus.on<{ id: number; x: number; y: number; scale: number }>(
        'combat:missile_impact',
        ({ id }) => {
          const vis = this.missiles.get(id);
          if (!vis) return;
          this.missileLayer.removeChild(vis.gfx);
          this.missileLayer.removeChild(vis.trailGfx);
          vis.gfx.destroy();
          vis.trailGfx.destroy();
          this.missiles.delete(id);
        },
      ),
    );
  }

  spawn(
    x: number, y: number,
    vx: number, vy: number,
    maxLife: number,
    color: number, size: number, length: number,
    type: 'laser' | 'cannon',
  ): ProjectileSprite {
    const p = this.pool.acquire();
    p.active = true;
    p.x = x; p.y = y;
    p.vx = vx; p.vy = vy;
    p.life = maxLife; p.maxLife = maxLife;
    p.color = color; p.size = size; p.length = length;
    p.type = type;

    this.drawProjectile(p);
    p.gfx.visible = true;
    p.gfx.x = x; p.gfx.y = y;
    p.gfx.rotation = Math.atan2(vy, vx);
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

      if (p.life <= 0) {
        this.container.removeChild(p.gfx);
        this.active.splice(i, 1);
        this.pool.release(p);
      }
    }
  }

  private drawProjectile(p: ProjectileSprite): void {
    p.gfx.clear();
    p.gfx.blendMode = 'add';

    if (p.type === 'laser') {
      const half = p.length * 0.5;
      // Core bolt
      p.gfx.rect(-half, -p.size * 0.4, p.length, p.size * 0.8);
      p.gfx.fill({ color: p.color, alpha: 1 });
      // Glow halo
      p.gfx.rect(-half, -p.size, p.length, p.size * 2);
      p.gfx.fill({ color: p.color, alpha: 0.25 });
    } else {
      // Cannon round
      p.gfx.circle(0, 0, p.size);
      p.gfx.fill({ color: p.color, alpha: 1 });
      p.gfx.circle(0, 0, p.size * 2);
      p.gfx.fill({ color: p.color, alpha: 0.2 });
    }
  }

  private _drawMissile(g: Graphics, color: number): void {
    g.clear();
    // Body
    g.rect(-6, -2, 12, 4);
    g.fill({ color, alpha: 0.9 });
    // Nose
    g.poly([6, 0, 2, -2, 2, 2]);
    g.fill({ color: 0xffffff, alpha: 0.7 });
    // Thruster glow
    g.circle(-6, 0, 3.5);
    g.fill({ color: 0xff6600, alpha: 0.8 });
  }

  despawnAll(): void {
    for (const p of this.active) {
      this.container.removeChild(p.gfx);
      this.pool.release(p);
    }
    this.active.length = 0;
    for (const vis of this.missiles.values()) {
      this.missileLayer.removeChild(vis.gfx);
      this.missileLayer.removeChild(vis.trailGfx);
      vis.gfx.destroy();
      vis.trailGfx.destroy();
    }
    this.missiles.clear();
  }

  destroy(): void {
    for (const unsub of this.unsubs) unsub();
    this.despawnAll();
  }

  get activeCount(): number { return this.active.length; }
}

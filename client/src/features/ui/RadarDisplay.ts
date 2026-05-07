import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { World } from '../../core/ecs/World.ts';
import type { RenderPipeline } from '../../core/renderer/RenderPipeline.ts';
import { RenderLayer } from '../../core/renderer/LayerManager.ts';
import { createEntityId } from '../../core/ecs/types.ts';
import { TransformComponent, NetworkSyncComponent } from '../ships/ShipComponents.ts';
import { AsteroidResourceComponent } from '../economy/AsteroidResourceSystem.ts';

const SIZE    = 152;
const HALF    = SIZE / 2;
const RANGES  = [1500, 3000, 6000];  // meters per ring
const RANGE   = RANGES[1]!;          // default
const SWEEP_SPEED = 0.6;             // radians/second

export class RadarDisplay {
  readonly container: Container;

  private bg:        Graphics;
  private rings:     Graphics;
  private sweepMask: Graphics;
  private sweep:     Graphics;
  private blips:     Graphics;
  private labels:    Container;
  private label:     Text;

  private _sweepAngle = 0;
  private _range      = RANGE;

  constructor(pipeline: RenderPipeline) {
    this.container = new Container();
    this.container.label = 'radar';

    // Background disc
    this.bg = new Graphics();
    this.bg.circle(HALF, HALF, HALF - 1);
    this.bg.fill({ color: 0x000810, alpha: 0.88 });
    this.bg.circle(HALF, HALF, HALF - 1);
    this.bg.stroke({ color: 0x003344, width: 1.5 });

    // Inner rings
    this.rings = new Graphics();

    // Sweep graphics
    this.sweep = new Graphics();
    // Mask to clip sweep inside disc
    this.sweepMask = new Graphics();
    this.sweepMask.circle(HALF, HALF, HALF - 2);
    this.sweepMask.fill({ color: 0xffffff });

    // Blips
    this.blips = new Graphics();

    // Labels (range text)
    this.labels = new Container();
    this.label  = new Text({
      text: '3 km',
      style: new TextStyle({ fontFamily: 'Courier New', fontSize: 8, fill: 0x003a4a }),
    });
    this.label.x = 4;
    this.label.y = SIZE - 14;
    this.labels.addChild(this.label);

    this.container.addChild(this.bg);
    this.container.addChild(this.rings);
    this.container.addChild(this.sweep);
    this.container.addChild(this.blips);
    this.container.addChild(this.labels);

    this.sweep.mask = this.sweepMask;
    this.container.addChild(this.sweepMask);

    // Add to HUD layer
    pipeline.layers.get(RenderLayer.UI_WORLD)?.addChild(this.container);

    this._buildStaticRings();
  }

  private _buildStaticRings(): void {
    this.rings.clear();
    // 2 concentric reference rings
    for (let i = 1; i <= 2; i++) {
      const r = (HALF - 2) * (i / 2);
      this.rings.circle(HALF, HALF, r);
      this.rings.stroke({ color: 0x002233, width: 0.7, alpha: 0.55 });
    }
    // Cardinal tick marks
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
      const inner = HALF - 10;
      const outer = HALF - 2;
      const x1 = HALF + Math.cos(a) * inner;
      const y1 = HALF + Math.sin(a) * inner;
      const x2 = HALF + Math.cos(a) * outer;
      const y2 = HALF + Math.sin(a) * outer;
      this.rings.moveTo(x1, y1);
      this.rings.lineTo(x2, y2);
      this.rings.stroke({ color: 0x004455, width: 0.8, alpha: 0.7 });
    }
  }

  update(world: World, playerX: number, playerY: number, dt: number): void {
    this._sweepAngle = (_sweepAngle => {
      const next = _sweepAngle + SWEEP_SPEED * dt;
      return next > Math.PI * 2 ? next - Math.PI * 2 : next;
    })(this._sweepAngle);

    this._drawSweep();
    this._drawBlips(world, playerX, playerY);
  }

  private _drawSweep(): void {
    this.sweep.clear();

    const SWEEP_ARC = Math.PI * 0.55;
    const steps     = 28;
    const a         = this._sweepAngle;

    // Gradient trail — draw a fan of lines fading out
    for (let i = 0; i < steps; i++) {
      const frac  = i / steps;
      const angle = a - frac * SWEEP_ARC;
      const alpha = (1 - frac) * 0.22;
      const r     = HALF - 2;
      this.sweep.moveTo(HALF, HALF);
      this.sweep.lineTo(HALF + Math.cos(angle) * r, HALF + Math.sin(angle) * r);
      this.sweep.stroke({ color: 0x00ff88, width: r * 0.06, alpha });
    }

    // Bright leading edge
    this.sweep.moveTo(HALF, HALF);
    this.sweep.lineTo(
      HALF + Math.cos(a) * (HALF - 2),
      HALF + Math.sin(a) * (HALF - 2),
    );
    this.sweep.stroke({ color: 0x00ffaa, width: 1.5, alpha: 0.9 });
  }

  private _drawBlips(world: World, playerX: number, playerY: number): void {
    this.blips.clear();

    const R = HALF - 3;

    // ── Ships ─────────────────────────────────────────────────────────
    const ships = world.query(TransformComponent, NetworkSyncComponent);
    for (let i = 0; i < ships.length; i++) {
      const e  = createEntityId(ships[i]!);
      const tf = world.getComponent(e, TransformComponent)!;
      const ns = world.getComponent(e, NetworkSyncComponent)!;

      const dx = tf.x - playerX;
      const dy = tf.y - playerY;
      if (Math.hypot(dx, dy) > this._range) continue;

      const nx = HALF + (dx / this._range) * R;
      const ny = HALF + (dy / this._range) * R;

      if (ns.isLocalPlayer) {
        // Player: teal diamond
        this.blips.moveTo(nx, ny - 5);
        this.blips.lineTo(nx + 4, ny);
        this.blips.lineTo(nx, ny + 5);
        this.blips.lineTo(nx - 4, ny);
        this.blips.closePath();
        this.blips.fill({ color: 0x00ffcc });
        // Heading tick
        const hx = nx + Math.cos(tf.angle) * 7;
        const hy = ny + Math.sin(tf.angle) * 7;
        this.blips.moveTo(nx, ny);
        this.blips.lineTo(hx, hy);
        this.blips.stroke({ color: 0x00ffcc, width: 1.2, alpha: 0.75 });
      } else {
        // Enemy: red square-ish blip
        this.blips.rect(nx - 3, ny - 3, 6, 6);
        this.blips.fill({ color: 0xff2244 });
        this.blips.rect(nx - 3, ny - 3, 6, 6);
        this.blips.stroke({ color: 0xff6688, width: 0.5, alpha: 0.5 });
      }
    }

    // ── Asteroids ─────────────────────────────────────────────────────
    const asteroids = world.query(AsteroidResourceComponent, TransformComponent);
    for (let i = 0; i < asteroids.length; i++) {
      const e   = createEntityId(asteroids[i]!);
      const tf  = world.getComponent(e, TransformComponent)!;
      const res = world.getComponent(e, AsteroidResourceComponent)!;
      if (res.depleted) continue;

      const dx = tf.x - playerX;
      const dy = tf.y - playerY;
      if (Math.hypot(dx, dy) > this._range) continue;

      const nx = HALF + (dx / this._range) * R;
      const ny = HALF + (dy / this._range) * R;
      this.blips.circle(nx, ny, 1.8);
      this.blips.fill({ color: 0x556677, alpha: 0.8 });
    }
  }

  positionBottomRight(screenW: number, screenH: number): void {
    this.container.x = screenW - SIZE - 16;
    this.container.y = screenH - SIZE - 16;
  }

  setRange(r: number): void {
    this._range = r;
    this.label.text = r >= 1000 ? `${(r / 1000).toFixed(0)} km` : `${r} m`;
  }

  destroy(): void { this.container.destroy({ children: true }); }
}

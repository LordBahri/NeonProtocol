import { Container, Graphics } from 'pixi.js';
import { gsap } from 'gsap';
import type { RenderPipeline } from '../../core/renderer/RenderPipeline.ts';
import { RenderLayer } from '../../core/renderer/LayerManager.ts';
import { ParticleEmitter } from './ParticleEmitter.ts';
import { globalBus } from '../../core/network/MessageBus.ts';

interface ActiveEMP {
  rings:  Graphics[];
  tweens: gsap.core.Tween[];
}

export class EMPEffect {
  private layer: Container;
  private emitter: ParticleEmitter;
  private active: ActiveEMP[] = [];
  private unsubs: Array<() => void> = [];

  constructor(pipeline: RenderPipeline, emitter: ParticleEmitter) {
    this.layer   = pipeline.layers.get(RenderLayer.FX_OVER);
    this.emitter = emitter;

    this.unsubs.push(
      globalBus.on<{ x: number; y: number; radius: number }>(
        'combat:emp_detonated',
        ({ x, y, radius }) => this.spawn(x, y, radius),
      ),
    );
  }

  spawn(x: number, y: number, radius: number): void {
    const RING_COUNT = 4;
    const rings: Graphics[] = [];
    const tweens: gsap.core.Tween[] = [];
    const entry: ActiveEMP = { rings, tweens };

    for (let i = 0; i < RING_COUNT; i++) {
      const ring = new Graphics();
      ring.blendMode = 'add';
      ring.x = x;
      ring.y = y;
      this.layer.addChild(ring);
      rings.push(ring);

      const delay    = i * 0.055;
      const maxR     = radius * (0.6 + i * 0.18);
      const rState   = { r: 4 };
      const duration = 0.55 + i * 0.08;
      const color    = i % 2 === 0 ? 0x9900ff : 0x44aaff;
      const w        = 3 - i * 0.5;

      tweens.push(
        gsap.to(rState, {
          r: maxR,
          duration,
          delay,
          ease: 'power2.out',
          onUpdate: () => {
            ring.clear();
            ring.circle(0, 0, rState.r);
            ring.stroke({ width: Math.max(0.5, w), color, alpha: ring.alpha });
          },
        }),
      );

      tweens.push(
        gsap.to(ring, {
          alpha: 0,
          duration,
          delay: delay + 0.05,
          ease: 'power1.in',
          onComplete: () => {
            this.layer.removeChild(ring);
            ring.destroy();
            if (i === RING_COUNT - 1) this._cleanup(entry);
          },
        }),
      );
    }

    // Static burst particles — purple/blue sparks
    this.emitter.emit({
      count: 28,
      x, y,
      color: [0xaa00ff, 0x6600cc, 0x4488ff, 0xffffff],
      minSize: 1, maxSize: 3,
      minSpeed: 60, maxSpeed: 220,
      minLife: 0.2, maxLife: 0.8,
      gravity: 0,
      drag: 0.88,
      additive: true,
    });

    // Flicker sparks — very fast, short
    this.emitter.emit({
      count: 14,
      x, y,
      color: [0xffffff, 0xccaaff],
      minSize: 0.8, maxSize: 2,
      minSpeed: 120, maxSpeed: 350,
      minLife: 0.06, maxLife: 0.22,
      gravity: 0,
      drag: 0.82,
      additive: true,
    });

    this.active.push(entry);
  }

  private _cleanup(entry: ActiveEMP): void {
    const idx = this.active.indexOf(entry);
    if (idx !== -1) this.active.splice(idx, 1);
  }

  destroy(): void {
    for (const unsub of this.unsubs) unsub();
    for (const e of this.active) {
      for (const t of e.tweens) t.kill();
    }
    this.active.length = 0;
  }
}

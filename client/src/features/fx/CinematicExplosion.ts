import { Container, Graphics } from 'pixi.js';
import { gsap } from 'gsap';
import type { RenderPipeline } from '../../core/renderer/RenderPipeline.ts';
import { RenderLayer } from '../../core/renderer/LayerManager.ts';
import { ParticleEmitter } from './ParticleEmitter.ts';

export interface ExplosionConfig {
  x: number;
  y: number;
  scale?: number;
}

interface ActiveExplosion {
  flash:     Graphics;
  fireball:  Graphics;
  shockwave: Graphics;
  tweens:    gsap.core.Tween[];
}

export class CinematicExplosion {
  private layer: Container;
  private emitter: ParticleEmitter;
  private active: ActiveExplosion[] = [];

  constructor(pipeline: RenderPipeline, emitter: ParticleEmitter) {
    this.layer   = pipeline.layers.get(RenderLayer.FX_OVER);
    this.emitter = emitter;
  }

  spawn(cfg: ExplosionConfig): void {
    const { x, y } = cfg;
    const s        = cfg.scale ?? 1;

    // ── Stage 1: White flash ──────────────────────────────────────────────────
    const flash = new Graphics();
    flash.circle(0, 0, 55 * s);
    flash.fill({ color: 0xffffff, alpha: 1 });
    flash.blendMode = 'add';
    flash.x = x; flash.y = y;
    this.layer.addChild(flash);

    // ── Stage 2: Expanding orange fireball ────────────────────────────────────
    const fireball = new Graphics();
    fireball.circle(0, 0, 1);
    fireball.fill({ color: 0xff6600, alpha: 0.85 });
    fireball.blendMode = 'add';
    fireball.x = x; fireball.y = y;
    this.layer.addChild(fireball);

    // ── Stage 3: Shockwave ring ───────────────────────────────────────────────
    const shockwave = new Graphics();
    shockwave.blendMode = 'add';
    shockwave.x = x; shockwave.y = y;
    this.layer.addChild(shockwave);
    this._drawRing(shockwave, 1, 0xffffff, 0.7, 3 * s);

    const tweens: gsap.core.Tween[] = [];
    const cleanup = () => this._cleanup(entry);

    // Flash fade
    tweens.push(
      gsap.to(flash, {
        alpha: 0,
        duration: 0.18,
        ease: 'power3.out',
        onComplete: () => { this.layer.removeChild(flash); flash.destroy(); },
      }),
    );

    // Fireball expand + fade — redraw at larger sizes
    const fbState = { r: 5 };
    tweens.push(
      gsap.to(fbState, {
        r: 80 * s,
        duration: 0.55,
        ease: 'power2.out',
        onUpdate: () => {
          fireball.clear();
          fireball.circle(0, 0, fbState.r);
          fireball.fill({ color: 0xff4400, alpha: 1 });
          fireball.circle(0, 0, fbState.r * 0.55);
          fireball.fill({ color: 0xffaa00, alpha: 0.6 });
        },
      }),
    );
    tweens.push(
      gsap.to(fireball, {
        alpha: 0,
        duration: 0.6,
        delay: 0.08,
        ease: 'power1.in',
        onComplete: () => { this.layer.removeChild(fireball); fireball.destroy(); },
      }),
    );

    // Shockwave expand
    const swState = { r: 8 * s };
    tweens.push(
      gsap.to(swState, {
        r: 130 * s,
        duration: 0.5,
        ease: 'power1.out',
        onUpdate: () => {
          shockwave.clear();
          this._drawRing(shockwave, swState.r, 0xffffff, shockwave.alpha, 2 * s);
        },
      }),
    );
    tweens.push(
      gsap.to(shockwave, {
        alpha: 0,
        duration: 0.5,
        ease: 'power2.in',
        onComplete: () => { this.layer.removeChild(shockwave); shockwave.destroy(); cleanup(); },
      }),
    );

    // ── Particles: debris (fast angular chunks) ───────────────────────────────
    this.emitter.emit({
      count: Math.round(22 * s),
      x, y,
      color: [0xff6600, 0xff2200, 0xffaa00, 0xffffff],
      minSize: 2.5 * s, maxSize: 7 * s,
      minSpeed: 100 * s, maxSpeed: 320 * s,
      minLife: 0.4, maxLife: 1.4,
      gravity: 0, drag: 0.90,
      additive: true,
    });

    // ── Particles: hot sparks (very fast, short life) ─────────────────────────
    this.emitter.emit({
      count: Math.round(16 * s),
      x, y,
      color: [0xffffff, 0xffeecc],
      minSize: 1, maxSize: 2.5,
      minSpeed: 180 * s, maxSpeed: 480 * s,
      minLife: 0.08, maxLife: 0.35,
      gravity: 0, drag: 0.85,
      additive: true,
    });

    // ── Particles: embers (slow drift) ───────────────────────────────────────
    this.emitter.emit({
      count: Math.round(10 * s),
      x, y,
      color: [0xff4400, 0xff8800],
      minSize: 1.5, maxSize: 3,
      minSpeed: 25 * s, maxSpeed: 90 * s,
      minLife: 1.0, maxLife: 2.2,
      gravity: -8,
      drag: 0.97,
      additive: true,
    });

    const entry: ActiveExplosion = { flash, fireball, shockwave, tweens };
    this.active.push(entry);
  }

  private _drawRing(g: Graphics, r: number, color: number, alpha: number, width: number): void {
    g.circle(0, 0, r);
    g.stroke({ width, color, alpha });
  }

  private _cleanup(entry: ActiveExplosion): void {
    const idx = this.active.indexOf(entry);
    if (idx !== -1) this.active.splice(idx, 1);
  }

  destroy(): void {
    for (const e of this.active) {
      for (const t of e.tweens) t.kill();
    }
    this.active.length = 0;
  }
}

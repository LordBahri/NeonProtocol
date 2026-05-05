import type { Container } from 'pixi.js';
import { ParticleEmitter } from './ParticleEmitter.ts';
import { ExplosionEffect } from './ExplosionEffect.ts';
import type { RenderPipeline } from '../../core/renderer/RenderPipeline.ts';
import { RenderLayer } from '../../core/renderer/LayerManager.ts';
import { globalBus, NetworkEvent } from '../../core/network/MessageBus.ts';

export interface HitVfxOptions {
  x: number;
  y: number;
  isShieldHit: boolean;
  damage: number;
}

export class EffectsManager {
  private particleEmitter: ParticleEmitter;
  private explosionEffect: ExplosionEffect;
  private fxLayer: Container;
  private unsubs: Array<() => void> = [];

  constructor(pipeline: RenderPipeline) {
    this.fxLayer = pipeline.layers.get(RenderLayer.FX_OVER);

    this.particleEmitter = new ParticleEmitter(256, 2048);
    this.explosionEffect = new ExplosionEffect(this.particleEmitter);

    this.fxLayer.addChild(this.particleEmitter.container);
    this.fxLayer.addChild(this.explosionEffect.container);

    this.unsubs.push(
      globalBus.on<{ x: number; y: number; damage: number }>(NetworkEvent.COMBAT_HIT, (data) => {
        this.spawnHitVfx({ x: data.x, y: data.y, isShieldHit: false, damage: data.damage });
      }),
    );

    this.unsubs.push(
      globalBus.on<{ entity: unknown }>(NetworkEvent.COMBAT_DEATH, (_data) => {
        // Explosion position resolved upstream; just prewarm via bus
      }),
    );
  }

  get emitter(): ParticleEmitter {
    return this.particleEmitter;
  }

  spawnHitVfx(opts: HitVfxOptions): void {
    if (opts.isShieldHit) {
      this.particleEmitter.emit({
        count: 8,
        x: opts.x,
        y: opts.y,
        color: [0x00ffff, 0x0088ff],
        minSize: 1,
        maxSize: 3,
        minSpeed: 40,
        maxSpeed: 120,
        minLife: 0.15,
        maxLife: 0.4,
        additive: true,
      });
    } else {
      const intensity = Math.min(opts.damage / 50, 1);
      this.particleEmitter.emit({
        count: Math.round(6 + intensity * 10),
        x: opts.x,
        y: opts.y,
        color: [0xff6600, 0xff2200, 0xffaa00],
        minSize: 1.5,
        maxSize: 4,
        minSpeed: 50,
        maxSpeed: 180,
        minLife: 0.2,
        maxLife: 0.6,
        gravity: 20,
        drag: 0.9,
        additive: true,
      });
    }
  }

  spawnExplosion(x: number, y: number, scale = 1): void {
    this.explosionEffect.spawn({ x, y, scale });
  }

  spawnEngineTrail(x: number, y: number, intensity: number): void {
    if (intensity < 0.1) return;
    this.particleEmitter.emit({
      count: 1,
      x,
      y,
      color: [0x00aaff, 0x0055ff],
      minSize: 1,
      maxSize: 2 + intensity * 3,
      minSpeed: 10,
      maxSpeed: 40,
      minLife: 0.1,
      maxLife: 0.3,
      additive: true,
    });
  }

  update(dt: number): void {
    this.particleEmitter.update(dt);
  }

  destroy(): void {
    for (const unsub of this.unsubs) unsub();
    this.explosionEffect.destroy();
    this.particleEmitter.clear();
  }
}

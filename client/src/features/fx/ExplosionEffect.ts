import { Container, Graphics } from 'pixi.js';
import { ParticleEmitter } from './ParticleEmitter.ts';
import { gsap } from 'gsap';

export interface ExplosionConfig {
  x: number;
  y: number;
  scale?: number;
  color?: number;
}

export class ExplosionEffect {
  private emitter: ParticleEmitter;
  private flashContainer: Container;
  readonly container: Container;
  private active: Array<{ flash: Graphics; tween: gsap.core.Tween }> = [];

  constructor(emitter: ParticleEmitter) {
    this.emitter = emitter;
    this.container = new Container();
    this.flashContainer = new Container();
    this.container.addChild(this.flashContainer);
  }

  spawn(config: ExplosionConfig): void {
    const scale = config.scale ?? 1;
    const color = config.color ?? 0xff6600;

    this.emitter.emit({
      count: Math.round(30 * scale),
      x: config.x,
      y: config.y,
      color: [color, 0xff2200, 0xffaa00, 0xffffff],
      minSize: 2 * scale,
      maxSize: 6 * scale,
      minSpeed: 80 * scale,
      maxSpeed: 250 * scale,
      minLife: 0.3,
      maxLife: 1.2,
      gravity: 0,
      drag: 0.92,
      additive: true,
    });

    this.emitter.emit({
      count: Math.round(15 * scale),
      x: config.x,
      y: config.y,
      color: [0xffffff, 0xffeecc],
      minSize: 1,
      maxSize: 3,
      minSpeed: 150 * scale,
      maxSpeed: 400 * scale,
      minLife: 0.1,
      maxLife: 0.5,
      gravity: 0,
      drag: 0.85,
      additive: true,
    });

    const flash = new Graphics();
    flash.circle(config.x, config.y, 40 * scale);
    flash.fill({ color: 0xffffff, alpha: 0.9 });
    flash.blendMode = 'add';
    this.flashContainer.addChild(flash);

    const tween = gsap.to(flash, {
      alpha: 0,
      duration: 0.25,
      ease: 'power2.out',
      onComplete: () => {
        this.flashContainer.removeChild(flash);
        flash.destroy();
        const idx = this.active.findIndex(a => a.flash === flash);
        if (idx !== -1) this.active.splice(idx, 1);
      },
    });

    this.active.push({ flash, tween });
  }

  destroy(): void {
    for (const { tween, flash } of this.active) {
      tween.kill();
      flash.destroy();
    }
    this.active.length = 0;
  }
}

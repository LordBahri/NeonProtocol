import { gsap } from 'gsap';

export interface TransitionOptions {
  duration?: number;
  color?: number;
}

export class FadeTransition {
  private overlay: HTMLElement;

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 9999;
      background: #000008; opacity: 0;
      pointer-events: none; will-change: opacity;
    `;
    document.body.appendChild(this.overlay);
  }

  async fadeOut(opts: TransitionOptions = {}): Promise<void> {
    const duration = opts.duration ?? 0.25;
    this.overlay.style.pointerEvents = 'all';
    return new Promise(resolve => {
      gsap.to(this.overlay, { opacity: 1, duration, ease: 'power2.in', onComplete: resolve });
    });
  }

  async fadeIn(opts: TransitionOptions = {}): Promise<void> {
    const duration = opts.duration ?? 0.35;
    return new Promise(resolve => {
      gsap.to(this.overlay, {
        opacity: 0, duration, ease: 'power2.out',
        onComplete: () => {
          this.overlay.style.pointerEvents = 'none';
          resolve();
        },
      });
    });
  }

  destroy(): void {
    this.overlay.remove();
  }
}

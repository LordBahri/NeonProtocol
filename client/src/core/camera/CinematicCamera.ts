import { Camera } from './Camera.js';
import { lerp } from '../simulation/interpolation.js';

export interface CinematicCameraConfig {
  /** How far ahead the camera leads based on velocity (world units per unit of speed). */
  lookAheadFactor?: number;
  /** Smoothing for the look-ahead offset (0–1). */
  lookAheadLerp?: number;
  /** Camera zooms out when moving fast. Higher = more zoom-out. */
  speedZoomFactor?: number;
  /** Maximum zoom-out multiplier applied by speed (e.g. 0.3 → 30% smaller). */
  maxSpeedZoomOut?: number;
  /** Duration in seconds of the warp zoom effect. */
  warpDuration?: number;
}

const DEFAULTS: Required<CinematicCameraConfig> = {
  lookAheadFactor: 0.18,
  lookAheadLerp:   0.06,
  speedZoomFactor: 0.00008,
  maxSpeedZoomOut: 0.35,
  warpDuration:    1.2,
};

export class CinematicCamera {
  readonly inner: Camera;
  private cfg: Required<CinematicCameraConfig>;

  private prevTargetX = 0;
  private prevTargetY = 0;
  private velX = 0;
  private velY = 0;
  private lookX = 0;
  private lookY = 0;

  private baseZoom: number;
  private _warpPhase: 'none' | 'in' | 'out' = 'none';
  private _warpTime = 0;
  private _warpDuration: number;

  /** Cinematic letterbox bars (optional CSS overlay). */
  private _letterboxActive = false;
  private _letterboxEl: HTMLElement | null = null;

  constructor(camera: Camera, cfg: CinematicCameraConfig = {}) {
    this.inner = camera;
    this.cfg   = { ...DEFAULTS, ...cfg };
    this.baseZoom      = camera.zoom;
    this._warpDuration = this.cfg.warpDuration;
  }

  /** The target the camera should track (world position). */
  setFollowTarget(x: number, y: number): void {
    this.inner.setTarget(x, y);
  }

  setBaseZoom(zoom: number): void {
    this.baseZoom = zoom;
    this.inner.setZoom(zoom);
  }

  /**
   * Trigger a hyperspace warp effect:
   *   - Camera zooms in quickly, then zooms back out.
   *   - PostProcessPipeline.startWarp() should be called in tandem.
   */
  startWarp(): void {
    if (this._warpPhase !== 'none') return;
    this._warpPhase = 'in';
    this._warpTime  = 0;
  }

  update(dt: number): void {
    const tx = this.inner['targetX'] as number;
    const ty = this.inner['targetY'] as number;

    // Estimate velocity (world units per second)
    this.velX = (tx - this.prevTargetX) / Math.max(dt, 0.001);
    this.velY = (ty - this.prevTargetY) / Math.max(dt, 0.001);
    this.prevTargetX = tx;
    this.prevTargetY = ty;

    const speed = Math.sqrt(this.velX ** 2 + this.velY ** 2);

    // Smooth look-ahead
    const targetLookX = this.velX * this.cfg.lookAheadFactor;
    const targetLookY = this.velY * this.cfg.lookAheadFactor;
    this.lookX = lerp(this.lookX, targetLookX, this.cfg.lookAheadLerp);
    this.lookY = lerp(this.lookY, targetLookY, this.cfg.lookAheadLerp);

    // Speed-based zoom-out
    const speedZoomOut = Math.min(speed * this.cfg.speedZoomFactor, this.cfg.maxSpeedZoomOut);

    // Warp zoom animation
    let warpZoomMult = 1.0;
    if (this._warpPhase !== 'none') {
      this._warpTime += dt;
      const halfDur = this._warpDuration * 0.5;

      if (this._warpPhase === 'in') {
        const t = Math.min(this._warpTime / halfDur, 1);
        warpZoomMult = 1.0 + t * t * 0.6; // zoom in 60%
        if (t >= 1) { this._warpPhase = 'out'; this._warpTime = 0; }
      } else {
        const t = Math.min(this._warpTime / halfDur, 1);
        warpZoomMult = 1.6 - t * t * 0.6; // zoom back out
        if (t >= 1) { this._warpPhase = 'none'; warpZoomMult = 1.0; }
      }
    }

    const finalZoom = this.baseZoom * (1 - speedZoomOut) * warpZoomMult;
    this.inner.setZoom(finalZoom);

    // Offset the tracked target with look-ahead
    if (this.inner['followTarget']) {
      const ft = this.inner['followTarget'] as { x: number; y: number };
      this.inner['targetX'] = ft.x + this.lookX + (this.inner['followOffset'] as { x: number }).x;
      this.inner['targetY'] = ft.y + this.lookY + (this.inner['followOffset'] as { y: number }).y;
    }

    this.inner.update(dt);
  }

  getInterpolated(alpha: number) {
    return this.inner.getInterpolated(alpha);
  }

  shake(magnitude: number, duration: number, frequency = 24): void {
    this.inner.shake(magnitude, duration, frequency);
  }

  /** Toggle cinematic letterbox bars (requires a CSS class `.letterbox` element). */
  setLetterbox(active: boolean): void {
    if (active === this._letterboxActive) return;
    this._letterboxActive = active;

    if (active && !this._letterboxEl) {
      const el = document.createElement('div');
      el.id = 'letterbox';
      Object.assign(el.style, {
        position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '999',
        background: 'linear-gradient(to bottom, #000 0%, transparent 12%, transparent 88%, #000 100%)',
        opacity: '0', transition: 'opacity 0.6s ease',
      });
      document.body.appendChild(el);
      this._letterboxEl = el;
    }
    if (this._letterboxEl) {
      this._letterboxEl.style.opacity = active ? '1' : '0';
    }
  }

  get warpProgress(): number { return this._warpPhase !== 'none' ? this._warpTime / this._warpDuration : 0; }
}

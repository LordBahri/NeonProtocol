import { lerp, lerpAngle } from '../simulation/interpolation.ts';

export interface CameraConfig {
  followLerp: number;
  zoomLerp: number;
  minZoom: number;
  maxZoom: number;
  shakeDamping: number;
}

export interface CameraTarget {
  x: number;
  y: number;
}

const DEFAULT_CONFIG: CameraConfig = {
  followLerp: 0.08,
  zoomLerp: 0.06,
  minZoom: 0.2,
  maxZoom: 4,
  shakeDamping: 8,
};

export class Camera {
  x = 0;
  y = 0;
  zoom = 1;
  rotation = 0;

  private targetX = 0;
  private targetY = 0;
  private targetZoom = 1;
  private targetRotation = 0;

  private shakeX = 0;
  private shakeY = 0;
  private shakeMagnitude = 0;
  private shakeFrequency = 0;
  private shakeTime = 0;
  private shakeDuration = 0;

  private followTarget: CameraTarget | null = null;
  private followOffset = { x: 0, y: 0 };
  private cfg: CameraConfig;

  private _prevX = 0;
  private _prevY = 0;
  private _prevZoom = 1;

  constructor(config: Partial<CameraConfig> = {}) {
    this.cfg = { ...DEFAULT_CONFIG, ...config };
  }

  follow(target: CameraTarget | null, offsetX = 0, offsetY = 0): void {
    this.followTarget = target;
    this.followOffset.x = offsetX;
    this.followOffset.y = offsetY;
  }

  setTarget(x: number, y: number, zoom?: number): void {
    this.targetX = x;
    this.targetY = y;
    if (zoom !== undefined) this.targetZoom = zoom;
  }

  snapTo(x: number, y: number, zoom?: number): void {
    this.x = this.targetX = x;
    this.y = this.targetY = y;
    if (zoom !== undefined) this.zoom = this.targetZoom = zoom;
    this._prevX = x;
    this._prevY = y;
    if (zoom !== undefined) this._prevZoom = zoom;
  }

  setZoom(zoom: number): void {
    this.targetZoom = Math.max(this.cfg.minZoom, Math.min(this.cfg.maxZoom, zoom));
  }

  zoomBy(delta: number): void {
    this.setZoom(this.targetZoom * (1 + delta));
  }

  shake(magnitude: number, duration: number, frequency = 24): void {
    this.shakeMagnitude = Math.max(this.shakeMagnitude, magnitude);
    this.shakeDuration = duration;
    this.shakeTime = 0;
    this.shakeFrequency = frequency;
  }

  update(dt: number): void {
    this._prevX = this.x;
    this._prevY = this.y;
    this._prevZoom = this.zoom;

    if (this.followTarget) {
      this.targetX = this.followTarget.x + this.followOffset.x;
      this.targetY = this.followTarget.y + this.followOffset.y;
    }

    this.x = lerp(this.x, this.targetX, Math.min(this.cfg.followLerp, 1));
    this.y = lerp(this.y, this.targetY, Math.min(this.cfg.followLerp, 1));
    this.zoom = lerp(this.zoom, this.targetZoom, Math.min(this.cfg.zoomLerp, 1));
    this.rotation = lerpAngle(this.rotation, this.targetRotation, 0.1);

    this.updateShake(dt);
  }

  private updateShake(dt: number): void {
    if (this.shakeDuration <= 0) {
      this.shakeX = 0;
      this.shakeY = 0;
      this.shakeMagnitude = 0;
      return;
    }
    this.shakeTime += dt;
    this.shakeDuration -= dt;

    const decay = Math.max(0, this.shakeDuration);
    const t = this.shakeTime * this.shakeFrequency;
    this.shakeX = Math.sin(t * 2.1) * this.shakeMagnitude * decay;
    this.shakeY = Math.cos(t * 1.7) * this.shakeMagnitude * decay;
    this.shakeMagnitude *= (1 - this.cfg.shakeDamping * dt);
  }

  getInterpolated(alpha: number): { x: number; y: number; zoom: number } {
    return {
      x: lerp(this._prevX, this.x, alpha) + this.shakeX,
      y: lerp(this._prevY, this.y, alpha) + this.shakeY,
      zoom: lerp(this._prevZoom, this.zoom, alpha),
    };
  }

  screenToWorld(sx: number, sy: number, screenW: number, screenH: number): { x: number; y: number } {
    return {
      x: this.x + (sx - screenW * 0.5) / this.zoom,
      y: this.y + (sy - screenH * 0.5) / this.zoom,
    };
  }

  worldToScreen(wx: number, wy: number, screenW: number, screenH: number): { x: number; y: number } {
    return {
      x: (wx - this.x) * this.zoom + screenW * 0.5,
      y: (wy - this.y) * this.zoom + screenH * 0.5,
    };
  }

  getViewBounds(screenW: number, screenH: number): { left: number; top: number; right: number; bottom: number } {
    const hw = screenW * 0.5 / this.zoom;
    const hh = screenH * 0.5 / this.zoom;
    return { left: this.x - hw, top: this.y - hh, right: this.x + hw, bottom: this.y + hh };
  }

  isVisible(wx: number, wy: number, radius: number, screenW: number, screenH: number): boolean {
    const b = this.getViewBounds(screenW, screenH);
    return wx + radius > b.left && wx - radius < b.right &&
           wy + radius > b.top  && wy - radius < b.bottom;
  }
}

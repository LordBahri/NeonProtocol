import { Camera } from './Camera.ts';
import type { RenderPipeline } from '../renderer/RenderPipeline.ts';

export interface BoundaryRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Bridges Camera (pure data/logic) and RenderPipeline (WebGL transform).
 * Handles boundary clamping and applies the interpolated state each frame.
 */
export class CameraController {
  readonly camera: Camera;
  private pipeline: RenderPipeline;
  private boundary: BoundaryRect | null = null;

  constructor(camera: Camera, pipeline: RenderPipeline) {
    this.camera = camera;
    this.pipeline = pipeline;
  }

  setBoundary(rect: BoundaryRect | null): void {
    this.boundary = rect;
  }

  update(dt: number): void {
    this.camera.update(dt);
    this.clampToBoundary();
  }

  applyToRenderer(alpha: number): void {
    const { x, y, zoom } = this.camera.getInterpolated(alpha);
    this.pipeline.setCamera({ x, y, zoom });
  }

  private clampToBoundary(): void {
    if (!this.boundary) return;
    const b = this.boundary;
    const s = this.pipeline.screen;
    const hw = s.width  * 0.5 / this.camera.zoom;
    const hh = s.height * 0.5 / this.camera.zoom;

    const cx = Math.max(b.left + hw, Math.min(b.right  - hw, this.camera.x));
    const cy = Math.max(b.top  + hh, Math.min(b.bottom - hh, this.camera.y));

    if (cx !== this.camera.x || cy !== this.camera.y) {
      (this.camera as unknown as { x: number; y: number }).x = cx;
      (this.camera as unknown as { x: number; y: number }).y = cy;
    }
  }
}

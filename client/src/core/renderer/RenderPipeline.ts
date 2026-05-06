import { Application, Container, Ticker, BlurFilter } from 'pixi.js';
import { LayerManager, RenderLayer } from './LayerManager.ts';
import { TextureCache } from './TextureCache.ts';
import { ShaderManager } from './ShaderManager.ts';

export interface RenderPipelineOptions {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  resolution?: number;
  antialias?: boolean;
}

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

export class RenderPipeline {
  readonly app: Application;
  readonly layers: LayerManager;
  readonly textures: TextureCache;
  readonly shaders: ShaderManager;

  private worldContainer: Container;
  private camera: CameraState = { x: 0, y: 0, zoom: 1 };
  private _initialized = false;

  constructor() {
    this.app = new Application();
    this.layers = new LayerManager();
    this.textures = new TextureCache();
    this.shaders = new ShaderManager();
    this.worldContainer = new Container();
    this.worldContainer.label = 'world';
  }

  async init(options: RenderPipelineOptions): Promise<void> {
    await this.app.init({
      canvas: options.canvas,
      width: options.width,
      height: options.height,
      resolution: options.resolution ?? window.devicePixelRatio,
      autoDensity: true,
      antialias: options.antialias ?? false,
      preference: 'webgl',
      background: 0x000c18,
      hello: false,
    });

    this.worldContainer.addChild(this.layers.root);
    this.app.stage.addChild(this.worldContainer);

    this._initialized = true;
    this.applyCamera();
  }

  setCamera(camera: Partial<CameraState>): void {
    Object.assign(this.camera, camera);
    this.applyCamera();
  }

  lerpCamera(target: CameraState, alpha: number): void {
    this.camera.x += (target.x - this.camera.x) * alpha;
    this.camera.y += (target.y - this.camera.y) * alpha;
    this.camera.zoom += (target.zoom - this.camera.zoom) * alpha;
    this.applyCamera();
  }

  private applyCamera(): void {
    const hw = this.app.screen.width * 0.5;
    const hh = this.app.screen.height * 0.5;
    this.worldContainer.scale.set(this.camera.zoom);
    this.worldContainer.x = hw - this.camera.x * this.camera.zoom;
    this.worldContainer.y = hh - this.camera.y * this.camera.zoom;
  }

  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    const hw = this.app.screen.width * 0.5;
    const hh = this.app.screen.height * 0.5;
    return {
      x: hw + (wx - this.camera.x) * this.camera.zoom,
      y: hh + (wy - this.camera.y) * this.camera.zoom,
    };
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    const hw = this.app.screen.width * 0.5;
    const hh = this.app.screen.height * 0.5;
    return {
      x: this.camera.x + (sx - hw) / this.camera.zoom,
      y: this.camera.y + (sy - hh) / this.camera.zoom,
    };
  }

  getVisibleBounds(): { left: number; top: number; right: number; bottom: number } {
    const w = this.app.screen.width / this.camera.zoom;
    const h = this.app.screen.height / this.camera.zoom;
    return {
      left: this.camera.x - w * 0.5,
      top: this.camera.y - h * 0.5,
      right: this.camera.x + w * 0.5,
      bottom: this.camera.y + h * 0.5,
    };
  }

  onRender(cb: (ticker: Ticker) => void): void {
    this.app.ticker.add(cb);
  }

  offRender(cb: (ticker: Ticker) => void): void {
    this.app.ticker.remove(cb);
  }

  resize(width: number, height: number): void {
    this.app.renderer.resize(width, height);
    this.applyCamera();
  }

  get initialized(): boolean { return this._initialized; }
  get ticker(): Ticker { return this.app.ticker; }
  get screen() { return this.app.screen; }

  destroy(): void {
    this.app.destroy();
  }
}

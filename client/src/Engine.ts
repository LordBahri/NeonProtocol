import { World }           from './core/ecs/World.ts';
import { SystemScheduler } from './core/ecs/SystemScheduler.ts';
import { RenderPipeline }  from './core/renderer/RenderPipeline.ts';
import { BloomPipeline }   from './core/renderer/BloomPipeline.ts';
import { GameLoop }        from './core/simulation/GameLoop.ts';
import { SceneManager }    from './core/scene/SceneManager.ts';
import { Camera }          from './core/camera/Camera.ts';
import { CameraController }from './core/camera/CameraController.ts';
import { InputManager }    from './core/input/InputManager.ts';
import { ActionMap }       from './core/input/ActionMap.ts';
import { AssetManager }    from './core/assets/AssetManager.ts';
import { AudioManager }    from './core/audio/AudioManager.ts';
import { MessageBus }      from './core/network/MessageBus.ts';
import type { Scene }      from './core/scene/Scene.ts';
import type { AssetBundle }from './core/assets/AssetBundle.ts';
import type { SwitchOptions } from './core/scene/SceneManager.ts';

export interface EngineOptions {
  canvas:          HTMLCanvasElement;
  uiLayer:         HTMLElement;
  simulationHz?:   number;
  bloom?:          boolean;
  bloomStrength?:  number;
  antialias?:      boolean;
}

export interface EngineStats {
  fps:       number;
  entities:  number;
  tickCount: number;
}

/**
 * Top-level engine singleton.
 * Owns every core subsystem and exposes a clean API for game code.
 *
 * Boot order:
 *   1. init()
 *   2. loadBundles()   (optional, game decides what to load)
 *   3. switchScene()
 *   4. start()         — begins the game loop
 */
export class Engine {
  // ── Core subsystems ─────────────────────────────────────────────────────────
  readonly world:    World;
  readonly scheduler:SystemScheduler;
  readonly pipeline: RenderPipeline;
  readonly scenes:   SceneManager;
  readonly camera:   Camera;
  readonly cameraCtrl: CameraController;
  readonly input:    InputManager;
  readonly actions:  ActionMap;
  readonly assets:   AssetManager;
  readonly audio:    AudioManager;
  readonly bus:      MessageBus;

  private loop!:  GameLoop;
  private bloom?: BloomPipeline;
  private _started = false;
  private _stats:  EngineStats = { fps: 0, entities: 0, tickCount: 0 };

  constructor() {
    this.world      = new World();
    this.scheduler  = new SystemScheduler();
    this.pipeline   = new RenderPipeline();
    this.scenes     = new SceneManager();
    this.camera     = new Camera();
    this.assets     = new AssetManager();
    this.audio      = new AudioManager(this.assets);
    this.bus        = new MessageBus();
    this.actions    = new ActionMap();

    // InputManager + CameraController need the canvas, created in init()
    this.input      = null!;
    this.cameraCtrl = null!;
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  async init(opts: EngineOptions): Promise<void> {
    const { canvas } = opts;

    await this.pipeline.init({
      canvas,
      width:      window.innerWidth,
      height:     window.innerHeight,
      antialias:  opts.antialias ?? false,
    });

    // Input (needs canvas reference)
    (this as { input: InputManager }).input = new InputManager(canvas, this.actions);

    // Camera
    (this as { cameraCtrl: CameraController }).cameraCtrl =
      new CameraController(this.camera, this.pipeline);

    // Bloom
    if (opts.bloom !== false) {
      this.bloom = new BloomPipeline(this.pipeline.app, {
        strength: opts.bloomStrength ?? 0.45,
      });
    }

    // Game loop
    this.loop = new GameLoop({
      simulationTickRate: opts.simulationHz ?? 60,
      world:     this.world,
      scheduler: this.scheduler,
      onRenderTick: this.onRenderTick,
    });

    // Resize
    const ro = new ResizeObserver(() => this.onResize());
    ro.observe(canvas.parentElement ?? document.documentElement);

    // Resume audio on first interaction
    const resumeAudio = () => {
      this.audio.resume();
      window.removeEventListener('pointerdown', resumeAudio);
      window.removeEventListener('keydown',     resumeAudio);
    };
    window.addEventListener('pointerdown', resumeAudio, { once: true });
    window.addEventListener('keydown',     resumeAudio, { once: true });

    console.log('[Engine] Initialized');
  }

  async loadBundles(bundles: AssetBundle[], onProgress?: (p: number) => void): Promise<void> {
    const all = bundles.flatMap(b => b.assets);
    const total = all.length;
    if (total === 0) return;

    let loaded = 0;
    await this.assets.loadBundles(bundles, (_loaded, _total) => {
      loaded++;
      onProgress?.(loaded / total);
    });
  }

  async switchScene(scene: Scene, opts?: SwitchOptions): Promise<void> {
    await this.scenes.switchTo(scene, opts);
  }

  start(): void {
    if (this._started) return;
    this._started = true;
    this.loop.start();
    console.log('[Engine] Started');
  }

  stop(): void {
    this.loop.stop();
    this._started = false;
  }

  // ── Render tick ─────────────────────────────────────────────────────────────

  private onRenderTick = (alpha: number, world: World): void => {
    const dt = 1 / 60;

    // Sync input actions before scene update
    this.input.update();

    // Update mouse world position from camera
    const m = this.input.mouse;
    const s = this.pipeline.screen;
    const wp = this.camera.screenToWorld(m.x, m.y, s.width, s.height);
    this.input.setWorldMouse(wp.x, wp.y);

    // Camera tick
    this.cameraCtrl.update(dt);
    this.cameraCtrl.applyToRenderer(alpha);

    // Scene render callback
    this.scenes.render(alpha, world, this.pipeline);

    // Bloom pass (fires after PixiJS renders the stage normally)
    // Note: BloomPipeline self-attaches to stage, no explicit call needed

    // Stats
    this._stats.fps      = Math.round(this.pipeline.ticker.FPS);
    this._stats.entities = world.entityCount;
    this._stats.tickCount = this.loop.tickCount;

    // Flush single-frame input sets after systems consumed them
    this.input.flush();
  };

  // ── Systems ─────────────────────────────────────────────────────────────────

  registerSystems(group: string, ...systems: Parameters<SystemScheduler['addSystem']>[1][]): void {
    // Auto-create group on first use so callers don't need a separate registerGroup call
    try {
      for (const sys of systems) this.scheduler.addSystem(group, sys);
    } catch {
      this.scheduler.registerGroup(group, ...systems);
    }
  }

  // ── Convenience ─────────────────────────────────────────────────────────────

  get stats(): Readonly<EngineStats> { return this._stats; }
  get isStarted(): boolean { return this._started; }
  get bloomPipeline(): BloomPipeline | undefined { return this.bloom; }

  setBloomStrength(v: number): void { this.bloom?.setStrength(v); }
  enableBloom():  void { this.bloom?.enable(); }
  disableBloom(): void { this.bloom?.disable(); }

  // ── Resize ──────────────────────────────────────────────────────────────────

  private onResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.pipeline.resize(w, h);
    this.bloom?.onResize();
    this.scenes.onResize(w, h);
  }

  // ── Destroy ─────────────────────────────────────────────────────────────────

  async destroy(): Promise<void> {
    this.stop();
    this.scenes.destroy();
    this.input.destroy();
    this.bloom?.destroy();
    await this.audio.destroy();
    this.assets.destroy();
    this.pipeline.destroy();
    this.bus.clear();
    console.log('[Engine] Destroyed');
  }
}

/** Singleton accessor — game code imports this instead of constructing Engine directly */
export const engine = new Engine();

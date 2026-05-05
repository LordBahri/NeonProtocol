import { World } from './core/ecs/World.ts';
import { SystemScheduler } from './core/ecs/SystemScheduler.ts';
import { RenderPipeline } from './core/renderer/RenderPipeline.ts';
import { GameLoop } from './core/simulation/GameLoop.ts';
import { ColyseusNetworkClient } from './core/network/ColyseusClient.ts';
import { StateReconciler } from './core/network/StateReconciler.ts';
import { BackgroundRenderer } from './features/space/BackgroundRenderer.ts';
import { SectorGrid } from './features/space/SectorGrid.ts';
import { ChunkManager } from './features/space/ChunkManager.ts';
import { ShipRenderer } from './features/ships/ShipRenderer.ts';
import { EffectsManager } from './features/fx/EffectsManager.ts';
import { HUD } from './features/ui/HUD.ts';
import { Minimap } from './features/ui/Minimap.ts';
import { InputSystem } from './features/ships/InputSystem.ts';
import { MovementSystem } from './features/ships/MovementSystem.ts';
import { CombatSystem } from './features/combat/CombatSystem.ts';
import { ShieldRechargeSystem } from './features/combat/ShieldRechargeSystem.ts';
import { RenderLayer } from './core/renderer/LayerManager.ts';
import { ProjectilePool } from './features/combat/ProjectilePool.ts';
import { spawnShip } from './features/ships/ShipFactory.ts';
import { TransformComponent, VelocityComponent, ShipStatsComponent } from './features/ships/ShipComponents.ts';
import { createEntityId } from './core/ecs/types.ts';
import { useGameStore } from './store/gameStore.ts';
import { useUIStore } from './store/uiStore.ts';
import { globalBus, NetworkEvent } from './core/network/MessageBus.ts';

export class GameContext {
  readonly world: World;
  readonly scheduler: SystemScheduler;
  readonly pipeline: RenderPipeline;
  readonly network: ColyseusNetworkClient;
  readonly reconciler: StateReconciler;

  private loop!: GameLoop;
  private background!: BackgroundRenderer;
  private sectorGrid!: SectorGrid;
  private chunkManager!: ChunkManager;
  private shipRenderer!: ShipRenderer;
  private effectsManager!: EffectsManager;
  private projectilePool!: ProjectilePool;
  private hud!: HUD;
  private minimap!: Minimap;
  private cleanupInput: (() => void) | null = null;
  private resizeObserver!: ResizeObserver;

  constructor() {
    this.world = new World();
    this.scheduler = new SystemScheduler();
    this.pipeline = new RenderPipeline();
    this.network = new ColyseusNetworkClient(
      import.meta.env['VITE_SERVER_URL'] as string ?? 'ws://localhost:2567',
    );
    this.reconciler = new StateReconciler();
  }

  async init(): Promise<void> {
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    const uiLayer = document.getElementById('ui-layer') as HTMLElement;

    await this.pipeline.init({
      canvas,
      width: window.innerWidth,
      height: window.innerHeight,
    });

    this.setupSystems();
    this.setupRenderers(uiLayer);
    this.setupGameLoop();
    this.setupResizeHandler(canvas);
    // Input is now owned by Engine.ts / InputManager

    this.background.init(window.innerWidth, window.innerHeight);

    const localEntity = spawnShip(this.world, 'fighter', 5000, 5000, true, 'local');
    useGameStore.getState().setLocalPlayer(localEntity, 'local');

    spawnShip(this.world, 'frigate', 5300, 4800, false, 'enemy1');
    spawnShip(this.world, 'destroyer', 4700, 5200, false, 'enemy2');

    this.loop.start();
    useGameStore.getState().setPhase('playing');

    this.subscribeEvents();
  }

  private setupSystems(): void {
    this.scheduler.registerGroup('simulation',
      InputSystem,
      MovementSystem,
      CombatSystem,
      ShieldRechargeSystem,
    );
  }

  private setupRenderers(uiLayer: HTMLElement): void {
    this.background = new BackgroundRenderer(this.pipeline);
    this.sectorGrid = new SectorGrid(2000, 10, 10);
    this.chunkManager = new ChunkManager({
      grid: this.sectorGrid,
      loadRadius: 2,
      onChunkLoad: async () => {},
      onChunkUnload: () => {},
    });
    this.shipRenderer = new ShipRenderer(this.pipeline);
    this.effectsManager = new EffectsManager(this.pipeline);
    this.projectilePool = new ProjectilePool(128);

    this.pipeline.layers.get(RenderLayer.PROJECTILES).addChild(this.projectilePool.container);

    this.hud = new HUD(uiLayer);
    this.minimap = new Minimap();
    this.pipeline.layers.get(RenderLayer.UI_WORLD).addChild(this.minimap.container);
    this.minimap.positionBottomRight(window.innerWidth, window.innerHeight);
  }

  private setupGameLoop(): void {
    this.loop = new GameLoop({
      simulationTickRate: 60,
      world: this.world,
      scheduler: this.scheduler,
      onRenderTick: this.renderTick,
    });
  }

  private renderTick = (alpha: number, world: World): void => {
    const dt = 1 / 60;

    const localEntity = useGameStore.getState().localPlayerEntity;

    let camX = 5000;
    let camY = 5000;

    if (world.isAlive(localEntity)) {
      const transform = world.getComponent(localEntity, TransformComponent);
      const velocity = world.getComponent(localEntity, VelocityComponent);
      const stats = world.getComponent(localEntity, ShipStatsComponent);

      if (transform) {
        camX = transform.x;
        camY = transform.y;
        this.pipeline.lerpCamera({ x: camX, y: camY, zoom: 1 }, 0.08);
      }

      if (velocity && stats) {
        const speed = Math.sqrt(velocity.vx ** 2 + velocity.vy ** 2);
        this.hud.updateShipStats(stats.hull, stats.maxHull, stats.shield, stats.maxShield);
        this.hud.updateSpeed(speed);
      }
    }

    this.background.update(camX, camY, dt);
    this.chunkManager.update(camX, camY);
    this.shipRenderer.syncWithWorld(world, alpha, dt);
    this.effectsManager.update(dt);
    this.projectilePool.update(dt);

    useUIStore.getState().setCamera(camX, camY);

    this.hud.updateFPS(Math.round(this.pipeline.ticker.FPS));

    const screen = this.pipeline.screen;
    this.minimap.update(world, camX, camY);
    this.minimap.positionBottomRight(screen.width, screen.height);
  };

  private setupResizeHandler(canvas: HTMLCanvasElement): void {
    this.resizeObserver = new ResizeObserver(() => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.pipeline.resize(w, h);
      useUIStore.getState().setScreenSize(w, h);
    });
    this.resizeObserver.observe(canvas.parentElement ?? document.body);
  }

  private subscribeEvents(): void {
    globalBus.on(NetworkEvent.COMBAT_DEATH, (data: unknown) => {
      const { entity } = data as { entity: ReturnType<typeof createEntityId> };
      const localEntity = useGameStore.getState().localPlayerEntity;

      if (entity === localEntity) {
        useGameStore.getState().setPhase('dead');
        this.hud.flashDamage();
      }

      const transform = this.world.getComponent(entity, TransformComponent);
      if (transform) {
        this.effectsManager.spawnExplosion(transform.x, transform.y, 1.5);
      }
    });

    globalBus.on(NetworkEvent.COMBAT_HIT, (data: unknown) => {
      const { targetEntity } = data as { targetEntity: ReturnType<typeof createEntityId> };
      const localEntity = useGameStore.getState().localPlayerEntity;
      if (targetEntity === localEntity) {
        this.hud.flashDamage();
      }
    });
  }

  destroy(): void {
    this.loop.stop();
    this.cleanupInput?.();
    this.resizeObserver.disconnect();
    this.effectsManager.destroy();
    this.shipRenderer.destroy();
    this.hud.destroy();
    this.pipeline.destroy();
    globalBus.clear();
  }
}

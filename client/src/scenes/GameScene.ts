import { Scene } from '../core/scene/Scene.ts';
import type { World } from '../core/ecs/World.ts';
import type { RenderPipeline } from '../core/renderer/RenderPipeline.ts';
import { RenderLayer } from '../core/renderer/LayerManager.ts';
import { engine } from '../Engine.ts';
import { BackgroundRenderer } from '../features/space/BackgroundRenderer.ts';
import { SectorGrid } from '../features/space/SectorGrid.ts';
import { ChunkManager } from '../features/space/ChunkManager.ts';
import { ShipRenderer } from '../features/ships/ShipRenderer.ts';
import { EffectsManager } from '../features/fx/EffectsManager.ts';
import { ProjectilePool } from '../features/combat/ProjectilePool.ts';
import { HUD } from '../features/ui/HUD.ts';
import { Minimap } from '../features/ui/Minimap.ts';
import { spawnShip } from '../features/ships/ShipFactory.ts';
import {
  TransformComponent,
  VelocityComponent,
  ShipStatsComponent,
} from '../features/ships/ShipComponents.ts';
import { useGameStore } from '../store/gameStore.ts';
import { useUIStore } from '../store/uiStore.ts';
import { globalBus, NetworkEvent } from '../core/network/MessageBus.ts';
import type { EntityId } from '../core/ecs/types.ts';

export class GameScene extends Scene {
  readonly name = 'GameScene';

  private background!: BackgroundRenderer;
  private sectorGrid!: SectorGrid;
  private chunkManager!: ChunkManager;
  private shipRenderer!: ShipRenderer;
  private effectsManager!: EffectsManager;
  private projectilePool!: ProjectilePool;
  private hud!: HUD;
  private minimap!: Minimap;

  async onEnter(_from: Scene | null): Promise<void> {
    const { pipeline, world } = engine;

    this.background = new BackgroundRenderer(pipeline);
    this.sectorGrid = new SectorGrid(2000, 10, 10);
    this.chunkManager = new ChunkManager({
      grid: this.sectorGrid,
      loadRadius: 2,
      onChunkLoad: async () => {},
      onChunkUnload: () => {},
    });

    this.shipRenderer = new ShipRenderer(pipeline);
    this.effectsManager = new EffectsManager(pipeline);
    this.projectilePool = new ProjectilePool(128);
    pipeline.layers.get(RenderLayer.PROJECTILES).addChild(this.projectilePool.container);

    const uiLayer = document.getElementById('ui-layer') as HTMLElement;
    this.hud = new HUD(uiLayer);
    this.minimap = new Minimap();
    pipeline.layers.get(RenderLayer.UI_WORLD).addChild(this.minimap.container);
    this.minimap.positionBottomRight(window.innerWidth, window.innerHeight);

    this.background.init(window.innerWidth, window.innerHeight);

    const localEntity = spawnShip(world, 'fighter', 5000, 5000, true, 'local');
    useGameStore.getState().setLocalPlayer(localEntity, 'local');
    spawnShip(world, 'frigate', 5300, 4800, false, 'enemy1');
    spawnShip(world, 'destroyer', 4700, 5200, false, 'enemy2');

    engine.camera.snapTo(5000, 5000);
    useGameStore.getState().setPhase('playing');

    this.subscribeEvents();
  }

  render(alpha: number, world: World, pipeline: RenderPipeline): void {
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
        engine.camera.setTarget(camX, camY);
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
    this.hud.updateFPS(Math.round(pipeline.ticker.FPS));

    const screen = pipeline.screen;
    this.minimap.update(world, camX, camY);
    this.minimap.positionBottomRight(screen.width, screen.height);
  }

  onResize(width: number, height: number): void {
    this.minimap?.positionBottomRight(width, height);
  }

  private subscribeEvents(): void {
    globalBus.on(NetworkEvent.COMBAT_DEATH, (data: unknown) => {
      const { entity } = data as { entity: EntityId };
      const localEntity = useGameStore.getState().localPlayerEntity;

      if (entity === localEntity) {
        useGameStore.getState().setPhase('dead');
        this.hud.flashDamage();
      }

      const transform = engine.world.getComponent(entity, TransformComponent);
      if (transform) {
        this.effectsManager.spawnExplosion(transform.x, transform.y, 1.5);
      }
    });

    globalBus.on(NetworkEvent.COMBAT_HIT, (data: unknown) => {
      const { targetEntity } = data as { targetEntity: EntityId };
      const localEntity = useGameStore.getState().localPlayerEntity;
      if (targetEntity === localEntity) this.hud.flashDamage();
    });
  }

  dispose(): void {
    this.effectsManager?.destroy();
    this.shipRenderer?.destroy();
    this.hud?.destroy();
    globalBus.clear();
  }
}

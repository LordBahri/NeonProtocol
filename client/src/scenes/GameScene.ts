import { Scene } from '../core/scene/Scene.ts';
import type { World } from '../core/ecs/World.ts';
import type { RenderPipeline } from '../core/renderer/RenderPipeline.ts';
import { RenderLayer } from '../core/renderer/LayerManager.ts';
import { engine } from '../Engine.ts';
import { BackgroundRenderer } from '../features/space/BackgroundRenderer.ts';
import { AsteroidField } from '../features/space/AsteroidField.ts';
import { AmbientLife } from '../features/space/AmbientLife.ts';
import { SectorGrid } from '../features/space/SectorGrid.ts';
import { ChunkManager } from '../features/space/ChunkManager.ts';
import { ShipRenderer } from '../features/ships/ShipRenderer.ts';
import { EffectsManager } from '../features/fx/EffectsManager.ts';
import { BeamRenderer } from '../features/fx/BeamRenderer.ts';
import { CinematicExplosion } from '../features/fx/CinematicExplosion.ts';
import { EMPEffect } from '../features/fx/EMPEffect.ts';
import { ProjectilePool } from '../features/combat/ProjectilePool.ts';
import { WeaponSystem } from '../features/combat/WeaponSystem.ts';
import { CombatAI } from '../features/ships/CombatAI.ts';
import { PostProcessPipeline } from '../core/renderer/PostProcessPipeline.ts';
import { HUD } from '../features/ui/HUD.ts';
import { Minimap } from '../features/ui/Minimap.ts';
import { VignetteOverlay } from '../features/fx/VignetteOverlay.ts';
import { GrainOverlay } from '../features/fx/GrainOverlay.ts';
import { ShipLighting } from '../features/ships/ShipLighting.ts';
import { spawnShip, setupCombatShip } from '../features/ships/ShipFactory.ts';
import { lerp } from '../core/simulation/interpolation.ts';
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
  private asteroidField!: AsteroidField;
  private ambientLife!: AmbientLife;
  private vignette!: VignetteOverlay;
  private grain!: GrainOverlay;
  private postProcess!: PostProcessPipeline;
  private sectorGrid!: SectorGrid;
  private chunkManager!: ChunkManager;
  private shipRenderer!: ShipRenderer;
  private effectsManager!: EffectsManager;
  private beamRenderer!: BeamRenderer;
  private cinExplosion!: CinematicExplosion;
  private empEffect!: EMPEffect;
  private projectilePool!: ProjectilePool;
  private hud!: HUD;
  private minimap!: Minimap;

  // Cinematic camera state — computed here, applied via engine.camera.setTarget
  private lookX = 0;
  private lookY = 0;

  async onEnter(_from: Scene | null): Promise<void> {
    const { pipeline, world } = engine;
    const w = window.innerWidth;
    const h = window.innerHeight;

    // Background — starfield/nebula/wisps/dust
    this.background = new BackgroundRenderer(pipeline);
    this.background.init(w, h);

    // Asteroid field: rotation + drift + mineral glows
    this.asteroidField = new AsteroidField(pipeline, 40, 777);

    // Ambient life: distant traffic, beacons, debris
    this.ambientLife = new AmbientLife(pipeline.app);

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

    const getEntityPos = (entity: EntityId) => {
      const tf = engine.world.getComponent(entity, TransformComponent);
      return tf ? { x: tf.x, y: tf.y } : null;
    };
    this.beamRenderer  = new BeamRenderer(pipeline, getEntityPos);
    this.cinExplosion  = new CinematicExplosion(pipeline, this.effectsManager.emitter);
    this.empEffect     = new EMPEffect(pipeline, this.effectsManager.emitter);

    // Post-processing: GPU vignette + subtle spatial distortion
    this.postProcess = new PostProcessPipeline(pipeline.app, {
      vignetteStrength: 0.58,
      distortion: true,
      distortionStrength: 0.002,
      exposure: 1.08,
    });

    const uiLayer = document.getElementById('ui-layer') as HTMLElement;
    this.hud = new HUD(uiLayer);

    this.minimap = new Minimap();
    pipeline.app.stage.addChild(this.minimap.container);
    this.minimap.positionBottomRight(w, h);

    // CSS-canvas vignette on top of postprocess for double depth at edges
    this.vignette = new VignetteOverlay(w, h);
    pipeline.app.stage.addChild(this.vignette.container);

    // SVG feTurbulence film grain overlay
    this.grain = new GrainOverlay();

    const localEntity = spawnShip(world, 'fighter', 0, 0, { isLocalPlayer: true, serverId: 'local' });
    useGameStore.getState().setLocalPlayer(localEntity, 'local');

    const enemy1 = spawnShip(world, 'frigate',   300, -200, { serverId: 'enemy1' });
    setupCombatShip(world, enemy1, 'pulse_laser', 320);

    const enemy2 = spawnShip(world, 'destroyer', -300,  200, { serverId: 'enemy2' });
    setupCombatShip(world, enemy2, 'autocannon', 380);

    const enemy3 = spawnShip(world, 'cruiser', 500, 300, { serverId: 'cruiser1' });
    setupCombatShip(world, enemy3, 'beam_laser', 260);

    useGameStore.getState().setPhase('playing');

    console.log('[GameScene] Entered — 3 ships spawned at world origin');
    this.subscribeEvents();
  }

  render(alpha: number, world: World, pipeline: RenderPipeline): void {
    const dt = 1 / 60;
    const localEntity = useGameStore.getState().localPlayerEntity;
    let camX = 0;
    let camY = 0;

    if (world.isAlive(localEntity)) {
      const transform = world.getComponent(localEntity, TransformComponent);
      const velocity  = world.getComponent(localEntity, VelocityComponent);
      const stats     = world.getComponent(localEntity, ShipStatsComponent);

      if (transform) {
        camX = transform.x;
        camY = transform.y;

        // Cinematic look-ahead: camera leads in the direction of travel
        if (velocity) {
          const targetLookX = velocity.vx * 0.16;
          const targetLookY = velocity.vy * 0.16;
          this.lookX = lerp(this.lookX, targetLookX, 0.055);
          this.lookY = lerp(this.lookY, targetLookY, 0.055);

          // Speed-based zoom-out: feel the velocity
          const speed = Math.sqrt(velocity.vx ** 2 + velocity.vy ** 2);
          const zoomOut = Math.min(speed * 0.000075, 0.28);
          engine.camera.setZoom(1.0 - zoomOut);
        }

        engine.camera.setTarget(camX + this.lookX, camY + this.lookY);
      }

      if (velocity && stats) {
        const speed = Math.sqrt(velocity.vx ** 2 + velocity.vy ** 2);
        this.hud.updateShipStats(stats.hull, stats.maxHull, stats.shield, stats.maxShield);
        this.hud.updateSpeed(speed);
      }
    }

    // ── Simulation systems (combat, AI) ─────────────────────────────────────
    WeaponSystem.update(world, dt);
    CombatAI.update(world, dt);

    // ── Rendering ────────────────────────────────────────────────────────────
    ShipLighting.update(dt);
    this.background.update(camX, camY, dt);
    this.asteroidField.update(dt);
    this.ambientLife.update(dt);
    this.chunkManager.update(camX, camY);
    this.shipRenderer.syncWithWorld(world, alpha, dt);
    this.beamRenderer.update(dt);
    this.effectsManager.update(dt);
    this.projectilePool.update(dt);
    this.postProcess.update(dt);

    useUIStore.getState().setCamera(camX, camY);
    this.hud.updateFPS(Math.round(pipeline.ticker.FPS));

    const screen = pipeline.screen;
    this.minimap.update(world, camX, camY);
    this.minimap.positionBottomRight(screen.width, screen.height);
  }

  onResize(width: number, height: number): void {
    this.minimap?.positionBottomRight(width, height);
    this.vignette?.resize(width, height);
    this.postProcess?.onResize();
  }

  private subscribeEvents(): void {
    globalBus.on(NetworkEvent.COMBAT_DEATH, (data: unknown) => {
      const { entity } = data as { entity: EntityId };
      const localEntity = useGameStore.getState().localPlayerEntity;

      if (entity === localEntity) {
        useGameStore.getState().setPhase('dead');
        this.hud.flashDamage();
        // Heavy screen shake on death
        engine.camera.shake(6, 0.8, 18);
      }

      const transform = engine.world.getComponent(entity, TransformComponent);
      if (transform) {
        this.cinExplosion.spawn({ x: transform.x, y: transform.y, scale: 1.5 });
      }
    });

    globalBus.on(NetworkEvent.COMBAT_HIT, (data: unknown) => {
      const { targetEntity } = data as { targetEntity: EntityId };
      const localEntity = useGameStore.getState().localPlayerEntity;
      if (targetEntity === localEntity) {
        this.hud.flashDamage();
        // Light screen shake on hit
        engine.camera.shake(2.5, 0.35, 22);
      }
    });
  }

  dispose(): void {
    this.beamRenderer?.destroy();
    this.cinExplosion?.destroy();
    this.empEffect?.destroy();
    this.projectilePool?.destroy();
    this.effectsManager?.destroy();
    this.shipRenderer?.destroy();
    this.asteroidField?.destroy();
    this.ambientLife?.destroy();
    this.background?.destroy();
    this.postProcess?.destroy();
    this.vignette?.destroy();
    this.hud?.destroy();
    this.grain?.destroy();
    this.minimap?.container.destroy({ children: true });
    globalBus.clear();
  }
}

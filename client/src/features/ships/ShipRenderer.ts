import { Container, Graphics } from 'pixi.js';
import type { World } from '../../core/ecs/World.ts';
import { createEntityId } from '../../core/ecs/types.ts';
import type { EntityId } from '../../core/ecs/types.ts';
import type { RenderPipeline } from '../../core/renderer/RenderPipeline.ts';
import { RenderLayer } from '../../core/renderer/LayerManager.ts';
import { lerp, lerpAngle } from '../../core/simulation/interpolation.ts';
import {
  TransformComponent,
  VisualComponent,
  ShipStatsComponent,
  VelocityComponent,
  PlayerInputComponent,
} from './ShipComponents.ts';
import {
  HeatComponent,
  FuelComponent,
  ArmorComponent,
  WarpDriveComponent,
  DestructionComponent,
} from './ShipSystemComponents.ts';
import type { HeatData, FuelData, ArmorData } from './ShipSystemComponents.ts';
import { ThrusterFX } from './ThrusterFX.ts';
import { HULL_DEFINITIONS } from './ShipDefinitions.ts';
import type { ParticleEmitter } from '../fx/ParticleEmitter.ts';
import { globalBus, ShipEvent } from '../../core/network/MessageBus.ts';
import type { ShipLifecycleEvent } from '../../core/network/MessageBus.ts';

interface ShipDisplayObject {
  container: Container;
  body: Graphics;
  engineGlow: Graphics;
  shieldRing: Graphics;
  healthBar: Graphics;
  warpRing: Graphics;
}

type ExplosionCallback = (x: number, y: number, scale: number) => void;

export class ShipRenderer {
  private displayObjects = new Map<EntityId, ShipDisplayObject>();
  private readonly shipsLayer: Container;
  private time = 0;
  private thrusterFX: ThrusterFX;
  private onExplode: ExplosionCallback | null = null;
  private unsubs: Array<() => void> = [];

  constructor(pipeline: RenderPipeline, emitter: ParticleEmitter) {
    this.shipsLayer = pipeline.layers.get(RenderLayer.SHIPS);
    this.thrusterFX = new ThrusterFX(emitter);

    const unsubExplode = globalBus.on<ShipLifecycleEvent>(ShipEvent.SHIP_EXPLODING, (evt) => {
      if (this.onExplode) this.onExplode(evt.x, evt.y, 1.5);
    });
    this.unsubs.push(unsubExplode);
  }

  /** Register a callback to spawn an ExplosionEffect at world position. */
  setExplosionCallback(cb: ExplosionCallback): void {
    this.onExplode = cb;
  }

  syncWithWorld(world: World, alpha: number, dt: number): void {
    this.time += dt;
    const entities  = world.query(TransformComponent, VisualComponent);
    const activeSet = new Set<EntityId>();

    for (let i = 0; i < entities.length; i++) {
      const entity     = createEntityId(entities[i]!);
      activeSet.add(entity);

      const transform   = world.getComponent(entity, TransformComponent)!;
      const visual      = world.getComponent(entity, VisualComponent)!;
      const stats       = world.getComponent(entity, ShipStatsComponent);
      const velocity    = world.getComponent(entity, VelocityComponent);
      const input       = world.getComponent(entity, PlayerInputComponent);
      const heat        = world.getComponent(entity, HeatComponent);
      const fuel        = world.getComponent(entity, FuelComponent);
      const armor       = world.getComponent(entity, ArmorComponent);
      const warpDrive   = world.getComponent(entity, WarpDriveComponent);
      const destruction = world.getComponent(entity, DestructionComponent);

      let dobj = this.displayObjects.get(entity);
      if (!dobj) {
        dobj = this.createDisplayObject(visual.spriteKey, entity);
        this.displayObjects.set(entity, dobj);
        this.shipsLayer.addChild(dobj.container);
      }

      const rx = lerp(transform.prevX, transform.x, alpha);
      const ry = lerp(transform.prevY, transform.y, alpha);
      const ra = lerpAngle(transform.prevAngle, transform.angle, alpha);

      dobj.container.x        = rx;
      dobj.container.y        = ry;
      dobj.container.rotation = ra;
      dobj.container.scale.set(visual.scale);

      // Wreck / debris: fade via shieldGlowAlpha repurposed as alpha signal
      const isWreck = visual.spriteKey === 'wreck' || visual.spriteKey === 'debris';
      if (isWreck) {
        dobj.container.alpha = visual.shieldGlowAlpha;
        continue;
      }

      // Engine glow from speed
      if (velocity) {
        const speed = Math.sqrt(velocity.vx ** 2 + velocity.vy ** 2);
        visual.engineGlowIntensity = lerp(visual.engineGlowIntensity, Math.min(speed / 400, 1), 0.15);
      }
      const enginePulse = 0.7 + 0.3 * Math.sin(this.time * 8 + (entity as number));
      dobj.engineGlow.alpha = visual.engineGlowIntensity * enginePulse;
      dobj.engineGlow.tint  = (heat?.isOverheated) ? 0xff4400 : 0xffffff;

      // Shield + stats
      if (stats) {
        const shieldFrac = stats.shield / stats.maxShield;
        visual.shieldGlowAlpha = lerp(visual.shieldGlowAlpha, shieldFrac < 1 ? shieldFrac * 0.4 : 0, 0.05);
        dobj.shieldRing.alpha  = visual.shieldGlowAlpha;

        if (visual.damageFlashTimer > 0) {
          visual.damageFlashTimer -= dt;
          dobj.body.tint = 0xff4444;
        } else {
          dobj.body.tint = 0xffffff;
        }

        this.updateStatusBars(dobj.healthBar, stats.hull / stats.maxHull, stats.shield / stats.maxShield, heat, fuel, armor);
      }

      // Warp charge ring
      if (warpDrive?.state === 'charging') {
        this.updateWarpRing(dobj.warpRing, warpDrive.chargeTimer / warpDrive.chargeRequired);
        dobj.warpRing.visible = true;
      } else {
        dobj.warpRing.visible = false;
      }

      // Breached flicker
      dobj.body.alpha = (destruction?.state === 'breached')
        ? 0.6 + 0.4 * Math.sin(this.time * 20)
        : 1;

      // Thruster particles
      const hullKey = visual.spriteKey.replace('ship_', '');
      const hullDef = HULL_DEFINITIONS[hullKey] ?? HULL_DEFINITIONS['fighter']!;
      this.thrusterFX.update(
        entity,
        hullDef.thrusters,
        {
          ...(heat  ? { heat }  : {}),
          ...(fuel  ? { fuel }  : {}),
          ...(input ? { input } : {}),
          thrustForward: input?.thrustForward ?? false,
          thrustBack:    input?.thrustBack    ?? false,
          rotateLeft:    input?.rotateLeft    ?? false,
          rotateRight:   input?.rotateRight   ?? false,
          boost:         input?.boost         ?? false,
        },
        rx, ry, ra, visual.scale, dt,
      );
    }

    for (const [entity, dobj] of this.displayObjects) {
      if (!activeSet.has(entity)) {
        this.thrusterFX.unregister(entity, dobj.container);
        this.shipsLayer.removeChild(dobj.container);
        dobj.container.destroy({ children: true });
        this.displayObjects.delete(entity);
      }
    }
  }

  private createDisplayObject(spriteKey: string, entity: EntityId): ShipDisplayObject {
    const container = new Container();

    const body = new Graphics();
    body.moveTo(0, -20);
    body.lineTo(12, 12);
    body.lineTo(0, 6);
    body.lineTo(-12, 12);
    body.closePath();
    body.fill(0x00ccff);
    body.stroke({ color: 0x0088ff, width: 1 });

    const engineGlow = new Graphics();
    engineGlow.circle(0, 10, 8);
    engineGlow.fill({ color: 0x00ffaa, alpha: 0.8 });
    engineGlow.circle(0, 10, 14);
    engineGlow.fill({ color: 0x00aaff, alpha: 0.3 });
    engineGlow.alpha = 0;

    const shieldRing = new Graphics();
    shieldRing.circle(0, 0, 24);
    shieldRing.stroke({ color: 0x00ffff, width: 2, alpha: 0.8 });
    shieldRing.alpha = 0;

    const healthBar = new Graphics();
    healthBar.y = 34;

    const warpRing = new Graphics();
    warpRing.visible = false;

    container.addChild(engineGlow);
    container.addChild(body);
    container.addChild(shieldRing);
    container.addChild(warpRing);
    container.addChild(healthBar);

    const hullKey = spriteKey.replace('ship_', '');
    const hullDef = HULL_DEFINITIONS[hullKey] ?? HULL_DEFINITIONS['fighter']!;
    this.thrusterFX.register(entity, hullDef.thrusters, container);

    return { container, body, engineGlow, shieldRing, healthBar, warpRing };
  }

  private updateStatusBars(
    g: Graphics,
    hullFrac: number,
    shieldFrac: number,
    heat: HeatData | undefined,
    fuel: FuelData | undefined,
    _armor: ArmorData | undefined,
  ): void {
    g.clear();
    const w = 32, h = 3, gap = 1;
    let row = 0;

    const drawBar = (frac: number, bg: number, fill: number): void => {
      const y = row * (h + gap);
      g.rect(-w / 2, y, w, h);
      g.fill(bg);
      g.rect(-w / 2, y, w * Math.max(0, frac), h);
      g.fill(fill);
      row++;
    };

    const hullColor = hullFrac > 0.5 ? 0x00ff44 : hullFrac > 0.25 ? 0xffaa00 : 0xff2200;
    drawBar(hullFrac,   0x111111, hullColor);
    drawBar(shieldFrac, 0x111111, 0x00ccff);

    if (heat) {
      const heatFrac  = heat.heat / heat.maxHeat;
      const heatColor = heat.isOverheated ? 0xff2200 : heatFrac > 0.7 ? 0xff8800 : 0xffaa44;
      drawBar(heatFrac, 0x111111, heatColor);
    }

    if (fuel) {
      drawBar(fuel.fuel / fuel.maxFuel, 0x111111, 0xddcc00);
    }
  }

  private updateWarpRing(g: Graphics, chargeFrac: number): void {
    g.clear();
    const r = 28 + chargeFrac * 6;
    const segments = 12;
    for (let s = 0; s < Math.round(segments * chargeFrac); s++) {
      const a0 = (s / segments) * Math.PI * 2 - Math.PI / 2;
      const a1 = ((s + 0.65) / segments) * Math.PI * 2 - Math.PI / 2;
      g.arc(0, 0, r, a0, a1);
    }
    g.stroke({ color: 0xaa44ff, width: 2, alpha: 0.6 + 0.4 * chargeFrac });
    g.blendMode = 'add';
  }

  destroy(): void {
    for (const unsub of this.unsubs) unsub();
    this.thrusterFX.destroy();
    for (const dobj of this.displayObjects.values()) {
      dobj.container.destroy({ children: true });
    }
    this.displayObjects.clear();
  }
}

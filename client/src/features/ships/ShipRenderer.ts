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
} from './ShipComponents.ts';

interface ShipDisplayObject {
  container: Container;
  body: Graphics;
  engineGlow: Graphics;
  shieldRing: Graphics;
  healthBar: Graphics;
}

export class ShipRenderer {
  private displayObjects = new Map<EntityId, ShipDisplayObject>();
  private readonly shipsLayer: Container;
  private time = 0;

  constructor(pipeline: RenderPipeline) {
    this.shipsLayer = pipeline.layers.get(RenderLayer.SHIPS);
  }

  syncWithWorld(world: World, alpha: number, dt: number): void {
    this.time += dt;
    const entities = world.query(TransformComponent, VisualComponent);
    const activeSet = new Set<EntityId>();

    for (let i = 0; i < entities.length; i++) {
      const entity = createEntityId(entities[i]!);
      activeSet.add(entity);

      const transform = world.getComponent(entity, TransformComponent)!;
      const visual = world.getComponent(entity, VisualComponent)!;
      const stats = world.getComponent(entity, ShipStatsComponent);
      const velocity = world.getComponent(entity, VelocityComponent);

      let dobj = this.displayObjects.get(entity);
      if (!dobj) {
        dobj = this.createDisplayObject(visual.spriteKey);
        this.displayObjects.set(entity, dobj);
        this.shipsLayer.addChild(dobj.container);
      }

      const rx = lerp(transform.prevX, transform.x, alpha);
      const ry = lerp(transform.prevY, transform.y, alpha);
      const ra = lerpAngle(transform.prevAngle, transform.angle, alpha);

      dobj.container.x = rx;
      dobj.container.y = ry;
      dobj.container.rotation = ra;
      dobj.container.scale.set(visual.scale);

      if (velocity) {
        const speed = Math.sqrt(velocity.vx ** 2 + velocity.vy ** 2);
        const maxSpeed = 500;
        visual.engineGlowIntensity = lerp(visual.engineGlowIntensity, Math.min(speed / maxSpeed, 1), 0.15);
      }

      const enginePulse = 0.7 + 0.3 * Math.sin(this.time * 8 + entity);
      dobj.engineGlow.alpha = visual.engineGlowIntensity * enginePulse;

      if (stats) {
        const shieldFrac = stats.shield / stats.maxShield;
        visual.shieldGlowAlpha = lerp(visual.shieldGlowAlpha, shieldFrac < 1 ? shieldFrac * 0.4 : 0, 0.05);
        dobj.shieldRing.alpha = visual.shieldGlowAlpha;

        if (visual.damageFlashTimer > 0) {
          visual.damageFlashTimer -= dt;
          dobj.body.tint = 0xff4444;
        } else {
          dobj.body.tint = 0xffffff;
        }

        this.updateHealthBar(dobj.healthBar, stats.hull / stats.maxHull, stats.shield / stats.maxShield);
      }
    }

    for (const [entity, dobj] of this.displayObjects) {
      if (!activeSet.has(entity)) {
        this.shipsLayer.removeChild(dobj.container);
        dobj.container.destroy({ children: true });
        this.displayObjects.delete(entity);
      }
    }
  }

  private createDisplayObject(_spriteKey: string): ShipDisplayObject {
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
    healthBar.y = 28;

    container.addChild(engineGlow);
    container.addChild(body);
    container.addChild(shieldRing);
    container.addChild(healthBar);

    return { container, body, engineGlow, shieldRing, healthBar };
  }

  private updateHealthBar(g: Graphics, hullFrac: number, shieldFrac: number): void {
    g.clear();
    const w = 28;
    const h = 3;

    g.rect(-w / 2, 0, w, h);
    g.fill(0x111111);

    g.rect(-w / 2, 0, w * hullFrac, h);
    const hullColor = hullFrac > 0.5 ? 0x00ff44 : hullFrac > 0.25 ? 0xffaa00 : 0xff2200;
    g.fill(hullColor);

    g.rect(-w / 2, h + 1, w, h - 1);
    g.fill(0x111111);

    g.rect(-w / 2, h + 1, w * shieldFrac, h - 1);
    g.fill(0x00ccff);
  }

  destroy(): void {
    for (const dobj of this.displayObjects.values()) {
      dobj.container.destroy({ children: true });
    }
    this.displayObjects.clear();
  }
}

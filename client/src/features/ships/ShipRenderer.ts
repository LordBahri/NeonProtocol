import { Container, Graphics } from 'pixi.js';
import type { World } from '../../core/ecs/World.ts';
import { createEntityId } from '../../core/ecs/types.ts';
import type { EntityId } from '../../core/ecs/types.ts';
import type { RenderPipeline } from '../../core/renderer/RenderPipeline.ts';
import { RenderLayer } from '../../core/renderer/LayerManager.ts';
import { lerp, lerpAngle } from '../../core/simulation/interpolation.ts';
import { NeonTrail } from '../fx/NeonTrail.ts';
import {
  TransformComponent,
  VisualComponent,
  ShipStatsComponent,
  VelocityComponent,
  NetworkSyncComponent,
} from './ShipComponents.ts';

// Polygon vertex lists (x,y pairs, origin at ship center, nose points up = -y)
const HULLS: Record<string, { pts: number[]; size: number; exhaustY: number }> = {
  fighter: {
    pts: [0, -22, 9, -6, 15, 9, 6, 15, 0, 11, -6, 15, -15, 9, -9, -6],
    size: 22,
    exhaustY: 13,
  },
  frigate: {
    pts: [0, -30, 10, -14, 18, 2, 15, 16, 7, 22, 0, 18, -7, 22, -15, 16, -18, 2, -10, -14],
    size: 30,
    exhaustY: 18,
  },
  destroyer: {
    pts: [0, -38, 12, -22, 22, -6, 22, 10, 14, 24, 0, 28, -14, 24, -22, 10, -22, -6, -12, -22],
    size: 38,
    exhaustY: 24,
  },
};

interface ShipDO {
  container:  Container;
  outerGlow:  Graphics;
  midGlow:    Graphics;
  body:       Graphics;
  engCone:    Graphics;
  engCore:    Graphics;
  shieldRing: Graphics;
  healthBar:  Graphics;
  trail:      NeonTrail;
  hullSize:   number;
}

function polyPath(g: Graphics, pts: number[]): void {
  g.moveTo(pts[0]!, pts[1]!);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i]!, pts[i + 1]!);
  g.closePath();
}

export class ShipRenderer {
  private displayObjects = new Map<EntityId, ShipDO>();
  private readonly shipsLayer: Container;
  private readonly trailLayer: Container;
  private time = 0;

  constructor(pipeline: RenderPipeline) {
    this.shipsLayer = pipeline.layers.get(RenderLayer.SHIPS);
    this.trailLayer = pipeline.layers.get(RenderLayer.FX_UNDER);
  }

  syncWithWorld(world: World, alpha: number, dt: number): void {
    this.time += dt;
    const entities = world.query(TransformComponent, VisualComponent);
    const activeSet = new Set<EntityId>();

    for (let i = 0; i < entities.length; i++) {
      const entity = createEntityId(entities[i]!);
      activeSet.add(entity);

      const transform = world.getComponent(entity, TransformComponent)!;
      const visual    = world.getComponent(entity, VisualComponent)!;
      const stats     = world.getComponent(entity, ShipStatsComponent);
      const velocity  = world.getComponent(entity, VelocityComponent);
      const netSync   = world.getComponent(entity, NetworkSyncComponent);

      const isLocal = netSync?.isLocalPlayer ?? false;

      let dobj = this.displayObjects.get(entity);
      if (!dobj) {
        dobj = this.buildShip(visual.spriteKey, isLocal);
        this.displayObjects.set(entity, dobj);
        this.shipsLayer.addChild(dobj.container);
        this.trailLayer.addChild(dobj.trail.container);
      }

      const rx = lerp(transform.prevX, transform.x, alpha);
      const ry = lerp(transform.prevY, transform.y, alpha);
      const ra = lerpAngle(transform.prevAngle, transform.angle, alpha);

      dobj.container.x = rx;
      dobj.container.y = ry;
      dobj.container.rotation = ra;
      dobj.container.scale.set(visual.scale);

      // Trail follows world position
      dobj.trail.addPoint(rx, ry);
      dobj.trail.update(dt);

      // Engine intensity
      if (velocity) {
        const speed = Math.sqrt(velocity.vx ** 2 + velocity.vy ** 2);
        visual.engineGlowIntensity = lerp(visual.engineGlowIntensity, Math.min(speed / 400, 1), 0.12);
      }

      const ePulse = 0.72 + 0.28 * Math.sin(this.time * 11 + entity);
      dobj.engCone.alpha = visual.engineGlowIntensity * ePulse * 0.85;
      dobj.engCore.alpha = visual.engineGlowIntensity * ePulse;

      // Slow atmospheric glow breathe
      const breathe = 0.55 + 0.45 * Math.sin(this.time * 1.8 + entity * 0.7);
      dobj.outerGlow.alpha = 0.18 + 0.10 * breathe;
      dobj.midGlow.alpha   = 0.28 + 0.14 * breathe;

      // Damage flash
      if (visual.damageFlashTimer > 0) {
        visual.damageFlashTimer -= dt;
        dobj.body.tint = 0xff6655;
      } else {
        dobj.body.tint = 0xffffff;
      }

      // Shield and health bar
      if (stats) {
        const shieldFrac = stats.shield / stats.maxShield;
        const targetA = shieldFrac < 0.99 ? shieldFrac * 0.55 + 0.08 : 0;
        visual.shieldGlowAlpha = lerp(visual.shieldGlowAlpha, targetA, 0.06);
        const sPulse = 0.7 + 0.3 * Math.sin(this.time * 4.5 + entity);
        dobj.shieldRing.alpha = visual.shieldGlowAlpha * sPulse;

        this.updateHealthBar(dobj.healthBar, stats.hull / stats.maxHull, shieldFrac, dobj.hullSize);
      }
    }

    // Cull removed entities
    for (const [entity, dobj] of this.displayObjects) {
      if (!activeSet.has(entity)) {
        this.shipsLayer.removeChild(dobj.container);
        this.trailLayer.removeChild(dobj.trail.container);
        dobj.container.destroy({ children: true });
        dobj.trail.container.destroy({ children: true });
        this.displayObjects.delete(entity);
      }
    }
  }

  private buildShip(spriteKey: string, isLocal: boolean): ShipDO {
    const shipClass = spriteKey.replace('ship_', '');
    const hull = HULLS[shipClass] ?? HULLS['fighter']!;
    const { pts, size, exhaustY } = hull;

    const glowColor = isLocal ? 0x00eeff : 0xff4400;
    const bodyColor = isLocal ? 0x0d2a40 : 0x3a0d0d;
    const rimColor  = isLocal ? 0x00ccff : 0xff6600;
    const cockpitColor = isLocal ? 0x88ddff : 0xffaa66;

    const container = new Container();

    // Layer 1: outer atmospheric glow (additive, ~2x size)
    const scaledOuter = pts.map(v => v * 2.0);
    const outerGlow = new Graphics();
    polyPath(outerGlow, scaledOuter);
    outerGlow.fill({ color: glowColor, alpha: 0.22 });
    outerGlow.blendMode = 'add';
    container.addChild(outerGlow);

    // Layer 2: mid glow (additive, ~1.4x size)
    const scaledMid = pts.map(v => v * 1.42);
    const midGlow = new Graphics();
    polyPath(midGlow, scaledMid);
    midGlow.fill({ color: glowColor, alpha: 0.38 });
    midGlow.blendMode = 'add';
    container.addChild(midGlow);

    // Engine cone — drawn below hull body so hull overlaps it
    const engCone = new Graphics();
    const coneW = size * 0.30;
    const coneLen = size * 0.60;
    engCone.moveTo(-coneW, exhaustY);
    engCone.lineTo( coneW, exhaustY);
    engCone.lineTo( coneW * 0.28, exhaustY + coneLen);
    engCone.lineTo(-coneW * 0.28, exhaustY + coneLen);
    engCone.closePath();
    engCone.fill({ color: glowColor, alpha: 0.55 });
    engCone.blendMode = 'add';
    engCone.alpha = 0;
    container.addChild(engCone);

    // Layer 3: hull body
    const body = new Graphics();
    polyPath(body, pts);
    body.fill({ color: bodyColor });
    polyPath(body, pts);
    body.stroke({ color: rimColor, width: 1.4, alpha: 0.92 });

    // Cockpit: small ellipse near nose
    const cockpitR = size * 0.13;
    body.ellipse(0, -size * 0.38, cockpitR * 1.1, cockpitR);
    body.fill({ color: cockpitColor, alpha: 0.75 });

    // Panel line hints on larger ships
    if (size >= 30) {
      const mid = size * 0.25;
      body.moveTo(-size * 0.35, mid);
      body.lineTo( size * 0.35, mid);
      body.stroke({ color: rimColor, width: 0.6, alpha: 0.25 });
    }
    container.addChild(body);

    // Engine core (bright hot spot)
    const engCore = new Graphics();
    engCore.circle(0, exhaustY, size * 0.10);
    engCore.fill({ color: 0xffffff, alpha: 0.95 });
    engCore.circle(0, exhaustY, size * 0.20);
    engCore.fill({ color: glowColor, alpha: 0.60 });
    engCore.blendMode = 'add';
    engCore.alpha = 0;
    container.addChild(engCore);

    // Shield ring (two rings for thickness illusion)
    const shieldRing = new Graphics();
    shieldRing.circle(0, 0, size * 1.20);
    shieldRing.stroke({ color: 0x44ddff, width: 1.8, alpha: 0.85 });
    shieldRing.circle(0, 0, size * 1.32);
    shieldRing.stroke({ color: 0x0088aa, width: 0.7, alpha: 0.35 });
    shieldRing.alpha = 0;
    container.addChild(shieldRing);

    // Health bar below ship
    const healthBar = new Graphics();
    healthBar.y = size + 9;
    container.addChild(healthBar);

    const trail = new NeonTrail({
      maxPoints: 28,
      trailLifetime: 0.6,
      color: glowColor,
      maxWidth: isLocal ? 4.5 : 3,
      minWidth: 0.3,
      additive: true,
    });

    return { container, outerGlow, midGlow, body, engCone, engCore, shieldRing, healthBar, trail, hullSize: size };
  }

  private updateHealthBar(g: Graphics, hullFrac: number, shieldFrac: number, size: number): void {
    g.clear();
    const w = size * 2.1;
    const h = 3;

    g.rect(-w / 2, 0, w, h);
    g.fill({ color: 0x060a10, alpha: 0.85 });

    const hullColor = hullFrac > 0.5 ? 0x00ff55 : hullFrac > 0.25 ? 0xffaa00 : 0xff2200;
    g.rect(-w / 2, 0, w * hullFrac, h);
    g.fill(hullColor);

    g.rect(-w / 2, h + 2, w, h - 1);
    g.fill({ color: 0x060a10, alpha: 0.85 });

    g.rect(-w / 2, h + 2, w * shieldFrac, h - 1);
    g.fill(0x00ccff);
  }

  destroy(): void {
    for (const dobj of this.displayObjects.values()) {
      dobj.container.destroy({ children: true });
      dobj.trail.container.destroy({ children: true });
    }
    this.displayObjects.clear();
  }
}

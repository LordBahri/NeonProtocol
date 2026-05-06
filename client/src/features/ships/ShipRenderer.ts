import { Container, Graphics } from 'pixi.js';
import { gsap } from 'gsap';
import type { World } from '../../core/ecs/World.ts';
import { createEntityId } from '../../core/ecs/types.ts';
import type { EntityId } from '../../core/ecs/types.ts';
import type { RenderPipeline } from '../../core/renderer/RenderPipeline.ts';
import { ThrusterFilter } from './ThrusterFilter.ts';
import { RenderLayer } from '../../core/renderer/LayerManager.ts';
import { lerp, lerpAngle } from '../../core/simulation/interpolation.ts';
import { NeonTrail } from '../fx/NeonTrail.ts';
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

// Per-class nozzle positions (local space, y = exhaustY from HULLS)
const NOZZLES: Record<string, Array<{ x: number; y: number }>> = {
  fighter:   [{ x: 0, y: 13 }],
  frigate:   [{ x: -5, y: 18 }, { x: 5, y: 18 }],
  destroyer: [{ x: -8, y: 24 }, { x: 8, y: 24 }],
};

interface ShipDO {
  container:      Container;
  outerGlow:      Graphics;
  midGlow:        Graphics;
  nudge:          Container;        // GSAP-tweened child: body + circuitry idle vibration
  body:           Graphics;
  circuitry:      Graphics;
  engCone:        Graphics;
  exhaustBloom:   Graphics;
  engCore:        Graphics;
  thrusterFilter: ThrusterFilter;   // GPU nozzle flicker + glow — drives engCore brightness
  shieldRing:     Graphics;
  healthBar:      Graphics;
  warpRing:       Graphics;
  trail:          NeonTrail;
  hullSize:       number;
  tweens:         gsap.core.Tween[];
}

type ExplosionCallback = (x: number, y: number, scale: number) => void;

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
  private thrusterFX: ThrusterFX | null = null;
  private onExplode: ExplosionCallback | null = null;
  private unsubs: Array<() => void> = [];

  constructor(pipeline: RenderPipeline, emitter?: ParticleEmitter) {
    this.shipsLayer = pipeline.layers.get(RenderLayer.SHIPS);
    this.trailLayer = pipeline.layers.get(RenderLayer.FX_UNDER);

    if (emitter) {
      this.thrusterFX = new ThrusterFX(emitter);
    }

    const unsubExplode = globalBus.on<ShipLifecycleEvent>(ShipEvent.SHIP_EXPLODING, (evt) => {
      if (this.onExplode) this.onExplode(evt.x, evt.y, 1.5);
    });
    this.unsubs.push(unsubExplode);
  }

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

      const isLocal = input !== undefined;

      let dobj = this.displayObjects.get(entity);
      if (!dobj) {
        dobj = this.buildShip(visual.spriteKey, isLocal);
        this.displayObjects.set(entity, dobj);
        this.shipsLayer.addChild(dobj.container);
        this.trailLayer.addChild(dobj.trail.container);

        if (this.thrusterFX) {
          const hullKey = visual.spriteKey.replace('ship_', '');
          const hullDef = HULL_DEFINITIONS[hullKey] ?? HULL_DEFINITIONS['fighter']!;
          this.thrusterFX.register(entity, hullDef.thrusters, dobj.container);
        }
      }

      const rx = lerp(transform.prevX, transform.x, alpha);
      const ry = lerp(transform.prevY, transform.y, alpha);
      const ra = lerpAngle(transform.prevAngle, transform.angle, alpha);

      dobj.container.x        = rx;
      dobj.container.y        = ry;
      dobj.container.rotation = ra;
      dobj.container.scale.set(visual.scale);

      dobj.trail.addPoint(rx, ry);
      dobj.trail.update(dt);

      const isWreck = visual.spriteKey === 'wreck' || visual.spriteKey === 'debris';
      if (isWreck) {
        dobj.container.alpha = visual.shieldGlowAlpha;
        continue;
      }

      // Engine intensity from speed
      if (velocity) {
        const speed = Math.sqrt(velocity.vx ** 2 + velocity.vy ** 2);
        visual.engineGlowIntensity = lerp(visual.engineGlowIntensity, Math.min(speed / 400, 1), 0.12);
      }
      const fastFlicker = 0.06 * Math.sin(this.time * 47 + (entity as number) * 1.3);
      const ePulse      = 0.72 + 0.28 * Math.sin(this.time * 11 + (entity as number));
      const ePulseF     = ePulse + fastFlicker;

      // engCone + exhaustBloom: JS-driven alpha (no filter)
      dobj.engCone.alpha      = visual.engineGlowIntensity * ePulseF * 0.85;
      dobj.exhaustBloom.alpha = visual.engineGlowIntensity * ePulse  * 0.65;
      // engCore: GPU filter drives its flicker and glow — just pass time + intensity
      dobj.thrusterFilter.time      = this.time;
      dobj.thrusterFilter.intensity = visual.engineGlowIntensity;

      if (heat?.isOverheated) {
        dobj.engCore.tint = 0xff4400;
        dobj.engCone.tint = 0xff4400;
      } else {
        dobj.engCore.tint = 0xffffff;
        dobj.engCone.tint = 0xffffff;
      }

      // Atmospheric glow breathe
      const breathe = 0.55 + 0.45 * Math.sin(this.time * 1.8 + (entity as number) * 0.7);
      dobj.outerGlow.alpha  = 0.18 + 0.10 * breathe;
      const shimmer         = visual.engineGlowIntensity * 0.08 * Math.sin(this.time * 44 + (entity as number));
      dobj.midGlow.alpha    = 0.28 + 0.14 * breathe + shimmer;
      dobj.midGlow.rotation = Math.sin(this.time * 18 + (entity as number)) * 0.025 * visual.engineGlowIntensity;

      // Circuitry emissive pulse — driven by GSAP tween started in buildShip

      // Damage flash
      if (visual.damageFlashTimer > 0) {
        visual.damageFlashTimer -= dt;
        dobj.body.tint = 0xff6655;
      } else {
        dobj.body.tint = 0xffffff;
      }

      // Breached flicker
      dobj.body.alpha = (destruction?.state === 'breached')
        ? 0.6 + 0.4 * Math.sin(this.time * 20)
        : 1;

      // Shield ring
      if (stats) {
        const shieldFrac = stats.shield / stats.maxShield;
        const idleA  = 0.03 + 0.02 * Math.sin(this.time * 2.2 + (entity as number) * 1.3);
        const targetA = shieldFrac < 0.99 ? shieldFrac * 0.55 + 0.08 : idleA;
        visual.shieldGlowAlpha = lerp(visual.shieldGlowAlpha, targetA, 0.06);
        const sPulse = 0.7 + 0.3 * Math.sin(this.time * 4.5 + (entity as number));
        dobj.shieldRing.alpha = visual.shieldGlowAlpha * sPulse;

        this.updateStatusBars(dobj.healthBar, stats.hull / stats.maxHull, shieldFrac, heat, fuel, armor, dobj.hullSize);
      }

      // Warp charge ring
      if (warpDrive?.state === 'charging') {
        this.updateWarpRing(dobj.warpRing, warpDrive.chargeTimer / warpDrive.chargeRequired);
        dobj.warpRing.visible = true;
      } else {
        dobj.warpRing.visible = false;
      }

      // Thruster particles
      if (this.thrusterFX) {
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
    }

    for (const [entity, dobj] of this.displayObjects) {
      if (!activeSet.has(entity)) {
        if (this.thrusterFX) this.thrusterFX.unregister(entity, dobj.container);
        for (const t of dobj.tweens) t.kill();
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
    const { pts, size } = hull;

    const glowColor    = isLocal ? 0x00eeff : 0xff4400;
    const bodyBase     = isLocal ? 0x0c1f32 : 0x261010;
    const bodyLight    = isLocal ? 0x152940 : 0x321515;
    const bodyDark     = isLocal ? 0x07101d : 0x1c0b0b;
    const seamColor    = isLocal ? 0x050c14 : 0x0f0505;
    const rimColor     = isLocal ? 0x00ccff : 0xff6600;
    const circuitColor = isLocal ? 0x00eeff : 0xff6622;
    const cockpitColor = isLocal ? 0x88ddff : 0xffaa66;

    const nozzles = NOZZLES[shipClass] ?? NOZZLES['fighter']!;

    const container = new Container();

    // exhaustBloom: large soft area behind ship, one per nozzle
    const exhaustBloom = new Graphics();
    exhaustBloom.blendMode = 'add';
    for (const n of nozzles) {
      const br = size * 0.65;
      exhaustBloom.circle(n.x, n.y + br * 0.3, br);
      exhaustBloom.fill({ color: glowColor, alpha: 0.12 });
      exhaustBloom.circle(n.x, n.y + br * 0.1, br * 0.45);
      exhaustBloom.fill({ color: glowColor, alpha: 0.20 });
    }
    exhaustBloom.alpha = 0;
    container.addChild(exhaustBloom);

    // Outer atmospheric glow (~2× hull size)
    const outerGlow = new Graphics();
    polyPath(outerGlow, pts.map(v => v * 2.0));
    outerGlow.fill({ color: glowColor, alpha: 0.22 });
    outerGlow.blendMode = 'add';
    container.addChild(outerGlow);

    // Mid glow (~1.42× hull size)
    const midGlow = new Graphics();
    polyPath(midGlow, pts.map(v => v * 1.42));
    midGlow.fill({ color: glowColor, alpha: 0.38 });
    midGlow.blendMode = 'add';
    container.addChild(midGlow);

    // Engine exhaust cones — one per nozzle, narrows to a point below ship
    const engCone = new Graphics();
    engCone.blendMode = 'add';
    for (const n of nozzles) {
      const coneW   = size * 0.17;
      const coneLen = size * 0.55;
      engCone.moveTo(n.x - coneW, n.y);
      engCone.lineTo(n.x + coneW, n.y);
      engCone.lineTo(n.x + coneW * 0.22, n.y + coneLen);
      engCone.lineTo(n.x - coneW * 0.22, n.y + coneLen);
      engCone.closePath();
      engCone.fill({ color: glowColor, alpha: 0.50 });
    }
    engCone.alpha = 0;
    container.addChild(engCone);

    // nudge: child container for GSAP-driven idle vibration.
    // Only body + circuitry live here — nothing that the game loop updates by position.
    const nudge = new Container();
    container.addChild(nudge);

    // Hull body: main fill + per-class panel zones + seams + rim
    const body = this.buildHullBody(shipClass, pts, size, bodyBase, bodyLight, bodyDark, seamColor, rimColor, cockpitColor);
    nudge.addChild(body);

    // Emissive circuitry (additive power conduit traces) — GSAP pulses alpha
    const circuitry = this.buildCircuitry(shipClass, circuitColor);
    nudge.addChild(circuitry);

    // Engine core hot spots — bright nozzle glow, one per nozzle.
    // ThrusterFilter drives all flicker + glow via GPU; alpha stays at 1 always.
    const engCore = new Graphics();
    engCore.blendMode = 'add';
    for (const n of nozzles) {
      engCore.circle(n.x, n.y, size * 0.10);
      engCore.fill({ color: 0xffffff, alpha: 0.95 });
      engCore.circle(n.x, n.y, size * 0.20);
      engCore.fill({ color: glowColor, alpha: 0.60 });
      engCore.circle(n.x, n.y, size * 0.14);
      engCore.stroke({ color: 0xffffff, width: 0.8, alpha: 0.35 });
    }
    const glowVec: [number, number, number] = isLocal ? [0.0, 0.72, 1.0] : [1.0, 0.40, 0.0];
    const thrusterFilter = new ThrusterFilter(glowVec);
    engCore.filters = [thrusterFilter];
    container.addChild(engCore);

    // Shield ring (two rings for depth)
    const shieldRing = new Graphics();
    shieldRing.circle(0, 0, size * 1.20);
    shieldRing.stroke({ color: 0x44ddff, width: 1.8, alpha: 0.85 });
    shieldRing.circle(0, 0, size * 1.32);
    shieldRing.stroke({ color: 0x0088aa, width: 0.7, alpha: 0.35 });
    shieldRing.alpha = 0;
    container.addChild(shieldRing);

    // Warp charge ring
    const warpRing = new Graphics();
    warpRing.visible = false;
    container.addChild(warpRing);

    // Status bars
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

    // GSAP tweens — stored so they can be killed on destroy
    const tweens: gsap.core.Tween[] = [];

    // Idle hull vibration: tiny sub-pixel nudge on body+circuitry container.
    // Different axis timings create a natural micro-tremor rather than a regular pulse.
    tweens.push(
      gsap.to(nudge, { x:  0.35, duration: 0.09, repeat: -1, yoyo: true, ease: 'none' }),
      gsap.to(nudge, { y:  0.28, duration: 0.13, repeat: -1, yoyo: true, ease: 'none', delay: 0.05 }),
    );

    // Circuitry emissive pulse — slow throb between 0.65 and 1.0 opacity.
    tweens.push(
      gsap.to(circuitry, { alpha: 1.0, duration: 0.65, repeat: -1, yoyo: true, ease: 'sine.inOut' }),
    );

    return { container, outerGlow, midGlow, nudge, body, circuitry, engCone, exhaustBloom, engCore, thrusterFilter, shieldRing, healthBar, warpRing, trail, hullSize: size, tweens };
  }

  private buildHullBody(
    shipClass: string,
    pts: number[],
    size: number,
    base: number,
    light: number,
    dark: number,
    seam: number,
    rim: number,
    cockpit: number,
  ): Graphics {
    const g = new Graphics();

    // Base hull fill
    polyPath(g, pts);
    g.fill({ color: base });

    if (shipClass === 'fighter') {
      // Nose panel — lighter
      g.moveTo(0, -22); g.lineTo(9, -6); g.lineTo(-9, -6); g.closePath();
      g.fill({ color: light, alpha: 0.60 });
      // Right wing — darker
      g.moveTo(9, -6); g.lineTo(15, 9); g.lineTo(6, 15); g.lineTo(0, 11); g.closePath();
      g.fill({ color: dark, alpha: 0.55 });
      // Left wing mirror
      g.moveTo(-9, -6); g.lineTo(-15, 9); g.lineTo(-6, 15); g.lineTo(0, 11); g.closePath();
      g.fill({ color: dark, alpha: 0.55 });
      // Panel seams
      g.moveTo(0, -22); g.lineTo(0, 11);
      g.moveTo(0, -2);  g.lineTo(9, -6);
      g.moveTo(0, -2);  g.lineTo(-9, -6);
      g.stroke({ color: seam, width: 0.7, alpha: 0.92 });
      // Scratches
      g.moveTo(5, 2);   g.lineTo(12, 7);
      g.moveTo(-7, -3); g.lineTo(-13, 3);
      g.stroke({ color: 0x000000, width: 0.5, alpha: 0.55 });
      // Armor ridge accent
      g.moveTo(-4, -16); g.lineTo(4, -16);
      g.stroke({ color: rim, width: 0.6, alpha: 0.18 });

    } else if (shipClass === 'frigate') {
      // Nose panel
      g.moveTo(0, -30); g.lineTo(10, -14); g.lineTo(-10, -14); g.closePath();
      g.fill({ color: light, alpha: 0.58 });
      // Right flank
      g.moveTo(10, -14); g.lineTo(18, 2); g.lineTo(15, 16); g.lineTo(7, 22); g.lineTo(0, 18); g.closePath();
      g.fill({ color: dark, alpha: 0.48 });
      // Left flank mirror
      g.moveTo(-10, -14); g.lineTo(-18, 2); g.lineTo(-15, 16); g.lineTo(-7, 22); g.lineTo(0, 18); g.closePath();
      g.fill({ color: dark, alpha: 0.48 });
      // Horizontal seam bands
      g.moveTo(-18, 2); g.lineTo(18, 2);
      g.moveTo(-15, 16); g.lineTo(15, 16);
      g.stroke({ color: seam, width: 0.8, alpha: 0.90 });
      // Centerline + shoulder seams
      g.moveTo(0, -30); g.lineTo(0, 18);
      g.moveTo(0, -8);  g.lineTo(10, -14);
      g.moveTo(0, -8);  g.lineTo(-10, -14);
      g.stroke({ color: seam, width: 0.7, alpha: 0.85 });
      // Scratches
      g.moveTo(8, -5);  g.lineTo(15, 3);
      g.moveTo(-6, 8);  g.lineTo(-14, 13);
      g.moveTo(3, 14);  g.lineTo(9, 20);
      g.stroke({ color: 0x000000, width: 0.5, alpha: 0.50 });
      // Armor ridges
      g.moveTo(-5, -22);  g.lineTo(5, -22);
      g.moveTo(-12, 2);   g.lineTo(12, 2);
      g.stroke({ color: rim, width: 0.6, alpha: 0.15 });

    } else { // destroyer
      // Nose panel
      g.moveTo(0, -38); g.lineTo(12, -22); g.lineTo(-12, -22); g.closePath();
      g.fill({ color: light, alpha: 0.58 });
      // Upper right flank
      g.moveTo(12, -22); g.lineTo(22, -6); g.lineTo(22, 10); g.lineTo(0, 0); g.closePath();
      g.fill({ color: dark, alpha: 0.42 });
      // Upper left flank mirror
      g.moveTo(-12, -22); g.lineTo(-22, -6); g.lineTo(-22, 10); g.lineTo(0, 0); g.closePath();
      g.fill({ color: dark, alpha: 0.42 });
      // Lower engine pods (slightly lighter — heat-worn plating)
      g.moveTo(22, 10); g.lineTo(14, 24); g.lineTo(0, 28); g.lineTo(0, 14); g.closePath();
      g.fill({ color: light, alpha: 0.22 });
      g.moveTo(-22, 10); g.lineTo(-14, 24); g.lineTo(0, 28); g.lineTo(0, 14); g.closePath();
      g.fill({ color: light, alpha: 0.22 });
      // Horizontal seam bands
      g.moveTo(-22, -6); g.lineTo(22, -6);
      g.moveTo(-22, 10); g.lineTo(22, 10);
      g.stroke({ color: seam, width: 0.90, alpha: 0.92 });
      // Centerline + shoulder seams
      g.moveTo(0, -38); g.lineTo(0, 28);
      g.moveTo(0, -16); g.lineTo(12, -22);
      g.moveTo(0, -16); g.lineTo(-12, -22);
      g.moveTo(0, 4);   g.lineTo(22, -6);
      g.moveTo(0, 4);   g.lineTo(-22, -6);
      g.stroke({ color: seam, width: 0.70, alpha: 0.75 });
      // Scratches / micro battle-damage
      g.moveTo(10, -15); g.lineTo(18, -8);
      g.moveTo(-8, 3);   g.lineTo(-18, 9);
      g.moveTo(5, 18);   g.lineTo(12, 23);
      g.moveTo(-12, -10); g.lineTo(-20, -3);
      g.stroke({ color: 0x000000, width: 0.6, alpha: 0.50 });
      // Armor ridges
      g.moveTo(-8, -30);  g.lineTo(8, -30);
      g.moveTo(-15, -6);  g.lineTo(15, -6);
      g.moveTo(-10, 10);  g.lineTo(10, 10);
      g.stroke({ color: rim, width: 0.7, alpha: 0.15 });
    }

    // Rim outline
    polyPath(g, pts);
    g.stroke({ color: rim, width: 1.4, alpha: 0.92 });

    // Cockpit — bright lens with inner highlight ring
    const cockpitY = -size * 0.38;
    const cr       = size * 0.13;
    g.ellipse(0, cockpitY, cr * 1.1, cr);
    g.fill({ color: cockpit, alpha: 0.75 });
    g.ellipse(0, cockpitY, cr * 0.70, cr * 0.60);
    g.fill({ color: cockpit, alpha: 0.40 });
    g.ellipse(0, cockpitY, cr * 1.1, cr);
    g.stroke({ color: cockpit, width: 0.8, alpha: 0.60 });

    return g;
  }

  private buildCircuitry(shipClass: string, color: number): Graphics {
    const g = new Graphics();
    g.blendMode = 'add';

    if (shipClass === 'fighter') {
      // Central spine
      g.moveTo(0, -18); g.lineTo(0, 8);
      g.stroke({ color, width: 0.8, alpha: 0.55 });
      // Side power branches
      g.moveTo(0, -10); g.lineTo(7, -4);
      g.moveTo(0, -10); g.lineTo(-7, -4);
      g.moveTo(0, 0);   g.lineTo(9, 5);
      g.moveTo(0, 0);   g.lineTo(-9, 5);
      g.stroke({ color, width: 0.5, alpha: 0.40 });
      // Junction nodes
      g.circle(0, -10, 1.2);  g.fill({ color, alpha: 0.72 });
      g.circle(0, 0,   1.0);  g.fill({ color, alpha: 0.65 });
      g.circle(7, -4,  0.8);  g.fill({ color, alpha: 0.50 });
      g.circle(-7, -4, 0.8);  g.fill({ color, alpha: 0.50 });

    } else if (shipClass === 'frigate') {
      // Central spine
      g.moveTo(0, -26); g.lineTo(0, 12);
      g.stroke({ color, width: 0.9, alpha: 0.55 });
      // Lateral cross-connect rings
      g.moveTo(-14, -5);  g.lineTo(14, -5);
      g.moveTo(-12, 8);   g.lineTo(12, 8);
      g.stroke({ color, width: 0.5, alpha: 0.32 });
      // Diagonal branches
      g.moveTo(0, -14);  g.lineTo(8, -8);
      g.moveTo(0, -14);  g.lineTo(-8, -8);
      g.moveTo(0, -5);   g.lineTo(12, 2);
      g.moveTo(0, -5);   g.lineTo(-12, 2);
      g.stroke({ color, width: 0.5, alpha: 0.40 });
      // Junction nodes
      g.circle(0, -14,  1.4);  g.fill({ color, alpha: 0.72 });
      g.circle(0, -5,   1.1);  g.fill({ color, alpha: 0.65 });
      g.circle(0,  8,   1.0);  g.fill({ color, alpha: 0.55 });
      g.circle(8, -8,   0.9);  g.fill({ color, alpha: 0.45 });
      g.circle(-8, -8,  0.9);  g.fill({ color, alpha: 0.45 });

    } else { // destroyer — heaviest detail
      // Central spine
      g.moveTo(0, -32); g.lineTo(0, 18);
      g.stroke({ color, width: 1.0, alpha: 0.55 });
      // Lateral cross-bars
      g.moveTo(-18, -6);  g.lineTo(18, -6);
      g.moveTo(-16, 8);   g.lineTo(16, 8);
      g.moveTo(-8, -20);  g.lineTo(8, -20);
      g.stroke({ color, width: 0.5, alpha: 0.30 });
      // Diagonal branches to flanks
      g.moveTo(0, -20);  g.lineTo(10, -14);
      g.moveTo(0, -20);  g.lineTo(-10, -14);
      g.moveTo(0, -6);   g.lineTo(16, -1);
      g.moveTo(0, -6);   g.lineTo(-16, -1);
      g.moveTo(0, 8);    g.lineTo(12, 14);
      g.moveTo(0, 8);    g.lineTo(-12, 14);
      g.stroke({ color, width: 0.5, alpha: 0.40 });
      // Junction nodes
      g.circle(0, -20,  1.6);   g.fill({ color, alpha: 0.72 });
      g.circle(0, -6,   1.3);   g.fill({ color, alpha: 0.65 });
      g.circle(0,  8,   1.1);   g.fill({ color, alpha: 0.60 });
      g.circle(10, -14, 1.0);   g.fill({ color, alpha: 0.50 });
      g.circle(-10, -14, 1.0);  g.fill({ color, alpha: 0.50 });
      g.circle(16, -1,  0.9);   g.fill({ color, alpha: 0.45 });
      g.circle(-16, -1, 0.9);   g.fill({ color, alpha: 0.45 });
    }

    return g;
  }

  private updateStatusBars(
    g: Graphics,
    hullFrac: number,
    shieldFrac: number,
    heat: HeatData | undefined,
    fuel: FuelData | undefined,
    _armor: ArmorData | undefined,
    size: number,
  ): void {
    g.clear();
    const w = size * 2.1;
    const h = 3;
    const gap = 2;
    let row = 0;

    const drawBar = (frac: number, bg: number, fill: number): void => {
      const y = row * (h + gap);
      g.rect(-w / 2, y, w, h);
      g.fill({ color: bg, alpha: 0.85 });
      g.rect(-w / 2, y, w * Math.max(0, frac), h);
      g.fill(fill);
      row++;
    };

    const hullColor = hullFrac > 0.5 ? 0x00ff55 : hullFrac > 0.25 ? 0xffaa00 : 0xff2200;
    drawBar(hullFrac,   0x060a10, hullColor);
    drawBar(shieldFrac, 0x060a10, 0x00aaff);

    if (heat) {
      const heatFrac  = heat.heat / heat.maxHeat;
      const heatColor = heat.isOverheated ? 0xff2200 : heatFrac > 0.7 ? 0xff8800 : 0xffaa44;
      drawBar(heatFrac, 0x060a10, heatColor);
    }

    if (fuel) {
      drawBar(fuel.fuel / fuel.maxFuel, 0x060a10, 0xddcc00);
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
    this.thrusterFX?.destroy();
    for (const dobj of this.displayObjects.values()) {
      for (const t of dobj.tweens) t.kill();
      dobj.container.destroy({ children: true });
      dobj.trail.container.destroy({ children: true });
    }
    this.displayObjects.clear();
  }
}

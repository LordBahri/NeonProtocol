import { Container, Graphics, Sprite } from 'pixi.js';
import { gsap } from 'gsap';
import type { World } from '../../core/ecs/World.ts';
import { createEntityId } from '../../core/ecs/types.ts';
import type { EntityId } from '../../core/ecs/types.ts';
import type { RenderPipeline } from '../../core/renderer/RenderPipeline.ts';
import { ThrusterFilter } from './ThrusterFilter.ts';
import { engine } from '../../Engine.ts';
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
import { ShipMaterialFilter } from './ShipMaterialFilter.ts';
import { ShipLighting } from './ShipLighting.ts';
import { HULL_DEFINITIONS } from './ShipDefinitions.ts';
import type { ParticleEmitter } from '../fx/ParticleEmitter.ts';
import { globalBus, ShipEvent } from '../../core/network/MessageBus.ts';
import type { ShipLifecycleEvent } from '../../core/network/MessageBus.ts';

// Polygon vertex lists (x,y pairs, origin at ship center, nose points up = -y)
const HULLS: Record<string, { pts: number[]; size: number; exhaustY: number }> = {
  // Angular delta-wing interceptor — swept shoulders, distinct wing panels
  fighter: {
    pts: [0, -22, 3, -16, 5, -12, 12, -2, 14, 8, 10, 14, 3, 18, 0, 16, -3, 18, -10, 14, -14, 8, -12, -2, -5, -12, -3, -16],
    size: 22,
    exhaustY: 16,
  },
  // Patrol escort — elongated fuselage, wide swept wings
  frigate: {
    pts: [0, -32, 4, -24, 7, -16, 14, -4, 18, 8, 16, 20, 8, 26, 0, 22, -8, 26, -16, 20, -18, 8, -14, -4, -7, -16, -4, -24],
    size: 30,
    exhaustY: 22,
  },
  // Heavy warship — wide armor flanks, pronounced engine pods, deep panel lines
  destroyer: {
    pts: [0, -38, 6, -28, 12, -16, 22, -4, 24, 10, 22, 22, 16, 30, 6, 36, 0, 32, -6, 36, -16, 30, -22, 22, -24, 10, -22, -4, -12, -16, -6, -28],
    size: 38,
    exhaustY: 28,
  },
  // Texture-mapped hull — polygon used for mask, outline, and thruster positions
  cruiser: {
    pts: [0, -52, 16, -38, 28, -16, 30, 4, 26, 20, 16, 32, 0, 36, -16, 32, -26, 20, -30, 4, -28, -16, -16, -38],
    size: 52,
    exhaustY: 30,
  },
};

// Per-class nozzle positions (local space, y = exhaustY from HULLS)
const NOZZLES: Record<string, Array<{ x: number; y: number }>> = {
  fighter:   [{ x: 0, y: 16 }],
  frigate:   [{ x: -5, y: 22 }, { x: 5, y: 22 }],
  destroyer: [{ x: -8, y: 28 }, { x: 8, y: 28 }],
  cruiser:   [{ x: -14, y: 30 }, { x: 14, y: 30 }],
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
  // Texture-mapped hull layers (cruiser only — undefined on procedural ships)
  hullSprites?:    Container;        // masked container: albedo + emissive
  hullEmissive?:   Sprite;           // additive pass — tint updated on damage flash
  matFilter?:      ShipMaterialFilter; // PBR lighting shader on albedo sprite
  isLocal:         boolean;
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

      // PBR lighting — propagate global light direction and color to material shader
      if (dobj.matFilter) {
        dobj.matFilter.lightDir   = ShipLighting.dir;
        dobj.matFilter.lightColor = ShipLighting.color;
        dobj.matFilter.ambient    = ShipLighting.ambient;
        dobj.matFilter.rimStrength = ShipLighting.rimStrength;
      }

      // Damage flash
      if (visual.damageFlashTimer > 0) {
        visual.damageFlashTimer -= dt;
        dobj.body.tint = 0xff6655;
        if (dobj.hullEmissive) dobj.hullEmissive.tint = 0xff2200;
      } else {
        dobj.body.tint = 0xffffff;
        if (dobj.hullEmissive) dobj.hullEmissive.tint = isLocal ? 0x00eeff : 0xff8844;
      }

      // Breached flicker
      const breachAlpha = (destruction?.state === 'breached')
        ? 0.6 + 0.4 * Math.sin(this.time * 20)
        : 1;
      dobj.body.alpha = breachAlpha;
      if (dobj.hullSprites) dobj.hullSprites.alpha = breachAlpha;

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
    // Five hull tones — base, lit face, specular face, shadow, deep recess
    const bodyBase     = isLocal ? 0x1e3248 : 0x382012;  // dominant mid-tone
    const bodyLight    = isLocal ? 0x2e4c70 : 0x5a3820;  // angled surfaces
    const bodyBright   = isLocal ? 0x3e6082 : 0x7a5030;  // direct-lit faces
    const bodyDark     = isLocal ? 0x0c1825 : 0x1a0e06;  // shadowed flanks/underside
    const bodyRecess   = isLocal ? 0x060d16 : 0x100805;  // deep panel grooves / spine
    const seamColor    = isLocal ? 0x04080e : 0x0c0604;  // near-black seam lines
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

    // Cruiser uses PBR-style sprite layers; other ships use procedural Graphics.
    let hullSprites: Container | undefined;
    let hullEmissive: Sprite | undefined;
    let body: Graphics;

    let matFilter: ShipMaterialFilter | undefined;

    if (shipClass === 'cruiser') {
      const layers = this.buildCruiserLayers(pts, size, isLocal);
      hullSprites  = layers.container;
      hullEmissive = layers.emissive;
      matFilter    = layers.matFilter;
      nudge.addChild(hullSprites);
      body = this.buildCruiserOutline(pts, rimColor, cockpitColor);
    } else {
      body = this.buildHullBody(shipClass, pts, size, bodyBase, bodyLight, bodyBright, bodyDark, bodyRecess, seamColor, rimColor, cockpitColor);
    }
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

    return {
      container, outerGlow, midGlow, nudge, body, circuitry,
      engCone, exhaustBloom, engCore, thrusterFilter,
      shieldRing, healthBar, warpRing, trail,
      hullSize: size, tweens, isLocal,
      ...(hullSprites  ? { hullSprites }  : {}),
      ...(hullEmissive ? { hullEmissive } : {}),
      ...(matFilter    ? { matFilter }    : {}),
    };
  }

  private buildHullBody(
    shipClass: string,
    pts:       number[],
    size:      number,
    base:      number,
    light:     number,
    bright:    number,
    dark:      number,
    recess:    number,
    seam:      number,
    rim:       number,
    cockpit:   number,
  ): Graphics {
    const g = new Graphics();

    // Base hull fill — fills the whole silhouette first
    polyPath(g, pts);
    g.fill({ color: base });

    if (shipClass === 'fighter') {
      // ── Bright nose wedge (direct starlight, forward-facing) ──
      g.moveTo(0, -22); g.lineTo(5, -12); g.lineTo(-5, -12); g.closePath();
      g.fill({ color: bright, alpha: 0.70 });

      // ── Upper body panels flanking spine (angled lit surfaces) ──
      g.moveTo(3, -16); g.lineTo(5, -12); g.lineTo(11, -2); g.lineTo(4, -2); g.closePath();
      g.fill({ color: light, alpha: 0.52 });
      g.moveTo(-3, -16); g.lineTo(-5, -12); g.lineTo(-11, -2); g.lineTo(-4, -2); g.closePath();
      g.fill({ color: light, alpha: 0.52 });

      // ── Wing panels (angled away from top light — darker) ──
      g.moveTo(11, -2); g.lineTo(14, 8); g.lineTo(10, 14); g.lineTo(5, 8); g.lineTo(4, -2); g.closePath();
      g.fill({ color: dark, alpha: 0.60 });
      g.moveTo(-11, -2); g.lineTo(-14, 8); g.lineTo(-10, 14); g.lineTo(-5, 8); g.lineTo(-4, -2); g.closePath();
      g.fill({ color: dark, alpha: 0.60 });

      // ── Central spine channel — runs nose to tail ──
      g.rect(-2, -22, 4, 36);
      g.fill({ color: recess, alpha: 0.78 });

      // ── Aft engine bay ──
      g.moveTo(-3, 10); g.lineTo(3, 10); g.lineTo(3, 16); g.lineTo(-3, 16); g.closePath();
      g.fill({ color: dark, alpha: 0.55 });

      // ── Structural seam lines ──
      g.moveTo(-5, -12); g.lineTo(5, -12);    // nose-body shoulder
      g.moveTo(-11, -2); g.lineTo(11, -2);    // body-wing band
      g.moveTo(-4, 8);   g.lineTo(4, 8);      // aft band
      g.stroke({ color: seam, width: 0.85, alpha: 0.92 });
      g.moveTo(4, -2); g.lineTo(14, 8);
      g.moveTo(-4, -2); g.lineTo(-14, 8);
      g.stroke({ color: seam, width: 0.65, alpha: 0.80 });
      g.moveTo(0, -22); g.lineTo(0, 14);
      g.stroke({ color: seam, width: 0.55, alpha: 0.85 });

      // ── Battle scratches ──
      g.moveTo(6, -5); g.lineTo(11, 1);
      g.moveTo(-8, 2); g.lineTo(-12, 8);
      g.stroke({ color: 0x000000, width: 0.45, alpha: 0.50 });

      // ── Armor ridge accent ──
      g.moveTo(-4, -18); g.lineTo(4, -18);
      g.stroke({ color: rim, width: 0.6, alpha: 0.22 });

    } else if (shipClass === 'frigate') {
      // ── Bright nose cap ──
      g.moveTo(0, -32); g.lineTo(7, -16); g.lineTo(-7, -16); g.closePath();
      g.fill({ color: bright, alpha: 0.68 });

      // ── Upper body panels (shoulder → wing root) ──
      g.moveTo(4, -24); g.lineTo(7, -16); g.lineTo(14, -4); g.lineTo(6, -4); g.closePath();
      g.fill({ color: light, alpha: 0.52 });
      g.moveTo(-4, -24); g.lineTo(-7, -16); g.lineTo(-14, -4); g.lineTo(-6, -4); g.closePath();
      g.fill({ color: light, alpha: 0.52 });

      // ── Wing panels (dark flanks) ──
      g.moveTo(14, -4); g.lineTo(18, 8); g.lineTo(16, 20); g.lineTo(8, 20); g.lineTo(6, -4); g.closePath();
      g.fill({ color: dark, alpha: 0.56 });
      g.moveTo(-14, -4); g.lineTo(-18, 8); g.lineTo(-16, 20); g.lineTo(-8, 20); g.lineTo(-6, -4); g.closePath();
      g.fill({ color: dark, alpha: 0.56 });

      // ── Central spine channel ──
      g.rect(-2.5, -32, 5, 52);
      g.fill({ color: recess, alpha: 0.76 });

      // ── Aft engine bay ──
      g.moveTo(-5, 18); g.lineTo(5, 18); g.lineTo(4, 22); g.lineTo(-4, 22); g.closePath();
      g.fill({ color: dark, alpha: 0.52 });

      // ── Structural seam lines ──
      g.moveTo(-7, -16); g.lineTo(7, -16);     // nose-body
      g.moveTo(-14, -4); g.lineTo(14, -4);     // upper-wing band
      g.moveTo(-8, 18);  g.lineTo(8, 18);      // body-aft
      g.stroke({ color: seam, width: 0.85, alpha: 0.90 });
      g.moveTo(6, -4); g.lineTo(18, 8);
      g.moveTo(-6, -4); g.lineTo(-18, 8);
      g.stroke({ color: seam, width: 0.65, alpha: 0.78 });
      g.moveTo(0, -32); g.lineTo(0, 20);
      g.stroke({ color: seam, width: 0.60, alpha: 0.88 });
      g.moveTo(0, -16); g.lineTo(7, -16);
      g.moveTo(0, -16); g.lineTo(-7, -16);
      g.stroke({ color: seam, width: 0.55, alpha: 0.75 });

      // ── Battle scratches ──
      g.moveTo(9, -8); g.lineTo(14, 0);
      g.moveTo(-6, 5); g.lineTo(-14, 12);
      g.moveTo(4, 14); g.lineTo(9, 20);
      g.stroke({ color: 0x000000, width: 0.45, alpha: 0.48 });

      // ── Armor ridges ──
      g.moveTo(-5, -24); g.lineTo(5, -24);
      g.moveTo(-12, -4); g.lineTo(12, -4);
      g.stroke({ color: rim, width: 0.6, alpha: 0.17 });

    } else { // destroyer
      // ── Broad bright nose ──
      g.moveTo(0, -38); g.lineTo(12, -16); g.lineTo(-12, -16); g.closePath();
      g.fill({ color: bright, alpha: 0.66 });

      // ── Upper shoulder panels ──
      g.moveTo(6, -28); g.lineTo(12, -16); g.lineTo(22, -4); g.lineTo(10, -4); g.closePath();
      g.fill({ color: light, alpha: 0.52 });
      g.moveTo(-6, -28); g.lineTo(-12, -16); g.lineTo(-22, -4); g.lineTo(-10, -4); g.closePath();
      g.fill({ color: light, alpha: 0.52 });

      // ── Main wing/armor flanks ──
      g.moveTo(22, -4); g.lineTo(24, 10); g.lineTo(22, 22); g.lineTo(12, 22); g.lineTo(10, -4); g.closePath();
      g.fill({ color: dark, alpha: 0.55 });
      g.moveTo(-22, -4); g.lineTo(-24, 10); g.lineTo(-22, 22); g.lineTo(-12, 22); g.lineTo(-10, -4); g.closePath();
      g.fill({ color: dark, alpha: 0.55 });

      // ── Engine pod sections (heat-worn, slightly lighter) ──
      g.moveTo(16, 22); g.lineTo(16, 30); g.lineTo(6, 36); g.lineTo(6, 26); g.closePath();
      g.fill({ color: light, alpha: 0.20 });
      g.moveTo(-16, 22); g.lineTo(-16, 30); g.lineTo(-6, 36); g.lineTo(-6, 26); g.closePath();
      g.fill({ color: light, alpha: 0.20 });

      // ── Central spine channel ──
      g.rect(-2.8, -38, 5.6, 68);
      g.fill({ color: recess, alpha: 0.75 });

      // ── Structural seam lines ──
      g.moveTo(-12, -16); g.lineTo(12, -16);    // nose-shoulder
      g.moveTo(-22, -4);  g.lineTo(22, -4);     // shoulder-wing
      g.moveTo(-22, 22);  g.lineTo(22, 22);     // wing-pod
      g.stroke({ color: seam, width: 0.95, alpha: 0.92 });
      g.moveTo(10, -4); g.lineTo(24, 10);
      g.moveTo(-10, -4); g.lineTo(-24, 10);
      g.stroke({ color: seam, width: 0.72, alpha: 0.80 });
      g.moveTo(6, 26); g.lineTo(16, 26);
      g.moveTo(-6, 26); g.lineTo(-16, 26);
      g.stroke({ color: seam, width: 0.70, alpha: 0.82 });
      g.moveTo(0, -38); g.lineTo(0, 32);
      g.moveTo(0, -22); g.lineTo(6, -28);
      g.moveTo(0, -22); g.lineTo(-6, -28);
      g.stroke({ color: seam, width: 0.70, alpha: 0.78 });

      // ── Battle scratches ──
      g.moveTo(10, -12); g.lineTo(18, -4);
      g.moveTo(-8, 4);   g.lineTo(-18, 12);
      g.moveTo(5, 18);   g.lineTo(12, 24);
      g.moveTo(-12, -8); g.lineTo(-20, -1);
      g.stroke({ color: 0x000000, width: 0.55, alpha: 0.48 });

      // ── Armor ridges ──
      g.moveTo(-8, -30); g.lineTo(8, -30);
      g.moveTo(-16, -4); g.lineTo(16, -4);
      g.moveTo(-10, 10); g.lineTo(10, 10);
      g.stroke({ color: rim, width: 0.70, alpha: 0.16 });
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
      // Spine trace along central channel
      g.moveTo(0, -18); g.lineTo(0, 10);
      g.stroke({ color, width: 0.8, alpha: 0.55 });
      // Wing-root power branches at body-wing junction (y≈-2)
      g.moveTo(0, -10); g.lineTo(8, -4);
      g.moveTo(0, -10); g.lineTo(-8, -4);
      g.moveTo(0, 2);   g.lineTo(9, 7);
      g.moveTo(0, 2);   g.lineTo(-9, 7);
      g.stroke({ color, width: 0.5, alpha: 0.40 });
      // Junction nodes
      g.circle(0, -10, 1.2); g.fill({ color, alpha: 0.72 });
      g.circle(0,   2, 1.0); g.fill({ color, alpha: 0.65 });
      g.circle( 8,  -4, 0.8); g.fill({ color, alpha: 0.50 });
      g.circle(-8,  -4, 0.8); g.fill({ color, alpha: 0.50 });

    } else if (shipClass === 'frigate') {
      // Spine trace
      g.moveTo(0, -28); g.lineTo(0, 14);
      g.stroke({ color, width: 0.9, alpha: 0.55 });
      // Lateral cross-rings aligned to seam bands (y≈-4, y≈8)
      g.moveTo(-12, -4); g.lineTo(12, -4);
      g.moveTo(-10,  8); g.lineTo(10,  8);
      g.stroke({ color, width: 0.5, alpha: 0.32 });
      // Diagonal branches to wing roots
      g.moveTo(0, -16); g.lineTo(9, -10);
      g.moveTo(0, -16); g.lineTo(-9, -10);
      g.moveTo(0,  -4); g.lineTo(12, 2);
      g.moveTo(0,  -4); g.lineTo(-12, 2);
      g.stroke({ color, width: 0.5, alpha: 0.40 });
      // Junction nodes
      g.circle(0, -16, 1.4); g.fill({ color, alpha: 0.72 });
      g.circle(0,  -4, 1.1); g.fill({ color, alpha: 0.65 });
      g.circle(0,   8, 1.0); g.fill({ color, alpha: 0.55 });
      g.circle( 9, -10, 0.9); g.fill({ color, alpha: 0.45 });
      g.circle(-9, -10, 0.9); g.fill({ color, alpha: 0.45 });

    } else { // destroyer — heaviest detail
      // Spine trace
      g.moveTo(0, -34); g.lineTo(0, 20);
      g.stroke({ color, width: 1.0, alpha: 0.55 });
      // Lateral cross-bars at seam bands (y≈-4, y≈10, y≈-20)
      g.moveTo(-18, -4);  g.lineTo(18, -4);
      g.moveTo(-16, 10);  g.lineTo(16, 10);
      g.moveTo(-8,  -20); g.lineTo(8, -20);
      g.stroke({ color, width: 0.5, alpha: 0.30 });
      // Diagonal branches to armor flanks
      g.moveTo(0, -20); g.lineTo(10, -14);
      g.moveTo(0, -20); g.lineTo(-10, -14);
      g.moveTo(0,  -4); g.lineTo(18,  2);
      g.moveTo(0,  -4); g.lineTo(-18, 2);
      g.moveTo(0,  10); g.lineTo(14, 16);
      g.moveTo(0,  10); g.lineTo(-14, 16);
      g.stroke({ color, width: 0.5, alpha: 0.40 });
      // Junction nodes
      g.circle(0,  -20, 1.6);  g.fill({ color, alpha: 0.72 });
      g.circle(0,   -4, 1.3);  g.fill({ color, alpha: 0.65 });
      g.circle(0,   10, 1.1);  g.fill({ color, alpha: 0.60 });
      g.circle( 10, -14, 1.0); g.fill({ color, alpha: 0.50 });
      g.circle(-10, -14, 1.0); g.fill({ color, alpha: 0.50 });
      g.circle( 18,   2, 0.9); g.fill({ color, alpha: 0.45 });
      g.circle(-18,   2, 0.9); g.fill({ color, alpha: 0.45 });
    }

    return g;
  }

  // ── Texture-mapped cruiser ───────────────────────────────────────────────────

  private buildCruiserLayers(
    pts: number[],
    size: number,
    isLocal: boolean,
  ): { container: Container; emissive: Sprite; matFilter: ShipMaterialFilter } {
    // Bounding box of the hull polygon: 60px wide × 88px tall, center at y = -8
    const spriteSize = size * 1.75; // square, covers hull bbox with small margin
    const spriteCY   = -size * 0.15;

    // Hull-shaped stencil mask — clips all sprites to the polygon silhouette
    const maskGfx = new Graphics();
    polyPath(maskGfx, pts);
    maskGfx.fill({ color: 0xffffff, alpha: 1 });

    const masked = new Container();
    masked.mask = maskGfx;
    masked.addChild(maskGfx);

    const makeSprite = (key: string): Sprite => {
      const s = new Sprite(engine.assets.getTextureOrEmpty(key));
      s.anchor.set(0.5);
      s.x = 0;
      s.y = spriteCY;
      s.width  = spriteSize;
      s.height = spriteSize;
      return s;
    };

    // Layer 1: albedo — PBR lighting shader samples height + roughness maps in GPU.
    // No sprite.tint here: faction colour is passed directly to the shader so the
    // filter receives the raw, unmodified albedo PNG colours.
    const base = makeSprite('cruiser_albedo');
    const rimVec: [number, number, number] = isLocal ? [0.0, 0.85, 1.0] : [1.0, 0.50, 0.0];
    // Faction tint: subtle hue shift applied inside the PBR shader.
    const factionVec: [number, number, number] = isLocal
      ? [0.80, 0.95, 1.10]   // player: faint cool-cyan cast
      : [1.10, 0.80, 0.60];  // enemy:  warm amber cast
    const heightTex  = engine.assets.getTextureOrEmpty('cruiser_height');
    const roughTex   = engine.assets.getTextureOrEmpty('cruiser_roughness');
    const matFilter  = new ShipMaterialFilter(
      heightTex.source, roughTex.source,
      rimVec, 0.60,
      factionVec,
    );
    base.filters = [matFilter];
    masked.addChild(base);

    // Layer 2: emissive — albedo again, additive, pulls out panel glow
    const emissive = makeSprite('cruiser_albedo');
    emissive.blendMode = 'add';
    emissive.alpha     = 0.20;
    emissive.tint      = isLocal ? 0x00eeff : 0xff8844;
    masked.addChild(emissive);

    return { container: masked, emissive, matFilter };
  }

  // Outline + cockpit only — texture layers provide all the surface detail.
  private buildCruiserOutline(pts: number[], rim: number, cockpit: number): Graphics {
    const g = new Graphics();
    polyPath(g, pts);
    g.stroke({ color: rim, width: 1.4, alpha: 0.92 });
    // Cockpit (size=52 → cockpitY ≈ -20, r ≈ 6.8)
    const cockpitY = -52 * 0.38;
    const cr       =  52 * 0.13;
    g.ellipse(0, cockpitY, cr * 1.1, cr);
    g.fill({ color: cockpit, alpha: 0.75 });
    g.ellipse(0, cockpitY, cr * 1.1, cr);
    g.stroke({ color: cockpit, width: 0.8, alpha: 0.60 });
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

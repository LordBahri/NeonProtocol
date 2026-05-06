import { Graphics } from 'pixi.js';
import type { Container } from 'pixi.js';
import type { ParticleEmitter } from '../fx/ParticleEmitter.ts';
import type { ThrusterPort } from './ShipDefinitions.ts';
import type { PhysicsData } from './ShipSystemComponents.ts';
import type { HeatData } from './ShipSystemComponents.ts';
import type { FuelData } from './ShipSystemComponents.ts';
import type { PlayerInputData } from './ShipComponents.ts';
import type { EntityId } from '../../core/ecs/types.ts';

export interface ThrusterComponentSnapshot {
  physics?: PhysicsData;
  heat?: HeatData;
  fuel?: FuelData;
  input?: PlayerInputData;
  thrustForward: boolean;
  thrustBack: boolean;
  rotateLeft: boolean;
  rotateRight: boolean;
  boost: boolean;
}

interface ThrusterGlow {
  gfx: Graphics;
  port: ThrusterPort;
}

interface ThrusterFXEntry {
  glows: ThrusterGlow[];
  lastEmitTime: number;
}

/**
 * Renderer-only class — no ECS World reference.
 * ShipRenderer calls update() each frame, passing pre-fetched component data.
 * Draws per-port engine glow Graphics and emits exhaust particles.
 */
export class ThrusterFX {
  private emitter: ParticleEmitter;
  private entries = new Map<EntityId, ThrusterFXEntry>();
  private time = 0;

  constructor(emitter: ParticleEmitter) {
    this.emitter = emitter;
  }

  /** Call once when a ship display object is created. */
  register(entity: EntityId, ports: ThrusterPort[], shipContainer: Container): ThrusterFXEntry {
    const glows: ThrusterGlow[] = [];
    for (const port of ports) {
      const gfx = new Graphics();
      gfx.eventMode = 'none';
      shipContainer.addChildAt(gfx, 0); // behind hull body
      glows.push({ gfx, port });
    }
    const entry: ThrusterFXEntry = { glows, lastEmitTime: 0 };
    this.entries.set(entity, entry);
    return entry;
  }

  /** Call when a ship entity is removed. */
  unregister(entity: EntityId, shipContainer: Container): void {
    const entry = this.entries.get(entity);
    if (!entry) return;
    for (const { gfx } of entry.glows) {
      shipContainer.removeChild(gfx);
      gfx.destroy();
    }
    this.entries.delete(entity);
  }

  /**
   * Call each frame from ShipRenderer.syncWithWorld().
   * worldX/worldY: ship world position (for particle spawn).
   * shipAngle: current rotation in radians.
   */
  update(
    entity: EntityId,
    ports: ThrusterPort[],
    snap: ThrusterComponentSnapshot,
    worldX: number,
    worldY: number,
    shipAngle: number,
    shipScale: number,
    dt: number,
  ): void {
    this.time += dt;
    const entry = this.entries.get(entity);
    if (!entry) return;

    const overheated   = snap.heat?.isOverheated  ?? false;
    const warpCharging = snap.physics?.warpCharging ?? false;
    const suppressed   = overheated || warpCharging;

    const sin = Math.sin(shipAngle);
    const cos = Math.cos(shipAngle);

    for (let p = 0; p < ports.length && p < entry.glows.length; p++) {
      const port  = ports[p]!;
      const glow  = entry.glows[p]!;

      const intensity = suppressed ? 0 : portIntensity(port, snap);
      if (intensity <= 0) {
        glow.gfx.visible = false;
        continue;
      }

      glow.gfx.visible = true;

      // Local → world transform for glow position
      const lx = port.localX * shipScale;
      const ly = port.localY * shipScale;
      glow.gfx.x = lx * cos - ly * sin;
      glow.gfx.y = lx * sin + ly * cos;

      // Animated glow ring
      const pulse  = 0.75 + 0.25 * Math.sin(this.time * 12 + p * 1.3);
      const radius = (4 + intensity * 8) * shipScale * pulse;
      glow.gfx.clear();
      glow.gfx.circle(0, 0, radius);
      glow.gfx.fill({ color: thrusterColor(port), alpha: 0.55 * intensity });
      glow.gfx.circle(0, 0, radius * 0.5);
      glow.gfx.fill({ color: 0xffffff, alpha: 0.4 * intensity });
      glow.gfx.blendMode = 'add';

      // Particle exhaust — throttled to not saturate the pool
      if (this.time - entry.lastEmitTime > 0.04 && intensity > 0.1) {
        const count = Math.round(intensity * 2 * (port.role === 'rcs' ? 0.5 : 1));
        if (count > 0) {
          // Port local position rotated to world space
          const portWorldX = worldX + (port.localX * cos - port.localY * sin) * shipScale;
          const portWorldY = worldY + (port.localX * sin + port.localY * cos) * shipScale;

          // Exhaust angle is local; rotate to world
          const exhaustWorldAngle = port.exhaustAngle + shipAngle;

          this.emitter.emit({
            count,
            x: portWorldX,
            y: portWorldY,
            angle: exhaustWorldAngle,
            spread: 0.25,
            color: exhaustColors(port),
            minSize: 1,
            maxSize: 2.5 * intensity * shipScale,
            minSpeed: 40 * intensity,
            maxSpeed: 120 * intensity,
            minLife: 0.08,
            maxLife: 0.25,
            gravity: 0,
            drag: 0.88,
            additive: true,
          });
        }
      }
    }

    if (ports.length > 0) entry.lastEmitTime = this.time;
  }

  destroy(): void {
    this.entries.clear();
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function portIntensity(port: ThrusterPort, snap: ThrusterComponentSnapshot): number {
  const { thrustForward, thrustBack, rotateLeft, rotateRight, boost } = snap;
  const boostMul = boost ? 1.35 : 1.0;

  switch (port.role) {
    case 'main':
      return thrustForward ? port.thrustFraction * boostMul : 0;
    case 'reverse':
      return thrustBack ? port.thrustFraction * boostMul : 0;
    case 'lateral': {
      // lateral thrusters fire when rotating; direction depends on port side
      const isPort = port.localX < 0;
      return (isPort ? rotateLeft : rotateRight) ? port.thrustFraction : 0;
    }
    case 'rcs': {
      const anyInput = thrustForward || thrustBack || rotateLeft || rotateRight;
      return anyInput ? port.thrustFraction * 0.6 : 0;
    }
  }
}

function thrusterColor(port: ThrusterPort): number {
  switch (port.role) {
    case 'main':    return 0x00ffee;
    case 'reverse': return 0xff6600;
    case 'lateral': return 0x00aaff;
    case 'rcs':     return 0x0088cc;
  }
}

function exhaustColors(port: ThrusterPort): number[] {
  switch (port.role) {
    case 'main':    return [0x00ffcc, 0x00aaff, 0xffffff];
    case 'reverse': return [0xff4400, 0xff8800, 0xffcc00];
    case 'lateral': return [0x0088ff, 0x00ccff];
    case 'rcs':     return [0x006699, 0x0088bb];
  }
}

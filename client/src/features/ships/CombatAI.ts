import type { World } from '../../core/ecs/World.ts';
import type { EntityId } from '../../core/ecs/types.ts';
import { createEntityId, INVALID_ENTITY } from '../../core/ecs/types.ts';
import {
  TransformComponent,
  VelocityComponent,
  ShipStatsComponent,
} from './ShipComponents.ts';
import {
  AICombatComponent,
  TargetingComponent,
} from '../combat/CombatComponents.ts';

// ── Fleet Coordinator ─────────────────────────────────────────────────────────
// All AI ships share a global focus target so they concentrate fire.
const fleetCoordinator = {
  sharedTarget: INVALID_ENTITY as EntityId,
  updateTarget(t: EntityId): void {
    if (t !== INVALID_ENTITY) this.sharedTarget = t;
  },
  getTarget(): EntityId { return this.sharedTarget; },
};

export { fleetCoordinator };

// ── Helpers ───────────────────────────────────────────────────────────────────

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d >  Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return a + d * Math.min(1, t);
}

function clampSpeed(vel: { vx: number; vy: number }, maxSpeed: number): void {
  const spd = Math.hypot(vel.vx, vel.vy);
  if (spd > maxSpeed) { vel.vx = (vel.vx / spd) * maxSpeed; vel.vy = (vel.vy / spd) * maxSpeed; }
}

// ── CombatAI class ────────────────────────────────────────────────────────────

export class CombatAI {
  /** Call once per simulation tick for all AI ships. */
  static update(world: World, dt: number): void {
    const entities = world.query(AICombatComponent, TransformComponent, VelocityComponent);
    for (let i = 0; i < entities.length; i++) {
      CombatAI.updateEntity(createEntityId(entities[i]!), world, dt);
    }
  }

  static updateEntity(entity: EntityId, world: World, dt: number): void {
    const ai      = world.getComponent(entity, AICombatComponent)!;
    const tf      = world.getComponent(entity, TransformComponent)!;
    const vel     = world.getComponent(entity, VelocityComponent)!;
    const stats   = world.getComponent(entity, ShipStatsComponent);
    const tgComp  = world.getComponent(entity, TargetingComponent);

    if (!stats) return;

    ai.stateTimer += dt;

    // ── Resolve current target ────────────────────────────────────────────
    const lockedId   = tgComp?.lockedTarget ?? INVALID_ENTITY;
    const targetAlive = lockedId !== INVALID_ENTITY && world.isAlive(lockedId);
    const targetTf    = targetAlive ? world.getComponent(lockedId, TransformComponent) : null;
    const dist        = targetTf ? Math.hypot(targetTf.x - tf.x, targetTf.y - tf.y) : Infinity;

    // ── Fleet coordination: adopt shared target ───────────────────────────
    if (targetAlive) {
      fleetCoordinator.updateTarget(lockedId);
    } else if (tgComp && fleetCoordinator.getTarget() !== INVALID_ENTITY) {
      tgComp.lockedTarget   = fleetCoordinator.getTarget();
      tgComp.lockProgress   = 0;
    }

    // ── State machine transitions ─────────────────────────────────────────
    const hullFrac    = stats.hull / stats.maxHull;
    const innerRadius = ai.orbitRadius * 0.55;
    const outerRadius = ai.orbitRadius * 1.50;

    // Priority 1: retreat when critically damaged
    if (hullFrac < 0.20 && ai.state !== 'retreat') {
      ai.state      = 'retreat';
      ai.stateTimer = 0;
      if (targetTf) {
        const away    = Math.atan2(tf.y - targetTf.y, tf.x - targetTf.x);
        ai.retreatX   = tf.x + Math.cos(away) * 1400;
        ai.retreatY   = tf.y + Math.sin(away) * 1400;
      } else {
        ai.retreatX   = tf.x + (Math.random() - 0.5) * 1000;
        ai.retreatY   = tf.y + (Math.random() - 0.5) * 1000;
      }
    // Recover from retreat if health recovered or been fleeing long enough
    } else if (ai.state === 'retreat' && (hullFrac > 0.40 && ai.stateTimer > 5)) {
      ai.state = 'patrol'; ai.stateTimer = 0;
    // No target → patrol
    } else if (!targetAlive && ai.state !== 'patrol' && ai.state !== 'retreat') {
      ai.state = 'patrol'; ai.stateTimer = 0;
    // Too far → approach
    } else if (targetAlive && dist > outerRadius && ai.state !== 'approach' && ai.state !== 'retreat') {
      ai.state = 'approach'; ai.stateTimer = 0;
    // Too close → kite
    } else if (targetAlive && dist < innerRadius && ai.state !== 'kite' && ai.state !== 'retreat') {
      ai.state = 'kite'; ai.stateTimer = 0;
    // In good range → orbit (transition from approach/patrol)
    } else if (
      targetAlive && dist >= innerRadius && dist <= outerRadius &&
      (ai.state === 'approach' || ai.state === 'patrol')
    ) {
      ai.state     = 'orbit';
      ai.stateTimer = 0;
      // Reverse orbit direction occasionally for variety
      if (Math.random() < 0.5) ai.orbitDir = ai.orbitDir === 1 ? -1 : 1;
    }

    // ── Behavior execution ────────────────────────────────────────────────
    const accel    = 260;
    const maxSpeed = 200;

    switch (ai.state) {
      case 'patrol': {
        // Gentle drift, slowly decelerate
        vel.vx *= 0.97;
        vel.vy *= 0.97;
        // Slowly scan for targets by spinning
        tf.angle += 0.4 * dt;
        break;
      }

      case 'approach': {
        if (!targetTf) break;
        const angle = Math.atan2(targetTf.y - tf.y, targetTf.x - tf.x);
        vel.vx     += Math.cos(angle) * accel * dt;
        vel.vy     += Math.sin(angle) * accel * dt;
        tf.angle    = lerpAngle(tf.angle, angle - Math.PI / 2, 3.0 * dt);
        break;
      }

      case 'orbit': {
        if (!targetTf) break;
        // Advance orbit angle — angular speed inversely proportional to radius
        ai.orbitAngle += (ai.orbitDir * 130 / ai.orbitRadius) * dt;

        const orbitX = targetTf.x + Math.cos(ai.orbitAngle) * ai.orbitRadius;
        const orbitY = targetTf.y + Math.sin(ai.orbitAngle) * ai.orbitRadius;
        const dox    = orbitX - tf.x;
        const doy    = orbitY - tf.y;
        const dlen   = Math.hypot(dox, doy) + 0.001;
        vel.vx      += (dox / dlen) * accel * dt;
        vel.vy      += (doy / dlen) * accel * dt;

        // Face the target to fire weapons
        const faceAngle = Math.atan2(targetTf.y - tf.y, targetTf.x - tf.x);
        tf.angle = lerpAngle(tf.angle, faceAngle - Math.PI / 2, 2.5 * dt);
        break;
      }

      case 'kite': {
        if (!targetTf) break;
        // Move away while keeping face toward target to fire
        const away      = Math.atan2(tf.y - targetTf.y, tf.x - targetTf.x);
        vel.vx         += Math.cos(away) * accel * 1.1 * dt;
        vel.vy         += Math.sin(away) * accel * 1.1 * dt;
        const faceAngle = Math.atan2(targetTf.y - tf.y, targetTf.x - tf.x);
        tf.angle        = lerpAngle(tf.angle, faceAngle - Math.PI / 2, 2.5 * dt);
        // After some time in kite, go back to orbit
        if (ai.stateTimer > 3.5) { ai.state = 'orbit'; ai.stateTimer = 0; }
        break;
      }

      case 'retreat': {
        const rdx  = ai.retreatX - tf.x;
        const rdy  = ai.retreatY - tf.y;
        const rlen = Math.hypot(rdx, rdy) + 0.001;
        vel.vx    += (rdx / rlen) * accel * 1.5 * dt;
        vel.vy    += (rdy / rlen) * accel * 1.5 * dt;
        const retreatAngle = Math.atan2(rdy, rdx);
        tf.angle   = lerpAngle(tf.angle, retreatAngle - Math.PI / 2, 3.0 * dt);
        break;
      }

      case 'coordinate': {
        // Temporarily used to re-sync target; immediately transitions to orbit
        ai.state = 'orbit'; ai.stateTimer = 0;
        break;
      }
    }

    clampSpeed(vel, maxSpeed);

    // Sync prevX/prevY for interpolation
    tf.prevX     = tf.x;
    tf.prevY     = tf.y;
    tf.prevAngle = tf.angle;
    tf.x        += vel.vx * dt;
    tf.y        += vel.vy * dt;
  }

  /** Equip a new AI ship with default combat parameters. */
  static setupAI(
    world:       World,
    entity:      EntityId,
    orbitRadius: number,
    _weaponKey:   string,
    _weaponHardpointIndices: number[],
  ): void {
    // Add AI state component
    world.addComponent(entity, AICombatComponent, {
      state:            'approach',
      orbitAngle:       Math.random() * Math.PI * 2,
      orbitRadius,
      orbitDir:         Math.random() < 0.5 ? 1 : -1,
      retreatX:         0,
      retreatY:         0,
      stateTimer:       0,
      fleetFocusTarget: INVALID_ENTITY,
    });

    // Add targeting component
    world.addComponent(entity, TargetingComponent, {
      lockedTarget:  INVALID_ENTITY,
      lockProgress:  0,
      lockTime:      1.5,
      range:         650,
      predictedX:    0,
      predictedY:    0,
    });

    // Equip weapon slots
    const slotComp = world.getComponent(entity, { typeId: 0 } as never);
    // Use imported WeaponSlotComponent via ShipFactory instead
    void slotComp;
  }
}

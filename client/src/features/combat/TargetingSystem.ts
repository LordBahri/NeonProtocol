/**
 * TargetingSystem — pure static utilities.
 *
 * Deliberately free of PixiJS imports so it can run safely inside
 * core/simulation/ without violating the simulation ↔ renderer isolation rule.
 */

import type { EntityId } from '../../core/ecs/types.ts';
import { INVALID_ENTITY } from '../../core/ecs/types.ts';
import type { World } from '../../core/ecs/World.ts';
import { createEntityId } from '../../core/ecs/types.ts';
import {
  TransformComponent,
  ShipStatsComponent,
} from '../ships/ShipComponents.ts';
import type { TargetingData } from './CombatComponents.ts';
import { ModuleStateComponent } from './CombatComponents.ts';

export class TargetingSystem {
  // ── Intercept prediction ──────────────────────────────────────────────────

  /**
   * Quadratic intercept formula.
   *
   * Solves for the time `t` at which a projectile travelling at
   * `projectileSpeed` launched from (sx, sy) will meet a target
   * currently at (tx, ty) moving with constant velocity (tvx, tvy).
   *
   * Returns the predicted world position to aim at.  Falls back to the
   * target's current position when no real positive solution exists.
   */
  static predictIntercept(
    sx: number,
    sy: number,
    tx: number,
    ty: number,
    tvx: number,
    tvy: number,
    projectileSpeed: number,
  ): { x: number; y: number } {
    const dx = tx - sx;
    const dy = ty - sy;

    // a·t² + b·t + c = 0  where t = time to intercept
    const a = tvx * tvx + tvy * tvy - projectileSpeed * projectileSpeed;
    const b = 2 * (dx * tvx + dy * tvy);
    const c = dx * dx + dy * dy;

    // Degenerate: target speed ≈ projectile speed — aim directly.
    if (Math.abs(a) < 1e-4) {
      return { x: tx, y: ty };
    }

    const disc = b * b - 4 * a * c;
    if (disc < 0) {
      // No real solution — projectile can never catch the target.
      return { x: tx, y: ty };
    }

    const sqrtDisc = Math.sqrt(disc);
    const t1 = (-b - sqrtDisc) / (2 * a);
    const t2 = (-b + sqrtDisc) / (2 * a);

    // Prefer the smallest positive root (earliest intercept).
    const t = t1 > 0 ? t1 : t2;
    if (t < 0) {
      return { x: tx, y: ty };
    }

    return { x: tx + tvx * t, y: ty + tvy * t };
  }

  // ── Enemy acquisition ─────────────────────────────────────────────────────

  /**
   * Returns the EntityId of the nearest living enemy within `range` pixels.
   *
   * Scoring favours closer targets but biases toward heavily damaged ships
   * to encourage focus-fire — targets at 0 % hull remaining score
   * `range * 0.3` pixels "closer" than they really are.
   *
   * @param isPlayerTeam  Unused directly; kept in the signature so callers
   *                      can extend the logic without breaking the interface.
   *                      Enemy detection is based on the absence of matching
   *                      owner entity; callers should pass their own ownerEntity.
   */
  static findNearestEnemy(
    world: World,
    ownerEntity: EntityId,
    ownerX: number,
    ownerY: number,
    isPlayerTeam: boolean,         // reserved for future faction logic
    range: number,
  ): EntityId {
    const entities = world.query(TransformComponent, ShipStatsComponent);

    let best: EntityId = INVALID_ENTITY;
    let bestScore = Infinity;

    for (let i = 0; i < entities.length; i++) {
      const e = createEntityId(entities[i]!);

      // Skip self.
      if (e === ownerEntity) continue;

      const stats = world.getComponent(e, ShipStatsComponent);
      if (!stats || stats.hull <= 0) continue;

      const tf = world.getComponent(e, TransformComponent);
      if (!tf) continue;

      const dist = Math.hypot(tf.x - ownerX, tf.y - ownerY);
      if (dist > range) continue;

      // Lower score = higher priority.
      // Bias: damaged ships score as if they were up to range*0.3 px closer.
      const hullFraction = stats.hull / stats.maxHull;
      const score = dist - (1 - hullFraction) * range * 0.3;

      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }

    // Suppress unused-variable warning for the reserved parameter.
    void isPlayerTeam;

    return best;
  }

  // ── Lock-on progression ───────────────────────────────────────────────────

  /**
   * Advances the lock-on meter for a single targeting component.
   *
   * - Lock degrades at 2× speed when the target is dead or gone.
   * - Lock degrades at 1.5× speed when the target exits 125 % of range.
   * - Lock charges at 1 / lockTime per second when conditions are nominal.
   *
   * Returns `true` on the frame lock is first completed.
   */
  static updateLock(
    td: TargetingData,
    targetAlive: boolean,
    distToTarget: number,
    dt: number,
  ): boolean {
    if (!targetAlive || td.lockedTarget === INVALID_ENTITY) {
      td.lockProgress = Math.max(0, td.lockProgress - dt * 2.0);
      return false;
    }

    if (distToTarget > td.range * 1.25) {
      td.lockProgress = Math.max(0, td.lockProgress - dt * 1.5);
      return false;
    }

    td.lockProgress = Math.min(1, td.lockProgress + dt / td.lockTime);
    return td.lockProgress >= 1;
  }

  // ── Module state queries ──────────────────────────────────────────────────

  /**
   * Returns `true` if the given entity's weapons module is online.
   * Falls back to `true` when no ModuleState component is present
   * (e.g., for player ships that don't yet have module management).
   */
  static weaponsOnline(world: World, entity: EntityId): boolean {
    const ms = world.getComponent(entity, ModuleStateComponent);
    return ms ? ms.weapons : true;
  }

  /**
   * Returns `true` if the given entity's sensors module is online.
   * Offline sensors prevent target acquisition.
   */
  static sensorsOnline(world: World, entity: EntityId): boolean {
    const ms = world.getComponent(entity, ModuleStateComponent);
    return ms ? ms.sensors : true;
  }
}

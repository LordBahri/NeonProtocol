import type { World } from '../../../core/ecs/World.ts';
import type { System } from '../../../core/ecs/types.ts';
import { createEntityId } from '../../../core/ecs/types.ts';
import { SystemPriority } from '../../../core/ecs/SystemScheduler.ts';
import { TransformComponent, ShipStatsComponent, VisualComponent } from '../ShipComponents.ts';
import type { ArmorData } from '../ShipSystemComponents.ts';
import { ArmorComponent, DestructionComponent } from '../ShipSystemComponents.ts';
import { globalBus, ShipEvent } from '../../../core/network/MessageBus.ts';
import type { DamageApplyEvent } from '../../../core/network/MessageBus.ts';

interface PendingDamage {
  targetEntity: number;
  damage: number;
  hitAngle: number;
}

type ArmorFacing = 'fore' | 'aft' | 'port' | 'starboard';

/**
 * Listens for ShipEvent.DAMAGE_APPLY events and processes directional damage.
 * Priority: shield absorbs first, then directional armor, then hull.
 */
export class ShieldArmorSystem implements System {
  readonly name = 'ShieldArmorSystem';
  readonly priority = SystemPriority.SHIELD_ARMOR;

  private pending: PendingDamage[] = [];
  private unsub: () => void;

  constructor() {
    this.unsub = globalBus.on<DamageApplyEvent>(ShipEvent.DAMAGE_APPLY, (evt) => {
      this.pending.push({ targetEntity: evt.targetEntity, damage: evt.damage, hitAngle: evt.hitAngle });
    });
  }

  update(world: World, _dt: number): void {
    for (const dmg of this.pending) {
      const entity = createEntityId(dmg.targetEntity);
      if (!world.isAlive(entity)) continue;

      const stats       = world.getComponent(entity, ShipStatsComponent);
      const armor       = world.getComponent(entity, ArmorComponent);
      const transform   = world.getComponent(entity, TransformComponent);
      const destruction = world.getComponent(entity, DestructionComponent);
      const visual      = world.getComponent(entity, VisualComponent);

      if (!stats) continue;

      let remaining = dmg.damage;

      // Shield absorbs first
      if (stats.shield > 0) {
        const absorbed = Math.min(stats.shield, remaining);
        stats.shield  -= absorbed;
        remaining     -= absorbed;
        stats.lastDamageTime = 0;
      }

      if (remaining <= 0) continue;

      // Directional armor
      if (armor && transform) {
        const relAngle = bodyRelativeAngle(dmg.hitAngle, transform.angle);
        const facing   = getFacing(relAngle);
        const current  = getArmorHp(armor, facing);
        if (current > 0) {
          const absorbed = Math.min(current, remaining * 0.6);
          drainArmor(armor, facing, absorbed);
          remaining -= absorbed;
        }
      }

      // Hull
      stats.hull = Math.max(0, stats.hull - remaining);

      // Damage flash
      if (visual) visual.damageFlashTimer = 0.15;

      // Breach check
      if (destruction && destruction.state === 'alive') {
        if (stats.hull <= stats.maxHull * destruction.breachThreshold) {
          destruction.state = 'breached';
          destruction.stateTimer = 0;
        }
      }
    }
    this.pending.length = 0;
  }

  destroy(): void {
    this.unsub();
  }
}

function bodyRelativeAngle(worldHit: number, shipAngle: number): number {
  let rel = worldHit - shipAngle;
  while (rel >  Math.PI) rel -= 2 * Math.PI;
  while (rel < -Math.PI) rel += 2 * Math.PI;
  return rel;
}

function getFacing(rel: number): ArmorFacing {
  const abs = Math.abs(rel);
  if (abs < Math.PI / 4)       return 'fore';
  if (abs > 3 * Math.PI / 4)   return 'aft';
  return rel > 0 ? 'starboard' : 'port';
}

function getArmorHp(a: ArmorData, f: ArmorFacing): number {
  switch (f) {
    case 'fore':      return a.foreArmor;
    case 'aft':       return a.aftArmor;
    case 'port':      return a.portArmor;
    case 'starboard': return a.starboardArmor;
  }
}

function drainArmor(a: ArmorData, f: ArmorFacing, amount: number): void {
  switch (f) {
    case 'fore':      a.foreArmor      = Math.max(0, a.foreArmor - amount);      break;
    case 'aft':       a.aftArmor       = Math.max(0, a.aftArmor - amount);       break;
    case 'port':      a.portArmor      = Math.max(0, a.portArmor - amount);      break;
    case 'starboard': a.starboardArmor = Math.max(0, a.starboardArmor - amount); break;
  }
}

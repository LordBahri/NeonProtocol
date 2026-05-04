import type { World } from '../../core/ecs/World.ts';
import type { System } from '../../core/ecs/types.ts';
import { createEntityId } from '../../core/ecs/types.ts';
import { SystemPriority } from '../../core/ecs/SystemScheduler.ts';
import { ShipStatsComponent } from '../ships/ShipComponents.ts';

let simTime = 0;

export const ShieldRechargeSystem: System = {
  name: 'ShieldRechargeSystem',
  priority: SystemPriority.COMBAT + 1,

  update(world: World, dt: number): void {
    simTime += dt;
    const entities = world.query(ShipStatsComponent);

    for (let i = 0; i < entities.length; i++) {
      const entity = createEntityId(entities[i]!);
      const stats = world.getComponent(entity, ShipStatsComponent)!;

      if (stats.shield >= stats.maxShield) continue;

      const timeSinceDamage = simTime - stats.lastDamageTime;
      if (timeSinceDamage < stats.shieldRechargeDelay) continue;

      stats.shield = Math.min(stats.maxShield, stats.shield + stats.shieldRechargeRate * dt);
    }
  },
};

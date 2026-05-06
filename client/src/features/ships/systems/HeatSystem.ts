import type { World } from '../../../core/ecs/World.ts';
import type { System } from '../../../core/ecs/types.ts';
import { createEntityId } from '../../../core/ecs/types.ts';
import { SystemPriority } from '../../../core/ecs/SystemScheduler.ts';
import { HeatComponent } from '../ShipSystemComponents.ts';

export const HeatSystem: System = {
  name: 'HeatSystem',
  priority: SystemPriority.HEAT,

  update(world: World, dt: number): void {
    const entities = world.query(HeatComponent);

    for (let i = 0; i < entities.length; i++) {
      const entity = createEntityId(entities[i]!);
      const heat = world.getComponent(entity, HeatComponent)!;

      // Consume accumulated weapon heat from CombatSystem
      heat.heat += heat.weaponHeatAccum;
      heat.weaponHeatAccum = 0;

      // Passive dissipation
      heat.heat -= heat.dissipationRate * dt;
      if (heat.heat < 0) heat.heat = 0;

      // Overheat trigger
      if (!heat.isOverheated && heat.heat >= heat.maxHeat) {
        heat.isOverheated = true;
        heat.overheatTimer = heat.overheatDuration;
      }

      // Overheat recovery
      if (heat.isOverheated) {
        heat.overheatTimer -= dt;
        if (heat.overheatTimer <= 0) {
          heat.isOverheated = false;
          heat.overheatTimer = 0;
          heat.heat = heat.maxHeat * 0.5;
        }
      }
    }
  },
};

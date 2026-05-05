import type { World } from '../../../core/ecs/World.ts';
import type { System } from '../../../core/ecs/types.ts';
import { createEntityId } from '../../../core/ecs/types.ts';
import { SystemPriority } from '../../../core/ecs/SystemScheduler.ts';
import { FuelComponent } from '../ShipSystemComponents.ts';
import { globalBus, ShipEvent } from '../../../core/network/MessageBus.ts';
import type { FuelEmptyEvent } from '../../../core/network/MessageBus.ts';

export const FuelSystem: System = {
  name: 'FuelSystem',
  priority: SystemPriority.FUEL,

  update(world: World, dt: number): void {
    const entities = world.query(FuelComponent);

    for (let i = 0; i < entities.length; i++) {
      const entity = createEntityId(entities[i]!);
      const fuel = world.getComponent(entity, FuelComponent)!;

      const wasEmpty = fuel.fuel <= 0;

      // Passive consumption
      fuel.fuel -= fuel.consumptionRate * dt;

      // Clamp
      if (fuel.fuel < 0) fuel.fuel = 0;
      if (fuel.fuel > fuel.maxFuel) fuel.fuel = fuel.maxFuel;

      // Emit once when hitting empty
      if (!wasEmpty && fuel.fuel <= 0) {
        globalBus.emit<FuelEmptyEvent>(ShipEvent.FUEL_EMPTY, { entity });
      }
    }
  },
};

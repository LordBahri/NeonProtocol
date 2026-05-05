import type { World } from '../../../core/ecs/World.ts';
import type { System } from '../../../core/ecs/types.ts';
import { createEntityId } from '../../../core/ecs/types.ts';
import { SystemPriority } from '../../../core/ecs/SystemScheduler.ts';
import { TransformComponent, PlayerInputComponent } from '../ShipComponents.ts';
import { MiningComponent } from '../ShipSystemComponents.ts';
import { globalBus, ShipEvent } from '../../../core/network/MessageBus.ts';
import type { OreCollectedEvent } from '../../../core/network/MessageBus.ts';
import { INVALID_ENTITY } from '../../../core/ecs/types.ts';

export const MiningSystem: System = {
  name: 'MiningSystem',
  priority: SystemPriority.MINING,

  update(world: World, dt: number): void {
    const entities = world.query(TransformComponent, MiningComponent);

    for (let i = 0; i < entities.length; i++) {
      const entity  = createEntityId(entities[i]!);
      const mining  = world.getComponent(entity, MiningComponent)!;
      const pos     = world.getComponent(entity, TransformComponent)!;
      const input   = world.getComponent(entity, PlayerInputComponent);

      // Player can toggle laser via input
      if (input) {
        const wantFire = (input as { fire?: boolean }).fire === true;
        if (!wantFire) mining.laserActive = false;
      }

      if (!mining.laserActive) continue;
      if (mining.targetEntityId === INVALID_ENTITY) continue;

      const target = mining.targetEntityId;
      if (!world.isAlive(target)) {
        mining.laserActive    = false;
        mining.targetEntityId = INVALID_ENTITY;
        continue;
      }

      const targetTransform = world.getComponent(target, TransformComponent);
      if (!targetTransform) continue;

      const dx   = targetTransform.x - pos.x;
      const dy   = targetTransform.y - pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > mining.miningRange) {
        mining.laserActive = false;
        continue;
      }

      mining.oreBuffer += mining.extractionRate * dt;

      if (mining.oreBuffer >= mining.oreThreshold) {
        const amount = mining.oreBuffer;
        mining.oreBuffer = 0;
        globalBus.emit<OreCollectedEvent>(ShipEvent.ORE_COLLECTED, { entity, amount });
      }
    }
  },
};

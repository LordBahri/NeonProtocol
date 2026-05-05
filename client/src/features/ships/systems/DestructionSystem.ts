import type { World } from '../../../core/ecs/World.ts';
import type { System } from '../../../core/ecs/types.ts';
import { createEntityId } from '../../../core/ecs/types.ts';
import { SystemPriority } from '../../../core/ecs/SystemScheduler.ts';
import { TransformComponent, ShipStatsComponent, VisualComponent } from '../ShipComponents.ts';
import { DestructionComponent, WreckComponent } from '../ShipSystemComponents.ts';
import { globalBus, ShipEvent } from '../../../core/network/MessageBus.ts';
import type { ShipLifecycleEvent } from '../../../core/network/MessageBus.ts';

export const DestructionSystem: System = {
  name: 'DestructionSystem',
  priority: SystemPriority.DESTRUCTION,

  update(world: World, dt: number): void {
    const entities   = world.query(DestructionComponent, ShipStatsComponent, TransformComponent);
    const toDestroy: ReturnType<typeof createEntityId>[] = [];

    for (let i = 0; i < entities.length; i++) {
      const entity      = createEntityId(entities[i]!);
      const dest        = world.getComponent(entity, DestructionComponent)!;
      const stats       = world.getComponent(entity, ShipStatsComponent)!;
      const transform   = world.getComponent(entity, TransformComponent)!;

      switch (dest.state) {
        case 'alive':
          // Breach check handled by ShieldArmorSystem; do nothing here
          break;

        case 'breached': {
          dest.stateTimer += dt;

          if (!dest.broadcastedBreached) {
            dest.broadcastedBreached = true;
            globalBus.emit<ShipLifecycleEvent>(ShipEvent.HULL_BREACHED, {
              entity, x: transform.x, y: transform.y,
            });
          }

          // Cascade: random subsystem heat spikes
          if (Math.random() < 0.02) {
            stats.hull = Math.max(0, stats.hull - 0.5);
          }

          if (stats.hull <= 0 || dest.stateTimer > 8.0) {
            dest.state      = 'exploding';
            dest.stateTimer = 0;
          }
          break;
        }

        case 'exploding': {
          dest.stateTimer += dt;

          if (!dest.broadcastedExploding) {
            dest.broadcastedExploding = true;
            globalBus.emit<ShipLifecycleEvent>(ShipEvent.SHIP_EXPLODING, {
              entity, x: transform.x, y: transform.y,
            });
          }

          if (dest.stateTimer >= dest.explodeDuration) {
            dest.state      = 'dead';
            dest.stateTimer = 0;
          }
          break;
        }

        case 'dead': {
          if (!dest.broadcastedDead) {
            dest.broadcastedDead = true;
            globalBus.emit<ShipLifecycleEvent>(ShipEvent.SHIP_DEAD, {
              entity, x: transform.x, y: transform.y,
            });

            // Spawn wreck entity
            const wreck = world.createEntity();
            world.addComponent(wreck, TransformComponent, {
              x: transform.x, y: transform.y,
              prevX: transform.x, prevY: transform.y,
              angle: transform.angle, prevAngle: transform.angle,
            });
            world.addComponent(wreck, VisualComponent, {
              spriteKey: 'wreck',
              scale: 1,
              engineGlowIntensity: 0,
              shieldGlowAlpha: 1,
              damageFlashTimer: 0,
            });
            world.addComponent(wreck, WreckComponent, { debrisCount: 6, fadeAfter: 14.0 });
          }

          toDestroy.push(entity);
          break;
        }
      }
    }

    // Safe to destroy after iteration
    for (const entity of toDestroy) {
      world.destroyEntity(entity);
    }
  },
};

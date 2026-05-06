import type { World } from '../../../core/ecs/World.ts';
import type { System } from '../../../core/ecs/types.ts';
import { createEntityId } from '../../../core/ecs/types.ts';
import { SystemPriority } from '../../../core/ecs/SystemScheduler.ts';
import { TransformComponent, VelocityComponent, VisualComponent } from '../ShipComponents.ts';
import { WreckComponent, PhysicsComponent } from '../ShipSystemComponents.ts';

export const WreckSystem: System = {
  name: 'WreckSystem',
  priority: SystemPriority.WRECK,

  update(world: World, dt: number): void {
    const entities  = world.query(WreckComponent, TransformComponent, VisualComponent);
    const toDestroy: ReturnType<typeof createEntityId>[] = [];

    for (let i = 0; i < entities.length; i++) {
      const entity  = createEntityId(entities[i]!);
      const wreck   = world.getComponent(entity, WreckComponent)!;
      const visual  = world.getComponent(entity, VisualComponent)!;

      // Spawn debris on first tick
      if (!wreck.hasSpawnedDebris) {
        wreck.hasSpawnedDebris = true;
        const transform = world.getComponent(entity, TransformComponent)!;

        for (let d = 0; d < wreck.debrisCount; d++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 20 + Math.random() * 80;
          const debris = world.createEntity();

          world.addComponent(debris, TransformComponent, {
            x: transform.x + Math.cos(angle) * 8,
            y: transform.y + Math.sin(angle) * 8,
            prevX: transform.x, prevY: transform.y,
            angle: Math.random() * Math.PI * 2,
            prevAngle: 0,
          });
          world.addComponent(debris, VelocityComponent, {
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            angularVelocity: (Math.random() - 0.5) * 3,
          });
          world.addComponent(debris, PhysicsComponent, {
            thrustPower: 0,
            reverseThrustFraction: 0,
            torquePower: 0,
            momentOfInertia: 0.3,
            linearDamping: 0.02,
            angularDamping: 0.04,
            boostMultiplier: 1,
            boostFuelCost: 0,
            warpCharging: false,
          });
          world.addComponent(debris, VisualComponent, {
            spriteKey: 'debris',
            scale: 0.3 + Math.random() * 0.4,
            engineGlowIntensity: 0,
            shieldGlowAlpha: 1,
            damageFlashTimer: 0,
          });

          wreck.debrisEntityIds.push(debris as number);
        }
      }

      // Age and fade
      wreck.age += dt;
      const frac = Math.max(0, 1 - wreck.age / wreck.fadeAfter);
      visual.shieldGlowAlpha = frac;

      if (frac <= 0) {
        // Destroy debris
        for (const debrisId of wreck.debrisEntityIds) {
          const debrisEntity = createEntityId(debrisId);
          if (world.isAlive(debrisEntity)) world.destroyEntity(debrisEntity);
        }
        toDestroy.push(entity);
      }
    }

    for (const entity of toDestroy) {
      world.destroyEntity(entity);
    }
  },
};

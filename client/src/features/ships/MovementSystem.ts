import type { World } from '../../core/ecs/World.ts';
import type { System } from '../../core/ecs/types.ts';
import { createEntityId } from '../../core/ecs/types.ts';
import { SystemPriority } from '../../core/ecs/SystemScheduler.ts';
import {
  TransformComponent,
  VelocityComponent,
  ThrustComponent,
  PlayerInputComponent,
} from './ShipComponents.ts';

const TWO_PI = Math.PI * 2;

export const MovementSystem: System = {
  name: 'MovementSystem',
  priority: SystemPriority.MOVEMENT,

  update(world: World, dt: number): void {
    const entities = world.query(TransformComponent, VelocityComponent, ThrustComponent);

    for (let i = 0; i < entities.length; i++) {
      const entity = createEntityId(entities[i]!);
      const transform = world.getComponent(entity, TransformComponent)!;
      const velocity = world.getComponent(entity, VelocityComponent)!;
      const thrust = world.getComponent(entity, ThrustComponent)!;

      const input = world.getComponent(entity, PlayerInputComponent);

      transform.prevX = transform.x;
      transform.prevY = transform.y;
      transform.prevAngle = transform.angle;

      if (input) {
        if (input.rotateLeft) transform.angle -= thrust.rotationSpeed * dt;
        if (input.rotateRight) transform.angle += thrust.rotationSpeed * dt;

        const ax = Math.cos(transform.angle);
        const ay = Math.sin(transform.angle);

        if (input.thrustForward) {
          velocity.vx += ax * thrust.acceleration * dt;
          velocity.vy += ay * thrust.acceleration * dt;
        }
        if (input.thrustBack) {
          velocity.vx -= ax * thrust.acceleration * 0.5 * dt;
          velocity.vy -= ay * thrust.acceleration * 0.5 * dt;
        }
      }

      velocity.vx *= thrust.drag;
      velocity.vy *= thrust.drag;

      const speedSq = velocity.vx ** 2 + velocity.vy ** 2;
      if (speedSq > thrust.maxSpeed ** 2) {
        const scale = thrust.maxSpeed / Math.sqrt(speedSq);
        velocity.vx *= scale;
        velocity.vy *= scale;
      }

      transform.x += velocity.vx * dt;
      transform.y += velocity.vy * dt;

      transform.angle = ((transform.angle % TWO_PI) + TWO_PI) % TWO_PI;
    }
  },
};

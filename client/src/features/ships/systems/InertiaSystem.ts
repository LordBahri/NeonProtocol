import type { World } from '../../../core/ecs/World.ts';
import type { System } from '../../../core/ecs/types.ts';
import { createEntityId } from '../../../core/ecs/types.ts';
import { SystemPriority } from '../../../core/ecs/SystemScheduler.ts';
import {
  TransformComponent,
  VelocityComponent,
  PlayerInputComponent,
} from '../ShipComponents.ts';
import { PhysicsComponent } from '../ShipSystemComponents.ts';
import { FuelComponent } from '../ShipSystemComponents.ts';
import { HeatComponent } from '../ShipSystemComponents.ts';

const TWO_PI = Math.PI * 2;

/**
 * True Newtonian physics integrator. Replaces MovementSystem.
 *
 * Angular: torque → angular velocity (with inertia), then exponential angular drag.
 * Linear: thrust force / mass → velocity, then exponential linear drag.
 * Boost: multiplies thrust; consumes fuel.
 * Overheat / warp-charging: suppresses all thrust input.
 */
export const InertiaSystem: System = {
  name: 'InertiaSystem',
  priority: SystemPriority.MOVEMENT,

  update(world: World, dt: number): void {
    const entities = world.query(TransformComponent, VelocityComponent, PhysicsComponent);

    for (let i = 0; i < entities.length; i++) {
      const entity = createEntityId(entities[i]!);

      const transform = world.getComponent(entity, TransformComponent)!;
      const velocity  = world.getComponent(entity, VelocityComponent)!;
      const physics   = world.getComponent(entity, PhysicsComponent)!;
      const input     = world.getComponent(entity, PlayerInputComponent);
      const fuel      = world.getComponent(entity, FuelComponent);
      const heat      = world.getComponent(entity, HeatComponent);

      // Preserve previous state for render interpolation
      transform.prevX     = transform.x;
      transform.prevY     = transform.y;
      transform.prevAngle = transform.angle;

      const suppressed = physics.warpCharging || (heat?.isOverheated ?? false);

      if (input && !suppressed) {
        // ── Angular inertia ──
        const angularAccel = physics.torquePower / physics.momentOfInertia;
        if (input.rotateLeft)  velocity.angularVelocity -= angularAccel * dt;
        if (input.rotateRight) velocity.angularVelocity += angularAccel * dt;

        // ── Linear thrust ──
        const boosting = (input as { boost?: boolean }).boost === true
          && (fuel ? fuel.fuel > 0 : false);

        const thrustMultiplier = boosting ? physics.boostMultiplier : 1.0;

        const fwd = input.thrustForward  ? physics.thrustPower * thrustMultiplier : 0;
        const rev = input.thrustBack     ? physics.thrustPower * physics.reverseThrustFraction * thrustMultiplier : 0;

        const netForce = fwd - rev;
        const ax = Math.cos(transform.angle) * netForce / (physics.momentOfInertia * 2 + 0.5);
        const ay = Math.sin(transform.angle) * netForce / (physics.momentOfInertia * 2 + 0.5);

        velocity.vx += ax * dt;
        velocity.vy += ay * dt;

        // Boost fuel drain
        if (boosting && fuel) {
          fuel.fuel = Math.max(0, fuel.fuel - physics.boostFuelCost * dt);
        }

        // Thrust heat generation
        if (heat && netForce !== 0) {
          heat.heat += heat.thrustHeatRate * Math.abs(netForce / physics.thrustPower) * dt;
        }
      }

      // ── Exponential drag (frame-rate independent) ──
      const linDecay = Math.pow(1.0 - physics.linearDamping, dt);
      const angDecay = Math.pow(1.0 - physics.angularDamping, dt);

      velocity.vx               *= linDecay;
      velocity.vy               *= linDecay;
      velocity.angularVelocity  *= angDecay;

      // ── Integrate ──
      transform.x     += velocity.vx              * dt;
      transform.y     += velocity.vy              * dt;
      transform.angle += velocity.angularVelocity * dt;

      // Wrap angle
      transform.angle = ((transform.angle % TWO_PI) + TWO_PI) % TWO_PI;
    }
  },
};

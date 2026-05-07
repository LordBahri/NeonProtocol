import type { World }  from '../../core/ecs/World.ts';
import type { System } from '../../core/ecs/types.ts';
import { createEntityId } from '../../core/ecs/types.ts';
import { SystemPriority } from '../../core/ecs/SystemScheduler.ts';
import {
  TransformComponent,
  VelocityComponent,
  ThrustComponent,
  PlayerInputComponent,
} from './ShipComponents.ts';
import { useGameStore } from '../../store/gameStore.ts';

const TWO_PI       = Math.PI * 2;
const DEG5_RAD     = 5 * (Math.PI / 180);
const ARRIVAL_DIST = 80;   // px — begin braking inside this radius
const STOP_DIST    = 12;   // px — clear nav target when this close

function shortestAngle(from: number, to: number): number {
  let d = ((to - from) % TWO_PI + TWO_PI) % TWO_PI;
  if (d > Math.PI) d -= TWO_PI;
  return d;
}

export const NavigationSystem: System = {
  name: 'NavigationSystem',
  priority: SystemPriority.MOVEMENT + 1,   // runs just after MovementSystem

  update(world: World, dt: number): void {
    const entities = world.query(
      TransformComponent, VelocityComponent, ThrustComponent, PlayerInputComponent,
    );

    for (let i = 0; i < entities.length; i++) {
      const entity    = createEntityId(entities[i]!);
      const input     = world.getComponent(entity, PlayerInputComponent)!;
      if (!input.hasNavTarget) continue;

      const transform = world.getComponent(entity, TransformComponent)!;
      const velocity  = world.getComponent(entity, VelocityComponent)!;
      const thrust    = world.getComponent(entity, ThrustComponent)!;

      const dx   = input.navTargetX - transform.x;
      const dy   = input.navTargetY - transform.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Arrived — stop and clear target
      if (dist < STOP_DIST) {
        velocity.vx = 0;
        velocity.vy = 0;
        useGameStore.getState().clearNavigationTarget();
        input.hasNavTarget = false;
        continue;
      }

      const desiredAngle = Math.atan2(dy, dx);
      const angleError   = shortestAngle(transform.angle, desiredAngle);

      // ── Rotate toward target ───────────────────────────────────────────────
      const rotStep = thrust.rotationSpeed * dt;
      if (Math.abs(angleError) > rotStep) {
        transform.angle += Math.sign(angleError) * rotStep;
      } else {
        transform.angle = desiredAngle;
      }
      transform.angle = ((transform.angle % TWO_PI) + TWO_PI) % TWO_PI;

      // ── Thrust only when facing target within 5° ───────────────────────────
      if (Math.abs(angleError) < DEG5_RAD) {
        const brakeScale = dist < ARRIVAL_DIST ? dist / ARRIVAL_DIST : 1.0;
        const accel      = thrust.acceleration * brakeScale;
        const ax         = Math.cos(transform.angle);
        const ay         = Math.sin(transform.angle);
        velocity.vx += ax * accel * dt;
        velocity.vy += ay * accel * dt;

        // Cap speed — scale down to arrival speed near target
        const maxSpd = thrust.maxSpeed * Math.max(brakeScale, 0.15);
        const speedSq = velocity.vx ** 2 + velocity.vy ** 2;
        if (speedSq > maxSpd * maxSpd) {
          const s = maxSpd / Math.sqrt(speedSq);
          velocity.vx *= s;
          velocity.vy *= s;
        }
      }
    }
  },
};

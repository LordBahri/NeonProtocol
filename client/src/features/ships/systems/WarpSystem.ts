import type { World } from '../../../core/ecs/World.ts';
import type { System } from '../../../core/ecs/types.ts';
import { createEntityId } from '../../../core/ecs/types.ts';
import { SystemPriority } from '../../../core/ecs/SystemScheduler.ts';
import { TransformComponent, VelocityComponent, PlayerInputComponent } from '../ShipComponents.ts';
import { WarpDriveComponent, PhysicsComponent } from '../ShipSystemComponents.ts';
import { globalBus, ShipEvent } from '../../../core/network/MessageBus.ts';
import type { WarpJumpedEvent } from '../../../core/network/MessageBus.ts';

/**
 * Four-state FSM: idle → charging → jumping → cooldown → idle.
 *
 * Destination is set to `warpRange` units ahead in the facing direction.
 * The jump is instantaneous (single frame snap); the jump duration is 1 tick.
 */
export const WarpSystem: System = {
  name: 'WarpSystem',
  priority: SystemPriority.WARP,

  update(world: World, dt: number): void {
    const entities = world.query(WarpDriveComponent, TransformComponent);

    for (let i = 0; i < entities.length; i++) {
      const entity    = createEntityId(entities[i]!);
      const warp      = world.getComponent(entity, WarpDriveComponent)!;
      const transform = world.getComponent(entity, TransformComponent)!;
      const input     = world.getComponent(entity, PlayerInputComponent);
      const physics   = world.getComponent(entity, PhysicsComponent);
      const velocity  = world.getComponent(entity, VelocityComponent);

      switch (warp.state) {
        case 'idle': {
          const wantWarp = (input as { activateWarp?: boolean } | undefined)?.activateWarp === true;
          if (wantWarp) {
            // Project destination in facing direction
            const dist = Math.min(warp.warpRange, warp.warpRange);
            warp.destinationX = transform.x + Math.cos(transform.angle) * dist;
            warp.destinationY = transform.y + Math.sin(transform.angle) * dist;
            warp.chargeTimer  = 0;
            warp.state        = 'charging';
            if (physics) physics.warpCharging = true;
          }
          break;
        }

        case 'charging': {
          warp.chargeTimer += dt;
          if (warp.chargeTimer >= warp.chargeRequired) {
            const fromX = transform.x;
            const fromY = transform.y;

            // Snap to destination
            transform.x     = warp.destinationX;
            transform.y     = warp.destinationY;
            transform.prevX = warp.destinationX;
            transform.prevY = warp.destinationY;

            // Kill velocity on jump
            if (velocity) {
              velocity.vx = 0;
              velocity.vy = 0;
              velocity.angularVelocity = 0;
            }

            globalBus.emit<WarpJumpedEvent>(ShipEvent.WARP_JUMPED, {
              entity,
              fromX,
              fromY,
              toX: warp.destinationX,
              toY: warp.destinationY,
            });

            warp.jumpTimer = 0;
            warp.state     = 'jumping';
          }
          break;
        }

        case 'jumping': {
          // One-frame transition
          warp.jumpTimer += dt;
          if (warp.jumpTimer >= 0.05) {
            warp.cooldownTimer = 0;
            warp.state         = 'cooldown';
            if (physics) physics.warpCharging = false;
          }
          break;
        }

        case 'cooldown': {
          warp.cooldownTimer += dt;
          if (warp.cooldownTimer >= warp.cooldownDuration) {
            warp.cooldownTimer = 0;
            warp.state         = 'idle';
          }
          break;
        }
      }
    }
  },
};

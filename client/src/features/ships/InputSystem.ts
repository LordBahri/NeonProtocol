import type { World }   from '../../core/ecs/World.ts';
import type { System }  from '../../core/ecs/types.ts';
import { createEntityId } from '../../core/ecs/types.ts';
import { SystemPriority } from '../../core/ecs/SystemScheduler.ts';
import { PlayerInputComponent } from './ShipComponents.ts';
import { engine }         from '../../Engine.ts';

/**
 * Reads from Engine's ActionMap (which is updated by InputManager each frame)
 * and writes into ECS PlayerInput components.
 */
export const InputSystem: System = {
  name: 'InputSystem',
  priority: SystemPriority.INPUT,

  update(world: World, _dt: number): void {
    const actions  = engine.actions;
    const entities = world.query(PlayerInputComponent);

    for (let i = 0; i < entities.length; i++) {
      const entity = createEntityId(entities[i]!);
      const comp   = world.getComponent(entity, PlayerInputComponent)!;

      comp.thrustForward = actions.isHeld('THRUST_FORWARD');
      comp.thrustBack    = actions.isHeld('THRUST_BACK');
      comp.rotateLeft    = actions.isHeld('ROTATE_LEFT');
      comp.rotateRight   = actions.isHeld('ROTATE_RIGHT');
      comp.fire          = actions.isHeld('FIRE_PRIMARY');

      // World-space mouse target for weapon aiming
      comp.targetX = engine.input.mouse.worldX;
      comp.targetY = engine.input.mouse.worldY;
    }
  },
};

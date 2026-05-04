import type { World } from '../../core/ecs/World.ts';
import type { System } from '../../core/ecs/types.ts';
import { createEntityId } from '../../core/ecs/types.ts';
import { SystemPriority } from '../../core/ecs/SystemScheduler.ts';
import { PlayerInputComponent } from './ShipComponents.ts';

interface KeyState {
  pressed: Set<string>;
}

const keyState: KeyState = { pressed: new Set() };

export function initInputListeners(): () => void {
  const onKeyDown = (e: KeyboardEvent) => {
    keyState.pressed.add(e.code);
    e.preventDefault();
  };
  const onKeyUp = (e: KeyboardEvent) => {
    keyState.pressed.delete(e.code);
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  return () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
  };
}

export const InputSystem: System = {
  name: 'InputSystem',
  priority: SystemPriority.INPUT,

  update(world: World, _dt: number): void {
    const entities = world.query(PlayerInputComponent);

    for (let i = 0; i < entities.length; i++) {
      const entity = createEntityId(entities[i]!);
      const input = world.getComponent(entity, PlayerInputComponent)!;

      input.thrustForward = keyState.pressed.has('KeyW') || keyState.pressed.has('ArrowUp');
      input.thrustBack = keyState.pressed.has('KeyS') || keyState.pressed.has('ArrowDown');
      input.rotateLeft = keyState.pressed.has('KeyA') || keyState.pressed.has('ArrowLeft');
      input.rotateRight = keyState.pressed.has('KeyD') || keyState.pressed.has('ArrowRight');
      input.fire = keyState.pressed.has('Space');
    }
  },
};

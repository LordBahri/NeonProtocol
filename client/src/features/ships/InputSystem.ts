import type { World }   from '../../core/ecs/World.ts';
import type { System }  from '../../core/ecs/types.ts';
import { createEntityId } from '../../core/ecs/types.ts';
import { SystemPriority } from '../../core/ecs/SystemScheduler.ts';
import { PlayerInputComponent } from './ShipComponents.ts';
import { engine }         from '../../Engine.ts';
import { useGameStore }   from '../../store/gameStore.ts';
import { InputEvent }     from '../../core/input/InputManager.ts';
import { globalBus }      from '../../core/network/MessageBus.ts';

// Suppress browser right-click context menu on the canvas.
let _contextMenuBlocked = false;
function blockContextMenu(): void {
  if (_contextMenuBlocked) return;
  _contextMenuBlocked = true;
  const canvas = engine.pipeline.app.canvas as HTMLCanvasElement;
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

// Listen for right-click and store nav target in game store.
let _navListenerAttached = false;
function attachNavListener(): void {
  if (_navListenerAttached) return;
  _navListenerAttached = true;
  globalBus.on(InputEvent.MOUSE_DOWN, (data: unknown) => {
    const { button } = data as { button: number };
    if (button !== 2) return;
    const { worldX, worldY } = engine.input.mouse;
    useGameStore.getState().setNavigationTarget(worldX, worldY);
  });
}

/**
 * Reads from Engine's ActionMap (which is updated by InputManager each frame)
 * and writes into ECS PlayerInput components.
 */
export const InputSystem: System = {
  name: 'InputSystem',
  priority: SystemPriority.INPUT,

  update(world: World, _dt: number): void {
    blockContextMenu();
    attachNavListener();

    const actions  = engine.actions;
    const navState = useGameStore.getState();
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

      // Point-and-click navigation target (right-click)
      const nav = navState.navigationTarget;
      if (nav) {
        comp.hasNavTarget = true;
        comp.navTargetX   = nav.x;
        comp.navTargetY   = nav.y;
      } else {
        comp.hasNavTarget = false;
      }
    }
  },
};

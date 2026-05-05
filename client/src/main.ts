import { gsap }   from 'gsap';
import { engine } from './Engine.ts';
import { CoreBundle, SpaceBundle, ShipBundle, AudioBundle } from './core/assets/AssetBundle.ts';
import { SystemScheduler, SystemPriority } from './core/ecs/SystemScheduler.ts';
import { InputSystem }         from './features/ships/InputSystem.ts';
import { MovementSystem }      from './features/ships/MovementSystem.ts';
import { CombatSystem }        from './features/combat/CombatSystem.ts';
import { ShieldRechargeSystem }from './features/combat/ShieldRechargeSystem.ts';
import { GameScene }           from './scenes/GameScene.ts';

// ── GSAP defaults ─────────────────────────────────────────────────────────────
gsap.defaults({ ease: 'power2.out' });

// ── Default action bindings ───────────────────────────────────────────────────
function registerDefaultActions(): void {
  engine.actions.defineMany({
    THRUST_FORWARD:  { keys: ['KeyW', 'ArrowUp'] },
    THRUST_BACK:     { keys: ['KeyS', 'ArrowDown'] },
    ROTATE_LEFT:     { keys: ['KeyA', 'ArrowLeft'] },
    ROTATE_RIGHT:    { keys: ['KeyD', 'ArrowRight'] },
    FIRE_PRIMARY:    { keys: ['Space', 'MouseButton0'] },
    FIRE_SECONDARY:  { keys: ['KeyE', 'MouseButton2'] },
    TARGET_NEAREST:  { keys: ['KeyT'] },
    MAP_TOGGLE:      { keys: ['KeyM'] },
    BOOST:           { keys: ['ShiftLeft', 'ShiftRight'],
                       gamepadButtons: [10] },
    PAUSE:           { keys: ['Escape'],
                       gamepadButtons: [9] },
  });
}

// ── Simulation systems ────────────────────────────────────────────────────────
function registerSystems(): void {
  engine.scheduler.registerGroup('simulation',
    InputSystem,
    MovementSystem,
    CombatSystem,
    ShieldRechargeSystem,
  );
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
async function bootstrap(): Promise<void> {
  const canvas  = document.getElementById('game-canvas')  as HTMLCanvasElement;
  const uiLayer = document.getElementById('ui-layer')     as HTMLElement;

  if (!canvas || !uiLayer) {
    showFatalError('DOM elements #game-canvas / #ui-layer not found');
    return;
  }

  try {
    await engine.init({
      canvas,
      uiLayer,
      simulationHz:  60,
      bloom:         true,
      bloomStrength: 0.45,
    });

    registerDefaultActions();
    registerSystems();

    // Load assets (non-blocking progress bar can go here)
    await engine.loadBundles(
      [CoreBundle, SpaceBundle, ShipBundle, AudioBundle],
      (progress) => { /* TODO: show loading bar progress * 100 */ void progress; },
    );

    await engine.switchScene(new GameScene(), { transition: 'none' });

    engine.start();

    // Expose on window for dev console
    (window as unknown as Record<string, unknown>).__engine = engine;
    console.log('[NeonProtocol] Engine running');

  } catch (err) {
    console.error('[NeonProtocol] Fatal init error:', err);
    showFatalError(err);
  }
}

function showFatalError(err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  const div = document.createElement('div');
  div.style.cssText = `
    position:fixed; inset:0; display:flex; align-items:center;
    justify-content:center; background:#000008; color:#ff2200;
    font-family:'Courier New',monospace; font-size:14px; text-align:center; padding:32px;
  `;
  div.textContent = `SYSTEM FAILURE: ${msg}`;
  document.body.appendChild(div);
}

bootstrap();

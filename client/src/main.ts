import { gsap }   from 'gsap';
import { engine } from './Engine.ts';
import { CoreBundle, SpaceBundle, ShipBundle, AudioBundle } from './core/assets/AssetBundle.ts';
import { SystemScheduler } from './core/ecs/SystemScheduler.ts';
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

// ── Boot diagnostic overlay ───────────────────────────────────────────────────
function createBootStatus(): (msg: string, done?: boolean) => void {
  const el = document.createElement('div');
  el.style.cssText = `
    position:fixed;top:12px;left:12px;z-index:99999;
    font-family:'Courier New',monospace;font-size:12px;
    color:#00ffcc;text-shadow:0 0 6px #00ffcc;
    background:rgba(0,0,0,0.8);padding:8px 12px;
    border:1px solid #004444;pointer-events:none;
    white-space:pre-line;max-width:500px;
  `;
  document.body.appendChild(el);
  const lines: string[] = [];
  return (msg: string, done = false) => {
    lines.push((done ? '[OK] ' : '[..] ') + msg);
    el.textContent = lines.join('\n');
    if (done && msg.includes('started')) {
      setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 3000);
    }
  };
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
async function bootstrap(): Promise<void> {
  const status = createBootStatus();
  status('Booting NeonProtocol...');

  const canvas  = document.getElementById('game-canvas')  as HTMLCanvasElement;
  const uiLayer = document.getElementById('ui-layer')     as HTMLElement;

  if (!canvas || !uiLayer) {
    showFatalError('DOM elements #game-canvas / #ui-layer not found');
    return;
  }
  status('DOM: canvas=' + (canvas ? 'OK' : 'MISSING') + ' uiLayer=' + (uiLayer ? 'OK' : 'MISSING'), true);

  try {
    status('engine.init()...');
    await engine.init({
      canvas,
      uiLayer,
      simulationHz:  60,
      bloom:         true,
      bloomStrength: 0.45,
    });
    status('engine.init() complete', true);

    registerDefaultActions();
    registerSystems();
    status('systems registered', true);

    status('loading assets...');
    await engine.loadBundles(
      [CoreBundle, SpaceBundle, ShipBundle, AudioBundle],
      (progress) => { void progress; },
    );
    status('assets loaded', true);

    status('switchScene(GameScene)...');
    await engine.switchScene(new GameScene(), { transition: 'none' });
    status('scene loaded, entities: ' + String(engine.world.entityCount), true);

    engine.start();
    status('engine started', true);

    (window as unknown as Record<string, unknown>).__engine = engine;
    console.log('[NeonProtocol] Engine running');

  } catch (err) {
    console.error('[NeonProtocol] Fatal init error:', err);
    const msg = err instanceof Error ? err.stack ?? err.message : String(err);
    status('FATAL: ' + msg, true);
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

void bootstrap();

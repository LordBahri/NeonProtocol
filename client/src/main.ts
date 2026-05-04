import { gsap } from 'gsap';
import { GameContext } from './GameContext.ts';

gsap.defaults({ ease: 'power2.out' });

async function bootstrap(): Promise<void> {
  const ctx = new GameContext();

  try {
    await ctx.init();
    (window as unknown as Record<string, unknown>).__gameContext = ctx;
    console.log('[NeonProtocol] Engine initialized successfully');
  } catch (err) {
    console.error('[NeonProtocol] Initialization failed:', err);
    showFatalError(err);
  }
}

function showFatalError(err: unknown): void {
  const div = document.createElement('div');
  div.style.cssText = `
    position: fixed; inset: 0;
    display: flex; align-items: center; justify-content: center;
    background: #000008;
    color: #ff2200;
    font-family: 'Courier New', monospace;
    font-size: 14px;
    text-align: center;
    padding: 32px;
  `;
  div.textContent = `SYSTEM FAILURE: ${err instanceof Error ? err.message : String(err)}`;
  document.body.appendChild(div);
}

bootstrap();

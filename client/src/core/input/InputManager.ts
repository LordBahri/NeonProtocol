import { ActionMap } from './ActionMap.ts';
import { globalBus } from '../network/MessageBus.ts';

export const InputEvent = {
  KEY_DOWN:     'input:key_down',
  KEY_UP:       'input:key_up',
  MOUSE_MOVE:   'input:mouse_move',
  MOUSE_DOWN:   'input:mouse_down',
  MOUSE_UP:     'input:mouse_up',
  WHEEL:        'input:wheel',
  GAMEPAD_CONNECTED:    'input:gamepad_connected',
  GAMEPAD_DISCONNECTED: 'input:gamepad_disconnected',
} as const;

export interface MouseState {
  /** Screen-space position */
  x: number;
  y: number;
  /** World-space position (set externally via setWorldMouse) */
  worldX: number;
  worldY: number;
  buttons: boolean[];
  wheel: number;
}

export class InputManager {
  readonly actions: ActionMap;

  private held     = new Set<string>();
  private pressed  = new Set<string>();
  private released = new Set<string>();

  private _mouse: MouseState = { x: 0, y: 0, worldX: 0, worldY: 0, buttons: [], wheel: 0 };
  private _axes  = new Map<string, number>();

  private activeGamepadIndex: number | null = null;
  private cleanupFns: Array<() => void> = [];
  private canvas: HTMLElement;

  constructor(canvas: HTMLElement, actions?: ActionMap) {
    this.canvas  = canvas;
    this.actions = actions ?? new ActionMap();
    this.attachListeners();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  get mouse(): Readonly<MouseState> { return this._mouse; }

  isKeyHeld(code: string):    boolean { return this.held.has(code); }
  isKeyPressed(code: string): boolean { return this.pressed.has(code); }

  setWorldMouse(worldX: number, worldY: number): void {
    this._mouse.worldX = worldX;
    this._mouse.worldY = worldY;
  }

  /** Must be called once per simulation tick (before systems run) */
  flush(): void {
    // Called after systems consume pressed/released — clear single-frame sets
    this.pressed.clear();
    this.released.clear();
    this._mouse.wheel = 0;
  }

  /** Must be called at the START of each tick to update ActionMap */
  update(): void {
    const gamepad = this.getActiveGamepad();
    this.actions.update(this.held, this.pressed, this.released, this._axes, gamepad);
  }

  // ── Listeners ──────────────────────────────────────────────────────────────

  private attachListeners(): void {
    const on = <K extends keyof HTMLElementEventMap>(
      el: HTMLElement | Window,
      type: K,
      fn: (e: HTMLElementEventMap[K]) => void,
      opts?: AddEventListenerOptions,
    ) => {
      (el as HTMLElement).addEventListener(type as string, fn as EventListener, opts);
      this.cleanupFns.push(() => (el as HTMLElement).removeEventListener(type as string, fn as EventListener));
    };

    on(window, 'keydown', (e: KeyboardEvent) => {
      if (!this.held.has(e.code)) this.pressed.add(e.code);
      this.held.add(e.code);
      globalBus.emit(InputEvent.KEY_DOWN, { code: e.code, key: e.key });
    });

    on(window, 'keyup', (e: KeyboardEvent) => {
      this.held.delete(e.code);
      this.released.add(e.code);
      globalBus.emit(InputEvent.KEY_UP, { code: e.code, key: e.key });
    });

    on(this.canvas, 'mousemove', (e: MouseEvent) => {
      this._mouse.x = e.clientX;
      this._mouse.y = e.clientY;
      globalBus.emit(InputEvent.MOUSE_MOVE, { x: e.clientX, y: e.clientY });
    });

    on(this.canvas, 'mousedown', (e: MouseEvent) => {
      this._mouse.buttons[e.button] = true;
      const code = `MouseButton${e.button}`;
      if (!this.held.has(code)) this.pressed.add(code);
      this.held.add(code);
      globalBus.emit(InputEvent.MOUSE_DOWN, { button: e.button, x: e.clientX, y: e.clientY });
    });

    on(window, 'mouseup', (e: MouseEvent) => {
      this._mouse.buttons[e.button] = false;
      const code = `MouseButton${e.button}`;
      this.held.delete(code);
      this.released.add(code);
      globalBus.emit(InputEvent.MOUSE_UP, { button: e.button, x: e.clientX, y: e.clientY });
    });

    on(this.canvas, 'wheel', (e: WheelEvent) => {
      this._mouse.wheel = e.deltaY;
      globalBus.emit(InputEvent.WHEEL, { delta: e.deltaY });
    }, { passive: true });

    // Gamepad
    const onGamepadConnected = (e: GamepadEvent) => {
      this.activeGamepadIndex = e.gamepad.index;
      globalBus.emit(InputEvent.GAMEPAD_CONNECTED, { index: e.gamepad.index, id: e.gamepad.id });
    };
    const onGamepadDisconnected = (e: GamepadEvent) => {
      if (this.activeGamepadIndex === e.gamepad.index) this.activeGamepadIndex = null;
      globalBus.emit(InputEvent.GAMEPAD_DISCONNECTED, { index: e.gamepad.index });
    };
    window.addEventListener('gamepadconnected',    onGamepadConnected);
    window.addEventListener('gamepaddisconnected', onGamepadDisconnected);
    this.cleanupFns.push(
      () => window.removeEventListener('gamepadconnected',    onGamepadConnected),
      () => window.removeEventListener('gamepaddisconnected', onGamepadDisconnected),
    );
  }

  private getActiveGamepad(): Gamepad | null {
    if (this.activeGamepadIndex === null) return null;
    return navigator.getGamepads?.()[this.activeGamepadIndex] ?? null;
  }

  destroy(): void {
    for (const fn of this.cleanupFns) fn();
    this.cleanupFns = [];
  }
}

export type PhysicalKey = string;  // KeyboardEvent.code or 'MouseButton0' etc.

export interface ActionBinding {
  keys: PhysicalKey[];
  gamepadButtons?: number[];
  gamepadAxes?: Array<{ axis: number; direction: 1 | -1; deadzone?: number }>;
}

export type ActionState = {
  pressed: boolean;
  held: boolean;
  released: boolean;
  value: number;
};

export class ActionMap {
  private bindings = new Map<string, ActionBinding>();
  private states    = new Map<string, ActionState>();

  define(action: string, binding: ActionBinding): void {
    this.bindings.set(action, binding);
    this.states.set(action, { pressed: false, held: false, released: false, value: 0 });
  }

  defineMany(defs: Record<string, ActionBinding>): void {
    for (const [action, binding] of Object.entries(defs)) this.define(action, binding);
  }

  /** Called by InputManager each tick with raw physical states */
  update(
    heldKeys: ReadonlySet<string>,
    pressedKeys: ReadonlySet<string>,
    releasedKeys: ReadonlySet<string>,
    _axes: ReadonlyMap<string, number>,
    gamepad: Gamepad | null,
  ): void {
    for (const [action, binding] of this.bindings) {
      const state = this.states.get(action)!;

      const keyHeld     = binding.keys.some(k => heldKeys.has(k));
      const keyPressed  = binding.keys.some(k => pressedKeys.has(k));
      const keyReleased = binding.keys.some(k => releasedKeys.has(k));

      let gpHeld    = false;
      let gpValue   = 0;

      if (gamepad) {
        if (binding.gamepadButtons) {
          gpHeld = binding.gamepadButtons.some(
            b => (gamepad.buttons[b]?.pressed) ?? false,
          );
        }
        if (binding.gamepadAxes) {
          for (const axisBinding of binding.gamepadAxes) {
            const raw = gamepad.axes[axisBinding.axis] ?? 0;
            const dz  = axisBinding.deadzone ?? 0.1;
            if (axisBinding.direction === 1  && raw > dz)  { gpHeld = true; gpValue = raw; }
            if (axisBinding.direction === -1 && raw < -dz) { gpHeld = true; gpValue = -raw; }
          }
        }
      }

      const anyHeld = keyHeld || gpHeld;
      state.pressed  = keyPressed  && !state.held;
      state.released = keyReleased && state.held;
      state.held     = anyHeld;
      state.value    = anyHeld ? Math.max(keyHeld ? 1 : 0, gpValue) : 0;
    }
  }

  get(action: string): Readonly<ActionState> {
    return this.states.get(action) ?? { pressed: false, held: false, released: false, value: 0 };
  }

  isHeld(action: string):    boolean { return this.get(action).held; }
  isPressed(action: string): boolean { return this.get(action).pressed; }
  isReleased(action: string):boolean { return this.get(action).released; }
  value(action: string):     number  { return this.get(action).value; }

  rebind(action: string, keys: PhysicalKey[]): void {
    const binding = this.bindings.get(action);
    if (binding) binding.keys = keys;
  }

  exportBindings(): Record<string, PhysicalKey[]> {
    const out: Record<string, PhysicalKey[]> = {};
    for (const [action, binding] of this.bindings) out[action] = [...binding.keys];
    return out;
  }

  importBindings(saved: Record<string, PhysicalKey[]>): void {
    for (const [action, keys] of Object.entries(saved)) this.rebind(action, keys);
  }
}

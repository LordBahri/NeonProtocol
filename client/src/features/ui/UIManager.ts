import { injectTheme } from './UITheme.ts';
import type { WindowBase } from './WindowBase.ts';

export class UIManager {
  private windows   = new Map<string, WindowBase>();
  private zStack:   string[] = [];
  private BASE_Z    = 200;
  private shortcuts = new Map<string, () => void>();
  private _parent:  HTMLElement;
  private _keyHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(parent: HTMLElement) {
    injectTheme();
    this._parent = parent;
    this._bindGlobalKeys();
  }

  // ── Window registry ─────────────────────────────────────────────────

  register(w: WindowBase): void {
    this.windows.set(w.id, w);
    w.mount(this._parent);
    if (w.shortcutKey) {
      this.shortcuts.set(w.shortcutKey, () => {
        w.toggle();
        if (w.visible) this.bringToFront(w.id);
      });
    }
  }

  unregister(id: string): void {
    this.windows.get(id)?.destroy();
    this.windows.delete(id);
    this.zStack = this.zStack.filter(i => i !== id);
  }

  bringToFront(id: string): void {
    this.zStack = this.zStack.filter(i => i !== id);
    this.zStack.push(id);
    this.zStack.forEach((wid, idx) => {
      this.windows.get(wid)?.bringToFront(this.BASE_Z + idx);
    });
  }

  show(id: string): void {
    const w = this.windows.get(id);
    if (w) { w.show(); this.bringToFront(id); }
  }

  hide(id: string):   void { this.windows.get(id)?.hide(); }
  toggle(id: string): void {
    const w = this.windows.get(id);
    if (!w) return;
    w.toggle();
    if (w.visible) this.bringToFront(id);
  }

  hideAll(): void { this.windows.forEach(w => w.hide()); }

  // ── Per-frame update ────────────────────────────────────────────────

  update(dt: number): void {
    this.windows.forEach(w => { if (w.visible) w.update(dt); });
  }

  // ── Keyboard shortcuts ──────────────────────────────────────────────

  /** Register an additional shortcut not tied to a window. */
  registerShortcut(code: string, cb: () => void): void {
    this.shortcuts.set(code, cb);
  }

  private _bindGlobalKeys(): void {
    this._keyHandler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const cb = this.shortcuts.get(e.code);
      if (cb) { cb(); e.preventDefault(); }
    };
    document.addEventListener('keydown', this._keyHandler);
  }

  destroy(): void {
    if (this._keyHandler) document.removeEventListener('keydown', this._keyHandler);
    this.windows.forEach(w => w.destroy());
    this.windows.clear();
  }
}

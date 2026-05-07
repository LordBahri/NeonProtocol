import { gsap } from 'gsap';
import { injectTheme } from './UITheme.ts';

export interface WindowConfig {
  id:          string;
  title:       string;
  width:       number;
  height:      number;
  x?:          number;
  y?:          number;
  shortcutKey?: string;
  onFocus?:    (id: string) => void;
}

export abstract class WindowBase {
  readonly id:           string;
  readonly shortcutKey:  string | undefined;
  protected el:          HTMLElement;
  protected titleEl:     HTMLElement;
  protected contentEl:   HTMLElement;

  private _visible  = false;
  private _dragging = false;
  private _dragOffX = 0;
  private _dragOffY = 0;
  private _minimised = false;
  private _savedH   = 0;
  private _onFocus: ((id: string) => void) | undefined;

  constructor(cfg: WindowConfig) {
    injectTheme();
    this.id          = cfg.id;
    this.shortcutKey = cfg.shortcutKey;
    this._onFocus    = cfg.onFocus;

    const x = cfg.x ?? Math.round((window.innerWidth  - cfg.width)  / 2);
    const y = cfg.y ?? Math.round((window.innerHeight - cfg.height) / 2);

    this.el = document.createElement('div');
    this.el.className = 'holo-window hidden';
    this.el.style.cssText = `width:${cfg.width}px;height:${cfg.height}px;left:${x}px;top:${y}px;z-index:200;`;

    // Corner chrome
    for (const c of ['tl','tr','bl','br']) {
      const d = document.createElement('div');
      d.className = `holo-corner-${c}`;
      this.el.appendChild(d);
    }
    // Static noise overlay
    const noise = document.createElement('div');
    noise.className = 'holo-static';
    this.el.appendChild(noise);

    // Title bar
    this.titleEl = document.createElement('div');
    this.titleEl.className = 'holo-titlebar';
    this.titleEl.innerHTML = `
      <span class="holo-titlebar-label">${cfg.title}</span>
      <div class="holo-btn-row">
        <div class="holo-wbtn min" title="Minimise">─</div>
        <div class="holo-wbtn close" title="Close [${cfg.shortcutKey ?? 'Esc'}]">✕</div>
      </div>`;
    this.el.appendChild(this.titleEl);

    // Content wrapper
    this.contentEl = document.createElement('div');
    this.contentEl.className = 'holo-content';
    this.contentEl.style.height = `calc(100% - 32px)`;
    this.el.appendChild(this.contentEl);

    this._bindDrag();
    this._bindButtons();
  }

  // ── Lifecycle ──────────────────────────────────────────────────────

  mount(parent: HTMLElement): void {
    parent.appendChild(this.el);
    this.build();
  }

  destroy(): void { this.el.remove(); }

  /** Subclasses fill contentEl here. */
  protected abstract build(): void;
  /** Called each render frame while visible. Default: no-op. */
  update(_dt: number): void {}

  // ── Visibility ─────────────────────────────────────────────────────

  show(): void {
    if (this._visible) { this._onFocus?.(this.id); return; }
    this._visible = true;
    this.el.classList.remove('hidden');
    gsap.fromTo(this.el,
      { opacity: 0, scale: 0.93, y: 10 },
      { opacity: 1, scale: 1,    y: 0,  duration: 0.20, ease: 'power2.out' },
    );
    this._onFocus?.(this.id);
    this.onShow();
  }

  hide(): void {
    if (!this._visible) return;
    this._visible = false;
    gsap.to(this.el, {
      opacity: 0, scale: 0.95, y: 6, duration: 0.16, ease: 'power2.in',
      onComplete: () => this.el.classList.add('hidden'),
    });
  }

  toggle(): void { if (this._visible) this.hide(); else this.show(); }

  get visible(): boolean { return this._visible; }

  bringToFront(z: number): void { this.el.style.zIndex = String(z); }

  /** Hook for subclasses: called after show animation starts. */
  protected onShow(): void {}

  // ── Drag ───────────────────────────────────────────────────────────

  private _bindDrag(): void {
    const onDown = (e: MouseEvent) => {
      if ((e.target as HTMLElement).classList.contains('holo-wbtn')) return;
      this._dragging = true;
      this._dragOffX = e.clientX - this.el.offsetLeft;
      this._dragOffY = e.clientY - this.el.offsetTop;
      this.el.style.transition = 'none';
      this._onFocus?.(this.id);
      e.preventDefault();
    };
    const onMove = (e: MouseEvent) => {
      if (!this._dragging) return;
      const x = Math.max(0, Math.min(window.innerWidth  - this.el.offsetWidth,  e.clientX - this._dragOffX));
      const y = Math.max(0, Math.min(window.innerHeight - this.el.offsetHeight, e.clientY - this._dragOffY));
      this.el.style.left = `${x}px`;
      this.el.style.top  = `${y}px`;
    };
    const onUp = () => { this._dragging = false; this.el.style.transition = ''; };

    this.titleEl.addEventListener('mousedown', onDown);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  }

  private _bindButtons(): void {
    this.titleEl.querySelector('.holo-wbtn.close')?.addEventListener('click', () => this.hide());
    this.titleEl.querySelector('.holo-wbtn.min')?.addEventListener('click',   () => this._minimise());
  }

  private _minimise(): void {
    if (this._minimised) {
      this.contentEl.style.display = '';
      const tabs = this.el.querySelector('.holo-tabs') as HTMLElement | null;
      if (tabs) tabs.style.display = '';
      this.el.style.height = `${this._savedH}px`;
    } else {
      this._savedH = this.el.offsetHeight;
      this.contentEl.style.display = 'none';
      const tabs = this.el.querySelector('.holo-tabs') as HTMLElement | null;
      if (tabs) tabs.style.display = 'none';
      this.el.style.height = '32px';
    }
    this._minimised = !this._minimised;
  }
}

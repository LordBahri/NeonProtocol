import { Container, Sprite, Texture } from 'pixi.js';

export class VignetteOverlay {
  readonly container: Container;
  private sprite: Sprite;
  private _w: number;
  private _h: number;

  constructor(w: number, h: number) {
    this.container = new Container();
    this.container.label = 'vignette';
    this._w = w;
    this._h = h;
    this.sprite = this.build(w, h);
    this.container.addChild(this.sprite);
  }

  private build(w: number, h: number): Sprite {
    const canvas = document.createElement('canvas');
    canvas.width  = Math.max(1, w);
    canvas.height = Math.max(1, h);
    const ctx = canvas.getContext('2d')!;

    const cx = w * 0.5;
    const cy = h * 0.5;
    const r  = Math.sqrt(cx * cx + cy * cy);

    // Dark vignette ring
    const vg = ctx.createRadialGradient(cx, cy, r * 0.25, cx, cy, r * 1.08);
    vg.addColorStop(0,    'rgba(0,0,0,0)');
    vg.addColorStop(0.52, 'rgba(0,0,0,0)');
    vg.addColorStop(0.80, 'rgba(0,3,8,0.30)');
    vg.addColorStop(1.00, 'rgba(0,2,6,0.82)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);

    // Subtle cyan atmosphere at edges
    const ag = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, r * 1.05);
    ag.addColorStop(0,    'rgba(0,255,204,0)');
    ag.addColorStop(0.85, 'rgba(0,255,204,0)');
    ag.addColorStop(1.00, 'rgba(0,255,204,0.04)');
    ctx.fillStyle = ag;
    ctx.fillRect(0, 0, w, h);

    const tex = Texture.from(canvas);
    const s   = new Sprite(tex);
    s.width   = w;
    s.height  = h;
    return s;
  }

  resize(w: number, h: number): void {
    if (w === this._w && h === this._h) return;
    this._w = w;
    this._h = h;
    this.sprite.destroy({ texture: true });
    this.sprite = this.build(w, h);
    this.container.addChild(this.sprite);
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}

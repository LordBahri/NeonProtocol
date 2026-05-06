import { Application, Container, Graphics } from 'pixi.js';

function lcg(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = Math.imul(s, 1664525) + 1013904223;
    return (s >>> 0) / 0xffffffff;
  };
}

interface TrafficDot {
  container: Container;
  gfx: Graphics;
  gfxB: Graphics | undefined;
  x: number;
  y: number;
  vx: number;
  vy: number;
  blinkPeriod: number;
  blinkPhase: number;
  isDouble: boolean;
  blinkPeriodB: number | undefined;
  blinkPhaseB: number | undefined;
}

interface Beacon {
  container: Container;
  ring: Graphics;
  freq: number;
  phase: number;
}

interface Debris {
  container: Container;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotSpeed: number;
}

const TRAFFIC_COLORS = [0xff3333, 0x44ff88, 0xffffff, 0xffaa33] as const;
const BEACON_COLORS  = [0x0088ff, 0xff6600, 0x00ffcc] as const;

export class AmbientLife {
  private trafficDots: TrafficDot[] = [];
  private beacons: Beacon[]         = [];
  private debris: Debris[]           = [];
  private time = 0;
  private readonly app: Application;

  constructor(app: Application) {
    this.app = app;
    const { width: w, height: h } = app.screen;
    this.buildTraffic(w, h);
    this.buildBeacons(w, h);
    this.buildDebris(w, h);
  }

  private buildTraffic(w: number, h: number): void {
    const rand = lcg(55);

    for (let i = 0; i < 12; i++) {
      const isDouble = rand() < 0.4;
      const x        = rand() * w;
      const y        = rand() * h;
      const speed    = () => (0.2 + rand() * 0.6) * (rand() < 0.5 ? 1 : -1);
      const vx       = speed();
      const vy       = speed();
      const period   = 0.8 + rand() * 1.2;
      const phase    = rand() * Math.PI * 2;
      const size     = 1 + rand();

      const primaryColorIdx = Math.floor(rand() * TRAFFIC_COLORS.length);
      const primaryColor    = TRAFFIC_COLORS[primaryColorIdx]!;

      const container = new Container();
      container.eventMode = 'none';

      const gfx = new Graphics();
      gfx.blendMode = 'add';
      gfx.circle(0, 0, size);
      gfx.fill({ color: primaryColor });

      container.addChild(gfx);

      let gfxB: Graphics | undefined;
      let blinkPeriodB: number | undefined;
      let blinkPhaseB:  number | undefined;

      if (isDouble) {
        // Nav lights: one red, one green, a few px apart — always paired regardless of primary color
        gfx.clear();
        gfx.circle(0, 0, size);
        gfx.fill({ color: 0xff3333 });

        const offset = 3 + rand() * 2;
        gfxB = new Graphics();
        gfxB.blendMode = 'add';
        gfxB.circle(offset, 0, size);
        gfxB.fill({ color: 0x44ff88 });

        // Alternate blink: B is offset by half a period
        blinkPeriodB = period;
        blinkPhaseB  = phase + Math.PI;

        container.addChild(gfxB);
      }

      container.x = x;
      container.y = y;

      this.app.stage.addChild(container);

      this.trafficDots.push({
        container,
        gfx,
        gfxB,
        x,
        y,
        vx,
        vy,
        blinkPeriod: period,
        blinkPhase:  phase,
        isDouble,
        blinkPeriodB,
        blinkPhaseB,
      });
    }
  }

  private buildBeacons(w: number, h: number): void {
    const rand = lcg(77);

    // 2 of each color = 6 total
    for (let ci = 0; ci < BEACON_COLORS.length; ci++) {
      for (let rep = 0; rep < 2; rep++) {
        const color     = BEACON_COLORS[ci]!;
        const cx        = rand() * w;
        const cy        = rand() * h;
        const coreR     = 3 + rand() * 2;
        const ringR     = 10 + rand() * 10;
        const cycleSec  = 2 + rand() * 2;
        const freq      = (Math.PI * 2) / cycleSec;
        const phase     = rand() * Math.PI * 2;

        const container = new Container();
        container.eventMode = 'none';

        const core = new Graphics();
        core.blendMode = 'add';
        core.circle(0, 0, coreR);
        core.fill({ color });

        // Outer ring drawn as a stroked circle; alpha driven each frame
        const ring = new Graphics();
        ring.blendMode = 'add';
        ring.circle(0, 0, ringR);
        ring.stroke({ color, width: 1.5, alpha: 1.0 });
        ring.alpha = 0;

        container.addChild(ring);
        container.addChild(core);
        container.x = cx;
        container.y = cy;

        this.app.stage.addChild(container);

        // Very slow positional drift — so slow it effectively reads as stationary
        const drift = 0.05 * (rand() < 0.5 ? 1 : -1);
        const driftY = 0.05 * (rand() < 0.5 ? 1 : -1);

        this.beacons.push({ container, ring, freq, phase });

        // Store drift on container via a custom property pattern using closure capture
        // (avoids extending the interface for two rarely-changing scalars)
        (container as Container & { _vx: number; _vy: number })._vx = drift;
        (container as Container & { _vx: number; _vy: number })._vy = driftY;
      }
    }
  }

  private buildDebris(w: number, h: number): void {
    const rand = lcg(99);

    for (let i = 0; i < 22; i++) {
      const x        = rand() * w;
      const y        = rand() * h;
      const speed    = () => (0.3 + rand() * 1.2) * (rand() < 0.5 ? 1 : -1);
      const vx       = speed();
      const vy       = speed();
      const rotSpeed = (0.1 + rand() * 0.4) * (rand() < 0.5 ? 1 : -1);
      const alpha    = 0.15 + rand() * 0.2;
      const size     = 1 + rand() * 2;

      // Color in 0x223344–0x445566 range
      const r = Math.floor(0x22 + rand() * (0x44 - 0x22));
      const g = Math.floor(0x33 + rand() * (0x55 - 0x33));
      const b = Math.floor(0x44 + rand() * (0x66 - 0x44));
      const color = (r << 16) | (g << 8) | b;

      const container = new Container();
      container.eventMode = 'none';

      const gfx = new Graphics();
      // Irregular polygon for most, circle for a few — both read as debris specks
      const sides = rand() < 0.4 ? 0 : 3 + Math.floor(rand() * 3);
      if (sides === 0) {
        gfx.circle(0, 0, size);
      } else {
        const pts: number[] = [];
        for (let s = 0; s < sides; s++) {
          const angle = (s / sides) * Math.PI * 2;
          const r2    = size * (0.7 + rand() * 0.6);
          pts.push(Math.cos(angle) * r2, Math.sin(angle) * r2);
        }
        gfx.poly(pts);
      }
      gfx.fill({ color });
      gfx.alpha = alpha;

      container.addChild(gfx);
      container.x = x;
      container.y = y;

      this.app.stage.addChild(container);

      this.debris.push({ container, x, y, vx, vy, rotSpeed });
    }
  }

  update(dt: number): void {
    this.time += dt;
    const { width: sw, height: sh } = this.app.screen;
    const margin = 50;

    for (const dot of this.trafficDots) {
      dot.x += dot.vx * dt;
      dot.y += dot.vy * dt;

      // Wrap with margin so lights don't pop in at the screen edge
      if (dot.x < -margin)       dot.x += sw + margin * 2;
      if (dot.x > sw + margin)   dot.x -= sw + margin * 2;
      if (dot.y < -margin)       dot.y += sh + margin * 2;
      if (dot.y > sh + margin)   dot.y -= sh + margin * 2;

      dot.container.x = dot.x;
      dot.container.y = dot.y;

      // Hard on/off blink via threshold on sine wave
      const stepA = (Math.sin(this.time * (Math.PI * 2) / dot.blinkPeriod + dot.blinkPhase) + 1) / 2;
      dot.gfx.alpha = stepA > 0.5 ? 1.0 : 0.0;

      if (dot.isDouble && dot.gfxB && dot.blinkPeriodB !== undefined && dot.blinkPhaseB !== undefined) {
        const stepB = (Math.sin(this.time * (Math.PI * 2) / dot.blinkPeriodB + dot.blinkPhaseB) + 1) / 2;
        dot.gfxB.alpha = stepB > 0.5 ? 1.0 : 0.0;
      }
    }

    for (const beacon of this.beacons) {
      const c = beacon.container as Container & { _vx: number; _vy: number };
      c.x += c._vx * dt;
      c.y += c._vy * dt;

      // One-sided fade: only the positive lobe of sin contributes, giving a clean pulse
      const raw = Math.sin(this.time * beacon.freq + beacon.phase);
      beacon.ring.alpha = Math.max(0, raw) * 0.18;
    }

    for (const d of this.debris) {
      d.x += d.vx * dt;
      d.y += d.vy * dt;

      if (d.x < -margin)       d.x += sw + margin * 2;
      if (d.x > sw + margin)   d.x -= sw + margin * 2;
      if (d.y < -margin)       d.y += sh + margin * 2;
      if (d.y > sh + margin)   d.y -= sh + margin * 2;

      d.container.x        = d.x;
      d.container.y        = d.y;
      d.container.rotation += d.rotSpeed * dt;
    }
  }

  destroy(): void {
    for (const dot of this.trafficDots)  dot.container.destroy({ children: true });
    for (const b   of this.beacons)      b.container.destroy({ children: true });
    for (const d   of this.debris)       d.container.destroy({ children: true });
    this.trafficDots.length = 0;
    this.beacons.length     = 0;
    this.debris.length      = 0;
  }
}

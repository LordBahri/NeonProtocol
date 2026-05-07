import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { GalaxyData, StarSystem } from './GalaxyTypes.ts';
import { FACTION_DEFS, STAR_COLORS, STAR_RADII, HAZARD_COLORS } from './GalaxyTypes.ts';
import { GALAXY_W, GALAXY_H, GALAXY_COLS, GALAXY_ROWS, GALAXY_CELL } from './GalaxyGenerator.ts';
import type { FogOfWar } from './FogOfWar.ts';
import type { FactionInfluence } from './FactionInfluence.ts';
import type { TrafficSystem } from './TrafficSystem.ts';

// ── Scale ─────────────────────────────────────────────────────────────────────

const MAP_PX     = 700;   // target render size in pixels
const SCALE      = MAP_PX / Math.max(GALAXY_W, GALAXY_H);

function gx(wx: number): number { return wx * SCALE; }
function gy(wy: number): number { return wy * SCALE; }

// ── GalaxyRenderer ────────────────────────────────────────────────────────────

export class GalaxyRenderer {
  readonly container: Container;

  private bg:           Graphics;
  private laneLayer:    Graphics;
  private factionLayer: Graphics;
  private nebulaLayer:  Graphics;
  private dangerLayer:  Graphics;
  private starLayer:    Graphics;
  private fowLayer:     Graphics;   // fog-of-war mask
  private trafficLayer: Graphics;
  private labelLayer:   Container;
  private playerDot:    Graphics;
  private selectionRing: Graphics;

  private galaxy:    GalaxyData;
  private fog:       FogOfWar;
  private influence: FactionInfluence;
  private traffic:   TrafficSystem;

  private _dirty   = true;
  private _time    = 0;
  private _selectedId: string | null = null;

  // Label pool
  private _labelPool: Text[] = [];

  constructor(
    galaxy:    GalaxyData,
    fog:       FogOfWar,
    influence: FactionInfluence,
    traffic:   TrafficSystem,
  ) {
    this.galaxy    = galaxy;
    this.fog       = fog;
    this.influence = influence;
    this.traffic   = traffic;

    this.container     = new Container();
    this.bg            = new Graphics();
    this.laneLayer     = new Graphics();
    this.factionLayer  = new Graphics();
    this.nebulaLayer   = new Graphics();
    this.dangerLayer   = new Graphics();
    this.starLayer     = new Graphics();
    this.fowLayer      = new Graphics();
    this.trafficLayer  = new Graphics();
    this.labelLayer    = new Container();
    this.playerDot     = new Graphics();
    this.selectionRing = new Graphics();

    this.container.addChild(
      this.bg, this.nebulaLayer, this.dangerLayer, this.factionLayer,
      this.laneLayer, this.starLayer, this.fowLayer,
      this.trafficLayer, this.labelLayer,
      this.selectionRing, this.playerDot,
    );

    // Static background
    this.bg.rect(0, 0, MAP_PX, MAP_PX);
    this.bg.fill({ color: 0x000510, alpha: 1 });

    // Static layers (rebuilt on dirty)
    this._drawStaticLayers();

    // FOW change triggers a redraw
    fog.onChange(() => { this._dirty = true; });
  }

  // ── Update ────────────────────────────────────────────────────────────────

  update(dt: number, playerGx: number, playerGy: number): void {
    this._time += dt;

    if (this._dirty) {
      this._drawStaticLayers();
      this._dirty = false;
    }

    this._drawFOW();
    this._drawTraffic();
    this._drawPlayerDot(playerGx, playerGy);
  }

  setDirty(): void { this._dirty = true; }

  setSelected(systemId: string | null): void {
    this._selectedId = systemId;
    this._drawSelectionRing();
  }

  // ── Hit-test ──────────────────────────────────────────────────────────────

  /** Return system at screen coordinate, or null. */
  hitTest(sx: number, sy: number): StarSystem | null {
    const HIT_RADIUS = 8;
    let best: StarSystem | null = null;
    let bestD = Infinity;
    for (const sys of this.galaxy.systems.values()) {
      if (!this.fog.isSystemVisible(sys)) continue;
      const d = Math.hypot(gx(sys.x) - sx, gy(sys.y) - sy);
      if (d < HIT_RADIUS && d < bestD) { bestD = d; best = sys; }
    }
    return best;
  }

  // ── Static layers ─────────────────────────────────────────────────────────

  private _drawStaticLayers(): void {
    this._drawNebulae();
    this._drawDangerZones();
    this._drawFactionTerritory();
    this._drawJumpLanes();
    this._drawStars();
    this._drawLabels();
    this._drawSelectionRing();
  }

  private _drawNebulae(): void {
    this.nebulaLayer.clear();
    for (const n of this.galaxy.nebulae) {
      const { col, row } = this.fog.worldToCell(n.x, n.y);
      if (!this.fog.isRevealed(col, row)) continue;
      this.nebulaLayer.circle(gx(n.x), gy(n.y), n.radius * SCALE);
      this.nebulaLayer.fill({ color: n.color, alpha: 0.18 });
    }
  }

  private _drawDangerZones(): void {
    this.dangerLayer.clear();
    const COLOR: Record<string, number> = {
      void_storm:      0xff00ff,
      radiation_belt:  0xff6600,
      asteroid_swarm:  0xaaaa00,
      null_sec:        0xff0044,
    };
    for (const d of this.galaxy.dangerousSectors) {
      const { col, row } = this.fog.worldToCell(d.x, d.y);
      if (!this.fog.isRevealed(col, row)) continue;
      const c = COLOR[d.type] ?? 0xff0000;
      this.dangerLayer.circle(gx(d.x), gy(d.y), d.radius * SCALE);
      this.dangerLayer.fill({ color: c, alpha: 0.08 });
      this.dangerLayer.circle(gx(d.x), gy(d.y), d.radius * SCALE);
      this.dangerLayer.stroke({ width: 0.5, color: c, alpha: 0.4 });
    }
  }

  private _drawFactionTerritory(): void {
    this.factionLayer.clear();
    const cellPx = GALAXY_CELL * SCALE;
    for (let row = 0; row < GALAXY_ROWS; row++) {
      for (let col = 0; col < GALAXY_COLS; col++) {
        if (!this.fog.isRevealed(col, row)) continue;

        // Find dominant system in this cell
        const cx = (col + 0.5) * GALAXY_CELL;
        const cy = (row + 0.5) * GALAXY_CELL;
        let nearestSys: StarSystem | null = null;
        let nearestD   = Infinity;
        for (const sys of this.galaxy.systems.values()) {
          const d = Math.hypot(sys.x - cx, sys.y - cy);
          if (d < nearestD) { nearestD = d; nearestSys = sys; }
        }
        if (!nearestSys) continue;

        const dominant = this.influence.getDominant(nearestSys.id);
        const color    = FACTION_DEFS[dominant].color;
        const alpha    = this.fog.isExplored(col, row) ? 0.07 : 0.04;

        this.factionLayer.rect(col * cellPx, row * cellPx, cellPx, cellPx);
        this.factionLayer.fill({ color, alpha });
      }
    }
  }

  private _drawJumpLanes(): void {
    this.laneLayer.clear();
    for (const lane of this.galaxy.jumpLanes) {
      const a = this.galaxy.systems.get(lane.fromId);
      const b = this.galaxy.systems.get(lane.toId);
      if (!a || !b) continue;

      const { col: ac, row: ar } = this.fog.worldToCell(a.x, a.y);
      const { col: bc, row: br } = this.fog.worldToCell(b.x, b.y);
      if (!this.fog.isRevealed(ac, ar) || !this.fog.isRevealed(bc, br)) continue;

      const alpha = lane.isHighway ? 0.55 : 0.22;
      const width = lane.isHighway ? 1.2  : 0.5;
      const color = lane.isHighway ? 0x4488ff : 0x334455;

      this.laneLayer.moveTo(gx(a.x), gy(a.y));
      this.laneLayer.lineTo(gx(b.x), gy(b.y));
      this.laneLayer.stroke({ width, color, alpha });
    }
  }

  private _drawStars(): void {
    this.starLayer.clear();

    for (const sys of this.galaxy.systems.values()) {
      const { col, row } = this.fog.worldToCell(sys.x, sys.y);
      if (!this.fog.isRevealed(col, row)) continue;

      const explored = this.fog.isExplored(col, row);
      const color    = STAR_COLORS[sys.starType];
      const r        = STAR_RADII[sys.starType] * (explored ? 1.0 : 0.7);
      const alpha    = explored ? 1.0 : 0.5;

      // Hazard ring tint (very subtle outer)
      if (explored && sys.hazardLevel >= 2) {
        const hc = HAZARD_COLORS[sys.hazardLevel];
        this.starLayer.circle(gx(sys.x), gy(sys.y), r + 2.5);
        this.starLayer.fill({ color: hc, alpha: 0.25 });
      }

      // Star glow
      this.starLayer.circle(gx(sys.x), gy(sys.y), r * 2.2);
      this.starLayer.fill({ color, alpha: alpha * 0.2 });

      // Star core
      this.starLayer.circle(gx(sys.x), gy(sys.y), r);
      this.starLayer.fill({ color, alpha });

      // Station indicator dot
      if (sys.stations.length > 0 && explored) {
        this.starLayer.circle(gx(sys.x) + r + 1.5, gy(sys.y) - r - 1.5, 1.2);
        this.starLayer.fill({ color: 0xffffff, alpha: 0.9 });
      }
    }
  }

  private _drawLabels(): void {
    // Return all labels to pool
    while (this.labelLayer.children.length > 0) {
      const c = this.labelLayer.children[0]!;
      this.labelLayer.removeChild(c);
      if (c instanceof Text) this._labelPool.push(c);
    }

    const style = new TextStyle({ fontSize: 7, fill: 0xaabbcc, fontFamily: 'monospace' });

    for (const sys of this.galaxy.systems.values()) {
      const { col, row } = this.fog.worldToCell(sys.x, sys.y);
      if (!this.fog.isExplored(col, row)) continue;

      let label = this._labelPool.pop();
      if (!label) label = new Text({ text: '', style });
      label.text  = sys.name;
      label.style = style;
      label.x     = gx(sys.x) + STAR_RADII[sys.starType] + 2;
      label.y     = gy(sys.y) - 4;
      this.labelLayer.addChild(label);
    }
  }

  // ── FOW layer (painted each frame) ───────────────────────────────────────

  private _drawFOW(): void {
    this.fowLayer.clear();
    const cellPx = GALAXY_CELL * SCALE;
    for (let row = 0; row < GALAXY_ROWS; row++) {
      for (let col = 0; col < GALAXY_COLS; col++) {
        const state = this.fog.getCell(col, row);
        let alpha   = 0;
        if (state === 0)      alpha = 0.88;  // hidden
        else if (state === 1) alpha = 0.40;  // revealed (dim)
        // explored = fully visible (alpha 0)
        if (alpha <= 0) continue;
        this.fowLayer.rect(col * cellPx, row * cellPx, cellPx, cellPx);
        this.fowLayer.fill({ color: 0x000000, alpha });
      }
    }
  }

  // ── Traffic layer ─────────────────────────────────────────────────────────

  private _drawTraffic(): void {
    this.trafficLayer.clear();
    for (const c of this.traffic.getActiveConvoys()) {
      const pos = this.traffic.getConvoyPosition(c);
      if (!pos) continue;
      const { col, row } = this.fog.worldToCell(pos.x, pos.y);
      if (!this.fog.isRevealed(col, row)) continue;
      const color = FACTION_DEFS[c.faction].color;
      this.trafficLayer.circle(gx(pos.x), gy(pos.y), 1.5);
      this.trafficLayer.fill({ color, alpha: 0.8 });
    }
  }

  // ── Player dot ────────────────────────────────────────────────────────────

  private _drawPlayerDot(playerGx: number, playerGy: number): void {
    this.playerDot.clear();
    const pulse = 0.7 + 0.3 * Math.sin(this._time * 4);
    const px    = gx(playerGx);
    const py    = gy(playerGy);

    this.playerDot.circle(px, py, 5 * pulse);
    this.playerDot.fill({ color: 0x00ffcc, alpha: 0.25 });

    this.playerDot.circle(px, py, 2.5);
    this.playerDot.fill({ color: 0x00ffcc, alpha: 1.0 });

    // Scan radius ring
    this.playerDot.circle(px, py, 3 * GALAXY_CELL * SCALE);
    this.playerDot.stroke({ width: 0.5, color: 0x00ffcc, alpha: 0.2 });
  }

  // ── Selection ring ────────────────────────────────────────────────────────

  private _drawSelectionRing(): void {
    this.selectionRing.clear();
    if (!this._selectedId) return;
    const sys = this.galaxy.systems.get(this._selectedId);
    if (!sys) return;
    this.selectionRing.circle(gx(sys.x), gy(sys.y), 7);
    this.selectionRing.stroke({ width: 1.2, color: 0xffffff, alpha: 0.9 });
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  destroy(): void {
    this.container.destroy({ children: true });
  }
}

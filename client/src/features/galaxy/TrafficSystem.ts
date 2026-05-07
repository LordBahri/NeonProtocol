import type { GalaxyData, StarSystem, Convoy, FactionId } from './GalaxyTypes.ts';
import { FACTION_DEFS } from './GalaxyTypes.ts';

// ── Procedural traffic ────────────────────────────────────────────────────────
// Maintains a pool of NPC convoys travelling between station-bearing systems
// along jump connections. Each convoy is a lightweight data object;
// rendering picks it up from getActiveConvoys().

const MAX_CONVOYS     = 20;
const CONVOY_SPEED_MIN = 0.04;   // progress/s
const CONVOY_SPEED_MAX = 0.14;

export class TrafficSystem {
  private galaxy:   GalaxyData;
  private convoys:  Convoy[] = [];
  private nextId    = 1;

  // Systems that have at least one station (eligible convoy endpoints)
  private stationSystems: StarSystem[] = [];

  // Callbacks
  private onUpdateCbs: Array<(convoys: Convoy[]) => void> = [];
  private broadcastTimer = 0;
  private readonly BROADCAST_INTERVAL = 1.0;

  constructor(galaxy: GalaxyData) {
    this.galaxy        = galaxy;
    this.stationSystems = [...galaxy.systems.values()].filter(s => s.stations.length > 0);
    this._prewarm();
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  private _prewarm(): void {
    for (let i = 0; i < Math.min(MAX_CONVOYS, this.stationSystems.length); i++) {
      this._spawnConvoy();
    }
  }

  // ── Tick ──────────────────────────────────────────────────────────────────

  update(dt: number): void {
    // Advance all convoys
    for (let i = this.convoys.length - 1; i >= 0; i--) {
      const c = this.convoys[i]!;
      c.progress += c.speed * dt;
      if (c.progress >= 1) {
        // Arrived — reroute from current destination
        this._reroute(c);
      }
    }

    // Top up pool
    while (this.convoys.length < MAX_CONVOYS && this.stationSystems.length >= 2) {
      this._spawnConvoy();
    }

    // Broadcast updates
    this.broadcastTimer += dt;
    if (this.broadcastTimer >= this.BROADCAST_INTERVAL) {
      this.broadcastTimer = 0;
      for (const cb of this.onUpdateCbs) cb(this.convoys);
    }
  }

  // ── Convoy management ─────────────────────────────────────────────────────

  private _spawnConvoy(): void {
    if (this.stationSystems.length < 2) return;

    const from = this._randomStationSystem();
    const to   = this._nextDest(from);
    if (!to) return;

    this.convoys.push({
      id:           this.nextId++,
      fromSystemId: from.id,
      toSystemId:   to.id,
      faction:      from.faction,
      progress:     Math.random(),   // start at random progress for spread
      speed:        CONVOY_SPEED_MIN + Math.random() * (CONVOY_SPEED_MAX - CONVOY_SPEED_MIN),
    });
  }

  private _reroute(c: Convoy): void {
    const sys = this.galaxy.systems.get(c.toSystemId);
    if (!sys) { this._removeConvoy(c); return; }

    const next = this._nextDest(sys);
    if (!next) { this._removeConvoy(c); return; }

    c.fromSystemId = c.toSystemId;
    c.toSystemId   = next.id;
    c.faction      = sys.faction;
    c.progress     = 0;
    c.speed        = CONVOY_SPEED_MIN + Math.random() * (CONVOY_SPEED_MAX - CONVOY_SPEED_MIN);
  }

  private _removeConvoy(c: Convoy): void {
    const i = this.convoys.indexOf(c);
    if (i !== -1) this.convoys.splice(i, 1);
  }

  private _randomStationSystem(): StarSystem {
    return this.stationSystems[Math.floor(Math.random() * this.stationSystems.length)]!;
  }

  /** Pick next destination: prefer connected station systems, fallback to any station system. */
  private _nextDest(from: StarSystem): StarSystem | null {
    // Try jump-connected station systems first
    const connected = from.jumpConnections
      .map(id => this.galaxy.systems.get(id))
      .filter((s): s is StarSystem => !!s && s.stations.length > 0 && s.id !== from.id);

    if (connected.length > 0) {
      return connected[Math.floor(Math.random() * connected.length)]!;
    }

    // Fallback: any station system not the same
    const candidates = this.stationSystems.filter(s => s.id !== from.id);
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)]!;
  }

  // ── World-space position interpolation ───────────────────────────────────

  /** Get current world-space position of a convoy (galaxy coordinates). */
  getConvoyPosition(c: Convoy): { x: number; y: number } | null {
    const from = this.galaxy.systems.get(c.fromSystemId);
    const to   = this.galaxy.systems.get(c.toSystemId);
    if (!from || !to) return null;
    const t = c.progress;
    return {
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
    };
  }

  // ── Accessors ─────────────────────────────────────────────────────────────

  getActiveConvoys(): Convoy[] { return this.convoys; }

  getConvoysNear(x: number, y: number, radius: number): Array<{ convoy: Convoy; pos: { x: number; y: number } }> {
    const r2  = radius * radius;
    const out: Array<{ convoy: Convoy; pos: { x: number; y: number } }> = [];
    for (const c of this.convoys) {
      const pos = this.getConvoyPosition(c);
      if (!pos) continue;
      if ((pos.x - x) ** 2 + (pos.y - y) ** 2 < r2) out.push({ convoy: c, pos });
    }
    return out;
  }

  getFactionColor(faction: FactionId): number {
    return FACTION_DEFS[faction].color;
  }

  onUpdate(cb: (convoys: Convoy[]) => void): () => void {
    this.onUpdateCbs.push(cb);
    return () => {
      const i = this.onUpdateCbs.indexOf(cb);
      if (i !== -1) this.onUpdateCbs.splice(i, 1);
    };
  }
}

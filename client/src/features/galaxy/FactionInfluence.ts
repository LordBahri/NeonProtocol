import type { GalaxyData, FactionId } from './GalaxyTypes.ts';
import { FACTION_DEFS } from './GalaxyTypes.ts';

// ── Influence map ─────────────────────────────────────────────────────────────
// Per-system floating influence scores for each faction (sum = 1).
// The dominant faction is the one with the highest influence.

export type InfluenceRecord = Partial<Record<FactionId, number>>;

export class FactionInfluence {
  // systemId → influence per faction (floats 0–1, sum to 1)
  private influence = new Map<string, InfluenceRecord>();
  private galaxy: GalaxyData;

  // Callbacks for UI
  private onChangeCbs: Array<(systemId: string) => void> = [];

  constructor(galaxy: GalaxyData) {
    this.galaxy = galaxy;
    this._init();
  }

  private _init(): void {
    for (const sys of this.galaxy.systems.values()) {
      const rec: InfluenceRecord = {};
      rec[sys.faction] = 1.0;
      this.influence.set(sys.id, rec);
    }
  }

  // ── Accessors ─────────────────────────────────────────────────────────────

  getDominant(systemId: string): FactionId {
    const rec = this.influence.get(systemId);
    if (!rec) return 'neutral';
    let best: FactionId = 'neutral', bestVal = -1;
    for (const [f, v] of Object.entries(rec) as Array<[FactionId, number]>) {
      if (v > bestVal) { bestVal = v; best = f; }
    }
    return best;
  }

  getInfluence(systemId: string, faction: FactionId): number {
    return this.influence.get(systemId)?.[faction] ?? 0;
  }

  isContested(systemId: string): boolean {
    const rec  = this.influence.get(systemId);
    if (!rec) return false;
    const vals = Object.values(rec).sort((a, b) => b - a);
    return vals.length >= 2 && (vals[0]! - vals[1]!) < 0.15;
  }

  getRecord(systemId: string): InfluenceRecord {
    return this.influence.get(systemId) ?? {};
  }

  // ── Simulation tick ───────────────────────────────────────────────────────

  /** Call each simulation frame. dt in seconds. */
  tick(dt: number): void {
    const EXPAND_BASE = 0.002;

    for (const sys of this.galaxy.systems.values()) {
      const dominant = this.getDominant(sys.id);
      const def      = FACTION_DEFS[dominant];
      if (def.aggression <= 0) continue;

      const expandChance = def.aggression * EXPAND_BASE * dt;
      if (Math.random() > expandChance) continue;

      // Try to push influence into one random jump neighbour
      const connId = sys.jumpConnections[Math.floor(Math.random() * sys.jumpConnections.length)];
      if (!connId) continue;

      this._bleedInfluence(sys.id, dominant, connId, 0.02);
    }
  }

  /** Fired when a ship is destroyed in a system — shifts influence. */
  onCombatDeath(systemId: string, defenderFaction: FactionId, attackerFaction: FactionId): void {
    const SHIFT = 0.08;
    this._adjustInfluence(systemId, defenderFaction, -SHIFT);
    this._adjustInfluence(systemId, attackerFaction,  SHIFT * 0.5);
    this._normalise(systemId);
    this._notify(systemId);
  }

  // ── Mutation helpers ──────────────────────────────────────────────────────

  private _bleedInfluence(fromId: string, faction: FactionId, toId: string, amount: number): void {
    const domFrom = this.getDominant(fromId);
    if (domFrom !== faction) return; // no longer dominant, skip

    const recTo    = this.influence.get(toId);
    if (!recTo) return;

    const curFrom  = recTo[faction] ?? 0;
    if (curFrom >= 0.8) return; // already dominant here

    const step     = Math.min(amount, 0.8 - curFrom);
    recTo[faction] = curFrom + step;

    // Reduce all other factions proportionally
    let others = 0;
    for (const [f, v] of Object.entries(recTo) as Array<[FactionId, number]>) {
      if (f !== faction) others += v;
    }
    if (others > 0) {
      const ratio = (1 - (curFrom + step)) / others;
      for (const [f] of Object.entries(recTo) as Array<[FactionId, number]>) {
        if (f !== faction) (recTo as Record<string, number>)[f] = (recTo[f as FactionId] ?? 0) * ratio;
      }
    }

    this._normalise(toId);
    this._notify(toId);
  }

  private _adjustInfluence(systemId: string, faction: FactionId, delta: number): void {
    const rec = this.influence.get(systemId);
    if (!rec) return;
    rec[faction] = Math.max(0, Math.min(1, (rec[faction] ?? 0) + delta));
  }

  private _normalise(systemId: string): void {
    const rec  = this.influence.get(systemId);
    if (!rec) return;
    const sum  = Object.values(rec).reduce((s, v) => s + v, 0);
    if (sum <= 0) { rec.neutral = 1; return; }
    for (const f in rec) {
      (rec as Record<string, number>)[f] = ((rec as Record<string, number>)[f] ?? 0) / sum;
    }
  }

  private _notify(systemId: string): void {
    for (const cb of this.onChangeCbs) cb(systemId);
  }

  onChange(cb: (systemId: string) => void): () => void {
    this.onChangeCbs.push(cb);
    return () => {
      const i = this.onChangeCbs.indexOf(cb);
      if (i !== -1) this.onChangeCbs.splice(i, 1);
    };
  }
}

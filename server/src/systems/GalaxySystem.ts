// Manages faction influence simulation and procedural traffic on the server.
// Receives the same GalaxyData structure as the client (shared seed).
//
// Key responsibilities:
// - FactionInfluence: each server tick, factions with higher aggression
//   expand into adjacent neutral systems (probability: aggression * 0.002 * dt)
//   Contested = two factions at similar influence (within 0.15)
//   When a combat:death event occurs near a system, shift influence by -0.1 for defender
// - TrafficScheduler: maintains a pool of NPC convoys travelling between
//   station-bearing systems along jump connections. Each convoy:
//   { id, fromSystemId, toSystemId, faction, progress: 0-1, speed: 0.05-0.15 /s }
//   Spawns up to MAX_CONVOYS (20) when below threshold.
//   On arrival: pick a new destination from jump connections.
//   Emits 'galaxy:convoy_update' events when convoys move (every 1s bucket)
// - Exports GalaxySystem object with: init(galaxyData), tick(dt), getInfluenceMap(), getConvoys()

// ---------------------------------------------------------------------------
// Local type definitions (mirrors client-side GalaxyData — no client import)
// ---------------------------------------------------------------------------

interface SystemRef {
  id: string;
  x: number;
  y: number;
  faction: string;
  jumpConnections: string[];
  hasStation: boolean;
}

interface GalaxyDataRef {
  seed: number;
  systems: Map<string, SystemRef>;
}

// ---------------------------------------------------------------------------
// Faction definitions
// ---------------------------------------------------------------------------

type FactionId =
  | 'federation'
  | 'syndicate'
  | 'void_cult'
  | 'free_traders'
  | 'reavers'
  | 'neutral';

const FACTION_AGGRESSION: Record<FactionId, number> = {
  federation: 0.2,
  syndicate: 0.5,
  void_cult: 0.8,
  free_traders: 0.1,
  reavers: 1.0,
  neutral: 0.0,
};

const NON_NEUTRAL_FACTIONS: FactionId[] = [
  'federation',
  'syndicate',
  'void_cult',
  'free_traders',
  'reavers',
];

// ---------------------------------------------------------------------------
// Influence map
// ---------------------------------------------------------------------------

/** Per-system influence values for each non-neutral faction (0–1). */
type InfluenceRecord = Record<FactionId, number>;

/** Full influence map keyed by system id. */
type InfluenceMap = Map<string, InfluenceRecord>;

function makeInfluenceRecord(dominant?: FactionId): InfluenceRecord {
  const rec: InfluenceRecord = {
    federation: 0,
    syndicate: 0,
    void_cult: 0,
    free_traders: 0,
    reavers: 0,
    neutral: 0,
  };
  if (dominant && dominant !== 'neutral') {
    rec[dominant] = 1.0;
  } else {
    rec.neutral = 1.0;
  }
  return rec;
}

function dominantFaction(rec: InfluenceRecord): FactionId {
  let best: FactionId = 'neutral';
  let bestVal = -1;
  for (const f of Object.keys(rec) as FactionId[]) {
    if (rec[f] > bestVal) {
      bestVal = rec[f];
      best = f;
    }
  }
  return best;
}

function isContested(rec: InfluenceRecord): boolean {
  const sorted = (Object.values(rec) as number[]).filter((v) => v > 0).sort((a, b) => b - a);
  if (sorted.length < 2) return false;
  return sorted[0] - sorted[1] <= 0.15;
}

// Normalise so all faction influences in a system sum to 1.
function normalise(rec: InfluenceRecord): void {
  const total = (Object.values(rec) as number[]).reduce((s, v) => s + v, 0);
  if (total <= 0) {
    rec.neutral = 1.0;
    return;
  }
  for (const f of Object.keys(rec) as FactionId[]) {
    rec[f] = rec[f] / total;
  }
}

// ---------------------------------------------------------------------------
// Convoy types
// ---------------------------------------------------------------------------

interface Convoy {
  id: string;
  fromSystemId: string;
  toSystemId: string;
  faction: FactionId;
  progress: number; // 0–1
  speed: number;    // units per second (0.05–0.15)
}

// ---------------------------------------------------------------------------
// Tiny deterministic PRNG (mulberry32) — avoids Math.random for reproducibility
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// GalaxySystem implementation
// ---------------------------------------------------------------------------

let _galaxyData: GalaxyDataRef | null = null;
let _influenceMap: InfluenceMap = new Map();
let _convoys: Map<string, Convoy> = new Map();
let _nextConvoyId = 0;
let _trafficAccum = 0;      // seconds since last convoy broadcast bucket
let _rand: () => number = Math.random;

const MAX_CONVOYS = 20;
const CONVOY_BROADCAST_INTERVAL = 1.0; // seconds
const INFLUENCE_CONTESTED_THRESHOLD = 0.15;
const INFLUENCE_DEATH_PENALTY = 0.1;
const CONVOY_MIN_SPEED = 0.05;
const CONVOY_MAX_SPEED = 0.15;

// Event emitter: simple in-process bus so callers can subscribe.
type ConvoyUpdateHandler = (convoys: Convoy[]) => void;
const _convoyUpdateHandlers: ConvoyUpdateHandler[] = [];

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Station-bearing systems usable as convoy endpoints. */
function stationSystems(): SystemRef[] {
  if (!_galaxyData) return [];
  const out: SystemRef[] = [];
  for (const sys of _galaxyData.systems.values()) {
    if (sys.hasStation) out.push(sys);
  }
  return out;
}

/** Pick a random element from an array, using the internal PRNG. */
function pick<T>(arr: T[]): T | undefined {
  if (arr.length === 0) return undefined;
  return arr[Math.floor(_rand() * arr.length)];
}

/** Choose a convoy speed with the internal PRNG. */
function randomConvoySpeed(): number {
  return CONVOY_MIN_SPEED + _rand() * (CONVOY_MAX_SPEED - CONVOY_MIN_SPEED);
}

/** Choose a faction for a new convoy weighted by station count (simple uniform). */
function randomNonNeutralFaction(): FactionId {
  return NON_NEUTRAL_FACTIONS[Math.floor(_rand() * NON_NEUTRAL_FACTIONS.length)];
}

/** Spawn a single convoy between two different station systems. */
function spawnConvoy(): void {
  if (!_galaxyData) return;

  const stations = stationSystems();
  if (stations.length < 2) return;

  const from = pick(stations);
  if (!from) return;

  // Prefer a neighbour reachable via jump connection that also has a station.
  const neighbourIds = from.jumpConnections.filter((id) => {
    const s = _galaxyData!.systems.get(id);
    return s?.hasStation;
  });

  let to: SystemRef | undefined;
  if (neighbourIds.length > 0) {
    const toId = pick(neighbourIds);
    to = toId ? _galaxyData.systems.get(toId) : undefined;
  }

  // Fallback: any other station system.
  if (!to || to.id === from.id) {
    const others = stations.filter((s) => s.id !== from.id);
    to = pick(others);
  }

  if (!to || to.id === from.id) return;

  const id = `convoy_${_nextConvoyId++}`;
  const faction = randomNonNeutralFaction();
  _convoys.set(id, {
    id,
    fromSystemId: from.id,
    toSystemId: to.id,
    faction,
    progress: 0,
    speed: randomConvoySpeed(),
  });
}

/** Advance a single convoy; returns true if it arrived this tick. */
function tickConvoy(convoy: Convoy, dt: number): boolean {
  convoy.progress += convoy.speed * dt;
  if (convoy.progress >= 1.0) {
    convoy.progress = 1.0;
    return true; // arrived
  }
  return false;
}

/** On arrival, reroute the convoy to a new destination from its current system. */
function rerouteConvoy(convoy: Convoy): void {
  if (!_galaxyData) return;

  const currentSys = _galaxyData.systems.get(convoy.toSystemId);
  if (!currentSys) {
    _convoys.delete(convoy.id);
    return;
  }

  const newFrom = currentSys;
  const neighbourIds = newFrom.jumpConnections.filter((id) => {
    const s = _galaxyData!.systems.get(id);
    return s?.hasStation;
  });

  let newTo: SystemRef | undefined;
  if (neighbourIds.length > 0) {
    const toId = pick(neighbourIds);
    newTo = toId ? _galaxyData.systems.get(toId) : undefined;
  }

  if (!newTo || newTo.id === newFrom.id) {
    const stations = stationSystems().filter((s) => s.id !== newFrom.id);
    newTo = pick(stations);
  }

  if (!newTo || newTo.id === newFrom.id) {
    _convoys.delete(convoy.id);
    return;
  }

  convoy.fromSystemId = newFrom.id;
  convoy.toSystemId = newTo.id;
  convoy.progress = 0;
  convoy.speed = randomConvoySpeed();
}

// ---------------------------------------------------------------------------
// Faction influence tick
// ---------------------------------------------------------------------------

function tickInfluence(dt: number): void {
  if (!_galaxyData) return;

  for (const [sysId, sys] of _galaxyData.systems) {
    const rec = _influenceMap.get(sysId);
    if (!rec) continue;

    const dom = dominantFaction(rec);

    // Only expand from non-neutral systems.
    if (dom === 'neutral') continue;

    const aggression = FACTION_AGGRESSION[dom];
    if (aggression <= 0) continue;

    const expandProb = aggression * 0.002 * dt;

    for (const neighbourId of sys.jumpConnections) {
      const neighbourRec = _influenceMap.get(neighbourId);
      if (!neighbourRec) continue;

      const neighbourDom = dominantFaction(neighbourRec);

      // Only expand into neutral or contested systems.
      if (neighbourDom === dom) continue;

      if (_rand() < expandProb) {
        // Shift influence toward the expanding faction.
        const gain = aggression * 0.01 * dt;
        neighbourRec[dom] = Math.min(1, (neighbourRec[dom] ?? 0) + gain);
        // Reduce the current dominant's share.
        if (neighbourDom !== 'neutral') {
          neighbourRec[neighbourDom] = Math.max(0, (neighbourRec[neighbourDom] ?? 0) - gain);
        } else {
          neighbourRec.neutral = Math.max(0, (neighbourRec.neutral ?? 0) - gain);
        }
        normalise(neighbourRec);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Public interface — combat event hook
// ---------------------------------------------------------------------------

/**
 * Call this when a combat:death event occurs.
 * @param nearSystemId  The system id nearest to the death event.
 * @param defenderFaction  The faction of the entity that died.
 */
function onCombatDeath(nearSystemId: string, defenderFaction: FactionId): void {
  const rec = _influenceMap.get(nearSystemId);
  if (!rec) return;

  if (defenderFaction !== 'neutral') {
    rec[defenderFaction] = Math.max(0, rec[defenderFaction] - INFLUENCE_DEATH_PENALTY);
    normalise(rec);
  }
}

// ---------------------------------------------------------------------------
// Exported GalaxySystem object
// ---------------------------------------------------------------------------

export const GalaxySystem = {
  /**
   * Initialise the system with galaxy data (call once after generation).
   */
  init(galaxyData: GalaxyDataRef): void {
    _galaxyData = galaxyData;
    _influenceMap = new Map();
    _convoys = new Map();
    _nextConvoyId = 0;
    _trafficAccum = 0;
    _rand = mulberry32(galaxyData.seed ^ 0xdeadbeef);

    // Seed initial influence from system faction ownership.
    for (const [id, sys] of galaxyData.systems) {
      _influenceMap.set(id, makeInfluenceRecord(sys.faction as FactionId));
    }
  },

  /**
   * Advance the galaxy simulation by dt seconds.
   * Should be called every server tick.
   */
  tick(dt: number): void {
    if (!_galaxyData) return;

    // 1. Faction influence expansion.
    tickInfluence(dt);

    // 2. Traffic scheduler — advance convoys.
    const arriving: Convoy[] = [];
    for (const convoy of _convoys.values()) {
      const arrived = tickConvoy(convoy, dt);
      if (arrived) arriving.push(convoy);
    }
    for (const convoy of arriving) {
      rerouteConvoy(convoy);
    }

    // 3. Spawn new convoys up to MAX_CONVOYS.
    let spawnAttempts = MAX_CONVOYS - _convoys.size;
    while (spawnAttempts > 0) {
      spawnConvoy();
      spawnAttempts--;
    }

    // 4. Broadcast convoy updates every CONVOY_BROADCAST_INTERVAL seconds.
    _trafficAccum += dt;
    if (_trafficAccum >= CONVOY_BROADCAST_INTERVAL) {
      _trafficAccum -= CONVOY_BROADCAST_INTERVAL;
      const snapshot = Array.from(_convoys.values());
      for (const handler of _convoyUpdateHandlers) {
        handler(snapshot);
      }
    }
  },

  /** Returns a read-only snapshot of the current influence map. */
  getInfluenceMap(): ReadonlyMap<string, InfluenceRecord> {
    return _influenceMap;
  },

  /** Returns a read-only snapshot of all active convoys. */
  getConvoys(): ReadonlyMap<string, Convoy> {
    return _convoys;
  },

  /**
   * Query whether a system is contested (two factions within 0.15 influence).
   */
  isContested(systemId: string): boolean {
    const rec = _influenceMap.get(systemId);
    return rec ? isContested(rec) : false;
  },

  /**
   * Returns the dominant faction for a given system.
   */
  getDominantFaction(systemId: string): FactionId | null {
    const rec = _influenceMap.get(systemId);
    return rec ? dominantFaction(rec) : null;
  },

  /**
   * Register a handler for 'galaxy:convoy_update' events.
   * The handler receives the full convoy array every CONVOY_BROADCAST_INTERVAL seconds.
   */
  onConvoyUpdate(handler: ConvoyUpdateHandler): void {
    _convoyUpdateHandlers.push(handler);
  },

  /**
   * External hook: call when a combat:death event occurs near a system.
   */
  onCombatDeath,

  // Expose constants for tests / other systems.
  INFLUENCE_CONTESTED_THRESHOLD,
  MAX_CONVOYS,
  CONVOY_BROADCAST_INTERVAL,
};

export type { FactionId, InfluenceRecord, InfluenceMap, Convoy, SystemRef, GalaxyDataRef };

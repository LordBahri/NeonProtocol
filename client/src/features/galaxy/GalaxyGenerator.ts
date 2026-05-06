import type {
  GalaxyData, StarSystem, JumpLane, Constellation, NebulaZone,
  DangerousSector, Station, AsteroidBelt, Anomaly,
  StarType, FactionId, HazardLevel, StationType, AnomalyType, DangerType,
} from './GalaxyTypes.ts';
import { FACTION_DEFS } from './GalaxyTypes.ts';

// ── Galaxy dimensions ─────────────────────────────────────────────────────────

export const GALAXY_COLS     = 32;
export const GALAXY_ROWS     = 32;
export const GALAXY_CELL     = 2000;          // galaxy-space units per cell
export const GALAXY_W        = GALAXY_COLS * GALAXY_CELL;
export const GALAXY_H        = GALAXY_ROWS * GALAXY_CELL;

const SYSTEM_COUNT           = 280;
const MIN_DIST               = 1400;
const MAX_JUMP_RANGE         = 3500;
const MAX_JUMPS_PER_SYSTEM   = 5;
const NEBULA_COUNT           = 35;
const DANGER_ZONE_COUNT      = 12;
const CONSTELLATION_SIZE_MIN = 4;
const CONSTELLATION_SIZE_MAX = 12;

// ── Seeded LCG RNG ────────────────────────────────────────────────────────────

class Rng {
  private s: number;

  constructor(seed: number) { this.s = (seed ^ 0x12345678) >>> 0; }

  next(): number {
    this.s = Math.imul(this.s, 1664525) + 1013904223;
    return (this.s >>> 0) / 0x100000000;
  }

  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  float(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  pick<T>(arr: readonly T[]): T {
    return arr[this.int(0, arr.length - 1)]!;
  }

  bool(p = 0.5): boolean { return this.next() < p; }
}

// ── Name generation ───────────────────────────────────────────────────────────

const NAME_SYLLABLES_A = ['Ael', 'Arc', 'Cal', 'Dor', 'Eld', 'Fax', 'Gry', 'Hel', 'Ix', 'Jor', 'Ker', 'Lyx', 'Myr', 'Nex', 'Orv', 'Pax', 'Qyl', 'Rex', 'Sol', 'Tau', 'Ulx', 'Van', 'Wex', 'Xal', 'Yor', 'Zyph'] as const;
const NAME_SYLLABLES_B = ['ara', 'ion', 'ath', 'eon', 'ira', 'orn', 'une', 'yx', 'us', 'ia', 'is', 'on', 'or', 'ix', 'ax', 'os', 'el', 'en'] as const;
const CONSTELLATION_NAMES = ['Serpens', 'Nyx', 'Auriga', 'Vela', 'Monoceros', 'Lacerta', 'Fornax', 'Sculptor', 'Indus', 'Lupus', 'Corvus', 'Draco', 'Crux', 'Orion', 'Phoenix', 'Tucana', 'Hydra', 'Cetus', 'Lyra', 'Aquila', 'Cygnus', 'Perseus', 'Andromeda', 'Sagittarius', 'Scorpius', 'Centaurus', 'Cassiopeia', 'Ursa', 'Gemini', 'Libra', 'Aquarius', 'Aries', 'Taurus', 'Virgo', 'Leo', 'Cancer', 'Capricorn', 'Pisces', 'Ophiuchus', 'Hercules', 'Boötes', 'Eridanus', 'Piscis', 'Dorado', 'Volans', 'Puppis', 'Antlia', 'Circinus', 'Pyxis', 'Musca'] as const;
const STATION_NAMES_A = ['Port', 'Station', 'Outpost', 'Beacon', 'Nexus', 'Haven', 'Citadel', 'Forge', 'Bastion', 'Relay'] as const;
const STATION_NAMES_B = ['Alpha', 'Prime', 'Omega', 'Apex', 'Vex', 'Core', 'Deep', 'Void', 'Rim', 'Gate'] as const;

function systemName(rng: Rng): string {
  return rng.pick(NAME_SYLLABLES_A) + rng.pick(NAME_SYLLABLES_B);
}

function stationName(rng: Rng): string {
  return `${rng.pick(STATION_NAMES_A)} ${rng.pick(STATION_NAMES_B)}`;
}

// ── Poisson disk sampling ─────────────────────────────────────────────────────
// Bridson's algorithm — produces evenly-distributed, non-overlapping points.

function poissonDisk(rng: Rng, w: number, h: number, minDist: number, maxSamples: number): Array<[number, number]> {
  const cellSize = minDist / Math.SQRT2;
  const gridW    = Math.ceil(w / cellSize);
  const gridH    = Math.ceil(h / cellSize);
  const grid     = new Int32Array(gridW * gridH).fill(-1);
  const pts:    Array<[number, number]> = [];
  const active: number[] = [];

  const gridIdx = (x: number, y: number) =>
    Math.floor(x / cellSize) + Math.floor(y / cellSize) * gridW;

  const tooClose = (x: number, y: number): boolean => {
    const cx = Math.floor(x / cellSize);
    const cy = Math.floor(y / cellSize);
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= gridW || ny >= gridH) continue;
        const pi = grid[nx + ny * gridW];
        if (pi === -1) continue;
        const p = pts[pi]!;
        const d2 = (p[0] - x) ** 2 + (p[1] - y) ** 2;
        if (d2 < minDist * minDist) return true;
      }
    }
    return false;
  };

  const add = (x: number, y: number) => {
    const i = pts.length;
    pts.push([x, y]);
    grid[gridIdx(x, y)] = i;
    active.push(i);
  };

  // Seed point near center
  add(w * 0.4 + rng.float(0, w * 0.2), h * 0.4 + rng.float(0, h * 0.2));

  const K = 30;
  while (active.length > 0 && pts.length < maxSamples) {
    const idx     = active[rng.int(0, active.length - 1)]!;
    const [bx, by] = pts[idx]!;
    let found     = false;

    for (let k = 0; k < K; k++) {
      const angle = rng.float(0, Math.PI * 2);
      const r     = rng.float(minDist, minDist * 2);
      const nx    = bx + Math.cos(angle) * r;
      const ny    = by + Math.sin(angle) * r;
      if (nx < 50 || ny < 50 || nx > w - 50 || ny > h - 50) continue;
      if (tooClose(nx, ny)) continue;
      add(nx, ny);
      found = true;
    }

    if (!found) {
      const fi = active.indexOf(idx);
      if (fi !== -1) active.splice(fi, 1);
    }
  }

  return pts;
}

// ── Star type distribution ────────────────────────────────────────────────────

const STAR_TYPE_WEIGHTS: Array<[StarType, number]> = [
  ['red_dwarf',    40],
  ['yellow_dwarf', 30],
  ['blue_giant',   10],
  ['red_giant',    8],
  ['white_dwarf',  7],
  ['binary',       4],
  ['neutron',      1],
];

function pickStarType(rng: Rng): StarType {
  const total  = STAR_TYPE_WEIGHTS.reduce((s, [, w]) => s + w, 0);
  let roll     = rng.float(0, total);
  for (const [t, w] of STAR_TYPE_WEIGHTS) {
    roll -= w;
    if (roll <= 0) return t;
  }
  return 'yellow_dwarf';
}

// ── Station generation ────────────────────────────────────────────────────────

const STATION_TYPE_BY_FACTION: Record<FactionId, StationType[]> = {
  federation:   ['military_base', 'trading_post', 'shipyard'],
  syndicate:    ['trading_post', 'research_lab', 'refinery'],
  void_cult:    ['research_lab', 'refinery'],
  free_traders: ['trading_post', 'refinery', 'shipyard'],
  reavers:      ['pirate_den'],
  neutral:      ['trading_post', 'refinery'],
};

function makeStation(rng: Rng, faction: FactionId, idx: number): Station {
  const types   = STATION_TYPE_BY_FACTION[faction];
  const type    = rng.pick(types);
  return {
    id:      `st_${idx}`,
    type,
    name:    stationName(rng),
    faction,
  };
}

// ── Anomaly generation ────────────────────────────────────────────────────────

const ANOMALY_TYPES: AnomalyType[] = ['derelict', 'wormhole', 'quantum_rift', 'ghost_signal', 'ancient_cache', 'black_hole'];

// ── Jump lane building ────────────────────────────────────────────────────────

function buildJumpLanes(systems: StarSystem[]): JumpLane[] {
  const lanes:  JumpLane[] = [];
  const added   = new Set<string>();

  const key = (a: string, b: string) => a < b ? `${a}|${b}` : `${b}|${a}`;

  const addLane = (a: StarSystem, b: StarSystem, highway = false) => {
    const k = key(a.id, b.id);
    if (added.has(k)) return;
    added.add(k);
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    lanes.push({ fromId: a.id, toId: b.id, length: len, isHighway: highway });
    a.jumpConnections.push(b.id);
    b.jumpConnections.push(a.id);
  };

  // For each system, connect to nearest systems within range (max connections capped)
  for (const sys of systems) {
    const neighbors = systems
      .filter(s => s.id !== sys.id)
      .map(s => ({ s, d: Math.hypot(s.x - sys.x, s.y - sys.y) }))
      .filter(({ d }) => d <= MAX_JUMP_RANGE)
      .sort((a, b) => a.d - b.d)
      .slice(0, MAX_JUMPS_PER_SYSTEM);

    for (const { s } of neighbors) {
      if (sys.jumpConnections.length >= MAX_JUMPS_PER_SYSTEM) break;
      if (s.jumpConnections.length >= MAX_JUMPS_PER_SYSTEM) continue;
      addLane(sys, s);
    }
  }

  // Ensure connectivity: find isolated systems and connect to nearest
  for (const sys of systems) {
    if (sys.jumpConnections.length === 0) {
      const nearest = systems
        .filter(s => s.id !== sys.id)
        .sort((a, b) => Math.hypot(a.x - sys.x, a.y - sys.y) - Math.hypot(b.x - sys.x, b.y - sys.y))[0];
      if (nearest) addLane(sys, nearest);
    }
  }

  // Mark high-traffic (highway) lanes: connections between systems with stations
  for (const lane of lanes) {
    const from = systems.find(s => s.id === lane.fromId);
    const to   = systems.find(s => s.id === lane.toId);
    if (from && to && from.stations.length > 0 && to.stations.length > 0) {
      lane.isHighway = true;
    }
  }

  return lanes;
}

// ── Constellation building ────────────────────────────────────────────────────

function buildConstellations(rng: Rng, systems: StarSystem[]): Map<string, Constellation> {
  const constellations = new Map<string, Constellation>();
  const assigned       = new Set<string>();
  let   cIdx           = 0;

  const usedNames = new Set<string>();
  const pickName  = () => {
    for (const n of CONSTELLATION_NAMES) {
      if (!usedNames.has(n)) { usedNames.add(n); return n; }
    }
    return `Cluster-${cIdx}`;
  };

  const PALETTE = [0x4488ff, 0xff44aa, 0xaa44ff, 0xffaa44, 0x44ffaa, 0xff6644, 0x44aaff, 0xff4488];

  for (const seed of systems) {
    if (assigned.has(seed.id)) continue;

    const size    = rng.int(CONSTELLATION_SIZE_MIN, CONSTELLATION_SIZE_MAX);
    const members = [seed];
    assigned.add(seed.id);

    // BFS along jump connections up to size limit
    const queue = [seed];
    while (queue.length > 0 && members.length < size) {
      const cur = queue.shift()!;
      for (const connId of cur.jumpConnections) {
        if (assigned.has(connId)) continue;
        const conn = systems.find(s => s.id === connId);
        if (!conn) continue;
        members.push(conn);
        assigned.add(connId);
        queue.push(conn);
        if (members.length >= size) break;
      }
    }

    const id   = `const_${cIdx++}`;
    const name = pickName();
    const cx   = members.reduce((s, m) => s + m.x, 0) / members.length;
    const cy   = members.reduce((s, m) => s + m.y, 0) / members.length;

    for (const m of members) m.constellationId = id;

    constellations.set(id, {
      id, name, systemIds: members.map(m => m.id),
      centerX: cx, centerY: cy,
      color: PALETTE[cIdx % PALETTE.length]!,
    });
  }

  return constellations;
}

// ── Faction territory assignment ──────────────────────────────────────────────

const PLAYABLE_FACTIONS: FactionId[] = ['federation', 'syndicate', 'void_cult', 'free_traders', 'reavers'];

function assignFactions(rng: Rng, systems: StarSystem[]): Map<FactionId, Set<string>> {
  const territory = new Map<FactionId, Set<string>>(
    (['federation', 'syndicate', 'void_cult', 'free_traders', 'reavers', 'neutral'] as FactionId[])
      .map(f => [f, new Set<string>()]),
  );

  // Place homeworlds evenly spread around the galaxy
  const homeworlds: Array<{ faction: FactionId; system: StarSystem }> = [];
  const FACTION_HOME_COUNTS: Partial<Record<FactionId, number>> = {
    federation: 1, syndicate: 1, void_cult: 1, free_traders: 1, reavers: 1,
  };

  const placedHomeworlds = new Set<string>();
  for (const faction of PLAYABLE_FACTIONS) {
    const count = FACTION_HOME_COUNTS[faction] ?? 1;
    for (let i = 0; i < count; i++) {
      // Spread homeworlds out, preferring different quadrants
      let best: StarSystem | null = null;
      let bestScore = -Infinity;
      for (let attempt = 0; attempt < 20; attempt++) {
        const candidate = rng.pick(systems);
        if (placedHomeworlds.has(candidate.id)) continue;
        // Score = min distance to other homeworlds (want spread)
        const minDist = homeworlds.reduce(
          (md, h) => Math.min(md, Math.hypot(h.system.x - candidate.x, h.system.y - candidate.y)),
          Infinity,
        );
        const score = minDist === Infinity ? rng.float(GALAXY_W * 0.3, GALAXY_W) : minDist;
        if (score > bestScore) { bestScore = score; best = candidate; }
      }
      if (best) {
        homeworlds.push({ faction, system: best });
        placedHomeworlds.add(best.id);
      }
    }
  }

  // BFS from homeworlds — each step claims the next nearest unowned system
  const claimed = new Map<string, FactionId>();
  for (const { faction, system } of homeworlds) {
    claimed.set(system.id, faction);
    system.faction = faction;
    territory.get(faction)!.add(system.id);
  }

  // Multi-source BFS; each iteration all factions expand one ring
  const MAX_EXPANSION = 15;
  for (let wave = 0; wave < MAX_EXPANSION; wave++) {
    for (const faction of PLAYABLE_FACTIONS) {
      const def = FACTION_DEFS[faction];
      if (rng.next() > 0.7 + def.aggression * 0.3) continue; // aggressiveness = expansion speed
      for (const sysId of [...territory.get(faction)!]) {
        const sys = systems.find(s => s.id === sysId);
        if (!sys) continue;
        for (const connId of sys.jumpConnections) {
          if (claimed.has(connId)) continue;
          const conn = systems.find(s => s.id === connId);
          if (!conn) continue;
          claimed.set(connId, faction);
          conn.faction = faction;
          territory.get(faction)!.add(connId);
          break; // one claim per system per wave
        }
      }
    }
  }

  // Reavers: claim isolated outer rim pockets
  for (const sys of systems) {
    if (claimed.has(sys.id)) continue;
    const distFromCenter = Math.hypot(sys.x - GALAXY_W * 0.5, sys.y - GALAXY_H * 0.5);
    if (distFromCenter > GALAXY_W * 0.35 && rng.bool(0.55)) {
      sys.faction = 'reavers';
      territory.get('reavers')!.add(sys.id);
      claimed.set(sys.id, 'reavers');
    }
  }

  // Remaining → neutral
  for (const sys of systems) {
    if (!claimed.has(sys.id)) {
      sys.faction = 'neutral';
      territory.get('neutral')!.add(sys.id);
    }
  }

  return territory;
}

// ── Hazard level overlay ──────────────────────────────────────────────────────

function assignHazards(rng: Rng, systems: StarSystem[], nebulae: NebulaZone[], dangers: DangerousSector[]): void {
  const cx = GALAXY_W * 0.5;
  const cy = GALAXY_H * 0.5;

  for (const sys of systems) {
    let hazard = 0;

    // Distance from center: outer rim is more dangerous
    const rimFrac = Math.hypot(sys.x - cx, sys.y - cy) / (GALAXY_W * 0.5);
    if (rimFrac > 0.8) hazard += 2;
    else if (rimFrac > 0.6) hazard += 1;

    // Faction aggression adds hazard
    const def = FACTION_DEFS[sys.faction];
    hazard += Math.floor(def.aggression * 2);

    // Nebula bonus
    for (const n of nebulae) {
      if (Math.hypot(n.x - sys.x, n.y - sys.y) < n.radius) hazard += n.hazardBonus;
    }

    // Dangerous sector bonus
    for (const d of dangers) {
      if (Math.hypot(d.x - sys.x, d.y - sys.y) < d.radius) hazard += 2;
    }

    // Random variance
    hazard += rng.int(-1, 1);

    sys.hazardLevel = Math.max(0, Math.min(4, hazard)) as HazardLevel;
    sys.isPirateZone = sys.faction === 'reavers' || (sys.hazardLevel >= 3 && rng.bool(0.4));
    sys.isDangerous  = sys.hazardLevel >= 3;
  }
}

// ── Traffic density ───────────────────────────────────────────────────────────

function assignTrafficDensity(systems: StarSystem[]): void {
  // Traffic = normalised jump connections count + station bonus
  const maxConn = Math.max(...systems.map(s => s.jumpConnections.length));
  for (const sys of systems) {
    const connScore    = sys.jumpConnections.length / maxConn;
    const stationScore = Math.min(sys.stations.length * 0.3, 0.6);
    sys.trafficDensity = Math.min(1, connScore * 0.6 + stationScore);
  }
}

// ── Main generator ────────────────────────────────────────────────────────────

export function generateGalaxy(seed: number): GalaxyData {
  const rng = new Rng(seed);

  // 1. Distribute star systems (Poisson disk)
  const positions = poissonDisk(rng, GALAXY_W, GALAXY_H, MIN_DIST, SYSTEM_COUNT);

  // 2. Build nebula zones first (they affect hazard)
  const nebulae: NebulaZone[] = [];
  const NEBULA_COLORS = [0x001e3a, 0x18002e, 0x001f4a, 0x1e0018, 0x00150f, 0x1a0040, 0x002010] as const;
  for (let i = 0; i < NEBULA_COUNT; i++) {
    nebulae.push({
      id:            `neb_${i}`,
      x:             rng.float(GALAXY_W * 0.05, GALAXY_W * 0.95),
      y:             rng.float(GALAXY_H * 0.05, GALAXY_H * 0.95),
      radius:        rng.float(1500, 5000),
      color:         rng.pick(NEBULA_COLORS),
      hazardBonus:   rng.int(0, 1),
      sensorPenalty: rng.float(0.1, 0.4),
    });
  }

  // 3. Dangerous sectors
  const DANGER_TYPES: DangerType[] = ['void_storm', 'radiation_belt', 'asteroid_swarm', 'null_sec'];
  const dangerousSectors: DangerousSector[] = [];
  for (let i = 0; i < DANGER_ZONE_COUNT; i++) {
    dangerousSectors.push({
      x:      rng.float(0, GALAXY_W),
      y:      rng.float(0, GALAXY_H),
      radius: rng.float(2000, 6000),
      type:   rng.pick(DANGER_TYPES),
    });
  }

  // 4. Build star systems
  let stationIdx = 0;
  const systems: StarSystem[] = positions.map(([x, y], i) => {
    const starType  = pickStarType(rng);
    const isNebula  = nebulae.some(n => Math.hypot(n.x - x, n.y - y) < n.radius);

    // Stations: 40% of systems have one, 10% have two
    const stations: Station[] = [];
    if (rng.bool(0.40)) {
      stations.push(makeStation(rng, 'neutral', stationIdx++));
      if (rng.bool(0.10)) stations.push(makeStation(rng, 'neutral', stationIdx++));
    }

    // Asteroid belts: 60% have at least one
    const asteroidBelts: AsteroidBelt[] = [];
    if (rng.bool(0.60)) {
      asteroidBelts.push({
        innerRadius: rng.float(300, 700),
        outerRadius: rng.float(800, 1500),
        density:     rng.float(0.2, 1.0),
        richness:    rng.float(0.1, 0.9),
      });
    }

    // Anomalies: 20% of systems
    const anomalies: Anomaly[] = [];
    if (rng.bool(0.20)) {
      anomalies.push({ type: rng.pick(ANOMALY_TYPES), discovered: false });
    }

    return {
      id:              `sys_${i}`,
      name:            systemName(rng),
      x, y,
      starType,
      faction:         'neutral' as FactionId,  // overwritten by assignFactions
      hazardLevel:     0 as HazardLevel,
      isNebula,
      isPirateZone:    false,
      isDangerous:     false,
      stations,
      asteroidBelts,
      anomalies,
      jumpConnections: [],
      constellationId: null,
      trafficDensity:  0,
    };
  });

  // 5. Jump lanes
  const jumpLanes = buildJumpLanes(systems);

  // 6. Faction territories + station factions
  const factionTerritories = assignFactions(rng, systems);

  // Fix station factions to match their system
  for (const sys of systems) {
    for (const st of sys.stations) {
      st.faction = sys.faction;
    }
  }

  // 7. Hazard levels
  assignHazards(rng, systems, nebulae, dangerousSectors);

  // 8. Constellations (after jump lanes are built)
  const constellations = buildConstellations(rng, systems);

  // 9. Traffic density
  assignTrafficDensity(systems);

  const systemsMap = new Map<string, StarSystem>(systems.map(s => [s.id, s]));

  return {
    seed,
    systems:           systemsMap,
    jumpLanes,
    constellations,
    nebulae,
    dangerousSectors,
    factionTerritories,
  };
}

// Singleton — generate once
let _galaxy: GalaxyData | null = null;

export function getGalaxy(seed = 31337): GalaxyData {
  if (!_galaxy) _galaxy = generateGalaxy(seed);
  return _galaxy;
}

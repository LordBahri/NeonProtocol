// ── Star types ────────────────────────────────────────────────────────────────

export type StarType =
  | 'yellow_dwarf'
  | 'red_dwarf'
  | 'blue_giant'
  | 'red_giant'
  | 'white_dwarf'
  | 'neutron'
  | 'binary';

export const STAR_COLORS: Record<StarType, number> = {
  yellow_dwarf: 0xffdd88,
  red_dwarf:    0xff5533,
  blue_giant:   0x88ccff,
  red_giant:    0xff7744,
  white_dwarf:  0xddeeff,
  neutron:      0xaabbff,
  binary:       0xffbb55,
};

export const STAR_RADII: Record<StarType, number> = {
  yellow_dwarf: 3,
  red_dwarf:    2,
  blue_giant:   5,
  red_giant:    6,
  white_dwarf:  2,
  neutron:      1.5,
  binary:       4,
};

// ── Factions ──────────────────────────────────────────────────────────────────

export type FactionId =
  | 'federation'
  | 'syndicate'
  | 'void_cult'
  | 'free_traders'
  | 'reavers'
  | 'neutral';

export interface FactionDef {
  id:          FactionId;
  name:        string;
  color:       number;
  rimColor:    [number, number, number];
  aggression:  number;
  description: string;
}

export const FACTION_DEFS: Record<FactionId, FactionDef> = {
  federation:   { id: 'federation',   name: 'Terran Federation', color: 0x0088ff, rimColor: [0.0,  0.55, 1.0],  aggression: 0.2, description: 'Law-enforcing core worlds' },
  syndicate:    { id: 'syndicate',    name: 'Neon Syndicate',    color: 0xff00aa, rimColor: [1.0,  0.0,  0.65], aggression: 0.5, description: 'Cybercrime & black markets' },
  void_cult:    { id: 'void_cult',    name: 'Void Cult',         color: 0x9900ff, rimColor: [0.6,  0.0,  1.0],  aggression: 0.8, description: 'Fanatical deep-space sect' },
  free_traders: { id: 'free_traders', name: 'Free Traders',      color: 0xffaa00, rimColor: [1.0,  0.67, 0.0],  aggression: 0.1, description: 'Independent merchant guilds' },
  reavers:      { id: 'reavers',      name: 'Reavers',           color: 0xff2200, rimColor: [1.0,  0.13, 0.0],  aggression: 1.0, description: 'Lawless outer-rim raiders' },
  neutral:      { id: 'neutral',      name: 'Neutral Space',     color: 0x445566, rimColor: [0.27, 0.33, 0.4],  aggression: 0.0, description: 'Unclaimed territory' },
};

// ── Hazard levels ─────────────────────────────────────────────────────────────

export type HazardLevel = 0 | 1 | 2 | 3 | 4;

export const HAZARD_COLORS: Record<HazardLevel, number> = {
  0: 0x00ff88,  // safe (green)
  1: 0xaaff00,  // low (yellow-green)
  2: 0xffaa00,  // medium (orange)
  3: 0xff4400,  // high (red-orange)
  4: 0xff00aa,  // null-sec (magenta)
};

// ── Points of interest ────────────────────────────────────────────────────────

export type StationType =
  | 'trading_post'
  | 'military_base'
  | 'refinery'
  | 'shipyard'
  | 'research_lab'
  | 'pirate_den';

export type AnomalyType =
  | 'derelict'
  | 'wormhole'
  | 'quantum_rift'
  | 'ghost_signal'
  | 'ancient_cache'
  | 'black_hole';

export interface Station {
  id:      string;
  type:    StationType;
  name:    string;
  faction: FactionId;
}

export interface AsteroidBelt {
  innerRadius: number;
  outerRadius: number;
  density:     number;
  richness:    number;  // mineral richness 0–1
}

export interface Anomaly {
  type:       AnomalyType;
  discovered: boolean;
}

// ── Star system ───────────────────────────────────────────────────────────────

export interface StarSystem {
  id:              string;
  name:            string;
  x:               number;  // galaxy-space coords
  y:               number;
  starType:        StarType;
  faction:         FactionId;
  hazardLevel:     HazardLevel;

  isNebula:        boolean;
  isPirateZone:    boolean;
  isDangerous:     boolean;

  stations:        Station[];
  asteroidBelts:   AsteroidBelt[];
  anomalies:       Anomaly[];

  jumpConnections: string[];     // IDs of connected systems
  constellationId: string | null;
  trafficDensity:  number;       // 0–1
}

// ── Jump lanes ────────────────────────────────────────────────────────────────

export interface JumpLane {
  fromId:    string;
  toId:      string;
  length:    number;
  isHighway: boolean;
}

// ── Constellations ────────────────────────────────────────────────────────────

export interface Constellation {
  id:        string;
  name:      string;
  systemIds: string[];
  centerX:   number;
  centerY:   number;
  color:     number;
}

// ── Nebula zones ──────────────────────────────────────────────────────────────

export interface NebulaZone {
  id:            string;
  x:             number;
  y:             number;
  radius:        number;
  color:         number;
  hazardBonus:   number;   // added to system hazard levels within
  sensorPenalty: number;   // 0–1, reduces scan range within
}

// ── Dangerous sectors ─────────────────────────────────────────────────────────

export type DangerType = 'void_storm' | 'radiation_belt' | 'asteroid_swarm' | 'null_sec';

export interface DangerousSector {
  x:       number;
  y:       number;
  radius:  number;
  type:    DangerType;
}

// ── NPC traffic ───────────────────────────────────────────────────────────────

export interface Convoy {
  id:           number;
  fromSystemId: string;
  toSystemId:   string;
  faction:      FactionId;
  progress:     number;   // 0–1
  speed:        number;   // progress/s
}

// ── Root galaxy data ──────────────────────────────────────────────────────────

export interface GalaxyData {
  seed:              number;
  systems:           Map<string, StarSystem>;
  jumpLanes:         JumpLane[];
  constellations:    Map<string, Constellation>;
  nebulae:           NebulaZone[];
  dangerousSectors:  DangerousSector[];
  factionTerritories: Map<FactionId, Set<string>>;
}

// ── Fog of war cell state ─────────────────────────────────────────────────────

export const FOW_HIDDEN   = 0;
export const FOW_REVEALED = 1;
export const FOW_EXPLORED = 2;

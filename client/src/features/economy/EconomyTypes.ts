// ── Item categories ───────────────────────────────────────────────────────────

export type OreType      = 'velite' | 'pyrite' | 'glacite' | 'voidite' | 'ferrite' | 'lumite';
export type MaterialType = 'iron_plate' | 'crystal_shard' | 'cryo_glass' | 'void_lattice' | 'steel_ingot' | 'plasma_cell';
export type GoodType     = 'hull_plating' | 'shield_array' | 'drive_core' | 'weapon_module' | 'nano_repairer';
export type ShipHullType = 'fighter_hull' | 'frigate_hull' | 'destroyer_hull';
export type BlueprintId  =
  | 'bp_hull_plating' | 'bp_shield_array' | 'bp_drive_core'
  | 'bp_weapon_module' | 'bp_nano_repairer'
  | 'bp_fighter_hull'  | 'bp_frigate_hull' | 'bp_destroyer_hull';

export type ItemType = OreType | MaterialType | GoodType | ShipHullType | BlueprintId;

// ── Item definitions ──────────────────────────────────────────────────────────

export interface ItemDef {
  id:          ItemType;
  name:        string;
  category:    'ore' | 'material' | 'good' | 'ship_hull' | 'blueprint';
  basePrice:   number;   // ISK
  volume:      number;   // cargo units per unit
  stackMax:    number;
  description: string;
}

export const ITEM_DEFS: Record<ItemType, ItemDef> = {
  // Ores
  velite:        { id: 'velite',        name: 'Velite',        category: 'ore',       basePrice: 20,    volume: 1,    stackMax: 10000, description: 'Common iron-rich asteroid ore' },
  pyrite:        { id: 'pyrite',        name: 'Pyrite',        category: 'ore',       basePrice: 80,    volume: 1,    stackMax: 10000, description: 'Crystalline mineral with optical properties' },
  glacite:       { id: 'glacite',       name: 'Glacite',       category: 'ore',       basePrice: 300,   volume: 1.5,  stackMax: 5000,  description: 'Rare icy mineral from comet debris' },
  voidite:       { id: 'voidite',       name: 'Voidite',       category: 'ore',       basePrice: 1200,  volume: 2,    stackMax: 2000,  description: 'Ultra-rare void-space crystalline matter' },
  ferrite:       { id: 'ferrite',       name: 'Ferrite',       category: 'ore',       basePrice: 15,    volume: 1,    stackMax: 10000, description: 'Low-grade bulk ferrous ore' },
  lumite:        { id: 'lumite',        name: 'Lumite',        category: 'ore',       basePrice: 150,   volume: 1.5,  stackMax: 5000,  description: 'Volatile bioluminescent mineral' },

  // Refined materials
  iron_plate:    { id: 'iron_plate',    name: 'Iron Plate',    category: 'material',  basePrice: 180,   volume: 3,    stackMax: 5000,  description: 'Standard structural alloy sheet' },
  crystal_shard: { id: 'crystal_shard', name: 'Crystal Shard', category: 'material',  basePrice: 720,   volume: 2,    stackMax: 3000,  description: 'Precision-cut optical crystal' },
  cryo_glass:    { id: 'cryo_glass',    name: 'Cryo Glass',    category: 'material',  basePrice: 2200,  volume: 2,    stackMax: 2000,  description: 'Cryogenically processed transparent alloy' },
  void_lattice:  { id: 'void_lattice',  name: 'Void Lattice',  category: 'material',  basePrice: 9000,  volume: 3,    stackMax: 500,   description: 'Exotic void-crystalline matrix' },
  steel_ingot:   { id: 'steel_ingot',   name: 'Steel Ingot',   category: 'material',  basePrice: 160,   volume: 3,    stackMax: 5000,  description: 'High-grade ferrous alloy ingot' },
  plasma_cell:   { id: 'plasma_cell',   name: 'Plasma Cell',   category: 'material',  basePrice: 1100,  volume: 2,    stackMax: 2000,  description: 'Encapsulated plasma energy store' },

  // Manufactured goods
  hull_plating:  { id: 'hull_plating',  name: 'Hull Plating',  category: 'good',      basePrice: 4500,  volume: 8,    stackMax: 200,   description: 'Reinforced composite hull panel' },
  shield_array:  { id: 'shield_array',  name: 'Shield Array',  category: 'good',      basePrice: 3200,  volume: 6,    stackMax: 200,   description: 'Modular energy shield emitter' },
  drive_core:    { id: 'drive_core',    name: 'Drive Core',    category: 'good',      basePrice: 5800,  volume: 10,   stackMax: 100,   description: 'High-thrust plasma drive assembly' },
  weapon_module: { id: 'weapon_module', name: 'Weapon Module', category: 'good',      basePrice: 2900,  volume: 5,    stackMax: 200,   description: 'Standardised hardpoint weapon pack' },
  nano_repairer: { id: 'nano_repairer', name: 'Nano Repairer', category: 'good',      basePrice: 2100,  volume: 4,    stackMax: 200,   description: 'Autonomous hull-repair nanobot injector' },

  // Ship hulls
  fighter_hull:  { id: 'fighter_hull',  name: 'Fighter Hull',  category: 'ship_hull', basePrice: 45000,  volume: 500,  stackMax: 1,    description: 'Lightweight strike-craft hull' },
  frigate_hull:  { id: 'frigate_hull',  name: 'Frigate Hull',  category: 'ship_hull', basePrice: 120000, volume: 1000, stackMax: 1,    description: 'Multi-role combat frigate hull' },
  destroyer_hull:{ id: 'destroyer_hull',name: 'Destroyer Hull',category: 'ship_hull', basePrice: 380000, volume: 2500, stackMax: 1,    description: 'Heavy destroyer hull frame' },

  // Blueprints
  bp_hull_plating:  { id: 'bp_hull_plating',  name: 'Hull Plating BPC',  category: 'blueprint', basePrice: 8000,   volume: 0.1, stackMax: 1, description: 'Blueprint copy — 10 runs' },
  bp_shield_array:  { id: 'bp_shield_array',  name: 'Shield Array BPC',  category: 'blueprint', basePrice: 6000,   volume: 0.1, stackMax: 1, description: 'Blueprint copy — 10 runs' },
  bp_drive_core:    { id: 'bp_drive_core',    name: 'Drive Core BPC',    category: 'blueprint', basePrice: 11000,  volume: 0.1, stackMax: 1, description: 'Blueprint copy — 10 runs' },
  bp_weapon_module: { id: 'bp_weapon_module', name: 'Weapon Module BPC', category: 'blueprint', basePrice: 5500,   volume: 0.1, stackMax: 1, description: 'Blueprint copy — 10 runs' },
  bp_nano_repairer: { id: 'bp_nano_repairer', name: 'Nano Repairer BPC', category: 'blueprint', basePrice: 4000,   volume: 0.1, stackMax: 1, description: 'Blueprint copy — 10 runs' },
  bp_fighter_hull:  { id: 'bp_fighter_hull',  name: 'Fighter Hull BPO',  category: 'blueprint', basePrice: 90000,  volume: 0.1, stackMax: 1, description: 'Blueprint original — unlimited' },
  bp_frigate_hull:  { id: 'bp_frigate_hull',  name: 'Frigate Hull BPO',  category: 'blueprint', basePrice: 240000, volume: 0.1, stackMax: 1, description: 'Blueprint original — unlimited' },
  bp_destroyer_hull:{ id: 'bp_destroyer_hull',name: 'Destroyer Hull BPO',category: 'blueprint', basePrice: 750000, volume: 0.1, stackMax: 1, description: 'Blueprint original — unlimited' },
};

// ── Refining recipes ──────────────────────────────────────────────────────────
// ore type → { inputQty, outputType, outputQty, timeSeconds }

export interface RefineRecipe {
  inputOre:    OreType;
  inputQty:    number;
  outputMat:   MaterialType;
  outputQty:   number;
  timeSeconds: number;
  efficiency:  number;   // % yield (modified by refinery equipment)
}

export const REFINE_RECIPES: Record<OreType, RefineRecipe> = {
  velite:  { inputOre: 'velite',  inputQty: 10, outputMat: 'iron_plate',    outputQty: 1,  timeSeconds: 60,  efficiency: 0.90 },
  ferrite: { inputOre: 'ferrite', inputQty: 12, outputMat: 'steel_ingot',   outputQty: 1,  timeSeconds: 75,  efficiency: 0.85 },
  pyrite:  { inputOre: 'pyrite',  inputQty: 10, outputMat: 'crystal_shard', outputQty: 1,  timeSeconds: 90,  efficiency: 0.88 },
  glacite: { inputOre: 'glacite', inputQty: 8,  outputMat: 'cryo_glass',    outputQty: 1,  timeSeconds: 120, efficiency: 0.82 },
  voidite: { inputOre: 'voidite', inputQty: 5,  outputMat: 'void_lattice',  outputQty: 1,  timeSeconds: 180, efficiency: 0.78 },
  lumite:  { inputOre: 'lumite',  inputQty: 6,  outputMat: 'plasma_cell',   outputQty: 1,  timeSeconds: 100, efficiency: 0.85 },
};

// ── Manufacturing blueprints ───────────────────────────────────────────────────

export interface ManufactureBlueprint {
  id:           BlueprintId;
  outputItem:   GoodType | ShipHullType;
  outputQty:    number;
  inputs:       Partial<Record<MaterialType | GoodType, number>>;
  timePerRun:   number;   // seconds per 1 run
  defaultRuns:  number;   // runs on a BPC copy
}

export const MANUFACTURE_BLUEPRINTS: Record<BlueprintId, ManufactureBlueprint> = {
  bp_hull_plating:  { id: 'bp_hull_plating',  outputItem: 'hull_plating',  outputQty: 1, inputs: { iron_plate: 5, steel_ingot: 3 },                           timePerRun: 120, defaultRuns: 10 },
  bp_shield_array:  { id: 'bp_shield_array',  outputItem: 'shield_array',  outputQty: 1, inputs: { crystal_shard: 4, plasma_cell: 2 },                        timePerRun: 100, defaultRuns: 10 },
  bp_drive_core:    { id: 'bp_drive_core',    outputItem: 'drive_core',    outputQty: 1, inputs: { iron_plate: 3, crystal_shard: 2, steel_ingot: 2 },          timePerRun: 150, defaultRuns: 10 },
  bp_weapon_module: { id: 'bp_weapon_module', outputItem: 'weapon_module', outputQty: 1, inputs: { iron_plate: 4, crystal_shard: 3 },                         timePerRun: 90,  defaultRuns: 10 },
  bp_nano_repairer: { id: 'bp_nano_repairer', outputItem: 'nano_repairer', outputQty: 1, inputs: { cryo_glass: 2, plasma_cell: 3 },                           timePerRun: 80,  defaultRuns: 10 },
  bp_fighter_hull:  { id: 'bp_fighter_hull',  outputItem: 'fighter_hull',  outputQty: 1, inputs: { hull_plating: 8, drive_core: 3, shield_array: 2, weapon_module: 4 }, timePerRun: 600, defaultRuns: -1 },
  bp_frigate_hull:  { id: 'bp_frigate_hull',  outputItem: 'frigate_hull',  outputQty: 1, inputs: { hull_plating: 20, drive_core: 8, shield_array: 6, weapon_module: 10, nano_repairer: 4 }, timePerRun: 1800, defaultRuns: -1 },
  bp_destroyer_hull:{ id: 'bp_destroyer_hull',outputItem: 'destroyer_hull',outputQty: 1, inputs: { hull_plating: 50, drive_core: 20, shield_array: 15, weapon_module: 25, nano_repairer: 10, cryo_glass: 8, void_lattice: 4 }, timePerRun: 4800, defaultRuns: -1 },
};

// ── Market types ──────────────────────────────────────────────────────────────

export interface MarketOrder {
  id:           string;
  type:         'buy' | 'sell';
  item:         ItemType;
  price:        number;        // ISK per unit
  qty:          number;        // original quantity
  qtyRemaining: number;
  ownerId:      string;
  stationId:    string;
  placedAt:     number;        // ms timestamp
  expiresAt:    number;
  isNPC:        boolean;
}

export interface PriceBar {
  t:      number;
  open:   number;
  high:   number;
  low:    number;
  close:  number;
  volume: number;
}

export interface OrderFill {
  orderId:   string;
  buyerId:   string;
  sellerId:  string;
  item:      ItemType;
  qty:       number;
  price:     number;
  buyerFee:  number;    // broker fee paid by buyer
  sellerTax: number;    // transaction tax paid by seller
}

// ── Industrial job ────────────────────────────────────────────────────────────

export type JobType = 'refine' | 'manufacture';

export interface IndustrialJob {
  id:           string;
  type:         JobType;
  stationId:    string;
  input:        Partial<Record<ItemType, number>>;
  output:       Partial<Record<ItemType, number>>;
  startedAt:    number;   // ms
  durationMs:   number;
  completed:    boolean;
  blueprintInstId?: string;
}

// ── Blueprint instance (owned by player) ─────────────────────────────────────

export interface BlueprintInstance {
  instId:      string;
  type:        BlueprintId;
  runsLeft:    number;   // -1 = BPO (unlimited)
  matEff:      number;   // 0-1: material efficiency (reduces material inputs)
  timeEff:     number;   // 0-1: time efficiency (reduces timePerRun)
}

// ── Freight contract ──────────────────────────────────────────────────────────

export type ContractStatus = 'available' | 'accepted' | 'in_transit' | 'completed' | 'failed' | 'expired';

export interface FreightContract {
  id:             string;
  fromStationId:  string;
  toStationId:    string;
  fromSystemName: string;
  toSystemName:   string;
  cargoType:      ItemType;
  cargoQty:       number;
  reward:         number;
  collateral:     number;
  riskLevel:      number;
  expiresAt:      number;
  acceptedBy:     string | null;
  status:         ContractStatus;
}

// ── Wreck loot ────────────────────────────────────────────────────────────────

export interface WreckLoot {
  entityId:    number;
  x:           number;
  y:           number;
  cargo:       Partial<Record<ItemType, number>>;
  expiresAt:   number;
}

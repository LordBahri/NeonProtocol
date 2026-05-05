import { defineComponent } from '../../core/ecs/ComponentRegistry.ts';
import type { EntityId } from '../../core/ecs/types.ts';
import { INVALID_ENTITY } from '../../core/ecs/types.ts';

// ── PhysicsComponent ──────────────────────────────────────────────────────────

export interface PhysicsData {
  thrustPower: number;
  reverseThrustFraction: number;
  torquePower: number;
  momentOfInertia: number;
  linearDamping: number;   // fraction of velocity lost per second (0 = frictionless, 1 = instant stop)
  angularDamping: number;
  boostMultiplier: number;
  boostFuelCost: number;
  warpCharging: boolean;   // set by WarpSystem; suppresses thrust
}

export const PhysicsComponent = defineComponent<PhysicsData>(
  'Physics',
  () => ({
    thrustPower: 300,
    reverseThrustFraction: 0.4,
    torquePower: 4.5,
    momentOfInertia: 0.6,
    linearDamping: 0.05,
    angularDamping: 0.10,
    boostMultiplier: 1.9,
    boostFuelCost: 20,
    warpCharging: false,
  }),
  (c) => {
    c.thrustPower = 300;
    c.reverseThrustFraction = 0.4;
    c.torquePower = 4.5;
    c.momentOfInertia = 0.6;
    c.linearDamping = 0.05;
    c.angularDamping = 0.10;
    c.boostMultiplier = 1.9;
    c.boostFuelCost = 20;
    c.warpCharging = false;
  },
);

// ── ArmorComponent ────────────────────────────────────────────────────────────

export interface ArmorData {
  foreArmor: number;
  aftArmor: number;
  portArmor: number;
  starboardArmor: number;
  foreArmorMax: number;
  aftArmorMax: number;
  portArmorMax: number;
  starboardArmorMax: number;
}

export const ArmorComponent = defineComponent<ArmorData>(
  'Armor',
  () => ({
    foreArmor: 30, aftArmor: 15, portArmor: 15, starboardArmor: 15,
    foreArmorMax: 30, aftArmorMax: 15, portArmorMax: 15, starboardArmorMax: 15,
  }),
  (c) => {
    c.foreArmor = 30; c.aftArmor = 15; c.portArmor = 15; c.starboardArmor = 15;
    c.foreArmorMax = 30; c.aftArmorMax = 15; c.portArmorMax = 15; c.starboardArmorMax = 15;
  },
);

// ── HeatComponent ─────────────────────────────────────────────────────────────

export interface HeatData {
  heat: number;
  maxHeat: number;
  dissipationRate: number;
  thrustHeatRate: number;
  weaponHeatAccum: number; // written by CombatSystem, consumed by HeatSystem each tick
  isOverheated: boolean;
  overheatTimer: number;
  overheatDuration: number;
}

export const HeatComponent = defineComponent<HeatData>(
  'Heat',
  () => ({
    heat: 0,
    maxHeat: 100,
    dissipationRate: 14,
    thrustHeatRate: 6,
    weaponHeatAccum: 0,
    isOverheated: false,
    overheatTimer: 0,
    overheatDuration: 4.0,
  }),
  (c) => {
    c.heat = 0;
    c.maxHeat = 100;
    c.dissipationRate = 14;
    c.thrustHeatRate = 6;
    c.weaponHeatAccum = 0;
    c.isOverheated = false;
    c.overheatTimer = 0;
    c.overheatDuration = 4.0;
  },
);

// ── FuelComponent ─────────────────────────────────────────────────────────────

export interface FuelData {
  fuel: number;
  maxFuel: number;
  consumptionRate: number;
  boostConsumptionRate: number;
}

export const FuelComponent = defineComponent<FuelData>(
  'Fuel',
  () => ({
    fuel: 160,
    maxFuel: 160,
    consumptionRate: 0.6,
    boostConsumptionRate: 20,
  }),
  (c) => {
    c.fuel = 160;
    c.maxFuel = 160;
    c.consumptionRate = 0.6;
    c.boostConsumptionRate = 20;
  },
);

// ── WarpDriveComponent ────────────────────────────────────────────────────────

export type WarpState = 'idle' | 'charging' | 'jumping' | 'cooldown';

export interface WarpDriveData {
  state: WarpState;
  chargeTimer: number;
  chargeRequired: number;
  jumpTimer: number;
  cooldownTimer: number;
  cooldownDuration: number;
  destinationX: number;
  destinationY: number;
  warpRange: number;
}

export const WarpDriveComponent = defineComponent<WarpDriveData>(
  'WarpDrive',
  () => ({
    state: 'idle',
    chargeTimer: 0,
    chargeRequired: 3.0,
    jumpTimer: 0,
    cooldownTimer: 0,
    cooldownDuration: 10,
    destinationX: 0,
    destinationY: 0,
    warpRange: 6000,
  }),
  (c) => {
    c.state = 'idle';
    c.chargeTimer = 0;
    c.chargeRequired = 3.0;
    c.jumpTimer = 0;
    c.cooldownTimer = 0;
    c.cooldownDuration = 10;
    c.destinationX = 0;
    c.destinationY = 0;
    c.warpRange = 6000;
  },
);

// ── MiningComponent ───────────────────────────────────────────────────────────

export interface MiningData {
  laserActive: boolean;
  targetEntityId: EntityId;
  miningRange: number;
  extractionRate: number;
  oreBuffer: number;
  oreThreshold: number;
}

export const MiningComponent = defineComponent<MiningData>(
  'Mining',
  () => ({
    laserActive: false,
    targetEntityId: INVALID_ENTITY,
    miningRange: 300,
    extractionRate: 5,
    oreBuffer: 0,
    oreThreshold: 10,
  }),
  (c) => {
    c.laserActive = false;
    c.targetEntityId = INVALID_ENTITY;
    c.miningRange = 300;
    c.extractionRate = 5;
    c.oreBuffer = 0;
    c.oreThreshold = 10;
  },
);

// ── WeaponSlotComponent ───────────────────────────────────────────────────────

export interface WeaponSlot {
  hardpointIndex: number;
  equippedType: string;  // '' = empty
  cooldownTimer: number;
}

export interface WeaponSlotData {
  slots: WeaponSlot[];
}

export const WeaponSlotComponent = defineComponent<WeaponSlotData>(
  'WeaponSlot',
  () => ({ slots: [] }),
  (c) => { c.slots = []; },
);

// ── UtilitySlotComponent ──────────────────────────────────────────────────────

export interface UtilitySlot {
  slotType: string;
  equippedModule: string; // '' = empty
  active: boolean;
  chargeLevel: number; // 0–1
}

export interface UtilitySlotData {
  slots: UtilitySlot[];
}

export const UtilitySlotComponent = defineComponent<UtilitySlotData>(
  'UtilitySlot',
  () => ({ slots: [] }),
  (c) => { c.slots = []; },
);

// ── DestructionComponent ──────────────────────────────────────────────────────

export type DestructionState = 'alive' | 'breached' | 'exploding' | 'dead';

export interface DestructionData {
  state: DestructionState;
  stateTimer: number;
  breachThreshold: number;   // hull fraction (0–1)
  explodeDuration: number;
  broadcastedBreached: boolean;
  broadcastedExploding: boolean;
  broadcastedDead: boolean;
}

export const DestructionComponent = defineComponent<DestructionData>(
  'Destruction',
  () => ({
    state: 'alive',
    stateTimer: 0,
    breachThreshold: 0.3,
    explodeDuration: 1.2,
    broadcastedBreached: false,
    broadcastedExploding: false,
    broadcastedDead: false,
  }),
  (c) => {
    c.state = 'alive';
    c.stateTimer = 0;
    c.breachThreshold = 0.3;
    c.explodeDuration = 1.2;
    c.broadcastedBreached = false;
    c.broadcastedExploding = false;
    c.broadcastedDead = false;
  },
);

// ── WreckComponent ────────────────────────────────────────────────────────────

export interface WreckData {
  age: number;
  fadeAfter: number;
  debrisCount: number;
  hasSpawnedDebris: boolean;
  debrisEntityIds: number[];
}

export const WreckComponent = defineComponent<WreckData>(
  'Wreck',
  () => ({
    age: 0,
    fadeAfter: 12.0,
    debrisCount: 6,
    hasSpawnedDebris: false,
    debrisEntityIds: [],
  }),
  (c) => {
    c.age = 0;
    c.fadeAfter = 12.0;
    c.debrisCount = 6;
    c.hasSpawnedDebris = false;
    c.debrisEntityIds = [];
  },
);

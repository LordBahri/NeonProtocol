// Pure data — no PixiJS, no ECS imports.
// Single source of truth for hull geometry shared by ShipFactory (simulation) and ThrusterFX (renderer).

export type ThrusterRole = 'main' | 'reverse' | 'lateral' | 'rcs';
export type WeaponSizeClass = 'small' | 'medium' | 'large';
export type UtilitySlotType = 'shield' | 'sensor' | 'mining' | 'utility';

/** Local-space position and exhaust direction (radians, 0 = +x right, π/2 = +y down). */
export interface ThrusterPort {
  localX: number;
  localY: number;
  exhaustAngle: number;
  role: ThrusterRole;
  thrustFraction: number; // relative power 0–1 vs main thruster
}

export interface WeaponHardpoint {
  localX: number;
  localY: number;
  sizeClass: WeaponSizeClass;
}

export interface UtilityHardpoint {
  localX: number;
  localY: number;
  slotType: UtilitySlotType;
}

export interface HullDefinition {
  key: string;
  class: string;
  spriteKey: string;
  scale: number;

  // Physics
  mass: number;
  momentOfInertia: number;
  thrustPower: number;
  reverseThrustFraction: number;
  torquePower: number;
  linearDamping: number;   // fraction of velocity remaining per second (e.g. 0.05 = 5% loss/s)
  angularDamping: number;
  boostMultiplier: number;
  boostFuelCost: number;   // fuel/second while boosting

  // Combat
  maxHull: number;
  maxShield: number;
  shieldRechargeRate: number;
  foreArmor: number;
  aftArmor: number;
  portArmor: number;
  starboardArmor: number;

  // Thermal / fuel
  maxHeat: number;
  heatDissipation: number;
  thrustHeatRate: number;
  maxFuel: number;
  fuelConsumptionRate: number;

  // Warp
  hasWarpDrive: boolean;
  warpChargeTime: number;
  warpCooldown: number;
  warpRange: number;

  // Hardpoints
  thrusters: ThrusterPort[];
  weaponHardpoints: WeaponHardpoint[];
  utilityHardpoints: UtilityHardpoint[];

  // Destruction
  breachThreshold: number; // hull fraction at which breached state starts
}

// ── Hull definitions ──────────────────────────────────────────────────────────

export const HULL_DEFINITIONS: Record<string, HullDefinition> = {

  interceptor: {
    key: 'interceptor',
    class: 'interceptor',
    spriteKey: 'ship_interceptor',
    scale: 0.8,
    mass: 0.6,
    momentOfInertia: 0.4,
    thrustPower: 380,
    reverseThrustFraction: 0.4,
    torquePower: 6.0,
    linearDamping: 0.04,
    angularDamping: 0.12,
    boostMultiplier: 2.2,
    boostFuelCost: 18,
    maxHull: 60,
    maxShield: 40,
    shieldRechargeRate: 6,
    foreArmor: 20, aftArmor: 10, portArmor: 10, starboardArmor: 10,
    maxHeat: 80,
    heatDissipation: 12,
    thrustHeatRate: 5,
    maxFuel: 120,
    fuelConsumptionRate: 0.5,
    hasWarpDrive: true,
    warpChargeTime: 2.5,
    warpCooldown: 8,
    warpRange: 8000,
    thrusters: [
      { localX: 0,   localY: 12, exhaustAngle: Math.PI / 2, role: 'main',    thrustFraction: 1.0 },
      { localX: -6,  localY: 8,  exhaustAngle: Math.PI / 2, role: 'rcs',     thrustFraction: 0.12 },
      { localX: 6,   localY: 8,  exhaustAngle: Math.PI / 2, role: 'rcs',     thrustFraction: 0.12 },
      { localX: 0,   localY: -16, exhaustAngle: -Math.PI / 2, role: 'reverse', thrustFraction: 0.3 },
    ],
    weaponHardpoints: [
      { localX: -8,  localY: -10, sizeClass: 'small' },
      { localX: 8,   localY: -10, sizeClass: 'small' },
    ],
    utilityHardpoints: [
      { localX: 0, localY: 0, slotType: 'utility' },
    ],
    breachThreshold: 0.25,
  },

  fighter: {
    key: 'fighter',
    class: 'fighter',
    spriteKey: 'ship_fighter',
    scale: 1.0,
    mass: 0.8,
    momentOfInertia: 0.6,
    thrustPower: 300,
    reverseThrustFraction: 0.4,
    torquePower: 4.5,
    linearDamping: 0.05,
    angularDamping: 0.10,
    boostMultiplier: 1.9,
    boostFuelCost: 20,
    maxHull: 80,
    maxShield: 60,
    shieldRechargeRate: 8,
    foreArmor: 30, aftArmor: 15, portArmor: 15, starboardArmor: 15,
    maxHeat: 100,
    heatDissipation: 14,
    thrustHeatRate: 6,
    maxFuel: 160,
    fuelConsumptionRate: 0.6,
    hasWarpDrive: true,
    warpChargeTime: 3.0,
    warpCooldown: 10,
    warpRange: 6000,
    thrusters: [
      { localX: -5,  localY: 12, exhaustAngle: Math.PI / 2, role: 'main',    thrustFraction: 1.0 },
      { localX: 5,   localY: 12, exhaustAngle: Math.PI / 2, role: 'main',    thrustFraction: 1.0 },
      { localX: -10, localY: 4,  exhaustAngle: Math.PI,     role: 'lateral', thrustFraction: 0.25 },
      { localX: 10,  localY: 4,  exhaustAngle: 0,           role: 'lateral', thrustFraction: 0.25 },
      { localX: -8,  localY: 8,  exhaustAngle: Math.PI / 2, role: 'rcs',     thrustFraction: 0.10 },
      { localX: 8,   localY: 8,  exhaustAngle: Math.PI / 2, role: 'rcs',     thrustFraction: 0.10 },
    ],
    weaponHardpoints: [
      { localX: -10, localY: -8,  sizeClass: 'small' },
      { localX: 10,  localY: -8,  sizeClass: 'small' },
      { localX: 0,   localY: -14, sizeClass: 'medium' },
    ],
    utilityHardpoints: [
      { localX: -5, localY: 0, slotType: 'shield' },
      { localX: 5,  localY: 0, slotType: 'utility' },
    ],
    breachThreshold: 0.3,
  },

  frigate: {
    key: 'frigate',
    class: 'frigate',
    spriteKey: 'ship_frigate',
    scale: 1.5,
    mass: 2.0,
    momentOfInertia: 1.5,
    thrustPower: 220,
    reverseThrustFraction: 0.35,
    torquePower: 2.8,
    linearDamping: 0.07,
    angularDamping: 0.08,
    boostMultiplier: 1.6,
    boostFuelCost: 30,
    maxHull: 200,
    maxShield: 150,
    shieldRechargeRate: 12,
    foreArmor: 60, aftArmor: 30, portArmor: 35, starboardArmor: 35,
    maxHeat: 160,
    heatDissipation: 20,
    thrustHeatRate: 8,
    maxFuel: 280,
    fuelConsumptionRate: 1.0,
    hasWarpDrive: true,
    warpChargeTime: 5.0,
    warpCooldown: 18,
    warpRange: 4000,
    thrusters: [
      { localX: -8,  localY: 18, exhaustAngle: Math.PI / 2, role: 'main',    thrustFraction: 1.0 },
      { localX: 8,   localY: 18, exhaustAngle: Math.PI / 2, role: 'main',    thrustFraction: 1.0 },
      { localX: -14, localY: 6,  exhaustAngle: Math.PI,     role: 'lateral', thrustFraction: 0.3 },
      { localX: 14,  localY: 6,  exhaustAngle: 0,           role: 'lateral', thrustFraction: 0.3 },
      { localX: 0,   localY: -22, exhaustAngle: -Math.PI / 2, role: 'reverse', thrustFraction: 0.35 },
      { localX: -10, localY: 14, exhaustAngle: Math.PI / 2, role: 'rcs',     thrustFraction: 0.08 },
      { localX: 10,  localY: 14, exhaustAngle: Math.PI / 2, role: 'rcs',     thrustFraction: 0.08 },
    ],
    weaponHardpoints: [
      { localX: -15, localY: -6, sizeClass: 'medium' },
      { localX: 15,  localY: -6, sizeClass: 'medium' },
      { localX: 0,   localY: -18, sizeClass: 'large' },
    ],
    utilityHardpoints: [
      { localX: -8,  localY: 2, slotType: 'shield' },
      { localX: 8,   localY: 2, slotType: 'shield' },
      { localX: 0,   localY: 6, slotType: 'sensor' },
    ],
    breachThreshold: 0.3,
  },

  destroyer: {
    key: 'destroyer',
    class: 'destroyer',
    spriteKey: 'ship_destroyer',
    scale: 2.2,
    mass: 5.0,
    momentOfInertia: 4.0,
    thrustPower: 150,
    reverseThrustFraction: 0.3,
    torquePower: 1.5,
    linearDamping: 0.10,
    angularDamping: 0.06,
    boostMultiplier: 1.4,
    boostFuelCost: 50,
    maxHull: 500,
    maxShield: 300,
    shieldRechargeRate: 20,
    foreArmor: 150, aftArmor: 80, portArmor: 100, starboardArmor: 100,
    maxHeat: 300,
    heatDissipation: 35,
    thrustHeatRate: 12,
    maxFuel: 500,
    fuelConsumptionRate: 2.0,
    hasWarpDrive: true,
    warpChargeTime: 8.0,
    warpCooldown: 30,
    warpRange: 3000,
    thrusters: [
      { localX: -12, localY: 26, exhaustAngle: Math.PI / 2, role: 'main',    thrustFraction: 1.0 },
      { localX: 12,  localY: 26, exhaustAngle: Math.PI / 2, role: 'main',    thrustFraction: 1.0 },
      { localX: -20, localY: 10, exhaustAngle: Math.PI,     role: 'lateral', thrustFraction: 0.3 },
      { localX: 20,  localY: 10, exhaustAngle: 0,           role: 'lateral', thrustFraction: 0.3 },
      { localX: 0,   localY: -30, exhaustAngle: -Math.PI / 2, role: 'reverse', thrustFraction: 0.3 },
      { localX: -14, localY: 20, exhaustAngle: Math.PI / 2, role: 'rcs',     thrustFraction: 0.06 },
      { localX: 14,  localY: 20, exhaustAngle: Math.PI / 2, role: 'rcs',     thrustFraction: 0.06 },
      { localX: -16, localY: 2,  exhaustAngle: Math.PI,     role: 'rcs',     thrustFraction: 0.06 },
      { localX: 16,  localY: 2,  exhaustAngle: 0,           role: 'rcs',     thrustFraction: 0.06 },
    ],
    weaponHardpoints: [
      { localX: -20, localY: -10, sizeClass: 'large' },
      { localX: 20,  localY: -10, sizeClass: 'large' },
      { localX: -10, localY: -18, sizeClass: 'medium' },
      { localX: 10,  localY: -18, sizeClass: 'medium' },
    ],
    utilityHardpoints: [
      { localX: -8,  localY: -4, slotType: 'shield' },
      { localX: 8,   localY: -4, slotType: 'shield' },
      { localX: -4,  localY: 6,  slotType: 'sensor' },
      { localX: 4,   localY: 6,  slotType: 'utility' },
    ],
    breachThreshold: 0.35,
  },

  cruiser: {
    key: 'cruiser',
    class: 'cruiser',
    spriteKey: 'ship_cruiser',
    scale: 2.8,
    mass: 8.0,
    momentOfInertia: 6.5,
    thrustPower: 130,
    reverseThrustFraction: 0.28,
    torquePower: 1.2,
    linearDamping: 0.09,
    angularDamping: 0.07,
    boostMultiplier: 1.45,
    boostFuelCost: 55,
    maxHull: 700,
    maxShield: 450,
    shieldRechargeRate: 28,
    foreArmor: 200, aftArmor: 110, portArmor: 140, starboardArmor: 140,
    maxHeat: 400,
    heatDissipation: 45,
    thrustHeatRate: 14,
    maxFuel: 650,
    fuelConsumptionRate: 2.8,
    hasWarpDrive: true,
    warpChargeTime: 9.0,
    warpCooldown: 35,
    warpRange: 3500,
    thrusters: [
      { localX: -14, localY: 30, exhaustAngle: Math.PI / 2, role: 'main',    thrustFraction: 1.0 },
      { localX:  14, localY: 30, exhaustAngle: Math.PI / 2, role: 'main',    thrustFraction: 1.0 },
      { localX: -24, localY: 12, exhaustAngle: Math.PI,     role: 'lateral', thrustFraction: 0.28 },
      { localX:  24, localY: 12, exhaustAngle: 0,           role: 'lateral', thrustFraction: 0.28 },
      { localX:   0, localY: -38, exhaustAngle: -Math.PI / 2, role: 'reverse', thrustFraction: 0.28 },
      { localX: -16, localY: 24, exhaustAngle: Math.PI / 2, role: 'rcs',     thrustFraction: 0.05 },
      { localX:  16, localY: 24, exhaustAngle: Math.PI / 2, role: 'rcs',     thrustFraction: 0.05 },
      { localX: -20, localY: 2,  exhaustAngle: Math.PI,     role: 'rcs',     thrustFraction: 0.05 },
      { localX:  20, localY: 2,  exhaustAngle: 0,           role: 'rcs',     thrustFraction: 0.05 },
    ],
    weaponHardpoints: [
      { localX: -24, localY: -12, sizeClass: 'large' },
      { localX:  24, localY: -12, sizeClass: 'large' },
      { localX: -12, localY: -22, sizeClass: 'medium' },
      { localX:  12, localY: -22, sizeClass: 'medium' },
      { localX:   0, localY: -30, sizeClass: 'large' },
    ],
    utilityHardpoints: [
      { localX: -10, localY: -4, slotType: 'shield' },
      { localX:  10, localY: -4, slotType: 'shield' },
      { localX:  -4, localY:  6, slotType: 'sensor' },
      { localX:   4, localY:  6, slotType: 'utility' },
      { localX:   0, localY: 14, slotType: 'utility' },
    ],
    breachThreshold: 0.35,
  },

  hauler: {
    key: 'hauler',
    class: 'hauler',
    spriteKey: 'ship_hauler',
    scale: 2.5,
    mass: 6.0,
    momentOfInertia: 5.5,
    thrustPower: 100,
    reverseThrustFraction: 0.25,
    torquePower: 1.0,
    linearDamping: 0.12,
    angularDamping: 0.05,
    boostMultiplier: 1.3,
    boostFuelCost: 40,
    maxHull: 300,
    maxShield: 120,
    shieldRechargeRate: 8,
    foreArmor: 60, aftArmor: 40, portArmor: 50, starboardArmor: 50,
    maxHeat: 200,
    heatDissipation: 20,
    thrustHeatRate: 10,
    maxFuel: 800,
    fuelConsumptionRate: 2.5,
    hasWarpDrive: true,
    warpChargeTime: 10.0,
    warpCooldown: 40,
    warpRange: 2000,
    thrusters: [
      { localX: -15, localY: 28, exhaustAngle: Math.PI / 2, role: 'main',    thrustFraction: 1.0 },
      { localX: 15,  localY: 28, exhaustAngle: Math.PI / 2, role: 'main',    thrustFraction: 1.0 },
      { localX: -22, localY: 14, exhaustAngle: Math.PI,     role: 'lateral', thrustFraction: 0.25 },
      { localX: 22,  localY: 14, exhaustAngle: 0,           role: 'lateral', thrustFraction: 0.25 },
      { localX: -18, localY: 22, exhaustAngle: Math.PI / 2, role: 'rcs',     thrustFraction: 0.05 },
      { localX: 18,  localY: 22, exhaustAngle: Math.PI / 2, role: 'rcs',     thrustFraction: 0.05 },
    ],
    weaponHardpoints: [],
    utilityHardpoints: [
      { localX: -12, localY: -4, slotType: 'shield' },
      { localX: 12,  localY: -4, slotType: 'shield' },
      { localX: -6,  localY: 4,  slotType: 'sensor' },
      { localX: 6,   localY: 4,  slotType: 'sensor' },
      { localX: 0,   localY: -8, slotType: 'utility' },
      { localX: 0,   localY: 8,  slotType: 'utility' },
    ],
    breachThreshold: 0.4,
  },

  mining_barge: {
    key: 'mining_barge',
    class: 'mining_barge',
    spriteKey: 'ship_mining_barge',
    scale: 2.0,
    mass: 4.5,
    momentOfInertia: 4.8,
    thrustPower: 120,
    reverseThrustFraction: 0.3,
    torquePower: 1.2,
    linearDamping: 0.11,
    angularDamping: 0.05,
    boostMultiplier: 1.2,
    boostFuelCost: 35,
    maxHull: 250,
    maxShield: 100,
    shieldRechargeRate: 6,
    foreArmor: 50, aftArmor: 30, portArmor: 40, starboardArmor: 40,
    maxHeat: 200,
    heatDissipation: 18,
    thrustHeatRate: 9,
    maxFuel: 600,
    fuelConsumptionRate: 1.8,
    hasWarpDrive: false,
    warpChargeTime: 999,
    warpCooldown: 999,
    warpRange: 0,
    thrusters: [
      { localX: -10, localY: 22, exhaustAngle: Math.PI / 2, role: 'main',    thrustFraction: 1.0 },
      { localX: 10,  localY: 22, exhaustAngle: Math.PI / 2, role: 'main',    thrustFraction: 1.0 },
      { localX: -18, localY: 8,  exhaustAngle: Math.PI,     role: 'lateral', thrustFraction: 0.28 },
      { localX: 18,  localY: 8,  exhaustAngle: 0,           role: 'lateral', thrustFraction: 0.28 },
      { localX: -18, localY: -4, exhaustAngle: Math.PI,     role: 'lateral', thrustFraction: 0.28 },
      { localX: 18,  localY: -4, exhaustAngle: 0,           role: 'lateral', thrustFraction: 0.28 },
      { localX: -12, localY: 16, exhaustAngle: Math.PI / 2, role: 'rcs',     thrustFraction: 0.05 },
      { localX: 12,  localY: 16, exhaustAngle: Math.PI / 2, role: 'rcs',     thrustFraction: 0.05 },
    ],
    weaponHardpoints: [
      { localX: -16, localY: -8, sizeClass: 'small' },
      { localX: 16,  localY: -8, sizeClass: 'small' },
    ],
    utilityHardpoints: [
      { localX: -8,  localY: -6, slotType: 'mining' },
      { localX: 8,   localY: -6, slotType: 'mining' },
      { localX: 0,   localY: -10, slotType: 'mining' },
      { localX: -6,  localY: 4,  slotType: 'shield' },
      { localX: 6,   localY: 4,  slotType: 'sensor' },
      { localX: 0,   localY: 8,  slotType: 'utility' },
    ],
    breachThreshold: 0.4,
  },
};

// Legacy blueprint aliases so ShipFactory doesn't break during migration
export const LEGACY_KEY_MAP: Record<string, string> = {
  fighter:   'fighter',
  frigate:   'frigate',
  destroyer: 'destroyer',
};

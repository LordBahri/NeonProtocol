import type { World } from '../../core/ecs/World.ts';
import type { EntityId } from '../../core/ecs/types.ts';
import {
  TransformComponent,
  VelocityComponent,
  ThrustComponent,
  ShipStatsComponent,
  PlayerInputComponent,
  NetworkSyncComponent,
  VisualComponent,
} from './ShipComponents.ts';
import {
  PhysicsComponent,
  ArmorComponent,
  HeatComponent,
  FuelComponent,
  WarpDriveComponent,
  MiningComponent,
  WeaponSlotComponent,
  UtilitySlotComponent,
  DestructionComponent,
} from './ShipSystemComponents.ts';
import { HULL_DEFINITIONS } from './ShipDefinitions.ts';
import type { HullDefinition } from './ShipDefinitions.ts';

export interface SpawnOptions {
  withWarpDrive?: boolean;
  withMining?: boolean;
  serverId?: string;
  isLocalPlayer?: boolean;
}

export function spawnShip(
  world: World,
  hullKey: string,
  x: number,
  y: number,
  opts: SpawnOptions = {},
): EntityId {
  const hull: HullDefinition = HULL_DEFINITIONS[hullKey] ?? HULL_DEFINITIONS['fighter']!;
  const { isLocalPlayer = false, serverId = '' } = opts;

  const entity = world.createEntity();

  // ── Core ECS components (kept for backward-compat / renderer / network) ──
  world.addComponent(entity, TransformComponent, { x, y, prevX: x, prevY: y });
  world.addComponent(entity, VelocityComponent);
  world.addComponent(entity, ThrustComponent, {
    maxSpeed:      hull.thrustPower,
    acceleration:  hull.thrustPower,
    drag:          1 - hull.linearDamping,
    rotationSpeed: hull.torquePower,
  });
  world.addComponent(entity, ShipStatsComponent, {
    maxHull:          hull.maxHull,
    hull:             hull.maxHull,
    maxShield:        hull.maxShield,
    shield:           hull.maxShield,
    shieldRechargeRate: hull.shieldRechargeRate,
    mass:             hull.mass,
    class:            hull.class,
  });
  world.addComponent(entity, VisualComponent, {
    spriteKey: hull.spriteKey,
    scale:     hull.scale,
  });
  world.addComponent(entity, NetworkSyncComponent, { serverId, isLocalPlayer });

  // ── Physics (inertia system) ──
  world.addComponent(entity, PhysicsComponent, {
    thrustPower:          hull.thrustPower,
    reverseThrustFraction: hull.reverseThrustFraction,
    torquePower:          hull.torquePower,
    momentOfInertia:      hull.momentOfInertia,
    linearDamping:        hull.linearDamping,
    angularDamping:       hull.angularDamping,
    boostMultiplier:      hull.boostMultiplier,
    boostFuelCost:        hull.boostFuelCost,
    warpCharging:         false,
  });

  // ── Directional armor ──
  world.addComponent(entity, ArmorComponent, {
    foreArmor:       hull.foreArmor,
    aftArmor:        hull.aftArmor,
    portArmor:       hull.portArmor,
    starboardArmor:  hull.starboardArmor,
    foreArmorMax:    hull.foreArmor,
    aftArmorMax:     hull.aftArmor,
    portArmorMax:    hull.portArmor,
    starboardArmorMax: hull.starboardArmor,
  });

  // ── Thermal ──
  world.addComponent(entity, HeatComponent, {
    maxHeat:        hull.maxHeat,
    dissipationRate: hull.heatDissipation,
    thrustHeatRate: hull.thrustHeatRate,
  });

  // ── Fuel ──
  world.addComponent(entity, FuelComponent, {
    fuel:                hull.maxFuel,
    maxFuel:             hull.maxFuel,
    consumptionRate:     hull.fuelConsumptionRate,
    boostConsumptionRate: hull.boostFuelCost,
  });

  // ── Warp drive ──
  const wantWarp = opts.withWarpDrive ?? hull.hasWarpDrive;
  if (wantWarp) {
    world.addComponent(entity, WarpDriveComponent, {
      chargeRequired:  hull.warpChargeTime,
      cooldownDuration: hull.warpCooldown,
      warpRange:       hull.warpRange,
    });
  }

  // ── Mining ──
  if (opts.withMining) {
    world.addComponent(entity, MiningComponent);
  }

  // ── Weapon slots (one per hardpoint) ──
  world.addComponent(entity, WeaponSlotComponent, {
    slots: hull.weaponHardpoints.map((_hp, idx) => ({
      hardpointIndex: idx,
      equippedType: '',
      cooldownTimer: 0,
    })),
  });

  // ── Utility slots ──
  world.addComponent(entity, UtilitySlotComponent, {
    slots: hull.utilityHardpoints.map((hp) => ({
      slotType:       hp.slotType,
      equippedModule: '',
      active:         false,
      chargeLevel:    0,
    })),
  });

  // ── Destruction FSM ──
  world.addComponent(entity, DestructionComponent, {
    breachThreshold: hull.breachThreshold,
  });

  // ── Player input (local player only) ──
  if (isLocalPlayer) {
    world.addComponent(entity, PlayerInputComponent);
  }

  return entity;
}

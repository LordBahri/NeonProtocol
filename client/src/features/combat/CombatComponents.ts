import { defineComponent } from '../../core/ecs/ComponentRegistry.ts';
import type { EntityId } from '../../core/ecs/types.ts';
import { INVALID_ENTITY } from '../../core/ecs/types.ts';

// ─── AI Combat ───────────────────────────────────────────────────────────────

export type AIState =
  | 'patrol'
  | 'approach'
  | 'orbit'
  | 'kite'
  | 'retreat'
  | 'coordinate';

export interface AICombatData {
  state: AIState;
  /** Current orbit angle in radians; advances each frame. */
  orbitAngle: number;
  /** Optimal combat distance from target in pixels. */
  orbitRadius: number;
  /** +1 = clockwise, -1 = counter-clockwise. */
  orbitDir: number;
  retreatX: number;
  retreatY: number;
  /** Seconds spent in the current state — used to debounce transitions. */
  stateTimer: number;
  /** Fleet coordination target; INVALID_ENTITY = no coordination. */
  fleetFocusTarget: EntityId;
}

export const AICombatComponent = defineComponent<AICombatData>(
  'AICombat',
  (): AICombatData => ({
    state: 'patrol',
    orbitAngle: 0,
    orbitRadius: 300,
    orbitDir: 1,
    retreatX: 0,
    retreatY: 0,
    stateTimer: 0,
    fleetFocusTarget: INVALID_ENTITY,
  }),
  (c: AICombatData): void => {
    c.state = 'patrol';
    c.orbitAngle = 0;
    c.orbitRadius = 300;
    c.orbitDir = 1;
    c.retreatX = 0;
    c.retreatY = 0;
    c.stateTimer = 0;
    c.fleetFocusTarget = INVALID_ENTITY;
  },
);

// ─── Lock-on Targeting ───────────────────────────────────────────────────────

export interface TargetingData {
  lockedTarget: EntityId;
  /** 0-1, where 1 = full lock acquired. */
  lockProgress: number;
  /** Seconds required to reach full lock. */
  lockTime: number;
  /** Maximum targeting range in pixels. */
  range: number;
  /** World-space intercept position for aim prediction. */
  predictedX: number;
  predictedY: number;
}

export const TargetingComponent = defineComponent<TargetingData>(
  'Targeting',
  (): TargetingData => ({
    lockedTarget: INVALID_ENTITY,
    lockProgress: 0,
    lockTime: 1.5,
    range: 600,
    predictedX: 0,
    predictedY: 0,
  }),
  (c: TargetingData): void => {
    c.lockedTarget = INVALID_ENTITY;
    c.lockProgress = 0;
    c.lockTime = 1.5;
    c.range = 600;
    c.predictedX = 0;
    c.predictedY = 0;
  },
);

// ─── Module State ────────────────────────────────────────────────────────────

export type ModuleSlot = 'shields' | 'engines' | 'weapons' | 'sensors';

export interface ModuleStateData {
  /** Whether the shields module is currently online. */
  shields: boolean;
  /** Whether the engines module is currently online. */
  engines: boolean;
  /** Whether the weapons module is currently online. */
  weapons: boolean;
  /** Whether the sensors module is currently online. */
  sensors: boolean;
  /** Remaining seconds until shields come back online (0 = online). */
  shieldsTimer: number;
  /** Remaining seconds until engines come back online (0 = online). */
  enginesTimer: number;
  /** Remaining seconds until weapons come back online (0 = online). */
  weaponsTimer: number;
  /** Remaining seconds until sensors come back online (0 = online). */
  sensorsTimer: number;
}

export const ModuleStateComponent = defineComponent<ModuleStateData>(
  'ModuleState',
  (): ModuleStateData => ({
    shields: true,
    engines: true,
    weapons: true,
    sensors: true,
    shieldsTimer: 0,
    enginesTimer: 0,
    weaponsTimer: 0,
    sensorsTimer: 0,
  }),
  (c: ModuleStateData): void => {
    c.shields = true;
    c.engines = true;
    c.weapons = true;
    c.sensors = true;
    c.shieldsTimer = 0;
    c.enginesTimer = 0;
    c.weaponsTimer = 0;
    c.sensorsTimer = 0;
  },
);

// ─── Damage State ────────────────────────────────────────────────────────────

export interface DamageStateData {
  /** Flat damage reduction factor (0-1). Reduced by armorPen on attacker. */
  armorRating: number;
  /** Simulation time of the last damage event (for cooldown logic). */
  lastHitTime: number;
  /** World-space angle from which the last hit arrived (radians). */
  lastHitDir: number;
  /** Modules that are permanently disrupted until repaired by support. */
  criticalModules: ModuleSlot[];
  /** Countdown in seconds while EMP visual flicker is active (0 = none). */
  empFlickerTimer: number;
}

export const DamageStateComponent = defineComponent<DamageStateData>(
  'DamageState',
  (): DamageStateData => ({
    armorRating: 0.15,
    lastHitTime: 0,
    lastHitDir: 0,
    criticalModules: [],
    empFlickerTimer: 0,
  }),
  (c: DamageStateData): void => {
    c.armorRating = 0.15;
    c.lastHitTime = 0;
    c.lastHitDir = 0;
    c.criticalModules = [];
    c.empFlickerTimer = 0;
  },
);

// ─── Active Beam ─────────────────────────────────────────────────────────────

export interface ActiveBeamData {
  /** Whether the beam is currently firing. */
  active: boolean;
  /** Entity the beam is locked onto. */
  targetEntity: EntityId;
  /** 0xRRGGBB tint matching the weapon definition. */
  color: number;
  /** Render width of the beam in pixels. */
  width: number;
  /** Remaining fire time in seconds before the beam deactivates. */
  timer: number;
}

export const ActiveBeamComponent = defineComponent<ActiveBeamData>(
  'ActiveBeam',
  (): ActiveBeamData => ({
    active: false,
    targetEntity: INVALID_ENTITY,
    color: 0x00ccff,
    width: 3,
    timer: 0,
  }),
  (c: ActiveBeamData): void => {
    c.active = false;
    c.targetEntity = INVALID_ENTITY;
    c.color = 0x00ccff;
    c.width = 3;
    c.timer = 0;
  },
);

// ─── Drone Carrier ───────────────────────────────────────────────────────────

export interface DroneCarrierData {
  /** Maximum number of drones this carrier can field simultaneously. */
  maxDrones: number;
  /** EntityIds of currently live drone entities. */
  activeDrones: EntityId[];
  /** Cooldown in seconds before the next drone can be launched. */
  launchCooldown: number;
}

export const DroneCarrierComponent = defineComponent<DroneCarrierData>(
  'DroneCarrier',
  (): DroneCarrierData => ({
    maxDrones: 3,
    activeDrones: [],
    launchCooldown: 0,
  }),
  (c: DroneCarrierData): void => {
    c.maxDrones = 3;
    c.activeDrones = [];
    c.launchCooldown = 0;
  },
);

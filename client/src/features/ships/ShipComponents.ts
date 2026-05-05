import { defineComponent } from '../../core/ecs/ComponentRegistry.ts';

export interface TransformData {
  x: number;
  y: number;
  angle: number;
  prevX: number;
  prevY: number;
  prevAngle: number;
}

export interface VelocityData {
  vx: number;
  vy: number;
  angularVelocity: number;
}

export interface ThrustData {
  thrust: number;
  maxSpeed: number;
  acceleration: number;
  drag: number;
  rotationSpeed: number;
}

export interface ShipStatsData {
  hull: number;
  maxHull: number;
  shield: number;
  maxShield: number;
  shieldRechargeRate: number;
  shieldRechargeDelay: number;
  lastDamageTime: number;
  mass: number;
  class: string;
}

export interface PlayerInputData {
  thrustForward: boolean;
  thrustBack: boolean;
  rotateLeft: boolean;
  rotateRight: boolean;
  fire: boolean;
  targetX: number;
  targetY: number;
  boost: boolean;
  activateWarp: boolean;
}

export interface NetworkSyncData {
  serverId: string;
  isLocalPlayer: boolean;
  lastServerX: number;
  lastServerY: number;
  lastServerAngle: number;
  lastServerTick: number;
  interpolationFactor: number;
}

export interface VisualData {
  spriteKey: string;
  engineGlowIntensity: number;
  shieldGlowAlpha: number;
  damageFlashTimer: number;
  scale: number;
}

export const TransformComponent = defineComponent<TransformData>(
  'Transform',
  () => ({ x: 0, y: 0, angle: 0, prevX: 0, prevY: 0, prevAngle: 0 }),
  (c) => { c.x = 0; c.y = 0; c.angle = 0; c.prevX = 0; c.prevY = 0; c.prevAngle = 0; },
);

export const VelocityComponent = defineComponent<VelocityData>(
  'Velocity',
  () => ({ vx: 0, vy: 0, angularVelocity: 0 }),
  (c) => { c.vx = 0; c.vy = 0; c.angularVelocity = 0; },
);

export const ThrustComponent = defineComponent<ThrustData>(
  'Thrust',
  () => ({ thrust: 0, maxSpeed: 400, acceleration: 200, drag: 0.92, rotationSpeed: 2.5 }),
  (c) => { c.thrust = 0; c.maxSpeed = 400; c.acceleration = 200; c.drag = 0.92; c.rotationSpeed = 2.5; },
);

export const ShipStatsComponent = defineComponent<ShipStatsData>(
  'ShipStats',
  () => ({
    hull: 100, maxHull: 100,
    shield: 100, maxShield: 100,
    shieldRechargeRate: 5,
    shieldRechargeDelay: 3,
    lastDamageTime: 0,
    mass: 1,
    class: 'fighter',
  }),
  (c) => {
    c.hull = 100; c.maxHull = 100;
    c.shield = 100; c.maxShield = 100;
    c.shieldRechargeRate = 5;
    c.shieldRechargeDelay = 3;
    c.lastDamageTime = 0;
    c.mass = 1;
    c.class = 'fighter';
  },
);

export const PlayerInputComponent = defineComponent<PlayerInputData>(
  'PlayerInput',
  () => ({
    thrustForward: false, thrustBack: false,
    rotateLeft: false, rotateRight: false,
    fire: false, targetX: 0, targetY: 0,
    boost: false, activateWarp: false,
  }),
  (c) => {
    c.thrustForward = false; c.thrustBack = false;
    c.rotateLeft = false; c.rotateRight = false;
    c.fire = false; c.targetX = 0; c.targetY = 0;
    c.boost = false; c.activateWarp = false;
  },
);

export const NetworkSyncComponent = defineComponent<NetworkSyncData>(
  'NetworkSync',
  () => ({
    serverId: '',
    isLocalPlayer: false,
    lastServerX: 0, lastServerY: 0, lastServerAngle: 0,
    lastServerTick: 0, interpolationFactor: 0.2,
  }),
  (c) => {
    c.serverId = '';
    c.isLocalPlayer = false;
    c.lastServerX = 0; c.lastServerY = 0; c.lastServerAngle = 0;
    c.lastServerTick = 0; c.interpolationFactor = 0.2;
  },
);

export const VisualComponent = defineComponent<VisualData>(
  'Visual',
  () => ({
    spriteKey: 'ship_fighter',
    engineGlowIntensity: 0,
    shieldGlowAlpha: 0,
    damageFlashTimer: 0,
    scale: 1,
  }),
  (c) => {
    c.spriteKey = 'ship_fighter';
    c.engineGlowIntensity = 0;
    c.shieldGlowAlpha = 0;
    c.damageFlashTimer = 0;
    c.scale = 1;
  },
);

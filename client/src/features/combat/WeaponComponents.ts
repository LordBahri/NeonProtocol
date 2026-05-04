import { defineComponent } from '../../core/ecs/ComponentRegistry.ts';
import type { EntityId } from '../../core/ecs/types.ts';
import { INVALID_ENTITY } from '../../core/ecs/types.ts';

export interface WeaponData {
  type: 'laser' | 'cannon' | 'missile';
  damage: number;
  projectileSpeed: number;
  range: number;
  fireRate: number;
  lastFiredTime: number;
  energyCost: number;
  color: number;
  size: number;
}

export interface ProjectileData {
  ownerEntity: EntityId;
  vx: number;
  vy: number;
  damage: number;
  range: number;
  distanceTraveled: number;
  color: number;
  size: number;
  active: boolean;
  type: 'laser' | 'cannon' | 'missile';
}

export interface TargetData {
  targetEntity: EntityId;
  lockTimer: number;
  lockDuration: number;
  isLocked: boolean;
}

export const WeaponComponent = defineComponent<WeaponData>(
  'Weapon',
  () => ({
    type: 'laser',
    damage: 10,
    projectileSpeed: 800,
    range: 600,
    fireRate: 5,
    lastFiredTime: 0,
    energyCost: 5,
    color: 0x00ffff,
    size: 3,
  }),
  (c) => {
    c.type = 'laser';
    c.damage = 10;
    c.projectileSpeed = 800;
    c.range = 600;
    c.fireRate = 5;
    c.lastFiredTime = 0;
    c.energyCost = 5;
    c.color = 0x00ffff;
    c.size = 3;
  },
);

export const ProjectileComponent = defineComponent<ProjectileData>(
  'Projectile',
  () => ({
    ownerEntity: INVALID_ENTITY,
    vx: 0, vy: 0,
    damage: 10,
    range: 600,
    distanceTraveled: 0,
    color: 0x00ffff,
    size: 3,
    active: false,
    type: 'laser',
  }),
  (c) => {
    c.ownerEntity = INVALID_ENTITY;
    c.vx = 0; c.vy = 0;
    c.damage = 10;
    c.range = 600;
    c.distanceTraveled = 0;
    c.color = 0x00ffff;
    c.size = 3;
    c.active = false;
    c.type = 'laser';
  },
);

export const TargetComponent = defineComponent<TargetData>(
  'Target',
  () => ({ targetEntity: INVALID_ENTITY, lockTimer: 0, lockDuration: 1.5, isLocked: false }),
  (c) => { c.targetEntity = INVALID_ENTITY; c.lockTimer = 0; c.lockDuration = 1.5; c.isLocked = false; },
);

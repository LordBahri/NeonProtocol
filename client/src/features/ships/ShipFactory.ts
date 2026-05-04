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

export interface ShipBlueprint {
  class: string;
  spriteKey: string;
  maxHull: number;
  maxShield: number;
  shieldRechargeRate: number;
  maxSpeed: number;
  acceleration: number;
  drag: number;
  rotationSpeed: number;
  mass: number;
  scale: number;
}

export const SHIP_BLUEPRINTS: Record<string, ShipBlueprint> = {
  fighter: {
    class: 'fighter',
    spriteKey: 'ship_fighter',
    maxHull: 80,
    maxShield: 60,
    shieldRechargeRate: 8,
    maxSpeed: 500,
    acceleration: 300,
    drag: 0.93,
    rotationSpeed: 3.2,
    mass: 0.8,
    scale: 1,
  },
  frigate: {
    class: 'frigate',
    spriteKey: 'ship_frigate',
    maxHull: 200,
    maxShield: 150,
    shieldRechargeRate: 12,
    maxSpeed: 350,
    acceleration: 180,
    drag: 0.88,
    rotationSpeed: 2,
    mass: 2,
    scale: 1.5,
  },
  destroyer: {
    class: 'destroyer',
    spriteKey: 'ship_destroyer',
    maxHull: 500,
    maxShield: 300,
    shieldRechargeRate: 20,
    maxSpeed: 250,
    acceleration: 120,
    drag: 0.85,
    rotationSpeed: 1.2,
    mass: 5,
    scale: 2.2,
  },
};

export function spawnShip(
  world: World,
  blueprintKey: string,
  x: number,
  y: number,
  isLocalPlayer = false,
  serverId = '',
): EntityId {
  const bp = SHIP_BLUEPRINTS[blueprintKey] ?? SHIP_BLUEPRINTS.fighter!;
  const entity = world.createEntity();

  world.addComponent(entity, TransformComponent, { x, y, prevX: x, prevY: y });
  world.addComponent(entity, VelocityComponent);
  world.addComponent(entity, ThrustComponent, {
    maxSpeed: bp.maxSpeed,
    acceleration: bp.acceleration,
    drag: bp.drag,
    rotationSpeed: bp.rotationSpeed,
  });
  world.addComponent(entity, ShipStatsComponent, {
    maxHull: bp.maxHull,
    hull: bp.maxHull,
    maxShield: bp.maxShield,
    shield: bp.maxShield,
    shieldRechargeRate: bp.shieldRechargeRate,
    mass: bp.mass,
    class: bp.class,
  });
  world.addComponent(entity, VisualComponent, {
    spriteKey: bp.spriteKey,
    scale: bp.scale,
  });
  world.addComponent(entity, NetworkSyncComponent, {
    serverId,
    isLocalPlayer,
  });

  if (isLocalPlayer) {
    world.addComponent(entity, PlayerInputComponent);
  }

  return entity;
}

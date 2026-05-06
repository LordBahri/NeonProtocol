import { defineComponent } from '../../core/ecs/ComponentRegistry.ts';
import type { World } from '../../core/ecs/World.ts';
import type { EntityId } from '../../core/ecs/types.ts';
import { createEntityId, INVALID_ENTITY } from '../../core/ecs/types.ts';
import { TransformComponent } from '../ships/ShipComponents.ts';
import { MiningComponent } from '../ships/ShipSystemComponents.ts';
import { globalBus } from '../../core/network/MessageBus.ts';
import { useEconomyStore } from './InventoryStore.ts';
import type { OreType } from './EconomyTypes.ts';

// ── AsteroidResource ECS component ───────────────────────────────────────────

export interface AsteroidResourceData {
  oreType:      OreType;
  oreQty:       number;
  maxQty:       number;
  richness:     number;   // 0–1, scales extraction rate bonus
  depleted:     boolean;
  respawnIn:    number;   // seconds until depletion ends
  beingMined:   boolean;
}

export const AsteroidResourceComponent = defineComponent<AsteroidResourceData>(
  'AsteroidResource',
  (): AsteroidResourceData => ({
    oreType:    'velite',
    oreQty:     1000,
    maxQty:     1000,
    richness:   0.5,
    depleted:   false,
    respawnIn:  0,
    beingMined: false,
  }),
  (c): void => {
    c.oreType    = 'velite';
    c.oreQty     = 1000;
    c.maxQty     = 1000;
    c.richness   = 0.5;
    c.depleted   = false;
    c.respawnIn  = 0;
    c.beingMined = false;
  },
);

// ── Ore distribution by system hazard / richness ──────────────────────────────

export const ORE_DISTRIBUTION: Array<{ type: OreType; weight: number; minHazard: number }> = [
  { type: 'velite',  weight: 40, minHazard: 0 },
  { type: 'ferrite', weight: 35, minHazard: 0 },
  { type: 'pyrite',  weight: 15, minHazard: 1 },
  { type: 'lumite',  weight: 6,  minHazard: 2 },
  { type: 'glacite', weight: 3,  minHazard: 2 },
  { type: 'voidite', weight: 1,  minHazard: 3 },
];

export function pickOreType(hazardLevel: number, rng: () => number): OreType {
  const eligible = ORE_DISTRIBUTION.filter(o => o.minHazard <= hazardLevel);
  const total    = eligible.reduce((s, o) => s + o.weight, 0);
  let roll       = rng() * total;
  for (const o of eligible) {
    roll -= o.weight;
    if (roll <= 0) return o.type;
  }
  return 'velite';
}

// ── Mining result event ───────────────────────────────────────────────────────

export interface MiningYieldEvent {
  minerEntity:    EntityId;
  asteroidEntity: EntityId;
  oreType:        OreType;
  qty:            number;
  asteroidPct:    number;   // 0–1 remaining in asteroid
}

// ── AsteroidResourceSystem ────────────────────────────────────────────────────

const RESPAWN_TIME    = 300;  // seconds for full respawn
const DEPLETED_THRESH = 0;    // trigger depletion at 0

export const AsteroidResourceSystem = {
  name:     'AsteroidResourceSystem',

  update(world: World, dt: number): void {
    // 1. Tick respawning asteroids
    const resources = world.query(AsteroidResourceComponent);
    for (let i = 0; i < resources.length; i++) {
      const entity = createEntityId(resources[i]!);
      const res    = world.getComponent(entity, AsteroidResourceComponent)!;

      if (res.depleted) {
        res.respawnIn -= dt;
        if (res.respawnIn <= 0) {
          res.depleted = false;
          res.oreQty   = res.maxQty;
          globalBus.emit('asteroid:respawned', { entity });
        }
        continue;
      }

      res.beingMined = false;
    }

    // 2. Process active mining lasers
    const miners = world.query(MiningComponent, TransformComponent);
    for (let i = 0; i < miners.length; i++) {
      const minerEntity = createEntityId(miners[i]!);
      const mining      = world.getComponent(minerEntity, MiningComponent)!;
      const minerTf     = world.getComponent(minerEntity, TransformComponent)!;

      if (!mining.laserActive || mining.targetEntityId === INVALID_ENTITY) continue;
      const asteroidId = mining.targetEntityId;
      if (!world.isAlive(asteroidId)) {
        mining.laserActive    = false;
        mining.targetEntityId = INVALID_ENTITY;
        continue;
      }

      const res = world.getComponent(asteroidId, AsteroidResourceComponent);
      if (!res || res.depleted) {
        mining.laserActive    = false;
        mining.targetEntityId = INVALID_ENTITY;
        continue;
      }

      const asteroidTf = world.getComponent(asteroidId, TransformComponent);
      if (!asteroidTf) continue;
      const dist = Math.hypot(asteroidTf.x - minerTf.x, asteroidTf.y - minerTf.y);
      if (dist > mining.miningRange) {
        mining.laserActive = false;
        continue;
      }

      // Extract ore — richness bonus scales yield
      const yield_per_s = mining.extractionRate * (1 + res.richness * 0.5);
      mining.oreBuffer += yield_per_s * dt;

      if (mining.oreBuffer >= mining.oreThreshold) {
        const extracted = Math.min(mining.oreBuffer, res.oreQty);
        mining.oreBuffer = 0;

        res.oreQty    -= extracted;
        res.beingMined = true;

        // Add to player cargo
        const store = useEconomyStore.getState();
        const fitted = store.canFitCargo(res.oreType, Math.floor(extracted));
        if (fitted) {
          store.addCargo(res.oreType, Math.floor(extracted));
        }

        const ev: MiningYieldEvent = {
          minerEntity,
          asteroidEntity: asteroidId,
          oreType:        res.oreType,
          qty:            Math.floor(extracted),
          asteroidPct:    res.oreQty / res.maxQty,
        };
        globalBus.emit('asteroid:mined', ev);

        if (res.oreQty <= DEPLETED_THRESH) {
          res.depleted   = true;
          res.oreQty     = 0;
          res.respawnIn  = RESPAWN_TIME * (1 - res.richness * 0.4);
          mining.laserActive    = false;
          mining.targetEntityId = INVALID_ENTITY;
          globalBus.emit('asteroid:depleted', { entity: asteroidId });
        }
      }
    }
  },
};

// ── Spawn helpers ─────────────────────────────────────────────────────────────

let _astSeq = 100_000;

export function spawnAsteroidResource(
  world:    World,
  x:        number,
  y:        number,
  oreType:  OreType,
  qty:      number,
  richness: number,
): EntityId {
  const entity = world.createEntity();
  _astSeq++;
  world.addComponent(entity, TransformComponent, { x, y, prevX: x, prevY: y, angle: 0, prevAngle: 0 });
  world.addComponent(entity, AsteroidResourceComponent, {
    oreType, oreQty: qty, maxQty: qty, richness,
    depleted: false, respawnIn: 0, beingMined: false,
  });
  return entity;
}

/** Spawn a belt of asteroid resources around a centre point. */
export function spawnAsteroidBelt(
  world:    World,
  cx:       number,
  cy:       number,
  count:    number,
  hazard:   number,
  seed:     number,
): EntityId[] {
  let s = (seed ^ 0x12345678) >>> 0;
  const rng = () => { s = Math.imul(s, 1664525) + 1013904223; return (s >>> 0) / 0x100000000; };

  const entities: EntityId[] = [];
  for (let i = 0; i < count; i++) {
    const angle    = rng() * Math.PI * 2;
    const r        = 300 + rng() * 600;
    const x        = cx + Math.cos(angle) * r;
    const y        = cy + Math.sin(angle) * r;
    const oreType  = pickOreType(hazard, rng);
    const qty      = Math.round(500 + rng() * 2000);
    const richness = rng();
    entities.push(spawnAsteroidResource(world, x, y, oreType, qty, richness));
  }
  return entities;
}

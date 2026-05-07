import type { MapSchema }       from '@colyseus/schema';
import type { ShipSchema }      from '../schemas/ShipSchema.js';
import type { LagCompensation } from './LagCompensation.js';
import { GameConfig }           from '../config/GameConfig.js';

export interface FireCommand {
  sessionId:       string;
  weaponType:      keyof typeof GameConfig.weapons;
  clientTime:      number; // wall-clock ms, used for lag compensation
  clientTimestamp: number; // sim-time ms, used for lag compensation
}

interface ServerProjectile {
  id:             string;
  ownerSessionId: string;
  x:              number;
  y:              number;
  vx:             number;
  vy:             number;
  damage:         number;
  range:          number;
  distanceTraveled: number;
  type:           keyof typeof GameConfig.weapons;
  spawnedAtMs:    number;
}

export interface CombatEvent {
  type:              'hit' | 'kill';
  attackerSessionId: string;
  victimSessionId:   string;
  damage:            number;
  x:                 number;
  y:                 number;
}

let nextProjectileId = 0;

export class CombatSystem {
  private projectiles: ServerProjectile[] = [];
  private fireQueue:   FireCommand[]      = [];
  private simTime      = 0;
  private lastFired    = new Map<string, number>();

  queueFire(cmd: FireCommand): void {
    this.fireQueue.push(cmd);
  }

  update(
    ships:    MapSchema<ShipSchema>,
    dt:       number,
    _tick:    number,
    lagComp?: LagCompensation,
    simTime?: number,
  ): CombatEvent[] {
    this.simTime += dt;
    const nowMs   = (simTime ?? this.simTime) * 1000;
    const events: CombatEvent[] = [];

    // ── Spawn projectiles ─────────────────────────────────────────────────
    for (const cmd of this.fireQueue) {
      const ship = ships.get(cmd.sessionId);
      if (!ship || !ship.isAlive) continue;

      const cfg          = GameConfig.weapons[cmd.weaponType];
      const fireInterval = 1 / cfg.fireRate;
      const lastFiredAt  = this.lastFired.get(cmd.sessionId) ?? 0;
      if (this.simTime - lastFiredAt < fireInterval) continue;

      this.lastFired.set(cmd.sessionId, this.simTime);

      this.projectiles.push({
        id:              `p${nextProjectileId++}`,
        ownerSessionId:  cmd.sessionId,
        x:               ship.x + Math.cos(ship.angle) * 25,
        y:               ship.y + Math.sin(ship.angle) * 25,
        vx:              Math.cos(ship.angle) * cfg.projectileSpeed,
        vy:              Math.sin(ship.angle) * cfg.projectileSpeed,
        damage:          cfg.damage,
        range:           cfg.range,
        distanceTraveled: 0,
        type:            cmd.weaponType,
        spawnedAtMs:     cmd.clientTime,
      });
    }
    this.fireQueue.length = 0;

    // ── Advance + hit-test projectiles ────────────────────────────────────
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i]!;
      p.distanceTraveled += Math.sqrt(p.vx ** 2 + p.vy ** 2) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      if (p.distanceTraveled >= p.range) {
        this.projectiles.splice(i, 1);
        continue;
      }

      let hit = false;
      ships.forEach((ship) => {
        if (hit || ship.sessionId === p.ownerSessionId || !ship.isAlive) return;

        const cls    = ship.shipClass as keyof typeof GameConfig.physics.collisionRadius;
        const radius = GameConfig.physics.collisionRadius[cls]
                    ?? GameConfig.physics.collisionRadius.fighter;

        // Use rewound position for hit validation when lag compensation is available
        let tx = ship.x, ty = ship.y;
        if (lagComp) {
          const rewound = lagComp.getPositionAt(ship.sessionId, p.spawnedAtMs, nowMs);
          if (rewound) { tx = rewound.x; ty = rewound.y; }
        }

        const dx = p.x - tx;
        const dy = p.y - ty;
        if (dx * dx + dy * dy > radius * radius) return;

        let dmg = p.damage;
        if (ship.shield > 0) {
          const abs = Math.min(ship.shield, dmg);
          ship.shield -= abs;
          dmg         -= abs;
        }
        if (dmg > 0) ship.hull = Math.max(0, ship.hull - dmg);

        events.push({
          type:              ship.hull <= 0 ? 'kill' : 'hit',
          attackerSessionId: p.ownerSessionId,
          victimSessionId:   ship.sessionId,
          damage:            p.damage,
          x:                 p.x,
          y:                 p.y,
        });

        if (ship.hull <= 0) ship.isAlive = false;
        hit = true;
      });

      if (hit) this.projectiles.splice(i, 1);
    }

    this._rechargeShields(ships, dt);
    return events;
  }

  private _rechargeShields(ships: MapSchema<ShipSchema>, dt: number): void {
    ships.forEach((ship) => {
      if (!ship.isAlive || ship.shield >= ship.maxShield) return;
      const cfg = GameConfig.ships[ship.shipClass as keyof typeof GameConfig.ships]
               ?? GameConfig.ships.fighter;
      ship.shield = Math.min(ship.maxShield, ship.shield + cfg.shieldRechargeRate * dt);
    });
  }

  get activeProjectileCount(): number { return this.projectiles.length; }
}

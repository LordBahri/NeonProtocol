import type { MapSchema } from '@colyseus/schema';
import type { ShipSchema } from '../schemas/ShipSchema.ts';
import { GameConfig } from '../config/GameConfig.ts';

export interface FireCommand {
  sessionId: string;
  weaponType: keyof typeof GameConfig.weapons;
}

interface ServerProjectile {
  id: string;
  ownerSessionId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  range: number;
  distanceTraveled: number;
  type: keyof typeof GameConfig.weapons;
}

export interface CombatEvent {
  type: 'hit' | 'kill';
  attackerSessionId: string;
  victimSessionId: string;
  damage: number;
  x: number;
  y: number;
}

let nextProjectileId = 0;

export class CombatSystem {
  private projectiles: ServerProjectile[] = [];
  private fireQueue: FireCommand[] = [];
  private simTime = 0;
  private lastFired = new Map<string, number>();

  queueFire(cmd: FireCommand): void {
    this.fireQueue.push(cmd);
  }

  update(
    ships: MapSchema<ShipSchema>,
    dt: number,
    _tick: number,
  ): CombatEvent[] {
    this.simTime += dt;
    const events: CombatEvent[] = [];

    for (const cmd of this.fireQueue) {
      const ship = ships.get(cmd.sessionId);
      if (!ship || !ship.isAlive) continue;

      const cfg = GameConfig.weapons[cmd.weaponType];
      const fireInterval = 1 / cfg.fireRate;
      const lastFiredTime = this.lastFired.get(cmd.sessionId) ?? 0;

      if (this.simTime - lastFiredTime < fireInterval) continue;

      this.lastFired.set(cmd.sessionId, this.simTime);

      this.projectiles.push({
        id: `p${nextProjectileId++}`,
        ownerSessionId: cmd.sessionId,
        x: ship.x + Math.cos(ship.angle) * 25,
        y: ship.y + Math.sin(ship.angle) * 25,
        vx: Math.cos(ship.angle) * cfg.projectileSpeed,
        vy: Math.sin(ship.angle) * cfg.projectileSpeed,
        damage: cfg.damage,
        range: cfg.range,
        distanceTraveled: 0,
        type: cmd.weaponType,
      });
    }
    this.fireQueue.length = 0;

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i]!;
      const speed = Math.sqrt(p.vx ** 2 + p.vy ** 2);
      p.distanceTraveled += speed * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      if (p.distanceTraveled >= p.range) {
        this.projectiles.splice(i, 1);
        continue;
      }

      let hit = false;
      ships.forEach((ship) => {
        if (hit || ship.sessionId === p.ownerSessionId || !ship.isAlive) return;

        const shipClass = ship.shipClass as keyof typeof GameConfig.physics.collisionRadius;
        const radius = GameConfig.physics.collisionRadius[shipClass]
          ?? GameConfig.physics.collisionRadius.fighter;

        const dx = p.x - ship.x;
        const dy = p.y - ship.y;
        if (dx * dx + dy * dy > radius * radius) return;

        let dmg = p.damage;
        if (ship.shield > 0) {
          const shieldAbsorb = Math.min(ship.shield, dmg);
          ship.shield -= shieldAbsorb;
          dmg -= shieldAbsorb;
        }
        if (dmg > 0) {
          ship.hull = Math.max(0, ship.hull - dmg);
        }

        events.push({
          type: ship.hull <= 0 ? 'kill' : 'hit',
          attackerSessionId: p.ownerSessionId,
          victimSessionId: ship.sessionId,
          damage: p.damage,
          x: p.x,
          y: p.y,
        });

        if (ship.hull <= 0) ship.isAlive = false;

        hit = true;
      });

      if (hit) {
        this.projectiles.splice(i, 1);
      }
    }

    this.rechargeShields(ships, dt);
    return events;
  }

  private rechargeShields(ships: MapSchema<ShipSchema>, dt: number): void {
    ships.forEach((ship) => {
      if (!ship.isAlive || ship.shield >= ship.maxShield) return;
      const cfg = GameConfig.ships[ship.shipClass as keyof typeof GameConfig.ships]
        ?? GameConfig.ships.fighter;
      ship.shield = Math.min(ship.maxShield, ship.shield + cfg.shieldRechargeRate * dt);
    });
  }

  get activeProjectileCount(): number { return this.projectiles.length; }
}

import type { MapSchema } from '@colyseus/schema';
import type { ShipSchema } from '../schemas/ShipSchema.ts';
import { GameConfig } from '../config/GameConfig.ts';

export interface PhysicsInput {
  thrustForward: boolean;
  thrustBack: boolean;
  rotateLeft: boolean;
  rotateRight: boolean;
  angle?: number;
}

export class PhysicsSystem {
  private inputs = new Map<string, PhysicsInput>();

  setInput(sessionId: string, input: PhysicsInput): void {
    this.inputs.set(sessionId, input);
  }

  clearInput(sessionId: string): void {
    this.inputs.delete(sessionId);
  }

  update(ships: MapSchema<ShipSchema>, dt: number, tick: number): void {
    ships.forEach((ship) => {
      if (!ship.isAlive) return;

      const input = this.inputs.get(ship.sessionId);
      const cfg = GameConfig.ships[ship.shipClass as keyof typeof GameConfig.ships]
        ?? GameConfig.ships.fighter;

      const TWO_PI = Math.PI * 2;

      if (input) {
        if (input.rotateLeft) ship.angle -= cfg.rotationSpeed * dt;
        if (input.rotateRight) ship.angle += cfg.rotationSpeed * dt;

        if (input.angle !== undefined) {
          let diff = input.angle - ship.angle;
          while (diff > Math.PI) diff -= TWO_PI;
          while (diff < -Math.PI) diff += TWO_PI;
          ship.angle += diff * cfg.rotationSpeed * dt * 2;
        }

        if (input.thrustForward) {
          ship.vx += Math.cos(ship.angle) * cfg.acceleration * dt;
          ship.vy += Math.sin(ship.angle) * cfg.acceleration * dt;
        }
        if (input.thrustBack) {
          ship.vx -= Math.cos(ship.angle) * cfg.acceleration * 0.5 * dt;
          ship.vy -= Math.sin(ship.angle) * cfg.acceleration * 0.5 * dt;
        }
      }

      ship.vx *= cfg.drag;
      ship.vy *= cfg.drag;

      const speedSq = ship.vx ** 2 + ship.vy ** 2;
      if (speedSq > cfg.maxSpeed ** 2) {
        const scale = cfg.maxSpeed / Math.sqrt(speedSq);
        ship.vx *= scale;
        ship.vy *= scale;
      }

      ship.x += ship.vx * dt;
      ship.y += ship.vy * dt;

      const sectorSize = GameConfig.world.sectorSize;
      if (ship.x < 0) ship.x = 0;
      if (ship.y < 0) ship.y = 0;
      if (ship.x > sectorSize) ship.x = sectorSize;
      if (ship.y > sectorSize) ship.y = sectorSize;

      ship.angle = ((ship.angle % TWO_PI) + TWO_PI) % TWO_PI;
      ship.lastTick = tick;
    });
  }
}

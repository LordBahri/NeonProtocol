import type { MapSchema } from '@colyseus/schema';
import type { ShipSchema } from '../schemas/ShipSchema';
import { GameConfig }      from '../config/GameConfig';

export interface PhysicsInput {
  thrustForward: boolean;
  thrustBack:    boolean;
  rotateLeft:    boolean;
  rotateRight:   boolean;
  angle?:        number;
  seq:           number;   // client prediction sequence number, echoed back
}

const TWO_PI = Math.PI * 2;

export class PhysicsSystem {
  private inputs = new Map<string, PhysicsInput>();

  setInput(sessionId: string, input: Omit<PhysicsInput, 'seq'>, seq: number): void {
    this.inputs.set(sessionId, { ...input, seq });
  }

  clearInput(sessionId: string): void {
    this.inputs.delete(sessionId);
  }

  update(ships: MapSchema<ShipSchema>, dt: number, tick: number): void {
    ships.forEach((ship) => {
      if (!ship.isAlive) return;

      const input = this.inputs.get(ship.sessionId);
      const cfg   = GameConfig.ships[ship.shipClass as keyof typeof GameConfig.ships]
                 ?? GameConfig.ships.fighter;

      if (input) {
        if (input.rotateLeft)  ship.angle -= cfg.rotationSpeed * dt;
        if (input.rotateRight) ship.angle += cfg.rotationSpeed * dt;

        if (input.angle !== undefined) {
          let diff = input.angle - ship.angle;
          while (diff >  Math.PI) diff -= TWO_PI;
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

        // Echo back last processed sequence number for client-side prediction reconciliation
        ship.inputSeq = input.seq;
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

      const ss = GameConfig.world.sectorSize;
      ship.x = Math.max(0, Math.min(ss, ship.x));
      ship.y = Math.max(0, Math.min(ss, ship.y));

      ship.angle  = ((ship.angle % TWO_PI) + TWO_PI) % TWO_PI;
      ship.lastTick = tick;
    });
  }
}

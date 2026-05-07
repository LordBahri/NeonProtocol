import type { MapSchema } from '@colyseus/schema';
import type { ShipSchema } from '../schemas/ShipSchema.js';

interface PositionSnapshot {
  timestamp: number;
  x: number;
  y: number;
}

const BUFFER_FRAMES = 15;   // ~750ms of history at 20 Hz
const MAX_REWIND_MS = 600;  // never rewind further than this

/**
 * Per-entity ring buffer of position snapshots.
 * Used to validate hit detection from clients with network latency.
 */
export class LagCompensation {
  private readonly history = new Map<string, PositionSnapshot[]>();

  /** Call once per simulation tick before physics runs. */
  record(ships: MapSchema<ShipSchema>, simTime: number): void {
    const timestamp = simTime * 1000; // store in ms

    ships.forEach((ship) => {
      if (!ship.isAlive) return;
      let buf = this.history.get(ship.sessionId);
      if (!buf) {
        buf = [];
        this.history.set(ship.sessionId, buf);
      }
      buf.push({ timestamp, x: ship.x, y: ship.y });
      if (buf.length > BUFFER_FRAMES) buf.shift();
    });
  }

  /** Remove buffer for a disconnected session. */
  remove(sessionId: string): void {
    this.history.delete(sessionId);
  }

  /**
   * Return the interpolated position of a ship at `clientTimestampMs`.
   * Returns null if the ship has no history or the timestamp is too old.
   */
  getPositionAt(sessionId: string, clientTimestampMs: number, nowMs: number): { x: number; y: number } | null {
    const buf = this.history.get(sessionId);
    if (!buf || buf.length < 2) return null;

    const targetTime = Math.max(clientTimestampMs, nowMs - MAX_REWIND_MS);
    const latest = buf[buf.length - 1]!;
    const oldest = buf[0]!;

    if (targetTime >= latest.timestamp) return { x: latest.x, y: latest.y };
    if (targetTime <= oldest.timestamp) return { x: oldest.x, y: oldest.y };

    // Binary search for surrounding snapshots
    let lo = 0;
    let hi = buf.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (buf[mid]!.timestamp <= targetTime) lo = mid;
      else hi = mid;
    }

    const a = buf[lo]!;
    const b = buf[hi]!;
    const t = (targetTime - a.timestamp) / (b.timestamp - a.timestamp);
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
    };
  }

  /**
   * Validate a projectile hit using rewound ship positions.
   * Returns true if the hit is geometrically valid at the given client time.
   */
  validateHit(
    targetSessionId: string,
    hitX: number,
    hitY: number,
    collisionRadius: number,
    clientTimestampMs: number,
    nowMs: number,
  ): boolean {
    const pos = this.getPositionAt(targetSessionId, clientTimestampMs, nowMs);
    if (!pos) return true; // can't validate — give benefit of doubt

    const dx = hitX - pos.x;
    const dy = hitY - pos.y;
    const TOLERANCE = collisionRadius * 1.5; // generous tolerance for latency variation
    return (dx * dx + dy * dy) <= TOLERANCE * TOLERANCE;
  }

  clear(): void {
    this.history.clear();
  }
}

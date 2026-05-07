import type { ClientInputMessage } from '../rooms/SectorRoom';

interface RateBucket {
  count: number;
  windowStart: number;
}

const INPUT_LIMIT      = 40;  // max input messages per second per client
const FIRE_LIMIT       = 8;   // max fire commands per second per client
const CHAT_LIMIT       = 5;   // max chat messages per second per client
const WINDOW_MS        = 1000;
const VIOLATION_LIMIT  = 20;  // kick after this many accumulated violations

/**
 * Server-side packet validator and anti-cheat foundation.
 * Enforces rate limits, validates message structure, and tracks violations.
 */
export class PacketValidator {
  private inputBuckets  = new Map<string, RateBucket>();
  private fireBuckets   = new Map<string, RateBucket>();
  private chatBuckets   = new Map<string, RateBucket>();
  private violations    = new Map<string, number>();

  // ── Rate limiting ─────────────────────────────────────────────────────────

  checkInput(sessionId: string): boolean {
    return this._rateCheck(this.inputBuckets, sessionId, INPUT_LIMIT);
  }

  checkFire(sessionId: string): boolean {
    return this._rateCheck(this.fireBuckets, sessionId, FIRE_LIMIT);
  }

  checkChat(sessionId: string): boolean {
    return this._rateCheck(this.chatBuckets, sessionId, CHAT_LIMIT);
  }

  private _rateCheck(buckets: Map<string, RateBucket>, sessionId: string, limit: number): boolean {
    const now = Date.now();
    let bucket = buckets.get(sessionId);
    if (!bucket) {
      bucket = { count: 0, windowStart: now };
      buckets.set(sessionId, bucket);
    }
    if (now - bucket.windowStart >= WINDOW_MS) {
      bucket.count = 0;
      bucket.windowStart = now;
    }
    bucket.count++;
    if (bucket.count > limit) {
      this._recordViolation(sessionId, `rate_limit:${limit}`);
      return false;
    }
    return true;
  }

  // ── Structure validation ──────────────────────────────────────────────────

  validateInput(data: unknown): data is ClientInputMessage {
    if (!data || typeof data !== 'object') return false;
    const d = data as Record<string, unknown>;
    // Booleans must actually be booleans (not numbers spoofing them)
    for (const key of ['thrustForward', 'thrustBack', 'rotateLeft', 'rotateRight', 'fire'] as const) {
      if (key in d && typeof d[key] !== 'boolean') return false;
    }
    if ('angle' in d) {
      if (typeof d['angle'] !== 'number' || !isFinite(d['angle'] as number)) return false;
    }
    if ('seq' in d) {
      if (typeof d['seq'] !== 'number' || (d['seq'] as number) < 0) return false;
    }
    if ('clientTime' in d) {
      const ct = d['clientTime'] as number;
      if (typeof ct !== 'number' || !isFinite(ct)) return false;
      // Reject timestamps more than 5 seconds in the future
      if (ct > Date.now() + 5000) return false;
    }
    return true;
  }

  validateChat(data: unknown): data is { message: string; channel: 'local' | 'corp' } {
    if (!data || typeof data !== 'object') return false;
    const d = data as Record<string, unknown>;
    if (typeof d['message'] !== 'string') return false;
    if (d['message'].length === 0 || d['message'].length > 200) return false;
    if (d['channel'] !== 'local' && d['channel'] !== 'corp') return false;
    return true;
  }

  validateNavTarget(data: unknown): data is { x: number; y: number; set: boolean } {
    if (!data || typeof data !== 'object') return false;
    const d = data as Record<string, unknown>;
    if (typeof d['x'] !== 'number' || !isFinite(d['x'] as number)) return false;
    if (typeof d['y'] !== 'number' || !isFinite(d['y'] as number)) return false;
    if (typeof d['set'] !== 'boolean') return false;
    const sectorSize = 20000;
    if ((d['x'] as number) < 0 || (d['x'] as number) > sectorSize) return false;
    if ((d['y'] as number) < 0 || (d['y'] as number) > sectorSize) return false;
    return true;
  }

  // ── Violation tracking ────────────────────────────────────────────────────

  private _recordViolation(sessionId: string, reason: string): void {
    const count = (this.violations.get(sessionId) ?? 0) + 1;
    this.violations.set(sessionId, count);
    if (count % 5 === 0) {
      console.warn(`[AntiCheat] ${sessionId} violations=${count} reason=${reason}`);
    }
  }

  recordViolation(sessionId: string, reason: string): void {
    this._recordViolation(sessionId, reason);
  }

  shouldKick(sessionId: string): boolean {
    return (this.violations.get(sessionId) ?? 0) >= VIOLATION_LIMIT;
  }

  remove(sessionId: string): void {
    this.inputBuckets.delete(sessionId);
    this.fireBuckets.delete(sessionId);
    this.chatBuckets.delete(sessionId);
    this.violations.delete(sessionId);
  }
}

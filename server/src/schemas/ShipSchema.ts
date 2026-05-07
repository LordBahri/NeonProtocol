import { Schema, type } from '@colyseus/schema';

export class ShipSchema extends Schema {
  @type('string') sessionId: string = '';
  @type('string') playerId: string = '';
  @type('string') shipClass: string = 'fighter';

  // Display info
  @type('string') username: string = 'Pilot';
  @type('string') corpId: string   = '';

  // Physics
  @type('float32') x: number = 0;
  @type('float32') y: number = 0;
  @type('float32') angle: number = 0;
  @type('float32') vx: number = 0;
  @type('float32') vy: number = 0;

  // Combat stats
  @type('float32') hull: number = 80;
  @type('float32') maxHull: number = 80;
  @type('float32') shield: number = 60;
  @type('float32') maxShield: number = 60;

  // State
  @type('boolean') isAlive: boolean = true;
  @type('uint32')  lastTick: number = 0;

  // Client-side prediction: echoes the last input sequence the server processed.
  // The client uses this to discard stale predictions and reconcile.
  @type('uint32') inputSeq: number = 0;
}

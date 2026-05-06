type MessageHandler<T = unknown> = (data: T) => void;

export class MessageBus {
  private handlers = new Map<string, Set<MessageHandler>>();

  on<T>(type: string, handler: MessageHandler<T>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler as MessageHandler);
    return () => this.off(type, handler);
  }

  off<T>(type: string, handler: MessageHandler<T>): void {
    this.handlers.get(type)?.delete(handler as MessageHandler);
  }

  emit<T>(type: string, data: T): void {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const handler of set) {
      handler(data);
    }
  }

  once<T>(type: string, handler: MessageHandler<T>): void {
    const unsub = this.on<T>(type, (data) => {
      unsub();
      handler(data);
    });
  }

  clear(type?: string): void {
    if (type) {
      this.handlers.delete(type);
    } else {
      this.handlers.clear();
    }
  }
}

export const globalBus = new MessageBus();

export const NetworkEvent = {
  CONNECTED: 'network:connected',
  DISCONNECTED: 'network:disconnected',
  ROOM_JOINED: 'network:room_joined',
  ROOM_LEFT: 'network:room_left',
  STATE_PATCH: 'network:state_patch',
  PLAYER_JOINED: 'network:player_joined',
  PLAYER_LEFT: 'network:player_left',
  ENTITY_SPAWNED: 'network:entity_spawned',
  ENTITY_DESTROYED: 'network:entity_destroyed',
  COMBAT_HIT: 'network:combat_hit',
  COMBAT_DEATH: 'network:combat_death',
} as const;

export const ShipEvent = {
  DAMAGE_APPLY:    'ship:damage_apply',
  HULL_BREACHED:   'ship:hull_breached',
  SHIP_EXPLODING:  'ship:exploding',
  SHIP_DEAD:       'ship:dead',
  WARP_JUMPED:     'ship:warp_jumped',
  ORE_COLLECTED:   'ship:ore_collected',
  FUEL_EMPTY:      'ship:fuel_empty',
} as const;

export interface DamageApplyEvent {
  targetEntity: number;
  damage: number;
  hitAngle: number; // world-space angle of the incoming hit
}

export interface ShipLifecycleEvent {
  entity: number;
  x: number;
  y: number;
}

export interface WarpJumpedEvent {
  entity: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

export interface OreCollectedEvent {
  entity: number;
  amount: number;
}

export interface FuelEmptyEvent {
  entity: number;
}

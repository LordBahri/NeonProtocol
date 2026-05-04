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

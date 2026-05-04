import type { World } from '../ecs/World.ts';
import type { EntityId } from '../ecs/types.ts';

/**
 * Maps server entity IDs (strings from Colyseus) to local ECS entity IDs.
 * Handles entity create/destroy reconciliation between server state and local world.
 */
export class StateReconciler {
  private serverToLocal = new Map<string, EntityId>();
  private localToServer = new Map<EntityId, string>();

  register(serverId: string, localId: EntityId): void {
    this.serverToLocal.set(serverId, localId);
    this.localToServer.set(localId, serverId);
  }

  unregister(serverId: string): void {
    const localId = this.serverToLocal.get(serverId);
    if (localId !== undefined) {
      this.localToServer.delete(localId);
    }
    this.serverToLocal.delete(serverId);
  }

  getLocal(serverId: string): EntityId | undefined {
    return this.serverToLocal.get(serverId);
  }

  getServer(localId: EntityId): string | undefined {
    return this.localToServer.get(localId);
  }

  hasServer(serverId: string): boolean {
    return this.serverToLocal.has(serverId);
  }

  reconcileEntities<T extends { onAdd: (handler: (item: T, key: string) => void) => void; onRemove: (handler: (item: T, key: string) => void) => void }>(
    schema: T,
    world: World,
    onAdd: (serverId: string, item: T, world: World) => EntityId,
    onRemove: (serverId: string, world: World) => void,
  ): void {
    schema.onAdd((item, serverId) => {
      if (!this.hasServer(serverId)) {
        const localId = onAdd(serverId, item, world);
        this.register(serverId, localId);
      }
    });

    schema.onRemove((_item, serverId) => {
      onRemove(serverId, world);
      this.unregister(serverId);
    });
  }

  clear(world?: World): void {
    if (world) {
      for (const localId of this.localToServer.keys()) {
        world.destroyEntity(localId);
      }
    }
    this.serverToLocal.clear();
    this.localToServer.clear();
  }

  get size(): number { return this.serverToLocal.size; }
}

import { SparseSet } from './SparseSet.ts';
import type { ComponentTypeId, EntityId, Query } from './types.ts';

function queryKey(query: Query): string {
  return [...query].sort((a, b) => a - b).join(',');
}

export class QueryCache {
  private cache = new Map<string, SparseSet>();
  private entityComponentSets = new Map<EntityId, Set<ComponentTypeId>>();

  getOrCreate(query: Query): SparseSet {
    const key = queryKey(query);
    let set = this.cache.get(key);
    if (!set) {
      set = new SparseSet();
      this.cache.set(key, set);
    }
    return set;
  }

  onEntityComponentAdded(entity: EntityId, typeId: ComponentTypeId, allTypeIds: ComponentTypeId[]): void {
    let owned = this.entityComponentSets.get(entity);
    if (!owned) {
      owned = new Set();
      this.entityComponentSets.set(entity, owned);
    }
    owned.add(typeId);

    for (const [key, set] of this.cache) {
      const required = key.split(',').map(Number) as ComponentTypeId[];
      if (required.every(id => allTypeIds.includes(id))) {
        set.add(entity);
      }
    }
  }

  onEntityComponentRemoved(entity: EntityId, typeId: ComponentTypeId): void {
    const owned = this.entityComponentSets.get(entity);
    if (owned) owned.delete(typeId);

    for (const [key, set] of this.cache) {
      const required = key.split(',').map(Number) as ComponentTypeId[];
      if (required.includes(typeId)) {
        set.remove(entity);
      }
    }
  }

  onEntityDestroyed(entity: EntityId): void {
    this.entityComponentSets.delete(entity);
    for (const set of this.cache.values()) {
      set.remove(entity);
    }
  }
}

import { QueryCache } from './QueryCache.ts';
import { SparseSet } from './SparseSet.ts';
import {
  createEntityId,
  INVALID_ENTITY,
  MAX_COMPONENT_TYPES,
  MAX_ENTITIES,
} from './types.ts';
import type {
  ComponentDefinition,
  ComponentTypeId,
  EntityId,
  Query,
  System,
} from './types.ts';

export class World {
  private nextEntityId = 0;
  private recycled: EntityId[] = [];
  private alive: SparseSet = new SparseSet();

  /** component storage: sparse[typeId][entityId] → component instance */
  private components: Array<Map<EntityId, object>> = new Array(MAX_COMPONENT_TYPES)
    .fill(null)
    .map(() => new Map());

  private queryCache = new QueryCache();
  private systems: System[] = [];
  private _frameCount = 0;

  createEntity(): EntityId {
    const id = this.recycled.pop() ?? createEntityId(this.nextEntityId++);
    if (id >= MAX_ENTITIES) throw new Error('MAX_ENTITIES exceeded');
    this.alive.add(id);
    return id;
  }

  destroyEntity(entity: EntityId): void {
    if (!this.alive.has(entity)) return;
    for (let typeId = 0; typeId < MAX_COMPONENT_TYPES; typeId++) {
      this.components[typeId]!.delete(entity);
    }
    this.queryCache.onEntityDestroyed(entity);
    this.alive.remove(entity);
    this.recycled.push(entity);
  }

  isAlive(entity: EntityId): boolean {
    return this.alive.has(entity);
  }

  addComponent<T extends object>(
    entity: EntityId,
    def: ComponentDefinition<T>,
    initializer?: Partial<T>,
  ): T {
    const storage = this.components[def.typeId] as Map<EntityId, T>;
    let component = storage.get(entity);
    if (!component) {
      component = def.create();
      storage.set(entity, component);
    }
    if (initializer) Object.assign(component, initializer);

    const allTypeIds = this.getEntityComponentTypeIds(entity);
    this.queryCache.onEntityComponentAdded(entity, def.typeId, allTypeIds);
    return component;
  }

  removeComponent<T extends object>(entity: EntityId, def: ComponentDefinition<T>): void {
    const storage = this.components[def.typeId] as Map<EntityId, T>;
    const component = storage.get(entity);
    if (!component) return;
    def.reset(component);
    storage.delete(entity);
    this.queryCache.onEntityComponentRemoved(entity, def.typeId);
  }

  getComponent<T extends object>(entity: EntityId, def: ComponentDefinition<T>): T | undefined {
    return (this.components[def.typeId] as Map<EntityId, T>).get(entity);
  }

  hasComponent<T extends object>(entity: EntityId, def: ComponentDefinition<T>): boolean {
    return (this.components[def.typeId] as Map<EntityId, T>).has(entity);
  }

  query(...defs: ComponentDefinition<object>[]): Uint32Array {
    const query: Query = defs.map(d => d.typeId);
    const set = this.queryCache.getOrCreate(query);

    if (set.size === 0 && this.alive.size > 0) {
      const entities = this.alive.entities;
      for (let i = 0; i < entities.length; i++) {
        const entity = createEntityId(entities[i]!);
        if (defs.every(d => this.hasComponent(entity, d))) {
          set.add(entity);
        }
      }
    }

    return set.entities;
  }

  addSystem(system: System): void {
    this.systems.push(system);
    this.systems.sort((a, b) => a.priority - b.priority);
  }

  removeSystem(name: string): void {
    const idx = this.systems.findIndex(s => s.name === name);
    if (idx !== -1) this.systems.splice(idx, 1);
  }

  update(dt: number): void {
    this._frameCount++;
    for (const system of this.systems) {
      system.update(this, dt);
    }
  }

  get entityCount(): number {
    return this.alive.size;
  }

  get frameCount(): number {
    return this._frameCount;
  }

  private getEntityComponentTypeIds(entity: EntityId): ComponentTypeId[] {
    const ids: ComponentTypeId[] = [];
    for (let i = 0; i < MAX_COMPONENT_TYPES; i++) {
      if (this.components[i]!.has(entity)) {
        ids.push(i as ComponentTypeId);
      }
    }
    return ids;
  }
}

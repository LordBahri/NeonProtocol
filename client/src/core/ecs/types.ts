export type EntityId = number & { readonly _brand: 'EntityId' };

export function createEntityId(n: number): EntityId {
  return n as EntityId;
}

export type ComponentTypeId = number & { readonly _brand: 'ComponentTypeId' };

export interface ComponentDefinition<T extends object> {
  readonly typeId: ComponentTypeId;
  readonly name: string;
  create(): T;
  reset(component: T): void;
}

export interface System {
  readonly name: string;
  readonly priority: number;
  update(world: import('./World.ts').World, dt: number): void;
}

export type Query = readonly ComponentTypeId[];

export interface QueryResult {
  readonly entities: readonly EntityId[];
}

export const INVALID_ENTITY = createEntityId(-1);
export const MAX_ENTITIES = 65536;
export const MAX_COMPONENT_TYPES = 256;

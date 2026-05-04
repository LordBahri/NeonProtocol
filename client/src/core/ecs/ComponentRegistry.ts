import type { ComponentDefinition, ComponentTypeId } from './types.ts';

let nextTypeId = 0;

const registry = new Map<string, ComponentDefinition<object>>();

export function defineComponent<T extends object>(
  name: string,
  create: () => T,
  reset: (c: T) => void,
): ComponentDefinition<T> {
  if (registry.has(name)) {
    throw new Error(`Component "${name}" already registered`);
  }
  const def: ComponentDefinition<T> = {
    typeId: nextTypeId++ as ComponentTypeId,
    name,
    create,
    reset,
  };
  registry.set(name, def as ComponentDefinition<object>);
  return def;
}

export function getComponentDef(name: string): ComponentDefinition<object> | undefined {
  return registry.get(name);
}

export function getRegisteredCount(): number {
  return nextTypeId;
}

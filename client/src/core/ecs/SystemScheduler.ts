import type { System } from './types.ts';
import type { World } from './World.ts';

export const SystemPriority = {
  INPUT: 0,
  PHYSICS: 100,
  FUEL: 105,
  HEAT: 110,
  WARP: 150,
  COMBAT: 200,
  SHIELD_ARMOR: 202,
  MINING: 210,
  DESTRUCTION: 220,
  MOVEMENT: 300,
  NETWORK_SYNC: 400,
  WRECK: 890,
  RENDER_PREP: 900,
} as const;

export class SystemScheduler {
  private groups = new Map<string, System[]>();
  private order: string[] = [];

  registerGroup(name: string, ...systems: System[]): void {
    const sorted = [...systems].sort((a, b) => a.priority - b.priority);
    this.groups.set(name, sorted);
    if (!this.order.includes(name)) this.order.push(name);
  }

  setGroupOrder(groupNames: string[]): void {
    this.order = groupNames;
  }

  runGroup(name: string, world: World, dt: number): void {
    const systems = this.groups.get(name);
    if (!systems) return;
    for (const system of systems) {
      system.update(world, dt);
    }
  }

  runAll(world: World, dt: number): void {
    for (const name of this.order) {
      this.runGroup(name, world, dt);
    }
  }

  addSystem(group: string, system: System): void {
    const systems = this.groups.get(group);
    if (!systems) throw new Error(`Group "${group}" not registered`);
    systems.push(system);
    systems.sort((a, b) => a.priority - b.priority);
  }
}

import type { World } from '../../core/ecs/World.ts';
import type { System } from '../../core/ecs/types.ts';
import { createEntityId } from '../../core/ecs/types.ts';
import { SystemPriority } from '../../core/ecs/SystemScheduler.ts';
import {
  TransformComponent,
  PlayerInputComponent,
  ShipStatsComponent,
} from '../ships/ShipComponents.ts';
import type { ShipStatsData } from '../ships/ShipComponents.ts';
import { WeaponComponent, ProjectileComponent } from './WeaponComponents.ts';
import { globalBus, NetworkEvent } from '../../core/network/MessageBus.ts';

let simTime = 0;

export const CombatSystem: System = {
  name: 'CombatSystem',
  priority: SystemPriority.COMBAT,

  update(world: World, dt: number): void {
    simTime += dt;

    const shooters = world.query(TransformComponent, WeaponComponent, PlayerInputComponent);

    for (let i = 0; i < shooters.length; i++) {
      const entity = createEntityId(shooters[i]!);
      const transform = world.getComponent(entity, TransformComponent)!;
      const weapon = world.getComponent(entity, WeaponComponent)!;
      const input = world.getComponent(entity, PlayerInputComponent)!;

      if (!input.fire) continue;

      const fireInterval = 1 / weapon.fireRate;
      if (simTime - weapon.lastFiredTime < fireInterval) continue;

      weapon.lastFiredTime = simTime;

      const proj = world.createEntity();
      world.addComponent(proj, TransformComponent, {
        x: transform.x + Math.cos(transform.angle) * 20,
        y: transform.y + Math.sin(transform.angle) * 20,
        prevX: transform.x,
        prevY: transform.y,
      });
      world.addComponent(proj, ProjectileComponent, {
        ownerEntity: entity,
        vx: Math.cos(transform.angle) * weapon.projectileSpeed,
        vy: Math.sin(transform.angle) * weapon.projectileSpeed,
        damage: weapon.damage,
        range: weapon.range,
        color: weapon.color,
        size: weapon.size,
        active: true,
        type: weapon.type,
      });
    }

    const projectiles = world.query(TransformComponent, ProjectileComponent);

    for (let i = 0; i < projectiles.length; i++) {
      const entity = createEntityId(projectiles[i]!);
      const transform = world.getComponent(entity, TransformComponent)!;
      const proj = world.getComponent(entity, ProjectileComponent)!;

      if (!proj.active) continue;

      const speed = Math.sqrt(proj.vx ** 2 + proj.vy ** 2);
      proj.distanceTraveled += speed * dt;

      transform.prevX = transform.x;
      transform.prevY = transform.y;
      transform.x += proj.vx * dt;
      transform.y += proj.vy * dt;

      if (proj.distanceTraveled >= proj.range) {
        world.destroyEntity(entity);
        continue;
      }

      const ships = world.query(TransformComponent, ShipStatsComponent);
      for (let j = 0; j < ships.length; j++) {
        const shipEntity = createEntityId(ships[j]!);
        if (shipEntity === proj.ownerEntity) continue;

        const shipTransform = world.getComponent(shipEntity, TransformComponent)!;
        const dx = transform.x - shipTransform.x;
        const dy = transform.y - shipTransform.y;
        const distSq = dx * dx + dy * dy;

        if (distSq < 400) {
          const stats = world.getComponent(shipEntity, ShipStatsComponent)!;
          applyDamage(stats, proj.damage);
          globalBus.emit(NetworkEvent.COMBAT_HIT, {
            targetEntity: shipEntity,
            damage: proj.damage,
            x: transform.x,
            y: transform.y,
          });

          if (stats.hull <= 0) {
            globalBus.emit(NetworkEvent.COMBAT_DEATH, { entity: shipEntity });
          }

          world.destroyEntity(entity);
          break;
        }
      }
    }
  },
};

function applyDamage(stats: ShipStatsData, damage: number): void {
  if (stats.shield > 0) {
    const shieldDamage = Math.min(stats.shield, damage);
    stats.shield -= shieldDamage;
    damage -= shieldDamage;
  }
  if (damage > 0) {
    stats.hull = Math.max(0, stats.hull - damage);
  }
  stats.lastDamageTime = simTime;
}

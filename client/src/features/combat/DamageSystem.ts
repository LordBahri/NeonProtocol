import type { World } from '../../core/ecs/World.ts';
import type { EntityId } from '../../core/ecs/types.ts';
import { ShipStatsComponent, VisualComponent } from '../ships/ShipComponents.ts';
import {
  ModuleStateComponent,
  DamageStateComponent,
} from './CombatComponents.ts';
import type { ModuleSlot } from './CombatComponents.ts';
import type { WeaponDef } from './WeaponDefinitions.ts';
import { globalBus, NetworkEvent } from '../../core/network/MessageBus.ts';

export interface DamageResult {
  shieldDamage:    number;
  hullDamage:      number;
  isCrit:          boolean;
  disabledModule:  ModuleSlot | null;
  killed:          boolean;
}

const MODULE_SLOTS: ModuleSlot[] = ['shields', 'engines', 'weapons', 'sensors'];

// Maps slot name → its timer field in ModuleStateData
const TIMER_KEY: Record<ModuleSlot, 'shieldsTimer' | 'enginesTimer' | 'weaponsTimer' | 'sensorsTimer'> = {
  shields: 'shieldsTimer',
  engines: 'enginesTimer',
  weapons: 'weaponsTimer',
  sensors: 'sensorsTimer',
};

let _simTime = 0;
export function advanceDamageTime(dt: number): void { _simTime += dt; }

export class DamageSystem {
  static processDamage(
    world:        World,
    targetEntity: EntityId,
    weaponDef:    WeaponDef,
    hitX:         number,
    hitY:         number,
    ownerEntity:  EntityId,
  ): DamageResult {
    const stats = world.getComponent(targetEntity, ShipStatsComponent);
    if (!stats) {
      return { shieldDamage: 0, hullDamage: 0, isCrit: false, disabledModule: null, killed: false };
    }

    // ── Crit roll ──────────────────────────────────────────────────────────
    const isCrit = Math.random() < weaponDef.critChance;
    let dmg = weaponDef.baseDamage * (isCrit ? weaponDef.critMultiplier : 1);

    // ── Armor reduction ────────────────────────────────────────────────────
    const ds          = world.getComponent(targetEntity, DamageStateComponent);
    const armorRating = ds?.armorRating ?? 0.15;
    // armorPen fraction bypasses armor; remainder is reduced
    dmg *= 1 - armorRating * (1 - weaponDef.armorPen);

    // ── Shield vs hull split ───────────────────────────────────────────────
    let shieldDamage = 0;
    let hullDamage   = 0;

    if (stats.shield > 0) {
      const toShield   = Math.min(stats.shield, dmg * (1 - weaponDef.shieldPen));
      const throughPen = dmg * weaponDef.shieldPen;
      shieldDamage      = toShield;
      hullDamage        = throughPen;
      stats.shield      = Math.max(0, stats.shield - toShield);
    } else {
      hullDamage = dmg;
    }

    stats.hull            = Math.max(0, stats.hull - hullDamage);
    stats.lastDamageTime  = _simTime;

    // ── Damage flash ───────────────────────────────────────────────────────
    const vis = world.getComponent(targetEntity, VisualComponent);
    if (vis) vis.damageFlashTimer = 0.12;

    // ── Module disable ─────────────────────────────────────────────────────
    let disabledModule: ModuleSlot | null = null;
    if (weaponDef.moduleDisableChance > 0 && Math.random() < weaponDef.moduleDisableChance) {
      const ms         = world.getComponent(targetEntity, ModuleStateComponent);
      const duration   = weaponDef.empDuration > 0 ? weaponDef.empDuration : 2.5;
      if (ms) {
        const online = MODULE_SLOTS.filter(s => ms[s]);
        if (online.length > 0) {
          disabledModule          = online[Math.floor(Math.random() * online.length)]!;
          ms[disabledModule]      = false;
          ms[TIMER_KEY[disabledModule]] += duration;
          // Update empFlickerTimer so renderer can show static
          if (ds) ds.empFlickerTimer = Math.max(ds.empFlickerTimer, duration);
        }
      }
    }

    const killed = stats.hull <= 0;

    globalBus.emit(NetworkEvent.COMBAT_HIT, {
      targetEntity,
      damage:        hullDamage + shieldDamage,
      x:             hitX,
      y:             hitY,
      isCrit,
      disabledModule,
      ownerEntity,
      isShieldHit:   shieldDamage > 0 && hullDamage === 0,
    });

    if (killed) {
      globalBus.emit(NetworkEvent.COMBAT_DEATH, { entity: targetEntity, x: hitX, y: hitY });
    }

    return { shieldDamage, hullDamage, isCrit, disabledModule, killed };
  }

  /** Tick module disable timers each simulation frame, restoring online status. */
  static updateModuleTimers(world: World, entity: EntityId, dt: number): void {
    const ms = world.getComponent(entity, ModuleStateComponent);
    if (!ms) return;
    const ds = world.getComponent(entity, DamageStateComponent);
    if (ds && ds.empFlickerTimer > 0) ds.empFlickerTimer -= dt;

    for (const slot of MODULE_SLOTS) {
      if (ms[slot]) continue;
      const key = TIMER_KEY[slot];
      ms[key] = Math.max(0, ms[key] - dt);
      if (ms[key] === 0) ms[slot] = true;
    }
  }

  /** AoE EMP — disables all modules on entities within radius. */
  static applyEMPArea(
    world:    World,
    cx:       number,
    cy:       number,
    radius:   number,
    duration: number,
    ownerEntity: EntityId,
  ): void {
    const entities = world.query(ShipStatsComponent);
    for (let i = 0; i < entities.length; i++) {
      const e = entities[i] as EntityId;
      if (e === ownerEntity) continue;
      const ms = world.getComponent(e, ModuleStateComponent);
      const ds = world.getComponent(e, DamageStateComponent);
      if (!ms) continue;
      for (const slot of MODULE_SLOTS) {
        ms[slot] = false;
        ms[TIMER_KEY[slot]] = Math.max(ms[TIMER_KEY[slot]], duration);
      }
      if (ds) ds.empFlickerTimer = duration;
    }
    globalBus.emit('combat:emp_detonated', { x: cx, y: cy, radius });
  }
}

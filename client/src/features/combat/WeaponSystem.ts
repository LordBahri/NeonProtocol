import type { World } from '../../core/ecs/World.ts';
import type { EntityId } from '../../core/ecs/types.ts';
import { createEntityId, INVALID_ENTITY } from '../../core/ecs/types.ts';
import { SystemPriority } from '../../core/ecs/SystemScheduler.ts';
import {
  TransformComponent,
  VelocityComponent,
  ShipStatsComponent,
  NetworkSyncComponent,
} from '../ships/ShipComponents.ts';
import { WeaponSlotComponent } from '../ships/ShipSystemComponents.ts';
import { WEAPON_DEFS } from './WeaponDefinitions.ts';
import type { WeaponDef } from './WeaponDefinitions.ts';
import {
  TargetingComponent,
  ModuleStateComponent,
  ActiveBeamComponent,
  DroneCarrierComponent,
} from './CombatComponents.ts';
import { TargetingSystem } from './TargetingSystem.ts';
import { DamageSystem, advanceDamageTime } from './DamageSystem.ts';
import { globalBus } from '../../core/network/MessageBus.ts';

// Lightweight missile tracker (not in ECS — visual pool handles rendering)
interface ActiveMissile {
  id:            number;
  ownerEntity:   EntityId;
  targetEntity:  EntityId;
  x:             number;
  y:             number;
  vx:            number;
  vy:            number;
  life:          number;   // remaining seconds
  def:           WeaponDef;
  isEMP:         boolean;
}

let _missileIdSeq  = 0;
const _missiles: ActiveMissile[] = [];

// Clip tracker: weaponSlot index per entity, keyed `${entityId}_${slotIdx}`
const _clips   = new Map<string, number>();
const _reloads = new Map<string, number>();

function clipKey(e: EntityId, slotIdx: number): string { return `${e}_${slotIdx}`; }

export const WeaponSystem = {
  name:     'WeaponSystem',
  priority: SystemPriority.COMBAT,

  update(world: World, dt: number): void {
    advanceDamageTime(dt);

    // ── 1. Update module disable timers ────────────────────────────────────
    const modEntities = world.query(ModuleStateComponent);
    for (let i = 0; i < modEntities.length; i++) {
      DamageSystem.updateModuleTimers(world, createEntityId(modEntities[i]!), dt);
    }

    // ── 2. Tick active beams ───────────────────────────────────────────────
    const beamEntities = world.query(ActiveBeamComponent, TransformComponent);
    for (let i = 0; i < beamEntities.length; i++) {
      const entity = createEntityId(beamEntities[i]!);
      const beam   = world.getComponent(entity, ActiveBeamComponent)!;
      if (!beam.active) continue;

      beam.timer -= dt;
      if (beam.timer <= 0) {
        beam.active = false;
        globalBus.emit('combat:beam_end', { entity });
        continue;
      }

      const targetTf = world.getComponent(beam.targetEntity, TransformComponent);
      if (!targetTf || !world.isAlive(beam.targetEntity)) {
        beam.active = false;
        globalBus.emit('combat:beam_end', { entity });
        continue;
      }

      // Per-frame beam damage (60 ticks → effective DPS = baseDamage * 60)
      const def = Object.values(WEAPON_DEFS).find(d => d.type === 'beam_laser');
      if (def) {
        DamageSystem.processDamage(
          world, beam.targetEntity, { ...def, baseDamage: def.baseDamage * dt },
          targetTf.x, targetTf.y, entity,
        );
      }

      globalBus.emit('combat:beam_update', {
        entity, targetEntity: beam.targetEntity, color: beam.color, width: beam.width,
      });
    }

    // ── 3. Tick and steer missiles ─────────────────────────────────────────
    for (let i = _missiles.length - 1; i >= 0; i--) {
      const m = _missiles[i]!;
      m.life -= dt;

      // Homing: steer toward predicted intercept
      if (m.targetEntity !== INVALID_ENTITY && world.isAlive(m.targetEntity)) {
        const ttf  = world.getComponent(m.targetEntity, TransformComponent);
        const tvel = world.getComponent(m.targetEntity, VelocityComponent);
        if (ttf) {
          const spd = Math.hypot(m.vx, m.vy);
          const predicted = TargetingSystem.predictIntercept(
            m.x, m.y, ttf.x, ttf.y,
            tvel?.vx ?? 0, tvel?.vy ?? 0, spd,
          );
          const desiredAngle = Math.atan2(predicted.y - m.y, predicted.x - m.x);
          const currentAngle = Math.atan2(m.vy, m.vx);
          let diff = desiredAngle - currentAngle;
          while (diff >  Math.PI) diff -= 2 * Math.PI;
          while (diff < -Math.PI) diff += 2 * Math.PI;
          const maxTurn   = m.def.trackingSpeed * dt;
          const turnAngle = Math.max(-maxTurn, Math.min(maxTurn, diff));
          const newAngle  = currentAngle + turnAngle;
          m.vx = Math.cos(newAngle) * spd;
          m.vy = Math.sin(newAngle) * spd;
        }
      }

      m.x += m.vx * dt;
      m.y += m.vy * dt;

      // Check impact with nearby enemy ships
      const ships = world.query(TransformComponent, ShipStatsComponent);
      let hit = false;
      for (let j = 0; j < ships.length; j++) {
        const se = createEntityId(ships[j]!);
        if (se === m.ownerEntity) continue;
        const stf = world.getComponent(se, TransformComponent)!;
        const dist = Math.hypot(stf.x - m.x, stf.y - m.y);
        if (dist < 20) {
          if (m.isEMP) {
            DamageSystem.applyEMPArea(world, m.x, m.y, m.def.empRadius, m.def.empDuration, m.ownerEntity);
            DamageSystem.processDamage(world, se, m.def, m.x, m.y, m.ownerEntity);
          } else {
            DamageSystem.processDamage(world, se, m.def, m.x, m.y, m.ownerEntity);
            globalBus.emit('combat:missile_impact', { id: m.id, x: m.x, y: m.y, scale: 0.8 });
          }
          hit = true;
          break;
        }
      }

      if (hit || m.life <= 0) {
        if (!hit) globalBus.emit('combat:missile_impact', { id: m.id, x: m.x, y: m.y, scale: 0.3 });
        _missiles.splice(i, 1);
      } else {
        globalBus.emit('combat:missile_move', { id: m.id, x: m.x, y: m.y, vx: m.vx, vy: m.vy });
      }
    }

    // ── 4. Fire weapons for all combat ships ───────────────────────────────
    const shooters = world.query(TargetingComponent, WeaponSlotComponent, TransformComponent);
    for (let i = 0; i < shooters.length; i++) {
      const entity   = createEntityId(shooters[i]!);
      const targeting = world.getComponent(entity, TargetingComponent)!;
      const slotComp  = world.getComponent(entity, WeaponSlotComponent)!;
      const tf        = world.getComponent(entity, TransformComponent)!;
      const vel       = world.getComponent(entity, VelocityComponent);
      const netSync   = world.getComponent(entity, NetworkSyncComponent);
      const isPlayer  = netSync?.isLocalPlayer ?? false;

      // ── Acquire target ──────────────────────────────────────────────────
      if (targeting.lockedTarget === INVALID_ENTITY || !world.isAlive(targeting.lockedTarget)) {
        targeting.lockedTarget = TargetingSystem.findNearestEnemy(
          world, entity, tf.x, tf.y, isPlayer, targeting.range,
        );
        targeting.lockProgress = 0;
      }

      const tgtAlive = targeting.lockedTarget !== INVALID_ENTITY && world.isAlive(targeting.lockedTarget);
      const tgtTf    = tgtAlive ? world.getComponent(targeting.lockedTarget, TransformComponent) : null;
      const dist     = tgtTf ? Math.hypot(tgtTf.x - tf.x, tgtTf.y - tf.y) : Infinity;

      const locked = TargetingSystem.updateLock(targeting, tgtAlive, dist, dt);

      if (tgtTf && locked) {
        const tgtVel = world.getComponent(targeting.lockedTarget, VelocityComponent);
        const predicted = TargetingSystem.predictIntercept(
          tf.x, tf.y,
          tgtTf.x, tgtTf.y,
          tgtVel?.vx ?? 0, tgtVel?.vy ?? 0,
          800,
        );
        targeting.predictedX = predicted.x;
        targeting.predictedY = predicted.y;
      }

      // ── Check weapons module ────────────────────────────────────────────
      if (!TargetingSystem.weaponsOnline(world, entity)) continue;
      if (!locked) continue;

      // ── Per-slot firing ─────────────────────────────────────────────────
      for (let s = 0; s < slotComp.slots.length; s++) {
        const slot = slotComp.slots[s]!;
        if (!slot.equippedType) continue;
        const def = WEAPON_DEFS[slot.equippedType];
        if (!def) continue;

        const ck = clipKey(entity, s);
        let shotsLeft = _clips.get(ck) ?? def.clipSize;
        let reloadRem = _reloads.get(ck) ?? 0;

        // Handle reload
        if (reloadRem > 0) {
          _reloads.set(ck, Math.max(0, reloadRem - dt));
          slot.cooldownTimer = Math.max(0, slot.cooldownTimer - dt);
          continue;
        }

        // Cooldown
        if (slot.cooldownTimer > 0) {
          slot.cooldownTimer -= dt;
          continue;
        }

        if (!tgtTf) continue;

        // ── Fire! ──────────────────────────────────────────────────────
        this._fire(world, entity, tf, vel, targeting, def, slot.equippedType);

        slot.cooldownTimer = 1 / def.fireRate;

        if (def.clipSize !== Infinity) {
          shotsLeft = Math.max(0, shotsLeft - 1);
          _clips.set(ck, shotsLeft);
          if (shotsLeft === 0) {
            _clips.set(ck, def.clipSize);
            _reloads.set(ck, def.reloadTime);
          }
        }
      }
    }
  },

  _fire(
    world:     World,
    entity:    EntityId,
    tf:        { x: number; y: number; angle: number },
    vel:       { vx: number; vy: number } | undefined,
    targeting: { lockedTarget: EntityId; predictedX: number; predictedY: number },
    def:       WeaponDef,
    weaponKey: string,
  ): void {
    const tx = targeting.predictedX;
    const ty = targeting.predictedY;
    const dx = tx - tf.x;
    const dy = ty - tf.y;
    const len = Math.hypot(dx, dy) + 0.001;

    switch (def.type) {
      case 'beam_laser': {
        let beam = world.getComponent(entity, ActiveBeamComponent);
        if (!beam) beam = world.addComponent(entity, ActiveBeamComponent);
        if (!beam.active) {
          beam.active       = true;
          beam.targetEntity = targeting.lockedTarget;
          beam.color        = def.color;
          beam.width        = def.beamWidth;
          beam.timer        = def.beamDuration;
          globalBus.emit('combat:beam_start', {
            entity, targetEntity: targeting.lockedTarget, color: def.color, width: def.beamWidth,
          });
        }
        break;
      }

      case 'pulse_laser':
      case 'autocannon': {
        const speed = def.projectileSpeed;
        const vx    = (dx / len) * speed + (vel?.vx ?? 0) * 0.15;
        const vy    = (dy / len) * speed + (vel?.vy ?? 0) * 0.15;
        globalBus.emit('combat:projectile_fired', {
          ownerEntity: entity,
          x: tf.x, y: tf.y, vx, vy,
          life:   def.range / speed,
          color:  def.color,
          size:   def.projectileLength * 0.5,
          length: def.projectileLength,
          type:   def.type === 'pulse_laser' ? 'laser' : 'cannon',
          damage: def.baseDamage,
          def:    weaponKey,
        });
        break;
      }

      case 'missile':
      case 'emp_bomb': {
        const speed = def.projectileSpeed;
        const m: ActiveMissile = {
          id:           ++_missileIdSeq,
          ownerEntity:  entity,
          targetEntity: targeting.lockedTarget,
          x:            tf.x, y: tf.y,
          vx:           (dx / len) * speed,
          vy:           (dy / len) * speed,
          life:         def.range / speed,
          def,
          isEMP:        def.type === 'emp_bomb',
        };
        _missiles.push(m);
        globalBus.emit('combat:missile_spawned', {
          id: m.id, x: m.x, y: m.y, vx: m.vx, vy: m.vy,
          color: def.color, isEMP: m.isEMP,
        });
        break;
      }

      case 'combat_drone': {
        const dc = world.getComponent(entity, DroneCarrierComponent);
        if (!dc || dc.activeDrones.length >= dc.maxDrones || dc.launchCooldown > 0) break;
        for (let d = 0; d < def.droneCount && dc.activeDrones.length < dc.maxDrones; d++) {
          const angle  = Math.random() * Math.PI * 2;
          const spread = 30 + d * 20;
          globalBus.emit('combat:drone_launched', {
            carrierId:    entity,
            targetEntity: targeting.lockedTarget,
            x:            tf.x + Math.cos(angle) * spread,
            y:            tf.y + Math.sin(angle) * spread,
            color:        def.color,
          });
        }
        dc.launchCooldown = 1 / def.fireRate;
        break;
      }
    }
  },
} as const;

export { _missiles as activeMissiles };

import type { FreightContract, ContractStatus, ItemType } from './EconomyTypes.ts';
import { ITEM_DEFS } from './EconomyTypes.ts';
import { useEconomyStore } from './InventoryStore.ts';
import type { GalaxyData } from '../galaxy/GalaxyTypes.ts';
import { globalBus } from '../../core/network/MessageBus.ts';

// ── Contract generation ───────────────────────────────────────────────────────

let _contractSeq = 0;
function contractId(): string { return `ctr_${Date.now()}_${++_contractSeq}`; }

const CONTRACT_EXPIRE_S   = 60 * 60 * 24;   // 24h
const CARGO_ITEMS: ItemType[] = [
  'iron_plate', 'crystal_shard', 'steel_ingot', 'plasma_cell', 'cryo_glass',
  'hull_plating', 'shield_array', 'drive_core', 'weapon_module', 'nano_repairer',
];

function riskForRoute(fromId: string, toId: string, galaxy: GalaxyData): number {
  const from = galaxy.systems.get(fromId);
  const to   = galaxy.systems.get(toId);
  if (!from || !to) return 0.5;
  return Math.min(1, (from.hazardLevel + to.hazardLevel) / 8 + (from.isPirateZone || to.isPirateZone ? 0.3 : 0));
}

function distanceFactor(fromId: string, toId: string, galaxy: GalaxyData): number {
  const from = galaxy.systems.get(fromId);
  const to   = galaxy.systems.get(toId);
  if (!from || !to) return 1;
  return Math.max(1, Math.hypot(to.x - from.x, to.y - from.y) / 3000);
}

/** Generate a pool of freight contracts between station systems. */
export function generateFreightContracts(galaxy: GalaxyData, count = 30): FreightContract[] {
  const stationSystems = [...galaxy.systems.values()].filter(s => s.stations.length > 0);
  if (stationSystems.length < 2) return [];

  const contracts: FreightContract[] = [];
  const nowMs = Date.now();

  for (let i = 0; i < count; i++) {
    const fromIdx = Math.floor(Math.random() * stationSystems.length);
    let   toIdx   = Math.floor(Math.random() * (stationSystems.length - 1));
    if (toIdx >= fromIdx) toIdx++;

    const fromSys  = stationSystems[fromIdx]!;
    const toSys    = stationSystems[toIdx]!;
    const cargo    = CARGO_ITEMS[Math.floor(Math.random() * CARGO_ITEMS.length)]!;
    const qty      = Math.round(10 + Math.random() * 90) * 10;
    const riskLvl  = riskForRoute(fromSys.id, toSys.id, galaxy);
    const distF    = distanceFactor(fromSys.id, toSys.id, galaxy);
    const baseVal  = (ITEM_DEFS[cargo]?.basePrice ?? 1000) * qty;
    const reward   = Math.round(baseVal * 0.08 * distF * (1 + riskLvl));
    const coll     = Math.round(baseVal * 0.5);

    contracts.push({
      id:             contractId(),
      fromStationId:  fromSys.stations[0]!.id,
      toStationId:    toSys.stations[0]!.id,
      fromSystemName: fromSys.name,
      toSystemName:   toSys.name,
      cargoType:      cargo,
      cargoQty:       qty,
      reward,
      collateral:     coll,
      riskLevel:      riskLvl,
      expiresAt:      nowMs + CONTRACT_EXPIRE_S * 1000,
      acceptedBy:     null,
      status:         'available' as ContractStatus,
    });
  }

  return contracts;
}

// ── HaulingSystem ──────────────────────────────────────────────────────────────
// Manages the active contract lifecycle and cargo-risk calculation.

export class HaulingSystem {
  private contracts:      FreightContract[] = [];
  private galaxy:         GalaxyData;
  private refreshTimer    = 0;
  private readonly REFRESH_INTERVAL = 300; // regenerate expired contracts every 5 min

  constructor(galaxy: GalaxyData) {
    this.galaxy    = galaxy;
    this.contracts = generateFreightContracts(galaxy, 30);
  }

  // ── Tick ──────────────────────────────────────────────────────────────────

  update(dt: number): void {
    this.refreshTimer += dt;
    const nowMs = Date.now();

    // Expire old contracts
    for (const c of this.contracts) {
      if (c.status === 'available' && nowMs > c.expiresAt) {
        c.status = 'expired';
      }
    }

    // Refresh pool
    if (this.refreshTimer >= this.REFRESH_INTERVAL) {
      this.refreshTimer = 0;
      const needed = 30 - this.contracts.filter(c => c.status === 'available').length;
      if (needed > 0) {
        this.contracts.push(...generateFreightContracts(this.galaxy, needed));
      }
    }
  }

  // ── Contract operations ────────────────────────────────────────────────────

  getAvailable(stationId?: string): FreightContract[] {
    return this.contracts.filter(c =>
      c.status === 'available' &&
      (!stationId || c.fromStationId === stationId),
    );
  }

  getAll(): FreightContract[] { return this.contracts; }

  accept(contractId: string, playerId: string): FreightContract | null {
    const c = this.contracts.find(ct => ct.id === contractId);
    if (!c || c.status !== 'available') return null;

    // Check player has cargo space
    const store = useEconomyStore.getState();
    if (!store.canFitCargo(c.cargoType, c.cargoQty)) return null;

    // Lock collateral
    if (!store.deductCredits(c.collateral, `Collateral: contract ${contractId}`)) return null;

    c.status     = 'accepted';
    c.acceptedBy = playerId;
    store.acceptContract(c);

    // Put cargo in hold
    store.addCargo(c.cargoType, c.cargoQty);

    globalBus.emit('contract:accepted', { contractId, reward: c.reward, riskLevel: c.riskLevel });
    return c;
  }

  deliver(contractId: string, playerId: string): boolean {
    const c = this.contracts.find(ct => ct.id === contractId && ct.acceptedBy === playerId);
    if (!c || (c.status !== 'accepted' && c.status !== 'in_transit')) return false;

    c.status = 'completed';

    const store = useEconomyStore.getState();
    store.completeContract(contractId);
    // Return collateral + reward
    store.addCredits(c.collateral + c.reward, `Contract complete: ${c.fromSystemName}→${c.toSystemName}`);

    globalBus.emit('contract:completed', { contractId, reward: c.reward });
    return true;
  }

  fail(contractId: string): void {
    const c = this.contracts.find(ct => ct.id === contractId);
    if (!c) return;
    c.status = 'failed';
    useEconomyStore.getState().failContract(contractId);
    globalBus.emit('contract:failed', { contractId, collateral: c.collateral });
  }

  // ── Cargo risk check ───────────────────────────────────────────────────────
  // Called when player enters a dangerous sector.
  // Returns true if an ambush triggers.

  rollCargoRisk(systemHazard: number, isPirateZone: boolean): boolean {
    const store = useEconomyStore.getState();
    if (!store.activeContractId) return false;

    const baseRisk    = systemHazard * 0.04;
    const pirateBonus = isPirateZone ? 0.12 : 0;
    const risk        = baseRisk + pirateBonus;

    return Math.random() < risk;
  }

  // ── Wreck loot (destruction-driven economy) ────────────────────────────────
  // When a ship is destroyed, 50% of cargo drops as a wreck.

  static generateWreckLoot(
    entityId: number, x: number, y: number,
    cargo: Partial<Record<ItemType, number>>,
  ): Partial<Record<ItemType, number>> {
    const dropped: Partial<Record<ItemType, number>> = {};
    for (const [item, qty] of Object.entries(cargo) as Array<[ItemType, number]>) {
      const drop = Math.floor(qty * 0.5);
      if (drop > 0) dropped[item] = drop;
    }
    if (Object.keys(dropped).length > 0) {
      globalBus.emit('economy:wreck_spawned', { entityId, x, y, cargo: dropped, expiresAt: Date.now() + 300_000 });
    }
    return dropped;
  }
}

import { createStore } from 'zustand/vanilla';
import type {
  ItemType, MarketOrder, BlueprintInstance,
  IndustrialJob, FreightContract, WreckLoot,
} from './EconomyTypes.ts';
import { ITEM_DEFS } from './EconomyTypes.ts';

// ── Types ─────────────────────────────────────────────────────────────────────

export type Cargo = Partial<Record<ItemType, number>>;

export interface TransactionRecord {
  id:        string;
  ts:        number;
  type:      'buy' | 'sell' | 'refine' | 'manufacture' | 'contract_reward' | 'contract_collateral' | 'loot';
  item?:     ItemType;
  qty?:      number;
  price?:    number;
  total:     number;   // positive = gain, negative = loss
  note:      string;
}

// ── Store interface ───────────────────────────────────────────────────────────

interface EconomyState {
  // Player wallet
  credits: number;

  // Cargo hold
  cargo:         Cargo;
  maxCargoUnits: number;   // total cargo capacity in volume units

  // Orders placed on the market
  openOrders: MarketOrder[];

  // Owned blueprints
  blueprints: BlueprintInstance[];

  // Industrial queue
  jobs: IndustrialJob[];

  // Freight contracts
  contracts:       FreightContract[];
  activeContractId: string | null;

  // Wreck loots in range
  nearbyWrecks: WreckLoot[];

  // Transaction ledger (last 200)
  ledger: TransactionRecord[];

  // ── Mutations ─────────────────────────────────────────────────────────────

  addCredits:    (amount: number, note?: string) => void;
  deductCredits: (amount: number, note?: string) => boolean;

  addCargo:    (item: ItemType, qty: number) => boolean;   // false if no space
  removeCargo: (item: ItemType, qty: number) => boolean;   // false if insufficient

  getCargoUsed: () => number;
  canFitCargo:  (item: ItemType, qty: number) => boolean;

  addOrder:    (order: MarketOrder) => void;
  removeOrder: (orderId: string) => void;

  addBlueprint:    (bp: BlueprintInstance) => void;
  removeBlueprint: (instId: string) => void;
  decrementBlueprintRun: (instId: string) => void;

  addJob:       (job: IndustrialJob) => void;
  completeJob:  (jobId: string) => void;

  acceptContract:   (contract: FreightContract) => void;
  completeContract: (contractId: string) => void;
  failContract:     (contractId: string) => void;

  setNearbyWrecks: (wrecks: WreckLoot[]) => void;
  lootWreck:       (wreckId: number) => void;

  recordTransaction: (rec: Omit<TransactionRecord, 'id' | 'ts'>) => void;
}

// ── Helper ─────────────────────────────────────────────────────────────────────

let _txSeq = 0;
function txId() { return `tx_${Date.now()}_${++_txSeq}`; }

function cargoVolume(cargo: Cargo): number {
  let total = 0;
  for (const [item, qty] of Object.entries(cargo) as Array<[ItemType, number]>) {
    total += (ITEM_DEFS[item]?.volume ?? 1) * qty;
  }
  return total;
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useEconomyStore = createStore<EconomyState>((set, get) => ({
  credits:         50_000,   // starting credits
  cargo:           {},
  maxCargoUnits:   500,      // default fighter cargo
  openOrders:      [],
  blueprints:      [],
  jobs:            [],
  contracts:       [],
  activeContractId: null,
  nearbyWrecks:    [],
  ledger:          [],

  // ── Credits ──────────────────────────────────────────────────────────────

  addCredits(amount, note = '') {
    set(s => ({ credits: s.credits + amount }));
    get().recordTransaction({ type: 'buy', total: amount, note: note || `+${amount} ISK` });
  },

  deductCredits(amount, note = '') {
    const cur = get().credits;
    if (cur < amount) return false;
    set(s => ({ credits: s.credits - amount }));
    get().recordTransaction({ type: 'sell', total: -amount, note: note || `-${amount} ISK` });
    return true;
  },

  // ── Cargo ─────────────────────────────────────────────────────────────────

  addCargo(item, qty) {
    const def   = ITEM_DEFS[item];
    if (!def) return false;
    const used  = cargoVolume(get().cargo);
    const added = def.volume * qty;
    if (used + added > get().maxCargoUnits) return false;
    set(s => ({ cargo: { ...s.cargo, [item]: (s.cargo[item] ?? 0) + qty } }));
    return true;
  },

  removeCargo(item, qty) {
    const cur = get().cargo[item] ?? 0;
    if (cur < qty) return false;
    set(s => {
      const next = { ...s.cargo };
      const newQty = (next[item] ?? 0) - qty;
      if (newQty <= 0) delete next[item];
      else             next[item] = newQty;
      return { cargo: next };
    });
    return true;
  },

  getCargoUsed() { return cargoVolume(get().cargo); },

  canFitCargo(item, qty) {
    const def  = ITEM_DEFS[item];
    if (!def) return false;
    return cargoVolume(get().cargo) + def.volume * qty <= get().maxCargoUnits;
  },

  // ── Orders ────────────────────────────────────────────────────────────────

  addOrder(order) {
    set(s => ({ openOrders: [...s.openOrders, order] }));
  },

  removeOrder(orderId) {
    set(s => ({ openOrders: s.openOrders.filter(o => o.id !== orderId) }));
  },

  // ── Blueprints ────────────────────────────────────────────────────────────

  addBlueprint(bp) {
    set(s => ({ blueprints: [...s.blueprints, bp] }));
  },

  removeBlueprint(instId) {
    set(s => ({ blueprints: s.blueprints.filter(b => b.instId !== instId) }));
  },

  decrementBlueprintRun(instId) {
    set(s => ({
      blueprints: s.blueprints
        .map(b => b.instId === instId && b.runsLeft > 0
          ? { ...b, runsLeft: b.runsLeft - 1 }
          : b
        )
        .filter(b => b.runsLeft !== 0),
    }));
  },

  // ── Jobs ──────────────────────────────────────────────────────────────────

  addJob(job) {
    set(s => ({ jobs: [...s.jobs, job] }));
  },

  completeJob(jobId) {
    const job = get().jobs.find(j => j.id === jobId);
    if (!job) return;
    // Credit output items to cargo
    for (const [item, qty] of Object.entries(job.output) as Array<[ItemType, number]>) {
      get().addCargo(item, qty);
    }
    set(s => ({ jobs: s.jobs.filter(j => j.id !== jobId) }));
  },

  // ── Contracts ─────────────────────────────────────────────────────────────

  acceptContract(contract) {
    set(s => ({
      contracts:        [...s.contracts, { ...contract, status: 'accepted' as const }],
      activeContractId: contract.id,
    }));
  },

  completeContract(contractId) {
    const c = get().contracts.find(ct => ct.id === contractId);
    if (!c) return;
    get().addCredits(c.reward);
    get().removeCargo(c.cargoType, c.cargoQty);
    set(s => ({
      contracts:        s.contracts.map(ct => ct.id === contractId ? { ...ct, status: 'completed' as const } : ct),
      activeContractId: null,
    }));
    get().recordTransaction({ type: 'contract_reward', total: c.reward, note: `Contract: ${c.fromSystemName}→${c.toSystemName}` });
  },

  failContract(contractId) {
    const c = get().contracts.find(ct => ct.id === contractId);
    if (!c) return;
    get().deductCredits(c.collateral);
    set(s => ({
      contracts:        s.contracts.map(ct => ct.id === contractId ? { ...ct, status: 'failed' as const } : ct),
      activeContractId: null,
    }));
    get().recordTransaction({ type: 'contract_collateral', total: -c.collateral, note: `Contract failed: ${c.fromSystemName}→${c.toSystemName}` });
  },

  // ── Wrecks ────────────────────────────────────────────────────────────────

  setNearbyWrecks(wrecks) { set({ nearbyWrecks: wrecks }); },

  lootWreck(wreckId) {
    const w = get().nearbyWrecks.find(w => w.entityId === wreckId);
    if (!w) return;
    for (const [item, qty] of Object.entries(w.cargo) as Array<[ItemType, number]>) {
      get().addCargo(item, qty);
      get().recordTransaction({ type: 'loot', item: item as ItemType, qty, total: (ITEM_DEFS[item as ItemType]?.basePrice ?? 0) * qty, note: `Looted wreck #${wreckId}` });
    }
    set(s => ({ nearbyWrecks: s.nearbyWrecks.filter(wr => wr.entityId !== wreckId) }));
  },

  // ── Ledger ────────────────────────────────────────────────────────────────

  recordTransaction(rec) {
    const full: TransactionRecord = { ...rec, id: txId(), ts: Date.now() };
    set(s => ({ ledger: [full, ...s.ledger].slice(0, 200) }));
  },
}));

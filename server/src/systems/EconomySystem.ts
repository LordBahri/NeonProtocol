// ─────────────────────────────────────────────────────────────────────────────
// EconomySystem — authoritative server-side economy for NeonProtocol
// Manages: order books, industrial jobs, freight contracts, loot drops, NPC seeding
// ─────────────────────────────────────────────────────────────────────────────

// ──────────────── Types ──────────────────────────────────────────────────────

export interface OrderEntry {
  id: string;
  ownerId: string;
  stationId: string;
  item: string;
  price: number;
  qty: number;
  qtyFilled: number;
  placedAt: number;
  expiresAt: number;
}

export type OrderSide = 'buy' | 'sell';

export interface PlaceOrderInput extends Omit<OrderEntry, 'id' | 'qtyFilled' | 'placedAt'> {
  side: OrderSide;
}

export interface FillResult {
  filled: boolean;
  fillQty: number;
  fillPrice: number;
  sellerGain: number;
  buyerPay: number;
  sellerTax: number;
  buyerFee: number;
}

export interface OrderBook {
  buyOrders: OrderEntry[];   // sorted desc by price
  sellOrders: OrderEntry[];  // sorted asc by price
}

export interface PriceBar {
  t: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IndustrialJob {
  id: string;
  ownerId: string;
  stationId: string;
  type: 'refine' | 'manufacture';
  input: Record<string, number>;
  output: Record<string, number>;
  startedAt: number;
  durationMs: number;
  completed: boolean;
}

export interface FreightContract {
  id: string;
  fromStationId: string;
  toStationId: string;
  cargoType: string;
  cargoQty: number;
  reward: number;
  collateral: number;
  riskLevel: number;
  expiresAt: number;
  acceptedBy: string | null;
  status: string;
}

// ──────────────── Constants ───────────────────────────────────────────────────

const TAX_RATE = 0.02;       // 2% seller transaction tax
const BROKER_FEE = 0.01;     // 1% buyer broker fee
const ORDER_TTL_MS = 7 * 24 * 60 * 60 * 1000;  // 7 days
const CONTRACT_TTL_MS = 3 * 24 * 60 * 60 * 1000; // 3 days
const PRICE_BAR_INTERVAL_MS = 60_000; // 60 s OHLC candle

/** Canonical base prices (ISK) for all tradeable items. */
const BASE_PRICES: Record<string, number> = {
  velite: 20,
  pyrite: 80,
  glacite: 300,
  voidite: 1200,
  ferrite: 15,
  lumite: 150,
  iron_plate: 180,
  crystal_shard: 720,
  cryo_glass: 2200,
  void_lattice: 9000,
  steel_ingot: 160,
  plasma_cell: 1100,
  hull_plating: 4500,
  shield_array: 3200,
  drive_core: 5800,
  weapon_module: 2900,
  nano_repairer: 2100,
};

const NPC_SELL_MULTIPLIER = 1.05;
const NPC_BUY_MULTIPLIER  = 0.95;
const NPC_SEED_QTY        = 1_000;
const NPC_OWNER_ID        = 'npc';

// ──────────────── Internal helpers ───────────────────────────────────────────

let _idCounter = 0;
function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${(++_idCounter).toString(36)}`;
}

/** Deterministic pseudo-random float in [0, 1) from a numeric seed. */
function seededRand(seed: number): number {
  const x = Math.sin(seed + 1) * 43758.5453123;
  return x - Math.floor(x);
}

// Key used to index books and histories: `${stationId}::${item}`
function bookKey(stationId: string, item: string): string {
  return `${stationId}::${item}`;
}

// ──────────────── EconomySystem ───────────────────────────────────────────────

// Per-market state stored keyed by bookKey()
interface MarketEntry {
  book: OrderBook;
  bars: PriceBar[];
  // Accumulator for the in-progress candle
  candle: {
    open: number | null;
    high: number;
    low: number;
    close: number;
    volume: number;
    startedAt: number;
  } | null;
}

class EconomySystemImpl {
  // ── Storage ──────────────────────────────────────────────────────────────
  private markets = new Map<string, MarketEntry>();
  private jobs     = new Map<string, IndustrialJob>();
  private contracts = new Map<string, FreightContract>();

  // Elapsed-time tracker for tickMarket bar accumulation
  private _lastBarFlushMs = 0;
  private _marketInitialised = false;

  // ── Private helpers ───────────────────────────────────────────────────────

  private getOrCreateMarket(stationId: string, item: string): MarketEntry {
    const key = bookKey(stationId, item);
    let entry = this.markets.get(key);
    if (!entry) {
      entry = {
        book: { buyOrders: [], sellOrders: [] },
        bars: [],
        candle: null,
      };
      this.markets.set(key, entry);
    }
    return entry;
  }

  /** Sort buy orders descending by price (FIFO within same price). */
  private sortBuys(orders: OrderEntry[]): void {
    orders.sort((a, b) => b.price - a.price || a.placedAt - b.placedAt);
  }

  /** Sort sell orders ascending by price (FIFO within same price). */
  private sortSells(orders: OrderEntry[]): void {
    orders.sort((a, b) => a.price - b.price || a.placedAt - b.placedAt);
  }

  /**
   * Record a trade execution into the OHLC accumulator.
   * fillPrice and fillQty are the matched values.
   */
  private recordTrade(entry: MarketEntry, fillPrice: number, fillQty: number): void {
    const now = Date.now();
    if (!entry.candle) {
      entry.candle = {
        open: fillPrice,
        high: fillPrice,
        low: fillPrice,
        close: fillPrice,
        volume: fillQty,
        startedAt: now,
      };
      return;
    }
    const c = entry.candle;
    if (c.open === null) c.open = fillPrice;
    if (fillPrice > c.high) c.high = fillPrice;
    if (fillPrice < c.low)  c.low  = fillPrice;
    c.close   = fillPrice;
    c.volume += fillQty;
  }

  /**
   * Continuous order matching.
   * Mutates both books in `entry` and returns the list of FillResults produced.
   */
  private matchOrders(
    entry: MarketEntry,
    incomingSide: OrderSide,
    incoming: OrderEntry,
  ): FillResult[] {
    const fills: FillResult[] = [];

    if (incomingSide === 'buy') {
      const { sellOrders } = entry.book;
      while (incoming.qty - incoming.qtyFilled > 0 && sellOrders.length > 0) {
        const best = sellOrders[0]!;
        if (incoming.price < best.price) break; // no match

        const available = best.qty - best.qtyFilled;
        const need      = incoming.qty - incoming.qtyFilled;
        const fillQty   = Math.min(available, need);
        const fillPrice = best.price; // price-time priority: seller's price

        const grossPay   = fillPrice * fillQty;
        const sellerTax  = grossPay * TAX_RATE;
        const buyerFee   = grossPay * BROKER_FEE;

        const fill: FillResult = {
          filled:     fillQty === need,
          fillQty,
          fillPrice,
          sellerGain: grossPay - sellerTax,
          buyerPay:   grossPay + buyerFee,
          sellerTax,
          buyerFee,
        };
        fills.push(fill);

        incoming.qtyFilled += fillQty;
        best.qtyFilled     += fillQty;

        this.recordTrade(entry, fillPrice, fillQty);

        if (best.qtyFilled >= best.qty) {
          sellOrders.shift(); // fully consumed
        }
      }
    } else {
      // sell order matching against buy orders
      const { buyOrders } = entry.book;
      while (incoming.qty - incoming.qtyFilled > 0 && buyOrders.length > 0) {
        const best = buyOrders[0]!;
        if (incoming.price > best.price) break; // no match

        const available = best.qty - best.qtyFilled;
        const need      = incoming.qty - incoming.qtyFilled;
        const fillQty   = Math.min(available, need);
        const fillPrice = best.price; // buyer's (higher) price

        const grossPay   = fillPrice * fillQty;
        const sellerTax  = grossPay * TAX_RATE;
        const buyerFee   = grossPay * BROKER_FEE;

        const fill: FillResult = {
          filled:     fillQty === need,
          fillQty,
          fillPrice,
          sellerGain: grossPay - sellerTax,
          buyerPay:   grossPay + buyerFee,
          sellerTax,
          buyerFee,
        };
        fills.push(fill);

        incoming.qtyFilled += fillQty;
        best.qtyFilled     += fillQty;

        this.recordTrade(entry, fillPrice, fillQty);

        if (best.qtyFilled >= best.qty) {
          buyOrders.shift(); // fully consumed
        }
      }
    }

    return fills;
  }

  // ── Order book public API ─────────────────────────────────────────────────

  /**
   * Place a buy or sell order with continuous matching.
   * Returns all FillResults that occurred during matching.
   * Any unfilled remainder is rested on the book.
   */
  placeOrder(
    orderInput: Omit<OrderEntry, 'id' | 'qtyFilled' | 'placedAt'> & { side: OrderSide },
  ): FillResult[] {
    const { side, ...rest } = orderInput;
    const now = Date.now();

    const order: OrderEntry = {
      id:        genId('ord'),
      qtyFilled: 0,
      placedAt:  now,
      ...rest,
    };

    const entry = this.getOrCreateMarket(order.stationId, order.item);
    const fills = this.matchOrders(entry, side, order);

    // Rest unfilled remainder on the book
    const remaining = order.qty - order.qtyFilled;
    if (remaining > 0) {
      if (side === 'buy') {
        entry.book.buyOrders.push(order);
        this.sortBuys(entry.book.buyOrders);
      } else {
        entry.book.sellOrders.push(order);
        this.sortSells(entry.book.sellOrders);
      }
    }

    return fills;
  }

  /**
   * Cancel an open order.  Returns true if the order was found and owned by ownerId.
   */
  cancelOrder(orderId: string, ownerId: string): boolean {
    for (const entry of this.markets.values()) {
      for (const side of ['buyOrders', 'sellOrders'] as const) {
        const orders = entry.book[side];
        const idx = orders.findIndex(o => o.id === orderId);
        if (idx !== -1) {
          const order = orders[idx]!;
          if (order.ownerId !== ownerId) return false;
          orders.splice(idx, 1);
          return true;
        }
      }
    }
    return false;
  }

  getBestBuy(stationId: string, item: string): number | null {
    const entry = this.markets.get(bookKey(stationId, item));
    if (!entry || entry.book.buyOrders.length === 0) return null;
    return entry.book.buyOrders[0]!.price;
  }

  getBestSell(stationId: string, item: string): number | null {
    const entry = this.markets.get(bookKey(stationId, item));
    if (!entry || entry.book.sellOrders.length === 0) return null;
    return entry.book.sellOrders[0]!.price;
  }

  getOrderBook(stationId: string, item: string): { buys: OrderEntry[]; sells: OrderEntry[] } {
    const entry = this.markets.get(bookKey(stationId, item));
    if (!entry) return { buys: [], sells: [] };
    return { buys: [...entry.book.buyOrders], sells: [...entry.book.sellOrders] };
  }

  getPriceHistory(stationId: string, item: string): PriceBar[] {
    const entry = this.markets.get(bookKey(stationId, item));
    if (!entry) return [];
    return [...entry.bars];
  }

  /**
   * Called on every server tick (dt in milliseconds).
   * Expires stale orders and flushes OHLC bars every PRICE_BAR_INTERVAL_MS.
   */
  tickMarket(dt: number): void {
    const now = Date.now();

    if (!this._marketInitialised) {
      this._lastBarFlushMs = now;
      this._marketInitialised = true;
    }

    this._lastBarFlushMs += dt;
    const shouldFlushBar = this._lastBarFlushMs >= PRICE_BAR_INTERVAL_MS;
    if (shouldFlushBar) {
      this._lastBarFlushMs = this._lastBarFlushMs % PRICE_BAR_INTERVAL_MS;
    }

    for (const entry of this.markets.values()) {
      // Expire buy orders
      entry.book.buyOrders = entry.book.buyOrders.filter(o => now < o.expiresAt);
      // Expire sell orders
      entry.book.sellOrders = entry.book.sellOrders.filter(o => now < o.expiresAt);

      // Flush OHLC bar
      if (shouldFlushBar && entry.candle) {
        const c = entry.candle;
        entry.bars.push({
          t:      now,
          open:   c.open ?? c.close,
          high:   c.high,
          low:    c.low,
          close:  c.close,
          volume: c.volume,
        });
        // Keep last 1440 bars (24 h at 1-min resolution)
        if (entry.bars.length > 1440) entry.bars.splice(0, entry.bars.length - 1440);
        entry.candle = null;
      }
    }
  }

  // ── Industrial jobs ───────────────────────────────────────────────────────

  /**
   * Enqueue a new industrial job.  Returns the generated job ID.
   */
  startJob(job: Omit<IndustrialJob, 'id' | 'startedAt' | 'completed'>): string {
    const id = genId('job');
    const newJob: IndustrialJob = {
      id,
      startedAt: Date.now(),
      completed: false,
      ...job,
    };
    this.jobs.set(id, newJob);
    return id;
  }

  /**
   * Advance the job queue.  Returns all jobs that completed at or before nowMs.
   */
  tickJobs(nowMs: number): IndustrialJob[] {
    const completed: IndustrialJob[] = [];
    for (const job of this.jobs.values()) {
      if (!job.completed && nowMs >= job.startedAt + job.durationMs) {
        job.completed = true;
        completed.push(job);
      }
    }
    return completed;
  }

  getPlayerJobs(ownerId: string): IndustrialJob[] {
    return Array.from(this.jobs.values()).filter(j => j.ownerId === ownerId);
  }

  // ── Freight contracts ─────────────────────────────────────────────────────

  /**
   * Generate freight contracts for each pair of the given station IDs.
   * count defaults to 5 per station pair.
   */
  generateContracts(stationIds: string[], count = 5): void {
    const now = Date.now();
    const items = Object.keys(BASE_PRICES);

    for (let i = 0; i < stationIds.length; i++) {
      for (let j = 0; j < stationIds.length; j++) {
        if (i === j) continue;
        const fromId = stationIds[i]!;
        const toId   = stationIds[j]!;

        for (let k = 0; k < count; k++) {
          const seedBase = i * 10_000 + j * 100 + k + now;
          const itemIndex  = Math.floor(seededRand(seedBase)      * items.length);
          const cargoType  = items[itemIndex]!;
          const basePrice  = BASE_PRICES[cargoType] ?? 100;
          const cargoQty   = 10 + Math.floor(seededRand(seedBase + 1) * 90); // 10–99
          const riskLevel  = Math.round(seededRand(seedBase + 2) * 10) / 10; // 0.0–1.0
          // Reward scales with cargo value, distance (proxy: i+j), and risk
          const reward     = Math.round(basePrice * cargoQty * 0.08 * (1 + riskLevel) * (1 + (i + j) * 0.05));
          const collateral = Math.round(basePrice * cargoQty * 0.5);

          const contract: FreightContract = {
            id:            genId('ctr'),
            fromStationId: fromId,
            toStationId:   toId,
            cargoType,
            cargoQty,
            reward,
            collateral,
            riskLevel,
            expiresAt:     now + CONTRACT_TTL_MS,
            acceptedBy:    null,
            status:        'available',
          };
          this.contracts.set(contract.id, contract);
        }
      }
    }
  }

  /**
   * Accept a freight contract.  Returns false if unavailable or already taken.
   */
  acceptContract(contractId: string, playerId: string): boolean {
    const contract = this.contracts.get(contractId);
    if (!contract || contract.status !== 'available' || contract.acceptedBy !== null) {
      return false;
    }
    contract.acceptedBy = playerId;
    contract.status     = 'in_transit';
    return true;
  }

  /**
   * Mark a contract as delivered.  Returns the reward paid to the courier.
   * Returns 0 if the contract cannot be completed by this player.
   */
  completeContract(contractId: string, playerId: string): number {
    const contract = this.contracts.get(contractId);
    if (!contract || contract.status !== 'in_transit' || contract.acceptedBy !== playerId) {
      return 0;
    }
    contract.status = 'completed';
    return contract.reward;
  }

  /**
   * Mark a contract as failed (e.g. courier destroyed).
   * Returns the collateral forfeited by the courier.
   */
  failContract(contractId: string): number {
    const contract = this.contracts.get(contractId);
    if (!contract || contract.status === 'completed' || contract.status === 'failed') {
      return 0;
    }
    contract.status = 'failed';
    return contract.collateral;
  }

  /**
   * Returns contracts that originate from stationId and are still available.
   */
  getAvailableContracts(stationId: string): FreightContract[] {
    return Array.from(this.contracts.values()).filter(
      c => c.fromStationId === stationId && c.status === 'available',
    );
  }

  /**
   * Expire contracts whose expiresAt is before nowMs.
   */
  tickContracts(nowMs: number): void {
    for (const contract of this.contracts.values()) {
      if (contract.status === 'available' && nowMs >= contract.expiresAt) {
        contract.status = 'expired';
      }
    }
  }

  // ── Destruction loot ──────────────────────────────────────────────────────

  /**
   * Compute loot drop when a ship is destroyed.
   * 50% of each cargo stack drops (floor), remainder is destroyed.
   * Returns the dropped items.
   */
  onShipDestroyed(
    _ownerId: string,
    cargo: Record<string, number>,
  ): Record<string, number> {
    const dropped: Record<string, number> = {};
    for (const [item, qty] of Object.entries(cargo)) {
      const dropQty = Math.floor(qty * 0.5);
      if (dropQty > 0) {
        dropped[item] = dropQty;
      }
    }
    return dropped;
  }

  // ── NPC market seeding ────────────────────────────────────────────────────

  /**
   * Place standing NPC buy and sell orders at the given station for all base items.
   * NPC sell price = base × 1.05, NPC buy price = base × 0.95.
   * Uses ownerId 'npc' and a far-future expiry so they persist until manually cancelled.
   */
  seedNPCOrders(stationId: string): void {
    const now      = Date.now();
    const farFuture = now + ORDER_TTL_MS * 52; // ~1 year

    for (const [item, basePrice] of Object.entries(BASE_PRICES)) {
      const sellPrice = Math.round(basePrice * NPC_SELL_MULTIPLIER * 100) / 100;
      const buyPrice  = Math.round(basePrice * NPC_BUY_MULTIPLIER  * 100) / 100;

      // NPC sell order
      this.placeOrder({
        side:      'sell',
        ownerId:   NPC_OWNER_ID,
        stationId,
        item,
        price:     sellPrice,
        qty:       NPC_SEED_QTY,
        expiresAt: farFuture,
      });

      // NPC buy order
      this.placeOrder({
        side:      'buy',
        ownerId:   NPC_OWNER_ID,
        stationId,
        item,
        price:     buyPrice,
        qty:       NPC_SEED_QTY,
        expiresAt: farFuture,
      });
    }
  }
}

// ──────────────── Singleton export ───────────────────────────────────────────

export const EconomySystem = new EconomySystemImpl();

import type { ItemType, MarketOrder, PriceBar, OrderFill } from './EconomyTypes.ts';
import { ITEM_DEFS } from './EconomyTypes.ts';

// ── Constants ─────────────────────────────────────────────────────────────────

const SALES_TAX       = 0.02;   // 2% paid by seller on each fill
const BROKER_FEE      = 0.01;   // 1% paid by buyer on order placement
const BAR_INTERVAL_MS = 60_000; // 1 price bar per minute
const MAX_BARS        = 120;    // 2 hours of history
const PRICE_PRICE_CAP = 10;     // max 10× base price
const PRICE_FLOOR     = 0.1;    // min 0.1× base price
const ORDER_EXPIRE_MS = 7 * 24 * 3600 * 1000; // 7 days

let _orderSeq = 0;
export function nextOrderId(): string { return `ord_${Date.now()}_${++_orderSeq}`; }

// ── Regional order book (one per station) ─────────────────────────────────────

interface CurrentBar {
  open: number; high: number; low: number; close: number; volume: number;
  startMs: number;
}

class StationMarket {
  readonly stationId: string;
  private buyOrders  = new Map<ItemType, MarketOrder[]>();
  private sellOrders = new Map<ItemType, MarketOrder[]>();
  private history    = new Map<ItemType, PriceBar[]>();
  private currentBar = new Map<ItemType, CurrentBar>();

  constructor(stationId: string) {
    this.stationId = stationId;
    this._seedNPCOrders();
  }

  // ── Order book accessors ────────────────────────────────────────────────

  getBestBuy(item: ItemType): number | null {
    const orders = this.buyOrders.get(item);
    if (!orders || orders.length === 0) return null;
    return orders[0]!.price;
  }

  getBestSell(item: ItemType): number | null {
    const orders = this.sellOrders.get(item);
    if (!orders || orders.length === 0) return null;
    return orders[0]!.price;
  }

  getOrderBook(item: ItemType): { buys: MarketOrder[]; sells: MarketOrder[] } {
    return {
      buys:  [...(this.buyOrders.get(item) ?? [])].slice(0, 20),
      sells: [...(this.sellOrders.get(item) ?? [])].slice(0, 20),
    };
  }

  getPriceHistory(item: ItemType): PriceBar[] {
    return this.history.get(item) ?? [];
  }

  getLastPrice(item: ItemType): number {
    const hist = this.history.get(item);
    if (hist && hist.length > 0) return hist[hist.length - 1]!.close;
    return ITEM_DEFS[item]?.basePrice ?? 0;
  }

  // ── Place order (returns list of fills) ─────────────────────────────────

  placeOrder(order: MarketOrder): OrderFill[] {
    const fills: OrderFill[] = [];

    if (order.type === 'sell') {
      const bids = this._getBuys(order.item);
      // Match against buy orders (desc by price); fill if buy.price >= sell.price
      for (let i = 0; i < bids.length && order.qtyRemaining > 0; i++) {
        const bid = bids[i]!;
        if (bid.price < order.price) break;
        const fillQty   = Math.min(bid.qtyRemaining, order.qtyRemaining);
        const fillPrice = bid.price;    // seller gets buyer's price (pro-buyer)

        fills.push(this._recordFill(bid, order, fillQty, fillPrice));
        bid.qtyRemaining   -= fillQty;
        order.qtyRemaining -= fillQty;
      }
      // Remove exhausted buy orders
      this.buyOrders.set(order.item, bids.filter(b => b.qtyRemaining > 0));
      // If sell order still has remaining, add to book
      if (order.qtyRemaining > 0) {
        const asks = this._getSells(order.item);
        asks.push(order);
        asks.sort((a, b) => a.price - b.price);
        this.sellOrders.set(order.item, asks);
      }
    } else {
      // Buy order — match against sell orders (asc by price)
      const asks = this._getSells(order.item);
      for (let i = 0; i < asks.length && order.qtyRemaining > 0; i++) {
        const ask = asks[i]!;
        if (ask.price > order.price) break;
        const fillQty   = Math.min(ask.qtyRemaining, order.qtyRemaining);
        const fillPrice = ask.price;    // buyer pays seller's price (pro-seller)

        fills.push(this._recordFill(order, ask, fillQty, fillPrice));
        ask.qtyRemaining   -= fillQty;
        order.qtyRemaining -= fillQty;
      }
      this.sellOrders.set(order.item, asks.filter(a => a.qtyRemaining > 0));
      if (order.qtyRemaining > 0) {
        const bids = this._getBuys(order.item);
        bids.push(order);
        bids.sort((a, b) => b.price - a.price);
        this.buyOrders.set(order.item, bids);
      }
    }

    return fills;
  }

  cancelOrder(orderId: string): boolean {
    for (const [item, orders] of this.buyOrders) {
      const idx = orders.findIndex(o => o.id === orderId);
      if (idx !== -1) { orders.splice(idx, 1); this.buyOrders.set(item, orders); return true; }
    }
    for (const [item, orders] of this.sellOrders) {
      const idx = orders.findIndex(o => o.id === orderId);
      if (idx !== -1) { orders.splice(idx, 1); this.sellOrders.set(item, orders); return true; }
    }
    return false;
  }

  // ── Market tick: expire orders, close price bars ─────────────────────────

  tick(nowMs: number): void {
    const expireOrder = (o: MarketOrder) => nowMs > o.expiresAt;

    for (const [item, orders] of this.buyOrders) {
      this.buyOrders.set(item, orders.filter(o => !expireOrder(o)));
    }
    for (const [item, orders] of this.sellOrders) {
      this.sellOrders.set(item, orders.filter(o => !expireOrder(o)));
    }

    // Close and archive bars that have expired
    for (const [item, bar] of this.currentBar) {
      if (nowMs - bar.startMs >= BAR_INTERVAL_MS) {
        this._closeBar(item, bar, nowMs);
      }
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────

  private _getBuys(item: ItemType): MarketOrder[] {
    let arr = this.buyOrders.get(item);
    if (!arr) { arr = []; this.buyOrders.set(item, arr); }
    return arr;
  }

  private _getSells(item: ItemType): MarketOrder[] {
    let arr = this.sellOrders.get(item);
    if (!arr) { arr = []; this.sellOrders.set(item, arr); }
    return arr;
  }

  private _recordFill(
    buyOrder: MarketOrder, sellOrder: MarketOrder,
    qty: number, price: number,
  ): OrderFill {
    const gross     = price * qty;
    const sellerTax = gross * SALES_TAX;
    const buyerFee  = gross * BROKER_FEE;

    // Update price history
    const def = ITEM_DEFS[buyOrder.item];
    const base = def?.basePrice ?? price;
    const cap  = base * PRICE_PRICE_CAP;
    const floor = base * PRICE_FLOOR;
    const clamped = Math.max(floor, Math.min(cap, price));
    this._updateBar(buyOrder.item, clamped, qty);

    return {
      orderId:  buyOrder.id,
      buyerId:  buyOrder.ownerId,
      sellerId: sellOrder.ownerId,
      item:     buyOrder.item,
      qty, price, buyerFee, sellerTax,
    };
  }

  private _updateBar(item: ItemType, price: number, volume: number): void {
    let bar = this.currentBar.get(item);
    if (!bar) {
      bar = { open: price, high: price, low: price, close: price, volume: 0, startMs: Date.now() };
      this.currentBar.set(item, bar);
    }
    if (price > bar.high) bar.high = price;
    if (price < bar.low)  bar.low  = price;
    bar.close   = price;
    bar.volume += volume;
  }

  private _closeBar(item: ItemType, bar: CurrentBar, nowMs: number): void {
    const hist = this.history.get(item) ?? [];
    hist.push({ t: bar.startMs, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume });
    if (hist.length > MAX_BARS) hist.shift();
    this.history.set(item, hist);
    this.currentBar.set(item, { open: bar.close, high: bar.close, low: bar.close, close: bar.close, volume: 0, startMs: nowMs });
  }

  private _seedNPCOrders(): void {
    const nowMs  = Date.now();
    const expiry = nowMs + ORDER_EXPIRE_MS;

    const TRADE_ITEMS: ItemType[] = [
      'velite', 'pyrite', 'glacite', 'ferrite', 'lumite',
      'iron_plate', 'crystal_shard', 'steel_ingot', 'plasma_cell',
      'hull_plating', 'shield_array', 'drive_core', 'weapon_module', 'nano_repairer',
    ];

    for (const item of TRADE_ITEMS) {
      const def = ITEM_DEFS[item];
      if (!def) continue;

      const buyPrice  = Math.round(def.basePrice * 0.92);
      const sellPrice = Math.round(def.basePrice * 1.08);
      const qty       = item.endsWith('_plate') || item === 'velite' || item === 'ferrite' ? 5000 : 500;

      const buyOrder: MarketOrder = {
        id: nextOrderId(), type: 'buy', item, price: buyPrice,
        qty, qtyRemaining: qty, ownerId: 'npc', stationId: this.stationId,
        placedAt: nowMs, expiresAt: expiry, isNPC: true,
      };
      const sellOrder: MarketOrder = {
        id: nextOrderId(), type: 'sell', item, price: sellPrice,
        qty, qtyRemaining: qty, ownerId: 'npc', stationId: this.stationId,
        placedAt: nowMs, expiresAt: expiry, isNPC: true,
      };

      this._getBuys(item).push(buyOrder);
      this._getSells(item).push(sellOrder);

      // Seed initial price history
      const hist: PriceBar[] = [];
      let p = def.basePrice;
      for (let i = MAX_BARS; i > 0; i--) {
        p += p * (Math.random() - 0.5) * 0.03;
        p  = Math.max(def.basePrice * PRICE_FLOOR, Math.min(def.basePrice * PRICE_PRICE_CAP, p));
        hist.push({ t: nowMs - i * BAR_INTERVAL_MS, open: p, high: p * 1.005, low: p * 0.995, close: p, volume: Math.round(Math.random() * qty * 0.2) });
      }
      this.history.set(item, hist);
    }
  }
}

// ── MarketEngine ──────────────────────────────────────────────────────────────
// Manages one StationMarket per station. Driven by GalaxyData stations.

export class MarketEngine {
  private stations = new Map<string, StationMarket>();
  private tickTimer = 0;
  private readonly TICK_INTERVAL = 10; // seconds

  /** Ensure a market exists for the given station. */
  ensureStation(stationId: string): StationMarket {
    if (!this.stations.has(stationId)) {
      this.stations.set(stationId, new StationMarket(stationId));
    }
    return this.stations.get(stationId)!;
  }

  /** Per-render-frame tick. */
  update(dt: number): void {
    this.tickTimer += dt;
    if (this.tickTimer < this.TICK_INTERVAL) return;
    this.tickTimer = 0;
    const nowMs = Date.now();
    for (const market of this.stations.values()) market.tick(nowMs);
  }

  // ── Order operations ────────────────────────────────────────────────────

  placeOrder(order: Omit<MarketOrder, 'id' | 'placedAt' | 'expiresAt' | 'qtyRemaining'>): {
    order: MarketOrder; fills: OrderFill[]; brokerFee: number;
  } {
    const market = this.ensureStation(order.stationId);
    const nowMs  = Date.now();
    const full: MarketOrder = {
      ...order,
      id:           nextOrderId(),
      qtyRemaining: order.qty,
      placedAt:     nowMs,
      expiresAt:    nowMs + ORDER_EXPIRE_MS,
    };

    const brokerFee = order.type === 'buy'
      ? Math.round(full.price * full.qty * BROKER_FEE)
      : 0;

    const fills = market.placeOrder(full);
    return { order: full, fills, brokerFee };
  }

  cancelOrder(stationId: string, orderId: string): boolean {
    return this.ensureStation(stationId).cancelOrder(orderId);
  }

  // ── Queries ─────────────────────────────────────────────────────────────

  getBestBuy(stationId: string, item: ItemType): number | null {
    return this.ensureStation(stationId).getBestBuy(item);
  }

  getBestSell(stationId: string, item: ItemType): number | null {
    return this.ensureStation(stationId).getBestSell(item);
  }

  getOrderBook(stationId: string, item: ItemType) {
    return this.ensureStation(stationId).getOrderBook(item);
  }

  getPriceHistory(stationId: string, item: ItemType): PriceBar[] {
    return this.ensureStation(stationId).getPriceHistory(item);
  }

  getLastPrice(stationId: string, item: ItemType): number {
    return this.ensureStation(stationId).getLastPrice(item);
  }

  // ── Tax helpers ─────────────────────────────────────────────────────────

  static salesTax(gross: number): number { return Math.round(gross * SALES_TAX); }
  static brokerFee(gross: number): number { return Math.round(gross * BROKER_FEE); }
}

// Singleton
export const marketEngine = new MarketEngine();

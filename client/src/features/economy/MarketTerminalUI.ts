import type { ItemType, PriceBar } from './EconomyTypes.ts';
import { ITEM_DEFS, MANUFACTURE_BLUEPRINTS, REFINE_RECIPES } from './EconomyTypes.ts';
import { marketEngine } from './MarketEngine.ts';
import { useEconomyStore } from './InventoryStore.ts';
import { RefinerySystem } from './RefinerySystem.ts';
import type { HaulingSystem } from './HaulingSystem.ts';
import { globalBus } from '../../core/network/MessageBus.ts';

// ── Tabs ──────────────────────────────────────────────────────────────────────

type Tab = 'market' | 'inventory' | 'industry' | 'contracts';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'market',    label: 'Market'    },
  { id: 'inventory', label: 'Inventory' },
  { id: 'industry',  label: 'Industry'  },
  { id: 'contracts', label: 'Contracts' },
];

// ── Price sparkline (inline SVG) ──────────────────────────────────────────────

function renderSparkline(bars: PriceBar[], w = 120, h = 32): string {
  if (bars.length < 2) return `<svg width="${w}" height="${h}"></svg>`;
  const prices = bars.map(b => b.close);
  const min    = Math.min(...prices);
  const max    = Math.max(...prices);
  const range  = max - min || 1;
  const pts    = prices.map((p, i) => {
    const x = (i / (prices.length - 1)) * w;
    const y = h - ((p - min) / range) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const trend  = prices[prices.length - 1]! > prices[0]! ? '#00ff88' : '#ff4444';
  return `<svg width="${w}" height="${h}" style="display:block"><polyline points="${pts}" fill="none" stroke="${trend}" stroke-width="1.5"/></svg>`;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'k';
  return n.toFixed(0);
}

// ── MarketTerminalUI ──────────────────────────────────────────────────────────

export class MarketTerminalUI {
  private el:       HTMLElement;
  private visible   = false;
  private activeTab: Tab = 'market';
  private stationId = 'default_station';
  private selectedItem: ItemType = 'velite';
  private unsubs: Array<() => void> = [];
  private hauling: HaulingSystem;

  constructor(uiLayer: HTMLElement, hauling: HaulingSystem) {
    this.hauling = hauling;
    this.el      = document.createElement('div');
    this.el.id   = 'market-terminal';
    uiLayer.appendChild(this.el);

    this._injectStyles();
    this._render();

    window.addEventListener('keydown', this._onKey.bind(this));

    this.unsubs.push(
      globalBus.on('industry:job_complete', () => {
        if (this.visible && this.activeTab === 'industry') this._render();
      }),
      globalBus.on('industry:job_started', () => {
        if (this.visible && this.activeTab === 'industry') this._render();
      }),
    );
  }

  // ── Visibility ────────────────────────────────────────────────────────────

  show(stationId?: string): void {
    if (stationId) this.stationId = stationId;
    this.visible   = true;
    this.el.style.display = 'flex';
    this._render();
  }

  hide(): void {
    this.visible          = false;
    this.el.style.display = 'none';
  }

  toggle(stationId?: string): void {
    this.visible ? this.hide() : this.show(stationId);
  }

  get isVisible(): boolean { return this.visible; }

  // ── Per-frame update (tick job timers) ────────────────────────────────────

  update(dt: number): void {
    RefinerySystem.update(dt);
    this.hauling.update(dt);
    if (this.visible) this._render();
  }

  // ── Render ────────────────────────────────────────────────────────────────

  private _render(): void {
    const store = useEconomyStore.getState();
    const cargoUsed = store.getCargoUsed();

    this.el.innerHTML = `
      <div class="mt-header">
        <span class="mt-title">⬡ MARKET TERMINAL</span>
        <span class="mt-credits">${fmt(store.credits)} ISK</span>
        <span class="mt-cargo">${cargoUsed.toFixed(0)} / ${store.maxCargoUnits} m³</span>
        <button class="mt-close" onclick="document.getElementById('market-terminal').__close()">✕</button>
      </div>
      <div class="mt-tabs">
        ${TABS.map(t => `<button class="mt-tab${this.activeTab === t.id ? ' active' : ''}" data-tab="${t.id}">${t.label}</button>`).join('')}
      </div>
      <div class="mt-body">
        ${this.activeTab === 'market'    ? this._renderMarket()    : ''}
        ${this.activeTab === 'inventory' ? this._renderInventory() : ''}
        ${this.activeTab === 'industry'  ? this._renderIndustry()  : ''}
        ${this.activeTab === 'contracts' ? this._renderContracts() : ''}
      </div>
    `;

    // Attach events
    (this.el as unknown as Record<string, unknown>)['__close'] = () => this.hide();

    for (const btn of this.el.querySelectorAll('.mt-tab')) {
      btn.addEventListener('click', () => {
        this.activeTab = (btn as HTMLElement).dataset['tab'] as Tab;
        this._render();
      });
    }
    this._attachMarketEvents();
    this._attachInventoryEvents();
    this._attachIndustryEvents();
    this._attachContractEvents();
  }

  // ── Market tab ────────────────────────────────────────────────────────────

  private _renderMarket(): string {
    const categories = ['ore', 'material', 'good', 'ship_hull', 'blueprint'] as const;
    const itemsByCategory = categories.map(cat => ({
      cat,
      items: (Object.values(ITEM_DEFS) as ReturnType<typeof Object.values>)
        .filter((d: typeof ITEM_DEFS[ItemType]) => d.category === cat),
    }));

    const ob     = marketEngine.getOrderBook(this.stationId, this.selectedItem);
    const hist   = marketEngine.getPriceHistory(this.stationId, this.selectedItem);
    const selDef = ITEM_DEFS[this.selectedItem];
    const bestB  = marketEngine.getBestBuy(this.stationId, this.selectedItem);
    const bestS  = marketEngine.getBestSell(this.stationId, this.selectedItem);

    const itemList = itemsByCategory.map(({ cat, items }) => `
      <div class="mt-cat-label">${cat.replace('_', ' ').toUpperCase()}</div>
      ${items.map((d: typeof ITEM_DEFS[ItemType]) => `
        <div class="mt-item-row${this.selectedItem === d.id ? ' selected' : ''}" data-item="${d.id}">
          <span class="mt-item-name">${d.name}</span>
          <span class="mt-item-price">${fmt(marketEngine.getLastPrice(this.stationId, d.id as ItemType))} ISK</span>
        </div>
      `).join('')}
    `).join('');

    const buyRows  = ob.buys.slice(0, 8).map(o =>
      `<tr><td>${fmt(o.price)}</td><td>${fmt(o.qtyRemaining)}</td><td class="mt-buy">${o.isNPC ? 'NPC' : 'Player'}</td></tr>`
    ).join('');
    const sellRows = ob.sells.slice(0, 8).map(o =>
      `<tr><td>${fmt(o.price)}</td><td>${fmt(o.qtyRemaining)}</td><td class="mt-sell">${o.isNPC ? 'NPC' : 'Player'}</td></tr>`
    ).join('');

    return `
      <div class="mt-market-layout">
        <div class="mt-item-list">${itemList}</div>
        <div class="mt-market-right">
          <div class="mt-section-title">${selDef?.name ?? ''}</div>
          <div class="mt-chart">${renderSparkline(hist, 260, 52)}</div>
          <div class="mt-spread">
            <span class="mt-buy">Best Buy: ${bestB !== null ? fmt(bestB) + ' ISK' : '—'}</span>
            <span class="mt-sell">Best Sell: ${bestS !== null ? fmt(bestS) + ' ISK' : '—'}</span>
          </div>
          <div class="mt-books">
            <div class="mt-book">
              <div class="mt-book-header mt-buy">Buy Orders</div>
              <table class="mt-order-table"><thead><tr><th>Price</th><th>Qty</th><th>Who</th></tr></thead>
                <tbody>${buyRows || '<tr><td colspan="3">No orders</td></tr>'}</tbody>
              </table>
            </div>
            <div class="mt-book">
              <div class="mt-book-header mt-sell">Sell Orders</div>
              <table class="mt-order-table"><thead><tr><th>Price</th><th>Qty</th><th>Who</th></tr></thead>
                <tbody>${sellRows || '<tr><td colspan="3">No orders</td></tr>'}</tbody>
              </table>
            </div>
          </div>
          <div class="mt-order-form" id="mt-order-form">
            <div class="mt-form-row">
              <select id="mt-order-side"><option value="buy">Buy</option><option value="sell">Sell</option></select>
              <input id="mt-order-qty" type="number" min="1" value="100" placeholder="Qty">
              <input id="mt-order-price" type="number" min="1" value="${bestS ?? selDef?.basePrice ?? 100}" placeholder="Price">
              <button id="mt-place-order">Place Order</button>
            </div>
            <div id="mt-order-fee" class="mt-fee-info"></div>
          </div>
        </div>
      </div>
    `;
  }

  private _attachMarketEvents(): void {
    for (const row of this.el.querySelectorAll('.mt-item-row')) {
      row.addEventListener('click', () => {
        this.selectedItem = (row as HTMLElement).dataset['item'] as ItemType;
        this._render();
      });
    }

    const placeBtn = this.el.querySelector('#mt-place-order');
    const sideEl   = this.el.querySelector('#mt-order-side') as HTMLSelectElement | null;
    const qtyEl    = this.el.querySelector('#mt-order-qty')  as HTMLInputElement  | null;
    const priceEl  = this.el.querySelector('#mt-order-price')as HTMLInputElement  | null;
    const feeEl    = this.el.querySelector('#mt-order-fee');

    const updateFee = () => {
      if (!sideEl || !qtyEl || !priceEl || !feeEl) return;
      const side  = sideEl.value as 'buy' | 'sell';
      const qty   = parseInt(qtyEl.value) || 0;
      const price = parseInt(priceEl.value) || 0;
      const gross = qty * price;
      feeEl.textContent = side === 'buy'
        ? `Broker fee: ${fmt(Math.round(gross * 0.01))} ISK  Total cost: ${fmt(gross + Math.round(gross * 0.01))} ISK`
        : `Sales tax (on fill): ${fmt(Math.round(gross * 0.02))} ISK`;
    };

    sideEl?.addEventListener('change', updateFee);
    qtyEl?.addEventListener('input', updateFee);
    priceEl?.addEventListener('input', updateFee);
    updateFee();

    placeBtn?.addEventListener('click', () => {
      if (!sideEl || !qtyEl || !priceEl) return;
      const side  = sideEl.value as 'buy' | 'sell';
      const qty   = parseInt(qtyEl.value);
      const price = parseInt(priceEl.value);
      if (!qty || !price || qty <= 0 || price <= 0) return;

      const store = useEconomyStore.getState();

      if (side === 'buy') {
        const gross     = qty * price;
        const brokerFee = Math.round(gross * 0.01);
        if (!store.deductCredits(gross + brokerFee, `Buy order: ${ITEM_DEFS[this.selectedItem]?.name} ×${qty}`)) {
          this._flash('Insufficient ISK');
          return;
        }
      } else {
        if (!store.removeCargo(this.selectedItem, qty)) {
          this._flash('Insufficient cargo');
          return;
        }
      }

      const { order, fills } = marketEngine.placeOrder({
        type: side, item: this.selectedItem, price, qty,
        ownerId: 'player', stationId: this.stationId, isNPC: false,
      });

      // Process fills
      for (const fill of fills) {
        if (side === 'buy') {
          store.addCargo(this.selectedItem, fill.qty);
        } else {
          const net = fill.qty * fill.price - fill.sellerTax;
          store.addCredits(net, `Sell fill: ${ITEM_DEFS[this.selectedItem]?.name} ×${fill.qty}`);
        }
      }

      if (fills.length === 0) store.addOrder(order);
      this._render();
    });
  }

  // ── Inventory tab ─────────────────────────────────────────────────────────

  private _renderInventory(): string {
    const store  = useEconomyStore.getState();
    const cargo  = store.cargo;
    const entries = Object.entries(cargo) as Array<[ItemType, number]>;

    const rows = entries.length === 0
      ? '<div class="mt-empty">Cargo hold is empty</div>'
      : entries.map(([item, qty]) => {
          const def  = ITEM_DEFS[item];
          const vol  = (def?.volume ?? 1) * qty;
          const val  = (marketEngine.getLastPrice(this.stationId, item) * qty);
          const canR = !!REFINE_RECIPES[item as keyof typeof REFINE_RECIPES];
          return `
            <div class="mt-inv-row">
              <span class="mt-inv-name">${def?.name ?? item}</span>
              <span class="mt-inv-qty">${fmt(qty)}</span>
              <span class="mt-inv-vol">${vol.toFixed(0)} m³</span>
              <span class="mt-inv-val">${fmt(val)} ISK</span>
              ${canR ? `<button class="mt-refine-btn" data-item="${item}">Refine</button>` : ''}
              <button class="mt-sell-btn" data-item="${item}" data-qty="${qty}">Sell</button>
            </div>`;
        }).join('');

    const blueprintRows = store.blueprints.length === 0 ? '' : `
      <div class="mt-section-title mt-bp-title">Blueprints</div>
      ${store.blueprints.map(bp => `
        <div class="mt-inv-row">
          <span class="mt-inv-name">${ITEM_DEFS[bp.type]?.name ?? bp.type}</span>
          <span class="mt-inv-qty">${bp.runsLeft === -1 ? 'BPO' : `${bp.runsLeft} runs`}</span>
          <span class="mt-inv-vol">ME:${(bp.matEff * 100).toFixed(0)}% TE:${(bp.timeEff * 100).toFixed(0)}%</span>
          <button class="mt-manufacture-btn" data-inst="${bp.instId}">Manufacture</button>
        </div>`).join('')}
    `;

    return `
      <div class="mt-inventory">
        <div class="mt-section-title">Cargo Hold — ${store.getCargoUsed().toFixed(0)} / ${store.maxCargoUnits} m³</div>
        <div class="mt-inv-list">${rows}</div>
        ${blueprintRows}
      </div>`;
  }

  private _attachInventoryEvents(): void {
    for (const btn of this.el.querySelectorAll('.mt-refine-btn')) {
      btn.addEventListener('click', () => {
        const item = (btn as HTMLElement).dataset['item'] as ItemType;
        const qty  = useEconomyStore.getState().cargo[item] ?? 0;
        const id   = RefinerySystem.startRefine(this.stationId, item as never, qty);
        if (!id) this._flash('Cannot refine — check cargo');
        else this._render();
      });
    }

    for (const btn of this.el.querySelectorAll('.mt-sell-btn')) {
      btn.addEventListener('click', () => {
        const item = (btn as HTMLElement).dataset['item'] as ItemType;
        const qty  = parseInt((btn as HTMLElement).dataset['qty'] ?? '0');
        const bestBuy = marketEngine.getBestBuy(this.stationId, item);
        if (!bestBuy) { this._flash('No buy orders'); return; }
        const { fills } = marketEngine.placeOrder({
          type: 'sell', item, price: bestBuy, qty,
          ownerId: 'player', stationId: this.stationId, isNPC: false,
        });
        const store = useEconomyStore.getState();
        store.removeCargo(item, qty);
        for (const fill of fills) {
          store.addCredits(fill.qty * fill.price - fill.sellerTax, `Quick sell: ${ITEM_DEFS[item]?.name}`);
        }
        this._render();
      });
    }

    for (const btn of this.el.querySelectorAll('.mt-manufacture-btn')) {
      btn.addEventListener('click', () => {
        const instId = (btn as HTMLElement).dataset['inst'] ?? '';
        const { ok, missing } = RefinerySystem.canManufacture(instId, 1);
        if (!ok) { this._flash(`Missing: ${missing[0] ?? 'materials'}`); return; }
        const jobId = RefinerySystem.startManufacture(this.stationId, instId, 1);
        if (!jobId) this._flash('Manufacturing failed');
        else this._render();
      });
    }
  }

  // ── Industry tab ──────────────────────────────────────────────────────────

  private _renderIndustry(): string {
    const store  = useEconomyStore.getState();
    const nowMs  = Date.now();

    const jobRows = store.jobs.map(j => {
      const elapsed  = nowMs - j.startedAt;
      const pct      = Math.min(100, (elapsed / j.durationMs) * 100);
      const remain   = Math.max(0, j.durationMs - elapsed);
      const inLabel  = Object.entries(j.input).map(([k, v]) => `${ITEM_DEFS[k as ItemType]?.name ?? k} ×${v}`).join(', ');
      const outLabel = Object.entries(j.output).map(([k, v]) => `${ITEM_DEFS[k as ItemType]?.name ?? k} ×${v}`).join(', ');
      return `
        <div class="mt-job-row">
          <div class="mt-job-header">
            <span class="mt-job-type">${j.type.toUpperCase()}</span>
            <span class="mt-job-io">${inLabel} → ${outLabel}</span>
            <span class="mt-job-time">${RefinerySystem.formatDuration(remain)}</span>
          </div>
          <div class="mt-progress-bar"><div class="mt-progress-fill" style="width:${pct.toFixed(1)}%"></div></div>
        </div>`;
    }).join('');

    const recipeRows = Object.values(REFINE_RECIPES).map(r => {
      const have = useEconomyStore.getState().cargo[r.inputOre] ?? 0;
      const batches = Math.floor((have as number) / r.inputQty);
      return `
        <div class="mt-recipe-row">
          <span>${ITEM_DEFS[r.inputOre].name} ×${r.inputQty} → ${ITEM_DEFS[r.outputMat].name} ×${r.outputQty}</span>
          <span>(${r.efficiency * 100}% yield, ${r.timeSeconds}s/batch)</span>
          <span>Have: ${have} → ${batches} batches</span>
          <button class="mt-refine-recipe-btn" data-ore="${r.inputOre}" data-qty="${batches * r.inputQty}">Refine All</button>
        </div>`;
    }).join('');

    const bpRows = Object.values(MANUFACTURE_BLUEPRINTS).map(def => {
      const inputs = Object.entries(def.inputs).map(([m, q]) =>
        `${ITEM_DEFS[m as ItemType]?.name ?? m} ×${q}`).join(', ');
      return `
        <div class="mt-recipe-row">
          <span>${ITEM_DEFS[def.outputItem]?.name ?? def.outputItem}</span>
          <span>${inputs}</span>
          <span>${def.timePerRun}s/run</span>
        </div>`;
    }).join('');

    return `
      <div class="mt-industry">
        <div class="mt-section-title">Active Jobs (${store.jobs.length})</div>
        <div class="mt-job-list">${jobRows || '<div class="mt-empty">No active jobs</div>'}</div>
        <div class="mt-section-title">Refinery</div>
        <div class="mt-recipe-list">${recipeRows}</div>
        <div class="mt-section-title">Blueprint Reference</div>
        <div class="mt-recipe-list">${bpRows}</div>
      </div>`;
  }

  private _attachIndustryEvents(): void {
    for (const btn of this.el.querySelectorAll('.mt-refine-recipe-btn')) {
      btn.addEventListener('click', () => {
        const ore = (btn as HTMLElement).dataset['ore'] as ItemType;
        const qty = parseInt((btn as HTMLElement).dataset['qty'] ?? '0');
        if (!qty) return;
        const id = RefinerySystem.startRefine(this.stationId, ore as never, qty);
        if (!id) this._flash('Cannot start refining');
        else this._render();
      });
    }
  }

  // ── Contracts tab ─────────────────────────────────────────────────────────

  private _renderContracts(): string {
    const available = this.hauling.getAvailable(this.stationId);
    const active    = this.hauling.getAll().filter(c => c.status === 'accepted' || c.status === 'in_transit');
    const riskBar   = (r: number) => `<span class="mt-risk-bar" style="--r:${(r * 100).toFixed(0)}%">${(r * 100).toFixed(0)}%</span>`;

    const availRows = available.slice(0, 20).map(c => `
      <div class="mt-contract-row">
        <div class="mt-ctr-route">${c.fromSystemName} → ${c.toSystemName}</div>
        <div class="mt-ctr-details">
          ${ITEM_DEFS[c.cargoType]?.name ?? c.cargoType} ×${fmt(c.cargoQty)}
          | Reward: ${fmt(c.reward)} ISK | Collateral: ${fmt(c.collateral)} ISK
          | Risk: ${riskBar(c.riskLevel)}
        </div>
        <button class="mt-accept-btn" data-cid="${c.id}">Accept</button>
      </div>`).join('');

    const activeRows = active.map(c => `
      <div class="mt-contract-row active">
        <div class="mt-ctr-route">${c.fromSystemName} → ${c.toSystemName} [${c.status.toUpperCase()}]</div>
        <div class="mt-ctr-details">
          ${ITEM_DEFS[c.cargoType]?.name ?? c.cargoType} ×${fmt(c.cargoQty)}
          | Reward: ${fmt(c.reward)} ISK | Risk: ${riskBar(c.riskLevel)}
        </div>
        <button class="mt-deliver-btn" data-cid="${c.id}">Deliver</button>
      </div>`).join('');

    return `
      <div class="mt-contracts">
        <div class="mt-section-title">Available Contracts (${available.length})</div>
        <div class="mt-ctr-list">${availRows || '<div class="mt-empty">No contracts at this station</div>'}</div>
        <div class="mt-section-title">Active (${active.length})</div>
        <div class="mt-ctr-list">${activeRows || '<div class="mt-empty">No active contracts</div>'}</div>
      </div>`;
  }

  private _attachContractEvents(): void {
    for (const btn of this.el.querySelectorAll('.mt-accept-btn')) {
      btn.addEventListener('click', () => {
        const cid = (btn as HTMLElement).dataset['cid'] ?? '';
        const result = this.hauling.accept(cid, 'player');
        if (!result) this._flash('Cannot accept — check cargo space or credits');
        else this._render();
      });
    }

    for (const btn of this.el.querySelectorAll('.mt-deliver-btn')) {
      btn.addEventListener('click', () => {
        const cid = (btn as HTMLElement).dataset['cid'] ?? '';
        const ok  = this.hauling.deliver(cid, 'player');
        if (!ok) this._flash('Cannot deliver here — wrong station');
        else this._render();
      });
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private _flash(msg: string): void {
    let el = this.el.querySelector('#mt-flash') as HTMLElement | null;
    if (!el) {
      el = document.createElement('div');
      el.id = 'mt-flash';
      this.el.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = '1';
    setTimeout(() => { if (el) el.style.opacity = '0'; }, 2500);
  }

  private _onKey(e: KeyboardEvent): void {
    if (e.key === 'e' || e.key === 'E') this.toggle();
    if (e.key === 'Escape' && this.visible) this.hide();
  }

  destroy(): void {
    window.removeEventListener('keydown', this._onKey.bind(this));
    for (const u of this.unsubs) u();
    this.el.remove();
  }

  // ── CSS ───────────────────────────────────────────────────────────────────

  private _injectStyles(): void {
    if (document.getElementById('market-terminal-styles')) return;
    const s = document.createElement('style');
    s.id    = 'market-terminal-styles';
    s.textContent = `
      #market-terminal {
        display: none; flex-direction: column;
        position: fixed; inset: 0; margin: auto;
        width: 820px; max-height: 90vh;
        background: rgba(4,10,20,0.97); border: 1px solid #223344;
        border-radius: 6px; font-family: monospace; font-size: 11px; color: #aabbcc;
        z-index: 300; overflow: hidden;
        box-shadow: 0 0 40px rgba(0,100,200,0.2);
      }
      .mt-header { display:flex; align-items:center; gap:12px; padding:8px 14px; background:rgba(0,40,80,0.6); border-bottom:1px solid #223344; }
      .mt-title  { font-size:13px; color:#00ccff; letter-spacing:2px; flex:1; }
      .mt-credits{ color:#ffdd44; }
      .mt-cargo  { color:#aabbcc; }
      .mt-close  { background:none; border:none; color:#ff4444; cursor:pointer; font-size:14px; padding:0 4px; }
      .mt-tabs   { display:flex; border-bottom:1px solid #223344; }
      .mt-tab    { flex:1; padding:6px; background:none; border:none; border-bottom:2px solid transparent; color:#667788; cursor:pointer; font-family:monospace; font-size:11px; }
      .mt-tab.active { color:#00ccff; border-bottom-color:#00ccff; }
      .mt-tab:hover  { color:#aabbcc; }
      .mt-body { flex:1; overflow-y:auto; padding:10px; }

      /* Market */
      .mt-market-layout { display:grid; grid-template-columns:200px 1fr; gap:10px; }
      .mt-item-list { overflow-y:auto; max-height:calc(90vh - 120px); border:1px solid #1a2a3a; border-radius:4px; }
      .mt-cat-label { padding:4px 8px; background:#0a1520; color:#445566; font-size:10px; letter-spacing:1px; }
      .mt-item-row  { display:flex; justify-content:space-between; padding:4px 8px; cursor:pointer; }
      .mt-item-row:hover   { background:#0a1f2f; }
      .mt-item-row.selected{ background:#0a2a40; color:#00ccff; }
      .mt-item-price{ color:#ffdd44; }
      .mt-market-right { display:flex; flex-direction:column; gap:8px; }
      .mt-section-title { color:#00ccff; font-size:12px; border-bottom:1px solid #1a2a3a; padding-bottom:3px; margin-bottom:6px; }
      .mt-chart { background:#030d18; border:1px solid #1a2a3a; padding:6px; border-radius:3px; }
      .mt-spread { display:flex; gap:20px; }
      .mt-buy   { color:#00ff88; }
      .mt-sell  { color:#ff4444; }
      .mt-books { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
      .mt-book-header { padding:3px 0; font-size:10px; margin-bottom:4px; }
      .mt-order-table { width:100%; border-collapse:collapse; font-size:10px; }
      .mt-order-table th { color:#445566; text-align:left; padding:2px 4px; }
      .mt-order-table td { padding:2px 4px; border-top:1px solid #0d1a26; }
      .mt-order-form  { display:flex; flex-direction:column; gap:4px; padding-top:8px; border-top:1px solid #1a2a3a; }
      .mt-form-row    { display:flex; gap:6px; align-items:center; }
      .mt-form-row select, .mt-form-row input { background:#050d18; border:1px solid #223344; color:#aabbcc; padding:4px 6px; font-family:monospace; font-size:11px; flex:1; }
      .mt-form-row button { background:#00416a; border:1px solid #0066aa; color:#aaccff; padding:4px 10px; cursor:pointer; font-family:monospace; font-size:11px; white-space:nowrap; }
      .mt-form-row button:hover { background:#00557a; }
      .mt-fee-info { color:#667788; font-size:10px; }

      /* Inventory */
      .mt-inv-list { display:flex; flex-direction:column; gap:2px; }
      .mt-inv-row  { display:flex; gap:10px; align-items:center; padding:4px 8px; background:#030d18; border:1px solid #0d1a26; border-radius:3px; }
      .mt-inv-name { flex:2; color:#cce8ff; }
      .mt-inv-qty, .mt-inv-vol, .mt-inv-val { flex:1; color:#aabbcc; }
      .mt-bp-title { margin-top:12px; }
      .mt-refine-btn, .mt-sell-btn, .mt-manufacture-btn {
        background:#1a2a1a; border:1px solid #2a4a2a; color:#88ff88; padding:2px 8px; cursor:pointer; font-family:monospace; font-size:10px;
      }
      .mt-sell-btn { background:#2a1a1a; border-color:#4a2a2a; color:#ff8888; }

      /* Industry */
      .mt-job-list, .mt-recipe-list { display:flex; flex-direction:column; gap:4px; margin-bottom:10px; }
      .mt-job-row  { background:#030d18; border:1px solid #0d1a26; padding:6px 8px; border-radius:3px; }
      .mt-job-header { display:flex; gap:10px; margin-bottom:4px; }
      .mt-job-type   { color:#ffaa00; font-size:10px; }
      .mt-job-io     { flex:1; color:#aabbcc; }
      .mt-job-time   { color:#88ccff; }
      .mt-progress-bar { height:4px; background:#0d1a26; border-radius:2px; }
      .mt-progress-fill{ height:100%; background:linear-gradient(90deg,#006688,#00aaff); border-radius:2px; transition:width 1s linear; }
      .mt-recipe-row { display:flex; gap:12px; align-items:center; padding:4px 8px; background:#030d18; border:1px solid #0d1a26; border-radius:3px; font-size:10px; }
      .mt-recipe-row span:first-child { color:#cce8ff; flex:1; }
      .mt-refine-recipe-btn { background:#1a2a1a; border:1px solid #2a4a2a; color:#88ff88; padding:2px 8px; cursor:pointer; font-family:monospace; font-size:10px; }

      /* Contracts */
      .mt-ctr-list { display:flex; flex-direction:column; gap:4px; margin-bottom:10px; }
      .mt-contract-row { padding:6px 10px; background:#030d18; border:1px solid #0d1a26; border-radius:3px; }
      .mt-contract-row.active { border-color:#224422; }
      .mt-ctr-route   { color:#00ccff; margin-bottom:2px; }
      .mt-ctr-details { color:#aabbcc; font-size:10px; margin-bottom:4px; }
      .mt-accept-btn, .mt-deliver-btn {
        background:#1a2a1a; border:1px solid #2a4a2a; color:#88ff88; padding:2px 10px; cursor:pointer; font-family:monospace; font-size:10px;
      }
      .mt-deliver-btn { background:#1a1a2a; border-color:#2a2a4a; color:#8888ff; }
      .mt-risk-bar { color:#ffaa00; }

      /* Misc */
      .mt-empty  { color:#445566; padding:12px 8px; text-align:center; }
      #mt-flash  { position:absolute; bottom:20px; left:50%; transform:translateX(-50%); background:rgba(20,0,0,0.95); border:1px solid #ff4444; color:#ff8888; padding:6px 18px; border-radius:4px; pointer-events:none; transition:opacity 0.4s; z-index:400; }
    `;
    document.head.appendChild(s);
  }
}

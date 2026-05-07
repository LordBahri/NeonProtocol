import { WindowBase } from './WindowBase.ts';
import { useEconomyStore } from '../economy/InventoryStore.ts';
import { ITEM_DEFS } from '../economy/EconomyTypes.ts';
import type { ItemType } from '../economy/EconomyTypes.ts';
import { marketEngine } from '../economy/MarketEngine.ts';

const CATEGORY_ICON: Record<string, string> = {
  ore:       '◆',
  material:  '⬡',
  good:      '▣',
  ship_hull: '◈',
  blueprint: '⊟',
};

const CATEGORY_COLOR: Record<string, string> = {
  ore:       '#88ccff',
  material:  '#ffcc44',
  good:      '#44ffcc',
  ship_hull: '#ff8844',
  blueprint: '#cc88ff',
};

function fmtISK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return n.toFixed(0);
}

const STATION_ID = 'default_station';

export class InventoryPanel extends WindowBase {
  private _tab: 'cargo' | 'blueprints' = 'cargo';

  constructor(onFocus: (id: string) => void) {
    super({
      id:          'inventory',
      title:       'CARGO HOLD & ASSETS',
      width:       440,
      height:      520,
      x:           60,
      y:           80,
      shortcutKey: 'KeyI',
      onFocus,
    });
  }

  protected build(): void {
    // Tabs
    const tabs = document.createElement('div');
    tabs.className = 'holo-tabs';
    tabs.innerHTML = `
      <div class="holo-tab active" data-tab="cargo">CARGO HOLD</div>
      <div class="holo-tab"       data-tab="blueprints">BLUEPRINTS</div>
    `;
    this.el.insertBefore(tabs, this.contentEl);

    tabs.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).dataset.tab as 'cargo' | 'blueprints' | undefined;
      if (!t) return;
      this._tab = t;
      tabs.querySelectorAll('.holo-tab').forEach(el => el.classList.remove('active'));
      (e.target as HTMLElement).classList.add('active');
      this._render();
    });

    this.contentEl.style.height = 'calc(100% - 32px - 30px)';
    this._render();
  }

  protected onShow(): void { this._render(); }

  update(_dt: number): void { this._render(); }

  private _render(): void {
    if (this._tab === 'cargo') this._renderCargo();
    else this._renderBlueprints();
  }

  // ── Cargo tab ────────────────────────────────────────────────────────────

  private _renderCargo(): void {
    const store   = useEconomyStore.getState();
    const cargo   = store.cargo;
    const used    = store.getCargoUsed();
    const maxCap  = store.maxCargoUnits;
    const usedPct = Math.min(100, (used / maxCap) * 100);

    const barColor = usedPct < 70 ? '#00ff88' : usedPct < 90 ? '#ffaa00' : '#ff2244';
    const entries  = Object.entries(cargo) as Array<[ItemType, number]>;

    this.contentEl.innerHTML = `
      <!-- Capacity bar -->
      <div style="padding:10px 12px 6px;border-bottom:1px solid rgba(0,140,180,0.12);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
          <span class="holo-label">CARGO CAPACITY</span>
          <span style="color:${barColor};font-size:10px;">${used.toFixed(0)} / ${maxCap} m³</span>
        </div>
        <div class="holo-bar-track">
          <div class="holo-bar-fill" style="width:${usedPct}%;background:${barColor};box-shadow:0 0 5px ${barColor};"></div>
        </div>
      </div>

      <!-- Item list -->
      <div class="holo-scrollable" style="height:calc(100% - 90px);">
        ${entries.length === 0
          ? `<div style="padding:30px;text-align:center;color:rgba(0,150,180,0.35);font-size:10px;letter-spacing:2px;">CARGO HOLD EMPTY</div>`
          : entries.map(([item, qty]) => this._cargoRow(item, qty)).join('')}
      </div>

      <!-- Actions bar -->
      <div style="padding:6px 10px;border-top:1px solid rgba(0,140,180,0.12);display:flex;gap:6px;align-items:center;">
        <button class="holo-action-btn" id="inv-sell-all">SELL ALL (BEST BID)</button>
        <span style="flex:1;"></span>
        <span class="holo-label">TOTAL VALUE: </span>
        <span style="color:#aaff44;font-size:10px;">${fmtISK(this._cargoValue(entries))} ISK</span>
      </div>
    `;

    this.contentEl.querySelector('#inv-sell-all')?.addEventListener('click', () => this._sellAll(entries));

    this.contentEl.querySelectorAll('[data-sell]').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = (btn as HTMLElement).dataset.sell as ItemType;
        this._quickSell(item);
      });
    });
  }

  private _cargoRow(item: ItemType, qty: number): string {
    const def   = ITEM_DEFS[item];
    const icon  = CATEGORY_ICON[def.category] ?? '◇';
    const color = CATEGORY_COLOR[def.category] ?? '#00eeff';
    const vol   = (def.volume * qty).toFixed(0);
    const val   = fmtISK(def.basePrice * qty);
    return `
      <div class="holo-item-row">
        <div class="holo-item-icon" style="color:${color};border-color:${color}33;">${icon}</div>
        <div style="flex:1;">
          <div style="color:#00ccee;font-size:10px;">${def.name}</div>
          <div class="holo-label">${def.category.toUpperCase()}</div>
        </div>
        <div style="text-align:right;margin-right:8px;">
          <div style="color:#00eeff;font-size:11px;">${qty.toLocaleString()}</div>
          <div class="holo-label">${vol} m³</div>
        </div>
        <div style="text-align:right;margin-right:4px;">
          <div style="color:#aaff44;font-size:10px;">${val}</div>
          <button class="holo-action-btn" data-sell="${item}" style="font-size:8px;padding:2px 6px;margin-top:2px;">SELL</button>
        </div>
      </div>`;
  }

  private _cargoValue(entries: Array<[ItemType, number]>): number {
    return entries.reduce((sum, [item, qty]) => sum + (ITEM_DEFS[item]?.basePrice ?? 0) * qty, 0);
  }

  private _quickSell(item: ItemType): void {
    const store = useEconomyStore.getState();
    const qty   = store.cargo[item] ?? 0;
    if (qty <= 0) return;
    const bestBid = marketEngine.getBestBuy(STATION_ID, item);
    if (!bestBid) { alert('No buy orders found'); return; }
    const gross   = bestBid * qty;
    const tax     = Math.round(gross * 0.02);
    const net     = gross - tax;
    store.removeCargo(item, qty);
    store.addCredits(net, `Sold ${qty}× ${ITEM_DEFS[item].name}`);
    this._render();
  }

  private _sellAll(entries: Array<[ItemType, number]>): void {
    for (const [item] of entries) this._quickSell(item);
  }

  // ── Blueprints tab ────────────────────────────────────────────────────────

  private _renderBlueprints(): void {
    const blueprints = useEconomyStore.getState().blueprints;

    this.contentEl.innerHTML = `
      <div class="holo-scrollable" style="height:100%;padding:8px 0;">
        ${blueprints.length === 0
          ? `<div style="padding:30px;text-align:center;color:rgba(0,150,180,0.35);font-size:10px;letter-spacing:2px;">NO BLUEPRINTS</div>`
          : blueprints.map(bp => {
              const def = ITEM_DEFS[bp.type as ItemType];
              const runs = bp.runsLeft === -1 ? '∞ BPO' : `${bp.runsLeft} runs`;
              return `
                <div class="holo-item-row">
                  <div class="holo-item-icon" style="color:#cc88ff;border-color:#cc88ff33;">⊟</div>
                  <div style="flex:1;">
                    <div style="color:#cc88ff;font-size:10px;">${def?.name ?? bp.type}</div>
                    <div class="holo-label">ME:${bp.matEff} TE:${bp.timeEff} — ${runs}</div>
                  </div>
                </div>`;
            }).join('')}
      </div>
    `;
  }
}

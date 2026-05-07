import { WindowBase } from './WindowBase.ts';
import { useGameStore } from '../../store/gameStore.ts';
import { engine } from '../../Engine.ts';
import { WeaponSlotComponent } from '../ships/ShipSystemComponents.ts';
import { ShipStatsComponent } from '../ships/ShipComponents.ts';
import { WEAPON_DEFS } from '../combat/WeaponDefinitions.ts';

const SLOT_LABELS: Record<string, string> = {
  beam_laser:    'Beam Laser',
  pulse_laser:   'Pulse Laser',
  autocannon:    'Autocannon',
  missile:       'Missile Rack',
  emp_bomb:      'EMP Bomb',
  combat_drone:  'Drone Bay',
};

const SLOT_ICONS: Record<string, string> = {
  beam_laser:    '⌇',
  pulse_laser:   '⋮',
  autocannon:    '◈',
  missile:       '▷',
  emp_bomb:      '◉',
  combat_drone:  '⊕',
};

// Stats that vary by ship class
const CLASS_STATS: Record<string, { highSlots: number; midSlots: number; lowSlots: number; droneBay: number }> = {
  fighter:   { highSlots: 2, midSlots: 2, lowSlots: 2, droneBay: 0 },
  frigate:   { highSlots: 3, midSlots: 3, lowSlots: 3, droneBay: 1 },
  destroyer: { highSlots: 5, midSlots: 3, lowSlots: 4, droneBay: 2 },
  cruiser:   { highSlots: 6, midSlots: 4, lowSlots: 5, droneBay: 3 },
};

export class FittingWindow extends WindowBase {
  constructor(onFocus: (id: string) => void) {
    super({
      id:          'fitting',
      title:       'SHIP FITTING',
      width:       500,
      height:      540,
      x:           120,
      y:           60,
      shortcutKey: 'KeyF',
      onFocus,
    });
  }

  protected build(): void { this._render(); }
  protected onShow(): void { this._render(); }
  update(_dt: number): void {}

  private _render(): void {
    const entity = useGameStore.getState().localPlayerEntity;
    const stats  = engine.world.getComponent(entity, ShipStatsComponent);
    const slots  = engine.world.getComponent(entity, WeaponSlotComponent);
    const cls    = stats?.class ?? 'fighter';
    const layout = CLASS_STATS[cls] ?? CLASS_STATS.fighter!;
    const fitted = slots?.slots ?? [];

    this.contentEl.innerHTML = `
      <div style="display:flex;height:100%;gap:0;">

        <!-- Ship silhouette + slot layout (left/center) -->
        <div style="flex:1;padding:14px;border-right:1px solid rgba(0,140,180,0.12);">

          <!-- Ship outline SVG -->
          <div style="display:flex;justify-content:center;margin-bottom:12px;">
            ${this._shipSVG(cls)}
          </div>

          <!-- Slot section labels -->
          <div style="margin-bottom:8px;">
            <div class="holo-label" style="margin-bottom:5px;color:rgba(255,70,90,0.6);">HIGH POWER — TURRETS / LAUNCHERS</div>
            <div style="display:flex;flex-wrap:wrap;gap:5px;">
              ${this._highSlots(layout.highSlots, fitted)}
            </div>
          </div>
          <div style="margin-bottom:8px;">
            <div class="holo-label" style="margin-bottom:5px;color:rgba(0,130,255,0.6);">MED POWER — SHIELDS / ELECTRONICS</div>
            <div style="display:flex;flex-wrap:wrap;gap:5px;">
              ${this._midSlots(layout.midSlots)}
            </div>
          </div>
          <div>
            <div class="holo-label" style="margin-bottom:5px;color:rgba(255,160,0,0.6);">LOW POWER — ARMOR / ENGINES</div>
            <div style="display:flex;flex-wrap:wrap;gap:5px;">
              ${this._lowSlots(layout.lowSlots)}
            </div>
          </div>
          ${layout.droneBay > 0 ? `
          <div style="margin-top:8px;">
            <div class="holo-label" style="margin-bottom:5px;color:rgba(160,220,100,0.6);">DRONE BAY</div>
            <div style="display:flex;gap:5px;">
              ${Array.from({ length: layout.droneBay }, () =>
                `<div class="holo-slot" style="border-color:rgba(160,220,100,0.25);">D<br>R</div>`
              ).join('')}
            </div>
          </div>` : ''}
        </div>

        <!-- Stats panel (right) -->
        <div style="width:160px;padding:12px 10px;display:flex;flex-direction:column;gap:8px;">
          <div style="font-size:9px;letter-spacing:3px;color:rgba(0,180,220,0.5);margin-bottom:4px;">STATISTICS</div>

          ${this._statRow('CLASS',       cls.toUpperCase(), '#00ccee')}
          ${this._statRow('HULL',        `${stats?.hull ?? 0} / ${stats?.maxHull ?? 0}`, '#00ff88')}
          ${this._statRow('SHIELD',      `${Math.round(stats?.shield ?? 0)} / ${stats?.maxShield ?? 0}`, '#0088ff')}
          ${this._statRow('SHIELD RCH',  `${stats?.shieldRechargeRate ?? 0}/s`, '#0066cc')}
          ${this._statRow('HIGH SLOTS',  String(layout.highSlots), '#ff6677')}
          ${this._statRow('MED SLOTS',   String(layout.midSlots),  '#4488ff')}
          ${this._statRow('LOW SLOTS',   String(layout.lowSlots),  '#ffaa00')}

          <div class="holo-divider"></div>

          <!-- Fitted weapons summary -->
          <div class="holo-label" style="margin-bottom:4px;">FITTED WEAPONS</div>
          ${fitted.length === 0
            ? `<div style="color:rgba(0,140,180,0.3);font-size:9px;letter-spacing:1px;">NONE</div>`
            : fitted.map(s => s.equippedType
                ? `<div style="font-size:9px;color:#00ccee;margin-bottom:3px;">
                     ${SLOT_ICONS[s.equippedType] ?? '◇'}
                     ${SLOT_LABELS[s.equippedType] ?? s.equippedType}
                   </div>`
                : ''
              ).join('')}

          <div class="holo-divider" style="margin-top:auto;"></div>
          <div style="font-size:8px;color:rgba(0,120,150,0.4);letter-spacing:1px;text-align:center;">
            LIVE FITTING SIMULATION<br>COMING SOON
          </div>
        </div>
      </div>
    `;

    // Tooltip on fitted slot hover
    this.contentEl.querySelectorAll('.holo-slot.equipped').forEach(slot => {
      slot.addEventListener('mouseenter', (e) => {
        const type = (slot as HTMLElement).dataset.weapon;
        if (!type) return;
        const def = WEAPON_DEFS[type as keyof typeof WEAPON_DEFS];
        if (!def) return;
        (slot as HTMLElement).title =
          `DPS: ${(def.baseDamage * def.fireRate).toFixed(1)}/s  |  Range: ${def.range}m  |  Crit: ${Math.round(def.critChance * 100)}%`;
        void e;
      });
    });
  }

  // ── Slot builders ──────────────────────────────────────────────────────────

  private _highSlots(count: number, fitted: Array<{ hardpointIndex: number; equippedType: string }>): string {
    return Array.from({ length: count }, (_, i) => {
      const slot = fitted.find(s => s.hardpointIndex === i);
      if (slot?.equippedType) {
        const icon  = SLOT_ICONS[slot.equippedType] ?? '◈';
        const label = SLOT_LABELS[slot.equippedType] ?? slot.equippedType;
        return `<div class="holo-slot high-slot equipped" data-weapon="${slot.equippedType}" title="${label}">
          <span style="font-size:16px;">${icon}</span>
          <span style="position:absolute;bottom:2px;font-size:7px;text-align:center;line-height:1;">${label.split(' ')[0]}</span>
        </div>`;
      }
      return `<div class="holo-slot high-slot">[${i + 1}]</div>`;
    }).join('');
  }

  private _midSlots(count: number): string {
    return Array.from({ length: count }, (_, i) =>
      `<div class="holo-slot mid-slot">[M${i + 1}]</div>`,
    ).join('');
  }

  private _lowSlots(count: number): string {
    return Array.from({ length: count }, (_, i) =>
      `<div class="holo-slot low-slot">[L${i + 1}]</div>`,
    ).join('');
  }

  private _statRow(label: string, value: string, color: string): string {
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span class="holo-label">${label}</span>
        <span style="color:${color};font-size:10px;">${value}</span>
      </div>`;
  }

  private _shipSVG(cls: string): string {
    const shapes: Record<string, string> = {
      fighter: `<svg width="80" height="90" viewBox="0 0 80 90">
        <path d="M40,8 L52,40 L60,78 L40,68 L20,78 L28,40 Z" fill="none" stroke="rgba(0,200,255,0.35)" stroke-width="1.5"/>
        <path d="M40,20 L46,42 L40,50 L34,42 Z" fill="rgba(0,60,90,0.4)" stroke="rgba(0,200,255,0.2)" stroke-width="1"/>
        <circle cx="40" cy="30" r="3" fill="none" stroke="rgba(0,220,255,0.4)" stroke-width="1"/>
      </svg>`,
      frigate: `<svg width="90" height="100" viewBox="0 0 90 100">
        <path d="M45,6 L62,35 L70,82 L45,72 L20,82 L28,35 Z" fill="none" stroke="rgba(0,200,255,0.35)" stroke-width="1.5"/>
        <path d="M30,50 L20,60 L20,75 L30,65 Z" fill="none" stroke="rgba(0,180,220,0.2)" stroke-width="1"/>
        <path d="M60,50 L70,60 L70,75 L60,65 Z" fill="none" stroke="rgba(0,180,220,0.2)" stroke-width="1"/>
        <circle cx="45" cy="28" r="4" fill="none" stroke="rgba(0,220,255,0.4)" stroke-width="1"/>
      </svg>`,
      destroyer: `<svg width="100" height="110" viewBox="0 0 100 110">
        <path d="M50,5 L68,30 L80,88 L50,78 L20,88 L32,30 Z" fill="none" stroke="rgba(0,200,255,0.35)" stroke-width="1.5"/>
        <path d="M24,48 L10,58 L10,80 L24,68 Z" fill="none" stroke="rgba(0,180,220,0.2)" stroke-width="1"/>
        <path d="M76,48 L90,58 L90,80 L76,68 Z" fill="none" stroke="rgba(0,180,220,0.2)" stroke-width="1"/>
        <rect x="38" y="22" width="24" height="14" fill="none" stroke="rgba(0,200,255,0.25)" stroke-width="1"/>
      </svg>`,
      cruiser: `<svg width="110" height="120" viewBox="0 0 110 120">
        <path d="M55,5 L76,32 L92,96 L55,84 L18,96 L34,32 Z" fill="none" stroke="rgba(0,200,255,0.35)" stroke-width="1.5"/>
        <path d="M20,52 L4,64 L4,88 L20,74 Z" fill="none" stroke="rgba(0,180,220,0.2)" stroke-width="1"/>
        <path d="M90,52 L106,64 L106,88 L90,74 Z" fill="none" stroke="rgba(0,180,220,0.2)" stroke-width="1"/>
        <ellipse cx="55" cy="30" rx="12" ry="8" fill="none" stroke="rgba(0,220,255,0.3)" stroke-width="1"/>
      </svg>`,
    };
    return shapes[cls] ?? shapes.fighter!;
  }
}

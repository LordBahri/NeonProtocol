// ─── Weapon type system ──────────────────────────────────────────────────────

export type WeaponType =
  | 'beam_laser'
  | 'pulse_laser'
  | 'autocannon'
  | 'missile'
  | 'emp_bomb'
  | 'combat_drone';

export interface WeaponDef {
  /** Stable identifier matching the record key */
  readonly id: string;
  readonly type: WeaponType;

  // ── Damage ────────────────────────────────────────────────────────────────
  /** Base damage per hit (or per tick for beams). */
  readonly baseDamage: number;
  /** 0-1 fraction of damage that bypasses shields directly. */
  readonly shieldPen: number;
  /** 0-1 fraction of damage that bypasses armor reduction. */
  readonly armorPen: number;
  readonly critChance: number;
  readonly critMultiplier: number;
  /** Probability per hit that a random module is disabled. */
  readonly moduleDisableChance: number;

  // ── Firing ────────────────────────────────────────────────────────────────
  /** Shots (or activations) per second. */
  readonly fireRate: number;
  /** Number of shots before forced reload. Infinity = unlimited. */
  readonly clipSize: number;
  /** Reload duration in seconds. */
  readonly reloadTime: number;
  /** Maximum effective range in pixels. */
  readonly range: number;

  // ── Projectile / travel ───────────────────────────────────────────────────
  /** Pixels per second (0 for beams). */
  readonly projectileSpeed: number;
  /** Visual length of the projectile sprite in pixels. */
  readonly projectileLength: number;
  /** Tracking / angular speed in rad/s (0 = unguided). */
  readonly trackingSpeed: number;

  // ── Beam-specific ─────────────────────────────────────────────────────────
  /** Seconds the beam fires before entering reload (beam weapons only). */
  readonly beamDuration: number;
  /** Render width of the beam in pixels. */
  readonly beamWidth: number;

  // ── AoE / EMP ─────────────────────────────────────────────────────────────
  /** Pixels radius of EMP blast (0 = no AoE). */
  readonly empRadius: number;
  /** Seconds modules remain disabled after an EMP hit. */
  readonly empDuration: number;

  // ── Drone-specific ────────────────────────────────────────────────────────
  readonly droneCount: number;
  /** Pixels per second that launched drones travel. */
  readonly droneSpeed: number;
  /** Damage per drone hit. */
  readonly droneDamage: number;
  /** Drone auto-fire rate in shots/s. */
  readonly droneFireRate: number;

  // ── Visuals ───────────────────────────────────────────────────────────────
  /** 0xRRGGBB tint for projectile / beam / effect. */
  readonly color: number;
}

// ─── Internal builder ────────────────────────────────────────────────────────

const DEFAULTS: Omit<WeaponDef, 'id' | 'type' | 'baseDamage' | 'color' | 'range'> = {
  shieldPen: 0,
  armorPen: 0,
  critChance: 0.05,
  critMultiplier: 2,
  moduleDisableChance: 0,
  fireRate: 1,
  clipSize: Infinity,
  reloadTime: 0,
  projectileSpeed: 0,
  projectileLength: 8,
  trackingSpeed: 0,
  beamDuration: 0,
  beamWidth: 0,
  empRadius: 0,
  empDuration: 0,
  droneCount: 0,
  droneSpeed: 0,
  droneDamage: 0,
  droneFireRate: 0,
};

function W(overrides: Partial<WeaponDef> & Pick<WeaponDef, 'id' | 'type' | 'baseDamage' | 'color' | 'range'>): WeaponDef {
  return { ...DEFAULTS, ...overrides } as WeaponDef;
}

// ─── Weapon catalogue ─────────────────────────────────────────────────────────

export const WEAPON_DEFS: Record<string, WeaponDef> = {
  /**
   * Beam Laser
   * Continuous damage ray. Damage expressed per tick at 60 fps (≈ 18 dmg / frame).
   * Fires for 2.5 s then reloads for 3 s.
   */
  beam_laser: W({
    id: 'beam_laser',
    type: 'beam_laser',
    baseDamage: 18,           // per tick @ 60 fps
    fireRate: 60,             // ticks per second while active
    clipSize: Infinity,
    reloadTime: 3,
    range: 520,
    shieldPen: 0.15,
    armorPen: 0.05,
    critChance: 0.08,
    critMultiplier: 2.0,
    moduleDisableChance: 0.04,
    beamDuration: 2.5,        // seconds the beam stays on per activation
    beamWidth: 3,
    color: 0x00ccff,
  }),

  /**
   * Pulse Laser
   * Rapid burst fire; good against shields.
   */
  pulse_laser: W({
    id: 'pulse_laser',
    type: 'pulse_laser',
    baseDamage: 10,
    fireRate: 5,
    clipSize: 12,
    reloadTime: 1.8,
    range: 400,
    shieldPen: 0.10,
    armorPen: 0,
    critChance: 0.07,
    critMultiplier: 1.8,
    projectileSpeed: 960,
    projectileLength: 16,
    color: 0x00eeff,
  }),

  /**
   * Autocannon
   * High DPS slug thrower; chews through armor but weak on shields.
   */
  autocannon: W({
    id: 'autocannon',
    type: 'autocannon',
    baseDamage: 24,
    fireRate: 7,
    clipSize: 20,
    reloadTime: 2.5,
    range: 320,
    shieldPen: 0,
    armorPen: 0.28,
    critChance: 0.06,
    critMultiplier: 2.2,
    moduleDisableChance: 0.06,
    projectileSpeed: 1100,
    projectileLength: 8,
    color: 0xffcc44,
  }),

  /**
   * Missile
   * Slow, guided, high-burst weapon. Good at both layers.
   */
  missile: W({
    id: 'missile',
    type: 'missile',
    baseDamage: 110,
    fireRate: 0.5,
    clipSize: 4,
    reloadTime: 6,
    range: 750,
    shieldPen: 0.20,
    armorPen: 0.30,
    critChance: 0.10,
    critMultiplier: 2.5,
    moduleDisableChance: 0.14,
    trackingSpeed: 2.2,       // rad/s
    projectileSpeed: 340,
    projectileLength: 14,
    empRadius: 0,
    color: 0xff6600,
  }),

  /**
   * EMP Bomb
   * Low direct damage but disables all modules on target; large AoE.
   */
  emp_bomb: W({
    id: 'emp_bomb',
    type: 'emp_bomb',
    baseDamage: 40,
    fireRate: 0.22,
    clipSize: 2,
    reloadTime: 9,
    range: 480,
    shieldPen: 0.50,
    armorPen: 0,
    moduleDisableChance: 1.0,
    empRadius: 150,
    empDuration: 5,           // seconds
    trackingSpeed: 0.8,
    projectileSpeed: 260,
    projectileLength: 12,
    color: 0xaa44ff,
  }),

  /**
   * Combat Drone
   * Deploys up to 3 autonomous fighter drones that pursue and attack enemies
   * independently. clipSize Infinity — limited only by carrier capacity.
   */
  combat_drone: W({
    id: 'combat_drone',
    type: 'combat_drone',
    baseDamage: 0,            // drones deal droneDamage, not baseDamage directly
    fireRate: 1,              // launch cadence (activations/s if bay is empty)
    clipSize: Infinity,
    range: 600,
    droneCount: 3,
    droneSpeed: 240,          // px/s
    droneDamage: 14,
    droneFireRate: 2,         // shots/s per drone
    trackingSpeed: 3.0,
    color: 0x44ff88,
  }),
};

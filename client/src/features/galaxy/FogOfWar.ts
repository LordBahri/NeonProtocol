import { FOW_HIDDEN, FOW_REVEALED, FOW_EXPLORED } from './GalaxyTypes.ts';
import { GALAXY_COLS, GALAXY_ROWS, GALAXY_CELL, GALAXY_W, GALAXY_H } from './GalaxyGenerator.ts';
import type { GalaxyData, StarSystem } from './GalaxyTypes.ts';

export { FOW_HIDDEN, FOW_REVEALED, FOW_EXPLORED };

// ── Fog of war map ────────────────────────────────────────────────────────────
// Each cell: 0 = hidden, 1 = revealed (last-known), 2 = explored (full info)
// Stored as Uint8Array of GALAXY_COLS × GALAXY_ROWS cells.

export class FogOfWar {
  private cells: Uint8Array;
  private readonly cols: number;
  private readonly rows: number;

  // Systems visited (hull present within EXPLORED radius)
  private visitedSystems = new Set<string>();

  // Callbacks fired when fog changes
  private onChangeCallbacks: Array<() => void> = [];

  constructor() {
    this.cols  = GALAXY_COLS;
    this.rows  = GALAXY_ROWS;
    this.cells = new Uint8Array(this.cols * this.rows);
  }

  // ── Coordinate helpers ────────────────────────────────────────────────────

  worldToCell(wx: number, wy: number): { col: number; row: number } {
    return {
      col: Math.floor(wx / GALAXY_CELL),
      row: Math.floor(wy / GALAXY_CELL),
    };
  }

  private idx(col: number, row: number): number {
    return row * this.cols + col;
  }

  private inBounds(col: number, row: number): boolean {
    return col >= 0 && row >= 0 && col < this.cols && row < this.rows;
  }

  // ── State accessors ───────────────────────────────────────────────────────

  getCell(col: number, row: number): number {
    if (!this.inBounds(col, row)) return FOW_HIDDEN;
    return this.cells[this.idx(col, row)]!;
  }

  isRevealed(col: number, row: number): boolean {
    return this.getCell(col, row) >= FOW_REVEALED;
  }

  isExplored(col: number, row: number): boolean {
    return this.getCell(col, row) >= FOW_EXPLORED;
  }

  isSystemVisible(sys: StarSystem): boolean {
    const { col, row } = this.worldToCell(sys.x, sys.y);
    return this.isRevealed(col, row);
  }

  isSystemExplored(sys: StarSystem): boolean {
    const { col, row } = this.worldToCell(sys.x, sys.y);
    return this.isExplored(col, row);
  }

  hasVisited(systemId: string): boolean {
    return this.visitedSystems.has(systemId);
  }

  get exploredCount(): number {
    return this.cells.reduce((s, v) => s + (v >= FOW_EXPLORED ? 1 : 0), 0);
  }

  get revealedCount(): number {
    return this.cells.reduce((s, v) => s + (v >= FOW_REVEALED ? 1 : 0), 0);
  }

  get totalCells(): number {
    return this.cols * this.rows;
  }

  // ── Reveal / explore ──────────────────────────────────────────────────────

  /**
   * Reveal cells in a disc around (col, row) — shows system info but "last known".
   * Used for passive sensor pings.
   */
  reveal(col: number, row: number, radiusCells: number): void {
    const r2 = radiusCells * radiusCells;
    let changed = false;
    for (let dr = -radiusCells; dr <= radiusCells; dr++) {
      for (let dc = -radiusCells; dc <= radiusCells; dc++) {
        if (dc * dc + dr * dr > r2) continue;
        const c = col + dc, r = row + dr;
        if (!this.inBounds(c, r)) continue;
        const i = this.idx(c, r);
        if (this.cells[i]! < FOW_REVEALED) {
          this.cells[i] = FOW_REVEALED;
          changed = true;
        }
      }
    }
    if (changed) this._fireChange();
  }

  /**
   * Explore cells in a smaller disc — full real-time info shown.
   * Used when player is physically present.
   */
  explore(col: number, row: number, radiusCells: number): void {
    const r2 = radiusCells * radiusCells;
    let changed = false;
    for (let dr = -radiusCells; dr <= radiusCells; dr++) {
      for (let dc = -radiusCells; dc <= radiusCells; dc++) {
        if (dc * dc + dr * dr > r2) continue;
        const c = col + dc, r = row + dr;
        if (!this.inBounds(c, r)) continue;
        const i = this.idx(c, r);
        if (this.cells[i]! < FOW_EXPLORED) {
          this.cells[i] = FOW_EXPLORED;
          changed = true;
        }
      }
    }
    if (changed) this._fireChange();
  }

  /** Mark a system as visited. */
  visitSystem(sys: StarSystem): void {
    if (!this.visitedSystems.has(sys.id)) {
      this.visitedSystems.add(sys.id);
      this._fireChange();
    }
  }

  // ── Serialisation (for persistence) ──────────────────────────────────────

  toJSON(): { cells: number[]; visited: string[] } {
    return {
      cells:   Array.from(this.cells),
      visited: [...this.visitedSystems],
    };
  }

  fromJSON(data: { cells: number[]; visited: string[] }): void {
    for (let i = 0; i < data.cells.length && i < this.cells.length; i++) {
      this.cells[i] = data.cells[i] ?? 0;
    }
    this.visitedSystems = new Set(data.visited);
    this._fireChange();
  }

  // ── Change callbacks ──────────────────────────────────────────────────────

  onChange(cb: () => void): () => void {
    this.onChangeCallbacks.push(cb);
    return () => {
      const i = this.onChangeCallbacks.indexOf(cb);
      if (i !== -1) this.onChangeCallbacks.splice(i, 1);
    };
  }

  private _fireChange(): void {
    for (const cb of this.onChangeCallbacks) cb();
  }
}

// ── Scanning system ───────────────────────────────────────────────────────────
// Updates FogOfWar based on player world position and sensor range.

export interface ScannerOptions {
  scanRadiusCells:    number;  // passive reveal radius
  exploreRadiusCells: number;  // explore radius when player is present
  galaxy:             GalaxyData;
  fog:                FogOfWar;
}

export class ScanningSystem {
  private opts: ScannerOptions;
  private lastCol = -9999;
  private lastRow = -9999;
  private scanTimer = 0;
  private readonly SCAN_INTERVAL = 0.5; // seconds between scans

  constructor(opts: ScannerOptions) {
    this.opts = opts;
  }

  /** Call each frame with player world position (galaxy-space). */
  update(dt: number, playerX: number, playerY: number): void {
    this.scanTimer += dt;
    if (this.scanTimer < this.SCAN_INTERVAL) return;
    this.scanTimer = 0;

    // Convert player game-world position to galaxy-space
    // (assuming player origin maps to galaxy center)
    const gx  = playerX + GALAXY_W * 0.5;
    const gy  = playerY + GALAXY_H * 0.5;
    const col = Math.floor(gx / GALAXY_CELL);
    const row = Math.floor(gy / GALAXY_CELL);

    if (col === this.lastCol && row === this.lastRow) return;
    this.lastCol = col;
    this.lastRow = row;

    const { fog, galaxy } = this.opts;

    fog.reveal(col, row, this.opts.scanRadiusCells);
    fog.explore(col, row, this.opts.exploreRadiusCells);

    // Mark nearby systems as visited
    for (const sys of galaxy.systems.values()) {
      const sc  = Math.floor(sys.x / GALAXY_CELL);
      const sr  = Math.floor(sys.y / GALAXY_CELL);
      const d   = Math.hypot(sc - col, sr - row);
      if (d <= this.opts.exploreRadiusCells) {
        fog.visitSystem(sys);
      }
    }
  }

  /** Boost scan on demand (player activates scan module). */
  activeScan(playerX: number, playerY: number, bonusRadius: number): void {
    const gx  = playerX + GALAXY_W * 0.5;
    const gy  = playerY + GALAXY_H * 0.5;
    const col = Math.floor(gx / GALAXY_CELL);
    const row = Math.floor(gy / GALAXY_CELL);
    this.opts.fog.reveal(col, row, this.opts.scanRadiusCells + bonusRadius);
  }
}

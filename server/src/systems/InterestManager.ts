import type { MapSchema } from '@colyseus/schema';
import type { ShipSchema } from '../schemas/ShipSchema';
import { GameConfig } from '../config/GameConfig';

type SessionId = string;
type CellKey = string;

function cellKey(col: number, row: number): CellKey {
  return `${col},${row}`;
}

function shipCell(ship: ShipSchema): { col: number; row: number } {
  const { cellSize } = GameConfig.interest;
  return {
    col: Math.floor(ship.x / cellSize),
    row: Math.floor(ship.y / cellSize),
  };
}

export class InterestManager {
  private cells = new Map<CellKey, Set<SessionId>>();
  private sessionCells = new Map<SessionId, CellKey>();

  update(ships: MapSchema<ShipSchema>): void {
    this.cells.clear();
    this.sessionCells.clear();

    ships.forEach((ship) => {
      if (!ship.isAlive) return;
      const { col, row } = shipCell(ship);
      const key = cellKey(col, row);
      if (!this.cells.has(key)) this.cells.set(key, new Set());
      this.cells.get(key)!.add(ship.sessionId);
      this.sessionCells.set(ship.sessionId, key);
    });
  }

  getRelevantSessions(forSessionId: SessionId, ships: MapSchema<ShipSchema>): Set<SessionId> {
    const ship = ships.get(forSessionId);
    if (!ship) return new Set();

    const { col, row } = shipCell(ship);
    const { viewRadius } = GameConfig.interest;
    const relevant = new Set<SessionId>();

    for (let dr = -viewRadius; dr <= viewRadius; dr++) {
      for (let dc = -viewRadius; dc <= viewRadius; dc++) {
        const key = cellKey(col + dc, row + dr);
        const cell = this.cells.get(key);
        if (!cell) continue;
        for (const sessionId of cell) {
          relevant.add(sessionId);
        }
      }
    }

    return relevant;
  }

  getCellKey(sessionId: SessionId): CellKey | undefined {
    return this.sessionCells.get(sessionId);
  }
}

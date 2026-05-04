export interface SectorCell {
  col: number;
  row: number;
  worldX: number;
  worldY: number;
}

export class SectorGrid {
  readonly cellSize: number;
  readonly cols: number;
  readonly rows: number;

  constructor(cellSize: number, cols: number, rows: number) {
    this.cellSize = cellSize;
    this.cols = cols;
    this.rows = rows;
  }

  worldToCell(wx: number, wy: number): { col: number; row: number } {
    return {
      col: Math.floor(wx / this.cellSize),
      row: Math.floor(wy / this.cellSize),
    };
  }

  cellToWorld(col: number, row: number): { x: number; y: number } {
    return {
      x: col * this.cellSize + this.cellSize * 0.5,
      y: row * this.cellSize + this.cellSize * 0.5,
    };
  }

  cellKey(col: number, row: number): string {
    return `${col},${row}`;
  }

  parseCellKey(key: string): { col: number; row: number } {
    const [c, r] = key.split(',').map(Number);
    return { col: c!, row: r! };
  }

  getNeighbors(col: number, row: number, radius = 1): SectorCell[] {
    const cells: SectorCell[] = [];
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        const c = col + dc;
        const r = row + dr;
        if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) continue;
        const world = this.cellToWorld(c, r);
        cells.push({ col: c, row: r, worldX: world.x, worldY: world.y });
      }
    }
    return cells;
  }

  getVisibleCells(
    camX: number,
    camY: number,
    viewWidth: number,
    viewHeight: number,
    padding = 1,
  ): SectorCell[] {
    const left = camX - viewWidth * 0.5;
    const top = camY - viewHeight * 0.5;
    const right = camX + viewWidth * 0.5;
    const bottom = camY + viewHeight * 0.5;

    const minCol = Math.max(0, Math.floor(left / this.cellSize) - padding);
    const minRow = Math.max(0, Math.floor(top / this.cellSize) - padding);
    const maxCol = Math.min(this.cols - 1, Math.floor(right / this.cellSize) + padding);
    const maxRow = Math.min(this.rows - 1, Math.floor(bottom / this.cellSize) + padding);

    const cells: SectorCell[] = [];
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const world = this.cellToWorld(col, row);
        cells.push({ col, row, worldX: world.x, worldY: world.y });
      }
    }
    return cells;
  }

  distanceSq(ax: number, ay: number, bx: number, by: number): number {
    return (ax - bx) ** 2 + (ay - by) ** 2;
  }
}

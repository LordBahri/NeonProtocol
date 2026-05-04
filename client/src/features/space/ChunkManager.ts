import type { SectorGrid, SectorCell } from './SectorGrid.ts';

export interface Chunk {
  key: string;
  col: number;
  row: number;
  loaded: boolean;
  loading: boolean;
  data: unknown;
}

export interface ChunkManagerOptions {
  grid: SectorGrid;
  loadRadius: number;
  onChunkLoad: (chunk: Chunk) => Promise<void>;
  onChunkUnload: (chunk: Chunk) => void;
}

export class ChunkManager {
  private chunks = new Map<string, Chunk>();
  private grid: SectorGrid;
  private loadRadius: number;
  private onChunkLoad: (chunk: Chunk) => Promise<void>;
  private onChunkUnload: (chunk: Chunk) => void;

  private lastCamCol = -9999;
  private lastCamRow = -9999;

  constructor(opts: ChunkManagerOptions) {
    this.grid = opts.grid;
    this.loadRadius = opts.loadRadius;
    this.onChunkLoad = opts.onChunkLoad;
    this.onChunkUnload = opts.onChunkUnload;
  }

  update(camX: number, camY: number): void {
    const { col, row } = this.grid.worldToCell(camX, camY);

    if (col === this.lastCamCol && row === this.lastCamRow) return;
    this.lastCamCol = col;
    this.lastCamRow = row;

    const needed = new Set<string>();
    const neighbors = this.grid.getNeighbors(col, row, this.loadRadius);

    for (const cell of neighbors) {
      const key = this.grid.cellKey(cell.col, cell.row);
      needed.add(key);

      if (!this.chunks.has(key)) {
        const chunk: Chunk = {
          key,
          col: cell.col,
          row: cell.row,
          loaded: false,
          loading: true,
          data: null,
        };
        this.chunks.set(key, chunk);
        this.loadChunk(chunk);
      }
    }

    for (const [key, chunk] of this.chunks) {
      if (!needed.has(key)) {
        this.onChunkUnload(chunk);
        this.chunks.delete(key);
      }
    }
  }

  private async loadChunk(chunk: Chunk): Promise<void> {
    try {
      await this.onChunkLoad(chunk);
      chunk.loaded = true;
    } catch (err) {
      console.error(`[ChunkManager] Failed to load chunk ${chunk.key}:`, err);
    } finally {
      chunk.loading = false;
    }
  }

  getChunk(key: string): Chunk | undefined {
    return this.chunks.get(key);
  }

  getLoadedChunks(): Chunk[] {
    return [...this.chunks.values()].filter(c => c.loaded);
  }

  get chunkCount(): number { return this.chunks.size; }
}

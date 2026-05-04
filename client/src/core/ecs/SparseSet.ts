import { MAX_ENTITIES } from './types.ts';
import type { EntityId } from './types.ts';

/**
 * O(1) add, remove, and contains. Dense iteration with no gaps.
 * Backed by two Uint32 arrays to avoid GC pressure.
 */
export class SparseSet {
  private sparse: Int32Array;
  private dense: Uint32Array;
  private count = 0;

  constructor(capacity = MAX_ENTITIES) {
    this.sparse = new Int32Array(capacity).fill(-1);
    this.dense = new Uint32Array(capacity);
  }

  add(id: EntityId): void {
    if (this.has(id)) return;
    this.dense[this.count] = id;
    this.sparse[id] = this.count;
    this.count++;
  }

  remove(id: EntityId): void {
    if (!this.has(id)) return;
    const idx = this.sparse[id]!;
    const last = this.dense[this.count - 1]!;
    this.dense[idx] = last;
    this.sparse[last] = idx;
    this.sparse[id] = -1;
    this.count--;
  }

  has(id: EntityId): boolean {
    return this.sparse[id] !== -1;
  }

  get size(): number {
    return this.count;
  }

  get entities(): Uint32Array {
    return this.dense.subarray(0, this.count);
  }

  clear(): void {
    for (let i = 0; i < this.count; i++) {
      this.sparse[this.dense[i]!] = -1;
    }
    this.count = 0;
  }
}

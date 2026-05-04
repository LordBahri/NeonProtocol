export class ObjectPool<T> {
  private pool: T[] = [];
  private readonly factory: () => T;
  private readonly reset: (obj: T) => void;
  private readonly maxSize: number;
  private _active = 0;
  private _peak = 0;

  constructor(factory: () => T, reset: (obj: T) => void, prewarm = 0, maxSize = 4096) {
    this.factory = factory;
    this.reset = reset;
    this.maxSize = maxSize;

    for (let i = 0; i < prewarm; i++) {
      this.pool.push(factory());
    }
  }

  acquire(): T {
    const obj = this.pool.pop() ?? this.factory();
    this._active++;
    if (this._active > this._peak) this._peak = this._active;
    return obj;
  }

  release(obj: T): void {
    this._active--;
    this.reset(obj);
    if (this.pool.length < this.maxSize) {
      this.pool.push(obj);
    }
  }

  releaseAll(objects: T[]): void {
    for (const obj of objects) this.release(obj);
    objects.length = 0;
  }

  get activeCount(): number { return this._active; }
  get pooledCount(): number { return this.pool.length; }
  get peakCount(): number { return this._peak; }
}

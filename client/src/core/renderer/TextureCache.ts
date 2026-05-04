import { Assets, Texture, type UnresolvedAsset } from 'pixi.js';

export interface TextureManifestEntry {
  alias: string;
  src: string;
}

export class TextureCache {
  private cache = new Map<string, Texture>();
  private loading = new Map<string, Promise<Texture>>();

  async loadBundle(entries: TextureManifestEntry[]): Promise<void> {
    const assets: UnresolvedAsset[] = entries.map(e => ({ alias: e.alias, src: e.src }));
    await Assets.load(assets);
    for (const entry of entries) {
      const tex = Assets.get<Texture>(entry.alias);
      if (tex) this.cache.set(entry.alias, tex);
    }
  }

  async load(alias: string, src: string): Promise<Texture> {
    if (this.cache.has(alias)) return this.cache.get(alias)!;

    let promise = this.loading.get(alias);
    if (!promise) {
      promise = Assets.load<Texture>({ alias, src }).then(tex => {
        this.cache.set(alias, tex);
        this.loading.delete(alias);
        return tex;
      });
      this.loading.set(alias, promise);
    }
    return promise;
  }

  get(alias: string): Texture {
    const tex = this.cache.get(alias);
    if (!tex) throw new Error(`Texture "${alias}" not loaded`);
    return tex;
  }

  getOrFallback(alias: string): Texture {
    return this.cache.get(alias) ?? Texture.EMPTY;
  }

  has(alias: string): boolean {
    return this.cache.has(alias);
  }

  dispose(alias: string): void {
    const tex = this.cache.get(alias);
    if (tex) {
      tex.destroy(true);
      this.cache.delete(alias);
    }
  }
}

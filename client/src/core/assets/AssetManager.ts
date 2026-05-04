import { Assets, Texture } from 'pixi.js';
import type { AssetBundle, AssetEntry, AssetType } from './AssetBundle.ts';

export type ProgressCallback = (loaded: number, total: number, key: string) => void;

interface CachedAsset {
  key: string;
  type: AssetType;
  data: unknown;
}

export class AssetManager {
  private cache    = new Map<string, CachedAsset>();
  private loading  = new Map<string, Promise<CachedAsset>>();
  private baseUrl  = (import.meta.env['VITE_ASSET_BASE_URL'] as string | undefined) ?? '/assets';

  // ── Bundle loading ──────────────────────────────────────────────────────────

  async loadBundle(bundle: AssetBundle, onProgress?: ProgressCallback): Promise<void> {
    const { assets } = bundle;
    const total = assets.length;
    let loaded = 0;

    const promises = assets.map(async (entry) => {
      await this.loadEntry(entry);
      loaded++;
      onProgress?.(loaded, total, entry.key);
    });

    await Promise.all(promises);
  }

  async loadBundles(bundles: AssetBundle[], onProgress?: ProgressCallback): Promise<void> {
    const all: AssetEntry[] = bundles.flatMap(b => b.assets);
    const total = all.length;
    let loaded  = 0;

    await Promise.all(all.map(async (entry) => {
      await this.loadEntry(entry);
      loaded++;
      onProgress?.(loaded, total, entry.key);
    }));
  }

  // ── Individual load ─────────────────────────────────────────────────────────

  private async loadEntry(entry: AssetEntry): Promise<CachedAsset> {
    if (this.cache.has(entry.key)) return this.cache.get(entry.key)!;

    let pending = this.loading.get(entry.key);
    if (!pending) {
      pending = this.fetchAsset(entry).then(asset => {
        this.cache.set(entry.key, asset);
        this.loading.delete(entry.key);
        return asset;
      });
      this.loading.set(entry.key, pending);
    }
    return pending;
  }

  private async fetchAsset(entry: AssetEntry): Promise<CachedAsset> {
    const url = entry.src.startsWith('http') ? entry.src : `${this.baseUrl}/${entry.src}`;

    switch (entry.type) {
      case 'texture': {
        const tex = await Assets.load<Texture>({ alias: entry.key, src: url });
        return { key: entry.key, type: 'texture', data: tex };
      }
      case 'audio': {
        const res  = await fetch(url);
        const buf  = await res.arrayBuffer();
        return { key: entry.key, type: 'audio', data: buf };
      }
      case 'json': {
        const res  = await fetch(url);
        const data = await res.json();
        return { key: entry.key, type: 'json', data };
      }
      case 'font': {
        const font = new FontFace(entry.key, `url(${url})`);
        await font.load();
        document.fonts.add(font);
        return { key: entry.key, type: 'font', data: font };
      }
    }
  }

  // ── Retrieval ───────────────────────────────────────────────────────────────

  getTexture(key: string): Texture {
    const asset = this.cache.get(key);
    if (!asset || asset.type !== 'texture') throw new Error(`Texture "${key}" not loaded`);
    return asset.data as Texture;
  }

  getTextureOrEmpty(key: string): Texture {
    const asset = this.cache.get(key);
    return (asset?.type === 'texture' ? asset.data : Texture.EMPTY) as Texture;
  }

  getAudioBuffer(key: string): ArrayBuffer {
    const asset = this.cache.get(key);
    if (!asset || asset.type !== 'audio') throw new Error(`AudioBuffer "${key}" not loaded`);
    return asset.data as ArrayBuffer;
  }

  getJSON<T = unknown>(key: string): T {
    const asset = this.cache.get(key);
    if (!asset || asset.type !== 'json') throw new Error(`JSON "${key}" not loaded`);
    return asset.data as T;
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  has(key: string): boolean {
    return this.cache.has(key);
  }

  unload(key: string): void {
    const asset = this.cache.get(key);
    if (!asset) return;
    if (asset.type === 'texture') (asset.data as Texture).destroy(true);
    this.cache.delete(key);
  }

  unloadBundle(bundle: AssetBundle): void {
    for (const entry of bundle.assets) this.unload(entry.key);
  }

  destroy(): void {
    for (const key of this.cache.keys()) this.unload(key);
  }

  get loadedCount(): number { return this.cache.size; }
}

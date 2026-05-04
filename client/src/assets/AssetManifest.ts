import type { TextureManifestEntry } from '../core/renderer/TextureCache.ts';

export const SHIP_TEXTURES: TextureManifestEntry[] = [
  // Procedurally drawn in ShipRenderer — textures added when art is ready
];

export const FX_TEXTURES: TextureManifestEntry[] = [
  // Particle textures added when art is ready
];

export const UI_TEXTURES: TextureManifestEntry[] = [
  // UI sprite atlas added when art is ready
];

export const ALL_TEXTURES: TextureManifestEntry[] = [
  ...SHIP_TEXTURES,
  ...FX_TEXTURES,
  ...UI_TEXTURES,
];

export const ASSET_BASE = import.meta.env['VITE_ASSET_BASE_URL'] as string ?? '/assets';

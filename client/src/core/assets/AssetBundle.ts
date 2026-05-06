export type AssetType = 'texture' | 'audio' | 'json' | 'font';

export interface AssetEntry {
  key: string;
  src: string;
  type: AssetType;
}

export interface AssetBundle {
  name: string;
  assets: AssetEntry[];
}

/** Pre-declared bundles — import order matters for preload priority */
export const CoreBundle: AssetBundle = {
  name: 'core',
  assets: [
    // placeholder — filled as art/audio assets are added
  ],
};

export const SpaceBundle: AssetBundle = {
  name: 'space',
  assets: [],
};

export const UIBundle: AssetBundle = {
  name: 'ui',
  assets: [],
};

export const ShipBundle: AssetBundle = {
  name: 'ships',
  assets: [
    { key: 'cruiser_albedo',    src: 'ships/cruiser_albedo.png',    type: 'texture' },
    { key: 'cruiser_roughness', src: 'ships/cruiser_roughness.png', type: 'texture' },
  ],
};

export const AudioBundle: AssetBundle = {
  name: 'audio',
  assets: [],
};

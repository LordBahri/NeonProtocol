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
  assets: [],
};

export const AudioBundle: AssetBundle = {
  name: 'audio',
  assets: [],
};

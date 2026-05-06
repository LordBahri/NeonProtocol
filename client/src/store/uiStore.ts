import { createStore } from 'zustand/vanilla';
import type { EntityId } from '../core/ecs/types.ts';
import { INVALID_ENTITY } from '../core/ecs/types.ts';

interface UIState {
  fps: number;
  showMinimap: boolean;
  showHUD: boolean;
  showDebugOverlay: boolean;
  targetEntity: EntityId;
  cameraX: number;
  cameraY: number;
  cameraZoom: number;
  screenWidth: number;
  screenHeight: number;

  setFPS: (fps: number) => void;
  setTarget: (entity: EntityId) => void;
  setCamera: (x: number, y: number, zoom?: number) => void;
  setScreenSize: (w: number, h: number) => void;
  toggleDebugOverlay: () => void;
  toggleMinimap: () => void;
}

export const useUIStore = createStore<UIState>((set) => ({
  fps: 60,
  showMinimap: true,
  showHUD: true,
  showDebugOverlay: false,
  targetEntity: INVALID_ENTITY,
  cameraX: 0,
  cameraY: 0,
  cameraZoom: 1,
  screenWidth: window.innerWidth,
  screenHeight: window.innerHeight,

  setFPS: (fps) => set({ fps }),
  setTarget: (targetEntity) => set({ targetEntity }),
  setCamera: (cameraX, cameraY, cameraZoom) =>
    set((s) => ({ cameraX, cameraY, cameraZoom: cameraZoom ?? s.cameraZoom })),
  setScreenSize: (screenWidth, screenHeight) => set({ screenWidth, screenHeight }),
  toggleDebugOverlay: () => set((s) => ({ showDebugOverlay: !s.showDebugOverlay })),
  toggleMinimap: () => set((s) => ({ showMinimap: !s.showMinimap })),
}));

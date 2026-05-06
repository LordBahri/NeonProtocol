import { createStore } from 'zustand/vanilla';
import type { EntityId } from '../core/ecs/types.ts';
import { INVALID_ENTITY } from '../core/ecs/types.ts';

export type GamePhase = 'loading' | 'lobby' | 'playing' | 'dead' | 'respawning';

export interface ShipStats {
  hull: number;
  maxHull: number;
  shield: number;
  maxShield: number;
  speed: number;
}

interface GameState {
  phase: GamePhase;
  localPlayerEntity: EntityId;
  localPlayerId: string;
  sectorId: string;
  sectorName: string;
  shipStats: ShipStats;
  playerCount: number;
  tickRate: number;
  simulationTime: number;

  setPhase: (phase: GamePhase) => void;
  setLocalPlayer: (entityId: EntityId, playerId: string) => void;
  setSector: (id: string, name: string) => void;
  updateShipStats: (stats: Partial<ShipStats>) => void;
  setPlayerCount: (count: number) => void;
  tickSimulation: (dt: number) => void;
}

export const useGameStore = createStore<GameState>((set) => ({
  phase: 'loading',
  localPlayerEntity: INVALID_ENTITY,
  localPlayerId: '',
  sectorId: '',
  sectorName: 'Unknown Sector',
  shipStats: { hull: 100, maxHull: 100, shield: 100, maxShield: 100, speed: 0 },
  playerCount: 0,
  tickRate: 20,
  simulationTime: 0,

  setPhase: (phase) => set({ phase }),
  setLocalPlayer: (localPlayerEntity, localPlayerId) => set({ localPlayerEntity, localPlayerId }),
  setSector: (sectorId, sectorName) => set({ sectorId, sectorName }),
  updateShipStats: (stats) => set((s) => ({ shipStats: { ...s.shipStats, ...stats } })),
  setPlayerCount: (playerCount) => set({ playerCount }),
  tickSimulation: (dt) => set((s) => ({ simulationTime: s.simulationTime + dt })),
}));

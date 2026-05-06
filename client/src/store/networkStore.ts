import { createStore } from 'zustand/vanilla';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

interface NetworkState {
  status: ConnectionStatus;
  ping: number;
  roomId: string;
  sessionId: string;
  serverTickRate: number;
  lastPingTime: number;

  setStatus: (status: ConnectionStatus) => void;
  setPing: (ms: number) => void;
  setRoom: (roomId: string, sessionId: string) => void;
  setServerTickRate: (rate: number) => void;
  recordPingSent: () => void;
  recordPingReceived: () => void;
}

export const useNetworkStore = createStore<NetworkState>((set, get) => ({
  status: 'disconnected',
  ping: 0,
  roomId: '',
  sessionId: '',
  serverTickRate: 20,
  lastPingTime: 0,

  setStatus: (status) => set({ status }),
  setPing: (ping) => set({ ping }),
  setRoom: (roomId, sessionId) => set({ roomId, sessionId }),
  setServerTickRate: (serverTickRate) => set({ serverTickRate }),
  recordPingSent: () => set({ lastPingTime: performance.now() }),
  recordPingReceived: () => {
    const ping = Math.round(performance.now() - get().lastPingTime);
    set({ ping });
  },
}));

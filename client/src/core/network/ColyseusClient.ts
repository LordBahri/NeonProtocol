import { Client, type Room } from 'colyseus.js';
import { globalBus, NetworkEvent } from './MessageBus.ts';

export interface JoinOptions {
  playerId?: string;
  shipClass?: string;
  sectorId?: string;
}

export class ColyseusNetworkClient {
  private client: Client;
  private rooms = new Map<string, Room>();
  private reconnectAttempts = new Map<string, number>();
  private readonly maxReconnectAttempts = 5;
  private readonly reconnectBaseDelay = 1000;

  constructor(serverUrl: string) {
    this.client = new Client(serverUrl);
  }

  async joinRoom<S = unknown>(
    roomName: string,
    options: JoinOptions = {},
  ): Promise<Room<S>> {
    try {
      const room = await this.client.joinOrCreate<S>(roomName, options);
      this.rooms.set(roomName, room as Room);
      this.setupRoomListeners(room, roomName);
      globalBus.emit(NetworkEvent.ROOM_JOINED, { roomName, room });
      return room;
    } catch (err) {
      console.error(`[Network] Failed to join room "${roomName}":`, err);
      throw err;
    }
  }

  async leaveRoom(roomName: string, consented = true): Promise<void> {
    const room = this.rooms.get(roomName);
    if (!room) return;
    await room.leave(consented);
    this.rooms.delete(roomName);
    globalBus.emit(NetworkEvent.ROOM_LEFT, { roomName });
  }

  getRoom<S = unknown>(roomName: string): Room<S> | undefined {
    return this.rooms.get(roomName) as Room<S> | undefined;
  }

  sendToRoom<T>(roomName: string, type: string | number, data?: T): void {
    const room = this.rooms.get(roomName);
    if (!room) return;
    room.send(type, data);
  }

  private setupRoomListeners(room: Room, roomName: string): void {
    room.onLeave((code) => {
      this.rooms.delete(roomName);
      globalBus.emit(NetworkEvent.DISCONNECTED, { roomName, code });

      if (code !== 1000) {
        this.attemptReconnect(roomName, room);
      }
    });

    room.onError((code, message) => {
      console.error(`[Network] Room "${roomName}" error ${code}: ${message}`);
    });

    room.onStateChange((state) => {
      globalBus.emit(NetworkEvent.STATE_PATCH, { roomName, state });
    });
  }

  private async attemptReconnect(roomName: string, _previousRoom: Room): Promise<void> {
    const attempt = (this.reconnectAttempts.get(roomName) ?? 0) + 1;
    if (attempt > this.maxReconnectAttempts) {
      this.reconnectAttempts.delete(roomName);
      console.error(`[Network] Max reconnect attempts reached for "${roomName}"`);
      return;
    }
    this.reconnectAttempts.set(roomName, attempt);

    const delay = this.reconnectBaseDelay * Math.pow(2, attempt - 1);
    await new Promise(r => setTimeout(r, delay));

    try {
      const room = await this.client.joinOrCreate(roomName);
      this.rooms.set(roomName, room);
      this.setupRoomListeners(room, roomName);
      this.reconnectAttempts.delete(roomName);
      globalBus.emit(NetworkEvent.CONNECTED, { roomName });
    } catch {
      this.attemptReconnect(roomName, _previousRoom);
    }
  }

  destroy(): void {
    for (const room of this.rooms.values()) {
      room.leave(true);
    }
    this.rooms.clear();
  }
}

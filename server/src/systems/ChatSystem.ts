import type { Room, Client } from 'colyseus';
import type { MapSchema } from '@colyseus/schema';
import type { ShipSchema } from '../schemas/ShipSchema';
import type { InterestManager } from './InterestManager';

export interface ChatMessage {
  sessionId: string;
  username: string;
  message: string;
  channel: 'local' | 'corp' | 'system';
  timestamp: number;
}

const MAX_MESSAGE_LENGTH = 200;
const RING_BUFFER_SIZE   = 50;

/**
 * Routes chat messages to the correct audience:
 *   local — players in the sender's interest cell ± 1
 *   corp  — all online corp members in the sector
 *   system — broadcast, sent from server code only
 */
export class ChatSystem {
  private readonly recentMessages: ChatMessage[] = [];

  route(
    room: Room,
    client: Client,
    rawMessage: string,
    channel: 'local' | 'corp',
    ships: MapSchema<ShipSchema>,
    interest: InterestManager,
  ): void {
    const ship = ships.get(client.sessionId);
    if (!ship || !ship.isAlive) return;

    const message = rawMessage.slice(0, MAX_MESSAGE_LENGTH).trim();
    if (!message) return;

    const msg: ChatMessage = {
      sessionId: client.sessionId,
      username:  ship.username || 'Pilot',
      message,
      channel,
      timestamp: Date.now(),
    };

    this._store(msg);

    if (channel === 'local') {
      this._routeLocal(room, client, msg, ships, interest);
    } else if (channel === 'corp') {
      this._routeCorp(room, client, msg, ships);
    }
  }

  /** Broadcast a system announcement to all clients in the room. */
  system(room: Room, message: string): void {
    const msg: ChatMessage = {
      sessionId: 'system',
      username:  'SYSTEM',
      message,
      channel:   'system',
      timestamp: Date.now(),
    };
    this._store(msg);
    room.broadcast('chat', msg);
  }

  /** Send recent message history to a newly joined client. */
  sendHistory(client: Client): void {
    if (this.recentMessages.length > 0) {
      client.send('chat_history', this.recentMessages.slice(-RING_BUFFER_SIZE));
    }
  }

  private _routeLocal(
    room: Room,
    sender: Client,
    msg: ChatMessage,
    ships: MapSchema<ShipSchema>,
    interest: InterestManager,
  ): void {
    const relevant = interest.getRelevantSessions(sender.sessionId, ships);
    relevant.add(sender.sessionId); // always include sender

    for (const client of room.clients) {
      if (relevant.has(client.sessionId)) {
        client.send('chat', msg);
      }
    }
  }

  private _routeCorp(
    room: Room,
    sender: Client,
    msg: ChatMessage,
    ships: MapSchema<ShipSchema>,
  ): void {
    const senderShip = ships.get(sender.sessionId);
    if (!senderShip || !senderShip.corpId) {
      // Not in a corp — send error back
      sender.send('chat_error', { message: 'You are not in a corporation.' });
      return;
    }

    const corpId = senderShip.corpId;
    for (const client of room.clients) {
      const ship = ships.get(client.sessionId);
      if (ship && ship.corpId === corpId) {
        client.send('chat', msg);
      }
    }
  }

  private _store(msg: ChatMessage): void {
    this.recentMessages.push(msg);
    if (this.recentMessages.length > RING_BUFFER_SIZE) {
      this.recentMessages.shift();
    }
  }
}

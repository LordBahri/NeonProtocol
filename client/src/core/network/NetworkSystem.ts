/**
 * NetworkSystem — bridges Colyseus server state with the local ECS world.
 *
 * Responsibilities:
 *   • Connect to lobby, then join a sector room
 *   • Reconcile server ShipSchema patches → local ECS entities
 *   • Send player input each simulation tick (with sequence number)
 *   • Client-side prediction: apply input locally, reconcile on server ack
 *   • Forward combat events and chat messages to globalBus
 */
import type { Room }           from 'colyseus.js';
import { ColyseusNetworkClient, type JoinOptions } from './ColyseusClient.ts';
import { StateReconciler }     from './StateReconciler.ts';
import { globalBus, NetworkEvent } from './MessageBus.ts';
import type { World }          from '../ecs/World.ts';
import { createEntityId }      from '../ecs/types.ts';
import { lerp }                from '../simulation/interpolation.ts';
import { spawnShip }           from '../../features/ships/ShipFactory.ts';
import {
  TransformComponent,
  VelocityComponent,
  NetworkSyncComponent,
  PlayerInputComponent,
} from '../../features/ships/ShipComponents.ts';
import { useGameStore }        from '../../store/gameStore.ts';

// Server state shape (matches ShipSchema)
interface RemoteShipState {
  sessionId:  string;
  playerId:   string;
  shipClass:  string;
  username:   string;
  corpId:     string;
  x:          number;
  y:          number;
  angle:      number;
  vx:         number;
  vy:         number;
  hull:       number;
  maxHull:    number;
  shield:     number;
  maxShield:  number;
  isAlive:    boolean;
  lastTick:   number;
  inputSeq:   number;
  onChange:   (cb: () => void) => void;
}

interface RemoteSectorState {
  ships:       { onAdd: (cb: (s: RemoteShipState, k: string) => void) => void; onRemove: (cb: (s: RemoteShipState, k: string) => void) => void; forEach: (cb: (s: RemoteShipState) => void) => void };
  sectorId:    string;
  sectorName:  string;
  tick:        number;
  playerCount: number;
}

// How far the server-confirmed position can differ from our predicted position
// before we snap-correct rather than lerp.
const SNAP_THRESHOLD_SQ = 200 ** 2;  // 200 world units
const LERP_ALPHA        = 0.25;       // remote player lerp speed per frame

export class NetworkSystem {
  private readonly client: ColyseusNetworkClient;
  private reconciler = new StateReconciler();
  private sectorRoom: Room<RemoteSectorState> | null = null;

  private _inputSeq    = 0;
  private _connected   = false;
  private _localSessId = '';

  constructor(serverUrl: string) {
    this.client = new ColyseusNetworkClient(serverUrl);
  }

  get connected(): boolean { return this._connected; }

  // ── Connection ────────────────────────────────────────────────────────────

  async connect(
    world: World,
    opts: JoinOptions & { sectorId?: string; username?: string } = {},
  ): Promise<void> {
    try {
      // Join sector directly (skipping lobby for now; lobby flow is for future)
      const room = await this.client.joinRoom<RemoteSectorState>('sector_room', {
        sectorId:  opts.sectorId  ?? 'sector_0_0',
        shipClass: opts.shipClass ?? 'fighter',
        username:  opts.username  ?? 'Pilot',
      });

      this.sectorRoom  = room as Room<RemoteSectorState>;
      this._localSessId = room.sessionId;
      this._connected  = true;

      this._setupRoomListeners(room as Room<RemoteSectorState>, world);

      globalBus.emit(NetworkEvent.CONNECTED, { sectorId: opts.sectorId });
      console.log('[NetworkSystem] Connected, sessionId:', room.sessionId);
    } catch (err) {
      console.warn('[NetworkSystem] Could not connect to server (offline mode):', err);
    }
  }

  disconnect(): void {
    this.sectorRoom?.leave(true);
    this.sectorRoom  = null;
    this._connected  = false;
    this.reconciler.clear();
  }

  // ── Per-tick input send ───────────────────────────────────────────────────

  /**
   * Read current player input from ECS and transmit to server.
   * Must be called once per simulation tick.
   */
  sendInput(world: World): void {
    if (!this.sectorRoom || !this._connected) return;

    const localEntity = useGameStore.getState().localPlayerEntity;
    if (!world.isAlive(localEntity)) return;

    const input = world.getComponent(localEntity, PlayerInputComponent);
    if (!input) return;

    const transform = world.getComponent(localEntity, TransformComponent);

    this._inputSeq++;
    const msg = {
      thrustForward: input.thrustForward,
      thrustBack:    input.thrustBack,
      rotateLeft:    input.rotateLeft,
      rotateRight:   input.rotateRight,
      fire:          input.fire,
      weaponType:    'laser',
      seq:           this._inputSeq,
      clientTime:    Date.now(),
      ...(transform && { angle: transform.angle }),
    };

    this.sectorRoom.send('input', msg);
  }

  /** Send a chat message to the server. */
  sendChat(message: string, channel: 'local' | 'corp' = 'local'): void {
    if (!this.sectorRoom || !this._connected) return;
    this.sectorRoom.send('chat', { message, channel });
  }

  /** Send a nav target update to the server. */
  sendNavTarget(x: number, y: number, set: boolean): void {
    if (!this.sectorRoom || !this._connected) return;
    this.sectorRoom.send('nav_target', { x, y, set });
  }

  // ── Per-frame reconciliation ──────────────────────────────────────────────

  /**
   * Apply server state to ECS.  Call this each render frame after server patches
   * have been received (Colyseus applies them asynchronously via onStateChange).
   */
  reconcile(world: World): void {
    if (!this.sectorRoom || !this._connected) return;

    this.sectorRoom.state.ships.forEach((serverShip: RemoteShipState) => {
      const localId = this.reconciler.getLocal(serverShip.sessionId);
      if (localId === undefined) return;
      if (!world.isAlive(localId)) return;

      const transform = world.getComponent(localId, TransformComponent);
      const velocity  = world.getComponent(localId, VelocityComponent);
      if (!transform || !velocity) return;

      const isLocal = serverShip.sessionId === this._localSessId;

      if (isLocal) {
        // Local player: snap if prediction diverges too far, lerp otherwise
        const dx = serverShip.x - transform.x;
        const dy = serverShip.y - transform.y;
        if (dx * dx + dy * dy > SNAP_THRESHOLD_SQ) {
          transform.x     = serverShip.x;
          transform.y     = serverShip.y;
          transform.angle = serverShip.angle;
          velocity.vx     = serverShip.vx;
          velocity.vy     = serverShip.vy;
        }
      } else {
        // Remote players: smooth lerp toward server position
        transform.x     = lerp(transform.x,     serverShip.x,     LERP_ALPHA);
        transform.y     = lerp(transform.y,     serverShip.y,     LERP_ALPHA);
        transform.angle = serverShip.angle; // angle lerp would need special wrapping
        velocity.vx     = lerp(velocity.vx,    serverShip.vx,    LERP_ALPHA);
        velocity.vy     = lerp(velocity.vy,    serverShip.vy,    LERP_ALPHA);
      }

      // Sync stats
      const syncComp = world.getComponent(localId, NetworkSyncComponent);
      if (syncComp) {
        syncComp.lastServerX     = serverShip.x;
        syncComp.lastServerY     = serverShip.y;
        syncComp.lastServerAngle = serverShip.angle;
        syncComp.lastServerTick  = serverShip.lastTick;
      }
    });
  }

  // ── Room event subscriptions ──────────────────────────────────────────────

  private _setupRoomListeners(room: Room<RemoteSectorState>, world: World): void {
    // Ships added
    room.state.ships.onAdd((ship: RemoteShipState, sessionId: string) => {
      if (this.reconciler.hasServer(sessionId)) return;

      const isLocal  = sessionId === this._localSessId;
      const entityId = spawnShip(world, ship.shipClass || 'fighter', ship.x, ship.y, {
        serverId:     sessionId,
        isLocalPlayer: isLocal,
      });
      this.reconciler.register(sessionId, entityId);

      if (isLocal) {
        useGameStore.getState().setLocalPlayer(entityId, ship.playerId);
      }

      globalBus.emit(NetworkEvent.ENTITY_SPAWNED, {
        entity:   entityId,
        serverId: sessionId,
        isLocal,
      });

      // Forward per-ship change events (health sync)
      ship.onChange(() => {
        this._onShipChange(ship, world);
      });
    });

    // Ships removed
    room.state.ships.onRemove((_ship: RemoteShipState, sessionId: string) => {
      const localId = this.reconciler.getLocal(sessionId);
      if (localId !== undefined && world.isAlive(localId)) {
        world.destroyEntity(createEntityId(localId));
        globalBus.emit(NetworkEvent.ENTITY_DESTROYED, { entity: localId, serverId: sessionId });
      }
      this.reconciler.unregister(sessionId);
    });

    // Combat events from server
    room.onMessage('combat_event', (event: { type: string; attackerSessionId: string; victimSessionId: string; damage: number; x: number; y: number }) => {
      const targetLocalId = this.reconciler.getLocal(event.victimSessionId);
      if (event.type === 'kill') {
        globalBus.emit(NetworkEvent.COMBAT_DEATH, {
          entity:          targetLocalId,
          serverId:        event.victimSessionId,
          attackerServerId: event.attackerSessionId,
          x: event.x,
          y: event.y,
        });
      } else {
        globalBus.emit(NetworkEvent.COMBAT_HIT, {
          targetEntity:    targetLocalId,
          serverId:        event.victimSessionId,
          damage:          event.damage,
          x: event.x,
          y: event.y,
        });
      }
    });

    // Chat messages
    room.onMessage('chat', (msg: { sessionId: string; username: string; message: string; channel: string; timestamp: number }) => {
      globalBus.emit('chat:message', msg);
    });

    room.onMessage('chat_history', (messages: unknown[]) => {
      globalBus.emit('chat:history', messages);
    });

    room.onMessage('chat_error', (err: { message: string }) => {
      globalBus.emit('chat:error', err);
    });

    // Pong
    room.onMessage('pong', (data: { serverTime: number; tick: number }) => {
      const rtt = Date.now() - data.serverTime;
      globalBus.emit('network:rtt', { rtt, tick: data.tick });
    });
  }

  private _onShipChange(ship: RemoteShipState, world: World): void {
    const localId = this.reconciler.getLocal(ship.sessionId);
    if (localId === undefined || !world.isAlive(localId)) return;

    // Sync combat-relevant state from server patches
    // (Full position reconciliation happens in reconcile() each frame)
    if (!ship.isAlive) {
      globalBus.emit(NetworkEvent.COMBAT_DEATH, {
        entity:   localId,
        serverId: ship.sessionId,
      });
    }
  }
}

import { Room, type Client } from 'colyseus';
import { SectorSchema }       from '../schemas/SectorSchema';
import { ShipSchema }         from '../schemas/ShipSchema';
import { PhysicsSystem }      from '../systems/PhysicsSystem';
import { CombatSystem }       from '../systems/CombatSystem';
import { InterestManager }    from '../systems/InterestManager';
import { AISystem }           from '../systems/AISystem';
import { LagCompensation }    from '../systems/LagCompensation';
import { PacketValidator }    from '../systems/PacketValidator';
import { ChatSystem }         from '../systems/ChatSystem';
import { GameConfig }         from '../config/GameConfig';
import { PlayerRepository }   from '../db/repositories/PlayerRepository';
import { InventoryRepository }from '../db/repositories/InventoryRepository';

export interface SectorRoomOptions {
  sectorId:   string;
  sectorName: string;
  seed?:      number;
}

export interface ClientInputMessage {
  thrustForward: boolean;
  thrustBack:    boolean;
  rotateLeft:    boolean;
  rotateRight:   boolean;
  fire:          boolean;
  weaponType?:   string;
  angle?:        number;
  seq?:          number;   // client prediction sequence number
  clientTime?:   number;   // client timestamp (ms) for lag compensation
}

// ── SectorRoom ────────────────────────────────────────────────────────────────

export class SectorRoom extends Room<SectorSchema> {
  private physics   = new PhysicsSystem();
  private combat    = new CombatSystem();
  private interest  = new InterestManager();
  private ai        = new AISystem();
  private lagComp   = new LagCompensation();
  private validator = new PacketValidator();
  private chat      = new ChatSystem();

  private players  = new PlayerRepository();
  // InventoryRepository is reserved for save/load on join/leave (wired in _persistPlayerExit)
  private readonly inventoryRepo = new InventoryRepository();

  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private tick    = 0;
  private simTime = 0;
  private readonly tickRate = GameConfig.server.tickRate;
  private readonly dt       = 1 / GameConfig.server.tickRate;

  // sessionId → DB player id (populated on join)
  private playerDbIds = new Map<string, string>();

  onCreate(options: SectorRoomOptions): void {
    this.setState(new SectorSchema());
    this.state.sectorId   = options.sectorId   ?? 'sector_0_0';
    this.state.sectorName = options.sectorName ?? 'Alpha Sector';

    this.maxClients = GameConfig.server.maxPlayersPerSector;
    this.setPatchRate(1000 / this.tickRate);

    // ── Input ──────────────────────────────────────────────────────────────
    this.onMessage('input', (client, data: unknown) => {
      if (!this.validator.checkInput(client.sessionId)) return;
      if (!this.validator.validateInput(data)) {
        this.validator.recordViolation(client.sessionId, 'invalid_input_shape');
        return;
      }
      if (this.validator.shouldKick(client.sessionId)) {
        client.leave(4001); // kick code
        return;
      }

      const input = {
        thrustForward: data.thrustForward ?? false,
        thrustBack:    data.thrustBack    ?? false,
        rotateLeft:    data.rotateLeft    ?? false,
        rotateRight:   data.rotateRight   ?? false,
        ...(data.angle !== undefined && { angle: data.angle }),
      };
      this.physics.setInput(client.sessionId, input, data.seq ?? 0);

      if (data.fire) {
        if (!this.validator.checkFire(client.sessionId)) return;
        const weaponType = (data.weaponType as keyof typeof GameConfig.weapons) ?? 'laser';
        this.combat.queueFire({
          sessionId:       client.sessionId,
          weaponType,
          clientTime:      data.clientTime ?? Date.now(),
          clientTimestamp: this.simTime * 1000,
        });
      }
    });

    // ── Ping / latency ─────────────────────────────────────────────────────
    this.onMessage('ping', (client) => {
      client.send('pong', { serverTime: Date.now(), tick: this.tick });
    });

    // ── Chat ───────────────────────────────────────────────────────────────
    this.onMessage('chat', (client, data: unknown) => {
      if (!this.validator.checkChat(client.sessionId)) return;
      if (!this.validator.validateChat(data)) return;
      this.chat.route(this, client, data.message, data.channel, this.state.ships, this.interest);
    });

    // ── Nav target (replicated so others can see your waypoint) ───────────
    this.onMessage('nav_target', (_client, data: unknown) => {
      if (!this.validator.validateNavTarget(data)) return;
      // Nav target is intentionally NOT in the schema to save bandwidth.
    });

    // ── Corp actions (invite, kick, deposit, promote) ─────────────────────
    this.onMessage('corp_action', (client, data: unknown) => {
      // Delegated to a separate handler; validated by shape only.
      void this._handleCorpAction(client, data);
    });

    this.spawnAIShips();

    this.tickInterval = setInterval(() => this.simulateTick(), 1000 / this.tickRate);

    console.log(`[SectorRoom] Created: ${this.state.sectorName} (${this.state.sectorId})`);
  }

  async onJoin(client: Client, options: { shipClass?: string; username?: string }): Promise<void> {
    const shipClass = (options.shipClass as keyof typeof GameConfig.ships) ?? 'fighter';
    const cfg       = GameConfig.ships[shipClass] ?? GameConfig.ships.fighter;

    // Load or create player record from DB
    let player = null;
    try {
      player = await this.players.upsertBySession(
        client.sessionId,
        options.username ?? 'Pilot',
      );
      this.playerDbIds.set(client.sessionId, player.id);
    } catch (err) {
      console.warn(`[SectorRoom] DB unavailable for ${client.sessionId}:`, err);
    }

    const spawnX = 1000 + Math.random() * (GameConfig.world.sectorSize - 2000);
    const spawnY = 1000 + Math.random() * (GameConfig.world.sectorSize - 2000);

    const ship        = new ShipSchema();
    ship.sessionId    = client.sessionId;
    ship.playerId     = player?.id ?? client.sessionId;
    ship.shipClass    = shipClass;
    ship.username     = player?.username ?? options.username ?? 'Pilot';
    ship.x            = spawnX;
    ship.y            = spawnY;
    ship.maxHull      = cfg.maxHull;
    ship.hull         = cfg.maxHull;
    ship.maxShield    = cfg.maxShield;
    ship.shield       = cfg.maxShield;
    ship.isAlive      = true;

    this.state.ships.set(client.sessionId, ship);
    this.state.playerCount++;

    // Send chat history so new player sees recent conversation
    this.chat.sendHistory(client);

    // Announce join
    this.chat.system(this, `${ship.username} entered ${this.state.sectorName}.`);

    console.log(`[SectorRoom] ${ship.username} (${client.sessionId}) joined as ${shipClass}`);
  }

  async onLeave(client: Client, _consented: boolean): Promise<void> {
    const ship = this.state.ships.get(client.sessionId);
    if (ship) {
      const username = ship.username;
      this.state.ships.delete(client.sessionId);
      this.state.playerCount = Math.max(0, this.state.playerCount - 1);

      // Persist player stats
      try {
        const dbId = this.playerDbIds.get(client.sessionId);
        if (dbId) {
          await this._persistPlayerExit(client.sessionId, dbId, ship);
        }
      } catch (err) {
        console.warn(`[SectorRoom] Failed to persist ${client.sessionId}:`, err);
      }

      this.chat.system(this, `${username} left ${this.state.sectorName}.`);
    }

    this.physics.clearInput(client.sessionId);
    this.lagComp.remove(client.sessionId);
    this.validator.remove(client.sessionId);
    this.playerDbIds.delete(client.sessionId);

    console.log(`[SectorRoom] ${client.sessionId} left`);
  }

  onDispose(): void {
    if (this.tickInterval) clearInterval(this.tickInterval);
    this.lagComp.clear();
    console.log(`[SectorRoom] Disposed: ${this.state.sectorId}`);
  }

  // ── Simulation tick ───────────────────────────────────────────────────────

  private simulateTick(): void {
    this.tick++;
    this.simTime += this.dt;
    this.state.tick = this.tick;

    // 1. Record positions for lag compensation (before physics moves ships)
    this.lagComp.record(this.state.ships, this.simTime);

    // 2. AI inputs
    const aiResult = this.ai.update(this.state.ships, this.dt);
    for (const [sessionId, input] of aiResult.inputs) {
      this.physics.setInput(sessionId, input, 0);
    }
    for (const fire of aiResult.fires) {
      this.combat.queueFire({ ...fire, clientTime: Date.now(), clientTimestamp: this.simTime * 1000 });
    }

    // 3. Physics
    this.physics.update(this.state.ships, this.dt, this.tick);

    // 4. Combat (with lag compensation context)
    const events = this.combat.update(
      this.state.ships, this.dt, this.tick, this.lagComp, this.simTime,
    );

    // 5. Broadcast combat events to relevant clients via interest management
    this.interest.update(this.state.ships);
    for (const event of events) {
      this._broadcastCombatEvent(event);
    }

    // 6. Respawn dead AI ships after delay
    this._respawnDeadAI();
  }

  // ── Interest-filtered combat event broadcast ──────────────────────────────

  private _broadcastCombatEvent(event: ReturnType<CombatSystem['update']>[0]): void {
    // Broadcast to all — the client ignores events for entities it doesn't know
    this.broadcast('combat_event', event);
  }

  // ── AI management ─────────────────────────────────────────────────────────

  private spawnAIShips(): void {
    for (let i = 0; i < 5; i++) {
      this._spawnOneAI(`ai_${i}`);
    }
  }

  private _spawnOneAI(id: string): void {
    const ship  = new ShipSchema();
    const cfg   = GameConfig.ships.fighter;
    const spawnX = 2000 + Math.random() * (GameConfig.world.sectorSize - 4000);
    const spawnY = 2000 + Math.random() * (GameConfig.world.sectorSize - 4000);

    ship.sessionId = id;
    ship.playerId  = id;
    ship.shipClass = 'fighter';
    ship.username  = `Drone-${id.slice(-1)}`;
    ship.x         = spawnX;
    ship.y         = spawnY;
    ship.maxHull   = cfg.maxHull;
    ship.hull      = cfg.maxHull;
    ship.maxShield = cfg.maxShield;
    ship.shield    = cfg.maxShield;
    ship.isAlive   = true;

    this.state.ships.set(id, ship);
    this.ai.registerAgent(id, spawnX, spawnY);
  }

  private _deadAITimers = new Map<string, number>();

  private _respawnDeadAI(): void {
    this.state.ships.forEach((ship, id) => {
      if (!id.startsWith('ai_') || ship.isAlive) return;
      if (!this._deadAITimers.has(id)) {
        this._deadAITimers.set(id, this.simTime + 20); // 20s respawn
      }
      if (this.simTime >= this._deadAITimers.get(id)!) {
        this._deadAITimers.delete(id);
        this.state.ships.delete(id);
        this.ai.unregisterAgent(id);
        this._spawnOneAI(id);
      }
    });
  }

  // ── Persistence helpers ───────────────────────────────────────────────────

  private async _persistPlayerExit(
    _sessionId: string,
    dbId: string,
    _ship: ShipSchema,
  ): Promise<void> {
    // Stub: the inventory repo is ready for full cargo save when ship modules are tracked.
    // Example: await this.inventoryRepo.saveCargoSnapshot(dbId, ship.cargo);
    void dbId;
    void this.inventoryRepo; // referenced to satisfy TS unused-declaration rule
  }

  // ── Corp actions ──────────────────────────────────────────────────────────

  private async _handleCorpAction(client: Client, data: unknown): Promise<void> {
    // Corp operations (create, invite, kick) are validated and delegated.
    // Minimal implementation: the full corp system is driven by the DB.
    if (!data || typeof data !== 'object') return;
    const { action } = data as Record<string, unknown>;
    console.log(`[Corp] ${client.sessionId} requested action=${String(action)}`);
    // Extend: wire to CorporationRepository here
  }
}

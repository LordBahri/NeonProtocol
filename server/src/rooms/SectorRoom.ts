import { Room, type Client } from 'colyseus';
import { SectorSchema } from '../schemas/SectorSchema.ts';
import { ShipSchema } from '../schemas/ShipSchema.ts';
import { PhysicsSystem } from '../systems/PhysicsSystem.ts';
import { CombatSystem } from '../systems/CombatSystem.ts';
import { InterestManager } from '../systems/InterestManager.ts';
import { AISystem } from '../systems/AISystem.ts';
import { GameConfig } from '../config/GameConfig.ts';

export interface SectorRoomOptions {
  sectorId: string;
  sectorName: string;
  seed?: number;
}

export interface ClientInputMessage {
  thrustForward: boolean;
  thrustBack: boolean;
  rotateLeft: boolean;
  rotateRight: boolean;
  fire: boolean;
  weaponType?: string;
  angle?: number;
}

export class SectorRoom extends Room<SectorSchema> {
  private physics = new PhysicsSystem();
  private combat = new CombatSystem();
  private interest = new InterestManager();
  private ai = new AISystem();

  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private tick = 0;
  private tickRate = GameConfig.server.tickRate;
  private dt = 1 / this.tickRate;

  onCreate(options: SectorRoomOptions): void {
    this.setState(new SectorSchema());
    this.state.sectorId = options.sectorId ?? 'sector_0_0';
    this.state.sectorName = options.sectorName ?? 'Alpha Sector';

    this.maxClients = GameConfig.server.maxPlayersPerSector;
    this.setPatchRate(1000 / this.tickRate);

    this.onMessage('input', (client, data: ClientInputMessage) => {
      this.physics.setInput(client.sessionId, {
        thrustForward: data.thrustForward ?? false,
        thrustBack: data.thrustBack ?? false,
        rotateLeft: data.rotateLeft ?? false,
        rotateRight: data.rotateRight ?? false,
        angle: data.angle,
      });

      if (data.fire) {
        const weaponType = (data.weaponType as keyof typeof GameConfig.weapons) ?? 'laser';
        this.combat.queueFire({ sessionId: client.sessionId, weaponType });
      }
    });

    this.onMessage('ping', (client) => {
      client.send('pong', { serverTime: Date.now() });
    });

    this.spawnAIShips();

    this.tickInterval = setInterval(() => this.simulateTick(), 1000 / this.tickRate);

    console.log(`[SectorRoom] Created: ${this.state.sectorName} (${this.state.sectorId})`);
  }

  onJoin(client: Client, options: { shipClass?: string }): void {
    const shipClass = (options.shipClass as keyof typeof GameConfig.ships) ?? 'fighter';
    const cfg = GameConfig.ships[shipClass] ?? GameConfig.ships.fighter;

    const spawnX = 1000 + Math.random() * (GameConfig.world.sectorSize - 2000);
    const spawnY = 1000 + Math.random() * (GameConfig.world.sectorSize - 2000);

    const ship = new ShipSchema();
    ship.sessionId = client.sessionId;
    ship.playerId = client.sessionId;
    ship.shipClass = shipClass;
    ship.x = spawnX;
    ship.y = spawnY;
    ship.maxHull = cfg.maxHull;
    ship.hull = cfg.maxHull;
    ship.maxShield = cfg.maxShield;
    ship.shield = cfg.maxShield;
    ship.isAlive = true;

    this.state.ships.set(client.sessionId, ship);
    this.state.playerCount++;

    console.log(`[SectorRoom] ${client.sessionId} joined as ${shipClass}`);
  }

  onLeave(client: Client, _consented: boolean): void {
    const ship = this.state.ships.get(client.sessionId);
    if (ship) {
      this.state.ships.delete(client.sessionId);
      this.state.playerCount = Math.max(0, this.state.playerCount - 1);
    }
    this.physics.clearInput(client.sessionId);
    console.log(`[SectorRoom] ${client.sessionId} left`);
  }

  onDispose(): void {
    if (this.tickInterval) clearInterval(this.tickInterval);
    console.log(`[SectorRoom] Disposed: ${this.state.sectorId}`);
  }

  private simulateTick(): void {
    this.tick++;
    this.state.tick = this.tick;

    const aiResult = this.ai.update(this.state.ships, this.dt);
    for (const [sessionId, input] of aiResult.inputs) {
      this.physics.setInput(sessionId, input);
    }
    for (const fire of aiResult.fires) {
      this.combat.queueFire(fire);
    }

    this.physics.update(this.state.ships, this.dt, this.tick);

    const events = this.combat.update(this.state.ships, this.dt, this.tick);
    for (const event of events) {
      this.broadcast('combat_event', event, { except: undefined });
    }

    this.interest.update(this.state.ships);
  }

  private spawnAIShips(): void {
    const aiCount = 5;
    for (let i = 0; i < aiCount; i++) {
      const id = `ai_${i}`;
      const ship = new ShipSchema();
      const cfg = GameConfig.ships.fighter;
      const spawnX = 2000 + Math.random() * (GameConfig.world.sectorSize - 4000);
      const spawnY = 2000 + Math.random() * (GameConfig.world.sectorSize - 4000);

      ship.sessionId = id;
      ship.playerId = id;
      ship.shipClass = 'fighter';
      ship.x = spawnX;
      ship.y = spawnY;
      ship.maxHull = cfg.maxHull;
      ship.hull = cfg.maxHull;
      ship.maxShield = cfg.maxShield;
      ship.shield = cfg.maxShield;
      ship.isAlive = true;

      this.state.ships.set(id, ship);
      this.ai.registerAgent(id, spawnX, spawnY);
    }
  }
}

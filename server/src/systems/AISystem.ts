import type { MapSchema } from '@colyseus/schema';
import type { ShipSchema } from '../schemas/ShipSchema.ts';
import type { PhysicsInput } from './PhysicsSystem.ts';
import type { FireCommand } from './CombatSystem.ts';

export type AIBehavior = 'patrol' | 'chase' | 'flee' | 'idle';

interface AIAgent {
  sessionId: string;
  behavior: AIBehavior;
  targetSessionId: string | null;
  waypointX: number;
  waypointY: number;
  thinkTimer: number;
  thinkInterval: number;
}

const CHASE_RANGE = 800;
const FLEE_HULL_THRESHOLD = 0.3;
const ATTACK_RANGE = 400;

export class AISystem {
  private agents = new Map<string, AIAgent>();

  registerAgent(sessionId: string, waypointX: number, waypointY: number): void {
    this.agents.set(sessionId, {
      sessionId,
      behavior: 'patrol',
      targetSessionId: null,
      waypointX,
      waypointY,
      thinkTimer: Math.random() * 0.5,
      thinkInterval: 0.25 + Math.random() * 0.25,
    });
  }

  unregisterAgent(sessionId: string): void {
    this.agents.delete(sessionId);
  }

  update(
    ships: MapSchema<ShipSchema>,
    dt: number,
  ): { inputs: Map<string, PhysicsInput>; fires: FireCommand[] } {
    const inputs = new Map<string, PhysicsInput>();
    const fires: FireCommand[] = [];

    for (const agent of this.agents.values()) {
      const ship = ships.get(agent.sessionId);
      if (!ship || !ship.isAlive) continue;

      agent.thinkTimer -= dt;
      if (agent.thinkTimer <= 0) {
        agent.thinkTimer = agent.thinkInterval;
        this.think(agent, ship, ships);
      }

      const input = this.executebehavior(agent, ship, fires);
      inputs.set(agent.sessionId, input);
    }

    return { inputs, fires };
  }

  private think(agent: AIAgent, ship: ShipSchema, ships: MapSchema<ShipSchema>): void {
    const hullFrac = ship.hull / ship.maxHull;

    if (hullFrac < FLEE_HULL_THRESHOLD) {
      agent.behavior = 'flee';
      return;
    }

    let nearestDist = Infinity;
    let nearestId: string | null = null;

    ships.forEach((other) => {
      if (other.sessionId === agent.sessionId || !other.isAlive) return;
      if (this.agents.has(other.sessionId)) return;

      const dx = other.x - ship.x;
      const dy = other.y - ship.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < CHASE_RANGE && dist < nearestDist) {
        nearestDist = dist;
        nearestId = other.sessionId;
      }
    });

    if (nearestId) {
      agent.targetSessionId = nearestId;
      agent.behavior = 'chase';
    } else {
      agent.targetSessionId = null;
      agent.behavior = 'patrol';
    }
  }

  private executebehavior(
    agent: AIAgent,
    ship: ShipSchema,
    fires: FireCommand[],
  ): PhysicsInput {
    switch (agent.behavior) {
      case 'chase':
        return this.chase(agent, ship, fires);
      case 'flee':
        return this.flee(agent, ship);
      case 'patrol':
      default:
        return this.patrol(agent, ship);
    }
  }

  private patrol(agent: AIAgent, ship: ShipSchema): PhysicsInput {
    const dx = agent.waypointX - ship.x;
    const dy = agent.waypointY - ship.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 100) {
      const angle = Math.random() * Math.PI * 2;
      const r = 300 + Math.random() * 700;
      agent.waypointX = ship.x + Math.cos(angle) * r;
      agent.waypointY = ship.y + Math.sin(angle) * r;
    }

    return this.steerToward(ship.x, ship.y, ship.angle, agent.waypointX, agent.waypointY, 0.7);
  }

  private chase(agent: AIAgent, ship: ShipSchema, fires: FireCommand[]): PhysicsInput {
    if (!agent.targetSessionId) return this.patrol(agent, ship);

    const targetX = agent.waypointX;
    const targetY = agent.waypointY;
    const dx = targetX - ship.x;
    const dy = targetY - ship.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < ATTACK_RANGE) {
      fires.push({ sessionId: agent.sessionId, weaponType: 'laser' });
    }

    return this.steerToward(ship.x, ship.y, ship.angle, targetX, targetY, 1.0);
  }

  private flee(agent: AIAgent, ship: ShipSchema): PhysicsInput {
    const fleeX = ship.x - Math.cos(ship.angle) * 500;
    const fleeY = ship.y - Math.sin(ship.angle) * 500;
    agent.waypointX = fleeX;
    agent.waypointY = fleeY;
    return this.steerToward(ship.x, ship.y, ship.angle, fleeX, fleeY, 1.0);
  }

  private steerToward(
    sx: number, sy: number, sAngle: number,
    tx: number, ty: number,
    throttle: number,
  ): PhysicsInput {
    const targetAngle = Math.atan2(ty - sy, tx - sx);
    let diff = targetAngle - sAngle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;

    return {
      thrustForward: throttle > 0.3,
      thrustBack: false,
      rotateLeft: diff < -0.1,
      rotateRight: diff > 0.1,
      angle: targetAngle,
    };
  }
}

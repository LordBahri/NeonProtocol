export const GameConfig = {
  server: {
    tickRate: parseInt(process.env['TICK_RATE'] ?? '20', 10),
    maxPlayersPerSector: parseInt(process.env['MAX_PLAYERS_PER_SECTOR'] ?? '64', 10),
  },
  world: {
    sectorSize: parseInt(process.env['SECTOR_SIZE'] ?? '20000', 10),
    sectorGridCols: 10,
    sectorGridRows: 10,
  },
  ships: {
    fighter: {
      maxHull: 80,
      maxShield: 60,
      shieldRechargeRate: 8,
      shieldRechargeDelay: 3,
      maxSpeed: 500,
      acceleration: 300,
      drag: 0.93,
      rotationSpeed: 3.2,
      mass: 0.8,
    },
    frigate: {
      maxHull: 200,
      maxShield: 150,
      shieldRechargeRate: 12,
      shieldRechargeDelay: 4,
      maxSpeed: 350,
      acceleration: 180,
      drag: 0.88,
      rotationSpeed: 2,
      mass: 2,
    },
    destroyer: {
      maxHull: 500,
      maxShield: 300,
      shieldRechargeRate: 20,
      shieldRechargeDelay: 5,
      maxSpeed: 250,
      acceleration: 120,
      drag: 0.85,
      rotationSpeed: 1.2,
      mass: 5,
    },
  },
  weapons: {
    laser: {
      damage: 10,
      projectileSpeed: 800,
      range: 600,
      fireRate: 5,
      energyCost: 5,
    },
    cannon: {
      damage: 35,
      projectileSpeed: 500,
      range: 500,
      fireRate: 1.5,
      energyCost: 15,
    },
    missile: {
      damage: 80,
      projectileSpeed: 350,
      range: 1000,
      fireRate: 0.5,
      energyCost: 30,
    },
  },
  physics: {
    collisionRadius: {
      fighter: 18,
      frigate: 30,
      destroyer: 48,
    },
  },
  interest: {
    cellSize: 2000,
    viewRadius: 2,
  },
} as const;

export type ShipClass = keyof typeof GameConfig.ships;
export type WeaponType = keyof typeof GameConfig.weapons;

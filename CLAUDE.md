# NeonProtocol — MMO Engine

Browser-based 2.5D space sandbox MMO. Eve Online / Starsector aesthetic with neon cyberpunk visuals.

## Stack

| Layer | Tech |
|-------|------|
| Frontend rendering | PixiJS 8 (WebGL2) |
| Frontend state | Zustand |
| Frontend animation | GSAP |
| Frontend build | Vite + TypeScript |
| Backend runtime | Node.js + Colyseus 0.15 |
| Database | PostgreSQL |

## Architecture

```
client/src/
  core/
    ecs/          # Entity-Component-System (World, SystemScheduler, QueryCache)
    renderer/     # PixiJS pipeline — NEVER import game logic here
    simulation/   # Fixed-tick game loop — NEVER import PixiJS here
    network/      # Colyseus client, message bus, state reconciler
  features/
    space/        # Sector grid, chunk manager, starfield
    ships/        # Ship components, factory, movement, renderer
    combat/       # Weapons, projectile pool, damage system
    fx/           # Particles, bloom, neon trails, explosions
    ui/           # HUD, minimap, target info
  store/          # Zustand slices (game, ui, network)
  assets/         # Asset manifests (no raw imports outside here)

server/src/
  rooms/          # Colyseus rooms (Sector, Lobby)
  schemas/        # Colyseus state schemas
  systems/        # Physics, combat, interest management, AI
  db/             # PostgreSQL connection, migrations, repositories
  config/         # GameConfig (authoritative game rules)
```

## Critical Rules

- **Simulation ↔ Renderer isolation**: `core/simulation/` must never import `core/renderer/` and vice versa.
- **ECS queries are cached**: never iterate all entities naively.
- **Object pools mandatory** for projectiles, particles, damage numbers, explosions.
- **Fixed tick at 20 Hz** server-side; **client interpolates at render framerate**.
- **Interest management**: server only broadcasts entities within a player's spatial cell ±1.
- All game balance values live in `server/src/config/GameConfig.ts` — no magic numbers in systems.

## Commands

```bash
# Development (both client + server)
npm run dev

# Individual
npm run dev:client
npm run dev:server

# Build
npm run build

# Type check
npm run typecheck
```

## Environment Variables

### Client (`client/.env`)
```
VITE_SERVER_URL=ws://localhost:2567
VITE_ASSET_BASE_URL=/assets
```

### Server (`server/.env`)
```
PORT=2567
DATABASE_URL=postgresql://user:password@localhost:5432/neonprotocol
NODE_ENV=development
TICK_RATE=20
```

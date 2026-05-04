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

## Deployment

### Frontend — Vercel
`vercel.json` at repo root handles everything. Zero-config import from GitHub.

**Required env vars in Vercel dashboard** (Project → Settings → Environment Variables):
```
VITE_SERVER_URL   wss://your-server.domain.com   (Production)
VITE_ASSET_BASE_URL  /assets                      (Production)
```

Vercel build pipeline:
- Install: `npm install` (installs all workspaces)
- Build: `npm run build:client` → outputs `client/dist/`
- SPA rewrite: all routes → `index.html`
- Asset caching: `Cache-Control: immutable` on hashed chunks, `no-cache` on `index.html`
- `.vercelignore` excludes `server/` entirely

### Backend — Railway
`server/railway.json` + `server/nixpacks.toml` drive the build.

**Railway setup (one-time):**
1. New project → Deploy from GitHub repo
2. Set **Root Directory** to `server/`
3. Add env vars (see `server/.env.example`):

| Variable | Value |
|----------|-------|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Supabase connection string (see below) |
| `CLIENT_URL` | Your Vercel URL, e.g. `https://neonprotocol.vercel.app` |
| `TICK_RATE` | `20` |
| `MAX_PLAYERS_PER_SECTOR` | `64` |

Railway auto-sets `PORT` — do not override it.

### Database — Supabase
Supabase project → **Settings → Database → Connection string**.

Two options:
- **Direct** (port 5432) — for long-lived server processes on Railway
  `postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres`
- **Supavisor pooler** (port 6543) — transaction mode, lower concurrent connections
  `postgresql://postgres.[REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres`

The DB pool auto-detects which port is used and caps `max` connections accordingly.
SSL (`rejectUnauthorized: false`) is applied automatically in production.

**Run migrations** (once, locally or via Railway one-off task):
```bash
cd server && DATABASE_URL=<supabase_url> npm run db:migrate
```

## Commands

```bash
# Development (both client + server)
npm run dev

# Individual
npm run dev:client
npm run dev:server

# Build all
npm run build

# Build client only (used by Vercel)
npm run build:client

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

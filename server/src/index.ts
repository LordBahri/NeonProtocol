import 'dotenv/config';
import { createServer } from 'http';
import express from 'express';
import cors from 'cors';
import { Server } from 'colyseus';
import { monitor } from '@colyseus/monitor';
import { SectorRoom } from './rooms/SectorRoom.ts';
import { LobbyRoom } from './rooms/LobbyRoom.ts';

const PORT = parseInt(process.env['PORT'] ?? '2567', 10);
const isDev = process.env['NODE_ENV'] !== 'production';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

if (isDev) {
  app.use('/colyseus', monitor());
}

const httpServer = createServer(app);

const gameServer = new Server({
  server: httpServer,
  presence: undefined,
});

gameServer.define('lobby', LobbyRoom);

gameServer.define('sector_room', SectorRoom, {
  sectorId: 'sector_0_0',
  sectorName: 'Alpha Sector',
}).filterBy(['sectorId']);

gameServer.onShutdown(() => {
  console.log('[Server] Shutting down gracefully...');
});

gameServer.listen(PORT).then(() => {
  console.log(`[Server] NeonProtocol server running on port ${PORT}`);
  if (isDev) {
    console.log(`[Server] Colyseus monitor: http://localhost:${PORT}/colyseus`);
  }
}).catch((err) => {
  console.error('[Server] Failed to start:', err);
  process.exit(1);
});

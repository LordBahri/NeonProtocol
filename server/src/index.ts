import 'reflect-metadata';
import 'dotenv/config';
import { createServer } from 'http';
import express from 'express';
import cors from 'cors';
import { Server } from 'colyseus';
import { monitor } from '@colyseus/monitor';
import { SectorRoom } from './rooms/SectorRoom';
import { LobbyRoom } from './rooms/LobbyRoom';
import { closePool } from './db/connection';

const PORT = parseInt(process.env['PORT'] ?? '2567', 10);
const isDev = process.env['NODE_ENV'] !== 'production';

const CLIENT_URL = process.env['CLIENT_URL'] ?? (isDev ? 'http://localhost:3000' : '');

const app = express();

app.use(cors({
  origin: isDev
    ? true
    : CLIENT_URL
      ? CLIENT_URL.split(',').map(u => u.trim())
      : false,
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true,
}));

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now(), env: process.env['NODE_ENV'] });
});

if (isDev) {
  app.use('/colyseus', monitor());
}

const httpServer = createServer(app);

const gameServer = new Server({
  server: httpServer,
});

gameServer.define('lobby', LobbyRoom);

gameServer.define('sector_room', SectorRoom, {
  sectorId: 'sector_0_0',
  sectorName: 'Alpha Sector',
}).filterBy(['sectorId']);

gameServer.onShutdown(async () => {
  console.log('[Server] Shutting down gracefully...');
  await closePool();
});

gameServer.listen(PORT).then(() => {
  console.log(`[Server] NeonProtocol running on port ${PORT}`);
  if (isDev) {
    console.log(`[Server] Colyseus monitor: http://localhost:${PORT}/colyseus`);
  }
}).catch((err) => {
  console.error('[Server] Failed to start:', err);
  process.exit(1);
});

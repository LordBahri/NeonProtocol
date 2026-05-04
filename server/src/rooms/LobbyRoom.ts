import { Room, type Client, matchMaker } from 'colyseus';
import { LobbySchema, SectorInfoSchema } from '../schemas/LobbySchema.ts';
import { GameConfig } from '../config/GameConfig.ts';

export class LobbyRoom extends Room<LobbySchema> {
  private updateInterval: ReturnType<typeof setInterval> | null = null;

  onCreate(): void {
    this.setState(new LobbySchema());
    this.autoDispose = false;

    this.onMessage('join_sector', async (client, data: { sectorId?: string; shipClass?: string }) => {
      const sectorId = data.sectorId ?? 'sector_0_0';
      const sectorName = this.getSectorName(sectorId);

      try {
        const room = await matchMaker.joinOrCreate('sector_room', {
          sectorId,
          sectorName,
        });
        client.send('sector_joined', { roomId: room.roomId, sessionId: room.sessionId });
      } catch (err) {
        client.send('error', { message: 'Failed to join sector' });
        console.error('[LobbyRoom] join_sector error:', err);
      }
    });

    this.onMessage('list_sectors', async (client) => {
      const rooms = await matchMaker.query({ name: 'sector_room' });
      client.send('sector_list', rooms.map(r => ({
        roomId: r.roomId,
        sectorId: r.metadata?.sectorId ?? 'unknown',
        sectorName: r.metadata?.sectorName ?? 'Unknown',
        playerCount: r.clients,
        maxPlayers: GameConfig.server.maxPlayersPerSector,
      })));
    });

    this.updateInterval = setInterval(() => this.broadcastSectorStatus(), 5000);
  }

  onLeave(_client: Client): void {
    // Lobby is stateless — nothing to clean up
  }

  onDispose(): void {
    if (this.updateInterval) clearInterval(this.updateInterval);
  }

  private async broadcastSectorStatus(): Promise<void> {
    try {
      const rooms = await matchMaker.query({ name: 'sector_room' });
      this.state.totalPlayers = rooms.reduce((acc, r) => acc + r.clients, 0);

      this.state.sectors.clear();
      for (const room of rooms) {
        const info = new SectorInfoSchema();
        info.id = room.metadata?.sectorId ?? room.roomId;
        info.name = room.metadata?.sectorName ?? 'Unknown';
        info.playerCount = room.clients;
        info.maxPlayers = GameConfig.server.maxPlayersPerSector;
        this.state.sectors.push(info);
      }
    } catch {
      // matchmaker query failed — non-fatal
    }
  }

  private getSectorName(sectorId: string): string {
    const names: Record<string, string> = {
      'sector_0_0': 'Alpha Sector',
      'sector_1_0': 'Beta Sector',
      'sector_0_1': 'Gamma Sector',
      'sector_1_1': 'Delta Sector',
    };
    return names[sectorId] ?? `Sector ${sectorId}`;
  }
}

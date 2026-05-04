import { query, queryOne, withTransaction } from '../connection.js';
import type { PoolClient } from 'pg';

export interface Player {
  id: string;
  session_id: string;
  username: string;
  credits: number;
  kills: number;
  deaths: number;
  play_time: number;
  created_at: Date;
  last_seen: Date;
}

export class PlayerRepository {
  async findBySessionId(sessionId: string): Promise<Player | null> {
    return queryOne<Player>(
      'SELECT * FROM players WHERE session_id = $1',
      [sessionId],
    );
  }

  async findById(id: string): Promise<Player | null> {
    return queryOne<Player>('SELECT * FROM players WHERE id = $1', [id]);
  }

  async upsertBySession(sessionId: string, username = 'Pilot'): Promise<Player> {
    return withTransaction(async (client: PoolClient) => {
      const existing = await client.query<Player>(
        'SELECT * FROM players WHERE session_id = $1 FOR UPDATE',
        [sessionId],
      );

      if (existing.rows[0]) {
        const updated = await client.query<Player>(
          'UPDATE players SET last_seen = NOW() WHERE session_id = $1 RETURNING *',
          [sessionId],
        );
        return updated.rows[0]!;
      }

      const inserted = await client.query<Player>(
        `INSERT INTO players (session_id, username) VALUES ($1, $2) RETURNING *`,
        [sessionId, username],
      );
      return inserted.rows[0]!;
    });
  }

  async recordKill(attackerId: string, victimId: string): Promise<void> {
    await withTransaction(async (client: PoolClient) => {
      await client.query('UPDATE players SET kills = kills + 1 WHERE id = $1', [attackerId]);
      await client.query('UPDATE players SET deaths = deaths + 1 WHERE id = $1', [victimId]);

      await client.query(
        `INSERT INTO leaderboard (player_id, kills, deaths)
         VALUES ($1, 1, 0)
         ON CONFLICT (player_id) DO UPDATE
         SET kills = leaderboard.kills + 1, updated_at = NOW()`,
        [attackerId],
      );
      await client.query(
        `INSERT INTO leaderboard (player_id, kills, deaths)
         VALUES ($1, 0, 1)
         ON CONFLICT (player_id) DO UPDATE
         SET deaths = leaderboard.deaths + 1, updated_at = NOW()`,
        [victimId],
      );
    });
  }

  async getTopKills(limit = 10): Promise<Array<{ username: string; kills: number; kd_ratio: number }>> {
    return query(
      `SELECT p.username, l.kills, l.kd_ratio
       FROM leaderboard l
       JOIN players p ON p.id = l.player_id
       ORDER BY l.kills DESC LIMIT $1`,
      [limit],
    );
  }
}

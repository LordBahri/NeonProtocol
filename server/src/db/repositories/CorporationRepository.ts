import { query, queryOne, withTransaction } from '../connection.js';
import type { PoolClient } from 'pg';

export interface Corporation {
  id: string;
  name: string;
  ticker: string;
  leader_id: string;
  description: string;
  credits: number;
  created_at: Date;
}

export interface CorporationMember {
  corp_id: string;
  player_id: string;
  rank: 'leader' | 'officer' | 'member';
  joined_at: Date;
}

export class CorporationRepository {
  async findById(id: string): Promise<Corporation | null> {
    return queryOne<Corporation>('SELECT * FROM corporations WHERE id = $1', [id]);
  }

  async findByTicker(ticker: string): Promise<Corporation | null> {
    return queryOne<Corporation>(
      'SELECT * FROM corporations WHERE UPPER(ticker) = UPPER($1)',
      [ticker],
    );
  }

  async create(
    name: string,
    ticker: string,
    leaderId: string,
    description = '',
  ): Promise<Corporation> {
    const row = await queryOne<Corporation>(
      `INSERT INTO corporations (name, ticker, leader_id, description)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, ticker.toUpperCase(), leaderId, description],
    );
    // Immediately add leader as member
    await query(
      `INSERT INTO corporation_members (corp_id, player_id, rank) VALUES ($1, $2, 'leader')`,
      [row!.id, leaderId],
    );
    return row!;
  }

  async getMembership(playerId: string): Promise<(CorporationMember & { corp_name: string; corp_ticker: string }) | null> {
    return queryOne(
      `SELECT cm.*, c.name AS corp_name, c.ticker AS corp_ticker
       FROM corporation_members cm
       JOIN corporations c ON c.id = cm.corp_id
       WHERE cm.player_id = $1`,
      [playerId],
    );
  }

  async getMembers(corpId: string): Promise<Array<CorporationMember & { username: string }>> {
    return query(
      `SELECT cm.*, p.username
       FROM corporation_members cm
       JOIN players p ON p.id = cm.player_id
       WHERE cm.corp_id = $1
       ORDER BY cm.rank DESC, cm.joined_at`,
      [corpId],
    );
  }

  async addMember(corpId: string, playerId: string, rank: 'officer' | 'member' = 'member'): Promise<void> {
    await query(
      `INSERT INTO corporation_members (corp_id, player_id, rank)
       VALUES ($1, $2, $3)
       ON CONFLICT (corp_id, player_id) DO NOTHING`,
      [corpId, playerId, rank],
    );
  }

  async removeMember(corpId: string, playerId: string): Promise<void> {
    await query(
      'DELETE FROM corporation_members WHERE corp_id = $1 AND player_id = $2',
      [corpId, playerId],
    );
  }

  async promoteToOfficer(corpId: string, playerId: string): Promise<void> {
    await query(
      `UPDATE corporation_members SET rank = 'officer'
       WHERE corp_id = $1 AND player_id = $2 AND rank = 'member'`,
      [corpId, playerId],
    );
  }

  async transferLeadership(corpId: string, fromPlayerId: string, toPlayerId: string): Promise<boolean> {
    return withTransaction(async (client: PoolClient) => {
      const leader = await client.query<CorporationMember>(
        `SELECT * FROM corporation_members WHERE corp_id = $1 AND player_id = $2 AND rank = 'leader' FOR UPDATE`,
        [corpId, fromPlayerId],
      );
      if (!leader.rows[0]) return false;

      await client.query(
        `UPDATE corporation_members SET rank = 'officer' WHERE corp_id = $1 AND player_id = $2`,
        [corpId, fromPlayerId],
      );
      await client.query(
        `UPDATE corporation_members SET rank = 'leader' WHERE corp_id = $1 AND player_id = $2`,
        [corpId, toPlayerId],
      );
      await client.query(
        `UPDATE corporations SET leader_id = $1 WHERE id = $2`,
        [toPlayerId, corpId],
      );
      return true;
    });
  }

  async deposit(corpId: string, amount: number): Promise<void> {
    await query(
      'UPDATE corporations SET credits = credits + $1 WHERE id = $2',
      [amount, corpId],
    );
  }

  async withdraw(corpId: string, amount: number): Promise<boolean> {
    return withTransaction(async (client: PoolClient) => {
      const row = await client.query<Corporation>(
        'SELECT credits FROM corporations WHERE id = $1 FOR UPDATE',
        [corpId],
      );
      if (!row.rows[0] || row.rows[0].credits < amount) return false;
      await client.query(
        'UPDATE corporations SET credits = credits - $1 WHERE id = $2',
        [amount, corpId],
      );
      return true;
    });
  }
}

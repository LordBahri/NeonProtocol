import { query, queryOne, withTransaction } from '../connection.js';
import type { PoolClient } from 'pg';

export interface InventoryItem {
  id: string;
  player_id: string;
  item_type: string;
  quantity: number;
  slot: number | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export class InventoryRepository {
  async getByPlayerId(playerId: string): Promise<InventoryItem[]> {
    return query<InventoryItem>(
      'SELECT * FROM inventory WHERE player_id = $1 ORDER BY item_type',
      [playerId],
    );
  }

  /** Upsert: add qty to existing stack or insert new row. */
  async addItem(
    playerId: string,
    itemType: string,
    quantity: number,
    metadata: Record<string, unknown> = {},
  ): Promise<InventoryItem> {
    return withTransaction(async (client: PoolClient) => {
      const existing = await client.query<InventoryItem>(
        `SELECT * FROM inventory WHERE player_id = $1 AND item_type = $2 LIMIT 1`,
        [playerId, itemType],
      );

      if (existing.rows[0]) {
        const row = existing.rows[0];
        const updated = await client.query<InventoryItem>(
          `UPDATE inventory
           SET quantity = quantity + $1, updated_at = NOW()
           WHERE id = $2 RETURNING *`,
          [quantity, row.id],
        );
        return updated.rows[0]!;
      }

      const inserted = await client.query<InventoryItem>(
        `INSERT INTO inventory (player_id, item_type, quantity, metadata)
         VALUES ($1, $2, $3, $4::jsonb) RETURNING *`,
        [playerId, itemType, quantity, JSON.stringify(metadata)],
      );
      return inserted.rows[0]!;
    });
  }

  /** Remove qty from a stack. Returns false if insufficient quantity. */
  async removeItem(
    playerId: string,
    itemType: string,
    quantity: number,
  ): Promise<boolean> {
    return withTransaction(async (client: PoolClient) => {
      const row = await client.query<InventoryItem>(
        `SELECT * FROM inventory WHERE player_id = $1 AND item_type = $2 FOR UPDATE LIMIT 1`,
        [playerId, itemType],
      );

      const item = row.rows[0];
      if (!item || item.quantity < quantity) return false;

      if (item.quantity === quantity) {
        await client.query('DELETE FROM inventory WHERE id = $1', [item.id]);
      } else {
        await client.query(
          `UPDATE inventory SET quantity = quantity - $1, updated_at = NOW() WHERE id = $2`,
          [quantity, item.id],
        );
      }
      return true;
    });
  }

  async getItem(playerId: string, itemType: string): Promise<InventoryItem | null> {
    return queryOne<InventoryItem>(
      'SELECT * FROM inventory WHERE player_id = $1 AND item_type = $2 LIMIT 1',
      [playerId, itemType],
    );
  }

  /** Save a complete cargo snapshot (used on player disconnect). */
  async saveCargoSnapshot(
    playerId: string,
    cargo: Array<{ itemType: string; quantity: number; metadata?: Record<string, unknown> }>,
  ): Promise<void> {
    await withTransaction(async (client: PoolClient) => {
      await client.query('DELETE FROM inventory WHERE player_id = $1', [playerId]);
      for (const item of cargo) {
        if (item.quantity <= 0) continue;
        await client.query(
          `INSERT INTO inventory (player_id, item_type, quantity, metadata)
           VALUES ($1, $2, $3, $4::jsonb)`,
          [playerId, item.itemType, item.quantity, JSON.stringify(item.metadata ?? {})],
        );
      }
    });
  }
}

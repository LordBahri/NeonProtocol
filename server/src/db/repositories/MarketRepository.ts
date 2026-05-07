import { query, queryOne, withTransaction } from '../connection';
import type { PoolClient } from 'pg';

export interface MarketOrder {
  id: string;
  seller_id: string;
  item_type: string;
  quantity: number;
  qty_filled: number;
  price_per: number;
  sector_id: string;
  station_id: string;
  order_type: 'sell' | 'buy';
  is_active: boolean;
  created_at: Date;
  expires_at: Date;
}

export interface FillResult {
  filled: number;   // quantity actually transacted
  totalCredits: number;
}

export class MarketRepository {
  async getSellOrders(sectorId: string, itemType: string): Promise<MarketOrder[]> {
    return query<MarketOrder>(
      `SELECT * FROM market_orders
       WHERE sector_id = $1 AND item_type = $2 AND order_type = 'sell'
         AND is_active = TRUE AND expires_at > NOW()
       ORDER BY price_per ASC, created_at ASC`,
      [sectorId, itemType],
    );
  }

  async getBuyOrders(sectorId: string, itemType: string): Promise<MarketOrder[]> {
    return query<MarketOrder>(
      `SELECT * FROM market_orders
       WHERE sector_id = $1 AND item_type = $2 AND order_type = 'buy'
         AND is_active = TRUE AND expires_at > NOW()
       ORDER BY price_per DESC, created_at ASC`,
      [sectorId, itemType],
    );
  }

  async getByPlayer(playerId: string): Promise<MarketOrder[]> {
    return query<MarketOrder>(
      'SELECT * FROM market_orders WHERE seller_id = $1 ORDER BY created_at DESC',
      [playerId],
    );
  }

  async placeOrder(
    sellerId: string,
    itemType: string,
    quantity: number,
    pricePer: number,
    sectorId: string,
    stationId: string,
    orderType: 'sell' | 'buy',
  ): Promise<MarketOrder> {
    const row = await queryOne<MarketOrder>(
      `INSERT INTO market_orders
         (seller_id, item_type, quantity, price_per, sector_id, station_id, order_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [sellerId, itemType, quantity, pricePer, sectorId, stationId, orderType],
    );
    return row!;
  }

  async cancelOrder(orderId: string, playerId: string): Promise<boolean> {
    const result = await withTransaction(async (client: PoolClient) => {
      const row = await client.query<MarketOrder>(
        'SELECT * FROM market_orders WHERE id = $1 FOR UPDATE',
        [orderId],
      );
      const order = row.rows[0];
      if (!order || order.seller_id !== playerId || !order.is_active) return false;
      await client.query('UPDATE market_orders SET is_active = FALSE WHERE id = $1', [orderId]);
      return true;
    });
    return result;
  }

  /**
   * Fill a sell order from the book.  Returns the quantity and credits transacted.
   * Caller is responsible for updating player credits and inventory.
   */
  async fillSellOrder(
    orderId: string,
    buyerId: string,
    requestedQty: number,
  ): Promise<FillResult> {
    return withTransaction(async (client: PoolClient) => {
      const row = await client.query<MarketOrder>(
        `SELECT * FROM market_orders WHERE id = $1 AND is_active = TRUE
         AND order_type = 'sell' FOR UPDATE`,
        [orderId],
      );
      const order = row.rows[0];
      if (!order || order.seller_id === buyerId) return { filled: 0, totalCredits: 0 };

      const available = order.quantity - order.qty_filled;
      const fill = Math.min(requestedQty, available);
      if (fill <= 0) return { filled: 0, totalCredits: 0 };

      const newFilled = order.qty_filled + fill;
      if (newFilled >= order.quantity) {
        await client.query(
          'UPDATE market_orders SET qty_filled = $1, is_active = FALSE WHERE id = $2',
          [newFilled, orderId],
        );
      } else {
        await client.query(
          'UPDATE market_orders SET qty_filled = $1 WHERE id = $2',
          [newFilled, orderId],
        );
      }

      return { filled: fill, totalCredits: fill * order.price_per };
    });
  }

  async getBestSellPrice(sectorId: string, itemType: string): Promise<number | null> {
    const row = await queryOne<{ price_per: number }>(
      `SELECT price_per FROM market_orders
       WHERE sector_id = $1 AND item_type = $2 AND order_type = 'sell'
         AND is_active = TRUE AND expires_at > NOW()
       ORDER BY price_per ASC LIMIT 1`,
      [sectorId, itemType],
    );
    return row ? row.price_per : null;
  }

  async pruneExpired(): Promise<number> {
    const rows = await query<{ id: string }>(
      `UPDATE market_orders SET is_active = FALSE
       WHERE is_active = TRUE AND expires_at <= NOW() RETURNING id`,
    );
    return rows.length;
  }
}

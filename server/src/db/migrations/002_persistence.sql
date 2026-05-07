-- NeonProtocol migration 002 — inventory, market, corporations, chat

-- ── Inventory ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id   UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  item_type   TEXT NOT NULL,
  quantity    INTEGER NOT NULL DEFAULT 1,
  slot        INTEGER,
  metadata    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_inventory_player_id ON inventory(player_id);
CREATE INDEX IF NOT EXISTS idx_inventory_item_type ON inventory(player_id, item_type);

-- ── Market Orders ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS market_orders (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id   UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  item_type   TEXT NOT NULL,
  quantity    INTEGER NOT NULL DEFAULT 1,
  qty_filled  INTEGER NOT NULL DEFAULT 0,
  price_per   BIGINT NOT NULL DEFAULT 0,
  sector_id   TEXT NOT NULL DEFAULT 'sector_0_0',
  station_id  TEXT NOT NULL DEFAULT 'station_0',
  order_type  TEXT NOT NULL DEFAULT 'sell', -- 'sell' | 'buy'
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days')
);
CREATE INDEX IF NOT EXISTS idx_market_orders_item    ON market_orders(item_type, sector_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_market_orders_seller  ON market_orders(seller_id);
CREATE INDEX IF NOT EXISTS idx_market_orders_expires ON market_orders(expires_at) WHERE is_active;

-- ── Price History (OHLCV bars) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS price_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type   TEXT NOT NULL,
  sector_id   TEXT NOT NULL,
  open_price  BIGINT NOT NULL,
  high_price  BIGINT NOT NULL,
  low_price   BIGINT NOT NULL,
  close_price BIGINT NOT NULL,
  volume      INTEGER NOT NULL DEFAULT 0,
  bar_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_price_history_item ON price_history(item_type, sector_id, bar_at DESC);

-- ── Corporations ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS corporations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  ticker      TEXT NOT NULL UNIQUE,
  leader_id   UUID NOT NULL REFERENCES players(id),
  description TEXT NOT NULL DEFAULT '',
  credits     BIGINT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS corporation_members (
  corp_id     UUID NOT NULL REFERENCES corporations(id) ON DELETE CASCADE,
  player_id   UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  rank        TEXT NOT NULL DEFAULT 'member', -- 'leader' | 'officer' | 'member'
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (corp_id, player_id)
);
CREATE INDEX IF NOT EXISTS idx_corp_members_player ON corporation_members(player_id);

-- ── Chat Log (moderation / history, not for real-time delivery) ───────────────
CREATE TABLE IF NOT EXISTS chat_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id   UUID REFERENCES players(id),
  channel     TEXT NOT NULL DEFAULT 'local',
  sector_id   TEXT,
  message     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chat_log_sector  ON chat_log(sector_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_log_player  ON chat_log(player_id);

-- ── World State KV (general persistent world state) ──────────────────────────
CREATE TABLE IF NOT EXISTS world_state (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

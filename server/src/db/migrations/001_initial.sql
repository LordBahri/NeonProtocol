-- NeonProtocol initial schema

CREATE TABLE IF NOT EXISTS players (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  TEXT NOT NULL,
  username    TEXT NOT NULL DEFAULT 'Pilot',
  credits     BIGINT NOT NULL DEFAULT 10000,
  kills       INTEGER NOT NULL DEFAULT 0,
  deaths      INTEGER NOT NULL DEFAULT 0,
  play_time   BIGINT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_players_session_id ON players(session_id);

CREATE TABLE IF NOT EXISTS ships (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id     UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  name          TEXT NOT NULL DEFAULT 'Unnamed Ship',
  class         TEXT NOT NULL DEFAULT 'fighter',
  hull          FLOAT NOT NULL DEFAULT 80,
  max_hull      FLOAT NOT NULL DEFAULT 80,
  shield        FLOAT NOT NULL DEFAULT 60,
  max_shield    FLOAT NOT NULL DEFAULT 60,
  is_primary    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ships_player_id ON ships(player_id);

CREATE TABLE IF NOT EXISTS combat_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attacker_id     UUID REFERENCES players(id),
  victim_id       UUID REFERENCES players(id),
  damage          FLOAT NOT NULL,
  weapon_type     TEXT NOT NULL,
  sector_id       TEXT NOT NULL,
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_combat_log_attacker ON combat_log(attacker_id);
CREATE INDEX IF NOT EXISTS idx_combat_log_victim ON combat_log(victim_id);
CREATE INDEX IF NOT EXISTS idx_combat_log_occurred ON combat_log(occurred_at DESC);

CREATE TABLE IF NOT EXISTS leaderboard (
  player_id   UUID PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  kills       INTEGER NOT NULL DEFAULT 0,
  deaths      INTEGER NOT NULL DEFAULT 0,
  kd_ratio    FLOAT GENERATED ALWAYS AS (
    CASE WHEN deaths = 0 THEN kills::float ELSE kills::float / deaths::float END
  ) STORED,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

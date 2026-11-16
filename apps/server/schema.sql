-- TikTap 后端本地库（node:sqlite，单文件）
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 用户：地址与私钥都由后端生成并托管
CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT UNIQUE NOT NULL,
  address    TEXT UNIQUE NOT NULL,
  enc_pkey   TEXT NOT NULL,           -- AES-256-GCM，仅后端可解
  creator    TEXT,                    -- 注册来源，演示期可空
  created_at INTEGER NOT NULL
);

-- 所有链上写操作都以这里的 tx_hash 为准，唯一键保证幂等
CREATE TABLE IF NOT EXISTS txs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER REFERENCES users(id),
  kind         TEXT NOT NULL,         -- addUser | approve | mint | bet | claim | settle
  tx_hash      TEXT UNIQUE NOT NULL,
  status       TEXT NOT NULL,         -- pending | confirmed | failed
  payload      TEXT,                  -- JSON：下注的 round/side/amount 等
  error        TEXT,
  created_at   INTEGER NOT NULL,
  confirmed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_txs_status ON txs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_txs_user ON txs(user_id, created_at);

-- 池子聚合；金额用 TEXT 存最小单位的十进制整数，避免 JS 精度问题
CREATE TABLE IF NOT EXISTS pools (
  market_id    TEXT NOT NULL,
  round_id     INTEGER NOT NULL,
  side         INTEGER NOT NULL,      -- 0 = 涨, 1 = 跌
  amount       TEXT NOT NULL,
  participants INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (market_id, round_id, side)
);

-- 市场 = 标的 × 下注代币（类似交易对），market_id 是链上 PoolMarket 的索引
CREATE TABLE IF NOT EXISTS markets (
  market_id     INTEGER PRIMARY KEY,
  symbol        TEXT NOT NULL DEFAULT '',
  bet_token     TEXT NOT NULL DEFAULT '',
  token_address TEXT,
  enabled       INTEGER NOT NULL DEFAULT 1,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  UNIQUE (symbol, bet_token)
);
-- 每轮结算结果
CREATE TABLE IF NOT EXISTS rounds (
  market_id    TEXT NOT NULL,
  round_id     INTEGER NOT NULL,
  settle_price TEXT,
  winner_side  INTEGER,
  total        TEXT,
  settled_at   INTEGER,
  PRIMARY KEY (market_id, round_id)
);

-- 快捷金额（原本存在浏览器 localStorage，现在由后端保存）
CREATE TABLE IF NOT EXISTS quick_amounts (
  symbol     TEXT PRIMARY KEY,
  amounts    TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

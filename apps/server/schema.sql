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
  x_user_id  TEXT,                    -- X（Twitter）数字 id，登录时写入，改 handle 不影响
  x_handle   TEXT,                    -- X 用户名（@ 后面的部分，会变，登录时刷新）
  x_name     TEXT                     -- X 昵称（显示名，会变，登录时刷新）
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
-- 每轮的锁定价格 / 开奖价格（来源 OKX 1m K 线，按链上块时间对齐）
CREATE TABLE IF NOT EXISTS round_prices (
  symbol       TEXT NOT NULL,        -- 标的，如 BTC
  round_id     INTEGER NOT NULL,     -- 合约 roundIndex
  start_block  INTEGER,              -- 轮首块
  lock_time    INTEGER,              -- 锁定价格对应的 K 线时间（秒）
  lock_price   TEXT,                 -- 锁定价格 = 轮次开始那一分钟收盘价
  settle_time  INTEGER,              -- 开奖价格对应的 K 线时间（秒）
  settle_price TEXT,                 -- 开奖价格 = 轮次结束那一分钟收盘价
  source       TEXT NOT NULL DEFAULT 'okx-1m',
  updated_at   INTEGER,
  PRIMARY KEY (symbol, round_id)
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

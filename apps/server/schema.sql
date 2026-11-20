-- TikTap 后端本地库（node:sqlite，单文件，多环境共用）
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- 运行环境：dev = 本地 Anvil，testnet = X Layer 测试网，mainnet = 主网
-- 业务表带 env 隔离数据；users 是全局身份，不按环境拆账号。

CREATE TABLE IF NOT EXISTS meta (
  env   TEXT NOT NULL DEFAULT 'dev',
  key   TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (env, key)
);

-- 用户：全局唯一身份，地址与私钥都由后端生成并托管
CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT NOT NULL,
  address    TEXT NOT NULL,
  enc_pkey   TEXT NOT NULL,           -- AES-256-GCM，仅后端可解
  x_user_id  TEXT,                    -- X（Twitter）数字 id，登录时写入，改 handle 不影响
  x_handle   TEXT,                    -- X 用户名（@ 后面的部分，会变，登录时刷新）
  x_name     TEXT,                    -- X 昵称（显示名，会变，登录时刷新）
  creator    TEXT,                    -- 注册来源，演示期可空
  created_at INTEGER NOT NULL,
  UNIQUE (email),
  UNIQUE (address)
);

-- 所有链上写操作都以这里的 tx_hash 为准，唯一键保证幂等
CREATE TABLE IF NOT EXISTS txs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  env          TEXT NOT NULL DEFAULT 'dev',
  user_id      INTEGER REFERENCES users(id),
  kind         TEXT NOT NULL,         -- addUser | approve | mint | bet | claim | settle
  tx_hash      TEXT UNIQUE NOT NULL,
  status       TEXT NOT NULL,         -- pending | confirmed | failed
  payload      TEXT,                  -- JSON：下注的 round/side/amount 等
  error        TEXT,
  created_at   INTEGER NOT NULL,
  confirmed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_txs_env_status ON txs(env, status, created_at);
CREATE INDEX IF NOT EXISTS idx_txs_env_user ON txs(env, user_id, created_at);

-- 池子聚合；金额用 TEXT 存最小单位的十进制整数，避免 JS 精度问题
CREATE TABLE IF NOT EXISTS pools (
  env          TEXT NOT NULL DEFAULT 'dev',
  market_id    TEXT NOT NULL,
  round_id     INTEGER NOT NULL,
  side         INTEGER NOT NULL,      -- 0 = 涨, 1 = 跌
  amount       TEXT NOT NULL,
  participants INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (env, market_id, round_id, side)
);

-- 市场 = 标的 × 下注代币（类似交易对），market_id 是链上 PoolMarket 的索引
CREATE TABLE IF NOT EXISTS markets (
  env           TEXT NOT NULL DEFAULT 'dev',
  market_id     INTEGER NOT NULL,
  symbol        TEXT NOT NULL DEFAULT '',
  bet_token     TEXT NOT NULL DEFAULT '',
  token_address TEXT,
  enabled       INTEGER NOT NULL DEFAULT 1,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (env, market_id),
  UNIQUE (env, symbol, bet_token)
);

-- 用户下注记录：下单写入，结算回填结果/价格/应得派奖，领奖回填领取时间
CREATE TABLE IF NOT EXISTS bets (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  env           TEXT NOT NULL DEFAULT 'dev',
  user_id       INTEGER REFERENCES users(id),
  address       TEXT NOT NULL,        -- 冗余存一份，按地址查更快
  market_id     INTEGER NOT NULL,
  symbol        TEXT NOT NULL,
  bet_token     TEXT NOT NULL,
  round_id      INTEGER NOT NULL,     -- 合约 roundIndex
  side          INTEGER NOT NULL,     -- 0 = 涨, 1 = 跌
  amount_wei    TEXT NOT NULL,        -- 用户实际支付的总额（含手续费）
  fee_wei       TEXT,                 -- 下注手续费（最小单位）；仓位 = amount_wei - fee_wei
  tx_hash       TEXT UNIQUE NOT NULL,
  status        TEXT NOT NULL,        -- confirmed | failed
  winner_side   INTEGER,              -- 结算结果，0/1
  lock_price    TEXT,                 -- 锁定价格（轮首价）
  settle_price  TEXT,                 -- 开奖价格（轮末价）
  payout_wei    TEXT,                 -- 应得派奖（按赢方比例算），输了是 0
  claimed_at    INTEGER,
  claim_tx_hash TEXT,
  created_at    INTEGER NOT NULL,
  settled_at    INTEGER
);

CREATE INDEX IF NOT EXISTS idx_bets_env_user ON bets(env, user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_bets_env_address ON bets(env, address, created_at);
CREATE INDEX IF NOT EXISTS idx_bets_env_round ON bets(env, market_id, round_id);

-- 每轮的锁定价格 / 开奖价格（来源 OKX 1m K 线，按链上块时间对齐）
CREATE TABLE IF NOT EXISTS round_prices (
  env          TEXT NOT NULL DEFAULT 'dev',
  symbol       TEXT NOT NULL,        -- 标的，如 BTC
  round_id     INTEGER NOT NULL,     -- 合约 roundIndex
  start_block  INTEGER,              -- 轮首块
  lock_time    INTEGER,              -- 锁定价格对应的 K 线时间（秒）
  lock_price   TEXT,                 -- 锁定价格 = 轮次开始那一分钟收盘价
  settle_time  INTEGER,              -- 开奖价格对应的 K 线时间（秒）
  settle_price TEXT,                 -- 开奖价格 = 轮次结束那一分钟收盘价
  source       TEXT NOT NULL DEFAULT 'okx-1m',
  updated_at   INTEGER,
  PRIMARY KEY (env, symbol, round_id)
);

-- 每轮结算结果
CREATE TABLE IF NOT EXISTS rounds (
  env          TEXT NOT NULL DEFAULT 'dev',
  market_id    TEXT NOT NULL,
  round_id     INTEGER NOT NULL,
  settle_price TEXT,
  winner_side  INTEGER,
  total        TEXT,
  settled_at   INTEGER,
  PRIMARY KEY (env, market_id, round_id)
);

-- 快捷金额（原本存在浏览器 localStorage，现在由后端保存）
CREATE TABLE IF NOT EXISTS quick_amounts (
  env        TEXT NOT NULL DEFAULT 'dev',
  symbol     TEXT NOT NULL,
  amounts    TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (env, symbol)
);

-- 市场级观点；发布时记录当时所在轮次，前端可筛「仅看本轮」
CREATE TABLE IF NOT EXISTS opinions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  env            TEXT NOT NULL DEFAULT 'dev',
  user_id        INTEGER REFERENCES users(id),
  address        TEXT NOT NULL,
  market_id      INTEGER NOT NULL,
  symbol         TEXT NOT NULL,
  bet_token      TEXT NOT NULL,
  round_id       INTEGER,
  -- 发布那一刻的仓位快照（之后不可变）：总额（wei）+ 方向 + 笔数
  bet_amount_wei TEXT,
  bet_side       INTEGER,
  bet_count      INTEGER,
  body           TEXT NOT NULL,
  side           INTEGER,
  created_at     INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_opinions_env_market ON opinions(env, market_id, created_at);

-- 关注关系：身份是全局的，不按 env 拆分
CREATE TABLE IF NOT EXISTS follows (
  follower_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   INTEGER NOT NULL,
  PRIMARY KEY (follower_id, following_id)
);

CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);

-- 自选市场：按账号存库，跨环境共用（symbol 全局一致）
CREATE TABLE IF NOT EXISTS watchlist (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol     TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, symbol)
);

CREATE INDEX IF NOT EXISTS idx_watchlist_user ON watchlist(user_id, created_at);

-- 登录会话：建号/登录成功后签发的 Bearer token（只存哈希，泄露库也拿不到明文）
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  address    TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);


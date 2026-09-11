-- ============================================================
-- 茶芽芽商城 数据库结构
-- 对应项目书 3.3.1「数据库设计」：
--   主数据库 MySQL 存储用户信息、订单数据、产品信息，并标记订单来源平台
--   缓存数据库 Redis 加速高频访问数据（促销活动、用户会话）
--   非结构化数据 MongoDB 存储互动日志（本项目以 events 表承载互动日志）
-- 本项目默认使用 node:sqlite 内置驱动，改环境变量即可切到 MySQL
-- ============================================================

CREATE TABLE IF NOT EXISTS sys_config (
  k          TEXT PRIMARY KEY,
  v          TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- ---------- 会员等级（项目书 3.2.1 新芽-成长-守护） ----------
CREATE TABLE IF NOT EXISTS member_tiers (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  code              TEXT NOT NULL UNIQUE,
  name              TEXT NOT NULL,
  min_amount        INTEGER NOT NULL,   -- 累计消费门槛（分）
  discount          INTEGER NOT NULL,   -- 折扣，100 表示不打折
  benefits_json     TEXT NOT NULL,
  sort_order        INTEGER NOT NULL DEFAULT 0
);

-- ---------- 用户（支持微信一键登录 / 手机号登录） ----------
CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  openid      TEXT UNIQUE,
  phone       TEXT UNIQUE,
  nickname    TEXT NOT NULL DEFAULT '浒口新朋友',
  avatar      TEXT,
  baby_birth  TEXT,                      -- 宝宝出生日期，支撑分月龄抚触建议
  tier_code   TEXT NOT NULL DEFAULT 'xinYa',
  total_paid  INTEGER NOT NULL DEFAULT 0, -- 累计实付（分），用于自动升级
  points      INTEGER NOT NULL DEFAULT 0,
  role        TEXT NOT NULL DEFAULT 'customer',
  password_hash TEXT,
  created_at  TEXT NOT NULL
);

-- ---------- 收货地址 ----------
CREATE TABLE IF NOT EXISTS addresses (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  receiver   TEXT NOT NULL,
  phone      TEXT NOT NULL,
  province   TEXT NOT NULL,
  city       TEXT NOT NULL,
  district   TEXT NOT NULL,
  detail     TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0
);

-- ---------- 商品（来源平台标记：自营 / 京东 / 淘宝…，对应项目书统一业务中台） ----------
CREATE TABLE IF NOT EXISTS products (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  code          TEXT NOT NULL UNIQUE,
  title         TEXT NOT NULL,
  subtitle      TEXT,
  category      TEXT NOT NULL,           -- 抚触油 / 洗护 / 礼盒
  spec          TEXT NOT NULL,           -- 30ml / 100ml
  price         INTEGER NOT NULL,        -- 现价（分）
  list_price    INTEGER NOT NULL,        -- 划线价（分）
  stock         INTEGER NOT NULL DEFAULT 0,
  sales         INTEGER NOT NULL DEFAULT 0,
  source_platform TEXT NOT NULL DEFAULT 'self',
  dose_ml       REAL,                    -- 泵头单次出油量
  volume_ml     INTEGER,
  selling_points_json TEXT NOT NULL,
  detail_json   TEXT NOT NULL,           -- 富详情：成分/参数/质检/对比
  image         TEXT,
  gallery_json  TEXT,
  tags_json     TEXT,
  status        TEXT NOT NULL DEFAULT 'on',
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);

-- ---------- 购物车 ----------
CREATE TABLE IF NOT EXISTS cart_items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  qty        INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  UNIQUE (user_id, product_id)
);

-- ---------- 优惠券（会员月度券 / 线下引流券） ----------
CREATE TABLE IF NOT EXISTS coupons (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  code       TEXT NOT NULL UNIQUE,
  title      TEXT NOT NULL,
  amount     INTEGER NOT NULL,           -- 面额（分）
  min_amount INTEGER NOT NULL DEFAULT 0,
  source     TEXT NOT NULL,              -- tier_month / offline / newuser
  expires_at TEXT
);

CREATE TABLE IF NOT EXISTS user_coupons (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id   INTEGER NOT NULL,
  coupon_id INTEGER NOT NULL,
  status    TEXT NOT NULL DEFAULT 'unused', -- unused / used / expired
  used_at   TEXT,
  UNIQUE (user_id, coupon_id)
);

-- ---------- 订单 ----------
CREATE TABLE IF NOT EXISTS orders (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no       TEXT NOT NULL UNIQUE,
  user_id        INTEGER NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending_pay',
  -- pending_pay 待付款 / paid 已付款 / shipped 已发货 / done 已完成 / closed 已关闭 / refunding 售后中
  goods_amount   INTEGER NOT NULL,
  discount_amount INTEGER NOT NULL DEFAULT 0,
  freight        INTEGER NOT NULL DEFAULT 0,
  pay_amount     INTEGER NOT NULL,
  coupon_id      INTEGER,
  address_json   TEXT NOT NULL,
  source_platform TEXT NOT NULL DEFAULT 'self',
  pay_channel    TEXT,
  paid_at        TEXT,
  shipped_at     TEXT,
  finished_at    TEXT,
  logistics_json TEXT,                   -- 物流轨迹
  remark         TEXT,
  created_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS order_items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id   INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  title      TEXT NOT NULL,
  spec       TEXT NOT NULL,
  price      INTEGER NOT NULL,
  qty        INTEGER NOT NULL,
  image      TEXT,
  trace_codes_json TEXT                  -- 本单分配的一物一码，发货后可在订单里扫码溯源
);

-- ---------- 库存流水（实时库存同步 / 秒杀强一致） ----------
CREATE TABLE IF NOT EXISTS stock_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  delta      INTEGER NOT NULL,
  reason     TEXT NOT NULL,
  order_no   TEXT,
  created_at TEXT NOT NULL
);

-- ---------- 一物一码溯源体系（项目书 3.3.2 / 4.2.2） ----------
CREATE TABLE IF NOT EXISTS batches (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_no       TEXT NOT NULL UNIQUE,
  product_code   TEXT NOT NULL,
  origin         TEXT NOT NULL,          -- 湖南省郴州市浒口村
  plot_no        TEXT,                   -- 油茶林地块编号
  farmer         TEXT,                   -- 农户姓名
  harvest_date   TEXT,
  press_date     TEXT,
  press_workshop TEXT,
  press_tech     TEXT,
  fill_date      TEXT,
  factory        TEXT,
  inspection_no  TEXT,
  inspection_report TEXT,                -- 质检报告链接
  geo            TEXT,                   -- 经纬度
  created_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trace_units (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  trace_code TEXT NOT NULL UNIQUE,       -- 一物一码
  batch_no   TEXT NOT NULL,
  product_id INTEGER,
  sign       TEXT NOT NULL,              -- 椭圆曲线签名（ECDSA）
  chain_hash TEXT NOT NULL,              -- 链上存证哈希
  status     TEXT NOT NULL DEFAULT 'in_stock', -- in_stock / sold / shipped
  order_no   TEXT,
  scan_count INTEGER NOT NULL DEFAULT 0,
  first_scan_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trace_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_no    TEXT NOT NULL,
  stage       TEXT NOT NULL,             -- plant / harvest / press / inspect / fill / logistics
  stage_name  TEXT NOT NULL,
  happened_at TEXT NOT NULL,
  place       TEXT,
  operator    TEXT,
  detail_json TEXT,
  image       TEXT,
  hash        TEXT NOT NULL,             -- 本节点哈希
  prev_hash   TEXT NOT NULL,             -- 前序哈希（哈希链，防篡改）
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scan_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  trace_code TEXT NOT NULL,
  ip         TEXT,
  ua         TEXT,
  result     TEXT,                       -- first 首次查询 / repeat 重复查询 / fake 防伪未通过
  created_at TEXT NOT NULL
);

-- ---------- AI 客服 ----------
CREATE TABLE IF NOT EXISTS conversations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER,
  session_id  TEXT NOT NULL UNIQUE,
  status      TEXT NOT NULL DEFAULT 'ai', -- ai / human / closed
  emotion     TEXT NOT NULL DEFAULT 'neutral',
  intent      TEXT,
  handoff_reason TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT NOT NULL,
  role        TEXT NOT NULL,             -- user / assistant / system / agent
  content     TEXT NOT NULL,
  intent      TEXT,
  emotion     TEXT,
  cards_json  TEXT,                      -- 卡片消息（检测报告缩略图、教程链接、商品卡）
  safety_json TEXT,                      -- 安全分级与红线命中记录
  created_at  TEXT NOT NULL
);

-- 知识库：对应项目书表17「AI智能客服问题系统应答策略表」五大类
CREATE TABLE IF NOT EXISTS kb_entries (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  category   TEXT NOT NULL,              -- origin/safety/efficacy/massage/order
  category_name TEXT NOT NULL,
  question   TEXT NOT NULL,
  answer     TEXT NOT NULL,
  keywords   TEXT NOT NULL,
  cards_json TEXT,
  priority   INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS kb_terms (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  term     TEXT NOT NULL,
  category TEXT NOT NULL,
  weight   REAL NOT NULL DEFAULT 1,
  UNIQUE (term, category)
);

-- ---------- 互动日志（项目书非结构化数据：停留时长、点击热力图、销售漏斗） ----------
CREATE TABLE IF NOT EXISTS events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER,
  session_id TEXT,
  type       TEXT NOT NULL,              -- view / click / cart / pay / scan / chat
  target     TEXT,
  payload_json TEXT,
  created_at TEXT NOT NULL
);

-- ---------- 溯源之旅报名 / 会员权益领取 ----------
CREATE TABLE IF NOT EXISTS bookings (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  activity   TEXT NOT NULL,
  city       TEXT,
  contact    TEXT,
  status     TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_cart_user ON cart_items(user_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_trace_events_batch ON trace_events(batch_no);

/**
 * 数据库驱动抽象层
 *
 * 项目书 3.3.1「数据库设计」要求 MySQL 主库 + Redis 缓存；为了让项目在没有
 * 安装 MySQL 的机器上（学校机房、评审笔记本）也能直接演示，这里做了双驱动：
 *
 *   DB_DRIVER=sqlite（默认）→ Node.js 内置 node:sqlite，零安装
 *   DB_DRIVER=mysql         → 通过 mysql2 连接 MySQL 8（阿里云 ECS 部署形态）
 *
 * 约定：业务 SQL 统一使用 `?` 位置占位符并按数组传参。
 *  - MySQL 驱动直接把数组交给 mysql2；
 *  - SQLite 驱动在编译期把 `?` 依次替换为 :p1 :p2 …（跳过字符串字面量内的 ?）。
 * 业务代码只用 query / get / run / txBegin / txCommit / txRollback，不关心底层驱动。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '../config.mjs';
import { toMySqlDdl } from './mysql-ddl.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let impl = null;
let configuredDriver = 'sqlite';

/** 把 `?` 占位符转成 sqlite 命名参数，跳过单引号字符串内的问号 */
function toNamedParams(sql) {
  let out = '';
  let inStr = false;
  let n = 0;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "'") {
      inStr = !inStr;
      out += ch;
      continue;
    }
    if (ch === '?' && !inStr) {
      n += 1;
      out += `:p${n}`;
      continue;
    }
    out += ch;
  }
  return out;
}

const paramObject = (params) => {
  const o = {};
  (params ?? []).forEach((v, i) => { o[`p${i + 1}`] = v === undefined ? null : v; });
  return o;
};

/* ============================================================
 * SQLite 驱动（node:sqlite，Node >= 22.5）
 * ============================================================ */
async function createSqlite() {
  const { DatabaseSync } = await import('node:sqlite');
  fs.mkdirSync(path.dirname(config.db.sqliteFile), { recursive: true });
  const raw = new DatabaseSync(config.db.sqliteFile);
  raw.exec('PRAGMA journal_mode = WAL;');
  raw.exec('PRAGMA foreign_keys = ON;');
  raw.exec('PRAGMA busy_timeout = 5000;');

  const cache = new Map();
  const stmt = (sql) => {
    const key = sql.trim().replace(/;\s*$/, '');
    if (!cache.has(key)) cache.set(key, raw.prepare(key));
    return cache.get(key);
  };
  const asObject = (row) => (row ? { ...row } : undefined);

  return {
    dialect: 'sqlite',
    sync: true,
    query(sql, params = []) {
      return stmt(toNamedParams(sql)).all(paramObject(params)).map(asObject);
    },
    get(sql, params = []) {
      return asObject(stmt(toNamedParams(sql)).get(paramObject(params)));
    },
    run(sql, params = []) {
      const info = stmt(toNamedParams(sql)).run(paramObject(params));
      return { changes: Number(info.changes ?? 0), lastInsertId: Number(info.lastInsertRowid ?? 0) };
    },
    exec(sql) { raw.exec(sql); },
    txBegin() { raw.exec('BEGIN'); },
    txCommit() { raw.exec('COMMIT'); },
    txRollback() { try { raw.exec('ROLLBACK'); } catch { /* 事务已结束 */ } },
    raw,
  };
}

/* ============================================================
 * MySQL 驱动（mysql2/promise）—— 部署到阿里云 ECS 时使用
 * ============================================================ */
async function createMysql() {
  const { createPool } = await import('mysql2/promise');
  const pool = createPool({
    host: config.db.mysql.host,
    port: config.db.mysql.port,
    user: config.db.mysql.user,
    password: config.db.mysql.password,
    database: config.db.mysql.database,
    connectionLimit: config.db.mysql.connectionLimit,
    dateStrings: true,
    charset: 'utf8mb4_general_ci',
    multipleStatements: true,
  });

  const clean = (sql) => sql.trim().replace(/;\s*$/, '');

  return {
    dialect: 'mysql',
    sync: false,
    async query(sql, params = []) {
      const [rows] = await pool.query(clean(sql), params);
      return rows;
    },
    async get(sql, params = []) {
      const [rows] = await pool.query(clean(sql), params);
      return rows[0];
    },
    async run(sql, params = []) {
      const [res] = await pool.query(clean(sql), params);
      return { changes: Number(res.affectedRows ?? 0), lastInsertId: Number(res.insertId ?? 0) };
    },
    async exec(sql) { await pool.query(sql); },
    async txBegin() { await pool.query('START TRANSACTION'); },
    async txCommit() { await pool.query('COMMIT'); },
    async txRollback() { try { await pool.query('ROLLBACK'); } catch { /* 事务已结束 */ } },
    raw: pool,
  };
}

/* ============================================================
 * 统一入口
 * ============================================================ */
export async function initDb() {
  configuredDriver = (config.db.driver === 'mysql' ? 'mysql' : 'sqlite');
  impl = configuredDriver === 'mysql' ? await createMysql() : await createSqlite();
  return impl;
}

export function db() {
  if (!impl) throw new Error('数据库尚未初始化，请先调用 initDb()');
  return impl;
}

export const dialect = () => impl?.dialect ?? configuredDriver;

/** 执行建表语句 */
export async function migrate() {
  const conn = db();
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  if (conn.dialect === 'mysql') await conn.exec(toMySqlDdl(sql));
  else conn.exec(sql);
}

/** 清空所有业务表（仅用于重置演示数据） */
export async function truncateAll() {
  const conn = db();
  const tables = [
    'events', 'messages', 'conversations', 'scan_logs', 'trace_events', 'trace_units', 'batches',
    'stock_logs', 'order_items', 'orders', 'user_coupons', 'coupons', 'cart_items', 'addresses',
    'products', 'users', 'member_tiers', 'kb_terms', 'kb_entries', 'bookings', 'sys_config',
  ];
  for (const t of tables) {
    if (conn.dialect === 'mysql') await conn.run(`DELETE FROM ${t}`);
    else conn.run(`DELETE FROM ${t}`);
  }
}

export const query = (...a) => db().query(...a);
export const get = (...a) => db().get(...a);
export const run = (...a) => db().run(...a);
export const exec = (...a) => db().exec(...a);

/**
 * 事务：为了同时兼容同步（SQLite）与异步（MySQL）驱动，
 * 业务侧统一写成 await withTransaction(async () => { ... })
 */
export async function withTransaction(fn) {
  const conn = db();
  await conn.txBegin();
  try {
    const result = await fn(conn);
    await conn.txCommit();
    return result;
  } catch (e) {
    await conn.txRollback();
    throw e;
  }
}

export default { initDb, db, migrate, truncateAll, query, get, run, exec, withTransaction, dialect };

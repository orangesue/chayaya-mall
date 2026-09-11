/**
 * 缓存抽象层
 * 项目书 3.3.1：Redis 加速高频访问数据，如促销活动、用户会话等。
 *   CACHE_DRIVER=memory（默认）→ 进程内 LRU + TTL 实现，零安装即可演示
 *   CACHE_DRIVER=redis         → 连接真实 Redis（redis 包），接口完全一致
 * 除简单 KV 外，还提供分布式锁 lock()，对应项目书"秒杀、大促期间订单库存强一致性"的要求。
 */
import config from '../config.mjs';

/* ---------------- 内存实现 ---------------- */
function createMemoryCache() {
  const store = new Map();
  const now = () => Date.now();
  const alive = (entry) => entry && (entry.expire === 0 || entry.expire > now());

  const purge = () => {
    for (const [k, v] of store) if (!alive(v)) store.delete(k);
  };

  return {
    driver: 'memory',
    async get(key) {
      const e = store.get(key);
      if (!alive(e)) { store.delete(key); return null; }
      return e.value;
    },
    async set(key, value, ttlSeconds = config.cache.defaultTtl) {
      store.set(key, { value, expire: ttlSeconds > 0 ? now() + ttlSeconds * 1000 : 0 });
      if (store.size > 5000) purge();
      return true;
    },
    async del(...keys) {
      keys.flat().forEach((k) => store.delete(k));
      return true;
    },
    async incr(key, ttlSeconds = 0) {
      const cur = Number((await this.get(key)) ?? 0) + 1;
      const e = store.get(key);
      const expire = e && alive(e) && e.expire ? e.expire : (ttlSeconds > 0 ? now() + ttlSeconds * 1000 : 0);
      store.set(key, { value: cur, expire });
      return cur;
    },
    async exists(key) { return alive(store.get(key)); },
    async keys(prefix = '') { purge(); return [...store.keys()].filter((k) => k.startsWith(prefix)); },
    async lock(key, ttlSeconds = 5) {
      const token = `${process.pid}-${now()}-${Math.random().toString(16).slice(2)}`;
      const ok = await this.set(`lock:${key}`, token, ttlSeconds);
      if (!ok) return null;
      return async () => {
        const cur = await this.get(`lock:${key}`);
        if (cur === token) await this.del(`lock:${key}`);
      };
    },
  };
}

/* ---------------- Redis 实现 ---------------- */
async function createRedisCache() {
  const { createClient } = await import('redis');
  const client = createClient({ url: config.cache.redisUrl });
  client.on('error', (e) => console.error('[cache:redis] 连接异常:', e.message));
  await client.connect();

  const encode = (v) => JSON.stringify(v ?? null);
  const decode = (s) => (s === null || s === undefined ? null : JSON.parse(s));

  return {
    driver: 'redis',
    async get(key) { return decode(await client.get(key)); },
    async set(key, value, ttlSeconds = config.cache.defaultTtl) {
      if (ttlSeconds > 0) await client.set(key, encode(value), { EX: ttlSeconds });
      else await client.set(key, encode(value));
      return true;
    },
    async del(...keys) {
      const flat = keys.flat();
      if (flat.length) await client.del(flat);
      return true;
    },
    async incr(key, ttlSeconds = 0) {
      const n = await client.incr(key);
      if (n === 1 && ttlSeconds > 0) await client.expire(key, ttlSeconds);
      return n;
    },
    async exists(key) { return (await client.exists(key)) === 1; },
    async keys(prefix = '') { return client.keys(`${prefix}*`); },
    async lock(key, ttlSeconds = 5) {
      const token = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const ok = await client.set(`lock:${key}`, token, { NX: true, EX: ttlSeconds });
      if (!ok) return null;
      return async () => {
        if ((await client.get(`lock:${key}`)) === token) await client.del(`lock:${key}`);
      };
    },
    raw: client,
  };
}

let cache = null;

export async function initCache() {
  if (config.cache.driver === 'redis') {
    try {
      cache = await createRedisCache();
    } catch (e) {
      console.warn(`[cache] Redis 连接失败（${e.message}），自动降级为内存缓存`);
      cache = createMemoryCache();
    }
  } else {
    cache = createMemoryCache();
  }
  return cache;
}

export function getCache() {
  if (!cache) cache = createMemoryCache();
  return cache;
}

/** 常用封装：读缓存 → 未命中则执行 loader 并回填 */
export async function remember(key, ttlSeconds, loader) {
  const c = getCache();
  const hit = await c.get(key);
  if (hit !== null && hit !== undefined) return hit;
  const value = await loader();
  await c.set(key, value, ttlSeconds);
  return value;
}

/** 业务缓存键前缀统一管理，便于运维按前缀清理 */
export const cacheKeys = {
  productList: () => 'shop:products',
  productDetail: (code) => `shop:product:${code}`,
  batch: (batchNo) => `trace:batch:${batchNo}`,
  kb: () => 'ai:kb',
  hotQuestions: () => 'ai:hot-questions',
  stock: (productId) => `stock:product:${productId}`,
};

export default { initCache, getCache, remember, cacheKeys };

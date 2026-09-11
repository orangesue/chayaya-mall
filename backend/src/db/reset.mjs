/**
 * 重置数据库：清空并重新写入演示数据
 * 用法: npm run reset
 */
import { initDb } from './index.mjs';
import { initCache, getCache } from './cache.mjs';
import { seedAll } from './seed.mjs';
import config from '../config.mjs';

await initDb();
await initCache();
const cache = getCache();
if (cache.driver === 'memory') await cache.del(...(await cache.keys('')));

console.log(`驱动: ${config.db.driver}  缓存: ${cache.driver}`);
const stat = await seedAll();
console.log('\n✔ 演示数据已重建');
console.log(`  商品 ${stat.products} 个 / 溯源批次 ${stat.batches} 个 / 一物一码 ${stat.units} 个 / 知识库 ${stat.kb} 条`);
console.log(`  SQLite 文件: ${config.db.sqliteFile}`);
process.exit(0);
